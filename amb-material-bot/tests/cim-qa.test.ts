// QA round 1 rules for the CIM, checked on the planned and written deck:
// the numbers foot and agree across pages, titles wrap without widows,
// columns balance, typography is typographic, and each page element is
// drawn once. Plans run offline from the Ridgeline copy fixture and from
// templated copy for an annual-only deal.

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import { buildContext, resolvePageRefs } from "../src/cim/context.ts";
import { titleWidow } from "../src/cim/copy.ts";
import { buildCim } from "../src/cim/deck.ts";
import type { Block, NumTableSpec, PageSpec } from "../src/cim/design.ts";
import { footsWhenDisplayed, noteRounding, ROUNDING_CLAUSE, titleWrap } from "../src/cim/design.ts";
import { draftCimCopy } from "../src/cim/narrative.ts";
import type { DeckPlan } from "../src/cim/planner.ts";
import { planDeck } from "../src/cim/planner.ts";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import type { RequestRow } from "../src/requests/schema.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { sampleRow, tmpDir } from "./helpers.ts";

const firm = { name: "AMB Advisory Services", contact: "Frank Moneymaker, Principal", email: "info@ambadvisoryservices.com", phone: "813.364.2178" };
const date = new Date("2026-10-05T12:00:00Z");

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

async function plan(ds: FinancialDataset, row: RequestRow): Promise<DeckPlan> {
  const out = runModel(ds, defaultAssumptions(ds, row));
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const { copy } = await draftCimCopy({ row, notes: "", dataset: ds, model: out, firm, date });
    return planDeck(buildContext({ row, ds, out, copy, firm, date }));
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
}

const blocksOf = (spec: PageSpec): Block[] => spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]);

/** Every string a page prints: title, notes, headers, table cells, prose, observations, callouts. */
function printed(spec: PageSpec): string[] {
  const out = [spec.title, spec.notes.source ?? "", spec.notes.note ?? "", ...(spec.notes.footnotes ?? [])];
  for (const b of blocksOf(spec)) {
    if ("header" in b && b.header) out.push(b.header.title, b.header.units ?? "", b.header.annotation ?? "");
    if (b.kind === "numTable") for (const r of b.spec.rows) out.push(r.label, r.text ?? "", ...(r.vals ?? []));
    if (b.kind === "textTable") out.push(...(b.spec.head ?? []), ...b.spec.rows.flat().map((c) => (typeof c === "string" ? c : `${c.lead} ${c.body}`)));
    if (b.kind === "prose") out.push(...b.paragraphs.map((p) => `${p.lead ?? ""} ${p.body}`));
    if (b.kind === "observations") out.push(...b.items.map((i) => `${i.lead} ${i.body}`));
    if (b.kind === "callout") out.push(`${b.lead} ${b.body}`);
  }
  return out.filter(Boolean);
}

const decks: Record<string, () => Promise<DeckPlan>> = {
  "Ridgeline (reviewed copy)": () => plan(ridgelineDataset(), sampleRow()),
  "annual-only deal (templated copy)": () => plan(annualOnly(), { ...sampleRow(), business_name: "Annual Statements LLC", source_folder: "deals/none" }),
};

describe("deck-wide rules (QA round 1)", () => {
  for (const [name, make] of Object.entries(decks)) {
    let p: DeckPlan;
    beforeAll(async () => {
      p = await make();
    });
    const pages = () => p.pages.filter((x) => x.draft.spec).map((x) => ({ id: x.draft.id, num: x.num, spec: x.draft.spec! }));

    it(`${name}: no title leaves a word or two alone on its last line (F38)`, () => {
      for (const { id, spec } of pages()) expect(titleWidow(spec.title), `${id}: ${spec.title}`).toBeUndefined();
    });

    it(`${name}: straight quotes never print; apostrophes and quotes are typographic (F39)`, () => {
      for (const { id, spec } of pages()) for (const t of printed(spec)) expect(t, id).not.toMatch(/["']/);
    });

    it(`${name}: one label means one amount on every page (F26)`, () => {
      expect(p.warnings.filter((w) => / prints .* on page /.test(w))).toEqual([]);
    });

    it(`${name}: no maroon header cell prints empty, and a gap column only separates figures (F29, F40)`, () => {
      for (const { id, spec } of pages()) {
        for (const b of blocksOf(spec)) {
          if (b.kind === "textTable" && b.spec.head) for (const h of b.spec.head) expect(h.trim(), `${id}: ${b.header?.title}`).not.toBe("");
          if (b.kind === "numTable") {
            b.spec.cols.forEach((c, i) => {
              if (c.kind === "gap") expect([b.spec.cols[i - 1]?.kind, b.spec.cols[i + 1]?.kind], `${id}: ${b.spec.name}`).toEqual(["num", "num"]);
            });
          }
        }
      }
    });

    it(`${name}: a 100% stacked mix adds to exactly 100 in every period (F24)`, () => {
      for (const { spec } of pages()) {
        for (const b of blocksOf(spec)) {
          if (b.kind !== "chart" || b.spec.type !== "bars" || b.spec.grouping !== "percentStacked") continue;
          const series = b.spec.series;
          series[0]!.labels.forEach((label, i) => expect(series.reduce((s, x) => s + x.values[i]!, 0), label).toBe(100));
        }
      }
    });
  }

  it("Ridgeline: every two-column row ends within 0.50 in, and neighbouring pages differ in observation count (F30, F31)", async () => {
    const p = await decks["Ridgeline (reviewed copy)"]!();
    expect(p.warnings.filter((w) => /columns end|observations, as on/.test(w))).toEqual([]);
    // The process and contact share the overview page in place of a term table that repeated the executive summary (F43).
    expect(p.pages.map((x) => x.draft.id)).not.toContain("S10.2");
  });

  it("Ridgeline: the add-back quality answer is sized, and unconfirmed debt repayment stays a placeholder (F33, F44)", async () => {
    const p = await decks["Ridgeline (reviewed copy)"]!();
    const text = (id: string) => printed(p.pages.find((x) => x.draft.id === id)!.draft.spec!).join(" ");
    expect(text("S1.4")).toMatch(/Excluding the \$24\.0K resting on management representation \(N1, N3\) lowers the FY2025 Adj\. EBITDA margin by 79 bps/);
    expect(text("S8.1")).toMatch(/\[Confirm: repaid by the Seller at closing\]/);
  });
});

describe("footing as displayed (F27)", () => {
  const table = (vals: string[][]): NumTableSpec => ({
    name: "t",
    cols: [{ w: 2, kind: "label" }, { w: 0.8, kind: "num", head: "FY2025" }],
    rows: [
      { type: "line", label: "A", vals: vals[0] },
      { type: "line", label: "B", vals: vals[1] },
      { type: "subtotal", label: "Total", vals: vals[2] },
    ],
  }) as NumTableSpec;

  it("finds a total that misses its printed parts by rounding, and the page note then says so", () => {
    expect(footsWhenDisplayed(table([["$1,964"], ["812"], ["$2,776"]]))).toBe(true);
    expect(footsWhenDisplayed(table([["$1,964"], ["812"], ["$2,777"]]))).toBe(false);
    const spec = { id: "X", section: "S", title: "t", rows: [{ columns: [{ span: [1, 12], blocks: [{ kind: "numTable", spec: table([["$1,964"], ["812"], ["$2,777"]]) }] }] }], notes: { note: "Figures in USD thousands." } } as unknown as PageSpec;
    noteRounding(spec);
    expect(spec.notes.note).toBe(`Figures in USD thousands; ${ROUNDING_CLAUSE}.`);
  });
});

describe("page furniture", () => {
  it("wraps titles as the Georgia Bold title box does (F38)", () => {
    // Rendered: the first title fits one line; the second puts "revenue" alone on a second line.
    expect(titleWrap("Revenue per field employee rose from $141.6K in FY2023 to $168.9K in FY2025")).toHaveLength(1);
    expect(titleWrap("Ridgeline earned $371.9K of Adj. EBITDA (12.2% margin) on $3.04M of FY2025 revenue").at(-1)).toBe("revenue");
  });

  it("reads a reference to the page it prints on as 'this page'", () => {
    const pageOf = (id: string) => ({ "S10.2": 20, "S7.1": 16 })[id];
    expect(resolvePageRefs("on {{page:S10.2}}; see {{page:S7.1}}", pageOf, 20)).toBe("on this page; see page 16");
  });

  it("draws every text box and rule once: nothing stacked at the same position (F25)", { timeout: 120_000 }, async () => {
    const ds = ridgelineDataset();
    const row = sampleRow();
    const out = runModel(ds, defaultAssumptions(ds, row));
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { copy } = await draftCimCopy({ row, notes: "", dataset: ds, model: out, firm, date }).finally(() => {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    });
    const file = path.join(tmpDir("amb-cim-qa-"), "deck.pptx");
    await buildCim({ row, ds, out, copy, firm, date }, file);
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    for (const s of slides) {
      const xml = await zip.file(s)!.async("string");
      const seen = new Set<string>();
      for (const m of xml.matchAll(/<p:(sp|cxnSp)>([\s\S]*?)<\/p:\1>/g)) {
        const off = /<a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(m[2]!);
        if (!off) continue;
        // Rules and boxes count too: the doubled Observations header was a text box and a rule drawn twice.
        const text = [...m[2]!.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join("");
        const geometry = /prst="(\w+)"/.exec(m[2]!)?.[1] ?? "";
        const key = `${m[1]}|${geometry}|${off.slice(1).join(",")}|${text}`;
        expect(seen.has(key), `${s}: ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });
});
