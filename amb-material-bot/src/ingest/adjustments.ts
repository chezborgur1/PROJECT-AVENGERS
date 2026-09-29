// The adjustments schedule (guide 5.3): one row per adjustment in tier
// order, built from the P&L, the advisor's adjustments.csv (or the seller's
// legacy addbacks.csv), the bot's flagged accounts and the recast inputs.
// Also decides Main Street mode and the deal form, because the capital
// reserve row depends on the mode.

import path from "node:path";
import {
  ADJUSTMENT_CATEGORIES,
  ADJUSTMENT_CATEGORY_LABELS,
  ADJUSTMENT_STATUSES,
  ADJUSTMENT_TIERS,
  IS_CATEGORIES,
  IS_LABELS,
  PF_METHODS,
  addMonths,
  decideMode,
  ltmWindow,
  monthKey,
  monthLabel,
  numberAdjustments,
  periodLabel,
  pfColumnAmount,
  sumMonths,
  type Addback,
  type Adjustment,
  type AdjustmentCategory,
  type AdjustmentStatus,
  type AdjustmentTier,
  type DealFormDecision,
  type Evidence,
  type IsCategory,
  type MappedLine,
  type ModeDecision,
  type MonthKey,
  type MonthlyPnl,
  type PfMethod,
  type RecastInputs,
  type SuggestedAddback,
} from "../domain/financials.ts";
import { normaliseAccount } from "../domain/chartOfAccounts.ts";
import { clientLabel, parseAmount, readRecords } from "../util/tables.ts";
import { fyRange } from "../util/format.ts";
import { employerPayrollTaxes, socialSecurityWageBase } from "./payroll.ts";

export const DEFAULT_REPLACEMENT_SALARY = 85_000;
export const DEFAULT_BURDEN_PCT = 0.15;

/** A schedule row before refs, months and defaults are applied. */
export interface ScheduleRow {
  tier: AdjustmentTier;
  description: string;
  category: AdjustmentCategory;
  status: AdjustmentStatus;
  evidence: Evidence;
  basis?: string;
  sourceDocument?: string;
  byFiscalYear: Record<number, number>;
  /** P&L account the amount comes out of, so months can be tied to it. */
  account?: string;
  /** The advisor's amount for the partial current fiscal year (YTD), when the file gives one. */
  stubAmount?: number;
  pnlLine?: IsCategory;
  pfMethod?: PfMethod;
  origin: Adjustment["origin"];
  sourceFile: string;
}

const TIER_ALIASES: Record<string, AdjustmentTier> = {
  d: "definitional", definitional: "definitional",
  n: "normalization", normalization: "normalization", normalisation: "normalization",
  s: "owner_compensation", owner_compensation: "owner_compensation", "owner compensation": "owner_compensation", sde: "owner_compensation",
  pf: "pro_forma", pro_forma: "pro_forma", "pro forma": "pro_forma", proforma: "pro_forma",
  m: "memo", memo: "memo",
};

const STATUS_ALIASES: Record<string, AdjustmentStatus> = { rejected: "excluded", excluded: "excluded", accepted: "accepted", supported: "supported", proposed: "proposed" };

function parseTier(raw: string | undefined): AdjustmentTier | undefined {
  return TIER_ALIASES[(raw ?? "").trim().toLowerCase()];
}

function parseCategory(raw: string | undefined): AdjustmentCategory | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if ((ADJUSTMENT_CATEGORIES as readonly string[]).includes(s)) return s as AdjustmentCategory;
  const byLabel = (Object.entries(ADJUSTMENT_CATEGORY_LABELS) as [AdjustmentCategory, string][]).find(([, label]) => label.toLowerCase() === s);
  if (byLabel) return byLabel[0];
  const loose = s.replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if ((ADJUSTMENT_CATEGORIES as readonly string[]).includes(loose)) return loose as AdjustmentCategory;
  if (/personal|discretionary/.test(s)) return "personal_discretionary";
  if (/non.?recurring|one.?time/.test(s)) return "non_recurring";
  if (/non.?operating/.test(s)) return "non_operating";
  if (/rent/.test(s)) return "related_party_rent";
  if (/run.?rate/.test(s)) return "run_rate";
  return undefined;
}

function parseStatus(raw: string | undefined): AdjustmentStatus | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  return STATUS_ALIASES[s] ?? ((ADJUSTMENT_STATUSES as readonly string[]).includes(s) ? (s as AdjustmentStatus) : undefined);
}

function parseEvidence(raw: string | undefined): Evidence | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (/^doc/.test(s)) return "documented";
  if (/^(management|mgmt|rep)/.test(s)) return "management_representation";
  return undefined;
}

function parsePfMethod(raw: string | undefined): PfMethod | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  return PF_METHODS.find((m) => m.toLowerCase() === s);
}

function parsePnlLine(raw: string | undefined): IsCategory | undefined {
  const s = (raw ?? "").trim().toLowerCase().replace(/[^a-z]+/g, "_");
  if ((IS_CATEGORIES as readonly string[]).includes(s)) return s as IsCategory;
  return (Object.entries(IS_LABELS) as [IsCategory, string][]).find(([, label]) => label.toLowerCase() === (raw ?? "").trim().toLowerCase())?.[0];
}

/** Year columns: "2025", "fy2025", "fy_2025", "amount_2025". */
function yearColumns(record: Record<string, string>): Map<number, string> {
  const out = new Map<number, string>();
  for (const key of Object.keys(record)) {
    const m = /^(?:[a-z]+_?)?((?:19|20)\d{2})$/.exec(key);
    if (m) out.set(Number(m[1]), key);
  }
  return out;
}

/**
 * Read adjustments.csv (or .xlsx) as written, every year column included.
 * Definitional rows are derived from the P&L and never read from the file;
 * an S-tier row is only the owner's pay, the replacement cost or the
 * capital reserve (which override the defaults), and any other owner perk
 * is listed in the N tier so [S1]–[S3] keep their refs. The `ref` column,
 * if present, is ignored: refs are numbered when the schedule is built.
 */
export async function loadAdjustmentsCsv(file: string): Promise<{ rows: ScheduleRow[]; warnings: string[] }> {
  const name = path.basename(file);
  const rows: ScheduleRow[] = [];
  const warnings: string[] = [];
  (await readRecords(file)).forEach((r, i) => {
    const line = i + 2;
    const description = (r.description ?? r.adjustment ?? "").trim();
    let tier = parseTier(r.tier);
    let category = parseCategory(r.category);
    if (!description) {
      warnings.push(`${name} line ${line}: no description; row skipped.`);
      return;
    }
    if (!tier) {
      warnings.push(`${name} line ${line} ("${description}"): tier "${r.tier ?? ""}" not recognised (D, N, S, PF or M); row skipped.`);
      return;
    }
    if (tier === "definitional") {
      warnings.push(`${name} line ${line} ("${description}"): definitional rows come from the P&L and are not read from the file; row skipped.`);
      return;
    }
    if (tier === "owner_compensation" && !["owner_compensation", "replacement_cost", "capital_reserve"].includes(category ?? "")) {
      warnings.push(`${name} line ${line} ("${description}"): owner perks other than the owner's pay are listed in the normalization tier so [S1]–[S3] keep their refs; row moved.`);
      tier = "normalization";
      category ??= "owner_compensation";
    }
    if (!category) {
      category = tier === "pro_forma" ? "run_rate" : tier === "memo" ? "other" : "other";
      if (tier === "normalization") warnings.push(`${name} line ${line} ("${description}"): no category; listed as Other consideration. Confirm the category.`);
    }
    const byFiscalYear: Record<number, number> = {};
    for (const [y, col] of yearColumns(r)) byFiscalYear[y] = parseAmount(r[col]) ?? 0;
    const status = parseStatus(r.status);
    if (r.status && !status) warnings.push(`${name} line ${line} ("${description}"): status "${r.status}" not recognised; treated as proposed.`);
    const evidence = parseEvidence(r.evidence);
    if (r.evidence && !evidence) warnings.push(`${name} line ${line} ("${description}"): evidence "${r.evidence}" not recognised; treated as management representation.`);
    const pfMethod = parsePfMethod(r.pf_method ?? r.method);
    if ((r.pf_method ?? r.method) && !pfMethod) warnings.push(`${name} line ${line} ("${description}"): PF method "${r.pf_method ?? r.method}" is not one of the guide's methods; left blank.`);
    const pnlLine = parsePnlLine(r.pnl_line ?? r.line);
    if (tier === "pro_forma" && !pnlLine) warnings.push(`${name} line ${line} ("${description}"): a pro forma row needs pnl_line (the P&L line it restates); the PF column cannot apply it.`);
    rows.push({
      tier,
      description,
      category,
      status: status ?? "proposed",
      evidence: evidence ?? "management_representation",
      basis: r.basis?.trim() || undefined,
      sourceDocument: (r.source_document ?? r.source)?.trim() || undefined,
      byFiscalYear,
      account: r.account?.trim() || undefined,
      pnlLine,
      pfMethod,
      origin: "advisor",
      sourceFile: name,
    });
  });
  return { rows, warnings };
}

/**
 * Restrict file rows to the model's fiscal years: missing years are zero.
 * The partial current year's column (`stubFy`, when the grid ends mid-year)
 * is the row's YTD amount, spread over the stub months; for a pro forma row,
 * an annual run-rate, it stands in for a blank latest year. Amounts for any
 * other year are reported and dropped.
 */
export function fitRowsToYears(rows: ScheduleRow[], years: number[], stubFy?: number): { rows: ScheduleRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const latest = years[years.length - 1];
  const fitted = rows.map((r) => {
    for (const [y, amount] of Object.entries(r.byFiscalYear)) {
      if (!years.includes(Number(y)) && Number(y) !== stubFy && amount) warnings.push(`${r.sourceFile} ("${r.description}"): FY${y} is not in the model; that amount is ignored.`);
    }
    const byFiscalYear = Object.fromEntries(years.map((y) => [y, r.byFiscalYear[y] ?? 0]));
    const stub = stubFy !== undefined ? r.byFiscalYear[stubFy] : undefined;
    if (stub === undefined) return { ...r, byFiscalYear };
    if (r.tier === "pro_forma") {
      if (latest !== undefined && !byFiscalYear[latest]) byFiscalYear[latest] = stub;
      return { ...r, byFiscalYear };
    }
    return { ...r, byFiscalYear, stubAmount: stub };
  });
  return { rows: fitted, warnings };
}

/**
 * The seller's flat addbacks.csv as schedule rows, accepted as listed (the
 * list was applied as-is before the schedule existed; the status column of
 * adjustments.csv is the way to hold a row back).
 */
export function legacyAddbacksToRows(addbacks: Addback[], years: number[], stubFy?: number): ScheduleRow[] {
  const byDescription = new Map<string, ScheduleRow>();
  for (const a of addbacks) {
    if (!years.includes(a.year) && a.year !== stubFy) continue;
    const key = a.description.trim().toLowerCase();
    let row = byDescription.get(key);
    if (!row) {
      const category: AdjustmentCategory = a.type === "owner" ? "owner_compensation" : a.type === "discretionary" ? "personal_discretionary" : a.type === "non_recurring" ? "non_recurring" : "other";
      row = {
        tier: "normalization",
        description: a.description.trim(),
        category,
        status: "accepted",
        evidence: "management_representation",
        sourceDocument: `Seller add-back list (${a.source})`,
        byFiscalYear: Object.fromEntries(years.map((y) => [y, 0])),
        origin: "addbacks_csv",
        sourceFile: a.source,
      };
      byDescription.set(key, row);
    }
    // The partial current year's add-back is a YTD amount (see fitRowsToYears).
    if (a.year === stubFy) row.stubAmount = (row.stubAmount ?? 0) + a.amount;
    else row.byFiscalYear[a.year] = (row.byFiscalYear[a.year] ?? 0) + a.amount;
  }
  return [...byDescription.values()];
}

// --- Building the schedule ---------------------------------------------------

export interface ScheduleContext {
  years: number[];
  pnl: Record<number, Record<IsCategory, number>>;
  monthly?: MonthlyPnl;
  lines: MappedLine[];
  suggested: SuggestedAddback[];
  /** Rows from adjustments.csv or the legacy list, in file order. */
  fileRows: ScheduleRow[];
  replacementSalary: { amount: number; source: string };
  burden: { pct: number; source: string };
  /** Form 4562 equipment placed in service per fiscal year, when a tax return gave it. */
  equipmentPlacedInService?: Record<number, number>;
  /** The owner's employer taxes and benefits per fiscal year, when the payroll register records them (else statutory rates apply). */
  ownerEmployerCosts?: { byFiscalYear: Record<number, number>; file: string };
  owner?: { name?: string; role?: string };
  passThrough: boolean;
  dealFormPreference?: "asset" | "equity" | "either";
  /** File names, for the source-document column. */
  pnlFile: string;
}

export interface ScheduleResult {
  adjustments: Adjustment[];
  recastInputs: RecastInputs;
  mode: ModeDecision;
  dealForm: DealFormDecision;
  warnings: string[];
}

const money = (n: number) => `$${(Math.abs(n) / 1000).toFixed(1)}K`;

function zeros(years: number[]): Record<number, number> {
  return Object.fromEntries(years.map((y) => [y, 0]));
}

/**
 * Split an amount over months in proportion to weights, unrounded: month =
 * total × weight ÷ Σ weights, the formula the Adjustments tab writes, so the
 * workbook reproduces every month exactly. Zero total weight spreads evenly.
 */
export function splitByWeights(total: number, weights: Record<MonthKey, number>): Record<MonthKey, number> {
  const keys = Object.keys(weights).sort();
  const wsum = keys.reduce((s, k) => s + weights[k]!, 0);
  return Object.fromEntries(keys.map((k) => [k, wsum ? (weights[k]! * total) / wsum : total / keys.length]));
}

/** Months of one fiscal year in the grid. */
function fiscalYearMonths(monthly: MonthlyPnl, fy: number): MonthKey[] {
  return monthly.months.filter((m) => m.fiscalYear === fy).map((m) => m.key);
}

function categoryMonths(monthly: MonthlyPnl, category: IsCategory, sign = 1): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  for (const m of monthly.months) out[m.key] = sign * (monthly.values[m.key]?.[category] ?? 0);
  return out;
}

/** The grid lines an adjustment names (exact account, or its leaf after " : "). */
function matchedLines(monthly: MonthlyPnl, account: string): MonthlyPnl["lines"] {
  const key = normaliseAccount(account);
  return monthly.lines.filter((l) => normaliseAccount(l.account) === key || normaliseAccount(l.account.split(" : ").pop()!) === key);
}

function accountMonths(monthly: MonthlyPnl, account: string, sign = 1): Record<MonthKey, number> | undefined {
  const lines = matchedLines(monthly, account);
  if (!lines.length) return undefined;
  const out: Record<MonthKey, number> = {};
  for (const m of monthly.months) out[m.key] = sign * lines.reduce((s, l) => s + (l.amounts[m.key] ?? 0), 0);
  return out;
}

/** Categories whose amount recurs month after month, so a partial year may be run-rated from the latest full year. */
const RECURRING: AdjustmentCategory[] = ["personal_discretionary", "related_party_rent", "owner_compensation", "replacement_cost", "capital_reserve"];

/** How a row fills the months of the partial current year (the YTD stub) that no full fiscal year covers. */
export type StubRule = { kind: "amount"; amount: number } | { kind: "runRate" } | { kind: "zero" };

export function stubRuleFor(r: { category: AdjustmentCategory; stubAmount?: number }): StubRule {
  if (r.stubAmount !== undefined) return { kind: "amount", amount: r.stubAmount };
  return RECURRING.includes(r.category) ? { kind: "runRate" } : { kind: "zero" };
}

/**
 * A row's months: each full fiscal year split by the weights (the account's
 * own months, or flat), and the stub months by the stub rule: the advisor's
 * YTD amount split the same way, a run-rate at the latest full year's
 * proportion, or zero for a one-time item.
 */
function monthsForRow(monthly: MonthlyPnl, years: number[], byFiscalYear: Record<number, number>, weights: Record<MonthKey, number>, stub: StubRule): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  const pick = (months: MonthKey[]) => Object.fromEntries(months.map((m) => [m, weights[m] ?? 0]));
  for (const fy of years) {
    const months = fiscalYearMonths(monthly, fy);
    if (months.length >= 12) Object.assign(out, splitByWeights(byFiscalYear[fy] ?? 0, pick(months)));
  }
  const stubMonths = monthly.months.map((m) => m.key).filter((m) => !(m in out));
  if (!stubMonths.length) return out;
  if (stub.kind === "amount") return { ...out, ...splitByWeights(stub.amount, pick(stubMonths)) };
  const latest = years[years.length - 1];
  const ref = latest !== undefined ? fiscalYearMonths(monthly, latest) : [];
  const refWeight = ref.reduce((s, m) => s + (weights[m] ?? 0), 0);
  const refAmount = latest !== undefined ? (byFiscalYear[latest] ?? 0) : 0;
  for (const m of stubMonths) out[m] = stub.kind === "zero" ? 0 : refWeight ? (refAmount * (weights[m] ?? 0)) / refWeight : refAmount / 12;
  return out;
}

/** The month fields a schedule row carries (`Adjustment.byMonth`, `accounts`, `stub`). */
type RowMonths = Pick<Adjustment, "byMonth" | "accounts" | "stub">;

function flatMonths(monthly: MonthlyPnl, perYear: number): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  for (const m of monthly.months) out[m.key] = perYear / 12;
  return out;
}

function firstNonZeroYear(byFiscalYear: Record<number, number>, years: number[]): number {
  return [...years].reverse().find((y) => byFiscalYear[y]) ?? years[years.length - 1]!;
}

/** Does a file row fully account for a P&L account (same amount every year)? Then the bot need not flag it again. */
function accountFullyBacked(rows: ScheduleRow[], account: string, amounts: Record<number, number>, years: number[]): boolean {
  const key = normaliseAccount(account);
  const leaf = normaliseAccount(account.split(" : ").pop()!);
  return rows.some((r) => {
    const ref = r.account ? normaliseAccount(r.account) : normaliseAccount(r.description);
    if (ref !== key && ref !== leaf) return false;
    return years.every((y) => Math.abs((r.byFiscalYear[y] ?? 0) - (amounts[y] ?? 0)) < 1);
  });
}

export function buildSchedule(ctx: ScheduleContext): ScheduleResult {
  const { years, pnl, monthly } = ctx;
  const warnings: string[] = [];
  const latest = years[years.length - 1]!;
  const pnlFile = path.basename(ctx.pnlFile);
  const byCategory = (c: IsCategory): Record<number, number> => Object.fromEntries(years.map((y) => [y, pnl[y]?.[c] ?? 0]));
  const accountName = (c: IsCategory): string => {
    const names = [...new Set(ctx.lines.filter((l) => l.statement === "pnl" && l.category === c).map((l) => l.account))];
    return names.length ? names.join(", ") : IS_LABELS[c];
  };
  const rows: Omit<Adjustment, "ref">[] = [];

  // Definitional: interest, taxes, D&A off the P&L.
  const definitional: [string, AdjustmentCategory, IsCategory, (amt: number) => string][] = [
    ["Interest expense", "interest", "interest_expense", (a) => `Adds back interest on the Company's debt, ${money(a)} in FY${latest}, per the P&L ${accountName("interest_expense")} account.`],
    ["Income taxes", "taxes", "income_tax", (a) => (a ? `Adds back entity-level income taxes, ${money(a)} in FY${latest}, per the P&L ${accountName("income_tax")} account.` : ctx.passThrough ? "None: the Company is a pass-through entity, so income tax is paid by the owner and the ladder shows a dash." : "None: no income tax account on the P&L.")],
    ["Depreciation and amortization", "da", "depreciation_amortization", (a) => `Adds back depreciation and amortization, ${money(a)} in FY${latest}, per the P&L ${accountName("depreciation_amortization")} account.`],
  ];
  for (const [description, category, line, basisFor] of definitional) {
    const byFiscalYear = byCategory(line);
    rows.push({
      tier: "definitional",
      description,
      category,
      basis: basisFor(byFiscalYear[latest] ?? 0),
      sourceDocument: byFiscalYear[latest] || Object.values(byFiscalYear).some(Boolean) ? `P&L, account ${accountName(line)}` : "P&L (no such account)",
      evidence: "documented",
      status: "accepted",
      byFiscalYear,
      byMonth: monthly ? categoryMonths(monthly, line) : undefined,
      origin: "pnl",
      sourceFile: pnlFile,
    });
  }

  // Normalization: the file's N rows, then non-operating P&L items, then bot-flagged accounts.
  let s1Override: ScheduleRow | undefined;
  let s1TaxesOverride: ScheduleRow | undefined;
  let s2Override: ScheduleRow | undefined;
  let s3Override: ScheduleRow | undefined;
  const pfRows: ScheduleRow[] = [];
  const memoRows: ScheduleRow[] = [];
  const nRows: ScheduleRow[] = [];
  for (const r of ctx.fileRows) {
    if (r.tier === "owner_compensation") {
      if (r.category === "owner_compensation" && /payroll tax|benefit/i.test(r.description)) s1TaxesOverride = r;
      else if (r.category === "owner_compensation") s1Override = r;
      else if (r.category === "replacement_cost") s2Override = r;
      else s3Override = r;
    } else if (r.tier === "pro_forma") pfRows.push(r);
    else if (r.tier === "memo") memoRows.push(r);
    else nRows.push(r);
  }
  const toAdjustment = (r: ScheduleRow, defaults: { basis: string; sourceDocument: string }, months?: RowMonths): Omit<Adjustment, "ref"> => ({
    tier: r.tier,
    description: r.description,
    category: r.category,
    basis: r.basis ?? defaults.basis,
    sourceDocument: r.sourceDocument ?? defaults.sourceDocument,
    evidence: r.evidence,
    status: r.status,
    byFiscalYear: r.byFiscalYear,
    ...(months ?? {}),
    pnlLine: r.pnlLine,
    pfMethod: r.pfMethod,
    origin: r.origin,
    sourceFile: r.sourceFile,
  });
  // Months of the partial current year no full fiscal year covers (the YTD stub), if any.
  const stubMonths = monthly ? monthly.months.filter((m) => !years.includes(m.fiscalYear)) : [];
  const stubLabel = stubMonths.length ? `${monthLabel(stubMonths[0]!.key)}–${monthLabel(stubMonths[stubMonths.length - 1]!.key)}` : "";
  const stubFy = stubMonths[0]?.fiscalYear;
  /**
   * Every file row gets months when there is a grid, with or without an
   * account, so YTD and LTM never prorate a fiscal year the window does not
   * cover. The stub months follow the row's stub rule; each extrapolated or
   * zeroed stub amount is listed for the advisor.
   */
  const fileRowMonths = (r: ScheduleRow): RowMonths | undefined => {
    if (!monthly) return undefined;
    const lines = r.account ? matchedLines(monthly, r.account) : [];
    if (r.account && !lines.length) warnings.push(`Adjustment "${r.description}" names account "${r.account}", which is not on the monthly P&L; its months are spread evenly.`);
    const weights = lines.length ? accountMonths(monthly, r.account!)! : flatMonths(monthly, 1);
    const rule = stubRuleFor(r);
    const byMonth = monthsForRow(monthly, years, r.byFiscalYear, weights, rule);
    if (stubMonths.length) {
      const stubTotal = stubMonths.reduce((s, m) => s + (byMonth[m.key] ?? 0), 0);
      if (rule.kind === "runRate" && stubTotal) warnings.push(`Adjustment "${r.description}": no FY${stubFy} (YTD) amount in ${r.sourceFile}, so ${stubLabel} carry a run-rate of FY${years[years.length - 1]} (${money(stubTotal)}). Enter the YTD amount under FY${stubFy} to replace it.`);
      if (rule.kind === "zero" && Object.values(r.byFiscalYear).some(Boolean)) warnings.push(`Adjustment "${r.description}" (${ADJUSTMENT_CATEGORY_LABELS[r.category].toLowerCase()}) is zero in ${stubLabel}; enter a YTD amount under FY${stubFy} in ${r.sourceFile} if it recurred.`);
    }
    return { byMonth, ...(lines.length ? { accounts: [...new Set(lines.map((l) => l.account))] } : {}), ...(stubMonths.length ? { stub: rule.kind === "amount" ? "amount" : rule.kind === "runRate" ? "run_rate" : "zero" } : {}) };
  };
  for (const r of nRows) {
    const y = firstNonZeroYear(r.byFiscalYear, years);
    const verb = (r.byFiscalYear[y] ?? 0) >= 0 ? "Removes" : "Deducts";
    rows.push(
      toAdjustment(
        r,
        {
          basis: `${verb} ${r.description.replace(/\.$/, "").toLowerCase()}, ${money(r.byFiscalYear[y] ?? 0)} in FY${y}, per ${r.origin === "addbacks_csv" ? "the seller's add-back list" : "the adjustments schedule"}.`,
          sourceDocument: r.origin === "addbacks_csv" ? `Seller add-back list (${r.sourceFile})` : `Adjustments schedule (${r.sourceFile})${r.account ? `; P&L account ${r.account}` : ""}`,
        },
        fileRowMonths(r),
      ),
    );
    if (r.category === "other" && r.tier === "normalization") warnings.push(`Adjustment "${r.description}" has no category; confirm what it is before it goes in the CIM.`);
  }

  // Non-operating items: Reported EBITDA is net income plus [D1..D3] (check C05), so it carries other
  // income and expense; these rows take them out, one per account.
  for (const [category, sign, label] of [["other_income", -1, "income"], ["other_expense", 1, "expense"]] as const) {
    const accounts = [...new Set(ctx.lines.filter((l) => l.statement === "pnl" && l.category === category).map((l) => l.account))];
    for (const account of accounts) {
      const byFiscalYear: Record<number, number> = Object.fromEntries(
        years.map((y) => [y, sign * ctx.lines.filter((l) => l.statement === "pnl" && l.category === category && l.account === account && l.year === y).reduce((s, l) => s + l.amount, 0)]),
      );
      if (!Object.values(byFiscalYear).some(Boolean)) continue;
      const leaf = account.split(" : ").pop()!;
      rows.push({
        tier: "normalization",
        description: `${clientLabel(leaf)} (non-operating)`,
        category: "non_operating",
        basis: `${sign < 0 ? "Removes" : "Adds back"} ${clientLabel(leaf).toLowerCase()}, ${money(byFiscalYear[latest] ?? 0)} in FY${latest}, which is non-operating ${label}, per the P&L ${account} account.`,
        sourceDocument: `P&L, account ${account}`,
        evidence: "documented",
        status: "accepted",
        byFiscalYear,
        byMonth: monthly ? accountMonths(monthly, account, sign) : undefined,
        origin: "pnl",
        sourceFile: pnlFile,
      });
    }
  }

  // Bot-flagged accounts, once each, unless a file row already accounts for the whole account.
  const flagged = new Map<string, SuggestedAddback>();
  for (const s of ctx.suggested) if (!flagged.has(s.account)) flagged.set(s.account, s);
  for (const [account, s] of flagged) {
    const amounts: Record<number, number> = Object.fromEntries(years.map((y) => [y, ctx.lines.filter((l) => l.statement === "pnl" && l.account === account && l.year === y).reduce((t, l) => t + l.amount, 0)]));
    if (accountFullyBacked(ctx.fileRows, account, amounts, years)) continue;
    const listed = ctx.fileRows.find((r) => (r.account && normaliseAccount(r.account) === normaliseAccount(account)) || normaliseAccount(r.description) === normaliseAccount(account.split(" : ").pop()!));
    // What the file already lists, over every year it covers, so a row listed only in FY2024 is not described as $0.
    const listedYears = listed ? years.filter((y) => listed.byFiscalYear[y]) : [];
    const listedTotal = listedYears.reduce((t, y) => t + (listed!.byFiscalYear[y] ?? 0), 0);
    const listedNote = listedYears.length ? ` beyond the ${money(listedTotal)} already listed (${listedYears.map((y) => `FY${y}`).join(", ")})` : "";
    rows.push({
      tier: "normalization",
      description: `${clientLabel(account.split(" : ").pop()!)} (for review)`,
      category: "personal_discretionary",
      basis: `Flagged for review: ${s.reason}${listedNote}. Account total ${money(amounts[latest] ?? 0)} in FY${latest}. Amount 0 until an advisor enters it.`,
      sourceDocument: `P&L account ${account}`,
      evidence: "pending",
      status: "proposed",
      byFiscalYear: zeros(years),
      origin: "suggested",
      sourceFile: pnlFile,
    });
  }

  // Owner compensation: [S1] as paid, [S2] market replacement, [S3] capital reserve (Main Street only).
  const ownerComp = byCategory("owner_comp");
  const s1Amounts = s1Override?.byFiscalYear ?? ownerComp;
  if (s1Override && years.some((y) => Math.abs((s1Override!.byFiscalYear[y] ?? 0) - (ownerComp[y] ?? 0)) >= 1)) {
    warnings.push(`[S1] owner compensation in ${s1Override.sourceFile} (${years.map((y) => `FY${y} ${money(s1Override!.byFiscalYear[y] ?? 0)}`).join(", ")}) differs from the P&L owner compensation line (${years.map((y) => `FY${y} ${money(ownerComp[y] ?? 0)}`).join(", ")}); the schedule uses the file.`);
  }
  const s1TiesToPnl = years.every((y) => Math.abs((s1Amounts[y] ?? 0) - (ownerComp[y] ?? 0)) < 1);
  const ownerLabel = ctx.owner?.name || "the owner";
  const s1Evidence = s1Override?.evidence ?? "documented";
  rows.push({
    tier: "owner_compensation",
    description: "Owner compensation",
    category: "owner_compensation",
    basis: s1Override?.basis ?? (s1Amounts[latest] ? `Adds back ${ownerLabel}'s compensation as paid, ${money(s1Amounts[latest] ?? 0)} in FY${latest}, per the P&L ${accountName("owner_comp")} account.` : "None: no owner compensation is expensed on the P&L (a sole proprietor's draw is not an expense), so SDE equals Reported EBITDA plus normalization adjustments."),
    sourceDocument: s1Override?.sourceDocument ?? `P&L, account ${accountName("owner_comp")}`,
    evidence: s1Evidence,
    status: s1Override?.status ?? "accepted",
    byFiscalYear: s1Amounts,
    byMonth: monthly ? (s1TiesToPnl ? categoryMonths(monthly, "owner_comp") : monthsForRow(monthly, years, s1Amounts, categoryMonths(monthly, "owner_comp"), stubRuleFor(s1Override!))) : undefined,
    origin: "owner_comp",
    sourceFile: s1Override?.sourceFile ?? pnlFile,
  });

  // [S2] is one Assumptions input (salary × (1 + burden)) applied to every year, so an advisor's [S2] row sets that input
  // from its latest year and the schedule carries the same flat amount the engine recomputes.
  const s2Latest = s2Override ? Math.abs(s2Override.byFiscalYear[firstNonZeroYear(s2Override.byFiscalYear, years)] ?? 0) : undefined;
  const replacementSalary = s2Latest !== undefined ? { amount: s2Latest / (1 + ctx.burden.pct), source: `${s2Override!.sourceFile} [S2] row (${money(s2Latest)} a year including the ${Math.round(ctx.burden.pct * 100)}% burden)` } : ctx.replacementSalary;
  const replacementCost = replacementSalary.amount * (1 + ctx.burden.pct);
  if (s2Override && years.some((y) => Math.abs(Math.abs(s2Override!.byFiscalYear[y] ?? 0) - s2Latest!) >= 1)) {
    warnings.push(`[S2] in ${s2Override.sourceFile} varies by year; the model applies ${money(replacementCost)} (its latest year) to every year, because the replacement salary is one Assumptions input.`);
  }
  rows.push({
    tier: "owner_compensation",
    description: "Market replacement compensation",
    category: "replacement_cost",
    basis: s2Override?.basis ?? `Deducts a general manager at the $${Math.round(replacementSalary.amount).toLocaleString("en-US")} market salary, plus payroll taxes and benefits at ${Math.round(ctx.burden.pct * 100)}% of salary, $${Math.round(replacementCost).toLocaleString("en-US")} a year.`,
    sourceDocument: s2Override?.sourceDocument ?? `${replacementSalary.source}; ${ctx.burden.source}`,
    evidence: s2Override?.evidence ?? "management_representation",
    status: s2Override?.status ?? "accepted",
    byFiscalYear: Object.fromEntries(years.map((y) => [y, -replacementCost])),
    byMonth: monthly ? flatMonths(monthly, -replacementCost) : undefined,
    origin: "replacement_salary",
    sourceFile: s2Override?.sourceFile,
  });

  // The employer taxes and benefits on the owner's pay sit in the P&L payroll line, but SDE adds back one working owner's total
  // compensation (guide 5.4: salary, payroll taxes, benefits), so they are a second owner-compensation row. It follows [S3] so
  // the fixed refs [S1]–[S3] hold and sums into the [S1] rung. It is accepted whenever [S1] is documented: the taxes follow
  // from that salary at statutory rates, and leaving them out while [S2] deducts a burdened replacement would understate
  // SDE and Adj. EBITDA by the same amount. An [S1] that is not documented leaves it proposed with [S1].
  const ownerTaxes: Record<number, number> = s1TaxesOverride?.byFiscalYear ?? ctx.ownerEmployerCosts?.byFiscalYear ?? Object.fromEntries(years.map((y) => [y, employerPayrollTaxes(s1Amounts[y] ?? 0, y)]));
  const ownerTaxesByYear = Object.fromEntries(years.map((y) => [y, ownerTaxes[y] ?? 0]));
  let ownerTaxRow: Omit<Adjustment, "ref"> | undefined;
  if (years.some((y) => ownerTaxesByYear[y])) {
    const fromRegister = !s1TaxesOverride && ctx.ownerEmployerCosts;
    const ownerAccounts = [...new Set(ctx.lines.filter((l) => l.statement === "pnl" && l.category === "owner_comp").map((l) => l.account))];
    const wageBase = socialSecurityWageBase(latest);
    ownerTaxRow = {
      tier: "owner_compensation",
      description: "Payroll taxes and benefits on owner compensation",
      category: "owner_compensation",
      basis:
        s1TaxesOverride?.basis ??
        (fromRegister
          ? `Adds back the employer taxes and benefits on ${ownerLabel}'s pay that the payroll register records, ${money(ownerTaxesByYear[latest] ?? 0)} in FY${latest}; the P&L carries them in the payroll line.`
          : `Adds back employer payroll taxes on ${ownerLabel}'s salary at statutory rates, ${money(ownerTaxesByYear[latest] ?? 0)} in FY${latest} (Social Security to the $${wageBase.toLocaleString("en-US")} wage base, Medicare, federal unemployment); the P&L carries them in payroll. Owner benefits and state unemployment are not included.`),
      sourceDocument: s1TaxesOverride?.sourceDocument ?? (fromRegister ? `Payroll register (${ctx.ownerEmployerCosts!.file})` : `Statutory rates on the P&L ${accountName("owner_comp")} account; payroll register employer detail to be requested`),
      evidence: s1TaxesOverride?.evidence ?? (fromRegister ? "documented" : "pending"),
      status: s1TaxesOverride?.status ?? (s1Evidence === "documented" ? "accepted" : "proposed"),
      byFiscalYear: ownerTaxesByYear,
      ...(monthly
        ? { byMonth: monthsForRow(monthly, years, ownerTaxesByYear, categoryMonths(monthly, "owner_comp"), stubRuleFor({ category: "owner_compensation", stubAmount: s1TaxesOverride?.stubAmount })), ...(ownerAccounts.length === 1 ? { accounts: ownerAccounts } : {}) }
        : {}),
      origin: "suggested",
      sourceFile: s1TaxesOverride?.sourceFile ?? pnlFile,
      ...(s1TaxesOverride || fromRegister ? {} : { statutoryTaxesOn: "S1" }),
    };
  }

  // Pro forma rows: annual run-rate amounts, applied in full to the PF column (never spread over months).
  for (const r of pfRows) {
    rows.push(toAdjustment(r, { basis: `${r.pfMethod ?? "Run-rate"}: ${r.description}.`, sourceDocument: `Adjustments schedule (${r.sourceFile})` }));
  }

  // Main Street mode: PF Adj. EBITDA before the capital reserve (guide Q7), by the engine's own PF-column rule
  // (pfColumnAmount), so the mode, run-summary and the headline read one number.
  const windowMonths = monthly ? ltmWindow(monthly, monthly.months[monthly.months.length - 1]!.key) : undefined;
  const windowPnl = windowMonths && monthly ? sumMonths(monthly, windowMonths) : pnl[latest]!;
  const reported = windowPnl.revenue - windowPnl.cogs - windowPnl.payroll - windowPnl.owner_comp - windowPnl.rent - windowPnl.marketing - windowPnl.other_opex + windowPnl.other_income - windowPnl.other_expense;
  const firstMonth = monthly?.months[0];
  const fye = firstMonth ? (firstMonth.month - firstMonth.fiscalMonth + 12) % 12 || 12 : 12;
  const measured = [...rows, ...(ownerTaxRow ? [ownerTaxRow] : [])].filter((a) => a.status === "accepted" && a.tier !== "definitional" && a.tier !== "memo");
  const measure = reported + measured.reduce((s, a) => s + (pfColumnAmount(a, windowMonths, latest, fye) ?? 0), 0);
  if (!windowMonths && measured.some((a) => a.tier === "pro_forma" && a.byFiscalYear[latest])) {
    warnings.push("Accepted pro forma rows are not applied in annual-only mode (there is no PF column; the Low / Mid / High scenarios restate the lines instead), so they do not count toward the Main Street test.");
  }
  const measureLabel = windowMonths ? periodLabel({ kind: "pf", end: windowMonths[windowMonths.length - 1]! }) : `FY${latest}`;
  const mode = decideMode(measure, measureLabel);

  // Capital reserve: Form 4562 equipment when a return gave it, else the three-year average of D&A as a proxy.
  const equipmentYears = years.filter((y) => ctx.equipmentPlacedInService?.[y] !== undefined);
  const daYears = years.filter((y) => (pnl[y]?.depreciation_amortization ?? 0) > 0);
  const daSpan = fyRange(daYears);
  const capitalReserve: RecastInputs["capitalReserve"] = s3Override
    ? { amount: Math.abs(s3Override.byFiscalYear[firstNonZeroYear(s3Override.byFiscalYear, years)] ?? 0), basis: "advisor", source: `${s3Override.sourceFile}: ${s3Override.sourceDocument ?? s3Override.description}` }
    : equipmentYears.length
      ? { amount: equipmentYears.reduce((s, y) => s + ctx.equipmentPlacedInService![y]!, 0) / equipmentYears.length, basis: "form_4562", source: `Form 4562, FY${equipmentYears[0]}–FY${equipmentYears[equipmentYears.length - 1]}` }
      : { amount: daYears.length ? daYears.reduce((s, y) => s + pnl[y]!.depreciation_amortization, 0) / daYears.length : 0, basis: "da_proxy", source: daYears.length ? depreciationProxySource(daYears) : "No depreciation expense in the sources" };
  // [S3] is always on the schedule so the ladder and the workbook keep one row per rung; outside Main Street mode it is zero,
  // and the Assumptions MainStreetMode switch turns the reserve back on without a new row.
  const mainStreet = mode.mode === "mainStreet";
  if (mainStreet && capitalReserve.basis === "da_proxy") warnings.push(`[S3] capital reserve is a proxy (${capitalReserve.source}) because no Form 4562 is in the sources. Request Form 4562 to replace it.`);
  const reserve = mainStreet ? capitalReserve.amount : 0;
  // Like [S2], the reserve is one Assumptions input applied to every year.
  if (mainStreet && s3Override && years.some((y) => Math.abs(Math.abs(s3Override!.byFiscalYear[y] ?? 0) - reserve) >= 1)) {
    warnings.push(`[S3] in ${s3Override.sourceFile} varies by year; the model applies ${money(reserve)} (its latest year) to every year, because the capital reserve is one Assumptions input.`);
  }
  const s3PerYear = reserve ? -reserve : 0;
  const s3Amounts = Object.fromEntries(years.map((y) => [y, s3PerYear]));
  rows.push({
    tier: "owner_compensation",
    description: "Capital reserve (maintenance capex)",
    category: "capital_reserve",
    basis: !mainStreet
      ? "Zero outside Main Street mode: a lower-middle-market buyer underwrites capital expenditure separately (set MainStreetMode on Assumptions to apply it)."
      : (s3Override?.basis ??
        `Deducts a reserve for equipment replacement of $${Math.round(capitalReserve.amount).toLocaleString("en-US")} a year, equal to the ${capitalReserve.basis === "form_4562" ? `${equipmentYears.length === 1 ? "" : "average "}equipment cost placed in service per Form 4562, ${fyRange(equipmentYears)}` : `${capitalReserve.source.charAt(0).toLowerCase()}${capitalReserve.source.slice(1)}`}.`),
    sourceDocument: s3Override?.sourceDocument ?? (capitalReserve.basis === "form_4562" ? capitalReserve.source : `P&L, account ${accountName("depreciation_amortization")}${daSpan ? `, ${daSpan}` : ""}`),
    evidence: s3Override?.evidence ?? "documented",
    status: s3Override?.status ?? "accepted",
    byFiscalYear: s3Amounts,
    byMonth: monthly ? flatMonths(monthly, s3PerYear) : undefined,
    origin: "capital_reserve",
    sourceFile: s3Override?.sourceFile,
  });
  // After [S3], so the fixed refs [S1]–[S3] hold and this row is [S4].
  if (ownerTaxRow) rows.push(ownerTaxRow);

  // Memo rows: listed, never added.
  for (const r of memoRows) {
    rows.push(toAdjustment(r, { basis: `${r.description}; not included in any figure above.`, sourceDocument: `Adjustments schedule (${r.sourceFile})` }));
  }

  const dealForm: DealFormDecision =
    ctx.dealFormPreference === "asset"
      ? { form: "asset_purchase", basis: `Intake notes: the owner prefers an asset sale${mode.mode === "mainStreet" ? "; the Main Street default agrees" : " (the LMM default would be an equity purchase)"}` }
      : ctx.dealFormPreference === "equity"
        ? { form: "equity_purchase", basis: `Intake notes: the owner prefers an equity sale${mode.mode === "lowerMiddleMarket" ? "; the LMM default agrees" : " (the Main Street default would be an asset purchase)"}` }
        : { form: mode.mode === "mainStreet" ? "asset_purchase" : "equity_purchase", basis: "default_from_mode" };

  // Tier order is fixed; rows within a tier keep the order they were found in.
  const tierRank = (t: AdjustmentTier) => ADJUSTMENT_TIERS.indexOf(t);
  const ordered = rows.map((r, i) => ({ r, i })).sort((a, b) => tierRank(a.r.tier) - tierRank(b.r.tier) || a.i - b.i).map((x) => x.r);

  return {
    adjustments: numberAdjustments(ordered),
    recastInputs: {
      replacementSalary: replacementSalary.amount,
      replacementSalarySource: replacementSalary.source,
      burdenPct: ctx.burden.pct,
      burdenSource: ctx.burden.source,
      capitalReserve,
      owners: [{ name: ctx.owner?.name || "Owner (not named in the sources)", role: ctx.owner?.role || "Owner", compensationByFiscalYear: s1Amounts }],
    },
    mode,
    dealForm,
    warnings,
  };
}

/** The last twelve grid months ending at `end`, for callers naming the window. */
export function trailingMonths(end: MonthKey, n = 12): MonthKey[] {
  const out: MonthKey[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(end, -i));
  return out;
}

/** A month key for a fiscal year's last month. */
export function fiscalYearEndMonth(fy: number, fyEndMonth: number): MonthKey {
  return monthKey(fy, fyEndMonth);
}

/** The [S3] proxy's source line: "FY2025 depreciation expense" for one year, "Two-year average of depreciation expense, FY2024–FY2025" for two. */
export function depreciationProxySource(years: number[]): string {
  if (years.length === 1) return `FY${years[0]} depreciation expense`;
  const count = ["", "", "Two", "Three", "Four", "Five"][years.length] ?? String(years.length);
  return `${count}-year average of depreciation expense, FY${years[0]}–FY${years[years.length - 1]}`;
}
