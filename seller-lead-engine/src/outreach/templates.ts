import fs from "node:fs";
import path from "node:path";
import type { EngineConfig, Mailbox } from "../config.ts";
import { ProspectRowSchema, type ProspectRow } from "../domain/schema.ts";
import { lintBody, lintSubject } from "../compliance/lint.ts";
import { yearsSince } from "../util/dates.ts";

// The three cold-email steps, as markdown files a person can edit
// (templates/sequence/step-1.md to step-3.md): a "subject: ..." first line,
// a blank line, then the body with {tokens}. Rendering fills every token
// from the prospect's records and the sending mailbox, and nothing else, so
// an email can only state facts the engine holds (DESIGN.md principle 5: no
// invented facts, and never the owner's age, health, family or succession).
//
// A token with no value either takes a neutral fallback ("Hi there,") or
// throws: a half-rendered email is never sent. The body returned here
// excludes the footer and the advertisement notice; src/sending/run.ts adds
// them from src/compliance/footer.ts so the wording is the one the lint and
// the gate look for.
//
// Names from state filings arrive in capitals ("SMITH HEATING & AIR INC"),
// so they are shown in title case with the entity suffix dropped. The
// subject lint refuses all-caps words (docs/research/compliance.md section
// 2: misleading or shouty subjects), and "Smith Heating & Air" is how an
// owner writes their own name.

/** A rendered step: subject and body (footer not included). */
export interface Rendered {
  subject: string;
  body: string;
}

/** Every token a template may use. */
export const TEMPLATE_TOKENS: readonly string[] = [
  "first_name",
  "business_name",
  "short_business_name",
  "city",
  "vertical_noun",
  "since_year",
  "years",
  "license_phrase",
  "sender_first_name",
  "sender_name",
  "firm_name",
  "firm_short_name",
];

const STEPS = [1, 2, 3] as const;
type Step = (typeof STEPS)[number];

/** Parse one template file: "subject: ..." on the first line, a blank line, then the body. */
export function parseTemplate(text: string, label: string): { subject: string; body: string } {
  const lines = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const m = /^subject:\s*(.*)$/i.exec(lines[0] ?? "");
  if (!m || !m[1]!.trim()) throw new Error(`${label}: the first line must be "subject: <subject line>"`);
  if ((lines[1] ?? "").trim() !== "") throw new Error(`${label}: the subject line must be followed by a blank line`);
  const body = lines.slice(2).join("\n").trim();
  if (!body) throw new Error(`${label}: the body is empty`);
  return { subject: m[1]!.trim(), body };
}

/** Read step-1.md, step-2.md and step-3.md from a folder. Throws naming the file on any format error. */
export function loadTemplates(dir: string): Record<1 | 2 | 3, { subject: string; body: string }> {
  const out = {} as Record<Step, { subject: string; body: string }>;
  for (const step of STEPS) {
    const file = path.join(dir, `step-${step}.md`);
    if (!fs.existsSync(file)) throw new Error(`Template not found: ${file}`);
    out[step] = parseTemplate(fs.readFileSync(file, "utf8"), path.basename(file));
  }
  return out;
}

// ---------------------------------------------------------------- display helpers

/** Entity suffixes dropped from a business name in copy (the legal name stays in the records). */
const ENTITY_SUFFIX = /[\s,]+(inc|incorporated|llc|l\.l\.c|lc|corp|corporation|co|ltd|limited|llp|pllc|p\.l\.l\.c|pa|p\.a|pc|p\.c)\.?$/i;
/** Words kept lower case inside a title-cased name. */
const SMALL_WORDS = new Set(["of", "and", "the", "in", "at", "on", "for", "by", "a", "an", "to"]);
/** Upper-case words kept as written: trade acronyms and common initialisms. */
const KEEP_CAPS = new Set(["HVAC", "AC", "A/C", "USA", "US", "ABC", "AAA", "DDS", "DMD", "CPA", "MD", "TV", "LP", "II", "III", "IV"]);

function titleWord(word: string, first: boolean): string {
  if (KEEP_CAPS.has(word)) return word;
  const lower = word.toLowerCase();
  if (!first && SMALL_WORDS.has(lower)) return lower;
  // Short tokens with no vowel are initials ("JRS", "TNT"); digits mark a model or unit ("A1").
  if (/\d/.test(word) || (word.length <= 3 && !/[AEIOUY]/.test(word))) return word;
  return lower.replace(/(^|[-'/.&(])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase()).replace(/'S\b/g, "'s");
}

/** Title-case a name that arrived in capitals; leave mixed-case names as the owner wrote them. */
export function displayCase(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(s)) return s;
  return s
    .split(" ")
    .map((w, i) => titleWord(w, i === 0))
    .join(" ");
}

/** The name an owner would use for their business: DBA when there is one, title case, entity suffix and a leading "The" dropped. */
export function shortBusinessName(p: Pick<ProspectRow, "business_name" | "dba_name">): string {
  let s = (p.dba_name.trim() || p.business_name).replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) s = s.replace(ENTITY_SUFFIX, "").replace(/[\s,&]+$/, "").replace(/\s+(and)$/i, "");
  s = s.replace(/^the\s+/i, "");
  return displayCase(s || p.business_name);
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "FL" -> "Florida"; an unknown code comes back as written. */
export function stateName(code: string): string {
  return STATE_NAMES[code.trim().toUpperCase()] ?? code.trim();
}

/**
 * The record-based fact step 1 names, as a predicate after the business
 * name. Worded as what the record literally says ("holds a Florida license
 * first issued in 1994"), because a licence can belong to the qualifier
 * rather than the company, and the email must stay true either way.
 */
function sinceFact(p: ProspectRow): { year?: number; date?: string; phrase?: string } {
  const state = stateName(p.state);
  if (p.license_issue_date) {
    const year = Number(p.license_issue_date.slice(0, 4));
    return { year, date: p.license_issue_date, phrase: `holds a ${state} license first issued in ${year}` };
  }
  if (p.formation_date) {
    const year = Number(p.formation_date.slice(0, 4));
    return { year, date: p.formation_date, phrase: `was registered in ${state} in ${year}` };
  }
  return {};
}

/** Token values and fallbacks for one prospect and mailbox. A token missing from both makes rendering throw. */
export function tokenValues(p: ProspectRow, config: EngineConfig, mailbox: Mailbox, today: string): { values: Record<string, string | undefined>; fallbacks: Record<string, string | undefined> } {
  const since = sinceFact(p);
  const city = displayCase(p.city);
  const metroName = config.metros[p.metro]?.name;
  const years = since.date ? yearsSince(since.date, today) : undefined;
  const values: Record<string, string | undefined> = {
    first_name: displayCase(p.owner_first_name) || undefined,
    business_name: displayCase(p.dba_name.trim() || p.business_name) || undefined,
    short_business_name: shortBusinessName(p) || undefined,
    city: city || undefined,
    vertical_noun: config.verticals[p.vertical]?.noun,
    since_year: since.year ? String(since.year) : undefined,
    years: years !== undefined && years >= 0 ? String(years) : undefined,
    license_phrase: since.phrase,
    sender_first_name: mailbox.sender_name.trim().split(/\s+/)[0] || undefined,
    sender_name: mailbox.sender_name.trim() || undefined,
    firm_name: config.firm.name.trim() || undefined,
    firm_short_name: config.firm.short_name.trim() || undefined,
  };
  const fallbackCity = values.city ?? metroName;
  const fallbacks: Record<string, string | undefined> = {
    // A neutral greeting when no owner name is on record; never a guessed name.
    first_name: "there",
    city: metroName,
    vertical_noun: "business",
    // Without a licence or filing date, the city is the one record fact left.
    license_phrase: fallbackCity ? `is based in ${fallbackCity}` : undefined,
  };
  return { values, fallbacks };
}

/** Replace every {token}; throws listing tokens that are unknown or have no value and no fallback. */
export function fillTokens(text: string, values: Record<string, string | undefined>, fallbacks: Record<string, string | undefined>, label: string): string {
  const unknown = new Set<string>();
  const missing = new Set<string>();
  const out = text.replace(/\{([a-z_]+)\}/g, (_m, token: string) => {
    if (!TEMPLATE_TOKENS.includes(token)) {
      unknown.add(token);
      return "";
    }
    const v = values[token]?.trim() || fallbacks[token]?.trim();
    if (!v) {
      missing.add(token);
      return "";
    }
    return v;
  });
  const problems: string[] = [];
  if (unknown.size) problems.push(`unknown token ${[...unknown].map((t) => `{${t}}`).join(", ")}`);
  if (missing.size) problems.push(`no value for ${[...missing].map((t) => `{${t}}`).join(", ")}`);
  if (problems.length) throw new Error(`${label}: ${problems.join("; ")}`);
  return out;
}

/** Render one step for a prospect from a mailbox. Throws when a token has no value and no fallback. The body excludes the footer. */
export function renderStep(step: 1 | 2 | 3, p: ProspectRow, config: EngineConfig, mailbox: Mailbox, opts: { templatesDir: string; today: string }): Rendered {
  const templates = loadTemplates(opts.templatesDir);
  const tpl = templates[step];
  const { values, fallbacks } = tokenValues(p, config, mailbox, opts.today);
  const label = `step-${step}.md for ${p.prospect_id}`;
  // Check subject and body together first, so the error names every missing token at once.
  fillTokens(`${tpl.subject}\n${tpl.body}`, values, fallbacks, label);
  const subjectOf = (text: string, v: Record<string, string | undefined>) => fillTokens(text, v, fallbacks, label).replace(/\s+/g, " ").trim();
  // A long business name would push the subject past the 60-character lint
  // limit, which would block the prospect. Decide once from step 1 (with the
  // "Re: " the follow-ups add) so all three steps keep one thread subject.
  const longName = `Re: ${subjectOf(templates[1].subject, values)}`.length > SUBJECT_MAX;
  const subjectValues = longName ? { ...values, short_business_name: "your business", business_name: "your business" } : values;
  return {
    subject: subjectOf(tpl.subject, subjectValues),
    body: fillTokens(tpl.body, values, fallbacks, label).replace(/[ \t]+\n/g, "\n").trim(),
  };
}

/** The subject lint's maximum length (src/compliance/lint.ts lintSubject). */
const SUBJECT_MAX = 60;

// ---------------------------------------------------------------- template lint

const SAMPLE_TODAY = "2026-10-20";

/** A sample prospect for linting: a capitalised Sunbiz-style name, both dates on record. */
export function sampleProspect(config: EngineConfig, overrides: Partial<ProspectRow> = {}): ProspectRow {
  const base: Record<string, string> = Object.fromEntries(Object.keys(ProspectRowSchema.shape).map((k) => [k, ""]));
  const vertical = Object.keys(config.verticals)[0] ?? "";
  const metroKey = Object.keys(config.metros)[0] ?? "";
  const metro = config.metros[metroKey];
  const row = ProspectRowSchema.parse({
    ...base,
    prospect_id: "P-00000",
    status: "scored",
    business_name: "SAMPLE HEATING AND AIR OF TAMPA INC",
    vertical,
    city: "TAMPA",
    state: metro?.state ?? config.licensed_states[0] ?? "FL",
    zip: "33602",
    metro: metroKey,
    formation_date: "1996-03-01",
    license_issue_date: "1994-06-15",
    owner_name: "John Sample",
    owner_first_name: "JOHN",
    owner_last_name: "SAMPLE",
    email: "john@sampleair.example",
    email_verification: "valid",
    tier: "A",
  });
  return { ...row, ...overrides };
}

/**
 * Render every step against sample prospects (one with every record fact,
 * one with none, so the fallbacks are linted too) and run lintSubject and
 * lintBody. Also checks that follow-up subjects match step 1 with "Re: ", so
 * Gmail keeps the steps in one thread. Returns plain-English issues.
 */
export function lintTemplates(dir: string, config: EngineConfig, opts: { today?: string } = {}): string[] {
  const out: string[] = [];
  let templates: ReturnType<typeof loadTemplates>;
  try {
    templates = loadTemplates(dir);
  } catch (err) {
    return [(err as Error).message];
  }
  const mailbox: Mailbox = config.mailboxes[0] ?? { email: "sample@example.com", sender_name: "Sample Sender", sender_title: "", warmup_started: "2026-01-01", paused: false };
  const full = sampleProspect(config);
  const bare = sampleProspect(config, { owner_first_name: "", license_issue_date: "", formation_date: "", dba_name: "" });
  for (const step of STEPS) {
    for (const [label, p] of [["full record", full], ["sparse record", bare]] as const) {
      let r: Rendered;
      try {
        r = renderStep(step, p, config, mailbox, { templatesDir: dir, today: opts.today ?? SAMPLE_TODAY });
      } catch (err) {
        out.push(`step ${step} (${label}): ${(err as Error).message}`);
        continue;
      }
      const allow = [p.business_name, shortBusinessName(p), displayCase(p.city), p.owner_name];
      for (const issue of lintSubject(r.subject, { step })) out.push(`step ${step} subject (${label}): ${issue}`);
      for (const issue of lintBody(r.body, { step, kind: "outreach", allow })) out.push(`step ${step} body (${label}): ${issue}`);
    }
  }
  const first = templates[1].subject;
  for (const step of [2, 3] as const) {
    const s = templates[step].subject;
    if (s !== first && s !== `Re: ${first}`) out.push(`step ${step} subject "${s}" should be "Re: ${first}" so the follow-up stays in the step 1 thread`);
  }
  return [...new Set(out)];
}
