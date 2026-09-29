import { addMonths, monthKey, type DealForm, type FinancialDataset, type PremisesArrangement } from "../domain/financials.ts";
import { fiscalYearEndMonth, isPassThrough, type RequestRow } from "../requests/schema.ts";

export const PROJECTION_YEARS = 5;

/** The recast inputs behind the [S2] and [S3] rows and the mode switch (guide 5.3, 5.4, Q7, Q8). */
export interface RecastAssumptions {
  replacementSalary: number;
  replacementSalarySource: string;
  burdenPct: number;
  burdenSource: string;
  capitalReserve: number;
  capitalReserveBasis: "form_4562" | "da_proxy" | "advisor" | "none";
  capitalReserveSource: string;
  mainStreetMode: boolean;
  mainStreetSource: string;
  dealForm: DealForm;
  dealFormSource: string;
}

/** Deal-term defaults from AMB precedent (guide 5.5, Q16), every one a blue input with a Source on the Assumptions tab. */
export interface DealAssumptions {
  structurePreset: "Traditional" | "Cash + earnout" | "Stock consideration" | "All cash";
  cashAtClosePct: number;
  sellerNotePct: number;
  sellerNoteTermMonths: number;
  sellerNoteRate: number;
  escrowPct: number;
  escrowMonths: number;
  equityInjectionPct: number;
  loanTermYears: number;
  loanRate: number;
  /** Buyer one-time costs (Uses). No AMB default; zero until entered. */
  transactionFees: number;
  /** Months of LTM payroll held back on an asset purchase (guide 5.6). */
  reconciliationHoldbackMonths: number;
  deferredCapex: number;
  /** How a post-closing working-capital true-up is paid (guide 5.6); Stock by default only when buyer stock is meant to be tax-deferred. */
  trueUpSettlement: "Cash" | "Stock" | "Share-adjusting escrow";
  /** "Stock consideration intended tax-deferred?" (guide 5.5): turns on the boot flag on Deal Structure. */
  stockTaxDeferred: boolean;
  /** Deferred revenue and customer deposits: an operating liability in NWC (AMB default) or a debt-like deduction (guide 5.6). */
  deferredRevenueTreatment: "NWC (operating liability)" | "Debt-like";
  /** Guide 5.5 "Real estate" block; empty when no source states it. */
  premisesArrangement: "" | "Leased from third party" | "Owned by seller, offered for lease" | "Owned by seller, offered for sale" | "Owned by operating company";
}

const PREMISES_LABEL: Record<PremisesArrangement, DealAssumptions["premisesArrangement"]> = {
  leased_from_third_party: "Leased from third party",
  owned_by_seller_offered_for_lease: "Owned by seller, offered for lease",
  owned_by_seller_offered_for_sale: "Owned by seller, offered for sale",
  owned_by_operating_company: "Owned by operating company",
};

/** The arrangement the intake states; an owner-held site outranks a leased one, since it is the one that needs the Real Estate work. */
function premisesFrom(ds: FinancialDataset): DealAssumptions["premisesArrangement"] {
  const arrangements = (ds.intake?.locations ?? []).map((l) => l.arrangement);
  const owned = arrangements.find((x) => x !== "leased_from_third_party");
  if (owned) return PREMISES_LABEL[owned];
  return arrangements.length ? "Leased from third party" : "";
}

/** Pro forma methods a Main Street scenario applies per expense line (guide 5.5 scenario block). */
export type ScenarioMethod = "3-year average" | "Latest year" | "% of sales, 3-year blended" | "Contracted" | "Input";

/** One column of the Low / Mid / High block (guide 5.2A, 5.5). Mid is the base case. */
export interface ScenarioDrivers {
  revenueGrowth: number;
  methods: { cogs: ScenarioMethod; payroll: ScenarioMethod; rent: ScenarioMethod; marketing: ScenarioMethod; otherOpex: ScenarioMethod };
}

/** Step sizes for the two-way grids (guide 5.5); midpoints link to the base case. */
export interface SensitivityAssumptions {
  multipleStep: number;
  earningsStepPct: number;
  priceStepPct: number;
  rateStep: number;
  cashPctStep: number;
  roundingDigits: number;
  gradientBands: number;
  dscrHurdle: number;
}

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
  /** Market salary for a manager replacing the owner, by year incl. historical years (the legacy recast; the ladder uses `recast`). */
  replacementSalary: Record<number, number>;
  sdeMultiples: [number, number, number];
  ebitdaMultiples: [number, number, number];
  multiplesSource: string;
  /** Why each default was chosen, keyed by assumption name, for the workbook Source column. */
  notes: Record<string, string>;

  // --- Rebuilt model inputs (guide 5.1 row 4) ---
  /** Last day of the last full month of data, "YYYY-MM-DD". Never TODAY(). */
  asOfDate: string;
  asOfMonth: string;
  /** First month of the monthly grid (guide 5.2), or the first month of the earliest fiscal year in annual mode. */
  firstDataMonth: string;
  fiscalYearEndMonth: number;
  sourceGranularity: "monthly" | "annual";
  booksBasis: "cash" | "accrual" | "unconfirmed";
  units: "$000s";
  customerTerm: "Customer" | "Client";
  recast: RecastAssumptions;
  deal: DealAssumptions;
  sensitivity: SensitivityAssumptions;
  /** Main Street mode: the Pro Forma Low / Mid / High block. Low and High each differ from Mid on growth and one driver (check C29). */
  scenarios: Record<"low" | "mid" | "high", ScenarioDrivers>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const repeat = <T,>(v: T) => Array.from({ length: PROJECTION_YEARS }, () => v);

export const DEFAULT_REPLACEMENT_SALARY = 85_000;
export const DEFAULT_BURDEN_PCT = 0.15;
const LONG_TERM_GROWTH = 0.03;

/** Last day of a "YYYY-MM" month as "YYYY-MM-DD". */
function endOfMonth(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key}-${String(last).padStart(2, "0")}`;
}

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
    notes.revenueGrowth = `FY${first}–FY${last} revenue CAGR of ${(cagr * 100).toFixed(1)}% (capped 0–15%), fading to ${LONG_TERM_GROWTH * 100}% by year ${PROJECTION_YEARS}. Illustrative; replace with seller guidance.`;
  } else {
    notes.revenueGrowth = `Only one historical year: flat ${LONG_TERM_GROWTH * 100}% placeholder. Set from seller guidance.`;
  }

  const avgNote = `FY${last} % of revenue (latest-year run-rate); see P&L Summary for the trend.`;
  const daPct = pctOfRevenue("depreciation_amortization");

  let dso = 30,
    dio = 0,
    dpo = 20;
  if (lastBs && lastPnl.revenue > 0) {
    dso = round((lastBs.accounts_receivable / lastPnl.revenue) * 365, 0);
    dio = lastPnl.cogs > 0 ? round((lastBs.inventory / lastPnl.cogs) * 365, 0) : 0;
    dpo = lastPnl.cogs > 0 ? round((lastBs.accounts_payable / lastPnl.cogs) * 365, 0) : 0;
    notes.dso = `FY${last} receivables ÷ revenue × 365, per Balance Sheet.`;
    notes.dio = `FY${last} inventory ÷ COGS × 365, per Balance Sheet.`;
    notes.dpo = `FY${last} payables ÷ COGS × 365, per Balance Sheet.`;
  } else {
    notes.dso = notes.dio = notes.dpo = "No balance sheet: placeholder. Replace with actuals.";
  }

  const debt = lastBs?.debt ?? 0;
  const interestRate = debt > 0 && lastPnl.interest_expense > 0 ? clamp(round(lastPnl.interest_expense / debt, 4), 0.03, 0.15) : 0.08;
  notes.interestRate =
    debt > 0 && lastPnl.interest_expense > 0
      ? `FY${last} interest ÷ year-end debt (bounded 3–15%), applied to opening debt each year.`
      : "Placeholder 8%, applied to opening debt each year.";

  const passThrough = isPassThrough(row);
  const fye = ds.fiscalYearEndMonth ?? fiscalYearEndMonth(row);
  const recastInputs = ds.recastInputs;
  const replacement = recastInputs?.replacementSalary ?? row.owner_replacement_salary ?? DEFAULT_REPLACEMENT_SALARY;
  const burden = recastInputs?.burdenPct ?? DEFAULT_BURDEN_PCT;

  // Capital reserve [S3]: Form 4562 when the data layer found one, else the
  // three-year average of D&A as a proxy (guide 5.4), flagged for open-questions.md.
  const daAvg = years.reduce((s, y) => s + ds.pnl[y]!.depreciation_amortization, 0) / years.length;
  const reserve = recastInputs?.capitalReserve;
  const capitalReserve = reserve?.amount ?? round(daAvg, 0);
  const capitalReserveBasis = reserve?.basis ?? "da_proxy";
  const capitalReserveSource = reserve?.source ?? `Three-year average of depreciation expense FY${first}–FY${last} (proxy; Form 4562 not in the sources)`;

  const monthly = ds.monthly;
  const asOfMonth = ds.asOfMonth ?? monthly?.months[monthly.months.length - 1]?.key ?? monthKey(last, fye);
  const firstDataMonth = monthly?.months[0]?.key ?? addMonths(monthKey(first, fye), -11);
  const sourceGranularity: Assumptions["sourceGranularity"] = ds.sourceGranularity ?? (monthly ? "monthly" : "annual");

  const mainStreetMode = ds.mode?.mode === "mainStreet";
  const dealForm: DealForm = ds.dealForm?.form ?? (mainStreetMode ? "asset_purchase" : "equity_purchase");

  const projectionYears = Array.from({ length: PROJECTION_YEARS }, (_, i) => last + 1 + i);
  return {
    projectionYears,
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
    replacementSalary: Object.fromEntries([...years, ...projectionYears].map((y) => [y, replacement])),
    sdeMultiples: [2.5, 3.0, 3.5],
    ebitdaMultiples: [4.0, 5.0, 6.0],
    multiplesSource: "AMB placeholder range for Main Street services businesses; replace with the licensed comps source before relying on it (Q15).",
    notes: {
      ...notes,
      cogsPct: avgNote,
      payrollPct: avgNote,
      rentPct: `${avgNote} Check the lease for scheduled escalations.`,
      marketingPct: avgNote,
      otherOpexPct: avgNote,
      ownerComp: `Held at FY${last} level; the ladder normalises it to the replacement cost.`,
      daPct: avgNote,
      capexPct: "Set equal to D&A (maintenance capex). Raise for growth capex or a fleet refresh.",
      taxRate: passThrough
        ? `${row.entity_type}: pass-through, so no entity-level income tax. Taxes are paid by the owners.`
        : "C-Corp: 21% federal plus an estimated state rate.",
      debtRepayment: debt > 0 ? `FY${last} debt of $${Math.round(debt).toLocaleString("en-US")} repaid straight-line over ${PROJECTION_YEARS} years. Replace with the amortisation schedule.` : "No debt on the balance sheet.",
      distributionsPct: "Owner distributions as % of net income. 0% lets cash build (deals are cash-free, debt-free).",
      replacementSalary: row.owner_replacement_salary ? "Request list owner_replacement_salary." : `AMB default $${DEFAULT_REPLACEMENT_SALARY.toLocaleString("en-US")}; confirm (Q8).`,
      multiples: "AMB placeholder range; replace with the licensed comps source before relying on it.",
    },

    asOfDate: endOfMonth(asOfMonth),
    asOfMonth,
    firstDataMonth,
    fiscalYearEndMonth: fye,
    sourceGranularity,
    booksBasis: ds.booksBasis ?? "unconfirmed",
    units: "$000s",
    customerTerm: ds.customers?.term ?? "Customer",
    recast: {
      replacementSalary: replacement,
      replacementSalarySource: recastInputs?.replacementSalarySource ?? (row.owner_replacement_salary ? "Request list owner_replacement_salary" : "AMB default; confirm (Q8)"),
      burdenPct: burden,
      burdenSource: recastInputs?.burdenSource ?? "AMB default 15% payroll taxes and benefits; confirm (Q8)",
      capitalReserve,
      capitalReserveBasis,
      capitalReserveSource,
      mainStreetMode,
      mainStreetSource: ds.mode
        ? `${ds.mode.overridden ? "Advisor override" : "Rule"}: PF Adj. EBITDA before the capital reserve $${Math.round(ds.mode.measure).toLocaleString("en-US")} (${ds.mode.measureLabel}) ${ds.mode.measure < ds.mode.threshold ? "<" : ">="} $${ds.mode.threshold.toLocaleString("en-US")} (Q7)`
        : "Rule: PF Adj. EBITDA before the capital reserve vs $1,000,000 (Q7)",
      dealForm,
      dealFormSource: ds.dealForm?.basis ?? "Default from mode (Main Street: asset purchase; LMM: equity purchase)",
    },
    deal: {
      structurePreset: "Traditional",
      cashAtClosePct: 0.8,
      sellerNotePct: 0.2,
      sellerNoteTermMonths: 18,
      sellerNoteRate: 0.09,
      escrowPct: 0.1,
      escrowMonths: 15,
      equityInjectionPct: 0.1,
      loanTermYears: 10,
      loanRate: 0.105,
      transactionFees: 0,
      reconciliationHoldbackMonths: dealForm === "asset_purchase" ? 1 : 0,
      deferredCapex: 0,
      trueUpSettlement: "Cash",
      stockTaxDeferred: false,
      deferredRevenueTreatment: "NWC (operating liability)",
      premisesArrangement: premisesFrom(ds),
    },
    sensitivity: {
      multipleStep: 0.25,
      earningsStepPct: 0.05,
      priceStepPct: 0.05,
      rateStep: 0.005,
      cashPctStep: 0.05,
      roundingDigits: 0,
      gradientBands: 5,
      dscrHurdle: 1.25,
    },
    scenarios: {
      // Mid is the base window as reported (every line at the latest year, no growth), so the Mid valuation rests on trailing
      // SDE, as an SBA lender underwrites it, not on a forecast. Low shrinks revenue with every variable cost scaling at its
      // 3-year blended ratio; High grows it with cost of revenue scaling and payroll held (operating leverage). Low and High
      // each differ from Mid on growth and an operating driver (C29), and Low <= Mid <= High on EBITDA.
      low: { revenueGrowth: -0.03, methods: { cogs: "% of sales, 3-year blended", payroll: "% of sales, 3-year blended", rent: "Latest year", marketing: "Latest year", otherOpex: "Latest year" } },
      mid: { revenueGrowth: 0, methods: { cogs: "Latest year", payroll: "Latest year", rent: "Latest year", marketing: "Latest year", otherOpex: "Latest year" } },
      high: { revenueGrowth: 0.03, methods: { cogs: "% of sales, 3-year blended", payroll: "Latest year", rent: "Latest year", marketing: "Latest year", otherOpex: "Latest year" } },
    },
  };
}
