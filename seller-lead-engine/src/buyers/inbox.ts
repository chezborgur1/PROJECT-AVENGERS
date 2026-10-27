import crypto from "node:crypto";
import type { EngineConfig } from "../config.ts";
import { canonicalEmail, Suppression } from "../compliance/suppression.ts";
import type { InboundMessage } from "../domain/messages.ts";
import { normalizeEmail } from "../domain/schema.ts";
import { optOutIn, withoutOwnText } from "../replies/classify.ts";
import { htmlToText, lowerHeaders } from "../replies/inbox.ts";
import { addressOf, detectAutoReply, detectBounce, stripQuoted } from "../replies/parse.ts";
import { normalizePhone } from "../sources/normalize.ts";
import { forEachLine } from "../sources/sunbiz.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";
import { upsertBuyers, warmMailbox, type IncomingBuyer } from "./core.ts";
import { REGISTERED_STATUSES, type BuyerInboundRow, type BuyerLeadRow } from "./schema.ts";

// The buyer inbox: AMB's own mailbox, where listing sites deliver buyer
// inquiries and where warm buyers answer. Each message is read once
// (buyers/inbound.csv) and becomes one of:
//
// - an inquiry: a listing site's notification (BizBuySell, BizQuest, Axial
//   and the others in buyers.inquiry_senders) names a buyer, their address
//   and the listing. They become an "inquirer" lead, and the invite run
//   answers them the same day with the inquiry reply and their link.
//   These are notifications AMB receives as the listing broker: the site
//   delivers them to AMB, no site is crawled.
// - a reply from a buyer AMB wrote to: the lead is "replied" and a person
//   answers. An opt-out goes on the permanent suppression list at once and
//   a hard bounce too, as on the seller side (compliance.md section 9).
// - a correspondent: someone AMB has never listed, writing about buying
//   ("proof of funds", "the NDA", "asking price"). They are "review"
//   leads, and nobody is emailed until a person approves each one.
//
// The same reader takes a mailbox's history (an mbox file from Google
// Takeout, or a Gmail API search with --history), which is usually the
// largest warm list AMB has: every inquiry and buyer conversation from
// past deals.
//
// Cold invitations go from the seller sending mailboxes, so their answers
// arrive in the seller reply loop (replies.csv), which already suppresses
// opt-outs and bounces; `syncSellerReplies` carries those answers onto the
// buyer leads.

/** Labels an inquiry notification puts before each field, in priority order. */
const FIELD_LABELS: Record<"name" | "first_name" | "last_name" | "email" | "phone" | "listing" | "listing_title" | "message" | "city" | "state" | "company" | "capital", string[]> = {
  name: ["buyer name", "full name", "contact name", "name", "from"],
  first_name: ["first name"],
  last_name: ["last name"],
  email: ["buyer email", "email address", "e-mail address", "email", "e-mail", "reply to"],
  phone: ["buyer phone", "phone number", "phone", "telephone", "mobile", "cell"],
  listing: ["listing id", "listing number", "listing #", "listing ref", "ad id", "ad number", "reference number", "ref #", "ref"],
  listing_title: ["listing title", "listing name", "listing", "business", "regarding", "ad title"],
  message: ["message", "comments", "comment", "inquiry", "buyer message", "questions"],
  city: ["city"],
  state: ["state"],
  company: ["company", "firm", "organization"],
  capital: ["liquid capital", "available capital", "capital available", "investment range", "cash available", "net worth", "price range"],
};

/** The value after a "Label:" line, or on the line after a label that stands alone. */
function labelled(text: string, labels: readonly string[]): string {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " ").trim());
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
    const inline = new RegExp(`^\\*{0,2}${esc}\\*{0,2}\\s*[:\\-]\\s*(.+)$`, "i");
    const alone = new RegExp(`^\\*{0,2}${esc}\\*{0,2}\\s*:?$`, "i");
    for (let i = 0; i < lines.length; i++) {
      const m = inline.exec(lines[i]!);
      if (m?.[1]?.trim()) return m[1].trim().replace(/^\*+|\*+$/g, "");
      if (alone.test(lines[i]!) && lines[i + 1]) return lines[i + 1]!.trim();
    }
  }
  return "";
}

/** The message under a "Message:" label: that line and the lines after it, until a blank line or the next label. */
function labelledBlock(text: string, labels: readonly string[]): string {
  const lines = text.split(/\r?\n/);
  for (const label of labels) {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const at = lines.findIndex((l) => new RegExp(`^\\s*\\*{0,2}${esc}\\*{0,2}\\s*:`, "i").test(l));
    if (at < 0) continue;
    const first = lines[at]!.replace(/^[^:]*:\s*/, "");
    const rest: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (!l.trim() || /^\s*[A-Z][A-Za-z #]{1,30}:\s/.test(l)) break;
      rest.push(l.trim());
    }
    return [first, ...rest].join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1).toLowerCase();
const onDomain = (email: string, domains: readonly string[]) => {
  const d = domainOf(email);
  return domains.some((x) => d === x.toLowerCase() || d.endsWith(`.${x.toLowerCase()}`));
};

/** The listing site a message came from ("bizbuysell"), by its From, Reply-To or Sender domain; undefined for anyone else. */
export function inquiryPlatform(msg: InboundMessage, config: EngineConfig): string | undefined {
  const senders = config.buyers.inquiry_senders;
  for (const raw of [msg.from, msg.headers["sender"] ?? "", msg.headers["return-path"] ?? ""]) {
    const a = addressOf(raw);
    if (a && onDomain(a, senders)) {
      const d = domainOf(a);
      const site = senders.find((x) => d === x.toLowerCase() || d.endsWith(`.${x.toLowerCase()}`))!;
      return site.split(".")[0]!.toLowerCase();
    }
  }
  return undefined;
}

/** What an inquiry notification says about the buyer, or undefined when it names no address. */
export interface ParsedInquiry {
  platform: string;
  buyer: IncomingBuyer;
}

/**
 * Read one listing-site notification. The buyer's address is the labelled
 * one, else the Reply-To (sites set it to the buyer so the broker can answer
 * in one click), else the first address in the text that belongs to neither
 * the site nor AMB. Names, phone, listing number and message are read from
 * their labels. None of the sites publishes its notification format, so the
 * labels are broad, and a notification with no buyer address is left for a
 * person (docs/BUYERS.md asks for a few real samples to confirm).
 */
export function parseInquiry(msg: InboundMessage, config: EngineConfig): ParsedInquiry | undefined {
  const platform = inquiryPlatform(msg, config);
  if (!platform) return undefined;
  const text = msg.text.includes("<") && /<(p|div|br|table)\b/i.test(msg.text) ? htmlToText(msg.text) : msg.text;
  const own = [...config.mailboxes.map((m) => domainOf(m.email)), domainOf(warmMailbox(config)?.email ?? ""), config.firm.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")].filter(Boolean);
  const notOurs = (a: string) => a && !onDomain(a, config.buyers.inquiry_senders) && !onDomain(a, own);
  const labelledEmail = addressOf(labelled(text, FIELD_LABELS.email));
  const replyTo = addressOf(msg.headers["reply-to"] ?? "");
  const inText = [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => normalizeEmail(m[0])).find(notOurs) ?? "";
  const email = [labelledEmail, replyTo, inText].find(notOurs) ?? "";
  if (!email) return undefined;

  const name = labelled(text, FIELD_LABELS.name).replace(/<[^>]*>/g, "").trim() || [labelled(text, FIELD_LABELS.first_name), labelled(text, FIELD_LABELS.last_name)].filter(Boolean).join(" ") || (addressOf(msg.headers["reply-to"] ?? "") === email ? (msg.headers["reply-to"] ?? "").replace(/<[^>]*>/, "").replace(/"/g, "").trim() : "");
  const listingId = (labelled(text, FIELD_LABELS.listing).match(/[A-Za-z0-9-]{3,}/)?.[0] ?? /#\s?(\d{5,})\b/.exec(`${msg.subject} ${text}`)?.[1] ?? "").replace(/^#/, "");
  const title = labelled(text, FIELD_LABELS.listing_title).slice(0, 120);
  const message = labelledBlock(text, FIELD_LABELS.message).slice(0, 400);
  const capital = labelled(text, FIELD_LABELS.capital).slice(0, 60);
  const date = Number.isFinite(Date.parse(msg.date)) ? isoStamp(new Date(Date.parse(msg.date))) : "";
  const site = platform.charAt(0).toUpperCase() + platform.slice(1);
  return {
    platform,
    buyer: {
      kind: "inquirer",
      name: name.includes("@") ? "" : name,
      company: labelled(text, FIELD_LABELS.company).slice(0, 120),
      email,
      email_source: "inquiry",
      phone: normalizePhone(labelled(text, FIELD_LABELS.phone)),
      city: labelled(text, FIELD_LABELS.city).slice(0, 60),
      state: labelled(text, FIELD_LABELS.state).slice(0, 2).toUpperCase(),
      source: platform,
      source_detail: `${site} inquiry${listingId ? ` about listing ${listingId}` : title ? ` about "${title}"` : ""}${date ? ` on ${date.slice(0, 10)}` : ""}`,
      interest: [listingId ? `listing ${listingId}` : "", title, capital ? `capital ${capital}` : "", message ? `said: ${message}` : ""].filter(Boolean).join("; ").slice(0, 500),
      inbound_at: date,
    },
  };
}

/** Wording that marks a message as being about buying a business, for correspondents a person reviews. */
const BUYER_WORDS = /\b(proof of funds|pre-?qualif|sba (loan|lender|7\(a\))|(sign(ed)?|send|return(ed)?) (the |your )?(nda|confidentiality agreement)|(the |your )?(cim|offering memorandum|information memorandum)|asking price|looking to (buy|acquire|purchase)|interested in (buying|acquiring|purchasing)|(buy|acquire|purchase) (a|the|your) (business|company|practice|firm)|(your|the) listing|letter of intent|\bloi\b|search fund|independent sponsor|family office|add-?on acquisition|deal flow)\b/i;

/** True when a message reads like a buyer writing about a deal. */
export function looksLikeBuyer(text: string): boolean {
  return BUYER_WORDS.test(text);
}

/** The buyer touch id in a List-Unsubscribe mailto request's subject ("unsubscribe BT-000123"). */
export function buyerUnsubscribeTouchId(subject: string): string | undefined {
  return /\bunsubscribe\s+(BT-\d{6,})\b/i.exec(subject)?.[1]?.toUpperCase();
}

/** What a buyer inbox run did. */
export interface BuyerInboxReport {
  read: number;
  duplicates: number;
  byClass: Record<string, number>;
  inquiries: { leadId: string; platform: string; email: string }[];
  /** Notifications from a listing site the reader could not find a buyer address in: a person looks at each. */
  unreadable: { messageId: string; platform: string; subject: string }[];
  added: number;
  suppressed: number;
}

/** Process received buyer-mailbox messages (oldest first). `history` reads past mail: correspondents and old inquiries, nothing answered as new. */
export function processBuyerInbox(stores: Stores, config: EngineConfig, opts: { messages: readonly InboundMessage[]; now: Date; history?: boolean }): BuyerInboxReport {
  const { now } = opts;
  const stamp = isoStamp(now);
  const report: BuyerInboxReport = { read: opts.messages.length, duplicates: 0, byClass: {}, inquiries: [], unreadable: [], added: 0, suppressed: 0 };
  const done = new Set(stores.buyerInbound.rows().map((r) => r.message_id));
  const suppression = new Suppression(stores.suppression);
  const own = new Set([...config.mailboxes.map((m) => normalizeEmail(m.email)), normalizeEmail(warmMailbox(config)?.email ?? "")].filter(Boolean));
  const sellers = new Set(stores.prospects.rows().filter((p) => p.email).map((p) => canonicalEmail(p.email)));
  const idx = indexLeads(stores);
  // Status changes to known leads, written before the new leads are merged in (one read and one write for the run).
  const changed = new Map<string, BuyerLeadRow>();
  const current = (l: BuyerLeadRow) => changed.get(l.lead_id) ?? l;
  const change = (l: BuyerLeadRow) => changed.set(l.lead_id, l);
  const incoming: { buyer: IncomingBuyer; row: BuyerInboundRow; inquiry?: string; priorStatus?: string }[] = [];
  const rows: BuyerInboundRow[] = [];
  const stampOf = (d: string) => (Number.isFinite(Date.parse(d)) ? isoStamp(new Date(Date.parse(d))) : "");
  const ordered = [...opts.messages].sort((a, b) => (stampOf(a.date) || a.date).localeCompare(stampOf(b.date) || b.date));

  for (const msg of ordered) {
    if (done.has(msg.id)) {
      report.duplicates++;
      continue;
    }
    done.add(msg.id);
    const from = addressOf(msg.from);
    const record = (cls: BuyerInboundRow["class"], extra: Partial<BuyerInboundRow> = {}) => {
      const row: BuyerInboundRow = { message_id: msg.id, received_at: stampOf(msg.date), mailbox: msg.mailbox, from_email: from, subject: msg.subject.slice(0, 200), class: cls, platform: "", lead_id: "", detail: "", processed_at: stamp, ...extra };
      rows.push(row);
      report.byClass[cls] = (report.byClass[cls] ?? 0) + 1;
      return row;
    };
    if (own.has(from)) {
      record("ignored", { detail: "sent by an AMB mailbox" });
      continue;
    }
    const stripped = stripQuoted(msg.text);

    // A listing site's notification first: it is from the site, so the opt-out and reply rules do not apply to it.
    const platform = inquiryPlatform(msg, config);
    if (platform) {
      const parsed = parseInquiry(msg, config);
      if (!parsed) {
        record("ignored", { platform, detail: "listing-site message with no buyer address (a newsletter, a receipt, or a format to add)" });
        if (/inquir|lead|interest|contact/i.test(`${msg.subject} ${msg.text.slice(0, 500)}`)) report.unreadable.push({ messageId: msg.id, platform, subject: msg.subject });
        continue;
      }
      const prior = idx.byEmail.get(canonicalEmail(parsed.buyer.email ?? ""));
      const row = record("inquiry", { platform, detail: parsed.buyer.source_detail });
      incoming.push({ buyer: parsed.buyer, row, inquiry: platform, priorStatus: prior ? current(prior).status : undefined });
      continue;
    }

    const bounce = detectBounce(msg);
    if (bounce) {
      const lead = bounce.recipient ? idx.byEmail.get(canonicalEmail(bounce.recipient)) : idx.byThread.get(msg.threadId);
      if (bounce.type === "hard" && lead) {
        suppression.add(lead.email, "email", "bounce", `buyer inbox ${msg.id}`, now);
        report.suppressed++;
        change({ ...current(lead), status: "bounced", next_invite_date: "", updated_at: stamp });
      }
      record("bounce", { lead_id: lead?.lead_id ?? "", detail: `${bounce.type}${bounce.code ? ` ${bounce.code}` : ""}` });
      continue;
    }
    const touchId = buyerUnsubscribeTouchId(msg.subject);
    const found = idx.byThread.get(msg.threadId) ?? idx.byEmail.get(canonicalEmail(from)) ?? (touchId ? idx.byTouch.get(touchId) : undefined);
    const lead = found ? current(found) : undefined;
    if (optOutIn(msg, stripped)) {
      // Erring toward suppressing (compliance.md section 9 rule 1): the sender, and the lead's own address when it differs.
      for (const e of new Set([from, lead?.email ?? ""].filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))) suppression.add(e, "email", "opt_out", `buyer inbox ${msg.id}`, now);
      report.suppressed++;
      if (lead) change({ ...lead, status: REGISTERED_STATUSES.has(lead.status) ? lead.status : "opted_out", next_invite_date: "", updated_at: stamp, notes: appendNote(lead.notes, `Opted out of email on ${stamp.slice(0, 10)}`) });
      record("opt_out", { lead_id: lead?.lead_id ?? "" });
      continue;
    }
    if (detectAutoReply(msg)) {
      record("auto_reply", { lead_id: lead?.lead_id ?? "" });
      continue;
    }
    if (lead) {
      const at = stampOf(msg.date) || stamp;
      const next: BuyerLeadRow = { ...lead, last_inbound_at: at > lead.last_inbound_at ? at : lead.last_inbound_at, thread_id: lead.thread_id || msg.threadId, updated_at: stamp };
      // A reply stops the invitations; a person answers. A registered buyer stays registered.
      if (!REGISTERED_STATUSES.has(lead.status) && !["opted_out", "bounced", "excluded"].includes(lead.status) && !opts.history) Object.assign(next, { status: "replied", replied_at: at, next_invite_date: "" });
      change(next);
      record("reply", { lead_id: lead.lead_id, detail: withoutOwnText(stripped).replace(/\s+/g, " ").slice(0, 200) });
      continue;
    }
    // A seller-side owner writing about their own business is the seller loop's, never a buyer lead.
    if (from && !sellers.has(canonicalEmail(from)) && looksLikeBuyer(`${msg.subject}\n${stripped}`)) {
      const name = msg.from.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
      const date = stampOf(msg.date);
      const row = record("correspondent");
      incoming.push({
        buyer: { kind: "correspondent", status: "review", name: name.includes("@") ? "" : name, email: from, email_source: "mailbox", source: "mailbox", source_detail: `Wrote to ${msg.mailbox || "AMB"} about buying${date ? ` on ${date.slice(0, 10)}` : ""}: "${msg.subject.slice(0, 80)}"`, interest: stripped.replace(/\s+/g, " ").slice(0, 300), thread_id: msg.threadId, inbound_at: date },
        row,
      });
      continue;
    }
    record("ignored");
  }

  if (changed.size) stores.buyerLeads.upsert([...changed.values()]);
  if (incoming.length) {
    report.added = upsertBuyers(stores, incoming.map((i) => i.buyer), now).added;
    const after = indexLeads(stores).byEmail;
    const followUps: BuyerLeadRow[] = [];
    for (const i of incoming) {
      const l = i.buyer.email ? after.get(canonicalEmail(i.buyer.email)) : undefined;
      if (!l) continue;
      i.row.lead_id = l.lead_id;
      if (!i.inquiry) continue;
      report.inquiries.push({ leadId: l.lead_id, platform: i.inquiry, email: l.email });
      // A new inquiry from someone already written to is a buyer asking again: a person answers it.
      if (!opts.history && (i.priorStatus === "invited" || i.priorStatus === "replied")) followUps.push({ ...l, status: "replied", replied_at: i.buyer.inbound_at || stamp, updated_at: stamp });
    }
    if (followUps.length) stores.buyerLeads.upsert(followUps);
  }
  if (rows.length) stores.buyerInbound.upsert(rows);
  return report;
}

const appendNote = (notes: string, line: string) => [notes, line].filter(Boolean).join("\n");

function indexLeads(stores: Stores) {
  const leads = stores.buyerLeads.rows();
  const byId = new Map(leads.map((l) => [l.lead_id, l]));
  const byEmail = new Map(leads.filter((l) => l.email).map((l) => [canonicalEmail(l.email), l]));
  const byThread = new Map<string, BuyerLeadRow>();
  const byTouch = new Map<string, BuyerLeadRow>();
  for (const t of stores.buyerTouches.rows()) {
    const l = byId.get(t.lead_id);
    if (!l) continue;
    byTouch.set(t.touch_id, l);
    if (t.thread_id) byThread.set(t.thread_id, l);
  }
  for (const l of leads) if (l.thread_id && !byThread.has(l.thread_id)) byThread.set(l.thread_id, l);
  return { byEmail, byThread, byTouch };
}

/**
 * Carry the seller reply loop's verdicts onto buyer leads: cold
 * invitations go from the seller mailboxes, so an answer to one lands in
 * replies.csv with no prospect. The seller loop already put opt-outs,
 * complaints and hard bounces on the suppression list; this marks the lead.
 */
export function syncSellerReplies(stores: Stores, now: Date): { replied: number; optedOut: number; bounced: number } {
  const stamp = isoStamp(now);
  const out = { replied: 0, optedOut: 0, bounced: 0 };
  const { byEmail, byThread } = indexLeads(stores);
  const seen = new Set(stores.buyerInbound.rows().map((r) => r.message_id));
  const changed = new Map<string, BuyerLeadRow>();
  const rows: BuyerInboundRow[] = [];
  for (const r of stores.replies.rows()) {
    if (r.prospect_id || !r.class || seen.has(`seller:${r.reply_id}`)) continue;
    const lead = byThread.get(r.thread_id) ?? byEmail.get(canonicalEmail(r.from_email));
    if (!lead) continue;
    const base = changed.get(lead.lead_id) ?? lead;
    let cls: BuyerInboundRow["class"] = "reply";
    if (r.class === "unsubscribe" || r.class === "complaint" || r.opt_out === "Y") {
      cls = "opt_out";
      if (!REGISTERED_STATUSES.has(base.status)) changed.set(lead.lead_id, { ...base, status: "opted_out", next_invite_date: "", updated_at: stamp });
      out.optedOut++;
    } else if (r.class === "bounce") {
      cls = "bounce";
      if (r.bounce_type === "hard") {
        changed.set(lead.lead_id, { ...base, status: "bounced", next_invite_date: "", updated_at: stamp });
        out.bounced++;
      }
    } else if (r.class === "auto_reply") {
      cls = "auto_reply";
    } else if (!REGISTERED_STATUSES.has(base.status) && !["opted_out", "bounced", "excluded"].includes(base.status)) {
      changed.set(lead.lead_id, { ...base, status: "replied", replied_at: r.received_at || stamp, last_inbound_at: r.received_at || stamp, next_invite_date: "", updated_at: stamp });
      out.replied++;
    }
    rows.push({ message_id: `seller:${r.reply_id}`, received_at: r.received_at, mailbox: r.mailbox, from_email: r.from_email, subject: r.subject.slice(0, 200), class: cls, platform: "", lead_id: lead.lead_id, detail: "from the seller reply loop", processed_at: stamp });
  }
  if (changed.size) stores.buyerLeads.upsert([...changed.values()]);
  if (rows.length) stores.buyerInbound.upsert(rows);
  return out;
}

// ---------------------------------------------------------------- mbox (Google Takeout)

/** Most bytes of one message kept while reading an mbox: the text parts come first, attachments after. */
const MAX_MESSAGE_BYTES = 1_500_000;

interface MimePart {
  headers: Record<string, string>;
  body: string;
}

function splitHead(raw: string): MimePart {
  const at = raw.search(/\r?\n\r?\n/);
  const head = at < 0 ? raw : raw.slice(0, at);
  const body = at < 0 ? "" : raw.slice(at).replace(/^\r?\n\r?\n/, "");
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}

/** RFC 2047 encoded words in a header ("=?UTF-8?B?...?=" and "=?UTF-8?Q?...?="). */
export function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _cs: string, enc: string, text: string) =>
    enc.toUpperCase() === "B" ? Buffer.from(text, "base64").toString("utf8") : qp(text.replace(/_/g, " ")),
  );
}

function qp(text: string): string {
  const bytes: number[] = [];
  const s = text.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(s[i]!, "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeBody(part: MimePart): string {
  const enc = (part.headers["content-transfer-encoding"] ?? "").toLowerCase();
  if (enc === "base64") return Buffer.from(part.body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (enc === "quoted-printable") return qp(part.body);
  return part.body;
}

/** The text of a MIME entity: its first text/plain part, else its first text/html part as text. */
function mimeText(part: MimePart, depth = 0): { plain?: string; html?: string } {
  const type = (part.headers["content-type"] ?? "text/plain").toLowerCase();
  if (type.startsWith("multipart/") && depth < 6) {
    const boundary = /boundary="?([^";]+)"?/i.exec(part.headers["content-type"] ?? "")?.[1];
    if (!boundary) return {};
    const out: { plain?: string; html?: string } = {};
    for (const chunk of part.body.split(`--${boundary}`).slice(1)) {
      if (chunk.startsWith("--")) break;
      const found = mimeText(splitHead(chunk.replace(/^\r?\n/, "")), depth + 1);
      out.plain ??= found.plain;
      out.html ??= found.html;
      if (out.plain) break;
    }
    return out;
  }
  if (/attachment/i.test(part.headers["content-disposition"] ?? "")) return {};
  if (type.startsWith("text/plain")) return { plain: decodeBody(part) };
  if (type.startsWith("text/html")) return { html: decodeBody(part) };
  return {};
}

/** One raw RFC 5322 message as an InboundMessage. */
export function parseRawMessage(raw: string, mailbox: string): InboundMessage {
  const top = splitHead(raw);
  const h = top.headers;
  const text = mimeText(top);
  const date = Number.isFinite(Date.parse(h.date ?? "")) ? isoStamp(new Date(Date.parse(h.date!))) : "";
  const id = (h["message-id"] ?? "").replace(/[<>\s]/g, "") || `mbox-${crypto.createHash("sha256").update(raw.slice(0, 4000)).digest("hex").slice(0, 16)}`;
  return {
    id,
    threadId: h["x-gm-thrid"] ?? "",
    mailbox,
    from: decodeWords(h.from ?? ""),
    to: decodeWords(h.to ?? ""),
    subject: decodeWords(h.subject ?? ""),
    date,
    text: text.plain ?? (text.html ? htmlToText(text.html) : ""),
    headers: lowerHeaders(Object.fromEntries(Object.entries(h).map(([k, v]) => [k, decodeWords(v)]))),
  };
}

/**
 * Every message in an mbox file (Google Takeout writes one per label), read
 * line by line so a mailbox of many gigabytes never sits in memory. Mail the
 * mailbox sent itself (Gmail's "Sent" label) is skipped.
 */
export function forEachMboxMessage(file: string, mailbox: string, fn: (msg: InboundMessage) => void): { messages: number; sent: number } {
  let lines: string[] = [];
  let bytes = 0;
  let prevBlank = true;
  const counts = { messages: 0, sent: 0 };
  const flush = () => {
    if (!lines.length) return;
    const raw = Buffer.from(lines.join("\n"), "latin1").toString("utf8");
    lines = [];
    bytes = 0;
    const msg = parseRawMessage(raw, mailbox);
    if (/(^|,)\s*sent\s*(,|$)/i.test(msg.headers["x-gmail-labels"] ?? "")) {
      counts.sent++;
      return;
    }
    counts.messages++;
    fn(msg);
  };
  forEachLine(file, (line) => {
    const l = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (prevBlank && l.startsWith("From ")) {
      flush();
      prevBlank = false;
      return;
    }
    prevBlank = l === "";
    if (bytes > MAX_MESSAGE_BYTES) return;
    // mboxrd escapes body lines that start with "From " by adding ">".
    lines.push(/^>+From /.test(l) ? l.slice(1) : l);
    bytes += l.length + 1;
  });
  flush();
  return counts;
}

/** The buyer-related messages of an mbox: listing-site notifications, and mail that reads like a buyer. Everything else is left unread. */
export function buyerMessagesInMbox(file: string, config: EngineConfig): { messages: InboundMessage[]; scanned: number; sent: number } {
  const mailbox = warmMailbox(config)?.email ?? "";
  const messages: InboundMessage[] = [];
  const counts = forEachMboxMessage(file, mailbox, (m) => {
    if (inquiryPlatform(m, config) || looksLikeBuyer(`${m.subject}\n${stripQuoted(m.text)}`)) messages.push(m);
  });
  return { messages, scanned: counts.messages, sent: counts.sent };
}
