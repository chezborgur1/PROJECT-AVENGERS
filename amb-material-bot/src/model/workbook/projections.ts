// Projections (guide 5.1 row 20): five driver-based years of income
// statement, balance sheet and cash flow, every cell a formula on the
// Assumptions drivers, opening from the latest actual balance sheet. Mirrors
// the legacy engine's projection arithmetic line for line.

import { fiscalYearEndKey } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { YearValues } from "../engine.ts";
import { A_AT, type TabContext } from "./assumptionsTab.ts";
import { bsDates } from "./balance.ts";
import { S, SHEET } from "./layout.ts";

const K = 1000;

export function planProjections(ctx: TabContext): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("projections", SHEET.projections);
  const years = model.projected;
  const opening = model.historical[model.historical.length - 1]!;
  const n = years.length;
  const openCol = 3;
  const firstProj = 5;
  const lastValue = firstProj + n - 1;
  const notesCol = lastValue + 2;
  b.width(1, WIDTH.gutter);
  b.width(2, WIDTH.label);
  b.width(openCol, WIDTH.value);
  b.spacerCol(openCol + 1);
  b.widths(firstProj, lastValue, WIDTH.value);
  b.spacerCol(lastValue + 1);
  b.width(notesCol, WIDTH.notes);
  b.anatomy({ subtitle: "Projections: driver-based income statement, balance sheet and cash flow ($000s)", lastCol: notesCol, toggleCol: lastValue, masterToggle: ctx.masterToggle });
  b.text(3, lastValue - 1, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: openCol, to: openCol, label: "Opening" }, { from: firstProj, to: lastValue, label: "Projection" }, { from: notesCol, to: notesCol, label: "Notes" }]);
  b.tier2(6, { from: openCol, to: lastValue }, [], "Projections");
  b.cell(6, openCol, { style: "header", v: `FY${opening.year}${opening.bs?.estimated ? " (est.)" : ""}`, role: "text" });
  years.forEach((y, i) => b.formula(6, firstProj + i, `"FY"&(${A_AT("latestFy", 0).replace("$C$", "$C$")}+${i + 1})&"E"`, { style: "header", role: "text", expect: `FY${y.year}E`, label: `proj label ${y.year}` }));
  b.cell(6, notesCol, { style: "header", v: null, role: "text" });

  const sections: { title: string; rows: { key: string; label: string; kind: "lineFirst" | "line" | "subtotal" | "keyTotal" | "margin" | "ratio" | "check"; fmt?: string }[] }[] = [
    {
      title: "Income Statement",
      rows: [
        { key: "revenue", label: "Total Revenue", kind: "lineFirst" },
        { key: "growth", label: "% Growth", kind: "ratio" },
        { key: "cogs", label: "Cost of Revenue", kind: "line" },
        { key: "gross_profit", label: "Gross Profit", kind: "subtotal" },
        { key: "payroll", label: "Salaries, Wages and Benefits", kind: "line" },
        { key: "owner_comp", label: "Owner / Officer Compensation", kind: "line" },
        { key: "rent", label: "Rent and Occupancy", kind: "line" },
        { key: "marketing", label: "Advertising and Marketing", kind: "line" },
        { key: "other_opex", label: "Other Operating Expenses", kind: "line" },
        { key: "total_opex", label: "Total Operating Expenses", kind: "subtotal" },
        { key: "ebitda", label: "EBITDA", kind: "keyTotal" },
        { key: "ebitda_margin", label: "% Margin", kind: "margin" },
        { key: "da", label: "Depreciation and Amortization", kind: "line" },
        { key: "ebit", label: "EBIT", kind: "subtotal" },
        { key: "interest", label: "Interest Expense", kind: "line" },
        { key: "ebt", label: "Pre-Tax Income", kind: "subtotal" },
        { key: "tax", label: "Income Taxes", kind: "line" },
        { key: "net_income", label: "Net Income", kind: "keyTotal" },
      ],
    },
    {
      title: "Balance Sheet",
      rows: [
        { key: "cash", label: "Cash and Equivalents", kind: "lineFirst" },
        { key: "ar", label: "Accounts Receivable", kind: "line" },
        { key: "inventory", label: "Inventory", kind: "line" },
        { key: "oca", label: "Prepaid and Other Current Assets", kind: "line" },
        { key: "fixed", label: "Fixed Assets, Net", kind: "line" },
        { key: "other_assets", label: "Other Long-Term Assets", kind: "line" },
        { key: "total_assets", label: "Total Assets", kind: "keyTotal" },
        { key: "ap", label: "Accounts Payable", kind: "lineFirst" },
        { key: "ocl", label: "Accrued and Other Current Liabilities", kind: "line" },
        { key: "debt", label: "Debt", kind: "line" },
        { key: "equity", label: "Total Equity", kind: "line" },
        { key: "total_le", label: "Total Liabilities and Equity", kind: "keyTotal" },
        { key: "bs_check", label: "Check: Assets less Liabilities and Equity", kind: "check" },
      ],
    },
    {
      title: "Cash Flow",
      rows: [
        { key: "cf_ni", label: "Net Income", kind: "lineFirst" },
        { key: "cf_da", label: "(+) Depreciation and Amortization", kind: "line" },
        { key: "d_ar", label: "(Increase) / Decrease in Receivables", kind: "line" },
        { key: "d_inv", label: "(Increase) / Decrease in Inventory", kind: "line" },
        { key: "d_ap", label: "Increase / (Decrease) in Payables", kind: "line" },
        { key: "cfo", label: "Cash from Operations", kind: "subtotal" },
        { key: "capex", label: "Capital Expenditures", kind: "line" },
        { key: "cfi", label: "Cash from Investing", kind: "subtotal" },
        { key: "repayment", label: "Debt Repayment", kind: "line" },
        { key: "distributions", label: "Owner Distributions", kind: "line" },
        { key: "cff", label: "Cash from Financing", kind: "subtotal" },
        { key: "net_change", label: "Net Change in Cash", kind: "keyTotal" },
        { key: "begin_cash", label: "Beginning Cash", kind: "line" },
        { key: "end_cash", label: "Ending Cash", kind: "keyTotal" },
        { key: "cash_check", label: "Check: Ending Cash less Balance Sheet Cash", kind: "check" },
      ],
    },
  ];
  let r = 8;
  for (const s of sections) {
    b.row(`sec_${s.title}`, r++);
    for (const row of s.rows) b.row(row.key, r++);
    r++;
  }
  const lastPrinted = r;
  const spans: [number, number][] = [[openCol, openCol], [firstProj, lastValue]];
  const dates = bsDates(model);
  const openingKey = fiscalYearEndKey(opening.year, model.fiscalYearEndMonth);
  const bsIdx = dates.indexOf(openingKey);
  const bsLink = (k: string) => (bsIdx >= 0 && !opening.bs?.estimated ? `${S("bs")}${colLetter(3 + bsIdx)}${rowOf("bs", k)}` : undefined);
  const pnlCol = colLetter(3 + model.columns.filter((c) => !c.projected).findIndex((c) => c.ref.kind === "fiscal_year" && c.fiscalYear === opening.year));
  const value = (y: YearValues, key: string): number | string => {
    const bs = y.bs!;
    const cf = y.cf;
    switch (key) {
      case "revenue": return y.revenue / K;
      case "growth": return y.projected ? y.revenue / (prevOf(y).revenue || 1) - 1 : "n.a.";
      case "cogs": return y.cogs / K;
      case "gross_profit": return y.grossProfit / K;
      case "payroll": return y.payroll / K;
      case "owner_comp": return y.ownerComp / K;
      case "rent": return y.rent / K;
      case "marketing": return y.marketing / K;
      case "other_opex": return y.otherOpex / K;
      case "total_opex": return y.totalOpex / K;
      case "ebitda": return y.ebitda / K;
      case "ebitda_margin": return y.revenue ? y.ebitda / y.revenue : "n.m.";
      case "da": return y.da / K;
      case "ebit": return y.ebit / K;
      case "interest": return y.interest / K;
      case "ebt": return (y.ebit - y.interest) / K;
      case "tax": return y.tax / K;
      case "net_income": return (y.ebit - y.interest - y.tax) / K;
      case "cash": return bs.cash / K;
      case "ar": return bs.ar / K;
      case "inventory": return bs.inventory / K;
      case "oca": return bs.oca / K;
      case "fixed": return bs.fixedAssets / K;
      case "other_assets": return bs.otherAssets / K;
      case "total_assets": return bs.totalAssets / K;
      case "ap": return bs.ap / K;
      case "ocl": return bs.ocl / K;
      case "debt": return bs.debt / K;
      case "equity": return bs.equity / K;
      case "total_le": return bs.totalLE / K;
      case "bs_check": return 0;
      case "cf_ni": return (cf?.netIncome ?? 0) / K;
      case "cf_da": return (cf?.da ?? 0) / K;
      case "d_ar": return (cf?.dAr ?? 0) / K;
      case "d_inv": return (cf?.dInv ?? 0) / K;
      case "d_ap": return (cf?.dAp ?? 0) / K;
      case "cfo": return (cf?.cfo ?? 0) / K;
      case "capex": return (cf?.capex ?? 0) / K;
      case "cfi": return (cf?.cfi ?? 0) / K;
      case "repayment": return (cf?.repayment ?? 0) / K;
      case "distributions": return (cf?.distributions ?? 0) / K;
      case "cff": return (cf?.cff ?? 0) / K;
      case "net_change": return (cf?.netChange ?? 0) / K;
      case "begin_cash": return (cf?.beginCash ?? 0) / K;
      case "end_cash": return (cf?.endCash ?? 0) / K;
      default: return 0;
    }
  };
  const prevOf = (y: YearValues): YearValues => {
    const i = model.years.indexOf(y);
    return model.years[i - 1]!;
  };

  for (const s of sections) {
    b.section(b.r(`sec_${s.title}`), s.title, spans);
    for (const row of s.rows) {
      const rr = b.r(row.key);
      const style = row.kind;
      b.text(rr, 2, row.label, { style, align: row.kind === "margin" || row.kind === "ratio" ? { horizontal: "left", indent: 1 } : undefined });
      if (row.kind === "subtotal") b.subtotalBorder(rr, spans);
      if (row.kind === "keyTotal") b.keyTotalBox([rr, s.rows[s.rows.indexOf(row) + 1]?.kind === "margin" ? rr + 1 : rr], spans);
      const fmt = row.kind === "margin" || row.kind === "ratio" ? (row.kind === "ratio" ? FMT.pct : FMT.pct1) : row.kind === "check" ? FMT.check : row.kind === "line" ? FMT.body : FMT.currency;
      // Opening column: the latest actual year (income statement) and its balance sheet.
      const at0 = (k: string) => addr(b.r(k), openCol);
      const isIs = s.title === "Income Statement";
      const isBs = s.title === "Balance Sheet";
      if (isIs) {
        if (row.key === "growth") b.na(rr, openCol, "n.a.", { style: "ratio" });
        else if (row.key === "ebitda_margin") b.formula(rr, openCol, `IFERROR(${at0("ebitda")}/${at0("revenue")},"n.m.")`, { style, fmt, expect: value(opening, row.key), label: `${row.key} opening` });
        else if (["gross_profit", "total_opex", "ebitda", "ebit", "ebt", "net_income"].includes(row.key)) b.formula(rr, openCol, isCalc(row.key, at0), { style, fmt, expect: value(opening, row.key), label: `${row.key} opening` });
        else b.formula(rr, openCol, `${S("pnl")}${pnlCol}${rowOf("pnl", row.key === "ebitda" ? "reported_ebitda" : row.key)}`, { style, fmt, expect: value(opening, row.key), label: `${row.key} opening` });
      } else if (isBs) {
        if (row.key === "total_assets") b.formula(rr, openCol, `SUM(${at0("cash")}:${at0("other_assets")})`, { style, fmt, expect: value(opening, row.key), label: "total assets opening" });
        else if (row.key === "total_le") b.formula(rr, openCol, `SUM(${at0("ap")}:${at0("equity")})`, { style, fmt, expect: value(opening, row.key), label: "total le opening" });
        else if (row.key === "bs_check") b.formula(rr, openCol, `${at0("total_assets")}-${at0("total_le")}`, { style, fmt, expect: 0, tol: 1e-6, label: "bs check opening" });
        else {
          const link = bsLink(row.key);
          const v = value(opening, row.key) as number;
          if (link) b.formula(rr, openCol, link, { style, fmt, expect: v, label: `${row.key} opening` });
          else b.num(rr, openCol, v, { style, fmt });
        }
      }
      // Projection columns.
      years.forEach((y, i) => {
        const c = firstProj + i;
        const at = (k: string) => addr(b.r(k), c);
        const prev = (k: string) => addr(b.r(k), c - 1);
        const drv = (k: string) => A_AT(k, i);
        let f: string;
        switch (row.key) {
          case "revenue": f = `${prev("revenue")}*(1+${drv("revenueGrowth")})`; break;
          case "growth": f = `IFERROR(${at("revenue")}/${prev("revenue")}-1,"n.a.")`; break;
          case "cogs": f = `${at("revenue")}*${drv("cogsPct")}`; break;
          case "gross_profit": f = `${at("revenue")}-${at("cogs")}`; break;
          case "payroll": f = `${at("revenue")}*${drv("payrollPct")}`; break;
          case "owner_comp": f = `${drv("ownerComp")}/${K}`; break;
          case "rent": f = `${at("revenue")}*${drv("rentPct")}`; break;
          case "marketing": f = `${at("revenue")}*${drv("marketingPct")}`; break;
          case "other_opex": f = `${at("revenue")}*${drv("otherOpexPct")}`; break;
          case "total_opex": f = `SUM(${at("payroll")}:${at("other_opex")})`; break;
          case "ebitda": f = `${at("gross_profit")}-${at("total_opex")}`; break;
          case "ebitda_margin": f = `IFERROR(${at("ebitda")}/${at("revenue")},"n.m.")`; break;
          case "da": f = `${at("revenue")}*${drv("daPct")}`; break;
          case "ebit": f = `${at("ebitda")}-${at("da")}`; break;
          case "interest": f = `${prev("debt")}*${drv("interestRate")}`; break;
          case "ebt": f = `${at("ebit")}-${at("interest")}`; break;
          case "tax": f = `MAX(0,${at("ebt")})*${drv("taxRate")}`; break;
          case "net_income": f = `${at("ebt")}-${at("tax")}`; break;
          case "cash": f = at("end_cash"); break;
          case "ar": f = `${at("revenue")}*${drv("dso")}/365`; break;
          case "inventory": f = `${at("cogs")}*${drv("dio")}/365`; break;
          case "oca": f = prev("oca"); break;
          case "fixed": f = `${prev("fixed")}-${at("capex")}-${at("da")}`; break;
          case "other_assets": f = prev("other_assets"); break;
          case "total_assets": f = `SUM(${at("cash")}:${at("other_assets")})`; break;
          case "ap": f = `${at("cogs")}*${drv("dpo")}/365`; break;
          case "ocl": f = prev("ocl"); break;
          case "debt": f = `${prev("debt")}+${at("repayment")}`; break;
          case "equity": f = `${prev("equity")}+${at("net_income")}+${at("distributions")}`; break;
          case "total_le": f = `SUM(${at("ap")}:${at("equity")})`; break;
          case "bs_check": f = `${at("total_assets")}-${at("total_le")}`; break;
          case "cf_ni": f = at("net_income"); break;
          case "cf_da": f = at("da"); break;
          case "d_ar": f = `${prev("ar")}-${at("ar")}`; break;
          case "d_inv": f = `${prev("inventory")}-${at("inventory")}`; break;
          case "d_ap": f = `${at("ap")}-${prev("ap")}`; break;
          case "cfo": f = `SUM(${at("cf_ni")}:${at("d_ap")})`; break;
          case "capex": f = `-${at("revenue")}*${drv("capexPct")}`; break;
          case "cfi": f = at("capex"); break;
          case "repayment": f = `-MIN(${prev("debt")},${drv("debtRepayment")}/${K})`; break;
          case "distributions": f = `-MAX(0,${at("net_income")})*${drv("distributionsPct")}`; break;
          case "cff": f = `${at("repayment")}+${at("distributions")}`; break;
          case "net_change": f = `${at("cfo")}+${at("cfi")}+${at("cff")}`; break;
          case "begin_cash": f = prev("cash"); break;
          case "end_cash": f = `${at("begin_cash")}+${at("net_change")}`; break;
          default: f = `${at("end_cash")}-${at("cash")}`;
        }
        b.formula(rr, c, f, { style, fmt, expect: value(y, row.key), tol: row.kind === "check" ? 1e-6 : undefined, label: `${row.key} FY${y.year}` });
      });
      if (row.kind === "check") b.checkCf(rr, openCol, lastValue);
    }
  }
  b.note(lastPrinted, 2, `Note: driver-based defaults from the company's own history (growth fading to 3%, latest-year cost ratios, working-capital days from the balance sheet); replace the blue drivers on Assumptions with seller guidance. ${opening.bs?.estimated ? "The opening balance sheet is estimated from working-capital days because the sources carry none." : "The opening balance sheet is the latest actual."}`);
  b.print({ area: `B2:${addr(lastPrinted, notesCol)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 3);
  return b;
}

function isCalc(key: string, at: (k: string) => string): string {
  switch (key) {
    case "gross_profit": return `${at("revenue")}-${at("cogs")}`;
    case "total_opex": return `SUM(${at("payroll")}:${at("other_opex")})`;
    case "ebitda": return `${at("gross_profit")}-${at("total_opex")}`;
    case "ebit": return `${at("ebitda")}-${at("da")}`;
    case "ebt": return `${at("ebit")}-${at("interest")}`;
    default: return `${at("ebt")}-${at("tax")}`;
  }
}
