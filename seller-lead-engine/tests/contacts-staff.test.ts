import { describe, expect, it } from "vitest";
import { discoverSite } from "../src/contacts/discover.ts";
import { EntityRowSchema } from "../src/domain/schema.ts";
import { enrichContacts } from "../src/contacts/enrich.ts";
import { betterStaff, estimateFromPages, importedStaff, listedPeople, looksLikePersonName, staffLabel, statedStaff, teamLinks } from "../src/contacts/staff.ts";
import { scoreProspect, staffBandPoints } from "../src/score/score.ts";
import { buildProspects } from "../src/sources/merge.ts";
import { makeProspect, tempStores, testConfig } from "./helpers.ts";

// Headcount, the size signal: what a business's own site says or lists about
// its people, an imported list's employee column, and how it moves the score.
// The sites are fake pages served by a stub fetch: no network.

const SITE = "https://bayside-books.example";
const HOME = `<html><head><title>Bayside Bookkeeping</title></head><body>
  <nav><a href="/">Home</a> <a href="/our-team">Our Team</a> <a href="/about-us">About Us</a> <a href="https://facebook.example/bayside">Facebook</a></nav>
  <p>Monthly bookkeeping for Tampa Bay businesses since 1998. Over 30 years of experience. Serving 150 clients.</p>
  <p>Email <a href="mailto:jane@bayside-books.example">jane@bayside-books.example</a></p></body></html>`;
const TEAM = `<html><head><title>Meet the Team | Bayside Bookkeeping</title></head><body>
  <nav><a href="/">Home</a><strong>Our Services</strong></nav>
  <h1>Meet the Team</h1>
  <div class="member"><h3>Jane Q. Smith, CPA</h3><p>Founder</p></div>
  <div class="member"><h3>Carlos Ramirez</h3><p>Senior Bookkeeper</p></div>
  <div class="member"><h3>Mary O'Neil</h3><p>Payroll Specialist</p></div>
  <div class="member"><h3>Contact Us Today</h3></div>
  <footer><strong>Tampa Bay</strong></footer></body></html>`;

function site(pages: Record<string, string>, robots = "") {
  const fetched: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    fetched.push(url.pathname);
    if (url.pathname === "/robots.txt") return new Response(robots, { status: robots ? 200 : 404 });
    const page = pages[url.pathname];
    return page === undefined ? new Response("not found", { status: 404 }) : new Response(page, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return { impl, fetched };
}

describe("reading a headcount from page text", () => {
  it("takes a stated figure, and ignores years, clients and communities", () => {
    expect(statedStaff("Our team of 25 professionals serves Tampa Bay.")).toBe(25);
    expect(statedStaff("We have over 40 full-time employees.")).toBe(40);
    expect(statedStaff("The agency employs 12 people across two offices.")).toBe(12);
    expect(statedStaff("Our 12 licensed agents and 3 certified public accountants")).toBe(12);
    expect(statedStaff("Over 30 years of experience. Since 1985. Serving 150 communities and 400 clients.")).toBeUndefined();
    expect(statedStaff("A team of 3 offices")).toBeUndefined();
  });

  it("tells a person's name from a heading", () => {
    expect(looksLikePersonName("Jane Q. Smith, CPA")).toBe(true);
    expect(looksLikePersonName("Mary O'Neil")).toBe(true);
    expect(looksLikePersonName("Carlos Ramirez - Senior Bookkeeper")).toBe(true);
    for (const n of ["Our Services", "Meet the Team", "Contact Us Today", "Tampa Bay", "Payroll Specialist", "J. Smith", "Bookkeeping"]) expect(looksLikePersonName(n), n).toBe(false);
  });

  it("counts the people a team page lists, leaving out navigation and footers", () => {
    expect(listedPeople(TEAM)).toEqual(["Jane Q. Smith, CPA", "Carlos Ramirez", "Mary O'Neil"]);
    const jsonLd = `<script type="application/ld+json">[{"@type":"Person","name":"Ann Lee"},{"@type":"Person","name":"Bo Diaz"}]</script>`;
    expect(listedPeople(jsonLd).sort()).toEqual(["Ann Lee", "Bo Diaz"]);
  });

  it("prefers a stated figure, and needs two names before a team page counts", () => {
    const team = { url: `${SITE}/our-team`, html: TEAM, text: "Meet the Team" };
    expect(estimateFromPages([team])).toEqual({ count: 3, source: "website_listed", basis: "at least 3 people listed on the firm's own website" });
    expect(estimateFromPages([team, { url: `${SITE}/`, html: "", text: "a team of 18 bookkeepers" }])).toMatchObject({ count: 18, source: "website_stated" });
    const owner = `<h1>About</h1><h3>Jane Smith</h3>`;
    expect(estimateFromPages([{ url: `${SITE}/about`, html: owner, text: "About" }])).toBeUndefined();
    // A page that is not about the people is not counted.
    expect(estimateFromPages([{ url: `${SITE}/services`, html: "<title>Services</title><h3>Jane Smith</h3><h3>Carlos Ramirez</h3>", text: "" }])).toBeUndefined();
  });

  it("finds the site's own team and about links, team first", () => {
    expect(teamLinks(HOME, `${SITE}/`)).toEqual([`${SITE}/our-team`, `${SITE}/about-us`]);
    expect(teamLinks(HOME, `${SITE}/`, 1)).toEqual([`${SITE}/our-team`]);
  });

  it("reads an imported employee column, a range from its low end", () => {
    expect(importedStaff("18")).toEqual({ count: 18, source: "import", basis: "18 employees, per an imported list" });
    expect(importedStaff("11-50")).toMatchObject({ count: 11, basis: "11 to 50 employees, per an imported list" });
    expect(importedStaff("50+")).toMatchObject({ count: 50 });
    expect(importedStaff("1,200")).toMatchObject({ count: 1200 });
    expect(importedStaff("")).toBeUndefined();
    expect(importedStaff("small")).toBeUndefined();
  });

  it("labels a counted team page as a floor, and keeps a stronger source", () => {
    expect(staffLabel({ staff_count: 8, staff_source: "website_listed" })).toBe("8+");
    expect(staffLabel({ staff_count: 25, staff_source: "website_stated" })).toBe("25");
    expect(staffLabel({ staff_count: undefined, staff_source: "" })).toBe("");
    const stated = { staff_count: 25, staff_source: "website_stated" as const };
    expect(betterStaff({ count: 4, source: "website_listed", basis: "" }, stated)).toBe(false);
    expect(betterStaff({ count: 30, source: "website_stated", basis: "" }, stated)).toBe(true);
    expect(betterStaff({ count: 30, source: "import", basis: "" }, { staff_count: 3, staff_source: "website_listed" })).toBe(true);
  });
});

describe("discoverSite", () => {
  it("follows the team link on the same visit and returns the emails and the headcount", async () => {
    const { impl, fetched } = site({ "/": HOME, "/our-team": TEAM });
    const r = await discoverSite(SITE, { fetchImpl: impl });
    expect(r.emails.map((e) => e.email)).toEqual(["jane@bayside-books.example"]);
    expect(r.staff).toMatchObject({ count: 3, source: "website_listed" });
    expect(fetched).toContain("/our-team");
    expect(fetched.filter((p) => p === "/our-team")).toHaveLength(1);
  });

  it("does not read a team page robots.txt disallows, nor anything on a no-harvest site", async () => {
    const blocked = site({ "/": HOME, "/our-team": TEAM }, "User-agent: *\nDisallow: /our-team");
    const r = await discoverSite(SITE, { fetchImpl: blocked.impl });
    expect(blocked.fetched).not.toContain("/our-team");
    expect(r.staff).toBeUndefined();
    const notice = site({ "/": `${HOME}<p>Do not harvest email addresses from this site.</p>`, "/our-team": TEAM });
    expect(await discoverSite(SITE, { fetchImpl: notice.impl })).toEqual({ emails: [], staff: undefined });
  });
});

describe("headcount in the pipeline", () => {
  it("records the headcount when finding emails, without replacing a stronger one", async () => {
    const stores = tempStores();
    const p = makeProspect({ email: "", email_source: "", email_verification: "unverified", website: SITE, status: "new" });
    const stated = makeProspect({ email: "", email_source: "", email_verification: "unverified", website: SITE, status: "new", staff_count: 20, staff_source: "website_stated", staff_basis: "about 20 staff, per the firm's own website" });
    stores.prospects.upsert([p, stated]);
    const r = await enrichContacts(stores, testConfig(), { now: new Date("2026-10-27T14:00:00Z"), discover: true, verify: false, fetchImpl: site({ "/": HOME, "/our-team": TEAM }).impl });
    expect(r.staffed).toBe(1);
    const rows = new Map(stores.prospects.rows().map((x) => [x.prospect_id, x]));
    expect(rows.get(p.prospect_id)).toMatchObject({ staff_count: 3, staff_source: "website_listed", email: "jane@bayside-books.example" });
    expect(rows.get(stated.prospect_id)).toMatchObject({ staff_count: 20, staff_source: "website_stated" });
  });

  it("takes an imported list's employee column into the prospect", () => {
    const stores = tempStores();
    const config = testConfig();
    const blank = Object.fromEntries(Object.keys(EntityRowSchema.shape).map((k) => [k, ""]));
    stores.entities.upsert([
      EntityRowSchema.parse({
        ...blank,
        source: "sunbiz",
        source_record_id: "L98000001",
        state: "FL",
        entity_name: "GULF COAST HEATING AND AIR INC",
        status: "active",
        formation_date: "1998-01-01",
        principal_city: "TAMPA",
        principal_state: "FL",
        principal_zip: "33602",
      }),
    ]);
    stores.contacts.upsert([
      { source: "csv", source_record_id: "C-1", business_name: "GULF COAST HEATING AND AIR INC", zip: "33602", first_name: "", last_name: "", role: "", email: "", email_source: "import", email_source_url: "", website: "", phone: "", employees: "11-50" },
    ]);
    buildProspects(stores, config, { now: new Date("2026-10-27T14:00:00Z") });
    const built = stores.prospects.rows()[0];
    expect(built).toMatchObject({ staff_count: 11, staff_source: "import", staff_basis: "11 to 50 employees, per an imported list" });
  });

  it("scores size from headcount first, highest at 10 to 49 people", () => {
    expect([1, 3, 8, 25, 75, 150].map(staffBandPoints)).toEqual([2, 5, 11, 14, 10, 4]);
    const config = testConfig();
    const base = makeProspect({ status: "new" });
    const unknown = scoreProspect(base, { config, today: "2026-10-27" });
    const staffed = scoreProspect({ ...base, staff_count: 25, staff_source: "website_stated", staff_basis: "about 25 staff, per the firm's own website" }, { config, today: "2026-10-27" });
    expect(unknown.components.size).toBe(7);
    expect(staffed.components.size).toBe(14);
    expect(staffed.reasons).toContain("Headcount: about 25 staff, per the firm's own website");
    const solo = scoreProspect({ ...base, staff_count: 1, staff_source: "import", staff_basis: "1 employees, per an imported list" }, { config, today: "2026-10-27" });
    expect(solo.score).toBeLessThan(staffed.score);
  });
});
