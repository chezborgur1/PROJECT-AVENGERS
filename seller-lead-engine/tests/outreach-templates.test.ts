import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintBody, lintSubject, SENSITIVE_PATTERNS, wordCount } from "../src/compliance/lint.ts";
import { displayCase, lintTemplates, loadTemplates, parseTemplate, renderStep, sampleProspect, shortBusinessName, TEMPLATE_TOKENS } from "../src/outreach/templates.ts";
import { makeProspect, REPO, testConfig, tmpDir } from "./helpers.ts";

const TEMPLATES_DIR = path.join(REPO, "templates/sequence");

const TEMPLATES = path.join(REPO, "templates/sequence");
const TODAY = "2026-10-20";

/** A template folder with the shipped steps, then the given files overwritten. */
function templateDir(files: Partial<Record<1 | 2 | 3, string>>): string {
  const dir = tmpDir("templates-");
  for (const step of [1, 2, 3] as const) {
    fs.writeFileSync(path.join(dir, `step-${step}.md`), files[step] ?? fs.readFileSync(path.join(TEMPLATES, `step-${step}.md`), "utf8"));
  }
  return dir;
}

describe("loading templates", () => {
  it("reads the three shipped steps with a subject and a body", () => {
    const t = loadTemplates(TEMPLATES);
    expect(t[1].subject).toBe("Exit-readiness check for {short_business_name}");
    expect(t[2].subject).toBe("Re: Exit-readiness check for {short_business_name}");
    expect(t[3].subject).toBe(t[2].subject);
    for (const step of [1, 2, 3] as const) expect(t[step].body.startsWith("Hi {first_name},")).toBe(true);
  });

  it("uses only known tokens in the shipped copy", () => {
    const t = loadTemplates(TEMPLATES);
    const used = [1, 2, 3].flatMap((s) => `${t[s as 1].subject}\n${t[s as 1].body}`.match(/\{([a-z_]+)\}/g) ?? []).map((m) => m.slice(1, -1));
    for (const token of used) expect(TEMPLATE_TOKENS).toContain(token);
  });

  it("rejects a file without a subject line or without the blank line after it", () => {
    expect(() => parseTemplate("Hello {first_name}", "x.md")).toThrow(/first line must be "subject:/);
    expect(() => parseTemplate("subject: Hi\nBody right away", "x.md")).toThrow(/blank line/);
    expect(() => parseTemplate("subject: Hi\n\n   ", "x.md")).toThrow(/body is empty/);
    expect(parseTemplate("﻿subject: Hi there\r\n\r\nBody\r\n", "x.md")).toEqual({ subject: "Hi there", body: "Body" });
  });

  it("names the missing file", () => {
    const dir = tmpDir();
    expect(() => loadTemplates(dir)).toThrow(/step-1\.md/);
  });
});

describe("names in copy", () => {
  it("title-cases names that arrive in capitals and drops the entity suffix", () => {
    expect(shortBusinessName({ business_name: "SMITH HEATING & AIR CONDITIONING, INC.", dba_name: "" })).toBe("Smith Heating & Air Conditioning");
    expect(shortBusinessName({ business_name: "THE O'NEIL PLUMBING CO", dba_name: "" })).toBe("O'Neil Plumbing");
    expect(shortBusinessName({ business_name: "JRS HVAC SERVICES LLC", dba_name: "" })).toBe("JRS HVAC Services");
    expect(shortBusinessName({ business_name: "BOB'S AIR OF TAMPA BAY, P.A.", dba_name: "" })).toBe("Bob's Air of Tampa Bay");
    expect(shortBusinessName({ business_name: "Example Holdings LLC", dba_name: "CoolAir Tampa" })).toBe("CoolAir Tampa");
  });

  it("keeps a mixed-case name as the owner wrote it", () => {
    expect(displayCase("  McKenzie   AirPro ")).toBe("McKenzie AirPro");
    expect(displayCase("TRI-COUNTY A/C")).toBe("Tri-County A/C");
  });
});

describe("rendering a step", () => {
  const config = testConfig();
  const mailbox = config.mailboxes[0]!;

  it("fills step 1 from the record: owner first name, business, licence year, city and vertical", () => {
    const p = makeProspect({ business_name: "EXAMPLE AIR INC", owner_first_name: "JOHN", city: "CLEARWATER" });
    const r = renderStep(1, p, config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
    expect(r.subject).toBe("Exit-readiness check for Example Air");
    expect(r.body).toMatch(/^Hi John,/);
    expect(r.body).toContain("I am Frank Example with AMB Advisory Services.");
    expect(r.body).toContain("Public records show that Example Air holds a Florida license first issued in 1994.");
    expect(r.body).toContain("owners in Clearwater");
    expect(r.body).toContain("your HVAC company");
    expect(r.body).not.toMatch(/\{[a-z_]+\}/);
  });

  it("leaves the footer out of the body", () => {
    const r = renderStep(1, makeProspect(), config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
    expect(r.body).not.toMatch(/unsubscribe|AMB Advisory Services LLC|marketing email/i);
  });

  it("uses the filing year when there is no licence date, and the city when there is neither", () => {
    const formed = renderStep(1, makeProspect({ license_issue_date: "" }), config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
    expect(formed.body).toContain("was registered in Florida in 1996.");
    const bare = renderStep(1, makeProspect({ license_issue_date: "", formation_date: "", owner_first_name: "" }), config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
    expect(bare.body).toMatch(/^Hi there,/);
    expect(bare.body).toContain("is based in Tampa.");
  });

  it("falls back to the metro name when the city is blank", () => {
    const r = renderStep(1, makeProspect({ city: "" }), config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
    expect(r.body).toContain("owners in Tampa Bay");
  });

  it("throws when a token has no value and no fallback", () => {
    const dir = templateDir({ 1: "subject: Since {since_year}\n\nHi {first_name}, {years} years." });
    const p = makeProspect({ license_issue_date: "", formation_date: "" });
    expect(() => renderStep(1, p, config, mailbox, { templatesDir: dir, today: TODAY })).toThrow(/no value for \{since_year\}, \{years\}/);
    const ok = renderStep(1, makeProspect(), config, mailbox, { templatesDir: dir, today: TODAY });
    expect(ok).toEqual({ subject: "Since 1994", body: "Hi John, 32 years." });
  });

  it("throws on a token the engine does not know, so no fact can be invented", () => {
    const dir = templateDir({ 2: "subject: Re: Hi\n\nHi {first_name}, I see you are {owner_age}." });
    expect(() => renderStep(2, makeProspect(), config, mailbox, { templatesDir: dir, today: TODAY })).toThrow(/unknown token \{owner_age\}/);
  });

  it("keeps the business name out of the subject when it would pass 60 characters, the same way on every step", () => {
    const p = makeProspect({ business_name: "SUNSHINE STATE AIR CONDITIONING AND HEATING SPECIALISTS INC" });
    const subjects = ([1, 2, 3] as const).map((s) => renderStep(s, p, config, mailbox, { templatesDir: TEMPLATES, today: TODAY }).subject);
    expect(subjects).toEqual(["Exit-readiness check for your business", "Re: Exit-readiness check for your business", "Re: Exit-readiness check for your business"]);
    expect(renderStep(1, p, config, mailbox, { templatesDir: TEMPLATES, today: TODAY }).body).toContain("Sunshine State Air Conditioning and Heating Specialists");
  });
});

describe("the shipped copy", () => {
  const config = testConfig();
  const mailbox = config.mailboxes[0]!;
  const people = [
    makeProspect(),
    makeProspect({ owner_first_name: "", license_issue_date: "", formation_date: "" }),
    makeProspect({ business_name: "SMITH & SONS PLUMBING CORP", vertical: "plumbing", city: "ST. PETERSBURG" }),
    makeProspect({ dba_name: "Gulf Coast Comfort", vertical: "unknown_vertical" }),
  ];

  it("passes the template lint", () => {
    expect(lintTemplates(TEMPLATES, config)).toEqual([]);
  });

  it("passes the subject and body lint for every step and every kind of record", () => {
    for (const p of people) {
      for (const step of [1, 2, 3] as const) {
        const r = renderStep(step, p, config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
        expect(lintSubject(r.subject, { step })).toEqual([]);
        expect(lintBody(r.body, { step, kind: "outreach", allow: [p.business_name, p.dba_name, shortBusinessName(p), p.city] })).toEqual([]);
      }
    }
  });

  it("keeps step 1 under 110 words with no link and no question", () => {
    for (const p of people) {
      const r = renderStep(1, p, config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
      expect(wordCount(r.body)).toBeLessThanOrEqual(110);
      expect(r.body).not.toMatch(/https?:|www\.|\.com\b/);
      expect(r.body).not.toContain("?");
    }
  });

  it("never mentions or implies age, retirement, health, family or succession", () => {
    for (const step of [1, 2, 3] as const) {
      const r = renderStep(step, people[0]!, config, mailbox, { templatesDir: TEMPLATES, today: TODAY });
      for (const s of SENSITIVE_PATTERNS) expect(`${r.subject}\n${r.body}`).not.toMatch(s.re);
      expect(r.body).not.toMatch(/\b(slow down|next chapter|legacy|golden|years young)\b/i);
    }
  });

  it("offers the free check with the range and the checklist, asks for a one-word reply, and says step 3 is the last", () => {
    const [s1, s2, s3] = ([1, 2, 3] as const).map((s) => renderStep(s, people[0]!, config, mailbox, { templatesDir: TEMPLATES, today: TODAY }).body);
    expect(s1).toMatch(/free exit-readiness check/);
    expect(s1).toMatch(/rough value range/);
    expect(s1).toMatch(/checklist that buyers and SBA lenders/);
    expect(s1).toMatch(/not an appraisal/);
    expect(s1).toMatch(/reply "yes"/);
    expect(s2).toMatch(/four weeks without you/);
    expect(s3).toMatch(/I will not follow up again/);
    for (const b of [s1, s2, s3]) expect(b).not.toMatch(/!|\u2014/);
  });
});

describe("template lint", () => {
  const config = testConfig();

  it("reports banned words, sensitive topics, shouty subjects and broken threading", () => {
    const dir = templateDir({
      1: "subject: URGENT offer for {short_business_name}!\n\nHi {first_name}, thinking about retirement? We have a buyer waiting! Visit www.example.com",
      3: "subject: Last chance\n\nHi {first_name}, our seamless process is unique.",
    });
    const issues = lintTemplates(dir, config);
    expect(issues.some((i) => i.includes('all-caps word "URGENT"'))).toBe(true);
    expect(issues.some((i) => i.includes("retirement"))).toBe(true);
    expect(issues.some((i) => i.includes("link in step 1"))).toBe(true);
    expect(issues.some((i) => i.includes("question in step 1"))).toBe(true);
    expect(issues.some((i) => i.includes('banned phrase "seamless"'))).toBe(true);
    expect(issues.some((i) => i.includes('step 3 subject "Last chance" should be "Re: URGENT offer'))).toBe(true);
  });

  it("reports a token that cannot render instead of throwing", () => {
    const dir = templateDir({ 2: "subject: Re: Exit-readiness check for {short_business_name}\n\nHi {first_name}, since {since_year}." });
    expect(lintTemplates(dir, config)).toContainEqual(expect.stringMatching(/step 2 \(sparse record[^)]*\).*no value for \{since_year\}/));
  });

  it("reports a missing template folder", () => {
    expect(lintTemplates(path.join(tmpDir(), "nope"), config)[0]).toMatch(/Template not found/);
  });
});

describe("readiness item by vertical", () => {
  it("uses each vertical's own step 2 item, and the trades wording when a vertical has none", () => {
    const withItems = testConfig({
      verticals: {
        bookkeeping: { noun: "bookkeeping firm", keywords: ["bookkeeping"], license_codes: [], prior: 6, multiples_key: "accounting", key_person_items: "who does and reviews the monthly client work, who holds the client relationships, and who the clients call with questions" },
        hvac: { noun: "HVAC company", keywords: ["hvac"], license_codes: ["CAC"], prior: 7, multiples_key: "hvac" },
      },
    });
    const mailbox = withItems.mailboxes[0]!;
    const books = renderStep(2, sampleProspect(withItems, { vertical: "bookkeeping", business_name: "BAYSIDE BOOKKEEPING LLC" }), withItems, mailbox, { templatesDir: TEMPLATES_DIR, today: "2026-10-27" });
    expect(books.body).toContain("who the clients call with questions");
    expect(books.body).not.toContain("license");
    const trade = renderStep(2, sampleProspect(withItems, { vertical: "hvac" }), withItems, mailbox, { templatesDir: TEMPLATES_DIR, today: "2026-10-27" });
    expect(trade.body).toContain("who quotes the work, who holds the customer relationships, and whose name is on the license");
    expect(lintTemplates(TEMPLATES_DIR, withItems, { today: "2026-10-27" })).toEqual([]);
  });

  it("lints each vertical's wording like the rest of the copy", () => {
    const risky = testConfig({ verticals: { bookkeeping: { noun: "bookkeeping firm", keywords: ["bookkeeping"], prior: 6, multiples_key: "accounting", key_person_items: "who takes over when you retire" } } });
    expect(lintTemplates(TEMPLATES_DIR, risky, { today: "2026-10-27" })).toContainEqual(expect.stringMatching(/step 2 body \(full record bookkeeping\).*retirement/));
  });
});
