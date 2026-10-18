import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DRIVERS, MIN_SDE_FOR_RANGE, article, buildReadinessCheck, money, readinessLabel, writeReadinessCheck } from "../src/readiness/check.ts";
import { loadMultiples, type MultipleRow } from "../src/readiness/multiples.ts";
import { lintBody } from "../src/compliance/lint.ts";
import type { LeadRow } from "../src/domain/schema.ts";
import { REPO, makeLead, makeProspect, tempStores, testConfig } from "./helpers.ts";

const TODAY = "2026-10-18";
const MULTIPLES = loadMultiples(path.join(REPO, "reference/multiples.json"));
const config = testConfig();

/** A Tampa HVAC owner who has answered most of the first-round questions. */
function answered(overrides: Partial<LeadRow> = {}) {
  const p = makeProspect({ business_name: "Bay Comfort Air Inc", city: "Tampa" });
  const lead = makeLead(p, {
    sde: 310_000,
    revenue: 1_450_000,
    employees: 9,
    owner_hours_per_week: 60,
    recurring_revenue_pct: 35,
    top_customer_pct: 8,
    owns_real_estate: "N",
    license_holder: "owner",
    timeline: "12-24m",
    motivation: "retirement",
    ...overrides,
  });
  return { p, lead };
}

const check = (lead: LeadRow, p = makeProspect(), cfg = config, multiples: MultipleRow[] = MULTIPLES) => buildReadinessCheck(lead, p, cfg, { today: TODAY, multiples });

// HOUSE_STYLE §4.4 banned words and constructions that could plausibly appear in this copy.
const BANNED = /\b(robust|strong|solid|healthy|well-positioned|poised|best-in-class|world-class|leading|premier|well-established|proven|seamless|turnkey|holistic|comprehensive|dynamic|unique|differentiated|significant|substantial|meaningful|impressively|remarkably|notably|importantly|attractive|compelling|undervalued|delve|navigate|landscape|furthermore|moreover|additionally|guarantee[ds]?)\b/i;

describe("buildReadinessCheck: structure", () => {
  it("scores 8 drivers over 15 to 25 checklist items, and the driver points add up to the score", () => {
    const { p, lead } = answered();
    const c = check(lead, p);
    expect(Object.keys(c.drivers)).toEqual(DRIVERS.map((d) => d.name));
    expect(new Set(c.items.map((i) => i.driver)).size).toBe(8);
    expect(c.items.length).toBeGreaterThanOrEqual(15);
    expect(c.items.length).toBeLessThanOrEqual(25);
    const sum = Object.values(c.drivers).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - c.score)).toBeLessThanOrEqual(0.5);
    expect(DRIVERS.reduce((a, d) => a + d.weight, 0)).toBe(100);
    for (const d of DRIVERS) expect(c.drivers[d.name]).toBeLessThanOrEqual(d.weight);
  });

  it("is deterministic for the same inputs", () => {
    const { p, lead } = answered();
    expect(check(lead, p)).toEqual(check(lead, p));
  });

  it("writes an email the reply lint passes, whether every item is unknown or most are answered", () => {
    // The check is drafted as a reply through the compliance gate, so its wording must pass the same lint.
    const bare = makeProspect({ business_name: "Bay Comfort Air Inc", city: "Tampa" });
    const { p, lead } = answered();
    for (const [prospect, l] of [[bare, makeLead(bare)], [p, lead]] as const) {
      const allow = [prospect.business_name, prospect.city, prospect.owner_name];
      expect(lintBody(check(l, prospect).emailBody, { kind: "reply", allow })).toEqual([]);
    }
  });
});

describe("buildReadinessCheck: the owner's answers", () => {
  it("marks each stated fact met or gap with the owner's figure, attributed per owner", () => {
    const { p, lead } = answered();
    const c = check(lead, p);
    const find = (text: string) => c.items.find((i) => i.item.includes(text))!;
    expect(find("50 hours")).toMatchObject({ status: "gap", note: expect.stringContaining("60 hours a week (per owner)") });
    expect(find("15% of revenue")).toMatchObject({ status: "met", note: expect.stringContaining("8% of revenue (per owner)") });
    expect(find("At least 30%")).toMatchObject({ status: "met" });
    expect(find("More than 60%")).toMatchObject({ status: "gap", note: expect.stringContaining("35%") });
    expect(find("5 or more employees")).toMatchObject({ status: "met", note: "9 employees (per owner)." });
    expect(find("licence is held")).toMatchObject({ status: "gap", note: expect.stringContaining("You hold the licence (per owner)") });
    expect(find("owner earnings (SDE)")).toMatchObject({ status: "met", note: expect.stringContaining("$310K") });
    expect(find("active on state records")).toMatchObject({ status: "met", note: "Active (per state records)." });
  });

  it("credits a licence held by an employee and flags an expired licence on the state record", () => {
    const p = makeProspect({ license_status: "expired" });
    const c = check(makeLead(p, { license_holder: "lead technician (employee)" }), p);
    expect(c.items.find((i) => i.item.includes("licence is held"))!.status).toBe("met");
    expect(c.items.find((i) => i.item.includes("active on state records"))!.status).toBe("gap");
  });

  it("marks everything the owner has not said as unknown and never guesses", () => {
    const p = makeProspect({ entity_status: "", license_status: "" });
    const c = check(makeLead(p), p);
    expect(c.items.every((i) => i.status === "unknown")).toBe(true);
    expect(c.score).toBe(50); // every unknown is half credit
    expect(c.markdown).toContain("| Owner earnings (SDE) | Unknown | Not stated yet |");
    expect(c.markdown).toContain("(provisional)");
    expect(c.markdown).toContain("25 of 25 checklist items are unknown");
    expect(c.emailBody).toContain("Unknown until we talk:");
  });

  it("reads the checklist facts the owner stated and keeps the parts they did not state unknown", () => {
    const { p, lead } = answered({ books_match_returns: "N", revenue_trend: "growing", manager_in_place: "Y", runs_without_owner: "Y", lease_years_left: 6 });
    const c = check(lead, p);
    const item = (text: string) => c.items.find((i) => i.item === text)!;
    expect(item("Three years of profit and loss statements match the filed tax returns")).toMatchObject({ status: "gap", note: expect.stringContaining("(per owner)") });
    expect(item("The business runs for 4 weeks without you").status).toBe("met");
    expect(item("A manager or lead person runs day-to-day work").status).toBe("met");
    expect(item("That manager or lead person would stay after a sale").status).toBe("unknown");
    expect(item("Revenue is flat or growing over the last 3 years")).toMatchObject({ status: "met", note: "Revenue has been growing (per owner)." });
    expect(item("Profit is flat or growing over the last 3 years").status).toBe("unknown");
    expect(item("You own the premises, or the lease runs long enough (with options) to cover a 10-year buyer loan")).toMatchObject({ status: "gap", note: expect.stringContaining("About 6 years left on the lease (per owner)") });
    expect(c.markdown).toContain("| Revenue trend (3 years) | growing | Per owner |");
    expect(c.markdown).toContain("| Years left on the lease | 6 | Per owner |");
    const longLease = check(answered({ lease_years_left: 12 }).lead, p);
    expect(longLease.items.find((i) => i.driver === "Real estate and lease")!.status).toBe("met");
    const declining = check(answered({ revenue_trend: "declining" }).lead, p);
    expect(declining.items.find((i) => i.item.startsWith("Revenue is flat"))!.status).toBe("gap");
  });

  it("raises the score when the owner states the checklist facts favourably", () => {
    const { p, lead } = answered();
    const better = answered({ books_match_returns: "Y", revenue_trend: "growing", manager_in_place: "Y", runs_without_owner: "Y" });
    expect(check(better.lead, p).score).toBeGreaterThan(check(lead, p).score);
  });

  it("scores a better-prepared business higher than a worse one", () => {
    const good = answered({ owner_hours_per_week: 40, recurring_revenue_pct: 70, license_holder: "employee", owns_real_estate: "Y" });
    const bad = answered({ owner_hours_per_week: 70, recurring_revenue_pct: 5, top_customer_pct: 40, employees: 2, revenue: 300_000 });
    expect(check(good.lead, good.p).score).toBeGreaterThan(check(bad.lead, bad.p).score);
  });

  it("names up to 3 drivers to look at first, starting with stated gaps", () => {
    const { p, lead } = answered();
    const c = check(lead, p);
    const section = c.markdown.split("## What to look at first")[1]!.split("##")[0]!;
    expect(section).toContain("1. **Owner dependence.**");
    expect(section.match(/^\d\. /gm)).toHaveLength(3);
    expect(section).not.toMatch(/^4\. /m);
  });

  it("writes the owner's business, city and record facts into the markdown", () => {
    const { p, lead } = answered();
    const c = check(lead, p);
    expect(c.markdown).toContain("# Exit-readiness check: Bay Comfort Air Inc");
    expect(c.markdown).toContain("Bay Comfort Air Inc is an HVAC company in Tampa, FL.");
    expect(c.markdown).toContain("| Owner hours a week | 60 | Per owner |");
    expect(c.markdown).toContain("| Licensed since | 1994 | Per state records |");
    expect(c.emailBody).toMatch(/^Hi John,/);
    expect(c.emailBody).toContain("Bay Comfort Air Inc");
  });
});

describe("buildReadinessCheck: the rough range", () => {
  it("gives a range from the verified HVAC row on the stated SDE, rounded to $25K, inside the published band", () => {
    const { p, lead } = answered();
    const c = check(lead, p);
    expect(c.range).toBeDefined();
    expect(c.rangeWithheld).toBeUndefined();
    const { low, high } = c.range!;
    expect(low % 25_000).toBe(0);
    expect(high % 25_000).toBe(0);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(Math.floor((1.99 * 310_000) / 25_000) * 25_000);
    expect(high).toBeLessThanOrEqual(Math.ceil((3.33 * 310_000) / 25_000) * 25_000);
    expect(c.range!.basis).toContain("HVAC businesses sold on BizBuySell");
    expect(c.range!.basis).toContain("1.99 to 3.33");
    expect(c.range!.source).toContain("bizbuysell.com/learning-center/valuation-benchmarks/hvac/");
    expect(c.range!.method).toContain("excluding real estate");
    expect(c.emailBody).toContain(`Rough market range: ${money(low)} to ${money(high)}`);
  });

  it("moves the range up as the readiness score rises", () => {
    const low = answered({ owner_hours_per_week: 70, recurring_revenue_pct: 5, top_customer_pct: 40, employees: 2 });
    const high = answered({ owner_hours_per_week: 40, recurring_revenue_pct: 70, license_holder: "employee", owns_real_estate: "Y" });
    expect(check(high.lead, high.p).range!.low).toBeGreaterThan(check(low.lead, low.p).range!.low);
  });

  it("withholds the range when config turns ranges off", () => {
    const { p, lead } = answered();
    const c = check(lead, p, testConfig({ readiness: { include_range: false } }));
    expect(c.range).toBeUndefined();
    expect(c.rangeWithheld).toMatch(/turned off/);
    expect(c.emailBody).not.toContain("Rough market range:");
    expect(c.emailBody).toContain("20-minute call");
  });

  it("never gives a range from an unverified row", () => {
    const { p, lead } = answered();
    const unverified = MULTIPLES.map((r) => ({ ...r, verified: false }));
    const c = check(lead, p, config, unverified);
    expect(c.range).toBeUndefined();
    expect(c.rangeWithheld).toMatch(/No checked market benchmark/);
    expect(c.markdown).not.toMatch(/\$\d+K to \$\d/);
    expect(c.emailBody).not.toMatch(/\$\d+K to \$\d/);
  });

  it("withholds the range when the vertical has no multiples key in config", () => {
    const p = makeProspect({ vertical: "bakery" });
    const c = check(makeLead(p, { sde: 200_000 }), p);
    expect(c.range).toBeUndefined();
    expect(c.rangeWithheld).toMatch(/No benchmark/);
  });

  it("withholds the range at or above max_sde_for_range and says an advisor prices it", () => {
    const { p, lead } = answered({ sde: 1_000_000 });
    const c = check(lead, p);
    expect(c.range).toBeUndefined();
    expect(c.rangeWithheld).toMatch(/EBITDA/);
    const smaller = check(lead, p, testConfig({ readiness: { max_sde_for_range: 2_000_000 } }));
    expect(smaller.range).toBeDefined();
  });

  it("withholds the range when SDE is not stated or is too small", () => {
    const { p, lead } = answered({ sde: undefined, revenue: undefined });
    expect(check(lead, p).rangeWithheld).toMatch(/SDE\) are not stated/);
    const tiny = answered({ sde: MIN_SDE_FOR_RANGE - 1 });
    expect(check(tiny.lead, tiny.p).rangeWithheld).toMatch(/too rough/);
  });

  it("does not turn revenue into a range for an SDE-only vertical", () => {
    const { p, lead } = answered({ sde: undefined, revenue: 1_200_000 });
    const c = check(lead, p);
    expect(c.range).toBeUndefined();
    expect(c.rangeWithheld).toMatch(/based on SDE/);
  });

  it("uses the verified revenue row for a revenue-convention vertical when only revenue is stated", () => {
    const cfg = testConfig({
      verticals: { dental: { noun: "dental practice", keywords: ["dental"], multiples_key: "dental" } },
    });
    const p = makeProspect({ vertical: "dental", business_name: "Harbor Dental PA" });
    const c = check(makeLead(p, { revenue: 900_000 }), p, cfg);
    expect(c.range).toBeDefined();
    expect(c.range!.method).toContain("annual revenue");
    expect(c.range!.low).toBeGreaterThanOrEqual(Math.floor((0.51 * 900_000) / 25_000) * 25_000);
    expect(c.range!.high).toBeLessThanOrEqual(Math.ceil((0.86 * 900_000) / 25_000) * 25_000);
  });
});

describe("buildReadinessCheck: disclaimer and copy rules", () => {
  it("carries the full disclaimer, with the benchmark source when a range is given", () => {
    const { p, lead } = answered();
    const c = check(lead, p);
    for (const text of [c.markdown, c.emailBody]) {
      expect(text).toContain("It is not an appraisal, a certified business valuation or a fairness opinion");
      expect(text).toContain("should not be relied on by a lender");
      expect(text).toContain("excludes real estate and working capital");
      expect(text).toContain("depend on verified financials");
      expect(text).toContain("rules of thumb from BizBuySell valuation benchmarks: HVAC");
      expect(text).toContain("sales 2021-2025");
    }
  });

  it("carries the disclaimer without a source when no range is given", () => {
    const { p, lead } = answered({ sde: undefined, revenue: undefined });
    const c = check(lead, p);
    expect(c.emailBody).toContain("It is not an appraisal");
    expect(c.emailBody).toContain("No range is given in this check.");
  });

  it("uses no em dashes, exclamation marks or banned words, and never mentions age, health or family", () => {
    const variants = [answered(), answered({ sde: undefined }), answered({ owns_real_estate: "Y", license_holder: "employee" })];
    for (const { p, lead } of variants) {
      const c = check({ ...lead, motivation: "health", motivation_detail: "my doctor says slow down" }, p);
      for (const text of [c.markdown, c.emailBody]) {
        expect(text).not.toContain("\u2014");
        expect(text).not.toContain("!");
        expect(text).not.toMatch(BANNED);
        expect(text).not.toMatch(/\b(age|aged|health|doctor|retire|retirement|death|divorce|family|wife|husband)\b/i);
      }
    }
  });

  it("says real estate is kept out of the range when the owner owns the property", () => {
    const { p, lead } = answered({ owns_real_estate: "Y" });
    const c = check(lead, p);
    expect(c.items.find((i) => i.driver === "Real estate and lease")!.note).toMatch(/valued separately and is not in any range/);
  });
});

describe("writeReadinessCheck", () => {
  it("writes data/checks/<prospect_id> <business>.md and records the score on the lead", () => {
    const stores = tempStores();
    const { p, lead } = answered();
    stores.prospects.upsert([p]);
    stores.leads.upsert([lead]);
    const c = check(lead, p);
    const file = writeReadinessCheck(stores, c, p);
    expect(file).toBe(path.join(stores.dir.checks, `${p.prospect_id} Bay Comfort Air Inc.md`));
    expect(fs.readFileSync(file, "utf8")).toContain("# Exit-readiness check: Bay Comfort Air Inc");
    expect(stores.leads.rows()[0]!.readiness_score).toBe(c.score);
  });

  it("makes the file name safe when the business name has path characters", () => {
    const stores = tempStores();
    const p = makeProspect({ business_name: "A/C & Heat: Pros*" });
    const file = writeReadinessCheck(stores, check(makeLead(p), p), p);
    expect(path.dirname(file)).toBe(stores.dir.checks);
    expect(path.basename(file)).toBe(`${p.prospect_id} A C & Heat Pros.md`);
  });

  it("writes the file even when no lead row exists yet", () => {
    const stores = tempStores();
    const p = makeProspect();
    expect(fs.existsSync(writeReadinessCheck(stores, check(makeLead(p), p), p))).toBe(true);
    expect(stores.leads.rows()).toEqual([]);
  });
});

describe("helpers", () => {
  it("formats money the house way and picks the right article", () => {
    expect(money(475_000)).toBe("$475K");
    expect(money(1_250_000)).toBe("$1.25M");
    expect(money(1_000_000)).toBe("$1M");
    expect(article("HVAC company")).toBe("an");
    expect(article("accounting firm")).toBe("an");
    expect(article("plumbing company")).toBe("a");
  });

  it("labels scores by band and marks a mostly unknown score provisional", () => {
    expect(readinessLabel(85)).toBe("Buyer-ready");
    expect(readinessLabel(65)).toBe("Close: fix 2 or 3 items");
    expect(readinessLabel(45)).toBe("Needs 12 to 24 months of preparation");
    expect(readinessLabel(20, 0.6)).toBe("Early stage (provisional)");
  });
});
