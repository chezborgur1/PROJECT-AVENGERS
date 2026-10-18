import type { MailboxLogRow, ReplyRow, TouchRow } from "../../../src/domain/schema.ts";

// Row builders for the sending tests: valid touches, replies and mailbox
// log rows with blank defaults, so a test sets only what it is about.

export const MB1 = "frank@ambadvisory-mail.example";
export const MB2 = "frank.e@ambadvisory-mail.example";

let touchSeq = 900_000;
/** An outreach touch from MB1, drafted, for a prospect. */
export function makeTouch(overrides: Partial<TouchRow> = {}): TouchRow {
  touchSeq++;
  return {
    touch_id: `T-${touchSeq}`,
    prospect_id: "P-00001",
    kind: "outreach",
    step: 1,
    mailbox: MB1,
    to_email: "owner@example.com",
    subject: "Exit-readiness check for Example Air",
    body_sha256: "",
    planned_for: "2026-10-20",
    status: "drafted",
    mode: "draft",
    message_id: "",
    thread_id: "",
    draft_id: "",
    error: "",
    created_at: "2026-10-20T13:00:00Z",
    updated_at: "2026-10-20T13:00:00Z",
    ...overrides,
  };
}

/** Many drafted touches from one mailbox on one day. */
export function makeTouches(n: number, overrides: Partial<TouchRow> = {}): TouchRow[] {
  return Array.from({ length: n }, (_, i) => makeTouch({ prospect_id: `P-${String(50_000 + i)}`, ...overrides }));
}

let replySeq = 0;
/** A reply row received by MB1. */
export function makeReply(overrides: Partial<ReplyRow> = {}): ReplyRow {
  replySeq++;
  return {
    reply_id: `R-${replySeq}`,
    prospect_id: "",
    thread_id: "",
    mailbox: MB1,
    from_email: "owner@example.com",
    subject: "Re: Exit-readiness check",
    received_at: "2026-10-20T15:00:00Z",
    snippet: "",
    class: "interested",
    classifier: "rules",
    opt_out: "N",
    bounce_type: "",
    processed_at: "2026-10-20T15:05:00Z",
    response_touch_id: "",
    error: "",
    ...overrides,
  };
}

/** A mailbox log row for MB1. */
export function makeLog(overrides: Partial<MailboxLogRow> = {}): MailboxLogRow {
  return {
    date: "2026-10-20",
    mailbox: MB1,
    sent: undefined,
    drafted: undefined,
    hard_bounces: undefined,
    soft_bounces: undefined,
    complaints: undefined,
    opt_outs: undefined,
    human_replies: undefined,
    paused: "N",
    pause_reason: "",
    ...overrides,
  };
}
