import type { EngineConfig } from "../../../src/config.ts";
import type { OutgoingMessage } from "../../../src/domain/messages.ts";
import type { ProspectRow } from "../../../src/domain/schema.ts";
import { adNotice, aiDisclosure, buildFooter, listUnsubscribeHeaders } from "../../../src/compliance/footer.ts";

// Clean outreach and reply messages for the lint and gate tests: each passes
// every check, so a test changes one thing and expects exactly that reason.

/** A step-1 body that passes the copy lint (under 110 words, no link, no question). */
export const STEP1_BODY = [
  "Hi John,",
  "",
  "I am Frank Example with AMB Advisory Services in Tampa. Example Air has held its Florida licence since 1994, and owners with that record often want to know where they stand.",
  "",
  "AMB Advisory offers a free exit-readiness check: a rough value range and the checklist buyers use. It is free and carries no obligation.",
  "",
  'If you would like one, reply "yes" and I will send the short list of questions.',
  "",
  "Frank",
].join("\n");

export const REPLY_BODY = [
  "Hi John,",
  "",
  "Thank you for writing back. The exit-readiness check from AMB Advisory Services is free and there is no obligation.",
  "",
  "To prepare it, could you tell me your rough annual revenue and how many people work for you?",
].join("\n");

/** An outreach message to `p` from the config's first mailbox, footer and ad notice included. */
export function outreachMessage(config: EngineConfig, p: ProspectRow, overrides: Partial<OutgoingMessage> = {}): OutgoingMessage {
  const mailbox = config.mailboxes[0]!;
  return {
    touchId: "T-000001",
    prospectId: p.prospect_id,
    kind: "outreach",
    step: 1,
    mailbox: mailbox.email,
    fromName: `${mailbox.sender_name}, ${config.firm.name}`,
    to: p.email,
    subject: "Exit-readiness check for Example Air",
    body: `${STEP1_BODY}\n\n${adNotice(config)}\n\n${buildFooter(config, mailbox)}`,
    headers: listUnsubscribeHeaders(config, mailbox, "T-000001"),
    ...overrides,
  };
}

/** A drafted reply to `p`, AI disclosure and footer included. */
export function replyMessage(config: EngineConfig, p: ProspectRow, overrides: Partial<OutgoingMessage> = {}): OutgoingMessage {
  const mailbox = config.mailboxes[0]!;
  return {
    touchId: "T-000002",
    prospectId: p.prospect_id,
    kind: "reply",
    mailbox: mailbox.email,
    fromName: `${mailbox.sender_name}, ${config.firm.name}`,
    to: p.email,
    subject: "Re: Exit-readiness check for Example Air",
    body: `${REPLY_BODY}\n\n${aiDisclosure(config, mailbox)}\n\n${buildFooter(config, mailbox)}`,
    headers: {},
    threadId: "thread-1",
    ...overrides,
  };
}
