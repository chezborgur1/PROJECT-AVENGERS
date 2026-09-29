// The words in the CIM. Claude drafts them page by page against the copy
// schema (copy.ts), from the intake facts and notes and the numbers brief,
// under AMB's voice rules and one hard rule: never invent a fact. Anything
// the sources don't say becomes a visible [Confirm: ...] placeholder, and
// every placeholder is listed in open-questions.md for the advisor.
//
// Without an API key the engine uses the request folder's reviewed copy
// fixture when there is one (the Ridgeline sample ships
// cim-copy.fixture.json), and otherwise the section modules' templated copy:
// figures from the brief, qualitative gaps as placeholders.

import fs from "node:fs";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { FinancialDataset } from "../domain/financials.ts";
import type { ModelOutput } from "../model/types.ts";
import type { RequestRow } from "../requests/schema.ts";
import { assertFinished, claude, claudeAvailable, CLAUDE_MODEL, fallbackOptions } from "../util/claude.ts";
import type { CimContext, Firm } from "./context.ts";
import { buildContext } from "./context.ts";
import type { CimCopy, LintIssue } from "./copy.ts";
import { BANNED_PHRASES, CimCopySchema, lintCopy, lintNames, protectedNames } from "./copy.ts";
import type { Block } from "./design.ts";
import type { DeckPlan } from "./planner.ts";
import { planDeck } from "./planner.ts";
import { LIBRARY } from "./sections/index.ts";

export interface NarrativeContext {
  row: RequestRow;
  notes: string;
  dataset: FinancialDataset;
  model: ModelOutput;
  firm?: Firm;
  date?: Date;
}

export interface DraftResult {
  copy: CimCopy;
  /** Where the copy came from, for run-summary.md. */
  source: "claude" | "fixture" | "template";
  /** Lint issues left in the copy (guide 4.4); empty for clean copy. */
  lint: LintIssue[];
  /** Why Claude's draft was not used when a key was set (an API error, a cut-off draft, a protected name): run-summary.md says so. */
  fallback?: string;
}

/** The reviewed copy a sample request folder may carry, used only when no API key is set. */
export const COPY_FIXTURE = "cim-copy.fixture.json";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const EMPTY: CimCopy = { open_questions: [] };
const FIRM: Firm = { name: "AMB Advisory Services", contact: "", email: "", phone: "" };

/** The context and template plan every drafting path starts from: the brief, the pages the data supports, their exhibits' row keys. */
function baseline(n: NarrativeContext): { ctx: CimContext; plan: DeckPlan } {
  const ctx = buildContext({ row: n.row, ds: n.dataset, out: n.model, copy: EMPTY, firm: n.firm ?? FIRM, date: n.date ?? new Date() });
  return { ctx, plan: planDeck(ctx) };
}

/**
 * The copy for the deck. With an API key Claude drafts it; any failure
 * (network, rate limit, refusal, a cut-off or unparsable draft, or a draft
 * that names a customer or staff member) falls back to the reviewed fixture
 * or the templated copy, so the request still delivers, and the reason goes
 * to run-summary.md. The workbook is already written by then.
 */
export async function draftCimCopy(n: NarrativeContext): Promise<DraftResult> {
  const { ctx, plan } = baseline(n);
  const names = protectedNames(n.dataset);
  const lint = (copy: CimCopy) => [...lintCopy(copy, ctx.brief), ...lintNames(copy, names)];
  let fallback: string | undefined;
  if (claudeAvailable()) {
    try {
      const copy = await draftWithClaude(n, ctx, plan);
      const named = lintNames(copy, names);
      if (named.length) throw new Error(`the draft ${named[0]!.issue}`);
      return { copy, source: "claude", lint: lint(copy) };
    } catch (e) {
      fallback = `Claude's draft was not used (${(e as Error).message}); the copy below is the fallback.`;
    }
  }
  const fixture = loadFixture(n.row, ctx.legalName);
  if (fixture) return { copy: fixture, source: "fixture", lint: lint(fixture), fallback };
  const copy = templateCopy(ctx);
  return { copy, source: "template", lint: lint(copy), fallback };
}

/** The request folder's copy fixture, when it exists and names this business. */
export function loadFixture(row: RequestRow, legalName: string): CimCopy | undefined {
  if (!row.source_folder) return undefined;
  const file = path.resolve(REPO_ROOT, row.source_folder, COPY_FIXTURE);
  if (!fs.existsSync(file)) return undefined;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { businessName?: string; copy?: unknown };
  if (raw.businessName !== legalName) return undefined;
  return CimCopySchema.parse(raw.copy);
}

/**
 * Templated copy from the section modules' fallbacks: every figure is a brief
 * token, every qualitative gap a [Confirm: …] placeholder whose question goes
 * to open_questions.
 */
export function templateCopy(ctx: CimContext): CimCopy {
  const copy: CimCopy = { open_questions: [] };
  ctx.openQuestions.length = 0;
  for (const s of LIBRARY) for (const m of s.pages) if (ctx.present.has(m.id) && m.fallback) Object.assign(copy, m.fallback(ctx));
  copy.open_questions = ["Draft generated without Claude (ANTHROPIC_API_KEY not set): every [Confirm: ...] placeholder in the deck needs writing.", ...ctx.openQuestions];
  return copy;
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

const SYSTEM = `You write Confidential Information Memoranda for AMB Advisory Services, a sell-side M&A advisor for Main Street and lower-middle-market businesses. Buyers are owner-operators, search funds, SBA-financed buyers and private-equity add-on acquirers. You fill a fixed page design whose exhibits are already built from the financial model; your words are the action titles, the lettered observations beside each exhibit, and a few paragraphs.

How the copy must read (AMB house style):
- Third person about the Company, US English. Conclusion first, then the mechanism, then the number, then the implication.
- Every observation and bullet carries a figure and a comparison (a prior period, a share, a count). Name the mechanism with "because", "driven by", "as a result". Name systems, suppliers, towns, months and counts.
- One claim per sentence; median sentence 14 to 20 words, never over 32. No triads of adjectives, no stacked clauses.
- State a negative with the fact that bounds it. Say what is not assumed ("Nothing pro forma is included").
- One name per thing: "revenue", never "sales"; "operating expenses", never "opex", and "total operating expenses" for the figure that includes owner pay; the customer noun and role names as the sources give them. Pair a count and a share only when the brief labels give them the same population (billed in a year, or active at a date).
- Attribute what is not verified: facts from the intake notes are management's; mark them with the marker " {{fn.mgmt}}". Each page numbers it against its own footnotes ("Per management; not independently verified."), so never type "(1)" or any other footnote number.
- Customers and employees outside the management roster appear only by their code ("C-001") or their role ("a lead technician"), never by name, even when the intake notes name them. The owner and the listed management team may be named.
- Buyer-facing voice: never describe the data work, a missing document, a proxy used for lack of a source, or anything left for the advisor; those go to open_questions only.
- No em dashes, no exclamation marks, no rhetorical questions, no italics for emphasis. Ranges use an en dash with no spaces.
- Never judge price or attractiveness. Never mention a valuation, asking price, multiple or offer structure.
- Banned words and constructions (fail the lint): ${BANNED_PHRASES.join(", ")}; "strong", "solid", "healthy", "significant", "substantial", "meaningful", "leading", "diversified" without a number in the same sentence; "Furthermore", "Moreover", "Additionally" as openers; "leverage" as a verb; "we", "our", "us" outside the transaction section (s10_1).

Hard rules:
1. Facts come only from the intake facts, the intake notes and the figure table. Never invent customers, statistics, certifications, market sizes, dates, names, hours, targets or causes. If a sentence needs a fact the sources do not give, write "[Confirm: <what is missing>]" in its place and add the question to open_questions.
2. Figures are tokens. Every model figure is written as its token from the figure table, exactly: "{{rev.FY2025}}", "{{gm.latest}}". Never type a model figure as digits; the build resolves tokens so the prose always matches the exhibits. Percentages and counts that come from the intake notes (such as a renewal rate) also have tokens (kpi.*); use them.
3. Figure labels ending "(decline)" are negative; the token prints the absolute value, so choose the verb ("fell", "down") accordingly.
4. Page references are "{{page:S7.1}}" tokens; use them instead of page numbers.
5. Titles: one sentence, sentence case, no final stop, a finding with at least one figure token and its period, 60 to 110 characters once resolved (one line is about 85), never over 130. Never a topic label.
6. Observations key to exhibit rows by the row keys listed for each page: "row" is the key alone, the part before " = " (for "is.gp = Gross profit", write "is.gp"). Order does not matter; the deck letters them by row position. Counts follow the evidence and stay inside each field's stated range.
7. Respect every word budget in the schema; the copy fills fixed boxes.
8. Fill only the pages listed as in this deck; leave every other page out.`;

/** Row keys an observation may point at, per page, from the template plan's exhibits. */
function rowKeys(plan: DeckPlan): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const keysOf = (b: Block): string[] => (b.kind === "numTable" ? b.spec.rows.flatMap((r) => (r.key ? [`${r.key} = ${r.label}`] : [])) : b.kind === "textTable" ? (b.spec.rowKeys ?? []) : []);
  for (const p of plan.pages) {
    const spec = p.draft.spec;
    if (!spec) continue;
    out.set(p.draft.id, spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])].flatMap(keysOf)));
  }
  return out;
}

function pagesBrief(plan: DeckPlan): string {
  const keys = rowKeys(plan);
  const copyKeys = new Map(LIBRARY.flatMap((s) => s.pages.filter((m) => m.copyKey).map((m) => [m.id, m.copyKey!] as const)));
  const lines: string[] = [];
  for (const p of plan.pages) {
    const key = copyKeys.get(p.draft.id);
    if (!key || !p.draft.spec) continue;
    const carries = p.draft.carries.length ? ` (also carries ${p.draft.carries.join(", ")})` : "";
    lines.push(`- ${key} = ${p.draft.id}${carries}, section "${p.section.name}". Exhibits: ${p.draft.exhibits.join("; ")}. Figure-built title today: "${p.draft.spec.title}". Row keys: ${(keys.get(p.draft.id) ?? []).join(", ") || "none"}.`);
  }
  return lines.join("\n");
}

async function draftWithClaude(n: NarrativeContext, ctx: CimContext, plan: DeckPlan): Promise<CimCopy> {
  const figures = ctx.brief
    .list()
    .map((f) => `{{${f.key}}} = ${f.text}  (${f.label})`)
    .join("\n");
  // Streamed with a large budget: a 20-54 page deck's copy plus adaptive thinking can run past what a single non-streamed response allows.
  const request = async (extra: string): Promise<CimCopy> => {
    const stream = claude().beta.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 64000,
      // Structured outputs (output_config.format) need no beta header; only the server-side fallback does, as in aiExtract.ts.
      ...fallbackOptions(),
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(CimCopySchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Draft the copy for the CIM of ${ctx.legalName} (defined short form "${ctx.short}"; code name ${ctx.code}, used only on the cover). Mode: ${ctx.mainStreet ? "Main Street (SDE is shown)" : "lower middle market (no SDE)"}; deal form: ${ctx.assetSale ? "asset purchase" : "equity purchase"}.

<pages_in_this_deck>
${pagesBrief(plan)}
</pages_in_this_deck>

<figure_table>
${figures}
</figure_table>

<intake_facts>
${JSON.stringify(n.dataset.intake ?? {}, (k, v) => (k === "source" ? undefined : v), 1)}
</intake_facts>

<intake_notes>
${n.notes || "(no intake notes provided)"}
</intake_notes>${extra}`,
        },
      ],
    });
    const response = await stream.finalMessage();
    assertFinished(response.stop_reason, "the CIM copy");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = CimCopySchema.safeParse((() => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    })());
    if (!parsed.success) throw new Error("Could not parse the CIM copy from Claude");
    return parsed.data;
  };
  const first = await request("");
  const issues = lintCopy(first, ctx.brief);
  if (!issues.length) return first;
  // One repair round: the draft with every lint finding, fixed in place rather than rewritten.
  const findings = issues.map((i) => `- ${i.path}: ${i.issue}${i.text ? ` ("${i.text.slice(0, 160)}")` : ""}`).join("\n");
  const repaired = await request(`

<previous_draft>
${JSON.stringify(first)}
</previous_draft>

<lint_findings>
${findings}
</lint_findings>

Return the previous draft with every lint finding fixed and nothing else changed.`);
  return lintCopy(repaired, ctx.brief).length <= issues.length ? repaired : first;
}
