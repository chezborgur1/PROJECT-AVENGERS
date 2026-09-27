// One request in, a folder of materials out:
//   <output>/<request_id> <code name>/
//     <Code Name> - Financial Model.xlsx
//     <Code Name> - CIM.pptx
//     open-questions.md    what the advisor must confirm before anything goes out
//     run-summary.md       sources used, key numbers, checks, warnings

import fs from "node:fs";
import path from "node:path";
import type { RequestRow } from "./requests/schema.ts";
import { gatherIntake } from "./ingest/index.ts";
import { describeSources } from "./ingest/merge.ts";
import { defaultAssumptions } from "./model/assumptions.ts";
import { runModel } from "./model/engine.ts";
import { writeWorkbook } from "./model/workbook.ts";
import { verifyWorkbook, type VerifyResult } from "./model/verifyWorkbook.ts";
import { draftCimCopy, placeholders } from "./cim/narrative.ts";
import { buildDeck } from "./cim/deck.ts";
import { fmtMoney, fmtPct } from "./util/format.ts";

export interface PipelineConfig {
  repoRoot: string;
  outputDir: string;
  firm: { name: string; contact: string; email: string; phone: string };
  now?: Date;
  log?: (msg: string) => void;
}

export interface PipelineResult {
  folder: string;
  workbook: string;
  deck: string;
  verification: VerifyResult;
  warnings: string[];
  openQuestions: string[];
  drafted: "claude" | "template";
}

export class NeedsInfoError extends Error {}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

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

  log(`  Building model: FY${ds.years[0]}–FY${ds.years[ds.years.length - 1]} actuals + 5 projected years`);
  const assumptions = defaultAssumptions(ds, row);
  const model = runModel(ds, assumptions);

  const folder = path.join(cfg.outputDir, safe(`${row.request_id} ${row.code_name}`));
  fs.mkdirSync(folder, { recursive: true });
  const workbook = path.join(folder, safe(`${row.code_name} - Financial Model.xlsx`));
  const deck = path.join(folder, safe(`${row.code_name} - CIM.pptx`));

  await writeWorkbook(
    { row, dataset: ds, assumptions, model, firmName: cfg.firm.name, preparedOn: now.toISOString().slice(0, 10) },
    workbook,
  );
  log("  Verifying workbook formulas");
  const verification = await verifyWorkbook(workbook, model);
  if (!verification.ok) {
    const detail = [...verification.errors.map((e) => `${e.cell} ${e.error}`), ...verification.mismatches.map((m) => `${m.cell} ${m.label}`)];
    throw new Error(`Workbook failed verification: ${detail.slice(0, 5).join("; ")}`);
  }

  log("  Drafting CIM copy");
  const { copy, drafted } = await draftCimCopy({ row, notes: intake.notes, dataset: ds, assumptions, model });
  log("  Building CIM deck");
  await buildDeck({ row, copy, model, dataset: ds, firm: cfg.firm, date: now }, deck);

  const openQuestions = [...new Set([...copy.open_questions, ...placeholders(copy).map((p) => `Deck placeholder: ${p}`)])];
  const warnings = ds.warnings;

  fs.writeFileSync(path.join(folder, "open-questions.md"), openQuestionsMd(row, openQuestions, warnings, ds.suggestedAddbacks.length));
  fs.writeFileSync(
    path.join(folder, "run-summary.md"),
    summaryMd({ row, now, intakeFiles: intake.files, sources: describeSources(ds), model, verification, warnings, drafted, workbook, deck }),
  );

  return { folder, workbook, deck, verification, warnings, openQuestions, drafted };
}

function openQuestionsMd(row: RequestRow, questions: string[], warnings: string[], suggested: number): string {
  const lines = [
    `# ${row.code_name}: open questions before the materials go out`,
    "",
    "## Confirm with the seller",
    ...(questions.length ? questions.map((q) => `- [ ] ${q}`) : ["- [ ] None raised by the draft. Still read every page against the source documents."]),
    "",
    "## Data issues to resolve",
    ...(warnings.length ? warnings.map((w) => `- [ ] ${w}`) : ["- None."]),
  ];
  if (suggested) {
    lines.push("", `## Potential add-backs`, `- [ ] Review the ${suggested} accounts flagged on the model's Recast tab. They are NOT included in adjusted EBITDA until confirmed and added to addbacks.csv.`);
  }
  lines.push("", "## Standard review", "- [ ] Replace placeholder assumptions (yellow cells on the Assumptions tab)", "- [ ] Check the Source Data tab for anything mapped by default", "- [ ] Read the CIM against the intake notes; every fact must trace to the seller or the financials", "");
  return lines.join("\n");
}

function summaryMd(p: {
  row: RequestRow;
  now: Date;
  intakeFiles: { file: string; used: string }[];
  sources: string[];
  model: ReturnType<typeof runModel>;
  verification: VerifyResult;
  warnings: string[];
  drafted: "claude" | "template";
  workbook: string;
  deck: string;
}): string {
  const last = p.model.historical[p.model.historical.length - 1]!;
  const lines = [
    `# ${p.row.code_name} (${p.row.business_name}): run summary`,
    "",
    `Request ${p.row.request_id}, ${p.row.priority}. Generated ${p.now.toISOString().replace("T", " ").slice(0, 16)} UTC.`,
    "",
    "## Deliverables",
    `- ${path.basename(p.workbook)}`,
    `- ${path.basename(p.deck)} (copy ${p.drafted === "claude" ? "drafted by Claude" : "templated: set ANTHROPIC_API_KEY for a full draft"})`,
    "",
    "## Headline numbers",
    `| | ${p.model.historical.map((y) => `FY${y.year}`).join(" | ")} |`,
    `|---|${p.model.historical.map(() => "---:").join("|")}|`,
    `| Revenue | ${p.model.historical.map((y) => fmtMoney(y.revenue)).join(" | ")} |`,
    `| Reported EBITDA | ${p.model.historical.map((y) => fmtMoney(y.ebitda)).join(" | ")} |`,
    `| Adjusted EBITDA | ${p.model.historical.map((y) => fmtMoney(y.adjEbitda)).join(" | ")} |`,
    `| SDE | ${p.model.historical.map((y) => fmtMoney(y.sde)).join(" | ")} |`,
    "",
    `FY${last.year} adjusted EBITDA margin: ${fmtPct(last.adjEbitda / last.revenue)}.`,
    "",
    "## Sources",
    ...p.sources.map((s) => `- ${s}`),
    "",
    "| File | Used as |",
    "|---|---|",
    ...p.intakeFiles.map((f) => `| ${f.file} | ${f.used} |`),
    "",
    "## Model checks",
    `- ${p.verification.formulas} formulas evaluated independently: ${p.verification.errors.length} errors, ${p.verification.mismatches.length} mismatches against the engine.`,
    `- Balance sheet balances in every year: ${p.model.years.every((y) => !y.bs || Math.abs(y.bs.check) < 1) ? "yes" : "NO"}.`,
    "",
    "## Warnings",
    ...(p.warnings.length ? p.warnings.map((w) => `- ${w}`) : ["- None."]),
    "",
  ];
  return lines.join("\n");
}
