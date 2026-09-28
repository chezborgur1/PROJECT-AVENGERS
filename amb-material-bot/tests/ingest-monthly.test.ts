import path from "node:path";
import { describe, expect, it } from "vitest";
import { IS_CATEGORIES, fiscalYearOf, ltmWindow, monthRange, parseMonthKey, ytdWindow, type MonthKey } from "../src/domain/financials.ts";
import type { IngestExtract } from "../src/ingest/extract.ts";
import { mergeSources } from "../src/ingest/merge.ts";
import { parseQuickbooksExport } from "../src/ingest/quickbooksExport.ts";
import { reportToLines, type ReportRow } from "../src/ingest/reportTable.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");
const MONTHLY = path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25 (monthly).csv");
const ANNUAL = path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv");
const BS = path.join(SAMPLE, "QuickBooks Balance Sheet FY23-FY25.csv");

/** A P&L source with one column per month, the way a QuickBooks monthly export or the Reports API arrives. */
function monthlyExtract(months: MonthKey[], accounts: { account: string; section: string; amounts: number[] }[], fyEndMonth = 12, file = "monthly.csv"): IngestExtract {
  const periods = [
    undefined,
    ...months.map((k) => {
      const { year, month } = parseMonthKey(k);
      return { fiscalYear: fiscalYearOf(year, month, fyEndMonth), months: 1, endMonth: month, endYear: year };
    }),
  ];
  const rows: ReportRow[] = accounts.map((a) => ({ label: a.account, path: [a.section], values: [undefined, ...a.amounts] }));
  const result = reportToLines(rows, periods, "pnl", fyEndMonth);
  return { kind: "quickbooks_export", file, pnlLines: result.lines, bsLines: [], fullYears: result.fullYears, partialYears: result.partialYears, monthly: result.monthly, notes: [] };
}

const flat = (months: MonthKey[], v: number) => months.map(() => v);

describe("monthly QuickBooks export", () => {
  it("keeps the 36 monthly columns as a monthly series behind the fiscal-year lines", async () => {
    const ex = await parseQuickbooksExport(MONTHLY, 12);
    expect(ex.fullYears).toEqual([2023, 2024, 2025]);
    expect(ex.partialYears).toEqual([]);
    expect(ex.booksBasis).toBe("accrual");
    expect(ex.monthly!.months).toHaveLength(36);
    expect(ex.monthly!.months[0]).toBe("2023-01");
    expect(ex.monthly!.months[35]).toBe("2025-12");
    const taxes = ex.monthly!.accounts.find((a) => a.account === "Payroll Expenses : Taxes")!;
    expect(taxes.section).toBe("Expenses");
    expect(Object.keys(taxes.amounts)).toHaveLength(36);
    // The monthly columns sum to the annual export to the dollar.
    const annual = await parseQuickbooksExport(ANNUAL, 12);
    for (const l of annual.pnlLines) {
      const monthly = ex.pnlLines.find((m) => m.account === l.account && m.year === l.year);
      expect(monthly?.amount, `${l.account} FY${l.year}`).toBe(l.amount);
    }
  });

  it("builds the category grid, derives the annual map from it and reconciles the annual export to zero", async () => {
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(ANNUAL, 12), await parseQuickbooksExport(MONTHLY, 12), await parseQuickbooksExport(BS, 12)], overrides: new Map(), addbacks: [] });
    const fx = ridgelineDataset();
    expect(ds.sourceGranularity).toBe("monthly");
    expect(ds.asOfMonth).toBe("2025-12");
    expect(ds.monthly!.months.map((m) => m.key)).toEqual(fx.monthly!.months.map((m) => m.key));
    expect(ds.monthly!.fullFiscalYears).toEqual([2023, 2024, 2025]);
    expect(ds.monthly!.lastMonthClosesFiscalYear).toBe(true);
    for (const m of fx.monthly!.months) expect(ds.monthly!.values[m.key], m.key).toEqual(fx.monthly!.values[m.key]);
    for (const y of [2023, 2024, 2025]) {
      const fromMonths = Object.fromEntries(IS_CATEGORIES.map((c) => [c, ds.monthly!.months.filter((m) => m.fiscalYear === y).reduce((s, m) => s + ds.monthly!.values[m.key]![c], 0)]));
      expect(ds.pnl[y]).toEqual(fromMonths);
    }
    // Both P&L files are QuickBooks exports; the one with months wins and the other reconciles line by line.
    expect(ds.provenance.map((p) => p.pnl)).toEqual(["quickbooks_export", "quickbooks_export", "quickbooks_export"]);
    expect(ds.reconciliations).toHaveLength(12);
    expect(ds.reconciliations!.every((r) => r.difference === 0 && !r.material)).toBe(true);
    expect(ds.reconciliations![0]).toMatchObject({ fiscalYear: 2023, line: "revenue", chosen: { file: "QuickBooks Profit and Loss FY23-FY25 (monthly).csv" }, other: { file: "QuickBooks Profit and Loss FY23-FY25.csv" } });
    expect(ds.booksBasis).toBe("accrual");
  });

  it("carries a partial current year as a YTD window instead of dropping it", () => {
    const months = monthRange("2023-01", "2025-07");
    const ex = monthlyExtract(months, [
      { account: "Sales", section: "Income", amounts: flat(months, 100) },
      { account: "Rent", section: "Expenses", amounts: flat(months, 10) },
    ]);
    expect(ex.notes ?? []).toEqual([]);
    const ds = mergeSources({ extracts: [ex], overrides: new Map(), addbacks: [] });
    expect(ds.years).toEqual([2023, 2024]);
    expect(ds.pnl[2025]).toBeUndefined();
    expect(ds.asOfMonth).toBe("2025-07");
    expect(ds.monthly!.months).toHaveLength(31);
    expect(ds.monthly!.fullFiscalYears).toEqual([2023, 2024]);
    expect(ds.monthly!.lastMonthClosesFiscalYear).toBe(false);
    expect(ytdWindow(ds.monthly!, "2025-07", 12)).toEqual(monthRange("2025-01", "2025-07"));
    expect(ltmWindow(ds.monthly!, "2025-07")).toEqual(monthRange("2024-08", "2025-07"));
    // The mode rule runs on the latest full window, LTM Jul-25.
    expect(ds.mode).toMatchObject({ measureLabel: "PF Jul-25", mode: "mainStreet" });
  });

  it("starts the grid at the first month of FY-2 and leaves earlier months out (guide Q34)", () => {
    const months = monthRange("2022-07", "2025-12");
    const ds = mergeSources({ extracts: [monthlyExtract(months, [{ account: "Sales", section: "Income", amounts: flat(months, 100) }])], overrides: new Map(), addbacks: [] });
    expect(ds.years).toEqual([2023, 2024, 2025]);
    expect(ds.monthly!.months[0]!.key).toBe("2023-01");
    expect(ds.monthly!.months).toHaveLength(36);
  });

  it("assigns fiscal months for a June year-end", () => {
    const months = monthRange("2024-07", "2026-06");
    const ds = mergeSources({ extracts: [monthlyExtract(months, [{ account: "Sales", section: "Income", amounts: flat(months, 100) }], 6)], overrides: new Map(), addbacks: [], fyEndMonth: 6 });
    expect(ds.years).toEqual([2025, 2026]);
    expect(ds.monthly!.months[0]).toMatchObject({ key: "2024-07", fiscalYear: 2025, fiscalMonth: 1 });
    expect(ds.monthly!.lastMonthClosesFiscalYear).toBe(true);
    expect(ds.balanceSheets).toBeUndefined();
  });

  it("falls back to full fiscal years only when fewer than 12 months are usable", async () => {
    const months = monthRange("2025-01", "2025-08");
    const stub = monthlyExtract(months, [{ account: "Sales", section: "Income", amounts: flat(months, 100) }], 12, "ytd.csv");
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(ANNUAL, 12), stub], overrides: new Map(), addbacks: [] });
    expect(ds.years).toEqual([2023, 2024, 2025]);
    expect(ds.sourceGranularity).toBe("annual");
    expect(ds.monthly).toBeUndefined();
    expect(ds.asOfMonth).toBeUndefined();
    expect(ds.warnings.some((w) => /ytd\.csv has 8 usable months/.test(w))).toBe(true);
    // Annual mode still builds the schedule and decides the mode on the latest fiscal year.
    expect(ds.mode).toMatchObject({ measureLabel: "FY2025", mode: "mainStreet" });
  });

  it("drops months that are not contiguous with the run ending at the last month", () => {
    const months = [...monthRange("2023-01", "2023-06"), ...monthRange("2024-01", "2025-12")];
    const ds = mergeSources({ extracts: [monthlyExtract(months, [{ account: "Sales", section: "Income", amounts: flat(months, 100) }])], overrides: new Map(), addbacks: [] });
    expect(ds.monthly!.months[0]!.key).toBe("2024-01");
    expect(ds.warnings.some((w) => /not contiguous/.test(w))).toBe(true);
  });
});
