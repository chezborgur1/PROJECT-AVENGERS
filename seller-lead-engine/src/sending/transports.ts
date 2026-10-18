import fs from "node:fs";
import path from "node:path";
import { mailboxDomain } from "../config.ts";
import type { DeliveryResult, OutgoingMessage } from "../domain/messages.ts";
import { GmailTokenRefresher } from "../util/gmailAuth.ts";
import { base64url, buildMime } from "./mime.ts";

// How a rendered, gated message leaves the engine. Every transport takes a
// message that has already passed `assertSendable`; none of them checks
// compliance itself, so nothing reaches a transport except through the gate.

/** Delivers one message as a draft (a person sends it) or sends it. */
export interface Transport {
  readonly name: string;
  deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult>;
}

/** Records every message in memory: tests and the offline demo. */
export class MemoryTransport implements Transport {
  readonly name = "memory";
  readonly delivered: { msg: OutgoingMessage; mode: "draft" | "send" }[] = [];

  async deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult> {
    this.delivered.push({ msg, mode });
    const n = this.delivered.length;
    return { messageId: `mem-${n}`, threadId: msg.threadId ?? `thread-${msg.prospectId}`, ...(mode === "draft" ? { draftId: `draft-${n}` } : {}) };
  }
}

// ---------------------------------------------------------------- outbox (Claude Gmail connector)

// The outbox transport hands each message to a Claude scheduled task that
// works through it with the Gmail connector (docs/research/deliverability.md
// section 4). The connector's create_draft takes to, subject, plain body and
// replyToMessageId; send_message takes replyThreadId. It cannot set custom
// headers (no List-Unsubscribe, no List-Unsubscribe-Post) and it sends only
// as the account it is signed in to. So in this mode the body's opt-out
// sentence is the opt-out mechanism, and every checklist item names the
// mailbox so a routine signed in to another account leaves it alone.
//
// Nothing is created in Gmail here: ids come back later through
// `npm run engine -- record <touchId> ...`, which calls recordDelivery.

/** An outgoing message plus the Gmail message id a threaded connector draft replies to (follow-ups only). */
export interface OutboxMessage extends OutgoingMessage {
  replyToMessageId?: string;
}

/** What the outbox file tells the connector to call, argument for argument. */
export interface ConnectorCall {
  tool: "create_draft" | "send_message";
  /** The account the connector must be signed in to. */
  mailbox: string;
  args: { to: string[]; subject: string; body: string; includeSignature: false; replyToMessageId?: string; replyThreadId?: string };
  /** The command to run afterwards, with the ids filled in. */
  record: string;
}

/** The connector call for a message in a mode. */
export function connectorCall(msg: OutboxMessage, mode: "draft" | "send"): ConnectorCall {
  const args: ConnectorCall["args"] = { to: [msg.to], subject: msg.subject, body: msg.body, includeSignature: false };
  if (mode === "draft") {
    if (msg.replyToMessageId) args.replyToMessageId = msg.replyToMessageId;
    return { tool: "create_draft", mailbox: msg.mailbox, args, record: `npm run engine -- record ${msg.touchId} drafted --draft-id <draft id> --thread-id <threadId>` };
  }
  if (msg.threadId) args.replyThreadId = msg.threadId;
  else if (msg.replyToMessageId) args.replyToMessageId = msg.replyToMessageId;
  return { tool: "send_message", mailbox: msg.mailbox, args, record: `npm run engine -- record ${msg.touchId} sent --message-id <id> --thread-id <threadId>` };
}

function outboxReadmeHeader(today: string): string {
  return [
    `# Outbox for ${today}`,
    "",
    "Each item below is one gated, compliance-checked email the seller lead engine wants created in Gmail.",
    "Work through the unchecked items in order with the Claude Gmail connector, then tick each box.",
    "",
    "Rules for every item:",
    "",
    "1. Open `<touchId>.json` in this folder and call the tool named in `connector.tool` with exactly the arguments in `connector.args`. Do not edit the subject or the body: they passed the compliance gate as written.",
    "2. The body is plain text with the signature, postal address and opt-out already in it. Keep `includeSignature` false. Add no links, images or attachments.",
    "3. The connector cannot set List-Unsubscribe or List-Unsubscribe-Post headers, so in this mode the opt-out line in the body (\"Reply 'unsubscribe' and I will not email you again.\") is the opt-out mechanism. Never remove or reword it.",
    "4. The connector sends only as the account it is signed in to. Work only items whose mailbox is that account; leave the others for the routine signed in to that mailbox. Never send one mailbox's item from another.",
    "5. A follow-up draft carries `replyToMessageId`, so Gmail threads it under step 1 and quotes the earlier email below the new text. That is expected. If an item has a `threadId` but no `replyToMessageId`, call get_thread on the threadId and use the id of the latest message sent from the item's mailbox.",
    "6. Right after the tool returns, run the item's record command with the returned ids, so the engine knows the email exists and can schedule the next step.",
    "7. If the tool fails, run `npm run engine -- record <touchId> failed --error \"<the error>\"` and move on.",
    "",
  ].join("\n");
}

/** Writes each message to <outbox>/<today>/<touchId>.json and a README.md checklist the Claude Gmail connector routine works through. */
export class OutboxTransport implements Transport {
  readonly name = "outbox";

  constructor(
    readonly outboxDir: string,
    readonly today: string,
  ) {}

  /** The folder for today's files. */
  get dir(): string {
    return path.join(this.outboxDir, this.today);
  }

  async deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult> {
    const m = msg as OutboxMessage;
    if (!/^[A-Za-z0-9_-]+$/.test(m.touchId)) throw new Error(`Touch id "${m.touchId}" is not safe as a file name`);
    fs.mkdirSync(this.dir, { recursive: true });
    const call = connectorCall(m, mode);
    const file = path.join(this.dir, `${m.touchId}.json`);
    fs.writeFileSync(file, `${JSON.stringify({ ...m, mode, connector: call }, null, 2)}\n`);

    const readme = path.join(this.dir, "README.md");
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, outboxReadmeHeader(this.today));
    const threading = call.args.replyToMessageId ? `, replyToMessageId ${call.args.replyToMessageId}` : call.args.replyThreadId ? `, replyThreadId ${call.args.replyThreadId}` : m.threadId ? `, thread ${m.threadId} (look up the message id)` : "";
    const item = [
      `- [ ] **${m.touchId}** ${m.kind}${m.step ? ` step ${m.step}` : ""} to ${m.to} from mailbox ${m.mailbox}`,
      `  1. Signed in as ${m.mailbox}? Then call \`${call.tool}\` with \`connector.args\` from \`${m.touchId}.json\` (subject "${m.subject}"${threading}).`,
      `  2. Then run: \`${call.record}\``,
      "",
    ].join("\n");
    fs.appendFileSync(readme, `${item}\n`);
    // Ids are recorded later by the routine (recordDelivery), so none come back now.
    return {};
  }
}

// ---------------------------------------------------------------- Gmail API

// Direct Gmail API delivery (sending.transport = "gmail_api"), for several
// mailboxes and real RFC 8058 headers, which the connector cannot set
// (deliverability.md section 4, Option B). Credentials and the OAuth
// refresh come from src/util/gmailAuth.ts, the one loader the inbox reader
// shares; the tokens-file format is documented there.
//
// Endpoints: POST https://gmail.googleapis.com/gmail/v1/users/me/drafts with
// { message: { raw, threadId } } or .../users/me/messages/send with
// { raw, threadId }, where raw is the base64url RFC 5322 message.

export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Drafts or sends through the Gmail API with an OAuth refresh per mailbox. */
export class GmailApiTransport implements Transport {
  readonly name = "gmail_api";
  private readonly fetchImpl: typeof fetch;
  private readonly auth: GmailTokenRefresher;

  constructor(private readonly opts: { tokensFile: string; fetchImpl?: typeof fetch; now: Date }) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.auth = new GmailTokenRefresher(opts);
  }

  /** A fresh access token for the mailbox, refreshed once per run and reused until a minute before it expires. */
  accessToken(mailbox: string): Promise<string> {
    return this.auth.accessToken(mailbox);
  }

  async deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult> {
    const token = await this.accessToken(msg.mailbox);
    const raw = base64url(buildMime(msg, { date: this.opts.now, messageIdDomain: mailboxDomain(msg.mailbox) }));
    const message = msg.threadId ? { raw, threadId: msg.threadId } : { raw };
    const url = mode === "draft" ? `${GMAIL_API}/drafts` : `${GMAIL_API}/messages/send`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(mode === "draft" ? { message } : message),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Gmail ${mode === "draft" ? "drafts.create" : "messages.send"} for ${msg.touchId} failed (HTTP ${res.status}): ${snippet(text)}`);
    const body = safeJson(text) as { id?: string; threadId?: string; message?: { id?: string; threadId?: string } };
    if (mode === "draft") {
      const out: DeliveryResult = {};
      if (body.id) out.draftId = body.id;
      if (body.message?.id) out.messageId = body.message.id;
      if (body.message?.threadId) out.threadId = body.message.threadId;
      return out;
    }
    const out: DeliveryResult = {};
    if (body.id) out.messageId = body.id;
    if (body.threadId) out.threadId = body.threadId;
    return out;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function snippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 300);
}
