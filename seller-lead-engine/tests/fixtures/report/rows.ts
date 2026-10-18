import type { MailboxLogRow, ReplyRow, SuppressionRow, TouchRow } from "../../../src/domain/schema.ts";

// Row builders for the report, handoff and export tests: valid typed rows
// with plain defaults, so each test states only the fields it is about.

let touchSeq = 0;
/** An outreach touch sent from the first test mailbox. */
export function makeTouch(overrides: Partial<TouchRow> = {}): TouchRow {
  touchSeq++;
  return {
    touch_id: `T-${String(touchSeq).padStart(6, "0")}`,
    prospect_id: "P-00001",
    kind: "outreach",
    step: 1,
    mailbox: "frank@ambadvisory-mail.example",
    to_email: "owner@example.com",
    subject: "Exit-readiness check for Example Air",
    body_sha256: "0".repeat(64),
    planned_for: "",
    status: "sent",
    mode: "send",
    message_id: "",
    thread_id: "",
    draft_id: "",
    error: "",
    created_at: "2026-10-14T13:00:00Z",
    updated_at: "2026-10-14T13:05:00Z",
    ...overrides,
  };
}

let replySeq = 0;
/** A human reply to the first test mailbox. */
export function makeReply(overrides: Partial<ReplyRow> = {}): ReplyRow {
  replySeq++;
  return {
    reply_id: `R-${replySeq}`,
    prospect_id: "P-00001",
    thread_id: "",
    mailbox: "frank@ambadvisory-mail.example",
    from_email: "owner@example.com",
    subject: "Re: Exit-readiness check",
    received_at: "2026-10-15T15:00:00Z",
    snippet: "Sure, send it over.",
    class: "interested",
    classifier: "rules",
    opt_out: "N",
    bounce_type: "",
    processed_at: "2026-10-15T15:05:00Z",
    response_touch_id: "",
    error: "",
    ...overrides,
  };
}

/** A permanent suppression row. */
export function makeSuppression(value: string, value_type: SuppressionRow["value_type"], reason: SuppressionRow["reason"] = "opt_out"): SuppressionRow {
  return { value, value_type, reason, source: "test", added_at: "2026-10-01T00:00:00Z" };
}

/** A mailbox health log row. */
export function makeMailboxLog(overrides: Partial<MailboxLogRow> = {}): MailboxLogRow {
  return {
    date: "2026-10-16",
    mailbox: "frank@ambadvisory-mail.example",
    sent: 10,
    drafted: 0,
    hard_bounces: 0,
    soft_bounces: 0,
    complaints: 0,
    opt_outs: 0,
    human_replies: 0,
    paused: "N",
    pause_reason: "",
    ...overrides,
  };
}
