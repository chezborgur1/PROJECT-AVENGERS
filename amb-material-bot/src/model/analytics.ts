// Customer and payroll analytics (guide 5.5, DATA_CONTRACT §5.7-5.8): the
// count and dollar roll-forwards, concentration, cohorts, headcount by
// department and tenure buckets. The workbook computes the same figures with
// COUNTIFS / SUMIFS over helper blocks; the verifier compares the two.

import { monthEndDate, monthRange, type CustomerList, type CustomerRecord, type MonthKey, type PayrollRecord, type PayrollRegister } from "../domain/financials.ts";
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

/** Active at `date`: started on or before it and not ended before it (DATA_CONTRACT §5.7). */
export function customerActiveAt(c: CustomerRecord, date: string): boolean {
  if (!c.startDate) return true;
  if (!onOrBefore(c.startDate, date)) return false;
  return !c.endDate || c.endDate >= date;
}

/** A customer's (or the residual bucket's) revenue over a window of months: exact from months, else prorated from fiscal years. */
export function customerRevenueInWindow(rev: { revenueByMonth?: Record<MonthKey, number>; revenueByFiscalYear: Record<number, number> }, months: MonthKey[], fye: number): number {
  return amountInWindow({ byMonth: rev.revenueByMonth, byFiscalYear: rev.revenueByFiscalYear }, months, fye);
}

export function countRollForward(customers: CustomerRecord[], start: string, end: string): RetentionCounts {
  const before = dayBefore(start);
  const dated = customers.filter((c) => c.startDate);
  const startingCount = dated.filter((c) => customerActiveAt(c, before)).length;
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
  for (const c of customers) {
    const activeAtStart = !c.startDate || c.startDate < start ? customerActiveAt(c, start) : false;
    const startedInYear = !!c.startDate && c.startDate >= start && c.startDate <= end;
    const lostInYear = !!c.endDate && c.endDate >= start && c.endDate <= end;
    if (activeAtStart) startingRevenue += prev(c);
    if (activeAtStart && lostInYear) churn += prev(c);
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
  };
}

export function tenureYears(startDate: string | undefined, asOf: string): number {
  if (!startDate) return 0;
  return Math.max(0, daysBetween(startDate, asOf) / 365.25);
}

export interface CustomerContext {
  list: CustomerList;
  period: PeriodColumn;
  fye: number;
  asOfDate: string;
  asOfMonth: MonthKey;
  years: number[];
  pnlRevenueByFy: Record<number, number>;
  gridMonths?: MonthKey[];
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

  // Mix by type over the same window.
  const types = new Map<string, { count: number; revenue: number }>();
  for (const c of list.customers) {
    const rev = revenue.get(c.id)!;
    if (rev === 0 && !customerActiveAt(c, asOfDate)) continue;
    const t = c.type ?? "Unclassified";
    const cur = types.get(t) ?? { count: 0, revenue: 0 };
    cur.count++;
    cur.revenue += rev;
    types.set(t, cur);
  }
  const mixRows = [...types.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  const codedCount = mixRows.reduce((s, [, v]) => s + v.count, 0);
  const mixByType = mixRows.map(([type, v]) => ({
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
    mixByType.push({ type: list.residual.label, count, countPct: 0, revenue: residualRevenue, revenuePct: total ? residualRevenue / total : 0, avgRevenue: count ? residualRevenue / count : 0 });
  }

  const latestCount = list.customers.filter((c) => customerActiveAt(c, asOfDate)).length;
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
    const ltmCounts = countRollForward(dated, `${period.start}-01`, monthEndDate(period.end));
    const stripMonths = ctx.gridMonths ?? months;
    const monthly = stripMonths.map((m) => ({ month: m, counts: countRollForward(dated, `${m}-01`, monthEndDate(m)) }));
    const active = dated.filter((c) => customerActiveAt(c, asOfDate)).map((c) => tenureYears(c.startDate, asOfDate)).sort((a, b) => a - b);
    const medianTenureYears = active.length ? (active.length % 2 ? active[(active.length - 1) / 2]! : (active[active.length / 2 - 1]! + active[active.length / 2]!) / 2) : 0;
    out.retention = { byFiscalYear, ltm: { counts: ltmCounts, dollars: emptyDollars() }, monthly, medianTenureYears };

    // Cohorts by start year, when three or more exist inside the history.
    const cohortYears = [...new Set(dated.map((c) => Number(c.startDate!.slice(0, 4))))].sort((a, b) => a - b);
    const inWindow = cohortYears.filter((y) => y >= years[0]! - 2 && y <= latestFy);
    if (inWindow.length >= 3) {
      const yearEnd = (fy: number) => monthEndDate(fiscalYearMonths(fy, fye)[11]!);
      out.cohorts = {
        countTriangle: inWindow.map((cohort) => {
          const members = dated.filter((c) => Number(c.startDate!.slice(0, 4)) === cohort);
          const retainedByYear = years.filter((y) => y >= cohort).map((y) => members.filter((c) => customerActiveAt(c, yearEnd(y))).length);
          return { cohort, size: members.length, retainedByYear };
        }),
        revenueTriangle: inWindow.map((cohort) => {
          const members = dated.filter((c) => Number(c.startDate!.slice(0, 4)) === cohort);
          const first = years.find((y) => y >= cohort) ?? cohort;
          const revenueByYear = years.filter((y) => y >= cohort).map((y) => members.reduce((s, c) => s + (c.revenueByFiscalYear[y] ?? 0), 0));
          return { cohort, revenue: members.reduce((s, c) => s + (c.revenueByFiscalYear[first] ?? 0), 0), retainedByYear: revenueByYear };
        }),
      };
    }
  }
  return out;
}

function emptyDollars(): RetentionDollars {
  return { startingRevenue: 0, churn: 0, downsell: 0, upsell: 0, newRevenue: 0, endingRevenue: 0, gdr: 0, ndr: 0 };
}

// --- Payroll -------------------------------------------------------------------------

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
  /** Revenue and payroll of the window the load ratios and department % of revenue use (the latest full window). */
  window: { revenue: number; payroll: number; fiscalYear: number };
  customersLatest?: number;
  gridMonths?: MonthKey[];
}

export function headcountAnalytics(ctx: HeadcountContext): HeadcountAnalytics {
  const { register, asOfDate, years, fye } = ctx;
  const staff = register.employees.filter((e) => !e.isOwner);
  const current = staff.filter((e) => onPayrollAt(e, asOfDate));
  const latestHeadcount = current.reduce((s, e) => s + e.fte, 0);
  const latestFieldHeadcount = current.filter((e) => isFieldDepartment(e.department)).reduce((s, e) => s + e.fte, 0);
  const fy = ctx.window.fiscalYear;
  const comp = (e: PayrollRecord) => (e.wagesByFiscalYear[fy] ?? 0) + (e.employerCostsByFiscalYear[fy] ?? 0);

  const departments = [...new Set(staff.map((e) => e.department))];
  const byDepartment = departments
    .map((department) => {
      const members = staff.filter((e) => e.department === department);
      const onboard = members.filter((e) => onPayrollAt(e, asOfDate));
      const count = onboard.reduce((s, e) => s + e.fte, 0);
      const totalComp = members.reduce((s, e) => s + comp(e), 0);
      const avgTenureYears = onboard.length ? onboard.reduce((s, e) => s + tenureYears(e.hireDate, asOfDate), 0) / onboard.length : 0;
      return { department, count, totalComp, avgComp: count ? totalComp / count : 0, pctRevenue: ctx.window.revenue ? totalComp / ctx.window.revenue : 0, avgTenureYears };
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

  const registerTotal = register.totalsByFiscalYear[fy] ?? staff.reduce((s, e) => s + comp(e), 0);
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
      laborCostPctRevenue: ctx.window.revenue ? ctx.window.payroll / ctx.window.revenue : 0,
    },
    tieToPnl: { registerTotal, pnlPayroll: ctx.window.payroll, variancePct: ctx.window.payroll ? (registerTotal - ctx.window.payroll) / ctx.window.payroll : 0 },
  };
}

