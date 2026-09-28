// Operating metrics the sources state (kpis.csv or .xlsx): one row per
// metric and period, with a unit, a value, the source and whether it is
// documented or management's figure. Rows with the same metric key become
// one series keyed by period. Metrics the engine computes (revenue per
// employee, labor cost %) are not read here; they come out of the model.

import path from "node:path";
import { headerKey, parseAmount, parseDateString, parsePercent, parsePeriodLabel, pickColumn, readRecords } from "../util/tables.ts";
import { periodKey, type Evidence, type KpiSeries, type KpiUnit, type PeriodRef } from "../domain/financials.ts";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const UNITS: [RegExp, KpiUnit][] = [
  [/^(#|count|number|n|units?|members|customers|clients|employees|reviews|vans|trucks|vehicles|locations|jobs)$/, "count"],
  [/\$|currency|dollar|usd/, "currency"],
  [/%|percent|pct|\brate\b/, "percent"],
  [/^x$|ratio|multiple|times/, "ratio"],
  [/hour|\bhrs?\b/, "hours"],
  [/rating|stars?/, "rating"],
  [/sq|square/, "sq_ft"],
  [/mile/, "miles"],
];

export function parseKpiUnit(raw: string | undefined): KpiUnit | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const exact: KpiUnit[] = ["count", "currency", "percent", "ratio", "hours", "rating", "sq_ft", "miles"];
  const loose = s.replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if ((exact as string[]).includes(loose)) return loose as KpiUnit;
  return UNITS.find(([re]) => re.test(s))?.[1];
}

/**
 * A period as an intake file writes it: "FY2025" or "2025" (fiscal year),
 * "2025-07" or "Jul-25" (month), "2025-12-31", "12/31/2025" or "as of Dec
 * 31, 2025" (a point in time), "YTD Jul-25", "LTM 2025-07", "PF Jul-25".
 */
export function parsePeriodToken(raw: string, fyEndMonth: number): PeriodRef | undefined {
  const t = raw.trim();
  let m = /^fy\s?((?:19|20)\d{2})$/i.exec(t) ?? /^((?:19|20)\d{2})$/.exec(t);
  if (m) return { kind: "fiscal_year", fiscalYear: Number(m[1]) };
  m = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/.exec(t);
  if (m) return { kind: "month", key: `${m[1]}-${m[2]}` };
  // The guide's own month label, "Jul-25".
  m = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[- ](\d{2})$/i.exec(t);
  if (m) return { kind: "month", key: `${2000 + Number(m[2])}-${String(MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}` };
  m = /^(ytd|ltm|pf)\s+(.+)$/i.exec(t);
  if (m) {
    const end = parsePeriodToken(m[2]!, fyEndMonth);
    if (end?.kind === "month") return { kind: m[1]!.toLowerCase() as "ytd" | "ltm" | "pf", end: end.key };
    if (end?.kind === "point") return { kind: m[1]!.toLowerCase() as "ytd" | "ltm" | "pf", end: end.date.slice(0, 7) };
    return undefined;
  }
  // Quarters are not a period the model keys on.
  if (/\bq[1-4]\b/i.test(t)) return undefined;
  m = /^(?:as of|at|as at)\s+(.+)$/i.exec(t);
  const date = parseDateString(m ? m[1] : t);
  if (date && (m || /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$|\d{1,2},? (?:19|20)\d{2}$/.test(t))) return { kind: "point", date };
  const p = parsePeriodLabel(t, fyEndMonth);
  if (p?.months === 1) return { kind: "month", key: `${p.endYear}-${String(p.endMonth).padStart(2, "0")}` };
  if (p?.months === 12) return { kind: "fiscal_year", fiscalYear: p.fiscalYear };
  if (p?.months === 0 && date) return { kind: "point", date };
  return undefined;
}

export async function loadKpisCsv(file: string, fyEndMonth: number): Promise<{ kpis: KpiSeries[]; warnings: string[] }> {
  const name = path.basename(file);
  const warnings: string[] = [];
  const series = new Map<string, KpiSeries>();
  const records = await readRecords(file);

  records.forEach((r, i) => {
    const line = i + 2;
    const keyRaw = pickColumn(r, "key", "metric", "kpi", "metric_key");
    const label = pickColumn(r, "label", "name", "metric_name") ?? keyRaw;
    if (!keyRaw) {
      warnings.push(`${name} line ${line}: no metric; row skipped.`);
      return;
    }
    const key = headerKey(keyRaw);
    const unit = parseKpiUnit(pickColumn(r, "unit", "units"));
    if (!unit) {
      warnings.push(`${name} line ${line} (${label}): unit "${pickColumn(r, "unit", "units") ?? ""}" not recognised (count, currency, percent, ratio, hours, rating, sq_ft, miles); row skipped.`);
      return;
    }
    const periodRaw = pickColumn(r, "period", "as_of", "date", "fiscal_year", "month");
    const period = periodRaw ? parsePeriodToken(periodRaw, fyEndMonth) : undefined;
    if (!period) {
      warnings.push(`${name} line ${line} (${label}): period "${periodRaw ?? ""}" not understood (FY2025, 2025-07, Jul-25, 2025-12-31, LTM Jul-25); row skipped.`);
      return;
    }
    const valueRaw = pickColumn(r, "value", "amount");
    const value = unit === "percent" ? parsePercent(valueRaw) : parseAmount(valueRaw);
    if (value === undefined) {
      warnings.push(`${name} line ${line} (${label}): value "${valueRaw ?? ""}" is not a number; row skipped.`);
      return;
    }
    const evidenceRaw = (pickColumn(r, "evidence") ?? "").toLowerCase();
    const evidence: Evidence = /^doc/.test(evidenceRaw) ? "documented" : "management_representation";
    const definition = pickColumn(r, "definition", "note", "notes");
    const source = pickColumn(r, "source", "source_document") ?? name;

    let s = series.get(key);
    if (!s) {
      s = { key, label: label!, unit, values: {}, ...(definition ? { definition } : {}), source, evidence };
      series.set(key, s);
    } else if (s.unit !== unit) {
      warnings.push(`${name} line ${line} (${label}): unit ${unit} differs from the ${s.unit} used earlier for the same metric; row skipped.`);
      return;
    } else if (!s.definition && definition) {
      s.definition = definition;
    }
    const pk = periodKey(period);
    if (s.values[pk] !== undefined) warnings.push(`${name} line ${line} (${label}): a second value for ${pk} replaces the first.`);
    s.values[pk] = value;
    // A documented figure anywhere in the series does not make management's other figures documented.
    if (s.evidence === "documented" && evidence !== "documented") s.evidence = "management_representation";
  });
  return { kpis: [...series.values()], warnings };
}
