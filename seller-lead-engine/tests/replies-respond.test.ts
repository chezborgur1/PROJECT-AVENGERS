import { describe, expect, it } from "vitest";
import { aiDisclosure, buildFooter } from "../src/compliance/footer.ts";
import { assertSendable } from "../src/compliance/gate.ts";
import { lintMessage } from "../src/compliance/lint.ts";
import { Suppression } from "../src/compliance/suppression.ts";
import type { OutgoingMessage } from "../src/domain/messages.ts";
import type { ReplyClass } from "../src/domain/schema.ts";
import type { Classification } from "../src/replies/classify.ts";
import { INTAKE_QUESTIONS } from "../src/qualify/questions.ts";
import { draftResponse, faqTopics, replySubject, shortBusinessName, stop, withQuestionsAsked } from "../src/replies/respond.ts";
import { makeLead, makeProspect, tempStores, testConfig } from "./helpers.ts";

const config = testConfig();
const mailbox = config.mailboxes[0]!;
const prospect = makeProspect({ business_name: "Example Air Inc", owner_first_name: "JOHN", license_issue_date: "1994-06-15", formation_date: "1996-03-01" });
const lead = makeLead(prospect);

const cls = (c: ReplyClass, o: Partial<Classification> = {}): Classification => ({ class: c, classifier: "rules", optOut: false, complaint: false, facts: {}, notes: "", ...o });
const draft = (c: Classification, o: { lead?: typeof lead; subject?: string; config?: typeof config } = {}) =>
  draftResponse(c, { prospect, lead: o.lead ?? lead, config: o.config ?? config, mailbox, subject: o.subject ?? "Re: Exit-readiness check for Example Air" });

/** The draft as the outgoing reply processInbox would gate. */
const asMessage = (d: { subject: string; body: string }): OutgoingMessage => ({
  touchId: "T-000009",
  prospectId: prospect.prospect_id,
  kind: "reply",
  mailbox: mailbox.email,
  fromName: `${mailbox.sender_name}, ${config.firm.name}`,
  to: prospect.email,
  subject: d.subject,
  body: d.body,
  headers: {},
  threadId: "thread-1",
});

const DRAFTED: ReplyClass[] = ["interested", "question", "asks_if_ai", "not_now", "not_interested", "wrong_person", "referral"];

describe("draftResponse", () => {
  it("drafts nothing for an opt-out, a bounce, an auto-reply, a complaint or an unclear reply", () => {
    for (const c of ["unsubscribe", "bounce", "auto_reply", "complaint", "other"] as const) expect(draft(cls(c)), c).toBeNull();
    // The flags decide too, whatever the class says.
    expect(draft(cls("interested", { optOut: true }))).toBeNull();
    expect(draft(cls("question", { complaint: true }))).toBeNull();
  });

  it.each(DRAFTED)("drafts a %s reply that passes the copy lint and the compliance gate", (c) => {
    const d = draft(cls(c, { question: "Who are you and how did you get my email? What does it cost? Is this confidential?" }))!;
    expect(d).not.toBeNull();
    const msg = asMessage(d);
    const allow = [prospect.business_name, prospect.city, prospect.owner_name];
    expect(lintMessage(msg, config, { allow })).toEqual([]);
    expect(() => assertSendable(msg, { config, suppression: new Suppression(tempStores().suppression), prospect })).not.toThrow();
  });

  it.each(DRAFTED)("ends a %s reply with the AI disclosure and the footer, signed by the sender, with no em dash or exclamation mark", (c) => {
    const d = draft(cls(c))!;
    expect(d.body.endsWith(`Frank\n\n${aiDisclosure(config, mailbox)}\n\n${buildFooter(config, mailbox)}`)).toBe(true);
    expect(d.body.startsWith("Hi John,")).toBe(true);
    expect(d.body).not.toMatch(/[\u2014!]/);
    expect(d.subject).toBe("Re: Exit-readiness check for Example Air");
  });

  it("asks up to three intake questions on an interested reply and reports their keys", () => {
    const d = draft(cls("interested"))!;
    expect(d.questionKeys).toEqual(["revenue", "sde", "timeline"]);
    expect(d.body).toMatch(/1\. Roughly what was revenue last full year/);
    expect(d.body).toMatch(/3\. If you did sell/);
    expect(d.body).toMatch(/please do not send tax returns or bank statements/);
    expect(d.body).toMatch(/AMB Advisory Services/);
    // A lead who answered everything gets no questions.
    const done = makeLead(prospect, { questions_asked: INTAKE_QUESTIONS.map((q) => q.key).join("; ") });
    expect(draft(cls("interested"), { lead: done })!.questionKeys).toEqual([]);
  });

  it("says where the business and the address came from, from the prospect's own records", () => {
    const d = draft(cls("question", { question: "How did you get my email?" }))!;
    expect(d.body).toContain("through public licence records and state business filings.");
    expect(d.body).toContain("Your email address is the one listed on the business's website.");
    // A directory-sourced address is named honestly.
    const vendor = draftResponse(cls("question", { question: "Where did you get my address?" }), { prospect: { ...prospect, email_source: "hunter" }, lead, config, mailbox })!;
    expect(vendor.body).toContain("public licence records");
    expect(vendor.body).toContain("Hunter, a business contact directory");
    // An imported address never claims a website it did not come from (REVIEW_R1.md item 25).
    const imported = draftResponse(cls("question", { question: "Where did you get my email?" }), {
      prospect: { ...prospect, email_source: "import", website: "", license_numbers: "", sources: "open_poi:fsq-1", formation_date: "", entity_status: "" },
      lead,
      config,
      mailbox,
    })!;
    expect(imported.body).toContain("through a public business listing dataset.");
    expect(imported.body).toContain("Your email address came from a business contact list.");
    expect(imported.body).not.toMatch(/website/);
  });

  it("answers cost, confidentiality, who and why from the fixed FAQ", () => {
    const d = draft(cls("question", { question: "Who are you? Why me? What does it cost? Will this stay confidential?" }))!;
    expect(d.body).toMatch(/I am Frank Example, Principal at AMB Advisory Services\./);
    expect(d.body).toMatch(/operating since 1994/);
    expect(d.body).toMatch(/The check is free, and there is no obligation/);
    expect(d.body).toMatch(/stays confidential/);
    expect(faqTopics("Who are you? Why me? What does it cost? Will this stay confidential?")).toEqual(["who", "why", "cost", "confidential"]);
    // With partner lead sales on, the confidentiality promise is narrowed to what holds.
    const selling = testConfig({ lead_sales: { enabled: true, legal_review_ref: "x" } });
    expect(draft(cls("question", { question: "Is this confidential?" }), { config: selling })!.body).not.toMatch(/stays confidential/);
  });

  it("gives an unclear question the who and what-is-the-check answers", () => {
    const d = draft(cls("question", { question: "Hmm?" }))!;
    expect(d.body).toMatch(/I am Frank Example/);
    expect(d.body).toMatch(/It is not an appraisal or a formal valuation/);
  });

  it("answers the AI question truthfully and offers a call with the named sender", () => {
    const d = draft(cls("asks_if_ai", { question: "Is this a bot?" }))!;
    expect(d.body).toMatch(/I am Frank Example, Principal at AMB Advisory Services, and I am a real person\./);
    expect(d.body).toMatch(/I use an AI assistant to draft some replies, including this one/);
    expect(d.body).toMatch(/I will call you myself/);
    expect(d.questionKeys).toEqual([]);
  });

  it("keeps not now, not interested and wrong person short, with no questions", () => {
    for (const c of ["not_now", "not_interested", "wrong_person"] as const) {
      const d = draft(cls(c))!;
      expect(d.questionKeys).toEqual([]);
      const copy = d.body.split(`\n\nFrank\n\n`)[0]!;
      expect(copy.split(/\s+/).length, c).toBeLessThan(60);
    }
    expect(draft(cls("wrong_person"))!.body).toMatch(/will not email it again/);
    expect(draft(cls("not_interested"))!.body).toMatch(/I will not send any more emails in this series/);
  });

  it("greets by name when known and says Hello otherwise", () => {
    const anon = draftResponse(cls("not_now"), { prospect: { ...prospect, owner_first_name: "", owner_name: "" }, lead: { ...lead, owner_name: "" }, config, mailbox })!;
    expect(anon.body.startsWith("Hello,")).toBe(true);
  });
});

describe("reply helpers", () => {
  it("folds Re: and Fwd: prefixes into one Re:, and falls back to the outreach subject", () => {
    expect(replySubject("RE: Re: Fwd: Exit-readiness check", "x")).toBe("Re: Exit-readiness check");
    expect(replySubject("", "Exit-readiness check for Example Air")).toBe("Re: Exit-readiness check for Example Air");
    expect(replySubject(undefined, "Fallback")).toBe("Re: Fallback");
  });

  it("drops a legal suffix from a business name", () => {
    expect(shortBusinessName("Example Air Inc")).toBe("Example Air");
    // A name ending in "Inc." ends a sentence with one full stop.
    expect(stop("Gulfside Air Conditioning & Heating, Inc.")).toBe("Gulfside Air Conditioning & Heating, Inc.");
    expect(stop("Example Air Inc")).toBe("Example Air Inc.");
    const dotted = draftResponse(cls("interested"), { prospect: { ...prospect, business_name: "Example Air, Inc." }, lead, config, mailbox });
    expect(dotted!.body).toContain("for Example Air, Inc.\n");
    expect(dotted!.body).not.toContain("Inc..");
    expect(shortBusinessName("Smith Plumbing, LLC")).toBe("Smith Plumbing");
    expect(shortBusinessName("Gulf Coast Mechanical")).toBe("Gulf Coast Mechanical");
  });

  it("adds asked question keys without duplicates", () => {
    expect(withQuestionsAsked(makeLead(prospect, { questions_asked: "revenue" }), ["revenue", "sde"])).toBe("revenue; sde");
  });
});
