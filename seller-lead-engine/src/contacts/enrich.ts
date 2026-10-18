import type { EngineConfig } from "../config.ts";
import { EMAIL_SOURCES, normalizeEmail, type ContactRow, type ProspectRow } from "../domain/schema.ts";
import { matchKey } from "../sources/normalize.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";
import { Suppression } from "../compliance/suppression.ts";
import { discoverEmails } from "./discover.ts";
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
  opts: { now: Date; discover: boolean; verify: boolean; fetchImpl?: typeof fetch; resolveMx?: (d: string) => Promise<string[]>; verifierApiKey?: string },
): Promise<{ found: number; verified: number; byStatus: Record<string, number> }> {
  const stamp = isoStamp(opts.now);
  const suppression = new Suppression(stores.suppression);
  const excluded = new Set(config.targeting.exclude_domains.map((d) => d.trim().toLowerCase().replace(/^.*@/, "")));
  const contactsByKey = new Map<string, ContactRow[]>();
  for (const c of stores.contacts.rows()) {
    const k = matchKey(c.business_name, c.zip);
    contactsByKey.set(k, [...(contactsByKey.get(k) ?? []), c]);
  }

  const result = { found: 0, verified: 0, byStatus: {} as Record<string, number> };
  const updates: ProspectRow[] = [];

  for (const p of stores.prospects.rows()) {
    if (!ENRICH_STATUSES.has(p.status)) continue;
    // A prospect suppressed by id gets no new address at the same business.
    if (suppression.check("", p.prospect_id)) continue;
    const owner = { first: p.owner_first_name, last: p.owner_last_name };
    const candidates: Candidate[] = [];
    const addCandidate = (raw: string, source: EmailSource | "", url: string, existing = false) => {
      const email = normalizeEmail(raw);
      if (!email.includes("@") || candidates.some((c) => c.email === email)) return;
      const domain = email.slice(email.lastIndexOf("@") + 1);
      if (excluded.has(domain) || excluded.has(email)) return;
      if (suppression.check(email, undefined)) return;
      candidates.push({ email, source, url, rank: emailRank(email, owner), existing });
    };

    if (p.email) addCandidate(p.email, p.email_source, p.email_source_url, true);
    const keys = new Set([matchKey(p.business_name, p.zip), ...(p.dba_name ? [matchKey(p.dba_name, p.zip)] : [])]);
    for (const k of keys) for (const c of contactsByKey.get(k) ?? []) addCandidate(c.email, c.email_source, c.email_source_url);
    if (opts.discover && p.website) {
      try {
        for (const d of await discoverEmails(p.website, { ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) })) addCandidate(d.email, "website", d.url);
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
          if (isSendableVerification(v.status)) return;
        }
      };
      await tryList(persons);
      let pick = tried.find((t) => isSendableVerification(t.v.status));
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
      if (JSON.stringify(next) !== JSON.stringify(p)) updates.push(next);
    }
    const status = next.email ? next.email_verification : "no_email";
    result.byStatus[status] = (result.byStatus[status] ?? 0) + 1;
  }

  stores.prospects.upsert(updates);
  return result;
}

function verifyOpts(opts: { fetchImpl?: typeof fetch; resolveMx?: (d: string) => Promise<string[]>; verifierApiKey?: string }) {
  return {
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.resolveMx ? { resolveMx: opts.resolveMx } : {}),
    ...(opts.verifierApiKey ? { verifierApiKey: opts.verifierApiKey } : {}),
  };
}
