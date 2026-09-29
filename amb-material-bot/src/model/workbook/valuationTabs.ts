// Opportunities, Valuation, Deal Structure and Sensitivities (guide 5.1 rows
// 21-24, 5.5). Internal tabs: nothing here reaches the CIM (D5). Every
// input is a link to Assumptions; the grids compute in a grey helper block
// and round in place, with the base case at the centre.

import { monthLabel, type FinancialDataset } from "../../domain/financials.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, ROW_HEIGHT, WIDTH } from "../styles.ts";
import type { ModelOutput, SensitivityGrid } from "../types.ts";
import { roundTo } from "../deal.ts";
import { isCreditCard } from "../nwc.ts";
import { A, A_AT, type TabContext } from "./assumptionsTab.ts";
import { bsColumn, bsDates, nwcLayout } from "./balance.ts";
import { periodLayout, S, SHEET } from "./layout.ts";

const K = 1000;

// --- Opportunities ------------------------------------------------------------------------------

export function planOpportunities(ctx: TabContext, ds: FinancialDataset | undefined): SheetBuilder | undefined {
  const { model } = ctx;
  const levers = ds?.intake?.growthLevers ?? [];
  if (!levers.length && !model.modules.built.includes("S9.1 Opportunity sizing")) return undefined;
  const b = new SheetBuilder("opportunities", SHEET.opportunities);
  const headers = ["Lever", "Baseline (per notes)", "Target or benchmark", "Mechanism", "Proof point", "Revenue uplift", "Margin (%)", "EBITDA effect"];
  const widths = [24, 26, 18, 30, 24, 14, 10, 13];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(10);
  const sourceCol = 11;
  b.width(sourceCol, 24);
  const lastCol = sourceCol;
  b.anatomy({ subtitle: "Growth Opportunities: One Sizing Grid per Lever ($000s)", lastCol, toggleCol: 9, masterToggle: ctx.masterToggle });
  b.text(3, 8, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [
    { from: 2, to: 6, label: "Opportunity (seller-achievable levers only)" },
    { from: 7, to: 9, label: "Sizing ($000s)" },
    { from: sourceCol, to: sourceCol, label: "Source" },
  ]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i <= 4 ? "left" : "center" } }));
  b.cell(6, sourceCol, { style: "header", v: null, role: "text" });
  const latest = model.columns.filter((c) => !c.projected && c.ref.kind !== "pf").at(-1)!;
  const gm = model.periods[latest.key]!.pnl.revenue ? model.periods[latest.key]!.pnl.grossProfit / model.periods[latest.key]!.pnl.revenue : 0;
  const pnlL = periodLayout(model, 3);
  const gmRef = `${S("pnl")}${colLetter(pnlL.byKey[latest.key]!)}${rowOf("pnl", "gross_margin")}`;
  let r = 8;
  const first = r;
  for (const lever of levers) {
    b.text(r, 2, lever.lever, { style: "lineFirst", align: { wrap: true, vertical: "top" } });
    b.text(r, 3, lever.baseline ?? "[Confirm: baseline]", { align: { wrap: true, vertical: "top" } });
    b.text(r, 4, lever.target ?? "[Confirm: benchmark or management target]", { align: { wrap: true, vertical: "top" }, font: { color: lever.target ? COLOR.black : COLOR.pending } });
    b.text(r, 5, lever.mechanism, { align: { wrap: true, vertical: "top" } });
    b.text(r, 6, lever.proofPoint ?? "", { align: { wrap: true, vertical: "top" } });
    b.num(r, 7, 0, { fmt: FMT.body });
    b.formula(r, 8, gmRef, { fmt: FMT.pct1, expect: gm, label: `cm ${lever.lever}` });
    b.formula(r, 9, `${addr(r, 7)}*${addr(r, 8)}`, { fmt: FMT.body, expect: 0, label: `ebitda ${lever.lever}` });
    b.text(r, sourceCol, lever.source.source, { align: { wrap: true, vertical: "top" } });
    r++;
  }
  const last = r - 1;
  b.text(r, 2, "Total", { style: "keyTotal" });
  b.keyTotalBox([r, r], [[7, 9]]);
  b.formula(r, 7, `SUM(${addr(first, 7)}:${addr(last, 7)})`, { style: "keyTotal", fmt: FMT.currency, expect: 0, label: "uplift total" });
  b.formula(r, 9, `SUM(${addr(first, 9)}:${addr(last, 9)})`, { style: "keyTotal", fmt: FMT.currency, expect: 0, label: "ebitda total" });
  r += 2;
  b.note(r, 2, "Note: the revenue uplift is a blue input the advisor sizes with the seller (baseline × lever, or benchmark gap × penetration ramp); it is zero until entered and never reaches the CIM as a projection. The contribution margin defaults to the latest gross margin.");
  b.print({ area: `B2:${addr(r, lastCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

// --- Valuation ------------------------------------------------------------------------------------

/** The Valuation tab's Basis / source column, which the Summary links for the DSCR note. */
export const VALUATION_NOTES_COL = 7;

/** The SBA-only DSCR note: the binding (lowest) case against the hurdle, as the Valuation tab's formula words it. */
export function sbaDscrNote(model: ModelOutput): string {
  const hurdle = model.assumptions!.sensitivity.dscrHurdle;
  const dscrs = (["low", "mid", "high"] as const).map((c) => model.valuationDetail!.cases[c].financing.dscr);
  const min = Math.min(...dscrs);
  const binding = ["Low", "Mid", "High"][dscrs.indexOf(min)]!;
  return `SBA loan only: ${binding} case binds at ${min.toFixed(2)}x, ${min < hurdle ? "below" : "clearing"} the ${hurdle.toFixed(2)}x hurdle`;
}

/**
 * The Reference structure's DSCR flag (guide 5.5: below the hurdle is
 * flagged, never coloured), as a live sentence on the hurdle and the seller
 * note's term, for the cell beside the DSCR on Valuation, Deal Structure and
 * the Summary.
 */
export function dscrFlag(cell: string, model: ModelOutput): { f: string; expect: string } {
  const a = model.assumptions!;
  const dscr = model.deal?.[0]?.debtService.dscr ?? 0;
  const h = `TEXT(${A("dscrHurdle")},"0.00")`;
  const f = `IF(ISNUMBER(${cell}),IF(${cell}<${A("dscrHurdle")},"Below the "&${h}&"x hurdle: the seller note amortises inside "&TEXT(${A("sellerNoteTermMonths")},"0")&" months; lengthen the note or lower the price","Clears the "&${h}&"x hurdle, seller note included"),"n.a.")`;
  const expect = dscr < a.sensitivity.dscrHurdle ? `Below the ${a.sensitivity.dscrHurdle.toFixed(2)}x hurdle: the seller note amortises inside ${a.deal.sellerNoteTermMonths} months; lengthen the note or lower the price` : `Clears the ${a.sensitivity.dscrHurdle.toFixed(2)}x hurdle, seller note included`;
  return { f, expect };
}

export function planValuation(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const vd = model.valuationDetail;
  if (!vd) return undefined;
  const b = new SheetBuilder("valuation", SHEET.valuation);
  const mainStreet = model.mode.mode === "mainStreet";
  const basisLabel = mainStreet ? "SDE" : "Adj. EBITDA";
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(3, 5, 11);
  b.spacerCol(6);
  const notesCol = VALUATION_NOTES_COL;
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: "Valuation and Financing, Internal ($000s)", lastCol: notesCol, toggleCol: 5, masterToggle: ctx.masterToggle });
  b.text(3, 4, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 3, to: 5, label: "Case" }, { from: notesCol, to: notesCol, label: "Basis / source" }]);
  b.tier2(6, { from: 3, to: 5 }, [{ col: 3, v: "Low" }, { col: 4, v: "Mid" }, { col: 5, v: "High" }], "Valuation");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const cases = ["low", "mid", "high"] as const;
  const pnlL = periodLayout(model, 3);
  const period = vd.period;
  const pfCol = model.columns.find((c) => c.ref.kind === "pf");
  const ladderColKey = pfCol ? pfCol.key : period.key;
  const ladder = (key: string) => `${S("ladder")}${colLetter(pnlL.byKey[ladderColKey]!)}${rowOf("ladder", key)}`;
  const pnl = (key: string) => `${S("pnl")}${colLetter(pnlL.byKey[period.key]!)}${rowOf("pnl", key)}`;
  const spans: [number, number][] = [[3, 5]];
  let r = 8;
  const row = (key: string, label: string, style: "lineFirst" | "line" | "subtotal" | "keyTotal" | "keyRate" | "subsection", cells: ((i: number) => { f?: string; v?: number; expect?: number | string } | undefined) | undefined, fmt: string, note?: string) => {
    b.row(key, r);
    b.text(r, 2, label, { style: style === "keyRate" ? "keyTotal" : style });
    if (style === "subtotal") b.subtotalBorder(r, spans);
    if (style === "keyTotal" || style === "keyRate") b.keyTotalBox([r, r], spans);
    if (cells) {
      cases.forEach((_, i) => {
        const c = cells(i);
        if (!c) return;
        if (c.f) b.formula(r, 3 + i, c.f, { style: style === "keyRate" ? "keyRate" : style === "subsection" ? "line" : style, fmt, expect: c.expect, label: `${key} ${cases[i]}` });
        else if (c.v !== undefined) b.num(r, 3 + i, c.v, { fmt });
      });
    }
    if (note) b.note(r, notesCol, note);
    r++;
  };
  const basis = vd.basis;
  b.section(r, "Earnings basis", spans);
  // One set of base figures, not a Low case: the block carries its own one-column header over them (QA round 3 F21).
  b.cell(r, 3, { v: period.label, role: "text", font: { bold: true }, align: { horizontal: "right" } });
  if (pfCol) b.note(r, notesCol, `Ladder figures at ${pfCol.label} (pro forma)`);
  r++;
  row("basisRevenue", "Total Revenue", "lineFirst", (i) => (i === 0 ? { f: pnl("revenue"), expect: basis.revenue / K } : undefined), FMT.currency, "P&L Summary");
  row("basisReported", "Reported EBITDA", "line", (i) => (i === 0 ? { f: ladder("reported_ebitda"), expect: basis.reportedEbitda / K } : undefined), FMT.body, "Adj. EBITDA ladder");
  row("basisAdj", "Adj. EBITDA", "line", (i) => (i === 0 ? { f: ladder("adj_ebitda"), expect: basis.adjEbitda / K } : undefined), FMT.body);
  row("basisPf", "PF Adj. EBITDA", "line", (i) => (i === 0 ? { f: ladder("pf_adj_ebitda"), expect: basis.pfAdjEbitda / K } : undefined), FMT.body);
  row("basisSde", "SDE", "line", (i) => (i === 0 ? { f: ladder("sde"), expect: basis.sde / K } : undefined), FMT.body);
  // Main Street: each case capitalises its own pro forma SDE from the scenario block (guide 5.5), so Low, Mid and High differ on earnings and not only on the multiple.
  const scenarios = mainStreet ? model.scenarios : undefined;
  let earnings: (i: number) => string = () => `$C$${b.r("basisAdj")}`;
  let earningsNote = "Adj. EBITDA from the ladder";
  if (scenarios && pnlL.scenarios) {
    earnings = (i) => `${S("ladder")}${colLetter(pnlL.scenarios!.low + i)}${rowOf("ladder", "sde")}`;
    earningsNote = "Pro forma case: Adj. EBITDA ladder, Low / Mid / High columns";
  } else if (scenarios) {
    b.spacerRow(r++);
    b.section(r++, `Pro forma earnings by case (${period.label}, scenario block)`, spans);
    const fy = pnlL.cols.filter((c) => c.column.ref.kind === "fiscal_year");
    const fyRange = (key: string) => `${S("pnl")}$${colLetter(fy[0]!.col)}$${rowOf("pnl", key)}:$${colLetter(fy.at(-1)!.col)}$${rowOf("pnl", key)}`;
    const base = model.periods[period.key]!;
    row("pfRevenue", "Total Revenue", "lineFirst", (i) => ({ f: `${pnl("revenue")}*(1+${A_AT("scenarioGrowth", i)})`, expect: scenarios[i]!.pnl.revenue / K }), FMT.currency, `${period.label} × (1 + revenue growth)`);
    const lines = [
      { key: "cogs", label: "Cost of Revenue", method: "scenario_cogs", value: (p: typeof base.pnl) => p.cogs },
      { key: "payroll", label: "Salaries, Wages and Benefits", method: "scenario_payroll", value: (p: typeof base.pnl) => p.payroll },
      { key: "rent", label: "Rent and Occupancy", method: "scenario_rent", value: (p: typeof base.pnl) => p.rent },
      { key: "marketing", label: "Advertising and Marketing", method: "scenario_marketing", value: (p: typeof base.pnl) => p.marketing },
      { key: "other_opex", label: "Other Operating Expenses", method: "scenario_otherOpex", value: (p: typeof base.pnl) => p.otherOpex },
    ];
    for (const ln of lines) {
      row(`pf_${ln.key}`, ln.label, "line", (i) => {
        const m = A_AT(ln.method, i);
        return { f: `IF(${m}="3-year average",AVERAGE(${fyRange(ln.key)}),IF(${m}="% of sales, 3-year blended",SUM(${fyRange(ln.key)})/SUM(${fyRange("revenue")})*${addr(b.r("pfRevenue"), 3 + i)},IF(${m}="% of sales, latest year",${pnl(ln.key)}/${pnl("revenue")}*${addr(b.r("pfRevenue"), 3 + i)},${pnl(ln.key)})))`, expect: ln.value(scenarios[i]!.pnl) / K };
      }, FMT.body, "By the case's method on Assumptions");
    }
    const costDelta = (i: number) => lines.map((ln) => `(${addr(b.r(`pf_${ln.key}`), 3 + i)}-${pnl(ln.key)})`).join("-");
    row("pfChange", `(+) / (-) Change in EBITDA vs. ${period.label}`, "line", (i) => ({ f: `${addr(b.r("pfRevenue"), 3 + i)}-${pnl("revenue")}-${costDelta(i)}`, expect: (scenarios[i]!.ladder.sde - base.ladder.sde) / K }), FMT.body, "Other lines and the schedule held at the base window");
    const ladderAt = (key: string) => `${S("ladder")}${colLetter(pnlL.byKey[period.key]!)}${rowOf("ladder", key)}`;
    row("pfSde", "SDE (pro forma case)", "subtotal", (i) => ({ f: `${ladderAt("sde")}+${addr(b.r("pfChange"), 3 + i)}`, expect: scenarios[i]!.ladder.sde / K }), FMT.currency, `${period.label} SDE from the ladder plus the change`);
    earnings = (i) => addr(b.r("pfSde"), 3 + i);
    earningsNote = "Pro forma case above";
  }
  b.spacerRow(r++);
  b.section(r++, "Business valuation", spans);
  row("earnings", basisLabel, "lineFirst", (i) => ({ f: earnings(i), expect: vd.cases[cases[i]!].sde / K }), FMT.currency, earningsNote);
  row("multiple", "(x) Valuation Multiple", "line", (i) => ({ f: A_AT(mainStreet ? "sdeMultiples" : "ebitdaMultiples", i), expect: vd.cases[cases[i]!].multiple }), FMT.multiple, model.assumptions!.multiplesSource);
  row("businessValuation", "Business Valuation", "subtotal", (i) => ({ f: `${addr(b.r("earnings"), 3 + i)}*${addr(b.r("multiple"), 3 + i)}`, expect: vd.cases[cases[i]!].businessValuation / K }), FMT.currency);
  // The deferred capex and the financing terms are per case, from the scenario block where there is one (guide 5.5).
  const byCase = (key: string, i: number) => (scenarios ? A_AT(`scenario_${key}`, i) : A(key));
  const caseSource = scenarios ? "Assumptions, scenario block" : "Assumptions";
  row("deferredCapex", "(+) Deferred Capex / Renovation", "line", (i) => ({ f: `${byCase("deferredCapex", i)}/${K}`, expect: vd.cases[cases[i]!].deferredCapex / K }), FMT.body, caseSource);
  row("totalInvestment", "Total Investment", "keyTotal", (i) => ({ f: `ROUND((${addr(b.r("businessValuation"), 3 + i)}+${addr(b.r("deferredCapex"), 3 + i)})*${K},-1)/${K}`, expect: vd.cases[cases[i]!].totalInvestment / K }), FMT.currency, "Rounded to the nearest $10");
  row("impliedSde", "Implied SDE Multiple", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisSde"), 3)},"n.a.")`, expect: vd.cases[cases[i]!].impliedSdeMultiple }), FMT.multiple);
  row("impliedAdj", "Implied Adj. EBITDA Multiple", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisAdj"), 3)},"n.a.")`, expect: vd.cases[cases[i]!].impliedAdjEbitdaMultiple }), FMT.multiple);
  b.spacerRow(r++);
  // An illustration on the SBA loan alone; the structure AMB would propose, with its seller note, is on Deal Structure and shown beside it below.
  b.text(r++, 2, "Financing: SBA-only illustration", { style: "subsection" });
  const fin = (i: number) => vd.cases[cases[i]!].financing;
  row("purchasePrice", "Purchase Price", "lineFirst", (i) => ({ f: addr(b.r("totalInvestment"), 3 + i), expect: fin(i).purchasePrice / K }), FMT.currency, "= Total Investment");
  // "(-)" rows are negative, as on the ladder and the equity bridge below.
  row("equityInjection", "(-) Equity Injection", "line", (i) => ({ f: `-${addr(b.r("purchasePrice"), 3 + i)}*${byCase("equityInjectionPct", i)}`, expect: -fin(i).equityInjection / K }), FMT.body, `${caseSource}: SBA 7(a) minimum 10%`);
  row("loanPrincipal", "Loan Principal", "subtotal", (i) => ({ f: `MAX(0,${addr(b.r("purchasePrice"), 3 + i)}+${addr(b.r("equityInjection"), 3 + i)})`, expect: fin(i).loanPrincipal / K }), FMT.currency, "Never below zero (check C28)");
  row("term", "Term (Years)", "line", (i) => ({ f: byCase("loanTermYears", i), expect: fin(i).termYears }), FMT.term, caseSource);
  row("rate", "Interest Rate", "line", (i) => ({ f: byCase("loanRate", i), expect: fin(i).rate }), FMT.rate, caseSource);
  row("debtService", "Annual Debt Service", "line", (i) => ({ f: `-PMT(${addr(b.r("rate"), 3 + i)}/12,${addr(b.r("term"), 3 + i)}*12,${addr(b.r("loanPrincipal"), 3 + i)})*12`, expect: fin(i).annualDebtService / K }), FMT.body, "= -PMT(rate/12, term × 12, principal) × 12");
  if (mainStreet) {
    // The ladder's [S2] and [S3], moved by the case's own replacement salary and reserve on the scenario block (equal by default).
    const moved = (ladderKey: string, key: string, times: string) => (i: number) => (scenarios ? `${ladder(ladderKey)}-(${A_AT(`scenario_${key}`, i)}-${A(key)})${times}/${K}` : ladder(ladderKey));
    row("cfadsS2", "(-) Market Replacement Compensation", "line", (i) => ({ f: moved("s2", "replacementSalary", `*(1+${A("burdenPct")})`)(i), expect: (fin(i).marketReplacement ?? 0) / K }), FMT.body, scenarios ? "Ladder [S2] at the case's replacement salary" : "Adj. EBITDA ladder [S2]");
    row("cfadsS3", "(-) Capital Reserve", "line", (i) => ({ f: moved("s3", "capitalReserve", "")(i), expect: (fin(i).capitalReserve ?? 0) / K }), FMT.body, scenarios ? "Ladder [S3] at the case's reserve" : "Adj. EBITDA ladder [S3]");
  }
  row("cfads", "Cash Flow Available for Debt Service", "line", (i) => ({ f: mainStreet ? `${addr(b.r("earnings"), 3 + i)}+${addr(b.r("cfadsS2"), 3 + i)}+${addr(b.r("cfadsS3"), 3 + i)}` : `${ladder("pf_adj_ebitda")}-${A("capitalReserve")}/${K}`, expect: fin(i).cashFlowAvailable / K }), FMT.body, mainStreet ? "The case's SDE less the two deductions above" : "PF Adj. EBITDA less maintenance capex");
  row("dscr", "DSCR (SBA loan only)", "keyRate", (i) => ({ f: `IFERROR(${addr(b.r("cfads"), 3 + i)}/${addr(b.r("debtService"), 3 + i)},"n.a.")`, expect: fin(i).dscr }), FMT.multiple2);
  b.cell(b.r("dscr"), 2, { style: "keyRate", align: { horizontal: "left" } });
  // The hurdle claim names the binding (lowest) case, live, so it cannot outlast a change of inputs.
  {
    const range = `${addr(b.r("dscr"), 3)}:${addr(b.r("dscr"), 5)}`;
    const h = `TEXT(${A("dscrHurdle")},"0.00")`;
    b.formula(b.r("dscr"), notesCol, `IFERROR("SBA loan only: "&CHOOSE(MATCH(MIN(${range}),${range},0),"Low","Mid","High")&" case binds at "&TEXT(MIN(${range}),"0.00")&"x, "&IF(MIN(${range})<${A("dscrHurdle")},"below","clearing")&" the "&${h}&"x hurdle","n.a.")`, {
      style: "note",
      role: "text",
      align: { horizontal: "left" },
      expect: sbaDscrNote(model),
      label: "dscr binding case",
    });
  }
  const refDscr = model.deal?.[0]?.debtService.dscr;
  if (refDscr !== undefined) {
    row("dscrReference", "DSCR, Reference structure (with seller note)", "line", (i) => (i === 1 ? { f: `${S("deal")}$C$${rowOf("deal", "dscr")}`, expect: refDscr } : undefined), FMT.multiple2);
    b.na(b.r("dscrReference"), 3, "n.a.", { style: "line" });
    b.na(b.r("dscrReference"), 5, "n.a.", { style: "line" });
    const flag = dscrFlag(addr(b.r("dscrReference"), 4), model);
    b.formula(b.r("dscrReference"), notesCol, flag.f, { style: "note", role: "text", align: { horizontal: "left" }, expect: flag.expect, label: "reference dscr flag" });
  }
  b.spacerRow(r++);
  b.section(r++, "Implied multiples (Total Investment ÷ measure)", spans);
  const im = (i: number) => vd.impliedMultiples[cases[i]!];
  row("xReported", "x Reported EBITDA", "lineFirst", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisReported"), 3)},"n.a.")`, expect: im(i).reportedEbitda }), FMT.multiple);
  row("xAdj", "x Adj. EBITDA", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisAdj"), 3)},"n.a.")`, expect: im(i).adjEbitda }), FMT.multiple);
  row("xPf", "x PF Adj. EBITDA", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisPf"), 3)},"n.a.")`, expect: im(i).pfAdjEbitda }), FMT.multiple);
  row("xSde", "x SDE", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisSde"), 3)},"n.a.")`, expect: im(i).sde }), FMT.multiple);
  row("xRevenue", "x LTM Revenue", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisRevenue"), 3)},"n.a.")`, expect: im(i).revenue }), FMT.multiple2);
  b.spacerRow(r++);
  b.section(r++, "Enterprise value to equity value", spans);
  const v = model.valuation;
  const bridge = v.bridge;
  row("ev", "Enterprise Value", "lineFirst", (i) => ({ f: addr(b.r("totalInvestment"), 3 + i), expect: v.enterpriseValue[cases[i]!] / K }), FMT.currency);
  const asset = model.dealForm === "asset_purchase";
  // Every bridge line reads the latest dated balance sheet, the one Debt-Like Items lists; without a sheet the bridge is n.a., never a zero.
  const sheetAt = bridge.asOf ? monthLabel(bridge.asOf) : undefined;
  const latestCash = sheetAt ? `${S("bs")}${colLetter(bsColumn(bsDates(model), bridge.asOf!))}${rowOf("bs", "cash")}` : undefined;
  const onSheet = (f: () => { f: string; expect: number } | undefined) => () => (sheetAt ? f() : undefined);
  row("fundedDebt", "(-) Funded Debt", "line", onSheet(() => (model.debtLike ? { f: `-${S("debtLike")}$C$${rowOf("debtLike", "fundedDebt")}`, expect: -bridge.fundedDebt / K } : undefined)), FMT.body, sheetAt ? `Debt-Like Items, at ${sheetAt}` : "No balance sheet in the sources: the bridge is n.a.");
  row("debtLikeItems", "(-) Debt-Like Items", "line", onSheet(() => (asset || !model.debtLike ? undefined : { f: `-${S("debtLike")}$C$${rowOf("debtLike", "debtLike")}`, expect: -bridge.debtLike / K })), FMT.body, asset ? "Asset purchase: retained by the Seller" : `Debt-Like Items${sheetAt ? `, at ${sheetAt}` : ""}`);
  row("cashDelivered", "(+) Cash (if delivered)", "line", onSheet(() => (asset || !latestCash ? undefined : { f: latestCash, expect: bridge.cash / K })), FMT.body, asset ? "Asset purchase: the Seller keeps its cash outside the price" : `Balance-sheet cash at ${sheetAt ?? "n.a."}, swept to the Seller before close`);
  row("nwcVsPeg", "(+) / (-) NWC Delivered vs. Peg", "line", onSheet(() => (asset || !model.nwc || model.nwc.peg === null ? undefined : { f: `${S("nwc")}$${colLetter(nwcLayout(model).vsCol)}$${rowOf("nwc", "adjustedNwc")}`, expect: bridge.nwcVsPeg / K })), FMT.body, asset ? "Asset purchase: no peg; the Seller keeps receivables and payables" : model.nwc?.peg === null ? "No peg (year-end balance sheets only)" : "NWC tab");
  for (const key of ["fundedDebt", "debtLikeItems", "cashDelivered", "nwcVsPeg"]) cases.forEach((_, i) => b.get(b.r(key), 3 + i) ?? b.na(b.r(key), 3 + i, "n.a.", { style: "line" }));
  row("equityValue", "Equity Value to Seller", "keyTotal", (i) => (sheetAt ? { f: `SUM(${addr(b.r("ev"), 3 + i)}:${addr(b.r("nwcVsPeg"), 3 + i)})`, expect: v.equityValue[cases[i]!] / K } : undefined), FMT.currency);
  if (!sheetAt) cases.forEach((_, i) => b.na(b.r("equityValue"), 3 + i, "n.a.", { style: "keyTotal" }));
  r++;
  b.note(r, 2, `Note: ${mainStreet ? "Main Street mode: SDE × multiple (IBBA basis SBA lenders underwrite)." : "Lower-middle-market mode: Adj. EBITDA × multiple."} Multiples are placeholders until the licensed comps source is applied (Assumptions). A DSCR below the hurdle on Assumptions is flagged in the basis column, never coloured. Nothing on this tab enters the CIM.`);
  b.print({ area: `B2:${addr(r, notesCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

// --- Deal Structure --------------------------------------------------------------------------------

export function planDealStructure(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const d = model.deal?.[0];
  if (!d) return undefined;
  const b = new SheetBuilder("deal", SHEET.deal);
  const asset = model.dealForm === "asset_purchase";
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.labelWide);
  // S&U multiples need room for "x PF Adj. EBITDA" in bold.
  b.widths(3, 4, 12.3);
  b.widths(5, 7, 15);
  b.spacerCol(8);
  b.width(9, WIDTH.notes);
  const notesCol = 9;
  b.anatomy({ subtitle: `Deal Structure: ${d.name}, ${d.preset}, ${asset ? "Asset Purchase" : "Equity Purchase"} ($000s)`, lastCol: notesCol, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 3, to: 7, label: d.name }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: 7 }, [{ col: 3, v: "Reference" }], "Term");
  // Offer names (guide 5.14) for the one Reference column; the risk-adjusted value, MOIC and IRR belong to Offer Comparison, built with two or more structures.
  b.defineName("Offer_Reference", "$C$5");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  let r = 8;
  const tint = (rr: number) => b.cell(rr, 2, { fill: COLOR.section });
  const bsDateIndex = bsDates(model).indexOf(model.valuationDetail!.period.end);
  const latestBsCol = model.periods[model.valuationDetail!.period.key]!.bs && bsDateIndex >= 0 ? 3 + bsDateIndex : undefined;
  const usd = (ref: string) => `TEXT(${ref}*${K},"$#,##0")`;

  // Structure summary block (OFF14 term table), every value a formula-built string.
  b.section(r++, "Structure summary", [[3, 7]]);
  const inputRow = (key: string) => `C${rowOf("deal", key)}`;
  const terms: [string, string | undefined][] = [
    ["Total Valuation", `${usd(inputRow("price"))}&" ("&TEXT(${A_AT(model.mode.mode === "mainStreet" ? "sdeMultiples" : "ebitdaMultiples", 1)},"0.0")&"x ${model.mode.mode === "mainStreet" ? "SDE" : "Adj. EBITDA"})"`],
    ["Cash at Close", `${usd(inputRow("cashAtClose"))}&" ("&TEXT(${A("cashAtClosePct")},"0%")&" of valuation)"`],
    ["Seller Note", `${usd(inputRow("sellerNote"))}&", "&${A("sellerNoteTermMonths")}&"-month term, quarterly payments, "&TEXT(${A("sellerNoteRate")},"0.0%")&" interest ("&TEXT(${A("sellerNotePct")},"0%")&" of valuation)"`],
    ["Seller Note Contingencies", undefined],
    ["Earnout (if applicable)", undefined],
    ["Escrow", `"An escrow of "&TEXT(${A("escrowPct")},"0%")&" of the cash consideration ("&${usd(inputRow("escrow"))}&") will be funded at closing and held for "&${A("escrowMonths")}&" months."`],
    ["Retention Holdback", undefined],
    ["Balance Sheet", undefined],
    ["Working Capital", asset ? `IF(${A("reconciliationHoldbackMonths")}=1,"One month of payroll as reconciliation holdback",TEXT(${A("reconciliationHoldbackMonths")},"0.0")&" months of payroll as reconciliation holdback")` : undefined],
    ["Asset vs. Stock Sale", `IF(${A("dealForm")}="Asset purchase","Asset sale","Stock sale")`],
    ["Target Timing", `IF(${A("loiDate")}="","[Confirm: LOI date, signing and effective closing date]","Sign closing documents "&TEXT(${A("signingDate")},"mm/dd/yy")&"; effective closing date "&TEXT(${A("effectiveDate")},"mm/dd/yy"))`],
  ];
  for (const [label, f] of terms) {
    tint(r);
    b.text(r, 2, label, { font: { bold: true } });
    if (f) b.formula(r, 3, f, { role: "text", expect: d.terms[label], label: `term ${label}`, align: { horizontal: "left" } });
    else b.text(r, 3, d.terms[label] ?? "");
    r++;
  }
  b.spacerRow(r++);
  // Inputs, linked to Assumptions.
  b.section(r++, "Inputs (from Assumptions)", [[3, 7]]);
  const input = (key: string, label: string, f: string, expect: number, fmt: string, note?: string) => {
    b.row(key, r);
    b.text(r, 2, label, { style: "line" });
    b.formula(r, 3, f, { fmt, expect, label });
    if (note) b.note(r, notesCol, note);
    r++;
  };
  input("price", "Purchase Price (Valuation Mid)", `${S("valuation")}$D$${rowOf("valuation", "totalInvestment")}`, d.purchasePrice / K, FMT.currency, "Valuation tab, Mid case");
  input("cashAtClose", "Cash at Close", `${addr(b.r("price"), 3)}*${A("cashAtClosePct")}`, d.cashAtClose / K, FMT.currency);
  input("sellerNote", "Seller Note", `${addr(b.r("price"), 3)}*${A("sellerNotePct")}`, d.sellerNote / K, FMT.currency);
  input("escrow", "Indemnity Escrow", `${addr(b.r("cashAtClose"), 3)}*${A("escrowPct")}`, d.escrow / K, FMT.currency, "10% of cash at close, held 15 months (LOI12 §7(h))");
  input("holdback", "Reconciliation Holdback", `${S("pnl")}${colLetter(periodLayout(model, 3).byKey[model.valuationDetail!.period.key]!)}${rowOf("pnl", "payroll")}/12*${A("reconciliationHoldbackMonths")}`, d.reconciliationHoldback / K, FMT.currency, asset ? "One month of LTM payroll, per recent AMB offers" : "Equity purchase: months set to zero on Assumptions");
  input("fees", "Buyer Transaction Fees", `${A("transactionFees")}/${K}`, model.assumptions!.deal.transactionFees / K, FMT.currency);
  input("offerCount", "Structure Columns (#)", "SUMPRODUCT(--(LEN($C$6:$G$6)>0))", model.deal!.length, FMT.term, "Offer Comparison builds at two or more");
  b.defineName("Offer_Count", `$C$${b.r("offerCount")}`);
  b.defineName("Offer_Headline_1", `$C$${b.r("price")}`);
  b.defineName("Offer_CashAtClose_1", `$C$${b.r("cashAtClose")}`);
  input("equityPct", "Buyer Equity Injection (% of uses)", A("equityInjectionPct"), model.assumptions!.deal.equityInjectionPct, FMT.pct);
  b.spacerRow(r++);
  // Sources and uses.
  const su = d.sourcesAndUses;
  const basis = model.valuationDetail!.basis;
  b.section(r++, "Sources and uses", [[3, 7]]);
  ["$000s", "% Total", "x Adj. EBITDA", "x PF Adj. EBITDA", "x SDE"].forEach((h, i) => b.cell(r, 3 + i, { style: "header", v: h, role: "text" }));
  b.cell(r, 2, { style: "header", v: "Uses", role: "text", align: { horizontal: "left" } });
  r++;
  const totalsRowRefs: Record<string, number> = {};
  // Key totals on this tab: FFFFCC with a thin top and a double bottom rule, no side borders (guide 5.5 Sources & Uses).
  const totalRule = (rr: number, lastCol: number) => {
    for (let c = 2; c <= lastCol; c++) b.cell(rr, c, { fill: COLOR.keyTotal, border: { top: "thin", bottom: "double" } });
  };
  const line = (key: string, label: string, f: string | number, expect: number, kind: "lineFirst" | "line" | "keyTotal", totalKey?: string) => {
    b.row(key, r);
    b.text(r, 2, label, { style: kind });
    if (typeof f === "number") b.num(r, 3, f, { style: kind, fmt: kind === "line" ? FMT.body : FMT.currency });
    else b.formula(r, 3, f, { style: kind, fmt: kind === "line" ? FMT.body : FMT.currency, expect: expect / K, label: key });
    const tot = totalKey ? addr(totalsRowRefs[totalKey]!, 3, { row: true }) : addr(r, 3);
    const totalAmount = totalKey === "uses" ? su.uses.total : totalKey === "sources" ? su.sources.total : expect;
    b.formula(r, 4, `IFERROR(${addr(r, 3)}/${tot},"n.a.")`, { style: "ratio", fmt: FMT.pct, expect: totalAmount ? expect / totalAmount : "n.a.", label: `${key} pct` });
    const ladderCol = colLetter(periodLayout(model, 3).byKey[model.columns.find((c) => c.ref.kind === "pf")?.key ?? model.valuationDetail!.period.key]!);
    b.formula(r, 5, `IFERROR(${addr(r, 3)}/${S("ladder")}${ladderCol}${rowOf("ladder", "adj_ebitda")},"n.a.")`, { style: "line", fmt: FMT.multiple, expect: basis.adjEbitda ? expect / basis.adjEbitda : "n.a.", label: `${key} x adj` });
    b.formula(r, 6, `IFERROR(${addr(r, 3)}/${S("ladder")}${ladderCol}${rowOf("ladder", "pf_adj_ebitda")},"n.a.")`, { style: "line", fmt: FMT.multiple, expect: basis.pfAdjEbitda ? expect / basis.pfAdjEbitda : "n.a.", label: `${key} x pf` });
    b.formula(r, 7, `IFERROR(${addr(r, 3)}/${S("ladder")}${ladderCol}${rowOf("ladder", "sde")},"n.a.")`, { style: "line", fmt: FMT.multiple, expect: basis.sde ? expect / basis.sde : "n.a.", label: `${key} x sde` });
    if (kind === "keyTotal") totalRule(r, 7);
    r++;
  };
  totalsRowRefs.uses = r + (asset ? 4 : 3);
  line("usePrice", "Purchase Price (EV)", addr(b.r("price"), 3), su.uses.purchasePrice, "lineFirst", "uses");
  // The holdback is part of the price, paid into escrow at close rather than to the Seller: a memo under the price, never a second use of cash.
  if (asset) {
    b.row("useHoldback", r);
    b.text(r, 2, "of which: funded to reconciliation escrow", { style: "line", font: { italic: true }, align: { horizontal: "left", indent: 1 } });
    b.formula(r, 3, addr(b.r("holdback"), 3), { style: "line", font: { italic: true }, fmt: FMT.body, expect: su.uses.reconciliationHoldback / K, label: "holdback memo" });
    b.note(r, notesCol, "Memo: inside the Purchase Price; not added to Total Uses");
    r++;
  }
  line("useFees", "Transaction Fees", addr(b.r("fees"), 3), su.uses.transactionFees, "line", "uses");
  line("useWc", "Working Capital Funding", su.uses.workingCapitalFunding / K, su.uses.workingCapitalFunding, "line", "uses");
  line("totalUses", "Total Uses", `${addr(b.r("usePrice"), 3)}+SUM(${addr(b.r("useFees"), 3)}:${addr(b.r("useWc"), 3)})`, su.uses.total, "keyTotal");
  r++;
  b.cell(r, 2, { style: "header", v: "Sources", role: "text", align: { horizontal: "left" } });
  for (let c = 3; c <= 7; c++) b.cell(r, c, { style: "header", v: null, role: "text" });
  r++;
  totalsRowRefs.sources = r + 4;
  line("seniorLoan", "Senior / SBA Loan", `${addr(b.r("totalUses"), 3)}-${addr(r + 1, 3)}-${addr(r + 2, 3)}-${addr(r + 3, 3)}`, su.sources.seniorLoan, "lineFirst", "sources");
  line("srcNote", "Seller Note", addr(b.r("sellerNote"), 3), su.sources.sellerNote, "line", "sources");
  line("srcRollover", "Rollover Equity", su.sources.rolloverEquity / K, su.sources.rolloverEquity, "line", "sources");
  line("srcEquity", "Buyer Equity", `${addr(b.r("totalUses"), 3)}*${addr(b.r("equityPct"), 3)}`, su.sources.buyerEquity, "line", "sources");
  line("totalSources", "Total Sources", `SUM(${addr(b.r("seniorLoan"), 3)}:${addr(b.r("srcEquity"), 3)})`, su.sources.total, "keyTotal");
  b.row("su_check", r);
  b.text(r, 2, "Check: Sources less Uses", { style: "check" });
  b.formula(r, 3, `${addr(b.r("totalSources"), 3)}-${addr(b.r("totalUses"), 3)}`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: "C11" });
  b.checkCf(r, 3, 3);
  r += 2;
  // Seller proceeds.
  const p = d.proceeds;
  b.section(r++, asset ? "Seller proceeds (asset purchase)" : "Seller proceeds (equity purchase)", [[3, 7]]);
  const debtLink = (key: "fundedDebt" | "debtLike") => `-${S("debtLike")}$C$${rowOf("debtLike", key)}`;
  const cards = model.debtLike ? model.debtLike.items.filter((i) => i.treatment === "debt" && isCreditCard(i.item)).reduce((s, i) => s + i.balance, 0) : undefined;
  type ProceedsRow = [string, string, string | number, number, "lineFirst" | "line" | "keyTotal", string?];
  const proceeds: ProceedsRow[] = asset
    ? [
        ["pPrice", "Purchase Price", addr(b.r("price"), 3), p.purchasePrice, "lineFirst"],
        ...(cards !== undefined
          ? ([
              ["pDebt", "(-) Liens and Secured Debt Paid at Close", `${debtLink("fundedDebt")}+${S("debtLike")}$C$${rowOf("debtLike", "creditCards")}`, -(p.debtPaidAtClose - cards), "line", "Written payoff letters and lien releases at close"],
              ["pCards", "(-) Credit Card Balances Paid at Close", `-${S("debtLike")}$C$${rowOf("debtLike", "creditCards")}`, -cards, "line", "Unsecured; repaid from proceeds at close (LOI12)"],
            ] as ProceedsRow[])
          : ([["pDebt", "(-) Liens and Secured Debt Paid at Close", -p.debtPaidAtClose / K, -p.debtPaidAtClose, "line", "Written payoff letters at close"]] as ProceedsRow[])),
        ["pHoldback", "(-) Reconciliation Holdback", `-${addr(b.r("holdback"), 3)}`, -p.reconciliationHoldback, "line", "One month of payroll"],
        ["pFees", "(-) Transaction Expenses", -p.transactionExpenses / K, -p.transactionExpenses, "line", "Seller's advisors; enter when known"],
        ["pEscrow", "(-) Indemnity Escrow (funded at close)", `-${addr(b.r("escrow"), 3)}`, -p.indemnityEscrow, "line"],
        ["pNote", "(-) Seller Note (deferred)", `-${addr(b.r("sellerNote"), 3)}`, -p.sellerNoteDeferred, "line"],
        ["closingCash", "Closing Cash to Seller", "SUMRANGE", p.closingCash, "keyTotal"],
        ["pHoldbackRel", "(+) Holdback Released (expected)", addr(b.r("holdback"), 3), p.holdbackReleased, "line"],
        ["pEscrowRel", "(+) Escrow Released (expected)", addr(b.r("escrow"), 3), p.escrowReleased, "line"],
        ["pNotePrincipal", "(+) Seller Note Principal", addr(b.r("sellerNote"), 3), p.sellerNotePrincipal, "line"],
        ["totalConsideration", "Total Consideration", "SUMRANGE2", p.totalConsideration, "keyTotal"],
      ]
    : [
        ["pPrice", "Purchase Price (EV)", addr(b.r("price"), 3), p.purchasePrice, "lineFirst"],
        ["pDebt", "(-) Funded Debt Repaid at Close", model.debtLike ? debtLink("fundedDebt") : -p.debtPaidAtClose / K, -p.debtPaidAtClose, "line"],
        ["pDebtLike", "(-) Debt-Like Items", model.debtLike ? debtLink("debtLike") : -p.debtLikeItems / K, -p.debtLikeItems, "line"],
        ["pNwc", "(+) / (-) NWC Delivered vs. Peg", model.nwc && model.nwc.peg !== null ? `${S("nwc")}$${colLetter(nwcLayout(model).vsCol)}$${rowOf("nwc", "adjustedNwc")}` : p.nwcVsPeg / K, p.nwcVsPeg, "line", model.nwc?.peg === null ? "No peg (year-end balance sheets only)" : undefined],
        ["pFees", "(-) Transaction Expenses", -p.transactionExpenses / K, -p.transactionExpenses, "line", "Seller's advisors; enter when known"],
        ["pEscrow", "(-) Indemnity Escrow", `-${addr(b.r("escrow"), 3)}`, -p.indemnityEscrow, "line"],
        ["pNote", "(-) Seller Note (deferred)", `-${addr(b.r("sellerNote"), 3)}`, -p.sellerNoteDeferred, "line"],
        ["closingCash", "Closing Cash to Seller", "SUMRANGE", p.closingCash, "keyTotal"],
        ["pEscrowRel", "(+) Escrow Released (expected)", addr(b.r("escrow"), 3), p.escrowReleased, "line"],
        ["pNotePrincipal", "(+) Seller Note Principal", addr(b.r("sellerNote"), 3), p.sellerNotePrincipal, "line"],
        ["totalConsideration", "Total Consideration", "SUMRANGE2", p.totalConsideration, "keyTotal"],
      ];
  let blockStart = r;
  for (const [key, label, f, expect, kind, note] of proceeds) {
    b.row(key, r);
    b.text(r, 2, label, { style: kind });
    if (kind === "keyTotal") totalRule(r, 3);
    const fmt = kind === "line" ? FMT.body : FMT.currency;
    if (typeof f === "number") b.num(r, 3, f, { style: kind, fmt });
    else {
      const formula = f === "SUMRANGE" ? `SUM(${addr(blockStart, 3)}:${addr(r - 1, 3)})` : f === "SUMRANGE2" ? `SUM(${addr(b.r("closingCash"), 3)}:${addr(r - 1, 3)})` : f;
      b.formula(r, 3, formula, { style: kind, fmt, expect: expect / K, label: key });
    }
    if (note) b.note(r, notesCol, note);
    r++;
  }
  if (asset) {
    // What the Seller keeps outside the price, each line labelled with exactly what it holds, then their sum.
    const sheet = model.valuation.bridge.asOf;
    const memoRow = (key: string, label: string, f: string | undefined, expect: number, note?: string) => {
      b.row(key, r);
      b.text(r, 2, label, { style: "line" });
      if (f) b.formula(r, 3, f, { style: "line", fmt: FMT.body, expect: expect / K, label: key });
      else b.na(r, 3, "n.a.", { style: "line" });
      if (note) b.note(r, notesCol, note);
      r++;
    };
    memoRow("memoCash", "Memo: seller-retained cash", sheet ? `${S("bs")}${colLetter(bsColumn(bsDates(model), sheet))}${rowOf("bs", "cash")}` : undefined, p.sellerRetainedCash ?? 0, sheet ? `Balance Sheet cash at ${monthLabel(sheet)}` : "No balance sheet in the sources");
    memoRow("memoNwc", "Memo: seller-retained NWC (AR + unbilled + prepaids - AP - accrued)", model.nwc ? `${S("nwc")}$${colLetter(nwcLayout(model).latestCol)}$${rowOf("nwc", "sellerRetained")}` : undefined, p.sellerRetainedNwc, model.nwc ? "NWC tab, latest balance sheet" : undefined);
    memoRow("memoRetained", "Memo: seller-retained cash and NWC", sheet && model.nwc ? `${addr(b.r("memoCash"), 3)}+${addr(b.r("memoNwc"), 3)}` : undefined, (p.sellerRetainedCash ?? 0) + p.sellerRetainedNwc);
    const alloc = d.allocation;
    if (alloc) {
      // Form 8594 (guide 5.5; SUNTAX): tangible classes at book value until an appraisal or agreed schedule replaces them; goodwill is the residual.
      b.spacerRow(r++);
      b.section(r++, "Purchase price allocation (Form 8594; internal, never in the CIM)", [[3, 7]]);
      const allocStart = r;
      const bsAt = (key: string) => (latestBsCol ? `${S("bs")}${colLetter(latestBsCol)}${rowOf("bs", key)}` : undefined);
      const premises = model.assumptions!.deal.premisesArrangement;
      const realty = (key: string, label: string, v: number | null) => {
        b.row(key, r);
        b.text(r, 2, label, { style: r === allocStart ? "lineFirst" : "line" });
        if (v === null) b.cell(r, 3, { v: null, role: "pending", fmt: FMT.body });
        else b.num(r, 3, v / K, { fmt: r === allocStart ? FMT.currency : FMT.body });
        b.note(r, notesCol, v === null ? "[Confirm: premises arrangement; appraisal if the property transfers]" : `Premises ${premises.toLowerCase()}: no ${label.toLowerCase()} transfers`);
        r++;
      };
      realty("aLand", "Land", alloc.land);
      realty("aBuilding", "Building", alloc.building);
      const tangible = (key: string, label: string, bsKey: string, v: number, note: string) => {
        b.row(key, r);
        b.text(r, 2, label, { style: "line" });
        const f = bsAt(bsKey);
        if (f) b.formula(r, 3, f, { style: "line", fmt: FMT.body, expect: v / K, label: key });
        else b.num(r, 3, v / K, { fmt: FMT.body });
        b.note(r, notesCol, note);
        r++;
      };
      tangible("aEquipment", "FF&E / Equipment", "fixed", alloc.equipment, `Net book value at ${ctx.asOfLabel.replace("As of ", "")}; an equipment appraisal or agreed schedule replaces it`);
      tangible("aInventory", "Inventory", "inventory", alloc.inventory, "At cost; counted at close");
      b.row("aNonCompete", r);
      b.text(r, 2, "Non-Compete", { style: "line" });
      b.num(r, 3, alloc.nonCompete / K, { fmt: FMT.body });
      b.note(r, notesCol, "Agree with tax counsel: ordinary income to the Seller");
      r++;
      b.row("aGoodwill", r);
      b.text(r, 2, "Goodwill (residual)", { style: "line" });
      b.formula(r, 3, `${addr(b.r("price"), 3)}-SUM(${addr(allocStart, 3)}:${addr(r - 1, 3)})`, { style: "line", fmt: FMT.body, expect: alloc.goodwill / K, label: "goodwill" });
      b.note(r, notesCol, "Purchase Price less the classes above");
      r++;
      b.row("aTotal", r);
      b.text(r, 2, "Total (equals the Purchase Price)", { style: "keyTotal" });
      b.formula(r, 3, `SUM(${addr(allocStart, 3)}:${addr(r - 1, 3)})`, { style: "keyTotal", fmt: FMT.currency, expect: d.purchasePrice / K, label: "allocation total" });
      totalRule(r, 3);
      r++;
    }
  }
  // Boot flag (guide 5.5): shown whenever buyer stock is meant to be received tax-deferred; a flag only, never after-tax proceeds.
  {
    const dd = model.assumptions!.deal;
    b.spacerRow(r++);
    b.row("taxFlag", r);
    b.text(r, 2, "Tax flag: stock consideration", { style: "line" });
    const cashShare = `TEXT((${addr(b.r("cashAtClose"), 3)}+${addr(b.r("sellerNote"), 3)})/${addr(b.r("price"), 3)},"0%")`;
    const expectShare = `${Math.round(((d.cashAtClose + d.sellerNote) / d.purchasePrice) * 100)}%`;
    b.formula(
      r,
      3,
      `IF(${A("stockTaxDeferred")}="Y","Stock-for-stock structure: cash elements are "&${cashShare}&" of consideration (reverse triangular merger limit 20%; forward merger continuity of interest ~40% stock). A cash working-capital true-up (settlement: "&${A("trueUpSettlement")}&") and a seller note count as boot. Confirm with tax counsel.","None: no buyer stock intended to be tax-deferred (Assumptions)")`,
      {
        role: "text",
        font: dd.stockTaxDeferred ? { color: COLOR.pending } : undefined,
        align: { horizontal: "left" },
        expect: dd.stockTaxDeferred ? `Stock-for-stock structure: cash elements are ${expectShare} of consideration (reverse triangular merger limit 20%; forward merger continuity of interest ~40% stock). A cash working-capital true-up (settlement: ${dd.trueUpSettlement}) and a seller note count as boot. Confirm with tax counsel.` : "None: no buyer stock intended to be tax-deferred (Assumptions)",
        label: "tax flag",
      },
    );
    r++;
  }
  b.spacerRow(r++);
  // Buyer debt service.
  const ds = d.debtService;
  b.section(r++, "Buyer debt service", [[3, 7]]);
  blockStart = r;
  input("svcSenior", "Senior / SBA Loan: Annual Debt Service", `-PMT(${A("loanRate")}/12,${A("loanTermYears")}*12,${addr(b.r("seniorLoan"), 3)})*12`, ds.seniorLoan / K, FMT.body, "= -PMT(rate/12, term × 12, principal) × 12");
  input("svcNote", "Seller Note: Year-One Service (quarterly)", `IF(${A("sellerNoteTermMonths")}>0,-PMT(${A("sellerNoteRate")}/4,${A("sellerNoteTermMonths")}/3,${addr(b.r("sellerNote"), 3)})*MIN(4,${A("sellerNoteTermMonths")}/3),0)`, ds.sellerNote / K, FMT.body, "Level quarterly amortisation over the note term");
  input("svcTotal", "Total Annual Debt Service", `${addr(b.r("svcSenior"), 3)}+${addr(b.r("svcNote"), 3)}`, ds.total / K, FMT.currency);
  input("svcCfa", "Cash Flow Available for Debt Service", `${S("valuation")}$D$${rowOf("valuation", "cfads")}`, ds.cashFlowAvailable / K, FMT.currency, model.mode.mode === "mainStreet" ? "Valuation, Mid case: SDE less market replacement compensation and the capital reserve" : "Valuation: PF Adj. EBITDA less maintenance capex");
  b.row("dscr", r);
  b.text(r, 2, "DSCR", { style: "keyRate", align: { horizontal: "left" } });
  b.keyTotalBox([r, r], [[3, 3]]);
  b.formula(r, 3, `IFERROR(${addr(b.r("svcCfa"), 3)}/${addr(b.r("svcTotal"), 3)},"n.a.")`, { style: "keyRate", fmt: FMT.multiple2, expect: ds.dscr, label: "deal dscr" });
  const flag = dscrFlag(addr(r, 3), model);
  b.formula(r, notesCol, flag.f, { style: "note", role: "text", align: { horizontal: "left" }, expect: flag.expect, label: "deal dscr flag" });
  r += 2;
  b.note(r, 2, "Note: one structure column by default (Traditional: cash plus a seller note); add columns for competing LOIs and the Offer Comparison tab builds when two or more exist. Escrow and holdback are formulas on the price, never typed. The indemnity escrow is kept separate from any retention holdback.");
  b.print({ area: `B2:${addr(r, notesCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

// --- Sensitivities -----------------------------------------------------------------------------------

export function planSensitivities(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const grids = model.sensitivities;
  if (!grids?.length) return undefined;
  const b = new SheetBuilder("sensitivities", SHEET.sensitivities);
  const s = model.assumptions!.sensitivity;
  b.width(1, 1.71);
  b.width(2, 9);
  b.widths(3, 12, 8.71);
  // The toggle sits at the right end of row 3 inside the print width, so it prints and its rule covers the tab (guide 5.9).
  b.anatomy({ subtitle: "Sensitivities: Two-Way Grids Centred on the Base Case ($000s)", lastCol: 12, toggleCol: 12, masterToggle: ctx.masterToggle });
  const helperCol = 26;
  const mainStreet = model.mode.mode === "mainStreet";

  // Settings block sits under the grids; its rows are known up front so the axes can link to it.
  const gridRows = 13;
  const firstGrid = 5;
  const settingsTop = firstGrid + gridRows * grids.length + 1;
  const settings: Record<string, number> = {};
  // Settings labels spill across B:E; values sit in F and rationales run from G on one line.
  const valueCol = 6;
  const settingKeys = ["earningsMid", "earningsStep", "multipleMid", "multipleStep", "priceMid", "priceStep", "rateMid", "rateStep", "cashMid", "cashStep", "closingDeductions", "rounding", "bands", "hurdle", "bandWidth", "dscrHurdle", "tie_valuation", "tie_dscr", "tie_closingCash"];
  settingKeys.forEach((k, i) => (settings[k] = settingsTop + 2 + i));
  const set = (k: string) => addr(settings[k]!, valueCol, { row: true, col: true });
  const gridSpecs: { g: SensitivityGrid; colMid: string; colStep: string; rowMid: string; rowStep: string; helper: (rowVal: string, colVal: string) => string; rounded: boolean; tieKey: string; hurdleRef?: string; heat: boolean }[] = grids.map((g) => {
    switch (g.key) {
      case "valuation":
        return { g, colMid: set("multipleMid"), colStep: set("multipleStep"), rowMid: set("earningsMid"), rowStep: set("earningsStep"), helper: (rv, cv) => `${rv}*${cv}`, rounded: true, tieKey: "tie_valuation", heat: true };
      case "dscr":
        return { g, colMid: set("rateMid"), colStep: set("rateStep"), rowMid: set("priceMid"), rowStep: set("priceStep"), helper: (rv, cv) => `IFERROR(${S("valuation")}$D$${rowOf("valuation", "cfads")}/(-PMT(${cv}/12,${A("loanTermYears")}*12,MAX(0,${rv}*(1-${A("equityInjectionPct")})))*12),0)`, rounded: false, tieKey: "tie_dscr", hurdleRef: set("dscrHurdle"), heat: false };
      default:
        return { g, colMid: set("cashMid"), colStep: set("cashStep"), rowMid: set("priceMid"), rowStep: set("priceStep"), helper: (rv, cv) => `${rv}*${cv}*(1-${A("escrowPct")})-${set("closingDeductions")}`, rounded: true, tieKey: "tie_closingCash", heat: false };
    }
  });

  gridSpecs.forEach((spec, gi) => {
    const top = firstGrid + gi * gridRows;
    const { g } = spec;
    // The title runs on across the empty cells to its right, as the first grid's does; wrapped in the 9-wide column it stacked into six lines.
    b.text(top, 2, g.title, { font: { bold: true, underline: true }, align: { horizontal: "left", wrap: false } });
    b.height(top, 15);
    b.height(top + 1, ROW_HEIGHT.thin);
    // Axis-title band and column-axis values on maroon.
    for (let c = 2; c <= 12; c++) b.cell(top + 2, c, { style: "headerGroup", v: c === 4 ? g.colAxis.label : null, role: "text" });
    b.cell(top + 2, 2, { align: { horizontal: "left" } });
    b.cell(top + 2, 3, { align: { horizontal: "left" } });
    b.height(top + 2, ROW_HEIGHT.body);
    const axisRow = top + 3;
    b.height(axisRow, ROW_HEIGHT.body);
    b.cell(axisRow, 2, { style: "header", v: null, role: "text" });
    b.cell(axisRow, 3, { style: "header", v: null, role: "text" });
    for (let j = 0; j < 9; j++) {
      const c = 4 + j;
      const f = j === 4 ? spec.colMid : j < 4 ? `${addr(axisRow, c + 1)}-${spec.colStep}` : `${addr(axisRow, c - 1)}+${spec.colStep}`;
      b.formula(axisRow, c, f, { style: "header", fmt: g.colAxis.fmt, role: "text", font: { color: COLOR.white, bold: true }, expect: g.colAxis.values[j], label: `${g.key} col axis ${j}` });
    }
    const body0 = axisRow + 1;
    // The row-axis label is merged down the seven body rows (guide 5.5), centred and wrapped, never rotated.
    b.plan.merges.push(`${addr(body0, 2)}:${addr(body0 + 6, 2)}`);
    for (let i = 0; i < 7; i++) {
      const rr = body0 + i;
      b.height(rr, ROW_HEIGHT.body);
      b.cell(rr, 2, { style: "header", v: i === 0 ? g.rowAxis.label : null, role: "text", align: { horizontal: "center", vertical: "middle", wrap: true } });
      const rf = i === 3 ? spec.rowMid : i < 3 ? `${addr(rr + 1, 3)}-${spec.rowStep}` : `${addr(rr - 1, 3)}+${spec.rowStep}`;
      b.formula(rr, 3, rf, { style: "header", fmt: g.rowAxis.fmt, role: "text", font: { color: COLOR.white, bold: true }, expect: g.rowAxis.values[i]! / (g.key === "valuation" || g.rowAxis.label.includes("$") ? K : 1), label: `${g.key} row axis ${i}` });
      for (let j = 0; j < 9; j++) {
        const c = 4 + j;
        const hc = helperCol + gi * 11 + j;
        const helperCell = addr(rr, hc);
        const rowVal = addr(rr, 3, { col: true });
        const colVal = addr(axisRow, c, { row: true });
        const engine = g.body[i]![j]!;
        const inUnits = g.key === "dscr" ? engine : engine / K;
        b.formula(rr, hc, spec.helper(rowVal, colVal), { style: "helper", role: "helper", fmt: g.bodyFmt, expect: inUnits, label: `${g.key} helper ${i},${j}` });
        const shown = spec.rounded ? `ROUND(${helperCell},${set("rounding")})` : helperCell;
        const expect = spec.rounded ? roundTo(inUnits, s.roundingDigits) : inUnits;
        const isBase = i === 3 && j === 4;
        b.formula(rr, c, shown, {
          role: "calc",
          fmt: g.bodyFmt,
          expect,
          label: `${g.key} body ${i},${j}`,
          font: isBase ? { bold: true } : undefined,
          border: isBase ? { top: "thin", bottom: "thin", left: "thin", right: "thin" } : i === 6 ? { bottom: "thin" } : undefined,
          borderColor: isBase ? COLOR.maroon : undefined,
          align: { horizontal: "right" },
        });
      }
    }
    for (let c = 2; c <= 3; c++) b.cell(body0 + 6, c, { border: { bottom: "thin" } });
    b.note(body0 + 7, 2, `Note: ${g.note} Base case at the centre (bold, boxed).${spec.hurdleRef ? ` Cells inside the box clear the ${s.dscrHurdle.toFixed(2)}x DSCR hurdle.` : ""}${spec.heat ? " Shading deepens by band above the Low case (settings below)." : ""}`);
    b.height(body0 + 7, 15);
    b.height(body0 + 8, ROW_HEIGHT.spacer);
    const bodyRef = `${addr(body0, 4)}:${addr(body0 + 6, 12)}`;
    if (spec.hurdleRef) b.cf({ ref: bodyRef, formula: `${addr(body0, 4)}>=${spec.hurdleRef}`, border: { top: "thin", bottom: "thin", left: "thin", right: "thin" } });
    if (spec.heat) {
      const bands = s.gradientBands;
      for (let k = 1; k <= bands; k++) {
        const lo = `${set("hurdle")}+(${k}-1)*${set("bandWidth")}`;
        const hi = `${set("hurdle")}+${k}*${set("bandWidth")}`;
        const cmp = k === bands ? "<=" : "<";
        const ramp = COLOR.ramp[Math.min(COLOR.ramp.length - 1, Math.round(((k - 1) / Math.max(1, bands - 1)) * (COLOR.ramp.length - 2)))]!;
        b.cf({ ref: bodyRef, formula: `AND(${addr(body0, 4)}>=${lo},${addr(body0, 4)}${cmp}${hi})`, fill: ramp });
      }
    }
  });

  // Settings block.
  let r = settingsTop;
  b.section(r, "Sensitivity Assumptions", [[3, 12]]);
  b.cell(r, valueCol, { v: "Value", align: { horizontal: "right" } });
  b.cell(r, valueCol + 1, { v: "Rationale", align: { indent: 1 } });
  r += 2;
  const mid = model.valuationDetail!.cases.mid;
  const deal = model.deal![0]!;
  const settingRows: [string, string, string, number | string, string, string, "link" | "calc" | "input" | "inSheet"][] = [
    ["earningsMid", `${mainStreet ? "SDE" : "Adj. EBITDA"} — Midpoint`, `${S("valuation")}$D$${rowOf("valuation", "earnings")}`, mid.sde / K, FMT.currency, "Valuation, Mid case", "link"],
    ["earningsStep", `${mainStreet ? "SDE" : "Adj. EBITDA"} — Step`, `${set("earningsMid")}*${A("earningsStepPct")}`, (mid.sde * s.earningsStepPct) / K, FMT.currency, `Per AMB; ${s.earningsStepPct * 100}% of the base`, "calc"],
    ["multipleMid", "Multiple — Midpoint", A_AT(mainStreet ? "sdeMultiples" : "ebitdaMultiples", 1), mid.multiple, FMT.multiple, "Assumptions, Mid", "link"],
    ["multipleStep", "Multiple — Step", A("multipleStep"), s.multipleStep, FMT.multiple2, "Per AMB", "link"],
    ["priceMid", "Purchase Price — Midpoint", `${S("deal")}$C$${rowOf("deal", "price")}`, deal.purchasePrice / K, FMT.currency, "Deal Structure", "link"],
    ["priceStep", "Purchase Price — Step", `${set("priceMid")}*${A("priceStepPct")}`, (deal.purchasePrice * s.priceStepPct) / K, FMT.currency, `Per AMB; ${s.priceStepPct * 100}% of the base`, "calc"],
    ["rateMid", "Interest Rate — Midpoint", A("loanRate"), model.assumptions!.deal.loanRate, FMT.rate, "Assumptions", "link"],
    ["rateStep", "Interest Rate — Step", A("rateStep"), s.rateStep, FMT.rate, "Per AMB", "link"],
    ["cashMid", "Cash at Close % — Midpoint", A("cashAtClosePct"), model.assumptions!.deal.cashAtClosePct, FMT.pct, "Assumptions", "link"],
    ["cashStep", "Cash at Close % — Step", A("cashPctStep"), s.cashPctStep, FMT.pct, "Per AMB", "link"],
    ["closingDeductions", "Deductions from Cash at Close", `${S("deal")}$C$${rowOf("deal", "cashAtClose")}-${S("deal")}$C$${rowOf("deal", "escrow")}-${S("deal")}$C$${rowOf("deal", "closingCash")}`, (deal.cashAtClose - deal.escrow - deal.proceeds.closingCash) / K, FMT.currency, "Liens, holdback and expenses paid at close (Deal Structure)", "link"],
    ["rounding", "Rounding — $ Tables (Digits)", A("roundingDigits"), s.roundingDigits, FMT.term, "0 = nearest $1K at $000s", "link"],
    ["bands", "Gradient Bands (#)", A("gradientBands"), s.gradientBands, FMT.term, "Shading bands above the hurdle", "link"],
    ["hurdle", "Hurdle ($ table)", `${S("valuation")}$C$${rowOf("valuation", "businessValuation")}`, model.valuationDetail!.cases.low.businessValuation / K, FMT.currency, "Low case business valuation", "link"],
    ["bandWidth", "Band Width", `IFERROR((MAX(${addr(firstGrid + 4, helperCol)}:${addr(firstGrid + 10, helperCol + 8)})-${set("hurdle")})/${set("bands")},0)`, (Math.max(...grids[0]!.body.flat()) / K - model.valuationDetail!.cases.low.businessValuation / K) / s.gradientBands, FMT.currency, "(MAX of the unrounded $ grid less the hurdle) ÷ bands", "calc"],
    ["dscrHurdle", "DSCR Hurdle (x)", A("dscrHurdle"), s.dscrHurdle, FMT.multiple2, "SBA lenders underwrite to 1.25x", "link"],
    ["tie_valuation", `Tie Out — ${grids[0]!.title.split(" Based on")[0]}`, `${addr(firstGrid + 7, helperCol + 4)}-${S("valuation")}$D$${rowOf("valuation", "businessValuation")}`, 0, FMT.check, "Must equal zero (C30)", "calc"],
    ["tie_dscr", "Tie Out — DSCR", `${addr(firstGrid + gridRows + 7, helperCol + 11 + 4)}-${S("valuation")}$D$${rowOf("valuation", "dscr")}`, 0, FMT.check, "Must equal zero (C30)", "calc"],
    ["tie_closingCash", "Tie Out — Closing Cash to Seller", `${addr(firstGrid + 2 * gridRows + 7, helperCol + 22 + 4)}-${S("deal")}$C$${rowOf("deal", "closingCash")}`, 0, FMT.check, "Must equal zero (C30)", "calc"],
  ];
  for (const [key, label, f, expect, fmt, rationale, role] of settingRows) {
    const rr = settings[key]!;
    b.row(key, rr);
    // Labels run on across B:E (empty on these rows); the value is in F and the rationale from G.
    b.text(rr, 2, label, { style: key.startsWith("tie") ? "check" : "line", align: { horizontal: "left", wrap: false } });
    b.formula(rr, valueCol, f, { fmt, expect, role: key.startsWith("tie") ? "check" : role, tol: key.startsWith("tie") ? 1e-6 : undefined, label: key, style: key.startsWith("tie") ? "check" : undefined });
    b.note(rr, valueCol + 1, rationale, { align: { wrap: false, indent: 1 } });
    if (key.startsWith("tie")) b.checkCf(rr, valueCol, valueCol);
  }
  const lastPrinted = settings.tie_closingCash! + 1;
  b.text(4, helperCol, "Helper: unrounded grid values (grey; outside the print area)", { style: "helper" });
  // Four grids to a page (guide 5.5). The settings block follows the last grid, on a page of its own once two or more
  // grids share that page: two grids and the 21 settings rows overrun a portrait page, and a break inside the block
  // strands its heading or its tie-outs.
  const gridsOnLastPage = grids.length > 4 ? grids.length - 4 : grids.length;
  const rowBreaks = [...(grids.length > 4 ? [firstGrid + 4 * gridRows - 1] : []), ...(gridsOnLastPage >= 2 ? [settingsTop - 1] : [])];
  b.print({ area: `B2:${addr(lastPrinted, 12)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:4", rowBreaks });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.plan.toggleRanges = [`B${firstGrid}:L${lastPrinted}`];
  return b;
}
