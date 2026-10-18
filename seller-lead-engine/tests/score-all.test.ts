import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { ProspectRow } from "../src/domain/schema.ts";
import { PlacesClient } from "../src/score/places.ts";
import { scoreAll } from "../src/score/score.ts";
import { makeProspect, tempStores, testConfig } from "./helpers.ts";
import { makeEntity, makeLicense } from "./fixtures/score/records.ts";

const TODAY = "2026-10-18";
const NOW = new Date("2026-10-18T14:00:00Z");
const config = testConfig();

/** A Places client on a fake fetch: every search finds `searchIds`, every details call answers `details`. */
function fakePlaces(cacheDir: string, opts: { searchIds?: string[]; details?: Record<string, unknown>; failSearch?: boolean } = {}) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url.includes(":searchText") ? "search" : `details:${url.split("/").pop()}`);
    if (url.includes(":searchText")) {
      if (opts.failSearch) return new Response("quota", { status: 429 });
      return Response.json({ places: (opts.searchIds ?? ["ChIJmatched00000001"]).map((id) => ({ id })) });
    }
    return Response.json({ id: url.split("/").pop(), businessStatus: "OPERATIONAL", rating: 4.9, userRatingCount: 240, websiteUri: "https://secret-site.example/", ...opts.details });
  }) as typeof fetch;
  return { places: new PlacesClient({ apiKey: "k", cacheDir, fetchImpl: impl, now: NOW }), calls };
}

function byId(rows: ProspectRow[]): Record<string, ProspectRow> {
  return Object.fromEntries(rows.map((r) => [r.prospect_id, r]));
}

describe("scoreAll", () => {
  it("rescores only new, scored and hold prospects and leaves the rest untouched", async () => {
    const stores = tempStores();
    const rows = [
      makeProspect({ prospect_id: "P-00001", status: "new", score: undefined, tier: "" }),
      makeProspect({ prospect_id: "P-00002", status: "hold", email_verification: "valid" }),
      makeProspect({ prospect_id: "P-00003", status: "in_sequence", score: 42, tier: "C" }),
      makeProspect({ prospect_id: "P-00004", status: "dnc", score: 11 }),
      makeProspect({ prospect_id: "P-00005", status: "excluded", exclude_reason: "no metro", metro: "" }),
      makeProspect({ prospect_id: "P-00006", status: "replied", score: 55 }),
    ];
    stores.prospects.upsert(rows);
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW });
    expect(result).toMatchObject({ scored: 2, excluded: 0, byTier: { A: 2, B: 0, C: 0 }, held: 0, errors: [] });
    const after = byId(stores.prospects.rows(true));
    expect(after["P-00001"]).toMatchObject({ status: "scored", score: 81, tier: "A", scored_at: "2026-10-18T14:00:00Z" });
    expect(after["P-00002"]!.status).toBe("scored");
    expect(after["P-00003"]).toEqual(rows[2]);
    expect(after["P-00004"]).toEqual(rows[3]);
    expect(after["P-00005"]).toEqual(rows[4]);
    expect(after["P-00006"]).toEqual(rows[5]);
  });

  it("writes components, reasons, the age band and tenure", async () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new", website: "" })]);
    await scoreAll(stores, config, { today: TODAY, now: NOW });
    const p = stores.prospects.rows(true)[0]!;
    expect(p).toMatchObject({
      score_components: "age=27; tenure=20; successor=15; size=7; fatigue=5; vertical=7",
      age_est_low: 57,
      age_est_high: 64,
      age_est_method: "license_issue_year",
      tenure_years: 32,
      exclude_reason: "",
    });
    expect(p.score_reasons.split("; ")).toEqual([
      "Licence issued 1994, which suggests a senior owner",
      "Licensed since 1994 (32 years)",
      "Sole officer on the current filing, business on record for 32 years",
      "Size unknown, scored neutral",
      "No website on record",
      "Vertical prior for HVAC company: 7 of 10",
    ]);
  });

  it("excludes knock-outs with the reason and a blank tier", async () => {
    const stores = tempStores();
    stores.prospects.upsert([
      makeProspect({ prospect_id: "P-00001", status: "scored", business_name: "Service Experts Heating & Air" }),
      makeProspect({ prospect_id: "P-00002", status: "new", license_issue_date: "2020-01-01", formation_date: "2020-01-01" }),
    ]);
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW });
    expect(result).toMatchObject({ scored: 0, excluded: 2 });
    const after = byId(stores.prospects.rows(true));
    expect(after["P-00001"]).toMatchObject({ status: "excluded", score: 0, tier: "", exclude_reason: 'franchise or chain name (matches "service experts")' });
    expect(after["P-00001"]!.score_reasons).toMatch(/^Excluded: franchise/);
    expect(after["P-00002"]!.exclude_reason).toBe("tenure 6 years, under the 15-year minimum");
  });

  it("excludes prospects on the suppression list by email, domain or prospect id", async () => {
    const stores = tempStores();
    stores.prospects.upsert([
      makeProspect({ prospect_id: "P-00001", status: "new", email: "Owner@One.example" }),
      makeProspect({ prospect_id: "P-00002", status: "new", email: "owner@two.example" }),
      makeProspect({ prospect_id: "P-00003", status: "new", email: "owner@three.example" }),
      makeProspect({ prospect_id: "P-00004", status: "new", email: "owner@four.example" }),
    ]);
    stores.suppression.append([
      { value: "owner@one.example", value_type: "email", reason: "opt_out", source: "reply R-1", added_at: "2026-10-01T00:00:00Z" },
      { value: "two.example", value_type: "domain", reason: "do_not_contact", source: "manual", added_at: "2026-10-01T00:00:00Z" },
      { value: "P-00003", value_type: "prospect", reason: "complaint", source: "reply R-2", added_at: "2026-10-01T00:00:00Z" },
    ]);
    await scoreAll(stores, config, { today: TODAY, now: NOW });
    const after = byId(stores.prospects.rows(true));
    expect(after["P-00001"]!.exclude_reason).toBe("suppressed (opt_out)");
    expect(after["P-00002"]!.exclude_reason).toBe("suppressed (do_not_contact)");
    expect(after["P-00003"]!.exclude_reason).toBe("suppressed (complaint)");
    expect(after["P-00004"]!.status).toBe("scored");
  });

  it("holds a prospect without a sendable email and releases it once verified", async () => {
    const stores = tempStores();
    stores.prospects.upsert([
      makeProspect({ prospect_id: "P-00001", status: "new", email_verification: "unknown" }),
      makeProspect({ prospect_id: "P-00002", status: "new", email_verification: "catch_all" }),
      makeProspect({ prospect_id: "P-00003", status: "new", email: "", email_verification: "unverified" }),
      makeProspect({ prospect_id: "P-00004", status: "new", email_verification: "role_based" }),
    ]);
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW });
    expect(result).toMatchObject({ scored: 4, held: 3, byTier: { A: 4 } });
    let after = byId(stores.prospects.rows(true));
    expect(["P-00001", "P-00002", "P-00003", "P-00004"].map((id) => after[id]!.status)).toEqual(["hold", "scored", "hold", "hold"]);
    stores.prospects.upsert([{ ...after["P-00001"]!, email_verification: "valid" }]);
    await scoreAll(stores, config, { today: TODAY, now: NOW });
    after = byId(stores.prospects.rows(true));
    expect(after["P-00001"]!.status).toBe("scored");
  });

  it("holds tiers the config does not send", async () => {
    const stores = tempStores();
    const weak = { status: "new" as const, license_issue_date: "2010-01-01", formation_date: "2010-01-01", officers: "JOHN EXAMPLE (P); JANE EXAMPLE (VP)", officer_count: 2 };
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", ...weak })]);
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW });
    expect(result.byTier.C).toBe(1);
    expect(stores.prospects.rows(true)[0]).toMatchObject({ tier: "C", status: "hold" });
    await scoreAll(stores, testConfig({ targeting: { send_tiers: ["A", "B", "C"] } }), { today: TODAY, now: NOW });
    expect(stores.prospects.rows(true)[0]!.status).toBe("scored");
  });

  it("joins entity and licence records through the sources column for the fatigue checks", async () => {
    const stores = tempStores();
    stores.entities.upsert([makeEntity({ source_record_id: "F96000001", last_annual_report_date: "2025-02-01" })]);
    stores.licenses.upsert([makeLicense({ source_record_id: "CAC1800001", expiration_date: "2026-11-15" })]);
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new", website: "exampleair.example", sources: "sunbiz:F96000001; dbpr:CAC1800001" })]);
    await scoreAll(stores, config, { today: TODAY, now: NOW });
    const p = stores.prospects.rows(true)[0]!;
    expect(p.score_components).toContain("fatigue=7");
    expect(p.score_reasons).toContain("No 2026 annual report on file after the May 1 deadline");
    expect(p.score_reasons).toContain("Licence expires 2026-11-15 and has not been renewed early");
  });
});

describe("scoreAll with Places", () => {
  it("stores only the place id, uses details in the score and keeps Maps content out of the CSV", async () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new", website: "" })]);
    const { places, calls } = fakePlaces(stores.dir.cache);
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(result).toMatchObject({ scored: 1, placesMatched: 1, errors: [] });
    expect(calls).toEqual(["search", "details:ChIJmatched00000001"]);
    const p = stores.prospects.rows(true)[0]!;
    expect(p).toMatchObject({ place_id: "ChIJmatched00000001", place_id_checked_at: "2026-10-18T14:00:00Z" });
    // 240 reviews -> 13 size points; the Places website clears the no-website signal.
    expect(p.score_components).toBe("age=27; tenure=20; successor=15; size=13; fatigue=2; vertical=7");
    const csv = fs.readFileSync(stores.prospects.file, "utf8");
    expect(csv).not.toMatch(/secret-site|4\.9|240|OPERATIONAL/);
  });

  it("makes no Places call for a knocked-out prospect", async () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new", metro: "" })]);
    const { places, calls } = fakePlaces(stores.dir.cache);
    await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(calls).toEqual([]);
  });

  it("excludes a business Places lists as permanently closed", async () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new" })]);
    const { places } = fakePlaces(stores.dir.cache, { details: { businessStatus: "CLOSED_PERMANENTLY" } });
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(result.excluded).toBe(1);
    expect(stores.prospects.rows(true)[0]).toMatchObject({ status: "excluded", exclude_reason: "closed permanently (Places business status)", place_id: "ChIJmatched00000001" });
  });

  it("does not store an ambiguous match", async () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new" })]);
    const { places, calls } = fakePlaces(stores.dir.cache, { searchIds: ["ChIJcandidate000001", "ChIJcandidate000002", "ChIJcandidate000003"] });
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(result.placesMatched).toBe(0);
    expect(calls).toEqual(["search"]);
    expect(stores.prospects.rows(true)[0]).toMatchObject({ place_id: "", place_id_checked_at: "2026-10-18T14:00:00Z" });
  });

  it("re-matches a place id only after 12 months and retries a failed match after 30 days", async () => {
    const stores = tempStores();
    stores.prospects.upsert([
      makeProspect({ prospect_id: "P-00001", status: "scored", place_id: "ChIJexisting0000001", place_id_checked_at: "2026-01-10T00:00:00Z" }),
      makeProspect({ prospect_id: "P-00002", status: "scored", place_id: "ChIJexisting0000002", place_id_checked_at: "2025-10-01T00:00:00Z" }),
      makeProspect({ prospect_id: "P-00003", status: "scored", place_id: "", place_id_checked_at: "2026-10-01T00:00:00Z" }),
      makeProspect({ prospect_id: "P-00004", status: "scored", place_id: "", place_id_checked_at: "2026-09-01T00:00:00Z" }),
    ]);
    const { places, calls } = fakePlaces(stores.dir.cache, { searchIds: ["ChIJrefreshed000001"] });
    await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(calls).toEqual(["details:ChIJexisting0000001", "search", "details:ChIJrefreshed000001", "search"]);
    const after = byId(stores.prospects.rows(true));
    expect(after["P-00001"]!.place_id).toBe("ChIJexisting0000001");
    expect(after["P-00002"]!.place_id).toBe("ChIJrefreshed000001");
    expect(after["P-00003"]!.place_id).toBe("");
    expect(after["P-00004"]!.place_id).toBe("ChIJrefreshed000001");
  });

  it("keeps scoring when Places fails and reports the error", async () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new" }), makeProspect({ prospect_id: "P-00002", status: "new" })]);
    const { places } = fakePlaces(stores.dir.cache, { failSearch: true });
    const result = await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(result.scored).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatchObject({ prospectId: "P-00001" });
    expect(result.errors[0]!.error).toMatch(/HTTP 429/);
    expect(stores.prospects.rows(true).map((p) => p.score)).toEqual([81, 81]);
  });

  it("scores without details once the monthly budget is spent", async () => {
    const stores = tempStores();
    stores.prospects.upsert([
      makeProspect({ prospect_id: "P-00001", status: "new", place_id: "ChIJexisting0000001", place_id_checked_at: "2026-10-01T00:00:00Z" }),
      makeProspect({ prospect_id: "P-00002", status: "new", place_id: "ChIJexisting0000002", place_id_checked_at: "2026-10-01T00:00:00Z" }),
    ]);
    const calls: string[] = [];
    const impl = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return Response.json({ id: String(input).split("/").pop(), businessStatus: "OPERATIONAL", userRatingCount: 240 });
    }) as typeof fetch;
    const places = new PlacesClient({ apiKey: "k", cacheDir: stores.dir.cache, fetchImpl: impl, now: NOW, maxDetailsPerMonth: 1 });
    await scoreAll(stores, config, { today: TODAY, now: NOW, places });
    expect(calls).toHaveLength(1);
    const after = byId(stores.prospects.rows(true));
    expect(after["P-00001"]!.score_components).toContain("size=13");
    expect(after["P-00002"]!.score_components).toContain("size=7");
  });
});
