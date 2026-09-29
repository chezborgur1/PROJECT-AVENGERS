// The workbook package against what Microsoft Excel accepts, not only the ISO
// schemas and LibreOffice. Excel reported the Ridgeline model as corrupt: every
// tab's <sheetPr> had <pageSetUpPr> before <outlinePr> (ExcelJS's order; the
// schema's is a sequence), the Cover logo's oneCellAnchor carried editAs, and
// the row breaks ran to column 16838, past the last column. The structural
// check (ooxml.ts) always runs; the Open XML SDK validator
// (tools/openxml-validate) runs when `dotnet` is installed and is skipped
// otherwise.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { chartXml, type ChartPlacement } from "../src/model/charts.ts";
import { runModel } from "../src/model/engine.ts";
import { dropOneCellAnchorEditAs, orderFontChildren, orderSheetPr, packageIssues } from "../src/model/ooxml.ts";
import { writeWorkbook } from "../src/model/workbook.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

/** The Open XML SDK validator's assembly, built on first use; undefined without dotnet or when the build fails (offline, no cached NuGet package). */
function openXmlValidator(): string | undefined {
  const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
  const project = path.join(REPO, "tools", "openxml-validate");
  try {
    execFileSync("dotnet", ["--version"], { stdio: "ignore", timeout: 30_000, env });
    execFileSync("dotnet", ["build", project, "-c", "Release", "-v", "q", "--nologo"], { stdio: "ignore", timeout: 300_000, env });
  } catch {
    return undefined;
  }
  const dll = path.join(project, "bin", "Release", "net8.0", "openxml-validate.dll");
  return fs.existsSync(dll) ? dll : undefined;
}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const worksheet = (inner: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN}" xmlns:r="${REL}">${inner}</worksheet>`;
const sheetData = (cells = "") => `<sheetData><row r="2">${cells}</row></sheetData>`;
const TAIL = `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/><pageSetup paperSize="1" orientation="landscape"/>`;

async function issuesOf(parts: Record<string, string>): Promise<string[]> {
  const zip = new JSZip();
  for (const [name, xml] of Object.entries(parts)) zip.file(name, xml);
  return packageIssues(zip);
}

/** ExcelJS 4.4's own output for a Ridgeline raw tab and the Cover logo, before conformPackage. */
const EXCELJS_SHEET_PR = '<sheetPr><tabColor rgb="FFA6A6A6"/><pageSetUpPr fitToPage="1"/><outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>';
const EXCELJS_ANCHOR = '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:oneCellAnchor editAs="oneCell"><xdr:from><xdr:col>12</xdr:col></xdr:from></xdr:oneCellAnchor></xdr:wsDr>';
const EXCELJS_FONTS = '<fonts count="3"><font><sz val="10"/><name val="Arial"/><family val="2"/></font><font><b/><u/><color rgb="FF000000"/><sz val="9"/><name val="Arial"/></font><font><i/><color rgb="FF008000"/><sz val="9"/><name val="Arial"/></font></fonts>';

const placement = (grouping: ChartPlacement["grouping"]): ChartPlacement => ({
  id: "test",
  fromRow: 5,
  toRow: 20,
  heightPt: 200,
  kind: "bar",
  grouping,
  categories: { ref: "'Revenue Charts'!$C$45:$E$45", labels: ["Jan-25", "Feb-25", "Mar-25"] },
  series: [{ nameRef: "'Revenue Charts'!$B$46", name: "Revenue", ref: "'Revenue Charts'!$C$46:$E$46", values: [1, 2, 3], color: "7B0000" }],
  labelFormat: "#,##0",
  valueAxis: { visible: false, format: "#,##0" },
  categoryAxis: true,
  legend: false,
});

describe("the ExcelJS workarounds and the package check (ooxml.ts)", () => {
  it("puts <sheetPr> children in schema order: tabColor, outlinePr, pageSetUpPr", async () => {
    expect(await issuesOf({ "xl/worksheets/sheet1.xml": worksheet(EXCELJS_SHEET_PR + sheetData() + TAIL) })).toEqual([
      "xl/worksheets/sheet1.xml: <sheetPr> children out of order: tabColor, pageSetUpPr, outlinePr",
    ]);
    const fixed = orderSheetPr(worksheet(EXCELJS_SHEET_PR + sheetData() + TAIL));
    expect(fixed).toContain('<sheetPr><tabColor rgb="FFA6A6A6"/><outlinePr summaryBelow="0" summaryRight="0"/><pageSetUpPr fitToPage="1"/></sheetPr>');
    expect(await issuesOf({ "xl/worksheets/sheet1.xml": fixed })).toEqual([]);
    // Anything but a run of empty elements is left as it is, never reordered blind.
    const odd = worksheet('<sheetPr><pageSetUpPr fitToPage="1"/><!-- note --><outlinePr/></sheetPr>' + sheetData());
    expect(orderSheetPr(odd)).toBe(odd);
  });

  it("drops editAs from a oneCellAnchor and keeps it on a twoCellAnchor", async () => {
    expect(await issuesOf({ "xl/drawings/drawing1.xml": EXCELJS_ANCHOR })).toEqual(["xl/drawings/drawing1.xml: editAs on a oneCellAnchor"]);
    expect(dropOneCellAnchorEditAs(EXCELJS_ANCHOR)).toContain("<xdr:oneCellAnchor><xdr:from>");
    const two = '<xdr:twoCellAnchor editAs="oneCell"><xdr:from/></xdr:twoCellAnchor>';
    expect(dropOneCellAnchorEditAs(two)).toBe(two);
  });

  it("orders every font's children as the Open XML SDK reads them, sz before color", async () => {
    const styles = `<styleSheet xmlns="${MAIN}">${EXCELJS_FONTS}<dxfs count="1"><dxf><font><b/><color rgb="FFFF0000"/></font></dxf></dxfs></styleSheet>`;
    expect(await issuesOf({ "xl/styles.xml": styles })).toEqual([
      "xl/styles.xml: font children out of order: b, u, color, sz, name",
      "xl/styles.xml: font children out of order: i, color, sz, name",
    ]);
    const fixed = orderFontChildren(styles);
    expect(fixed).toContain('<fonts count="3"><font><sz val="10"/><name val="Arial"/><family val="2"/></font>');
    expect(fixed).toContain('<font><b/><u/><sz val="9"/><color rgb="FF000000"/><name val="Arial"/></font>');
    expect(fixed).toContain('<dxf><font><b/><color rgb="FFFF0000"/></font></dxf>');
    expect(await issuesOf({ "xl/styles.xml": fixed })).toEqual([]);
  });

  it("flags row breaks past the last column, worksheet elements out of order and a drawing without its relationship", async () => {
    const xml = worksheet(`<sheetPr><outlinePr/></sheetPr>${sheetData()}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/><drawing r:id="rId1"/><pageSetup paperSize="1"/><rowBreaks count="1" manualBreakCount="1"><brk id="45" max="16838" man="1"/></rowBreaks>`);
    expect(await issuesOf({ "xl/worksheets/sheet1.xml": xml })).toEqual([
      "xl/worksheets/sheet1.xml: worksheet elements out of schema order: sheetPr, sheetData, pageMargins, drawing, pageSetup, rowBreaks",
      'xl/worksheets/sheet1.xml: <rowBreaks> break max="16838" beyond 16383',
      'xl/worksheets/sheet1.xml: <drawing r:id="rId1"> has no relationship',
    ]);
  });

  it("flags a formula stored with '=' or holding a character Excel cannot parse outside a string", async () => {
    const cells = '<c r="B2"><f>=SUM(C2:D2)</f></c><c r="C2"><f>C3−C4</f></c><c r="D2" t="str"><f>"a–b"&amp;\'Q’s\'!A1</f><v>x</v></c>';
    expect(await issuesOf({ "xl/worksheets/sheet1.xml": worksheet(sheetData(cells) + TAIL) })).toEqual([
      'xl/worksheets/sheet1.xml: formula stored with a leading "=": =SUM(C2:D2)',
      "xl/worksheets/sheet1.xml: formula character U+2212 outside a string: C3−C4",
    ]);
  });

  it("labels a stacked bar at its centre, never outside its end", async () => {
    expect(chartXml(placement("clustered"))).toContain('<c:dLblPos val="outEnd"/>');
    expect(chartXml(placement("stacked"))).toContain('<c:dLblPos val="ctr"/>');
    expect(await issuesOf({ "xl/charts/chart1.xml": chartXml(placement("stacked")), "xl/charts/chart2.xml": chartXml(placement("clustered")) })).toEqual([]);
    const bad = chartXml(placement("stacked")).replace('<c:dLblPos val="ctr"/>', '<c:dLblPos val="outEnd"/>');
    expect(await issuesOf({ "xl/charts/chart1.xml": bad })).toEqual(["xl/charts/chart1.xml: outside-end data labels on a stacked bar chart"]);
  });
});

describe("the written Ridgeline workbook opens in Excel without repair", () => {
  const dir = tmpDir("amb-ooxml-");
  const file = path.join(dir, "ridgeline.xlsx");
  let zip: JSZip;
  const sheets = () => Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));

  beforeAll(async () => {
    const row = sampleRow();
    const ds = ridgelineDataset();
    const assumptions = defaultAssumptions(ds, row);
    await writeWorkbook({ row, dataset: ds, assumptions, model: runModel(ds, assumptions), firmName: "AMB Advisory Services", preparedOn: "2026-09-28" }, file);
    zip = await JSZip.loadAsync(fs.readFileSync(file));
  }, 60_000);

  it("carries none of the Excel repair triggers the package check knows", async () => {
    expect(await packageIssues(zip)).toEqual([]);
  });

  it("writes outlinePr before pageSetUpPr on every tab, the logo's anchor without editAs and row breaks to column XFD", async () => {
    let both = 0;
    let breaks = 0;
    for (const part of sheets()) {
      const xml = await zip.file(part)!.async("string");
      const pr = /<sheetPr>([\s\S]*?)<\/sheetPr>/.exec(xml)?.[1] ?? "";
      if (pr.includes("<outlinePr") && pr.includes("<pageSetUpPr")) {
        both++;
        expect(pr.indexOf("<outlinePr"), part).toBeLessThan(pr.indexOf("<pageSetUpPr"));
      }
      for (const m of (/<rowBreaks[^>]*>([\s\S]*?)<\/rowBreaks>/.exec(xml)?.[1] ?? "").matchAll(/max="(\d+)"/g)) {
        breaks++;
        expect(Number(m[1]), part).toBe(16383);
      }
    }
    expect(both).toBeGreaterThan(30);
    expect(breaks).toBeGreaterThan(5);
    const drawings = Object.keys(zip.files).filter((p) => /^xl\/drawings\/drawing\d+\.xml$/.test(p));
    const anchors = (await Promise.all(drawings.map((p) => zip.file(p)!.async("string")))).join("");
    expect(anchors).toContain("<xdr:oneCellAnchor>");
    expect(anchors).not.toMatch(/<xdr:oneCellAnchor [^>]*editAs/);
  });

  const validator = openXmlValidator();
  it.skipIf(!validator)("passes the Open XML SDK validator with zero errors", () => {
    const run = spawnSync("dotnet", [validator!, file], { encoding: "utf8", timeout: 120_000 });
    const errors = run.stdout.split("\n").filter((l) => l.startsWith("["));
    expect(errors, run.stdout.slice(0, 4000)).toEqual([]);
    expect(run.stdout).toContain("TOTAL_ERRORS 0");
    expect(run.status).toBe(0);
  }, 120_000);
});
