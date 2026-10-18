import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { Suppression } from "../src/compliance/suppression.ts";
import type { InboundMessage } from "../src/domain/messages.ts";
import type { ProspectRow, TouchRow } from "../src/domain/schema.ts";
import type { Classification, classifyReply } from "../src/replies/classify.ts";
import { mergeFacts, processInbox } from "../src/replies/process.ts";
import { MemoryTransport, type Transport } from "../src/sending/transports.ts";
import type { Stores } from "../src/store/index.ts";
import { gmailDelay, gmailHardBounce, inbound, MAILBOX, OOO_TEXT } from "./fixtures/replies/messages.ts";
import { makeLead, makeProspect, offline, tempStores, testConfig } from "./helpers.ts";

const NOW = new Date("2026-10-18T14:00:00Z");
const TODAY = "2026-10-18";

/** A prospect in sequence with step 1 sent on `thread`, and the touch that sent it. */
function seed(stores: Stores, overrides: Partial<ProspectRow> = {}): ProspectRow {
  const p = makeProspect({ status: "in_sequence", mailbox: MAILBOX, sequence_step: 1, next_touch_date: "2026-10-20", thread_id: "", ...overrides });
  stores.prospects.upsert([p]);
  const touch: TouchRow = {
    touch_id: `T-${String(stores.touches.rows().length + 1).padStart(6, "0")}`,
    prospect_id: p.prospect_id,
    kind: "outreach",
    step: 1,
    mailbox: MAILBOX,
    to_email: p.email,
    subject: "Exit-readiness check for Example Air",
    body_sha256: "x",
    planned_for: "2026-10-13",
    status: "sent",
    mode: "send",
    message_id: "m0",
    thread_id: `thr-${p.prospect_id}`,
    draft_id: "",
    error: "",
    created_at: "2026-10-13T13:00:00Z",
    updated_at: "2026-10-13T13:00:00Z",
  };
  stores.touches.upsert([touch]);
  return p;
}

const from = (p: ProspectRow) => `John Example <${p.email}>`;
const run = (stores: Stores, messages: InboundMessage[], o: { transport?: Transport; classify?: typeof classifyReply; config?: ReturnType<typeof testConfig> } = {}) =>
  offline(() => processInbox(stores, o.config ?? testConfig(), { now: NOW, today: TODAY, messages, transport: o.transport ?? new MemoryTransport(), ...(o.classify ? { classify: o.classify } : {}) }));

/** An injected classifier that always returns `c` (the Claude path's output, without Claude). */
const fixed = (c: Partial<Classification>): typeof classifyReply => async () => ({ class: "interested", classifier: "claude", optOut: false, complaint: false, facts: {}, notes: "", ...c });

describe("processInbox: an interested owner", () => {
  it("records the reply, stops the sequence, opens a lead and drafts the questions as a draft", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const t = new MemoryTransport();
    const msg = inbound({ threadId: `thr-${p.prospect_id}`, from: from(p), text: "Yes, I would like that.", headers: { "message-id": "<r1@mail.example>" } });
    const report = await run(stores, [msg], { transport: t });

    expect(report).toMatchObject({ received: 1, duplicates: 0, unmatched: 0, byClass: { interested: 1 }, suppressed: 0, drafted: 1, errors: [] });
    const [reply] = stores.replies.rows();
    expect(reply).toMatchObject({ reply_id: msg.id, prospect_id: p.prospect_id, class: "interested", classifier: "rules", opt_out: "N", from_email: p.email, snippet: "Yes, I would like that.", received_at: "2026-10-17T13:00:00Z" });
    expect(stores.prospects.rows()[0]).toMatchObject({ status: "replied", next_touch_date: "" });

    const lead = stores.leads.rows()[0]!;
    expect(lead).toMatchObject({ prospect_id: p.prospect_id, stage: "qualifying", wants_readiness_check: "Y", questions_asked: "revenue; sde; timeline", next_action: "Review and send the drafted reply" });
    expect(lead.qual_score).toBe(8);

    expect(t.delivered).toHaveLength(1);
    const { msg: out, mode } = t.delivered[0]!;
    expect(mode).toBe("draft");
    expect(out).toMatchObject({ kind: "reply", to: p.email, mailbox: MAILBOX, threadId: msg.threadId, subject: "Re: Exit-readiness check for Example Air", fromName: "Frank Example, AMB Advisory Services" });
    expect(out.headers).toEqual({ "In-Reply-To": "<r1@mail.example>", References: "<r1@mail.example>" });
    expect(out.body).toMatch(/AI assistant/);
    const touch = stores.touches.rows().find((x) => x.kind === "reply")!;
    expect(touch).toMatchObject({ touch_id: "T-000002", status: "drafted", mode: "draft", draft_id: "draft-1", to_email: p.email });
    expect(touch.body_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(reply!.response_touch_id).toBe("T-000002");
  });

  it("is idempotent: the same messages twice add no rows and no drafts", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const t = new MemoryTransport();
    const msgs = [inbound({ threadId: `thr-${p.prospect_id}`, from: from(p), text: "Sure, go ahead." })];
    await run(stores, msgs, { transport: t });
    const before = { replies: fs.readFileSync(stores.replies.file, "utf8"), touches: fs.readFileSync(stores.touches.file, "utf8"), leads: fs.readFileSync(stores.leads.file, "utf8") };
    const second = await run(stores, [...msgs, ...msgs], { transport: t });
    expect(second).toMatchObject({ received: 2, duplicates: 2, drafted: 0 });
    expect(t.delivered).toHaveLength(1);
    expect(fs.readFileSync(stores.replies.file, "utf8")).toBe(before.replies);
    expect(fs.readFileSync(stores.touches.file, "utf8")).toBe(before.touches);
    expect(fs.readFileSync(stores.leads.file, "utf8")).toBe(before.leads);
  });

  it("dedupes a message repeated inside one batch", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const msg = inbound({ from: from(p), text: "Yes." });
    const report = await run(stores, [msg, msg]);
    expect(report).toMatchObject({ duplicates: 1, drafted: 1 });
    expect(stores.replies.rows()).toHaveLength(1);
  });

  it("merges stated facts into the lead without overwriting one with a blank, and reaches warm", async () => {
    const stores = tempStores();
    const p = seed(stores);
    stores.leads.upsert([makeLead(p, { stage: "qualifying", revenue_band: "$1M-$2M", questions_asked: "revenue; sde; timeline", wants_readiness_check: "Y" })]);
    const classify = fixed({ facts: { sde: 300_000, timeline: "6-12m", motivation: "burnout", revenue_band: "" } });
    await run(stores, [inbound({ from: from(p), text: "About $300K to me. Within a year. I am tired." })], { classify });
    const lead = stores.leads.rows()[0]!;
    expect(lead).toMatchObject({ revenue_band: "$1M-$2M", sde: 300_000, timeline: "6-12m", motivation: "burnout", stage: "warm", next_action: "Hand off to the advisor" });
    expect(lead.qual_score).toBeGreaterThanOrEqual(60);
  });
});

describe("processInbox: opt-outs, complaints, wrong person, bounces", () => {
  it("suppresses an opt-out permanently (email and prospect), marks the prospect dnc and drafts nothing", async () => {
    const stores = tempStores();
    const p = seed(stores);
    stores.leads.upsert([makeLead(p, { stage: "qualifying" })]);
    const t = new MemoryTransport();
    const report = await run(stores, [inbound({ from: from(p), text: "Please take me off your list." })], { transport: t });
    expect(report).toMatchObject({ byClass: { unsubscribe: 1 }, suppressed: 1, drafted: 0 });
    expect(t.delivered).toEqual([]);
    const rows = new Suppression(stores.suppression).all();
    expect(rows.map((r) => [r.value, r.value_type, r.reason])).toEqual([
      [p.email, "email", "opt_out"],
      [p.prospect_id, "prospect", "opt_out"],
    ]);
    expect(rows[0]!.source).toMatch(/^reply msg-/);
    expect(stores.prospects.rows()[0]).toMatchObject({ status: "dnc", next_touch_date: "" });
    expect(stores.leads.rows()[0]).toMatchObject({ stage: "lost" });
    expect(stores.replies.rows()[0]).toMatchObject({ class: "unsubscribe", opt_out: "Y" });
  });

  it("lets a rule-detected opt-out win over an injected classifier", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const t = new MemoryTransport();
    await run(stores, [inbound({ from: from(p), text: "Interested, but remove me from this list for now." })], { transport: t, classify: fixed({ class: "interested" }) });
    expect(stores.replies.rows()[0]).toMatchObject({ class: "unsubscribe", opt_out: "Y" });
    expect(t.delivered).toEqual([]);
  });

  it("never drafts for a suppressed address, even when the owner later says yes", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const t = new MemoryTransport();
    const stop = inbound({ from: from(p), text: "Stop emailing me.", date: "2026-10-16T10:00:00Z" });
    const yes = inbound({ from: from(p), text: "Actually, yes please.", date: "2026-10-17T10:00:00Z" });
    // Given out of order: the earlier opt-out is still processed first.
    const report = await run(stores, [yes, stop], { transport: t });
    expect(report.drafted).toBe(0);
    expect(t.delivered).toEqual([]);
    const yesRow = stores.replies.rows().find((r) => r.reply_id === yes.id)!;
    expect(yesRow.error).toMatch(/not drafted: .* is suppressed \(opt_out\)/);
    expect(stores.prospects.rows()[0]!.status).toBe("dnc");
    expect(stores.leads.rows()[0]).toMatchObject({ stage: "lost", next_action: expect.stringMatching(/a person must review/) });
  });

  it("never drafts for a prospect suppressed before this run, and the reply is still recorded", async () => {
    const stores = tempStores();
    const p = seed(stores, { status: "dnc" });
    new Suppression(stores.suppression).add(p.email, "email", "do_not_contact", "manual", NOW);
    const t = new MemoryTransport();
    await run(stores, [inbound({ from: from(p), text: "Who are you?" })], { transport: t });
    expect(t.delivered).toEqual([]);
    expect(stores.replies.rows()[0]).toMatchObject({ class: "question", error: expect.stringMatching(/suppressed/) });
    expect(stores.prospects.rows()[0]!.status).toBe("dnc");
  });

  it("suppresses a complaint and logs the mailbox for a pause", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const report = await run(stores, [inbound({ from: from(p), text: "This is harassment. I will report you to the FTC." })]);
    expect(report).toMatchObject({ byClass: { complaint: 1 }, suppressed: 1, drafted: 0 });
    expect(new Suppression(stores.suppression).check(p.email)?.reason).toBe("complaint");
    expect(stores.mailboxLog.rows()).toEqual([
      { date: TODAY, mailbox: MAILBOX, sent: undefined, drafted: undefined, hard_bounces: undefined, soft_bounces: undefined, complaints: 1, opt_outs: undefined, human_replies: undefined, paused: "Y", pause_reason: expect.stringMatching(/complaint in reply/) },
    ]);
  });

  it("suppresses a wrong-person reply and closes the prospect", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const t = new MemoryTransport();
    await run(stores, [inbound({ from: from(p), text: "I sold the business last year." })], { transport: t });
    expect(new Suppression(stores.suppression).check(p.email, p.prospect_id)?.reason).toBe("wrong_person");
    expect(stores.prospects.rows()[0]!.status).toBe("dnc");
    expect(t.delivered).toEqual([]);
  });

  it("matches a hard bounce by its failed recipient and suppresses that address", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const report = await run(stores, [gmailHardBounce(p.email)]);
    expect(report).toMatchObject({ unmatched: 0, byClass: { bounce: 1 }, suppressed: 1 });
    expect(stores.replies.rows()[0]).toMatchObject({ prospect_id: p.prospect_id, class: "bounce", bounce_type: "hard" });
    const rows = new Suppression(stores.suppression).all();
    expect(rows.map((r) => [r.value, r.reason])).toEqual([
      [p.email, "bounce"],
      [p.prospect_id, "bounce"],
    ]);
    // The daemon's own address is never suppressed.
    expect(rows.some((r) => r.value.includes("mailer-daemon"))).toBe(false);
    expect(stores.prospects.rows()[0]!.status).toBe("dnc");
    expect(stores.leads.rows()).toEqual([]);
  });

  it("records a soft bounce without suppressing or stopping the sequence", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const report = await run(stores, [gmailDelay(p.email)]);
    expect(report.suppressed).toBe(0);
    expect(stores.replies.rows()[0]).toMatchObject({ class: "bounce", bounce_type: "soft" });
    expect(stores.prospects.rows()[0]!.status).toBe("in_sequence");
    expect(stores.suppression.rows()).toEqual([]);
  });
});

describe("processInbox: machine mail, matching and failures", () => {
  it("pauses the sequence 7 days on an auto-reply instead of stopping it, and opens no lead", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const report = await run(stores, [inbound({ from: from(p), subject: "Automatic reply: Exit-readiness check", text: OOO_TEXT })]);
    expect(report).toMatchObject({ byClass: { auto_reply: 1 }, drafted: 0 });
    expect(stores.prospects.rows()[0]).toMatchObject({ status: "in_sequence", next_touch_date: "2026-10-25" });
    expect(stores.leads.rows()).toEqual([]);
  });

  it("matches by thread first, then by sender address, ignoring case and +tags", async () => {
    const stores = tempStores();
    const a = seed(stores);
    const b = seed(stores);
    // a's thread, but sent from another address: the thread decides.
    await run(stores, [inbound({ threadId: `thr-${a.prospect_id}`, from: "Office <office@elsewhere.example>", text: "Not right now." })]);
    expect(stores.replies.rows()[0]!.prospect_id).toBe(a.prospect_id);
    const [local, domain] = b.email.split("@");
    await run(stores, [inbound({ threadId: "unknown", from: `${local!.toUpperCase()}+x@${domain}`, text: "Not right now." })]);
    expect(stores.replies.rows()[1]!.prospect_id).toBe(b.prospect_id);
    const lead = stores.leads.rows().find((l) => l.prospect_id === b.prospect_id)!;
    expect(lead).toMatchObject({ stage: "nurture", nurture_date: "2027-04-16" });
  });

  it("records an unmatched reply without a draft, and still honours its opt-out", async () => {
    const stores = tempStores();
    seed(stores);
    const t = new MemoryTransport();
    const report = await run(stores, [inbound({ threadId: "x", from: "stranger@nowhere.example", text: "Yes!" }), inbound({ threadId: "y", from: "other@nowhere.example", text: "unsubscribe" })], { transport: t });
    expect(report).toMatchObject({ unmatched: 2, drafted: 0, byClass: { other: 1, unsubscribe: 1 } });
    expect(t.delivered).toEqual([]);
    expect(new Suppression(stores.suppression).check("other@nowhere.example")?.reason).toBe("opt_out");
    expect(stores.replies.rows().map((r) => r.prospect_id)).toEqual(["", ""]);
  });

  it("skips messages sent by AMB's own mailboxes", async () => {
    const stores = tempStores();
    seed(stores);
    const report = await run(stores, [inbound({ from: `Frank Example <${MAILBOX}>`, text: "Hi John" })]);
    expect(report).toMatchObject({ ownMessages: 1, byClass: {} });
    expect(stores.replies.rows()).toEqual([]);
  });

  it("records a classifier failure and retries it on the next run", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const msg = inbound({ from: from(p), text: "Tell me more." });
    const boom: typeof classifyReply = async () => {
      throw new Error("disk on fire");
    };
    const first = await run(stores, [msg], { classify: boom });
    expect(first.errors).toEqual([{ replyId: msg.id, error: "classification failed: disk on fire" }]);
    expect(stores.replies.rows()[0]).toMatchObject({ class: "", error: "classification failed: disk on fire" });
    const t = new MemoryTransport();
    const second = await run(stores, [msg], { transport: t });
    expect(second).toMatchObject({ duplicates: 0, drafted: 1, errors: [] });
    expect(stores.replies.rows()).toHaveLength(1);
    expect(stores.replies.rows()[0]).toMatchObject({ class: "interested", error: "" });
  });

  it("records a draft the compliance gate blocks, sends nothing, and does not retry it", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const config = testConfig({ licensed_states: [] });
    const t = new MemoryTransport();
    const msg = inbound({ from: from(p), text: "Yes." });
    const report = await run(stores, [msg], { transport: t, config });
    expect(t.delivered).toEqual([]);
    expect(report.errors[0]!.error).toMatch(/^draft blocked: licensed_states is empty/);
    expect(stores.touches.rows().filter((x) => x.kind === "reply")).toEqual([]);
    expect(stores.leads.rows()[0]!.questions_asked).toBe("");
    expect((await run(stores, [msg], { transport: t, config })).duplicates).toBe(1);
  });

  it("marks the reply touch failed when the transport throws, and records why", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const broken: Transport = { name: "broken", deliver: async () => Promise.reject(new Error("outbox not writable")) };
    const report = await run(stores, [inbound({ from: from(p), text: "Yes." })], { transport: broken });
    expect(report.drafted).toBe(0);
    expect(report.errors[0]!.error).toBe("draft delivery failed: outbox not writable");
    expect(stores.touches.rows().find((x) => x.kind === "reply")).toMatchObject({ status: "failed", error: "draft delivery failed: outbox not writable" });
    // The questions were not sent, so they are not recorded as asked.
    expect(stores.leads.rows()[0]!.questions_asked).toBe("");
  });

  it("answers the AI question with a draft and never auto-sends a reply", async () => {
    const stores = tempStores();
    const p = seed(stores);
    const t = new MemoryTransport();
    await run(stores, [inbound({ from: from(p), text: "Are you a bot?" })], { transport: t, config: testConfig({ sending: { mode: "send" } }) });
    expect(t.delivered.map((d) => d.mode)).toEqual(["draft"]);
    expect(t.delivered[0]!.msg.body).toMatch(/I am a real person/);
  });
});

describe("mergeFacts", () => {
  it("keeps stated facts when the new facts are blank or unknown, and takes new stated values", () => {
    const p = makeProspect();
    const lead = makeLead(p, { revenue: 1_000_000, timeline: "6-12m", license_holder: "owner" });
    expect(mergeFacts(lead, { revenue: undefined, timeline: "unknown", license_holder: "  ", employees: 9 })).toMatchObject({ revenue: 1_000_000, timeline: "6-12m", license_holder: "owner", employees: 9 });
    expect(mergeFacts(lead, { revenue: 1_500_000 }).revenue).toBe(1_500_000);
  });
});
