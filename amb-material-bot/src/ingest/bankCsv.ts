// Bank transaction exports (CSV/XLSX): Date, Description, Amount — or
// separate Debit / Credit columns. Used to cross-check reported revenue
// against cash actually deposited, and as a revenue proxy when nothing
// better exists.

import type { SourceExtract } from "../domain/financials.ts";
import { parseAmount, readTable } from "../util/tables.ts";

const NON_OPERATING = /transfer|xfer|trnsfr|from (sav|chk)|loan (proceeds|advance)|sba|ppp|owner (contribution|deposit)|capital contribution|reversal|returned item/i;

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

function parseDate(s: string): { y: number; m: number } | undefined {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: Number(m[1]), m: Number(m[2]) };
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = Number(m[3]);
    return { y: y < 100 ? 2000 + y : y, m: Number(m[1]) };
  }
  return undefined;
}

export async function parseBankCsv(file: string, fyEndMonth: number): Promise<SourceExtract> {
  const grid = await readTable(file);
  const headerIdx = grid.findIndex((row) => findColumns(row) !== undefined);
  if (headerIdx < 0) throw new Error(`No Date/Description/Amount header in ${file}`);
  const cols = findColumns(grid[headerIdx]!)!;

  const byMonth = new Map<string, number>();
  let excluded = 0;
  for (const row of grid.slice(headerIdx + 1)) {
    const d = parseDate(row[cols.date] ?? "");
    if (!d) continue;
    const credit =
      cols.amount !== undefined ? parseAmount(row[cols.amount]) : parseAmount(row[cols.credit!]);
    if (credit === undefined || credit <= 0) continue;
    const key = `${d.y}-${String(d.m).padStart(2, "0")}`;
    byMonth.set(key, byMonth.get(key) ?? 0);
    if (NON_OPERATING.test(row[cols.description] ?? "")) {
      excluded += credit;
      continue;
    }
    byMonth.set(key, byMonth.get(key)! + credit);
  }

  const deposits: Record<number, { amount: number; months: number }> = {};
  for (const [key, amount] of byMonth) {
    const [y, m] = key.split("-").map(Number) as [number, number];
    const fy = m <= fyEndMonth ? y : y + 1;
    const cur = deposits[fy] ?? { amount: 0, months: 0 };
    deposits[fy] = { amount: cur.amount + amount, months: cur.months + 1 };
  }
  const name = file.split("/").pop();
  return {
    kind: "bank_statement",
    file,
    pnlLines: [],
    bsLines: [],
    fullYears: [],
    deposits,
    notes: excluded
      ? [`${name}: $${Math.round(excluded).toLocaleString()} of transfers / loan proceeds / owner contributions excluded from deposits.`]
      : [],
  };
}
