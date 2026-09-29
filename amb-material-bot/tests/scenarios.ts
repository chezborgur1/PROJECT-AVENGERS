// Variants of the fictional Ridgeline sample folder that exercise the period
// and balance-sheet cases the sample itself does not: an as-of month that
// does not close the fiscal year, a June year-end, a lower-middle-market
// deal, monthly and extra-dated balance sheets, and annual books with a pro
// forma row. Each builder copies the sample into a temporary folder, edits
// the exports the way a real client file would differ, and returns the
// request row that points at it.

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { RequestRow } from "../src/requests/schema.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");
export const MONTHLY_PNL = "QuickBooks Profit and Loss FY23-FY25 (monthly).csv";
export const ANNUAL_PNL = "QuickBooks Profit and Loss FY23-FY25.csv";
const BALANCE_SHEET = "QuickBooks Balance Sheet FY23-FY25.csv";
const BANK = "Bank transactions 2025 (checking).csv";

type Grid = string[][];
const read = (file: string): Grid => parse(fs.readFileSync(file, "utf8"), { relax_column_count: true, skip_empty_lines: false, bom: true }) as Grid;
const quote = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
const write = (file: string, g: Grid) => fs.writeFileSync(file, `${g.map((r) => r.map((c) => quote(c ?? "")).join(",")).join("\n")}\n`);

export interface Scenario {
  dir: string;
  row: RequestRow;
}

/** A copy of the sample folder (without the reviewed CIM copy, which names the sample's own figures). */
function copySample(): string {
  const dir = tmpDir("amb-scenario-");
  for (const f of fs.readdirSync(SAMPLE)) if (f !== "cim-copy.fixture.json") fs.copyFileSync(path.join(SAMPLE, f), path.join(dir, f));
  return dir;
}

function scenario(dir: string, fiscalYearEnd = "12-31"): Scenario {
  return { dir, row: { ...sampleRow(), source_folder: dir, fiscal_year_end: fiscalYearEnd } };
}

/** Keep the first `n` monthly columns of the monthly P&L export (the Total column goes with the rest). */
function truncateMonthly(dir: string, n: number): void {
  const file = path.join(dir, MONTHLY_PNL);
  write(file, read(file).map((r, i) => (i < 5 ? r : r.slice(0, 3 + n))));
}

function bsHeaderRow(g: Grid): number {
  return g.findIndex((r) => r.some((c) => /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(c)));
}

function dropBsColumn(dir: string, header: string): void {
  const file = path.join(dir, BALANCE_SHEET);
  const g = read(file);
  const col = g[bsHeaderRow(g)]!.indexOf(header);
  write(file, g.map((r) => r.filter((_, i) => i !== col)));
}

/**
 * Insert balance-sheet columns before `before`, each a blend of the columns
 * either side (`weight` 0 = the left one), rounded to the cent. A blend of two
 * balanced sheets balances, so the variants stay internally consistent.
 */
function insertBsColumns(dir: string, headers: string[], left: string, right: string, before: string, weight: (i: number) => number): void {
  const file = path.join(dir, BALANCE_SHEET);
  const g = read(file);
  const h = bsHeaderRow(g);
  const [l, rt, at] = [left, right, before].map((x) => g[h]!.indexOf(x)) as [number, number, number];
  const num = (s: string | undefined) => Number((s ?? "").replace(/,/g, ""));
  write(
    file,
    g.map((row, ri) => {
      if (ri < h) return row;
      const extra = headers.map((name, i) => {
        if (ri === h) return name;
        if (!row[l] || !Number.isFinite(num(row[l])) || !Number.isFinite(num(row[rt]))) return row[l] ?? "";
        return (num(row[l]) + (num(row[rt]) - num(row[l])) * weight(i)).toFixed(2);
      });
      return [...row.slice(0, at), ...extra, ...row.slice(at)];
    }),
  );
}

/**
 * The P&L runs Jan-23 to `months` later; FY2025 is a partial year, so YTD,
 * LTM and FY2025 are three windows. With `ytdAddbacks: false` the
 * adjustments file has no FY2025 column, as when the advisor has not yet
 * given YTD amounts.
 */
export function midYear(months = 31, opts: { ytdAddbacks?: boolean } = {}): Scenario {
  const dir = copySample();
  truncateMonthly(dir, months);
  fs.rmSync(path.join(dir, ANNUAL_PNL));
  dropBsColumn(dir, "Dec 31, 2025");
  if (opts.ytdAddbacks === false) {
    const file = path.join(dir, "adjustments.csv");
    const g = read(file);
    const col = g[0]!.indexOf("FY2025");
    write(file, g.filter((r) => r.length > 1).map((r) => r.filter((_, i) => i !== col)));
  }
  return scenario(dir);
}

/** The same exports under a June fiscal year-end: the Dec-25 as-of is mid-year and every balance sheet is dated mid-year. */
export function juneYearEnd(): Scenario {
  const dir = copySample();
  fs.rmSync(path.join(dir, ANNUAL_PNL));
  return scenario(dir, "06-30");
}

/** One accepted $700K normalization row lifts PF Adj. EBITDA over $1.0M: a lower-middle-market deal. */
export function lowerMiddleMarket(): Scenario {
  const dir = copySample();
  fs.appendFileSync(path.join(dir, "adjustments.csv"), 'N5,N,Family member salary above market rate,Personal / discretionary,Accepted,Documented,"Removes pay to a family member above the market rate for the role.",Payroll register,,700000,700000,700000\n');
  return scenario(dir);
}

/** Month-end balance sheets Jan-25 to Nov-25 between the year-ends: the trailing-twelve-month NWC peg. */
export function monthlyBalanceSheets(): Scenario {
  const dir = copySample();
  const months = ["Jan 31, 2025", "Feb 28, 2025", "Mar 31, 2025", "Apr 30, 2025", "May 31, 2025", "Jun 30, 2025", "Jul 31, 2025", "Aug 31, 2025", "Sep 30, 2025", "Oct 31, 2025", "Nov 30, 2025"];
  insertBsColumns(dir, months, "Dec 31, 2024", "Dec 31, 2025", "Dec 31, 2025", (i) => (i + 1) / 12);
  return scenario(dir);
}

/** The FY-3 comparative QuickBooks prints by default: a fourth statement date before the history. */
export function fourDateBalanceSheet(): Scenario {
  const dir = copySample();
  insertBsColumns(dir, ["Dec 31, 2022"], "Dec 31, 2023", "Dec 31, 2023", "Dec 31, 2023", () => 0);
  return scenario(dir);
}

/** Annual exports only (no monthly grid) and one accepted pro forma row. */
export function annualWithProForma(): Scenario {
  const dir = copySample();
  fs.rmSync(path.join(dir, MONTHLY_PNL));
  const file = path.join(dir, "adjustments.csv");
  const [header, ...lines] = fs.readFileSync(file, "utf8").trimEnd().split("\n");
  fs.writeFileSync(file, `${header},pnl_line\n${lines.map((l) => `${l},`).join("\n")}\nPF1,PF,New commercial maintenance contract,Run-rate,Accepted,Documented,"Adds a signed contract at its annual value.",Contract,,0,0,40000,Revenue\n`);
  return scenario(dir);
}

/** The bank transactions dated three years earlier, so every bank month falls before the P&L months and no proof of cash is possible. */
export function bankOutsideGrid(): Scenario {
  const dir = copySample();
  const file = path.join(dir, BANK);
  write(file, read(file).map((r, i) => (i === 0 || !r[0] ? r : [r[0].replace(/^2025-/, "2022-"), ...r.slice(1)])));
  return scenario(dir);
}

/** Keep `n` monthly columns of the monthly P&L export from column `from` (0 = Jan-23); the Total column goes with the rest. */
function sliceMonthly(dir: string, from: number, n: number): void {
  const file = path.join(dir, MONTHLY_PNL);
  write(file, read(file).map((r, i) => (i < 5 ? r : [...r.slice(0, 3), ...r.slice(3 + from, 3 + from + n)])));
}

function remove(dir: string, files: string[]): void {
  for (const f of files) fs.rmSync(path.join(dir, f), { force: true });
}

/**
 * QuickBooks monthly detail for FY2024-FY2025 only, beside the annual export
 * that also carries FY2023: the older year is read from the annual source
 * and every other column from the grid (QA round 3 F44).
 */
export function mixedOlderAnnual(): Scenario {
  const dir = copySample();
  sliceMonthly(dir, 12, 24);
  remove(dir, ["customers.csv", "payroll.csv"]);
  return scenario(dir);
}

/** A monthly export that stops at Jun-25 beside an annual export covering FY2025 in full: the stale grid gives way to the full years (F44). */
export function annualNewer(): Scenario {
  const dir = copySample();
  sliceMonthly(dir, 0, 30);
  remove(dir, ["customers.csv", "payroll.csv"]);
  return scenario(dir);
}

/** Exactly twelve months (Jan-25 to Dec-25), the shortest grid the merge accepts, with or without the customer list (F45). */
export function monthly12(opts: { customers: boolean }): Scenario {
  const dir = copySample();
  sliceMonthly(dir, 24, 12);
  remove(dir, [ANNUAL_PNL, ...(opts.customers ? [] : [BALANCE_SHEET, "customers.csv", "payroll.csv"])]);
  return scenario(dir);
}

/** Annual statements for the latest one or two fiscal years only, as a Main Street client with a short history supplies them (F46). */
export function annualYears(n: 1 | 2): Scenario {
  const dir = copySample();
  remove(dir, [MONTHLY_PNL, "customers.csv", "payroll.csv", "kpis.csv", "adjustments.csv", "addbacks.csv"]);
  const keep = n === 1 ? [2] : [1, 2];
  const file = path.join(dir, ANNUAL_PNL);
  write(file, read(file).map((r, i) => (i < 4 ? r : [...r.slice(0, 3), ...keep.map((c) => r[3 + c] ?? "")])));
  return scenario(dir);
}

/**
 * The monthly export with every income account zeroed in Jan-24 and Jan-25
 * (a business closed for a month), its totals restated to match (F47).
 */
export function zeroRevenueMonths(): Scenario {
  const dir = copySample();
  remove(dir, [ANNUAL_PNL, "adjustments.csv", "customers.csv", "payroll.csv"]);
  const file = path.join(dir, MONTHLY_PNL);
  const g = read(file);
  const num = (s: string | undefined) => Number((s ?? "").replace(/,/g, "")) || 0;
  const restated = ["Total Income", "Gross Profit", "Net Operating Income", "Net Income"];
  const total = g[5]!.length - 1;
  for (const month of [12, 24]) {
    const col = 3 + month;
    let removed = 0;
    let income = false;
    for (const r of g) {
      if (r[0] === "Income") income = true;
      else if (r[0] === "Total Income") income = false;
      else if (income && r[1]) {
        removed += num(r[col]);
        r[total] = (num(r[total]) - num(r[col])).toFixed(2);
        r[col] = "0.00";
      }
    }
    for (const r of g) {
      if (!restated.includes(r[0] ?? "")) continue;
      r[col] = (num(r[col]) - removed).toFixed(2);
      r[total] = (num(r[total]) - removed).toFixed(2);
    }
  }
  write(file, g);
  return scenario(dir);
}

/**
 * The sample carried six months past its year-end, to Jun-26: each row's
 * Jan-Jun 2026 is its Jan-Jun 2025 grown 5%, so every total row still adds
 * up. YTD Jun-26, LTM Jun-26 and FY2025 are three different windows, and the
 * prior-year LTM (Jul-24 to Jun-25) cuts through the [N2] settlement booked
 * in Jun and Jul 2024 (QA round 3 F25).
 */
export function throughJun26(): Scenario {
  const dir = copySample();
  remove(dir, [ANNUAL_PNL]);
  const file = path.join(dir, MONTHLY_PNL);
  const g = read(file);
  const header = 5;
  const total = g[header]!.length - 1;
  const num = (s: string | undefined) => Number((s ?? "").replace(/,/g, "")) || 0;
  const added = ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"];
  write(
    file,
    g.map((r, i) => {
      if (i === 2) return [r[0]!.replace("December 2025", "June 2026"), ...r.slice(1)];
      if (i < header) return r;
      if (i === header) return [...r.slice(0, total), ...added, ...r.slice(total)];
      if (!r[total]) return [...r.slice(0, total), ...added.map(() => ""), ...r.slice(total)];
      // Jan-Jun 2025 are months 25-30 of the export (columns 3 + 24 to 3 + 29).
      const values = added.map((_, k) => Math.round(num(r[3 + 24 + k]) * 1.05 * 100) / 100);
      const sum = values.reduce((s, v) => s + v, 0);
      return [...r.slice(0, total), ...values.map((v) => v.toFixed(2)), (num(r[total]) + sum).toFixed(2)];
    }),
  );
  return scenario(dir);
}

/** A row of a scenario's monthly P&L export by its label (column A or B), month by month from Jan-23. */
export function monthlyRow(dir: string, label: string): number[] {
  const g = read(path.join(dir, MONTHLY_PNL));
  const row = g.find((r) => r[0] === label || r[1] === label)!;
  const total = g[5]!.length - 1;
  return row.slice(3, total).map((c) => Number((c ?? "").replace(/,/g, "")) || 0);
}
