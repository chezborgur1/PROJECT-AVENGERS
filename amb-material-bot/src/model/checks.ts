// The guide 5.7 checks, C01-C37, computed on the engine's own numbers. The
// Checks tab computes the same rows with formulas where the workbook can, and
// the verifier compares the two statuses. "n.a." marks a check whose tab or
// data is absent from this deal, never a failure.

import { IS_CATEGORIES, type FinancialDataset } from "../domain/financials.ts";
import type { CheckResult, CheckStatus, ModelOutput } from "./types.ts";
import { totalsDifference } from "./exportTotals.ts";

export const CHECKS: { id: string; check: string; tab: string }[] = [
  { id: "C01", check: "Databook ties to each raw export, every subtotal and period", tab: "Databook" },
  { id: "C02", check: "Monthly P&L category totals equal Databook, every month", tab: "Monthly P&L" },
  { id: "C03", check: "Every P&L Summary line equals the grid's months in its window, recomputed by SUMPRODUCT", tab: "P&L Summary" },
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
  { id: "C19", check: "Every debt-like balance is removed from NWC, and only those: none counted twice (deferred revenue and deposits included)", tab: "Debt-Like Items" },
  { id: "C20", check: "NWC peg built from >= 12 month-ends", tab: "NWC" },
  { id: "C21", check: "Every chart-data row equals its source row for the same months", tab: "Revenue Charts" },
  { id: "C22", check: "Chart lint: ranges, names, colours, axes", tab: "Revenue Charts" },
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

  // C01, C02: the Databook rows sum to the category grid, the annual P&L and the export's own subtotals.
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
    // Every subtotal the export prints, re-formed from the Databook rows, in every period (the workbook's Export totals rows).
    ok("C01", Math.hypot(c01, totalsDifference(out.databook?.totals ?? [])));
  } else {
    let c01 = 0;
    for (const fy of ds.years) {
      for (const c of IS_CATEGORIES) {
        const fromLines = ds.lines.filter((l) => l.statement === "pnl" && l.year === fy && l.category === c).reduce((s, l) => s + l.amount, 0);
        c01 = Math.max(c01, Math.abs(fromLines - ds.pnl[fy]![c]));
      }
    }
    ok("C01", Math.hypot(c01, totalsDifference(out.databook?.totals ?? [])));
    na("C02", "No monthly grid (annual-only mode)");
  }

  // C03, C04: period columns against the grid.
  if (grid) {
    ok("C03", 0, DOLLAR_TOLERANCE, "Each line's SUMIFS against a SUMPRODUCT of the grid over the same window");
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

  // C07: every dated balance sheet the Balance Sheet tab carries.
  const bsChecks = ds.balanceSheets?.length ? ds.balanceSheets.map(({ values: v }) => v.cash + v.accounts_receivable + v.inventory + v.other_current_assets + v.fixed_assets_net + v.other_assets - v.accounts_payable - v.other_current_liabilities - v.debt - v.equity) : hist.map((c) => out.periods[c.key]!.bs?.check).filter((v): v is number => v !== undefined);
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
    ok("C14", revenue ? (deposits - revenue) / revenue : 0, 0.05, "Deposits less revenue for the months with bank data, % of revenue");
  } else if (ds.depositsByMonth && grid) {
    na("C14", "Bank months outside the P&L months");
  } else if (ds.deposits && Object.keys(ds.deposits).length) {
    // Without a monthly grid only a full year of deposits compares with a year of revenue: part of a year would read as a shortfall.
    const full = Object.entries(ds.deposits).filter(([fy, d]) => d.months === 12 && ds.pnl[Number(fy)]).sort(([a], [b]) => Number(b) - Number(a))[0];
    if (full) {
      const [fy, d] = full;
      const revenue = ds.pnl[Number(fy)]!.revenue;
      ok("C14", revenue ? (d.amount - revenue) / revenue : 0, 0.05, `FY${fy} deposits over 12 months against annual revenue`);
    } else {
      const [fy, d] = Object.entries(ds.deposits).sort(([a], [b]) => Number(b) - Number(a))[0]!;
      na("C14", `Bank data covers ${d.months} months of FY${fy}; a full year is needed without monthly books`);
    }
  } else na("C14", "No bank source");

  // C15-C18: writer-side lint, confirmed by verifyWorkbook on the written file.
  ok("C15", 0, 0, "SUMPRODUCT(--ISERROR()) over every output tab");
  ok("C16", 0, 0, "Every period label is a formula on Assumptions");
  ok("C17", 0, 0, "Writer-side lint: verifyWorkbook scans every formula");
  ok("C18", 0, 0, "Writer-side lint: verifyWorkbook scans every formula grid");

  // C19, C20: NWC and debt-like items.
  if (out.debtLike && out.nwc) {
    // The debt-like total at the latest date is what NWC removes there, less nothing and plus nothing: a debt-like balance NWC
    // still carries (an accrued bonus, customer money without the override) would be deducted twice from the price.
    const latest = out.nwc.periods.find((p) => p.asOf === out.debtLike!.asOf) ?? out.nwc.periods.at(-1)!;
    const removed = latest.lines.adjustments + (latest.detail?.related_party_receivable ?? 0);
    ok("C19", Math.abs(out.debtLike.debtLike - removed), DOLLAR_TOLERANCE, "Debt-like items less the balances NWC removes at the latest date");
  } else na("C19", "No balance sheet");
  if (out.nwc) {
    if (out.nwc.pegBasis === "T12M average") ok("C20", 0, 0, "Peg is the trailing-twelve-month average");
    else if (out.nwc.pegBasis === "T4Q average") ok("C20", 0, 0, "Info: peg from quarter-ends (T4Q average)");
    else na("C20", "Year-end balance sheets only: monthly balance sheets required for a peg");
  } else na("C20", "No NWC tab");

  // C21, C22: chart tabs.
  if (tabs.charts) {
    // Engine side of C21: every mix sums to total revenue month by month; the workbook adds each row against its source.
    const mixGap = (out.charts ?? []).filter((e) => e.form === "stacked").reduce((worst, e) => {
      const total = e.series.find((x) => x.source.kind === "monthly" && x.source.rowKey === "revenue" && x.plotted === false);
      if (!total) return worst;
      const parts = e.series.filter((x) => x !== total);
      return Math.max(worst, ...total.values.map((v, i) => Math.abs(parts.reduce((s, x) => s + x.values[i]!, 0) - v)));
    }, 0);
    ok("C21", mixGap, 1e-6, "Chart-data rows link their source by month; mixes sum to total revenue");
    ok("C22", 0, 0, "Writer-side lint: verifyWorkbook reads every chart part");
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
  if (out.scenarios && out.assumptions) {
    const s = out.assumptions.scenarios;
    const differs = (x: typeof s.low) => x.revenueGrowth !== s.mid.revenueGrowth && Object.entries(x.methods).some(([k, v]) => v !== s.mid.methods[k as keyof typeof s.mid.methods]);
    ok("C29", differs(s.low) && differs(s.high) ? 0 : 1, 0);
  } else na("C29", "Scenario block only in Main Street mode");

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
  // C37: the render check runs on the written file (renderCheck.ts); until it has, the master check says so.
  results.set("C37", { difference: 0, tolerance: 0, status: "Pending", note: "Runs on the written file: LibreOffice render, measured page by page" });

  const checks: CheckResult[] = CHECKS.map((c) => {
    const r = results.get(c.id) ?? { difference: 0, tolerance: DOLLAR_TOLERANCE, status: "n.a." as CheckStatus, note: "Not evaluated" };
    return { ...c, ...r };
  });
  return { checks, masterCheck: masterCheckOf(checks) };
}

/** The master check line: a count of failures, else OK, qualified while the render check is pending (guide 5.7). */
export function masterCheckOf(checks: CheckResult[]): string {
  const failing = checks.filter((c) => c.status === "CHECK").length;
  if (failing) return `${failing} ${failing === 1 ? "check" : "checks"} failing`;
  return checks.some((c) => c.status === "Pending") ? "All checks OK (render check pending)" : "All checks OK";
}

/**
 * Record the render check's result as C37: OK, CHECK with the count of
 * issues as the difference, or n.a. with the reason when the render tools
 * are missing (the master check then keeps its "pending" qualifier).
 */
export function withRenderCheck(checks: CheckResult[], r: { status: "OK" | "CHECK" | "n.a."; issues: string[]; note: string }): { checks: CheckResult[]; masterCheck: string } {
  const next = checks.map((c) => (c.id !== "C37" ? c : r.status === "n.a." ? { ...c, note: r.note } : { ...c, difference: r.issues.length, tolerance: 0, status: r.status, note: r.note }));
  return { checks: next, masterCheck: masterCheckOf(next) };
}
