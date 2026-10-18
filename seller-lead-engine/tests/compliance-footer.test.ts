import { describe, expect, it } from "vitest";
import { adNotice, aiDisclosure, buildFooter, listUnsubscribeHeaders, OPT_OUT_LINE, unsubscribeUrl } from "../src/compliance/footer.ts";
import { lintBody } from "../src/compliance/lint.ts";
import { testConfig } from "./helpers.ts";

const config = testConfig();
const mailbox = config.mailboxes[0]!;
const withUrl = testConfig({ sending: { unsubscribe_url: "https://ambadvisoryservices.com/unsubscribe" } });

describe("footer copy", () => {
  it("identifies the email as marketing in one plain sentence naming the firm", () => {
    expect(adNotice(config)).toBe("This is a marketing email from AMB Advisory Services.");
  });

  it("builds the footer: sender, title and legal name, postal address, phone, opt-out", () => {
    expect(buildFooter(config, mailbox)).toBe(
      ["Frank Example", "Principal, AMB Advisory Services LLC", "100 Example Street, Suite 200, Tampa, FL 33602", "813.364.2178", "", OPT_OUT_LINE].join("\n"),
    );
    expect(OPT_OUT_LINE).toBe("Reply 'unsubscribe' and I will not email you again.");
  });

  it("leaves out a blank title and phone, and adds the opt-out URL when configured", () => {
    const c = testConfig({ firm: { postal_address: "PO Box 1, Tampa, FL 33601" }, sending: { unsubscribe_url: "https://ambadvisoryservices.com/unsubscribe" } });
    const footer = buildFooter(c, { ...mailbox, sender_title: "" });
    expect(footer.split("\n").slice(0, 3)).toEqual(["Frank Example", "AMB Advisory Services LLC", "PO Box 1, Tampa, FL 33601"]);
    expect(footer).toContain(`${OPT_OUT_LINE} You can also opt out at https://ambadvisoryservices.com/unsubscribe`);
  });

  it("says plainly that a reply was drafted with an AI assistant and a named person reviews it", () => {
    expect(aiDisclosure(config, mailbox)).toBe("This reply was drafted with an AI assistant. Frank Example of AMB Advisory Services reviews every reply before it is sent.");
  });

  it("passes the house-style lint itself: no em dashes, no exclamation marks, no banned words", () => {
    for (const text of [adNotice(config), buildFooter(withUrl, mailbox), aiDisclosure(config, mailbox)]) {
      expect(text).not.toMatch(/[\u2014!]/);
      expect(lintBody(text, { kind: "reply" })).toEqual([]);
    }
  });
});

describe("List-Unsubscribe headers", () => {
  it("carries a mailto with the touch id, and no one-click header without a URL", () => {
    expect(listUnsubscribeHeaders(config, mailbox, "T-000123")).toEqual({ "List-Unsubscribe": "<mailto:frank@ambadvisory-mail.example?subject=unsubscribe%20T-000123>" });
  });

  it("adds the HTTPS URL and List-Unsubscribe-Post when a URL is configured", () => {
    expect(listUnsubscribeHeaders(withUrl, mailbox, "T-000123")).toEqual({
      "List-Unsubscribe": "<https://ambadvisoryservices.com/unsubscribe?t=T-000123>, <mailto:frank@ambadvisory-mail.example?subject=unsubscribe%20T-000123>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    const q = testConfig({ sending: { unsubscribe_url: "https://x.example/u?src=email" } });
    expect(listUnsubscribeHeaders(q, mailbox, "T-1")["List-Unsubscribe"]).toContain("<https://x.example/u?src=email&t=T-1>");
  });

  it("sends the mailto to the configured unsubscribe mailbox when set", () => {
    const c = testConfig({ sending: { unsubscribe_mailbox: "optout@ambadvisory-mail.example" } });
    expect(listUnsubscribeHeaders(c, mailbox, "T-9")["List-Unsubscribe"]).toBe("<mailto:optout@ambadvisory-mail.example?subject=unsubscribe%20T-9>");
  });

  it("ignores a non-HTTPS unsubscribe URL, since RFC 8058 one-click needs HTTPS", () => {
    const c = testConfig({ sending: { unsubscribe_url: "http://insecure.example/u" } });
    expect(unsubscribeUrl(c)).toBe("");
    expect(listUnsubscribeHeaders(c, mailbox, "T-9")["List-Unsubscribe-Post"]).toBeUndefined();
    expect(buildFooter(c, mailbox)).not.toContain("insecure");
  });
});
