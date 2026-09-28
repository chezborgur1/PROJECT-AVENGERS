// Geometry every tab planner shares: sheet names (guide 5.1), the standard
// period-column block (5.2), where the months sit on the grid tabs, the
// Assumptions cell map, and the formulas that derive period windows and
// labels from AsOfDate and FYEMonth so nothing is typed twice.

import { monthEndDate, monthLabel, type MonthKey } from "../../domain/financials.ts";
import { excelSerial, firstDayOf, fiscalYearEndKey, latestFullFiscalYear } from "../periods.ts";
import { addr, colLetter, q, rowOf, type CellSpec, type SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput, PeriodColumn } from "../types.ts";

export const SHEET = {
  cover: "Cover",
  contents: "Contents",
  summary: "Summary",
  assumptions: "Assumptions",
  pnl: "P&L Summary",
  ladder: "Adj. EBITDA",
  adjustments: "Adjustments",
  revenue: "Revenue Detail",
  revenueCharts: "Revenue Charts",
  expense: "Expense Detail",
  expenseCharts: "Expense Charts",
  customers: "Customer Overview",
  retention: "Customer Retention",
  retentionCharts: "Retention Charts",
  concentration: "Concentration",
  cohorts: "Cohorts",
  headcount: "Headcount",
  headcountCharts: "Headcount Charts",
  bs: "Balance Sheet",
  nwc: "NWC",
  debtLike: "Debt-Like Items",
  cashFlow: "Cash Flow",
  proofOfCash: "Proof of Cash",
  projections: "Projections",
  opportunities: "Opportunities",
  valuation: "Valuation",
  deal: "Deal Structure",
  sensitivities: "Sensitivities",
  checks: "Checks",
  divider: "Data -->",
  monthly: "Monthly P&L",
  databook: "Databook",
  mapping: "Mapping",
  rawPnl: "Raw - P&L",
  rawBs: "Raw - BS",
  rawBank: "Raw - Bank",
  rawCustomers: "Raw - Customers",
  rawPayroll: "Raw - Payroll",
} as const;
export type SheetKey = keyof typeof SHEET;

/** `'Sheet Name'!` prefix for a formula. */
export const S = (key: SheetKey): string => `${q(SHEET[key])}!`;

// --- Assumptions cell map -----------------------------------------------------------

/** Row keys on Assumptions that other tabs reference; the value sits in column C (`ASSUMPTION_COL`). */
export const ASSUMPTION_COL = 3;
export const A_REF = (rowKey: string, abs = true): string => `${S("assumptions")}${abs ? "$C$" : "C"}${rowOf("assumptions", rowKey)}`;
export const ASOF = A_REF("asOfDate");
export const FYE = A_REF("fyeMonth");
export const LATEST_FY = A_REF("latestFy");
export const FIRST_MONTH = A_REF("firstDataMonth");

// --- Period columns (guide 5.2) --------------------------------------------------------

export interface PeriodCol {
  column: PeriodColumn;
  col: number;
}

export interface PeriodLayout {
  cols: PeriodCol[];
  byKey: Record<string, number>;
  groups: { label: string; from: number; to: number }[];
  spacers: number[];
  /** PF vs. LTM delta columns, when a PF column exists. */
  deltas?: { dollar: number; pct: number };
  notesCol: number;
  firstCol: number;
  /** Last value column (before the spacer that precedes the notes). */
  lastValueCol: number;
  /** Annual-only mode: the Pro Forma Low / Mid / High columns. */
  scenarios?: { low: number; mid: number; high: number };
  /** The column that carries the vertical rule in annual mode (last FY column). */
  ruleCol?: number;
}

/** The standard period block starting at `start` (C by default): FY-2..FY | YTD | LTM, PF | PF vs. LTM | notes. */
export function periodLayout(model: ModelOutput, start = 3, opts: { deltas?: boolean } = {}): PeriodLayout {
  const withDeltas = opts.deltas ?? true;
  const hist = model.columns.filter((c) => !c.projected);
  const cols: PeriodCol[] = [];
  const groups: PeriodLayout["groups"] = [];
  const spacers: number[] = [];
  let col = start;
  const fy = hist.filter((c) => c.group === "Full Year");
  const push = (group: PeriodColumn[], label: string) => {
    if (!group.length) return;
    const from = col;
    for (const c of group) cols.push({ column: c, col: col++ });
    groups.push({ label, from, to: col - 1 });
    spacers.push(col++);
  };
  const fyLabel = model.fiscalYearEndMonth === 12 ? "Full Year" : `Full Year (FYE ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][model.fiscalYearEndMonth - 1]})`;
  push(fy, fyLabel);
  const layout: PeriodLayout = { cols, byKey: {}, groups, spacers, notesCol: 0, firstCol: start, lastValueCol: 0 };
  if (model.granularity === "annual") {
    layout.ruleCol = col - 2;
    const low = col;
    groups.push({ label: "Pro Forma", from: low, to: low + 2 });
    layout.scenarios = { low, mid: low + 1, high: low + 2 };
    col += 3;
    spacers.push(col++);
  } else {
    push(hist.filter((c) => c.group === "YTD"), "YTD");
    const ltm = hist.filter((c) => c.group === "LTM");
    const pf = hist.filter((c) => c.group === "PF");
    if (ltm.length) {
      const from = col;
      for (const c of ltm) cols.push({ column: c, col: col++ });
      groups.push({ label: "LTM", from, to: col - 1 });
      if (pf.length) {
        for (const c of pf) cols.push({ column: c, col: col++ });
        groups.push({ label: "PF", from: col - pf.length, to: col - 1 });
      }
      spacers.push(col++);
      if (pf.length && withDeltas) {
        layout.deltas = { dollar: col, pct: col + 1 };
        groups.push({ label: "PF vs. LTM", from: col, to: col + 1 });
        col += 2;
        spacers.push(col++);
      }
    }
  }
  layout.lastValueCol = col - 2;
  layout.notesCol = col;
  for (const c of cols) layout.byKey[c.column.key] = c.col;
  return layout;
}

/** The Adjustments schedule's period block starts at N (after B:L text and the M spacer); its months follow the block. */
export const ADJ_PERIOD_START = 14;
export function adjustmentsLayout(model: ModelOutput): PeriodLayout {
  return periodLayout(model, ADJ_PERIOD_START, { deltas: false });
}
export function adjMonthStart(model: ModelOutput): number {
  return adjustmentsLayout(model).notesCol;
}

/** Value spans for section fills and key-total boxes: each column group, never the spacers. */
export function valueSpans(l: PeriodLayout): [number, number][] {
  return l.groups.map((g) => [g.from, g.to] as [number, number]);
}

export function applyPeriodWidths(b: SheetBuilder, l: PeriodLayout, labelWidth: number = WIDTH.label): void {
  b.width(1, WIDTH.gutter);
  b.width(2, labelWidth);
  for (let c = l.firstCol; c <= l.lastValueCol; c++) b.width(c, WIDTH.value);
  for (const s of l.spacers) b.spacerCol(s);
  b.width(l.notesCol, WIDTH.notes);
}

// --- Windows derived from Assumptions (guide 5.2) --------------------------------------------

/** Formulas for the first and last day of a column's window, all on AsOfDate, FYEMonth and the latest full fiscal year. */
export function windowFormulas(c: PeriodColumn, model: ModelOutput): { start: string; end: string } {
  const ytdStart = `EOMONTH(DATE(YEAR(${ASOF})-IF(MONTH(${ASOF})>${FYE},0,1),${FYE},1),0)+1`;
  switch (c.ref.kind) {
    case "fiscal_year": {
      const latest = latestFullFiscalYear(model.assumptions!.asOfMonth, model.fiscalYearEndMonth);
      const k = latest - c.ref.fiscalYear;
      const end = `EOMONTH(DATE(${LATEST_FY}${k >= 0 ? "-" : "+"}${Math.abs(k)},${FYE},1),0)`;
      return { start: `EOMONTH(${end},-12)+1`, end };
    }
    case "ytd":
      return c.priorYear ? { start: `EOMONTH(${ytdStart},-13)+1`, end: `EOMONTH(${ASOF},-12)` } : { start: ytdStart, end: `EOMONTH(${ASOF},0)` };
    case "ltm":
      return c.priorYear ? { start: `EOMONTH(${ASOF},-24)+1`, end: `EOMONTH(${ASOF},-12)` } : { start: `EOMONTH(${ASOF},-12)+1`, end: `EOMONTH(${ASOF},0)` };
    case "pf":
      return { start: `EOMONTH(${ASOF},-12)+1`, end: `EOMONTH(${ASOF},0)` };
    default:
      throw new Error(`No window for column kind ${c.ref.kind}`);
  }
}

/** Window formulas of fiscal year `fy`, including a year the model has no column for (the partial current year). */
export function fiscalYearWindow(fy: number, model: ModelOutput): { start: string; end: string } {
  const end = fiscalYearEndKey(fy, model.fiscalYearEndMonth);
  return windowFormulas({ key: `FY${fy}`, ref: { kind: "fiscal_year", fiscalYear: fy }, group: "Full Year", label: `FY${fy}`, start: end, end, months: 12, priorYear: false, projected: false, fiscalYear: fy }, model);
}

/**
 * The row-6 label of a column (guide 5.2): the fiscal year ("FY2025") under
 * Full Year, the end month ("Dec-25") under YTD, LTM and PF, whose group row
 * 5 already names. The column's full label ("LTM Dec-25") is for the CIM.
 */
export function headerLabel(c: PeriodColumn): string {
  return c.ref.kind === "fiscal_year" ? c.label : monthLabel(c.end);
}

/** The label formula of row 6 and the value it must produce (check C16). */
export function labelFormula(c: PeriodColumn, endCell: string): { f: string; expect: string } {
  if (c.ref.kind === "fiscal_year") return { f: `"FY"&YEAR(${endCell})`, expect: headerLabel(c) };
  return { f: `TEXT(${endCell},"mmm-yy")`, expect: headerLabel(c) };
}

export const serialOfMonthStart = (m: MonthKey) => excelSerial(firstDayOf(m));
export const serialOfMonthEnd = (m: MonthKey) => excelSerial(monthEndDate(m));

/**
 * Write the two helper rows ("Period start", "Period end") under a period
 * block and the tier-2 labels above it; returns the helper row numbers.
 */
export function writePeriodHelpers(b: SheetBuilder, l: PeriodLayout, model: ModelOutput, helperRow: number, headerRow = 6): { start: number; end: number } {
  const startRow = helperRow;
  const endRow = helperRow + 1;
  b.text(startRow, 2, "Period start", { style: "helper" });
  b.text(endRow, 2, "Period end", { style: "helper" });
  b.row("helperStart", startRow);
  b.row("helperEnd", endRow);
  for (const { column, col } of l.cols) {
    const w = windowFormulas(column, model);
    b.formula(startRow, col, w.start, { style: "helper", fmt: FMT.date, role: "helper", expect: serialOfMonthStart(column.start), label: `${column.label} start` });
    b.formula(endRow, col, w.end, { style: "helper", fmt: FMT.date, role: "helper", expect: serialOfMonthEnd(column.end), label: `${column.label} end` });
    const lbl = labelFormula(column, addr(endRow, col, { row: true }));
    b.formula(headerRow, col, lbl.f, { style: "header", role: "text", expect: lbl.expect, label: `${column.label} label` });
  }
  return { start: startRow, end: endRow };
}

/** SUMIFS of a row of a monthly grid over the window in a column's helper cells (bounded both ends). */
export function sumifsFormula(o: { valuesRow: string; monthsRow: string; startCell: string; endCell: string }): string {
  return `SUMIFS(${o.valuesRow},${o.monthsRow},">="&${o.startCell},${o.monthsRow},"<="&${o.endCell})`;
}

/**
 * Fiscal-year amounts prorated by the months each fiscal year contributes to
 * a window (DATA_CONTRACT §5.3), for schedule rows that carry no months.
 */
export function prorationFormula(fy: { amountCell: string; startCell: string; endCell: string }[], winStart: string, winEnd: string): string {
  const terms = fy.map((f) => {
    const lo = `MAX(${winStart},${f.startCell})`;
    const hi = `MIN(${winEnd},${f.endCell})`;
    return `${f.amountCell}*MAX(0,(YEAR(${hi})-YEAR(${lo}))*12+MONTH(${hi})-MONTH(${lo})+1)/12`;
  });
  return terms.join("+");
}

// --- Month columns on the grid tabs -----------------------------------------------------------

/** Months of the grid, oldest first. */
export function gridMonths(model: ModelOutput): MonthKey[] {
  return model.monthly?.months.map((m) => m.key) ?? [];
}

/** First-of-month header chain: `=Assumptions!FirstDataMonth`, then `=EOMONTH(prev,0)+1`. */
export function writeMonthHeaders(b: SheetBuilder, row: number, firstCol: number, months: MonthKey[], opts: { style?: "monthHeader" | "helper" } = {}): void {
  months.forEach((m, i) => {
    const col = firstCol + i;
    const f = i === 0 ? FIRST_MONTH : `EOMONTH(${addr(row, col - 1)},0)+1`;
    b.formula(row, col, f, { style: opts.style ?? "monthHeader", fmt: FMT.monthHeader, role: i === 0 ? "link" : "calc", expect: serialOfMonthStart(m), label: `month header ${m}`, font: opts.style === "helper" ? undefined : { color: COLOR.white } });
  });
}

/** Absolute range of a month row across the grid, e.g. `'Monthly P&L'!$Q$8:$AZ$8`. */
export function monthRowRange(sheet: SheetKey, row: string | number, firstCol: number, n: number): string {
  const r = typeof row === "number" ? String(row) : row;
  return `${S(sheet)}$${colLetter(firstCol)}$${r}:$${colLetter(firstCol + n - 1)}$${r}`;
}

export function fyEndKeyOf(fy: number, model: ModelOutput): MonthKey {
  return fiscalYearEndKey(fy, model.fiscalYearEndMonth);
}

/** Absolute column range of a schedule column over the schedule rows, e.g. `Adjustments!$I$8:$I$24`. */
export function scheduleColumn(col: number): string {
  return `${S("adjustments")}$${colLetter(col)}$${rowOf("adjustments", "first")}:$${colLetter(col)}$${rowOf("adjustments", "last")}`;
}

/** SUMIFS of one schedule row (by its bracketed ref) in a period column, accepted rows only. */
export function scheduleRef(ref: string, periodCol: number): string {
  return `SUMIFS(${scheduleColumn(periodCol)},${scheduleColumn(ADJ_REF_COL)},"[${ref}]",${scheduleColumn(ADJ_STATUS_COL)},"Accepted")`;
}

export const ADJ_REF_COL = 2;
export const ADJ_TIER_COL = 4;
export const ADJ_CATEGORY_COL = 5;
export const ADJ_BASIS_COL = 6;
export const ADJ_STATUS_COL = 9;
export const ADJ_PNL_LINE_COL = 11;

export type { CellSpec };
