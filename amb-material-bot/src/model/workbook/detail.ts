// Revenue Detail and Expense Detail (guide 5.1 rows 8-9, 5.5 LTM strips):
// three stacked blocks per group ($000s, % of total revenue, % growth), the
// summary period block on the left and the twelve-month LTM strip on the
// right, every strip cell a link to Monthly P&L. Annual-only books have no
// months: the tabs keep the three blocks over the fiscal years and the Pro
// Forma Low / Mid / High columns (guide 5.2A), each cell a link to the P&L
// Summary, and no strip.

import { addMonths, monthRange } from "../../domain/financials.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { ModelOutput, MonthlySeries } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { deltaValues, MONTH_START, priorColumn, valueStyle, writeDeltas } from "./data.ts";
import { applyPeriodWidths, ASOF, gridMonths, offGrid, periodLayout, S, SHEET, serialOfMonthStart, sumifsFormula, valueSpans, writePeriodHelpers, yearEarlierMonths, yearEarlierSumifs } from "./layout.ts";

const K = 1000;

interface DetailLine {
  key: string;
  label: string;
  /** Monthly P&L row key the line links to. */
  monthlyKey: string;
  kind: "lineFirst" | "line" | "keyTotal";
  value: (p: ModelOutput["periods"][string]) => number;
  /** The engine's value in month `i` of the monthly series, for the strip expectations. */
  month: (series: MonthlySeries["series"], i: number) => number;
  /** The total the growth block closes on. */
  isTotal?: boolean;
}

const seriesAt = (key: string) => (series: MonthlySeries["series"], i: number) => series[key]?.[i] ?? 0;
const sumAt = (keys: string[]) => (series: MonthlySeries["series"], i: number) => keys.reduce((s, k) => s + (series[k]?.[i] ?? 0), 0);

function revenueLines(model: ModelOutput): DetailLine[] {
  const first = model.periods[model.columns[0]!.key]!;
  const contra = model.databook?.pnl.filter((r) => r.category === "revenue" && Object.values(r.byFiscalYear).every((v) => v <= 0) && Object.values(r.byFiscalYear).some((v) => v < 0)).map((r) => r.account) ?? [];
  const service = first.revenueLines.filter((l) => !contra.includes(l.account));
  const lines: DetailLine[] = service.map((l, i) => ({
    key: `rev:${l.account}`,
    label: l.label,
    monthlyKey: `rev:${l.account}`,
    kind: i === 0 ? "lineFirst" : "line",
    value: (p) => p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0,
    month: seriesAt(`rev:${l.account}`),
  }));
  if (contra.length && service.length) {
    lines.push({ key: "rev_contra", label: "Less: discounts and refunds", monthlyKey: "rev_contra", kind: "line", value: (p) => contra.reduce((s, a) => s + (p.revenueLines.find((x) => x.account === a)?.amount ?? 0), 0), month: sumAt(contra.map((a) => `rev:${a}`)) });
  }
  lines.push({ key: "revenue", label: "Total Revenue", monthlyKey: "revenue", kind: "keyTotal", value: (p) => p.pnl.revenue, month: seriesAt("revenue"), isTotal: true });
  const recurring = service.filter((l) => l.recurring);
  if (recurring.length) lines.push({ key: "recurring", label: "Total Recurring Revenue", monthlyKey: "", kind: "keyTotal", value: (p) => recurring.reduce((s, l) => s + (p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0), 0), month: sumAt(recurring.map((l) => `rev:${l.account}`)) });
  return lines;
}

function expenseLines(): DetailLine[] {
  return [
    { key: "cogs", label: "Cost of Revenue", monthlyKey: "cogs", kind: "lineFirst", value: (p) => p.pnl.cogs, month: seriesAt("cogs") },
    { key: "gross_profit", label: "Gross Profit", monthlyKey: "gross_profit", kind: "keyTotal", value: (p) => p.pnl.grossProfit, month: seriesAt("gross_profit") },
    { key: "payroll", label: "Salaries, Wages and Benefits", monthlyKey: "payroll", kind: "lineFirst", value: (p) => p.pnl.payroll, month: seriesAt("payroll") },
    { key: "owner_comp", label: "Owner / Officer Compensation", monthlyKey: "owner_comp", kind: "line", value: (p) => p.pnl.ownerComp, month: seriesAt("owner_comp") },
    { key: "rent", label: "Rent and Occupancy", monthlyKey: "rent", kind: "line", value: (p) => p.pnl.rent, month: seriesAt("rent") },
    { key: "marketing", label: "Advertising and Marketing", monthlyKey: "marketing", kind: "line", value: (p) => p.pnl.marketing, month: seriesAt("marketing") },
    { key: "other_opex", label: "Other Operating Expenses", monthlyKey: "other_opex", kind: "line", value: (p) => p.pnl.otherOpex, month: seriesAt("other_opex") },
    { key: "total_opex", label: "Total Operating Expenses", monthlyKey: "total_opex", kind: "keyTotal", value: (p) => p.pnl.totalOpex, month: seriesAt("total_opex"), isTotal: true },
  ];
}

export function planRevenueDetail(ctx: TabContext): SheetBuilder {
  if (!ctx.model.monthly) return planAnnualDetail(ctx, "revenue", SHEET.revenue, "Revenue by Line ($000s)", "Revenue", revenueLines(ctx.model));
  return planDetail(ctx, "revenue", SHEET.revenue, "Revenue by Line ($000s)", "Revenue", revenueLines(ctx.model), "LTM Monthly Revenue");
}

export function planExpenseDetail(ctx: TabContext): SheetBuilder {
  if (!ctx.model.monthly) return planAnnualDetail(ctx, "expense", SHEET.expense, "Cost of Revenue and Operating Expenses ($000s)", "Expenses", expenseLines());
  return planDetail(ctx, "expense", SHEET.expense, "Cost of Revenue and Operating Expenses ($000s)", "Expenses", expenseLines(), "LTM Monthly Expenses");
}

/**
 * The annual-only detail tab (guide 5.1 status A, 5.2A): the fiscal years and
 * the Pro Forma cases in three blocks. Dollar cells link to the P&L Summary,
 * which reads the Databook (years) and applies the scenario methods (cases),
 * so the tab can never disagree with it; growth in a case is against the
 * latest fiscal year.
 */
function planAnnualDetail(ctx: TabContext, key: "revenue" | "expense", name: string, subtitle: string, group: string, lines: DetailLine[]): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder(key, name);
  const l = periodLayout(model, 3, { deltas: false });
  // No notes column: every line's basis is on the P&L Summary it links to.
  applyPeriodWidths(b, l, WIDTH.label, { notes: false });
  b.anatomy({ subtitle, lastCol: l.lastValueCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.tier1(5, l.groups);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], group);
  if (l.scenarios) ["Low", "Mid", "High"].forEach((h, i) => b.cell(6, l.scenarios!.low + i, { style: "header", v: h, role: "text" }));
  const spans = valueSpans(l);
  const blocks: { title: string; suffix: string; kind: "dollars" | "pct" | "growth" }[] = [
    { title: `${group} ($000s)`, suffix: "", kind: "dollars" },
    { title: `${group} % Total Revenue`, suffix: "_pct", kind: "pct" },
    { title: `${group} % Growth`, suffix: "_growth", kind: "growth" },
  ];
  let r = 8;
  const gaps: number[] = [];
  for (const bl of blocks) {
    b.row(`sec${bl.suffix}`, r++);
    for (const ln of lines) b.row(`${ln.key}${bl.suffix}`, r++);
    if (bl.kind === "growth") b.row("growth_total", r++);
    gaps.push(r++);
  }
  for (const g of gaps) b.spacerRow(g);
  const noteRow = r;
  // The helper rows carry each year's window, from which its row-6 label derives (guide 5.2 D7).
  writePeriodHelpers(b, l, model, noteRow + 2);
  const totalKey = lines.find((x) => x.isTotal)!.key;
  const fy = l.cols.filter((c) => c.column.ref.kind === "fiscal_year");
  const latest = fy[fy.length - 1]!;
  const latestLines = model.periods[latest.column.key]!.revenueLines;
  const recurringKeys = latestLines.filter((x) => x.recurring).map((x) => `rev:${x.account}`);
  // Each value column: its P&L Summary column, the engine's values for it and the column its growth compares with.
  const columns = [
    ...l.cols.map(({ column, col }) => ({ col, label: column.label, values: model.periods[column.key]!, prior: priorColumn(column, l)?.col })),
    ...(l.scenarios && model.scenarios
      ? model.scenarios.map((sc, i) => ({
          col: l.scenarios!.low + i,
          label: sc.name,
          values: { ...model.periods[latest.column.key]!, pnl: sc.pnl, revenueLines: latestLines.map((x) => ({ ...x, amount: x.amount * (1 + sc.revenueGrowth) })) },
          prior: latest.col,
        }))
      : []),
  ];
  const valueOf = (col: number) => columns.find((c) => c.col === col)!.values;
  for (const bl of blocks) {
    b.section(b.r(`sec${bl.suffix}`), bl.title, spans);
    for (const ln of lines) {
      const rr = b.r(`${ln.key}${bl.suffix}`);
      b.text(rr, 2, ln.label, { style: bl.kind === "dollars" ? ln.kind : "ratio", align: { horizontal: "left", indent: 1 } });
      if (bl.kind === "dollars" && ln.kind === "keyTotal") b.keyTotalBox([rr, rr], spans);
      const vs = bl.kind === "dollars" ? valueStyle(ln.kind) : { style: "ratio" as const, fmt: FMT.pct };
      for (const c of columns) {
        const colL = colLetter(c.col);
        if (bl.kind === "dollars") {
          const f = ln.key === "recurring" ? recurringKeys.map((k) => `${colL}${b.r(k)}`).join("+") : `${S("pnl")}${colL}${rowOf("pnl", ln.key)}`;
          b.formula(rr, c.col, f, { style: vs.style, fmt: vs.fmt, expect: ln.value(c.values) / K, label: `${ln.key} ${c.label}` });
        } else if (bl.kind === "pct") {
          const rev = c.values.pnl.revenue;
          b.formula(rr, c.col, `IFERROR(${colL}${b.r(ln.key)}/${S("pnl")}${colL}${rowOf("pnl", "revenue")},"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: rev ? ln.value(c.values) / rev : "n.a.", label: `${ln.key} pct ${c.label}` });
        } else if (c.prior === undefined) {
          b.na(rr, c.col, "n.a.", { style: "ratio" });
        } else {
          const prev = ln.value(valueOf(c.prior));
          b.formula(rr, c.col, `IFERROR(${colL}${b.r(ln.key)}/${colLetter(c.prior)}${b.r(ln.key)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? ln.value(c.values) / prev - 1 : "n.a.", label: `${ln.key} growth ${c.label}` });
        }
      }
    }
    if (bl.kind === "growth") {
      const rr = b.r("growth_total");
      const tot = lines.find((x) => x.isTotal)!;
      b.text(rr, 2, `${group === "Revenue" ? "Revenue" : "Total Expense"} Growth`, { style: "keyTotal", align: { horizontal: "left" } });
      b.keyTotalBox([rr, rr], spans);
      for (const c of columns) {
        if (c.prior === undefined) {
          b.na(rr, c.col, "n.a.", { style: "keyTotal", fmt: FMT.pct });
          continue;
        }
        const prev = tot.value(valueOf(c.prior));
        b.formula(rr, c.col, `IFERROR(${colLetter(c.col)}${b.r(totalKey)}/${colLetter(c.prior)}${b.r(totalKey)}-1,"n.a.")`, { style: "keyTotal", fmt: FMT.pct, expect: prev ? tot.value(c.values) / prev - 1 : "n.a.", label: `growth total ${c.label}` });
      }
    }
  }
  // The vertical rule between the fiscal years and the cases (guide 5.2A).
  if (l.ruleCol) for (let rr = 5; rr <= noteRow; rr++) b.cell(rr, l.ruleCol, { border: { right: "thin" } });
  b.note(noteRow, 2, `Note: full fiscal years only (annual source, no monthly strip). Every figure links to the P&L Summary; the Pro Forma cases apply the scenario methods on Assumptions, and their growth is against ${latest.column.label}.`);
  b.print({ areas: [`B2:${addr(noteRow, l.lastValueCol)}`], landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

function planDetail(ctx: TabContext, key: "revenue" | "expense", name: string, subtitle: string, group: string, lines: DetailLine[], stripTitle: string): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder(key, name);
  const l = periodLayout(model, 3);
  const months = gridMonths(model);
  const asOf = model.assumptions!.asOfMonth;
  const stripMonths = monthRange(addMonths(asOf, -11), asOf);
  const priorMonth = addMonths(asOf, -12);
  const hiddenCol = l.lastValueCol + 2;
  const stripFirst = hiddenCol + 1;
  const stripLast = stripFirst + 11;
  const notesCol = stripLast + 2;
  // The period block has no notes column of its own (the tab's notes follow the strip); the hidden prior month takes a strip
  // width, so its text cannot spill into the printed columns beside it.
  applyPeriodWidths(b, l, WIDTH.label, { notes: false });
  b.spacerCol(l.lastValueCol + 1);
  b.width(hiddenCol, WIDTH.strip);
  b.hideCol(hiddenCol);
  b.widths(stripFirst, stripLast, WIDTH.strip);
  b.spacerCol(stripLast + 1);
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle, lastCol: notesCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [...l.groups, { from: stripFirst, to: stripLast, label: stripTitle }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], group);
  if (l.deltas) {
    b.cell(6, l.deltas.dollar, { style: "header", v: "($)", role: "text" });
    b.cell(6, l.deltas.pct, { style: "header", v: "(%)", role: "text" });
  }
  // Strip headers: the hidden prior month, then a chain of first-of-month serials from AsOfDate (guide 5.5).
  b.formula(6, hiddenCol, `EOMONTH(${ASOF},-13)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(priorMonth), label: "strip hidden month" });
  stripMonths.forEach((m, i) => b.formula(6, stripFirst + i, `EOMONTH(${addr(6, stripFirst + i - 1)},0)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(m), label: `strip month ${m}` }));
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });

  const spans: [number, number][] = [...valueSpans(l), [stripFirst, stripLast]];
  const blocks: { title: string; suffix: string; kind: "dollars" | "pct" | "growth" }[] = [
    { title: `${group} ($000s)`, suffix: "", kind: "dollars" },
    { title: `${group} % Total Revenue`, suffix: "_pct", kind: "pct" },
    { title: `${group} % Growth`, suffix: "_growth", kind: "growth" },
  ];
  let r = 8;
  const gaps: number[] = [];
  for (const bl of blocks) {
    b.row(`sec${bl.suffix}`, r++);
    for (const ln of lines) b.row(`${ln.key}${bl.suffix}`, r++);
    if (bl.kind === "growth") b.row("growth_total", r++);
    gaps.push(r++);
  }
  // Blocks are separated by spacer rows (guide 5.11), which keeps the three blocks, the checks and the note on one page.
  for (const g of gaps) b.spacerRow(g);
  b.row("stripCheck", r);
  b.row("stripHeaderCheck", r + 1);
  const lastPrinted = r + 3;
  const helpers = writePeriodHelpers(b, l, model, lastPrinted + 2);
  const series = model.monthly!.series;
  const stripIdx = (m: string) => months.indexOf(m);
  const monthlyCell = (monthlyKey: string, m: string) => `${S("monthly")}${colLetter(MONTH_START + stripIdx(m))}${rowOf("monthly", monthlyKey)}`;
  const totalKey = lines.find((x) => x.isTotal)!.key;
  const revenueMonthly = (m: string) => `${S("monthly")}${colLetter(MONTH_START + stripIdx(m))}${rowOf("monthly", "revenue")}`;
  const stripAllMonths = [priorMonth, ...stripMonths];
  // A 12-month grid (the shortest the merge accepts) starts at the LTM start: the hidden prior month is not on it, so it reads
  // n.a. and the first visible month has no growth denominator.
  const priorOnGrid = months.includes(priorMonth);
  const stripColOf = (m: string) => (m === priorMonth ? hiddenCol : stripFirst + stripMonths.indexOf(m));
  const recurringKeys = model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring).map((x) => `rev:${x.account}`);
  // A line's amount over a column's window a year earlier, from the grid (the recurring total sums its lines).
  const yearEarlierBase = (ln: DetailLine, col: number) => {
    const header = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;
    const rowOfKey = (k: string) => `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", k)}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", k)}`;
    return (ln.key === "recurring" ? recurringKeys : [ln.monthlyKey]).map((k) => yearEarlierSumifs({ valuesRow: rowOfKey(k), monthsRow: header, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) })).join("+");
  };

  for (const bl of blocks) {
    b.section(b.r(`sec${bl.suffix}`), bl.title, spans);
    lines.forEach((ln) => {
      const rr = b.r(`${ln.key}${bl.suffix}`);
      const styleKind = bl.kind === "dollars" ? ln.kind : bl.kind === "pct" ? "ratio" : "ratio";
      b.text(rr, 2, bl.kind === "dollars" ? ln.label : `${ln.label}`, { style: styleKind === "ratio" ? "ratio" : ln.kind, align: { horizontal: "left", indent: 1 } });
      if (bl.kind === "dollars" && ln.kind === "keyTotal") b.keyTotalBox([rr, rr], spans);
      const vs = bl.kind === "dollars" ? valueStyle(ln.kind) : { style: "ratio" as const, fmt: FMT.pct };
      // Summary block.
      for (const { column, col } of l.cols) {
        const pv = model.periods[column.key]!;
        const colL = colLetter(col);
        const at = (k: string) => `${colL}${b.r(k)}`;
        if (bl.kind === "dollars") {
          if (ln.key === "recurring") {
            b.formula(rr, col, recurringKeys.map((k) => at(k)).join("+"), { style: vs.style, fmt: vs.fmt, expect: ln.value(pv) / K, label: `${ln.key} ${column.label}` });
            continue;
          }
          if (offGrid(model, column)) {
            // A fiscal year off the grid (read from an annual source) has no months: the line links to the P&L Summary's cell.
            b.formula(rr, col, `${S("pnl")}${colL}${rowOf("pnl", ln.key)}`, { style: vs.style, fmt: vs.fmt, expect: ln.value(pv) / K, label: `${ln.key} ${column.label}` });
            continue;
          }
          const monthlyRow = `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", ln.monthlyKey)}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", ln.monthlyKey)}`;
          const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;
          b.formula(rr, col, sumifsFormula({ valuesRow: monthlyRow, monthsRow: monthlyHeader, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) }), { style: vs.style, fmt: vs.fmt, expect: ln.value(pv) / K, label: `${ln.key} ${column.label}` });
        } else if (bl.kind === "pct") {
          const rev = pv.pnl.revenue;
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${S("pnl")}${colL}${rowOf("pnl", "revenue")},"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: rev ? ln.value(pv) / rev : "n.a.", label: `${ln.key} pct ${column.label}` });
        } else {
          const prior = priorColumn(column, l);
          const earlier = prior ? undefined : yearEarlierMonths(model, column);
          if (earlier) {
            const prev = earlier.reduce((sum, m) => sum + ln.month(series, stripIdx(m)), 0);
            b.formula(rr, col, `IFERROR(${at(ln.key)}/(${yearEarlierBase(ln, col)})-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? ln.value(pv) / prev - 1 : "n.a.", label: `${ln.key} growth ${column.label}` });
            continue;
          }
          if (!prior) {
            b.na(rr, col, "n.a.", { style: "ratio" });
            continue;
          }
          const prev = ln.value(model.periods[prior.column.key]!);
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${colLetter(prior.col)}${b.r(ln.key)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? ln.value(pv) / prev - 1 : "n.a.", label: `${ln.key} growth ${column.label}` });
        }
      }
      // PF vs. LTM on the dollar lines (guide 5.2 N:O).
      if (bl.kind === "dollars" && l.deltas) writeDeltas(b, rr, l, ln.kind, deltaValues(model, l, (p) => ln.value(p) / K));
      // Strip.
      for (const m of stripAllMonths) {
        const col = stripColOf(m);
        const colL = colLetter(col);
        const i = stripIdx(m);
        const at = (k: string) => `${colL}${b.r(k)}`;
        if (m === priorMonth && !priorOnGrid) {
          b.na(rr, col, "n.a.", { style: bl.kind === "dollars" ? vs.style : "ratio" });
          continue;
        }
        if (bl.kind === "dollars") {
          const f = ln.key === "recurring" ? recurringKeys.map((k) => at(k)).join("+") : monthlyCell(ln.monthlyKey, m);
          b.formula(rr, col, f, { style: vs.style, fmt: vs.fmt, expect: ln.month(series, i) / K, label: `${ln.key} ${m}` });
        } else if (bl.kind === "pct") {
          const rev = series.revenue![i]!;
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${revenueMonthly(m)},"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: rev ? ln.month(series, i) / rev : "n.a.", label: `${ln.key} pct ${m}` });
        } else {
          if (m === priorMonth) {
            b.na(rr, col, "n.a.", { style: "ratio" });
            continue;
          }
          const prevM = addMonths(m, -1);
          if (prevM === priorMonth && !priorOnGrid) {
            b.na(rr, col, "n.a.", { style: "ratio" });
            continue;
          }
          const prev = ln.month(series, stripIdx(prevM));
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${colLetter(stripColOf(prevM))}${b.r(ln.key)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? ln.month(series, i) / prev - 1 : "n.a.", label: `${ln.key} growth ${m}` });
        }
      }
    });
    if (bl.kind === "growth") {
      // The boxed growth row is computed on the totals, never a sum of rates (guide 5.5).
      const rr = b.r("growth_total");
      b.text(rr, 2, `${group === "Revenue" ? "Revenue" : "Total Expense"} Growth`, { style: "keyTotal", align: { horizontal: "left" } });
      b.keyTotalBox([rr, rr], spans);
      for (const { column, col } of l.cols) {
        const prior = priorColumn(column, l);
        const pv = model.periods[column.key]!;
        const tot = lines.find((x) => x.isTotal)!;
        const earlier = prior ? undefined : yearEarlierMonths(model, column);
        if (earlier) {
          const prev = earlier.reduce((sum, m) => sum + tot.month(series, stripIdx(m)), 0);
          b.formula(rr, col, `IFERROR(${colLetter(col)}${b.r(totalKey)}/(${yearEarlierBase(tot, col)})-1,"n.a.")`, { style: "keyTotal", fmt: FMT.pct, expect: prev ? tot.value(pv) / prev - 1 : "n.a.", label: `growth total ${column.label}` });
          continue;
        }
        if (!prior) {
          b.na(rr, col, "n.a.", { style: "keyTotal", fmt: FMT.pct });
          continue;
        }
        const prev = tot.value(model.periods[prior.column.key]!);
        b.formula(rr, col, `IFERROR(${colLetter(col)}${b.r(totalKey)}/${colLetter(prior.col)}${b.r(totalKey)}-1,"n.a.")`, { style: "keyTotal", fmt: FMT.pct, expect: prev ? tot.value(pv) / prev - 1 : "n.a.", label: `growth total ${column.label}` });
      }
      for (const m of stripAllMonths) {
        const col = stripColOf(m);
        if (m === priorMonth) {
          b.na(rr, col, "n.a.", { style: "keyTotal", fmt: FMT.pct });
          continue;
        }
        const prevM = addMonths(m, -1);
        if (prevM === priorMonth && !priorOnGrid) {
          b.na(rr, col, "n.a.", { style: "keyTotal", fmt: FMT.pct });
          continue;
        }
        const tot = lines.find((x) => x.isTotal)!;
        const cur = tot.month(series, stripIdx(m));
        const prev = tot.month(series, stripIdx(prevM));
        b.formula(rr, col, `IFERROR(${colLetter(col)}${b.r(totalKey)}/${colLetter(stripColOf(prevM))}${b.r(totalKey)}-1,"n.a.")`, { style: "keyTotal", fmt: FMT.pct, expect: prev ? cur / prev - 1 : "n.a.", label: `growth total ${m}` });
      }
    }
  }

  // Checks C34 and C35: the strip against the grid for the same months, and the header chain against AsOfDate.
  const cr = b.r("stripCheck");
  b.text(cr, 2, "Check: strip less Monthly P&L (C34)", { style: "check" });
  const monthlyRow = `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", lines.find((x) => x.isTotal)!.monthlyKey)}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", lines.find((x) => x.isTotal)!.monthlyKey)}`;
  const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;
  b.formula(cr, 3, `SUM(${addr(b.r(totalKey), stripFirst)}:${addr(b.r(totalKey), stripLast)})-SUMIFS(${monthlyRow},${monthlyHeader},">="&${addr(6, stripFirst)},${monthlyHeader},"<="&${addr(6, stripLast)})`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: "C34" });
  b.checkCf(cr, 3, 3);
  const hr = b.r("stripHeaderCheck");
  b.text(hr, 2, "Check: strip months to as-of date (C35)", { style: "check" });
  b.formula(hr, 3, `ABS(${addr(6, stripFirst)}-(EOMONTH(${ASOF},-12)+1))+ABS(${addr(6, stripLast)}-(EOMONTH(${ASOF},-1)+1))`, { style: "check", fmt: FMT.check, expect: 0, label: "C35" });
  b.checkCf(hr, 3, 3);
  b.note(lastPrinted, 2, "Note: strip cells link to Monthly P&L; growth is year over year in the summary block and month over month in the strip (n.a. where there is no denominator). The hidden column left of the strip holds the month before the LTM start so the first month's growth has a denominator.");
  // The period block and the strip print as separate ranges with the labels repeated, so neither shrinks under the 7 pt floor (C37).
  // The LTM, PF and PF vs. LTM columns print with the period block: repeated at the head of the strip range they push it past
  // one landscape page at the floor (guide 5.5 records this). The strip range stops at its last row of figures: the checks and
  // the note belong to the period block, and printed beside the strip they showed only a clipped piece of their text in the
  // repeated label column.
  b.print({ areas: [`B2:${addr(lastPrinted, l.lastValueCol)}`, `${addr(2, stripFirst)}:${addr(b.r("growth_total"), stripLast)}`], landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6", titlesCol: "B:B" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

