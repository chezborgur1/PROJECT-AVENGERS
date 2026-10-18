import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DETAILS_FIELD_MASK, matchConfidence, PlacesClient, placesQuery, SEARCH_FIELD_MASK } from "../src/score/places.ts";
import { makeProspect, tmpDir } from "./helpers.ts";

const NOW = new Date("2026-10-18T14:00:00Z");
const PLACE = "ChIJexample0000001";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** A fetch stub that records each request and answers from a handler. */
function fakeFetch(handler: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const detailsBody = { id: PLACE, businessStatus: "OPERATIONAL", rating: 4.6, userRatingCount: 212, websiteUri: "https://exampleair.example/", displayName: { text: "ignored" } };

function client(opts: { cacheDir?: string; now?: Date; max?: number; handler?: (call: Call) => { status?: number; body: unknown } } = {}) {
  const cacheDir = opts.cacheDir ?? tmpDir();
  const f = fakeFetch(opts.handler ?? ((c) => (c.url.includes(":searchText") ? { body: { places: [{ id: PLACE }] } } : { body: detailsBody })));
  const places = new PlacesClient({ apiKey: "test-key", cacheDir, fetchImpl: f.impl, now: opts.now ?? NOW, ...(opts.max !== undefined ? { maxDetailsPerMonth: opts.max } : {}) });
  return { places, calls: f.calls, cacheDir };
}

describe("Places matching", () => {
  it("matches with an ID-only Text Search and the API key in a header", async () => {
    const { places, calls } = client();
    const p = makeProspect({ business_name: "Example Air Inc", dba_name: "", street: "101 Example Ave", city: "Tampa", state: "FL", zip: "33602" });
    expect(await places.matchPlaceId(p)).toEqual({ placeId: PLACE, confidence: 0.9 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://places.googleapis.com/v1/places:searchText",
      method: "POST",
      headers: { "X-Goog-Api-Key": "test-key", "X-Goog-FieldMask": "places.id" },
      body: { textQuery: "Example Air Inc, 101 Example Ave, Tampa, FL 33602", pageSize: 5, regionCode: "US" },
    });
    expect(SEARCH_FIELD_MASK).toBe("places.id");
    expect(calls[0]!.url).not.toContain("test-key");
  });

  it("prefers the DBA name and lowers confidence for ambiguous or street-less queries", () => {
    expect(placesQuery({ business_name: "Example Air Inc", dba_name: "Cool Breeze AC", street: "", city: "Tampa", state: "FL", zip: "" })).toBe("Cool Breeze AC, Tampa, FL");
    expect(placesQuery({ business_name: "Example Air Inc", dba_name: "", street: "", city: "", state: "", zip: "" })).toBe("");
    expect(matchConfidence(1, { street: "1 Main St", zip: "33602" })).toBe(0.9);
    expect(matchConfidence(2, { street: "1 Main St", zip: "33602" })).toBe(0.65);
    expect(matchConfidence(5, { street: "1 Main St", zip: "33602" })).toBe(0.45);
    expect(matchConfidence(1, { street: "", zip: "33602" })).toBe(0.72);
    expect(matchConfidence(1, { street: "", zip: "" })).toBe(0.63);
    expect(matchConfidence(0, { street: "1 Main St", zip: "" })).toBe(0);
  });

  it("returns null when nothing matches and never calls out without a query", async () => {
    const { places, calls } = client({ handler: () => ({ body: {} }) });
    expect(await places.matchPlaceId(makeProspect())).toBeNull();
    expect(await places.matchPlaceId(makeProspect({ street: "", city: "", state: "", zip: "" }))).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("throws on an HTTP error with the status and without the key", async () => {
    const { places } = client({ handler: () => ({ status: 403, body: { error: { message: "API key not valid" } } }) });
    const err = await places.matchPlaceId(makeProspect()).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 403/);
    expect((err as Error).message).not.toContain("test-key");
  });

  it("refuses to start without an API key", () => {
    expect(() => new PlacesClient({ apiKey: " ", cacheDir: tmpDir(), now: NOW })).toThrow(/GOOGLE_PLACES_API_KEY/);
  });
});

describe("Places details", () => {
  it("fetches the Enterprise fields once and serves repeats from the cache", async () => {
    const { places, calls, cacheDir } = client();
    const first = await places.details(PLACE);
    expect(first).toEqual({ placeId: PLACE, businessStatus: "OPERATIONAL", rating: 4.6, userRatingCount: 212, websiteUri: "https://exampleair.example/", fetchedAt: "2026-10-18T14:00:00Z" });
    expect(calls[0]).toMatchObject({ url: `https://places.googleapis.com/v1/places/${PLACE}`, method: "GET", headers: { "X-Goog-Api-Key": "test-key", "X-Goog-FieldMask": DETAILS_FIELD_MASK } });
    expect(DETAILS_FIELD_MASK).toBe("id,businessStatus,rating,userRatingCount,websiteUri");
    expect(await places.details(PLACE)).toEqual(first);
    expect(calls).toHaveLength(1);
    // A new client on the same folder reads the cache file.
    const again = client({ cacheDir, now: new Date("2026-11-16T13:59:59Z") });
    expect(await again.places.details(PLACE)).toEqual(first);
    expect(again.calls).toHaveLength(0);
    // The cache never holds anything the field mask did not ask for.
    expect(fs.readFileSync(path.join(cacheDir, "places.json"), "utf8")).not.toContain("displayName");
  });

  it("refetches once the cached entry is 30 days old", async () => {
    const { places, cacheDir } = client();
    await places.details(PLACE);
    const later = client({ cacheDir, now: new Date("2026-11-17T14:00:00Z") });
    const fresh = await later.places.details(PLACE);
    expect(later.calls).toHaveLength(1);
    expect(fresh?.fetchedAt).toBe("2026-11-17T14:00:00Z");
  });

  it("stops at the monthly budget and resets the next calendar month", async () => {
    const ids = ["ChIJexampleAAAAAA1", "ChIJexampleAAAAAA2", "ChIJexampleAAAAAA3"];
    const { places, calls, cacheDir } = client({ max: 2, handler: (c) => ({ body: { ...detailsBody, id: c.url.split("/").pop() } }) });
    expect(await places.details(ids[0]!)).not.toBeNull();
    expect(await places.details(ids[1]!)).not.toBeNull();
    expect(await places.details(ids[2]!)).toBeNull();
    expect(calls).toHaveLength(2);
    // Cached ids still answer past the budget.
    expect(await places.details(ids[0]!)).not.toBeNull();
    expect(places.usage()).toMatchObject({ month: "2026-10", detailsCalls: 2, maxDetailsPerMonth: 2 });
    const november = client({ cacheDir, max: 2, now: new Date("2026-11-01T00:00:00Z"), handler: (c) => ({ body: { ...detailsBody, id: c.url.split("/").pop() } }) });
    expect(await november.places.details(ids[2]!)).not.toBeNull();
    expect(november.places.usage()).toMatchObject({ month: "2026-11", detailsCalls: 1 });
  });

  it("counts a failed call against the budget and throws", async () => {
    const { places } = client({ max: 1, handler: () => ({ status: 500, body: "backend error" }) });
    await expect(places.details(PLACE)).rejects.toThrow(/HTTP 500 backend error/);
    expect(places.usage().detailsCalls).toBe(1);
    await expect(places.details(PLACE)).resolves.toBeNull();
  });

  it("returns null for an id Google no longer knows", async () => {
    const { places } = client({ handler: () => ({ status: 404, body: { error: { status: "NOT_FOUND" } } }) });
    expect(await places.details(PLACE)).toBeNull();
  });

  it("omits optional fields Google leaves out and rejects a malformed body", async () => {
    const sparse = client({ handler: () => ({ body: { id: PLACE } }) });
    expect(await sparse.places.details(PLACE)).toEqual({ placeId: PLACE, businessStatus: "", fetchedAt: "2026-10-18T14:00:00Z" });
    const bad = client({ handler: () => ({ body: { places: [] } }) });
    await expect(bad.places.details(PLACE)).rejects.toThrow(/unexpected body/);
  });

  it("refuses an id that is not a Places token before any request", async () => {
    const { places, calls } = client();
    await expect(places.details("../../v1/other")).rejects.toThrow(/Not a Places id/);
    expect(calls).toHaveLength(0);
  });
});

describe("Places cache file", () => {
  it("purges entries 30 or more days old and keeps fresh ones", async () => {
    const cacheDir = tmpDir();
    const file = path.join(cacheDir, "places.json");
    const entry = (id: string, fetchedAt: string) => ({ placeId: id, businessStatus: "OPERATIONAL", fetchedAt });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        details: {
          ChIJexampleFRESH01: entry("ChIJexampleFRESH01", "2026-10-01T00:00:00Z"),
          ChIJexampleSTALE01: entry("ChIJexampleSTALE01", "2026-09-18T14:00:00Z"),
          ChIJexampleSTALE02: entry("ChIJexampleSTALE02", "2026-01-01T00:00:00Z"),
          ChIJexampleBADTS01: entry("ChIJexampleBADTS01", "not a date"),
        },
        detailsCalls: { "2026-10": 7 },
        textSearches: {},
      }),
    );
    const places = new PlacesClient({ apiKey: "k", cacheDir, now: NOW, fetchImpl: (() => { throw new Error("no network in tests"); }) as typeof fetch });
    // Expired entries are never counted or served, even before the purge.
    expect(places.usage()).toMatchObject({ cached: 1, detailsCalls: 7 });
    expect(places.purgeExpired()).toBe(3);
    expect(places.purgeExpired()).toBe(0);
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(Object.keys(saved.details)).toEqual(["ChIJexampleFRESH01"]);
    expect(saved.detailsCalls).toEqual({ "2026-10": 7 });
    // The fresh entry answers from the cache; an expired one would need the network.
    await expect(places.details("ChIJexampleFRESH01")).resolves.toMatchObject({ placeId: "ChIJexampleFRESH01" });
    await expect(places.details("ChIJexampleSTALE01")).rejects.toThrow(/no network/);
  });

  it("purgeExpired returns the count dropped as time passes", async () => {
    const { places, cacheDir } = client();
    await places.details(PLACE);
    const later = new PlacesClient({ apiKey: "k", cacheDir, now: new Date("2026-10-30T00:00:00Z"), fetchImpl: fetch });
    expect(later.purgeExpired()).toBe(0);
    // Each client has a fixed clock, so a later run is a new client.
    const muchLater = new PlacesClient({ apiKey: "k", cacheDir, now: new Date("2026-12-01T00:00:00Z"), fetchImpl: fetch });
    expect(muchLater.usage().cached).toBe(0);
    expect(muchLater.purgeExpired()).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(cacheDir, "places.json"), "utf8")).details).toEqual({});
  });

  it("refuses a corrupt cache instead of silently resetting the budget", () => {
    const cacheDir = tmpDir();
    fs.writeFileSync(path.join(cacheDir, "places.json"), "{not json");
    const places = new PlacesClient({ apiKey: "k", cacheDir, now: NOW });
    expect(() => places.usage()).toThrow(/not valid JSON.*resets this month's Places call count/);
    fs.writeFileSync(path.join(cacheDir, "places.json"), JSON.stringify({ version: 2 }));
    expect(() => new PlacesClient({ apiKey: "k", cacheDir, now: NOW }).usage()).toThrow(/not a Places cache file/);
  });
});
