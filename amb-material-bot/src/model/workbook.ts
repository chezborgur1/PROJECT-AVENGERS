// Writes the 3-statement model as an Excel workbook with live formulas.
//
// Conventions (standard for banking models):
//   blue text     hard-coded inputs (historicals, assumptions)
//   black text    formulas
//   green text    links to another sheet
//   yellow fill   key assumptions to review
// Every projection cell is a formula driven by the Assumptions sheet, so
// changing an assumption flows through all three statements.

import ExcelJS from "exceljs";
import path from "node:path";
import { SOURCE_LABELS, IS_LABELS, BS_LABELS, type FinancialDataset } from "../domain/financials.ts";
import type { RequestRow } from "../requests/schema.ts";
import type { Assumptions } from "./assumptions.ts";
import type { ModelResult } from "./engine.ts";
import { describeSources } from "../ingest/merge.ts";

const FONT = "Arial";
const BLUE = "FF0000FF";
const GREEN = "FF008000";
const BLACK = "FF000000";
const NAVY = "FF1F3A5F";
const YELLOW = "FFFFFF00";
const GREY = "FFF2F2F2";

const FMT_USD = '$#,##0;($#,##0);"-"';
const FMT_PCT = '0.0%;(0.0%);"-"';
const FMT_DAYS = '0;(0);"-"';
const FMT_MULT = '0.0"x"';

export const SHEETS = {
  cover: "Cover",
  assumptions: "Assumptions",
  is: "Income Statement",
  recast: "Recast",
  bs: "Balance Sheet",
  cf: "Cash Flow",
  valuation: "Valuation",
  checks: "Checks",
  source: "Source Data",
} as const;

type SheetKey = "assumptions" | "is" | "recast" | "bs" | "cf";

interface RowSpec {
  key: string;
  label: string;
  kind?: "header" | "blank" | "total" | "memo";
  fmt?: string;
}

// ---------------------------------------------------------------------------
// Layouts. Row numbers are fixed up front so any sheet can reference any
// other before it is written.
// ---------------------------------------------------------------------------

const FIRST_ROW = 6; // rows 1-4: title, subtitle, blank, year header; 5 blank

function isLayout(): RowSpec[] {
  return [
    { key: "revenue", label: IS_LABELS.revenue, fmt: FMT_USD },
    { key: "growth", label: "  Growth", kind: "memo", fmt: FMT_PCT },
    { key: "cogs", label: IS_LABELS.cogs, fmt: FMT_USD },
    { key: "gross_profit", label: "Gross profit", kind: "total", fmt: FMT_USD },
    { key: "gross_margin", label: "  Gross margin", kind: "memo", fmt: FMT_PCT },
    { key: "b1", label: "", kind: "blank" },
    { key: "h_opex", label: "Operating expenses", kind: "header" },
    { key: "payroll", label: IS_LABELS.payroll, fmt: FMT_USD },
    { key: "owner_comp", label: IS_LABELS.owner_comp, fmt: FMT_USD },
    { key: "rent", label: IS_LABELS.rent, fmt: FMT_USD },
    { key: "marketing", label: IS_LABELS.marketing, fmt: FMT_USD },
    { key: "other_opex", label: IS_LABELS.other_opex, fmt: FMT_USD },
    { key: "total_opex", label: "Total operating expenses", kind: "total", fmt: FMT_USD },
    { key: "b2", label: "", kind: "blank" },
    { key: "ebitda", label: "EBITDA (reported)", kind: "total", fmt: FMT_USD },
    { key: "ebitda_margin", label: "  EBITDA margin", kind: "memo", fmt: FMT_PCT },
    { key: "da", label: IS_LABELS.depreciation_amortization, fmt: FMT_USD },
    { key: "ebit", label: "EBIT", kind: "total", fmt: FMT_USD },
    { key: "interest", label: IS_LABELS.interest_expense, fmt: FMT_USD },
    { key: "other_income", label: IS_LABELS.other_income, fmt: FMT_USD },
    { key: "other_expense", label: IS_LABELS.other_expense, fmt: FMT_USD },
    { key: "ebt", label: "Pre-tax income", kind: "total", fmt: FMT_USD },
    { key: "tax", label: IS_LABELS.income_tax, fmt: FMT_USD },
    { key: "net_income", label: "Net income", kind: "total", fmt: FMT_USD },
    { key: "net_margin", label: "  Net margin", kind: "memo", fmt: FMT_PCT },
  ];
}

function recastLayout(addbacks: string[]): RowSpec[] {
  return [
    { key: "ebitda", label: "EBITDA (reported)", fmt: FMT_USD },
    { key: "b1", label: "", kind: "blank" },
    { key: "h_owner", label: "Owner compensation normalisation", kind: "header" },
    { key: "owner_comp", label: "  Owner compensation as reported", fmt: FMT_USD },
    { key: "replacement", label: "  Less: market replacement salary", fmt: FMT_USD },
    { key: "owner_norm", label: "Owner compensation adjustment", kind: "total", fmt: FMT_USD },
    { key: "b2", label: "", kind: "blank" },
    { key: "h_addbacks", label: "Seller add-backs", kind: "header" },
    ...addbacks.map((d, i) => ({ key: `ab_${i}`, label: `  ${d}`, fmt: FMT_USD })),
    { key: "total_addbacks", label: "Total add-backs", kind: "total" as const, fmt: FMT_USD },
    { key: "b3", label: "", kind: "blank" as const },
    { key: "adj_ebitda", label: "Adjusted EBITDA", kind: "total" as const, fmt: FMT_USD },
    { key: "adj_margin", label: "  Adjusted EBITDA margin", kind: "memo" as const, fmt: FMT_PCT },
    { key: "plus_salary", label: "Plus: replacement salary (one owner-operator)", fmt: FMT_USD },
    { key: "sde", label: "Seller's discretionary earnings (SDE)", kind: "total" as const, fmt: FMT_USD },
    { key: "sde_margin", label: "  SDE margin", kind: "memo" as const, fmt: FMT_PCT },
  ];
}

function bsLayout(): RowSpec[] {
  return [
    { key: "cash", label: BS_LABELS.cash, fmt: FMT_USD },
    { key: "ar", label: BS_LABELS.accounts_receivable, fmt: FMT_USD },
    { key: "inventory", label: BS_LABELS.inventory, fmt: FMT_USD },
    { key: "oca", label: BS_LABELS.other_current_assets, fmt: FMT_USD },
    { key: "tca", label: "Total current assets", kind: "total", fmt: FMT_USD },
    { key: "fixed", label: BS_LABELS.fixed_assets_net, fmt: FMT_USD },
    { key: "other_assets", label: BS_LABELS.other_assets, fmt: FMT_USD },
    { key: "total_assets", label: "Total assets", kind: "total", fmt: FMT_USD },
    { key: "b1", label: "", kind: "blank" },
    { key: "ap", label: BS_LABELS.accounts_payable, fmt: FMT_USD },
    { key: "ocl", label: BS_LABELS.other_current_liabilities, fmt: FMT_USD },
    { key: "tcl", label: "Total current liabilities", kind: "total", fmt: FMT_USD },
    { key: "debt", label: BS_LABELS.debt, fmt: FMT_USD },
    { key: "total_liabilities", label: "Total liabilities", kind: "total", fmt: FMT_USD },
    { key: "equity", label: BS_LABELS.equity, fmt: FMT_USD },
    { key: "total_le", label: "Total liabilities & equity", kind: "total", fmt: FMT_USD },
    { key: "b2", label: "", kind: "blank" },
    { key: "check", label: "Balance check (should be zero)", kind: "memo", fmt: FMT_USD },
  ];
}

function cfLayout(): RowSpec[] {
  return [
    { key: "net_income", label: "Net income", fmt: FMT_USD },
    { key: "da", label: "Plus: depreciation & amortization", fmt: FMT_USD },
    { key: "d_ar", label: "(Increase) / decrease in receivables", fmt: FMT_USD },
    { key: "d_inv", label: "(Increase) / decrease in inventory", fmt: FMT_USD },
    { key: "d_oca", label: "(Increase) / decrease in other current assets", fmt: FMT_USD },
    { key: "d_ap", label: "Increase / (decrease) in payables", fmt: FMT_USD },
    { key: "d_ocl", label: "Increase / (decrease) in other current liabilities", fmt: FMT_USD },
    { key: "cfo", label: "Cash from operations", kind: "total", fmt: FMT_USD },
    { key: "b1", label: "", kind: "blank" },
    { key: "capex", label: "Capital expenditures", fmt: FMT_USD },
    { key: "cfi", label: "Cash from investing", kind: "total", fmt: FMT_USD },
    { key: "b2", label: "", kind: "blank" },
    { key: "repayment", label: "Debt repayment", fmt: FMT_USD },
    { key: "distributions", label: "Owner distributions", fmt: FMT_USD },
    { key: "cff", label: "Cash from financing", kind: "total", fmt: FMT_USD },
    { key: "b3", label: "", kind: "blank" },
    { key: "net_change", label: "Net change in cash", kind: "total", fmt: FMT_USD },
    { key: "begin_cash", label: "Beginning cash", fmt: FMT_USD },
    { key: "end_cash", label: "Ending cash", kind: "total", fmt: FMT_USD },
  ];
}

const ASSUMPTION_ROWS: { key: keyof Assumptions & string; label: string; fmt: string; noteKey?: string }[] = [
  { key: "revenueGrowth", label: "Revenue growth", fmt: FMT_PCT },
  { key: "cogsPct", label: "COGS, % of revenue", fmt: FMT_PCT },
  { key: "payrollPct", label: "Salaries, wages & benefits, % of revenue", fmt: FMT_PCT },
  { key: "ownerComp", label: "Owner / officer compensation ($)", fmt: FMT_USD },
  { key: "rentPct", label: "Rent & occupancy, % of revenue", fmt: FMT_PCT },
  { key: "marketingPct", label: "Advertising & marketing, % of revenue", fmt: FMT_PCT },
  { key: "otherOpexPct", label: "Other operating expenses, % of revenue", fmt: FMT_PCT },
  { key: "daPct", label: "D&A, % of revenue", fmt: FMT_PCT },
  { key: "capexPct", label: "Capex, % of revenue", fmt: FMT_PCT },
  { key: "dso", label: "Receivable days (DSO)", fmt: FMT_DAYS },
  { key: "dio", label: "Inventory days (DIO)", fmt: FMT_DAYS },
  { key: "dpo", label: "Payable days (DPO)", fmt: FMT_DAYS },
  { key: "interestRate", label: "Interest rate on opening debt", fmt: FMT_PCT },
  { key: "debtRepayment", label: "Scheduled debt repayment ($)", fmt: FMT_USD },
  { key: "taxRate", label: "Entity income tax rate", fmt: FMT_PCT },
  { key: "distributionsPct", label: "Owner distributions, % of net income", fmt: FMT_PCT },
  { key: "replacementSalary", label: "Market replacement salary for owner ($)", fmt: FMT_USD },
];

function assumptionsLayout(): RowSpec[] {
  return ASSUMPTION_ROWS.map((r) => ({ key: r.key, label: r.label, fmt: r.fmt }));
}

function rowMap(layout: RowSpec[]): Record<string, number> {
  return Object.fromEntries(layout.map((r, i) => [r.key, FIRST_ROW + i]));
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---------------------------------------------------------------------------

export interface WorkbookContext {
  row: RequestRow;
  dataset: FinancialDataset;
  assumptions: Assumptions;
  model: ModelResult;
  firmName: string;
  preparedOn: string;
}

/** Where every statement row lands, so other code (the verifier) can find cells. */
export function workbookLayout(model: ModelResult) {
  const layouts: Record<SheetKey, RowSpec[]> = {
    assumptions: assumptionsLayout(),
    is: isLayout(),
    recast: recastLayout(model.addbackDescriptions),
    bs: bsLayout(),
    cf: cfLayout(),
  };
  const rows = {
    assumptions: rowMap(layouts.assumptions),
    is: rowMap(layouts.is),
    recast: rowMap(layouts.recast),
    bs: rowMap(layouts.bs),
    cf: rowMap(layouts.cf),
  };
  const firstCol = 2; // column B
  return { layouts, rows, firstCol, col: (i: number) => colLetter(firstCol + i) };
}

export async function writeWorkbook(ctx: WorkbookContext, file: string): Promise<void> {
  const { dataset: ds, assumptions: a, model, row } = ctx;
  const years = model.years;
  const nHist = model.historical.length;
  const { layouts, rows: R, firstCol, col } = workbookLayout(model);
  const notesCol = colLetter(firstCol + years.length + 1);
  const ref = (sheet: SheetKey, key: string, i: number, sameSheet?: SheetKey) => {
    const r = R[sheet][key];
    if (r === undefined) throw new Error(`No row ${key} on ${sheet}`);
    const cell = `${col(i)}${r}`;
    return sheet === sameSheet ? cell : `'${SHEETS[sheet]}'!${cell}`;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = ctx.firmName;
  wb.created = new Date();
  // Excel recalculates everything on open.
  wb.calcProperties = { fullCalcOnLoad: true };

  const cover = wb.addWorksheet(SHEETS.cover, { properties: { tabColor: { argb: NAVY } } });
  const wsA = wb.addWorksheet(SHEETS.assumptions, { properties: { tabColor: { argb: "FFFFC000" } } });
  const wsIS = wb.addWorksheet(SHEETS.is);
  const wsR = wb.addWorksheet(SHEETS.recast);
  const wsBS = wb.addWorksheet(SHEETS.bs);
  const wsCF = wb.addWorksheet(SHEETS.cf);
  const wsV = wb.addWorksheet(SHEETS.valuation);
  const wsC = wb.addWorksheet(SHEETS.checks);
  const wsS = wb.addWorksheet(SHEETS.source);

  const fyEnd = row.fiscal_year_end;
  const unitLine = `USD. Fiscal years end ${fyEnd} (MM-DD). A = actual, E = estimate.`;

  const setupStatement = (ws: ExcelJS.Worksheet, title: string, layout: RowSpec[], withNotes = false) => {
    ws.properties.defaultRowHeight = 15;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4, showGridLines: false }];
    ws.getColumn(1).width = 46;
    years.forEach((_, i) => (ws.getColumn(firstCol + i).width = 14));
    if (withNotes) ws.getColumn(firstCol + years.length + 1).width = 70;
    font(ws.getCell("A1"), { bold: true, size: 14, color: NAVY }).value = `${row.code_name}: ${title}`;
    font(ws.getCell("A2"), { italic: true, size: 9, color: "FF595959" }).value = unitLine;
    const header = ws.getRow(4);
    header.getCell(1).value = "";
    years.forEach((y, i) => {
      header.getCell(firstCol + i).value = `FY${y.year}${y.projected ? "E" : "A"}`;
    });
    if (withNotes) header.getCell(firstCol + years.length + 1).value = "Basis / notes";
    header.eachCell({ includeEmpty: true }, (c, n) => {
      if (n > firstCol + years.length + (withNotes ? 1 : -1)) return;
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      font(c, { bold: true, color: "FFFFFFFF" });
      c.alignment = { horizontal: n === 1 ? "left" : "center" };
    });
    // Divider between actuals and estimates.
    for (let r = 4; r < FIRST_ROW + layout.length; r++) {
      ws.getCell(`${col(nHist)}${r}`).border = { left: { style: "thin", color: { argb: "FF7F7F7F" } } };
    }
    layout.forEach((spec, idx) => {
      const r = FIRST_ROW + idx;
      const c = ws.getCell(`A${r}`);
      c.value = spec.label;
      font(c, {
        bold: spec.kind === "header" || spec.kind === "total",
        italic: spec.kind === "memo",
        color: spec.kind === "memo" ? "FF595959" : BLACK,
      });
      if (spec.kind === "total") {
        for (let i = 0; i < years.length; i++) {
          ws.getCell(`${col(i)}${r}`).border = { top: { style: "thin" } };
        }
      }
    });
  };

  /** Write a cell: value (input), formula, or cross-sheet link, with the colour convention. */
  const put = (
    ws: ExcelJS.Worksheet,
    addr: string,
    content: { input?: number | string; formula?: string; result?: number },
    fmt?: string,
    opts: { key?: boolean; bold?: boolean; note?: string } = {},
  ) => {
    const c = ws.getCell(addr);
    if (content.formula !== undefined) {
      c.value = { formula: content.formula, result: content.result } as ExcelJS.CellFormulaValue;
      const crossSheet = /'[^']+'!/.test(content.formula) && /^[-]?'[^']+'![A-Z]+\d+$/.test(content.formula);
      font(c, { color: crossSheet ? GREEN : BLACK, bold: opts.bold });
    } else {
      c.value = content.input ?? null;
      font(c, { color: BLUE, bold: opts.bold });
    }
    if (fmt) c.numFmt = fmt;
    if (opts.key) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    if (opts.note) c.note = opts.note;
    return c;
  };

  const isBold = (layout: RowSpec[], key: string) => layout.find((l) => l.key === key)?.kind === "total";

  // ---------------------------------------------------------------- Assumptions
  setupStatement(wsA, "Assumptions", layouts.assumptions, true);
  font(wsA.getCell("A3"), { size: 9, color: "FF595959" }).value =
    "Yellow cells drive the projections. Historical columns show the actual ratios for reference.";
  for (const spec of ASSUMPTION_ROWS) {
    const r = R.assumptions[spec.key]!;
    years.forEach((y, i) => {
      const addr = `${col(i)}${r}`;
      const p = i - nHist; // projection index
      if (!y.projected) {
        const f = historicalRatio(spec.key, i);
        if (f) put(wsA, addr, f, spec.fmt);
        return;
      }
      const value =
        spec.key === "replacementSalary" ? a.replacementSalary[y.year]! : (a[spec.key] as number[])[p]!;
      put(wsA, addr, { input: value }, spec.fmt, { key: true });
    });
    const note = a.notes[spec.key];
    const nc = wsA.getCell(`${notesCol}${r}`);
    nc.value = note ?? "";
    font(nc, { size: 9, color: "FF595959" });
    nc.alignment = { wrapText: true, vertical: "top" };
  }
  // Historical replacement salary is an input too (it drives the historical recast).
  model.historical.forEach((y, i) => {
    put(wsA, `${col(i)}${R.assumptions.replacementSalary}`, { input: a.replacementSalary[y.year]! }, FMT_USD, { key: true });
  });

  function historicalRatio(key: string, i: number): { formula: string; result?: number } | undefined {
    const is = (k: string) => ref("is", k, i);
    const bs = (k: string) => ref("bs", k, i);
    const y = years[i]!;
    const safe = (num: string, den: string) => `IF(${den}=0,0,${num}/${den})`;
    switch (key) {
      case "revenueGrowth":
        return i === 0 ? undefined : { formula: safe(`${is("revenue")}-${ref("is", "revenue", i - 1)}`, ref("is", "revenue", i - 1)) };
      case "cogsPct":
        return { formula: safe(is("cogs"), is("revenue")) };
      case "payrollPct":
        return { formula: safe(is("payroll"), is("revenue")) };
      case "ownerComp":
        return { formula: is("owner_comp") };
      case "rentPct":
        return { formula: safe(is("rent"), is("revenue")) };
      case "marketingPct":
        return { formula: safe(is("marketing"), is("revenue")) };
      case "otherOpexPct":
        return { formula: safe(is("other_opex"), is("revenue")) };
      case "daPct":
        return { formula: safe(is("da"), is("revenue")) };
      case "dso":
        return y.bs ? { formula: `${safe(bs("ar"), is("revenue"))}*365` } : undefined;
      case "dio":
        return y.bs ? { formula: `${safe(bs("inventory"), is("cogs"))}*365` } : undefined;
      case "dpo":
        return y.bs ? { formula: `${safe(bs("ap"), is("cogs"))}*365` } : undefined;
      case "taxRate":
        return { formula: safe(is("tax"), is("ebt")) };
      default:
        return undefined;
    }
  }

  // ----------------------------------------------------------- Income Statement
  setupStatement(wsIS, "Income Statement", layouts.is);
  const A = (key: string, i: number) => ref("assumptions", key, i);
  years.forEach((y, i) => {
    const c = col(i);
    const r = R.is;
    const at = (k: string) => `${c}${r[k]}`;
    const prevRev = i > 0 ? `${col(i - 1)}${r.revenue}` : undefined;
    if (!y.projected) {
      put(wsIS, at("revenue"), { input: y.revenue }, FMT_USD);
      put(wsIS, at("cogs"), { input: y.cogs }, FMT_USD);
      put(wsIS, at("payroll"), { input: y.payroll }, FMT_USD);
      put(wsIS, at("owner_comp"), { input: y.ownerComp }, FMT_USD);
      put(wsIS, at("rent"), { input: y.rent }, FMT_USD);
      put(wsIS, at("marketing"), { input: y.marketing }, FMT_USD);
      put(wsIS, at("other_opex"), { input: y.otherOpex }, FMT_USD);
      put(wsIS, at("da"), { input: y.da }, FMT_USD);
      put(wsIS, at("interest"), { input: y.interest }, FMT_USD);
      put(wsIS, at("other_income"), { input: y.otherIncome }, FMT_USD);
      put(wsIS, at("other_expense"), { input: y.otherExpense }, FMT_USD);
      put(wsIS, at("tax"), { input: y.tax }, FMT_USD);
    } else {
      put(wsIS, at("revenue"), { formula: `${prevRev}*(1+${A("revenueGrowth", i)})` }, FMT_USD);
      put(wsIS, at("cogs"), { formula: `${at("revenue")}*${A("cogsPct", i)}` }, FMT_USD);
      put(wsIS, at("payroll"), { formula: `${at("revenue")}*${A("payrollPct", i)}` }, FMT_USD);
      put(wsIS, at("owner_comp"), { formula: A("ownerComp", i) }, FMT_USD);
      put(wsIS, at("rent"), { formula: `${at("revenue")}*${A("rentPct", i)}` }, FMT_USD);
      put(wsIS, at("marketing"), { formula: `${at("revenue")}*${A("marketingPct", i)}` }, FMT_USD);
      put(wsIS, at("other_opex"), { formula: `${at("revenue")}*${A("otherOpexPct", i)}` }, FMT_USD);
      put(wsIS, at("da"), { formula: `${at("revenue")}*${A("daPct", i)}` }, FMT_USD);
      put(wsIS, at("interest"), { formula: `${ref("bs", "debt", i - 1)}*${A("interestRate", i)}` }, FMT_USD);
      put(wsIS, at("other_income"), { input: 0 }, FMT_USD);
      put(wsIS, at("other_expense"), { input: 0 }, FMT_USD);
      put(wsIS, at("tax"), { formula: `MAX(0,${at("ebt")})*${A("taxRate", i)}` }, FMT_USD);
    }
    if (prevRev) put(wsIS, at("growth"), { formula: `IF(${prevRev}=0,0,${at("revenue")}/${prevRev}-1)` }, FMT_PCT);
    put(wsIS, at("gross_profit"), { formula: `${at("revenue")}-${at("cogs")}` }, FMT_USD, { bold: true });
    put(wsIS, at("gross_margin"), { formula: `IF(${at("revenue")}=0,0,${at("gross_profit")}/${at("revenue")})` }, FMT_PCT);
    put(wsIS, at("total_opex"), { formula: `SUM(${at("payroll")}:${at("other_opex")})` }, FMT_USD, { bold: true });
    put(wsIS, at("ebitda"), { formula: `${at("gross_profit")}-${at("total_opex")}` }, FMT_USD, { bold: true });
    put(wsIS, at("ebitda_margin"), { formula: `IF(${at("revenue")}=0,0,${at("ebitda")}/${at("revenue")})` }, FMT_PCT);
    put(wsIS, at("ebit"), { formula: `${at("ebitda")}-${at("da")}` }, FMT_USD, { bold: true });
    put(wsIS, at("ebt"), { formula: `${at("ebit")}-${at("interest")}+${at("other_income")}-${at("other_expense")}` }, FMT_USD, { bold: true });
    put(wsIS, at("net_income"), { formula: `${at("ebt")}-${at("tax")}` }, FMT_USD, { bold: true });
    put(wsIS, at("net_margin"), { formula: `IF(${at("revenue")}=0,0,${at("net_income")}/${at("revenue")})` }, FMT_PCT);
  });

  // --------------------------------------------------------------------- Recast
  setupStatement(wsR, "Recast: Adjusted EBITDA & SDE", layouts.recast);
  years.forEach((y, i) => {
    const c = col(i);
    const r = R.recast;
    const at = (k: string) => `${c}${r[k]}`;
    put(wsR, at("ebitda"), { formula: ref("is", "ebitda", i) }, FMT_USD);
    put(wsR, at("owner_comp"), { formula: ref("is", "owner_comp", i) }, FMT_USD);
    put(wsR, at("replacement"), { formula: `-${A("replacementSalary", i)}` }, FMT_USD);
    put(wsR, at("owner_norm"), { formula: `${at("owner_comp")}+${at("replacement")}` }, FMT_USD, { bold: true });
    model.addbackDescriptions.forEach((d, k) => {
      const amount = y.addbacksByDescription[d] ?? 0;
      const detail = ds.addbacks.filter((x) => x.year === y.year && x.description === d);
      put(wsR, at(`ab_${k}`), { input: y.projected ? 0 : amount }, FMT_USD, {
        note: detail.length ? `${detail[0]!.type.replace("_", "-")} add-back, from ${detail[0]!.source}` : undefined,
      });
    });
    const abRows = model.addbackDescriptions.map((_, k) => at(`ab_${k}`));
    put(wsR, at("total_addbacks"), { formula: abRows.length ? `SUM(${abRows[0]}:${abRows[abRows.length - 1]})` : "0" }, FMT_USD, { bold: true });
    put(wsR, at("adj_ebitda"), { formula: `${at("ebitda")}+${at("owner_norm")}+${at("total_addbacks")}` }, FMT_USD, { bold: true });
    put(wsR, at("adj_margin"), { formula: `IF(${ref("is", "revenue", i)}=0,0,${at("adj_ebitda")}/${ref("is", "revenue", i)})` }, FMT_PCT);
    put(wsR, at("plus_salary"), { formula: A("replacementSalary", i) }, FMT_USD);
    put(wsR, at("sde"), { formula: `${at("adj_ebitda")}+${at("plus_salary")}` }, FMT_USD, { bold: true });
    put(wsR, at("sde_margin"), { formula: `IF(${ref("is", "revenue", i)}=0,0,${at("sde")}/${ref("is", "revenue", i)})` }, FMT_PCT);
  });
  // Potential add-backs for the advisor to review. Not included in the numbers.
  let rr = FIRST_ROW + layouts.recast.length + 2;
  font(wsR.getCell(`A${rr}`), { bold: true, color: NAVY }).value = "Potential add-backs to review with the seller (NOT included above)";
  rr++;
  ["Account", "FY", "Amount", "Why flagged"].forEach((h, k) => {
    const c = wsR.getCell(rr, k + 1);
    c.value = h;
    font(c, { bold: true });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
  });
  rr++;
  if (!ds.suggestedAddbacks.length) {
    font(wsR.getCell(`A${rr}`), { italic: true, color: "FF595959" }).value = "None flagged from account names.";
  }
  for (const s of ds.suggestedAddbacks) {
    wsR.getCell(rr, 1).value = s.account;
    wsR.getCell(rr, 2).value = `FY${s.year}`;
    const amt = wsR.getCell(rr, 3);
    amt.value = s.amount;
    amt.numFmt = FMT_USD;
    wsR.getCell(rr, 4).value = s.reason;
    for (let k = 1; k <= 4; k++) font(wsR.getCell(rr, k), { size: 9 });
    rr++;
  }

  // -------------------------------------------------------------- Balance Sheet
  setupStatement(wsBS, "Balance Sheet", layouts.bs);
  years.forEach((y, i) => {
    const c = col(i);
    const r = R.bs;
    const at = (k: string) => `${c}${r[k]}`;
    const prev = (k: string) => `${col(i - 1)}${r[k]}`;
    if (!y.projected) {
      if (!y.bs) {
        for (const k of ["cash", "tca", "total_assets", "total_le"]) wsBS.getCell(at(k)).value = null;
        font(wsBS.getCell(at("cash")), { italic: true, size: 8, color: "FF7F7F7F" }).value = "n/a";
        return;
      }
      const note = y.bs.estimated
        ? "Estimated from working-capital assumptions: no balance sheet in the sources. Replace with actuals."
        : undefined;
      put(wsBS, at("cash"), { input: y.bs.cash }, FMT_USD, { note });
      put(wsBS, at("ar"), { input: y.bs.ar }, FMT_USD);
      put(wsBS, at("inventory"), { input: y.bs.inventory }, FMT_USD);
      put(wsBS, at("oca"), { input: y.bs.oca }, FMT_USD);
      put(wsBS, at("fixed"), { input: y.bs.fixedAssets }, FMT_USD);
      put(wsBS, at("other_assets"), { input: y.bs.otherAssets }, FMT_USD);
      put(wsBS, at("ap"), { input: y.bs.ap }, FMT_USD);
      put(wsBS, at("ocl"), { input: y.bs.ocl }, FMT_USD);
      put(wsBS, at("debt"), { input: y.bs.debt }, FMT_USD);
      put(wsBS, at("equity"), { input: y.bs.equity }, FMT_USD);
    } else {
      put(wsBS, at("cash"), { formula: ref("cf", "end_cash", i) }, FMT_USD);
      put(wsBS, at("ar"), { formula: `${ref("is", "revenue", i)}*${A("dso", i)}/365` }, FMT_USD);
      put(wsBS, at("inventory"), { formula: `${ref("is", "cogs", i)}*${A("dio", i)}/365` }, FMT_USD);
      put(wsBS, at("oca"), { formula: prev("oca") }, FMT_USD);
      put(wsBS, at("fixed"), { formula: `${prev("fixed")}-${ref("cf", "capex", i)}-${ref("is", "da", i)}` }, FMT_USD);
      put(wsBS, at("other_assets"), { formula: prev("other_assets") }, FMT_USD);
      put(wsBS, at("ap"), { formula: `${ref("is", "cogs", i)}*${A("dpo", i)}/365` }, FMT_USD);
      put(wsBS, at("ocl"), { formula: prev("ocl") }, FMT_USD);
      put(wsBS, at("debt"), { formula: `${prev("debt")}+${ref("cf", "repayment", i)}` }, FMT_USD);
      put(wsBS, at("equity"), { formula: `${prev("equity")}+${ref("is", "net_income", i)}+${ref("cf", "distributions", i)}` }, FMT_USD);
    }
    put(wsBS, at("tca"), { formula: `SUM(${at("cash")}:${at("oca")})` }, FMT_USD, { bold: true });
    put(wsBS, at("total_assets"), { formula: `${at("tca")}+${at("fixed")}+${at("other_assets")}` }, FMT_USD, { bold: true });
    put(wsBS, at("tcl"), { formula: `${at("ap")}+${at("ocl")}` }, FMT_USD, { bold: true });
    put(wsBS, at("total_liabilities"), { formula: `${at("tcl")}+${at("debt")}` }, FMT_USD, { bold: true });
    put(wsBS, at("total_le"), { formula: `${at("total_liabilities")}+${at("equity")}` }, FMT_USD, { bold: true });
    put(wsBS, at("check"), { formula: `ROUND(${at("total_assets")}-${at("total_le")},2)` }, FMT_USD);
  });

  // ------------------------------------------------------------------ Cash Flow
  setupStatement(wsCF, "Cash Flow Statement", layouts.cf);
  font(wsCF.getCell("A3"), { size: 9, color: "FF595959" }).value =
    "Projected years only: an indirect cash flow needs two balance sheets, so historical years are not shown.";
  years.forEach((y, i) => {
    const c = col(i);
    const r = R.cf;
    const at = (k: string) => `${c}${r[k]}`;
    if (!y.projected) {
      font(wsCF.getCell(at("net_income")), { italic: true, size: 8, color: "FF7F7F7F" }).value = "n/a";
      return;
    }
    const bs = (k: string, j = i) => ref("bs", k, j);
    put(wsCF, at("net_income"), { formula: ref("is", "net_income", i) }, FMT_USD);
    put(wsCF, at("da"), { formula: ref("is", "da", i) }, FMT_USD);
    put(wsCF, at("d_ar"), { formula: `${bs("ar", i - 1)}-${bs("ar")}` }, FMT_USD);
    put(wsCF, at("d_inv"), { formula: `${bs("inventory", i - 1)}-${bs("inventory")}` }, FMT_USD);
    put(wsCF, at("d_oca"), { formula: `${bs("oca", i - 1)}-${bs("oca")}` }, FMT_USD);
    put(wsCF, at("d_ap"), { formula: `${bs("ap")}-${bs("ap", i - 1)}` }, FMT_USD);
    put(wsCF, at("d_ocl"), { formula: `${bs("ocl")}-${bs("ocl", i - 1)}` }, FMT_USD);
    put(wsCF, at("cfo"), { formula: `SUM(${at("net_income")}:${at("d_ocl")})` }, FMT_USD, { bold: true });
    put(wsCF, at("capex"), { formula: `-${ref("is", "revenue", i)}*${A("capexPct", i)}` }, FMT_USD);
    put(wsCF, at("cfi"), { formula: at("capex") }, FMT_USD, { bold: true });
    put(wsCF, at("repayment"), { formula: `-MIN(${bs("debt", i - 1)},${A("debtRepayment", i)})` }, FMT_USD);
    put(wsCF, at("distributions"), { formula: `-MAX(0,${ref("is", "net_income", i)})*${A("distributionsPct", i)}` }, FMT_USD);
    put(wsCF, at("cff"), { formula: `${at("repayment")}+${at("distributions")}` }, FMT_USD, { bold: true });
    put(wsCF, at("net_change"), { formula: `${at("cfo")}+${at("cfi")}+${at("cff")}` }, FMT_USD, { bold: true });
    put(wsCF, at("begin_cash"), { formula: bs("cash", i - 1) }, FMT_USD);
    put(wsCF, at("end_cash"), { formula: `${at("begin_cash")}+${at("net_change")}` }, FMT_USD, { bold: true });
  });

  // ------------------------------------------------------------------ Valuation
  const lastHistIdx = nHist - 1;
  wsV.views = [{ showGridLines: false }];
  wsV.getColumn(1).width = 44;
  [2, 3, 4].forEach((c) => (wsV.getColumn(c).width = 16));
  font(wsV.getCell("A1"), { bold: true, size: 14, color: NAVY }).value = `${row.code_name}: Indicative valuation range`;
  font(wsV.getCell("A2"), { italic: true, size: 9, color: "FF595959" }).value =
    `Internal only; not for the CIM. Based on FY${years[lastHistIdx]!.year}A earnings. ${a.notes.multiples}`;
  const vHeader = wsV.getRow(4);
  ["", "Low", "Mid", "High"].forEach((h, k) => {
    const c = vHeader.getCell(k + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    font(c, { bold: true, color: "FFFFFFFF" });
    c.alignment = { horizontal: k ? "center" : "left" };
  });
  const sdeRef = ref("recast", "sde", lastHistIdx);
  const adjRef = ref("recast", "adj_ebitda", lastHistIdx);
  const vRows: [string, (k: number) => { input?: number; formula?: string }, string, boolean?][] = [
    [`SDE, FY${years[lastHistIdx]!.year}A`, () => ({ formula: sdeRef }), FMT_USD],
    ["SDE multiple", (k) => ({ input: a.sdeMultiples[k]! }), FMT_MULT, true],
    ["Implied enterprise value (SDE basis)", (k) => ({ formula: `${colLetter(k + 2)}5*${colLetter(k + 2)}6` }), FMT_USD],
    ["", () => ({}), ""],
    [`Adjusted EBITDA, FY${years[lastHistIdx]!.year}A`, () => ({ formula: adjRef }), FMT_USD],
    ["Adjusted EBITDA multiple", (k) => ({ input: a.ebitdaMultiples[k]! }), FMT_MULT, true],
    ["Implied enterprise value (EBITDA basis)", (k) => ({ formula: `${colLetter(k + 2)}9*${colLetter(k + 2)}10` }), FMT_USD],
  ];
  vRows.forEach(([label, fn, fmt, key], idx) => {
    const r = 5 + idx;
    font(wsV.getCell(`A${r}`), { bold: label.startsWith("Implied") }).value = label;
    if (!label) return;
    for (let k = 0; k < 3; k++) {
      const content = fn(k);
      if (content.formula || content.input !== undefined) {
        put(wsV, `${colLetter(k + 2)}${r}`, content, fmt, { key, bold: label.startsWith("Implied") });
      }
    }
  });

  // --------------------------------------------------------------------- Checks
  wsC.views = [{ showGridLines: false }];
  wsC.getColumn(1).width = 46;
  font(wsC.getCell("A1"), { bold: true, size: 14, color: NAVY }).value = `${row.code_name}: Model checks`;
  const checkRows: [string, (i: number) => string | undefined][] = [
    ["Balance sheet balances", (i) => (years[i]!.bs || years[i]!.projected ? `ABS(${ref("bs", "check", i)})<1` : undefined)],
    ["Cash flow ending cash = balance sheet cash", (i) => (years[i]!.projected ? `ABS(${ref("cf", "end_cash", i)}-${ref("bs", "cash", i)})<1` : undefined)],
    ["Cash is not negative", (i) => (years[i]!.projected ? `${ref("bs", "cash", i)}>=0` : undefined)],
  ];
  const cHeader = wsC.getRow(3);
  years.forEach((y, i) => {
    wsC.getColumn(firstCol + i).width = 12;
    const c = cHeader.getCell(firstCol + i);
    c.value = `FY${y.year}${y.projected ? "E" : "A"}`;
    font(c, { bold: true });
  });
  const checkCells: string[] = [];
  checkRows.forEach(([label, fn], idx) => {
    const r = 4 + idx;
    wsC.getCell(`A${r}`).value = label;
    years.forEach((_, i) => {
      const cond = fn(i);
      if (!cond) return;
      const addr = `${col(i)}${r}`;
      put(wsC, addr, { formula: `IF(${cond},"OK","CHECK")` });
      wsC.getCell(addr).alignment = { horizontal: "center" };
      checkCells.push(addr);
    });
  });
  const statusRow = 4 + checkRows.length + 1;
  font(wsC.getCell(`A${statusRow}`), { bold: true }).value = "Overall";
  const allOk = checkCells.length ? `AND(${checkCells.map((c) => `${c}="OK"`).join(",")})` : "TRUE";
  put(wsC, `B${statusRow}`, { formula: `IF(${allOk},"ALL CHECKS OK","REVIEW")` }, undefined, { bold: true });

  // ---------------------------------------------------------------- Source Data
  wsS.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  font(wsS.getCell("A1"), { bold: true, size: 14, color: NAVY }).value = `${row.code_name}: Source data and account mapping`;
  const sHead = ["FY", "Statement", "Source", "File", "Account", "Section / line ref", "Mapped to", "Mapped by", "Amount"];
  const widths = [8, 14, 24, 30, 44, 26, 30, 12, 14];
  sHead.forEach((h, k) => {
    wsS.getColumn(k + 1).width = widths[k]!;
    const c = wsS.getCell(3, k + 1);
    c.value = h;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    font(c, { bold: true, color: "FFFFFFFF" });
  });
  ds.lines.forEach((l, idx) => {
    const r = 4 + idx;
    const label = l.statement === "pnl" ? IS_LABELS[l.category as keyof typeof IS_LABELS] : BS_LABELS[l.category as keyof typeof BS_LABELS];
    const vals = [
      `FY${l.year}`,
      l.statement === "pnl" ? "P&L" : "Balance sheet",
      SOURCE_LABELS[l.source],
      path.basename(l.file),
      l.account,
      l.section ?? "",
      label,
      l.mappedBy,
      l.amount,
    ];
    vals.forEach((v, k) => {
      const c = wsS.getCell(r, k + 1);
      c.value = v;
      font(c, { size: 9, color: k === 8 ? BLUE : BLACK });
      if (k === 8) c.numFmt = '#,##0.00;(#,##0.00);"-"';
      if (k === 7 && v === "default") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };
    });
  });
  wsS.autoFilter = { from: "A3", to: `I${3 + ds.lines.length}` };

  // ---------------------------------------------------------------------- Cover
  cover.views = [{ showGridLines: false }];
  cover.getColumn(1).width = 3;
  cover.getColumn(2).width = 28;
  cover.getColumn(3).width = 100;
  font(cover.getCell("B2"), { bold: true, size: 18, color: NAVY }).value = `${row.code_name}`;
  font(cover.getCell("B3"), { size: 12, color: "FF595959" }).value = `Three-statement financial model: ${row.business_name}`;
  const info: [string, string][] = [
    ["Prepared by", ctx.firmName],
    ["Prepared on", ctx.preparedOn],
    ["Request", `${row.request_id} (${row.priority}), requested by ${row.requested_by || "n/a"}`],
    ["Industry / location", `${row.industry || "n/a"} / ${row.location || "n/a"}`],
    ["Entity type", row.entity_type],
    ["Historical years", ds.years.map((y) => `FY${y}`).join(", ")],
    ["Projection years", a.projectionYears.map((y) => `FY${y}`).join(", ")],
  ];
  let cr = 5;
  for (const [k, v] of info) {
    font(cover.getCell(`B${cr}`), { bold: true }).value = k;
    font(cover.getCell(`C${cr}`)).value = v;
    cr++;
  }
  cr++;
  font(cover.getCell(`B${cr++}`), { bold: true, color: NAVY, size: 12 }).value = "Data sources";
  for (const s of describeSources(ds)) font(cover.getCell(`C${cr++}`)).value = s;
  cr++;
  font(cover.getCell(`B${cr++}`), { bold: true, color: NAVY, size: 12 }).value = "Colour legend";
  const legend: [string, string, string | undefined][] = [
    ["Blue text", "Hard-coded input (historical actuals, assumptions)", BLUE],
    ["Black text", "Formula", BLACK],
    ["Green text", "Link to another sheet", GREEN],
    ["Yellow fill", "Key assumption: review before use", undefined],
  ];
  for (const [k, v, color] of legend) {
    const c = cover.getCell(`B${cr}`);
    c.value = k;
    font(c, { color: color ?? BLACK, bold: true });
    if (!color) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    font(cover.getCell(`C${cr}`)).value = v;
    cr++;
  }
  cr++;
  font(cover.getCell(`B${cr}`), { bold: true, color: NAVY, size: 12 }).value = "Model status";
  const status = cover.getCell(`C${cr++}`);
  status.value = { formula: `'${SHEETS.checks}'!B${statusRow}` } as ExcelJS.CellFormulaValue;
  font(status, { bold: true, color: GREEN });
  cr++;
  font(cover.getCell(`B${cr++}`), { bold: true, color: NAVY, size: 12 }).value = "Review before relying on this model";
  const reviewItems = ds.warnings.length ? ds.warnings : ["No data warnings."];
  for (const w of reviewItems) {
    const c = cover.getCell(`C${cr++}`);
    c.value = `• ${w}`;
    font(c, { size: 9 });
    c.alignment = { wrapText: true, vertical: "top" };
  }

  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  await wb.xlsx.writeFile(file);
}

function font(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
): ExcelJS.Cell {
  cell.font = {
    name: FONT,
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: { argb: opts.color ?? BLACK },
  };
  return cell;
}

