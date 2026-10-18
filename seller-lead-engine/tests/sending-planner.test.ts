import { describe, expect, it } from "vitest";
import { Suppression } from "../src/compliance/suppression.ts";
import { planDay } from "../src/sending/planner.ts";
import { MB1, MB2, makeReply, makeTouch, makeTouches } from "./fixtures/sending/rows.ts";
import { makeProspect, tempStores, testConfig } from "./helpers.ts";

const TUE = "2026-10-20";
const NOW = new Date("2026-10-20T12:00:00Z");

/** Test config whose two mailboxes are in cold week 1 on TUE (cap 5 each) unless warm-up is given. */
function config(overrides: Record<string, unknown> = {}, warmup = "2026-09-29") {
  return testConfig({
    mailboxes: [
      { email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: warmup },
      { email: MB2, sender_name: "Frank Example", sender_title: "Principal", warmup_started: warmup },
    ],
    ...overrides,
  });
}

const many = (n: number, overrides = {}) => Array.from({ length: n }, (_, i) => makeProspect({ score: 90 - i, ...overrides }));

describe("send days", () => {
  it("plans nothing on a day outside send_days, a federal holiday, Thanksgiving week or a configured holiday", () => {
    const stores = tempStores();
    stores.prospects.upsert(many(3));
    const c = config({ sending: { holidays: ["2026-12-22"] } });
    for (const day of ["2026-10-19", "2026-10-23", "2026-10-24", "2026-11-11", "2026-11-26", "2026-12-22"]) {
      const plan = planDay(stores, c, { today: day });
      expect(plan.sendDay, day).toBe(false);
      expect(plan.items).toEqual([]);
      expect(plan.reason).toBeTruthy();
    }
    expect(planDay(stores, c, { today: "2026-11-11" }).reason).toMatch(/federal holiday/);
    expect(planDay(stores, c, { today: TUE }).sendDay).toBe(true);
  });
});

describe("new step-1 sends", () => {
  it("takes scored prospects in the send tiers by score, skipping anything unsendable, suppressed or out of state", () => {
    const stores = tempStores();
    const good = [makeProspect({ score: 70 }), makeProspect({ score: 95 }), makeProspect({ score: 80, email_verification: "catch_all" })];
    const tierC = makeProspect({ tier: "C", score: 40 });
    const unverified = makeProspect({ email_verification: "unknown", score: 99 });
    const suppressed = makeProspect({ score: 98 });
    const georgia = makeProspect({ state: "GA", zip: "30301", score: 97 });
    const canada = makeProspect({ email: "owner@shop.ca", score: 96 });
    const dnc = makeProspect({ status: "dnc", score: 100 });
    const held = makeProspect({ status: "hold", score: 100 });
    stores.prospects.upsert([...good, tierC, unverified, suppressed, georgia, canada, dnc, held]);
    new Suppression(stores.suppression).add(suppressed.email, "email", "opt_out", "manual", NOW);
    const plan = planDay(stores, config({ sending: { max_catch_all_share: 1 } }), { today: TUE });

    expect(plan.items.map((i) => i.prospectId)).toEqual([good[1]!.prospect_id, good[2]!.prospect_id, good[0]!.prospect_id]);
    expect(plan.items.every((i) => i.step === 1)).toBe(true);
    const why = Object.fromEntries(plan.skipped.map((s) => [s.prospectId, s.reason]));
    expect(why[unverified.prospect_id]).toMatch(/verification "unknown" is not sendable/);
    expect(why[suppressed.prospect_id]).toMatch(/^suppressed:/);
    expect(why[georgia.prospect_id]).toMatch(/^jurisdiction: GA is not in licensed_states/);
    expect(why[canada.prospect_id]).toMatch(/^jurisdiction: .*\.ca is a non-US country code/);
    for (const p of [tierC, dnc, held]) expect(plan.items.some((i) => i.prospectId === p.prospect_id)).toBe(false);
  });

  it("holds each mailbox to its ramp cap and spreads sends to the least-loaded mailbox", () => {
    const stores = tempStores();
    stores.prospects.upsert(many(15));
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items.length).toBe(10);
    expect(plan.items.filter((i) => i.mailbox === MB1).length).toBe(5);
    expect(plan.items.filter((i) => i.mailbox === MB2).length).toBe(5);
    expect(plan.items.slice(0, 2).map((i) => i.mailbox)).toEqual([MB1, MB2]);
    expect(plan.caps[MB1]).toEqual({ cap: 5, used: 5 });
    expect(plan.caps["domain:ambadvisory-mail.example"]).toEqual({ cap: 75, used: 10 });
    expect(plan.skipped.filter((s) => s.reason === "no sending capacity left today").length).toBe(5);
  });

  it("counts what already went out today against the cap", () => {
    const stores = tempStores();
    stores.prospects.upsert(many(15));
    stores.touches.append([...makeTouches(4, { mailbox: MB1, planned_for: TUE }), ...makeTouches(2, { mailbox: MB1, planned_for: TUE, status: "failed" }), ...makeTouches(3, { mailbox: MB1, planned_for: "2026-10-15" })]);
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items.filter((i) => i.mailbox === MB1).length).toBe(1);
    expect(plan.items.filter((i) => i.mailbox === MB2).length).toBe(5);
  });

  it("holds the sending domain to max_per_domain_per_day across its mailboxes", () => {
    const stores = tempStores();
    stores.prospects.upsert(many(15));
    const plan = planDay(stores, config({ sending: { max_per_domain_per_day: 7 } }), { today: TUE });
    expect(plan.items.length).toBe(7);
    expect(plan.caps["domain:ambadvisory-mail.example"]).toEqual({ cap: 7, used: 7 });
  });

  it("sends nothing new from a mailbox still warming up", () => {
    const stores = tempStores();
    stores.prospects.upsert(many(3));
    const plan = planDay(stores, config({}, "2026-10-10"), { today: TUE });
    expect(plan.items).toEqual([]);
    expect(plan.caps[MB1]).toEqual({ cap: 0, used: 0 });
  });

  it("keeps catch-all addresses to the configured share of the day's new sends", () => {
    const stores = tempStores();
    const valid = many(9);
    const catchAll = many(5, { email_verification: "catch_all", score: 99 });
    stores.prospects.upsert([...valid, ...catchAll]);
    const plan = planDay(stores, config({ mailboxes: [{ email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-01-01" }] }), { today: TUE });
    const ca = plan.items.filter((i) => catchAll.some((p) => p.prospect_id === i.prospectId));
    expect(plan.items.length).toBe(10);
    expect(ca.length).toBe(1);
    expect(plan.skipped.filter((s) => /catch-all share cap \(10%/.test(s.reason)).length).toBe(4);
  });

  it("never plans step 1 twice for the same prospect", () => {
    const stores = tempStores();
    const p = makeProspect();
    stores.prospects.upsert([p]);
    stores.touches.append([makeTouch({ prospect_id: p.prospect_id, status: "planned", planned_for: "2026-10-15" })]);
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items).toEqual([]);
    expect(plan.skipped).toContainEqual({ prospectId: p.prospect_id, reason: "already has an outreach touch" });
  });
});

describe("follow-ups", () => {
  function inSequence(overrides = {}) {
    return makeProspect({ status: "in_sequence", sequence_step: 1, mailbox: MB2, next_touch_date: TUE, last_touch_at: "2026-10-14T13:00:00Z", thread_id: "th-1", ...overrides });
  }

  it("go first, from the same mailbox as step 1, and use up cap before new sends", () => {
    const stores = tempStores();
    const due = inSequence();
    stores.prospects.upsert([due, ...many(15)]);
    stores.touches.append([makeTouch({ prospect_id: due.prospect_id, mailbox: MB2, planned_for: "2026-10-14", status: "drafted" })]);
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items[0]).toEqual({ prospectId: due.prospect_id, step: 2, mailbox: MB2 });
    expect(plan.items.length).toBe(10);
    expect(plan.items.filter((i) => i.mailbox === MB2).length).toBe(5);
  });

  it("are not planned before next_touch_date, after step 3, or for a prospect who replied", () => {
    const stores = tempStores();
    const early = inSequence({ next_touch_date: "2026-10-21" });
    const done = inSequence({ sequence_step: 3, next_touch_date: "" });
    const replied = inSequence();
    const autoReplied = inSequence();
    stores.prospects.upsert([early, done, replied, autoReplied]);
    stores.touches.append([early, done, replied, autoReplied].map((p) => makeTouch({ prospect_id: p.prospect_id, mailbox: MB2, status: "sent" })));
    stores.replies.append([makeReply({ prospect_id: replied.prospect_id, class: "question", mailbox: MB2 }), makeReply({ prospect_id: autoReplied.prospect_id, class: "auto_reply", mailbox: MB2 })]);
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items).toEqual([{ prospectId: autoReplied.prospect_id, step: 2, mailbox: MB2 }]);
    expect(plan.skipped).toContainEqual({ prospectId: replied.prospect_id, reason: expect.stringMatching(/^replied \(question reply R-\d+\): no follow-up/) });
  });

  it("wait until the previous step is recorded as drafted or sent", () => {
    const stores = tempStores();
    const p = inSequence();
    stores.prospects.upsert([p]);
    stores.touches.append([makeTouch({ prospect_id: p.prospect_id, mailbox: MB2, status: "planned" })]);
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/step 1 is not yet recorded as drafted or sent \(T-\d+ is planned\): step 2 waits/);
  });

  it("never switch mailboxes: a paused or removed step-1 mailbox holds the follow-up", () => {
    const stores = tempStores();
    const paused = inSequence();
    const removed = inSequence({ mailbox: "old@ambadvisory-mail.example" });
    stores.prospects.upsert([paused, removed]);
    stores.touches.append([makeTouch({ prospect_id: paused.prospect_id, mailbox: MB2 }), makeTouch({ prospect_id: removed.prospect_id, mailbox: "old@ambadvisory-mail.example" })]);
    const c = config({
      mailboxes: [
        { email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01" },
        { email: MB2, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01", paused: true },
      ],
    });
    const plan = planDay(stores, c, { today: TUE });
    expect(plan.items).toEqual([]);
    const why = Object.fromEntries(plan.skipped.map((s) => [s.prospectId, s.reason]));
    expect(why[paused.prospect_id]).toMatch(/mailbox frank\.e@.* is paused: paused in config/);
    expect(why[removed.prospect_id]).toMatch(/not in config\.mailboxes: follow-ups only go from the same mailbox/);
    expect(plan.paused[MB2]).toEqual(["paused in config"]);
  });
});

describe("pauses", () => {
  it("pauses every mailbox after a spam complaint on one of them", () => {
    const stores = tempStores();
    stores.prospects.upsert(many(4));
    stores.replies.append([makeReply({ class: "complaint", mailbox: MB1 })]);
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items).toEqual([]);
    expect(plan.caps[MB1]!.cap).toBe(0);
    expect(plan.caps[MB2]!.cap).toBe(0);
    expect(plan.paused[MB2]![0]).toMatch(/spam complaint on frank@.*every mailbox pauses/);
    expect(plan.skipped.every((s) => s.reason === "no healthy mailbox can take new step-1 sends today")).toBe(true);
  });

  it("moves new sends off a mailbox with too many opt-outs but keeps its follow-ups", () => {
    const stores = tempStores();
    const due = makeProspect({ status: "in_sequence", sequence_step: 1, mailbox: MB1, next_touch_date: TUE });
    stores.prospects.upsert([due, ...many(3)]);
    stores.touches.append([makeTouch({ prospect_id: due.prospect_id, mailbox: MB1, planned_for: "2026-10-14" }), ...makeTouches(20, { mailbox: MB1, planned_for: "2026-10-14" })]);
    stores.replies.append([1, 2, 3].map(() => makeReply({ class: "unsubscribe", opt_out: "Y", mailbox: MB1, received_at: "2026-10-15T10:00:00Z" })));
    const plan = planDay(stores, config(), { today: TUE });
    expect(plan.items[0]).toEqual({ prospectId: due.prospect_id, step: 2, mailbox: MB1 });
    expect(plan.items.slice(1).every((i) => i.mailbox === MB2)).toBe(true);
    expect(plan.items.length).toBe(4);
    expect(plan.paused[MB1]![0]).toMatch(/^new sends only: opt-out rate/);
  });
});
