import { z } from "zod";

// The engine's records: one zod schema per CSV table under the data folder.
// Column names match the CSV headers exactly, and header order is the
// schema's key order. Every cell is a string on disk; numeric columns parse
// blank to undefined and anything unparseable is a validation error, so one
// bad row is reported and never blocks the rest (the store collects it).
//
// Lists inside a cell are "; "-separated (see `splitList` / `joinList`).
// Dates are ISO: YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM:SSZ for timestamps.

// ---------------------------------------------------------------- helpers

/** Blank -> undefined; "$85,000" -> 85000; anything else is a validation error. */
export function optionalNumeric(opts: { int?: boolean } = {}) {
  return z.string().transform((raw, ctx) => {
    const s = raw.replace(/[$,\s]/g, "");
    if (s === "") return undefined;
    const n = Number(s);
    if (!Number.isFinite(n) || (opts.int && !Number.isInteger(n))) {
      ctx.addIssue({ code: "custom", message: `expected a number, got "${raw}"` });
      return z.NEVER;
    }
    return n;
  });
}
export const optNum = optionalNumeric();
export const optInt = optionalNumeric({ int: true });

/** Blank, or an ISO date (YYYY-MM-DD). */
export const optDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "use YYYY-MM-DD");
/** Blank, or an ISO timestamp (date, or date and time). */
export const optStamp = z.string().regex(/^(\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?)?$/, "use an ISO date or timestamp");

/** "a; b; c" -> ["a", "b", "c"]; blank -> []. */
export function splitList(cell: string | undefined): string[] {
  return (cell ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function joinList(items: readonly string[]): string {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))].join("; ");
}

/** Lower-cased, trimmed email: the only form the engine stores or compares. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------- enums

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;
export type UsState = (typeof US_STATES)[number];

/** Where a canonical source record came from. */
export const SOURCE_KINDS = ["sunbiz", "dbpr", "csv", "open_poi", "manual"] as const;

/** Who a person on a record is. Only owner-type roles may become the prospect's owner. */
export const PERSON_ROLES = ["owner", "officer", "principal", "authorized_official", "licensee", "qualifier", "registered_agent", "unknown"] as const;
export const OWNER_ROLES: readonly (typeof PERSON_ROLES)[number][] = ["owner", "officer", "principal", "authorized_official", "licensee"];

export const VERIFICATION_STATUSES = ["valid", "catch_all", "risky", "unknown", "invalid", "role_based", "disposable", "unverified"] as const;
export const EMAIL_SOURCES = ["website", "import", "hunter", "snov", "apollo", "manual", "reply"] as const;

/** A prospect's place in the funnel. `dnc` is permanent. */
export const PROSPECT_STATUSES = [
  "new", // imported, not scored
  "scored", // scored, not yet in a sequence
  "excluded", // knocked out (reason in exclude_reason)
  "hold", // tier C or missing a sendable email; kept for later
  "in_sequence", // at least one outreach email drafted or sent
  "replied", // a human reply stopped the sequence
  "completed", // sequence finished with no reply
  "dnc", // opted out, bounced or otherwise suppressed: never contact again
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const TIERS = ["A", "B", "C", ""] as const;

// ---------------------------------------------------------------- canonical import records

const officerCols = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].flatMap((i) => [
    [`officer${i}_name`, z.string()],
    [`officer${i}_title`, z.string()],
    [`officer${i}_is_person`, z.enum(["Y", "N", ""])],
  ]),
) as Record<`officer${1 | 2 | 3 | 4 | 5 | 6}_${"name" | "title" | "is_person"}`, z.ZodType<string>>;

/** One business entity from a Secretary of State file (`imports/entities.csv`). */
export const EntityRowSchema = z.object({
  source: z.enum(SOURCE_KINDS),
  source_record_id: z.string().min(1),
  state: z.string(),
  entity_name: z.string().min(1),
  entity_type: z.string(),
  status: z.string(), // "active" | "inactive" | raw code; importers map to active/inactive when they can
  formation_date: optDate,
  principal_street: z.string(),
  principal_city: z.string(),
  principal_state: z.string(),
  principal_zip: z.string(),
  mailing_street: z.string(),
  mailing_city: z.string(),
  mailing_state: z.string(),
  mailing_zip: z.string(),
  registered_agent_name: z.string(),
  registered_agent_type: z.string(),
  ...officerCols,
  last_annual_report_date: optDate,
  last_event_date: optDate,
  fei_number: z.string(),
  source_snapshot_date: optDate,
});
export type EntityRow = z.infer<typeof EntityRowSchema>;

/** One licence from a trade or professional board (`imports/licenses.csv`). */
export const LicenseRowSchema = z.object({
  source: z.enum(SOURCE_KINDS),
  source_record_id: z.string().min(1),
  license_number: z.string(),
  license_type: z.string(),
  license_class: z.string(),
  status: z.string(),
  business_name: z.string(),
  dba_name: z.string(),
  person_name: z.string(),
  person_role: z.enum(PERSON_ROLES),
  original_issue_date: optDate,
  effective_date: optDate,
  expiration_date: optDate,
  year_graduated: optInt,
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  county: z.string(),
  phone: z.string(),
  source_snapshot_date: optDate,
});
export type LicenseRow = z.infer<typeof LicenseRowSchema>;

/** One point of interest from an openly licensed POI file, Overture or Foursquare OS Places (`imports/open_poi.csv`). */
export const PoiRowSchema = z.object({
  source: z.enum(SOURCE_KINDS),
  source_record_id: z.string().min(1),
  name: z.string().min(1),
  basic_category: z.string(),
  website: z.string(),
  phone: z.string(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  date_refreshed: optDate,
  date_closed: optDate,
  data_license: z.string(),
});
export type PoiRow = z.infer<typeof PoiRowSchema>;

/** One contact found for a business (`imports/contacts.csv`), keyed by business name + zip until merged. */
export const ContactRowSchema = z.object({
  source: z.enum(SOURCE_KINDS),
  source_record_id: z.string().min(1),
  business_name: z.string().min(1),
  zip: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.string(),
  email: z.string(),
  email_source: z.enum(EMAIL_SOURCES),
  email_source_url: z.string(),
  website: z.string(),
  phone: z.string(),
  /** Employee count from the list, as written ("18", "11-50", "50+"); blank or missing when the list has none. */
  employees: z.string().optional(),
});
export type ContactRow = z.infer<typeof ContactRowSchema>;

// ---------------------------------------------------------------- the pipeline tables

/** Where a headcount estimate came from, strongest first (src/contacts/staff.ts). */
export const STAFF_SOURCES = ["website_stated", "import", "website_listed"] as const;

/** One business: the merged, scored record the sequence works from (`prospects.csv`). */
export const ProspectRowSchema = z.object({
  prospect_id: z.string().regex(/^P-\d{5,}$/, "P-00001"),
  status: z.enum(PROSPECT_STATUSES),
  exclude_reason: z.string(),
  business_name: z.string().min(1),
  dba_name: z.string(),
  vertical: z.string(), // a key of config.verticals, e.g. "hvac"
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  county: z.string(),
  metro: z.string(), // a key of config.metros, or blank when outside every target metro
  phone: z.string(),
  website: z.string(),
  entity_type: z.string(),
  entity_status: z.string(),
  formation_date: optDate,
  license_numbers: z.string(), // list
  license_types: z.string(), // list
  license_issue_date: optDate, // earliest original issue date across the business's licences
  license_status: z.string(),
  year_graduated: optInt,
  officer_count: optInt,
  officers: z.string(), // list of "Name (TITLE)"
  // Headcount (src/contacts/staff.ts): the size signal AMB trusts most. Internal: never in an email.
  staff_count: optInt,
  staff_source: z.enum([...STAFF_SOURCES, ""]),
  staff_basis: z.string(),
  owner_name: z.string(),
  owner_first_name: z.string(),
  owner_last_name: z.string(),
  owner_title: z.string(),
  owner_role: z.enum([...PERSON_ROLES, ""]),
  email: z.string(),
  email_source: z.enum([...EMAIL_SOURCES, ""]),
  email_source_url: z.string(),
  email_verification: z.enum(VERIFICATION_STATUSES),
  email_verified_at: optStamp,
  place_id: z.string(), // the only Google Maps data the engine stores (Maps Platform terms)
  place_id_checked_at: optStamp,
  sources: z.string(), // list of "<source>:<source_record_id>"
  // Scoring (src/score). Every component is logged so outcomes can recalibrate the weights.
  age_est_low: optInt,
  age_est_high: optInt,
  age_est_method: z.string(), // "graduation_year" | "license_issue_year" | "formation_year" | ""
  tenure_years: optNum,
  score: optInt,
  tier: z.enum(TIERS),
  score_components: z.string(), // list of "component=points"
  score_reasons: z.string(), // list of plain-English reasons ("why they look like a seller")
  scored_at: optStamp,
  // Sequence state (src/sending)
  mailbox: z.string(), // the sending mailbox assigned at step 1; follow-ups use the same one
  sequence_step: optInt, // last step drafted or sent (1-3)
  last_touch_at: optStamp,
  next_touch_date: optDate,
  thread_id: z.string(),
  created_at: optStamp,
  updated_at: optStamp,
  notes: z.string(),
});
export type ProspectRow = z.infer<typeof ProspectRowSchema>;

export const TOUCH_STATUSES = ["planned", "drafted", "sent", "failed", "cancelled"] as const;
export const TOUCH_KINDS = ["outreach", "reply"] as const;

/** Every outbound message, in the order made (`touches.csv`). Never edited except to move status forward. */
export const TouchRowSchema = z.object({
  touch_id: z.string().regex(/^T-\d{6,}$/, "T-000001"),
  prospect_id: z.string(),
  kind: z.enum(TOUCH_KINDS),
  step: optInt, // 1-3 for outreach, blank for a reply
  mailbox: z.string(),
  to_email: z.string(),
  subject: z.string(),
  body_sha256: z.string(), // the body itself lives in the outbox file; the hash proves which text went out
  planned_for: optDate,
  status: z.enum(TOUCH_STATUSES),
  mode: z.enum(["draft", "send", ""]),
  message_id: z.string(),
  thread_id: z.string(),
  draft_id: z.string(),
  error: z.string(),
  created_at: optStamp,
  updated_at: optStamp,
});
export type TouchRow = z.infer<typeof TouchRowSchema>;

export const REPLY_CLASSES = [
  "interested", // wants to talk or wants the check
  "question", // asks something before deciding (who are you, how did you get my email, what does it cost)
  "asks_if_ai", // asks whether a person or an AI is writing
  "not_now", // open later; a timeline beyond the horizon
  "not_interested",
  "unsubscribe", // any opt-out request, however worded
  "wrong_person", // not the owner, sold already, retired, deceased
  "referral", // names someone else to talk to
  "auto_reply", // out of office, autoresponder
  "bounce", // delivery failure notice
  "complaint", // hostile, threatens to report as spam
  "other",
] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

/** Every inbound message matched to a prospect (`replies.csv`). */
export const ReplyRowSchema = z.object({
  reply_id: z.string().min(1), // the mailbox's message id
  prospect_id: z.string(), // blank when unmatched
  thread_id: z.string(),
  mailbox: z.string(),
  from_email: z.string(),
  subject: z.string(),
  received_at: optStamp,
  snippet: z.string(), // first 500 characters of the new text (quoted history stripped)
  class: z.enum([...REPLY_CLASSES, ""]),
  classifier: z.enum(["rules", "claude", "manual", ""]),
  opt_out: z.enum(["Y", "N", ""]),
  bounce_type: z.enum(["hard", "soft", ""]),
  processed_at: optStamp,
  response_touch_id: z.string(), // the drafted answer, if any
  error: z.string(),
});
export type ReplyRow = z.infer<typeof ReplyRowSchema>;

export const LEAD_STAGES = [
  "engaged", // a human replied positively or with a question
  "qualifying", // AMB has asked the qualification questions
  "qualified", // revenue, timeline and motivation known and inside the target
  "warm", // qualified and ready for a call: hand off now
  "handed_off", // summary written and given to the advisor
  "meeting", // call or meeting booked (set by the advisor)
  "listed", // engagement or listing signed (set by the advisor)
  "nurture", // not now; check back at nurture_date
  "lost", // not interested or not a fit
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const TIMELINES = ["0-6m", "6-12m", "12-24m", "24m+", "unknown"] as const;
/** Revenue over the last 3 years as the owner describes it; blank until stated. */
export const REVENUE_TRENDS = ["growing", "flat", "declining", ""] as const;
export const MOTIVATIONS = ["retirement", "health", "burnout", "partner_dispute", "new_venture", "relocation", "unsolicited_offer", "estate_planning", "curious", "other", "unknown"] as const;

/** One owner in conversation with AMB (`leads.csv`), keyed by prospect_id. */
export const LeadRowSchema = z.object({
  prospect_id: z.string(),
  stage: z.enum(LEAD_STAGES),
  business_name: z.string(),
  owner_name: z.string(),
  email: z.string(),
  // Facts stated by the owner. Never inferred; blank until the owner says.
  revenue: optNum, // annual revenue, dollars
  revenue_band: z.string(), // the owner's words or band, e.g. "$1M-$2M"
  sde: optNum, // seller's discretionary earnings, dollars
  ebitda: optNum,
  employees: optNum,
  years_owned: optNum,
  owner_hours_per_week: optNum,
  recurring_revenue_pct: optNum,
  top_customer_pct: optNum,
  owns_real_estate: z.enum(["Y", "N", ""]),
  license_holder: z.string(), // who holds the trade licence: "owner" | "employee" | ...
  timeline: z.enum(TIMELINES),
  motivation: z.enum(MOTIVATIONS),
  motivation_detail: z.string(),
  wants_readiness_check: z.enum(["Y", "N", ""]),
  qual_score: optInt, // 0-100 (src/qualify)
  readiness_score: optInt, // 0-100 (src/readiness)
  questions_asked: z.string(), // list of intake question keys already asked, so none is asked twice
  summary: z.string(), // the one-paragraph advisor summary
  next_action: z.string(),
  nurture_date: optDate,
  handed_off_at: optStamp,
  handoff_file: z.string(),
  // Readiness checklist facts stated by the owner (src/readiness/check.ts). Blank until the owner says;
  // appended after the original columns so older leads.csv files read them as blank.
  books_match_returns: z.enum(["Y", "N", ""]), // profit and loss statements match the filed tax returns
  revenue_trend: z.enum(REVENUE_TRENDS), // revenue over the last 3 years, in the owner's words
  manager_in_place: z.enum(["Y", "N", ""]), // a manager or lead person runs day-to-day work
  runs_without_owner: z.enum(["Y", "N", ""]), // the business runs for about 4 weeks without the owner
  lease_years_left: optNum, // years left on the lease, as the owner states it
  // The intake questions offer bands ("$100K to $250K", "10% to 30%"); an owner who answers with a
  // band has stated a band, never a figure, so the band is kept as written (no invented point value).
  sde_band: z.string(),
  recurring_revenue_band: z.string(),
  top_customer_band: z.string(),
  updated_at: optStamp,
});
export type LeadRow = z.infer<typeof LeadRowSchema>;

export const SUPPRESSION_REASONS = ["opt_out", "bounce", "complaint", "do_not_contact", "client", "legal", "wrong_person"] as const;

/**
 * The permanent do-not-contact list (`suppression.csv`). CAN-SPAM opt-outs
 * never expire (15 U.S.C. 7704(a)(4)), so rows are never deleted or purged.
 */
export const SuppressionRowSchema = z.object({
  value: z.string().min(1), // a normalized email, a domain, or a prospect id
  value_type: z.enum(["email", "domain", "prospect"]),
  reason: z.enum(SUPPRESSION_REASONS),
  source: z.string(), // "reply R-...", "manual", "bounce T-..."
  added_at: optStamp,
});
export type SuppressionRow = z.infer<typeof SuppressionRowSchema>;

/** Per-mailbox health counters, appended daily by the sender (`mailbox_log.csv`). */
export const MailboxLogRowSchema = z.object({
  date: optDate,
  mailbox: z.string(),
  sent: optInt,
  drafted: optInt,
  hard_bounces: optInt,
  soft_bounces: optInt,
  complaints: optInt,
  opt_outs: optInt,
  human_replies: optInt,
  paused: z.enum(["Y", "N", ""]),
  pause_reason: z.string(),
});
export type MailboxLogRow = z.infer<typeof MailboxLogRowSchema>;

/** Every lead export to a partner (`exports.csv`); see docs/COMPLIANCE.md before enabling. */
export const ExportRowSchema = z.object({
  export_id: z.string(),
  partner: z.string(),
  prospect_id: z.string(),
  fee: optNum,
  exported_at: optStamp,
  legal_review_ref: z.string(),
});
export type ExportRow = z.infer<typeof ExportRowSchema>;
