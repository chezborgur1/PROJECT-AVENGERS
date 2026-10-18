import fs from "node:fs";
import path from "node:path";
import type { EngineConfig } from "../config.ts";
import type { LeadRow, ProspectRow } from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { pickMultiple, pickRevenueMultiple, type MultipleRow } from "./multiples.ts";
import { parseMoneyRange, statedShare } from "../qualify/score.ts";

// The free exit-readiness check an interested owner receives: a 0-100
// readiness score over 8 drivers, a 25-item checklist of what buyers and SBA
// lenders look at, and (only when it can be supported) a rough market range.
//
// Every fact comes from the owner's own words (leads.csv, "per owner") or a
// public record (prospects.csv, "per state records"). Anything the owner has
// not told us is marked unknown, never guessed, and scores half credit so a
// short email exchange neither flatters nor punishes the business; the
// label says "provisional" while most items are unknown.
//
// The range follows docs/research/offer.md §3 and §7: only from a verified
// multiples row, only on SDE (or revenue for a revenue-method row) the owner
// stated, never at or above readiness.max_sde_for_range (larger deals are
// priced on EBITDA by an advisor), rounded to $25K, excluding real estate,
// with the position inside the published range set by the readiness score.
// It is never called an appraisal or a value (FTC Act Section 5, 15 U.S.C.
// 45; Deception Policy Statement 1983), and the disclaimer always goes with
// it. The driver names and wording are AMB's own, not Value Builder's
// trademarked terms (offer.md §5).

/** One checklist line: which driver it belongs to, what buyers look for, and where this business stands. */
export interface ReadinessItem { driver: string; item: string; status: "met" | "gap" | "unknown"; note: string }

/** The finished check: score, driver points, checklist, optional range, and the rendered markdown and email body. */
export interface ReadinessCheck {
  score: number;
  drivers: Record<string, number>;
  items: ReadinessItem[];
  range?: { low: number; high: number; method: string; basis: string; source: string };
  rangeWithheld?: string;
  markdown: string;
  emailBody: string;
}

/** The 8 drivers in AMB's words, with their points out of 100 (weights from offer.md §7). */
export const DRIVERS = [
  { name: "Financial records", weight: 15 },
  { name: "Owner dependence", weight: 20 },
  { name: "Customer concentration", weight: 10 },
  { name: "Recurring revenue", weight: 15 },
  { name: "Team depth", weight: 10 },
  { name: "Growth", weight: 10 },
  { name: "Licences and transferability", weight: 10 },
  { name: "Real estate and lease", weight: 10 },
] as const;

/** Below this stated SDE no number is sent: the deal is too small for a rule of thumb to mean much (offer.md §7). */
export const MIN_SDE_FOR_RANGE = 50_000;

const UNKNOWN_CREDIT = 0.5;
const NOT_STATED = "Unknown: not discussed yet.";

type Status = ReadinessItem["status"];
type Eval = { status: Status; note: string };
interface ItemDef { driver: (typeof DRIVERS)[number]["name"]; item: string; evaluate: (lead: LeadRow, p: ProspectRow, config: EngineConfig) => Eval }

const unknown = (note = NOT_STATED): Eval => ({ status: "unknown", note });

/** A Y/N fact as met, gap or unknown with the matching note. */
const yesNo = (v: "Y" | "N" | "", notes: { yes: string; no: string; unknown: string }): Eval =>
  v === "Y" ? { status: "met", note: notes.yes } : v === "N" ? { status: "gap", note: notes.no } : unknown(notes.unknown);

/** The usual SBA 7(a) term for a business acquisition, which the lease should cover (offer.md §2 item 8, §6 item 13). */
export const SBA_LOAN_YEARS = 10;

/** "$475K", "$1.25M": HOUSE_STYLE §4.6 money in prose. */
export function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const isActive = (s: string) => /^(active|current|a|cur)/i.test(s.trim());
const isInactive = (s: string) => s.trim() !== "" && !isActive(s);

/**
 * The checklist. Each item says what buyers look for in plain English and
 * reads only stated facts. Sources: offer.md §2 (buyer diligence, SBA SOP 50
 * 10 8) and §6 (the 20-item checklist), regrouped under the 8 drivers.
 */
const ITEMS: readonly ItemDef[] = [
  // Financial records: lenders underwrite from tax returns (offer.md §2), so books that match them are the base of any price.
  {
    driver: "Financial records",
    item: "You know your owner earnings (SDE) for the last full year",
    evaluate: (l) =>
      l.sde !== undefined
        ? { status: "met", note: `SDE about ${money(l.sde)} (per owner).` }
        : l.sde_band.trim()
          ? { status: "met", note: `SDE ${l.sde_band.trim()} (per owner).` }
          : unknown("Unknown: SDE not stated yet."),
  },
  {
    driver: "Financial records",
    item: "Three years of profit and loss statements match the filed tax returns",
    evaluate: (l) =>
      yesNo(l.books_match_returns, {
        yes: "The books match the filed returns (per owner). A lender still checks this against the returns themselves.",
        no: "The books and the filed returns do not match (per owner). SBA lenders underwrite from the tax returns, so a buyer's loan is sized to what the returns show.",
        unknown: "Unknown: not discussed yet. SBA lenders underwrite from the tax returns.",
      }),
  },
  { driver: "Financial records", item: "Personal and one-time expenses run through the business are listed and documented", evaluate: () => unknown() },
  { driver: "Financial records", item: "A bookkeeper or CPA closes the books every month", evaluate: () => unknown() },
  // Owner dependence: the first thing a buyer tests (offer.md §2, item 1).
  {
    driver: "Owner dependence",
    item: "You work 50 hours a week or less in the business",
    evaluate: (l) => {
      const h = l.owner_hours_per_week;
      if (h === undefined) return unknown("Unknown: weekly hours not stated yet.");
      return h <= 50
        ? { status: "met", note: `${h} hours a week (per owner).` }
        : { status: "gap", note: `${h} hours a week (per owner). A buyer reads long owner hours as a job they must fill or hire for.` };
    },
  },
  {
    driver: "Owner dependence",
    item: "The business runs for 4 weeks without you",
    evaluate: (l) =>
      yesNo(l.runs_without_owner, {
        yes: "It runs for about 4 weeks without you (per owner).",
        no: "It does not run for 4 weeks without you yet (per owner). This is the first thing a buyer tests.",
        unknown: "Unknown: not discussed yet.",
      }),
  },
  { driver: "Owner dependence", item: "Staff as well as you hold the main customer relationships", evaluate: () => unknown() },
  { driver: "Owner dependence", item: "Pricing, processes and job checklists are written down", evaluate: () => unknown() },
  // Customer concentration: above about 15% in one customer is a red flag (offer.md §2, item 2).
  {
    driver: "Customer concentration",
    item: "No single customer is more than 15% of revenue",
    evaluate: (l) => {
      const c = statedShare(l, "top_customer");
      if (!c) return unknown("Unknown: largest customer share not stated yet.");
      const said = shareWords(l.top_customer_pct, l.top_customer_band);
      // A band counts by its high end: "10% to 20%" may be above 15%.
      if (c.high <= 15) return { status: "met", note: `Largest customer ${said} of revenue (per owner).` };
      if (c.low > 15) return { status: "gap", note: `Largest customer ${said} of revenue (per owner). Buyers discount for the risk of losing that customer.` };
      return unknown(`Largest customer ${said} of revenue (per owner): above or below 15% is not clear yet.`);
    },
  },
  { driver: "Customer concentration", item: "Customer agreements are in writing and can be assigned to a buyer", evaluate: () => unknown() },
  // Recurring revenue: maintenance plans, contracts and routes (offer.md §2, item 3; §7 scoring bands).
  {
    driver: "Recurring revenue",
    item: "At least 30% of revenue repeats (maintenance plans, contracts, routes)",
    evaluate: (l) => {
      const r = statedShare(l, "recurring");
      if (!r) return unknown("Unknown: recurring share not stated yet.");
      const said = shareWords(l.recurring_revenue_pct, l.recurring_revenue_band);
      if (r.low >= 30) return { status: "met", note: `${said} recurring (per owner).` };
      if (r.high < 30) return { status: "gap", note: `${said} recurring (per owner).` };
      return unknown(`${said} recurring (per owner): above or below 30% is not clear yet.`);
    },
  },
  {
    driver: "Recurring revenue",
    item: "More than 60% of revenue repeats",
    evaluate: (l) => {
      const r = statedShare(l, "recurring");
      if (!r) return unknown("Unknown: recurring share not stated yet.");
      const said = shareWords(l.recurring_revenue_pct, l.recurring_revenue_band);
      if (r.low >= 60 && !(r.low === 60 && r.high === 60)) return { status: "met", note: `${said} recurring (per owner).` };
      if (r.high <= 60) return { status: "gap", note: `${said} recurring (per owner), not above 60%.` };
      return unknown(`${said} recurring (per owner): above or below 60% is not clear yet.`);
    },
  },
  // Team depth (offer.md §2, item 6).
  // Split in two so a stated manager does not also claim they would stay: the owner can say the first, only the manager the second.
  {
    driver: "Team depth",
    item: "A manager or lead person runs day-to-day work",
    evaluate: (l) =>
      yesNo(l.manager_in_place, {
        yes: "A manager or lead person runs day-to-day work (per owner).",
        no: "No manager or lead person runs day-to-day work yet (per owner). A buyer would have to hire or fill that role.",
        unknown: "Unknown: not discussed yet.",
      }),
  },
  { driver: "Team depth", item: "That manager or lead person would stay after a sale", evaluate: () => unknown() },
  {
    driver: "Team depth",
    item: "The business has 5 or more employees",
    evaluate: (l) => {
      const e = l.employees;
      if (e === undefined) return unknown("Unknown: headcount not stated yet.");
      return e >= 5 ? { status: "met", note: `${e} employees (per owner).` } : { status: "gap", note: `${e} employees (per owner).` };
    },
  },
  { driver: "Team depth", item: "Workers are classified correctly (W-2 or 1099) and payroll taxes are current", evaluate: () => unknown() },
  // Growth: 3-year trend and scale (offer.md §2, item 5; size bands in config.qualify).
  // Revenue and profit trend are separate items: an owner who says "revenue is growing" has not said profit is.
  {
    driver: "Growth",
    item: "Revenue is flat or growing over the last 3 years",
    evaluate: (l) => {
      if (!l.revenue_trend) return unknown("Unknown: revenue trend not stated yet.");
      return l.revenue_trend === "declining"
        ? { status: "gap", note: "Revenue has been declining (per owner). Buyers and lenders price on the recent trend." }
        : { status: "met", note: `Revenue has been ${l.revenue_trend} (per owner).` };
    },
  },
  { driver: "Growth", item: "Profit is flat or growing over the last 3 years", evaluate: () => unknown("Unknown: profit trend not discussed yet.") },
  {
    driver: "Growth",
    item: "Annual revenue is at or above the size most buyers in this market finance",
    evaluate: (l, _p, config) => {
      const min = config.qualify.min_revenue;
      if (l.revenue === undefined) return unknown(l.revenue_band ? `Unknown: revenue stated as "${l.revenue_band}" (per owner), not a figure.` : "Unknown: revenue not stated yet.");
      return l.revenue >= min
        ? { status: "met", note: `Revenue about ${money(l.revenue)} (per owner).` }
        : { status: "gap", note: `Revenue about ${money(l.revenue)} (per owner), under ${money(min)}.` };
    },
  },
  // Licences: trade licences usually depend on a qualifying individual (offer.md §2, item 7).
  {
    driver: "Licences and transferability",
    item: "The trade or professional licence is held by someone other than you, or a buyer can qualify for it",
    evaluate: (l) => {
      const holder = l.license_holder.trim();
      if (!holder) return unknown("Unknown: who holds the licence not stated yet.");
      return /\b(owner|me|myself|self|i)\b/i.test(holder)
        ? { status: "gap", note: "You hold the licence (per owner). A buyer needs their own qualifier or a licensed employee who stays." }
        : { status: "met", note: `Licence held by: ${holder} (per owner).` };
    },
  },
  {
    driver: "Licences and transferability",
    item: "The company and its licence are active on state records",
    evaluate: (_l, p) => {
      if (!p.entity_status.trim() && !p.license_status.trim()) return unknown("Unknown: no state record on file.");
      if (isInactive(p.entity_status) || isInactive(p.license_status)) {
        return { status: "gap", note: `Entity status "${p.entity_status || "blank"}", licence status "${p.license_status || "blank"}" (per state records).` };
      }
      return { status: "met", note: "Active (per state records)." };
    },
  },
  { driver: "Licences and transferability", item: "Equipment and vehicles are listed with model year, condition and any liens", evaluate: () => unknown() },
  { driver: "Licences and transferability", item: "No pending lawsuits, tax disputes or major warranty claims", evaluate: () => unknown() },
  // Real estate and lease: lease term against a 10-year acquisition loan (offer.md §2, items 8 and SBA notes).
  {
    driver: "Real estate and lease",
    item: "You own the premises, or the lease runs long enough (with options) to cover a 10-year buyer loan",
    evaluate: (l) => {
      if (l.owns_real_estate === "Y") return { status: "met", note: "You own the property (per owner). It is valued separately and is not in any range here." };
      const years = l.lease_years_left;
      if (years !== undefined) {
        const y = `About ${years} ${years === 1 ? "year" : "years"} left on the lease (per owner)`;
        return years >= SBA_LOAN_YEARS
          ? { status: "met", note: `${y}. Confirm the figure includes only options you can exercise.` }
          : { status: "gap", note: `${y}. An SBA lender wants the lease, with options, to cover the loan term, usually ${SBA_LOAN_YEARS} years, so it would need extending.` };
      }
      if (l.owns_real_estate === "N") return unknown("You lease (per owner). Unknown: years left on the lease, with options.");
      return unknown("Unknown: own or lease not stated yet.");
    },
  },
  { driver: "Real estate and lease", item: "The landlord would consent to assigning the lease, or you know whether the property is for sale or lease", evaluate: () => unknown() },
];

const credit = (s: Status) => (s === "met" ? 1 : s === "gap" ? 0 : UNKNOWN_CREDIT);

/** Score label from offer.md §7, marked provisional while more than half the items are unknown. */
export function readinessLabel(score: number, unknownShare = 0): string {
  const base = score >= 80 ? "Buyer-ready" : score >= 60 ? "Close: fix 2 or 3 items" : score >= 40 ? "Needs 12 to 24 months of preparation" : "Early stage";
  return unknownShare > 0.5 ? `${base} (provisional)` : base;
}

const round25k = (n: number) => Math.round(n / 25_000) * 25_000;
const fmtX = (x: number) => x.toFixed(2).replace(/0$/, "");

/** The range, or the reason there is none. Rules: offer.md §3 and §7, DESIGN.md module F. */
function computeRange(lead: LeadRow, p: ProspectRow, config: EngineConfig, score: number, multiples: MultipleRow[]): Pick<ReadinessCheck, "range" | "rangeWithheld"> {
  if (!config.readiness.include_range) return { rangeWithheld: "Rough ranges are turned off for now (readiness.include_range is false)." };
  const key = config.verticals[p.vertical]?.multiples_key ?? "";
  if (!key) return { rangeWithheld: "No benchmark is set up for this kind of business yet." };
  const sde = lead.sde;
  // A band ("$250K to $500K") gives a range from both ends of the band: wider, and never a point the owner did not state.
  const band = sde === undefined && lead.sde_band.trim() ? parseMoneyRange(lead.sde_band) : undefined;
  if (band) return rangeFromBand(lead, band, key, config, score, multiples);
  if (sde !== undefined && sde >= config.readiness.max_sde_for_range) {
    return { rangeWithheld: `Owner earnings of ${money(sde)} (per owner) are at a size where buyers price on EBITDA and deal terms, so an advisor prices it with you directly.` };
  }
  if (sde !== undefined && sde < MIN_SDE_FOR_RANGE) return { rangeWithheld: `At owner earnings of ${money(sde)} (per owner), a rule of thumb is too rough to be useful.` };

  let row: MultipleRow | undefined;
  let base: number | undefined;
  let baseLabel = "";
  if (sde !== undefined) {
    row = pickMultiple(multiples, key, sde);
    base = sde;
    baseLabel = `owner earnings (SDE) of ${money(sde)} (per owner)`;
  } else if (lead.revenue !== undefined) {
    row = pickRevenueMultiple(multiples, key);
    base = lead.revenue;
    baseLabel = `annual revenue of ${money(lead.revenue)} (per owner)`;
    if (!row) return { rangeWithheld: "Owner earnings (SDE) are not stated yet, and the benchmark for this kind of business is based on SDE." };
  } else {
    return { rangeWithheld: "Owner earnings (SDE) are not stated yet, and a range needs them." };
  }
  if (!row || base === undefined) return { rangeWithheld: "No checked market benchmark is on file for this kind of business yet, so I would rather not put a number on it." };

  // Position in the published range follows the readiness score: t = clamp((score - 30) / 50, 0, 1) (offer.md §7).
  const t = Math.min(1, Math.max(0, (score - 30) / 50));
  const point = row.low + t * (row.high - row.low);
  const floor = row.low * base;
  const ceiling = row.high * base;
  let low = round25k(Math.max(floor, point * base * 0.85));
  let high = round25k(Math.min(ceiling, point * base * 1.15));
  if (low < 25_000) low = 25_000;
  if (high <= low) high = low + 25_000;
  const what = row.method === "sde" ? "SDE" : "annual revenue";
  return {
    range: {
      low,
      high,
      method: `${row.method === "sde" ? "Multiple of owner earnings (SDE)" : "Multiple of annual revenue"}, excluding real estate`,
      basis: `The middle half of ${row.vertical} sold on BizBuySell (${row.as_of}) sold for ${fmtX(row.low)} to ${fmtX(row.high)} times ${what}, with a median of ${fmtX(row.mid)}. Applied to ${baseLabel}, placed within that band by the readiness score of ${score}.`,
      source: `${row.source}, ${row.as_of} (${row.source_url})`,
    },
  };
}

/** How the owner put a share: "about 25%" for a figure, the band as written otherwise. */
function shareWords(figure: number | undefined, band: string): string {
  return figure !== undefined ? `About ${figure}%` : band.trim();
}

/** The range from an owner-stated SDE band: the benchmark's low multiple on the band's low end to its high multiple on the high end. */
function rangeFromBand(lead: LeadRow, band: { low: number; high: number }, key: string, config: EngineConfig, score: number, multiples: MultipleRow[]): Pick<ReadinessCheck, "range" | "rangeWithheld"> {
  const said = lead.sde_band.trim();
  if (!Number.isFinite(band.high) || band.low >= config.readiness.max_sde_for_range) {
    return { rangeWithheld: `Owner earnings of ${said} (per owner) are at a size where buyers price on EBITDA and deal terms, so an advisor prices it with you directly.` };
  }
  if (band.low < MIN_SDE_FOR_RANGE) return { rangeWithheld: `Owner earnings of ${said} (per owner) span too wide a range for a rule of thumb to be useful; a figure would let me give one.` };
  const row = pickMultiple(multiples, key, band.low);
  if (!row) return { rangeWithheld: "No checked market benchmark is on file for this kind of business yet, so I would rather not put a number on it." };
  let low = round25k(row.low * band.low);
  let high = round25k(row.high * band.high);
  if (low < 25_000) low = 25_000;
  if (high <= low) high = low + 25_000;
  return {
    range: {
      low,
      high,
      method: "Multiple of owner earnings (SDE), excluding real estate",
      basis: `The middle half of ${row.vertical} sold on BizBuySell (${row.as_of}) sold for ${fmtX(row.low)} to ${fmtX(row.high)} times SDE, with a median of ${fmtX(row.mid)}. Applied to both ends of the owner earnings band of ${said} (per owner); a single figure would narrow it. Readiness score ${score}.`,
      source: `${row.source}, ${row.as_of} (${row.source_url})`,
    },
  };
}

/** The full disclaimer (offer.md §3 draft for counsel), with the benchmark's source when a range is given. */
export function disclaimer(config: EngineConfig, source?: string): string {
  return [
    `This is a rough, indicative review prepared by ${config.firm.name} from the information you shared by email and from public state records.`,
    "It is not an appraisal, a certified business valuation or a fairness opinion, and it is not tax, legal or financial advice.",
    "It should not be relied on by a lender, or for tax, estate, partnership or litigation purposes.",
    "We have not reviewed or verified your financial statements, tax returns, contracts or lease.",
    "Any range excludes real estate and working capital and assumes a typical asset sale.",
    "Actual sale prices depend on verified financials, buyer financing (including SBA lending rules), deal terms and buyer demand, and may be higher or lower.",
    "No sale, price or timeline is promised.",
    source ? `The range uses published rules of thumb from ${source}.` : "No range is given in this check.",
    "For a formal valuation, use a credentialed valuation professional (for example ASA, CVA or ABV).",
  ].join(" ");
}

/** The sender who signs the check: the prospect's assigned mailbox, else the first configured one. */
function senderFor(p: ProspectRow, config: EngineConfig): { name: string; first: string } {
  const mb = config.mailboxes.find((m) => m.email.toLowerCase() === p.mailbox.toLowerCase()) ?? config.mailboxes[0];
  const name = mb?.sender_name ?? config.firm.name;
  return { name, first: name.split(/\s+/)[0] ?? name };
}

/** "a" or "an" before a noun, treating acronyms by their spoken first letter ("an HVAC company"). */
export function article(noun: string): string {
  return /^[aeiou]/i.test(noun) || /^[AEFHILMNORSX][A-Z]/.test(noun) ? "an" : "a";
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

const STATUS_MARK: Record<Status, string> = { met: "Met", gap: "Gap", unknown: "Unknown" };

/** Build the check for one lead. Deterministic: reads only the rows and options passed in. */
export function buildReadinessCheck(lead: LeadRow, p: ProspectRow, config: EngineConfig, opts: { today: string; multiples: MultipleRow[] }): ReadinessCheck {
  const items: ReadinessItem[] = ITEMS.map((def) => ({ driver: def.driver, item: def.item, ...def.evaluate(lead, p, config) }));
  const drivers: Record<string, number> = {};
  const fraction: Record<string, number> = {};
  for (const d of DRIVERS) {
    const own = items.filter((i) => i.driver === d.name);
    const f = own.reduce((s, i) => s + credit(i.status), 0) / own.length;
    fraction[d.name] = f;
    drivers[d.name] = Math.round(d.weight * f * 10) / 10;
  }
  const score = Math.round(Object.values(drivers).reduce((a, b) => a + b, 0));
  const unknownCount = items.filter((i) => i.status === "unknown").length;
  const label = readinessLabel(score, unknownCount / items.length);
  const { range, rangeWithheld } = computeRange(lead, p, config, score, opts.multiples);

  // What to fix first: the 3 lowest drivers with a stated gap, then drivers with the most unknowns as "find out".
  const order = [...DRIVERS].map((d) => d.name).sort((a, b) => fraction[a]! - fraction[b]!);
  const gapDrivers = order.filter((d) => items.some((i) => i.driver === d && i.status === "gap"));
  const unknownDrivers = order
    .filter((d) => !gapDrivers.includes(d))
    .sort((a, b) => items.filter((i) => i.driver === b && i.status === "unknown").length - items.filter((i) => i.driver === a && i.status === "unknown").length);
  const fixFirst = [
    ...gapDrivers.map((d) => ({ driver: d, kind: "fix" as const, line: items.filter((i) => i.driver === d && i.status === "gap").map((i) => `${i.note} What buyers look for: ${lowerFirst(i.item)}.`).join(" ") })),
    ...unknownDrivers.map((d) => ({ driver: d, kind: "find" as const, line: `Not known yet: ${items.filter((i) => i.driver === d && i.status === "unknown").map((i) => i.item.toLowerCase()).join("; ")}.` })),
  ].slice(0, 3);

  const vertical = config.verticals[p.vertical]?.noun ?? "business";
  const owner = lead.owner_name || p.owner_name;
  const first = p.owner_first_name || owner.split(/\s+/)[0] || "";
  const sender = senderFor(p, config);
  const business = lead.business_name || p.business_name;
  const told = toldFacts(lead);
  const records = recordFacts(p);
  const fullDisclaimer = disclaimer(config, range?.source);
  const shortDisclaimer = "Rough range only, based on what you told me. Not an appraisal; real numbers depend on verified financials and deal terms.";

  const md: string[] = [];
  md.push(`# Exit-readiness check: ${business}`, "");
  md.push(`Prepared ${opts.today} for ${owner || "the owner"} by ${sender.name}, ${config.firm.name}. Based on what you told us by email and on public state records. AMB Advisory has not verified any of these figures.`, "");
  md.push("## What this is based on", "");
  md.push(`${business} is ${article(vertical)} ${vertical}${p.city ? ` in ${p.city}${p.state ? `, ${p.state}` : ""}` : ""}.`, "");
  md.push("| Fact | What we have | Source |", "|---|---|---|");
  for (const f of [...told, ...records]) md.push(`| ${f.label} | ${f.value} | ${f.source} |`);
  md.push("");
  md.push("## Readiness score", "");
  md.push(`**${score} out of 100: ${label}.** ${unknownCount} of ${items.length} checklist items are unknown until we talk; each unknown counts as half credit, so the score moves once they are answered.`, "");
  md.push("| Driver | Points | Out of |", "|---|---|---|");
  for (const d of DRIVERS) md.push(`| ${d.name} | ${drivers[d.name]} | ${d.weight} |`);
  md.push("");
  md.push("## What to look at first", "");
  fixFirst.forEach((f, i) => md.push(`${i + 1}. **${f.driver}.** ${f.line}`));
  md.push("");
  md.push("## Rough market range", "");
  if (range) {
    md.push(`**${money(range.low)} to ${money(range.high)}**, excluding real estate and working capital.`, "");
    md.push(`Method: ${range.method}. ${range.basis}`, "");
    md.push(`Source: ${range.source}.`, "");
    md.push(shortDisclaimer, "");
  } else {
    md.push(`No range in this check. ${rangeWithheld}`, "");
    md.push("A 20-minute call is the better way to talk about price: it lets an advisor ask the questions a number depends on.", "");
  }
  md.push("## The checklist buyers use", "");
  for (const d of DRIVERS) {
    md.push(`### ${d.name}`, "");
    md.push("| Item | Status | Note |", "|---|---|---|");
    for (const i of items.filter((x) => x.driver === d.name)) md.push(`| ${i.item} | ${STATUS_MARK[i.status]} | ${i.note} |`);
    md.push("");
  }
  md.push("## What would sharpen this", "");
  md.push("Three years of tax returns and matching profit and loss statements, a list of add-backs (owner pay, personal and one-time costs), the lease with its options, and a customer list with each customer's share of revenue. Please hold on to these for now: if they are needed later, they go in a restricted folder after an NDA.", "");
  md.push("## How buyer financing affects price", "");
  md.push("Most buyers of a business this size borrow through an SBA 7(a) loan. The lender sizes the loan to the cash flow the tax returns show, so earnings a buyer can verify set a ceiling on what most buyers can pay. Under the SBA's current lending rules (SOP 50 10 8), an SBA-financed purchase cannot include an earnout, and the seller can stay on for a transition of up to 12 months.", "");
  md.push("## Next step", "");
  md.push(`A 20-minute call with ${sender.name} to go through the unknown items and what a sale would need to look like for you. Reply to the email with a time that suits you.`, "");
  md.push("## About this check", "", fullDisclaimer, "");

  const email: string[] = [];
  email.push(`Hi ${first || "there"},`, "");
  email.push(`Here is the exit-readiness check for ${business}, built from what you told me by email and from public state records.`, "");
  email.push(`Readiness score: ${score} out of 100. ${label}. ${unknownCount} of ${items.length} items are unknown until we talk, and each counts as half credit.`, "");
  email.push("What to look at first:");
  for (const f of fixFirst) email.push(`- ${f.driver}: ${f.line}`);
  email.push("");
  if (range) {
    email.push(`Rough market range: ${money(range.low)} to ${money(range.high)}, excluding real estate and working capital. ${range.basis}`);
    email.push(shortDisclaimer, "");
  } else {
    email.push(`I have not put a number on it yet. ${rangeWithheld} A 20-minute call would let me ask the questions a range depends on.`, "");
  }
  email.push("Where the business stands on the checklist buyers use:");
  for (const i of items.filter((x) => x.status !== "unknown")) email.push(`- [${STATUS_MARK[i.status]}] ${i.item}. ${i.note}`);
  const unknowns = items.filter((x) => x.status === "unknown");
  if (unknowns.length) {
    email.push("", "Unknown until we talk:");
    for (const i of unknowns) email.push(`- ${i.item}`);
  }
  email.push("");
  email.push(`If a 20-minute call would help, reply with a time that suits you.`, "");
  email.push(sender.first, "");
  email.push(`About this check: ${fullDisclaimer}`);

  return { score, drivers, items, range, rangeWithheld, markdown: md.join("\n"), emailBody: email.join("\n") };
}

interface Fact { label: string; value: string; source: string }

const TIMELINE_WORDS: Record<string, string> = { "0-6m": "within 6 months", "6-12m": "6 to 12 months", "12-24m": "12 to 24 months", "24m+": "more than 24 months" };

/** Owner-stated facts, each attributed "per owner"; blanks shown as unknown. */
export function toldFacts(lead: LeadRow): Fact[] {
  const per = "Per owner";
  const fact = (label: string, value: string | undefined): Fact => (value ? { label, value, source: per } : { label, value: "Unknown", source: "Not stated yet" });
  const num = (n: number | undefined, f: (n: number) => string) => (n === undefined ? undefined : f(n));
  const yn = (v: "Y" | "N" | "") => (v === "Y" ? "Yes" : v === "N" ? "No" : undefined);
  return [
    fact("Annual revenue", num(lead.revenue, money) ?? (lead.revenue_band || undefined)),
    fact("Owner earnings (SDE)", num(lead.sde, money) ?? (lead.sde_band || undefined)),
    fact("Employees", num(lead.employees, String)),
    fact("Years owned", num(lead.years_owned, String)),
    fact("Owner hours a week", num(lead.owner_hours_per_week, String)),
    fact("Recurring revenue", num(lead.recurring_revenue_pct, (n) => `${n}%`) ?? (lead.recurring_revenue_band || undefined)),
    fact("Largest customer", num(lead.top_customer_pct, (n) => `${n}% of revenue`) ?? (lead.top_customer_band ? `${lead.top_customer_band} of revenue` : undefined)),
    fact("Premises", lead.owns_real_estate === "Y" ? "Owned" : lead.owns_real_estate === "N" ? "Leased" : undefined),
    fact("Licence held by", lead.license_holder || undefined),
    fact("Timeline", TIMELINE_WORDS[lead.timeline]),
    fact("Revenue trend (3 years)", lead.revenue_trend || undefined),
    fact("Books match tax returns", yn(lead.books_match_returns)),
    fact("Manager or lead in place", yn(lead.manager_in_place)),
    fact("Runs 4 weeks without the owner", yn(lead.runs_without_owner)),
    fact("Years left on the lease", num(lead.lease_years_left, String)),
  ];
}

/** Public-record facts from the prospect row, attributed to state records. */
export function recordFacts(p: ProspectRow): Fact[] {
  const out: Fact[] = [];
  const src = "Per state records";
  if (p.license_issue_date) out.push({ label: "Licensed since", value: p.license_issue_date.slice(0, 4), source: src });
  if (p.formation_date) out.push({ label: "Company formed", value: p.formation_date.slice(0, 4), source: src });
  if (p.license_types) out.push({ label: "Licence", value: p.license_types, source: src });
  return out;
}

/** A file-safe "<prospect_id> <business>" stem for checks and handoffs. */
export function fileStem(p: Pick<ProspectRow, "prospect_id" | "business_name">): string {
  // Trailing dots and spaces are dropped: "Inc." would give "Inc..md", and Windows refuses names ending in a dot.
  const name = p.business_name.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).replace(/[.\s]+$/, "");
  return `${p.prospect_id} ${name}`.trim();
}

/** Write the check to data/checks/<prospect_id> <business>.md and record the score on the lead. Returns the path. */
export function writeReadinessCheck(stores: Stores, check: ReadinessCheck, p: ProspectRow): string {
  fs.mkdirSync(stores.dir.checks, { recursive: true });
  const file = path.join(stores.dir.checks, `${fileStem(p)}.md`);
  fs.writeFileSync(file, check.markdown.endsWith("\n") ? check.markdown : `${check.markdown}\n`);
  const lead = stores.leads.rows().find((l) => l.prospect_id === p.prospect_id);
  if (lead && lead.readiness_score !== check.score) stores.leads.upsert([{ ...lead, readiness_score: check.score }]);
  return file;
}
