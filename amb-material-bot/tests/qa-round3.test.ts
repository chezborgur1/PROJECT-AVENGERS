// QA round 3 fixes that the Ridgeline sample cannot show on its own: each
// case is built small, from the function that had the defect. The period
// shapes that broke the workbook (mixed annual and monthly sources, a
// 12-month grid, one or two annual years, a month without revenue) run end
// to end in tests/period-shapes.test.ts.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PptxGenJS } from "../src/cim/design.ts";
import { CONVERSION_ATTEMPTS, chartFrames, emptyChartFrames, renderOutputs, type ChartFrame } from "../src/cim/render.ts";
import { IntakeWireSchema, loadIntakeFile, stripNulls } from "../src/ingest/intake.ts";
import { Brief, latestKpi } from "../src/cim/brief.ts";
import { buildContext } from "../src/cim/context.ts";
import { quickStatsOperating } from "../src/cim/exhibits.ts";
import type { KpiSeries } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { realEstateReason } from "../src/model/checks.ts";
import { depreciationProxySource } from "../src/ingest/adjustments.ts";
import { runModel } from "../src/model/engine.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { lintText } from "../src/cim/copy.ts";
import { indefinite } from "../src/util/format.ts";
import { sampleRow, tmpDir } from "./helpers.ts";

const row = sampleRow();
const firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };

const hasPyMuPdf = (() => {
  try {
    execFileSync("python3", ["-c", "import pymupdf"], { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
})();

/** A two-slide deck whose second slide carries one bar chart. */
async function deckWithChart(dir: string): Promise<string> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.addSlide().addText("Cover", { x: 1, y: 1, w: 4, h: 1 });
  pptx.addSlide().addChart(pptx.ChartType.bar, [{ name: "Revenue", labels: ["FY2023", "FY2024", "FY2025"], values: [2406.8, 2718.6, 3040.8] }], { x: 1, y: 1.5, w: 5, h: 3 });
  const file = path.join(dir, "deck.pptx");
  await pptx.writeFile({ fileName: file });
  return file;
}

/** A PDF standing in for LibreOffice's: one page per slide, with bars drawn inside each frame only when `draw` says so. */
function fakePdf(file: string, frames: ChartFrame[], draw: boolean): void {
  const script = [
    "import sys, json, pymupdf",
    "d = pymupdf.open()",
    "frames = json.loads(sys.argv[2])",
    "for p in range(2):",
    "    page = d.new_page(width=960, height=540)",
    "    for f in frames:",
    "        if f['page'] == p + 1 and sys.argv[3] == '1':",
    "            for k in range(5):",
    "                x = f['x'] + 10 + k * 30",
    "                page.draw_rect(pymupdf.Rect(x, f['y'] + 40, x + 20, f['y'] + f['h'] - 10), fill=(0.48, 0, 0))",
    "d.save(sys.argv[1])",
  ].join("\n");
  execFileSync("python3", ["-c", script, file, JSON.stringify(frames), draw ? "1" : "0"]);
}

describe("CIM PDF: a chart LibreOffice drops is caught (F26)", () => {
  it("reads each chart frame from the deck, in points on its page", async () => {
    const frames = await chartFrames(await deckWithChart(tmpDir("amb-render-")));
    expect(frames).toEqual([{ page: 2, x: 72, y: 108, w: 360, h: 216 }]);
  });

  it.skipIf(!hasPyMuPdf)("finds a frame with no drawings inside it", async () => {
    const dir = tmpDir("amb-render-");
    const frames = await chartFrames(await deckWithChart(dir));
    const pdf = path.join(dir, "deck.pdf");
    fakePdf(pdf, frames, false);
    expect(emptyChartFrames(pdf, frames).empty).toEqual(frames);
    fakePdf(pdf, frames, true);
    const drawn = emptyChartFrames(pdf, frames);
    expect(drawn.empty).toEqual([]);
    expect(drawn.counts[0]).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!hasPyMuPdf)("converts again when a chart is blank and keeps the PDF once every chart is drawn", async () => {
    const dir = tmpDir("amb-render-");
    const deck = await deckWithChart(dir);
    const frames = await chartFrames(deck);
    let calls = 0;
    const result = await renderOutputs(deck, { pdf: true, png: false }, (file) => {
      calls++;
      const pdf = file.replace(/\.pptx$/, ".pdf");
      fakePdf(pdf, frames, calls === 2);
      return { pdf };
    });
    expect(calls).toBe(2);
    expect(result.error).toBeUndefined();
    expect(result.pdf).toBe(path.join(dir, "deck.pdf"));
    expect(result.notes.join(" ")).toMatch(/left a chart blank on page 2; converted again with a fresh profile/);
  });

  it.skipIf(!hasPyMuPdf)("withholds the PDF and page images, with an error, when a chart stays blank", async () => {
    const dir = tmpDir("amb-render-");
    const deck = await deckWithChart(dir);
    const frames = await chartFrames(deck);
    // Page images from an earlier run must not stand in for the deck just built.
    const pages = path.join(dir, "deck pages");
    fs.mkdirSync(pages);
    fs.writeFileSync(path.join(pages, "page-01.png"), "old");
    let calls = 0;
    const result = await renderOutputs(deck, { pdf: true, png: true }, (file) => {
      calls++;
      const pdf = file.replace(/\.pptx$/, ".pdf");
      fakePdf(pdf, frames, false);
      return { pdf };
    });
    expect(calls).toBe(CONVERSION_ATTEMPTS);
    expect(result.pdf).toBeUndefined();
    expect(result.pngs).toEqual([]);
    expect(result.error).toMatch(/^PDF not written: LibreOffice left the chart on page 2 blank in 3 conversions/);
    expect(fs.existsSync(path.join(dir, "deck.pdf"))).toBe(false);
    expect(fs.readdirSync(pages)).toEqual([]);
  });
});

describe("intake transcription never forces a fact (F49)", () => {
  it("lets the owner's name and role, the transition and the reason for sale be null when the notes do not say", () => {
    const owner = IntakeWireSchema.shape.owner.shape;
    expect(owner.name.safeParse(null).success).toBe(true);
    expect(owner.role.safeParse(null).success).toBe(true);
    expect(owner.transition.shape.description.safeParse(null).success).toBe(true);
    expect(IntakeWireSchema.shape.reasonForSale.shape.text.safeParse(null).success).toBe(true);
    expect(IntakeWireSchema.shape.company.shape.legalName.safeParse(null).success).toBe(true);
  });

  it("reads a blank string as absent, so no copy prints an empty subject, and fills the legal name from the request", () => {
    const dir = tmpDir("amb-intake-");
    const file = path.join(dir, "intake.json");
    fs.writeFileSync(file, JSON.stringify({ company: { legalName: "" }, owner: { name: "", role: " ", responsibilities: [], transition: { description: "" } }, reasonForSale: { text: "" } }));
    const { facts } = loadIntakeFile(file, "Blank Name HVAC LLC");
    expect(facts.company.legalName).toBe("Blank Name HVAC LLC");
    expect(facts.owner.name).toBeUndefined();
    expect(facts.owner.role).toBeUndefined();
    expect(facts.owner.transition.description).toBeUndefined();
    expect(facts.reasonForSale.text).toBeUndefined();
    expect(stripNulls({ list: ["a", "", " "], keep: "x", drop: "" })).toEqual({ list: ["a"], keep: "x" });
  });
});

describe("articles before figures (F51)", () => {
  it("reads 8, 11 and 18 with a vowel sound and anything else with 'a'", () => {
    for (const f of ["11.4%", "8.9%", "18%", "$80K", "$11,400", "18,000", "$85,000"]) expect(indefinite(f)).toBe("an");
    for (const f of ["12.4%", "110%", "1,100", "$97.8K", "1.8%", "118"]) expect(indefinite(f)).toBe("a");
  });

  it("templates choose the article from the resolved figure, so the lint never flags them", () => {
    const b = new Brief();
    b.add("adjMargin.latest", "11.4%", 0.114, "Adj. EBITDA margin");
    expect(`${b.article("adjMargin.latest")} {{adjMargin.latest}} margin`).toBe("an {{adjMargin.latest}} margin");
    expect(lintText("Adj. EBITDA was $327.9K, a 11.4% margin.", "t").some((i) => /use "an"/.test(i.issue))).toBe(true);
    expect(lintText("Adj. EBITDA was $327.9K, an 11.4% margin.", "t")).toEqual([]);
  });
});

describe("KPI values (F52, F55)", () => {
  const series = (values: Record<string, number>, definition?: string): KpiSeries => ({ key: "k", label: "Google reviews", unit: "count", values, source: "intake", evidence: "management_representation", ...(definition ? { definition } : {}) });

  it("takes the latest value by the date each period ends, not by the key's spelling", () => {
    expect(latestKpi(series({ FY2024: 100, FY2025: 120, "AT2026-09-21": 150 }))).toBe(150);
    expect(latestKpi(series({ "AT2025-06-30": 90, FY2025: 120 }))).toBe(120);
    // A June year-end: FY2025 ends Jun-25, before a December point reading.
    expect(latestKpi(series({ FY2025: 120, "AT2024-12-31": 80 }), 6)).toBe(120);
    // On the same date the point reading wins.
    expect(latestKpi(series({ FY2025: 120, "AT2025-12-31": 125 }))).toBe(125);
  });

  it("prints a review count with '+' only when the source states it as a floor", () => {
    const ds = ridgelineDataset();
    const reviews = ds.kpis!.find((x) => x.key === "google_reviews")!;
    const text = (d: typeof ds) => {
      const ctx = buildContext({ row, ds: d, out: runModel(d, defaultAssumptions(d, row)), copy: { open_questions: [] }, firm, date: new Date("2026-09-29T12:00:00Z") });
      const block = quickStatsOperating(ctx, 4)!;
      return block.kind === "numTable" ? block.spec.rows.map((r) => r.text ?? "").join(" | ") : "";
    };
    expect(text(ds)).toContain("900+ reviews");
    reviews.definition = "Count on the Google profile";
    reviews.values = { "AT2026-09-21": 250 };
    expect(text(ds)).toContain("250 reviews");
    expect(text(ds)).not.toContain("250+");
  });
});

describe("one label, one definition; modules and sources say what is true (F53, F54, F57)", () => {
  const ds = ridgelineDataset();
  const out = runModel(ds, defaultAssumptions(ds, row));

  it("gives the Headcount labor-cost ratio the P&L Summary's definition, owner payroll taxes excluded", () => {
    const ltm = out.columns.find((c) => c.ref.kind === "ltm" && !c.priorYear)!;
    expect(out.headcount!.loadRatios.laborCostPctRevenue).toBeCloseTo(out.periods[ltm.key]!.kpis.labor_cost_pct_revenue!, 10);
    expect(out.periods[ltm.key]!.ownerPayrollTaxes).toBeGreaterThan(0);
  });

  it("never lists a Real Estate module the workbook does not build, and says why by the premises arrangement", () => {
    expect(out.modules.built).not.toContain("Real Estate");
    expect(realEstateReason("Owned by seller, offered for lease")).toBe("No Real Estate tab: not built yet; premises owned by seller, offered for lease");
    expect(realEstateReason("Leased from third party")).toBe("No Real Estate tab (premises leased from a third party)");
    const c31 = out.checks.find((c) => c.id === "C31")!;
    expect(c31.status).toBe("n.a.");
    expect(c31.note).toBe(realEstateReason(out.assumptions!.deal.premisesArrangement));
  });

  it("words the capital-reserve proxy by the years it averages", () => {
    expect(depreciationProxySource([2025])).toBe("FY2025 depreciation expense");
    expect(depreciationProxySource([2024, 2025])).toBe("Two-year average of depreciation expense, FY2024–FY2025");
    expect(depreciationProxySource([2023, 2024, 2025])).toBe("Three-year average of depreciation expense, FY2023–FY2025");
  });
});

describe("Debt-Like Items standard list (F13)", () => {
  it("lists every 5.6 standard item no source balance covers, as Open, and none the sources already show", () => {
    const model = runModel(ridgelineDataset(), defaultAssumptions(ridgelineDataset(), row));
    const listed = model.debtLike!.checklist!.map((x) => x.item);
    // The sample's balance sheet shows vehicle loans, an SBA loan and a credit card: those items are not repeated.
    for (const covered of ["Vehicle and equipment loans", "SBA loans", "Credit-card balances"]) expect(listed).not.toContain(covered);
    for (const open of ["PPP or EIDL balances", "Capital leases", "Shareholder loans", "Tax liens", "Known litigation"]) expect(listed).toContain(open);
    expect(model.debtLike!.checklist!.find((x) => x.item === "Personal guarantees")).toEqual({ item: "Personal guarantees", memo: true });
    // Open items never move a balance.
    expect(model.debtLike!.debtLike).toBe(0);
  });
});
