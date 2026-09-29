// The data tabs behind the `Data -->` divider (guide 5.1 rows 26-30):
// Monthly P&L (the category × month grid every period column reads),
// Databook (account × period with mapping columns and the tie to the raw
// export), Mapping, and the Raw tabs (values only, as exported).

import { IS_CATEGORIES, IS_LABELS, SOURCE_LABELS, type FinancialDataset, type IsCategory, type MonthKey } from "../../domain/financials.ts";
import { addr, colLetter, fitScale, range, rowOf, SheetBuilder, wrappedLines } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { adjMonthStart, applyPeriodWidths, ASOF, gridMonths, LATEST_FY, FYE, periodLayout, S, SHEET, serialOfMonthStart, sumifsFormula, valueSpans, writeMonthHeaders, writePeriodHelpers, type PeriodLayout } from "./layout.ts";

/** Month columns start here on Monthly P&L and Databook so the guide's `SUMIFS(Databook!<month col>, ...)` reads the same letter. */
export const MONTH_START = 17;
export const DATABOOK_FIRST_ROW = 8;
export const MONTHLY_FIRST_ROW = 8;
const K = 1000;

// --- Row specs shared by Monthly P&L and P&L Summary --------------------------------------------

export type PnlRowKind = "section" | "line" | "lineFirst" | "subtotal" | "keyTotal" | "margin" | "ratio" | "spacer" | "check";

export interface PnlRowSpec {
  key: string;
  label: string;
  kind: PnlRowKind;
  /** Category the row sums (category rows) or the revenue-line account. */
  category?: IsCategory;
  account?: string;
  contra?: boolean;
  /** In-sheet arithmetic on other row keys, written as a function of a cell address resolver. */
  calc?: (at: (key: string) => string) => string;
  /** Engine value in dollars for a period (or month) given the values the row derives from. */
  value?: (v: PnlValues) => number;
}

/** What a P&L row can be computed from: the period's lines and ladder, in dollars. */
export interface PnlValues {
  pnl: ModelOutput["periods"][string]["pnl"];
  ladder: ModelOutput["periods"][string]["ladder"];
  revenueLines: ModelOutput["periods"][string]["revenueLines"];
}

/** The rows of the income statement (guide 5.1 row 5 / 27), in print order. Revenue lines come from the dataset. */
/** The Monthly P&L rows named for the CIM (guide 5.14 `Monthly_<line>`), each keyed to the engine's monthly series. */
export const MONTHLY_NAMES: [string, string][] = [
  ["Revenue", "revenue"],
  ["GrossProfit", "gross_profit"],
  ["RepEBITDA", "reported_ebitda"],
  ["SDE", "sde"],
  ["AdjEBITDA", "adj_ebitda"],
];

export function pnlRows(model: ModelOutput, opts: { ladder: boolean; kpis?: boolean } = { ladder: false }): PnlRowSpec[] {
  const lines = model.periods[model.columns.find((c) => !c.projected)!.key]!.revenueLines;
  const serviceLines = lines.filter((l) => !(model.assumptions && isContra(model, l.account)));
  const contra = lines.filter((l) => model.assumptions && isContra(model, l.account));
  const rows: PnlRowSpec[] = [];
  rows.push({ key: "sec_revenue", label: "Revenue", kind: "section" });
  if (serviceLines.length) {
    serviceLines.forEach((l, i) =>
      rows.push({ key: `rev:${l.account}`, label: l.label, kind: i === 0 ? "lineFirst" : "line", account: l.account, value: (v) => v.revenueLines.find((x) => x.account === l.account)?.amount ?? 0 }),
    );
    if (contra.length) rows.push({ key: "rev_contra", label: "Less: discounts and refunds", kind: "line", contra: true, value: (v) => contra.reduce((s, c) => s + (v.revenueLines.find((x) => x.account === c.account)?.amount ?? 0), 0) });
    rows.push({ key: "revenue", label: "Total Revenue", kind: "subtotal", calc: (at) => `SUM(${at(serviceLines[0]!.account === undefined ? "revenue" : `rev:${serviceLines[0]!.account}`)}:${at(contra.length ? "rev_contra" : `rev:${serviceLines[serviceLines.length - 1]!.account}`)})`, value: (v) => v.pnl.revenue });
  } else {
    rows.push({ key: "revenue", label: "Total Revenue", kind: "lineFirst", category: "revenue", value: (v) => v.pnl.revenue });
  }
  rows.push({ key: "revenue_growth", label: "% Growth", kind: "ratio" });
  rows.push({ key: "cogs", label: "Cost of Revenue", kind: "line", category: "cogs", value: (v) => v.pnl.cogs });
  rows.push({ key: "gross_profit", label: "Gross Profit", kind: "keyTotal", calc: (at) => `${at("revenue")}-${at("cogs")}`, value: (v) => v.pnl.grossProfit });
  rows.push({ key: "gross_margin", label: "% Margin", kind: "margin", value: (v) => (v.pnl.revenue ? v.pnl.grossProfit / v.pnl.revenue : 0) });
  rows.push({ key: "sp1", label: "", kind: "spacer" });
  rows.push({ key: "sec_opex", label: "Operating Expenses", kind: "section" });
  rows.push({ key: "payroll", label: "Salaries, Wages and Benefits", kind: "lineFirst", category: "payroll", value: (v) => v.pnl.payroll });
  rows.push({ key: "owner_comp", label: "Owner / Officer Compensation", kind: "line", category: "owner_comp", value: (v) => v.pnl.ownerComp });
  rows.push({ key: "rent", label: "Rent and Occupancy", kind: "line", category: "rent", value: (v) => v.pnl.rent });
  rows.push({ key: "marketing", label: "Advertising and Marketing", kind: "line", category: "marketing", value: (v) => v.pnl.marketing });
  rows.push({ key: "other_opex", label: "Other Operating Expenses", kind: "line", category: "other_opex", value: (v) => v.pnl.otherOpex });
  rows.push({ key: "total_opex", label: "Total Operating Expenses", kind: "subtotal", calc: (at) => `SUM(${at("payroll")}:${at("other_opex")})`, value: (v) => v.pnl.totalOpex });
  rows.push({ key: "other_income", label: "Other Income", kind: "line", category: "other_income", value: (v) => v.pnl.otherIncome });
  rows.push({ key: "other_expense", label: "Other Expense (non-operating)", kind: "line", category: "other_expense", value: (v) => v.pnl.otherExpense });
  rows.push({ key: "reported_ebitda", label: "Reported EBITDA", kind: "keyTotal", calc: (at) => `${at("gross_profit")}-${at("total_opex")}+${at("other_income")}-${at("other_expense")}`, value: (v) => v.pnl.ebitda });
  rows.push({ key: "ebitda_margin", label: "% Margin", kind: "margin", value: (v) => (v.pnl.revenue ? v.pnl.ebitda / v.pnl.revenue : 0) });
  rows.push({ key: "sp2", label: "", kind: "spacer" });
  rows.push({ key: "da", label: "Depreciation and Amortization", kind: "lineFirst", category: "depreciation_amortization", value: (v) => v.pnl.da });
  rows.push({ key: "ebit", label: "EBIT", kind: "subtotal", calc: (at) => `${at("reported_ebitda")}-${at("da")}`, value: (v) => v.pnl.ebit });
  rows.push({ key: "interest", label: "Interest Expense", kind: "line", category: "interest_expense", value: (v) => v.pnl.interest });
  rows.push({ key: "ebt", label: "Pre-Tax Income", kind: "subtotal", calc: (at) => `${at("ebit")}-${at("interest")}`, value: (v) => v.pnl.ebt });
  rows.push({ key: "tax", label: "Income Taxes", kind: "line", category: "income_tax", value: (v) => v.pnl.tax });
  rows.push({ key: "net_income", label: "Net Income", kind: "keyTotal", calc: (at) => `${at("ebt")}-${at("tax")}`, value: (v) => v.pnl.netIncome });
  rows.push({ key: "net_margin", label: "% Margin", kind: "margin", value: (v) => (v.pnl.revenue ? v.pnl.netIncome / v.pnl.revenue : 0) });
  if (opts.ladder) {
    rows.push({ key: "sp3", label: "", kind: "spacer" });
    rows.push({ key: "sec_ladder", label: "Adj. EBITDA Ladder (accepted adjustments)", kind: "section" });
    rows.push({ key: "definitional", label: "(+) Definitional Adjustments [D]", kind: "lineFirst", value: (v) => v.ladder.definitional.interest + v.ladder.definitional.taxes + v.ladder.definitional.da });
    rows.push({ key: "total_normalization", label: "(+) / (-) Normalization Adjustments [N]", kind: "line", value: (v) => v.ladder.totalNormalization });
    rows.push({ key: "owner_comp_as_paid", label: "(+) Owner Compensation [S1]", kind: "line", value: (v) => v.ladder.ownerCompAsPaid });
    rows.push({ key: "sde", label: "Seller's Discretionary Earnings (SDE)", kind: "keyTotal", calc: (at) => `${at("net_income")}+${at("definitional")}+${at("total_normalization")}+${at("owner_comp_as_paid")}`, value: (v) => v.ladder.sde });
    rows.push({ key: "market_replacement", label: "(-) Market Replacement Compensation [S2]", kind: "line", value: (v) => v.ladder.marketReplacement });
    rows.push({ key: "capital_reserve", label: "(-) Capital Reserve [S3]", kind: "line", value: (v) => v.ladder.capitalReserve });
    rows.push({ key: "adj_ebitda", label: "Adj. EBITDA", kind: "keyTotal", calc: (at) => `${at("sde")}+${at("market_replacement")}+${at("capital_reserve")}`, value: (v) => v.ladder.adjEbitda });
    rows.push({ key: "total_pro_forma", label: "(+) / (-) Pro Forma Adjustments [PF]", kind: "line", value: (v) => v.ladder.totalProForma });
    rows.push({ key: "pf_adj_ebitda", label: "PF Adj. EBITDA", kind: "keyTotal", calc: (at) => `${at("adj_ebitda")}+${at("total_pro_forma")}`, value: (v) => v.ladder.pfAdjEbitda });
  }
  // A 3.95 spacer row before every subtotal that follows a line (guide 5.11).
  const spaced: PnlRowSpec[] = [];
  for (const row of rows) {
    const prev = spaced.at(-1);
    if ((row.kind === "subtotal" || row.kind === "keyTotal") && prev && (prev.kind === "line" || prev.kind === "lineFirst")) spaced.push({ key: `sp_${row.key}`, label: "", kind: "spacer" });
    spaced.push(row);
  }
  return spaced;
}

function isContra(model: ModelOutput, account: string): boolean {
  return !!model.databook?.pnl.find((r) => r.account === account && r.category === "revenue" && Object.values(r.byFiscalYear).every((v) => v <= 0) && Object.values(r.byFiscalYear).some((v) => v < 0));
}

/** The revenue accounts the "Less: discounts and refunds" row sums. */
export function contraAccounts(model: ModelOutput): string[] {
  return (model.databook?.pnl ?? []).filter((x) => x.category === "revenue" && isContra(model, x.account)).map((x) => x.account);
}

/** Style a P&L row's label and value cells by kind. */
export function stylePnlRow(b: SheetBuilder, r: number, spec: PnlRowSpec, spans: [number, number][], marginRowFollows: boolean): void {
  switch (spec.kind) {
    case "section":
      b.section(r, spec.label, spans);
      break;
    case "spacer":
      b.spacerRow(r);
      break;
    case "line":
    case "lineFirst":
      b.text(r, 2, spec.label, { style: "line" });
      break;
    case "subtotal":
      b.text(r, 2, spec.label, { style: "subtotal" });
      b.subtotalBorder(r, spans);
      break;
    case "keyTotal":
      b.text(r, 2, spec.label, { style: "keyTotal" });
      b.keyTotalBox([r, marginRowFollows ? r + 1 : r], spans);
      break;
    case "margin":
      b.text(r, 2, spec.label, { style: "margin", align: { horizontal: "left", indent: 1 } });
      break;
    case "ratio":
      b.text(r, 2, spec.label, { style: "ratio", align: { horizontal: "left", indent: 1 } });
      break;
    case "check":
      b.text(r, 2, spec.label, { style: "check" });
      break;
  }
}

export function valueStyle(kind: PnlRowKind): { style: "line" | "lineFirst" | "subtotal" | "keyTotal" | "margin" | "ratio" | "check"; fmt: string } {
  switch (kind) {
    case "lineFirst":
      return { style: "lineFirst", fmt: FMT.currency };
    case "subtotal":
      return { style: "subtotal", fmt: FMT.currency };
    case "keyTotal":
      return { style: "keyTotal", fmt: FMT.currency };
    case "margin":
      return { style: "margin", fmt: FMT.pct1 };
    case "ratio":
      return { style: "ratio", fmt: FMT.pct };
    case "check":
      return { style: "check", fmt: FMT.check };
    default:
      return { style: "line", fmt: FMT.body };
  }
}

// --- Divider ----------------------------------------------------------------------------------

/** The divider is a tab colour and a name only (guide 5.1): empty, so it prints no page. */
export function planDivider(): SheetBuilder {
  return new SheetBuilder("divider", SHEET.divider, { output: false, tabColor: COLOR.dividerTab });
}

// --- Monthly P&L ---------------------------------------------------------------------------------

export function planMonthly(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const months = gridMonths(model);
  if (!months.length || !model.monthly) return undefined;
  const b = new SheetBuilder("monthly", SHEET.monthly);
  const l = periodLayout(model, 3);
  const n = months.length;
  const firstMonthCol = MONTH_START;
  const lastMonthCol = MONTH_START + n - 1;
  const notesCol = lastMonthCol + 2;
  applyPeriodWidths(b, l, WIDTH.label);
  for (let c = l.notesCol; c < firstMonthCol; c++) b.spacerCol(c);
  b.widths(firstMonthCol, lastMonthCol, WIDTH.value);
  b.spacerCol(lastMonthCol + 1);
  b.width(notesCol, WIDTH.notes);
  b.outlineCols(firstMonthCol, lastMonthCol, 1);
  b.anatomy({ subtitle: "Monthly P&L ($000s)", lastCol: notesCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });

  // One tier-1 group per fiscal year of months, so each printed page (one fiscal year) names its year.
  const fyGroups = fiscalYearBlocks(model, firstMonthCol).map((g) => ({ from: g.from, to: g.to, label: `Monthly: FY${g.fiscalYear} ($000s)` }));
  b.tier1(5, [...l.groups, ...fyGroups, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], "Income Statement");
  if (l.deltas) {
    b.cell(6, l.deltas.dollar, { style: "header", v: "($)", role: "text" });
    b.cell(6, l.deltas.pct, { style: "header", v: "(%)", role: "text" });
  }
  writeMonthHeaders(b, 6, firstMonthCol, months);
  b.cell(6, notesCol, { style: "header", v: "Basis / notes", role: "text", align: { horizontal: "left" } });

  const rows = pnlRows(model, { ladder: true });
  let r = MONTHLY_FIRST_ROW;
  for (const spec of rows) b.row(spec.key, r++);
  b.row("tie_out", r);
  const tieRow = r;
  r++;
  const lastPrinted = r - 1;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 2);
  const spans = valueSpans(l);
  const monthSpan: [number, number] = [firstMonthCol, lastMonthCol];
  const monthRow = (rowKey: string) => `$${colLetter(firstMonthCol)}${b.r(rowKey)}:$${colLetter(lastMonthCol)}${b.r(rowKey)}`;
  const monthHeaderRow = `$${colLetter(firstMonthCol)}$6:$${colLetter(lastMonthCol)}$6`;
  const dbFirst = DATABOOK_FIRST_ROW;
  const dbLast = DATABOOK_FIRST_ROW + (model.databook?.pnl.length ?? 1) - 1;
  const dbColumn = (c: number) => `${S("databook")}$${colLetter(c)}$${dbFirst}:$${colLetter(c)}$${dbLast}`;
  const dbCategory = dbColumn(DATABOOK_COL.category);
  const dbAccount = dbColumn(DATABOOK_COL.account);
  const adjMonthFirst = adjMonthStart(model);
  const series = model.monthly.series;

  for (const spec of rows) {
    const rr = b.r(spec.key);
    const next = rows[rows.indexOf(spec) + 1];
    stylePnlRow(b, rr, spec, [...spans, monthSpan], next?.kind === "margin");
    if (spec.kind === "section" || spec.kind === "spacer") continue;
    const vs = valueStyle(spec.kind);
    // Month cells first, then the period block sums them.
    months.forEach((m, i) => {
      const col = firstMonthCol + i;
      const colL = colLetter(col);
      const inSheet = (key: string) => `${colL}${b.r(key)}`;
      let f: string | undefined;
      let expect: number | undefined;
      if (spec.category) {
        f = `SUMIFS(${S("databook")}${colL}$${dbFirst}:${colL}$${dbLast},${dbCategory},"${spec.category}")/${K}`;
        expect = series[spec.category]![i]! / K;
      } else if (spec.account) {
        f = `SUMIFS(${S("databook")}${colL}$${dbFirst}:${colL}$${dbLast},${dbAccount},"${spec.account.replace(/"/g, '""')}")/${K}`;
        expect = (series[`rev:${spec.account}`]?.[i] ?? 0) / K;
      } else if (spec.contra) {
        const contra = contraAccounts(model);
        f = contra.map((acc) => `SUMIFS(${S("databook")}${colL}$${dbFirst}:${colL}$${dbLast},${dbAccount},"${acc.replace(/"/g, '""')}")`).join("+") + `/${K}`;
        expect = contra.reduce((s, acc) => s + (series[`rev:${acc}`]?.[i] ?? 0), 0) / K;
      } else if (spec.kind === "margin") {
        const base = spec.key === "gross_margin" ? "gross_profit" : spec.key === "ebitda_margin" ? "reported_ebitda" : "net_income";
        f = `IFERROR(${inSheet(base)}/${inSheet("revenue")},"n.m.")`;
        const rev = series.revenue![i]!;
        const num = series[base === "gross_profit" ? "gross_profit" : base === "reported_ebitda" ? "reported_ebitda" : "net_income"]![i]!;
        b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect: rev ? num / rev : "n.m.", label: `${spec.key} ${m}` });
        return;
      } else if (spec.kind === "ratio") {
        if (i === 0) {
          b.na(rr, col, "n.a.", { style: vs.style });
          return;
        }
        f = `IFERROR(${inSheet("revenue")}/${colLetter(col - 1)}${b.r("revenue")}-1,"n.a.")`;
        const prev = series.revenue![i - 1]!;
        b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect: prev ? series.revenue![i]! / prev - 1 : "n.a.", label: `${spec.key} ${m}` });
        return;
      } else if (["definitional", "total_normalization", "owner_comp_as_paid", "market_replacement", "capital_reserve", "total_pro_forma"].includes(spec.key)) {
        const tierRowKey = spec.key === "definitional" ? "tier_definitional" : spec.key === "total_normalization" ? "tier_normalization" : spec.key === "owner_comp_as_paid" ? "tier_s1" : spec.key === "market_replacement" ? "tier_s2" : spec.key === "capital_reserve" ? "tier_s3" : "tier_pro_forma";
        const adjRow = rowOf("adjustments", tierRowKey);
        const adjMonths = (row: string) => `${S("adjustments")}$${colLetter(adjMonthFirst)}$${row}:$${colLetter(adjMonthFirst + n - 1)}$${row}`;
        f = `INDEX(${adjMonths(adjRow)},MATCH(${colL}$6,${adjMonths("6")},0))`;
        expect = series[spec.key]![i]! / K;
      } else if (spec.calc) {
        f = spec.calc(inSheet);
        expect = series[spec.key === "revenue" ? "revenue" : spec.key]![i]! / K;
      }
      if (f !== undefined) b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect, label: `${spec.key} ${m}` });
    });
    // Period block: SUMIFS over the month cells, except ratios which recompute.
    for (const { column, col } of l.cols) {
      const colL = colLetter(col);
      const inSheet = (key: string) => `${colL}${b.r(key)}`;
      const pv = model.periods[column.key]!;
      const values: PnlValues = { pnl: pv.pnl, ladder: pv.ladder, revenueLines: pv.revenueLines };
      if (spec.kind === "margin") {
        const base = spec.key === "gross_margin" ? "gross_profit" : spec.key === "ebitda_margin" ? "reported_ebitda" : "net_income";
        b.formula(rr, col, `IFERROR(${inSheet(base)}/${inSheet("revenue")},"n.m.")`, { style: vs.style, fmt: vs.fmt, expect: pv.pnl.revenue ? spec.value!(values) : "n.m.", label: `${spec.key} ${column.label}` });
        continue;
      }
      if (spec.kind === "ratio") {
        const prior = priorColumn(column, l);
        if (!prior) {
          b.na(rr, col, "n.a.", { style: vs.style });
          continue;
        }
        const prev = model.periods[prior.column.key]!.pnl.revenue;
        b.formula(rr, col, `IFERROR(${inSheet("revenue")}/${colLetter(prior.col)}${b.r("revenue")}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? pv.pnl.revenue / prev - 1 : "n.a.", label: `${spec.key} ${column.label}` });
        continue;
      }
      const f = sumifsFormula({ valuesRow: monthRow(spec.key), monthsRow: monthHeaderRow, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) });
      b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${column.label}` });
    }
    if (l.deltas && spec.value) writeDeltas(b, rr, l, spec.kind, deltaValues(model, l, (p) => spec.value!({ pnl: p.pnl, ladder: p.ladder, revenueLines: p.revenueLines }) / K));
  }
  // Tie-out: net income on the grid against the Databook, per month (guide 5.2, V51 row 71).
  b.text(tieRow, 2, "Tie Out: Net Income less Databook", { style: "check" });
  const dbSign = IS_CATEGORIES.map((c, i) => `${c === "revenue" || c === "other_income" ? (i ? "+" : "") : "-"}SUMIFS(${S("databook")}COLX$${dbFirst}:COLX$${dbLast},${dbCategory},"${c}")`).join("");
  months.forEach((m, i) => {
    const col = firstMonthCol + i;
    const colL = colLetter(col);
    const f = `${colL}${b.r("net_income")}-(${dbSign.replace(/COLX/g, colL)})/${K}`;
    b.formula(tieRow, col, f, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `tie out ${m}` });
  });
  // Each period's tie is the sum of its months' ties, so a break in any month shows in the period block too.
  for (const { column, col } of l.cols) {
    const f = sumifsFormula({ valuesRow: monthRow("tie_out"), monthsRow: monthHeaderRow, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) });
    b.formula(tieRow, col, f, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `tie out ${column.label}` });
  }
  b.checkCf(tieRow, l.firstCol, lastMonthCol);
  b.note(lastPrinted + 1, 2, "Note: category rows are SUMIFS of the Databook by AMB category; revenue lines by account; ladder rungs read the Adjustments tier totals by month. Tie Out must equal zero.");

  // Page 1 is the period block; each later page one fiscal year of months with column B repeated (guide 5.2).
  const pages = [range2(2, l.lastValueCol + 1), ...fyGroups.map((g) => [2, ...range2(g.from, g.to)])];
  b.print({
    area: `B2:${addr(lastPrinted, notesCol)}`,
    landscape: true,
    scale: fitScale(b.plan, pages, lastPrinted),
    titlesRow: "5:6",
    titlesCol: "B:B",
    colBreaks: [firstMonthCol - 1, ...fyGroups.slice(1).map((g) => g.from - 1)],
  });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  // Monthly_<line> (guide 5.14): the month-by-month rows the CIM's monthly appendix (S11.2) reads.
  for (const [name, key] of MONTHLY_NAMES) if (b.plan.rows[key] !== undefined) b.defineName(`Monthly_${name}`, `$${colLetter(firstMonthCol)}$${b.r(key)}:$${colLetter(lastMonthCol)}$${b.r(key)}`);
  return b;
}

/** The engine's PF and LTM CY values of a row, for the delta columns. */
export function deltaValues(model: ModelOutput, l: PeriodLayout, value: (p: ModelOutput["periods"][string]) => number): { pf: number | undefined; ltm: number | undefined } {
  const pf = l.cols.find((c) => c.column.ref.kind === "pf");
  const ltm = l.cols.find((c) => c.column.ref.kind === "ltm" && !c.column.priorYear);
  return { pf: pf ? value(model.periods[pf.column.key]!) : undefined, ltm: ltm ? value(model.periods[ltm.column.key]!) : undefined };
}

/** Consecutive integers from..to. */
function range2(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

/** The grid's months grouped by fiscal year, as column spans starting at `firstCol`. */
export function fiscalYearBlocks(model: ModelOutput, firstCol: number): { fiscalYear: number; from: number; to: number }[] {
  const blocks: { fiscalYear: number; from: number; to: number }[] = [];
  (model.monthly?.months ?? []).forEach((m, i) => {
    const last = blocks.at(-1);
    if (last && last.fiscalYear === m.fiscalYear) last.to = firstCol + i;
    else blocks.push({ fiscalYear: m.fiscalYear, from: firstCol + i, to: firstCol + i });
  });
  return blocks;
}

/** The column one year earlier in the same group, for y/y growth. */
export function priorColumn(column: ModelOutput["columns"][number], l: PeriodLayout): { column: ModelOutput["columns"][number]; col: number } | undefined {
  if (column.ref.kind === "fiscal_year") {
    const prev = l.cols.find((c) => c.column.ref.kind === "fiscal_year" && c.column.fiscalYear === column.fiscalYear! - 1);
    return prev;
  }
  if ((column.ref.kind === "ytd" || column.ref.kind === "ltm") && !column.priorYear) return l.cols.find((c) => c.column.ref.kind === column.ref.kind && c.column.priorYear);
  return undefined;
}

/**
 * PF vs. LTM delta columns (guide 5.2 N:O): Delta ($) and Delta (%), styled
 * as the row, with the engine's values for the verifier. Rows that are
 * ratios, checks or not numbers in either column leave the deltas blank.
 */
export function writeDeltas(b: SheetBuilder, r: number, l: PeriodLayout, kind: PnlRowKind, values?: { pf: number | string | undefined; ltm: number | string | undefined }): void {
  const pf = l.cols.find((c) => c.column.ref.kind === "pf");
  const ltm = l.cols.find((c) => c.column.ref.kind === "ltm" && !c.column.priorYear);
  if (!l.deltas || !pf || !ltm) return;
  if (["margin", "ratio", "check"].includes(kind) || typeof values?.pf !== "number" || typeof values.ltm !== "number") return;
  const vs = valueStyle(kind);
  b.formula(r, l.deltas.dollar, `${addr(r, pf.col)}-${addr(r, ltm.col)}`, { style: vs.style, fmt: vs.fmt, expect: values.pf - values.ltm, label: `delta $ row ${r}` });
  b.formula(r, l.deltas.pct, `IFERROR(${addr(r, pf.col)}/${addr(r, ltm.col)}-1,"n.a.")`, { style: kind === "keyTotal" ? "margin" : "ratio", fmt: FMT.pct, expect: values.ltm ? values.pf / values.ltm - 1 : "n.a.", label: `delta % row ${r}` });
}

// --- Databook -----------------------------------------------------------------------------------

/**
 * Databook columns other tabs read. The mapping columns are guide 5.2's
 * (Account | Source | AMB Category | Summary Line | Personal? | Adjustment
 * Ref); period columns start at I and months at MONTH_START, the letters the
 * Monthly P&L uses.
 */
export const DATABOOK_COL = { account: 2, category: 4, periodStart: 9 } as const;

/** The tie-to-raw block right of the months (guide 5.2): Databook ($) | Raw ($) | Diff ($) | Status. */
export function databookTieCols(model: ModelOutput): { databook: number; raw: number; diff: number; status: number } {
  const n = gridMonths(model).length;
  const databook = n ? MONTH_START + n + 1 : DATABOOK_COL.periodStart + model.columns.filter((c) => !c.projected).length + 1;
  return { databook, raw: databook + 1, diff: databook + 2, status: databook + 3 };
}

export function planDatabook(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("databook", SHEET.databook);
  const months = gridMonths(model);
  const n = months.length;
  const rows = model.databook?.pnl ?? [];
  const bsRows = model.databook?.bs ?? [];
  const bsDates = [...new Set(bsRows.flatMap((x) => Object.keys(x.byMonth)))].sort();
  const hist = model.columns.filter((c) => !c.projected);
  const { periodStart } = DATABOOK_COL;
  const lastPeriodCol = periodStart + Math.max(hist.length, bsDates.length, 1) - 1;
  const tie = databookTieCols(model);
  const lastCol = tie.status;

  const headers = ["Account (as exported)", "Source", "AMB Category", "Summary Line", "Personal?", "Adjustment Ref"];
  b.width(1, WIDTH.gutter);
  [40, 18, 22, 30, 9, 13].forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(8);
  b.outlineCols(3, 7, 1);
  b.widths(periodStart, lastPeriodCol, WIDTH.value);
  const monthsFrom = n ? MONTH_START : lastPeriodCol + 1;
  for (let c = lastPeriodCol + 1; c < monthsFrom; c++) b.spacerCol(c);
  if (n) {
    b.widths(MONTH_START, MONTH_START + n - 1, WIDTH.value);
    b.outlineCols(MONTH_START, MONTH_START + n - 1, 1);
  }
  b.spacerCol(tie.databook - 1);
  b.widths(tie.databook, tie.diff - 1, 11);
  b.width(tie.diff, 17);
  b.width(tie.status, 10);
  b.anatomy({ subtitle: "Databook: Account × Period ($)", lastCol, toggleCol: lastPeriodCol, masterToggle: ctx.masterToggle });
  b.text(3, lastPeriodCol - 1, "Print", { align: { horizontal: "right" } });

  // Period groups sit side by side (the months must start at MONTH_START), so each is labelled rather than spaced.
  const periodGroups: { from: number; to: number; label: string }[] = [];
  hist.forEach((c, i) => {
    const last = periodGroups.at(-1);
    if (last && last.label === c.group) last.to = periodStart + i;
    else periodGroups.push({ from: periodStart + i, to: periodStart + i, label: c.group });
  });
  const fyGroups = n ? fiscalYearBlocks(model, MONTH_START) : [];
  b.tier1(5, [
    { from: 2, to: 7, label: "Mapping" },
    ...periodGroups,
    ...fyGroups.map((g) => ({ from: g.from, to: g.to, label: `Monthly: FY${g.fiscalYear} ($)` })),
    { from: tie.databook, to: tie.status, label: "Tie to raw export" },
  ]);
  const header = (r: number, c: number, v: string, left = false) => b.cell(r, c, { style: "header", v, role: "text", align: left ? { horizontal: "left" } : undefined });
  headers.forEach((h, i) => header(6, 2 + i, h, true));
  hist.forEach((c, i) => header(6, periodStart + i, c.label));
  if (n) writeMonthHeaders(b, 6, MONTH_START, months);
  ["Databook ($)", "Raw ($)", "Diff by period ($)", "Status"].forEach((h, i) => header(6, tie.databook + i, h));

  // P&L accounts: months typed as exported, periods and the tie as formulas.
  const firstRow = DATABOOK_FIRST_ROW;
  const lastRow = firstRow + rows.length - 1;
  b.row("first", firstRow);
  b.row("last", lastRow);
  const rawPnlRows = (c: number) => `${S("rawPnl")}$${colLetter(c)}$4:$${colLetter(c)}$${3 + rows.length}`;
  const fyCols = hist.map((c, i) => ({ c, col: periodStart + i })).filter((x) => x.c.ref.kind === "fiscal_year");
  const rawPnlTotal = rawPnlRows(RAW_PNL_TOTAL_COL(n ? n : fyCols.length));
  rows.forEach((row, i) => {
    const r = firstRow + i;
    [row.account, SOURCE_LABELS[row.source], row.category, row.summaryLine, row.personal ? "Personal?" : "", row.adjustmentRef ? `[${row.adjustmentRef}]` : ""].forEach((v, k) => b.text(r, 2 + k, v));
    let total: string;
    let engineTotal: number;
    if (n) {
      months.forEach((m, k) => b.num(r, MONTH_START + k, row.byMonth?.[m] ?? 0, { fmt: FMT.body }));
      total = `SUM(${addr(r, MONTH_START)}:${addr(r, MONTH_START + n - 1)})`;
      engineTotal = months.reduce((s, m) => s + (row.byMonth?.[m] ?? 0), 0);
    } else {
      fyCols.forEach(({ c, col }) => b.num(r, col, row.byFiscalYear[c.fiscalYear!] ?? 0, { fmt: FMT.body }));
      total = fyCols.map(({ col }) => addr(r, col)).join("+") || "0";
      engineTotal = fyCols.reduce((s, { c }) => s + (row.byFiscalYear[c.fiscalYear!] ?? 0), 0);
    }
    const raw = `INDEX(${rawPnlTotal},MATCH(${addr(r, 2)},${rawPnlRows(1)},0))`;
    const periods = n ? { first: MONTH_START, last: MONTH_START + n - 1 } : { first: fyCols[0]!.col, last: fyCols.at(-1)!.col };
    const count = periods.last - periods.first + 1;
    writeTie(b, r, tie, total, raw, engineTotal, row.account, { ...periods, rawRow: `${S("rawPnl")}$C$${4 + i}:$${colLetter(2 + count)}$${4 + i}` });
  });

  // Balance-sheet accounts: one row per account, one column per statement date, tied to Raw - Balance Sheet date by date.
  const bsSection = lastRow + 2;
  const bsHeader = bsSection + 1;
  const bsFirst = bsHeader + 1;
  const bsLast = bsFirst + bsRows.length - 1;
  b.row("bsHeader", bsHeader);
  b.row("bsFirst", bsFirst);
  b.row("bsLast", bsLast);
  b.section(bsSection, "Balance sheet accounts ($)", [[2, 7]]);
  headers.slice(0, 4).forEach((h, i) => header(bsHeader, 2 + i, h, true));
  for (let c = 6; c <= 7; c++) b.cell(bsHeader, c, { style: "header", v: null, role: "text" });
  bsDates.forEach((m, i) => {
    // Statement dates are derived from Assumptions like every other period label: a fiscal year-end from the latest
    // fiscal year, any other month-end from AsOfDate.
    const yearEnd = Number(m.slice(5)) === model.fiscalYearEndMonth;
    const k = latestFyOf(model) - fiscalYearOfMonth(m, model.fiscalYearEndMonth);
    const offset = monthOffset(model.assumptions!.asOfMonth, m);
    const f = yearEnd ? `EOMONTH(DATE(${LATEST_FY}-${k},${FYE},1),-1)+1` : `EOMONTH(${ASOF},${offset - 1})+1`;
    b.formula(bsHeader, periodStart + i, f, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(m), label: `bs date ${m}` });
  });
  const rawBsRows = (c: number) => `${S("rawBs")}$${colLetter(c)}$4:$${colLetter(c)}$${3 + bsRows.length}`;
  bsRows.forEach((row, i) => {
    const r = bsFirst + i;
    [row.account, SOURCE_LABELS[row.source], row.category, bsLabel(row.category)].forEach((v, k) => b.text(r, 2 + k, v));
    bsDates.forEach((m, k) => b.num(r, periodStart + k, row.byMonth[m] ?? 0, { fmt: FMT.body }));
    const dates = bsDates.map((_, k) => addr(r, periodStart + k));
    const raw = bsDates.map((_, k) => `SUMIFS(${rawBsRows(3 + k)},${rawBsRows(1)},${addr(r, 2)})`).join("+");
    writeTie(b, r, tie, dates.join("+") || "0", raw || "0", bsDates.reduce((s, m) => s + (row.byMonth[m] ?? 0), 0), row.account, { first: periodStart, last: periodStart + bsDates.length - 1, rawRow: `${S("rawBs")}$C$${4 + i}:$${colLetter(2 + bsDates.length)}$${4 + i}` });
  });
  const lastPrinted = Math.max(bsLast, lastRow);

  // Period columns: SUMIFS of the row's months over helper windows that sit directly below the last printed row (guide 5.2).
  if (n) {
    const helpers = writePeriodHelpers(b, { ...periodLayout(model, periodStart), cols: hist.map((c, i) => ({ column: c, col: periodStart + i })) } as PeriodLayout, model, lastPrinted + 2);
    const monthHeaderRow = `$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + n - 1)}$6`;
    rows.forEach((row, i) => {
      const r = firstRow + i;
      hist.forEach((c, k) => {
        const col = periodStart + k;
        const f = sumifsFormula({ valuesRow: `$${colLetter(MONTH_START)}${r}:$${colLetter(MONTH_START + n - 1)}${r}`, monthsRow: monthHeaderRow, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) });
        b.formula(r, col, f, { fmt: FMT.body, expect: model.periods[c.key]!.accountLines[row.account] ?? 0, label: `${row.account} ${c.label}` });
      });
    });
  }
  b.cf({ ref: range(firstRow, tie.diff, lastPrinted, tie.diff), formula: `ROUND(${addr(firstRow, tie.diff)},3)<>0`, font: { color: COLOR.pending } });
  b.cf({ ref: range(firstRow, tie.status, lastPrinted, tie.status), formula: `${addr(firstRow, tie.status)}="CHECK"`, font: { color: COLOR.pending, bold: true } });

  // Pages: the mapping, the periods (with the statement dates), each fiscal year of months, then the tie; column B repeats.
  const pages = [range2(2, 8), [2, ...range2(periodStart, monthsFrom - 1)], ...fyGroups.map((g) => [2, ...range2(g.from, g.to)]), [2, ...range2(tie.databook - 1, lastCol)]];
  b.print({
    area: `B2:${addr(lastPrinted, lastCol)}`,
    landscape: true,
    scale: fitScale(b.plan, pages, lastPrinted),
    titlesRow: "5:6",
    titlesCol: "B:B",
    colBreaks: [8, monthsFrom - 1, ...fyGroups.map((g) => g.to)],
  });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

/** One row of the tie-to-raw block: the Databook's total, the raw export's, the difference and its status at a $1 tolerance (guide 5.2). */
/**
 * The difference is taken period by period, not on the totals, so errors in
 * two months (or two statement dates) that offset cannot pass: the root-sum-
 * square of the differences in `periods` against the same periods of the raw
 * export, whose row `rawRow` holds the same account in the same order.
 */
function writeTie(b: SheetBuilder, r: number, tie: ReturnType<typeof databookTieCols>, total: string, raw: string, expect: number, account: string, periods: { first: number; last: number; rawRow: string }): void {
  b.formula(r, tie.databook, total, { fmt: FMT.body, expect, label: `databook total ${account}` });
  b.formula(r, tie.raw, raw, { fmt: FMT.body, expect, label: `raw total ${account}` });
  b.formula(r, tie.diff, `SQRT(SUMXMY2(${addr(r, periods.first)}:${addr(r, periods.last)},${periods.rawRow}))`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `tie to raw ${account}` });
  b.formula(r, tie.status, `IF(ABS(${addr(r, tie.diff)})<=1,"TIES OUT","CHECK")`, { role: "text", align: { horizontal: "center" }, expect: "TIES OUT", label: `tie status ${account}` });
}

function latestFyOf(model: ModelOutput): number {
  return model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).map((c) => c.fiscalYear!).sort((a, b) => b - a)[0]!;
}

/** Months from `a` to `b` (negative when `b` is earlier). */
export function monthOffset(a: MonthKey, b: MonthKey): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5));
}

function fiscalYearOfMonth(m: MonthKey, fye: number): number {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5));
  return mo <= fye ? y : y + 1;
}

function bsLabel(category: string): string {
  const labels: Record<string, string> = {
    cash: "Cash",
    accounts_receivable: "Accounts Receivable",
    inventory: "Inventory",
    other_current_assets: "Prepaid and Other Current Assets",
    fixed_assets_net: "Fixed Assets, Net",
    other_assets: "Other Long-Term Assets",
    accounts_payable: "Accounts Payable",
    other_current_liabilities: "Accrued and Other Current Liabilities",
    debt: "Debt",
    equity: "Total Equity",
  };
  return labels[category] ?? category;
}

// --- Mapping ------------------------------------------------------------------------------------

export function planMapping(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("mapping", SHEET.mapping);
  // Statement, source and file are the same for every account an export holds: each group of rows sits under a
  // section row naming them, so the table fits one page wide at full scale and every row stays one line tall.
  const headers = ["Account (as exported)", "Section", "AMB Category", "Summary Line", "Personal?", "Adj. Ref", "Mapped by"];
  const widths = [36, 30, 32, 32, 9, 8, 10];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  const lastCol = 1 + headers.length;
  const mappedByCol = lastCol;
  b.anatomy({ subtitle: "Account Mapping: Exported Account to AMB Category and Summary Line", lastCol });
  b.tier1(5, [{ from: 2, to: lastCol, label: "Mapping" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: "left" } }));
  let r = 8;
  let group = "";
  // A balance-sheet section path ("Liabilities > Current Liabilities > ...") is longer than its column: it wraps, never clips.
  const put = (values: string[]) =>
    values.forEach((v, i) => {
      const cell = b.text(r, 2 + i, v);
      if (i > 0 && wrappedLines(v, widths[i]!) > 1) cell.align = { ...cell.align, wrap: true };
    });
  const groupRow = (statement: string, source: keyof typeof SOURCE_LABELS, file: string) => {
    const label = `${statement}: ${file} (${SOURCE_LABELS[source]})`;
    if (label === group) return;
    if (group) r++;
    group = label;
    b.section(r++, label, [[2, lastCol]]);
  };
  for (const row of model.databook?.pnl ?? []) {
    groupRow("P&L", row.source, row.file);
    put([row.account, row.section ?? "", IS_LABELS[row.category], row.summaryLine, row.personal ? "Personal?" : "", row.adjustmentRef ? `[${row.adjustmentRef}]` : "", row.mappedBy === "override" ? "Override" : row.mappedBy]);
    if (row.mappedBy === "default") b.cell(r, mappedByCol, { fill: COLOR.section });
    r++;
  }
  for (const row of model.databook?.bs ?? []) {
    groupRow("Balance sheet", row.source, row.file);
    put([row.account, row.section ?? "", bsLabel(row.category), bsLabel(row.category), "", "", row.mappedBy]);
    if (row.mappedBy === "default") b.cell(r, mappedByCol, { fill: COLOR.section });
    r++;
  }
  b.note(r + 1, 2, "Note: rows mapped by default (no rule matched) are shaded; confirm them in mapping-overrides.csv, where an Override row comes from.");
  b.print({ area: `B2:${addr(r + 1, lastCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

// --- Raw tabs -----------------------------------------------------------------------------------

/** Column of the Total on Raw - P&L: A account, B section, months from C, then Total. */
export const RAW_PNL_TOTAL_COL = (n: number) => 3 + n;

/** Widest a raw tab's text column grows to hold its longest export label; longer labels wrap. */
const RAW_TEXT_MAX = 60;

/**
 * Raw tabs print landscape, one page wide, over the cells they use (they are
 * values as exported, not output tabs). Their account and section columns
 * widen to the longest label the export holds, up to RAW_TEXT_MAX, and a
 * longer label wraps, so no exported name is cut at the cell edge.
 */
function printRaw(b: SheetBuilder): SheetBuilder {
  let lastRow = 1;
  let lastCol = 1;
  for (const k of b.plan.cells.keys()) {
    const [r, c] = k.split(":").map(Number) as [number, number];
    lastRow = Math.max(lastRow, r);
    lastCol = Math.max(lastCol, c);
  }
  for (const c of [1, 2]) {
    const texts = [...b.plan.cells].filter(([k, spec]) => Number(k.split(":")[0]) >= 4 && Number(k.split(":")[1]) === c && typeof spec.v === "string").map(([, spec]) => spec);
    if (!texts.length) continue;
    const longest = Math.max(...texts.map((spec) => String(spec.v).length));
    const width = Math.min(RAW_TEXT_MAX, Math.max(b.plan.widths.get(c) ?? 0, Math.ceil((longest * 5.8 + 4) / 7)));
    b.width(c, width);
    for (const spec of texts) if (wrappedLines(String(spec.v), width) > 1) spec.align = { ...spec.align, wrap: true };
  }
  b.print({ area: `A1:${addr(lastRow, lastCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "3:3" });
  return b;
}

function rawSheet(key: "rawPnl" | "rawBs" | "rawBank" | "rawCustomers" | "rawPayroll", title: string, headers: string[], widths: number[]): SheetBuilder {
  const b = new SheetBuilder(key, SHEET[key], { output: false, tabColor: COLOR.rawTab, gridlines: true });
  widths.forEach((w, i) => b.width(1 + i, w));
  b.text(1, 1, title, { font: { bold: true, size: 11 } });
  headers.forEach((h, i) => b.cell(3, 1 + i, { style: "header", v: h, role: "text", align: { horizontal: i < 2 ? "left" : "center" } }));
  b.freeze(4, 1);
  return b;
}

export function planRawPnl(model: ModelOutput): SheetBuilder {
  const months = gridMonths(model);
  const rows = model.databook?.pnl ?? [];
  const fyCols = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected);
  const monthHeaders = months.length ? months : fyCols.map((c) => c.label);
  const b = rawSheet("rawPnl", `Raw - P&L as exported (${rows[0] ? SOURCE_LABELS[rows[0].source] : "no source"}: ${rows[0]?.file ?? ""})`, ["Account", "Section", ...monthHeaders.map((m) => (months.length ? "" : m)), "Total"], [40, 24, ...monthHeaders.map(() => 11), 12]);
  if (months.length) months.forEach((m, i) => b.cell(3, 3 + i, { style: "monthHeader", v: serialOfMonthStart(m), fmt: FMT.monthHeader, role: "text" }));
  let r = 4;
  for (const row of rows) {
    b.text(r, 1, row.account);
    b.text(r, 2, row.section ?? "");
    const values = months.length ? months.map((m) => row.byMonth?.[m] ?? 0) : fyCols.map((c) => row.byFiscalYear[c.fiscalYear!] ?? 0);
    values.forEach((v, i) => b.num(r, 3 + i, v, { fmt: FMT.body }));
    b.num(r, 3 + values.length, values.reduce((s, v) => s + v, 0), { fmt: FMT.body });
    r++;
  }
  return printRaw(b);
}

export function planRawBs(model: ModelOutput): SheetBuilder {
  const rows = model.databook?.bs ?? [];
  const dates = [...new Set(rows.flatMap((x) => Object.keys(x.byMonth)))].sort();
  const b = rawSheet("rawBs", `Raw - Balance sheet as exported (${rows[0] ? SOURCE_LABELS[rows[0].source] : "no source"}: ${rows[0]?.file ?? ""})`, ["Account", "Section", ...dates.map(() => "")], [48, 40, ...dates.map(() => 12)]);
  dates.forEach((m, i) => b.cell(3, 3 + i, { style: "monthHeader", v: serialOfMonthStart(m), fmt: FMT.monthHeader, role: "text" }));
  let r = 4;
  for (const row of rows) {
    b.text(r, 1, row.account);
    b.text(r, 2, row.section ?? "");
    dates.forEach((m, i) => b.num(r, 3 + i, row.byMonth[m] ?? 0, { fmt: FMT.body }));
    r++;
  }
  return printRaw(b);
}

export function planRawBank(ds: FinancialDataset): SheetBuilder | undefined {
  if (!ds.depositsByMonth) return undefined;
  const b = rawSheet("rawBank", "Raw - Bank deposits by month (operating deposits; transfers, loan proceeds and owner contributions excluded)", ["Month", "Operating deposits", "Excluded", "Total deposits"], [14, 18, 14, 16]);
  let r = 4;
  for (const m of Object.keys(ds.depositsByMonth).sort()) {
    const d = ds.depositsByMonth[m]!;
    b.cell(r, 1, { v: serialOfMonthStart(m), fmt: FMT.monthHeader, role: "input" });
    b.num(r, 2, d.amount, { fmt: FMT.body });
    b.num(r, 3, d.excluded, { fmt: FMT.body });
    b.num(r, 4, d.amount + d.excluded, { fmt: FMT.body });
    r++;
  }
  return printRaw(b);
}

/** Column map of Raw - Customers, shared with the retention formulas. */
export const RAW_CUSTOMER_COLS = { code: 1, name: 2, type: 3, segment: 4, start: 5, end: 6, lossReason: 7, contractBasis: 8, firstFy: 9 } as const;

/**
 * Fiscal-year revenue columns of Raw - Customers: the model's fiscal years and
 * any later year the list carries (the partial current year), so an LTM that
 * straddles the year-end prorates the same years the engine does.
 */
export function customerYears(years: number[], list?: FinancialDataset["customers"]): number[] {
  const first = years[0] ?? 0;
  const last = years[years.length - 1] ?? 0;
  const carried = new Set([...(list?.customers ?? []), ...(list?.residual ? [list.residual] : [])].flatMap((c) => Object.keys(c.revenueByFiscalYear).map(Number)));
  // The year before the first column gives that year's dollar roll-forward its prior year.
  return [...(carried.has(first - 1) ? [first - 1] : []), ...years, ...[...carried].filter((y) => y > last).sort((a, b) => a - b)];
}

export function planRawCustomers(ds: FinancialDataset, years: number[]): SheetBuilder | undefined {
  const list = ds.customers;
  if (!list) return undefined;
  const b = rawSheet("rawCustomers", `Raw - Customers (${list.source}: ${list.file}). Names stay on this tab only.`, ["Code", "Name", "Type", "Segment", "Start date", "End date", "Loss reason", "Contract basis", ...years.map((y) => `FY${y} revenue`)], [9, 30, 18, 14, 11, 11, 14, 18, ...years.map(() => 13)]);
  let r = 4;
  const date = (d?: string) => (d ? { v: excelSerialOf(d), fmt: FMT.date, role: "input" as const } : { v: null });
  for (const c of list.customers) {
    b.text(r, 1, c.id);
    b.text(r, 2, c.name ?? "");
    b.text(r, 3, c.type ?? "");
    b.text(r, 4, c.segment ?? "");
    b.cell(r, 5, date(c.startDate));
    b.cell(r, 6, date(c.endDate));
    b.text(r, 7, c.lossReason ?? "");
    b.text(r, 8, c.contractBasis ?? "");
    years.forEach((y, i) => b.num(r, RAW_CUSTOMER_COLS.firstFy + i, c.revenueByFiscalYear[y] ?? 0, { fmt: FMT.body }));
    r++;
  }
  b.row("lastCustomer", r - 1);
  if (list.residual) {
    b.text(r, 1, "Residual");
    b.text(r, 2, list.residual.label);
    years.forEach((y, i) => b.num(r, RAW_CUSTOMER_COLS.firstFy + i, list.residual!.revenueByFiscalYear[y] ?? 0, { fmt: FMT.body }));
    b.row("residual", r);
    r++;
  }
  return printRaw(b);
}

export const RAW_PAYROLL_COLS = { id: 1, name: 2, role: 3, department: 4, owner: 5, management: 6, hire: 7, termination: 8, terminationType: 9, payBasis: 10, fte: 11, firstWages: 12 } as const;

/** `years` are the model's fiscal-year columns, so the Headcount tab's column offsets land on the same years. */
export function planRawPayroll(ds: FinancialDataset, years: number[]): SheetBuilder | undefined {
  const reg = ds.payroll;
  if (!reg) return undefined;
  const b = rawSheet(
    "rawPayroll",
    `Raw - Payroll register (${reg.source}: ${reg.file}). Names stay on this tab only.`,
    ["ID", "Name", "Role", "Department", "Owner", "Management", "Hire date", "Termination date", "Termination type", "Pay basis", "FTE", ...years.map((y) => `FY${y} wages`), ...years.map((y) => `FY${y} employer costs`)],
    [7, 22, 24, 16, 8, 11, 11, 13, 14, 20, 6, ...years.map(() => 13), ...years.map(() => 13)],
  );
  let r = 4;
  for (const e of reg.employees) {
    b.text(r, 1, e.id);
    b.text(r, 2, e.name ?? "");
    b.text(r, 3, e.role);
    b.text(r, 4, e.department);
    b.text(r, 5, e.isOwner ? "Yes" : "No");
    b.text(r, 6, e.isManagement ? "Yes" : "No");
    b.cell(r, 7, { v: excelSerialOf(e.hireDate), fmt: FMT.date, role: "input" });
    b.cell(r, 8, e.terminationDate ? { v: excelSerialOf(e.terminationDate), fmt: FMT.date, role: "input" } : { v: null });
    b.text(r, 9, e.terminationType ?? "");
    b.text(r, 10, e.payBasis);
    b.num(r, 11, e.fte, { fmt: FMT.oneDp });
    years.forEach((y, i) => b.num(r, RAW_PAYROLL_COLS.firstWages + i, e.wagesByFiscalYear[y] ?? 0, { fmt: FMT.body }));
    years.forEach((y, i) => b.num(r, RAW_PAYROLL_COLS.firstWages + years.length + i, e.employerCostsByFiscalYear[y] ?? 0, { fmt: FMT.body }));
    r++;
  }
  b.row("lastEmployee", r - 1);
  return printRaw(b);
}

function excelSerialOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}
