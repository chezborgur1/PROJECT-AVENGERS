import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

/**
 * The intake files (customers, payroll, KPIs, adjustments) as header-keyed
 * records from either a .csv or the first sheet of a workbook, so an advisor
 * can hand over whichever the client's system exported.
 */
export async function readRecords(file: string): Promise<Record<string, string>[]> {
  if (path.extname(file).toLowerCase() === ".csv") return readCsvRecords(file);
  const grid = await readTable(file);
  const headerIdx = grid.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx < 0) return [];
  const keys = grid[headerIdx]!.map(headerKey);
  return grid
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(keys.flatMap((k, i) => (k ? [[k, (r[i] ?? "").trim()]] : []))));
}

/**
 * Which record keys of an intake file hold amounts by month ("2025-07",
 * "Jul 2025") or by fiscal year ("2025", "FY2025", "Revenue 2025"), after
 * `headerKey`. Keys named in `exclude` (employer-cost columns on a payroll
 * file) are left alone. Values are "YYYY-MM" month keys and fiscal years.
 */
export function periodColumns(keys: string[], fyEndMonth: number, exclude: RegExp = /$^/): { months: Map<string, string>; years: Map<string, number> } {
  const months = new Map<string, string>();
  const years = new Map<string, number>();
  for (const key of keys) {
    if (exclude.test(key)) continue;
    const m = /^(?:[a-z]+_)?((?:19|20)\d{2})[-_](0[1-9]|1[0-2])$/.exec(key);
    if (m) {
      months.set(key, `${m[1]}-${m[2]}`);
      continue;
    }
    // A month name decides before a bare year does, so "jan_2025" is a month and "wages_2025" a year.
    const p = parsePeriodLabel(key.replace(/_/g, " "), fyEndMonth);
    if (p?.months === 1) months.set(key, `${p.endYear}-${String(p.endMonth).padStart(2, "0")}`);
    else if (/^(?:[a-z]+_?)?(?:19|20)\d{2}$/.test(key) || p?.months === 12) years.set(key, p!.fiscalYear);
  }
  return { months, years };
}

/** "Vehicle Loans" → "Vehicle loans"; acronyms and bracketed codes keep their case. */
export function sentenceCase(s: string): string {
  return s
    .split(" ")
    .map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w))
    .join(" ");
}

/** First non-blank value among the column aliases, trimmed. */
export function pickColumn(record: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return undefined;
}

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

/**
 * Read a CSV with a header row as records keyed by the lower-cased,
 * underscore-joined header ("Start Date" -> "start_date"), so the intake
 * files accept either spelling. Cells are trimmed; blank lines skipped.
 */
export function readCsvRecords(file: string): Record<string, string>[] {
  const rows = parse(fs.readFileSync(file, "utf8"), { columns: (h: string[]) => h.map(headerKey), skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[];
  return rows;
}

export function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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

/** "82%" -> 0.82, "0.82" -> 0.82, "" -> undefined. A bare number above 1 with a percent unit is read as a percentage. */
export function parsePercent(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const n = parseAmount(s.replace(/%$/, ""));
  if (n === undefined) return undefined;
  return s.endsWith("%") || n > 1 ? n / 100 : n;
}

/** Yes / true / 1 / x -> true; blank or anything else -> false. */
export function parseFlag(raw: string | undefined): boolean {
  return /^(y|yes|true|1|x)$/i.test((raw ?? "").trim());
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date as "YYYY-MM-DD" from the forms exports use: ISO, US "M/D/YYYY",
 * "Dec 31, 2025", "31 Dec 2025". A bare "YYYY-MM" or "Mon YYYY" is the
 * last day of that month. Returns undefined for blanks and anything else.
 */
export function parseDateString(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), 0);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (m) {
    const y = Number(m[3]);
    return iso(y < 100 ? 2000 + y : y, Number(m[1]), Number(m[2]));
  }
  const lower = t.toLowerCase();
  const monthHit = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/.exec(lower);
  const yearHit = /(?<!\d)((?:19|20)\d{2})(?!\d)/.exec(lower);
  if (monthHit && yearHit) {
    // Whatever 1-2 digit number is left once the month and year are gone is the day.
    const rest = lower.replace(yearHit[0], " ").replace(monthHit[0], " ");
    const dayHit = /(?<!\d)(\d{1,2})(?!\d)/.exec(rest);
    return iso(Number(yearHit[1]), MONTHS.indexOf(monthHit[1]!) + 1, dayHit ? Number(dayHit[1]) : 0);
  }
  return undefined;
}

/** Day 0 means the last day of the month. Invalid dates return undefined. */
function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12) return undefined;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = d === 0 ? last : d;
  if (day < 1 || day > last) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

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
