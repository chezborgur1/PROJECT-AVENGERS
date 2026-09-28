// The Checks tab (guide 5.7): `ID | Check | Tab | Difference | Tolerance |
// Status | Note`. Differences are formulas on the tabs' own check rows where
// the workbook can compute them; writer-side lints are typed with a note
// naming the verifier that enforces them.

import { addr, colLetter, rowOf, SheetBuilder } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { CheckResult, ModelOutput } from "../types.ts";
import { A, type TabContext } from "./assumptionsTab.ts";
import { S, SHEET, type SheetKey } from "./layout.ts";

/** How a check's difference is computed in the workbook; absent = the engine's value is typed. */
export interface CheckFormula {
  f: string;
}

/** Root-sum-square of a range, a scalar that is zero exactly when every cell is zero. */
export const rss = (range: string) => `SQRT(SUMPRODUCT(${range},${range}))`;

export function planChecks(ctx: TabContext, built: Set<SheetKey>, formulas: Record<string, CheckFormula | undefined>): SheetBuilder {
  const { model } = ctx;
  const b = new SheetBuilder("checks", SHEET.checks);
  const widths = [6, 66, 18, 12, 11, 9, 60];
  b.width(1, WIDTH.gutter);
  widths.forEach((w, i) => b.width(2 + i, w));
  const lastCol = 8;
  b.anatomy({ subtitle: "Model checks (differences in the tab's units; tolerance $0.001 at $000s unless stated)", lastCol, toggleCol: 6, masterToggle: ctx.masterToggle });
  b.text(3, 5, "Print", { align: { horizontal: "right" } });
  b.tier1(5, [{ from: 2, to: lastCol, label: "Checks" }]);
  ["ID", "Check", "Tab", "Difference", "Tolerance", "Status", "Note"].forEach((h, i) => b.cell(6, 2 + i, { style: "header", v: h, role: "text", align: { horizontal: i === 1 || i === 6 ? "left" : "center" } }));
  let r = 8;
  b.row("first", r);
  for (const c of model.checks) {
    b.text(r, 2, c.id, { align: { horizontal: "center" } });
    b.text(r, 3, c.check);
    b.text(r, 4, c.tab);
    const formula = formulas[c.id];
    const tabBuilt = built.has(sheetKeyOf(c.tab)) || c.tab === "Checks";
    if (formula && tabBuilt && c.status !== "n.a.") {
      b.formula(r, 5, formula.f, { fmt: FMT.check, expect: c.difference, tol: Math.max(1e-6, c.tolerance / 1000), label: `${c.id} difference` });
    } else if (c.status === "n.a.") {
      b.na(r, 5, "n.a.");
    } else {
      b.num(r, 5, c.difference, { fmt: FMT.check, role: "calc" });
    }
    b.num(r, 6, toleranceInUnits(c), { fmt: FMT.check });
    b.formula(r, 7, `IF(ISNUMBER(${addr(r, 5)}),IF(ABS(${addr(r, 5)})<=${addr(r, 6)},"OK","CHECK"),"n.a.")`, { expect: c.status, label: `${c.id} status`, align: { horizontal: "center" }, font: { bold: true } });
    b.note(r, 8, c.note ?? "", { align: { wrap: false } });
    r++;
  }
  b.row("last", r - 1);
  b.cf({ ref: `G${b.r("first")}:G${b.r("last")}`, formula: `G${b.r("first")}="CHECK"`, font: { color: "FF0000", bold: true } });
  r++;
  b.text(r, 2, "Master check", { font: { bold: true } });
  b.formula(r, 5, `IF(COUNTIF(${addr(b.r("first"), 7, { col: true, row: true })}:${addr(b.r("last"), 7, { col: true, row: true })},"CHECK")=0,"All checks OK",COUNTIF(${addr(b.r("first"), 7, { col: true, row: true })}:${addr(b.r("last"), 7, { col: true, row: true })},"CHECK")&" checks failing")`, { expect: model.masterCheck, label: "master check", font: { bold: true } });
  b.row("master", r);
  r += 2;
  b.note(r, 2, "Note: C17 and C18 are writer-side lints that verifyWorkbook enforces on every formula before the file is delivered; C37 is the PDF render QA. Percentage checks (C12-C14) show the variance as a share of the P&L line.");
  b.print({ area: `B2:${addr(r, lastCol)}`, landscape: true, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, 2);
  return b;
}

/** Tolerances are stated in dollars by the engine; dollar checks print at $000s on this tab. */
function toleranceInUnits(c: CheckResult): number {
  if (c.tolerance < 1) return c.tolerance;
  return c.tolerance / 1000;
}

function sheetKeyOf(tab: string): SheetKey {
  const entry = (Object.entries(SHEET) as [SheetKey, string][]).find(([, name]) => name === tab);
  return entry?.[0] ?? "checks";
}

/** The workbook-side formulas for the checks each tab exposes, built from row tokens resolved after layout. */
export function checkFormulas(model: ModelOutput, built: Set<SheetKey>): Record<string, CheckFormula | undefined> {
  const out: Record<string, CheckFormula | undefined> = {};
  const has = (k: SheetKey) => built.has(k);
  const rowRange = (sheet: SheetKey, key: string, c1: number, c2: number) => `${S(sheet)}$${colLetter(c1)}$${rowOf(sheet, key)}:$${colLetter(c2)}$${rowOf(sheet, key)}`;
  const monthsN = model.monthly?.months.length ?? 0;
  if (has("databook") && monthsN) out.C01 = { f: rss(`${S("databook")}$${colLetter(17 + monthsN + 2)}$${rowOf("databook", "first")}:$${colLetter(17 + monthsN + 2)}$${rowOf("databook", "last")}`) };
  if (has("monthly")) out.C02 = { f: rss(rowRange("monthly", "tie_out", 17, 17 + monthsN - 1)) };
  if (has("monthly") && has("pnl")) {
    const cols = model.columns.filter((c) => !c.projected);
    const terms = cols.map((_, i) => {
      const col = pnlColumnLetter(model, i);
      return `ABS(${S("pnl")}${col}${rowOf("pnl", "revenue")}-${S("monthly")}${col}${rowOf("monthly", "revenue")})+ABS(${S("pnl")}${col}${rowOf("pnl", "net_income")}-${S("monthly")}${col}${rowOf("monthly", "net_income")})`;
    });
    out.C03 = { f: terms.join("+") };
    out.C04 = { f: rss(rowRange("pnl", "check", 3, 3 + cols.length - 1 + spacerCount(model))) };
  }
  if (has("ladder")) {
    const cols = model.columns.filter((c) => !c.projected);
    const c2 = 3 + cols.length - 1 + spacerCount(model);
    out.C05 = { f: rss(rowRange("ladder", "check_reported", 3, c2)) };
    out.C06 = { f: rss(rowRange("ladder", "check_schedule", 3, c2)) };
  }
  if (has("bs")) out.C07 = { f: rss(rowRange("bs", "check", 3, 3 + (model.nwc?.periods.length ?? 1) - 1)) };
  if (has("nwc")) out.C08 = { f: rss(rowRange("nwc", "check", 3, 3 + (model.nwc?.periods.length ?? 1) - 1)) };
  if (has("cashFlow") && model.cashFlow?.length) out.C09 = { f: rss(rowRange("cashFlow", "check", 3, 3 + model.cashFlow.length - 1)) };
  if (has("projections")) out.C10 = { f: `${rss(rowRange("projections", "bs_check", 3, 3 + model.projected.length - 1))}+${rss(rowRange("projections", "cash_check", 3, 3 + model.projected.length - 1))}` };
  if (has("deal")) out.C11 = { f: `ABS(${S("deal")}$C$${rowOf("deal", "su_check")})` };
  if (has("customers")) out.C12 = { f: `${S("customers")}$C$${rowOf("customers", "tieVariance")}` };
  if (has("headcount")) out.C13 = { f: `${S("headcount")}$C$${rowOf("headcount", "tieVariance")}` };
  if (has("proofOfCash")) out.C14 = { f: `${S("proofOfCash")}$C$${rowOf("proofOfCash", "variancePct")}` };
  const outputTabs: SheetKey[] = ["summary", "pnl", "ladder", "adjustments", "revenue", "expense", "customers", "retention", "concentration", "cohorts", "headcount", "bs", "nwc", "debtLike", "cashFlow", "proofOfCash", "projections", "valuation", "deal", "sensitivities"];
  out.C15 = { f: outputTabs.filter(has).map((k) => `SUMPRODUCT(--ISERROR(${S(k)}$B$5:$${colLetter(40)}$${rowOf(k, "errorScanLast")}))`).join("+") };
  if (has("monthly") && has("pnl")) {
    const cols = model.columns.filter((c) => !c.projected);
    out.C16 = { f: `IF(AND(${cols.map((_, i) => `${S("pnl")}${pnlColumnLetter(model, i)}6=${S("monthly")}${pnlColumnLetter(model, i)}6`).join(",")}),0,1)` };
  }
  if (has("debtLike")) out.C19 = { f: `COUNTIFS(${S("debtLike")}$B:$B,"*eposit*",${S("debtLike")}$D:$D,"Debt-like")+COUNTIFS(${S("debtLike")}$B:$B,"*eferred*",${S("debtLike")}$D:$D,"Debt-like")` };
  if (has("valuation") && has("deal")) out.C28 = { f: `MIN(0,${S("valuation")}$C$${rowOf("valuation", "loanPrincipal")}:$E$${rowOf("valuation", "loanPrincipal")},${S("deal")}$C$${rowOf("deal", "seniorLoan")})` };
  if (model.granularity === "annual" && has("assumptions")) {
    const g = (c: string) => `${S("assumptions")}$${c}$${rowOf("assumptions", "scenarioGrowth")}`;
    const m = (key: string, c: string) => `${S("assumptions")}$${c}$${rowOf("assumptions", key)}`;
    const drivers = ["scenario_cogs", "scenario_payroll", "scenario_rent", "scenario_marketing", "scenario_otherOpex"];
    const differs = (c: string) => `AND(${g(c)}<>${g("D")},OR(${drivers.map((d) => `${m(d, c)}<>${m(d, "D")}`).join(",")}))`;
    out.C29 = { f: `IF(AND(${differs("C")},${differs("E")}),0,1)` };
  }
  if (has("sensitivities")) out.C30 = { f: `ABS(${S("sensitivities")}$C$${rowOf("sensitivities", "tie_valuation")})+ABS(${S("sensitivities")}$C$${rowOf("sensitivities", "tie_dscr")})+ABS(${S("sensitivities")}$C$${rowOf("sensitivities", "tie_closingCash")})` };
  if (has("revenue") && has("expense")) {
    out.C34 = { f: `ABS(${S("revenue")}$C$${rowOf("revenue", "stripCheck")})+ABS(${S("expense")}$C$${rowOf("expense", "stripCheck")})` };
    out.C35 = { f: `ABS(${S("revenue")}$C$${rowOf("revenue", "stripHeaderCheck")})+ABS(${S("expense")}$C$${rowOf("expense", "stripHeaderCheck")})` };
  }
  out.C36 = { f: `IF(${A("loiDate")}="","n.a.",IF(AND(${A("effectiveDate")}<>"",${A("effectiveDate")}<=${A("loiDate")}+${A("exclusivityDays")}),0,1))` };
  return out;
}

/** Column letter of the i-th historical column on the standard period block (spacers included). */
export function pnlColumnLetter(model: ModelOutput, i: number): string {
  const hist = model.columns.filter((c) => !c.projected);
  let col = 3;
  let prevGroup = hist[0]!.group;
  for (let k = 0; k <= i; k++) {
    const g = hist[k]!.group;
    if (k > 0 && g !== prevGroup && !(prevGroup === "LTM" && g === "PF")) col++;
    if (k > 0) col++;
    prevGroup = g;
  }
  return colLetter(col);
}

function spacerCount(model: ModelOutput): number {
  const hist = model.columns.filter((c) => !c.projected);
  let n = 0;
  for (let k = 1; k < hist.length; k++) if (hist[k]!.group !== hist[k - 1]!.group && !(hist[k - 1]!.group === "LTM" && hist[k]!.group === "PF")) n++;
  return n;
}
