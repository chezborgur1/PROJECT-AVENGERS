// Writes the AMB financial model workbook (guide section 5).
//
// planWorkbook builds one SheetPlan per tab, in the 5.1 order, from the
// engine's ModelOutput: every cell with its value or formula, style and the
// value the engine expects. writeWorkbook renders the plans with ExcelJS.
// verifyWorkbook rebuilds the same plans from the model and compares every
// expectation with an independent evaluation of the written file, so the
// writer and the verifier share one description of where every number sits.
//
// Colour code (guide 5.9): blue inputs, black calculations, green links to
// another sheet, purple in-sheet links, red checks, grey helpers. The Print
// toggle on each tab (master switch on Contents) turns them black through a
// conditional format over the print area.

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { SOURCE_LABELS, type FinancialDataset } from "../domain/financials.ts";
import type { RequestRow } from "../requests/schema.ts";
import type { Assumptions } from "./assumptions.ts";
import { dropEmptyNotesColumn, finalizeNotes, fitLabelColumn, resolveTokens, type CellSpec, type SheetPlan } from "./sheet.ts";
import { COLOR, FONT, MARGINS, ROLE_COLOR, ROW_HEIGHT, STYLES, argb, type FontSpec } from "./styles.ts";
import type { ModelOutput } from "./types.ts";
import { planAssumptions, type TabContext } from "./workbook/assumptionsTab.ts";
import { checkFormulas, planChecks } from "./workbook/checksTab.ts";
import { injectCharts } from "./charts.ts";
import { planChartTab } from "./workbook/chartTabs.ts";
import { customerYears, planDatabook, planDivider, planMapping, planMonthly, planRawBank, planRawBs, planRawCustomers, planRawPayroll, planRawPnl } from "./workbook/data.ts";
import { masterToggleRef, planContents, planCover, planSummary } from "./workbook/front.ts";
import { type SheetKey } from "./workbook/layout.ts";
import { planAdjustments, planLadder, planPnlSummary } from "./workbook/statements.ts";
import { planExpenseDetail, planRevenueDetail } from "./workbook/detail.ts";
import { planCohorts, planConcentration, planCustomerOverview, planRetention } from "./workbook/customersTabs.ts";
import { planHeadcount } from "./workbook/headcountTab.ts";
import { planBalanceSheet, planCashFlow, planDebtLike, planNwc, planProofOfCash } from "./workbook/balance.ts";
import { planProjections } from "./workbook/projections.ts";
import { planDealStructure, planOpportunities, planSensitivities, planValuation } from "./workbook/valuationTabs.ts";

export interface WorkbookContext {
  row: RequestRow;
  dataset: FinancialDataset;
  assumptions: Assumptions;
  model: ModelOutput;
  firmName: string;
  preparedOn: string;
  version?: string;
}

export interface PlanOptions {
  dataset?: FinancialDataset;
  codeName: string;
  businessName: string;
  firmName: string;
  preparedOn: string;
  version?: string;
  logoFile?: string;
}

export interface WorkbookPlan {
  plans: SheetPlan[];
  byKey: Partial<Record<SheetKey, SheetPlan>>;
}

/** The order of guide 5.1; tabs whose data is absent are left out. */
const TAB_ORDER: SheetKey[] = [
  "cover", "contents", "summary", "assumptions", "pnl", "ladder", "adjustments", "revenue", "revenueCharts", "expense", "expenseCharts",
  "customers", "retention", "retentionCharts", "concentration", "cohorts", "headcount", "headcountCharts",
  "bs", "nwc", "debtLike", "cashFlow", "proofOfCash", "projections", "opportunities",
  "valuation", "deal", "sensitivities", "checks", "divider", "monthly", "databook", "mapping",
  "rawPnl", "rawBs", "rawBank", "rawCustomers", "rawPayroll",
];

function asOfLabel(model: ModelOutput): string {
  const [y, m, d] = model.asOfDate.split("-");
  return `${m}/${d}/${y!.slice(2)}`;
}

/** Build every tab's plan from the model. The dataset is only needed for the raw tabs that carry names. */
export function planWorkbook(model: ModelOutput, opts: PlanOptions): WorkbookPlan {
  if (!model.assumptions) throw new Error("planWorkbook needs the engine's ModelOutput (with assumptions)");
  const ds = opts.dataset;
  const fiscalYears = model.columns.filter((c) => c.ref.kind === "fiscal_year" && !c.projected).map((c) => c.fiscalYear!);
  const ctx: TabContext = {
    model,
    a: model.assumptions,
    codeName: opts.codeName,
    businessName: opts.businessName,
    asOfLabel: asOfLabel(model),
    masterToggle: masterToggleRef(),
    customers: ds?.customers?.customers.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, revenueByFiscalYear: c.revenueByFiscalYear })) ?? [],
    employees: ds?.payroll?.employees.map((e) => ({ id: e.id, department: e.department, hireDate: e.hireDate, terminationDate: e.terminationDate, isOwner: e.isOwner })) ?? [],
    kpis: ds?.kpis ?? [],
    customerYears: customerYears(fiscalYears, ds?.customers),
  };
  const preparedLine = `Prepared by AMB Advisory Services LLC for ${opts.businessName} | ${longDate(opts.preparedOn)} | Confidential`;
  const version = opts.version ?? "v01";

  const planners: Partial<Record<SheetKey, () => ReturnType<typeof planSummary> | undefined>> = {
    cover: () => planCover(ctx, opts.logoFile, preparedLine),
    summary: () => planSummary(ctx),
    assumptions: () => planAssumptions(ctx),
    pnl: () => planPnlSummary(ctx),
    ladder: () => planLadder(ctx),
    adjustments: () => planAdjustments(ctx),
    revenue: () => planRevenueDetail(ctx),
    revenueCharts: () => planChartTab(ctx, "revenueCharts"),
    expense: () => planExpenseDetail(ctx),
    expenseCharts: () => planChartTab(ctx, "expenseCharts"),
    customers: () => planCustomerOverview(ctx),
    retention: () => planRetention(ctx),
    retentionCharts: () => planChartTab(ctx, "retentionCharts"),
    concentration: () => planConcentration(ctx),
    cohorts: () => planCohorts(ctx),
    headcount: () => planHeadcount(ctx),
    headcountCharts: () => planChartTab(ctx, "headcountCharts"),
    bs: () => planBalanceSheet(ctx),
    nwc: () => planNwc(ctx),
    debtLike: () => planDebtLike(ctx),
    cashFlow: () => planCashFlow(ctx),
    proofOfCash: () => planProofOfCash(ctx, ds),
    projections: () => planProjections(ctx),
    opportunities: () => planOpportunities(ctx, ds),
    valuation: () => planValuation(ctx),
    deal: () => planDealStructure(ctx),
    sensitivities: () => planSensitivities(ctx),
    divider: () => planDivider(),
    monthly: () => planMonthly(ctx),
    databook: () => planDatabook(ctx),
    mapping: () => planMapping(ctx),
    rawPnl: () => planRawPnl(model),
    rawBs: () => planRawBs(model),
    rawBank: () => (ds ? planRawBank(ds) : undefined),
    rawCustomers: () => (ds ? planRawCustomers(ds, ctx.customerYears) : undefined),
    rawPayroll: () => (ds ? planRawPayroll(ds, fiscalYears) : undefined),
  };
  const byKey: Partial<Record<SheetKey, SheetPlan>> = {};
  for (const key of TAB_ORDER) {
    const planner = planners[key];
    if (!planner) continue;
    const b = planner();
    if (b) byKey[key] = b.plan;
  }
  const builtKeys = new Set(Object.keys(byKey) as SheetKey[]);
  builtKeys.add("contents");
  builtKeys.add("checks");
  const order = TAB_ORDER.filter((k) => builtKeys.has(k));
  const sources = (ds?.provenance ?? []).map((p) => ({
    label: `Source, FY${p.year}`,
    value: p.balanceSheet === p.pnl ? `P&L and balance sheet: ${SOURCE_LABELS[p.pnl]}` : `P&L: ${SOURCE_LABELS[p.pnl]}${p.balanceSheet ? `; balance sheet: ${SOURCE_LABELS[p.balanceSheet]}` : ""}`,
  }));
  byKey.checks = planChecks(ctx, builtKeys, checkFormulas(model, byKey)).plan;
  byKey.contents = planContents(ctx, order, { preparedBy: opts.firmName, preparedOn: opts.preparedOn, version, sources }).plan;

  const plans = order.map((k) => byKey[k]!);
  for (const p of plans) {
    dropEmptyNotesColumn(p);
    fitLabelColumn(p);
    finalizeNotes(p);
  }
  resolveTokens(plans);
  return { plans, byKey };
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function defaultLogo(repoRoot: string): string | undefined {
  const file = path.join(repoRoot, "brand", "amb-logo-maroon-2048.png");
  return fs.existsSync(file) ? file : undefined;
}

/** Plan options each written model used, so `verifyWorkbook(file, model)` rebuilds the same plan without the caller repeating them. */
const writtenWith = new WeakMap<ModelOutput, PlanOptions>();

export function planOptionsUsedFor(model: ModelOutput): PlanOptions | undefined {
  return writtenWith.get(model);
}

export function planOptionsFor(ctx: WorkbookContext): PlanOptions {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  return {
    dataset: ctx.dataset,
    codeName: ctx.row.code_name,
    businessName: ctx.row.business_name,
    firmName: ctx.firmName,
    preparedOn: ctx.preparedOn,
    version: ctx.version,
    logoFile: defaultLogo(repoRoot),
  };
}

export async function writeWorkbook(ctx: WorkbookContext, file: string): Promise<WorkbookPlan> {
  const opts = planOptionsFor(ctx);
  const plan = planWorkbook(ctx.model, opts);
  await renderWorkbook(plan, file, { creator: ctx.firmName });
  writtenWith.set(ctx.model, opts);
  return plan;
}

// --- Rendering --------------------------------------------------------------------------------

export async function renderWorkbook(plan: WorkbookPlan, file: string, opts: { creator: string }): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.creator;
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const imageIds = new Map<string, number>();

  for (const p of plan.plans) {
    const ws = wb.addWorksheet(p.name, { properties: { tabColor: p.tabColor ? { argb: argb(p.tabColor) } : undefined, defaultRowHeight: ROW_HEIGHT.body, outlineProperties: { summaryBelow: false, summaryRight: false } } });
    ws.views = [
      p.freeze
        ? { state: "frozen", xSplit: p.freeze.col - 1, ySplit: p.freeze.row - 1, topLeftCell: `${colName(p.freeze.col)}${p.freeze.row}`, showGridLines: p.gridlines, zoomScale: 100 }
        : { showGridLines: p.gridlines, zoomScale: 100 },
    ];
    for (const [c, w] of p.widths) ws.getColumn(c).width = w;
    for (const [c, level] of p.colOutline) ws.getColumn(c).outlineLevel = level;
    for (const c of p.hiddenCols) ws.getColumn(c).hidden = true;
    for (const [r, h] of p.heights) ws.getRow(r).height = h;
    for (const [r, level] of p.rowOutline) ws.getRow(r).outlineLevel = level;
    for (const [key, spec] of p.cells) {
      const [r, c] = key.split(":").map(Number) as [number, number];
      renderCell(ws.getCell(r, c), spec);
    }
    for (const m of p.merges) ws.mergeCells(m);
    // Check-row rules first so they outrank the Print-mode rule (guide 5.9).
    let priority = 1;
    for (const rule of p.cf) {
      ws.addConditionalFormatting({
        ref: rule.ref,
        rules: [{ type: "expression", priority: priority++, formulae: [rule.formula], style: dxf(rule.font, rule.fill) }],
      });
    }
    if (p.toggle && p.output && p.print.areas.length) {
      const ref = (p.toggleRanges ?? p.print.areas).join(" ");
      ws.addConditionalFormatting({
        ref,
        rules: [{ type: "expression", priority: priority++, formulae: [`$${colName(p.toggle.col)}$${p.toggle.row}=1`], style: { font: { color: { argb: argb(COLOR.black) } } } }],
      });
    }
    if (p.print.areas.length) {
      ws.pageSetup = {
        orientation: p.print.landscape ? "landscape" : "portrait",
        paperSize: LETTER,
        ...(p.print.scale ? { fitToPage: false, scale: p.print.scale } : { fitToPage: true, fitToWidth: p.print.fitToWidth, fitToHeight: p.print.fitToHeight }),
        // ExcelJS prefixes "$" to each side's column only; writing "B$2" makes the whole reference absolute.
        printArea: p.print.areas.map((a) => a.replace(/([A-Z]+)(\d+)/g, "$1$$$2")).join("&&"),
        printTitlesRow: p.print.titlesRow,
        printTitlesColumn: p.print.titlesCol,
        margins: { ...MARGINS },
        horizontalCentered: true,
      };
      for (const r of p.print.rowBreaks) ws.getRow(r).addPageBreak();
    }
    if (p.header || p.footer) ws.headerFooter = { oddHeader: p.header ?? "", oddFooter: p.footer ?? "" };
    for (const img of p.images) {
      let id = imageIds.get(img.file);
      if (id === undefined) {
        id = wb.addImage({ filename: img.file, extension: "png" });
        imageIds.set(img.file, id);
      }
      ws.addImage(id, { tl: img.tl, ext: img.ext, editAs: "oneCell" });
    }
    for (const n of p.names) wb.definedNames.add(`'${p.name}'!${n.ref}`, n.name);
    if (p.autoFilter) ws.autoFilter = p.autoFilter;
  }
  wb.views = [{ x: 0, y: 0, width: 24000, height: 14000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  await wb.xlsx.writeFile(file);
  await finishPackage(file, plan);
}

/** ExcelJS declares PaperSize as a const enum, which erasable-syntax TypeScript cannot import; 1 is Letter. */
const LETTER = 1 as ExcelJS.PageSetup["paperSize"];

function renderCell(cell: ExcelJS.Cell, spec: CellSpec): void {
  const style = spec.style ? STYLES[spec.style] : undefined;
  if (spec.f !== undefined) {
    cell.value = { formula: spec.f, result: typeof spec.expect === "number" || typeof spec.expect === "string" ? spec.expect : undefined } as ExcelJS.CellFormulaValue;
  } else if (spec.v !== undefined && spec.v !== null) {
    cell.value = spec.v;
  }
  const font: FontSpec = { ...style?.font, ...spec.font };
  const role = spec.role ?? (spec.f !== undefined ? "calc" : typeof spec.v === "number" ? "input" : "text");
  const color = spec.font?.color ?? style?.font?.color ?? ROLE_COLOR[role];
  cell.font = { name: FONT, size: font.size ?? 9, bold: font.bold ?? false, italic: font.italic ?? false, underline: font.underline ? true : undefined, color: { argb: argb(color) } };
  const fill = spec.fill ?? style?.fill;
  if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } };
  const fmt = spec.fmt ?? style?.fmt;
  if (fmt) cell.numFmt = fmt;
  const align = { ...style?.align, ...spec.align };
  if (Object.keys(align).length) {
    cell.alignment = { horizontal: align.horizontal, vertical: align.vertical, indent: align.indent, wrapText: align.wrap };
  }
  if (spec.border) {
    const side = (s?: string) => (s ? { style: s as ExcelJS.BorderStyle, color: { argb: argb(spec.borderColor ?? COLOR.black) } } : undefined);
    cell.border = { top: side(spec.border.top), bottom: side(spec.border.bottom), left: side(spec.border.left), right: side(spec.border.right) };
  }
}

function dxf(font?: FontSpec, fill?: string): Partial<ExcelJS.Style> {
  const s: Partial<ExcelJS.Style> = {};
  if (font) s.font = { color: font.color ? { argb: argb(font.color) } : undefined, bold: font.bold, italic: font.italic };
  if (fill) s.fill = { type: "pattern", pattern: "solid", bgColor: { argb: argb(fill) } };
  return s;
}

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Three things ExcelJS cannot write, patched into the package after it is
 * saved: the monthly grids' column breaks (one fiscal year per printed page,
 * guide 5.2), the chart tabs' native charts (5.12), and the Normal style's font. ExcelJS always writes Calibri 11
 * there; it becomes Arial 10, whose digit width is the same seven pixels, so
 * column widths are unchanged and Arial is the file's only font name (5.8).
 */
async function finishPackage(file: string, plan: WorkbookPlan): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const styles = await zip.file("xl/styles.xml")!.async("string");
  zip.file("xl/styles.xml", styles.replace(/<font>(?:(?!<\/font>)[\s\S])*?<name val="Calibri"\/>(?:(?!<\/font>)[\s\S])*?<\/font>/, '<font><sz val="10"/><name val="Arial"/><family val="2"/></font>'));
  for (const [i, p] of plan.plans.entries()) {
    if (!p.print.colBreaks.length) continue;
    const partName = `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await zip.file(partName)!.async("string");
    const breaks = p.print.colBreaks.map((c) => `<brk id="${c}" max="1048575" man="1"/>`).join("");
    const element = `<colBreaks count="${p.print.colBreaks.length}" manualBreakCount="${p.print.colBreaks.length}">${breaks}</colBreaks>`;
    // Schema order: rowBreaks, colBreaks, customProperties, ..., drawing.
    let out: string;
    if (/<\/rowBreaks>/.test(xml)) out = xml.replace(/<\/rowBreaks>/, `</rowBreaks>${element}`);
    else if (/<drawing /.test(xml)) out = xml.replace(/<drawing /, `${element}<drawing `);
    else if (/<headerFooter/.test(xml)) out = xml.replace(/(<headerFooter[^>]*\/>|<headerFooter[\s\S]*?<\/headerFooter>)/, `$1${element}`);
    else out = xml.replace(/<\/worksheet>/, `${element}</worksheet>`);
    zip.file(partName, out);
  }
  await injectCharts(zip, plan.plans.map((p, i) => ({ part: `xl/worksheets/sheet${i + 1}.xml`, placements: p.charts })));
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
