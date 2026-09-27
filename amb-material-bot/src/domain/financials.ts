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
  addbacks: Addback[];
  suggestedAddbacks: SuggestedAddback[];
  /** Latest-year revenue split by account, for the CIM revenue-mix chart. */
  revenueMix: { label: string; amount: number }[];
  deposits: Record<number, { amount: number; months: number }>;
  warnings: string[];
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
