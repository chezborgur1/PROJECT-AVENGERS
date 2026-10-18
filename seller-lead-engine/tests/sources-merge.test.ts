// Tests for the build step: vertical and metro assignment, owner selection
// (owner titles only; registered agents, qualifiers and company officers are
// never owners), joins by name + zip and DBA, email choice, and idempotency:
// a second build over the same imports changes nothing.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LicenseRow, ProspectRow } from "../src/domain/schema.ts";
import { importCsv } from "../src/sources/csvImport.ts";
import { importDbpr } from "../src/sources/dbpr.ts";
import { assignMetro, assignVertical, buildProspects, isOwnerTitle } from "../src/sources/merge.ts";
import { importSunbiz } from "../src/sources/sunbiz.ts";
import type { Stores } from "../src/store/index.ts";
import { REPO, tempStores, testConfig } from "./helpers.ts";

const SAMPLES = path.join(REPO, "samples/tampa-bay");
const NOW = new Date("2026-10-18T12:00:00Z");
const LATER = new Date("2026-10-25T12:00:00Z");

function sampleStores(): Stores {
  const stores = tempStores();
  const opts = { snapshotDate: "2026-10-01" };
  importSunbiz(path.join(SAMPLES, "sunbiz_cordata.txt"), stores, opts);
  importDbpr(path.join(SAMPLES, "dbpr_cilb_licensees.csv"), stores, opts);
  importCsv("contacts", path.join(SAMPLES, "contacts.csv"), stores, opts);
  importCsv("open_poi", path.join(SAMPLES, "open_poi.csv"), stores, opts);
  return stores;
}

const byName = (stores: Stores, fragment: string): ProspectRow => {
  const p = stores.prospects.rows(true).find((r) => r.business_name.toLowerCase().includes(fragment.toLowerCase()));
  if (!p) throw new Error(`no prospect like ${fragment}`);
  return p;
};

function license(over: Partial<LicenseRow>): LicenseRow {
  return {
    source: "csv", source_record_id: "L-1", license_number: "CAC1", license_type: "Certified Air Conditioning Contractor", license_class: "CAC", status: "active",
    business_name: "", dba_name: "", person_name: "", person_role: "unknown", original_issue_date: "1990-01-01", effective_date: "", expiration_date: "",
    year_graduated: undefined, street: "1 Example St", city: "TAMPA", state: "FL", zip: "33602", county: "Hillsborough", phone: "", source_snapshot_date: "2026-10-01",
    ...over,
  };
}

describe("assignVertical", () => {
  const config = testConfig();
  it("lets a licence code win over the name", () => {
    expect(assignVertical(["Bayshore Plumbing"], ["CAC"], config)).toBe("hvac");
    expect(assignVertical([], ["CFC1425678"], config)).toBe("plumbing"); // prefix of a licence number
    expect(assignVertical([], ["cmc"], config)).toBe("hvac");
  });
  it("falls back to whole-word keywords in the texts", () => {
    expect(assignVertical(["Harbor Mechanical Services Corp"], [], config)).toBe("hvac");
    expect(assignVertical(["hvac_services"], [], config)).toBe("hvac");
    expect(assignVertical(["Certified Plumbing Contractor"], [], config)).toBe("plumbing");
    expect(assignVertical(["Plumbers Supply"], [], config)).toBe("");
    expect(assignVertical(["Certified Roofing Contractor"], ["CCC1330456"], config)).toBe("");
    expect(assignVertical([], [], config)).toBe("");
  });
});

describe("assignMetro", () => {
  const config = testConfig();
  it("matches by county when the county is known", () => {
    expect(assignMetro("Pinellas", "34684", "FL", config)).toBe("tampa_bay");
    expect(assignMetro("PINELLAS COUNTY", "", "fl", config)).toBe("tampa_bay");
    expect(assignMetro("Polk", "33601", "FL", config)).toBe(""); // county decides over a matching zip prefix
  });
  it("falls back to the zip prefix when the county is blank", () => {
    expect(assignMetro("", "33755-1234", "FL", config)).toBe("tampa_bay");
    expect(assignMetro("", "34471", "FL", config)).toBe("");
  });
  it("requires the metro's state", () => {
    expect(assignMetro("Hillsborough", "33602", "GA", config)).toBe("");
    expect(assignMetro("", "33602", "", config)).toBe("tampa_bay");
    expect(assignMetro("", "", "", config)).toBe("");
  });
});

describe("isOwnerTitle", () => {
  it("accepts corporation, LLC and partner owner titles", () => {
    for (const t of ["P", "PRES", "CEO", "D", "DIR", "OWNER", "MGR", "MGRM", "AMBR", "AP", "MBR", "MEMBER", "GP", "PD", "PST", "dp"]) expect(isOwnerTitle(t), t).toBe(true);
  });
  it("rejects vice presidents, secretaries, treasurers and agents", () => {
    for (const t of ["VP", "V", "S", "T", "ST", "C", "R", "RA", "AGENT", ""]) expect(isOwnerTitle(t), t).toBe(false);
  });
});

describe("buildProspects on the Tampa Bay sample", () => {
  const stores = sampleStores();
  const result = buildProspects(stores, testConfig(), { now: NOW });

  it("creates one prospect per business in the metro and verticals, with reasons for the rest", () => {
    expect(result).toMatchObject({ created: 11, updated: 0, unchanged: 0 });
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { reason: expect.stringMatching(/outside every target metro.*Marion/), name: "Orange Blossom Plumbing, Inc." },
        { reason: expect.stringMatching(/CCC1330456.*not in a target vertical/), name: "Bay Area Roofing Specialists Inc" },
      ]),
    );
    expect(result.skipped).toHaveLength(2);
    const rows = stores.prospects.rows(true);
    expect(rows.map((p) => p.prospect_id)).toEqual(Array.from({ length: 11 }, (_, i) => `P-${String(i + 1).padStart(5, "0")}`));
    expect(rows.every((p) => p.status === "new" && p.email_verification === "unverified" && p.created_at === "2026-10-18T12:00:00Z")).toBe(true);
  });

  it("joins licences to entities across spelling differences and keeps the earliest licence", () => {
    const g = byName(stores, "Gulfside");
    expect(g).toMatchObject({
      business_name: "Gulfside Air Conditioning & Heating, Inc.",
      dba_name: "",
      vertical: "hvac",
      metro: "tampa_bay",
      county: "Hillsborough",
      city: "Tampa",
      zip: "33612",
      entity_type: "Florida Profit Corporation",
      entity_status: "active",
      formation_date: "1988-03-14",
      license_numbers: "CAC1814522; CMC1249002",
      license_issue_date: "1985-06-20",
      license_status: "active",
      website: "https://gulfsideair.example",
      phone: "813-555-0142",
    });
    expect(g.sources).toContain("sunbiz:P88000014522");
    expect(g.sources).toContain("dbpr:CMC1249002");
    expect(byName(stores, "Bayshore").license_numbers).toBe("CFC1425678"); // CO. on Sunbiz, COMPANY on the licence
  });

  it("picks the president, not the vice president, and counts both family officers", () => {
    expect(byName(stores, "Gulfside")).toMatchObject({
      owner_name: "Donald R Holloway",
      owner_first_name: "Donald",
      owner_last_name: "Holloway",
      owner_title: "P",
      owner_role: "officer",
      officer_count: 2,
      officers: "Donald R Holloway (P); Kevin D Holloway (VP)",
    });
  });

  it("uses LLC titles and skips company officers and registered-agent firms", () => {
    expect(byName(stores, "Sunrise")).toMatchObject({ owner_name: "Vikram Patel", owner_title: "MGR", owner_role: "principal", officer_count: 2 });
    expect(byName(stores, "Northstar")).toMatchObject({ owner_first_name: "Jean-Paul", owner_title: "MGRM" });
    expect(byName(stores, "Frostline")).toMatchObject({ owner_name: "Brian P Kowalski", owner_title: "AP", officer_count: 1 });
    const pipe = byName(stores, "Pinellas Pipe");
    expect(pipe).toMatchObject({ owner_name: "Thomas W Brennan", owner_title: "P", officer_count: 1, officers: "Thomas W Brennan (P)" });
    expect(pipe.owner_name).not.toMatch(/O'?Connor/i); // the DBPR qualifier is never the owner
    expect(byName(stores, "Clearwater Reliable")).toMatchObject({ owner_title: "PD", license_status: "inactive" });
  });

  it("falls back to a self-proprietor on the licence when there is no entity", () => {
    expect(byName(stores, "Hector")).toMatchObject({ business_name: "Hector's A/C Service", owner_name: "Hector L Morales", owner_role: "owner", owner_title: "", officer_count: 0, entity_status: "", email: "hector@hectorsac.example" });
  });

  it("joins contacts and places through the DBA and places the business by county", () => {
    expect(byName(stores, "Tarpon")).toMatchObject({
      dba_name: "Tarpon Coast Air",
      county: "Pinellas",
      metro: "tampa_bay",
      email: "tarponcoastair.fictional@gmail.com",
      email_source: "manual",
      website: "https://tarponcoastair.example",
    });
  });

  it("prefers the owner's email over another person's, and a person's over a role address", () => {
    expect(byName(stores, "Gulfside")).toMatchObject({ email: "don.holloway@gulfsideair.example", email_source: "website", email_source_url: "https://gulfsideair.example/contact" });
    expect(byName(stores, "Sunrise").email).toBe("vikram@sunrisecomfort.example");
    expect(byName(stores, "Bayshore").email).toBe("info@bayshoreplumbing.example");
  });

  it("builds an entity-only prospect when the name is in a vertical", () => {
    expect(byName(stores, "Harbor Mechanical")).toMatchObject({ vertical: "hvac", entity_status: "inactive", license_numbers: "", license_status: "", owner_name: "Gary L Whitfield", phone: "727-555-0188", county: "" });
  });

  it("is idempotent: a second build changes nothing", () => {
    const before = fs.readFileSync(stores.prospects.file, "utf8");
    const again = buildProspects(stores, testConfig(), { now: LATER });
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 11 });
    expect(fs.readFileSync(stores.prospects.file, "utf8")).toBe(before);
  });
});

describe("buildProspects with existing prospects", () => {
  it("keeps ids, sequence and scoring fields, and the status of contacted prospects", () => {
    const stores = sampleStores();
    buildProspects(stores, testConfig(), { now: NOW });
    const rows = stores.prospects.rows(true);
    const g = rows.find((p) => p.business_name.startsWith("Gulfside"))!;
    const b = rows.find((p) => p.business_name.startsWith("Bayshore"))!;
    const s = rows.find((p) => p.business_name.startsWith("Sunrise"))!;
    const h = rows.find((p) => p.business_name.startsWith("Hector"))!;
    stores.prospects.upsert([
      { ...g, status: "in_sequence", sequence_step: 2, mailbox: "frank@ambadvisory-mail.example", thread_id: "th-1", score: 81, tier: "A", email: "donald@gulfsideair.example", email_verification: "valid" },
      { ...b, status: "dnc", owner_name: "Edited By Hand" },
      { ...s, status: "scored", score: 72, tier: "A", score_components: "age=27; tenure=20" },
      { ...h, status: "excluded", exclude_reason: "tenure under 15 years" },
    ]);
    // A new licence for Sunrise changes its facts; Hector's changes too.
    stores.licenses.upsert([
      license({ source: "dbpr", source_record_id: "CMC1259999", license_number: "CMC1259999", license_class: "CMC", license_type: "Certified Mechanical Contractor", business_name: "SUNRISE COMFORT SYSTEMS LLC", zip: "33511", original_issue_date: "2001-01-01" }),
      license({ source: "dbpr", source_record_id: "CAC1817702", license_number: "CAC1817702", business_name: "HECTOR'S A/C SERVICE", person_name: "MORALES, HECTOR L", person_role: "owner", zip: "33603", original_issue_date: "1997-04-14" }),
    ]);
    const r = buildProspects(stores, testConfig(), { now: LATER });
    expect(r).toMatchObject({ created: 0, updated: 2, unchanged: 9 });
    const after = new Map(stores.prospects.rows(true).map((p) => [p.prospect_id, p]));

    // Contacted: status, sequence fields, score and the verified email survive.
    expect(after.get(g.prospect_id)).toMatchObject({ status: "in_sequence", sequence_step: 2, thread_id: "th-1", score: 81, tier: "A", email: "donald@gulfsideair.example", email_verification: "valid" });
    // Opted out: never touched.
    expect(after.get(b.prospect_id)).toMatchObject({ status: "dnc", owner_name: "Edited By Hand" });
    // Facts changed on a scored prospect: back to new for rescoring, score kept until then.
    expect(after.get(s.prospect_id)).toMatchObject({ status: "new", score: 72, license_issue_date: "2001-01-01", license_numbers: "CMC1259999; CAC1816890", updated_at: "2026-10-25T12:00:00Z", created_at: "2026-10-18T12:00:00Z" });
    expect(after.get(h.prospect_id)).toMatchObject({ status: "new", exclude_reason: "", license_issue_date: "1997-04-14" });

    expect(buildProspects(stores, testConfig(), { now: LATER })).toMatchObject({ created: 0, updated: 0, unchanged: 11 });
  });

  it("fills a blank email from contacts but never replaces one", () => {
    const stores = sampleStores();
    buildProspects(stores, testConfig(), { now: NOW });
    const n = stores.prospects.rows(true).find((p) => p.business_name.startsWith("Northstar"))!;
    stores.prospects.upsert([{ ...n, email: "", email_source: "", email_verification: "unverified" }]);
    expect(buildProspects(stores, testConfig(), { now: LATER }).updated).toBe(1);
    expect(stores.prospects.rows(true).find((p) => p.prospect_id === n.prospect_id)!.email).toBe("jp@northstarmechanical-sample.ca");
  });
});

describe("buildProspects owner rules on hand-made records", () => {
  it("never makes a qualifier or a registered agent the owner", () => {
    const stores = tempStores();
    stores.licenses.upsert([
      license({ source_record_id: "Q-1", license_number: "CAC9000001", business_name: "QUALIFIED AIR INC", person_name: "ROE, RICHARD", person_role: "qualifier" }),
      license({ source_record_id: "Q-2", license_number: "CAC9000002", business_name: "AGENT AIR INC", zip: "33603", person_name: "POE, EDGAR", person_role: "registered_agent" }),
      license({ source_record_id: "Q-3", license_number: "CAC9000003", business_name: "LICENSED AIR INC", zip: "33604", person_name: "DOE, JANE", person_role: "licensee" }),
    ]);
    buildProspects(stores, testConfig(), { now: NOW });
    const owners = Object.fromEntries(stores.prospects.rows(true).map((p) => [p.business_name, [p.owner_name, p.owner_role]]));
    expect(owners).toEqual({ "Qualified Air Inc": ["", ""], "Agent Air Inc": ["", ""], "Licensed Air Inc": ["Jane Doe", "licensee"] });
  });

  it("uses the licence person when every officer is a company or has no owner title", () => {
    const stores = tempStores();
    const blank = Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((i) => [[`officer${i}_name`, ""], [`officer${i}_title`, ""], [`officer${i}_is_person`, ""]]));
    stores.entities.upsert([
      {
        source: "sunbiz", source_record_id: "P1", state: "FL", entity_name: "EXAMPLE PLUMBING INC", entity_type: "", status: "active", formation_date: "1990-01-01",
        principal_street: "1 Example St", principal_city: "TAMPA", principal_state: "FL", principal_zip: "33602", mailing_street: "", mailing_city: "", mailing_state: "", mailing_zip: "",
        registered_agent_name: "", registered_agent_type: "", ...blank,
        officer1_name: "EXAMPLE HOLDINGS LLC", officer1_title: "P", officer1_is_person: "N",
        officer2_name: "DOE, JOHN", officer2_title: "VP", officer2_is_person: "Y",
        officer3_name: "SMITH, AL", officer3_title: "R", officer3_is_person: "Y",
        last_annual_report_date: "", last_event_date: "", fei_number: "", source_snapshot_date: "",
      } as never,
    ]);
    stores.licenses.upsert([license({ license_number: "CFC9000001", license_class: "CFC", license_type: "Certified Plumbing Contractor", business_name: "EXAMPLE PLUMBING, INC", person_name: "ROE, RICHARD", person_role: "licensee" })]);
    buildProspects(stores, testConfig(), { now: NOW });
    expect(stores.prospects.rows(true)[0]).toMatchObject({ owner_name: "Richard Roe", owner_role: "licensee", officer_count: 1, officers: "John Doe (VP)", vertical: "plumbing" });
  });

  it("does nothing on empty imports", () => {
    expect(buildProspects(tempStores(), testConfig(), { now: NOW })).toEqual({ created: 0, updated: 0, unchanged: 0, skipped: [] });
  });
});
