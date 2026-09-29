// The whole bot on the period shapes most real clients have and the sample
// does not: an as-of month inside the fiscal year, a June year-end, one full
// fiscal year plus year-to-date months, and bank statements outside the P&L
// months. Each must deliver a verified workbook and a complete deck: no page
// left out, no unresolved figure token, no NaN (QA round 2 F44 to F53).

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildCim } from "../src/cim/deck.ts";
import { draftCimCopy } from "../src/cim/narrative.ts";
import { gatherIntake } from "../src/ingest/index.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { verifyWorkbook } from "../src/model/verifyWorkbook.ts";
import { writeWorkbook } from "../src/model/workbook.ts";
import { REPO, tmpDir } from "./helpers.ts";
import { annualNewer, annualYears, bankOutsideGrid, juneYearEnd, midYear, mixedOlderAnnual, monthly12, monthlyRow, throughJun26, zeroRevenueMonths, type Scenario } from "./scenarios.ts";

const firm = { name: "AMB Advisory Services", contact: "Frank", email: "frank@example.com", phone: "" };
const date = new Date("2026-09-29T12:00:00Z");

async function slideTexts(file: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  return Promise.all(slides.map(async (s) => [...(await zip.file(s)!.async("string")).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ")));
}

/** Ingest, model, workbook and its verification, copy and deck, as the pipeline runs them (no PDF). */
async function build(s: Scenario) {
  delete process.env.ANTHROPIC_API_KEY;
  const bundle = await gatherIntake(s.row, REPO, () => {});
  const ds = bundle.dataset;
  const assumptions = defaultAssumptions(ds, s.row);
  const model = runModel(ds, assumptions);
  const dir = tmpDir("amb-shape-");
  const workbook = path.join(dir, "model.xlsx");
  await writeWorkbook({ row: s.row, dataset: ds, assumptions, model, firmName: firm.name, preparedOn: "2026-09-29", version: "v01" }, workbook);
  const verification = await verifyWorkbook(workbook, model);
  const draft = await draftCimCopy({ row: s.row, notes: bundle.notes, dataset: ds, model, firm, date });
  const cim = await buildCim({ row: s.row, ds, out: model, copy: draft.copy, firm, date }, path.join(dir, "cim.pptx"), { pdf: false, png: false });
  return { ds, model, verification, cim, text: (await slideTexts(cim.pptx)).join("\n") };
}

function expectDelivered(r: Awaited<ReturnType<typeof build>>, minPages = 15): void {
  expect(r.verification.errors).toEqual([]);
  expect(r.verification.mismatches).toEqual([]);
  expect(r.verification.lint).toEqual([]);
  expect(r.cim.log.filter((l) => /could not be built/.test(l))).toEqual([]);
  expect(r.cim.plan.modules.filter((m) => /^Not built/.test(m.reason ?? ""))).toEqual([]);
  expect(r.text).not.toMatch(/\{\{|NaN|undefined|Infinity|\[Confirm: figure/);
  expect(r.cim.plan.pages.length).toBeGreaterThanOrEqual(minPages);
}

describe("period shapes beyond the sample (offline)", () => {
  it("builds a December year-end as of Jul-25: LTM, YTD and two fiscal years", async () => {
    const r = await build(midYear(31));
    expectDelivered(r);
    // The fiscal-year tables head their change with the fiscal years they compare, never "LTM y/y" (F52).
    const s23 = r.cim.plan.pages.find((p) => p.draft.id === "S2.3")!;
    const heads = s23.draft.spec!.rows.flatMap((row) => row.columns.flatMap((c) => c.blocks)).flatMap((b) => (b.kind === "numTable" ? b.spec.cols.map((c) => c.head ?? "") : []));
    expect(heads).toContain("FY24 y/y");
    expect(heads).not.toContain("LTM y/y");
    expect(r.cim.log.filter((l) => /prints .* on page \d+ and .* on page/.test(l))).toEqual([]);
  }, 600_000);

  it("builds an as-of month six months into the fiscal year (Jun-26) whose windows match hand sums (QA round 3 F25)", async () => {
    const s = throughJun26();
    const r = await build(s);
    expectDelivered(r);
    // Month 0 is Jan-23; the export now runs to Jun-26 (month 41).
    const revenue = monthlyRow(s.dir, "Total Income");
    expect(revenue).toHaveLength(42);
    const sum = (from: number, to: number) => revenue.slice(from, to + 1).reduce((a, v) => a + v, 0);
    const p = r.model.periods;
    expect(p["LTM2026-06"]!.pnl.revenue).toBeCloseTo(sum(30, 41), 2);
    expect(p["LTM2025-06"]!.pnl.revenue).toBeCloseTo(sum(18, 29), 2);
    expect(p["YTD2026-06"]!.pnl.revenue).toBeCloseTo(sum(36, 41), 2);
    expect(p["YTD2025-06"]!.pnl.revenue).toBeCloseTo(sum(24, 29), 2);
    expect(p.FY2025!.pnl.revenue).toBeCloseTo(sum(24, 35), 2);
    expect(r.model.namedOutputs.Rev_LTM).toBeCloseTo(sum(30, 41), 2);
    // The strip and the charts end at the as-of month.
    expect(r.model.monthly!.chartWindow.end).toBe("2026-06");
    // [N2], the $24K settlement in the Jun and Jul 2024 legal fees: out of LTM Jun-26, and the prior-year LTM takes July's half.
    const n2 = r.model.adjustments.find((a) => a.row.description.startsWith("Legal fees: settled"))!;
    expect(n2.row.byMonth!["2024-06"]! + n2.row.byMonth!["2024-07"]!).toBeCloseTo(24_000, 0);
    expect(n2.byColumn["LTM2026-06"]).toBeCloseTo(0, 6);
    expect(n2.byColumn["LTM2025-06"]).toBeCloseTo(n2.row.byMonth!["2024-07"]!, 6);
    expect(n2.byColumn["LTM2025-06"]).toBeGreaterThan(8_000);
    // The named LTM outputs read the LTM column, not a fiscal year: the customer list is by fiscal year, so no Top10Share_LTM.
    expect(r.model.namedOutputs.SDE_LTM).toBeCloseTo(p["LTM2026-06"]!.ladder.sde, 6);
    expect(r.model.namedOutputs.Top10Share_LTM).toBeNull();
  }, 600_000);

  it("builds a June year-end whose balance sheets fall in December", async () => {
    const r = await build(juneYearEnd());
    expectDelivered(r);
    // Customer figures are priced over the latest fiscal year the list covers, not an LTM half of which the list lacks (F50).
    expect(r.model.customers!.period.label).toBe("FY2025");
    expect(r.model.customers!.concentration.total).toBeCloseTo(r.ds.customers!.totalsByFiscalYear[2025]!, 0);
    // Working capital stands alone at the dated sheets (F49); the fiscal-year disclosure survives a full notes band (F55).
    expect(r.cim.plan.pages.some((p) => p.draft.id === "S8.2" || p.draft.carries.includes("S8.2"))).toBe(true);
    for (const p of r.cim.plan.pages.filter((x) => x.draft.spec?.notes.note?.startsWith("Figures in USD thousands unless noted"))) expect(p.draft.spec!.notes.note).toContain("Fiscal year ends June 30.");
    // The leading six months before the first full fiscal year are left out, and the warning says so (F56).
    expect(r.ds.warnings.some((w) => /FY2023 covers 6 months .*before the first full fiscal year/.test(w))).toBe(true);
    expect(r.ds.warnings.some((w) => /FY2023 covers 6 months .*carried as YTD/.test(w))).toBe(false);
  }, 600_000);

  it("builds one full fiscal year plus YTD months (14 and 18 months)", async () => {
    for (const months of [14, 18]) {
      const r = await build(midYear(months));
      expectDelivered(r);
      // With no prior-year LTM and one fiscal year there is no like-for-like growth to head a column with (F52).
      const qs = r.cim.plan.pages.find((p) => p.draft.id === "S1.1")!.draft.spec!.rows.flatMap((row) => row.columns.flatMap((c) => c.blocks)).find((b) => b.kind === "numTable")!;
      expect(qs.kind === "numTable" && qs.spec.cols.some((c) => /y\/y|CAGR/.test(c.head ?? ""))).toBe(false);
      // Revenue per listed customer is n.a. on YTD columns and on an LTM that reaches into a year the list does not cover (F50).
      for (const c of r.model.columns.filter((x) => x.ref.kind === "ytd" || x.ref.kind === "ltm")) expect(r.model.periods[c.key]!.kpis.revenue_per_customer).toBeUndefined();
    }
  }, 900_000);

  it("reads an older fiscal year from the annual export beside a grid of the two recent years (QA round 3 F44)", async () => {
    const r = await build(mixedOlderAnnual());
    expectDelivered(r);
    expect(r.ds.monthly!.months[0]!.key).toBe("2024-01");
    expect(r.model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).map((c) => c.label)).toEqual(["FY2023", "FY2024", "FY2025"]);
    // FY2023 is the annual export's, in the engine and in the workbook alike (the verifier compares every cell).
    expect(r.model.periods.FY2023!.pnl.revenue).toBeCloseTo(r.ds.pnl[2023]!.revenue, 6);
    expect(r.model.periods.FY2023!.revenueLines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(r.ds.pnl[2023]!.revenue, 6);
    // C04 ties the fiscal years the grid covers; the annual year has no months to tie.
    expect(r.model.checks.find((c) => c.id === "C04")!.status).toBe("OK");
    expect(r.model.masterCheck).not.toMatch(/failing/);
  }, 600_000);

  it("runs on full fiscal years when the monthly export stops before a year the annual export covers in full (F44)", async () => {
    const r = await build(annualNewer());
    expectDelivered(r);
    expect(r.ds.sourceGranularity).toBe("annual");
    expect(r.model.columns.some((c) => c.ref.kind === "ltm")).toBe(false);
    expect(r.model.periods.FY2025!.pnl.revenue).toBeCloseTo(3_040_800, 0);
    expect(r.ds.warnings.some((w) => /runs to Jun-25, but .* covers FY2025 in full/.test(w))).toBe(true);
    expect(r.ds.warnings.some((w) => /carried as YTD/.test(w))).toBe(false);
  }, 600_000);

  it("builds a grid of exactly twelve months, with and without the customer list (F45)", async () => {
    for (const customers of [true, false]) {
      const r = await build(monthly12({ customers }));
      expectDelivered(r, 12);
      expect(r.ds.monthly!.months).toHaveLength(12);
      expect(!!r.model.customers).toBe(customers);
    }
  }, 900_000);

  it("builds the Summary and the deck from one or two years of annual statements (F46)", async () => {
    for (const n of [1, 2] as const) {
      const r = await build(annualYears(n));
      expectDelivered(r, 12);
      expect(r.ds.years).toHaveLength(n);
    }
  }, 900_000);

  it("prints no peak-to-trough multiple when a month has no revenue (F47)", async () => {
    const r = await build(zeroRevenueMonths());
    expectDelivered(r);
    expect(r.model.monthly!.series.revenue![12]).toBe(0);
    expect(r.text).not.toMatch(/Infinity|NaN/);
  }, 600_000);

  it("leaves Proof of Cash out when the bank months fall outside the P&L months", async () => {
    const r = await build(bankOutsideGrid());
    expectDelivered(r);
    expect(r.model.modules.built).not.toContain("Proof of Cash");
    expect(r.model.modules.omitted).toContainEqual({ id: "Proof of Cash", reason: "Bank months outside the P&L months" });
    expect(r.model.checks.find((c) => c.id === "C14")).toMatchObject({ status: "n.a.", note: "Bank months outside the P&L months" });
    expect(r.ds.warnings.some((w) => /outside the P&L months, so there is no proof of cash/.test(w))).toBe(true);
  }, 600_000);
});
