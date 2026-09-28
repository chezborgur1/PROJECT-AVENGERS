// A fully populated extended FinancialDataset for Project Ridgeline, the
// fictional HVAC sample in samples/project-ridgeline/. The annual figures are
// the sample's QuickBooks exports to the dollar; everything the sample does
// not carry (months, customers, payroll, the schedule) is generated here,
// deterministically, so the three builders can test against one dataset.
//
// Nothing here is real client data.

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import {
  addbacksFromSchedule,
  decideMode,
  emptyBs,
  emptyPnl,
  monthEndDate,
  monthKey,
  monthPeriod,
  numberAdjustments,
  periodKey,
  IS_CATEGORIES,
  type Adjustment,
  type BalanceSheetPeriod,
  type BsCategory,
  type CustomerRecord,
  type FinancialDataset,
  type IntakeFacts,
  type IsCategory,
  type KpiSeries,
  type LossReason,
  type MappedLine,
  type MonthKey,
  type MonthlyLine,
  type MonthlyPnl,
  type PayrollRecord,
  type Provenance,
  type RevenueLine,
  type SuggestedAddback,
  type TerminationType,
} from "../../src/domain/financials.ts";
import { addbackHint } from "../../src/domain/chartOfAccounts.ts";

export const FY_END_MONTH = 12;
export const YEARS = [2023, 2024, 2025] as const;
export const FIRST_MONTH: MonthKey = "2023-01";
export const AS_OF_MONTH: MonthKey = "2025-12";

const SAMPLE_DIR = path.resolve(import.meta.dirname, "../../samples/project-ridgeline");
const PNL_FILE = "QuickBooks Profit and Loss FY23-FY25.csv";
const BS_FILE = "QuickBooks Balance Sheet FY23-FY25.csv";
const BANK_FILE = "Bank transactions 2025 (checking).csv";
const ADDBACKS_FILE = "addbacks.csv";
const NOTES_FILE = "intake-notes.md";

/** The annual revenue the monthly grid must sum to. */
export const ANNUAL_REVENUE: Record<number, number> = { 2023: 2_406_800, 2024: 2_718_600, 2025: 3_040_800 };

type Triple = [number, number, number];
const byYear = (t: Triple): Record<number, number> => ({ 2023: t[0], 2024: t[1], 2025: t[2] });

// ---------------------------------------------------------------------------
// Monthly split: seasonal weights per account, largest-remainder rounding so
// every month is a whole dollar and the twelve tie to the annual exactly.
// ---------------------------------------------------------------------------

const SHAPES = {
  flat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // Residential HVAC: summer peak, a smaller heating peak, shoulder troughs.
  residential: [0.95, 0.85, 0.8, 0.85, 1.0, 1.2, 1.3, 1.2, 1.0, 0.85, 0.9, 1.1],
  commercial: [0.95, 0.9, 0.9, 0.95, 1.0, 1.1, 1.15, 1.1, 1.05, 0.95, 0.95, 1.0],
  // Field wages, fuel and vehicles: summer overtime, mild otherwise.
  field: [0.92, 0.9, 0.95, 0.98, 1.02, 1.1, 1.15, 1.1, 1.02, 0.96, 0.94, 0.96],
  marketing: [0.8, 0.9, 1.2, 1.3, 1.2, 1.0, 0.9, 0.9, 1.1, 1.2, 0.8, 0.7],
  charity: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.0, 6.0],
  utilities: [1.2, 1.15, 1.0, 0.9, 0.85, 1.0, 1.1, 1.1, 0.9, 0.85, 0.95, 1.0],
  repairs: [1.1, 0.9, 1.0, 1.2, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 0.9],
  // Interest falls through the year as the loans amortize.
  interest: [1.1, 1.08, 1.06, 1.04, 1.02, 1.0, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88],
} as const;
type ShapeName = keyof typeof SHAPES;

/** Growth inside the year (about 1% a month) so the revenue lines trend up rather than repeat. */
function withRamp(shape: readonly number[], monthlyGrowth = 0.01): number[] {
  return shape.map((w, i) => w * (1 + monthlyGrowth * (i + 1 - 6.5)));
}

/** Split an integer total across weights so the parts are integers summing exactly to it. */
export function splitAnnual(total: number, weights: readonly number[]): number[] {
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const wsum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (abs * w) / wsum);
  const parts = raw.map(Math.floor);
  let remainder = abs - parts.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i]! += 1;
    remainder -= 1;
  }
  return parts.map((v) => sign * v);
}

function monthsOf(year: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => monthKey(year, i + 1));
}

/** Twelve months for one fiscal year of an account: the shaped split plus any dated lump sums. */
function monthlyFor(total: number, shape: readonly number[], year: number, lumps: Record<MonthKey, number> = {}): Record<MonthKey, number> {
  const lumpTotal = Object.values(lumps).reduce((s, v) => s + v, 0);
  const parts = splitAnnual(total - lumpTotal, shape);
  const out: Record<MonthKey, number> = {};
  monthsOf(year).forEach((m, i) => {
    out[m] = parts[i]! + (lumps[m] ?? 0);
  });
  return out;
}

// ---------------------------------------------------------------------------
// The P&L as the sample prints it, one row per account.
// ---------------------------------------------------------------------------

interface AccountSpec {
  account: string;
  section: string;
  category: IsCategory;
  amounts: Triple;
  shape: number[];
  mappedBy: MappedLine["mappedBy"];
  lumps?: Partial<Record<number, Record<MonthKey, number>>>;
}

const PNL_ACCOUNTS: AccountSpec[] = [
  { account: "Maintenance Agreements", section: "Income", category: "revenue", amounts: [214_600, 248_300, 289_400], shape: withRamp(SHAPES.flat), mappedBy: "rule" },
  { account: "Service Revenue - Commercial", section: "Income", category: "revenue", amounts: [598_200, 702_500, 811_700], shape: withRamp(SHAPES.commercial), mappedBy: "rule" },
  { account: "Service Revenue - Residential", section: "Income", category: "revenue", amounts: [1_612_400, 1_788_900, 1_964_300], shape: withRamp(SHAPES.residential), mappedBy: "rule" },
  { account: "Discounts Given", section: "Income", category: "revenue", amounts: [-18_400, -21_100, -24_600], shape: withRamp(SHAPES.residential), mappedBy: "rule" },
  { account: "Equipment & Materials", section: "Cost of Goods Sold", category: "cogs", amounts: [842_300, 939_200, 1_040_600], shape: withRamp(SHAPES.residential), mappedBy: "rule" },
  { account: "Subcontractors", section: "Cost of Goods Sold", category: "cogs", amounts: [96_500, 108_700, 118_300], shape: withRamp(SHAPES.commercial), mappedBy: "rule" },
  { account: "Advertising & Marketing", section: "Expenses", category: "marketing", amounts: [64_800, 71_200, 79_600], shape: [...SHAPES.marketing], mappedBy: "rule" },
  { account: "Charitable Contributions", section: "Expenses", category: "other_opex", amounts: [5_000, 6_000, 7_500], shape: [...SHAPES.charity], mappedBy: "rule" },
  { account: "Depreciation Expense", section: "Expenses", category: "depreciation_amortization", amounts: [61_200, 66_800, 72_400], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Fuel", section: "Expenses", category: "other_opex", amounts: [52_100, 55_300, 58_800], shape: [...SHAPES.field], mappedBy: "rule" },
  { account: "Insurance", section: "Expenses", category: "other_opex", amounts: [38_600, 41_200, 44_900], shape: [...SHAPES.flat], mappedBy: "rule" },
  {
    account: "Legal & Professional Fees",
    section: "Expenses",
    category: "other_opex",
    amounts: [16_400, 38_900, 17_200],
    shape: [...SHAPES.flat],
    mappedBy: "rule",
    // The FY2024 settlement the seller lists as a one-time add-back.
    lumps: { 2024: { "2024-06": 12_000, "2024-07": 12_000 } },
  },
  { account: "Meals & Entertainment", section: "Expenses", category: "other_opex", amounts: [9_800, 11_200, 12_600], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Office Supplies", section: "Expenses", category: "other_opex", amounts: [7_900, 8_300, 8_800], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Payroll Expenses : Officer Compensation", section: "Expenses", category: "owner_comp", amounts: [180_000, 190_000, 200_000], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Payroll Expenses : Technician Wages", section: "Expenses", category: "payroll", amounts: [512_400, 581_300, 648_900], shape: [...SHAPES.field], mappedBy: "rule" },
  { account: "Payroll Expenses : Office Wages", section: "Expenses", category: "payroll", amounts: [118_200, 124_600, 131_400], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Payroll Expenses : Taxes", section: "Expenses", category: "payroll", amounts: [58_700, 65_400, 72_300], shape: [...SHAPES.field], mappedBy: "rule" },
  { account: "Payroll Expenses : Health Insurance", section: "Expenses", category: "payroll", amounts: [41_300, 46_800, 52_100], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Rent - Shop & Office", section: "Expenses", category: "rent", amounts: [72_000, 74_160, 76_385], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Repairs & Maintenance", section: "Expenses", category: "other_opex", amounts: [12_300, 13_100, 14_400], shape: [...SHAPES.repairs], mappedBy: "rule" },
  { account: "Software & Subscriptions", section: "Expenses", category: "other_opex", amounts: [18_900, 21_400, 23_800], shape: [...SHAPES.flat], mappedBy: "override" },
  { account: "Utilities", section: "Expenses", category: "other_opex", amounts: [14_200, 14_900, 15_600], shape: [...SHAPES.utilities], mappedBy: "rule" },
  { account: "Vehicle Expenses", section: "Expenses", category: "other_opex", amounts: [88_400, 94_700, 101_200], shape: [...SHAPES.field], mappedBy: "rule" },
  { account: "Interest Income", section: "Other Income", category: "other_income", amounts: [1_200, 2_400, 3_100], shape: [...SHAPES.flat], mappedBy: "rule" },
  { account: "Interest Expense", section: "Other Expenses", category: "interest_expense", amounts: [22_400, 18_600, 14_300], shape: [...SHAPES.interest], mappedBy: "rule" },
];

function accountMonths(spec: AccountSpec): Record<MonthKey, number> {
  const out: Record<MonthKey, number> = {};
  YEARS.forEach((y, i) => Object.assign(out, monthlyFor(spec.amounts[i]!, spec.shape, y, spec.lumps?.[y])));
  return out;
}

function buildMonthly(): { monthly: MonthlyPnl; accountMonthly: Map<string, Record<MonthKey, number>> } {
  const accountMonthly = new Map<string, Record<MonthKey, number>>();
  const lines: MonthlyLine[] = PNL_ACCOUNTS.map((spec) => {
    const amounts = accountMonths(spec);
    accountMonthly.set(spec.account, amounts);
    return { account: spec.account, section: spec.section, category: spec.category, source: "quickbooks_export", file: PNL_FILE, mappedBy: spec.mappedBy, amounts };
  });
  const months = YEARS.flatMap((y) => monthsOf(y)).map((k) => monthPeriod(k, FY_END_MONTH));
  const values: MonthlyPnl["values"] = {};
  for (const m of months) {
    const v = emptyPnl();
    for (const l of lines) v[l.category] += l.amounts[m.key] ?? 0;
    values[m.key] = v;
  }
  return {
    monthly: { months, values, lines, fullFiscalYears: [...YEARS], lastMonthClosesFiscalYear: true, source: "quickbooks_export", file: PNL_FILE },
    accountMonthly,
  };
}

function annualPnl(): FinancialDataset["pnl"] {
  const pnl: FinancialDataset["pnl"] = {};
  YEARS.forEach((y, i) => {
    const v = emptyPnl();
    for (const spec of PNL_ACCOUNTS) v[spec.category] += spec.amounts[i]!;
    pnl[y] = v;
  });
  return pnl;
}

function pnlLines(): MappedLine[] {
  return YEARS.flatMap((y, i) =>
    PNL_ACCOUNTS.map<MappedLine>((spec) => ({
      account: spec.account,
      section: spec.section,
      year: y,
      amount: spec.amounts[i]!,
      category: spec.category,
      statement: "pnl",
      source: "quickbooks_export",
      file: PNL_FILE,
      mappedBy: spec.mappedBy,
    })),
  );
}

// ---------------------------------------------------------------------------
// Balance sheets: the three year-ends the sample carries.
// ---------------------------------------------------------------------------

interface BsAccountSpec {
  account: string;
  section: string;
  category: BsCategory;
  amounts: Triple;
}

const BS_ACCOUNTS: BsAccountSpec[] = [
  { account: "Current Assets : Bank Accounts : Business Checking", section: "ASSETS > Current Assets > Bank Accounts", category: "cash", amounts: [128_700, 142_300, 186_400] },
  { account: "Current Assets : Bank Accounts : Business Savings", section: "ASSETS > Current Assets > Bank Accounts", category: "cash", amounts: [170_000, 90_000, 52_215] },
  { account: "Current Assets : Accounts Receivable : Accounts Receivable (A/R)", section: "ASSETS > Current Assets > Accounts Receivable", category: "accounts_receivable", amounts: [198_400, 221_800, 248_600] },
  { account: "Current Assets : Other Current Assets : Inventory Asset", section: "ASSETS > Current Assets > Other Current Assets", category: "inventory", amounts: [79_500, 88_100, 96_300] },
  { account: "Current Assets : Other Current Assets : Prepaid Expenses", section: "ASSETS > Current Assets > Other Current Assets", category: "other_current_assets", amounts: [11_800, 12_900, 14_200] },
  { account: "Fixed Assets : Vehicles", section: "ASSETS > Fixed Assets", category: "fixed_assets_net", amounts: [512_000, 548_000, 612_000] },
  { account: "Fixed Assets : Equipment", section: "ASSETS > Fixed Assets", category: "fixed_assets_net", amounts: [158_000, 171_000, 184_000] },
  { account: "Fixed Assets : Accumulated Depreciation", section: "ASSETS > Fixed Assets", category: "fixed_assets_net", amounts: [-307_440, -366_100, -438_500] },
  { account: "Other Assets : Security Deposit", section: "ASSETS > Other Assets", category: "other_assets", amounts: [12_000, 12_000, 12_000] },
  { account: "Current Liabilities : Accounts Payable : Accounts Payable (A/P)", section: "Liabilities > Current Liabilities > Accounts Payable", category: "accounts_payable", amounts: [96_200, 104_700, 118_400] },
  { account: "Current Liabilities : Credit Cards : Business Credit Card", section: "Liabilities > Current Liabilities > Credit Cards", category: "debt", amounts: [10_800, 12_100, 14_600] },
  { account: "Current Liabilities : Other Current Liabilities : Accrued Payroll", section: "Liabilities > Current Liabilities > Other Current Liabilities", category: "other_current_liabilities", amounts: [30_100, 34_600, 38_900] },
  { account: "Current Liabilities : Other Current Liabilities : Sales Tax Payable", section: "Liabilities > Current Liabilities > Other Current Liabilities", category: "other_current_liabilities", amounts: [4_900, 5_400, 6_200] },
  { account: "Current Liabilities : Other Current Liabilities : Customer Deposits", section: "Liabilities > Current Liabilities > Other Current Liabilities", category: "other_current_liabilities", amounts: [16_500, 19_800, 22_400] },
  { account: "Long-Term Liabilities : Vehicle Loans", section: "Liabilities > Long-Term Liabilities", category: "debt", amounts: [182_600, 168_300, 146_800] },
  { account: "Long-Term Liabilities : SBA Loan", section: "Liabilities > Long-Term Liabilities", category: "debt", amounts: [172_000, 146_000, 118_000] },
  { account: "Common Stock", section: "Equity", category: "equity", amounts: [1_000, 1_000, 1_000] },
  { account: "Retained Earnings", section: "Equity", category: "equity", amounts: [494_260, 448_860, 428_100] },
  { account: "Shareholder Distributions", section: "Equity", category: "equity", amounts: [-120_000, -150_000, -160_000] },
  { account: "Net Income", section: "Equity", category: "equity", amounts: [74_600, 129_240, 232_815] },
];

function bsAmount(account: RegExp, i: number): number {
  const spec = BS_ACCOUNTS.find((a) => account.test(a.account));
  if (!spec) throw new Error(`No balance-sheet account matching ${account}`);
  return spec.amounts[i]!;
}

function buildBalanceSheets(): { byYear: FinancialDataset["balanceSheet"]; periods: BalanceSheetPeriod[]; lines: MappedLine[] } {
  const byYear: FinancialDataset["balanceSheet"] = {};
  const periods: BalanceSheetPeriod[] = [];
  const lines: MappedLine[] = [];
  YEARS.forEach((y, i) => {
    const v = emptyBs();
    for (const spec of BS_ACCOUNTS) {
      v[spec.category] += spec.amounts[i]!;
      lines.push({ account: spec.account, section: spec.section, year: y, amount: spec.amounts[i]!, category: spec.category, statement: "balance_sheet", source: "quickbooks_export", file: BS_FILE, mappedBy: "rule" });
    }
    byYear[y] = v;
    const key = monthKey(y, 12);
    periods.push({
      period: monthPeriod(key, FY_END_MONTH),
      asOf: monthEndDate(key),
      fiscalYearEnd: true,
      values: v,
      detail: {
        prepaid: bsAmount(/Prepaid/, i),
        accrued_liabilities: bsAmount(/Accrued Payroll/, i) + bsAmount(/Sales Tax/, i),
        customer_deposits: bsAmount(/Customer Deposits/, i),
        credit_cards: bsAmount(/Credit Card/, i),
      },
      source: "quickbooks_export",
      file: BS_FILE,
    });
  });
  return { byYear, periods, lines };
}

// ---------------------------------------------------------------------------
// Adjustments schedule (guide 5.3). Amounts follow the sample's addbacks.csv;
// S2 and S3 follow the guide's defaults so the ladder is worked end to end.
// ---------------------------------------------------------------------------

export const REPLACEMENT_SALARY = 95_000;
export const BURDEN_PCT = 0.15;
/** Three-year average of depreciation expense: the guide's proxy when no Form 4562 is in the sources. */
export const CAPITAL_RESERVE = (61_200 + 66_800 + 72_400) / 3;

const NOTES_SOURCE = `${NOTES_FILE} (intake call; request received 2026-09-21)`;

function buildAdjustments(accountMonthly: Map<string, Record<MonthKey, number>>): Adjustment[] {
  const months = (account: string) => accountMonthly.get(account)!;
  const flatNegative = (perYear: number): Record<MonthKey, number> => {
    const out: Record<MonthKey, number> = {};
    for (const y of YEARS) Object.assign(out, monthlyFor(-perYear, SHAPES.flat, y));
    return out;
  };
  const zeros = (): Record<MonthKey, number> => Object.fromEntries(YEARS.flatMap((y) => monthsOf(y)).map((m) => [m, 0]));
  const scaled = (account: string, perYear: Triple): Record<MonthKey, number> => {
    // Spread an add-back over the months of the account it comes out of, in proportion to that account.
    const out: Record<MonthKey, number> = {};
    YEARS.forEach((y, i) => {
      const acct = months(account);
      const weights = monthsOf(y).map((m) => acct[m] ?? 0);
      const parts = splitAnnual(perYear[i]!, weights);
      monthsOf(y).forEach((m, k) => (out[m] = parts[k]!));
    });
    return out;
  };

  const rows: Omit<Adjustment, "ref">[] = [
    {
      tier: "definitional",
      description: "Interest expense",
      category: "interest",
      basis: "Adds back interest on the vehicle loans and SBA loan, $14.3K in FY2025, per the P&L Interest Expense account.",
      sourceDocument: "P&L, account Interest Expense",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([22_400, 18_600, 14_300]),
      byMonth: months("Interest Expense"),
      origin: "pnl",
      sourceFile: PNL_FILE,
    },
    {
      tier: "definitional",
      description: "Income taxes",
      category: "taxes",
      basis: "None: the Company is an S corporation, so income tax is paid by the owner and the ladder shows a dash.",
      sourceDocument: "P&L (no income tax account); request list entity_type",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([0, 0, 0]),
      byMonth: zeros(),
      origin: "pnl",
      sourceFile: PNL_FILE,
    },
    {
      tier: "definitional",
      description: "Depreciation and amortization",
      category: "da",
      basis: "Adds back depreciation on the fleet and equipment, $72.4K in FY2025, per the P&L Depreciation Expense account.",
      sourceDocument: "P&L, account Depreciation Expense",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([61_200, 66_800, 72_400]),
      byMonth: months("Depreciation Expense"),
      origin: "pnl",
      sourceFile: PNL_FILE,
    },
    {
      tier: "normalization",
      description: "Owner's personal vehicle",
      category: "personal_discretionary",
      basis: "Removes the owner's personal vehicle costs coded to Vehicle Expenses, $18.0K in FY2025, per the seller's add-back list.",
      sourceDocument: "Seller add-back list (addbacks.csv); P&L account Vehicle Expenses",
      evidence: "management_representation",
      status: "accepted",
      byFiscalYear: byYear([16_000, 17_000, 18_000]),
      byMonth: scaled("Vehicle Expenses", [16_000, 17_000, 18_000]),
      origin: "addbacks_csv",
      sourceFile: ADDBACKS_FILE,
    },
    {
      tier: "normalization",
      description: "Legal fees: settled customer dispute",
      category: "non_recurring",
      basis: "Removes the one-time cost of settling a customer dispute, $24.0K in FY2024, visible as the spike in Legal & Professional Fees ($38.9K against $16.4K and $17.2K in the adjacent years).",
      sourceDocument: "Seller add-back list (addbacks.csv); P&L account Legal & Professional Fees",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([0, 24_000, 0]),
      byMonth: { ...zeros(), "2024-06": 12_000, "2024-07": 12_000 },
      origin: "addbacks_csv",
      sourceFile: ADDBACKS_FILE,
    },
    {
      tier: "normalization",
      description: "Owner family cell phones and personal meals",
      category: "personal_discretionary",
      basis: "Removes family phone lines and personal meals expensed through the Company, $6.0K in FY2025, per the seller's add-back list.",
      sourceDocument: "Seller add-back list (addbacks.csv)",
      evidence: "management_representation",
      status: "accepted",
      byFiscalYear: byYear([0, 0, 6_000]),
      byMonth: { ...zeros(), ...monthlyFor(6_000, SHAPES.flat, 2025) },
      origin: "addbacks_csv",
      sourceFile: ADDBACKS_FILE,
    },
    {
      tier: "normalization",
      description: "Charitable contributions",
      category: "personal_discretionary",
      basis: "Removes discretionary charitable giving, $7.5K in FY2025, equal to the P&L Charitable Contributions account.",
      sourceDocument: "Seller add-back list (addbacks.csv); P&L account Charitable Contributions",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([5_000, 6_000, 7_500]),
      byMonth: months("Charitable Contributions"),
      origin: "addbacks_csv",
      sourceFile: ADDBACKS_FILE,
    },
    {
      // Reported EBITDA is net income plus [D1..D3] (check C05), so it carries interest income; this row takes it out.
      tier: "normalization",
      description: "Interest income (non-operating)",
      category: "non_operating",
      basis: "Removes interest earned on the savings account, $3.1K in FY2025, which is not operating income, per the P&L Interest Income account.",
      sourceDocument: "P&L, account Interest Income",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([-1_200, -2_400, -3_100]),
      byMonth: Object.fromEntries(Object.entries(months("Interest Income")).map(([m, v]) => [m, -v])),
      origin: "pnl",
      sourceFile: PNL_FILE,
    },
    ...(
      [
        ["Vehicle Expenses", "Vehicle costs may include the owner's personal use beyond the vehicle already listed"],
        ["Fuel", "Vehicle costs may include the owner's personal use"],
        ["Legal & Professional Fees", "Check for one-time legal or consulting work in FY2023 and FY2025"],
        ["Meals & Entertainment", "Meals & entertainment are often partly personal"],
      ] as const
    ).map<Omit<Adjustment, "ref">>(([account, reason]) => ({
      tier: "normalization",
      description: `${account} (bot-flagged)`,
      category: "personal_discretionary",
      basis: `Bot-flagged for review: ${reason}. Amount 0 until an advisor enters it.`,
      sourceDocument: `P&L account ${account}`,
      evidence: "management_representation",
      status: "proposed",
      byFiscalYear: byYear([0, 0, 0]),
      origin: "suggested",
      sourceFile: PNL_FILE,
    })),
    {
      tier: "owner_compensation",
      description: "Owner compensation",
      category: "owner_compensation",
      basis: "Adds back the owner's salary as paid, $200.0K in FY2025, per the P&L Officer Compensation account.",
      sourceDocument: "P&L, account Payroll Expenses : Officer Compensation",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([180_000, 190_000, 200_000]),
      byMonth: months("Payroll Expenses : Officer Compensation"),
      origin: "owner_comp",
      sourceFile: PNL_FILE,
    },
    {
      tier: "owner_compensation",
      description: "Market replacement compensation",
      category: "replacement_cost",
      basis: `Deducts a general manager at the $${REPLACEMENT_SALARY.toLocaleString("en-US")} market salary management cites, plus payroll taxes and benefits of ${BURDEN_PCT * 100}% (AMB default), $${Math.round(REPLACEMENT_SALARY * (1 + BURDEN_PCT)).toLocaleString("en-US")} a year.`,
      sourceDocument: "Request list owner_replacement_salary; intake notes; AMB burden default",
      evidence: "management_representation",
      status: "accepted",
      byFiscalYear: byYear([-REPLACEMENT_SALARY * (1 + BURDEN_PCT), -REPLACEMENT_SALARY * (1 + BURDEN_PCT), -REPLACEMENT_SALARY * (1 + BURDEN_PCT)]),
      byMonth: flatNegative(REPLACEMENT_SALARY * (1 + BURDEN_PCT)),
      origin: "replacement_salary",
    },
    {
      tier: "owner_compensation",
      description: "Capital reserve (maintenance capex)",
      category: "capital_reserve",
      basis: `Deducts a reserve for fleet and equipment replacement of $${Math.round(CAPITAL_RESERVE).toLocaleString("en-US")} a year, the three-year average of depreciation expense used as a proxy because no Form 4562 is in the sources.`,
      sourceDocument: "P&L, account Depreciation Expense FY2023–FY2025 (proxy; Form 4562 requested)",
      evidence: "documented",
      status: "accepted",
      byFiscalYear: byYear([-CAPITAL_RESERVE, -CAPITAL_RESERVE, -CAPITAL_RESERVE]),
      byMonth: flatNegative(CAPITAL_RESERVE),
      origin: "capital_reserve",
    },
    {
      tier: "memo",
      description: "After-hours emergency plumbing",
      category: "other",
      basis: "Calls after 7 pm are turned away today; no revenue from an after-hours service is included in any figure above, per management.",
      sourceDocument: NOTES_SOURCE,
      evidence: "management_representation",
      status: "proposed",
      byFiscalYear: byYear([0, 0, 0]),
      origin: "intake_notes",
      sourceFile: NOTES_FILE,
    },
  ];
  return numberAdjustments(rows);
}

// ---------------------------------------------------------------------------
// Customers: about sixty coded commercial accounts whose revenue sums to the
// Service Revenue - Commercial line, plus the residential households as one
// residual bucket so the list ties to total revenue (check C12).
// ---------------------------------------------------------------------------

const COMMERCIAL_REVENUE: Triple = [598_200, 702_500, 811_700];

/** mulberry32: a small seeded generator so the roster is the same on every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACES = [
  "Scioto", "Olentangy", "Buckeye", "Capital City", "Polaris", "Easton", "Grandview", "Worthington", "Dublin", "Westerville",
  "Hilliard", "Gahanna", "Bexley", "Clintonville", "Short North", "German Village", "Powell", "Delaware", "Newark", "Granville",
  "Reynoldsburg", "Pickerington", "Upper Arlington", "Canal Winchester", "Grove City", "New Albany", "Lewis Center", "Sunbury", "Heath", "Pataskala",
  "Marysville", "Plain City",
];

const TYPE_SUFFIX: Record<string, string[]> = {
  "Property manager": ["Property Management", "Realty Group"],
  "Office building": ["Office Park", "Professional Building", "Commons"],
  "Restaurant group": ["Hospitality Group"],
  Retail: ["Plaza", "Shopping Center"],
  "Medical office": ["Family Dental", "Medical Group"],
  "Church or nonprofit": ["Community Church"],
  "School or daycare": ["Learning Center"],
  "Residential landlord": ["Rentals LLC"],
};

interface CustomerSeed {
  type: string;
  start: MonthKey;
  end?: MonthKey;
  lossReason?: LossReason;
  contractBasis: CustomerRecord["contractBasis"];
  /** Explicit revenue for the ten largest accounts. */
  fixed?: Triple;
  /** FY2025 run-rate for everyone else, before scaling to the line total. */
  rate?: number;
}

const TOP_TEN: CustomerSeed[] = [
  { type: "Property manager", start: "2012-03", fixed: [96_400, 108_900, 121_600], contractBasis: "contract" },
  { type: "Restaurant group", start: "2015-08", fixed: [66_200, 75_800, 84_300], contractBasis: "maintenance_agreement" },
  { type: "Property manager", start: "2014-01", fixed: [58_900, 66_100, 71_200], contractBasis: "contract" },
  { type: "Office building", start: "2011-06", fixed: [60_100, 68_400, 64_800], contractBasis: "time_and_materials" },
  { type: "Restaurant group", start: "2018-04", fixed: [40_300, 49_600, 58_900], contractBasis: "maintenance_agreement" },
  { type: "Property manager", start: "2016-10", fixed: [44_700, 48_200, 52_400], contractBasis: "contract" },
  { type: "Medical office", start: "2013-05", fixed: [31_800, 36_900, 41_700], contractBasis: "maintenance_agreement" },
  { type: "Property manager", start: "2019-02", fixed: [30_100, 32_400, 34_600], contractBasis: "contract" },
  { type: "Restaurant group", start: "2021-09", fixed: [15_600, 22_800, 30_200], contractBasis: "maintenance_agreement" },
  { type: "Retail", start: "2010-11", fixed: [22_300, 25_100, 27_100], contractBasis: "time_and_materials" },
];

/** Legacy accounts lost in the window (position in the legacy list → month the relationship ended). */
const LEGACY_LOSSES: Record<number, MonthKey> = {
  2: "2023-04", 9: "2023-08", 17: "2023-11",
  5: "2024-02", 13: "2024-06", 23: "2024-10",
  1: "2025-01", 10: "2025-05", 19: "2025-08", 27: "2025-11",
};
const NEW_STARTS: Record<number, number[]> = { 2023: [2, 3, 5, 6, 8, 9, 11], 2024: [1, 3, 4, 6, 7, 9, 10, 12], 2025: [2, 3, 5, 6, 8, 10, 11] };
const LOSS_REASONS: LossReason[] = ["regrettable", "non_regrettable", "unclassified"];

function customerSeeds(): CustomerSeed[] {
  const rand = prng(20260921);
  const types: string[] = [
    ...Array<string>(19).fill("Office building"),
    ...Array<string>(8).fill("Property manager"),
    ...Array<string>(7).fill("Retail"),
    ...Array<string>(5).fill("Medical office"),
    ...Array<string>(5).fill("Church or nonprofit"),
    ...Array<string>(4).fill("School or daycare"),
    ...Array<string>(3).fill("Residential landlord"),
    "Restaurant group",
  ];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [types[i], types[j]] = [types[j]!, types[i]!];
  }
  const rate = () => Math.round((1_500 + rand() * 12_500) / 100) * 100;
  const basisFor = (type: string): CustomerRecord["contractBasis"] =>
    type === "Property manager" ? "contract" : type === "Restaurant group" || type === "Medical office" ? "maintenance_agreement" : "time_and_materials";

  const seeds: CustomerSeed[] = [...TOP_TEN];
  let t = 0;
  let losses = 0;
  for (let i = 0; i < 30; i++) {
    const type = types[t++]!;
    const end = LEGACY_LOSSES[i];
    seeds.push({
      type,
      start: monthKey(2010 + (i % 13), ((i * 7) % 12) + 1),
      end,
      lossReason: end ? LOSS_REASONS[losses++ % LOSS_REASONS.length] : undefined,
      contractBasis: basisFor(type),
      rate: rate(),
    });
  }
  for (const y of YEARS) {
    for (const m of NEW_STARTS[y]!) {
      const type = types[t++]!;
      seeds.push({ type, start: monthKey(y, m), contractBasis: basisFor(type), rate: rate() });
    }
  }
  return seeds;
}

/** Months of a fiscal year the relationship was active, given first and last months. */
function activeMonths(year: number, start: MonthKey, end: MonthKey | undefined): number {
  const startYear = Number(start.slice(0, 4));
  if (startYear > year) return 0;
  if (end && Number(end.slice(0, 4)) < year) return 0;
  const first = startYear === year ? Number(start.slice(5)) : 1;
  const last = end && Number(end.slice(0, 4)) === year ? Number(end.slice(5)) : 12;
  return Math.max(0, last - first + 1);
}

function buildCustomers(): NonNullable<FinancialDataset["customers"]> {
  const seeds = customerSeeds();
  const rand = prng(7);
  const revenue = seeds.map(() => ({ 2023: 0, 2024: 0, 2025: 0 }) as Record<number, number>);

  YEARS.forEach((y, yi) => {
    const back = [0.8, 0.9, 1.0][yi]!;
    let raw = 0;
    const rawByIdx = seeds.map((s, idx) => {
      if (s.fixed) {
        revenue[idx]![y] = s.fixed[yi]!;
        return 0;
      }
      const v = s.rate! * back * (1 + (rand() - 0.5) * 0.3) * (activeMonths(y, s.start, s.end) / 12);
      raw += v;
      return v;
    });
    const fixedTotal = seeds.reduce((s, seed) => s + (seed.fixed?.[yi] ?? 0), 0);
    const target = COMMERCIAL_REVENUE[yi]! - fixedTotal;
    const scale = target / raw;
    let sum = 0;
    let largest = -1;
    seeds.forEach((s, idx) => {
      if (s.fixed) return;
      const v = Math.round(rawByIdx[idx]! * scale);
      revenue[idx]![y] = v;
      sum += v;
      if (largest < 0 || v > revenue[largest]![y]!) largest = idx;
    });
    // Rounding residual onto the largest generated account so the line ties exactly.
    revenue[largest]![y] = revenue[largest]![y]! + (target - sum);
  });

  const order = seeds
    .map((_, idx) => idx)
    .sort((a, b) => revenue[b]![2025]! - revenue[a]![2025]! || revenue[b]![2024]! - revenue[a]![2024]! || revenue[b]![2023]! - revenue[a]![2023]! || a - b);
  const customers: CustomerRecord[] = order.map((idx, rank) => {
    const s = seeds[idx]!;
    const suffixes = TYPE_SUFFIX[s.type]!;
    return {
      id: `C-${String(rank + 1).padStart(3, "0")}`,
      name: `${PLACES[idx % PLACES.length]} ${suffixes[idx % suffixes.length]}`,
      type: s.type,
      startDate: `${s.start}-01`,
      endDate: s.end ? monthEndDate(s.end) : undefined,
      lossReason: s.lossReason,
      revenueByFiscalYear: revenue[idx]!,
      contractBasis: s.contractBasis,
    };
  });

  const residual = {
    label: "Residential households and maintenance-agreement members (not listed individually)",
    revenueByFiscalYear: byYear([ANNUAL_REVENUE[2023]! - COMMERCIAL_REVENUE[0], ANNUAL_REVENUE[2024]! - COMMERCIAL_REVENUE[1], ANNUAL_REVENUE[2025]! - COMMERCIAL_REVENUE[2]]),
  };
  return {
    customers,
    residual,
    term: "Customer",
    asOfMonth: AS_OF_MONTH,
    totalsByFiscalYear: byYear([ANNUAL_REVENUE[2023]!, ANNUAL_REVENUE[2024]!, ANNUAL_REVENUE[2025]!]),
    source: "ServiceTitan customer revenue export (fictional)",
    file: "customers-by-year.csv",
  };
}

// ---------------------------------------------------------------------------
// Payroll: 23 employees at Dec-25 plus the owner; wages and employer costs
// tie to the P&L wage, tax and benefit lines by construction.
// ---------------------------------------------------------------------------

const FIELD_WAGES: Triple = [512_400, 581_300, 648_900];
const OFFICE_WAGES: Triple = [118_200, 124_600, 131_400];
const EMPLOYER_COSTS: Triple = [58_700 + 41_300, 65_400 + 46_800, 72_300 + 52_100];

interface EmployeeSeed {
  name: string;
  role: string;
  department: string;
  hire: string;
  term?: string;
  termType?: TerminationType;
  /** Annual wages at the FY2025 pay level, before scaling to the line totals. */
  rate: number;
  payBasis: PayrollRecord["payBasis"];
  management?: boolean;
}

const FIRST = ["Alex", "Jordan", "Chris", "Sam", "Taylor", "Morgan", "Casey", "Drew", "Jamie", "Riley", "Devin", "Kai", "Reese", "Quinn", "Avery", "Blake", "Cameron", "Dakota", "Emerson", "Finley", "Harper", "Jesse", "Logan", "Micah", "Parker", "Rowan", "Sawyer", "Skyler"];
const LAST = ["Nguyen", "Okafor", "Petrov", "Ramirez", "Schmidt", "Takahashi", "Underwood", "Vasquez", "Walsh", "Xu", "Young", "Zimmerman", "Abbott", "Barnes", "Cortez", "Dunn", "Ellis", "Fischer", "Garza", "Holt", "Ibrahim", "Jensen", "Kowalski", "Lindqvist", "Mendes", "Novak", "Osei", "Price"];
const person = (i: number) => `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;

function employeeSeeds(): EmployeeSeed[] {
  const tech = (i: number, hire: string, rate: number, term?: string, termType?: TerminationType): EmployeeSeed => ({
    name: person(i), role: "Service technician", department: "Field service", hire, term, termType, rate, payBasis: "hourly_plus_commission",
  });
  const install = (i: number, hire: string, rate: number): EmployeeSeed => ({ name: person(i), role: "Install technician", department: "Installation", hire, rate, payBasis: "hourly" });
  const csr = (i: number, hire: string, rate: number, term?: string, termType?: TerminationType): EmployeeSeed => ({
    name: person(i), role: "Customer service / dispatch", department: "Office", hire, term, termType, rate, payBasis: "hourly",
  });
  return [
    // On the payroll at Jan-23.
    tech(0, "2012-05-14", 46_000),
    tech(1, "2013-08-05", 45_000),
    tech(2, "2014-03-10", 44_000),
    tech(3, "2015-10-19", 43_000),
    tech(4, "2016-06-06", 42_000),
    tech(5, "2017-02-20", 41_000),
    tech(6, "2018-09-03", 40_000),
    tech(7, "2019-04-15", 39_000, "2024-03-31", "resignation"),
    tech(8, "2020-01-13", 38_000),
    tech(9, "2020-11-02", 37_000, "2023-09-15", "resignation"),
    tech(10, "2021-07-12", 36_000),
    tech(11, "2022-03-07", 34_000, "2025-02-14", "termination"),
    install(12, "2016-09-12", 40_000),
    install(13, "2019-08-19", 37_000),
    install(14, "2021-05-03", 35_000),
    csr(15, "2017-11-06", 27_000),
    csr(16, "2020-08-24", 25_000, "2025-05-30", "resignation"),
    { name: person(17), role: "Bookkeeper", department: "Office", hire: "2015-02-09", rate: 31_000, payBasis: "salary" },
    { name: "Lisa Tran", role: "Operations manager", department: "Management", hire: "2014-09-08", rate: 52_000, payBasis: "salary", management: true },
    // Hired in the window.
    tech(18, "2023-04-03", 34_000),
    tech(19, "2023-08-01", 33_000, "2025-07-18", "resignation"),
    install(20, "2023-06-12", 34_000),
    tech(21, "2024-03-04", 34_000),
    tech(22, "2024-07-08", 33_000),
    csr(23, "2024-09-16", 24_000),
    tech(24, "2025-01-06", 33_000),
    tech(25, "2025-06-02", 32_000),
    csr(26, "2025-08-11", 24_000),
  ];
}

function monthsEmployed(year: number, hire: string, term: string | undefined): number {
  const hy = Number(hire.slice(0, 4));
  const hm = Number(hire.slice(5, 7));
  if (hy > year) return 0;
  const ty = term ? Number(term.slice(0, 4)) : undefined;
  const tm = term ? Number(term.slice(5, 7)) : undefined;
  if (ty !== undefined && ty < year) return 0;
  const first = hy === year ? hm : 1;
  const last = ty === year ? tm! : 12;
  return Math.max(0, last - first + 1);
}

/** Scale generated amounts to an exact total, rounding to whole dollars with the residual on the largest. */
function scaleToTotal(raw: number[], total: number): number[] {
  const sum = raw.reduce((s, v) => s + v, 0);
  const out = raw.map((v) => (sum ? Math.round((v * total) / sum) : 0));
  const largest = out.reduce((best, v, i) => (v > out[best]! ? i : best), 0);
  out[largest] = out[largest]! + (total - out.reduce((s, v) => s + v, 0));
  return out;
}

function buildPayroll(): NonNullable<FinancialDataset["payroll"]> {
  const seeds = employeeSeeds();
  const wages = seeds.map(() => ({ 2023: 0, 2024: 0, 2025: 0 }) as Record<number, number>);
  const costs = seeds.map(() => ({ 2023: 0, 2024: 0, 2025: 0 }) as Record<number, number>);
  YEARS.forEach((y, yi) => {
    // Pay levels back-cast at 4% a year, prorated for the months on payroll.
    const raw = seeds.map((s) => s.rate * 0.96 ** (2025 - y) * (monthsEmployed(y, s.hire, s.term) / 12));
    const isField = seeds.map((s) => s.department === "Field service" || s.department === "Installation");
    const field = scaleToTotal(raw.map((v, i) => (isField[i] ? v : 0)), FIELD_WAGES[yi]!);
    const office = scaleToTotal(raw.map((v, i) => (isField[i] ? 0 : v)), OFFICE_WAGES[yi]!);
    seeds.forEach((_, i) => (wages[i]![y] = field[i]! + office[i]!));
    const employer = scaleToTotal(seeds.map((_, i) => wages[i]![y]!), EMPLOYER_COSTS[yi]!);
    seeds.forEach((_, i) => (costs[i]![y] = employer[i]!));
  });

  const employees: PayrollRecord[] = seeds.map((s, i) => ({
    id: `E-${String(i + 2).padStart(2, "0")}`,
    name: s.name,
    role: s.role,
    department: s.department,
    isOwner: false,
    isManagement: s.management ?? false,
    hireDate: s.hire,
    terminationDate: s.term,
    terminationType: s.termType,
    payBasis: s.payBasis,
    fte: 1,
    wagesByFiscalYear: wages[i]!,
    employerCostsByFiscalYear: costs[i]!,
  }));
  employees.unshift({
    id: "E-01",
    name: "Mark Delaney",
    role: "Owner / general manager",
    department: "Owner",
    isOwner: true,
    isManagement: true,
    hireDate: "2009-03-02",
    payBasis: "salary",
    fte: 1,
    wagesByFiscalYear: byYear([180_000, 190_000, 200_000]),
    employerCostsByFiscalYear: byYear([0, 0, 0]),
  });
  return {
    employees,
    asOfMonth: AS_OF_MONTH,
    totalsByFiscalYear: byYear([FIELD_WAGES[0] + OFFICE_WAGES[0] + EMPLOYER_COSTS[0], FIELD_WAGES[1] + OFFICE_WAGES[1] + EMPLOYER_COSTS[1], FIELD_WAGES[2] + OFFICE_WAGES[2] + EMPLOYER_COSTS[2]]),
    source: "Gusto payroll register (fictional)",
    file: "payroll-register.csv",
  };
}

// ---------------------------------------------------------------------------
// Bank deposits by month, from the sample's checking export. Mirrors the
// transfer exclusion in src/ingest/bankCsv.ts.
// ---------------------------------------------------------------------------

const NON_OPERATING = /transfer|xfer|trnsfr|from (sav|chk)|loan (proceeds|advance)|sba|ppp|owner (contribution|deposit)|capital contribution|reversal|returned item/i;

function depositsByMonth(): Record<MonthKey, { amount: number; excluded: number }> {
  const rows = parse(fs.readFileSync(path.join(SAMPLE_DIR, BANK_FILE), "utf8"), { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
  const out: Record<MonthKey, { amount: number; excluded: number }> = {};
  for (const r of rows) {
    const amount = Number(r.Amount);
    if (!(amount > 0)) continue;
    const key = (r.Date ?? "").slice(0, 7);
    const cur = (out[key] ??= { amount: 0, excluded: 0 });
    if (NON_OPERATING.test(r.Description ?? "")) cur.excluded += amount;
    else cur.amount += amount;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Intake facts transcribed from samples/project-ridgeline/intake-notes.md.
// Anything the notes do not say is left undefined, never guessed.
// ---------------------------------------------------------------------------

const mgmt = (locator: string): Provenance => ({ source: NOTES_SOURCE, locator, evidence: "management_representation" });

function buildIntake(): IntakeFacts {
  return {
    company: {
      legalName: "Ridgeline Comfort Services LLC",
      tradingName: "Ridgeline",
      description: "Residential and light-commercial HVAC service, replacement and maintenance, plus plumbing service added in 2019",
      founded: 2009,
      founderBackground: "Founded by Mark Delaney after 12 years as a lead technician at a regional HVAC contractor",
      headquarters: { city: "Columbus", state: "Ohio" },
      serviceArea: "Franklin, Delaware and Licking counties (about a 35-mile radius)",
      ownership: "Founder-owned (Mark Delaney)",
      certifications: [{ name: "Carrier Factory Authorized Dealer", since: 2015, source: mgmt("## Business") }],
      licenses: [],
      reputation: [{ metric: "Google rating", value: "4.8 from 900+ reviews", source: mgmt("## Business") }],
      source: mgmt("## Business"),
    },
    locations: [
      {
        name: "Maple Ave shop and office",
        function: "Shop, warehouse and office",
        sizeSqFt: 8_000,
        arrangement: "leased_from_third_party",
        leaseExpiry: "2029",
        renewalOptions: "One 5-year renewal option",
        landlordRelatedParty: false,
        source: mgmt("## Operations"),
      },
    ],
    systems: [
      { function: "Dispatch, invoicing and memberships", system: "ServiceTitan", source: mgmt("## Operations") },
      { function: "Accounting", system: "QuickBooks Online", source: mgmt("## Operations") },
    ],
    suppliers: [
      { name: "Ferguson", supplies: "HVAC parts and supplies", source: mgmt("## Operations") },
      { name: "Johnstone Supply", supplies: "HVAC parts and supplies", source: mgmt("## Operations") },
      { name: "Carrier (local distributor)", supplies: "HVAC equipment", source: mgmt("## Operations") },
    ],
    fleetAndEquipment: [
      { item: "Service vans", count: 18, ownership: "Owned, financed with vehicle loans", source: mgmt("## Operations") },
      { item: "Install trucks", count: 2, ownership: "Owned, financed with vehicle loans", source: mgmt("## Operations") },
    ],
    customerFacts: [
      { fact: "1,450 active maintenance-agreement members (two tune-ups a year, priority scheduling, 15% repair discount)", source: mgmt("## Business") },
      { fact: "Maintenance-agreement renewal rate about 82%", source: mgmt("## Business") },
      { fact: "Commercial customers are property managers, small office buildings and 4 restaurant groups", source: mgmt("## Business") },
      { fact: "Largest single customer is about 4% of revenue", source: mgmt("## Business") },
      { fact: "Revenue mix FY2025: residential service and replacement about 64%, commercial about 27%, maintenance agreements about 9%", source: mgmt("## Business") },
    ],
    workforce: {
      headcount: 24,
      composition: [
        { role: "Service technician", count: 14 },
        { role: "Install crew", count: 4 },
        { role: "Operations manager", count: 1 },
        { role: "CSR / dispatch", count: 3 },
        { role: "Bookkeeper", count: 1 },
        { role: "Owner", count: 1 },
      ],
      payBasis: "Technicians are paid hourly plus spiff commissions on maintenance agreements",
      union: false,
      source: mgmt("## People"),
    },
    management: [
      {
        name: "Lisa Tran",
        role: "Operations manager",
        since: "2014",
        responsibilities: ["Dispatch", "Day-to-day scheduling"],
        postCloseIntent: "stays",
        source: mgmt("## People"),
      },
    ],
    owner: {
      name: "Mark Delaney",
      role: "Owner / general manager",
      age: 61,
      hoursPerWeek: 45,
      responsibilities: [
        { responsibility: "Estimating large replacements", source: mgmt("## People") },
        { responsibility: "Commercial relationships", transitionSupport: "Introduces commercial accounts during the transition", source: mgmt("## People") },
        { responsibility: "Vendor terms", source: mgmt("## People") },
        { responsibility: "Hiring", source: mgmt("## People") },
      ],
      transition: { months: 12, basis: "up to 12 months", description: "Willing to stay up to 12 months for transition and to introduce commercial accounts", source: mgmt("## Transaction") },
      source: mgmt("## People"),
    },
    growthLevers: [
      {
        lever: "Raise maintenance-agreement penetration",
        baseline: "Agreements are offered on about 35% of service calls",
        mechanism: "Offer the agreement on every service call; each new member adds two tune-ups a year and priority-scheduled repair work",
        source: mgmt("## Growth opportunities (owner's view)"),
      },
      {
        lever: "Add after-hours emergency plumbing",
        baseline: "Calls after 7 pm are turned away today",
        mechanism: "Staff an on-call rotation so after-hours calls are served rather than referred away",
        source: mgmt("## Growth opportunities (owner's view)"),
      },
      {
        lever: "Expand commercial preventive-maintenance contracts",
        baseline: "Two property managers have asked for quotes on additional buildings",
        mechanism: "Quote and sign the buildings already requested by existing property-manager customers",
        proofPoint: "Two property managers have asked for quotes on additional buildings",
        source: mgmt("## Growth opportunities (owner's view)"),
      },
      {
        lever: "Paid digital marketing",
        baseline: "Little paid digital marketing today; most leads are referrals and Google reviews",
        mechanism: "Add paid search and local service ads on top of the referral and review base",
        source: mgmt("## Growth opportunities (owner's view)"),
      },
      {
        lever: "Second location in the Dayton market",
        baseline: "Discussed but never pursued",
        mechanism: "Open a second dispatch base to serve the Dayton market",
        source: mgmt("## Growth opportunities (owner's view)"),
      },
    ],
    reasonForSale: { text: "Owner retirement (age 61); the owner wants a clean exit within 12 months", source: mgmt("## Transaction") },
    transaction: {
      dealFormPreference: "asset",
      timing: "Clean exit within 12 months",
      replacementSalary: { amount: REPLACEMENT_SALARY, source: mgmt("## Transaction") },
      notes: [{ text: "Prefers an asset sale; open to a buyer keeping the Ridgeline name and all employees", source: mgmt("## Transaction") }],
    },
    milestones: [
      { year: 2009, event: "Founded by Mark Delaney", source: mgmt("## Business") },
      { year: 2015, event: "Became a Carrier Factory Authorized Dealer", source: mgmt("## Business") },
      { year: 2019, event: "Added plumbing service", source: mgmt("## Business") },
    ],
    competitors: [],
    marketInputs: [],
  };
}

function buildKpis(): KpiSeries[] {
  // The notes give point-in-time figures without a date; they are keyed to the intake call.
  const at = periodKey({ kind: "point", date: "2026-09-21" });
  const kpi = (key: string, label: string, unit: KpiSeries["unit"], value: number, definition?: string): KpiSeries => ({
    key, label, unit, values: { [at]: value }, definition, source: NOTES_SOURCE, evidence: "management_representation",
  });
  return [
    kpi("maintenance_members", "Active maintenance-agreement members", "count", 1_450, "Members with an active agreement: two tune-ups a year, priority scheduling, 15% repair discount"),
    kpi("renewal_rate", "Maintenance-agreement renewal rate", "percent", 0.82),
    kpi("agreement_offer_rate", "Service calls on which an agreement is offered", "percent", 0.35),
    kpi("google_rating", "Google rating", "rating", 4.8),
    kpi("google_reviews", "Google reviews", "count", 900, "Stated as 900+"),
    kpi("fleet_service_vans", "Service vans", "count", 18),
    kpi("fleet_install_trucks", "Install trucks", "count", 2),
    kpi("service_radius", "Service radius", "miles", 35),
    kpi("shop_size", "Shop and office", "sq_ft", 8_000),
    kpi("owner_hours", "Owner hours per week", "hours", 45),
  ];
}

// ---------------------------------------------------------------------------
// Everything together.
// ---------------------------------------------------------------------------

function suggestedAddbacks(lines: MappedLine[]): SuggestedAddback[] {
  // The same rule merge.ts applies, so the fixture matches what the pipeline produces today.
  const out: SuggestedAddback[] = [];
  for (const l of lines) {
    if (l.statement !== "pnl" || l.amount <= 0) continue;
    if (!["other_opex", "payroll", "marketing", "other_expense"].includes(l.category)) continue;
    const reason = addbackHint(l.account);
    if (reason) out.push({ year: l.year, account: l.account, amount: l.amount, reason });
  }
  return out.sort((a, b) => b.year - a.year || b.amount - a.amount).slice(0, 15);
}

export function ridgelineDataset(): FinancialDataset {
  const { monthly, accountMonthly } = buildMonthly();
  const pnl = annualPnl();
  const bs = buildBalanceSheets();
  const lines = [...pnlLines(), ...bs.lines];
  const adjustments = buildAdjustments(accountMonthly);
  const customers = buildCustomers();
  const payroll = buildPayroll();

  const revenueLines: RevenueLine[] = [
    {
      account: "Service Revenue - Residential",
      label: "Residential service and replacement",
      byFiscalYear: byYear([1_612_400, 1_788_900, 1_964_300]),
      byMonth: accountMonthly.get("Service Revenue - Residential"),
      recurring: false,
      whatTheCustomerBuys: "HVAC and plumbing repair, replacement and installation for homeowners",
      contra: false,
    },
    {
      account: "Service Revenue - Commercial",
      label: "Commercial service",
      byFiscalYear: byYear([598_200, 702_500, 811_700]),
      byMonth: accountMonthly.get("Service Revenue - Commercial"),
      recurring: false,
      whatTheCustomerBuys: "HVAC service and preventive maintenance for property managers, office buildings and restaurant groups",
      contra: false,
    },
    {
      account: "Maintenance Agreements",
      label: "Maintenance agreements",
      byFiscalYear: byYear([214_600, 248_300, 289_400]),
      byMonth: accountMonthly.get("Maintenance Agreements"),
      recurring: true,
      whatTheCustomerBuys: "Membership: two tune-ups a year, priority scheduling and a 15% repair discount",
      contra: false,
    },
    {
      account: "Discounts Given",
      label: "Discounts given",
      byFiscalYear: byYear([-18_400, -21_100, -24_600]),
      byMonth: accountMonthly.get("Discounts Given"),
      recurring: false,
      contra: true,
    },
  ];

  // Guide Q7: the rule runs on PF Adj. EBITDA before the capital reserve, since the reserve follows from the mode.
  const p = pnl[2025]!;
  const netIncome =
    p.revenue - p.cogs - p.payroll - p.owner_comp - p.rent - p.marketing - p.other_opex - p.depreciation_amortization - p.interest_expense + p.other_income - p.other_expense - p.income_tax;
  const accepted = (tier: Adjustment["tier"], exclude: Adjustment["origin"][] = []) =>
    adjustments.filter((a) => a.tier === tier && a.status === "accepted" && !exclude.includes(a.origin)).reduce((s, a) => s + (a.byFiscalYear[2025] ?? 0), 0);
  const pfBeforeReserve = netIncome + accepted("definitional") + accepted("normalization") + accepted("owner_compensation", ["capital_reserve"]) + accepted("pro_forma");
  const mode = decideMode(pfBeforeReserve, "PF Dec-25");

  const asOf = monthEndDate(AS_OF_MONTH);
  const revenueMix = [...revenueLines]
    .filter((l) => !l.contra)
    .sort((a, b) => b.byFiscalYear[2025]! - a.byFiscalYear[2025]!)
    .map((l) => ({ label: l.account, amount: l.byFiscalYear[2025]! }));
  const deposits = depositsByMonth();
  const deposits2025 = Object.entries(deposits).filter(([k]) => k.startsWith("2025-"));

  return {
    years: [...YEARS],
    pnl,
    balanceSheet: bs.byYear,
    provenance: YEARS.map((year) => ({ year, pnl: "quickbooks_export" as const, balanceSheet: "quickbooks_export" as const })),
    lines,
    addbacks: addbacksFromSchedule(adjustments),
    suggestedAddbacks: suggestedAddbacks(lines),
    revenueMix,
    deposits: { 2025: { amount: deposits2025.reduce((s, [, d]) => s + d.amount, 0), months: deposits2025.length } },
    warnings: [],

    fiscalYearEndMonth: FY_END_MONTH,
    sourceGranularity: "monthly",
    booksBasis: "accrual",
    asOfMonth: AS_OF_MONTH,
    monthly,
    balanceSheets: bs.periods,
    adjustments,
    recastInputs: {
      replacementSalary: REPLACEMENT_SALARY,
      replacementSalarySource: "Request list owner_replacement_salary; intake notes: market salary for a general manager roughly $95,000",
      burdenPct: BURDEN_PCT,
      burdenSource: "AMB default 15% (guide 5.3, Q8); confirm",
      capitalReserve: { amount: CAPITAL_RESERVE, basis: "da_proxy", source: "Three-year average of depreciation expense FY2023–FY2025; proxy because no Form 4562 is in the sources" },
      owners: [{ name: "Mark Delaney", role: "Owner / general manager", compensationByFiscalYear: byYear([180_000, 190_000, 200_000]) }],
    },
    revenueLines,
    customers,
    payroll,
    kpis: buildKpis(),
    intake: buildIntake(),
    mode,
    dealForm: { form: "asset_purchase", basis: "Intake notes: the owner prefers an asset sale; the Main Street default agrees" },
    reconciliations: [],
    depositsByMonth: deposits,
    debtLikeItems: [
      { item: "Vehicle loans", balance: 146_800, asOf, treatment: "debt", accounts: ["Long-Term Liabilities : Vehicle Loans"], source: BS_FILE, status: "confirmed", payoffLetter: "requested" },
      { item: "SBA loan", balance: 118_000, asOf, treatment: "debt", accounts: ["Long-Term Liabilities : SBA Loan"], source: BS_FILE, status: "confirmed", payoffLetter: "requested" },
      { item: "Business credit card", balance: 14_600, asOf, treatment: "debt", accounts: ["Current Liabilities : Credit Cards : Business Credit Card"], source: BS_FILE, status: "confirmed", payoffLetter: "n/a", note: "Repaid at or before closing" },
      { item: "Customer deposits", balance: 22_400, asOf, treatment: "nwc", accounts: ["Current Liabilities : Other Current Liabilities : Customer Deposits"], source: BS_FILE, status: "confirmed", note: "In NWC (AMB default)" },
      { item: "Accrued payroll", balance: 38_900, asOf, treatment: "nwc", accounts: ["Current Liabilities : Other Current Liabilities : Accrued Payroll"], source: BS_FILE, status: "confirmed" },
      { item: "Sales tax payable", balance: 6_200, asOf, treatment: "nwc", accounts: ["Current Liabilities : Other Current Liabilities : Sales Tax Payable"], source: BS_FILE, status: "confirmed" },
    ],
  };
}

/** Category totals per fiscal year from the monthly grid, for tests and for builders checking their SUMIFS. */
export function sumMonthlyByYear(monthly: MonthlyPnl, year: number): Record<IsCategory, number> {
  const out = emptyPnl();
  for (const m of monthly.months) {
    if (m.fiscalYear !== year) continue;
    for (const c of IS_CATEGORIES) out[c] += monthly.values[m.key]![c];
  }
  return out;
}
