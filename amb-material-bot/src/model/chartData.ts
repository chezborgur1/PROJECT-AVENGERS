// The chart exhibits of guide 5.12, as engine values. The workbook lays each
// exhibit out as a chart-data block of formulas and draws its chart from
// those cells; the values here are what the formulas must evaluate to and
// what the chart caches hold, so a chart renders before recalculation and
// verifyWorkbook can compare the two.

import { monthEndDate, monthRange, type FinancialDataset, type MonthKey } from "../domain/financials.ts";
import { TENURE_BUCKETS } from "./analytics.ts";
import type { ChartExhibit, ChartSeriesData, ModelOutput } from "./types.ts";

/** Guide 5.12 palette, role by role (srgbClr hex only). */
export const CHART_COLOR = {
  single: "7B0000",
  gain: "7B0000",
  loss: "5E5552",
  lossTypes: ["5E5552", "DCC7C4", "C49A5B"],
  mix: ["7B0000", "C49A5B", "5E5552", "DCC7C4"],
  separator: "FFFFFF",
  ratioLine: "7B0000",
  axis: "C2BAB8",
  axisLabel: "7A706D",
  label: "2C2523",
} as const;

const K = 1000;
const OPERATING_NON_PAYROLL = new Set(["rent", "marketing", "other_opex"]);
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
/** A loss type with no event in the window stays out of the stack and its legend. */
const drawn = (s: ChartSeriesData) => s.values.some((v) => v !== 0);

/**
 * Every exhibit whose data trigger holds, in catalogue order. None without
 * at least 12 months of monthly P&L (the window rule of 5.12).
 */
export function chartExhibits(ds: FinancialDataset, out: Pick<ModelOutput, "monthly" | "columns" | "periods" | "databook" | "customers" | "headcount">): ChartExhibit[] {
  const monthly = out.monthly;
  if (!monthly) return [];
  const window = monthRange(monthly.chartWindow.start, monthly.chartWindow.end);
  if (window.length < 12) return [];
  const idx = window.map((m) => monthly.months.findIndex((x) => x.key === m));
  const pick = (key: string) => idx.map((i) => monthly.series[key]?.[i] ?? 0);
  const inMonth = (date: string | undefined, m: MonthKey) => !!date && date >= `${m}-01` && date <= monthEndDate(m);
  const exhibits: ChartExhibit[] = [];
  const add = (e: ChartExhibit) => {
    // An exhibit with nothing to draw is left out rather than printed as an empty frame.
    if (e.series.some((s) => s.plotted !== false && s.values.some((v) => v !== 0))) exhibits.push(e);
  };

  // Money exhibits switch to $M above 1,000 ($000s) over more than 24 bars (5.12 label density).
  const money = (values: number[][]): { units: "$000s" | "$M"; scale: number } => {
    const max = Math.max(...values.flat().map(Math.abs));
    return max / K >= 1000 && window.length > 24 ? { units: "$M", scale: K * K } : { units: "$000s", scale: K };
  };
  const revenue = pick("revenue");
  const revenueRow = (scale: number, plotted = false): ChartSeriesData => ({ key: "revenue", name: "Total Revenue", values: revenue.map((v) => v / scale), color: CHART_COLOR.single, source: { kind: "monthly", rowKey: "revenue" }, plotted });

  // MC-R1, MC-R2.
  {
    const m = money([revenue]);
    add({ id: "MC-R1", tab: "revenueCharts", title: "Monthly Total Revenue", units: m.units, form: "bar", categories: window, monthly: true, series: [revenueRow(m.scale, true)], note: "Total revenue by month, net of discounts and refunds. Source: Monthly P&L." });
    const lines = out.periods[out.columns.find((c) => !c.projected)!.key]!.revenueLines;
    const isContra = (account: string) => pick(`rev:${account}`).every((v) => v <= 0) && pick(`rev:${account}`).some((v) => v < 0);
    const contra = lines.filter((l) => monthly.series[`rev:${l.account}`] && isContra(l.account));
    const service = lines.filter((l) => !contra.includes(l));
    if (service.length >= 2) {
      const ltm = (key: string) => pick(key).slice(-12).reduce((s, v) => s + v, 0);
      const top = [...service].sort((a, b) => ltm(`rev:${b.account}`) - ltm(`rev:${a.account}`)).slice(0, 3);
      const series: ChartSeriesData[] = top.map((l, i) => ({ key: `line${i}`, name: l.label, values: pick(`rev:${l.account}`).map((v) => v / m.scale), color: CHART_COLOR.mix[i]!, source: { kind: "monthly", rowKey: `rev:${l.account}` } }));
      // Discounts and refunds are negative; they stay in the data block (so the rows still sum to total revenue, C21) but out of the stack.
      const discounts = contra.length ? window.map((_, i) => contra.reduce((s, l) => s + pick(`rev:${l.account}`)[i]!, 0)) : undefined;
      const feeds: ChartSeriesData[] = discounts ? [{ key: "discounts", name: "Less: discounts and refunds", values: discounts.map((v) => v / m.scale), color: CHART_COLOR.mix[3]!, source: { kind: "monthly", rowKey: "rev_contra" }, plotted: false }] : [];
      if (service.length > top.length) {
        // "Other" is total revenue less the lines shown and the discounts, so every row adds back to total revenue.
        const values = revenue.map((v, i) => (v - top.reduce((s, l) => s + pick(`rev:${l.account}`)[i]!, 0) - (discounts?.[i] ?? 0)) / m.scale);
        series.push({ key: "other", name: "Other", values, color: CHART_COLOR.mix[3]!, source: { kind: "remainder", total: "revenue", less: [...series.map((s) => s.key), ...feeds.map((f) => f.key)] } });
      }
      const discountShare = discounts ? -discounts.slice(-12).reduce((s, v) => s + v, 0) / ltm("revenue") : 0;
      add({
        id: "MC-R2",
        tab: "revenueCharts",
        title: "Monthly Revenue by Line",
        units: m.units,
        form: "stacked",
        categories: window,
        monthly: true,
        series: [...series, ...feeds, revenueRow(m.scale)],
        note: `The ${service.length > top.length ? "three largest lines and Other" : "revenue lines"} before discounts and refunds${discounts ? ` (${(discountShare * 100).toFixed(1)}% of revenue over the last twelve months, not drawn)` : ""}. Source: Monthly P&L.`,
      });
    }
  }

  // MC-E1 (payroll; the register has no department wages by month) and MC-E4 (largest non-payroll operating account).
  {
    const payroll = pick("payroll");
    const m = money([payroll]);
    add({
      id: "MC-E1",
      tab: "expenseCharts",
      title: "Monthly Payroll",
      units: m.units,
      form: "bar",
      categories: window,
      monthly: true,
      series: [
        { key: "payroll", name: "Salaries, Wages and Benefits", values: payroll.map((v) => v / m.scale), color: CHART_COLOR.single, source: { kind: "monthly", rowKey: "payroll" } },
        revenueRow(m.scale),
        { key: "payrollPct", name: "Payroll % of Revenue", values: payroll.map((v, i) => (revenue[i] ? v / revenue[i]! : 0)), color: CHART_COLOR.ratioLine, source: { kind: "ratio", numerator: "payroll", denominator: "revenue" }, plotted: false },
      ],
      ratio: "payrollPct",
      note: "Salaries, wages and benefits, excluding owner compensation. Ratio panel: payroll ÷ total revenue, same months. Source: Monthly P&L.",
    });
    const accounts = (out.databook?.pnl ?? []).filter((r) => OPERATING_NON_PAYROLL.has(r.category) && monthly.series[`acct:${r.account}`]);
    const ltm = (account: string) => pick(`acct:${account}`).slice(-12).reduce((s, v) => s + v, 0);
    const largest = [...accounts].sort((a, b) => ltm(b.account) - ltm(a.account))[0];
    if (largest && ltm(largest.account) > 0) {
      const values = pick(`acct:${largest.account}`);
      const mm = money([values]);
      add({
        id: "MC-E4",
        tab: "expenseCharts",
        title: `Monthly ${titleCase(largest.account.replace(/^.*:\s*/, ""))}`,
        units: mm.units,
        form: "bar",
        categories: window,
        monthly: true,
        series: [
          { key: "expense", name: largest.account, values: values.map((v) => v / mm.scale), color: CHART_COLOR.single, source: { kind: "account", account: largest.account } },
          revenueRow(mm.scale),
          { key: "expensePct", name: "% of Revenue", values: values.map((v, i) => (revenue[i] ? v / revenue[i]! : 0)), color: CHART_COLOR.ratioLine, source: { kind: "ratio", numerator: "expense", denominator: "revenue" }, plotted: false },
        ],
        ratio: "expensePct",
        note: `The largest operating expense account outside payroll over the last twelve months. Ratio panel: ${largest.account.toLowerCase()} ÷ total revenue, same months. Source: Databook.`,
      });
    }
  }

  // MC-C1, MC-C2, MC-C4-C5 (MC-C3 needs customer revenue by month, which the list does not carry).
  const list = ds.customers;
  if (list && out.customers?.retention && list.customers.some((c) => c.startDate)) {
    const term = out.customers.term;
    const coded = list.customers;
    const counts = (pred: (c: (typeof coded)[number], m: MonthKey) => boolean, sign = 1) => window.map((m) => sign * coded.filter((c) => pred(c, m)).length);
    const won = (type?: string) => counts((c, m) => inMonth(c.startDate, m) && (!type || c.type === type));
    const lost = (type?: string, reason?: string) => counts((c, m) => inMonth(c.endDate, m) && (!type || c.type === type) && (!reason || (c.lossReason ?? "unclassified") === reason), -1);
    const pair = (type?: string): ChartSeriesData[] => [
      { key: "new", name: `New ${term}s`, values: won(type), color: CHART_COLOR.gain, source: { kind: "customers", event: "new", type } },
      { key: "lost", name: `Lost ${term}s`, values: lost(type), color: CHART_COLOR.loss, source: { kind: "customers", event: "lost", type } },
    ];
    const source = "Source: Raw - Customers.";
    add({ id: "MC-C1", tab: "retentionCharts", title: `Monthly ${term} Wins and Losses`, units: "#", form: "diverging", categories: window, monthly: true, series: pair(), note: `Wins start in the month (first invoice or contract start); losses end in it, shown below the axis. ${source}` });
    if (coded.some((c) => c.endDate && c.lossReason && c.lossReason !== "unclassified")) {
      const reasons = [
        { reason: "regrettable" as const, name: "Regrettable Losses" },
        { reason: "non_regrettable" as const, name: "Non-regrettable Losses" },
        { reason: "unclassified" as const, name: "Unclassified Losses" },
      ];
      add({
        id: "MC-C2",
        tab: "retentionCharts",
        title: `Monthly ${term} Losses by Churn Type`,
        units: "#",
        form: "stackedDiverging",
        categories: window,
        monthly: true,
        series: [
          pair()[0]!,
          ...reasons.map((r, i) => ({ key: r.reason, name: r.name, values: lost(undefined, r.reason), color: CHART_COLOR.lossTypes[i]!, source: { kind: "customers" as const, event: "lost" as const, reason: r.reason } })).filter(drawn),
        ],
        note: `Losses by the reason coded on the ${term.toLowerCase()} list; regrettable losses sit against the axis. ${source}`,
      });
    }
    const types = [...new Set(coded.map((c) => c.type).filter((t): t is string => !!t))]
      .map((t) => ({ t, n: coded.filter((c) => c.type === t).length }))
      .filter((x) => x.n / coded.length >= 0.2 && x.n < coded.length)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2);
    types.forEach(({ t }, i) =>
      add({ id: `MC-C${4 + i}`, tab: "retentionCharts", title: `Monthly ${titleCase(t)} Wins and Losses`, units: "#", form: "diverging", categories: window, monthly: true, series: pair(t), note: `${term}s coded "${t}" on the ${term.toLowerCase()} list (20% or more of accounts). ${source}` }),
    );
  }

  // MC-H1-H5 (non-owner staff; MC-H2 and the department panels only when the register codes them).
  const staff = ds.payroll?.employees.filter((e) => !e.isOwner) ?? [];
  if (out.headcount && staff.length) {
    const counts = (pred: (e: (typeof staff)[number], m: MonthKey) => boolean, sign = 1) => window.map((m) => sign * staff.filter((e) => pred(e, m)).length);
    const hires = (department?: string) => counts((e, m) => inMonth(e.hireDate, m) && (!department || e.department === department));
    const leavers = (department?: string, type?: string) => counts((e, m) => inMonth(e.terminationDate, m) && (!department || e.department === department) && (!type || (e.terminationType ?? "unclassified") === type), -1);
    const pair = (department?: string): ChartSeriesData[] => [
      { key: "hires", name: "Hires", values: hires(department), color: CHART_COLOR.gain, source: { kind: "employees", event: "hire", department } },
      { key: "departures", name: "Departures", values: leavers(department), color: CHART_COLOR.loss, source: { kind: "employees", event: "departure", department } },
    ];
    const source = "Source: Raw - Payroll.";
    add({ id: "MC-H1", tab: "headcountCharts", title: "Monthly Hires and Departures", units: "#", form: "diverging", categories: window, monthly: true, series: pair(), note: `Non-owner employees by hire and termination date; departures below the axis. ${source}` });
    if (staff.some((e) => e.terminationDate && e.terminationType && e.terminationType !== "unclassified")) {
      const types = [
        { type: "resignation" as const, name: "Resignations" },
        { type: "termination" as const, name: "Terminations" },
        { type: "unclassified" as const, name: "Unclassified Departures" },
      ];
      add({
        id: "MC-H2",
        tab: "headcountCharts",
        title: "Monthly Departures by Type",
        units: "#",
        form: "stackedDiverging",
        categories: window,
        monthly: true,
        series: [pair()[0]!, ...types.map((t, i) => ({ key: t.type, name: t.name, values: leavers(undefined, t.type), color: CHART_COLOR.lossTypes[i]!, source: { kind: "employees" as const, event: "departure" as const, terminationType: t.type } })).filter(drawn)],
        note: `Departures by the termination type on the register; resignations sit against the axis. ${source}`,
      });
    }
    const hc = out.headcount;
    hc.byDepartment
      .filter((d) => hc.latestHeadcount && d.count / hc.latestHeadcount >= 0.2 && d.count < hc.latestHeadcount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 2)
      .forEach((d, i) =>
        add({ id: `MC-H${3 + i}`, tab: "headcountCharts", title: `Monthly ${titleCase(d.department)} Hires and Departures`, units: "#", form: "diverging", categories: window, monthly: true, series: pair(d.department), note: `Non-owner employees in ${d.department.toLowerCase()} (20% or more of headcount at the as-of date). ${source}` }),
      );
    add({
      id: "MC-H5",
      tab: "headcountCharts",
      title: "Tenure at Departure",
      units: "#",
      form: "bar",
      categories: [...TENURE_BUCKETS],
      monthly: false,
      series: [{ key: "tenure", name: "Departures", values: hc.tenureAtDeparture.map((t) => t.count), color: CHART_COLOR.single, source: { kind: "tenure" } }],
      note: "Non-owner leavers over the whole register, by months from hire to termination. Source: Headcount.",
    });
  }
  return exhibits;
}
