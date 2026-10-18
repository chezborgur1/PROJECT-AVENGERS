import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ProspectRow } from "../domain/schema.ts";
import { isoStamp } from "../util/dates.ts";

// A small Google Places API (New) client for scoring, built around the Maps
// Platform terms (docs/research/data.md §3):
//
// - Only `place_id` is ever persisted (prospects.csv). Place IDs are exempt
//   from the caching ban (ToS 3.2.3(b), Places policies).
// - Matching uses Text Search with the field mask "places.id", the free
//   ID-only SKU. An ID-only search returns no name or address, so the match
//   confidence comes from how many candidates came back and how specific the
//   query was, not from comparing names (data.md, verification fact 15).
// - Details (businessStatus, rating, userRatingCount, websiteUri) are
//   Enterprise fields, billed per call after 1,000 free a month. They live
//   only in a cache file under cacheDir and are purged after 30 days. Whether
//   even a 30-day cache of ratings and websites is allowed is a counsel
//   question (data.md §3 and §10); 30 days is the outer limit, never longer.
// - A monthly call counter in the same file stops Enterprise calls at the
//   budget, so a large run never tips into billing by surprise.
// - Places has no "years open" field, so tenure always comes from licence and
//   state records, never from here.
//
// Every request goes through the injected fetchImpl; the clock is the `now`
// passed in. The API key goes in a header and never into an error message.

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
/** Field mask for matching: ID only, the free Text Search SKU. */
export const SEARCH_FIELD_MASK = "places.id";
/** Field mask for details: Enterprise fields, so each call counts against the monthly budget. */
export const DETAILS_FIELD_MASK = "id,businessStatus,rating,userRatingCount,websiteUri";
/** Cached details older than this are expired and purged. */
export const CACHE_TTL_DAYS = 30;
/**
 * Default monthly cap on details calls: under the 1,000 free Place Details
 * Enterprise calls (data.md §3, 2026 pricing), leaving headroom for anything
 * else on the same key.
 */
export const DEFAULT_MAX_DETAILS_PER_MONTH = 900;
/** Candidates asked for per match; Text Search pages hold at most 20. */
export const SEARCH_PAGE_SIZE = 5;
/** The lowest match confidence scoring trusts enough to store a place_id and fetch details. */
export const MIN_MATCH_CONFIDENCE = 0.6;

const DAY_MS = 86_400_000;

/** Places details for one place, held only in the 30-day cache. */
export interface PlacesDetails {
  placeId: string;
  businessStatus: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  fetchedAt: string;
}

/** What the cache file holds: details by place id, and call counters by calendar month (YYYY-MM, UTC). */
interface CacheFile {
  version: 1;
  details: Record<string, PlacesDetails>;
  detailsCalls: Record<string, number>;
  textSearches: Record<string, number>;
}

const CachedDetailsSchema = z.object({
  placeId: z.string(),
  businessStatus: z.string(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  websiteUri: z.string().optional(),
  fetchedAt: z.string(),
});
const CacheFileSchema = z.object({
  version: z.literal(1),
  details: z.record(z.string(), CachedDetailsSchema).default({}),
  detailsCalls: z.record(z.string(), z.number()).default({}),
  textSearches: z.record(z.string(), z.number()).default({}),
});

// Google's responses, read leniently: unknown fields are ignored and absent
// optional fields stay absent.
const SearchResponseSchema = z.object({ places: z.array(z.object({ id: z.string() })).optional() });
const DetailsResponseSchema = z.object({
  id: z.string(),
  businessStatus: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  websiteUri: z.string().optional(),
});

/** Place IDs are URL-safe tokens; anything else is refused before it reaches a URL path. */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

/** Places API (New) client: free ID-only matching, budgeted and cached details. */
export class PlacesClient {
  readonly cacheFile: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: Date;
  private readonly maxDetailsPerMonth: number;
  private cache: CacheFile | undefined;

  constructor(opts: { apiKey: string; cacheDir: string; fetchImpl?: typeof fetch; now: Date; maxDetailsPerMonth?: number }) {
    if (!opts.apiKey.trim()) throw new Error("Places needs an API key: set GOOGLE_PLACES_API_KEY in .env, or score without --places.");
    this.apiKey = opts.apiKey.trim();
    this.cacheFile = path.join(opts.cacheDir, "places.json");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now;
    this.maxDetailsPerMonth = opts.maxDetailsPerMonth ?? DEFAULT_MAX_DETAILS_PER_MONTH;
  }

  /** The best place id for a prospect from an ID-only Text Search, with a 0-1 confidence; null when nothing matches. */
  async matchPlaceId(p: ProspectRow): Promise<{ placeId: string; confidence: number } | null> {
    const textQuery = placesQuery(p);
    if (!textQuery) return null;
    const res = await this.fetchImpl(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": SEARCH_FIELD_MASK },
      body: JSON.stringify({ textQuery, pageSize: SEARCH_PAGE_SIZE, regionCode: "US" }),
    });
    // Free calls are still counted, so the usage line shows what a run did.
    const cache = this.load();
    const month = this.month();
    cache.textSearches[month] = (cache.textSearches[month] ?? 0) + 1;
    this.save();
    if (!res.ok) throw new Error(`Places Text Search failed for ${p.prospect_id}: HTTP ${res.status} ${await errorText(res)}`);
    const parsed = SearchResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error(`Places Text Search for ${p.prospect_id} returned an unexpected body: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    const ids = [...new Set((parsed.data.places ?? []).map((pl) => pl.id).filter((id) => PLACE_ID.test(id)))];
    if (!ids.length) return null;
    return { placeId: ids[0]!, confidence: matchConfidence(ids.length, p) };
  }

  /** Details for a place: from the cache when fetched under 30 days ago, else one Enterprise call; null past the monthly budget or when Google no longer knows the id. */
  async details(placeId: string): Promise<PlacesDetails | null> {
    if (!PLACE_ID.test(placeId)) throw new Error(`Not a Places id: "${placeId.slice(0, 80)}"`);
    const cache = this.load();
    const hit = cache.details[placeId];
    if (hit && !this.expired(hit)) return { ...hit };

    const month = this.month();
    const used = cache.detailsCalls[month] ?? 0;
    if (used >= this.maxDetailsPerMonth) return null;
    // Count the call before making it: a request that fails after reaching
    // Google may still be billed, so the guard errs on the side of stopping.
    cache.detailsCalls[month] = used + 1;
    this.save();

    const res = await this.fetchImpl(`${DETAILS_URL}${encodeURIComponent(placeId)}`, {
      method: "GET",
      headers: { "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
    });
    if (res.status === 404) {
      // A stale or retired id: drop anything cached and let the next run re-match.
      delete cache.details[placeId];
      this.save();
      return null;
    }
    if (!res.ok) throw new Error(`Places details failed for ${placeId}: HTTP ${res.status} ${await errorText(res)}`);
    const parsed = DetailsResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error(`Places details for ${placeId} returned an unexpected body: ${parsed.error.issues[0]?.message ?? "invalid"}`);
    const d = parsed.data;
    const details: PlacesDetails = {
      placeId,
      businessStatus: d.businessStatus ?? "",
      ...(d.rating !== undefined ? { rating: d.rating } : {}),
      ...(d.userRatingCount !== undefined ? { userRatingCount: d.userRatingCount } : {}),
      ...(d.websiteUri ? { websiteUri: d.websiteUri } : {}),
      fetchedAt: isoStamp(this.now),
    };
    cache.details[placeId] = details;
    this.save();
    return { ...details };
  }

  /** Drops cache entries fetched 30 or more days ago and returns how many went. */
  purgeExpired(): number {
    const cache = this.load();
    const removed = this.dropExpired(cache);
    if (removed) this.save();
    return removed;
  }

  /** This month's call counts against the budget, for the CLI's summary line. */
  usage(): { month: string; detailsCalls: number; maxDetailsPerMonth: number; textSearches: number; cached: number } {
    const cache = this.load();
    const month = this.month();
    return {
      month,
      detailsCalls: cache.detailsCalls[month] ?? 0,
      maxDetailsPerMonth: this.maxDetailsPerMonth,
      textSearches: cache.textSearches[month] ?? 0,
      cached: Object.values(cache.details).filter((d) => !this.expired(d)).length,
    };
  }

  // ------------------------------------------------------------- cache file

  private month(): string {
    return this.now.toISOString().slice(0, 7);
  }

  private expired(d: PlacesDetails): boolean {
    const fetched = Date.parse(d.fetchedAt);
    // An unreadable timestamp cannot prove the entry is fresh, so it is treated as expired.
    return !Number.isFinite(fetched) || this.now.getTime() - fetched >= CACHE_TTL_DAYS * DAY_MS;
  }

  private dropExpired(cache: CacheFile): number {
    let removed = 0;
    for (const [id, d] of Object.entries(cache.details)) {
      if (this.expired(d)) {
        delete cache.details[id];
        removed++;
      }
    }
    return removed;
  }

  private load(): CacheFile {
    if (this.cache) return this.cache;
    let cache: CacheFile = { version: 1, details: {}, detailsCalls: {}, textSearches: {} };
    if (fs.existsSync(this.cacheFile)) {
      // A corrupt file is an error, not a fresh start: resetting it silently
      // would also reset the month's budget counter.
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(this.cacheFile, "utf8"));
      } catch (err) {
        throw new Error(`${this.cacheFile} is not valid JSON (${(err as Error).message}). Fix or delete it; deleting it also resets this month's Places call count.`);
      }
      const parsed = CacheFileSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`${this.cacheFile} is not a Places cache file: ${parsed.error.issues[0]?.message ?? "invalid"}. Fix or delete it.`);
      cache = parsed.data as CacheFile;
    }
    this.cache = cache;
    return cache;
  }

  private save(): void {
    if (!this.cache) return;
    // Every write also drops expired entries, so the file never carries one
    // forward; reads skip them too (details, usage), so nothing older than 30
    // days is ever used even before a purge runs.
    this.dropExpired(this.cache);
    fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
    const tmp = `${this.cacheFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.cache, null, 2)}\n`);
    fs.renameSync(tmp, this.cacheFile);
  }
}

/** The Text Search query for a prospect: business name, street, city, state and zip. Blank without a name and a place. */
export function placesQuery(p: Pick<ProspectRow, "business_name" | "dba_name" | "street" | "city" | "state" | "zip">): string {
  // The DBA is the name on the sign, so it matches Maps listings better than the legal name.
  const name = (p.dba_name || p.business_name).trim();
  const place = [p.street, p.city, [p.state, p.zip].filter(Boolean).join(" ")].map((s) => s.trim()).filter(Boolean);
  if (!name || !place.length) return "";
  return [name, ...place].join(", ");
}

/**
 * Confidence in the first candidate. An ID-only search cannot compare names
 * or addresses, so this rests on ambiguity: one candidate for a full
 * name-and-street query is very likely right; several mean Google was not
 * sure. A query without a street (licence-only records) is less specific.
 */
export function matchConfidence(candidates: number, p: Pick<ProspectRow, "street" | "zip">): number {
  if (candidates <= 0) return 0;
  const base = candidates === 1 ? 0.9 : candidates === 2 ? 0.65 : 0.45;
  const specificity = p.street.trim() ? 1 : p.zip.trim() ? 0.8 : 0.7;
  return Math.round(base * specificity * 100) / 100;
}

async function errorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    // Google error bodies are JSON with a message; keep it short and single-line.
    return text.replace(/\s+/g, " ").slice(0, 200);
  } catch {
    return "";
  }
}
