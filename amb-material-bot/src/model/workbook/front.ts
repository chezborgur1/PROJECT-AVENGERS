// Cover, Contents and Summary (guide 5.13 and 5.1 rows 1-3): the cover is
// AMB's, the contents index is hyperlinked with the master Print switch and
// the master check, the summary is one page of linked tables.

import path from "node:path";
import { SOURCE_LABELS, type FinancialDataset } from "../../domain/financials.ts";
import { ltmEqualsFiscalYear } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import { A, type TabContext } from "./assumptionsTab.ts";
import { periodLayout, S, SHEET, type SheetKey } from "./layout.ts";

export const CONTENTS_PRINT_COL = 9;
export const masterToggleRef = (): string => `${S("contents")}$${colLetter(CONTENTS_PRINT_COL)}$${rowOf("contents", "printMode")}`;

/** Purpose and units for the index, per tab (guide 5.1). */
const TAB_INFO: Record<SheetKey, { purpose: string; units: string }> = {
  cover: { purpose: "Cover", units: "" },
  contents: { purpose: "Index, model information, print switch, master check, version log", units: "" },
  summary: { purpose: "One page of tables: key lines, condensed ladder, KPIs, valuation range", units: "$000s" },
  assumptions: { purpose: "Every input, blue, with its source", units: "$" },
  pnl: { purpose: "Historical P&L by period with KPI block", units: "$000s" },
  ladder: { purpose: "Reported EBITDA to SDE, Adj. EBITDA and PF Adj. EBITDA, with refs", units: "$000s" },
  adjustments: { purpose: "The adjustments schedule: tier, category, basis, evidence, status, amounts", units: "$000s" },
  revenue: { purpose: "Revenue by line: $, % growth, % of total; LTM strip", units: "$000s" },
  expense: { purpose: "Cost of revenue and expense buckets: $, % of revenue, growth; LTM strip", units: "$000s" },
  customers: { purpose: "Mix by type: count, revenue, average revenue", units: "#, $" },
  retention: { purpose: "Count and dollar roll-forwards, churn, GDR, NDR; monthly strip", units: "#, $" },
  concentration: { purpose: "Top 20 customers, coded, cumulative share, tenure", units: "$" },
  cohorts: { purpose: "Count and revenue cohort triangles", units: "#, $" },
  headcount: { purpose: "By department: count, comp, % revenue, tenure; roll-forward; tenure at departure", units: "#, $" },
  bs: { purpose: "Condensed balance sheet at every statement date", units: "$000s" },
  nwc: { purpose: "Net working capital by date, peg basis, ratios, transfers", units: "$000s" },
  debtLike: { purpose: "Debt and debt-like items at the latest date with treatment and status", units: "$000s" },
  cashFlow: { purpose: "Historical indirect cash flow, capex, free cash flow", units: "$000s" },
  proofOfCash: { purpose: "Monthly revenue vs bank deposits", units: "$000s" },
  projections: { purpose: "Five-year driver-based income statement, balance sheet and cash flow", units: "$000s" },
  opportunities: { purpose: "One sizing grid per growth lever", units: "$000s" },
  valuation: { purpose: "Valuation range, implied multiples, financing and DSCR (internal)", units: "$000s" },
  deal: { purpose: "Structure 1: terms, sources and uses, seller proceeds, debt service", units: "$000s" },
  sensitivities: { purpose: "Two-way grids centred on the base case", units: "$000s" },
  checks: { purpose: "Every check with difference, tolerance and status", units: "" },
  divider: { purpose: "Data tabs follow", units: "" },
  monthly: { purpose: "Category × month grid every period column reads", units: "$000s" },
  databook: { purpose: "Account × period with mapping columns and the tie to the raw export", units: "$" },
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
  if (logoFile) b.image(logoFile, { col: 13.1, row: 32.2 }, { width: 202, height: 202 * LOGO_ASPECT });
  b.print({ area: "B2:Q39", landscape: true, fitToWidth: 1, fitToHeight: 1 });
  b.plan.gridlines = false;
  return b;
}

/** Height ÷ width of brand/amb-logo-maroon-2048.png. */
export const LOGO_ASPECT = 0.34;

// --- Contents -----------------------------------------------------------------------------------

export function planContents(ctx: TabContext, ds: FinancialDataset | undefined, built: SheetKey[], preparedBy: string, version: string, sourcesPerYear: string[]): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("contents", SHEET.contents, { output: false });
  b.width(1, WIDTH.gutter);
  b.width(2, 4);
  b.width(3, 20);
  b.width(4, 62);
  b.width(5, 9);
  b.width(6, 9);
  b.spacerCol(7);
  b.width(8, 24);
  b.width(9, 34);
  b.height(2, 16.5);
  b.formula(2, 2, "Cover!B24", { style: "title", role: "link" });
  b.text(3, 2, "Contents", { style: "subtitle" });
  for (let c = 2; c <= 9; c++) b.cell(3, c, { border: { bottom: "thin" } });
  ["#", "Tab", "Purpose", "Units", "Check"].forEach((h, i) => b.cell(5, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 2 || i === 1 ? "left" : "center" } }));
  let r = 6;
  built.forEach((key, i) => {
    const name = SHEET[key];
    b.num(r, 2, i + 1, { role: "text", fmt: FMT.term, align: { horizontal: "center" } });
    b.formula(r, 3, `HYPERLINK("#'${name.replace(/'/g, "''")}'!A1","${name}")`, { role: "text", font: { color: COLOR.input, underline: true }, expect: name, label: `link ${name}` });
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
  // Model information block.
  let ir = 5;
  const info = (key: string | undefined, label: string, spec: { v?: string | number; f?: string; expect?: string | number; fmt?: string; role?: "input" | "link" | "text" | "calc" }) => {
    if (key) b.row(key, ir);
    b.text(ir, 8, label, { font: { bold: true } });
    if (spec.f) b.formula(ir, 9, spec.f, { role: spec.role ?? "link", fmt: spec.fmt, expect: spec.expect, label });
    else b.cell(ir, 9, { v: spec.v ?? null, role: spec.role ?? "text", fmt: spec.fmt, align: { horizontal: "left" } });
    ir++;
  };
  b.cell(5, 8, { style: "header", v: "Model information", role: "text", align: { horizontal: "left" } });
  b.cell(5, 9, { style: "header", v: null, role: "text" });
  ir = 6;
  info(undefined, "Business name", { v: ctx.businessName });
  info(undefined, "Code name", { v: ctx.codeName });
  info(undefined, "Prepared by", { v: preparedBy });
  info("asOfDate", "As-of date", { f: A("asOfDate"), fmt: FMT.date, expect: excelSerialOfDate(model.asOfDate) });
  const ltm = model.columns.find((c) => c.ref.kind === "ltm" && !c.priorYear);
  info(undefined, "LTM period", { v: ltm ? `${ltm.label}${ltmEqualsFiscalYear(model.assumptions!.asOfMonth, model.fiscalYearEndMonth) ? ` (equals FY${ltm.end.slice(0, 4)})` : ""}` : "Full fiscal years only" });
  info(undefined, "Fiscal year-end", { v: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][model.fiscalYearEndMonth - 1]! });
  info(undefined, "Mode", { v: `${model.mode.mode === "mainStreet" ? "Main Street" : "Lower middle market"} (${model.mode.measureLabel} PF Adj. EBITDA before reserve $${Math.round(model.mode.measure).toLocaleString("en-US")})` });
  info(undefined, "Deal form", { v: model.dealForm === "asset_purchase" ? "Asset purchase" : "Equity purchase" });
  for (const s of sourcesPerYear) info(undefined, "Source", { v: s });
  info(undefined, "Version", { v: version });
  info("printMode", "Print mode (1 = black fonts)", { v: 0, role: "input", fmt: FMT.toggle });
  b.cell(b.r("printMode"), 9, { style: "printToggle", border: { top: "thin", bottom: "thin", left: "thin", right: "thin" }, align: { horizontal: "center" } });
  info("masterCheck", "Master check", { f: `IF(COUNTIF(${S("checks")}$G:$G,"CHECK")=0,"All checks OK",COUNTIF(${S("checks")}$G:$G,"CHECK")&" checks failing")`, role: "calc", expect: model.masterCheck });
  b.cell(b.r("masterCheck"), 9, { font: { bold: true } });
  b.defineName("PrintMode", `$${colLetter(CONTENTS_PRINT_COL)}$${b.r("printMode")}`);
  b.defineName("MasterCheck", `$${colLetter(CONTENTS_PRINT_COL)}$${b.r("masterCheck")}`);
  // Version log.
  r = Math.max(indexLast, ir) + 2;
  ["Version", "Date", "Prepared by", "Change"].forEach((h, i) => b.cell(r, [2, 3, 4, 5][i]!, { style: "header", v: h, role: "text", align: { horizontal: "left" } }));
  b.cell(r, 6, { style: "header", v: null, role: "text" });
  r++;
  b.text(r, 2, version);
  b.text(r, 3, ctx.asOfLabel === "" ? "" : new Date().toISOString().slice(0, 10));
  b.text(r, 4, preparedBy);
  b.text(r, 5, "First draft generated by the AMB material bot from the sources listed above");
  void ds;
  b.print({ area: `B2:${addr(r, 9)}`, landscape: false, fitToWidth: 1, fitToHeight: 0 });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

function excelSerialOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// --- Summary ---------------------------------------------------------------------------------------

export function planSummary(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("summary", SHEET.summary);
  const K = 1000;
  const cols = model.columns.filter((c) => !c.projected && (c.ref.kind === "fiscal_year" || (c.ref.kind === "ltm" && !c.priorYear) || c.ref.kind === "pf"));
  const pnlL = periodLayout(model, 3);
  const firstCol = 3;
  const lastCol = firstCol + cols.length - 1;
  const notesCol = lastCol + 2;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(firstCol, lastCol, WIDTH.value);
  b.spacerCol(lastCol + 1);
  b.width(notesCol, 44);
  b.anatomy({ subtitle: "Summary ($000s)", lastCol: notesCol, toggleCol: lastCol, masterToggle: ctx.masterToggle });
  b.text(3, lastCol - 1, "Print", { align: { horizontal: "right" } });
  const fyCount = cols.filter((c) => c.ref.kind === "fiscal_year").length;
  const groups: { from: number; to: number; label: string }[] = [];
  if (fyCount) groups.push({ from: firstCol, to: firstCol + fyCount - 1, label: "Full Year" });
  const ltmIdx = cols.findIndex((c) => c.ref.kind === "ltm");
  if (ltmIdx >= 0) groups.push({ from: firstCol + ltmIdx, to: firstCol + ltmIdx, label: "LTM" });
  const pfIdx = cols.findIndex((c) => c.ref.kind === "pf");
  if (pfIdx >= 0) groups.push({ from: firstCol + pfIdx, to: firstCol + pfIdx, label: "PF" });
  b.tier1(5, [...groups, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: firstCol, to: lastCol }, cols.map((c, i) => ({ col: firstCol + i, f: `${S("pnl")}${colLetter(pnlL.byKey[c.key]!)}6`, expect: c.label, role: "text" as const })), "Key lines");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const spans: [number, number][] = groups.map((g) => [g.from, g.to]);

  let r = 8;
  const link = (sheet: "pnl" | "ladder", key: string, c: (typeof cols)[number]) => `${S(sheet)}${colLetter(pnlL.byKey[c.key]!)}${rowOf(sheet, key)}`;
  const line = (label: string, sheet: "pnl" | "ladder", key: string, value: (p: ModelOutput["periods"][string]) => number, kind: "lineFirst" | "line" | "keyTotal" | "margin", marginFollows = false) => {
    const style = kind;
    b.text(r, 2, label, { style: kind === "margin" ? "margin" : kind, align: kind === "margin" ? { horizontal: "left", indent: 1 } : undefined });
    if (kind === "keyTotal") b.keyTotalBox([r, marginFollows ? r + 1 : r], spans);
    cols.forEach((c, i) => {
      const pv = model.periods[c.key]!;
      const isMargin = kind === "margin";
      b.formula(r, firstCol + i, link(sheet, key, c), { style, fmt: isMargin ? FMT.pct1 : kind === "line" ? FMT.body : FMT.currency, expect: isMargin ? (pv.pnl.revenue ? value(pv) : "n.m.") : value(pv) / K, label: `${key} ${c.label}` });
    });
    r++;
  };
  b.section(r++, "Income statement", spans);
  line("Total Revenue", "pnl", "revenue", (p) => p.pnl.revenue, "lineFirst");
  line("Gross Profit", "pnl", "gross_profit", (p) => p.pnl.grossProfit, "line");
  line("% Margin", "pnl", "gross_margin", (p) => (p.pnl.revenue ? p.pnl.grossProfit / p.pnl.revenue : 0), "margin");
  line("Reported EBITDA", "pnl", "reported_ebitda", (p) => p.pnl.ebitda, "keyTotal", true);
  line("% Margin", "pnl", "ebitda_margin", (p) => (p.pnl.revenue ? p.pnl.ebitda / p.pnl.revenue : 0), "margin");
  line("Net Income", "pnl", "net_income", (p) => p.pnl.netIncome, "line");
  b.spacerRow(r++);
  b.section(r++, "Adjusted EBITDA ladder (condensed)", spans);
  line("Reported EBITDA", "ladder", "reported_ebitda", (p) => p.ladder.reportedEbitda, "lineFirst");
  line("(+) / (-) Normalization Adjustments", "ladder", "total_normalization", (p) => p.ladder.totalNormalization, "line");
  line("(+) Owner Compensation", "ladder", "s1", (p) => p.ladder.ownerCompAsPaid, "line");
  line("Seller's Discretionary Earnings (SDE)", "ladder", "sde", (p) => p.ladder.sde, "keyTotal", true);
  line("% Margin", "ladder", "sde_margin", (p) => p.ladder.sdeMargin, "margin");
  line("(-) Market Replacement Compensation", "ladder", "s2", (p) => p.ladder.marketReplacement, "line");
  line("(-) Capital Reserve", "ladder", "s3", (p) => p.ladder.capitalReserve, "line");
  line("Adj. EBITDA", "ladder", "adj_ebitda", (p) => p.ladder.adjEbitda, "keyTotal", true);
  line("% Margin", "ladder", "adj_margin", (p) => p.ladder.adjMargin, "margin");
  line("(+) / (-) Pro Forma Adjustments", "ladder", "total_pro_forma", (p) => p.ladder.totalProForma, "line");
  line("PF Adj. EBITDA", "ladder", "pf_adj_ebitda", (p) => p.ladder.pfAdjEbitda, "keyTotal");
  b.spacerRow(r++);

  // KPIs and balance-sheet facts on the latest column.
  b.section(r++, "Key facts at the as-of date", spans);
  const fact = (label: string, f: string | undefined, expect: number | string | null | undefined, fmt: string, note?: string) => {
    b.text(r, 2, label, { style: "line" });
    if (f && expect !== null && expect !== undefined) b.formula(r, lastCol, f, { style: "line", fmt, expect, label });
    else b.na(r, lastCol, "n.a.", { style: "line" });
    if (note) b.note(r, notesCol, note, { align: { wrap: false } });
    r++;
  };
  const n = model.namedOutputs;
  const mainStreet = model.mode.mode === "mainStreet";
  fact("Mode", `IF(${A("mainStreetMode")}=1,"Main Street","Lower middle market")`, mainStreet ? "Main Street" : "Lower middle market", FMT.body, `Rule: PF Adj. EBITDA before the reserve $${Math.round(model.mode.measure).toLocaleString("en-US")} vs $1,000,000`);
  if (model.customers) fact("Customers, active (#)", `${S("customers")}${colLetter(3)}${rowOf("customers", "latestCount")}`, n.Customers_Latest, FMT.body);
  if (model.customers) fact("Top 10 customers, % of revenue", `${S("concentration")}${colLetter(4)}${rowOf("concentration", "top10")}`, n.Top10Share_LTM, FMT.pct1);
  if (model.headcount) fact("Employees, non-owner (#)", `${S("headcount")}${colLetter(3)}${rowOf("headcount", "total")}`, n.Headcount_Latest, FMT.body);
  if (model.nwc) fact("Adjusted NWC, latest ($000s)", `${S("nwc")}${colLetter(rowOf("nwc", "latestCol") as unknown as number)}${rowOf("nwc", "adjustedNwc")}`, (n.NWC_Latest ?? 0) / K, FMT.currency, `Peg basis: ${model.nwc.pegBasis}`);
  if (model.debtLike) fact("Funded debt, latest ($000s)", `${S("debtLike")}${colLetter(3)}${rowOf("debtLike", "fundedDebt")}`, model.debtLike.fundedDebt / K, FMT.currency);
  b.spacerRow(r++);
  b.section(r++, "Indicative valuation range (internal; never in the CIM)", spans);
  const vd = model.valuationDetail!;
  const cases = ["low", "mid", "high"] as const;
  b.text(r, 2, "Case", { style: "line" });
  cases.forEach((c, i) => b.text(r, firstCol + i, c === "low" ? "Low" : c === "mid" ? "Mid" : "High", { font: { bold: true }, align: { horizontal: "right" } }));
  r++;
  b.text(r, 2, `Total investment (${mainStreet ? "SDE" : "Adj. EBITDA"} × multiple)`, { style: "lineFirst" });
  cases.forEach((c, i) => b.formula(r, firstCol + i, `${S("valuation")}${colLetter(3 + i)}${rowOf("valuation", "totalInvestment")}`, { style: "lineFirst", fmt: FMT.currency, expect: vd.cases[c].totalInvestment / K, label: `TI ${c}` }));
  r++;
  b.text(r, 2, "Implied multiple of SDE (x)", { style: "line" });
  cases.forEach((c, i) => b.formula(r, firstCol + i, `${S("valuation")}${colLetter(3 + i)}${rowOf("valuation", "impliedSde")}`, { style: "line", fmt: FMT.multiple, expect: vd.cases[c].impliedSdeMultiple, label: `x SDE ${c}` }));
  r++;
  b.text(r, 2, "Implied multiple of Adj. EBITDA (x)", { style: "line" });
  cases.forEach((c, i) => b.formula(r, firstCol + i, `${S("valuation")}${colLetter(3 + i)}${rowOf("valuation", "impliedAdj")}`, { style: "line", fmt: FMT.multiple, expect: vd.cases[c].impliedAdjEbitdaMultiple, label: `x Adj ${c}` }));
  r++;
  r++;
  const notes = [
    model.granularity === "annual" ? `Full fiscal years only; source: ${model.databook?.pnl[0] ? SOURCE_LABELS[model.databook.pnl[0].source] : "annual P&L"}.` : ltmEqualsFiscalYear(model.assumptions!.asOfMonth, model.fiscalYearEndMonth) ? `LTM ${model.columns.find((c) => c.ref.kind === "ltm" && !c.priorYear)?.label.replace("LTM ", "")} equals FY${model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).at(-1)?.fiscalYear}; YTD equals the full year.` : "",
    `Reported EBITDA is net income plus interest, taxes and D&A, so it carries other income; a normalization row removes what is non-operating.`,
  ].filter(Boolean);
  b.note(r, 2, `Note: ${notes.join(" ")}`);
  b.print({ area: `B2:${addr(r, notesCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 1, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

export { path };
