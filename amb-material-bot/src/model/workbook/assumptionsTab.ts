// The Assumptions tab (guide 5.1 row 4): every input, blue, each with a
// Source column; the derived dates and the latest fiscal year every period
// tab reads; the projection drivers by year; valuation multiples; deal
// terms; sensitivity settings; and, in Main Street mode, the Pro Forma
// Low / Mid / High scenario block.

import { monthEndDate, parsePeriodKey, periodLabel, type KpiSeries } from "../../domain/financials.ts";
import { scenarioInput, type Assumptions, type ScenarioFinancingKey } from "../assumptions.ts";
import { excelSerial, firstDayOf, latestFullFiscalYear } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder, wrappedLines, type CellSpec } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import { ASSUMPTION_COL, S, SHEET } from "./layout.ts";
import { EMPLOYER_TAX, socialSecurityWageBase } from "../../ingest/payroll.ts";

const C = ASSUMPTION_COL;
const SOURCE_COL = 9;
const LAST_VALUE_COL = 7;
/** Width of the scenario block's Low / Mid / High columns. */
const SCENARIO_WIDTH = 16;
/** The scenario block's Basis column (guide 5.5: Driver | Low | Mid | High | Basis | Source), after High. */
const SCENARIO_BASIS_COL = C + 3;

export interface TabContext {
  model: ModelOutput;
  a: Assumptions;
  codeName: string;
  businessName: string;
  asOfLabel: string;
  masterToggle: string;
  /** Coded customers and employees for the helper blocks (from the dataset; empty when planning for verification only). */
  customers: { id: string; startDate?: string; endDate?: string; revenueByFiscalYear: Record<number, number> }[];
  employees: { id: string; department: string; hireDate: string; terminationDate?: string; isOwner: boolean; fte: number }[];
  /** Fiscal-year revenue columns of Raw - Customers, in order (`customerYears`). */
  customerYears: number[];
  /** Operating metrics the sources state (members, rating, fleet), for the Summary's management-facts table. */
  kpis: KpiSeries[];
}

export function planAssumptions(ctx: TabContext): SheetBuilder {
  const { model, a } = ctx;
  const b = new SheetBuilder("assumptions", SHEET.assumptions);
  b.width(2, WIDTH.labelWide);
  // The scenario block's Low / Mid / High columns hold method names ("Latest year"), which need the width.
  for (let c = C; c <= LAST_VALUE_COL; c++) b.width(c, model.scenarios && c < C + 3 ? SCENARIO_WIDTH : 11);
  b.spacerCol(8);
  b.width(SOURCE_COL, WIDTH.notes);
  b.anatomy({ subtitle: "Assumptions and Inputs ($ unless stated)", lastCol: SOURCE_COL, toggleCol: LAST_VALUE_COL, masterToggle: ctx.masterToggle });
  b.text(3, LAST_VALUE_COL - 1, "Print", { align: { horizontal: "right" } });

  b.tier1(5, [{ from: C, to: LAST_VALUE_COL, label: "Inputs" }, { from: SOURCE_COL, to: SOURCE_COL, label: "Source" }]);
  b.tier2(6, { from: C, to: LAST_VALUE_COL }, [{ col: C, v: "Value" }], "Assumption");
  b.cell(6, SOURCE_COL, { style: "header", v: "Source", role: "text", align: { horizontal: "left" } });

  let r = 8;
  const section = (label: string) => {
    b.section(r, label, [[C, LAST_VALUE_COL], [SOURCE_COL, SOURCE_COL]]);
    r++;
  };
  const spacer = () => {
    b.spacerRow(r);
    r++;
  };
  const input = (key: string, label: string, v: number | string, fmt: string | undefined, source: string, extra: CellSpec = {}) => {
    b.row(key, r);
    b.text(r, 2, label, { align: { indent: 1 } });
    // A short text input sits right like the figures; a longer one starts at the left edge and runs into the empty cells beside it rather than being cut by the label.
    b.cell(r, C, { v: v === "" ? null : v, role: "input", fmt, align: typeof v === "string" ? { horizontal: v.length > 11 ? "left" : "right" } : undefined, ...extra });
    b.note(r, SOURCE_COL, source);
    r++;
  };
  const derived = (key: string, label: string, f: string, fmt: string | undefined, expect: number | string, source: string, role: CellSpec["role"] = "calc") => {
    b.row(key, r);
    b.text(r, 2, label, { align: { indent: 1 } });
    b.formula(r, C, f, { fmt, expect, role, label });
    b.note(r, SOURCE_COL, source);
    r++;
  };
  const here = (key: string) => addr(b.r(key), C, { row: true, col: true });

  section("Model information");
  input("asOfDate", "As-of date (last full month of data)", excelSerial(a.asOfDate), FMT.date, `${a.sourceGranularity === "monthly" ? model.assumptions?.firstDataMonth ? "Monthly P&L" : "P&L" : "Annual P&L"} to ${a.asOfMonth}; fixed by the bot, never TODAY()`);
  input("firstDataMonth", "First data month", excelSerial(firstDayOf(a.firstDataMonth)), FMT.date, "First month of the Monthly P&L grid");
  input("sourceGranularity", "Source granularity", a.sourceGranularity === "monthly" ? "Monthly" : "Annual", undefined, "Monthly when the books give 12 or more contiguous months");
  input("booksBasis", "Books basis", a.booksBasis === "cash" ? "Cash" : a.booksBasis === "accrual" ? "Accrual" : "Unconfirmed", undefined, a.booksBasis === "unconfirmed" ? "Not stated by any source; confirm with the seller" : "Per the source report basis");
  derived("ltmEndMonth", "LTM end month", `EOMONTH(${here("asOfDate")},0)`, FMT.monthHeader, excelSerial(monthEndDate(a.asOfMonth)), "Derived: EOMONTH(AsOfDate, 0)");
  input("fyeMonth", "Fiscal year-end month (1-12)", a.fiscalYearEndMonth, FMT.term, "Request list fiscal_year_end");
  derived(
    "latestFy",
    "Latest full fiscal year",
    `YEAR(${here("asOfDate")})+IF(MONTH(${here("asOfDate")})>${here("fyeMonth")},1,0)-IF(MONTH(${here("asOfDate")})=${here("fyeMonth")},0,1)`,
    FMT.term,
    latestFullFiscalYear(a.asOfMonth, a.fiscalYearEndMonth),
    "Derived from the as-of date and fiscal year-end",
  );
  input("units", "Units on analysis tabs", a.units, undefined, "Databook divides raw dollars by 1,000");
  input("customerTerm", "Customer term", a.customerTerm, undefined, "One term per deal, on every tab and in the CIM");
  input("mainStreetMode", "Main Street mode (1 = yes)", a.recast.mainStreetMode ? 1 : 0, FMT.term, a.recast.mainStreetSource);
  // Read by the bot when it sets the mode above, not by a formula (the mode drives the reserve the measure excludes), so grey.
  input("mainStreetThreshold", "Main Street threshold (PF Adj. EBITDA before reserve)", 1_000_000, FMT.currency, "Reference: below $1.0M the bot sets Main Street mode above (SDE in the CIM, capital reserve deducted); change the mode cell to override", { role: "helper" });
  input("dealForm", "Deal form", a.recast.dealForm === "asset_purchase" ? "Asset purchase" : "Equity purchase", undefined, a.recast.dealFormSource);
  spacer();

  section("Owner compensation and capital reserve");
  input("replacementSalary", "Owner replacement salary", a.recast.replacementSalary, FMT.currency, a.recast.replacementSalarySource);
  input("burdenPct", "Payroll taxes and benefits burden", a.recast.burdenPct, FMT.pct1, a.recast.burdenSource);
  derived("replacementCost", "Market replacement compensation [S2]", `${here("replacementSalary")}*(1+${here("burdenPct")})`, FMT.currency, a.recast.replacementSalary * (1 + a.recast.burdenPct), "Salary × (1 + burden); deducted below SDE");
  input("capitalReserve", "Capital reserve (maintenance capex) [S3]", a.recast.capitalReserve, FMT.currency, a.recast.capitalReserveSource);
  input("capitalReserveBasis", "Capital reserve basis", a.recast.capitalReserveBasis === "form_4562" ? "Form 4562" : a.recast.capitalReserveBasis === "da_proxy" ? "D&A proxy" : a.recast.capitalReserveBasis === "advisor" ? "Advisor" : "None", undefined, "Form 4562 equipment placed in service, else the three-year average of D&A flagged as a proxy");
  spacer();

  section("Projection drivers");
  b.row("projectionHeader", r);
  b.text(r, 2, "Driver", { font: { bold: true } });
  a.projectionYears.forEach((y, i) => b.text(r, C + i, `FY${y}E`, { font: { bold: true }, align: { horizontal: "right" } }));
  b.cell(r, 2, { border: { bottom: "thin" } });
  for (let c = C; c <= LAST_VALUE_COL; c++) b.cell(r, c, { border: { bottom: "thin" } });
  r++;
  const drivers: { key: keyof Assumptions; label: string; fmt: string }[] = [
    { key: "revenueGrowth", label: "Revenue growth", fmt: FMT.pct1 },
    { key: "cogsPct", label: "Cost of goods sold, % of revenue", fmt: FMT.pct1 },
    { key: "payrollPct", label: "Salaries, wages and benefits, % of revenue", fmt: FMT.pct1 },
    { key: "ownerComp", label: "Owner / officer compensation ($)", fmt: FMT.currency },
    { key: "rentPct", label: "Rent and occupancy, % of revenue", fmt: FMT.pct1 },
    { key: "marketingPct", label: "Advertising and marketing, % of revenue", fmt: FMT.pct1 },
    { key: "otherOpexPct", label: "Other operating expenses, % of revenue", fmt: FMT.pct1 },
    { key: "daPct", label: "Depreciation and amortization, % of revenue", fmt: FMT.pct1 },
    { key: "capexPct", label: "Capital expenditures, % of revenue", fmt: FMT.pct1 },
    { key: "dso", label: "Receivable days (DSO)", fmt: FMT.days },
    { key: "dio", label: "Inventory days (DIO)", fmt: FMT.days },
    { key: "dpo", label: "Payable days (DPO)", fmt: FMT.days },
    { key: "interestRate", label: "Interest rate on opening debt", fmt: FMT.rate },
    { key: "debtRepayment", label: "Scheduled debt repayment ($)", fmt: FMT.currency },
    { key: "taxRate", label: "Entity income tax rate", fmt: FMT.pct1 },
    { key: "distributionsPct", label: "Owner distributions, % of net income", fmt: FMT.pct1 },
  ];
  for (const d of drivers) {
    b.row(d.key, r);
    b.text(r, 2, d.label, { align: { indent: 1 } });
    (a[d.key] as number[]).forEach((v, i) => b.num(r, C + i, v, { fmt: d.fmt }));
    b.note(r, SOURCE_COL, a.notes[d.key] ?? "");
    r++;
  }
  spacer();

  section("Valuation multiples");
  b.row("multiplesHeader", r);
  b.text(r, 2, "Multiple", { font: { bold: true } });
  ["Low", "Mid", "High"].forEach((h, i) => b.text(r, C + i, h, { font: { bold: true }, align: { horizontal: "right" } }));
  for (let c = 2; c <= LAST_VALUE_COL; c++) b.cell(r, c, { border: { bottom: "thin" } });
  r++;
  b.row("sdeMultiples", r);
  b.text(r, 2, "SDE multiple (x)", { align: { indent: 1 } });
  a.sdeMultiples.forEach((v, i) => b.num(r, C + i, v, { fmt: FMT.multiple }));
  b.note(r, SOURCE_COL, a.multiplesSource);
  r++;
  b.row("ebitdaMultiples", r);
  b.text(r, 2, "Adj. EBITDA multiple (x)", { align: { indent: 1 } });
  a.ebitdaMultiples.forEach((v, i) => b.num(r, C + i, v, { fmt: FMT.multiple }));
  b.note(r, SOURCE_COL, a.multiplesSource);
  r++;
  spacer();

  section("Deal terms (Structure 1)");
  const d = a.deal;
  input("structurePreset", "Structure preset", d.structurePreset, undefined, "Reference: Traditional is cash plus a seller note; the preset filled the defaults below when the bot ran", { role: "helper" });
  input("cashAtClosePct", "Cash at close, % of price", d.cashAtClosePct, FMT.pct, "AMB default: 70-80% cash at close, per recent AMB offers");
  input("sellerNotePct", "Seller note, % of price", d.sellerNotePct, FMT.pct, "Per recent AMB offers; subordinated to senior debt only");
  input("sellerNoteTermMonths", "Seller note term (months)", d.sellerNoteTermMonths, FMT.term, "Per recent AMB offers: 18-month term, quarterly payments");
  input("sellerNoteRate", "Seller note interest rate", d.sellerNoteRate, FMT.rate, "Per recent AMB offers: 9.0%; a recent buy-side model used 6.5% as the low case");
  input("escrowPct", "Indemnity escrow, % of cash at close", d.escrowPct, FMT.pct, "LOI12 §7(h); market 5-10% for 12-18 months (TAX)");
  input("escrowMonths", "Indemnity escrow held (months)", d.escrowMonths, FMT.term, "LOI12 §7(h): 15 months");
  input("equityInjectionPct", "Buyer equity injection, % of uses", d.equityInjectionPct, FMT.pct, "SBA 7(a) minimum 10%; a recent AMB deal used 15%");
  input("loanTermYears", "Senior / SBA loan term (years)", d.loanTermYears, FMT.term, "SBA 7(a) business acquisition: 10 years");
  // No file in AMB's library gives SBA terms (guide 5.5, Q16): the rate is a placeholder in Pending red until a lender quotes.
  input("loanRate", "Senior / SBA loan interest rate", d.loanRate, FMT.rate, "Placeholder until a lender quotes; replace before relying on DSCR", { role: "pending" });
  input("transactionFees", "Buyer transaction fees ($)", d.transactionFees, FMT.currency, "No AMB default; buyer one-time costs on a $3.0M deal run $110-300K (BL)");
  input("reconciliationHoldbackMonths", "Reconciliation holdback (months of payroll)", d.reconciliationHoldbackMonths, FMT.oneDp, "Per recent AMB offers: one month of payroll on an asset purchase; zero on an equity purchase");
  input("deferredCapex", "Deferred capex / renovation ($)", d.deferredCapex, FMT.currency, "Enter known deferred maintenance; adds to Total Investment");
  input("trueUpSettlement", "True-up settlement", d.trueUpSettlement, undefined, "Cash / Stock / Share-adjusting escrow; Stock when buyer stock is meant to be tax-deferred");
  input("stockTaxDeferred", "Stock consideration intended tax-deferred? (Y/N)", d.stockTaxDeferred ? "Y" : "N", undefined, "Y turns on the boot flag on Deal Structure");
  input("deferredRevenueTreatment", "Deferred revenue and customer deposits", d.deferredRevenueTreatment, undefined, "AMB default: NWC (operating liability); Debt-like is an override that needs a note");
  input("premisesArrangement", "Premises arrangement", d.premisesArrangement || "[Confirm]", undefined, d.premisesArrangement ? "Intake: locations" : "[Confirm: leased from a third party or owned by the seller]", d.premisesArrangement ? {} : { role: "pending" });
  input("loiDate", "LOI date", "", FMT.date, "Enter when the LOI is signed (check C36)");
  input("exclusivityDays", "Exclusivity (days)", 90, FMT.term, "LOI12 Agreement §1: 90 days plus one automatic 30-day extension");
  input("signingDate", "Target signing date", "", FMT.date, "LOI + 9-11 weeks (OUTL)");
  input("effectiveDate", "Target effective date", "", FMT.date, "Signing + 0-15 days; first business day of the next tax year near year-end (RECS #8)");
  spacer();

  section("Sensitivity settings");
  const s = a.sensitivity;
  input("multipleStep", "Multiple axis step (x)", s.multipleStep, FMT.multiple2, "Per AMB; axes centre on the base case");
  input("earningsStepPct", "Earnings axis step (% of base)", s.earningsStepPct, FMT.pct, "Per AMB");
  input("priceStepPct", "Purchase price axis step (% of base)", s.priceStepPct, FMT.pct, "Per AMB");
  input("rateStep", "Interest rate axis step", s.rateStep, FMT.rate, "Per AMB");
  input("cashPctStep", "Cash at close axis step", s.cashPctStep, FMT.pct, "Per AMB");
  input("roundingDigits", "Rounding, $ tables (digits at $000s)", s.roundingDigits, FMT.term, "0 = nearest $1K on the $000s grids");
  input("gradientBands", "Gradient bands (#)", s.gradientBands, FMT.term, "Heat-map bands above the hurdle");
  input("dscrHurdle", "DSCR hurdle (x)", s.dscrHurdle, FMT.multiple2, "SBA lenders underwrite to 1.25x");

  if (ctx.model.scenarios) {
    const annualOnly = a.sourceGranularity === "annual";
    const base = annualOnly ? `FY${ctx.model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).at(-1)!.fiscalYear}` : ctx.model.valuationDetail!.period.label;
    spacer();
    section(`Pro forma scenarios (Main Street mode; base ${base})`);
    b.row("scenarioHeader", r);
    b.text(r, 2, "Driver", { font: { bold: true } });
    ["Low", "Mid", "High"].forEach((h, i) => b.text(r, C + i, h, { font: { bold: true }, align: { horizontal: "right" } }));
    b.text(r, SCENARIO_BASIS_COL, "Basis", { font: { bold: true }, align: { horizontal: "left", indent: 1 } });
    for (let c = 2; c <= LAST_VALUE_COL; c++) b.cell(r, c, { border: { bottom: "thin" } });
    r++;
    const sc = a.scenarios;
    const basis = (text: string) => b.text(r, SCENARIO_BASIS_COL, text, { align: { horizontal: "left", indent: 1, wrap: false } });
    b.row("scenarioGrowth", r);
    b.text(r, 2, "Revenue growth (%)", { align: { indent: 1 } });
    [sc.low, sc.mid, sc.high].forEach((x, i) => b.num(r, C + i, x.revenueGrowth, { fmt: FMT.pct1 }));
    basis("Per AMB, by case");
    b.note(r, SOURCE_COL, "Mid is the base case; Low and High must differ from Mid on growth and one operating driver (check C29)");
    r++;
    const methods: { key: keyof typeof sc.mid.methods; label: string }[] = [
      { key: "cogs", label: "Cost of goods sold method" },
      { key: "payroll", label: "Salaries, wages and benefits method" },
      { key: "rent", label: "Rent and occupancy method" },
      { key: "marketing", label: "Advertising and marketing method" },
      { key: "otherOpex", label: "Other operating expenses method" },
    ];
    for (const m of methods) {
      b.row(`scenario_${m.key}`, r);
      b.text(r, 2, m.label, { align: { indent: 1 } });
      // The longest method name takes two lines rather than being cut at the column edge.
      [sc.low, sc.mid, sc.high].forEach((x, i) => b.cell(r, C + i, { v: x.methods[m.key], role: "input", align: { horizontal: "right", wrap: wrappedLines(x.methods[m.key], SCENARIO_WIDTH) > 1 || undefined } }));
      basis("Fixed method list (5.5)");
      b.note(r, SOURCE_COL, `3-year average, Latest year or % of sales${annualOnly ? "" : `; Latest year reads ${base}`}`);
      r++;
    }
    // The per-case recast and financing inputs (guide 5.5): each case links to the base input above until the advisor types its own,
    // and the Valuation tab's financing rows read them by case.
    const financing: { key: ScenarioFinancingKey; label: string; base: string; fmt: string }[] = [
      { key: "replacementSalary", label: "Owner replacement salary ($)", base: "replacementSalary", fmt: FMT.currency },
      { key: "capitalReserve", label: "Capital reserve ($)", base: "capitalReserve", fmt: FMT.currency },
      { key: "deferredCapex", label: "Deferred capex / renovation ($)", base: "deferredCapex", fmt: FMT.currency },
      { key: "equityInjectionPct", label: "Equity injection (%)", base: "equityInjectionPct", fmt: FMT.pct },
      { key: "loanTermYears", label: "Loan term (years)", base: "loanTermYears", fmt: FMT.term },
      { key: "loanRate", label: "Interest rate (%)", base: "loanRate", fmt: FMT.rate },
    ];
    for (const x of financing) {
      b.row(`scenario_${x.key}`, r);
      b.text(r, 2, x.label, { align: { indent: 1 } });
      const own = [sc.low, sc.mid, sc.high].map((d) => d.financing?.[x.key]);
      own.forEach((v, i) => {
        if (v !== undefined) b.num(r, C + i, v, { fmt: x.fmt });
        else b.formula(r, C + i, here(x.base), { fmt: x.fmt, role: "inSheet", expect: scenarioInput(a, [sc.low, sc.mid, sc.high][i]!, x.key), label: `scenario ${x.key} ${i}` });
      });
      basis(own.some((v) => v !== undefined) ? "Per AMB, by case" : "Base input above");
      b.note(r, SOURCE_COL, "Base input above; type over a case to vary it");
      r++;
    }
    b.row("scenarioMultiple", r);
    b.text(r, 2, "Valuation multiple (x SDE)", { align: { indent: 1 } });
    // One input per multiple: the block reads the valuation multiples above rather than holding a second copy that could disagree.
    a.sdeMultiples.forEach((v, i) => b.formula(r, C + i, addr(b.r("sdeMultiples"), C + i), { fmt: FMT.multiple, role: "inSheet", expect: v, label: `scenario multiple ${i}` }));
    basis("Valuation multiples above");
    b.note(r, SOURCE_COL, "Valuation multiples above");
    r++;
  }

  // [S4] at statutory rates is a formula on [S1] and these inputs, one wage base per fiscal year (Social Security's changes yearly).
  const statutory = model.adjustments.find((x) => x.row.statutoryTaxesOn);
  if (statutory) {
    spacer();
    section(`Employer payroll taxes on the owner's salary ([${statutory.row.ref}], federal statutory rates)`);
    input("taxSocialSecurity", "Social Security rate", EMPLOYER_TAX.socialSecurity, FMT.rate, "Employer share, federal statute");
    input("taxMedicare", "Medicare rate", EMPLOYER_TAX.medicare, FMT.rate, "Employer share, on all wages");
    input("taxFuta", "Federal unemployment (FUTA) rate", EMPLOYER_TAX.futa, FMT.rate, "Net of the state credit");
    input("taxFutaBase", "FUTA wage base", EMPLOYER_TAX.futaWageBase, FMT.currency, "First $7,000 of wages");
    for (const y of Object.keys(statutory.row.byFiscalYear).map(Number)) input(`taxSsBase_${y}`, `Social Security wage base, FY${y}`, socialSecurityWageBase(y), FMT.currency, `Calendar ${y} wage base`);
  }

  // The seller's operating facts are inputs like any other, so the Summary links them rather than typing them (QA round 2 F13).
  if (ctx.kpis.length) {
    spacer();
    section("Operating facts (per management)");
    for (const k of ctx.kpis) {
      const [key, value] = Object.entries(k.values).at(-1)!;
      const ref = parsePeriodKey(key);
      input(`kpi_${k.key}`, kpiLabel(k), value, KPI_FMT[k.unit], `Per management, ${ref.kind === "point" ? `as of ${periodLabel(ref)}` : periodLabel(ref)}${k.definition ? `. ${k.definition}` : ""}`);
    }
  }

  r++;
  b.note(r, 2, "Note: blue cells are inputs; black cells are derived. Every period label, window and ladder rung in the workbook reads these cells.");
  b.row("last", r);
  b.print({ area: `B2:${addr(r, SOURCE_COL)}`, landscape: false, fitToWidth: 1, fitToHeight: 0, titlesRow: "5:6" });
  b.furniture(ctx.codeName, ctx.asOfLabel);
  b.freeze(7, C);
  b.defineName("AsOfDate", `$C$${rowOf("assumptions", "asOfDate")}`);
  b.defineName("FYEMonth", `$C$${rowOf("assumptions", "fyeMonth")}`);
  b.defineName("MainStreetMode", `$C$${rowOf("assumptions", "mainStreetMode")}`);
  b.defineName("DealForm", `$C$${rowOf("assumptions", "dealForm")}`);
  b.defineName("LOIDate", `$C$${rowOf("assumptions", "loiDate")}`);
  b.defineName("SigningDate", `$C$${rowOf("assumptions", "signingDate")}`);
  b.defineName("EffectiveDate", `$C$${rowOf("assumptions", "effectiveDate")}`);
  return b;
}

/** Number format of an operating fact by its unit. */
export const KPI_FMT: Record<KpiSeries["unit"], string> = {
  count: FMT.body,
  currency: FMT.currency,
  percent: FMT.pct,
  ratio: FMT.oneDp,
  hours: FMT.body,
  rating: FMT.oneDp,
  sq_ft: FMT.body,
  miles: FMT.body,
};

/** An operating fact's label with its unit, so a bare figure ("Service radius 35") reads as what it counts. */
export function kpiLabel(k: Pick<KpiSeries, "label" | "unit">): string {
  const unit = { count: "#", sq_ft: "sq ft", miles: "miles", hours: "hours", ratio: "x" }[k.unit as string];
  return unit && !/\(.*\)$/.test(k.label) ? `${k.label} (${unit})` : k.label;
}

/** Cell reference on Assumptions for another tab's formula. */
export const A = (key: string): string => `${S("assumptions")}$C$${rowOf("assumptions", key)}`;
/** A projection-year driver cell (year index 0..4), or a Low / Mid / High cell (index 0..2). */
export const A_AT = (key: string, i: number): string => `${S("assumptions")}$${colLetter(ASSUMPTION_COL + i)}$${rowOf("assumptions", key)}`;
