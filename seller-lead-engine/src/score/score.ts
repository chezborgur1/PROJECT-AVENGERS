import type { EngineConfig } from "../config.ts";
import { normalizeEmail, splitList, type EntityRow, type LicenseRow, type ProspectRow, type SuppressionRow } from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { addDays, daysBetween, isoStamp, yearsSince } from "../util/dates.ts";
import { ageBasisYear, ageMidpoint, estimateOwnerAge, type AgeEstimate } from "./age.ts";
import { MIN_MATCH_CONFIDENCE, type PlacesClient, type PlacesDetails } from "./places.ts";

// The likely-to-sell score (0 to 100) from docs/research/data.md §9. The
// weights are a starting heuristic, not fitted to data; every component's
// points are logged on the prospect so they can be refitted once about 50
// replies are labelled (data.md §9).
//
//   owner age 30 | tenure 20 | no apparent successor 15 | size fit 15 |
//   fatigue signals 10 | vertical prior 10
//
// Knock-outs score 0 and set status `excluded`: suppressed, inactive entity
// or licence, Places CLOSED_PERMANENTLY, franchise or chain name, excluded
// domain, tenure under the configured minimum, no vertical or no metro.
//
// Missing data never zeroes a prospect: an unknown component scores a
// documented neutral-low value (NEUTRAL below), because a blank cell in a
// public file says nothing about the owner. Size fit is truly neutral when
// unknown, since a missing review count is no evidence either way.
//
// Every reason is plain English for the advisor (handoff "why they look like
// a seller"). Reasons describe the record, never the estimated age as a fact,
// and never repeat Google Maps content (ratings, review counts, websites):
// score_reasons is persisted and Maps content may not be (ToS 3.2.3).
// Reasons never contain ";" because score_reasons is a "; "-separated list.

/** Component weights (maximum points) from data.md §9. */
export const WEIGHTS = { age: 30, tenure: 20, successor: 15, size: 15, fatigue: 10, vertical: 10 } as const;
export type Component = keyof typeof WEIGHTS;

/** Points for a component when its data is missing: neutral-low, so a blank record neither wins nor vanishes. */
export const NEUTRAL = {
  /** Between the "under 45" (0) and "45 to 54" (10) bands. */
  age: 8,
  /** Between the "under 10 years" (0) and "10 to 14" (6) bands. Only reached when no tenure knock-out can apply. */
  tenure: 4,
  /** Below "several officers, none sharing the surname" (8): no officer list at all is weaker evidence. */
  successor: 5,
  /** Half of 15: no size evidence either way. */
  size: 7,
  /** Per unknown fatigue check (annual report, licence expiry). */
  fatigueUnknown: 1,
} as const;

/** Statuses `scoreAll` rescoring touches; anything further along the funnel is left alone. */
export const RESCORE_STATUSES = ["new", "scored", "hold"] as const;
/** Verifications good enough to enter a sequence, per DESIGN.md module B. */
export const SCORE_SENDABLE_VERIFICATIONS = ["valid", "catch_all"] as const;

/** One prospect's score, every component's points and the plain-English reasons behind them. */
export interface ScoreResult {
  score: number;
  tier: "A" | "B" | "C";
  components: Record<string, number>;
  reasons: string[];
  knockout?: string;
  age: AgeEstimate;
  tenureYears?: number;
}

/** Context for one score. `entity` and `licenses` are the prospect's import records, used for the fatigue checks when present. */
export interface ScoreContext {
  config: EngineConfig;
  today: string;
  places?: PlacesDetails | null;
  suppressedReason?: string;
  entity?: EntityRow;
  licenses?: LicenseRow[];
}

/** Score one prospect. Pure: no clock, no network, no store. */
export function scoreProspect(p: ProspectRow, ctx: ScoreContext): ScoreResult {
  const { config, today } = ctx;
  const age = estimateOwnerAge(p, today);
  const tenure = tenureOf(p, today);

  const parts: Record<Component, { points: number; reasons: string[] }> = {
    age: agePoints(p, age),
    tenure: tenurePoints(tenure),
    successor: successorPoints(p, tenure.years),
    size: sizePoints(p, ctx.places),
    fatigue: fatiguePoints(p, ctx),
    vertical: verticalPoints(p, config),
  };
  const components = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.points]));
  const reasons = Object.values(parts).flatMap((v) => v.reasons);
  const knockout = knockoutOf(p, ctx, tenure.years);
  const base = { components, age, ...(tenure.years !== undefined ? { tenureYears: tenure.years } : {}) };
  if (knockout) return { ...base, score: 0, tier: "C", reasons: [`Excluded: ${knockout}`, ...reasons], knockout };
  const score = Math.max(0, Math.min(100, Object.values(parts).reduce((sum, v) => sum + v.points, 0)));
  return { ...base, score, tier: tierFor(score, config), reasons };
}

/** Tier from the configured thresholds: A at or above tier_a_min, B at or above tier_b_min, else C. */
export function tierFor(score: number, config: EngineConfig): "A" | "B" | "C" {
  if (score >= config.targeting.tier_a_min) return "A";
  if (score >= config.targeting.tier_b_min) return "B";
  return "C";
}

/** "age=27; tenure=20; ..." for the score_components column. */
export function formatComponents(components: Record<string, number>): string {
  return Object.entries(components)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ---------------------------------------------------------------- knock-outs

/** The first knock-out that applies, or undefined. Ordered so the most permanent reason is the one recorded. */
export function knockoutOf(p: ProspectRow, ctx: ScoreContext, tenureYears: number | undefined): string | undefined {
  const { config } = ctx;
  if (ctx.suppressedReason) return `suppressed (${ctx.suppressedReason})`;
  if (isInactiveStatus(p.entity_status)) return `inactive entity (status ${p.entity_status})`;
  if (licencesInactive(p.license_status)) return `inactive licence (status ${p.license_status})`;
  if (ctx.places?.businessStatus === "CLOSED_PERMANENTLY") return "closed permanently (Places business status)";
  const pattern = chainPattern(p, config.targeting.exclude_name_patterns);
  if (pattern) return `franchise or chain name (matches "${pattern}")`;
  const domain = excludedDomain(p, config.targeting.exclude_domains);
  if (domain) return `excluded domain (${domain})`;
  if (!p.vertical) return "no vertical";
  if (!config.verticals[p.vertical]) return `no vertical (${p.vertical} is not in the config)`;
  if (!p.metro) return "no metro";
  if (!config.metros[p.metro]) return `no metro (${p.metro} is not in the config)`;
  // Unknown tenure is not a knock-out: a missing date is not evidence of a young business.
  const min = config.targeting.min_tenure_years;
  if (tenureYears !== undefined && tenureYears < min) return `tenure ${tenureYears} years, under the ${min}-year minimum`;
  return undefined;
}

// Status words that mean the entity or licence cannot trade. Sunbiz uses
// A/I codes; DBPR uses phrases such as "Current,Inactive", "Delinquent,Active"
// (not renewed, so not allowed to contract) and "Null and Void".
const INACTIVE_WORDS = /\b(inactive|dissolved|revoked|expired|cancel+ed|cancel+ation|suspended|null|void|delinquent|withdrawn|terminated|forfeit(ed)?|closed|retired|deceased)\b/i;

/** True when a status cell says inactive. Blank or unrecognised codes are unknown, not inactive. */
export function isInactiveStatus(status: string): boolean {
  const s = status.trim();
  if (!s) return false;
  if (/^i$/i.test(s)) return true; // Sunbiz "I"
  return INACTIVE_WORDS.test(s);
}

// A business with several licences is inactive only when every one is: one
// lapsed class does not stop the others trading.
function licencesInactive(cell: string): boolean {
  const statuses = splitList(cell);
  return statuses.length > 0 && statuses.every(isInactiveStatus);
}

function words(s: string): string {
  return ` ${s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function chainPattern(p: ProspectRow, patterns: readonly string[]): string | undefined {
  const names = [p.business_name, p.dba_name].filter(Boolean).map(words);
  return patterns.find((pat) => {
    const w = words(pat);
    return w.trim() !== "" && names.some((n) => n.includes(w));
  });
}

/** The host of a website cell, lower-cased and without "www.". */
export function websiteHost(website: string): string {
  const s = website.trim().toLowerCase();
  if (!s) return "";
  try {
    return new URL(/^[a-z]+:\/\//.test(s) ? s : `http://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainMatches(host: string, entry: string): boolean {
  return host === entry || host.endsWith(`.${entry}`);
}

function excludedDomain(p: ProspectRow, entries: readonly string[]): string | undefined {
  const email = normalizeEmail(p.email);
  const emailDomain = email.split("@")[1] ?? "";
  const host = websiteHost(p.website);
  for (const raw of entries) {
    const entry = raw.trim().toLowerCase().replace(/^@/, "").replace(/^www\./, "");
    if (!entry) continue;
    if (entry.includes("@")) {
      if (email && email === entry) return entry;
      continue;
    }
    if ((emailDomain && domainMatches(emailDomain, entry)) || (host && domainMatches(host, entry))) return entry;
  }
  return undefined;
}

// ---------------------------------------------------------------- age (30)

/** Points by the band's midpoint, data.md §9: under 45 = 0, 45-54 = 10, 55-59 = 20, 60-64 = 27, 65+ = 30. */
export function agePointsForMidpoint(mid: number): number {
  if (mid >= 65) return 30;
  if (mid >= 60) return 27;
  if (mid >= 55) return 20;
  if (mid >= 45) return 10;
  return 0;
}

function agePoints(p: ProspectRow, age: AgeEstimate): { points: number; reasons: string[] } {
  const mid = ageMidpoint(age);
  if (mid === undefined) return { points: NEUTRAL.age, reasons: ["No graduation, licence or formation year on record to suggest the owner's career stage"] };
  const points = agePointsForMidpoint(mid);
  const stage = points >= 20 ? "a senior owner" : points >= 10 ? "a mid-career owner" : "an owner earlier in their career";
  const year = ageBasisYear(p, age.method);
  const event = age.method === "graduation_year" ? "Graduated" : age.method === "license_issue_year" ? "Licence issued" : "Business formed";
  return { points, reasons: [`${event} ${year}, which suggests ${stage}`] };
}

// ---------------------------------------------------------------- tenure (20)

interface Tenure {
  years?: number;
  since?: string;
  source?: "license" | "formation";
}

/** Years since the earliest of formation and original licence issue (data.md §9). Future dates are ignored as bad data. */
export function tenureOf(p: Pick<ProspectRow, "formation_date" | "license_issue_date">, today: string): Tenure {
  const dates = [
    { date: p.license_issue_date, source: "license" as const },
    { date: p.formation_date, source: "formation" as const },
  ].filter((d) => d.date && d.date <= today);
  if (!dates.length) return {};
  const earliest = dates.reduce((a, b) => (b.date < a.date ? b : a));
  return { years: yearsSince(earliest.date, today), since: earliest.date, source: earliest.source };
}

/** Points for tenure, data.md §9: under 10 = 0, 10-14 = 6, 15-19 = 12, 20-24 = 16, 25+ = 20. */
export function tenurePointsForYears(years: number): number {
  if (years >= 25) return 20;
  if (years >= 20) return 16;
  if (years >= 15) return 12;
  if (years >= 10) return 6;
  return 0;
}

function tenurePoints(t: Tenure): { points: number; reasons: string[] } {
  if (t.years === undefined || !t.since) return { points: NEUTRAL.tenure, reasons: ["No formation or licence date on record"] };
  const year = t.since.slice(0, 4);
  const span = `${t.years} ${t.years === 1 ? "year" : "years"}`;
  const reason = t.source === "license" ? `Licensed since ${year} (${span})` : `Formed in ${year} (${span} on record)`;
  return { points: tenurePointsForYears(t.years), reasons: [reason] };
}

// ---------------------------------------------------------------- successor (15)

// "V" is left out: in "JOHN V SMITH" it is a middle initial far more often than a suffix.
const NAME_SUFFIX = /^(JR|SR|II|III|IV)$/;
const ENTITY_WORDS = /\b(INC|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|PA|PLLC|PC|SERVICES?|GROUP|HOLDINGS?|TRUST|ENTERPRISES?|PARTNERS|REGISTERED|AGENTS?|ASSOCIATES)\b/;

/** A person's name reduced to what the successor check compares. */
export interface ParsedName {
  first: string;
  last: string;
  suffix: string;
  key: string;
}

/** Parses "FIRST M LAST JR" or "LAST, FIRST M" into upper-case first, last and generational suffix; undefined for a company name. */
export function parsePersonName(raw: string): ParsedName | undefined {
  const cleaned = raw.toUpperCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || ENTITY_WORDS.test(cleaned)) return undefined;
  let tokens: string[];
  let last: string | undefined;
  if (cleaned.includes(",")) {
    const [lastPart, ...rest] = cleaned.split(",").map((s) => s.trim());
    const restTokens = rest.join(" ").split(" ").filter(Boolean);
    // "SMITH, JOHN, JR" and "SMITH JR, JOHN" both carry the suffix somewhere.
    const lastTokens = (lastPart ?? "").split(" ").filter(Boolean);
    const suffix = [...lastTokens, ...restTokens].find((t) => NAME_SUFFIX.test(t)) ?? "";
    last = lastTokens.filter((t) => !NAME_SUFFIX.test(t)).join(" ");
    tokens = restTokens.filter((t) => !NAME_SUFFIX.test(t));
    const first = tokens[0] ?? "";
    if (!first || !last) return undefined;
    return { first, last, suffix, key: `${first} ${last} ${suffix}`.trim() };
  }
  tokens = cleaned.split(" ").filter(Boolean);
  // Without a comma the suffix can only be the last word ("JOHN SMITH JR").
  const suffix = tokens.length > 2 && NAME_SUFFIX.test(tokens[tokens.length - 1]!) ? tokens.pop()! : "";
  if (tokens.length < 2) return undefined;
  const first = tokens[0]!;
  last = tokens[tokens.length - 1]!;
  return { first, last, suffix, key: `${first} ${last} ${suffix}`.trim() };
}

/** Distinct person officers from the officers cell ("Name (TITLE)" entries); companies are dropped. */
export function personOfficers(officers: string): ParsedName[] {
  const seen = new Map<string, ParsedName>();
  for (const entry of splitList(officers)) {
    const name = entry.replace(/\s*\([^)]*\)\s*$/, "");
    const parsed = parsePersonName(name);
    if (parsed && !seen.has(parsed.key)) seen.set(parsed.key, parsed);
  }
  return [...seen.values()];
}

function ownerName(p: ProspectRow): ParsedName | undefined {
  if (p.owner_first_name && p.owner_last_name) {
    const full = parsePersonName(`${p.owner_first_name} ${p.owner_last_name}`);
    const fromFull = parsePersonName(p.owner_name);
    if (full) return { ...full, suffix: fromFull?.suffix ?? "", key: `${full.first} ${full.last} ${fromFull?.suffix ?? ""}`.trim() };
  }
  return parsePersonName(p.owner_name);
}

// Same surname with a different first name, or the same name with a
// generational suffix (JR, II), reads as the next generation (data.md §9).
function nextGeneration(a: ParsedName, b: ParsedName): boolean {
  if (a.last !== b.last) return false;
  return a.first !== b.first || a.suffix !== b.suffix;
}

function successorPoints(p: ProspectRow, tenureYears: number | undefined): { points: number; reasons: string[] } {
  const people = personOfficers(p.officers);
  const owner = ownerName(p);
  const count = Math.max(p.officer_count ?? 0, people.length);
  if (count === 0) return { points: NEUTRAL.successor, reasons: ["No officer list on record, so succession is unknown"] };

  const others = owner ? people.filter((o) => o.key !== owner.key) : people;
  const shared = owner
    ? others.find((o) => nextGeneration(owner, o))
    : others.find((o, i) => others.some((x, j) => j !== i && nextGeneration(o, x)));
  if (shared) {
    return { points: 0, reasons: [`Another officer shares the owner's surname (${titleCase(shared.first)} ${titleCase(shared.last)}), a likely next generation`] };
  }
  if (count === 1) {
    // data.md §9 gives the full 15 to a sole officer of 10+ years. The engine
    // sees one filing snapshot, so years on record stand in for "every
    // annual report", and the reason says only what the record shows.
    if (tenureYears !== undefined && tenureYears >= 10) return { points: 15, reasons: [`Sole officer on the current filing, business on record for ${tenureYears} years`] };
    return { points: 10, reasons: ["Sole officer on the current filing"] };
  }
  return { points: 8, reasons: [`${count} officers on the filing, none sharing the owner's surname`] };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------- size fit (15)

/**
 * Review-count bands, a live proxy for customer volume (data.md §9). AMB's
 * range is roughly $500K to $5M revenue (up to $10M): very few reviews reads
 * as a solo or one-truck operation, thousands as a regional player over the
 * range. Uncalibrated; refit with outcomes.
 */
export function reviewBandPoints(count: number): number {
  if (count < 5) return 3;
  if (count < 25) return 6;
  if (count < 75) return 10;
  if (count < 500) return 13;
  if (count < 1500) return 9;
  return 4;
}

function sizePoints(p: ProspectRow, places: PlacesDetails | null | undefined): { points: number; reasons: string[] } {
  const licences = splitList(p.license_numbers).length;
  const reasons: string[] = [];
  let points: number;
  const reviews = places?.userRatingCount;
  if (reviews !== undefined) {
    points = reviewBandPoints(reviews);
    // Describe the band, never the count: review counts are Maps content (ToS 3.2.3).
    const read =
      points >= 13 ? "an established business in the target size range"
        : points >= 10 ? "a business near the target size range"
          : reviews >= 500 ? "a business that may be larger than the target range"
            : "a small or low-visibility operation";
    reasons.push(`Customer review volume suggests ${read}`);
    // Several licences (classes) point to more than one tradesperson.
    if (licences >= 2) points = Math.min(WEIGHTS.size, points + 2);
  } else if (licences >= 3) {
    points = 10;
  } else if (licences === 2) {
    points = 9;
  } else {
    points = NEUTRAL.size;
    reasons.push("Size unknown, scored neutral");
  }
  if (licences >= 2) reasons.push(`Holds ${licences} licences`);
  return { points, reasons };
}

// ---------------------------------------------------------------- fatigue (10)

/** Days before expiry within which an unrenewed licence counts as a fatigue signal. */
export const LICENCE_EXPIRY_WINDOW_DAYS = 60;

/**
 * Florida annual reports are due between January 1 and May 1 (Fla. Stat.
 * 607.1622 for corporations, 605.0212 for LLCs). Elsewhere filing cycles
 * vary (some states are biennial), so a report counts as late only when the
 * last one is over 25 months old.
 */
function annualReportSignal(entity: EntityRow, today: string): { points: number; reason?: string } {
  const last = entity.last_annual_report_date;
  if (!last) return { points: 3, reason: "No annual report date on the state record" };
  const state = (entity.state || entity.principal_state).toUpperCase();
  if (state === "FL") {
    const year = Number(today.slice(0, 4));
    const dueYear = today.slice(5) > "05-01" ? year : year - 1;
    const formedYear = entity.formation_date ? Number(entity.formation_date.slice(0, 4)) : 0;
    const lastYear = Number(last.slice(0, 4));
    if (lastYear < dueYear && formedYear < dueYear) return { points: 4, reason: `No ${dueYear} annual report on file after the May 1 deadline` };
    if (last.slice(5) > "05-01") return { points: 2, reason: `Last annual report filed after the May 1 deadline (${last})` };
    return { points: 0 };
  }
  if (daysBetween(last, today) > 760) return { points: 4, reason: `Last annual report on file is from ${last}` };
  return { points: 0 };
}

function licenceExpirySignal(licenses: readonly LicenseRow[], today: string): { points: number; reason?: string } | undefined {
  // The business's furthest-out live expiry: a renewed licence anywhere means it renewed.
  const live = licenses.filter((l) => l.expiration_date && !isInactiveStatus(l.status));
  if (!live.length) return undefined;
  const latest = live.map((l) => l.expiration_date).sort().pop()!;
  if (latest < today) return { points: 3, reason: `Licence expired ${latest} with no renewal on record` };
  if (latest <= addDays(today, LICENCE_EXPIRY_WINDOW_DAYS)) return { points: 3, reason: `Licence expires ${latest} and has not been renewed early` };
  return { points: 0 };
}

function fatiguePoints(p: ProspectRow, ctx: ScoreContext): { points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  let unknown = 0;

  if (ctx.entity) {
    const s = annualReportSignal(ctx.entity, ctx.today);
    points += s.points;
    if (s.reason) reasons.push(s.reason);
  } else unknown++;

  const exp = licenceExpirySignal(ctx.licenses ?? [], ctx.today);
  if (exp) {
    points += exp.points;
    if (exp.reason) reasons.push(exp.reason);
  } else unknown++;

  // A website from either the records or Places counts; neither means none.
  if (!p.website.trim() && !ctx.places?.websiteUri) {
    points += 3;
    reasons.push("No website on record");
  }
  if (ctx.places?.businessStatus === "CLOSED_TEMPORARILY") {
    points += 2;
    reasons.push("Listed as temporarily closed");
  }

  points += unknown * NEUTRAL.fatigueUnknown;
  if (!reasons.length) reasons.push(unknown ? "No fatigue signals found in the records available" : "No fatigue signals found");
  return { points: Math.min(WEIGHTS.fatigue, points), reasons };
}

// ---------------------------------------------------------------- vertical prior (10)

function verticalPoints(p: ProspectRow, config: EngineConfig): { points: number; reasons: string[] } {
  const v = config.verticals[p.vertical];
  if (!v) return { points: 0, reasons: [] }; // a knock-out names it
  const prior = Math.round(Math.max(0, Math.min(WEIGHTS.vertical, v.prior)));
  return { points: prior, reasons: [`Vertical prior for ${v.noun}: ${prior} of 10`] };
}

// ---------------------------------------------------------------- the whole table

/** The suppression reason for a prospect (its email, the email's domain, or its id), or undefined. */
export function suppressionReason(p: ProspectRow, rows: readonly SuppressionRow[]): string | undefined {
  const email = normalizeEmail(p.email);
  const domain = email.split("@")[1] ?? "";
  const hit = rows.find(
    (r) =>
      (r.value_type === "prospect" && r.value === p.prospect_id) ||
      (r.value_type === "email" && email !== "" && normalizeEmail(r.value) === email) ||
      (r.value_type === "domain" && domain !== "" && domainMatches(domain, r.value.trim().toLowerCase())),
  );
  return hit?.reason;
}

// Place ids should be refreshed after 12 months (Places policies, data.md §3);
// an unmatched prospect is retried after 30 days. Both checks are free.
const PLACE_ID_REFRESH_DAYS = 365;
const PLACE_RETRY_DAYS = 30;

/** Scores every prospect in new, scored or hold, writes the score columns, and returns counts. Places errors never stop the run. */
export async function scoreAll(
  stores: Stores,
  config: EngineConfig,
  opts: { today: string; now: Date; places?: PlacesClient },
): Promise<{ scored: number; excluded: number; byTier: Record<string, number>; held: number; placesMatched: number; errors: { prospectId: string; error: string }[] }> {
  const { today, now, places } = opts;
  const stamp = isoStamp(now);
  const suppression = stores.suppression.rows();
  const entities = new Map(stores.entities.rows().map((e) => [`${e.source}:${e.source_record_id}`, e]));
  const licenses = new Map(stores.licenses.rows().map((l) => [`${l.source}:${l.source_record_id}`, l]));

  const byTier: Record<string, number> = { A: 0, B: 0, C: 0 };
  const errors: { prospectId: string; error: string }[] = [];
  const updated: ProspectRow[] = [];
  let scored = 0;
  let excluded = 0;
  let held = 0;
  let placesMatched = 0;
  // Purge first, so a scoring run is also the routine that keeps the cache inside 30 days.
  places?.purgeExpired();

  for (const p of stores.prospects.rows()) {
    if (!(RESCORE_STATUSES as readonly string[]).includes(p.status)) continue;
    const refs = splitList(p.sources);
    const entity = refs.map((r) => entities.get(r)).find((e) => e !== undefined);
    const lics = refs.map((r) => licenses.get(r)).filter((l): l is LicenseRow => l !== undefined);
    const ctx: ScoreContext = { config, today, suppressedReason: suppressionReason(p, suppression), ...(entity ? { entity } : {}), licenses: lics };
    const row: ProspectRow = { ...p };

    // Score once without Places: a knocked-out prospect never spends a call.
    let result = scoreProspect(p, ctx);
    if (!result.knockout && places) {
      try {
        const checkedAge = p.place_id_checked_at ? daysBetween(p.place_id_checked_at.slice(0, 10), today) : Infinity;
        const due = p.place_id ? checkedAge >= PLACE_ID_REFRESH_DAYS : checkedAge >= PLACE_RETRY_DAYS;
        if (due) {
          const match = await places.matchPlaceId(p);
          row.place_id_checked_at = stamp;
          // Only a confident match is stored; a weak one is not worth a details call.
          if (match && match.confidence >= MIN_MATCH_CONFIDENCE) {
            row.place_id = match.placeId;
            placesMatched++;
          }
        }
        if (row.place_id) {
          const details = await places.details(row.place_id);
          if (details) result = scoreProspect(p, { ...ctx, places: details });
        }
      } catch (err) {
        errors.push({ prospectId: p.prospect_id, error: (err as Error).message.slice(0, 500) });
      }
    }

    row.score = result.score;
    row.score_components = formatComponents(result.components);
    row.score_reasons = result.reasons.map((r) => r.replace(/;/g, ",")).join("; ");
    row.age_est_low = result.age.method ? result.age.low : undefined;
    row.age_est_high = result.age.method ? result.age.high : undefined;
    row.age_est_method = result.age.method;
    row.tenure_years = result.tenureYears;
    row.scored_at = stamp;
    row.updated_at = stamp;
    if (result.knockout) {
      row.status = "excluded";
      row.exclude_reason = result.knockout;
      row.tier = "";
      excluded++;
    } else {
      row.tier = result.tier;
      row.exclude_reason = "";
      byTier[result.tier] = (byTier[result.tier] ?? 0) + 1;
      scored++;
      // No sendable email, or a tier the config does not send: kept, but not queued.
      const sendable = (SCORE_SENDABLE_VERIFICATIONS as readonly string[]).includes(p.email_verification) && p.email.trim() !== "";
      const sendTier = config.targeting.send_tiers.includes(result.tier);
      row.status = sendable && sendTier ? "scored" : "hold";
      if (row.status === "hold") held++;
    }
    updated.push(row);
  }
  stores.prospects.upsert(updated);
  return { scored, excluded, byTier, held, placesMatched, errors };
}
