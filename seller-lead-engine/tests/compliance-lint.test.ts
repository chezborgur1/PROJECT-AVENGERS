import { describe, expect, it } from "vitest";
import { adNotice, buildFooter } from "../src/compliance/footer.ts";
import { BANNED_PHRASES, lintBody, lintMessage, lintSubject, wordCount } from "../src/compliance/lint.ts";
import { outreachMessage, replyMessage, REPLY_BODY, STEP1_BODY } from "./fixtures/compliance/messages.ts";
import { makeProspect, testConfig } from "./helpers.ts";

const config = testConfig();
const step1 = { kind: "outreach" as const, step: 1 };

describe("lintSubject", () => {
  it("passes a plain, literally true subject", () => {
    expect(lintSubject("Exit-readiness check for Example Air")).toEqual([]);
    expect(lintSubject("Exit-readiness check for Bay HVAC")).toEqual([]);
  });

  it("refuses a fake Re: or Fwd: on a first message, but allows Re: on a follow-up", () => {
    expect(lintSubject("Re: your business")).toEqual([expect.stringMatching(/Re:/)]);
    expect(lintSubject("RE:your business")[0]).toMatch(/Re:/);
    expect(lintSubject("Fwd: your business")[0]).toMatch(/Fwd:/);
    expect(lintSubject("Fw: your business")[0]).toMatch(/Fwd:/);
    expect(lintSubject("Re: Exit-readiness check for Example Air", { step: 2 })).toEqual([]);
    expect(lintSubject("Fwd: Exit-readiness check", { step: 2 })[0]).toMatch(/Fwd:/);
  });

  it("refuses all-caps words, exclamation marks, false urgency and invented offers", () => {
    expect(lintSubject("FREE exit check")).toEqual(['subject has an all-caps word "FREE"']);
    expect(lintSubject("Exit check for you!")).toEqual(['subject has "!"']);
    expect(lintSubject("Urgent: exit check")[0]).toMatch(/false urgency/);
    expect(lintSubject("Final notice for Example Air")[0]).toMatch(/final notice/);
    expect(lintSubject("Act now on your exit")[0]).toMatch(/act now/);
    expect(lintSubject("A buyer waiting for Example Air")[0]).toMatch(/invents an offer/);
    expect(lintSubject("Cash offer for Example Air")[0]).toMatch(/cash offer/);
    expect(lintSubject("As discussed, your exit check")[0]).toMatch(/prior contact/);
  });

  it("enforces a length of 3 to 60 characters", () => {
    expect(lintSubject("Hi")[0]).toMatch(/minimum 3/);
    expect(lintSubject("x".repeat(61))[0]).toMatch(/maximum 60/);
    expect(lintSubject("x".repeat(60))).toEqual([]);
  });
});

describe("lintBody", () => {
  it("passes the clean step-1 body and the clean reply body", () => {
    expect(lintBody(STEP1_BODY, step1)).toEqual([]);
    expect(lintBody(REPLY_BODY, { kind: "reply" })).toEqual([]);
  });

  it("flags every banned phrase from HOUSE_STYLE 4.4", () => {
    for (const b of BANNED_PHRASES) expect(lintBody(`Your company is ${b} in Tampa.`, { kind: "reply" }), b).toContain(`banned phrase "${b}"`);
    expect(lintBody("We leverage our network.", { kind: "reply" })).toContain('banned phrase "leverage" as a verb');
    expect(lintBody("Moreover, the check is free.", { kind: "reply" })).toContain('filler opener "Moreover"');
  });

  it("allows strong, solid or significant only beside a number", () => {
    expect(lintBody("You have a strong team.", { kind: "reply" })).toContain('"strong" without a number in the sentence');
    expect(lintBody("Revenue grew a strong 12% last year.", { kind: "reply" })).toEqual([]);
  });

  it("flags em dashes, spaced en dashes and exclamation marks", () => {
    expect(lintBody("The check is free\u2014no catch.", { kind: "reply" })).toContain("em dash");
    expect(lintBody("The check is free \u2013 no catch.", { kind: "reply" })).toContain("en dash used as an em dash");
    expect(lintBody("The check is free!", { kind: "reply" })).toContain('exclamation mark "!"');
    expect(lintBody("Open 2015\u20132026.", { kind: "reply" })).toEqual([]);
  });

  it("flags questions, links and more than 110 words in step 1 only", () => {
    expect(lintBody("Have you thought about selling?", step1)).toEqual([expect.stringMatching(/question in step 1/)]);
    expect(lintBody("Have you thought about selling?", { kind: "outreach", step: 2 })).toEqual([]);
    expect(lintBody("See https://ambadvisoryservices.com for more.", step1)).toContain("link in step 1");
    expect(lintBody("See www.ambadvisoryservices.com for more.", step1)).toContain("link in step 1");
    expect(lintBody("See ambadvisoryservices.com for more.", step1)).toContain("link in step 1");
    expect(lintBody("Write to frank@ambadvisoryservices.com for more.", step1)).toEqual([]);
    const long = Array.from({ length: 111 }, () => "word").join(" ");
    expect(lintBody(long, step1)).toContain("step 1 is 111 words before the footer (maximum 110)");
    expect(lintBody(long, { kind: "outreach", step: 2 })).toEqual([]);
    expect(wordCount(STEP1_BODY)).toBeLessThanOrEqual(110);
  });

  it("never lets an email mention the owner's age, health, family, death, divorce or succession", () => {
    const cases: [string, RegExp][] = [
      ["At your age, it may be time.", /age/],
      ["Many owners near retirement call us.", /retirement/],
      ["Many owners plan to retire soon.", /retirement/],
      ["I hope your health is good.", /health/],
      ["After a death in the family, owners call us.", /death/],
      ["Will your children take over the business?", /family/],
      ["A family-owned company like yours.", /family/],
      ["Going through a divorce changes things.", /divorce/],
      ["Do you have a succession plan?", /succession/],
      ["A 30-year-old company.", /age/],
    ];
    for (const [text, label] of cases) {
      const issues = lintBody(text, { kind: "reply" });
      expect(issues.some((i) => /never in any email/.test(i) && label.test(i)), text).toBe(true);
    }
    expect(lintBody("Do you own the real estate or lease it?", { kind: "reply" })).toEqual([]);
  });

  it("lints around record facts such as a business name", () => {
    // Family words are flagged only where they point at the owner ("your family", "family-owned"), so a name alone passes.
    expect(lintBody("Smith and Sons Family Dental has been open since 1994.", { kind: "reply" })).toEqual([]);
    expect(lintBody("Smith Family-Owned Plumbing has been open since 1994.", { kind: "reply" }).length).toBeGreaterThan(0);
    expect(lintBody("Smith Family-Owned Plumbing has been open since 1994.", { kind: "reply", allow: ["Smith Family-Owned Plumbing"] })).toEqual([]);
  });

  it("refuses appraisal, certified valuation and guarantee claims unless negated", () => {
    expect(lintBody("You will get an appraisal of the business.", { kind: "reply" })[0]).toMatch(/appraisal/);
    expect(lintBody("We guarantee a price.", { kind: "reply" })[0]).toMatch(/guarantee/);
    expect(lintBody("It is a certified valuation.", { kind: "reply" })[0]).toMatch(/certified valuation/);
    expect(lintBody("It is a rough range, not an appraisal or certified valuation, and there is no guarantee of price.", { kind: "reply" })).toEqual([]);
  });

  it("flags unrendered tokens and the firm name used wrongly", () => {
    expect(lintBody("Hi {first_name},", { kind: "reply" })).toContain("unrendered token {first_name}");
    expect(lintBody("I work at AMB in Tampa.", { kind: "reply" })[0]).toMatch(/"AMB" alone/);
    expect(lintBody("I work at AMB Advisory in Tampa.", { kind: "reply" })).toContain('first mention of the firm must be "AMB Advisory Services"');
  });
});

describe("lintMessage", () => {
  const p = makeProspect();

  it("passes a complete outreach message and a complete reply", () => {
    expect(lintMessage(outreachMessage(config, p), config)).toEqual([]);
    expect(lintMessage(replyMessage(config, p), config)).toEqual([]);
  });

  it("requires the postal address, legal name and opt-out in the footer", () => {
    const mailbox = config.mailboxes[0]!;
    const issues = lintMessage(outreachMessage(config, p, { body: `${STEP1_BODY}\n\n${adNotice(config)}\n\nFrank Example` }), config);
    expect(issues).toEqual(expect.arrayContaining(["footer is missing the postal address", 'footer is missing the legal name "AMB Advisory Services LLC"', "footer is missing the opt-out instruction"]));
    expect(lintMessage(outreachMessage(config, p, { body: `${STEP1_BODY}\n\n${buildFooter(config, mailbox)}` }), config)).toEqual(["outreach is missing the advertisement notice"]);
  });

  it("reports a blank postal address in config", () => {
    const blank = testConfig({ firm: { postal_address: "" } });
    expect(lintMessage(outreachMessage(blank, p), blank)).toContain("firm.postal_address is blank: CAN-SPAM requires a valid postal address (16 CFR 316.2(p))");
  });

  it("requires the AI disclosure on a reply", () => {
    const mailbox = config.mailboxes[0]!;
    expect(lintMessage(replyMessage(config, p, { body: `${REPLY_BODY}\n\n${buildFooter(config, mailbox)}` }), config)).toEqual(["reply is missing the AI-assistance disclosure"]);
  });

  it("requires a From name with the mailbox's real sender and the firm", () => {
    expect(lintMessage(outreachMessage(config, p, { fromName: "Sarah Persona, AMB Advisory Services" }), config)).toEqual([expect.stringMatching(/configured sender/)]);
    expect(lintMessage(outreachMessage(config, p, { fromName: "Frank Example" }), config)).toEqual([expect.stringMatching(/Balsam/)]);
  });

  it("flags an unknown mailbox, a bad recipient, and a non-HTTPS unsubscribe URL", () => {
    expect(lintMessage(outreachMessage(config, p, { mailbox: "someone@else.example" }), config)).toContain("mailbox someone@else.example is not in config.mailboxes");
    expect(lintMessage(outreachMessage(config, p, { to: "not-an-email" }), config)).toContain('recipient "not-an-email" is not a valid email address');
    const http = testConfig({ sending: { unsubscribe_url: "http://x.example/u" } });
    expect(lintMessage(outreachMessage(http, p), http)).toContain("sending.unsubscribe_url must be an https:// URL");
  });

  it("does not count the footer as step-1 links or words", () => {
    const c = testConfig({ sending: { unsubscribe_url: "https://ambadvisoryservices.com/unsubscribe" } });
    expect(lintMessage(outreachMessage(c, p), c)).toEqual([]);
  });

  it("lints the subject of outreach and allows Re: on step 2", () => {
    expect(lintMessage(outreachMessage(config, p, { subject: "Re: Example Air" }), config)[0]).toMatch(/Re:/);
    expect(lintMessage(outreachMessage(config, p, { step: 2, subject: "Re: Exit-readiness check for Example Air" }), config)).toEqual([]);
    expect(lintMessage(replyMessage(config, p, { subject: " " }), config)).toEqual(["subject is blank"]);
  });
});
