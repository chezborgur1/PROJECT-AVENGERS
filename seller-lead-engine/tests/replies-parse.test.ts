import { describe, expect, it } from "vitest";
import { addressOf, detectAutoReply, detectBounce, isPolicyBounceSnippet, policyBounceCode, stripQuoted } from "../src/replies/parse.ts";
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

  it("classifies Microsoft's 550; 5.7.515 and 550 5.7.515 rejections as policy bounces, not hard ones", () => {
    const a = detectBounce(outlookAuthBounce("john@hotmail.example"));
    expect(a).toEqual({ type: "policy", recipient: "john@hotmail.example", code: "5.7.515" });
    const b = detectBounce(inbound({ from: "postmaster@outlook.com", subject: "Undeliverable: hello", text: "Remote server returned 550 5.7.515 Access denied" }));
    expect(b).toMatchObject({ type: "policy", code: "5.7.515" });
  });

  it("classifies other authentication and sending-policy rejections as policy bounces", () => {
    const report = (text: string) => detectBounce(inbound({ from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)", text }));
    expect(report("550 5.7.509 Access denied, sending domain does not pass DMARC verification")).toMatchObject({ type: "policy", code: "5.7.509" });
    expect(report("550-5.7.26 This mail has been blocked because the sender is unauthenticated.")).toMatchObject({ type: "policy", code: "5.7.26" });
    expect(report("550 5.7.1 Message rejected: SPF check failed for ambadvisory-mail.example")).toMatchObject({ type: "policy", code: "5.7.1" });
    expect(report("Status: 5.7.23\nDiagnostic-Code: smtp; 550 SPF validation failed")).toMatchObject({ type: "policy", code: "5.7.23" });
  });

  it("keeps real recipient failures hard: unknown user, bad address, disabled mailbox, no such domain", () => {
    const report = (text: string) => detectBounce(inbound({ from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)", text }));
    expect(report("550 5.1.1 The email account that you tried to reach does not exist.")).toMatchObject({ type: "hard", code: "5.1.1" });
    expect(report("550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup")).toMatchObject({ type: "hard", code: "5.1.10" });
    expect(report("550 5.2.1 The email account that you tried to reach is disabled.")).toMatchObject({ type: "hard", code: "5.2.1" });
    expect(report("550 5.4.1 Recipient address rejected: Access denied")).toMatchObject({ type: "hard", code: "5.4.1" });
    // A 5.7.x with no authentication wording is a recipient-side refusal, and stays hard.
    expect(report("550 5.7.1 Delivery not authorized, message refused")).toMatchObject({ type: "hard", code: "5.7.1" });
  });

  it("reads a policy code back from a replies.csv snippet", () => {
    expect(isPolicyBounceSnippet("Authentication bounce 5.7.515: Delivery has failed")).toBe(true);
    expect(isPolicyBounceSnippet("550; 5.7.515 Access denied")).toBe(true);
    expect(isPolicyBounceSnippet("550 5.1.1 does not exist")).toBe(false);
    expect(policyBounceCode("Remote server returned '550 5.7.26 unauthenticated'")).toBe("5.7.26");
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

  it("treats an owner on vacation who still answers as a person, not an auto-reply", () => {
    expect(detectAutoReply(inbound({ text: "I'm on vacation until Monday, but yes, I'm interested" }))).toBe(false);
    expect(detectAutoReply(inbound({ text: "I am out of the office this week. Call me on Monday about the check." }))).toBe(false);
    expect(detectAutoReply(inbound({ text: "I'm currently traveling. What does the check cost?" }))).toBe(false);
    const long = `I am out of the office until Monday. ${"We have run the shop for thirty years and my two sons work with me most days on the bigger jobs. ".repeat(3)}`;
    expect(detectAutoReply(inbound({ text: long }))).toBe(false);
  });

  it("keeps the subject and headers ahead of any human wording in the body", () => {
    expect(detectAutoReply(inbound({ subject: "Automatic reply: Exit-readiness check", text: "Yes, interested." }))).toBe(true);
    expect(detectAutoReply(inbound({ headers: { "auto-submitted": "auto-replied" }, text: "Yes, interested." }))).toBe(true);
    // An autoresponder's stock "if you are interested" is not an answer.
    expect(detectAutoReply(inbound({ text: "This is an automated response. If you are interested in our services, visit our website." }))).toBe(true);
  });

  it("ignores out-of-office wording that sits only in the quoted history", () => {
    expect(detectAutoReply(inbound({ text: `Sounds good.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Frank wrote:\n> ${OOO_TEXT}` }))).toBe(false);
  });
});
