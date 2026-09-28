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
  numberAdjustments,
  periodLabel,
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
import { parseAmount, readCsvRecords } from "../util/tables.ts";

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
    const m = /^(?:fy_?|amount_?|)((?:19|20)\d{2})$/.exec(key);
    if (m) out.set(Number(m[1]), key);
  }
  return out;
}

/**
 * Read adjustments.csv. Definitional rows are derived from the P&L and
 * never read from the file; an S-tier row is only the owner's pay, the
 * replacement cost or the capital reserve (which override the defaults),
 * and any other owner perk is listed in the N tier so [S1]–[S3] keep their
 * refs. The `ref` column, if present, is ignored: refs are numbered here.
 */
export function loadAdjustmentsCsv(file: string, years: number[]): { rows: ScheduleRow[]; warnings: string[] } {
  const name = path.basename(file);
  const rows: ScheduleRow[] = [];
  const warnings: string[] = [];
  readCsvRecords(file).forEach((r, i) => {
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
    const cols = yearColumns(r);
    for (const y of years) {
      const col = cols.get(y);
      byFiscalYear[y] = (col && parseAmount(r[col])) || 0;
    }
    for (const [y, col] of cols) {
      if (!years.includes(y) && parseAmount(r[col])) warnings.push(`${name} line ${line} ("${description}"): FY${y} is not in the model; that amount is ignored.`);
    }
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
 * The seller's flat addbacks.csv as schedule rows, accepted as listed (the
 * list was applied as-is before the schedule existed; the status column of
 * adjustments.csv is the way to hold a row back).
 */
export function legacyAddbacksToRows(addbacks: Addback[], years: number[]): ScheduleRow[] {
  const byDescription = new Map<string, ScheduleRow>();
  for (const a of addbacks) {
    if (!years.includes(a.year)) continue;
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
    row.byFiscalYear[a.year] = (row.byFiscalYear[a.year] ?? 0) + a.amount;
  }
  return [...byDescription.values()];
}

// --- Building the schedule ---------------------------------------------------

export interface ScheduleContext {
  years: number[];
  pnl: Record<number, Record<IsCategory, number>>;
  fyEndMonth: number;
  monthly?: MonthlyPnl;
  lines: MappedLine[];
  suggested: SuggestedAddback[];
  /** Rows from adjustments.csv or the legacy list, in file order. */
  fileRows: ScheduleRow[];
  replacementSalary: { amount: number; source: string };
  burden: { pct: number; source: string };
  /** Form 4562 equipment placed in service per fiscal year, when a tax return gave it. */
  equipmentPlacedInService?: Record<number, number>;
  owner?: { name: string; role: string };
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

/** Split an amount over months in proportion to weights, to the cent, the residual on the largest weight. */
export function splitByWeights(total: number, weights: Record<MonthKey, number>): Record<MonthKey, number> {
  const keys = Object.keys(weights).sort();
  const out: Record<MonthKey, number> = {};
  const wsum = keys.reduce((s, k) => s + Math.abs(weights[k]!), 0);
  if (!keys.length) return out;
  let allocated = 0;
  let largest = keys[0]!;
  for (const k of keys) {
    const w = Math.abs(weights[k]!);
    const v = wsum ? Math.round((total * w) / wsum * 100) / 100 : Math.round((total / keys.length) * 100) / 100;
    out[k] = v;
    allocated += v;
    if (w > Math.abs(weights[largest]!)) largest = k;
  }
  out[largest] = Math.round((out[largest]! + (total - allocated)) * 100) / 100;
  return out;
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

function accountMonths(monthly: MonthlyPnl, account: string, sign = 1): Record<MonthKey, number> | undefined {
  const key = normaliseAccount(account);
  const lines = monthly.lines.filter((l) => normaliseAccount(l.account) === key || normaliseAccount(l.account.split(" : ").pop()!) === key);
  if (!lines.length) return undefined;
  const out: Record<MonthKey, number> = {};
  for (const m of monthly.months) out[m.key] = sign * lines.reduce((s, l) => s + (l.amounts[m.key] ?? 0), 0);
  return out;
}

/** Tie a row's fiscal-year amounts to the months of the account it comes out of, year by year. */
function monthsForRow(monthly: MonthlyPnl, years: number[], byFiscalYear: Record<number, number>, weights: Record<MonthKey, number>): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  for (const fy of years) {
    const months = fiscalYearMonths(monthly, fy);
    if (months.length < 12) continue;
    const w: Record<MonthKey, number> = {};
    for (const m of months) w[m] = weights[m] ?? 0;
    Object.assign(out, splitByWeights(byFiscalYear[fy] ?? 0, w));
  }
  // Months outside the full years (a YTD stub) keep the account's own proportion of the latest year's amount.
  const latest = years[years.length - 1];
  if (latest !== undefined) {
    const ref = fiscalYearMonths(monthly, latest);
    const refWeight = ref.reduce((s, m) => s + Math.abs(weights[m] ?? 0), 0);
    const refAmount = byFiscalYear[latest] ?? 0;
    for (const m of monthly.months) {
      if (m.key in out) continue;
      out[m.key] = refWeight ? Math.round(((refAmount * Math.abs(weights[m.key] ?? 0)) / refWeight) * 100) / 100 : 0;
    }
  }
  return out;
}

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
  const { years, pnl, fyEndMonth, monthly } = ctx;
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
  let s2Override: ScheduleRow | undefined;
  let s3Override: ScheduleRow | undefined;
  const pfRows: ScheduleRow[] = [];
  const memoRows: ScheduleRow[] = [];
  const nRows: ScheduleRow[] = [];
  for (const r of ctx.fileRows) {
    if (r.tier === "owner_compensation") {
      if (r.category === "owner_compensation") s1Override = r;
      else if (r.category === "replacement_cost") s2Override = r;
      else s3Override = r;
    } else if (r.tier === "pro_forma") pfRows.push(r);
    else if (r.tier === "memo") memoRows.push(r);
    else nRows.push(r);
  }
  const toAdjustment = (r: ScheduleRow, defaults: { basis: string; sourceDocument: string }, byMonth?: Record<MonthKey, number>): Omit<Adjustment, "ref"> => ({
    tier: r.tier,
    description: r.description,
    category: r.category,
    basis: r.basis ?? defaults.basis,
    sourceDocument: r.sourceDocument ?? defaults.sourceDocument,
    evidence: r.evidence,
    status: r.status,
    byFiscalYear: r.byFiscalYear,
    byMonth,
    pnlLine: r.pnlLine,
    pfMethod: r.pfMethod,
    origin: r.origin,
    sourceFile: r.sourceFile,
  });
  const fileRowMonths = (r: ScheduleRow): Record<MonthKey, number> | undefined => {
    if (!monthly) return undefined;
    const weights = r.account ? accountMonths(monthly, r.account) : undefined;
    if (r.account && !weights) warnings.push(`Adjustment "${r.description}" names account "${r.account}", which is not on the monthly P&L; YTD and LTM amounts are prorated instead.`);
    return weights ? monthsForRow(monthly, years, r.byFiscalYear, weights) : undefined;
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
        description: `${leaf} (non-operating)`,
        category: "non_operating",
        basis: `${sign < 0 ? "Removes" : "Adds back"} ${leaf.toLowerCase()}, ${money(byFiscalYear[latest] ?? 0)} in FY${latest}, which is non-operating ${label}, per the P&L ${account} account.`,
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
    rows.push({
      tier: "normalization",
      description: `${account.split(" : ").pop()!} (bot-flagged)`,
      category: "personal_discretionary",
      basis: `Bot-flagged for review: ${s.reason}${listed ? ` beyond the ${money(listed.byFiscalYear[latest] ?? 0)} already listed` : ""}. Account total ${money(amounts[latest] ?? 0)} in FY${latest}. Amount 0 until an advisor enters it.`,
      sourceDocument: `P&L account ${account}`,
      evidence: "management_representation",
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
  const ownerLabel = ctx.owner ? `${ctx.owner.name}` : "the owner";
  rows.push({
    tier: "owner_compensation",
    description: "Owner compensation",
    category: "owner_compensation",
    basis: s1Override?.basis ?? (s1Amounts[latest] ? `Adds back ${ownerLabel}'s compensation as paid, ${money(s1Amounts[latest] ?? 0)} in FY${latest}, per the P&L ${accountName("owner_comp")} account.` : "None: no owner compensation is expensed on the P&L (a sole proprietor's draw is not an expense), so SDE equals Reported EBITDA plus normalization adjustments."),
    sourceDocument: s1Override?.sourceDocument ?? `P&L, account ${accountName("owner_comp")}`,
    evidence: s1Override?.evidence ?? "documented",
    status: s1Override?.status ?? "accepted",
    byFiscalYear: s1Amounts,
    byMonth: monthly ? (s1TiesToPnl ? categoryMonths(monthly, "owner_comp") : monthsForRow(monthly, years, s1Amounts, categoryMonths(monthly, "owner_comp"))) : undefined,
    origin: "owner_comp",
    sourceFile: s1Override?.sourceFile ?? pnlFile,
  });

  const replacementCost = ctx.replacementSalary.amount * (1 + ctx.burden.pct);
  const s2Amounts = s2Override?.byFiscalYear ?? Object.fromEntries(years.map((y) => [y, -replacementCost]));
  if (s2Override) warnings.push(`[S2] market replacement compensation comes from ${s2Override.sourceFile} rather than the request row salary × (1 + burden); Assumptions must carry the same figure.`);
  rows.push({
    tier: "owner_compensation",
    description: "Market replacement compensation",
    category: "replacement_cost",
    basis: s2Override?.basis ?? `Deducts a general manager at the $${ctx.replacementSalary.amount.toLocaleString("en-US")} market salary, plus payroll taxes and benefits of ${Math.round(ctx.burden.pct * 100)}% (AMB default), $${Math.round(replacementCost).toLocaleString("en-US")} a year.`,
    sourceDocument: s2Override?.sourceDocument ?? `${ctx.replacementSalary.source}; ${ctx.burden.source}`,
    evidence: s2Override?.evidence ?? "management_representation",
    status: s2Override?.status ?? "accepted",
    byFiscalYear: s2Amounts,
    byMonth: monthly ? (s2Override ? monthsForRow(monthly, years, s2Amounts, flatMonths(monthly, 1)) : flatMonths(monthly, -replacementCost)) : undefined,
    origin: "replacement_salary",
    sourceFile: s2Override?.sourceFile,
  });

  // Pro forma rows.
  for (const r of pfRows) {
    rows.push(toAdjustment(r, { basis: `${r.pfMethod ?? "Run-rate"}: ${r.description}.`, sourceDocument: `Adjustments schedule (${r.sourceFile})` }, fileRowMonths(r)));
  }

  // Main Street mode: PF Adj. EBITDA before the capital reserve, on the latest full window (guide Q7).
  const windowMonths = monthly ? ltmWindow(monthly, monthly.months[monthly.months.length - 1]!.key) : undefined;
  const windowPnl = windowMonths && monthly ? sumMonths(monthly, windowMonths) : pnl[latest]!;
  const reported = windowPnl.revenue - windowPnl.cogs - windowPnl.payroll - windowPnl.owner_comp - windowPnl.rent - windowPnl.marketing - windowPnl.other_opex + windowPnl.other_income - windowPnl.other_expense;
  const inWindow = (a: Omit<Adjustment, "ref">): number => {
    if (!windowMonths) return a.byFiscalYear[latest] ?? 0;
    if (a.byMonth) return windowMonths.reduce((s, m) => s + (a.byMonth![m] ?? 0), 0);
    // Rows without months: prorate by fiscal year, the same rule the engine applies.
    let total = 0;
    for (const m of windowMonths) {
      const fy = monthly!.months.find((p) => p.key === m)!.fiscalYear;
      total += (a.byFiscalYear[fy] ?? 0) / 12;
    }
    return total;
  };
  const acceptedIn = (tier: AdjustmentTier) => rows.filter((a) => a.tier === tier && a.status === "accepted").reduce((s, a) => s + inWindow(a), 0);
  const measure = reported + acceptedIn("normalization") + acceptedIn("owner_compensation") + acceptedIn("pro_forma");
  const measureLabel = windowMonths ? periodLabel({ kind: "pf", end: windowMonths[windowMonths.length - 1]! }) : `FY${latest}`;
  const mode = decideMode(measure, measureLabel);

  // Capital reserve: Form 4562 equipment when a return gave it, else the three-year average of D&A as a proxy.
  const equipmentYears = years.filter((y) => ctx.equipmentPlacedInService?.[y] !== undefined);
  const daYears = years.filter((y) => (pnl[y]?.depreciation_amortization ?? 0) > 0);
  const capitalReserve: RecastInputs["capitalReserve"] = s3Override
    ? { amount: Math.abs(s3Override.byFiscalYear[latest] ?? 0), basis: "advisor", source: `${s3Override.sourceFile}: ${s3Override.sourceDocument ?? s3Override.description}` }
    : equipmentYears.length
      ? { amount: equipmentYears.reduce((s, y) => s + ctx.equipmentPlacedInService![y]!, 0) / equipmentYears.length, basis: "form_4562", source: `Form 4562, FY${equipmentYears[0]}–FY${equipmentYears[equipmentYears.length - 1]}` }
      : { amount: daYears.length ? daYears.reduce((s, y) => s + pnl[y]!.depreciation_amortization, 0) / daYears.length : 0, basis: "da_proxy", source: `${daYears.length ? `${daYears.length}-year` : "No"} average of depreciation expense${daYears.length ? ` FY${daYears[0]}–FY${daYears[daYears.length - 1]}` : ""}; proxy because no Form 4562 is in the sources` };
  if (mode.mode === "mainStreet") {
    if (capitalReserve.basis === "da_proxy") warnings.push(`[S3] capital reserve uses the ${capitalReserve.source.toLowerCase()}. Request Form 4562 to replace the proxy.`);
    const s3Amounts = s3Override?.byFiscalYear ?? Object.fromEntries(years.map((y) => [y, -capitalReserve.amount]));
    rows.push({
      tier: "owner_compensation",
      description: "Capital reserve (maintenance capex)",
      category: "capital_reserve",
      basis: s3Override?.basis ?? `Deducts a reserve for equipment replacement of $${Math.round(capitalReserve.amount).toLocaleString("en-US")} a year, ${capitalReserve.basis === "form_4562" ? "the three-year average equipment cost placed in service per Form 4562" : "the three-year average of depreciation expense used as a proxy because no Form 4562 is in the sources"}.`,
      sourceDocument: s3Override?.sourceDocument ?? (capitalReserve.basis === "form_4562" ? capitalReserve.source : `P&L, account ${accountName("depreciation_amortization")} FY${years[0]}–FY${latest} (proxy; Form 4562 requested)`),
      evidence: s3Override?.evidence ?? "documented",
      status: s3Override?.status ?? "accepted",
      byFiscalYear: s3Amounts,
      byMonth: monthly ? (s3Override ? monthsForRow(monthly, years, s3Amounts, flatMonths(monthly, 1)) : flatMonths(monthly, -capitalReserve.amount)) : undefined,
      origin: "capital_reserve",
      sourceFile: s3Override?.sourceFile,
    });
  }

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
      replacementSalary: ctx.replacementSalary.amount,
      replacementSalarySource: ctx.replacementSalary.source,
      burdenPct: ctx.burden.pct,
      burdenSource: ctx.burden.source,
      capitalReserve,
      owners: [{ name: ctx.owner?.name ?? "Owner (not named in the sources)", role: ctx.owner?.role ?? "Owner", compensationByFiscalYear: s1Amounts }],
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
