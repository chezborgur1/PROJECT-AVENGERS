import { splitList, type LeadRow } from "../domain/schema.ts";

// The intake questions AMB asks by email, so an advisor can give an owner a
// rough range without asking for documents. They come from
// docs/research/offer.md section 4: bands only ("Ask for bands only, never
// documents"), the first round covering revenue, owner earnings (SDE), owner
// involvement, recurring revenue and the largest customer, the second round
// timeline, staff, premises and who holds the licence (trade licences depend
// on a qualifying individual: offer.md verification table).
//
// The order puts what qualifies a seller first (revenue, earnings, timeline,
// motivation: the "qualified" stage needs them), then what the readiness
// check needs. Each question is asked once: `questions_asked` on the lead
// records the keys already sent, and an answered fact is never asked again.
//
// The wording is plain, has no sensitive topic (DESIGN.md principle 5: no
// age, health, family or succession; motivation is asked as "what prompted
// your interest") and passes the reply copy lint.

/** One question: its key, the lead field it fills, the wording sent, and its order (1 first). */
export interface IntakeQuestion {
  key: string;
  field: keyof LeadRow;
  text: string;
  priority: number;
}

/** The intake questions, in priority order. */
export const INTAKE_QUESTIONS: readonly IntakeQuestion[] = [
  {
    key: "revenue",
    field: "revenue",
    text: "Roughly what was revenue last full year: under $500K, $500K to $1M, $1M to $2M, $2M to $5M, or over $5M?",
    priority: 1,
  },
  {
    key: "sde",
    field: "sde",
    text: "Roughly what did the business earn for you last year, counting net profit plus your own salary and perks (owner earnings): under $100K, $100K to $250K, $250K to $500K, $500K to $1M, or over $1M?",
    priority: 2,
  },
  {
    key: "timeline",
    field: "timeline",
    text: "If you did sell, when might that be: within 12 months, 12 to 24 months, or further out?",
    priority: 3,
  },
  {
    key: "motivation",
    field: "motivation",
    text: "What prompted your interest in the check?",
    priority: 4,
  },
  {
    key: "employees",
    field: "employees",
    text: "How many people work for the business, full-time and part-time?",
    priority: 5,
  },
  {
    key: "owner_hours",
    field: "owner_hours_per_week",
    text: "About how many hours a week do you work in the business?",
    priority: 6,
  },
  {
    key: "recurring",
    field: "recurring_revenue_pct",
    text: "About what share of revenue repeats, such as maintenance agreements, contracts or regular routes: under 10%, 10% to 30%, 30% to 60%, or over 60%?",
    priority: 7,
  },
  {
    key: "top_customer",
    field: "top_customer_pct",
    text: "About what share of revenue comes from your largest customer: under 10%, 10% to 20%, or over 20%?",
    priority: 8,
  },
  {
    key: "real_estate",
    field: "owns_real_estate",
    text: "Do you own the building the business works from, or lease it?",
    priority: 9,
  },
  {
    key: "license_holder",
    field: "license_holder",
    text: "Is the trade or professional licence in your name, or held by an employee?",
    priority: 10,
  },
];

/** True when the lead already has the fact a question asks for (revenue counts as answered by a figure or a band). */
export function isAnswered(lead: LeadRow, q: IntakeQuestion): boolean {
  if (q.key === "revenue") return lead.revenue !== undefined || lead.revenue_band.trim() !== "";
  const v = lead[q.field];
  if (v === undefined || v === null) return false;
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).trim();
  return s !== "" && s !== "unknown";
}

/** Questions still to ask: unanswered and not yet asked, by priority, at most `max`. */
export function nextQuestions(lead: LeadRow, max: number): IntakeQuestion[] {
  if (max <= 0) return [];
  const asked = new Set(splitList(lead.questions_asked));
  return INTAKE_QUESTIONS.filter((q) => !asked.has(q.key) && !isAnswered(lead, q))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, max);
}
