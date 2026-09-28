// Bank transaction exports (CSV/XLSX): Date, Description, Amount — or
// separate Debit / Credit columns. Used to cross-check reported revenue
// against cash actually deposited (by month against the monthly grid, by
// year otherwise), and as a revenue proxy when nothing better exists.

import { fiscalYearOf, monthKey, parseMonthKey, type MonthKey } from "../domain/financials.ts";
import { parseAmount, parseDateString, readTable } from "../util/tables.ts";
import type { IngestExtract } from "./extract.ts";

export const NON_OPERATING_DEPOSIT = /transfer|xfer|trnsfr|from (sav|chk)|loan (proceeds|advance)|sba|ppp|owner (contribution|deposit)|capital contribution|reversal|returned item/i;

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
  let excluded = 0;
  for (const row of grid.slice(headerIdx + 1)) {
    const date = parseDateString(row[cols.date] ?? "");
    if (!date) continue;
    const credit = cols.amount !== undefined ? parseAmount(row[cols.amount]) : parseAmount(row[cols.credit!]);
    if (credit === undefined || credit <= 0) continue;
    const key = monthKey(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    const cur = (byMonth[key] ??= { amount: 0, excluded: 0 });
    if (NON_OPERATING_DEPOSIT.test(row[cols.description] ?? "")) {
      cur.excluded += credit;
      excluded += credit;
    } else {
      cur.amount += credit;
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
    notes: excluded
      ? [`${name}: $${Math.round(excluded).toLocaleString()} of transfers / loan proceeds / owner contributions excluded from deposits.`]
      : [],
  };
}
