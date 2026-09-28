// The words and figures of the CIM: the voice lint (guide 4.4), the numbers
// brief that every figure in the copy resolves through, the Ridgeline copy
// fixture, and the formats every exhibit prints with (design spec 4.1).

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { unknownTokens } from "../src/cim/brief.ts";
import { buildContext } from "../src/cim/context.ts";
import { CimCopySchema, lintCopy, lintText, lintTitle, placeholdersIn } from "../src/cim/copy.ts";
import { COPY_FIXTURE, draftCimCopy } from "../src/cim/narrative.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel } from "../src/model/engine.ts";
import { describeDelta, fmtBps, fmtGrowth, fmtMoney, fmtPct, k } from "../src/util/format.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow } from "./helpers.ts";

const firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };

function ridgeline() {
  const ds = ridgelineDataset();
  const row = sampleRow();
  const out = runModel(ds, defaultAssumptions(ds, row));
  return { ds, row, out };
}

async function withoutApiKey<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    return await fn();
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
}

describe("copy lint", () => {
  const issues = (text: string) => lintText(text, "t").map((i) => i.issue);

  it("fails em dashes and dashes used as punctuation", () => {
    expect(issues("Revenue grew 12% — driven by commercial work.")).toContain("em dash");
    expect(issues("Revenue grew 12% - driven by commercial work.")).toContain("dash used as punctuation");
    expect(issues("Revenue grew from FY2023–FY2025 by 12%.")).toEqual([]);
  });

  it("fails the banned phrases and leverage as a verb", () => {
    expect(issues("A robust, well-positioned business with 52 accounts.")).toEqual(expect.arrayContaining(['banned phrase "robust"', 'banned phrase "well-positioned"']));
    expect(issues("A buyer can leverage the 1,450 members.")).toContain('banned phrase "leverage" as a verb');
    expect(issues("Seamless dispatch runs on ServiceTitan.")).toContain('banned phrase "seamless"');
    expect(issues("Best-in-class service across 3 counties.")).toContain('banned phrase "best-in-class"');
    expect(issues("Unparalleled reach.")).toContain('banned phrase "unparalleled"');
  });

  it("allows judgment adjectives only beside a figure", () => {
    expect(issues("Retention is strong.")).toContain('"strong" without a number in the sentence');
    expect(issues("Retention is strong at 97.1% of prior-year revenue.")).toEqual([]);
  });

  it("fails price talk and first person outside the transaction section", () => {
    expect(issues("The business is valued at $2.1M.")).toContain("valuation or price language (guide D5)");
    expect(issues("We expect 12% growth.")).toContain("first person outside the transaction section");
    expect(lintText("We will invite 5 buyers to a meeting.", "s10_1.process")).toEqual([]);
  });

  it("requires a figure in titles and caps their length", () => {
    expect(lintTitle("Financial overview", "t").map((i) => i.issue)).toContain("title carries no figure (a label, not a finding)");
    expect(lintTitle(`Revenue grew 12% ${"and more ".repeat(20)}`, "t").some((i) => /cap 130/.test(i.issue))).toBe(true);
    expect(lintTitle("Revenue grew at a 12.4% CAGR to $3.04M while Reported EBITDA doubled to $319.5K", "t")).toEqual([]);
  });

  it("flags figures typed as literals that the numbers brief does not hold, and unknown tokens", () => {
    const { ds, out } = ridgeline();
    const ctx = buildContext({ row: sampleRow(), ds, out, copy: { open_questions: [] }, firm, date: new Date() });
    const copy = CimCopySchema.parse({
      s6_1: { observations: [{ row: "is.revenue", lead: "Revenue reached $9.99M", body: "on {{rev.nope}} of growth." }] },
      open_questions: [],
    });
    const found = lintCopy(copy, ctx.brief).map((i) => i.issue);
    expect(found).toContain('figure "$9.99M" typed as a literal and not in the numbers brief');
    expect(found).toContain("unknown figure token {{rev.nope}}");
  });

  it("collects [Confirm: ...] placeholders in order", () => {
    expect(placeholdersIn({ a: "x [Confirm: date] y", b: ["[Confirm: owner] and [Confirm: date]"] })).toEqual(["[Confirm: date]", "[Confirm: owner]"]);
  });
});

describe("numbers brief", () => {
  it("prints from the model's periods with the contract's figures", () => {
    const { ds, row, out } = ridgeline();
    const brief = buildContext({ row, ds, out, copy: { open_questions: [] }, firm, date: new Date() }).brief;
    expect(brief.value("adjEbitda.FY2025")).toBeCloseTo(371_865, 0);
    expect(brief.value("sde.FY2025")).toBeCloseTo(547_915, 0);
    expect(brief.t("replacementCost")).toBe("$109,250");
    expect(brief.resolve("Adj. EBITDA of {{adjEbitda.latest}}")).toBe("Adj. EBITDA of $371.9K");
    expect(unknownTokens("{{rev.latest}} and {{rev.nowhere}}", brief)).toEqual(["rev.nowhere"]);
  });
});

describe("the Ridgeline copy fixture", () => {
  it("is used without an API key, parses, and passes the lint with every figure from the brief", async () => {
    const { ds, row, out } = ridgeline();
    const notes = fs.readFileSync(path.join(REPO, "samples/project-ridgeline/intake-notes.md"), "utf8");
    const draft = await withoutApiKey(() => draftCimCopy({ row, notes, dataset: ds, model: out, date: new Date("2026-10-05T12:00:00Z") }));
    expect(draft.source).toBe("fixture");
    expect(draft.lint).toEqual([]);
    expect(fs.existsSync(path.join(REPO, "samples/project-ridgeline", COPY_FIXTURE))).toBe(true);
  });

  it("never states a valuation, a multiple or an asking price", () => {
    const raw = fs.readFileSync(path.join(REPO, "samples/project-ridgeline", COPY_FIXTURE), "utf8");
    expect(raw).not.toMatch(/asking price|valuation|valued at|multiple of|\d(\.\d)?x (EBITDA|SDE|revenue)/i);
    expect(raw).not.toContain("—");
  });

  it("falls back to templated copy for another business", async () => {
    const { ds, out } = ridgeline();
    const row = { ...sampleRow(), business_name: "Other Business LLC", source_folder: "deals/none" };
    const draft = await withoutApiKey(() => draftCimCopy({ row, notes: "", dataset: ds, model: out }));
    expect(draft.source).toBe("template");
    expect(draft.lint).toEqual([]);
  });
});

describe("formats", () => {
  it("prints table figures in whole thousands with en-dash zeros and bracketed negatives", () => {
    expect(k(2_406_800, { dollar: true })).toBe("$2,407");
    expect(k(-938_800)).toBe("(939)");
    expect(k(400)).toBe("–");
    expect(fmtPct(-0.032)).toBe("(3.2%)");
    expect(fmtGrowth(0, 5)).toBe("n.m.");
    expect(fmtBps(0.61, 0.6189)).toBe("+89 bps");
  });

  it("writes prose money and margin changes the way AMB writes them", () => {
    expect(fmtMoney(3_040_800)).toBe("$3.04M");
    expect(fmtMoney(371_865)).toBe("$371.9K");
    expect(fmtMoney(-24_600)).toBe("–$24.6K");
    expect(describeDelta(0.61, 0.6189)).toBe("up 89 bps");
    expect(describeDelta(0.076, 0.1223)).toBe("up 4.6 pts");
    expect(describeDelta(0.026, 0.02601)).toBe("flat");
  });
});
