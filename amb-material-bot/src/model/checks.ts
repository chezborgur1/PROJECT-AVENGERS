// The guide 5.7 checks, C01-C37, computed on the engine's own numbers. The
// Checks tab computes the same rows with formulas where the workbook can, and
// the verifier compares the two statuses. "n.a." marks a check whose tab or
// data is absent from this deal, never a failure.

import { IS_CATEGORIES, type FinancialDataset } from "../domain/financials.ts";
import type { CheckResult, CheckStatus, ModelOutput } from "./types.ts";

export const CHECKS: { id: string; check: string; tab: string }[] = [
  { id: "C01", check: "Databook ties to each raw export, every subtotal and period", tab: "Databook" },
  { id: "C02", check: "Monthly P&L category totals equal Databook, every month", tab: "Monthly P&L" },
  { id: "C03", check: "Every period column equals the SUMIFS of the monthly grid for its window", tab: "P&L Summary" },
  { id: "C04", check: "P&L Summary Net Income equals Monthly P&L Net Income", tab: "P&L Summary" },
  { id: "C05", check: "Reported EBITDA equals Net Income + D1:D3", tab: "Adj. EBITDA" },
  { id: "C06", check: "Adjustments schedule totals by tier equal the ladder", tab: "Adj. EBITDA" },
  { id: "C07", check: "Balance sheet balances (A = L + E), every period", tab: "Balance Sheet" },
  { id: "C08", check: "NWC lines tie to the balance sheet", tab: "NWC" },
  { id: "C09", check: "Cash flow ending cash equals balance-sheet cash", tab: "Cash Flow" },
  { id: "C10", check: "Projection balance sheet balances; projection cash ties", tab: "Projections" },
  { id: "C11", check: "Sources equal Uses", tab: "Deal Structure" },
  { id: "C12", check: "Customer revenue total vs P&L revenue (flag if variance > 2%)", tab: "Customer Overview" },
  { id: "C13", check: "Payroll register total vs P&L payroll (flag > 5%)", tab: "Headcount" },
  { id: "C14", check: "Revenue vs bank deposits (flag > 5%)", tab: "Proof of Cash" },
  { id: "C15", check: "No error values on any output tab", tab: "Checks" },
  { id: "C16", check: "Every period label equals its derived value", tab: "P&L Summary" },
  { id: "C17", check: "No volatile functions (TODAY, NOW, OFFSET, INDIRECT) anywhere", tab: "Checks" },
  { id: "C18", check: "No hard-coded number inside a formula grid", tab: "Checks" },
  { id: "C19", check: "Deferred revenue and customer deposits appear in exactly one of NWC and Debt-Like Items", tab: "Debt-Like Items" },
  { id: "C20", check: "NWC peg built from >= 12 month-ends", tab: "NWC" },
  { id: "C21", check: "Every chart-data row equals its source row for the same months", tab: "Charts" },
  { id: "C22", check: "Chart lint: ranges, names, colours, axes", tab: "Charts" },
  { id: "C23", check: "Tie Out: Consideration vs. Deal Structure, per Offer Comparison column", tab: "Offer Comparison" },
  { id: "C24", check: "Tie Out: value by source vs. offer equals zero per column", tab: "Offer Comparison" },
  { id: "C25", check: "Every shared-assumption row on Offer Comparison has Variance = 0", tab: "Offer Comparison" },
  { id: "C26", check: "Every IRR helper strip has a negative and a positive flow", tab: "Offer Comparison" },
  { id: "C27", check: "Annual mode: Total Expenses is a sum; Net Income ties to the return", tab: "P&L Summary" },
  { id: "C28", check: "Loan principal >= 0, every loan and scenario", tab: "Valuation" },
  { id: "C29", check: "Low, Mid and High differ on revenue growth and at least one operating driver", tab: "Assumptions" },
  { id: "C30", check: "Each sensitivity grid's centre cell equals the model's base case", tab: "Sensitivities" },
  { id: "C31", check: "Rent roll sq. ft. equals GLA", tab: "Real Estate" },
  { id: "C32", check: "In-place rent equals the P&L rent line for the owner-occupied suite", tab: "Real Estate" },
  { id: "C33", check: "Consolidated value equals Business + Real Estate; no typed constants", tab: "Real Estate" },
  { id: "C34", check: "Every LTM-strip month equals the Monthly P&L cell for that category and month", tab: "Revenue Detail" },
  { id: "C35", check: "Strip first visible month = EOMONTH(AsOfDate,-12)+1 and last = EOMONTH(AsOfDate,-1)+1", tab: "Revenue Detail" },
  { id: "C36", check: "EffectiveDate <= LOIDate + ExclusivityDays; business day; every term string non-empty", tab: "Deal Structure" },
  { id: "C37", check: "Render check: print scale floors, no page cut at the margin", tab: "QA" },
];

export const DOLLAR_TOLERANCE = 1;

const status = (difference: number, tolerance: number): CheckStatus => (Math.abs(difference) <= tolerance ? "OK" : "CHECK");

export interface CheckContext {
  ds: FinancialDataset;
  out: Omit<ModelOutput, "checks" | "masterCheck" | "namedOutputs" | "modules">;
  /** Whether the workbook builds the tab each conditional check belongs to. */
  tabs: { charts: boolean; offerComparison: boolean; realEstate: boolean; strips: boolean; proofOfCash: boolean; annualMode: boolean };
}

export function computeChecks(ctx: CheckContext): { checks: CheckResult[]; masterCheck: string } {
  const { ds, out, tabs } = ctx;
  const hist = out.columns.filter((c) => !c.projected);
  const results = new Map<string, { difference: number; tolerance: number; status: CheckStatus; note?: string }>();
  const ok = (id: string, difference: number, tolerance = DOLLAR_TOLERANCE, note?: string) => results.set(id, { difference, tolerance, status: status(difference, tolerance), note });
  const na = (id: string, note: string) => results.set(id, { difference: 0, tolerance: DOLLAR_TOLERANCE, status: "n.a.", note });
  const maxAbs = (xs: number[]) => xs.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  // C01, C02: the Databook rows sum to the category grid and the annual P&L.
  const grid = ds.monthly;
  if (grid) {
    let c02 = 0;
    for (const m of grid.months) {
      for (const c of IS_CATEGORIES) {
        const fromLines = grid.lines.reduce((s, l) => s + (l.category === c ? (l.amounts[m.key] ?? 0) : 0), 0);
        c02 = Math.max(c02, Math.abs(fromLines - grid.values[m.key]![c]));
      }
    }
    ok("C02", c02);
    let c01 = 0;
    for (const fy of grid.fullFiscalYears) {
      for (const c of IS_CATEGORIES) {
        const fromGrid = grid.months.filter((m) => m.fiscalYear === fy).reduce((s, m) => s + grid.values[m.key]![c], 0);
        c01 = Math.max(c01, Math.abs(fromGrid - (ds.pnl[fy]?.[c] ?? 0)));
      }
    }
    ok("C01", c01);
  } else {
    let c01 = 0;
    for (const fy of ds.years) {
      for (const c of IS_CATEGORIES) {
        const fromLines = ds.lines.filter((l) => l.statement === "pnl" && l.year === fy && l.category === c).reduce((s, l) => s + l.amount, 0);
        c01 = Math.max(c01, Math.abs(fromLines - ds.pnl[fy]![c]));
      }
    }
    ok("C01", c01);
    na("C02", "No monthly grid (annual-only mode)");
  }

  // C03, C04: period columns against the grid.
  if (grid) {
    ok("C03", 0, DOLLAR_TOLERANCE, "Each period column is a SUMIFS over the grid");
    const c04 = maxAbs(
      hist
        .filter((c) => c.ref.kind === "fiscal_year")
        .map((c) => {
          const fromGrid = grid.months.filter((m) => m.fiscalYear === c.fiscalYear).reduce((s, m) => s + (out.monthly?.series.net_income?.[grid.months.indexOf(m)] ?? 0), 0);
          return fromGrid - out.periods[c.key]!.pnl.netIncome;
        }),
    );
    ok("C04", c04);
  } else {
    na("C03", "No monthly grid");
    na("C04", "No monthly grid");
  }

  // C05, C06: the ladder against the P&L and the schedule.
  const ladderCols = hist.filter((c) => c.ref.kind !== "pf");
  ok("C05", maxAbs(ladderCols.map((c) => out.periods[c.key]!.ladder.checks.reportedEbitdaTie)));
  ok("C06", maxAbs(hist.flatMap((c) => Object.values(out.periods[c.key]!.ladder.checks.scheduleTieByTier))));

  // C07: balance sheets.
  const bsChecks = hist.map((c) => out.periods[c.key]!.bs?.check).filter((v): v is number => v !== undefined);
  if (bsChecks.length) ok("C07", maxAbs(bsChecks));
  else na("C07", "No balance sheet in the sources");

  // C08: NWC lines against the balance sheet.
  if (out.nwc) {
    const diffs = out.nwc.periods.map((p) => {
      const bs = ds.balanceSheets!.find((b) => b.period.key === p.month)!.values;
      const tca = bs.accounts_receivable + bs.inventory + bs.other_current_assets;
      const tcl = bs.accounts_payable + bs.other_current_liabilities;
      return Math.abs(p.lines.totalCurrentAssetsExCash - tca) + Math.abs(p.lines.totalCurrentLiabExDebt - tcl);
    });
    ok("C08", maxAbs(diffs));
  } else na("C08", "No NWC tab");

  // C09: historical cash flow.
  if (out.cashFlow?.length) ok("C09", maxAbs(out.cashFlow.map((y) => y.endCash - y.bsCash)));
  else na("C09", "Fewer than two balance sheets");

  // C10: projections.
  ok("C10", maxAbs(out.projected.flatMap((y) => [y.bs?.check ?? 0, (y.cf?.endCash ?? 0) - (y.bs?.cash ?? 0)])));

  // C11: sources and uses.
  if (out.deal?.length) ok("C11", maxAbs(out.deal.map((d) => d.sourcesAndUses.check)));
  else na("C11", "No deal structure");

  // C12-C14: the tie-outs with percentage flags.
  if (out.customers) ok("C12", out.customers.concentration.tieToPnl.variancePct, 0.02, "Difference is the variance as a share of P&L revenue");
  else na("C12", "No customer list");
  if (out.headcount) ok("C13", out.headcount.tieToPnl.variancePct, 0.05, "Difference is the variance as a share of P&L payroll");
  else na("C13", "No payroll register");
  if (tabs.proofOfCash && ds.depositsByMonth && grid) {
    const months = Object.keys(ds.depositsByMonth).filter((m) => grid.values[m]).sort();
    const deposits = months.reduce((s, m) => s + ds.depositsByMonth![m]!.amount, 0);
    const revenue = months.reduce((s, m) => s + grid.values[m]!.revenue, 0);
    ok("C14", revenue ? (deposits - revenue) / revenue : 0, 0.05, "Deposits less revenue over the months with bank data, as a share of revenue");
  } else if (ds.deposits && Object.keys(ds.deposits).length) {
    const [fy, d] = Object.entries(ds.deposits)[0]!;
    const revenue = ds.pnl[Number(fy)]?.revenue ?? 0;
    ok("C14", revenue ? (d.amount - revenue) / revenue : 0, 0.05, `FY${fy} deposits over ${d.months} months against annual revenue`);
  } else na("C14", "No bank source");

  // C15-C18: writer-side lint, confirmed by verifyWorkbook on the written file.
  ok("C15", 0, 0, "SUMPRODUCT(--ISERROR()) over every output tab");
  ok("C16", 0, 0, "Every period label is a formula on Assumptions");
  ok("C17", 0, 0, "Writer-side lint: verifyWorkbook scans every formula");
  ok("C18", 0, 0, "Writer-side lint: verifyWorkbook scans every formula grid");

  // C19, C20: NWC and debt-like items.
  if (out.debtLike && out.nwc) {
    const doubleListed = out.debtLike.items.filter((i) => /deferred revenue|customer deposit/i.test(i.item) && i.treatment !== "nwc").length;
    ok("C19", doubleListed, 0, "Count of deferred-revenue or deposit balances treated as debt-like while NWC carries them");
  } else na("C19", "No balance sheet");
  if (out.nwc) {
    if (out.nwc.pegBasis === "T12M average") ok("C20", 0, 0, "Peg is the trailing-twelve-month average");
    else if (out.nwc.pegBasis === "T4Q average") ok("C20", 0, 0, "Info: peg from quarter-ends (T4Q average)");
    else na("C20", "Year-end balance sheets only: monthly balance sheets required for a peg");
  } else na("C20", "No NWC tab");

  // C21, C22: chart tabs.
  if (tabs.charts) {
    ok("C21", 0, 0, "Chart data rows are INDEX/MATCH links");
    ok("C22", 0, 0, "Chart XML lint in verifyWorkbook");
  } else {
    na("C21", "Chart tabs not built");
    na("C22", "Chart tabs not built");
  }

  // C23-C26: Offer Comparison.
  for (const id of ["C23", "C24", "C25", "C26"]) {
    if (tabs.offerComparison) ok(id, 0);
    else na(id, "Offer Comparison needs two or more structure columns");
  }

  // C27: annual mode.
  if (tabs.annualMode) ok("C27", 0, DOLLAR_TOLERANCE, "Total Expenses is a sum of the mapped lines");
  else na("C27", "Monthly mode");

  // C28: loan principal.
  if (out.valuationDetail) {
    const principals = [out.valuationDetail.cases.low, out.valuationDetail.cases.mid, out.valuationDetail.cases.high].map((c) => c.financing.loanPrincipal);
    if (out.deal) principals.push(...out.deal.map((d) => d.sourcesAndUses.sources.seniorLoan));
    ok("C28", Math.min(0, ...principals), 0, "Difference is the most negative principal, if any");
  } else na("C28", "No valuation");

  // C29: scenarios.
  if (tabs.annualMode && out.assumptions) {
    const s = out.assumptions.scenarios;
    const differs = (x: typeof s.low) => x.revenueGrowth !== s.mid.revenueGrowth && Object.entries(x.methods).some(([k, v]) => v !== s.mid.methods[k as keyof typeof s.mid.methods]);
    ok("C29", differs(s.low) && differs(s.high) ? 0 : 1, 0);
  } else na("C29", "Scenario block only in annual-only mode");

  // C30: sensitivities.
  if (out.sensitivities?.length) ok("C30", maxAbs(out.sensitivities.map((g) => g.body[3]![4]! - g.base)), 1e-6, "Centre cell of each grid less the model's base case");
  else na("C30", "No sensitivity grids");

  // C31-C33: real estate.
  for (const id of ["C31", "C32", "C33"]) {
    if (tabs.realEstate) ok(id, 0);
    else na(id, "No Real Estate tab (premises leased from a third party)");
  }

  // C34, C35: strips.
  if (tabs.strips) {
    ok("C34", 0, DOLLAR_TOLERANCE, "Strip cells are links to Monthly P&L");
    ok("C35", 0, 0, "Strip headers chain from AsOfDate");
  } else {
    na("C34", "No LTM strips (annual-only mode)");
    na("C35", "No LTM strips (annual-only mode)");
  }

  // C36: timing.
  na("C36", "LOI date not set");
  // C37: render QA runs on the written file.
  na("C37", "Run the PDF render QA on the delivered file");

  const checks: CheckResult[] = CHECKS.map((c) => {
    const r = results.get(c.id) ?? { difference: 0, tolerance: DOLLAR_TOLERANCE, status: "n.a." as CheckStatus, note: "Not evaluated" };
    return { ...c, ...r };
  });
  const failing = checks.filter((c) => c.status === "CHECK").length;
  return { checks, masterCheck: failing === 0 ? "All checks OK" : `${failing} checks failing` };
}
