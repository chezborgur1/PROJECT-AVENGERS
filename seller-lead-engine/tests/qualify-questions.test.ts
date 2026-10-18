import { describe, expect, it } from "vitest";
import { LeadRowSchema } from "../src/domain/schema.ts";
import { lintBody } from "../src/compliance/lint.ts";
import { INTAKE_QUESTIONS, isAnswered, nextQuestions } from "../src/qualify/questions.ts";
import { makeLead, makeProspect } from "./helpers.ts";

describe("INTAKE_QUESTIONS", () => {
  it("covers the intake list from the offer research, each key once and filling a real lead field", () => {
    expect(INTAKE_QUESTIONS.map((q) => q.key)).toEqual(["revenue", "sde", "timeline", "motivation", "employees", "owner_hours", "recurring", "top_customer", "real_estate", "license_holder"]);
    const fields = Object.keys(LeadRowSchema.shape);
    for (const q of INTAKE_QUESTIONS) expect(fields).toContain(q.field);
    expect(new Set(INTAKE_QUESTIONS.map((q) => q.priority)).size).toBe(INTAKE_QUESTIONS.length);
  });

  it("words every question so it passes the reply copy lint, with no sensitive topic", () => {
    for (const q of INTAKE_QUESTIONS) {
      expect(lintBody(q.text, { kind: "reply" }), q.key).toEqual([]);
      expect(q.text).not.toMatch(/retire|health|family|age\b|succession|\u2014/i);
    }
  });

  it("asks for bands, not documents", () => {
    const revenue = INTAKE_QUESTIONS.find((q) => q.key === "revenue")!;
    expect(revenue.text).toMatch(/under \$500K.*over \$5M/);
    for (const q of INTAKE_QUESTIONS) expect(q.text).not.toMatch(/tax return|bank statement|send (me|us) (your|the)/i);
  });
});

describe("nextQuestions", () => {
  const p = makeProspect();

  it("returns the highest-priority unanswered questions up to the limit", () => {
    expect(nextQuestions(makeLead(p), 3).map((q) => q.key)).toEqual(["revenue", "sde", "timeline"]);
  });

  it("skips questions already asked and facts already stated", () => {
    const lead = makeLead(p, { questions_asked: "revenue; sde", timeline: "6-12m", employees: 12 });
    expect(nextQuestions(lead, 3).map((q) => q.key)).toEqual(["motivation", "owner_hours", "recurring"]);
  });

  it("counts a revenue band as answering the revenue question, and unknown as unanswered", () => {
    const q = INTAKE_QUESTIONS.find((x) => x.key === "revenue")!;
    expect(isAnswered(makeLead(p, { revenue_band: "$1M-$2M" }), q)).toBe(true);
    expect(isAnswered(makeLead(p, { revenue: 1_200_000 }), q)).toBe(true);
    const t = INTAKE_QUESTIONS.find((x) => x.key === "timeline")!;
    expect(isAnswered(makeLead(p, { timeline: "unknown" }), t)).toBe(false);
    const re = INTAKE_QUESTIONS.find((x) => x.key === "real_estate")!;
    expect(isAnswered(makeLead(p, { owns_real_estate: "N" }), re)).toBe(true);
  });

  it("returns nothing for a zero or negative limit and when everything is known", () => {
    expect(nextQuestions(makeLead(p), 0)).toEqual([]);
    expect(nextQuestions(makeLead(p), -1)).toEqual([]);
    const all = makeLead(p, { questions_asked: INTAKE_QUESTIONS.map((q) => q.key).join("; ") });
    expect(nextQuestions(all, 5)).toEqual([]);
  });
});
