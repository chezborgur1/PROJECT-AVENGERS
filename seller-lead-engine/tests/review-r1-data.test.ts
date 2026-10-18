import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enrichContacts } from "../src/contacts/enrich.ts";
import type { ContactRow, EntityRow, ProspectRow } from "../src/domain/schema.ts";
import { lastRecordBoundary } from "../src/sources/csvImport.ts";
import { importDbpr } from "../src/sources/dbpr.ts";
import { buildProspects } from "../src/sources/merge.ts";
import { isPersonName } from "../src/sources/normalize.ts";
import { scoreAll } from "../src/score/score.ts";
import { makeProspect, REPO, tempStores, testConfig, tmpDir } from "./helpers.ts";

// Regression tests for the data and scoring findings in docs/build/REVIEW_R1.md
// (items 26, 27, 30, 31, 32). Each test names its item.

const NOW = new Date("2026-10-18T14:00:00Z");
const HEADER = fs.readFileSync(path.join(REPO, "samples/tampa-bay/dbpr_cilb_licensees.csv"), "utf8").split("\n")[0]!;
const GOOD = `"06","0601","HOLLOWAY, DONALD R","GULFSIDE AIR CONDITIONING & HEATING INC","CAC","4410 N ARMENIA AVENUE","SUITE 3","","TAMPA","FL","33612-4405","39","CAC1814522","Current","Active","06/20/1985","08/14/2024","08/31/2026","","","",""`;

function dbprFile(rows: string[]): string {
  const file = path.join(tmpDir(), "dbpr.csv");
  fs.writeFileSync(file, `${HEADER}\n${rows.join("\n")}\n`);
  return file;
}

describe("item 26: trade names are businesses, not people", () => {
  it("does not read a licensee called 'SUNCOAST AIR CONDITIONING' as a person", () => {
    for (const name of ["SUNCOAST AIR CONDITIONING", "GULF COAST PLUMBING", "ACE ROOFING", "BAYSIDE DENTAL"]) expect(isPersonName(name), name).toBe(false);
    for (const name of ["DONALD R HOLLOWAY", "MASON JAMES", "JOHN PLUMMER"]) expect(isPersonName(name), name).toBe(true);
  });

  it("imports such a DBPR licensee as the business, with no owner named after it", () => {
    const stores = tempStores();
    const file = dbprFile([`"06","0601","SUNCOAST AIRWAYS","","CAC","1 MAIN ST","","","TAMPA","FL","33602","39","CAC1800001","Current","Active","06/20/1990","08/14/2024","08/31/2026","","","",""`]);
    importDbpr(file, stores, { snapshotDate: "2026-10-01" });
    const [lic] = stores.licenses.rows();
    expect(lic).toMatchObject({ business_name: "SUNCOAST AIRWAYS", person_name: "" });
    buildProspects(stores, testConfig(), { now: NOW });
    const p = stores.prospects.rows()[0];
    expect(p?.owner_first_name ?? "").not.toBe("Suncoast");
  });
});

describe("item 27: one unreadable record never blocks the import", () => {
  it("reports a row with a stray quote and imports the rest", () => {
    const stores = tempStores();
    const bad = `"06","0601",""A" PLUS AIR","","CAC","2 MAIN ST","","","TAMPA","FL","33602","39","CAC1800002","Current","Active","06/20/1990","08/14/2024","08/31/2026","","","",""`;
    const r = importDbpr(dbprFile([bad, GOOD]), stores, { snapshotDate: "2026-10-01" });
    expect(r.imported).toBe(1);
    expect(r.invalid.length).toBe(1);
    expect(r.invalid[0]!.error).toMatch(/unreadable CSV record/);
    expect(r.invalid[0]!.line).toBe(2); // the header is line 1
    expect(stores.licenses.rows().map((l) => l.license_number)).toEqual(["CAC1814522"]);
  });
});

describe("item 32: an inch mark does not swallow the rest of the file", () => {
  it("finds record boundaries after an unquoted field with a quote in it", () => {
    const text = 'a,ACME 12" PIPE CO,b\nc,"quoted, field",d\ne,f,g\npartial';
    expect(lastRecordBoundary(text)).toBe(text.lastIndexOf("\n"));
    expect(lastRecordBoundary('x,"open quote\nstill open')).toBe(-1);
    const escaped = 'x,"a ""quoted"" word",y\nz';
    expect(lastRecordBoundary(escaped)).toBe(escaped.indexOf("\n"));
  });
});

describe("item 30: a role-based verdict on a person address waits for the other people", () => {
  it("prefers a real person's address over one the verifier calls role-based", async () => {
    const stores = tempStores();
    const p = makeProspect({ email: "", email_source: "", email_verification: "unverified", owner_first_name: "Zed", owner_last_name: "Nobody" });
    stores.prospects.upsert([p]);
    const c = (email: string): ContactRow => ({ source: "csv", source_record_id: `C-${email}`, business_name: p.business_name, zip: p.zip, first_name: "", last_name: "", role: "", email, email_source: "import", email_source_url: "", website: "", phone: "" });
    stores.contacts.upsert([c("jobs@exampleair.example"), c("john@exampleair.example")]);
    const impl = (async (input: string | URL | Request) => {
      const email = new URL(String(input)).searchParams.get("email") ?? "";
      const status = email.startsWith("jobs@") ? "do_not_mail" : "valid";
      return new Response(JSON.stringify({ status, sub_status: status === "do_not_mail" ? "role_based" : "" }), { status: 200 });
    }) as typeof fetch;
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: async () => ["mx.example"], verifierApiKey: "k", fetchImpl: impl });
    expect(stores.prospects.rows()[0]).toMatchObject({ email: "john@exampleair.example", email_verification: "valid" });
  });
});

describe("item 31: fatigue signals read the entity the merge chose", () => {
  it("uses the active entity's annual report, not a dissolved predecessor's", async () => {
    const stores = tempStores();
    const entity = (id: string, status: string, report: string): EntityRow => {
      const blank = Object.fromEntries(Object.keys(stores.entities.columns.reduce((o, c) => ({ ...o, [c]: "" }), {})).map((k) => [k, ""])) as unknown as EntityRow;
      return { ...blank, source: "sunbiz", source_record_id: id, entity_name: "ABC PLUMBING", state: "FL", status, formation_date: "1995-01-01", last_annual_report_date: report, last_event_date: "", source_snapshot_date: "" };
    };
    stores.entities.upsert([entity("OLD1", "inactive", "2009-04-01"), entity("NEW1", "active", "2026-02-10")]);
    const p: ProspectRow = makeProspect({ status: "new", sources: "sunbiz:OLD1; sunbiz:NEW1" });
    stores.prospects.upsert([p]);
    await scoreAll(stores, testConfig(), { today: "2026-10-18", now: NOW });
    expect(stores.prospects.rows()[0]!.score_reasons).not.toMatch(/No 2026 annual report/);
  });
});
