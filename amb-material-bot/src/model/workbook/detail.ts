// Revenue Detail and Expense Detail (guide 5.1 rows 8-9, 5.5 LTM strips):
// three stacked blocks per group ($000s, % of total revenue, % growth), the
// summary period block on the left and the twelve-month LTM strip on the
// right, every strip cell a link to Monthly P&L.

import { addMonths, monthRange } from "../../domain/financials.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import type { TabContext } from "./assumptionsTab.ts";
import { A } from "./assumptionsTab.ts";
import { MONTH_START, priorColumn, valueStyle } from "./data.ts";
import { applyPeriodWidths, ASOF, gridMonths, periodLayout, S, SHEET, serialOfMonthStart, sumifsFormula, valueSpans, writePeriodHelpers, type PeriodLayout } from "./layout.ts";

const K = 1000;

interface DetailLine {
  key: string;
  label: string;
  /** Monthly P&L row key the line links to. */
  monthlyKey: string;
  kind: "lineFirst" | "line" | "keyTotal";
  value: (p: ModelOutput["periods"][string]) => number;
  series: string;
  /** Row the % block divides by (total revenue), and whether the growth block closes on it. */
  isTotal?: boolean;
}

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
    series: `rev:${l.account}`,
  }));
  if (contra.length && service.length) {
    lines.push({ key: "rev_contra", label: "Less: discounts and refunds", monthlyKey: "rev_contra", kind: "line", value: (p) => contra.reduce((s, a) => s + (p.revenueLines.find((x) => x.account === a)?.amount ?? 0), 0), series: "rev_contra" });
  }
  lines.push({ key: "revenue", label: "Total Revenue", monthlyKey: "revenue", kind: "keyTotal", value: (p) => p.pnl.revenue, series: "revenue", isTotal: true });
  const recurring = service.filter((l) => l.recurring);
  if (recurring.length) lines.push({ key: "recurring", label: "Total Recurring Revenue", monthlyKey: "", kind: "keyTotal", value: (p) => recurring.reduce((s, l) => s + (p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0), 0), series: "" });
  return lines;
}

function expenseLines(): DetailLine[] {
  return [
    { key: "cogs", label: "Cost of Revenue", monthlyKey: "cogs", kind: "lineFirst", value: (p) => p.pnl.cogs, series: "cogs" },
    { key: "gross_profit", label: "Gross Profit", monthlyKey: "gross_profit", kind: "keyTotal", value: (p) => p.pnl.grossProfit, series: "gross_profit" },
    { key: "payroll", label: "Salaries, Wages and Benefits", monthlyKey: "payroll", kind: "lineFirst", value: (p) => p.pnl.payroll, series: "payroll" },
    { key: "owner_comp", label: "Owner / Officer Compensation", monthlyKey: "owner_comp", kind: "line", value: (p) => p.pnl.ownerComp, series: "owner_comp" },
    { key: "rent", label: "Rent and Occupancy", monthlyKey: "rent", kind: "line", value: (p) => p.pnl.rent, series: "rent" },
    { key: "marketing", label: "Advertising and Marketing", monthlyKey: "marketing", kind: "line", value: (p) => p.pnl.marketing, series: "marketing" },
    { key: "other_opex", label: "Other Operating Expenses", monthlyKey: "other_opex", kind: "line", value: (p) => p.pnl.otherOpex, series: "other_opex" },
    { key: "total_opex", label: "Total Operating Expenses", monthlyKey: "total_opex", kind: "keyTotal", value: (p) => p.pnl.totalOpex, series: "total_opex", isTotal: true },
  ];
}

export function planRevenueDetail(ctx: TabContext): SheetBuilder | undefined {
  if (ctx.model.granularity !== "monthly") return undefined;
  return planDetail(ctx, "revenue", SHEET.revenue, "Revenue by Line ($000s)", "Revenue", revenueLines(ctx.model), "LTM Monthly Revenue");
}

export function planExpenseDetail(ctx: TabContext): SheetBuilder | undefined {
  if (ctx.model.granularity !== "monthly") return undefined;
  return planDetail(ctx, "expense", SHEET.expense, "Cost of Revenue and Operating Expenses ($000s)", "Expenses", expenseLines(), "LTM Monthly Expenses");
}

function planDetail(ctx: TabContext, key: "revenue" | "expense", name: string, subtitle: string, group: string, lines: DetailLine[], stripTitle: string): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder(key, name);
  const l = periodLayout(model, 3, { deltas: false });
  const months = gridMonths(model);
  const asOf = model.assumptions!.asOfMonth;
  const stripMonths = monthRange(addMonths(asOf, -11), asOf);
  const priorMonth = addMonths(asOf, -12);
  const hiddenCol = l.lastValueCol + 2;
  const stripFirst = hiddenCol + 1;
  const stripLast = stripFirst + 11;
  const notesCol = stripLast + 2;
  applyPeriodWidths(b, l);
  b.spacerCol(l.lastValueCol + 1);
  b.hideCol(hiddenCol);
  b.widths(stripFirst, stripLast, WIDTH.strip);
  b.spacerCol(stripLast + 1);
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle, lastCol: notesCol, toggleCol: l.lastValueCol, masterToggle: ctx.masterToggle });
  b.text(3, l.lastValueCol - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [...l.groups, { from: stripFirst, to: stripLast, label: stripTitle }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: l.firstCol, to: l.lastValueCol }, [], group);
  // Strip headers: the hidden prior month, then a chain of first-of-month serials from AsOfDate (guide 5.5).
  b.formula(6, hiddenCol, `EOMONTH(${ASOF},-12)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(priorMonth), label: "strip hidden month" });
  stripMonths.forEach((m, i) => b.formula(6, stripFirst + i, `EOMONTH(${addr(6, stripFirst + i - 1)},0)+1`, { style: "monthHeader", fmt: FMT.monthHeader, role: "text", expect: serialOfMonthStart(m), label: `strip month ${m}` }));
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });

  const spans: [number, number][] = [...valueSpans(l), [stripFirst, stripLast]];
  const blocks: { title: string; suffix: string; kind: "dollars" | "pct" | "growth" }[] = [
    { title: `${group} ($000s)`, suffix: "", kind: "dollars" },
    { title: `${group} % Total Revenue`, suffix: "_pct", kind: "pct" },
    { title: `${group} % Growth`, suffix: "_growth", kind: "growth" },
  ];
  let r = 8;
  const rowsByBlock = blocks.map((bl) => {
    b.row(`sec${bl.suffix}`, r);
    r++;
    const keys = lines.map((ln) => {
      b.row(`${ln.key}${bl.suffix}`, r);
      return r++;
    });
    if (bl.kind === "growth") b.row("growth_total", r++);
    r++;
    return keys;
  });
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
  const stripColOf = (m: string) => (m === priorMonth ? hiddenCol : stripFirst + stripMonths.indexOf(m));

  blocks.forEach((bl, bi) => {
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
            const rec = model.periods[column.key]!.revenueLines.filter((x) => x.recurring).map((x) => at(`rev:${x.account}`));
            b.formula(rr, col, rec.length ? rec.join("+") : "0", { style: vs.style, fmt: vs.fmt, expect: ln.value(pv) / K, label: `${ln.key} ${column.label}` });
            continue;
          }
          const monthlyRow = `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", ln.monthlyKey)}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", ln.monthlyKey)}`;
          const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;
          b.formula(rr, col, sumifsFormula({ valuesRow: monthlyRow, monthsRow: monthlyHeader, startCell: addr(helpers.start, col, { row: true }), endCell: addr(helpers.end, col, { row: true }) }), { style: vs.style, fmt: vs.fmt, expect: ln.value(pv) / K, label: `${ln.key} ${column.label}` });
        } else if (bl.kind === "pct") {
          const rev = pv.pnl.revenue;
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${S("pnl")}${colL}${rowOf("pnl", "revenue")},"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: rev ? ln.value(pv) / rev : "n.a.", label: `${ln.key} pct ${column.label}` });
        } else {
          const prior = priorColumn(model, column, l);
          if (!prior) {
            b.na(rr, col, "n.a.", { style: "ratio" });
            continue;
          }
          const prev = ln.value(model.periods[prior.column.key]!);
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${colLetter(prior.col)}${b.r(ln.key)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? ln.value(pv) / prev - 1 : "n.a.", label: `${ln.key} growth ${column.label}` });
        }
      }
      // Strip.
      for (const m of stripAllMonths) {
        const col = stripColOf(m);
        const colL = colLetter(col);
        const i = stripIdx(m);
        const at = (k: string) => `${colL}${b.r(k)}`;
        if (bl.kind === "dollars") {
          if (ln.key === "recurring") {
            const rec = model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring).map((x) => at(`rev:${x.account}`));
            const expect = model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring).reduce((s, x) => s + (series[`rev:${x.account}`]?.[i] ?? 0), 0) / K;
            b.formula(rr, col, rec.length ? rec.join("+") : "0", { style: vs.style, fmt: vs.fmt, expect, label: `${ln.key} ${m}` });
            continue;
          }
          b.formula(rr, col, monthlyCell(ln.monthlyKey, m), { style: vs.style, fmt: vs.fmt, expect: (series[ln.series]?.[i] ?? 0) / K, label: `${ln.key} ${m}` });
        } else if (bl.kind === "pct") {
          const rev = series.revenue![i]!;
          const num = ln.key === "recurring" ? model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring).reduce((s, x) => s + (series[`rev:${x.account}`]?.[i] ?? 0), 0) : (series[ln.series]?.[i] ?? 0);
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${revenueMonthly(m)},"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: rev ? num / rev : "n.a.", label: `${ln.key} pct ${m}` });
        } else {
          if (m === priorMonth) {
            b.na(rr, col, "n.a.", { style: "ratio" });
            continue;
          }
          const prevM = addMonths(m, -1);
          const cur = ln.key === "recurring" ? 0 : (series[ln.series]?.[i] ?? 0);
          const prev = ln.key === "recurring" ? 0 : (series[ln.series]?.[stripIdx(prevM)] ?? 0);
          if (ln.key === "recurring") {
            const rec = (idx: number) => model.periods[model.columns[0]!.key]!.revenueLines.filter((x) => x.recurring).reduce((s, x) => s + (series[`rev:${x.account}`]?.[idx] ?? 0), 0);
            const c = rec(i);
            const p = rec(stripIdx(prevM));
            b.formula(rr, col, `IFERROR(${at(ln.key)}/${colLetter(stripColOf(prevM))}${b.r(ln.key)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: p ? c / p - 1 : "n.a.", label: `${ln.key} growth ${m}` });
            continue;
          }
          b.formula(rr, col, `IFERROR(${at(ln.key)}/${colLetter(stripColOf(prevM))}${b.r(ln.key)}-1,"n.a.")`, { style: vs.style, fmt: vs.fmt, expect: prev ? cur / prev - 1 : "n.a.", label: `${ln.key} growth ${m}` });
        }
      }
    });
    if (bl.kind === "growth") {
      // The boxed growth row is computed on the totals, never a sum of rates (guide 5.5).
      const rr = b.r("growth_total");
      b.text(rr, 2, `${group === "Revenue" ? "Revenue" : "Total Expense"} Growth`, { style: "keyTotal", align: { horizontal: "left" } });
      b.keyTotalBox([rr, rr], spans);
      for (const { column, col } of l.cols) {
        const prior = priorColumn(model, column, l);
        const pv = model.periods[column.key]!;
        const tot = lines.find((x) => x.isTotal)!;
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
        const tot = lines.find((x) => x.isTotal)!;
        const cur = series[tot.series]![stripIdx(m)]!;
        const prev = series[tot.series]![stripIdx(prevM)]!;
        b.formula(rr, col, `IFERROR(${colLetter(col)}${b.r(totalKey)}/${colLetter(stripColOf(prevM))}${b.r(totalKey)}-1,"n.a.")`, { style: "keyTotal", fmt: FMT.pct, expect: prev ? cur / prev - 1 : "n.a.", label: `growth total ${m}` });
      }
    }
    void bi;
    void rowsByBlock;
  });

  // Checks C34 and C35: the strip against the grid for the same months, and the header chain against AsOfDate.
  const cr = b.r("stripCheck");
  b.text(cr, 2, "Check: strip total less Monthly P&L for the same months", { style: "check" });
  const monthlyRow = `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", lines.find((x) => x.isTotal)!.monthlyKey)}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", lines.find((x) => x.isTotal)!.monthlyKey)}`;
  const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;
  b.formula(cr, 3, `SUM(${addr(b.r(totalKey), stripFirst)}:${addr(b.r(totalKey), stripLast)})-SUMIFS(${monthlyRow},${monthlyHeader},">="&${addr(6, stripFirst)},${monthlyHeader},"<="&${addr(6, stripLast)})`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: "C34" });
  b.checkCf(cr, 3, 3);
  const hr = b.r("stripHeaderCheck");
  b.text(hr, 2, "Check: strip first month less EOMONTH(AsOfDate,-12)+1, last less EOMONTH(AsOfDate,-1)+1", { style: "check" });
  b.formula(hr, 3, `(${addr(6, stripFirst)}-(EOMONTH(${ASOF},-12)+1))+(${addr(6, stripLast)}-(EOMONTH(${ASOF},-1)+1))`, { style: "check", fmt: FMT.check, expect: 0, label: "C35" });
  b.checkCf(hr, 3, 3);
  b.note(lastPrinted, 2, "Note: strip cells link to Monthly P&L; growth is year over year in the summary block and month over month in the strip (n.a. where there is no denominator). The hidden column left of the strip holds the month before the LTM start so the first month's growth has a denominator.");
  b.print({ area: `B2:${addr(lastPrinted, notesCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

export { A };
