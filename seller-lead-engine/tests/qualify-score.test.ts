import { describe, expect, it } from "vitest";
import { nextStage, parseMoneyRange, qualScore, sizeFit, timelineInHorizon } from "../src/qualify/score.ts";
import { makeLead, makeProspect, testConfig } from "./helpers.ts";

const config = testConfig();
const p = makeProspect();

/** A lead with every core fact stated and in range. */
const full = (overrides = {}) =>
  makeLead(p, {
    revenue_band: "$1M-$2M",
    sde: 300_000,
    timeline: "6-12m",
    motivation: "retirement",
    wants_readiness_check: "Y",
    questions_asked: "revenue; sde; timeline",
    ...overrides,
  });

describe("parseMoneyRange", () => {
  it("reads bands, open-ended bands, single figures and words", () => {
    expect(parseMoneyRange("$1M-$2M")).toEqual({ low: 1e6, high: 2e6 });
    expect(parseMoneyRange("1-2M")).toEqual({ low: 1e6, high: 2e6 });
    expect(parseMoneyRange("$500K to $1M")).toEqual({ low: 5e5, high: 1e6 });
    expect(parseMoneyRange("under $500K")).toEqual({ low: 0, high: 499_999 });
    expect(parseMoneyRange("$5M+")).toEqual({ low: 5e6, high: Number.POSITIVE_INFINITY });
    expect(parseMoneyRange("over 5 million")).toEqual({ low: 5e6, high: Number.POSITIVE_INFINITY });
    expect(parseMoneyRange("about $1.2M")).toEqual({ low: 1.2e6, high: 1.2e6 });
    expect(parseMoneyRange("$850,000")).toEqual({ low: 850_000, high: 850_000 });
    expect(parseMoneyRange("between 1 and 2 million")).toEqual({ low: 1e6, high: 2e6 });
  });

  it("ignores years and small counts, and returns undefined with no amount", () => {
    expect(parseMoneyRange("in 2025 we did $1.5M")).toEqual({ low: 1.5e6, high: 1.5e6 });
    expect(parseMoneyRange("12 employees")).toBeUndefined();
    expect(parseMoneyRange("a good year")).toBeUndefined();
  });
});

describe("sizeFit", () => {
  it("is in range, too small or too large against config.qualify, and unknown with no figures", () => {
    expect(sizeFit(makeLead(p), config)).toBe("unknown");
    expect(sizeFit(makeLead(p, { revenue: 2_000_000 }), config)).toBe("in_range");
    expect(sizeFit(makeLead(p, { revenue_band: "under $500K" }), config)).toBe("too_small");
    expect(sizeFit(makeLead(p, { revenue_band: "$12M" }), config)).toBe("too_large");
    expect(sizeFit(makeLead(p, { revenue: 2_000_000, sde: 60_000 }), config)).toBe("too_small");
    expect(sizeFit(makeLead(p, { sde: 250_000 }), config)).toBe("in_range");
  });

  it("counts a band that straddles a limit as in range", () => {
    expect(sizeFit(makeLead(p, { revenue_band: "$250K-$750K" }), config)).toBe("in_range");
  });

  it("follows the configured limits", () => {
    const big = testConfig({ qualify: { min_revenue: 3_000_000 } });
    expect(sizeFit(makeLead(p, { revenue: 2_000_000 }), big)).toBe("too_small");
  });
});

describe("qualScore", () => {
  it("scores nothing for a lead with no stated facts and lists the core facts missing", () => {
    const r = qualScore(makeLead(p), config);
    expect(r).toEqual({ score: 0, reasons: [], missing: ["timeline", "revenue", "sde", "motivation"], fit: "unknown" });
  });

  it("adds timeline 30, size 25, motivation 20, engagement 15 and readiness 10 to at most 100", () => {
    const lead = full({
      timeline: "0-6m",
      employees: 12,
      owner_hours_per_week: 35,
      recurring_revenue_pct: 40,
      top_customer_pct: 8,
      license_holder: "my lead technician",
      owns_real_estate: "N",
      years_owned: 20,
    });
    const r = qualScore(lead, config);
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.fit).toBe("in_range");
    expect(r.reasons.join(" | ")).toMatch(/Timeline within 6 months, per owner \(\+30\).*Revenue \$1M-\$2M.*\(\+15\).*Owner earnings \$300K.*\(\+10\).*Motivation: retirement \(\+20\).*\(\+8\).*\(\+7\).*\(\+10\)/);
  });

  it("gives a timeline beyond the horizon only a token score (plus 1 for the answered question)", () => {
    expect(qualScore(makeLead(p, { timeline: "24m+" }), config).score).toBe(6);
    const short = testConfig({ qualify: { horizon_months: 12 } });
    expect(timelineInHorizon("12-24m", short)).toBe(false);
    expect(qualScore(makeLead(p, { timeline: "12-24m" }), short).score).toBe(6);
    expect(qualScore(makeLead(p, { timeline: "12-24m" }), config).score).toBe(16);
  });

  it("gives no size points to a business outside the range and says why", () => {
    const r = qualScore(makeLead(p, { revenue_band: "under $500K", sde: 80_000 }), config);
    expect(r.fit).toBe("too_small");
    expect(r.reasons[0]).toMatch(/below AMB's range/);
    // Two answered questions still count as engagement.
    expect(r.score).toBe(2);
  });

  it("does not credit an owner who holds the licence personally", () => {
    const own = qualScore(makeLead(p, { license_holder: "owner" }), config);
    const emp = qualScore(makeLead(p, { license_holder: "an employee" }), config);
    expect(emp.score - own.score).toBe(2);
  });
});

describe("nextStage", () => {
  it("makes a lead warm when the core facts are in and the score clears warm_score", () => {
    const lead = full();
    const q = qualScore(lead, config);
    expect(q.score).toBeGreaterThanOrEqual(config.qualify.warm_score);
    expect(nextStage(lead, "interested", q, config)).toBe("warm");
  });

  it("is qualified with core facts below warm_score, qualifying once questions were asked, else engaged", () => {
    const qualified = full({ timeline: "12-24m", motivation: "curious", wants_readiness_check: "", sde: undefined });
    const q = qualScore(qualified, config);
    expect(q.score).toBeLessThan(60);
    expect(nextStage(qualified, "interested", q, config)).toBe("qualified");
    const asked = makeLead(p, { questions_asked: "revenue" });
    expect(nextStage(asked, "question", qualScore(asked, config), config)).toBe("qualifying");
    expect(nextStage(makeLead(p), "interested", qualScore(makeLead(p), config), config)).toBe("engaged");
  });

  it("closes the lead on an opt-out, a complaint or wrong person, even from an advisor stage", () => {
    const lead = full({ stage: "meeting" });
    const q = qualScore(lead, config);
    for (const cls of ["unsubscribe", "complaint", "wrong_person"] as const) expect(nextStage(lead, cls, q, config)).toBe("lost");
    expect(nextStage(full({ stage: "engaged" }), "not_interested", q, config)).toBe("lost");
  });

  it("leaves a decline from an advisor stage for a person to read", () => {
    // "No thanks on the questionnaire, see you Tuesday" must not drop a booked meeting.
    for (const stage of ["handed_off", "meeting", "listed"] as const) {
      const lead = full({ stage });
      expect(nextStage(lead, "not_interested", qualScore(lead, config), config)).toBe(stage);
    }
  });

  it("leaves advisor stages alone on other replies, and machine mail never moves a lead", () => {
    const lead = full({ stage: "handed_off" });
    const q = qualScore(lead, config);
    expect(nextStage(lead, "question", q, config)).toBe("handed_off");
    expect(nextStage(lead, "not_now", q, config)).toBe("handed_off");
    expect(nextStage(makeLead(p, { stage: "qualifying" }), "auto_reply", q, config)).toBe("qualifying");
    expect(nextStage(makeLead(p, { stage: "qualifying" }), "bounce", q, config)).toBe("qualifying");
  });

  it("nurtures not now, and a stated timeline past the horizon", () => {
    expect(nextStage(makeLead(p), "not_now", qualScore(makeLead(p), config), config)).toBe("nurture");
    const far = full({ timeline: "24m+" });
    expect(nextStage(far, "interested", qualScore(far, config), config)).toBe("nurture");
  });

  it("marks a business outside the size range lost", () => {
    const small = makeLead(p, { revenue_band: "under $500K" });
    expect(nextStage(small, "interested", qualScore(small, config), config)).toBe("lost");
  });

  it("never moves a lead backward from warm, and re-engages a nurture lead who writes back", () => {
    const warm = makeLead(p, { stage: "warm" });
    expect(nextStage(warm, "question", qualScore(warm, config), config)).toBe("warm");
    const nurture = makeLead(p, { stage: "nurture" });
    expect(nextStage(nurture, "interested", qualScore(nurture, config), config)).toBe("engaged");
  });

  it("keeps the stage on a referral", () => {
    const lead = makeLead(p, { stage: "qualifying" });
    expect(nextStage(lead, "referral", qualScore(lead, config), config)).toBe("qualifying");
  });
});
