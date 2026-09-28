// Maps whatever account names a business uses onto the standard categories.
//
// Order of precedence: a per-deal override file, then the category the
// source already supplied (AI extraction of a tax return), then these rules,
// then a safe default (other_opex / other_current_assets) with a warning so
// the advisor can see what was guessed.

import { isIsCategory as isIs } from "./financials.ts";
import type { BsCategory, BsDetailLine, Category, DebtLikeTreatment, IsCategory, RawLine } from "./financials.ts";

type Rule<C> = { test: RegExp; category: C };

// Section headings as QuickBooks and most accounting exports print them.
const SECTION_RULES: Rule<IsCategory>[] = [
  { test: /cost of (goods|sales|revenue)|cogs|direct cost/i, category: "cogs" },
  { test: /other income/i, category: "other_income" },
  { test: /other expense/i, category: "other_expense" },
  { test: /^(income|revenue|sales|ordinary income)/i, category: "revenue" },
];

// Account-name rules for lines under an expense section. First match wins,
// so the specific rules sit above the broad ones.
const EXPENSE_RULES: Rule<IsCategory>[] = [
  { test: /depreciation|amortization|amortisation/i, category: "depreciation_amortization" },
  { test: /interest (expense|paid)|^interest$|loan interest|finance charge/i, category: "interest_expense" },
  { test: /income tax|federal tax|state (income|franchise) tax/i, category: "income_tax" },
  {
    test: /officer|owner'?s? (comp|salary|wage|pay|draw)|shareholder (comp|salary|wage)|guaranteed payment|member (comp|draw)/i,
    category: "owner_comp",
  },
  {
    test: /wage|salar|payroll|employee|benefit|health ins|401\s?k|retirement plan|workers'? comp|bonus|commission|contract labor|subcontract/i,
    category: "payroll",
  },
  { test: /rent|lease|occupancy|cam charges/i, category: "rent" },
  { test: /advertis|marketing|promotion|seo|lead gen|website/i, category: "marketing" },
];

const INCOME_RULES: Rule<IsCategory>[] = [
  { test: /interest income|dividend|gain on (sale|disposal)|other income|\bppp\b|\berc\b|employee retention/i, category: "other_income" },
];

const BS_RULES: Rule<BsCategory>[] = [
  { test: /accumulated (depreciation|amortization)/i, category: "fixed_assets_net" },
  { test: /checking|savings|cash|money market|petty/i, category: "cash" },
  { test: /accounts receivable|a\/r|receivable/i, category: "accounts_receivable" },
  { test: /inventory|stock on hand|materials/i, category: "inventory" },
  { test: /accounts payable|a\/p|payable - trade/i, category: "accounts_payable" },
  {
    test: /loan|note payable|notes payable|line of credit|\bloc\b|mortgage|\bsba\b|equipment financ|long[- ]term debt|credit card/i,
    category: "debt",
  },
  {
    test: /equity|retained earnings|capital|distribution|draw|net income|common stock|paid[- ]in|opening balance/i,
    category: "equity",
  },
  {
    test: /vehicle|truck|equipment|furniture|fixture|machinery|leasehold|building|land|computer|fixed asset|property/i,
    category: "fixed_assets_net",
  },
  { test: /accrued|payroll liabilit|sales tax|deferred revenue|customer deposit|unearned|current liabilit/i, category: "other_current_liabilities" },
  { test: /goodwill|intangible|security deposit|other asset|due from/i, category: "other_assets" },
  { test: /prepaid|undeposited|deposit|other current asset|employee advance/i, category: "other_current_assets" },
];

// Account names worth an advisor's look as potential add-backs. These are
// suggestions only; nothing here changes the numbers.
const ADDBACK_HINTS: { test: RegExp; reason: string }[] = [
  { test: /meal|entertain/i, reason: "Meals & entertainment are often partly personal" },
  { test: /auto|vehicle|car |fuel|gas\b/i, reason: "Vehicle costs may include the owner's personal use" },
  { test: /travel/i, reason: "Travel may include personal trips" },
  { test: /charit|donat|contribution/i, reason: "Charitable giving is discretionary" },
  { test: /life insurance|officer life/i, reason: "Owner life insurance is typically an add-back" },
  { test: /personal|owner expense|family/i, reason: "Labelled personal / owner" },
  { test: /legal|professional fee|consult/i, reason: "Check for one-time legal or consulting work" },
  { test: /one[- ]time|non[- ]recurring|moving|relocation|settlement|lawsuit/i, reason: "Labelled one-time / non-recurring" },
  { test: /cell phone|phone - personal|club|dues|country club|subscriptions - personal/i, reason: "May include personal memberships or phones" },
];

export type MappingOverrides = Map<string, Category>;

export function normaliseAccount(name: string): string {
  return name
    .toLowerCase()
    .replace(/^[\d.\-\s]+/, "") // leading account numbers like "6000 · " or "6000-"
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch<C>(rules: Rule<C>[], text: string): C | undefined {
  return rules.find((r) => r.test.test(text))?.category;
}

export interface MapResult<C> {
  category: C;
  mappedBy: "override" | "source" | "rule" | "default";
}

export function mapPnlLine(line: RawLine, overrides: MappingOverrides): MapResult<IsCategory> {
  const key = normaliseAccount(line.account);
  const override = overrides.get(key);
  if (override && isIs(override)) return { category: override, mappedBy: "override" };
  if (line.category && isIs(line.category)) return { category: line.category, mappedBy: "source" };

  const account = key;
  const sectionCat = line.section ? firstMatch(SECTION_RULES, line.section) : undefined;

  if (sectionCat === "revenue") {
    return { category: firstMatch(INCOME_RULES, account) ?? "revenue", mappedBy: "rule" };
  }
  if (sectionCat === "cogs") return { category: "cogs", mappedBy: "rule" };
  if (sectionCat === "other_income") return { category: "other_income", mappedBy: "rule" };

  // Expense or other-expense sections, or no section at all.
  const byName = firstMatch(EXPENSE_RULES, account);
  if (byName) return { category: byName, mappedBy: "rule" };
  if (sectionCat === "other_expense") return { category: "other_expense", mappedBy: "rule" };
  if (!line.section) {
    if (/sales|revenue|income from|service income|fees earned/i.test(account)) {
      return { category: "revenue", mappedBy: "rule" };
    }
    if (/cost of|materials|job supplies|cogs|purchases/i.test(account)) {
      return { category: "cogs", mappedBy: "rule" };
    }
  }
  return { category: "other_opex", mappedBy: line.section ? "rule" : "default" };
}

export function mapBsLine(line: RawLine, overrides: MappingOverrides): MapResult<BsCategory> {
  const key = normaliseAccount(line.account);
  const override = overrides.get(key);
  if (override && !isIs(override)) return { category: override as BsCategory, mappedBy: "override" };
  if (line.category && !isIs(line.category)) {
    return { category: line.category as BsCategory, mappedBy: "source" };
  }
  const section = (line.section ?? "").toLowerCase();
  const byName = firstMatch(BS_RULES, key);

  // Section context disambiguates names like "Customer deposits" (a liability)
  // vs "Security deposit" (an asset).
  if (/equity/.test(section)) return { category: "equity", mappedBy: "rule" };
  if (/liabilit/.test(section)) {
    if (byName === "accounts_payable" || byName === "debt" || byName === "other_current_liabilities") {
      return { category: byName, mappedBy: "rule" };
    }
    return {
      category: /long[- ]term/.test(section) ? "debt" : "other_current_liabilities",
      mappedBy: "rule",
    };
  }
  if (/asset/.test(section)) {
    if (byName && !["accounts_payable", "debt", "equity", "other_current_liabilities"].includes(byName)) {
      return { category: byName, mappedBy: "rule" };
    }
    if (/fixed|property/.test(section)) return { category: "fixed_assets_net", mappedBy: "rule" };
    if (/other assets|long[- ]term/.test(section)) return { category: "other_assets", mappedBy: "rule" };
    return { category: "other_current_assets", mappedBy: "rule" };
  }
  if (byName) return { category: byName, mappedBy: "rule" };
  return { category: "other_current_assets", mappedBy: "default" };
}

export function addbackHint(account: string): string | undefined {
  return ADDBACK_HINTS.find((h) => h.test.test(account))?.reason;
}

// --- Balance-sheet detail and debt-like items (guide 5.6) -------------------

// Sub-lines the NWC and debt-like schedules read out of the ten categories.
// Order matters: "Accrued interest" must win over the general accrued rule.
const BS_DETAIL_RULES: { test: RegExp; line: BsDetailLine; side: "asset" | "liability" | "either" }[] = [
  { test: /unbilled|work in progress|\bwip\b|contract asset/i, line: "unbilled", side: "asset" },
  { test: /prepaid/i, line: "prepaid", side: "asset" },
  { test: /due (to|from) (shareholder|owner|officer|member|partner|related)|shareholder loan|loan (to|from) (shareholder|owner|officer|member|partner)|related[- ]party/i, line: "related_party_balances", side: "either" },
  { test: /accrued interest|interest payable/i, line: "accrued_interest", side: "liability" },
  { test: /income tax(es)? payable|federal tax(es)? payable|state tax(es)? payable|franchise tax payable/i, line: "income_tax_payable", side: "liability" },
  { test: /deferred revenue|unearned|deferred income|prepaid (memberships?|agreements?|contracts?)/i, line: "deferred_revenue", side: "liability" },
  { test: /customer deposit|deposits? (received|from customers)|retainers? (received|held)/i, line: "customer_deposits", side: "liability" },
  { test: /credit card|\bvisa\b|mastercard|\bamex\b|american express/i, line: "credit_cards", side: "liability" },
  { test: /current portion|current maturit/i, line: "current_portion_debt", side: "liability" },
  { test: /accrued|payroll liabilit|wages payable|sales tax payable|401\s?k payable|garnishment/i, line: "accrued_liabilities", side: "liability" },
];

/**
 * The guide 5.6 detail line a balance-sheet account belongs to, if any. The
 * lines NWC adjusts for must sit where the adjustment assumes: a related-party
 * balance is a receivable in other current assets or a payable in other
 * current liabilities (a shareholder loan in long-term debt is neither), and
 * accrued interest and income taxes count only inside other current
 * liabilities. `category` is the line's mapped category, when known.
 */
export function bsDetailLine(account: string, section: string, category?: BsCategory): BsDetailLine | undefined {
  const name = normaliseAccount(account);
  const liability = /liabilit/i.test(section);
  const asset = /asset/i.test(section);
  for (const r of BS_DETAIL_RULES) {
    if (!r.test.test(name)) continue;
    if (r.side === "liability" && asset) continue;
    if (r.side === "asset" && liability) continue;
    if (r.line === "related_party_balances") {
      if (asset) return category === undefined || category === "other_current_assets" ? "related_party_receivable" : undefined;
      return category === undefined || category === "other_current_liabilities" ? "related_party_balances" : undefined;
    }
    if ((r.line === "accrued_interest" || r.line === "income_tax_payable") && category !== undefined && category !== "other_current_liabilities") return undefined;
    return r.line;
  }
  return undefined;
}

export interface DebtLikeClassification {
  treatment: DebtLikeTreatment;
  /** Revolving balances are repaid at close rather than paid off against a letter. */
  revolving: boolean;
  note?: string;
}

/**
 * How a liability account is treated in the debt-like schedule. Funded debt
 * and credit cards are debt; deferred revenue and customer deposits stay in
 * NWC (the AMB default) and appear as memo rows; accrued interest, income
 * taxes and related-party balances are debt-like. Everything else in
 * accrued liabilities is ordinary working capital.
 */
export function debtLikeTreatment(account: string, category: BsCategory, section: string): DebtLikeClassification | undefined {
  const name = normaliseAccount(account);
  if (category === "debt") {
    const revolving = /credit card|line of credit|\bloc\b|revolv|\bvisa\b|mastercard|\bamex\b/i.test(name);
    return { treatment: "debt", revolving, note: revolving ? "Repaid at or before closing" : undefined };
  }
  if (category !== "other_current_liabilities") return undefined;
  const detail = bsDetailLine(account, section, category);
  if (detail === "deferred_revenue" || detail === "customer_deposits") return { treatment: "nwc", revolving: false, note: "In NWC (AMB default)" };
  if (detail === "accrued_interest" || detail === "income_tax_payable" || detail === "related_party_balances") return { treatment: "debt_like", revolving: false };
  if (/bonus|unpaid payroll tax|payroll tax(es)? payable/i.test(name)) return { treatment: "debt_like", revolving: false };
  return { treatment: "nwc", revolving: false };
}

// --- Revenue lines ------------------------------------------------------------

/** Revenue accounts whose name says the revenue recurs (agreements, memberships, subscriptions). */
export function isRecurringRevenueName(account: string): boolean {
  return /maintenance (agreement|plan|contract)|membership|subscription|recurring|retainer|service (agreement|plan|contract)|monitoring/i.test(account);
}

/** Contra-revenue accounts: netted into revenue, never shown as a service line. */
export function isContraRevenueName(account: string): boolean {
  return /discount|refund|return|allowance|credit memo|write[- ]?off/i.test(account);
}
