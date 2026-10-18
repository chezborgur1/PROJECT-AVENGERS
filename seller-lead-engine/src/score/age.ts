import type { ProspectRow } from "../domain/schema.ts";

// Estimates the owner's age band from public professional records, for
// internal scoring only. The engine never buys an age or date of birth
// (voter files and data-broker appends are off limits: docs/research/data.md
// §4), so it works from three proxies, most confident first:
//
//   1. dental school graduation year: most DDS/DMD graduates are 25 to 27
//   2. original licence issue year: contractor licensure usually follows
//      years of field experience, so an issue age of 25 to 32
//   3. entity formation year: founders typically 28 to 40
//
// These are heuristics with wide bands (data.md §4 and §9). The estimate
// feeds the score and the advisor's notes; email copy never mentions age
// (DESIGN.md principle 5), and score reasons describe the record ("Licence
// issued 1994, which suggests a senior owner"), never the estimate as a fact.

/** An owner-age band from the most confident record, or method "" with zeros when no record supports one. */
export interface AgeEstimate {
  low: number;
  high: number;
  method: "graduation_year" | "license_issue_year" | "formation_year" | "";
}

/** The age at which each record event typically happens, as [low, high]. */
export const AGE_AT_EVENT = {
  graduation_year: [25, 27],
  license_issue_year: [25, 32],
  formation_year: [28, 40],
} as const;

// Nobody runs a business at 100+; a record implying it is a data error, so
// that method is skipped rather than trusted.
const MAX_PLAUSIBLE_AGE = 95;

/** The year of the record the estimate came from (graduation, licence issue or formation), or undefined. */
export function ageBasisYear(p: ProspectRow, method: AgeEstimate["method"]): number | undefined {
  switch (method) {
    case "graduation_year":
      return p.year_graduated;
    case "license_issue_year":
      return yearOf(p.license_issue_date);
    case "formation_year":
      return yearOf(p.formation_date);
    default:
      return undefined;
  }
}

/** Estimated owner age band; the most confident usable record wins (graduation, then licence issue, then formation). */
export function estimateOwnerAge(p: ProspectRow, today: string): AgeEstimate {
  const thisYear = yearOf(today);
  if (thisYear === undefined) throw new Error(`estimateOwnerAge: today must be YYYY-MM-DD, got "${today}"`);
  const methods = ["graduation_year", "license_issue_year", "formation_year"] as const;
  for (const method of methods) {
    const year = ageBasisYear(p, method);
    // A future year or one before any living owner could have started is bad data: try the next record.
    if (year === undefined || year > thisYear) continue;
    const elapsed = thisYear - year;
    const [lowAt, highAt] = AGE_AT_EVENT[method];
    if (elapsed + lowAt > MAX_PLAUSIBLE_AGE) continue;
    return { low: elapsed + lowAt, high: elapsed + highAt, method };
  }
  return { low: 0, high: 0, method: "" };
}

/** The middle of the band, used to pick the age points; undefined when there is no estimate. */
export function ageMidpoint(age: AgeEstimate): number | undefined {
  return age.method ? (age.low + age.high) / 2 : undefined;
}

function yearOf(date: string | undefined): number | undefined {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(date ?? "");
  return m ? Number(m[1]) : undefined;
}
