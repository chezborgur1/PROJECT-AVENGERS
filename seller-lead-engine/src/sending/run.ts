import crypto from "node:crypto";
import { mailboxDomain, type EngineConfig } from "../config.ts";
import { normalizeEmail, type MailboxLogRow, type ProspectRow, type TouchRow } from "../domain/schema.ts";
import { adNotice, buildFooter, listUnsubscribeHeaders } from "../compliance/footer.ts";
import { assertSendable, ComplianceError } from "../compliance/gate.ts";
import { findMailbox } from "../compliance/lint.ts";
import { Suppression } from "../compliance/suppression.ts";
import { renderStep } from "../outreach/templates.ts";
import type { Stores } from "../store/index.ts";
import { idAllocator } from "../store/csvTable.ts";
import { addBusinessDays, isoStamp } from "../util/dates.ts";
import { dayOf, healthFrom, isClearanceRow, isHardBounce, isOptOut, touchDay } from "./health.ts";
import { messageIdFor } from "./mime.ts";
import { noSendDates, planDay, stopsSequence, type DayPlan } from "./planner.ts";
import type { OutboxMessage, Transport } from "./transports.ts";

// The daily send: plan, render, add the legal text, gate, record, deliver.
//
//   planDay -> renderStep -> body + footer + ad notice, List-Unsubscribe
//   headers -> assertSendable -> touches row "planned" -> transport ->
//   touches row "drafted"/"sent" with ids -> prospect moves along the
//   sequence (status, step, mailbox, dates, thread)
//
// assertSendable runs on every message, immediately before the transport,
// and a ComplianceError stops that message only: the prospect is reported
// as blocked and a "cancelled" touch row keeps the reasons as an audit trail
// (docs/research/compliance.md section 9 rules 1 and 14: suppression is
// checked at send time and every check is logged). The gate never warns
// and sends (DESIGN.md principle 2).
//
// Follow-ups reuse step 1's mailbox and Gmail thread, and carry
// In-Reply-To and References built from the earlier touches' Message-IDs
// (src/sending/mime.ts), so Gmail threads them. Step 2 is due
// `follow_up_gaps[0]` business days after step 1 and step 3
// `follow_up_gaps[1]` after step 2, skipping weekends, configured holidays
// and US federal holidays; the planner then waits for a send day. After
// step 3 the next date is blank, and once its gap passes with no human
// reply the prospect is "completed".
//
// The outbox transport returns no ids (the Claude routine records them
// later with `record`), so its touches stay "planned" until recordDelivery
// moves them on; the planner holds a follow-up until its parent is
// recorded. A dry run plans, renders and gates, writes nothing and calls no
// transport.

/** What a send run did. In a dry run `delivered` lists what would have gone out. */
export interface SendReport {
  date: string;
  mode: "draft" | "send";
  transport: string;
  delivered: { touchId: string; prospectId: string; step: number; mailbox: string }[];
  blocked: { prospectId: string; reasons: string[] }[];
  failed: { prospectId: string; error: string }[];
  plan: DayPlan;
  dryRun: boolean;
  /** Prospects marked completed (step 3 went out and its gap passed with no reply). */
  completed: string[];
}

/** sha256 of a body: touches.csv keeps the hash, the outbox or mailbox keeps the text. */
export function bodyHash(body: string): string {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

/** The business days from one step to the next: gaps[step - 1], else the last gap. */
export function gapAfter(config: EngineConfig, step: number): number {
  const gaps = config.sending.follow_up_gaps;
  return gaps[step - 1] ?? gaps.at(-1) ?? 5;
}

/** Plan, render, gate and deliver today's outreach. */
export async function runSend(stores: Stores, config: EngineConfig, opts: { today: string; now: Date; transport: Transport; templatesDir: string; dryRun?: boolean }): Promise<SendReport> {
  const { today, now, transport } = opts;
  const dryRun = Boolean(opts.dryRun);
  const mode = config.sending.mode;
  const plan = planDay(stores, config, { today });
  const report: SendReport = { date: today, mode, transport: transport.name, delivered: [], blocked: [], failed: [], plan, dryRun, completed: [] };
  const stamp = isoStamp(now);
  const holidays = noSendDates(config, today);

  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  const touches = stores.touches.rows();
  const replies = stores.replies.rows();
  const suppression = new Suppression(stores.suppression);
  const nextTouchId = idAllocator("T", 6, touches.map((t) => t.touch_id));

  // Sequences that ran their course: step 3 out, its gap passed, nobody replied.
  const stopped = new Set(replies.filter((r) => r.prospect_id && stopsSequence(r)).map((r) => r.prospect_id));
  const finished: ProspectRow[] = [];
  for (const p of prospects.values()) {
    if (p.status !== "in_sequence" || p.sequence_step !== 3 || stopped.has(p.prospect_id)) continue;
    const step3 = touches.filter((t) => t.prospect_id === p.prospect_id && t.kind === "outreach" && t.step === 3 && (t.status === "drafted" || t.status === "sent")).at(-1);
    const last = step3 ? touchDay(step3) : dayOf(p.last_touch_at);
    if (last && addBusinessDays(last, gapAfter(config, 3), holidays) <= today) finished.push({ ...p, status: "completed", next_touch_date: "", updated_at: stamp });
  }
  report.completed = finished.map((p) => p.prospect_id);
  if (!dryRun && finished.length) {
    stores.prospects.upsert(finished);
    for (const p of finished) prospects.set(p.prospect_id, p);
  }

  for (const item of plan.items) {
    const p = prospects.get(item.prospectId);
    const mailbox = findMailbox(config, item.mailbox);
    if (!p || !mailbox) {
      report.failed.push({ prospectId: item.prospectId, error: !p ? "prospect not found" : `mailbox ${item.mailbox} not in config` });
      continue;
    }
    let rendered: { subject: string; body: string };
    try {
      rendered = renderStep(item.step, p, config, mailbox, { templatesDir: opts.templatesDir, today });
    } catch (err) {
      report.failed.push({ prospectId: p.prospect_id, error: `render: ${(err as Error).message}` });
      continue;
    }

    const touchId = nextTouchId();
    const domain = mailboxDomain(mailbox.email);
    const earlier = touches
      .filter((t) => t.prospect_id === p.prospect_id && t.kind === "outreach" && (t.step ?? 0) < item.step && (t.status === "drafted" || t.status === "sent"))
      .sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
    const parent = earlier.at(-1);
    const headers: Record<string, string> = { ...listUnsubscribeHeaders(config, mailbox, touchId), "Message-ID": messageIdFor(touchId, now, domain) };
    let threadId: string | undefined;
    let replyToMessageId: string | undefined;
    if (item.step > 1) {
      const ids = earlier.map((t) => messageIdFor(t.touch_id, t.created_at || today, mailboxDomain(t.mailbox) || domain));
      if (ids.length) {
        headers["In-Reply-To"] = ids.at(-1)!;
        headers.References = ids.join(" ");
      }
      threadId = p.thread_id || earlier.map((t) => t.thread_id).filter(Boolean).at(-1) || undefined;
      replyToMessageId = parent?.message_id || undefined;
    }
    const msg: OutboxMessage = {
      touchId,
      prospectId: p.prospect_id,
      kind: "outreach",
      step: item.step,
      mailbox: mailbox.email,
      fromName: `${mailbox.sender_name.trim()}, ${config.firm.name}`,
      to: p.email,
      subject: rendered.subject,
      body: `${rendered.body}\n\n${buildFooter(config, mailbox)}\n\n${adNotice(config)}`,
      headers,
      ...(threadId ? { threadId } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
    };
    const row: TouchRow = {
      touch_id: touchId,
      prospect_id: p.prospect_id,
      kind: "outreach",
      step: item.step,
      mailbox: mailbox.email,
      to_email: normalizeEmail(p.email),
      subject: msg.subject,
      body_sha256: bodyHash(msg.body),
      planned_for: today,
      status: "planned",
      mode,
      message_id: "",
      thread_id: threadId ?? "",
      draft_id: "",
      error: "",
      created_at: stamp,
      updated_at: stamp,
    };

    // The gate: the last call before any transport.
    try {
      assertSendable(msg, { config, suppression, prospect: p });
    } catch (err) {
      if (!(err instanceof ComplianceError)) {
        report.failed.push({ prospectId: p.prospect_id, error: `gate: ${(err as Error).message}` });
        continue;
      }
      report.blocked.push({ prospectId: p.prospect_id, reasons: err.reasons });
      if (!dryRun) stores.touches.append([{ ...row, status: "cancelled", error: `blocked: ${err.reasons.join("; ")}` }]);
      continue;
    }
    if (dryRun) {
      report.delivered.push({ touchId, prospectId: p.prospect_id, step: item.step, mailbox: mailbox.email });
      continue;
    }

    stores.touches.append([row]);
    touches.push(row);
    let result;
    try {
      result = await transport.deliver(msg, mode);
    } catch (err) {
      const error = (err as Error).message;
      Object.assign(row, { status: "failed", error, updated_at: stamp });
      stores.touches.upsert([row]);
      report.failed.push({ prospectId: p.prospect_id, error });
      continue;
    }
    const confirmed = Boolean(result.draftId || result.messageId);
    Object.assign(row, {
      status: confirmed ? (mode === "draft" ? "drafted" : "sent") : "planned",
      message_id: result.messageId ?? "",
      draft_id: result.draftId ?? "",
      thread_id: result.threadId ?? row.thread_id,
      updated_at: stamp,
    } satisfies Partial<TouchRow>);
    stores.touches.upsert([row]);

    const updated: ProspectRow = {
      ...p,
      status: "in_sequence",
      sequence_step: item.step,
      mailbox: mailbox.email,
      last_touch_at: stamp,
      next_touch_date: item.step < 3 ? addBusinessDays(today, gapAfter(config, item.step), holidays) : "",
      thread_id: result.threadId || p.thread_id || row.thread_id,
      updated_at: stamp,
    };
    stores.prospects.upsert([updated]);
    prospects.set(p.prospect_id, updated);
    report.delivered.push({ touchId, prospectId: p.prospect_id, step: item.step, mailbox: mailbox.email });
  }

  if (!dryRun && plan.sendDay) writeMailboxLog(stores, config, plan, today);
  return report;
}

/**
 * One mailbox_log.csv row per mailbox for today: what went out, what came
 * back, and whether the mailbox is paused. A rerun replaces the sender's
 * own row for the day; rows a person or the reply loop wrote are kept.
 */
export function writeMailboxLog(stores: Stores, config: EngineConfig, plan: DayPlan, today: string): void {
  const touches = stores.touches.rows();
  const replies = stores.replies.rows();
  const log = stores.mailboxLog.rows();
  const rows: MailboxLogRow[] = config.mailboxes.map((m) => {
    const mb = normalizeEmail(m.email);
    const todays = touches.filter((t) => t.kind === "outreach" && normalizeEmail(t.mailbox) === mb && touchDay(t) === today);
    const inbound = replies.filter((r) => normalizeEmail(r.mailbox) === mb && dayOf(r.received_at) === today);
    const health = healthFrom({ touches, replies, log }, config, mb, today);
    const reasons = (plan.paused[m.email] ?? []).filter((r) => !r.startsWith("new sends only:"));
    return {
      date: today,
      mailbox: m.email,
      sent: todays.filter((t) => t.status === "sent").length,
      drafted: todays.filter((t) => t.status === "drafted").length,
      hard_bounces: inbound.filter(isHardBounce).length,
      soft_bounces: inbound.filter((r) => r.class === "bounce" && r.bounce_type === "soft").length,
      complaints: inbound.filter((r) => r.class === "complaint").length,
      opt_outs: inbound.filter(isOptOut).length,
      human_replies: inbound.filter((r) => r.class !== "bounce" && r.class !== "auto_reply").length,
      paused: reasons.length || health.pause ? "Y" : "N",
      pause_reason: (reasons.length ? reasons : health.pause ? health.reasons : []).join("; "),
    };
  });
  const mine = new Set(rows.map((r) => normalizeEmail(r.mailbox)));
  // Only the sender's own row for today is replaced (it always carries a sent count). Rows other
  // modules append (a complaint or authentication-bounce note from the reply loop, a person's
  // clearance) are kept, so a rerun never erases why a mailbox paused.
  const ownRow = (r: MailboxLogRow) => r.sent !== undefined && !isClearanceRow(r);
  const keep = stores.mailboxLog.rows().filter((r) => !(r.date === today && mine.has(normalizeEmail(r.mailbox)) && ownRow(r)));
  stores.mailboxLog.replaceAll([...keep, ...rows]);
}

const ORDER: Record<TouchRow["status"], number> = { planned: 0, failed: 1, drafted: 2, sent: 3, cancelled: 4 };

/**
 * Record what happened to a touch after the fact: the Claude routine calls
 * `lead-engine record <touchId> drafted --draft-id ... --thread-id ...`
 * once the connector has made the draft. Status only moves forward
 * (planned -> drafted -> sent; failed may be retried); a sent or cancelled
 * touch is final. A failed outreach touch steps the prospect back, so the
 * planner offers that step again.
 */
export function recordDelivery(stores: Stores, touchId: string, result: { status: "drafted" | "sent" | "failed"; messageId?: string; threadId?: string; draftId?: string; error?: string }, now: Date): void {
  const touch = stores.touches.rows().find((t) => t.touch_id === touchId);
  if (!touch) throw new Error(`Touch ${touchId} not found in touches.csv`);
  if (touch.status === "sent" || touch.status === "cancelled") {
    if (touch.status === result.status) return;
    throw new Error(`Touch ${touchId} is already ${touch.status}; it cannot move to ${result.status}`);
  }
  if (ORDER[result.status] < ORDER[touch.status] && result.status !== "failed") {
    throw new Error(`Touch ${touchId} is ${touch.status}; status only moves forward, not to ${result.status}`);
  }
  if (touch.status === "drafted" && result.status === "failed") throw new Error(`Touch ${touchId} is already drafted; delete the draft by hand instead of recording failed`);
  const stamp = isoStamp(now);
  const updated: TouchRow = {
    ...touch,
    status: result.status,
    message_id: result.messageId ?? touch.message_id,
    thread_id: result.threadId ?? touch.thread_id,
    draft_id: result.draftId ?? touch.draft_id,
    error: result.status === "failed" ? result.error ?? "failed (no detail recorded)" : result.error ?? "",
    updated_at: stamp,
  };
  stores.touches.upsert([updated]);

  if (touch.kind !== "outreach") return;
  const p = stores.prospects.rows().find((x) => x.prospect_id === touch.prospect_id);
  if (!p) return;
  if (result.status === "failed") {
    // The step never reached Gmail: offer it again, unless the prospect has moved on.
    if (p.status !== "in_sequence" || p.sequence_step !== touch.step) return;
    const step = touch.step ?? 1;
    const back: ProspectRow =
      step <= 1
        ? { ...p, status: "scored", sequence_step: undefined, mailbox: "", next_touch_date: "", thread_id: "", updated_at: stamp }
        : { ...p, sequence_step: step - 1, next_touch_date: stamp.slice(0, 10), updated_at: stamp };
    stores.prospects.upsert([back]);
    return;
  }
  if (result.threadId && (!p.thread_id || touch.step === 1)) stores.prospects.upsert([{ ...p, thread_id: result.threadId, updated_at: stamp }]);
}
