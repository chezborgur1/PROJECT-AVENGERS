// Tests for the Sunbiz cordata fixed-width importer: the layout table, the
// person-or-entity flag on officer slots, LLC title codes, dates and the
// import's failure paths (bad records are reported, never fatal).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  entityInMetro,
  forEachLine,
  formatSunbizRecord,
  importSunbiz,
  parseSunbizRecord,
  sliceSunbizRecord,
  SUNBIZ_LAYOUT,
  SUNBIZ_RECORD_LENGTH,
} from "../src/sources/sunbiz.ts";
import { REPO, tempStores, testConfig, tmpDir } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/tampa-bay/sunbiz_cordata.txt");

function record(overrides: Record<string, string> = {}): string {
  return formatSunbizRecord({
    cor_number: "P99000000001",
    cor_name: "EXAMPLE AIR, INC.",
    status: "A",
    filing_type: "DOMP",
    princ_add_1: "100 EXAMPLE AVE",
    princ_city: "TAMPA",
    princ_state: "FL",
    princ_zip: "33602-1234",
    file_date: "06151999",
    last_transaction_date: "01022026",
    report_date_1: "01022024",
    report_date_2: "01022026",
    report_date_3: "01022025",
    ra_name: "DOE JANE",
    ra_name_type: "P",
    officer1_title: "P",
    officer1_type: "P",
    officer1_name: "DOE JANE",
    ...overrides,
  });
}

function writeFile(lines: string[]): string {
  const file = path.join(tmpDir(), "cordata.txt");
  fs.writeFileSync(file, lines.join("\n") + "\n", "latin1");
  return file;
}

describe("SUNBIZ_LAYOUT", () => {
  it("is contiguous and covers exactly one 1,440-character record", () => {
    let next = 1;
    for (const f of SUNBIZ_LAYOUT) {
      expect(f.start, f.field).toBe(next);
      next = f.start + f.length;
    }
    expect(SUNBIZ_RECORD_LENGTH).toBe(1440);
    expect(new Set(SUNBIZ_LAYOUT.map((f) => f.field)).size).toBe(SUNBIZ_LAYOUT.length);
  });

  it("matches every position the research could confirm", () => {
    const at = (field: string) => SUNBIZ_LAYOUT.find((f) => f.field === field);
    expect(at("cor_number")).toMatchObject({ start: 1, length: 12 });
    expect(at("cor_name")).toMatchObject({ start: 13, length: 192 });
    expect(at("more_than_six_officers")).toMatchObject({ start: 495, length: 1 });
    expect(at("ra_name")).toMatchObject({ start: 545, length: 42 });
    expect(at("ra_add_1")).toMatchObject({ start: 588, length: 42 });
    expect(at("officer1_title")?.start).toBe(669);
    expect(at("filler")).toMatchObject({ start: 1437, length: 4 });
    expect(SUNBIZ_LAYOUT.filter((f) => f.field.endsWith("_title")).length).toBe(6);
  });

  it("round-trips fields through format and slice", () => {
    const fields = sliceSunbizRecord(record({ officer6_name: "LAST OFFICER", officer6_title: "S" }));
    expect(fields).toMatchObject({ cor_number: "P99000000001", princ_zip: "33602-1234", officer6_name: "LAST OFFICER", officer6_title: "S" });
    expect(() => formatSunbizRecord({ princ_state: "FLA" })).toThrow(/princ_state.*allows 2/);
  });
});

describe("parseSunbizRecord", () => {
  it("maps a corporation record to a canonical entity row", () => {
    const e = parseSunbizRecord(record(), "2026-10-01")!;
    expect(e).toMatchObject({
      source: "sunbiz",
      source_record_id: "P99000000001",
      state: "FL",
      entity_name: "EXAMPLE AIR, INC.",
      entity_type: "Florida Profit Corporation",
      status: "active",
      formation_date: "1999-06-15",
      principal_street: "100 EXAMPLE AVE",
      principal_zip: "33602",
      registered_agent_name: "DOE, JANE",
      registered_agent_type: "person",
      officer1_name: "DOE, JANE",
      officer1_title: "P",
      officer1_is_person: "Y",
      officer2_name: "",
      officer2_is_person: "",
      last_annual_report_date: "2026-01-02",
      last_event_date: "2026-01-02",
      source_snapshot_date: "2026-10-01",
    });
  });

  it("flags company officers as entities and leaves their names alone", () => {
    const e = parseSunbizRecord(
      record({ officer1_title: "D", officer1_type: "C", officer1_name: "SUNCOAST REGISTERED AGENTS INC", officer2_title: "MGR", officer2_type: "", officer2_name: "DOE JOHN Q" }),
      "2026-10-01",
    )!;
    expect(e).toMatchObject({ officer1_name: "SUNCOAST REGISTERED AGENTS INC", officer1_is_person: "N", officer2_name: "DOE, JOHN Q", officer2_is_person: "Y", officer2_title: "MGR" });
    const blankFlagCompany = parseSunbizRecord(record({ officer1_type: "", officer1_name: "ACME HOLDINGS LLC" }), "2026-10-01")!;
    expect(blankFlagCompany.officer1_is_person).toBe("N");
  });

  it("keeps a name that already has a comma and maps inactive status", () => {
    const e = parseSunbizRecord(record({ status: "I", officer1_name: "DOE, JANE A", filing_type: "FLAL" }), "2026-10-01")!;
    expect(e).toMatchObject({ status: "inactive", officer1_name: "DOE, JANE A", entity_type: "Florida Limited Liability Company" });
  });

  it("keeps an unknown filing type code as written", () => {
    expect(parseSunbizRecord(record({ filing_type: "ZZTOP" }), "2026-10-01")!.entity_type).toBe("ZZTOP");
  });

  it("returns null for blank and short lines and pads lines with trailing spaces trimmed", () => {
    expect(parseSunbizRecord("", "2026-10-01")).toBeNull();
    expect(parseSunbizRecord("   \r", "2026-10-01")).toBeNull();
    expect(parseSunbizRecord("P99000000001 TOO SHORT", "2026-10-01")).toBeNull();
    const trimmed = record().trimEnd();
    expect(trimmed.length).toBeLessThan(1440);
    expect(parseSunbizRecord(trimmed, "2026-10-01")!.officer1_name).toBe("DOE, JANE");
    expect(parseSunbizRecord(`${record()}\r`, "2026-10-01")!.source_record_id).toBe("P99000000001");
  });

  it("throws on an unreadable date or a missing name", () => {
    expect(() => parseSunbizRecord(record({ file_date: "99999999" }), "2026-10-01")).toThrow(/file_date/);
    expect(() => parseSunbizRecord(record({ cor_name: "" }), "2026-10-01")).toThrow(/entity_name/);
  });
});

describe("importSunbiz", () => {
  it("imports the sample: LLC titles, an agent firm in an officer slot, an inactive entity", () => {
    const stores = tempStores();
    const r = importSunbiz(SAMPLE, stores, { snapshotDate: "2026-10-01" });
    expect(r).toMatchObject({ kind: "sunbiz", read: 12, imported: 12, skipped: 0, invalid: [] });
    const rows = stores.entities.rows(true);
    const byId = new Map(rows.map((e) => [e.source_record_id, e]));
    expect(byId.get("L04000056789")).toMatchObject({ officer1_title: "MGR", officer1_name: "PATEL, VIKRAM", officer2_title: "AMBR", registered_agent_type: "entity" });
    expect(byId.get("P96000041177")).toMatchObject({ officer1_is_person: "N", officer1_name: "SUNCOAST REGISTERED AGENTS INC", officer2_name: "BRENNAN, THOMAS W" });
    expect(byId.get("P90000033090")).toMatchObject({ status: "inactive", last_annual_report_date: "2019-05-01" });
    expect(byId.get("P88000014522")).toMatchObject({ formation_date: "1988-03-14", principal_street: "4410 N ARMENIA AVE STE 3" });
  });

  it("is idempotent: importing twice leaves the same table", () => {
    const stores = tempStores();
    importSunbiz(SAMPLE, stores, { snapshotDate: "2026-10-01" });
    const first = fs.readFileSync(stores.entities.file, "utf8");
    importSunbiz(SAMPLE, stores, { snapshotDate: "2026-10-01" });
    expect(fs.readFileSync(stores.entities.file, "utf8")).toBe(first);
  });

  it("reports bad records with their line number and imports the rest", () => {
    const file = writeFile([record(), "", record({ cor_number: "P99000000002", file_date: "99999999" }), "short line", record({ cor_number: "P99000000003" })]);
    const stores = tempStores();
    const r = importSunbiz(file, stores, { snapshotDate: "2026-10-01" });
    expect(r.read).toBe(3);
    expect(r.imported).toBe(2);
    expect(r.invalid).toEqual([{ line: 3, error: expect.stringContaining("file_date") }]);
  });

  it("applies the filter and counts what it skips", () => {
    const stores = tempStores();
    const r = importSunbiz(SAMPLE, stores, { snapshotDate: "2026-10-01", filter: entityInMetro(testConfig()) });
    // Ocala (344) and Palm Harbor (346) are outside the test metro's zip prefixes.
    expect(r).toMatchObject({ read: 12, imported: 10, skipped: 2 });
    expect(stores.entities.rows().map((e) => e.principal_city)).not.toContain("OCALA");
  });

  it("lets a later line for the same entity win, as daily files update quarterly ones", () => {
    const file = writeFile([record(), record({ cor_name: "EXAMPLE AIR AND HEAT, INC." })]);
    const stores = tempStores();
    expect(importSunbiz(file, stores, { snapshotDate: "2026-10-01" }).imported).toBe(1);
    expect(stores.entities.rows()[0]!.entity_name).toBe("EXAMPLE AIR AND HEAT, INC.");
  });

  it("fails clearly when the file is missing", () => {
    expect(() => importSunbiz("/no/such/file.txt", tempStores(), { snapshotDate: "2026-10-01" })).toThrow(/not found/);
  });
});

describe("forEachLine", () => {
  it("reads lines across chunk boundaries without losing or splitting any", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ${"x".repeat(i)}`);
    const file = path.join(tmpDir(), "lines.txt");
    fs.writeFileSync(file, lines.join("\n"));
    const seen: string[] = [];
    forEachLine(file, (l, n) => seen.push(`${n}:${l}`), { chunkBytes: 7 });
    expect(seen).toEqual(lines.map((l, i) => `${i + 1}:${l}`));
  });
});
