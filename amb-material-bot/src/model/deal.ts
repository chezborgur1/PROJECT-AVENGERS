// Valuation, financing, the deal structure column and the sensitivity grids
// (guide 5.5). Internal to AMB, never in the CIM (D5). The workbook writes
// these as formulas on Assumptions inputs; this is the engine's copy.

import type { Assumptions } from "./assumptions.ts";
import type { DealForm, DealMode } from "../domain/financials.ts";
import type { DealStructureColumn, FinancingCase, Ladder, MainStreetValuationCase, PeriodColumn, PnlLines, SellerProceeds, SensitivityGrid, SourcesAndUses, ValuationDetail, ValuationSummary } from "./types.ts";
import { FMT } from "./styles.ts";

/** Excel's PMT: the periodic payment on `pv`, negative for a positive principal. */
export function pmt(rate: number, nper: number, pv: number): number {
  if (nper === 0) return 0;
  if (rate === 0) return -pv / nper;
  return -(pv * rate) / (1 - (1 + rate) ** -nper);
}

export const annualDebtService = (rate: number, termYears: number, principal: number): number => -pmt(rate / 12, termYears * 12, principal) * 12;

/**
 * Excel's ROUND: half away from zero, on the value as Excel holds it (15
 * significant digits), so 1,484,394.9999999998 rounds like 1,484,395. The
 * verifier's ROUND uses the same function, so engine and workbook agree at
 * the half.
 */
export const roundTo = (v: number, digits: number): number => {
  const scaled = Number((digits >= 0 ? v * 10 ** digits : v / 10 ** -digits).toPrecision(15));
  const r = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return digits >= 0 ? r / 10 ** digits : r * 10 ** -digits;
};

export interface ValuationInputs {
  a: Assumptions;
  mode: DealMode;
  dealForm: DealForm;
  period: PeriodColumn;
  pnl: PnlLines;
  ladder: Ladder;
  fundedDebt: number;
  debtLike: number;
  cash: number;
  /** Month of the balance sheet the bridge reads (debt, debt-like items and cash); absent when the sources have none. */
  bsAsOf?: string;
  nwcVsPeg: number;
  /** Twelve months of payroll for the reconciliation holdback. */
  payroll: number;
  /** The seller-retained working capital memo on an asset purchase. */
  sellerRetainedNwc: number;
  /** Fixed assets (net) and inventory on the latest balance sheet, the tangible classes of the Form 8594 allocation. */
  assetsAtClose?: { equipment: number; inventory: number };
  /** Main Street mode: each case's pro forma ladder from the scenario block, so Low, Mid and High differ on earnings, not only on the multiple. */
  scenarioLadders?: Record<"low" | "mid" | "high", Ladder>;
}

function financing(a: Assumptions, purchasePrice: number, cashFlowAvailable: number): FinancingCase {
  const equityInjection = purchasePrice * a.deal.equityInjectionPct;
  const loanPrincipal = Math.max(0, purchasePrice - equityInjection);
  const ads = annualDebtService(a.deal.loanRate, a.deal.loanTermYears, loanPrincipal);
  return {
    purchasePrice,
    equityInjection,
    loanPrincipal,
    termYears: a.deal.loanTermYears,
    rate: a.deal.loanRate,
    annualDebtService: ads,
    cashFlowAvailable,
    dscr: ads ? cashFlowAvailable / ads : 0,
  };
}

/** Cash flow available for debt service: SDE less replacement compensation and the reserve (Main Street), else PF Adj. EBITDA less maintenance capex. */
function cashFlowAvailable(a: Assumptions, mode: DealMode, ladder: Ladder): number {
  return mode === "mainStreet" ? ladder.sde + ladder.marketReplacement + ladder.capitalReserve : ladder.pfAdjEbitda - a.recast.capitalReserve;
}

/** Earnings the valuation capitalises: SDE in Main Street mode, Adj. EBITDA otherwise. */
export function earningsBasis(mode: DealMode, ladder: Ladder): number {
  return mode === "mainStreet" ? ladder.sde : ladder.adjEbitda;
}

export function valuationDetail(inp: ValuationInputs): { detail: ValuationDetail; summary: ValuationSummary } {
  const { a, mode, ladder, pnl } = inp;
  const multiples = mode === "mainStreet" ? a.sdeMultiples : a.ebitdaMultiples;
  const caseFor = (multiple: number, caseLadder: Ladder): MainStreetValuationCase => {
    const earnings = earningsBasis(mode, caseLadder);
    const cfa = cashFlowAvailable(a, mode, caseLadder);
    const businessValuation = earnings * multiple;
    const totalInvestment = roundTo(businessValuation + a.deal.deferredCapex, -1);
    return {
      sde: earnings,
      multiple,
      businessValuation,
      deferredCapex: a.deal.deferredCapex,
      totalInvestment,
      impliedSdeMultiple: ladder.sde ? totalInvestment / ladder.sde : 0,
      impliedAdjEbitdaMultiple: ladder.adjEbitda ? totalInvestment / ladder.adjEbitda : 0,
      financing: financing(a, totalInvestment, cfa),
    };
  };
  const sl = inp.scenarioLadders;
  const cases = { low: caseFor(multiples[0], sl?.low ?? ladder), mid: caseFor(multiples[1], sl?.mid ?? ladder), high: caseFor(multiples[2], sl?.high ?? ladder) };
  const implied = (c: MainStreetValuationCase) => ({
    reportedEbitda: ladder.reportedEbitda ? c.totalInvestment / ladder.reportedEbitda : 0,
    adjEbitda: ladder.adjEbitda ? c.totalInvestment / ladder.adjEbitda : 0,
    pfAdjEbitda: ladder.pfAdjEbitda ? c.totalInvestment / ladder.pfAdjEbitda : 0,
    sde: ladder.sde ? c.totalInvestment / ladder.sde : 0,
    revenue: pnl.revenue ? c.totalInvestment / pnl.revenue : 0,
  });
  const detail: ValuationDetail = {
    period: inp.period,
    basis: { revenue: pnl.revenue, reportedEbitda: ladder.reportedEbitda, adjEbitda: ladder.adjEbitda, pfAdjEbitda: ladder.pfAdjEbitda, sde: ladder.sde },
    cases,
    impliedMultiples: { low: implied(cases.low), mid: implied(cases.mid), high: implied(cases.high) },
  };
  // EV-to-equity bridge. On an asset purchase the seller keeps cash and settles liens from proceeds; debt-like items stay with the seller.
  const asset = inp.dealForm === "asset_purchase";
  const bridge = { fundedDebt: inp.fundedDebt, debtLike: asset ? 0 : inp.debtLike, cash: asset ? 0 : inp.cash, nwcVsPeg: asset ? 0 : inp.nwcVsPeg, ...(inp.bsAsOf ? { asOf: inp.bsAsOf } : {}) };
  const equity = (ev: number) => ev - bridge.fundedDebt - bridge.debtLike + bridge.cash + bridge.nwcVsPeg;
  const summary: ValuationSummary = {
    method: mode === "mainStreet" ? "sde_multiple" : "adj_ebitda_multiple",
    multiples: { low: multiples[0], mid: multiples[1], high: multiples[2], source: a.multiplesSource },
    enterpriseValue: { low: cases.low.totalInvestment, mid: cases.mid.totalInvestment, high: cases.high.totalInvestment },
    equityValue: { low: equity(cases.low.totalInvestment), mid: equity(cases.mid.totalInvestment), high: equity(cases.high.totalInvestment) },
    bridge,
  };
  return { detail, summary };
}

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The one structure column the bot builds by default (guide 5.5 "Traditional": cash plus a seller note). */
export function dealStructure(inp: ValuationInputs, detail: ValuationDetail): DealStructureColumn {
  const { a, mode, dealForm } = inp;
  const d = a.deal;
  const asset = dealForm === "asset_purchase";
  const purchasePrice = detail.cases.mid.totalInvestment;
  const cashAtClose = purchasePrice * d.cashAtClosePct;
  const sellerNote = purchasePrice * d.sellerNotePct;
  const escrow = cashAtClose * d.escrowPct;
  const reconciliationHoldback = asset ? (inp.payroll / 12) * d.reconciliationHoldbackMonths : 0;
  // The holdback is paid out of the purchase price into escrow (the proceeds below deduct it), so it is a memo inside the price, not a use of its own.
  const uses = { purchasePrice, transactionFees: d.transactionFees, workingCapitalFunding: 0, reconciliationHoldback, total: 0 };
  uses.total = uses.purchasePrice + uses.transactionFees + uses.workingCapitalFunding;
  const buyerEquity = uses.total * d.equityInjectionPct;
  const sources = { seniorLoan: uses.total - sellerNote - buyerEquity, sellerNote, rolloverEquity: 0, buyerEquity, total: 0 };
  sources.total = sources.seniorLoan + sources.sellerNote + sources.rolloverEquity + sources.buyerEquity;
  const sourcesAndUses: SourcesAndUses = { uses, sources, check: sources.total - uses.total };

  const debtPaidAtClose = inp.fundedDebt;
  const debtLikeItems = asset ? 0 : inp.debtLike;
  const nwcVsPeg = asset ? 0 : inp.nwcVsPeg;
  const transactionExpenses = 0;
  const closingCash = purchasePrice - debtPaidAtClose - debtLikeItems + nwcVsPeg - reconciliationHoldback - transactionExpenses - escrow - sellerNote;
  const proceeds: SellerProceeds = {
    purchasePrice,
    debtPaidAtClose,
    debtLikeItems,
    nwcVsPeg,
    reconciliationHoldback,
    transactionExpenses,
    indemnityEscrow: escrow,
    sellerNoteDeferred: sellerNote,
    closingCash,
    holdbackReleased: reconciliationHoldback,
    escrowReleased: escrow,
    sellerNotePrincipal: sellerNote,
    totalConsideration: closingCash + reconciliationHoldback + escrow + sellerNote,
    sellerRetainedNwc: asset ? inp.sellerRetainedNwc : 0,
    sellerRetainedCash: asset ? inp.cash : 0,
  };

  const seniorService = annualDebtService(d.loanRate, d.loanTermYears, sources.seniorLoan);
  // The seller note pays quarterly; year-one service is four quarterly payments of its level amortisation.
  const noteQuarters = d.sellerNoteTermMonths / 3;
  const noteService = noteQuarters ? -pmt(d.sellerNoteRate / 4, noteQuarters, sellerNote) * Math.min(4, noteQuarters) : 0;
  // The structure prices at the Mid case, so it services debt from the Mid case's cash flow.
  const cashFlowAvailable = detail.cases.mid.financing.cashFlowAvailable;
  const totalService = seniorService + noteService;

  const basisLabel = mode === "mainStreet" ? "SDE" : "Adj. EBITDA";
  const terms: Record<string, string> = {
    "Total Valuation": `${usd(purchasePrice)} (${a.sdeMultiples[1].toFixed(1)}x ${basisLabel})`,
    "Cash at Close": `${usd(cashAtClose)} (${pct(d.cashAtClosePct)} of valuation)`,
    "Seller Note": `${usd(sellerNote)}, ${d.sellerNoteTermMonths}-month term, quarterly payments, ${(d.sellerNoteRate * 100).toFixed(1)}% interest (${pct(d.sellerNotePct)} of valuation)`,
    "Seller Note Contingencies": "None",
    "Earnout (if applicable)": "None",
    Escrow: `An escrow of ${pct(d.escrowPct)} of the cash consideration (${usd(escrow)}) will be funded at closing and held for ${d.escrowMonths} months.`,
    "Retention Holdback": "None",
    "Balance Sheet": asset
      ? "Assets purchased free and clear; the Seller retains cash, receivables and payables"
      : "Cash-free, debt-free, with a normalized level of working capital delivered at close",
    "Working Capital": asset
      ? `${d.reconciliationHoldbackMonths === 1 ? "One month" : `${d.reconciliationHoldbackMonths} months`} of payroll as reconciliation holdback`
      : "Post-closing true-up against the trailing-twelve-month average of adjusted net working capital",
    "Asset vs. Stock Sale": asset ? "Asset sale" : "Stock sale",
    "Target Timing": "[Confirm: LOI date, signing and effective closing date]",
  };
  // Form 8594: tangible classes at book value until an appraisal or agreed schedule replaces them; goodwill takes the residual.
  let allocation: DealStructureColumn["allocation"];
  if (asset) {
    const leased = d.premisesArrangement === "Leased from third party";
    const land = leased ? 0 : null;
    const building = leased ? 0 : null;
    const equipment = inp.assetsAtClose?.equipment ?? 0;
    const inventory = inp.assetsAtClose?.inventory ?? 0;
    const nonCompete = 0;
    allocation = { land, building, equipment, inventory, nonCompete, goodwill: purchasePrice - (land ?? 0) - (building ?? 0) - equipment - inventory - nonCompete };
  }
  if (mode !== "mainStreet") terms["Total Valuation"] = `${usd(purchasePrice)} (${a.ebitdaMultiples[1].toFixed(1)}x ${basisLabel})`;

  return {
    name: "Structure 1",
    preset: d.structurePreset,
    purchasePrice,
    cashAtClosePct: d.cashAtClosePct,
    cashAtClose,
    sellerNotePct: d.sellerNotePct,
    sellerNote,
    sellerNoteTermMonths: d.sellerNoteTermMonths,
    sellerNoteRate: d.sellerNoteRate,
    escrowPct: d.escrowPct,
    escrow,
    escrowMonths: d.escrowMonths,
    retentionHoldback: 0,
    reconciliationHoldback,
    sourcesAndUses,
    proceeds,
    debtService: { seniorLoan: seniorService, sellerNote: noteService, total: totalService, cashFlowAvailable, dscr: totalService ? cashFlowAvailable / totalService : 0 },
    terms,
    allocation,
  };
}

/** Axis of 9 (columns) or 7 (rows) values centred on the base case. */
const axis = (mid: number, step: number, n: number): number[] => Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * step);

/** The standard grid set (guide 5.5), 9 columns by 7 rows, base case at the centre. Bodies are unrounded dollars; the workbook rounds the $ grids at $000s. */
export function sensitivityGrids(inp: ValuationInputs, detail: ValuationDetail, deal: DealStructureColumn): SensitivityGrid[] {
  const { a, mode } = inp;
  const s = a.sensitivity;
  const mid = detail.cases.mid;
  const earningsLabel = mode === "mainStreet" ? "SDE" : "Adj. EBITDA";
  const valueLabel = mode === "mainStreet" ? "Business Valuation" : "Enterprise Value";
  const multiples = axis(mid.multiple, s.multipleStep, 9);
  const earnings = axis(mid.sde, mid.sde * s.earningsStepPct, 7);
  const prices = axis(deal.purchasePrice, deal.purchasePrice * s.priceStepPct, 7);
  const rates = axis(a.deal.loanRate, s.rateStep, 9);
  const cashPcts = axis(a.deal.cashAtClosePct, s.cashPctStep, 9);
  const cfa = mid.financing.cashFlowAvailable;
  const p = deal.proceeds;

  return [
    {
      key: "valuation",
      title: `${valueLabel} Based on ${earningsLabel} Multiple & ${earningsLabel}`,
      // A step finer than 0.1x prints at two decimals, so 2.25x never reads as 2.3x over a body of 2.25 × earnings.
      colAxis: { label: `${earningsLabel} Multiple (x)`, values: multiples, fmt: Number.isInteger(Math.round(s.multipleStep * 1e6) / 1e5) ? FMT.multiple : FMT.multiple2 },
      rowAxis: { label: `${earningsLabel} ($000s)`, values: earnings, fmt: FMT.currency },
      body: earnings.map((e) => multiples.map((m) => e * m)),
      base: mid.businessValuation,
      bodyFmt: FMT.body,
      note: `${valueLabel} = ${earningsLabel} × multiple, before deferred capex; the centre cell equals the Valuation tab's Mid case.`,
    },
    {
      key: "dscr",
      title: "DSCR Based on Purchase Price & Interest Rate",
      colAxis: { label: "Interest Rate (%)", values: rates, fmt: FMT.rate },
      rowAxis: { label: "Purchase Price ($000s)", values: prices, fmt: FMT.currency },
      body: prices.map((price) => rates.map((r) => {
        const service = annualDebtService(r, a.deal.loanTermYears, Math.max(0, price * (1 - a.deal.equityInjectionPct)));
        return service ? cfa / service : 0;
      })),
      base: mid.financing.dscr,
      bodyFmt: FMT.multiple2,
      note: `DSCR = cash flow available for debt service ÷ annual debt service on ${pct(1 - a.deal.equityInjectionPct)} of the price over ${a.deal.loanTermYears} years.`,
      hurdle: s.dscrHurdle,
    },
    {
      key: "closingCash",
      title: "Closing Cash to Seller Based on Purchase Price & Cash at Close %",
      colAxis: { label: "Cash at Close (% of price)", values: cashPcts, fmt: FMT.pct },
      rowAxis: { label: "Purchase Price ($000s)", values: prices, fmt: FMT.currency },
      body: prices.map((price) => cashPcts.map((c) => price * c * (1 - a.deal.escrowPct) - p.debtPaidAtClose - p.debtLikeItems + p.nwcVsPeg - p.reconciliationHoldback - p.transactionExpenses)),
      base: p.closingCash,
      bodyFmt: FMT.body,
      note: "Closing cash = cash at close less the indemnity escrow, liens paid at close and the reconciliation holdback; the balance of the price is the seller note.",
    },
  ];
}
