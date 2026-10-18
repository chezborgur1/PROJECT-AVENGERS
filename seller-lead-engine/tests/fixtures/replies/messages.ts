import type { InboundMessage } from "../../../src/domain/messages.ts";

// Inbound messages for the reply tests. Bodies follow the shapes real
// clients produce (Gmail, Outlook, Apple Mail, Postfix and Exchange bounce
// reports). Headers are empty unless a test is about headers, because the
// Claude Gmail connector's get_thread returns none
// (docs/research/deliverability.md section 4).

export const MAILBOX = "frank@ambadvisory-mail.example";

let n = 0;
/** An inbound message with sensible defaults: a plain reply from an owner, no headers. */
export function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  n++;
  return {
    id: `msg-${n}`,
    threadId: `thread-${n}`,
    mailbox: MAILBOX,
    from: "John Example <john@exampleair.example>",
    to: MAILBOX,
    subject: "Re: Exit-readiness check for Example Air",
    date: "2026-10-17T13:00:00Z",
    text: "Yes, I would like that.",
    headers: {},
    ...overrides,
  };
}

/** A Gmail reply with the attribution on two lines and the quoted outreach below it. */
export const GMAIL_REPLY = [
  "Sure, send the questions over.",
  "",
  "John",
  "",
  "On Tue, Oct 13, 2026 at 9:02 AM Frank Example, AMB Advisory Services <",
  "frank@ambadvisory-mail.example> wrote:",
  "",
  "> Hi John,",
  "> AMB Advisory offers a free exit-readiness check.",
  "> Reply 'unsubscribe' and I will not email you again.",
].join("\n");

/** An Outlook reply with the underscore rule and a From/Sent header block. */
export const OUTLOOK_REPLY = [
  "Not right now, maybe in a couple of years.",
  "",
  "Sent from my iPhone",
  "",
  "________________________________",
  "From: Frank Example <frank@ambadvisory-mail.example>",
  "Sent: Tuesday, October 13, 2026 9:02 AM",
  "To: John Example",
  "Subject: Exit-readiness check for Example Air",
  "",
  "Hi John,",
  "Reply 'unsubscribe' and I will not email you again.",
].join("\r\n");

/** A Gmail hard bounce (no headers, as the connector returns it). */
export function gmailHardBounce(recipient: string): InboundMessage {
  return inbound({
    from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    subject: "Delivery Status Notification (Failure)",
    text: [
      "** Address not found **",
      "",
      `Your message wasn't delivered to ${recipient} because the address couldn't be found, or is unable to receive mail.`,
      "",
      "The response from the remote server was:",
      `550 5.1.1 The email account that you tried to reach does not exist.`,
      "",
      "----- Original message -----",
      "Reply 'unsubscribe' and I will not email you again.",
    ].join("\n"),
  });
}

/** An Outlook.com authentication rejection in the revised "550; 5.7.515" form. */
export function outlookAuthBounce(recipient: string): InboundMessage {
  return inbound({
    from: "postmaster@outlook.com",
    subject: "Undeliverable: Exit-readiness check for Example Air",
    text: [
      "Delivery has failed to these recipients or groups:",
      "",
      recipient,
      "",
      "Remote server returned '550; 5.7.515 Access denied, sending domain ambadvisory-mail.example does not meet the required authentication level.'",
    ].join("\n"),
  });
}

/** A Gmail delay notice: temporary. */
export function gmailDelay(recipient: string): InboundMessage {
  return inbound({
    from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
    subject: "Delivery Status Notification (Delay)",
    text: [`There was a temporary problem delivering your message to ${recipient}. Gmail will retry for 47 more hours.`, "", "The response was:", "452 4.2.2 The recipient's inbox is out of storage space."].join("\n"),
  });
}

/** An out-of-office reply with no headers. */
export const OOO_TEXT = "Thank you for your email. I am out of the office until Monday, October 26 with limited access to email. For urgent matters, please call the office at 813-555-0100.";
