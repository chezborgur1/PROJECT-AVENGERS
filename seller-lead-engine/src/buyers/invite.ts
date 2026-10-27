import fs from "node:fs";
import path from "node:path";
import { mailboxDomain, type EngineConfig, type Mailbox } from "../config.ts";
import { discoverSite } from "../contacts/discover.ts";
import { emailRank } from "../contacts/enrich.ts";
import { isSendableVerification, verifyEmail } from "../contacts/verify.ts";
import { listUnsubscribeHeaders } from "../compliance/footer.ts";
import { ComplianceError, excludedTarget } from "../compliance/gate.ts";
import { canonicalEmail, Suppression } from "../compliance/suppression.ts";
import { normalizeEmail } from "../domain/schema.ts";
import { messageIdFor } from "../sending/mime.ts";
import { notSendDayReason, planDay } from "../sending/planner.ts";
import type { OutboxMessage, Transport } from "../sending/transports.ts";
import { idAllocator } from "../store/csvTable.ts";
import type { Stores } from "../store/index.ts";
import { addDays, daysBetween, isoStamp } from "../util/dates.ts";
import { invitable, scoreBuyer, signupLink, warmMailbox } from "./core.ts";
import { firmKey } from "./filings.ts";
import { assertBuyerSendable, BUYER_TEMPLATES_DIR, inviteTemplate, renderBuyerEmail, type BuyerTemplate } from "./outreach.ts";
import { REGISTERED_STATUSES, WARM_KINDS, type BuyerLeadRow, type BuyerTouchRow } from "./schema.ts";
import { inSellerPipeline } from "./sources.ts";

// From a found buyer to an invitation in their inbox:
//
//   enrichBuyers: a firm's website from its sister filings, then the
//   addresses the firm's own site publishes (robots.txt and "do not
//   harvest" honored, as on the seller side), then a verification for every
//   cold address. Warm buyers gave AMB their address themselves.
//   scoreBuyers: the order invitations go in (core.ts scoreBuyer).
//   planBuyerInvites / runBuyerInvites: today's emails, in this order:
//   1. answers to fresh listing inquiries (a buyer who asked today hears
//      back today, with the link that unlocks the listing),
//   2. follow-ups that are due, from the same mailbox and in the same thread,
//   3. new invitations, best score first.
//
// Caps: buyers.max_invites_per_day for everything; cold invitations also go
// from the seller sending mailboxes and take only what the seller plan
// leaves of each mailbox's ramp cap (the seller planner counts buyer
// touches too), so the two sides never together exceed a mailbox's cap.
// Warm buyers hear from AMB's own mailbox (buyers.mailbox).
//
// Every email passes assertBuyerSendable immediately before the transport;
// a ComplianceError stops that email, keeps a cancelled touch with the
// reasons, and never warns and sends. Drafts by default, like the seller side.

/** Days an inquiry stays fresh: within them the buyer gets the inquiry reply, after them the warm invitation. */
export const INQUIRY_FRESH_DAYS = 14;

// ---------------------------------------------------------------- enrich

/** What an enrichment run did. */
export interface BuyerEnrichReport {
  websites: number;
  found: number;
  verified: number;
  byStatus: Record<string, number>;
  stoppedAfter?: string;
  remaining?: number;
}

const OPEN = new Set(["new", "needs_email", "ready"]);
const idNum = (id: string) => Number(id.replace(/\D/g, "")) || 0;

/** Find and verify addresses for open buyer leads, in id order so a stopped run continues after the last one. Writes leads.csv once. */
export async function enrichBuyers(
  stores: Stores,
  config: EngineConfig,
  opts: { now: Date; discover: boolean; verify: boolean; fetchImpl?: typeof fetch; resolveMx?: (d: string) => Promise<string[]>; verifierApiKey?: string; startAfter?: string; shouldStop?: () => boolean },
): Promise<BuyerEnrichReport> {
  const stamp = isoStamp(opts.now);
  const suppression = new Suppression(stores.suppression);
  const rows = stores.buyerLeads.rows();
  const report: BuyerEnrichReport = { websites: 0, found: 0, verified: 0, byStatus: {} };
  const changed = new Map<string, BuyerLeadRow>();

  // A fund's filing has no website; the adviser that runs it often does (same firm, another filing).
  const siteByRoot = new Map<string, string>();
  for (const l of rows) if (l.website && firmKey(l.company)) siteByRoot.set(firmKey(l.company), l.website);
  for (const l of rows) {
    if (l.website || !firmKey(l.company) || !OPEN.has(l.status)) continue;
    const site = siteByRoot.get(firmKey(l.company));
    if (site) {
      changed.set(l.lead_id, { ...l, website: site, updated_at: stamp });
      report.websites++;
    }
  }

  const after = opts.startAfter ? idNum(opts.startAfter) : -1;
  const todo = rows.filter((l) => OPEN.has(l.status) && idNum(l.lead_id) > after).sort((a, b) => idNum(a.lead_id) - idNum(b.lead_id));
  let done = 0;
  for (const base of todo) {
    if (done > 0 && opts.shouldStop?.()) {
      report.stoppedAfter = todo[done - 1]!.lead_id;
      report.remaining = todo.length - done;
      break;
    }
    done++;
    let l = changed.get(base.lead_id) ?? base;
    if (!l.email && l.website && opts.discover) {
      const { emails } = await discoverSite(l.website, { ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}), teamPages: 1 });
      const person = { first: l.first_name, last: l.last_name };
      const best = emails
        .map((e) => normalizeEmail(e.email))
        .filter((e) => !excludedTarget(e, config.targeting.exclude_domains) && !suppression.lookup(e))
        .sort((a, b) => emailRank(a, person) - emailRank(b, person))[0];
      if (best) {
        l = { ...l, email: best, email_source: "website", email_verification: "unverified", status: l.status === "needs_email" ? "new" : l.status, updated_at: stamp };
        report.found++;
      }
    }
    if (l.email && opts.verify && !WARM_KINDS.has(l.kind) && l.email_verification === "unverified") {
      const v = await verifyEmail(l.email, { ...(opts.resolveMx ? { resolveMx: opts.resolveMx } : {}), ...(opts.verifierApiKey ? { verifierApiKey: opts.verifierApiKey } : {}), ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) });
      l = { ...l, email_verification: v.status, updated_at: stamp };
      report.verified++;
      report.byStatus[v.status] = (report.byStatus[v.status] ?? 0) + 1;
    }
    if (l !== base) changed.set(l.lead_id, l);
  }
  if (changed.size) stores.buyerLeads.upsert([...changed.values()]);
  return report;
}

// ---------------------------------------------------------------- score

/** Score every open lead; one that can be invited becomes "ready". Returns how many were scored. */
export function scoreBuyers(stores: Stores, config: EngineConfig, opts: { today: string; now: Date }): { scored: number; ready: number } {
  const suppression = new Suppression(stores.suppression);
  const stamp = isoStamp(opts.now);
  const out: BuyerLeadRow[] = [];
  let ready = 0;
  for (const l of stores.buyerLeads.rows()) {
    if (!OPEN.has(l.status) && l.status !== "invited") continue;
    const { score, reasons } = scoreBuyer(l, config, opts.today);
    let status = l.status;
    if (status === "new" || status === "ready") status = invitable({ ...l, status: "new" }, suppression) ? "ready" : l.email ? "new" : "needs_email";
    if (status === "ready") ready++;
    if (score !== l.score || reasons.join("; ") !== l.score_reasons || status !== l.status) out.push({ ...l, score, score_reasons: reasons.join("; "), status, updated_at: stamp });
  }
  if (out.length) stores.buyerLeads.upsert(out);
  return { scored: out.length, ready };
}

// ---------------------------------------------------------------- plan

/** One email the plan calls for. */
export interface PlannedInvite {
  leadId: string;
  step: number;
  template: BuyerTemplate;
  mailbox: string;
}

/** Today's buyer plan, with every skip explained. */
export interface BuyerPlan {
  date: string;
  items: PlannedInvite[];
  skipped: { leadId: string; reason: string }[];
  /** Room left per mailbox, and in all, before this plan. */
  room: Record<string, number>;
  reason?: string;
}

const occupies = (t: BuyerTouchRow) => t.status !== "failed" && t.status !== "cancelled";

/** Build today's buyer plan. Reads only. */
export function planBuyerInvites(stores: Stores, config: EngineConfig, opts: { today: string }): BuyerPlan {
  const { today } = opts;
  const plan: BuyerPlan = { date: today, items: [], skipped: [], room: {} };
  const notDay = notSendDayReason(config, today);
  if (notDay) return { ...plan, reason: notDay };
  if (!/^https?:\/\//i.test(config.buyers.signup_url.trim())) return { ...plan, reason: "buyers.signup_url is blank: set AMBrain's registration address first" };
  const warm = warmMailbox(config);
  const suppression = new Suppression(stores.suppression);
  const touches = stores.buyerTouches.rows();
  const leads = stores.buyerLeads.rows();
  const leadIds = new Set(stores.leads.rows().map((l) => l.prospect_id));
  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  const sellerEmails = new Map(stores.prospects.rows().filter((p) => p.email && (p.status === "in_sequence" || p.status === "replied" || leadIds.has(p.prospect_id))).map((p) => [canonicalEmail(p.email), p.prospect_id]));

  let total = config.buyers.max_invites_per_day - touches.filter((t) => occupies(t) && t.created_at.slice(0, 10) === today).length;
  // What the seller plan leaves of each sending mailbox today (it already counts buyer touches made earlier today).
  const seller = planDay(stores, config, { today });
  const room = new Map<string, number>();
  for (const m of config.mailboxes) {
    const c = seller.caps[m.email];
    const d = seller.caps[`domain:${mailboxDomain(m.email)}`];
    room.set(normalizeEmail(m.email), c && d ? Math.max(0, Math.min(c.cap - c.used, d.cap - d.used)) : 0);
  }
  const warmKey = warm ? normalizeEmail(warm.email) : "";
  // AMB's own mailbox, when it is not also a sending mailbox, carries only the buyer total.
  if (warm && !room.has(warmKey)) room.set(warmKey, warm.paused ? 0 : Number.POSITIVE_INFINITY);
  for (const [k, v] of room) plan.room[k] = Number.isFinite(v) ? v : total;
  plan.room.total = Math.max(0, total);
  const take = (mailbox: string) => {
    const k = normalizeEmail(mailbox);
    if (total <= 0 || (room.get(k) ?? 0) <= 0) return false;
    room.set(k, room.get(k)! - 1);
    total--;
    return true;
  };
  const coldBoxes = config.mailboxes.filter((m) => !m.paused && !seller.paused[m.email]?.length).map((m) => normalizeEmail(m.email));

  const byLead = new Map<string, BuyerTouchRow[]>();
  for (const t of touches) byLead.set(t.lead_id, [...(byLead.get(t.lead_id) ?? []), t]);
  const blocked = (l: BuyerLeadRow): string | undefined => {
    const p = l.prospect_id ? prospects.get(l.prospect_id) : undefined;
    if (p && inSellerPipeline(p, leadIds, config) && p.status !== "scored") return `the seller side has ${p.prospect_id} (${p.status})`;
    const seller = sellerEmails.get(canonicalEmail(l.email));
    if (seller) return `the address is a seller-side owner in conversation (${seller})`;
    if (!invitable(l, suppression)) return `not invitable (${l.status}${l.email ? "" : ", no email"}${!WARM_KINDS.has(l.kind) && !isSendableVerification(l.email_verification) ? `, verification ${l.email_verification}` : ""})`;
    return undefined;
  };
  const byScore = (a: BuyerLeadRow, b: BuyerLeadRow) => (b.score ?? 0) - (a.score ?? 0) || a.lead_id.localeCompare(b.lead_id);

  // 1. Fresh inquiries.
  const fresh = leads.filter((l) => l.kind === "inquirer" && (l.status === "ready" || l.status === "new") && l.last_inbound_at && daysBetween(l.last_inbound_at.slice(0, 10), today) <= INQUIRY_FRESH_DAYS && !(byLead.get(l.lead_id) ?? []).some(occupies));
  const planned = new Set<string>();
  for (const l of fresh.sort((a, b) => b.last_inbound_at.localeCompare(a.last_inbound_at))) {
    const why = blocked(l);
    if (why) {
      plan.skipped.push({ leadId: l.lead_id, reason: why });
      continue;
    }
    if (!warm || !take(warm.email)) {
      plan.skipped.push({ leadId: l.lead_id, reason: warm ? "no room left today" : "no buyer mailbox configured" });
      continue;
    }
    planned.add(l.lead_id);
    plan.items.push({ leadId: l.lead_id, step: 1, template: "inquiry-reply", mailbox: warm.email });
  }

  // 2. Follow-ups that are due.
  for (const l of leads.filter((x) => x.status === "invited" && x.next_invite_date && x.next_invite_date <= today && (x.invite_step ?? 0) < config.buyers.invite_steps).sort(byScore)) {
    const mine = byLead.get(l.lead_id) ?? [];
    const step = (l.invite_step ?? 0) + 1;
    const skip = (reason: string) => plan.skipped.push({ leadId: l.lead_id, reason });
    if (mine.some((t) => t.step === step && occupies(t))) {
      skip(`step ${step} already exists`);
      continue;
    }
    const prev = mine.filter((t) => t.step === step - 1 && occupies(t)).at(-1);
    if (!prev || (prev.status !== "drafted" && prev.status !== "sent")) {
      skip(`step ${step - 1} is not yet recorded as drafted or sent: step ${step} waits`);
      continue;
    }
    const why = blocked({ ...l, status: "new" });
    if (why) {
      skip(why);
      continue;
    }
    if (!take(prev.mailbox)) {
      skip(`mailbox ${prev.mailbox} has no room left today`);
      continue;
    }
    planned.add(l.lead_id);
    plan.items.push({ leadId: l.lead_id, step, template: prev.kind === "inquiry_reply" ? inviteTemplate({ kind: "past_bidder" }, step) : inviteTemplate(l, step), mailbox: prev.mailbox });
  }

  // 3. New invitations: warm first (they know AMB), then best score.
  const ready = leads.filter((l) => l.status === "ready" && !planned.has(l.lead_id) && !(byLead.get(l.lead_id) ?? []).some(occupies));
  ready.sort((a, b) => Number(WARM_KINDS.has(b.kind)) - Number(WARM_KINDS.has(a.kind)) || byScore(a, b));
  for (const l of ready) {
    const why = blocked(l);
    if (why) {
      plan.skipped.push({ leadId: l.lead_id, reason: why });
      continue;
    }
    let box: string | undefined;
    if (WARM_KINDS.has(l.kind)) box = warm && take(warm.email) ? warm.email : undefined;
    else {
      const open = coldBoxes.filter((k) => (room.get(k) ?? 0) > 0).sort((a, b) => (room.get(b) ?? 0) - (room.get(a) ?? 0));
      box = open[0] && take(open[0]) ? config.mailboxes.find((m) => normalizeEmail(m.email) === open[0])!.email : undefined;
    }
    if (!box) {
      plan.skipped.push({ leadId: l.lead_id, reason: total <= 0 ? "buyers.max_invites_per_day reached" : WARM_KINDS.has(l.kind) ? "the buyer mailbox has no room left today" : "no sending mailbox has room left after today's seller email" });
      continue;
    }
    plan.items.push({ leadId: l.lead_id, step: 1, template: inviteTemplate(l, 1), mailbox: box });
  }
  return plan;
}

// ---------------------------------------------------------------- send

/** What a buyer send did. */
export interface BuyerSendReport {
  date: string;
  mode: "draft" | "send";
  transport: string;
  dryRun: boolean;
  plan: BuyerPlan;
  delivered: { touchId: string; leadId: string; step: number; mailbox: string; template: BuyerTemplate }[];
  blocked: { leadId: string; reasons: string[] }[];
  failed: { leadId: string; error: string }[];
  previews: { leadId: string; to: string; mailbox: string; subject: string; body: string }[];
}

/** The mailbox config for an address: a sending mailbox or the buyer mailbox. */
function boxFor(config: EngineConfig, email: string): Mailbox | undefined {
  const warm = warmMailbox(config);
  return [...config.mailboxes, ...(warm ? [warm] : [])].find((m) => normalizeEmail(m.email) === normalizeEmail(email));
}

/** Plan, render, gate and deliver today's buyer emails. */
export async function runBuyerInvites(stores: Stores, config: EngineConfig, opts: { today: string; now: Date; transport: Transport; dryRun?: boolean; templatesDir?: string }): Promise<BuyerSendReport> {
  const { today, now, transport } = opts;
  const dryRun = Boolean(opts.dryRun);
  const mode = config.sending.mode;
  const plan = planBuyerInvites(stores, config, { today });
  const report: BuyerSendReport = { date: today, mode, transport: transport.name, dryRun, plan, delivered: [], blocked: [], failed: [], previews: [] };
  const stamp = isoStamp(now);
  const suppression = new Suppression(stores.suppression);
  const leads = new Map(stores.buyerLeads.rows().map((l) => [l.lead_id, l]));
  const touches = stores.buyerTouches.rows();
  const nextId = idAllocator("BT", 6, touches.map((t) => t.touch_id));

  for (const item of plan.items) {
    const lead = leads.get(item.leadId);
    const mailbox = boxFor(config, item.mailbox);
    if (!lead || !mailbox) {
      report.failed.push({ leadId: item.leadId, error: !lead ? "lead not found" : `mailbox ${item.mailbox} not in config` });
      continue;
    }
    let link: string;
    let rendered: { subject: string; body: string };
    const previous = touches.filter((t) => t.lead_id === lead.lead_id && (t.status === "drafted" || t.status === "sent") && (t.step ?? 0) < item.step).sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    try {
      link = signupLink(config, lead);
      rendered = renderBuyerEmail(item.template, lead, config, mailbox, link, opts.templatesDir ?? BUYER_TEMPLATES_DIR, previous[0] ? { previousSubject: previous[0].subject } : {});
    } catch (err) {
      report.failed.push({ leadId: lead.lead_id, error: `render: ${(err as Error).message}` });
      continue;
    }
    const touchId = nextId();
    const domain = mailboxDomain(mailbox.email);
    const earlier = previous;
    const headers: Record<string, string> = { ...listUnsubscribeHeaders(config, mailbox, touchId), "Message-ID": messageIdFor(touchId, now, domain) };
    let threadId: string | undefined;
    let replyToMessageId: string | undefined;
    if (item.step > 1 && earlier.length) {
      const ids = earlier.map((t) => messageIdFor(t.touch_id, t.created_at || today, mailboxDomain(t.mailbox) || domain));
      headers["In-Reply-To"] = ids.at(-1)!;
      headers.References = ids.join(" ");
      threadId = earlier.map((t) => t.thread_id).filter(Boolean).at(-1) || undefined;
      replyToMessageId = earlier.at(-1)?.message_id || undefined;
    }
    const msg: OutboxMessage = {
      touchId,
      prospectId: lead.lead_id,
      kind: item.template === "inquiry-reply" ? "reply" : "outreach",
      step: item.step,
      mailbox: mailbox.email,
      fromName: `${mailbox.sender_name.trim()}, ${config.firm.name}`,
      to: lead.email,
      subject: rendered.subject,
      body: rendered.body,
      headers,
      ...(threadId ? { threadId } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
    };
    const row: BuyerTouchRow = {
      touch_id: touchId,
      lead_id: lead.lead_id,
      kind: item.template === "inquiry-reply" ? "inquiry_reply" : "invite",
      step: item.step,
      mailbox: mailbox.email,
      to: normalizeEmail(lead.email),
      subject: msg.subject,
      status: "queued",
      planned_for: today,
      draft_id: "",
      message_id: "",
      thread_id: threadId ?? "",
      error: "",
      created_at: stamp,
    };
    try {
      assertBuyerSendable(msg, { config, suppression, lead, link });
    } catch (err) {
      if (!(err instanceof ComplianceError)) {
        report.failed.push({ leadId: lead.lead_id, error: `gate: ${(err as Error).message}` });
        continue;
      }
      report.blocked.push({ leadId: lead.lead_id, reasons: err.reasons });
      if (!dryRun) stores.buyerTouches.append([{ ...row, status: "cancelled", error: `blocked: ${err.reasons.join("; ")}`.slice(0, 500) }]);
      continue;
    }
    if (dryRun) {
      report.delivered.push({ touchId, leadId: lead.lead_id, step: item.step, mailbox: mailbox.email, template: item.template });
      report.previews.push({ leadId: lead.lead_id, to: msg.to, mailbox: mailbox.email, subject: msg.subject, body: msg.body });
      continue;
    }
    stores.buyerTouches.append([row]);
    touches.push(row);
    let result;
    try {
      result = await transport.deliver(msg, mode);
    } catch (err) {
      Object.assign(row, { status: "failed", error: (err as Error).message.slice(0, 500) });
      stores.buyerTouches.upsert([row]);
      report.failed.push({ leadId: lead.lead_id, error: row.error });
      continue;
    }
    const confirmed = Boolean(result.draftId || result.messageId);
    Object.assign(row, { status: confirmed ? (mode === "draft" ? "drafted" : "sent") : "queued", message_id: result.messageId ?? "", draft_id: result.draftId ?? "", thread_id: result.threadId ?? row.thread_id } satisfies Partial<BuyerTouchRow>);
    stores.buyerTouches.upsert([row]);
    const updated: BuyerLeadRow = {
      ...lead,
      status: "invited",
      invite_step: item.step,
      last_invited_at: stamp,
      next_invite_date: item.step < config.buyers.invite_steps ? addDays(today, config.buyers.follow_up_days) : "",
      thread_id: lead.thread_id || result.threadId || "",
      updated_at: stamp,
    };
    stores.buyerLeads.upsert([updated]);
    leads.set(lead.lead_id, updated);
    report.delivered.push({ touchId, leadId: lead.lead_id, step: item.step, mailbox: mailbox.email, template: item.template });
  }
  return report;
}

const ORDER: Record<BuyerTouchRow["status"], number> = { queued: 0, failed: 1, drafted: 2, sent: 3, cancelled: 4 };

/** Record what happened to a buyer email after the fact (the outbox routine's `record BT-...`). Status only moves forward; a failed step 1 puts the lead back in line. */
export function recordBuyerDelivery(stores: Stores, touchId: string, result: { status: "drafted" | "sent" | "failed"; messageId?: string; threadId?: string; draftId?: string; error?: string }, now: Date): void {
  const touch = stores.buyerTouches.rows().find((t) => t.touch_id === touchId);
  if (!touch) throw new Error(`Buyer touch ${touchId} not found in buyers/touches.csv`);
  if (touch.status === "sent" || touch.status === "cancelled") {
    if (touch.status === result.status) return;
    throw new Error(`Buyer touch ${touchId} is already ${touch.status}; it cannot move to ${result.status}`);
  }
  if (ORDER[result.status] < ORDER[touch.status] && result.status !== "failed") throw new Error(`Buyer touch ${touchId} is ${touch.status}; status only moves forward, not to ${result.status}`);
  if (touch.status === "drafted" && result.status === "failed") throw new Error(`Buyer touch ${touchId} is already drafted; delete the draft by hand instead of recording failed`);
  stores.buyerTouches.upsert([{ ...touch, status: result.status, message_id: result.messageId ?? touch.message_id, thread_id: result.threadId ?? touch.thread_id, draft_id: result.draftId ?? touch.draft_id, error: result.status === "failed" ? (result.error ?? "failed (no detail recorded)") : (result.error ?? "") }]);
  const lead = stores.buyerLeads.rows().find((l) => l.lead_id === touch.lead_id);
  if (!lead) return;
  const stamp = isoStamp(now);
  if (result.status === "failed") {
    if (lead.status !== "invited" || lead.invite_step !== touch.step) return;
    const step = touch.step ?? 1;
    stores.buyerLeads.upsert([step <= 1 ? { ...lead, status: "ready", invite_step: undefined, next_invite_date: "", updated_at: stamp } : { ...lead, invite_step: step - 1, next_invite_date: stamp.slice(0, 10), updated_at: stamp }]);
    return;
  }
  if (result.threadId && !lead.thread_id) stores.buyerLeads.upsert([{ ...lead, thread_id: result.threadId, updated_at: stamp }]);
}

/** Cancel a lead's queued emails (it opted out, bounced, replied or registered): the outbox file is renamed so the routine skips it. Drafts already made are listed for a person. */
export function cancelBuyerTouches(stores: Stores, leadId: string, reason: string, now: Date): { cancelled: number; draftsToCheck: BuyerTouchRow[] } {
  void now;
  const mine = stores.buyerTouches.rows().filter((t) => t.lead_id === leadId);
  const queued = mine.filter((t) => t.status === "queued");
  if (queued.length) stores.buyerTouches.upsert(queued.map((t) => ({ ...t, status: "cancelled" as const, error: `cancelled before sending: ${reason}`.slice(0, 500) })));
  for (const t of queued) {
    const file = path.join(stores.dir.outbox, t.planned_for || t.created_at.slice(0, 10), `${t.touch_id}.json`);
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.cancelled`);
  }
  return { cancelled: queued.length, draftsToCheck: mine.filter((t) => t.status === "drafted") };
}

/** Cancel queued emails for every lead that can no longer be emailed (opted out, bounced, replied, registered or excluded). */
export function cancelStaleBuyerTouches(stores: Stores, now: Date): { cancelled: number; draftsToCheck: BuyerTouchRow[] } {
  const stop = stores.buyerLeads.rows().filter((l) => ["opted_out", "bounced", "replied", "excluded"].includes(l.status) || REGISTERED_STATUSES.has(l.status));
  const queuedFor = new Set(stores.buyerTouches.rows().filter((t) => t.status === "queued" || t.status === "drafted").map((t) => t.lead_id));
  const out = { cancelled: 0, draftsToCheck: [] as BuyerTouchRow[] };
  for (const l of stop) {
    if (!queuedFor.has(l.lead_id)) continue;
    const r = cancelBuyerTouches(stores, l.lead_id, `lead is ${l.status}`, now);
    out.cancelled += r.cancelled;
    // A drafted email to someone who opted out or bounced must be deleted by hand; one to a registered buyer is merely late.
    if (l.status === "opted_out" || l.status === "bounced") out.draftsToCheck.push(...r.draftsToCheck);
  }
  return out;
}
