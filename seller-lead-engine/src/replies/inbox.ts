import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { InboundMessage } from "../domain/messages.ts";
import { isoStamp } from "../util/dates.ts";
import { GmailTokenRefresher } from "../util/gmailAuth.ts";

// Where received mail comes from. Two sources, one shape (InboundMessage):
//
// 1. A folder of JSON files (data/inbox/) that the Claude Gmail connector
//    routine writes: it runs search_threads, then get_thread with PLAIN_TEXT
//    on each hit (the search preview shows only the oldest messages of a
//    thread), and saves each message. get_thread has no headers, so
//    `headers` is usually empty and detection falls back to text
//    (docs/research/deliverability.md section 4 and the inbox loop in
//    section 6). The reader never moves or deletes a file: replies.csv
//    dedupes by message id, so re-reading the folder is harmless.
// 2. The Gmail API, with an OAuth refresh token per mailbox, when the engine
//    reads mail itself (deliverability.md section 4, option B). It returns
//    headers, so Auto-Submitted and DSN headers are available. Credentials
//    come from src/util/gmailAuth.ts, shared with the Gmail API sender.
//
// No clock reads and no implicit network: the API client takes `now` and a
// `fetchImpl`.

const HeaderMap = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]).transform((v) => (v === null ? "" : String(v))));

/** One message as a connector routine writes it. `text` may be given as `body`; header names are lower-cased on read. */
export const InboundFileSchema = z
  .object({
    id: z.string().min(1),
    threadId: z.string().default(""),
    mailbox: z.string().default(""),
    from: z.string().min(1),
    to: z.string().default(""),
    subject: z.string().default(""),
    date: z.string().default(""),
    text: z.string().optional(),
    body: z.string().optional(),
    headers: HeaderMap.default({}),
  })
  .refine((m) => m.text !== undefined || m.body !== undefined, { message: "text: the message needs a text (or body) field" });

/** Lower-cased header names; the last value wins when a name repeats. */
export function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.trim().toLowerCase(), v]));
}

function toInbound(m: z.infer<typeof InboundFileSchema>): InboundMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    mailbox: m.mailbox,
    from: m.from,
    to: m.to,
    subject: m.subject,
    date: m.date,
    text: m.text ?? m.body ?? "",
    headers: lowerHeaders(m.headers),
  };
}

/** Every message in the *.json files of `dir` (one message or an array per file); bad files and entries are reported, never thrown. Moves nothing. */
export function readInboxFolder(dir: string): { messages: InboundMessage[]; invalid: { file: string; error: string }[] } {
  const messages: InboundMessage[] = [];
  const invalid: { file: string; error: string }[] = [];
  if (!fs.existsSync(dir)) return { messages, invalid };
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".json"))
    .map((d) => d.name)
    .sort();
  for (const name of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch (err) {
      invalid.push({ file: name, error: `not valid JSON: ${(err as Error).message}` });
      continue;
    }
    const items = Array.isArray(raw) ? raw : [raw];
    items.forEach((item, i) => {
      const label = Array.isArray(raw) ? `${name}[${i}]` : name;
      const result = InboundFileSchema.safeParse(item);
      if (result.success) messages.push(toInbound(result.data));
      else invalid.push({ file: label, error: result.error.issues.map((iss) => `${iss.path.join(".") || "(root)"}: ${iss.message}`).join("; ") });
    });
  }
  return { messages, invalid };
}

// ---------------------------------------------------------------- Gmail API

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

/** Decode Gmail's base64url body data as UTF-8. */
export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Plain text of an HTML body: tags out, breaks kept, common entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first text/plain part (depth first), else the first text/html part as text, else the report parts joined (DSNs). */
function bodyText(part: GmailPart | undefined): string {
  if (!part) return "";
  const all: GmailPart[] = [];
  const walk = (p: GmailPart) => {
    all.push(p);
    for (const c of p.parts ?? []) walk(c);
  };
  walk(part);
  const data = (p: GmailPart) => (p.body?.data ? decodeBase64Url(p.body.data) : "");
  const plain = all.find((p) => p.mimeType === "text/plain" && p.body?.data);
  // A DSN's machine-readable part (message/delivery-status) carries the Status: field; keep it with the prose.
  const report = all.filter((p) => p.mimeType === "message/delivery-status" && p.body?.data).map(data);
  if (plain) return [data(plain), ...report].join("\n");
  const html = all.find((p) => p.mimeType === "text/html" && p.body?.data);
  if (html) return [htmlToText(data(html)), ...report].join("\n");
  return report.join("\n");
}

/** Reads a mailbox over the Gmail API (users.messages.list and get, format full), one OAuth refresh per mailbox. */
export class GmailApiInbox {
  private readonly fetchImpl: typeof fetch;
  private readonly auth: GmailTokenRefresher;
  /** Most messages read per call; a cap so one run never pages forever. */
  maxMessages = 500;

  constructor(opts: { tokensFile: string; fetchImpl?: typeof fetch; now: Date }) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    // The same loader and refresher as GmailApiTransport (src/util/gmailAuth.ts).
    this.auth = new GmailTokenRefresher(opts);
  }

  private async get<T>(mailbox: string, url: string): Promise<T> {
    const token = await this.auth.accessToken(mailbox);
    const res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Gmail API ${res.status} for ${mailbox}: ${detail}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Inbox messages received at or after `sinceIso`, oldest first, excluding
   * mail the mailbox sent itself. `scope` replaces "in:inbox" (the buyer
   * inbox's history search reads archived mail too: "-in:sent -in:chats").
   */
  async fetchSince(mailbox: string, sinceIso: string, scope = "in:inbox"): Promise<InboundMessage[]> {
    const since = Date.parse(sinceIso);
    if (!Number.isFinite(since)) throw new Error(`Not an ISO date or timestamp: "${sinceIso}"`);
    // Gmail's after: takes epoch seconds; -from:me leaves out the engine's own sends in the same threads.
    const q = `${scope} after:${Math.floor(since / 1000)} -from:me`.trim();
    const base = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
    const ids: { id: string; threadId: string }[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q, maxResults: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await this.get<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(mailbox, `${base}?${params}`);
      ids.push(...(page.messages ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < this.maxMessages);

    const out: InboundMessage[] = [];
    for (const { id } of ids.slice(0, this.maxMessages)) {
      const m = await this.get<GmailMessage>(mailbox, `${base}/${encodeURIComponent(id)}?format=full`);
      out.push(toInboundFromGmail(m, mailbox));
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** One Gmail API message (format full) as an InboundMessage. */
export function toInboundFromGmail(m: GmailMessage, mailbox: string): InboundMessage {
  const headers: Record<string, string> = {};
  for (const h of m.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const ms = Number(m.internalDate);
  const date = Number.isFinite(ms) && m.internalDate ? isoStamp(new Date(ms)) : headers.date && Number.isFinite(Date.parse(headers.date)) ? isoStamp(new Date(Date.parse(headers.date))) : "";
  return {
    id: m.id,
    threadId: m.threadId,
    mailbox,
    from: headers.from ?? "",
    to: headers.to ?? "",
    subject: headers.subject ?? "",
    date,
    text: bodyText(m.payload),
    headers,
  };
}
