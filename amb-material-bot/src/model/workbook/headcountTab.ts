// Headcount (guide 5.1 row 14, 5.5): by department at the as-of date, load
// ratios, the employee roll-forward by fiscal year and tenure at departure,
// all COUNTIFS / SUMIFS over the raw register with a grey helper block for
// tenure.

import { excelSerial } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { RAW_PAYROLL_COLS } from "./data.ts";
import { ASOF, S, SHEET, serialOfMonthEnd, serialOfMonthStart, windowFormulas } from "./layout.ts";
import { TENURE_BUCKETS } from "../analytics.ts";

const RP = () => S("rawPayroll");
const col = (n: number) => `${RP()}$${colLetter(n)}:$${colLetter(n)}`;
const DEPT = () => col(RAW_PAYROLL_COLS.department);
const OWNER = () => col(RAW_PAYROLL_COLS.owner);
const HIRE = () => col(RAW_PAYROLL_COLS.hire);
const TERM = () => col(RAW_PAYROLL_COLS.termination);
const TERM_TYPE = () => col(RAW_PAYROLL_COLS.terminationType);
const FTE = () => col(RAW_PAYROLL_COLS.fte);
const ID = () => col(RAW_PAYROLL_COLS.id);

export function planHeadcount(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const hc = model.headcount;
  if (!hc || !ctx.employees) return undefined;
  const b = new SheetBuilder("headcount", SHEET.headcount);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const n = years.length;
  const latestIdx = n - 1;
  const wagesCol = (i: number) => col(RAW_PAYROLL_COLS.firstWages + i);
  const costsCol = (i: number) => col(RAW_PAYROLL_COLS.firstWages + n + i);
  const headers = ["Department", "Count (#)", "Total Comp ($)", "Avg. Comp ($)", "% of Revenue", "Avg. Tenure (Yrs.)", "Field?"];
  const widths = [WIDTH.label, 10, 14, 13, 12, 14, 8];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(9);
  b.width(10, WIDTH.notes);
  const lastCol = 10;
  b.anatomy({ subtitle: `Headcount by department at ${ctx.asOfLabel}; compensation for ${years[latestIdx]!.label} (#, $)`, lastCol, toggleCol: 8, masterToggle: ctx.masterToggle });
  b.text(3, 7, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 8, label: "By department" }, { from: lastCol, to: lastCol, label: "Notes" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 ? "left" : "center" } }));
  b.cell(6, lastCol, { style: "header", v: null, role: "text" });

  const asOf = ASOF;
  const onPayroll = (extra: string) => `SUMIFS(${FTE()},${OWNER()},"No",${HIRE()},"<="&${asOf},${TERM()},""${extra})+SUMIFS(${FTE()},${OWNER()},"No",${HIRE()},"<="&${asOf},${TERM()},">"&${asOf}${extra})`;
  let r = 8;
  const first = r;
  const revenueCell = `${S("pnl")}${colLetter(3 + latestIdx)}${rowOf("pnl", "revenue")}*1000`;
  // Helper block (grey, below the print area): tenure at the as-of date for those on payroll, months at departure for leavers.
  const helperTop = 60;
  for (const d of hc.byDepartment) {
    const dep = `"${d.department.replace(/"/g, '""')}"`;
    b.text(r, 2, d.department, { style: "lineFirst" });
    b.formula(r, 3, onPayroll(`,${DEPT()},${dep}`), { style: "line", fmt: FMT.body, expect: d.count, label: `count ${d.department}` });
    b.formula(r, 4, `SUMIFS(${wagesCol(latestIdx)},${OWNER()},"No",${DEPT()},${dep})+SUMIFS(${costsCol(latestIdx)},${OWNER()},"No",${DEPT()},${dep})`, { style: "line", fmt: FMT.currency, expect: d.totalComp, label: `comp ${d.department}` });
    b.formula(r, 5, `IFERROR(${addr(r, 4)}/${addr(r, 3)},"n.a.")`, { style: "line", fmt: FMT.currency, expect: d.count ? d.avgComp : "n.a.", label: `avg comp ${d.department}` });
    b.formula(r, 6, `IFERROR(${addr(r, 4)}/${revenueCell},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: d.pctRevenue, label: `pct rev ${d.department}` });
    b.formula(r, 7, `IFERROR(AVERAGEIFS(${addr(helperTop + 1, 4, { row: true, col: true })}:${addr(helperTop + ctx.employees.length, 4, { row: true, col: true })},${addr(helperTop + 1, 3, { row: true, col: true })}:${addr(helperTop + ctx.employees.length, 3, { row: true, col: true })},${dep}),"n.a.")`, { style: "line", fmt: FMT.oneDp, expect: d.count ? d.avgTenureYears : "n.a.", label: `tenure ${d.department}` });
    b.cell(r, 8, { v: /field|install|technician|service|crew/i.test(d.department) ? "Yes" : "No", role: "input", align: { horizontal: "center" } });
    r++;
  }
  const last = r - 1;
  b.row("total", r);
  b.text(r, 2, "Total (non-owner)", { style: "keyTotal" });
  b.keyTotalBox([r, r], [[3, 8]]);
  b.formula(r, 3, `SUM(${addr(first, 3)}:${addr(last, 3)})`, { style: "keyTotal", fmt: FMT.body, expect: hc.latestHeadcount, label: "total headcount" });
  b.formula(r, 4, `SUM(${addr(first, 4)}:${addr(last, 4)})`, { style: "keyTotal", fmt: FMT.currency, expect: hc.byDepartment.reduce((s, d) => s + d.totalComp, 0), label: "total comp" });
  b.formula(r, 5, `IFERROR(${addr(r, 4)}/${addr(r, 3)},"n.a.")`, { style: "keyTotal", fmt: FMT.currency, expect: hc.latestHeadcount ? hc.byDepartment.reduce((s, d) => s + d.totalComp, 0) / hc.latestHeadcount : "n.a.", label: "total avg comp" });
  b.formula(r, 6, `IFERROR(${addr(r, 4)}/${revenueCell},"n.a.")`, { style: "margin", fmt: FMT.pct1, expect: hc.byDepartment.reduce((s, d) => s + d.pctRevenue, 0), label: "total pct rev" });
  r += 2;

  b.section(r++, "Load ratios (latest full window)", [[3, 8]]);
  const revenue = model.periods[model.customers?.period.key ?? years[latestIdx]!.key]!.pnl.revenue;
  void revenue;
  b.row("fieldCount", r);
  b.text(r, 2, "Field employees (#)", { style: "line" });
  b.formula(r, 3, `SUMIFS(${addr(first, 3)}:${addr(last, 3)},${addr(first, 8)}:${addr(last, 8)},"Yes")`, { style: "line", fmt: FMT.body, expect: hc.latestFieldHeadcount, label: "field count" });
  r++;
  const latestRevenue = `${S("pnl")}${colLetter(latestRevenueCol(model))}${rowOf("pnl", "revenue")}*1000`;
  b.text(r, 2, "Revenue per employee ($)", { style: "line" });
  b.formula(r, 3, `IFERROR(${latestRevenue}/${addr(b.r("total"), 3)},"n.a.")`, { style: "line", fmt: FMT.currency, expect: hc.loadRatios.revenuePerEmployee, label: "revenue per employee" });
  r++;
  b.text(r, 2, "Revenue per field employee ($)", { style: "line" });
  b.formula(r, 3, `IFERROR(${latestRevenue}/${addr(b.r("fieldCount"), 3)},"n.a.")`, { style: "line", fmt: FMT.currency, expect: hc.loadRatios.revenuePerFieldEmployee, label: "revenue per field employee" });
  r++;
  if (hc.loadRatios.customersPerEmployee !== undefined) {
    b.text(r, 2, `${model.customers!.term}s per employee (#)`, { style: "line" });
    b.formula(r, 3, `IFERROR(${S("customers")}$C$${rowOf("customers", "latestCount")}/${addr(b.r("total"), 3)},"n.a.")`, { style: "line", fmt: FMT.oneDp, expect: hc.loadRatios.customersPerEmployee, label: "customers per employee" });
    r++;
  }
  b.text(r, 2, "Labor cost, % of revenue (excludes owner)", { style: "line" });
  b.formula(r, 3, `IFERROR(${S("pnl")}${colLetter(latestRevenueCol(model))}${rowOf("pnl", "payroll")}/${S("pnl")}${colLetter(latestRevenueCol(model))}${rowOf("pnl", "revenue")},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: hc.loadRatios.laborCostPctRevenue, label: "labor cost pct" });
  r += 2;

  // Roll-forward by fiscal year.
  b.section(r++, "Employee roll-forward (non-owner, #)", [[3, 3 + n - 1]]);
  years.forEach((y, i) => b.cell(r, 3 + i, { style: "header", v: y.label, role: "text" }));
  b.cell(r, 2, { style: "header", v: "Roll-forward", role: "text", align: { horizontal: "left" } });
  r++;
  const helperRow = helperTop - 3;
  years.forEach((y, i) => {
    const w = windowFormulas(y, model);
    b.formula(helperRow, 3 + i, w.start, { style: "helper", role: "helper", fmt: FMT.date, expect: serialOfMonthStart(y.start), label: `${y.label} start` });
    b.formula(helperRow + 1, 3 + i, w.end, { style: "helper", role: "helper", fmt: FMT.date, expect: serialOfMonthEnd(y.end), label: `${y.label} end` });
  });
  b.text(helperRow, 2, "Period start", { style: "helper" });
  b.text(helperRow + 1, 2, "Period end", { style: "helper" });
  const win = (i: number) => ({ start: addr(helperRow, 3 + i, { row: true }), end: addr(helperRow + 1, 3 + i, { row: true }) });
  const rfKeys = ["start", "hires", "resignations", "terminations", "unclassified", "end"] as const;
  const rfLabels = { start: "Starting Count", hires: "(+) Hires", resignations: "(-) Resignations", terminations: "(-) Terminations", unclassified: "(-) Unclassified Departures", end: "Ending Count" };
  const rfRow: Record<string, number> = {};
  for (const k of rfKeys) rfRow[k] = r++;
  for (const k of rfKeys) {
    const rr = rfRow[k]!;
    b.text(rr, 2, rfLabels[k], { style: k === "end" ? "keyTotal" : k === "start" ? "lineFirst" : "line" });
    if (k === "end") b.keyTotalBox([rr, rr], [[3, 3 + n - 1]]);
    years.forEach((y, i) => {
      const w = win(i);
      const rf = hc.rollForwardByFiscalYear[y.fiscalYear!]!;
      const dayBefore = `${w.start}-1`;
      let f: string;
      let expect: number;
      switch (k) {
        case "start":
          f = `COUNTIFS(${OWNER()},"No",${HIRE()},"<="&${dayBefore},${TERM()},"")+COUNTIFS(${OWNER()},"No",${HIRE()},"<="&${dayBefore},${TERM()},">"&${dayBefore})`;
          expect = rf.start;
          break;
        case "hires":
          f = `COUNTIFS(${OWNER()},"No",${HIRE()},">="&${w.start},${HIRE()},"<="&${w.end})`;
          expect = rf.hires;
          break;
        case "resignations":
          f = `COUNTIFS(${OWNER()},"No",${TERM()},">="&${w.start},${TERM()},"<="&${w.end},${TERM_TYPE()},"resignation")`;
          expect = rf.departuresByType.resignation ?? 0;
          break;
        case "terminations":
          f = `COUNTIFS(${OWNER()},"No",${TERM()},">="&${w.start},${TERM()},"<="&${w.end},${TERM_TYPE()},"termination")`;
          expect = rf.departuresByType.termination ?? 0;
          break;
        case "unclassified":
          f = `COUNTIFS(${OWNER()},"No",${TERM()},">="&${w.start},${TERM()},"<="&${w.end})-${addr(rfRow.resignations!, 3 + i)}-${addr(rfRow.terminations!, 3 + i)}`;
          expect = rf.departures - (rf.departuresByType.resignation ?? 0) - (rf.departuresByType.termination ?? 0);
          break;
        default:
          f = `${addr(rfRow.start!, 3 + i)}+${addr(rfRow.hires!, 3 + i)}-${addr(rfRow.resignations!, 3 + i)}-${addr(rfRow.terminations!, 3 + i)}-${addr(rfRow.unclassified!, 3 + i)}`;
          expect = rf.end;
      }
      b.formula(rr, 3 + i, f, { style: k === "end" ? "keyTotal" : "line", fmt: FMT.body, expect, label: `${k} ${y.label}` });
    });
  }
  r++;

  // Tenure at departure (V51 buckets verbatim).
  b.section(r++, "Tenure at departure (#)", [[3, 3]]);
  const monthsCol = 5;
  const bucketBounds: [number, number | undefined][] = [[0, 3], [3, 6], [6, 12], [12, 24], [24, undefined]];
  TENURE_BUCKETS.forEach((bucket, i) => {
    const [lo, hi] = bucketBounds[i]!;
    const rng = `${addr(helperTop + 1, monthsCol, { row: true, col: true })}:${addr(helperTop + ctx.employees!.length, monthsCol, { row: true, col: true })}`;
    b.text(r, 2, bucket, { style: "line" });
    b.formula(r, 3, hi === undefined ? `COUNTIFS(${rng},">="&${lo})` : `COUNTIFS(${rng},">="&${lo},${rng},"<"&${hi})`, { style: "line", fmt: FMT.body, expect: hc.tenureAtDeparture.find((t) => t.bucket === bucket)!.count, label: `tenure bucket ${bucket}` });
    r++;
  });
  r++;
  b.section(r++, "Tie-out", [[3, 3]]);
  b.row("tieRegister", r);
  b.text(r, 2, `Payroll register ${years[latestIdx]!.label}: non-owner wages and employer costs ($)`, { style: "line" });
  b.formula(r, 3, `SUMIFS(${wagesCol(latestIdx)},${OWNER()},"No")+SUMIFS(${costsCol(latestIdx)},${OWNER()},"No")`, { style: "line", fmt: FMT.currency, expect: hc.tieToPnl.registerTotal, label: "register total" });
  r++;
  b.text(r, 2, `P&L salaries, wages and benefits ${years[latestIdx]!.label} ($)`, { style: "line" });
  b.formula(r, 3, `${S("pnl")}${colLetter(3 + latestIdx)}${rowOf("pnl", "payroll")}*1000`, { style: "line", fmt: FMT.currency, expect: hc.tieToPnl.pnlPayroll, label: "pnl payroll" });
  r++;
  b.row("tieVariance", r);
  b.text(r, 2, "Check: variance (flag above 5%)", { style: "check" });
  b.formula(r, 3, `IFERROR((${addr(r - 2, 3)}-${addr(r - 1, 3)})/${addr(r - 1, 3)},0)`, { style: "check", fmt: FMT.pct1, expect: hc.tieToPnl.variancePct, tol: 1e-6, label: "C13" });
  b.cf({ ref: addr(r, 3), formula: `ABS(${addr(r, 3)})>0.05`, font: { color: COLOR.pending } });
  r += 2;
  const lastPrinted = r;
  b.note(r, 2, "Note: counts are non-owner FTE on payroll at the date (hired on or before it, not terminated on or before it). Compensation is wages plus allocated employer taxes and benefits for the latest fiscal year. Names stay on the raw tab; management names appear in the CIM only through the intake notes.");

  // Helper block.
  const ht = Math.max(helperTop, lastPrinted + 3);
  b.text(ht - 1, 2, "Helper: tenure by employee (grey; outside the print area)", { style: "helper" });
  ["ID", "Department", "Tenure at as-of (yrs)", "Months at departure"].forEach((h, i) => b.text(ht, 2 + i, h, { style: "helper" }));
  ctx.employees.forEach((e, i) => {
    const rr = ht + 1 + i;
    const id = addr(rr, 2);
    b.text(rr, 2, e.id, { style: "helper" });
    b.formula(rr, 3, `INDEX(${DEPT()},MATCH(${id},${ID()},0))`, { style: "helper", role: "helper", expect: e.department, label: `dept ${e.id}` });
    const hire = `INDEX(${HIRE()},MATCH(${id},${ID()},0))`;
    const term = `INDEX(${TERM()},MATCH(${id},${ID()},0))`;
    const owner = `INDEX(${OWNER()},MATCH(${id},${ID()},0))`;
    b.formula(rr, 4, `IF(OR(${owner}="Yes",${term}<>"",${hire}>${asOf}),"",(${asOf}-${hire})/365.25)`, { style: "helper", role: "helper", fmt: FMT.oneDp, label: `tenure ${e.id}` });
    b.formula(rr, 5, `IF(OR(${owner}="Yes",${term}=""),"",(${term}-${hire})/(365.25/12))`, { style: "helper", role: "helper", fmt: FMT.oneDp, expect: e.terminationDate && !e.isOwner ? (excelSerial(e.terminationDate) - excelSerial(e.hireDate)) / (365.25 / 12) : "", label: `months ${e.id}` });
  });
  void helperTop;
  b.print({ area: `B2:${addr(lastPrinted, lastCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.defineName("Headcount_Latest", `$C$${b.r("total")}`);
  return b;
}

/** Column on P&L Summary of the latest full window (LTM CY when monthly, else the latest FY). */
function latestRevenueCol(model: ReturnType<typeof Object>["constructor"] extends never ? never : TabContext["model"]): number {
  const hist = model.columns.filter((c) => !c.projected);
  let col = 3;
  let target = 3;
  for (let k = 0; k < hist.length; k++) {
    if (k > 0) {
      const prev = hist[k - 1]!;
      const cur = hist[k]!;
      col += cur.group !== prev.group && !(prev.group === "LTM" && cur.group === "PF") ? 2 : 1;
    }
    const c = hist[k]!;
    if (c.ref.kind === "ltm" && !c.priorYear) target = col;
    if (c.ref.kind === "fiscal_year" && !hist.some((x) => x.ref.kind === "ltm")) target = col;
  }
  return target;
}
