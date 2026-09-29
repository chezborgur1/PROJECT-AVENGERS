// Engine tests on the fictional Ridgeline fixture: the contract figures, the
// ladder identities, the checks, the three statements the projections rest
// on, and the annual-only (guide 5.2A) variant. The workbook itself is
// tested in model-workbook.test.ts.

import { describe, expect, it } from "vitest";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import type { ModelOutput } from "../src/model/types.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { sampleRow } from "./helpers.ts";

const row = sampleRow();
const build = (ds: FinancialDataset): ModelOutput => runModel(ds, defaultAssumptions(ds, row));
const ds = ridgelineDataset();
const model = build(ds);

/** The same business with only fiscal-year totals, as from tax returns (guide 5.2A). */
const annualOnly = (full: FinancialDataset): FinancialDataset => ({ ...full, monthly: undefined, sourceGranularity: "annual", asOfMonth: undefined, depositsByMonth: undefined });

describe("contract figures (FY2025 = LTM Dec-25)", () => {
  it("ladder rungs match the finished contract", () => {
    const n = model.namedOutputs;
    expect(n.RepEBITDA_FY[2025]).toBe(319_515);
    expect(n.SDE_FY[2025]).toBe(561_775);
    expect(n.AdjEBITDA_FY[2025]).toBe(385_725);
    expect(n.RepEBITDA_LTM).toBe(319_515);
    expect(n.SDE_LTM).toBe(561_775);
    expect(n.AdjEBITDA_LTM).toBe(385_725);
    expect(n.PFAdjEBITDA).toBe(385_725);
  });

  it("columns follow guide 5.2: FY-2..FY, YTD PY/CY, LTM PY/CY, PF, then five projected years", () => {
    expect(model.columns.map((c) => c.label)).toEqual(["FY2023", "FY2024", "FY2025", "YTD Dec-24", "YTD Dec-25", "LTM Dec-24", "LTM Dec-25", "PF Dec-25", "FY2026E", "FY2027E", "FY2028E", "FY2029E", "FY2030E"]);
  });

  it("every period's ladder adds up: NI + D = Reported EBITDA, + N + S1 = SDE, + S2 + S3 (negative) = Adj. EBITDA, + PF = PF Adj. EBITDA", () => {
    for (const c of model.columns.filter((x) => !x.projected)) {
      const l = model.periods[c.key]!.ladder;
      const d = l.definitional.interest + l.definitional.taxes + l.definitional.da;
      expect(l.netIncome + d, c.label).toBeCloseTo(l.reportedEbitda, 6);
      const accepted = (items: { amount: number; status: string }[]) => items.filter((x) => x.status === "accepted").reduce((s, x) => s + x.amount, 0);
      expect(l.reportedEbitda + accepted(l.normalization) + l.ownerCompAsPaid, c.label).toBeCloseTo(l.sde, 6);
      expect(l.marketReplacement, c.label).toBeLessThan(0);
      expect(l.sde + l.marketReplacement + l.capitalReserve, c.label).toBeCloseTo(l.adjEbitda, 6);
      expect(l.adjEbitda + accepted(l.proForma), c.label).toBeCloseTo(l.pfAdjEbitda, 6);
    }
  });

  it("the LTM ending at the fiscal year-end equals that fiscal year, line by line", () => {
    const fy = model.periods.FY2025!.pnl;
    const ltm = model.periods["LTM2025-12"]!.pnl;
    for (const k of Object.keys(fy) as (keyof typeof fy)[]) expect(ltm[k], k).toBeCloseTo(fy[k], 6);
  });
});

describe("checks (guide 5.7)", () => {
  it("lists C01-C37 once each, every one OK or n.a., and the master check passes", () => {
    expect(model.checks.map((c) => c.id)).toEqual(Array.from({ length: 37 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
    expect(model.checks.filter((c) => c.status === "CHECK")).toEqual([]);
    // C37 runs on the written file, so the engine's master check says the render check is pending (guide 5.7).
    expect(model.masterCheck).toBe("All checks OK (render check pending)");
    expect(model.namedOutputs.MasterCheck).toBe("All checks OK (render check pending)");
    expect(model.checks.find((c) => c.id === "C37")!.status).toBe("Pending");
  });

  it("the customer and headcount roll-forwards close: start + new - lost = end", () => {
    const ret = model.customers!.retention!;
    for (const [fy, r] of Object.entries(ret.byFiscalYear)) expect(r.counts.startingCount + r.counts.newCustomers - r.counts.lostCustomers, fy).toBe(r.counts.endingCount);
    for (const [fy, r] of Object.entries(model.headcount!.rollForwardByFiscalYear)) expect(r.start + r.hires - r.departures, fy).toBe(r.end);
  });
});

describe("chart exhibits (guide 5.12)", () => {
  it("builds the catalogue entries whose data exists, over the 36-month window", () => {
    // No vendor detail (MC-E5) and no customer revenue by month (MC-C3); one customer type and one department reach 20%.
    expect(model.charts!.map((e) => e.id)).toEqual(["MC-R1", "MC-R2", "MC-E1", "MC-E4", "MC-C1", "MC-C2", "MC-C4", "MC-H1", "MC-H2", "MC-H3", "MC-H5"]);
    expect(model.namedOutputs.ChartStart).toBe("2023-01");
    expect(model.namedOutputs.ChartEnd).toBe("2025-12");
    for (const e of model.charts!.filter((x) => x.monthly)) expect(e.categories.length, e.id).toBe(36);
  });

  it("plots losses below the axis and keeps every mix adding to total revenue", () => {
    const c1 = model.charts!.find((e) => e.id === "MC-C1")!;
    expect(c1.series.find((s) => s.key === "lost")!.values.every((v) => v <= 0)).toBe(true);
    const r2 = model.charts!.find((e) => e.id === "MC-R2")!;
    const total = r2.series.find((s) => s.key === "revenue")!;
    const parts = r2.series.filter((s) => s !== total);
    total.values.forEach((v, i) => expect(parts.reduce((s, p) => s + p.values[i]!, 0)).toBeCloseTo(v, 9));
    const r1 = model.charts!.find((e) => e.id === "MC-R1")!;
    expect(r1.series[0]!.values.reduce((s, v) => s + v, 0)).toBeCloseTo((2_406_800 + 2_718_600 + 3_040_800) / 1000, 6);
  });

  it("has no chart tabs without a monthly grid", () => {
    expect(build(annualOnly(ds)).charts).toEqual([]);
  });
});

describe("three statements behind the projections", () => {
  it("balance every year and cash ties to the cash flow", () => {
    for (const y of model.years) {
      if (!y.bs) continue;
      expect(Math.abs(y.bs.check), String(y.year)).toBeLessThan(0.01);
      if (y.cf) expect(y.cf.endCash, String(y.year)).toBeCloseTo(y.bs.cash, 6);
    }
  });

  it("projects five years from the last actual", () => {
    expect(model.projected.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("builds a balanced opening balance sheet when the sources have none", () => {
    const noBs: FinancialDataset = { ...ds, balanceSheet: {}, balanceSheets: undefined };
    const m = build(noBs);
    const opening = m.historical[m.historical.length - 1]!.bs!;
    expect(opening.estimated).toBe(true);
    expect(Math.abs(opening.check)).toBeLessThan(0.01);
    for (const y of m.projected) expect(Math.abs(y.bs!.check)).toBeLessThan(0.01);
  });

  it("opens the projections from the latest dated sheet when the year-end one is missing", () => {
    const noYearEnd: FinancialDataset = { ...ds, balanceSheet: { 2023: ds.balanceSheet[2023]!, 2024: ds.balanceSheet[2024]! }, balanceSheets: ds.balanceSheets!.slice(0, 2) };
    const opening = build(noYearEnd).historical.at(-1)!.bs!;
    expect(opening.estimated).toBe(false);
    expect(opening.asOfMonth).toBe("2024-12");
    expect(opening.cash).toBe(ds.balanceSheets![1]!.values.cash);
  });
});

describe("Main Street valuation by scenario (guide 5.5)", () => {
  it("builds the scenario block in monthly Main Street mode and values each case on its own SDE", () => {
    expect(model.mode.mode).toBe("mainStreet");
    expect(model.scenarios?.map((s) => s.name)).toEqual(["Low", "Mid", "High"]);
    const { low, mid, high } = model.valuationDetail!.cases;
    // Mid is the LTM window as reported; Low and High move earnings, not only the multiple.
    expect(mid.sde).toBeCloseTo(model.periods["LTM2025-12"]!.ladder.sde, 6);
    expect(low.sde).toBeLessThan(mid.sde);
    expect(mid.sde).toBeLessThan(high.sde);
    expect(new Set([low, mid, high].map((c) => Math.round(c.financing.cashFlowAvailable))).size).toBe(3);
    expect(model.checks.find((c) => c.id === "C29")!.status).toBe("OK");
  });

  it("services the structure's debt from the Mid case, the price it is built on", () => {
    const d = model.deal![0]!;
    expect(d.purchasePrice).toBe(model.valuationDetail!.cases.mid.totalInvestment);
    expect(d.debtService.cashFlowAvailable).toBeCloseTo(model.valuationDetail!.cases.mid.financing.cashFlowAvailable, 6);
    // The seller note adds year-one service, so the reference structure's DSCR sits below the SBA-only illustration.
    expect(d.debtService.dscr).toBeLessThan(model.valuationDetail!.cases.mid.financing.dscr);
  });

  it("keeps Low, Mid and High on one earnings figure in lower-middle-market mode, which has no scenario block", () => {
    const a = defaultAssumptions(ds, row);
    const lmm = runModel(ds, { ...a, recast: { ...a.recast, mainStreetMode: false } });
    expect(lmm.mode.mode).toBe("lowerMiddleMarket");
    expect(lmm.scenarios).toBeUndefined();
    const { low, mid, high } = lmm.valuationDetail!.cases;
    expect(low.sde).toBe(mid.sde);
    expect(high.sde).toBe(mid.sde);
    expect(lmm.checks.find((c) => c.id === "C29")!.status).toBe("n.a.");
  });
});

describe("deal structure completeness (guide 5.5, 5.6)", () => {
  it("allocates an asset purchase price under Form 8594 with goodwill as the residual", () => {
    const d = model.deal![0]!;
    expect(model.dealForm).toBe("asset_purchase");
    const al = d.allocation!;
    expect(model.assumptions!.deal.premisesArrangement).toBe("Leased from third party");
    expect(al.land).toBe(0);
    expect(al.building).toBe(0);
    const bs = model.periods["LTM2025-12"]!.bs!;
    expect(al.equipment).toBe(bs.fixedAssets);
    expect(al.inventory).toBe(bs.inventory);
    expect(al.land! + al.building! + al.equipment + al.inventory + al.nonCompete + al.goodwill).toBeCloseTo(d.purchasePrice, 6);
  });

  it("moves deferred revenue and deposits out of NWC and into debt-like items together under the override", () => {
    const a = defaultAssumptions(ds, row);
    const base = runModel(ds, a);
    const over = runModel(ds, { ...a, deal: { ...a.deal, deferredRevenueTreatment: "Debt-like" } });
    const customerMoney = base.debtLike!.items.filter((i) => /deferred revenue|customer deposit/i.test(i.item) && i.treatment === "nwc").reduce((s, i) => s + i.balance, 0);
    expect(customerMoney).toBeGreaterThan(0);
    const latest = (m: ModelOutput) => m.nwc!.periods.at(-1)!.lines;
    expect(latest(over).adjustedNwc - latest(base).adjustedNwc).toBeCloseTo(latest(base).deferredRevenue + latest(base).customerDeposits, 6);
    expect(over.debtLike!.debtLike - base.debtLike!.debtLike).toBeCloseTo(customerMoney, 6);
    expect(over.checks.find((c) => c.id === "C19")!.status).toBe("OK");
  });
});

describe("annual-only mode (guide 5.2A)", () => {
  const annual = build(annualOnly(ds));

  it("keeps only fiscal-year columns and the same fiscal-year ladder", () => {
    expect(annual.granularity).toBe("annual");
    expect(annual.columns.filter((c) => !c.projected).every((c) => c.ref.kind === "fiscal_year")).toBe(true);
    expect(annual.namedOutputs.SDE_FY[2025]).toBe(561_775);
    expect(annual.namedOutputs.AdjEBITDA_FY[2025]).toBe(385_725);
    expect(annual.masterCheck).toBe("All checks OK (render check pending)");
  });

  it("compares bank deposits with revenue only over a full year when there is no monthly grid (C14)", () => {
    const base = annualOnly(ds);
    const partial = build({ ...base, deposits: { 2025: { amount: 1_580_000, months: 6 } } });
    const c14 = partial.checks.find((c) => c.id === "C14")!;
    expect(c14.status).toBe("n.a.");
    expect(c14.note).toContain("6 months of FY2025");
    expect(partial.masterCheck).toBe("All checks OK (render check pending)");
    const full = build({ ...base, deposits: { 2024: { amount: 2_720_000, months: 12 }, 2025: { amount: 1_580_000, months: 6 } } });
    expect(full.checks.find((c) => c.id === "C14")).toMatchObject({ status: "OK", note: "FY2024 deposits over 12 months against annual revenue" });
  });

  it("orders the Low / Mid / High scenarios on EBITDA and differs on growth and an operating driver (C29)", () => {
    const [low, mid, high] = annual.scenarios!;
    expect(low!.pnl.ebitda).toBeLessThan(mid!.pnl.ebitda);
    expect(mid!.pnl.ebitda).toBeLessThan(high!.pnl.ebitda);
    expect(annual.checks.find((c) => c.id === "C29")!.status).toBe("OK");
    // Both cases keep the latest year's cost ratio, never an older, worse one, and hold payroll, so Low gets no cushion
    // from a payroll that shrinks with sales and High no penalty from a blended cost of revenue (QA round 2 F14).
    const ratio = (p: { cogs: number; revenue: number }) => p.cogs / p.revenue;
    expect(ratio(high!.pnl)).toBeCloseTo(ratio(mid!.pnl), 9);
    expect(ratio(low!.pnl)).toBeCloseTo(ratio(mid!.pnl), 9);
    expect(low!.pnl.payroll).toBe(mid!.pnl.payroll);
    expect(high!.pnl.ebitda - mid!.pnl.ebitda).toBeCloseTo(0.03 * (mid!.pnl.revenue - mid!.pnl.cogs), 6);
  });
});
