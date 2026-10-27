import fs from "node:fs";
import path from "node:path";
import type { EngineConfig } from "../config.ts";
import { normalizeEmail, splitList, type LeadRow, type ProspectRow } from "../domain/schema.ts";
import { staffLabel } from "../contacts/staff.ts";
import { isSendableVerification } from "../contacts/verify.ts";
import { coldWeek, mailboxDailyCap } from "../sending/ramp.ts";
import { mailboxHealth, touchDay } from "../sending/health.ts";
import type { Stores } from "../store/index.ts";

// The dashboard's data: the engine's tables turned into six small JSON row
// files a dashboard page draws from (data/dashboard/). Each file is plain
// row objects with column names a person can read, so the same files open
// in a spreadsheet too.
//
// What it leaves out on purpose: owner names, email addresses and phone
// numbers (the dashboard's files can be read by anyone the dashboard is
// shared with; who to call is in the handoff notes), and the internal age
// estimate (DESIGN.md principle 5: it never leaves scoring).

/** One headline number. */
export interface SummaryRow {
  metric: string;
  label: string;
  value: number;
  definition: string;
}

/** One step of the funnel, in order. */
export interface FunnelRow {
  order: number;
  step: string;
  count: number;
  definition: string;
}

/** One day of activity. */
export interface ActivityRow {
  date: string;
  emails: number;
  replies: number;
  opt_outs: number;
  bounces: number;
}

/** One business. */
export interface ProspectView {
  prospect_id: string;
  business: string;
  city: string;
  vertical: string;
  tier: string;
  score: number | null;
  status: string;
  /** Estimated headcount, for sorting (null when unknown). */
  staff: number | null;
  /** The headcount as shown: "25", or "8+" when counted from a team page (a floor). */
  staff_label: string;
  emails_so_far: number;
  next_email: string;
  why: string;
}

/** One owner in conversation. */
export interface LeadView {
  prospect_id: string;
  business: string;
  city: string;
  stage: string;
  stage_order: number;
  timeline: string;
  motivation: string;
  size: string;
  qual_score: number | null;
  next_action: string;
  updated: string;
}

/** One sending mailbox today. */
export interface MailboxView {
  mailbox: string;
  state: string;
  cap_today: number;
  used_today: number;
  sends_14d: number;
  bounce_rate: number;
  complaints: number;
  reason: string;
}

export interface DashboardData {
  summary: SummaryRow[];
  funnel: FunnelRow[];
  activity: ActivityRow[];
  prospects: ProspectView[];
  leads: LeadView[];
  mailboxes: MailboxView[];
}

/** Prospect statuses in plain words. */
export const STATUS_WORDS: Record<ProspectRow["status"], string> = {
  new: "Not scored yet",
  scored: "Ready to email",
  excluded: "Excluded",
  hold: "On hold",
  in_sequence: "Being emailed",
  replied: "Replied",
  completed: "No reply after 3 emails",
  dnc: "Do not contact",
};

/** Lead stages in plain words, in pipeline order. */
export const STAGE_WORDS: Record<LeadRow["stage"], { label: string; order: number }> = {
  engaged: { label: "Replied", order: 1 },
  qualifying: { label: "Answering questions", order: 2 },
  qualified: { label: "Qualified", order: 3 },
  warm: { label: "Warm: hand off", order: 4 },
  handed_off: { label: "With the advisor", order: 5 },
  meeting: { label: "Meeting booked", order: 6 },
  listed: { label: "Listing signed", order: 7 },
  nurture: { label: "Check back later", order: 8 },
  lost: { label: "Closed", order: 9 },
};

const TIMELINE_WORDS: Record<LeadRow["timeline"], string> = {
  "0-6m": "Within 6 months",
  "6-12m": "6 to 12 months",
  "12-24m": "1 to 2 years",
  "24m+": "Over 2 years",
  unknown: "",
};

const MACHINE = new Set(["bounce", "auto_reply", ""]);
const ACTIVE_LEAD = new Set<LeadRow["stage"]>(["engaged", "qualifying", "qualified", "warm", "handed_off", "meeting", "listed"]);

/**
 * Score reasons fit to show. Those about the owner's likely age, career stage,
 * family or successor (and the officer names they quote) stay internal to
 * scoring (DESIGN.md principle 5); tenure, licences, filings and the like stay.
 */
function reasonsOf(p: ProspectRow): string[] {
  return splitList(p.score_reasons).filter((r) => !/\b(senior|older|age|aged|years old|retire\w*|career|generation|surname|succession|successor|family|son|daughter)\b/i.test(r));
}

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);

/** Build every dataset from the stores, as of `today`. Reads only. */
export function dashboardData(stores: Stores, config: EngineConfig, opts: { today: string }): DashboardData {
  const { today } = opts;
  const prospects = stores.prospects.rows();
  const touches = stores.touches.rows();
  const replies = stores.replies.rows();
  const leads = stores.leads.rows();
  const suppression = stores.suppression.rows();

  const delivered = touches.filter((t) => t.kind === "outreach" && (t.status === "drafted" || t.status === "sent"));
  const emailsBy = new Map<string, number>();
  for (const t of delivered) emailsBy.set(t.prospect_id, (emailsBy.get(t.prospect_id) ?? 0) + 1);
  const human = replies.filter((r) => !MACHINE.has(r.class) && r.prospect_id);
  const replied = new Set(human.map((r) => r.prospect_id));
  const ready = prospects.filter((p) => p.status === "scored" && isSendableVerification(p.email_verification));
  const activeLeads = leads.filter((l) => ACTIVE_LEAD.has(l.stage));
  const atOrPast = (...stages: LeadRow["stage"][]) => leads.filter((l) => stages.includes(l.stage)).length;
  const optOuts = suppression.filter((s) => s.value_type === "email" && (s.reason === "opt_out" || s.reason === "complaint")).length;

  const mailboxes: MailboxView[] = config.mailboxes.map((m) => {
    const h = mailboxHealth(stores, config, m.email, today);
    const used = touches.filter((t) => t.kind === "outreach" && normalizeEmail(t.mailbox) === normalizeEmail(m.email) && touchDay(t) === today && t.status !== "cancelled").length;
    const week = coldWeek(m, config, today);
    const paused = m.paused || h.pause;
    return {
      mailbox: m.email,
      state: paused ? "Paused" : h.pauseNew ? "New emails paused" : week === 0 ? "Warming up" : "Sending",
      cap_today: mailboxDailyCap(m, config, today),
      used_today: used,
      sends_14d: h.sends,
      bounce_rate: h.bounceRate,
      complaints: h.complaints,
      reason: [...(m.paused ? ["paused in config"] : []), ...(paused || h.pauseNew ? h.reasons : [])].join("; "),
    };
  });

  const summary: SummaryRow[] = [
    { metric: "warm", label: "Warm sellers", value: atOrPast("warm", "handed_off", "meeting", "listed"), definition: "Owners who are qualified and ready for a call, or already with the advisor" },
    { metric: "in_conversation", label: "In conversation", value: activeLeads.length, definition: "Owners who replied and are still talking with AMB (any stage but closed or check back later)" },
    { metric: "contacted", label: "Businesses emailed", value: emailsBy.size, definition: "Businesses with at least one email drafted or sent" },
    { metric: "replied", label: "Replied", value: replied.size, definition: "Businesses whose owner wrote back (auto-replies and bounces left out)" },
    { metric: "ready", label: "Ready to email", value: ready.length, definition: "Scored, in a tier the engine sends to, with a usable email address" },
    { metric: "opted_out", label: "Opted out", value: optOuts, definition: "Addresses on the permanent do-not-contact list after an opt-out or complaint" },
    { metric: "mailboxes_paused", label: "Mailboxes paused", value: mailboxes.filter((m) => m.state === "Paused").length, definition: "Sending mailboxes stopped by a guardrail or by hand" },
  ];

  const funnel: FunnelRow[] = [
    { order: 1, step: "Businesses found", count: prospects.length, definition: "Every business imported from state records" },
    { order: 2, step: "Fit the targets", count: prospects.filter((p) => p.status !== "excluded" && p.status !== "new").length, definition: "Scored and not excluded (right trade, metro, tenure; not a franchise)" },
    { order: 3, step: "Emailed", count: emailsBy.size, definition: "At least one email drafted or sent" },
    { order: 4, step: "Replied", count: replied.size, definition: "The owner wrote back" },
    { order: 5, step: "In conversation", count: leads.filter((l) => l.stage !== "lost" && l.stage !== "nurture").length, definition: "Replied and still talking" },
    { order: 6, step: "Warm seller", count: atOrPast("warm", "handed_off", "meeting", "listed"), definition: "Qualified: size, timeline and motivation known and in range" },
    { order: 7, step: "Meeting booked", count: atOrPast("meeting", "listed"), definition: "The advisor booked a call or meeting" },
    { order: 8, step: "Listing signed", count: atOrPast("listed"), definition: "Engagement or listing signed" },
  ];

  const days = new Map<string, ActivityRow>();
  const day = (d: string) => {
    let row = days.get(d);
    if (!row) days.set(d, (row = { date: d, emails: 0, replies: 0, opt_outs: 0, bounces: 0 }));
    return row;
  };
  for (const t of delivered) day(touchDay(t)).emails++;
  for (const r of replies) {
    const d = r.received_at.slice(0, 10);
    if (!d) continue;
    if (r.class === "bounce") day(d).bounces++;
    else if (r.class === "unsubscribe" || r.class === "complaint" || r.opt_out === "Y") day(d).opt_outs++;
    else if (!MACHINE.has(r.class)) day(d).replies++;
  }
  const activity = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));

  const prospectRows: ProspectView[] = prospects
    .map((p) => ({
      prospect_id: p.prospect_id,
      business: p.dba_name || p.business_name,
      city: p.city,
      vertical: config.verticals[p.vertical]?.noun ?? p.vertical,
      tier: p.tier,
      score: p.score ?? null,
      status: STATUS_WORDS[p.status],
      staff: p.staff_count ?? null,
      staff_label: staffLabel(p),
      emails_so_far: emailsBy.get(p.prospect_id) ?? 0,
      next_email: p.status === "in_sequence" ? p.next_touch_date : "",
      why: p.status === "excluded" || p.status === "hold" ? p.exclude_reason || reasonsOf(p)[0] || "" : reasonsOf(p).slice(0, 2).join("; "),
    }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.prospect_id.localeCompare(b.prospect_id));

  const byId = new Map(prospects.map((p) => [p.prospect_id, p]));
  const leadRows: LeadView[] = leads
    .map((l) => {
      const p = byId.get(l.prospect_id);
      const size = l.revenue !== undefined ? `${money(l.revenue)} revenue` : l.revenue_band ? `${l.revenue_band} revenue` : l.sde !== undefined ? `${money(l.sde)} SDE` : l.sde_band ? `${l.sde_band} SDE` : "";
      return {
        prospect_id: l.prospect_id,
        business: p?.dba_name || p?.business_name || l.business_name || l.prospect_id,
        city: p?.city ?? "",
        stage: STAGE_WORDS[l.stage].label,
        stage_order: STAGE_WORDS[l.stage].order,
        timeline: TIMELINE_WORDS[l.timeline],
        motivation: l.motivation === "unknown" ? "" : l.motivation.replace(/_/g, " "),
        size,
        qual_score: l.qual_score ?? null,
        next_action: l.next_action,
        updated: l.updated_at.slice(0, 10),
      };
    })
    .sort((a, b) => a.stage_order - b.stage_order || (b.qual_score ?? -1) - (a.qual_score ?? -1));

  return { summary, funnel, activity, prospects: prospectRows, leads: leadRows, mailboxes };
}

/** Write each dataset to data/dashboard/<name>.json; returns the files written. */
export function writeDashboardData(stores: Stores, data: DashboardData): string[] {
  const dir = path.join(stores.dataDir, "dashboard");
  fs.mkdirSync(dir, { recursive: true });
  return (Object.keys(data) as (keyof DashboardData)[]).map((name) => {
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, `${JSON.stringify(data[name], null, 1)}\n`);
    return file;
  });
}
