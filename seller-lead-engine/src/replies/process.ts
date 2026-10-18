import crypto from "node:crypto";
import type { EngineConfig, Mailbox } from "../config.ts";
import type { InboundMessage, OutgoingMessage } from "../domain/messages.ts";
import { normalizeEmail, type LeadRow, type ProspectRow, type ReplyRow, type SuppressionRow, type TouchRow } from "../domain/schema.ts";
import { assertSendable, ComplianceError } from "../compliance/gate.ts";
import { findMailbox } from "../compliance/lint.ts";
import { detectOptOut } from "../compliance/optout.ts";
import { canonicalEmail, Suppression } from "../compliance/suppression.ts";
import { qualScore, nextStage } from "../qualify/score.ts";
import type { Transport } from "../sending/transports.ts";
import { idAllocator } from "../store/csvTable.ts";
import type { Stores } from "../store/index.ts";
import { addDays, isoStamp } from "../util/dates.ts";
import { classifyByRules, classifyReply, withoutOwnText, type Classification, type ReplyFacts } from "./classify.ts";
import { addressOf, detectBounce, POLICY_SNIPPET_PREFIX, stripQuoted, type BounceType } from "./parse.ts";
import { draftResponse, withQuestionsAsked } from "./respond.ts";

// The reply loop: every received message is matched to a prospect,
// classified, recorded in replies.csv, and acted on.
//
// - An authentication or policy bounce (550 5.7.515, 5.7.26, ...: our
//   domain failed SPF, DKIM or DMARC at the receiver) suppresses nobody.
//   It is recorded as a soft bounce whose snippet leads with the code, and a
//   mailbox_log row names it; src/sending/health.ts pauses the mailbox from
//   it until a person clears the pause.
// - Opt-out, complaint, "not the owner" and hard bounce: the address and the
//   prospect go on the permanent suppression list at once (CAN-SPAM 7704(a)(4)
//   allows 10 business days, Gmail expects 2, docs/research/deliverability.md
//   asks for 24 hours: the engine does it in the same run), the prospect
//   becomes dnc and the lead lost. A complaint also writes a mailbox_log row
//   so the sender's health check pauses that mailbox.
// - Any human reply stops the sequence (prospect status replied) and
//   upserts the lead: stated facts merged (a blank never overwrites a stated
//   fact), qualification score, stage, questions asked.
// - An auto-reply pauses the sequence 7 days instead of stopping it
//   (deliverability.md section 5).
// - A reply that deserves an answer gets a draft: draftResponse, then the
//   compliance gate (kind reply), then transport.deliver(msg, "draft"). A
//   draft is never made for a suppressed address or prospect, and replies
//   are never sent by the engine.
//
// Idempotent: replies.csv is keyed by the mailbox's message id, so running
// the same messages twice adds no row and no draft. A message whose
// classification failed (class blank) is retried on the next run; nothing
// else is. A reply's draft touch id is written to its row before the
// transport is called, so a crash mid-delivery never leads to a second draft.

/** What one run did. */
export interface ProcessReport {
  received: number;
  duplicates: number;
  unmatched: number;
  byClass: Record<string, number>;
  suppressed: number;
  drafted: number;
  errors: { replyId: string; error: string }[];
  /** Messages sent by one of AMB's own mailboxes (a thread's own history), skipped. */
  ownMessages: number;
  /** Authentication or policy bounces: the mailbox pauses, the recipient is not suppressed. */
  policyBounces: number;
}

/** Classes from a person, as opposed to machine mail. */
const HUMAN_CLASSES = new Set(["interested", "question", "asks_if_ai", "not_now", "not_interested", "unsubscribe", "wrong_person", "referral", "complaint", "other"]);

/** Days an auto-reply pauses the sequence when it gives no return date (deliverability.md section 5). */
export const AUTO_REPLY_PAUSE_DAYS = 7;

/** Days until a "not now" lead is checked again, by the timeline the owner gave. */
const NURTURE_DAYS: Record<string, number> = { "0-6m": 90, "6-12m": 180, "12-24m": 365, "24m+": 540, unknown: 180 };

const sha256 = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

/** An ISO timestamp the replies table accepts, from whatever date string a source gave; "" when unreadable. */
function stampOf(date: string): string {
  const t = Date.parse(date);
  return Number.isFinite(t) ? isoStamp(new Date(t)) : "";
}

/** Merge stated facts into a lead. A fact the owner did not state (undefined, blank, "unknown") never overwrites one they did. */
export function mergeFacts(lead: LeadRow, facts: ReplyFacts): LeadRow {
  const out: LeadRow = { ...lead };
  for (const [k, v] of Object.entries(facts) as [keyof ReplyFacts, unknown][]) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && (v.trim() === "" || v === "unknown")) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    (out as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

/** A blank lead for a prospect who has just written. */
export function newLead(p: ProspectRow): LeadRow {
  return {
    prospect_id: p.prospect_id,
    stage: "engaged",
    business_name: p.business_name,
    owner_name: p.owner_name,
    email: p.email,
    revenue: undefined,
    revenue_band: "",
    sde: undefined,
    ebitda: undefined,
    employees: undefined,
    years_owned: undefined,
    owner_hours_per_week: undefined,
    recurring_revenue_pct: undefined,
    top_customer_pct: undefined,
    owns_real_estate: "",
    license_holder: "",
    timeline: "unknown",
    motivation: "unknown",
    motivation_detail: "",
    wants_readiness_check: "",
    qual_score: undefined,
    readiness_score: undefined,
    questions_asked: "",
    summary: "",
    next_action: "",
    nurture_date: "",
    handed_off_at: "",
    handoff_file: "",
    books_match_returns: "",
    revenue_trend: "",
    manager_in_place: "",
    runs_without_owner: "",
    lease_years_left: undefined,
    updated_at: "",
  };
}

/** The suppression reason a classification calls for, or undefined. */
function suppressionReason(cls: Classification, bounceType: BounceType | undefined): SuppressionRow["reason"] | undefined {
  if (cls.complaint || cls.class === "complaint") return "complaint";
  if (cls.optOut || cls.class === "unsubscribe") return "opt_out";
  if (cls.class === "wrong_person") return "wrong_person";
  if (cls.class === "bounce" && bounceType === "hard") return "bounce";
  return undefined;
}

/** What a person should do next with this lead, in plain words. */
function nextAction(cls: Classification, stage: LeadRow["stage"], drafted: boolean): string {
  if (stage === "lost") return "None: conversation closed";
  if (stage === "warm") return "Hand off to the advisor";
  if (stage === "nurture") return "Check back at the nurture date";
  if (cls.class === "other") return "Read the reply and answer by hand";
  if (cls.class === "referral") return "Read the referral; any new contact is a person's decision";
  return drafted ? "Review and send the drafted reply" : "Review the reply";
}

/** Match, classify, record and act on every message; returns what happened. See the header for the rules. */
export async function processInbox(
  stores: Stores,
  config: EngineConfig,
  opts: { now: Date; today: string; messages: InboundMessage[]; transport: Transport; classify?: typeof classifyReply },
): Promise<ProcessReport> {
  const { now, today, transport } = opts;
  const classify = opts.classify ?? classifyReply;
  const stamp = isoStamp(now);
  const report: ProcessReport = { received: opts.messages.length, duplicates: 0, unmatched: 0, byClass: {}, suppressed: 0, drafted: 0, errors: [], ownMessages: 0, policyBounces: 0 };

  const suppression = new Suppression(stores.suppression);
  const existing = new Map(stores.replies.rows().map((r) => [r.reply_id, r]));
  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  const leads = new Map(stores.leads.rows().map((l) => [l.prospect_id, l]));
  const touches = stores.touches.rows();
  const nextTouchId = idAllocator("T", 6, touches.map((t) => t.touch_id));
  const ownMailboxes = new Set(config.mailboxes.map((m) => normalizeEmail(m.email)));

  // Thread -> prospect, from touches first (every message the engine made), then the prospect's own thread id.
  const byThread = new Map<string, string>();
  for (const t of touches) if (t.thread_id && t.prospect_id && !byThread.has(t.thread_id)) byThread.set(t.thread_id, t.prospect_id);
  for (const p of prospects.values()) if (p.thread_id && !byThread.has(p.thread_id)) byThread.set(p.thread_id, p.prospect_id);
  const byEmail = new Map<string, string>();
  for (const p of prospects.values()) if (p.email) byEmail.set(canonicalEmail(p.email), p.prospect_id);

  // Oldest first, so a later "please stop" after an earlier "yes" is the decision that stands.
  const ordered = [...opts.messages].sort((a, b) => (stampOf(a.date) || a.date).localeCompare(stampOf(b.date) || b.date));
  const seen = new Set<string>();

  for (const msg of ordered) {
    const prior = existing.get(msg.id);
    if (seen.has(msg.id) || (prior && prior.class !== "")) {
      report.duplicates++;
      continue;
    }
    seen.add(msg.id);
    const from = addressOf(msg.from);
    if (ownMailboxes.has(from)) {
      report.ownMessages++;
      continue;
    }

    const stripped = stripQuoted(msg.text);
    const bounce = detectBounce(msg);
    const prospectId =
      byThread.get(msg.threadId) ?? byEmail.get(canonicalEmail(from)) ?? (bounce?.recipient ? byEmail.get(canonicalEmail(bounce.recipient)) : undefined);
    const prospect = prospectId ? prospects.get(prospectId) : undefined;

    const row: ReplyRow = {
      reply_id: msg.id,
      prospect_id: prospect?.prospect_id ?? "",
      thread_id: msg.threadId,
      mailbox: msg.mailbox,
      from_email: from,
      subject: msg.subject.slice(0, 300),
      received_at: stampOf(msg.date),
      // A policy bounce leads with its code, so the mailbox health check and a person both see it.
      snippet: (bounce?.type === "policy" ? `${POLICY_SNIPPET_PREFIX} ${bounce.code}: ${stripped}` : stripped).slice(0, 500),
      class: "",
      classifier: "",
      opt_out: "",
      // replies.csv keeps hard/soft only: a policy bounce is recorded as soft, so it never counts as a dead address.
      bounce_type: bounce ? (bounce.type === "policy" ? "soft" : bounce.type) : "",
      processed_at: stamp,
      response_touch_id: prior?.response_touch_id ?? "",
      error: "",
    };

    // ---- classify
    let cls: Classification;
    try {
      if (!prospect) {
        // Unmatched: only the deterministic rules run (no prospect context for Claude), so an opt-out is still caught.
        cls = classifyByRules(msg, stripped) ?? { class: "other", classifier: "rules", optOut: false, complaint: false, facts: {}, notes: "unmatched: no prospect for this sender or thread" };
      } else {
        cls = await classify(msg, { prospect, lead: leads.get(prospect.prospect_id), config });
      }
    } catch (err) {
      row.error = `classification failed: ${(err as Error).message}`.slice(0, 500);
      stores.replies.upsert([row]);
      report.errors.push({ replyId: msg.id, error: row.error });
      continue;
    }
    // A rule-detected opt-out wins over any classifier, injected ones included.
    if (cls.class !== "bounce" && detectOptOut(withoutOwnText(stripped)) && !cls.optOut) cls = { ...cls, class: "unsubscribe", optOut: true };

    row.class = cls.class;
    row.classifier = cls.classifier;
    row.opt_out = cls.optOut ? "Y" : "N";
    report.byClass[cls.class] = (report.byClass[cls.class] ?? 0) + 1;

    try {
      // ---- suppression: permanent, before anything else happens
      const reason = suppressionReason(cls, bounce?.type);
      if (reason) {
        const source = `reply ${msg.id}`;
        const emails = new Set<string>();
        if (cls.class === "bounce") {
          if (bounce?.recipient) emails.add(bounce.recipient);
          if (prospect?.email) emails.add(normalizeEmail(prospect.email));
        } else {
          if (from) emails.add(from);
          if (prospect?.email) emails.add(normalizeEmail(prospect.email));
        }
        const valid = [...emails].filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
        for (const e of valid) suppression.add(e, "email", reason, source, now);
        if (prospect) suppression.add(prospect.prospect_id, "prospect", reason, source, now);
        if (valid.length || prospect) report.suppressed++;
        if (reason === "complaint") {
          // The sender's health check reads complaints; this row also tells a person why the mailbox paused.
          stores.mailboxLog.append([
            {
              date: today,
              mailbox: msg.mailbox || prospect?.mailbox || "",
              sent: undefined,
              drafted: undefined,
              hard_bounces: undefined,
              soft_bounces: undefined,
              complaints: 1,
              opt_outs: undefined,
              human_replies: undefined,
              paused: config.guardrails.pause_on_complaint ? "Y" : "",
              pause_reason: `complaint in reply ${msg.id}`,
            },
          ]);
        }
      }

      if (cls.class === "bounce" && bounce?.type === "policy") {
        // Our domain failed the receiver's SPF, DKIM or DMARC check: the recipient is not at fault and is
        // not suppressed. The sender's health check pauses the mailbox from this reply row; this log row
        // tells a person why.
        report.policyBounces++;
        stores.mailboxLog.append([
          {
            date: today,
            mailbox: msg.mailbox || prospect?.mailbox || "",
            sent: undefined,
            drafted: undefined,
            hard_bounces: undefined,
            soft_bounces: 1,
            complaints: undefined,
            opt_outs: undefined,
            human_replies: undefined,
            paused: "Y",
            pause_reason: `authentication bounce ${bounce.code ?? ""} in reply ${msg.id}: the receiver refused our sending domain (SPF, DKIM or DMARC); recipient not suppressed. Fix DNS, run preflight, then clear the pause`.replace(/\s+/g, " "),
          },
        ]);
      }

      if (!prospect) {
        report.unmatched++;
        stores.replies.upsert([row]);
        continue;
      }

      // ---- prospect state
      let p: ProspectRow = { ...prospect, updated_at: stamp };
      if (reason) p = { ...p, status: "dnc", next_touch_date: "" };
      else if (HUMAN_CLASSES.has(cls.class) && p.status !== "dnc") p = { ...p, status: "replied", next_touch_date: "" };
      else if (cls.class === "auto_reply" && p.status === "in_sequence") {
        const resume = addDays(today, AUTO_REPLY_PAUSE_DAYS);
        if (!p.next_touch_date || p.next_touch_date < resume) p = { ...p, next_touch_date: resume };
      }
      prospects.set(p.prospect_id, p);
      stores.prospects.upsert([p]);

      // ---- lead
      const priorLead = leads.get(p.prospect_id);
      // An opt-out, complaint, wrong person or hard bounce closes an existing lead; it never opens one.
      if (reason && priorLead) {
        const lost: LeadRow = { ...priorLead, stage: "lost", next_action: nextAction(cls, "lost", false), updated_at: stamp };
        leads.set(p.prospect_id, lost);
        stores.leads.upsert([lost]);
      }
      if (!HUMAN_CLASSES.has(cls.class) || reason) {
        stores.replies.upsert([row]);
        continue;
      }

      let lead = mergeFacts(priorLead ?? newLead(p), cls.facts);
      // Never draft for an address or prospect on the suppression list, whatever the reply says: a person decides.
      const blocked = suppression.check(from, p.prospect_id) ?? suppression.check(p.email, p.prospect_id);
      if (blocked) {
        row.error = `not drafted: ${blocked.value} is suppressed (${blocked.reason})`;
        lead = { ...lead, stage: "lost", next_action: `Suppressed (${blocked.reason}): a person must review before any contact`, updated_at: stamp };
        leads.set(p.prospect_id, lead);
        stores.leads.upsert([lead]);
        stores.replies.upsert([row]);
        continue;
      }
      let draft = draftResponse(cls, { prospect: p, lead, config, mailbox: replyMailbox(config, msg, p), subject: msg.subject });
      if (draft && row.response_touch_id) draft = null; // a draft was already made for this message on an earlier run

      let delivered = false;
      if (draft) {
        const mailbox = replyMailbox(config, msg, p);
        const touchId = nextTouchId();
        const out: OutgoingMessage = {
          touchId,
          prospectId: p.prospect_id,
          kind: "reply",
          mailbox: mailbox.email,
          fromName: `${mailbox.sender_name}, ${config.firm.name}`,
          to: from || p.email,
          subject: draft.subject,
          body: draft.body,
          headers: threadHeaders(msg),
          ...(msg.threadId ? { threadId: msg.threadId } : {}),
        };
        try {
          assertSendable(out, { config, suppression, prospect: p });
          const touch: TouchRow = {
            touch_id: touchId,
            prospect_id: p.prospect_id,
            kind: "reply",
            step: undefined,
            mailbox: mailbox.email,
            to_email: out.to,
            subject: out.subject,
            body_sha256: sha256(out.body),
            planned_for: today,
            status: "planned",
            mode: "draft",
            message_id: "",
            thread_id: msg.threadId,
            draft_id: "",
            error: "",
            created_at: stamp,
            updated_at: stamp,
          };
          stores.touches.upsert([touch]);
          // Record the draft on the reply before delivering, so a crash here never yields a second draft.
          row.response_touch_id = touchId;
          stores.replies.upsert([row]);
          try {
            // Replies are always drafts (qualify.auto_send_replies is the literal false).
            const res = await transport.deliver(out, "draft");
            stores.touches.upsert([{ ...touch, status: "drafted", message_id: res.messageId ?? "", thread_id: res.threadId ?? touch.thread_id, draft_id: res.draftId ?? "", updated_at: stamp }]);
            delivered = true;
            report.drafted++;
            lead = { ...lead, questions_asked: withQuestionsAsked(lead, draft.questionKeys) };
          } catch (err) {
            const e = `draft delivery failed: ${(err as Error).message}`.slice(0, 500);
            stores.touches.upsert([{ ...touch, status: "failed", error: e, updated_at: stamp }]);
            row.error = e;
            report.errors.push({ replyId: msg.id, error: e });
          }
        } catch (err) {
          if (!(err instanceof ComplianceError)) throw err;
          row.error = `draft blocked: ${err.reasons.join("; ")}`.slice(0, 500);
          report.errors.push({ replyId: msg.id, error: row.error });
        }
      }

      // ---- qualification and stage
      const q = qualScore(lead, config);
      const stage = nextStage(lead, cls.class, q, config);
      lead = {
        ...lead,
        qual_score: q.score,
        stage,
        next_action: nextAction(cls, stage, delivered),
        nurture_date: stage === "nurture" ? addDays(today, NURTURE_DAYS[lead.timeline] ?? 180) : lead.nurture_date,
        updated_at: stamp,
      };
      leads.set(p.prospect_id, lead);
      stores.leads.upsert([lead]);
      stores.replies.upsert([row]);
    } catch (err) {
      row.error = `processing failed: ${(err as Error).message}`.slice(0, 500);
      stores.replies.upsert([row]);
      report.errors.push({ replyId: msg.id, error: row.error });
    }
  }
  return report;
}

/** The mailbox that answers: the one that received the reply, else the prospect's sequence mailbox, else the first configured. */
function replyMailbox(config: EngineConfig, msg: InboundMessage, p: ProspectRow): Mailbox {
  const m = findMailbox(config, msg.mailbox) ?? findMailbox(config, p.mailbox) ?? config.mailboxes[0];
  if (!m) throw new Error("config.mailboxes is empty: no mailbox to draft the reply from");
  return m;
}

/** In-Reply-To and References from the received message's Message-ID, when the source gave headers. */
function threadHeaders(msg: InboundMessage): Record<string, string> {
  const id = msg.headers["message-id"]?.trim();
  if (!id) return {};
  const refs = [msg.headers["references"]?.trim(), id].filter(Boolean).join(" ");
  return { "In-Reply-To": id, References: refs };
}
