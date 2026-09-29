// Balance Sheet, NWC, Debt-Like Items, Cash Flow and Proof of Cash (guide
// 5.1 rows 15-19, 5.6). Balance-sheet columns are point in time; NWC links
// to them line by line; the cash flow is the indirect difference between
// consecutive year-ends; the proof of cash sets monthly revenue against the
// operating deposits on the raw bank tab.

import { BS_DETAIL_LINES, addMonths, monthRange, type BsCategory, type BsDetailLine, type FinancialDataset, type MonthKey } from "../../domain/financials.ts";
import { bsDetailLine } from "../../domain/chartOfAccounts.ts";
import { fiscalYearEndKey } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { COLOR, FMT, WIDTH } from "../styles.ts";
import type { ModelOutput, NwcLines } from "../types.ts";
import { isCreditCard, isCustomerMoney } from "../nwc.ts";
import { A, type TabContext } from "./assumptionsTab.ts";
import { DATABOOK_COL, MONTH_START, monthOffset } from "./data.ts";
import { ASOF, gridMonths, S, SHEET, serialOfMonthEnd, serialOfMonthStart } from "./layout.ts";

const K = 1000;

/** Statement dates the Databook's balance-sheet block carries, ascending. */
export function bsDates(model: ModelOutput): MonthKey[] {
  return [...new Set((model.databook?.bs ?? []).flatMap((r) => Object.keys(r.byMonth)))].sort();
}

/** Column of statement date `m` on the Balance Sheet tab; a date the tab lacks is a planning bug, never column B. */
export function bsColumn(dates: MonthKey[], m: MonthKey): number {
  const i = dates.indexOf(m);
  if (i < 0) throw new Error(`The Balance Sheet tab has no column for ${m}`);
  return 3 + i;
}

/** Databook balance-sheet accounts the data layer classes into a detail line (the rule merge.ts applies line by line). */
export function detailAccounts(model: ModelOutput, d: BsDetailLine): string[] {
  return (model.databook?.bs ?? []).filter((r) => bsDetailLine(r.account, r.section ?? "", r.category) === d).map((r) => r.account);
}

/** Category totals per statement date from the Databook rows (dollars). */
function bsTotals(model: ModelOutput): Record<MonthKey, Record<BsCategory, number>> {
  const out: Record<MonthKey, Record<BsCategory, number>> = {};
  for (const r of model.databook?.bs ?? []) {
    for (const [m, v] of Object.entries(r.byMonth)) {
      out[m] ??= { cash: 0, accounts_receivable: 0, inventory: 0, other_current_assets: 0, fixed_assets_net: 0, other_assets: 0, accounts_payable: 0, other_current_liabilities: 0, debt: 0, equity: 0 };
      out[m]![r.category] += v;
    }
  }
  return out;
}

const BS_ROWS: { key: string; label: string; category?: BsCategory; kind: "lineFirst" | "line" | "subtotal" | "keyTotal" | "check"; calc?: (at: (k: string) => string) => string; value?: (v: Record<BsCategory, number>) => number }[] = [
  { key: "cash", label: "Cash and Equivalents", category: "cash", kind: "lineFirst" },
  { key: "ar", label: "Accounts Receivable", category: "accounts_receivable", kind: "line" },
  { key: "inventory", label: "Inventory", category: "inventory", kind: "line" },
  { key: "oca", label: "Prepaid and Other Current Assets", category: "other_current_assets", kind: "line" },
  { key: "tca", label: "Total Current Assets", kind: "subtotal", calc: (at) => `SUM(${at("cash")}:${at("oca")})`, value: (v) => v.cash + v.accounts_receivable + v.inventory + v.other_current_assets },
  { key: "fixed", label: "Fixed Assets, Net", category: "fixed_assets_net", kind: "line" },
  { key: "other_assets", label: "Other Long-Term Assets", category: "other_assets", kind: "line" },
  { key: "total_assets", label: "Total Assets", kind: "keyTotal", calc: (at) => `${at("tca")}+${at("fixed")}+${at("other_assets")}`, value: (v) => v.cash + v.accounts_receivable + v.inventory + v.other_current_assets + v.fixed_assets_net + v.other_assets },
  { key: "ap", label: "Accounts Payable", category: "accounts_payable", kind: "lineFirst" },
  { key: "ocl", label: "Accrued and Other Current Liabilities", category: "other_current_liabilities", kind: "line" },
  { key: "tcl", label: "Total Current Liabilities", kind: "subtotal", calc: (at) => `${at("ap")}+${at("ocl")}`, value: (v) => v.accounts_payable + v.other_current_liabilities },
  { key: "debt", label: "Debt (incl. credit cards and current portion)", category: "debt", kind: "line" },
  { key: "total_liabilities", label: "Total Liabilities", kind: "subtotal", calc: (at) => `${at("tcl")}+${at("debt")}`, value: (v) => v.accounts_payable + v.other_current_liabilities + v.debt },
  { key: "equity", label: "Total Equity", category: "equity", kind: "line" },
  { key: "total_le", label: "Total Liabilities and Equity", kind: "keyTotal", calc: (at) => `${at("total_liabilities")}+${at("equity")}`, value: (v) => v.accounts_payable + v.other_current_liabilities + v.debt + v.equity },
  { key: "check", label: "Check: Assets less Liabilities and Equity", kind: "check", calc: (at) => `${at("total_assets")}-${at("total_le")}`, value: (v) => v.cash + v.accounts_receivable + v.inventory + v.other_current_assets + v.fixed_assets_net + v.other_assets - (v.accounts_payable + v.other_current_liabilities + v.debt + v.equity) },
];

const DETAIL_LABELS: Record<BsDetailLine, string> = {
  unbilled: "Unbilled / WIP (in other current assets)",
  prepaid: "Prepaid expenses (in other current assets)",
  accrued_liabilities: "Accrued liabilities (in accrued and other)",
  deferred_revenue: "Deferred revenue (in accrued and other)",
  customer_deposits: "Customer deposits (in accrued and other)",
  credit_cards: "Credit-card balances (in debt)",
  current_portion_debt: "Current portion of debt (in debt)",
  related_party_balances: "Related-party payables (in accrued and other)",
  accrued_interest: "Accrued interest (in accrued and other)",
  income_tax_payable: "Income taxes payable (in accrued and other)",
  related_party_receivable: "Related-party receivables (in other current assets)",
};

export function planBalanceSheet(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const dates = bsDates(model);
  if (!dates.length) return undefined;
  const totals = bsTotals(model);
  const b = new SheetBuilder("bs", SHEET.bs);
  const n = dates.length;
  const lastValue = 3 + n - 1;
  const notesCol = lastValue + 2;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(3, lastValue, WIDTH.value);
  b.spacerCol(lastValue + 1);
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: "Balance Sheet ($000s)", lastCol: notesCol, toggleCol: lastValue, masterToggle: ctx.masterToggle });
  b.text(3, lastValue - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 3, to: lastValue, label: "At statement date" }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: lastValue }, [], "Balance Sheet");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const dbHeader = (i: number) => `${S("databook")}${colLetter(DATABOOK_COL.periodStart + i)}$${rowOf("databook", "bsHeader")}`;
  dates.forEach((m, i) => b.formula(6, 3 + i, `EOMONTH(${dbHeader(i)},0)`, { style: "header", fmt: FMT.date, role: "text", expect: serialOfMonthEnd(m), label: `bs date ${m}` }));
  const dbRange = (c: number) => `${S("databook")}$${colLetter(c)}$${rowOf("databook", "bsFirst")}:$${colLetter(c)}$${rowOf("databook", "bsLast")}`;
  let r = 8;
  for (const spec of BS_ROWS) b.row(spec.key, r++);
  r++;
  b.row("sec_detail", r++);
  for (const d of BS_DETAIL_LINES) b.row(`detail_${d}`, r++);
  const lastPrinted = r + 1;
  const spans: [number, number][] = [[3, lastValue]];
  for (const spec of BS_ROWS) {
    const rr = b.r(spec.key);
    switch (spec.kind) {
      case "subtotal":
        b.text(rr, 2, spec.label, { style: "subtotal" });
        b.subtotalBorder(rr, spans);
        break;
      case "keyTotal":
        b.text(rr, 2, spec.label, { style: "keyTotal" });
        b.keyTotalBox([rr, rr], spans);
        break;
      case "check":
        b.text(rr, 2, spec.label, { style: "check" });
        break;
      default:
        b.text(rr, 2, spec.label, { style: spec.kind });
    }
    const fmt = spec.kind === "check" ? FMT.check : spec.kind === "line" ? FMT.body : FMT.currency;
    dates.forEach((m, i) => {
      const c = 3 + i;
      const at = (k: string) => addr(b.r(k), c);
      const v = totals[m]!;
      const f = spec.category ? `SUMIFS(${dbRange(DATABOOK_COL.periodStart + i)},${dbRange(DATABOOK_COL.category)},"${spec.category}")/${K}` : spec.calc!(at);
      const expect = spec.category ? v[spec.category] / K : spec.value!(v) / K;
      b.formula(rr, c, f, { style: spec.kind, fmt, expect, tol: spec.kind === "check" ? 1e-6 : undefined, label: `${spec.key} ${m}` });
    });
    if (spec.kind === "check") b.checkCf(rr, 3, lastValue);
  }
  b.section(b.r("sec_detail"), "Detail within the categories above ($000s)", spans);
  const dbAccount = dbRange(DATABOOK_COL.account);
  for (const d of BS_DETAIL_LINES) {
    const rr = b.r(`detail_${d}`);
    b.text(rr, 2, DETAIL_LABELS[d], { style: "line" });
    // Each carve-out is the Databook accounts the data layer classes into the line (bsDetailLine), summed at the date.
    const accounts = detailAccounts(model, d);
    dates.forEach((m, i) => {
      const p = model.nwc?.periods.find((x) => x.month === m);
      const v = p?.detail?.[d];
      if (v === undefined || !accounts.length) b.na(rr, 3 + i, "n.a.", { style: "na" });
      else b.formula(rr, 3 + i, `(${accounts.map((a) => `SUMIFS(${dbRange(DATABOOK_COL.periodStart + i)},${dbAccount},"${a.replace(/"/g, '""')}")`).join("+")})/${K}`, { style: "line", fmt: FMT.body, expect: v / K, label: `detail ${d} ${m}` });
    });
  }
  b.note(lastPrinted, 2, "Note: categories are SUMIFS of the Databook balance-sheet accounts at each statement date. Detail lines sum the Databook accounts the data layer classes into each line and feed the NWC tab; a line the source does not carry prints n.a., never zero. The check row must equal zero.");
  b.print({ area: `B2:${addr(lastPrinted, notesCol)}`, landscape: n > 8, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

// --- NWC ----------------------------------------------------------------------------------------

/** NWC rows that carry dollars, and the engine field each reads (the peg, latest and vs-peg columns apply to these). */
const DOLLAR_FIELDS: Record<string, keyof NwcLines> = {
  ar: "ar",
  unbilled: "unbilled",
  inventory: "inventory",
  prepaidOther: "prepaidOther",
  tca: "totalCurrentAssetsExCash",
  ap: "ap",
  accrued: "accrued",
  deferredRevenue: "deferredRevenue",
  customerDeposits: "customerDeposits",
  tcl: "totalCurrentLiabExDebt",
  reportedNwc: "reportedNwc",
  adjustments: "adjustments",
  adjustedNwc: "adjustedNwc",
};

/** Rows that exist only when the source carves out the detail line; otherwise they print n.a. */
const DETAIL_OF: Record<string, BsDetailLine> = { unbilled: "unbilled", deferredRevenue: "deferred_revenue", customerDeposits: "customer_deposits" };

/** Column geometry of the NWC tab: one column per statement date, then Peg | Latest | Latest vs. Peg, then Transfers on an asset purchase. */
export function nwcLayout(model: ModelOutput): { n: number; pegCol: number; latestCol: number; vsCol: number; transfersCol?: number; notesCol: number } {
  const n = model.nwc?.periods.length ?? 0;
  const pegCol = 3 + n + 1;
  const vsCol = pegCol + 2;
  const transfersCol = model.dealForm === "asset_purchase" ? vsCol + 2 : undefined;
  return { n, pegCol, latestCol: pegCol + 1, vsCol, transfersCol, notesCol: (transfersCol ?? vsCol) + 2 };
}

export function planNwc(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const nwc = model.nwc;
  if (!nwc) return undefined;
  const dates = bsDates(model);
  const b = new SheetBuilder("nwc", SHEET.nwc);
  const { n, pegCol, latestCol, vsCol, transfersCol, notesCol } = nwcLayout(model);
  const asset = model.dealForm === "asset_purchase";
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(3, 3 + n - 1, WIDTH.value);
  b.spacerCol(3 + n);
  b.widths(pegCol, vsCol - 1, 11);
  b.width(vsCol, 13);
  b.spacerCol(vsCol + 1);
  if (transfersCol) {
    b.width(transfersCol, 20);
    b.spacerCol(transfersCol + 1);
  }
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: `Net Working Capital, ${asset ? "Asset Purchase" : "Equity Purchase"} ($000s)`, lastCol: notesCol, toggleCol: vsCol, masterToggle: ctx.masterToggle });
  b.text(3, vsCol - 1, "Print", { align: { horizontal: "right" } });
  const groups = [
    { from: 3, to: 3 + n - 1, label: "At statement date" },
    { from: pegCol, to: vsCol, label: "Peg" },
    ...(transfersCol ? [{ from: transfersCol, to: transfersCol, label: "Transfers" }] : []),
    { from: notesCol, to: notesCol, label: "Notes" },
  ];
  b.tier1(5, groups);
  b.tier2(6, { from: 3, to: vsCol }, [], "NWC");
  nwc.periods.forEach((p, i) => b.formula(6, 3 + i, `${S("bs")}${colLetter(bsColumn(dates, p.month))}6`, { style: "header", fmt: FMT.date, role: "text", expect: serialOfMonthEnd(p.month), label: `nwc date ${p.month}` }));
  b.cell(6, pegCol, { style: "header", v: `Peg (${nwc.pegBasis === "n.a." ? "n.a." : nwc.pegBasis === "T12M average" ? "T12M avg." : "T4Q avg."})`, role: "text" });
  b.cell(6, latestCol, { style: "header", v: "Latest", role: "text" });
  b.cell(6, vsCol, { style: "header", v: "Latest vs. Peg", role: "text" });
  if (transfersCol) b.cell(6, transfersCol, { style: "header", v: "Treatment", role: "text" });
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });

  type Row = { key: string; label: string; kind: "lineFirst" | "line" | "subtotal" | "keyTotal" | "ratio" | "check"; transfer?: string };
  const rows: Row[] = [
    { key: "ar", label: "Accounts Receivable", kind: "lineFirst", transfer: "Retained by Seller" },
    { key: "unbilled", label: "Unbilled / WIP", kind: "line", transfer: "Retained by Seller" },
    { key: "inventory", label: "Inventory", kind: "line", transfer: "Transfers" },
    { key: "prepaidOther", label: "Prepaid and Other Current Assets", kind: "line", transfer: "Retained by Seller" },
    { key: "tca", label: "Total Current Assets (ex. Cash)", kind: "subtotal" },
    { key: "ap", label: "Accounts Payable", kind: "lineFirst", transfer: "Retained by Seller" },
    { key: "accrued", label: "Accrued Liabilities", kind: "line", transfer: "Retained by Seller" },
    { key: "deferredRevenue", label: "Deferred Revenue", kind: "line", transfer: "Assumed only if listed" },
    { key: "customerDeposits", label: "Customer Deposits", kind: "line", transfer: "Transfers" },
    { key: "tcl", label: "Total Current Liabilities (ex. Debt)", kind: "subtotal" },
    { key: "reportedNwc", label: "Reported NWC", kind: "keyTotal" },
    { key: "adjustments", label: "(-) / (+) Adjustments", kind: "line" },
    { key: "adjustedNwc", label: "Adjusted NWC", kind: "keyTotal" },
    { key: "pctLtmRevenue", label: "% of LTM Revenue", kind: "ratio" },
    { key: "deferredRevenuePct", label: "Deferred Revenue % of LTM Revenue", kind: "ratio" },
    { key: "dso", label: "DSO (days)", kind: "ratio" },
    { key: "dio", label: "DIO (days)", kind: "ratio" },
    { key: "dpo", label: "DPO (days)", kind: "ratio" },
  ];
  let r = 8;
  for (const row of rows) b.row(row.key, r++);
  r++;
  b.row("ltmRevenue", r++);
  b.row("ltmCogs", r++);
  b.row("check", r++);
  if (asset) {
    r++;
    b.row("transferring", r++);
    b.row("sellerRetained", r++);
  }
  const lastPrinted = r + 1;
  const spans: [number, number][] = [[3, 3 + n - 1], [pegCol, vsCol]];
  const bsCol = (m: MonthKey) => colLetter(bsColumn(dates, m));
  const bsCell = (m: MonthKey, key: string) => `${S("bs")}${bsCol(m)}${rowOf("bs", key)}`;
  const detail = (m: MonthKey, d: BsDetailLine) => `${S("bs")}${bsCol(m)}${rowOf("bs", `detail_${d}`)}`;
  const num = (ref: string) => `IF(ISNUMBER(${ref}),${ref},0)`;
  const monthly = model.granularity === "monthly";
  const months = gridMonths(model);
  const monthlyRow = (key: string) => `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", key)}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", key)}`;
  const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;

  for (const row of rows) {
    const rr = b.r(row.key);
    const style = row.kind === "ratio" ? "ratio" : row.kind;
    b.text(rr, 2, row.label, { style, align: row.kind === "ratio" ? { horizontal: "left", indent: 1 } : undefined });
    if (row.kind === "subtotal") b.subtotalBorder(rr, spans);
    if (row.kind === "keyTotal") b.keyTotalBox([rr, rr], spans);
    nwc.periods.forEach((p, i) => {
      const c = 3 + i;
      const m = p.month;
      const at = (k: string) => addr(b.r(k), c);
      const l = p.lines;
      const avail = (d: BsDetailLine) => p.detail?.[d] !== undefined;
      const t = (month: MonthKey) => trailing(model, month);
      let f: string | undefined;
      let expect: number | string = 0;
      let fmt: string = row.kind === "lineFirst" || row.kind === "subtotal" || row.kind === "keyTotal" ? FMT.currency : FMT.body;
      switch (row.key) {
        case "ar":
          f = bsCell(m, "ar");
          expect = l.ar / K;
          break;
        case "unbilled":
          if (!avail("unbilled")) {
            b.na(rr, c, "n.a.", { style: "line" });
            return;
          }
          f = detail(m, "unbilled");
          expect = l.unbilled / K;
          break;
        case "inventory":
          f = bsCell(m, "inventory");
          expect = l.inventory / K;
          break;
        case "prepaidOther":
          f = `${bsCell(m, "oca")}-${num(detail(m, "unbilled"))}`;
          expect = l.prepaidOther / K;
          break;
        case "tca":
          f = `SUM(${at("ar")}:${at("prepaidOther")})`;
          expect = l.totalCurrentAssetsExCash / K;
          break;
        case "ap":
          f = bsCell(m, "ap");
          expect = l.ap / K;
          break;
        case "accrued":
          f = `${bsCell(m, "ocl")}-${num(detail(m, "deferred_revenue"))}-${num(detail(m, "customer_deposits"))}`;
          expect = l.accrued / K;
          break;
        case "deferredRevenue":
          if (!avail("deferred_revenue")) {
            b.na(rr, c, "n.a.", { style: "line" });
            return;
          }
          f = detail(m, "deferred_revenue");
          expect = l.deferredRevenue / K;
          break;
        case "customerDeposits":
          if (!avail("customer_deposits")) {
            b.na(rr, c, "n.a.", { style: "line" });
            return;
          }
          f = detail(m, "customer_deposits");
          expect = l.customerDeposits / K;
          break;
        case "tcl":
          f = `SUM(${at("ap")}:${at("customerDeposits")})`;
          expect = l.totalCurrentLiabExDebt / K;
          break;
        case "reportedNwc":
          f = `${at("tca")}-${at("tcl")}`;
          expect = l.reportedNwc / K;
          break;
        case "adjustments":
          f = `${num(detail(m, "related_party_balances"))}+${num(detail(m, "accrued_interest"))}+${num(detail(m, "income_tax_payable"))}-${num(detail(m, "related_party_receivable"))}+IF(${A("deferredRevenueTreatment")}="Debt-like",${num(at("deferredRevenue"))}+${num(at("customerDeposits"))},0)`;
          expect = l.adjustments / K;
          break;
        case "adjustedNwc":
          f = `${at("reportedNwc")}+${at("adjustments")}`;
          expect = l.adjustedNwc / K;
          break;
        case "pctLtmRevenue":
          f = `IFERROR(${at("adjustedNwc")}/${at("ltmRevenue")},"n.a.")`;
          expect = l.pctLtmRevenue || "n.a.";
          fmt = FMT.pct1;
          break;
        case "deferredRevenuePct":
          // n.a. where the line itself is n.a., never a dash that reads as zero.
          f = `IF(ISNUMBER(${at("deferredRevenue")}),IFERROR(${at("deferredRevenue")}/${at("ltmRevenue")},"n.a."),"n.a.")`;
          expect = avail("deferred_revenue") && t(p.month).revenue ? l.deferredRevenuePctRevenue : "n.a.";
          fmt = FMT.pct1;
          break;
        case "dso":
          f = `IFERROR(${at("ar")}/${at("ltmRevenue")}*365,"n.a.")`;
          expect = l.dso || "n.a.";
          fmt = FMT.days;
          break;
        case "dio":
          f = `IFERROR(${at("inventory")}/${at("ltmCogs")}*365,"n.a.")`;
          expect = l.dio || "n.a.";
          fmt = FMT.days;
          break;
        case "dpo":
          f = `IFERROR(${at("ap")}/${at("ltmCogs")}*365,"n.a.")`;
          expect = l.dpo || "n.a.";
          fmt = FMT.days;
          break;
      }
      if (f) b.formula(rr, c, f, { style, fmt, expect, label: `${row.key} ${m}` });
    });
    // Peg, latest, latest vs peg (dollar rows only).
    const field = DOLLAR_FIELDS[row.key];
    if (field) {
      const fmt = row.kind === "lineFirst" || row.kind === "subtotal" || row.kind === "keyTotal" ? FMT.currency : FMT.body;
      const last = 3 + n - 1;
      const count = nwc.pegBasis === "T12M average" ? 12 : nwc.pegBasis === "T4Q average" ? 4 : 0;
      const latestValue = nwc.periods[n - 1]!.lines[field];
      const detailLine = DETAIL_OF[row.key];
      // A carved-out line the sheets do not all show has no average: its peg is n.a., like the line.
      const pegNa = !!detailLine && nwc.periods.slice(-count).some((p) => p.detail?.[detailLine] === undefined);
      if (count && !pegNa) {
        const pegValue = nwc.periods.slice(-count).reduce((s, p) => s + p.lines[field], 0) / count;
        b.formula(rr, pegCol, `AVERAGE(${addr(rr, last - count + 1)}:${addr(rr, last)})`, { style, fmt, expect: pegValue / K, label: `${row.key} peg` });
        b.formula(rr, vsCol, `${addr(rr, latestCol)}-${addr(rr, pegCol)}`, { style, fmt, expect: (latestValue - pegValue) / K, label: `${row.key} vs peg` });
      } else {
        b.na(rr, pegCol, "n.a.", { style });
        b.na(rr, vsCol, "n.a.", { style });
      }
      if (detailLine && nwc.periods[n - 1]!.detail?.[detailLine] === undefined) b.na(rr, latestCol, "n.a.", { style });
      else b.formula(rr, latestCol, addr(rr, last), { style, fmt, expect: latestValue / K, label: `${row.key} latest` });
    }
    if (transfersCol && row.transfer) b.text(rr, transfersCol, row.transfer, { align: { horizontal: "center" } });
  }
  // Revenue and COGS of the twelve months ending at each date (the fiscal year in annual mode), for the ratios.
  const lr = b.r("ltmRevenue");
  const lc = b.r("ltmCogs");
  b.text(lr, 2, "LTM revenue at date ($000s)", { style: "helper" });
  b.text(lc, 2, "LTM cost of revenue at date ($000s)", { style: "helper" });
  nwc.periods.forEach((p, i) => {
    const c = 3 + i;
    const dateCell = addr(6, c, { row: true });
    const t = trailing(model, p.month);
    const fyCol = pnlFyColumn(model, p.month);
    if (!t.covered && !fyCol) {
      // Neither twelve grid months nor a fiscal-year P&L end at this date: the ratios are n.a., never a partial year.
      b.na(lr, c, "n.a.", { style: "helper" });
      b.na(lc, c, "n.a.", { style: "helper" });
      return;
    }
    if (monthly && t.covered) {
      b.formula(lr, c, `SUMIFS(${monthlyRow("revenue")},${monthlyHeader},">="&(EOMONTH(${dateCell},-12)+1),${monthlyHeader},"<="&${dateCell})`, { style: "helper", role: "helper", fmt: FMT.body, expect: t.revenue / K, label: `ltm revenue ${p.month}` });
      b.formula(lc, c, `SUMIFS(${monthlyRow("cogs")},${monthlyHeader},">="&(EOMONTH(${dateCell},-12)+1),${monthlyHeader},"<="&${dateCell})`, { style: "helper", role: "helper", fmt: FMT.body, expect: t.cogs / K, label: `ltm cogs ${p.month}` });
    } else {
      b.formula(lr, c, `${S("pnl")}${fyCol}${rowOf("pnl", "revenue")}`, { style: "helper", role: "helper", fmt: FMT.body, expect: t.revenue / K, label: `fy revenue ${p.month}` });
      b.formula(lc, c, `${S("pnl")}${fyCol}${rowOf("pnl", "cogs")}`, { style: "helper", role: "helper", fmt: FMT.body, expect: t.cogs / K, label: `fy cogs ${p.month}` });
    }
  });
  const cr = b.r("check");
  b.text(cr, 2, "Check: NWC lines less Balance Sheet (C08)", { style: "check" });
  nwc.periods.forEach((p, i) => {
    const c = 3 + i;
    const at = (k: string) => addr(b.r(k), c);
    b.formula(cr, c, `ABS(${at("tca")}-(${bsCell(p.month, "tca")}-${bsCell(p.month, "cash")}))+ABS(${at("tcl")}-${bsCell(p.month, "tcl")})`, { style: "check", fmt: FMT.check, expect: 0, tol: 1e-6, label: `C08 ${p.month}` });
  });
  b.checkCf(cr, 3, 3 + n - 1);
  if (asset) {
    const tr = b.r("transferring");
    b.text(tr, 2, "Transferring NWC (inventory less customer deposits)", { style: "keyTotal" });
    b.keyTotalBox([tr, tr], [[latestCol, latestCol]]);
    b.formula(tr, latestCol, `${addr(b.r("inventory"), latestCol)}-${num(addr(b.r("customerDeposits"), latestCol))}`, { style: "keyTotal", fmt: FMT.currency, expect: (nwc.transferringNwc ?? 0) / K, label: "transferring nwc" });
    const sr = b.r("sellerRetained");
    b.text(sr, 2, "Memo: seller-retained NWC (AR + unbilled + prepaids - AP - accrued)", { style: "line" });
    b.formula(sr, latestCol, `${addr(b.r("ar"), latestCol)}+${num(addr(b.r("unbilled"), latestCol))}+${addr(b.r("prepaidOther"), latestCol)}-${addr(b.r("ap"), latestCol)}-${addr(b.r("accrued"), latestCol)}`, { style: "line", fmt: FMT.body, expect: (nwc.sellerRetainedNwc ?? 0) / K, label: "seller retained nwc" });
  }
  const pegNote = nwc.pegBasis === "n.a." ? "Year-end balance sheets only: no peg (monthly balance sheets required, check C20)." : nwc.pegBasis === "T12M average" ? "Peg is the trailing-twelve-month average of adjusted NWC (AMB convention)." : "Peg is the trailing four quarter-ends' average (info flag: quarter-ends only).";
  b.note(lastPrinted, 2, `Note: ${pegNote} Deferred revenue and customer deposits are operating liabilities inside NWC (AMB default); adjustments remove related-party balances, accrued interest and income taxes. Books basis: ${model.assumptions!.booksBasis === "unconfirmed" ? "unconfirmed" : model.assumptions!.booksBasis}.`);
  b.print({ area: `B2:${addr(lastPrinted, notesCol)}`, landscape: n > 6, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  b.defineName("NWC_Latest", `$${colLetter(latestCol)}$${b.r("adjustedNwc")}`);
  b.defineName("NWC_Peg", `$${colLetter(pegCol)}$${b.r("adjustedNwc")}`);
  b.defineName("NWC_vsPeg", `$${colLetter(vsCol)}$${b.r("adjustedNwc")}`);
  b.defineName("DefRev_Latest", `$${colLetter(latestCol)}$${b.r("deferredRevenue")}`);
  return b;
}

/** Revenue and COGS of the twelve months ending at `m`: the grid when it covers them, else the fiscal year ending there. */
function trailing(model: ModelOutput, m: MonthKey): { revenue: number; cogs: number; covered: boolean } {
  const grid = model.monthly;
  if (grid) {
    const keys = grid.months.map((x) => x.key);
    const twelve = monthRange(addMonths(m, -11), m);
    if (twelve.every((k) => keys.includes(k))) return twelve.reduce((s, k) => ({ revenue: s.revenue + grid.series.revenue![keys.indexOf(k)]!, cogs: s.cogs + grid.series.cogs![keys.indexOf(k)]!, covered: true }), { revenue: 0, cogs: 0, covered: true });
  }
  const fy = model.columns.find((c) => c.ref.kind === "fiscal_year" && !c.projected && c.end === m);
  const p = fy ? model.periods[fy.key] : undefined;
  return p ? { revenue: p.pnl.revenue, cogs: p.pnl.cogs, covered: false } : { revenue: 0, cogs: 0, covered: false };
}

function pnlFyColumn(model: ModelOutput, m: MonthKey): string | undefined {
  const hist = model.columns.filter((c) => !c.projected);
  const idx = hist.findIndex((c) => c.ref.kind === "fiscal_year" && c.end === m);
  return idx >= 0 ? colLetter(3 + idx) : undefined;
}

// --- Debt-Like Items ------------------------------------------------------------------------------

export function planDebtLike(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const dl = model.debtLike;
  if (!dl) return undefined;
  const b = new SheetBuilder("debtLike", SHEET.debtLike);
  const asset = model.dealForm === "asset_purchase";
  const headers = ["Item", "Balance ($000s)", "Treatment", "Source", "Status", "Payoff letter", "Note"];
  const widths = [WIDTH.label, 14, 12, 30, 11, 13, 46];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  const lastCol = 8;
  b.anatomy({ subtitle: `Debt and Debt-Like Items at ${dl.asOf.slice(5, 7)}/${dl.asOf.slice(8, 10)}/${dl.asOf.slice(2, 4)} ($000s)`, lastCol, toggleCol: 7, masterToggle: ctx.masterToggle });
  b.text(3, 6, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: lastCol, label: "Debt-like items" }]);
  headers.forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 || i === 3 || i === 6 ? "left" : "center" } }));
  let r = 8;
  const first = r;
  const treatment = { debt: "Debt", debt_like: "Debt-like", nwc: "NWC" } as const;
  // Each balance is the Databook account at the latest statement date, never a typed copy of it (check C18).
  const dates = bsDates(model);
  const at = dates.indexOf(dl.asOf.slice(0, 7));
  const dbRange = (c: number) => `${S("databook")}$${colLetter(c)}$${rowOf("databook", "bsFirst")}:$${colLetter(c)}$${rowOf("databook", "bsLast")}`;
  for (const item of dl.items) {
    b.text(r, 2, item.item, { style: "lineFirst" });
    if (at >= 0 && item.accounts.length) {
      const f = `(${item.accounts.map((a) => `SUMIFS(${dbRange(DATABOOK_COL.periodStart + at)},${dbRange(DATABOOK_COL.account)},"${a.replace(/"/g, '""')}")`).join("+")})/${K}`;
      b.formula(r, 3, f, { fmt: FMT.body, expect: item.balance / K, label: `balance ${item.item}` });
    } else b.num(r, 3, item.balance / K, { fmt: FMT.body });
    // Customer money follows the Assumptions switch, so NWC and this tab never both carry it (C19).
    if (isCustomerMoney(item.item) && (item.treatment === "nwc" || model.nwc?.deferredRevenueTreatment === "debt_like")) {
      b.formula(r, 4, `IF(${A("deferredRevenueTreatment")}="Debt-like","Debt-like","NWC")`, { role: "link", expect: treatment[item.treatment], label: `treatment ${item.item}`, align: { horizontal: "center" } });
    } else b.cell(r, 4, { v: treatment[item.treatment], role: "input", align: { horizontal: "center" } });
    b.text(r, 5, `Balance sheet, ${item.accounts.join("; ") || "per the data layer"}`, { align: { wrap: true, vertical: "top" } });
    b.cell(r, 6, { v: item.status.replace(/^\w/, (c) => c.toUpperCase()), role: "input", align: { horizontal: "center" } });
    const letter = item.payoffLetter && item.payoffLetter !== "n/a" ? item.payoffLetter.replace(/^\w/, (c) => c.toUpperCase()) : "n.a.";
    b.text(r, 7, asset ? letter : "n.a.", { align: { horizontal: "center" } });
    b.text(r, 8, item.note ?? (item.treatment === "nwc" ? "In NWC (AMB default)" : asset ? "Retained by Seller; paid from proceeds at close" : "Repaid at or before closing"));
    r++;
  }
  const last = r - 1;
  r++;
  const total = (key: string, label: string, crit: string, expect: number, kind: "keyTotal" | "line") => {
    b.row(key, r);
    b.text(r, 2, label, { style: kind });
    if (kind === "keyTotal") b.keyTotalBox([r, r], [[3, 3]]);
    b.formula(r, 3, `SUMIFS(${addr(first, 3, { row: true, col: true })}:${addr(last, 3, { row: true, col: true })},${addr(first, 4, { row: true, col: true })}:${addr(last, 4, { row: true, col: true })},"${crit}")`, { style: kind, fmt: FMT.currency, expect: expect / K, label: key });
    r++;
  };
  total("fundedDebt", "Funded debt (repaid at or before closing)", "Debt", dl.fundedDebt, "keyTotal");
  total("debtLike", "Debt-like items (deducted from enterprise value)", "Debt-like", dl.debtLike, "keyTotal");
  total("inNwc", "Memo: balances kept in NWC (AMB default)", "NWC", dl.inNwc, "line");
  // Credit cards are funded debt but unsecured, so Deal Structure pays them at close on their own line, apart from the liens.
  const cards = dl.items.filter((i) => i.treatment === "debt" && isCreditCard(i.item)).reduce((s, i) => s + i.balance, 0);
  b.row("creditCards", r);
  b.text(r, 2, "Memo: credit card balances within funded debt (unsecured)", { style: "line" });
  b.formula(r, 3, `SUMIFS(${addr(first, 3, { row: true, col: true })}:${addr(last, 3, { row: true, col: true })},${addr(first, 4, { row: true, col: true })}:${addr(last, 4, { row: true, col: true })},"Debt",${addr(first, 2, { row: true, col: true })}:${addr(last, 2, { row: true, col: true })},"*redit card*")`, { style: "line", fmt: FMT.currency, expect: cards / K, label: "credit cards" });
  r++;
  r++;
  b.note(r, 2, `Note: deferred revenue and customer deposits stay in NWC under the AMB default and appear here only as a memo (check C19). ${asset ? "On an asset purchase every debt item is retained by the Seller and settled from proceeds at close with a written payoff letter." : "Cash-free, debt-free: every item is repaid at or before closing; payoff letters and lien releases at close."}`);
  b.print({ area: `B2:${addr(r, lastCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}

// --- Cash Flow --------------------------------------------------------------------------------------

export function planCashFlow(ctx: TabContext): SheetBuilder | undefined {
  const { model } = ctx;
  const cf = model.cashFlow;
  if (!cf?.length) return undefined;
  const b = new SheetBuilder("cashFlow", SHEET.cashFlow);
  const dates = bsDates(model);
  const n = cf.length;
  const lastValue = 3 + n - 1;
  const notesCol = lastValue + 2;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.widths(3, lastValue, WIDTH.value);
  b.spacerCol(lastValue + 1);
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: "Historical Cash Flow, Indirect Method ($000s)", lastCol: notesCol, toggleCol: lastValue, masterToggle: ctx.masterToggle });
  b.text(3, lastValue - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 3, to: lastValue, label: "Full Year" }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: 3, to: lastValue }, [], "Cash Flow");
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });
  const hist = model.columns.filter((c) => !c.projected);
  const pnlColOf = (fy: number) => colLetter(3 + hist.findIndex((c) => c.ref.kind === "fiscal_year" && c.fiscalYear === fy));
  const bsColOf = (fy: number) => colLetter(bsColumn(dates, fiscalYearEndKey(fy, model.fiscalYearEndMonth)));
  cf.forEach((y, i) => b.formula(6, 3 + i, `${S("pnl")}${pnlColOf(y.fiscalYear)}6`, { style: "header", role: "text", expect: `FY${y.fiscalYear}`, label: `cf label ${y.fiscalYear}` }));
  type Row = { key: string; label: string; kind: "lineFirst" | "line" | "subtotal" | "keyTotal" | "ratio" | "check" };
  const rows: Row[] = [
    { key: "netIncome", label: "Net Income", kind: "lineFirst" },
    { key: "da", label: "(+) Depreciation and Amortization", kind: "line" },
    { key: "dAr", label: "(Increase) / Decrease in Receivables", kind: "line" },
    { key: "dInv", label: "(Increase) / Decrease in Inventory", kind: "line" },
    { key: "dOca", label: "(Increase) / Decrease in Other Current Assets", kind: "line" },
    { key: "dAp", label: "Increase / (Decrease) in Payables", kind: "line" },
    { key: "dOcl", label: "Increase / (Decrease) in Accrued and Other", kind: "line" },
    { key: "cfo", label: "Cash from Operations", kind: "subtotal" },
    { key: "capex", label: "Capital Expenditures (derived)", kind: "line" },
    { key: "cfi", label: "Cash from Investing", kind: "subtotal" },
    { key: "dDebt", label: "Net Borrowing / (Repayment)", kind: "line" },
    { key: "distributions", label: "Owner Distributions (derived)", kind: "line" },
    { key: "cff", label: "Cash from Financing", kind: "subtotal" },
    { key: "netChange", label: "Net Change in Cash", kind: "keyTotal" },
    { key: "beginCash", label: "Beginning Cash", kind: "line" },
    { key: "endCash", label: "Ending Cash", kind: "keyTotal" },
    { key: "bsCash", label: "Cash per Balance Sheet", kind: "line" },
    { key: "check", label: "Check: Ending Cash less Balance Sheet Cash", kind: "check" },
    { key: "fcf", label: "Free Cash Flow (CFO less Capex)", kind: "keyTotal" },
    { key: "cashConversion", label: "Cash Conversion (FCF ÷ Reported EBITDA)", kind: "ratio" },
  ];
  let r = 8;
  for (const row of rows) b.row(row.key, r++);
  const lastPrinted = r + 1;
  const spans: [number, number][] = [[3, lastValue]];
  for (const row of rows) {
    const rr = b.r(row.key);
    b.text(rr, 2, row.label, { style: row.kind, align: row.kind === "ratio" ? { horizontal: "left", indent: 1 } : undefined });
    if (row.kind === "subtotal") b.subtotalBorder(rr, spans);
    if (row.kind === "keyTotal") b.keyTotalBox([rr, rr], spans);
    cf.forEach((y, i) => {
      const c = 3 + i;
      const at = (k: string) => addr(b.r(k), c);
      const cur = (k: string) => `${S("bs")}${bsColOf(y.fiscalYear)}${rowOf("bs", k)}`;
      const prev = (k: string) => `${S("bs")}${bsColOf(y.fiscalYear - 1)}${rowOf("bs", k)}`;
      const pnl = (k: string) => `${S("pnl")}${pnlColOf(y.fiscalYear)}${rowOf("pnl", k)}`;
      let f: string;
      let expect: number | string;
      let fmt: string = row.kind === "line" ? FMT.body : FMT.currency;
      switch (row.key) {
        case "netIncome": f = pnl("net_income"); expect = y.netIncome / K; break;
        case "da": f = pnl("da"); expect = y.da / K; break;
        case "dAr": f = `${prev("ar")}-${cur("ar")}`; expect = y.dAr / K; break;
        case "dInv": f = `${prev("inventory")}-${cur("inventory")}`; expect = y.dInv / K; break;
        case "dOca": f = `${prev("oca")}-${cur("oca")}`; expect = y.dOca / K; break;
        case "dAp": f = `${cur("ap")}-${prev("ap")}`; expect = y.dAp / K; break;
        case "dOcl": f = `${cur("ocl")}-${prev("ocl")}`; expect = y.dOcl / K; break;
        case "cfo": f = `SUM(${at("netIncome")}:${at("dOcl")})`; expect = y.cfo / K; break;
        case "capex": f = `-(${cur("fixed")}-${prev("fixed")}+${at("da")})-(${cur("other_assets")}-${prev("other_assets")})`; expect = y.capex / K; break;
        case "cfi": f = at("capex"); expect = y.cfi / K; break;
        case "dDebt": f = `${cur("debt")}-${prev("debt")}`; expect = y.dDebt / K; break;
        case "distributions": f = `-(${prev("equity")}+${at("netIncome")}-${cur("equity")})`; expect = y.distributions / K; break;
        case "cff": f = `${at("dDebt")}+${at("distributions")}`; expect = y.cff / K; break;
        case "netChange": f = `${at("cfo")}+${at("cfi")}+${at("cff")}`; expect = y.netChange / K; break;
        case "beginCash": f = prev("cash"); expect = y.beginCash / K; break;
        case "endCash": f = `${at("beginCash")}+${at("netChange")}`; expect = y.endCash / K; break;
        case "bsCash": f = cur("cash"); expect = y.bsCash / K; break;
        case "check": f = `${at("endCash")}-${at("bsCash")}`; expect = 0; fmt = FMT.check; break;
        case "fcf": f = `${at("cfo")}+${at("capex")}`; expect = y.freeCashFlow / K; break;
        default: f = `IFERROR(${at("fcf")}/${pnl("reported_ebitda")},"n.a.")`; expect = y.cashConversion || "n.a."; fmt = FMT.pct1;
      }
      b.formula(rr, c, f, { style: row.kind === "ratio" ? "ratio" : row.kind, fmt, expect, tol: row.kind === "check" ? 1e-6 : undefined, label: `${row.key} ${y.fiscalYear}` });
    });
    if (row.kind === "check") b.checkCf(rr, 3, lastValue);
  }
  b.note(lastPrinted, 2, "Note: capex is derived from the change in net fixed assets plus depreciation; owner distributions are the change in equity not explained by net income. Both are estimates until the fixed-asset and equity roll-forwards are supplied.");
  b.print({ area: `B2:${addr(lastPrinted, notesCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

// --- Proof of Cash --------------------------------------------------------------------------------

export function planProofOfCash(ctx: TabContext, ds: FinancialDataset | undefined): SheetBuilder | undefined {
  const { model } = ctx;
  const months = gridMonths(model);
  if (!months.length || !model.modules.built.includes("Proof of Cash")) return undefined;
  const deposits = ds?.depositsByMonth ?? {};
  const statementMonths = Object.keys(deposits).filter((m) => months.includes(m)).sort();
  // Every month from the first statement to the last, so a missing statement shows as its own row rather than vanishing.
  const bankMonths = statementMonths.length ? monthRange(statementMonths[0]!, statementMonths.at(-1)!) : [];
  const b = new SheetBuilder("proofOfCash", SHEET.proofOfCash);
  b.width(1, WIDTH.gutter);
  b.width(2, 16);
  [14, 14, 12, 11].forEach((w, i) => b.width(3 + i, w));
  b.spacerCol(7);
  b.width(8, WIDTH.notes);
  b.anatomy({ subtitle: "Proof of Cash: P&L Revenue vs. Bank Deposits ($000s)", lastCol: 8, toggleCol: 6, masterToggle: ctx.masterToggle });
  b.text(3, 5, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: 6, label: "Proof of cash" }, { from: 8, to: 8, label: "Notes" }]);
  ["Month", "P&L Revenue", "Bank Deposits", "Variance ($)", "Variance (%)"].forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 0 ? "left" : "center" } }));
  b.cell(6, 8, { style: "header", v: "Flag (above 5%)", role: "text", align: { horizontal: "left" } });
  const monthlyRow = `${S("monthly")}$${colLetter(MONTH_START)}$${rowOf("monthly", "revenue")}:$${colLetter(MONTH_START + months.length - 1)}$${rowOf("monthly", "revenue")}`;
  const monthlyHeader = `${S("monthly")}$${colLetter(MONTH_START)}$6:$${colLetter(MONTH_START + months.length - 1)}$6`;
  let r = 8;
  const first = r;
  // Months derive from AsOfDate like every period label (guide 5.2): the first from its offset, each next one from the row above.
  const flagText = (pct: number | string) => (typeof pct !== "number" ? "No bank statement for the month" : Math.abs(pct) > 0.05 ? "Explain: deposits differ from revenue by more than 5%" : "");
  bankMonths.forEach((m, i) => {
    const rev = model.monthly!.series.revenue![months.indexOf(m)]!;
    const dep = deposits[m]?.amount;
    const monthF = i === 0 ? `EOMONTH(${ASOF},${monthOffset(model.assumptions!.asOfMonth, m) - 1})+1` : `EOMONTH(${addr(r - 1, 2)},0)+1`;
    b.formula(r, 2, monthF, { fmt: FMT.monthHeader, expect: serialOfMonthStart(m), label: `month ${m}`, align: { horizontal: "left" } });
    b.formula(r, 3, `INDEX(${monthlyRow},MATCH(${addr(r, 2)},${monthlyHeader},0))`, { style: "line", fmt: FMT.body, expect: rev / K, label: `revenue ${m}` });
    b.formula(r, 4, `IFERROR(INDEX(${S("rawBank")}$B:$B,MATCH(${addr(r, 2)},${S("rawBank")}$A:$A,0))/${K},"n.a.")`, { style: "line", fmt: FMT.body, expect: dep === undefined ? "n.a." : dep / K, label: `deposits ${m}` });
    b.formula(r, 5, `IFERROR(${addr(r, 4)}-${addr(r, 3)},"n.a.")`, { style: "line", fmt: FMT.body, expect: dep === undefined ? "n.a." : (dep - rev) / K, label: `variance ${m}` });
    const pct = dep === undefined || !rev ? "n.a." : (dep - rev) / rev;
    b.formula(r, 6, `IFERROR(${addr(r, 5)}/${addr(r, 3)},"n.a.")`, { style: "ratio", fmt: FMT.pct1, expect: pct, label: `variance pct ${m}` });
    b.formula(r, 8, `IF(ISNUMBER(${addr(r, 6)}),IF(ABS(${addr(r, 6)})>0.05,"Explain: deposits differ from revenue by more than 5%",""),"No bank statement for the month")`, { role: "text", font: { color: COLOR.pending }, expect: flagText(pct), label: `flag ${m}`, align: { horizontal: "left" } });
    r++;
  });
  const last = r - 1;
  // Totals over the months that have a statement, like C14.
  const totalRev = statementMonths.reduce((s, m) => s + model.monthly!.series.revenue![months.indexOf(m)]!, 0);
  const totalDep = statementMonths.reduce((s, m) => s + deposits[m]!.amount, 0);
  b.text(r, 2, "Total", { style: "keyTotal" });
  b.keyTotalBox([r, r], [[3, 6]]);
  b.formula(r, 3, `SUMIFS(${addr(first, 3)}:${addr(last, 3)},${addr(first, 4)}:${addr(last, 4)},"<>n.a.")`, { style: "keyTotal", fmt: FMT.currency, expect: totalRev / K, label: "total revenue" });
  b.formula(r, 4, `SUM(${addr(first, 4)}:${addr(last, 4)})`, { style: "keyTotal", fmt: FMT.currency, expect: totalDep / K, label: "total deposits" });
  b.formula(r, 5, `${addr(r, 4)}-${addr(r, 3)}`, { style: "keyTotal", fmt: FMT.currency, expect: (totalDep - totalRev) / K, label: "total variance" });
  b.formula(r, 6, `IFERROR(${addr(r, 5)}/${addr(r, 3)},"n.a.")`, { style: "margin", fmt: FMT.pct1, expect: totalRev ? (totalDep - totalRev) / totalRev : "n.a.", label: "total variance pct" });
  const totalRow = r;
  r += 2;
  b.row("variancePct", r);
  // The label runs on across the empty figure cells rather than wrapping in the 16-wide Month column.
  b.text(r, 2, "Check: deposits less revenue, % (flag above 5%)", { style: "check", align: { wrap: false } });
  // The check sits under Variance (%) so its label has the width of the table.
  b.formula(r, 6, `IFERROR(${addr(totalRow, 5)}/${addr(totalRow, 3)},0)`, { style: "check", fmt: FMT.pct1, expect: totalRev ? (totalDep - totalRev) / totalRev : 0, tol: 1e-6, label: "C14" });
  b.cf({ ref: addr(r, 6), formula: `ABS(${addr(r, 6)})>0.05`, font: { color: "FF0000" } });
  r += 2;
  b.note(r, 2, "Note: operating deposits exclude transfers, loan proceeds and owner contributions (Raw - Bank). A variance inside 5% is consistent with timing of collections and sales tax; a larger one needs an explanation before the revenue figure is relied on.");
  b.print({ area: `B2:${addr(r, 8)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  return b;
}
