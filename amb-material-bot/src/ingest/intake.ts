// Structured intake facts: the zod schema Claude fills from the notes and
// the intake.json file an advisor can write by hand. Both produce the
// contract's IntakeFacts. Every fact carries provenance; nothing is
// inferred, so a field the notes do not state is null in the wire form and
// undefined in the dataset.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { IntakeFacts, Provenance } from "../domain/financials.ts";

const Evidence = z.enum(["documented", "management_representation"]);

const Prov = z.object({
  source: z.string().describe("File name or 'Intake call <date>'"),
  locator: z.string().nullable().describe("Heading or line the fact sits under"),
  evidence: Evidence,
});

const str = () => z.string().nullable();
const num = () => z.number().nullable();
const int = () => z.number().int().nullable();
const bool = () => z.boolean().nullable();

/** The wire form Claude returns: every key present, unknowns null. */
export const IntakeWireSchema = z.object({
  company: z.object({
    legalName: z.string(),
    tradingName: str(),
    description: str().describe("What the business does, in the notes' words"),
    founded: int(),
    founderBackground: str(),
    headquarters: z.object({ city: z.string(), state: z.string() }).nullable(),
    serviceArea: str(),
    ownership: str(),
    certifications: z.array(z.object({ name: z.string(), since: int(), source: Prov })),
    licenses: z.array(z.object({ name: z.string(), source: Prov })),
    reputation: z.array(z.object({ metric: z.string(), value: z.string(), source: Prov })),
    source: Prov,
  }),
  locations: z.array(
    z.object({
      name: z.string(),
      function: z.string(),
      address: str(),
      sizeSqFt: num(),
      arrangement: z.enum(["leased_from_third_party", "owned_by_seller_offered_for_lease", "owned_by_seller_offered_for_sale", "owned_by_operating_company"]),
      leaseExpiry: str(),
      renewalOptions: str(),
      landlordRelatedParty: bool(),
      source: Prov,
    }),
  ),
  systems: z.array(z.object({ function: z.string(), system: z.string(), note: str(), source: Prov })),
  suppliers: z.array(z.object({ name: z.string(), supplies: z.string(), terms: str(), source: Prov })),
  fleetAndEquipment: z.array(z.object({ item: z.string(), count: num(), ownership: z.string(), note: str(), source: Prov })),
  customerFacts: z.array(z.object({ fact: z.string(), source: Prov })),
  workforce: z.object({
    headcount: num(),
    asOf: str(),
    composition: z.array(z.object({ role: z.string(), count: z.number() })),
    payBasis: str(),
    union: bool(),
    source: Prov,
  }),
  management: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      since: str().describe("'YYYY' or 'YYYY-MM' the person joined"),
      responsibilities: z.array(z.string()),
      postCloseIntent: z.enum(["stays", "undecided", "leaves", "unknown"]),
      source: Prov,
    }),
  ),
  owner: z.object({
    name: z.string(),
    role: z.string(),
    age: int(),
    hoursPerWeek: num(),
    responsibilities: z.array(z.object({ responsibility: z.string(), hoursPerWeek: num(), assumedBy: str(), transitionSupport: str(), source: Prov })),
    transition: z.object({ months: num(), basis: str(), description: z.string(), source: Prov }),
    source: Prov,
  }),
  growthLevers: z.array(z.object({ lever: z.string(), baseline: str(), target: str(), mechanism: z.string(), proofPoint: str(), source: Prov })),
  reasonForSale: z.object({ text: z.string(), source: Prov }),
  transaction: z.object({
    dealFormPreference: z.enum(["asset", "equity", "either"]).nullable(),
    timing: str(),
    keepName: bool(),
    keepEmployees: bool(),
    sellerFinancing: str(),
    replacementSalary: z.object({ amount: z.number(), source: Prov }).nullable(),
    notes: z.array(z.object({ text: z.string(), source: Prov })),
  }),
  milestones: z.array(z.object({ year: z.number().int(), event: z.string(), effect: str(), source: Prov })),
  competitors: z.array(z.object({ name: z.string(), type: z.enum(["national", "regional", "local"]), positioning: z.string(), source: Prov })),
  marketInputs: z.array(z.object({ metric: z.string(), value: z.string(), source: Prov })),
});
export type IntakeWire = z.infer<typeof IntakeWireSchema>;

/** Revenue-line facts the CIM prints beside each service line; the account must match the P&L export. */
const RevenueLineFactSchema = z.object({
  account: z.string(),
  label: str(),
  recurring: bool(),
  whatTheCustomerBuys: str(),
  pricingBasis: str(),
});
export type RevenueLineFact = z.infer<typeof RevenueLineFactSchema>;

/**
 * intake.json: the wire shape, where any nullable key, any list and any
 * item's `source` may be left out, plus a file-level default provenance and
 * two things the notes describe that live outside IntakeFacts.
 */
export const IntakeFileSchema = IntakeWireSchema.extend({
  source: str().describe("Default provenance for every item without its own"),
  evidence: Evidence.nullable(),
  revenueLines: z.array(RevenueLineFactSchema),
  customerTerm: z.enum(["Customer", "Client"]).nullable(),
});

/**
 * Walk a schema and fill what a hand-written file may omit: null for a
 * nullable key, [] for a list, the default provenance for a missing or
 * partial `source`. Anything else missing is left for validation to report.
 */
function fillMissing(schema: z.ZodType, value: unknown, prov: Provenance): unknown {
  const def = (schema as { def: { type: string } }).def;
  if (def.type === "nullable") {
    if (value === undefined || value === null) return null;
    return fillMissing((schema as z.ZodNullable<z.ZodType>).unwrap(), value, prov);
  }
  if (def.type === "array") {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return value;
    return value.map((v) => fillMissing((schema as z.ZodArray<z.ZodType>).element, v, prov));
  }
  if (def.type === "object") {
    if (value === undefined || value === null || typeof value !== "object") return value;
    const shape = (schema as z.ZodObject).shape as Record<string, z.ZodType>;
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(shape)) {
      const subDef = (sub as { def: { type: string } }).def;
      // A provenance may be left out entirely or given as just a locator; the file default fills the rest.
      const value = key === "source" && subDef.type === "object" ? { ...prov, ...((out[key] as Record<string, unknown> | undefined) ?? {}) } : out[key];
      out[key] = fillMissing(sub, value, prov);
    }
    return out;
  }
  return value;
}

/** Nulls become undefined and disappear, so consumers see the contract's optional fields. */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      out[k] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}

export function toIntakeFacts(wire: IntakeWire): IntakeFacts {
  return stripNulls(wire) as unknown as IntakeFacts;
}

export interface LoadedIntake {
  facts: IntakeFacts;
  revenueLines: RevenueLineFact[];
  customerTerm?: "Customer" | "Client";
}

/** Read intake.json; `businessName` fills the legal name when the file leaves it out. */
export function loadIntakeFile(file: string, businessName: string): LoadedIntake {
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const name = path.basename(file);
  const prov: Provenance = {
    source: typeof raw.source === "string" ? raw.source : name,
    evidence: raw.evidence === "documented" ? "documented" : "management_representation",
  };
  const company = (raw.company as Record<string, unknown> | undefined) ?? {};
  // Blocks with nothing required inside may be left out; the owner and the reason for sale may not.
  const filled = fillMissing(IntakeFileSchema, { workforce: {}, transaction: {}, ...raw, company: { legalName: businessName, ...company } }, prov);
  const parsed = IntakeFileSchema.safeParse(filled);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`${name} does not match the intake facts schema: ${issues.join("; ")}`);
  }
  const { source: _s, evidence: _e, revenueLines, customerTerm, ...facts } = parsed.data;
  return { facts: toIntakeFacts(facts), revenueLines: stripNulls(revenueLines), customerTerm: customerTerm ?? undefined };
}
