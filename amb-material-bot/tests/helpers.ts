import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CsvRequestStore } from "../src/requests/csvStore.ts";
import type { RequestRow } from "../src/requests/schema.ts";

export const REPO = path.resolve(import.meta.dirname, "..");

export function sampleRow(): RequestRow {
  const store = new CsvRequestStore(path.join(REPO, "requests/high-priority-requests.csv"));
  const row = store.load().rows.find((r) => r.request_id === "REQ-0001");
  if (!row) throw new Error("REQ-0001 missing from the sample request list");
  return row;
}

export function tmpDir(prefix = "amb-bot-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
