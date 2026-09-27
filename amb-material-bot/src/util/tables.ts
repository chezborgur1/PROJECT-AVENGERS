import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

/** Read the first sheet of a .csv / .xlsx file as a grid of strings. */
export async function readTable(file: string): Promise<string[][]> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv" || ext === ".txt") {
    const text = fs.readFileSync(file, "utf8");
    return parse(text, { relax_column_count: true, skip_empty_lines: false, bom: true }) as string[][];
  }
  if (ext === ".xlsx" || ext === ".xlsm") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const grid: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = row.getCell(c).value;
        cells.push(cellText(v));
      }
      grid[rowNumber - 1] = cells;
    });
    return Array.from(grid, (r) => r ?? []);
  }
  throw new Error(`Unsupported table format: ${file}`);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "result" in v) return v.result === undefined ? "" : String(v.result);
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return String(v);
}

/** "$1,234.50" -> 1234.5, "(1,234)" -> -1234, "-" / "" -> undefined. */
export function parseAmount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (!s || s === "-" || s === "—") return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return negative ? -n : n;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface Period {
  /** Fiscal year the period ends in. */
  fiscalYear: number;
  /** Months covered by the column. */
  months: number;
  /** Calendar month (1-12) and year the period ends. */
  endMonth: number;
  endYear: number;
}

/**
 * Turn a report column title into a fiscal period.
 *   "Jan - Dec 2024", "Jan 1 - Dec 31, 2024", "2024", "FY2024", "Jan 2025",
 *   "Dec 31, 2024", "As of Dec 31, 2024", "Jul 2023 - Jun 2024"
 * Returns undefined for "Total", "% of Income" and anything unrecognised.
 */
export function parsePeriodLabel(label: string, fyEndMonth: number): Period | undefined {
  const text = label.toLowerCase().trim();
  if (!text || /total|%|change|variance/.test(text)) return undefined;

  // Not \b: "FY2024" has no word boundary between "Y" and "2".
  const years = [...text.matchAll(/(?<!\d)(19|20)\d{2}(?!\d)/g)].map((m) => Number(m[0]));
  if (years.length === 0) return undefined;
  const monthHits = [...text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/g)].map(
    (m) => MONTHS.indexOf(m[1]!) + 1,
  );

  const lastYear = years[years.length - 1]!;
  if (monthHits.length === 0) {
    // Bare "2024" / "FY2024": a full fiscal year.
    return { fiscalYear: lastYear, months: 12, endMonth: fyEndMonth, endYear: lastYear };
  }

  const endMonth = monthHits[monthHits.length - 1]!;
  const endYear = lastYear;
  let months = 1;
  if (monthHits.length >= 2) {
    const startMonth = monthHits[0]!;
    const startYear = years.length >= 2 ? years[0]! : startMonth <= endMonth ? endYear : endYear - 1;
    months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  } else if (/as of|^\w+ \d{1,2},? \d{4}$/.test(text)) {
    // A point in time (balance sheet date), not a one-month period.
    months = 0;
  }
  const fiscalYear = endMonth <= fyEndMonth ? endYear : endYear + 1;
  return { fiscalYear, months, endMonth, endYear };
}
