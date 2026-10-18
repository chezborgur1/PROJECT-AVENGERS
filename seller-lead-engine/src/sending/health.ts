import type { EngineConfig } from "../config.ts";
import { normalizeEmail, type MailboxLogRow, type ReplyRow, type TouchRow } from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { addDays } from "../util/dates.ts";

// Mailbox circuit breakers, computed from what the engine already records:
// outreach touches (what went out) and replies.csv rows written by the
// inbox processor (class bounce / complaint / unsubscribe, bounce_type).
// Nothing here imports the replies module; the CSV is the contract.
//
// Rules (docs/research/deliverability.md section 6, "Hard caps and circuit
// breakers", and config.guardrails):
// - hard bounces at or above `max_bounce_rate` of sends over the last
//   `bounce_window_days` pause the mailbox (bounces under 2% over 14 days
//   is the vendor benchmark, section 3). One bounce in the first few dozen
//   sends is noise rather than a list problem, so the rate rule needs at
//   least MIN_BOUNCES_FOR_RATE bounces; the per-day rule below catches a
//   bad batch on its own;
// - `max_hard_bounces_per_day` hard bounces on any one day in the window
//   pause it;
// - any "550 5.7.515" or "5.7.509" bounce (Microsoft and Gmail
//   authentication rejections, section 1) pauses it;
// - any spam complaint pauses it, with no time limit, until a person clears
//   it (`guardrails.pause_on_complaint`); the planner then pauses every
//   mailbox, because a complaint is a domain-level reputation event;
// - opt-outs above `max_opt_out_rate` of the last 100 sends pause new
//   step-1 sends only (follow-ups to people already written to continue),
//   once there are MIN_SENDS_FOR_OPT_OUT_RATE sends to judge by.
//
// Sends are outreach touches with status "sent" or "drafted". In draft mode
// a person sends each draft from Gmail and the engine never hears back, so
// counting drafts is the only way the bounce rate has a denominator; the
// rate is then slightly low if some drafts were never sent, which the
// minimum-bounce rule does not rely on.
//
// Clearing a pause: a person appends a mailbox_log.csv row for the mailbox
// with paused "N" and a pause_reason starting with "cleared" (for example
// "cleared: Frank reviewed the complaint from P-00012"). Bounces, complaints
// and opt-outs received on or before that date no longer trip a breaker;
// they still count in the totals. A blocked hard bounce has already made
// the address dnc, so clearing never re-opens a suppressed address.

/** At least this many hard bounces before the bounce-rate rule can pause a mailbox. */
export const MIN_BOUNCES_FOR_RATE = 2;
/** At least this many recent sends before the opt-out-rate rule can pause new sends. */
export const MIN_SENDS_FOR_OPT_OUT_RATE = 20;
/** The opt-out rule looks at this many most recent sends (config.guardrails.max_opt_out_rate). */
export const OPT_OUT_SEND_WINDOW = 100;

/** One mailbox's guardrail picture today. */
export interface MailboxHealth {
  mailbox: string;
  /** Outreach sent or drafted in the bounce window. */
  sends: number;
  /** Hard bounces received in the bounce window. */
  hardBounces: number;
  bounceRate: number;
  /** Spam complaints not yet cleared by a person (any age). */
  complaints: number;
  /** Opt-outs received since the oldest of the last 100 sends. */
  optOuts: number;
  /** True when the mailbox sends nothing today. */
  pause: boolean;
  reasons: string[];
  /** Opt-out share of the last 100 sends. */
  optOutRate: number;
  /** True when new step-1 sends stop but follow-ups may continue (opt-out rule). */
  pauseNew: boolean;
  /** True when an uncleared complaint caused the pause (the planner pauses every mailbox). */
  complaintPause: boolean;
  /** The date of the latest "cleared" log row, or "". */
  clearedThrough: string;
}

/** The date part of a stamp or date cell. */
export const dayOf = (stamp: string): string => stamp.slice(0, 10);

/** The day a touch counts for: the day it was planned for, else the day it was created. */
export function touchDay(t: Pick<TouchRow, "planned_for" | "created_at">): string {
  return t.planned_for || dayOf(t.created_at);
}

/** True for a replies.csv bounce row that counts as hard. A bounce with no type counts as hard: err toward pausing. */
export function isHardBounce(r: Pick<ReplyRow, "class" | "bounce_type">): boolean {
  return r.class === "bounce" && r.bounce_type !== "soft";
}

/** True for an opt-out reply. */
export function isOptOut(r: Pick<ReplyRow, "class" | "opt_out">): boolean {
  return r.class === "unsubscribe" || r.opt_out === "Y";
}

/** True for a mailbox_log row a person wrote to clear a pause. */
export function isClearanceRow(r: Pick<MailboxLogRow, "paused" | "pause_reason">): boolean {
  return r.paused === "N" && /^\s*cleared\b/i.test(r.pause_reason);
}

const AUTH_REJECTION = /\b5\.7\.(515|509)\b/;

/** Guardrail counters and pause decision for one mailbox, from touches and replies in the guardrail windows. */
export function mailboxHealth(stores: Stores, config: EngineConfig, mailbox: string, today: string): MailboxHealth {
  return healthFrom(
    { touches: stores.touches.rows(), replies: stores.replies.rows(), log: stores.mailboxLog.rows() },
    config,
    mailbox,
    today,
  );
}

/** The same computation over rows already loaded (the planner loads once for every mailbox). */
export function healthFrom(data: { touches: TouchRow[]; replies: ReplyRow[]; log: MailboxLogRow[] }, config: EngineConfig, mailbox: string, today: string): MailboxHealth {
  const g = config.guardrails;
  const mb = normalizeEmail(mailbox);
  const from = addDays(today, -(Math.max(1, g.bounce_window_days) - 1));
  const inWindow = (d: string) => d !== "" && d >= from && d <= today;

  const clearedThrough =
    data.log
      .filter((r) => normalizeEmail(r.mailbox) === mb && r.date !== "" && r.date <= today && isClearanceRow(r))
      .map((r) => r.date)
      .sort()
      .at(-1) ?? "";
  const uncleared = (d: string) => d !== "" && d <= today && (!clearedThrough || d > clearedThrough);

  const sendsAll = data.touches
    .filter((t) => t.kind === "outreach" && normalizeEmail(t.mailbox) === mb && (t.status === "sent" || t.status === "drafted"))
    .map(touchDay)
    .filter((d) => d !== "" && d <= today)
    .sort();
  const sends = sendsAll.filter(inWindow).length;

  const mine = data.replies.filter((r) => normalizeEmail(r.mailbox) === mb);
  const hard = mine.filter((r) => isHardBounce(r) && inWindow(dayOf(r.received_at)));
  const hardBounces = hard.length;
  const bounceRate = sends ? hardBounces / sends : hardBounces ? 1 : 0;

  const reasons: string[] = [];
  let pause = false;
  let complaintPause = false;

  const liveHard = hard.filter((r) => uncleared(dayOf(r.received_at)));
  const liveRate = sends ? liveHard.length / sends : liveHard.length ? 1 : 0;
  if (liveHard.length >= MIN_BOUNCES_FOR_RATE && liveRate >= g.max_bounce_rate) {
    pause = true;
    reasons.push(`hard bounce rate ${pct(liveRate)} over ${g.bounce_window_days} days (${liveHard.length} of ${sends} sends) is at or above ${pct(g.max_bounce_rate)}`);
  }
  const perDay = new Map<string, number>();
  for (const r of liveHard) perDay.set(dayOf(r.received_at), (perDay.get(dayOf(r.received_at)) ?? 0) + 1);
  for (const [d, n] of [...perDay].sort()) {
    if (n >= g.max_hard_bounces_per_day) {
      pause = true;
      reasons.push(`${n} hard bounces on ${d} (limit ${g.max_hard_bounces_per_day} a day)`);
    }
  }
  const auth = mine.filter((r) => r.class === "bounce" && inWindow(dayOf(r.received_at)) && uncleared(dayOf(r.received_at)) && AUTH_REJECTION.test(r.snippet));
  if (auth.length) {
    pause = true;
    reasons.push(`authentication rejection bounce (${auth[0]!.snippet.match(AUTH_REJECTION)![0]}) on ${dayOf(auth[0]!.received_at)}: check SPF, DKIM and DMARC`);
  }

  const complaintRows = mine.filter((r) => r.class === "complaint" && uncleared(dayOf(r.received_at)));
  const complaints = complaintRows.length;
  if (complaints && g.pause_on_complaint) {
    pause = true;
    complaintPause = true;
    reasons.push(`${complaints} spam complaint${complaints > 1 ? "s" : ""} (latest ${dayOf(complaintRows.map((r) => r.received_at).sort().at(-1)!)}): paused until a person clears it in mailbox_log.csv`);
  }

  const recent = sendsAll.slice(-OPT_OUT_SEND_WINDOW);
  const since = recent[0] ?? today;
  const optOutRows = mine.filter((r) => isOptOut(r) && dayOf(r.received_at) >= since && dayOf(r.received_at) <= today);
  const optOuts = optOutRows.length;
  const optOutRate = recent.length ? optOuts / recent.length : 0;
  const liveOptOuts = optOutRows.filter((r) => uncleared(dayOf(r.received_at))).length;
  let pauseNew = false;
  if (recent.length >= MIN_SENDS_FOR_OPT_OUT_RATE && liveOptOuts / recent.length > g.max_opt_out_rate) {
    pauseNew = true;
    reasons.push(`opt-out rate ${pct(liveOptOuts / recent.length)} over the last ${recent.length} sends is above ${pct(g.max_opt_out_rate)}: new step-1 sends stop, follow-ups continue`);
  }
  if (pause) pauseNew = true;

  return { mailbox: mb, sends, hardBounces, bounceRate, complaints, optOuts, pause, reasons, optOutRate, pauseNew, complaintPause, clearedThrough };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
