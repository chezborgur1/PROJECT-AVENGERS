import { describe, expect, it } from "vitest";
import type { Mailbox } from "../src/config.ts";
import { coldStartDate, coldWeek, mailboxDailyCap } from "../src/sending/ramp.ts";
import { testConfig } from "./helpers.ts";

const box = (overrides: Partial<Mailbox> = {}): Mailbox => ({ email: "frank@ambadvisory-mail.example", sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-10-01", paused: false, ...overrides });

describe("cold week", () => {
  const config = testConfig(); // warmup_weeks 3, ramp [5, 10, 15, 20]

  it("is 0 before warm-up starts and through the warm-up weeks", () => {
    expect(coldWeek(box(), config, "2026-09-30")).toBe(0);
    expect(coldWeek(box(), config, "2026-10-01")).toBe(0);
    expect(coldWeek(box(), config, "2026-10-21")).toBe(0); // day 20, the last warm-up day
  });

  it("counts 1, 2, 3 ... from the first day after warm-up", () => {
    expect(coldStartDate(box(), config)).toBe("2026-10-22");
    expect(coldWeek(box(), config, "2026-10-22")).toBe(1);
    expect(coldWeek(box(), config, "2026-10-28")).toBe(1);
    expect(coldWeek(box(), config, "2026-10-29")).toBe(2);
    expect(coldWeek(box(), config, "2027-01-07")).toBe(12);
  });

  it("starts cold sending on day one when warm-up is set to 0 weeks", () => {
    const c = testConfig({ sending: { warmup_weeks: 0 } });
    expect(coldWeek(box(), c, "2026-10-01")).toBe(1);
  });
});

describe("daily cap", () => {
  it("is 0 while warming up, then follows the ramp week by week and holds the last entry", () => {
    const config = testConfig();
    expect(mailboxDailyCap(box(), config, "2026-10-21")).toBe(0);
    expect(mailboxDailyCap(box(), config, "2026-10-22")).toBe(5);
    expect(mailboxDailyCap(box(), config, "2026-10-29")).toBe(10);
    expect(mailboxDailyCap(box(), config, "2026-11-05")).toBe(15);
    expect(mailboxDailyCap(box(), config, "2026-11-12")).toBe(20);
    expect(mailboxDailyCap(box(), config, "2027-03-01")).toBe(20);
  });

  it("never exceeds max_per_mailbox_per_day or the mailbox's own max_per_day", () => {
    const config = testConfig({ sending: { ramp: [5, 40, 80], max_per_mailbox_per_day: 25 } });
    expect(mailboxDailyCap(box(), config, "2026-10-29")).toBe(25);
    expect(mailboxDailyCap(box({ max_per_day: 12 }), config, "2026-11-30")).toBe(12);
    expect(mailboxDailyCap(box({ max_per_day: 12 }), config, "2026-10-22")).toBe(5);
  });

  it("is 0 for a paused mailbox and for an empty ramp", () => {
    expect(mailboxDailyCap(box({ paused: true }), testConfig(), "2026-12-01")).toBe(0);
    expect(mailboxDailyCap(box(), testConfig({ sending: { ramp: [] } }), "2026-12-01")).toBe(0);
  });
});
