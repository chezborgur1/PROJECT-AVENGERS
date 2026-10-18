import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// The valuation rules of thumb behind the exit-readiness check's rough range,
// loaded from reference/multiples.json. Each row is one published benchmark
// (a vertical's lower quartile, median and upper quartile of sale price over
// SDE or revenue) with its source, period and whether a person or research
// run read the figures from the source itself.
//
// Only verified rows can produce a number for an owner: an objective claim
// needs a reasonable basis before it is made (FTC Act Section 5, 15 U.S.C.
// 45, and the 1984 Advertising Substantiation statement; see
// docs/research/offer.md §3). Unverified rows stay in the file as notes for
// the next research pass, and `pickMultiple` never returns them.

export const MULTIPLE_METHODS = ["sde", "revenue", "collections"] as const;

/** One benchmark row. low / mid / high are multiples of the method's base (SDE, revenue or collections). */
export interface MultipleRow {
  key: string;
  vertical: string;
  method: (typeof MULTIPLE_METHODS)[number];
  low: number;
  mid: number;
  high: number;
  size_band: string;
  source: string;
  source_url: string;
  as_of: string;
  verified: boolean;
  verified_by: string;
  notes: string;
}

const SIZE_BAND = /^(all|(sde|price) (\d+)-(\d*))$/;

const MultipleRowSchema = z
  .object({
    key: z.string().min(1),
    vertical: z.string().min(1),
    method: z.enum(MULTIPLE_METHODS),
    low: z.number().positive(),
    mid: z.number().positive(),
    high: z.number().positive(),
    size_band: z.string().regex(SIZE_BAND, 'use "all", "sde <min>-<max>" or "price <min>-<max>"'),
    source: z.string().min(1),
    source_url: z.string(),
    as_of: z.string().min(1),
    verified: z.boolean(),
    verified_by: z.string().default(""),
    notes: z.string().default(""),
  })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, { message: "low <= mid <= high" })
  // A verified row must say where and how it was checked, or it is not verified.
  .refine((r) => !r.verified || (r.source_url.trim() !== "" && r.verified_by.trim() !== ""), { message: "a verified row needs source_url and verified_by" });

/** Read and validate the multiples file (a bare array or `{ rows: [...] }`). Throws naming the first bad row. */
export function loadMultiples(file: string): MultipleRow[] {
  const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(raw) ? raw : (raw as { rows?: unknown }).rows;
  if (!Array.isArray(list)) throw new Error(`${path.basename(file)}: expected an array of rows or { "rows": [...] }`);
  return list.map((item, i) => {
    const result = MultipleRowSchema.safeParse(item);
    if (!result.success) {
      const key = (item as { key?: string })?.key ?? "?";
      throw new Error(`${path.basename(file)} row ${i + 1} (${key}): ${result.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`).join("; ")}`);
    }
    return result.data;
  });
}

/** A row's size band parsed: "all", or a dollar band on SDE or on sale price (max undefined = no ceiling). */
export function parseSizeBand(band: string): { basis: "all" } | { basis: "sde" | "price"; min: number; max?: number } {
  const m = SIZE_BAND.exec(band.trim());
  if (!m) throw new Error(`Bad size band: "${band}"`);
  if (m[1] === "all") return { basis: "all" };
  return { basis: m[2] as "sde" | "price", min: Number(m[3]), max: m[4] ? Number(m[4]) : undefined };
}

/**
 * Whether a row applies to a business with this SDE. Market Pulse bands are
 * by sale price, not SDE (offer.md verification M11), so a price band is
 * matched on the implied price (SDE x the row's median multiple).
 */
export function bandMatches(row: MultipleRow, sde?: number): boolean {
  const band = parseSizeBand(row.size_band);
  if (band.basis === "all") return true;
  if (sde === undefined) return false;
  const x = band.basis === "sde" ? sde : sde * row.mid;
  return x >= band.min && (band.max === undefined || x < band.max);
}

/**
 * The verified SDE row for a multiples key whose size band fits `sde` (the
 * first in file order). Without an SDE, the first verified row of any method
 * with an "all" band. Unverified rows are never returned.
 */
export function pickMultiple(rows: MultipleRow[], key: string, sde?: number): MultipleRow | undefined {
  const candidates = rows.filter((r) => r.key === key && r.verified);
  if (sde !== undefined) return candidates.find((r) => r.method === "sde" && bandMatches(r, sde));
  return candidates.find((r) => r.method === "sde" && bandMatches(r)) ?? candidates.find((r) => bandMatches(r));
}

/** The verified revenue (or collections) row for a key, used only when the owner stated revenue and not SDE. */
export function pickRevenueMultiple(rows: MultipleRow[], key: string): MultipleRow | undefined {
  return rows.find((r) => r.key === key && r.verified && r.method !== "sde" && parseSizeBand(r.size_band).basis === "all");
}
