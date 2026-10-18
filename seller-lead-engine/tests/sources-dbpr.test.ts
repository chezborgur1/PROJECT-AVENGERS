// Tests for the Florida DBPR licensee importer: header variants mapped at
// runtime, the headerless positional layout, who the licence person is
// (licensee, hired qualifier, self-proprietor owner), statuses, county codes
// and the loud failure when required columns are missing.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DBPR_POSITIONAL_COLUMNS, FL_COUNTY_CODES, importDbpr } from "../src/sources/dbpr.ts";
import { REPO, tempStores, tmpDir } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/tampa-bay/dbpr_cilb_licensees.csv");

function writeCsv(text: string): string {
  const file = path.join(tmpDir(), "dbpr.csv");
  fs.writeFileSync(file, text);
  return file;
}

describe("importDbpr on the sample", () => {
  const stores = tempStores();
  const result = importDbpr(SAMPLE, stores, { snapshotDate: "2026-10-01" });
  const byNumber = new Map(stores.licenses.rows(true).map((l) => [l.license_number, l]));

  it("imports every row", () => {
    expect(result).toMatchObject({ kind: "dbpr", read: 13, imported: 13, skipped: 0, invalid: [] });
  });

  it("records a person licensee trading under a DBA as the licensee of that business", () => {
    expect(byNumber.get("CAC1814522")).toMatchObject({
      source: "dbpr",
      source_record_id: "CAC1814522",
      license_type: "Certified Air Conditioning Contractor",
      license_class: "CAC",
      status: "active",
      business_name: "GULFSIDE AIR CONDITIONING & HEATING INC",
      dba_name: "",
      person_name: "HOLLOWAY, DONALD R",
      person_role: "licensee",
      original_issue_date: "1985-06-20",
      effective_date: "2024-08-14",
      expiration_date: "2026-08-31",
      street: "4410 N ARMENIA AVENUE SUITE 3",
      zip: "33612",
      county: "Hillsborough",
      source_snapshot_date: "2026-10-01",
    });
  });

  it("records a licensee who qualifies someone else's business as a qualifier, never an owner", () => {
    expect(byNumber.get("CFC1427001")).toMatchObject({ business_name: "PINELLAS PIPE WORKS INC", person_name: "OCONNOR, SEAN P", person_role: "qualifier", county: "Pinellas" });
  });

  it("records a self-proprietor as the owner", () => {
    expect(byNumber.get("CAC1817702")).toMatchObject({ business_name: "HECTOR'S A/C SERVICE", person_role: "owner", person_name: "MORALES, HECTOR L" });
  });

  it("keeps a company licensee as the business with its DBA", () => {
    expect(byNumber.get("CAC1815120")).toMatchObject({ business_name: "TARPON COAST ENTERPRISES INC", dba_name: "TARPON COAST AIR", person_name: "", person_role: "unknown" });
  });

  it("marks Current but Inactive licences inactive and maps county codes", () => {
    expect(byNumber.get("CFC1428888")?.status).toBe("inactive");
    expect(byNumber.get("CFC1424410")?.county).toBe("Marion");
    expect(byNumber.get("CAC1820345")?.county).toBe("Pasco");
    expect(byNumber.get("CCC1330456")?.license_type).toBe("Certified Roofing Contractor");
  });
});

describe("importDbpr header handling", () => {
  it("maps other boards' header names and a different column order", () => {
    const file = writeCsv(
      [
        "License Number,Name,Doing Business As,License Type,Rank,City,State,Zip Code,County Name,Status,Original License Date,Expiration Date,Phone Number",
        'CFC1500001,"DOE, JANE",JANE DOE PLUMBING,Certified Plumbing Contractor,CFC,TAMPA,FL,33602,HILLSBOROUGH COUNTY,Current,1999-04-01,08/31/2026,(813) 555-0100',
      ].join("\n"),
    );
    const stores = tempStores();
    expect(importDbpr(file, stores, { snapshotDate: "2026-10-01" }).imported).toBe(1);
    expect(stores.licenses.rows()[0]).toMatchObject({
      license_type: "Certified Plumbing Contractor",
      business_name: "JANE DOE PLUMBING",
      original_issue_date: "1999-04-01",
      county: "Hillsborough",
      status: "active",
      phone: "813-555-0100",
    });
  });

  it("reads 'Original Issue Date' and derives the class from the licence number", () => {
    const file = writeCsv(["Licensee Name,DBA Name,License Number,Primary Status,Original Issue Date,Zip,Occupation Code", '"ROE, RICHARD",ROE AIR,CAC1500002,Current,02/03/2001,33602,0601'].join("\n"));
    const stores = tempStores();
    importDbpr(file, stores, { snapshotDate: "2026-10-01" });
    expect(stores.licenses.rows()[0]).toMatchObject({ license_class: "CAC", license_type: "Certified Air Conditioning Contractor", original_issue_date: "2001-02-03" });
  });

  it("fails loudly, listing the missing columns and the unknown headers", () => {
    const file = writeCsv(["Licensee Name,Original Licensure Date,Mystery Column,Another One", '"DOE, JANE",01/01/2000,x,y'].join("\n"));
    expect(() => importDbpr(file, tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/license_number.*Unrecognised headers: Mystery Column, Another One/s);
  });

  it("reads a headerless extract by the positional layout", () => {
    const cells = (over: Record<string, string>) => DBPR_POSITIONAL_COLUMNS.map((c) => `"${over[c] ?? ""}"`).join(",");
    const file = writeCsv(
      [
        cells({ board_number: "06", licensee_name: "DOE, JANE", dba_name: "DOE AIR", class_code: "CAC", city: "TAMPA", state: "FL", zip: "33602", county: "39", license_number: "CAC1500003", primary_status: "Current", secondary_status: "Active", original_date: "05/05/1995" }),
        cells({ board_number: "06", licensee_name: "ROE, RICHARD", dba_name: "ROE PLUMBING", class_code: "CFC", zip: "33701", county: "62", license_number: "CFC1500004", primary_status: "Current", secondary_status: "Active", original_date: "06/06/1996" }),
      ].join("\n"),
    );
    const stores = tempStores();
    const r = importDbpr(file, stores, { snapshotDate: "2026-10-01" });
    expect(r).toMatchObject({ read: 2, imported: 2, invalid: [] });
    expect(stores.licenses.rows().map((l) => [l.license_number, l.county, l.original_issue_date])).toEqual([
      ["CAC1500003", "Hillsborough", "1995-05-05"],
      ["CFC1500004", "Pinellas", "1996-06-06"],
    ]);
  });

  it("refuses a first row that is neither a header nor a full record", () => {
    const file = writeCsv("just,three,cells\n");
    expect(() => importDbpr(file, tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/neither a DBPR header/);
  });
});

describe("importDbpr row handling", () => {
  const header = "Licensee Name,DBA Name,Class Code,License Number,Primary Status,Secondary Status,Original Licensure Date,Zip";

  it("reports an unreadable row with its line and imports the rest", () => {
    const file = writeCsv([header, '"DOE, JANE",DOE AIR,CAC,CAC1,Current,Active,13/45/2001,33602', '"ROE, RICHARD",ROE AIR,CAC,CAC2,Current,Active,01/02/2001,33602', ',,CAC,CAC3,Current,Active,01/02/2001,33602', '"POE, ED",POE AIR,CAC,,Current,Active,01/02/2001,33602'].join("\n"));
    const stores = tempStores();
    const r = importDbpr(file, stores, { snapshotDate: "2026-10-01" });
    expect(r.read).toBe(4);
    expect(r.imported).toBe(1);
    expect(r.invalid.map((i) => i.line)).toEqual([2, 4, 5]);
    expect(r.invalid[0]!.error).toMatch(/original_date/);
    expect(r.invalid[1]!.error).toMatch(/no licensee or business name/);
    expect(r.invalid[2]!.error).toMatch(/source_record_id/);
  });

  it("applies the filter and is idempotent on re-import", () => {
    const stores = tempStores();
    const r = importDbpr(SAMPLE, stores, { snapshotDate: "2026-10-01", filter: (l) => l.license_class !== "CCC" });
    expect(r).toMatchObject({ imported: 12, skipped: 1 });
    const before = fs.readFileSync(stores.licenses.file, "utf8");
    importDbpr(SAMPLE, stores, { snapshotDate: "2026-10-01", filter: (l) => l.license_class !== "CCC" });
    expect(fs.readFileSync(stores.licenses.file, "utf8")).toBe(before);
  });

  it("streams a file larger than one read chunk", () => {
    const rows = Array.from({ length: 15000 }, (_, i) => `"DOE${i}, JANE",DOE AIR ${i},CAC,CAC${String(i).padStart(7, "0")},Current,Active,01/02/2001,33602`);
    const file = writeCsv([header, ...rows].join("\n"));
    expect(fs.statSync(file).size).toBeGreaterThan(1 << 20);
    const r = importDbpr(file, tempStores(), { snapshotDate: "2026-10-01" });
    expect(r).toMatchObject({ read: 15000, imported: 15000, invalid: [] });
  });

  it("numbers the 67 Florida counties from 11", () => {
    expect(Object.keys(FL_COUNTY_CODES).length).toBe(67);
    expect(FL_COUNTY_CODES["11"]).toBe("Alachua");
    expect(FL_COUNTY_CODES["77"]).toBe("Washington");
  });
});
