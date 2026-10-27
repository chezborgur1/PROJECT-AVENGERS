import type { EngineConfig } from "../config.ts";
import { excludedTarget } from "../compliance/gate.ts";
import { EMAIL_SOURCES, normalizeEmail, type ContactRow, type ProspectRow } from "../domain/schema.ts";
import { matchKey } from "../sources/normalize.ts";
import type { Stores } from "../store/index.ts";
import { isoDate, isoStamp } from "../util/dates.ts";
import { Suppression } from "../compliance/suppression.ts";
import { discoverSite } from "./discover.ts";
import { betterStaff, staffFields, type StaffEstimate } from "./staff.ts";
import { emailLocal, isRoleBased, isSendableVerification, verifyEmail, type Verification } from "./verify.ts";

// Picks and verifies one email per prospect, before scoring decides who
// enters the sequence. For prospects in new, scored or hold:
//
// 1. Candidates: the address already on the prospect, contact rows for the
//    business (same name or DBA and ZIP), and, with `discover`, addresses
//    the business's own website shows (src/contacts/discover.ts).
// 2. Rank: an address that matches the owner's name, then any other person,
//    then a role-based inbox (info@, office@). Suppressed addresses are never
//    candidates.
// 3. With `verify`, candidates are verified in rank order until one is
//    sendable, at most MAX_VERIFICATIONS_PER_PROSPECT calls (verifier free
//    tiers are about 100 a month: docs/research/data.md section 5). A
//    role-based inbox is tried only when the business has no person address
//    that could still be good, so "role_based" means it is the business's
//    only address (DESIGN.md, contacts/verify.ts). A recently verified
//    address is not re-verified; one older than REVERIFY_AFTER_DAYS is
//    (deliverability.md: re-verify every 60 to 90 days).
// 4. A verified, sendable address is never replaced by an unverified one.
//
// Provenance (compliance.md section 9 rule 8): email_source and
// email_source_url record where each address came from.
//
// Without a verifier API key every address ends as "unknown", which is not
// sendable. That default is the safe one and stays. A person who has checked
// an address another way (the owner gave it on the phone, it is printed on
// the business's own invoice) records that with `setManualVerification`,
// which stamps email_verified_at and says who in the notes. enrichContacts
// then reuses that verdict for REVERIFY_AFTER_DAYS like any other.

/** The most verifier calls spent on one prospect in one run. */
export const MAX_VERIFICATIONS_PER_PROSPECT = 3;
/** A verification older than this is repeated. */
export const REVERIFY_AFTER_DAYS = 90;

const ENRICH_STATUSES = new Set(["new", "scored", "hold"]);
/** Verdicts that rule an address out as a real mailbox (so a role inbox may stand in). */
const DEAD = new Set(["invalid", "disposable"]);
/** The detail on a reused verdict: the address was verified within REVERIFY_AFTER_DAYS. */
const RECENT = "verified recently";

type EmailSource = (typeof EMAIL_SOURCES)[number];

interface Candidate {
  email: string;
  source: EmailSource | "";
  url: string;
  /** 0 = owner-name match, 1 = another person, 2 = role-based inbox. */
  rank: number;
  existing: boolean;
}

/** 0 when the local part matches the owner's name, 1 for another person, 2 for a role inbox. */
export function emailRank(email: string, owner: { first: string; last: string }): number {
  if (isRoleBased(email)) return 2;
  const local = emailLocal(email).replace(/\+.*$/, "");
  const letters = local.replace(/[^a-z]/g, "");
  const first = owner.first.toLowerCase().replace(/[^a-z]/g, "");
  const last = owner.last.toLowerCase().replace(/[^a-z]/g, "");
  if (last.length >= 3 && letters.includes(last)) return 0;
  if (first.length >= 3 && local.split(/[._-]/).includes(first)) return 0;
  if (first && last && (letters === `${first[0]}${last}` || letters === `${first}${last[0]}`)) return 0;
  return 1;
}

const DAY_MS = 86_400_000;
function verifiedRecently(p: ProspectRow, now: Date): boolean {
  if (!p.email_verified_at || p.email_verification === "unverified") return false;
  const at = Date.parse(p.email_verified_at.length === 10 ? `${p.email_verified_at}T00:00:00Z` : p.email_verified_at);
  return Number.isFinite(at) && now.getTime() - at < REVERIFY_AFTER_DAYS * DAY_MS;
}

/** Find, choose and verify each open prospect's email; writes prospects.csv once. */
export async function enrichContacts(
  stores: Stores,
  config: EngineConfig,
  opts: {
    now: Date;
    discover: boolean;
    verify: boolean;
    fetchImpl?: typeof fetch;
    resolveMx?: (d: string) => Promise<string[]>;
    verifierApiKey?: string;
    /** Only prospects after this id (a run that stopped early continues here). */
    startAfter?: string;
    /** Asked before each prospect after the first; true stops the run, keeping what is done (a time budget). */
    shouldStop?: () => boolean;
  },
): Promise<{ found: number; verified: number; byStatus: Record<string, number>; staffed?: number; stoppedAfter?: string; remaining?: number }> {
  const stamp = isoStamp(opts.now);
  const suppression = new Suppression(stores.suppression);
  const contactsByKey = new Map<string, ContactRow[]>();
  for (const c of stores.contacts.rows()) {
    const k = matchKey(c.business_name, c.zip);
    contactsByKey.set(k, [...(contactsByKey.get(k) ?? []), c]);
  }

  const result: { found: number; verified: number; byStatus: Record<string, number>; staffed?: number; stoppedAfter?: string; remaining?: number } = { found: 0, verified: 0, byStatus: {} };
  const updates: ProspectRow[] = [];
  // In id order, so a run that stops early can continue after the last id it finished.
  const after = opts.startAfter ? idNumber(opts.startAfter) : -1;
  const todo = stores.prospects
    .rows()
    .filter((p) => ENRICH_STATUSES.has(p.status) && idNumber(p.prospect_id) > after)
    .sort((a, b) => idNumber(a.prospect_id) - idNumber(b.prospect_id));
  let done = 0;

  for (const p of todo) {
    if (done > 0 && opts.shouldStop?.()) {
      result.stoppedAfter = todo[done - 1]!.prospect_id;
      result.remaining = todo.length - done;
      break;
    }
    done++;
    // A prospect suppressed by id gets no new address at the same business.
    if (suppression.check("", p.prospect_id)) continue;
    const owner = { first: p.owner_first_name, last: p.owner_last_name };
    const candidates: Candidate[] = [];
    // The headcount read on the same visit to the business's site (staff.ts).
    let staff: StaffEstimate | undefined;
    const addCandidate = (raw: string, source: EmailSource | "", url: string, existing = false) => {
      const email = normalizeEmail(raw);
      if (!email.includes("@") || candidates.some((c) => c.email === email)) return;
      const domain = email.slice(email.lastIndexOf("@") + 1);
      // One rule with the gate and scoring: an address entry excludes that address, a domain entry the domain and its subdomains.
      if (excludedTarget(email, config.targeting.exclude_domains)) return;
      if (suppression.check(email, undefined)) return;
      candidates.push({ email, source, url, rank: emailRank(email, owner), existing });
    };

    if (p.email) addCandidate(p.email, p.email_source, p.email_source_url, true);
    const keys = new Set([matchKey(p.business_name, p.zip), ...(p.dba_name ? [matchKey(p.dba_name, p.zip)] : [])]);
    for (const k of keys) for (const c of contactsByKey.get(k) ?? []) addCandidate(c.email, c.email_source, c.email_source_url);
    if (opts.discover && p.website) {
      try {
        const site = await discoverSite(p.website, { ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) });
        for (const d of site.emails) addCandidate(d.email, "website", d.url);
        staff = site.staff;
      } catch {
        // A site that cannot be read adds no candidates; the rest of the run goes on.
      }
    }
    // Stable sort: rank, then the address already on record first.
    candidates.sort((a, b) => a.rank - b.rank || Number(b.existing) - Number(a.existing));

    const current = candidates.find((c) => c.existing);
    const currentSendable = !!current && isSendableVerification(p.email_verification);
    let chosen: { c: Candidate; v?: Verification } | undefined;

    if (opts.verify && candidates.length) {
      const persons = candidates.filter((c) => c.rank < 2);
      const roles = candidates.filter((c) => c.rank === 2);
      const tried: { c: Candidate; v: Verification }[] = [];
      let calls = 0;
      const tryList = async (list: Candidate[]) => {
        for (const c of list) {
          let v: Verification;
          if (c.existing && verifiedRecently(p, opts.now)) {
            // The address on record was verified recently: reuse the verdict instead of spending a call.
            v = { status: p.email_verification, detail: RECENT };
          } else {
            if (calls >= MAX_VERIFICATIONS_PER_PROSPECT) return;
            calls++;
            result.verified++;
            v = await verifyEmail(c.email, verifyOpts(opts));
          }
          tried.push({ c, v });
          // A verifier can call a person-ranked address role-based (jobs@, quotes@): keep trying the other
          // person addresses before settling for it (REVIEW_R1.md item 30).
          if (isSendableVerification(v.status) && v.status !== "role_based") return;
        }
      };
      await tryList(persons);
      let pick = tried.find((t) => isSendableVerification(t.v.status) && t.v.status !== "role_based");
      // A role-based verdict on a person-ranked address counts only when every other person address is dead.
      if (!pick && persons.length === tried.length && tried.every((t) => t.v.status === "role_based" || DEAD.has(t.v.status))) {
        pick = tried.find((t) => t.v.status === "role_based");
      }
      // A role inbox counts only when the business has no person address that could still be good,
      // so a "role_based" verdict (verify.ts) means it is the business's only address.
      if (!pick && persons.length === tried.length && tried.every((t) => DEAD.has(t.v.status))) {
        await tryList(roles);
        pick = tried.find((t) => isSendableVerification(t.v.status));
      }
      if (pick) {
        chosen = pick;
      } else if (currentSendable && !tried.some((t) => t.c.existing)) {
        chosen = undefined; // keep the verified address on record (it was not re-checked this run)
      } else {
        // Nothing sendable: record the best-ranked verdict so the prospect holds with an honest status.
        const best = tried[0];
        if (best) chosen = best;
      }
    } else if (candidates.length && !currentSendable) {
      // No verification this run: take the best candidate, unverified, unless the record already holds a verified one.
      const best = candidates[0]!;
      chosen = best.existing ? undefined : { c: best };
    }

    let next = p;
    if (chosen) {
      const changed = chosen.c.email !== normalizeEmail(p.email);
      next = {
        ...p,
        email: chosen.c.email,
        email_source: changed ? chosen.c.source : p.email_source || chosen.c.source,
        email_source_url: changed ? chosen.c.url : p.email_source_url || chosen.c.url,
        email_verification: chosen.v ? chosen.v.status : changed ? "unverified" : p.email_verification,
        email_verified_at: chosen.v ? (chosen.v.detail === RECENT ? p.email_verified_at : stamp) : changed ? "" : p.email_verified_at,
        updated_at: stamp,
      };
      if (changed) result.found++;
    }
    if (staff && betterStaff(staff, p)) {
      const fields = staffFields(staff);
      if (fields.staff_count !== p.staff_count || fields.staff_basis !== p.staff_basis) {
        next = { ...next, ...fields, updated_at: stamp };
        result.staffed = (result.staffed ?? 0) + 1;
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(p)) updates.push(next);
    const status = next.email ? next.email_verification : "no_email";
    result.byStatus[status] = (result.byStatus[status] ?? 0) + 1;
  }

  stores.prospects.upsert(updates);
  return result;
}

/** The number in an id such as P-00042. */
function idNumber(id: string): number {
  return Number(id.replace(/\D/g, "")) || 0;
}

function verifyOpts(opts: { fetchImpl?: typeof fetch; resolveMx?: (d: string) => Promise<string[]>; verifierApiKey?: string }) {
  return {
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.resolveMx ? { resolveMx: opts.resolveMx } : {}),
    ...(opts.verifierApiKey ? { verifierApiKey: opts.verifierApiKey } : {}),
  };
}

/** Statuses a person may record by hand after checking an address themselves. */
export const MANUAL_VERIFICATION_STATUSES = ["valid", "invalid"] as const;

/**
 * Record a person's own check of a prospect's email: sets email_verification
 * to valid or invalid, stamps email_verified_at, and appends "verified
 * manually by <by>" to notes. Suppression still applies at send time: a
 * valid mark never makes a suppressed address sendable. Returns the updated row.
 */
export function setManualVerification(
  stores: Stores,
  prospectId: string,
  status: (typeof MANUAL_VERIFICATION_STATUSES)[number],
  by: string,
  now: Date,
): ProspectRow {
  if (!(MANUAL_VERIFICATION_STATUSES as readonly string[]).includes(status)) throw new Error(`Manual verification must be ${MANUAL_VERIFICATION_STATUSES.join(" or ")}, not "${status}"`);
  const who = by.trim().replace(/\s+/g, " ");
  // The note is the audit trail: a verdict nobody can attribute is not a verification.
  if (!who) throw new Error("Say who checked the address (by)");
  const p = stores.prospects.rows().find((x) => x.prospect_id === prospectId.trim());
  if (!p) throw new Error(`Prospect ${prospectId} not found in prospects.csv`);
  if (!p.email.trim()) throw new Error(`Prospect ${p.prospect_id} has no email address to verify`);
  const stamp = isoStamp(now);
  const note = `verified manually by ${who} (${status}, ${normalizeEmail(p.email)}, ${isoDate(now)})`;
  const updated: ProspectRow = {
    ...p,
    email_verification: status,
    email_verified_at: stamp,
    notes: p.notes.trim() ? `${p.notes.trim()}; ${note}` : note,
    updated_at: stamp,
  };
  stores.prospects.upsert([updated]);
  return updated;
}
