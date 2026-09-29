// The plan layer between the tab planners and ExcelJS. A tab planner builds
// a SheetPlan: every cell with its value or formula, its style and, for a
// formula the engine also computes, the value the verifier expects. The
// renderer (workbook.ts) turns plans into a workbook; the verifier
// (verifyWorkbook.ts) rebuilds the same plans from the model and compares
// every expectation with an independent evaluation of the file. One plan,
// two consumers, so the writer and the verifier cannot disagree about where
// a number sits.
//
// Cross-sheet row references are written as tokens, `@{sheetKey.rowKey}`,
// and resolved once every tab has laid out its rows (resolveTokens), so a
// planner never needs another tab's row numbers up front.

import type { ChartPlacement } from "./charts.ts";
import { COLOR, ROW_HEIGHT, STYLES, WIDTH, type AlignSpec, type FontSpec, type Role, type StyleName } from "./styles.ts";

export type BorderStyle = "thin" | "medium" | "double";
export type BorderSpec = Partial<Record<"top" | "bottom" | "left" | "right", BorderStyle>>;

export interface CellSpec {
  v?: number | string | boolean | null;
  /** Formula without the leading "=". */
  f?: string;
  role?: Role;
  style?: StyleName;
  fmt?: string;
  font?: FontSpec;
  fill?: string;
  border?: BorderSpec;
  /** Border colour (hex); black by default. */
  borderColor?: string;
  align?: AlignSpec;
  /** What the engine says this cell evaluates to, in the cell's own units. */
  expect?: number | string | boolean;
  /** Absolute tolerance for a numeric expectation (default 0.5 in the cell's units, or 1e-6 for ratios). */
  tol?: number;
  label?: string;
}

export interface CfRule {
  ref: string;
  formula: string;
  font?: FontSpec;
  fill?: string;
  border?: BorderSpec;
  /** Border colour (hex); maroon by default. */
  borderColor?: string;
}

export interface PrintSpec {
  areas: string[];
  titlesRow?: string;
  titlesCol?: string;
  landscape: boolean;
  fitToWidth: number;
  fitToHeight: number;
  /** A fixed print scale (%) in place of fit-to-page, for tabs printed across pages at manual breaks. */
  scale?: number;
  rowBreaks: number[];
  colBreaks: number[];
}

export interface SheetPlan {
  key: string;
  name: string;
  cells: Map<string, CellSpec>;
  widths: Map<number, number>;
  hiddenCols: Set<number>;
  colOutline: Map<number, number>;
  heights: Map<number, number>;
  rowOutline: Map<number, number>;
  freeze?: { row: number; col: number };
  gridlines: boolean;
  tabColor?: string;
  print: PrintSpec;
  header?: string;
  footer?: string;
  cf: CfRule[];
  images: { file: string; tl: { col: number; row: number }; ext: { width: number; height: number } }[];
  /** Merged ranges; used only for table notes, never for headers (guide 5.2: centre across selection, never merged). */
  merges: string[];
  names: { name: string; ref: string }[];
  output: boolean;
  autoFilter?: string;
  rows: Record<string, number>;
  toggle?: { row: number; col: number };
  /** Ranges the Print-mode conditional format covers (defaults to the print areas). */
  toggleRanges?: string[];
  /** Native charts drawn on the tab after ExcelJS saves it (guide 5.12). */
  charts: ChartPlacement[];
  /** Widths fitPrintWidth may not narrow a column below (a print-title column that must hold the tab's title). */
  minWidths?: Map<number, number>;
}

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function addr(row: number, col: number, abs: { row?: boolean; col?: boolean } = {}): string {
  return `${abs.col ? "$" : ""}${colLetter(col)}${abs.row ? "$" : ""}${row}`;
}

export function range(r1: number, c1: number, r2: number, c2: number, absolute = false): string {
  return absolute ? `${addr(r1, c1, { row: true, col: true })}:${addr(r2, c2, { row: true, col: true })}` : `${addr(r1, c1)}:${addr(r2, c2)}`;
}

/** A sheet name quoted for use in a formula. */
export function q(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

/** Cross-sheet row token, resolved after every tab is laid out. */
export function rowOf(sheetKey: string, rowKey: string): string {
  return `@{${sheetKey}.${rowKey}}`;
}

export const cellKey = (row: number, col: number) => `${row}:${col}`;

export interface AnatomyOptions {
  subtitle: string;
  /** Last column of the print width (the subtitle rule runs B..lastCol). */
  lastCol: number;
  /** Column of the Print toggle cell; the label sits one column left. Omit for tabs without a toggle. */
  toggleCol?: number;
  /** Cell on Contents holding the master PrintMode switch, e.g. "Contents!$K$12". */
  masterToggle?: string;
  /** Title cell override; default links to Cover!B24. */
  titleFormula?: string;
}

export class SheetBuilder {
  readonly plan: SheetPlan;

  constructor(key: string, name: string, opts: { output?: boolean; tabColor?: string; gridlines?: boolean } = {}) {
    if (name.length > 31) throw new Error(`Sheet name too long: ${name}`);
    this.plan = {
      key,
      name,
      cells: new Map(),
      widths: new Map(),
      hiddenCols: new Set(),
      colOutline: new Map(),
      heights: new Map(),
      rowOutline: new Map(),
      gridlines: opts.gridlines ?? false,
      tabColor: opts.tabColor,
      print: { areas: [], landscape: false, fitToWidth: 1, fitToHeight: 0, rowBreaks: [], colBreaks: [] },
      cf: [],
      images: [],
      merges: [],
      names: [],
      charts: [],
      output: opts.output ?? true,
      rows: {},
    };
  }

  get name(): string {
    return this.plan.name;
  }

  // --- Cells -------------------------------------------------------------------

  cell(row: number, col: number, spec: CellSpec): CellSpec {
    const key = cellKey(row, col);
    const existing = this.plan.cells.get(key);
    const merged: CellSpec = existing ? { ...existing, ...spec } : { ...spec };
    if (existing?.font || spec.font) merged.font = { ...existing?.font, ...spec.font };
    if (existing?.align || spec.align) merged.align = { ...existing?.align, ...spec.align };
    if (existing?.border || spec.border) merged.border = { ...existing?.border, ...spec.border };
    this.plan.cells.set(key, merged);
    return merged;
  }

  get(row: number, col: number): CellSpec | undefined {
    return this.plan.cells.get(cellKey(row, col));
  }

  /** A typed value replaces any formula planned for the cell earlier, with its expectation. */
  text(row: number, col: number, v: string, spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { v, f: undefined, expect: undefined, role: "text", ...spec });
  }

  /** A typed number: an input, blue unless another role is given. */
  num(row: number, col: number, v: number, spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { v, f: undefined, expect: undefined, role: "input", ...spec });
  }

  /**
   * A formula. The colour code follows the formula unless a role is given:
   * cross-sheet = link, a bare in-sheet reference = inSheet, else calc. Check
   * rows are rounded to six places so floating-point noise on an exact tie
   * prints as the en dash rather than 0.000.
   */
  formula(row: number, col: number, f: string, spec: CellSpec = {}): CellSpec {
    const formula = spec.style === "check" && !/^ROUND\(/.test(f) ? `ROUND(${f},6)` : f;
    return this.cell(row, col, { f: formula, role: spec.role ?? roleOfFormula(f), ...spec });
  }

  /** A text or number that means "not available", right-aligned. */
  /** A cell where the line has no meaning for the period: "n.a." on the AMB NA fill (guide 1.2 naFill). */
  na(row: number, col: number, text = "n.a.", spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { v: text, f: undefined, expect: undefined, role: "text", align: { horizontal: "right" }, fill: COLOR.na, ...spec });
  }

  applyStyle(row: number, col: number, style: StyleName, extra: CellSpec = {}): CellSpec {
    return this.cell(row, col, { style, ...extra });
  }

  styleRange(row: number, c1: number, c2: number, style: StyleName, extra: CellSpec = {}): void {
    for (let c = c1; c <= c2; c++) this.applyStyle(row, c, style, extra);
  }

  // --- Columns and rows ------------------------------------------------------------

  width(col: number, w: number): void {
    this.plan.widths.set(col, w);
  }

  widths(from: number, to: number, w: number): void {
    for (let c = from; c <= to; c++) this.width(c, w);
  }

  spacerCol(col: number): void {
    this.width(col, WIDTH.spacer);
  }

  hideCol(col: number, outline = 1): void {
    this.plan.hiddenCols.add(col);
    this.plan.colOutline.set(col, outline);
  }

  outlineCols(from: number, to: number, level = 1): void {
    for (let c = from; c <= to; c++) this.plan.colOutline.set(c, level);
  }

  outlineRows(from: number, to: number, level = 1): void {
    for (let r = from; r <= to; r++) this.plan.rowOutline.set(r, level);
  }

  height(row: number, h: number): void {
    this.plan.heights.set(row, h);
  }

  spacerRow(row: number): void {
    this.height(row, ROW_HEIGHT.spacer);
  }

  row(key: string, row: number): number {
    this.plan.rows[key] = row;
    return row;
  }

  /** Row number of a key on this sheet; throws when the planner forgot to register it. */
  r(key: string): number {
    const r = this.plan.rows[key];
    if (r === undefined) throw new Error(`${this.plan.name}: no row "${key}"`);
    return r;
  }

  // --- Anatomy (guide 5.11) ----------------------------------------------------------

  anatomy(o: AnatomyOptions): void {
    this.width(1, WIDTH.gutter);
    this.height(2, ROW_HEIGHT.title);
    // The company name is furniture, so it prints black even though it links to the Cover.
    this.formula(2, 2, o.titleFormula ?? "Cover!B24", { style: "title", role: "text" });
    this.text(3, 2, o.subtitle, { style: "subtitle" });
    for (let c = 2; c <= o.lastCol; c++) this.cell(3, c, { border: { bottom: "thin" } });
    if (o.toggleCol && o.masterToggle) {
      this.text(3, o.toggleCol - 1, "Print", { align: { horizontal: "right" }, font: { italic: false } });
      // Each tab's toggle defaults to the master switch on Contents (a green link); typing 0 or 1 over it overrides that tab (guide 5.9).
      this.formula(3, o.toggleCol, o.masterToggle, { style: "printToggle", role: "link", font: { color: COLOR.link }, border: { top: "thin", bottom: "thin", left: "thin", right: "thin" }, label: "Print toggle" });
      this.plan.toggle = { row: 3, col: o.toggleCol };
    }
  }

  /** Tier-1 header: each group filled maroon, label in the first cell, centre across selection; the label column is filled too so rows 5-6 read as one band. */
  tier1(row: number, groups: { from: number; to: number; label: string }[]): void {
    if (!groups.some((g) => g.from <= 2 && g.to >= 2)) this.cell(row, 2, { style: "headerGroup", v: null, role: "text" });
    for (const g of groups) {
      for (let c = g.from; c <= g.to; c++) this.cell(row, c, { style: "headerGroup", v: c === g.from ? g.label : null, role: "text" });
    }
  }

  /** Tier-2 header cells over a filled span, broken at spacer columns like tier 1; the label cell (column B) is left-aligned. */
  tier2(row: number, span: { from: number; to: number }, entries: { col: number; v?: string; f?: string; fmt?: string; expect?: string | number; role?: Role }[], label?: string): void {
    for (let c = span.from; c <= span.to; c++) if (this.plan.widths.get(c) !== WIDTH.spacer) this.cell(row, c, { style: "header", v: null, role: "text" });
    if (label !== undefined) this.cell(row, 2, { style: "header", v: label, role: "text", align: { horizontal: "left" } });
    for (const e of entries) {
      if (e.f) this.formula(row, e.col, e.f, { style: "header", fmt: e.fmt, expect: e.expect, role: e.role ?? "text", label: `header ${e.expect ?? e.f}` });
      else this.cell(row, e.col, { style: "header", v: e.v ?? null, fmt: e.fmt, role: "text" });
    }
  }

  /** Section row: bold label, FFE1E1 across the label column and each value span, never the spacers. */
  section(row: number, label: string, spans: [number, number][]): void {
    this.text(row, 2, label, { style: "section" });
    for (const [a, b] of spans) for (let c = a; c <= b; c++) this.cell(row, c, { style: "section", v: this.get(row, c)?.v ?? null });
  }

  /** Thin top border across the label column and the value spans (AMB Subtotal). */
  subtotalBorder(row: number, spans: [number, number][]): void {
    this.cell(row, 2, { border: { top: "thin" }, font: { bold: true } });
    for (const [a, b] of spans) for (let c = a; c <= b; c++) this.cell(row, c, { border: { top: "thin" }, font: { bold: true } });
  }

  /**
   * Key-total box: FFFFCC fill and a thin box around the label column and each
   * value span, spanning `rows[0]` (the total) to `rows[1]` (its % Margin row,
   * or the same row when there is none).
   */
  keyTotalBox(rows: [number, number], spans: [number, number][]): void {
    const allSpans: [number, number][] = [[2, 2], ...spans];
    for (let r = rows[0]; r <= rows[1]; r++) {
      for (const [a, b] of allSpans) {
        for (let c = a; c <= b; c++) {
          const border: BorderSpec = {};
          if (r === rows[0]) border.top = "thin";
          if (r === rows[1]) border.bottom = "thin";
          if (c === a) border.left = "thin";
          if (c === b) border.right = "thin";
          this.cell(r, c, { fill: COLOR.keyTotal, border });
        }
      }
    }
  }

  note(row: number, col: number, text: string, spec: CellSpec = {}): CellSpec {
    return this.text(row, col, text, { style: "note", ...spec });
  }

  // --- Print, views, names ------------------------------------------------------------

  print(p: Partial<PrintSpec> & { area?: string }): void {
    const { area, ...rest } = p;
    this.plan.print = { ...this.plan.print, ...rest, areas: area ? [area] : (rest.areas ?? this.plan.print.areas) };
  }

  furniture(codeName: string, asOf: string): void {
    this.plan.header = `&R${codeName} | As of ${asOf}`;
    this.plan.footer = "&LAMB Advisory Services | Strictly confidential&C&A&RPage &P of &N";
  }

  freeze(row: number, col: number): void {
    this.plan.freeze = { row, col };
  }

  cf(rule: CfRule): void {
    this.plan.cf.push(rule);
  }

  /** Red font on a non-zero difference: check rows keep a higher priority than the Print-mode rule. */
  checkCf(row: number, c1: number, c2: number): void {
    this.cf({ ref: range(row, c1, row, c2), formula: `ROUND(${addr(row, c1)},3)<>0`, font: { color: COLOR.pending } });
  }

  defineName(name: string, ref: string): void {
    this.plan.names.push({ name, ref });
  }

  image(file: string, tl: { col: number; row: number }, ext: { width: number; height: number }): void {
    this.plan.images.push({ file, tl, ext });
  }
}

/** Colour role a formula earns on its own: a link when it reaches another sheet, purple when it is a bare in-sheet reference, else a calculation. */
export function roleOfFormula(f: string): Role {
  if (/!/.test(f)) return "link";
  if (/^\$?[A-Z]{1,3}\$?\d+$/.test(f)) return "inSheet";
  return "calc";
}

/** Replace every `@{sheet.row}` token with the row number that sheet registered. */
export function resolveTokens(plans: SheetPlan[]): void {
  const rows = new Map(plans.map((p) => [p.key, p.rows]));
  const sub = (s: string) =>
    s.replace(/@\{([A-Za-z0-9_]+)\.([^}]+)\}/g, (_, sheet: string, key: string) => {
      const r = rows.get(sheet)?.[key];
      if (r === undefined) throw new Error(`Unresolved row token @{${sheet}.${key}}`);
      return String(r);
    });
  for (const p of plans) {
    for (const spec of p.cells.values()) if (spec.f && spec.f.includes("@{")) spec.f = sub(spec.f);
    for (const rule of p.cf) if (rule.formula.includes("@{")) rule.formula = sub(rule.formula);
    for (const n of p.names) if (n.ref.includes("@{")) n.ref = sub(n.ref);
    p.print.areas = p.print.areas.map(sub);
    if (p.toggleRanges) p.toggleRanges = p.toggleRanges.map(sub);
  }
}

/**
 * The largest print scale (%, at most 100) at which every horizontal page
 * fits a landscape Letter page (10 in between the 5.11 margins) and rows
 * 2..lastRow fit one page tall (7 in, leaving room for the footer). `pages`
 * lists each page's columns, repeated title columns included. Column widths
 * convert as Excel does at the default font: width × 7 + 5 pixels at 96 dpi.
 */
export function fitScale(p: SheetPlan, pages: number[][], lastRow: number): number {
  const inches = (cols: number[]) => cols.reduce((s, c) => s + (p.hiddenCols.has(c) ? 0 : (widthOf(p, c) * 7 + 5) / 96), 0);
  let height = 0;
  for (let r = 2; r <= lastRow; r++) height += (p.heights.get(r) ?? ROW_HEIGHT.body) / 72;
  const widest = Math.max(...pages.map(inches));
  // Fitting one page tall never takes the scale under the legibility floor: rows run onto a second page instead (C37).
  const byWidth = Math.floor((100 * 10) / widest);
  const byHeight = Math.floor((100 * 7) / height);
  return Math.min(100, byWidth, Math.max(byHeight, MIN_PRINT_SCALE));
}

/** Rendered size of 9 pt body text below which a printed tab fails C37 (guide 2: nothing below 7 pt). */
export const MIN_PRINTED_PT = 7;

/**
 * The scale (%) a tab prints at: its fixed scale, or the fit-to-width scale
 * of its widest print area (repeated title columns included) on a Letter
 * page between the 5.11 margins (7.5 in portrait, 10 in landscape). Widths
 * convert as Excel does at the default font: width × 7 + 5 pixels at 96 dpi.
 */
export function printScaleOf(p: SheetPlan): number {
  if (p.print.scale) return p.print.scale;
  const widest = widestArea(p);
  if (!widest || p.print.fitToWidth !== 1) return 100;
  return Math.min(100, Math.floor((100 * (p.print.landscape ? 10 : 7.5)) / widest.inches));
}

/** The widest print area as it prints (repeated title columns included) and the columns on its page. */
function widestArea(p: SheetPlan): { inches: number; cols: number[] } | undefined {
  const visible = (c1: number, c2: number) => Array.from({ length: c2 - c1 + 1 }, (_, i) => c1 + i).filter((c) => !p.hiddenCols.has(c));
  const inches = (cols: number[]) => cols.reduce((w, c) => w + (widthOf(p, c) * 7 + 5) / 96, 0);
  const titles = p.print.titlesCol ? /^\$?([A-Z]+):\$?([A-Z]+)$/.exec(p.print.titlesCol) : null;
  const titleCols = titles ? visible(colIndex(titles[1]!), colIndex(titles[2]!)) : [];
  let best: { inches: number; cols: number[] } | undefined;
  for (const a of p.print.areas) {
    const m = /^\$?([A-Z]+)\$?\d+:\$?([A-Z]+)\$?\d+$/.exec(a);
    if (!m) continue;
    const [c1, c2] = [colIndex(m[1]!), colIndex(m[2]!)];
    // Title columns print once when the area starts with them, else in front of it.
    const cols = [...(titles && colIndex(titles[1]!) >= c1 ? [] : titleCols), ...visible(c1, c2)];
    const w = inches(cols);
    if (!best || w > best.inches) best = { inches: w, cols };
  }
  return best;
}

/** Width of a column in characters (Excel's default is 8.43). */
const widthOf = (p: SheetPlan, c: number) => p.widths.get(c) ?? 8.43;

/** Fit-to-width scale every printed tab must reach: 9 pt body text then renders at 7.2 pt, a margin over the 7 pt floor for LibreOffice's rounding (C37). */
export const MIN_PRINT_SCALE = 82;

/** Narrowest a text column may become to fit the page: labels keep the guide 5.2 width less a few units; notes and sources wrap below that. */
const TEXT_FLOOR = { label: 30, other: 20 } as const;

/**
 * Fit a tab to the page at a legible scale (guide 5.11, C37). Text columns
 * (labels, notes, sources: 20 units or wider) give way before anything else,
 * widest first and never below their floors; value columns keep their
 * widths. When portrait cannot reach the floor the tab turns landscape and
 * starts again from its planned widths. Text that no longer fits on one line
 * wraps (finalizeNotes then gives the row its height), so narrowing never
 * truncates a label.
 */
export function fitPrintWidth(p: SheetPlan): void {
  if (p.print.scale || p.print.fitToWidth !== 1 || !p.print.areas.length) return;
  const planned = new Map(p.widths);
  const textCols = [...p.widths.entries()].filter(([c, w]) => w >= 20 && inPrintArea(p, c) && !p.hiddenCols.has(c)).map(([c]) => c);
  const floorOf = (c: number) => Math.max(c === 2 ? TEXT_FLOOR.label : TEXT_FLOOR.other, p.minWidths?.get(c) ?? 0);
  const shrink = () => {
    while (printScaleOf(p) < MIN_PRINT_SCALE) {
      // Only a column on the widest page helps: narrowing a Basis range printed apart would not lift the figures' scale.
      const onPage = widestArea(p)?.cols ?? [];
      const open = textCols.filter((c) => onPage.includes(c) && widthOf(p, c) > floorOf(c));
      if (!open.length) return;
      const c = open.reduce((a, b) => (widthOf(p, a) - floorOf(a) >= widthOf(p, b) - floorOf(b) ? a : b));
      p.widths.set(c, Math.max(floorOf(c), widthOf(p, c) - 1));
    }
  };
  // Share of the text columns' planned width given up to fit.
  const squeeze = () => {
    const before = textCols.reduce((s, c) => s + (planned.get(c) ?? 0), 0);
    return before ? textCols.reduce((s, c) => s + (planned.get(c) ?? 0) - widthOf(p, c), 0) / before : 0;
  };
  shrink();
  // Portrait that misses the floor, or reaches it only by giving up more than a quarter of the text width, turns landscape when that squeezes less.
  if (!p.print.landscape && (printScaleOf(p) < MIN_PRINT_SCALE || squeeze() > 0.25)) {
    const portrait = new Map(p.widths);
    const portraitOk = printScaleOf(p) >= MIN_PRINT_SCALE;
    const portraitSqueeze = squeeze();
    for (const [c, w] of planned) p.widths.set(c, w);
    p.print.landscape = true;
    shrink();
    if (portraitOk && squeeze() >= portraitSqueeze) {
      for (const [c, w] of portrait) p.widths.set(c, w);
      p.print.landscape = false;
    }
  }
  // A grid too wide even so (a raw export) prints across pages at the floor, its first column repeated, rather than shrinking.
  if (printScaleOf(p) < MIN_PRINT_SCALE) {
    // Narrowing text no longer helps a tab printed across pages: it keeps its planned widths, so nothing is cut.
    for (const [c, w] of planned) p.widths.set(c, w);
    p.print.scale = MIN_PRINT_SCALE;
    p.print.fitToWidth = 0;
    const first = /^\$?([A-Z]+)/.exec(p.print.areas[0]!)?.[1];
    if (!p.print.titlesCol && first) p.print.titlesCol = `${first}:${first}`;
  }
  for (const c of textCols) {
    if (widthOf(p, c) === planned.get(c)) continue;
    for (const [key, spec] of p.cells) {
      const [r, cc] = key.split(":").map(Number) as [number, number];
      const text = typeof spec.v === "string" ? spec.v : typeof spec.expect === "string" ? spec.expect : undefined;
      if (cc !== c || r < 7 || text === undefined || ["section", "header", "headerGroup", "title", "subtitle"].includes(spec.style ?? "")) continue;
      if (p.merges.some((m) => m.startsWith(`${addr(r, c)}:`))) continue;
      if (spec.align?.wrap === false) continue;
      const bold = spec.font?.bold ?? STYLES[spec.style ?? "text"]?.font?.bold ?? false;
      const indent = spec.align?.indent ?? STYLES[spec.style ?? "text"]?.align?.indent ?? 0;
      if (wrappedLines(text, widthOf(p, c) - indent * 1.5, bold) > 1) spec.align = { ...spec.align, wrap: true };
    }
  }
}

/**
 * A tab that repeats title columns (a strip or Basis range printed beside
 * the labels, the Monthly P&L's column pages) prints its row-2 title inside
 * those columns alone, where it cannot run on into the next printed column.
 * The last title column widens until the title fits at AMB Title (13 pt bold,
 * about 0.6 em a character), and fitPrintWidth keeps that width.
 */
export function holdTitleInTitleColumns(p: SheetPlan, text: string): void {
  const m = p.print.titlesCol ? /^\$?([A-Z]+):\$?([A-Z]+)$/.exec(p.print.titlesCol) : null;
  if (!m || !p.cells.has(cellKey(2, 2))) return;
  const [c1, c2] = [colIndex(m[1]!), colIndex(m[2]!)];
  const px = (text.length * 13 * 0.6) / 0.75;
  const need = Math.ceil((px - 5) / 7) + 1;
  let have = 0;
  for (let c = c1; c <= c2; c++) if (!p.hiddenCols.has(c)) have += widthOf(p, c);
  if (have >= need) return;
  const width = widthOf(p, c2) + need - have;
  p.widths.set(c2, width);
  (p.minWidths ??= new Map()).set(c2, width);
}

/**
 * Panes freeze only on a tab wider than one screen (guide 5.11): more than
 * eight value columns (widths 6-15), the same count that turns a tab
 * landscape. A narrow tab scrolls whole, with nothing pinned. Raw tabs keep
 * their header row pinned.
 */
export function freezeWideOnly(p: SheetPlan): void {
  if (!p.freeze || !p.output) return;
  let values = 0;
  for (const [c, w] of p.widths) if (w >= 6 && w <= 15 && !p.hiddenCols.has(c) && inPrintArea(p, c)) values++;
  if (values <= 8) delete p.freeze;
}

/** Whether a column falls inside any of the tab's print areas. */
function inPrintArea(p: SheetPlan, c: number): boolean {
  return p.print.areas.some((a) => {
    const m = /^\$?([A-Z]+)\$?\d+:\$?([A-Z]+)\$?\d+$/.exec(a);
    return !!m && c >= colIndex(m[1]!) && c <= colIndex(m[2]!);
  });
}

/**
 * A label longer than its column wraps rather than widening the grid
 * (guide 5.2 widths: 34 standard, 48 on Assumptions and Deal Structure, 36
 * on Adjustments): labels are verbatim (5.4) or the advisor's own words, so
 * they are never cut. Section rows, notes and helpers are left out: sections
 * overflow into their own filled band.
 */
export function wrapLongLabels(p: SheetPlan): void {
  if (!p.output) return;
  const width = widthOf(p, 2);
  for (const [key, spec] of p.cells) {
    const [r, c] = key.split(":").map(Number) as [number, number];
    // A label linked from another tab (a ladder rung on the Summary) wraps by the text it evaluates to.
    const text = typeof spec.v === "string" ? spec.v : typeof spec.expect === "string" ? spec.expect : undefined;
    if (c !== 2 || r < 7 || text === undefined || ["section", "note", "helper", "header", "headerGroup"].includes(spec.style ?? "")) continue;
    // A label set not to wrap runs on across empty cells on purpose (a grid title, a settings label).
    if (spec.align?.wrap === false || p.merges.some((m) => m.startsWith(`${addr(r, c)}:`))) continue;
    const indent = spec.align?.indent ?? STYLES[spec.style ?? "text"]?.align?.indent ?? 0;
    const bold = spec.font?.bold ?? STYLES[spec.style ?? "text"]?.font?.bold ?? false;
    if (wrappedLines(text, width - indent * 1.5, bold) > 1) spec.align = { ...spec.align, wrap: true };
  }
}

/**
 * A Notes or Basis column (its tier-1 label) with nothing written below its
 * header is dropped with the spacer before it, and the print area and the
 * subtitle rule end at the last value column: an empty 60-wide column only
 * shrinks the printed table.
 */
export function dropEmptyNotesColumn(p: SheetPlan): void {
  const entry = [...p.cells].find(([k, spec]) => k.startsWith("5:") && typeof spec.v === "string" && /^(Notes|Basis)\b/.test(spec.v) && spec.style === "headerGroup");
  if (!entry) return;
  const notesCol = Number(entry[0].split(":")[1]);
  // Only the printed rows count: helper blocks below the print area reuse the column.
  const lastPrinted = Math.max(0, ...p.print.areas.map((a) => Number(/(\d+)$/.exec(a)?.[1] ?? 0)));
  const used = [...p.cells].some(([k, spec]) => {
    const [r, c] = k.split(":").map(Number) as [number, number];
    return c === notesCol && r >= 7 && r <= lastPrinted && ((spec.v !== null && spec.v !== undefined && spec.v !== "") || spec.f !== undefined);
  });
  if (used) return;
  const spacer = p.widths.get(notesCol - 1) === WIDTH.spacer ? notesCol - 1 : notesCol;
  for (const k of [...p.cells.keys()]) {
    const [r, c] = k.split(":").map(Number) as [number, number];
    if (c >= spacer && c <= notesCol && r <= lastPrinted) p.cells.delete(k);
  }
  p.widths.delete(notesCol);
  p.widths.delete(spacer);
  const lastCol = colLetter(spacer - 1);
  // Only the area that ran to the notes column loses it; an area ending earlier (a period block printed apart) keeps its width.
  p.print.areas = p.print.areas.map((a) => {
    const m = /:\$?([A-Z]+)(\$?\d+)$/.exec(a);
    return m && colIndex(m[1]!) >= spacer ? a.replace(/:\$?([A-Z]+)(\$?\d+)$/, `:${lastCol}$2`) : a;
  });
}

/**
 * Wrapping text gets the height it needs. A table note ("Note: ..." in
 * column B) is merged across the print width so it prints as a paragraph
 * under the table; a note in a notes or source column, or any cell that
 * wraps, grows its row instead. A row that grows top-aligns its other cells,
 * so figures sit beside the first line. Runs once the print area is known.
 */
export function finalizeNotes(p: SheetPlan): void {
  const area = p.print.areas[0];
  const lastCol = area ? colIndex(/:\$?([A-Z]+)/.exec(area)?.[1] ?? "B") : 2;
  for (const [key, spec] of [...p.cells]) {
    const [r, c] = key.split(":").map(Number) as [number, number];
    const wraps = spec.align?.wrap === true || (spec.style === "note" && spec.align?.wrap !== false);
    if (!wraps || r < 7 || (typeof spec.v !== "string" && typeof spec.expect !== "string")) continue;
    // A merged cell (the sensitivity row-axis label) wraps inside its own block of rows.
    if (p.merges.some((m) => m.startsWith(`${addr(r, c)}:`))) continue;
    const text = typeof spec.v === "string" ? spec.v : String(spec.expect);
    const tableNote = spec.style === "note" && c === 2 && lastCol > 2;
    let units = 0;
    if (tableNote) {
      for (let k = 2; k <= lastCol; k++) if (!p.hiddenCols.has(k)) units += widthOf(p, k);
      p.merges.push(`${addr(r, 2)}:${addr(r, lastCol)}`);
    } else units = widthOf(p, c);
    const lines = wrappedLines(text, units, spec.font?.bold ?? STYLES[spec.style ?? "text"]?.font?.bold ?? false);
    if (lines === 1) continue;
    p.heights.set(r, Math.max(p.heights.get(r) ?? 0, lines * 11.5 + 2));
    if (!tableNote) {
      for (const [k2, other] of p.cells) {
        const [r2] = k2.split(":").map(Number) as [number];
        if (r2 === r && other.align?.vertical === undefined) other.align = { ...other.align, vertical: "top" };
      }
    }
  }
}

/**
 * Printed text longer than its column whose overflow runs into a cell that
 * holds something (guide 5.11, C37): Excel and LibreOffice cut it at the
 * cell edge ("VersiDate", "3-year blended" losing "% of sales,"). Left-
 * aligned text overflows right, right-aligned text left, centred text both
 * ways. Wrapped and merged cells are left out; a section band's own cells
 * are empty, so its label may run on.
 */
export function clippedTexts(p: SheetPlan): { cell: string; text: string }[] {
  const lastPrinted = Math.max(0, ...p.print.areas.map((a) => Number(/(\d+)$/.exec(a)?.[1] ?? 0)));
  const holds = (r: number, c: number) => {
    const o = p.cells.get(cellKey(r, c));
    return !!o && (o.f !== undefined || (o.v !== undefined && o.v !== null && o.v !== ""));
  };
  const visible = (c: number, step: number) => {
    let k = c + step;
    while (k > 0 && p.hiddenCols.has(k)) k += step;
    return k;
  };
  const merged = (r: number, c: number) =>
    p.merges.some((m) => {
      const x = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m.replace(/\$/g, ""));
      return !!x && r >= Number(x[2]) && r <= Number(x[4]) && c >= colIndex(x[1]!) && c <= colIndex(x[3]!);
    });
  const out: { cell: string; text: string }[] = [];
  for (const [key, spec] of p.cells) {
    const [r, c] = key.split(":").map(Number) as [number, number];
    const text = typeof spec.v === "string" ? spec.v : typeof spec.expect === "string" ? spec.expect : undefined;
    if (!text || r < 5 || r > lastPrinted || p.hiddenCols.has(c) || !inPrintArea(p, c) || spec.align?.wrap === true || merged(r, c)) continue;
    const style = STYLES[spec.style ?? "text"];
    const size = spec.font?.size ?? style?.font?.size ?? 9;
    const bold = spec.font?.bold ?? style?.font?.bold ?? false;
    const indent = spec.align?.indent ?? style?.align?.indent ?? 0;
    if (wrappedLines(text, ((widthOf(p, c) - indent * 1.5) * 9) / size, bold) === 1) continue;
    const h = spec.align?.horizontal ?? style?.align?.horizontal ?? "left";
    const right = h === "left" || h === "center" ? holds(r, visible(c, 1)) : false;
    const left = h === "right" || h === "center" ? holds(r, visible(c, -1)) : false;
    if (right || left) out.push({ cell: addr(r, c), text });
  }
  return out;
}

/**
 * Lines a cell's text wraps to at Arial 9 in a column `units` wide (Excel
 * width units: 7 px each plus 5 px of padding, less 4 px of cell margin),
 * breaking at spaces as Excel does. Arial 9 averages about 5.8 px a
 * character (6.3 in bold); counting whole words keeps a wrapped row from
 * being cut at its last line.
 */
export function wrappedLines(text: string, units: number, bold = false): number {
  const perLine = Math.max(1, Math.floor((units * 7 + 1) / (bold ? 6.3 : 5.8)));
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const need = used ? used + 1 + word.length : word.length;
      if (need <= perLine) used = need;
      else {
        lines += used ? 1 : 0;
        used = Math.min(word.length, perLine);
        lines += Math.floor(Math.max(0, word.length - 1) / perLine);
      }
    }
  }
  return Math.max(1, lines);
}

function colIndex(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** Every cell of a plan that carries an expectation. */
export function expectations(plan: SheetPlan): { row: number; col: number; spec: CellSpec }[] {
  const out: { row: number; col: number; spec: CellSpec }[] = [];
  for (const [k, spec] of plan.cells) {
    if (spec.expect === undefined) continue;
    const [r, c] = k.split(":").map(Number) as [number, number];
    out.push({ row: r, col: c, spec });
  }
  return out;
}
