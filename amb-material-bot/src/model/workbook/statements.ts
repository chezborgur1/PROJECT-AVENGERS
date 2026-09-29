// P&L Summary, the Adj. EBITDA ladder and the Adjustments schedule (guide
// 5.1 rows 5-7, 5.3, 5.4). Every period cell is a SUMIFS over the monthly
// grid or the schedule's own month cells; nothing on the ladder is typed.

import { ADJUSTMENT_CATEGORY_LABELS, ADJUSTMENT_TIER_LABELS, IS_LABELS, monthPeriod, type Adjustment, type IsCategory } from "../../domain/financials.ts";
import { activeCount } from "./customersTabs.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import { A, type TabContext } from "./assumptionsTab.ts";
import { contraAccounts, DATABOOK_COL, DATABOOK_FIRST_ROW, MONTH_START, RAW_CUSTOMER_COLS, RAW_PAYROLL_COLS, deltaValues, pnlRows, priorColumn, stylePnlRow, valueStyle, writeDeltas, type PnlValues } from "./data.ts";
import {
  ADJ_BASIS_COL,
  ADJ_CATEGORY_COL,
  ADJ_REF_COL,
  ADJ_STATUS_COL,
  ADJ_TIER_COL,
  adjMonthStart,
  adjustmentsLayout,
  applyPeriodWidths,
  fiscalYearWindow,
  gridMonths,
  periodLayout,
  prorationFormula,
  S,
  SHEET,
  sumifsFormula,
  valueSpans,
  writeMonthHeaders,
  writePeriodHelpers,
  type PeriodLayout,
} from "./layout.ts";

const K = 1000;

// --- P&L Summary -------------------------------------------------------------------------------

export function planPnlSummary(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("pnl", SHEET.pnl);
  const l = periodLayout(model, 3);
  applyPeriodWidths(b, l);
  b.anatomy({ subtitle: "Historical P&L Summary ($000s)", lastCol: l.notesCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [...l.groups, { from: l.notesCol, to: l.notesCol, label: "Basis" }]);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], "Income Statement");
  if (l.deltas) {
    b.cell(6, l.deltas.dollar, { style: "header", v: "($)", role: "text" });
    b.cell(6, l.deltas.pct, { style: "header", v: "(%)", role: "text" });
  }
  if (l.scenarios) ["Low", "Mid", "High"].forEach((h, i) => b.cell(6, l.scenarios!.low + i, { style: "header", v: h, role: "text" }));
  b.cell(6, l.notesCol, { style: "header", v: "Basis / notes", role: "text", align: { horizontal: "left" } });

  const rows = pnlRows(model, { ladder: false });
  let r = 8;
  for (const spec of rows) b.row(spec.key, r++);
  r++;
  const kpiSection = r;
  b.row("sec_kpi", r++);
  const kpiKeys = kpiRows(model, ctx.customerYears);
  for (const k of kpiKeys) b.row(k.key, r++);
  r++;
  // The two ties to the grid (C03, C04) exist only when there is a grid; annual-only models read the Databook directly.
  const monthly = !!model.monthly;
  const checkRow = r;
  const linesCheckRow = r + 1;
  if (monthly) {
    b.row("check", checkRow);
    b.row("check_lines", linesCheckRow);
    r += 2;
  }
  const lastPrinted = r;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 2);
  const spans = valueSpans(l);
  const n = gridMonths(model).length;
  const monthlyRow = (key: string) => `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", key)}:$${colLetter(MONTH_START + n - 1)}$${rowOf("monthly", key)}`;
  const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + n - 1)}$6`;
  const dbFirst = DATABOOK_FIRST_ROW;
  const dbLast = DATABOOK_FIRST_ROW + (model.databook?.pnl.length ?? 1) - 1;

  for (const spec of rows) {
    const rr = b.r(spec.key);
    const next = rows[rows.indexOf(spec) + 1];
    stylePnlRow(b, rr, spec, spans, next?.kind === "margin");
    if (spec.kind === "section" || spec.kind === "spacer") continue;
    const vs = valueStyle(spec.kind);
    for (const { column, col } of l.cols) {
      const colL = colLetter(col);
      const at = (key: string) => `${colL}${b.r(key)}`;
      const pv = model.periods[column.key]!;
      const values: PnlValues = { pnl: pv.pnl, ladder: pv.ladder, revenueLines: pv.revenueLines };
      if (spec.kind === "margin") {
        const base = spec.key === "gross_margin" ? "gross_profit" : spec.key === "ebitda_margin" ? "reported_ebitda" : "net_income";
        b.formula(rr, col, `IFERROR(${at(base)}/${at("revenue")},"n.m.")`, { style: vs.style, fmt: vs.fmt, expect: pv.pnl.revenue ? spec.value!(values) : "n.m.", label: `${spec.key} ${column.label}` });
        continue;
      }
      if (spec.kind === "ratio") {
        const prior = priorColumn(column, l);
        if (!prior) {
          b.na(rr, col, "n.a.", { style: vs.style });
          continue;
        }
        const prev = model.periods[prior.column.key]!.pnl.revenue;
        b.formula(rr, col, `IFERROR(${at("revenue")}/${colLetter(prior.col)}${b.r("revenue")}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? pv.pnl.revenue / prev - 1 : "n.a.", label: `${spec.key} ${column.label}` });
        continue;
      }
      let f: string;
      if (spec.calc) f = spec.calc(at);
      else if (monthly) {
        const key = spec.account ? `rev:${spec.account}` : spec.contra ? "rev_contra" : spec.key;
        f = sumifsFormula({ valuesRow: monthlyRow(key), monthsRow: monthlyHeader, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) });
      } else {
        // Annual-only mode: the Databook's fiscal-year column for this category or account.
        const dbCol = colLetter(DATABOOK_COL.periodStart + l.cols.findIndex((x) => x.column.key === column.key));
        const dbRange = (c: number) => `${S("databook")}$${colLetter(c)}$${dbFirst}:$${colLetter(c)}$${dbLast}`;
        const sumIf = (critCol: number, value: string) => `SUMIFS(${S("databook")}${dbCol}$${dbFirst}:${dbCol}$${dbLast},${dbRange(critCol)},"${value.replace(/"/g, '""')}")`;
        if (spec.contra) f = `(${contraAccounts(model).map((acc) => sumIf(DATABOOK_COL.account, acc)).join("+")})/${K}`;
        else f = `${spec.account ? sumIf(DATABOOK_COL.account, spec.account) : sumIf(DATABOOK_COL.category, spec.category!)}/${K}`;
      }
      b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${column.label}` });
    }
    if (l.deltas && spec.value) writeDeltas(b, rr, l, spec.kind, deltaValues(model, l, (p) => spec.value!({ pnl: p.pnl, ladder: p.ladder, revenueLines: p.revenueLines }) / K));
    if (l.scenarios) writeScenarioCells(b, rr, spec, l, model);
  }
  // Column Q (guide 5.2): what each line reads, from the Databook mapping, and for the PF column's restated lines the method.
  for (const spec of rows) {
    const pf = model.adjustments.find((a) => a.row.tier === "pro_forma" && a.row.status === "accepted" && a.row.pnlLine && a.row.pnlLine === spec.category);
    const text = [pnlBasis(spec, model), pf ? `PF: ${pf.row.pfMethod ?? "Pro forma"} [${pf.row.ref}]` : ""].filter(Boolean).join("; ");
    if (text) b.note(b.r(spec.key), l.notesCol, text);
  }

  // KPI block (guide 5.1 row 5; DATA_CONTRACT §5.9).
  b.section(kpiSection, "Key Performance Indicators", spans);
  for (const k of kpiKeys) {
    const rr = b.r(k.key);
    b.text(rr, 2, k.label, { style: "line" });
    for (const { column, col } of l.cols) {
      const pv = model.periods[column.key]!;
      const at = (key: string) => `${colLetter(col)}${b.r(key)}`;
      const spec = k.cell(column, col, at, helpers, pv);
      if (!spec) {
        b.na(rr, col, "n.a.", { style: "line" });
        continue;
      }
      b.formula(rr, col, spec.f, { style: k.fmt === FMT.pct1 ? "ratio" : "line", fmt: k.fmt, expect: spec.expect, label: `${k.key} ${column.label}` });
    }
  }
  if (monthly) {
    // Check C04: net income against the grid, every column.
    b.text(checkRow, 2, "Check: Net Income less Monthly P&L", { style: "check" });
    for (const { col } of l.cols) {
      b.formula(checkRow, col, `${addr(b.r("net_income"), col)}-${S("monthly")}${colLetter(col)}${rowOf("monthly", "net_income")}`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: "C04" });
    }
    b.checkCf(checkRow, l.firstCol, l.lastValueCol);
    // C03: every dollar line against the grid recomputed another way, a SUMPRODUCT of the months inside the window, so a
    // wrong window, row or criterion in the SUMIFS shows (the grid's own period block is the same SUMIFS and could not fail).
    b.text(linesCheckRow, 2, "Check: every line less the grid's months in its window", { style: "check" });
    const dollarRows = rows.filter((x) => !["section", "spacer", "margin", "ratio"].includes(x.kind));
    for (const { col } of l.cols) {
      const inWindow = `--(${monthlyHeader}>=${addr(helpers.start, col, { row: true })}),--(${monthlyHeader}<=${addr(helpers.end, col, { row: true })})`;
      const gridKey = (x: (typeof rows)[number]) => (x.account ? `rev:${x.account}` : x.contra ? "rev_contra" : x.key);
      const terms = dollarRows.map((x) => `ABS(${addr(b.r(x.key), col)}-SUMPRODUCT(${inWindow},${monthlyRow(gridKey(x))}))`);
      b.formula(linesCheckRow, col, terms.join("+"), { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: "C03" });
    }
    b.checkCf(linesCheckRow, l.firstCol, l.lastValueCol);
  }
  b.note(lastPrinted, 2, monthly ? "Note: every period column is a SUMIFS over the Monthly P&L grid for the window in the helper rows below. Margins divide by total revenue." : `Note: full fiscal years only; source: ${model.databook?.pnl[0]?.file ?? "annual P&L"}. Pro forma columns apply the scenario methods on Assumptions.`);
  // The figures print one landscape page wide and the Basis column prints apart beside the repeated labels, so neither squeezes the other.
  b.print({ areas: [`B2:${addr(lastPrinted, l.lastValueCol)}`, `${addr(7, l.notesCol)}:${addr(b.r(rows[rows.length - 1]!.key), l.notesCol)}`], landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6", titlesCol: "B:B" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  const fyCols = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const named = (name: string, key: string, cols: { col: number }[]) => {
    if (!cols.length) return;
    b.defineName(name, `$${colLetter(cols[0]!.col)}$${b.r(key)}:$${colLetter(cols[cols.length - 1]!.col)}$${b.r(key)}`);
  };
  named("Rev_FY", "revenue", fyCols);
  named("GP_FY", "gross_profit", fyCols);
  named("RepEBITDA_FY", "reported_ebitda", fyCols);
  const ltm = l.cols.find((c) => c.column.ref.kind === "ltm" && !c.column.priorYear);
  const pf = l.cols.find((c) => c.column.ref.kind === "pf");
  if (ltm) {
    named("Rev_LTM", "revenue", [ltm]);
    named("GP_LTM", "gross_profit", [ltm]);
    named("RepEBITDA_LTM", "reported_ebitda", [ltm]);
  }
  if (pf) named("Rev_PF", "revenue", [pf]);
  return b;
}

/** Width of a Basis column printed as its own range (the ladder, the P&L Summary): the page holds it beside the labels at full scale. */
const BASIS_APART = 85;

/**
 * The Basis cell of a P&L Summary line: the source accounts it sums (from the
 * Databook mapping, the first few named and the rest counted so the note stays
 * on one line) or how a total is formed.
 */
function pnlBasis(spec: ReturnType<typeof pnlRows>[number], model: ModelOutput): string {
  const accounts = (pick: (d: NonNullable<ModelOutput["databook"]>["pnl"][number]) => boolean) => [...new Set((model.databook?.pnl ?? []).filter(pick).map((d) => d.account.split(":").pop()!.trim()))];
  const list = (names: string[]) => {
    if (!names.length) return "";
    let out = names[0]!;
    let k = 1;
    for (; k < names.length && `${out}, ${names[k]}`.length <= 36; k++) out = `${out}, ${names[k]}`;
    return `${names.length === 1 ? "Account" : "Accounts"}: ${out}${k < names.length ? ` and ${names.length - k} more (Databook)` : ""}`;
  };
  if (spec.account) return list([spec.account.split(":").pop()!.trim()]);
  if (spec.contra) return list(contraAccounts(model).map((a) => a.split(":").pop()!.trim()));
  if (spec.category) return list(accounts((d) => d.category === spec.category));
  const formed: Record<string, string> = {
    revenue: "Sum of the revenue lines",
    revenue_growth: "Against the same window a year earlier",
    gross_profit: "Total revenue less cost of revenue",
    total_opex: "Sum of the operating expense lines",
    reported_ebitda: "Gross profit less opex, plus other income less other expense",
    ebit: "Reported EBITDA less depreciation and amortization",
    ebt: "EBIT less interest expense",
    net_income: "Pre-tax income less income taxes (C04 ties it to the grid)",
  };
  if (spec.kind === "margin") return "Of total revenue";
  return formed[spec.key] ?? "";
}

interface KpiRow {
  key: string;
  label: string;
  fmt: string;
  cell: (column: ModelOutput["columns"][number], col: number, at: (key: string) => string, helpers: { start: number; end: number }, pv: ModelOutput["periods"][string]) => { f: string; expect: number | string } | undefined;
}

/**
 * KPI rows the engine computes for every period (DATA_CONTRACT §5.9):
 * counts from the raw lists at the period end, ratios on the statement
 * above. Management-stated operating facts carry their own date and sit on
 * the Summary, not in a period column.
 */
function kpiRows(model: ModelOutput, customerYears: number[]): KpiRow[] {
  const rows: KpiRow[] = [];
  const raw = (sheet: "rawCustomers" | "rawPayroll", c: number) => `${S(sheet)}$${colLetter(c)}:$${colLetter(c)}`;
  const ratio = (v: number | undefined) => v ?? "n.a.";
  if (model.customers) {
    rows.push({
      key: "kpi_customers",
      label: `${model.customers.term}s, active at period end (#)`,
      fmt: FMT.body,
      cell: (c, col, _at, h, pv) => ({ f: activeCount(addr(h.end, col, { row: true }), monthPeriod(c.end, model.fiscalYearEndMonth).fiscalYear, customerYears), expect: pv.kpis.customers ?? 0 }),
    });
    // Listed customers' revenue in the window (each fiscal year of the raw list prorated by the months it contributes), over the listed count.
    const listedRevenue = (h: { start: number; end: number }, col: number) =>
      prorationFormula(
        customerYears.map((y) => {
          const w = fiscalYearWindow(y, model);
          const raw = `${S("rawCustomers")}$${colLetter(RAW_CUSTOMER_COLS.firstFy + customerYears.indexOf(y))}:$${colLetter(RAW_CUSTOMER_COLS.firstFy + customerYears.indexOf(y))}`;
          return { amountCell: `SUMIFS(${raw},${S("rawCustomers")}$${colLetter(RAW_CUSTOMER_COLS.code)}:$${colLetter(RAW_CUSTOMER_COLS.code)},"<>Residual")`, startCell: w.start, endCell: w.end };
        }),
        addr(h.start, col, { row: true }),
        addr(h.end, col, { row: true }),
      );
    rows.push({
      key: "kpi_revenue_per_customer",
      label: `Revenue per listed ${model.customers.term.toLowerCase()} ($)`,
      fmt: FMT.currency,
      // The engine leaves the ratio out where the list does not cover the window (a YTD, or a year it lacks), and the cell reads n.a. there too.
      cell: (_c, col, at, h, pv) => (pv.kpis.revenue_per_customer === undefined ? undefined : { f: `IFERROR((${listedRevenue(h, col)})/${at("kpi_customers")},"n.a.")`, expect: ratio(pv.kpis.revenue_per_customer) }),
    });
  }
  if (model.headcount) {
    const fte = raw("rawPayroll", RAW_PAYROLL_COLS.fte);
    const hire = raw("rawPayroll", RAW_PAYROLL_COLS.hire);
    const term = raw("rawPayroll", RAW_PAYROLL_COLS.termination);
    const owner = raw("rawPayroll", RAW_PAYROLL_COLS.owner);
    rows.push({
      key: "kpi_employees",
      label: "Employees, non-owner FTE at period end (#)",
      fmt: FMT.oneDp,
      cell: (_c, col, _at, h, pv) => {
        const d = addr(h.end, col, { row: true });
        const onPayroll = `${fte},${hire},"<="&${d},${owner},"No"`;
        return { f: `SUMIFS(${onPayroll},${term},"")+SUMIFS(${onPayroll},${term},">"&${d})`, expect: pv.kpis.employees ?? 0 };
      },
    });
    rows.push({
      key: "kpi_revenue_per_employee",
      label: "Revenue per employee ($)",
      fmt: FMT.currency,
      // A part-year window's revenue over a year-end headcount is not a like-for-like ratio.
      cell: (column, _col, at, _h, pv) => (column.months === 12 ? { f: `IFERROR(${at("revenue")}*${K}/${at("kpi_employees")},"n.a.")`, expect: ratio(pv.kpis.revenue_per_employee) } : undefined),
    });
  }
  // The owner's employer payroll taxes sit in the payroll line; the labor cost excludes them with him, read from their
  // schedule row ([S4]) whatever its status.
  const ownerTaxes = model.adjustments.findIndex((x) => x.row.tier === "owner_compensation" && x.row.category === "owner_compensation" && x.row.origin !== "owner_comp");
  const adjCols = adjustmentsLayout(model).byKey;
  rows.push({
    key: "kpi_labor_cost",
    label: "Labor cost, % of revenue (excludes owner)",
    fmt: FMT.pct1,
    cell: (c, _col, at, _h, pv) => ({
      f: ownerTaxes >= 0 && adjCols[c.key] !== undefined ? `IFERROR((${at("payroll")}-${schedRowCell(ownerTaxes, adjCols[c.key]!)})/${at("revenue")},"n.a.")` : `IFERROR(${at("payroll")}/${at("revenue")},"n.a.")`,
      expect: ratio(pv.kpis.labor_cost_pct_revenue),
    }),
  });
  const recurring = model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring);
  if (recurring.length) {
    rows.push({
      key: "kpi_recurring",
      label: "Recurring revenue, % of total",
      fmt: FMT.pct1,
      cell: (_c, _col, at, _h, pv) => ({ f: `IFERROR((${recurring.map((x) => at(`rev:${x.account}`)).join("+")})/${at("revenue")},"n.a.")`, expect: ratio(pv.kpis.recurring_revenue_pct) }),
    });
  }
  return rows;
}

/** Annual-only mode: the Pro Forma Low / Mid / High cells of a P&L row, by the scenario's method (guide 5.2A). */
function writeScenarioCells(b: SheetBuilder, r: number, spec: ReturnType<typeof pnlRows>[number], l: PeriodLayout, model: ModelOutput): void {
  if (!l.scenarios || !model.scenarios) return;
  const fy = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const latestCol = fy[fy.length - 1]!.col;
  const fyRange = (key: string) => `${addr(b.r(key), fy[0]!.col)}:${addr(b.r(key), latestCol)}`;
  const methodKey: Record<string, string> = { cogs: "scenario_cogs", payroll: "scenario_payroll", rent: "scenario_rent", marketing: "scenario_marketing", other_opex: "scenario_otherOpex" };
  model.scenarios.forEach((sc, i) => {
    const col = l.scenarios!.low + i;
    const at = (key: string) => `${colLetter(col)}${b.r(key)}`;
    const vs = valueStyle(spec.kind);
    const latest = addr(r, latestCol);
    const values: PnlValues = { pnl: sc.pnl, ladder: sc.ladder, revenueLines: [] };
    if (spec.kind === "margin") {
      const base = spec.key === "gross_margin" ? "gross_profit" : spec.key === "ebitda_margin" ? "reported_ebitda" : "net_income";
      b.formula(r, col, `IFERROR(${at(base)}/${at("revenue")},"n.m.")`, { style: vs.style, fmt: vs.fmt, expect: sc.pnl.revenue ? spec.value!(values) : "n.m.", label: `${spec.key} ${sc.name}` });
      return;
    }
    if (spec.kind === "ratio") {
      b.formula(r, col, `IFERROR(${at("revenue")}/${addr(b.r("revenue"), latestCol)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: sc.revenueGrowth, label: `${spec.key} ${sc.name}` });
      return;
    }
    if (spec.calc) {
      b.formula(r, col, spec.calc(at), { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${sc.name}` });
      return;
    }
    if (spec.key === "revenue" || spec.account || spec.contra) {
      // Revenue lines scale with the scenario's growth.
      const growth = `${S("assumptions")}$${colLetter(3 + i)}$${rowOf("assumptions", "scenarioGrowth")}`;
      const latestLines = model.periods[fy[fy.length - 1]!.column.key]!.revenueLines;
      const scaled: PnlValues = { ...values, revenueLines: latestLines.map((x) => ({ ...x, amount: x.amount * (1 + sc.revenueGrowth) })) };
      b.formula(r, col, `${latest}*(1+${growth})`, { style: vs.style, fmt: vs.fmt, expect: spec.value!(scaled) / K, label: `${spec.key} ${sc.name}` });
      return;
    }
    const mk = spec.category ? methodKey[spec.category] : undefined;
    if (mk) {
      const method = `${S("assumptions")}$${colLetter(3 + i)}$${rowOf("assumptions", mk)}`;
      const f = `IF(${method}="Latest year",${latest},IF(${method}="3-year average",AVERAGE(${fyRange(spec.key)}),IF(${method}="% of sales, 3-year blended",SUM(${fyRange(spec.key)})/SUM(${fyRange("revenue")})*${at("revenue")},IF(${method}="% of sales, latest year",${latest}/${addr(b.r("revenue"), latestCol)}*${at("revenue")},${latest}))))`;
      b.formula(r, col, f, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${sc.name}` });
      // The notes column carries the Mid case's method (guide 5.2A column K).
      const midMethod = sc.name === "Mid" ? sc.methods[spec.category as string] : undefined;
      if (midMethod) b.note(r, l.notesCol, `PF: ${midMethod}`);
      return;
    }
    b.formula(r, col, latest, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${sc.name}` });
  });
}

// --- Adj. EBITDA ladder --------------------------------------------------------------------------

/**
 * How a ladder line reads the schedule, keyed to schedule rows and never to a
 * ref string, so a row inserted on the Adjustments tab renumbers the refs and
 * the ladder follows (guide 5.3). `rows` are the schedule rows (indices into
 * model.adjustments) the line stands for; a fixed rung ([D1]–[D3], [S1]–[S3])
 * also has `match` and sums accepted rows of its tier and category over whole
 * columns, so accepting a row on the tab flows into the rung and its label.
 */
interface LadderSource {
  rows: number[];
  match?: { tier: Adjustment["tier"]; category?: Adjustment["category"] };
  /** Memo rows are listed whatever their status; every other line counts accepted rows only. */
  anyStatus?: boolean;
}

interface LadderRow {
  key: string;
  /** The label as it prints; lines with a source build it by formula from the schedule's description and ref cells. */
  label: string;
  /** Fixed wording before the refs ("(+) Interest Expense"), or none when the label is the row's own description. */
  fixed?: string;
  kind: "section" | "line" | "keyTotal" | "margin" | "subtotal" | "spacer" | "check";
  source?: LadderSource;
  /** The line's tier, for the PF-only rule. */
  tier?: Adjustment["tier"];
  value?: (v: ModelOutput["periods"][string]) => number;
}

function ladderRows(model: ModelOutput): LadderRow[] {
  const adj = model.adjustments;
  const indexed = adj.map((x, i) => ({ x, i }));
  // Every Normalization and Pro forma row has a line, gated on its Status cell, so accepting a row on the Adjustments tab moves
  // the ladder; a row not yet accepted shows its label and a dash.
  const ofTier = (tier: Adjustment["tier"]) => indexed.filter(({ x }) => x.row.tier === tier);
  const refsOf = (rows: number[]) => rows.map((i) => `[${adj[i]!.row.ref}]`).join(" ");
  const fixedLine = (key: string, fixed: string, tier: Adjustment["tier"], category: Adjustment["category"], value: LadderRow["value"]): LadderRow => {
    const rows = indexed.filter(({ x }) => x.row.tier === tier && x.row.category === category).map(({ i }) => i);
    const acceptedRows = rows.filter((i) => adj[i]!.row.status === "accepted");
    return { key, label: acceptedRows.length ? `${fixed} ${refsOf(acceptedRows)}` : fixed, fixed, kind: "line", source: { rows, match: { tier, category } }, tier, value };
  };
  // A signed line takes its sign from the row's fiscal years together, so a one-year add-back keeps its sign in every column.
  const signed = ({ x, i }: { x: (typeof adj)[number]; i: number }): LadderRow => {
    const total = Object.values(x.row.byFiscalYear).reduce((s, v) => s + v, 0);
    return { key: `adj_${x.row.ref}`, label: `${total < 0 ? "(-)" : "(+)"} ${x.row.description} [${x.row.ref}]`, kind: "line", source: { rows: [i] }, tier: x.row.tier, value: undefined };
  };
  const rows: LadderRow[] = [
    { key: "net_income", label: "Net Income", kind: "line", value: (v) => v.ladder.netIncome },
    { key: "sec_definitional", label: "Definitional Adjustments", kind: "section" },
    fixedLine("d_interest", "(+) Interest Expense", "definitional", "interest", (v) => v.ladder.definitional.interest),
    fixedLine("d_taxes", "(+) Income Taxes", "definitional", "taxes", (v) => v.ladder.definitional.taxes),
    fixedLine("d_da", "(+) Depreciation & Amortization", "definitional", "da", (v) => v.ladder.definitional.da),
    { key: "reported_ebitda", label: "Reported EBITDA", kind: "keyTotal", value: (v) => v.ladder.reportedEbitda },
    { key: "reported_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.reportedMargin },
    { key: "sec_normalization", label: "Normalization Adjustments", kind: "section" },
    ...ofTier("normalization").map((r) => ({ ...signed(r), value: (v: ModelOutput["periods"][string]) => v.ladder.normalization.find((i) => i.ref === r.x.row.ref)?.amount ?? 0 })),
    { key: "total_normalization", label: "Total Normalization Adjustments", kind: "subtotal", value: (v) => v.ladder.totalNormalization },
    { key: "sec_owner", label: "Owner Compensation", kind: "section" },
    // [S1] is one working owner's total compensation (guide 5.4): the salary row and, once accepted, the payroll taxes on it.
    fixedLine("s1", "(+) Owner Compensation", "owner_compensation", "owner_compensation", (v) => v.ladder.ownerCompAsPaid),
    { key: "sde", label: "Seller's Discretionary Earnings (SDE)", kind: "keyTotal", value: (v) => v.ladder.sde },
    { key: "sde_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.sdeMargin },
    fixedLine("s2", "(-) Market Replacement Compensation", "owner_compensation", "replacement_cost", (v) => v.ladder.marketReplacement),
    fixedLine("s3", "(-) Capital Reserve (Maintenance Capex)", "owner_compensation", "capital_reserve", (v) => v.ladder.capitalReserve),
    { key: "adj_ebitda", label: "Adj. EBITDA", kind: "keyTotal", value: (v) => v.ladder.adjEbitda },
    { key: "adj_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.adjMargin },
    { key: "sec_pf", label: "Pro Forma Adjustments", kind: "section" },
    ...ofTier("pro_forma").map((r) => ({ ...signed(r), value: (v: ModelOutput["periods"][string]) => v.ladder.proForma.find((i) => i.ref === r.x.row.ref)?.amount ?? 0 })),
    { key: "total_pro_forma", label: "Total Pro Forma Adjustments", kind: "subtotal", value: (v) => v.ladder.totalProForma },
    { key: "pf_adj_ebitda", label: "PF Adj. EBITDA", kind: "keyTotal", value: (v) => v.ladder.pfAdjEbitda },
    { key: "pf_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.pfMargin },
    { key: "sec_memo", label: "Memo: Other Considerations (not included above)", kind: "section" },
    ...indexed
      .filter(({ x }) => x.row.tier === "memo")
      .map<LadderRow>(({ x, i }) => ({ key: `adj_${x.row.ref}`, label: `${x.row.description} [${x.row.ref}]`, kind: "line", source: { rows: [i], anyStatus: true }, tier: "memo", value: (v) => v.ladder.memo.find((m) => m.ref === x.row.ref)?.amount ?? 0 })),
    { key: "sp_check", label: "", kind: "spacer" },
    { key: "check_reported", label: "Check: Reported EBITDA less (Net Income + D1:D3)", kind: "check" },
    { key: "check_schedule", label: "Check: Adjustments schedule less ladder, by tier", kind: "check" },
  ];
  return rows;
}

/** Whole column of the Adjustments tab: a row appended anywhere in the schedule is counted (guide 5.5, dynamic ranges). */
const schedCol = (col: number) => `${S("adjustments")}$${colLetter(col)}:$${colLetter(col)}`;

/** Accepted schedule rows of a tier (and category) in one period column, over whole columns. */
function scheduleSum(periodCol: number, match: NonNullable<LadderSource["match"]>): string {
  const category = match.category ? `,${schedCol(ADJ_CATEGORY_COL)},"${ADJUSTMENT_CATEGORY_LABELS[match.category]}"` : "";
  return `SUMIFS(${schedCol(periodCol)},${schedCol(ADJ_TIER_COL)},"${ADJUSTMENT_TIER_LABELS[match.tier]}"${category},${schedCol(ADJ_STATUS_COL)},"Accepted")`;
}

/** A cell of schedule row `i` (resolved once the Adjustments tab has laid out its rows). */
const schedRowCell = (i: number, col: number, absCol = false) => `${S("adjustments")}${absCol ? "$" : ""}${colLetter(col)}@{adjustments.row${i}}`;

/** A ladder line's amount in one schedule column: a fixed rung's accepted rows by tier and category, else its linked rows gated on status (memo rows are not gated). */
function lineFormula(source: LadderSource, col: number): string {
  if (source.match) return scheduleSum(col, source.match);
  const terms = source.rows.map((i) => {
    const cell = schedRowCell(i, col);
    return source.anyStatus ? `N(${cell})` : `IF(${schedRowCell(i, ADJ_STATUS_COL, true)}="Accepted",N(${cell}),0)`;
  });
  return terms.length ? terms.join("+") : "0";
}

/** The label formula: a fixed rung's wording and the refs of its accepted rows, or a linked row's own description and ref. */
function labelFormula(spec: LadderRow, model: ModelOutput): string | undefined {
  const rows = spec.source?.rows;
  if (!rows?.length) return undefined;
  const ref = (i: number) => schedRowCell(i, ADJ_REF_COL, true);
  if (spec.fixed !== undefined) return `"${spec.fixed}"&${rows.map((i) => `IF(${schedRowCell(i, ADJ_STATUS_COL, true)}="Accepted"," "&${ref(i)},"")`).join("&")}`;
  const i = rows[0]!;
  const text = schedRowCell(i, 3, true);
  if (spec.tier === "memo") return `${text}&" "&${ref(i)}`;
  const fy = adjustmentsLayout(model).cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const sum = `SUM(${schedRowCell(i, fy[0]!.col, true)}:$${colLetter(fy[fy.length - 1]!.col)}@{adjustments.row${i}})`;
  return `IF(${sum}<0,"(-) ","(+) ")&${text}&" "&${ref(i)}`;
}

export function planLadder(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("ladder", SHEET.ladder);
  const l = periodLayout(model, 3);
  applyPeriodWidths(b, l);
  // The Basis column prints as its own range beside the repeated labels, so it can be wide enough to keep every line of the
  // ladder within three lines (C37); at 60 the longer bases stretched their rows on the figures page.
  b.width(l.notesCol, BASIS_APART);
  b.anatomy({ subtitle: "Adjusted EBITDA and SDE ($000s)", lastCol: l.notesCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [...l.groups, { from: l.notesCol, to: l.notesCol, label: "Basis" }]);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], "Adj. EBITDA");
  b.cell(6, l.notesCol, { style: "header", v: "Basis (from the Adjustments schedule)", role: "text", align: { horizontal: "left" } });
  if (l.deltas) {
    b.cell(6, l.deltas.dollar, { style: "header", v: "($)", role: "text" });
    b.cell(6, l.deltas.pct, { style: "header", v: "(%)", role: "text" });
  }
  if (l.scenarios) ["Low", "Mid", "High"].forEach((h, i) => b.cell(6, l.scenarios!.low + i, { style: "header", v: h, role: "text" }));

  const rows = ladderRows(model);
  let r = 8;
  for (const spec of rows) b.row(spec.key, r++);
  const noteRow = r + 1;
  writePeriodHelpers(b, l, model, noteRow + 3);
  const spans = valueSpans(l);
  const adjL = adjustmentsLayout(model);
  const ltmCol = l.cols.find((c) => c.column.ref.kind === "ltm" && !c.column.priorYear);

  for (const spec of rows) {
    const rr = b.r(spec.key);
    const next = rows[rows.indexOf(spec) + 1];
    const labelF = labelFormula(spec, model);
    const labelStyle = spec.kind === "keyTotal" ? "keyTotal" : spec.kind === "subtotal" ? "subtotal" : spec.kind === "margin" ? "margin" : spec.kind === "check" ? "check" : spec.key === "net_income" ? "lineFirst" : "line";
    switch (spec.kind) {
      case "section":
        b.section(rr, spec.label, spans);
        continue;
      case "spacer":
        b.spacerRow(rr);
        continue;
      case "keyTotal":
        b.keyTotalBox([rr, next?.kind === "margin" ? rr + 1 : rr], spans);
        break;
      case "subtotal":
        b.subtotalBorder(rr, spans);
        break;
      default:
    }
    // Labels of lines that read the schedule are formulas on its description and ref cells; the rest are the guide's wording.
    if (labelF) b.formula(rr, 2, labelF, { style: labelStyle, role: "text", expect: spec.label, label: `label ${spec.key}` });
    else b.text(rr, 2, spec.label, { style: labelStyle, ...(spec.kind === "margin" ? { align: { horizontal: "left", indent: 1 } } : {}) });
    const fmt = spec.kind === "margin" ? FMT.pct1 : spec.kind === "check" ? FMT.check : spec.key === "net_income" || spec.kind === "keyTotal" || spec.kind === "subtotal" ? FMT.currency : FMT.body;
    const style = spec.kind === "margin" ? "margin" : spec.kind === "check" ? "check" : spec.kind === "keyTotal" ? "keyTotal" : spec.kind === "subtotal" ? "subtotal" : spec.key === "net_income" ? "lineFirst" : "line";
    for (const { column, col } of l.cols) {
      const pv = model.periods[column.key]!;
      const at = (key: string) => `${colLetter(col)}${b.r(key)}`;
      // The PF column starts from LTM: its net income and the check read the LTM column of the P&L.
      const isPf = column.ref.kind === "pf";
      const pnlColLetter = isPf && ltmCol ? colLetter(ltmCol.col) : colLetter(col);
      const sc = adjL.byKey[column.key]!;
      let f: string | undefined;
      let expect: number | string | undefined = spec.value ? spec.value(pv) / K : undefined;
      switch (spec.key) {
        case "net_income":
          f = `${S("pnl")}${pnlColLetter}${rowOf("pnl", "net_income")}`;
          break;
        case "reported_ebitda":
          f = `${at("net_income")}+${at("d_interest")}+${at("d_taxes")}+${at("d_da")}`;
          break;
        case "total_normalization":
          // The schedule's accepted rows by SUMIFS, so the total moves with the schedule even for a row the ladder does not list; the check below compares it with the lines.
          f = scheduleSum(sc, { tier: "normalization" });
          break;
        case "sde":
          f = `${at("reported_ebitda")}+${at("total_normalization")}+${at("s1")}`;
          break;
        case "adj_ebitda":
          f = `${at("sde")}+${at("s2")}+${at("s3")}`;
          break;
        case "total_pro_forma":
          f = scheduleSum(sc, { tier: "pro_forma" });
          break;
        case "pf_adj_ebitda":
          f = `${at("adj_ebitda")}+${at("total_pro_forma")}`;
          break;
        case "reported_margin":
        case "sde_margin":
        case "adj_margin":
        case "pf_margin": {
          const base = spec.key === "reported_margin" ? "reported_ebitda" : spec.key === "sde_margin" ? "sde" : spec.key === "adj_margin" ? "adj_ebitda" : "pf_adj_ebitda";
          f = `IFERROR(${at(base)}/${S("pnl")}${colLetter(col)}${rowOf("pnl", "revenue")},"n.m.")`;
          expect = pv.pnl.revenue ? spec.value!(pv) : "n.m.";
          break;
        }
        case "check_reported":
          f = `${at("reported_ebitda")}-${S("pnl")}${pnlColLetter}${rowOf("pnl", "reported_ebitda")}`;
          expect = 0;
          break;
        case "check_schedule": {
          // Check C06: the whole schedule by tier against the ladder's lines, so an accepted row the ladder does not list shows here as a difference.
          const tier = (t: Adjustment["tier"]) => scheduleSum(sc, { tier: t });
          const lines = (prefix: string) => sumRows(b, rows, prefix, colLetter(col)) ?? "0";
          f = `ABS(${tier("definitional")}-(${at("d_interest")}+${at("d_taxes")}+${at("d_da")}))+ABS(${tier("normalization")}-${lines("adj_N")})+ABS(${tier("owner_compensation")}-(${at("s1")}+${at("s2")}+${at("s3")}))+ABS(${tier("pro_forma")}-N(${lines("adj_PF")}))`;
          expect = 0;
          break;
        }
        default:
          if (spec.source) {
            if (spec.tier === "pro_forma" && !isPf) {
              b.na(rr, col, "n.a.", { style: "line" });
              continue;
            }
            f = lineFormula(spec.source, sc);
          }
      }
      if (f === undefined) continue;
      b.formula(rr, col, f, { style, fmt, expect, tol: spec.kind === "check" ? 1e-6 : undefined, label: `${spec.key} ${column.label}` });
    }
    if (spec.kind === "check") b.checkCf(rr, l.firstCol, l.lastValueCol);
    const basis = basisFormula(spec, model);
    if (basis) b.formula(rr, l.notesCol, basis.f, { style: "note", role: "text", expect: basis.text, label: `basis ${spec.key}` });
    if (l.deltas && spec.value && spec.tier !== "pro_forma") writeDeltas(b, rr, l, spec.kind === "keyTotal" || spec.kind === "subtotal" || spec.kind === "margin" || spec.kind === "check" ? spec.kind : "line", deltaValues(model, l, (p) => spec.value!(p) / K));
    if (l.scenarios && spec.value) writeLadderScenarios(b, rr, spec, l, model, rows);
  }

  const mainStreet = model.mode.mode === "mainStreet";
  b.note(noteRow, 2, `Note: margins divide by total revenue. ${mainStreet ? "Main Street mode: SDE is the headline; the capital reserve [S3] is deducted below SDE." : "Lower-middle-market mode: [S3] is zero and the CIM collapses [S1] and [S2] into one owner compensation normalization line."} The PF column starts from LTM net income and adds the accepted pro forma rows below Adj. EBITDA. Each line links to its schedule row, so a row inserted on the Adjustments tab renumbers the refs here.`);
  // Two ranges: the figures one landscape page wide, then the Basis column beside the repeated labels. Printed together the
  // 60-wide Basis pushed the figures under the 7 pt floor and the fit squeezed Basis to a narrow column of tall rows.
  b.print({ areas: [`B2:${addr(noteRow, l.lastValueCol)}`, `${addr(7, l.notesCol)}:${addr(r - 1, l.notesCol)}`], landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6", titlesCol: "B:B" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  const fyCols = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const named = (name: string, key: string, cols: { col: number }[]) => cols.length && b.defineName(name, `$${colLetter(cols[0]!.col)}$${b.r(key)}:$${colLetter(cols[cols.length - 1]!.col)}$${b.r(key)}`);
  named("SDE_FY", "sde", fyCols);
  named("AdjEBITDA_FY", "adj_ebitda", fyCols);
  if (ltmCol) {
    named("SDE_LTM", "sde", [ltmCol]);
    named("AdjEBITDA_LTM", "adj_ebitda", [ltmCol]);
  }
  const pfCol = l.cols.find((c) => c.column.ref.kind === "pf") ?? l.cols.at(-1)!;
  named("PFAdjEBITDA", "pf_adj_ebitda", [pfCol]);
  return b;
}

/**
 * Column Q of the ladder (guide 5.4): each line's Basis from the schedule,
 * linked, beside its figures. A fixed rung carries the basis of each of its
 * accepted rows; a line of its own carries its row's basis whatever its status.
 */
function basisFormula(spec: LadderRow, model: ModelOutput): { f: string; text: string } | undefined {
  const rows = spec.source?.rows;
  if (!rows?.length) return undefined;
  const one = (i: number) => `${schedRowCell(i, ADJ_REF_COL, true)}&" "&${schedRowCell(i, ADJ_BASIS_COL, true)}`;
  const text = (i: number) => `[${model.adjustments[i]!.row.ref}] ${model.adjustments[i]!.row.basis}`;
  if (spec.fixed === undefined) return { f: one(rows[0]!), text: text(rows[0]!) };
  const status = (i: number) => `${schedRowCell(i, ADJ_STATUS_COL, true)}="Accepted"`;
  const accepted = rows.filter((i) => model.adjustments[i]!.row.status === "accepted");
  if (rows.length === 1) return { f: `IF(${status(rows[0]!)},${one(rows[0]!)},"")`, text: accepted.map(text).join("") };
  // A rung that sums several rows ([S1] salary and [S4] its payroll taxes) names each accepted row; their bases are on the
  // Adjustments schedule, and all of them here would stretch the row past three lines.
  const named = (i: number) => `${schedRowCell(i, ADJ_REF_COL, true)}&" "&${schedRowCell(i, 3, true)}`;
  const f = `TRIM(${rows.map((i) => `IF(${status(i)},${named(i)}&" ","")`).join("&")})`;
  // TRIM also folds runs of spaces inside the text, so the expectation does too.
  return { f, text: accepted.map((i) => `[${model.adjustments[i]!.row.ref}] ${model.adjustments[i]!.row.description}`).join(" ").replace(/ {2,}/g, " ").trim() };
}

/** SUM over a tier's ladder rows, or undefined when the tier has no accepted rows. */
function sumRows(b: SheetBuilder, rows: LadderRow[], prefix: string, col: string): string | undefined {
  const keys = rows.filter((x) => x.key.startsWith(prefix)).map((x) => `${col}${b.r(x.key)}`);
  return keys.length ? `SUM(${keys[0]}:${keys[keys.length - 1]})` : undefined;
}

/** Annual-only mode: the ladder's Low / Mid / High columns read the scenario P&L and the latest year's schedule. */
function writeLadderScenarios(b: SheetBuilder, r: number, spec: LadderRow, l: PeriodLayout, model: ModelOutput, rows: LadderRow[]): void {
  if (!l.scenarios || !model.scenarios) return;
  const adjL = adjustmentsLayout(model);
  const fy = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const latestSched = adjL.byKey[fy[fy.length - 1]!.column.key]!;
  model.scenarios.forEach((sc, i) => {
    const col = l.scenarios!.low + i;
    const at = (key: string) => `${colLetter(col)}${b.r(key)}`;
    const pv = { pnl: sc.pnl, ladder: sc.ladder } as ModelOutput["periods"][string];
    let f: string | undefined;
    let expect: number | string | undefined = spec.value ? spec.value(pv) / K : undefined;
    const fmt = spec.kind === "margin" ? FMT.pct1 : spec.kind === "check" ? FMT.check : spec.key === "net_income" || spec.kind === "keyTotal" || spec.kind === "subtotal" ? FMT.currency : FMT.body;
    const style = spec.kind === "margin" ? "margin" : spec.kind === "keyTotal" ? "keyTotal" : spec.kind === "subtotal" ? "subtotal" : spec.key === "net_income" ? "lineFirst" : "line";
    switch (spec.key) {
      case "net_income":
        f = `${S("pnl")}${colLetter(col)}${rowOf("pnl", "net_income")}`;
        break;
      case "reported_ebitda":
        f = `${at("net_income")}+${at("d_interest")}+${at("d_taxes")}+${at("d_da")}`;
        break;
      case "total_normalization":
        f = sumRows(b, rows, "adj_N", colLetter(col)) ?? scheduleSum(latestSched, { tier: "normalization" });
        break;
      case "sde":
        f = `${at("reported_ebitda")}+${at("total_normalization")}+${at("s1")}`;
        break;
      case "adj_ebitda":
        f = `${at("sde")}+${at("s2")}+${at("s3")}`;
        break;
      case "total_pro_forma":
        // Pro forma rows are run-rate changes to the latest period; the annual scenarios restate the lines instead.
        b.na(r, col, "n.a.", { style });
        return;
      case "pf_adj_ebitda":
        f = `${at("adj_ebitda")}+N(${at("total_pro_forma")})`;
        break;
      case "reported_margin":
      case "sde_margin":
      case "adj_margin":
      case "pf_margin": {
        const base = spec.key === "reported_margin" ? "reported_ebitda" : spec.key === "sde_margin" ? "sde" : spec.key === "adj_margin" ? "adj_ebitda" : "pf_adj_ebitda";
        f = `IFERROR(${at(base)}/${S("pnl")}${colLetter(col)}${rowOf("pnl", "revenue")},"n.m.")`;
        expect = sc.pnl.revenue ? spec.value!(pv) : "n.m.";
        break;
      }
      default:
        if (spec.source && spec.tier !== "pro_forma") f = lineFormula(spec.source, latestSched);
    }
    if (f !== undefined) b.formula(r, col, f, { style, fmt, expect, label: `${spec.key} ${sc.name}` });
  });
}

// --- Adjustments schedule -------------------------------------------------------------------------

const TEXT_HEADERS = ["Ref", "Adjustment", "Tier", "Category", "Basis", "Source document", "Evidence", "Status", "In CIM", "P&L line", "PF method"];
/**
 * Widths of D:L. The tab prints as two ranges, the schedule text (B:L) and
 * the periods (N onward) with Ref and Adjustment repeated as title columns,
 * both fitted to one landscape page wide: one range at a single-page fit put
 * Arial 9 near 4 pt. The text block stays near 160 wide so it prints at about
 * 80% (Arial 9 at 7 pt or more).
 */
const TEXT_WIDTHS_D_TO_L = [11, 12, 34, 16, 12, 9, 6, 8, 10];
const REF_WIDTH = 7;

const STATUS_LABEL: Record<Adjustment["status"], string> = { proposed: "Proposed", supported: "Supported", accepted: "Accepted", excluded: "Excluded" };
const EVIDENCE_LABEL = { documented: "Documented", management_representation: "Management representation", pending: "To be requested" } as const;

export function planAdjustments(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("adjustments", SHEET.adjustments);
  const l = adjustmentsLayout(model);
  const months = gridMonths(model);
  const n = months.length;
  const monthStart = adjMonthStart(model);
  const lastMonthCol = n ? monthStart + n - 1 : monthStart - 1;
  const lastCol = n ? lastMonthCol : l.lastValueCol;
  b.width(1, WIDTH.gutter);
  b.width(2, REF_WIDTH);
  // Column C repeats with B on the period pages; holdTitleInTitleColumns widens it when the company name needs more room there.
  b.width(3, WIDTH.labelAdjustments);
  TEXT_WIDTHS_D_TO_L.forEach((w, i) => b.width(4 + i, w));
  b.spacerCol(13);
  for (let c = l.firstCol; c <= l.lastValueCol; c++) b.width(c, WIDTH.value);
  for (const s of l.spacers) b.spacerCol(s);
  if (n) {
    b.widths(monthStart, lastMonthCol, WIDTH.value);
    b.outlineCols(monthStart, lastMonthCol, 1);
  }
  b.anatomy({ subtitle: "Recast and Adjustments Schedule ($000s)", lastCol: l.lastValueCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 12, label: "Schedule" }, ...l.groups, ...(n ? [{ from: monthStart, to: lastMonthCol, label: "Monthly ($000s)" }] : [])]);
  TEXT_HEADERS.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i < 8 ? "left" : "center" } }));
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, []);
  if (n) writeMonthHeaders(b, 6, monthStart, months);

  const first = 8;
  const adj = model.adjustments;
  const last = first + adj.length - 1;
  b.row("first", first);
  b.row("last", last);
  // The ladder links to each schedule row by its position here.
  adj.forEach((_, i) => b.row(`row${i}`, first + i));
  const noteRow = last + 2;
  // The period pages print from a compact copy of the schedule's figures, one line per adjustment: the schedule rows grow to
  // fit their Basis text, and printed beside the periods those heights stretched every period page (guide 5.11).
  const compactHead = noteRow + 2;
  const compactFirst = compactHead + 1;
  const tierFirst = compactFirst + adj.length + 2;
  const tierKeys = ["tier_definitional", "tier_normalization", "tier_s1", "tier_s2", "tier_s3", "tier_pro_forma", "tier_memo"] as const;
  tierKeys.forEach((k, i) => b.row(k, tierFirst + i));
  b.row("tierFirst", tierFirst);
  b.row("tierLast", tierFirst + tierKeys.length - 1);
  const lastPrinted = tierFirst + tierKeys.length - 1;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 3);
  const monthHeaderRow = n ? `$${colLetter(monthStart)}$6:$${colLetter(lastMonthCol)}$6` : "";
  const monthRowRange = (r: number) => `$${colLetter(monthStart)}${r}:$${colLetter(lastMonthCol)}${r}`;
  const fyCols = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const series = model.monthly?.series;
  const latestFy = fyCols[fyCols.length - 1]?.column.fiscalYear;

  // A fiscal year of employer payroll taxes at statutory rates, on the salary row's same fiscal year: Social Security to the
  // year's wage base, Medicare on all of it, FUTA on the first $7,000, in whole dollars as the engine rounds them.
  const statutoryTaxes = (row: Adjustment, fy: number, col: number): string | undefined => {
    const salary = row.statutoryTaxesOn ? adj.findIndex((y) => y.row.ref === row.statutoryTaxesOn) : -1;
    if (salary < 0) return undefined;
    const pay = `${addr(first + salary, col)}*${K}`;
    return `ROUND(MIN(${pay},${A(`taxSsBase_${fy}`)})*${A("taxSocialSecurity")}+${pay}*${A("taxMedicare")}+MIN(${pay},${A("taxFutaBase")})*${A("taxFuta")},0)/${K}`;
  };

  adj.forEach((x, idx) => {
    const r = first + idx;
    const row = x.row;
    b.formula(r, ADJ_REF_COL, `"["&CHOOSE(MATCH(${addr(r, ADJ_TIER_COL)},{"Definitional","Normalization","Owner compensation","Pro forma","Memo"},0),"D","N","S","PF","M")&COUNTIF($${colLetter(ADJ_TIER_COL)}$${first}:${addr(r, ADJ_TIER_COL)},${addr(r, ADJ_TIER_COL)})&"]"`, {
      expect: `[${row.ref}]`,
      label: `ref ${row.ref}`,
      align: { horizontal: "left" },
    });
    const wrap = { wrap: true, vertical: "top" } as const;
    b.text(r, 3, row.description, { align: wrap });
    b.cell(r, ADJ_TIER_COL, { v: ADJUSTMENT_TIER_LABELS[row.tier], role: "input", align: wrap });
    b.cell(r, ADJ_CATEGORY_COL, { v: ADJUSTMENT_CATEGORY_LABELS[row.category], role: "input", align: wrap });
    b.text(r, ADJ_BASIS_COL, row.basis, { align: wrap });
    b.text(r, 7, row.sourceDocument, { align: wrap });
    b.cell(r, 8, { v: EVIDENCE_LABEL[row.evidence], role: "input", align: wrap });
    b.cell(r, ADJ_STATUS_COL, { v: STATUS_LABEL[row.status], role: "input", align: { horizontal: "center" } });
    b.formula(r, 10, `IF(${addr(r, ADJ_STATUS_COL)}="Accepted","Yes","No")`, { expect: row.status === "accepted" ? "Yes" : "No", label: `in CIM ${row.ref}`, align: { horizontal: "center" } });
    b.text(r, 11, row.pnlLine ? IS_LABELS[row.pnlLine] : "", { align: { horizontal: "center" } });
    b.text(r, 12, row.pfMethod ?? "", { align: { wrap: true, vertical: "top" } });
    // Months exactly when the engine has them (adjustmentInWindow): a row without months is prorated from its fiscal years.
    const hasMonths = n > 0 && !!row.byMonth;
    const isPf = row.tier === "pro_forma";
    // An add-back tied to months by proportion: its fiscal years (and a YTD stub amount) are the blue inputs, each month a formula.
    const allocation = hasMonths ? allocationFormulas(row, model, r, l) : undefined;
    // Month cells.
    if (hasMonths) {
      months.forEach((m, i) => {
        const col = monthStart + i;
        const link = allocation?.[i] ?? monthLink(row, model, i);
        const engine = amountForMonth(row, model, i);
        if (link?.f) b.formula(r, col, link.f, { fmt: FMT.body, expect: engine / K, label: `${row.ref} ${m}` });
        else b.num(r, col, engine / K, { fmt: FMT.body });
      });
    } else if (n > 0 && !isPf) {
      // A row without months spreads each fiscal year evenly over its months, as the engine prorates it, so the tier totals by month hold it.
      months.forEach((m, i) => {
        const col = monthStart + i;
        const fy = model.monthly!.months[i]!.fiscalYear;
        const fyCol = fyCols.find((c) => c.column.fiscalYear === fy);
        const engine = (row.byFiscalYear[fy] ?? 0) / 12 / K;
        if (fyCol) b.formula(r, col, `${addr(r, fyCol.col)}/12`, { fmt: FMT.body, expect: engine, label: `${row.ref} ${m} (prorated)` });
        else b.num(r, col, engine, { fmt: FMT.body });
      });
    }
    // Period cells.
    for (const { column, col } of l.cols) {
      const key = column.key;
      const isPfColumn = column.ref.kind === "pf";
      const engine = (x.byColumn[key] ?? 0) / K;
      if (isPf && !isPfColumn) {
        b.na(r, col, "n.a.", { style: "line" });
        continue;
      }
      const taxes = column.ref.kind === "fiscal_year" ? statutoryTaxes(row, column.fiscalYear!, col) : undefined;
      if (taxes && (allocation || !hasMonths)) {
        b.formula(r, col, taxes, { fmt: FMT.body, expect: engine, label: `${row.ref} ${column.label} (statutory)` });
        continue;
      }
      if (allocation && (column.ref.kind === "fiscal_year" || (column.ref.kind === "ytd" && !column.priorYear && row.stub === "amount"))) {
        // The inputs the month formulas scale: each fiscal year, and the YTD amount the advisor gave for the stub.
        b.num(r, col, engine, { fmt: FMT.body });
        continue;
      }
      if (hasMonths) {
        const f = sumifsFormula({ valuesRow: monthRowRange(r), monthsRow: monthHeaderRow, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) });
        b.formula(r, col, f, { fmt: FMT.body, expect: engine, label: `${row.ref} ${column.label}` });
        continue;
      }
      if (column.ref.kind === "fiscal_year") {
        b.num(r, col, (row.byFiscalYear[column.fiscalYear!] ?? 0) / K, { fmt: FMT.body });
        continue;
      }
      if (isPf && isPfColumn) {
        b.num(r, col, (latestFy !== undefined ? (row.byFiscalYear[latestFy] ?? 0) : 0) / K, { fmt: FMT.body });
        continue;
      }
      // YTD, LTM and PF for rows without months: fiscal-year amounts prorated by months in the window.
      const f = prorationFormula(
        fyCols.map((fc) => ({ amountCell: addr(r, fc.col), startCell: addr(helpers.start, fc.col, { row: true }), endCell: addr(helpers.end, fc.col, { row: true }) })),
        addr(helpers.start, col, { row: true }),
        addr(helpers.end, col, { row: true }),
      );
      b.formula(r, col, f, { fmt: FMT.body, expect: engine, label: `${row.ref} ${column.label} (prorated)` });
    }
    if (idx > 0 && adj[idx - 1]!.row.tier !== row.tier) for (let c = 2; c <= lastCol; c++) b.cell(r, c, { border: { top: "thin" } });

    // The compact line for print: Ref and Adjustment (the repeated title columns) and each period figure, linked.
    const cr = compactFirst + idx;
    b.formula(cr, 2, addr(r, ADJ_REF_COL), { expect: `[${row.ref}]`, label: `print ref ${row.ref}`, align: { horizontal: "left" } });
    b.formula(cr, 3, addr(r, 3), { expect: row.description, label: `print label ${row.ref}`, align: { horizontal: "left", wrap: true } });
    for (const { column, col } of l.cols) {
      if (isPf && column.ref.kind !== "pf") b.na(cr, col, "n.a.", { style: "line" });
      else b.formula(cr, col, addr(r, col), { fmt: FMT.body, expect: (x.byColumn[column.key] ?? 0) / K, label: `print ${row.ref} ${column.label}` });
    }
    if (idx > 0 && adj[idx - 1]!.row.tier !== row.tier) for (let c = 2; c <= l.lastValueCol; c++) if (c <= 3 || c >= l.firstCol) b.cell(cr, c, { border: { top: "thin" } });
  });
  b.text(compactHead, 3, "Figures by period (links)", { style: "subsection", align: { horizontal: "left", wrap: false } });

  // Ladder totals by tier (accepted rows), per period and per month, for the ladder and the monthly grid.
  b.section(tierFirst - 1, "Ladder totals by tier (accepted rows)", [[2, 12], ...valueSpans(l), ...(n ? [[monthStart, lastMonthCol] as [number, number]] : [])]);
  const tierSpecs: { key: (typeof tierKeys)[number]; label: string; crit: (col: number) => string; series: string; byColumn: (key: string) => number }[] = [
    { key: "tier_definitional", label: "Definitional [D]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Definitional",${col(ADJ_STATUS_COL)},"Accepted"`, series: "definitional", byColumn: (k) => sumTier(model, k, (r) => r.tier === "definitional") },
    { key: "tier_normalization", label: "Normalization [N]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Normalization",${col(ADJ_STATUS_COL)},"Accepted"`, series: "total_normalization", byColumn: (k) => sumTier(model, k, (r) => r.tier === "normalization") },
    // The owner-compensation rungs count only S-tier rows: an owner perk the advisor lists as an N row is a normalization.
    { key: "tier_s1", label: "Owner compensation [S1]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Owner compensation",${col(ADJ_CATEGORY_COL)},"Owner compensation",${col(ADJ_STATUS_COL)},"Accepted"`, series: "owner_comp_as_paid", byColumn: (k) => sumTier(model, k, (r) => r.tier === "owner_compensation" && r.category === "owner_compensation") },
    { key: "tier_s2", label: "Market replacement compensation [S2]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Owner compensation",${col(ADJ_CATEGORY_COL)},"Replacement cost",${col(ADJ_STATUS_COL)},"Accepted"`, series: "market_replacement", byColumn: (k) => sumTier(model, k, (r) => r.tier === "owner_compensation" && r.category === "replacement_cost") },
    { key: "tier_s3", label: "Capital reserve [S3]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Owner compensation",${col(ADJ_CATEGORY_COL)},"Capital reserve",${col(ADJ_STATUS_COL)},"Accepted"`, series: "capital_reserve", byColumn: (k) => sumTier(model, k, (r) => r.tier === "owner_compensation" && r.category === "capital_reserve") },
    { key: "tier_pro_forma", label: "Pro forma [PF]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Pro forma",${col(ADJ_STATUS_COL)},"Accepted"`, series: "total_pro_forma", byColumn: (k) => sumTier(model, k, (r) => r.tier === "pro_forma") },
    { key: "tier_memo", label: "Memo (listed, never added) [M]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Memo"`, series: "", byColumn: (k) => sumTier(model, k, (r) => r.tier === "memo", true) },
  ];
  // The range runs to the blank row under the schedule, so a row inserted anywhere in it, or typed into that blank row, is
  // counted; whole columns would be circular here. The ladder's check reads whole columns from its own tab.
  function col(c: number): string {
    return `$${colLetter(c)}$${first}:$${colLetter(c)}$${last + 1}`;
  }
  for (const t of tierSpecs) {
    const r = b.r(t.key);
    // Labels sit in the Adjustment column, which prints beside the periods; the narrow Ref column would wrap them to single words.
    b.text(r, 3, t.label, { style: "line" });
    for (const { column, col: c } of l.cols) {
      b.formula(r, c, `SUMIFS(${t.crit(c)})`, { fmt: FMT.body, expect: t.byColumn(column.key) / K, label: `${t.key} ${column.label}` });
    }
    if (n) {
      months.forEach((m, i) => {
        const c = monthStart + i;
        const expect = t.series ? (series![t.series]?.[i] ?? 0) / K : 0;
        b.formula(r, c, `SUMIFS(${t.crit(c)})`, { fmt: FMT.body, expect, label: `${t.key} ${m}` });
      });
    }
  }
  b.cell(b.r("tier_s3"), 3, { v: `Capital reserve [S3]${model.mode.mode === "mainStreet" ? "" : " (zero outside Main Street mode)"}` });
  b.note(noteRow, 2, "Note: a positive amount increases EBITDA. Refs number by tier in row order (insert a row and every ref renumbers). Status is an input: set a row to Accepted and it enters the ladder on Adj. EBITDA, which lists every Normalization and Pro forma row; Proposed, Supported and Excluded rows stay out of every total. Rows with months are exact for YTD and LTM; rows without months are prorated by fiscal-year months in the window.");
  // Two ranges, each one page wide: the schedule text with its note, then the compact figures and the tier totals with Ref and
  // Adjustment repeated beside them, so the period pages carry one line per adjustment.
  b.print({ areas: [`B2:${addr(noteRow, 12)}`, `${addr(compactHead, l.firstCol)}:${addr(lastPrinted, l.lastValueCol)}`], landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6", titlesCol: "B:C" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

function sumTier(model: ModelOutput, columnKey: string, pick: (r: Adjustment) => boolean, allStatuses = false): number {
  return model.adjustments.filter((x) => pick(x.row) && (allStatuses || x.row.status === "accepted")).reduce((s, x) => s + (x.byColumn[columnKey] ?? 0), 0);
}

/**
 * Month formulas for an add-back the data layer allocated by proportion
 * (ingest/adjustments.ts monthsForRow): a month of a full fiscal year is that
 * year's amount (the row's blue fiscal-year cell) × the named accounts'
 * month ÷ their fiscal year on the Databook, or a twelfth when the row names
 * no account; a stub month follows the row's stub rule (the YTD cell, a
 * run-rate of the latest year, or a typed zero). Returns undefined when the
 * row's months do not follow that rule (a hand-entered spread), which then
 * stays typed.
 */
function allocationFormulas(row: Adjustment, model: ModelOutput, r: number, l: PeriodLayout): ({ f?: string } | undefined)[] | undefined {
  // File rows, and the bot's own estimates that follow an account (the owner's payroll taxes follow officer compensation).
  if (row.origin !== "advisor" && row.origin !== "addbacks_csv" && !(row.origin === "suggested" && row.accounts?.length)) return undefined;
  const grid = model.monthly!;
  const hist = model.columns.filter((c) => !c.projected);
  const accounts = row.accounts ?? [];
  const db = model.databook?.pnl ?? [];
  if (accounts.some((a) => !db.some((d) => d.account === a))) return undefined;
  const weight = (m: string) => (accounts.length ? accounts.reduce((s, a) => s + (db.find((d) => d.account === a)!.byMonth?.[m] ?? 0), 0) : 1);
  const fyCell = (fy: number) => {
    const c = l.cols.find((x) => x.column.ref.kind === "fiscal_year" && x.column.fiscalYear === fy);
    return c ? addr(r, c.col) : undefined;
  };
  const ytd = l.cols.find((x) => x.column.ref.kind === "ytd" && !x.column.priorYear);
  const dbCol = (key: string) => DATABOOK_COL.periodStart + hist.findIndex((c) => c.key === key);
  const dbRange = (c: number) => `${S("databook")}$${colLetter(c)}$${rowOf("databook", "first")}:$${colLetter(c)}$${rowOf("databook", "last")}`;
  const acc = (c: number) => accounts.map((a) => `SUMIFS(${dbRange(c)},${dbRange(DATABOOK_COL.account)},"${a.replace(/"/g, '""')}")`).join("+");
  const share = (monthDbCol: number, amount: string, baseDbCol: number, n: number) => (accounts.length ? `IFERROR((${acc(monthDbCol)})*${amount}/(${acc(baseDbCol)}),${amount}/${n})` : `${amount}/${n}`);
  const latestFy = hist.filter((c) => c.ref.kind === "fiscal_year").at(-1)?.fiscalYear;
  const stubKeys = grid.months.filter((m) => !hist.some((c) => c.ref.kind === "fiscal_year" && c.fiscalYear === m.fiscalYear)).map((m) => m.key);
  const out: ({ f?: string } | undefined)[] = [];
  for (const [i, m] of grid.months.entries()) {
    const monthDbCol = MONTH_START + i;
    let f: string | undefined;
    let value: number;
    const fy = m.fiscalYear;
    if (!stubKeys.includes(m.key)) {
      const cell = fyCell(fy);
      if (!cell) return undefined;
      const months = grid.months.filter((x) => x.fiscalYear === fy).map((x) => x.key);
      const w = months.reduce((s, x) => s + weight(x), 0);
      value = w ? ((row.byFiscalYear[fy] ?? 0) * weight(m.key)) / w : (row.byFiscalYear[fy] ?? 0) / 12;
      f = share(monthDbCol, cell, dbCol(`FY${fy}`), 12);
    } else if (row.stub === "amount" && ytd) {
      const total = stubKeys.reduce((s, x) => s + (row.byMonth![x] ?? 0), 0);
      const w = stubKeys.reduce((s, x) => s + weight(x), 0);
      value = w ? (total * weight(m.key)) / w : total / stubKeys.length;
      f = share(monthDbCol, addr(r, ytd.col), dbCol(ytd.column.key), stubKeys.length);
    } else if (row.stub === "run_rate" && latestFy !== undefined && fyCell(latestFy)) {
      const months = grid.months.filter((x) => x.fiscalYear === latestFy).map((x) => x.key);
      const w = months.reduce((s, x) => s + weight(x), 0);
      value = w ? ((row.byFiscalYear[latestFy] ?? 0) * weight(m.key)) / w : (row.byFiscalYear[latestFy] ?? 0) / 12;
      f = share(monthDbCol, fyCell(latestFy)!, dbCol(`FY${latestFy}`), 12);
    } else if (row.stub === "zero") {
      value = 0;
    } else return undefined;
    if (Math.abs(value - (row.byMonth![m.key] ?? 0)) > 0.005) return undefined;
    out.push(f ? { f } : {});
  }
  return out;
}

/** The engine's amount for a schedule row in one month. */
function amountForMonth(row: Adjustment, model: ModelOutput, i: number): number {
  return row.byMonth?.[model.monthly!.months[i]!.key] ?? 0;
}

function categoryOf(row: Adjustment): { category: IsCategory; sign: 1 | -1 } | undefined {
  if (row.tier === "definitional") return { category: row.category === "interest" ? "interest_expense" : row.category === "taxes" ? "income_tax" : "depreciation_amortization", sign: 1 };
  if (row.origin === "owner_comp") return { category: "owner_comp", sign: 1 };
  return undefined;
}

/**
 * A month cell links to the monthly grid when the row is the P&L category
 * itself (D rows, S1, a non-operating row equal to the whole other-income or
 * other-expense line) and to Assumptions for S2 and S3; anything else is the
 * data layer's monthly amount, typed.
 */
function monthLink(row: Adjustment, model: ModelOutput, i: number): { f: string } | undefined {
  const months = model.monthly!.months;
  const colL = colLetter(MONTH_START + i);
  const series = model.monthly!.series;
  const equalsSeries = (key: string, sign: 1 | -1) => months.every((m, k) => Math.abs((row.byMonth?.[m.key] ?? 0) - sign * series[key]![k]!) < 0.005);
  const cat = categoryOf(row);
  if (cat && equalsSeries(cat.category, cat.sign)) return { f: `${S("monthly")}${colL}${rowOf("monthly", cat.category === "interest_expense" ? "interest" : cat.category === "income_tax" ? "tax" : cat.category === "depreciation_amortization" ? "da" : "owner_comp")}` };
  if (row.origin === "replacement_salary") return { f: `-${A("replacementCost")}/12/${K}` };
  if (row.origin === "capital_reserve") return { f: `-IF(${A("mainStreetMode")}=1,${A("capitalReserve")},0)/12/${K}` };
  if (row.origin === "pnl" && row.category === "non_operating") {
    if (equalsSeries("other_income", -1)) return { f: `-${S("monthly")}${colL}${rowOf("monthly", "other_income")}` };
    if (equalsSeries("other_expense", 1)) return { f: `${S("monthly")}${colL}${rowOf("monthly", "other_expense")}` };
  }
  return undefined;
}
