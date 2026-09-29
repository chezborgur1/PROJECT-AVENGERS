// Headcount (guide 5.1 row 14, 5.5): by department at the as-of date, load
// ratios, the employee roll-forward by fiscal year and tenure at departure.
// Every figure is a COUNTIFS / SUMIFS over the raw register; tenure runs
// through a grey per-employee helper block below the print area, so a
// reviewer can open the row behind any average.

import { excelSerial } from "../periods.ts";
import { TENURE_BUCKETS, isFieldDepartment } from "../analytics.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import { latestColumn } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { RAW_PAYROLL_COLS } from "./data.ts";
import { ASOF, periodLayout, S, SHEET, serialOfMonthEnd, serialOfMonthStart, windowFormulas } from "./layout.ts";

const K = 1000;
const RAW = (n: number) => `${S("rawPayroll")}$${colLetter(n)}:$${colLetter(n)}`;
const DEPT = RAW(RAW_PAYROLL_COLS.department);
const OWNER = RAW(RAW_PAYROLL_COLS.owner);
const HIRE = RAW(RAW_PAYROLL_COLS.hire);
const TERM = RAW(RAW_PAYROLL_COLS.termination);
const TERM_TYPE = RAW(RAW_PAYROLL_COLS.terminationType);
const FTE = RAW(RAW_PAYROLL_COLS.fte);
const ID = RAW(RAW_PAYROLL_COLS.id);

/** Month bounds of each tenure bucket (V51 labels verbatim); the last has no upper bound. */
const BUCKET_MONTHS: [number, number | undefined][] = [[0, 3], [3, 6], [6, 12], [12, 24], [24, undefined]];

export function planHeadcount(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const hc = model.headcount;
  if (!hc || !ctx.employees.length) return undefined;
  const b = new SheetBuilder("headcount", SHEET.headcount);
  const years = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const n = years.length;
  const latestFy = years[n - 1]!;
  const register = (first: number, i: number) => RAW(first + i);
  const wages = register(RAW_PAYROLL_COLS.firstWages, n - 1);
  const costs = register(RAW_PAYROLL_COLS.firstWages + n, n - 1);
  const pnlL = periodLayout(model, 3);
  const pnlCell = (key: string, colKey: string) => `${S("pnl")}${colLetter(pnlL.byKey[colKey]!)}${rowOf("pnl", key)}`;
  const window = latestColumn(model);

  const lastCol = 10;
  b.width(1, WIDTH.gutter);
  [WIDTH.label, 10, 14, 13, 12, 17, 8].forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(9);
  b.width(lastCol, WIDTH.notes);
  b.anatomy({ subtitle: `Headcount by Department at ${ctx.asOfLabel}, Compensation ${latestFy.label} (#, $)`, lastCol, toggleCol: 8, masterToggle: ctx.masterToggle });
  b.text(3, 7, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 8, label: "By department" }, { from: lastCol, to: lastCol, label: "Notes" }]);
  ["Department", "Count (#)", "Total Comp ($)", "Avg. Comp ($)", "% of Revenue", "Avg. Tenure (Yrs.)", "Field?"].forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 ? "left" : "center" } }));
  b.cell(6, lastCol, { style: "header", v: null, role: "text" });

  // Layout first, so every formula can name the rows it reads.
  let r = 8;
  const deptFirst = r;
  r += hc.byDepartment.length;
  const deptLast = r - 1;
  b.row("total", r++);
  r++;
  b.row("secLoad", r++);
  b.row("fieldCount", r++);
  b.row("revPerEmployee", r++);
  b.row("revPerField", r++);
  if (hc.loadRatios.customersPerEmployee !== undefined) b.row("customersPerEmployee", r++);
  b.row("laborCost", r++);
  r++;
  b.row("secRoll", r++);
  b.row("rollHeader", r++);
  const rollKeys = ["start", "hires", "resignations", "terminations", "unclassified", "end"] as const;
  for (const k of rollKeys) b.row(`roll_${k}`, r++);
  r++;
  b.row("secTenure", r++);
  TENURE_BUCKETS.forEach((_, i) => b.row(`bucket${i}`, r++));
  b.row("bucketTotal", r++);
  r++;
  b.row("secTie", r++);
  b.row("tieRegister", r++);
  b.row("tiePnl", r++);
  b.row("tieVariance", r++);
  r++;
  const noteRow = r;
  const helperStart = noteRow + 3;
  const helperEnd = helperStart + 1;
  const empHeader = helperEnd + 3;
  const empFirst = empHeader + 1;
  const empLast = empFirst + ctx.employees.length - 1;
  const helperCol = { id: 2, dept: 3, tenure: 4, monthsAtDeparture: 5, fteYears: 6 };
  // The latest fiscal year's window, from the roll-forward's helper rows, for the FTE-years each employee worked in it.
  const fyStart = addr(helperStart, 2 + n, { row: true, col: true });
  const fyEnd = addr(helperEnd, 2 + n, { row: true, col: true });
  const helperRange = (c: number) => `${addr(empFirst, c, { row: true, col: true })}:${addr(empLast, c, { row: true, col: true })}`;

  // By department.
  const onPayroll = (extra: string) => `SUMIFS(${FTE},${OWNER},"No",${HIRE},"<="&${ASOF},${TERM},""${extra})+SUMIFS(${FTE},${OWNER},"No",${HIRE},"<="&${ASOF},${TERM},">"&${ASOF}${extra})`;
  const fyRevenue = `(${pnlCell("revenue", latestFy.key)}*${K})`;
  hc.byDepartment.forEach((d, i) => {
    const rr = deptFirst + i;
    const dep = `"${d.department.replace(/"/g, '""')}"`;
    b.text(rr, 2, d.department, { style: "line" });
    b.formula(rr, 3, onPayroll(`,${DEPT},${dep}`), { style: i === 0 ? "lineFirst" : "line", fmt: FMT.body, expect: d.count, label: `count ${d.department}` });
    b.formula(rr, 4, `SUMIFS(${wages},${OWNER},"No",${DEPT},${dep})+SUMIFS(${costs},${OWNER},"No",${DEPT},${dep})`, { style: i === 0 ? "lineFirst" : "line", fmt: i === 0 ? FMT.currency : FMT.body, expect: d.totalComp, label: `comp ${d.department}` });
    // Pay covers leavers too, so the average divides by the year's average FTE (helper block), not the head count at the as-of date.
    b.formula(rr, 5, `IFERROR(${addr(rr, 4)}/SUMIFS(${helperRange(helperCol.fteYears)},${helperRange(helperCol.dept)},${dep}),"n.a.")`, { style: "line", fmt: i === 0 ? FMT.currency : FMT.body, expect: d.avgFte ? d.avgComp : "n.a.", label: `avg comp ${d.department}` });
    b.formula(rr, 6, `IFERROR(${addr(rr, 4)}/${fyRevenue},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: d.pctRevenue, label: `pct rev ${d.department}` });
    b.formula(rr, 7, `IFERROR(AVERAGEIFS(${helperRange(helperCol.tenure)},${helperRange(helperCol.dept)},${dep}),"n.a.")`, { style: "line", fmt: FMT.oneDp, expect: d.count ? d.avgTenureYears : "n.a.", label: `tenure ${d.department}` });
    b.cell(rr, 8, { v: isFieldDepartment(d.department) ? "Yes" : "No", role: "input", align: { horizontal: "center" } });
  });
  const tr = b.r("total");
  const totalComp = hc.byDepartment.reduce((s, d) => s + d.totalComp, 0);
  b.text(tr, 2, "Total (non-owner)", { style: "keyTotal" });
  b.keyTotalBox([tr, tr], [[3, 8]]);
  b.formula(tr, 3, `SUM(${addr(deptFirst, 3)}:${addr(deptLast, 3)})`, { style: "keyTotal", fmt: FMT.body, expect: hc.latestHeadcount, label: "total headcount" });
  b.formula(tr, 4, `SUM(${addr(deptFirst, 4)}:${addr(deptLast, 4)})`, { style: "keyTotal", fmt: FMT.currency, expect: totalComp, label: "total comp" });
  const avgFte = hc.byDepartment.reduce((s, d) => s + d.avgFte, 0);
  b.formula(tr, 5, `IFERROR(${addr(tr, 4)}/SUM(${helperRange(helperCol.fteYears)}),"n.a.")`, { style: "keyTotal", fmt: FMT.currency, expect: avgFte ? totalComp / avgFte : "n.a.", label: "total avg comp" });
  b.formula(tr, 6, `IFERROR(${addr(tr, 4)}/${fyRevenue},"n.a.")`, { style: "margin", fmt: FMT.pct1, expect: hc.byDepartment.reduce((s, d) => s + d.pctRevenue, 0), label: "total pct rev" });
  b.formula(tr, 7, `IFERROR(AVERAGE(${helperRange(helperCol.tenure)}),"n.a.")`, { style: "keyTotal", fmt: FMT.oneDp, expect: averageTenure(hc), label: "total tenure" });

  // Load ratios on the latest full window.
  const revenue = `(${pnlCell("revenue", window.key)}*${K})`;
  b.section(b.r("secLoad"), `Load ratios (${window.label} revenue; headcount at ${ctx.asOfLabel})`, [[3, 8]]);
  const ratio = (key: string, label: string, f: string, fmt: string, expect: number) => {
    b.text(b.r(key), 2, label, { style: "line" });
    b.formula(b.r(key), 3, f, { style: fmt === FMT.pct1 ? "ratio" : "line", fmt, expect, label });
  };
  ratio("fieldCount", "Field employees (#)", `SUMIFS(${addr(deptFirst, 3)}:${addr(deptLast, 3)},${addr(deptFirst, 8)}:${addr(deptLast, 8)},"Yes")`, FMT.body, hc.latestFieldHeadcount);
  ratio("revPerEmployee", "Revenue per employee ($)", `IFERROR(${revenue}/${addr(tr, 3)},"n.a.")`, FMT.currency, hc.loadRatios.revenuePerEmployee);
  ratio("revPerField", "Revenue per field employee ($)", `IFERROR(${revenue}/${addr(b.r("fieldCount"), 3)},"n.a.")`, FMT.currency, hc.loadRatios.revenuePerFieldEmployee);
  if (hc.loadRatios.customersPerEmployee !== undefined) {
    // The count is of listed accounts only (households are not listed), so the label says so (QA round 1 F12).
    ratio("customersPerEmployee", `Listed ${model.customers!.term.toLowerCase()}s per employee (#)`, `IFERROR(${S("customers")}$C$${rowOf("customers", "latestCount")}/${addr(tr, 3)},"n.a.")`, FMT.oneDp, hc.loadRatios.customersPerEmployee);
  }
  ratio("laborCost", "Labor cost, % of revenue (excludes owner)", `IFERROR(${pnlCell("payroll", window.key)}/${pnlCell("revenue", window.key)},"n.a.")`, FMT.pct1, hc.loadRatios.laborCostPctRevenue);

  // Roll-forward by fiscal year, windows from Assumptions in the helper rows below.
  const rollSpan: [number, number] = [3, 2 + n];
  b.section(b.r("secRoll"), "Employee roll-forward (non-owner, #)", [rollSpan]);
  const hr = b.r("rollHeader");
  b.cell(hr, 2, { style: "header", v: "Roll-forward", role: "text", align: { horizontal: "left" } });
  b.text(helperStart, 2, "Period start", { style: "helper" });
  b.text(helperEnd, 2, "Period end", { style: "helper" });
  years.forEach((y, i) => {
    const c = 3 + i;
    const w = windowFormulas(y, model);
    b.formula(helperStart, c, w.start, { style: "helper", role: "helper", fmt: FMT.date, expect: serialOfMonthStart(y.start), label: `${y.label} start` });
    b.formula(helperEnd, c, w.end, { style: "helper", role: "helper", fmt: FMT.date, expect: serialOfMonthEnd(y.end), label: `${y.label} end` });
    b.formula(hr, c, `"FY"&YEAR(${addr(helperEnd, c, { row: true })})`, { style: "header", role: "text", expect: y.label, label: `${y.label} label` });
  });
  const rollLabels: Record<(typeof rollKeys)[number], string> = {
    start: "Starting Count",
    hires: "(+) Hires",
    resignations: "(-) Resignations",
    terminations: "(-) Terminations",
    unclassified: "(-) Unclassified Departures",
    end: "Ending Count",
  };
  for (const k of rollKeys) {
    const rr = b.r(`roll_${k}`);
    b.text(rr, 2, rollLabels[k], { style: k === "end" ? "keyTotal" : "line" });
    if (k === "end") b.keyTotalBox([rr, rr], [rollSpan]);
    years.forEach((y, i) => {
      const c = 3 + i;
      const start = addr(helperStart, c, { row: true });
      const end = addr(helperEnd, c, { row: true });
      const rf = hc.rollForwardByFiscalYear[y.fiscalYear!]!;
      const at = (key: string) => addr(b.r(`roll_${key}`), c);
      const departed = (type: string) => `COUNTIFS(${OWNER},"No",${TERM},">="&${start},${TERM},"<="&${end}${type ? `,${TERM_TYPE},"${type}"` : ""})`;
      const cells: Record<(typeof rollKeys)[number], [string, number]> = {
        start: [`COUNTIFS(${OWNER},"No",${HIRE},"<"&${start},${TERM},"")+COUNTIFS(${OWNER},"No",${HIRE},"<"&${start},${TERM},">="&${start})`, rf.start],
        hires: [`COUNTIFS(${OWNER},"No",${HIRE},">="&${start},${HIRE},"<="&${end})`, rf.hires],
        resignations: [departed("resignation"), rf.departuresByType.resignation ?? 0],
        terminations: [departed("termination"), rf.departuresByType.termination ?? 0],
        unclassified: [`${departed("")}-${at("resignations")}-${at("terminations")}`, rf.departures - (rf.departuresByType.resignation ?? 0) - (rf.departuresByType.termination ?? 0)],
        end: [`${at("start")}+${at("hires")}-${at("resignations")}-${at("terminations")}-${at("unclassified")}`, rf.end],
      };
      const [f, expect] = cells[k];
      b.formula(rr, c, f, { style: k === "end" ? "keyTotal" : k === "start" ? "lineFirst" : "line", fmt: FMT.body, expect, label: `${k} ${y.label}` });
    });
  }

  // Tenure at departure (V51 buckets verbatim), counted over the helper block's months-at-departure column.
  b.section(b.r("secTenure"), "Tenure at departure (non-owner, #)", [[3, 3]]);
  const months = helperRange(helperCol.monthsAtDeparture);
  TENURE_BUCKETS.forEach((bucket, i) => {
    const rr = b.r(`bucket${i}`);
    const [lo, hi] = BUCKET_MONTHS[i]!;
    b.text(rr, 2, bucket, { style: "line" });
    b.formula(rr, 3, hi === undefined ? `COUNTIFS(${months},">="&${lo})` : `COUNTIFS(${months},">="&${lo},${months},"<"&${hi})`, { style: i === 0 ? "lineFirst" : "line", fmt: FMT.body, expect: hc.tenureAtDeparture[i]!.count, label: `tenure bucket ${bucket}` });
  });
  const bt = b.r("bucketTotal");
  b.text(bt, 2, "Total Departures", { style: "subtotal" });
  b.subtotalBorder(bt, [[3, 3]]);
  b.formula(bt, 3, `SUM(${addr(b.r("bucket0"), 3)}:${addr(b.r(`bucket${TENURE_BUCKETS.length - 1}`), 3)})`, { style: "subtotal", fmt: FMT.body, expect: hc.tenureAtDeparture.reduce((s, t) => s + t.count, 0), label: "total departures" });

  // Tie-out, check C13.
  b.section(b.r("secTie"), `Tie-out, ${latestFy.label}`, [[3, 3]]);
  const rt = b.r("tieRegister");
  // The owner's salary is officer compensation, but the employer taxes on it are in the payroll line, so they join the tie.
  b.text(rt, 2, "Payroll register: staff wages and every employer cost ($)", { style: "line" });
  b.formula(rt, 3, `SUMIFS(${wages},${OWNER},"No")+SUMIFS(${costs},${OWNER},"No")+SUMIFS(${costs},${OWNER},"Yes")`, { style: "lineFirst", fmt: FMT.currency, expect: hc.tieToPnl.registerTotal, label: "register total" });
  const pt = b.r("tiePnl");
  b.text(pt, 2, "P&L salaries, wages and benefits ($)", { style: "line" });
  b.formula(pt, 3, `${pnlCell("payroll", latestFy.key)}*${K}`, { style: "line", fmt: FMT.body, expect: hc.tieToPnl.pnlPayroll, label: "pnl payroll" });
  const vt = b.r("tieVariance");
  b.text(vt, 2, "Check: variance, % of P&L payroll (flag above 5%)", { style: "check" });
  b.formula(vt, 3, `IFERROR((${addr(rt, 3)}-${addr(pt, 3)})/${addr(pt, 3)},0)`, { style: "check", fmt: FMT.pct1, expect: hc.tieToPnl.variancePct, tol: 1e-6, label: "C13" });
  b.cf({ ref: addr(vt, 3), formula: `ABS(${addr(vt, 3)})>0.05`, font: { color: COLOR.pending } });
  b.note(noteRow, 2, "Note: counts are non-owner FTE on payroll at the as-of date (hired on or before it, not terminated on or before it). Compensation is the fiscal year's wages plus employer taxes and benefits allocated pro rata to wages; the average divides it by the year's average FTE, so leavers count for the months they were paid. Names stay on Raw - Payroll; management names reach the CIM only through the intake notes.");

  // Helper block: tenure at the as-of date for those on payroll, months at departure for leavers.
  b.text(empHeader - 1, 2, "Helper: tenure by employee (outside the print area)", { style: "helper" });
  ["ID", "Department", "Tenure at as-of (yrs)", "Months at departure", `FTE-years in ${latestFy.label}`].forEach((h, i) => b.text(empHeader, 2 + i, h, { style: "helper" }));
  const fyStartIso = `${latestFy.start}-01`;
  const fyEndSerial = serialOfMonthEnd(latestFy.end);
  ctx.employees.forEach((e, i) => {
    const rr = empFirst + i;
    const id = addr(rr, helperCol.id);
    const field = (range: string) => `INDEX(${range},MATCH(${id},${ID},0))`;
    const onPayrollAtAsOf = !e.isOwner && excelSerial(e.hireDate) <= excelSerial(model.asOfDate) && (!e.terminationDate || excelSerial(e.terminationDate) > excelSerial(model.asOfDate));
    b.text(rr, helperCol.id, e.id, { style: "helper" });
    b.formula(rr, helperCol.dept, field(DEPT), { style: "helper", role: "helper", expect: e.department, label: `dept ${e.id}` });
    b.formula(rr, helperCol.tenure, `IF(OR(${field(OWNER)}="Yes",AND(${field(TERM)}<>"",${field(TERM)}<=${ASOF}),${field(HIRE)}>${ASOF}),"",(${ASOF}-${field(HIRE)})/365.25)`, {
      style: "helper",
      role: "helper",
      fmt: FMT.oneDp,
      expect: onPayrollAtAsOf ? (excelSerial(model.asOfDate) - excelSerial(e.hireDate)) / 365.25 : "",
      label: `tenure ${e.id}`,
    });
    b.formula(rr, helperCol.monthsAtDeparture, `IF(OR(${field(OWNER)}="Yes",${field(TERM)}=""),"",(${field(TERM)}-${field(HIRE)})/(365.25/12))`, {
      style: "helper",
      role: "helper",
      fmt: FMT.oneDp,
      expect: e.terminationDate && !e.isOwner ? (excelSerial(e.terminationDate) - excelSerial(e.hireDate)) / (365.25 / 12) : "",
      label: `months ${e.id}`,
    });
    // Days on payroll inside the fiscal year (the last day is the day before termination, as the counts treat it) over days in the year.
    const lastDay = `IF(${field(TERM)}="",${fyEnd},${field(TERM)}-1)`;
    const days = (from: number, to: number) => Math.max(0, to - from + 1);
    const engineYears = e.isOwner ? 0 : (e.fte * days(Math.max(excelSerial(fyStartIso), excelSerial(e.hireDate)), Math.min(fyEndSerial, e.terminationDate ? excelSerial(e.terminationDate) - 1 : fyEndSerial))) / (fyEndSerial - excelSerial(fyStartIso) + 1);
    b.formula(rr, helperCol.fteYears, `IF(${field(OWNER)}="Yes",0,${field(FTE)}*MAX(0,MIN(${fyEnd},${lastDay})-MAX(${fyStart},${field(HIRE)})+1)/(${fyEnd}-${fyStart}+1))`, {
      style: "helper",
      role: "helper",
      fmt: FMT.oneDp,
      expect: engineYears,
      tol: 1e-6,
      label: `fte-years ${e.id}`,
    });
  });
  b.print({ area: `B2:${addr(noteRow, lastCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.defineName("Headcount_Latest", `$C$${tr}`);
  return b;
}

/** Average tenure of everyone on payroll at the as-of date, from the department averages weighted by head count. */
function averageTenure(hc: NonNullable<TabContext["model"]["headcount"]>): number | string {
  const onboard = hc.byDepartment.reduce((s, d) => s + (d.count ? d.avgTenureYears * d.count : 0), 0);
  const count = hc.byDepartment.reduce((s, d) => s + d.count, 0);
  return count ? onboard / count : "n.a.";
}
