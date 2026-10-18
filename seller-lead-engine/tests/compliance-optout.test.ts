import { describe, expect, it } from "vitest";
import { detectComplaint, detectOptOut } from "../src/compliance/optout.ts";

describe("detectOptOut", () => {
  it("catches every common way of asking to stop", () => {
    for (const text of [
      "Unsubscribe",
      "please UNSUBSCRIBE me",
      "un-subscribe",
      "Remove me from your list.",
      "Please remove my email address",
      "Take me off your list",
      "take my name off",
      "Stop emailing me.",
      "stop sending these",
      "Do not contact me again.",
      "Don’t email me",
      "dont contact us",
      "I want to opt out",
      "Opt-out",
      "No more emails please",
      "STOP",
      "Stop.",
      "please stop",
      "Leave me alone",
      "Not interested, stop",
      "Delete my email address from your system",
      "Cease all contact",
      "Get me off your mailing list",
    ]) {
      expect(detectOptOut(text), text).toBe(true);
    }
  });

  it("does not treat ordinary replies as opt-outs", () => {
    for (const text of [
      "Not interested.",
      "Yes, I would like the check.",
      "What does the checklist cover?",
      "We might sell in two years. Can we talk in the spring?",
      "Who is this?",
      "Stop by the shop any time Tuesday.",
      "",
    ]) {
      expect(detectOptOut(text), text).toBe(false);
    }
  });
});

describe("detectComplaint", () => {
  it("catches spam reports, harassment, legal threats and regulators", () => {
    for (const text of [
      "This is spam.",
      "Stop spamming me",
      "I reported you to Google",
      "I will report this",
      "This is harassment",
      "Consider this a cease and desist",
      "I am contacting the attorney general",
      "My lawyer will hear about this",
      "Expect legal action",
      "I've filed a complaint with the FTC",
    ]) {
      expect(detectComplaint(text), text).toBe(true);
    }
  });

  it("does not flag a polite decline or a question", () => {
    for (const text of ["No thanks.", "Not interested at the moment.", "How did you get my address?", "We reported record revenue last year", ""]) {
      expect(detectComplaint(text), text).toBe(false);
    }
  });
});
