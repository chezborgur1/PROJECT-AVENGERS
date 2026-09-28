// P&L Summary, the Adj. EBITDA ladder and the Adjustments schedule (guide
// 5.1 rows 5-7, 5.3, 5.4). Every period cell is a SUMIFS over the monthly
// grid or the schedule's own month cells; nothing on the ladder is typed.

import { ADJUSTMENT_CATEGORY_LABELS, ADJUSTMENT_TIER_LABELS, IS_LABELS, type Adjustment, type IsCategory } from "../../domain/financials.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import { A, type TabContext } from "./assumptionsTab.ts";
import { ADJ_MONTH_START, DATABOOK_FIRST_ROW, MONTHLY_FIRST_ROW, MONTH_START, pnlRows, priorColumn, stylePnlRow, valueStyle, writeDeltas, type PnlValues } from "./data.ts";
import {
  ADJ_BASIS_COL,
  ADJ_CATEGORY_COL,
  ADJ_PERIOD_START,
  ADJ_REF_COL,
  ADJ_STATUS_COL,
  ADJ_TIER_COL,
  adjustmentsLayout,
  applyPeriodWidths,
  gridMonths,
  periodLayout,
  prorationFormula,
  S,
  scheduleColumn,
  scheduleRef,
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
  b.tier1(5, [...l.groups, { from: l.notesCol, to: l.notesCol, label: "Notes" }]);
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
  const kpiKeys = kpiRows(model);
  for (const k of kpiKeys) b.row(k.key, r++);
  r++;
  b.row("check", r);
  const checkRow = r;
  r++;
  const lastPrinted = r;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 2);
  const spans = valueSpans(l);
  const monthly = !!model.monthly;
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
        const prior = priorColumn(model, column, l);
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
        const dbCol = colLetter(9 + l.cols.findIndex((x) => x.column.key === column.key));
        const crit = spec.account
          ? `${S("databook")}$B$${dbFirst}:$B$${dbLast},"${spec.account.replace(/"/g, '""')}"`
          : `${S("databook")}$E$${dbFirst}:$E$${dbLast},"${spec.category}"`;
        f = `SUMIFS(${S("databook")}${dbCol}$${dbFirst}:${dbCol}$${dbLast},${crit})/${K}`;
      }
      b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${column.label}` });
    }
    if (l.deltas) writeDeltas(b, rr, l, spec.kind === "margin" || spec.kind === "ratio");
    if (l.scenarios) writeScenarioCells(b, rr, spec, l, model);
  }
  // Basis notes for the PF column's restated lines.
  for (const adj of model.adjustments) {
    if (adj.row.tier !== "pro_forma" || adj.row.status !== "accepted" || !adj.row.pnlLine) continue;
    const key = rows.find((x) => x.category === adj.row.pnlLine)?.key;
    if (key) b.note(b.r(key), l.notesCol, `PF: ${adj.row.pfMethod ?? "Pro forma"} [${adj.row.ref}]`, { align: { wrap: false } });
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
      if (spec.f) b.formula(rr, col, spec.f, { style: "line", fmt: k.fmt, expect: spec.expect, label: `${k.key} ${column.label}` });
      else b.num(rr, col, spec.v!, { style: "line", fmt: k.fmt });
    }
    if (k.note) b.note(rr, l.notesCol, k.note, { align: { wrap: false } });
  }
  // Check C04: net income against the grid, every column.
  b.text(checkRow, 2, "Check: Net Income less Monthly P&L", { style: "check" });
  if (monthly) {
    for (const { col } of l.cols) {
      b.formula(checkRow, col, `${addr(b.r("net_income"), col)}-${S("monthly")}${addr(rowOf("monthly", "net_income") as unknown as number, col)}`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: "C04" });
    }
    b.checkCf(checkRow, l.firstCol, l.lastValueCol);
  } else b.na(checkRow, l.firstCol, "n.a.", { style: "check" });
  b.note(lastPrinted, 2, monthly ? "Note: every period column is a SUMIFS over the Monthly P&L grid for the window in the helper rows below. Margins divide by total revenue." : `Note: full fiscal years only; source: ${model.databook?.pnl[0]?.file ?? "annual P&L"}. Pro forma columns apply the scenario methods on Assumptions.`);
  b.print({ area: `B2:${addr(lastPrinted, l.notesCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
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

interface KpiRow {
  key: string;
  label: string;
  fmt: string;
  note?: string;
  cell: (column: ModelOutput["columns"][number], col: number, at: (key: string) => string, helpers: { start: number; end: number }, pv: ModelOutput["periods"][string]) => { f?: string; v?: number; expect?: number } | undefined;
}

/** KPI rows: counts from the raw lists at the period end, ratios from the statement above, management figures typed with the footnote. */
function kpiRows(model: ModelOutput): KpiRow[] {
  const rows: KpiRow[] = [];
  const hasCustomers = !!model.customers;
  const hasPayroll = !!model.headcount;
  const rc = S("rawCustomers");
  const rp = S("rawPayroll");
  if (hasCustomers) {
    rows.push({
      key: "kpi_customers",
      label: "Customers, active at period end (#)",
      fmt: FMT.body,
      cell: (column, col, _at, h, pv) => {
        const end = addr(h.end, col, { row: true });
        return { f: `COUNTIFS(${rc}$E:$E,"<="&${end},${rc}$F:$F,"")+COUNTIFS(${rc}$E:$E,"<="&${end},${rc}$F:$F,">="&${end})`, expect: pv.kpis.customers };
      },
    });
    rows.push({
      key: "kpi_revenue_per_customer",
      label: "Revenue per customer ($)",
      fmt: FMT.currency,
      cell: (column, col, at, _h, pv) => ({ f: `IFERROR(${at("revenue")}*${K}/${at("kpi_customers")},0)`, expect: pv.kpis.revenue_per_customer ?? 0 }),
    });
  }
  if (hasPayroll) {
    rows.push({
      key: "kpi_employees",
      label: "Employees, non-owner FTE at period end (#)",
      fmt: FMT.oneDp,
      cell: (column, col, _at, h, pv) => {
        const end = addr(h.end, col, { row: true });
        const base = `${rp}$K:$K,${rp}$G:$G,"<="&${end},${rp}$E:$E,"No"`;
        return { f: `SUMIFS(${base},${rp}$H:$H,"")+SUMIFS(${base},${rp}$H:$H,">"&${end})`, expect: pv.kpis.revenue_per_employee ? pv.pnl.revenue / pv.kpis.revenue_per_employee : fteAt(model, column.end) };
      },
    });
    rows.push({
      key: "kpi_revenue_per_employee",
      label: "Revenue per employee ($)",
      fmt: FMT.currency,
      cell: (column, col, at, _h, pv) => (column.months === 12 ? { f: `IFERROR(${at("revenue")}*${K}/${at("kpi_employees")},0)`, expect: pv.kpis.revenue_per_employee ?? 0 } : undefined),
    });
  }
  rows.push({
    key: "kpi_labor_cost",
    label: "Labor cost, % of revenue (excludes owner)",
    fmt: FMT.pct1,
    cell: (_c, _col, at, _h, pv) => ({ f: `IFERROR(${at("payroll")}/${at("revenue")},0)`, expect: pv.kpis.labor_cost_pct_revenue ?? 0 }),
  });
  const recurring = model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring);
  if (recurring.length) {
    rows.push({
      key: "kpi_recurring",
      label: "Recurring revenue, % of total",
      fmt: FMT.pct1,
      cell: (_c, _col, at, _h, pv) => ({ f: `IFERROR((${recurring.map((x) => at(`rev:${x.account}`)).join("+")})/${at("revenue")},0)`, expect: pv.kpis.recurring_revenue_pct ?? 0 }),
    });
  }
  // Management-stated metrics land on the latest column only, typed, with the footnote.
  const latest = model.columns.filter((c) => !c.projected && c.ref.kind !== "pf").at(-1)!;
  const mgmt = Object.keys(model.periods[latest.key]!.kpis).filter((k) => !["labor_cost_pct_revenue", "recurring_revenue_pct", "customers", "revenue_per_customer", "revenue_per_employee", "revenue_per_field_employee"].includes(k));
  for (const k of mgmt) {
    const series = model.assumptions ? undefined : undefined;
    void series;
    rows.push({
      key: `kpi_${k}`,
      label: `${kpiLabel(model, k)} (1)`,
      fmt: kpiFormat(model, k),
      note: "(1) Per management; not independently verified.",
      cell: (column, _col, _at, _h, pv) => (column.key === latest.key ? { v: pv.kpis[k] } : undefined),
    });
  }
  return rows;
}

function fteAt(model: ModelOutput, end: string): number {
  return model.periods[model.columns.find((c) => c.end === end)?.key ?? ""]?.kpis.customers ?? 0;
}

function kpiLabel(model: ModelOutput, key: string): string {
  return model.assumptions ? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : key;
}

function kpiFormat(_model: ModelOutput, key: string): string {
  if (/rate|pct|share/.test(key)) return FMT.pct;
  if (/rating/.test(key)) return FMT.oneDp;
  return FMT.body;
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
      b.formula(r, col, `${latest}*(1+${addr(rowOf("assumptions", "scenarioGrowth") as unknown as number, 3 + i, { col: true, row: true }).replace(/^\$?([A-Z]+)\$?/, `${S("assumptions")}$$$1$$`)})`, { style: vs.style, fmt: vs.fmt, expect: (spec.value!(values) / K) || (spec.key === "revenue" ? sc.pnl.revenue / K : 0), label: `${spec.key} ${sc.name}` });
      return;
    }
    const mk = spec.category ? methodKey[spec.category] : undefined;
    if (mk) {
      const method = `${S("assumptions")}$${colLetter(3 + i)}$${rowOf("assumptions", mk)}`;
      const f = `IF(${method}="Latest year",${latest},IF(${method}="3-year average",AVERAGE(${fyRange(spec.key)}),IF(${method}="% of sales, 3-year blended",SUM(${fyRange(spec.key)})/SUM(${fyRange("revenue")})*${at("revenue")},${latest})))`;
      b.formula(r, col, f, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${sc.name}` });
      b.note(r, l.notesCol, `PF: ${sc.name === "Mid" ? sc.methods[spec.category as string] ?? "" : ""}`.trim() === "PF:" ? "" : `PF: ${model.scenarios![1]!.methods[spec.category as string]}`, { align: { wrap: false } });
      return;
    }
    b.formula(r, col, latest, { style: vs.style, fmt: vs.fmt, expect: spec.value!(values) / K, label: `${spec.key} ${sc.name}` });
  });
}

// --- Adj. EBITDA ladder --------------------------------------------------------------------------

interface LadderRow {
  key: string;
  label: string;
  kind: "section" | "line" | "keyTotal" | "margin" | "subtotal" | "spacer" | "check";
  ref?: string;
  value?: (v: ModelOutput["periods"][string]) => number;
}

function ladderRows(model: ModelOutput): LadderRow[] {
  const adj = model.adjustments;
  const accepted = (tier: Adjustment["tier"]) => adj.filter((x) => x.row.tier === tier && x.row.status === "accepted");
  const latestKey = model.columns.filter((c) => !c.projected).at(-1)!.key;
  const signLabel = (x: (typeof adj)[number]) => {
    const amount = x.byColumn[latestKey] ?? Object.values(x.byColumn).find((v) => v !== 0) ?? 0;
    return `${amount < 0 ? "(-)" : "(+)"} ${x.row.description} [${x.row.ref}]`;
  };
  const rows: LadderRow[] = [
    { key: "net_income", label: "Net Income", kind: "line", value: (v) => v.ladder.netIncome },
    { key: "sec_definitional", label: "Definitional Adjustments", kind: "section" },
    { key: "d_interest", label: "(+) Interest Expense [D1]", kind: "line", ref: "D1", value: (v) => v.ladder.definitional.interest },
    { key: "d_taxes", label: "(+) Income Taxes [D2]", kind: "line", ref: "D2", value: (v) => v.ladder.definitional.taxes },
    { key: "d_da", label: "(+) Depreciation & Amortization [D3]", kind: "line", ref: "D3", value: (v) => v.ladder.definitional.da },
    { key: "reported_ebitda", label: "Reported EBITDA", kind: "keyTotal", value: (v) => v.ladder.reportedEbitda },
    { key: "reported_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.reportedMargin },
    { key: "sec_normalization", label: "Normalization Adjustments", kind: "section" },
    ...accepted("normalization").map<LadderRow>((x) => ({ key: `n_${x.row.ref}`, label: signLabel(x), kind: "line", ref: x.row.ref, value: (v) => v.ladder.normalization.find((i) => i.ref === x.row.ref)?.amount ?? 0 })),
    { key: "total_normalization", label: "Total Normalization Adjustments", kind: "subtotal", value: (v) => v.ladder.totalNormalization },
    { key: "sec_owner", label: "Owner Compensation", kind: "section" },
    { key: "s1", label: "(+) Owner Compensation [S1]", kind: "line", ref: "S1", value: (v) => v.ladder.ownerCompAsPaid },
    { key: "sde", label: "Seller's Discretionary Earnings (SDE)", kind: "keyTotal", value: (v) => v.ladder.sde },
    { key: "sde_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.sdeMargin },
    { key: "s2", label: "(-) Market Replacement Compensation [S2]", kind: "line", ref: "S2", value: (v) => v.ladder.marketReplacement },
    { key: "s3", label: "(-) Capital Reserve (Maintenance Capex) [S3]", kind: "line", ref: "S3", value: (v) => v.ladder.capitalReserve },
    { key: "adj_ebitda", label: "Adj. EBITDA", kind: "keyTotal", value: (v) => v.ladder.adjEbitda },
    { key: "adj_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.adjMargin },
    { key: "sec_pf", label: "Pro Forma Adjustments", kind: "section" },
    ...accepted("pro_forma").map<LadderRow>((x) => ({ key: `pf_${x.row.ref}`, label: signLabel(x), kind: "line", ref: x.row.ref, value: (v) => v.ladder.proForma.find((i) => i.ref === x.row.ref)?.amount ?? 0 })),
    { key: "total_pro_forma", label: "Total Pro Forma Adjustments", kind: "subtotal", value: (v) => v.ladder.totalProForma },
    { key: "pf_adj_ebitda", label: "PF Adj. EBITDA", kind: "keyTotal", value: (v) => v.ladder.pfAdjEbitda },
    { key: "pf_margin", label: "% Margin", kind: "margin", value: (v) => v.ladder.pfMargin },
    { key: "sec_memo", label: "Memo: Other Considerations (not included above)", kind: "section" },
    ...adj.filter((x) => x.row.tier === "memo").map<LadderRow>((x) => ({ key: `m_${x.row.ref}`, label: `${x.row.description} [${x.row.ref}]`, kind: "line", ref: x.row.ref, value: (v) => v.ladder.memo.find((i) => i.ref === x.row.ref)?.amount ?? 0 })),
    { key: "sp_check", label: "", kind: "spacer" },
    { key: "check_reported", label: "Check: Reported EBITDA less (Net Income + D1:D3)", kind: "check" },
    { key: "check_schedule", label: "Check: Adjustments schedule less ladder, by tier", kind: "check" },
  ];
  return rows;
}

export function planLadder(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("ladder", SHEET.ladder);
  const l = periodLayout(model, 3);
  applyPeriodWidths(b, l);
  b.anatomy({ subtitle: "Adjusted EBITDA and SDE ($000s)", lastCol: l.notesCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [...l.groups, { from: l.notesCol, to: l.notesCol, label: "Basis" }]);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], "Adj. EBITDA");
  if (l.deltas) {
    b.cell(6, l.deltas.dollar, { style: "header", v: "($)", role: "text" });
    b.cell(6, l.deltas.pct, { style: "header", v: "(%)", role: "text" });
  }
  if (l.scenarios) ["Low", "Mid", "High"].forEach((h, i) => b.cell(6, l.scenarios!.low + i, { style: "header", v: h, role: "text" }));
  b.cell(6, l.notesCol, { style: "header", v: "Basis (from the Adjustments schedule)", role: "text", align: { horizontal: "left" } });

  const rows = ladderRows(model);
  let r = 8;
  for (const spec of rows) b.row(spec.key, r++);
  const lastPrinted = r;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 3);
  void helpers;
  const spans = valueSpans(l);
  const adjL = adjustmentsLayout(model);
  const pnlCol = (col: number) => colLetter(col);
  const ltmCol = l.cols.find((c) => c.column.ref.kind === "ltm" && !c.column.priorYear);
  const columnsForRow = l.cols;

  for (const spec of rows) {
    const rr = b.r(spec.key);
    const next = rows[rows.indexOf(spec) + 1];
    switch (spec.kind) {
      case "section":
        b.section(rr, spec.label, spans);
        continue;
      case "spacer":
        b.spacerRow(rr);
        continue;
      case "keyTotal":
        b.text(rr, 2, spec.label, { style: "keyTotal" });
        b.keyTotalBox([rr, next?.kind === "margin" ? rr + 1 : rr], spans);
        break;
      case "subtotal":
        b.text(rr, 2, spec.label, { style: "subtotal" });
        b.subtotalBorder(rr, spans);
        break;
      case "margin":
        b.text(rr, 2, spec.label, { style: "margin", align: { horizontal: "left", indent: 1 } });
        break;
      case "check":
        b.text(rr, 2, spec.label, { style: "check" });
        break;
      default:
        b.text(rr, 2, spec.label, { style: spec.key === "net_income" ? "lineFirst" : "line" });
    }
    const fmt = spec.kind === "margin" ? FMT.pct1 : spec.kind === "check" ? FMT.check : spec.key === "net_income" || spec.kind === "keyTotal" || spec.kind === "subtotal" ? FMT.currency : FMT.body;
    const style = spec.kind === "margin" ? "margin" : spec.kind === "check" ? "check" : spec.kind === "keyTotal" ? "keyTotal" : spec.kind === "subtotal" ? "subtotal" : spec.key === "net_income" ? "lineFirst" : "line";
    for (const { column, col } of columnsForRow) {
      const pv = model.periods[column.key]!;
      const at = (key: string) => `${pnlCol(col)}${b.r(key)}`;
      // The PF column starts from LTM: its net income, definitional and normalization rows read the LTM column of the schedule.
      const isPf = column.ref.kind === "pf";
      const pnlColLetter = isPf && ltmCol ? pnlCol(ltmCol.col) : pnlCol(col);
      const schedCol = adjL.byKey[column.key]!;
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
          f = sumRows(b, rows, "n_", pnlCol(col));
          break;
        case "sde":
          f = `${at("reported_ebitda")}+${at("total_normalization")}+${at("s1")}`;
          break;
        case "adj_ebitda":
          f = `${at("sde")}+${at("s2")}+${at("s3")}`;
          break;
        case "total_pro_forma":
          f = sumRows(b, rows, "pf_", pnlCol(col));
          break;
        case "pf_adj_ebitda":
          f = `${at("adj_ebitda")}+${at("total_pro_forma")}`;
          break;
        case "reported_margin":
        case "sde_margin":
        case "adj_margin":
        case "pf_margin": {
          const base = spec.key === "reported_margin" ? "reported_ebitda" : spec.key === "sde_margin" ? "sde" : spec.key === "adj_margin" ? "adj_ebitda" : "pf_adj_ebitda";
          f = `IFERROR(${at(base)}/${S("pnl")}${pnlCol(col)}${rowOf("pnl", "revenue")},"n.m.")`;
          expect = pv.pnl.revenue ? spec.value!(pv) : "n.m.";
          break;
        }
        case "check_reported":
          f = `${at("reported_ebitda")}-${S("pnl")}${pnlColLetter}${rowOf("pnl", "reported_ebitda")}`;
          expect = 0;
          break;
        case "check_schedule": {
          const tier = (key: string) => `${S("adjustments")}${colLetter(schedCol)}${rowOf("adjustments", key)}`;
          f = `ABS(${tier("tier_definitional")}-(${at("d_interest")}+${at("d_taxes")}+${at("d_da")}))+ABS(${tier("tier_normalization")}-${at("total_normalization")})+ABS(${tier("tier_s1")}+${tier("tier_s2")}+${tier("tier_s3")}-(${at("s1")}+${at("s2")}+${at("s3")}))+ABS(${tier("tier_pro_forma")}-${at("total_pro_forma")})`;
          expect = 0;
          break;
        }
        default:
          if (spec.ref) {
            if (spec.key.startsWith("pf_") && !isPf) {
              b.na(rr, col, "n.a.", { style: "line" });
              continue;
            }
            f = scheduleRef(spec.ref, schedCol);
          }
      }
      if (f === undefined) continue;
      b.formula(rr, col, f, { style, fmt, expect, tol: spec.kind === "check" ? 1e-6 : undefined, label: `${spec.key} ${column.label}` });
    }
    if (spec.kind === "check") b.checkCf(rr, l.firstCol, l.lastValueCol);
    if (l.deltas) writeDeltas(b, rr, l, spec.kind === "margin" || spec.kind === "check");
    if (l.scenarios && spec.value) writeLadderScenarios(b, rr, spec, l, model, rows);
    if (spec.ref) {
      b.formula(rr, l.notesCol, `INDEX(${S("adjustments")}$${colLetter(ADJ_BASIS_COL)}:$${colLetter(ADJ_BASIS_COL)},MATCH("[${spec.ref}]",${S("adjustments")}$${colLetter(ADJ_REF_COL)}:$${colLetter(ADJ_REF_COL)},0))`, {
        style: "note",
        align: { wrap: false },
        expect: model.adjustments.find((x) => x.row.ref === spec.ref)?.row.basis,
        label: `basis ${spec.ref}`,
      });
    }
  }
  const mainStreet = model.mode.mode === "mainStreet";
  b.note(lastPrinted, 2, `Note: margins divide by total revenue. ${mainStreet ? "Main Street mode: SDE is the headline; the capital reserve [S3] is deducted below SDE." : "Lower-middle-market mode: [S3] is zero and the CIM collapses [S1] and [S2] into one owner compensation normalization line."} The PF column starts from LTM net income and adds the accepted pro forma rows below Adj. EBITDA.`);
  b.print({ area: `B2:${addr(lastPrinted, l.notesCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
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

function sumRows(b: SheetBuilder, rows: LadderRow[], prefix: string, col: string): string {
  const keys = rows.filter((x) => x.key.startsWith(prefix)).map((x) => `${col}${b.r(x.key)}`);
  return keys.length ? `SUM(${keys[0]}:${keys[keys.length - 1]})` : "0";
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
        f = sumRows(b, rows, "n_", colLetter(col));
        break;
      case "sde":
        f = `${at("reported_ebitda")}+${at("total_normalization")}+${at("s1")}`;
        break;
      case "adj_ebitda":
        f = `${at("sde")}+${at("s2")}+${at("s3")}`;
        break;
      case "total_pro_forma":
        f = "0";
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
        expect = sc.pnl.revenue ? spec.value!(pv) : "n.m.";
        break;
      }
      default:
        if (spec.ref && !spec.key.startsWith("pf_")) f = scheduleRef(spec.ref, latestSched);
    }
    if (f !== undefined) b.formula(r, col, f, { style, fmt, expect, label: `${spec.key} ${sc.name}` });
  });
}

// --- Adjustments schedule -------------------------------------------------------------------------

const TEXT_HEADERS = ["Ref", "Adjustment", "Tier", "Category", "Basis", "Source document", "Evidence", "Status", "In CIM", "P&L line", "PF method"];
const TEXT_WIDTHS = [WIDTH.labelAdjustments - 28, 30, 16, 24, 60, 28, 16, 11, 8, 14, 26];

const STATUS_LABEL: Record<Adjustment["status"], string> = { proposed: "Proposed", supported: "Supported", accepted: "Accepted", excluded: "Excluded" };
const EVIDENCE_LABEL = { documented: "Documented", management_representation: "Management representation" } as const;

export function planAdjustments(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("adjustments", SHEET.adjustments);
  const l = adjustmentsLayout(model);
  const months = gridMonths(model);
  const n = months.length;
  const monthStart = ADJ_MONTH_START(model);
  const lastMonthCol = n ? monthStart + n - 1 : monthStart - 1;
  const lastCol = n ? lastMonthCol : l.lastValueCol;
  b.width(1, WIDTH.gutter);
  TEXT_WIDTHS.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(13);
  for (let c = l.firstCol; c <= l.lastValueCol; c++) b.width(c, WIDTH.value);
  for (const s of l.spacers) b.spacerCol(s);
  if (n) {
    b.widths(monthStart, lastMonthCol, WIDTH.value);
    b.outlineCols(monthStart, lastMonthCol, 1);
  }
  b.anatomy({ subtitle: "Recast and adjustments schedule ($000s; positive increases EBITDA)", lastCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
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
  const tierFirst = last + 3;
  const tierKeys = ["tier_definitional", "tier_normalization", "tier_s1", "tier_s2", "tier_s3", "tier_pro_forma", "tier_memo"] as const;
  tierKeys.forEach((k, i) => b.row(k, tierFirst + i));
  b.row("tierFirst", tierFirst);
  b.row("tierLast", tierFirst + tierKeys.length - 1);
  const lastPrinted = tierFirst + tierKeys.length + 1;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 2);
  const monthHeaderRow = n ? `$${colLetter(monthStart)}$6:$${colLetter(lastMonthCol)}$6` : "";
  const monthRowRange = (r: number) => `$${colLetter(monthStart)}${r}:$${colLetter(lastMonthCol)}${r}`;
  const fyCols = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const pfCol = l.cols.find((c) => c.column.ref.kind === "pf");
  const series = model.monthly?.series;
  const latestFy = fyCols[fyCols.length - 1]?.column.fiscalYear;

  adj.forEach((x, idx) => {
    const r = first + idx;
    const row = x.row;
    b.formula(r, ADJ_REF_COL, `"["&CHOOSE(MATCH(${addr(r, ADJ_TIER_COL)},{"Definitional","Normalization","Owner compensation","Pro forma","Memo"},0),"D","N","S","PF","M")&COUNTIF($${colLetter(ADJ_TIER_COL)}$${first}:${addr(r, ADJ_TIER_COL)},${addr(r, ADJ_TIER_COL)})&"]"`, {
      expect: `[${row.ref}]`,
      label: `ref ${row.ref}`,
      align: { horizontal: "left" },
    });
    b.text(r, 3, row.description);
    b.cell(r, ADJ_TIER_COL, { v: ADJUSTMENT_TIER_LABELS[row.tier], role: "input" });
    b.cell(r, ADJ_CATEGORY_COL, { v: ADJUSTMENT_CATEGORY_LABELS[row.category], role: "input" });
    b.text(r, ADJ_BASIS_COL, row.basis, { align: { wrap: true, vertical: "top" } });
    b.text(r, 7, row.sourceDocument, { align: { wrap: true, vertical: "top" } });
    b.cell(r, 8, { v: EVIDENCE_LABEL[row.evidence], role: "input" });
    b.cell(r, ADJ_STATUS_COL, { v: STATUS_LABEL[row.status], role: "input", align: { horizontal: "center" } });
    b.formula(r, 10, `IF(${addr(r, ADJ_STATUS_COL)}="Accepted","Yes","No")`, { expect: row.status === "accepted" ? "Yes" : "No", label: `in CIM ${row.ref}`, align: { horizontal: "center" } });
    b.text(r, 11, row.pnlLine ? IS_LABELS[row.pnlLine] : "", { align: { horizontal: "center" } });
    b.text(r, 12, row.pfMethod ?? "");
    const hasMonths = n > 0 && (!!row.byMonth || ["pnl", "owner_comp", "replacement_salary", "capital_reserve"].includes(row.origin));
    const isPf = row.tier === "pro_forma";
    // Month cells.
    if (hasMonths) {
      months.forEach((m, i) => {
        const col = monthStart + i;
        const link = monthLink(row, model, i);
        const engine = amountForMonth(row, model, i);
        if (link) b.formula(r, col, link.f, { fmt: FMT.body, expect: engine / K, label: `${row.ref} ${m}` });
        else b.num(r, col, engine / K, { fmt: FMT.body });
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
  });

  // Ladder totals by tier (accepted rows), per period and per month, for the ladder and the monthly grid.
  b.section(tierFirst - 1, "Ladder totals by tier (accepted rows)", [[2, 12], ...valueSpans(l), ...(n ? [[monthStart, lastMonthCol] as [number, number]] : [])]);
  const tierSpecs: { key: (typeof tierKeys)[number]; label: string; crit: (col: number) => string; series: string; byColumn: (key: string) => number }[] = [
    { key: "tier_definitional", label: "Definitional [D]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Definitional",${col(ADJ_STATUS_COL)},"Accepted"`, series: "definitional", byColumn: (k) => sumTier(model, k, (r) => r.tier === "definitional") },
    { key: "tier_normalization", label: "Normalization [N]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Normalization",${col(ADJ_STATUS_COL)},"Accepted"`, series: "total_normalization", byColumn: (k) => sumTier(model, k, (r) => r.tier === "normalization") },
    { key: "tier_s1", label: "Owner compensation as paid [S1]", crit: (c) => `${col(c)},${col(ADJ_CATEGORY_COL)},"Owner compensation",${col(ADJ_STATUS_COL)},"Accepted"`, series: "owner_comp_as_paid", byColumn: (k) => sumTier(model, k, (r) => r.category === "owner_compensation") },
    { key: "tier_s2", label: "Market replacement compensation [S2]", crit: (c) => `${col(c)},${col(ADJ_CATEGORY_COL)},"Replacement cost",${col(ADJ_STATUS_COL)},"Accepted"`, series: "market_replacement", byColumn: (k) => sumTier(model, k, (r) => r.category === "replacement_cost") },
    { key: "tier_s3", label: "Capital reserve [S3]", crit: (c) => `${col(c)},${col(ADJ_CATEGORY_COL)},"Capital reserve",${col(ADJ_STATUS_COL)},"Accepted"`, series: "capital_reserve", byColumn: (k) => sumTier(model, k, (r) => r.category === "capital_reserve") },
    { key: "tier_pro_forma", label: "Pro forma [PF]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Pro forma",${col(ADJ_STATUS_COL)},"Accepted"`, series: "total_pro_forma", byColumn: (k) => sumTier(model, k, (r) => r.tier === "pro_forma") },
    { key: "tier_memo", label: "Memo (listed, never added) [M]", crit: (c) => `${col(c)},${col(ADJ_TIER_COL)},"Memo"`, series: "", byColumn: (k) => sumTier(model, k, (r) => r.tier === "memo", true) },
  ];
  function col(c: number): string {
    return `$${colLetter(c)}$${first}:$${colLetter(c)}$${last}`;
  }
  for (const t of tierSpecs) {
    const r = b.r(t.key);
    b.text(r, 2, t.label, { style: "line" });
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
  b.cell(b.r("tier_s3"), 2, { v: `Capital reserve [S3]${model.mode.mode === "mainStreet" ? "" : " (zero outside Main Street mode)"}` });
  b.note(lastPrinted, 2, "Note: refs number by tier in row order (insert a row and every ref renumbers). Only Accepted rows enter the ladder; Proposed, Supported and Excluded rows stay out of every total. Rows with months are exact for YTD and LTM; rows without months are prorated by fiscal-year months in the window.");
  b.print({ area: `B2:${addr(lastPrinted, l.lastValueCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

function sumTier(model: ModelOutput, columnKey: string, pick: (r: Adjustment) => boolean, allStatuses = false): number {
  return model.adjustments.filter((x) => pick(x.row) && (allStatuses || x.row.status === "accepted")).reduce((s, x) => s + (x.byColumn[columnKey] ?? 0), 0);
}

/** The engine's amount for a schedule row in one month: its months when it has them, else the category link's value. */
function amountForMonth(row: Adjustment, model: ModelOutput, i: number): number {
  const m = model.monthly!.months[i]!.key;
  if (row.byMonth) return row.byMonth[m] ?? 0;
  const cat = categoryOf(row);
  return cat ? cat.sign * model.monthly!.series[cat.category]![i]! : 0;
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
  const equalsSeries = (key: string, sign: 1 | -1) => !row.byMonth || months.every((m, k) => Math.abs((row.byMonth![m.key] ?? 0) - sign * series[key]![k]!) < 0.005);
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

export { COLOR, MONTHLY_FIRST_ROW };
