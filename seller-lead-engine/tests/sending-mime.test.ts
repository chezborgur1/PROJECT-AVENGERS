import { describe, expect, it } from "vitest";
import type { OutgoingMessage } from "../src/domain/messages.ts";
import { base64url, buildMime, encodeHeaderText, foldHeader, formatAddress, messageIdFor, quotedPrintable, rfc5322Date } from "../src/sending/mime.ts";

const DATE = new Date("2026-10-20T14:05:09Z");

function msg(overrides: Partial<OutgoingMessage> = {}): OutgoingMessage {
  return {
    touchId: "T-000042",
    prospectId: "P-00001",
    kind: "outreach",
    step: 1,
    mailbox: "frank@ambadvisory-mail.example",
    fromName: "Frank Example, AMB Advisory Services",
    to: "john@exampleair.example",
    subject: "Exit-readiness check for Example Air",
    body: "Hi John,\n\nA line with an = sign.\n\nReply 'unsubscribe' and I will not email you again.",
    headers: {
      "List-Unsubscribe": "<https://ambadvisoryservices.com/unsubscribe?t=T-000042>, <mailto:frank@ambadvisory-mail.example?subject=unsubscribe%20T-000042>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    ...overrides,
  };
}

/** Decode quoted-printable back to text, for round-trip checks. */
function decodeQp(s: string): string {
  const joined = s.replace(/=\r\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=") {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(joined.charCodeAt(i));
  }
  return Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
}

/** Split a raw message into its unfolded headers and body. */
function parse(raw: string): { headers: Record<string, string>; body: string } {
  const [head, ...rest] = raw.split("\r\n\r\n");
  const headers: Record<string, string> = {};
  for (const line of head!.replace(/\r\n /g, " ").split("\r\n")) {
    const at = line.indexOf(":");
    headers[line.slice(0, at)] = line.slice(at + 2);
  }
  return { headers, body: rest.join("\r\n\r\n") };
}

describe("buildMime", () => {
  it("writes the RFC 5322 headers for a plain-text, quoted-printable message", () => {
    const raw = buildMime(msg(), { date: DATE, messageIdDomain: "ambadvisory-mail.example" });
    const { headers, body } = parse(raw);
    expect(headers).toMatchObject({
      From: '"Frank Example, AMB Advisory Services" <frank@ambadvisory-mail.example>',
      To: "john@exampleair.example",
      Subject: "Exit-readiness check for Example Air",
      Date: "Tue, 20 Oct 2026 14:05:09 +0000",
      "Message-ID": "<t-000042.20261020140509@ambadvisory-mail.example>",
      "MIME-Version": "1.0",
      "Content-Type": "text/plain; charset=UTF-8",
      "Content-Transfer-Encoding": "quoted-printable",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(headers["List-Unsubscribe"]).toBe(msg().headers["List-Unsubscribe"]);
    expect(body).toContain("A line with an =3D sign.");
    expect(decodeQp(body.replace(/\r\n$/, ""))).toBe(msg().body);
    expect(raw).not.toMatch(/[^\r]\n/);
    expect(raw).not.toMatch(/text\/html|<img|multipart/i);
  });

  it("folds long headers at 78 characters", () => {
    const raw = buildMime(msg(), { date: DATE, messageIdDomain: "ambadvisory-mail.example" });
    const head = raw.split("\r\n\r\n")[0]!;
    for (const line of head.split("\r\n")) expect(line.length).toBeLessThanOrEqual(78);
    expect(foldHeader("X-Short", "fine")).toBe("X-Short: fine");
  });

  it("uses a Message-ID from the message headers when one is given, and keeps In-Reply-To and References", () => {
    const raw = buildMime(msg({ headers: { "Message-ID": "<t-000050.1@x.example>", "In-Reply-To": "<t-000042.2@x.example>", References: "<t-000042.2@x.example>" } }), { date: DATE, messageIdDomain: "x.example" });
    const { headers } = parse(raw);
    expect(headers["Message-ID"]).toBe("<t-000050.1@x.example>");
    expect(headers["In-Reply-To"]).toBe("<t-000042.2@x.example>");
    expect(raw.match(/^Message-ID:/gm)!.length).toBe(1);
  });

  it("encodes a non-ASCII subject and sender name as RFC 2047 words that decode back", () => {
    const raw = buildMime(msg({ subject: "Exit-readiness check for Peña Plumbing and Ñandú Air Conditioning Services", fromName: "José Example, AMB Advisory Services" }), { date: DATE, messageIdDomain: "x.example" });
    const { headers } = parse(raw);
    const decode = (v: string) => v.split(" ").map((w) => Buffer.from(/^=\?UTF-8\?B\?(.*)\?=$/.exec(w)![1]!, "base64").toString("utf8")).join("");
    expect(decode(headers.Subject!)).toBe("Exit-readiness check for Peña Plumbing and Ñandú Air Conditioning Services");
    expect(headers.From).toMatch(/^=\?UTF-8\?B\?.*\?= <frank@ambadvisory-mail\.example>$/);
    for (const w of encodeHeaderText("Ñandú ".repeat(30)).split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
  });

  it("refuses a header value with a line break (header injection)", () => {
    expect(() => buildMime(msg({ subject: "Hello\r\nBcc: everyone@example.com" }), { date: DATE, messageIdDomain: "x.example" })).toThrow(/line break/);
    expect(() => buildMime(msg({ headers: { "X-Note": "a\nb" } }), { date: DATE, messageIdDomain: "x.example" })).toThrow(/line break/);
  });

  it("refuses to let message headers replace From, To or Subject", () => {
    expect(() => buildMime(msg({ headers: { From: "someone@else.example" } }), { date: DATE, messageIdDomain: "x.example" })).toThrow(/may not be overridden/);
  });
});

describe("encoding helpers", () => {
  it("keeps quoted-printable lines at 76 characters without splitting an escape", () => {
    const text = `${"é".repeat(60)}\n${"a".repeat(200)} \nend`;
    const qp = quotedPrintable(text);
    for (const line of qp.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
    expect(qp).not.toMatch(/=[0-9A-F]?=\r\n/);
    expect(qp).toContain("=20\r\nend");
    expect(decodeQp(qp)).toBe(text);
  });

  it("quotes display names with commas and escapes quotes", () => {
    expect(formatAddress('Frank "F" Example, AMB', "f@x.example")).toBe('"Frank \\"F\\" Example, AMB" <f@x.example>');
    expect(formatAddress("", "f@x.example")).toBe("f@x.example");
  });

  it("encodes base64url without padding or + and /", () => {
    const s = "subject?>>>~~~ é";
    const b = base64url(s);
    expect(b).not.toMatch(/[+/=]/);
    expect(Buffer.from(b, "base64url").toString("utf8")).toBe(s);
  });

  it("derives the same Message-ID from a Date and from the stored creation stamp", () => {
    expect(messageIdFor("T-000001", new Date("2026-10-20T14:00:00.000Z"), "X.example")).toBe(messageIdFor("T-000001", "2026-10-20T14:00:00Z", "x.example"));
    expect(rfc5322Date(new Date("2026-01-04T00:00:00Z"))).toBe("Sun, 04 Jan 2026 00:00:00 +0000");
  });
});
