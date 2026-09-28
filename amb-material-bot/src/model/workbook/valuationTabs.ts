// Opportunities, Valuation, Deal Structure and Sensitivities (guide 5.1 rows
// 21-24, 5.5). Internal tabs: nothing here reaches the CIM (D5). Every
// input is a link to Assumptions; the grids compute in a grey helper block
// and round in place, with the base case at the centre.

import type { FinancialDataset } from "../../domain/financials.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, ROW_HEIGHT, WIDTH } from "../styles.ts";
import type { SensitivityGrid } from "../types.ts";
import { roundTo } from "../deal.ts";
import { A, A_AT, type TabContext } from "./assumptionsTab.ts";
import { bsDates, nwcLayout } from "./balance.ts";
import { periodLayout, S, SHEET } from "./layout.ts";

const K = 1000;

// --- Opportunities ------------------------------------------------------------------------------

export function planOpportunities(ctx: TabContext, ds: FinancialDataset | undefined): SheetBuilder | undefined {
  const { model } = ctx;
  const levers = ds?.intake?.growthLevers ?? [];
  if (!levers.length && !model.modules.built.includes("S9.1 Opportunity sizing")) return undefined;
  const b = new SheetBuilder("opportunities", SHEET.opportunities);
  const headers = ["Lever", "Baseline (per notes)", "Target or benchmark", "Mechanism", "Proof point", "Revenue uplift", "Margin (%)", "EBITDA effect"];
  const widths = [24, 26, 18, 30, 24, 11, 10, 11];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  b.spacerCol(10);
  const sourceCol = 11;
  b.width(sourceCol, 24);
  const lastCol = sourceCol;
  b.anatomy({ subtitle: "Growth opportunities: one sizing grid per lever ($000s)", lastCol, toggleCol: 9, masterToggle: ctx.masterToggle });
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
  b.width(7, WIDTH.notes);
  const notesCol = 7;
  b.anatomy({ subtitle: `Valuation and Financing ($000s; internal)`, lastCol: notesCol, toggleCol: 5, masterToggle: ctx.masterToggle });
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
  b.section(r++, `Earnings basis (${period.label}${pfCol ? `, pro forma ${pfCol.label}` : ""})`, spans);
  row("basisRevenue", "Total Revenue", "lineFirst", (i) => (i === 0 ? { f: pnl("revenue"), expect: basis.revenue / K } : undefined), FMT.currency, "P&L Summary");
  row("basisReported", "Reported EBITDA", "line", (i) => (i === 0 ? { f: ladder("reported_ebitda"), expect: basis.reportedEbitda / K } : undefined), FMT.body, "Adj. EBITDA ladder");
  row("basisAdj", "Adj. EBITDA", "line", (i) => (i === 0 ? { f: ladder("adj_ebitda"), expect: basis.adjEbitda / K } : undefined), FMT.body);
  row("basisPf", "PF Adj. EBITDA", "line", (i) => (i === 0 ? { f: ladder("pf_adj_ebitda"), expect: basis.pfAdjEbitda / K } : undefined), FMT.body);
  row("basisSde", "SDE", "line", (i) => (i === 0 ? { f: ladder("sde"), expect: basis.sde / K } : undefined), FMT.body);
  b.spacerRow(r++);
  b.section(r++, "Business valuation", spans);
  const earningsKey = mainStreet ? "basisSde" : "basisAdj";
  row("earnings", basisLabel, "lineFirst", () => ({ f: `$C$${b.r(earningsKey)}`, expect: vd.cases.low.sde / K }), FMT.currency, `${basisLabel} from the ladder`);
  row("multiple", "(x) Valuation Multiple", "line", (i) => ({ f: A_AT(mainStreet ? "sdeMultiples" : "ebitdaMultiples", i), expect: vd.cases[cases[i]!].multiple }), FMT.multiple, model.assumptions!.multiplesSource);
  row("businessValuation", "Business Valuation", "subtotal", (i) => ({ f: `${addr(b.r("earnings"), 3 + i)}*${addr(b.r("multiple"), 3 + i)}`, expect: vd.cases[cases[i]!].businessValuation / K }), FMT.currency);
  row("deferredCapex", "(+) Deferred Capex / Renovation", "line", () => ({ f: `${A("deferredCapex")}/${K}`, expect: vd.cases.low.deferredCapex / K }), FMT.body, "Assumptions");
  row("totalInvestment", "Total Investment", "keyTotal", (i) => ({ f: `ROUND((${addr(b.r("businessValuation"), 3 + i)}+${addr(b.r("deferredCapex"), 3 + i)})*${K},-1)/${K}`, expect: vd.cases[cases[i]!].totalInvestment / K }), FMT.currency, "Rounded to the nearest $10 (SUN)");
  row("impliedSde", "Implied SDE Multiple", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisSde"), 3)},"n.a.")`, expect: vd.cases[cases[i]!].impliedSdeMultiple }), FMT.multiple);
  row("impliedAdj", "Implied Adj. EBITDA Multiple", "line", (i) => ({ f: `IFERROR(${addr(b.r("totalInvestment"), 3 + i)}/${addr(b.r("basisAdj"), 3)},"n.a.")`, expect: vd.cases[cases[i]!].impliedAdjEbitdaMultiple }), FMT.multiple);
  b.spacerRow(r++);
  b.text(r++, 2, "Financing", { style: "subsection" });
  const fin = (i: number) => vd.cases[cases[i]!].financing;
  row("purchasePrice", "Purchase Price", "lineFirst", (i) => ({ f: addr(b.r("totalInvestment"), 3 + i), expect: fin(i).purchasePrice / K }), FMT.currency, "= Total Investment");
  row("equityInjection", "(-) Equity Injection", "line", (i) => ({ f: `${addr(b.r("purchasePrice"), 3 + i)}*${A("equityInjectionPct")}`, expect: fin(i).equityInjection / K }), FMT.body, "Assumptions: SBA 7(a) minimum 10%");
  row("loanPrincipal", "Loan Principal", "subtotal", (i) => ({ f: `MAX(0,${addr(b.r("purchasePrice"), 3 + i)}-${addr(b.r("equityInjection"), 3 + i)})`, expect: fin(i).loanPrincipal / K }), FMT.currency, "Never below zero (check C28)");
  row("term", "Term (Years)", "line", () => ({ f: A("loanTermYears"), expect: fin(0).termYears }), FMT.term, "Assumptions");
  row("rate", "Interest Rate", "line", () => ({ f: A("loanRate"), expect: fin(0).rate }), FMT.rate, "Assumptions");
  row("debtService", "Annual Debt Service", "line", (i) => ({ f: `-PMT(${addr(b.r("rate"), 3 + i)}/12,${addr(b.r("term"), 3 + i)}*12,${addr(b.r("loanPrincipal"), 3 + i)})*12`, expect: fin(i).annualDebtService / K }), FMT.body, "= -PMT(rate/12, term × 12, principal) × 12");
  row("cfads", "Cash Flow Available for Debt Service", "line", () => ({ f: mainStreet ? `${ladder("sde")}+${ladder("s2")}+${ladder("s3")}` : `${ladder("pf_adj_ebitda")}-${A("capitalReserve")}/${K}`, expect: fin(0).cashFlowAvailable / K }), FMT.body, mainStreet ? "SDE less market replacement compensation and the capital reserve" : "PF Adj. EBITDA less maintenance capex");
  row("dscr", "DSCR", "keyRate", (i) => ({ f: `IFERROR(${addr(b.r("cfads"), 3 + i)}/${addr(b.r("debtService"), 3 + i)},"n.a.")`, expect: fin(i).dscr }), FMT.multiple2, `${cases.map((c) => (vd.cases[c].financing.dscr < model.assumptions!.sensitivity.dscrHurdle ? `${c === "low" ? "Low" : c === "mid" ? "Mid" : "High"} < ${model.assumptions!.sensitivity.dscrHurdle.toFixed(2)}x` : "")).filter(Boolean).join("; ") || "All cases clear the 1.25x hurdle"}`);
  b.cell(b.r("dscr"), 2, { style: "keyRate", align: { horizontal: "left" } });
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
  const latestCash = model.periods[period.key]!.bs ? `${S("bs")}${colLetter(3 + bsDates(model).indexOf(period.end))}${rowOf("bs", "cash")}` : undefined;
  row("fundedDebt", "(-) Funded Debt", "line", () => (model.debtLike ? { f: `-${S("debtLike")}$C$${rowOf("debtLike", "fundedDebt")}`, expect: -bridge.fundedDebt / K } : { v: -bridge.fundedDebt / K }), FMT.body, "Debt-Like Items");
  row("debtLikeItems", "(-) Debt-Like Items", "line", () => (asset ? undefined : model.debtLike ? { f: `-${S("debtLike")}$C$${rowOf("debtLike", "debtLike")}`, expect: -bridge.debtLike / K } : { v: -bridge.debtLike / K }), FMT.body, asset ? "Asset purchase: retained by the Seller" : "Debt-Like Items");
  row("cashDelivered", "(+) Cash (if delivered)", "line", () => (asset || !latestCash ? undefined : { f: latestCash, expect: bridge.cash / K }), FMT.body, asset ? "Asset purchase: the Seller keeps its cash outside the price" : "Balance-sheet cash, swept to the Seller before close");
  row("nwcVsPeg", "(+) / (-) NWC Delivered vs. Peg", "line", () => (asset || !model.nwc || model.nwc.peg === null ? undefined : { f: `${S("nwc")}$${colLetter(nwcLayout(model).vsCol)}$${rowOf("nwc", "adjustedNwc")}`, expect: bridge.nwcVsPeg / K }), FMT.body, asset ? "Asset purchase: no peg; the Seller keeps receivables and payables" : model.nwc?.peg === null ? "No peg (year-end balance sheets only)" : "NWC tab");
  for (const key of ["debtLikeItems", "cashDelivered", "nwcVsPeg"]) cases.forEach((_, i) => b.get(b.r(key), 3 + i) ?? b.na(b.r(key), 3 + i, "n.a.", { style: "line" }));
  row("equityValue", "Equity Value to Seller", "keyTotal", (i) => ({ f: `SUM(${addr(b.r("ev"), 3 + i)}:${addr(b.r("nwcVsPeg"), 3 + i)})`, expect: v.equityValue[cases[i]!] / K }), FMT.currency);
  r++;
  b.note(r, 2, `Note: ${mainStreet ? "Main Street mode: SDE × multiple (IBBA basis SBA lenders underwrite)." : "Lower-middle-market mode: Adj. EBITDA × multiple."} Multiples are placeholders until the licensed comps source is applied (Assumptions). DSCR below 1.25x is flagged in the basis column, never coloured. Nothing on this tab enters the CIM.`);
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
  b.anatomy({ subtitle: `Deal Structure: ${d.name} (${d.preset}; ${asset ? "asset purchase" : "equity purchase"}) ($000s)`, lastCol: notesCol, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 3, to: 7, label: d.name }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: 7 }, [{ col: 3, v: "Reference" }], "Term");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  let r = 8;
  const tint = (rr: number) => b.cell(rr, 2, { fill: COLOR.section });
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
  input("holdback", "Reconciliation Holdback", `${S("pnl")}${colLetter(periodLayout(model, 3).byKey[model.valuationDetail!.period.key]!)}${rowOf("pnl", "payroll")}/12*${A("reconciliationHoldbackMonths")}`, d.reconciliationHoldback / K, FMT.currency, asset ? "One month of LTM payroll (ICP5)" : "Equity purchase: months set to zero on Assumptions");
  input("fees", "Buyer Transaction Fees", `${A("transactionFees")}/${K}`, model.assumptions!.deal.transactionFees / K, FMT.currency);
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
  const line = (key: string, label: string, f: string | number, expect: number, kind: "lineFirst" | "line" | "keyTotal", totalKey?: string) => {
    b.row(key, r);
    b.text(r, 2, label, { style: kind });
    if (typeof f === "number") b.num(r, 3, f, { style: kind, fmt: kind === "line" ? FMT.body : FMT.currency });
    else b.formula(r, 3, f, { style: kind, fmt: kind === "line" ? FMT.body : FMT.currency, expect: expect / K, label: key });
    const tot = totalKey ? addr(totalsRowRefs[totalKey]!, 3, { row: true }) : addr(r, 3);
    b.formula(r, 4, `IFERROR(${addr(r, 3)}/${tot},"n.a.")`, { style: "ratio", fmt: FMT.pct, label: `${key} pct` });
    const ladderCol = colLetter(periodLayout(model, 3).byKey[model.columns.find((c) => c.ref.kind === "pf")?.key ?? model.valuationDetail!.period.key]!);
    b.formula(r, 5, `IFERROR(${addr(r, 3)}/${S("ladder")}${ladderCol}${rowOf("ladder", "adj_ebitda")},"n.a.")`, { style: "line", fmt: FMT.multiple, expect: basis.adjEbitda ? expect / basis.adjEbitda : "n.a.", label: `${key} x adj` });
    b.formula(r, 6, `IFERROR(${addr(r, 3)}/${S("ladder")}${ladderCol}${rowOf("ladder", "pf_adj_ebitda")},"n.a.")`, { style: "line", fmt: FMT.multiple, expect: basis.pfAdjEbitda ? expect / basis.pfAdjEbitda : "n.a.", label: `${key} x pf` });
    b.formula(r, 7, `IFERROR(${addr(r, 3)}/${S("ladder")}${ladderCol}${rowOf("ladder", "sde")},"n.a.")`, { style: "line", fmt: FMT.multiple, expect: basis.sde ? expect / basis.sde : "n.a.", label: `${key} x sde` });
    if (kind === "keyTotal") {
      b.keyTotalBox([r, r], [[3, 7]]);
      for (let c = 2; c <= 7; c++) b.cell(r, c, { border: { top: "thin", bottom: "double" } });
    }
    r++;
  };
  totalsRowRefs.uses = r + 4;
  line("usePrice", "Purchase Price (EV)", addr(b.r("price"), 3), su.uses.purchasePrice, "lineFirst", "uses");
  line("useFees", "Transaction Fees", addr(b.r("fees"), 3), su.uses.transactionFees, "line", "uses");
  line("useWc", "Working Capital Funding", su.uses.workingCapitalFunding / K, su.uses.workingCapitalFunding, "line", "uses");
  line("useHoldback", "Reconciliation Holdback (funded to escrow)", addr(b.r("holdback"), 3), su.uses.reconciliationHoldback, "line", "uses");
  line("totalUses", "Total Uses", `SUM(${addr(b.r("usePrice"), 3)}:${addr(b.r("useHoldback"), 3)})`, su.uses.total, "keyTotal");
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
  const proceeds: [string, string, string | number, number, "lineFirst" | "line" | "keyTotal", string?][] = asset
    ? [
        ["pPrice", "Purchase Price", addr(b.r("price"), 3), p.purchasePrice, "lineFirst"],
        ["pDebt", "(-) Liens and Secured Debt Paid at Close", model.debtLike ? debtLink("fundedDebt") : -p.debtPaidAtClose / K, -p.debtPaidAtClose, "line", "Written payoff letters at close (SUNPA)"],
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
    if (kind === "keyTotal") {
      b.keyTotalBox([r, r], [[3, 3]]);
      b.cell(r, 3, { border: { top: "thin", bottom: "double" } });
      b.cell(r, 2, { border: { top: "thin", bottom: "double" } });
    }
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
    b.text(r, 2, "Memo: seller-retained cash and NWC (AR + unbilled - AP - accrued)", { style: "line" });
    if (model.nwc) b.formula(r, 3, `${S("nwc")}$${colLetter(nwcLayout(model).latestCol)}$${rowOf("nwc", "sellerRetained")}`, { style: "line", fmt: FMT.body, expect: p.sellerRetainedNwc / K, label: "seller retained memo" });
    else b.na(r, 3, "n.a.", { style: "line" });
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
  input("svcCfa", "Cash Flow Available for Debt Service", `${S("valuation")}$C$${rowOf("valuation", "cfads")}`, ds.cashFlowAvailable / K, FMT.currency, model.mode.mode === "mainStreet" ? "SDE less market replacement compensation and the capital reserve" : "PF Adj. EBITDA less maintenance capex");
  b.row("dscr", r);
  b.text(r, 2, "DSCR", { style: "keyRate", align: { horizontal: "left" } });
  b.keyTotalBox([r, r], [[3, 3]]);
  b.formula(r, 3, `IFERROR(${addr(b.r("svcCfa"), 3)}/${addr(b.r("svcTotal"), 3)},"n.a.")`, { style: "keyRate", fmt: FMT.multiple2, expect: ds.dscr, label: "deal dscr" });
  b.note(r, notesCol, ds.dscr < model.assumptions!.sensitivity.dscrHurdle ? `Below the ${model.assumptions!.sensitivity.dscrHurdle.toFixed(2)}x hurdle with the seller note amortising inside ${model.assumptions!.deal.sellerNoteTermMonths} months; lengthen the note or lower the price` : "Clears the hurdle");
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
  b.width(13, 3.14);
  b.width(14, 16.86);
  b.width(15, 18.14);
  b.anatomy({ subtitle: "Sensitivities: two-way grids centred on the base case ($000s)", lastCol: 12, toggleCol: 15, masterToggle: ctx.masterToggle });
  b.text(3, 14, "Print", { align: { horizontal: "right" } });
  const helperCol = 26;
  const pnlL = periodLayout(model, 3);
  const pfKey = model.columns.find((c) => c.ref.kind === "pf")?.key ?? model.valuationDetail!.period.key;
  const ladder = (key: string) => `${S("ladder")}${colLetter(pnlL.byKey[pfKey]!)}${rowOf("ladder", key)}`;
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
    b.text(top, 2, g.title, { font: { bold: true, underline: true } });
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
    ["earningsMid", `${mainStreet ? "SDE" : "Adj. EBITDA"} — Midpoint`, ladder(mainStreet ? "sde" : "adj_ebitda"), mid.sde / K, FMT.currency, "Base case from the ladder", "link"],
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
    b.text(rr, 2, label, { style: key.startsWith("tie") ? "check" : "line" });
    b.formula(rr, valueCol, f, { fmt, expect, role: key.startsWith("tie") ? "check" : role, tol: key.startsWith("tie") ? 1e-6 : undefined, label: key, style: key.startsWith("tie") ? "check" : undefined });
    b.note(rr, valueCol + 1, rationale, { align: { wrap: false, indent: 1 } });
    if (key.startsWith("tie")) b.checkCf(rr, valueCol, valueCol);
  }
  const lastPrinted = settings.tie_closingCash! + 1;
  b.text(4, helperCol, "Helper: unrounded grid values (grey; outside the print area)", { style: "helper" });
  b.print({ area: `B2:${addr(lastPrinted, 12)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "2:4", rowBreaks: grids.length > 2 ? [firstGrid + 2 * gridRows - 1] : [] });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.plan.toggleRanges = [`B${firstGrid}:L${lastPrinted}`];
  return b;
}
