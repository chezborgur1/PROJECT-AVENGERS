// Customer Overview, Customer Retention, Concentration and Cohorts (guide
// 5.1 rows 10-13, 5.5). Counts are COUNTIFS over the raw list; the dollar
// roll-forward reads a grey helper block on the retention tab, one row per
// coded customer, so every figure traces to a row a reviewer can open.

import { addMonths, monthPeriod, monthRange } from "../../domain/financials.ts";
import { excelSerial, fiscalYearMonths, ltmEqualsFiscalYear } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { PeriodColumn, RetentionCounts } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { RAW_CUSTOMER_COLS } from "./data.ts";
import { ASOF, FYE, fiscalYearWindow, gridMonths, labelFormula, S, SHEET, serialOfMonthEnd, serialOfMonthStart, windowFormulas } from "./layout.ts";
import { touchedYears } from "../analytics.ts";

const RC = () => S("rawCustomers");
const col = (n: number) => `${RC()}$${colLetter(n)}:$${colLetter(n)}`;
const START = () => col(RAW_CUSTOMER_COLS.start);
const END = () => col(RAW_CUSTOMER_COLS.end);
const TYPE = () => col(RAW_CUSTOMER_COLS.type);
const CODE = () => col(RAW_CUSTOMER_COLS.code);
const REASON = () => col(RAW_CUSTOMER_COLS.lossReason);
/** Raw - Customers revenue column of fiscal year `y` (`TabContext.customerYears` orders them). */
const fyColOf = (years: number[], y: number) => {
  const i = years.indexOf(y);
  if (i < 0) throw new Error(`Raw - Customers has no FY${y} column`);
  return col(RAW_CUSTOMER_COLS.firstFy + i);
};

/**
 * Active at the date in `d`: started on or before it and not ended on or
 * before it; an undated customer counts when it billed in fiscal year `fy`,
 * the year `d` falls in (customerActiveAt in analytics.ts).
 */
export const activeCount = (d: string, fy: number, years: number[]) =>
  `COUNTIFS(${START()},"<="&${d},${END()},"")+COUNTIFS(${START()},"<="&${d},${END()},">"&${d})${years.includes(fy) ? `+COUNTIFS(${START()},"",${fyColOf(years, fy)},">0",${CODE()},"<>Residual")` : ""}`;

interface WindowCells {
  start: string;
  end: string;
}

// --- Customer Overview -------------------------------------------------------------------------

export function planCustomerOverview(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const ca = model.customers;
  if (!ca) return undefined;
  const b = new SheetBuilder("customers", SHEET.customers);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).map((c) => c.fiscalYear!);
  const headers = ["Type", `${ca.term}s (#)`, "% of Count", "Revenue ($)", "% of Revenue", "Avg. Revenue ($)"];
  const widths = [WIDTH.label, 12, 10, 14, 12, 16];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(8);
  b.width(9, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Overview: Mix by Type, ${ca.period.label} (#, $)`, lastCol: 9, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 7, label: `Mix by type (${ca.period.label})` }, { from: 9, to: 9, label: "Notes" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 ? "left" : "center" } }));
  b.cell(6, 9, { style: "header", v: null, role: "text" });

  // The share of each fiscal year inside the measurement window (1 for the year itself) sits in a helper row below the print area,
  // one per revenue column of the raw list, so a window that straddles the year-end prorates the same years the engine does.
  const fyCol = (y: number) => fyColOf(ctx.customerYears, y);
  const shareYears = ctx.customerYears;
  const share = (y: number) => `$${colLetter(3 + shareYears.indexOf(y))}$${rowOf("customers", "shareRow")}`;
  const windowRevenue = (crit: string) => shareYears.map((y) => `${share(y)}*SUMIFS(${fyCol(y)},${crit})`).join("+");
  const touched = touchedYears(shareYears, ca.period, model.fiscalYearEndMonth);
  let r = 8;
  b.row("mixFirst", r);
  const asOf = ASOF;
  for (const row of ca.mixByType) {
    const residual = row.residual === true;
    // Currency on the first row and the total, body format between (guide 5.10).
    const money = r === b.r("mixFirst") ? FMT.currency : FMT.body;
    b.text(r, 2, row.type, { style: "line" });
    if (residual) {
      b.na(r, 3, "n.a.", { style: "line" });
      b.na(r, 4, "n.a.", { style: "ratio" });
      b.formula(r, 5, windowRevenue(`${CODE()},"Residual"`), { style: "line", fmt: money, expect: row.revenue, label: "residual revenue" });
      b.na(r, 7, "n.a.", { style: "line" });
    } else {
      const t = `"${row.type.replace(/"/g, '""')}"`;
      // Counted when it had revenue in a fiscal year the window touches, or is active at the as-of date (mixByType in analytics.ts).
      const none = (k: number) => touched.slice(0, k).map((y) => `,${fyCol(y)},"<=0"`).join("");
      const withRevenue = touched.map((y, k) => `COUNTIFS(${TYPE()},${t}${none(k)},${fyCol(y)},">0")`);
      const activeOnly = [`COUNTIFS(${TYPE()},${t}${none(touched.length)},${START()},"<="&${asOf},${END()},"")`, `COUNTIFS(${TYPE()},${t}${none(touched.length)},${START()},"<="&${asOf},${END()},">"&${asOf})`];
      b.formula(r, 3, [...withRevenue, ...activeOnly].join("+"), { style: "line", fmt: FMT.body, expect: row.count, label: `count ${row.type}` });
      b.formula(r, 4, `IFERROR(${addr(r, 3)}/C$${rowOf("customers", "codedCount")},"n.a.")`, { style: "ratio", fmt: FMT.pct, expect: row.countPct, label: `count pct ${row.type}` });
      b.formula(r, 5, windowRevenue(`${TYPE()},${t}`), { style: "line", fmt: money, expect: row.revenue, label: `revenue ${row.type}` });
      b.formula(r, 7, `IFERROR(${addr(r, 5)}/${addr(r, 3)},"n.a.")`, { style: "line", fmt: money, expect: row.count ? row.avgRevenue : "n.a.", label: `avg ${row.type}` });
    }
    b.formula(r, 6, `IFERROR(${addr(r, 5)}/E$${rowOf("customers", "total")},"n.a.")`, { style: "ratio", fmt: FMT.pct, expect: row.revenuePct, label: `rev pct ${row.type}` });
    r++;
  }
  b.row("mixLast", r - 1);
  const first = b.r("mixFirst");
  b.row("total", r);
  b.text(r, 2, "Total", { style: "keyTotal" });
  b.keyTotalBox([r, r], [[3, 7]]);
  b.formula(r, 3, `SUM(${addr(first, 3)}:${addr(r - 1, 3)})`, { style: "keyTotal", fmt: FMT.body, expect: ca.mixByType.reduce((s, x) => s + x.count, 0), label: "total count" });
  b.formula(r, 5, `SUM(${addr(first, 5)}:${addr(r - 1, 5)})`, { style: "keyTotal", fmt: FMT.currency, expect: ca.concentration.total, label: "total revenue" });
  b.formula(r, 6, `IFERROR(${addr(r, 5)}/${addr(r, 5)},"n.a.")`, { style: "margin", fmt: FMT.pct, expect: 1, label: "total pct" });
  const totalRow = r;
  r += 2;
  b.section(r++, "Tie-out and facts", [[3, 7]]);
  b.row("latestCount", r);
  b.text(r, 2, `${ca.term}s active at the as-of date (#)`, { style: "line" });
  b.formula(r, 3, activeCount(asOf, monthPeriod(model.assumptions!.asOfMonth, model.fiscalYearEndMonth).fiscalYear, ctx.customerYears), { style: "line", fmt: FMT.body, expect: ca.latestCount, label: "latest count" });
  r++;
  const latestFy = years[years.length - 1]!;
  const pnlCol = colLetter(3 + years.length - 1);
  b.row("tieRevenue", r);
  b.text(r, 2, `${ca.term} list revenue FY${latestFy} incl. residual ($)`, { style: "line" });
  b.formula(r, 3, `SUM(${fyCol(latestFy)})`, { style: "line", fmt: FMT.currency, expect: ca.concentration.tieToPnl.customerTotal, label: "tie customer total" });
  r++;
  b.text(r, 2, `P&L revenue FY${latestFy} ($)`, { style: "line" });
  b.formula(r, 3, `${S("pnl")}${pnlCol}${rowOf("pnl", "revenue")}*1000`, { style: "line", fmt: FMT.currency, expect: ca.concentration.tieToPnl.pnlRevenue, label: "tie pnl revenue" });
  r++;
  b.row("tieVariance", r);
  b.text(r, 2, "Check: variance (flag above 2%)", { style: "check" });
  b.formula(r, 3, `IFERROR((${addr(r - 2, 3)}-${addr(r - 1, 3)})/${addr(r - 1, 3)},0)`, { style: "check", fmt: FMT.pct1, expect: ca.concentration.tieToPnl.variancePct, tol: 1e-6, label: "C12" });
  b.cf({ ref: addr(r, 3), formula: `ABS(${addr(r, 3)})>0.02`, font: { color: COLOR.pending } });
  r += 2;
  b.note(r, 2, `Note: mix measured over ${ca.period.label}; a ${ca.term.toLowerCase()} counts when it had revenue in the window or is active at the as-of date. Revenue by fiscal year is prorated into the window by the helper shares below the print area when the window is not a fiscal year. Households and members not listed individually sit in the residual line so the total ties to the P&L (check C12).`);
  b.print({ area: `B2:${addr(r, 9)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });

  // Helpers below the print area: the fiscal-year shares of the window and the coded count the % of count divides by.
  const w = windowFormulas(ca.period, model);
  const helperTop = r + 3;
  b.text(helperTop, 2, "Helper: window share of each fiscal year", { style: "helper" });
  b.row("shareRow", helperTop + 1);
  shareYears.forEach((y, i) => {
    const fyW = fiscalYearWindow(y, model);
    const lo = `MAX(${w.start},${fyW.start})`;
    const hi = `MIN(${w.end},${fyW.end})`;
    const months = monthRange(ca.period.start, ca.period.end).filter((m) => fiscalYearMonths(y, model.fiscalYearEndMonth).includes(m)).length;
    b.text(helperTop, 3 + i, `FY${y}`, { style: "helper" });
    b.formula(helperTop + 1, 3 + i, `MAX(0,(YEAR(${hi})-YEAR(${lo}))*12+MONTH(${hi})-MONTH(${lo})+1)/12`, { style: "helper", role: "helper", fmt: FMT.pct1, expect: months / 12, label: `share FY${y}` });
  });
  b.row("codedCount", helperTop + 2);
  b.text(helperTop + 2, 2, `Helper: coded ${ca.term.toLowerCase()}s in the mix (#)`, { style: "helper" });
  // The residual row's count is "n.a." text, which SUM skips, so this is the coded count.
  b.formula(helperTop + 2, 3, `SUM(${addr(first, 3)}:${addr(totalRow - 1, 3)})`, { style: "helper", role: "helper", fmt: FMT.body, expect: ca.mixByType.filter((x) => !x.residual).reduce((s, x) => s + x.count, 0), label: "coded count" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.defineName("Customers_Latest", `$C$${b.r("latestCount")}`);
  return b;
}

// --- Customer Retention -----------------------------------------------------------------------------

export function planRetention(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const ca = model.customers;
  if (!ca?.retention) return undefined;
  const ret = ca.retention;
  const b = new SheetBuilder("retention", SHEET.retention);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const ltm = model.columns.find((c) => c.ref.kind === "ltm" && !c.priorYear);
  const cols: { column: PeriodColumn; col: number }[] = years.map((c, i) => ({ column: c, col: 3 + i }));
  let next = 3 + years.length + 1;
  if (ltm) cols.push({ column: ltm, col: next++ });
  const lastSummary = next - 1;
  // The monthly strip sits beside the monthly grid's months; an annual-only model (guide 5.2A) has neither.
  const withStrip = gridMonths(model).length > 0;
  const stripHidden = lastSummary + 2;
  const stripFirst = stripHidden + 1;
  const stripLast = stripFirst + 11;
  const notesCol = withStrip ? stripLast + 2 : lastSummary + 2;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(3, lastSummary, WIDTH.value);
  b.spacerCol(3 + years.length);
  b.spacerCol(lastSummary + 1);
  if (withStrip) {
    b.hideCol(stripHidden);
    b.widths(stripFirst, stripLast, WIDTH.stripRetention);
    b.spacerCol(stripLast + 1);
  }
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Retention: Count and Dollar Roll-Forwards (#, $)`, lastCol: notesCol, toggleCol: lastSummary, masterToggle: ctx.masterToggle });
  b.text(3, lastSummary - 1, "Print", { align: { horizontal: "right" } });
  const groups = [{ from: 3, to: 3 + years.length - 1, label: "Full Year" }];
  if (ltm) groups.push({ from: lastSummary, to: lastSummary, label: "LTM" });
  b.tier1(5, [...groups, ...(withStrip ? [{ from: stripFirst, to: stripLast, label: `LTM Monthly ${ca.term}s` }] : []), { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: lastSummary }, [], `${ca.term} Count`);
  const asOfMonth = model.assumptions!.asOfMonth;
  const stripMonths = monthRange(addMonths(asOfMonth, -11), asOfMonth);
  const priorMonth = addMonths(asOfMonth, -12);
  if (withStrip) {
    b.formula(6, stripHidden, `EOMONTH(${ASOF},-13)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(priorMonth), label: "strip hidden" });
    stripMonths.forEach((m, i) => b.formula(6, stripFirst + i, `EOMONTH(${addr(6, stripFirst + i - 1)},0)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(m), label: `strip ${m}` }));
  }
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const spans: [number, number][] = [[3, 3 + years.length - 1], ...(ltm ? [[lastSummary, lastSummary] as [number, number]] : []), ...(withStrip ? [[stripFirst, stripLast] as [number, number]] : [])];

  // Helper rows: window start and end per summary column (dates), below the printed block.
  let r = 8;
  const countKeys = ["startingCount", "newCustomers", "lostRegrettable", "lostNonRegrettable", "lostUnclassified", "lostTotal", "endingCount", "avgCustomers", "newGrowth", "churn"] as const;
  const countLabels: Record<(typeof countKeys)[number], string> = {
    startingCount: "Starting Count",
    newCustomers: `(+) New ${ca.term}s`,
    lostRegrettable: "(-) Regrettable Losses",
    lostNonRegrettable: "(-) Non-Regrettable Losses",
    lostUnclassified: "(-) Unclassified Losses",
    lostTotal: `(-) Total ${ca.term} Losses`,
    endingCount: "Ending Count",
    avgCustomers: `Avg. ${ca.term}s`,
    newGrowth: `New ${ca.term} Growth`,
    churn: `${ca.term} Churn`,
  };
  b.section(r++, `${ca.term} count roll-forward`, spans);
  for (const k of countKeys) b.row(k, r++);
  r++;
  // The bridge ends at the customers still active at year-end; the revenue the year's lost customers billed before leaving
  // reconciles it to the listed customers' revenue the Cohorts and Concentration tabs show (QA round 2 F9).
  const dollarKeys = ["startingRevenue", "churnRevenue", "downsell", "upsell", "newRevenue", "endingRevenue", "lostInYear", "listedRevenue", "gdr", "ndr"] as const;
  const term = ca.term.toLowerCase();
  const dollarLabels: Record<(typeof dollarKeys)[number], string> = {
    startingRevenue: `Starting Revenue (${term}s active at year start)`,
    churnRevenue: "(-) Churn",
    downsell: "(-) Downsell",
    upsell: "(+) Upsell",
    newRevenue: "(+) New",
    endingRevenue: `Ending Revenue (${term}s active at year end)`,
    lostInYear: `(+) In-year revenue of ${term}s lost in the year`,
    listedRevenue: `Listed ${term} revenue`,
    gdr: "Gross Dollar Retention",
    ndr: "Net Dollar Retention",
  };
  b.section(r++, `Dollar roll-forward, listed ${term}s ($, fiscal years)`, spans.slice(0, 1));
  for (const k of dollarKeys) b.row(k, r++);
  b.row("listedCheck", r++);
  r++;
  b.row("median", r++);
  const lastPrinted = r + 1;
  const helperRow = lastPrinted + 2;
  b.text(helperRow, 2, "Period start", { style: "helper" });
  b.text(helperRow + 1, 2, "Period end", { style: "helper" });
  const windows = new Map<number, WindowCells>();
  for (const { column, col: c } of cols) {
    const w = windowFormulas(column, model);
    b.formula(helperRow, c, w.start, { style: "helper", role: "helper", fmt: FMT.date, expect: serialOfMonthStart(column.start), label: `${column.label} start` });
    b.formula(helperRow + 1, c, w.end, { style: "helper", role: "helper", fmt: FMT.date, expect: serialOfMonthEnd(column.end), label: `${column.label} end` });
    const lbl = labelFormula(column, addr(helperRow + 1, c, { row: true }));
    b.formula(6, c, lbl.f, { style: "header", role: "text", expect: lbl.expect, label: `${column.label} label` });
    windows.set(c, { start: addr(helperRow, c, { row: true }), end: addr(helperRow + 1, c, { row: true }) });
  }
  // Strip windows: the month header is the start; EOMONTH of it the end.
  const stripCols = withStrip ? [stripHidden, ...stripMonths.map((_, i) => stripFirst + i)] : [];
  const stripMonthOf = (c: number) => (c === stripHidden ? priorMonth : stripMonths[c - stripFirst]!);
  for (const c of stripCols) windows.set(c, { start: addr(6, c, { row: true }), end: `EOMONTH(${addr(6, c, { row: true })},0)` });

  // Count block.
  const countValues = (c: number): ReturnType<typeof countFor> => {
    const column = cols.find((x) => x.col === c)?.column;
    if (column) {
      const rf = column.ref.kind === "fiscal_year" ? ret.byFiscalYear[column.fiscalYear!]!.counts : ret.ltm!.counts;
      return countFor(rf);
    }
    const m = stripMonthOf(c);
    return countFor(ret.monthly!.find((x) => x.month === m)!.counts);
  };
  const allCols = [...cols.map((x) => x.col), ...stripCols];
  for (const k of countKeys) {
    const rr = b.r(k);
    const isRatio = k === "newGrowth" || k === "churn";
    const isTotal = k === "endingCount";
    b.text(rr, 2, countLabels[k], { style: isTotal ? "keyTotal" : isRatio ? "ratio" : k === "startingCount" ? "lineFirst" : "line", align: isRatio ? { horizontal: "left", indent: 1 } : undefined });
    if (isTotal) b.keyTotalBox([rr, rr], spans);
    for (const c of allCols) {
      const w = windows.get(c)!;
      const v = countValues(c);
      const at = (key: string) => addr(b.r(key), c);
      const isStrip = stripCols.includes(c);
      let f: string;
      switch (k) {
        case "startingCount":
          f = isStrip && c !== stripHidden ? addr(b.r("endingCount"), c - 1) : `COUNTIFS(${START()},"<"&${w.start},${END()},"")+COUNTIFS(${START()},"<"&${w.start},${END()},">="&${w.start})`;
          break;
        case "newCustomers":
          f = `COUNTIFS(${START()},">="&${w.start},${START()},"<="&${w.end})`;
          break;
        case "lostRegrettable":
          f = `COUNTIFS(${END()},">="&${w.start},${END()},"<="&${w.end},${REASON()},"regrettable")`;
          break;
        case "lostNonRegrettable":
          f = `COUNTIFS(${END()},">="&${w.start},${END()},"<="&${w.end},${REASON()},"non_regrettable")`;
          break;
        case "lostUnclassified":
          f = `COUNTIFS(${END()},">="&${w.start},${END()},"<="&${w.end})-${at("lostRegrettable")}-${at("lostNonRegrettable")}`;
          break;
        case "lostTotal":
          f = `${at("lostRegrettable")}+${at("lostNonRegrettable")}+${at("lostUnclassified")}`;
          break;
        case "endingCount":
          f = `${at("startingCount")}+${at("newCustomers")}-${at("lostTotal")}`;
          break;
        case "avgCustomers":
          f = `(${at("startingCount")}+${at("endingCount")})/2`;
          break;
        case "newGrowth":
          f = `IFERROR(${at("newCustomers")}/${at("startingCount")},"n.a.")`;
          break;
        default:
          f = `IFERROR(${at("lostTotal")}/${at("avgCustomers")},"n.a.")`;
      }
      const fmt = isRatio ? FMT.pct1 : k === "avgCustomers" ? FMT.oneDp : FMT.body;
      const expect = isRatio ? (k === "newGrowth" ? (v.startingCount ? v.newCustomerGrowth : "n.a.") : v.avgCustomers ? v.churn : "n.a.") : v[k as keyof typeof v];
      b.formula(rr, c, f, { style: isTotal ? "keyTotal" : isRatio ? "ratio" : "line", fmt, expect: expect as number | string, label: `${k} col ${c}` });
    }
  }

  // Helper block: one row per coded customer with the dollar roll-forward contributions per fiscal year.
  const hFirst = helperRow + 4;
  const hCol = 2;
  b.text(hFirst - 1, hCol, `Helper: dollar roll-forward by ${ca.term.toLowerCase()} (grey; outside the print area)`, { style: "helper" });
  const perYearCols = 9;
  const customers = ctx.customers;
  const fyCol = (y: number) => fyColOf(ctx.customerYears, y);
  const hCode = hCol;
  const hStart = hCol + 1;
  const hEnd = hCol + 2;
  const hTenure = hCol + 3;
  const yearBase = (yi: number) => hCol + 4 + yi * perYearCols;
  const headers = ["Code", "Start", "End", "Tenure (yrs)"];
  headers.forEach((h, i) => b.text(hFirst, hCol + i, h, { style: "helper" }));
  years.forEach((y, yi) => {
    ["Prev rev", "Cur rev", "Active at start", "Lost in year", "Started in year", "Starting", "Churn", "Downsell", "Upsell"].forEach((h, i) => b.text(hFirst, yearBase(yi) + i, `FY${y.fiscalYear} ${h}`, { style: "helper" }));
  });
  customers.forEach((c, i) => {
    const rr = hFirst + 1 + i;
    const code = addr(rr, hCode);
    b.text(rr, hCode, c.id, { style: "helper" });
    b.formula(rr, hStart, `INDEX(${START()},MATCH(${code},${CODE()},0))`, { style: "helper", role: "helper", fmt: FMT.date, expect: c.startDate ? excelSerial(c.startDate) : 0, label: `start ${c.id}` });
    // The helper block carries the engine's value in every cell, so the verifier checks the roll-forward's inputs and not only its totals.
    const startSerial = c.startDate ? excelSerial(c.startDate) : 0;
    const endSerial = c.endDate ? excelSerial(c.endDate) : undefined;
    const asOfSerial = excelSerial(model.asOfDate);
    b.formula(rr, hEnd, `IF(INDEX(${END()},MATCH(${code},${CODE()},0))="","",INDEX(${END()},MATCH(${code},${CODE()},0)))`, { style: "helper", role: "helper", fmt: FMT.date, expect: endSerial ?? "", label: `end ${c.id}` });
    // Tenure of the customers active at the as-of date (customerActiveAt): an undated customer (start reads 0) has none, and one whose end date is on or before the as-of date has left.
    const tenure = startSerial === 0 || (endSerial !== undefined && endSerial <= asOfSerial) || startSerial > asOfSerial ? "" : Math.max(0, (asOfSerial - startSerial) / 365.25);
    b.formula(rr, hTenure, `IF(OR(${addr(rr, hStart)}=0,AND(${addr(rr, hEnd)}<>"",N(${addr(rr, hEnd)})<=${ASOF}),${addr(rr, hStart)}>${ASOF}),"",MAX(0,(${ASOF}-${addr(rr, hStart)})/365.25))`, { style: "helper", role: "helper", fmt: FMT.oneDp, expect: tenure, label: `tenure ${c.id}` });
    years.forEach((y, yi) => {
      const base = yearBase(yi);
      const w = windows.get(3 + yi)!;
      const prev = addr(rr, base);
      const cur = addr(rr, base + 1);
      const active = addr(rr, base + 2);
      const lost = addr(rr, base + 3);
      const fy = y.fiscalYear!;
      const curRev = c.revenueByFiscalYear[fy] ?? 0;
      // The raw list starts at the first history year (or the year before it, when the list has it).
      if (ctx.customerYears.includes(fy - 1)) b.formula(rr, base, `INDEX(${fyCol(fy - 1)},MATCH(${code},${CODE()},0))`, { style: "helper", role: "helper", fmt: FMT.body, expect: c.revenueByFiscalYear[fy - 1] ?? 0, label: `prev ${c.id} ${fy}` });
      else b.num(rr, base, 0, { style: "helper", role: "helper", fmt: FMT.body });
      b.formula(rr, base + 1, `INDEX(${fyCol(fy)},MATCH(${code},${CODE()},0))`, { style: "helper", role: "helper", fmt: FMT.body, expect: curRev, label: `cur ${c.id} ${fy}` });
      const s = addr(rr, hStart);
      const e = addr(rr, hEnd);
      const prevRev = ctx.customerYears.includes(fy - 1) ? (c.revenueByFiscalYear[fy - 1] ?? 0) : 0;
      const [wStart, wEnd] = [serialOfMonthStart(y.start), serialOfMonthEnd(y.end)];
      const isActive = startSerial === 0 ? (prevRev > 0 ? 1 : 0) : startSerial < wStart && (endSerial === undefined || endSerial >= wStart) ? 1 : 0;
      const isLost = startSerial === 0 ? (prevRev > 0 && curRev <= 0 ? 1 : 0) : endSerial !== undefined && endSerial >= wStart && endSerial <= wEnd ? 1 : 0;
      const isStarted = startSerial === 0 ? (prevRev <= 0 && curRev > 0 ? 1 : 0) : startSerial >= wStart && startSerial <= wEnd ? 1 : 0;
      // Undated (start reads 0): active when it billed last year, lost when it stopped, new when it began (dollarRollForward).
      b.formula(rr, base + 2, `IF(${s}=0,IF(${prev}>0,1,0),IF(AND(${s}<${w.start},OR(${e}="",${e}>=${w.start})),1,0))`, { style: "helper", role: "helper", fmt: FMT.term, expect: isActive, label: `active ${c.id} ${fy}` });
      b.formula(rr, base + 3, `IF(${s}=0,IF(AND(${prev}>0,${cur}<=0),1,0),IF(AND(${e}<>"",${e}>=${w.start},${e}<=${w.end}),1,0))`, { style: "helper", role: "helper", fmt: FMT.term, expect: isLost, label: `lost ${c.id} ${fy}` });
      b.formula(rr, base + 4, `IF(${s}=0,IF(AND(${prev}<=0,${cur}>0),1,0),IF(AND(${s}>=${w.start},${s}<=${w.end}),1,0))`, { style: "helper", role: "helper", fmt: FMT.term, expect: isStarted, label: `started ${c.id} ${fy}` });
      b.formula(rr, base + 5, `${active}*${prev}`, { style: "helper", role: "helper", fmt: FMT.body, expect: isActive * prevRev, label: `starting ${c.id} ${fy}` });
      b.formula(rr, base + 6, `${active}*${lost}*${prev}`, { style: "helper", role: "helper", fmt: FMT.body, expect: isActive * isLost * prevRev, label: `churn ${c.id} ${fy}` });
      b.formula(rr, base + 7, `${active}*(1-${lost})*MAX(0,${prev}-${cur})`, { style: "helper", role: "helper", fmt: FMT.body, expect: isActive * (1 - isLost) * Math.max(0, prevRev - curRev), label: `downsell ${c.id} ${fy}` });
      b.formula(rr, base + 8, `${active}*(1-${lost})*MAX(0,${cur}-${prev})`, { style: "helper", role: "helper", fmt: FMT.body, expect: isActive * (1 - isLost) * Math.max(0, curRev - prevRev), label: `upsell ${c.id} ${fy}` });
    });
  });
  const hLast = hFirst + customers.length;
  const hRange = (c: number) => `${addr(hFirst + 1, c, { row: true, col: true })}:${addr(hLast, c, { row: true, col: true })}`;

  // Dollar block, fiscal years only.
  const listedOf = (fy: number) => customers.reduce((sum, x) => sum + (x.revenueByFiscalYear[fy] ?? 0), 0);
  for (const k of dollarKeys) {
    const rr = b.r(k);
    const isRatio = k === "gdr" || k === "ndr";
    const isTotal = k === "endingRevenue" || k === "listedRevenue";
    b.text(rr, 2, dollarLabels[k], { style: isTotal ? "keyTotal" : isRatio ? "ratio" : k === "startingRevenue" ? "lineFirst" : "line", align: isRatio ? { horizontal: "left", indent: 1 } : undefined });
    if (isTotal) b.keyTotalBox([rr, rr], [[3, 3 + years.length - 1]]);
    years.forEach((y, yi) => {
      const c = 3 + yi;
      const d = ret.byFiscalYear[y.fiscalYear!]!.dollars;
      const hasPrior = customers.some((x) => x.revenueByFiscalYear[y.fiscalYear! - 1] !== undefined);
      if (!hasPrior) {
        b.na(rr, c, "n.a.", { style: isTotal ? "keyTotal" : isRatio ? "ratio" : "line" });
        return;
      }
      const base = yearBase(yi);
      const at = (key: string) => addr(b.r(key), c);
      let f: string;
      let expect: number | string;
      switch (k) {
        case "startingRevenue":
          f = `SUM(${hRange(base + 5)})`;
          expect = d.startingRevenue;
          break;
        case "churnRevenue":
          f = `SUM(${hRange(base + 6)})`;
          expect = d.churn;
          break;
        case "downsell":
          f = `SUM(${hRange(base + 7)})`;
          expect = d.downsell;
          break;
        case "upsell":
          f = `SUM(${hRange(base + 8)})`;
          expect = d.upsell;
          break;
        case "newRevenue":
          f = `SUMPRODUCT(${hRange(base + 4)},${hRange(base + 1)})`;
          expect = d.newRevenue;
          break;
        case "endingRevenue":
          f = `${at("startingRevenue")}-${at("churnRevenue")}-${at("downsell")}+${at("upsell")}+${at("newRevenue")}`;
          expect = d.endingRevenue;
          break;
        case "lostInYear":
          f = `SUMPRODUCT(${hRange(base + 2)},${hRange(base + 3)},${hRange(base + 1)})`;
          expect = d.lostInYearRevenue ?? 0;
          break;
        case "listedRevenue":
          f = `${at("endingRevenue")}+${at("lostInYear")}`;
          expect = d.endingRevenue + (d.lostInYearRevenue ?? 0);
          break;
        case "gdr":
          f = `IFERROR((${at("startingRevenue")}-${at("churnRevenue")}-${at("downsell")})/${at("startingRevenue")},"n.a.")`;
          expect = d.startingRevenue ? d.gdr : "n.a.";
          break;
        default:
          f = `IFERROR((${at("startingRevenue")}-${at("churnRevenue")}-${at("downsell")}+${at("upsell")})/${at("startingRevenue")},"n.a.")`;
          expect = d.startingRevenue ? d.ndr : "n.a.";
      }
      b.formula(rr, c, f, { style: isTotal ? "keyTotal" : isRatio ? "ratio" : "line", fmt: isRatio ? FMT.pct1 : k === "startingRevenue" || isTotal ? FMT.currency : FMT.body, expect, label: `${k} FY${y.fiscalYear}` });
    });
  }
  // The listed revenue ties to the raw list for the same fiscal year.
  const lc = b.r("listedCheck");
  b.text(lc, 2, `Check: listed revenue less Raw - ${ca.term}s`, { style: "check" });
  years.forEach((y, yi) => {
    const c = 3 + yi;
    if (!customers.some((x) => x.revenueByFiscalYear[y.fiscalYear! - 1] !== undefined)) return;
    const d = ret.byFiscalYear[y.fiscalYear!]!.dollars;
    b.formula(lc, c, `${addr(b.r("listedRevenue"), c)}-SUMIFS(${fyColOf(ctx.customerYears, y.fiscalYear!)},${CODE()},"<>Residual")`, { style: "check", fmt: FMT.check, expect: d.endingRevenue + (d.lostInYearRevenue ?? 0) - listedOf(y.fiscalYear!), tol: 1e-6, label: `listed revenue tie FY${y.fiscalYear}` });
  });
  b.checkCf(lc, 3, 3 + years.length - 1);
  const mr = b.r("median");
  b.text(mr, 2, `Median tenure of active ${ca.term.toLowerCase()}s (years)`, { style: "keyTotal", align: { horizontal: "left" } });
  b.keyTotalBox([mr, mr], [[3, 3]]);
  b.formula(mr, 3, `IFERROR(MEDIAN(${hRange(hTenure)}),"n.a.")`, { style: "keyTotal", fmt: FMT.oneDp, expect: ret.medianTenureYears, label: "median tenure" });
  b.note(lastPrinted, 2, `Note: counts are COUNTIFS over the raw ${ca.term.toLowerCase()} list by start and end date; a ${ca.term.toLowerCase()} is active from its start date until the day before its end date, the day its loss is booked. Churn = losses ÷ average ${ca.term.toLowerCase()}s. The dollar roll-forward compares each ${ca.term.toLowerCase()}'s revenue with the prior fiscal year (helper block below the print area); GDR excludes upsell, NDR includes it.${withStrip ? " Strip months end at the as-of date." : ""}`);
  // With a strip, the summary block and the strip print as separate ranges with the labels repeated, so neither shrinks under the 7 pt floor (C37).
  b.print({
    // The strip range carries the count block only: the dollar block and the median box have no monthly figures to print beside it.
    areas: withStrip ? [`B2:${addr(lastPrinted, lastSummary)}`, `${addr(2, stripFirst)}:${addr(b.r("churn"), stripLast)}`] : [`B2:${addr(lastPrinted, notesCol)}`],
    landscape: true,
    fitToWidth: 1,
    fitToHeight: 0,
    titlesRow: "2:6",
    titlesCol: withStrip ? "B:B" : undefined,
  });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  // The dollar roll-forward runs on fiscal-year revenue, so its latest column is the LTM only when the LTM closes a fiscal year; otherwise the names are left out rather than pointing at the wrong window.
  const latestFyIdx = years.length - 1;
  if (model.granularity === "annual" || ltmEqualsFiscalYear(model.assumptions!.asOfMonth, model.fiscalYearEndMonth)) {
    b.defineName("GDR_LTM", `$${colLetter(3 + latestFyIdx)}$${b.r("gdr")}`);
    b.defineName("NDR_LTM", `$${colLetter(3 + latestFyIdx)}$${b.r("ndr")}`);
  }
  return b;
}

function countFor(c: RetentionCounts) {
  return {
    startingCount: c.startingCount,
    newCustomers: c.newCustomers,
    lostRegrettable: c.lostByReason.regrettable,
    lostNonRegrettable: c.lostByReason.nonRegrettable,
    lostUnclassified: c.lostByReason.unclassified,
    lostTotal: c.lostCustomers,
    endingCount: c.endingCount,
    avgCustomers: c.avgCustomers,
    newCustomerGrowth: c.newCustomerGrowth,
    churn: c.churn,
  };
}

// --- Concentration --------------------------------------------------------------------------------

export function planConcentration(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const ca = model.customers;
  if (!ca) return undefined;
  const b = new SheetBuilder("concentration", SHEET.concentration);
  const headers = ["Code", "Revenue ($)", "% of Total", "Cumulative %", "Tenure (Yrs.)", "Type"];
  const widths = [WIDTH.label, 14, 11, 12, 12, 22];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(8);
  b.width(9, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Concentration: Top 20, ${ca.period.label} ($)`, lastCol: 9, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 7, label: `Top 20 ${ca.term}s (${ca.period.label})` }, { from: 9, to: 9, label: "Notes" }]);
  // Type is indented off the Tenure figures beside it, so the two never butt together.
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 || i === 5 ? "left" : "center", indent: i === 5 ? 1 : undefined } }));
  b.cell(6, 9, { style: "header", v: null, role: "text" });
  const fyCol = (y: number) => fyColOf(ctx.customerYears, y);
  const shareRef = (y: number) => `${S("customers")}$${colLetter(3 + ctx.customerYears.indexOf(y))}$${rowOf("customers", "shareRow")}`;
  const windowRevenueOf = (code: string) => ctx.customerYears.map((y) => `${shareRef(y)}*INDEX(${fyCol(y)},MATCH(${code},${CODE()},0))`).join("+");
  let r = 8;
  const first = r;
  const top = ca.concentration.top;
  const totalRow = first + 20 + 2;
  top.forEach((row, i) => {
    const rr = first + i;
    b.cell(rr, 2, { v: row.id, role: "input", align: { horizontal: "left", indent: 1 } });
    b.formula(rr, 3, windowRevenueOf(addr(rr, 2)), { style: i === 0 ? "lineFirst" : "line", fmt: i === 0 ? FMT.currency : FMT.body, expect: row.revenue, label: `rev ${row.id}` });
    b.formula(rr, 4, `IFERROR(${addr(rr, 3)}/${addr(totalRow, 3, { row: true })},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: row.pctOfTotal, label: `pct ${row.id}` });
    b.formula(rr, 5, i === 0 ? addr(rr, 4) : `${addr(rr - 1, 5)}+${addr(rr, 4)}`, { style: "ratio", fmt: FMT.pct1, expect: row.cumulativePct, label: `cum ${row.id}` });
    const start = `INDEX(${START()},MATCH(${addr(rr, 2)},${CODE()},0))`;
    b.formula(rr, 6, `IF(N(${start})=0,"n.a.",MAX(0,(${ASOF}-${start})/365.25))`, { style: "line", fmt: FMT.oneDp, expect: row.since === undefined ? "n.a." : row.tenureYears, label: `tenure ${row.id}` });
    b.formula(rr, 7, `INDEX(${TYPE()},MATCH(${addr(rr, 2)},${CODE()},0))`, { role: "link", expect: row.type ?? "", label: `type ${row.id}`, align: { horizontal: "left", indent: 1 } });
  });
  for (let i = top.length; i < 20; i++) b.na(first + i, 3, "", { style: "line" });
  r = first + 20;
  b.text(r, 2, "Top 20", { style: "subtotal" });
  b.subtotalBorder(r, [[3, 7]]);
  b.formula(r, 3, `SUM(${addr(first, 3)}:${addr(first + 19, 3)})`, { style: "subtotal", fmt: FMT.currency, expect: top.reduce((s, x) => s + x.revenue, 0), label: "top 20 revenue" });
  b.formula(r, 4, `IFERROR(${addr(r, 3)}/${addr(totalRow, 3, { row: true })},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: ca.concentration.top20Share, label: "top 20 share" });
  b.row("top20", r);
  r++;
  b.text(r, 2, "(+) Remaining", { style: "line" });
  b.formula(r, 3, `${addr(totalRow, 3)}-${addr(r - 1, 3)}`, { style: "line", fmt: FMT.body, expect: ca.concentration.remaining, label: "remaining" });
  b.formula(r, 4, `IFERROR(${addr(r, 3)}/${addr(totalRow, 3, { row: true })},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: ca.concentration.total ? ca.concentration.remaining / ca.concentration.total : "n.a.", label: "remaining share" });
  r++;
  b.text(r, 2, "Total", { style: "keyTotal" });
  b.keyTotalBox([r, r], [[3, 7]]);
  b.formula(r, 3, ctx.customerYears.map((y) => `${shareRef(y)}*SUM(${fyCol(y)})`).join("+"), { style: "keyTotal", fmt: FMT.currency, expect: ca.concentration.total, label: "total revenue" });
  b.formula(r, 4, `IFERROR(${addr(r, 3)}/${addr(r, 3)},"n.a.")`, { style: "margin", fmt: FMT.pct1, expect: 1, label: "total share" });
  b.row("totalRow", r);
  r += 2;
  b.section(r++, "Shares", [[3, 7]]);
  b.row("largest", r);
  b.text(r, 2, `Largest ${ca.term.toLowerCase()}, % of revenue`, { style: "line" });
  b.formula(r, 4, addr(first, 4), { style: "ratio", fmt: FMT.pct1, expect: ca.concentration.largestShare, label: "largest share" });
  r++;
  b.row("top10", r);
  b.text(r, 2, `Top 10 ${ca.term.toLowerCase()}s, % of revenue`, { style: "line" });
  b.formula(r, 4, `SUM(${addr(first, 4)}:${addr(first + 9, 4)})`, { style: "ratio", fmt: FMT.pct1, expect: ca.concentration.top10Share, label: "top 10 share" });
  r += 2;
  b.note(r, 2, `Note: ${ca.term.toLowerCase()}s are coded C-001 onward in order of revenue; names stay on the raw tab. Tenure is measured from the start date to the as-of date and is never negative. The total is the ${ca.term.toLowerCase()} list plus the residual bucket, which ties to P&L revenue (check C12).`);
  b.print({ area: `B2:${addr(r, 9)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.defineName("Top10Share_LTM", `$D$${b.r("top10")}`);
  return b;
}

// --- Cohorts ----------------------------------------------------------------------------------------

/** The 2.6 ordinal ramp for the retention triangle: fill and a font that reads on it, from the lowest band up. */
const RETENTION_RAMP: { min: number; fill: string; font: string }[] = [
  { min: 0.9, fill: "7B0000", font: COLOR.white },
  { min: 0.75, fill: "B5727A", font: COLOR.white },
  { min: 0.5, fill: "D9B8BD", font: COLOR.black },
  { min: 0, fill: "F5EDEC", font: COLOR.black },
];

export function planCohorts(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const ca = model.customers;
  if (!ca?.cohorts) return undefined;
  const co = ca.cohorts;
  const b = new SheetBuilder("cohorts", SHEET.cohorts);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const n = years.length;
  const lastCol = 3 + n;
  const fyCol = (y: number) => fyColOf(ctx.customerYears, y);
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.width(3, 11);
  b.widths(4, 3 + n, WIDTH.value);
  b.anatomy({ subtitle: `${ca.term} Cohorts by Start Fiscal Year (#, $)`, lastCol, toggleCol: lastCol, masterToggle: ctx.masterToggle });
  b.text(3, lastCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 3, label: "Cohort" }, { from: 4, to: 3 + n, label: "Active at fiscal year-end (#)" }]);
  b.cell(6, 2, { style: "header", v: "Start (fiscal year)", role: "text", align: { horizontal: "left" } });
  b.cell(6, 3, { style: "header", v: "Size (#)", role: "text" });
  years.forEach((y, i) => b.cell(6, 4 + i, { style: "header", v: y.label, role: "text" }));
  const fyEnd = (y: PeriodColumn) => windowFormulas(y, model).end;
  const fyEndCell = (rr: number) => `EOMONTH(DATE(${addr(rr, 2)},${FYE},1),0)`;
  const firstRow = 8;
  // A dated cohort row spans its fiscal year; the "Before" row takes every start before the next row's year.
  const bounds = (rr: number, pre: boolean) =>
    pre ? `${START()},"<="&EOMONTH(${fyEndCell(rr + 1)},-12)` : `${START()},">"&EOMONTH(${fyEndCell(rr)},-12),${START()},"<="&${fyEndCell(rr)}`;
  // One typed year per cohort, in the count block; the retention and revenue blocks link to it.
  const cohortLabel = (rr: number, c: { cohort: number; label: string; pre?: true }, source?: number) => {
    if (c.pre) b.text(rr, 2, `Before ${c.cohort + 1}`, { style: "line" });
    else if (source) b.formula(rr, 2, addr(source, 2), { fmt: FMT.term, align: { horizontal: "left", indent: 1 }, expect: c.cohort, label: `cohort ${c.label} year` });
    else b.num(rr, 2, c.cohort, { fmt: FMT.term, align: { horizontal: "left", indent: 1 } });
  };
  const retainedCell = (c: { cohort: number; retainedByYear: number[] }, i: number) => c.retainedByYear[i - (n - c.retainedByYear.length)];

  let r = firstRow;
  for (const c of co.countTriangle) {
    cohortLabel(r, c);
    b.formula(r, 3, `COUNTIFS(${bounds(r, !!c.pre)})`, { style: "line", fmt: FMT.body, expect: c.size, label: `cohort ${c.label} size` });
    years.forEach((y, i) => {
      if (y.fiscalYear! < c.cohort) return void b.na(r, 4 + i, "", { style: "line" });
      const end = fyEnd(y);
      const within = `${bounds(r, !!c.pre)},${START()},"<="&${end}`;
      b.formula(r, 4 + i, `COUNTIFS(${within},${END()},"")+COUNTIFS(${within},${END()},">"&${end})`, { style: "line", fmt: FMT.body, expect: retainedCell(c, i) ?? 0, label: `cohort ${c.label} ${y.label}` });
    });
    r++;
  }
  const lastCohort = r - 1;
  b.text(r, 2, "Total active at year-end", { style: "subtotal" });
  b.subtotalBorder(r, [[3, 3 + n]]);
  years.forEach((y, i) => b.formula(r, 4 + i, `SUM(${addr(firstRow, 4 + i)}:${addr(lastCohort, 4 + i)})`, { style: "subtotal", fmt: FMT.body, expect: co.tie.activeByYear[i]!, label: `cohort total ${y.label}` }));
  const countTotal = r++;
  b.text(r, 2, `Check: active ${ca.term.toLowerCase()}s less cohorts`, { style: "check" });
  years.forEach((y, i) => {
    const end = fyEnd(y);
    b.formula(r, 4 + i, `COUNTIFS(${START()},"<="&${end},${END()},"")+COUNTIFS(${START()},"<="&${end},${END()},">"&${end})-${addr(countTotal, 4 + i)}`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `cohort count tie ${y.label}` });
  });
  b.checkCf(r, 4, 3 + n);
  r += 2;

  // Retention: each cell over the cohort's size, shaded on the ordinal ramp so the decay reads down and across.
  b.section(r++, "Retention (% of cohort size)", [[3, 3 + n]]);
  const pctFirst = r;
  co.countTriangle.forEach((c, k) => {
    const src = firstRow + k;
    cohortLabel(r, c, src);
    years.forEach((y, i) => {
      if (y.fiscalYear! < c.cohort) return void b.na(r, 4 + i, "", { style: "line" });
      b.formula(r, 4 + i, `IFERROR(${addr(src, 4 + i)}/${addr(src, 3)},"n.a.")`, { style: "ratio", fmt: FMT.pct, expect: c.size ? (retainedCell(c, i) ?? 0) / c.size : "n.a.", label: `cohort ${c.label} retention ${y.label}` });
    });
    r++;
  });
  const pctRange = `${addr(pctFirst, 4)}:${addr(r - 1, 3 + n)}`;
  for (const band of RETENTION_RAMP) b.cf({ ref: pctRange, formula: `AND(ISNUMBER(${addr(pctFirst, 4)}),${addr(pctFirst, 4)}>=${band.min})`, font: { color: band.font }, fill: band.fill });
  r++;

  b.section(r++, "Revenue by cohort ($)", [[3, 3 + n]]);
  b.cell(r, 2, { style: "header", v: "Start (fiscal year)", role: "text", align: { horizontal: "left" } });
  b.cell(r, 3, { style: "header", v: "Year 1 ($)", role: "text" });
  years.forEach((y, i) => b.cell(r, 4 + i, { style: "header", v: y.label, role: "text" }));
  r++;
  const revFirst = r;
  co.revenueTriangle.forEach((c, k) => {
    const labelRow = firstRow + k;
    cohortLabel(r, c, labelRow);
    const firstIdx = years.findIndex((y) => y.fiscalYear! >= c.cohort);
    const crit = c.pre ? `${START()},"<="&EOMONTH(${fyEndCell(labelRow + 1)},-12)` : `${START()},">"&EOMONTH(${fyEndCell(labelRow)},-12),${START()},"<="&${fyEndCell(labelRow)}`;
    b.formula(r, 3, firstIdx >= 0 ? `SUMIFS(${fyCol(years[firstIdx]!.fiscalYear!)},${crit})` : "0", { style: "line", fmt: FMT.body, expect: c.revenue, label: `cohort ${c.label} first revenue` });
    years.forEach((y, i) => {
      if (y.fiscalYear! < c.cohort) return void b.na(r, 4 + i, "", { style: "line" });
      b.formula(r, 4 + i, `SUMIFS(${fyCol(y.fiscalYear!)},${crit})`, { style: "line", fmt: FMT.body, expect: retainedCell(c, i) ?? 0, label: `cohort ${c.label} revenue ${y.label}` });
    });
    r++;
  });
  b.text(r, 2, "Total", { style: "subtotal" });
  b.subtotalBorder(r, [[3, 3 + n]]);
  years.forEach((y, i) => b.formula(r, 4 + i, `SUM(${addr(revFirst, 4 + i)}:${addr(r - 1, 4 + i)})`, { style: "subtotal", fmt: FMT.currency, expect: co.tie.revenueByYear[i]!, label: `cohort revenue total ${y.label}` }));
  const revTotal = r++;
  b.text(r, 2, "Check: listed revenue less cohorts", { style: "check" });
  years.forEach((y, i) => b.formula(r, 4 + i, `SUMIFS(${fyCol(y.fiscalYear!)},${START()},"<="&${fyEnd(y)})-${addr(revTotal, 4 + i)}`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `cohort revenue tie ${y.label}` }));
  b.checkCf(r, 4, 3 + n);
  r += 2;
  const pre = co.countTriangle.find((c) => c.pre);
  b.note(r, 2, `Note: a cohort is the fiscal year of the ${ca.term.toLowerCase()}'s start date; retained means active at that fiscal year-end.${pre ? ` Starts before FY${pre.cohort + 1} share the first row.` : ""} Every dated ${ca.term.toLowerCase()} sits in one row, so each year's total equals the active count on ${SHEET.retention} and the listed revenue (residual excluded); the check rows prove it. Year 1 is the cohort's revenue in its first fiscal year inside the history.`);
  b.print({ area: `B2:${addr(r, lastCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}
