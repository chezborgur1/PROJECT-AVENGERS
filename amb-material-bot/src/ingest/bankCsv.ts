// Bank transaction exports (CSV/XLSX): Date, Description, Amount — or
// separate Debit / Credit columns. Used to cross-check reported revenue
// against cash actually deposited (by month against the monthly grid, by
// year otherwise), and as a revenue proxy when nothing better exists.

import path from "node:path";
import { fiscalYearOf, monthKey, parseMonthKey, type BankClassification, type BankTransaction, type MonthKey } from "../domain/financials.ts";
import { parseAmount, parseDateString, readTable } from "../util/tables.ts";
import type { IngestExtract } from "./extract.ts";

/**
 * How a bank line is treated in the proof of cash. Money out is a
 * withdrawal; money in is an operating deposit unless its description marks
 * it as a transfer between the business's own accounts, loan proceeds, an
 * owner's contribution or a reversal, none of which is revenue collected.
 */
export function classifyBankLine(description: string, amount: number): BankClassification {
  if (amount <= 0) return "Withdrawal";
  if (/transfer|xfer|trnsfr|from (sav|chk)/i.test(description)) return "Transfer";
  if (/loan (proceeds|advance)|sba|ppp/i.test(description)) return "Loan";
  if (/owner (contribution|deposit)|capital contribution/i.test(description)) return "Owner";
  if (/reversal|returned item/i.test(description)) return "Reversal";
  return "Operating";
}

/** Cents, as a bank prints them: sums of exported amounts carry binary noise (185701.65000000002). */
const cents = (v: number) => Math.round(v * 100) / 100;

interface Columns {
  date: number;
  description: number;
  amount?: number;
  credit?: number;
  debit?: number;
}

function findColumns(header: string[]): Columns | undefined {
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h.trim()));
  const date = idx(/^(posting |transaction |post )?date$/i);
  const description = idx(/description|memo|payee|details|name/i);
  const amount = idx(/^amount$/i);
  const credit = idx(/credit|deposit/i);
  const debit = idx(/debit|withdrawal/i);
  if (date < 0 || description < 0) return undefined;
  if (amount >= 0) return { date, description, amount };
  if (credit >= 0) return { date, description, credit, debit: debit >= 0 ? debit : undefined };
  return undefined;
}

export function looksLikeBankExport(grid: string[][]): boolean {
  return grid.slice(0, 10).some((row) => findColumns(row) !== undefined);
}

/** Deposits by fiscal year from the monthly series, the legacy shape. */
export function depositsByFiscalYear(byMonth: Record<MonthKey, { amount: number; excluded: number }>, fyEndMonth: number): Record<number, { amount: number; months: number }> {
  const out: Record<number, { amount: number; months: number }> = {};
  for (const [key, d] of Object.entries(byMonth)) {
    const { year, month } = parseMonthKey(key);
    const fy = fiscalYearOf(year, month, fyEndMonth);
    const cur = out[fy] ?? { amount: 0, months: 0 };
    out[fy] = { amount: cur.amount + d.amount, months: cur.months + 1 };
  }
  return out;
}

export async function parseBankCsv(file: string, fyEndMonth: number): Promise<IngestExtract> {
  const grid = await readTable(file);
  const headerIdx = grid.findIndex((row) => findColumns(row) !== undefined);
  if (headerIdx < 0) throw new Error(`No Date/Description/Amount header in ${file}`);
  const cols = findColumns(grid[headerIdx]!)!;

  const byMonth: Record<MonthKey, { amount: number; excluded: number }> = {};
  const transactions: BankTransaction[] = [];
  let excluded = 0;
  for (const row of grid.slice(headerIdx + 1)) {
    const date = parseDateString(row[cols.date] ?? "");
    if (!date) continue;
    const amount = cols.amount !== undefined ? parseAmount(row[cols.amount]) : (parseAmount(row[cols.credit!]) ?? 0) - (cols.debit !== undefined ? (parseAmount(row[cols.debit]) ?? 0) : 0);
    if (amount === undefined || amount === 0) continue;
    const description = (row[cols.description] ?? "").trim();
    const classification = classifyBankLine(description, amount);
    transactions.push({ date, description, amount: cents(amount), classification, file: path.basename(file) });
    if (classification === "Withdrawal") continue;
    const key = monthKey(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    const cur = (byMonth[key] ??= { amount: 0, excluded: 0 });
    if (classification === "Operating") cur.amount = cents(cur.amount + amount);
    else {
      cur.excluded = cents(cur.excluded + amount);
      excluded += amount;
    }
  }

  const name = file.split("/").pop();
  return {
    kind: "bank_statement",
    file,
    pnlLines: [],
    bsLines: [],
    fullYears: [],
    deposits: depositsByFiscalYear(byMonth, fyEndMonth),
    depositsByMonth: byMonth,
    bankTransactions: transactions,
    notes: excluded
      ? [`${name}: $${Math.round(excluded).toLocaleString()} of transfers / loan proceeds / owner contributions excluded from deposits.`]
      : [],
  };
}
