import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseQuickbooksExport } from "../src/ingest/quickbooksExport.ts";
import { qboPeriods, qboRowsToReport, type QboReport } from "../src/ingest/quickbooksApi.ts";
import { reportToLines } from "../src/ingest/reportTable.ts";
import { mergeSources } from "../src/ingest/merge.ts";
import { REPO } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");

describe("QuickBooks exports", () => {
  it("reads the P&L export into fiscal-year lines", async () => {
    const ex = await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv"), 12);
    expect(ex.fullYears).toEqual([2023, 2024, 2025]);
    const revenue2025 = ex.pnlLines.filter((l) => l.year === 2025 && l.section === "Income").reduce((s, l) => s + l.amount, 0);
    expect(revenue2025).toBe(3_040_800);
    // Sub-accounts carry their parent so "Taxes" is recognisably payroll.
    expect(ex.pnlLines.some((l) => l.account === "Payroll Expenses : Taxes")).toBe(true);
    // Computed rows (totals, gross profit, net income) are not accounts.
    expect(ex.pnlLines.some((l) => /^(total|gross profit|net income)/i.test(l.account))).toBe(false);
  });

  it("builds a balanced, correctly mapped dataset from the sample exports", async () => {
    const pnl = await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv"), 12);
    const bs = await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Balance Sheet FY23-FY25.csv"), 12);
    const ds = mergeSources({ extracts: [pnl, bs], overrides: new Map(), addbacks: [] });
    expect(ds.years).toEqual([2023, 2024, 2025]);
    expect(ds.pnl[2025]).toMatchObject({
      revenue: 3_040_800,
      cogs: 1_158_900,
      owner_comp: 200_000,
      depreciation_amortization: 72_400,
      interest_expense: 14_300,
      other_income: 3_100,
    });
    expect(ds.balanceSheet[2025]).toMatchObject({
      cash: 238_615,
      accounts_receivable: 248_600,
      fixed_assets_net: 357_500,
      other_assets: 12_000,
      debt: 279_400,
      equity: 501_915,
    });
    // Balanced as exported, so no equity plug warning.
    expect(ds.warnings.some((w) => /out of balance/.test(w))).toBe(false);
  });
});

describe("QuickBooks Online Reports API", () => {
  const report = JSON.parse(fs.readFileSync(path.join(REPO, "tests/fixtures/qbo-pnl-monthly.json"), "utf8")) as QboReport;

  it("dates columns from metadata and ignores the Total column", () => {
    const periods = qboPeriods(report, 6);
    expect(periods[0]).toBeUndefined();
    expect(periods.slice(1, 4).map((p) => p?.fiscalYear)).toEqual([2025, 2025, 2026]);
    expect(periods[4]).toBeUndefined();
  });

  it("flattens nested sections and aggregates months into a June fiscal year", () => {
    const result = reportToLines(qboRowsToReport(report), qboPeriods(report, 6), "pnl", 6);
    const fy25 = result.lines.filter((l) => l.year === 2025);
    expect(fy25.find((l) => l.account === "Crown & Bridge Sales")?.amount).toBe(220_000);
    expect(fy25.find((l) => l.account === "Payroll Expenses : Taxes")?.section).toBe("Expenses");
    expect(result.fullYears).toEqual([]);
    expect(result.partialYears).toEqual([
      { year: 2025, months: 2 },
      { year: 2026, months: 1 },
    ]);
  });
});
