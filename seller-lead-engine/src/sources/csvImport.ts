import { createHash } from "node:crypto";
import fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { parse } from "csv-parse/sync";
import {
  ContactRowSchema,
  EntityRowSchema,
  LicenseRowSchema,
  normalizeEmail,
  PERSON_ROLES,
  PoiRowSchema,
  US_STATES,
  type ContactRow,
} from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { normalizePhone, normalizeStatus, toIsoDate, zip5 } from "./normalize.ts";

// CSV imports: the canonical formats (docs/research/data.md section 8,
// "CSV import formats the engine should accept") and header-mapping presets
// for other states' licence files and the open POI datasets. Every preset
// maps the file's own header names to canonical columns at runtime, because
// the research could not verify most real header rows (data.md section 10):
// a file whose required columns cannot be found fails loudly, naming the
// missing columns and the headers it did not recognise, instead of importing
// blanks.
//
// Files are read in chunks and parsed a batch of complete records at a time,
// so a weekly state file larger than Excel's row limit never sits in memory
// as one string.

/** What one import did. `invalid` lines are reported and never block the rest. */
export interface ImportResult {
  file: string;
  kind: string;
  read: number;
  imported: number;
  skipped: number;
  invalid: { line: number; error: string }[];
}

type PresetKind = "entities" | "licenses" | "contacts" | "open_poi";
interface Preset {
  kind: PresetKind;
  /** canonical column (or a virtual "_field") -> header names to look for, in priority order */
  columns: Record<string, string[]>;
  defaults?: Record<string, string>;
}

const identity = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, [k]]));

/**
 * Header-mapping presets. Canonical presets read the engine's own headers.
 * The state presets are built from the best available knowledge of each
 * file (data.md sections 2 and 3); their header names are unverified, which
 * is why mapping is by alias and a mismatch fails loudly. Virtual columns
 * start with "_": _street2 (appended to street), _city_state_zip ("AUSTIN, TX
 * 78701"), _first_name / _middle_name / _last_name (joined into person_name),
 * _person_title (mapped to person_role) and _email (an open POI email, which
 * becomes a contacts row).
 */
export const CSV_PRESETS: Record<string, { kind: "entities" | "licenses" | "contacts" | "open_poi"; columns: Record<string, string[]>; defaults?: Record<string, string> }> = {
  entities: { kind: "entities", columns: identity(Object.keys(EntityRowSchema.shape)), defaults: { source: "csv" } },
  licenses: { kind: "licenses", columns: identity(Object.keys(LicenseRowSchema.shape)), defaults: { source: "csv", person_role: "unknown" } },
  contacts: {
    kind: "contacts",
    // Bought or exported lists name the headcount many ways.
    columns: { ...identity(Object.keys(ContactRowSchema.shape)), employees: ["employees", "employee_count", "number of employees", "num employees", "# employees", "employee size", "company size", "headcount", "staff"] },
    defaults: { source: "csv", email_source: "import" },
  },
  open_poi: {
    kind: "open_poi",
    columns: { ...identity(Object.keys(PoiRowSchema.shape)), source_record_id: ["source_record_id", "poi_id"], data_license: ["data_license", "license"] },
    defaults: { source: "open_poi" },
  },
  // California CSLB License Master (data.md section 2). Personnel names come from the separate Personnel file.
  cslb: {
    kind: "licenses",
    columns: {
      license_number: ["LicenseNo", "License Number", "LicNo"],
      business_name: ["BusinessName", "FullBusinessName", "Business Name"],
      dba_name: ["BUS-NAME-2", "BusName2", "DBA"],
      license_type: ["LicenseType", "License Type"],
      license_class: ["Classifications(s)", "Classifications", "Classification"],
      status: ["PrimaryStatus", "Primary Status", "Status"],
      street: ["MailingAddress", "Address", "Street"],
      city: ["City"],
      state: ["State"],
      zip: ["ZIPCode", "Zip", "Zip Code"],
      county: ["County"],
      phone: ["BusinessPhone", "Phone"],
      original_issue_date: ["IssueDate", "Issue Date", "OriginalIssueDate"],
      effective_date: ["ReissueDate", "ReactivationDate"],
      expiration_date: ["ExpirationDate", "Expiration Date"],
      person_name: ["PersonnelName", "Personnel Name", "Name"],
      _person_title: ["Title", "PersonnelTitle", "Relationship"],
    },
    defaults: { source: "csv", state: "CA", license_type: "Contractor", person_role: "unknown" },
  },
  // Texas TDLR licence files, e.g. "Airconditioning Contractors" (data.md section 2). The licence belongs to an
  // individual who may be an employee (Occupations Code ch. 1302), so the person is a "licensee", never assumed owner.
  tdlr: {
    kind: "licenses",
    columns: {
      license_number: ["LICENSE NUMBER", "License No"],
      license_type: ["LICENSE TYPE"],
      license_class: ["LICENSE SUBTYPE"],
      expiration_date: ["LICENSE EXPIRATION DATE (MMDDCCYY)", "LICENSE EXPIRATION DATE", "EXPIRATION DATE"],
      original_issue_date: ["LICENSE ORIGINAL ISSUE DATE", "ORIGINAL ISSUE DATE", "ISSUE DATE"],
      person_name: ["NAME", "OWNER NAME", "LICENSEE NAME"],
      business_name: ["BUSINESS NAME"],
      street: ["BUSINESS ADDRESS-LINE1", "BUSINESS ADDRESS LINE1", "MAILING ADDRESS LINE1"],
      _street2: ["BUSINESS ADDRESS-LINE2", "BUSINESS ADDRESS LINE2", "MAILING ADDRESS LINE2"],
      _city_state_zip: ["BUSINESS CITY, STATE ZIP", "MAILING ADDRESS CITY, STATE ZIP"],
      zip: ["BUSINESS ZIP"],
      county: ["BUSINESS COUNTY", "COUNTY"],
      phone: ["BUSINESS PHONE", "PHONE NUMBER"],
      status: ["LICENSE STATUS", "STATUS"],
    },
    defaults: { source: "csv", state: "TX", person_role: "licensee", status: "active" },
  },
  // Texas TSBDE dentist list (data.md section 2): original issue date and year graduated, the best age proxy for dentists.
  tsbde: {
    kind: "licenses",
    columns: {
      license_number: ["LIC_NBR", "LICENSE NUMBER", "LIC_ID", "LICENSE_NUMBER"],
      license_type: ["LIC_TYPE", "LICENSE TYPE"],
      license_class: ["PRACTICE_DESC", "PRACTICE DESCRIPTION", "PRACTICE TYPE"],
      status: ["LIC_STA_DESC", "LICENSE STATUS", "STATUS"],
      business_name: ["PRACTICE_NAME", "PRACTICE NAME", "BUSINESS NAME"],
      _last_name: ["LAST_NME", "LAST NAME", "LAST_NAME"],
      _first_name: ["FIRST_NME", "FIRST NAME", "FIRST_NAME"],
      _middle_name: ["MIDDLE_NME", "MIDDLE NAME", "MIDDLE_NAME"],
      street: ["ADDRESS1", "ADDRESS LINE 1", "ADDRESS", "PRACTICE ADDRESS"],
      _street2: ["ADDRESS2", "ADDRESS LINE 2"],
      city: ["CITY"],
      state: ["STATE", "ST"],
      zip: ["ZIP", "ZIP CODE"],
      county: ["COUNTY", "COUNTY NAME"],
      phone: ["PHONE", "PHONE NUMBER"],
      original_issue_date: ["LIC_ORIG_DTE", "LICENSE ORIGINAL ISSUE DATE", "ORIGINAL ISSUE DATE", "ORIGINAL_ISSUE_DATE"],
      expiration_date: ["LIC_EXPR_DTE", "LICENSE EXPIRATION DATE", "EXPIRATION DATE"],
      year_graduated: ["YEAR_GRADUATED", "YEAR GRADUATED", "GRAD_YEAR", "GRADUATION YEAR"],
    },
    defaults: { source: "csv", state: "TX", license_type: "Dentist", person_role: "licensee" },
  },
  // Washington L&I contractor licences (Socrata m8qx-ubtq) with the primary principal (data.md section 2).
  wa_lni: {
    kind: "licenses",
    columns: {
      license_number: ["contractorlicensenumber", "license number", "licensenumber"],
      license_type: ["contractorlicensetypecodedesc", "license type"],
      license_class: ["specialtycode1desc", "specialtycode1", "specialty"],
      status: ["contractorlicensestatus", "statuscode", "status"],
      business_name: ["businessname", "business name"],
      person_name: ["primaryprincipalname", "principalname", "principal name"],
      street: ["address1", "address"],
      _street2: ["address2"],
      city: ["city"],
      state: ["state"],
      zip: ["zip", "zipcode"],
      county: ["county"],
      phone: ["phonenumber", "phone"],
      original_issue_date: ["licenseissuedate", "originalissuedate", "issue date"],
      effective_date: ["licenseeffectivedate", "effective date"],
      expiration_date: ["licenseexpirationdate", "expiration date"],
    },
    defaults: { source: "csv", state: "WA", person_role: "principal" },
  },
  // Overture Maps Places flattened to CSV (data.md section 3): read basic_category, not the deprecated categories.
  overture: {
    kind: "open_poi",
    columns: {
      source_record_id: ["id", "gers_id"],
      name: ["names.primary", "names_primary", "primary_name", "name"],
      basic_category: ["basic_category", "categories.primary", "category"],
      website: ["websites", "website", "websites[0]"],
      phone: ["phones", "phone", "phones[0]"],
      street: ["addresses.freeform", "addresses[0].freeform", "freeform", "street", "address"],
      city: ["addresses.locality", "addresses[0].locality", "locality", "city"],
      state: ["addresses.region", "addresses[0].region", "region", "state"],
      zip: ["addresses.postcode", "addresses[0].postcode", "postcode", "zip"],
      date_refreshed: ["date_refreshed", "update_time"],
    },
    defaults: { source: "open_poi", data_license: "CDLA-Permissive-2.0" },
  },
  // Foursquare OS Places (Apache-2.0). It carries email, which becomes a contacts row (data.md verification note 18).
  foursquare: {
    kind: "open_poi",
    columns: {
      source_record_id: ["fsq_place_id", "fsq_id"],
      name: ["name"],
      basic_category: ["fsq_category_labels", "category_labels", "category"],
      website: ["website"],
      phone: ["tel", "phone"],
      street: ["address"],
      city: ["locality", "city"],
      state: ["region", "state"],
      zip: ["postcode", "zip"],
      date_refreshed: ["date_refreshed"],
      date_closed: ["date_closed"],
      _email: ["email"],
    },
    defaults: { source: "open_poi", data_license: "Apache-2.0" },
  },
};

const CANONICAL_PRESETS = new Set(["entities", "licenses", "contacts", "open_poi"]);

/** Columns each kind cannot do without; each inner list is "any of". */
const REQUIRED: Record<PresetKind, string[][]> = {
  entities: [["source_record_id"], ["entity_name"]],
  licenses: [["license_number", "source_record_id"], ["business_name", "person_name", "dba_name", "_last_name"]],
  contacts: [["business_name"]],
  open_poi: [["name"]],
};

const DATE_FIELDS: Record<PresetKind, string[]> = {
  entities: ["formation_date", "last_annual_report_date", "last_event_date", "source_snapshot_date"],
  licenses: ["original_issue_date", "effective_date", "expiration_date", "source_snapshot_date"],
  contacts: [],
  open_poi: ["date_refreshed", "date_closed"],
};

/** "Original Licensure Date" -> "originallicensuredate": header names compare without case, spaces or punctuation. */
export function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Map a header row to canonical fields. The first alias found wins, so
 * aliases are listed in priority order. Returns the column index of each
 * mapped field and the headers nothing claimed.
 */
export function mapHeaders(headers: readonly string[], columns: Record<string, readonly string[]>): { index: Record<string, number>; unknown: string[] } {
  const positions = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key && !positions.has(key)) positions.set(key, i);
  });
  const index: Record<string, number> = {};
  const claimed = new Set<number>();
  for (const [field, aliases] of Object.entries(columns)) {
    for (const alias of aliases) {
      const at = positions.get(normalizeHeader(alias));
      if (at !== undefined) {
        index[field] = at;
        claimed.add(at);
        break;
      }
    }
  }
  const unknown = headers.filter((h, i) => !claimed.has(i) && h.trim() !== "");
  return { index, unknown };
}

/** Throw an error naming every missing required column, the unrecognised headers and what the preset looks for. */
export function assertRequiredColumns(label: string, file: string, required: string[][], mapped: Record<string, unknown>, unknown: string[], columns: Record<string, readonly string[]>, defaults: Record<string, string> = {}): void {
  const missing = required.filter((anyOf) => !anyOf.some((f) => f in mapped || defaults[f]));
  if (!missing.length) return;
  const wanted = missing.map((anyOf) => anyOf.map((f) => `${f} (${(columns[f] ?? [f]).join(" / ")})`).join(" or ")).join("; ");
  throw new Error(
    `${file}: cannot import as ${label}: required column(s) not found: ${wanted}. Unrecognised headers: ${unknown.length ? unknown.join(", ") : "(none)"}. Add the file's header names to the preset, or rename the columns.`,
  );
}

/**
 * Call `fn` for every CSV record in the file, reading it in chunks and
 * parsing only complete records (a newline outside quotes ends a record), so
 * large files stream in bounded memory. `line` is the line the record ends on.
 * A record csv-parse cannot read (a stray quote inside a quoted name) goes
 * to `onError` with its line and the rest of the file still imports: one bad
 * row is reported and never blocks the rest (REVIEW_R1.md item 27).
 */
export function forEachCsvRecord(
  file: string,
  fn: (cells: string[], line: number) => void,
  opts: { chunkBytes?: number; onError?: (line: number, error: string) => void } = {},
): void {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(opts.chunkBytes ?? 1 << 20);
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let linesBefore = 0;
  const flush = (text: string) => {
    if (!text.trim()) {
      linesBefore += countNewlines(text);
      return;
    }
    const options = { bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true, info: true } as const;
    type Parsed = { record: string[]; info: { lines: number } }[];
    let records: Parsed;
    try {
      records = parse(text, options) as unknown as Parsed;
    } catch {
      // One record csv-parse cannot read (a stray quote inside a quoted name) would lose the whole
      // batch, and its own skip option swallows the next record too. So parse record by record, split
      // at the same quote-aware boundaries, and report only the bad ones (REVIEW_R1.md item 27).
      records = [];
      let from = 0;
      let line = 0;
      for (const cut of [...recordBoundaries(text), text.length - 1]) {
        if (cut < from) continue;
        const piece = text.slice(from, cut + 1);
        from = cut + 1;
        const pieceLines = countNewlines(piece);
        if (piece.trim()) {
          try {
            for (const r of parse(piece, options) as unknown as Parsed) records.push({ record: r.record, info: { lines: line + r.info.lines } });
          } catch (err) {
            opts.onError?.(linesBefore + line + Math.max(1, pieceLines), `unreadable CSV record: ${(err as Error).message}`);
          }
        }
        line += pieceLines;
      }
    }
    for (const { record, info } of records) fn(record, linesBefore + info.lines);
    linesBefore += countNewlines(text);
  };
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      pending += decoder.write(buf.subarray(0, n));
      const cut = lastRecordBoundary(pending);
      if (cut >= 0) {
        flush(pending.slice(0, cut + 1));
        pending = pending.slice(cut + 1);
      }
    }
    pending += decoder.end();
    flush(pending);
  } finally {
    fs.closeSync(fd);
  }
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Index of the last newline that is outside a quoted field, or -1. Quotes
 * are read the way csv-parse reads them: a quote opens a quoted field only
 * at the start of a field, "" inside one is an escaped quote, and a quote
 * closes the field only before a comma, a line end or the end. So an inch
 * mark in an unquoted field (ACME 12" PIPE CO) no longer flips the state for
 * the rest of the file and buffers it all in one string (REVIEW_R1.md item 32).
 */
export function lastRecordBoundary(s: string): number {
  return recordBoundaries(s).at(-1) ?? -1;
}

/** Every newline outside a quoted field, by the same rules as `lastRecordBoundary`. */
export function recordBoundaries(s: string): number[] {
  let inQuote = false;
  let fieldStart = true;
  const found: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inQuote) {
      if (c !== 34) continue;
      if (s.charCodeAt(i + 1) === 34) {
        i++; // escaped ""
        continue;
      }
      const next = s.charCodeAt(i + 1);
      if (Number.isNaN(next) || next === 44 || next === 10 || next === 13 || next === 32 || next === 9) inQuote = false;
      continue;
    }
    if (c === 34 && fieldStart) {
      inQuote = true;
      fieldStart = false;
    } else if (c === 44) fieldStart = true;
    else if (c === 10) {
      found.push(i);
      fieldStart = true;
    } else if (c !== 13 && c !== 32 && c !== 9) fieldStart = false;
  }
  return found;
}

/** Who a person on a licence is, from the file's own words. Qualifiers and RMEs are hired licence holders, never owners (data.md verification note 7). */
export function mapPersonRole(raw: string, fallback: (typeof PERSON_ROLES)[number] = "unknown"): (typeof PERSON_ROLES)[number] {
  const s = raw.trim().toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return fallback;
  if ((PERSON_ROLES as readonly string[]).includes(s.replace(/ /g, "_"))) return s.replace(/ /g, "_") as (typeof PERSON_ROLES)[number];
  if (/\b(rme|responsible managing employee|qualif\w*|qp|qa)\b/.test(s)) return "qualifier";
  if (/\bregistered agent\b|^ra$/.test(s)) return "registered_agent";
  if (/\b(sole owner|owner|proprietor|self proprietor)\b/.test(s)) return "owner";
  if (/\b(partner|general partner|gp|principal|member|managing member|manager)\b/.test(s)) return "principal";
  if (/\b(rmo|responsible managing officer|officer|president|ceo|pres|director|secretary|treasurer|vice president|chairman)\b/.test(s)) return "officer";
  if (/\bauthori[sz]ed official\b/.test(s)) return "authorized_official";
  if (/\blicensee\b/.test(s)) return "licensee";
  return fallback;
}

const STATE_NAMES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
  KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
  VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
};

/** "Florida" or "fl" -> "FL"; anything else is kept in capitals. */
export function normalizeState(raw: string): string {
  const s = raw.trim().toUpperCase();
  if ((US_STATES as readonly string[]).includes(s)) return s;
  return STATE_NAMES[s] ?? s;
}

/** The first entry of a list-valued cell (`["a","b"]`, `a|b`, `a; b`); a "Category > Sub" label gives its last part. */
function firstListValue(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const first = (s.split(/\s*[|;]\s*|",\s*"|',\s*'/)[0] ?? "").replace(/^["'\s]+|["'\s]+$/g, "");
  return first.includes(">") ? (first.split(">").pop() ?? "").trim() : first;
}

const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

/** Turn one mapped record into canonical cells; returns the row plus any contact the record carries (FSQ email). */
function canonicalRecord(preset: string, p: Preset, cells: string[], index: Record<string, number>, snapshotDate: string): { row: Record<string, string>; contact?: ContactRow } {
  const schema = p.kind === "entities" ? EntityRowSchema : p.kind === "licenses" ? LicenseRowSchema : p.kind === "contacts" ? ContactRowSchema : PoiRowSchema;
  const row: Record<string, string> = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, ""]));
  const virtual: Record<string, string> = {};
  for (const [field, at] of Object.entries(index)) {
    const v = (cells[at] ?? "").trim();
    if (field.startsWith("_")) virtual[field] = v;
    else row[field] = v;
  }
  for (const [field, v] of Object.entries(p.defaults ?? {})) if (!row[field]) row[field] = v;

  // Virtual columns
  if (virtual._street2) row.street = [row.street, virtual._street2].filter(Boolean).join(" ");
  if (virtual._city_state_zip) {
    const m = /^(.*?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-?\d{4})?)\s*$/.exec(virtual._city_state_zip);
    if (m) {
      if (!row.city) row.city = m[1]!.trim();
      if (!row.state || row.state === p.defaults?.state) row.state = m[2]!.toUpperCase();
      if (!row.zip) row.zip = m[3]!;
    } else if (!row.city) row.city = virtual._city_state_zip;
  }
  if (!row.person_name && (virtual._last_name || virtual._first_name)) {
    const given = [virtual._first_name, virtual._middle_name].filter(Boolean).join(" ");
    row.person_name = virtual._last_name ? (given ? `${virtual._last_name}, ${given}` : virtual._last_name) : given;
  }
  if ("person_role" in row) {
    const fallback = mapPersonRole(p.defaults?.person_role ?? "", "unknown");
    row.person_role = virtual._person_title ? mapPersonRole(virtual._person_title, fallback) : mapPersonRole(row.person_role ?? "", fallback);
  }

  // Clean-ups common to every kind
  for (const z of ["zip", "principal_zip", "mailing_zip"]) if (row[z]) row[z] = zip5(row[z]!) || row[z]!;
  for (const s of ["state", "principal_state", "mailing_state"]) if (row[s]) row[s] = normalizeState(row[s]!);
  if (row.phone) row.phone = normalizePhone(firstListValue(row.phone));
  if (row.website) row.website = firstListValue(row.website);
  if (row.basic_category) row.basic_category = firstListValue(row.basic_category);
  if (row.email) row.email = normalizeEmail(row.email);
  if (row.status && p.kind !== "contacts") row.status = normalizeStatus(row.status);
  for (const i of [1, 2, 3, 4, 5, 6]) {
    const k = `officer${i}_is_person`;
    if (k in row) {
      const v = (row[k] ?? "").toUpperCase();
      row[k] = ["Y", "YES", "TRUE", "P", "1"].includes(v) ? "Y" : ["N", "NO", "FALSE", "C", "0"].includes(v) ? "N" : "";
    }
  }
  for (const f of DATE_FIELDS[p.kind]) {
    if (!(f in row)) continue;
    const v = toIsoDate(row[f]);
    if (v === undefined) throw new Error(`${f}: cannot read date "${row[f]}"`);
    row[f] = v;
  }
  if ("source_snapshot_date" in row && !row.source_snapshot_date) row.source_snapshot_date = snapshotDate;

  // Record ids: canonical files keep theirs; state presets are prefixed so a
  // numeric CSLB licence number never collides with another board's.
  const prefix = CANONICAL_PRESETS.has(preset) ? "" : `${preset}-`;
  if (!row.source_record_id) {
    if (p.kind === "licenses" && row.license_number) row.source_record_id = row.license_number;
    else if (p.kind === "contacts") row.source_record_id = `c-${shortHash([row.business_name, row.zip, row.email, row.first_name, row.last_name].join("|").toLowerCase())}`;
    else if (p.kind === "open_poi" && row.name) row.source_record_id = `poi-${shortHash([row.name, row.street, row.zip].join("|").toLowerCase())}`;
  }
  if (row.source_record_id && prefix && !row.source_record_id.startsWith(prefix)) row.source_record_id = prefix + row.source_record_id;

  let contact: ContactRow | undefined;
  if (p.kind === "open_poi" && virtual._email) {
    contact = ContactRowSchema.parse({
      source: "open_poi",
      source_record_id: `${row.source_record_id}-email`,
      business_name: row.name,
      zip: row.zip,
      first_name: "",
      last_name: "",
      role: "",
      email: normalizeEmail(virtual._email),
      email_source: "import",
      email_source_url: "",
      website: row.website,
      phone: row.phone,
    });
  }
  return { row, contact };
}

/** Import a CSV with a preset's header mapping into the matching imports table (upsert by source_record_id). */
export function importCsv(preset: string, file: string, stores: Stores, opts: { snapshotDate: string }): ImportResult {
  const p = CSV_PRESETS[preset];
  if (!p) throw new Error(`Unknown CSV preset "${preset}". Presets: ${Object.keys(CSV_PRESETS).join(", ")}`);
  if (!fs.existsSync(file)) throw new Error(`CSV file not found: ${file}`);
  const result: ImportResult = { file, kind: `csv:${preset}`, read: 0, imported: 0, skipped: 0, invalid: [] };
  const schema = p.kind === "entities" ? EntityRowSchema : p.kind === "licenses" ? LicenseRowSchema : p.kind === "contacts" ? ContactRowSchema : PoiRowSchema;
  const rows = new Map<string, Record<string, unknown>>();
  const contacts = new Map<string, ContactRow>();
  let index: Record<string, number> | undefined;

  forEachCsvRecord(file, (cells, line) => {
    if (!index) {
      const mapped = mapHeaders(cells, p.columns);
      assertRequiredColumns(`preset "${preset}"`, file, REQUIRED[p.kind], mapped.index, mapped.unknown, p.columns, p.defaults);
      index = mapped.index;
      return;
    }
    if (cells.every((c) => !c.trim())) return;
    result.read++;
    try {
      const { row, contact } = canonicalRecord(preset, p, cells, index, opts.snapshotDate);
      const parsed = schema.safeParse(row);
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      rows.set(row.source_record_id!, parsed.data as Record<string, unknown>);
      if (contact) contacts.set(contact.source_record_id, contact);
    } catch (err) {
      result.invalid.push({ line, error: (err as Error).message });
    }
  }, { onError: (line, error) => result.invalid.push({ line, error }) });
  if (!index) throw new Error(`${file}: the file is empty (no header row)`);

  const values = [...rows.values()];
  if (p.kind === "entities") stores.entities.upsert(values as never);
  else if (p.kind === "licenses") stores.licenses.upsert(values as never);
  else if (p.kind === "contacts") stores.contacts.upsert(values as never);
  else stores.pois.upsert(values as never);
  if (contacts.size) stores.contacts.upsert([...contacts.values()]);
  result.imported = rows.size;
  return result;
}
