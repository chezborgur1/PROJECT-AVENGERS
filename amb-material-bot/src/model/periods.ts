// The period layout of guide 5.2 and the arithmetic of DATA_CONTRACT.md
// section 5, in TypeScript: which columns exist, the P&L of each window, the
// adjustments schedule per column and the 5.4 ladder. The workbook writes the
// same arithmetic as formulas; verifyWorkbook proves the two agree.

import {
  ADJUSTMENT_TIERS,
  IS_CATEGORIES,
  addMonths,
  adjustmentInWindow,
  decideMode,
  emptyPnl,
  fiscalYearOf,
  ltmWindow,
  monthPeriod,
  monthRange,
  numberAdjustments,
  parseMonthKey,
  periodKey,
  pfColumnAmount,
  periodLabel,
  sumMonths,
  ytdWindow,
  type Adjustment,
  type AdjustmentTier,
  type FinancialDataset,
  type IsCategory,
  type ModeDecision,
  type MonthKey,
  type MonthPeriod,
  type MonthlyPnl,
} from "../domain/financials.ts";
import type { Assumptions } from "./assumptions.ts";
import type { Ladder, LadderItem, MonthlySeries, PeriodColumn, PnlLines } from "./types.ts";

// --- Dates ---------------------------------------------------------------------

/** Excel serial number of a "YYYY-MM-DD" date (days since 1899-12-30), the value date cells hold. */
export function excelSerial(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

export function firstDayOf(month: MonthKey): string {
  return `${month}-01`;
}

/** Fiscal year end month key for fiscal year `fy` with year-end month `fye`. */
export function fiscalYearEndKey(fy: number, fye: number): MonthKey {
  return `${fy}-${String(fye).padStart(2, "0")}`;
}

export function fiscalYearMonths(fy: number, fye: number): MonthKey[] {
  const end = fiscalYearEndKey(fy, fye);
  return monthRange(addMonths(end, -11), end);
}

/** Latest fiscal year fully closed at `asOfMonth`. */
export function latestFullFiscalYear(asOfMonth: MonthKey, fye: number): number {
  const p = monthPeriod(asOfMonth, fye);
  return p.fiscalMonth === 12 ? p.fiscalYear : p.fiscalYear - 1;
}

// --- Columns -------------------------------------------------------------------

function column(ref: PeriodColumn["ref"], group: PeriodColumn["group"], start: MonthKey, end: MonthKey, extra: Partial<PeriodColumn> = {}): PeriodColumn {
  const key = periodKey(ref);
  return {
    key,
    ref,
    group,
    label: extra.label ?? periodLabel(ref),
    start,
    end,
    months: monthRange(start, end).length,
    priorYear: false,
    projected: false,
    ...extra,
  };
}

/**
 * The columns of guide 5.2 that exist for this dataset (DATA_CONTRACT §4):
 * up to three fiscal years, the YTD and LTM pairs when the monthly grid
 * covers them, PF when LTM does, then the projection years.
 */
export function buildColumns(ds: FinancialDataset, a: Assumptions): PeriodColumn[] {
  const fye = a.fiscalYearEndMonth;
  const fiscalYears = ds.years.slice(-3);
  const cols: PeriodColumn[] = fiscalYears.map((fy) => {
    const end = fiscalYearEndKey(fy, fye);
    return column({ kind: "fiscal_year", fiscalYear: fy }, "Full Year", addMonths(end, -11), end, { fiscalYear: fy });
  });

  const grid = ds.monthly;
  if (grid && a.sourceGranularity === "monthly") {
    const asOf = a.asOfMonth;
    const prior = addMonths(asOf, -12);
    const ytdCy = ytdWindow(grid, asOf, fye);
    const ytdPy = ytdWindow(grid, prior, fye);
    if (ytdCy && ytdPy) {
      cols.push(column({ kind: "ytd", end: prior }, "YTD", ytdPy[0]!, prior, { priorYear: true }));
      cols.push(column({ kind: "ytd", end: asOf }, "YTD", ytdCy[0]!, asOf));
    }
    const ltmCy = ltmWindow(grid, asOf);
    const ltmPy = ltmWindow(grid, prior);
    if (ltmCy) {
      if (ltmPy) cols.push(column({ kind: "ltm", end: prior }, "LTM", ltmPy[0]!, prior, { priorYear: true }));
      cols.push(column({ kind: "ltm", end: asOf }, "LTM", ltmCy[0]!, asOf));
      cols.push(column({ kind: "pf", end: asOf }, "PF", ltmCy[0]!, asOf));
    }
  }

  for (const fy of a.projectionYears) {
    const end = fiscalYearEndKey(fy, fye);
    cols.push(column({ kind: "fiscal_year", fiscalYear: fy }, "Projection", addMonths(end, -11), end, { fiscalYear: fy, projected: true, label: `FY${fy}E` }));
  }
  return cols;
}

/** Months of a column's window, in order. */
export function windowMonths(c: PeriodColumn): MonthKey[] {
  return monthRange(c.start, c.end);
}

/** A line's amount over a window: exact from its months when it has them, else its fiscal-year amounts prorated by months (DATA_CONTRACT §5.3). */
export function amountInWindow(line: { byMonth?: Record<MonthKey, number>; byFiscalYear: Record<number, number> }, months: MonthKey[], fye: number): number {
  if (line.byMonth) return months.reduce((s, m) => s + (line.byMonth![m] ?? 0), 0);
  const perYear = new Map<number, number>();
  for (const m of months) {
    const { year, month } = parseMonthKey(m);
    const fy = fiscalYearOf(year, month, fye);
    perYear.set(fy, (perYear.get(fy) ?? 0) + 1);
  }
  let total = 0;
  for (const [fy, n] of perYear) total += ((line.byFiscalYear[fy] ?? 0) * n) / 12;
  return total;
}

// --- P&L lines -----------------------------------------------------------------

/** The DATA_CONTRACT §5.2 identities on a category map. */
export function pnlLinesFrom(p: Record<IsCategory, number>): PnlLines {
  const grossProfit = p.revenue - p.cogs;
  const totalOpex = p.payroll + p.owner_comp + p.rent + p.marketing + p.other_opex;
  const otherItemsNet = p.other_income - p.other_expense;
  const ebitda = grossProfit - totalOpex + otherItemsNet;
  const ebit = ebitda - p.depreciation_amortization;
  const ebt = ebit - p.interest_expense;
  return {
    revenue: p.revenue,
    cogs: p.cogs,
    grossProfit,
    payroll: p.payroll,
    ownerComp: p.owner_comp,
    rent: p.rent,
    marketing: p.marketing,
    otherOpex: p.other_opex,
    totalOpex,
    otherItemsNet,
    ebitda,
    da: p.depreciation_amortization,
    ebit,
    interest: p.interest_expense,
    otherIncome: p.other_income,
    otherExpense: p.other_expense,
    ebt,
    tax: p.income_tax,
    netIncome: ebt - p.income_tax,
  };
}

/** True when every month of the window is on the grid. */
export function gridCovers(grid: MonthlyPnl | undefined, months: MonthKey[]): boolean {
  if (!grid) return false;
  const first = grid.months[0]?.key;
  const last = grid.months[grid.months.length - 1]?.key;
  return !!first && !!last && months[0]! >= first && months[months.length - 1]! <= last;
}

/** Category map of a historical column: the grid when it covers the window, else the annual map. */
export function categoryTotals(ds: FinancialDataset, c: PeriodColumn): Record<IsCategory, number> {
  const months = windowMonths(c);
  if (gridCovers(ds.monthly, months)) return sumMonths(ds.monthly!, months);
  if (c.ref.kind === "fiscal_year" && ds.pnl[c.ref.fiscalYear]) return { ...ds.pnl[c.ref.fiscalYear]! };
  return emptyPnl();
}

// --- Schedule --------------------------------------------------------------------

/**
 * The adjustments schedule the engine computes on. The dataset's rows are
 * used as they come, except that [S2] and [S3] are recomputed from the
 * Assumptions inputs (DATA_CONTRACT §2.4): at default settings the two agree.
 * A legacy dataset without a schedule gets one derived from its P&L,
 * add-backs and flagged accounts, in the tier order guide 5.3 prescribes.
 */
export function scheduleFor(ds: FinancialDataset, a: Assumptions): Adjustment[] {
  const rows = ds.adjustments ? ds.adjustments.map((r) => ({ ...r })) : deriveSchedule(ds, a);
  const fye = a.fiscalYearEndMonth;
  // Every month a window can reach: the full fiscal years and every grid month, including a
  // partial current year (the YTD stub) that `years` leaves out. The workbook's month cells
  // carry the same amount in every grid month.
  const months = [...new Set([...ds.years.flatMap((fy) => fiscalYearMonths(fy, fye)), ...(ds.monthly?.months.map((m) => m.key) ?? [])])].sort();
  const flat = (perYear: number): Record<MonthKey, number> => Object.fromEntries(months.map((m) => [m, perYear / 12]));
  const replacementCost = a.recast.replacementSalary * (1 + a.recast.burdenPct);
  const reserve = a.recast.mainStreetMode ? a.recast.capitalReserve : 0;
  for (const r of rows) {
    if (r.origin === "replacement_salary") {
      r.byFiscalYear = Object.fromEntries(ds.years.map((y) => [y, -replacementCost]));
      r.byMonth = flat(-replacementCost);
    }
    if (r.origin === "capital_reserve") {
      r.byFiscalYear = Object.fromEntries(ds.years.map((y) => [y, -reserve]));
      r.byMonth = flat(-reserve);
    }
  }
  return rows;
}

function deriveSchedule(ds: FinancialDataset, a: Assumptions): Adjustment[] {
  const years = ds.years;
  const byYear = (f: (y: number) => number): Record<number, number> => Object.fromEntries(years.map((y) => [y, f(y)]));
  const monthsOf = (cat: IsCategory, sign: 1 | -1): Record<MonthKey, number> | undefined =>
    ds.monthly ? Object.fromEntries(ds.monthly.months.map((m) => [m.key, sign * ds.monthly!.values[m.key]![cat]])) : undefined;
  const pnlFile = ds.provenance[0] ? `${ds.provenance[0].pnl}` : "P&L";
  const rows: Omit<Adjustment, "ref">[] = [];
  const definitional: [IsCategory, Adjustment["category"], string][] = [
    ["interest_expense", "interest", "Interest expense"],
    ["income_tax", "taxes", "Income taxes"],
    ["depreciation_amortization", "da", "Depreciation and amortization"],
  ];
  for (const [cat, category, description] of definitional) {
    rows.push({
      tier: "definitional",
      description,
      category,
      basis: `Adds back ${description.toLowerCase()} as reported on the P&L.`,
      sourceDocument: `P&L, ${category === "taxes" ? "income tax" : description.toLowerCase()} line`,
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear((y) => ds.pnl[y]![cat]),
      byMonth: monthsOf(cat, 1),
      origin: "pnl",
      sourceFile: pnlFile,
    });
  }
  // The seller's add-backs, one row per description.
  const descriptions = [...new Set(ds.addbacks.map((x) => x.description))];
  for (const d of descriptions) {
    const items = ds.addbacks.filter((x) => x.description === d);
    const type = items[0]!.type;
    rows.push({
      tier: type === "owner" ? "owner_compensation" : "normalization",
      description: d,
      category: type === "owner" ? "owner_compensation" : type === "discretionary" ? "personal_discretionary" : type === "non_recurring" ? "non_recurring" : "other",
      basis: `Per the seller's add-back list: ${d}.`,
      sourceDocument: items[0]!.source,
      evidence: "management_representation",
      status: "proposed",
      byFiscalYear: byYear((y) => items.filter((x) => x.year === y).reduce((s, x) => s + x.amount, 0)),
      origin: "addbacks_csv",
      sourceFile: items[0]!.source,
    });
  }
  // Non-operating other income and expense leave Reported EBITDA through [N] rows (contract decision a).
  if (years.some((y) => ds.pnl[y]!.other_income !== 0)) {
    rows.push({
      tier: "normalization",
      description: "Other income (non-operating)",
      category: "non_operating",
      basis: "Removes other income reported below operating expenses, which Reported EBITDA carries (net income plus [D1..D3]).",
      sourceDocument: "P&L, other income",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear((y) => -ds.pnl[y]!.other_income),
      byMonth: monthsOf("other_income", -1),
      origin: "pnl",
      sourceFile: pnlFile,
    });
  }
  if (years.some((y) => ds.pnl[y]!.other_expense !== 0)) {
    rows.push({
      tier: "normalization",
      description: "Other expense (non-operating)",
      category: "non_operating",
      basis: "Adds back other expense reported below operating expenses.",
      sourceDocument: "P&L, other expense",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear((y) => ds.pnl[y]!.other_expense),
      byMonth: monthsOf("other_expense", 1),
      origin: "pnl",
      sourceFile: pnlFile,
    });
  }
  // Bot-flagged accounts not already behind a seller row: proposed zeros for the advisor.
  const flagged = new Map<string, string>();
  for (const s of ds.suggestedAddbacks) if (!flagged.has(s.account)) flagged.set(s.account, s.reason);
  for (const [account, reason] of flagged) {
    if (descriptions.some((d) => d.toLowerCase().includes(account.toLowerCase()))) continue;
    rows.push({
      tier: "normalization",
      description: `${account} (bot-flagged)`,
      category: "personal_discretionary",
      basis: `Bot-flagged for review: ${reason}. Amount 0 until an advisor enters it.`,
      sourceDocument: `P&L account ${account}`,
      evidence: "management_representation",
      status: "proposed",
      byFiscalYear: byYear(() => 0),
      origin: "suggested",
      sourceFile: pnlFile,
    });
  }
  rows.push({
    tier: "owner_compensation",
    description: "Owner compensation",
    category: "owner_compensation",
    basis: "Adds back the owner's compensation as paid, per the P&L owner / officer compensation line.",
    sourceDocument: "P&L, owner / officer compensation",
    evidence: "documented",
    status: "accepted",
    byFiscalYear: byYear((y) => ds.pnl[y]!.owner_comp),
    byMonth: monthsOf("owner_comp", 1),
    origin: "owner_comp",
    sourceFile: pnlFile,
  });
  rows.push({
    tier: "owner_compensation",
    description: "Market replacement compensation",
    category: "replacement_cost",
    basis: `Deducts a general manager at the $${a.recast.replacementSalary.toLocaleString("en-US")} replacement salary plus ${Math.round(a.recast.burdenPct * 100)}% payroll taxes and benefits.`,
    sourceDocument: a.recast.replacementSalarySource,
    evidence: "management_representation",
    status: "accepted",
    byFiscalYear: byYear(() => 0),
    origin: "replacement_salary",
  });
  rows.push({
    tier: "owner_compensation",
    description: "Capital reserve (maintenance capex)",
    category: "capital_reserve",
    basis: `Deducts a reserve for equipment replacement in Main Street mode: ${a.recast.capitalReserveSource}.`,
    sourceDocument: a.recast.capitalReserveSource,
    evidence: "documented",
    status: "accepted",
    byFiscalYear: byYear(() => 0),
    origin: "capital_reserve",
  });
  return numberAdjustments(rows);
}

/** A row's amount in a column; `null` where the row has no meaning there (a PF row outside the PF column). */
export function scheduleAmount(row: Adjustment, c: PeriodColumn, fye: number, latestFy: number): number | null {
  if (c.projected) return null;
  const isPf = row.tier === "pro_forma";
  if (c.ref.kind === "pf") return pfColumnAmount(row, windowMonths(c), latestFy, fye);
  if (isPf) return null;
  if (c.ref.kind === "fiscal_year") return row.byFiscalYear[c.ref.fiscalYear] ?? 0;
  return adjustmentInWindow(row, windowMonths(c), fye);
}

// --- Ladder ------------------------------------------------------------------------

export interface LadderInputs {
  /** Net income the ladder starts from (LTM's for the PF column). */
  netIncome: number;
  revenue: number;
  /** Amount per schedule row for this column, `null` = n.a. */
  amounts: Map<Adjustment, number | null>;
  mainStreetMode: boolean;
}

const item = (r: Adjustment, amount: number): LadderItem => ({ ref: r.ref, description: r.description, amount, status: r.status, evidence: r.evidence });

/** The 5.4 ladder from a column's schedule amounts. Only accepted rows enter the rungs. */
export function buildLadder(inp: LadderInputs): Ladder {
  const rows = [...inp.amounts.keys()];
  const amt = (r: Adjustment) => inp.amounts.get(r) ?? 0;
  const accepted = (tier: AdjustmentTier) => rows.filter((r) => r.tier === tier && r.status === "accepted");
  const sum = (xs: Adjustment[]) => xs.reduce((s, r) => s + amt(r), 0);
  const definitional = accepted("definitional");
  const interest = sum(definitional.filter((r) => r.category === "interest"));
  const taxes = sum(definitional.filter((r) => r.category === "taxes"));
  const da = sum(definitional.filter((r) => r.category === "da"));
  const reportedEbitda = inp.netIncome + interest + taxes + da;
  const normalization = accepted("normalization").map((r) => item(r, amt(r)));
  const totalNormalization = normalization.reduce((s, x) => s + x.amount, 0);
  const owner = accepted("owner_compensation");
  const ownerCompAsPaid = sum(owner.filter((r) => r.category === "owner_compensation"));
  const marketReplacement = sum(owner.filter((r) => r.category === "replacement_cost"));
  const capitalReserve = inp.mainStreetMode ? sum(owner.filter((r) => r.category === "capital_reserve")) : 0;
  const sde = reportedEbitda + totalNormalization + ownerCompAsPaid;
  const adjEbitda = sde + marketReplacement + capitalReserve;
  const proForma = accepted("pro_forma").map((r) => item(r, amt(r)));
  const totalProForma = proForma.reduce((s, x) => s + x.amount, 0);
  const pfAdjEbitda = adjEbitda + totalProForma;
  const memo = rows.filter((r) => r.tier === "memo").map((r) => item(r, amt(r)));
  const margin = (v: number) => (inp.revenue ? v / inp.revenue : 0);
  const tierTie = Object.fromEntries(ADJUSTMENT_TIERS.map((t) => [t, 0])) as Record<AdjustmentTier, number>;
  return {
    netIncome: inp.netIncome,
    definitional: { interest, taxes, da },
    reportedEbitda,
    reportedMargin: margin(reportedEbitda),
    normalization,
    totalNormalization,
    ownerCompAsPaid,
    sde,
    sdeMargin: margin(sde),
    marketReplacement,
    capitalReserve,
    ownerCompNormalization: ownerCompAsPaid + marketReplacement,
    adjEbitda,
    adjMargin: margin(adjEbitda),
    proForma,
    totalProForma,
    pfAdjEbitda,
    pfMargin: margin(pfAdjEbitda),
    memo,
    marginDenominator: inp.revenue,
    checks: { reportedEbitdaTie: 0, scheduleTieByTier: tierTie },
  };
}

/** PF Adj. EBITDA before the capital reserve, the measure the Main Street rule tests (guide Q7). */
export function modeMeasure(l: Ladder): number {
  return l.reportedEbitda + l.totalNormalization + l.ownerCompAsPaid + l.marketReplacement + l.totalProForma;
}

export function decideModeFor(ds: FinancialDataset, latestLadder: Ladder, latestLabel: string, a: Assumptions): ModeDecision {
  const rule = ds.mode ?? decideMode(modeMeasure(latestLadder), latestLabel);
  const overridden = rule.overridden || (rule.mode === "mainStreet") !== a.recast.mainStreetMode;
  return { ...rule, mode: a.recast.mainStreetMode ? "mainStreet" : "lowerMiddleMarket", overridden };
}

// --- Monthly series ---------------------------------------------------------------------

export interface MonthlyBuild {
  series: MonthlySeries;
  /** Ladder per month, for the strips and the Monthly P&L rungs. */
  ladders: Ladder[];
}

/** Every category, subtotal and ladder rung per month (DATA_CONTRACT §5.10). */
export function buildMonthlySeries(ds: FinancialDataset, a: Assumptions, schedule: Adjustment[], revenueLines: { account: string; byMonth?: Record<MonthKey, number> }[]): MonthlyBuild | undefined {
  const grid = ds.monthly;
  if (!grid || a.sourceGranularity !== "monthly") return undefined;
  const months = grid.months;
  const fye = a.fiscalYearEndMonth;
  const series: Record<string, number[]> = {};
  const push = (key: string, i: number, v: number) => {
    (series[key] ??= Array(months.length).fill(0))[i] = v;
  };
  const ladders: Ladder[] = [];
  months.forEach((m, i) => {
    const p = pnlLinesFrom(grid.values[m.key]!);
    for (const c of IS_CATEGORIES) push(c, i, grid.values[m.key]![c]);
    push("gross_profit", i, p.grossProfit);
    push("total_opex", i, p.totalOpex);
    push("other_items_net", i, p.otherItemsNet);
    push("reported_ebitda", i, p.ebitda);
    push("ebit", i, p.ebit);
    push("ebt", i, p.ebt);
    push("net_income", i, p.netIncome);
    const amounts = new Map<Adjustment, number | null>();
    for (const r of schedule) amounts.set(r, r.tier === "pro_forma" ? null : adjustmentInWindow(r, [m.key], fye));
    const l = buildLadder({ netIncome: p.netIncome, revenue: p.revenue, amounts, mainStreetMode: a.recast.mainStreetMode });
    ladders.push(l);
    push("definitional", i, l.definitional.interest + l.definitional.taxes + l.definitional.da);
    push("total_normalization", i, l.totalNormalization);
    push("owner_comp_as_paid", i, l.ownerCompAsPaid);
    push("sde", i, l.sde);
    push("market_replacement", i, l.marketReplacement);
    push("capital_reserve", i, l.capitalReserve);
    push("adj_ebitda", i, l.adjEbitda);
    push("total_pro_forma", i, l.totalProForma);
    push("pf_adj_ebitda", i, l.pfAdjEbitda);
    const t12 = i >= 11 ? months.slice(i - 11, i + 1).reduce((s, mm) => s + grid.values[mm.key]!.revenue, 0) : 0;
    push("trailing_12_revenue", i, t12);
    push("seasonality_index", i, months.length >= 24 && t12 ? grid.values[m.key]!.revenue / (t12 / 12) : 0);
  });
  const revenueLineKeys: string[] = [];
  for (const line of revenueLines) {
    const key = `rev:${line.account}`;
    revenueLineKeys.push(key);
    months.forEach((m, i) => push(key, i, line.byMonth?.[m.key] ?? 0));
  }
  const accountKeys: string[] = [];
  for (const line of grid.lines) {
    const key = `acct:${line.account}`;
    if (accountKeys.includes(key)) continue;
    accountKeys.push(key);
    months.forEach((m, i) => push(key, i, line.amounts[m.key] ?? 0));
  }
  return { series: { months, series, revenueLineKeys, accountKeys, chartWindow: chartWindow(months) }, ladders };
}

/** Guide 5.12: up to 36 months ending at the as-of month, quarter-start aligned above 24 months. */
export function chartWindow(months: MonthPeriod[]): { start: MonthKey; end: MonthKey } {
  const end = months[months.length - 1]!.key;
  let start = months[Math.max(0, months.length - 36)]!.key;
  if (monthRange(start, end).length > 24) {
    let { month } = parseMonthKey(start);
    while ((month - 1) % 3 !== 0) {
      start = addMonths(start, 1);
      month = parseMonthKey(start).month;
    }
  }
  return { start, end };
}

/** The as-of month's label pair the Summary prints ("LTM Dec-25 equals FY2025"). */
export function ltmEqualsFiscalYear(asOfMonth: MonthKey, fye: number): boolean {
  return monthPeriod(asOfMonth, fye).fiscalMonth === 12;
}
