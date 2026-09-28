// Computes everything the workbook shows, in TypeScript. The Excel workbook
// carries the same logic as live formulas; this copy feeds the CIM (which
// needs numbers without opening Excel) and the verifier, which evaluates
// every workbook formula independently and checks the two agree.
//
// runModel returns ModelOutput: the legacy ModelResult (years, historical,
// projected) that the current deck still reads, plus every period column of
// guide 5.2, the 5.4 ladder per column, the monthly series, NWC, customer and
// payroll analytics, valuation, deal structure, sensitivities, checks and
// the named outputs of guide 5.14.

import { chartExhibits } from "./chartData.ts";
import {
  ADJUSTMENT_TIERS,
  IS_LABELS,
  addMonths,
  emptyBs,
  monthEndDate,
  monthPeriod,
  monthRange,
  parsePeriodKey,
  periodKey,
  type Adjustment,
  type AdjustmentTier,
  type BsCategory,
  type FinancialDataset,
  type IsCategory,
  type MonthKey,
} from "../domain/financials.ts";
import type { Assumptions, ScenarioDrivers } from "./assumptions.ts";
import { customerActiveAt, customerAnalytics, headcountAnalytics, isFieldDepartment, onPayrollAt } from "./analytics.ts";
import { computeChecks } from "./checks.ts";
import { dealStructure, sensitivityGrids, valuationDetail } from "./deal.ts";
import { debtLikeSummary, historicalCashFlow, nwcAnalysis } from "./nwc.ts";
import {
  amountInWindow,
  buildColumns,
  buildLadder,
  buildMonthlySeries,
  categoryTotals,
  decideModeFor,
  fiscalYearEndKey,
  gridCovers,
  ltmEqualsFiscalYear,
  pnlLinesFrom,
  scheduleAmount,
  scheduleFor,
  windowMonths,
} from "./periods.ts";
import type { DatabookBsRow, DatabookRow, Ladder, ModelOutput, NamedOutputs, PeriodColumn, PeriodValues, ProFormaScenario } from "./types.ts";

export interface BalanceSheetValues {
  cash: number;
  ar: number;
  inventory: number;
  oca: number;
  fixedAssets: number;
  otherAssets: number;
  ap: number;
  ocl: number;
  debt: number;
  equity: number;
  totalAssets: number;
  totalLiabilities: number;
  totalLE: number;
  check: number;
  /** True when the opening balance sheet was estimated (no actuals in the sources). */
  estimated?: boolean;
  /** Statement month when it is not the fiscal year-end (the projections open from the latest dated sheet). */
  asOfMonth?: MonthKey;
}

export interface CashFlowValues {
  netIncome: number;
  da: number;
  dAr: number;
  dInv: number;
  dOca: number;
  dAp: number;
  dOcl: number;
  cfo: number;
  capex: number;
  cfi: number;
  repayment: number;
  distributions: number;
  cff: number;
  netChange: number;
  beginCash: number;
  endCash: number;
}

export interface YearValues {
  year: number;
  projected: boolean;
  revenue: number;
  cogs: number;
  grossProfit: number;
  payroll: number;
  ownerComp: number;
  rent: number;
  marketing: number;
  otherOpex: number;
  totalOpex: number;
  ebitda: number;
  da: number;
  ebit: number;
  interest: number;
  otherIncome: number;
  otherExpense: number;
  ebt: number;
  tax: number;
  netIncome: number;
  ownerNormalization: number;
  addbacksByDescription: Record<string, number>;
  totalAddbacks: number;
  adjEbitda: number;
  replacementSalary: number;
  sde: number;
  bs?: BalanceSheetValues;
  cf?: CashFlowValues;
}

export interface ModelResult {
  years: YearValues[];
  historical: YearValues[];
  projected: YearValues[];
  /** Distinct add-back descriptions, in first-seen order (one recast row each). */
  addbackDescriptions: string[];
}

export function bsValues(b: Record<BsCategory, number>, estimated = false): BalanceSheetValues {
  const totalAssets = b.cash + b.accounts_receivable + b.inventory + b.other_current_assets + b.fixed_assets_net + b.other_assets;
  const totalLiabilities = b.accounts_payable + b.other_current_liabilities + b.debt;
  return {
    cash: b.cash,
    ar: b.accounts_receivable,
    inventory: b.inventory,
    oca: b.other_current_assets,
    fixedAssets: b.fixed_assets_net,
    otherAssets: b.other_assets,
    ap: b.accounts_payable,
    ocl: b.other_current_liabilities,
    debt: b.debt,
    equity: b.equity,
    totalAssets,
    totalLiabilities,
    totalLE: totalLiabilities + b.equity,
    check: totalAssets - totalLiabilities - b.equity,
    estimated,
  };
}

/** Opening balance sheet when the sources have none: working capital from the day assumptions, equity as the balancing item. */
export function estimatedOpeningBalanceSheet(ds: FinancialDataset, a: Assumptions): BalanceSheetValues {
  const last = ds.years[ds.years.length - 1]!;
  const p = ds.pnl[last]!;
  const b = emptyBs();
  b.accounts_receivable = Math.round((p.revenue * a.dso[0]!) / 365);
  b.inventory = Math.round((p.cogs * a.dio[0]!) / 365);
  b.accounts_payable = Math.round((p.cogs * a.dpo[0]!) / 365);
  b.equity = b.accounts_receivable + b.inventory - b.accounts_payable;
  return bsValues(b, true);
}

// --- The legacy three statements (unchanged arithmetic; the Projections tab mirrors it) ------------------

function legacyModel(ds: FinancialDataset, a: Assumptions): ModelResult {
  const addbackDescriptions = [...new Set(ds.addbacks.map((x) => x.description))];
  const years: YearValues[] = [];

  for (const y of ds.years) {
    const p = ds.pnl[y]!;
    const totalOpex = p.payroll + p.owner_comp + p.rent + p.marketing + p.other_opex;
    const grossProfit = p.revenue - p.cogs;
    const ebitda = grossProfit - totalOpex;
    const ebit = ebitda - p.depreciation_amortization;
    const ebt = ebit - p.interest_expense + p.other_income - p.other_expense;
    const byDesc: Record<string, number> = {};
    for (const d of addbackDescriptions) byDesc[d] = 0;
    for (const ab of ds.addbacks.filter((x) => x.year === y)) byDesc[ab.description]! += ab.amount;
    const totalAddbacks = Object.values(byDesc).reduce((s, v) => s + v, 0);
    const replacementSalary = a.replacementSalary[y] ?? 0;
    const ownerNormalization = p.owner_comp - replacementSalary;
    const adjEbitda = ebitda + ownerNormalization + totalAddbacks;
    years.push({
      year: y,
      projected: false,
      revenue: p.revenue,
      cogs: p.cogs,
      grossProfit,
      payroll: p.payroll,
      ownerComp: p.owner_comp,
      rent: p.rent,
      marketing: p.marketing,
      otherOpex: p.other_opex,
      totalOpex,
      ebitda,
      da: p.depreciation_amortization,
      ebit,
      interest: p.interest_expense,
      otherIncome: p.other_income,
      otherExpense: p.other_expense,
      ebt,
      tax: p.income_tax,
      netIncome: ebt - p.income_tax,
      ownerNormalization,
      addbacksByDescription: byDesc,
      totalAddbacks,
      adjEbitda,
      replacementSalary,
      sde: adjEbitda + replacementSalary,
      bs: ds.balanceSheet[y] ? bsValues(ds.balanceSheet[y]!) : undefined,
    });
  }

  // Without a year-end sheet the projections open from the latest dated one, and only without any sheet from an estimate.
  const lastHist = years[years.length - 1]!;
  const latestSheet = ds.balanceSheets?.at(-1);
  lastHist.bs ??= latestSheet ? { ...bsValues(latestSheet.values), asOfMonth: latestSheet.period.key } : estimatedOpeningBalanceSheet(ds, a);

  let prev = lastHist;
  a.projectionYears.forEach((y, i) => {
    const revenue = prev.revenue * (1 + a.revenueGrowth[i]!);
    const cogs = revenue * a.cogsPct[i]!;
    const payroll = revenue * a.payrollPct[i]!;
    const ownerComp = a.ownerComp[i]!;
    const rent = revenue * a.rentPct[i]!;
    const marketing = revenue * a.marketingPct[i]!;
    const otherOpex = revenue * a.otherOpexPct[i]!;
    const totalOpex = payroll + ownerComp + rent + marketing + otherOpex;
    const grossProfit = revenue - cogs;
    const ebitda = grossProfit - totalOpex;
    const da = revenue * a.daPct[i]!;
    const ebit = ebitda - da;
    const pb = prev.bs!;
    const interest = pb.debt * a.interestRate[i]!;
    const ebt = ebit - interest;
    const tax = Math.max(0, ebt) * a.taxRate[i]!;
    const netIncome = ebt - tax;

    const ar = (revenue * a.dso[i]!) / 365;
    const inventory = (cogs * a.dio[i]!) / 365;
    const ap = (cogs * a.dpo[i]!) / 365;
    const capex = revenue * a.capexPct[i]!;
    const repayment = Math.min(pb.debt, a.debtRepayment[i]!);
    const distributions = Math.max(0, netIncome) * a.distributionsPct[i]!;

    const dAr = ar - pb.ar;
    const dInv = inventory - pb.inventory;
    const cfo = netIncome + da - dAr - dInv + (ap - pb.ap);
    const cfi = -capex;
    const cff = -repayment - distributions;
    const netChange = cfo + cfi + cff;
    const cash = pb.cash + netChange;

    const b = emptyBs();
    b.cash = cash;
    b.accounts_receivable = ar;
    b.inventory = inventory;
    b.other_current_assets = pb.oca;
    b.fixed_assets_net = pb.fixedAssets + capex - da;
    b.other_assets = pb.otherAssets;
    b.accounts_payable = ap;
    b.other_current_liabilities = pb.ocl;
    b.debt = pb.debt - repayment;
    b.equity = pb.equity + netIncome - distributions;

    const replacementSalary = a.replacementSalary[y] ?? 0;
    const ownerNormalization = ownerComp - replacementSalary;
    const adjEbitda = ebitda + ownerNormalization;
    const cur: YearValues = {
      year: y,
      projected: true,
      revenue,
      cogs,
      grossProfit,
      payroll,
      ownerComp,
      rent,
      marketing,
      otherOpex,
      totalOpex,
      ebitda,
      da,
      ebit,
      interest,
      otherIncome: 0,
      otherExpense: 0,
      ebt,
      tax,
      netIncome,
      ownerNormalization,
      addbacksByDescription: Object.fromEntries(addbackDescriptions.map((d) => [d, 0])),
      totalAddbacks: 0,
      adjEbitda,
      replacementSalary,
      sde: adjEbitda + replacementSalary,
      bs: bsValues(b),
      cf: {
        netIncome,
        da,
        dAr: -dAr,
        dInv: -dInv,
        dOca: 0,
        dAp: ap - pb.ap,
        dOcl: 0,
        cfo,
        capex: -capex,
        cfi,
        repayment: -repayment,
        distributions: -distributions,
        cff,
        netChange,
        beginCash: pb.cash,
        endCash: cash,
      },
    };
    years.push(cur);
    prev = cur;
  });

  return {
    years,
    historical: years.filter((y) => !y.projected),
    projected: years.filter((y) => y.projected),
    addbackDescriptions,
  };
}

// --- Helpers -----------------------------------------------------------------------------

/** Revenue and other income rise with a positive adjustment; every expense line falls. */
const lineSign = (c: IsCategory): 1 | -1 => (c === "revenue" || c === "other_income" ? 1 : -1);

/** The schedule's tier totals against the ladder's rungs (the second red check row of guide 5.4). */
function tierTies(ladder: Ladder, amounts: Map<Adjustment, number | null>): Record<AdjustmentTier, number> {
  const accepted = (tier: AdjustmentTier) => [...amounts].filter(([r]) => r.tier === tier && r.status === "accepted").reduce((s, [, v]) => s + (v ?? 0), 0);
  const rung: Record<AdjustmentTier, number> = {
    definitional: ladder.definitional.interest + ladder.definitional.taxes + ladder.definitional.da,
    normalization: ladder.totalNormalization,
    owner_compensation: ladder.ownerCompAsPaid + ladder.marketReplacement + ladder.capitalReserve,
    pro_forma: ladder.totalProForma,
    memo: 0,
  };
  return Object.fromEntries(ADJUSTMENT_TIERS.map((t) => [t, t === "memo" ? 0 : accepted(t) - rung[t]])) as Record<AdjustmentTier, number>;
}

function summaryLineFor(category: IsCategory, account: string, ds: FinancialDataset): string {
  if (category === "revenue") return ds.revenueLines?.find((l) => l.account === account)?.label ?? IS_LABELS.revenue;
  return IS_LABELS[category];
}

/** The Pro Forma Low / Mid / High column of annual-only mode (guide 5.2A, 5.5). */
function buildScenario(name: ProFormaScenario["name"], drivers: ScenarioDrivers, ds: FinancialDataset, a: Assumptions, schedule: Adjustment[], latestFy: number): ProFormaScenario {
  const years = ds.years;
  const latest = ds.pnl[latestFy]!;
  const sum = (c: IsCategory) => years.reduce((s, y) => s + ds.pnl[y]![c], 0);
  const revenue = latest.revenue * (1 + drivers.revenueGrowth);
  const byMethod = (c: IsCategory, method: string): number => {
    switch (method) {
      case "3-year average":
        return sum(c) / years.length;
      case "% of sales, 3-year blended":
        return sum("revenue") ? (sum(c) / sum("revenue")) * revenue : 0;
      default:
        return latest[c];
    }
  };
  const cats = { ...latest };
  cats.revenue = revenue;
  cats.cogs = byMethod("cogs", drivers.methods.cogs);
  cats.payroll = byMethod("payroll", drivers.methods.payroll);
  cats.rent = byMethod("rent", drivers.methods.rent);
  cats.marketing = byMethod("marketing", drivers.methods.marketing);
  cats.other_opex = byMethod("other_opex", drivers.methods.otherOpex);
  const pnl = pnlLinesFrom(cats);
  const amounts = new Map<Adjustment, number | null>();
  for (const r of schedule) amounts.set(r, r.tier === "pro_forma" ? 0 : (r.byFiscalYear[latestFy] ?? 0));
  const ladder = buildLadder({ netIncome: pnl.netIncome, revenue: pnl.revenue, amounts, mainStreetMode: a.recast.mainStreetMode });
  ladder.checks = { reportedEbitdaTie: ladder.reportedEbitda - pnl.ebitda, scheduleTieByTier: tierTies(ladder, amounts) };
  return {
    name,
    revenueGrowth: drivers.revenueGrowth,
    pnl,
    ladder,
    methods: { revenue: `Growth ${(drivers.revenueGrowth * 100).toFixed(1)}%`, cogs: drivers.methods.cogs, payroll: drivers.methods.payroll, rent: drivers.methods.rent, marketing: drivers.methods.marketing, otherOpex: drivers.methods.otherOpex, ownerComp: "Latest year", da: "Latest year", interest: "Latest year" },
  };
}

// --- The model -----------------------------------------------------------------------------

export function runModel(ds: FinancialDataset, a: Assumptions): ModelOutput {
  const legacy = legacyModel(ds, a);
  const fye = a.fiscalYearEndMonth;
  const years = ds.years;
  const latestFy = years[years.length - 1]!;
  const columns = buildColumns(ds, a);
  const hist = columns.filter((c) => !c.projected);
  const schedule = scheduleFor(ds, a);
  const grid = ds.monthly;
  const monthly = buildMonthlySeries(ds, a, schedule, ds.revenueLines ?? []);
  const asOfDate = a.asOfDate;

  // Balance sheets by month-end, for the point-in-time columns and NWC.
  const bsByMonth = new Map<MonthKey, BalanceSheetValues>();
  for (const p of ds.balanceSheets ?? []) bsByMonth.set(p.period.key, bsValues(p.values));
  for (const y of years) if (ds.balanceSheet[y] && !bsByMonth.has(fiscalYearEndKey(y, fye))) bsByMonth.set(fiscalYearEndKey(y, fye), bsValues(ds.balanceSheet[y]!));

  // Revenue and COGS of the twelve months ending at a month, for NWC ratios; the fiscal year when that is all the data has.
  const trailingAt = (m: MonthKey): { revenue: number; cogs: number } | undefined => {
    const twelve = monthRange(addMonths(m, -11), m);
    if (gridCovers(grid, twelve)) return twelve.reduce((s, k) => ({ revenue: s.revenue + grid!.values[k]!.revenue, cogs: s.cogs + grid!.values[k]!.cogs }), { revenue: 0, cogs: 0 });
    const p = monthPeriod(m, fye);
    if (p.fiscalMonth === 12 && ds.pnl[p.fiscalYear]) return { revenue: ds.pnl[p.fiscalYear]!.revenue, cogs: ds.pnl[p.fiscalYear]!.cogs };
    return undefined;
  };

  // --- Period columns ---------------------------------------------------------------------
  const periods: Record<string, PeriodValues> = {};
  const amountsByColumn = new Map<string, Map<Adjustment, number | null>>();
  const accountLinesFor = (c: PeriodColumn): Record<string, number> => {
    const out: Record<string, number> = {};
    const months = windowMonths(c);
    if (grid && gridCovers(grid, months)) {
      for (const l of grid.lines) out[l.account] = (out[l.account] ?? 0) + months.reduce((s, m) => s + (l.amounts[m] ?? 0), 0);
    } else if (c.ref.kind === "fiscal_year") {
      for (const l of ds.lines) if (l.statement === "pnl" && l.year === c.ref.fiscalYear) out[l.account] = (out[l.account] ?? 0) + l.amount;
    }
    return out;
  };
  const revenueLinesFor = (c: PeriodColumn) =>
    (ds.revenueLines ?? []).map((l) => ({ account: l.account, label: l.label, amount: amountInWindow(l, windowMonths(c), fye), recurring: l.recurring }));

  for (const c of hist) {
    if (c.ref.kind === "pf") continue;
    const cats = categoryTotals(ds, c);
    const pnl = pnlLinesFrom(cats);
    const amounts = new Map<Adjustment, number | null>();
    for (const r of schedule) amounts.set(r, scheduleAmount(r, c, fye, latestFy));
    const ladder = buildLadder({ netIncome: pnl.netIncome, revenue: pnl.revenue, amounts, mainStreetMode: a.recast.mainStreetMode });
    ladder.checks = { reportedEbitdaTie: ladder.reportedEbitda - pnl.ebitda, scheduleTieByTier: tierTies(ladder, amounts) };
    amountsByColumn.set(c.key, amounts);
    periods[c.key] = { column: c, pnl, ladder, revenueLines: revenueLinesFor(c), accountLines: accountLinesFor(c), bs: bsByMonth.get(c.end), kpis: {} };
  }
  // PF = LTM CY restated by the accepted pro forma rows; its ladder starts from LTM and adds the PF rows at the bottom.
  const pfCol = hist.find((c) => c.ref.kind === "pf");
  const ltmCol = hist.find((c) => c.ref.kind === "ltm" && !c.priorYear);
  if (pfCol && ltmCol) {
    const ltm = periods[ltmCol.key]!;
    const cats = categoryTotals(ds, ltmCol);
    const amounts = new Map<Adjustment, number | null>();
    for (const r of schedule) amounts.set(r, scheduleAmount(r, pfCol, fye, latestFy));
    for (const [r, v] of amounts) if (r.tier === "pro_forma" && r.status === "accepted" && r.pnlLine && v) cats[r.pnlLine] += lineSign(r.pnlLine) * v;
    const pnl = pnlLinesFrom(cats);
    const ladder = buildLadder({ netIncome: ltm.pnl.netIncome, revenue: pnl.revenue, amounts, mainStreetMode: a.recast.mainStreetMode });
    ladder.checks = { reportedEbitdaTie: ladder.reportedEbitda - ltm.pnl.ebitda, scheduleTieByTier: tierTies(ladder, amounts) };
    amountsByColumn.set(pfCol.key, amounts);
    const revenueLines = ltm.revenueLines.map((l) => ({ ...l }));
    periods[pfCol.key] = { column: pfCol, pnl, ladder, revenueLines, accountLines: { ...ltm.accountLines }, bs: ltm.bs, kpis: {} };
  }
  const adjustments = schedule.map((row) => ({
    row,
    byColumn: Object.fromEntries(hist.map((c) => [c.key, amountsByColumn.get(c.key)?.get(row) ?? 0])),
  }));

  // --- Mode and deal form ---------------------------------------------------------------------
  const latest = ltmCol ?? hist.filter((c) => c.ref.kind === "fiscal_year").at(-1)!;
  const latestValues = periods[latest.key]!;
  // The Main Street rule reads PF Adj. EBITDA before the reserve on the latest full window (DATA_CONTRACT §5.5).
  const mode = decideModeFor(ds, pfCol ? periods[pfCol.key]!.ladder : latestValues.ladder, pfCol ? pfCol.label : latest.label, a);
  const dealForm = a.recast.dealForm;

  // --- Analytics ----------------------------------------------------------------------------
  const gridMonths = grid?.months.map((m) => m.key);
  const customers = ds.customers
    ? customerAnalytics({
        list: ds.customers,
        period: latest,
        fye,
        asOfDate,
        asOfMonth: a.asOfMonth,
        years,
        pnlRevenueByFy: Object.fromEntries(years.map((y) => [y, ds.pnl[y]!.revenue])),
        gridMonths,
      })
    : undefined;
  const headcount = ds.payroll
    ? headcountAnalytics({
        register: ds.payroll,
        asOfDate,
        years,
        fye,
        window: { revenue: latestValues.pnl.revenue, payroll: latestValues.pnl.payroll },
        fiscalYear: { year: latestFy, revenue: ds.pnl[latestFy]!.revenue, payroll: ds.pnl[latestFy]!.payroll },
        customersLatest: customers?.latestCount,
        gridMonths,
      })
    : undefined;

  // KPIs per column (DATA_CONTRACT §5.9).
  for (const c of hist) {
    const p = periods[c.key]!;
    const k = p.kpis;
    if (p.pnl.revenue) k.labor_cost_pct_revenue = p.pnl.payroll / p.pnl.revenue;
    if (ds.revenueLines?.length && p.pnl.revenue) k.recurring_revenue_pct = p.revenueLines.filter((l) => l.recurring).reduce((s, l) => s + l.amount, 0) / p.pnl.revenue;
    if (ds.customers) {
      const end = monthEndDate(c.end);
      const active = ds.customers.customers.filter((x) => customerActiveAt(x, end, fye)).length;
      k.customers = active;
      if (active) k.revenue_per_customer = p.pnl.revenue / active;
    }
    if (ds.payroll) {
      const end = monthEndDate(c.end);
      const staff = ds.payroll.employees.filter((e) => !e.isOwner && onPayrollAt(e, end));
      const fte = staff.reduce((s, e) => s + e.fte, 0);
      const field = staff.filter((e) => isFieldDepartment(e.department)).reduce((s, e) => s + e.fte, 0);
      k.employees = fte;
      if (fte && c.months === 12) k.revenue_per_employee = p.pnl.revenue / fte;
      if (field && c.months === 12) k.revenue_per_field_employee = p.pnl.revenue / field;
    }
    for (const series of ds.kpis ?? []) {
      for (const [key, v] of Object.entries(series.values)) {
        const ref = parsePeriodKey(key);
        if (key === c.key) k[series.key] = v;
        else if (ref.kind === "point" && c === latest && ref.date >= `${c.start}-01`) k[series.key] = v;
      }
    }
  }

  // --- Balance sheet, NWC, debt-like, cash flow -----------------------------------------------------
  const nwc = nwcAnalysis({ ds, dealForm, trailingAt });
  const latestBsPeriod = ds.balanceSheets?.at(-1);
  const debtLike = debtLikeSummary(ds, latestBsPeriod ? { values: bsValues(latestBsPeriod.values), asOf: latestBsPeriod.asOf } : undefined);
  const cashFlow = historicalCashFlow(
    years,
    (fy) => periods[periodKey({ kind: "fiscal_year", fiscalYear: fy })]?.pnl,
    (fy) => bsByMonth.get(fiscalYearEndKey(fy, fye)),
  );

  // --- Valuation, deal structure, sensitivities ---------------------------------------------------------
  const valuationInputs = {
    a,
    mode: mode.mode,
    dealForm,
    period: latest,
    pnl: latestValues.pnl,
    ladder: pfCol ? periods[pfCol.key]!.ladder : latestValues.ladder,
    fundedDebt: debtLike?.fundedDebt ?? legacy.historical.at(-1)?.bs?.debt ?? 0,
    debtLike: debtLike?.debtLike ?? 0,
    cash: latestValues.bs?.cash ?? 0,
    nwcVsPeg: nwc?.latestVsPeg ?? 0,
    payroll: latestValues.pnl.payroll,
    sellerRetainedNwc: nwc?.sellerRetainedNwc ?? 0,
  };
  const { detail: valuationDetailOut, summary: valuation } = valuationDetail(valuationInputs);
  const deal = [dealStructure(valuationInputs, valuationDetailOut)];
  const sensitivities = sensitivityGrids(valuationInputs, valuationDetailOut, deal[0]!);

  // --- Annual-only scenarios ---------------------------------------------------------------------------
  const scenarios = a.sourceGranularity === "annual" ? (["low", "mid", "high"] as const).map((k) => buildScenario(k === "low" ? "Low" : k === "mid" ? "Mid" : "High", a.scenarios[k], ds, a, schedule, latestFy)) : undefined;

  // --- Databook -------------------------------------------------------------------------------------
  const suggested = new Set(ds.suggestedAddbacks.map((s) => s.account));
  const refFor = (account: string) => schedule.find((r) => r.origin !== "pnl" && r.sourceDocument.includes(account))?.ref;
  const databookPnl: DatabookRow[] = grid
    ? grid.lines.map((l) => ({
        account: l.account,
        section: l.section,
        category: l.category,
        summaryLine: summaryLineFor(l.category, l.account, ds),
        personal: suggested.has(l.account),
        adjustmentRef: refFor(l.account),
        source: l.source,
        file: l.file,
        mappedBy: l.mappedBy,
        byMonth: l.amounts,
        byFiscalYear: Object.fromEntries(years.map((y) => [y, grid.months.filter((m) => m.fiscalYear === y).reduce((s, m) => s + (l.amounts[m.key] ?? 0), 0)])),
      }))
    : [...new Map(ds.lines.filter((l) => l.statement === "pnl").map((l) => [l.account, l])).values()].map((l) => ({
        account: l.account,
        section: l.section,
        category: l.category as IsCategory,
        summaryLine: summaryLineFor(l.category as IsCategory, l.account, ds),
        personal: suggested.has(l.account),
        adjustmentRef: refFor(l.account),
        source: l.source,
        file: l.file,
        mappedBy: l.mappedBy,
        byFiscalYear: Object.fromEntries(years.map((y) => [y, ds.lines.filter((x) => x.statement === "pnl" && x.account === l.account && x.year === y).reduce((s, x) => s + x.amount, 0)])),
      }));
  // One Databook column per dated balance sheet (month-ends and year-ends alike), so the Balance Sheet, NWC and
  // Cash Flow tabs all read the same dates. Datasets built before sheets carried their lines fall back to the year-ends in `lines`.
  const bsSheets: { key: MonthKey; lines: typeof ds.lines }[] = ds.balanceSheets?.length
    ? ds.balanceSheets.map((p) => ({ key: p.period.key, lines: p.lines ?? ds.lines.filter((l) => l.statement === "balance_sheet" && p.fiscalYearEnd && l.year === p.period.fiscalYear) }))
    : years.map((y) => ({ key: fiscalYearEndKey(y, fye), lines: ds.lines.filter((l) => l.statement === "balance_sheet" && l.year === y) }));
  const bsAccounts = [...new Map(bsSheets.flatMap((s) => s.lines).map((l) => [l.account, l])).values()];
  const databookBs: DatabookBsRow[] = bsAccounts.map((l) => ({
    account: l.account,
    section: l.section,
    category: l.category as BsCategory,
    source: l.source,
    file: l.file,
    mappedBy: l.mappedBy,
    byMonth: Object.fromEntries(bsSheets.filter((s) => s.lines.some((x) => x.account === l.account)).map((s) => [s.key, s.lines.filter((x) => x.account === l.account).reduce((t, x) => t + x.amount, 0)])),
  }));

  // --- Named outputs, modules, checks ----------------------------------------------------------------------
  const fyCols = hist.filter((c) => c.ref.kind === "fiscal_year");
  const byFy = (f: (l: PeriodValues) => number): Record<number, number> => Object.fromEntries(fyCols.map((c) => [c.fiscalYear!, f(periods[c.key]!)]));
  const ltmValues = ltmCol ? periods[ltmCol.key]! : undefined;
  const ltmIsFy = ltmEqualsFiscalYear(a.asOfMonth, fye);
  const ltmRetention = customers?.retention ? (ltmIsFy ? customers.retention.byFiscalYear[latestFy] : customers.retention.ltm) : undefined;
  const namedOutputs: NamedOutputs = {
    AsOfDate: asOfDate,
    FYEMonth: fye,
    PrintMode: 0,
    MainStreetMode: mode.mode === "mainStreet",
    DealForm: dealForm,
    Rev_FY: byFy((l) => l.pnl.revenue),
    Rev_LTM: ltmValues?.pnl.revenue ?? null,
    Rev_PF: pfCol ? periods[pfCol.key]!.pnl.revenue : null,
    GP_FY: byFy((l) => l.pnl.grossProfit),
    GP_LTM: ltmValues?.pnl.grossProfit ?? null,
    RepEBITDA_FY: byFy((l) => l.ladder.reportedEbitda),
    RepEBITDA_LTM: ltmValues?.ladder.reportedEbitda ?? null,
    SDE_FY: byFy((l) => l.ladder.sde),
    SDE_LTM: ltmValues?.ladder.sde ?? null,
    AdjEBITDA_FY: byFy((l) => l.ladder.adjEbitda),
    AdjEBITDA_LTM: ltmValues?.ladder.adjEbitda ?? null,
    PFAdjEBITDA: (pfCol ? periods[pfCol.key]! : latestValues).ladder.pfAdjEbitda,
    Customers_Latest: customers?.latestCount ?? null,
    Top10Share_LTM: customers?.concentration.top10Share ?? null,
    GDR_LTM: ltmRetention?.dollars.startingRevenue ? ltmRetention.dollars.gdr : null,
    NDR_LTM: ltmRetention?.dollars.startingRevenue ? ltmRetention.dollars.ndr : null,
    Headcount_Latest: headcount?.latestHeadcount ?? null,
    NWC_Peg: nwc?.peg ?? null,
    NWC_Latest: nwc?.latest ?? null,
    NWC_vsPeg: nwc?.latestVsPeg ?? null,
    DefRev_Latest: nwc?.available.deferred_revenue ? nwc.periods.at(-1)!.lines.deferredRevenue : null,
    MasterCheck: "",
    LOIDate: null,
    SigningDate: null,
    EffectiveDate: null,
    ChartStart: monthly?.series.chartWindow.start ?? null,
    ChartEnd: monthly?.series.chartWindow.end ?? null,
    Monthly: monthly ? { ...monthly.series.series } : {},
  };

  const built: string[] = [];
  const omitted: { id: string; reason: string }[] = [];
  const module = (id: string, condition: boolean, reason: string) => (condition ? built.push(id) : omitted.push({ id, reason }));
  module("S4.1 Customer overview", !!customers, "No customer list");
  module("S4.2 Retention", !!customers?.retention, "Customer dates or two years of revenue by customer are missing");
  module("S4.3 Cohorts", !!customers?.cohorts, "Fewer than three annual cohorts");
  module("S4.4 Concentration", !!customers, "No revenue by customer");
  module("S5.2 Headcount and compensation", !!headcount, "No payroll register");
  module("S5.3 Retention and tenure", !!headcount && ds.payroll!.employees.some((e) => e.terminationDate), "No hire and termination dates");
  module("S6.4 Monthly trend and seasonality", (grid?.months.length ?? 0) >= 18, "Fewer than 18 months of monthly P&L");
  module("S7.3 Owner compensation and SDE", mode.mode === "mainStreet", "Lower-middle-market mode (PF Adj. EBITDA at or above $1.0M)");
  module("S7.4 Reconciliation between sources", !!ds.reconciliations?.some((r) => r.material), "No material difference between sources");
  module("S8.1 Summary balance sheet", (ds.balanceSheets?.length ?? Object.keys(ds.balanceSheet).length) >= 2, "Fewer than two year-end balance sheets");
  module("S8.2 Net working capital", !!nwc, "No balance sheet");
  module("S8.3 Capex and cash conversion", cashFlow.length > 0, "Fewer than two balance sheets");
  module("S9.1 Opportunity sizing", (ds.intake?.growthLevers.length ?? 0) > 0, "No growth levers in the notes");
  module("Proof of Cash", !!ds.depositsByMonth && !!grid, "No bank source or no monthly grid");
  module("Real Estate", !!ds.intake?.locations.some((l) => l.arrangement !== "leased_from_third_party"), "Premises leased from a third party");

  const draft: Omit<ModelOutput, "checks" | "masterCheck" | "namedOutputs" | "modules"> = {
    ...legacy,
    assumptions: a,
    mode,
    dealForm,
    granularity: a.sourceGranularity,
    asOfDate,
    fiscalYearEndMonth: fye,
    columns,
    periods,
    adjustments,
    monthly: monthly?.series,
    nwc,
    debtLike,
    customers,
    headcount,
    valuation,
    valuationDetail: valuationDetailOut,
    deal,
    sensitivities,
    scenarios,
    cashFlow,
    databook: { pnl: databookPnl, bs: databookBs },
  };
  // The chart exhibits read the analytics above; each chart tab follows its analysis tab (guide 5.12).
  const charts = chartExhibits(ds, draft);
  module("Chart tabs (guide 5.12)", charts.length > 0, "Fewer than 12 months of monthly P&L");
  const { checks, masterCheck } = computeChecks({
    ds,
    out: { ...draft, charts },
    tabs: {
      charts: charts.length > 0,
      offerComparison: false,
      realEstate: false,
      strips: a.sourceGranularity === "monthly",
      proofOfCash: !!ds.depositsByMonth && !!grid,
      annualMode: a.sourceGranularity === "annual",
    },
  });
  namedOutputs.MasterCheck = masterCheck;
  return { ...draft, charts, checks, masterCheck, namedOutputs, modules: { built, omitted } };
}
