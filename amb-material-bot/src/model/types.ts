// The contract between the model engine / workbook and the CIM.
//
// `runModel` keeps returning the legacy ModelResult (years, historical,
// projected, addbackDescriptions) so the current writer, verifier and deck
// compile. The rebuilt engine returns ModelOutput, a superset: every period
// column of the guide's 5.2 layout with its P&L lines and 5.4 ladder, the
// monthly series behind the strips and charts, NWC, customer and payroll
// analytics, the checks and the named outputs of guide 5.14. The CIM reads
// numbers only from here, never from the dataset directly, so text and
// exhibits cannot drift from the workbook (guide 4.8).

import type {
  Adjustment,
  AdjustmentTier,
  BsDetailLine,
  DealForm,
  DealMode,
  Evidence,
  IsCategory,
  MonthKey,
  MonthPeriod,
  PeriodRef,
  ModeDecision,
} from "../domain/financials.ts";
import type { BalanceSheetValues, CashFlowValues, ModelResult, YearValues } from "./engine.ts";

export type { BalanceSheetValues, CashFlowValues, ModelResult, YearValues };

// --- Period columns ------------------------------------------------------------

/** Column groups of the standard period layout (guide 5.2 row 5). */
export type PeriodGroup = "Full Year" | "YTD" | "LTM" | "PF" | "Pro Forma" | "Projection";

export interface PeriodColumn {
  /** `periodKey(ref)`; the key into every per-period map. */
  key: string;
  ref: PeriodRef;
  group: PeriodGroup;
  /** Printed label (guide D7): "FY2025", "YTD Jul-26", "LTM Jul-26", "PF Jul-26", "FY2026E". */
  label: string;
  /** First and last month of the window, inclusive; equal for a one-month window. */
  start: MonthKey;
  end: MonthKey;
  months: number;
  /** The fiscal year for Full Year and Projection columns. */
  fiscalYear?: number;
  /** True for the prior-year twin of a YTD or LTM column. */
  priorYear: boolean;
  projected: boolean;
}

/**
 * The P&L lines of one period. Same names as YearValues so the two can be
 * compared field by field, with one deliberate difference: `ebitda` here is
 * Reported EBITDA as guide 5.4 and check C05 define it, net income plus
 * interest, taxes and D&A, so it carries other income and expense (a
 * normalization row removes what is non-operating). The legacy
 * YearValues.ebitda is gross profit less operating expenses and excludes them.
 */
export interface PnlLines {
  revenue: number;
  cogs: number;
  grossProfit: number;
  payroll: number;
  ownerComp: number;
  rent: number;
  marketing: number;
  otherOpex: number;
  totalOpex: number;
  /** otherIncome − otherExpense, shown above EBITDA. */
  otherItemsNet: number;
  /** Reported EBITDA = grossProfit − totalOpex + otherItemsNet = netIncome + interest + tax + da. */
  ebitda: number;
  da: number;
  ebit: number;
  interest: number;
  otherIncome: number;
  otherExpense: number;
  ebt: number;
  tax: number;
  netIncome: number;
}

export interface LadderItem {
  ref: string;
  description: string;
  amount: number;
  status: Adjustment["status"];
  evidence: Evidence;
}

/**
 * The 5.4 ladder for one period. Signs follow the schedule (positive raises
 * EBITDA), so `marketReplacement` and `capitalReserve` are negative numbers
 * and the rungs are plain sums:
 *   reportedEbitda = netIncome + interest + taxes + da
 *   sde            = reportedEbitda + totalNormalization + ownerCompAsPaid
 *   adjEbitda      = sde + marketReplacement + capitalReserve
 *   pfAdjEbitda    = adjEbitda + totalProForma
 */
export interface Ladder {
  netIncome: number;
  definitional: { interest: number; taxes: number; da: number };
  reportedEbitda: number;
  reportedMargin: number;
  /** Accepted normalization rows only (guide Q10). */
  normalization: LadderItem[];
  totalNormalization: number;
  /** [S1]: owner compensation as paid, added back. */
  ownerCompAsPaid: number;
  sde: number;
  sdeMargin: number;
  /** [S2]: −(replacement salary × (1 + burden)). */
  marketReplacement: number;
  /** [S3]: −capital reserve in Main Street mode; 0 in lower-middle-market mode. */
  capitalReserve: number;
  /** [S1] + [S2]: the one-line "Owner compensation normalization" the CIM shows in LMM mode (guide 5.4). */
  ownerCompNormalization: number;
  adjEbitda: number;
  adjMargin: number;
  proForma: LadderItem[];
  totalProForma: number;
  pfAdjEbitda: number;
  pfMargin: number;
  /** Memo rows: shown, never added. */
  memo: LadderItem[];
  /** Revenue the margins divide by (net revenue where pass-through revenue exists). */
  marginDenominator: number;
  /** The two red check rows of guide 5.4; both must be zero. */
  checks: { reportedEbitdaTie: number; scheduleTieByTier: Record<AdjustmentTier, number> };
}

export interface PeriodValues {
  column: PeriodColumn;
  pnl: PnlLines;
  ladder: Ladder;
  /** Revenue by line for the period, in `RevenueLine` order, contra lines netted into `pnl.revenue`. */
  revenueLines: { account: string; label: string; amount: number; recurring: boolean }[];
  /** Mapped account × period (Databook) for the Expense Detail and cost-ratio tables. Keyed by account as exported. */
  accountLines: Record<string, number>;
  /** Point-in-time balance sheet at the column's end month, when one exists. */
  bs?: BalanceSheetValues;
  /** Period KPIs computed by the engine (revenue per employee, labor cost %, customers), keyed by KPI key. */
  kpis: Record<string, number>;
}

// --- Monthly series ---------------------------------------------------------------

/** Row keys of the monthly grid the strips and chart tabs read. Revenue lines and accounts are added by name. */
export type MonthlySeriesKey =
  | IsCategory
  | "gross_profit"
  | "total_opex"
  | "reported_ebitda"
  | "sde"
  | "adj_ebitda"
  | "pf_adj_ebitda"
  | "trailing_12_revenue"
  | "seasonality_index"
  | (string & {});

export interface MonthlySeries {
  months: MonthPeriod[];
  /** One value per month in `months` order; a line absent in a month is 0. */
  series: Record<MonthlySeriesKey, number[]>;
  /** Series keys that are revenue lines, in `RevenueLine` order, so a mix chart can pick the top three plus "Other". */
  revenueLineKeys: string[];
  /** Series keys that are mapped accounts (Databook rows). */
  accountKeys: string[];
  /** Window the chart tabs plot (guide 5.12: up to 36 months ending at AsOfDate, quarter-start aligned above 24). */
  chartWindow: { start: MonthKey; end: MonthKey };
}

// --- Net working capital and debt-like items (guide 5.6) --------------------------

export interface NwcLines {
  ar: number;
  unbilled: number;
  inventory: number;
  prepaidOther: number;
  totalCurrentAssetsExCash: number;
  ap: number;
  accrued: number;
  deferredRevenue: number;
  customerDeposits: number;
  totalCurrentLiabExDebt: number;
  reportedNwc: number;
  adjustments: number;
  adjustedNwc: number;
  pctLtmRevenue: number;
  deferredRevenuePctRevenue: number;
  dso: number;
  dio: number;
  dpo: number;
}

export interface NwcAnalysis {
  /** Every month-end or year-end balance sheet, ascending. `detail` echoes the source's carve-outs for the Balance Sheet tab. */
  periods: { asOf: string; month: MonthKey; lines: NwcLines; detail?: Partial<Record<BsDetailLine, number>> }[];
  /** "T12M average", "T4Q average", or "n.a." with year-ends only. */
  pegBasis: "T12M average" | "T4Q average" | "n.a.";
  peg: number | null;
  latest: number;
  latestVsPeg: number | null;
  deferredRevenueTreatment: "nwc" | "debt_like";
  /** Asset purchase: which lines transfer (guide 5.6). */
  transfers?: Record<keyof Pick<NwcLines, "ar" | "unbilled" | "inventory" | "prepaidOther" | "ap" | "accrued" | "deferredRevenue" | "customerDeposits">, "transfers" | "retained_by_seller" | "assumed_only_if_listed">;
  transferringNwc?: number;
  sellerRetainedNwc?: number;
  /** Which balance-sheet detail lines were available; missing ones print `n.a.` with a flag. */
  available: Record<BsDetailLine, boolean>;
}

export interface DebtLikeSummary {
  items: { item: string; balance: number; treatment: "debt" | "debt_like" | "nwc"; status: string; payoffLetter?: string; note?: string }[];
  fundedDebt: number;
  debtLike: number;
  /** Memo: balances kept in NWC under the AMB default (deferred revenue, customer deposits). */
  inNwc: number;
  asOf: string;
}

// --- Customer analytics (guide 5.5) -------------------------------------------------

export interface RetentionCounts {
  startingCount: number;
  newCustomers: number;
  lostCustomers: number;
  lostByReason: { regrettable: number; nonRegrettable: number; unclassified: number };
  endingCount: number;
  avgCustomers: number;
  newCustomerGrowth: number;
  churn: number;
}

export interface RetentionDollars {
  startingRevenue: number;
  churn: number;
  downsell: number;
  upsell: number;
  newRevenue: number;
  endingRevenue: number;
  gdr: number;
  ndr: number;
}

export interface ConcentrationRow {
  id: string;
  type?: string;
  /** Year the relationship started. */
  since?: number;
  tenureYears: number;
  revenue: number;
  pctOfTotal: number;
  cumulativePct: number;
}

export interface CustomerAnalytics {
  term: "Customer" | "Client";
  /** Period the concentration and mix are measured on (LTM CY, or the latest FY in annual mode). */
  period: PeriodColumn;
  latestCount: number;
  mixByType: { type: string; count: number; countPct: number; revenue: number; revenuePct: number; avgRevenue: number }[];
  retention?: {
    byFiscalYear: Record<number, { counts: RetentionCounts; dollars: RetentionDollars }>;
    ltm?: { counts: RetentionCounts; dollars: RetentionDollars };
    /** Monthly count roll-forward for the strip and MC-C1; `startingCount` of month m equals `endingCount` of m−1. */
    monthly?: { month: MonthKey; counts: RetentionCounts }[];
    medianTenureYears: number;
  };
  concentration: {
    top: ConcentrationRow[];
    top10Share: number;
    top20Share: number;
    largestShare: number;
    remaining: number;
    total: number;
    /** Customer-list total vs P&L revenue (check C12). */
    tieToPnl: { customerTotal: number; pnlRevenue: number; variancePct: number };
  };
  cohorts?: {
    countTriangle: { cohort: number; size: number; retainedByYear: number[] }[];
    revenueTriangle: { cohort: number; revenue: number; retainedByYear: number[] }[];
  };
}

// --- Payroll analytics (guide 5.5) ---------------------------------------------------

export interface HeadcountAnalytics {
  asOf: string;
  latestHeadcount: number;
  latestFieldHeadcount: number;
  byDepartment: { department: string; count: number; totalComp: number; avgComp: number; pctRevenue: number; avgTenureYears: number }[];
  rollForwardByFiscalYear: Record<number, { start: number; hires: number; departures: number; departuresByType: Record<string, number>; end: number }>;
  /** Monthly hires and departures for MC-H1. */
  monthly?: { month: MonthKey; hires: number; departures: number; end: number }[];
  /** V51 buckets verbatim: "First 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "Over 2 Years". */
  tenureAtDeparture: { bucket: string; count: number }[];
  loadRatios: { revenuePerEmployee: number; revenuePerFieldEmployee: number; customersPerEmployee?: number; laborCostPctRevenue: number };
  /** Payroll register vs P&L payroll (check C13). */
  tieToPnl: { registerTotal: number; pnlPayroll: number; variancePct: number };
}

// --- Checks (guide 5.7) --------------------------------------------------------------

export type CheckStatus = "OK" | "CHECK" | "n.a.";

export interface CheckResult {
  /** "C01" … "C37". */
  id: string;
  check: string;
  tab: string;
  difference: number;
  tolerance: number;
  status: CheckStatus;
  note?: string;
}

// --- Valuation (internal; never in the CIM, guide D5) -----------------------------------

export interface ValuationSummary {
  method: "sde_multiple" | "adj_ebitda_multiple";
  multiples: { low: number; mid: number; high: number; source: string };
  enterpriseValue: { low: number; mid: number; high: number };
  equityValue: { low: number; mid: number; high: number };
  bridge: { fundedDebt: number; debtLike: number; cash: number; nwcVsPeg: number };
}

// --- Named outputs (guide 5.14) ---------------------------------------------------------

/** The defined names the workbook carries and the engine exposes under the same keys. `_FY` names are rows across the FY columns. */
export interface NamedOutputs {
  AsOfDate: string;
  FYEMonth: number;
  PrintMode: 0 | 1;
  MainStreetMode: boolean;
  DealForm: DealForm;
  Rev_FY: Record<number, number>;
  Rev_LTM: number | null;
  Rev_PF: number | null;
  GP_FY: Record<number, number>;
  GP_LTM: number | null;
  RepEBITDA_FY: Record<number, number>;
  RepEBITDA_LTM: number | null;
  SDE_FY: Record<number, number>;
  SDE_LTM: number | null;
  AdjEBITDA_FY: Record<number, number>;
  AdjEBITDA_LTM: number | null;
  PFAdjEBITDA: number;
  Customers_Latest: number | null;
  Top10Share_LTM: number | null;
  GDR_LTM: number | null;
  NDR_LTM: number | null;
  Headcount_Latest: number | null;
  NWC_Peg: number | null;
  NWC_Latest: number | null;
  NWC_vsPeg: number | null;
  DefRev_Latest: number | null;
  MasterCheck: string;
  LOIDate: string | null;
  SigningDate: string | null;
  EffectiveDate: string | null;
  ChartStart: MonthKey | null;
  ChartEnd: MonthKey | null;
  /** `Monthly_<line>` rows for S11.2, keyed by the line as `MonthlySeries.series` keys it. */
  Monthly: Record<string, number[]>;
  /** Real estate and offer names exist only when their tabs are built. */
  RE?: { GLA: number; OccupiedSF: number; RentInPlace: number; RentMarketBase: number; RentAdj_PF: number; NOI_InPlace: number; NOI_Base: number; Arrangement: string };
  Offer?: { Count: number; Reference: string; columns: { Headline: number; RiskAdj: number; CashAtClose: number; SellerMOIC: number; SellerIRR: number }[] };
}

// --- The whole thing ---------------------------------------------------------------------

/** What the rebuilt engine returns and the workbook writer and CIM consume. Superset of the legacy ModelResult. */
export interface ModelOutput extends ModelResult {
  mode: ModeDecision;
  dealForm: DealForm;
  /** "monthly" or "annual" (guide 5.2A). In annual mode only Full Year (and Pro Forma Low / Mid / High) columns exist. */
  granularity: "monthly" | "annual";
  /** "YYYY-MM-DD" (the last day of `asOfMonth`). */
  asOfDate: string;
  fiscalYearEndMonth: number;
  /** Columns in the 5.2 order: FY-2, FY-1, FY, YTD PY, YTD CY, LTM PY, LTM CY, PF (those that exist). Projections follow. */
  columns: PeriodColumn[];
  /** Values keyed by `PeriodColumn.key`. */
  periods: Record<string, PeriodValues>;
  /** The schedule with every row (all statuses) and its amount per column. */
  adjustments: { row: Adjustment; byColumn: Record<string, number> }[];
  monthly?: MonthlySeries;
  nwc?: NwcAnalysis;
  debtLike?: DebtLikeSummary;
  customers?: CustomerAnalytics;
  headcount?: HeadcountAnalytics;
  valuation: ValuationSummary;
  checks: CheckResult[];
  masterCheck: string;
  namedOutputs: NamedOutputs;
  /** Modules (guide 3.3 IDs) whose data trigger holds, and the ones that fail with the reason, for run-summary.md. */
  modules: { built: string[]; omitted: { id: string; reason: string }[] };
}

/** Convenience: the column of a kind, or undefined when the layout omits it. */
export function findColumn(out: ModelOutput, kind: PeriodRef["kind"], opts: { priorYear?: boolean; fiscalYear?: number } = {}): PeriodColumn | undefined {
  return out.columns.find(
    (c) =>
      c.ref.kind === kind &&
      c.priorYear === (opts.priorYear ?? false) &&
      (opts.fiscalYear === undefined || c.fiscalYear === opts.fiscalYear),
  );
}

/** The latest full window: LTM CY when monthly, otherwise the latest fiscal year. */
export function latestColumn(out: ModelOutput): PeriodColumn {
  const ltm = findColumn(out, "ltm");
  if (ltm) return ltm;
  const fy = out.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const last = fy[fy.length - 1];
  if (!last) throw new Error("Model output has no historical column");
  return last;
}

export const MODE_LABELS: Record<DealMode, string> = {
  mainStreet: "Main Street",
  lowerMiddleMarket: "Lower middle market",
};

// --- Additions by the model builder (all optional on ModelOutput, all additive) ------------------
//
// The workbook's data tabs, the historical cash flow, the deal structure and
// the sensitivity grids are computed by the engine so the verifier can
// compare every formula cell with a number. The CIM needs none of these.

import type { BsCategory, MappedLine, SourceKind } from "../domain/financials.ts";
import type { Assumptions } from "./assumptions.ts";

/** One Databook row: a mapped P&L account with its dollars by month (monthly mode) or by fiscal year. */
export interface DatabookRow {
  account: string;
  section?: string;
  category: IsCategory;
  summaryLine: string;
  /** Flagged as a likely personal or discretionary account (the "Personal?" column). */
  personal: boolean;
  /** Schedule ref the account backs, when one does ("N1"). */
  adjustmentRef?: string;
  source: SourceKind;
  file: string;
  mappedBy: MappedLine["mappedBy"];
  byMonth?: Record<MonthKey, number>;
  byFiscalYear: Record<number, number>;
}

/** One Databook balance-sheet row: a mapped account with its balance at every statement date. */
export interface DatabookBsRow {
  account: string;
  section?: string;
  category: BsCategory;
  source: SourceKind;
  file: string;
  mappedBy: MappedLine["mappedBy"];
  /** Keyed by the statement's "YYYY-MM" month. */
  byMonth: Record<MonthKey, number>;
}

export interface HistoricalCashFlowYear {
  fiscalYear: number;
  netIncome: number;
  da: number;
  dAr: number;
  dInv: number;
  dOca: number;
  dAp: number;
  dOcl: number;
  cfo: number;
  /** Derived: change in net fixed assets plus D&A, shown negative. */
  capex: number;
  cfi: number;
  dDebt: number;
  /** Derived balancing item: change in equity less net income, shown negative. */
  distributions: number;
  cff: number;
  netChange: number;
  beginCash: number;
  endCash: number;
  bsCash: number;
  freeCashFlow: number;
  /** Free cash flow ÷ Reported EBITDA. */
  cashConversion: number;
}

export interface FinancingCase {
  purchasePrice: number;
  equityInjection: number;
  loanPrincipal: number;
  termYears: number;
  rate: number;
  annualDebtService: number;
  /** SDE − market replacement compensation − capital reserve (Main Street), or PF Adj. EBITDA − maintenance capex. */
  cashFlowAvailable: number;
  dscr: number;
}

/** The Main Street valuation block of guide 5.5, one case per column. */
export interface MainStreetValuationCase {
  sde: number;
  multiple: number;
  businessValuation: number;
  deferredCapex: number;
  totalInvestment: number;
  impliedSdeMultiple: number;
  impliedAdjEbitdaMultiple: number;
  financing: FinancingCase;
}

export interface ValuationDetail {
  /** Period the earnings come from (LTM CY, or the latest FY in annual mode). */
  period: PeriodColumn;
  basis: { revenue: number; reportedEbitda: number; adjEbitda: number; pfAdjEbitda: number; sde: number };
  cases: { low: MainStreetValuationCase; mid: MainStreetValuationCase; high: MainStreetValuationCase };
  /** EV ÷ each earnings measure, per case. */
  impliedMultiples: Record<"low" | "mid" | "high", { reportedEbitda: number; adjEbitda: number; pfAdjEbitda: number; sde: number; revenue: number }>;
}

export interface SourcesAndUses {
  uses: { purchasePrice: number; transactionFees: number; workingCapitalFunding: number; reconciliationHoldback: number; total: number };
  sources: { seniorLoan: number; sellerNote: number; rolloverEquity: number; buyerEquity: number; total: number };
  check: number;
}

export interface SellerProceeds {
  purchasePrice: number;
  debtPaidAtClose: number;
  debtLikeItems: number;
  nwcVsPeg: number;
  reconciliationHoldback: number;
  transactionExpenses: number;
  indemnityEscrow: number;
  sellerNoteDeferred: number;
  closingCash: number;
  holdbackReleased: number;
  escrowReleased: number;
  sellerNotePrincipal: number;
  totalConsideration: number;
  /** Asset purchase memo: AR + unbilled − AP − accrued retained by the seller. */
  sellerRetainedNwc: number;
}

export interface DealStructureColumn {
  name: string;
  preset: string;
  purchasePrice: number;
  cashAtClosePct: number;
  cashAtClose: number;
  sellerNotePct: number;
  sellerNote: number;
  sellerNoteTermMonths: number;
  sellerNoteRate: number;
  escrowPct: number;
  escrow: number;
  escrowMonths: number;
  retentionHoldback: number;
  reconciliationHoldback: number;
  sourcesAndUses: SourcesAndUses;
  proceeds: SellerProceeds;
  debtService: { seniorLoan: number; sellerNote: number; total: number; cashFlowAvailable: number; dscr: number };
  /** The OFF14 term strings, formula-built in the workbook. */
  terms: Record<string, string>;
}

export interface SensitivityGrid {
  key: string;
  title: string;
  colAxis: { label: string; values: number[]; fmt: string };
  rowAxis: { label: string; values: number[]; fmt: string };
  /** body[rowIndex][colIndex]; the base case sits at the centre. */
  body: number[][];
  base: number;
  bodyFmt: string;
  note: string;
  hurdle?: number;
}

/** Annual-only mode (guide 5.2A): the Pro Forma Low / Mid / High block. */
export interface ProFormaScenario {
  name: "Low" | "Mid" | "High";
  revenueGrowth: number;
  pnl: PnlLines;
  ladder: Ladder;
  methods: Record<string, string>;
}

export interface ModelOutput {
  /** The assumptions the workbook echoes on its Assumptions tab and every formula reads. */
  assumptions?: Assumptions;
  databook?: { pnl: DatabookRow[]; bs: DatabookBsRow[] };
  cashFlow?: HistoricalCashFlowYear[];
  valuationDetail?: ValuationDetail;
  deal?: DealStructureColumn[];
  sensitivities?: SensitivityGrid[];
  scenarios?: ProFormaScenario[];
}
