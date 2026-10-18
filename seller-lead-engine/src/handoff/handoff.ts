import fs from "node:fs";
import path from "node:path";
import type { EngineConfig } from "../config.ts";
import { splitList, type LeadRow, type ProspectRow, type ReplyRow } from "../domain/schema.ts";
import { article, buildReadinessCheck, fileStem, money, recordFacts, toldFacts, writeReadinessCheck } from "../readiness/check.ts";
import type { MultipleRow } from "../readiness/multiples.ts";
import { Suppression } from "../compliance/suppression.ts";
import type { Stores } from "../store/index.ts";
import { addBusinessDays, isoStamp } from "../util/dates.ts";

// Hands warm sellers to the advisor. For each lead at stage "warm" that has
// not been handed off, it writes the readiness check (data/checks/) and a
// handoff note (data/handoffs/<prospect_id> <business>.md), then moves the
// lead to "handed_off".
//
// The note opens with one paragraph an advisor can read in 20 seconds, in a
// fixed fact order (who, what, where, since, size stated, timeline,
// motivation, what they asked for), so every note reads the same way. It
// contains only facts from records ("per state records") or the owner's own
// words ("per owner", HOUSE_STYLE §4.2 rule 5); nothing is inferred, and the
// internal age estimate never appears (DESIGN principle 5). A lead that
// opted out after turning warm is never handed off: suppression is checked
// first (principle 3). The phone number is shown for a person to use only
// after a Do Not Call check; the engine itself never calls (principle 8).

/** One handed-off lead: who, the note's path, and the summary paragraph. */
export interface HandoffResult { prospectId: string; file: string; summary: string }

const TIMELINE_WORDS: Record<string, string> = { "0-6m": "within 6 months", "6-12m": "in 6 to 12 months", "12-24m": "in 12 to 24 months", "24m+": "in more than 24 months" };
const MOTIVATION_WORDS: Record<string, string> = {
  retirement: "retirement",
  health: "health",
  burnout: "burnout",
  partner_dispute: "a partner dispute",
  new_venture: "a new venture",
  relocation: "relocation",
  unsolicited_offer: "an unsolicited offer",
  estate_planning: "estate planning",
  curious: "curiosity about value",
  other: "other reasons",
};
const NON_HUMAN = new Set(["bounce", "auto_reply", ""]);

/** The one-paragraph advisor summary. Deterministic: same rows, same words. */
export function handoffSummary(lead: LeadRow, p: ProspectRow, config: EngineConfig, readinessScore?: number): string {
  const noun = config.verticals[p.vertical]?.noun ?? "business";
  const who = lead.owner_name || p.owner_name || "The owner (name not on file)";
  const business = lead.business_name || p.business_name;
  const where = p.city ? ` in ${p.city}${p.state ? `, ${p.state}` : ""}` : "";
  const parts: string[] = [`${who} owns ${business}, ${article(noun)} ${noun}${where}.`];

  const since: string[] = [];
  if (p.license_issue_date) since.push(`licensed since ${p.license_issue_date.slice(0, 4)}`);
  if (p.formation_date) since.push(`formed in ${p.formation_date.slice(0, 4)}`);
  if (since.length) parts.push(`The company was ${since.join(" and ")} (per state records).`);

  const size: string[] = [];
  if (lead.revenue !== undefined) size.push(`revenue about ${money(lead.revenue)}`);
  else if (lead.revenue_band) size.push(`revenue ${lead.revenue_band}`);
  if (lead.sde !== undefined) size.push(`SDE about ${money(lead.sde)}`);
  if (lead.employees !== undefined) size.push(`${lead.employees} employees`);
  parts.push(size.length ? `Size stated: ${size.join(", ")} (per owner).` : "Size not stated yet.");

  parts.push(lead.timeline !== "unknown" ? `Timeline: ${TIMELINE_WORDS[lead.timeline]} (per owner).` : "Timeline not stated.");
  if (lead.motivation !== "unknown") {
    const detail = lead.motivation_detail.trim() ? `: "${lead.motivation_detail.trim().replace(/\s+/g, " ").slice(0, 120)}"` : "";
    parts.push(`Motivation: ${MOTIVATION_WORDS[lead.motivation] ?? lead.motivation}${detail} (per owner).`);
  } else parts.push("Motivation not stated.");

  const asked: string[] = [];
  if (lead.wants_readiness_check === "Y") asked.push("the exit-readiness check");
  asked.push("a conversation with an advisor");
  parts.push(`Asked for: ${asked.join(" and ")}.`);
  const scores = [lead.qual_score !== undefined ? `qualification ${lead.qual_score}/100` : "", readinessScore !== undefined ? `readiness ${readinessScore}/100` : ""].filter(Boolean);
  if (scores.length) parts.push(`Scores: ${scores.join(", ")}.`);
  return parts.join(" ");
}

/** The suggested next step, from timeline and what the owner asked for. */
function nextStep(lead: LeadRow, config: EngineConfig, today: string): string {
  const advisor = config.handoff.advisor_name || "The advisor";
  const by = addBusinessDays(today, 2, config.sending.holidays);
  const soon = lead.timeline === "0-6m" || lead.timeline === "6-12m";
  return soon
    ? `${advisor} replies by email by ${by} to book a 20-minute call; the owner's timeline is near, so ask for the last three years of tax returns to be shared after an NDA.`
    : `${advisor} replies by email by ${by} to book a 20-minute call and walks through the readiness check's unknown items.`;
}

/** Where the owner's name came from: the owner's own correction, else the state record it was copied from. */
function ownerSource(lead: LeadRow, p: ProspectRow): string {
  const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
  if (!lead.owner_name.trim() && !p.owner_name.trim()) return "Not on file";
  return lead.owner_name.trim() && !same(lead.owner_name, p.owner_name) ? "Per owner" : "Per state records";
}

/** Escape a value for a markdown table cell. */
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

/** Write handoff notes for every warm lead not yet handed off, and move each lead to handed_off. */
export function handOffWarmLeads(stores: Stores, config: EngineConfig, opts: { now: Date; today: string; multiples: MultipleRow[] }): HandoffResult[] {
  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  const replies = stores.replies.rows();
  const suppression = new Suppression(stores.suppression);
  const results: HandoffResult[] = [];

  for (const lead of stores.leads.rows()) {
    if (lead.stage !== "warm" || lead.handed_off_at) continue;
    const p = prospects.get(lead.prospect_id);
    if (!p) continue;
    // Opt-outs are permanent and checked before anything else (DESIGN principle 3).
    if (p.status === "dnc" || suppression.check(lead.email || p.email, p.prospect_id) || suppression.check(p.email, p.prospect_id)) continue;

    const check = buildReadinessCheck(lead, p, config, { today: opts.today, multiples: opts.multiples });
    const checkFile = writeReadinessCheck(stores, check, p);
    const summary = handoffSummary(lead, p, config, check.score);

    const md: string[] = [];
    md.push(`# Handoff: ${p.business_name}`, "");
    md.push(`Prepared ${opts.today} for ${config.handoff.advisor_name || "the advisor"}. Prospect ${p.prospect_id}.`, "");
    md.push("## Summary", "", summary, "");
    md.push("## Facts", "", "| Fact | Value | Source |", "|---|---|---|");
    const facts = [
      // The reply loop seeds lead.owner_name from the state record, so it is "per owner" only when it differs from that record.
      { label: "Owner", value: lead.owner_name || p.owner_name || "Unknown", source: ownerSource(lead, p) },
      { label: "Business", value: p.business_name + (p.dba_name ? ` (dba ${p.dba_name})` : ""), source: "Per state records" },
      { label: "Address", value: [p.street, p.city, p.state, p.zip].filter(Boolean).join(", ") || "Unknown", source: "Per state records" },
      ...recordFacts(p),
      ...toldFacts(lead),
      { label: "Motivation", value: lead.motivation === "unknown" ? "Unknown" : `${MOTIVATION_WORDS[lead.motivation] ?? lead.motivation}${lead.motivation_detail ? `: ${lead.motivation_detail}` : ""}`, source: lead.motivation === "unknown" ? "Not stated yet" : "Per owner" },
      { label: "Email", value: lead.email || p.email || "Unknown", source: "Contact record" },
      { label: "Phone", value: p.phone ? `${p.phone} (check the National Do Not Call Registry before calling)` : "Unknown", source: "Public listing" },
    ];
    for (const f of facts) md.push(`| ${cell(f.label)} | ${cell(f.value)} | ${cell(f.source)} |`);
    md.push("");
    md.push("## Why they look like a seller", "");
    const reasons = splitList(p.score_reasons);
    md.push(...(reasons.length ? reasons.map((r) => `- ${r}`) : ["- No scoring reasons on file."]), "");
    md.push("## Conversation excerpts", "");
    const thread = replies
      .filter((r: ReplyRow) => r.prospect_id === p.prospect_id && !NON_HUMAN.has(r.class))
      .sort((a, b) => a.received_at.localeCompare(b.received_at));
    md.push(...(thread.length ? thread.map((r) => `- ${r.received_at.slice(0, 10)} (${r.class}): "${cell(r.snippet).slice(0, 300)}"`) : ["- No replies on file."]), "");
    md.push("## Readiness check", "", `Score ${check.score}/100. [Open the check](../checks/${encodeURI(path.basename(checkFile))})`, "");
    if (check.range) md.push(`Range in the check: ${money(check.range.low)} to ${money(check.range.high)} (${check.range.method}).`, "");
    else md.push(`No range in the check: ${check.rangeWithheld}`, "");
    md.push("## Suggested next step", "", nextStep(lead, config, opts.today), "");

    fs.mkdirSync(stores.dir.handoffs, { recursive: true });
    const file = path.join(stores.dir.handoffs, `${fileStem(p)}.md`);
    fs.writeFileSync(file, md.join("\n"));

    const stamp = isoStamp(opts.now);
    stores.leads.upsert([
      {
        ...lead,
        stage: "handed_off",
        readiness_score: check.score,
        summary,
        handoff_file: path.relative(stores.dataDir, file),
        handed_off_at: stamp,
        next_action: nextStep(lead, config, opts.today),
        updated_at: stamp,
      },
    ]);
    results.push({ prospectId: p.prospect_id, file, summary });
  }
  return results;
}
