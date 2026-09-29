// QA round 1 engine and ingest fixes that the Ridgeline sample cannot show:
// each case is built small, from the function that had the defect, so the
// rule it now keeps is stated where it is tested.

import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext } from "../src/cim/context.ts";
import { draftCimCopy } from "../src/cim/narrative.ts";
import { bsDetailLine } from "../src/domain/chartOfAccounts.ts";
import type { BalanceSheetPeriod, CustomerRecord, PayrollRecord } from "../src/domain/financials.ts";
import type { ScheduleRow } from "../src/ingest/adjustments.ts";
import { mergeSources } from "../src/ingest/merge.ts";
import { parseQuickbooksExport } from "../src/ingest/quickbooksExport.ts";
import { reportToLines } from "../src/ingest/reportTable.ts";
import { customerAnalytics, dollarRollForward, headcountAnalytics } from "../src/model/analytics.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { nwcLines } from "../src/model/nwc.ts";
import type { PeriodColumn } from "../src/model/types.ts";
import { cagr, growth } from "../src/util/format.ts";
import { parsePeriodLabel } from "../src/util/tables.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow } from "./helpers.ts";

const customer = (id: string, startDate: string | undefined, revenueByFiscalYear: Record<number, number>, endDate?: string): CustomerRecord => ({ id, startDate, endDate, revenueByFiscalYear });

describe("customer cohorts and retention (F5, F54, F59)", () => {
  it("gives customers who started before the cohort window one Pre- row, so the triangle covers every dated customer (F5)", () => {
    const ds = ridgelineDataset();
    const cohorts = runModel(ds, defaultAssumptions(ds, sampleRow())).customers!.cohorts!;
    const pre = cohorts.countTriangle[0]!;
    expect(pre).toMatchObject({ pre: true, label: "Pre-FY2021" });
    expect(pre.size).toBeGreaterThan(0);
    const dated = ds.customers!.customers.filter((c) => c.startDate).length;
    expect(cohorts.countTriangle.reduce((s, c) => s + c.size, 0)).toBe(dated);
  });

  it("keys cohorts by the fiscal year of the start date under a June year-end, so first-year retention is whole (F59)", () => {
    // Sep-2023 falls in FY2024 under a June year-end; keyed by calendar year it would sit in 2023 and read as lost at Jun-23.
    const customers = [
      customer("C-001", "2019-01-10", { 2023: 50, 2024: 50, 2025: 50 }),
      customer("C-002", "2020-08-01", { 2023: 40, 2024: 40, 2025: 40 }),
      customer("C-003", "2021-09-15", { 2023: 30, 2024: 30, 2025: 30 }),
      customer("C-004", "2022-09-15", { 2023: 20, 2024: 20, 2025: 20 }),
      customer("C-005", "2023-09-15", { 2024: 10, 2025: 10 }),
    ];
    const ltm = { key: "FY2025", label: "FY2025", start: "2024-07", end: "2025-06", months: 12, fiscalYear: 2025, priorYear: false, projected: false } as unknown as PeriodColumn;
    const out = customerAnalytics({
      list: { customers, term: "Customer", asOfMonth: "2025-06", totalsByFiscalYear: { 2023: 140, 2024: 150, 2025: 150 }, source: "test", file: "test.csv" },
      period: ltm,
      fye: 6,
      asOfDate: "2025-06-30",
      asOfMonth: "2025-06",
      years: [2023, 2024, 2025],
      pnlRevenueByFy: { 2023: 140, 2024: 150, 2025: 150 },
    });
    const rows = out.cohorts!.countTriangle;
    expect(rows.map((r) => r.label)).toEqual(["Pre-FY2021", "FY2021", "FY2022", "FY2023", "FY2024"]);
    const fy2024 = rows.find((r) => r.label === "FY2024")!;
    expect(fy2024).toMatchObject({ size: 1, retainedByYear: [1, 1] });
  });

  it("classifies an undated customer by its revenue: nil last year is new, nil this year is lost (F54)", () => {
    const r = dollarRollForward([customer("C-001", undefined, { 2024: 0, 2025: 100 }), customer("C-002", undefined, { 2024: 50, 2025: 0 }), customer("C-003", undefined, { 2024: 80, 2025: 100 })], 2025, 12)!;
    expect(r).toMatchObject({ startingRevenue: 130, churn: 50, downsell: 0, upsell: 20, newRevenue: 100, endingRevenue: 200 });
  });
});

describe("department average compensation (F65)", () => {
  it("divides the year's pay, leavers included, by the year's average FTE, not the year-end count", () => {
    const person = (id: string, wages: number, terminationDate?: string): PayrollRecord => ({ id, role: "Office", department: "Office", isOwner: false, isManagement: false, hireDate: "2020-01-01", terminationDate, payBasis: "salary", fte: 1, wagesByFiscalYear: { 2025: wages }, employerCostsByFiscalYear: { 2025: 0 } });
    const hc = headcountAnalytics({
      register: { employees: [person("E-01", 50_000), person("E-02", 25_000, "2025-07-02")], asOfMonth: "2025-12", totalsByFiscalYear: { 2025: 75_000 }, source: "test", file: "test.csv" },
      asOfDate: "2025-12-31",
      years: [2025],
      fye: 12,
      window: { revenue: 1_000_000, payroll: 75_000 },
      fiscalYear: { year: 2025, revenue: 1_000_000, payroll: 75_000 },
    });
    const office = hc.byDepartment.find((d) => d.department === "Office")!;
    expect(office.count).toBe(1);
    expect(office.totalComp).toBe(75_000);
    // One full year plus half a year on payroll: 1.5 FTE-years, so $50,000 each; the year-end count of 1 would give $75,000.
    expect(office.avgFte).toBeCloseTo(1.5, 2);
    expect(office.avgComp).toBeCloseTo(50_000, -2);
  });
});

describe("balance sheet detail (F53)", () => {
  it("reads a shareholder receivable as a related-party receivable that lowers adjusted working capital", () => {
    expect(bsDetailLine("Due from Shareholder", "Current Assets", "other_current_assets")).toBe("related_party_receivable");
    expect(bsDetailLine("Due to Shareholder", "Current Liabilities", "other_current_liabilities")).toBe("related_party_balances");
    const sheet = {
      values: { cash: 0, accounts_receivable: 100_000, inventory: 0, other_current_assets: 30_000, fixed_assets: 0, other_assets: 0, accounts_payable: 40_000, other_current_liabilities: 0, debt: 0, equity: 90_000 },
      detail: { related_party_receivable: 10_000 },
    } as unknown as BalanceSheetPeriod;
    const { lines } = nwcLines(sheet, undefined);
    expect(lines.reportedNwc).toBe(90_000);
    expect(lines.adjustments).toBe(-10_000);
    expect(lines.adjustedNwc).toBe(80_000);
  });
});

describe("report columns under a non-December year-end (F55)", () => {
  it("leaves out a calendar-year column that straddles two June fiscal years, and says so", () => {
    const columns = [parsePeriodLabel("Jan - Dec 2024", 6), parsePeriodLabel("Jul 2024 - Jun 2025", 6)];
    const out = reportToLines([{ label: "Service Revenue", path: ["Income"], values: [1_000, 1_200] }], columns, "pnl", 6);
    expect(out.misaligned).toEqual(["Jan-24 to Dec-24"]);
    expect(out.lines.map((l) => [l.year, l.amount])).toEqual([[2025, 1_200]]);
  });
});

describe("an advisor's [S2] row (F57)", () => {
  it("sets the replacement salary input, so the engine's recomputed [S2] carries the advisor's amount", async () => {
    const annual = path.join(REPO, "samples/project-ridgeline/QuickBooks Profit and Loss FY23-FY25.csv");
    const s2: ScheduleRow = { tier: "owner_compensation", description: "Market replacement compensation", category: "replacement_cost", status: "accepted", evidence: "documented", byFiscalYear: { 2023: -138_000, 2024: -138_000, 2025: -138_000 }, origin: "advisor", sourceFile: "adjustments.csv" };
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(annual, 12)], overrides: new Map(), addbacks: [], adjustmentRows: [s2], request: { replacementSalary: 95_000, passThrough: true } });
    expect(ds.recastInputs!.replacementSalary).toBeCloseTo(138_000 / 1.15, 2);
    const model = runModel(ds, defaultAssumptions(ds, sampleRow()));
    expect(model.periods.FY2025!.ladder.marketReplacement).toBeCloseTo(-138_000, 2);
  });
});

describe("growth figures in the brief (F61, F62)", () => {
  it("quotes no growth rate from a loss, and says the measure turned positive instead of 'declined' (F62)", () => {
    expect(growth(-50_000, 100_000)).toBeNaN();
    expect(cagr(-50_000, 100_000, 2)).toBeNaN();
    const ds = ridgelineDataset();
    const row = sampleRow();
    const out = runModel(ds, defaultAssumptions(ds, row));
    out.periods.FY2024!.ladder.adjEbitda = -50_000;
    const firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };
    const ctx = buildContext({ row, ds, out, copy: { open_questions: [] }, firm, date: new Date("2026-09-28T12:00:00Z") });
    expect(ctx.brief.has("adjEbitda.yoy")).toBe(false);
    expect(ctx.brief.t("adjEbitda.turn")).toBe("turned positive in FY2025");
  });

  it("with two fiscal years, the templated executive summary quotes the year's growth, not an open question for a CAGR (F61)", async () => {
    const ds = ridgelineDataset();
    const row = { ...sampleRow(), business_name: "Two Years LLC", source_folder: "deals/none" };
    const out = runModel(ds, defaultAssumptions(ds, row));
    out.columns = out.columns.filter((c) => c.key !== "FY2023");
    const firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };
    const date = new Date("2026-09-28T12:00:00Z");
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { copy } = await draftCimCopy({ row, notes: "", dataset: ds, model: out, firm, date });
      const ctx = buildContext({ row, ds, out, copy, firm, date });
      expect(ctx.brief.has("rev.cagr")).toBe(false);
      const quick = JSON.stringify(copy.s1_1);
      expect(quick).toContain("{{rev.yoy}}");
      expect(quick).not.toContain("rev.cagr");
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
