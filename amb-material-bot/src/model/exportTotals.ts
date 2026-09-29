// The subtotals an accounting export prints (Total Income, Gross Profit,
// Total Current Assets, Net Income), re-formed from the accounts the model
// read, so C01 proves every subtotal and period rather than account lines
// alone (guide 5.7). A P&L total is a signed sum of the export's own
// sections (the headings it prints, not AMB categories, so a mapping choice
// cannot hide a dropped line); Net Income is the model's own net income, so
// the model is tied to the figure the books print. A balance-sheet total is
// the sum of the accounts under the heading it closes.

import type { ExportTotal, MonthKey } from "../domain/financials.ts";
import type { DatabookBsRow, DatabookRow, DatabookTotal, TotalFormation, TotalTerm } from "./types.ts";

const INCOME = /^(income|revenue|sales)$/i;
const COGS = /^(cost of (goods sold|sales)|cogs)$/i;
const EXPENSES = /^(expenses?|operating expenses)$/i;
const OTHER_INCOME = /^other income$/i;
const OTHER_EXPENSES = /^other expenses?$/i;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * How the Databook forms an export total from its rows, or undefined when
 * the label is not one the bot can re-form (the total is then shown on the
 * raw tab but not tied). `sections` are the export headings the rows carry.
 */
export function formationOf(t: ExportTotal, sections: string[]): TotalFormation | undefined {
  const label = t.label.trim();
  const total = /^total\s+(.+)$/i.exec(label);
  if (t.statement === "balance_sheet") {
    if (!total) return undefined;
    const name = total[1]!;
    const heading = t.path.at(-1);
    if (!heading || !same(heading, name)) return undefined;
    const under = (s: string, prefix: string) => same(s, prefix) || s.toLowerCase().startsWith(`${prefix.toLowerCase()} > `);
    const prefix = t.path.join(" > ");
    if (sections.some((s) => under(s, prefix))) return { terms: [{ section: prefix, sign: 1, nested: true }] };
    // A wrapper heading ("LIABILITIES AND EQUITY") is dropped from account paths: it is the sum of the headings it names.
    const parts = name.split(/\s+(?:and|&)\s+/i);
    if (parts.length > 1 && parts.every((p) => sections.some((s) => under(s, p)))) return { terms: parts.map((p) => ({ section: p, sign: 1 as const, nested: true })) };
    return undefined;
  }
  const pick = (re: RegExp, sign: 1 | -1): TotalTerm[] => sections.filter((s) => re.test(s)).map((section) => ({ section, sign }));
  if (total) {
    const heading = t.path.at(-1);
    if (!heading || !same(heading, total[1]!) || !sections.some((s) => same(s, t.path[0]!))) return undefined;
    return { terms: [{ section: t.path[0]!, sign: 1, ...(t.path.length > 1 ? { accountPrefix: `${t.path.slice(1).join(" : ")} : ` } : {}) }] };
  }
  // A computed line needs the headings it is computed from; without them it is shown but not tied.
  const of = (terms: TotalTerm[], needs: RegExp) => (sections.some((s) => needs.test(s)) ? { terms } : undefined);
  if (/^gross profit$/i.test(label)) return of([...pick(INCOME, 1), ...pick(COGS, -1)], INCOME);
  if (/^(net (operating|ordinary) income|operating income)$/i.test(label)) return of([...pick(INCOME, 1), ...pick(COGS, -1), ...pick(EXPENSES, -1)], INCOME);
  if (/^net other income$/i.test(label)) return of([...pick(OTHER_INCOME, 1), ...pick(OTHER_EXPENSES, -1)], /^other (income|expenses?)$/i);
  if (/^net (income|profit|loss)$/i.test(label)) return { netIncome: true };
  return undefined;
}

/** The Basis text a tie row prints for its formation. */
export function formationText(f: TotalFormation | undefined): string {
  if (!f) return "Not re-formed (shown for reference)";
  if ("netIncome" in f) return "Net income per the model";
  return f.terms
    .map((t, i) => {
      // A balance-sheet heading is named by its last level: the path is on the raw tab beside the total.
      const what = t.nested ? `accounts under ${t.section.split(" > ").at(-1)}` : t.accountPrefix ? `${t.section} > ${t.accountPrefix.replace(/ : $/, "")}` : t.section;
      return i === 0 ? (t.sign < 0 ? `less ${what}` : what.charAt(0).toUpperCase() + what.slice(1)) : `${t.sign < 0 ? "less" : "plus"} ${what}`;
    })
    .join(" ");
}

/** Whether a Databook row falls under a formation term. */
export function rowInTerm(row: { account: string; section?: string }, t: TotalTerm): boolean {
  const s = row.section ?? "";
  if (t.nested) return same(s, t.section) || s.toLowerCase().startsWith(`${t.section.toLowerCase()} > `);
  return same(s, t.section) && (!t.accountPrefix || row.account.toLowerCase().startsWith(t.accountPrefix.toLowerCase()));
}

/** Cents, as the Databook and the raw tabs hold every amount. */
const cents = (v: number) => Math.round(v * 100) / 100;

/** Net income's sign for each category: income adds, every cost takes away. */
const incomeSign = (category: string) => (category === "revenue" || category === "other_income" ? 1 : -1);

/**
 * Every export total with its printed amounts and the Databook's re-formed
 * ones for the same periods: P&L months when the model has a monthly grid,
 * else fiscal years (keyed "2025"); balance-sheet statement dates. Amounts
 * are taken in cents, as the workbook holds them, so the tie the workbook
 * computes is the tie computed here. Net income is the model's, summed by
 * category as the Monthly P&L (or the P&L Summary) sums it.
 */
export function databookTotals(totals: ExportTotal[], pnl: DatabookRow[], bs: DatabookBsRow[], opts: { months: MonthKey[]; years: number[]; bsDates: MonthKey[] }): DatabookTotal[] {
  const pnlSections = [...new Set(pnl.map((r) => r.section ?? ""))];
  const bsSections = [...new Set(bs.map((r) => r.section ?? ""))];
  const pnlValue = (r: DatabookRow, p: string) => cents(opts.months.length ? (r.byMonth?.[p] ?? 0) : (r.byFiscalYear[Number(p)] ?? 0));
  return totals.map((t) => {
    const formation = formationOf(t, t.statement === "pnl" ? pnlSections : bsSections);
    const periods = t.statement === "balance_sheet" ? opts.bsDates : opts.months.length ? opts.months : opts.years.map(String);
    const printed = (p: string) => (t.statement === "balance_sheet" || opts.months.length ? t.byMonth?.[p] : t.byFiscalYear[Number(p)]);
    const exported: Record<string, number> = {};
    const databook: Record<string, number> = {};
    for (const p of periods) {
      const v = printed(p);
      if (v === undefined) continue;
      exported[p] = cents(v);
      if (!formation) continue;
      if ("netIncome" in formation) {
        databook[p] = pnl.reduce((s, r) => s + incomeSign(r.category) * pnlValue(r, p), 0);
        continue;
      }
      databook[p] = formation.terms.reduce((sum, term) => {
        const amount = t.statement === "pnl" ? pnl.filter((r) => rowInTerm(r, term)).reduce((s, r) => s + pnlValue(r, p), 0) : bs.filter((r) => rowInTerm(r, term)).reduce((s, r) => s + cents(r.byMonth[p] ?? 0), 0);
        return sum + term.sign * amount;
      }, 0);
    }
    return { statement: t.statement, label: t.label, path: t.path, file: t.file, ...(formation ? { formation } : {}), exported, databook };
  });
}

/** Root-sum-square of one total's Databook amounts less the export's, over every period: its tie difference. */
export function totalDifference(t: DatabookTotal): number {
  let sq = 0;
  for (const [p, v] of Object.entries(t.databook)) sq += (v - (t.exported[p] ?? 0)) ** 2;
  return Math.sqrt(sq);
}

/** Root-sum-square of the Databook less the export over every tied total and period, the C01 difference. */
export function totalsDifference(totals: DatabookTotal[]): number {
  return Math.sqrt(totals.reduce((s, t) => s + totalDifference(t) ** 2, 0));
}
