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
import type { ModelResult } from "./engine.ts";
import { resolveTokens, type CellSpec, type SheetPlan } from "./sheet.ts";
import { COLOR, FONT, MARGINS, ROLE_COLOR, STYLES, argb, type FontSpec } from "./styles.ts";
import type { ModelOutput } from "./types.ts";
import { A, planAssumptions, type TabContext } from "./workbook/assumptionsTab.ts";
import { checkFormulas, planChecks } from "./workbook/checksTab.ts";
import { planDatabook, planDivider, planMapping, planMonthly, planRawBank, planRawBs, planRawCustomers, planRawPayroll, planRawPnl } from "./workbook/data.ts";
import { masterToggleRef, planContents, planCover, planSummary } from "./workbook/front.ts";
import { SHEET, type SheetKey } from "./workbook/layout.ts";
import { planAdjustments, planLadder, planPnlSummary } from "./workbook/statements.ts";
import { planExpenseDetail, planRevenueDetail } from "./workbook/detail.ts";
import { planCohorts, planConcentration, planCustomerOverview, planRetention } from "./workbook/customersTabs.ts";
import { planHeadcount } from "./workbook/headcountTab.ts";
import { planBalanceSheet, planCashFlow, planDebtLike, planNwc, planProofOfCash } from "./workbook/balance.ts";
import { planProjections } from "./workbook/projections.ts";
import { planDealStructure, planOpportunities, planSensitivities, planValuation } from "./workbook/valuationTabs.ts";

export { SHEET };

export interface WorkbookContext {
  row: RequestRow;
  dataset: FinancialDataset;
  assumptions: Assumptions;
  model: ModelResult;
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
  "cover", "contents", "summary", "assumptions", "pnl", "ladder", "adjustments", "revenue", "expense",
  "customers", "retention", "concentration", "cohorts", "headcount",
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
  const ctx: TabContext = {
    model,
    a: model.assumptions,
    codeName: opts.codeName,
    businessName: opts.businessName,
    asOfLabel: asOfLabel(model),
    masterToggle: masterToggleRef(),
    customers: ds?.customers?.customers.map((c) => ({ id: c.id, startDate: c.startDate, endDate: c.endDate, revenueByFiscalYear: c.revenueByFiscalYear })) ?? [],
    employees: ds?.payroll?.employees.map((e) => ({ id: e.id, department: e.department, hireDate: e.hireDate, terminationDate: e.terminationDate, isOwner: e.isOwner })) ?? [],
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
    expense: () => planExpenseDetail(ctx),
    customers: () => planCustomerOverview(ctx),
    retention: () => planRetention(ctx),
    concentration: () => planConcentration(ctx),
    cohorts: () => planCohorts(ctx),
    headcount: () => planHeadcount(ctx),
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
    databook: () => planDatabook(ctx, ds),
    mapping: () => planMapping(ctx),
    rawPnl: () => planRawPnl(model),
    rawBs: () => planRawBs(model),
    rawBank: () => (ds ? planRawBank(ds) : undefined),
    rawCustomers: () => (ds ? planRawCustomers(ds) : undefined),
    rawPayroll: () => (ds ? planRawPayroll(ds) : undefined),
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
  const sources = ds ? ds.provenance.map((p) => `FY${p.year}: P&L from ${SOURCE_LABELS[p.pnl]}${p.balanceSheet ? `; balance sheet from ${SOURCE_LABELS[p.balanceSheet]}` : ""}`) : [];
  byKey.checks = planChecks(ctx, builtKeys, checkFormulas(model, builtKeys)).plan;
  byKey.contents = planContents(ctx, ds, order, opts.firmName, version, sources).plan;

  const plans = order.map((k) => byKey[k]!);
  for (const p of plans) {
    let last = 0;
    for (const k of p.cells.keys()) last = Math.max(last, Number(k.split(":")[0]));
    p.rows.errorScanLast ??= last;
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

export async function writeWorkbook(ctx: WorkbookContext, file: string): Promise<void> {
  const model = ctx.model as ModelOutput;
  const repoRoot = path.resolve(import.meta.dirname, "..", "..");
  const plan = planWorkbook(model, {
    dataset: ctx.dataset,
    codeName: ctx.row.code_name,
    businessName: ctx.row.business_name,
    firmName: ctx.firmName,
    preparedOn: ctx.preparedOn,
    version: ctx.version,
    logoFile: defaultLogo(repoRoot),
  });
  await renderWorkbook(plan, file, { creator: ctx.firmName });
}

// --- Rendering --------------------------------------------------------------------------------

export async function renderWorkbook(plan: WorkbookPlan, file: string, opts: { creator: string }): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.creator;
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const imageIds = new Map<string, number>();

  for (const p of plan.plans) {
    const ws = wb.addWorksheet(p.name, { properties: { tabColor: p.tabColor ? { argb: argb(p.tabColor) } : undefined, defaultRowHeight: 12.75, outlineProperties: { summaryBelow: false, summaryRight: false } } });
    ws.properties.defaultRowHeight = 12.75;
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
        paperSize: 1,
        fitToPage: true,
        fitToWidth: p.print.fitToWidth,
        fitToHeight: p.print.fitToHeight,
        printArea: p.print.areas.join("&&"),
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
  await injectColumnBreaks(file, plan);
}

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
    const side = (s?: string) => (s ? { style: s as ExcelJS.BorderStyle, color: { argb: argb(COLOR.black) } } : undefined);
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
 * ExcelJS writes row breaks but not column breaks. The monthly grids print
 * one fiscal year per page (guide 5.2), so their `<colBreaks>` element is
 * added to the sheet XML after the file is written.
 */
async function injectColumnBreaks(file: string, plan: WorkbookPlan): Promise<void> {
  const withBreaks = plan.plans.map((p, i) => ({ p, i })).filter(({ p }) => p.print.colBreaks.length);
  if (!withBreaks.length) return;
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  for (const { p, i } of withBreaks) {
    const partName = `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await zip.file(partName)?.async("string");
    if (!xml) continue;
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
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export { A };
