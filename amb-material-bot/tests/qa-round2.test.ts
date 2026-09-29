// QA round 2 fixes that the Ridgeline sample cannot show on its own: each
// case is built small, from the function that had the defect, so the rule it
// now keeps is stated where it is tested. The period shapes that crashed the
// deck run end to end in tests/period-shapes.test.ts.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext, standardNote } from "../src/cim/context.ts";
import { lintCopy } from "../src/cim/copy.ts";
import { notesLineCount } from "../src/cim/design.ts";
import { labelConflicts, mixedUnits, planDeck, type PlannedPage } from "../src/cim/planner.ts";
import { fitNotes } from "../src/cim/sections/common.ts";
import type { CustomerRecord } from "../src/domain/financials.ts";
import { partialYearNote } from "../src/ingest/quickbooksExport.ts";
import { countRollForward, customerAnalytics, customerActiveAt } from "../src/model/analytics.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { costStructure } from "../src/cim/exhibits.ts";
import { formationOf, formationText } from "../src/model/exportTotals.ts";
import { runModel } from "../src/model/engine.ts";
import { planWorkbook } from "../src/model/workbook.ts";
import type { PeriodColumn } from "../src/model/types.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow } from "./helpers.ts";

const row = sampleRow();
const model = () => {
  const ds = ridgelineDataset();
  return { ds, out: runModel(ds, defaultAssumptions(ds, row)) };
};

describe("deal structure (F1, F8, F57)", () => {
  it("keeps the reconciliation holdback inside the price: the buyer raises only the cash the closing pays out (F1)", () => {
    const { out } = model();
    const d = out.deal![0]!;
    const { uses, sources } = d.sourcesAndUses;
    const p = d.proceeds;
    expect(uses.reconciliationHoldback).toBeGreaterThan(0);
    expect(uses.total).toBeCloseTo(uses.purchasePrice + uses.transactionFees + uses.workingCapitalFunding, 6);
    // Cash in at close (senior loan and buyer equity) equals cash out: seller, liens, holdback and indemnity escrows, expenses and buyer fees.
    const cashOut = p.closingCash + p.debtPaidAtClose + p.debtLikeItems - p.nwcVsPeg + p.reconciliationHoldback + p.indemnityEscrow + p.transactionExpenses + uses.transactionFees;
    expect(sources.seniorLoan + sources.buyerEquity).toBeCloseTo(cashOut, 6);
    expect(p.reconciliationHoldback).toBe(uses.reconciliationHoldback);
  });

  it("shows the cash the Seller keeps beside the working capital it keeps, each for what it is (F8)", () => {
    const { ds, out } = model();
    const p = out.deal![0]!.proceeds;
    const latest = ds.balanceSheets!.at(-1)!;
    expect(p.sellerRetainedCash).toBe(latest.values.cash);
    expect(p.sellerRetainedCash).toBeGreaterThan(200_000);
    expect(p.sellerRetainedNwc).toBe(out.nwc!.sellerRetainedNwc);
  });

  it("reads bridge cash from the same dated balance sheet as the debt, and names it (F57)", () => {
    const ds = ridgelineDataset();
    // Drop the Dec-25 sheet: the LTM ends at Dec-25, the latest sheet is Dec-24.
    ds.balanceSheets = ds.balanceSheets!.filter((b) => b.period.key !== "2025-12");
    const a = defaultAssumptions(ds, row);
    a.recast.dealForm = "equity_purchase";
    const out = runModel(ds, a);
    const sheet = ds.balanceSheets.at(-1)!;
    expect(out.valuation.bridge.asOf).toBe(sheet.period.key);
    expect(out.valuation.bridge.cash).toBe(sheet.values.cash);
    expect(out.valuation.bridge.cash).toBeGreaterThan(0);
  });
});

describe("customer active-at, one definition (F48)", () => {
  const c = (id: string, startDate: string, endDate?: string): CustomerRecord => ({ id, startDate, endDate, revenueByFiscalYear: { 2023: 10, 2024: 10 } });
  const customers = [c("C-001", "2015-12-01", "2024-02-29"), c("C-002", "2018-03-01"), c("C-003", "2020-06-15"), c("C-004", "2019-01-10", "2024-01-31")];
  const ltm = { key: "LTM2024-02", label: "LTM Feb-24", start: "2023-03", end: "2024-02", months: 12, priorYear: false, projected: false, ref: { kind: "ltm", end: "2024-02" }, group: "LTM" } as unknown as PeriodColumn;

  it("treats a customer whose end date is the as-of day as lost that day, in every count", () => {
    expect(customerActiveAt(customers[0]!, "2024-02-29", 12)).toBe(false);
    expect(customerActiveAt(customers[0]!, "2024-02-28", 12)).toBe(true);
    const out = customerAnalytics({
      list: { customers, term: "Customer", asOfMonth: "2024-02", totalsByFiscalYear: { 2023: 40, 2024: 40 }, source: "test", file: "test.csv" },
      period: ltm,
      fye: 12,
      asOfDate: "2024-02-29",
      asOfMonth: "2024-02",
      years: [2023],
      pnlRevenueByFy: { 2023: 40 },
    });
    expect(out.latestCount).toBe(2);
    // The roll-forward that books the loss in Feb-24 ends where the active count stands.
    expect(countRollForward(customers, "2024-02-01", "2024-02-29").endingCount).toBe(out.latestCount);
    // Median tenure is taken over the two customers still active (C-002 and C-003), not the one lost on the day.
    const years = (d: string) => (Date.UTC(2024, 1, 29) - Date.parse(`${d}T00:00:00Z`)) / (365.25 * 86_400_000);
    expect(out.retention!.medianTenureYears).toBeCloseTo((years("2018-03-01") + years("2020-06-15")) / 2, 6);
  });
});

describe("the notes band is fitted, never refused (F44, F55)", () => {
  it("sheds the optional note sentences, the source periods and later footnote sentences, and keeps the fiscal year-end", () => {
    const { ds, out } = model();
    const ctx = buildContext({ row, ds, out: { ...out, fiscalYearEndMonth: 6 }, copy: { open_questions: [] }, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date("2026-09-29") });
    const long = {
      source: "Company financial statements (QuickBooks Online), FY2023–FY2025 and LTM Dec-25; Company customer list as of Jun-25; Payroll register as of Dec-25; Management; AMB Advisory analysis.",
      note: standardNote(ctx, "Shares are of revenue before discounts and refunds, rounded to add to 100%. Employee counts are at fiscal year-end and exclude the owner."),
      footnotes: ["Per management; not independently verified.", "Adj. EBITDA, SDE and PF Adj. EBITDA are non-GAAP measures; see page 16 for the reconciliation to net income. Adj. EBITDA is after a capital reserve [S3] for maintenance capital spending; before it, LTM Dec-25 Adj. EBITDA is $438.7K."],
    };
    expect(notesLineCount(long)).toBeGreaterThan(3);
    const fitted = fitNotes(ctx, "S1.1", long);
    expect(notesLineCount(fitted)).toBeLessThanOrEqual(3);
    expect(fitted.note).toMatch(/^Figures in USD thousands unless noted\. Fiscal year ends June 30\./);
    // "Adj. EBITDA" is not a sentence break: the non-GAAP sentence survives whole.
    expect(fitted.footnotes![1]).toMatch(/^Adj\. EBITDA, SDE and PF Adj\. EBITDA are non-GAAP measures; see page 16/);
    expect(ctx.log.filter((l) => l.startsWith("S1.1:"))).toHaveLength(1);
  });

  it("names the fiscal year-end from the calendar", () => {
    const { ds, out } = model();
    const note = (m: number) => standardNote(buildContext({ row, ds, out: { ...out, fiscalYearEndMonth: m }, copy: { open_questions: [] }, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date() }));
    expect(note(6)).toContain("Fiscal year ends June 30.");
    expect(note(9)).toContain("Fiscal year ends September 30.");
    expect(note(2)).toContain("Fiscal year ends the last day of February.");
    expect(note(12)).not.toContain("Fiscal year ends");
  });
});

describe("period labels (F52)", () => {
  it("compares like with like: a growth head names a comparison, not a period", () => {
    const table = (head: string, v: string) => ({ kind: "numTable" as const, spec: { name: "t", cols: [{ w: 2, kind: "label" as const }, { w: 0.6, kind: "num" as const, head }], rows: [{ type: "line" as const, label: "Revenue", vals: [v] }] } });
    const page = (num: number, head: string, v: string) => ({ num, draft: { id: `P${num}`, kind: "content", exhibits: [], carries: [], spec: { id: `P${num}`, section: "s", title: "t", notes: {}, rows: [{ columns: [{ span: [1, 6], blocks: [table(head, v)] }] }] } } }) as unknown as PlannedPage;
    expect(labelConflicts([page(4, "LTM y/y", "12.3%"), page(9, "LTM y/y", "13.0%")])).toEqual([]);
    expect(labelConflicts([page(4, "FY2024", "2,719"), page(9, "FY2024", "2,718")])).toHaveLength(1);
  });
});

describe("ingest warnings (F56)", () => {
  it("says a leading partial year is left out, and only the year holding the last month is YTD", () => {
    expect(partialYearNote({ year: 2023, months: 6 }, "pnl.csv", true, "2025-12", 6)).toBe("FY2023 covers 6 months in pnl.csv, before the first full fiscal year; those months are left out of the model.");
    expect(partialYearNote({ year: 2026, months: 6 }, "pnl.csv", true, "2025-12", 6)).toBe("FY2026 covers 6 months in pnl.csv; carried as YTD Dec-25, not as a full year.");
    expect(partialYearNote({ year: 2025, months: 7 }, "pnl.csv", false)).toMatch(/is excluded/);
  });
});

describe("raw tabs and the C01 tie-out (F7)", () => {
  it("re-forms every subtotal the exports print from the accounts read, and ties the model's net income to the books'", () => {
    const { out } = model();
    const totals = out.databook!.totals!;
    expect(totals).toHaveLength(25);
    expect(totals.every((t) => t.formation)).toBe(true);
    for (const t of totals) {
      expect(Object.keys(t.databook), t.label).toEqual(Object.keys(t.exported));
      for (const [p, v] of Object.entries(t.exported)) expect(t.databook[p], `${t.label} ${p}`).toBeCloseTo(v, 6);
    }
    expect(totals.find((t) => t.label === "Net Income")!.formation).toEqual({ netIncome: true });
    expect(formationText(totals.find((t) => t.label === "Gross Profit")!.formation)).toBe("Income less Cost of Goods Sold");
    expect(formationText(totals.find((t) => t.label === "TOTAL LIABILITIES AND EQUITY")!.formation)).toBe("Accounts under LIABILITIES plus accounts under EQUITY");
    expect(out.checks.find((c) => c.id === "C01")).toMatchObject({ status: "OK", difference: 0 });
  });

  it("fails C01 when the accounts read do not add up to a total the export prints", () => {
    const ds = ridgelineDataset();
    ds.exportTotals!.find((t) => t.label === "Total Expenses")!.byMonth!["2025-06"]! += 500;
    const out = runModel(ds, defaultAssumptions(ds, row));
    expect(out.checks.find((c) => c.id === "C01")).toMatchObject({ status: "CHECK" });
    expect(out.checks.find((c) => c.id === "C01")!.difference).toBeCloseTo(500, 6);
  });

  it("leaves a total it cannot re-form untied rather than guessing", () => {
    expect(formationOf({ statement: "pnl", label: "Total Owner Draws", path: ["Draws"], file: "x.csv", byFiscalYear: {} }, ["Income", "Expenses"])).toBeUndefined();
    expect(formationOf({ statement: "pnl", label: "Gross Profit", path: [], file: "x.csv", byFiscalYear: {} }, ["Expenses"])).toBeUndefined();
  });

  it("pastes the bank export line by line with a Classification column the proof of cash sums", () => {
    const ds = ridgelineDataset();
    const out = runModel(ds, defaultAssumptions(ds, row));
    const plans = planWorkbook(out, { dataset: ds, codeName: row.code_name, businessName: row.business_name, firmName: "AMB", preparedOn: "2026-09-29" }).byKey;
    const bank = plans.rawBank!;
    expect(bank.cells.get("3:4")!.v).toBe("Classification");
    expect(bank.cells.get(`${3 + 871}:4`)!.v).toBe(ds.bankTransactions!.at(-1)!.classification);
    const deposits = [...plans.proofOfCash!.cells.values()].find((c) => c.label === "deposits 2025-06")!;
    expect(deposits.f).toMatch(/SUMIFS\('Raw - Bank'!\$C\$4:\$C\$874,'Raw - Bank'!\$D\$4:\$D\$874,"Operating"/);
    // Raw values are cents, never binary noise.
    for (const c of bank.cells.values()) if (typeof c.v === "number" && c.fmt !== undefined && c.fmt.includes("0.00")) expect(Math.round(c.v * 100) / 100).toBe(c.v);
  });
});

describe("owner compensation, one basis (F20, F21)", () => {
  const ctxOf = () => {
    const { ds, out } = model();
    return { ds, out, ctx: buildContext({ row, ds, out, copy: { open_questions: [] }, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date("2026-09-29") }) };
  };

  it("adds back the owner's employer payroll taxes with his salary, so SDE and Adj. EBITDA carry both", () => {
    const { out } = ctxOf();
    const s4 = out.adjustments.find((a) => a.row.ref === "S4")!;
    expect(s4.row).toMatchObject({ status: "accepted", category: "owner_compensation" });
    const l = out.periods["FY2025"]!.ladder;
    expect(l.ownerCompAsPaid).toBe(200_000 + 13_860);
    expect(out.namedOutputs.SDE_FY[2025]).toBe(561_775);
  });

  it("shows payroll excluding the owner on the register's basis: the department table's total is the cost table's payroll line", () => {
    const { out, ctx } = ctxOf();
    const p = out.periods["FY2025"]!;
    expect(p.ownerPayrollTaxes).toBe(13_860);
    const register = out.headcount!.byDepartment.reduce((s, d) => s + d.totalComp, 0);
    expect(ctx.brief.value("payroll.FY2025")).toBeCloseTo(p.pnl.payroll - 13_860, 6);
    expect(Math.round(ctx.brief.value("payroll.FY2025")! / 1000)).toBe(Math.round(register / 1000));
    expect(p.kpis.labor_cost_pct_revenue).toBeCloseTo((p.pnl.payroll - 13_860) / p.pnl.revenue, 9);
    // The cost table takes the taxes out of payroll and adds them to owner compensation, so its total is unchanged.
    const table = costStructure(ctx, 7) as { spec: { rows: { key?: string; vals?: string[] }[] } };
    const val = (key: string) => table.spec.rows.find((r) => r.key === key)!.vals!;
    expect(val("cost.ownerTaxes")[2]).toBe("(0.5%)");
    expect(val("cost.payroll")[2]).toBe(`${((p.pnl.payroll - 13_860) / p.pnl.revenue * 100).toFixed(1)}%`);
  });
});

describe("copy that asserts what it leaves open (F22)", () => {
  it("flags a sentence that states as fact a claim another field leaves as [Confirm: ...]", () => {
    const copy = { open_questions: [], s8_1: { observations: [{ row: "bs.debt", lead: "Debt fell,", body: "each [Confirm: repaid by the Seller at closing]." }] }, s10_1: { transaction: "Offers should assume the Seller keeps cash and repays debt at closing." } } as never;
    const issues = lintCopy(copy).filter((i) => i.issue.startsWith("states as fact"));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe("s10_1.transaction");
    // The reviewed Ridgeline copy no longer carries the claim.
    const fixture = JSON.parse(fs.readFileSync(path.join(REPO, "samples/project-ridgeline/cim-copy.fixture.json"), "utf8"));
    expect(lintCopy(fixture.copy).filter((i) => i.issue.startsWith("states as fact"))).toEqual([]);
  });
});

describe("units in a fact table (F24)", () => {
  it("flags a column that prints $200 beside $152.0K, and finds none in the Ridgeline deck", () => {
    const page = (vals: string[]) =>
      ({ num: 9, draft: { id: "S2.3", kind: "content", exhibits: [], carries: [], spec: { id: "S2.3", section: "s", title: "t", notes: {}, rows: [{ columns: [{ span: [1, 6], blocks: [{ kind: "numTable", header: { title: "Capacity measures" }, spec: { name: "Measure", cols: [{ w: 2, kind: "label" }, { w: 0.6, kind: "num", head: "Value" }], rows: vals.map((v, i) => ({ type: "line", label: `m${i}`, vals: [v] })) } }] }] }] } } }) as unknown as PlannedPage;
    expect(mixedUnits([page(["$200", "$152.0K"])])).toHaveLength(1);
    expect(mixedUnits([page(["$200 a year", "$152.0K"])])).toEqual([]);
    const { ds, out } = model();
    const copy = JSON.parse(fs.readFileSync(path.join(REPO, "samples/project-ridgeline/cim-copy.fixture.json"), "utf8")).copy;
    const ctx = buildContext({ row, ds, out, copy, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date("2026-09-29") });
    expect(mixedUnits(planDeck(ctx).pages)).toEqual([]);
  });
});
