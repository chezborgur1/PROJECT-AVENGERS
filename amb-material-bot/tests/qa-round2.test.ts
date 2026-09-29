// QA round 2 fixes that the Ridgeline sample cannot show on its own: each
// case is built small, from the function that had the defect, so the rule it
// now keeps is stated where it is tested. The period shapes that crashed the
// deck run end to end in tests/period-shapes.test.ts.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext, standardNote } from "../src/cim/context.ts";
import { lintCopy } from "../src/cim/copy.ts";
import { commentaryDensity, exhibitCounts, labelConflicts, mixedUnits, narrowTables, planDeck, STANDARD_FILL, type PlannedPage } from "../src/cim/planner.ts";
import { fitNotes } from "../src/cim/sections/common.ts";
import type { CustomerRecord } from "../src/domain/financials.ts";
import { partialYearNote } from "../src/ingest/quickbooksExport.ts";
import { countRollForward, customerAnalytics, customerActiveAt } from "../src/model/analytics.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { costShiftChart, costStructure, incomeStatement } from "../src/cim/exhibits.ts";
import { collectOpenQuestions } from "../src/cim/deck.ts";
import { accountLabel } from "../src/cim/brief.ts";
import { keepMarker, notesLineCount, type Block } from "../src/cim/design.ts";
import { S11 as appendix } from "../src/cim/sections/appendix.ts";
import { bsDetailLine, debtLikeTreatment } from "../src/domain/chartOfAccounts.ts";
import { nwcLines } from "../src/model/nwc.ts";
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

describe("the Ridgeline deck's exhibits (F23, F25, F27, F29)", () => {
  const planned = () => {
    const { ds, out } = model();
    const copy = JSON.parse(fs.readFileSync(path.join(REPO, "samples/project-ridgeline/cim-copy.fixture.json"), "utf8")).copy;
    const ctx = buildContext({ row, ds, out, copy, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date("2026-09-29") });
    return { ctx, plan: planDeck(ctx) };
  };
  const blocksOf = (p: PlannedPage) => (p.layout?.placed ?? []).map((x) => x.block);

  it("calls the depreciation-proxy reserve an AMB estimate, with its footnote on the ladder and the support page", () => {
    const { plan } = planned();
    const page = (id: string) => plan.pages.find((p) => p.draft.id === id)!;
    const support = blocksOf(page("S7.2")).find((b) => b.kind === "textTable" && b.header?.title === "Adjustment support") as { spec: { rows: unknown[][] } };
    const s3 = support.spec.rows.find((r) => r[0] === "[S3]")!;
    expect(s3.at(-1)).toBe("AMB estimate (proxy: three-year average depreciation; Form 4562 requested) (2)");
    expect(page("S7.2").layout!.spec.notes.footnotes).toContain("[S3] is an AMB estimate (three-year average depreciation) until Form 4562 is provided.");
    expect(page("S7.1").layout!.spec.notes.footnotes).toContain("[S3] is an AMB estimate (three-year average depreciation) until Form 4562 is provided.");
  });

  it("builds no column from placeholders alone, and lists each column left out as a question", () => {
    const { ctx, plan } = planned();
    const tables = plan.pages.flatMap(blocksOf).filter((b) => b.kind === "textTable") as { header?: { title: string }; spec: { head?: string[]; rows: unknown[][] } }[];
    for (const t of tables) {
      // A headerless table (the contact block) is checked column by column all the same.
      (t.spec.head ?? t.spec.rows[0]!.map((_, i) => `column ${i + 1}`)).forEach((h, i) => {
        const cells = t.spec.rows.map((r) => String(r[i] ?? ""));
        expect(cells.every((c) => /^\[Confirm:/.test(c)), `${t.header?.title}: ${h}`).toBe(false);
      });
    }
    const service = tables.find((t) => t.header?.title === "Service lines")!;
    expect(service.spec.head).not.toContain("Pricing basis");
    expect(ctx.openQuestions.some((q) => /pricing basis of each service line/.test(q))).toBe(true);
    expect(collectOpenQuestions(ctx, plan).some((q) => /pricing basis of each service line/.test(q))).toBe(true);
    const owner = tables.find((t) => t.header?.title === "Owner responsibilities and transition")!;
    expect(owner.spec.head).toEqual(["Responsibility", "Transition support", "Obs."]);
    expect(ctx.openQuestions.some((q) => /Who assumes each of the owner's duties/.test(q))).toBe(true);
  });

  it("fills every body page to the 80% floor, which the plan reports when a page falls short (F26)", () => {
    const { plan } = planned();
    const body = plan.pages.filter((p) => /^S[2-9]\./.test(p.draft.id));
    expect(body.length).toBeGreaterThan(10);
    for (const p of body) expect(p.layout!.fill, p.draft.id).toBeGreaterThanOrEqual(STANDARD_FILL);
    expect(commentaryDensity(plan.pages).filter((w) => /floor for a body page/.test(w))).toEqual([]);
    const thin = { ...body[0]!, layout: { ...body[0]!.layout!, fill: 0.6 } } as PlannedPage;
    expect(commentaryDensity([thin]).some((w) => /fill 60% is below the 80% floor/.test(w))).toBe(true);
  });

  it("leads the people page with run-in paragraphs built from the notes' facts, the tables beside them (F28)", () => {
    const { ctx, plan } = planned();
    const page = plan.pages.find((p) => p.draft.id === "S5.1")!;
    const prose = blocksOf(page).find((b) => b.kind === "prose") as { paragraphs: { lead?: string; body: string }[] };
    expect(prose.paragraphs.map((p) => p.lead)).toEqual(["Staffing.", "The owner’s role.", "Fleet and systems.", "Suppliers and reputation.", "Customers."]);
    const text = prose.paragraphs.map((p) => p.body).join(" ");
    const words = text.split(/\s+/).length;
    expect(words).toBeGreaterThan(130);
    // Every fact is the notes' own, with its casing: no invented cause, no mangled acronym.
    expect(text).toContain("CSR / dispatch 3");
    expect(text).toContain("Carrier (local distributor) for HVAC equipment");
    expect(text).toContain("its Google rating is 4.8 from 900+ reviews");
    expect(text).toContain(`${ctx.intake!.owner.name} will support the transition for up to 12 months after closing (1)`);
    expect(blocksOf(page).map((b) => ("header" in b && b.kind !== "observations" ? b.header?.title : b.kind))).toEqual(["prose", "Organization and tenure", "Compensation by department", "Headcount roll-forward", "observations"]);
  });

  it("keeps every content page to three exhibits, the milestones read as a paragraph where a fourth table would sit (F39)", () => {
    const { ctx, plan } = planned();
    expect(exhibitCounts(plan.pages)).toEqual([]);
    const s22 = plan.pages.find((p) => p.draft.id === "S2.2")!;
    const history = blocksOf(s22).find((b) => b.kind === "prose") as { paragraphs: { lead?: string; body: string }[] };
    expect(history.paragraphs[0]).toEqual({ lead: "History.", body: "Founded by Mark Delaney in 2009; became a Carrier Factory Authorized Dealer in 2015; added plumbing service in 2019 (1)." });
    // A suppliers table, where one prints, is titled by what it holds; the missing contractor license is asked for, and a
    // question recorded without a placeholder reaches open-questions.md like any other.
    expect(ctx.openQuestions.some((q) => /^Contractor licenses/.test(q))).toBe(true);
    expect(collectOpenQuestions(ctx, plan).some((q) => /^Contractor licenses/.test(q))).toBe(true);
  });

  it("lays out the process with its own Target timing column, the contact block headerless, the no-contact line verbatim (F40)", () => {
    const { plan } = planned();
    const page = plan.pages.find((p) => p.draft.id === "S10.1")!;
    const tables = blocksOf(page).filter((b) => b.kind === "textTable") as { header?: { title: string }; spec: { head?: string[]; rows: string[][] } }[];
    const process = tables.find((t) => t.header?.title === "Process and next steps")!;
    expect(process.spec.head).toEqual(["#", "Stage", "What happens", "Target timing"]);
    expect(process.spec.rows.find((r) => r[1] === "Due Diligence")![3]).toBe("LOI + 9–11 weeks");
    for (const r of process.spec.rows) expect(r[2]).not.toMatch(/Target:/);
    const contact = tables.find((t) => t.header?.title === "Contact")!;
    expect(contact.spec.head).toBeUndefined();
    expect(contact.spec.rows[0]).toEqual(["Firm", "AMB Advisory Services LLC"]);
    const prose = blocksOf(page).find((b) => b.kind === "prose") as { paragraphs: { body: string }[] };
    expect(prose.paragraphs.map((p) => p.body).join(" ")).toContain("All inquiries should be directed to AMB Advisory. Do not contact the Seller or its employees directly.");
  });

  it("footnotes the intake-sourced real estate row like every other term (F42)", () => {
    const { plan } = planned();
    const rows = plan.pages.flatMap((p) => blocksOf(p)).flatMap((b) => (b.kind === "textTable" ? (b.spec.rows as unknown[][]) : []));
    const realEstate = rows.find((r) => r[0] === "Real estate")!;
    expect(String(realEstate[1])).toMatch(/\(1\)\.$/);
  });

  it("sets every table to its block and every chart at 2.60 in or taller", () => {
    const { plan } = planned();
    expect(narrowTables(plan.pages)).toEqual([]);
    // The chart's own height (a chart left at the default is 2.60 in); the placed box adds its header.
    for (const p of plan.pages) for (const x of p.layout?.placed ?? []) if (x.block.kind === "chart") expect(x.block.h ?? 2.6, `${p.draft.id} ${x.block.header?.title}`).toBeGreaterThanOrEqual(2.6);
  });
});

describe("cost table order, labels and small-line growth (F34, F35, F36)", () => {
  const ctxOf = () => {
    const { ds, out } = model();
    return buildContext({ row, ds, out, copy: { open_questions: [] }, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date("2026-09-29") });
  };
  type Table = Extract<Block, { kind: "numTable" }>;

  it("names a generic sub-account by its parent: payroll taxes never read as income tax", () => {
    expect(accountLabel("Payroll Expenses : Taxes")).toBe("Payroll taxes");
    expect(accountLabel("Payroll Expenses : Technician Wages")).toBe("Technician wages");
    expect(accountLabel("Taxes")).toBe("Taxes");
  });

  it("lists the operating lines by latest share with the remainder last, and names the adjustment an account carries", () => {
    // Ingest records the account the settlement came out of, as it does from the sample folder's adjustments.csv.
    const ds = ridgelineDataset();
    ds.adjustments = ds.adjustments!.map((a) => (a.description.startsWith("Legal fees") ? { ...a, accounts: ["Legal & Professional Fees"] } : a));
    const out = runModel(ds, defaultAssumptions(ds, row));
    const ctx = buildContext({ row, ds, out, copy: { open_questions: [] }, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date("2026-09-29") });
    const table = costStructure(ctx, 7) as Table;
    const rows = table.spec.rows;
    const lines = rows.slice(rows.findIndex((r) => r.key === "cost.owner") + 1, rows.findIndex((r) => r.key === "cost.opex"));
    const ranked = lines.filter((r) => r.key !== "cost.other");
    const latest = (r: (typeof rows)[number]) => Number(r.vals![2]!.replace("%", ""));
    expect(ranked.length).toBeGreaterThan(4);
    expect(ranked.map(latest)).toEqual([...ranked.map(latest)].sort((a, b) => b - a));
    if (lines.some((r) => r.key === "cost.other")) expect(lines.at(-1)!.key).toBe("cost.other");
    expect(rows.map((r) => r.label)).toContain("Payroll taxes");
    expect(rows.find((r) => r.label === "Legal and professional fees")?.text).toBe("Adjusted in [N2] ({{page:S7.1}})");
  });

  it("heads the change column in one line and carries its span in the units, which the chart beside it reads", () => {
    const table = costStructure(ctxOf(), 7) as Table;
    expect(table.spec.cols.filter((c) => c.kind === "num").at(-1)!.head).toBe("Δ bps");
    expect(table.header!.units).toBe("(% of revenue; Δ FY23–FY25)");
    const chart = costShiftChart(table) as Extract<Block, { kind: "chart" }>;
    expect(chart.header!.units).toBe("(bps, FY23–FY25)");
  });

  it("prints n.m. for the growth of an immaterial line, as the ladder does", () => {
    const table = incomeStatement(ctxOf(), 7) as Table;
    const other = table.spec.rows.find((r) => r.key === "is.other")!;
    // $1.2K to $3.1K of interest income less interest expense is no growth rate, whatever its sign.
    expect(other.vals!.slice(-2)).toEqual(["n.m.", "n.m."]);
    const revenue = table.spec.rows.find((r) => r.key === "rev.total" || r.label === "Total revenue")!;
    expect(revenue.vals!.slice(-2).every((v) => /%$/.test(v))).toBe(true);
  });

  it("ties a trailing footnote marker to the word before it, so a wrap never strands it", () => {
    expect(keepMarker("(–) Market replacement compensation (2)")).toBe("(–) Market replacement compensation (2)");
    expect(keepMarker("Adj. EBITDA")).toBe("Adj. EBITDA");
  });
});

describe("basis of preparation (F42, F43)", () => {
  const ctxAt = (date: string) => {
    const { ds, out } = model();
    return buildContext({ row, ds, out, copy: { open_questions: [] }, firm: { name: "AMB", contact: "", email: "", phone: "" }, date: new Date(date) });
  };
  const noteOf = (date: string) => appendix.pages.find((p) => p.id === "S11.1")!.build(ctxAt(date))[0]!.spec!.notes.note ?? "";

  it("says the months after the latest figures are not included when the deck is dated long after them", () => {
    expect(noteOf("2026-09-29")).toContain("Results after Dec-25, including 2026 year to date, are not included; they have been requested.");
    expect(noteOf("2026-02-15")).not.toContain("Results after");
  });

  it("names every source period as the tables do", () => {
    const page = appendix.pages.find((p) => p.id === "S11.1")!.build(ctxAt("2026-09-29"))[0]!;
    const sources = page.spec!.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks)).find((b) => b.kind === "textTable" && b.header?.title === "Sources") as { spec: { rows: string[][] } };
    const period = (name: string) => sources.spec.rows.find((r) => r[0] === name)![1];
    expect(period("Balance sheets")).toBe("Dec-23, Dec-24, Dec-25");
    expect(period("Bank statements")).toMatch(/^[A-Z][a-z]{2}-\d{2} to [A-Z][a-z]{2}-\d{2}$/);
  });
});

describe("debt-like balances leave NWC by the same list (F54)", () => {
  const OCL = "Liabilities and Equity > Liabilities > Current Liabilities > Other Current Liabilities";

  it("classes an accrued bonus or payroll tax payable as debt-like, and NWC removes it", () => {
    for (const name of ["Payroll Taxes Payable", "Accrued Bonus"]) {
      expect(bsDetailLine(name, OCL, "other_current_liabilities")).toBe("accrued_bonus_payroll_tax");
      expect(debtLikeTreatment(name, "other_current_liabilities", OCL)?.treatment).toBe("debt_like");
    }
    expect(debtLikeTreatment("Accrued Payroll", "other_current_liabilities", OCL)?.treatment).toBe("nwc");
    const { ds } = model();
    const p = ds.balanceSheets!.at(-1)!;
    const base = nwcLines(p, undefined).lines;
    const withBonus = nwcLines({ ...p, detail: { ...p.detail, accrued_bonus_payroll_tax: 10_000 } }, undefined).lines;
    expect(withBonus.adjustments - base.adjustments).toBe(10_000);
  });

  it("fails C19 when a debt-like balance is deducted while NWC still carries it", () => {
    const { ds } = model();
    const asOf = ds.balanceSheets!.at(-1)!.asOf;
    const bonus = { item: "Accrued bonus", balance: 10_000, asOf, treatment: "debt_like" as const, accounts: ["Accrued Bonus"], source: "bs.csv", status: "confirmed" as const };
    const twice = { ...ds, debtLikeItems: [...ds.debtLikeItems!, bonus] };
    expect(runModel(twice, defaultAssumptions(twice, row)).checks.find((c) => c.id === "C19")).toMatchObject({ status: "CHECK", difference: 10_000 });
    const sheets = ds.balanceSheets!.map((b, i, all) => (i === all.length - 1 ? { ...b, detail: { ...b.detail, accrued_bonus_payroll_tax: 10_000 } } : b));
    const once = { ...twice, balanceSheets: sheets };
    expect(runModel(once, defaultAssumptions(once, row)).checks.find((c) => c.id === "C19")!.status).toBe("OK");
  });
});

describe("the Databook's Personal? and ref columns (F15)", () => {
  it("writes every ref an account feeds, the definitional rows included, and flags only personal or discretionary accounts", () => {
    const { out } = model();
    const row = (account: string) => out.databook!.pnl.find((r) => r.account === account)!;
    expect(row("Depreciation Expense").adjustmentRef).toBe("D3, S3");
    expect(row("Interest Expense").adjustmentRef).toBe("D1");
    expect(row("Interest Income").adjustmentRef).toBe("N5");
    expect(row("Legal & Professional Fees").adjustmentRef).toMatch(/^N2\b/);
    // A one-time legal fee is non-recurring, not personal; meals and the vehicle are the owner-personal flags.
    expect(row("Legal & Professional Fees").personal).toBe(false);
    expect(row("Meals & Entertainment").personal).toBe(true);
    expect(row("Vehicle Expenses").personal).toBe(true);
  });
});
