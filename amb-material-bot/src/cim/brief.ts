// The numbers brief: every figure a title, observation or paragraph may
// quote, read once from ModelOutput and formatted once (guide 4.8). Copy
// never carries a typed number for a model figure; it carries a token,
// "{{rev.FY2025}}", which resolves to "$3.04M" at build time. A sentence and
// the exhibit beside it therefore cannot disagree, and a model change flows
// into the prose without a redraft. Intake facts that are figures (members,
// hours, fleet) are in the brief too, so the literal-figure lint can tell a
// sourced number from an invented one.

import type { FinancialDataset, KpiSeries } from "../domain/financials.ts";
import { monthEndDate, monthLabel, parsePeriodKey } from "../domain/financials.ts";
import type { ModelOutput, PeriodColumn, PeriodValues } from "../model/types.ts";
import { isFieldDepartment } from "../model/analytics.ts";
import { cagr, describeDelta, fmtCount, fmtDollars, fmtMoney, fmtPct, growth, indefinite, wholeShares } from "../util/format.ts";

export interface Figure {
  key: string;
  /** Prose form, as it prints: "$3.04M", "12.4%", "1,450", "Jul-25". */
  text: string;
  value: number | null;
  label: string;
  /**
   * The set of customers (or other units) an aggregate counts, for figures
   * that total a population: "active at Dec-25" or "billed in FY2025". Two
   * such figures in one clause must count the same set (guide 4.8).
   */
  population?: string;
}

/** "{{key}}" tokens; page references ("{{page:S7.1}}") and footnote markers ("{{fn.mgmt}}") are resolved later, on the page. */
const TOKEN = /\{\{(?!page:|fn\.)([A-Za-z0-9_.:-]+)\}\}/g;

export class Brief {
  private readonly figures = new Map<string, Figure>();

  add(key: string, text: string, value: number | null, label: string, population?: string): void {
    this.figures.set(key, { key, text, value, label, ...(population ? { population } : {}) });
  }

  has(key: string): boolean {
    return this.figures.has(key);
  }

  get(key: string): Figure | undefined {
    return this.figures.get(key);
  }

  /** The figure's prose text; throws on an unknown key, because a module asking for a figure the brief lacks is a bug. */
  t(key: string): string {
    const f = this.figures.get(key);
    if (!f) throw new Error(`Numbers brief has no figure "${key}"`);
    return f.text;
  }

  /** The figure's text when the brief has it, else undefined (for figures that exist only with some data blocks). */
  maybe(key: string): string | undefined {
    return this.figures.get(key)?.text;
  }

  /** "a" or "an" as the figure is read aloud ("an 11.4% margin"), for templates that put an article before a token. */
  article(key: string): "a" | "an" {
    const f = this.figures.get(key);
    return f ? indefinite(f.text) : "a";
  }

  value(key: string): number | null | undefined {
    return this.figures.get(key)?.value;
  }

  list(): Figure[] {
    return [...this.figures.values()];
  }

  /** Replace every figure token. An unknown token becomes a visible placeholder and is reported through `onUnknown`. */
  resolve(text: string, onUnknown?: (key: string) => void): string {
    return text.replace(TOKEN, (_, key: string) => {
      const f = this.figures.get(key);
      if (f) return f.text;
      onUnknown?.(key);
      return `[Confirm: figure ${key}]`;
    });
  }

  /** Every printed form, for the literal-figure lint. */
  texts(): Set<string> {
    return new Set([...this.figures.values()].map((f) => f.text));
  }
}

/**
 * Clauses (split at ";" and at sentence ends) that pair figures counting
 * different populations: "the 52 accounts were 26.7% of revenue" reads 52 as
 * the accounts behind 26.7%, though 52 were active at Dec-25 and 56 billed.
 */
export function mixedPopulations(text: string, brief: Brief): { keys: string[]; populations: string[] }[] {
  const out: { keys: string[]; populations: string[] }[] = [];
  for (const clause of text.split(/[;.:](?:\s|$)/)) {
    const keys = [...clause.matchAll(TOKEN)].map((m) => m[1]!).filter((k) => brief.get(k)?.population);
    const populations = [...new Set(keys.map((k) => brief.get(k)!.population!))];
    if (populations.length > 1) out.push({ keys, populations });
  }
  return out;
}

/** Unknown figure tokens in a string, for the copy lint. */
export function unknownTokens(text: string, brief: Brief): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[1]!).filter((k) => !brief.has(k));
}

/** "Residential service and replacement" -> "residential"; later duplicates take the next word. */
export function slugs(labels: string[]): string[] {
  const used = new Set<string>();
  return labels.map((label) => {
    const words = label
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !["and", "the", "of", "for", "a", "an", "expenses", "expense"].includes(w));
    let slug = words[0] ?? "line";
    for (let i = 1; used.has(slug) && i < words.length; i++) slug = `${slug}-${words[i]}`;
    let n = 2;
    const base = slug;
    while (used.has(slug)) slug = `${base}${n++}`;
    used.add(slug);
    return slug;
  });
}

/** Periods the brief carries figures for: the fiscal years shown, and LTM and PF when they differ from the latest year. */
export interface BriefPeriods {
  fy: PeriodColumn[];
  latest: PeriodColumn;
  prior?: PeriodColumn;
  ltm?: PeriodColumn;
  pf?: PeriodColumn;
}

type Getter = (p: PeriodValues) => number;

/** Absolute percentage for prose, with the direction carried by the verb the writer picks from the label. */
const pctAbs = (v: number, dp = 1): string => (Number.isFinite(v) ? fmtPct(Math.abs(v), dp) : "n.a.");
const dirOf = (v: number): string => (v < 0 ? " (decline)" : "");

/**
 * The revenue mix every page uses: each service line's share of revenue
 * before discounts and refunds (the base the lines add to), exact and in
 * whole percent adding to 100. The chart, the service-line table and the
 * prose tokens all read it, so they cannot disagree (guide 4.8).
 */
export function revenueMix(p: PeriodValues, accounts: string[]): { exact: number[]; whole: number[] } {
  const amounts = accounts.map((a) => Math.max(0, p.revenueLines.find((x) => x.account === a)?.amount ?? 0));
  const base = amounts.reduce((s, v) => s + v, 0);
  return { exact: amounts.map((v) => (base ? v / base : 0)), whole: wholeShares(amounts) };
}

/** Smallest group whose pay the CIM may show: below it, one person's salary could be read off the table (guide 1.4). */
export const MIN_PAY_GROUP = 3;

type Department = NonNullable<ModelOutput["headcount"]>["byDepartment"][number];

/** Departments summed into one row of the compensation table; `key` names the row and its brief tokens. */
export interface PayGroup extends Department {
  key: string;
  departments: string[];
}

/** "Field service", "Installation" -> "Field service and installation". */
export function joinDepartments(names: string[]): string {
  const joined = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!.toLowerCase()}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function sumDepartments(key: string, members: Department[]): PayGroup {
  const count = members.reduce((sum, d) => sum + d.count, 0);
  const avgFte = members.reduce((sum, d) => sum + d.avgFte, 0);
  const totalComp = members.reduce((sum, d) => sum + d.totalComp, 0);
  const wages = members.every((d) => d.wages !== undefined) ? members.reduce((sum, d) => sum + d.wages!, 0) : undefined;
  return {
    key,
    department: joinDepartments(members.map((d) => d.department)),
    departments: members.map((d) => d.department),
    count,
    avgFte,
    totalComp,
    avgComp: avgFte ? totalComp / avgFte : 0,
    pctRevenue: members.reduce((sum, d) => sum + d.pctRevenue, 0),
    avgTenureYears: count ? members.reduce((sum, d) => sum + d.avgTenureYears * d.count, 0) / count : 0,
    ...(wages !== undefined ? { wages } : {}),
  };
}

/**
 * The rows the CIM shows compensation in. With field and office departments
 * both on the register, the rows follow the P&L's split of wages (technician
 * wages against office wages): the field departments together, the rest,
 * management included, together, so each row reconciles to its wage line
 * (guide 4.8). A register with no field department keeps its own
 * departments. Then any row of fewer than three people joins the smallest row
 * of three or more, so no average is one person's salary (guide 1.4).
 */
export function payGroups(depts: Department[]): PayGroup[] {
  const field = depts.filter((d) => isFieldDepartment(d.department));
  const office = depts.filter((d) => !isFieldDepartment(d.department));
  const groups = field.length && office.length ? [sumDepartments("field", field), sumDepartments("office", office)] : depts.map((d) => sumDepartments(d.department, [d]));
  const small = groups.filter((g) => g.count < MIN_PAY_GROUP);
  const large = groups.filter((g) => g.count >= MIN_PAY_GROUP);
  if (!small.length || !large.length) return groups;
  const host = large.reduce((a, b) => (b.count < a.count ? b : a));
  const members = [host, ...small];
  const merged = sumDepartments(host.key, depts.filter((d) => members.some((g) => g.departments.includes(d.department))));
  return groups.filter((g) => !members.includes(g)).concat(merged).sort((a, b) => b.count - a.count);
}

export function buildBrief(out: ModelOutput, ds: FinancialDataset, periods: BriefPeriods): Brief {
  const b = new Brief();
  const { fy, latest, prior, ltm, pf } = periods;
  const cols = [...fy, ...(ltm ? [ltm] : []), ...(pf ? [pf] : [])];
  const P = (c: PeriodColumn): PeriodValues => out.periods[c.key]!;
  const first = fy[0]!;
  const last = fy[fy.length - 1]!;
  const span = fy.length - 1;

  const money = (key: string, label: string, get: Getter, withGrowth = true) => {
    for (const c of cols) {
      const v = get(P(c));
      b.add(`${key}.${c.key}`, fmtMoney(v), v, `${label}, ${c.label}`);
    }
    const lv = get(P(latest));
    b.add(`${key}.latest`, fmtMoney(lv), lv, `${label}, ${latest.label} (latest full window)`);
    if (prior) b.add(`${key}.prior`, fmtMoney(get(P(prior))), get(P(prior)), `${label}, ${prior.label}`);
    if (!withGrowth) return;
    if (prior) {
      const pv = get(P(prior));
      const g = growth(pv, lv);
      if (Number.isFinite(g)) b.add(`${key}.yoy`, pctAbs(g), g, `${label} growth ${prior.label} to ${latest.label}${dirOf(g)}`);
      // From a loss to a profit there is no growth rate to quote, only the turn.
      else if (pv < 0 && lv > 0) b.add(`${key}.turn`, `turned positive in ${latest.label}`, null, `${label} moved from a loss in ${prior.label} to a profit in ${latest.label}`);
      const d = lv - pv;
      b.add(`${key}.change`, fmtMoney(Math.abs(d)), d, `${label} change ${prior.label} to ${latest.label}${dirOf(d)}`);
    }
    if (span >= 2) {
      const g = cagr(get(P(first)), get(P(last)), span);
      if (Number.isFinite(g)) b.add(`${key}.cagr`, pctAbs(g), g, `${label} CAGR ${first.label}–${last.label}${dirOf(g)}`);
    }
    // Growth across the fiscal years shown, whatever the latest window: the figure a fiscal-year table beside an LTM headline can quote.
    if (span >= 1) {
      const t = growth(get(P(first)), get(P(last)));
      if (Number.isFinite(t)) b.add(`${key}.total`, pctAbs(t, span >= 2 ? 0 : 1), t, `${label} total growth ${first.label}–${last.label}${dirOf(t)}`);
    }
  };

  const ratio = (key: string, label: string, get: Getter) => {
    for (const c of cols) {
      const v = get(P(c));
      b.add(`${key}.${c.key}`, fmtPct(v), v, `${label}, ${c.label}`);
    }
    const lv = get(P(latest));
    b.add(`${key}.latest`, fmtPct(lv), lv, `${label}, ${latest.label}`);
    if (prior) b.add(`${key}.deltaYoy`, describeDelta(get(P(prior)), lv), lv - get(P(prior)), `${label} change ${prior.label} to ${latest.label}`);
    if (span >= 1) b.add(`${key}.delta`, describeDelta(get(P(first)), get(P(last))), get(P(last)) - get(P(first)), `${label} change ${first.label} to ${last.label}`);
  };

  const rev: Getter = (p) => p.pnl.revenue;
  const den: Getter = (p) => p.ladder.marginDenominator || p.pnl.revenue;
  const of = (g: Getter): Getter => (p) => (den(p) ? g(p) / den(p) : Number.NaN);

  // --- P&L and ladder -----------------------------------------------------------------
  money("rev", "Revenue", rev);
  money("cogs", "Cost of revenue", (p) => p.pnl.cogs);
  money("gp", "Gross profit", (p) => p.pnl.grossProfit);
  // Excluding the owner means his employer payroll taxes too, which the P&L carries in payroll: the register's basis (F21).
  const staffPayroll = (p: PeriodValues) => p.pnl.payroll - (p.ownerPayrollTaxes ?? 0);
  money("payroll", "Payroll excluding the owner (his employer payroll taxes moved to owner compensation)", staffPayroll);
  money("ownerComp", "Owner compensation as paid (salary)", (p) => p.pnl.ownerComp);
  money("ownerTaxes", "The owner's employer payroll taxes, inside the P&L payroll line", (p) => p.ownerPayrollTaxes ?? 0, false);
  // Salaries print in whole dollars ("$200,000"), as the guide writes them (4.6).
  for (const c of cols) b.add(`ownerSalary.${c.key}`, fmtDollars(P(c).pnl.ownerComp), P(c).pnl.ownerComp, `The owner's salary as paid, ${c.label}`);
  b.add("ownerSalary.latest", fmtDollars(P(latest).pnl.ownerComp), P(latest).pnl.ownerComp, `The owner's salary as paid, ${latest.label}`);
  money("ownerCompPaid", "Owner compensation SDE adds back: salary as paid and his accepted employer payroll taxes ([S1] rung)", (p) => p.ladder.ownerCompAsPaid, false);
  money("rent", "Rent", (p) => p.pnl.rent);
  money("marketing", "Marketing", (p) => p.pnl.marketing);
  money("otherOpex", "Other operating expenses", (p) => p.pnl.otherOpex);
  money("opex", "Total operating expenses", (p) => p.pnl.totalOpex);
  money("opexExOwner", "Operating expenses excluding owner compensation (the summary income statement's line)", (p) => p.pnl.totalOpex - p.pnl.ownerComp);
  ratio("opexExOwnerPct", "Operating expenses excluding owner compensation as % of revenue", of((p) => p.pnl.totalOpex - p.pnl.ownerComp));
  money("otherItems", "Other income less other expense", (p) => p.pnl.otherItemsNet, false);
  money("da", "Depreciation and amortization", (p) => p.pnl.da);
  money("interest", "Interest expense", (p) => p.pnl.interest);
  money("netIncome", "Net income", (p) => p.pnl.netIncome);
  money("repEbitda", "Reported EBITDA", (p) => p.ladder.reportedEbitda);
  money("normTotal", "Total normalization adjustments", (p) => p.ladder.totalNormalization, false);
  money("sde", "Seller's discretionary earnings (SDE)", (p) => p.ladder.sde);
  money("s2", "Market replacement compensation [S2], as a positive amount", (p) => -p.ladder.marketReplacement, false);
  money("s3", "Capital reserve [S3], as a positive amount", (p) => -p.ladder.capitalReserve, false);
  money("ownerAboveMarket", "Owner compensation above the market replacement cost ([S1] + [S2])", (p) => p.ladder.ownerCompNormalization, false);
  money("adjEbitda", "Adj. EBITDA", (p) => p.ladder.adjEbitda);
  money("adjBeforeReserve", "Adj. EBITDA before the capital reserve [S3] (the pre-capex basis a buyer may compare on)", (p) => p.ladder.adjEbitda - p.ladder.capitalReserve, false);
  money("adjTotal", "Total adjustments from Reported EBITDA to Adj. EBITDA", (p) => p.ladder.adjEbitda - p.ladder.reportedEbitda, false);
  money("pfAdjEbitda", "PF Adj. EBITDA", (p) => p.ladder.pfAdjEbitda, false);
  ratio("gm", "Gross margin", of((p) => p.pnl.grossProfit));
  ratio("cogsPct", "Cost of revenue as % of revenue", of((p) => p.pnl.cogs));
  ratio("payrollPct", "Payroll excluding the owner as % of revenue", of(staffPayroll));
  // With his payroll taxes, as the cost tables show owner compensation (F21).
  ratio("ownerCompPct", "Owner compensation with his employer payroll taxes as % of revenue", of((p) => p.pnl.ownerComp + (p.ownerPayrollTaxes ?? 0)));
  ratio("opexPct", "Total operating expenses as % of revenue", of((p) => p.pnl.totalOpex));
  ratio("marketingPct", "Marketing as % of revenue", of((p) => p.pnl.marketing));
  ratio("repMargin", "Reported EBITDA margin", (p) => p.ladder.reportedMargin);
  ratio("sdeMargin", "SDE margin", (p) => p.ladder.sdeMargin);
  ratio("adjMargin", "Adj. EBITDA margin", (p) => p.ladder.adjMargin);
  ratio("pfMargin", "PF Adj. EBITDA margin", (p) => p.ladder.pfMargin);
  const rs = ds.recastInputs;
  if (rs) {
    b.add("replacementSalary", fmtDollars(rs.replacementSalary), rs.replacementSalary, "Market replacement salary for the working owner (before burden)");
    b.add("burdenPct", fmtPct(rs.burdenPct, 0), rs.burdenPct, "Payroll-tax and benefits burden on the replacement salary");
    b.add("replacementCost", fmtMoney(rs.replacementSalary * (1 + rs.burdenPct)), rs.replacementSalary * (1 + rs.burdenPct), "Replacement salary including burden ([S2] per year)");
  }
  b.add("mode.measure", fmtMoney(out.mode.measure), out.mode.measure, `Main Street test measure (${out.mode.measureLabel}, before the capital reserve)`);

  // --- Adjustments (accepted rows only reach the CIM, guide Q10) ---------------------------
  for (const { row, byColumn } of out.adjustments) {
    if (row.status !== "accepted" || row.tier === "definitional") continue;
    b.add(`adj.${row.ref}.label`, row.description, null, `[${row.ref}] description`);
    for (const c of cols) {
      const v = byColumn[c.key] ?? 0;
      b.add(`adj.${row.ref}.${c.key}`, fmtMoney(Math.abs(v)), v, `[${row.ref}] ${row.description}, ${c.label}${v < 0 ? " (reduces EBITDA)" : ""}`);
    }
  }
  // The add-backs that rest on the Seller's word alone, sized against the latest margin (spec 4.6: a consideration's answer is quantified).
  const repRows = out.adjustments.filter(({ row, byColumn }) => row.status === "accepted" && row.tier !== "pro_forma" && row.evidence === "management_representation" && (byColumn[latest.key] ?? 0) > 0);
  if (repRows.length) {
    const amount = repRows.reduce((s, r) => s + r.byColumn[latest.key]!, 0);
    const revenue = P(latest).pnl.revenue;
    b.add("adj.repOnly.latest", fmtMoney(amount), amount, `Accepted add-backs resting on management representation alone, ${latest.label}`);
    b.add("adj.repOnly.refs", repRows.map((r) => r.row.ref).join(", "), null, "Refs of those add-backs");
    if (revenue > 0) b.add("adj.repOnly.bps", `${Math.round((amount / revenue) * 10_000)} bps`, amount / revenue, `Those add-backs as a share of ${latest.label} revenue: the Adj. EBITDA margin without them is lower by this much`);
  }

  // --- Revenue lines and accounts ------------------------------------------------------------
  const lines = P(latest).revenueLines;
  const lineSlugs = slugs(lines.map((l) => l.label));
  // Shares are of revenue before discounts and refunds, whole percents adding to 100 (revenueMix), as the mix chart and table show them.
  const mixAccounts = (ds.revenueLines ?? []).filter((l) => !l.contra).map((l) => l.account);
  lines.forEach((l, i) => {
    const slug = lineSlugs[i]!;
    const get: Getter = (p) => p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0;
    b.add(`line.${slug}.label`, l.label, null, `Revenue line ${slug}`);
    money(`line.${slug}`, l.label, get);
    const k = mixAccounts.indexOf(l.account);
    if (k < 0) return;
    ratio(`line.${slug}.share`, `${l.label} as % of revenue before discounts`, (p) => revenueMix(p, mixAccounts).exact[k]!);
    for (const c of cols) {
      const whole = revenueMix(P(c), mixAccounts).whole[k]!;
      b.add(`line.${slug}.share0.${c.key}`, `${whole}%`, whole / 100, `${l.label} as % of revenue before discounts (whole percent; the lines add to 100%), ${c.label}`);
    }
  });
  const accounts = Object.entries(P(latest).accountLines).filter(([, v]) => Math.abs(v) >= 0.01 * P(latest).pnl.revenue);
  const acctSlugs = slugs(accounts.map(([a]) => accountLabel(a)));
  accounts.forEach(([account], i) => {
    const slug = acctSlugs[i]!;
    const get: Getter = (p) => p.accountLines[account] ?? 0;
    b.add(`acct.${slug}.label`, accountLabel(account), null, `Account ${account}`);
    money(`acct.${slug}`, accountLabel(account), get);
    ratio(`acct.${slug}.pct`, `${accountLabel(account)} as % of revenue`, of(get));
  });

  // --- Customers ------------------------------------------------------------------------------
  const cu = out.customers;
  if (cu) {
    const conc = cu.concentration;
    const active = `active at ${monthLabel(cu.period.end)}`;
    const billed = `billed in ${cu.period.label}`;
    b.add("cust.count", fmtCount(cu.latestCount), cu.latestCount, `Listed ${cu.term.toLowerCase()}s active at ${monthLabel(cu.period.end)}`, active);
    b.add("cust.top10Share", fmtPct(conc.top10Share), conc.top10Share, `Top 10 ${cu.term.toLowerCase()}s as % of revenue, ${cu.period.label}`);
    b.add("cust.top20Share", fmtPct(conc.top20Share), conc.top20Share, `Top 20 as % of revenue, ${cu.period.label}`);
    const top5 = conc.top.slice(0, 5).reduce((s, r) => s + r.pctOfTotal, 0);
    b.add("cust.top5Share", fmtPct(top5), top5, `Top 5 as % of revenue, ${cu.period.label}`);
    b.add("cust.largestShare", fmtPct(conc.largestShare), conc.largestShare, `Largest ${cu.term.toLowerCase()} as % of revenue, ${cu.period.label}`);
    const top = conc.top;
    if (top[0]) {
      b.add("cust.largestId", top[0].id, null, "Code of the largest customer");
      b.add("cust.largestRevenue", fmtMoney(top[0].revenue), top[0].revenue, `Revenue of ${top[0].id}, ${cu.period.label}`);
      if (top[0].since) b.add("cust.largestSince", String(top[0].since), top[0].since, `${top[0].id} customer since`);
    }
    const t10 = top.slice(0, 10);
    const t10rev = t10.reduce((s, r) => s + r.revenue, 0);
    b.add("cust.top10Revenue", fmtMoney(t10rev), t10rev, `Revenue of the top 10, ${cu.period.label}`);
    const tenured = t10.filter((r) => r.tenureYears >= 5).length;
    b.add("cust.top10Over5Years", fmtCount(tenured), tenured, "Top-10 customers served for five years or more");
    const minTenure = Math.min(...t10.map((r) => r.tenureYears));
    if (Number.isFinite(minTenure)) b.add("cust.top10MinTenure", `${Math.floor(minTenure)} years`, minTenure, "Shortest tenure among the top 10 (whole years)");
    const residual = cu.mixByType.find((m) => m.count === 0);
    const coded = cu.mixByType.filter((m) => m.count > 0);
    const codedRev = coded.reduce((s, m) => s + m.revenue, 0);
    const codedCount = coded.reduce((s, m) => s + m.count, 0);
    // Billed in the year is a larger set than active at its end; each figure carries its set, so the lint can hold a clause to one.
    b.add("cust.billedCount", fmtCount(codedCount), codedCount, `Listed ${cu.term.toLowerCase()}s billed at any time in ${cu.period.label}`, billed);
    b.add("cust.codedRevenue", fmtMoney(codedRev), codedRev, `Revenue from listed ${cu.term.toLowerCase()}s billed in ${cu.period.label}`, billed);
    b.add("cust.codedShare", fmtPct(codedRev / conc.total), codedRev / conc.total, `Listed ${cu.term.toLowerCase()}s billed in ${cu.period.label} as % of revenue`, billed);
    b.add("cust.codedShare0", fmtPct(codedRev / conc.total, 0), codedRev / conc.total, "Listed (coded) accounts as % of revenue, whole percent: the scope of every retention figure", billed);
    b.add("cust.top10ShareOfCoded", fmtPct(t10rev / codedRev, 0), t10rev / codedRev, "Top 10 as % of coded-customer revenue");
    if (residual) b.add("cust.residualShare", fmtPct(residual.revenue / conc.total), residual.revenue / conc.total, `${residual.type} as % of revenue`);
    const typeSlugs = slugs(coded.map((m) => m.type));
    coded.forEach((m, i) => {
      const s = typeSlugs[i]!;
      b.add(`cust.type.${s}.label`, m.type, null, `Customer type ${s}`);
      b.add(`cust.type.${s}.count`, fmtCount(m.count), m.count, `${m.type}: accounts billed in ${cu.period.label}`, `${billed}, ${m.type}`);
      b.add(`cust.type.${s}.revenue`, fmtMoney(m.revenue), m.revenue, `${m.type}: revenue`, `${billed}, ${m.type}`);
      b.add(`cust.type.${s}.share`, fmtPct(m.revenuePct), m.revenuePct, `${m.type}: % of revenue`, `${billed}, ${m.type}`);
      b.add(`cust.type.${s}.avg`, fmtMoney(m.avgRevenue), m.avgRevenue, `${m.type}: average revenue per account`);
    });
    for (const [fyKey, r] of Object.entries(cu.retention?.byFiscalYear ?? {})) {
      const k = `FY${fyKey}`;
      b.add(`cust.start.${k}`, fmtCount(r.counts.startingCount), r.counts.startingCount, `Accounts at the start of ${k}`);
      b.add(`cust.new.${k}`, fmtCount(r.counts.newCustomers), r.counts.newCustomers, `New accounts in ${k}`);
      b.add(`cust.lost.${k}`, fmtCount(r.counts.lostCustomers), r.counts.lostCustomers, `Accounts lost in ${k}`);
      const fyEnd = out.columns.find((c) => c.ref.kind === "fiscal_year" && c.ref.fiscalYear === Number(fyKey))?.end;
      b.add(`cust.end.${k}`, fmtCount(r.counts.endingCount), r.counts.endingCount, `Accounts at the end of ${k}`, fyEnd ? `active at ${monthLabel(fyEnd)}` : undefined);
      b.add(`cust.churn.${k}`, fmtPct(r.counts.churn), r.counts.churn, `Account churn in ${k} (lost ÷ average accounts)`);
      if (r.dollars.startingRevenue > 0) {
        b.add(`cust.gdr.${k}`, fmtPct(r.dollars.gdr), r.dollars.gdr, `Gross dollar retention in ${k}`);
        b.add(`cust.ndr.${k}`, fmtPct(r.dollars.ndr), r.dollars.ndr, `Net dollar retention in ${k}`);
        b.add(`cust.upsell.${k}`, fmtMoney(r.dollars.upsell), r.dollars.upsell, `Revenue growth from continuing accounts in ${k}`);
        b.add(`cust.downsell.${k}`, fmtMoney(r.dollars.downsell), r.dollars.downsell, `Revenue decline from continuing accounts that spent less in ${k}`);
        b.add(`cust.netExpansion.${k}`, fmtMoney(r.dollars.upsell - r.dollars.downsell), r.dollars.upsell - r.dollars.downsell, `Net revenue change from continuing accounts (upsell less downsell) in ${k}`);
        b.add(`cust.churnRevenue.${k}`, fmtMoney(r.dollars.churn), r.dollars.churn, `Prior-year revenue of accounts lost in ${k}`);
        b.add(`cust.newRevenue.${k}`, fmtMoney(r.dollars.newRevenue), r.dollars.newRevenue, `Revenue from accounts won in ${k}`);
        // What the customer list billed in the year beyond the bridge's ending revenue: the lost accounts' revenue before they left.
        const billed = (ds.customers?.customers ?? []).reduce((s, c) => s + (c.revenueByFiscalYear[Number(fyKey)] ?? 0), 0);
        const lostBilled = billed - r.dollars.endingRevenue;
        if (lostBilled > 0) b.add(`cust.lostBilled.${k}`, fmtMoney(lostBilled), lostBilled, `Revenue billed in ${k} by accounts lost during ${k}, which the ending revenue of the bridge leaves out`);
      }
    }
    if (cu.retention) b.add("cust.medianTenure", `${cu.retention.medianTenureYears.toFixed(1)} years`, cu.retention.medianTenureYears, "Median tenure of active accounts");
    const nm = out.namedOutputs;
    if (nm.GDR_LTM !== null) b.add("cust.gdr.latest", fmtPct(nm.GDR_LTM), nm.GDR_LTM, `Gross dollar retention, ${latest.label}`);
    if (nm.NDR_LTM !== null) b.add("cust.ndr.latest", fmtPct(nm.NDR_LTM), nm.NDR_LTM, `Net dollar retention, ${latest.label}`);
  }

  // --- Headcount ------------------------------------------------------------------------------
  const hc = out.headcount;
  if (hc) {
    b.add("hc.total", fmtCount(hc.latestHeadcount), hc.latestHeadcount, `Employees excluding the owner at ${hc.asOf}`);
    b.add("hc.field", fmtCount(hc.latestFieldHeadcount), hc.latestFieldHeadcount, `Field employees at ${hc.asOf}`);
    b.add("hc.nonField", fmtCount(hc.latestHeadcount - hc.latestFieldHeadcount), hc.latestHeadcount - hc.latestFieldHeadcount, "Office and management employees");
    const depSlugs = slugs(hc.byDepartment.map((d) => d.department));
    hc.byDepartment.forEach((d, i) => {
      const s = depSlugs[i]!;
      b.add(`hc.dept.${s}.label`, d.department, null, `Department ${s}`);
      b.add(`hc.dept.${s}.count`, fmtCount(d.count), d.count, `${d.department}: employees`);
      b.add(`hc.dept.${s}.tenure`, `${d.avgTenureYears.toFixed(1)} years`, d.avgTenureYears, `${d.department}: average tenure`);
    });
    // Pay is quoted only by the compensation table's rows (field and office, three or more people each), so a sentence
    // reconciles to the P&L wage lines as the table does and no figure is one person's salary (guide 1.4).
    const groups = payGroups(hc.byDepartment);
    const groupSlugs = groups.map((g, i) => (g.key === "field" || g.key === "office" ? g.key : slugs(groups.map((x) => x.department))[i]!));
    groups.forEach((g, i) => {
      const s = groupSlugs[i]!;
      b.add(`hc.group.${s}.label`, g.department, null, `Compensation row ${s}`);
      b.add(`hc.group.${s}.count`, fmtCount(g.count), g.count, `${g.department}: employees`);
      if (g.count >= MIN_PAY_GROUP) {
        b.add(`hc.group.${s}.avgComp`, fmtMoney(g.avgComp), g.avgComp, `${g.department}: average compensation including employer costs`);
        b.add(`hc.group.${s}.pctRevenue`, fmtPct(g.pctRevenue), g.pctRevenue, `${g.department}: compensation including employer costs as % of revenue`);
        if (g.wages !== undefined) b.add(`hc.group.${s}.wages`, fmtMoney(g.wages), g.wages, `${g.department}: wages before employer costs`);
      }
      b.add(`hc.group.${s}.tenure`, `${g.avgTenureYears.toFixed(1)} years`, g.avgTenureYears, `${g.department}: average tenure`);
    });
    for (const [fyKey, r] of Object.entries(hc.rollForwardByFiscalYear)) {
      const k = `FY${fyKey}`;
      b.add(`hc.start.${k}`, fmtCount(r.start), r.start, `Employees at the start of ${k}`);
      b.add(`hc.hires.${k}`, fmtCount(r.hires), r.hires, `Hires in ${k}`);
      b.add(`hc.departures.${k}`, fmtCount(r.departures), r.departures, `Departures in ${k}`);
      b.add(`hc.end.${k}`, fmtCount(r.end), r.end, `Employees at the end of ${k}`);
    }
    const over2 = hc.tenureAtDeparture.find((t) => t.bucket === "Over 2 Years")?.count ?? 0;
    const departed = hc.tenureAtDeparture.reduce((s, t) => s + t.count, 0);
    b.add("hc.departedTotal", fmtCount(departed), departed, "Departures in the register window");
    b.add("hc.departedOver2Years", fmtCount(over2), over2, "Departures after more than two years of tenure");
  }
  for (const c of cols) {
    const k = P(c).kpis;
    if (k.revenue_per_employee) b.add(`hc.revPerEmployee.${c.key}`, fmtMoney(k.revenue_per_employee), k.revenue_per_employee, `Revenue per employee, ${c.label}`);
    if (k.revenue_per_field_employee) {
      b.add(`hc.revPerField.${c.key}`, fmtMoney(k.revenue_per_field_employee), k.revenue_per_field_employee, `Revenue per field employee, ${c.label}`);
      // The field headcount behind the ratio, at the period's end, so prose compares year-end field staff with year-end field staff.
      const field = P(c).pnl.revenue / k.revenue_per_field_employee;
      b.add(`hc.fieldEnd.${c.key}`, fmtCount(field), field, `Field employees (FTE) at the end of ${c.label}`);
    }
    if (k.labor_cost_pct_revenue !== undefined) b.add(`hc.laborPct.${c.key}`, fmtPct(k.labor_cost_pct_revenue), k.labor_cost_pct_revenue, `Payroll excluding the owner as % of revenue, ${c.label}`);
    if (k.recurring_revenue_pct !== undefined) b.add(`recurringShare.${c.key}`, fmtPct(k.recurring_revenue_pct), k.recurring_revenue_pct, `Recurring revenue lines as % of revenue, ${c.label}`);
  }

  // --- Operating KPIs from the sources ---------------------------------------------------------
  for (const k of ds.kpis ?? []) {
    const v = latestKpi(k, out.fiscalYearEndMonth);
    if (v !== undefined) b.add(`kpi.${k.key}`, fmtKpi(k, v), v, `${k.label}${k.evidence === "management_representation" ? " (per management)" : ""}`);
  }
  // Agreement and fleet economics the capacity table derives, so prose can quote them.
  const members = ds.kpis?.find((k) => k.key === "maintenance_members");
  const recurring = P(latest).revenueLines.filter((l) => l.recurring);
  const memberCount = members ? latestKpi(members, out.fiscalYearEndMonth) : undefined;
  if (memberCount && recurring.length === 1) {
    b.add("agreement.revenuePerMember", fmtDollars(Math.round(recurring[0]!.amount / memberCount)), recurring[0]!.amount / memberCount, `${latest.label} ${recurring[0]!.label.toLowerCase()} revenue per member`);
    if (/two tune-ups/i.test(members!.definition ?? "")) b.add("agreement.visitsPerYear", fmtCount(memberCount * 2), memberCount * 2, "Tune-up visits a year (two per member)");
    const techs = out.headcount?.byDepartment.find((d) => /field service|service/i.test(d.department));
    if (techs) b.add("agreement.membersPerTech", fmtCount(Math.round(memberCount / techs.count)), memberCount / techs.count, `Members per ${techs.department.toLowerCase()} employee`);
    if (techs && /two tune-ups/i.test(members!.definition ?? "")) b.add("agreement.visitsPerTech", fmtCount(Math.round((memberCount * 2) / techs.count)), (memberCount * 2) / techs.count, `Tune-up visits a year per ${techs.department.toLowerCase()} employee (two per member)`);
  }
  const fleetItems = ds.intake?.fleetAndEquipment.filter((f) => f.count !== undefined) ?? [];
  if (fleetItems.length) {
    const n = fleetItems.reduce((sum, f) => sum + (f.count ?? 0), 0);
    b.add("fleet.count", fmtCount(n), n, "Vehicles in the fleet (per management)");
    b.add("fleet.revenuePerVehicle", fmtMoney(P(latest).pnl.revenue / n), P(latest).pnl.revenue / n, `${latest.label} revenue per vehicle`);
    if (out.headcount?.latestFieldHeadcount) b.add("fleet.perField", (n / out.headcount.latestFieldHeadcount).toFixed(1), n / out.headcount.latestFieldHeadcount, "Vehicles per field employee");
  }

  // Headcount from the intake notes, for a deal without a payroll register; owner rows are not employees.
  const composition = ds.intake?.workforce.composition ?? [];
  if (composition.length) {
    const staff = composition.filter((c) => !/\bowner\b/i.test(c.role)).reduce((sum, c) => sum + c.count, 0);
    b.add("staff.total", fmtCount(staff), staff, "Employees excluding the owner (per management)");
  }

  const owner = ds.intake?.owner;
  if (owner?.hoursPerWeek) b.add("owner.hours", String(owner.hoursPerWeek), owner.hoursPerWeek, "Owner hours per week (per management)");
  if (owner?.age) b.add("owner.age", String(owner.age), owner.age, "Owner age (per management)");
  if (owner?.transition.months) b.add("owner.transitionMonths", String(owner.transition.months), owner.transition.months, "Months of transition the owner offers (per management)");
  if (ds.intake?.company.founded) {
    b.add("company.founded", String(ds.intake.company.founded), ds.intake.company.founded, "Year founded");
    const years = Number(out.asOfDate.slice(0, 4)) - ds.intake.company.founded;
    b.add("company.age", `${years} years`, years, `Years in business at ${monthLabel(out.asOfDate.slice(0, 7))}`);
  }
  for (const m of ds.intake?.management ?? []) {
    const since = m.since ? Number(m.since.slice(0, 4)) : undefined;
    if (!since) continue;
    const slug = slugs([m.name])[0]!;
    const years = Number(out.asOfDate.slice(0, 4)) - since;
    b.add(`mgmt.${slug}.since`, String(since), since, `${m.name} (${m.role}) with the Company since`);
    b.add(`mgmt.${slug}.tenure`, `${years} years`, years, `${m.name} tenure at ${monthLabel(out.asOfDate.slice(0, 7))}`);
  }

  // --- Monthly shape ------------------------------------------------------------------------------
  const mo = out.monthly;
  if (mo) {
    const revs = mo.series.revenue ?? [];
    const adj = mo.series.adj_ebitda ?? [];
    for (const c of fy) {
      const idx = mo.months.map((m, i) => (m.fiscalYear === c.fiscalYear ? i : -1)).filter((i) => i >= 0);
      if (idx.length !== 12) continue;
      const peak = idx.reduce((a, i) => (revs[i]! > revs[a]! ? i : a), idx[0]!);
      const trough = idx.reduce((a, i) => (revs[i]! < revs[a]! ? i : a), idx[0]!);
      b.add(`month.peak.${c.key}`, monthLabel(mo.months[peak]!.key), null, `Highest revenue month of ${c.label}`);
      b.add(`month.peakRevenue.${c.key}`, fmtMoney(revs[peak]!), revs[peak]!, `Revenue in the highest month of ${c.label}`);
      b.add(`month.trough.${c.key}`, monthLabel(mo.months[trough]!.key), null, `Lowest revenue month of ${c.label}`);
      b.add(`month.troughRevenue.${c.key}`, fmtMoney(revs[trough]!), revs[trough]!, `Revenue in the lowest month of ${c.label}`);
      // Multiples print at one decimal (spec 4.1). A month with no revenue (a seasonal closure) or net refunds has no
      // meaningful multiple, so the token is left out and the copy falls back to naming the low month.
      if (revs[trough]! > 0) {
        const ratioPT = revs[peak]! / revs[trough]!;
        b.add(`month.peakToTrough.${c.key}`, `${ratioPT.toFixed(1)}x`, ratioPT, `Highest month ÷ lowest month, ${c.label}`);
      }
      const neg = idx.filter((i) => adj[i]! < 0).length;
      b.add(`month.adjNegative.${c.key}`, fmtCount(neg), neg, `Months with negative Adj. EBITDA in ${c.label}`);
      const quarters = [0, 1, 2, 3].map((q) => idx.filter((i) => Math.floor((mo.months[i]!.fiscalMonth - 1) / 3) === q).reduce((s, i) => s + revs[i]!, 0));
      const yr = quarters.reduce((s, v) => s + v, 0);
      quarters.forEach((v, q) => {
        b.add(`q${q + 1}.${c.key}`, fmtMoney(v), v, `Fiscal Q${q + 1} revenue, ${c.label}`);
        b.add(`q${q + 1}.share.${c.key}`, fmtPct(v / yr), v / yr, `Fiscal Q${q + 1} share of ${c.label} revenue`);
      });
    }
    const seas = mo.series.seasonality_index ?? [];
    const lastIdx = mo.months.length - 1;
    const t12 = mo.series.trailing_12_revenue?.[lastIdx];
    if (t12) b.add("month.t12Latest", fmtMoney(t12), t12, `Trailing-12-month revenue at ${monthLabel(mo.months[lastIdx]!.key)}`);
    const recent = seas.slice(-12);
    if (recent.length === 12 && recent.every((v) => v > 0)) {
      const hi = Math.max(...recent);
      const lo = Math.min(...recent);
      b.add("season.high", hi.toFixed(2), hi, "Highest seasonality index in the last 12 months (month ÷ trailing-12 average)");
      b.add("season.low", lo.toFixed(2), lo, "Lowest seasonality index in the last 12 months");
    }
  }

  // --- Balance sheet, working capital, cash flow ---------------------------------------------------
  for (const c of fy) {
    const bs = P(c).bs;
    if (!bs) continue;
    b.add(`bs.cash.${c.key}`, fmtMoney(bs.cash), bs.cash, `Cash at ${c.label} year-end`);
    b.add(`bs.debt.${c.key}`, fmtMoney(bs.debt), bs.debt, `Debt at ${c.label} year-end`);
    b.add(`bs.equity.${c.key}`, fmtMoney(bs.equity), bs.equity, `Equity at ${c.label} year-end`);
    b.add(`bs.fixedAssets.${c.key}`, fmtMoney(bs.fixedAssets), bs.fixedAssets, `Net fixed assets at ${c.label} year-end`);
  }
  // The latest dated sheet, year-end or not, so working capital can be quoted for a client whose sheets fall mid-year.
  const lastNwc = out.nwc?.periods[out.nwc.periods.length - 1];
  if (lastNwc) {
    const at = monthLabel(lastNwc.month);
    b.add("nwc.latest", fmtMoney(lastNwc.lines.adjustedNwc), lastNwc.lines.adjustedNwc, `Adjusted net working capital at ${at}`);
    b.add("nwc.pct.latest", fmtPct(lastNwc.lines.pctLtmRevenue), lastNwc.lines.pctLtmRevenue, `NWC as % of the twelve months' revenue to ${at}`);
  }
  for (const p of out.nwc?.periods ?? []) {
    const fyCol = fy.find((c) => c.end === p.month);
    if (!fyCol) continue;
    const k = fyCol.key;
    b.add(`nwc.${k}`, fmtMoney(p.lines.adjustedNwc), p.lines.adjustedNwc, `Adjusted net working capital at ${fyCol.label} year-end`);
    b.add(`nwc.pct.${k}`, fmtPct(p.lines.pctLtmRevenue), p.lines.pctLtmRevenue, `NWC as % of ${fyCol.label} revenue`);
    b.add(`dso.${k}`, `${Math.round(p.lines.dso)} days`, p.lines.dso, `Days sales outstanding at ${fyCol.label}`);
    b.add(`dio.${k}`, `${Math.round(p.lines.dio)} days`, p.lines.dio, `Days inventory outstanding at ${fyCol.label}`);
    b.add(`dpo.${k}`, `${Math.round(p.lines.dpo)} days`, p.lines.dpo, `Days payables outstanding at ${fyCol.label}`);
  }
  // Operating bank deposits against revenue, per fiscal year the bank source covers in full (the C14 proof of cash).
  const dep = ds.depositsByMonth;
  if (dep) {
    for (const c of fy) {
      const months = Object.keys(dep).filter((m) => m >= c.start && m <= c.end);
      if (months.length !== 12) continue;
      const total = months.reduce((s, m) => s + dep[m]!.amount, 0);
      b.add(`bank.deposits.${c.key}`, fmtMoney(total), total, `Operating bank deposits, ${c.label}`);
      b.add(`bank.depositsPct.${c.key}`, fmtPct(total / P(c).pnl.revenue), total / P(c).pnl.revenue, `Operating bank deposits as % of ${c.label} revenue`);
    }
  }
  if (out.debtLike) b.add("debt.funded", fmtMoney(out.debtLike.fundedDebt), out.debtLike.fundedDebt, `Funded debt at ${out.debtLike.asOf}`);
  for (const cf of out.cashFlow ?? []) {
    const k = `FY${cf.fiscalYear}`;
    b.add(`cfo.${k}`, fmtMoney(cf.cfo), cf.cfo, `Cash from operations, ${k}`);
    b.add(`capex.${k}`, fmtMoney(Math.abs(cf.capex)), Math.abs(cf.capex), `Capital expenditure (derived), ${k}`);
    b.add(`fcf.${k}`, fmtMoney(cf.freeCashFlow), cf.freeCashFlow, `Free cash flow, ${k}`);
    b.add(`fcfConversion.${k}`, fmtPct(cf.cashConversion, 0), cf.cashConversion, `Free cash flow ÷ Reported EBITDA, ${k}`);
  }
  return b;
}

/** A client-grade label from an exported account name: "Payroll Expenses : Technician Wages" -> "Technician wages". */
export function accountLabel(account: string): string {
  const parts = account.split(":").map((s) => s.trim());
  let leaf = parts.pop()!.replace(/\s+-\s+/g, ", ").replace(/&/g, "and");
  // A generic leaf ("Payroll Expenses : Taxes") reads as income tax, or as anything, on its own, so it takes its parent's name.
  const parent = parts.at(-1)?.replace(/\s+(expenses?|costs?)$/i, "");
  if (parent && GENERIC_LEAF.test(leaf)) leaf = `${parent} ${leaf.toLowerCase()}`;
  return leaf.charAt(0).toUpperCase() + leaf.slice(1).toLowerCase();
}

const GENERIC_LEAF = /^(taxes|other|fees|benefits|miscellaneous|misc\.?)$/i;

/**
 * The most recent value of a KPI series, whatever its period keys: ordered by
 * the date each period ends (a fiscal year at its year-end under `fye`), and
 * on a tie the point-in-time value, which is the latest reading.
 */
export function latestKpi(k: KpiSeries, fye = 12): number | undefined {
  const ends = (key: string): [string, number] => {
    const ref = parsePeriodKey(key);
    switch (ref.kind) {
      case "point":
        return [ref.date, 1];
      case "fiscal_year":
        return [monthEndDate(`${ref.fiscalYear}-${String(fye).padStart(2, "0")}`), 0];
      case "month":
        return [monthEndDate(ref.key), 0];
      default:
        return [monthEndDate(ref.end), 0];
    }
  };
  const keys = Object.keys(k.values).sort((a, b) => {
    const [da, pa] = ends(a);
    const [db, pb] = ends(b);
    return da < db ? -1 : da > db ? 1 : pa - pb;
  });
  const last = keys[keys.length - 1];
  return last === undefined ? undefined : k.values[last];
}

export function fmtKpi(k: Pick<KpiSeries, "unit">, v: number): string {
  switch (k.unit) {
    case "percent":
      return fmtPct(v, 0);
    case "currency":
      return fmtMoney(v);
    case "rating":
      return v.toFixed(1);
    case "ratio":
      return `${v.toFixed(1)}x`;
    case "sq_ft":
      return `${fmtCount(v)} sq ft`;
    case "miles":
      return `${fmtCount(v)} miles`;
    default:
      return fmtCount(v);
  }
}
