// Shared logic for accounting reports laid out as rows of accounts against
// period columns: QuickBooks exports (CSV/XLSX) and the QuickBooks Online
// Reports API both reduce to this shape.

import type { RawLine } from "../domain/financials.ts";
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

export interface ReportLines {
  lines: RawLine[];
  /** Fiscal years where the report covers all 12 months (P&L) or has a year-end date (BS). */
  fullYears: number[];
  partialYears: { year: number; months: number }[];
}

/**
 * Collapse report rows into per-fiscal-year lines. Monthly or quarterly
 * columns are summed into their fiscal year (P&L). For a balance sheet the
 * column dated at fiscal year end wins.
 */
export function reportToLines(
  rows: ReportRow[],
  periods: (Period | undefined)[],
  kind: ReportKind,
  fyEndMonth: number,
): ReportLines {
  const computed = kind === "pnl" ? PNL_COMPUTED : BS_COMPUTED;
  const monthsByYear = new Map<number, number>();
  const bsColumnByYear = new Map<number, number>();

  periods.forEach((p, col) => {
    if (!p) return;
    if (kind === "pnl") {
      monthsByYear.set(p.fiscalYear, (monthsByYear.get(p.fiscalYear) ?? 0) + p.months);
    } else if (p.endMonth === fyEndMonth) {
      bsColumnByYear.set(p.fiscalYear, col);
    }
  });

  const lines: RawLine[] = [];
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
    } else {
      for (const [year, col] of bsColumnByYear) {
        const v = row.values[col];
        if (v !== undefined) lines.push({ account, section: path.join(" > "), year, amount: v });
      }
    }
  }

  if (kind === "pnl") {
    const fullYears = [...monthsByYear].filter(([, m]) => m >= 12).map(([y]) => y);
    const partialYears = [...monthsByYear]
      .filter(([, m]) => m < 12)
      .map(([year, months]) => ({ year, months }));
    return { lines, fullYears: fullYears.sort(), partialYears };
  }
  return { lines, fullYears: [...bsColumnByYear.keys()].sort(), partialYears: [] };
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
