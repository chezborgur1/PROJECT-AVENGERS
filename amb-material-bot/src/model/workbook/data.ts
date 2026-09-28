// The data tabs behind the `Data -->` divider (guide 5.1 rows 26-30):
// Monthly P&L (the category × month grid every period column reads),
// Databook (account × period with mapping columns and the tie to the raw
// export), Mapping, and the Raw tabs (values only, as exported).

import { IS_CATEGORIES, IS_LABELS, SOURCE_LABELS, type FinancialDataset, type IsCategory, type MonthKey } from "../../domain/financials.ts";
import { addr, colLetter, range, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { A } from "./assumptionsTab.ts";
import { applyPeriodWidths, gridMonths, LATEST_FY, FYE, periodLayout, S, SHEET, serialOfMonthStart, sumifsFormula, valueSpans, writeMonthHeaders, writePeriodHelpers, type PeriodLayout } from "./layout.ts";

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
  return rows;
}

function isContra(model: ModelOutput, account: string): boolean {
  return !!model.databook?.pnl.find((r) => r.account === account && r.category === "revenue" && Object.values(r.byFiscalYear).every((v) => v <= 0) && Object.values(r.byFiscalYear).some((v) => v < 0));
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

export function planDivider(): SheetBuilder {
  const b = new SheetBuilder("divider", SHEET.divider, { output: false, tabColor: COLOR.dividerTab });
  b.width(1, WIDTH.gutter);
  b.width(2, 60);
  b.text(2, 2, "Data tabs follow: the monthly grid, the Databook, the mapping and the raw exports.", { style: "note" });
  return b;
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

  b.tier1(5, [...l.groups, { from: firstMonthCol, to: lastMonthCol, label: "Monthly ($000s)" }, { from: notesCol, to: notesCol, label: "Notes" }]);
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
  const dbCategory = `${S("databook")}$E$${dbFirst}:$E$${dbLast}`;
  const dbAccount = `${S("databook")}$B$${dbFirst}:$B$${dbLast}`;
  const adjFirst = rowOf("adjustments", "tierFirst");
  const adjLast = rowOf("adjustments", "tierLast");
  const adjMonthFirst = `$${colLetter(ADJ_MONTH_START)}`;
  const series = model.monthly.series;

  for (const spec of rows) {
    const rr = b.r(spec.key);
    const next = rows[rows.indexOf(spec) + 1];
    stylePnlRow(b, rr, spec, [...spans, monthSpan], next?.kind === "margin");
    if (spec.kind === "section" || spec.kind === "spacer") continue;
    const vs = valueStyle(spec.kind);
    const at = (key: string) => addr(rr, 0, {}).replace(/^[A-Z]*/, "") && "";
    void at;
    // Month cells first, then the period block sums them.
    months.forEach((m, i) => {
      const col = firstMonthCol + i;
      const cell = addr(rr, col);
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
        const contraAccounts = model.databook!.pnl.filter((x) => x.category === "revenue" && isContra(model, x.account)).map((x) => x.account);
        f = contraAccounts.map((acc) => `SUMIFS(${S("databook")}${colL}$${dbFirst}:${colL}$${dbLast},${dbAccount},"${acc.replace(/"/g, '""')}")`).join("+") + `/${K}`;
        expect = contraAccounts.reduce((s, acc) => s + (series[`rev:${acc}`]?.[i] ?? 0), 0) / K;
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
        const adjMonths = (row: string) => `${S("adjustments")}${adjMonthFirst}$${row}:$${colLetter(ADJ_MONTH_START + n - 1)}$${row}`;
        f = `INDEX(${adjMonths(adjRow)},MATCH(${colL}$6,${adjMonths("6")},0))`;
        expect = series[spec.key]![i]! / K;
        void adjFirst;
        void adjLast;
      } else if (spec.calc) {
        f = spec.calc(inSheet);
        expect = series[spec.key === "revenue" ? "revenue" : spec.key]![i]! / K;
      }
      if (f !== undefined) b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect, label: `${spec.key} ${m}` });
      void cell;
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
        const prior = priorColumn(model, column, l);
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
    if (l.deltas) writeDeltas(b, rr, l, vs.fmt === FMT.pct1 || vs.fmt === FMT.pct);
  }
  // Tie-out: net income on the grid against the Databook, per month (guide 5.2, V51 row 71).
  b.text(tieRow, 2, "Tie Out: Net Income less Databook", { style: "check" });
  const dbSign = IS_CATEGORIES.map((c) => `${c === "revenue" || c === "other_income" ? "" : "-"}SUMIFS(${S("databook")}COLX$${dbFirst}:COLX$${dbLast},${dbCategory},"${c}")`).join("");
  months.forEach((m, i) => {
    const col = firstMonthCol + i;
    const colL = colLetter(col);
    const f = `${colL}${b.r("net_income")}-(${dbSign.replace(/COLX/g, colL)})/${K}`;
    b.formula(tieRow, col, f, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `tie out ${m}` });
  });
  b.checkCf(tieRow, firstMonthCol, lastMonthCol);
  b.note(lastPrinted + 1, 2, "Note: category rows are SUMIFS of the Databook by AMB category; revenue lines by account; ladder rungs read the Adjustments tier totals by month. Tie Out must equal zero.");

  const lastCol = notesCol;
  b.print({
    area: `B2:${addr(lastPrinted, lastCol)}`,
    landscape: true,
    fitToWidth: 0,
    fitToHeight: 1,
    titlesRow: "5:6",
    titlesCol: "B:B",
    colBreaks: [l.lastValueCol + 1, ...months.map((_, i) => firstMonthCol + i).filter((c, i) => (i + 1) % 12 === 0 && i + 1 < n)],
  });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  b.toggleRanges = undefined;
  return b;
}

/** The column one year earlier in the same group, for y/y growth. */
export function priorColumn(model: ModelOutput, column: ModelOutput["columns"][number], l: PeriodLayout): { column: ModelOutput["columns"][number]; col: number } | undefined {
  if (column.ref.kind === "fiscal_year") {
    const prev = l.cols.find((c) => c.column.ref.kind === "fiscal_year" && c.column.fiscalYear === column.fiscalYear! - 1);
    return prev;
  }
  if ((column.ref.kind === "ytd" || column.ref.kind === "ltm") && !column.priorYear) return l.cols.find((c) => c.column.ref.kind === column.ref.kind && c.column.priorYear);
  return undefined;
}

/** PF vs. LTM delta columns: Delta ($) and Delta (%). */
export function writeDeltas(b: SheetBuilder, r: number, l: PeriodLayout, isRatio: boolean): void {
  if (!l.deltas) return;
  const pf = l.cols.find((c) => c.column.ref.kind === "pf");
  const ltm = l.cols.find((c) => c.column.ref.kind === "ltm" && !c.column.priorYear);
  if (!pf || !ltm) return;
  if (isRatio) {
    b.na(r, l.deltas.dollar, "", { style: "line" });
    return;
  }
  b.formula(r, l.deltas.dollar, `${addr(r, pf.col)}-${addr(r, ltm.col)}`, { style: "line", fmt: FMT.body, label: `delta $ row ${r}` });
  b.formula(r, l.deltas.pct, `IFERROR(${addr(r, pf.col)}/${addr(r, ltm.col)}-1,"n.a.")`, { style: "ratio", fmt: FMT.pct, label: `delta % row ${r}` });
}

// --- Databook -----------------------------------------------------------------------------------

/** Adjustments month columns start here (after B:L text, M spacer, N:U periods, V spacer). */
export const ADJ_MONTH_START = 23;

export function planDatabook(ctx: TabContext, ds: FinancialDataset | undefined): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("databook", SHEET.databook);
  const months = gridMonths(model);
  const n = months.length;
  const rows = model.databook?.pnl ?? [];
  const hist = model.columns.filter((c) => !c.projected);
  const periodStart = 9;
  const widths = [40, 24, 14, 22, 30, 9, 9];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  for (let c = periodStart; c < MONTH_START; c++) b.width(c, WIDTH.value);
  if (n) {
    b.widths(MONTH_START, MONTH_START + n - 1, WIDTH.value);
    b.outlineCols(MONTH_START, MONTH_START + n - 1, 1);
  }
  b.outlineCols(3, 8, 1);
  const tieCol = n ? MONTH_START + n + 1 : periodStart + hist.length + 1;
  const lastCol = tieCol + 1;
  b.spacerCol(tieCol - 1);
  b.width(tieCol, 12);
  b.width(lastCol, 12);
  b.anatomy({ subtitle: "Databook: account × period ($)", lastCol, toggleCol: periodStart + Math.max(hist.length, 1) - 1, masterToggle: ctx.masterToggle });
  b.text(3, periodStart + Math.max(hist.length, 1) - 2, "Print", { align: { horizontal: "right" } });

  const headers = ["Account (as exported)", "Section", "Source", "AMB Category", "Summary Line", "Personal?", "Adjustment Ref"];
  b.tier1(5, [
    { from: 2, to: 8, label: "Mapping" },
    ...(hist.length ? [{ from: periodStart, to: periodStart + hist.length - 1, label: "Periods ($)" }] : []),
    ...(n ? [{ from: MONTH_START, to: MONTH_START + n - 1, label: "Monthly ($)" }] : []),
    { from: tieCol, to: lastCol, label: "Tie to raw" },
  ]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: "left" } }));
  hist.forEach((c, i) => b.cell(6, periodStart + i, { style: "header", v: c.label, role: "text" }));
  if (n) writeMonthHeaders(b, 6, MONTH_START, months);
  b.cell(6, tieCol, { style: "header", v: "Databook ($)", role: "text" });
  b.cell(6, lastCol, { style: "header", v: "Diff to raw", role: "text" });

  let r = DATABOOK_FIRST_ROW;
  const firstRow = r;
  rows.forEach((row, idx) => {
    b.text(r, 2, row.account);
    b.text(r, 3, row.section ?? "");
    b.text(r, 4, SOURCE_LABELS[row.source]);
    b.text(r, 5, row.category);
    b.text(r, 6, row.summaryLine);
    b.text(r, 7, row.personal ? "Personal?" : "");
    b.text(r, 8, row.adjustmentRef ? `[${row.adjustmentRef}]` : "");
    if (n) {
      months.forEach((m, i) => b.num(r, MONTH_START + i, row.byMonth?.[m] ?? 0, { fmt: FMT.body }));
      const total = `SUM(${addr(r, MONTH_START)}:${addr(r, MONTH_START + n - 1)})`;
      const engineTotal = months.reduce((s, m) => s + (row.byMonth?.[m] ?? 0), 0);
      b.formula(r, tieCol, total, { fmt: FMT.body, expect: engineTotal, label: `databook total ${row.account}` });
      b.formula(r, lastCol, `${addr(r, tieCol)}-INDEX(${S("rawPnl")}$${colLetter(RAW_PNL_TOTAL_COL(n))}:$${colLetter(RAW_PNL_TOTAL_COL(n))},MATCH(${addr(r, 2)},${S("rawPnl")}$A:$A,0))`, {
        style: "check",
        fmt: FMT.check,
        expect: 0,
        tol: 1e-6,
        label: `tie to raw ${row.account}`,
      });
    } else {
      hist.forEach((c, i) => {
        if (c.ref.kind === "fiscal_year") b.num(r, periodStart + i, row.byFiscalYear[c.fiscalYear!] ?? 0, { fmt: FMT.body });
      });
      const fyCols = hist.map((c, i) => ({ c, i })).filter((x) => x.c.ref.kind === "fiscal_year");
      b.formula(r, tieCol, `SUM(${addr(r, periodStart)}:${addr(r, periodStart + hist.length - 1)})`, { fmt: FMT.body, expect: fyCols.reduce((s, x) => s + (row.byFiscalYear[x.c.fiscalYear!] ?? 0), 0), label: `databook total ${row.account}` });
      b.formula(r, lastCol, `${addr(r, tieCol)}-INDEX(${S("rawPnl")}$${colLetter(RAW_PNL_TOTAL_COL(0) + fyCols.length)}:$${colLetter(RAW_PNL_TOTAL_COL(0) + fyCols.length)},MATCH(${addr(r, 2)},${S("rawPnl")}$A:$A,0))`, {
        style: "check",
        fmt: FMT.check,
        expect: 0,
        tol: 1e-6,
        label: `tie to raw ${row.account}`,
      });
    }
    void idx;
    r++;
  });
  const lastRow = r - 1;
  b.row("first", firstRow);
  b.row("last", lastRow);
  // Period columns: SUMIFS of the row's months over the helper windows.
  if (n) {
    const helpers = writePeriodHelpers(b, { ...periodLayout(model, periodStart), cols: hist.map((c, i) => ({ column: c, col: periodStart + i })) } as PeriodLayout, model, lastRow + 3);
    const monthHeaderRow = `$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + n - 1)}$6`;
    rows.forEach((row, idx) => {
      const rr = firstRow + idx;
      hist.forEach((c, i) => {
        const col = periodStart + i;
        const f = sumifsFormula({ valuesRow: `$${colLetter(MONTH_START)}${rr}:$${colLetter(MONTH_START + n - 1)}${rr}`, monthsRow: monthHeaderRow, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) });
        b.formula(rr, col, f, { fmt: FMT.body, expect: model.periods[c.key]!.accountLines[row.account] ?? 0, label: `${row.account} ${c.label}` });
      });
    });
  }
  const bsFirstRow = lastRow + (n ? 6 : 3);
  // Balance-sheet accounts: one row per account, one column per statement date.
  const bsRows = model.databook?.bs ?? [];
  const bsDates = [...new Set(bsRows.flatMap((x) => Object.keys(x.byMonth)))].sort();
  b.row("bsHeader", bsFirstRow - 1);
  b.section(bsFirstRow - 2, "Balance sheet accounts ($)", [[2, 8]]);
  headers.slice(0, 5).forEach((h, i) => b.cell(bsFirstRow - 1, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: "left" } }));
  for (let c = 7; c <= 8; c++) b.cell(bsFirstRow - 1, c, { style: "header", v: null, role: "text" });
  bsDates.forEach((m, i) => {
    const col = periodStart + i;
    const k = model.assumptions ? latestFyOf(model) - fiscalYearOfMonth(m, model.fiscalYearEndMonth) : 0;
    const isFye = m.endsWith(`-${String(model.fiscalYearEndMonth).padStart(2, "0")}`);
    const f = isFye ? `EOMONTH(DATE(${LATEST_FY}-${k},${FYE},1),-1)+1` : `DATE(${m.slice(0, 4)},${Number(m.slice(5))},1)`;
    b.formula(bsFirstRow - 1, col, f, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(m), label: `bs date ${m}` });
  });
  b.row("bsFirst", bsFirstRow);
  let rb = bsFirstRow;
  for (const row of bsRows) {
    b.text(rb, 2, row.account);
    b.text(rb, 3, row.section ?? "");
    b.text(rb, 4, SOURCE_LABELS[row.source]);
    b.text(rb, 5, row.category);
    b.text(rb, 6, bsLabel(row.category));
    bsDates.forEach((m, i) => b.num(rb, periodStart + i, row.byMonth[m] ?? 0, { fmt: FMT.body }));
    rb++;
  }
  b.row("bsLast", rb - 1);
  b.row("bsDatesFrom", periodStart);
  b.print({ area: `B2:${addr(Math.max(rb - 1, lastRow), lastCol)}`, landscape: true, fitToWidth: 0, fitToHeight: 1, titlesRow: "5:6", titlesCol: "B:B", colBreaks: n ? [MONTH_START - 1] : [] });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  void ds;
  return b;
}

function latestFyOf(model: ModelOutput): number {
  return model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).map((c) => c.fiscalYear!).sort((a, b) => b - a)[0]!;
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
  const headers = ["Account (as exported)", "Statement", "Section", "AMB Category", "Summary Line", "Personal?", "Adjustment Ref", "Source", "File", "Mapped by"];
  const widths = [40, 12, 26, 22, 30, 9, 12, 20, 34, 10];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  const lastCol = 1 + headers.length;
  b.anatomy({ subtitle: "Account mapping: exported account to AMB category and summary line", lastCol });
  b.tier1(5, [{ from: 2, to: lastCol, label: "Mapping" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: "left" } }));
  let r = 8;
  for (const row of model.databook?.pnl ?? []) {
    [row.account, "P&L", row.section ?? "", IS_LABELS[row.category], row.summaryLine, row.personal ? "Personal?" : "", row.adjustmentRef ? `[${row.adjustmentRef}]` : "", SOURCE_LABELS[row.source], row.file, row.mappedBy === "override" ? "Override (mapping-overrides.csv)" : row.mappedBy].forEach((v, i) => b.text(r, 2 + i, v));
    if (row.mappedBy === "default") b.cell(r, 11, { fill: COLOR.section });
    r++;
  }
  for (const row of model.databook?.bs ?? []) {
    [row.account, "Balance sheet", row.section ?? "", bsLabel(row.category), bsLabel(row.category), "", "", SOURCE_LABELS[row.source], row.file, row.mappedBy].forEach((v, i) => b.text(r, 2 + i, v));
    if (row.mappedBy === "default") b.cell(r, 11, { fill: COLOR.section });
    r++;
  }
  b.note(r + 1, 2, "Note: rows mapped by default (no rule matched) are shaded; confirm them in mapping-overrides.csv.");
  b.print({ area: `B2:${addr(r + 1, lastCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

// --- Raw tabs -----------------------------------------------------------------------------------

/** Column of the Total on Raw - P&L: A account, B section, months from C, then Total. */
export const RAW_PNL_TOTAL_COL = (n: number) => 3 + n;

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
    values.forEach((v, i) => b.num(r, 3 + i, v, { fmt: FMT.rawCents }));
    b.num(r, 3 + values.length, values.reduce((s, v) => s + v, 0), { fmt: FMT.rawCents });
    r++;
  }
  return b;
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
    dates.forEach((m, i) => b.num(r, 3 + i, row.byMonth[m] ?? 0, { fmt: FMT.rawCents }));
    r++;
  }
  return b;
}

export function planRawBank(ds: FinancialDataset): SheetBuilder | undefined {
  if (!ds.depositsByMonth) return undefined;
  const b = rawSheet("rawBank", "Raw - Bank deposits by month (operating deposits; transfers, loan proceeds and owner contributions excluded)", ["Month", "Operating deposits", "Excluded", "Total deposits"], [14, 18, 14, 16]);
  let r = 4;
  for (const m of Object.keys(ds.depositsByMonth).sort()) {
    const d = ds.depositsByMonth[m]!;
    b.cell(r, 1, { v: serialOfMonthStart(m), fmt: FMT.monthHeader, role: "input" });
    b.num(r, 2, d.amount, { fmt: FMT.rawCents });
    b.num(r, 3, d.excluded, { fmt: FMT.rawCents });
    b.num(r, 4, d.amount + d.excluded, { fmt: FMT.rawCents });
    r++;
  }
  return b;
}

/** Column map of Raw - Customers, shared with the retention formulas. */
export const RAW_CUSTOMER_COLS = { code: 1, name: 2, type: 3, segment: 4, start: 5, end: 6, lossReason: 7, contractBasis: 8, firstFy: 9 } as const;

export function planRawCustomers(ds: FinancialDataset): SheetBuilder | undefined {
  const list = ds.customers;
  if (!list) return undefined;
  const years = ds.years;
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
    years.forEach((y, i) => b.num(r, RAW_CUSTOMER_COLS.firstFy + i, c.revenueByFiscalYear[y] ?? 0, { fmt: FMT.raw }));
    r++;
  }
  b.row("lastCustomer", r - 1);
  if (list.residual) {
    b.text(r, 1, "Residual");
    b.text(r, 2, list.residual.label);
    years.forEach((y, i) => b.num(r, RAW_CUSTOMER_COLS.firstFy + i, list.residual!.revenueByFiscalYear[y] ?? 0, { fmt: FMT.raw }));
    b.row("residual", r);
    r++;
  }
  return b;
}

export const RAW_PAYROLL_COLS = { id: 1, name: 2, role: 3, department: 4, owner: 5, management: 6, hire: 7, termination: 8, terminationType: 9, payBasis: 10, fte: 11, firstWages: 12 } as const;

export function planRawPayroll(ds: FinancialDataset): SheetBuilder | undefined {
  const reg = ds.payroll;
  if (!reg) return undefined;
  const years = ds.years;
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
    years.forEach((y, i) => b.num(r, RAW_PAYROLL_COLS.firstWages + i, e.wagesByFiscalYear[y] ?? 0, { fmt: FMT.raw }));
    years.forEach((y, i) => b.num(r, RAW_PAYROLL_COLS.firstWages + years.length + i, e.employerCostsByFiscalYear[y] ?? 0, { fmt: FMT.raw }));
    r++;
  }
  b.row("lastEmployee", r - 1);
  return b;
}

function excelSerialOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

export { range, A };
