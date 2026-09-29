// QA round 3 fixes that the Ridgeline sample cannot show on its own: each
// case is built small, from the function that had the defect. The period
// shapes that broke the workbook (mixed annual and monthly sources, a
// 12-month grid, one or two annual years, a month without revenue) run end
// to end in tests/period-shapes.test.ts.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { chart, Deck, notesLineCount, obsKeyMismatch, PptxGenJS, withoutObsLetter, type Block, type PageSpec } from "../src/cim/design.ts";
import { fitNotes, numberFootnotes } from "../src/cim/sections/common.ts";
import { CONVERSION_ATTEMPTS, chartFrames, emptyChartFrames, renderOutputs, type ChartFrame } from "../src/cim/render.ts";
import { IntakeWireSchema, loadIntakeFile, stripNulls } from "../src/ingest/intake.ts";
import { Brief, latestKpi, payGroups } from "../src/cim/brief.ts";
import { at, buildContext, nonGaap, PER_MANAGEMENT, standardNote } from "../src/cim/context.ts";
import { fieldWagesTie, headcountByDepartment, quickStatsOperating } from "../src/cim/exhibits.ts";
import type { KpiSeries } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { realEstateReason } from "../src/model/checks.ts";
import { depreciationProxySource, excessOverRunRate, splitByWeights } from "../src/ingest/adjustments.ts";
import { runModel } from "../src/model/engine.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { customerNounVariant, lintCopy, lintText } from "../src/cim/copy.ts";
import { chartXml, type ChartPlacement } from "../src/model/charts.ts";
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

describe("MC-R2 stacks to total revenue (F22)", () => {
  it("draws every revenue line and the discounts, so each month's segments add to total revenue", () => {
    const model = runModel(ridgelineDataset(), defaultAssumptions(ridgelineDataset(), row));
    const mix = model.charts!.find((c) => c.id === "MC-R2")!;
    const drawn = mix.series.filter((s) => s.plotted !== false);
    const total = mix.series.find((s) => s.key === "revenue")!;
    expect(drawn.map((s) => s.name)).toContain("Discounts and refunds");
    total.values.forEach((v, i) => expect(drawn.reduce((s, x) => s + x.values[i]!, 0)).toBeCloseTo(v, 6));
    expect(mix.note).not.toMatch(/not drawn/);
  });

  it("parts a mix's segments with a hairline but gives a diverging stack none, so an empty month draws nothing on the axis", () => {
    const placement = (separators: boolean): ChartPlacement => ({
      id: "t",
      fromRow: 1,
      toRow: 10,
      heightPt: 100,
      kind: "bar",
      grouping: "stacked",
      separators,
      categories: { ref: "'T'!$A$1:$B$1", labels: ["Jan-25", "Feb-25"] },
      series: [{ name: "Losses", nameRef: "'T'!$A$2", ref: "'T'!$B$2:$C$2", values: [0, -1], color: "5E5552" }],
      valueAxis: { visible: true, format: "0" },
      categoryAxis: true,
      legend: false,
    });
    const ser = (xml: string) => /<c:ser>[\s\S]*?<\/c:ser>/.exec(xml)![0];
    expect(ser(chartXml(placement(true)))).toMatch(/<a:ln w="\d+"><a:solidFill>/);
    expect(ser(chartXml(placement(false)))).toContain("<a:ln><a:noFill/></a:ln>");
  });
});

describe("one-time add-backs by month (F23)", () => {
  it("puts a non-recurring amount in the months its account ran above its median, not across the year", () => {
    const months = Array.from({ length: 12 }, (_, i) => ({ key: `2024-${String(i + 1).padStart(2, "0")}`, fiscalYear: 2024 }));
    // Legal fees run at $1K a month, $13K in June and July: the $24K settlement is the excess, $12K in each.
    const shape = Object.fromEntries(months.map((m) => [m.key, m.key === "2024-06" || m.key === "2024-07" ? 13_000 : 1_000]));
    const weights = excessOverRunRate({ months } as unknown as Parameters<typeof excessOverRunRate>[0], [2024], shape);
    const split = splitByWeights(24_000, weights);
    expect(split["2024-06"]).toBeCloseTo(12_000, 6);
    expect(split["2024-07"]).toBeCloseTo(12_000, 6);
    expect(split["2024-01"]).toBe(0);
    // A flat account keeps its own shape.
    const flat = excessOverRunRate({ months } as unknown as Parameters<typeof excessOverRunRate>[0], [2024], Object.fromEntries(months.map((m) => [m.key, 1_000])));
    expect(splitByWeights(12_000, flat)["2024-03"]).toBeCloseTo(1_000, 6);
  });
});

describe("observation letters agree with the tables (F27)", () => {
  const page = (obs: string[], keyed: (string | undefined)[]): PageSpec => ({
    id: "S5.1",
    section: "Operations",
    title: "t",
    notes: { source: "Source: x" },
    rows: [
      {
        columns: [
          {
            span: [1, 6],
            blocks: [
              {
                kind: "numTable",
                header: { title: "Compensation", units: "($000s)" },
                spec: { name: "c", cols: [{ w: 2, kind: "label" }, { w: 0.6, kind: "num", head: "FY25" }, { w: 0.36, kind: "obs", head: "Obs." }], rows: keyed.map((k, i) => ({ type: "line" as const, label: `Row ${i}`, key: `r${i}`, vals: ["1"], obs: k })) },
              },
            ],
          },
          { span: [7, 12], blocks: [{ kind: "observations", header: { title: "Observations", units: "" }, items: obs.map((key) => ({ key, lead: "Lead", body: "body." })) }] },
        ],
      },
    ],
  });

  it("finds a table letter no observation is listed for, and a listed observation keyed to no row", () => {
    expect(obsKeyMismatch(page(["A", "B", "C"], ["A", "B", "C"]))).toBeUndefined();
    expect(obsKeyMismatch(page(["A", "B"], ["A", "B", "C"]))).toBe("keyed in a table but not listed: C");
    expect(obsKeyMismatch(page(["A", "B"], ["A", undefined, undefined]))).toBe("listed but keyed to no row: B");
    // Two observations about one row share its cell.
    expect(obsKeyMismatch(page(["A", "B"], ["A,B"]))).toBeUndefined();
  });

  it("takes a dropped observation's letter out of the tables with it", () => {
    const fixed = withoutObsLetter(page(["A", "B"], ["A", "B", "C"]), "C");
    expect(obsKeyMismatch(fixed)).toBeUndefined();
    const shared = withoutObsLetter(page(["A"], ["A,B"]), "B");
    expect(obsKeyMismatch(shared)).toBeUndefined();
  });
});

describe("compensation reconciles to the P&L wage lines (F31)", () => {
  const firm = { name: "AMB", contact: "A", email: "a@b.c", phone: "1" };
  const context = (ds = ridgelineDataset()) => {
    const row = sampleRow();
    return buildContext({ row, ds, out: runModel(ds, defaultAssumptions(ds, row)), copy: { open_questions: [] }, firm, date: new Date("2026-09-29T12:00:00Z") });
  };

  it("groups field departments against office and management, as the P&L books their wages", () => {
    const ctx = context();
    const groups = payGroups(ctx.out.headcount!.byDepartment);
    // A joined name too long for one line of the label column gives way to a short one; the departments stay listed.
    expect(groups.map((g) => [g.key, g.department, g.departments])).toEqual([
      ["field", "Field employees", ["Field service", "Installation"]],
      ["office", "Office and management", ["Office", "Management"]],
    ]);
    // Register wages of the field row are the P&L technician wages: service $513.3K plus install $135.6K.
    const technician = Object.entries(at(ctx, ctx.fy.at(-1)!).accountLines).find(([a]) => /technician wages/i.test(a))!;
    expect(groups[0]!.wages).toBeCloseTo(technician[1], 0);
    const block = headcountByDepartment(ctx, 5)!;
    expect(block.kind === "numTable" && block.spec.rows.map((r) => r.key)).toEqual(["dept.field", "dept.office", "dept.total"]);
    // Named by the register's roles, as the organization table names them (verification F37).
    expect(fieldWagesTie(ctx)).toBe("Service and install technician wages ($648.9K, FY2025) are the P&L technician wages; the table adds employer costs.");
    // The brief quotes pay only by those rows, so prose and table cannot disagree.
    expect(ctx.brief.has("hc.group.field.pctRevenue")).toBe(true);
    expect(ctx.brief.list().some((f) => /^hc\.dept\..*\.(avgComp|pctRevenue)$/.test(f.key))).toBe(false);
  });

  it("states the bridge only when the register ties to the wage account", () => {
    const ds = ridgelineDataset();
    for (const e of ds.payroll!.employees) if (e.department === "Installation") for (const y of Object.keys(e.wagesByFiscalYear)) e.wagesByFiscalYear[Number(y)] = e.wagesByFiscalYear[Number(y)]! * 1.5;
    expect(fieldWagesTie(context(ds))).toBeUndefined();
  });

  it("keeps a register's own departments when none is a field department, merging any under three people", () => {
    const d = (department: string, count: number) => ({ department, count, avgFte: count, totalComp: count * 50_000, avgComp: 50_000, pctRevenue: count / 100, avgTenureYears: 2, wages: count * 45_000 });
    const groups = payGroups([d("Sales", 6), d("Operations", 4), d("Finance", 1)]);
    expect(groups.map((g) => [g.key, g.department, g.count])).toEqual([
      ["Sales", "Sales", 6],
      ["Operations", "Operations and finance", 5],
    ]);
  });
});

describe("named footnote markers (F33)", () => {
  const obs = (body: string): Block => ({ kind: "observations", header: { title: "Observations", units: "" }, items: [{ key: "A", lead: "Two property managers", body }] });

  it("numbers {{fn.mgmt}} against the page's own footnotes, adding the per-management note when missing", () => {
    const page = [obs("have asked for quotes on more buildings {{fn.mgmt}}.")];
    const footnotes = numberFootnotes(page, ["Residential households are not listed individually.", "Listed customers billed at any time in FY2025."]);
    expect(footnotes).toEqual(["Residential households are not listed individually.", "Listed customers billed at any time in FY2025.", PER_MANAGEMENT]);
    expect(page[0]!.kind === "observations" && page[0]!.items[0]!.body).toBe("have asked for quotes on more buildings (3).");
    const first = [obs("renew at about 82% a year {{fn.mgmt}}.")];
    expect(numberFootnotes(first, [PER_MANAGEMENT])).toEqual([PER_MANAGEMENT]);
    expect(first[0]!.kind === "observations" && first[0]!.items[0]!.body).toBe("renew at about 82% a year (1).");
  });

  it("lints a typed footnote number or an unknown marker in the copy", () => {
    const copy = { s6_1: { observations: [{ row: "is.revenue", lead: "Two managers", body: "asked for quotes (1)." }, { row: "is.gp", lead: "Members", body: "renew {{fn.owner}}." }] }, open_questions: [] };
    const issues = lintCopy(copy as never).map((i) => i.issue);
    expect(issues.some((i) => i.startsWith('footnote marker "(1)" typed as a number'))).toBe(true);
    expect(issues.some((i) => i.startsWith("unknown footnote marker {{fn.owner}}"))).toBe(true);
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "samples/project-ridgeline/cim-copy.fixture.json"), "utf8")).copy;
    expect(lintCopy(fixture).filter((i) => i.issue.includes("footnote marker"))).toEqual([]);
  });
});

describe("notes band keeps the unaudited basis and periods longest (F36)", () => {
  it("names only the measures the deck shows, in the Note line, and cuts it after the source periods", () => {
    const ds = ridgelineDataset();
    const ctx = buildContext({ row, ds, out: runModel(ds, defaultAssumptions(ds, row)), copy: { open_questions: [] }, firm, date: new Date("2026-09-29T12:00:00Z") });
    expect(ctx.pf).toBeUndefined();
    expect(nonGaap(ctx)).toMatch(/^Adj\. EBITDA and SDE are non-GAAP measures; see \{\{page:S7\.1\}\} for the reconciliation to net income\./);
    const notes = {
      source: "Company financial statements (QuickBooks Online), FY2023–FY2025; Company customer list; Payroll register; Management; AMB Advisory analysis.",
      note: standardNote(ctx, `Employee counts are at fiscal year-end and exclude the owner. ${nonGaap(ctx)}`),
      footnotes: [PER_MANAGEMENT],
    };
    const fitted = fitNotes(ctx, "S1.1", notes);
    expect(notesLineCount(fitted)).toBeLessThanOrEqual(3);
    // The optional sentences go first; the unaudited basis, the non-GAAP statement and the period range stay.
    expect(fitted.note).toContain("have not been independently audited.");
    expect(fitted.note).toContain("are non-GAAP measures");
    expect(fitted.source).toContain("FY2023–FY2025");
  });
});

describe("waterfall colours and thin-bar labels (F39)", () => {
  it("colours totals, increases and decreases by role and lifts a thin step's figure above its bar", async () => {
    const deck = new Deck("t");
    const slide = deck.pptx.addSlide();
    chart(deck, slide, 1, 1, 6, { type: "waterfall", labels: ["Reported EBITDA", "Normalization", "Owner pay", "SDE", "Replacement", "Adj. EBITDA"], steps: [{ value: 320, total: true }, { value: 28 }, { value: 214 }, { value: 562, total: true }, { value: -109 }, { value: 386, total: true }] });
    const zip = await JSZip.loadAsync(await deck.write());
    const xml = await zip.file(Object.keys(zip.files).find((f) => /charts\/chart\d+\.xml$/.test(f))!)!.async("string");
    const sers = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/g)!;
    const fill = (s: string) => /<c:spPr>\s*<a:solidFill>\s*<a:srgbClr val="([0-9A-F]{6})"/.exec(s)?.[1];
    expect([fill(sers[1]!), fill(sers[2]!), fill(sers[3]!)]).toEqual(["7B0000", "DCC7C4", "5E5552"]);
    expect(xml).not.toContain("B5727A");
    // The 28 step is under 6% of the axis: its own label is removed and the carrier series prints "28" at its base, above the bar.
    expect(sers[2]).toContain('<c:dLbl><c:idx val="1"/><c:delete val="1"/></c:dLbl>');
    expect(sers[4]).toMatch(/<c:dLbl><c:idx val="1"\/><c:numFmt formatCode="&quot;28&quot;"[\s\S]*?<c:dLblPos val="inBase"\/><c:showLegendKey val="0"\/><c:showVal val="1"\/>/);
  });

  it("patches the charts of a second deck built in the same process (pptxgenjs numbers chart files globally)", async () => {
    const waterfallXml = async () => {
      const deck = new Deck("t");
      chart(deck, deck.pptx.addSlide(), 1, 1, 6, { type: "hbar", labels: ["FY2024", "FY2025"], values: [1, 2] });
      chart(deck, deck.pptx.addSlide(), 1, 1, 6, { type: "waterfall", labels: ["A", "B", "C"], steps: [{ value: 320, total: true }, { value: -109 }, { value: 211, total: true }] });
      const zip = await JSZip.loadAsync(await deck.write());
      const files = Object.keys(zip.files).filter((f) => /charts\/chart\d+\.xml$/.test(f)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
      return zip.file(files[1]!)!.async("string");
    };
    await waterfallXml();
    const xml = await waterfallXml();
    // The decrease series of the second deck's waterfall carries its patched label format.
    expect(xml.match(/<c:ser>[\s\S]*?<\/c:ser>/g)![3]).toContain("(#,##0);(#,##0);&quot;&quot;");
  });
});

describe("one noun for customers (F37)", () => {
  it("flags an account or client in the customer sense and leaves the ledger sense alone", () => {
    expect(customerNounVariant("the top 10 accounts hold 19.3%", "customer")).toBe("top 10 accounts");
    expect(customerNounVariant("an account churn of 7.9%", "customer")).toBe("account churn");
    expect(customerNounVariant("Listed clients are 26.7% of revenue", "customer")).toBe("clients");
    expect(customerNounVariant("Accounts receivable held at 30 days; the P&L Interest Income account", "customer")).toBeUndefined();
    expect(customerNounVariant("general-ledger account detail and 2 smaller accounts payable", "customer")).toBeUndefined();
    expect(customerNounVariant("The top 10 customers hold 19.3%", "client")).toBe("customers");
  });

  it("holds the copy to the noun the customer list uses", () => {
    const ds = ridgelineDataset();
    const ctx = buildContext({ row, ds, out: runModel(ds, defaultAssumptions(ds, row)), copy: { open_questions: [] }, firm, date: new Date("2026-09-29T12:00:00Z") });
    const copy = { s4_2: { observations: [{ row: "rc.end", lead: "Listed accounts rose to 52", body: "in FY2025." }] }, open_questions: [] };
    expect(lintCopy(copy as never, ctx.brief).map((i) => i.issue)).toContain('"Listed accounts": the deck calls customers "customer"');
  });
});

describe("S6.4 trailing line and bar labels (F39)", () => {
  it("moves a bar's label inside its top when the trailing line runs just above the bar, and leaves the others outside", async () => {
    const deck = new Deck("t");
    const values = [180, 170, 160, 175, 195, 230, 250, 235, 210, 185, 190, 225, 200, 190];
    // The trailing line at 205 sits just above the 200 bar (index 12) and well above none of the tall bars.
    const trailing = [null, null, null, null, null, null, null, null, null, null, null, 200.4, 205, 206];
    chart(deck, deck.pptx.addSlide(), 1, 1, 11, { type: "monthly", labels: values.map((_, i) => `M${i}`), values, trailing }, 2.6);
    const zip = await JSZip.loadAsync(await deck.write());
    const xml = await zip.file(Object.keys(zip.files).find((f) => /charts\/chart\d+\.xml$/.test(f))!)!.async("string");
    const bars = xml.match(/<c:ser>[\s\S]*?<\/c:ser>/g)![0]!;
    const inside = [...bars.matchAll(/<c:dLbl><c:idx val="(\d+)"\/>[\s\S]*?<c:dLblPos val="inEnd"\/>/g)].map((m) => Number(m[1]));
    expect(inside).toContain(12);
    expect(inside).toContain(13);
    expect(inside).not.toContain(6);
    expect(inside).not.toContain(0);
  });
});

describe("one name for the field workforce (F37)", () => {
  it("flags field technicians, staff or team where the exhibits say field employees", () => {
    expect(lintText("The 18 field technicians average 6.4 years of tenure.", "t").map((i) => i.issue)).toContain('"field technicians": the deck says "field employees"');
    expect(lintText("The field team of 18 is paid hourly.", "t").some((i) => /field employees/.test(i.issue))).toBe(true);
    expect(lintText("The 18 field employees average 6.4 years of tenure.", "t")).toEqual([]);
  });
});
