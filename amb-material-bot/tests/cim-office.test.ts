// The CIM package against what Microsoft PowerPoint accepts, not only the ISO
// schemas and LibreOffice. PowerPoint offered to repair the Ridgeline deck
// that LibreOffice opened: pptxgenjs 4.0.1 writes the S6.4 trailing line with
// no <c:grouping> (PowerPoint's repair inserts it), a third axis id on every
// 2D chart that no axis declares, empty numeric cache points for the line's
// first eleven months, an <a:pPr> before every run of a multi-run paragraph,
// table frames whose shape ids collide with the shapes drawn before them, and
// content-type overrides for twenty slide masters the deck does not hold.
// `Deck.write` normalizes the package (src/cim/ooxml.ts) and `officeDefects`,
// which always runs here, proves it; the Open XML SDK validator
// (tools/openxml-validate) runs when `dotnet` is installed and is skipped
// otherwise.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildContext } from "../src/cim/context.ts";
import { renderDeck } from "../src/cim/deck.ts";
import type { ChartSpec } from "../src/cim/design.ts";
import { C, chart, Deck, observations, prose, rect, textTable } from "../src/cim/design.ts";
import { draftCimCopy } from "../src/cim/narrative.ts";
import { normalizeChartXml, normalizeContentTypesXml, normalizeSlideXml, officeDefects } from "../src/cim/ooxml.ts";
import { planDeck } from "../src/cim/planner.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

const months = (n: number) => Array.from({ length: n }, (_, i) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12]}-${23 + Math.floor(i / 12)}`);
const monthlyValues = (n: number) => Array.from({ length: n }, (_, i) => 180 + ((i * 37) % 70));
const trailingOf = (v: number[]) => v.map((_, i) => (i < 11 ? null : Math.round(v.slice(i - 11, i + 1).reduce((s, x) => s + x, 0) / 12)));

/** Every chart `chart()` draws, the S6.4 trailing line included. */
const CHARTS: ChartSpec[] = [
  { type: "twinPanels", panels: [{ caption: "Revenue", labels: ["FY2024", "FY2025"], values: [4100, 4600] }, { caption: "Adj. EBITDA", labels: ["FY2024", "FY2025"], values: [520, 610] }] },
  { type: "bars", grouping: "clustered", series: [{ name: "Revenue", labels: ["FY2023", "FY2024", "FY2025"], values: [3900, 4100, 4600] }] },
  // A stack asked for outside-end labels: PowerPoint refuses those on a stack, so chart() sets them inside.
  { type: "bars", grouping: "stacked", labelPos: "outEnd", series: [{ name: "Service", labels: ["FY2024", "FY2025"], values: [2100, 2300] }, { name: "Install", labels: ["FY2024", "FY2025"], values: [1900, 2200] }] },
  { type: "bars", grouping: "percentStacked", series: [{ name: "Residential", labels: ["FY2024", "FY2025"], values: [60, 58] }, { name: "Commercial", labels: ["FY2024", "FY2025"], values: [40, 42] }] },
  { type: "hbar", labels: ["Labor", "Materials", "Vehicles"], values: [120, -40, 15] },
  { type: "monthly", labels: months(14), values: monthlyValues(14), trailing: trailingOf(monthlyValues(14)) },
  { type: "monthly", labels: months(36), values: monthlyValues(36), trailing: trailingOf(monthlyValues(36)) },
  { type: "monthly", labels: months(12), values: monthlyValues(12) },
  { type: "diverging", labels: ["Q1-25", "Q2-25", "Q3-25", "Q4-25"], wins: [4, 6, 3, 5], losses: [2, 1, 3, 0] },
  { type: "waterfall", labels: ["Reported EBITDA", "Normalization", "Owner pay", "SDE", "Replacement", "Adj. EBITDA"], steps: [{ value: 320, total: true }, { value: 28 }, { value: 214 }, { value: 562, total: true }, { value: -109 }, { value: 386, total: true }] },
];

/** A deck of every chart type, run-in prose, observations and a text table drawn after shapes. */
function everyExhibit(): Deck {
  const deck = new Deck("Office check");
  const s = deck.pptx.addSlide();
  rect(s, 0.5, 0.4, 1.2, 0.05, C.maroon);
  prose(s, 0.5, 0.6, 6, [{ lead: "Staffing.", body: "Of the 23 employees besides the owner, 14 are service technicians." }, { lead: "The owner's role.", body: "Mark Delaney spends about 45 hours a week on estimating." }]);
  rect(s, 7, 0.4, 1.2, 0.05, C.maroon);
  observations(s, 7, 0.6, 5.5, [{ key: "a", lead: "Recurring base.", body: "Maintenance agreements renew each spring." }, { key: "b", lead: "Seasonality.", body: "Summer peaks in cooling repairs." }]);
  textTable(s, 0.5, 3, { colW: [2, 4], head: ["Item", "Detail"], rows: [["Lease", { lead: "Tampa.", body: "Five years, two renewals." }], ["Fleet", "18 vans"]] });
  for (const spec of CHARTS) chart(deck, deck.pptx.addSlide(), 1, 1, 10, spec);
  return deck;
}

async function ridgelineDeck(): Promise<Buffer> {
  const ds = ridgelineDataset();
  const row = sampleRow();
  const out = runModel(ds, defaultAssumptions(ds, row));
  const firm = { name: "AMB Advisory Services", contact: "Frank Moneymaker, Principal", email: "info@ambadvisoryservices.com", phone: "813.364.2178" };
  const date = new Date("2026-10-05T12:00:00Z");
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const { copy } = await draftCimCopy({ row, notes: "", dataset: ds, model: out, firm, date });
    const ctx = buildContext({ row, ds, out, copy, firm, date });
    return await renderDeck(ctx, planDeck(ctx));
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
}

const chartParts = async (buf: Buffer) => {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
  return Promise.all(names.map((f) => zip.file(f)!.async("string")));
};

describe("what PowerPoint repairs in pptxgenjs's own output", () => {
  it("finds every trigger in a deck written by pptxgenjs alone", async () => {
    const raw = (await everyExhibit().pptx.write({ outputType: "nodebuffer" })) as Buffer;
    const defects = (await officeDefects(raw)).join("\n");
    expect(defects).toMatch(/<c:lineChart> has no <c:grouping> first/);
    expect(defects).toMatch(/<c:barChart> names axis \d+, which the chart does not declare/);
    expect(defects).toMatch(/<c:lineChart> series holds c:invertIfNegative/);
    expect(defects).toMatch(/numeric point \d+ holds ""/);
    expect(defects).toMatch(/paragraph\(s\) with <a:pPr> repeated or after a run/);
    expect(defects).toMatch(/shape id [\d, ]+ used more than once/);
    expect(defects).toMatch(/override\(s\) for parts the deck does not hold \(ppt\/slideMasters\/slideMaster2\.xml/);
    expect(defects).toMatch(/folder entr/);
  });

  it("finds a stacked bar with labels outside the end, which pptxgenjs lets through", async () => {
    const deck = new Deck("t");
    deck.pptx.addSlide().addChart("bar", [{ name: "A", labels: ["x", "y"], values: [1, -1] }, { name: "B", labels: ["x", "y"], values: [2, 1] }], { x: 1, y: 1, w: 4, h: 3, barGrouping: "stacked", showValue: true, dataLabelPosition: "outEnd" });
    expect((await officeDefects(await deck.write())).join("\n")).toMatch(/a stacked bar chart with labels at the outside end/);
  });
});

describe("Deck.write", () => {
  it("writes a deck of every exhibit with none of them", async () => {
    const buf = await everyExhibit().write();
    expect(await officeDefects(buf)).toEqual([]);
    const charts = await chartParts(buf);
    // The trailing line keeps its gaps as points left out, and says it is a standard line.
    const combo = charts.find((x) => x.includes("<c:lineChart>") && x.includes('<c:ptCount val="14"/>'))!;
    expect(combo).toContain('<c:lineChart><c:grouping val="standard"/>');
    expect(/<c:lineChart>[\s\S]*?<c:val>[\s\S]*?<c:ptCount val="14"\/>([\s\S]*?)<\/c:numCache>/.exec(combo)![1]!.match(/<c:pt /g)).toHaveLength(3);
    // Wins over losses: a clustered pair overlapped in full, so its labels may sit outside the ends.
    const diverging = charts.find((x) => x.includes("<c:v>Wins</c:v>"))!;
    expect(diverging).toContain('<c:grouping val="clustered"/>');
    expect(diverging).toContain('<c:overlap val="100"/>');
    // The stack asked for outside-end labels carries them inside the end.
    const stack = charts.find((x) => x.includes("<c:v>Install</c:v>"))!;
    expect(stack).toContain('<c:dLblPos val="inEnd"/>');
  });

  it("writes the Ridgeline deck with none of them, [Content_Types].xml first and no folder entries", async () => {
    const buf = await ridgelineDeck();
    expect(await officeDefects(buf)).toEqual([]);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");
    expect(Object.values(zip.files).some((f) => f.dir)).toBe(false);
  }, 60_000);
});

describe("the normalizers", () => {
  it("fold a paragraph's properties into one, first, later values winning, and renumber colliding shape ids", () => {
    const xml =
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text 0"/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/>' +
      '<a:p><a:pPr algn="l" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>Lead. </a:t></a:r><a:pPr algn="ctr"><a:spcAft><a:spcPts val="700"/></a:spcAft><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>Body</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>' +
      '<a:p><a:pPr indent="0" marL="0"><a:buNone/></a:pPr><a:r><a:t>One run</a:t></a:r></a:p>' +
      '</p:txBody></p:sp><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Table 0"/></p:nvGraphicFramePr></p:graphicFrame></p:spTree>';
    const out = normalizeSlideXml(xml);
    expect(out).toContain('<a:p><a:pPr algn="ctr" indent="0"><a:spcAft><a:spcPts val="700"/></a:spcAft><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>Lead. </a:t></a:r><a:r><a:rPr lang="en-US"/><a:t>Body</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>');
    expect(out).toContain('<a:p><a:pPr indent="0" marL="0"><a:buNone/></a:pPr><a:r><a:t>One run</a:t></a:r></a:p>');
    expect([...out.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    expect(normalizeSlideXml(out)).toBe(out);
  });

  it("give a chart group only its declared axes, a line group its grouping, series their schema order and gaps no point", () => {
    const xml =
      '<c:plotArea><c:layout/><c:lineChart><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:spPr/><c:invertIfNegative val="0"/><c:dLbls><c:showVal val="0"/></c:dLbls><c:marker><c:symbol val="none"/></c:marker>' +
      '<c:cat><c:strRef><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v></c:v></c:pt><c:pt idx="1"><c:v>Feb</c:v></c:pt></c:strCache></c:strRef></c:cat>' +
      '<c:val><c:numRef><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v></c:v></c:pt><c:pt idx="1"><c:v>5</c:v></c:pt></c:numCache></c:numRef></c:val><c:smooth val="0"/></c:ser>' +
      '<c:marker val="1"/><c:axId val="10"/><c:axId val="20"/><c:axId val="30"/></c:lineChart>' +
      '<c:catAx><c:axId val="10"/><c:crossAx val="20"/></c:catAx><c:valAx><c:axId val="20"/><c:crossAx val="10"/></c:valAx></c:plotArea>';
    const out = normalizeChartXml(xml);
    expect(out).toContain('<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>');
    expect(out).toContain('<c:ser><c:idx val="0"/><c:order val="0"/><c:spPr/><c:marker><c:symbol val="none"/></c:marker><c:dLbls><c:showVal val="0"/></c:dLbls><c:cat>');
    expect(out).toContain('<c:axId val="10"/><c:axId val="20"/></c:lineChart>');
    // A blank category label stays; a blank value is a gap, a point left out.
    expect(out).toContain('<c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v></c:v></c:pt>');
    expect(out).toContain('<c:ptCount val="2"/><c:pt idx="1"><c:v>5</c:v></c:pt></c:numCache>');
    expect(normalizeChartXml(out)).toBe(out);
  });

  it("declare content types for the parts the deck holds only", () => {
    const xml =
      '<Types><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="r"/><Default Extension="jpg" ContentType="image/jpg"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="m"/><Override PartName="/ppt/slideMasters/slideMaster2.xml" ContentType="m"/></Types>';
    expect(normalizeContentTypesXml(xml, ["ppt/slideMasters/slideMaster1.xml", "ppt/media/image-1-1.png"])).toBe(
      '<Types><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="r"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="m"/></Types>',
    );
  });
});

/**
 * The Open XML SDK validator (tools/openxml-validate), built into a private
 * folder on first use so a parallel test file building the same project does
 * not race it; undefined without dotnet, or when the build fails (offline, no
 * cached NuGet package).
 */
function openXmlValidator(): string | undefined {
  const source = path.join(REPO, "tools", "openxml-validate");
  if (!fs.existsSync(path.join(source, "Program.cs"))) return undefined;
  const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
  const dir = path.join(os.tmpdir(), "amb-openxml-validate-cim");
  try {
    execFileSync("dotnet", ["--version"], { stdio: "ignore", timeout: 30_000, env });
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(source)) if (/\.(cs|csproj)$/.test(f)) fs.copyFileSync(path.join(source, f), path.join(dir, f));
    execFileSync("dotnet", ["build", dir, "-c", "Release", "-o", path.join(dir, "out"), "-v", "q", "--nologo"], { stdio: "ignore", timeout: 300_000, env });
  } catch {
    return undefined;
  }
  const dll = path.join(dir, "out", "openxml-validate.dll");
  return fs.existsSync(dll) ? dll : undefined;
}

/**
 * The one finding left by design: presentation.xml lists the notes master
 * after the slides, as pptxgenjs writes it. The notes master shares the slide
 * master's theme, which PowerPoint refuses once the list is where the schema
 * puts it; out of order, PowerPoint passes over it (see src/cim/ooxml.ts).
 */
const NOTES_MASTER_ORDER = /\/ppt\/presentation\.xml \| \/p:presentation\[1\] \|.*notesMasterIdLst/;

describe("the Open XML SDK validator", () => {
  const validator = openXmlValidator();
  const errorsOf = (file: string) => {
    const run = spawnSync("dotnet", [validator!, file], { encoding: "utf8", timeout: 120_000 });
    expect(run.stdout).toMatch(/TOTAL_ERRORS \d+/);
    return { errors: run.stdout.split("\n").filter((l) => l.startsWith("[") && !NOTES_MASTER_ORDER.test(l)), out: run.stdout };
  };

  it.skipIf(!validator)("finds nothing in a deck of every exhibit or in the Ridgeline deck but the notes master's place", async () => {
    const dir = tmpDir("amb-cim-office-");
    const every = path.join(dir, "every.pptx");
    const ridgeline = path.join(dir, "ridgeline.pptx");
    fs.writeFileSync(every, await everyExhibit().write());
    fs.writeFileSync(ridgeline, await ridgelineDeck());
    for (const file of [every, ridgeline]) {
      const { errors, out } = errorsOf(file);
      expect(errors, out.slice(0, 4000)).toEqual([]);
    }
  }, 180_000);

  it.skipIf(!validator)("reports the chart and paragraph faults in pptxgenjs's own output", async () => {
    const raw = path.join(tmpDir("amb-cim-office-"), "raw.pptx");
    fs.writeFileSync(raw, (await everyExhibit().pptx.write({ outputType: "nodebuffer" })) as Buffer);
    const { errors } = errorsOf(raw);
    expect(errors.some((e) => /c:lineChart\[1\] \|.*varyColors/.test(e))).toBe(true);
    expect(errors.some((e) => /c:barChart\[1\] \|.*axId/.test(e))).toBe(true);
    expect(errors.some((e) => /a:p\[1\] \|.*main:pPr/.test(e))).toBe(true);
  }, 120_000);
});
