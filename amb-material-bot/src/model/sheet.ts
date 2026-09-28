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

import { COLOR, FMT, MARGINS, ROW_HEIGHT, STYLES, WIDTH, type AlignSpec, type FontSpec, type Role, type StyleName } from "./styles.ts";

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
}

export interface PrintSpec {
  areas: string[];
  titlesRow?: string;
  titlesCol?: string;
  landscape: boolean;
  fitToWidth: number;
  fitToHeight: number;
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
  names: { name: string; ref: string }[];
  output: boolean;
  autoFilter?: string;
  rows: Record<string, number>;
  toggle?: { row: number; col: number };
  /** Ranges the Print-mode conditional format covers (defaults to the print areas). */
  toggleRanges?: string[];
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
      names: [],
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

  text(row: number, col: number, v: string, spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { v, role: "text", ...spec });
  }

  /** A typed number: an input, blue unless another role is given. */
  num(row: number, col: number, v: number, spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { v, role: "input", ...spec });
  }

  /** A formula. The colour code follows the formula unless a role is given: cross-sheet = link, a bare in-sheet reference = inSheet, else calc. */
  formula(row: number, col: number, f: string, spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { f, role: spec.role ?? roleOfFormula(f), ...spec });
  }

  /** A text or number that means "not available", right-aligned. */
  na(row: number, col: number, text = "n.a.", spec: CellSpec = {}): CellSpec {
    return this.cell(row, col, { v: text, role: "text", align: { horizontal: "right" }, ...spec });
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
    this.formula(2, 2, o.titleFormula ?? "Cover!B24", { style: "title", role: "link" });
    this.text(3, 2, o.subtitle, { style: "subtitle" });
    for (let c = 2; c <= o.lastCol; c++) this.cell(3, c, { border: { bottom: "thin" } });
    if (o.toggleCol && o.masterToggle) {
      this.text(3, o.toggleCol - 1, "Print", { align: { horizontal: "right" }, font: { italic: false } });
      this.formula(3, o.toggleCol, o.masterToggle, { style: "printToggle", role: "link", border: { top: "thin", bottom: "thin", left: "thin", right: "thin" }, label: "Print toggle" });
      this.plan.toggle = { row: 3, col: o.toggleCol };
    }
  }

  /** Tier-1 header: each group filled maroon, label in the first cell, centre across selection. */
  tier1(row: number, groups: { from: number; to: number; label: string }[]): void {
    for (const g of groups) {
      for (let c = g.from; c <= g.to; c++) this.cell(row, c, { style: "headerGroup", v: c === g.from ? g.label : null, role: "text" });
    }
  }

  /** Tier-2 header cells over a filled span; the label cell (column B) is left-aligned. */
  tier2(row: number, span: { from: number; to: number }, entries: { col: number; v?: string; f?: string; fmt?: string; expect?: string | number; role?: Role }[], label?: string): void {
    for (let c = span.from; c <= span.to; c++) this.cell(row, c, { style: "header", v: null, role: "text" });
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
    s.replace(/@\{([A-Za-z0-9_]+)\.([A-Za-z0-9_:.-]+)\}/g, (_, sheet: string, key: string) => {
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

export { FMT, STYLES, MARGINS, WIDTH, ROW_HEIGHT };
