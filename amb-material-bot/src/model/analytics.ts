// Customer and payroll analytics (guide 5.5, DATA_CONTRACT §5.7-5.8): the
// count and dollar roll-forwards, concentration, cohorts, headcount by
// department and tenure buckets. The workbook computes the same figures with
// COUNTIFS / SUMIFS over helper blocks; the verifier compares the two.

import { addMonths, fiscalYearOf, monthEndDate, monthRange, type CustomerList, type CustomerRecord, type MonthKey, type PayrollRecord, type PayrollRegister } from "../domain/financials.ts";
import type { ConcentrationRow, CustomerAnalytics, HeadcountAnalytics, PeriodColumn, RetentionCounts, RetentionDollars } from "./types.ts";
import { amountInWindow, fiscalYearMonths } from "./periods.ts";

// --- Dates -------------------------------------------------------------------------

/** "YYYY-MM-DD" strings compare correctly as text; these helpers keep that explicit. */
const onOrBefore = (a: string, b: string) => a <= b;
const dayBefore = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string): number => {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
};
/** Whole months from `a` to `b`, the way tenure buckets count them. */
const monthsBetween = (a: string, b: string): number => daysBetween(a, b) / (365.25 / 12);

export const TENURE_BUCKETS = ["First 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "Over 2 Years"] as const;

export function tenureBucket(months: number): (typeof TENURE_BUCKETS)[number] {
  if (months < 3) return TENURE_BUCKETS[0];
  if (months < 6) return TENURE_BUCKETS[1];
  if (months < 12) return TENURE_BUCKETS[2];
  if (months < 24) return TENURE_BUCKETS[3];
  return TENURE_BUCKETS[4];
}

// --- Customers ------------------------------------------------------------------------

/**
 * Active at `date`: started on or before it and not ended on or before it
 * (DATA_CONTRACT §5.7). A customer whose end date is `date` itself was lost
 * that day, as the roll-forward books it, so every count, the median tenure
 * and the roll-forward's ending count agree. A customer the list does not
 * date is active only when it billed in the fiscal year `date` falls in, so an
 * undated account never inflates a count by default.
 */
export function customerActiveAt(c: CustomerRecord, date: string, fye: number): boolean {
  if (!c.startDate) {
    const [y, m] = date.split("-").map(Number) as [number, number];
    return (c.revenueByFiscalYear[fiscalYearOf(y, m, fye)] ?? 0) > 0;
  }
  if (!onOrBefore(c.startDate, date)) return false;
  return !c.endDate || c.endDate > date;
}

/** Fiscal years a customer list carries revenue for, the residual included. */
export function customerListYears(list: CustomerList): Set<number> {
  return new Set([...list.customers, ...(list.residual ? [list.residual] : [])].flatMap((c) => Object.keys(c.revenueByFiscalYear).map(Number)));
}

/** Fiscal years among `years` with at least one month inside the column's window, in order. */
export function touchedYears(years: number[], period: Pick<PeriodColumn, "start" | "end">, fye: number): number[] {
  const inWindow = new Set(monthRange(period.start, period.end));
  return [...new Set(years)].sort((a, b) => a - b).filter((y) => fiscalYearMonths(y, fye).some((m) => inWindow.has(m)));
}

/** A customer's (or the residual bucket's) revenue over a window of months: exact from months, else prorated from fiscal years. */
export function customerRevenueInWindow(rev: { revenueByMonth?: Record<MonthKey, number>; revenueByFiscalYear: Record<number, number> }, months: MonthKey[], fye: number): number {
  return amountInWindow({ byMonth: rev.revenueByMonth, byFiscalYear: rev.revenueByFiscalYear }, months, fye);
}

/**
 * Count roll-forward over [start, end]. The starting count is everyone who
 * started before the window and had not ended before it, so a customer whose
 * last day is the day before the window was lost in the prior window and is
 * not carried in: ending = starting + new − lost holds, and a month's
 * starting count equals the prior month's ending count.
 */
export function countRollForward(customers: CustomerRecord[], start: string, end: string): RetentionCounts {
  const dated = customers.filter((c) => c.startDate);
  const startingCount = dated.filter((c) => c.startDate! < start && (!c.endDate || c.endDate >= start)).length;
  const started = dated.filter((c) => c.startDate! >= start && c.startDate! <= end);
  const lost = dated.filter((c) => c.endDate && c.endDate >= start && c.endDate <= end);
  const lostByReason = { regrettable: 0, nonRegrettable: 0, unclassified: 0 };
  for (const c of lost) {
    if (c.lossReason === "regrettable") lostByReason.regrettable++;
    else if (c.lossReason === "non_regrettable") lostByReason.nonRegrettable++;
    else lostByReason.unclassified++;
  }
  const endingCount = startingCount + started.length - lost.length;
  const avgCustomers = (startingCount + endingCount) / 2;
  return {
    startingCount,
    newCustomers: started.length,
    lostCustomers: lost.length,
    lostByReason,
    endingCount,
    avgCustomers,
    newCustomerGrowth: startingCount ? started.length / startingCount : 0,
    churn: avgCustomers ? lost.length / avgCustomers : 0,
  };
}

/** Dollar roll-forward for fiscal year `fy` against `fy − 1` (DATA_CONTRACT §5.7). */
export function dollarRollForward(customers: CustomerRecord[], fy: number, fye: number): RetentionDollars | undefined {
  const months = fiscalYearMonths(fy, fye);
  const start = `${months[0]}-01`;
  const end = monthEndDate(months[11]!);
  const hasPrior = customers.some((c) => c.revenueByFiscalYear[fy - 1] !== undefined);
  if (!hasPrior) return undefined;
  const prev = (c: CustomerRecord) => c.revenueByFiscalYear[fy - 1] ?? 0;
  const cur = (c: CustomerRecord) => c.revenueByFiscalYear[fy] ?? 0;
  let startingRevenue = 0;
  let churn = 0;
  let downsell = 0;
  let upsell = 0;
  let newRevenue = 0;
  let lostInYearRevenue = 0;
  for (const c of customers) {
    // A customer without dates is classified from its revenue: new when the prior year is nil, lost when this year is.
    const dated = !!c.startDate;
    // Carried into the year: active on its eve, so a customer whose last day is the year's first day is lost in the year.
    const activeAtStart = dated ? customerActiveAt(c, dayBefore(start), fye) : prev(c) > 0;
    const startedInYear = dated ? c.startDate! >= start && c.startDate! <= end : prev(c) <= 0 && cur(c) > 0;
    const lostInYear = dated ? !!c.endDate && c.endDate >= start && c.endDate <= end : prev(c) > 0 && cur(c) <= 0;
    if (activeAtStart) startingRevenue += prev(c);
    if (activeAtStart && lostInYear) {
      churn += prev(c);
      lostInYearRevenue += cur(c);
    }
    if (activeAtStart && !lostInYear) {
      const d = cur(c) - prev(c);
      if (d < 0) downsell += -d;
      else upsell += d;
    }
    if (startedInYear) newRevenue += cur(c);
  }
  const endingRevenue = startingRevenue - churn - downsell + upsell + newRevenue;
  return {
    startingRevenue,
    churn,
    downsell,
    upsell,
    newRevenue,
    endingRevenue,
    gdr: startingRevenue ? (startingRevenue - churn - downsell) / startingRevenue : 0,
    ndr: startingRevenue ? (startingRevenue - churn - downsell + upsell) / startingRevenue : 0,
    lostInYearRevenue,
  };
}

export function tenureYears(startDate: string | undefined, asOf: string): number {
  if (!startDate) return 0;
  return Math.max(0, daysBetween(startDate, asOf) / 365.25);
}

export interface CustomerContext {
  list: CustomerList;
  /** The window revenue is priced over (concentration, mix): the latest window, or the latest fiscal year for a list by fiscal year. */
  period: PeriodColumn;
  /** The latest full window, over which the LTM count roll-forward runs (dates are exact for any window); defaults to `period`. */
  countWindow?: PeriodColumn;
  fye: number;
  asOfDate: string;
  asOfMonth: MonthKey;
  years: number[];
  pnlRevenueByFy: Record<number, number>;
  gridMonths?: MonthKey[];
  /** Further windows for the count roll-forward (the YTD columns and the prior-year LTM). */
  windows?: PeriodColumn[];
}

export function customerAnalytics(ctx: CustomerContext): CustomerAnalytics {
  const { list, period, fye, asOfDate, years } = ctx;
  const months = monthRange(period.start, period.end);
  const revenue = new Map<string, number>();
  for (const c of list.customers) revenue.set(c.id, customerRevenueInWindow(c, months, fye));
  const residualRevenue = list.residual ? customerRevenueInWindow(list.residual, months, fye) : 0;
  const codedTotal = [...revenue.values()].reduce((s, v) => s + v, 0);
  const total = codedTotal + residualRevenue;

  // Concentration: the coded accounts in revenue order for the window.
  const ranked = [...list.customers].sort((a, b) => revenue.get(b.id)! - revenue.get(a.id)! || a.id.localeCompare(b.id));
  let cumulative = 0;
  const top: ConcentrationRow[] = ranked.slice(0, 20).map((c) => {
    const rev = revenue.get(c.id)!;
    cumulative += rev;
    return {
      id: c.id,
      type: c.type,
      since: c.startDate ? Number(c.startDate.slice(0, 4)) : undefined,
      tenureYears: tenureYears(c.startDate, asOfDate),
      revenue: rev,
      pctOfTotal: total ? rev / total : 0,
      cumulativePct: total ? cumulative / total : 0,
    };
  });
  const share = (n: number) => (total ? ranked.slice(0, n).reduce((s, c) => s + revenue.get(c.id)!, 0) / total : 0);
  const topSum = top.reduce((s, r) => s + r.revenue, 0);

  // Mix by type over the same window: a customer counts when it had revenue in a fiscal year the window touches, or is active at the as-of date.
  const touched = touchedYears(years.concat(Object.keys(list.totalsByFiscalYear).map(Number)), period, fye);
  const types = new Map<string, { count: number; revenue: number }>();
  for (const c of list.customers) {
    const rev = revenue.get(c.id)!;
    if (!touched.some((y) => (c.revenueByFiscalYear[y] ?? 0) > 0) && !customerActiveAt(c, asOfDate, fye)) continue;
    const t = c.type ?? "Unclassified";
    const cur = types.get(t) ?? { count: 0, revenue: 0 };
    cur.count++;
    cur.revenue += rev;
    types.set(t, cur);
  }
  const mixRows = [...types.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const codedCount = mixRows.reduce((s, [, v]) => s + v.count, 0);
  const mixByType: CustomerAnalytics["mixByType"] = mixRows.map(([type, v]) => ({
    type,
    count: v.count,
    countPct: codedCount ? v.count / codedCount : 0,
    revenue: v.revenue,
    revenuePct: total ? v.revenue / total : 0,
    avgRevenue: v.count ? v.revenue / v.count : 0,
  }));
  if (list.residual) {
    const latestFy = period.fiscalYear ?? years[years.length - 1]!;
    const count = list.residual.countByFiscalYear?.[latestFy] ?? 0;
    mixByType.push({ type: list.residual.label, count, countPct: 0, revenue: residualRevenue, revenuePct: total ? residualRevenue / total : 0, avgRevenue: count ? residualRevenue / count : 0, residual: true });
  }

  const latestCount = list.customers.filter((c) => customerActiveAt(c, asOfDate, fye)).length;
  const latestFy = years[years.length - 1]!;
  const customerTotal = list.totalsByFiscalYear[latestFy] ?? 0;
  const pnlRevenue = ctx.pnlRevenueByFy[latestFy] ?? 0;

  const out: CustomerAnalytics = {
    term: list.term,
    period,
    latestCount,
    mixByType,
    concentration: {
      top,
      top10Share: share(10),
      top20Share: share(20),
      largestShare: share(1),
      remaining: total - topSum,
      total,
      tieToPnl: { customerTotal, pnlRevenue, variancePct: pnlRevenue ? (customerTotal - pnlRevenue) / pnlRevenue : 0 },
    },
  };

  // Retention needs dates (counts) or two years of revenue (dollars).
  const dated = list.customers.filter((c) => c.startDate);
  const yearsWithRevenue = new Set(list.customers.flatMap((c) => Object.keys(c.revenueByFiscalYear).map(Number)));
  if (dated.length >= 2 || yearsWithRevenue.size >= 2) {
    const byFiscalYear: Record<number, { counts: RetentionCounts; dollars: RetentionDollars }> = {};
    for (const fy of years) {
      const ms = fiscalYearMonths(fy, fye);
      const counts = countRollForward(dated, `${ms[0]}-01`, monthEndDate(ms[11]!));
      const dollars = dollarRollForward(list.customers, fy, fye);
      byFiscalYear[fy] = { counts, dollars: dollars ?? emptyDollars() };
    }
    const countWindow = ctx.countWindow ?? period;
    const ltmCounts = countRollForward(dated, `${countWindow.start}-01`, monthEndDate(countWindow.end));
    // The grid's months plus the LTM strip's thirteen (its hidden prior month included), which a 12-month grid does not
    // reach; counts come from the dates, so any month can be counted.
    const stripMonths = [...new Set([...(ctx.gridMonths ?? months), ...(ctx.gridMonths ? monthRange(addMonths(ctx.asOfMonth, -12), ctx.asOfMonth) : [])])].sort();
    const monthly = stripMonths.map((m) => ({ month: m, counts: countRollForward(dated, `${m}-01`, monthEndDate(m)) }));
    const active = dated.filter((c) => customerActiveAt(c, asOfDate, fye)).map((c) => tenureYears(c.startDate, asOfDate)).sort((a, b) => a - b);
    const medianTenureYears = active.length ? (active.length % 2 ? active[(active.length - 1) / 2]! : (active[active.length / 2 - 1]! + active[active.length / 2]!) / 2) : 0;
    // Customer revenue exists by fiscal year only, so the LTM dollar bridge is the latest fiscal year's when the windows coincide.
    const latestMonths = fiscalYearMonths(latestFy, fye);
    const ltmIsLatestFy = countWindow.start === latestMonths[0] && countWindow.end === latestMonths[11];
    const byWindow = Object.fromEntries((ctx.windows ?? []).map((w) => [w.key, countRollForward(dated, `${w.start}-01`, monthEndDate(w.end))]));
    out.retention = { byFiscalYear, ltm: { counts: ltmCounts, dollars: ltmIsLatestFy ? byFiscalYear[latestFy]!.dollars : emptyDollars() }, byWindow, monthly, medianTenureYears, ...(list.customers.some((c) => !c.startDate) ? { revenueInferred: true } : {}) };

    // Cohorts by the fiscal year of the start date, when three or more fall inside the window (FY-4 onward);
    // earlier starts share one "Pre-" row so the triangle still accounts for every dated customer.
    const cohortOf = (c: CustomerRecord) => {
      const [y, m] = c.startDate!.split("-").map(Number) as [number, number];
      return fiscalYearOf(y, m, fye);
    };
    const firstCohort = years[0]! - 2;
    const inWindow = [...new Set(dated.map(cohortOf))].filter((y) => y >= firstCohort && y <= latestFy).sort((a, b) => a - b);
    if (inWindow.length >= 3) {
      const yearEnd = (fy: number) => monthEndDate(fiscalYearMonths(fy, fye)[11]!);
      const pre = dated.filter((c) => cohortOf(c) < firstCohort);
      const groups = [
        ...(pre.length ? [{ cohort: firstCohort - 1, label: `Pre-FY${firstCohort}`, pre: true as const, members: pre }] : []),
        ...inWindow.map((cohort) => ({ cohort, label: `FY${cohort}`, pre: undefined, members: dated.filter((c) => cohortOf(c) === cohort) })),
      ];
      const tagged = <T extends object>(g: (typeof groups)[number], rest: T) => ({ cohort: g.cohort, label: g.label, ...(g.pre ? { pre: g.pre } : {}), ...rest });
      out.cohorts = {
        countTriangle: groups.map((g) => tagged(g, { size: g.members.length, retainedByYear: years.filter((y) => y >= g.cohort).map((y) => g.members.filter((c) => customerActiveAt(c, yearEnd(y), fye)).length) })),
        revenueTriangle: groups.map((g) => {
          const first = years.find((y) => y >= g.cohort) ?? g.cohort;
          return tagged(g, { revenue: g.members.reduce((s, c) => s + (c.revenueByFiscalYear[first] ?? 0), 0), retainedByYear: years.filter((y) => y >= g.cohort).map((y) => g.members.reduce((s, c) => s + (c.revenueByFiscalYear[y] ?? 0), 0)) });
        }),
        tie: {
          activeByYear: years.map((y) => dated.filter((c) => customerActiveAt(c, yearEnd(y), fye)).length),
          // Revenue of customers started by that year-end: the rows cover exactly them.
          revenueByYear: years.map((y) => dated.filter((c) => c.startDate! <= yearEnd(y)).reduce((s, c) => s + (c.revenueByFiscalYear[y] ?? 0), 0)),
        },
      };
    }
  }
  return out;
}

function emptyDollars(): RetentionDollars {
  return { startingRevenue: 0, churn: 0, downsell: 0, upsell: 0, newRevenue: 0, endingRevenue: 0, gdr: 0, ndr: 0 };
}

// --- Payroll -------------------------------------------------------------------------

/**
 * FTE-years an employee worked inside [start, end]: FTE × days on payroll ÷
 * days in the window. The last day on payroll is the day before termination,
 * as `onPayrollAt` counts it; the workbook's helper column uses the same days.
 */
export function fteYears(e: PayrollRecord, start: string, end: string): number {
  const last = e.terminationDate ? dayBefore(e.terminationDate) : end;
  const from = e.hireDate > start ? e.hireDate : start;
  const to = last < end ? last : end;
  const days = daysBetween(from, to) + 1;
  return days > 0 ? (e.fte * days) / (daysBetween(start, end) + 1) : 0;
}

/** On payroll at `date`: hired on or before it and not terminated on or before it (DATA_CONTRACT §5.8). */
export function onPayrollAt(e: PayrollRecord, date: string): boolean {
  return e.hireDate <= date && (!e.terminationDate || e.terminationDate > date);
}

const FIELD_DEPARTMENT = /field|install|technician|service|crew/i;

export function isFieldDepartment(department: string): boolean {
  return FIELD_DEPARTMENT.test(department);
}

export interface HeadcountContext {
  register: PayrollRegister;
  asOfDate: string;
  years: number[];
  fye: number;
  /** Revenue and payroll of the latest full window (LTM, or the latest FY in annual mode), for the load ratios. */
  /** The latest window's revenue and payroll, and the owner's employer payroll taxes the payroll line carries ([S4]). */
  window: { revenue: number; payroll: number; ownerPayrollTaxes?: number };
  /**
   * The register's grain is the fiscal year, so department compensation, its
   * % of revenue and the C13 tie use the latest full fiscal year's figures.
   */
  fiscalYear: { year: number; revenue: number; payroll: number; ownerTaxes: number; wages?: { total: number; accounts: string[] } };
  customersLatest?: number;
  gridMonths?: MonthKey[];
}

export function headcountAnalytics(ctx: HeadcountContext): HeadcountAnalytics {
  const { register, asOfDate, years, fye } = ctx;
  const staff = register.employees.filter((e) => !e.isOwner);
  const current = staff.filter((e) => onPayrollAt(e, asOfDate));
  const latestHeadcount = current.reduce((s, e) => s + e.fte, 0);
  const latestFieldHeadcount = current.filter((e) => isFieldDepartment(e.department)).reduce((s, e) => s + e.fte, 0);
  const fy = ctx.fiscalYear.year;
  // Employer costs: the file's own, or the P&L payroll line's taxes and benefits (the line less its wage accounts, or less
  // staff wages when the P&L shows none) less the owner's [S4] taxes, spread over staff pro rata to wages. The Headcount tab
  // computes the same by formula, so no allocated figure is typed into the raw register.
  const staffWages = staff.reduce((s, e) => s + (e.wagesByFiscalYear[fy] ?? 0), 0);
  const fromFile = !!register.employerCostsFromFile;
  const pool = ctx.fiscalYear.payroll - (ctx.fiscalYear.wages?.total ?? staffWages);
  const staffCosts = fromFile ? staff.reduce((s, e) => s + (e.employerCostsByFiscalYear[fy] ?? 0), 0) : Math.max(0, pool - ctx.fiscalYear.ownerTaxes);
  const comp = (e: PayrollRecord) => (e.wagesByFiscalYear[fy] ?? 0) + (fromFile ? (e.employerCostsByFiscalYear[fy] ?? 0) : staffWages ? ((e.wagesByFiscalYear[fy] ?? 0) * staffCosts) / staffWages : 0);

  const departments = [...new Set(staff.map((e) => e.department))];
  const fyMonths = fiscalYearMonths(fy, fye);
  const fyStart = `${fyMonths[0]}-01`;
  const fyEnd = monthEndDate(fyMonths[11]!);
  const byDepartment = departments
    .map((department) => {
      const members = staff.filter((e) => e.department === department);
      const onboard = members.filter((e) => onPayrollAt(e, asOfDate));
      const count = onboard.reduce((s, e) => s + e.fte, 0);
      const totalComp = members.reduce((s, e) => s + comp(e), 0);
      // Pay covers everyone on payroll during the year, leavers included, so the average divides by the year's average FTE, not the year-end count.
      const avgFte = members.reduce((s, e) => s + fteYears(e, fyStart, fyEnd), 0);
      const avgTenureYears = onboard.length ? onboard.reduce((s, e) => s + tenureYears(e.hireDate, asOfDate), 0) / onboard.length : 0;
      return { department, count, avgFte, totalComp, avgComp: avgFte ? totalComp / avgFte : 0, pctRevenue: ctx.fiscalYear.revenue ? totalComp / ctx.fiscalYear.revenue : 0, avgTenureYears };
    })
    .sort((a, b) => b.totalComp - a.totalComp);

  const rollForwardByFiscalYear: HeadcountAnalytics["rollForwardByFiscalYear"] = {};
  for (const y of years) {
    const ms = fiscalYearMonths(y, fye);
    const start = `${ms[0]}-01`;
    const end = monthEndDate(ms[11]!);
    const startCount = staff.filter((e) => onPayrollAt(e, dayBefore(start))).length;
    const hires = staff.filter((e) => e.hireDate >= start && e.hireDate <= end).length;
    const departed = staff.filter((e) => e.terminationDate && e.terminationDate >= start && e.terminationDate <= end);
    const departuresByType: Record<string, number> = {};
    for (const e of departed) departuresByType[e.terminationType ?? "unclassified"] = (departuresByType[e.terminationType ?? "unclassified"] ?? 0) + 1;
    rollForwardByFiscalYear[y] = { start: startCount, hires, departures: departed.length, departuresByType, end: startCount + hires - departed.length };
  }

  const monthly = ctx.gridMonths?.map((m) => {
    const start = `${m}-01`;
    const end = monthEndDate(m);
    return {
      month: m,
      hires: staff.filter((e) => e.hireDate >= start && e.hireDate <= end).length,
      departures: staff.filter((e) => e.terminationDate && e.terminationDate >= start && e.terminationDate <= end).length,
      end: staff.filter((e) => onPayrollAt(e, end)).length,
    };
  });

  const tenureAtDeparture = TENURE_BUCKETS.map((bucket) => ({ bucket, count: 0 }));
  for (const e of staff) {
    if (!e.terminationDate) continue;
    const b = tenureBucket(monthsBetween(e.hireDate, e.terminationDate));
    tenureAtDeparture.find((t) => t.bucket === b)!.count++;
  }

  // C13 compares what the register and the P&L state independently: staff wages against the P&L wage accounts; with employer
  // costs in the file, the register's wages and costs (the owner's employer costs included) against the payroll line. An
  // allocated cost ties by construction, so it never enters the tie.
  const ownerFileCosts = register.employees.filter((e) => e.isOwner).reduce((s, e) => s + (e.employerCostsByFiscalYear[fy] ?? 0), 0);
  const wagesAccounts = ctx.fiscalYear.wages;
  const tieToPnl: HeadcountAnalytics["tieToPnl"] = wagesAccounts
    ? { registerTotal: staffWages, pnlPayroll: wagesAccounts.total, variancePct: wagesAccounts.total ? (staffWages - wagesAccounts.total) / wagesAccounts.total : 0, basis: "wages" }
    : fromFile
      ? { registerTotal: staffWages + staffCosts + ownerFileCosts, pnlPayroll: ctx.fiscalYear.payroll, variancePct: ctx.fiscalYear.payroll ? (staffWages + staffCosts + ownerFileCosts - ctx.fiscalYear.payroll) / ctx.fiscalYear.payroll : 0, basis: "payroll" }
      : { registerTotal: staffWages, pnlPayroll: ctx.fiscalYear.payroll, variancePct: 0, basis: "none" };
  return {
    asOf: asOfDate,
    latestHeadcount,
    latestFieldHeadcount,
    byDepartment,
    rollForwardByFiscalYear,
    monthly,
    tenureAtDeparture,
    loadRatios: {
      revenuePerEmployee: latestHeadcount ? ctx.window.revenue / latestHeadcount : 0,
      revenuePerFieldEmployee: latestFieldHeadcount ? ctx.window.revenue / latestFieldHeadcount : 0,
      customersPerEmployee: ctx.customersLatest !== undefined && latestHeadcount ? ctx.customersLatest / latestHeadcount : undefined,
      // Excludes the owner as the P&L Summary KPI of the same label does: his employer taxes come out with him.
      laborCostPctRevenue: ctx.window.revenue ? (ctx.window.payroll - (ctx.window.ownerPayrollTaxes ?? 0)) / ctx.window.revenue : 0,
    },
    tieToPnl,
    employerCosts: { from: fromFile ? "file" : "allocated", pool, ownerTaxes: ctx.fiscalYear.ownerTaxes, staff: staffCosts, staffWages, pnlWageAccounts: wagesAccounts?.accounts ?? [] },
  };
}


/** A P&L payroll account that holds gross pay (wages, salaries, commission), not the employer taxes and benefits on it. */
export function isWageAccount(account: string): boolean {
  return /wage|salar|commission|bonus|overtime/i.test(account) && !/tax|insurance|benefit|401|retire|pension|workers/i.test(account);
}
