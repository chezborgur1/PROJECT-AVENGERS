import { describe, expect, it } from "vitest";
import { asksIfAi, classifyByKeywords, classifyByRules, classifyReply, withoutOwnText, wireToFacts, type ReplyWire } from "../src/replies/classify.ts";
import { stripQuoted } from "../src/replies/parse.ts";
import { GMAIL_REPLY, gmailHardBounce, inbound, OOO_TEXT } from "./fixtures/replies/messages.ts";
import { makeProspect, offline, testConfig } from "./helpers.ts";

const rules = (text: string, overrides = {}) => {
  const msg = inbound({ text, ...overrides });
  return classifyByRules(msg, stripQuoted(msg.text));
};

describe("classifyByRules", () => {
  it("classifies a delivery report as a bounce before anything else, even with our footer in it", () => {
    const msg = gmailHardBounce("gone@x.example");
    expect(classifyByRules(msg, stripQuoted(msg.text))).toMatchObject({ class: "bounce", classifier: "rules", optOut: false, notes: "hard bounce 5.1.1 for gone@x.example" });
  });

  it("classifies any opt-out wording as unsubscribe with the opt-out flag", () => {
    for (const text of ["Please remove me from your list.", "STOP", "Take me off this.", "Don't email me again", "Not interested, stop.", "unsubscribe"]) {
      expect(rules(text), text).toMatchObject({ class: "unsubscribe", optOut: true });
    }
  });

  it("flags a complaint inside an opt-out too", () => {
    expect(rules("This is spam. Remove me.")).toMatchObject({ class: "unsubscribe", optOut: true, complaint: true });
  });

  it("does not read our own quoted footer as an opt-out", () => {
    expect(rules(GMAIL_REPLY)).toBeNull();
    // Even when the footer line survives stripping (no quote marks).
    expect(rules("Sounds good.\n\nReply \u2018unsubscribe\u2019 and I will not email you again.")).toBeNull();
    expect(withoutOwnText("Yes. Reply 'unsubscribe' and I will not email you again.")).toBe("Yes.");
  });

  it("classifies an auto-reply before the complaint check, so 'check your spam folder' does not pause mailboxes", () => {
    expect(rules(`${OOO_TEXT} If you do not hear back, check your spam folder.`)).toMatchObject({ class: "auto_reply", complaint: false });
  });

  it("classifies a hostile reply as a complaint", () => {
    expect(rules("I am reporting this to the attorney general.")).toMatchObject({ class: "complaint", complaint: true, optOut: false });
  });

  it("classifies a question about bots or AI as asks_if_ai and keeps the question", () => {
    expect(rules("Interesting. Is this an AI? Are you a real person?")).toMatchObject({ class: "asks_if_ai", question: "Is this an AI? Are you a real person?" });
    for (const t of ["Was this written by ChatGPT?", "Am I talking to a bot?", "is this automated?"]) expect(asksIfAi(t), t).toBe(true);
    expect(asksIfAi("I am a real estate investor too.")).toBe(false);
  });

  it("returns null when the rules cannot decide", () => {
    expect(rules("Yes, send the questions.")).toBeNull();
    expect(rules("Who are you?")).toBeNull();
  });
});

describe("classifyByKeywords (no Claude key)", () => {
  const cases: [string, string][] = [
    ["Yes, I would like that.", "interested"],
    ["Sure, go ahead.", "interested"],
    ["Not right now, maybe in a couple of years.", "not_now"],
    ["Not interested at the moment.", "not_now"],
    ["No thanks, not at this time.", "not_interested"],
    ["Not interested.", "not_interested"],
    ["No.", "not_interested"],
    ["I sold the business in 2023.", "wrong_person"],
    ["I am not the owner.", "wrong_person"],
    ["You should talk to my business partner Mike.", "referral"],
    ["How did you get my email?", "question"],
    ["Thanks.", "other"],
  ];
  it.each(cases)("classifies %j as %s", (text, cls) => {
    expect(classifyByKeywords(text).class).toBe(cls);
  });

  it("records that an owner who says yes wants the check, and nothing else as a fact", () => {
    expect(classifyByKeywords("Yes. Revenue is about $2M.").facts).toEqual({ wants_readiness_check: "Y" });
    expect(classifyByKeywords("Not interested.").facts).toEqual({});
  });

  it("keeps every question sentence the owner asks", () => {
    expect(classifyByKeywords("Who are you? How did you get my email? Thanks.").question).toBe("Who are you? How did you get my email?");
  });
});

describe("classifyReply offline", () => {
  const ctx = { prospect: makeProspect(), config: testConfig() };

  it("uses the rules, then the keyword fallback, without any network", async () => {
    await offline(async () => {
      expect(await classifyReply(inbound({ text: "remove me" }), ctx)).toMatchObject({ class: "unsubscribe", optOut: true, classifier: "rules" });
      expect(await classifyReply(inbound({ text: GMAIL_REPLY }), ctx)).toMatchObject({ class: "interested", classifier: "rules", notes: "keyword fallback" });
      expect(await classifyReply(inbound({ text: "What does it cost?" }), ctx)).toMatchObject({ class: "question", question: "What does it cost?" });
    });
  });

  it("reads an owner on vacation who says yes as interested, not as an auto-reply", async () => {
    await offline(async () => {
      expect(await classifyReply(inbound({ text: "I'm on vacation until Monday, but yes, I'm interested" }), ctx)).toMatchObject({ class: "interested", facts: { wants_readiness_check: "Y" } });
      expect(await classifyReply(inbound({ text: OOO_TEXT }), ctx)).toMatchObject({ class: "auto_reply" });
    });
  });
});

describe("wireToFacts", () => {
  const wire = (o: Partial<ReplyWire> = {}): ReplyWire => ({
    class: "interested",
    opt_out: false,
    complaint: false,
    question: null,
    revenue: null,
    revenue_band: null,
    sde: null,
    ebitda: null,
    employees: null,
    years_owned: null,
    owner_hours_per_week: null,
    recurring_revenue_pct: null,
    top_customer_pct: null,
    owns_real_estate: null,
    license_holder: null,
    timeline: null,
    motivation: null,
    motivation_detail: null,
    wants_readiness_check: null,
    books_match_returns: null,
    revenue_trend: null,
    manager_in_place: null,
    runs_without_owner: null,
    lease_years_left: null,
    notes: "",
    ...o,
  });

  it("drops nulls, so an all-null answer states no facts", () => {
    expect(wireToFacts(wire(), "Yes.")).toEqual({});
  });

  it("keeps stated facts and trims strings", () => {
    expect(wireToFacts(wire({ revenue: 1_200_000, employees: 12, timeline: "6-12m", motivation: "retirement", motivation_detail: "  want to retire  ", owns_real_estate: "N" }), "About $1.2M, 12 people")).toEqual({
      revenue: 1_200_000,
      employees: 12,
      timeline: "6-12m",
      motivation: "retirement",
      motivation_detail: "want to retire",
      owns_real_estate: "N",
    });
  });

  it("drops impossible numbers and numbers from a reply with no number in it", () => {
    expect(wireToFacts(wire({ recurring_revenue_pct: 140, owner_hours_per_week: 200, revenue: -5 }), "lots of 9s")).toEqual({});
    expect(wireToFacts(wire({ revenue: 1_000_000, employees: 10 }), "Yes, interested.")).toEqual({});
    expect(wireToFacts(wire({ employees: 12 }), "twelve people")).toEqual({ employees: 12 });
  });

  it("keeps the readiness checklist facts the owner states, and drops a lease length with no number in the reply", () => {
    const stated = wire({ books_match_returns: "Y", revenue_trend: "growing", manager_in_place: "Y", runs_without_owner: "N", lease_years_left: 7 });
    expect(wireToFacts(stated, "Books match, growing, my manager runs it, 7 years left on the lease")).toEqual({
      books_match_returns: "Y",
      revenue_trend: "growing",
      manager_in_place: "Y",
      runs_without_owner: "N",
      lease_years_left: 7,
    });
    expect(wireToFacts(wire({ lease_years_left: 7 }), "We lease the shop.")).toEqual({});
  });

  it("never records unknown as a timeline or motivation", () => {
    expect(wireToFacts(wire({ timeline: "unknown", motivation: "unknown" }), "x")).toEqual({});
  });
});
