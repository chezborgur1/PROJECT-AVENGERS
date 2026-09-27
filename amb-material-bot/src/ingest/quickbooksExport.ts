// QuickBooks "Profit and Loss" and "Balance Sheet" reports exported to CSV
// or Excel (Online or Desktop). Annual, quarterly or monthly columns all work.
//
// Layout QuickBooks produces:
//   Company name / report title / date range     (a few title rows)
//   ,Jan - Dec 2023,Jan - Dec 2024,Total           (period header row)
//   Income                                         (section heading, no values)
//   ,Service Revenue,"812,400.00","901,250.00",... (account, indented)
//   Total Income,...                               (computed, skipped)

import { readTable, parseAmount, parsePeriodLabel, type Period } from "../util/tables.ts";
import { reportToLines, type ReportKind, type ReportRow } from "./reportTable.ts";
import type { SourceExtract } from "../domain/financials.ts";

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
      // Close the heading this total belongs to.
      const name = label.replace(/^total\s+/i, "").toLowerCase();
      const at = stack.findIndex((s) => s.label.toLowerCase() === name);
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

export async function parseQuickbooksExport(file: string, fyEndMonth: number): Promise<SourceExtract> {
  const grid = await readTable(file);
  const kind = detectReportKind(grid, file);
  if (!kind) throw new Error(`Could not tell whether ${file} is a P&L or a balance sheet`);
  const { rows, periods } = gridToReport(grid, kind, fyEndMonth);
  const result = reportToLines(rows, periods, kind, fyEndMonth);
  const notes = result.partialYears.map(
    (p) => `FY${p.year} covers ${p.months} months in ${file.split("/").pop()} and is excluded (full years only).`,
  );
  return {
    kind: "quickbooks_export",
    file,
    pnlLines: kind === "pnl" ? result.lines : [],
    bsLines: kind === "balance_sheet" ? result.lines : [],
    fullYears: result.fullYears,
    notes,
  };
}
