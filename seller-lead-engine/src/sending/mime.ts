import type { OutgoingMessage } from "../domain/messages.ts";

// The raw RFC 5322 message the Gmail API takes (`raw`, base64url) when the
// engine sends or drafts directly (sending.transport = "gmail_api"). Plain
// text only, UTF-8, quoted-printable: no HTML part, no tracking pixel, no
// attachments (docs/research/deliverability.md sections 3 and 6). Gmail's
// all-sender rules include RFC 5322 formatting (deliverability.md,
// verification row 1), so headers are folded at 78 characters and
// non-ASCII text in headers uses RFC 2047 encoded words.
//
// Message-IDs are derived from the touch id and its creation time, so a
// follow-up can name its parent in In-Reply-To and References without the
// engine storing the header (src/sending/run.ts). Extra headers come from
// the message (List-Unsubscribe and List-Unsubscribe-Post per RFC 8058,
// In-Reply-To, References); a header value with a line break is refused,
// because it could inject headers.

const CRLF = "\r\n";
/** Headers buildMime writes itself; a message's own `headers` may not replace them. */
const RESERVED = new Set(["from", "to", "subject", "date", "mime-version", "content-type", "content-transfer-encoding"]);

/** base64url of a UTF-8 string, no padding (what the Gmail API's `raw` field takes). */
export function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/** The Message-ID for a touch: `<t-000001.20261020140000@sending-domain>`. */
export function messageIdFor(touchId: string, date: Date | string, domain: string): string {
  const stamp = (typeof date === "string" ? date : date.toISOString()).replace(/\.\d+Z$/, "Z").replace(/\D/g, "").slice(0, 14);
  return `<${touchId.toLowerCase()}.${stamp}@${domain.toLowerCase()}>`;
}

/** RFC 5322 date in UTC: "Tue, 20 Oct 2026 14:00:00 +0000". */
export function rfc5322Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]}, ${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 "B" encoded words for non-ASCII header text, each word at most 75 characters; ASCII comes back unchanged. */
export function encodeHeaderText(s: string): string {
  if (isAscii(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    // 39 bytes encode to 52 base64 characters, plus the 12 of "=?UTF-8?B?" and "?=": 64, so even the
    // first word after "Subject: " stays inside RFC 2047's 76-character line (REVIEW_R1.md item 7).
    if (Buffer.byteLength(chunk + ch, "utf8") > 39) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join(`${CRLF} `);
}

/** A mailbox header value: `"Display Name" <address>`, the name quoted (ASCII) or encoded (non-ASCII). */
export function formatAddress(name: string, address: string): string {
  const n = name.trim();
  if (!n) return address;
  const display = isAscii(n) ? `"${n.replace(/(["\\])/g, "\\$1")}"` : encodeHeaderText(n);
  return `${display} <${address}>`;
}

/** One header line, folded at spaces so no line passes 78 characters where a break is possible. */
export function foldHeader(name: string, value: string): string {
  const line = `${name}: ${value}`;
  if (value.includes(CRLF) || line.length <= 78) return line;
  const out: string[] = [];
  let current = `${name}:`;
  for (const part of value.split(" ")) {
    if (current.length + 1 + part.length > 78 && current.trim() !== `${name}:`) {
      out.push(current);
      current = ` ${part}`;
    } else current += ` ${part}`;
  }
  out.push(current);
  return out.join(CRLF);
}

/** Quoted-printable (RFC 2045) of UTF-8 text: CRLF line ends, soft breaks keep lines at 76 characters. */
export function quotedPrintable(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line) => {
      const bytes = Buffer.from(line, "utf8");
      const tokens: string[] = [];
      bytes.forEach((b, i) => {
        const last = i === bytes.length - 1;
        if ((b === 0x20 || b === 0x09) && !last) tokens.push(String.fromCharCode(b));
        else if (b >= 33 && b <= 126 && b !== 61) tokens.push(String.fromCharCode(b));
        else tokens.push(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
      });
      // Soft line breaks: at most 75 characters plus "=", never splitting an =XX escape.
      const out: string[] = [];
      let current = "";
      for (const t of tokens) {
        if (current.length + t.length > 75) {
          out.push(`${current}=`);
          current = "";
        }
        current += t;
      }
      out.push(current);
      return out.join(CRLF);
    })
    .join(CRLF);
}

/** The full RFC 5322 message: From, To, Subject, Date, Message-ID, MIME headers, the message's extra headers, then the quoted-printable body. */
export function buildMime(msg: OutgoingMessage, opts: { date: Date; messageIdDomain: string }): string {
  const extra = Object.entries(msg.headers);
  for (const [k, v] of [...extra, ["From name", msg.fromName], ["To", msg.to], ["Subject", msg.subject]] as const) {
    if (/[\r\n]/.test(k) || /[\r\n]/.test(v)) throw new Error(`Header ${k.split(/[\r\n]/)[0]} contains a line break: refusing to build the message`);
  }
  const messageId = extra.find(([k]) => k.toLowerCase() === "message-id")?.[1] ?? messageIdFor(msg.touchId, opts.date, opts.messageIdDomain);
  const lines = [
    foldHeader("From", formatAddress(msg.fromName, msg.mailbox)),
    foldHeader("To", msg.to),
    foldHeader("Subject", encodeHeaderText(msg.subject)),
    `Date: ${rfc5322Date(opts.date)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
  ];
  for (const [k, v] of extra) {
    const lower = k.toLowerCase();
    if (lower === "message-id") continue;
    if (RESERVED.has(lower)) throw new Error(`Header ${k} is written by buildMime and may not be overridden`);
    lines.push(foldHeader(k, isAscii(v) ? v : encodeHeaderText(v)));
  }
  return `${lines.join(CRLF)}${CRLF}${CRLF}${quotedPrintable(msg.body)}${CRLF}`;
}
