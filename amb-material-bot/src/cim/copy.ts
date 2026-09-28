// The words Claude writes, one schema per section of the CIM (guide 3.3),
// and the lint that keeps them inside AMB's voice (guide 4.4). Numbers in
// the copy are read from the numbers brief the engine builds; the exhibits
// never read the copy for a figure, so a table and a sentence cannot
// disagree (guide 4.8). Anything the sources do not say becomes a
// "[Confirm: …]" marker, which the deck prints in red italic and lists in
// open-questions.md.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** An observation keyed to a row of the exhibit it sits beside; the deck assigns the letter. */
const Observation = z.object({
  row: z.string().describe("Row key of the exhibit the observation points at, from the list given for that exhibit; an empty string when it keys no row"),
  lead: z.string().describe("Bold lead-in of 3 to 10 words carrying a number"),
  body: z.string().describe("One or two sentences with the mechanism, at most 40 words; every sentence carries a figure or a named thing"),
});
export type Observation = z.infer<typeof Observation>;

/** A rail bullet or a run-in paragraph lead. */
const Bullet = z.object({
  lead: z.string().describe("Bold lead-in of 3 to 8 words stating the point"),
  body: z.string().describe("One or two sentences of evidence with a number, at most 40 words"),
});
export type Bullet = z.infer<typeof Bullet>;

const observations = (min: number, max: number, what: string) => z.array(Observation).min(min).max(max).describe(`${min} to ${max} observations keyed to ${what}`);
const bullets = (min: number, max: number, what: string) => z.array(Bullet).min(min).max(max).describe(`${min} to ${max} bullets: ${what}`);

export const CimCopySchema = z.object({
  s1_1: z.object({
    overview: z
      .string()
      .describe(
        "Company at a glance paragraph in fixed fact order (HQ and market served; founded; employees; customers and units; revenue mix; ownership; reason for sale; owner's transition offer), 120 to 170 words, opening with the legal name and its defined short form",
      ),
    transaction: z.string().describe("Transaction paragraph, 50 to 80 words: what is offered, basis of offers, transition, timing"),
    observations: observations(2, 4, "the Quick Stats table"),
  }),
  s1_2: z.object({
    considerations: z
      .array(
        z.object({
          lead: z.string().describe("One bold sentence stating the claim, with a number"),
          evidence: z.string().describe("One or two sentences of evidence and mechanism, at most 45 words"),
          refSection: z.string().describe("Section id whose page proves it: S1.3, S2.2, S2.3, S4.2, S4.4, S5.1, S6.1, S6.3, S6.4, S7.1, S9.1"),
        }),
      )
      .min(5)
      .max(7)
      .describe("5 to 7 investment considerations, each a claim proved on a later page"),
  }),
  s1_3: z.object({ pnl: observations(2, 3, "the summary P&L"), ladder: observations(2, 3, "the condensed EBITDA ladder") }),
  s1_4: z.object({
    rows: z
      .array(
        z.object({
          consideration: z.string().describe("Two or three words: Owner involvement, Customer concentration, Technician labor, Add-back quality, Lead generation, Seasonality"),
          whatTheDataShows: z.string().describe("Quantified, at most 45 words"),
          howAddressed: z.string().describe("Quantified where the data allows, at most 45 words"),
        }),
      )
      .min(3)
      .max(6)
      .describe("Buyer considerations beyond the mandatory Financial reporting row the deck adds; Owner involvement, Customer concentration and Add-back quality are required"),
    observations: observations(2, 3, "the owner responsibilities table"),
  }),
  s2_2: z.object({ observations: observations(2, 4, "the service-line table") }),
  s2_3: z.object({ bullets: bullets(3, 4, "the unit-economics mechanism (revenue per field employee, labor cost share, capacity)") }),
  s2_4: z.object({ observations: observations(2, 3, "the facilities and systems tables") }),
  s4_1: z.object({ observations: observations(2, 4, "the customer mix table") }),
  s4_2: z.object({ observations: observations(3, 4, "the retention roll-forward") }),
  s4_4: z.object({ observations: observations(3, 4, "the top-customer list") }),
  s5_1: z.object({ observations: observations(2, 3, "the organization table") }),
  s5_2: z.object({ observations: observations(2, 4, "the headcount tables") }),
  s6_1: z.object({ observations: observations(4, 5, "the income statement") }),
  s6_2: z.object({ observations: observations(3, 4, "the revenue by line table") }),
  s6_3: z.object({ bullets: bullets(3, 4, "cost structure, one per cost line that moved") }),
  s6_4: z.object({ bullets: bullets(3, 4, "seasonality and the trailing-12 trend") }),
  s7_1: z.object({
    observations: observations(3, 3, "the EBITDA ladder"),
    takeaway: z.string().describe("Callout body, 35 to 60 words: who underwrites Adj. EBITDA and who SDE, then what is not assumed (nothing pro forma; no change in pricing, headcount or programs after closing)"),
  }),
  s7_2: z.object({ observations: observations(2, 3, "the adjustment support table") }),
  s8_1: z.object({ observations: observations(2, 3, "the balance sheet and working capital tables") }),
  s9_1: z.object({ bullets: bullets(2, 4, "the growth levers, each with its baseline and what would size it") }),
  s10_1: z.object({
    transaction: z.string().describe("Fact-order transaction paragraph, 50 to 80 words: '[Owner] is offering …' with the basis of offers and timing"),
    transition: z.string().describe("Owner transition and key employees, 50 to 80 words"),
    premises: z.string().describe("Real estate, fleet and systems a buyer takes over, 40 to 70 words"),
    process: z.string().describe("How to proceed, 30 to 50 words, ending with the AMB Advisory contact instruction"),
  }),
  open_questions: z.array(z.string()).describe("Every fact the advisor must confirm with the Seller before this CIM goes out, one per item"),
});
export type CimCopy = z.infer<typeof CimCopySchema>;

/** Page ids a copy field belongs to, so a missing block can be reported by page. */
export const COPY_SECTIONS = ["s1_1", "s1_2", "s1_3", "s1_4", "s2_2", "s2_3", "s2_4", "s4_1", "s4_2", "s4_4", "s5_1", "s5_2", "s6_1", "s6_2", "s6_3", "s6_4", "s7_1", "s7_2", "s8_1", "s9_1", "s10_1"] as const;

// ---------------------------------------------------------------------------
// Lint (guide 4.4, 4.2 rule 10, 2.10 T21)
// ---------------------------------------------------------------------------

/** Banned words and constructions, verbatim from guide 4.4, as case-insensitive patterns on word boundaries. */
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
const BANNED_WITHOUT_NUMBER = ["strong", "solid", "healthy", "significant", "substantial", "meaningful", "leading", "diversified"];

/** Sentence openers that are filler. */
const BANNED_OPENERS = ["Furthermore", "Moreover", "Additionally"];

/** "leverage" is banned as a verb; "leverage ratio" or "financial leverage" is not. */
const LEVERAGE_VERB = /\bleverag(e|es|ed|ing)\b(?!\s+(ratio|ratios))/i;

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

/** Lint one string of client-facing prose. */
export function lintText(text: string, path: string): LintIssue[] {
  const out: LintIssue[] = [];
  if (/—/.test(text)) out.push({ path, issue: "em dash", text });
  if (/!/.test(text.replace(/\[Confirm:[^\]]*\]/g, ""))) out.push({ path, issue: "exclamation mark", text });
  for (const b of BANNED_PHRASES) {
    const re = new RegExp(`(^|[^A-Za-z-])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z-])`, "i");
    if (re.test(text)) out.push({ path, issue: `banned phrase "${b}"`, text });
  }
  if (LEVERAGE_VERB.test(text)) out.push({ path, issue: 'banned phrase "leverage" as a verb', text });
  for (const s of sentences(text)) {
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

/** Walk every string of the copy (except the open questions, which are advisor notes) and lint it. */
export function lintCopy(copy: CimCopy): LintIssue[] {
  const issues: LintIssue[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") issues.push(...lintText(v, path));
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
  };
  walk({ ...copy, open_questions: [] }, "");
  return issues;
}

/** Every "[Confirm: …]" placeholder in the copy, deduplicated, in order of appearance. */
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
export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Cut prose at a sentence boundary past the budget, so a box never overflows silently. */
export function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  const cut = words.slice(0, max).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("] "));
  if (lastStop > cut.length * 0.4) return cut.slice(0, lastStop + 1);
  return `${cut}.`;
}
