import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Suppression } from "../src/compliance/suppression.ts";
import type { DeliveryResult, OutgoingMessage } from "../src/domain/messages.ts";
import type { ProspectRow } from "../src/domain/schema.ts";
import { bodyHash, recordDelivery, runSend } from "../src/sending/run.ts";
import { MemoryTransport, OutboxTransport, type Transport } from "../src/sending/transports.ts";
import { MB1, MB2, makeLog, makeReply } from "./fixtures/sending/rows.ts";
import { makeProspect, REPO, tempStores, testConfig, tmpDir } from "./helpers.ts";

const TEMPLATES = path.join(REPO, "templates/sequence");
const TUE = "2026-11-10"; // the week of Veterans Day (Wed 2026-11-11)
const at = (day: string) => new Date(`${day}T13:00:00Z`);

function setup(prospects: ProspectRow[], configOverrides: Record<string, unknown> = {}) {
  const stores = tempStores();
  stores.prospects.upsert(prospects);
  return { stores, config: testConfig(configOverrides), transport: new MemoryTransport() };
}

const run = (s: ReturnType<typeof setup>, day: string, extra: { dryRun?: boolean; transport?: Transport } = {}) =>
  runSend(s.stores, s.config, { today: day, now: at(day), transport: extra.transport ?? s.transport, templatesDir: TEMPLATES, ...(extra.dryRun ? { dryRun: true } : {}) });

const prospect = (s: ReturnType<typeof setup>, id: string) => s.stores.prospects.rows().find((p) => p.prospect_id === id)!;

/** A transport that throws on every call. */
class BrokenTransport implements Transport {
  readonly name = "broken";
  calls = 0;
  async deliver(_msg: OutgoingMessage): Promise<DeliveryResult> {
    this.calls++;
    throw new Error("Gmail is down");
  }
}

describe("runSend: step 1", () => {
  it("renders, adds the footer, ad notice and unsubscribe headers, drafts, and moves the prospect into the sequence", async () => {
    const p = makeProspect();
    const s = setup([p]);
    const report = await run(s, TUE);
    expect(report).toMatchObject({ date: TUE, mode: "draft", transport: "memory", blocked: [], failed: [], dryRun: false });
    expect(report.delivered).toEqual([{ touchId: "T-000001", prospectId: p.prospect_id, step: 1, mailbox: MB1 }]);

    const { msg, mode } = s.transport.delivered[0]!;
    expect(mode).toBe("draft");
    expect(msg).toMatchObject({ kind: "outreach", step: 1, to: p.email, mailbox: MB1, fromName: "Frank Example, AMB Advisory Services" });
    expect(msg.subject).toMatch(/^Exit-readiness check for Example Air \d+$/);
    expect(msg.body).toMatch(/^Hi John,/);
    expect(msg.body).toContain("100 Example Street, Suite 200, Tampa, FL 33602");
    expect(msg.body).toContain("Reply 'unsubscribe' and I will not email you again.");
    expect(msg.body).toMatch(/This is a marketing email from AMB Advisory Services\.$/);
    expect(msg.headers["List-Unsubscribe"]).toBe("<mailto:frank@ambadvisory-mail.example?subject=unsubscribe%20T-000001>");
    expect(msg.headers["Message-ID"]).toBe("<t-000001.20261110130000@ambadvisory-mail.example>");
    expect(msg.threadId).toBeUndefined();

    const touch = s.stores.touches.rows()[0]!;
    expect(touch).toMatchObject({ touch_id: "T-000001", prospect_id: p.prospect_id, step: 1, status: "drafted", mode: "draft", draft_id: "draft-1", message_id: "mem-1", thread_id: `thread-${p.prospect_id}`, planned_for: TUE });
    expect(touch.body_sha256).toBe(bodyHash(msg.body));

    // Step 2 is due 4 business days later, skipping Veterans Day.
    expect(prospect(s, p.prospect_id)).toMatchObject({ status: "in_sequence", sequence_step: 1, mailbox: MB1, next_touch_date: "2026-11-17", thread_id: `thread-${p.prospect_id}`, last_touch_at: "2026-11-10T13:00:00Z" });
  });

  it("sends instead of drafting when sending.mode is send", async () => {
    const s = setup([makeProspect()], { sending: { mode: "send" } });
    await run(s, TUE);
    expect(s.transport.delivered[0]!.mode).toBe("send");
    expect(s.stores.touches.rows()[0]!.status).toBe("sent");
  });

  it("does nothing on a holiday", async () => {
    const s = setup([makeProspect()]);
    const report = await run(s, "2026-11-11");
    expect(report.plan.sendDay).toBe(false);
    expect(s.transport.delivered).toEqual([]);
    expect(s.stores.touches.exists()).toBe(false);
  });
});

describe("runSend: the gate", () => {
  /** A prospect already sent step 1 from MB1 and due for step 2 on TUE. */
  async function dueForStep2(overrides: Partial<ProspectRow> = {}, configOverrides: Record<string, unknown> = {}) {
    const p = makeProspect();
    const s = setup([p], configOverrides);
    await run(s, "2026-11-03");
    const after = prospect(s, p.prospect_id);
    expect(after.next_touch_date).toBe("2026-11-09");
    s.stores.prospects.upsert([{ ...after, ...overrides }]);
    s.transport.delivered.length = 0;
    return { s, p };
  }

  it("blocks a suppressed prospect's follow-up before the transport and records why", async () => {
    const { s, p } = await dueForStep2();
    new Suppression(s.stores.suppression).add(p.email, "email", "opt_out", "reply R-9", at(TUE));
    const report = await run(s, TUE);
    expect(s.transport.delivered).toEqual([]);
    expect(report.blocked).toEqual([{ prospectId: p.prospect_id, reasons: [`suppressed: ${p.email} (opt_out, reply R-9)`] }]);
    const cancelled = s.stores.touches.rows().find((t) => t.step === 2)!;
    expect(cancelled).toMatchObject({ status: "cancelled", error: `blocked: suppressed: ${p.email} (opt_out, reply R-9)` });
    expect(prospect(s, p.prospect_id).sequence_step).toBe(1);
  });

  it("blocks an out-of-state prospect", async () => {
    const { s, p } = await dueForStep2({ state: "GA", zip: "30301" });
    const report = await run(s, TUE);
    expect(s.transport.delivered).toEqual([]);
    expect(report.blocked[0]!.prospectId).toBe(p.prospect_id);
    expect(report.blocked[0]!.reasons[0]).toMatch(/^jurisdiction: GA is not in licensed_states/);
  });

  it("blocks an unverified address", async () => {
    const { s } = await dueForStep2({ email_verification: "unknown" });
    const report = await run(s, TUE);
    expect(s.transport.delivered).toEqual([]);
    expect(report.blocked[0]!.reasons).toContainEqual('email verification is "unknown": not sendable');
  });

  it("blocks everything when the config has no postal address for the footer", async () => {
    const s = setup([makeProspect()], { firm: { postal_address: "" } });
    const report = await run(s, TUE);
    expect(s.transport.delivered).toEqual([]);
    expect(report.blocked[0]!.reasons).toEqual(expect.arrayContaining(["firm.postal_address is blank"]));
  });

  it("blocks everything when no state has licensing sign-off", async () => {
    const s = setup([makeProspect(), makeProspect()], { licensed_states: [] });
    const report = await run(s, TUE);
    expect(s.transport.delivered).toEqual([]);
    expect(report.delivered).toEqual([]);
    // The planner already refuses them on jurisdiction, so nothing even reaches the gate.
    expect(report.plan.skipped.every((x) => x.reason.startsWith("jurisdiction: licensed_states is empty"))).toBe(true);
  });

  it("never lets a step-1 prospect that is suppressed, unverified or out of state reach the transport", async () => {
    const sup = makeProspect();
    const unv = makeProspect({ email_verification: "risky" });
    const tx = makeProspect({ state: "TX", zip: "75001" });
    const s = setup([sup, unv, tx]);
    new Suppression(s.stores.suppression).add(sup.prospect_id, "prospect", "do_not_contact", "manual", at(TUE));
    const report = await run(s, TUE);
    expect(s.transport.delivered).toEqual([]);
    expect(report.plan.skipped.map((x) => x.prospectId).sort()).toEqual([sup, unv, tx].map((p) => p.prospect_id).sort());
  });

  it("does not count blocked messages against the cap", async () => {
    const { s } = await dueForStep2({ email_verification: "unknown" });
    const others = Array.from({ length: 3 }, () => makeProspect());
    s.stores.prospects.upsert(others);
    const report = await run(s, TUE);
    expect(report.delivered.length).toBe(3);
  });
});

describe("runSend: caps and ramp", () => {
  it("holds each mailbox to its ramp cap and a rerun the same day adds nothing", async () => {
    const people = Array.from({ length: 30 }, (_, i) => makeProspect({ score: 99 - i }));
    const s = setup(people, {
      mailboxes: [
        { email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-10-20" }, // cold week 1: 5 a day
        { email: MB2, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-10-13", max_per_day: 7 }, // week 2 (10), capped at 7
      ],
    });
    const first = await run(s, TUE);
    expect(first.delivered.filter((d) => d.mailbox === MB1).length).toBe(5);
    expect(first.delivered.filter((d) => d.mailbox === MB2).length).toBe(7);
    expect(first.delivered.map((d) => d.prospectId)).toEqual(people.slice(0, 12).map((p) => p.prospect_id));
    const second = await run(s, TUE);
    expect(second.delivered).toEqual([]);
    expect(s.transport.delivered.length).toBe(12);
  });

  it("holds the sending domain to max_per_domain_per_day", async () => {
    const s = setup(Array.from({ length: 30 }, () => makeProspect()), { sending: { max_per_domain_per_day: 9 } });
    const report = await run(s, TUE);
    expect(report.delivered.length).toBe(9);
  });

  it("sends nothing while every mailbox warms up", async () => {
    const s = setup([makeProspect()], {
      mailboxes: [{ email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-11-01" }],
    });
    expect((await run(s, TUE)).delivered).toEqual([]);
  });
});

describe("runSend: the sequence", () => {
  it("sends step 2 and step 3 on the right business days from the step-1 mailbox and thread, then completes", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await run(s, TUE);
    // Move the prospect's step-1 mailbox to MB2 to prove follow-ups follow the record, not the load balancer.
    const step1 = s.stores.touches.rows()[0]!;
    s.stores.touches.upsert([{ ...step1, mailbox: MB2 }]);
    s.stores.prospects.upsert([{ ...prospect(s, p.prospect_id), mailbox: MB2 }]);

    expect((await run(s, "2026-11-12")).delivered).toEqual([]); // Thursday: not due yet
    const r2 = await run(s, "2026-11-17");
    expect(r2.delivered).toEqual([{ touchId: "T-000002", prospectId: p.prospect_id, step: 2, mailbox: MB2 }]);
    const m2 = s.transport.delivered[1]!.msg;
    expect(m2.subject).toBe(`Re: ${step1.subject}`);
    expect(m2.threadId).toBe(`thread-${p.prospect_id}`);
    expect(m2.headers["In-Reply-To"]).toBe("<t-000001.20261110130000@ambadvisory-mail.example>");
    expect(m2.headers.References).toBe("<t-000001.20261110130000@ambadvisory-mail.example>");
    expect(m2.body).toContain("four weeks without you");
    expect(prospect(s, p.prospect_id)).toMatchObject({ sequence_step: 2, next_touch_date: "2026-11-25", mailbox: MB2 });

    const r3 = await run(s, "2026-11-25");
    expect(r3.delivered).toEqual([{ touchId: "T-000003", prospectId: p.prospect_id, step: 3, mailbox: MB2 }]);
    expect(s.transport.delivered[2]!.msg.headers.References).toBe("<t-000001.20261110130000@ambadvisory-mail.example> <t-000002.20261117130000@ambadvisory-mail.example>");
    expect(prospect(s, p.prospect_id)).toMatchObject({ status: "in_sequence", sequence_step: 3, next_touch_date: "" });

    // Step 3's 6-business-day gap skips Thanksgiving and the day after: it ends 2026-12-07.
    expect((await run(s, "2026-12-03")).completed).toEqual([]);
    const done = await run(s, "2026-12-08");
    expect(done.completed).toEqual([p.prospect_id]);
    expect(prospect(s, p.prospect_id).status).toBe("completed");
    expect(s.transport.delivered.length).toBe(3);
  });

  it("sends no follow-up to a prospect who replied, even before the inbox step changes the status", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await run(s, TUE);
    s.stores.replies.append([makeReply({ prospect_id: p.prospect_id, class: "not_now", received_at: "2026-11-12T10:00:00Z" })]);
    const report = await run(s, "2026-11-17");
    expect(report.delivered).toEqual([]);
    expect(report.plan.skipped[0]).toEqual({ prospectId: p.prospect_id, reason: expect.stringMatching(/^replied \(not_now/) });
    expect(s.transport.delivered.length).toBe(1);
  });

  it("does not complete a sequence when the prospect replied to step 3", async () => {
    const p = makeProspect({ status: "in_sequence", sequence_step: 3, mailbox: MB1, last_touch_at: "2026-11-02T13:00:00Z", next_touch_date: "" });
    const s = setup([p]);
    s.stores.replies.append([makeReply({ prospect_id: p.prospect_id, class: "interested" })]);
    const report = await run(s, TUE);
    expect(report.completed).toEqual([]);
    expect(prospect(s, p.prospect_id).status).toBe("in_sequence");
  });
});

describe("runSend: dry run", () => {
  it("plans, renders and gates but writes nothing and calls no transport", async () => {
    const people = [makeProspect(), makeProspect({ email_verification: "unknown" })];
    const s = setup(people);
    const before = fs.readdirSync(s.stores.dataDir).map((f) => [f, fs.readFileSync(path.join(s.stores.dataDir, f), "utf8")]);
    const report = await run(s, TUE, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.delivered.map((d) => d.prospectId)).toEqual([people[0]!.prospect_id]);
    expect(s.transport.delivered).toEqual([]);
    const after = fs.readdirSync(s.stores.dataDir).map((f) => [f, fs.readFileSync(path.join(s.stores.dataDir, f), "utf8")]);
    expect(after).toEqual(before);
  });

  it("reports gate blocks in a dry run without writing a cancelled touch", async () => {
    const s = setup([makeProspect()], { firm: { postal_address: "" } });
    const report = await run(s, TUE, { dryRun: true });
    expect(report.blocked.length).toBe(1);
    expect(s.stores.touches.exists()).toBe(false);
  });
});

describe("runSend: failures", () => {
  it("records a failed delivery and leaves the prospect where it was", async () => {
    const p = makeProspect();
    const s = setup([p]);
    const broken = new BrokenTransport();
    const report = await run(s, TUE, { transport: broken });
    expect(report.failed).toEqual([{ prospectId: p.prospect_id, error: "Gmail is down" }]);
    expect(s.stores.touches.rows()[0]).toMatchObject({ status: "failed", error: "Gmail is down" });
    expect(prospect(s, p.prospect_id).status).toBe("scored");
    // A retry later the same day may use the slot again.
    expect((await run(s, TUE)).delivered.length).toBe(1);
  });

  it("reports a template that cannot render as a failure, not a send", async () => {
    const dir = tmpDir("templates-");
    fs.writeFileSync(path.join(dir, "step-1.md"), "subject: Since {since_year}\n\nHi {first_name}.");
    fs.copyFileSync(path.join(TEMPLATES, "step-2.md"), path.join(dir, "step-2.md"));
    fs.copyFileSync(path.join(TEMPLATES, "step-3.md"), path.join(dir, "step-3.md"));
    const p = makeProspect({ license_issue_date: "", formation_date: "" });
    const s = setup([p]);
    const report = await runSend(s.stores, s.config, { today: TUE, now: at(TUE), transport: s.transport, templatesDir: dir });
    expect(report.failed[0]!.error).toMatch(/^render: .*no value for \{since_year\}/);
    expect(s.transport.delivered).toEqual([]);
  });
});

describe("runSend with the outbox transport", () => {
  it("leaves touches planned until the routine records them, and threads the follow-up on the recorded ids", async () => {
    const p = makeProspect();
    const s = setup([p]);
    const outboxDir = s.stores.dir.outbox;
    const r1 = await run(s, TUE, { transport: new OutboxTransport(outboxDir, TUE) });
    expect(r1.delivered.length).toBe(1);
    expect(s.stores.touches.rows()[0]).toMatchObject({ status: "planned", message_id: "", draft_id: "" });
    expect(fs.existsSync(path.join(outboxDir, TUE, "T-000001.json"))).toBe(true);
    expect(prospect(s, p.prospect_id)).toMatchObject({ status: "in_sequence", sequence_step: 1, next_touch_date: "2026-11-17" });

    // Not recorded yet: step 2 waits.
    const waiting = await run(s, "2026-11-17", { transport: new OutboxTransport(outboxDir, "2026-11-17") });
    expect(waiting.delivered).toEqual([]);
    expect(waiting.plan.skipped[0]!.reason).toMatch(/not yet recorded/);

    recordDelivery(s.stores, "T-000001", { status: "drafted", draftId: "r-123", threadId: "gth-1", messageId: "gm-1" }, at(TUE));
    expect(prospect(s, p.prospect_id).thread_id).toBe("gth-1");
    const r2 = await run(s, "2026-11-17", { transport: new OutboxTransport(outboxDir, "2026-11-17") });
    expect(r2.delivered.length).toBe(1);
    const file = JSON.parse(fs.readFileSync(path.join(outboxDir, "2026-11-17", `${r2.delivered[0]!.touchId}.json`), "utf8"));
    expect(file.threadId).toBe("gth-1");
    expect(file.connector.args.replyToMessageId).toBe("gm-1");
  });
});

describe("recordDelivery", () => {
  async function planned() {
    const p = makeProspect();
    const s = setup([p]);
    await run(s, TUE, { transport: new OutboxTransport(s.stores.dir.outbox, TUE) });
    return { s, p };
  }

  it("moves a touch forward and never back", async () => {
    const { s } = await planned();
    recordDelivery(s.stores, "T-000001", { status: "drafted", draftId: "r-1", threadId: "th" }, at(TUE));
    expect(s.stores.touches.rows()[0]).toMatchObject({ status: "drafted", draft_id: "r-1", thread_id: "th", updated_at: "2026-11-10T13:00:00Z" });
    recordDelivery(s.stores, "T-000001", { status: "sent", messageId: "m-1" }, at(TUE));
    expect(s.stores.touches.rows()[0]).toMatchObject({ status: "sent", message_id: "m-1", draft_id: "r-1" });
    expect(() => recordDelivery(s.stores, "T-000001", { status: "drafted" }, at(TUE))).toThrow(/already sent/);
    expect(() => recordDelivery(s.stores, "T-000001", { status: "failed" }, at(TUE))).toThrow(/already sent/);
    recordDelivery(s.stores, "T-000001", { status: "sent" }, at(TUE)); // idempotent
  });

  it("throws for an unknown touch", () => {
    expect(() => recordDelivery(tempStores(), "T-999999", { status: "sent" }, at(TUE))).toThrow(/not found/);
  });

  it("puts a prospect whose step-1 draft failed back in line for step 1", async () => {
    const { s, p } = await planned();
    recordDelivery(s.stores, "T-000001", { status: "failed", error: "connector timeout" }, at(TUE));
    expect(s.stores.touches.rows()[0]).toMatchObject({ status: "failed", error: "connector timeout" });
    expect(prospect(s, p.prospect_id)).toMatchObject({ status: "scored", sequence_step: undefined, mailbox: "", next_touch_date: "" });
    const again = await run(s, "2026-11-12", { transport: new OutboxTransport(s.stores.dir.outbox, "2026-11-12") });
    expect(again.delivered.map((d) => d.prospectId)).toEqual([p.prospect_id]);
  });
});

describe("mailbox log", () => {
  it("writes one row per mailbox per send day, replaces it on a rerun, and keeps a person's clearance row", async () => {
    const s = setup([makeProspect(), makeProspect(), makeProspect()]);
    s.stores.mailboxLog.append([makeLog({ date: TUE, mailbox: MB1, paused: "N", pause_reason: "cleared: reviewed by Frank" })]);
    await run(s, TUE);
    await run(s, TUE);
    const rows = s.stores.mailboxLog.rows();
    expect(rows.filter((r) => r.mailbox === MB1 && r.pause_reason === "").length).toBe(1);
    expect(rows.some((r) => r.pause_reason.startsWith("cleared"))).toBe(true);
    const mb1 = rows.find((r) => r.mailbox === MB1 && !r.pause_reason)!;
    const mb2 = rows.find((r) => r.mailbox === MB2)!;
    expect(mb1).toMatchObject({ date: TUE, drafted: 2, sent: 0, paused: "N" });
    expect(mb2).toMatchObject({ date: TUE, drafted: 1, paused: "N" });
  });

  it("logs a paused mailbox with its reasons", async () => {
    const s = setup([makeProspect()]);
    s.stores.replies.append([makeReply({ class: "complaint", mailbox: MB2, received_at: "2026-11-09T10:00:00Z" })]);
    const report = await run(s, TUE);
    expect(report.delivered).toEqual([]);
    const rows = s.stores.mailboxLog.rows();
    expect(rows.find((r) => r.mailbox === MB2)).toMatchObject({ paused: "Y", pause_reason: expect.stringMatching(/spam complaint/) });
    expect(rows.find((r) => r.mailbox === MB1)).toMatchObject({ paused: "Y", pause_reason: expect.stringMatching(/every mailbox pauses/) });
  });
});
