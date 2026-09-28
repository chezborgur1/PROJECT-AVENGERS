// What every exhibit and section module reads: the model output, the
// dataset's descriptive blocks (intake, KPIs, coded customers), the copy,
// the numbers brief, and the names, columns and source strings derived once
// from them. Numbers come from ModelOutput only (guide 4.8); the dataset
// supplies facts, never figures.

import type { FinancialDataset, IntakeFacts, SourceKind } from "../domain/financials.ts";
import { monthLabel } from "../domain/financials.ts";
import type { ModelOutput, PeriodColumn, PeriodValues } from "../model/types.ts";
import { findColumn, latestColumn } from "../model/types.ts";
import type { RequestRow } from "../requests/schema.ts";
import { fyRange } from "../util/format.ts";
import { Brief, buildBrief } from "./brief.ts";
import type { CimCopy, PageCopyKey } from "./copy.ts";

export interface Firm {
  name: string;
  contact: string;
  email: string;
  phone: string;
}

export interface CimInput {
  row: RequestRow;
  ds: FinancialDataset;
  out: ModelOutput;
  copy: CimCopy;
  firm: Firm;
  date: Date;
}

export interface CimContext extends CimInput {
  /** Cover and file name: "Project Ridgeline". */
  code: string;
  /** Body: the legal name, and the defined short form used after first mention. */
  legalName: string;
  short: string;
  intake?: IntakeFacts;
  /** The fiscal-year columns shown in every table, ascending (at most three). */
  fy: PeriodColumn[];
  /** The latest full window: LTM CY when monthly, else the latest fiscal year. */
  latest: PeriodColumn;
  /** The comparison window for y/y: FY-1, or LTM PY when the latest window is an LTM that differs from the fiscal year. */
  prior?: PeriodColumn;
  /** LTM CY when it does not coincide with the latest fiscal year. */
  ltm?: PeriodColumn;
  /** PF column when at least one pro forma row is accepted. */
  pf?: PeriodColumn;
  mainStreet: boolean;
  assetSale: boolean;
  /** Everything the copy may quote, by token. */
  brief: Brief;
  /** Standard source strings (guide 4.6). */
  sources: { financials: string; statements: string; management: string; customers?: string; payroll?: string; bank?: string };
  /** Module ids whose trigger holds (guide 3.5 rule 1), set by the planner. */
  present: Set<string>;
  /** Host page id -> the module ids whose content it carries (guide 3.5 rule 2), set by the planner. */
  carried: Map<string, string[]>;
  /** Every "[Confirm: …]" an exhibit wrote, with the question behind it; the pipeline writes these to open-questions.md. */
  openQuestions: string[];
  /** Build notes for run-summary.md: fallbacks taken, observations dropped to fit, copy that failed the lint. */
  log: string[];
}

/** Standard source string for the financial statements, by the most trusted source used (guide 4.6). */
function statementsSource(ds: FinancialDataset): string {
  const kinds = new Set<SourceKind>(ds.provenance.map((p) => p.pnl));
  if (kinds.has("quickbooks_api") || kinds.has("quickbooks_export")) return "Company financial statements (QuickBooks Online)";
  if (kinds.has("tax_return")) return "Company federal tax returns";
  if (kinds.has("financial_statement")) return "Company financial statements";
  return "Company financial records";
}

export function buildContext(input: CimInput): CimContext {
  const { row, ds, out } = input;
  const fy = out.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).slice(-3);
  const latest = latestColumn(out);
  const latestFy = fy[fy.length - 1];
  const ltmCol = findColumn(out, "ltm");
  const ltm = ltmCol && latestFy && ltmCol.end !== latestFy.end ? ltmCol : undefined;
  const prior = ltm ? findColumn(out, "ltm", { priorYear: true }) : fy[fy.length - 2];
  const pfCol = findColumn(out, "pf");
  const pf = pfCol && out.periods[pfCol.key]?.ladder.proForma.some((r) => r.amount !== 0) ? pfCol : undefined;
  const intake = ds.intake;
  const legalName = intake?.company.legalName || row.business_name;
  const short = intake?.company.tradingName || shortNameOf(legalName);
  const years = fy.map((c) => c.fiscalYear!);
  const statements = statementsSource(ds);
  return {
    ...input,
    code: row.code_name,
    legalName,
    short,
    intake,
    fy,
    latest: ltm ? latest : (latestFy ?? latest),
    prior,
    ltm,
    pf,
    mainStreet: out.mode.mode === "mainStreet",
    assetSale: out.dealForm === "asset_purchase",
    brief: buildBrief(out, ds, { fy, latest: ltm ? latest : (latestFy ?? latest), prior, ltm, pf }),
    sources: {
      statements,
      financials: `${statements}, ${fyRange(years)}${ltm ? ` and ${ltm.label}` : ""}`,
      management: "Management",
      customers: ds.customers ? `Company ${ds.customers.term.toLowerCase()} list as of ${monthLabel(ds.customers.asOfMonth)}` : undefined,
      payroll: ds.payroll ? `Payroll register as of ${monthLabel(ds.payroll.asOfMonth)}` : undefined,
      bank: ds.depositsByMonth ? "Bank statements" : undefined,
    },
    present: new Set(),
    carried: new Map(),
    openQuestions: [],
    log: [],
  };
}

/** "Ridgeline Comfort Services LLC" -> "Ridgeline": the first word, unless it is an article or too short to stand alone. */
export function shortNameOf(legal: string): string {
  const words = legal.replace(/,/g, "").split(/\s+/).filter((w) => !/^(LLC|Inc\.?|Corp\.?|Co\.?|Ltd\.?|LP|LLP|PLLC)$/i.test(w));
  const first = words[0] ?? legal;
  return /^(the|a|an)$/i.test(first) && words[1] ? `${first} ${words[1]}` : first;
}

/** Values of a column. */
export const at = (ctx: CimContext, c: PeriodColumn): PeriodValues => ctx.out.periods[c.key]!;

/** The columns every financial table shows: the fiscal years, then LTM and PF when they differ from the latest year. */
export const tableColumns = (ctx: CimContext): PeriodColumn[] => [...ctx.fy, ...(ctx.ltm ? [ctx.ltm] : []), ...(ctx.pf ? [ctx.pf] : [])];

/** Standard general note (guide 4.6), naming the fiscal year-end only when it is not December 31. */
export function standardNote(ctx: CimContext, extra?: string): string {
  const fye = ctx.out.fiscalYearEndMonth;
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][fye - 1];
  const parts = ["Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited."];
  if (fye !== 12) parts.push(`Fiscal year ends ${month} ${[1, 3, 5, 7, 8, 10].includes(fye) ? 31 : fye === 2 ? 28 : 30}.`);
  if (extra) parts.push(extra);
  return parts.join(" ");
}

/** "Per management; not independently verified." */
export const PER_MANAGEMENT = "Per management; not independently verified.";

/** The non-GAAP sentence for the first page that shows Adj. EBITDA (guide 4.6). */
export const nonGaap = (ctx: CimContext): string =>
  `Adj. EBITDA${ctx.mainStreet ? ", SDE" : ""} and PF Adj. EBITDA are non-GAAP measures; see ${pageRef("S7.1")} for the reconciliation to net income.`;

/** A page reference token resolved after the planner numbers the pages: "{{page:S7.1}}" -> "page 17". */
export const pageRef = (sectionId: string): string => `{{page:${sectionId}}}`;

/** Replace every page token with its number, or "the appendix" when the deck does not carry that page. */
export function resolvePageRefs(text: string, pageOf: (id: string) => number | undefined): string {
  return text
    .replace(/\{\{page:([A-Z0-9.]+)\}\}/g, (_, id: string) => {
      const n = pageOf(id);
      return n === undefined ? "the appendix" : `page ${n}`;
    })
    .replace(/\{\{pageno:([A-Z0-9.]+)\}\}/g, (_, id: string) => String(pageOf(id) ?? ""));
}

/** A bare page number token for a page-reference column: "{{pageno:S6.1}}" -> "14". */
export const pageNo = (sectionId: string): string => `{{pageno:${sectionId}}}`;

/**
 * A "[Confirm: …]" placeholder, recorded with its question for open-questions.md.
 * `display` is what the cell or sentence shows; `question` is what the advisor asks the Seller.
 */
export function confirm(ctx: CimContext, display: string, question?: string): string {
  const marker = `[Confirm: ${display}]`;
  const entry = question ? `${question} (shown as ${marker})` : marker;
  if (!ctx.openQuestions.includes(entry)) ctx.openQuestions.push(entry);
  return marker;
}

/** Resolve the figure tokens in a copy string; an unknown token is logged and shown as a placeholder. */
export function resolveCopy(ctx: CimContext, text: string, where: string): string {
  return ctx.brief.resolve(text, (key) => ctx.log.push(`${where}: unknown figure token {{${key}}}`));
}

/** The copy block for a page, when the copy has one. */
export function pageCopy<K extends PageCopyKey>(ctx: CimContext, key: K): CimCopy[K] | undefined {
  return ctx.copy[key];
}
