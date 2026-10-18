import { mailboxDomain, type EngineConfig, type Mailbox } from "../config.ts";
import { normalizeEmail, type ProspectRow, type ReplyRow, type TouchRow } from "../domain/schema.ts";
import { isSendableVerification } from "../contacts/verify.ts";
import { jurisdictionBlock } from "../compliance/jurisdiction.ts";
import { Suppression } from "../compliance/suppression.ts";
import type { Stores } from "../store/index.ts";
import { isoWeekday, usFederalHolidays } from "../util/dates.ts";
import { healthFrom, touchDay, type MailboxHealth } from "./health.ts";
import { mailboxDailyCap } from "./ramp.ts";

// Today's sending plan: which prospects get which step from which mailbox.
// The planner only reads; src/sending/run.ts renders, gates and delivers.
//
// Order of work (DESIGN.md module D):
// 1. Not a send day (weekday outside `sending.send_days`, a configured
//    holiday, or a US federal holiday, which covers Veterans Day on
//    Wed 2026-11-11 and Thanksgiving week: docs/research/deliverability.md
//    section 5 and the verification's missed item 5) -> empty plan.
// 2. Follow-ups first, so people already written to hear back on time:
//    in_sequence, next_touch_date due, step under 3, no human reply, the
//    previous step recorded as drafted or sent, and always the same mailbox
//    as step 1 (one thread, one sender).
// 3. New step-1 sends: status scored, tier in `send_tiers`, a sendable
//    verification, not suppressed, jurisdiction clear, best score first;
//    catch-all addresses capped at `max_catch_all_share` of the day's new
//    sends (deliverability.md section 3: catch-alls often hard-bounce, so
//    pilot a small share); each goes to the least-loaded healthy mailbox.
//
// Caps: each mailbox gets its ramp cap (src/sending/ramp.ts) minus the
// outreach already planned, drafted or sent today; each sending domain gets
// `max_per_domain_per_day` across its mailboxes, far below Gmail's 5,000 a
// day bulk-sender line, which once crossed is permanent (deliverability.md
// section 1). Drafted replies to owners are a person's correspondence and
// do not count against the cold caps. A paused mailbox gets 0.

/** One message the plan calls for. */
export interface PlannedMessage {
  prospectId: string;
  step: 1 | 2 | 3;
  mailbox: string;
}

/** A day's plan, with every skip and pause explained. */
export interface DayPlan {
  date: string;
  sendDay: boolean;
  items: PlannedMessage[];
  skipped: { prospectId: string; reason: string }[];
  /** Per mailbox, plus "domain:<sending domain>" rows: the day's cap and what it will have used once this plan goes out. */
  caps: Record<string, { cap: number; used: number }>;
  /** Mailboxes that send nothing today, or (prefixed "new sends only:") no new step-1 emails, with the reasons. */
  paused: Record<string, string[]>;
  /** Why today is not a send day, when it is not. */
  reason?: string;
}

/** Every no-send date for the years around `today`: configured holidays plus US federal holidays. */
export function noSendDates(config: EngineConfig, today: string): string[] {
  const year = Number(today.slice(0, 4));
  return [...new Set([...config.sending.holidays, ...usFederalHolidays(year - 1), ...usFederalHolidays(year), ...usFederalHolidays(year + 1)])].sort();
}

/** Why `date` is not a send day, or undefined when it is. */
export function notSendDayReason(config: EngineConfig, date: string): string | undefined {
  const weekday = isoWeekday(date);
  if (!config.sending.send_days.includes(weekday)) return `weekday ${weekday} is not in sending.send_days (${config.sending.send_days.join(", ")})`;
  if (config.sending.holidays.includes(date)) return `${date} is in sending.holidays`;
  // The next year too: New Year's Day on a Saturday is observed on Friday December 31 (REVIEW_R1.md item 6).
  const year = Number(date.slice(0, 4));
  if ([...usFederalHolidays(year), ...usFederalHolidays(year + 1)].includes(date)) return `${date} is a US federal holiday`;
  return undefined;
}

/** True when a reply stops the sequence: any human reply. Auto-replies and soft bounces do not. */
export function stopsSequence(r: Pick<ReplyRow, "class" | "bounce_type">): boolean {
  if (r.class === "auto_reply") return false;
  if (r.class === "bounce" && r.bounce_type === "soft") return false;
  return true;
}

/** Outreach touches that occupy a slot: everything except failed and cancelled. */
function occupies(t: TouchRow): boolean {
  return t.kind === "outreach" && t.status !== "failed" && t.status !== "cancelled";
}

interface Box {
  mailbox: Mailbox;
  key: string;
  domain: string;
  cap: number;
  used: number;
  health: MailboxHealth;
  paused: string[];
  newPaused: string[];
}

/** Build today's plan from the stores. Reads only. */
export function planDay(stores: Stores, config: EngineConfig, opts: { today: string }): DayPlan {
  const { today } = opts;
  const plan: DayPlan = { date: today, sendDay: true, items: [], skipped: [], caps: {}, paused: {} };
  const reason = notSendDayReason(config, today);
  if (reason) return { ...plan, sendDay: false, reason };

  const prospects = stores.prospects.rows();
  const touches = stores.touches.rows();
  const replies = stores.replies.rows();
  const log = stores.mailboxLog.rows();
  const suppression = new Suppression(stores.suppression);

  // Mailboxes: health, caps, pauses.
  const boxes: Box[] = config.mailboxes.map((m) => {
    const key = normalizeEmail(m.email);
    const health = healthFrom({ touches, replies, log }, config, key, today);
    const paused: string[] = [];
    if (m.paused) paused.push("paused in config");
    if (health.pause) paused.push(...health.reasons);
    const newPaused = !health.pause && health.pauseNew ? health.reasons : [];
    const used = touches.filter((t) => occupies(t) && normalizeEmail(t.mailbox) === key && touchDay(t) === today).length;
    return { mailbox: m, key, domain: mailboxDomain(m.email), cap: 0, used, health, paused, newPaused };
  });
  // A spam complaint is a reputation event for the whole sending operation: pause everything until a person clears it.
  const complained = boxes.filter((b) => b.health.complaintPause);
  if (complained.length && config.guardrails.pause_on_complaint) {
    for (const b of boxes) if (!b.health.complaintPause) b.paused.push(`spam complaint on ${complained.map((c) => c.key).join(", ")}: every mailbox pauses until a person clears it`);
  }
  for (const b of boxes) {
    b.cap = b.paused.length ? 0 : mailboxDailyCap(b.mailbox, config, today);
    if (b.paused.length) plan.paused[b.mailbox.email] = b.paused;
    else if (b.newPaused.length) plan.paused[b.mailbox.email] = b.newPaused.map((r) => `new sends only: ${r}`);
  }
  const domains = new Map<string, { cap: number; used: number }>();
  for (const d of new Set(boxes.map((b) => b.domain))) {
    const used = touches.filter((t) => occupies(t) && mailboxDomain(t.mailbox) === d && touchDay(t) === today).length;
    domains.set(d, { cap: config.sending.max_per_domain_per_day, used });
  }
  const room = (b: Box) => Math.min(b.cap - b.used, domains.get(b.domain)!.cap - domains.get(b.domain)!.used);
  const take = (b: Box) => {
    b.used++;
    domains.get(b.domain)!.used++;
  };

  // Touch and reply lookups by prospect.
  const touchesBy = new Map<string, TouchRow[]>();
  for (const t of touches) if (t.kind === "outreach") touchesBy.set(t.prospect_id, [...(touchesBy.get(t.prospect_id) ?? []), t]);
  const stoppedBy = new Map<string, ReplyRow>();
  for (const r of replies) if (r.prospect_id && stopsSequence(r) && !stoppedBy.has(r.prospect_id)) stoppedBy.set(r.prospect_id, r);
  const byScore = (a: ProspectRow, b: ProspectRow) => (b.score ?? 0) - (a.score ?? 0) || a.prospect_id.localeCompare(b.prospect_id);

  // 1. Follow-ups.
  const due = prospects
    .filter((p) => p.status === "in_sequence" && p.next_touch_date !== "" && p.next_touch_date <= today && (p.sequence_step === 1 || p.sequence_step === 2))
    .sort((a, b) => a.next_touch_date.localeCompare(b.next_touch_date) || byScore(a, b));
  for (const p of due) {
    const skip = (why: string) => plan.skipped.push({ prospectId: p.prospect_id, reason: why });
    const step = ((p.sequence_step ?? 0) + 1) as 2 | 3;
    const reply = stoppedBy.get(p.prospect_id);
    if (reply) {
      skip(`replied (${reply.class || "unclassified"} reply ${reply.reply_id}): no follow-up`);
      continue;
    }
    // A touch for this step already exists (a rerun after a partial write, or a record that came in
    // late): never plan the same step twice (REVIEW_R1.md item 1). runSend's reconcile step moves the
    // prospect forward to match its touches.
    const existingStep = (touchesBy.get(p.prospect_id) ?? []).find((t) => t.step === step && occupies(t));
    if (existingStep) {
      skip(`step ${step} already has touch ${existingStep.touch_id} (${existingStep.status}): not planned again`);
      continue;
    }
    const prev = (touchesBy.get(p.prospect_id) ?? []).filter((t) => t.step === step - 1 && occupies(t)).at(-1);
    if (!prev || (prev.status !== "drafted" && prev.status !== "sent")) {
      skip(`step ${step - 1} is not yet recorded as drafted or sent${prev ? ` (${prev.touch_id} is ${prev.status})` : ""}: step ${step} waits`);
      continue;
    }
    const wanted = normalizeEmail(p.mailbox || prev.mailbox);
    const box = boxes.find((b) => b.key === wanted);
    if (!box) {
      skip(`step 1 went from ${wanted || "an unknown mailbox"}, which is not in config.mailboxes: follow-ups only go from the same mailbox`);
      continue;
    }
    if (box.paused.length) {
      skip(`mailbox ${box.mailbox.email} is paused: ${box.paused.join("; ")}`);
      continue;
    }
    if (room(box) <= 0) {
      skip(`mailbox ${box.mailbox.email} or its domain is at today's cap: step ${step} waits for the next send day`);
      continue;
    }
    take(box);
    plan.items.push({ prospectId: p.prospect_id, step, mailbox: box.mailbox.email });
  }

  // 2. New step-1 sends.
  const candidates: ProspectRow[] = [];
  for (const p of prospects.filter((x) => x.status === "scored" && x.tier !== "" && config.targeting.send_tiers.includes(x.tier)).sort(byScore)) {
    const skip = (why: string) => plan.skipped.push({ prospectId: p.prospect_id, reason: why });
    if ((touchesBy.get(p.prospect_id) ?? []).some(occupies)) {
      skip("already has an outreach touch");
      continue;
    }
    if (!p.email.trim()) {
      skip("no email address");
      continue;
    }
    if (!isSendableVerification(p.email_verification)) {
      skip(`email verification "${p.email_verification}" is not sendable`);
      continue;
    }
    const hit = suppression.check(p.email, p.prospect_id);
    if (hit) {
      skip(`suppressed: ${hit.value} (${hit.reason})`);
      continue;
    }
    const block = jurisdictionBlock(p, p.email, config);
    if (block) {
      skip(`jurisdiction: ${block}`);
      continue;
    }
    candidates.push(p);
  }
  const open = () => boxes.filter((b) => !b.paused.length && !b.newPaused.length && room(b) > 0);
  // Slots left today: per domain, the smaller of the domain's room and its mailboxes' room.
  let capacity = 0;
  for (const [d, dc] of domains) {
    const mbRoom = boxes.filter((b) => b.domain === d && !b.paused.length && !b.newPaused.length).reduce((n, b) => n + Math.max(0, b.cap - b.used), 0);
    capacity += Math.max(0, Math.min(dc.cap - dc.used, mbRoom));
  }
  const nonCatch = candidates.filter((p) => p.email_verification !== "catch_all");
  const catchAll = candidates.filter((p) => p.email_verification === "catch_all");
  const share = config.sending.max_catch_all_share;
  const nNon = Math.min(nonCatch.length, capacity);
  // c <= share * (nNon + c)  =>  c <= share * nNon / (1 - share)
  const catchLimit = share >= 1 ? capacity - nNon : Math.floor((share * nNon) / (1 - share) + 1e-9);
  const nCatch = Math.max(0, Math.min(catchAll.length, capacity - nNon, catchLimit));
  const chosen = new Set([...nonCatch.slice(0, nNon), ...catchAll.slice(0, nCatch)].map((p) => p.prospect_id));
  for (const p of candidates) {
    if (!chosen.has(p.prospect_id)) {
      const catchCapped = p.email_verification === "catch_all" && capacity - nNon > nCatch;
      plan.skipped.push({
        prospectId: p.prospect_id,
        reason: catchCapped ? `catch-all share cap (${Math.round(share * 100)}% of new sends) reached today` : capacity === 0 && !open().length ? "no healthy mailbox can take new step-1 sends today" : "no sending capacity left today",
      });
      continue;
    }
    // Least-loaded healthy mailbox; ties go to config order.
    const box = open().sort((a, b) => a.used - b.used)[0];
    if (!box) {
      plan.skipped.push({ prospectId: p.prospect_id, reason: "no sending capacity left today" });
      continue;
    }
    take(box);
    plan.items.push({ prospectId: p.prospect_id, step: 1, mailbox: box.mailbox.email });
  }

  for (const b of boxes) plan.caps[b.mailbox.email] = { cap: b.cap, used: b.used };
  for (const [d, dc] of domains) plan.caps[`domain:${d}`] = { cap: dc.cap, used: dc.used };
  return plan;
}
