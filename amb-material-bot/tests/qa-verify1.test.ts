// Verification round 1 after QA round 3: the findings the verifiers found
// still open, and the regression they noticed. Each case is built from the
// function that had the defect; the end-to-end shapes stay in
// tests/period-shapes.test.ts and tests/pipeline.test.ts.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext } from "../src/cim/context.ts";
import { adjustmentsByEvidence, costShiftChart, costStructure, earningsBuild, ownerTableFilled, usable } from "../src/cim/exhibits.ts";
import { columnArea, emptyRegion, footprintW, layoutPage, spanW, type Block, type PlacedBlock } from "../src/cim/design.ts";
import { planDeck, type PlannedPage } from "../src/cim/planner.ts";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { EN_DASH, MINUS, parseSigned } from "../src/util/format.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { sampleRow } from "./helpers.ts";

const row = sampleRow();
const firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };
const model = () => {
  const ds = ridgelineDataset();
  return { ds, out: runModel(ds, defaultAssumptions(ds, row)) };
};
const ctxOf = () => {
  const { ds, out } = model();
  return buildContext({ row, ds, out, copy: { open_questions: [] }, firm, date: new Date("2026-09-29") });
};
const fixtureCopy = () => JSON.parse(fs.readFileSync(path.join(process.cwd(), "samples/project-ridgeline/cim-copy.fixture.json"), "utf8")).copy;
/** The Ridgeline deck planned with its reviewed copy, as the demo builds it; `edit` changes the dataset first. */
const planned = (edit?: (ds: FinancialDataset) => void) => {
  const ds = ridgelineDataset();
  edit?.(ds);
  const out = runModel(ds, defaultAssumptions(ds, row));
  const ctx = buildContext({ row, ds, out, copy: fixtureCopy(), firm, date: new Date("2026-09-29") });
  return { ctx, plan: planDeck(ctx) };
};
const blocksOf = (p: PlannedPage): Block[] => (p.layout?.placed ?? []).map((x) => x.block);
type Table = Extract<Block, { kind: "numTable" }>;
type Chart = Extract<Block, { kind: "chart" }>;

describe("p14 cost-ratio chart signs (R1, F40)", () => {
  it("reads a printed signed figure back with its sign, whatever minus glyph it carries", () => {
    expect(parseSigned(`${MINUS}80`)).toBe(-80);
    expect(parseSigned(`${EN_DASH}80`)).toBe(-80);
    expect(parseSigned("-1,200")).toBe(-1200);
    expect(parseSigned("(25)")).toBe(-25);
    expect(parseSigned("+40")).toBe(40);
    expect(parseSigned("1,450")).toBe(1450);
    expect(parseSigned(`${MINUS}160 bps`)).toBe(-160);
    // The zero mark and text are no figure.
    expect(parseSigned(EN_DASH)).toBeNaN();
    expect(parseSigned("n.m.")).toBeNaN();
  });

  it("charts every cost-ratio change with the sign the table beside it prints", () => {
    const table = costStructure(ctxOf(), 7) as Table;
    const chart = costShiftChart(table) as Chart;
    const spec = chart.spec as Extract<Chart["spec"], { type: "hbar" }>;
    const printed = new Map(table.spec.rows.filter((r) => r.type === "line" && r.vals).map((r) => [r.label, r.vals!.at(-1)!]));
    expect(spec.values.length).toBeGreaterThan(1);
    // Ridgeline's largest moves are decreases (cost ratios fell as revenue grew): the bars must be negative.
    expect(spec.values.some((v) => v < 0)).toBe(true);
    spec.labels.forEach((label, i) => {
      const cell = printed.get(label)!;
      expect(cell.startsWith(MINUS) ? -1 : 1).toBe(Math.sign(spec.values[i]!));
      expect(Math.abs(spec.values[i]!)).toBe(Math.abs(parseSigned(cell)));
    });
  });

  it("labels the bars in the table's glyphs: + for an increase, U+2212 for a decrease, the en dash for zero", () => {
    const chart = costShiftChart(costStructure(ctxOf(), 7) as Table) as Chart;
    expect(chart.spec.format).toBe(`"+"#,##0;"${MINUS}"#,##0;"${EN_DASH}"`);
  });
});

describe("empty regions beside narrow blocks (F28)", () => {
  /** A numeric table `w` wide (label plus three figures) placed in a column `colW` wide. */
  const table = (w: number): Block => ({ kind: "numTable", header: { title: "T", units: "($000s)" }, spec: { name: "T", cols: [{ w: w - 1.86, kind: "label" }, { w: 0.62, kind: "num", head: "A" }, { w: 0.62, kind: "num", head: "B" }, { w: 0.62, kind: "num", head: "C" }], rows: [] } });
  const at = (block: Block, x: number, y: number, w: number, h: number): PlacedBlock => ({ block, x, y, w, h });

  it("finds the space beside a table narrower than its column, which the depth-under-columns check missed", () => {
    const colW = spanW(1, 8);
    // p5 before the fix: a full-height rail, the list across columns 1 to 8, the earnings build 4.2 in wide under it.
    const placed = [
      at({ kind: "prose", paragraphs: [{ body: "list" }] }, 0.45, 1.22, colW, 3.2),
      at(table(4.21), 0.45, 4.55, colW, 1.9),
      at({ kind: "chart", spec: { type: "hbar", labels: [], values: [] }, h: 5.1 }, 8.874, 1.22, 4.012, 5.26),
    ];
    expect(footprintW(placed[1]!.block, colW)).toBeCloseTo(4.21, 2);
    const hole = emptyRegion(placed)!;
    expect(hole).toBeDefined();
    expect(hole.x0).toBeGreaterThan(4.6);
    expect(hole.x1).toBeGreaterThan(8.5);
    expect(hole.y1 - hole.y0).toBeGreaterThanOrEqual(1.5);
    // The same table across its column leaves no hole.
    placed[1] = at(table(colW), 0.45, 4.55, colW, 1.9);
    expect(emptyRegion(placed)).toBeUndefined();
  });

  it("counts width in column area, so a hole two columns wide with its gutters is not larger than two columns", () => {
    expect(columnArea(0.45, 0.45 + spanW(1, 2) + 0.2)).toBeCloseTo(2 * 0.853, 3);
    const colW = spanW(1, 12);
    // A table ending two columns short of the band's right edge.
    const placed = [at(table(colW - spanW(1, 2) - 0.2), 0.45, 1.22, colW, 5.26)];
    expect(emptyRegion(placed)).toBeUndefined();
    placed[0] = at(table(colW - spanW(1, 3)), 0.45, 1.22, colW, 5.26);
    expect(emptyRegion(placed)).toBeDefined();
  });

  it("reports a hole as a build note from layoutPage", () => {
    const out = layoutPage({ id: "T1", section: "T", title: "T", rows: [{ columns: [{ span: [1, 12], blocks: [table(5)] }] }], notes: {} } as never);
    expect(out.warnings.some((w) => /T1: .* in empty at x/.test(w))).toBe(true);
  });

  it("leaves no such hole on any Ridgeline page; the earnings build runs the width of the list on p5", () => {
    const { plan } = planned();
    expect(plan.warnings.filter((w) => /empty at x|empty under/.test(w))).toEqual([]);
    const page = plan.pages.find((p) => p.draft.id === "S1.2")!;
    const placed = page.layout!.placed.find((p) => p.block.kind === "numTable" && p.block.header?.title === "Earnings build")!;
    // At the left of its column, it keeps only the table clearance (0.10 in) and the usable-width inset free.
    expect(footprintW(placed.block, placed.w)).toBeGreaterThan(placed.w - 0.25);
    const spec = (placed.block as Table).spec;
    expect(spec.cols.map((c) => c.head).filter(Boolean)).toEqual(["FY2023", "FY2024", "FY2025", "FY25 y/y", "CAGR", "Basis"]);
    // One line per row: the basis is chosen to fit, so the table never grows past the band.
    for (const r of spec.rows) expect(r.text === undefined || r.text.length < 60, r.label).toBe(true);
    expect(spec.rows.find((r) => r.key === "eb.adj")!.text).toMatch(/capital reserve \[S3\]/);
  });

  it("drops the basis column, then the growth, when the column is too narrow for them", () => {
    const ctx = ctxOf();
    const narrow = earningsBuild(ctx, 4.6) as Table;
    expect(narrow.spec.cols.some((c) => c.kind === "text")).toBe(false);
    const wide = earningsBuild(ctx, usable(1, 8)) as Table;
    expect(wide.spec.cols.some((c) => c.kind === "text")).toBe(true);
  });
});

describe("p7 owner table and its replacement (F29)", () => {
  it("leaves the owner table out when the notes fill fewer than half its cells, and asks for each column", () => {
    const { ctx, plan } = planned();
    expect(ownerTableFilled(ctx)).toEqual({ filled: 1, cells: 12, enough: false });
    expect(plan.modules.find((m) => m.id === "S5.4")).toMatchObject({ state: "omitted" });
    const page = plan.pages.find((p) => p.draft.id === "S1.4")!;
    const titles = blocksOf(page).map((b) => ("header" in b ? b.header?.title : undefined));
    expect(titles).not.toContain("Owner responsibilities and transition");
    expect(titles).toContain("Adjustments by evidence");
    for (const q of [/^Hours a week the owner spends on each duty/, /^Who assumes each of the owner's duties after closing/, /^What transition support the owner gives for each duty/]) expect(ctx.openQuestions.some((x) => q.test(x)), String(q)).toBe(true);
    // No placeholder cell on the page's tables: every figure is data.
    const cells = blocksOf(page).flatMap((b) => (b.kind === "numTable" ? b.spec.rows.flatMap((r) => [...(r.vals ?? []), r.text ?? ""]) : []));
    expect(cells.some((c) => /\[Confirm:/.test(c))).toBe(false);
    // Every observation keys into the evidence table.
    const obs = blocksOf(page).find((b) => b.kind === "observations") as Extract<Block, { kind: "observations" }>;
    const table = blocksOf(page).find((b) => b.kind === "numTable" && b.header?.title === "Adjustments by evidence") as Table;
    const keyed = table.spec.rows.flatMap((r) => (r.obs ?? "").split(",")).filter(Boolean);
    expect(keyed.sort()).toEqual(obs.items.map((i) => i.key).sort());
  });

  it("sums the evidence groups to the ladder's net adjustments in every column", () => {
    const ctx = ctxOf();
    const t = adjustmentsByEvidence(ctx, usable(1, 8)) as Table;
    const num = (s: string) => Number(s.replace(/[$,]/g, "").replace(/^\((.*)\)$/, "-$1"));
    const groups = t.spec.rows.filter((r) => r.type === "line");
    const net = t.spec.rows.find((r) => r.key === "ev.net")!;
    const addBacks = t.spec.rows.find((r) => r.key === "ev.addBacks")!;
    expect(groups.map((r) => r.key)).toEqual(["ev.documented", "ev.calculated", "ev.representation", "ev.deductions"]);
    net.vals!.forEach((v, i) => {
      const parts = groups.reduce((s, r) => s + num(r.vals![i]!), 0);
      expect(Math.abs(parts - num(v))).toBeLessThanOrEqual(2);
      expect(Math.abs(num(addBacks.vals![i]!) + num(groups.at(-1)!.vals![i]!) - num(v))).toBeLessThanOrEqual(1);
    });
    // FY2025 net matches the earnings build's adjustments line and the ladder.
    expect(net.vals!.at(-1)).toBe("$66");
    // Items name each adjustment with its ref, largest first, without the support page's qualifier.
    expect(groups.find((r) => r.key === "ev.deductions")!.text).toBe("Market replacement compensation\u00a0[S2]; Capital reserve\u00a0[S3]; Interest income\u00a0[N5]");
    expect(ctx.brief.t("adj.repShare.latest")).toBe("10%");
  });

  it("builds the owner table, not the evidence table, when the notes fill it", () => {
    const { plan } = planned((ds) => {
      for (const [i, r] of ds.intake!.owner.responsibilities.entries()) {
        r.hoursPerWeek = 10 + i;
        r.assumedBy = "Operations manager";
      }
    });
    expect(plan.modules.find((m) => m.id === "S5.4")).toMatchObject({ state: "merged", host: "S1.4" });
    const page = plan.pages.find((p) => p.draft.id === "S1.4")!;
    const owner = blocksOf(page).find((b) => b.kind === "textTable" && b.header?.title === "Owner responsibilities and transition") as Extract<Block, { kind: "textTable" }>;
    expect(owner.spec.head!.slice(0, 4)).toEqual(["Responsibility", "Hrs/wk", "Who assumes it post-close", "Transition support"]);
    expect(blocksOf(page).some((b) => b.kind === "numTable" && b.header?.title === "Adjustments by evidence")).toBe(false);
  });
});
