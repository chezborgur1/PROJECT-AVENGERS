// What every exhibit and section module reads: the model output, the
// dataset's descriptive blocks (intake, KPIs, coded customers), the copy,
// and the names, columns and source strings derived once from them. Numbers
// come from ModelOutput only (guide 4.8); the dataset supplies facts, never
// figures.

import type { FinancialDataset, IntakeFacts, SourceKind } from "../domain/financials.ts";
import { monthLabel } from "../domain/financials.ts";
import type { ModelOutput, PeriodColumn } from "../model/types.ts";
import { findColumn, latestColumn } from "../model/types.ts";
import type { RequestRow } from "../requests/schema.ts";
import { fyRange } from "../util/format.ts";
import type { CimCopy } from "./copy.ts";

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
  /** LTM CY when it does not coincide with the latest fiscal year. */
  ltm?: PeriodColumn;
  /** PF column when at least one pro forma row is accepted. */
  pf?: PeriodColumn;
  mainStreet: boolean;
  /** Standard source strings (guide 4.6). */
  sources: { financials: string; management: string; customers?: string; payroll?: string; bank?: string };
  /** Everything an exhibit could not build from facts; the pipeline writes these to open-questions.md. */
  openQuestions: string[];
}

/** Standard source string for the financial statements, by the most trusted source used (guide 4.6). */
function financialsSource(ds: FinancialDataset, years: number[], ltmLabel?: string): string {
  const kinds = new Set<SourceKind>(ds.provenance.map((p) => p.pnl));
  const periods = `${fyRange(years)}${ltmLabel ? ` and ${ltmLabel}` : ""}`;
  if (kinds.has("quickbooks_api") || kinds.has("quickbooks_export")) return `Company financial statements (QuickBooks Online), ${periods}`;
  if (kinds.has("tax_return")) return `Company federal tax returns, ${periods}`;
  if (kinds.has("financial_statement")) return `Company financial statements, ${periods}`;
  return `Company financial records, ${periods}`;
}

export function buildContext(input: CimInput): CimContext {
  const { row, ds, out } = input;
  const fy = out.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).slice(-3);
  const latest = latestColumn(out);
  const latestFy = fy[fy.length - 1];
  const ltmCol = findColumn(out, "ltm");
  const ltm = ltmCol && latestFy && ltmCol.end !== latestFy.end ? ltmCol : undefined;
  const pfCol = findColumn(out, "pf");
  const pf = pfCol && out.periods[pfCol.key]?.ladder.proForma.some((r) => r.amount !== 0) ? pfCol : undefined;
  const intake = ds.intake;
  const legalName = intake?.company.legalName || row.business_name;
  const short = intake?.company.tradingName || shortNameOf(legalName);
  const years = fy.map((c) => c.fiscalYear!);
  const ltmLabel = ltm ? ltm.label : undefined;
  return {
    ...input,
    code: row.code_name,
    legalName,
    short,
    intake,
    fy,
    latest,
    ltm,
    pf,
    mainStreet: out.mode.mode === "mainStreet",
    sources: {
      financials: financialsSource(ds, years, ltmLabel),
      management: "Management",
      customers: ds.customers ? `Company ${ds.customers.term.toLowerCase()} list as of ${monthLabel(ds.customers.asOfMonth)}` : undefined,
      payroll: ds.payroll ? `Payroll register as of ${monthLabel(ds.payroll.asOfMonth)}` : undefined,
      bank: ds.depositsByMonth ? "Bank statements" : undefined,
    },
    openQuestions: [],
  };
}

/** "Ridgeline Comfort Services LLC" -> "Ridgeline": the first word, unless it is an article or too short to stand alone. */
export function shortNameOf(legal: string): string {
  const words = legal.replace(/,/g, "").split(/\s+/).filter((w) => !/^(LLC|Inc\.?|Corp\.?|Co\.?|Ltd\.?|LP|LLP|PLLC)$/i.test(w));
  const first = words[0] ?? legal;
  return /^(the|a|an)$/i.test(first) && words[1] ? `${first} ${words[1]}` : first;
}

/** Standard general note (guide 4.6), with the fiscal year-end when it is not December 31. */
export function standardNote(ctx: CimContext, extra?: string): string {
  const fye = ctx.out.fiscalYearEndMonth;
  const parts = ["Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited."];
  if (fye !== 12) parts.push(`Fiscal year ends ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][fye - 1]} 30/31.`);
  if (extra) parts.push(extra);
  return parts.join(" ");
}

/** "Per management; not independently verified." */
export const PER_MANAGEMENT = "Per management; not independently verified.";

/** A page reference token resolved after the planner numbers the pages: "{{page:S7.1}}" -> "page 17". */
export const pageRef = (sectionId: string): string => `{{page:${sectionId}}}`;

/** Replace every page token with its number, or "the relevant page" for a page the deck does not carry. */
export function resolvePageRefs(text: string, pageOf: (id: string) => number | undefined): string {
  return text.replace(/\{\{page:([A-Z0-9.]+)\}\}/g, (_, id: string) => {
    const n = pageOf(id);
    return n === undefined ? "the relevant page" : `page ${n}`;
  });
}

/** A "[Confirm: …]" placeholder, also recorded for open-questions.md. */
export function confirm(ctx: CimContext, what: string): string {
  const marker = `[Confirm: ${what}]`;
  if (!ctx.openQuestions.includes(marker)) ctx.openQuestions.push(marker);
  return marker;
}

/** Text with its management footnote marker when the fact is a management representation. */
export function withFootnote(text: string, n: number | undefined): string {
  return n ? `${text} (${n})` : text;
}
