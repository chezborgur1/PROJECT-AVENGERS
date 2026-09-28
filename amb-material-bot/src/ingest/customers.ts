// Customer-level revenue (customers.csv or .xlsx): one row per customer
// with a name or id, a type, start and end dates and revenue by fiscal year
// (or by month), plus an optional residual row for the customers the file
// does not list individually (the households on a service business) so the
// list ties to P&L revenue and check C12 can run. Customers are coded
// C-001.. by latest full-year revenue; the real name stays on the record for
// the raw tab and never reaches the CIM.

import path from "node:path";
import {
  fiscalYearOf,
  monthEndDate,
  monthKey,
  monthLabel,
  parseMonthKey,
  type ContractBasis,
  type CustomerList,
  type CustomerRecord,
  type LossReason,
  type MonthKey,
} from "../domain/financials.ts";
import { parseAmount, parseDateString, parseFlag, periodColumns, pickColumn, readRecords } from "../util/tables.ts";

export interface CustomerFileRow {
  name?: string;
  /** The client system's own id, kept beside the name for the raw tab. */
  sourceId?: string;
  type?: string;
  segment?: string;
  startDate?: string;
  endDate?: string;
  lossReason?: LossReason;
  contractBasis?: ContractBasis;
  contract?: CustomerRecord["contract"];
  revenueByFiscalYear: Record<number, number>;
  revenueByMonth?: Record<MonthKey, number>;
  /** The bucket of customers the file does not list individually. */
  residual: boolean;
  /** File line, for warnings. */
  line: number;
}

export interface CustomerFile {
  rows: CustomerFileRow[];
  file: string;
  warnings: string[];
}

const RESIDUAL_NAME = /not listed individually|^residual\b|^all other\b|^other customers\b/i;

const CONTRACT_BASES: [RegExp, ContractBasis][] = [
  [/maintenance|membership|agreement|plan/, "maintenance_agreement"],
  [/^contract/, "contract"],
  [/recurring|subscription|retainer/, "recurring"],
  [/t\s*&\s*m|time.*material/, "time_and_materials"],
  [/project|one.?off|\bjob\b/, "project"],
];

function parseLossReason(raw: string): LossReason | undefined {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "regrettable") return "regrettable";
  if (s === "non_regrettable" || s === "nonregrettable" || s === "not_regrettable") return "non_regrettable";
  if (s === "unclassified" || s === "unknown") return "unclassified";
  return undefined;
}

function parseContractBasis(raw: string | undefined): ContractBasis | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const loose = s.replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  const exact: ContractBasis[] = ["maintenance_agreement", "contract", "recurring", "time_and_materials", "project", "other"];
  if ((exact as string[]).includes(loose)) return loose as ContractBasis;
  return CONTRACT_BASES.find(([re]) => re.test(s))?.[1] ?? "other";
}

/** Read the customer file as it was written; nothing is coded or tied yet. */
export async function loadCustomersCsv(file: string, fyEndMonth: number): Promise<CustomerFile> {
  const name = path.basename(file);
  const warnings: string[] = [];
  const rows: CustomerFileRow[] = [];
  const records = await readRecords(file);
  const cols = periodColumns(Object.keys(records[0] ?? {}), fyEndMonth);
  if (!cols.months.size && !cols.years.size) {
    throw new Error(`${name} has no revenue columns (expected fiscal years such as "FY2025" or months such as "2025-07")`);
  }

  records.forEach((r, i) => {
    const line = i + 2;
    const customer = pickColumn(r, "name", "customer", "customer_name", "client", "client_name", "account", "account_name");
    const sourceId = pickColumn(r, "id", "customer_id", "client_id", "code", "number");
    const label = customer ?? sourceId;
    if (!label) {
      warnings.push(`${name} line ${line}: no customer name or id; row skipped.`);
      return;
    }
    const residual = parseFlag(pickColumn(r, "residual", "not_listed", "unlisted")) || RESIDUAL_NAME.test(customer ?? "");

    const revenueByMonth: Record<MonthKey, number> = {};
    for (const [key, month] of cols.months) {
      const v = parseAmount(r[key]);
      if (v !== undefined) revenueByMonth[month] = (revenueByMonth[month] ?? 0) + v;
    }
    const revenueByFiscalYear: Record<number, number> = {};
    if (cols.months.size) {
      // Months are the finer record; fiscal years are their sums.
      for (const [month, v] of Object.entries(revenueByMonth)) {
        const { year, month: m } = parseMonthKey(month);
        const fy = fiscalYearOf(year, m, fyEndMonth);
        revenueByFiscalYear[fy] = (revenueByFiscalYear[fy] ?? 0) + v;
      }
    } else {
      for (const [key, fy] of cols.years) {
        const v = parseAmount(r[key]);
        if (v !== undefined) revenueByFiscalYear[fy] = (revenueByFiscalYear[fy] ?? 0) + v;
      }
    }

    const startRaw = pickColumn(r, "start_date", "start", "first_invoice", "first_invoice_date", "customer_since", "since");
    const startDate = parseDateString(startRaw);
    if (startRaw && !startDate) warnings.push(`${name} line ${line} (${label}): start date "${startRaw}" not understood; left blank.`);
    const endRaw = pickColumn(r, "end_date", "end", "last_invoice", "last_invoice_date", "terminated", "termination_date", "lost_date");
    const endDate = parseDateString(endRaw);
    if (endRaw && !endDate) warnings.push(`${name} line ${line} (${label}): end date "${endRaw}" not understood; left blank.`);

    const lossRaw = pickColumn(r, "loss_reason", "reason", "churn_reason");
    let lossReason = lossRaw ? parseLossReason(lossRaw) : undefined;
    if (lossRaw && !lossReason) {
      warnings.push(`${name} line ${line} (${label}): loss reason "${lossRaw}" is not regrettable, non-regrettable or unclassified; recorded as unclassified.`);
      lossReason = "unclassified";
    }
    if (endDate && !lossReason) lossReason = "unclassified";
    if (!endDate && lossReason) {
      warnings.push(`${name} line ${line} (${label}): has a loss reason but no end date; the customer is treated as active.`);
      lossReason = undefined;
    }

    const term = pickColumn(r, "term", "contract_term");
    const renewalDate = parseDateString(pickColumn(r, "renewal_date", "renewal", "renews"));
    const noticeDays = parseAmount(pickColumn(r, "notice_days", "notice"));
    const autoRenewsRaw = pickColumn(r, "auto_renews", "auto_renew", "autorenew", "evergreen");
    const contract: CustomerRecord["contract"] | undefined =
      term || renewalDate || noticeDays !== undefined || autoRenewsRaw
        ? {
            ...(term ? { term } : {}),
            ...(renewalDate ? { renewalDate } : {}),
            ...(noticeDays !== undefined ? { noticeDays } : {}),
            ...(autoRenewsRaw ? { autoRenews: parseFlag(autoRenewsRaw) } : {}),
          }
        : undefined;

    const type = pickColumn(r, "type", "customer_type", "client_type", "category");
    const segment = pickColumn(r, "segment", "market", "geography", "region", "service_line");
    const contractBasis = parseContractBasis(pickColumn(r, "contract_basis", "basis", "contract_type", "relationship"));
    rows.push({
      ...(customer ? { name: customer } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(type ? { type } : {}),
      ...(segment ? { segment } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(lossReason ? { lossReason } : {}),
      ...(contractBasis ? { contractBasis } : {}),
      ...(contract ? { contract } : {}),
      revenueByFiscalYear,
      ...(cols.months.size ? { revenueByMonth } : {}),
      residual,
      line,
    });
  });
  return { rows, file: name, warnings };
}

export interface CustomerContext {
  /** Full fiscal years in the dataset; the latest one orders the codes. */
  years: number[];
  fyEndMonth: number;
  /** Everything after this month is left out (guide Q33). */
  asOfMonth: MonthKey;
  /** P&L revenue per fiscal year, for the check C12 tie. */
  revenueByFiscalYear: Record<number, number>;
  term: CustomerList["term"];
}

/**
 * Code the customers (C-001 is the largest in the latest full fiscal year,
 * then the prior years, then file order; DATA_CONTRACT 2.6), cut the file
 * back to the as-of month, fold residual rows into one bucket and tie the
 * total to P&L revenue.
 */
export function buildCustomerList(cf: CustomerFile, ctx: CustomerContext): { customers: CustomerList; warnings: string[] } {
  const warnings: string[] = [];
  const asOfDate = monthEndDate(ctx.asOfMonth);
  const asOf = parseMonthKey(ctx.asOfMonth);
  const asOfFy = fiscalYearOf(asOf.year, asOf.month, ctx.fyEndMonth);
  const listed: CustomerFileRow[] = [];
  const residualRows: CustomerFileRow[] = [];
  let laterStarts = 0;
  let laterEnds = 0;
  let laterMonths = 0;

  for (const row of cf.rows) {
    if (row.residual) {
      residualRows.push(row);
      continue;
    }
    if (row.startDate && row.startDate > asOfDate) {
      laterStarts++;
      continue;
    }
    const r: CustomerFileRow = { ...row };
    if (r.endDate && r.endDate > asOfDate) {
      delete r.endDate;
      delete r.lossReason;
      laterEnds++;
    }
    r.revenueByFiscalYear = Object.fromEntries(Object.entries(row.revenueByFiscalYear).filter(([y]) => Number(y) <= asOfFy));
    if (row.revenueByMonth) {
      const kept = Object.entries(row.revenueByMonth).filter(([m]) => m <= ctx.asOfMonth);
      laterMonths += Object.keys(row.revenueByMonth).length - kept.length;
      r.revenueByMonth = Object.fromEntries(kept);
    }
    listed.push(r);
  }
  const asOfLabel = monthLabel(ctx.asOfMonth);
  if (laterStarts) warnings.push(`${cf.file}: ${laterStarts} customer(s) start after the as-of month (${asOfLabel}) and are left out of the list.`);
  if (laterEnds) warnings.push(`${cf.file}: ${laterEnds} customer(s) end after the as-of month (${asOfLabel}); they count as active at ${asOfLabel}.`);
  if (laterMonths) warnings.push(`${cf.file}: revenue after ${asOfLabel} (${laterMonths} customer-months) is left out; every strip ends at the as-of date.`);

  const sortYears = [...ctx.years].sort((a, b) => b - a);
  const order = listed
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      for (const y of sortYears) {
        const d = (b.r.revenueByFiscalYear[y] ?? 0) - (a.r.revenueByFiscalYear[y] ?? 0);
        if (d) return d;
      }
      return a.i - b.i;
    });
  const width = Math.max(3, String(order.length).length);
  const customers: CustomerRecord[] = order.map(({ r }, rank) => ({
    id: `C-${String(rank + 1).padStart(width, "0")}`,
    ...(r.name ? { name: r.name } : {}),
    ...(r.type ? { type: r.type } : {}),
    ...(r.segment ? { segment: r.segment } : {}),
    ...(r.startDate ? { startDate: r.startDate } : {}),
    ...(r.endDate ? { endDate: r.endDate } : {}),
    ...(r.lossReason ? { lossReason: r.lossReason } : {}),
    revenueByFiscalYear: r.revenueByFiscalYear,
    ...(r.revenueByMonth ? { revenueByMonth: r.revenueByMonth } : {}),
    ...(r.contractBasis ? { contractBasis: r.contractBasis } : {}),
    ...(r.contract ? { contract: r.contract } : {}),
  }));

  // Only the years the file carries: a year it lacks stays absent rather than reading as zero customer revenue.
  const allYears = [...new Set([...listed, ...residualRows].flatMap((r) => Object.keys(r.revenueByFiscalYear).map(Number)))]
    .filter((y) => y <= asOfFy)
    .sort((a, b) => a - b);
  const sumYear = (rows: CustomerFileRow[], y: number) => rows.reduce((s, r) => s + (r.revenueByFiscalYear[y] ?? 0), 0);

  let residual: CustomerList["residual"];
  if (residualRows.length) {
    residual = {
      label: residualRows[0]!.name ?? "Customers not listed individually",
      revenueByFiscalYear: Object.fromEntries(allYears.map((y) => [y, sumYear(residualRows, y)])),
    };
  }
  const totalsByFiscalYear = Object.fromEntries(allYears.map((y) => [y, sumYear(listed, y) + (residual?.revenueByFiscalYear[y] ?? 0)]));

  for (const y of ctx.years) {
    const pnlRevenue = ctx.revenueByFiscalYear[y];
    const total = totalsByFiscalYear[y] ?? 0;
    if (!pnlRevenue || !allYears.includes(y)) continue;
    const gap = (total - pnlRevenue) / pnlRevenue;
    if (Math.abs(gap) > 0.02) {
      warnings.push(
        `FY${y} customer revenue in ${cf.file} ($${Math.round(total).toLocaleString("en-US")}) differs from P&L revenue ($${Math.round(pnlRevenue).toLocaleString("en-US")}) by ${(gap * 100).toFixed(1)}% (check C12). ${residual ? "Reconcile the list to the P&L." : "Add a residual row for customers not listed individually, or reconcile the list to the P&L."}`,
      );
    }
  }

  // Coverage: the last month (or fiscal year-end) the file reaches, capped at the dataset's as-of.
  const lastMonth = listed.flatMap((r) => Object.keys(r.revenueByMonth ?? {})).sort().pop();
  const lastYear = allYears.length ? allYears[allYears.length - 1]! : undefined;
  let coverage = lastMonth ?? (lastYear !== undefined ? monthKey(lastYear, ctx.fyEndMonth) : ctx.asOfMonth);
  if (coverage > ctx.asOfMonth) coverage = ctx.asOfMonth;
  if (coverage < ctx.asOfMonth) warnings.push(`Customer data in ${cf.file} runs to ${monthLabel(coverage)}; the P&L runs to ${asOfLabel}. State this in the Summary.`);

  return {
    customers: {
      customers,
      ...(residual ? { residual } : {}),
      term: ctx.term,
      asOfMonth: coverage,
      totalsByFiscalYear,
      source: `Customer list (${cf.file})`,
      file: cf.file,
    },
    warnings,
  };
}
