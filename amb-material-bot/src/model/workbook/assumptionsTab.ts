// The Assumptions tab (guide 5.1 row 4): every input, blue, each with a
// Source column; the derived dates and the latest fiscal year every period
// tab reads; the projection drivers by year; valuation multiples; deal
// terms; sensitivity settings; and, in annual-only mode, the Pro Forma
// Low / Mid / High scenario block.

import { monthEndDate, type KpiSeries } from "../../domain/financials.ts";
import type { Assumptions } from "../assumptions.ts";
import { excelSerial, firstDayOf, latestFullFiscalYear } from "../periods.ts";
import { addr, colLetter, rowOf, SheetBuilder, type CellSpec } from "../sheet.ts";
import { FMT, WIDTH } from "../styles.ts";
import type { ModelOutput } from "../types.ts";
import { ASSUMPTION_COL, S, SHEET } from "./layout.ts";

const C = ASSUMPTION_COL;
const SOURCE_COL = 9;
const LAST_VALUE_COL = 7;

export interface TabContext {
  model: ModelOutput;
  a: Assumptions;
  codeName: string;
  businessName: string;
  asOfLabel: string;
  masterToggle: string;
  /** Coded customers and employees for the helper blocks (from the dataset; empty when planning for verification only). */
  customers: { id: string; startDate?: string; endDate?: string; revenueByFiscalYear: Record<number, number> }[];
  employees: { id: string; department: string; hireDate: string; terminationDate?: string; isOwner: boolean }[];
  /** Fiscal-year revenue columns of Raw - Customers, in order (`customerYears`). */
  customerYears: number[];
  /** Operating metrics the sources state (members, rating, fleet), for the Summary's management-facts table. */
  kpis: KpiSeries[];
}

export function planAssumptions(ctx: TabContext): SheetBuilder {
  const { model, a } = ctx;
  const b = new SheetBuilder("assumptions", SHEET.assumptions);
  b.width(2, WIDTH.labelWide);
  for (let c = C; c <= LAST_VALUE_COL; c++) b.width(c, 11);
  b.spacerCol(8);
  b.width(SOURCE_COL, WIDTH.notes);
  b.anatomy({ subtitle: "Assumptions and inputs ($ unless stated)", lastCol: SOURCE_COL, toggleCol: LAST_VALUE_COL, masterToggle: ctx.masterToggle });
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
    b.cell(r, C, { v: v === "" ? null : v, role: "input", fmt, align: typeof v === "string" ? { horizontal: "right" } : undefined, ...extra });
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
  input("firstDataMonth", "First data month", excelSerial(firstDayOf(a.firstDataMonth)), FMT.date, "First month of the Monthly P&L grid (guide 5.2)");
  input("sourceGranularity", "Source granularity", a.sourceGranularity === "monthly" ? "Monthly" : "Annual", undefined, "Monthly when 12 or more contiguous months exist (guide 5.2A)");
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
  input("units", "Units on analysis tabs", a.units, undefined, "Databook divides raw dollars by 1,000 (guide 5.2)");
  input("customerTerm", "Customer term", a.customerTerm, undefined, "One term per deal (guide D11)");
  input("mainStreetMode", "Main Street mode (1 = yes)", a.recast.mainStreetMode ? 1 : 0, FMT.term, a.recast.mainStreetSource);
  input("mainStreetThreshold", "Main Street threshold (PF Adj. EBITDA before reserve)", 1_000_000, FMT.currency, "Guide Q7: below $1.0M the CIM shows SDE and the model deducts a capital reserve");
  input("dealForm", "Deal form", a.recast.dealForm === "asset_purchase" ? "Asset purchase" : "Equity purchase", undefined, a.recast.dealFormSource);
  spacer();

  section("Owner compensation and capital reserve");
  input("replacementSalary", "Owner replacement salary", a.recast.replacementSalary, FMT.currency, a.recast.replacementSalarySource);
  input("burdenPct", "Payroll taxes and benefits burden", a.recast.burdenPct, FMT.pct1, a.recast.burdenSource);
  derived("replacementCost", "Market replacement compensation [S2]", `${here("replacementSalary")}*(1+${here("burdenPct")})`, FMT.currency, a.recast.replacementSalary * (1 + a.recast.burdenPct), "Salary × (1 + burden); deducted below SDE");
  input("capitalReserve", "Capital reserve (maintenance capex) [S3]", a.recast.capitalReserve, FMT.currency, a.recast.capitalReserveSource);
  input("capitalReserveBasis", "Capital reserve basis", a.recast.capitalReserveBasis === "form_4562" ? "Form 4562" : a.recast.capitalReserveBasis === "da_proxy" ? "D&A proxy" : a.recast.capitalReserveBasis === "advisor" ? "Advisor" : "None", undefined, "Form 4562 equipment placed in service, else the three-year average of D&A flagged as a proxy (guide 5.4)");
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
  input("structurePreset", "Structure preset", d.structurePreset, undefined, "Traditional: cash plus a seller note (guide 5.5); a preset only fills defaults");
  input("cashAtClosePct", "Cash at close, % of price", d.cashAtClosePct, FMT.pct, "AMB precedent 70-80% cash up front (MISC, ICP5)");
  input("sellerNotePct", "Seller note, % of price", d.sellerNotePct, FMT.pct, "ICP5; subordinated to senior debt only (BENP)");
  input("sellerNoteTermMonths", "Seller note term (months)", d.sellerNoteTermMonths, FMT.term, "ICP5: 18-month term, quarterly payments");
  input("sellerNoteRate", "Seller note interest rate", d.sellerNoteRate, FMT.rate, "ICP5: 9.0%; TCC buy-side used 6.5% as the low case");
  input("escrowPct", "Indemnity escrow, % of cash at close", d.escrowPct, FMT.pct, "LOI12 §7(h); market 5-10% for 12-18 months (TAX)");
  input("escrowMonths", "Indemnity escrow held (months)", d.escrowMonths, FMT.term, "LOI12 §7(h): 15 months");
  input("equityInjectionPct", "Buyer equity injection, % of uses", d.equityInjectionPct, FMT.pct, "SBA 7(a) minimum 10%; SUN used 15%");
  input("loanTermYears", "Senior / SBA loan term (years)", d.loanTermYears, FMT.term, "SBA 7(a) business acquisition: 10 years");
  input("loanRate", "Senior / SBA loan interest rate", d.loanRate, FMT.rate, "Lender quote pending; placeholder");
  input("transactionFees", "Buyer transaction fees ($)", d.transactionFees, FMT.currency, "No AMB default; buyer one-time costs on a $3.0M deal run $110-300K (BL)");
  input("reconciliationHoldbackMonths", "Reconciliation holdback (months of payroll)", d.reconciliationHoldbackMonths, FMT.oneDp, "ICP5: one month of payroll on an asset purchase; zero on an equity purchase");
  input("deferredCapex", "Deferred capex / renovation ($)", d.deferredCapex, FMT.currency, "Enter known deferred maintenance; adds to Total Investment");
  input("loiDate", "LOI date", "", FMT.date, "Enter when the LOI is signed (check C36)");
  input("exclusivityDays", "Exclusivity (days)", 90, FMT.term, "LOI12 Agreement §1: 90 days plus one automatic 30-day extension");
  input("signingDate", "Target signing date", "", FMT.date, "LOI + 9-11 weeks (OUTL)");
  input("effectiveDate", "Target effective date", "", FMT.date, "Signing + 0-15 days; first business day of the next tax year near year-end (RECS #8)");
  spacer();

  section("Sensitivity settings");
  const s = a.sensitivity;
  input("multipleStep", "Multiple axis step (x)", s.multipleStep, FMT.multiple2, "Per AMB; axes centre on the base case (guide 5.5)");
  input("earningsStepPct", "Earnings axis step (% of base)", s.earningsStepPct, FMT.pct, "Per AMB");
  input("priceStepPct", "Purchase price axis step (% of base)", s.priceStepPct, FMT.pct, "Per AMB");
  input("rateStep", "Interest rate axis step", s.rateStep, FMT.rate, "Per AMB");
  input("cashPctStep", "Cash at close axis step", s.cashPctStep, FMT.pct, "Per AMB");
  input("roundingDigits", "Rounding, $ tables (digits at $000s)", s.roundingDigits, FMT.term, "0 = nearest $1K on the $000s grids");
  input("gradientBands", "Gradient bands (#)", s.gradientBands, FMT.term, "Heat-map bands above the hurdle (guide 5.5)");
  input("dscrHurdle", "DSCR hurdle (x)", s.dscrHurdle, FMT.multiple2, "SBA lenders underwrite to 1.25x");

  if (a.sourceGranularity === "annual") {
    spacer();
    section("Pro forma scenarios (annual-only mode)");
    b.row("scenarioHeader", r);
    b.text(r, 2, "Driver", { font: { bold: true } });
    ["Low", "Mid", "High"].forEach((h, i) => b.text(r, C + i, h, { font: { bold: true }, align: { horizontal: "right" } }));
    for (let c = 2; c <= LAST_VALUE_COL; c++) b.cell(r, c, { border: { bottom: "thin" } });
    r++;
    const sc = a.scenarios;
    b.row("scenarioGrowth", r);
    b.text(r, 2, "Revenue growth (%)", { align: { indent: 1 } });
    [sc.low, sc.mid, sc.high].forEach((x, i) => b.num(r, C + i, x.revenueGrowth, { fmt: FMT.pct1 }));
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
      [sc.low, sc.mid, sc.high].forEach((x, i) => b.cell(r, C + i, { v: x.methods[m.key], role: "input", align: { horizontal: "right" } }));
      b.note(r, SOURCE_COL, "3-year average / Latest year / % of sales, 3-year blended (guide 5.5)");
      r++;
    }
    b.row("scenarioMultiple", r);
    b.text(r, 2, "Valuation multiple (x SDE)", { align: { indent: 1 } });
    [sc.low, sc.mid, sc.high].forEach((x, i) => b.num(r, C + i, x.multiple, { fmt: FMT.multiple }));
    b.note(r, SOURCE_COL, a.multiplesSource);
    r++;
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
  return b;
}

/** Cell reference on Assumptions for another tab's formula. */
export const A = (key: string): string => `${S("assumptions")}$C$${rowOf("assumptions", key)}`;
/** A projection-year driver cell (year index 0..4), or a Low / Mid / High cell (index 0..2). */
export const A_AT = (key: string, i: number): string => `${S("assumptions")}$${colLetter(ASSUMPTION_COL + i)}$${rowOf("assumptions", key)}`;
