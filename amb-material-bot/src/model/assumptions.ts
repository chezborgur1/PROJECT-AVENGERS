import type { FinancialDataset } from "../domain/financials.ts";
import { isPassThrough, type RequestRow } from "../requests/schema.ts";

export const PROJECTION_YEARS = 5;

/** Per-projection-year drivers. Every array has PROJECTION_YEARS entries. */
export interface Assumptions {
  projectionYears: number[];
  revenueGrowth: number[];
  cogsPct: number[];
  payrollPct: number[];
  rentPct: number[];
  marketingPct: number[];
  otherOpexPct: number[];
  ownerComp: number[];
  daPct: number[];
  capexPct: number[];
  dso: number[];
  dio: number[];
  dpo: number[];
  taxRate: number[];
  interestRate: number[];
  debtRepayment: number[];
  distributionsPct: number[];
  /** Market salary for a manager replacing the owner, by year incl. historical years (used in the recast). */
  replacementSalary: Record<number, number>;
  sdeMultiples: [number, number, number];
  ebitdaMultiples: [number, number, number];
  /** Why each default was chosen, keyed by assumption name, for the workbook Notes column. */
  notes: Record<string, string>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const repeat = <T,>(v: T) => Array.from({ length: PROJECTION_YEARS }, () => v);

export const DEFAULT_REPLACEMENT_SALARY = 85_000;
const LONG_TERM_GROWTH = 0.03;

/** Defaults derived from the company's own history. Every one is editable in the workbook. */
export function defaultAssumptions(ds: FinancialDataset, row: RequestRow): Assumptions {
  const years = ds.years;
  const last = years[years.length - 1]!;
  const lastPnl = ds.pnl[last]!;
  const lastBs = ds.balanceSheet[last];
  const notes: Record<string, string> = {};

  // Cost ratios run at the latest year's level; the historical columns in the
  // workbook show the trend for anyone who prefers an average.
  const pctOfRevenue = (cat: keyof typeof lastPnl) => (lastPnl.revenue ? round(lastPnl[cat] / lastPnl.revenue, 4) : 0);

  // Growth: historical CAGR (capped at 0–15%) fading to long-term growth by the final year.
  let growth = repeat(LONG_TERM_GROWTH);
  const first = years[0]!;
  const firstRev = ds.pnl[first]!.revenue;
  if (years.length >= 2 && firstRev > 0 && lastPnl.revenue > 0) {
    const cagr = (lastPnl.revenue / firstRev) ** (1 / (years.length - 1)) - 1;
    const start = clamp(cagr, 0, 0.15);
    growth = growth.map((_, i) => round(start + ((LONG_TERM_GROWTH - start) * i) / (PROJECTION_YEARS - 1), 4));
    notes.revenueGrowth = `Starts at the FY${first}–FY${last} revenue CAGR of ${(cagr * 100).toFixed(1)}% (capped 0–15%), fading to ${LONG_TERM_GROWTH * 100}% by year ${PROJECTION_YEARS}.`;
  } else {
    notes.revenueGrowth = `Only one historical year: flat ${LONG_TERM_GROWTH * 100}% placeholder. Set from seller guidance.`;
  }

  const avgNote = `FY${last} % of revenue (latest-year run-rate). See the historical columns for the trend.`;
  const daPct = pctOfRevenue("depreciation_amortization");

  let dso = 30,
    dio = 0,
    dpo = 20;
  if (lastBs && lastPnl.revenue > 0) {
    dso = round((lastBs.accounts_receivable / lastPnl.revenue) * 365, 0);
    dio = lastPnl.cogs > 0 ? round((lastBs.inventory / lastPnl.cogs) * 365, 0) : 0;
    dpo = lastPnl.cogs > 0 ? round((lastBs.accounts_payable / lastPnl.cogs) * 365, 0) : 0;
    notes.dso = `FY${last} receivables ÷ revenue × 365.`;
    notes.dio = `FY${last} inventory ÷ COGS × 365.`;
    notes.dpo = `FY${last} payables ÷ COGS × 365.`;
  } else {
    notes.dso = notes.dio = notes.dpo = "No balance sheet: placeholder. Replace with actuals.";
  }

  const debt = lastBs?.debt ?? 0;
  const interestRate = debt > 0 && lastPnl.interest_expense > 0 ? clamp(round(lastPnl.interest_expense / debt, 4), 0.03, 0.15) : 0.08;
  notes.interestRate =
    debt > 0 && lastPnl.interest_expense > 0
      ? `FY${last} interest ÷ year-end debt (bounded 3–15%). Applied to opening debt each year.`
      : "Placeholder 8%. Applied to opening debt each year.";

  const passThrough = isPassThrough(row);
  const replacement = row.owner_replacement_salary ?? DEFAULT_REPLACEMENT_SALARY;

  return {
    projectionYears: Array.from({ length: PROJECTION_YEARS }, (_, i) => last + 1 + i),
    revenueGrowth: growth,
    cogsPct: repeat(pctOfRevenue("cogs")),
    payrollPct: repeat(pctOfRevenue("payroll")),
    rentPct: repeat(pctOfRevenue("rent")),
    marketingPct: repeat(pctOfRevenue("marketing")),
    otherOpexPct: repeat(pctOfRevenue("other_opex")),
    ownerComp: repeat(round(lastPnl.owner_comp, 0)),
    daPct: repeat(daPct),
    capexPct: repeat(daPct),
    dso: repeat(dso),
    dio: repeat(dio),
    dpo: repeat(dpo),
    taxRate: repeat(passThrough ? 0 : 0.25),
    interestRate: repeat(interestRate),
    debtRepayment: repeat(round(debt / PROJECTION_YEARS, 0)),
    distributionsPct: repeat(0),
    replacementSalary: Object.fromEntries(
      [...years, ...Array.from({ length: PROJECTION_YEARS }, (_, i) => last + 1 + i)].map((y) => [y, replacement]),
    ),
    sdeMultiples: [2.5, 3.0, 3.5],
    ebitdaMultiples: [4.0, 5.0, 6.0],
    notes: {
      ...notes,
      cogsPct: avgNote,
      payrollPct: avgNote,
      rentPct: `${avgNote} Check the lease for scheduled escalations.`,
      marketingPct: avgNote,
      otherOpexPct: avgNote,
      ownerComp: `Held at FY${last} level. The recast normalises it to the replacement salary.`,
      daPct: avgNote,
      capexPct: "Set equal to D&A (maintenance capex). Raise for growth capex or a fleet refresh.",
      taxRate: passThrough
        ? `${row.entity_type}: pass-through, so no entity-level income tax. Taxes are paid by the owners.`
        : "C-Corp: 21% federal plus an estimated state rate.",
      debtRepayment: debt > 0 ? `FY${last} debt of $${Math.round(debt).toLocaleString()} repaid straight-line over ${PROJECTION_YEARS} years. Replace with the actual amortisation schedule.` : "No debt on the balance sheet.",
      distributionsPct: "Owner distributions as % of net income. 0% lets cash build (deals are usually cash-free, debt-free).",
      replacementSalary: row.owner_replacement_salary
        ? "From the request list (owner_replacement_salary)."
        : `Placeholder $${DEFAULT_REPLACEMENT_SALARY.toLocaleString()}. Set the market salary for a general manager in this industry and location.`,
      multiples: "Placeholder ranges for Main Street businesses. Set from comparable transactions before relying on them.",
    },
  };
}
