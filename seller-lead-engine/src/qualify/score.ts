import type { EngineConfig } from "../config.ts";
import type { LeadRow, LeadStage, ReplyClass } from "../domain/schema.ts";
import { INTAKE_QUESTIONS, isAnswered } from "./questions.ts";

// The qualification score (0-100) for an owner in conversation, from facts
// the owner stated by email, and the funnel stage that follows from it.
//
// Weights (DESIGN.md module E): timeline 30, size fit 25, motivation 20,
// engagement 15, owner dependence and readiness facts 10. This is the
// "seller intent" score that docs/research/offer.md section 7 keeps separate
// from the business readiness score: internal only, never shown to the
// owner and never quoted in an email.
//
// Only stated facts count. A blank is unknown and scores nothing; nothing
// here guesses a revenue from a headcount or a timeline from a mood.
//
// Size fit uses `config.qualify` (min_revenue, max_revenue, min_sde). A
// revenue band ("$1M-$2M", "under $500K") counts when the whole band sits
// on one side of a limit; a band that straddles a limit counts as in range,
// since the owner may be inside it.

/** The score, why, which core facts are still unknown, and the size fit. */
export interface QualResult {
  score: number;
  reasons: string[];
  missing: string[];
  fit: "in_range" | "too_small" | "too_large" | "unknown";
}

const MONEY_WORD: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mil: 1e6, million: 1e6, b: 1e9, billion: 1e9 };

/**
 * A dollar range from an owner's words: "$1M-$2M" -> 1e6..2e6, "under $500K"
 * -> 0..499999, "$5M+" or "over 5 million" -> 5e6..Infinity, "about $1.2M"
 * -> 1.2e6..1.2e6. Undefined when no amount is found.
 */
export function parseMoneyRange(text: string): { low: number; high: number } | undefined {
  const t = text.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2").replace(/\s+/g, " ").trim();
  const re = /(\$)?\s?(\d+(?:\.\d+)?)\s?(k|thousand|mm|m|mil|million|b|billion)?\b(\+)?/g;
  const tokens = [...t.matchAll(re)].map((m) => ({ dollar: Boolean(m[1]), n: Number(m[2]), unit: m[3] ?? "", plus: Boolean(m[4]), at: m.index, end: m.index + m[0].length }));
  // "1-2M", "1 to 2 million", "between 1 and 2 million": a bare figure linked to the next one takes its unit.
  for (let i = tokens.length - 2; i >= 0; i--) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (!a.unit && b.unit && /^(-|\u2013|to|and)?\s?\$?$/.test(t.slice(a.end, b.at).trim())) a.unit = b.unit;
  }
  // Money is a figure with "$" or a unit; a bare number counts only when it is a plausible dollar amount (1,000 or more, not a year).
  let money = tokens.filter((x) => x.dollar || x.unit);
  if (!money.length) money = tokens.filter((x) => x.n >= 1000 && !(x.n >= 1900 && x.n <= 2100 && Number.isInteger(x.n)));
  if (!money.length) return undefined;
  const value = (x: (typeof tokens)[number]) => x.n * (MONEY_WORD[x.unit] ?? 1);
  const first = money[0]!;
  const before = t.slice(0, first.at).trim();
  if (/(under|below|less than|up to|<)$/.test(before)) return { low: 0, high: value(first) - 1 };
  if (/(over|above|more than|at least|>)$/.test(before) || (first.plus && money.length === 1)) return { low: value(first), high: Number.POSITIVE_INFINITY };
  if (money.length >= 2) {
    const [a, b] = [value(first), value(money[1]!)];
    return { low: Math.min(a, b), high: Math.max(a, b) };
  }
  return { low: value(first), high: value(first) };
}

/** The revenue range a lead states: the figure when given, else the band, else undefined. */
export function statedRevenue(lead: LeadRow): { low: number; high: number } | undefined {
  if (lead.revenue !== undefined) return { low: lead.revenue, high: lead.revenue };
  return lead.revenue_band.trim() ? parseMoneyRange(lead.revenue_band) : undefined;
}

const usd = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}K`);

/** The owner-earnings (SDE) range a lead states: the figure when given, else the band, else undefined. */
export function statedSde(lead: LeadRow): { low: number; high: number } | undefined {
  if (lead.sde !== undefined) return { low: lead.sde, high: lead.sde };
  return lead.sde_band.trim() ? parseMoneyRange(lead.sde_band) : undefined;
}

/**
 * A percent range from an owner's words: "10% to 30%" -> 10..30, "under
 * 10%" -> 0..10, "over 60%" -> 60..100, "about 25%" -> 25..25. Undefined
 * when no percentage is found.
 */
export function parsePercentRange(text: string): { low: number; high: number } | undefined {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)\s?(%|percent|pct)?/g)].map((m) => ({ n: Number(m[1]), at: m.index }));
  const pcts = nums.filter((x) => x.n >= 0 && x.n <= 100);
  if (!pcts.length || !/%|percent|pct/.test(t)) return undefined;
  const first = pcts[0]!;
  const before = t.slice(0, first.at).trim();
  if (/(under|below|less than|up to|<)$/.test(before)) return { low: 0, high: first.n };
  if (/(over|above|more than|at least|>)$/.test(before) || /\+/.test(t.slice(first.at, first.at + 6))) return { low: first.n, high: 100 };
  if (pcts.length >= 2) return { low: Math.min(first.n, pcts[1]!.n), high: Math.max(first.n, pcts[1]!.n) };
  return { low: first.n, high: first.n };
}

/** A share the lead states (recurring revenue or the largest customer): the figure when given, else the band. */
export function statedShare(lead: LeadRow, which: "recurring" | "top_customer"): { low: number; high: number } | undefined {
  const figure = which === "recurring" ? lead.recurring_revenue_pct : lead.top_customer_pct;
  if (figure !== undefined) return { low: figure, high: figure };
  const band = which === "recurring" ? lead.recurring_revenue_band : lead.top_customer_band;
  return band.trim() ? parsePercentRange(band) : undefined;
}

/** Upper bound in months of a timeline band. */
const TIMELINE_MONTHS: Record<string, number> = { "0-6m": 6, "6-12m": 12, "12-24m": 24, "24m+": Number.POSITIVE_INFINITY };
const TIMELINE_POINTS: Record<string, number> = { "0-6m": 30, "6-12m": 25, "12-24m": 15 };
const TIMELINE_WORDS: Record<string, string> = { "0-6m": "within 6 months", "6-12m": "6 to 12 months", "12-24m": "12 to 24 months", "24m+": "more than 24 months" };

/** True when the stated timeline falls inside `qualify.horizon_months`. */
export function timelineInHorizon(timeline: string, config: EngineConfig): boolean {
  const upper = TIMELINE_MONTHS[timeline];
  return upper !== undefined && upper <= config.qualify.horizon_months;
}

/** Points by stated motivation. Reasons that force or invite a sale score highest; "curious" is engagement, not intent. */
const MOTIVATION_POINTS: Record<string, number> = {
  retirement: 20,
  health: 20,
  burnout: 20,
  partner_dispute: 20,
  estate_planning: 20,
  relocation: 18,
  new_venture: 18,
  unsolicited_offer: 15,
  other: 10,
  curious: 6,
};

/** The size fit from stated revenue (or band) and SDE against `config.qualify`. */
export function sizeFit(lead: LeadRow, config: EngineConfig): QualResult["fit"] {
  const { min_revenue, max_revenue, min_sde } = config.qualify;
  const rev = statedRevenue(lead);
  if (rev && rev.high < min_revenue) return "too_small";
  if (rev && rev.low > max_revenue) return "too_large";
  const sde = statedSde(lead);
  if (sde && sde.high < min_sde) return "too_small";
  if (rev || sde) return "in_range";
  return "unknown";
}

/** Score a lead 0-100 from stated facts: timeline 30, size fit 25, motivation 20, engagement 15, readiness facts 10. */
export function qualScore(lead: LeadRow, config: EngineConfig): QualResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  let score = 0;

  // Timeline (30). A band beyond the horizon still shows intent, so it keeps a little.
  if (lead.timeline === "unknown") missing.push("timeline");
  else if (timelineInHorizon(lead.timeline, config)) {
    const pts = TIMELINE_POINTS[lead.timeline] ?? 15;
    score += pts;
    reasons.push(`Timeline ${TIMELINE_WORDS[lead.timeline]}, per owner (+${pts})`);
  } else {
    score += 5;
    reasons.push(`Timeline ${TIMELINE_WORDS[lead.timeline]}, beyond the ${config.qualify.horizon_months}-month horizon (+5)`);
  }

  // Size fit (25): revenue 15, owner earnings 10.
  const fit = sizeFit(lead, config);
  const rev = statedRevenue(lead);
  if (!rev) missing.push("revenue");
  const sde = statedSde(lead);
  if (!sde) missing.push("sde");
  if (fit === "too_small" || fit === "too_large") {
    reasons.push(`Size ${fit === "too_small" ? "below" : "above"} AMB's range (${usd(config.qualify.min_revenue)} to ${usd(config.qualify.max_revenue)} revenue, ${usd(config.qualify.min_sde)}+ owner earnings) (+0)`);
  } else {
    if (rev) {
      score += 15;
      reasons.push(`Revenue ${lead.revenue_band.trim() || usd(rev.low)}, inside AMB's range, per owner (+15)`);
    }
    if (sde) {
      score += 10;
      reasons.push(`Owner earnings ${lead.sde !== undefined ? usd(lead.sde) : lead.sde_band.trim()}, at or above ${usd(config.qualify.min_sde)}, per owner (+10)`);
    }
  }

  // Motivation (20).
  if (lead.motivation === "unknown") missing.push("motivation");
  else {
    const pts = MOTIVATION_POINTS[lead.motivation] ?? 10;
    score += pts;
    reasons.push(`Motivation: ${lead.motivation.replace(/_/g, " ")}${lead.motivation_detail.trim() ? ` ("${lead.motivation_detail.trim()}")` : ""} (+${pts})`);
  }

  // Engagement (15): asked for the check (8), and answered intake questions (up to 7).
  if (lead.wants_readiness_check === "Y") {
    score += 8;
    reasons.push("Asked for the exit-readiness check (+8)");
  }
  const answered = INTAKE_QUESTIONS.filter((q) => isAnswered(lead, q)).length;
  if (answered) {
    const pts = Math.min(7, answered);
    score += pts;
    reasons.push(`Answered ${answered} of ${INTAKE_QUESTIONS.length} intake questions (+${pts})`);
  }

  // Owner dependence and readiness facts (10): each point is something a buyer pays for.
  let ready = 0;
  if (lead.owner_hours_per_week !== undefined && lead.owner_hours_per_week <= 40) ready += 3;
  else if (lead.owner_hours_per_week !== undefined && lead.owner_hours_per_week <= 50) ready += 1;
  // A band counts by its conservative end: the low end of the recurring share, the high end of the largest customer.
  const recurring = statedShare(lead, "recurring");
  const top = statedShare(lead, "top_customer");
  if (recurring && recurring.low >= 30) ready += 3;
  else if (recurring && recurring.low >= 10) ready += 1;
  if (top && top.high <= 15) ready += 2;
  if (lead.license_holder.trim() && !/^(the )?owner$|\b(me|my name|myself|i do)\b/i.test(lead.license_holder.trim())) ready += 2;
  if (ready) {
    score += ready;
    reasons.push(`Readiness facts: owner hours, recurring revenue, customer spread or licence holder (+${ready})`);
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons, missing, fit };
}

/** Stages the advisor sets by hand; the reply loop never moves a lead out of them except to lost on an opt-out. */
const ADVISOR_STAGES: readonly LeadStage[] = ["handed_off", "meeting", "listed"];
/** Forward order of the qualifying stages: a new reply never moves a lead backward along it. */
const FORWARD: readonly LeadStage[] = ["engaged", "qualifying", "qualified", "warm"];

/** The stage after a reply of class `cls`, given the lead (facts merged, questions_asked updated) and its score. */
export function nextStage(lead: LeadRow, cls: ReplyClass, q: QualResult, config: EngineConfig): LeadStage {
  const current = lead.stage;
  // An opt-out, a complaint or "not the owner" ends the conversation for good (CAN-SPAM 7704(a)(4)).
  if (cls === "unsubscribe" || cls === "complaint" || cls === "wrong_person") return "lost";
  // A lead the advisor is working (handed off, meeting, listed) stays where the advisor put it: a
  // "no thanks on the questionnaire" from an owner with a meeting booked is for a person to read.
  if (ADVISOR_STAGES.includes(current)) return current;
  if (cls === "not_interested") return "lost";
  // Machine mail says nothing about the owner.
  if (cls === "bounce" || cls === "auto_reply") return current;
  if (cls === "not_now") return "nurture";
  // A referral names someone else to talk to; the owner's own stage does not move.
  if (cls === "referral") return current === "lost" || current === "nurture" ? current : FORWARD.includes(current) ? current : "engaged";

  // interested, question, asks_if_ai, other: the owner is talking with AMB.
  if (q.fit === "too_small" || q.fit === "too_large") return "lost";
  const core = q.fit === "in_range" && lead.timeline !== "unknown" && lead.motivation !== "unknown";
  let stage: LeadStage;
  if (core && lead.timeline === "24m+" && !timelineInHorizon("24m+", config)) stage = "nurture";
  else if (core && q.score >= config.qualify.warm_score && timelineInHorizon(lead.timeline, config)) stage = "warm";
  else if (core) stage = "qualified";
  else if (lead.questions_asked.trim()) stage = "qualifying";
  else stage = "engaged";
  // Never step backward along engaged -> qualifying -> qualified -> warm; a lost or nurture lead who writes back is re-engaged.
  const at = FORWARD.indexOf(current);
  const to = FORWARD.indexOf(stage);
  if (at >= 0 && to >= 0 && at > to) return current;
  return stage;
}
