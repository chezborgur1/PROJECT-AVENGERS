// The two message shapes every transport and inbox source speaks. Outgoing
// messages are plain text only: no tracking pixel, no tracked links, no
// attachments (docs/research/deliverability.md).

export interface OutgoingMessage {
  touchId: string;
  prospectId: string;
  kind: "outreach" | "reply";
  /** 1-3 for outreach. */
  step?: number;
  /** The sending mailbox address (config.mailboxes[].email). */
  mailbox: string;
  /** Display name: the real sender, then the firm ("Frank Smith, AMB Advisory Services"). */
  fromName: string;
  to: string;
  subject: string;
  /** Plain-text body, footer included. */
  body: string;
  /** Extra headers (List-Unsubscribe, List-Unsubscribe-Post, In-Reply-To, References). */
  headers: Record<string, string>;
  /** Gmail thread to reply into, when known. */
  threadId?: string;
}

export interface DeliveryResult {
  messageId?: string;
  threadId?: string;
  draftId?: string;
}

/** One received message, from the Gmail API or a JSON file the Claude Gmail connector wrote to data/inbox/. */
export interface InboundMessage {
  /** The mailbox's message id; the engine's dedupe key. */
  id: string;
  threadId: string;
  /** The AMB mailbox that received it. */
  mailbox: string;
  from: string;
  to: string;
  subject: string;
  /** ISO timestamp. */
  date: string;
  /** Plain-text body as received (quoted history included; `stripQuoted` removes it). */
  text: string;
  /** Lower-cased header names. Empty when the source cannot read headers. */
  headers: Record<string, string>;
}
