// Cover, Contents and Summary (guide 5.13 and 5.1 rows 1-3): the cover is
// AMB's, the contents index is hyperlinked with the master Print switch and
// the master check, the summary is one page of linked tables.

import { SOURCE_LABELS, parsePeriodKey, periodLabel } from "../../domain/financials.ts";
import { ltmEqualsFiscalYear } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput, PeriodColumn } from "../types.ts";
import { A, KPI_FMT, kpiLabel, type TabContext } from "./assumptionsTab.ts";
import { nwcLayout } from "./balance.ts";
import { masterFormula } from "./checksTab.ts";
import { headerLabel, periodLayout, S, SHEET, type SheetKey } from "./layout.ts";

export const CONTENTS_PRINT_COL = 9;
export const masterToggleRef = (): string => `${S("contents")}$${colLetter(CONTENTS_PRINT_COL)}$${rowOf("contents", "printMode")}`;

/** Purpose and units for the index, per tab (guide 5.1). */
const TAB_INFO: Record<SheetKey, { purpose: string; units: string }> = {
  cover: { purpose: "Cover", units: "" },
  contents: { purpose: "Index, model information, Print switch, master check, log", units: "" },
  summary: { purpose: "Key lines, condensed ladder, KPIs and valuation range", units: "$000s" },
  assumptions: { purpose: "Every input, blue, with its source", units: "$" },
  pnl: { purpose: "Historical P&L by period with KPI block", units: "$000s" },
  ladder: { purpose: "Reported EBITDA to SDE, Adj. and PF Adj. EBITDA, with refs", units: "$000s" },
  adjustments: { purpose: "The schedule: tier, category, basis, evidence, status", units: "$000s" },
  revenue: { purpose: "Revenue by line: $, % growth, % of total; LTM strip", units: "$000s" },
  revenueCharts: { purpose: "Monthly revenue and revenue by line (MC-R1, MC-R2)", units: "#, $000s" },
  expense: { purpose: "Cost and expense buckets: $, % of revenue, growth; strip", units: "$000s" },
  expenseCharts: { purpose: "Monthly payroll and largest expense, with % of revenue", units: "#, $000s" },
  customers: { purpose: "Mix by type: count, revenue, average revenue", units: "#, $" },
  retention: { purpose: "Count and dollar roll-forwards, churn, GDR, NDR; monthly strip", units: "#, $" },
  retentionCharts: { purpose: "Monthly wins and losses, by churn type and by segment", units: "#, $000s" },
  concentration: { purpose: "Top 20 customers, coded, cumulative share, tenure", units: "$" },
  cohorts: { purpose: "Count and revenue cohort triangles", units: "#, $" },
  headcount: { purpose: "By department; roll-forward; tenure at departure", units: "#, $" },
  headcountCharts: { purpose: "Monthly hires and departures; tenure at departure", units: "#, $000s" },
  bs: { purpose: "Condensed balance sheet at every statement date", units: "$000s" },
  nwc: { purpose: "Net working capital by date, peg basis, ratios, transfers", units: "$000s" },
  debtLike: { purpose: "Debt and debt-like items: treatment and status", units: "$000s" },
  cashFlow: { purpose: "Historical indirect cash flow, capex, free cash flow", units: "$000s" },
  proofOfCash: { purpose: "Monthly revenue vs bank deposits", units: "$000s" },
  projections: { purpose: "Five-year driver-based income statement, BS and cash flow", units: "$000s" },
  opportunities: { purpose: "One sizing grid per growth lever", units: "$000s" },
  valuation: { purpose: "Valuation range, multiples, financing, DSCR (internal)", units: "$000s" },
  deal: { purpose: "Terms, sources and uses, seller proceeds, debt service", units: "$000s" },
  sensitivities: { purpose: "Two-way grids centred on the base case", units: "$000s" },
  checks: { purpose: "Every check with difference, tolerance and status", units: "" },
  divider: { purpose: "Data tabs follow", units: "" },
  monthly: { purpose: "Category × month grid every period column reads", units: "$000s" },
  databook: { purpose: "Account × period with mapping and the tie to raw exports", units: "$" },
  mapping: { purpose: "Account to AMB category and summary line", units: "" },
  rawPnl: { purpose: "P&L as exported", units: "$" },
  rawBs: { purpose: "Balance sheet as exported", units: "$" },
  rawBank: { purpose: "Bank deposits by month", units: "$" },
  rawCustomers: { purpose: "Customer list with names (never leaves this tab)", units: "$" },
  rawPayroll: { purpose: "Payroll register with names (never leaves this tab)", units: "$" },
};

// --- Cover ------------------------------------------------------------------------------------

export function planCover(ctx: TabContext, logoFile: string | undefined, preparedLine: string): SheetBuilder {
  const b = new SheetBuilder("cover", SHEET.cover, { output: false });
  b.width(1, WIDTH.gutter);
  for (let c = 2; c <= 17; c++) b.width(c, 6.3);
  const bar = (r: number) => {
    for (let c = 2; c <= 17; c++) b.cell(r, c, { fill: COLOR.coverBar });
  };
  bar(2);
  b.height(2, 13.5);
  // The open band above the title (the seller's logo area) is kept short enough that B2:Q39 fits a Letter page at 100%.
  for (let r = 5; r <= 22; r++) b.height(r, 11.25);
  for (let c = 2; c <= 17; c++) b.cell(4, c, { border: { top: "medium" } });
  b.height(4, 6);
  for (let c = 5; c <= 14; c++) {
    b.cell(23, c, { border: { top: "thin" } });
    b.cell(28, c, { border: { top: "thin" } });
  }
  b.cell(24, 2, { v: ctx.businessName, role: "text", font: { bold: true, size: 26 }, align: { horizontal: "centerContinuous" } });
  for (let c = 3; c <= 17; c++) b.cell(24, c, { align: { horizontal: "centerContinuous" } });
  b.height(24, 33);
  b.cell(25, 2, { v: "Financial Model", role: "text", font: { bold: true, italic: true, size: 20 }, align: { horizontal: "centerContinuous" } });
  for (let c = 3; c <= 17; c++) b.cell(25, c, { align: { horizontal: "centerContinuous" } });
  b.height(25, 26);
  b.formula(26, 2, `"As of "&TEXT(${A("asOfDate")},"mm/dd/yy")`, { role: "text", font: { italic: true, size: 18 }, align: { horizontal: "centerContinuous" }, expect: `As of ${ctx.asOfLabel}`, label: "cover as-of" });
  for (let c = 3; c <= 17; c++) b.cell(26, c, { align: { horizontal: "centerContinuous" } });
  b.height(26, 24);
  b.cell(30, 2, { v: preparedLine, role: "text", font: { italic: true }, align: { horizontal: "centerContinuous" } });
  for (let c = 3; c <= 17; c++) b.cell(30, c, { align: { horizontal: "centerContinuous" } });
  b.formula(32, 2, `"Model status: "&${S("contents")}$${colLetter(CONTENTS_PRINT_COL)}$${rowOf("contents", "masterCheck")}`, { role: "text", font: { italic: true }, align: { horizontal: "centerContinuous" }, expect: `Model status: ${ctx.model.masterCheck}`, label: "cover status" });
  for (let c = 3; c <= 17; c++) b.cell(32, c, { align: { horizontal: "centerContinuous" } });
  for (let c = 2; c <= 17; c++) b.cell(38, c, { border: { top: "medium" } });
  bar(39);
  // About 2.1 in wide, bottom right inside the frame (guide 5.13: N33:Q37), its right edge on column Q's.
  if (logoFile) b.image(logoFile, { col: 17 - LOGO_WIDTH_PX / COVER_COL_PX, row: 32.3 }, { width: LOGO_WIDTH_PX, height: LOGO_WIDTH_PX * LOGO_ASPECT });
  b.print({ area: "B2:Q39", landscape: true, fitToWidth: 1, fitToHeight: 1 });
  b.plan.gridlines = false;
  return b;
}

/** Height ÷ width of brand/amb-logo-maroon-2048.png. */
export const LOGO_ASPECT = 0.3408;
const LOGO_WIDTH_PX = 202;
/** Pixel width of a cover column at width 6.3 (Excel: width × 7 + 5 at the default font). */
const COVER_COL_PX = 49;

// --- Contents -----------------------------------------------------------------------------------

export function planContents(ctx: TabContext, built: SheetKey[], opts: { preparedBy: string; preparedOn: string; version: string; sources: { label: string; value: string }[] }): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("contents", SHEET.contents, { output: false });
  const infoLabel = 8;
  const infoValue = CONTENTS_PRINT_COL;
  b.width(1, WIDTH.gutter);
  // The # column is wide enough for the version log's "Version" header below the index.
  [8, 20, 50, 8, 8].forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(7);
  b.width(infoLabel, 26);
  b.width(infoValue, 54);
  b.height(2, 16.5);
  b.formula(2, 2, "Cover!B24", { style: "title", role: "text" });
  b.text(3, 2, "Contents", { style: "subtitle" });
  for (let c = 2; c <= infoValue; c++) if (c !== 7) b.cell(3, c, { border: { bottom: "thin" } });
  ["#", "Tab", "Purpose", "Units", "Check"].forEach((h, i) => b.cell(5, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 2 || i === 1 ? "left" : "center" } }));
  let r = 6;
  built.forEach((key, i) => {
    const name = SHEET[key];
    b.num(r, 2, i + 1, { role: "text", fmt: FMT.term, align: { horizontal: "center" } });
    b.formula(r, 3, `HYPERLINK("#'${name.replace(/'/g, "''")}'!A1","${name}")`, { role: "text", font: { underline: true }, expect: name, label: `link ${name}` });
    b.text(r, 4, TAB_INFO[key].purpose);
    b.text(r, 5, TAB_INFO[key].units, { align: { horizontal: "center" } });
    const hasChecks = model.checks.some((c) => c.tab === name);
    if (hasChecks) {
      const failing = model.checks.filter((c) => c.tab === name && c.status === "CHECK").length;
      b.formula(r, 6, `IF(COUNTIFS(${S("checks")}$D:$D,"${name}",${S("checks")}$G:$G,"CHECK")=0,"OK","CHECK")`, { role: "text", align: { horizontal: "center" }, expect: failing ? "CHECK" : "OK", label: `check ${name}` });
    } else b.text(r, 6, "–", { align: { horizontal: "center" } });
    r++;
  });
  const indexLast = r - 1;
  b.cf({ ref: `F6:F${indexLast}`, formula: `F6="CHECK"`, font: { color: COLOR.pending, bold: true } });

  // Model information block to the right of the index.
  b.cell(5, infoLabel, { style: "header", v: "Model information", role: "text", align: { horizontal: "left" } });
  b.cell(5, infoValue, { style: "header", v: null, role: "text" });
  let ir = 6;
  const info = (key: string | undefined, label: string, spec: { v?: string | number; f?: string; expect?: string | number; fmt?: string; role?: "input" | "link" | "text" | "calc" }) => {
    if (key) b.row(key, ir);
    b.text(ir, infoLabel, label, { font: { bold: true } });
    if (spec.f) b.formula(ir, infoValue, spec.f, { role: spec.role ?? "link", fmt: spec.fmt, expect: spec.expect, label, align: { horizontal: "left" } });
    else b.cell(ir, infoValue, { v: spec.v ?? null, role: spec.role ?? "text", fmt: spec.fmt, align: { horizontal: "left" } });
    ir++;
  };
  const ltm = model.columns.find((c) => c.ref.kind === "ltm" && !c.priorYear);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  info(undefined, "Business name", { v: ctx.businessName });
  info(undefined, "Code name", { v: ctx.codeName });
  info(undefined, "Prepared by", { v: opts.preparedBy });
  info("asOfDate", "As-of date", { f: A("asOfDate"), fmt: FMT.date, expect: excelSerialOfDate(model.asOfDate) });
  info(undefined, "LTM period", { v: ltm ? `${ltm.label}${ltmEqualsFiscalYear(model.assumptions!.asOfMonth, model.fiscalYearEndMonth) ? ` (equals FY${ltm.end.slice(0, 4)})` : ""}` : "Full fiscal years only" });
  info(undefined, "Fiscal year-end", { v: months[model.fiscalYearEndMonth - 1]! });
  info(undefined, "Mode", { v: `${model.mode.mode === "mainStreet" ? "Main Street" : "Lower middle market"}: PF Adj. EBITDA before the reserve $${Math.round(model.mode.measure / 1000).toLocaleString("en-US")}K vs. $1.0M` });
  info(undefined, "Deal form", { v: model.dealForm === "asset_purchase" ? "Asset purchase" : "Equity purchase" });
  for (const src of opts.sources) info(undefined, src.label, { v: src.value });
  info(undefined, "Version", { v: opts.version });
  info("printMode", "Print mode (1 = black fonts)", { v: 0, role: "input", fmt: FMT.toggle });
  b.cell(b.r("printMode"), infoValue, { style: "printToggle", border: { top: "thin", bottom: "thin", left: "thin", right: "thin" }, align: { horizontal: "center" } });
  info("masterCheck", "Master check", { f: masterFormula(`${S("checks")}$G:$G`), role: "calc", expect: model.masterCheck });
  b.cell(b.r("masterCheck"), infoValue, { font: { bold: true } });
  b.cf({ ref: addr(b.r("masterCheck"), infoValue), formula: `${addr(b.r("masterCheck"), infoValue)}<>"All checks OK"`, font: { color: COLOR.pending, bold: true } });
  b.defineName("PrintMode", `$${colLetter(infoValue)}$${b.r("printMode")}`);
  b.defineName("MasterCheck", `$${colLetter(infoValue)}$${b.r("masterCheck")}`);

  // Version log (guide 5.13): Version | Date | Prepared by | Change, the change text running across the rest of the row.
  r = Math.max(indexLast, ir) + 2;
  const logHeader: [number, string | null][] = [[2, "Version"], [3, "Date"], [4, "Prepared by"], [5, "Change"], [6, null], [7, null], [infoLabel, null], [infoValue, null]];
  for (const [c, v] of logHeader) b.cell(r, c, { style: "header", v, role: "text", align: { horizontal: "left" } });
  r++;
  b.text(r, 2, opts.version, { align: { horizontal: "left" } });
  b.cell(r, 3, { v: excelSerialOfDate(opts.preparedOn), role: "text", fmt: FMT.date, align: { horizontal: "left" } });
  b.text(r, 4, opts.preparedBy, { align: { horizontal: "left" } });
  b.text(r, 5, "First draft generated by the AMB material bot from the sources listed above", { align: { horizontal: "left" } });
  b.print({ area: `B2:${addr(r, infoValue)}`, landscape: true, fitToWidth: 1, fitToHeight: 0 });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

function excelSerialOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// --- Summary ---------------------------------------------------------------------------------------

const K = 1000;
const NOTES_WIDTH = 48;

/** Number format for a stated operating metric by its unit. */
export function planSummary(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("summary", SHEET.summary);
  const pnlL = periodLayout(model, 3);
  // The key columns of the standard block (FY | LTM CY, PF), spacers between groups as on every period tab.
  const picked = pnlL.cols.filter(({ column: c }) => c.ref.kind === "fiscal_year" || (c.ref.kind === "ltm" && !c.priorYear) || c.ref.kind === "pf");
  const cols: { column: PeriodColumn; col: number }[] = [];
  const groups: { from: number; to: number; label: string }[] = [];
  const spacers: number[] = [];
  let col = 3;
  // Full Year, then LTM and PF side by side (their own tier-1 groups, no spacer between, as in guide 5.2).
  for (const block of [["Full Year"], ["LTM", "PF"]] as const) {
    const members = picked.filter(({ column: c }) => (block as readonly string[]).includes(c.group));
    if (!members.length) continue;
    for (const group of block) {
      const inGroup = members.filter(({ column: c }) => c.group === group);
      if (!inGroup.length) continue;
      const from = col;
      for (const m of inGroup) cols.push({ column: m.column, col: col++ });
      groups.push({ from, to: col - 1, label: group === "Full Year" ? pnlL.groups[0]!.label : group });
    }
    spacers.push(col++);
  }
  const lastValue = col - 2;
  const notesCol = col;
  const latest = cols.find(({ column: c }) => c.ref.kind === "ltm") ?? cols.filter(({ column: c }) => c.ref.kind === "fiscal_year").at(-1)!;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  for (const { col: c } of cols) b.width(c, WIDTH.value);
  for (const s of spacers) b.spacerCol(s);
  b.width(notesCol, NOTES_WIDTH);
  b.anatomy({ subtitle: "Summary ($000s)", lastCol: notesCol, toggleCol: lastValue, masterToggle: ctx.masterToggle });
  b.text(3, lastValue - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [...groups, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: lastValue }, cols.map(({ column: c, col: cc }) => ({ col: cc, f: `${S("pnl")}${colLetter(pnlL.byKey[c.key]!)}6`, expect: headerLabel(c), role: "text" as const })), "Key figures");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const spans: [number, number][] = groups.map((g) => [g.from, g.to]);

  let r = 8;
  const link = (sheet: "pnl" | "ladder", key: string, c: PeriodColumn) => `${S(sheet)}${colLetter(pnlL.byKey[c.key]!)}${rowOf(sheet, key)}`;
  type Kind = "lineFirst" | "line" | "keyTotal" | "margin" | "ratio";
  /** One linked row across the key columns; a key total boxes its % Margin row with it. */
  /** `label` is typed, or a ladder rung's label linked from the ladder tab so its refs follow the schedule (guide 5.3). */
  const line = (label: string | { ladderKey: string; expect: string }, sheet: "pnl" | "ladder", key: string, value: (p: ModelOutput["periods"][string]) => number | string, kind: Kind, withMargin = false) => {
    const align = kind === "margin" || kind === "ratio" ? { horizontal: "left" as const, indent: 1 } : undefined;
    if (typeof label === "string") b.text(r, 2, label, { style: kind, align });
    else b.formula(r, 2, `${S("ladder")}$B$${rowOf("ladder", label.ladderKey)}`, { style: kind, role: "text", align, expect: label.expect, label: `label ${label.ladderKey}` });
    if (kind === "keyTotal") b.keyTotalBox([r, withMargin ? r + 1 : r], spans);
    const ratio = kind === "margin" || kind === "ratio";
    for (const { column: c, col: cc } of cols) {
      const v = value(model.periods[c.key]!);
      b.formula(r, cc, link(sheet, key, c), { style: kind, fmt: kind === "margin" ? FMT.pct1 : kind === "ratio" ? FMT.pct : kind === "line" ? FMT.body : FMT.currency, expect: typeof v === "number" && !ratio ? v / K : v, label: `${key} ${c.label}` });
    }
    r++;
  };
  const margin = (p: ModelOutput["periods"][string], v: number) => (p.pnl.revenue ? v / p.pnl.revenue : "n.m.");

  b.section(r++, "Income statement", spans);
  line("Total Revenue", "pnl", "revenue", (p) => p.pnl.revenue, "lineFirst");
  line("% Growth", "pnl", "revenue_growth", (p) => growthOf(model, p), "ratio");
  line("Gross Profit", "pnl", "gross_profit", (p) => p.pnl.grossProfit, "keyTotal", true);
  line("% Margin", "pnl", "gross_margin", (p) => margin(p, p.pnl.grossProfit), "margin");
  line("Reported EBITDA", "pnl", "reported_ebitda", (p) => p.pnl.ebitda, "keyTotal", true);
  line("% Margin", "pnl", "ebitda_margin", (p) => margin(p, p.pnl.ebitda), "margin");
  line("Net Income", "pnl", "net_income", (p) => p.pnl.netIncome, "line");
  b.spacerRow(r++);
  b.section(r++, "Adjusted EBITDA ladder (condensed)", spans);
  line("Reported EBITDA", "ladder", "reported_ebitda", (p) => p.ladder.reportedEbitda, "lineFirst");
  line("(+) / (-) Normalization Adjustments", "ladder", "total_normalization", (p) => p.ladder.totalNormalization, "line");
  const rung = (ladderKey: string, fixed: string, category: string) => {
    const refs = model.adjustments.filter((x) => x.row.tier === "owner_compensation" && x.row.category === category && x.row.status === "accepted").map((x) => `[${x.row.ref}]`);
    return { ladderKey, expect: refs.length ? `${fixed} ${refs.join(" ")}` : fixed };
  };
  line(rung("s1", "(+) Owner Compensation", "owner_compensation"), "ladder", "s1", (p) => p.ladder.ownerCompAsPaid, "line");
  line("Seller's Discretionary Earnings (SDE)", "ladder", "sde", (p) => p.ladder.sde, "keyTotal", true);
  line("% Margin", "ladder", "sde_margin", (p) => margin(p, p.ladder.sde), "margin");
  line(rung("s2", "(-) Market Replacement Compensation", "replacement_cost"), "ladder", "s2", (p) => p.ladder.marketReplacement, "line");
  line(rung("s3", "(-) Capital Reserve (Maintenance Capex)", "capital_reserve"), "ladder", "s3", (p) => p.ladder.capitalReserve, "line");
  line("Adj. EBITDA", "ladder", "adj_ebitda", (p) => p.ladder.adjEbitda, "keyTotal", true);
  line("% Margin", "ladder", "adj_margin", (p) => margin(p, p.ladder.adjEbitda), "margin");
  line("(+) / (-) Pro Forma Adjustments", "ladder", "total_pro_forma", (p) => p.ladder.totalProForma, "line");
  line("PF Adj. EBITDA", "ladder", "pf_adj_ebitda", (p) => p.ladder.pfAdjEbitda, "keyTotal", true);
  line("% Margin", "ladder", "pf_margin", (p) => margin(p, p.ladder.pfAdjEbitda), "margin");
  b.spacerRow(r++);

  // Engine KPIs per period, linked to the P&L Summary's KPI block.
  type KpiLink = { key: string; label: string; value: (p: ModelOutput["periods"][string]) => number | undefined; fmt: string; kind: Kind };
  const kpiLinks: KpiLink[] = [
    { key: "kpi_customers", label: `${model.customers?.term ?? "Customer"}s, active at period end (#)`, value: (p) => p.kpis.customers, fmt: FMT.body, kind: "line" },
    { key: "kpi_employees", label: "Employees, non-owner FTE at period end (#)", value: (p) => p.kpis.employees, fmt: FMT.oneDp, kind: "line" },
    { key: "kpi_revenue_per_employee", label: "Revenue per employee ($)", value: (p) => p.kpis.revenue_per_employee, fmt: FMT.currency, kind: "line" },
    { key: "kpi_labor_cost", label: "Labor cost, % of revenue (excludes owner)", value: (p) => p.kpis.labor_cost_pct_revenue, fmt: FMT.pct1, kind: "ratio" },
    { key: "kpi_recurring", label: "Recurring revenue, % of total", value: (p) => p.kpis.recurring_revenue_pct, fmt: FMT.pct1, kind: "ratio" },
  ];
  const kpis = kpiLinks.filter((k) => cols.some(({ column: c }) => k.value(model.periods[c.key]!) !== undefined));
  if (kpis.length) {
    b.section(r++, "Key performance indicators", spans);
    for (const k of kpis) {
      b.text(r, 2, k.label, { style: "line" });
      for (const { column: c, col: cc } of cols) {
        const v = k.value(model.periods[c.key]!);
        const partYearRatio = k.key === "kpi_revenue_per_employee" && c.months !== 12;
        if (partYearRatio) b.na(r, cc, "n.a.", { style: "line" });
        else b.formula(r, cc, `${S("pnl")}${colLetter(pnlL.byKey[c.key]!)}${rowOf("pnl", k.key)}`, { style: k.kind, fmt: k.fmt, expect: v ?? "n.a.", label: `${k.key} ${c.label}` });
      }
      r++;
    }
    b.spacerRow(r++);
  }

  // Balance sheet and deal facts at the as-of date, in the latest window's column.
  const n = model.namedOutputs;
  const facts: { label: string; f: string; expect: number | string; fmt: string; note?: string }[] = [];
  if (model.customers) facts.push({ label: `Top 10 ${model.customers.term.toLowerCase()}s, % of revenue`, f: `${S("concentration")}$D$${rowOf("concentration", "top10")}`, expect: n.Top10Share_LTM!, fmt: FMT.pct1 });
  if (model.nwc) facts.push({ label: "Adjusted NWC, latest", f: `${S("nwc")}${colLetter(nwcLayout(model).latestCol)}${rowOf("nwc", "adjustedNwc")}`, expect: (n.NWC_Latest ?? 0) / K, fmt: FMT.currency, note: model.nwc.pegBasis === "n.a." ? "No peg: year-end balance sheets only" : `Peg basis: ${model.nwc.pegBasis}` });
  if (model.debtLike) facts.push({ label: "Funded debt, latest", f: `${S("debtLike")}$C$${rowOf("debtLike", "fundedDebt")}`, expect: model.debtLike.fundedDebt / K, fmt: FMT.currency, note: model.dealForm === "asset_purchase" ? "Retained by the Seller; paid from proceeds at close" : "Repaid at or before closing" });
  facts.push({ label: "Mode", f: `IF(${A("mainStreetMode")}=1,"Main Street","Lower middle market")`, expect: model.mode.mode === "mainStreet" ? "Main Street" : "Lower middle market", fmt: FMT.body, note: `PF Adj. EBITDA before the reserve $${Math.round(model.mode.measure / K).toLocaleString("en-US")}K vs. the $1.0M threshold` });
  facts.push({ label: "Deal form", f: A("dealForm"), expect: model.dealForm === "asset_purchase" ? "Asset purchase" : "Equity purchase", fmt: FMT.body });
  b.section(r++, `At the as-of date (${ctx.asOfLabel})`, spans);
  for (const fct of facts) {
    b.text(r, 2, fct.label, { style: "line" });
    b.formula(r, latest.col, fct.f, { style: "line", fmt: fct.fmt, expect: fct.expect, label: fct.label, align: { horizontal: "right" } });
    if (fct.note) b.note(r, notesCol, fct.note);
    r++;
  }

  // Operating facts the seller states, each with its own date; never a period column (guide 4.6).
  if (ctx.kpis.length) {
    b.spacerRow(r++);
    b.section(r++, "Operating facts per management (1)", spans);
    for (const k of ctx.kpis) {
      const [key, value] = Object.entries(k.values).at(-1)!;
      const ref = parsePeriodKey(key);
      // The fact is an input on Assumptions, with its source; the output tab links it (guide 5.1: Assumptions holds every input).
      b.text(r, 2, kpiLabel(k), { style: "line" });
      b.formula(r, latest.col, A(`kpi_${k.key}`), { fmt: KPI_FMT[k.unit], expect: value, label: `fact ${k.key}`, align: { horizontal: "right" } });
      b.note(r, notesCol, `${ref.kind === "point" ? `As of ${periodLabel(ref)}` : periodLabel(ref)}${k.definition ? `. ${k.definition}` : ""}`);
      r++;
    }
  }

  // Valuation range (internal).
  b.spacerRow(r++);
  const vd = model.valuationDetail!;
  const cases = ["low", "mid", "high"] as const;
  // The first three value columns, wherever the period groups put their spacers (one fiscal year leaves D a spacer).
  const caseCols = cols.length >= 3 ? cols.slice(0, 3).map((c) => c.col) : [3, 4, 5];
  b.section(r++, "Indicative valuation range (internal; never in the CIM)", spans);
  b.cell(r, 2, { style: "header", v: model.mode.mode === "mainStreet" ? "SDE × multiple" : "Adj. EBITDA × multiple", role: "text", align: { horizontal: "left" } });
  cases.forEach((c, i) => b.cell(r, caseCols[i]!, { style: "header", v: c === "low" ? "Low" : c === "mid" ? "Mid" : "High", role: "text" }));
  r++;
  const vrow = (label: string, key: string, value: (c: (typeof cases)[number]) => number, fmt: string, style: Kind) => {
    b.text(r, 2, label, { style });
    cases.forEach((c, i) => b.formula(r, caseCols[i]!, `${S("valuation")}${colLetter(3 + i)}${rowOf("valuation", key)}`, { style, fmt, expect: value(c), label: `${key} ${c}` }));
    r++;
  };
  vrow("Total Investment", "totalInvestment", (c) => vd.cases[c].totalInvestment / K, FMT.currency, "lineFirst");
  vrow("Implied SDE Multiple (x)", "impliedSde", (c) => vd.cases[c].impliedSdeMultiple, FMT.multiple, "line");
  vrow("Implied Adj. EBITDA Multiple (x)", "impliedAdj", (c) => vd.cases[c].impliedAdjEbitdaMultiple, FMT.multiple, "line");
  vrow("DSCR, SBA loan only (x)", "dscr", (c) => vd.cases[c].financing.dscr, FMT.multiple2, "line");
  const refDscr = model.deal?.[0]?.debtService.dscr;
  if (refDscr !== undefined) {
    // The structure AMB would propose carries a seller note, which the SBA-only row leaves out; both are shown so neither reads as the answer alone.
    b.text(r, 2, "DSCR, Reference structure (x)", { style: "line" });
    b.na(r, caseCols[0]!, "n.a.", { style: "line" });
    b.formula(r, caseCols[1]!, `${S("valuation")}$D$${rowOf("valuation", "dscrReference")}`, { style: "line", fmt: FMT.multiple2, expect: refDscr, label: "reference dscr" });
    b.na(r, caseCols[2]!, "n.a.", { style: "line" });
    b.note(r, notesCol, "Deal Structure at the Mid price, seller note included");
    r++;
  }
  r++;
  const ltmNote = model.granularity === "annual"
    ? `Full fiscal years only; source: ${model.databook?.pnl[0] ? SOURCE_LABELS[model.databook.pnl[0].source] : "annual P&L"}.`
    : ltmEqualsFiscalYear(model.assumptions!.asOfMonth, model.fiscalYearEndMonth)
      ? `LTM ${latest.column.label.replace("LTM ", "")} equals ${cols.filter(({ column: c }) => c.ref.kind === "fiscal_year").at(-1)!.column.label}.`
      : "";
  b.note(r, 2, `Note: ${ltmNote ? `${ltmNote} ` : ""}Reported EBITDA is net income plus interest, taxes and D&A, so it carries other income; a normalization row removes what is non-operating.${ctx.kpis.length ? " (1) Per management; not independently verified." : ""}`);
  b.print({ area: `B2:${addr(r, notesCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

/** Year-over-year revenue growth of a period against its prior-year twin, "n.a." without one. */
function growthOf(model: ModelOutput, p: ModelOutput["periods"][string]): number | string {
  const c = p.column;
  const prior =
    c.ref.kind === "fiscal_year"
      ? model.columns.find((x) => x.ref.kind === "fiscal_year" && !x.projected && x.fiscalYear === c.fiscalYear! - 1)
      : c.ref.kind === "ltm" || c.ref.kind === "ytd"
        ? model.columns.find((x) => x.ref.kind === c.ref.kind && x.priorYear)
        : undefined;
  const prev = prior && !c.priorYear ? model.periods[prior.key]!.pnl.revenue : 0;
  return prev ? p.pnl.revenue / prev - 1 : "n.a.";
}
