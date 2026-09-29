// Print legibility and the render check (guide 5.11, C37). The plan layer
// sizes every printed tab so 9 pt body text renders at 7 pt or more; the
// render check proves it on the written file with LibreOffice, and its
// result becomes C37 and the master check.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { masterCheckOf, withRenderCheck } from "../src/model/checks.ts";
import { runModel } from "../src/model/engine.ts";
import { assess, badBreaks, printedTabsOf, renderCheckWorkbook, type Span } from "../src/model/renderCheck.ts";
import { clippedTexts, fitPrintWidth, MIN_PRINT_SCALE, paginate, printScaleOf, type SheetPlan } from "../src/model/sheet.ts";
import { planWorkbook, writeWorkbook } from "../src/model/workbook.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { sampleRow, tmpDir } from "./helpers.ts";

const row = sampleRow();
const plansFor = (ds: FinancialDataset) => {
  const model = runModel(ds, defaultAssumptions(ds, row));
  return { model, plans: planWorkbook(model, { dataset: ds, codeName: row.code_name, businessName: row.business_name, firmName: "AMB Advisory Services", preparedOn: "2026-09-28" }).plans };
};

const hasRenderTools = (() => {
  try {
    execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 30_000 });
    execFileSync("python3", ["-c", "import pymupdf"], { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
})();

describe("print legibility (guide 5.11)", () => {
  it("prints every tab of the monthly and the annual model at the legibility floor or larger", () => {
    const monthly = ridgelineDataset();
    const annual: FinancialDataset = { ...monthly, monthly: undefined, sourceGranularity: "annual", asOfMonth: undefined, depositsByMonth: undefined };
    for (const ds of [monthly, annual]) {
      for (const p of plansFor(ds).plans) {
        if (!p.print.areas.length) continue;
        expect(printScaleOf(p), p.name).toBeGreaterThanOrEqual(MIN_PRINT_SCALE);
      }
    }
  });

  it("wraps labels at the guide widths instead of widening the label column past them", () => {
    const { plans } = plansFor(ridgelineDataset());
    for (const name of ["P&L Summary", "Summary", "Deal Structure", "NWC"]) {
      const p = plans.find((x) => x.name === name)!;
      expect(p.widths.get(2), name).toBeLessThanOrEqual(48);
    }
    // A label longer than the column wraps; it is never cut.
    const pnl = plans.find((x) => x.name === "P&L Summary")!;
    const long = [...pnl.cells.entries()].find(([k, c]) => k.endsWith(":2") && typeof c.v === "string" && c.v.length * 0.9 > pnl.widths.get(2)! && c.style !== "section" && c.style !== "note");
    if (long) expect(long[1].align?.wrap, String(long[1].v)).toBe(true);
  });

  it("narrows text columns before turning a tab landscape, and only when portrait cannot reach the floor", () => {
    const plan = (widths: number[]): SheetPlan => ({
      key: "t",
      name: "T",
      cells: new Map([["8:2", { v: "A long row label, one the planned sixty-unit column holds on a single line but a narrower column cannot", style: "line" }]]),
      widths: new Map(widths.map((w, i) => [i + 1, w])),
      hiddenCols: new Set(),
      colOutline: new Map(),
      heights: new Map(),
      rowOutline: new Map(),
      merges: [],
      cf: [],
      names: [],
      images: [],
      print: { areas: [`B2:${String.fromCharCode(64 + widths.length)}40`], landscape: false, fitToWidth: 1, fitToHeight: 0, rowBreaks: [], colBreaks: [] },
      output: true,
    }) as unknown as SheetPlan;
    const narrow = plan([1.7, 60, 11, 11, 11, 0.9, 30]);
    fitPrintWidth(narrow);
    expect(narrow.print.landscape).toBe(false);
    expect(printScaleOf(narrow)).toBeGreaterThanOrEqual(MIN_PRINT_SCALE);
    expect(narrow.widths.get(2)).toBeLessThan(60);
    expect(narrow.cells.get("8:2")!.align?.wrap).toBe(true);
    const wide = plan([1.7, 34, ...Array(12).fill(9.1), 0.9, 30]);
    fitPrintWidth(wide);
    expect(wide.print.landscape).toBe(true);
    expect(printScaleOf(wide)).toBeGreaterThanOrEqual(MIN_PRINT_SCALE);
  });
});

describe("nothing cut at a cell edge (F11)", () => {
  it("finds text that runs into a filled neighbour, by its alignment", () => {
    const p = {
      key: "t",
      name: "T",
      cells: new Map<string, object>([
        ["8:2", { v: "Version" }],
        ["8:3", { v: "Date" }],
        ["9:4", { v: "Latest year" }],
        ["9:5", { v: "% of sales, 3-year blended", align: { horizontal: "right" } }],
        ["10:2", { v: "A label that runs on across empty cells" }],
        ["11:2", { v: "A long label that wraps inside its own column", align: { wrap: true } }],
        ["11:3", { v: 1 }],
      ]),
      widths: new Map([[2, 4], [3, 10], [4, 11], [5, 11]]),
      hiddenCols: new Set(),
      merges: [],
      print: { areas: ["B2:E12"], landscape: true, fitToWidth: 1, fitToHeight: 0, rowBreaks: [], colBreaks: [] },
    } as unknown as SheetPlan;
    expect(clippedTexts(p)).toEqual([
      { cell: "B8", text: "Version" },
      { cell: "E9", text: "% of sales, 3-year blended" },
    ]);
  });

  it("leaves no printed text of the monthly or the annual Ridgeline model cut", () => {
    const monthly = ridgelineDataset();
    const annual: FinancialDataset = { ...monthly, monthly: undefined, sourceGranularity: "annual", asOfMonth: undefined, depositsByMonth: undefined };
    for (const ds of [monthly, annual]) for (const p of plansFor(ds).plans) expect(clippedTexts(p), p.name).toEqual([]);
  });
});

describe("page breaks at block boundaries (QA round 3 F1, F7)", () => {
  const line = (t: string, y: number, x = 36): Span => ({ t, x0: x, y0: y, x1: x + t.length * 4.5, y1: y + 8, size: 7.4 });
  const body = (labels: string[], y0 = 90) => labels.flatMap((t, i) => [line(t, y0 + i * 12), line(`${(i + 1) * 10}`, y0 + i * 12, 300)]);
  const title = [line("Ridgeline Comfort Services LLC", 50)];
  const furniture = new Set(["Ridgeline Comfort Services LLC", "Account"]);
  const sections = new Set(["Sensitivity Assumptions", "Tie Outs"]);
  const repeated = new Set(["Ridgeline Comfort Services LLC@36,50"]);

  it("flags a heading left at a page foot and a page that opens inside a block", () => {
    const p1 = [...title, ...body(["Row 1", "Row 2", "Row 3", "Row 4", "Row 5"]), line("Sensitivity Assumptions", 160)];
    const p2 = [...title, ...body(["Earnings Midpoint", "Earnings Step", "Multiple Midpoint", "Multiple Step", "Tie Outs", "Tie Out Valuation"])];
    expect(badBreaks([p1, p2], repeated, sections, furniture)).toEqual(['p1: the heading "Sensitivity Assumptions" ends the page, apart from its block', 'p2: opens inside a block at "Earnings Midpoint"']);
    const clean2 = [...title, line("Sensitivity Assumptions", 78), ...body(["Earnings Midpoint", "Earnings Step", "Multiple Midpoint", "Multiple Step", "Tie Outs"])];
    expect(badBreaks([p1.slice(0, -1), clean2], repeated, sections, furniture)).toEqual([]);
  });

  it("reads a page of further columns as a continuation, its period header line as furniture", () => {
    // Page 2 prints the months after page 1's: the label column repeats (set aside) and the header line is the tab's own.
    const p1 = [...title, line("Account", 70), line("Jan-24", 70, 300), line("Sensitivity Assumptions", 82), ...body(["Row 1", "Row 2", "Row 3", "Row 4", "Row 5"])];
    const p2 = [...title, line("Account", 70), line("Jan-25", 70, 300), ...Array.from({ length: 6 }, (_, i) => line(`${(i + 1) * 10}`, 90 + i * 12, 120))];
    expect(badBreaks([p1, p2], repeated, sections, furniture)).toEqual([]);
  });

  it("flags a last page of fewer than five rows as a widow", () => {
    const p1 = [...title, ...body(["Row 1", "Row 2", "Row 3", "Row 4", "Row 5", "Row 6"])];
    const p2 = [...title, ...body(["Row 7", "Row 8"])];
    expect(badBreaks([p1, p2], repeated, sections, furniture)).toEqual(["p2: prints only 2 rows (a widow page)"]);
  });

  it("moves a block that would split onto the next page whole, and keeps a forced break", () => {
    const cells = new Map<string, object>();
    for (let r = 7; r <= 80; r++) cells.set(`${r}:2`, { v: `Row ${r}`, style: r === 50 ? "section" : "line" });
    const plan = (rowBreaks: number[]) =>
      ({
        key: "t",
        name: "T",
        cells: new Map(cells),
        widths: new Map([[2, 30], [3, 12]]),
        hiddenCols: new Set(),
        heights: new Map(),
        merges: [],
        charts: [],
        output: true,
        print: { areas: ["B2:C80"], landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6", rowBreaks, colBreaks: [] },
      }) as unknown as SheetPlan;
    // Rows 7-49 fit a portrait page with room to spare; the block from the heading at 50 does not, so it starts page 2.
    const p = plan([]);
    paginate(p);
    expect(p.print.rowBreaks).toEqual([49]);
    const forced = plan([30]);
    paginate(forced);
    expect(forced.print.rowBreaks[0]).toBe(30);
  });

  it("starts the Sensitivities settings block on a page of its own under three grids", () => {
    const p = plansFor(ridgelineDataset()).plans.find((x) => x.name === "Sensitivities")!;
    const heading = [...p.cells.entries()].find(([, c]) => c.v === "Sensitivity Assumptions")![0];
    expect(p.print.rowBreaks).toContain(Number(heading.split(":")[0]) - 1);
  });
});

describe("verifier coverage", () => {
  it("gives every formula on an output tab an engine expectation, the title link and Print toggle aside", () => {
    for (const p of plansFor(ridgelineDataset()).plans.filter((x) => x.output)) {
      const bare = [...p.cells.entries()].filter(([k, c]) => {
        const [r, col] = k.split(":").map(Number) as [number, number];
        return c.f && c.expect === undefined && !(r === 2 && col === 2) && !(p.toggle && r === p.toggle.row && col === p.toggle.col);
      });
      expect(bare.map(([k]) => k), p.name).toEqual([]);
    }
  });
});

describe("render check (C37)", () => {
  it("fails a tab whose body text renders under 7 pt, a tab past the margin and a tab that never rendered", () => {
    const r = assess(
      [
        { sheet: "Summary", body: 7.2, over: 0 },
        { sheet: "NWC", body: 6.1, over: 0 },
        { sheet: "Databook", body: 7.4, over: 2 },
        { sheet: "Sensitivities", body: 7.1, over: 0 },
        { sheet: null, body: 9, over: 0 },
      ],
      ["Summary", "NWC", "Databook", "Sensitivities", "Checks"],
    );
    expect(r.status).toBe("CHECK");
    expect(r.issues).toEqual([
      "NWC: body text renders at 6.1 pt (floor 7.0 pt)",
      "Databook: 2 text spans past the right margin",
      // Sensitivities carries its own floor: 80% of full size (guide C37).
      "Sensitivities: body text renders at 7.1 pt (floor 7.2 pt)",
      "Checks: no page rendered",
    ]);
  });

  it("fails a page that prints text cut at a cell edge or over its neighbour, an orphan page and a stretched row (F5)", () => {
    const span = (t: string, x0: number, y0: number, x1 = x0 + t.length * 4.5): Span => ({ t, x0, y0, x1, y1: y0 + 8, size: 7.4 });
    const header = [span("Ridgeline Comfort Services LLC", 36, 50), span("Account", 36, 70)];
    const rows = Array.from({ length: 6 }, (_, i) => [span(`Line ${i + 1} label`, 36, 90 + i * 12), span(`${(i + 1) * 100}`, 300, 90 + i * 12)]).flat();
    const r = assess(
      [
        // Page 1: a clipped label, two cells drawn over each other and a clean wrapped last line ("Credit Card").
        { sheet: "Mapping", body: 7.4, over: 0, spans: [...header, ...rows, span("Owner / officer compensatio", 36, 170), span("Versi", 36, 182, 60), span("Date", 55, 182, 80), span("Credit Card", 36, 194)] },
        // Page 2: the repeated title and header over one stray note.
        { sheet: "Mapping", body: 7.4, over: 0, spans: [...header, span("Note: rows mapped by default are shaded.", 36, 90)] },
        // A tab repeating its label column: a row 5 lines tall with one line printed.
        { sheet: "Adj. EBITDA", body: 7.4, over: 0, spans: [...rows.slice(0, 8), span("Tall row label", 36, 140), span("Next label", 36, 190), span("100", 300, 190)] },
      ],
      [
        { name: "Mapping", texts: ["Ridgeline Comfort Services LLC", "Account", "Owner / officer compensation", "Version", "Date", "Liabilities > Current Liabilities > Credit Cards", "Current Liabilities : Credit Cards : Business Credit Card", "Note: rows mapped by default are shaded."] },
        { name: "Adj. EBITDA", texts: ["Tall row label", "Next label"], titleColumns: true },
      ],
    );
    expect(r.status).toBe("CHECK");
    expect(r.issues).toEqual([
      'Mapping p1: "Owner / officer compensatio" is cut from "Owner / officer compensation"',
      'Mapping p1: "Versi" overlaps "Date"',
      "Mapping p2: prints no figures (an empty or orphan page)",
      'Adj. EBITDA p1: row "Tall row label" is 6.3 lines tall with one line printed',
    ]);
  });

  it("records the result as C37 and lifts the pending qualifier off the master check only when it ran", () => {
    const model = runModel(ridgelineDataset(), defaultAssumptions(ridgelineDataset(), row));
    expect(model.masterCheck).toBe("All checks OK (render check pending)");
    const ok = withRenderCheck(model.checks, { status: "OK", issues: [], note: "31 tabs rendered" });
    expect(ok.masterCheck).toBe("All checks OK");
    expect(ok.checks.find((c) => c.id === "C37")).toMatchObject({ status: "OK", note: "31 tabs rendered" });
    const bad = withRenderCheck(model.checks, { status: "CHECK", issues: ["NWC: body text renders at 6.1 pt (floor 7.0 pt)"], note: "NWC: body text renders at 6.1 pt (floor 7.0 pt)" });
    expect(bad.masterCheck).toBe("1 check failing");
    expect(masterCheckOf(bad.checks.map((c) => (c.id === "C12" ? { ...c, status: "CHECK" as const } : c)))).toBe("2 checks failing");
    const missing = withRenderCheck(model.checks, { status: "n.a.", issues: [], note: "Render check not run: soffice missing" });
    expect(missing.masterCheck).toBe("All checks OK (render check pending)");
    expect(missing.checks.find((c) => c.id === "C37")).toMatchObject({ status: "Pending", note: "Render check not run: soffice missing" });
  });

  it.runIf(hasRenderTools)("passes the written Ridgeline workbook", async () => {
    const ds = ridgelineDataset();
    const a = defaultAssumptions(ds, row);
    const model = runModel(ds, a);
    const file = path.join(tmpDir("amb-c37-"), "ridgeline.xlsx");
    const { plans } = await writeWorkbook({ row, dataset: ds, assumptions: a, model, firmName: "AMB Advisory Services", preparedOn: "2026-09-28" }, file);
    const printed = printedTabsOf(plans, row.business_name).filter((t) => t.name !== "Contents" || plans.some((p) => p.output && p.name === t.name));
    const r = renderCheckWorkbook(file, printed);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe("OK");
    expect(r.tabs.map((t) => t.name)).toEqual(printed.map((t) => t.name));
    for (const t of r.tabs) expect(t.bodyPt, t.name).toBeGreaterThanOrEqual(7);
  }, 300_000);
});
