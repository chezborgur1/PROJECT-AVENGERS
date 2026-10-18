import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { US_STATES } from "./domain/schema.ts";

// The engine's settings: who sends, from where, to whom, how fast, and the
// legal facts every email must carry. Lives in config/engine.config.json
// (git-ignored; start from config/engine.config.example.json). Secrets stay
// in .env. A missing or invalid field is an error naming the field: the
// engine never guesses a sender, an address or a licensed state.

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM, 24-hour");
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const State = z.enum(US_STATES);

export const MailboxSchema = z.object({
  /** The sending address, at a separate sending domain registered openly to AMB. */
  email: z.string().email(),
  /** A real AMB person (never a persona): CAN-SPAM header accuracy and the FTC Impersonation Rule. */
  sender_name: z.string().min(1),
  sender_title: z.string(),
  /** First day warm-up began. Cold sends start after `sending.warmup_weeks`. */
  warmup_started: ISO_DATE,
  /** Overrides the ramp's cap for this mailbox when lower. */
  max_per_day: z.number().int().positive().optional(),
  /** Paused mailboxes send nothing; the sender sets this when a circuit breaker trips. */
  paused: z.boolean().default(false),
});
export type Mailbox = z.infer<typeof MailboxSchema>;

export const VerticalSchema = z.object({
  /** Plain-English noun for emails: "HVAC company", "dental practice". */
  noun: z.string().min(1),
  /** Lower-case keywords matched against licence types, entity names and POI categories. */
  keywords: z.array(z.string()).min(1),
  /** Licence type or class codes that identify the vertical (e.g. DBPR "CAC" for Class A air conditioning). */
  license_codes: z.array(z.string()).default([]),
  /** 0-10: the vertical-and-metro prior in the score (share of owners 55+, buyer demand). */
  prior: z.number().min(0).max(10).default(5),
  /** Key into reference/multiples.json for the readiness check's rough range. */
  multiples_key: z.string(),
});
export type Vertical = z.infer<typeof VerticalSchema>;

export const MetroSchema = z.object({
  name: z.string().min(1),
  state: State,
  /** County names (no "County" suffix), matched case-insensitively. */
  counties: z.array(z.string()).default([]),
  /** 5-digit zip prefixes or full zips, used when county is missing. */
  zip_prefixes: z.array(z.string()).default([]),
  /** IANA time zone for the send window. */
  time_zone: z.string().default("America/New_York"),
});
export type Metro = z.infer<typeof MetroSchema>;

export const EngineConfigSchema = z.object({
  firm: z.object({
    /** First mention in body copy (HOUSE_STYLE: "AMB Advisory Services", then "AMB Advisory"). */
    name: z.string().default("AMB Advisory Services"),
    short_name: z.string().default("AMB Advisory"),
    /** Legal name for the CAN-SPAM footer. */
    legal_name: z.string().default("AMB Advisory Services LLC"),
    website: z.string().default("ambadvisoryservices.com"),
    phone: z.string().default(""),
    /**
     * A valid physical postal address (16 CFR 316.2(p)): the current street
     * address, or a USPS PO box or CMRA private mailbox accurately registered
     * to AMB. Required: the footer lint refuses to send without it.
     */
    postal_address: z.string(),
  }),
  mailboxes: z.array(MailboxSchema),
  /**
   * States where AMB may solicit sellers. Soliciting business sellers for
   * compensation is licensed brokerage in Florida (475.01), California
   * (B&P 10131) and other states, so this list must equal the states where
   * AMB holds the licence or none is needed, signed off by counsel
   * (docs/COMPLIANCE.md). Empty means nothing is sent.
   */
  licensed_states: z.array(State).default([]),
  licensing_signoff: z.string().default(""), // who signed off and when, e.g. "J. Smith, counsel, 2026-10-20"
  verticals: z.record(z.string(), VerticalSchema),
  metros: z.record(z.string(), MetroSchema),
  targeting: z.object({
    min_tenure_years: z.number().default(15),
    /** Tiers that may enter the sequence. */
    send_tiers: z.array(z.enum(["A", "B", "C"])).default(["A", "B"]),
    tier_a_min: z.number().default(70),
    tier_b_min: z.number().default(50),
    /** Business-name fragments that mark a franchise, chain or platform-owned company (knock-out). */
    exclude_name_patterns: z.array(z.string()).default([]),
    /** Prospect emails or domains already AMB clients or in another process. */
    exclude_domains: z.array(z.string()).default([]),
  }).prefault({}),
  sending: z.object({
    /** "draft": every message becomes a mailbox draft a person sends. "send": the engine sends. */
    mode: z.enum(["draft", "send"]).default("draft"),
    /** "outbox": write messages to data/outbox for the Claude Gmail connector. "gmail_api": call the Gmail API directly. */
    transport: z.enum(["outbox", "gmail_api"]).default("outbox"),
    warmup_weeks: z.number().int().min(0).default(3),
    /** Cold emails per mailbox per day by week of cold sending (week 1 = first week after warm-up). The last entry holds. */
    ramp: z.array(z.number().int().nonnegative()).default([5, 10, 15, 20]),
    /** Hard ceiling per mailbox per day, follow-ups included. */
    max_per_mailbox_per_day: z.number().int().positive().default(25),
    /** Hard ceiling per sending domain per day across its mailboxes, far below Gmail's 5,000 bulk-sender line. */
    max_per_domain_per_day: z.number().int().positive().default(75),
    /** Business days after step 1 for step 2, and after step 2 for step 3. */
    follow_up_gaps: z.array(z.number().int().positive()).default([4, 6]),
    /** Recipient-local send window and weekdays (1 = Monday ... 5 = Friday). */
    window_start: HHMM.default("08:00"),
    window_end: HHMM.default("11:00"),
    send_days: z.array(z.number().int().min(1).max(7)).default([2, 3, 4]),
    /** Dates nothing is sent (federal holidays and the year-end lull). */
    holidays: z.array(ISO_DATE).default([]),
    /** Optional one-click unsubscribe endpoint (RFC 8058). Without it the List-Unsubscribe header carries the mailto only. */
    unsubscribe_url: z.string().default(""),
    /** Mailbox that receives "unsubscribe" mailto requests; defaults to each sending mailbox. Must be one of `mailboxes` (preflight refuses others: nothing else is read). */
    unsubscribe_mailbox: z.string().default(""),
    /** Share of a day's new step-1 sends that may go to catch-all addresses. */
    max_catch_all_share: z.number().min(0).max(1).default(0.1),
  }).prefault({}),
  guardrails: z.object({
    /** Pause a mailbox when hard bounces over the last `bounce_window_days` reach this share of sends. */
    max_bounce_rate: z.number().default(0.02),
    bounce_window_days: z.number().int().default(14),
    /** Pause a mailbox after this many hard bounces in one day. */
    max_hard_bounces_per_day: z.number().int().default(3),
    /** Pause everything on any spam complaint until a person clears it. */
    pause_on_complaint: z.boolean().default(true),
    /** Pause new step-1 sends when opt-outs over the last 100 sends exceed this share. */
    max_opt_out_rate: z.number().default(0.05),
  }).prefault({}),
  qualify: z.object({
    /** Annual revenue range AMB serves (dollars). */
    min_revenue: z.number().default(500_000),
    max_revenue: z.number().default(10_000_000),
    min_sde: z.number().default(100_000),
    /** Lead becomes warm at or above this qualification score. */
    warm_score: z.number().default(60),
    /** Months ahead that count as an active timeline. */
    horizon_months: z.number().default(24),
    /** AI replies are always drafts for a person to approve, whatever `sending.mode` says. */
    auto_send_replies: z.literal(false).default(false),
  }).prefault({}),
  readiness: z.object({
    /** Include a rough valuation range only from multiples rows marked verified, and only below this SDE. */
    include_range: z.boolean().default(true),
    max_sde_for_range: z.number().default(1_000_000),
  }).prefault({}),
  lead_sales: z.object({
    /** Selling leads to partner brokers. Off until counsel signs off (docs/COMPLIANCE.md, licensing and data-broker rules). */
    enabled: z.boolean().default(false),
    legal_review_ref: z.string().default(""),
    flat_fee: z.number().default(0),
  }).prefault({}),
  handoff: z.object({
    /** Advisor who receives warm sellers. */
    advisor_name: z.string().default(""),
    advisor_email: z.string().default(""),
  }).prefault({}),
});
export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export class ConfigError extends Error {}

/** Read and validate the config file. Throws a ConfigError naming every bad field. */
export function loadConfig(file: string): EngineConfig {
  if (!fs.existsSync(file)) {
    throw new ConfigError(`Config not found: ${file}. Start one with: cp config/engine.config.example.json config/engine.config.json`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new ConfigError(`${path.basename(file)} is not valid JSON: ${(err as Error).message}`);
  }
  return parseConfig(raw, path.basename(file));
}

export function parseConfig(raw: unknown, label = "config"): EngineConfig {
  const result = EngineConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new ConfigError(`${label} is invalid: ${issues}`);
  }
  return result.data;
}

/** The sending domain of a mailbox address. */
export function mailboxDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/** Settings from the environment (secrets and paths). */
export interface EngineEnv {
  configFile: string;
  dataDir: string;
  placesApiKey: string;
  verifierApiKey: string; // ZeroBounce-compatible email verifier
  gmailTokensFile: string;
}

export function engineEnv(root: string, env: NodeJS.ProcessEnv = process.env): EngineEnv {
  return {
    configFile: path.resolve(root, env.LEAD_ENGINE_CONFIG || "config/engine.config.json"),
    dataDir: path.resolve(root, env.LEAD_ENGINE_DATA_DIR || "data"),
    placesApiKey: env.GOOGLE_PLACES_API_KEY || "",
    verifierApiKey: env.EMAIL_VERIFIER_API_KEY || "",
    gmailTokensFile: path.resolve(root, env.GMAIL_TOKENS_FILE || ".gmail-tokens.json"),
  };
}
