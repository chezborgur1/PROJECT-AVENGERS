import { parse } from "csv-parse/sync";
import type { EngineConfig } from "../config.ts";
import { isSendableVerification } from "../contacts/verify.ts";
import { normalizeEmail, type ProspectRow } from "../domain/schema.ts";
import { mapHeaders, normalizeState } from "../sources/csvImport.ts";
import { normalizePhone, titleCaseBusinessName } from "../sources/normalize.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";
import { leadRef, refLeadId, sourceCode, upsertBuyers, type IncomingBuyer } from "./core.ts";
import { BUYER_KINDS, REGISTERED_STATUSES, type BuyerKind, type BuyerLeadRow } from "./schema.ts";

// The buyer sources that come from AMB's own records and AMBrain:
//
// - Lists AMB already has (past bidders and inquirers, buy-side clients,
//   a conference's attendee list, a listing site's own lead export): any
//   CSV with header names close to the usual ones.
// - Strategic add-on buyers: the larger businesses in AMB's industries that
//   the seller side already found and sized. Only those the seller sequence
//   is done with (it finished with no reply, or they were never in it), so
//   one owner never hears from both sides at once; the seller planner in
//   turn skips a business once it is invited as a buyer.
// - AMBrain's registrations export, matched back to each lead by the
//   tracking code in their link, which is how every source is credited.

/** Header names each field of a buyer list may arrive under, first match wins (mapHeaders). */
export const BUYER_LIST_COLUMNS: Record<string, string[]> = {
  email: ["email", "e-mail", "email address", "emailaddress", "buyer email", "contact email", "work email"],
  name: ["name", "full name", "contact", "contact name", "buyer", "buyer name", "attendee", "attendee name"],
  first_name: ["first name", "first", "firstname", "given name"],
  last_name: ["last name", "last", "lastname", "surname", "family name"],
  title: ["title", "job title", "position", "role"],
  company: ["company", "firm", "organization", "organisation", "company name", "fund", "employer"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "work phone"],
  website: ["website", "web site", "url", "company website", "domain"],
  city: ["city", "town"],
  state: ["state", "province", "region state", "st"],
  type: ["type", "buyer type", "category", "investor type"],
  listing: ["listing", "listing id", "listing number", "listing ref", "ad id", "ad number", "business", "listing title"],
  interest: ["industries", "industry", "sectors", "sector", "interests", "criteria", "looking for", "message", "inquiry", "comments"],
  price: ["price range", "budget", "max price", "max deal size", "investment range", "liquid capital", "capital"],
  date: ["date", "inquiry date", "created", "created at", "date added", "last activity", "last contact"],
  notes: ["notes", "note", "deal history", "past deals", "history"],
};

/** What a buyer list import found. */
export interface ListImport {
  incoming: IncomingBuyer[];
  skipped: { line: number; reason: string }[];
  /** Headers nothing claimed, so a person can see what was left out. */
  unknown: string[];
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Read a buyer list (CSV text). Every row becomes a buyer of `kind` from
 * channel `source`; a row needs an email, or a name or company with a phone
 * (a person can call or look the address up). Rows are never emailed here.
 */
export function parseBuyerList(text: string, opts: { kind: BuyerKind; source: string; label: string }): ListImport {
  const records = parse(text, { bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true }) as string[][];
  const [header, ...body] = records;
  if (!header) return { incoming: [], skipped: [], unknown: [] };
  const { index, unknown } = mapHeaders(header, BUYER_LIST_COLUMNS);
  if (index.email === undefined && index.name === undefined && index.first_name === undefined && index.company === undefined) {
    throw new Error(`${opts.label}: no email, name or company column (found: ${header.join(", ") || "no header row"}).`);
  }
  const source = sourceCode(opts.source);
  if (!source) throw new Error("A buyer list needs a source name (the channel it is counted under), for example past-bidders.");
  const incoming: IncomingBuyer[] = [];
  const skipped: ListImport["skipped"] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (f: string) => (index[f] !== undefined ? (cells[index[f]!] ?? "").trim() : "");
    const rawEmail = get("email").replace(/^mailto:/i, "");
    const email = EMAIL_RE.test(rawEmail) ? normalizeEmail(rawEmail) : "";
    const name = get("name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ");
    const company = get("company");
    const phone = normalizePhone(get("phone"));
    if (rawEmail && !email) return skipped.push({ line, reason: `not an email address: ${rawEmail}` });
    if (!email && !((name || company) && phone)) return skipped.push({ line, reason: "no email, and no name or company with a phone" });
    const listing = get("listing");
    const interest = [listing ? `listing ${listing.replace(/^#/, "")}` : "", get("type"), get("interest"), get("price") ? `price ${get("price")}` : ""].filter(Boolean).join("; ");
    const date = get("date");
    incoming.push({
      kind: opts.kind,
      name,
      title: get("title"),
      company,
      email,
      email_source: "import",
      phone,
      website: get("website"),
      city: get("city"),
      state: normalizeState(get("state")).slice(0, 2),
      source,
      source_detail: `${opts.label}, row ${line}${date ? `, ${dateOf(date)}` : ""}`,
      interest: interest.slice(0, 300),
      notes: get("notes").slice(0, 500),
    });
  });
  return { incoming, skipped, unknown };
}

/** "10/20/2026" or "2026-10-20T..." to YYYY-MM-DD when it reads as a date, else the text as given. */
function dateOf(raw: string): string {
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (iso) return iso;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw);
  if (us) {
    const year = us[3]!.length === 2 ? `20${us[3]}` : us[3]!;
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }
  return raw.slice(0, 20);
}

/** Import a buyer list into buyers/leads.csv. */
export function importBuyerList(stores: Stores, text: string, opts: { kind: BuyerKind; source: string; label: string; now: Date }) {
  const parsed = parseBuyerList(text, opts);
  return { ...upsertBuyers(stores, parsed.incoming, opts.now), skipped: parsed.skipped, unknown: parsed.unknown };
}

/** The kinds a list may be imported as (a person picks one per file). */
export const LIST_KINDS: readonly BuyerKind[] = BUYER_KINDS;

// ---------------------------------------------------------------- strategic acquirers

/** Seller statuses the seller side is done with, or never started on: the business may hear from the buyer side. */
const STRATEGIC_FROM: ReadonlySet<ProspectRow["status"]> = new Set(["completed", "scored", "hold", "new"]);

/** True while the seller side has the business: in its sequence, replied, a lead, or never to be contacted. */
export function inSellerPipeline(p: ProspectRow, leadIds: ReadonlySet<string>, config: EngineConfig): boolean {
  if (leadIds.has(p.prospect_id)) return true;
  if (!STRATEGIC_FROM.has(p.status)) return true;
  // A scored business in a sending tier is the seller side's next email.
  return p.status === "scored" && p.tier !== "" && config.targeting.send_tiers.includes(p.tier);
}

/**
 * Businesses in AMB's industries with at least `strategic_min_staff` staff
 * that the seller side is not working: add-on buyers for the deals AMB
 * lists. Their seller-side address carries over only when it was verified.
 */
export function strategicBuyers(stores: Stores, config: EngineConfig): { incoming: IncomingBuyer[]; skipped: number } {
  const leadIds = new Set(stores.leads.rows().map((l) => l.prospect_id));
  const min = config.buyers.strategic_min_staff;
  const incoming: IncomingBuyer[] = [];
  let skipped = 0;
  for (const p of stores.prospects.rows()) {
    if ((p.staff_count ?? 0) < min || !p.vertical) continue;
    if (inSellerPipeline(p, leadIds, config)) {
      skipped++;
      continue;
    }
    const vertical = config.verticals[p.vertical];
    const email = p.email && isSendableVerification(p.email_verification) ? p.email : "";
    incoming.push({
      kind: "strategic",
      name: p.owner_name,
      title: p.owner_title,
      company: titleCaseBusinessName(p.business_name),
      email,
      email_source: email ? "seller_data" : "",
      phone: p.phone,
      website: p.website,
      city: p.city,
      state: p.state,
      source: "strategic",
      source_detail: `${vertical?.noun ?? p.vertical} with ${p.staff_count} staff (${p.staff_source || "estimate"}), from the seller records`,
      interest: `${vertical?.noun ?? p.vertical}; ${p.staff_count} staff`,
      prospect_id: p.prospect_id,
    });
  }
  return { incoming, skipped };
}

/** The verification a strategic lead inherits from its seller record, so the invite gate sees the same verdict. */
export function carryVerification(stores: Stores): number {
  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  const changed: BuyerLeadRow[] = [];
  for (const l of stores.buyerLeads.rows()) {
    const p = l.prospect_id ? prospects.get(l.prospect_id) : undefined;
    if (!p || l.email_verification !== "unverified" || normalizeEmail(p.email) !== normalizeEmail(l.email)) continue;
    if (p.email_verification === "unverified") continue;
    changed.push({ ...l, email_verification: p.email_verification });
  }
  if (changed.length) stores.buyerLeads.upsert(changed);
  return changed.length;
}

// ---------------------------------------------------------------- manual add

/** Add one buyer by hand (a call, a referral, a business card). */
export function addBuyer(stores: Stores, b: Omit<IncomingBuyer, "source_detail"> & { source_detail?: string }, now: Date) {
  const email = b.email ? normalizeEmail(b.email) : "";
  if (email && !EMAIL_RE.test(email)) throw new Error(`Not an email address: ${b.email}`);
  if (!email && !b.name && !b.company) throw new Error("A buyer needs an email, a name or a company.");
  const source = sourceCode(b.source || "manual");
  return upsertBuyers(stores, [{ ...b, email, email_source: email ? "manual" : "", source, source_detail: b.source_detail || `Added by hand on ${isoStamp(now).slice(0, 10)}` }], now);
}

// ---------------------------------------------------------------- AMBrain registrations

/** Header names in AMBrain's registrations export. AMBrain must include the ref and src values each account arrived with. */
export const REGISTRATION_COLUMNS: Record<string, string[]> = {
  email: ["email", "e-mail", "email address", "user email"],
  name: ["name", "full name", "buyer name"],
  first_name: ["first name", "firstname"],
  last_name: ["last name", "lastname"],
  company: ["company", "firm", "organization"],
  phone: ["phone", "phone number", "mobile"],
  ref: ["ref", "referral code", "tracking code", "ref code"],
  src: ["src", "source", "channel", "utm source", "utm_source"],
  status: ["status", "tier", "stage", "level"],
  registered_at: ["registered at", "registered", "signed up", "signup date", "created at", "created", "nda signed at", "nda signed", "date"],
};

const TIER_ORDER = ["registered", "profiled", "verified"] as const;
const tierOf = (raw: string): (typeof TIER_ORDER)[number] => (/verif|proof|pof|pre-?qual|approved/i.test(raw) ? "verified" : /profil|complete/i.test(raw) ? "profiled" : "registered");

/** What a registrations import did. */
export interface RegistrationImport {
  matched: number;
  added: number;
  promoted: number;
  unchanged: number;
  skipped: { line: number; reason: string }[];
  /** Registrations by channel, for the funnel. */
  bySource: Record<string, number>;
}

/**
 * Read AMBrain's registrations export and mark each lead registered,
 * profiled or verified. A registration is matched by its tracking code,
 * then by email; one that matches no lead (someone who found AMBrain on
 * their own or through a channel link) becomes a lead of its own, credited
 * to its src. Status only moves up.
 */
export function importRegistrations(stores: Stores, text: string, now: Date): RegistrationImport {
  const records = parse(text, { bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true }) as string[][];
  const [header, ...body] = records;
  const out: RegistrationImport = { matched: 0, added: 0, promoted: 0, unchanged: 0, skipped: [], bySource: {} };
  if (!header) return out;
  const { index } = mapHeaders(header, REGISTRATION_COLUMNS);
  if (index.email === undefined && index.ref === undefined) throw new Error(`The registrations file has no email or ref column (found: ${header.join(", ")}).`);
  const stamp = isoStamp(now);
  const leads = new Map(stores.buyerLeads.rows().map((l) => [l.lead_id, l]));
  const byEmail = new Map([...leads.values()].filter((l) => l.email).map((l) => [normalizeEmail(l.email), l.lead_id]));
  const fresh: IncomingBuyer[] = [];
  const freshTier = new Map<string, { tier: (typeof TIER_ORDER)[number]; at: string }>();
  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (f: string) => (index[f] !== undefined ? (cells[index[f]!] ?? "").trim() : "");
    const email = EMAIL_RE.test(get("email")) ? normalizeEmail(get("email")) : "";
    const ref = get("ref");
    const id = (ref ? refLeadId(ref) : undefined) ?? (email ? byEmail.get(email) : undefined);
    const tier = tierOf(get("status"));
    const at = dateOf(get("registered_at")) || stamp.slice(0, 10);
    const src = sourceCode(get("src")) || "organic";
    if (!id) {
      if (!email) return out.skipped.push({ line, reason: ref ? `tracking code ${ref} matches no lead, and the row has no email` : "no email and no tracking code" });
      fresh.push({ kind: "other", name: get("name") || [get("first_name"), get("last_name")].filter(Boolean).join(" "), company: get("company"), email, email_source: "ambrain", phone: normalizePhone(get("phone")), source: src, source_detail: `Registered on AMBrain on ${at}${ref ? ` with code ${ref}` : ""}` });
      freshTier.set(email, { tier, at });
      return;
    }
    const lead = leads.get(id);
    if (!lead) return out.skipped.push({ line, reason: `tracking code ${ref} names ${id}, which is not in buyers/leads.csv` });
    out.matched++;
    out.bySource[lead.source] = (out.bySource[lead.source] ?? 0) + 1;
    const current = TIER_ORDER.indexOf(lead.status as (typeof TIER_ORDER)[number]);
    if (current >= TIER_ORDER.indexOf(tier)) {
      out.unchanged++;
      return;
    }
    // An opted-out buyer who registers anyway is AMBrain's account holder now; the opt-out still stops email (suppression is separate).
    leads.set(id, { ...lead, status: tier, registered_at: lead.registered_at || at, updated_at: stamp });
    out.promoted++;
  });
  stores.buyerLeads.upsert([...leads.values()].filter((l) => l.updated_at === stamp));
  if (fresh.length) {
    const r = upsertBuyers(stores, fresh, now);
    out.added = r.added;
    const rows = stores.buyerLeads.rows();
    const promoted: BuyerLeadRow[] = [];
    for (const l of rows) {
      const t = freshTier.get(normalizeEmail(l.email));
      if (!t || REGISTERED_STATUSES.has(l.status)) continue;
      promoted.push({ ...l, status: t.tier, registered_at: t.at, updated_at: stamp });
      out.bySource[l.source] = (out.bySource[l.source] ?? 0) + 1;
    }
    stores.buyerLeads.upsert(promoted);
  }
  return out;
}

/** A lead's personal link code, made again for rows written before codes existed. */
export function ensureRefs(stores: Stores): number {
  const missing = stores.buyerLeads.rows().filter((l) => !l.ref);
  if (missing.length) stores.buyerLeads.upsert(missing.map((l) => ({ ...l, ref: leadRef(l.lead_id) })));
  return missing.length;
}
