// QuickBooks "Profit and Loss" and "Balance Sheet" reports exported to CSV
// or Excel (Online or Desktop). Annual, quarterly or monthly columns all
// work; monthly columns are kept month by month so the model can build
// YTD, LTM and the monthly grid.
//
// Layout QuickBooks produces:
//   Company name / report title / date range     (a few title rows)
//   ,Jan - Dec 2023,Jan - Dec 2024,Total           (period header row)
//   Income                                         (section heading, no values)
//   ,Service Revenue,"812,400.00","901,250.00",... (account, indented)
//   Total Income,...                               (computed, kept apart as a total)

import { fiscalYearOf, monthLabel, monthKey, parseMonthKey, type BooksBasis, type ExportTotal } from "../domain/financials.ts";
import { readTable, parseAmount, parsePeriodLabel, type Period } from "../util/tables.ts";
import { reportToLines, type ReportKind, type ReportRow, type ReportTotal } from "./reportTable.ts";
import type { IngestExtract } from "./extract.ts";

const TOP_SECTIONS_PNL = /^(ordinary income\/expense|income|revenue|sales|cost of (goods sold|sales)|cogs|expenses?|operating expenses|other income|other expenses?|other income\/expense)$/i;
const TOP_SECTIONS_BS = /^(assets|liabilities and equity|liabilities & equity|liabilities|equity)$/i;

export function detectReportKind(grid: string[][], fileName: string): ReportKind | undefined {
  const head = grid
    .slice(0, 8)
    .map((r) => r.join(" "))
    .join(" ")
    .toLowerCase();
  const name = fileName.toLowerCase();
  if (/balance sheet|statement of financial position/.test(head) || /balance[-_ ]?sheet/.test(name)) {
    return "balance_sheet";
  }
  if (/profit (and|&) loss|income statement|statement of operations/.test(head) || /p&l|pnl|profit|income[-_ ]?statement/.test(name)) {
    return "pnl";
  }
  return undefined;
}

/** QuickBooks prints "Accrual Basis" or "Cash Basis" under the report title. */
export function detectReportBasis(grid: string[][]): BooksBasis | undefined {
  const head = grid.slice(0, 8).map((r) => r.join(" ")).join(" ").toLowerCase();
  if (/accrual basis/.test(head)) return "accrual";
  if (/cash basis/.test(head)) return "cash";
  return undefined;
}

export function gridToReport(
  grid: string[][],
  kind: ReportKind,
  fyEndMonth: number,
): { rows: ReportRow[]; periods: (Period | undefined)[] } {
  // The header row is the first row with at least one recognisable period.
  let headerIdx = -1;
  let periods: (Period | undefined)[] = [];
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const row = grid[i] ?? [];
    // Column 0 holds labels and report titles ("As of Dec 31, 2025"), never periods.
    const parsed = row.map((cell, c) => (c === 0 ? undefined : parsePeriodLabel(cell, fyEndMonth)));
    if (parsed.some(Boolean)) {
      headerIdx = i;
      periods = parsed;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("No period header row found (expected columns like 'Jan - Dec 2024')");

  const firstValueCol = periods.findIndex(Boolean);
  const topSections = kind === "pnl" ? TOP_SECTIONS_PNL : TOP_SECTIONS_BS;
  const rows: ReportRow[] = [];
  // Heading stack keyed by indent depth.
  const stack: { depth: number; label: string }[] = [];

  for (const row of grid.slice(headerIdx + 1)) {
    const labelCells = row.slice(0, firstValueCol);
    const labelCol = labelCells.findIndex((c) => c.trim() !== "");
    if (labelCol < 0) continue;
    const rawLabel = labelCells[labelCol]!;
    const label = rawLabel.trim();
    // Indent = leading empty columns, plus leading spaces for single-column exports.
    const depth = labelCol * 10 + (rawLabel.length - rawLabel.trimStart().length);
    const values = periods.map((p, c) => (p ? parseAmount(row[c]) : undefined));
    const hasValues = values.some((v) => v !== undefined);

    if (/^total\b/i.test(label)) {
      // Close the heading this total belongs to; the total itself is kept, with the headings it closes, to prove the accounts against (C01).
      const name = label.replace(/^total\s+/i, "").toLowerCase();
      const at = stack.findIndex((s) => s.label.toLowerCase() === name);
      if (hasValues) rows.push({ label, path: stack.slice(0, at >= 0 ? at + 1 : stack.length).map((s) => s.label), values, total: true });
      if (at >= 0) stack.splice(at);
      continue;
    }

    if (!hasValues) {
      // A heading. Top-level sections reset the stack; others nest by indent.
      if (topSections.test(label)) {
        // Keep only a "Liabilities and Equity" wrapper above a new section.
        const keep = stack.filter((s) => /^liabilities (and|&) equity$/i.test(s.label) && label !== s.label);
        stack.length = 0;
        if (kind === "balance_sheet") stack.push(...keep);
      } else {
        popTo(stack, depth, topSections);
      }
      stack.push({ depth, label });
      continue;
    }

    popTo(stack, depth, topSections);
    const pathLabels = stack.map((s) => s.label);
    rows.push({ label, path: pathLabels, values });
  }
  return { rows, periods };
}

/**
 * Pop headings at or deeper than `depth`, but never the top section: flat
 * exports print every heading at the same indent, and "Payroll Expenses"
 * must still sit inside "Expenses".
 */
function popTo(stack: { depth: number; label: string }[], depth: number, topSections: RegExp): void {
  while (stack.length && stack[stack.length - 1]!.depth >= depth) {
    const top = stack[stack.length - 1]!;
    const isSection = topSections.test(top.label) || /^liabilities (and|&) equity$/i.test(top.label);
    if (isSection) break;
    stack.pop();
  }
}

/**
 * How a partial fiscal year is carried. With months, the year holding the
 * last month becomes the YTD window; a partial year before the first full
 * one is left out, since the grid starts at a full fiscal year. Without
 * months a partial year is left out.
 */
export function partialYearNote(p: { year: number; months: number }, file: string, monthly: boolean, lastMonth?: string, fyEndMonth = 12): string {
  const name = file.split("/").pop();
  if (!monthly || !lastMonth) return `FY${p.year} covers ${p.months} months in ${name} and is excluded (full years only; a monthly export would give a YTD column).`;
  const { year, month } = parseMonthKey(lastMonth);
  return fiscalYearOf(year, month, fyEndMonth) === p.year
    ? `FY${p.year} covers ${p.months} months in ${name}; carried as YTD ${monthLabel(lastMonth)}, not as a full year.`
    : `FY${p.year} covers ${p.months} months in ${name}, before the first full fiscal year; those months are left out of the model.`;
}

export async function parseQuickbooksExport(file: string, fyEndMonth: number): Promise<IngestExtract> {
  const grid = await readTable(file);
  const kind = detectReportKind(grid, file);
  if (!kind) throw new Error(`Could not tell whether ${file} is a P&L or a balance sheet`);
  const { rows, periods } = gridToReport(grid, kind, fyEndMonth);
  const result = reportToLines(rows, periods, kind, fyEndMonth);
  const lastMonth = result.monthly?.months[result.monthly.months.length - 1];
  const notes = [...result.partialYears.map((p) => partialYearNote(p, file, Boolean(result.monthly), lastMonth, fyEndMonth)), ...misalignedNotes(result.misaligned, file, fyEndMonth)];
  const out: IngestExtract = {
    kind: "quickbooks_export",
    file,
    pnlLines: kind === "pnl" ? result.lines : [],
    bsLines: kind === "balance_sheet" ? result.lines : [],
    fullYears: result.fullYears,
    partialYears: result.partialYears,
    notes,
  };
  if (result.monthly) out.monthly = result.monthly;
  if (result.balanceSheets) out.balanceSheets = result.balanceSheets;
  if (result.totals.length) out.exportTotals = exportTotalsOf(result.totals, kind, file);
  const basis = detectReportBasis(grid);
  if (basis) out.booksBasis = basis;
  return out;
}

/** A report's subtotal lines in the dataset's shape. */
export function exportTotalsOf(totals: ReportTotal[], kind: ReportKind, file: string): ExportTotal[] {
  return totals.map((t) => ({ statement: kind, label: t.label, path: t.path, file, byFiscalYear: t.byYear, ...(t.byMonth ? { byMonth: t.byMonth } : {}) }));
}

/** Warnings for P&L columns that do not match the fiscal year (a calendar-year export under a June year-end). */
export function misalignedNotes(misaligned: string[], file: string, fyEndMonth: number): string[] {
  const month = new Date(Date.UTC(2000, fyEndMonth - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const name = file.split("/").pop();
  return misaligned.map((span) => `${name}: the column for ${span} does not match the fiscal year ending in ${month}, so it is left out. Check fiscal_year_end on the request row, or export the P&L by fiscal year.`);
}

/** The month key of a period column, for callers that need to name it. */
export function periodMonthKey(p: Period): string {
  return monthKey(p.endYear, p.endMonth);
}
