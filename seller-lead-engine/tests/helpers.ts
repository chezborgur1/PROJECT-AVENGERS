import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseConfig, type EngineConfig } from "../src/config.ts";
import { ProspectRowSchema, type LeadRow, type ProspectRow } from "../src/domain/schema.ts";
import { openStores, type Stores } from "../src/store/index.ts";

export const REPO = path.resolve(import.meta.dirname, "..");

export function tmpDir(prefix = "lead-engine-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Fresh stores in a temp data folder. */
export function tempStores(): Stores {
  return openStores(tmpDir());
}

/** A complete, valid config for tests: one Tampa Bay metro, HVAC and plumbing, two mailboxes on one sending domain. */
export function testConfig(overrides: Record<string, unknown> = {}): EngineConfig {
  return parseConfig({
    firm: {
      postal_address: "100 Example Street, Suite 200, Tampa, FL 33602",
      phone: "813.364.2178",
    },
    mailboxes: [
      { email: "frank@ambadvisory-mail.example", sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01" },
      { email: "frank.e@ambadvisory-mail.example", sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01" },
    ],
    licensed_states: ["FL"],
    licensing_signoff: "Test counsel, 2026-10-01",
    verticals: {
      hvac: { noun: "HVAC company", keywords: ["air conditioning", "hvac", "heating", "cooling", "mechanical"], license_codes: ["CAC", "CMC", "RA"], prior: 7, multiples_key: "hvac" },
      plumbing: { noun: "plumbing company", keywords: ["plumbing", "plumber"], license_codes: ["CFC", "RF"], prior: 6, multiples_key: "plumbing" },
    },
    metros: {
      tampa_bay: { name: "Tampa Bay", state: "FL", counties: ["Hillsborough", "Pinellas", "Pasco"], zip_prefixes: ["335", "336", "337"], time_zone: "America/New_York" },
    },
    targeting: { exclude_name_patterns: ["one hour heating", "service experts", "aire serv"] },
    ...overrides,
  });
}

let seq = 0;
/** A valid prospect row with sensible defaults: a 30-year-old Tampa HVAC company, scored tier A, verified email. */
export function makeProspect(overrides: Partial<ProspectRow> = {}): ProspectRow {
  seq++;
  const id = overrides.prospect_id ?? `P-${String(seq).padStart(5, "0")}`;
  const base: Record<string, string> = Object.fromEntries(Object.keys(ProspectRowSchema.shape).map((k) => [k, ""]));
  const row = ProspectRowSchema.parse({
    ...base,
    prospect_id: id,
    status: "scored",
    business_name: `Example Air ${seq} Inc`,
    vertical: "hvac",
    street: `${100 + seq} Example Ave`,
    city: "Tampa",
    state: "FL",
    zip: "33602",
    county: "Hillsborough",
    metro: "tampa_bay",
    entity_type: "Florida Profit Corporation",
    entity_status: "active",
    formation_date: "1996-03-01",
    license_numbers: `CAC18${String(seq).padStart(5, "0")}`,
    license_types: "Certified Air Conditioning Contractor",
    license_issue_date: "1994-06-15",
    license_status: "active",
    officer_count: "1",
    officers: "JOHN EXAMPLE (P)",
    owner_name: "John Example",
    owner_first_name: "John",
    owner_last_name: "Example",
    owner_title: "P",
    owner_role: "officer",
    email: `john${seq}@exampleair.example`,
    email_source: "website",
    email_verification: "valid",
    sources: `sunbiz:F9600000${seq}`,
    score: "78",
    tier: "A",
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
  });
  return { ...row, ...overrides, prospect_id: id };
}

/** A blank lead for a prospect. */
export function makeLead(p: ProspectRow, overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    prospect_id: p.prospect_id,
    stage: "engaged",
    business_name: p.business_name,
    owner_name: p.owner_name,
    email: p.email,
    revenue: undefined,
    revenue_band: "",
    sde: undefined,
    ebitda: undefined,
    employees: undefined,
    years_owned: undefined,
    owner_hours_per_week: undefined,
    recurring_revenue_pct: undefined,
    top_customer_pct: undefined,
    owns_real_estate: "",
    license_holder: "",
    timeline: "unknown",
    motivation: "unknown",
    motivation_detail: "",
    wants_readiness_check: "",
    qual_score: undefined,
    readiness_score: undefined,
    questions_asked: "",
    summary: "",
    next_action: "",
    nurture_date: "",
    handed_off_at: "",
    handoff_file: "",
    books_match_returns: "",
    revenue_trend: "",
    manager_in_place: "",
    runs_without_owner: "",
    lease_years_left: undefined,
    sde_band: "",
    recurring_revenue_band: "",
    top_customer_band: "",
    updated_at: "",
    ...overrides,
  };
}

/** Runs `fn` with no Claude credentials in the environment. */
export async function offline<T>(fn: () => Promise<T> | T): Promise<T> {
  const saved = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    return await fn();
  } finally {
    if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
  }
}
