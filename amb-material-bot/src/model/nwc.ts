// Net working capital, debt-like items and the historical indirect cash flow
// (guide 5.6, DATA_CONTRACT §5.11). Every line here is a link or a simple
// difference in the workbook; the engine computes the same numbers so the
// verifier can compare them.

import { BS_DETAIL_LINES, addMonths, monthRange, type BalanceSheetPeriod, type BsDetailLine, type DealForm, type FinancialDataset, type MonthKey } from "../domain/financials.ts";
import { DEBT_LIKE_LINES } from "../domain/chartOfAccounts.ts";
import type { BalanceSheetValues } from "./engine.ts";
import type { DebtLikeSummary, HistoricalCashFlowYear, NwcAnalysis, NwcLines, PnlLines } from "./types.ts";

export interface NwcContext {
  ds: FinancialDataset;
  dealForm: DealForm;
  /** Revenue and COGS of the twelve months ending at a month (or the fiscal year when that is all the data has), for the ratios. */
  trailingAt: (month: MonthKey) => { revenue: number; cogs: number } | undefined;
  /** Deferred revenue and customer deposits moved out of NWC and deducted as debt-like (guide 5.6 override). */
  deferredAsDebtLike: boolean;
}

/** The 5.6 lines of one balance sheet. Detail lines the source lacks count as zero and are flagged in `available`. */
export function nwcLines(p: BalanceSheetPeriod, trailing: { revenue: number; cogs: number } | undefined, deferredAsDebtLike = false): { lines: NwcLines; available: Record<BsDetailLine, boolean> } {
  const d = p.detail ?? {};
  const v = p.values;
  const available = Object.fromEntries(BS_DETAIL_LINES.map((l) => [l, d[l] !== undefined])) as Record<BsDetailLine, boolean>;
  const unbilled = d.unbilled ?? 0;
  const deferredRevenue = d.deferred_revenue ?? 0;
  const customerDeposits = d.customer_deposits ?? 0;
  // Accrued liabilities are whatever else sits in the other-current-liabilities category (DATA_CONTRACT §5.11).
  const accrued = d.accrued_liabilities ?? v.other_current_liabilities - deferredRevenue - customerDeposits;
  const otherOcl = v.other_current_liabilities - accrued - deferredRevenue - customerDeposits;
  const ar = v.accounts_receivable;
  const inventory = v.inventory;
  const prepaidOther = v.other_current_assets - unbilled;
  const totalCurrentAssetsExCash = ar + unbilled + inventory + prepaidOther;
  const ap = v.accounts_payable;
  const totalCurrentLiabExDebt = ap + accrued + deferredRevenue + customerDeposits + otherOcl;
  const reportedNwc = totalCurrentAssetsExCash - totalCurrentLiabExDebt;
  // Balances a buyer settles outside working capital: liabilities removed (NWC rises), a related-party receivable removed (NWC falls).
  // Under the debt-like override, customer money leaves NWC here and is deducted on Debt-Like Items instead, never both (C19).
  // The liabilities removed are the DEBT_LIKE_LINES the debt-like schedule deducts, so a balance is never in both (C19).
  const debtLike = [...DEBT_LIKE_LINES].reduce((s, l) => s + (d[l] ?? 0), 0);
  const adjustments = debtLike - (d.related_party_receivable ?? 0) + (deferredAsDebtLike ? deferredRevenue + customerDeposits : 0);
  const adjustedNwc = reportedNwc + adjustments;
  const rev = trailing?.revenue ?? 0;
  const cogs = trailing?.cogs ?? 0;
  return {
    lines: {
      ar,
      unbilled,
      inventory,
      prepaidOther,
      totalCurrentAssetsExCash,
      ap,
      accrued: accrued + otherOcl,
      deferredRevenue,
      customerDeposits,
      totalCurrentLiabExDebt,
      reportedNwc,
      adjustments,
      adjustedNwc,
      pctLtmRevenue: rev ? adjustedNwc / rev : 0,
      deferredRevenuePctRevenue: rev ? deferredRevenue / rev : 0,
      dso: rev ? (ar / rev) * 365 : 0,
      dio: cogs ? (inventory / cogs) * 365 : 0,
      dpo: cogs ? (ap / cogs) * 365 : 0,
    },
    available,
  };
}

/** Peg basis from the dates the balance sheets carry (guide 5.6, check C20). */
export function pegBasis(periods: BalanceSheetPeriod[]): NwcAnalysis["pegBasis"] {
  const keys = periods.map((p) => p.period.key);
  const last12 = keys.slice(-12);
  if (last12.length === 12 && monthRange(last12[0]!, last12[11]!).length === 12) return "T12M average";
  const last4 = keys.slice(-4);
  if (last4.length === 4 && last4.every((k, i) => i === 0 || addMonths(last4[i - 1]!, 3) === k)) return "T4Q average";
  return "n.a.";
}

export function nwcAnalysis(ctx: NwcContext): NwcAnalysis | undefined {
  const periods = ctx.ds.balanceSheets;
  if (!periods?.length) return undefined;
  const rows = periods.map((p) => {
    const { lines, available } = nwcLines(p, ctx.trailingAt(p.period.key), ctx.deferredAsDebtLike);
    return { asOf: p.asOf, month: p.period.key, lines, available, detail: p.detail ?? {} };
  });
  const basis = pegBasis(periods);
  const n = basis === "T12M average" ? 12 : basis === "T4Q average" ? 4 : 0;
  const peg = n ? rows.slice(-n).reduce((s, r) => s + r.lines.adjustedNwc, 0) / n : null;
  const latestRow = rows[rows.length - 1]!;
  const latest = latestRow.lines.adjustedNwc;
  const out: NwcAnalysis = {
    periods: rows.map(({ asOf, month, lines, detail }) => ({ asOf, month, lines, detail })),
    pegBasis: basis,
    peg,
    latest,
    latestVsPeg: peg === null ? null : latest - peg,
    deferredRevenueTreatment: ctx.deferredAsDebtLike ? "debt_like" : "nwc",
    available: latestRow.available,
  };
  if (ctx.dealForm === "asset_purchase") {
    out.transfers = {
      ar: "retained_by_seller",
      unbilled: "retained_by_seller",
      inventory: "transfers",
      prepaidOther: "retained_by_seller",
      ap: "retained_by_seller",
      accrued: "retained_by_seller",
      deferredRevenue: "assumed_only_if_listed",
      customerDeposits: "transfers",
    };
    const l = latestRow.lines;
    out.transferringNwc = l.inventory - l.customerDeposits;
    out.sellerRetainedNwc = l.ar + l.unbilled + l.prepaidOther - l.ap - l.accrued;
  }
  return out;
}

/** Credit card balances: funded debt, but unsecured, so they are paid at close apart from the liens. The workbook matches "*redit card*". */
export const isCreditCard = (item: string): boolean => /credit card/i.test(item);

/** Deferred revenue and customer deposits, the balances DeferredRevenueTreatment moves between NWC and debt-like. */
export const isCustomerMoney = (item: string): boolean => /deferred revenue|customer deposit/i.test(item);

/**
 * The guide 5.6 standard debt-like list. An item a source balance already
 * covers (by its name) is not repeated; every other one is listed as Open, so
 * diligence sees what has not been cleared. Personal guarantees are a memo.
 */
const STANDARD_DEBT_LIKE: { item: string; match: RegExp; memo?: boolean }[] = [
  { item: "Funded bank debt", match: /bank|term loan|note payable|\bsba\b/i },
  { item: "Lines of credit and revolvers", match: /line of credit|revolv/i },
  { item: "Credit-card balances", match: /credit card/i },
  { item: "SBA loans", match: /\bsba\b/i },
  { item: "PPP or EIDL balances", match: /\bppp\b|\beidl\b/i },
  { item: "Vehicle and equipment loans", match: /vehicle|equipment|truck/i },
  { item: "Capital leases", match: /capital lease|finance lease/i },
  { item: "Shareholder loans", match: /shareholder|officer loan|owner loan|due to (owner|member)/i },
  { item: "Accrued interest", match: /accrued interest|interest payable/i },
  // Accrued wages ("Accrued payroll") are working capital and do not answer this item: only a bonus or payroll-tax balance does (verification F13).
  { item: "Unpaid bonuses and payroll taxes", match: /bonus|payroll tax/i },
  { item: "Accrued income taxes", match: /income tax/i },
  { item: "Tax liens", match: /lien/i },
  { item: "Deferred capex", match: /deferred (capex|maintenance)/i },
  { item: "Aged payables over 90 days", match: /aged payable|over 90/i },
  { item: "Related-party payables", match: /related.part|affiliate/i },
  { item: "Known litigation", match: /litigation|lawsuit/i },
  { item: "Personal guarantees", match: /guarantee/i, memo: true },
];

export function debtLikeSummary(ds: FinancialDataset, latestBs: { values: BalanceSheetValues; asOf: string } | undefined, deferredAsDebtLike = false): DebtLikeSummary | undefined {
  if (!latestBs) return undefined;
  const items = ds.debtLikeItems?.length
    ? ds.debtLikeItems.map((i) => ({ item: i.item, balance: i.balance, treatment: deferredAsDebtLike && i.treatment === "nwc" && isCustomerMoney(i.item) ? ("debt_like" as const) : i.treatment, status: i.status, payoffLetter: i.payoffLetter, note: i.note, accounts: i.accounts }))
    : [{ item: "Debt per balance sheet (accounts not itemised)", balance: latestBs.values.debt, treatment: "debt" as const, status: "estimated", note: "Itemise from the loan statements", accounts: [] as string[] }];
  const sum = (t: DebtLikeSummary["items"][number]["treatment"]) => items.filter((i) => i.treatment === t).reduce((s, i) => s + i.balance, 0);
  const checklist = STANDARD_DEBT_LIKE.filter((x) => !items.some((i) => x.match.test(i.item))).map((x) => ({ item: x.item, memo: !!x.memo }));
  return { items, fundedDebt: sum("debt"), debtLike: sum("debt_like"), inNwc: sum("nwc"), asOf: latestBs.asOf, checklist };
}

/** Indirect cash flow between consecutive year-end balance sheets, with capex and distributions derived (guide 5.1 row 18). */
export function historicalCashFlow(years: number[], pnl: (fy: number) => PnlLines | undefined, bs: (fy: number) => BalanceSheetValues | undefined): HistoricalCashFlowYear[] {
  const out: HistoricalCashFlowYear[] = [];
  for (const fy of years) {
    const p = pnl(fy);
    const cur = bs(fy);
    const prev = bs(fy - 1);
    if (!p || !cur || !prev) continue;
    const dAr = -(cur.ar - prev.ar);
    const dInv = -(cur.inventory - prev.inventory);
    const dOca = -(cur.oca - prev.oca);
    const dAp = cur.ap - prev.ap;
    const dOcl = cur.ocl - prev.ocl;
    const cfo = p.netIncome + p.da + dAr + dInv + dOca + dAp + dOcl;
    const capex = -(cur.fixedAssets - prev.fixedAssets + p.da) - (cur.otherAssets - prev.otherAssets);
    const cfi = capex;
    const dDebt = cur.debt - prev.debt;
    const distributions = -(prev.equity + p.netIncome - cur.equity);
    const cff = dDebt + distributions;
    const netChange = cfo + cfi + cff;
    const freeCashFlow = cfo + capex;
    out.push({
      fiscalYear: fy,
      netIncome: p.netIncome,
      da: p.da,
      dAr,
      dInv,
      dOca,
      dAp,
      dOcl,
      cfo,
      capex,
      cfi,
      dDebt,
      distributions,
      cff,
      netChange,
      beginCash: prev.cash,
      endCash: prev.cash + netChange,
      bsCash: cur.cash,
      freeCashFlow,
      cashConversion: p.ebitda ? freeCashFlow / p.ebitda : 0,
    });
  }
  return out;
}
