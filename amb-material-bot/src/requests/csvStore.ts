import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { PRIORITIES, REQUEST_COLUMNS, RequestRowSchema, type RequestRow } from "./schema.ts";

// The request list as a CSV file. Anything that can export CSV (Excel,
// Google Sheets, a Notion database) can feed it. A Google Sheets store with
// the same interface is on the roadmap.

export interface RequestStore {
  load(): LoadedRequests;
  update(requestId: string, patch: Partial<RequestRow>): void;
}

export interface LoadedRequests {
  rows: RequestRow[];
  /** Rows that failed validation, with the reason, so one bad row never blocks the rest. */
  invalid: { line: number; requestId: string; error: string }[];
}

export class CsvRequestStore implements RequestStore {
  constructor(private readonly file: string) {}

  private readRaw(): Record<string, string>[] {
    if (!fs.existsSync(this.file)) {
      throw new Error(`Request list not found: ${this.file}. Start one by copying requests/high-priority-requests.csv.`);
    }
    const text = fs.readFileSync(this.file, "utf8");
    return parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  }

  load(): LoadedRequests {
    const raw = this.readRaw();
    const rows: RequestRow[] = [];
    const invalid: LoadedRequests["invalid"] = [];
    raw.forEach((record, i) => {
      // Missing optional columns are treated as blank rather than errors.
      const filled = Object.fromEntries(REQUEST_COLUMNS.map((c) => [c, record[c] ?? ""]));
      const result = RequestRowSchema.safeParse(filled);
      if (result.success) rows.push(result.data);
      else {
        invalid.push({
          line: i + 2,
          requestId: record.request_id ?? "?",
          error: result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
        });
      }
    });
    return { rows, invalid };
  }

  update(requestId: string, patch: Partial<RequestRow>): void {
    // Re-read and patch the raw strings so columns we don't own (or rows that
    // failed validation) are written back untouched.
    const raw = this.readRaw();
    const target = raw.find((r) => r.request_id === requestId);
    if (!target) throw new Error(`Request ${requestId} not found in ${this.file}`);
    for (const [key, value] of Object.entries(patch)) {
      target[key] = value === undefined ? "" : String(value);
    }
    const columns = [...new Set([...REQUEST_COLUMNS, ...Object.keys(raw[0] ?? {})])];
    fs.writeFileSync(this.file, stringify(raw, { header: true, columns }));
  }
}

export interface QueueOptions {
  /** Highest priority to include; "P1" means P1 only. */
  maxPriority?: (typeof PRIORITIES)[number];
  ids?: string[];
  force?: boolean;
}

/** Requests the bot should work, in order: priority, then due date, then received date. */
export function buildQueue(rows: RequestRow[], opts: QueueOptions = {}): RequestRow[] {
  const maxRank = PRIORITIES.indexOf(opts.maxPriority ?? "P1");
  return rows
    .filter((r) => {
      if (opts.ids?.length) return opts.ids.includes(r.request_id);
      if (PRIORITIES.indexOf(r.priority) > maxRank) return false;
      return opts.force ? r.status !== "done" : r.status === "new" || r.status === "rerun";
    })
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
        (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
        a.received_date.localeCompare(b.received_date),
    );
}
