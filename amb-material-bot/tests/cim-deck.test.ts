// The CIM engine end to end on fixtures: which pages the planner builds for
// the full Ridgeline dataset and for a Main Street deal with annual
// statements only (guide 3.5), the page contract every content page keeps
// (an action title, an exhibit, a source line), the hard bans of guide 4.4,
// the length targets of guide 3.4, dividers (D12), and a pptx that passes the
// Office schema validator.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CimCopy } from "../src/cim/copy.ts";
import { customerNounVariant, lintText } from "../src/cim/copy.ts";
import type { CimContext } from "../src/cim/context.ts";
import { buildContext } from "../src/cim/context.ts";
import { buildCim } from "../src/cim/deck.ts";
import type { Block } from "../src/cim/design.ts";
import { draftCimCopy } from "../src/cim/narrative.ts";
import type { DeckPlan, PlanOptions } from "../src/cim/planner.ts";
import { planDeck, TARGETS } from "../src/cim/planner.ts";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import type { RequestRow } from "../src/requests/schema.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { sampleRow, tmpDir } from "./helpers.ts";

const VALIDATE = "/root/.claude/skills/synced/9488611f-533e-4a4e-a7db-3d27cfc06d7d_1c4ec00c-4815-46b3-96f7-9a90ccea73a3/pptx/scripts/office/validate.py";
const firm = { name: "AMB Advisory Services", contact: "Frank Moneymaker, Principal", email: "info@ambadvisoryservices.com", phone: "813.364.2178" };
const date = new Date("2026-10-05T12:00:00Z");

/** The same business with annual statements only: no monthly grid, customer list, payroll register, bank deposits or KPIs. */
function annualOnly(): FinancialDataset {
  const ds = ridgelineDataset();
  delete ds.monthly;
  delete ds.asOfMonth;
  delete ds.customers;
  delete ds.payroll;
  delete ds.depositsByMonth;
  delete ds.kpis;
  ds.sourceGranularity = "annual";
  for (const a of ds.adjustments ?? []) delete a.byMonth;
  for (const l of ds.revenueLines ?? []) delete l.byMonth;
  return ds;
}

interface Deal {
  row: RequestRow;
  ds: FinancialDataset;
  copy: CimCopy;
  ctx: CimContext;
  plan: DeckPlan;
}

async function deal(ds: FinancialDataset, row: RequestRow, opts: PlanOptions = {}): Promise<Deal> {
  const out = runModel(ds, defaultAssumptions(ds, row));
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const { copy } = await draftCimCopy({ row, notes: "", dataset: ds, model: out, firm, date });
    const ctx = buildContext({ row, ds, out, copy, firm, date });
    return { row, ds, copy, ctx, plan: planDeck(ctx, opts) };
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
}

const ridgelineDeal = () => deal(ridgelineDataset(), sampleRow());
// Another business name, so the Ridgeline copy fixture does not apply and the templated copy is exercised.
const annualDeal = (opts?: PlanOptions) => deal(annualOnly(), { ...sampleRow(), business_name: "Annual Statements LLC", source_folder: "deals/none" }, opts);

const stateOf = (plan: DeckPlan, id: string) => plan.modules.find((m) => m.id === id);
const pageIds = (plan: DeckPlan) => plan.pages.map((p) => p.draft.id);

/** Every client-facing string a page prints in prose: title, paragraphs, observations, callouts and text-table cells. */
function pageStrings(blocks: Block[], title: string): string[] {
  const out = [title];
  for (const b of blocks) {
    if (b.kind === "prose") out.push(...b.paragraphs.map((p) => `${p.lead ?? ""} ${p.body}`));
    if (b.kind === "observations") out.push(...b.items.map((i) => `${i.lead} ${i.body}`));
    if (b.kind === "callout") out.push(`${b.lead} ${b.body}`);
    if (b.kind === "textTable") out.push(...b.spec.rows.flat().map((c) => (typeof c === "string" ? c : `${c.lead} ${c.body}`)));
  }
  return out;
}

const blocksOf = (p: DeckPlan["pages"][number]): Block[] => p.draft.spec!.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]);

describe("planner: full Ridgeline dataset", () => {
  it("builds the always sections and the conditional ones the data supports", async () => {
    const { plan } = await ridgelineDeal();
    const ids = pageIds(plan);
    for (const id of ["S0.1", "S0.2", "S0.3", "S1.1", "S1.2", "S1.3", "S1.4", "S2.2", "S2.3", "S4.1", "S4.2", "S5.1", "S6.1", "S6.3", "S6.4", "S7.1", "S7.2", "S8.1", "S10.1", "S11.1", "S11.2"]) {
      expect(ids, id).toContain(id);
    }
    // Pages follow library order.
    expect(ids.indexOf("S4.1")).toBeLessThan(ids.indexOf("S6.1"));
    expect(ids.indexOf("S7.1")).toBeLessThan(ids.indexOf("S7.2"));
  });

  it("merges thin modules onto the page the library names", async () => {
    const { plan } = await ridgelineDeal();
    expect(stateOf(plan, "S4.3")).toMatchObject({ state: "merged", host: "S4.2" });
    expect(stateOf(plan, "S6.2")).toMatchObject({ state: "merged", host: "S2.2" });
    // The owner table merges onto S1.4 when the notes fill half its cells; Ridgeline's fill 1 of 12, so it is omitted (verification F29).
    expect(stateOf(plan, "S5.4")).toMatchObject({ state: "omitted" });
    expect(stateOf(plan, "S5.4")?.reason).toMatch(/fill 1 of the owner responsibilities table's 12 cells/);
    expect(stateOf(plan, "S7.3")).toMatchObject({ state: "merged", host: "S7.2" });
    expect(stateOf(plan, "S8.2")).toMatchObject({ state: "merged", host: "S8.1" });
    // The process and contact take the term table's place on the overview (QA round 1 F43).
    expect(stateOf(plan, "S10.2")).toMatchObject({ state: "merged", host: "S10.1" });
  });

  it("omits the modules whose trigger fails and says why", async () => {
    const { plan } = await ridgelineDeal();
    // S9.1 sizes levers: the notes name five with baselines but no target, so the page waits for one (guide 3.3, QA round 1 F44).
    expect(stateOf(plan, "S9.1")?.reason).toMatch(/target/);
    for (const id of ["S3.1", "S3.2", "S3.3", "S4.5", "S6.5", "S9.1", "S9.2", "S11.5"]) {
      const m = stateOf(plan, id);
      expect(m?.state, id).toBe("omitted");
      expect(m?.reason, id).toBeTruthy();
    }
  });

  it("stays within the Main Street length target without dividers", async () => {
    const { ctx, plan } = await ridgelineDeal();
    expect(ctx.mainStreet).toBe(true);
    expect(plan.pages.length).toBeGreaterThanOrEqual(TARGETS.mainStreet[0]);
    expect(plan.pages.length).toBeLessThanOrEqual(TARGETS.mainStreet[1]);
    expect(plan.dividers).toBe(false);
  });
});

describe("planner: Main Street deal with annual statements only", () => {
  it("drops every page that needs monthly, customer or payroll data", async () => {
    const { plan } = await annualDeal();
    const ids = pageIds(plan);
    for (const id of ["S2.3", "S4.1", "S4.2", "S5.2", "S5.3", "S6.4", "S11.2", "S11.4"]) expect(ids, id).not.toContain(id);
    expect(stateOf(plan, "S4.1")?.reason).toMatch(/customer list/i);
    expect(stateOf(plan, "S6.4")?.reason).toMatch(/monthly/i);
    expect(stateOf(plan, "S11.2")?.reason).toMatch(/monthly/i);
  });

  it("keeps the executive summary, the earnings pages and the transaction pages", async () => {
    const { plan } = await annualDeal();
    const ids = pageIds(plan);
    for (const id of ["S1.1", "S1.2", "S1.3", "S1.4", "S6.1", "S7.1", "S7.2", "S8.1", "S10.1", "S11.1"]) expect(ids, id).toContain(id);
  });

  it("puts the one leased site on the people page instead of a page of its own", async () => {
    const { plan } = await annualDeal();
    expect(stateOf(plan, "S2.4")).toMatchObject({ state: "merged", host: "S5.1" });
  });

  it("stays under the length cap, with dividers only when forced", async () => {
    const auto = await annualDeal();
    expect(auto.plan.pages.length).toBeLessThanOrEqual(TARGETS.mainStreet[1]);
    expect(auto.plan.dividers).toBe(false);
    const on = await annualDeal({ dividers: "on" });
    expect(on.plan.dividers).toBe(true);
    expect(on.plan.pages.length).toBeGreaterThan(auto.plan.pages.length);
  });
});

describe("page contract", () => {
  for (const [name, make] of [["Ridgeline", ridgelineDeal], ["annual only", () => annualDeal()]] as const) {
    it(`${name}: every content page has an action title with a figure, an exhibit and a source line`, async () => {
      const { plan } = await make();
      const content = plan.pages.filter((p) => p.draft.kind === "content");
      expect(content.length).toBeGreaterThan(8);
      for (const p of content) {
        const spec = p.draft.spec!;
        expect(spec.title.length, p.draft.id).toBeGreaterThan(20);
        expect(spec.title.length, p.draft.id).toBeLessThanOrEqual(130);
        expect(spec.title, p.draft.id).toMatch(/\d/);
        expect(p.draft.exhibits.length, p.draft.id).toBeGreaterThanOrEqual(1);
        expect(spec.notes.source, p.draft.id).toMatch(/AMB Advisory analysis\.$/);
        expect(p.layout!.bottom, p.draft.id).toBeLessThanOrEqual(6.48);
      }
      for (const p of plan.pages.filter((x) => x.draft.kind === "reference")) {
        expect(p.draft.spec!.title, p.draft.id).toBeTruthy();
        expect(p.draft.exhibits.length, p.draft.id).toBeGreaterThanOrEqual(1);
        expect(p.draft.spec!.notes.source, p.draft.id).toBeTruthy();
      }
    });

    it(`${name}: no banned phrase, em dash, price talk or unresolved token on any page`, async () => {
      const { plan } = await make();
      const hard = /em dash|banned phrase|valuation or price/;
      for (const p of plan.pages.filter((x) => x.draft.spec)) {
        for (const text of pageStrings(blocksOf(p), p.draft.spec!.title)) {
          expect(lintText(text, p.draft.id).filter((i) => hard.test(i.issue)), `${p.draft.id}: ${text}`).toEqual([]);
          expect(text, p.draft.id).not.toMatch(/\{\{|\}\}|asking price/i);
        }
      }
    });

    it(`${name}: one noun for customers on every page, titles, tables and notes included (QA round 3 F37)`, async () => {
      const { plan, ctx } = await make();
      for (const p of plan.pages.filter((x) => x.draft.spec)) {
        const strings = [...pageStrings(blocksOf(p), p.draft.spec!.title), p.draft.spec!.notes.note ?? "", ...(p.draft.spec!.notes.footnotes ?? [])];
        for (const text of strings) expect(customerNounVariant(text, ctx.brief.customerNoun), `${p.draft.id}: ${text}`).toBeUndefined();
      }
    });
  }
});

describe("buildCim", () => {
  it("writes a pptx with one slide per planned page that passes the Office schema validator", { timeout: 120_000 }, async () => {
    const { row, ds, copy } = await ridgelineDeal();
    const out = runModel(ds, defaultAssumptions(ds, row));
    const file = path.join(tmpDir("amb-cim-"), "Project Ridgeline - CIM.pptx");
    const res = await buildCim({ row, ds, out, copy, firm, date }, file);
    expect(fs.existsSync(res.pptx)).toBe(true);
    const slides = new Set(fs.readFileSync(res.pptx).toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g));
    expect(slides.size).toBe(res.plan.pages.length);
    // Every placeholder the deck prints is listed for the advisor.
    expect(res.openQuestions.length).toBeGreaterThan(0);
    expect(res.openQuestions.every((q) => q.trim().length > 0)).toBe(true);
    if (fs.existsSync(VALIDATE)) {
      const result = execFileSync("python3", [VALIDATE, res.pptx], { encoding: "utf8" });
      expect(result).toMatch(/PASSED/);
    }
  });
});
