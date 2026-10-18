import type { InboundMessage } from "../domain/messages.ts";
import { normalizeEmail } from "../domain/schema.ts";

// Plain-text parsing of received mail: the owner's new words without the
// quoted history, delivery-failure notices (bounces) and auto-replies.
//
// Everything here works from the sender, subject and body as well as the
// headers, because the Claude Gmail connector's get_thread returns no
// headers at all (docs/research/deliverability.md section 4: "Auto-replies
// and bounce (DSN) details must be detected from sender, subject or body
// text"). Headers are used when a source has them (the Gmail API).
//
// About 45% of replies to cold email are auto-replies (docs/research/
// claims.md, reply composition), so telling them apart from a person is the
// first job of the reply loop. Microsoft's authentication rejections arrive
// as "550 5.7.515" and, after its revised announcement, "550; 5.7.515"
// (deliverability.md section 1 and verification row 5): both forms match.
//
// Bounces come in three kinds. "hard": the recipient's address is dead
// (5.1.1 user unknown, 5.1.10, 5.2.1 disabled, 5.4.1 no such domain), so the
// address is suppressed. "soft": a temporary failure (4.x.x, a full
// mailbox). "policy": the receiver refused OUR domain or sending setup
// (5.7.515, 5.7.509, the RFC 7372 authentication codes, or any 5.7.x that
// names SPF, DKIM or DMARC). That says nothing about the recipient, so it
// must never suppress them; it is a mailbox-health event that pauses the
// sending mailbox until a person fixes DNS and clears it.

/** The bare address in a From or To value ("John <john@x.com>" -> "john@x.com"), lower-cased; "" when none. */
export function addressOf(value: string): string {
  const angle = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  if (angle) return normalizeEmail(angle[1]!);
  const bare = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[a-z0-9-]+/i.exec(value);
  return bare ? normalizeEmail(bare[0]) : "";
}

/** Lines that start the quoted history; everything from the first one down is dropped. */
const CUT_LINES: readonly RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}$/i, // Outlook and many desktop clients
  /^-{2,}\s*forwarded message\s*-{2,}$/i,
  /^_{10,}$/, // Outlook's rule above a "From:" header block
  /^begin forwarded message:?$/i, // Apple Mail
  /^on .{3,200}\bwrote:$/i, // Gmail, Apple Mail: "On Mon, Oct 12, 2026 at 9:00 AM Frank <f@x> wrote:"
  /^(le|am|el) .{3,200}(a écrit|schrieb|escribió)\s*:$/i, // the same line from French, German and Spanish clients
];

/** An Outlook header block ("From: ..." followed within two lines by "Sent:" or "Date:"). */
function isHeaderBlock(lines: readonly string[], i: number): boolean {
  if (!/^\*?from:\*?\s/i.test(lines[i]!)) return false;
  return lines.slice(i + 1, i + 4).some((l) => /^\*?(sent|date|to|subject):\*?\s/i.test(l.trim()));
}

/** Drop the quoted history: "On ... wrote:", ">" lines, "-----Original Message-----", Outlook header blocks, the signature after "-- ". */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    // A signature delimiter is "-- " by convention (RFC 3676 4.3); many clients trim it to "--".
    if (raw === "-- " || line === "--") break;
    if (CUT_LINES.some((re) => re.test(line))) break;
    // Gmail wraps a long attribution: "On Mon, Oct 12, 2026 at 9:00 AM Frank Example <" then "frank@x> wrote:".
    if (/^on\s.{3,200}$/i.test(line) && i + 1 < lines.length && /\bwrote:$/i.test(lines[i + 1]!.trim()) && line.length + lines[i + 1]!.trim().length < 300) break;
    if (isHeaderBlock(lines.map((l) => l.trim()), i)) break;
    if (line.startsWith(">")) continue;
    kept.push(raw.replace(/\s+$/, ""));
  }
  // Mobile clients' stock sign-offs carry no meaning for classification.
  while (kept.length && (/^sent from my \w+/i.test(kept[kept.length - 1]!.trim()) || !kept[kept.length - 1]!.trim())) kept.pop();
  while (kept.length && !kept[0]!.trim()) kept.shift();
  return kept.join("\n").trim();
}

// ---------------------------------------------------------------- bounces

/** Senders that only ever send delivery reports. */
const DAEMON_SENDER = /^(mailer-daemon|postmaster|mail-daemon|maildelivery|mail-delivery|bounces?|noreply-dmarc)@/i;
const DAEMON_NAME = /\b(mail delivery (subsystem|system)|mailer-daemon|postmaster|microsoft outlook)\b/i;

/** Subjects of delivery status notifications (DSNs) from Gmail, Outlook, Postfix, Exim, Yahoo and others. */
const DSN_SUBJECT = /\b(delivery status notification|undeliverable|undelivered mail|mail delivery (failed|failure|subsystem)|delivery (failure|failed|has failed|incomplete)|failure notice|returned mail|returned to sender|message not delivered|could not be delivered|non-?delivery|delivery notification)\b/i;

/** Wording that makes a delivery report temporary (Gmail "(Delay)", "will retry"). */
const SOFT_WORDS = /\b(delay(ed)?|will (retry|continue trying|keep trying)|temporar(y|ily)|try again later|still trying|mailbox (is )?full|over (its |the )?quota|quota exceeded|insufficient (system )?storage)\b/i;
/** Wording that makes it permanent when the report carries no status code. */
const HARD_WORDS = /\b(address not found|does ?n[o']t exist|no such (user|mailbox|recipient)|user unknown|unknown user|recipient (address )?rejected|mailbox (unavailable|not found|does not exist)|invalid (recipient|address|mailbox)|account (has been )?(disabled|deleted|closed)|permanent(ly)? (failure|error)|access denied|wasn't delivered|was not delivered|couldn't be delivered)\b/i;

/**
 * Enhanced status codes that mean the receiver rejected our sending domain or
 * setup, not the recipient: Microsoft 5.7.515 (authentication level) and
 * 5.7.509 (DMARC), RFC 7372 5.7.20 to 5.7.27 (DKIM, SPF, reverse DNS,
 * multiple authentication failures, null MX on the sender), which Gmail uses
 * for its sender requirements, and Microsoft's 5.7.705, 5.7.708 and 5.7.750
 * (tenant or sending IP blocked).
 */
export const POLICY_BOUNCE_CODES: ReadonlySet<string> = new Set([
  "5.7.515", "5.7.509", "5.7.20", "5.7.21", "5.7.22", "5.7.23", "5.7.24", "5.7.25", "5.7.26", "5.7.27", "5.7.705", "5.7.708", "5.7.750",
]);
/** Wording that turns any other 5.7.x rejection into an authentication failure on our side. */
const AUTH_WORDS = /\b(spf|dkim|dmarc|unauthenticated|not authenticated|authentication (level|fail(ed|ure|s)?|required|requirements?|check)|sender policy framework|domainkeys|does not pass (spf|dkim|dmarc)|sending domain)\b/i;

/** How replies.csv marks a policy bounce's snippet ("Authentication bounce 5.7.515: ..."), so health checks can read it back. */
export const POLICY_SNIPPET_PREFIX = "Authentication bounce";

/** True for a replies.csv bounce row from a policy (authentication) rejection: the snippet leads with the marker or carries a policy code. */
export function isPolicyBounceSnippet(snippet: string): boolean {
  return snippet.startsWith(POLICY_SNIPPET_PREFIX) || policyBounceCode(snippet) !== undefined;
}

/** The 5.7.x code when a report says the receiver refused our domain's authentication or sending policy, else undefined. */
export function policyBounceCode(text: string): string | undefined {
  const codes = [...text.matchAll(/(?<![\d.])5\.7\.\d{1,3}(?![\d.])/g)].map((m) => m[0]);
  const listed = codes.find((c) => POLICY_BOUNCE_CODES.has(c));
  if (listed) return listed;
  return codes.length && AUTH_WORDS.test(text) ? codes[0] : undefined;
}

/** The failed recipient a report names, or undefined. */
function bounceRecipient(msg: InboundMessage, text: string): string | undefined {
  const header = msg.headers["x-failed-recipients"];
  if (header) {
    const a = addressOf(header);
    if (a) return a;
  }
  const E = "([a-z0-9._%+'-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+)";
  const patterns = [
    new RegExp(`final-recipient:\\s*rfc822;\\s*<?${E}`, "i"),
    new RegExp(`original-recipient:\\s*rfc822;\\s*<?${E}`, "i"),
    new RegExp(`(?:wasn't|was not|couldn't be|could not be|problem) deliver(?:ed|ing)(?: your message)? to\\s+<?${E}`, "i"),
    new RegExp(`(?:delivery to|to the following recipients?|failed to these recipients)[^\\n@]*\\n?(?:\\s*\\n)*\\s*<?${E}`, "i"),
    new RegExp(`^\\s*<${E}>:`, "im"), // Postfix: "<john@x.com>: host mx.x.com said: 550 ..."
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const a = normalizeEmail(m[1]!);
      if (!DAEMON_SENDER.test(a) && a !== normalizeEmail(msg.mailbox)) return a;
    }
  }
  return undefined;
}

/** hard: the recipient is dead (suppress). soft: temporary. policy: the receiver refused our domain (pause the mailbox, never suppress). */
export type BounceType = "hard" | "soft" | "policy";

/**
 * A delivery failure notice, or null. Decided by the sender
 * (mailer-daemon, postmaster), the subject or the DSN headers; a person's
 * reply that happens to quote "550 5.1.1" is never a bounce. An
 * authentication or sending-policy rejection ("550 5.7.515",
 * "550; 5.7.515", 5.7.26, any 5.7.x naming SPF, DKIM or DMARC) is "policy";
 * otherwise 5.x.x (and a bare 5xx reply code) is hard and 4.x.x is soft.
 */
export function detectBounce(msg: InboundMessage): { type: BounceType; recipient?: string; code?: string } | null {
  const from = addressOf(msg.from);
  const contentType = msg.headers["content-type"] ?? "";
  const isReport =
    DAEMON_SENDER.test(from) ||
    DSN_SUBJECT.test(msg.subject) ||
    (DAEMON_NAME.test(msg.from) && /\b(undeliver\w*|deliver\w*|failure|returned)\b/i.test(msg.subject)) ||
    /report-type="?delivery-status/i.test(contentType) ||
    Boolean(msg.headers["x-failed-recipients"]);
  if (!isReport) return null;

  const text = msg.text.replace(/\r\n?/g, "\n");
  const recipient = bounceRecipient(msg, text);
  const result = (type: BounceType, code?: string) => ({ type, ...(recipient ? { recipient } : {}), ...(code ? { code } : {}) });

  // 1. Our domain failed the receiver's authentication or sending policy (both of Microsoft's punctuations match):
  //    a mailbox-health event, not a dead address.
  const policy = policyBounceCode(text);
  if (policy) return result("policy", policy);

  // 2. A machine-readable DSN "Status:" field (RFC 3464) is authoritative.
  const status = /^status:\s*([245]\.\d{1,3}\.\d{1,3})/im.exec(text)?.[1];
  if (status?.startsWith("5")) return result("hard", status);
  if (status?.startsWith("4")) return result("soft", status);

  // 3. Enhanced status codes in the prose (RFC 3463); a "(Delay)" subject makes the report temporary whatever it quotes.
  const codes = [...text.matchAll(/(?<![\d.])[45]\.\d{1,3}\.\d{1,3}(?![\d.])/g)].map((m) => m[0]);
  const permanent = codes.find((c) => c.startsWith("5"));
  const temporary = codes.find((c) => c.startsWith("4"));
  if (SOFT_WORDS.test(msg.subject)) return result("soft", temporary);
  if (permanent) return result("hard", permanent);
  if (temporary) return result("soft", temporary);

  // 4. Bare SMTP reply codes ("550 User unknown", "452 Mailbox full").
  const smtp = /\b(4[25]\d|5[05]\d)(?=[\s-])/.exec(text)?.[1];
  if (smtp) return result(smtp.startsWith("5") ? "hard" : "soft", smtp);

  // 5. Wording, then the default: a failure report with no code and no temporary wording is permanent,
  //    erring toward never mailing a dead address again.
  if (HARD_WORDS.test(text)) return result("hard");
  if (SOFT_WORDS.test(text)) return result("soft");
  return result("hard");
}

// ---------------------------------------------------------------- auto-replies

const AUTO_SUBJECT = /\b(out of (the )?office|automatic reply|auto[- ]?reply|auto[- ]?response|autoreply|autoresponse|automated (reply|response)|away from (the )?(office|my desk)|on vacation|on holiday|on leave|ooo|abwesenheitsnotiz|réponse automatique|respuesta automática)\b/i;

const AUTO_PHRASES: readonly RegExp[] = [
  /\b(i am|i'm|i will be|i'll be) (currently )?(out of (the )?office|away from (the )?(office|my desk)|on (vacation|holiday|leave|annual leave|pto)|traveling with limited|travelling with limited)/i,
  /\b(i am|i'm) currently (out|away|unavailable|traveling|travelling)\b/i,
  /\b(limited|no|intermittent) access to (my )?e-?mail\b/i,
  /\b(will|i'll) (respond|reply|get back to you|return your (email|message)) (to your (email|message) )?(when|upon|as soon as|after) (i|my) (return|get back|am back)/i,
  /\bupon my return\b/i,
  /\bthis is an? automat(ed|ic) (reply|response|message|notification)\b/i,
  /\bthis (mailbox|email address|inbox) is (not|no longer) (monitored|in use|checked)\b/i,
  /\b(thank you|thanks) for (your|contacting|reaching)[^.]{0,60}\.\s*(we|our team) (have|has) received your (email|message|request)\b/i,
  /\bwe (have )?received your (email|message|inquiry|request) and will (respond|reply|get back)\b/i,
  /\bfor (urgent|immediate) (matters|assistance|issues|requests),? please (contact|call|email)\b/i,
];

/**
 * Words that only a person answering us writes. An owner on vacation who
 * still says "yes, I'm interested" has answered: the phrase "I'm on
 * vacation" alone must not file that reply as an auto-reply and lose it.
 * "if you are interested" is left out because business autoresponders say it.
 */
const HUMAN_ANSWER = /\b(yes|yeah|yep|(?<!\bif you('re| are) )interested|call me|give me a call|send (it|me|them|the questions|over)|sounds (good|interesting)|tell me more|i'?d (like|love)|i would (like|love)|let'?s talk|please do|go ahead|not interested|no thanks|no thank you)\b/i;
/** A question to us: a sentence ending in "?" that mentions the sender, the offer or the cost. */
const QUESTION_TO_US = /\b(you|your|amb|this|it|what|how|who|why|cost|price|check)\b[^.!?]*\?/i;
/** More new words than this, outside the out-of-office sentences, reads as a person writing. */
export const HUMAN_TEXT_WORDS = 40;

/** True when the new text holds a clear human answer alongside any out-of-office wording. */
export function hasHumanAnswer(text: string): boolean {
  if (HUMAN_ANSWER.test(text) || QUESTION_TO_US.test(text)) return true;
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const own = sentences.filter((sentence) => !AUTO_PHRASES.some((re) => re.test(sentence)));
  return own.join(" ").split(/\s+/).filter((w) => /[a-z]/i.test(w)).length > HUMAN_TEXT_WORDS;
}

/**
 * True for an out-of-office or other automatic reply. Headers decide first
 * (Auto-Submitted other than "no", X-Autoreply, Precedence auto_reply, bulk,
 * junk or list), then an OOO subject. Body phrases alone decide only when the
 * new text holds no clear human answer ("yes", "interested", "call me", a
 * question to us, or more than HUMAN_TEXT_WORDS words of its own).
 */
export function detectAutoReply(msg: InboundMessage): boolean {
  const h = msg.headers;
  const autoSubmitted = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true; // RFC 3834
  if (h["x-autoreply"] !== undefined || h["x-autorespond"] !== undefined || h["x-autoresponder"] !== undefined) return true;
  if (/^(auto_reply|bulk|junk|list)$/i.test((h["precedence"] ?? "").trim())) return true;
  if (AUTO_SUBJECT.test(msg.subject.replace(/^\s*(re|fwd?|aw|wg)\s*:\s*/i, ""))) return true;
  const text = stripQuoted(msg.text);
  return AUTO_PHRASES.some((re) => re.test(text)) && !hasHumanAnswer(text);
}
