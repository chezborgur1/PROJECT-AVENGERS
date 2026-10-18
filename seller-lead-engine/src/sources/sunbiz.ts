import fs from "node:fs";
import { EntityRowSchema, type EntityRow } from "../domain/schema.ts";
import type { EngineConfig } from "../config.ts";
import type { Stores } from "../store/index.ts";
import { assignMetro } from "./merge.ts";
import { isPersonName, normalizeStatus, toIsoDate, zip5 } from "./normalize.ts";
import type { ImportResult } from "./csvImport.ts";

export type { ImportResult };

// Florida Division of Corporations "cordata" files (quarterly full files of
// active entities, and daily update files) into imports/entities.csv. The
// files are fixed-width ASCII with no header row, one 1,440-character record
// per entity, holding the registered agent and up to six officers with title
// codes and a person-or-entity flag (docs/research/data.md section 1). Sunbiz
// is the best free state source because it names the owners.
//
// The parser is driven entirely by SUNBIZ_LAYOUT, so a correction to a
// position is a data change, not a code change.

/**
 * The cordata record layout (1-based start, length).
 *
 * VERIFY AGAINST THE OFFICIAL LAYOUT BEFORE PRODUCTION USE:
 * https://dos.sunbiz.org/data-definitions/cor.html could not be reached from
 * the build sandbox (proxy refusal). The table is built from best available
 * knowledge and checked against every position the research could confirm:
 * record length 1,440; corporation number at 1 (12); name at 13 (192); the
 * more-than-six-officers flag at 495 (1); registered agent name, field 31, at
 * 545 (42); registered agent address, field 33, at 588 (42); six officer
 * blocks from field 37; and a 4-character field at 1437 that ends the record.
 * All of those anchors line up with the widths below.
 */
export const SUNBIZ_LAYOUT: readonly { field: string; start: number; length: number }[] = (() => {
  const head: [string, number][] = [
    ["cor_number", 12],
    ["cor_name", 192],
    ["status", 1],
    ["filing_type", 15],
    ["princ_add_1", 42],
    ["princ_add_2", 42],
    ["princ_city", 28],
    ["princ_state", 2],
    ["princ_zip", 10],
    ["princ_country", 2],
    ["mail_add_1", 42],
    ["mail_add_2", 42],
    ["mail_city", 28],
    ["mail_state", 2],
    ["mail_zip", 10],
    ["mail_country", 2],
    ["file_date", 8],
    ["fei_number", 14],
    ["more_than_six_officers", 1],
    ["last_transaction_date", 8],
    ["state_country", 2],
    ["report_year_1", 4],
    ["house_flag_1", 1],
    ["report_date_1", 8],
    ["report_year_2", 4],
    ["house_flag_2", 1],
    ["report_date_2", 8],
    ["report_year_3", 4],
    ["house_flag_3", 1],
    ["report_date_3", 8],
    ["ra_name", 42],
    ["ra_name_type", 1],
    ["ra_add_1", 42],
    ["ra_city", 28],
    ["ra_state", 2],
    ["ra_zip", 9],
  ];
  const officer: [string, number][] = [
    ["title", 4],
    ["type", 1],
    ["name", 42],
    ["add_1", 42],
    ["city", 28],
    ["state", 2],
    ["zip", 9],
  ];
  const fields: [string, number][] = [
    ...head,
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => officer.map(([f, len]) => [`officer${i}_${f}`, len] as [string, number])),
    ["filler", 4],
  ];
  let start = 1;
  return fields.map(([field, length]) => {
    const row = { field, start, length };
    start += length;
    return row;
  });
})();

/** The fixed record length the layout describes (1,440). */
export const SUNBIZ_RECORD_LENGTH = SUNBIZ_LAYOUT.reduce((n, f) => Math.max(n, f.start + f.length - 1), 0);

/** Lines shorter than this cannot hold a corporation number, name, status and filing type, so they are skipped as blank or truncated. */
const MIN_RECORD_LENGTH = (SUNBIZ_LAYOUT.find((f) => f.field === "filing_type")?.start ?? 206) - 1;

/**
 * Sunbiz filing-type codes. Best available knowledge, to verify against the
 * official definitions; an unknown code is kept as-is so nothing is lost.
 */
export const SUNBIZ_FILING_TYPES: Record<string, string> = {
  DOMP: "Florida Profit Corporation",
  DOMNP: "Florida Non-Profit Corporation",
  FORP: "Foreign Profit Corporation",
  FORNP: "Foreign Non-Profit Corporation",
  DOMLP: "Florida Limited Partnership",
  FORLP: "Foreign Limited Partnership",
  FLAL: "Florida Limited Liability Company",
  FORL: "Foreign Limited Liability Company",
  NPREG: "Non-Profit Registration",
  TRUST: "Declaration of Trust",
  AGENT: "Designation of Registered Agent",
};

/**
 * Officer names in cordata are written surname first. When the file gives no
 * comma ("HOLLOWAY DONALD R"), one is inserted after the first word so
 * splitPersonName reads it the right way round. Two-word surnames ("DE LA
 * CRUZ MARIA") cannot be told apart from this text; the owner's own reply
 * corrects them. Verify the name format against a real file.
 */
export const SUNBIZ_NAME_ORDER: "last_first" | "first_last" = "last_first";

function personNameForSplit(raw: string): string {
  if (SUNBIZ_NAME_ORDER !== "last_first" || raw.includes(",") || !isPersonName(raw)) return raw;
  const [last, ...rest] = raw.split(/\s+/);
  return rest.length ? `${last}, ${rest.join(" ")}` : raw;
}

/** Slice one record into raw trimmed fields by SUNBIZ_LAYOUT. */
export function sliceSunbizRecord(line: string): Record<string, string> {
  const padded = line.replace(/\r$/, "").padEnd(SUNBIZ_RECORD_LENGTH, " ");
  return Object.fromEntries(SUNBIZ_LAYOUT.map((f) => [f.field, padded.slice(f.start - 1, f.start - 1 + f.length).trim()]));
}

/** The inverse of sliceSunbizRecord: lay raw fields out as one fixed-width record (for fixtures and the sample file). */
export function formatSunbizRecord(fields: Record<string, string>): string {
  return SUNBIZ_LAYOUT.map((f) => {
    const v = fields[f.field] ?? "";
    if (v.length > f.length) throw new Error(`Sunbiz field ${f.field} is ${v.length} characters; the layout allows ${f.length}: "${v}"`);
    return v.padEnd(f.length, " ");
  }).join("");
}

function date(raw: Record<string, string>, field: string): string {
  const v = toIsoDate(raw[field]);
  if (v === undefined) throw new Error(`${field}: cannot read date "${raw[field]}"`);
  return v;
}

/** One cordata line as a canonical entity row; null for blank or short lines. Throws on a record that cannot be read. */
export function parseSunbizRecord(line: string, snapshotDate: string): EntityRow | null {
  const clean = line.replace(/\r$/, "");
  if (!clean.trim() || clean.length < MIN_RECORD_LENGTH) return null;
  const r = sliceSunbizRecord(clean);
  const statusCode = (r.status ?? "").toUpperCase();
  const filingType = (r.filing_type ?? "").toUpperCase();
  const reportDates = ["report_date_1", "report_date_2", "report_date_3"].map((f) => date(r, f)).filter(Boolean).sort();

  const officers: Record<string, string> = {};
  for (const i of [1, 2, 3, 4, 5, 6]) {
    const name = r[`officer${i}_name`] ?? "";
    const type = (r[`officer${i}_type`] ?? "").toUpperCase();
    // "P" = person, "C" = corporation or other entity. Officer slots often hold
    // registered-agent firms or companies (docs/research/data.md, verification note 1).
    const isPerson = !name ? "" : type === "P" ? "Y" : type === "C" ? "N" : isPersonName(name) ? "Y" : "N";
    officers[`officer${i}_name`] = isPerson === "Y" ? personNameForSplit(name) : name;
    officers[`officer${i}_title`] = name ? (r[`officer${i}_title`] ?? "").toUpperCase() : "";
    officers[`officer${i}_is_person`] = isPerson;
  }

  const raType = (r.ra_name_type ?? "").toUpperCase();
  const row = {
    source: "sunbiz",
    source_record_id: r.cor_number ?? "",
    state: "FL",
    entity_name: r.cor_name ?? "",
    entity_type: SUNBIZ_FILING_TYPES[filingType] ?? filingType,
    status: statusCode === "A" ? "active" : statusCode === "I" ? "inactive" : normalizeStatus(statusCode),
    formation_date: date(r, "file_date"),
    principal_street: [r.princ_add_1, r.princ_add_2].filter(Boolean).join(" "),
    principal_city: r.princ_city ?? "",
    principal_state: (r.princ_state ?? "").toUpperCase(),
    principal_zip: zip5(r.princ_zip ?? "") || (r.princ_zip ?? ""),
    mailing_street: [r.mail_add_1, r.mail_add_2].filter(Boolean).join(" "),
    mailing_city: r.mail_city ?? "",
    mailing_state: (r.mail_state ?? "").toUpperCase(),
    mailing_zip: zip5(r.mail_zip ?? "") || (r.mail_zip ?? ""),
    registered_agent_name: raType === "P" ? personNameForSplit(r.ra_name ?? "") : (r.ra_name ?? ""),
    registered_agent_type: raType === "P" ? "person" : raType === "C" ? "entity" : raType,
    ...officers,
    last_annual_report_date: reportDates[reportDates.length - 1] ?? "",
    last_event_date: date(r, "last_transaction_date"),
    fei_number: r.fei_number ?? "",
    source_snapshot_date: snapshotDate,
  };
  const parsed = EntityRowSchema.safeParse(row);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return parsed.data;
}

/**
 * Read a file line by line in fixed-size chunks, so a quarterly cordata part
 * (hundreds of megabytes) never sits in memory as one string. latin1 keeps
 * one character per byte, which a fixed-width layout depends on.
 */
export function forEachLine(file: string, fn: (line: string, lineNo: number) => void, opts: { encoding?: BufferEncoding; chunkBytes?: number } = {}): void {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(opts.chunkBytes ?? 1 << 20);
  let rest = "";
  let lineNo = 0;
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      const text = rest + buf.toString(opts.encoding ?? "latin1", 0, n);
      const lines = text.split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) fn(l, ++lineNo);
    }
    if (rest) fn(rest, ++lineNo);
  } finally {
    fs.closeSync(fd);
  }
}

/** Import a cordata file into imports/entities.csv (upsert by corporation number, so re-importing is a no-op). */
export function importSunbiz(file: string, stores: Stores, opts: { snapshotDate: string; filter?: (e: EntityRow) => boolean }): ImportResult {
  if (!fs.existsSync(file)) throw new Error(`Sunbiz file not found: ${file}`);
  const result: ImportResult = { file, kind: "sunbiz", read: 0, imported: 0, skipped: 0, invalid: [] };
  const rows = new Map<string, EntityRow>();
  forEachLine(file, (line, lineNo) => {
    let row: EntityRow | null;
    try {
      row = parseSunbizRecord(line, opts.snapshotDate);
    } catch (err) {
      result.read++;
      result.invalid.push({ line: lineNo, error: (err as Error).message });
      return;
    }
    if (!row) return; // blank or short line: not a record
    result.read++;
    if (opts.filter && !opts.filter(row)) {
      result.skipped++;
      return;
    }
    rows.set(row.source_record_id, row); // a later line for the same entity (daily files) wins
  });
  stores.entities.upsert([...rows.values()]);
  result.imported = rows.size;
  return result;
}

/** A Sunbiz filter that keeps entities whose principal or mailing zip falls in a configured metro (entities carry no county). */
export function entityInMetro(config: EngineConfig): (e: EntityRow) => boolean {
  return (e) =>
    assignMetro("", e.principal_zip, e.principal_state || e.state, config) !== "" ||
    assignMetro("", e.mailing_zip, e.mailing_state || e.state, config) !== "";
}
