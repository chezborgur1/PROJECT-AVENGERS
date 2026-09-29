// One request in, a folder of materials out:
//   <output>/<request_id> <code name>/
//     <Code Name> - Financial Model v01.xlsx   guide 5 workbook, verified against the engine
//     <Code Name> - CIM.pptx                   guide 3 and design-spec deck
//     <Code Name> - CIM.pdf                    LibreOffice render (when soffice is installed)
//     <Code Name> - CIM pages/page-NN.png      page images (when PyMuPDF is installed)
//     open-questions.md    what the advisor must confirm before anything goes out
//     run-summary.md       sources, headline numbers, checks, CIM sections built and left out

import fs from "node:fs";
import path from "node:path";
import { monthLabel, type FinancialDataset } from "./domain/financials.ts";
import type { RequestRow } from "./requests/schema.ts";
import { gatherIntake, type IntakeBundle } from "./ingest/index.ts";
import { describeSources } from "./ingest/merge.ts";
import { defaultAssumptions } from "./model/assumptions.ts";
import { runModel } from "./model/engine.ts";
import { dataAgeDays, latestColumn, MODE_LABELS, STALE_DAYS, type ModelOutput, type PeriodColumn } from "./model/types.ts";
import { writeWorkbook, type WorkbookPlan } from "./model/workbook.ts";
import { verifyWorkbook, type VerifyResult } from "./model/verifyWorkbook.ts";
import { withRenderCheck } from "./model/checks.ts";
import { printedTabsOf, renderCheckWorkbook, type RenderCheckResult } from "./model/renderCheck.ts";
import { draftCimCopy, type DraftResult } from "./cim/narrative.ts";
import { buildCim, type CimBuildResult } from "./cim/deck.ts";
import { fmtDollars, fmtPct } from "./util/format.ts";

export interface PipelineConfig {
  repoRoot: string;
  outputDir: string;
  firm: { name: string; contact: string; email: string; phone: string };
  now?: Date;
  log?: (msg: string) => void;
  /** Run the C37 render check on the written workbook (default true); it needs LibreOffice and PyMuPDF and says so when they are missing. */
  renderCheck?: boolean;
}

export interface PipelineResult {
  folder: string;
  workbook: string;
  deck: string;
  /** Absent when LibreOffice is not installed; run-summary.md says why. */
  pdf?: string;
  pngs: string[];
  verification: VerifyResult;
  masterCheck: string;
  /** Where the CIM copy came from: Claude, the folder's reviewed fixture, or templated placeholders. */
  copySource: DraftResult["source"];
  pages: number;
  warnings: string[];
  openQuestions: string[];
  /** The PDF and page images were withheld (a chart LibreOffice would not draw); the request is not done. */
  renderError?: string;
}

export class NeedsInfoError extends Error {}

/** The workbook's version, printed on its Contents tab and kept in the file name (guide 5.13). */
const MODEL_VERSION = "v01";

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

/** "1 issue", "3 issues". */
const plural = (n: number, noun: string, many = `${noun}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? noun : many}`;

export async function processRequest(row: RequestRow, cfg: PipelineConfig): Promise<PipelineResult> {
  const log = cfg.log ?? (() => {});
  const now = cfg.now ?? new Date();

  log("  Gathering source data");
  const intake = await gatherIntake(row, cfg.repoRoot, log);
  const ds = intake.dataset;
  if (ds.years.length === 0) {
    throw new NeedsInfoError(
      `No full fiscal year of P&L data could be built. ${ds.warnings.join(" ")} Add a QuickBooks export, tax return or financial statements to ${row.source_folder || "the source folder"}.`,
    );
  }

  log(`  Building model: FY${ds.years[0]}–FY${ds.years[ds.years.length - 1]} actuals${ds.monthly ? ` (${ds.monthly.months.length} months)` : " (annual only)"} + 5 projected years`);
  const assumptions = defaultAssumptions(ds, row);
  let model = runModel(ds, assumptions);

  const folder = path.join(cfg.outputDir, safe(`${row.request_id} ${row.code_name}`));
  fs.mkdirSync(folder, { recursive: true });
  const workbook = path.join(folder, safe(`${row.code_name} - Financial Model ${MODEL_VERSION}.xlsx`));
  const deck = path.join(folder, safe(`${row.code_name} - CIM.pptx`));

  const writeAndVerify = async (m: ModelOutput): Promise<{ plan: WorkbookPlan; verification: VerifyResult }> => {
    const plan = await writeWorkbook({ row, dataset: ds, assumptions, model: m, firmName: cfg.firm.name, preparedOn: now.toISOString().slice(0, 10), version: MODEL_VERSION }, workbook);
    log("  Verifying workbook formulas against the engine");
    const verification = await verifyWorkbook(workbook, m);
    if (!verification.ok) {
      const detail = [
        ...verification.errors.map((e) => `${e.cell} ${e.error}`),
        ...verification.mismatches.map((x) => `${x.cell} ${x.label}: workbook ${String(x.workbook)}, engine ${String(x.engine)}`),
        ...verification.lint.map((l) => `${l.cell} ${l.issue}`),
      ];
      throw new Error(`Workbook failed verification: ${detail.slice(0, 5).join("; ")}`);
    }
    return { plan, verification };
  };
  let { plan, verification } = await writeAndVerify(model);
  // C37 renders the file as written; its result goes back into the Checks tab, so the workbook is written once more with it.
  let render: RenderCheckResult | undefined;
  if (cfg.renderCheck !== false) {
    log("  Render check (C37): LibreOffice render of the workbook, measured page by page");
    render = renderCheckWorkbook(workbook, printedTabsOf(plan.plans, row.business_name));
    const { checks, masterCheck } = withRenderCheck(model.checks, render);
    model = { ...model, checks, masterCheck, namedOutputs: { ...model.namedOutputs, MasterCheck: masterCheck } };
    if (render.status !== "n.a.") ({ plan, verification } = await writeAndVerify(model));
  }

  log("  Drafting CIM copy");
  const draft = await draftCimCopy({ row, notes: intake.notes, dataset: ds, model, firm: cfg.firm, date: now });
  if (draft.fallback) log(`  ${draft.fallback}`);
  // A customer or staff member named in buyer copy is a confidentiality breach, never a warning (guide 1.4).
  const named = draft.lint.filter((l) => /appears in the CIM only by code or role/.test(l.issue));
  if (named.length) throw new Error(`CIM copy ${named[0]!.path} ${named[0]!.issue}; remove the name before building the deck`);
  log(`  Building CIM (copy: ${draft.source}), PDF and page images`);
  const cim = await buildCim({ row, ds, out: model, copy: draft.copy, firm: cfg.firm, date: now }, deck, { pdf: true, png: true });

  fs.writeFileSync(path.join(folder, "open-questions.md"), openQuestionsMd({ row, ds, model, cim, draft, now }));
  fs.writeFileSync(path.join(folder, "run-summary.md"), summaryMd({ row, now, intake, model, plan, verification, draft, cim, workbook, render }));

  return {
    folder,
    workbook,
    deck,
    pdf: cim.pdf,
    pngs: cim.pngs,
    verification,
    masterCheck: model.masterCheck,
    copySource: draft.source,
    pages: cim.plan.pages.length,
    warnings: ds.warnings,
    openQuestions: cim.openQuestions,
    ...(cim.renderError ? { renderError: cim.renderError } : {}),
  };
}

// --- open-questions.md -------------------------------------------------------------------------

function openQuestionsMd(p: { row: RequestRow; ds: FinancialDataset; model: ModelOutput; cim: CimBuildResult; draft: DraftResult; now: Date }): string {
  const { row, ds, model, cim, draft, now } = p;
  const age = dataAgeDays(model.asOfDate, now);
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastFull = monthLabel(`${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`);
  const stale = age > STALE_DAYS ? [`The financials end at ${monthLabel(model.asOfDate.slice(0, 7))}, ${Math.round(age)} days before this run: request the P&L and balance sheet year to date through ${lastFull}, so the model can add YTD and LTM columns (guide 5.2).`] : [];
  const boxes = (items: string[], none: string) => (items.length ? items.map((i) => `- [ ] ${i}`) : [`- ${none}`]);
  const schedule = model.adjustments.map((a) => a.row);

  // Rows the ladder leaves out until an advisor accepts them (guide Q10), then accepted rows a buyer will ask to see documented.
  const toReview = schedule
    .filter((a) => a.status === "proposed" || a.status === "supported")
    .map((a) => `[${a.ref}] ${a.description}, ${a.status}: ${a.basis} ${a.tier === "memo" ? "Memo only: shown on the Adj. EBITDA tab, never added." : "Not in Adj. EBITDA until accepted in adjustments.csv."}`);
  const represented = schedule.filter((a) => a.status === "accepted" && a.evidence === "management_representation");
  if (represented.length) {
    toReview.push(`Accepted on management representation only, and footnoted as such in the CIM: ${represented.map((a) => `[${a.ref}] ${a.description}`).join("; ")}. Supporting documents would let them print as documented.`);
  }
  // An accepted row computed from documented figures (the owner's payroll taxes at statutory rates) still wants its own document.
  const pending = schedule.filter((a) => a.status === "accepted" && a.evidence === "pending");
  if (pending.length) toReview.push(`Accepted with the supporting document still to come: ${pending.map((a) => `[${a.ref}] ${a.description} (${a.sourceDocument})`).join("; ")}.`);

  const omitted = cim.plan.modules.filter((m) => m.state === "omitted").map((m) => `- ${m.id} ${m.name}: ${m.reason ?? "trigger not met"}`);

  const lines = [
    `# ${row.code_name}: open questions before the materials go out`,
    "",
    `The CIM is a draft while anything under "Confirm with the seller" is open: each item prints in the deck as a red [Confirm: …] (guide 4.7).`,
    "",
    ...(cim.renderError ? ["## Rendering failed", `- [ ] ${cim.renderError}`, ""] : []),
    "## Confirm with the seller",
    ...boxes(cim.openQuestions, "None raised by the draft. Still read every page against the source documents."),
    "",
    "## Adjustments to review",
    ...boxes(toReview, "None: every schedule row is accepted or excluded."),
    ...(model.debtLike?.checklist?.length
      ? ["", "## Debt-like items to clear (guide 5.6 standard list)", "Listed as Open on the Debt-Like Items tab: no source shows a balance, which is not the same as none.", ...boxes(model.debtLike.checklist.map((x) => (x.memo ? `${x.item}: confirm any the seller has given (memo only, never deducted).` : `${x.item}: confirm none is outstanding at close.`)), "None.")]
      : []),
    "",
    "## Data issues to resolve",
    ...boxes([...stale, ...ds.warnings], "None."),
  ];
  if (draft.lint.length) {
    lines.push("", "## CIM copy that fails the house-style lint", ...boxes(draft.lint.map((i) => `${i.path}: ${i.issue}${i.text ? ` ("${i.text.slice(0, 120)}")` : ""}`), "None."));
  }
  lines.push(
    "",
    "## Data that would add CIM sections",
    "The CIM leaves a section out rather than print a gap (guide 3.3). Each reason names the trigger that failed; where it is missing data, supplying it brings the section in on the next run.",
    ...(omitted.length ? omitted : ["- None."]),
    "",
    "## Standard review",
    "- [ ] Review the Assumptions tab inputs (blue font): growth, cost drivers, valuation multiples and deal terms are defaults until replaced with the seller's guidance and the comps source",
    "- [ ] Check the Mapping tab for accounts mapped by default, and that every Databook account reads TIES OUT",
    "- [ ] Read the CIM against the intake notes and source documents; every fact must trace to the seller or the financials",
    "",
  );
  return lines.join("\n");
}

// --- run-summary.md ----------------------------------------------------------------------------

const COPY_SOURCES: Record<DraftResult["source"], string> = {
  claude: "drafted by Claude from the intake facts, the notes and the numbers brief",
  fixture: "the source folder's reviewed cim-copy.fixture.json (no API key set)",
  template: "templated, with figures from the model and every qualitative slot a [Confirm: …]; set ANTHROPIC_API_KEY for a full draft",
};

const INTAKE_FACTS: Record<IntakeBundle["intakeFacts"], string> = {
  "intake.json": "intake.json in the source folder",
  claude: "transcribed from the intake notes by Claude (review against the notes)",
  none: "none (no intake.json and no API key), so the CIM's qualitative slots are placeholders",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Historical columns for the headline table: every fiscal year, the LTM when it is not simply the latest fiscal year, and PF. */
function headlineColumns(model: ModelOutput): PeriodColumn[] {
  const fy = model.columns.filter((c) => c.group === "Full Year");
  const last = fy[fy.length - 1];
  const ltm = latestColumn(model);
  const distinctLtm = ltm.group === "LTM" && (ltm.start !== last?.start || ltm.end !== last?.end);
  return [...fy, ...(distinctLtm ? [ltm] : []), ...model.columns.filter((c) => c.group === "PF")];
}

function headlineTable(model: ModelOutput): string[] {
  const cols = headlineColumns(model);
  const at = (c: PeriodColumn) => model.periods[c.key]!;
  const row = (label: string, value: (c: PeriodColumn) => string) => `| ${label} | ${cols.map(value).join(" | ")} |`;
  return [
    `| | ${cols.map((c) => c.label).join(" | ")} |`,
    `|---|${cols.map(() => "---:").join("|")}|`,
    row("Revenue", (c) => fmtDollars(at(c).pnl.revenue)),
    row("Gross profit", (c) => fmtDollars(at(c).pnl.grossProfit)),
    row("Reported EBITDA", (c) => fmtDollars(at(c).ladder.reportedEbitda)),
    // SDE is a Main Street measure; the lower-middle-market ladder never shows it (guide 5.4).
    ...(model.mode.mode === "mainStreet" ? [row("SDE", (c) => fmtDollars(at(c).ladder.sde))] : []),
    row("Adj. EBITDA", (c) => fmtDollars(at(c).ladder.adjEbitda)),
    row("Adj. EBITDA margin", (c) => fmtPct(at(c).ladder.adjMargin)),
    row("PF Adj. EBITDA", (c) => fmtDollars(at(c).ladder.pfAdjEbitda)),
  ];
}

function summaryMd(p: {
  row: RequestRow;
  now: Date;
  intake: IntakeBundle;
  model: ModelOutput;
  plan: WorkbookPlan;
  verification: VerifyResult;
  draft: DraftResult;
  cim: CimBuildResult;
  workbook: string;
  render?: RenderCheckResult;
}): string {
  const { row, intake, model, verification: v, draft, cim } = p;
  const ds = intake.dataset;
  const moduleName = (id: string) => cim.plan.modules.find((m) => m.id === id)?.name ?? id;
  const renderNotes = cim.log.filter((l) => /not written/.test(l));
  const buildNotes = cim.log.filter((l) => !renderNotes.includes(l));
  const reconciliations = ds.reconciliations ?? [];
  const material = reconciliations.filter((r) => r.material);
  const mode = model.mode;
  const dealFormBasis = !ds.dealForm || ds.dealForm.basis === "default_from_mode" ? `default for ${MODE_LABELS[mode.mode]} mode` : ds.dealForm.basis;
  const count = (n: number) => n.toLocaleString("en-US");

  const lines = [
    `# ${row.code_name} (${row.business_name}): run summary`,
    "",
    `Request ${row.request_id}, ${row.priority}. Generated ${p.now.toISOString().replace("T", " ").slice(0, 16)} UTC.`,
    "",
    ...(cim.renderError ? [`Status: not OK. ${cim.renderError}`, ""] : []),
    "## Deliverables",
    `- ${path.basename(p.workbook)}: ${p.plan.plans.length} tabs, ${model.masterCheck}.`,
    `- ${path.basename(cim.pptx)}: ${cim.plan.pages.length} pages, ${cim.openQuestions.length ? `a draft until its ${plural(cim.openQuestions.length, "open question")} ${cim.openQuestions.length === 1 ? "is" : "are"} resolved` : "no open questions"}. Copy: ${COPY_SOURCES[draft.source]}.${draft.fallback ? ` ${draft.fallback}` : ""}`,
    cim.pdf ? `- ${path.basename(cim.pdf)}` : `- No PDF: ${renderNotes.join(" ")}`,
    cim.pngs.length ? `- ${path.basename(path.dirname(cim.pngs[0]!))}/: ${plural(cim.pngs.length, "page image")}` : "- No page images (they are rendered from the PDF).",
    "- open-questions.md",
    "",
    "## Deal profile",
    `- Mode: ${MODE_LABELS[mode.mode]}${mode.overridden ? " (set by the advisor)" : `: PF Adj. EBITDA before the capital reserve is ${fmtDollars(mode.measure)} (${mode.measureLabel}) against the ${fmtDollars(mode.threshold)} threshold (guide Q7)`}.`,
    `- Deal form: ${model.dealForm === "asset_purchase" ? "asset purchase" : "equity purchase"} (${dealFormBasis}).`,
    `- Periods: ${model.granularity === "monthly" ? `monthly books, ${ds.monthly?.months.length ?? 0} months to ${monthLabel(model.asOfDate.slice(0, 7))}` : "annual statements only (guide 5.2A)"}; as of ${model.asOfDate}; fiscal year ends in ${MONTH_NAMES[model.fiscalYearEndMonth - 1]}${ds.booksBasis ? `; ${ds.booksBasis} basis` : ""}.`,
    "",
    "## Headline numbers",
    ...headlineTable(model),
    "",
    "Valuation, deal structure and sensitivities are on the workbook's internal tabs; none of them enters the CIM.",
    "",
    "## Sources",
    ...describeSources(ds).map((s) => `- ${s}`),
    `- Structured intake facts: ${INTAKE_FACTS[intake.intakeFacts]}.`,
    `- Reconciliation between sources: ${plural(reconciliations.length, "line comparison")}, ${material.length} above the 2% threshold${material.length ? ":" : "."}`,
    ...material.map((r) => `  - FY${r.fiscalYear} ${r.line}: ${r.chosen.file} ${fmtDollars(r.chosen.amount)} against ${r.other.file} ${fmtDollars(r.other.amount)} (${fmtPct(r.differencePct)})`),
    "",
    "| File | Used as |",
    "|---|---|",
    ...intake.files.map((f) => `| ${f.file} | ${f.used} |`),
    "",
    "## Model",
    `- Verification: ${plural(v.formulas, "formula")} evaluated independently; ${count(v.compared)} cells and named outputs compared with the engine: ${plural(v.errors.length, "error")}, ${plural(v.mismatches.length, "mismatch", "mismatches")}, ${plural(v.lint.length, "lint finding")}.`,
    `- Render check (C37): ${p.render ? p.render.note : "not run (renderCheck off)"}.`,
    `- Tabs: ${p.plan.plans.map((s) => s.name).join(", ")}.`,
    `- Modules built: ${model.modules.built.join(", ") || "none"}.`,
    ...model.modules.omitted.map((m) => `- Not built: ${m.id} (${m.reason}).`),
    "",
    `### Checks (guide 5.7): ${model.masterCheck}`,
    "",
    "| ID | Check | Tab | Status | Note |",
    "|---|---|---|---|---|",
    ...model.checks.map((c) => {
      const note = [c.status === "CHECK" ? `difference ${c.difference.toLocaleString("en-US", { maximumFractionDigits: 4 })} against a tolerance of ${c.tolerance}` : "", c.note ?? ""].filter(Boolean).join("; ");
      return `| ${c.id} | ${c.check} | ${c.tab} | ${c.status} | ${note} |`;
    }),
    "",
    "## CIM",
    `${cim.plan.pages.length} pages against the ${MODE_LABELS[mode.mode]} target of ${cim.plan.target[0]}–${cim.plan.target[1]}, ${cim.plan.dividers ? "with" : "without"} section dividers (guide 3.4). Copy lint: ${plural(draft.lint.length, "issue")}.`,
    "",
    "### Pages",
    "",
    "| Page | Section | Module | Also carries |",
    "|---:|---|---|---|",
    ...cim.plan.pages.map((pg) => {
      const own = pg.section.pages.find((m) => m.id === pg.draft.id)?.name ?? "Divider";
      return `| ${pg.num} | ${pg.section.name} | ${pg.draft.id} ${own} | ${pg.draft.carries.map((id) => `${id} ${moduleName(id)}`).join("; ")} |`;
    }),
    "",
    "### Left out, and why (guide 3.5)",
    "",
    "| Module | Section | Outcome | Reason |",
    "|---|---|---|---|",
    ...cim.plan.modules.filter((m) => m.state === "omitted" || m.state === "cut").map((m) => `| ${m.id} ${m.name} | ${m.section} | ${m.state} | ${m.reason ?? ""} |`),
  ];
  if (buildNotes.length) lines.push("", "### Build notes (copy fallbacks, trims, column balance)", ...buildNotes.map((n) => `- ${n}`));
  lines.push("", "## Warnings", ...(ds.warnings.length ? ds.warnings.map((w) => `- ${w}`) : ["- None."]), "");
  return lines.join("\n");
}
