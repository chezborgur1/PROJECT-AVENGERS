// Customer Overview, Customer Retention, Concentration and Cohorts (guide
// 5.1 rows 10-13, 5.5). Counts are COUNTIFS over the raw list; the dollar
// roll-forward reads a grey helper block on the retention tab, one row per
// coded customer, so every figure traces to a row a reviewer can open.

import { addMonths, monthEndDate, monthRange } from "../../domain/financials.ts";
import { excelSerial, fiscalYearMonths } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput, PeriodColumn } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { RAW_CUSTOMER_COLS } from "./data.ts";
import { ASOF, S, SHEET, serialOfMonthEnd, serialOfMonthStart, windowFormulas } from "./layout.ts";

const RC = () => S("rawCustomers");
const col = (n: number) => `${RC()}$${colLetter(n)}:$${colLetter(n)}`;
const START = () => col(RAW_CUSTOMER_COLS.start);
const END = () => col(RAW_CUSTOMER_COLS.end);
const TYPE = () => col(RAW_CUSTOMER_COLS.type);
const CODE = () => col(RAW_CUSTOMER_COLS.code);
const REASON = () => col(RAW_CUSTOMER_COLS.lossReason);
const fyCol = (i: number) => col(RAW_CUSTOMER_COLS.firstFy + i);

/** Active at the date in `d`: started on or before it and not ended before it. */
const activeCount = (d: string, extra = "") => `COUNTIFS(${START()},"<="&${d},${END()},""${extra})+COUNTIFS(${START()},"<="&${d},${END()},">="&${d}${extra})`;

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
  const widths = [WIDTH.label, 12, 10, 14, 11, 14];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(8);
  b.width(9, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Overview: mix by type over ${ca.period.label} (#, $)`, lastCol: 9, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 7, label: `Mix by type (${ca.period.label})` }, { from: 9, to: 9, label: "Notes" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 ? "left" : "center" } }));
  b.cell(6, 9, { style: "header", v: null, role: "text" });

  // Helper: the share of each fiscal year inside the measurement window (1 for the year itself), from Assumptions dates.
  const w = windowFormulas(ca.period, model);
  let r = 8;
  const shareRow = r;
  b.text(r, 2, "Helper: window share of each fiscal year", { style: "helper" });
  years.forEach((y, i) => {
    const fyW = windowFormulas(model.columns.find((c) => c.ref.kind === "fiscal_year" && c.fiscalYear === y)!, model);
    const lo = `MAX(${w.start},${fyW.start})`;
    const hi = `MIN(${w.end},${fyW.end})`;
    const months = monthRange(ca.period.start, ca.period.end).filter((m) => fiscalYearMonths(y, model.fiscalYearEndMonth).includes(m)).length;
    b.formula(r, 3 + i, `MAX(0,(YEAR(${hi})-YEAR(${lo}))*12+MONTH(${hi})-MONTH(${lo})+1)/12`, { style: "helper", role: "helper", fmt: FMT.pct1, expect: months / 12, label: `share FY${y}` });
    b.text(r - 1, 3 + i, `FY${y}`, { style: "helper" });
  });
  b.row("shareRow", r);
  const share = (i: number) => addr(shareRow, 3 + i, { row: true, col: true });
  const windowRevenue = (crit: string) => years.map((_, i) => `${share(i)}*SUMIFS(${fyCol(i)},${crit})`).join("+");
  r += 2;
  b.row("mixFirst", r);
  const asOf = ASOF;
  for (const row of ca.mixByType) {
    const isResidual = row.type === model.assumptions && false;
    void isResidual;
    const residual = !ca.mixByType.some((x) => x !== row && x.type === row.type) && row.countPct === 0 && row.count === 0 && row.type.length > 30;
    b.text(r, 2, row.type, { style: "lineFirst", align: { wrap: true } });
    if (residual) {
      b.na(r, 3, "n.a.", { style: "line" });
      b.na(r, 4, "n.a.", { style: "ratio" });
      b.formula(r, 5, windowRevenue(`${CODE()},"Residual"`), { style: "line", fmt: FMT.currency, expect: row.revenue, label: "residual revenue" });
      b.na(r, 7, "n.a.", { style: "line" });
    } else {
      const t = `"${row.type.replace(/"/g, '""')}"`;
      const latestFyIdx = years.length - 1;
      b.formula(r, 3, `COUNTIFS(${TYPE()},${t},${fyCol(latestFyIdx)},">0")+COUNTIFS(${TYPE()},${t},${fyCol(latestFyIdx)},0,${START()},"<="&${asOf},${END()},"")+COUNTIFS(${TYPE()},${t},${fyCol(latestFyIdx)},0,${START()},"<="&${asOf},${END()},">="&${asOf})`, { style: "line", fmt: FMT.body, expect: row.count, label: `count ${row.type}` });
      b.formula(r, 4, `IFERROR(${addr(r, 3)}/${addr(rowOf("customers", "codedCount") as unknown as number, 3, { row: true })},"n.a.")`, { style: "ratio", fmt: FMT.pct, expect: row.countPct, label: `count pct ${row.type}` });
      b.formula(r, 5, windowRevenue(`${TYPE()},${t}`), { style: "line", fmt: FMT.currency, expect: row.revenue, label: `revenue ${row.type}` });
      b.formula(r, 7, `IFERROR(${addr(r, 5)}/${addr(r, 3)},"n.a.")`, { style: "line", fmt: FMT.currency, expect: row.count ? row.avgRevenue : "n.a.", label: `avg ${row.type}` });
    }
    b.formula(r, 6, `IFERROR(${addr(r, 5)}/${addr(rowOf("customers", "total") as unknown as number, 5, { row: true })},"n.a.")`, { style: "ratio", fmt: FMT.pct, expect: row.revenuePct, label: `rev pct ${row.type}` });
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
  r++;
  b.row("codedCount", r);
  b.text(r, 2, `Coded ${ca.term.toLowerCase()}s in the mix (#)`, { style: "helper" });
  b.formula(r, 3, `SUM(${addr(first, 3)}:${addr(r - 2, 3)})`, { style: "helper", role: "helper", fmt: FMT.body, expect: ca.mixByType.reduce((s, x) => s + x.count, 0), label: "coded count" });
  r += 2;
  b.section(r++, "Tie-out and facts", [[3, 7]]);
  b.row("latestCount", r);
  b.text(r, 2, `${ca.term}s active at the as-of date (#)`, { style: "line" });
  b.formula(r, 3, activeCount(asOf), { style: "line", fmt: FMT.body, expect: ca.latestCount, label: "latest count" });
  r++;
  const latestFy = years[years.length - 1]!;
  const pnlCol = colLetter(3 + years.length - 1);
  b.row("tieRevenue", r);
  b.text(r, 2, `${ca.term} list revenue FY${latestFy} incl. residual ($)`, { style: "line" });
  b.formula(r, 3, `SUM(${fyCol(years.length - 1)})`, { style: "line", fmt: FMT.currency, expect: ca.concentration.tieToPnl.customerTotal, label: "tie customer total" });
  r++;
  b.text(r, 2, `P&L revenue FY${latestFy} ($)`, { style: "line" });
  b.formula(r, 3, `${S("pnl")}${pnlCol}${rowOf("pnl", "revenue")}*1000`, { style: "line", fmt: FMT.currency, expect: ca.concentration.tieToPnl.pnlRevenue, label: "tie pnl revenue" });
  r++;
  b.row("tieVariance", r);
  b.text(r, 2, "Check: variance (flag above 2%)", { style: "check" });
  b.formula(r, 3, `IFERROR((${addr(r - 2, 3)}-${addr(r - 1, 3)})/${addr(r - 1, 3)},0)`, { style: "check", fmt: FMT.pct1, expect: ca.concentration.tieToPnl.variancePct, tol: 1e-6, label: "C12" });
  b.cf({ ref: addr(r, 3), formula: `ABS(${addr(r, 3)})>0.02`, font: { color: COLOR.pending } });
  r += 2;
  b.note(r, 2, `Note: mix measured over ${ca.period.label}; a ${ca.term.toLowerCase()} counts when it had revenue in the window or is active at the as-of date. Revenue by fiscal year is prorated into the window by the helper shares above when the window is not a fiscal year. Households and members not listed individually sit in the residual line so the total ties to the P&L (check C12).`);
  b.print({ area: `B2:${addr(r, 9)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
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
  const stripHidden = lastSummary + 2;
  const stripFirst = stripHidden + 1;
  const stripLast = stripFirst + 11;
  const notesCol = stripLast + 2;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(3, lastSummary, WIDTH.value);
  b.spacerCol(3 + years.length);
  b.spacerCol(lastSummary + 1);
  b.hideCol(stripHidden);
  b.widths(stripFirst, stripLast, WIDTH.stripRetention);
  b.spacerCol(stripLast + 1);
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Retention: count and dollar roll-forwards (#, $)`, lastCol: notesCol, toggleCol: lastSummary, masterToggle: ctx.masterToggle });
  b.text(3, lastSummary - 1, "Print", { align: { horizontal: "right" } });
  const groups = [{ from: 3, to: 3 + years.length - 1, label: "Full Year" }];
  if (ltm) groups.push({ from: lastSummary, to: lastSummary, label: "LTM" });
  b.tier1(5, [...groups, { from: stripFirst, to: stripLast, label: `LTM Monthly ${ca.term}s` }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: lastSummary }, [], `${ca.term} Count`);
  const asOfMonth = model.assumptions!.asOfMonth;
  const stripMonths = monthRange(addMonths(asOfMonth, -11), asOfMonth);
  const priorMonth = addMonths(asOfMonth, -12);
  b.formula(6, stripHidden, `EOMONTH(${ASOF},-12)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(priorMonth), label: "strip hidden" });
  stripMonths.forEach((m, i) => b.formula(6, stripFirst + i, `EOMONTH(${addr(6, stripFirst + i - 1)},0)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(m), label: `strip ${m}` }));
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const spans: [number, number][] = [[3, 3 + years.length - 1], ...(ltm ? [[lastSummary, lastSummary] as [number, number]] : []), [stripFirst, stripLast]];

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
  const dollarKeys = ["startingRevenue", "churnRevenue", "downsell", "upsell", "newRevenue", "endingRevenue", "gdr", "ndr"] as const;
  const dollarLabels: Record<(typeof dollarKeys)[number], string> = {
    startingRevenue: "Starting Revenue",
    churnRevenue: "(-) Churn",
    downsell: "(-) Downsell",
    upsell: "(+) Upsell",
    newRevenue: "(+) New",
    endingRevenue: "Ending Revenue",
    gdr: "Gross Dollar Retention",
    ndr: "Net Dollar Retention",
  };
  b.section(r++, "Dollar roll-forward ($, fiscal years)", spans.slice(0, 1));
  for (const k of dollarKeys) b.row(k, r++);
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
    b.formula(6, c, column.ref.kind === "fiscal_year" ? `"FY"&YEAR(${addr(helperRow + 1, c, { row: true })})` : `"LTM "&TEXT(${addr(helperRow + 1, c, { row: true })},"mmm-yy")`, { style: "header", role: "text", expect: column.label, label: `${column.label} label` });
    windows.set(c, { start: addr(helperRow, c, { row: true }), end: addr(helperRow + 1, c, { row: true }) });
  }
  // Strip windows: the month header is the start; EOMONTH of it the end.
  const stripCols = [stripHidden, ...stripMonths.map((_, i) => stripFirst + i)];
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
      const dayBefore = `${w.start}-1`;
      let f: string;
      switch (k) {
        case "startingCount":
          f = isStrip && c !== stripHidden ? addr(b.r("endingCount"), c - 1) : `COUNTIFS(${START()},"<="&${dayBefore},${END()},"")+COUNTIFS(${START()},"<="&${dayBefore},${END()},">="&${dayBefore})`;
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
  const customers = model.assumptions ? ctxCustomers(ctx) : [];
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
    b.formula(rr, hEnd, `IF(INDEX(${END()},MATCH(${code},${CODE()},0))="","",INDEX(${END()},MATCH(${code},${CODE()},0)))`, { style: "helper", role: "helper", fmt: FMT.date, label: `end ${c.id}` });
    b.formula(rr, hTenure, `IF(OR(${addr(rr, hEnd)}<>"",${addr(rr, hStart)}>${ASOF}),"",MAX(0,(${ASOF}-${addr(rr, hStart)})/365.25))`, { style: "helper", role: "helper", fmt: FMT.oneDp, label: `tenure ${c.id}` });
    years.forEach((y, yi) => {
      const base = yearBase(yi);
      const w = windows.get(3 + yi)!;
      const prev = addr(rr, base);
      const cur = addr(rr, base + 1);
      const active = addr(rr, base + 2);
      const lost = addr(rr, base + 3);
      const started = addr(rr, base + 4);
      const fy = y.fiscalYear!;
      const prevRev = yi === 0 ? (c.revenueByFiscalYear[fy - 1] ?? 0) : (c.revenueByFiscalYear[fy - 1] ?? 0);
      const curRev = c.revenueByFiscalYear[fy] ?? 0;
      const prevIdx = years.findIndex((x) => x.fiscalYear === fy - 1);
      b.formula(rr, base, prevIdx >= 0 ? `INDEX(${fyCol(prevIdx)},MATCH(${code},${CODE()},0))` : "0", { style: "helper", role: "helper", fmt: FMT.body, expect: prevIdx >= 0 ? prevRev : 0, label: `prev ${c.id} ${fy}` });
      b.formula(rr, base + 1, `INDEX(${fyCol(yi)},MATCH(${code},${CODE()},0))`, { style: "helper", role: "helper", fmt: FMT.body, expect: curRev, label: `cur ${c.id} ${fy}` });
      const s = addr(rr, hStart);
      const e = addr(rr, hEnd);
      b.formula(rr, base + 2, `IF(AND(${s}<${w.start},OR(${e}="",${e}>=${w.start})),1,0)`, { style: "helper", role: "helper", fmt: FMT.term, label: `active ${c.id} ${fy}` });
      b.formula(rr, base + 3, `IF(AND(${e}<>"",${e}>=${w.start},${e}<=${w.end}),1,0)`, { style: "helper", role: "helper", fmt: FMT.term, label: `lost ${c.id} ${fy}` });
      b.formula(rr, base + 4, `IF(AND(${s}>=${w.start},${s}<=${w.end}),1,0)`, { style: "helper", role: "helper", fmt: FMT.term, label: `started ${c.id} ${fy}` });
      b.formula(rr, base + 5, `${active}*${prev}`, { style: "helper", role: "helper", fmt: FMT.body, label: `starting ${c.id} ${fy}` });
      b.formula(rr, base + 6, `${active}*${lost}*${prev}`, { style: "helper", role: "helper", fmt: FMT.body, label: `churn ${c.id} ${fy}` });
      b.formula(rr, base + 7, `${active}*(1-${lost})*MAX(0,${prev}-${cur})`, { style: "helper", role: "helper", fmt: FMT.body, label: `downsell ${c.id} ${fy}` });
      b.formula(rr, base + 8, `${active}*(1-${lost})*MAX(0,${cur}-${prev})`, { style: "helper", role: "helper", fmt: FMT.body, label: `upsell ${c.id} ${fy}` });
      void started;
    });
  });
  const hLast = hFirst + customers.length;
  const hRange = (c: number) => `${addr(hFirst + 1, c, { row: true, col: true })}:${addr(hLast, c, { row: true, col: true })}`;

  // Dollar block, fiscal years only.
  for (const k of dollarKeys) {
    const rr = b.r(k);
    const isRatio = k === "gdr" || k === "ndr";
    const isTotal = k === "endingRevenue";
    b.text(rr, 2, dollarLabels[k], { style: isTotal ? "keyTotal" : isRatio ? "ratio" : k === "startingRevenue" ? "lineFirst" : "line", align: isRatio ? { horizontal: "left", indent: 1 } : undefined });
    if (isTotal) b.keyTotalBox([rr, rr], [[3, 3 + years.length - 1]]);
    years.forEach((y, yi) => {
      const c = 3 + yi;
      const d = ret.byFiscalYear[y.fiscalYear!]!.dollars;
      const hasPrior = years.some((x) => x.fiscalYear === y.fiscalYear! - 1) || customers.some((x) => x.revenueByFiscalYear[y.fiscalYear! - 1] !== undefined);
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
        case "gdr":
          f = `IFERROR((${at("startingRevenue")}-${at("churnRevenue")}-${at("downsell")})/${at("startingRevenue")},"n.a.")`;
          expect = d.startingRevenue ? d.gdr : "n.a.";
          break;
        default:
          f = `IFERROR((${at("startingRevenue")}-${at("churnRevenue")}-${at("downsell")}+${at("upsell")})/${at("startingRevenue")},"n.a.")`;
          expect = d.startingRevenue ? d.ndr : "n.a.";
      }
      b.formula(rr, c, f, { style: isTotal ? "keyTotal" : isRatio ? "ratio" : "line", fmt: isRatio ? FMT.pct1 : k === "startingRevenue" ? FMT.currency : FMT.body, expect, label: `${k} FY${y.fiscalYear}` });
    });
  }
  const mr = b.r("median");
  b.text(mr, 2, `Median tenure of active ${ca.term.toLowerCase()}s (years)`, { style: "keyTotal", align: { horizontal: "left" } });
  b.keyTotalBox([mr, mr], [[3, 3]]);
  b.formula(mr, 3, `IFERROR(MEDIAN(${hRange(hTenure)}),"n.a.")`, { style: "keyTotal", fmt: FMT.oneDp, expect: ret.medianTenureYears, label: "median tenure" });
  b.note(lastPrinted, 2, `Note: counts are COUNTIFS over the raw ${ca.term.toLowerCase()} list by start and end date; a ${ca.term.toLowerCase()} is active from its start date until its end date inclusive. Churn = losses ÷ average ${ca.term.toLowerCase()}s. The dollar roll-forward compares each ${ca.term.toLowerCase()}'s revenue with the prior fiscal year (helper block below the print area); GDR excludes upsell, NDR includes it. Strip months end at the as-of date.`);
  b.print({ area: `B2:${addr(lastPrinted, notesCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  const latestFyIdx = years.length - 1;
  b.defineName("GDR_LTM", `$${colLetter(3 + latestFyIdx)}$${b.r("gdr")}`);
  b.defineName("NDR_LTM", `$${colLetter(3 + latestFyIdx)}$${b.r("ndr")}`);
  return b;
}

function countFor(c: ModelOutput["customers"] extends infer T ? (T extends { retention?: infer R } ? (R extends { ltm?: infer L } ? (L extends { counts: infer C } ? C : never) : never) : never) : never) {
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

/** The coded customers the helper block lists, in code order. */
function ctxCustomers(ctx: TabContext): { id: string; startDate?: string; endDate?: string; revenueByFiscalYear: Record<number, number> }[] {
  return ctx.customers ?? [];
}

// --- Concentration --------------------------------------------------------------------------------

export function planConcentration(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const ca = model.customers;
  if (!ca) return undefined;
  const b = new SheetBuilder("concentration", SHEET.concentration);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).map((c) => c.fiscalYear!);
  const headers = ["Code", "Revenue ($)", "% of Total", "Cumulative %", "Tenure (Yrs.)", "Type"];
  const widths = [WIDTH.label, 14, 11, 12, 12, 22];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(8);
  b.width(9, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Concentration: Top 20 over ${ca.period.label} ($)`, lastCol: 9, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 7, label: `Top 20 ${ca.term}s (${ca.period.label})` }, { from: 9, to: 9, label: "Notes" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 || i === 5 ? "left" : "center" } }));
  b.cell(6, 9, { style: "header", v: null, role: "text" });
  const shareRef = (i: number) => `${S("customers")}$${colLetter(3 + i)}$${rowOf("customers", "shareRow")}`;
  const windowRevenueOf = (code: string) => years.map((_, i) => `${shareRef(i)}*INDEX(${fyCol(i)},MATCH(${code},${CODE()},0))`).join("+");
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
    b.formula(rr, 6, `MAX(0,(${ASOF}-INDEX(${START()},MATCH(${addr(rr, 2)},${CODE()},0)))/365.25)`, { style: "line", fmt: FMT.oneDp, expect: row.tenureYears, label: `tenure ${row.id}` });
    b.formula(rr, 7, `INDEX(${TYPE()},MATCH(${addr(rr, 2)},${CODE()},0))`, { role: "link", expect: row.type ?? "", label: `type ${row.id}` });
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
  b.formula(r, 3, years.map((_, i) => `${shareRef(i)}*SUM(${fyCol(i)})`).join("+"), { style: "keyTotal", fmt: FMT.currency, expect: ca.concentration.total, label: "total revenue" });
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

export function planCohorts(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const ca = model.customers;
  if (!ca?.cohorts) return undefined;
  const b = new SheetBuilder("cohorts", SHEET.cohorts);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const n = years.length;
  const lastCol = 3 + n + 1;
  b.width(1, WIDTH.gutter);
  b.width(2, 16);
  b.width(3, 10);
  b.widths(4, 3 + n, WIDTH.value);
  b.spacerCol(4 + n);
  b.width(lastCol, WIDTH.notes);
  b.anatomy({ subtitle: `${ca.term} Cohorts by start year (#, $)`, lastCol, toggleCol: 3 + n, masterToggle: ctx.masterToggle });
  b.text(3, 2 + n, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 3, label: "Cohort" }, { from: 4, to: 3 + n, label: "Active at fiscal year-end (#)" }, { from: lastCol, to: lastCol, label: "Notes" }]);
  b.cell(6, 2, { style: "header", v: "Start year", role: "text", align: { horizontal: "left" } });
  b.cell(6, 3, { style: "header", v: "Size (#)", role: "text" });
  years.forEach((y, i) => b.cell(6, 4 + i, { style: "header", v: y.label, role: "text" }));
  b.cell(6, lastCol, { style: "header", v: null, role: "text" });
  const fyEnd = (y: PeriodColumn) => `EOMONTH(DATE(${y.fiscalYear},${model.fiscalYearEndMonth},1),0)`;
  let r = 8;
  const cohortStart = (rr: number) => `DATE(${addr(rr, 2)},1,1)`;
  const cohortEnd = (rr: number) => `DATE(${addr(rr, 2)},12,31)`;
  for (const c of ca.cohorts.countTriangle) {
    b.num(r, 2, c.cohort, { fmt: FMT.term, align: { horizontal: "left", indent: 1 } });
    b.formula(r, 3, `COUNTIFS(${START()},">="&${cohortStart(r)},${START()},"<="&${cohortEnd(r)})`, { style: "line", fmt: FMT.body, expect: c.size, label: `cohort ${c.cohort} size` });
    years.forEach((y, i) => {
      const k = i - (n - c.retainedByYear.length);
      if (y.fiscalYear! < c.cohort) {
        b.na(r, 4 + i, "", { style: "line" });
        return;
      }
      const end = fyEnd(y);
      b.formula(r, 4 + i, `COUNTIFS(${START()},">="&${cohortStart(r)},${START()},"<="&${cohortEnd(r)},${START()},"<="&${end},${END()},"")+COUNTIFS(${START()},">="&${cohortStart(r)},${START()},"<="&${cohortEnd(r)},${START()},"<="&${end},${END()},">="&${end})`, { style: "line", fmt: FMT.body, expect: c.retainedByYear[k] ?? 0, label: `cohort ${c.cohort} ${y.label}` });
    });
    r++;
  }
  r++;
  b.section(r++, "Revenue by cohort ($)", [[3, 3 + n]]);
  b.cell(r, 2, { style: "header", v: "Start year", role: "text", align: { horizontal: "left" } });
  b.cell(r, 3, { style: "header", v: "First-year revenue", role: "text" });
  years.forEach((y, i) => b.cell(r, 4 + i, { style: "header", v: y.label, role: "text" }));
  r++;
  for (const c of ca.cohorts.revenueTriangle) {
    b.num(r, 2, c.cohort, { fmt: FMT.term, align: { horizontal: "left", indent: 1 } });
    const firstIdx = years.findIndex((y) => y.fiscalYear! >= c.cohort);
    b.formula(r, 3, firstIdx >= 0 ? `SUMIFS(${fyCol(firstIdx)},${START()},">="&${cohortStart(r)},${START()},"<="&${cohortEnd(r)})` : "0", { style: "line", fmt: FMT.body, expect: c.revenue, label: `cohort ${c.cohort} first revenue` });
    years.forEach((y, i) => {
      const k = i - (n - c.retainedByYear.length);
      if (y.fiscalYear! < c.cohort) {
        b.na(r, 4 + i, "", { style: "line" });
        return;
      }
      b.formula(r, 4 + i, `SUMIFS(${fyCol(i)},${START()},">="&${cohortStart(r)},${START()},"<="&${cohortEnd(r)})`, { style: "line", fmt: FMT.body, expect: c.retainedByYear[k] ?? 0, label: `cohort ${c.cohort} revenue ${y.label}` });
    });
    r++;
  }
  r++;
  b.note(r, 2, `Note: a cohort is the calendar year of the first invoice or contract start; retained means active at that fiscal year-end. Cohorts before the history window are shown when their members are still in the list.`);
  b.print({ area: `B2:${addr(r, lastCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

export { monthEndDate };
