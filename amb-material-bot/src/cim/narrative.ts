// The words in the CIM. Claude drafts them from the intake notes and the
// model's numbers, under one hard rule: never invent a fact. Anything the
// sources don't say becomes a visible [Confirm: ...] placeholder, and every
// placeholder is listed in open-questions.md for the advisor.

import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { FinancialDataset } from "../domain/financials.ts";
import type { RequestRow } from "../requests/schema.ts";
import type { Assumptions } from "../model/assumptions.ts";
import type { ModelResult } from "../model/engine.ts";
import { assertFinished, claude, claudeAvailable, CLAUDE_MODEL, fallbackOptions } from "../util/claude.ts";
import { fmtMoney, fmtPct } from "../util/format.ts";

const Item = z.object({ title: z.string(), detail: z.string() });

export const CimCopySchema = z.object({
  tagline: z.string().describe("Cover descriptor, max 12 words, e.g. 'Established residential HVAC and plumbing services provider in Central Ohio'"),
  executive_summary: z.string().describe("90-120 words"),
  investment_highlights: z.array(Item).describe("Exactly 6. Title max 6 words; detail max 30 words, quantified where the sources allow"),
  history: z.string().describe("Company history and overview, 70-100 words"),
  snapshot: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe("Exactly 6 at-a-glance facts (e.g. Founded, Headquarters, Employees, Service area, Facility, Ownership). Value max 8 words"),
  services: z.array(Item).describe("3-5 service lines. Title max 5 words; detail max 22 words"),
  customers: z.string().describe("Customer base and concentration, 45-70 words"),
  operations: z.array(Item).describe("Exactly 4 (e.g. Facility, Fleet & equipment, Systems, Suppliers). Detail max 28 words"),
  team: z.string().describe("Employees, key staff and owner's role, 50-75 words"),
  industry_overview: z.string().describe("Industry and local market context, 70-100 words. General industry knowledge only; no invented statistics"),
  growth_opportunities: z.array(Item).describe("4-5 opportunities for a new owner. Detail max 25 words"),
  financial_commentary: z.string().describe("Historical performance, 45-65 words, citing the numbers provided"),
  projection_commentary: z.string().describe("What drives the projections, 30-45 words, citing the assumptions provided"),
  reason_for_sale: z.string().describe("20-40 words"),
  transaction_overview: z.string().describe("Deal structure, owner transition and process, 45-65 words"),
  open_questions: z.array(z.string()).describe("Every fact the advisor must confirm with the seller before this CIM goes out, one per item"),
});
export type CimCopy = z.infer<typeof CimCopySchema>;

const SYSTEM = `You write Confidential Information Memoranda (CIMs) for AMB Advisory Services, an M&A advisory firm that sells small private businesses (Main Street and lower middle market). Buyers are individual operators, search funds, SBA-financed buyers and private-equity add-on acquirers.

Hard rules:
1. Use only facts in the intake notes, the request details and the financial summary. Never invent customers, statistics, certifications, market sizes, dates or names.
2. When a section needs a fact the sources don't give, write a short placeholder in square brackets, e.g. "[Confirm: lease expiry]", and add the same question to open_questions.
3. Numbers must match the financial summary exactly (you may round to one decimal in $M or to $K).
4. Tone: factual, confident and buyer-oriented, the way a seasoned sell-side banker writes. No hype words ("amazing", "unparalleled", "best-in-class") and no exclamation marks.
5. Respect every word limit. These fill fixed slide areas, so over-long text gets cut off.
6. Use the business's real name in the body. The project code name is only for the cover.
7. Don't state an asking price or valuation.`;

export interface NarrativeContext {
  row: RequestRow;
  notes: string;
  dataset: FinancialDataset;
  assumptions: Assumptions;
  model: ModelResult;
}

export function financialBrief(ctx: NarrativeContext): string {
  const { model, dataset: ds, assumptions: a } = ctx;
  const lines: string[] = ["Historical (fiscal years, USD):"];
  for (const y of model.historical) {
    lines.push(
      `FY${y.year}: revenue ${fmtMoney(y.revenue)}, gross profit ${fmtMoney(y.grossProfit)} (${fmtPct(y.grossProfit / y.revenue)}), reported EBITDA ${fmtMoney(y.ebitda)}, adjusted EBITDA ${fmtMoney(y.adjEbitda)} (${fmtPct(y.adjEbitda / y.revenue)}), SDE ${fmtMoney(y.sde)}`,
    );
  }
  const h = model.historical;
  if (h.length >= 2) {
    const cagr = (h[h.length - 1]!.revenue / h[0]!.revenue) ** (1 / (h.length - 1)) - 1;
    lines.push(`Revenue CAGR FY${h[0]!.year}-FY${h[h.length - 1]!.year}: ${fmtPct(cagr)}`);
  }
  if (ds.revenueMix.length) {
    const total = ds.revenueMix.reduce((s, m) => s + m.amount, 0);
    lines.push(`Latest-year revenue by account: ${ds.revenueMix.map((m) => `${m.label} ${fmtPct(m.amount / total)}`).join(", ")}`);
  }
  if (ds.addbacks.length) {
    lines.push(`Add-backs used in adjusted EBITDA: ${[...new Set(ds.addbacks.map((x) => x.description))].join("; ")}`);
  }
  lines.push(`Owner compensation normalised to a replacement salary of ${fmtMoney(a.replacementSalary[h[h.length - 1]!.year] ?? 0)}.`);
  lines.push("Projections:");
  for (const y of model.projected) {
    lines.push(`FY${y.year}E: revenue ${fmtMoney(y.revenue)}, adjusted EBITDA ${fmtMoney(y.adjEbitda)} (${fmtPct(y.adjEbitda / y.revenue)})`);
  }
  lines.push(`Projection drivers: revenue growth ${a.revenueGrowth.map((g) => fmtPct(g)).join(" → ")}; ${a.notes.revenueGrowth} Costs held at the latest year's % of revenue.`);
  return lines.join("\n");
}

function requestBrief(row: RequestRow): string {
  return [
    `Business: ${row.business_name}`,
    `Project code name: ${row.code_name}`,
    `Industry: ${row.industry || "[not given]"}`,
    `Location: ${row.location || "[not given]"}`,
    `Entity type: ${row.entity_type}`,
    `Year founded: ${row.year_founded ?? "[not given]"}`,
    `Employees: ${row.employees ?? "[not given]"}`,
    `Advisor notes: ${row.notes || "none"}`,
  ].join("\n");
}

export async function draftCimCopy(ctx: NarrativeContext): Promise<{ copy: CimCopy; drafted: "claude" | "template" }> {
  if (!claudeAvailable()) return { copy: templateCopy(ctx), drafted: "template" };

  const response = await claude().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    ...fallbackOptions(),
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(CimCopySchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Draft the copy for a 10-page CIM.

<request>
${requestBrief(ctx.row)}
</request>

<intake_notes>
${ctx.notes || "(no intake notes provided)"}
</intake_notes>

<financial_summary>
${financialBrief(ctx)}
</financial_summary>`,
      },
    ],
  });
  assertFinished(response.stop_reason, "the CIM copy");
  if (!response.parsed_output) throw new Error("Could not parse the CIM copy from Claude");
  return { copy: response.parsed_output, drafted: "claude" };
}

/**
 * Copy built without Claude, from the request row and the numbers only.
 * Every qualitative claim is a placeholder, so the deck is structurally
 * complete and honest about what still needs writing.
 */
export function templateCopy(ctx: NarrativeContext): CimCopy {
  const { row, model } = ctx;
  const last = model.historical[model.historical.length - 1]!;
  const first = model.historical[0]!;
  const n = model.historical.length;
  const cagr = n >= 2 ? (last.revenue / first.revenue) ** (1 / (n - 1)) - 1 : 0;
  const age = row.year_founded ? `${new Date().getFullYear() - row.year_founded}-year-old ` : "";
  const where = row.location || "[Confirm: location]";
  const what = row.industry || "[Confirm: industry]";
  const c = (q: string) => `[Confirm: ${q}]`;

  return {
    tagline: `${what} business based in ${where}`,
    executive_summary:
      `${row.business_name} is a ${age}${lowerFirst(what)} business based in ${where}. ` +
      `In FY${last.year} the company generated ${fmtMoney(last.revenue)} of revenue, ${fmtMoney(last.adjEbitda)} of adjusted EBITDA (${fmtPct(last.adjEbitda / last.revenue)} margin) ` +
      `and ${fmtMoney(last.sde)} of seller's discretionary earnings.` +
      (n >= 2 ? ` Revenue has grown at a ${fmtPct(cagr)} compound annual rate since FY${first.year}.` : "") +
      ` ${c("two sentences on what the company does and why it wins work")} ${c("reason for sale and owner transition")}`,
    investment_highlights: [
      { title: "Consistent revenue growth", detail: n >= 2 ? `Revenue grew from ${fmtMoney(first.revenue)} in FY${first.year} to ${fmtMoney(last.revenue)} in FY${last.year}, a ${fmtPct(cagr)} CAGR.` : c("growth history") },
      { title: "Attractive cash earnings", detail: `FY${last.year} adjusted EBITDA of ${fmtMoney(last.adjEbitda)} and SDE of ${fmtMoney(last.sde)}.` },
      { title: c("Highlight 3"), detail: c("customer base, recurring revenue or contracts") },
      { title: c("Highlight 4"), detail: c("reputation, licences, certifications") },
      { title: c("Highlight 5"), detail: c("team that stays post-close") },
      { title: c("Highlight 6"), detail: c("identified growth levers") },
    ],
    history: `${row.business_name} was founded in ${row.year_founded ?? c("year founded")} and is based in ${where}. ${c("founding story, milestones and how the business has evolved")}`,
    snapshot: [
      { label: "Founded", value: row.year_founded ? String(row.year_founded) : c("year") },
      { label: "Headquarters", value: where },
      { label: "Employees", value: row.employees ? `${row.employees} full-time` : c("headcount") },
      { label: "Entity", value: row.entity_type },
      { label: `FY${last.year} revenue`, value: fmtMoney(last.revenue) },
      { label: "Facility", value: c("owned or leased; size") },
    ],
    services: [
      { title: c("Service line 1"), detail: c("description and share of revenue") },
      { title: c("Service line 2"), detail: c("description and share of revenue") },
      { title: c("Service line 3"), detail: c("description and share of revenue") },
    ],
    customers: `${c("customer types, number of active customers, repeat rate")} ${c("largest customer as % of revenue")}`,
    operations: [
      { title: "Facility", detail: c("location, size, lease terms") },
      { title: "Equipment", detail: c("fleet, key equipment, condition") },
      { title: "Systems", detail: c("software used for operations and accounting") },
      { title: "Suppliers", detail: c("key suppliers and terms") },
    ],
    team: `${row.employees ? `The company has ${row.employees} employees.` : c("headcount")} ${c("key managers, tenure, owner's current role and hours")}`,
    industry_overview: c("industry overview and local market drivers"),
    growth_opportunities: [
      { title: c("Opportunity 1"), detail: c("detail") },
      { title: c("Opportunity 2"), detail: c("detail") },
      { title: c("Opportunity 3"), detail: c("detail") },
      { title: c("Opportunity 4"), detail: c("detail") },
    ],
    financial_commentary:
      `Revenue ${n >= 2 ? `grew from ${fmtMoney(first.revenue)} in FY${first.year} to ${fmtMoney(last.revenue)} in FY${last.year}` : `was ${fmtMoney(last.revenue)} in FY${last.year}`}. ` +
      `Adjusted EBITDA was ${fmtMoney(last.adjEbitda)} in FY${last.year} after normalising owner compensation and seller add-backs. ${c("drivers of margin change")}`,
    projection_commentary: `Projections extend the historical growth trend and hold costs at FY${last.year} levels as a percentage of revenue. ${c("seller view of the outlook")}`,
    reason_for_sale: c("reason for sale"),
    transaction_overview: `${c("asset or stock sale")} ${c("owner transition period")} Interested parties should direct all enquiries to AMB Advisory Services.`,
    open_questions: [
      "Draft generated without Claude (ANTHROPIC_API_KEY not set): every [Confirm: ...] placeholder in the deck needs writing.",
    ],
  };
}

/** "Residential HVAC" -> "residential HVAC": lower-case the first word only, and never an acronym. */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
}

/** Every [Confirm: ...] placeholder left in the copy. */
export function placeholders(copy: CimCopy): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const m of v.matchAll(/\[Confirm:[^\]]*\]/g)) found.add(m[0]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk({ ...copy, open_questions: [] });
  return [...found];
}
