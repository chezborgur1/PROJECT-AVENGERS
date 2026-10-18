import fs from "node:fs";
import { LicenseRowSchema, type LicenseRow } from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { assertRequiredColumns, forEachCsvRecord, mapHeaders, mapPersonRole, normalizeHeader, type ImportResult } from "./csvImport.ts";
import { isPersonName, normalizePhone, normalizeStatus, titleCasePlace, toIsoDate, zip5 } from "./normalize.ts";

export type { ImportResult };

// Florida DBPR licensee files (Construction Industry Licensing Board and the
// other boards) into imports/licenses.csv. DBPR publishes free weekly CSVs
// with the Original Licensure Date, the strongest owner-tenure signal in the
// state (docs/research/data.md section 2). Header text varies by board
// ("Original Licensure Date", "Original License Date", "Original Issue
// Date"), so headers are mapped at runtime by alias, and a file whose
// required columns cannot be found fails loudly with the unknown headers.
//
// Some DBPR extracts have no header row at all; the column order is in the
// board's readme.pdf (data.md verification note 9). A first row that matches
// no known header is read by DBPR_POSITIONAL_COLUMNS instead.
//
// A CILB certified licence is issued to the individual qualifier, who may
// not own the business, so the person is recorded as "licensee" or
// "qualifier" and only a self-proprietor is recorded as "owner".

/** Header aliases for each DBPR column, in priority order. */
export const DBPR_COLUMNS: Record<string, string[]> = {
  board_number: ["Board Number", "Board"],
  occupation_code: ["Occupation Code", "License Type Code", "Occupation"],
  occupation_desc: ["Occupation Description", "Occupation Name", "License Type", "License Type Description"],
  licensee_name: ["Licensee Name", "Name", "License Name", "Licensee"],
  dba_name: ["DBA Name", "Doing Business As", "D/B/A", "DBA"],
  class_code: ["Class Code", "Rank Code", "Class", "Rank", "License Class"],
  address1: ["Address Line 1", "Address 1", "Main Address Line 1", "Mailing Address Line 1", "Address", "Street"],
  address2: ["Address Line 2", "Address 2", "Main Address Line 2", "Mailing Address Line 2"],
  address3: ["Address Line 3", "Address 3", "Main Address Line 3"],
  city: ["City", "Main City", "Mailing City"],
  state: ["State", "Main State", "Mailing State"],
  zip: ["Zip", "Zip Code", "Zipcode", "Main Zip", "Mailing Zip"],
  county: ["County Name", "County", "County Code"],
  license_number: ["License Number", "Licensee Number", "License No", "Lic Number", "License"],
  primary_status: ["Primary Status", "Status", "License Status"],
  secondary_status: ["Secondary Status"],
  original_date: ["Original Licensure Date", "Original License Date", "Original Issue Date", "Orig Lic Date", "Original Licensed Date", "Licensure Date"],
  effective_date: ["Status Effective Date", "Effective Date"],
  expiration_date: ["License Expiration Date", "Expiration Date", "Expires", "Expiry Date"],
  alternate_license_number: ["Alternate License Number"],
  self_proprietor_name: ["Self Proprietor's Name", "Self Proprietor Name", "Self Proprietor"],
  employer_name: ["Employer Name", "Qualified Business Name", "Business Name"],
  employer_license_number: ["Employer License Number", "Qualified Business License Number"],
  phone: ["Phone", "Phone Number", "Business Phone"],
};

/**
 * Column order of a headerless DBPR licensee extract. Best available
 * knowledge of the CILB readme; VERIFY against the board's readme.pdf
 * (https://www2.myfloridalicense.com/sto/documents/readme.pdf) before
 * production use.
 */
export const DBPR_POSITIONAL_COLUMNS: readonly string[] = [
  "board_number", "occupation_code", "licensee_name", "dba_name", "class_code", "address1", "address2", "address3", "city", "state", "zip",
  "county", "license_number", "primary_status", "secondary_status", "original_date", "effective_date", "expiration_date",
  "alternate_license_number", "self_proprietor_name", "employer_name", "employer_license_number",
];

const REQUIRED = [["license_number"], ["licensee_name"], ["class_code", "occupation_code", "occupation_desc"]];

/** CILB licence class codes (the licence-number prefix) and their names; best available knowledge, unknown codes keep the code. */
export const DBPR_CLASS_NAMES: Record<string, string> = {
  CAC: "Certified Air Conditioning Contractor",
  RA: "Registered Air Conditioning Contractor",
  CMC: "Certified Mechanical Contractor",
  RM: "Registered Mechanical Contractor",
  CFC: "Certified Plumbing Contractor",
  RF: "Registered Plumbing Contractor",
  CGC: "Certified General Contractor",
  RG: "Registered General Contractor",
  CBC: "Certified Building Contractor",
  RB: "Registered Building Contractor",
  CRC: "Certified Residential Contractor",
  RR: "Registered Residential Contractor",
  CCC: "Certified Roofing Contractor",
  RC: "Registered Roofing Contractor",
  CPC: "Certified Pool/Spa Contractor",
  RP: "Registered Pool/Spa Contractor",
  CUC: "Certified Underground Utility and Excavation Contractor",
  CSC: "Certified Sheet Metal Contractor",
  EC: "Certified Electrical Contractor",
  ER: "Registered Electrical Contractor",
};

/**
 * Florida county codes as DBPR and other state agencies number them
 * (alphabetical from 11, with Dade at 23). Best available knowledge; verify
 * against the readme. A county cell that is not a number is used as written.
 */
export const FL_COUNTY_CODES: Record<string, string> = Object.fromEntries(
  [
    "Alachua", "Baker", "Bay", "Bradford", "Brevard", "Broward", "Calhoun", "Charlotte", "Citrus", "Clay", "Collier", "Columbia", "Miami-Dade",
    "DeSoto", "Dixie", "Duval", "Escambia", "Flagler", "Franklin", "Gadsden", "Gilchrist", "Glades", "Gulf", "Hamilton", "Hardee", "Hendry",
    "Hernando", "Highlands", "Hillsborough", "Holmes", "Indian River", "Jackson", "Jefferson", "Lafayette", "Lake", "Lee", "Leon", "Levy",
    "Liberty", "Madison", "Manatee", "Marion", "Martin", "Monroe", "Nassau", "Okaloosa", "Okeechobee", "Orange", "Osceola", "Palm Beach",
    "Pasco", "Pinellas", "Polk", "Putnam", "St. Johns", "St. Lucie", "Santa Rosa", "Sarasota", "Seminole", "Sumter", "Suwannee", "Taylor",
    "Union", "Volusia", "Wakulla", "Walton", "Washington",
  ].map((name, i) => [String(11 + i), name]),
);

function county(raw: string): string {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return FL_COUNTY_CODES[String(Number(s))] ?? "";
  return s ? titleCasePlace(s, { stripCounty: true }) : "";
}

/** DBPR splits status in two: primary (Current, Delinquent, Null and Void) and secondary (Active, Inactive). Both must say so for "active". */
function status(primary: string, secondary: string): string {
  const p = normalizeStatus(primary);
  const s = normalizeStatus(secondary);
  if (!p && !s) return "";
  if (p === "inactive" || s === "inactive") return "inactive";
  if ((p === "active" || !p) && (s === "active" || !s)) return "active";
  return [p, s].filter(Boolean).join(" ");
}

function date(raw: string | undefined, field: string): string {
  const v = toIsoDate(raw);
  if (v === undefined) throw new Error(`${field}: cannot read date "${raw}"`);
  return v;
}

/** One DBPR record (by canonical DBPR column) as a canonical licence row. Throws when the row cannot be read. */
export function dbprRecordToLicense(r: Record<string, string>, snapshotDate: string): LicenseRow {
  const get = (k: string) => (r[k] ?? "").trim();
  const number = get("license_number").replace(/\s+/g, "").toUpperCase();
  const classCode = (get("class_code") || /^[A-Z]+/.exec(number)?.[0] || "").toUpperCase();
  const licensee = get("licensee_name");
  const dba = get("dba_name");
  const employer = get("employer_name");
  const selfProp = get("self_proprietor_name");

  // Who is the person, and which name is the business?
  let businessName = "";
  let dbaName = "";
  let personName = "";
  let role: LicenseRow["person_role"] = "unknown";
  // DBPR writes an individual licensee as "LAST, FIRST M"; with no comma, no employer and no
  // self-proprietor, a name that merely looks like two words is a business (REVIEW_R1.md item 26).
  const individual = isPersonName(licensee) && (licensee.includes(",") || Boolean(employer) || Boolean(selfProp));
  if (individual) {
    personName = licensee;
    if (selfProp) {
      role = "owner"; // a self-proprietor owns the business they trade as
      businessName = dba || employer;
    } else if (employer) {
      role = "qualifier"; // qualifies a business someone else may own
      businessName = employer;
      dbaName = dba;
    } else {
      role = "licensee";
      businessName = dba;
    }
  } else {
    businessName = licensee;
    dbaName = dba && dba.toUpperCase() !== licensee.toUpperCase() ? dba : "";
    if (selfProp && isPersonName(selfProp)) {
      personName = selfProp;
      role = "owner";
    }
  }
  if (!businessName && !personName) throw new Error("no licensee or business name");

  const row = {
    source: "dbpr",
    source_record_id: number,
    license_number: number,
    license_type: get("occupation_desc") || DBPR_CLASS_NAMES[classCode] || classCode,
    license_class: classCode,
    status: status(get("primary_status"), get("secondary_status")),
    business_name: businessName,
    dba_name: dbaName,
    person_name: personName,
    person_role: mapPersonRole(role, "unknown"),
    original_issue_date: date(r.original_date, "original_date"),
    effective_date: date(r.effective_date, "effective_date"),
    expiration_date: date(r.expiration_date, "expiration_date"),
    year_graduated: "",
    street: [get("address1"), get("address2"), get("address3")].filter(Boolean).join(" "),
    city: get("city"),
    state: get("state").toUpperCase() || "FL",
    zip: zip5(get("zip")) || get("zip"),
    county: county(get("county")),
    phone: get("phone") ? normalizePhone(get("phone")) : "",
    source_snapshot_date: snapshotDate,
  };
  const parsed = LicenseRowSchema.safeParse(row);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

/** True when a first row reads as a header (it names a licence number or licensee column). */
function looksLikeHeader(cells: string[]): boolean {
  const known = new Set(Object.values(DBPR_COLUMNS).flat().map(normalizeHeader));
  const hits = cells.filter((c) => known.has(normalizeHeader(c))).length;
  return hits >= 2;
}

/** Import a DBPR licensee CSV (with or without a header row) into imports/licenses.csv, upserting by licence number. */
export function importDbpr(file: string, stores: Stores, opts: { snapshotDate: string; filter?: (l: LicenseRow) => boolean }): ImportResult {
  if (!fs.existsSync(file)) throw new Error(`DBPR file not found: ${file}`);
  const result: ImportResult = { file, kind: "dbpr", read: 0, imported: 0, skipped: 0, invalid: [] };
  const rows = new Map<string, LicenseRow>();
  let index: Record<string, number> | undefined;

  const handle = (cells: string[], line: number) => {
    if (cells.every((c) => !c.trim())) return;
    result.read++;
    try {
      const rec = Object.fromEntries(Object.entries(index!).map(([field, at]) => [field, cells[at] ?? ""]));
      const row = dbprRecordToLicense(rec, opts.snapshotDate);
      if (opts.filter && !opts.filter(row)) {
        result.skipped++;
        return;
      }
      rows.set(row.source_record_id, row);
    } catch (err) {
      result.invalid.push({ line, error: (err as Error).message });
    }
  };

  forEachCsvRecord(file, (cells, line) => {
    if (index) return handle(cells, line);
    if (looksLikeHeader(cells)) {
      const mapped = mapHeaders(cells, DBPR_COLUMNS);
      assertRequiredColumns("a DBPR licensee file", file, REQUIRED, mapped.index, mapped.unknown, DBPR_COLUMNS);
      index = mapped.index;
      return;
    }
    if (cells.length < 16) {
      throw new Error(`${file}: the first row is neither a DBPR header nor a ${DBPR_POSITIONAL_COLUMNS.length}-column headerless record (it has ${cells.length} cells): ${cells.join(", ")}`);
    }
    index = Object.fromEntries(DBPR_POSITIONAL_COLUMNS.map((f, i) => [f, i]));
    handle(cells, line);
  }, { onError: (line, error) => result.invalid.push({ line, error }) });

  stores.licenses.upsert([...rows.values()]);
  result.imported = rows.size;
  return result;
}
