import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { z } from "zod";

// One CSV file as a typed table. Anything that opens CSV (Excel, Google
// Sheets) can read or edit the pipeline, and a Sheets-backed store with the
// same interface can replace it later.
//
// Rows that fail validation are reported, kept on disk untouched, and never
// block the rest. Columns the schema does not own are preserved on write, so
// an advisor can add their own columns in a spreadsheet.

export interface InvalidRow {
  line: number;
  key: string;
  error: string;
}

export interface Loaded<T> {
  rows: T[];
  invalid: InvalidRow[];
}

type Shape = Record<string, z.ZodType>;

export class CsvTable<S extends z.ZodObject<Shape>> {
  readonly columns: string[];

  constructor(
    readonly file: string,
    private readonly schema: S,
    /** The column that identifies a row (prospect_id, touch_id, ...). */
    readonly key: keyof z.infer<S> & string,
  ) {
    this.columns = Object.keys(schema.shape);
  }

  exists(): boolean {
    return fs.existsSync(this.file);
  }

  private readRaw(): Record<string, string>[] {
    if (!this.exists()) return [];
    const text = fs.readFileSync(this.file, "utf8");
    if (!text.trim()) return [];
    return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  }

  load(): Loaded<z.infer<S>> {
    const rows: z.infer<S>[] = [];
    const invalid: InvalidRow[] = [];
    this.readRaw().forEach((record, i) => {
      // Missing columns read as blank, so adding a column never breaks an old file.
      const filled = Object.fromEntries(this.columns.map((c) => [c, record[c] ?? ""]));
      const result = this.schema.safeParse(filled);
      if (result.success) rows.push(result.data as z.infer<S>);
      else {
        invalid.push({
          line: i + 2,
          key: record[this.key] ?? "?",
          error: result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
        });
      }
    });
    return { rows, invalid };
  }

  /** Valid rows only; throws if any row is invalid and `strict` is set. */
  rows(strict = false): z.infer<S>[] {
    const { rows, invalid } = this.load();
    if (strict && invalid.length) {
      const first = invalid[0]!;
      throw new Error(`${path.basename(this.file)} line ${first.line} (${first.key}): ${first.error}${invalid.length > 1 ? ` (and ${invalid.length - 1} more)` : ""}`);
    }
    return rows;
  }

  /**
   * Insert or replace rows by key. Rows not named keep their raw text, extra
   * columns survive, and new rows are appended in the order given.
   */
  upsert(rows: readonly z.infer<S>[]): void {
    if (!rows.length) return;
    const raw = this.readRaw();
    const index = new Map(raw.map((r, i) => [r[this.key] ?? "", i]));
    for (const row of rows) {
      const cells = toCells(row as Record<string, unknown>, this.columns);
      const at = index.get(cells[this.key] ?? "");
      if (at !== undefined) raw[at] = { ...raw[at], ...cells };
      else {
        index.set(cells[this.key] ?? "", raw.length);
        raw.push(cells);
      }
    }
    this.writeRaw(raw);
  }

  /** Append rows without reading keys (logs). */
  append(rows: readonly z.infer<S>[]): void {
    if (!rows.length) return;
    const raw = this.readRaw();
    for (const row of rows) raw.push(toCells(row as Record<string, unknown>, this.columns));
    this.writeRaw(raw);
  }

  /** Replace the whole table. Extra columns of rows that survive are kept. */
  replaceAll(rows: readonly z.infer<S>[]): void {
    const old = new Map(this.readRaw().map((r) => [r[this.key] ?? "", r]));
    this.writeRaw(rows.map((row) => {
      const cells = toCells(row as Record<string, unknown>, this.columns);
      return { ...(old.get(cells[this.key] ?? "") ?? {}), ...cells };
    }));
  }

  private writeRaw(raw: Record<string, string>[]): void {
    const columns = [...new Set([...this.columns, ...raw.flatMap((r) => Object.keys(r))])];
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Write to a temp file and rename, so a crash never leaves half a table.
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, stringify(raw, { header: true, columns }));
    fs.renameSync(tmp, this.file);
  }
}

/** A typed row back to CSV cells: undefined -> "", numbers as plain digits. */
export function toCells(row: Record<string, unknown>, columns: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    const v = row[c];
    out[c] = v === undefined || v === null ? "" : typeof v === "number" ? String(v) : String(v);
  }
  return out;
}

/** The next id in a sequence such as P-00001 or T-000001, given the ids in use. */
export function nextId(prefix: string, width: number, existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    if (!id.startsWith(`${prefix}-`)) continue;
    const n = Number(id.slice(prefix.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

/** An id allocator that hands out consecutive ids without re-reading the table. */
export function idAllocator(prefix: string, width: number, existing: Iterable<string>): () => string {
  let next = Number(nextId(prefix, width, existing).slice(prefix.length + 1));
  return () => `${prefix}-${String(next++).padStart(width, "0")}`;
}
