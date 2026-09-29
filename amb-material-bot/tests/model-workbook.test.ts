// The Ridgeline workbook against guide section 5: every formula evaluates to
// the engine's value, LibreOffice recalculates it without errors, and the
// house style (tabs, fonts, fills, formats, print setup, Print toggle) is
// exactly as specified. A tampered reference and a circular one must fail.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { gatherIntake } from "../src/ingest/index.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { FMT } from "../src/model/styles.ts";
import type { ModelOutput } from "../src/model/types.ts";
import { evaluateWorkbook, NAMED_OUTPUTS, verifyWorkbook, type Evaluation, type VerifyResult } from "../src/model/verifyWorkbook.ts";
import { readCharts } from "../src/model/charts.ts";
import { writeWorkbook } from "../src/model/workbook.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { modeMeasure } from "../src/model/periods.ts";
import { colLetter } from "../src/model/sheet.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";
import { annualWithProForma, fourDateBalanceSheet, juneYearEnd, lowerMiddleMarket, midYear, monthlyBalanceSheets, type Scenario } from "./scenarios.ts";

const row = sampleRow();
const dir = tmpDir("amb-model-");

async function build(ds: FinancialDataset, name: string): Promise<{ model: ModelOutput; file: string }> {
  const assumptions = defaultAssumptions(ds, row);
  const model = runModel(ds, assumptions);
  const file = path.join(dir, `${name}.xlsx`);
  await writeWorkbook({ row, dataset: ds, assumptions, model, firmName: "AMB Advisory Services", preparedOn: "2026-09-28" }, file);
  return { model, file };
}

/** Rewrite one cell's formula in the saved package, leaving everything else byte for byte. */
async function tamper(file: string, sheetName: string, ref: string, edit: (f: string) => string, suffix: string): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const part = await sheetPart(zip, sheetName);
  const xml = await zip.file(part)!.async("string");
  const cell = new RegExp(`(<c r="${ref}"[^>]*><f>)([^<]*)(</f>)`);
  const m = cell.exec(xml);
  expect(m, `${sheetName}!${ref} holds a formula`).toBeTruthy();
  const edited = edit(m![2]!);
  expect(edited).not.toBe(m![2]);
  zip.file(part, xml.replace(cell, `$1${edited}$3`));
  const out = file.replace(/\.xlsx$/, `-${suffix}.xlsx`);
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
  return out;
}

async function sheetPart(zip: JSZip, sheetName: string): Promise<string> {
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const escaped = sheetName.replace(/&/g, "&amp;");
  const rid = new RegExp(`<sheet [^>]*name="${escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="([^"]+)"`).exec(wbXml)![1];
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)![1]!;
  return `xl/${target.replace(/^\/?xl\//, "")}`;
}

/** LibreOffice recalculation through the xlsx skill's recalc.py, when this machine has it. */
function recalcScript(): string | undefined {
  const candidates = [process.env.AMB_RECALC_PY, "/root/.claude/skills/synced/9488611f-533e-4a4e-a7db-3d27cfc06d7d_1c4ec00c-4815-46b3-96f7-9a90ccea73a3/xlsx/scripts/recalc.py"];
  const hasSoffice = (() => {
    try {
      execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 30_000 });
      return true;
    } catch {
      return false;
    }
  })();
  return hasSoffice ? candidates.find((c) => c && fs.existsSync(c)) : undefined;
}

let model: ModelOutput;
let file: string;
let verified: VerifyResult;
let wb: ExcelJS.Workbook;
let ev: Evaluation;

beforeAll(async () => {
  ({ model, file } = await build(ridgelineDataset(), "ridgeline"));
  verified = await verifyWorkbook(file, model);
  ev = await evaluateWorkbook(file);
  wb = ev.workbook;
}, 180_000);

const formulasOf = (ws: ExcelJS.Worksheet): { ref: string; f: string }[] => {
  const out: { ref: string; f: string }[] = [];
  ws.eachRow((r) => r.eachCell((c) => {
    const v = c.value as { formula?: string; sharedFormula?: string } | null;
    if (v && typeof v === "object" && (v.formula || v.sharedFormula)) out.push({ ref: c.address, f: v.formula ?? v.sharedFormula! });
  }));
  return out;
};
const argb = (c: ExcelJS.Cell): string | undefined => (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

/** Sheet, row and column a single-cell defined name points at. */
function namedCell(book: ExcelJS.Workbook, name: string): { sheet: string; row: number; col: number } {
  const ref = (book.definedNames as unknown as { getRanges(n: string): { ranges: string[] } }).getRanges(name).ranges[0]!;
  const [, sheet, col, row] = /^'?(.+?)'?!\$([A-Z]+)\$(\d+)$/.exec(ref)!;
  return { sheet: sheet!, row: Number(row), col: col!.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) };
}

describe("verifyWorkbook", () => {
  it("evaluates every formula without error and every compared line matches the engine", () => {
    expect(verified.errors).toEqual([]);
    expect(verified.mismatches).toEqual([]);
    expect(verified.lint).toEqual([]);
    expect(verified.ok).toBe(true);
    expect(verified.formulas).toBeGreaterThan(7_000);
    expect(verified.compared).toBeGreaterThan(6_000);
  });

  it("the ladder on the workbook ties to Adj. EBITDA 385,725 and SDE 561,775", async () => {
    const named = (name: string) => {
      const { sheet, row: r, col } = namedCell(wb, name);
      return ev.value(sheet, r, col);
    };
    expect(named("AdjEBITDA_LTM")).toBeCloseTo(385.725, 9);
    expect(named("SDE_LTM")).toBeCloseTo(561.775, 9);
    expect(named("RepEBITDA_LTM")).toBeCloseTo(319.515, 9);
    expect(named("PFAdjEBITDA")).toBeCloseTo(385.725, 9);
    expect(named("MasterCheck")).toBe("All checks OK (render check pending)");
  }, 120_000);

  /** Row of a P&L Summary label. */
  const pnlRow = (label: string) => wb.getWorksheet("P&L Summary")!.getColumn(2).values.findIndex((v) => v === label);

  it("catches a formula pointing at the wrong row", async () => {
    // Gross Profit FY2025 = Total Revenue - Cost of Revenue; point it at the prior year's cost instead.
    const [gp, cogs] = [pnlRow("Gross Profit"), pnlRow("Cost of Revenue")];
    const out = await tamper(file, "P&L Summary", `E${gp}`, (f) => f.replace(`E${cogs}`, `D${cogs}`), "wrong-ref");
    const v = await verifyWorkbook(out, model);
    expect(v.ok).toBe(false);
    expect(v.mismatches.some((m) => m.cell === `'P&L Summary'!E${gp}` || m.label.startsWith("gross_profit"))).toBe(true);
  }, 120_000);

  it("reports a circular reference instead of crashing", async () => {
    const [gp, cogs] = [pnlRow("Gross Profit"), pnlRow("Cost of Revenue")];
    const out = await tamper(file, "P&L Summary", `E${gp}`, (f) => f.replace(`E${cogs}`, `E${gp}`), "circular");
    const v = await verifyWorkbook(out, model);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /circular/.test(e.error))).toBe(true);
  }, 120_000);
});

describe("LibreOffice recalculation", () => {
  const script = recalcScript();
  it.skipIf(!script)("reports zero errors and caches the engine's figures", async () => {
    const copy = file.replace(/\.xlsx$/, "-recalc.xlsx");
    fs.copyFileSync(file, copy);
    const report = JSON.parse(execFileSync("python3", [script!, copy, "120"], { encoding: "utf8", timeout: 300_000 })) as { status: string; total_errors: number; total_formulas: number };
    expect(report.total_errors).toBe(0);
    expect(report.total_formulas).toBeGreaterThan(7_000);
    // LibreOffice's own cached results at the named outputs, read straight from the saved sheets.
    const lo = new ExcelJS.Workbook();
    await lo.xlsx.readFile(copy);
    const cached = (name: string) => {
      const { sheet, row: r, col } = namedCell(lo, name);
      return (lo.getWorksheet(sheet)!.getCell(r, col).value as { result?: unknown }).result;
    };
    expect(cached("AdjEBITDA_LTM")).toBeCloseTo(385.725, 6);
    expect(cached("SDE_LTM")).toBeCloseTo(561.775, 6);
    expect(cached("RepEBITDA_LTM")).toBeCloseTo(319.515, 6);
    expect(cached("MasterCheck")).toBe("All checks OK (render check pending)");
  }, 360_000);
});

describe("house style (guide 5.8-5.13)", () => {
  it("orders the tabs as guide 5.1, leaving out tabs whose data is absent", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Cover", "Contents", "Summary", "Assumptions", "P&L Summary", "Adj. EBITDA", "Adjustments", "Revenue Detail", "Revenue Charts", "Expense Detail", "Expense Charts",
      "Customer Overview", "Customer Retention", "Retention Charts", "Concentration", "Cohorts", "Headcount", "Headcount Charts", "Balance Sheet", "NWC", "Debt-Like Items", "Cash Flow",
      "Proof of Cash", "Projections", "Opportunities", "Valuation", "Deal Structure", "Sensitivities", "Checks", "Data -->",
      "Monthly P&L", "Databook", "Mapping", "Raw - P&L", "Raw - BS", "Raw - Bank", "Raw - Customers", "Raw - Payroll",
    ]);
  });

  it("uses no volatile or modern-only function anywhere and no #REF!", () => {
    for (const ws of wb.worksheets) {
      for (const { ref, f } of formulasOf(ws)) {
        expect(f, `${ws.name}!${ref}`).not.toMatch(/\b(TODAY|NOW|OFFSET|INDIRECT|RAND|RANDBETWEEN|XLOOKUP|XMATCH|FILTER|LET|LAMBDA|SEQUENCE|UNIQUE)\s*\(/i);
        expect(f, `${ws.name}!${ref}`).not.toContain("#REF!");
      }
    }
  });

  it("sets every font in Arial, the Normal style included", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const styles = await zip.file("xl/styles.xml")!.async("string");
    // Cell fonts live in <fonts>; the <dxfs> of conditional formats carry colour and weight only.
    const block = /<fonts [^>]*>(.*?)<\/fonts>/.exec(styles)![1]!;
    const fonts = [...block.matchAll(/<font>(.*?)<\/font>/g)].map((m) => m[1]!);
    expect(fonts.length).toBeGreaterThan(5);
    for (const f of fonts) expect(f).toContain('<name val="Arial"/>');
    // The Normal style's font is the first font: Arial 10.
    expect(fonts[0]).toContain('<sz val="10"/>');
  });

  it("uses only the exact number formats of guide 5.10", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const styles = await zip.file("xl/styles.xml")!.async("string");
    const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const used = [...styles.matchAll(/<numFmt [^>]*formatCode="([^"]*)"/g)].map((m) => unescape(m[1]!));
    const allowed = new Set<string>(Object.values(FMT));
    for (const code of used) expect(allowed.has(code), code).toBe(true);
    for (const code of [FMT.body, FMT.currency, FMT.pct1, FMT.multiple, FMT.monthHeader, FMT.check]) expect(used).toContain(code);
  });

  it("draws the two-tier maroon header, the pink section bars and the yellow key-total boxes", () => {
    const pnl = wb.getWorksheet("P&L Summary")!;
    for (const ref of ["B5", "C5", "B6", "E6"]) expect(argb(pnl.getCell(ref)), ref).toBe("FF7B0000");
    expect(pnl.getCell("B6").font).toMatchObject({ name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } });
    expect(pnl.getCell("B8").value).toBe("Revenue");
    expect(argb(pnl.getCell("B8"))).toBe("FFFFE1E1");
    const gp = pnl.getColumn(2).values.findIndex((v) => v === "Gross Profit");
    expect(argb(pnl.getCell(gp, 2))).toBe("FFFFFFCC");
    expect(argb(pnl.getCell(gp, 5))).toBe("FFFFFFCC");
    expect(pnl.getCell(gp, 5).border?.top?.style).toBe("thin");
  });

  it("links row 2 to the Cover, sets an italic subtitle with a rule in row 3, and uses 0.9 spacers and 3.95 spacer rows", () => {
    const pnl = wb.getWorksheet("P&L Summary")!;
    expect((pnl.getCell("B2").value as { formula: string }).formula).toMatch(/^'?Cover'?!/);
    expect(pnl.getCell("B3").font?.italic).toBe(true);
    expect(pnl.getCell("B3").border?.bottom?.style).toBe("thin");
    expect(pnl.getColumn(6).width).toBeCloseTo(0.9, 6);
    const opex = pnl.getColumn(2).values.findIndex((v) => v === "Operating Expenses");
    expect(pnl.getRow(opex - 1).height).toBeCloseTo(3.95, 6);
    expect(pnl.getCell("C6").value === null || typeof pnl.getCell("C6").value === "object").toBe(true);
  });

  it("colours inputs blue, links green and calculations black", () => {
    const assumptions = wb.getWorksheet("Assumptions")!;
    const asOf = assumptions.getCell("C9");
    expect(asOf.value).toBeInstanceOf(Date);
    expect(asOf.font?.color?.argb).toBe("FF0000FF");
    const pnl = wb.getWorksheet("P&L Summary")!;
    expect(pnl.getCell("E9").font?.color?.argb).toBe("FF008000");
    const gp = pnl.getColumn(2).values.findIndex((v) => v === "Gross Profit");
    expect(pnl.getCell(gp, 5).font?.color?.argb).toBe("FF000000");
    // A 3.95 spacer row sits between the last line and each subtotal (guide 5.11).
    expect(pnl.getRow(gp - 1).height).toBeCloseTo(3.95, 6);
  });

  it("switches gridlines off, freezes the period block and prints landscape with the house header and footer", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const wbXml = (await zip.file("xl/workbook.xml")!.async("string")).replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    for (const name of ["P&L Summary", "Adj. EBITDA", "Monthly P&L", "Databook"]) {
      const ws = wb.getWorksheet(name)!;
      expect(ws.views[0]!.showGridLines, name).toBe(false);
      expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 6 });
      expect(ws.pageSetup.orientation, name).toBe("landscape");
      // Absolute, so inserting a row inside the table never moves the area; a Basis column printed apart is a second range.
      const q = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(wbXml, name).toMatch(new RegExp(`<definedName name="_xlnm.Print_Area" localSheetId="\\d+">'${q}'!\\$B\\$2:\\$[A-Z]+\\$\\d+(,'${q}'!\\$[A-Z]+\\$\\d+:\\$[A-Z]+\\$\\d+)*</definedName>`));
      expect(ws.headerFooter.oddFooter, name).toContain("Strictly confidential");
      expect(ws.headerFooter.oddFooter, name).toContain("Page &P of &N");
      expect(ws.headerFooter.oddHeader, name).toContain("As of 12/31/25");
    }
  });

  it("has a master Print switch on Contents and a per-tab override that drives conditional formatting", async () => {
    const printMode = (wb.definedNames as unknown as { getRanges(n: string): { ranges: string[] } }).getRanges("PrintMode").ranges[0];
    expect(printMode).toBe("Contents!$I$18");
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    for (const name of ["Summary", "P&L Summary", "Adj. EBITDA", "Balance Sheet", "Monthly P&L"]) {
      const xml = await zip.file(await sheetPart(zip, name))!.async("string");
      const rule = /<conditionalFormatting sqref="([^"]+)"><cfRule type="expression" dxfId="\d+" priority="\d+"><formula>\$([A-Z]+)\$3=1<\/formula>/.exec(xml);
      expect(rule, name).toBeTruthy();
      const toggle = new RegExp(`<c r="${rule![2]}3"[^>]*><f>([^<]*)</f>`).exec(xml)![1]!;
      expect(toggle.replace(/&apos;/g, "'"), name).toBe("'Contents'!$I$18");
      // The rule turns coloured text black, so it must never reach white text on the maroon
      // header band: those headers would print black on maroon.
      const ws = wb.getWorksheet(name)!;
      let covered = 0;
      for (const range of rule![1]!.split(" ")) {
        const [from, to = from] = range.split(":");
        const a = ws.getCell(from!), b = ws.getCell(to!);
        for (let r = Number(a.row); r <= Number(b.row); r++) {
          for (let c = Number(a.col); c <= Number(b.col); c++) {
            covered++;
            expect(ws.getCell(r, c).font?.color?.argb, `${name}!${ws.getCell(r, c).address}`).not.toBe("FFFFFFFF");
          }
        }
      }
      expect(covered, name).toBeGreaterThan(1);
    }
  });

  it("dates the Cover from the fixed as-of date, in black furniture, with no model status line (QA round 3 F9)", async () => {
    const cover = wb.getWorksheet("Cover")!;
    const texts: string[] = [];
    cover.eachRow((r) => r.eachCell((c) => {
      const v = c.value as { formula?: string } | string | null;
      if (typeof v === "string") texts.push(v);
      else if (v && typeof v === "object" && v.formula) texts.push(String(ev.value("Cover", Number(c.row), Number(c.col))));
    }));
    expect(texts).toContain("As of 12/31/25");
    // The master check sits on Contents; guide 5.13 gives the Cover no status line.
    expect(texts.some((t) => /Model status/.test(t))).toBe(false);
    // Linked or not, Cover text prints black, so Print mode (which blackens only conditional formats) leaves nothing green.
    cover.eachRow((r) => r.eachCell((c) => c.value !== null && expect(c.font?.color?.argb ?? "FF000000", c.address).toMatch(/^FF(000000|FFFFFF)$/)));
  }, 120_000);

  it("links every tab from Contents and names only guide 5.14 outputs", () => {
    const contents = formulasOf(wb.getWorksheet("Contents")!).map((x) => x.f);
    for (const ws of wb.worksheets.filter((w) => w.name !== "Data -->")) expect(contents.some((f) => f.includes(`#'${ws.name}'!A1`)), ws.name).toBe(true);
    const names = (wb.definedNames as unknown as { model: { name: string }[] }).model.map((n) => n.name).filter((n) => !n.startsWith("_xlnm"));
    for (const n of names) if (!n.startsWith("Monthly_")) expect(NAMED_OUTPUTS, n).toContain(n);
    // Guide 5.14 names added by the follow-ups: the LOI dates, the Offer names for the Reference column and the Monthly_<line> rows.
    for (const n of ["LOIDate", "SigningDate", "EffectiveDate", "Offer_Count", "Offer_Reference", "Offer_Headline_1", "Offer_CashAtClose_1", "Monthly_Revenue", "Monthly_AdjEBITDA"]) expect(names, n).toContain(n);
  });

  it("computes prior-year YTD and LTM growth from the grid a year earlier instead of typing n.a. (QA round 3 F10)", () => {
    const pnl = wb.getWorksheet("P&L Summary")!;
    const growth = pnl.getColumn(2).values.findIndex((v) => v === "% Growth");
    // G = YTD Dec-24 and J = LTM Dec-24: Jan-Dec 2023 is on the grid, so both are FY2024 over FY2023.
    for (const c of [7, 10]) {
      expect(pnl.getCell(growth, c).formula, `col ${c}`).toMatch(/SUMIFS\(.*EOMONTH\(.*,-13\)\+1/);
      expect(Number(pnl.getCell(growth, c).result)).toBeCloseTo(2_718_600 / 2_406_800 - 1, 6);
    }
    // The oldest year and the run-rate PF column have no year-earlier window: n.a.
    expect(pnl.getCell(growth, 3).value).toBe("n.a.");
    expect(pnl.getCell(growth, 12).value).toBe("n.a.");
    const detail = wb.getWorksheet("Revenue Detail")!;
    const total = detail.getColumn(2).values.findIndex((v) => v === "Revenue Growth");
    expect(Number(detail.getCell(total, 7).result)).toBeCloseTo(2_718_600 / 2_406_800 - 1, 6);
  });

  it("carries the PF vs. LTM block on the detail tabs and the YTD and prior-year LTM windows on the retention count block (QA round 3 F11)", () => {
    for (const name of ["Revenue Detail", "Expense Detail"]) {
      const ws = wb.getWorksheet(name)!;
      // N:O after the PF column (L), as on the P&L Summary.
      expect(ws.getCell(5, 14).value, name).toBe("PF vs. LTM");
      expect([ws.getCell(6, 14).value, ws.getCell(6, 15).value], name).toEqual(["($)", "(%)"]);
      expect(ws.getCell(9, 14).formula, name).toBe("L9-K9");
    }
    const ret = wb.getWorksheet("Customer Retention")!;
    const groups = [3, 7, 10].map((c) => ret.getCell(5, c).value);
    expect(groups).toEqual(["Full Year", "YTD", "LTM"]);
    const ending = ret.getColumn(2).values.findIndex((v) => v === "Ending Count");
    const byWindow = model.customers!.retention!.byWindow!;
    expect(Number(ret.getCell(ending, 7).result)).toBe(byWindow["YTD2024-12"]!.endingCount);
    expect(Number(ret.getCell(ending, 10).result)).toBe(byWindow["LTM2024-12"]!.endingCount);
    expect(Number(ret.getCell(ending, 11).result)).toBe(model.customers!.retention!.ltm!.counts.endingCount);
  });

  it("prints every (-) row as a deduction, negative, on every tab (QA round 3 F14)", () => {
    const positive: string[] = [];
    for (const ws of wb.worksheets) {
      ws.eachRow((r, n) => {
        const label = r.getCell(2).value;
        const text = typeof label === "string" ? label : (label as { result?: unknown } | null)?.result;
        if (typeof text !== "string" || !text.startsWith("(-) ") || text.startsWith("(-) /")) return;
        r.eachCell((c, col) => {
          if (col < 3) return;
          const v = typeof c.value === "number" ? c.value : (c.value as { result?: unknown } | null)?.result;
          if (typeof v === "number" && v > 1e-9) positive.push(`${ws.name}!${c.address} ${text} = ${v}`);
        });
        void n;
      });
    }
    expect(positive).toEqual([]);
  });

  it("keeps the formulas a reviewer audits short, with the repeated arithmetic in grey helper rows (QA round 3 F15)", () => {
    const longest = (name: string) => Math.max(...formulasOf(wb.getWorksheet(name)!).map((x) => x.f.length));
    // The C03 check row was 3,260 characters, the listed-customer KPI 1,300, Checks C15 1,429 and each Headcount helper 413.
    expect(longest("P&L Summary")).toBeLessThan(600);
    expect(longest("Checks")).toBeLessThan(600);
    expect(longest("Headcount")).toBeLessThan(400);
    const checks = wb.getWorksheet("Checks")!;
    const c15 = checks.getColumn(2).values.findIndex((v) => v === "C15");
    expect(checks.getCell(c15, 5).formula).toMatch(/^SUM\(E\d+:E\d+\)$/);
  });

  it("prints the raw tabs with the confidentiality footer, a title inside the print width and no repeated first column (QA round 3 F18)", () => {
    const raws = wb.worksheets.filter((w) => w.name.startsWith("Raw - "));
    expect(raws.length).toBeGreaterThan(2);
    for (const ws of raws) {
      expect(ws.headerFooter.oddFooter, ws.name).toContain("Strictly confidential");
      expect(ws.pageSetup.printTitlesColumn, ws.name).toBeFalsy();
      // A short title in A1 and the file on its own line in A2, never one long line cut at the print edge.
      expect(String(ws.getCell(1, 1).value), ws.name).toMatch(/^Raw - [^()]+$/);
      expect(String(ws.getCell(2, 1).value).length, ws.name).toBeGreaterThan(0);
    }
    const bank = wb.getWorksheet("Raw - Bank");
    if (bank) expect(bank.getCell(4, 3).numFmt.replace(/\\/g, "")).toBe(FMT.rawCents.replace(/\\/g, ""));
  });

  it("writes the Personal? tag and fills the period columns of the export-total rows on the Databook (QA round 3 F20)", () => {
    const db = wb.getWorksheet("Databook")!;
    const tags = db.getColumn(6).values.filter((v) => typeof v === "string" && v.startsWith("(+) "));
    // The tag carries the normalization rows the account feeds, as the guide's "(+) Owner vehicle [N1]" (verification F20).
    expect(tags.some((t) => /^\(\+\) Vehicle expenses \[N1\]/.test(String(t)))).toBe(true);
    // "Personal?" is the header only, never a row's value.
    expect(db.getColumn(6).values.filter((v) => v === "Personal?")).toHaveLength(1);
    const income = db.getColumn(2).values.findIndex((v) => v === "Total Income");
    // FY2025 (column K on the Databook's period block) is a SUMIFS over the row's months, as on every account row.
    const fy = [...Array(12).keys()].map((i) => 9 + i).find((c) => db.getCell(6, c).result === "FY2025" || db.getCell(6, c).value === "FY2025")!;
    expect(db.getCell(income, fy).formula).toMatch(/^SUMIFS\(/);
    expect(Number(db.getCell(income, fy).result)).toBeCloseTo(3_040_800, 0);
  });

  it("maps each check to every tab it tests in the Contents Check column, and describes Raw - Bank as it is (QA round 3 F19)", () => {
    const contents = wb.getWorksheet("Contents")!;
    const rowOfTab = (name: string) => {
      let at = -1;
      contents.eachRow((r, n) => {
        if (at < 0 && r.getCell(3).result === name) at = n;
      });
      return at;
    };
    for (const name of ["Adjustments", "Expense Detail", "Expense Charts", "NWC"]) {
      const cell = contents.getCell(rowOfTab(name), 6);
      expect(cell.formula, name).toMatch(/^IF\(OR\(/);
      expect(cell.result, name).toBe("OK");
    }
    // C06 lives on the ladder and tests the schedule too: its status cell is in both tabs' formulas.
    const checks = wb.getWorksheet("Checks")!;
    const c06 = checks.getColumn(2).values.findIndex((v) => v === "C06");
    for (const name of ["Adj. EBITDA", "Adjustments"]) expect(contents.getCell(rowOfTab(name), 6).formula, name).toContain(`$G${c06}="CHECK"`);
    expect(contents.getCell(rowOfTab("Raw - Bank"), 4).value).toBe("Bank transactions as exported, classified");
  });

  it("wires every check C01-C37 to the Checks tab with the engine's status", async () => {
    const checks = wb.getWorksheet("Checks")!;
    const found = new Map<string, string>();
    checks.eachRow((r, n) => {
      const id = r.getCell(2).value;
      if (typeof id === "string" && /^C\d{2}$/.test(id)) found.set(id, String(ev.value("Checks", n, 7)));
    });
    expect([...found.keys()]).toEqual(model.checks.map((c) => c.id));
    for (const c of model.checks) expect(found.get(c.id), c.id).toBe(c.status);
  }, 120_000);
});

describe("chart tabs (guide 5.12)", () => {
  it("draws every exhibit as a native chart on its tab, two exhibits per printed page", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const charts = await readCharts(zip);
    const exhibits = model.charts!;
    // One frame per exhibit plus the ratio panel under each bar + ratio exhibit.
    expect(charts.length).toBe(exhibits.length + exhibits.filter((e) => e.ratio).length);
    const tabs = { revenueCharts: "Revenue Charts", expenseCharts: "Expense Charts", retentionCharts: "Retention Charts", headcountCharts: "Headcount Charts" } as const;
    for (const [key, name] of Object.entries(tabs)) {
      const onTab = exhibits.filter((e) => e.tab === key).length;
      expect(new Set(charts.filter((c) => c.sheet === name).map((c) => c.part)).size, name).toBe(onTab + exhibits.filter((e) => e.tab === key && e.ratio).length);
      const ws = wb.getWorksheet(name)!;
      expect(ws.pageSetup.orientation, name).toBe("landscape");
      expect(ws.views[0]!.showGridLines, name).toBe(false);
      const sheetXml = await zip.file(await sheetPart(zip, name))!.async("string");
      const breaks = (/<rowBreaks[^>]*>([\s\S]*?)<\/rowBreaks>/.exec(sheetXml)?.[1]?.match(/<brk /g) ?? []).length;
      expect(breaks + 1, name).toBe(Math.ceil(onTab / 2));
    }
    expect(exhibits.length).toBeLessThanOrEqual(17);
    for (const { xml } of charts) {
      expect(xml).toContain('<c:autoTitleDeleted val="1"/>');
      expect(xml).toContain('<c:plotVisOnly val="0"/>');
      expect(xml).not.toMatch(/schemeClr|sysClr/);
      expect(xml).toMatch(/<c:x val="0.05"\/>[\s\S]*<c:w val="0.94"\/>/);
    }
  });

  it("captions name the chart window and every data row is matched on the month", () => {
    const revenue = wb.getWorksheet("Revenue Charts")!;
    expect(ev.value("Revenue Charts", 5, 2)).toBe("Monthly Total Revenue, Jan-23 – Dec-25 ($000s)");
    const formulas = formulasOf(revenue).map((x) => x.f);
    expect(formulas.some((f) => /^INDEX\('Monthly P&L'![^,]+,MATCH\(\$B\d+,'Monthly P&L'!/.test(f))).toBe(true);
    expect(formulas.some((f) => /^EOMONTH\('Assumptions'!\$C\$\d+,-36\)\+1$/.test(f))).toBe(true);
  });

  it("the lint catches a theme colour, a stale cache and a series named from the wrong row", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const [first] = await readCharts(zip);
    const xml = first!.xml
      .replace('<a:srgbClr val="7B0000"/>', '<a:schemeClr val="accent6"/>')
      .replace(/(<c:numCache>[\s\S]*?<c:pt idx="2"><c:v>)[^<]*/, "$1999")
      .replace(/(<c:tx><c:strRef><c:f>[^<]*\$B\$)(\d+)/, (_, head: string, r: string) => `${head}${Number(r) + 1}`);
    zip.file(first!.part, xml);
    const out = file.replace(/\.xlsx$/, "-chart.xlsx");
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
    const v = await verifyWorkbook(out, model);
    const issues = v.lint.map((l) => l.issue).join("\n");
    expect(issues).toContain("theme or system colour");
    expect(issues).toContain("cached value 999 at point 2");
    expect(issues).toContain("series name is not the B cell of its value row");
  }, 120_000);
});

describe("the sample request folder, as ingested", () => {
  it("verifies too: rows without months are prorated in the month grid as the engine prorates them", async () => {
    const ds = (await gatherIntake(row, REPO, () => {})).dataset;
    const { model: ingested, file: ingestedFile } = await build(ds, "ingested");
    expect(ingested.namedOutputs.AdjEBITDA_LTM).toBeCloseTo(385_725, 6);
    const v = await verifyWorkbook(ingestedFile, ingested);
    expect(v.errors).toEqual([]);
    expect(v.mismatches).toEqual([]);
    expect(v.lint).toEqual([]);
  }, 180_000);
});

describe("annual-only workbook (guide 5.2A)", () => {
  it("omits the monthly tabs and still verifies", async () => {
    const full = ridgelineDataset();
    const { model: annual, file: annualFile } = await build({ ...full, monthly: undefined, sourceGranularity: "annual", asOfMonth: undefined, depositsByMonth: undefined }, "annual");
    const v = await verifyWorkbook(annualFile, annual);
    expect(v.errors).toEqual([]);
    expect(v.mismatches).toEqual([]);
    expect(v.lint).toEqual([]);
    const names = (await (async () => {
      const w = new ExcelJS.Workbook();
      await w.xlsx.readFile(annualFile);
      return w.worksheets.map((ws) => ws.name);
    })());
    for (const monthlyOnly of ["Monthly P&L", "Proof of Cash", "Raw - Bank", "Revenue Charts", "Headcount Charts"]) expect(names).not.toContain(monthlyOnly);
    expect(names).toContain("Databook");
    // Revenue Detail and Expense Detail are status A (always built): the fiscal years and the cases, no strip (QA round 3 F4).
    expect(names).toEqual(expect.arrayContaining(["Revenue Detail", "Expense Detail"]));
    const w = new ExcelJS.Workbook();
    await w.xlsx.readFile(annualFile);
    const detail = w.getWorksheet("Expense Detail")!;
    expect([6].flatMap((r) => [3, 4, 5, 7, 8, 9].map((c) => String(detail.getCell(r, c).result ?? detail.getCell(r, c).value)))).toEqual(["FY2023", "FY2024", "FY2025", "Low", "Mid", "High"]);
    expect(detail.pageSetup.orientation).toBe("portrait");

    // The SUN page (guide 5.2A): banded expense lines each with a % Sales row, the subsections, the vertical rule on E, the
    // SDE box with its DSCR row in the case columns, portrait.
    const pnl = w.getWorksheet("P&L Summary")!;
    const rowOf = (label: string) => pnl.getColumn(2).values.findIndex((v) => v === label);
    const payroll = rowOf("Salaries, Wages and Benefits");
    expect(pnl.getCell(payroll + 1, 2).value).toBe("% Sales");
    expect(pnl.getCell(payroll + 1, 3).formula).toMatch(/^IFERROR\(C\d+\/C\d+,"n\.m\."\)$/);
    expect(pnl.getColumn(2).values.filter((v) => v === "% Sales")).toHaveLength(6);
    for (const c of [2, 3, 5, 7, 9]) expect((pnl.getCell(payroll, c).fill as ExcelJS.FillPattern).fgColor?.argb, `banded col ${c}`).toBe("FFF2F2F2");
    expect(pnl.getCell(payroll, 6).fill).toBeUndefined();
    for (const label of ["Expenses", "EBITDA Bridge", "Business Valuation", "Financing"]) expect(pnl.getCell(rowOf(label), 2).font?.underline, label).toBe(true);
    for (const r of [5, payroll, rowOf("EBITDA Bridge")]) expect(pnl.getCell(r, 5).border?.right?.style, `rule on E${r}`).toBe("thin");
    const sde = rowOf("Seller's Discretionary Earnings (SDE)");
    expect(pnl.getCell(sde + 2, 2).value).toBe("DSCR (SBA loan only)");
    expect(pnl.getCell(sde + 2, 8).formula).toMatch(/^'Valuation'!D\d+$/);
    expect(pnl.getCell(sde + 2, 8).result).toBeCloseTo(annual.valuationDetail!.cases.mid.financing.dscr, 6);
    expect(pnl.getCell(sde + 2, 9).border?.bottom?.style).toBe("thin");
    expect(pnl.getCell(sde, 4).result).toBeCloseTo(annual.periods.FY2024!.ladder.sde / 1000, 6);
    expect(pnl.pageSetup.orientation).toBe("portrait");
  }, 180_000);
});

describe("scenario block per-case inputs (QA round 3 F12, F21)", () => {
  it("lists the six recast and financing rows by case, and a case typed over moves only its own valuation", async () => {
    const ds = ridgelineDataset();
    const assumptions = defaultAssumptions(ds, row);
    const base = runModel(ds, assumptions);
    assumptions.scenarios.high.financing = { loanRate: 0.08, replacementSalary: 110_000 };
    const model = runModel(ds, assumptions);
    const file = path.join(dir, "scenario-inputs.xlsx");
    await writeWorkbook({ row, dataset: ds, assumptions, model, firmName: "AMB Advisory Services", preparedOn: "2026-09-28" }, file);
    const v = await verifyWorkbook(file, model);
    expect(v.errors).toEqual([]);
    expect(v.mismatches).toEqual([]);
    const [lowB, midB, highB] = (["low", "mid", "high"] as const).map((k) => base.valuationDetail!.cases[k].financing);
    const [low, mid, high] = (["low", "mid", "high"] as const).map((k) => model.valuationDetail!.cases[k].financing);
    expect([low!.dscr, mid!.dscr]).toEqual([lowB!.dscr, midB!.dscr]);
    expect(high!.rate).toBe(0.08);
    // $15K more replacement salary at the 15% burden comes off the High case's cash flow for debt service.
    expect(high!.cashFlowAvailable).toBeCloseTo(highB!.cashFlowAvailable - 15_000 * 1.15, 6);
    expect(high!.dscr).not.toBeCloseTo(highB!.dscr, 3);

    const w = new ExcelJS.Workbook();
    await w.xlsx.readFile(file);
    const a = w.getWorksheet("Assumptions")!;
    const labels = a.getColumn(2).values;
    for (const label of ["Owner replacement salary ($)", "Capital reserve ($)", "Deferred capex / renovation ($)", "Equity injection (%)", "Loan term (years)", "Interest rate (%)"]) expect(labels, label).toContain(label);
    const rate = labels.findIndex((x) => x === "Interest rate (%)");
    expect(a.getCell(rate, 4).formula).toMatch(/^\$C\$\d+$/);
    expect(a.getCell(rate, 5).value).toBe(0.08);
    expect(a.getCell(rate, 6).value).toBe("Per AMB, by case");
    const val = w.getWorksheet("Valuation")!;
    const vRate = val.getColumn(2).values.findIndex((x) => x === "Interest Rate");
    expect(val.getCell(vRate, 5).formula).toMatch(/Assumptions'!\$E\$\d+$/);
    // The earnings basis is one set of figures under its own header, not the Low case's.
    const basisRow = val.getColumn(2).values.findIndex((x) => typeof x === "string" && x.startsWith("Earnings basis"));
    expect(val.getCell(basisRow, 3).value).toBe("LTM Dec-25");
  }, 180_000);
});

// The cases the sample does not cover (QA round 1): each goes through the real ingest, the engine, the
// workbook and the verifier, which must agree cell for cell or the pipeline refuses to deliver.
describe("period and balance-sheet cases beyond the sample", () => {
  async function run(s: Scenario, name: string) {
    const bundle = await gatherIntake(s.row, REPO, () => {});
    const ds = bundle.dataset;
    const assumptions = defaultAssumptions(ds, s.row);
    const out = runModel(ds, assumptions);
    const file = path.join(dir, `${name}.xlsx`);
    await writeWorkbook({ row: s.row, dataset: ds, assumptions, model: out, firmName: "AMB Advisory Services", preparedOn: "2026-09-28" }, file);
    const v = await verifyWorkbook(file, out);
    return { ds, out, v, file };
  }
  const clean = (v: VerifyResult) => {
    expect(v.errors).toEqual([]);
    expect(v.mismatches).toEqual([]);
    expect(v.lint).toEqual([]);
    expect(v.ok).toBe(true);
  };

  it("an as-of month that does not close the fiscal year: [S2] and [S3] run through every YTD and LTM month", async () => {
    const { ds, out, v, file: midFile } = await run(midYear(31, { ytdAddbacks: false }), "mid-year");
    clean(v);
    expect(ds.years).toEqual([2023, 2024]);
    // The dollar roll-forward runs on fiscal years, so with an LTM that is no fiscal year there is no GDR_LTM / NDR_LTM: the
    // names are left undefined and the engine's are null, never a fiscal-year figure labelled LTM (QA round 2 F18).
    expect(out.customers?.retention).toBeDefined();
    expect([out.namedOutputs.GDR_LTM, out.namedOutputs.NDR_LTM]).toEqual([null, null]);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(midFile);
    const names = (book.definedNames as unknown as { model: { name: string }[] }).model.map((n) => n.name);
    expect(names).not.toContain("GDR_LTM");
    // The customer list is by fiscal year, so its concentration table is FY2024's, not the LTM's: no Top10Share_LTM (QA round 3 F17).
    expect(out.namedOutputs.Top10Share_LTM).toBeNull();
    expect(names).not.toContain("Top10Share_LTM");
    expect(names).toContain("AdjEBITDA_LTM");
    const ltm = out.periods["LTM2025-07"]!.ladder;
    const ytd = out.periods["YTD2025-07"]!.ladder;
    expect(ltm.marketReplacement).toBeCloseTo(-109_250, 4);
    expect(ytd.marketReplacement).toBeCloseTo((-109_250 * 7) / 12, 4);
    expect(ltm.capitalReserve).toBeCloseTo(-out.assumptions!.recast.capitalReserve, 4);
    expect(out.namedOutputs.PFAdjEBITDA).toBeCloseTo(ltm.adjEbitda, 4);
    // One mode measure: the data layer's test equals the engine's PF Adj. EBITDA before the reserve.
    expect(ds.mode!.measure).toBeCloseTo(modeMeasure(out.periods["PF2025-07"]!.ladder), 4);
    // Without YTD amounts, a recurring add-back is run-rated from FY2024, a one-time one is zero in the stub, and each is listed.
    const legal = out.adjustments.find((a) => a.row.description.startsWith("Legal fees"))!;
    expect(legal.row.stub).toBe("zero");
    expect(legal.byColumn["YTD2025-07"]).toBe(0);
    expect(ds.warnings.some((w) => /Legal fees.*zero in Jan-25–Jul-25/.test(w))).toBe(true);
    const vehicle = out.adjustments.find((a) => a.row.description === "Owner's personal vehicle")!;
    expect(vehicle.row.stub).toBe("run_rate");
    expect(vehicle.byColumn["YTD2025-07"]).toBeGreaterThan(0);
    expect(ds.warnings.some((w) => /Owner's personal vehicle.*run-rate of FY2024/.test(w))).toBe(true);
  }, 240_000);

  it("the owner payroll-tax row [S4] carries its amount into SDE and Adj. EBITDA, and held back as proposed it still verifies (F6, F20)", async () => {
    const ds = ridgelineDataset();
    const s4 = ds.adjustments!.find((a) => a.description === "Payroll taxes and benefits on owner compensation")!;
    expect(s4.status).toBe("accepted");
    s4.status = "proposed";
    const { model: held, file: heldFile } = await build(ds, "s4-proposed");
    const v = await verifyWorkbook(heldFile, held);
    expect(v.errors).toEqual([]);
    expect(v.mismatches).toEqual([]);
    expect(v.lint).toEqual([]);
    expect(model.namedOutputs.SDE_LTM! - held.namedOutputs.SDE_LTM!).toBeCloseTo(13_860, 6);
    expect(model.namedOutputs.AdjEBITDA_LTM! - held.namedOutputs.AdjEBITDA_LTM!).toBeCloseTo(13_860, 6);
  }, 240_000);

  it("a June fiscal year-end with December balance sheets", async () => {
    const { ds, out, v } = await run(juneYearEnd(), "june-fye");
    clean(v);
    expect(ds.years).toEqual([2024, 2025]);
    expect(out.columns.filter((c) => !c.projected).map((c) => c.label)).toContain("LTM Dec-25");
    // Every dated sheet has a Balance Sheet column, so NWC reads the same dates.
    expect(out.databook!.bs.some((r) => r.byMonth["2025-12"] !== undefined)).toBe(true);
    expect(out.nwc!.periods.map((p) => p.month)).toEqual(["2023-12", "2024-12", "2025-12"]);
    expect(out.historical.at(-1)!.bs!.estimated).toBe(false);
  }, 240_000);

  it("a lower-middle-market deal keeps an [S3] row at zero", async () => {
    const { ds, out, v } = await run(lowerMiddleMarket(), "lmm");
    clean(v);
    expect(out.mode.mode).toBe("lowerMiddleMarket");
    const s3 = ds.adjustments!.find((a) => a.category === "capital_reserve")!;
    expect(s3.byFiscalYear[2025]).toBe(0);
    expect(out.periods["LTM2025-12"]!.ladder.capitalReserve).toBe(0);
  }, 240_000);

  it("monthly balance sheets give the trailing-twelve-month NWC peg (C20)", async () => {
    const { out, v } = await run(monthlyBalanceSheets(), "monthly-bs");
    clean(v);
    expect(out.nwc!.pegBasis).toBe("T12M average");
    expect(out.nwc!.periods).toHaveLength(14);
    expect(out.checks.find((c) => c.id === "C20")!.status).toBe("OK");
  }, 240_000);

  it("a fourth, earlier statement date opens a cash-flow year", async () => {
    const { out, v } = await run(fourDateBalanceSheet(), "four-date-bs");
    clean(v);
    expect(out.cashFlow!.map((y) => y.fiscalYear)).toEqual([2023, 2024, 2025]);
  }, 240_000);

  it("annual books with an accepted pro forma row: the mode ignores what the engine cannot apply", async () => {
    const { ds, out, v } = await run(annualWithProForma(), "annual-pf");
    clean(v);
    expect(ds.sourceGranularity).toBe("annual");
    expect(ds.mode!.measure).toBeCloseTo(modeMeasure(out.periods.FY2025!.ladder), 4);
    expect(ds.warnings.some((w) => /pro forma rows are not applied in annual-only mode/.test(w))).toBe(true);
  }, 240_000);
});

// QA round 1 fixes, read off the written Ridgeline workbook (and, where a lint must fire, a copy edited to break it).
describe("QA round 1 fixes on the written workbook", () => {
  const rowOfLabel = (ws: ExcelJS.Worksheet, label: string, col = 2) => ws.getColumn(col).values.findIndex((v) => v === label);
  /** Save an edited copy through ExcelJS and verify it: only the lint the edit targets is asserted. */
  async function editAndVerify(edit: (book: ExcelJS.Workbook) => void, suffix: string): Promise<VerifyResult> {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    edit(book);
    const out = file.replace(/\.xlsx$/, `-${suffix}.xlsx`);
    await book.xlsx.writeFile(out);
    return verifyWorkbook(out, model);
  }

  it("prices the reference structure beside the SBA-only illustration and names the binding case (F8)", () => {
    const val = wb.getWorksheet("Valuation")!;
    const deal = wb.getWorksheet("Deal Structure")!;
    const ref = rowOfLabel(val, "DSCR, Reference structure (with seller note)");
    const dscr = rowOfLabel(val, "DSCR (SBA loan only)");
    expect(ref).toBeGreaterThan(0);
    expect(ev.value("Valuation", ref, 4)).toBeCloseTo(ev.value("Deal Structure", rowOfLabel(deal, "DSCR"), 3) as number, 9);
    // The grid is SBA-only, so its note says so before naming the binding case (QA round 3 F5).
    expect(ev.value("Valuation", dscr, 7)).toMatch(/^SBA loan only: (Low|Mid|High) case binds at \d\.\d\dx, (below|clearing) the 1\.25x hurdle$/);
    expect(rowOfLabel(wb.getWorksheet("Summary")!, "DSCR, Reference structure (x)")).toBeGreaterThan(0);
  });

  it("values each Main Street case on its own pro forma SDE from the scenario block (F10)", () => {
    const val = wb.getWorksheet("Valuation")!;
    const r = val.getColumn(2).values.findIndex((v, i) => v === "SDE" && i > rowOfLabel(val, "Business valuation"));
    const sde = [3, 4, 5].map((c) => ev.value("Valuation", r, c) as number);
    expect(sde[0]).toBeLessThan(sde[1]!);
    expect(sde[1]).toBeLessThan(sde[2]!);
    expect(rowOfLabel(wb.getWorksheet("Assumptions")!, "Revenue growth (%)")).toBeGreaterThan(0);
  });

  it("completes Deal Structure: Form 8594, the boot flag, cards apart from liens, S&U totals ruled not boxed (F22)", () => {
    const deal = wb.getWorksheet("Deal Structure")!;
    const goodwill = rowOfLabel(deal, "Goodwill (residual)");
    const total = rowOfLabel(deal, "Total (equals the Purchase Price)");
    expect(goodwill).toBeGreaterThan(0);
    expect(ev.value("Deal Structure", total, 3)).toBeCloseTo(model.deal![0]!.purchasePrice / 1000, 9);
    expect(ev.value("Deal Structure", rowOfLabel(deal, "(-) Credit Card Balances Paid at Close"), 3)).toBeCloseTo(-14.6, 9);
    expect(ev.value("Deal Structure", rowOfLabel(deal, "Tax flag: stock consideration"), 3)).toBe("None: no buyer stock intended to be tax-deferred (Assumptions)");
    const uses = rowOfLabel(deal, "Total Uses");
    expect(deal.getCell(uses, 3).border?.top?.style).toBe("thin");
    expect(deal.getCell(uses, 3).border?.bottom?.style).toBe("double");
    expect(deal.getCell(uses, 2).border?.left).toBeUndefined();
    const assumptions = wb.getWorksheet("Assumptions")!;
    const rate = rowOfLabel(assumptions, "Senior / SBA loan interest rate");
    expect(assumptions.getCell(rate, 3).font?.color?.argb).toBe("FFFF0000");
    for (const label of ["True-up settlement", "Stock consideration intended tax-deferred? (Y/N)", "Deferred revenue and customer deposits", "Premises arrangement"]) expect(rowOfLabel(assumptions, label), label).toBeGreaterThan(0);
  });

  it("derives Proof of Cash months from AsOfDate and flags each month outside 5% (F20)", () => {
    const poc = wb.getWorksheet("Proof of Cash")!;
    expect((poc.getCell("B8").value as { formula?: string }).formula).toMatch(/EOMONTH\(/);
    expect((poc.getCell("B9").value as { formula?: string }).formula).toBe("EOMONTH(B8,0)+1");
    const flags: string[] = [];
    for (let r = 8; r < 20; r++) {
      const pct = ev.value("Proof of Cash", r, 6);
      const flag = ev.value("Proof of Cash", r, 8);
      if (typeof pct === "number" && Math.abs(pct) > 0.05) flags.push(String(flag));
      else expect(flag).toBe("");
    }
    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) expect(f).toBe("Explain: variance above the threshold");
    // The 5% is the Checks tab's C14 tolerance, linked in green, and every flag reads that one cell (QA round 2 F12).
    const at = rowOfLabel(poc, "Flag threshold (Checks tab, C14 tolerance)");
    const link = (poc.getCell(at, 6).value as { formula?: string }).formula!;
    expect(link).toMatch(/^'Checks'!\$F\$\d+$/);
    const checks = wb.getWorksheet("Checks")!;
    expect(checks.getCell(Number(link.split("$").at(-1)), 2).value).toBe("C14");
    expect(ev.value("Proof of Cash", at, 6)).toBe(0.05);
    expect(poc.getCell(at, 6).font?.color?.argb).toBe("FF008000");
    expect((poc.getCell(8, 8).value as { formula?: string }).formula).toContain(`$F$${at}`);
  });

  it("allocates monthly add-backs by formula on the account they come out of, not as typed decimals (F18)", () => {
    const adj = wb.getWorksheet("Adjustments")!;
    const monthHeader = adj.getRow(6).values as unknown[];
    const monthCols = monthHeader.map((v, c) => (v && typeof v === "object" && "formula" in (v as object) && c > 24 ? c : 0)).filter(Boolean);
    expect(monthCols.length).toBeGreaterThanOrEqual(36);
    // Rows that follow a P&L account or an Assumptions input; a row whose months the seller dated (a one-off legal settlement) stays a typed input.
    for (const label of ["Interest expense", "Owner's personal vehicle", "Charitable contributions", "Owner compensation", "Payroll taxes and benefits on owner compensation"]) {
      const r = rowOfLabel(adj, label, 3);
      expect(r, label).toBeGreaterThan(0);
      for (const c of monthCols) expect(typeof adj.getCell(r, c).value, `${label} ${adj.getCell(r, c).address}`).toBe("object");
    }
  });

  it("ties the Databook to the raw export month by month, so offsetting errors fail (F17)", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    const db = book.getWorksheet("Databook")!;
    // Two months of the first account, moved in opposite directions: the total still ties, the months do not.
    const [a, b2] = [db.getCell(8, 17), db.getCell(8, 18)];
    a.value = (a.value as number) + 100;
    b2.value = (b2.value as number) - 100;
    const out = file.replace(/\.xlsx$/, "-offset.xlsx");
    await book.xlsx.writeFile(out);
    const e = await evaluateWorkbook(out);
    const tie = e.workbook.getWorksheet("Databook")!.getRow(6).values as unknown[];
    const diffCol = tie.findIndex((v) => v === "Diff, all periods");
    expect(e.value("Databook", 8, diffCol)).toBeCloseTo(Math.SQRT2 * 100, 6);
    expect(e.value("Databook", 8, diffCol + 1)).toBe("CHECK");
  }, 180_000);

  it("lints a typed copy of a Databook balance and a file path in any cell (F7, F11)", async () => {
    const v = await editAndVerify((book) => {
      const dl = book.getWorksheet("Debt-Like Items")!;
      dl.getCell("C8").value = 146.8;
      book.getWorksheet("Summary")!.getCell("J20").value = "/Users/frank/Clients/Ridgeline Comfort Services LLC/QuickBooks.csv";
    }, "typed");
    expect(v.lint.some((l) => l.cell === "'Debt-Like Items'!C8" && /copies a Databook balance/.test(l.issue))).toBe(true);
    expect(v.lint.some((l) => l.cell === "'Summary'!J20" && /file path/.test(l.issue))).toBe(true);
  }, 180_000);

  it("boxes the sensitivity frontier through a styled rule, prints the 0.25x axis at two decimals, and lints an empty rule style (F9)", async () => {
    expect(model.sensitivities![0]!.colAxis.fmt).toBe(FMT.multiple2);
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const styles = await zip.file("xl/styles.xml")!.async("string");
    const dxfs = [...(/<dxfs[^>]*>([\s\S]*?)<\/dxfs>/.exec(styles)![1]!).matchAll(/<dxf\/>|<dxf>[\s\S]*?<\/dxf>/g)].map((m) => m[0]);
    const part = await sheetPart(zip, "Sensitivities");
    const xml = await zip.file(part)!.async("string");
    const frontier = /<cfRule type="expression" dxfId="(\d+)"[^>]*><formula>[A-Z]+\d+&gt;=/.exec(xml);
    expect(frontier, "frontier rule").toBeTruthy();
    expect(dxfs[Number(frontier![1])]).toMatch(/<border>[\s\S]*style="thin"/);
    // An empty style draws nothing; the verifier refuses it.
    zip.file("xl/styles.xml", styles.replace(dxfs[Number(frontier![1])]!, "<dxf/>"));
    const out = file.replace(/\.xlsx$/, "-emptydxf.xlsx");
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
    const v = await verifyWorkbook(out, model);
    expect(v.lint.some((l) => /empty style/.test(l.issue))).toBe(true);
  }, 180_000);

  it("orders the version log, empties the divider, formats raw tabs per 5.10 and greys n.a. cells (F23)", () => {
    const contents = wb.getWorksheet("Contents")!;
    const log = rowOfLabel(contents, "Version");
    expect([2, 3, 4, 5].map((c) => contents.getCell(log, c).value)).toEqual(["Version", "Date", "Prepared by", "Change"]);
    const divider = wb.getWorksheet("Data -->")!;
    let cells = 0;
    divider.eachRow((r) => r.eachCell(() => cells++));
    expect(cells).toBe(0);
    // Raw figures use the body format of every analysis tab (5.10), not a two-decimal accounting format.
    const body = wb.getWorksheet("P&L Summary")!.getCell(10, 3).numFmt;
    for (const name of ["Raw - P&L", "Raw - BS"]) {
      wb.getWorksheet(name)!.eachRow((r, n) => {
        if (n > 3) r.eachCell((c) => typeof c.value === "number" && expect(c.numFmt, `${name}!${c.address}`).toBe(body));
      });
    }
    const val = wb.getWorksheet("Valuation")!;
    const na = rowOfLabel(val, "(-) Debt-Like Items");
    expect(val.getCell(na, 3).value).toBe("n.a.");
    expect(argb(val.getCell(na, 3))).toBe("FFD9D9D9");
  });

  it("freezes panes only on tabs wider than a screen and writes subtitles as '<Purpose> (<units>)' (F19)", () => {
    for (const name of ["Balance Sheet", "Cash Flow", "NWC", "Assumptions", "Projections", "Checks"]) expect(wb.getWorksheet(name)!.views[0]?.state, name).not.toBe("frozen");
    for (const ws of wb.worksheets.filter((w) => !w.name.startsWith("Raw - ") && !["Cover", "Contents", "Data -->"].includes(w.name))) {
      const subtitle = String(ws.getCell("B3").value ?? "");
      if (ws.name !== "Mapping") expect(subtitle, ws.name).toMatch(/\((\$|#|\$000s|#, \$|\$ unless stated|tab units)[^)]*\)$/);
      // Title case before the units: every word longer than three letters starts with a capital.
      expect(subtitle.replace(/\s*\([^)]*\)$/, "").split(/[\s:,]+/).filter((w) => /^[a-z]/.test(w) && w.length > 3), ws.name).toEqual([]);
    }
  });
});

// QA round 2 workbook minors, read off the written Ridgeline workbook (and a copy edited to break a rule the lint must catch).
describe("QA round 2 fixes on the written workbook", () => {
  const rowOfLabel = (ws: ExcelJS.Worksheet, label: string, col = 2) => ws.getColumn(col).values.findIndex((v) => v === label);
  async function editAndVerify(edit: (book: ExcelJS.Workbook) => void, suffix: string): Promise<VerifyResult> {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    edit(book);
    const out = file.replace(/\.xlsx$/, `-${suffix}.xlsx`);
    await book.xlsx.writeFile(out);
    return verifyWorkbook(out, model);
  }

  it("writes [S4] as a formula on [S1] at the statutory rates, which are blue inputs on Assumptions (F12)", () => {
    const adj = wb.getWorksheet("Adjustments")!;
    const label = rowOfLabel(adj, "Payroll taxes and benefits on owner compensation", 3);
    // The figures sit on the row's line in the Figures by period block, whose Adjustment cell links the schedule row (verification F24).
    let r = label;
    adj.eachRow((row, n) => {
      if ((row.getCell(3).value as { formula?: string } | null)?.formula === `C${label}`) r = n;
    });
    expect(r).toBeGreaterThan(label);
    const statutory: number[] = [];
    adj.getRow(r).eachCell((c, col) => {
      const f = (c.value as { formula?: string } | null)?.formula;
      if (f && /^ROUND\(MIN\(/.test(f)) {
        expect(f).toMatch(/'Assumptions'!\$C\$\d+/);
        statutory.push(ev.value("Adjustments", r, col) as number);
      }
    });
    expect(statutory.sort()).toEqual([12.584, 13.25, 13.86]);
    const assumptions = wb.getWorksheet("Assumptions")!;
    const rate = rowOfLabel(assumptions, "Social Security rate");
    expect(assumptions.getCell(rate, 3).value).toBe(0.062);
    expect(assumptions.getCell(rate, 3).font?.color?.argb).toBe("FF0000FF");
    expect(assumptions.getCell(rowOfLabel(assumptions, "Social Security wage base, FY2025"), 3).value).toBe(176_100);
  });

  it("colours every formula that reaches another sheet green, string builders included, and the lint catches one left black (F12)", async () => {
    const summary = wb.getWorksheet("Summary")!;
    let crossSheetText = 0;
    summary.eachRow((row) => row.eachCell((c) => {
      const f = (c.value as { formula?: string } | null)?.formula;
      // Header bands keep their white; every other cross-sheet string builder is a green link.
      if (f && f.replace(/"(?:[^"]|"")*"/g, "").includes("!") && /&/.test(f) && c.font?.color?.argb !== "FFFFFFFF") {
        crossSheetText++;
        expect(c.font?.color?.argb, c.address).toBe("FF008000");
      }
    }));
    expect(crossSheetText).toBeGreaterThan(0);
    const v = await editAndVerify((book) => {
      const ws = book.getWorksheet("Summary")!;
      ws.eachRow((row) => row.eachCell((c) => {
        const f = (c.value as { formula?: string } | null)?.formula;
        if (f && /&/.test(f) && f.includes("!") && c.font?.color?.argb !== "FFFFFFFF") c.font = { ...c.font, color: { argb: "FF000000" } };
      }));
    }, "black-link");
    expect(v.lint.some((l) => /reaching another sheet in black/.test(l.issue))).toBe(true);
  }, 120_000);

  it("writes plain sources, and the lint catches a guide or precedent code in a cell (F19)", async () => {
    const assumptions = wb.getWorksheet("Assumptions")!;
    const sources = (assumptions.getColumn(9).values as unknown[]).filter((v): v is string => typeof v === "string");
    expect(sources.some((s) => /AMB default: 70-80% cash at close/.test(s))).toBe(true);
    for (const s of sources) expect(s).not.toMatch(/\bguide \d|\bICP\d|\bBENP\b|\bSUNPA\b|\(Q\d+\)/);
    const v = await editAndVerify((book) => {
      const ws = book.getWorksheet("Assumptions")!;
      ws.getCell(rowOfLabel(ws, "Cash at close, % of price"), 9).value = "AMB precedent (MISC, ICP5)";
    }, "internal-code");
    expect(v.lint.some((l) => /internal guide or precedent code/.test(l.issue))).toBe(true);
  }, 120_000);

  it("prints currency on the first row and totals only, and statement dates as mmm-yy (F16)", () => {
    const co = wb.getWorksheet("Customer Overview")!;
    const first = 8;
    // The reader drops the format strings' escapes, so both sides are compared without them.
    const plain = (f: string | undefined) => (f ?? "").replace(/\\/g, "");
    expect(plain(co.getCell(first, 5).numFmt)).toBe(plain(FMT.currency));
    expect(plain(co.getCell(first + 1, 5).numFmt)).toBe(plain(FMT.body));
    expect(plain(co.getCell(first + 1, 7).numFmt)).toBe(plain(FMT.body));
    for (const tab of ["Balance Sheet", "NWC"]) expect(plain(wb.getWorksheet(tab)!.getCell(6, 3).numFmt), tab).toBe(plain(FMT.monthHeader));
  });

  it("recomputes every P&L Summary line from the grid's months another way, not the grid's own SUMIFS block (C03, F17)", () => {
    const pnl = wb.getWorksheet("P&L Summary")!;
    const r = rowOfLabel(pnl, "Check: every line less its grid months");
    expect(r).toBeGreaterThan(0);
    // The check row totals one grey helper row per line (QA round 3 F15); each helper recomputes its line from two SUMIFs.
    const f = (pnl.getCell(r, 3).value as { formula?: string }).formula!;
    const [, first, last] = /SUM\(C(\d+):C(\d+)\)/.exec(f)!.map(Number);
    expect(last! - first!).toBeGreaterThan(5);
    for (let h = first!; h <= last!; h++) {
      const hf = (pnl.getCell(h, 3).value as { formula?: string }).formula!;
      expect(hf, `helper row ${h}`).toMatch(/SUMIF\('Monthly P&L'!\$\w+\$6:\$\w+\$6,"<="&/);
      expect(hf, `helper row ${h}`).not.toMatch(/'Monthly P&L'!C\d/);
      expect(ev.value("P&L Summary", h, 3), `helper row ${h}`).toBeCloseTo(0, 6);
    }
    expect(ev.value("P&L Summary", r, 3)).toBeCloseTo(0, 6);
  });

  it("ties the debt-like total to what NWC removes at the latest date (C19, F54)", () => {
    const checks = wb.getWorksheet("Checks")!;
    const r = rowOfLabel(checks, "C19");
    expect((checks.getCell(r, 5).value as { formula?: string }).formula).toMatch(/^ABS\('Debt-Like Items'!\$C\$\d+-\('NWC'!\$\w+\$\d+/);
    expect(ev.value("Checks", r, 5)).toBeCloseTo(0, 9);
    expect(ev.value("Checks", r, 7)).toBe("OK");
  });
});

describe("verification round 1 fixes on the written workbook", () => {
  const rowOfLabel = (ws: ExcelJS.Worksheet, label: string, col = 2) => ws.getColumn(col).values.findIndex((v) => v === label);
  const formulaOf = (c: ExcelJS.Cell) => (c.value as { formula?: string } | null)?.formula;
  /** A tab's print ranges as the file defines them, without sheet names or $ signs ("B2:L26"). */
  async function printAreasOf(name: string): Promise<string[]> {
    const xml = await (await JSZip.loadAsync(fs.readFileSync(file))).file("xl/workbook.xml")!.async("string");
    const sheets = [...xml.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
    const m = new RegExp(`<definedName name="_xlnm.Print_Area" localSheetId="${sheets.indexOf(name)}">([^<]*)</definedName>`).exec(xml);
    return m ? m[1]!.split(",").map((a) => a.replace(/^.*!/, "").replace(/\$/g, "")) : [];
  }

  it("computes the Monthly P&L's prior-year YTD and LTM growth from the grid a year earlier (F10)", () => {
    const monthly = wb.getWorksheet("Monthly P&L")!;
    const growth = rowOfLabel(monthly, "% Growth");
    expect(growth).toBeGreaterThan(0);
    // G = YTD Dec-24 and J = LTM Dec-24: Jan-Dec 2023 is on the grid, so both are FY2024 over FY2023, as on the P&L Summary.
    for (const c of [7, 10]) {
      expect(formulaOf(monthly.getCell(growth, c)), `col ${c}`).toMatch(/SUMIFS\(.*EOMONTH\(.*,-13\)\+1/);
      expect(Number(ev.value("Monthly P&L", growth, c))).toBeCloseTo(2_718_600 / 2_406_800 - 1, 6);
    }
    // The oldest fiscal year has no year-earlier months on the grid: n.a.
    expect(monthly.getCell(growth, 3).value).toBe("n.a.");
  });

  it("opens each detail strip with its LTM and PF columns, links to the summary block, and prints them with the strip (F11)", async () => {
    for (const name of ["Revenue Detail", "Expense Detail"]) {
      const ws = wb.getWorksheet(name)!;
      const groups = new Map<string, number>();
      for (let c = 16; c <= 40; c++) {
        const v = ws.getCell(5, c).value;
        if (typeof v === "string" && !groups.has(v)) groups.set(v, c);
      }
      const ltm = groups.get("LTM")!;
      const pf = groups.get("PF")!;
      const strip = [...groups.entries()].find(([k]) => /^LTM Monthly/.test(k))![1];
      expect(ltm, name).toBeGreaterThan(15);
      expect(pf, name).toBe(ltm + 2);
      expect(strip, name).toBeGreaterThan(pf);
      // Each head cell links to the summary block's LTM Dec-25 (K) on its row.
      expect(formulaOf(ws.getCell(9, ltm + 1)), name).toBe("K9");
      // The strip's print range starts at the head.
      const areas = await printAreasOf(name);
      expect(areas[1], name).toMatch(new RegExp(`^${colLetter(ltm)}2:`));
    }
  });

  it("lists unpaid bonuses and payroll taxes as an open debt-like item: accrued wages do not answer it (F13)", () => {
    const dl = wb.getWorksheet("Debt-Like Items")!;
    const r = rowOfLabel(dl, "Unpaid bonuses and payroll taxes");
    expect(r).toBeGreaterThan(0);
    expect(dl.getCell(r, 3).value).toBe("n.a.");
    expect(model.debtLike!.checklist!.map((x) => x.item)).toContain("Unpaid bonuses and payroll taxes");
  });

  it("reads every check a tab carries into its Contents row: its own check rows, C15 and the raw tabs' ties (F19)", () => {
    const contents = wb.getWorksheet("Contents")!;
    const rowOf = (tab: string) => contents.getColumn(3).values.findIndex((v) => v === tab || (typeof v === "object" && v !== null && (v as { result?: string }).result === tab));
    for (const tab of ["Customer Retention", "Cohorts", "Summary", "Concentration", "Opportunities", "Raw - Bank", "Raw - Customers", "Raw - Payroll", "Raw - P&L"]) {
      const r = rowOf(tab);
      expect(r, tab).toBeGreaterThan(0);
      expect(formulaOf(contents.getCell(r, 6)), tab).toBeTruthy();
      expect(ev.value("Contents", r, 6), tab).toBe("OK");
    }
    // Customer Retention's own row ("Check: listed revenue less Raw - Customers") and Cohorts' two are read by value.
    expect(formulaOf(contents.getCell(rowOf("Customer Retention"), 6))).toMatch(/COUNTIFS\('Customer Retention'!\$C\$\d+:\$E\$\d+,">0\.0005"\)/);
    expect(formulaOf(contents.getCell(rowOf("Cohorts"), 6))!.match(/COUNTIFS\('Cohorts'/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it("forms the export totals on the Databook's own rows and tags personal accounts with their refs (F20)", () => {
    const db = wb.getWorksheet("Databook")!;
    const income = rowOfLabel(db, "Total Income");
    const q = formulaOf(db.getCell(income, 17))!;
    // No criteria range on another tab: the sections sit on the Databook's rows, to the blank row under the grid.
    expect(q).toMatch(/^SUMIFS\(Q\$8:Q\$\d+,\$[A-Z]+\$8:\$[A-Z]+\$\d+,"Income"\)$/);
    expect(q).not.toMatch(/Raw - P&L/);
    const [, end] = /Q\$8:Q\$(\d+)/.exec(q)!;
    const last = db.getColumn(2).values.findIndex((v, i) => i > 8 && (v === null || v === undefined)) ;
    expect(Number(end)).toBe(last);
    expect(Number(ev.value("Databook", income, 11))).toBeCloseTo(3_040_800, 0);
    const tags = db.getColumn(6).values.filter((v) => typeof v === "string" && v.startsWith("(+) "));
    expect(tags).toContain("(+) Charitable contributions [N4]");
    for (const t of tags) expect(String(t)).toMatch(/\[N\d+\]/);
  });

  it("prints the Adjustments schedule's own figures, one line per row, with no mirror copy (F24)", async () => {
    const adj = wb.getWorksheet("Adjustments")!;
    const areas = await printAreasOf("Adjustments");
    expect(areas).toHaveLength(2);
    const [, fromCol, fromRow] = /^\$?([A-Z]+)\$?(\d+):/.exec(areas[1]!)!;
    expect(fromCol).toBe("N");
    const figHead = Number(fromRow);
    expect(adj.getCell(figHead, 3).value).toBe("Figures by period");
    // The block holds the inputs themselves: [S1]'s FY2025 is a formula over its monthly spread, not a link to another row.
    const s1 = figHead + 1 + model.adjustments.findIndex((a) => a.row.ref === "S1");
    expect(ev.value("Adjustments", s1, 2)).toBe("[S1]");
    expect(formulaOf(adj.getCell(s1, 16))).toMatch(/^SUMIFS\(\$Y\d+:\$\w+\d+,/);
    // The schedule rows above carry no figures, so the model holds each figure once.
    const schedS1 = 8 + model.adjustments.findIndex((a) => a.row.ref === "S1");
    expect(adj.getCell(schedS1, 16).value).toBeNull();
    for (let r = figHead; r < figHead + model.adjustments.length + 1; r++) expect(String(adj.getCell(r, 3).value ?? ""), `row ${r}`).not.toMatch(/links\)/);
  });
});
