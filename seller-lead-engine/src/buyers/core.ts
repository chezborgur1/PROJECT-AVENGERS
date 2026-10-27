import crypto from "node:crypto";
import type { EngineConfig, Mailbox } from "../config.ts";
import { isSendableVerification } from "../contacts/verify.ts";
import { canonicalEmail, Suppression } from "../compliance/suppression.ts";
import { normalizeEmail } from "../domain/schema.ts";
import { splitPersonName } from "../sources/normalize.ts";
import { idAllocator } from "../store/csvTable.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";
import { BUYER_KINDS, BuyerLeadRowSchema, REGISTERED_STATUSES, WARM_KINDS, type BuyerKind, type BuyerLeadRow } from "./schema.ts";

// The rules every buyer source shares: one record per buyer however many
// sources find them, the personal tracking code in each buyer's AMBrain
// link, the score that orders invitations, and which mailbox a buyer hears
// from. Sources (sources.ts and the importers) produce `IncomingBuyer`s;
// `upsertBuyers` merges them.

/** What a source knows about one possible buyer. */
export interface IncomingBuyer {
  kind: BuyerKind;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  email_source?: BuyerLeadRow["email_source"];
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  source: string;
  source_detail: string;
  interest?: string;
  fund_size?: number;
  prospect_id?: string;
  thread_id?: string;
  /** When the buyer wrote to AMB (an inquiry's date). */
  inbound_at?: string;
  /** "review" when a heuristic found them and a person should look first. */
  status?: BuyerLeadRow["status"];
  notes?: string;
}

/** A channel code from free text: "First Citizens SBA" -> "first-citizens-sba". */
export function sourceCode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** The buyer's personal tracking code: their id and a short check, so a typo or a guess does not credit the wrong source. */
export function leadRef(leadId: string): string {
  const check = crypto.createHash("sha256").update(`amb-buyer-ref:${leadId}`).digest("hex").slice(0, 6);
  return `${leadId.toLowerCase()}-${check}`;
}

/** The lead id in a tracking code, when the code is genuine. */
export function refLeadId(ref: string): string | undefined {
  const m = /^(b-\d{5,})-([0-9a-f]{6})$/i.exec(ref.trim());
  if (!m) return undefined;
  const id = m[1]!.toUpperCase();
  return leadRef(id) === `${id.toLowerCase()}-${m[2]!.toLowerCase()}` ? id : undefined;
}

const withParams = (url: string, params: Record<string, string>) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
};

/** The buyer's own AMBrain registration link. Throws while signup_url is blank: nothing invites anyone to nowhere. */
export function signupLink(config: EngineConfig, lead: Pick<BuyerLeadRow, "ref" | "source">): string {
  const url = config.buyers.signup_url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("buyers.signup_url is blank: set AMBrain's registration address in the settings first.");
  return withParams(url, { [config.buyers.ref_param]: lead.ref, [config.buyers.source_param]: lead.source });
}

/** A channel's link (a partner, a listing site, a conference), so every registration through it is counted for it. */
export function channelLink(config: EngineConfig, source: string, listingRef = ""): string {
  const listing = config.buyers.listing_url.trim();
  const base = listingRef && /^https?:\/\//i.test(listing) ? listing.replace("{ref}", encodeURIComponent(listingRef)) : config.buyers.signup_url.trim();
  if (!/^https?:\/\//i.test(base)) throw new Error("buyers.signup_url is blank: set AMBrain's registration address in the settings first.");
  return withParams(base, { [config.buyers.source_param]: source });
}

/** The mailbox warm buyers hear from: AMB's own, or the first sending mailbox when none is set. */
export function warmMailbox(config: EngineConfig): Mailbox | undefined {
  const b = config.buyers.mailbox;
  if (b.email.trim()) return { email: b.email.trim(), sender_name: b.sender_name.trim(), sender_title: b.sender_title.trim(), warmup_started: b.warmup_started, paused: b.paused };
  return config.mailboxes[0];
}

/** The states buyers are wanted from first. */
export function priorityStates(config: EngineConfig): string[] {
  const set = config.buyers.priority_states.length ? config.buyers.priority_states : Object.values(config.metros).map((m) => m.state);
  return [...new Set(set.map((s) => s.trim().toUpperCase()).filter(Boolean))];
}

const KIND_POINTS: Record<BuyerKind, number> = { inquirer: 40, past_bidder: 40, client: 40, correspondent: 30, referral: 30, strategic: 25, fund: 25, adviser: 20, conference: 20, other: 15 };

/** 0 to 100: how worth inviting first. Warm kinds lead; then nearness, capacity and whether they can be reached. */
export function scoreBuyer(l: BuyerLeadRow, config: EngineConfig, today: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = KIND_POINTS[l.kind];
  reasons.push(WARM_KINDS.has(l.kind) ? `Already dealt with AMB (${l.kind.replace(/_/g, " ")})` : `Sourced as ${l.kind.replace(/_/g, " ")}`);
  const states = priorityStates(config);
  if (l.state && states.includes(l.state.toUpperCase())) {
    score += 15;
    reasons.push(`Based in ${l.state.toUpperCase()}`);
  } else if (l.state) score += 5;
  if (l.fund_size !== undefined) {
    if (l.fund_size >= 5_000_000 && l.fund_size <= 250_000_000) {
      score += 15;
      reasons.push("Fund size fits $1M to $10M deals");
    } else if (l.fund_size <= config.buyers.fund_max_offering) score += 8;
  }
  if (l.kind === "strategic" && /\b(\d+)\b staff/.test(l.interest)) {
    const staff = Number(/\b(\d+)\b staff/.exec(l.interest)![1]);
    score += staff >= 50 ? 15 : 10;
    reasons.push(`${staff} staff: large enough to add on`);
  }
  if (l.email && (WARM_KINDS.has(l.kind) || isSendableVerification(l.email_verification))) {
    score += 10;
    reasons.push("Reachable by email");
  } else if (l.phone) {
    score += 3;
    reasons.push("Phone on record");
  }
  // A fresh signal (an inquiry or a filing in the last year) beats an old one.
  const year = /\b(20\d\d)-\d\d-\d\d\b/.exec(l.source_detail)?.[1];
  if (year && Number(year) >= Number(today.slice(0, 4)) - 1) {
    score += 10;
    reasons.push("Active in the last year");
  }
  return { score: Math.min(100, score), reasons };
}

/** True when the lead may be invited now: an address that can take mail, nothing stopping it, not on AMBrain yet. */
export function invitable(l: BuyerLeadRow, suppression: Suppression): boolean {
  if (!l.email || l.status === "review" || l.status === "excluded" || l.status === "opted_out" || l.status === "bounced" || l.status === "replied" || REGISTERED_STATUSES.has(l.status)) return false;
  if (!WARM_KINDS.has(l.kind) && !isSendableVerification(l.email_verification)) return false;
  try {
    return !suppression.check(l.email, l.lead_id);
  } catch {
    return false; // an unreadable suppression list stops everything (compliance.md section 9 rule 1)
  }
}

const rank = (k: BuyerKind) => (WARM_KINDS.has(k) ? 0 : 1) * 100 + BUYER_KINDS.indexOf(k);
const nameKey = (company: string, name: string) => `${company.toLowerCase().replace(/[^a-z0-9]/g, "")}|${name.toLowerCase().replace(/[^a-z]/g, "")}`;

/**
 * Merge what sources found into buyers/leads.csv: one row per buyer (by
 * email, else by company and name). A buyer found again keeps what they had,
 * gains blanks, takes the warmer kind, and adds the new source to their
 * notes; nobody who opted out, bounced or was excluded comes back.
 */
export function upsertBuyers(stores: Stores, incoming: readonly IncomingBuyer[], now: Date): { added: number; updated: number; unchanged: number } {
  const stamp = isoStamp(now);
  const rows = stores.buyerLeads.rows();
  const byEmail = new Map(rows.filter((r) => r.email).map((r) => [canonicalEmail(r.email), r]));
  const byName = new Map(rows.filter((r) => r.company || r.name).map((r) => [nameKey(r.company, r.name), r]));
  const nextId = idAllocator("B", 5, rows.map((r) => r.lead_id));
  const out = new Map<string, BuyerLeadRow>();
  const result = { added: 0, updated: 0, unchanged: 0 };

  for (const inc of incoming) {
    const email = inc.email ? normalizeEmail(inc.email) : "";
    const key = nameKey(inc.company ?? "", inc.name ?? "");
    const prior = (email ? byEmail.get(canonicalEmail(email)) : undefined) ?? (key !== "|" ? byName.get(key) : undefined);
    const person = splitPersonName(inc.name ?? "");
    if (!prior) {
      const lead_id = nextId();
      const row = BuyerLeadRowSchema.parse({
        lead_id,
        status: inc.status ?? (email ? "new" : "needs_email"),
        kind: inc.kind,
        name: person.full || inc.name || "",
        first_name: person.first,
        last_name: person.last,
        title: inc.title ?? "",
        company: inc.company ?? "",
        email,
        email_source: email ? (inc.email_source ?? "import") : "",
        email_verification: "unverified",
        phone: inc.phone ?? "",
        website: inc.website ?? "",
        city: inc.city ?? "",
        state: (inc.state ?? "").toUpperCase().slice(0, 2),
        source: inc.source,
        source_detail: inc.source_detail,
        interest: inc.interest ?? "",
        fund_size: inc.fund_size === undefined ? "" : String(inc.fund_size),
        prospect_id: inc.prospect_id ?? "",
        score: "",
        score_reasons: "",
        ref: leadRef(lead_id),
        invite_step: "",
        last_invited_at: "",
        next_invite_date: "",
        replied_at: "",
        last_inbound_at: inc.inbound_at ?? "",
        registered_at: "",
        thread_id: inc.thread_id ?? "",
        created_at: stamp,
        updated_at: stamp,
        notes: inc.notes ?? "",
      });
      out.set(lead_id, row);
      if (email) byEmail.set(canonicalEmail(email), row);
      if (key !== "|") byName.set(key, row);
      result.added++;
      continue;
    }
    const base = out.get(prior.lead_id) ?? prior;
    const fill = <K extends keyof BuyerLeadRow>(k: K, v: BuyerLeadRow[K] | undefined) => (base[k] === "" || base[k] === undefined) && v !== undefined && v !== "" ? v : base[k];
    const kind = rank(inc.kind) < rank(base.kind) ? inc.kind : base.kind;
    const seen = base.source === inc.source || base.notes.includes(`Also found: ${inc.source_detail}`);
    const next: BuyerLeadRow = {
      ...base,
      kind,
      name: fill("name", person.full || inc.name),
      first_name: fill("first_name", person.first),
      last_name: fill("last_name", person.last),
      title: fill("title", inc.title),
      company: fill("company", inc.company),
      email: fill("email", email),
      email_source: base.email ? base.email_source : email ? (inc.email_source ?? "import") : base.email_source,
      phone: fill("phone", inc.phone),
      website: fill("website", inc.website),
      city: fill("city", inc.city),
      state: fill("state", (inc.state ?? "").toUpperCase().slice(0, 2)),
      interest: fill("interest", inc.interest),
      fund_size: base.fund_size ?? inc.fund_size,
      prospect_id: fill("prospect_id", inc.prospect_id),
      thread_id: fill("thread_id", inc.thread_id),
      last_inbound_at: inc.inbound_at && inc.inbound_at > base.last_inbound_at ? inc.inbound_at : base.last_inbound_at,
      // A new address takes a buyer who had none out of "needs email"; a person's "review" stays until they decide.
      status: base.status === "needs_email" && email ? "new" : base.status,
      notes: seen ? base.notes : [base.notes, `Also found: ${inc.source_detail}`].filter(Boolean).join("\n"),
      updated_at: stamp,
    };
    const changed = JSON.stringify({ ...next, updated_at: "" }) !== JSON.stringify({ ...base, updated_at: "" });
    if (changed) {
      out.set(base.lead_id, next);
      if (next.email) byEmail.set(canonicalEmail(next.email), next);
      result.updated++;
    } else result.unchanged++;
  }
  stores.buyerLeads.upsert([...out.values()]);
  return result;
}
