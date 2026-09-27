// Computes the three statements in TypeScript. The Excel workbook carries
// the same logic as live formulas; this copy feeds the CIM (which needs
// numbers without opening Excel), and the test suite recalculates the
// workbook in LibreOffice and checks the two agree.

import { emptyBs, type BsCategory, type FinancialDataset } from "../domain/financials.ts";
import type { Assumptions } from "./assumptions.ts";

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

function bsValues(b: Record<BsCategory, number>, estimated = false): BalanceSheetValues {
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

export function runModel(ds: FinancialDataset, a: Assumptions): ModelResult {
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

  const lastHist = years[years.length - 1]!;
  lastHist.bs ??= estimatedOpeningBalanceSheet(ds, a);

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
