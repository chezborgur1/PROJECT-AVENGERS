import fs from "node:fs";
import path from "node:path";
import type { EngineConfig } from "../config.ts";
import { LEAD_STAGES, type LeadRow, type TouchRow } from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { isHardBounce, mailboxHealth } from "../sending/health.ts";
import { addDays, isoWeekLabel } from "../util/dates.ts";

// The weekly report: the plan's success metrics for the 7 days ending
// `today` (emails sent, reply rate, qualified sellers, listings signed),
// deliverability health per mailbox, and alarms a person must act on, plus
// the cumulative funnel since the engine started. Written to
// data/reports/<ISO week>.md.
//
// Definitions, so the numbers mean the same thing every week:
// - sent / drafted: outreach touches whose status reached sent / drafted in
//   the window (dated by updated_at, then created_at, then planned_for).
// - delivered: outreach sent or drafted in the window, the guardrail's own
//   definition of a send (src/sending/health.ts). In draft mode a person
//   sends each draft from Gmail and the engine rarely hears back, so "sent"
//   alone would leave every rate at zero and the bounce alarm silent.
// - reply rate: human replies received in the window over outreach
//   delivered in the window. Bounces and auto-replies are not human replies.
// - bounces: hard bounces; the bounce rate (and the opt-out rate) is over
//   delivered, the same basis as the guardrail (docs/research/deliverability.md).
// - qualified / meetings / listings: leads at that stage (or later) whose
//   row changed in the window. leads.csv keeps no stage history, so a lead
//   edited again in a later week can count again; the cumulative funnel is
//   the stable number.

/** The week's metrics, per-mailbox health and alarms. */
export interface WeeklyMetrics {
  week: string;
  sent: number;
  drafted: number;
  newProspectsContacted: number;
  humanReplies: number;
  replyRate: number;
  positiveReplies: number;
  optOuts: number;
  bounces: number;
  bounceRate: number;
  complaints: number;
  qualified: number;
  handedOff: number;
  meetings: number;
  listingsSigned: number;
  byMailbox: Record<string, { sent: number; bounces: number; paused: boolean }>;
  alarms: string[];
}

const NON_HUMAN = new Set(["bounce", "auto_reply", ""]);
const QUALIFIED_OR_LATER = new Set<LeadRow["stage"]>(["qualified", "warm", "handed_off", "meeting", "listed"]);

const day = (s: string) => s.slice(0, 10);
const touchDate = (t: TouchRow) => day(t.updated_at || t.created_at || t.planned_for);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Build the weekly report for the 7 days ending `today` and write it to data/reports/<week>.md. */
export function weeklyReport(stores: Stores, config: EngineConfig, opts: { today: string }): { metrics: WeeklyMetrics; markdown: string; file: string } {
  const from = addDays(opts.today, -6);
  const inWindow = (d: string) => d !== "" && d >= from && d <= opts.today;

  const loads = {
    prospects: stores.prospects.load(),
    touches: stores.touches.load(),
    replies: stores.replies.load(),
    leads: stores.leads.load(),
    suppression: stores.suppression.load(),
    mailboxLog: stores.mailboxLog.load(),
  };
  const prospects = loads.prospects.rows;
  const touches = loads.touches.rows;
  const replies = loads.replies.rows;
  const leads = loads.leads.rows;

  const outreach = touches.filter((t) => t.kind === "outreach");
  const weekOutreach = outreach.filter((t) => inWindow(touchDate(t)));
  const sentRows = weekOutreach.filter((t) => t.status === "sent");
  const sent = sentRows.length;
  const drafted = weekOutreach.filter((t) => t.status === "drafted").length;
  const newProspectsContacted = new Set(weekOutreach.filter((t) => t.step === 1 && (t.status === "sent" || t.status === "drafted")).map((t) => t.prospect_id)).size;

  const weekReplies = replies.filter((r) => inWindow(day(r.received_at)));
  const humanReplies = weekReplies.filter((r) => !NON_HUMAN.has(r.class)).length;
  const positiveReplies = weekReplies.filter((r) => r.class === "interested").length;
  const optOuts = weekReplies.filter((r) => r.class === "unsubscribe" || r.opt_out === "Y").length;
  const hardBounces = weekReplies.filter(isHardBounce);
  const bounces = hardBounces.length;
  const complaints = weekReplies.filter((r) => r.class === "complaint").length;
  // The guardrail's denominator: sent or drafted (see the header).
  const delivered = sent + drafted;
  const replyRate = delivered ? humanReplies / delivered : 0;
  const bounceRate = delivered ? bounces / delivered : 0;

  const changed = (l: LeadRow) => inWindow(day(l.updated_at));
  const qualified = leads.filter((l) => QUALIFIED_OR_LATER.has(l.stage) && changed(l)).length;
  const handedOff = leads.filter((l) => inWindow(day(l.handed_off_at))).length;
  const meetings = leads.filter((l) => l.stage === "meeting" && changed(l)).length;
  const listingsSigned = leads.filter((l) => l.stage === "listed" && changed(l)).length;

  // Per mailbox: sends, hard bounces, and whether it is paused today. The pause comes from the
  // sender's own circuit breakers (mailboxHealth, src/sending/health.ts), so the report and the
  // planner never disagree; like the planner, an uncleared complaint on one mailbox pauses all.
  const byMailbox: WeeklyMetrics["byMailbox"] = {};
  const pauseReasons: Record<string, string[]> = {};
  const mailboxNames = new Set([...config.mailboxes.map((m) => m.email.toLowerCase()), ...weekOutreach.map((t) => t.mailbox.toLowerCase()).filter(Boolean)]);
  const health = new Map([...mailboxNames].map((mb) => [mb, mailboxHealth(stores, config, mb, opts.today)]));
  const complained = [...health.values()].filter((h) => h.complaintPause).map((h) => h.mailbox);
  for (const mb of mailboxNames) {
    const cfg = config.mailboxes.find((m) => m.email.toLowerCase() === mb);
    const h = health.get(mb)!;
    const reasons = [
      ...(cfg?.paused ? ["paused in config"] : []),
      ...(h.pause ? h.reasons : []),
      ...(!h.complaintPause && complained.length && config.guardrails.pause_on_complaint ? [`spam complaint on ${complained.join(", ")}`] : []),
    ];
    pauseReasons[mb] = reasons;
    byMailbox[mb] = {
      sent: sentRows.filter((t) => t.mailbox.toLowerCase() === mb).length,
      bounces: hardBounces.filter((r) => r.mailbox.toLowerCase() === mb).length,
      paused: reasons.length > 0,
    };
  }

  const g = config.guardrails;
  const alarms: string[] = [];
  if (!config.licensed_states.length || !config.licensing_signoff.trim()) alarms.push("Sending is blocked: licensed_states is empty or licensing_signoff is blank (docs/COMPLIANCE.md).");
  if (!config.firm.postal_address.trim()) alarms.push("Sending is blocked: firm.postal_address is blank (CAN-SPAM 16 CFR 316.2(p)).");
  if (delivered && bounceRate > g.max_bounce_rate) alarms.push(`Hard bounce rate ${pct(bounceRate)} is above the ${pct(g.max_bounce_rate)} guardrail: check list quality before sending more.`);
  for (const mb of mailboxNames) {
    const perDay = new Map<string, number>();
    for (const r of hardBounces.filter((x) => x.mailbox.toLowerCase() === mb)) perDay.set(day(r.received_at), (perDay.get(day(r.received_at)) ?? 0) + 1);
    for (const [d, n] of perDay) if (n >= g.max_hard_bounces_per_day) alarms.push(`${mb} had ${n} hard bounces on ${d} (limit ${g.max_hard_bounces_per_day} a day).`);
  }
  if (complaints) alarms.push(`${complaints} spam complaint${complaints > 1 ? "s" : ""} this week${g.pause_on_complaint ? ": sending stays paused until a person reviews and clears it" : ""}.`);
  if (delivered && optOuts / delivered > g.max_opt_out_rate) alarms.push(`Opt-out rate ${pct(optOuts / delivered)} is above the ${pct(g.max_opt_out_rate)} guardrail: review targeting and copy.`);
  for (const [mb, h] of Object.entries(byMailbox)) if (h.paused) alarms.push(`${mb} is paused. ${pauseReasons[mb]!.join("; ")}.`);
  const failed = weekOutreach.filter((t) => t.status === "failed").length + touches.filter((t) => t.kind === "reply" && t.status === "failed" && inWindow(touchDate(t))).length;
  if (failed) alarms.push(`${failed} message${failed > 1 ? "s" : ""} failed to deliver this week (touches.csv status failed).`);
  const replyErrors = weekReplies.filter((r) => r.error.trim()).length;
  if (replyErrors) alarms.push(`${replyErrors} repl${replyErrors > 1 ? "ies" : "y"} could not be processed (replies.csv error column).`);
  if (drafted && !sent) alarms.push(`${drafted} outreach draft${drafted > 1 ? "s are" : " is"} waiting: send them and record each with "lead-engine record".`);
  for (const [name, l] of Object.entries(loads)) if (l.invalid.length) alarms.push(`${name} has ${l.invalid.length} invalid row${l.invalid.length > 1 ? "s" : ""} (first at line ${l.invalid[0]!.line}).`);
  const pastWarmup = config.mailboxes.some((m) => !m.paused && addDays(m.warmup_started, config.sending.warmup_weeks * 7) <= opts.today);
  if (!sent && !drafted && pastWarmup && config.licensed_states.length) alarms.push("No outreach was sent or drafted in the last 7 days although a mailbox is past warm-up.");

  const metrics: WeeklyMetrics = {
    week: isoWeekLabel(opts.today),
    sent,
    drafted,
    newProspectsContacted,
    humanReplies,
    replyRate,
    positiveReplies,
    optOuts,
    bounces,
    bounceRate,
    complaints,
    qualified,
    handedOff,
    meetings,
    listingsSigned,
    byMailbox,
    alarms,
  };

  // Cumulative funnel since the start.
  const everContacted = new Set(outreach.filter((t) => t.status === "sent" || t.status === "drafted").map((t) => t.prospect_id)).size;
  const everSent = outreach.filter((t) => t.status === "sent").length;
  const everDelivered = outreach.filter((t) => t.status === "sent" || t.status === "drafted").length;
  const everHuman = replies.filter((r) => !NON_HUMAN.has(r.class)).length;
  const stageCount = (s: LeadRow["stage"]) => leads.filter((l) => l.stage === s).length;
  const funnel: [string, string][] = [
    ["Prospects on file", String(prospects.length)],
    ["Scored", String(prospects.filter((p) => p.score !== undefined).length)],
    ["Contacted (sent or drafted)", String(everContacted)],
    ["Outreach emails sent", String(everSent)],
    ["Human replies", String(everHuman)],
    ["Reply rate (all time, over sent or drafted)", everDelivered ? pct(everHuman / everDelivered) : "n/a"],
    ["Interested replies", String(replies.filter((r) => r.class === "interested").length)],
    ["Leads", String(leads.length)],
    ["Qualified or later", String(leads.filter((l) => QUALIFIED_OR_LATER.has(l.stage)).length)],
    ["Handed off or later", String(leads.filter((l) => ["handed_off", "meeting", "listed"].includes(l.stage)).length)],
    ["Meetings or later", String(stageCount("meeting") + stageCount("listed"))],
    ["Listings signed", String(stageCount("listed"))],
    ["Suppressed addresses (permanent)", String(loads.suppression.rows.length)],
  ];

  const md: string[] = [];
  md.push(`# Weekly report ${metrics.week}`, "");
  md.push(`The 7 days from ${from} to ${opts.today}.`, "");
  md.push("## Alarms", "");
  md.push(...(alarms.length ? alarms.map((a) => `- ${a}`) : ["- None."]), "");
  md.push("## This week", "", "| Metric | Value |", "|---|---|");
  const rows: [string, string][] = [
    ["Outreach emails sent", String(sent)],
    ["Outreach drafts created", String(drafted)],
    ["New prospects contacted", String(newProspectsContacted)],
    ["Human replies", String(humanReplies)],
    ["Reply rate (over sent or drafted)", delivered ? pct(replyRate) : "n/a"],
    ["Interested replies", String(positiveReplies)],
    ["Opt-outs", String(optOuts)],
    ["Hard bounces", String(bounces)],
    ["Hard bounce rate (over sent or drafted)", delivered ? pct(bounceRate) : "n/a"],
    ["Soft bounces", String(weekReplies.filter((r) => r.class === "bounce" && r.bounce_type === "soft").length)],
    ["Spam complaints", String(complaints)],
    ["Qualified sellers", String(qualified)],
    ["Handed off to the advisor", String(handedOff)],
    ["Meetings", String(meetings)],
    ["Listings signed", String(listingsSigned)],
  ];
  for (const [k, v] of rows) md.push(`| ${k} | ${v} |`);
  md.push("", "## Mailboxes", "", "| Mailbox | Sent | Hard bounces | Paused |", "|---|---|---|---|");
  for (const [mb, h] of Object.entries(byMailbox)) md.push(`| ${mb} | ${h.sent} | ${h.bounces} | ${h.paused ? "Yes" : "No"} |`);
  md.push("", "## Funnel to date", "", "| Stage | Count |", "|---|---|");
  for (const [k, v] of funnel) md.push(`| ${k} | ${v} |`);
  md.push("", "## Leads by stage", "", "| Stage | Count |", "|---|---|");
  for (const s of LEAD_STAGES) md.push(`| ${s} | ${stageCount(s)} |`);
  md.push("");
  const markdown = md.join("\n");

  fs.mkdirSync(stores.dir.reports, { recursive: true });
  const file = path.join(stores.dir.reports, `${metrics.week}.md`);
  fs.writeFileSync(file, markdown);
  return { metrics, markdown, file };
}
