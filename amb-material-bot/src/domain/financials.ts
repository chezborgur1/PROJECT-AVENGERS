// The canonical financial dataset every source normalises into.
//
// Sign convention: everything is stored as a positive magnitude the way a
// P&L or balance sheet presents it. Revenue is positive, expenses are
// positive, assets / liabilities / equity are positive. Contra lines keep
// their natural sign (refunds reduce revenue, accumulated depreciation
// reduces fixed assets) so a straight sum per category is correct.

export const IS_CATEGORIES = [
  "revenue",
  "cogs",
  "payroll",
  "owner_comp",
  "rent",
  "marketing",
  "other_opex",
  "depreciation_amortization",
  "interest_expense",
  "other_income",
  "other_expense",
  "income_tax",
] as const;

export const BS_CATEGORIES = [
  "cash",
  "accounts_receivable",
  "inventory",
  "other_current_assets",
  "fixed_assets_net",
  "other_assets",
  "accounts_payable",
  "other_current_liabilities",
  "debt",
  "equity",
] as const;

export type IsCategory = (typeof IS_CATEGORIES)[number];
export type BsCategory = (typeof BS_CATEGORIES)[number];
export type Category = IsCategory | BsCategory;

export const IS_LABELS: Record<IsCategory, string> = {
  revenue: "Revenue",
  cogs: "Cost of goods sold",
  payroll: "Salaries, wages & benefits",
  owner_comp: "Owner / officer compensation",
  rent: "Rent & occupancy",
  marketing: "Advertising & marketing",
  other_opex: "Other operating expenses",
  depreciation_amortization: "Depreciation & amortization",
  interest_expense: "Interest expense",
  other_income: "Other income",
  other_expense: "Other expense",
  income_tax: "Income taxes",
};

export const BS_LABELS: Record<BsCategory, string> = {
  cash: "Cash & equivalents",
  accounts_receivable: "Accounts receivable",
  inventory: "Inventory",
  other_current_assets: "Other current assets",
  fixed_assets_net: "Fixed assets, net",
  other_assets: "Other long-term assets",
  accounts_payable: "Accounts payable",
  other_current_liabilities: "Accrued & other current liabilities",
  debt: "Debt",
  equity: "Total equity",
};

export const ASSET_CATEGORIES: BsCategory[] = [
  "cash",
  "accounts_receivable",
  "inventory",
  "other_current_assets",
  "fixed_assets_net",
  "other_assets",
];
export const LIABILITY_CATEGORIES: BsCategory[] = [
  "accounts_payable",
  "other_current_liabilities",
  "debt",
];

export function isIsCategory(c: string): c is IsCategory {
  return (IS_CATEGORIES as readonly string[]).includes(c);
}
export function isBsCategory(c: string): c is BsCategory {
  return (BS_CATEGORIES as readonly string[]).includes(c);
}

/** Where a number came from, in order of how much we trust it. */
export const SOURCE_PRECEDENCE = [
  "quickbooks_api",
  "quickbooks_export",
  "tax_return",
  "financial_statement",
  "bank_statement",
] as const;
export type SourceKind = (typeof SOURCE_PRECEDENCE)[number];

export const SOURCE_LABELS: Record<SourceKind, string> = {
  quickbooks_api: "QuickBooks Online (API)",
  quickbooks_export: "QuickBooks export",
  tax_return: "Tax return",
  financial_statement: "Financial statements (PDF)",
  bank_statement: "Bank statements",
};

/** One line as a source presented it, before or after category mapping. */
export interface RawLine {
  account: string;
  /** Section heading the line sat under, e.g. "Income", "Cost of Goods Sold". */
  section?: string;
  year: number;
  amount: number;
  /** Set when the source already knows the category (AI extraction). */
  category?: Category;
}

export interface MappedLine extends RawLine {
  statement: "pnl" | "balance_sheet";
  category: Category;
  source: SourceKind;
  file: string;
  mappedBy: "override" | "source" | "rule" | "default";
}

/** What a single ingestor hands back. */
export interface SourceExtract {
  kind: SourceKind;
  file: string;
  pnlLines: RawLine[];
  bsLines: RawLine[];
  /** Fiscal years this source covers fully (12 months). */
  fullYears: number[];
  /** Bank statements only: total deposits by fiscal year. */
  deposits?: Record<number, { amount: number; months: number }>;
  notes?: string[];
}

export type AddbackType = "owner" | "discretionary" | "non_recurring" | "other";

export interface Addback {
  year: number;
  description: string;
  amount: number;
  type: AddbackType;
  source: string;
}

export interface SuggestedAddback {
  year: number;
  account: string;
  amount: number;
  reason: string;
}

export interface FinancialDataset {
  /** Full fiscal years with a P&L, ascending. */
  years: number[];
  pnl: Record<number, Record<IsCategory, number>>;
  /** Only years where a balance sheet was available. */
  balanceSheet: Record<number, Record<BsCategory, number>>;
  provenance: { year: number; pnl: SourceKind; balanceSheet?: SourceKind }[];
  lines: MappedLine[];
  /**
   * Flat seller add-backs, kept for the current pipeline. When `adjustments`
   * is present this list is derived from it (`addbacksFromSchedule`) and the
   * schedule is the source of truth.
   */
  addbacks: Addback[];
  suggestedAddbacks: SuggestedAddback[];
  /** Latest-year revenue split by account, for the CIM revenue-mix chart. */
  revenueMix: { label: string; amount: number }[];
  deposits: Record<number, { amount: number; months: number }>;
  warnings: string[];

  // --- Extended blocks. docs/build/DATA_CONTRACT.md states when each is present. ---

  /** Calendar month (1-12) the fiscal year ends in. Present whenever the request row is known. */
  fiscalYearEndMonth?: number;
  /** "monthly" when a category × month grid exists for ≥ 12 months; "annual" otherwise (guide 5.2A). */
  sourceGranularity?: SourceGranularity;
  /** Books basis per the source (tax return line F, QuickBooks report basis). Present when a source states it. */
  booksBasis?: BooksBasis;
  /** Last full month of P&L data; `AsOfDate` is its last day. Present when `monthly` is present. */
  asOfMonth?: MonthKey;
  /** Category × month grid every period column reads. Present when ≥ 12 contiguous months exist. */
  monthly?: MonthlyPnl;
  /** Every dated balance sheet (year-ends and month-ends), ascending. Present when any balance sheet exists. */
  balanceSheets?: BalanceSheetPeriod[];
  /** The adjustments schedule (guide 5.3). Present whenever a P&L exists: the definitional rows always exist. */
  adjustments?: Adjustment[];
  /** Inputs behind the S2 and S3 rows. Present with `adjustments`. */
  recastInputs?: RecastInputs;
  /** Revenue by account with descriptive facts merged from intake. Present when the P&L has a revenue account. */
  revenueLines?: RevenueLine[];
  /** Coded customer list. Present when a customer-level file was supplied. */
  customers?: CustomerList;
  /** Payroll register. Present when a payroll file was supplied. */
  payroll?: PayrollRegister;
  /** Named operating metrics with their period values. Present when at least one KPI was found. */
  kpis?: KpiSeries[];
  /** Structured facts transcribed from intake notes, each with provenance. Present when notes exist. */
  intake?: IntakeFacts;
  /** Main Street vs lower-middle-market decision (guide Q7). Present with `adjustments`. */
  mode?: ModeDecision;
  /** Equity vs asset purchase (guide 5.6). Present with `mode`. */
  dealForm?: DealFormDecision;
  /** Line-by-line differences between sources for the same year. Present (possibly empty) whenever the merge ran. */
  reconciliations?: SourceReconciliation[];
  /** Operating deposits by calendar month, transfers excluded. Present when a bank source was read. */
  depositsByMonth?: Record<MonthKey, { amount: number; excluded: number }>;
  /** Debt and debt-like items at the latest balance-sheet date (guide 5.6). Present when a balance sheet exists. */
  debtLikeItems?: DebtLikeItem[];
}

export function emptyPnl(): Record<IsCategory, number> {
  return Object.fromEntries(IS_CATEGORIES.map((c) => [c, 0])) as Record<IsCategory, number>;
}
export function emptyBs(): Record<BsCategory, number> {
  return Object.fromEntries(BS_CATEGORIES.map((c) => [c, 0])) as Record<BsCategory, number>;
}

/** Reported EBITDA from a normalised P&L year. */
export function ebitda(p: Record<IsCategory, number>): number {
  return (
    p.revenue -
    p.cogs -
    p.payroll -
    p.owner_comp -
    p.rent -
    p.marketing -
    p.other_opex
  );
}

// ===========================================================================
// Extended dataset for the rebuild (docs/HOUSE_STYLE.md section 5,
// docs/build/DATA_CONTRACT.md). Everything here is additive: the blocks hang
// off optional fields of FinancialDataset, so the current ingest path keeps
// compiling while the data, model and CIM builders code against them.
// ===========================================================================

export type SourceGranularity = "monthly" | "annual";
export type BooksBasis = "cash" | "accrual";
export type Evidence = "documented" | "management_representation";

// --- Months and periods ----------------------------------------------------

/** Calendar month as "YYYY-MM". The sort key wherever a month is addressed. */
export type MonthKey = string;

export interface MonthPeriod {
  key: MonthKey;
  /** Calendar year and month (1-12). */
  year: number;
  month: number;
  /** Fiscal year the month belongs to (guide D7: "FY2025"). */
  fiscalYear: number;
  /** 1-12 position within the fiscal year; 12 is the month that closes it. */
  fiscalMonth: number;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Not a month key (expected "YYYY-MM"): ${key}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Month out of range in ${key}`);
  return { year: Number(m[1]), month };
}

/** Fiscal year a calendar month belongs to: the year it ends in, or the next when the month is past the fiscal year-end. */
export function fiscalYearOf(year: number, month: number, fyEndMonth: number): number {
  return month <= fyEndMonth ? year : year + 1;
}

export function monthPeriod(key: MonthKey, fyEndMonth: number): MonthPeriod {
  const { year, month } = parseMonthKey(key);
  const fiscalYear = fiscalYearOf(year, month, fyEndMonth);
  const fiscalMonth = ((month - fyEndMonth - 1 + 24) % 12) + 1;
  return { key, year, month, fiscalYear, fiscalMonth };
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const idx = year * 12 + (month - 1) + n;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Months from `start` to `end` inclusive, ascending. */
export function monthRange(start: MonthKey, end: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = start; k <= end; k = addMonths(k, 1)) out.push(k);
  return out;
}

/** Last day of the month as "YYYY-MM-DD" (the `AsOfDate` for a month). */
export function monthEndDate(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${key}-${String(last).padStart(2, "0")}`;
}

/** "Jul-26": the one month vocabulary in both deliverables (guide D7). */
export function monthLabel(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_ABBR[month - 1]}-${String(year % 100).padStart(2, "0")}`;
}

/**
 * A period a value can be reported for. String keys (`periodKey`) index maps;
 * labels (`periodLabel`) are the printed vocabulary of guide D7.
 */
export type PeriodRef =
  | { kind: "fiscal_year"; fiscalYear: number }
  | { kind: "month"; key: MonthKey }
  | { kind: "ytd"; end: MonthKey }
  | { kind: "ltm"; end: MonthKey }
  | { kind: "pf"; end: MonthKey }
  /** A stock measured at a date (members, headcount, a balance sheet). */
  | { kind: "point"; date: string };

export function periodKey(ref: PeriodRef): string {
  switch (ref.kind) {
    case "fiscal_year":
      return `FY${ref.fiscalYear}`;
    case "month":
      return `M${ref.key}`;
    case "ytd":
      return `YTD${ref.end}`;
    case "ltm":
      return `LTM${ref.end}`;
    case "pf":
      return `PF${ref.end}`;
    case "point":
      return `AT${ref.date}`;
  }
}

export function parsePeriodKey(key: string): PeriodRef {
  let m = /^FY(\d{4})$/.exec(key);
  if (m) return { kind: "fiscal_year", fiscalYear: Number(m[1]) };
  m = /^M(\d{4}-\d{2})$/.exec(key);
  if (m) return { kind: "month", key: m[1]! };
  m = /^YTD(\d{4}-\d{2})$/.exec(key);
  if (m) return { kind: "ytd", end: m[1]! };
  m = /^LTM(\d{4}-\d{2})$/.exec(key);
  if (m) return { kind: "ltm", end: m[1]! };
  m = /^PF(\d{4}-\d{2})$/.exec(key);
  if (m) return { kind: "pf", end: m[1]! };
  m = /^AT(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) return { kind: "point", date: m[1]! };
  throw new Error(`Not a period key: ${key}`);
}

/** "FY2025", "Jul-26", "YTD Jul-26", "LTM Jul-26", "PF Jul-26", "07/31/26" (guide D7; 5.10 date format). */
export function periodLabel(ref: PeriodRef): string {
  switch (ref.kind) {
    case "fiscal_year":
      return `FY${ref.fiscalYear}`;
    case "month":
      return monthLabel(ref.key);
    case "ytd":
      return `YTD ${monthLabel(ref.end)}`;
    case "ltm":
      return `LTM ${monthLabel(ref.end)}`;
    case "pf":
      return `PF ${monthLabel(ref.end)}`;
    case "point": {
      const [y, mo, d] = ref.date.split("-");
      return `${mo}/${d}/${y!.slice(2)}`;
    }
  }
}

// --- Monthly P&L -----------------------------------------------------------

/** One mapped account with its amount in every month of the grid (the Databook row). */
export interface MonthlyLine {
  account: string;
  section?: string;
  category: IsCategory;
  source: SourceKind;
  file: string;
  mappedBy: MappedLine["mappedBy"];
  /** Amount per month; a month absent from the record is zero. */
  amounts: Record<MonthKey, number>;
}

export interface MonthlyPnl {
  /** Ascending, contiguous. The last entry is `asOfMonth`. */
  months: MonthPeriod[];
  /** Category totals per month: the `Monthly P&L` grid. Every month in `months` has an entry. */
  values: Record<MonthKey, Record<IsCategory, number>>;
  /** Account-level detail behind `values` (Databook). Sums to `values` per category and month (check C02). */
  lines: MonthlyLine[];
  /** Fiscal years every month of which is in the grid. */
  fullFiscalYears: number[];
  /** True when the last month closes its fiscal year, so LTM and FY coincide. */
  lastMonthClosesFiscalYear: boolean;
  source: SourceKind;
  file: string;
}

// --- Balance sheets by period ----------------------------------------------

/** Lines the NWC and debt-like schedules need that the ten BS categories fold together (guide 5.6). */
export const BS_DETAIL_LINES = [
  "unbilled",
  "prepaid",
  "accrued_liabilities",
  "deferred_revenue",
  "customer_deposits",
  "credit_cards",
  "current_portion_debt",
  "related_party_balances",
  "accrued_interest",
  "income_tax_payable",
  /** Due from a shareholder or related party, inside other current assets (removed from NWC, which lowers it). */
  "related_party_receivable",
] as const;
export type BsDetailLine = (typeof BS_DETAIL_LINES)[number];

export interface BalanceSheetPeriod {
  period: MonthPeriod;
  /** "YYYY-MM-DD", the statement date (always the month-end). */
  asOf: string;
  /** True for the balance sheet dated at the fiscal year-end (the `balanceSheet[fiscalYear]` entry). */
  fiscalYearEnd: boolean;
  values: Record<BsCategory, number>;
  /** Sub-lines carved out of `values` where the source shows them; each is included in its parent category. */
  detail?: Partial<Record<BsDetailLine, number>>;
  /** The mapped accounts of this sheet, so the Databook carries every dated sheet, not only the year-ends in `lines`. */
  lines?: MappedLine[];
  source: SourceKind;
  file: string;
}

// --- Adjustments schedule (guide 5.3) --------------------------------------

export const ADJUSTMENT_TIERS = ["definitional", "normalization", "owner_compensation", "pro_forma", "memo"] as const;
export type AdjustmentTier = (typeof ADJUSTMENT_TIERS)[number];

/** Ref prefix per tier: `[D1]`, `[N1]`, `[S1]`, `[PF1]`, `[M1]` (guide D8). */
export const ADJUSTMENT_TIER_CODES: Record<AdjustmentTier, string> = {
  definitional: "D",
  normalization: "N",
  owner_compensation: "S",
  pro_forma: "PF",
  memo: "M",
};

/** Tier names as the `Adjustments` tab prints them in column D. */
export const ADJUSTMENT_TIER_LABELS: Record<AdjustmentTier, string> = {
  definitional: "Definitional",
  normalization: "Normalization",
  owner_compensation: "Owner compensation",
  pro_forma: "Pro forma",
  memo: "Memo",
};

export const ADJUSTMENT_CATEGORIES = [
  "interest",
  "taxes",
  "da",
  "personal_discretionary",
  "non_recurring",
  "non_operating",
  "accounting",
  "related_party_rent",
  "owner_compensation",
  "replacement_cost",
  "capital_reserve",
  "run_rate",
  "other",
] as const;
export type AdjustmentCategory = (typeof ADJUSTMENT_CATEGORIES)[number];

/** Category names as the `Adjustments` tab prints them in column E (guide 5.3, plus Capital reserve for [S3]). */
export const ADJUSTMENT_CATEGORY_LABELS: Record<AdjustmentCategory, string> = {
  interest: "Interest",
  taxes: "Taxes",
  da: "D&A",
  personal_discretionary: "Personal / discretionary",
  non_recurring: "Non-recurring",
  non_operating: "Non-operating",
  accounting: "Accounting (cash to accrual, out of period)",
  related_party_rent: "Related-party (rent to market)",
  owner_compensation: "Owner compensation",
  replacement_cost: "Replacement cost",
  capital_reserve: "Capital reserve",
  run_rate: "Run-rate",
  other: "Other consideration",
};

export const ADJUSTMENT_STATUSES = ["proposed", "supported", "accepted", "excluded"] as const;
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

/** Pro forma methods, in AMB's terse method-first grammar (guide 5.2). */
export const PF_METHODS = [
  "Annualized most recent month",
  "Conservative approach for nonrecurring items",
  "Active employee roster",
  "Assuming no material change",
  "Contracted",
  "Market rate",
  "3-year average",
  "Latest year",
  "% of sales, 3-year blended",
] as const;
export type PfMethod = (typeof PF_METHODS)[number];

export type AdjustmentOrigin =
  | "pnl" // interest, taxes, D&A read off the P&L
  | "addbacks_csv" // the seller's list
  | "suggested" // bot-flagged account, amount 0 until an advisor enters it
  | "owner_comp" // the owner_comp category, all periods
  | "replacement_salary" // owner_replacement_salary × (1 + burden)
  | "capital_reserve" // Main Street mode only
  | "intake_notes"
  | "real_estate"
  | "advisor";

export interface Adjustment {
  /** Tier-prefixed, numbered by tier in schedule order: "D1", "N3", "S2", "PF1", "M1". No brackets. */
  ref: string;
  tier: AdjustmentTier;
  /** Client-grade label without a sign prefix: "Owner vehicle and phone". */
  description: string;
  category: AdjustmentCategory;
  /** One sentence, mechanism → quantum → source. */
  basis: string;
  /** "GL detail, account 6420"; "Seller add-back list"; "Lease agreement". */
  sourceDocument: string;
  evidence: Evidence;
  status: AdjustmentStatus;
  /** Positive increases EBITDA. One entry per fiscal year in `FinancialDataset.years`. */
  byFiscalYear: Record<number, number>;
  /** Monthly amounts when the row can be tied to months, so YTD and LTM are exact. Sums to `byFiscalYear`. */
  byMonth?: Record<MonthKey, number>;
  /** Pro forma rows: the P&L line the adjustment restates, and how. */
  pnlLine?: IsCategory;
  pfMethod?: PfMethod;
  origin: AdjustmentOrigin;
  /** File the row was built from, when there is one. */
  sourceFile?: string;
  /** P&L accounts (as exported) whose months the row's `byMonth` follows, so the workbook can write each month as a proportion of them. */
  accounts?: string[];
  /**
   * How `byMonth` fills the partial current year no full fiscal year covers:
   * the advisor's YTD amount, a run-rate of the latest full year, or zero
   * (a one-time item). Absent when there is no such stub.
   */
  stub?: "amount" | "run_rate" | "zero";
}

export interface RecastInputs {
  /** Market replacement salary for one working owner (request row `owner_replacement_salary`, default $85,000). */
  replacementSalary: number;
  replacementSalarySource: string;
  /** Payroll-tax and benefits burden applied to the replacement salary (AMB default 15%, guide Q8). */
  burdenPct: number;
  burdenSource: string;
  /** Capital reserve deducted below SDE in Main Street mode ([S3], guide 5.4). */
  capitalReserve?: {
    amount: number;
    basis: "form_4562" | "da_proxy" | "advisor";
    source: string;
  };
  /** The working owner(s) whose pay [S1] adds back. */
  owners: { name: string; role: string; compensationByFiscalYear: Record<number, number> }[];
}

// --- Revenue lines -----------------------------------------------------------

export interface RevenueLine {
  /** Account as exported ("Service Revenue - Residential"). */
  account: string;
  /** Client-grade label for the CIM ("Residential service and replacement"). */
  label: string;
  byFiscalYear: Record<number, number>;
  byMonth?: Record<MonthKey, number>;
  recurring: boolean;
  /** From intake facts; left undefined (not guessed) when the notes do not say. */
  whatTheCustomerBuys?: string;
  pricingBasis?: string;
  /** Contra-revenue accounts (discounts, refunds) are shown netted, never as a service line. */
  contra: boolean;
}

// --- Customers ---------------------------------------------------------------

export type LossReason = "regrettable" | "non_regrettable" | "unclassified";

export type ContractBasis = "maintenance_agreement" | "contract" | "recurring" | "time_and_materials" | "project" | "other";

export interface CustomerRecord {
  /** Coded id ("C-001"), assigned by latest-full-year revenue descending. The only id the CIM shows. */
  id: string;
  /** Real name. Never leaves the data layer except onto a `Raw - Customers` tab. */
  name?: string;
  /** Deal vocabulary ("Property manager", "Restaurant group"); drives the S4.1 mix. */
  type?: string;
  /** Optional second grouping: market, geography or service. */
  segment?: string;
  /** "YYYY-MM-DD". First invoice or contract start. */
  startDate?: string;
  /** "YYYY-MM-DD". Last invoice or termination; undefined while active. */
  endDate?: string;
  lossReason?: LossReason;
  revenueByFiscalYear: Record<number, number>;
  revenueByMonth?: Record<MonthKey, number>;
  contractBasis?: ContractBasis;
  contract?: { term?: string; renewalDate?: string; noticeDays?: number; autoRenews?: boolean };
}

export interface CustomerList {
  customers: CustomerRecord[];
  /** Customers the source does not list individually (households on a service business), so the total ties to the P&L. */
  residual?: {
    label: string;
    revenueByFiscalYear: Record<number, number>;
    countByFiscalYear?: Record<number, number>;
  };
  /** "Customer" or "Client", one term per deal (guide D11). */
  term: "Customer" | "Client";
  /** Last month the list covers; strips truncate to the dataset's `asOfMonth` (guide Q33). */
  asOfMonth: MonthKey;
  /** Customer revenue plus residual, per fiscal year, for check C12 against the P&L. */
  totalsByFiscalYear: Record<number, number>;
  source: string;
  file: string;
}

// --- Payroll -----------------------------------------------------------------

export type PayBasis = "hourly" | "salary" | "hourly_plus_commission" | "contractor";
export type TerminationType = "resignation" | "termination" | "unclassified";
export type PostCloseIntent = "stays" | "undecided" | "leaves" | "unknown";

export interface PayrollRecord {
  /** "E-01". */
  id: string;
  /** Real name. In the CIM only for management (guide Q12), via `IntakeFacts.management`. */
  name?: string;
  role: string;
  department: string;
  isOwner: boolean;
  isManagement: boolean;
  /** "YYYY-MM-DD". */
  hireDate: string;
  terminationDate?: string;
  terminationType?: TerminationType;
  payBasis: PayBasis;
  fte: number;
  /** Gross wages per fiscal year. For the owner: the owner_comp line. */
  wagesByFiscalYear: Record<number, number>;
  /** Employer taxes and benefits allocated to the employee; wages + employer costs tie to the P&L payroll category (check C13). */
  employerCostsByFiscalYear: Record<number, number>;
}

export interface PayrollRegister {
  employees: PayrollRecord[];
  asOfMonth: MonthKey;
  /** Wages + employer costs of non-owner employees per fiscal year (ties to `pnl[fy].payroll`). */
  totalsByFiscalYear: Record<number, number>;
  source: string;
  file: string;
}

// --- KPIs --------------------------------------------------------------------

export type KpiUnit = "count" | "currency" | "percent" | "ratio" | "hours" | "rating" | "sq_ft" | "miles";

export interface KpiSeries {
  /** Stable key ("maintenance_members", "renewal_rate"). */
  key: string;
  label: string;
  unit: KpiUnit;
  /** Keyed by `periodKey()`. */
  values: Record<string, number>;
  definition?: string;
  source: string;
  evidence: Evidence;
}

// --- Intake facts ------------------------------------------------------------

export interface Provenance {
  /** File name or "Intake call <date>". */
  source: string;
  /** Heading or line the fact sits under, so a reviewer can find it. */
  locator?: string;
  evidence: Evidence;
}

export type PremisesArrangement =
  | "leased_from_third_party"
  | "owned_by_seller_offered_for_lease"
  | "owned_by_seller_offered_for_sale"
  | "owned_by_operating_company";

export interface LocationFact {
  name: string;
  function: string;
  address?: string;
  sizeSqFt?: number;
  arrangement: PremisesArrangement;
  leaseExpiry?: string;
  renewalOptions?: string;
  landlordRelatedParty?: boolean;
  source: Provenance;
}

export interface ManagementFact {
  name: string;
  role: string;
  /** "YYYY-MM" or "YYYY" the person joined. */
  since?: string;
  responsibilities: string[];
  postCloseIntent: PostCloseIntent;
  source: Provenance;
}

export interface OwnerResponsibility {
  responsibility: string;
  hoursPerWeek?: number;
  assumedBy?: string;
  transitionSupport?: string;
  source: Provenance;
}

export interface GrowthLever {
  lever: string;
  /** What is true today, stated as the notes state it ("offered on ~35% of service calls"). */
  baseline?: string;
  /** A benchmark or management target that would size the lever; undefined when the notes give none. */
  target?: string;
  mechanism: string;
  proofPoint?: string;
  source: Provenance;
}

export interface IntakeFacts {
  company: {
    legalName: string;
    tradingName?: string;
    description?: string;
    founded?: number;
    founderBackground?: string;
    headquarters?: { city: string; state: string };
    serviceArea?: string;
    ownership?: string;
    certifications: { name: string; since?: number; source: Provenance }[];
    licenses: { name: string; source: Provenance }[];
    reputation: { metric: string; value: string; source: Provenance }[];
    source: Provenance;
  };
  locations: LocationFact[];
  systems: { function: string; system: string; note?: string; source: Provenance }[];
  suppliers: { name: string; supplies: string; terms?: string; source: Provenance }[];
  fleetAndEquipment: { item: string; count?: number; ownership: string; note?: string; source: Provenance }[];
  customerFacts: { fact: string; source: Provenance }[];
  workforce: {
    headcount?: number;
    asOf?: string;
    composition: { role: string; count: number }[];
    payBasis?: string;
    union?: boolean;
    source: Provenance;
  };
  management: ManagementFact[];
  owner: {
    name: string;
    role: string;
    age?: number;
    hoursPerWeek?: number;
    responsibilities: OwnerResponsibility[];
    transition: { months?: number; basis?: string; description: string; source: Provenance };
    source: Provenance;
  };
  growthLevers: GrowthLever[];
  reasonForSale: { text: string; source: Provenance };
  transaction: {
    dealFormPreference?: "asset" | "equity" | "either";
    timing?: string;
    keepName?: boolean;
    keepEmployees?: boolean;
    sellerFinancing?: string;
    replacementSalary?: { amount: number; source: Provenance };
    notes: { text: string; source: Provenance }[];
  };
  milestones: { year: number; event: string; effect?: string; source: Provenance }[];
  competitors: { name: string; type: "national" | "regional" | "local"; positioning: string; source: Provenance }[];
  /** Sourced market inputs only; the bot never estimates a market size (guide S3). */
  marketInputs: { metric: string; value: string; source: Provenance }[];
}

// --- Mode, deal form, reconciliation, debt-like items -------------------------

export type DealMode = "mainStreet" | "lowerMiddleMarket";

/** PF Adj. EBITDA below this is Main Street (guide Q7). */
export const MAIN_STREET_THRESHOLD = 1_000_000;

export interface ModeDecision {
  mode: DealMode;
  /** PF Adj. EBITDA the rule was evaluated on, before any [S3] capital reserve, in dollars. */
  measure: number;
  /** Period the measure comes from, e.g. "PF Dec-25". */
  measureLabel: string;
  threshold: number;
  /** True when an advisor set the mode rather than the rule. */
  overridden: boolean;
}

export type DealForm = "equity_purchase" | "asset_purchase";

export interface DealFormDecision {
  form: DealForm;
  /** "default_from_mode" or the intake fact / advisor instruction that set it. */
  basis: string;
}

export type ReconciledLine = "revenue" | "cogs" | "total_expenses" | "net_income";

export interface SourceReconciliation {
  fiscalYear: number;
  line: ReconciledLine;
  chosen: { source: SourceKind; file: string; amount: number };
  other: { source: SourceKind; file: string; amount: number };
  /** chosen − other. */
  difference: number;
  /** difference ÷ chosen; NaN when chosen is zero. */
  differencePct: number;
  /** True above the 2% threshold that triggers S7.4 (guide 3.3). */
  material: boolean;
  explanation?: string;
}

export type DebtLikeTreatment = "debt" | "debt_like" | "nwc";

export interface DebtLikeItem {
  item: string;
  balance: number;
  /** "YYYY-MM-DD". */
  asOf: string;
  treatment: DebtLikeTreatment;
  /** Balance-sheet account(s) the item comes from. */
  accounts: string[];
  source: string;
  status: "confirmed" | "estimated" | "open";
  /** Asset purchase only. */
  payoffLetter?: "received" | "requested" | "n/a";
  note?: string;
}

// --- Derivations shared by the builders -------------------------------------

/** Legacy add-back type for a schedule row, so the flat list stays derivable. */
export function addbackTypeOf(a: Adjustment): AddbackType {
  if (a.tier === "owner_compensation") return "owner";
  if (a.category === "personal_discretionary") return "discretionary";
  if (a.category === "non_recurring") return "non_recurring";
  return "other";
}

/**
 * The flat `addbacks` list derived from the schedule: normalization rows that
 * are not excluded and carry an amount. Rows read off the P&L itself (origin
 * "pnl", such as the removal of non-operating interest income) are left out,
 * because the legacy engine's EBITDA already excludes other income; so are the
 * definitional and owner-compensation tiers, which it derives on its own.
 */
export function addbacksFromSchedule(adjustments: Adjustment[]): Addback[] {
  const out: Addback[] = [];
  for (const a of adjustments) {
    if (a.tier !== "normalization" || a.status === "excluded" || a.origin === "pnl") continue;
    for (const [year, amount] of Object.entries(a.byFiscalYear)) {
      if (amount === 0) continue;
      out.push({ year: Number(year), description: a.description, amount, type: addbackTypeOf(a), source: a.sourceFile ?? a.sourceDocument });
    }
  }
  return out;
}

/**
 * Assign refs by tier in schedule order ("D1", "D2", "N1", …), the same
 * numbering the workbook's COUNTIF formula produces when the rows are written
 * in this order. Returns a new array; input order is preserved.
 */
export function numberAdjustments(adjustments: Omit<Adjustment, "ref">[]): Adjustment[] {
  const counts: Partial<Record<AdjustmentTier, number>> = {};
  return adjustments.map((a) => {
    const n = (counts[a.tier] ?? 0) + 1;
    counts[a.tier] = n;
    return { ...a, ref: `${ADJUSTMENT_TIER_CODES[a.tier]}${n}` };
  });
}

/** Sum of a schedule row over a window of months, or the prorated fiscal-year amounts when the row has no months. */
export function adjustmentInWindow(a: Adjustment, months: MonthKey[], fyEndMonth: number): number {
  if (a.byMonth) return months.reduce((s, m) => s + (a.byMonth![m] ?? 0), 0);
  const perYear = new Map<number, number>();
  for (const m of months) {
    const { year, month } = parseMonthKey(m);
    const fy = fiscalYearOf(year, month, fyEndMonth);
    perYear.set(fy, (perYear.get(fy) ?? 0) + 1);
  }
  let total = 0;
  for (const [fy, n] of perYear) total += ((a.byFiscalYear[fy] ?? 0) * n) / 12;
  return total;
}

/**
 * A schedule row's amount in the PF column (window = the LTM months) or, in
 * annual-only mode (no window), in the latest fiscal year. Pro forma rows are
 * annual run-rates applied in full to the PF column and have no meaning in a
 * fiscal-year column (`null`). The engine's PF column and the data layer's
 * Main Street test both use this, so the mode and the headline read one number.
 */
export function pfColumnAmount(a: Pick<Adjustment, "tier" | "byFiscalYear" | "byMonth">, window: MonthKey[] | undefined, latestFy: number, fyEndMonth: number): number | null {
  if (!window) return a.tier === "pro_forma" ? null : (a.byFiscalYear[latestFy] ?? 0);
  if (a.tier === "pro_forma" && !a.byMonth) return a.byFiscalYear[latestFy] ?? 0;
  return adjustmentInWindow(a as Adjustment, window, fyEndMonth);
}

/** Sum of P&L categories over a window of the monthly grid. Months missing from the grid contribute nothing. */
export function sumMonths(grid: MonthlyPnl, months: MonthKey[]): Record<IsCategory, number> {
  const out = emptyPnl();
  for (const m of months) {
    const v = grid.values[m];
    if (!v) continue;
    for (const c of IS_CATEGORIES) out[c] += v[c];
  }
  return out;
}

/** The trailing-12 window ending at `end`, or undefined when the grid does not cover it. */
export function ltmWindow(grid: MonthlyPnl, end: MonthKey): MonthKey[] | undefined {
  const start = addMonths(end, -11);
  const first = grid.months[0]?.key;
  const last = grid.months[grid.months.length - 1]?.key;
  if (!first || !last || start < first || end > last) return undefined;
  return monthRange(start, end);
}

/** Fiscal-year-to-date window ending at `end`, bounded at the fiscal year's first month (guide 5.2). */
export function ytdWindow(grid: MonthlyPnl, end: MonthKey, fyEndMonth: number): MonthKey[] | undefined {
  const p = monthPeriod(end, fyEndMonth);
  const start = addMonths(end, -(p.fiscalMonth - 1));
  const first = grid.months[0]?.key;
  const last = grid.months[grid.months.length - 1]?.key;
  if (!first || !last || start < first || end > last) return undefined;
  return monthRange(start, end);
}

/** Main Street when PF Adj. EBITDA (before any capital reserve) is below the threshold (guide Q7). */
export function decideMode(pfAdjEbitdaBeforeReserve: number, measureLabel: string): ModeDecision {
  return {
    mode: pfAdjEbitdaBeforeReserve < MAIN_STREET_THRESHOLD ? "mainStreet" : "lowerMiddleMarket",
    measure: pfAdjEbitdaBeforeReserve,
    measureLabel,
    threshold: MAIN_STREET_THRESHOLD,
    overridden: false,
  };
}
