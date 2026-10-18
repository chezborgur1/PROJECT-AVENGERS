import { describe, expect, it } from "vitest";
import {
  agePointsForMidpoint,
  formatComponents,
  isInactiveStatus,
  NEUTRAL,
  reviewBandPoints,
  scoreProspect,
  tenurePointsForYears,
  tierFor,
  websiteHost,
  WEIGHTS,
} from "../src/score/score.ts";
import { isPersonName, splitPersonName } from "../src/sources/normalize.ts";
import { makeProspect, testConfig } from "./helpers.ts";
import { makeDetails, makeEntity, makeLicense } from "./fixtures/score/records.ts";

const TODAY = "2026-10-18";
const config = testConfig();
const score = (overrides: Parameters<typeof makeProspect>[0] = {}, ctx: Partial<Parameters<typeof scoreProspect>[1]> = {}) =>
  scoreProspect(makeProspect(overrides), { config, today: TODAY, ...ctx });

describe("score components", () => {
  it("weights add up to 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("scores the default 30-year HVAC company and explains every component", () => {
    const r = score({ website: "" });
    expect(r.components).toEqual({ age: 27, tenure: 20, successor: 15, size: NEUTRAL.size, fatigue: 5, vertical: 7 });
    expect(r.score).toBe(81);
    expect(r.tier).toBe("A");
    expect(r.knockout).toBeUndefined();
    expect(r.tenureYears).toBe(32);
    expect(r.age).toEqual({ low: 57, high: 64, method: "license_issue_year" });
    expect(r.reasons).toEqual([
      "Licence issued 1994, which suggests a senior owner",
      "Licensed since 1994 (32 years)",
      "Sole officer on the current filing, business on record for 32 years",
      "Size unknown, scored neutral",
      "No website on record",
      "Vertical prior for HVAC company: 7 of 10",
    ]);
    expect(formatComponents(r.components)).toBe("age=27; tenure=20; successor=15; size=7; fatigue=5; vertical=7");
  });

  it("never states the estimated age as a fact and never uses a semicolon in a reason", () => {
    const variants = [
      score({ year_graduated: 1980 }),
      score({ license_issue_date: "", formation_date: "1990-01-01" }),
      score({ license_issue_date: "", formation_date: "", year_graduated: undefined }),
      score({}, { places: makeDetails() }),
    ];
    for (const r of variants) {
      for (const reason of r.reasons) {
        expect(reason).not.toMatch(/\b(age|aged|years old|\d+ ?-? ?year-old)\b/i);
        expect(reason).not.toMatch(/\b(5[0-9]|6[0-9]|7[0-9])s?\b(?! years\))/);
        expect(reason).not.toContain(";");
        expect(reason).not.toMatch(/\u2014/);
      }
    }
  });

  it("maps age midpoints onto the data.md bands", () => {
    expect([44.9, 45, 54.9, 55, 59.9, 60, 64.9, 65, 80].map(agePointsForMidpoint)).toEqual([0, 10, 10, 20, 20, 27, 27, 30, 30]);
    expect(score({ license_issue_date: "2010-01-01", formation_date: "2010-01-01" }).components.age).toBe(0); // 16 years: 41-48, mid 44.5
    expect(score({ year_graduated: 1990 }).components.age).toBe(27); // 36 years: 61-63
    expect(score({ year_graduated: 1980 }).components.age).toBe(30);
  });

  it("describes the career stage from the record, not the number", () => {
    expect(score({ license_issue_date: "2008-01-01", formation_date: "2008-01-01" }).reasons[0]).toBe("Licence issued 2008, which suggests a mid-career owner");
    expect(score({ year_graduated: 1985 }).reasons[0]).toBe("Graduated 1985, which suggests a senior owner");
    expect(score({ license_issue_date: "", formation_date: "2000-04-01" }).reasons[0]).toBe("Business formed 2000, which suggests a senior owner");
    expect(score({ license_issue_date: "", formation_date: "2010-04-01" }).reasons[0]).toBe("Business formed 2010, which suggests a mid-career owner");
  });

  it("maps tenure years onto the data.md bands and uses the earliest date", () => {
    expect([9, 10, 14, 15, 19, 20, 24, 25, 40].map(tenurePointsForYears)).toEqual([0, 6, 6, 12, 12, 16, 16, 20, 20]);
    const r = score({ license_issue_date: "2004-01-01", formation_date: "1999-11-01" });
    expect(r.tenureYears).toBe(26);
    expect(r.reasons).toContain("Formed in 1999 (26 years on record)");
    expect(r.components.tenure).toBe(20);
  });

  it("scores missing dates neutral-low instead of zeroing the prospect", () => {
    const r = score({ license_issue_date: "", formation_date: "", year_graduated: undefined });
    expect(r.knockout).toBeUndefined();
    expect(r.components.age).toBe(NEUTRAL.age);
    expect(r.components.tenure).toBe(NEUTRAL.tenure);
    expect(r.tenureYears).toBeUndefined();
    // Sole officer but tenure unknown: the shorter-tenure value.
    expect(r.components.successor).toBe(10);
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons).toContain("No formation or licence date on record");
  });
});

describe("successor signal", () => {
  it("gives 0 when another officer shares the owner's surname with a different first name", () => {
    const r = score({ officers: "JOHN EXAMPLE (P); JANE EXAMPLE (VP)", officer_count: 2 });
    expect(r.components.successor).toBe(0);
    expect(r.reasons).toContain("Another officer shares the owner's surname (Jane Example), a likely next generation");
  });

  it("reads LAST, FIRST names and generational suffixes", () => {
    expect(score({ officers: "EXAMPLE, JOHN (P); EXAMPLE, MICHAEL (D)", officer_count: 2 }).components.successor).toBe(0);
    expect(score({ officers: "JOHN EXAMPLE (P); JOHN EXAMPLE JR (VP)", officer_count: 2 }).components.successor).toBe(0);
    expect(score({ officers: "SMITH JR, JOHN (P); JOHN SMITH (VP)", officer_count: 2, owner_name: "", owner_first_name: "", owner_last_name: "" }).components.successor).toBe(0);
    // The names are read with the importers' own rules (src/sources/normalize.ts).
    expect(splitPersonName("Example, John M.")).toMatchObject({ first: "John", last: "Example" });
    expect(splitPersonName("JOHN V SMITH")).toMatchObject({ first: "John", last: "Smith", full: "John V Smith" });
    expect(splitPersonName("SMITH JR, JOHN")).toEqual({ first: "John", last: "Smith", full: "John Smith Jr" });
    expect(isPersonName("ACME HOLDINGS LLC")).toBe(false);
  });

  it("gives 8 for several officers with none sharing the surname", () => {
    const r = score({ officers: "JOHN EXAMPLE (P); MARIA LOPEZ (VP); EXAMPLE HOLDINGS LLC (MGR)", officer_count: 2 });
    expect(r.components.successor).toBe(8);
    expect(r.reasons).toContain("2 officers on the filing, none sharing the owner's surname");
  });

  it("counts the owner listed twice under two titles once", () => {
    expect(score({ officers: "JOHN EXAMPLE (P); EXAMPLE, JOHN (D)", officer_count: 1 }).components.successor).toBe(15);
  });

  it("trusts officer_count when it lists more officers than the cell names", () => {
    expect(score({ officers: "JOHN EXAMPLE (P)", officer_count: 3 }).components.successor).toBe(8);
  });

  it("scores neutral-low with no officer list at all", () => {
    const r = score({ officers: "", officer_count: undefined });
    expect(r.components.successor).toBe(NEUTRAL.successor);
    expect(r.reasons).toContain("No officer list on record, so succession is unknown");
  });

  it("compares officers with each other when the owner is unknown", () => {
    const shared = score({ owner_name: "", owner_first_name: "", owner_last_name: "", officers: "ANN SMITH (MGR); BEN SMITH (MGR)", officer_count: 2 });
    expect(shared.components.successor).toBe(0);
    const none = score({ owner_name: "", owner_first_name: "", owner_last_name: "", officers: "ANN SMITH (MGR); BEN JONES (MGR)", officer_count: 2 });
    expect(none.components.successor).toBe(8);
  });
});

describe("size fit", () => {
  it("stays neutral when nothing is known", () => {
    expect(score().components.size).toBe(NEUTRAL.size);
  });

  it("rises with several licences when Places is not used", () => {
    expect(score({ license_numbers: "CAC1; CMC2" }).components.size).toBe(9);
    const r = score({ license_numbers: "CAC1; CMC2; RA3" });
    expect(r.components.size).toBe(10);
    expect(r.reasons).toContain("Holds 3 licences");
  });

  it("uses review volume bands from Places details and adds 2 for several licences", () => {
    expect([0, 4, 5, 24, 25, 74, 75, 499, 500, 1499, 1500].map(reviewBandPoints)).toEqual([3, 3, 6, 6, 10, 10, 13, 13, 9, 9, 4]);
    expect(score({}, { places: makeDetails({ userRatingCount: 180 }) }).components.size).toBe(13);
    expect(score({ license_numbers: "CAC1; CMC2" }, { places: makeDetails({ userRatingCount: 180 }) }).components.size).toBe(15);
    expect(score({}, { places: makeDetails({ userRatingCount: 2 }) }).components.size).toBe(3);
    expect(score({}, { places: makeDetails({ userRatingCount: 3000 }) }).components.size).toBe(4);
  });

  it("falls back to licences when the details have no review count", () => {
    expect(score({}, { places: makeDetails({ userRatingCount: undefined }) }).components.size).toBe(NEUTRAL.size);
  });

  it("never copies Places values into the reasons", () => {
    const r = score({ website: "" }, { places: makeDetails({ userRatingCount: 187, rating: 4.3, websiteUri: "https://exampleair.example/" }) });
    const text = r.reasons.join(" | ");
    expect(text).not.toMatch(/187|4\.3|exampleair/);
    expect(text).toContain("Customer review volume suggests an established business in the target size range");
  });
});

describe("fatigue signals", () => {
  const healthy = { entity: makeEntity(), licenses: [makeLicense()] };

  it("finds none on a current entity, a renewed licence and a website", () => {
    const r = score({ website: "exampleair.example" }, healthy);
    expect(r.components.fatigue).toBe(0);
    expect(r.reasons).toContain("No fatigue signals found");
  });

  it("flags a missing Florida annual report after the May 1 deadline", () => {
    const r = score({ website: "x.example" }, { ...healthy, entity: makeEntity({ last_annual_report_date: "2025-03-01" }) });
    expect(r.components.fatigue).toBe(4);
    expect(r.reasons).toContain("No 2026 annual report on file after the May 1 deadline");
  });

  it("does not flag the current year's report before May 1", () => {
    const r = scoreProspect(makeProspect({ website: "x.example" }), { config, today: "2026-04-15", ...healthy, entity: makeEntity({ last_annual_report_date: "2025-03-01" }) });
    expect(r.components.fatigue).toBe(0);
    const onDeadline = scoreProspect(makeProspect({ website: "x.example" }), { config, today: "2026-05-01", ...healthy, entity: makeEntity({ last_annual_report_date: "2025-03-01" }) });
    expect(onDeadline.components.fatigue).toBe(0);
    const dayAfter = scoreProspect(makeProspect({ website: "x.example" }), { config, today: "2026-05-02", ...healthy, entity: makeEntity({ last_annual_report_date: "2025-03-01" }) });
    expect(dayAfter.components.fatigue).toBe(4);
  });

  it("flags a report filed late and a blank report date", () => {
    expect(score({ website: "x.example" }, { ...healthy, entity: makeEntity({ last_annual_report_date: "2026-07-20" }) }).components.fatigue).toBe(2);
    const blank = score({ website: "x.example" }, { ...healthy, entity: makeEntity({ last_annual_report_date: "" }) });
    expect(blank.components.fatigue).toBe(3);
    expect(blank.reasons).toContain("No annual report date on the state record");
  });

  it("uses a 25-month window outside Florida, where cycles vary", () => {
    const tx = (date: string) => score({ website: "x.example" }, { ...healthy, entity: makeEntity({ state: "TX", principal_state: "TX", last_annual_report_date: date }) }).components.fatigue;
    expect(tx("2025-01-01")).toBe(0);
    expect(tx("2024-01-01")).toBe(4);
  });

  it("flags a licence near expiry and an expired one, but not one renewed early", () => {
    const near = score({ website: "x.example" }, { ...healthy, licenses: [makeLicense({ expiration_date: "2026-11-30" })] });
    expect(near.components.fatigue).toBe(3);
    expect(near.reasons).toContain("Licence expires 2026-11-30 and has not been renewed early");
    const expired = score({ website: "x.example" }, { ...healthy, licenses: [makeLicense({ expiration_date: "2026-08-31" })] });
    expect(expired.reasons).toContain("Licence expired 2026-08-31 with no renewal on record");
    const renewed = score({ website: "x.example" }, { ...healthy, licenses: [makeLicense({ expiration_date: "2026-11-30" }), makeLicense({ source_record_id: "X2", expiration_date: "2028-08-31" })] });
    expect(renewed.components.fatigue).toBe(0);
    const boundary = score({ website: "x.example" }, { ...healthy, licenses: [makeLicense({ expiration_date: "2026-12-17" })] });
    expect(boundary.components.fatigue).toBe(3);
    const outside = score({ website: "x.example" }, { ...healthy, licenses: [makeLicense({ expiration_date: "2026-12-18" })] });
    expect(outside.components.fatigue).toBe(0);
  });

  it("counts a website from Places as a website", () => {
    expect(score({ website: "" }, { ...healthy, places: makeDetails({ websiteUri: "https://x.example" }) }).components.fatigue).toBe(0);
    expect(score({ website: "" }, { ...healthy, places: makeDetails({ websiteUri: undefined }) }).components.fatigue).toBe(3);
  });

  it("adds a point per unknown check and caps the component at 10", () => {
    expect(score({ website: "x.example" }).components.fatigue).toBe(2 * NEUTRAL.fatigueUnknown);
    const r = score(
      { website: "" },
      { entity: makeEntity({ last_annual_report_date: "2024-02-01" }), licenses: [makeLicense({ expiration_date: "2026-10-30" })], places: makeDetails({ websiteUri: undefined, businessStatus: "CLOSED_TEMPORARILY" }) },
    );
    expect(r.components.fatigue).toBe(10);
    expect(r.reasons).toContain("External listing check suggests a possible closure");
  });
});

describe("knock-outs", () => {
  const expectKnockout = (r: ReturnType<typeof scoreProspect>, pattern: RegExp) => {
    expect(r.knockout).toMatch(pattern);
    expect(r.score).toBe(0);
    expect(r.tier).toBe("C");
    expect(r.reasons[0]).toMatch(/^Excluded: /);
  };

  it("excludes a suppressed prospect", () => {
    expectKnockout(score({}, { suppressedReason: "opt_out" }), /^suppressed \(opt_out\)$/);
  });

  it("excludes an inactive entity", () => {
    expectKnockout(score({ entity_status: "INACTIVE" }), /^inactive entity/);
    expectKnockout(score({ entity_status: "I" }), /^inactive entity/);
    expect(score({ entity_status: "A" }).knockout).toBeUndefined();
    expect(score({ entity_status: "" }).knockout).toBeUndefined();
  });

  it("excludes an inactive licence, unless another licence is still active", () => {
    expectKnockout(score({ license_status: "Null and Void" }), /^inactive licence/);
    expectKnockout(score({ license_status: "Delinquent,Active" }), /^inactive licence/);
    expect(score({ license_status: "Current,Inactive; Current,Active" }).knockout).toBeUndefined();
    expect(["Current,Active", "active", "A", ""].map(isInactiveStatus)).toEqual([false, false, false, false]);
    expect(["Current,Inactive", "Revoked", "expired", "Administratively Dissolved"].map(isInactiveStatus)).toEqual([true, true, true, true]);
  });

  it("excludes a business Places lists as closed permanently", () => {
    expectKnockout(score({}, { places: makeDetails({ businessStatus: "CLOSED_PERMANENTLY" }) }), /^closed \(external listing check\)$/);
    expect(score({}, { places: makeDetails({ businessStatus: "OPERATIONAL" }) }).knockout).toBeUndefined();
  });

  it("excludes a franchise or chain name in the legal or DBA name", () => {
    expectKnockout(score({ business_name: "ONE HOUR HEATING & AIR CONDITIONING OF TAMPA" }), /^franchise or chain name \(matches "one hour heating"\)$/);
    expectKnockout(score({ dba_name: "Aire Serv of Clearwater" }), /^franchise or chain/);
    expect(score({ business_name: "Service Expertsville Inc" }).knockout).toBeUndefined();
  });

  it("excludes an excluded domain by email, domain or website", () => {
    const c = testConfig({ targeting: { exclude_domains: ["client.example", "owner@other.example"] } });
    const s = (o: Parameters<typeof makeProspect>[0]) => scoreProspect(makeProspect(o), { config: c, today: TODAY });
    expectKnockout(s({ email: "bob@client.example" }), /^excluded domain \(client\.example\)$/);
    expectKnockout(s({ email: "bob@mail.client.example" }), /^excluded domain/);
    expectKnockout(s({ email: "", website: "https://www.client.example/about" }), /^excluded domain/);
    expectKnockout(s({ email: "Owner@Other.example" }), /^excluded domain \(owner@other\.example\)$/);
    expect(s({ email: "someone@other.example" }).knockout).toBeUndefined();
    expect(s({ email: "bob@notclient.example" }).knockout).toBeUndefined();
    expect(websiteHost("WWW.Example.com/x")).toBe("example.com");
  });

  it("excludes tenure under the minimum, but not unknown tenure", () => {
    expectKnockout(score({ license_issue_date: "2014-01-01", formation_date: "2015-01-01" }), /^tenure 12 years, under the 15-year minimum$/);
    expect(score({ license_issue_date: "2011-10-18", formation_date: "" }).knockout).toBeUndefined(); // exactly 15
    expect(score({ license_issue_date: "2011-10-19", formation_date: "" }).knockout).toMatch(/^tenure 14 years/);
    expect(score({ license_issue_date: "", formation_date: "" }).knockout).toBeUndefined();
  });

  it("excludes a prospect with no vertical or no metro, or one the config does not know", () => {
    expectKnockout(score({ vertical: "" }), /^no vertical$/);
    expectKnockout(score({ vertical: "landscaping" }), /^no vertical \(landscaping is not in the config\)$/);
    expectKnockout(score({ metro: "" }), /^no metro$/);
    expectKnockout(score({ metro: "orlando" }), /^no metro \(orlando/);
  });

  it("records suppression ahead of every other knock-out", () => {
    expect(score({ vertical: "", entity_status: "INACTIVE" }, { suppressedReason: "complaint" }).knockout).toBe("suppressed (complaint)");
  });

  it("still logs the components of an excluded prospect for recalibration", () => {
    const r = score({ metro: "" });
    expect(r.components.tenure).toBe(20);
    expect(r.age.method).toBe("license_issue_year");
  });
});

describe("tiers", () => {
  it("applies the default boundaries at 70 and 50", () => {
    expect([100, 70, 69, 50, 49, 0].map((s) => tierFor(s, config))).toEqual(["A", "A", "B", "B", "C", "C"]);
  });

  it("puts a scored prospect exactly on each configured boundary", () => {
    const at = score().score;
    const tier = (a: number, b: number) =>
      scoreProspect(makeProspect(), { config: testConfig({ targeting: { tier_a_min: a, tier_b_min: b } }), today: TODAY }).tier;
    expect(tier(at, at - 10)).toBe("A");
    expect(tier(at + 1, at)).toBe("B");
    expect(tier(at + 2, at + 1)).toBe("C");
  });

  it("lands a mid-career single-officer business in B and a young-looking one in C", () => {
    const b = score({ license_issue_date: "2008-01-01", formation_date: "2008-01-01", website: "x.example" }, { entity: makeEntity(), licenses: [makeLicense()] });
    expect(b.components).toMatchObject({ age: 10, tenure: 12, successor: 15 });
    expect(b.score).toBe(51);
    expect(b.tier).toBe("B");
    const c = score({ license_issue_date: "2010-01-01", formation_date: "2010-01-01", website: "x.example", officers: "JOHN EXAMPLE (P); JANE EXAMPLE (VP)", officer_count: 2 }, { entity: makeEntity(), licenses: [makeLicense()] });
    expect(c.tier).toBe("C");
  });
});
