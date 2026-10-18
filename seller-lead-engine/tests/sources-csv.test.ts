// Tests for canonical CSV imports and the state and open-POI header presets:
// runtime header mapping, virtual columns, person roles (RMEs and qualifiers
// are never owners), id prefixes, chunked parsing and loud failures.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CSV_PRESETS, forEachCsvRecord, importCsv, mapHeaders, mapPersonRole, normalizeHeader, normalizeState } from "../src/sources/csvImport.ts";
import { REPO, tempStores, tmpDir } from "./helpers.ts";

const SAMPLES = path.join(REPO, "samples/tampa-bay");

function writeCsv(text: string, name = "in.csv"): string {
  const file = path.join(tmpDir(), name);
  fs.writeFileSync(file, text);
  return file;
}

describe("canonical presets", () => {
  it("imports the sample contacts and open POI files", () => {
    const stores = tempStores();
    expect(importCsv("contacts", path.join(SAMPLES, "contacts.csv"), stores, { snapshotDate: "2026-10-01" })).toMatchObject({ kind: "csv:contacts", read: 13, imported: 13, invalid: [] });
    expect(importCsv("open_poi", path.join(SAMPLES, "open_poi.csv"), stores, { snapshotDate: "2026-10-01" })).toMatchObject({ read: 9, imported: 9, invalid: [] });
    const contacts = stores.contacts.rows(true);
    expect(contacts.find((c) => c.source_record_id === "C-TB-0008")).toMatchObject({ business_name: "Tarpon Coast Air", email: "tarponcoastair.fictional@gmail.com", email_source: "manual" });
    expect(stores.pois.rows(true).find((p) => p.source_record_id === "fsq-tb-0004")).toMatchObject({ date_closed: "2021-06-30", data_license: "Apache-2.0" });
  });

  it("keeps canonical ids, lower-cases emails and generates a stable id when none is given", () => {
    const text = ["business_name,zip,first_name,last_name,email", "Doe Air,33602-1111,Jane,Doe,Jane.Doe@DoeAir.example"].join("\n");
    const stores = tempStores();
    importCsv("contacts", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    importCsv("contacts", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    const rows = stores.contacts.rows(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "csv", email_source: "import", email: "jane.doe@doeair.example", zip: "33602" });
    expect(rows[0]!.source_record_id).toMatch(/^c-[0-9a-f]{12}$/);
  });

  it("imports canonical entity rows and maps the person flag", () => {
    const text = [
      "source,source_record_id,state,entity_name,status,formation_date,principal_zip,officer1_name,officer1_title,officer1_is_person",
      "csv,E-1,FL,Doe Air Inc,Active,06/15/1999,33602,\"DOE, JANE\",P,yes",
    ].join("\n");
    const stores = tempStores();
    importCsv("entities", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(stores.entities.rows(true)[0]).toMatchObject({ status: "active", formation_date: "1999-06-15", officer1_is_person: "Y", source_snapshot_date: "2026-10-01" });
  });

  it("reports a row with a bad date or enum by line and keeps the rest", () => {
    const text = [
      "source,source_record_id,license_number,business_name,person_role,original_issue_date",
      "csv,L-1,1,Doe Air,licensee,2001-01-01",
      "csv,L-2,2,Roe Air,licensee,31/31/2001",
      "csv,L-3,3,Poe Air,overlord,2001-01-01",
    ].join("\n");
    const stores = tempStores();
    const r = importCsv("licenses", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(r.imported).toBe(2);
    expect(r.invalid).toEqual([{ line: 3, error: expect.stringContaining("original_issue_date") }]);
    // An unrecognised role is kept as "unknown", never promoted to owner.
    expect(stores.licenses.rows().find((l) => l.source_record_id === "L-3")?.person_role).toBe("unknown");
  });
});

describe("state presets", () => {
  it("tdlr splits 'CITY, STATE ZIP' and records the person as a licensee", () => {
    const text = [
      "LICENSE TYPE,LICENSE NUMBER,LICENSE EXPIRATION DATE (MMDDCCYY),COUNTY,NAME,BUSINESS NAME,BUSINESS ADDRESS-LINE1,BUSINESS ADDRESS-LINE2,\"BUSINESS CITY, STATE ZIP\",BUSINESS PHONE,LICENSE SUBTYPE",
      'A/C Contractor,TACLA00012345C,09302027,TRAVIS,"DOE, JANE",DOE COOLING LLC,100 EXAMPLE ST,STE 5,"AUSTIN, TX 78701-1234",512.555.0100,Class A',
    ].join("\n");
    const stores = tempStores();
    const r = importCsv("tdlr", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(r.invalid).toEqual([]);
    expect(stores.licenses.rows(true)[0]).toMatchObject({
      source_record_id: "tdlr-TACLA00012345C",
      license_number: "TACLA00012345C",
      license_type: "A/C Contractor",
      license_class: "Class A",
      person_name: "DOE, JANE",
      person_role: "licensee",
      business_name: "DOE COOLING LLC",
      street: "100 EXAMPLE ST STE 5",
      city: "AUSTIN",
      state: "TX",
      zip: "78701",
      expiration_date: "2027-09-30",
      phone: "512-555-0100",
      status: "active",
    });
  });

  it("cslb maps an RME to qualifier and a sole owner to owner", () => {
    const text = [
      "LicenseNo,BusinessName,Classifications(s),PrimaryStatus,City,State,ZIPCode,IssueDate,ExpirationDate,PersonnelName,Title,UnusedColumn",
      "1012345,DOE MECHANICAL INC,C20,CLEAR,FRESNO,CA,93721,03/04/1990,03/31/2027,\"ROE, RICHARD\",RME,x",
      "1012346,POE HEATING,C20,CLEAR,FRESNO,CA,93721,03/04/1992,03/31/2027,\"POE, EDGAR\",SOLE OWNER,x",
    ].join("\n");
    const stores = tempStores();
    importCsv("cslb", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    const rows = stores.licenses.rows(true);
    expect(rows.map((l) => [l.source_record_id, l.person_role, l.status, l.license_class, l.original_issue_date])).toEqual([
      ["cslb-1012345", "qualifier", "active", "C20", "1990-03-04"],
      ["cslb-1012346", "owner", "active", "C20", "1992-03-04"],
    ]);
  });

  it("tsbde joins name parts and keeps the graduation year", () => {
    const text = ["LIC_NBR,LAST_NME,FIRST_NME,MIDDLE_NME,CITY,STATE,ZIP,LIC_ORIG_DTE,YEAR_GRADUATED,LIC_STA_DESC", "12345,DOE,JANE,Q,HOUSTON,TX,77002,06/01/1988,1987,Active"].join("\n");
    const stores = tempStores();
    importCsv("tsbde", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(stores.licenses.rows(true)[0]).toMatchObject({ person_name: "DOE, JANE Q", license_type: "Dentist", year_graduated: 1987, original_issue_date: "1988-06-01", person_role: "licensee" });
  });

  it("wa_lni records the primary principal as a principal", () => {
    const text = ["businessname,contractorlicensenumber,contractorlicensetypecodedesc,primaryprincipalname,city,state,zip,licenseeffectivedate,contractorlicensestatus", "DOE PLUMBING LLC,DOEPL*123AB,Specialty,JANE DOE,SPOKANE,WA,99201,2004-05-06T00:00:00.000,ACTIVE"].join("\n");
    const stores = tempStores();
    importCsv("wa_lni", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(stores.licenses.rows(true)[0]).toMatchObject({ source_record_id: "wa_lni-DOEPL*123AB", person_role: "principal", effective_date: "2004-05-06", status: "active" });
  });

  it("overture reads list cells, full state names and the default licence", () => {
    const text = ["id,names.primary,basic_category,websites,phones,addresses.freeform,addresses.locality,addresses.region,addresses.postcode", 'abc-1,Doe Air,hvac_services,"[""https://doeair.example"",""https://other.example""]",[+18135550100],100 Example St,Tampa,Florida,33602'].join("\n");
    const stores = tempStores();
    importCsv("overture", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(stores.pois.rows(true)[0]).toMatchObject({ source_record_id: "overture-abc-1", source: "open_poi", website: "https://doeair.example", phone: "813-555-0100", state: "FL", data_license: "CDLA-Permissive-2.0" });
  });

  it("foursquare turns a place email into a contacts row", () => {
    const text = ["fsq_place_id,name,fsq_category_labels,website,tel,email,address,locality,region,postcode,date_refreshed,date_closed", "f1,Doe Air,[Business and Professional Services > Home Improvement Service > HVAC Service],https://doeair.example,(813) 555-0100,Owner@DoeAir.example,100 Example St,Tampa,FL,33602,2026-09-01,"].join("\n");
    const stores = tempStores();
    importCsv("foursquare", writeCsv(text), stores, { snapshotDate: "2026-10-01" });
    expect(stores.pois.rows(true)[0]).toMatchObject({ basic_category: "HVAC Service", data_license: "Apache-2.0" });
    expect(stores.contacts.rows(true)[0]).toMatchObject({ source_record_id: "foursquare-f1-email", business_name: "Doe Air", zip: "33602", email: "owner@doeair.example", source: "open_poi" });
  });

  it("fails loudly when required columns are missing, naming unknown headers", () => {
    const file = writeCsv("Lic,Who,Where\n1,Jane,Tampa\n");
    expect(() => importCsv("tdlr", file, tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/required column\(s\) not found: license_number.*Unrecognised headers: Lic, Who, Where/s);
    expect(() => importCsv("nope", file, tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/Unknown CSV preset "nope"/);
    expect(() => importCsv("contacts", writeCsv(""), tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/empty/);
    expect(() => importCsv("contacts", "/no/such.csv", tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/not found/);
  });

  it("has every preset the design names", () => {
    expect(Object.keys(CSV_PRESETS)).toEqual(expect.arrayContaining(["entities", "licenses", "contacts", "open_poi", "cslb", "tdlr", "tsbde", "wa_lni", "overture", "foursquare"]));
  });
});

describe("helpers", () => {
  it("maps headers by alias in priority order, ignoring case and punctuation", () => {
    expect(normalizeHeader("﻿Original Licensure-Date")).toBe("originallicensuredate");
    const { index, unknown } = mapHeaders(["Zip Code", "Name", "Other", "zip"], { zip: ["zip", "Zip Code"], name: ["NAME"] });
    expect(index).toEqual({ zip: 3, name: 1 });
    expect(unknown).toEqual(["Zip Code", "Other"]);
  });

  it("maps person titles to roles, keeping qualifiers and agents away from owner", () => {
    expect(mapPersonRole("RME")).toBe("qualifier");
    expect(mapPersonRole("Qualifying Agent")).toBe("qualifier");
    expect(mapPersonRole("Registered Agent")).toBe("registered_agent");
    expect(mapPersonRole("Sole Owner")).toBe("owner");
    expect(mapPersonRole("General Partner")).toBe("principal");
    expect(mapPersonRole("RMO")).toBe("officer");
    expect(mapPersonRole("CEO/PRES")).toBe("officer");
    expect(mapPersonRole("authorized_official")).toBe("authorized_official");
    expect(mapPersonRole("", "licensee")).toBe("licensee");
    expect(mapPersonRole("Dog walker", "licensee")).toBe("licensee");
    expect(normalizeState("Florida")).toBe("FL");
    expect(normalizeState("tx")).toBe("TX");
  });

  it("parses records across chunk boundaries, including quoted newlines and multi-byte text", () => {
    const text = 'a,b\n1,"two\nlines"\n3,"café, ""quoted"""\n\n5,six\n';
    const file = writeCsv(text);
    const seen: [string[], number][] = [];
    forEachCsvRecord(file, (cells, line) => seen.push([cells, line]), { chunkBytes: 3 });
    expect(seen).toEqual([
      [["a", "b"], 1],
      [["1", "two\nlines"], 3],
      [["3", 'café, "quoted"'], 4],
      [["5", "six"], 6],
    ]);
  });
});
