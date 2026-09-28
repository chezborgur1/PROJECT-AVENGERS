// Shared logic for accounting reports laid out as rows of accounts against
// period columns: QuickBooks exports (CSV/XLSX) and the QuickBooks Online
// Reports API both reduce to this shape.

import { addMonths, fiscalYearOf, monthKey, monthLabel, parseMonthKey, type MonthKey, type RawLine } from "../domain/financials.ts";
import type { Period } from "../util/tables.ts";

export interface ReportRow {
  label: string;
  /** Headings above this row, outermost first. */
  path: string[];
  /** One value per period column; undefined where blank. */
  values: (number | undefined)[];
}

export type ReportKind = "pnl" | "balance_sheet";

// Computed rows a report prints that are not accounts.
const PNL_COMPUTED = /^(total\b|gross profit|net (operating )?income|net other income|net ordinary income|net profit|net loss|operating income)/i;
const BS_COMPUTED = /^(total\b)/i;

/** One account with its amount in each single-month column the report carried. */
export interface MonthlyAccount {
  account: string;
  section?: string;
  amounts: Record<MonthKey, number>;
}

/** A dated balance-sheet column (month-end), with its lines. */
export interface DatedBalanceSheet {
  key: MonthKey;
  lines: RawLine[];
}

export interface ReportLines {
  lines: RawLine[];
  /** Fiscal years where the report covers all 12 months (P&L) or has a year-end date (BS). */
  fullYears: number[];
  partialYears: { year: number; months: number }[];
  /**
   * P&L only: the account × month detail when every period column is a
   * single month. Absent for annual or quarterly columns, which cannot be
   * split into months without inventing a spread.
   */
  monthly?: { months: MonthKey[]; accounts: MonthlyAccount[] };
  /** Balance sheet only: every dated column, ascending, year-ends included. */
  balanceSheets?: DatedBalanceSheet[];
  /**
   * P&L columns left out because they straddle two fiscal years (a calendar
   * year under a June year-end), described for the run's warnings.
   */
  misaligned: string[];
}

/** A multi-month P&L column that starts in one fiscal year and ends in the next cannot be split without inventing a spread. */
function straddlesFiscalYears(p: Period, fyEndMonth: number): boolean {
  if (p.months <= 1) return false;
  const start = parseMonthKey(addMonths(monthKey(p.endYear, p.endMonth), -(p.months - 1)));
  return fiscalYearOf(start.year, start.month, fyEndMonth) !== p.fiscalYear;
}

/**
 * Reduce report rows to per-fiscal-year lines, keeping the monthly detail
 * behind them. Monthly or quarterly P&L columns are summed into their
 * fiscal year; single-month columns are also kept as a monthly series. A
 * balance sheet keeps every dated column; the one at fiscal year end is
 * the annual line.
 */
export function reportToLines(
  rows: ReportRow[],
  columns: (Period | undefined)[],
  kind: ReportKind,
  fyEndMonth: number,
): ReportLines {
  const computed = kind === "pnl" ? PNL_COMPUTED : BS_COMPUTED;
  let periods = columns;
  const monthsByYear = new Map<number, number>();
  const bsColumnByYear = new Map<number, number>();
  const bsColumns: { key: MonthKey; col: number }[] = [];
  const misaligned: string[] = [];
  if (kind === "pnl") {
    periods = periods.map((p) => {
      if (!p || !straddlesFiscalYears(p, fyEndMonth)) return p;
      const start = addMonths(monthKey(p.endYear, p.endMonth), -(p.months - 1));
      misaligned.push(`${monthLabel(start)} to ${monthLabel(monthKey(p.endYear, p.endMonth))}`);
      return undefined;
    });
  }
  const valueColumns = periods.map((p, col) => ({ p, col })).filter((x) => x.p);
  const allSingleMonths = kind === "pnl" && valueColumns.length > 0 && valueColumns.every((x) => x.p!.months === 1);
  const monthColumns = allSingleMonths ? valueColumns.map((x) => ({ key: monthKey(x.p!.endYear, x.p!.endMonth), col: x.col })) : [];

  periods.forEach((p, col) => {
    if (!p) return;
    if (kind === "pnl") {
      monthsByYear.set(p.fiscalYear, (monthsByYear.get(p.fiscalYear) ?? 0) + p.months);
    } else {
      bsColumns.push({ key: monthKey(p.endYear, p.endMonth), col });
      if (p.endMonth === fyEndMonth) bsColumnByYear.set(p.fiscalYear, col);
    }
  });

  const lines: RawLine[] = [];
  const accounts: MonthlyAccount[] = [];
  const balanceSheets: DatedBalanceSheet[] = bsColumns.map((c) => ({ key: c.key, lines: [] }));
  for (const row of rows) {
    if (computed.test(row.label.trim())) continue;
    if (row.values.every((v) => v === undefined)) continue;
    const path = stripWrappers(row.path);
    const section = path[0];
    // Parent headings below the top section become part of the account name,
    // so "Payroll Expenses : Taxes" maps as payroll rather than other opex.
    const account = [...path.slice(1), row.label.trim()].join(" : ");

    if (kind === "pnl") {
      const byYear = new Map<number, number>();
      row.values.forEach((v, col) => {
        const p = periods[col];
        if (v === undefined || !p) return;
        byYear.set(p.fiscalYear, (byYear.get(p.fiscalYear) ?? 0) + v);
      });
      for (const [year, amount] of byYear) lines.push({ account, section, year, amount });
      if (allSingleMonths) {
        const amounts: Record<MonthKey, number> = {};
        for (const { key, col } of monthColumns) {
          const v = row.values[col];
          if (v !== undefined) amounts[key] = (amounts[key] ?? 0) + v;
        }
        accounts.push({ account, section, amounts });
      }
    } else {
      const bsSection = path.join(" > ");
      for (const [year, col] of bsColumnByYear) {
        const v = row.values[col];
        if (v !== undefined) lines.push({ account, section: bsSection, year, amount: v });
      }
      bsColumns.forEach(({ col }, i) => {
        const v = row.values[col];
        if (v !== undefined) balanceSheets[i]!.lines.push({ account, section: bsSection, year: periods[col]!.fiscalYear, amount: v });
      });
    }
  }

  if (kind === "pnl") {
    const fullYears = [...monthsByYear].filter(([, m]) => m >= 12).map(([y]) => y);
    const partialYears = [...monthsByYear]
      .filter(([, m]) => m < 12)
      .map(([year, months]) => ({ year, months }));
    const result: ReportLines = { lines, fullYears: fullYears.sort(), partialYears, misaligned };
    if (allSingleMonths) {
      const months = [...new Set(monthColumns.map((c) => c.key))].sort();
      result.monthly = { months, accounts };
    }
    return result;
  }
  const dated = balanceSheets.filter((b) => b.lines.length > 0).sort((a, b) => a.key.localeCompare(b.key));
  return { lines, fullYears: [...bsColumnByYear.keys()].sort(), partialYears: [], balanceSheets: dated, misaligned };
}

/**
 * Drop wrapper headings so path[0] is the section that decides the category:
 * "Ordinary Income/Expense > Income" becomes "Income", and
 * "LIABILITIES AND EQUITY > Liabilities" becomes "Liabilities".
 */
export function stripWrappers(path: string[]): string[] {
  const p = [...path];
  while (p.length > 1 && /^(ordinary income\/expense|other income\/expense|liabilities (and|&) (equity|capital))$/i.test(p[0]!.trim())) {
    p.shift();
  }
  return p;
}
