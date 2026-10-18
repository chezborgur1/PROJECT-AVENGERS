import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { weeklyReport } from "../src/report/weekly.ts";
import { makeLead, makeProspect, tempStores, testConfig } from "./helpers.ts";
import { makeMailboxLog, makeReply, makeTouch } from "./fixtures/report/rows.ts";

const TODAY = "2026-10-18"; // window 2026-10-12 to 2026-10-18, ISO week 2026-W42
const MB1 = "frank@ambadvisory-mail.example";
const MB2 = "frank.e@ambadvisory-mail.example";
const config = testConfig();

/** A week with 40 sends across two mailboxes and a mix of replies and lead stages. */
function busyWeek() {
  const stores = tempStores();
  const p = makeProspect();
  stores.prospects.upsert([p, makeProspect({ score: undefined })]);
  const touches = [
    ...Array.from({ length: 25 }, (_, i) => makeTouch({ prospect_id: `P-1${String(i).padStart(4, "0")}`, mailbox: MB1, step: 1 })),
    ...Array.from({ length: 10 }, (_, i) => makeTouch({ prospect_id: `P-2${String(i).padStart(4, "0")}`, mailbox: MB2, step: 1, updated_at: "2026-10-16T13:00:00Z" })),
    ...Array.from({ length: 5 }, (_, i) => makeTouch({ prospect_id: `P-1${String(i).padStart(4, "0")}`, mailbox: MB1, step: 2, updated_at: "2026-10-18T13:00:00Z" })),
    makeTouch({ prospect_id: "P-30000", step: 1, status: "drafted", mode: "draft", updated_at: "2026-10-17T12:00:00Z" }),
    // Outside the window: last week's sends and a reply touch do not count as outreach.
    makeTouch({ prospect_id: "P-40000", created_at: "2026-10-09T13:00:00Z", updated_at: "2026-10-09T13:00:00Z" }),
    makeTouch({ prospect_id: "P-40001", kind: "reply", step: undefined, status: "drafted", updated_at: "2026-10-15T13:00:00Z" }),
  ];
  stores.touches.upsert(touches);
  stores.replies.upsert([
    makeReply({ reply_id: "r1", class: "interested" }),
    makeReply({ reply_id: "r2", class: "interested", mailbox: MB2 }),
    makeReply({ reply_id: "r3", class: "question" }),
    makeReply({ reply_id: "r4", class: "not_interested" }),
    makeReply({ reply_id: "r5", class: "unsubscribe", opt_out: "Y" }),
    makeReply({ reply_id: "r6", class: "auto_reply" }),
    makeReply({ reply_id: "r7", class: "bounce", bounce_type: "hard", from_email: "mailer-daemon@googlemail.com" }),
    makeReply({ reply_id: "r8", class: "bounce", bounce_type: "soft" }),
    makeReply({ reply_id: "r9", class: "interested", received_at: "2026-10-05T10:00:00Z" }), // last week
  ]);
  stores.leads.upsert([
    makeLead(makeProspect({ prospect_id: "P-50001" }), { stage: "qualified", updated_at: "2026-10-15T10:00:00Z" }),
    makeLead(makeProspect({ prospect_id: "P-50002" }), { stage: "handed_off", handed_off_at: "2026-10-16T10:00:00Z", updated_at: "2026-10-16T10:00:00Z" }),
    makeLead(makeProspect({ prospect_id: "P-50003" }), { stage: "meeting", updated_at: "2026-10-17T10:00:00Z" }),
    makeLead(makeProspect({ prospect_id: "P-50004" }), { stage: "listed", updated_at: "2026-10-18T10:00:00Z" }),
    makeLead(makeProspect({ prospect_id: "P-50005" }), { stage: "qualified", updated_at: "2026-09-01T10:00:00Z" }), // older
    makeLead(makeProspect({ prospect_id: "P-50006" }), { stage: "engaged", updated_at: "2026-10-15T10:00:00Z" }),
  ]);
  return stores;
}

describe("weeklyReport", () => {
  it("computes the plan's metrics for the 7 days ending today", () => {
    const { metrics } = weeklyReport(busyWeek(), config, { today: TODAY });
    expect(metrics).toMatchObject({
      week: "2026-W42",
      sent: 40,
      drafted: 1,
      newProspectsContacted: 36,
      humanReplies: 5, // interested x2, question, not_interested, unsubscribe
      positiveReplies: 2,
      optOuts: 1,
      bounces: 1, // hard only
      complaints: 0,
      qualified: 4, // qualified, handed_off, meeting, listed changed this week
      handedOff: 1,
      meetings: 1,
      listingsSigned: 1,
    });
    // Rates are over sent or drafted (40 sent and 1 draft), the guardrail's basis.
    expect(metrics.replyRate).toBeCloseTo(5 / 41);
    expect(metrics.bounceRate).toBeCloseTo(1 / 41);
    expect(metrics.byMailbox[MB1]).toEqual({ sent: 30, bounces: 1, paused: false });
    expect(metrics.byMailbox[MB2]).toEqual({ sent: 10, bounces: 0, paused: false });
  });

  it("raises an alarm when the hard bounce rate is above the guardrail", () => {
    const { metrics } = weeklyReport(busyWeek(), config, { today: TODAY });
    // 1 hard bounce in 41 sent or drafted is 2.4%, above the 2% default.
    expect(metrics.alarms.some((a) => a.startsWith("Hard bounce rate 2.4% is above the 2.0% guardrail"))).toBe(true);
  });

  it("raises alarms for a complaint, a paused mailbox, failures, reply errors and too many bounces in a day", () => {
    const stores = busyWeek();
    stores.replies.upsert([
      makeReply({ reply_id: "c1", class: "complaint" }),
      makeReply({ reply_id: "e1", class: "other", error: "classifier failed" }),
      ...["b1", "b2", "b3"].map((id) => makeReply({ reply_id: id, class: "bounce", bounce_type: "hard", mailbox: MB2, received_at: "2026-10-17T09:00:00Z" })),
    ]);
    stores.touches.upsert([makeTouch({ touch_id: "T-900001", status: "failed", error: "quota" })]);
    const { metrics } = weeklyReport(stores, config, { today: TODAY });
    const text = metrics.alarms.join("\n");
    expect(text).toContain("1 spam complaint this week: sending stays paused");
    // The pause and its reason come from the sender's circuit breakers (mailboxHealth).
    expect(text).toMatch(new RegExp(`${MB2.replace(/\./g, "\\.")} is paused\\. .*3 hard bounces on 2026-10-17 \\(limit 3 a day\\)`));
    expect(text).toContain(`${MB2} had 3 hard bounces on 2026-10-17`);
    expect(text).toContain("1 message failed to deliver");
    expect(text).toContain("1 reply could not be processed");
    expect(metrics.byMailbox[MB2]!.paused).toBe(true);
    expect(metrics.complaints).toBe(1);
  });

  it("reads pauses from mailbox health, so a stale log row does not pause and a cleared pause does not either", () => {
    const stores = busyWeek();
    stores.mailboxLog.append([makeMailboxLog({ date: "2026-10-17", mailbox: MB2, paused: "Y", pause_reason: "old sender row" })]);
    expect(weeklyReport(stores, config, { today: TODAY }).metrics.byMailbox[MB2]!.paused).toBe(false);
    stores.replies.upsert(["b1", "b2", "b3"].map((id) => makeReply({ reply_id: id, class: "bounce", bounce_type: "hard", mailbox: MB2, received_at: "2026-10-16T09:00:00Z" })));
    expect(weeklyReport(stores, config, { today: TODAY }).metrics.byMailbox[MB2]!.paused).toBe(true);
    stores.mailboxLog.append([makeMailboxLog({ date: "2026-10-17", mailbox: MB2, paused: "N", pause_reason: "cleared: list re-verified" })]);
    expect(weeklyReport(stores, config, { today: TODAY }).metrics.byMailbox[MB2]!.paused).toBe(false);
  });

  it("raises an alarm when the opt-out rate is above the guardrail", () => {
    const stores = tempStores();
    stores.touches.upsert(Array.from({ length: 10 }, (_, i) => makeTouch({ prospect_id: `P-6000${i}` })));
    stores.replies.upsert([makeReply({ reply_id: "u1", class: "unsubscribe", opt_out: "Y" })]);
    const { metrics } = weeklyReport(stores, config, { today: TODAY });
    expect(metrics.alarms.some((a) => a.startsWith("Opt-out rate 10.0% is above the 5.0% guardrail"))).toBe(true);
  });

  it("computes rates over drafts in draft mode, so bounces still raise the alarm when nothing is marked sent", () => {
    const stores = tempStores();
    stores.touches.upsert(Array.from({ length: 10 }, (_, i) => makeTouch({ prospect_id: `P-7000${i}`, status: "drafted", mode: "draft" })));
    stores.replies.upsert([makeReply({ reply_id: "d1", class: "interested" }), makeReply({ reply_id: "d2", class: "bounce", bounce_type: "hard" })]);
    const { metrics, markdown } = weeklyReport(stores, config, { today: TODAY });
    expect(metrics).toMatchObject({ sent: 0, drafted: 10, humanReplies: 1, bounces: 1 });
    expect(metrics.replyRate).toBeCloseTo(0.1);
    expect(metrics.bounceRate).toBeCloseTo(0.1);
    expect(metrics.alarms.some((a) => a.startsWith("Hard bounce rate 10.0% is above the 2.0% guardrail"))).toBe(true);
    expect(markdown).toContain("| Hard bounce rate (over sent or drafted) | 10.0% |");
  });

  it("flags drafts waiting to be sent and a config that blocks sending", () => {
    const stores = tempStores();
    stores.touches.upsert([makeTouch({ status: "drafted", mode: "draft" })]);
    const blocked = testConfig({ licensed_states: [], licensing_signoff: "" });
    const { metrics } = weeklyReport(stores, blocked, { today: TODAY });
    expect(metrics.alarms).toContain("Sending is blocked: licensed_states is empty or licensing_signoff is blank (docs/COMPLIANCE.md).");
    expect(metrics.alarms.some((a) => a.startsWith('1 outreach draft is waiting: send them and record each with "lead-engine record"'))).toBe(true);
    expect(metrics.replyRate).toBe(0);
    expect(metrics.bounceRate).toBe(0);
  });

  it("flags a silent week once a mailbox is past warm-up, but not during warm-up", () => {
    const stores = tempStores();
    expect(weeklyReport(stores, config, { today: TODAY }).metrics.alarms).toContain("No outreach was sent or drafted in the last 7 days although a mailbox is past warm-up.");
    const warming = testConfig({ mailboxes: [{ email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-10-05" }] });
    expect(weeklyReport(tempStores(), warming, { today: TODAY }).metrics.alarms).toEqual([]);
  });

  it("reports invalid rows in a table as an alarm", () => {
    const stores = busyWeek();
    fs.appendFileSync(stores.touches.file, "T-999999,P-1,outreach,1,x,y,z,h,,not_a_status\n");
    const { metrics } = weeklyReport(stores, config, { today: TODAY });
    expect(metrics.alarms.some((a) => a.startsWith("touches has 1 invalid row"))).toBe(true);
  });

  it("writes data/reports/<week>.md with this week, mailboxes, alarms and the cumulative funnel", () => {
    const stores = busyWeek();
    const { markdown, file } = weeklyReport(stores, config, { today: TODAY });
    expect(file).toBe(path.join(stores.dir.reports, "2026-W42.md"));
    expect(fs.readFileSync(file, "utf8")).toBe(markdown);
    expect(markdown).toContain("# Weekly report 2026-W42");
    expect(markdown).toContain("The 7 days from 2026-10-12 to 2026-10-18.");
    expect(markdown).toContain("| Outreach emails sent | 40 |");
    expect(markdown).toContain("| Reply rate (over sent or drafted) | 12.2% |");
    expect(markdown).toContain("| Listings signed | 1 |");
    expect(markdown).toContain(`| ${MB1} | 30 | 1 | No |`);
    expect(markdown).toContain("| Outreach emails sent | 41 |"); // funnel includes last week's send
    expect(markdown).toContain("| Interested replies | 3 |"); // funnel includes last week's reply
    expect(markdown).toContain("| Scored | 1 |");
    expect(markdown).toContain("| qualified | 2 |");
    expect(markdown).not.toContain("\u2014");
  });

  it("works on an empty data folder", () => {
    const { metrics, markdown } = weeklyReport(tempStores(), testConfig({ mailboxes: [] }), { today: TODAY });
    expect(metrics.sent).toBe(0);
    expect(metrics.alarms).toEqual([]);
    expect(markdown).toContain("- None.");
  });
});
