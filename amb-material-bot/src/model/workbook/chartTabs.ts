// Chart tabs (guide 5.12): Revenue, Expense, Retention and Headcount Charts.
// Each tab prints two exhibits per landscape page (caption, chart, note) and
// keeps its chart-data block below the print area: a months row derived from
// AsOfDate, an axis-label row, and one row per series, every value a formula
// matched on the month (never the column position). A total, source-total
// and difference per row feed check C21; the charts themselves are drawn by
// charts.ts from the placements this planner records.

import { monthLabel } from "../../domain/financials.ts";
import type { ChartPlacement } from "../charts.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { ChartExhibit, ChartSeriesData, ChartTab, ModelOutput } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { DATABOOK_COL, DATABOOK_FIRST_ROW, MONTH_START, RAW_CUSTOMER_COLS, RAW_PAYROLL_COLS } from "./data.ts";
import { ASOF, S, SHEET, gridMonths, serialOfMonthStart } from "./layout.ts";

const AREA: Record<ChartTab, string> = { revenueCharts: "Revenue", expenseCharts: "Expense", retentionCharts: "Retention", headcountCharts: "Headcount" };
const EXHIBIT_ROWS = 19;
const LAST_CHART_COL = 13;
const FIRST_DATA_COL = 3;
const ROW_PT = 12;
const LABEL_FORMAT = { "$000s": "#,##0;(#,##0);;", $M: "#,##0.0;(#,##0.0);;", "#": "#,##0;(#,##0);;" } as const;

/** The category-axis label: every month up to 24, quarter starts only above that (LibreOffice ignores tickLblSkip). */
const axisLabel = (m: string, n: number) => (n <= 24 || (Number(m.slice(5)) - 1) % 3 === 0 ? monthLabel(m) : "");

/** First row of the k-th exhibit: two per page, page 1 under the header rows, later pages after a spacer row (5.12). */
const exhibitTop = (k: number) => (k < 2 ? 5 + EXHIBIT_ROWS * k : 44 + 39 * (Math.floor(k / 2) - 1) + EXHIBIT_ROWS * (k % 2));

/** Columns of the chart-data block's check (C21): chart total, source total, difference. */
export function chartCheckCols(model: ModelOutput): { total: number; source: number; diff: number } {
  const n = windowLength(model);
  return { total: FIRST_DATA_COL + n + 1, source: FIRST_DATA_COL + n + 2, diff: FIRST_DATA_COL + n + 3 };
}

const windowLength = (model: ModelOutput) => Math.max(...(model.charts ?? []).filter((e) => e.monthly).map((e) => e.categories.length), 5);

export function planChartTab(ctx: TabContext, tab: ChartTab): SheetBuilder | undefined {
  const { model } = ctx;
  const exhibits = (model.charts ?? []).filter((e) => e.tab === tab);
  if (!exhibits.length) return undefined;
  const b = new SheetBuilder(tab, SHEET[tab]);
  const n = windowLength(model);
  const lastMonthCol = FIRST_DATA_COL + n - 1;
  const check = chartCheckCols(model);
  b.width(2, WIDTH.label);
  b.widths(FIRST_DATA_COL, Math.max(LAST_CHART_COL, lastMonthCol), WIDTH.value);
  b.spacerCol(lastMonthCol + 1);
  b.widths(check.total, check.diff, 11);
  const units = [...new Set(exhibits.map((e) => e.units)), ...(exhibits.some((e) => e.ratio) ? ["%"] : [])].join(", ");
  b.anatomy({ subtitle: `${AREA[tab]} Charts (${units})`, lastCol: LAST_CHART_COL });

  const lastNote = exhibitTop(exhibits.length - 1) + EXHIBIT_ROWS - 2;
  const dataTop = lastNote + 3;
  const monthsRow = dataTop + 1;
  const axisRow = dataTop + 2;
  const month = (c: number) => addr(monthsRow, c, { row: true });
  const firstMonth = addr(monthsRow, FIRST_DATA_COL, { row: true, col: true });
  const lastMonth = addr(monthsRow, lastMonthCol, { row: true, col: true });
  const window = exhibits.find((e) => e.monthly)?.categories ?? [];

  // Chart-data header, months (derived from AsOfDate, never typed) and the axis labels the category axis reads.
  for (let c = 2; c <= check.diff; c++) if (c !== lastMonthCol + 1) b.cell(dataTop, c, { style: "header", v: c === 2 ? "Chart Data" : null, role: "text", align: c === 2 ? { horizontal: "left" } : undefined });
  ["Chart Total", "Source Total", "Diff"].forEach((h, i) => b.cell(dataTop, check.total + i, { style: "header", v: h, role: "text", align: { horizontal: "right" } }));
  b.text(monthsRow, 2, "Month");
  b.text(axisRow, 2, "Axis Label", { style: "helper" });
  if (window.length) {
    window.forEach((m, i) => {
      const c = FIRST_DATA_COL + i;
      const f = i === 0 ? `EOMONTH(${ASOF},-${n})+1` : `EDATE(${addr(monthsRow, c - 1)},1)`;
      b.formula(monthsRow, c, f, { fmt: FMT.monthHeader, role: i === 0 ? "link" : "calc", expect: serialOfMonthStart(m), label: `chart month ${m}` });
      b.formula(axisRow, c, `IF(COUNT(${firstMonth}:${lastMonth})<=24,TEXT(${month(c)},"mmm-yy"),IF(MOD(MONTH(${month(c)})-1,3)=0,TEXT(${month(c)},"mmm-yy"),""))`, {
        style: "helper",
        role: "helper",
        expect: axisLabel(m, n),
        label: `axis label ${m}`,
      });
    });
    // The first chart tab owns the window names every caption reads.
    if ((model.charts ?? []).find((e) => e.monthly)?.tab === tab) {
      b.defineName("ChartStart", firstMonth);
      b.defineName("ChartEnd", lastMonth);
    }
  }

  const placements: ChartPlacement[] = [];
  let r = axisRow + 2;
  const firstSeriesRow = r;
  exhibits.forEach((e, k) => {
    const top = exhibitTop(k);
    // Caption (a formula on the window names, units last), chart rows, note.
    const caption = e.monthly ? `"${e.title}, "&TEXT(ChartStart,"mmm-yy")&" – "&TEXT(ChartEnd,"mmm-yy")&" (${e.units})"` : undefined;
    const captionText = e.monthly ? `${e.title}, ${monthLabel(window[0]!)} – ${monthLabel(window.at(-1)!)} (${e.units})` : `${e.title} (${e.units})`;
    if (caption) b.formula(top, 2, caption, { style: "chartTitle", role: "text", expect: captionText, label: `${e.id} caption` });
    else b.text(top, 2, captionText, { style: "chartTitle" });
    b.note(top + EXHIBIT_ROWS - 2, 2, e.note, { align: { wrap: false } });

    // Chart-data rows for this exhibit.
    b.text(r, 2, `${e.id}: ${e.title}`, { font: { bold: true } });
    r++;
    // Monthly exhibits read the axis-label row; others (tenure buckets, types) carry their own category row, whose labels are not months.
    const categoryRow = e.monthly ? axisRow : r;
    const categories = { ref: `'${SHEET[tab]}'!${addr(categoryRow, FIRST_DATA_COL, { row: true, col: true })}:${addr(categoryRow, FIRST_DATA_COL + e.categories.length - 1, { row: true, col: true })}`, labels: e.monthly ? e.categories.map((m) => axisLabel(m, n)) : e.categories };
    if (!e.monthly) {
      b.text(r, 2, "Category", { style: "helper" });
      e.categories.forEach((label, i) => b.text(r, FIRST_DATA_COL + i, label, { style: "helper", align: { horizontal: "right" } }));
      r++;
    }
    const rowOfSeries: Record<string, number> = {};
    for (const s of e.series) rowOfSeries[s.key] = r++;
    for (const s of e.series) writeSeriesRow(b, ctx, e, s, rowOfSeries, { monthsRow, firstMonth, lastMonth, check });
    r++;

    const ref = (s: ChartSeriesData) => ({
      nameRef: `'${SHEET[tab]}'!${addr(rowOfSeries[s.key]!, 2, { row: true, col: true })}`,
      name: s.name,
      ref: `'${SHEET[tab]}'!${addr(rowOfSeries[s.key]!, FIRST_DATA_COL, { row: true, col: true })}:${addr(rowOfSeries[s.key]!, FIRST_DATA_COL + e.categories.length - 1, { row: true, col: true })}`,
      values: s.values,
      color: s.color,
    });
    const drawn = e.series.filter((s) => s.plotted !== false);
    const stacked = e.form === "stacked" || e.form === "stackedDiverging";
    const barRows = e.ratio ? 11 : 16;
    placements.push({
      id: e.id,
      fromRow: top + 1,
      toRow: top + barRows,
      heightPt: barRows * ROW_PT,
      kind: "bar",
      grouping: stacked ? "stacked" : "clustered",
      categories,
      series: drawn.map(ref),
      labelFormat: stacked ? undefined : LABEL_FORMAT[e.units],
      valueAxis: stacked ? { visible: true, format: LABEL_FORMAT[e.units], majorUnit: niceStep(drawn, stacked, 4, e.units === "#") } : { visible: false, format: LABEL_FORMAT[e.units] },
      categoryAxis: !e.ratio,
      legend: drawn.length >= 2,
    });
    if (e.ratio) {
      const ratio = e.series.find((s) => s.key === e.ratio)!;
      placements.push({
        id: `${e.id} ratio`,
        fromRow: top + barRows + 1,
        toRow: top + 16,
        heightPt: (16 - barRows) * ROW_PT,
        kind: "line",
        grouping: "clustered",
        categories,
        series: [ref(ratio)],
        valueAxis: { visible: true, format: "0%;(0%);;", min0: true, majorUnit: niceStep([ratio], false, 3) },
        categoryAxis: true,
        legend: false,
      });
    }
  });
  const lastSeriesRow = r - 2;
  b.row("chartData", dataTop);
  b.row("chartFirst", firstSeriesRow);
  b.row("chartLast", lastSeriesRow);
  b.outlineRows(dataTop, lastSeriesRow, 1);
  b.cf({ ref: `${addr(firstSeriesRow, check.diff)}:${addr(lastSeriesRow, check.diff)}`, formula: `ROUND(${addr(firstSeriesRow, check.diff)},3)<>0`, font: { color: "FF0000" } });
  b.plan.charts = placements;

  b.height(2, 16.5);
  for (let row = 3; row <= lastSeriesRow; row++) b.height(row, ROW_PT);
  const breaks = exhibits.map((_, k) => k).filter((k) => k % 2 === 1 && k < exhibits.length - 1).map((k) => exhibitTop(k) + EXHIBIT_ROWS - 1);
  b.print({ area: `B2:${addr(lastNote, LAST_CHART_COL)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:3", rowBreaks: breaks });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

/**
 * A round gridline step giving at most four gridlines over the data's range
 * (stacked charts stack positives and negatives separately).
 */
function niceStep(series: ChartSeriesData[], stacked: boolean, lines = 4, whole = false): number {
  const n = series[0]?.values.length ?? 0;
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const vs = series.map((s) => s.values[i]!);
    const pos = stacked ? vs.filter((v) => v > 0).reduce((s, v) => s + v, 0) : Math.max(0, ...vs);
    const neg = stacked ? vs.filter((v) => v < 0).reduce((s, v) => s + v, 0) : Math.min(0, ...vs);
    hi = Math.max(hi, pos);
    lo = Math.min(lo, neg);
  }
  const raw = (hi - lo) / lines || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw)!;
  // Counts step in whole units, so no gridline label repeats after rounding.
  return whole ? Math.max(1, Math.ceil(step)) : Number(step.toPrecision(6));
}

interface BlockRefs {
  monthsRow: number;
  firstMonth: string;
  lastMonth: string;
  check: ReturnType<typeof chartCheckCols>;
}

/** One chart-data row: its monthly formulas, and for every sourced row the total, source total and difference (C21). */
function writeSeriesRow(b: SheetBuilder, ctx: TabContext, e: ChartExhibit, s: ChartSeriesData, rows: Record<string, number>, refs: BlockRefs): void {
  const { model } = ctx;
  const r = rows[s.key]!;
  const src = s.source;
  const fmt = src.kind === "ratio" ? FMT.pct1 : e.units === "$M" ? FMT.oneDp : FMT.body;
  const scale = e.units === "$M" ? "/1000" : "";
  b.text(r, 2, s.name);
  const monthlyGrid = gridMonths(model).length;
  const mpLast = colLetter(MONTH_START + monthlyGrid - 1);
  const mp = (range: string) => `${S("monthly")}${range}`;
  const db = (range: string) => `${S("databook")}${range}`;
  const dbLast = DATABOOK_FIRST_ROW + (model.databook?.pnl.length ?? 1) - 1;
  const raw = (sheet: "rawCustomers" | "rawPayroll", col: number) => `${S(sheet)}$${colLetter(col)}:$${colLetter(col)}`;
  const C = RAW_CUSTOMER_COLS;
  const P = RAW_PAYROLL_COLS;
  // COUNTIFS criteria for a window: [from, to] as formula text.
  const customers = (event: "new" | "lost", from: string, to: string, extra = "") => {
    const date = raw("rawCustomers", event === "new" ? C.start : C.end);
    return `COUNTIFS(${date},">="&${from},${date},"<="&EOMONTH(${to},0)${extra})`;
  };
  const employees = (event: "hire" | "departure", from: string, to: string, extra = "") => {
    const date = raw("rawPayroll", event === "hire" ? P.hire : P.termination);
    return `COUNTIFS(${raw("rawPayroll", P.owner)},"No",${date},">="&${from},${date},"<="&EOMONTH(${to},0)${extra})`;
  };
  const eq = (sheet: "rawCustomers" | "rawPayroll", col: number, v: string) => `,${raw(sheet, col)},"${v.replace(/"/g, '""')}"`;
  const count = (from: string, to: string): string | undefined => {
    if (src.kind === "customers") {
      const type = src.type ? eq("rawCustomers", C.type, src.type) : "";
      if (src.event === "new") return customers("new", from, to, type);
      if (!src.reason) return `-${customers("lost", from, to, type)}`;
      if (src.reason !== "unclassified") return `-${customers("lost", from, to, type + eq("rawCustomers", C.lossReason, src.reason))}`;
      return `-(${customers("lost", from, to, type)}-${customers("lost", from, to, type + eq("rawCustomers", C.lossReason, "regrettable"))}-${customers("lost", from, to, type + eq("rawCustomers", C.lossReason, "non_regrettable"))})`;
    }
    if (src.kind === "employees") {
      const dept = src.department ? eq("rawPayroll", P.department, src.department) : "";
      if (src.event === "hire") return employees("hire", from, to, dept);
      if (!src.terminationType) return `-${employees("departure", from, to, dept)}`;
      if (src.terminationType !== "unclassified") return `-${employees("departure", from, to, dept + eq("rawPayroll", P.terminationType, src.terminationType))}`;
      return `-(${employees("departure", from, to, dept)}-${employees("departure", from, to, dept + eq("rawPayroll", P.terminationType, "resignation"))}-${employees("departure", from, to, dept + eq("rawPayroll", P.terminationType, "termination"))})`;
    }
    return undefined;
  };

  e.categories.forEach((m, i) => {
    const c = FIRST_DATA_COL + i;
    const monthCell = addr(refs.monthsRow, c, { row: true });
    const at = (key: string) => addr(rows[key]!, c);
    let f: string;
    switch (src.kind) {
      case "monthly":
        f = `INDEX(${mp(`$${colLetter(MONTH_START)}$8:$${mpLast}$@{monthly.tie_out}`)},MATCH($B${r},${mp("$B$8:$B$@{monthly.tie_out}")},0),MATCH(${monthCell},${mp(`$${colLetter(MONTH_START)}$6:$${mpLast}$6`)},0))${scale}`;
        break;
      case "account":
        f = `INDEX(${db(`$${colLetter(MONTH_START)}$${DATABOOK_FIRST_ROW}:$${mpLast}$${dbLast}`)},MATCH($B${r},${db(`$${colLetter(DATABOOK_COL.account)}$${DATABOOK_FIRST_ROW}:$${colLetter(DATABOOK_COL.account)}$${dbLast}`)},0),MATCH(${monthCell},${db(`$${colLetter(MONTH_START)}$6:$${mpLast}$6`)},0))/1000${scale}`;
        break;
      case "remainder":
        f = `${at(src.total)}-${src.less.map(at).join("-")}`;
        break;
      case "ratio":
        f = `IFERROR(${at(src.numerator)}/${at(src.denominator)},0)`;
        break;
      case "tenure":
        f = `${S("headcount")}$C$${rowOf("headcount", `bucket${i}`)}`;
        break;
      default:
        f = count(monthCell, monthCell)!;
    }
    b.formula(r, c, f, { fmt, expect: s.values[i]!, tol: src.kind === "ratio" ? 1e-9 : 1e-6, label: `${e.id} ${s.key} ${m}` });
  });
  if (src.kind === "ratio") return;

  // C21: the row against its source over the same window.
  const { total, source, diff } = refs.check;
  const last = addr(r, FIRST_DATA_COL + e.categories.length - 1);
  const sum = s.values.reduce((a, v) => a + v, 0);
  b.formula(r, total, `SUM(${addr(r, FIRST_DATA_COL)}:${last})`, { fmt, expect: sum, tol: 1e-6, label: `${e.id} ${s.key} chart total` });
  const window = (range: string, row: string) => `SUMIFS(${range},${row},">="&${refs.firstMonth},${row},"<="&${refs.lastMonth})`;
  let f: string;
  switch (src.kind) {
    case "monthly": {
      const row = rowOf("monthly", src.rowKey);
      f = `${window(mp(`$${colLetter(MONTH_START)}$${row}:$${mpLast}$${row}`), mp(`$${colLetter(MONTH_START)}$6:$${mpLast}$6`))}${scale}`;
      break;
    }
    case "account": {
      const row = DATABOOK_FIRST_ROW + model.databook!.pnl.findIndex((x) => x.account === src.account);
      f = `${window(db(`$${colLetter(MONTH_START)}$${row}:$${mpLast}$${row}`), db(`$${colLetter(MONTH_START)}$6:$${mpLast}$6`))}/1000${scale}`;
      break;
    }
    case "remainder":
      f = `${addr(rows[src.total]!, source)}-${src.less.map((k) => addr(rows[k]!, source)).join("-")}`;
      break;
    case "tenure":
      f = `${S("headcount")}$C$${rowOf("headcount", "bucketTotal")}`;
      break;
    default:
      f = count(refs.firstMonth, refs.lastMonth)!;
  }
  b.formula(r, source, f, { fmt, expect: sum, tol: 1e-6, label: `${e.id} ${s.key} source total` });
  b.formula(r, diff, `${addr(r, total)}-${addr(r, source)}`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `${e.id} ${s.key} C21` });
}
