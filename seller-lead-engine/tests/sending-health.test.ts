import { describe, expect, it } from "vitest";
import { mailboxHealth } from "../src/sending/health.ts";
import { MB1, MB2, makeLog, makeReply, makeTouches } from "./fixtures/sending/rows.ts";
import { tempStores, testConfig } from "./helpers.ts";

const TODAY = "2026-10-22";

function setup() {
  return { stores: tempStores(), config: testConfig() };
}

const hard = (day: string, extra = {}) => makeReply({ class: "bounce", bounce_type: "hard", received_at: `${day}T15:00:00Z`, ...extra });

describe("mailbox health", () => {
  it("is clean with sends and no bad signals", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(30));
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h).toMatchObject({ mailbox: MB1, sends: 30, hardBounces: 0, bounceRate: 0, complaints: 0, optOuts: 0, pause: false, pauseNew: false, reasons: [] });
  });

  it("counts sent and drafted outreach as sends, but not planned, failed or reply touches", () => {
    const { stores, config } = setup();
    stores.touches.append([
      ...makeTouches(3, { status: "sent" }),
      ...makeTouches(2, { status: "drafted" }),
      ...makeTouches(4, { status: "planned" }),
      ...makeTouches(1, { status: "failed" }),
      ...makeTouches(2, { kind: "reply", step: undefined }),
    ]);
    expect(mailboxHealth(stores, config, MB1, TODAY).sends).toBe(5);
  });

  it("does not pause on one hard bounce in a small sample, but reports the rate", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(10));
    stores.replies.append([hard("2026-10-21")]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h.hardBounces).toBe(1);
    expect(h.bounceRate).toBeCloseTo(0.1);
    expect(h.pause).toBe(false);
  });

  it("pauses when hard bounces reach 2% of sends over the 14-day window", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(100));
    stores.replies.append([hard("2026-10-20"), hard("2026-10-21")]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h.pause).toBe(true);
    expect(h.reasons[0]).toMatch(/hard bounce rate 2% over 14 days \(2 of 100 sends\)/);
  });

  it("pauses on 3 hard bounces in one day even when the rate is low", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(400));
    stores.replies.append([hard("2026-10-21"), hard("2026-10-21"), hard("2026-10-21")]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h.pause).toBe(true);
    expect(h.reasons).toContainEqual("3 hard bounces on 2026-10-21 (limit 3 a day)");
  });

  it("ignores soft bounces, bounces outside the window and other mailboxes' bounces, and counts an untyped bounce as hard", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(50));
    stores.replies.append([
      hard("2026-10-21", { bounce_type: "soft" }),
      hard("2026-10-01"),
      hard("2026-10-21", { mailbox: MB2 }),
      hard("2026-10-21", { bounce_type: "" }),
    ]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h.hardBounces).toBe(1);
    expect(h.pause).toBe(false);
  });

  it("pauses on an authentication rejection bounce (550 5.7.515)", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(200));
    stores.replies.append([hard("2026-10-21", { snippet: "550; 5.7.515 Access denied, sending domain does not meet the required authentication level" })]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h.pause).toBe(true);
    expect(h.reasons[0]).toMatch(/authentication rejection bounce \(5\.7\.515\)/);
  });

  it("pauses on any spam complaint, however old, until a person clears it in the mailbox log", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(20));
    stores.replies.append([makeReply({ class: "complaint", received_at: "2026-08-01T12:00:00Z" })]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h).toMatchObject({ pause: true, complaintPause: true, complaints: 1 });
    expect(h.reasons[0]).toMatch(/spam complaint .*until a person clears it/);

    // The sender's own paused/unpaused rows do not clear it; a "cleared" row does.
    stores.mailboxLog.append([makeLog({ date: "2026-10-21", paused: "N", pause_reason: "" })]);
    expect(mailboxHealth(stores, config, MB1, TODAY).pause).toBe(true);
    stores.mailboxLog.append([makeLog({ date: "2026-10-21", paused: "N", pause_reason: "cleared: Frank reviewed the complaint" })]);
    const cleared = mailboxHealth(stores, config, MB1, TODAY);
    expect(cleared).toMatchObject({ pause: false, complaintPause: false, complaints: 0, clearedThrough: "2026-10-21" });

    // A new complaint after the clearance pauses again.
    stores.replies.append([makeReply({ class: "complaint", received_at: "2026-10-22T09:00:00Z" })]);
    expect(mailboxHealth(stores, config, MB1, TODAY).pause).toBe(true);
  });

  it("does not pause on a complaint when pause_on_complaint is off", () => {
    const { stores } = setup();
    const config = testConfig({ guardrails: { pause_on_complaint: false } });
    stores.replies.append([makeReply({ class: "complaint" })]);
    expect(mailboxHealth(stores, config, MB1, TODAY)).toMatchObject({ pause: false, complaints: 1 });
  });

  it("stops new step-1 sends, not follow-ups, when opt-outs pass 5% of the last 100 sends", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(20));
    stores.replies.append([makeReply({ class: "unsubscribe", opt_out: "Y" }), makeReply({ class: "not_interested", opt_out: "Y" })]);
    const h = mailboxHealth(stores, config, MB1, TODAY);
    expect(h).toMatchObject({ optOuts: 2, pause: false, pauseNew: true });
    expect(h.optOutRate).toBeCloseTo(0.1);
    expect(h.reasons[0]).toMatch(/opt-out rate 10% over the last 20 sends/);
  });

  it("waits for 20 sends before judging the opt-out rate", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(19));
    stores.replies.append([makeReply({ class: "unsubscribe", opt_out: "Y" }), makeReply({ class: "unsubscribe", opt_out: "Y" })]);
    expect(mailboxHealth(stores, config, MB1, TODAY).pauseNew).toBe(false);
  });

  it("matches the mailbox case-insensitively", () => {
    const { stores, config } = setup();
    stores.touches.append(makeTouches(5, { mailbox: MB1.toUpperCase() }));
    expect(mailboxHealth(stores, config, MB1, TODAY).sends).toBe(5);
  });
});
