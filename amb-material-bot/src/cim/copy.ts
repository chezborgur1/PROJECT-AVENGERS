// The words Claude writes, one schema per page of the CIM (guide 3.3), and
// the lint that keeps them inside AMB's voice (guide 4.4). Figures in the
// copy are tokens from the numbers brief ("{{rev.FY2025}}"), resolved at
// build time, so a sentence and the exhibit beside it cannot disagree
// (guide 4.8). Anything the sources do not say becomes a "[Confirm: …]"
// marker, which the deck prints in red italic and lists in
// open-questions.md. Word budgets are sized to the boxes of
// design/FINAL_DESIGN_SPEC.md, so copy that passes the lint fits the page.

import { z } from "zod";
import type { FinancialDataset } from "../domain/financials.ts";
import type { Brief } from "./brief.ts";
import { mixedPopulations, unknownTokens } from "./brief.ts";
import { NAMED_FOOTNOTES, NAMED_MARKER } from "./context.ts";
import { titleWrap } from "./design.ts";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const Title = z
  .string()
  .describe(
    "Action title: one sentence, sentence case, no final stop, stating the page's finding with at least one figure token and its period. 60 to 110 characters once the tokens resolve (one line is about 85 characters), never over 130. Never a topic label.",
  )
  .optional();

/** An observation keyed to a row of the exhibit it sits beside; the deck assigns the letter from the row's position. */
const Observation = z.object({
  row: z.string().describe("Row key from the list given for this page's exhibits, or an empty string when the observation keys no single row"),
  lead: z.string().describe("Bold lead-in, 3 to 10 words, carrying a figure token"),
  body: z.string().describe("One or two sentences, at most 26 words, naming the mechanism (because, driven by, as a result) with a figure or a named thing"),
});
export type Observation = z.infer<typeof Observation>;

/**
 * Item counts live in the descriptions and the lint rather than as array
 * constraints: structured outputs do not enforce them (the SDK would only
 * reject the whole draft client-side), and a count one off is a lint note,
 * not a reason to throw the copy away.
 */
const COUNTS: { match: RegExp; min: number; max: number }[] = [];
const observations = (min: number, max: number, what: string, key?: string) => {
  if (key) COUNTS.push({ match: new RegExp(`^${key.replace(".", "\\.")}$`), min, max });
  return z.array(Observation).describe(`${min} to ${max} observations keyed to ${what}; counts follow the evidence, never padded`);
};

const Consideration = z.object({
  lead: z.string().describe("One bold sentence, at most 16 words, stating the claim with a figure token"),
  evidence: z.string().describe("One or two sentences of evidence and mechanism, at most 38 words"),
  page: z.string().describe("Section id of the page that proves it, from the list given (e.g. S6.1, S7.1, S4.1)"),
});

const BuyerConsideration = z.object({
  consideration: z.string().describe("Two or three words: Owner involvement, Customer concentration, Technician labor, Add-back quality, Lead generation, Seasonality"),
  shows: z.string().describe("What the data shows, quantified, at most 42 words"),
  addressed: z.string().describe("How it is addressed, quantified where the data allows, at most 42 words; never a promise the sources do not make"),
});

export const CimCopySchema = z.object({
  s1_1: z
    .object({
      title: Title,
      overview: z
        .string()
        .describe(
          "Company at a glance, 80 to 95 words (the box under the Quick Stats holds about 95), in fixed fact order: legal name with its defined short form, what it does, HQ and market served; founded; employees; customers and units; revenue mix; ownership; reason for sale; the owner's transition offer",
        ),
      observations: observations(2, 3, "the Quick Stats tables", "s1_1.observations"),
    })
    .optional(),
  s1_2: z.object({ title: Title, considerations: z.array(Consideration).describe("5 to 7 investment considerations, each a claim proved on a later page") }).optional(),
  s1_3: z.object({ title: Title, pnl: observations(2, 3, "the summary income statement", "s1_3.pnl"), ladder: observations(2, 3, "the condensed EBITDA ladder", "s1_3.ladder") }).optional(),
  s1_4: z
    .object({
      title: Title,
      rows: z
        .array(BuyerConsideration)
        .describe("Buyer considerations; Owner involvement, Customer concentration (when a customer list exists) and Add-back quality are required. The deck adds the Financial reporting row itself"),
      // The owner table when the notes fill half of it, else the adjustments by evidence table (verification F29).
      observations: observations(2, 5, "the owner responsibilities table, or the adjustments by evidence table when the notes leave the owner table mostly blank", "s1_4.observations"),
    })
    .optional(),
  s2_2: z.object({ title: Title, observations: observations(2, 4, "the revenue by service line table and the service-line table", "s2_2.observations") }).optional(),
  s2_3: z.object({ title: Title, observations: observations(2, 5, "the unit economics and capacity tables", "s2_3.observations") }).optional(),
  s2_4: z.object({ title: Title, observations: observations(2, 3, "the facilities and systems tables", "s2_4.observations") }).optional(),
  s3_1: z.object({ title: Title, observations: observations(2, 3, "the market and competitor tables", "s3_1.observations") }).optional(),
  s4_1: z.object({ title: Title, observations: observations(3, 4, "the top-10 list and the customer mix table", "s4_1.observations") }).optional(),
  s4_2: z
    .object({
      title: Title,
      observations: observations(3, 5, "the customer, revenue and cohort retention tables", "s4_2.observations"),
      takeaway: z
        .string()
        .optional()
        .describe("Callout body, 30 to 50 words: the listed accounts' share of revenue, so the retention figures read at their scope, and what the rest of revenue is and how it renews"),
    })
    .optional(),
  s5_1: z.object({ title: Title, observations: observations(2, 3, "the organization table", "s5_1.observations") }).optional(),
  s5_2: z.object({ title: Title, observations: observations(2, 3, "the headcount tables", "s5_2.observations") }).optional(),
  s6_1: z.object({ title: Title, observations: observations(4, 5, "the income statement", "s6_1.observations") }).optional(),
  s6_2: z.object({ title: Title, observations: observations(3, 4, "the revenue by line table", "s6_2.observations") }).optional(),
  s6_3: z.object({ title: Title, observations: observations(3, 4, "the cost structure table", "s6_3.observations") }).optional(),
  s6_4: z.object({ title: Title, observations: observations(2, 3, "the quarterly revenue table", "s6_4.observations") }).optional(),
  s7_1: z
    .object({
      title: Title,
      observations: observations(3, 3, "the EBITDA ladder", "s7_1.observations"),
      takeaway: z
        .string()
        .describe("Callout body, 35 to 55 words: who underwrites Adj. EBITDA and who SDE (Main Street), then what is not assumed (nothing pro forma; no change in pricing, headcount or programs after closing)"),
    })
    .optional(),
  s7_2: z.object({ title: Title, observations: observations(2, 3, "the owner compensation table", "s7_2.observations") }).optional(),
  s8_1: z.object({ title: Title, observations: observations(2, 3, "the balance sheet and working capital tables", "s8_1.observations") }).optional(),
  s9_1: z.object({ title: Title, observations: observations(2, 4, "the growth levers table", "s9_1.observations") }).optional(),
  s10_1: z
    .object({
      title: Title,
      transaction: z.string().describe("Fact-order transaction paragraph, 50 to 75 words: who is offering what, the basis of offers, and the target timing"),
      transition: z.string().describe("Owner transition and key employees, 45 to 70 words"),
      premises: z.string().describe("Premises, fleet and systems the buyer takes over, 40 to 65 words"),
      process: z.string().describe("How to proceed, 30 to 45 words, ending with the AMB Advisory contact instruction"),
    })
    .optional(),
  open_questions: z.array(z.string()).describe("Every fact the advisor must confirm with the Seller before this CIM goes out, one per item"),
});
export type CimCopy = z.infer<typeof CimCopySchema>;
COUNTS.push({ match: /^s1_2\.considerations$/, min: 5, max: 7 }, { match: /^s1_4\.rows$/, min: 3, max: 5 });
export type PageCopyKey = Exclude<keyof CimCopy, "open_questions">;

/** Page copy key for a section-library id: "S6.1" -> "s6_1". */
export const copyKey = (id: string): PageCopyKey => id.toLowerCase().replace(".", "_") as PageCopyKey;

// ---------------------------------------------------------------------------
// Lint (guide 4.4, 4.2 rule 10, 4.5, 2.10 T21)
// ---------------------------------------------------------------------------

/** Banned words and constructions, verbatim from guide 4.4 and the build brief, as case-insensitive patterns on word boundaries. */
export const BANNED_PHRASES: string[] = [
  "well-positioned",
  "well positioned",
  "poised",
  "strategically positioned",
  "robust",
  "best-in-class",
  "best in class",
  "world-class",
  "one of the leading",
  "premier",
  "well-established",
  "proven track record",
  "proven growth engine",
  "platform-sized",
  "scalable platform",
  "significant runway",
  "ample headroom",
  "high margin organization",
  "operational efficiencies",
  "strong leadership",
  "deep management team",
  "highly respected",
  "loyal customer base",
  "sticky customer base",
  "unlock value",
  "leverage synergies",
  "seamless",
  "cutting-edge",
  "state-of-the-art",
  "turnkey",
  "holistic",
  "comprehensive suite",
  "unique",
  "differentiated",
  "key differentiator",
  "moat",
  "impressively",
  "remarkably",
  "notably",
  "importantly",
  "highly achievable",
  "clear path",
  "in today's",
  "navigate",
  "delve",
  "tapestry",
  "testament to",
  "boasts",
  "stands out",
  "it is worth noting",
  "not only",
  "not just",
  "attractive",
  "compelling",
  "undervalued",
  "unparalleled",
  "dynamic",
];

/** Adjectives banned only when no figure sits in the same sentence. */
const BANNED_WITHOUT_NUMBER = ["strong", "solid", "healthy", "significant", "substantial", "meaningful", "leading", "diversified", "loyal", "sticky"];

/** Sentence openers that are filler. */
const BANNED_OPENERS = ["Furthermore", "Moreover", "Additionally"];

/** "leverage" is banned as a verb; "leverage ratio" or "financial leverage" is not. */
const LEVERAGE_VERB = /\bleverag(e|es|ed|ing)\b(?!\s+(ratio|ratios))/i;

/** Price opinions and valuation language never appear in the CIM (guide D5). */
const PRICE_TALK = /\b(asking price|valuation of|valued at|[0-9.]+x (ebitda|sde|revenue))\b/i;

export interface LintIssue {
  path: string;
  issue: string;
  text: string;
}

const HAS_FIGURE = /\d/;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Sentences, and clauses after a semicolon, that open on a figure
 * ("1,450 members produce…", "…; 9 of the top 10 have…"): AMB leads with a
 * word (guide 4.5; verification F41). A fiscal-year label (FY2025) is a word;
 * the text is checked as it prints, tokens resolved.
 */
export function figureLedClauses(text: string, continuation = false): string[] {
  const out: string[] = [];
  for (const [i, s] of sentences(text).entries()) {
    // An observation's body runs on from its bold lead ("The top 10 total $139.4K," + "72% of commercial revenue"): its first
    // words are mid-sentence.
    // A colon introducing a value ("Residential service: $1.96M") is a label, not a clause; a semicolon starts one.
    const parts = [...(continuation && i === 0 ? [] : [s]), ...s.split(/;\s+/).slice(1)];
    for (const p of parts) if (/^[($]*[\d\u2212\u2013-]*\d/.test(p.trim())) out.push(p.trim());
  }
  return out;
}

/** One name for one thing across the deck (QA round 3 F37): a variant, and the word the deck uses instead. */
const TERM_VARIANTS: { re: RegExp; use: string }[] = [
  { re: /\bopex\b/i, use: "operating expenses" },
  { re: /\bsales\b(?! (outstanding|tax))/i, use: "revenue" },
  // The field workforce is "field employees" in every exhibit (unit economics, definitions, compensation rows).
  { re: /\bfield (technicians?|team|staff|workers?|crew)\b/i, use: "field employees" },
  // A role is named as the payroll register names it ("service technicians", "install technicians"), never by a department
  // word the organization table does not use (verification F37).
  { re: /\b(field service|installation|install) (employees?|staff|workers?|crew|team)\b/i, use: "the payroll register's role name" },
];

/**
 * "Account" in the customer sense ("listed accounts", "the top 10 accounts",
 * "account churn"), never the ledger sense ("GL account", "accounts
 * receivable", "the Interest Income account").
 */
const CUSTOMER_SENSE_ACCOUNT =
  /\b(?:listed|commercial|residential|lost|new|continuing|departed|departing|active|largest|key|these|those|each|every|won|retained|existing|starting|ending|average|top \d+|\d+)[- ]accounts?\b(?! (?:receivable|payable|detail))|\baccounts? (?:lost|won|active|billed|rose|renew|churn|cohorts?|averaging|ranked)\b/i;

/**
 * A customer named by a noun other than the one the deck uses (QA round 3
 * F37): with "customer", an account or a client; with "client", a customer
 * or an account. Returns the offending words, or undefined.
 */
export function customerNounVariant(text: string, noun: string): string | undefined {
  const variants: [string, RegExp][] = [
    ["account", CUSTOMER_SENSE_ACCOUNT],
    ["client", /\bclients?\b/i],
    ["customer", /\bcustomers?\b/i],
  ];
  for (const [word, re] of variants) if (word !== noun && re.test(text)) return re.exec(text)![0];
  return undefined;
}

/**
 * A source's own words in the deck's customer noun: the intake's "introduce
 * commercial accounts" prints as "introduce commercial customers" when the
 * customer list says Customer. Only the customer sense changes.
 */
export function withCustomerNoun(text: string, noun: string): string {
  const many = /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  const swap = (w: string) => {
    const to = /s$/i.test(w) ? many : noun;
    return /^[A-Z]/.test(w) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  };
  let out = text;
  if (noun !== "account") out = out.replace(new RegExp(CUSTOMER_SENSE_ACCOUNT.source, "gi"), (m) => m.replace(/\baccounts?\b/i, swap));
  if (noun !== "client") out = out.replace(/\bclients?\b/gi, swap);
  return out;
}

/** Lint one string of client-facing prose (tokens already resolved). */
export function lintText(text: string, path: string): LintIssue[] {
  const out: LintIssue[] = [];
  const bare = text.replace(/\[Confirm:[^\]]*\]/g, "");
  if (/—/.test(text)) out.push({ path, issue: "em dash", text });
  if (/\s[–-]\s/.test(bare)) out.push({ path, issue: "dash used as punctuation", text });
  if (/!/.test(bare)) out.push({ path, issue: "exclamation mark", text });
  for (const b of BANNED_PHRASES) {
    const re = new RegExp(`(^|[^A-Za-z-])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z-])`, "i");
    if (re.test(bare)) out.push({ path, issue: `banned phrase "${b}"`, text });
  }
  if (LEVERAGE_VERB.test(bare)) out.push({ path, issue: 'banned phrase "leverage" as a verb', text });
  for (const t of TERM_VARIANTS) if (t.re.test(bare)) out.push({ path, issue: `"${t.re.exec(bare)![0]}": the deck says "${t.use}"`, text });
  if (PRICE_TALK.test(bare)) out.push({ path, issue: "valuation or price language (guide D5)", text });
  // "a 18.5% margin" reads "a eighteen": figures spoken with a vowel sound take "an" (guide 4.2).
  if (/\ba \$?(8|1[18](?!\d))/.test(bare)) out.push({ path, issue: 'use "an" before a figure read with a vowel sound (8, 11, 18)', text });
  for (const clause of figureLedClauses(bare, /\.body$/.test(path))) out.push({ path, issue: "a sentence or clause led by a figure: lead with a word (guide 4.5)", text: clause });
  for (const s of sentences(bare)) {
    for (const o of BANNED_OPENERS) if (s.startsWith(`${o},`) || s.startsWith(`${o} `)) out.push({ path, issue: `filler opener "${o}"`, text: s });
    if (!HAS_FIGURE.test(s)) {
      for (const b of BANNED_WITHOUT_NUMBER) {
        if (new RegExp(`\\b${b}\\b`, "i").test(s)) out.push({ path, issue: `"${b}" without a number in the sentence`, text: s });
      }
    }
    if (/\b(we|our|us)\b/i.test(s) && !path.startsWith("s10_")) out.push({ path, issue: "first person outside the transaction section", text: s });
    if (/\?\s*$/.test(s)) out.push({ path, issue: "rhetorical question", text: s });
  }
  return out;
}

/** The last line of a title when it is a widow (spec 6.1): one or two short words alone on the line, as the title box wraps it. */
export function titleWidow(title: string): string | undefined {
  const lines = titleWrap(title);
  const last = lines[lines.length - 1]!;
  return lines.length > 1 && last.split(/\s+/).length < 3 && last.length < 20 ? last : undefined;
}

/** Title rules (guide 4.5, spec 6.1): a finding with a figure, at most 130 characters, sentence case, no final stop. */
export function lintTitle(title: string, path: string): LintIssue[] {
  const out: LintIssue[] = [];
  // Fit the title to one line or give its second line some weight.
  const widow = titleWidow(title);
  if (widow) out.push({ path, issue: `title leaves "${widow}" alone on its last line (widow)`, text: title });
  if (title.length > 110) out.push({ path, issue: `title is ${title.length} characters (target 60 to 110)`, text: title });
  if (!HAS_FIGURE.test(title)) out.push({ path, issue: "title carries no figure (a label, not a finding)", text: title });
  // A dollar or percentage figure names its period (spec 6.1): a fiscal year, LTM or YTD, a month, a year, or a span of years.
  if (/[$%]/.test(title) && !/\bFY\d{2,4}\b|\b(LTM|YTD|PF)\b|\b(19|20)\d{2}\b|\b[A-Z][a-z]{2}-\d{2}\b|\b(two|three|four|five) years\b/.test(title)) out.push({ path, issue: "title gives no period for its figures", text: title });
  if (title.length > 130) out.push({ path, issue: `title is ${title.length} characters (cap 130)`, text: title });
  if (title.length < 40) out.push({ path, issue: `title is ${title.length} characters (60 to 110 expected)`, text: title });
  if (/[.:;]\s*$/.test(title)) out.push({ path, issue: "title ends with punctuation", text: title });
  const words = title.split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w));
  if (words.length >= 4 && words.filter((w) => /^[A-Z]/.test(w)).length / words.length > 0.6) out.push({ path, issue: "title in Title Case", text: title });
  return [...out, ...lintText(title, path).filter((i) => i.issue !== "first person outside the transaction section")];
}

const wordsIn = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Word budgets per field, matched to the boxes they fill. */
const BUDGETS: { match: RegExp; max: number }[] = [
  { match: /\.(observations|pnl|ladder)\[\d+\]\.lead$/, max: 12 },
  { match: /\.(observations|pnl|ladder)\[\d+\]\.body$/, max: 30 },
  { match: /^s1_1\.overview$/, max: 110 },
  { match: /\.considerations\[\d+\]\.lead$/, max: 18 },
  { match: /\.considerations\[\d+\]\.evidence$/, max: 42 },
  { match: /^s1_4\.rows\[\d+\]\.(shows|addressed)$/, max: 46 },
  { match: /^s7_1\.takeaway$/, max: 60 },
  { match: /^s4_2\.takeaway$/, max: 50 },
  { match: /^s10_1\.(transaction|transition|premises)$/, max: 80 },
  { match: /^s10_1\.process$/, max: 50 },
];

/** Words too common to identify a claim. */
const CLAIM_STOP = new Set(["with", "from", "that", "this", "each", "their", "they", "have", "will", "been", "into", "than", "which", "whose", "about", "after", "before"]);

/** The stems (first four letters of each word of four letters or more) that identify what a placeholder asks about. */
const claimStems = (text: string): string[] => [...new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !CLAIM_STOP.has(w)).map((w) => w.slice(0, 4)))];

/**
 * A claim the copy leaves open as "[Confirm: …]" in one place must not be
 * stated as fact in another (rule 5): a sentence outside any placeholder
 * that carries every identifying word of an open placeholder (by stem, two
 * words at least) asserts what the deck says is unconfirmed.
 */
export function lintOpenClaims(strings: { path: string; text: string }[]): LintIssue[] {
  const open = strings.flatMap((s) => [...s.text.matchAll(/\[Confirm:([^\]]*)\]/g)].map((m) => ({ path: s.path, claim: m[1]!.trim(), stems: claimStems(m[1]!) })).filter((c) => c.stems.length >= 2));
  const out: LintIssue[] = [];
  for (const s of strings) {
    for (const sentence of sentences(s.text)) {
      // A sentence that carries the placeholder itself is the open claim, not an assertion of it.
      const own = [...sentence.matchAll(/\[Confirm:([^\]]*)\]/g)].map((m) => claimStems(m[1]!));
      const stems = new Set(claimStems(sentence.replace(/\[Confirm:[^\]]*\]/g, "")));
      const hit = open.find((c) => c.stems.every((st) => stems.has(st)) && !own.some((o) => c.stems.every((st) => o.includes(st))));
      if (hit) out.push({ path: s.path, issue: `states as fact what ${hit.path} leaves open ([Confirm: ${hit.claim}])`, text: sentence });
    }
  }
  return out;
}

/** Money and percentage literals, for the check that every figure came from the brief. */
const FIGURE_LITERAL = /[–-]?\$[0-9][0-9,]*(\.[0-9]+)?[KM]?|[0-9]+(\.[0-9]+)?%/g;

/**
 * Walk every string of the copy (except the advisor's open questions),
 * resolve its figure tokens against the brief, and lint it. With a brief,
 * unknown tokens are issues, and so is any money or percentage typed as a
 * literal that matches no brief figure: a figure the engine and the sources
 * did not produce is an invented one.
 */
export function lintCopy(copy: CimCopy, brief?: Brief): LintIssue[] {
  const issues: LintIssue[] = [];
  const known = brief?.texts();
  const prose: { path: string; text: string }[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (path.endsWith(".row") || path.endsWith(".page")) return;
      if (brief) for (const k of unknownTokens(v, brief)) issues.push({ path, issue: `unknown figure token {{${k}}}`, text: v });
      if (brief) for (const m of mixedPopulations(v, brief)) issues.push({ path, issue: `one clause pairs figures of different populations (${m.populations.join(" vs ")}): ${m.keys.map((k) => `{{${k}}}`).join(", ")}`, text: v });
      for (const m of v.matchAll(/\(\d\)/g)) issues.push({ path, issue: `footnote marker "${m[0]}" typed as a number: write {{fn.mgmt}} for a management fact, and the page numbers it`, text: v });
      for (const m of v.matchAll(NAMED_MARKER)) if (!NAMED_FOOTNOTES[m[1]!]) issues.push({ path, issue: `unknown footnote marker ${m[0]} (known: ${Object.keys(NAMED_FOOTNOTES).map((n) => `{{fn.${n}}}`).join(", ")})`, text: v });
      const text = (brief ? brief.resolve(v) : v).replace(/\{\{page:[^}]+\}\}/g, "page 00").replace(NAMED_MARKER, "(1)");
      prose.push({ path, text });
      issues.push(...(path.endsWith(".title") ? lintTitle(text, path) : lintText(text, path)));
      const variant = brief ? customerNounVariant(text, brief.customerNoun) : undefined;
      if (variant) issues.push({ path, issue: `"${variant}": the deck calls customers "${brief!.customerNoun}"`, text });
      const budget = BUDGETS.find((b) => b.match.test(path));
      if (budget && wordsIn(text) > budget.max) issues.push({ path, issue: `${wordsIn(text)} words (budget ${budget.max})`, text });
      if (known) {
        // Only literals typed into the raw copy are checked; resolved tokens came from the brief by construction.
        for (const m of v.replace(/\{\{[^}]+\}\}/g, " ").matchAll(FIGURE_LITERAL)) {
          const lit = m[0].replace(/^-/, "–");
          if (!known.has(lit) && !known.has(lit.replace(/^–/, ""))) issues.push({ path, issue: `figure "${m[0]}" typed as a literal and not in the numbers brief`, text: v });
        }
      }
    } else if (Array.isArray(v)) {
      const count = COUNTS.find((c) => c.match.test(path));
      if (count && (v.length < count.min || v.length > count.max)) issues.push({ path, issue: `${v.length} items (expected ${count.min} to ${count.max})`, text: "" });
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk({ ...copy, open_questions: [] }, "");
  return [...issues, ...lintOpenClaims(prose)];
}

/**
 * Names the CIM must never print (guide 1.4, Q12): every listed customer and
 * every employee outside management, who appear only by code or role. The
 * owner and the management roster are named in the deck on purpose.
 */
export function protectedNames(ds: FinancialDataset): string[] {
  const named = new Set([...(ds.intake?.management ?? []).map((m) => m.name.toLowerCase()), ...(ds.recastInputs?.owners ?? []).map((o) => o.name.toLowerCase())]);
  const staff = (ds.payroll?.employees ?? []).filter((e) => e.name && !e.isOwner && !e.isManagement && !named.has(e.name.toLowerCase())).map((e) => e.name!);
  const customers = (ds.customers?.customers ?? []).flatMap((c) => (c.name ? [c.name] : []));
  return [...new Set([...customers, ...staff].map((n) => n.trim()).filter((n) => n.length >= 3))];
}

/** Every copy string that prints a protected name; any hit blocks the copy (a customer or staff member named in a buyer document). */
export function lintNames(copy: CimCopy, names: string[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const patterns = names.map((n) => ({ n, re: new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu") }));
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      for (const { n, re } of patterns) if (re.test(v)) issues.push({ path, issue: `names "${n}", who appears in the CIM only by code or role`, text: v });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(copy, "");
  return issues;
}

/** Every "[Confirm: …]" placeholder in a value, deduplicated, in order of appearance. */
export function placeholdersIn(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const m of v.matchAll(/\[Confirm:[^\]]*\]/g)) found.add(m[0]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return [...found];
}

/** Words in a string, for the density targets of guide 3.2. */
export const wordCount = (s: string): number => wordsIn(s);
