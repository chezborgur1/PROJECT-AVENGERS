import { describe, expect, it } from "vitest";
import { addressOf, detectAutoReply, detectBounce, stripQuoted } from "../src/replies/parse.ts";
import { GMAIL_REPLY, gmailDelay, gmailHardBounce, inbound, OOO_TEXT, outlookAuthBounce, OUTLOOK_REPLY } from "./fixtures/replies/messages.ts";

describe("stripQuoted", () => {
  it("keeps the new text above a Gmail attribution that wraps onto two lines", () => {
    expect(stripQuoted(GMAIL_REPLY)).toBe("Sure, send the questions over.\n\nJohn");
  });

  it("cuts at an Outlook header block and drops the mobile sign-off, with CRLF line ends", () => {
    expect(stripQuoted(OUTLOOK_REPLY)).toBe("Not right now, maybe in a couple of years.");
  });

  it("cuts at an Original Message rule and at a one-line attribution", () => {
    expect(stripQuoted("Yes please.\n-----Original Message-----\nFrom: Frank\nunsubscribe")).toBe("Yes please.");
    expect(stripQuoted("Call me Friday.\nOn Oct 13, 2026, at 9:02 AM, Frank Example <frank@x.example> wrote:\n> hi")).toBe("Call me Friday.");
  });

  it("drops interleaved > lines but keeps the owner's lines between them", () => {
    expect(stripQuoted("> What was revenue?\nAbout $1.2M.\n> Employees?\nTwelve.")).toBe("About $1.2M.\nTwelve.");
  });

  it("drops the signature after the -- delimiter", () => {
    expect(stripQuoted("Interested.\n-- \nJohn Example\nExample Air Inc\nPlease unsubscribe from nothing")).toBe("Interested.");
    expect(stripQuoted("Interested.\n--\nJohn")).toBe("Interested.");
  });

  it("returns an empty string for a reply that is only quoted history", () => {
    expect(stripQuoted("> Hi John\n> Reply 'unsubscribe'")).toBe("");
  });
});

describe("addressOf", () => {
  it("pulls the address out of a display-name form and lower-cases it", () => {
    expect(addressOf("John Example <John@ExampleAir.example>")).toBe("john@exampleair.example");
    expect(addressOf("john@exampleair.example")).toBe("john@exampleair.example");
    expect(addressOf("No address here")).toBe("");
  });
});

describe("detectBounce", () => {
  it("reads a Gmail hard bounce without headers, with the failed recipient and code", () => {
    expect(detectBounce(gmailHardBounce("gone@exampleair.example"))).toEqual({ type: "hard", recipient: "gone@exampleair.example", code: "5.1.1" });
  });

  it("treats Microsoft's 550; 5.7.515 and 550 5.7.515 rejections as hard", () => {
    const a = detectBounce(outlookAuthBounce("john@hotmail.example"));
    expect(a).toEqual({ type: "hard", recipient: "john@hotmail.example", code: "5.7.515" });
    const b = detectBounce(inbound({ from: "postmaster@outlook.com", subject: "Undeliverable: hello", text: "Remote server returned 550 5.7.515 Access denied" }));
    expect(b).toMatchObject({ type: "hard", code: "5.7.515" });
  });

  it("treats a delay notice and a 4.x.x code as soft", () => {
    expect(detectBounce(gmailDelay("john@exampleair.example"))).toMatchObject({ type: "soft", recipient: "john@exampleair.example", code: "4.2.2" });
    expect(detectBounce(inbound({ from: "MAILER-DAEMON@mx.example", subject: "Warning: message delayed", text: "Status: 4.4.1\nwill retry" }))).toMatchObject({ type: "soft", code: "4.4.1" });
  });

  it("reads the DSN Status field and Final-Recipient when a Gmail API source has them", () => {
    const msg = inbound({
      from: "mailer-daemon@googlemail.com",
      subject: "Delivery Status Notification (Failure)",
      text: "Final-Recipient: rfc822; old@exampleair.example\nAction: failed\nStatus: 5.2.1",
      headers: { "x-failed-recipients": "old@exampleair.example" },
    });
    expect(detectBounce(msg)).toEqual({ type: "hard", recipient: "old@exampleair.example", code: "5.2.1" });
  });

  it("reads a Postfix report with a bare SMTP code", () => {
    const msg = inbound({ from: "MAILER-DAEMON@mail.example", subject: "Undelivered Mail Returned to Sender", text: "<sam@shop.example>: host mx.shop.example said: 550 User unknown (in reply to RCPT TO command)" });
    expect(detectBounce(msg)).toEqual({ type: "hard", recipient: "sam@shop.example", code: "550" });
  });

  it("defaults a failure report with no code to hard, erring toward suppression", () => {
    expect(detectBounce(inbound({ from: "postmaster@shop.example", subject: "Returned mail", text: "Your message could not be sent." }))).toMatchObject({ type: "hard" });
  });

  it("never treats a person's reply as a bounce, even one quoting a status code", () => {
    expect(detectBounce(inbound({ text: "My IT guy says 550 5.1.1 errors were from the old server. Yes, interested." }))).toBeNull();
  });

  it("does not report the AMB mailbox itself as the failed recipient", () => {
    const msg = inbound({ from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)", text: "Your message wasn't delivered to frank@ambadvisory-mail.example because of a loop." });
    expect(detectBounce(msg)?.recipient).toBeUndefined();
  });
});

describe("detectAutoReply", () => {
  it("honours Auto-Submitted unless it says no", () => {
    expect(detectAutoReply(inbound({ headers: { "auto-submitted": "auto-replied" } }))).toBe(true);
    expect(detectAutoReply(inbound({ headers: { "auto-submitted": "no" } }))).toBe(false);
  });

  it("honours X-Autoreply and Precedence auto_reply, bulk and junk", () => {
    expect(detectAutoReply(inbound({ headers: { "x-autoreply": "yes" } }))).toBe(true);
    for (const p of ["auto_reply", "bulk", "junk"]) expect(detectAutoReply(inbound({ headers: { precedence: p } }))).toBe(true);
    expect(detectAutoReply(inbound({ headers: { precedence: "normal" } }))).toBe(false);
  });

  it("recognises out-of-office subjects without headers", () => {
    for (const subject of ["Automatic reply: Exit-readiness check for Example Air", "Out of Office: Exit-readiness check", "Auto-Reply: hello", "OOO until Monday"]) {
      expect(detectAutoReply(inbound({ subject, text: "x" }))).toBe(true);
    }
  });

  it("recognises out-of-office and autoresponder wording in the body", () => {
    expect(detectAutoReply(inbound({ text: OOO_TEXT }))).toBe(true);
    expect(detectAutoReply(inbound({ text: "This is an automated response. We have received your message and will respond within one business day." }))).toBe(true);
    expect(detectAutoReply(inbound({ text: "This mailbox is not monitored." }))).toBe(true);
  });

  it("does not mistake a person's reply for an auto-reply", () => {
    expect(detectAutoReply(inbound({ text: "Yes, send me the questions. I will be in the office all week." }))).toBe(false);
    expect(detectAutoReply(inbound({ text: "Who are you and what does this cost?" }))).toBe(false);
  });

  it("ignores out-of-office wording that sits only in the quoted history", () => {
    expect(detectAutoReply(inbound({ text: `Sounds good.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Frank wrote:\n> ${OOO_TEXT}` }))).toBe(false);
  });
});
