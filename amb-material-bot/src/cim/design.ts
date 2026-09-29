// The CIM design system as code: design/FINAL_DESIGN_SPEC.md (the law for
// design) over docs/HOUSE_STYLE.md sections 1 and 2. Ported from the
// tournament winner, design/directions/c-exhibit-databook/build-deck.js,
// with every fix and graft of the spec's sections 11 and 12 applied.
//
// Everything a page is made of is a Block. Section modules describe pages
// as rows of columns of blocks (spec 7.3 archetypes); the layout engine
// measures each block, stacks them with the spec's spacing constants, sends
// floating blocks (observations, callouts) to the shorter column, and
// refuses a page whose content crosses the 6.48 in guard. The renderer then
// draws blocks with the primitives below. Measuring and drawing share the
// same height functions, so what the planner decided is what gets drawn.

import fs from "node:fs";
import path from "node:path";
import pptxgenModule from "pptxgenjs";
import JSZip from "jszip";
import { EN_DASH } from "../util/format.ts";

// pptxgenjs ships CommonJS-style typings, so under NodeNext the default
// import is typed as the module object. At runtime the ESM build's default
// export is the class itself; normalise both.
type PptxCtor = typeof import("pptxgenjs").default;
export const PptxGenJS: PptxCtor = ((pptxgenModule as unknown as { default?: PptxCtor }).default ?? pptxgenModule) as PptxCtor;
export type Pptx = InstanceType<PptxCtor>;
export type Slide = import("pptxgenjs").default.Slide;
type TableCell = import("pptxgenjs").default.TableCell;
type TextRun = import("pptxgenjs").default.TextProps;
type TextOpts = import("pptxgenjs").default.TextPropsOptions;
type TableCellProps = import("pptxgenjs").default.TableCellProps;
type BorderProps = import("pptxgenjs").default.BorderProps;
type ChartOpts = import("pptxgenjs").default.IChartOpts;

// ---------------------------------------------------------------------------
// Tokens (spec 3). Hex without '#', as pptxgenjs takes them.
// ---------------------------------------------------------------------------

export const C = {
  maroon: "7B0000",
  ink: "2C2523",
  muted: "7A706D",
  rule: "C2BAB8",
  section: "FFE1E1",
  tint: "F5EDEC",
  onMaroon: "E9D3D5",
  gold: "C9A227",
  white: "FFFFFF",
  // chart palette, fixed order (guide 2.6)
  sand: "C49A5B",
  slate: "5E5552",
  blush: "DCC7C4",
  estimate: "B5727A",
  // [Confirm: …] markers in drafts (guide 2.4)
  pending: "FF0000",
} as const;

export const SERIES2 = [C.maroon, C.blush];
export const SERIES4 = [C.maroon, C.sand, C.slate, C.blush];
/** Fills whose data labels must be white; every other fill takes ink labels (guide 2.3 trap 3). */
const DARK_FILLS = new Set<string>([C.maroon, C.slate]);

export const SERIF = "Georgia";
export const SANS = "Arial";

const ASSETS = path.resolve(import.meta.dirname, "assets");
export const LOGO_COLOUR = path.join(ASSETS, "amb-logo-tight.png");
export const LOGO_WHITE = path.join(ASSETS, "amb-logo-white-tight.png");
export const LOGO_ASPECT = 3.073; // tight crop 1862 x 606 px

// ---------------------------------------------------------------------------
// Grid and bands (spec 1)
// ---------------------------------------------------------------------------

export const PAGE = { w: 13.333, h: 7.5 } as const;
const MARGIN = 0.45;
const COL_W = 0.853;
const GUTTER = 0.2;
export const RIGHT = 12.883;
export const CONTENT_W = 12.433;

export const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** Left edge of column k (1-based). */
export const colX = (k: number): number => r3(MARGIN + (k - 1) * (COL_W + GUTTER));
/** Width of a span from column a to column b inclusive. */
export const spanW = (a: number, b: number): number => r3((b - a + 1) * COL_W + (b - a) * GUTTER);
/** Hairline x for a block ending at column k: centred in the gutter after it. */
export const hairlineX = (k: number): number => r3(colX(k) + COL_W + GUTTER / 2);

export const BAND = {
  titleY: 0.3,
  titleH: 0.7,
  ruleY: 1.06,
  top: 1.22,
  /** Nothing crosses this (spec 1, [F]). */
  bottom: 6.48,
  notesTop: 6.58,
  notesBottom: 6.92,
  footRuleY: 7.0,
  footY: 7.06,
  footH: 0.24,
};
export const CONTENT_H = r3(BAND.bottom - BAND.top);

/** Most exhibits (tables and charts) a content page carries (spec 7.3: one to three). */
export const MAX_EXHIBITS = 3;

/** White gap column between period groups inside a numeric table. */
export const GAP = 0.08;

/** Spacing constants (spec 1). */
export const SPACE = {
  headerRule: 0.25,
  headerBody: 0.33,
  exhibit: 0.14,
  twoTables: 0.12,
  chartToObs: 0.1,
  tableToObs: 0.12,
  callout: 0.14,
  row: 0.14,
} as const;

// ---------------------------------------------------------------------------
// Text measurement (spec 4.2). Arial and its render substitute Liberation Sans
// share advance widths, so wrapping is simulated from Arial's metrics (the
// Helvetica AFM widths, 1/1000 em) word by word, as PowerPoint and LibreOffice
// wrap. The spec's average-advance formula over-counted lines on lower-case
// text and left the slack rows the judges saw.
// ---------------------------------------------------------------------------

const ASCII_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const ASCII_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIDE: Record<string, number> = { "–": 556, "—": 1000, "÷": 584, "Δ": 612, "’": 222, "‘": 222, "“": 333, "”": 333, "·": 278, "▪": 604, "≥": 549, "≤": 549, "\u00a0": 278 };

/** A trailing footnote marker ("… compensation (2)") is tied to the word before it, so a wrap never leaves it alone on a line (QA round 2 F36). */
export const keepMarker = (label: string): string => label.replace(/ (\((?:\d+|[a-z])\))$/, "\u00a0$1");

/** Advance width of a string in inches at a point size. */
export function textWidth(t: string, pt: number, bold = false): number {
  const table = bold ? ASCII_BOLD : ASCII_REG;
  let units = 0;
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    units += c >= 32 && c < 127 ? table[c - 32]! : (WIDE[ch] ?? 556);
  }
  return (units / 1000) * (pt / 72);
}

/** Average Arial advance in inches at a point size, for rough widths (legends). */
export const charW = (pt: number, bold = false): number => ((bold ? 0.54 : 0.5) * pt) / 72;

/** Page tokens resolve after layout; measure them as they print ("page 00", "00"). */
const printed = (t: string): string => t.replace(/\{\{page:[^}]+\}\}/g, "page 00").replace(/\{\{pageno:[^}]+\}\}/g, "00");

export interface MeasureRun {
  text: string;
  bold?: boolean;
}

/** Lines a sequence of runs wraps to in a text area `w` inches wide: greedy word wrap, hard breaks on "\n". */
export function wrapLines(runs: MeasureRun[], w: number, pt: number): number {
  const width = Math.max(0.2, w);
  let lines = 1;
  let x = 0;
  for (const r of runs) {
    // Renderers break after a hyphen inside a word ("maintenance-agreement") as well as at spaces.
    const parts = printed(r.text).split(/(\n| )|(?<=[A-Za-z]-)(?=[A-Za-z])/);
    for (const part of parts) {
      if (part === undefined) continue;
      if (part === "\n") {
        lines += 1;
        x = 0;
        continue;
      }
      if (part === "") continue;
      const pw = textWidth(part, pt, r.bold);
      if (part === " ") {
        x += pw;
        continue;
      }
      if (x > 0 && x + pw > width) {
        lines += 1;
        x = 0;
      }
      // A word longer than the line breaks across lines.
      const extra = pw > width ? Math.ceil(pw / width) - 1 : 0;
      lines += extra;
      x += pw - extra * width;
    }
  }
  return lines;
}

/** Lines a string wraps to in a table cell `w` wide with 0.10 in of side margins. */
export function linesFor(text: string, w: number, pt: number, bold = false): number {
  return wrapLines([{ text, bold }], w - 0.1, pt);
}

/** Text-table row height from its longest cell: 0.07 + lines x (pt x 1.15 / 72). */
export function rowHeightFor(cells: { text: string; bold?: boolean; runs?: MeasureRun[] }[], colW: number[], pt: number): number {
  let lines = 1;
  cells.forEach((c, i) => {
    lines = Math.max(lines, c.runs ? wrapLines(c.runs, (colW[i] ?? 1) - 0.1, pt) : linesFor(c.text, colW[i] ?? 1, pt, c.bold));
  });
  return r3(0.07 + lines * ((pt * 1.15) / 72));
}

/** Observation item height: 0.09 + lines x 0.145 at 9 pt, from the text column's width (0.02 right margin). */
export function observationHeight(lead: string, body: string, textW: number, pt = 9): number {
  const lines = wrapLines([{ text: `${lead} `, bold: true }, { text: body }], textW - 0.03, pt);
  return r3(0.09 + lines * ((pt * 1.16) / 72));
}

/** Callout height: 0.10 + lines x 0.155 at 9 pt inside the 0.14 / 0.10 insets. */
export function calloutHeight(lead: string, body: string, w: number, pt = 9): number {
  const lines = wrapLines([{ text: `${lead} `, bold: true }, { text: body }], w - 0.25, pt);
  return r3(0.1 + lines * ((pt * 1.24) / 72));
}

export interface Paragraph {
  lead?: string;
  body: string;
}

/** Height of run-in prose paragraphs at 1.08 leading with 7 pt after each. */
export function proseHeight(paragraphs: Paragraph[], w: number, pt = 9.5): number {
  let h = 0;
  for (const p of paragraphs) {
    const lines = wrapLines([...(p.lead ? [{ text: `${p.lead} `, bold: true }] : []), { text: p.body }], w - 0.02, pt);
    h += lines * ((pt * 1.2 * 1.08) / 72) + 7 / 72;
  }
  return r3(h);
}

// Georgia Bold advance widths (1/1000 em, ASCII 32-126), read from Gelasio, its
// metric-compatible render substitute. Georgia's old-style figures differ in
// width ("1" is narrow), so a character count misjudges where a title wraps.
const GEORGIA_BOLD = [254,376,510,703,641,879,799,269,447,447,482,703,328,379,328,472,701,490,626,625,649,599,648,554,676,648,367,367,703,703,703,548,967,758,757,715,834,721,671,807,913,446,595,817,686,1023,839,820,701,820,797,649,684,833,762,1126,809,732,689,447,472,447,703,703,500,596,646,531,663,572,393,577,680,354,346,632,344,1016,690,636,658,648,520,513,397,677,567,863,588,562,525,500,388,500,703];
const GEORGIA_WIDE: Record<string, number> = { "–": 703, "—": 928, "÷": 703, "’": 269, "‘": 269, "“": 519, "”": 519, "·": 338, "×": 703 };
const TITLE_PT = 20;

/** The lines an action title wraps to: Georgia Bold 20 across the content width, greedy by word, as the title box sets it. */
export function titleWrap(title: string): string[] {
  const width = (t: string) => {
    let units = 0;
    for (const ch of t) {
      const c = ch.codePointAt(0)!;
      units += c >= 32 && c < 127 ? GEORGIA_BOLD[c - 32]! : (GEORGIA_WIDE[ch] ?? 703);
    }
    return (units / 1000) * (TITLE_PT / 72);
  };
  const lines: string[] = [];
  let line = "";
  for (const word of printed(title).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && width(next) > CONTENT_W) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return [...lines, line];
}

// ---------------------------------------------------------------------------
// Block model
// ---------------------------------------------------------------------------

export interface ExhibitHeader {
  title: string;
  units?: string;
  /** The one annotation per exhibit, at most 45 characters, right-aligned on the header line. */
  annotation?: string;
}

export type NumColKind = "label" | "ref" | "num" | "text" | "obs" | "gap";

export interface NumCol {
  w: number;
  kind: NumColKind;
  head?: string;
  /** Tier-1 group label ("Fiscal year", "Growth"); adjacent columns with the same group share one merged cell. */
  group?: string;
  /** A string column inside a numeric table (Type, Basis): left-aligned, ink, body size. */
  left?: boolean;
}

export type NumRowType = "section" | "line" | "sub" | "subtotal" | "key" | "ratio";

export interface NumRow {
  type: NumRowType;
  label: string;
  /** Stable key an observation can point at ("revenue.total"); the letter is assigned by the exhibit. */
  key?: string;
  ref?: string;
  /** One entry per `num` column, in order. */
  vals?: string[];
  /** The `text` column's content (Context, Basis). */
  text?: string;
  obs?: string;
  /** Footnote marker appended to the label as a muted "(1)". */
  note?: string;
  /** Pending figures print in FF0000 italic (guide 2.4). */
  pending?: boolean;
}

export interface NumTableSpec {
  /** Name in the first header cell ("Income statement", "EBITDA ladder"). */
  name: string;
  cols: NumCol[];
  rows: NumRow[];
  rowH?: number;
  fontSize?: number;
}

/** A text-table cell: plain text, or a bold lead-in followed by regular text in the same cell (a ruled list). */
export type TextCell = string | { lead: string; body: string };

export const cellText = (c: TextCell): string => (typeof c === "string" ? c : `${c.lead} ${c.body}`);

export interface TextTableSpec {
  colW: number[];
  head?: string[];
  rows: TextCell[][];
  fontSize?: number;
  aligns?: ("left" | "right" | "center")[];
  obsCol?: number;
  refCol?: number;
  totalRow?: number;
  firstBold?: boolean;
  /** Rows whose first cell is bold even when `firstBold` is off (anchor rows of the process table). */
  boldRows?: number[];
  /** Stable key per row an observation can point at; the observation's letter lands in `obsCol`. */
  rowKeys?: string[];
}

export interface ObsItem {
  key: string;
  lead: string;
  body: string;
}

export type ChartSpec =
  | { type: "twinPanels"; panels: { caption: string; labels: string[]; values: number[] }[]; format?: string }
  | {
      type: "bars";
      series: { name: string; labels: string[]; values: number[] }[];
      grouping: "clustered" | "stacked" | "percentStacked";
      format?: string;
      colors?: string[];
      /** Data labels centred inside the bars (stacked mix) or outside the end. */
      labelPos?: "ctr" | "outEnd" | "inEnd";
      legend?: boolean;
      maxVal?: number;
    }
  | { type: "hbar"; labels: string[]; values: number[]; format?: string }
  | {
      type: "monthly";
      labels: string[];
      values: number[];
      format?: string;
    }
  | { type: "diverging"; labels: string[]; wins: number[]; losses: number[]; format?: string }
  /** Bridge from one total to another: totals in maroon, increases B5727A, decreases 5E5552 (guide 2.6). */
  | { type: "waterfall"; labels: string[]; steps: { value: number; total?: boolean }[]; format?: string };

export interface OrgNode {
  label: string;
  /** Second line: a name for management only, or a headcount. */
  detail?: string;
  children?: OrgNode[];
}

export type Block =
  | { kind: "numTable"; header?: ExhibitHeader; spec: NumTableSpec }
  | { kind: "textTable"; header?: ExhibitHeader; spec: TextTableSpec }
  | { kind: "chart"; header?: ExhibitHeader; spec: ChartSpec; h?: number }
  | { kind: "prose"; paragraphs: Paragraph[]; pt?: number }
  | { kind: "observations"; header: ExhibitHeader; items: ObsItem[] }
  | { kind: "callout"; lead: string; body: string }
  | { kind: "orgChart"; header?: ExhibitHeader; root: OrgNode; h?: number }
  | { kind: "spacer"; h: number };

export interface Column {
  span: [number, number];
  blocks: Block[];
}

export interface Row {
  columns: Column[];
  /** Blocks placed in whichever column ends higher after the fixed blocks (spec 1, column balance). */
  floating?: Block[];
}

export interface Notes {
  source?: string;
  note?: string;
  footnotes?: string[];
}

export interface PageSpec {
  /** Section-library id ("S6.1"). */
  id: string;
  /** Footer tracker section name. */
  section: string;
  title: string;
  rows: Row[];
  notes: Notes;
}

/** A block with its computed geometry, after layout. */
export interface PlacedBlock {
  block: Block;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidOutPage {
  spec: PageSpec;
  placed: PlacedBlock[];
  hairlines: { x: number; y0: number; y1: number }[];
  bottom: number;
  /** Fraction of the content band covered by blocks. */
  fill: number;
  /** Commentary words outside table cells and notes. */
  words: number;
  exhibits: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

const DEFAULT_CHART_H = 2.6;

/**
 * Row heights of a numeric table: the spec's 0.195 (0.19 on long lists) unless
 * a label, text column or header wraps, in which case the row takes the
 * wrapped height, so what is measured is what renders and nothing below the
 * table is overlapped.
 */
export function numTableRowHeights(spec: NumTableSpec): { head: number[]; rows: number[] } {
  const pt = spec.fontSize ?? 8.5;
  const base = spec.rowH ?? (spec.rows.length >= 12 ? 0.19 : 0.195);
  const twoTier = spec.cols.some((c) => c.group);
  const headLines = Math.max(
    1,
    ...spec.cols.map((c, i) => (c.kind === "gap" || (twoTier && !c.group) ? 1 : linesFor(i === 0 ? spec.name : (c.head ?? ""), c.w, 8, true))),
  );
  const tier2 = r3(Math.max(0.21, 0.07 + headLines * ((8 * 1.15) / 72)));
  const head = twoTier ? [0.21, tier2] : [tier2];
  const rows = spec.rows.map((r) => {
    let lines = 1;
    let v = 0;
    spec.cols.forEach((c) => {
      if (c.kind === "label") {
        const indent = r.type === "section" || r.type === "key" || r.type === "subtotal" ? 0.05 : r.type === "sub" ? 0.29 : 0.17;
        lines = Math.max(lines, linesFor(`${keepMarker(r.label)}${r.note ? `\u00a0(${r.note})` : ""}`, c.w - indent + 0.05, pt, r.type === "key" || r.type === "subtotal" || r.type === "section"));
      } else if (c.kind === "text" && r.type !== "section") lines = Math.max(lines, linesFor(r.text ?? "", c.w - 0.03, 8));
      else if (c.kind === "num") {
        if (c.left && r.type !== "section") lines = Math.max(lines, linesFor(r.vals?.[v] ?? "", c.w, pt));
        v += 1;
      }
    });
    return lines === 1 ? base : r3(Math.max(base, 0.06 + lines * ((pt * 1.15) / 72)));
  });
  return { head, rows };
}

export function numTableHeight(spec: NumTableSpec): number {
  const { head, rows } = numTableRowHeights(spec);
  return r3([...head, ...rows].reduce((a, b) => a + b, 0));
}

export function textTableRowHeights(spec: TextTableSpec): number[] {
  const pt = spec.fontSize ?? 8.5;
  return spec.rows.map((r, ri) =>
    rowHeightFor(
      r.map((c, i) =>
        typeof c === "string"
          ? { text: c, bold: (i === 0 && (spec.firstBold ?? true)) || spec.totalRow === ri || (spec.boldRows?.includes(ri) ?? false) }
          : { text: "", runs: [{ text: `${c.lead} `, bold: true }, { text: c.body }] },
      ),
      spec.colW,
      pt,
    ),
  );
}

export function textTableHeight(spec: TextTableSpec): number {
  return r3((spec.head ? 0.21 : 0) + textTableRowHeights(spec).reduce((s, v) => s + v, 0));
}

export function observationsHeight(items: ObsItem[], w: number): number {
  return r3(items.reduce((s, it) => s + observationHeight(it.lead, it.body, w - 0.3), 0));
}

/** Height of a block at width w, including its exhibit header when it has one. */
export function blockHeight(block: Block, w: number): number {
  const head = "header" in block && block.header ? SPACE.headerBody : 0;
  switch (block.kind) {
    case "numTable":
      return r3(head + numTableHeight(block.spec));
    case "textTable":
      return r3(head + textTableHeight(block.spec));
    case "chart":
      return r3(head + (block.h ?? DEFAULT_CHART_H));
    case "prose":
      return proseHeight(block.paragraphs, w, block.pt);
    case "observations":
      return r3(SPACE.headerBody + observationsHeight(block.items, w));
    case "callout":
      return calloutHeight(block.lead, block.body, w);
    case "orgChart":
      return r3(head + (block.h ?? 2.6));
    case "spacer":
      return block.h;
  }
}

/** Gap before `next` given what precedes it in the stack (spec 1 spacing table). */
export function gapBefore(prev: Block | undefined, next: Block): number {
  if (!prev) return 0;
  if (next.kind === "spacer" || prev.kind === "spacer") return 0;
  if (next.kind === "observations") return prev.kind === "chart" ? SPACE.chartToObs : SPACE.tableToObs;
  if (next.kind === "callout") return SPACE.callout;
  if (next.kind === "prose") return prev.kind === "prose" ? 0 : 0.16;
  const headed = "header" in next && next.header;
  if (!headed && (next.kind === "numTable" || next.kind === "textTable")) return SPACE.twoTables;
  return SPACE.exhibit;
}

export function blockWords(block: Block): number {
  const count = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  switch (block.kind) {
    case "prose":
      return block.paragraphs.reduce((s, p) => s + count(`${p.lead ?? ""} ${p.body}`), 0);
    case "observations":
      return block.items.reduce((s, it) => s + count(`${it.lead} ${it.body}`), 0);
    case "callout":
      return count(`${block.lead} ${block.body}`);
    default:
      return 0;
  }
}

export const isExhibit = (b: Block): boolean => b.kind === "numTable" || b.kind === "textTable" || b.kind === "chart" || b.kind === "orgChart";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function stackHeight(blocks: Block[], w: number): number {
  let h = 0;
  blocks.forEach((b, i) => {
    h += gapBefore(blocks[i - 1], b) + blockHeight(b, w);
  });
  return r3(h);
}

/**
 * Place every block of a page. Floating blocks go to the column that ends
 * highest; then, if the page overflows, it is fitted one step at a time
 * (`fitOverflow`) until it fits or nothing is left to give, in which case the
 * page is refused. No exhibit is ever dropped.
 */
// ---------------------------------------------------------------------------
// Footing (spec 14): totals against the figures printed above them
// ---------------------------------------------------------------------------

/** A printed table figure as a number: "$1,964" is 1964, "(25)" is -25, the dash is 0; a %, n.a. or blank is not a figure. */
function figure(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  if (t === EN_DASH) return 0;
  const m = /^(\()?\$?([\d,]+)(\))?$/.exec(t);
  if (!m || !!m[1] !== !!m[3]) return undefined;
  const v = Number(m[2]!.replace(/,/g, ""));
  return m[1] ? -v : v;
}

/**
 * Whether every total in a table equals the sum of the figures printed above
 * it, and a trailing LTM or Total column the sum of the months before it. A
 * total's parts are the lines since the previous total, or that total and the
 * lines after it (Total assets = Total current assets + the rest); a group
 * counts only when its printed parts come within 3 of the printed total in
 * every column, so a total built by subtraction (gross profit) is left alone.
 * A group that misses by 1 to 3 is rounding, and the page must say so.
 */
export function footsWhenDisplayed(spec: NumTableSpec): boolean {
  const heads = spec.cols.filter((c) => c.kind === "num").map((c) => c.head ?? "");
  const rows = spec.rows.filter((r) => r.vals);
  const misses = (total: NumRow, parts: NumRow[]): boolean | undefined => {
    const diffs: number[] = [];
    for (let c = 0; c < heads.length; c++) {
      const t = figure(total.vals![c]);
      const ps = parts.map((p) => figure(p.vals![c]));
      if (t === undefined || ps.some((v) => v === undefined)) continue;
      diffs.push(t - ps.reduce((sum, v) => sum! + v!, 0)!);
    }
    if (!diffs.length || diffs.some((d) => Math.abs(d) > 3)) return undefined;
    return diffs.some((d) => d !== 0);
  };
  let lastTotal = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.type !== "subtotal" && row.type !== "key") continue;
    const lines = rows.slice(lastTotal + 1, i).filter((r) => r.type === "line" || r.type === "sub");
    const own = lines.length >= 2 ? misses(row, lines) : undefined;
    const carried = lastTotal >= 0 && own === undefined ? misses(row, [rows[lastTotal]!, ...lines]) : undefined;
    if (own || carried) return false;
    lastTotal = i;
  }
  // Months across, then their LTM or total column.
  const last = heads.length - 1;
  const months = heads.slice(0, last).filter((h) => /^[A-Z][a-z]{2}-\d{2}$/.test(h)).length;
  if (last >= 3 && months === last && /^(LTM|Total)/.test(heads[last]!)) {
    for (const row of rows) {
      if (row.type === "ratio" || row.type === "section") continue;
      const t = figure(row.vals![last]);
      const ps = row.vals!.slice(0, last).map(figure);
      if (t === undefined || ps.some((v) => v === undefined)) continue;
      const d = t - ps.reduce((sum, v) => sum! + v!, 0)!;
      if (d !== 0 && Math.abs(d) <= months / 2) return false;
    }
  }
  return true;
}

/**
 * An Obs. column no observation keys into is dropped and its width given to
 * the widest text column (spec 14: no empty columns). Runs once the
 * observations have lettered their rows.
 */
export function dropEmptyObs(spec: PageSpec): void {
  for (const b of spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])])) {
    if (b.kind === "numTable") {
      const i = b.spec.cols.findIndex((c) => c.kind === "obs");
      if (i < 0 || b.spec.rows.some((r) => r.obs)) continue;
      const w = b.spec.cols[i]!.w;
      b.spec.cols = b.spec.cols.filter((_, j) => j !== i);
      const wide = b.spec.cols.reduce((best, c, j) => ((c.kind === "text" || c.kind === "label") && c.w > (b.spec.cols[best]?.w ?? 0) ? j : best), 0);
      b.spec.cols[wide] = { ...b.spec.cols[wide]!, w: r3(b.spec.cols[wide]!.w + w) };
    } else if (b.kind === "textTable" && b.spec.obsCol !== undefined) {
      const i = b.spec.obsCol;
      if (b.spec.rows.some((r) => cellText(r[i] ?? "").trim())) continue;
      const w = b.spec.colW[i]!;
      const keep = (_: unknown, j: number) => j !== i;
      b.spec.rows = b.spec.rows.map((r) => r.filter(keep));
      b.spec.head = b.spec.head?.filter(keep);
      b.spec.aligns = b.spec.aligns?.filter(keep);
      b.spec.colW = b.spec.colW.filter(keep);
      const wide = b.spec.colW.reduce((best, v, j) => (v > b.spec.colW[best]! ? j : best), 0);
      b.spec.colW[wide] = r3(b.spec.colW[wide]! + w);
      delete b.spec.obsCol;
    }
  }
}

/** The clause a page's note carries when a table on it does not foot as printed (spec 14). */
export const ROUNDING_CLAUSE = "totals may not sum due to rounding";

/** Append the rounding clause to the page note when any numeric table on the page does not foot as printed. */
export function noteRounding(spec: PageSpec): void {
  const tables = spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]).filter((b): b is Extract<Block, { kind: "numTable" }> => b.kind === "numTable");
  if (tables.every((t) => footsWhenDisplayed(t.spec)) || spec.notes.note?.includes(ROUNDING_CLAUSE)) return;
  const note = spec.notes.note?.trim();
  spec.notes = { ...spec.notes, note: note ? `${note.replace(/\.$/, "")}; ${ROUNDING_CLAUSE}.` : `Totals may not sum due to rounding.` };
}

export function layoutPage(spec: PageSpec): LaidOutPage {
  const warnings: string[] = [];
  let uneven: Uneven | undefined;
  const attempt = (page: PageSpec): LaidOutPage => {
    uneven = undefined;
    const placed: PlacedBlock[] = [];
    const hairlines: LaidOutPage["hairlines"] = [];
    let y = BAND.top;
    page.rows.forEach((row, ri) => {
      const cols = row.columns.map((c) => ({ ...c, blocks: [...c.blocks], x: colX(c.span[0]), w: spanW(c.span[0], c.span[1]) }));
      // A table inside a two-column block keeps 0.10 clear of the hairline (spec 1).
      for (const f of row.floating ?? []) {
        const heights = cols.map((c) => stackHeight(c.blocks, c.w));
        const target = heights.indexOf(Math.min(...heights));
        cols[target]!.blocks.push(f);
      }
      let rowBottom = y;
      const tops = y;
      for (const c of cols) {
        let cy = y;
        c.blocks.forEach((b, i) => {
          cy += gapBefore(c.blocks[i - 1], b);
          const h = blockHeight(b, c.w);
          placed.push({ block: b, x: c.x, y: r3(cy), w: c.w, h });
          cy = r3(cy + h);
        });
        rowBottom = Math.max(rowBottom, cy);
      }
      if (cols.length >= 2) {
        const ends = cols.map((c) => {
          const last = placed.filter((p) => p.x === c.x && p.y >= tops).at(-1);
          return last ? last.y + last.h : tops;
        });
        const gap = Math.max(...ends) - Math.min(...ends);
        if (gap > BALANCE && !uneven) uneven = { row: ri, long: ends.indexOf(Math.max(...ends)), short: ends.indexOf(Math.min(...ends)), gap };
        for (let i = 0; i < cols.length - 1; i++) {
          const isLast = ri === page.rows.length - 1;
          hairlines.push({ x: hairlineX(cols[i]!.span[1]), y0: tops, y1: isLast ? BAND.bottom : r3(rowBottom) });
        }
      }
      y = r3(rowBottom + SPACE.row);
    });
    const bottom = r3(y - SPACE.row);
    const area = placed.reduce((s, p) => s + p.w * p.h, 0);
    return {
      spec: page,
      placed,
      hairlines,
      bottom,
      fill: r3(area / (CONTENT_W * CONTENT_H)),
      words: placed.reduce((s, p) => s + blockWords(p.block), 0),
      exhibits: placed.filter((p) => isExhibit(p.block)).length,
      warnings,
    };
  };

  let page = spec;
  for (let guard = 0; guard < 12; guard++) {
    const out = attempt(page);
    if (out.bottom <= BAND.bottom + 1e-6) {
      const balanced = uneven && balanceColumns(page, uneven);
      if (balanced) {
        page = balanced;
        continue;
      }
      if (uneven) warnings.push(`${spec.id}: columns end ${uneven.gap.toFixed(2)} in apart`);
      return out;
    }
    const fitted = fitOverflow(page, out);
    if (!fitted) throw new Error(`Page ${spec.id} overflows the content band: ends at ${out.bottom.toFixed(2)} in (guard 6.48)`);
    warnings.push(`${spec.id}: ${fitted.note} to fit the page`);
    page = fitted.page;
  }
  throw new Error(`Page ${spec.id} could not be fitted`);
}

/** Spec 1: the columns of a row end within 0.50 in of each other. */
const BALANCE = 0.5;
/** Chart heights the balancing step may set: never under the spec's 2.60 in minimum (spec 5, spec 14), never past the band. */
const CHART_H = { min: 2.6, max: 4.3 };

interface Uneven {
  row: number;
  long: number;
  short: number;
  gap: number;
}

/**
 * Column balance (spec 1): a chart's height is the one free dimension on a
 * page, so a chart in the short column grows, or else one in the long column
 * shrinks, by the difference, within CHART_H. Undefined when no chart can
 * take it up; the page then keeps its layout and the run logs the gap.
 */
function balanceColumns(page: PageSpec, u: Uneven): PageSpec | undefined {
  const row = page.rows[u.row]!;
  const target = u.gap - BALANCE / 2;
  const resize = (col: number, by: (h: number) => number): PageSpec | undefined => {
    const blocks = row.columns[col]!.blocks;
    const i = blocks.map((b) => b.kind).lastIndexOf("chart");
    if (i < 0) return undefined;
    const b = blocks[i] as Extract<Block, { kind: "chart" }>;
    const from = b.h ?? DEFAULT_CHART_H;
    const h = r3(Math.min(CHART_H.max, Math.max(CHART_H.min, by(from))));
    if (Math.abs(h - from) < 0.05) return undefined;
    const columns = row.columns.map((c, j) => (j === col ? { ...c, blocks: c.blocks.map((x, k) => (k === i ? { ...b, h } : x)) } : c));
    return { ...page, rows: page.rows.map((r, j) => (j === u.row ? { ...r, columns } : r)) };
  };
  return resize(u.short, (h) => h + target) ?? resize(u.long, (h) => h - target);
}

/** The spec's floor for a table figure (spec 2: "no table figure below 8 pt"). */
const TABLE_FLOOR_PT = 8;

/**
 * One fitting step for an overflowing page, aimed at the column that runs past
 * the guard: drop its last observation, else set its numeric tables at the
 * 8 pt floor (a long adjustment label that wraps is the usual cause), else
 * drop an observation anywhere on the page, since an earlier row sets where
 * the overflowing row starts.
 */
function fitOverflow(page: PageSpec, out: LaidOutPage): { page: PageSpec; note: string } | undefined {
  const over = new Set(out.placed.filter((p) => p.y + p.h > BAND.bottom + 1e-6).map((p) => p.x));
  const inOverflow = new Set(out.placed.filter((p) => over.has(p.x)).map((p) => p.block));
  const replace = (pick: (b: Block) => Block | undefined): PageSpec | undefined => {
    let done = false;
    const visit = (b: Block): Block => {
      if (done) return b;
      const next = pick(b);
      if (!next) return b;
      done = true;
      return next;
    };
    const rows = page.rows.map((r) => ({
      columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map(visit) })),
      floating: r.floating?.map(visit),
    }));
    return done ? { ...page, rows } : undefined;
  };
  const dropObservation = (b: Block): Block | undefined => (b.kind === "observations" && b.items.length > 2 ? { ...b, items: b.items.slice(0, -1) } : undefined);
  const local = replace((b) => (inOverflow.has(b) ? dropObservation(b) : undefined));
  if (local) return { page: local, note: "dropped an observation" };
  const tightened = replace((b) => (inOverflow.has(b) && b.kind === "numTable" && (b.spec.fontSize ?? 8.5) > TABLE_FLOOR_PT ? { ...b, spec: { ...b.spec, fontSize: TABLE_FLOOR_PT } } : undefined));
  if (tightened) return { page: tightened, note: `set a table at ${TABLE_FLOOR_PT} pt` };
  const anywhere = replace(dropObservation);
  return anywhere ? { page: anywhere, note: "dropped an observation" } : undefined;
}

// ---------------------------------------------------------------------------
// Chart post-pass registry. pptxgenjs exposes neither per-series label colour
// nor the legend's manual layout, so the deck is patched after write(). Each
// chart registers its patch as it is added; pptxgenjs numbers chart files in
// add order and writes series in data order, so the pass finds them by
// position.
// ---------------------------------------------------------------------------

interface SeriesPatch {
  labelColor?: string;
  /** Per-series data-label number format (a decrease series prints in parentheses). */
  labelFormat?: string;
  whiteOutline?: boolean;
  /** No fill, no outline, no labels: the base series under a waterfall. */
  invisible?: boolean;
}

/** Layout the XML pass writes into one chart file: a top-left legend of a known height and the plot area beneath it. */
interface ChartPatch {
  /** The legend's box as fractions of the chart, anchored top-left; the plot area starts under it. */
  legendFraction?: { h: number; w: number };
  /** Anchor the chart title (a panel caption) at the top-left. */
  titleLeft?: boolean;
  /** Inner plot area as fractions of the chart, when the caller wants it fixed. */
  plot?: { y: number; h: number };
  /** Category labels wider than their category (quarter starts on a 36-month axis) stay on one line. */
  noWrap?: boolean;
  /** One entry per series, in data order. */
  series?: SeriesPatch[];
}

export class Deck {
  readonly pptx: Pptx;
  private readonly chartPatches: ChartPatch[] = [];

  constructor(title: string) {
    this.pptx = new PptxGenJS();
    this.pptx.layout = "LAYOUT_WIDE";
    this.pptx.author = "AMB Advisory Services LLC";
    this.pptx.company = "AMB Advisory Services LLC";
    this.pptx.title = title;
  }

  /** Register the chart about to be added. */
  noteChart(patch: ChartPatch = {}): void {
    this.chartPatches.push(patch);
  }

  async write(): Promise<Buffer> {
    const buf = (await this.pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return this.patchCharts(buf);
  }

  private async patchCharts(buf: Buffer): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    for (const f of names) {
      const n = Number(/chart(\d+)\.xml$/.exec(f)![1]);
      const cp = this.chartPatches[n - 1] ?? {};
      let xml = await zip.file(f)!.async("string");
      let si = 0;
      xml = xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
        const patch = cp.series?.[si++];
        return patch ? patchSeries(ser, patch) : ser;
      });
      let plot = cp.plot;
      if (cp.legendFraction !== undefined) {
        const lf = cp.legendFraction;
        xml = xml.replace(
          /<c:legend>[\s\S]*?<\/c:legend>/,
          (legend) =>
            legend.replace(/<c:layout\/>|<c:layout>[\s\S]*?<\/c:layout>/, "").replace(
              /<c:legendPos val="[a-z]+"\/>/,
              `<c:legendPos val="t"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0"/><c:y val="0"/><c:w val="${lf.w.toFixed(3)}"/><c:h val="${lf.h.toFixed(3)}"/></c:manualLayout></c:layout>`,
            ),
        );
        plot ??= { y: r3(lf.h + 0.04), h: r3(1 - lf.h - 0.04 - 0.14) };
      }
      if (cp.titleLeft) {
        xml = xml.replace(/(<c:title>[\s\S]*?<\/c:tx>)\s*<c:layout\/>/, '$1<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0"/><c:y val="0"/></c:manualLayout></c:layout>');
        plot ??= { y: 0.14, h: 0.7 };
      }
      if (plot) {
        xml = xml.replace(
          "<c:plotArea><c:layout/>",
          `<c:plotArea><c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.02"/><c:y val="${plot.y.toFixed(3)}"/><c:w val="0.96"/><c:h val="${plot.h.toFixed(3)}"/></c:manualLayout></c:layout>`,
        );
      }
      if (!xml.includes("<c:dispBlanksAs")) xml = xml.replace("</c:plotArea>", '</c:plotArea><c:dispBlanksAs val="gap"/>');
      // Category labels are never rotated (guide 2.6): an unset rotation lets renderers tilt crowded labels. Renderers break a
      // label wider than its category when the rotation is exactly 0, so an axis that must not wrap carries 0.01 degree.
      xml = xml.replace(/(<c:catAx>[\s\S]*?<c:txPr>\s*)<a:bodyPr\/>/, `$1<a:bodyPr rot="${cp.noWrap ? 600 : 0}" vert="horz"/>`);
      zip.file(f, xml);
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }
}

function patchSeries(ser: string, patch: SeriesPatch): string {
  let out = ser;
  if (patch.invisible) {
    out = out.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, "<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>");
    out = out.replace(/(<c:dLbls>[\s\S]*?)<c:showVal val="1"\/>/, '$1<c:showVal val="0"/>');
    return out;
  }
  if (patch.labelColor) out = out.replace(/(<c:dLbls>[\s\S]*?<a:srgbClr val=")[0-9A-Fa-f]{6}("\/>)/, `$1${patch.labelColor}$2`);
  if (patch.labelFormat) out = out.replace(/(<c:dLbls>\s*<c:numFmt formatCode=")[^"]*(")/, `$1${patch.labelFormat.replace(/"/g, "&quot;")}$2`);
  if (patch.whiteOutline) out = out.replace(/(<c:spPr>\s*<a:solidFill>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"\/>\s*<\/a:solidFill>)/, `$1<a:ln w="9525"><a:solidFill><a:srgbClr val="${C.white}"/></a:solidFill></a:ln>`);
  return out;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const NONE: BorderProps = { type: "none" };
const noBorder: [BorderProps, BorderProps, BorderProps, BorderProps] = [NONE, NONE, NONE, NONE];
const hair = (color: string, pt: number): BorderProps => ({ type: "solid", pt, color });

type Run = TextRun;

export function run(text: string, o: TextOpts = {}): Run {
  return { text, options: { fontFace: SANS, ...o } };
}

/** A rich run inside a table cell (pptxgenjs types cell runs as nested cells). */
function cellRun(text: string, o: TableCellProps = {}): TableCell {
  return { text, options: { fontFace: SANS, ...o } };
}

const PENDING = /(\[Confirm:[^\]]*\])/g;

/** Split text so every "[Confirm: …]" marker is set in FF0000 italic (guide 2.4). */
export function runsWithPending(text: string, o: TextOpts = {}): Run[] {
  const parts = text.split(PENDING).filter(Boolean);
  return parts.map((p) => (p.startsWith("[Confirm:") ? run(p, { ...o, italic: true, color: C.pending }) : run(p, o)));
}

function cellRuns(text: string, o: TableCellProps = {}): TableCell[] {
  const parts = text.split(PENDING).filter(Boolean);
  return parts.map((p) => (p.startsWith("[Confirm:") ? cellRun(p, { ...o, italic: true, color: C.pending }) : cellRun(p, o)));
}

export function text(slide: Slide, t: string | Run[], o: TextOpts): void {
  // Runs carry their own face, so a string inherits the box's face (Georgia titles) rather than the run default.
  const runs = typeof t === "string" ? runsWithPending(t, { fontSize: o.fontSize, color: o.color, bold: o.bold, ...(o.fontFace ? { fontFace: o.fontFace } : {}) }) : t;
  slide.addText(runs, { fontFace: SANS, color: C.ink, margin: 0, isTextBox: true, valign: "top", fit: "none", ...o });
}

export function hline(slide: Slide, x: number, y: number, w: number, color: string, width: number): void {
  slide.addShape("line", { x, y, w, h: 0, line: { color, width } });
}

export function vline(slide: Slide, x: number, y: number, h: number, color: string, width: number): void {
  slide.addShape("line", { x, y, w: 0, h, line: { color, width } });
}

export function rect(slide: Slide, x: number, y: number, w: number, h: number, fill: string, line?: { color: string; width: number }): void {
  slide.addShape("rect", { x, y, w, h, fill: { color: fill }, line: line ?? { color: fill, width: 0 } });
}

function cell(t: string | TableCell[], o: TableCellProps = {}): TableCell {
  const base: TableCellProps = { fontFace: SANS, fontSize: 8.5, color: C.ink, valign: "middle", border: noBorder, margin: [0, 0.05, 0, 0.05] };
  const txt = typeof t === "string" && t.includes("[Confirm:") ? cellRuns(t, { fontSize: o.fontSize ?? base.fontSize, color: o.color ?? base.color, bold: o.bold }) : t;
  return { text: txt, options: { ...base, ...o } };
}

/** Exhibit header (spec 6.2): bold title, two spaces, muted units; 0.5 pt ink rule 0.25 below; body at 0.33. Returns the body y. */
export function exhibitHeader(slide: Slide, x: number, y: number, w: number, h: ExhibitHeader): number {
  const runs = [run(h.title, { bold: true, color: C.ink, fontSize: 9.5 })];
  if (h.units) runs.push(run(`  ${h.units}`, { color: C.muted, fontSize: 9.5 }));
  const titleW = r3(textWidth(h.title, 9.5, true) + (h.units ? textWidth(`  ${h.units}`, 9.5) : 0) + 0.1);
  let annotation = h.annotation;
  if (annotation) {
    // The annotation takes what the title leaves; if that is too little it is shortened at a word boundary rather than overlapping.
    const room = w - titleW - 0.15;
    // An annotation that does not fit is dropped whole rather than cut mid-phrase.
    if (textWidth(annotation, 8) > room) annotation = undefined;
  }
  text(slide, runs, { x, y, w: annotation ? Math.min(titleW, w) : w, h: SPACE.headerRule, valign: "bottom", fontSize: 9.5 });
  if (annotation) text(slide, annotation, { x: r3(x + titleW), y, w: r3(w - titleW), h: SPACE.headerRule, valign: "bottom", align: "right", fontSize: 8, color: C.muted });
  hline(slide, x, r3(y + SPACE.headerRule), w, C.ink, 0.5);
  return r3(y + SPACE.headerBody);
}

/**
 * Numeric table (spec 4.1): maroon two-tier header with merged cells over
 * label, text and Obs. columns, FFE1E1 section rows, subtotals ruled 0.5 pt
 * ink on top, key totals ruled 0.75 pt maroon top and bottom, ratio rows
 * italic, white gap columns only between period groups.
 */
export function numTable(slide: Slide, x: number, y: number, spec: NumTableSpec): number {
  const { cols, rows, name } = spec;
  // A gap column only ever separates two blocks of figures; anywhere else it prints a detached header stub (spec 4.1 [F]).
  cols.forEach((c, i) => {
    if (c.kind === "gap" && !(cols[i - 1]?.kind === "num" && cols[i + 1]?.kind === "num")) throw new Error(`Table "${name}": a gap column must sit between two blocks of figures`);
  });
  const fontSize = spec.fontSize ?? 8.5;
  const heights = numTableRowHeights(spec);
  const colW = cols.map((c) => c.w);
  const w = r3(colW.reduce((s, v) => s + v, 0));
  const out: TableCell[][] = [];
  const rh: number[] = [];
  const twoTier = cols.some((c) => c.group);
  const headCell = (t: string, o: TableCellProps = {}) => cell(t, { fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, ...o });
  const gapCell = () => cell("", { margin: [0, 0, 0, 0] });
  // A header sits over its cells: Ref codes print left-aligned, so their header does too (QA round 2 F36).
  const headAlign = (c: NumCol, i: number): "left" | "right" | "center" => (i === 0 || c.kind === "label" || c.kind === "text" || c.kind === "ref" || c.left ? "left" : c.kind === "obs" ? "center" : "right");

  if (twoTier) {
    const tier1: TableCell[] = [];
    const tier2: TableCell[] = [];
    let i = 0;
    while (i < cols.length) {
      const c = cols[i]!;
      if (c.kind === "gap") {
        tier1.push(gapCell());
        tier2.push(gapCell());
        i += 1;
        continue;
      }
      if (!c.group) {
        // Merged cell spanning both tiers; the tier-2 array omits this position (pptxgenjs inserts the vMerge placeholder).
        tier1.push(headCell(i === 0 ? name : (c.head ?? ""), { rowspan: 2, align: headAlign(c, i), valign: "bottom" }));
        i += 1;
        continue;
      }
      let n = 1;
      while (i + n < cols.length && cols[i + n]!.kind !== "gap" && cols[i + n]!.group === c.group) n += 1;
      tier1.push(headCell(c.group, { colspan: n > 1 ? n : undefined, align: "center" }));
      for (let j = 0; j < n; j++) {
        const cc = cols[i + j]!;
        tier2.push(headCell(cc.head ?? "", { align: headAlign(cc, i + j) }));
      }
      i += n;
    }
    out.push(tier1, tier2);
    rh.push(...heights.head);
  } else {
    out.push(cols.map((c, i) => (c.kind === "gap" ? gapCell() : headCell(i === 0 ? name : (c.head ?? ""), { align: headAlign(c, i) }))));
    rh.push(...heights.head);
  }

  rows.forEach((r, ri) => {
    const isSection = r.type === "section";
    const isKey = r.type === "key";
    const isSubtotal = r.type === "subtotal";
    const isRatio = r.type === "ratio";
    const bold = isKey || isSubtotal;
    let v = 0;
    const cells = cols.map((c) => {
      if (c.kind === "gap") return gapCell();
      const o: TableCellProps = { fontSize, bold, italic: isRatio, valign: "middle" };
      if (isSection) o.fill = { color: C.section };
      if (isSubtotal) o.border = [hair(C.ink, 0.5), NONE, NONE, NONE];
      if (isKey) o.border = [hair(C.maroon, 0.75), NONE, hair(C.maroon, 0.75), NONE];
      if (r.pending) {
        o.italic = true;
        o.color = C.pending;
      }
      if (c.kind === "label") {
        const indent = isSection || isKey || isSubtotal ? 0.05 : r.type === "sub" ? 0.29 : 0.17;
        o.margin = [0, 0.05, 0, indent];
        o.align = "left";
        if (isSection) o.bold = true;
        const label = r.note ? [cellRun(keepMarker(r.label), { fontSize, bold: o.bold, italic: o.italic, color: o.color ?? C.ink }), cellRun(`\u00a0(${r.note})`, { fontSize: 7, color: C.muted })] : keepMarker(r.label);
        return cell(label, o);
      }
      if (c.kind === "ref") return cell(isSection ? "" : (r.ref ?? ""), { ...o, align: "left", color: C.muted, bold: false, italic: false, fontSize: 8 });
      if (c.kind === "obs") return cell(isSection ? "" : (r.obs ?? ""), { ...o, align: "center", color: C.maroon, bold: true, italic: false });
      if (c.kind === "text") return cell(isSection ? "" : (r.text ?? ""), { ...o, align: "left", color: C.muted, fontSize: 8, bold: false, italic: false, margin: [0, 0.05, 0, 0.08] });
      const val = isSection ? "" : (r.vals?.[v] ?? "");
      v += 1;
      return cell(val, { ...o, align: c.left ? "left" : "right" });
    });
    out.push(cells);
    rh.push(heights.rows[ri]!);
  });
  slide.addTable(out, { x, y, w, colW, rowH: rh, autoPage: false, fontFace: SANS });
  return r3(y + rh.reduce((s, h) => s + h, 0));
}

/** Text table (spec 4.2): single maroon header, rows sized from their longest cell, 0.5 pt rule between rows, first column bold. */
export function textTable(slide: Slide, x: number, y: number, spec: TextTableSpec): number {
  const fontSize = spec.fontSize ?? 8.5;
  const colW = spec.colW;
  const w = r3(colW.reduce((s, v) => s + v, 0));
  const out: TableCell[][] = [];
  const rh: number[] = [];
  if (spec.head) {
    out.push(spec.head.map((h, i) => cell(h, { fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, align: spec.aligns?.[i] ?? "left", valign: "middle" })));
    rh.push(0.21);
  }
  const heights = textTableRowHeights(spec);
  spec.rows.forEach((r, ri) => {
    out.push(
      r.map((t, i) => {
        const o: TableCellProps = { fontSize, valign: "top", align: spec.aligns?.[i] ?? "left", margin: [0.035, 0.05, 0.035, 0.05], border: [NONE, NONE, hair(C.rule, 0.5), NONE] };
        if (i === 0 && (spec.firstBold ?? true)) o.bold = true;
        if (spec.boldRows?.includes(ri)) o.bold = true;
        if (spec.obsCol === i) Object.assign(o, { color: C.maroon, bold: true, align: "center" });
        if (spec.refCol === i) o.color = C.muted;
        if (spec.totalRow === ri) Object.assign(o, { bold: true, border: [hair(C.maroon, 0.75), NONE, hair(C.maroon, 0.75), NONE] });
        if (typeof t !== "string") {
          o.bold = false;
          return cell([cellRun(`${t.lead} `, { bold: true, fontSize, color: C.ink }), ...cellRuns(t.body, { fontSize, color: C.ink })], o);
        }
        return cell(t, o);
      }),
    );
    rh.push(heights[ri]!);
  });
  slide.addTable(out, { x, y, w, colW, rowH: rh, autoPage: false, fontFace: SANS });
  return r3(y + rh.reduce((s, h) => s + h, 0));
}

/** Observations (spec 4.4): letter column and a bold-lead text column, items separated by 0.5 pt rules; no header row. */
export function observations(slide: Slide, x: number, y: number, w: number, items: ObsItem[]): number {
  const fontSize = 9;
  const letterW = 0.3;
  const textW = r3(w - letterW);
  const rows = items.map((_, i) => {
    const it = items[i]!;
    const border: [BorderProps, BorderProps, BorderProps, BorderProps] = [NONE, NONE, i < items.length - 1 ? hair(C.rule, 0.5) : NONE, NONE];
    return [
      cell(it.key, { bold: true, color: C.maroon, fontSize: 9.5, valign: "top", align: "left", margin: [0.04, 0, 0.05, 0.02], border }),
      cell([cellRun(`${it.lead} `, { bold: true, fontSize, color: C.ink }), ...cellRuns(it.body, { fontSize, color: C.ink })], { valign: "top", margin: [0.04, 0.02, 0.05, 0], border }),
    ];
  });
  const rh = items.map((it) => observationHeight(it.lead, it.body, textW, fontSize));
  slide.addTable(rows, { x, y, w, colW: [letterW, textW], rowH: rh, autoPage: false, fontFace: SANS });
  return r3(y + rh.reduce((s, h) => s + h, 0));
}

/** Callout (spec 6.5): F5EDEC fill, 2.25 pt maroon left rule, bold maroon lead-in. */
export function callout(slide: Slide, x: number, y: number, w: number, lead: string, body: string): number {
  const h = calloutHeight(lead, body, w);
  rect(slide, x, y, w, h, C.tint);
  vline(slide, x, y, h, C.maroon, 2.25);
  text(slide, [run(`${lead} `, { bold: true, color: C.maroon, fontSize: 9 }), ...runsWithPending(body, { color: C.ink, fontSize: 9 })], {
    x: r3(x + 0.14), y: r3(y + 0.02), w: r3(w - 0.24), h: r3(h - 0.04), valign: "middle", fontSize: 9, lineSpacingMultiple: 1.08,
  });
  return r3(y + h);
}

/** Run-in prose paragraphs (spec 2): Arial 9.5, bold lead-ins, 1.08 leading, 7 pt after. */
export function prose(slide: Slide, x: number, y: number, w: number, paragraphs: Paragraph[], pt = 9.5): number {
  const h = proseHeight(paragraphs, w, pt);
  const runs: Run[] = [];
  paragraphs.forEach((p, i) => {
    if (p.lead) runs.push(run(`${p.lead} `, { bold: true, fontSize: pt, color: C.ink }));
    const body = runsWithPending(p.body, { fontSize: pt, color: C.ink });
    const last = body[body.length - 1];
    if (last && i < paragraphs.length - 1) last.options = { ...last.options, breakLine: true };
    runs.push(...body);
  });
  text(slide, runs, { x, y, w, h, fontSize: pt, valign: "top", lineSpacingMultiple: 1.08, paraSpaceAfter: 7 });
  return r3(y + h);
}

/** Native org chart: square 0.5 pt boxes with role and headcount, names for management only (guide 2.10 T23). */
export function orgChart(slide: Slide, x: number, y: number, w: number, root: OrgNode, h = 2.6): number {
  const boxH = 0.5;
  const draw = (node: OrgNode, cx: number, cy: number, bw: number) => {
    rect(slide, r3(cx - bw / 2), cy, bw, boxH, C.white, { color: C.ink, width: 0.5 });
    const runs = [run(node.label, { bold: true, fontSize: 8.5, color: C.ink })];
    if (node.detail) runs.push(run(node.detail, { fontSize: 8, color: C.muted, breakLine: false }));
    text(slide, node.detail ? [runs[0]!, run("\n", { fontSize: 8 }), runs[1]!] : runs, { x: r3(cx - bw / 2 + 0.04), y: cy, w: r3(bw - 0.08), h: boxH, align: "center", valign: "middle", fontSize: 8.5 });
  };
  const levels: OrgNode[][] = [[root]];
  while (levels[levels.length - 1]!.some((n) => n.children?.length)) levels.push(levels[levels.length - 1]!.flatMap((n) => n.children ?? []));
  const levelGap = r3((h - boxH * levels.length) / Math.max(1, levels.length - 1));
  const positions = new Map<OrgNode, number>();
  // Leaves spread evenly across the width; parents centre over their children.
  const leaves = levels[levels.length - 1]!;
  const slot = w / leaves.length;
  leaves.forEach((n, i) => positions.set(n, r3(x + slot * (i + 0.5))));
  for (let l = levels.length - 2; l >= 0; l--) {
    for (const n of levels[l]!) {
      const kids = n.children ?? [];
      const xs = kids.map((k) => positions.get(k)!);
      positions.set(n, kids.length ? r3((Math.min(...xs) + Math.max(...xs)) / 2) : r3(x + w / 2));
    }
  }
  levels.forEach((nodes, l) => {
    const cy = r3(y + l * (boxH + levelGap));
    const bw = Math.min(2.2, r3(slot - 0.12));
    for (const n of nodes) {
      draw(n, positions.get(n)!, cy, l === levels.length - 1 ? bw : Math.min(2.4, bw + 0.3));
      const kids = n.children ?? [];
      if (kids.length) {
        const midY = r3(cy + boxH + levelGap / 2);
        vline(slide, positions.get(n)!, r3(cy + boxH), r3(levelGap / 2), C.ink, 0.5);
        const xs = kids.map((k) => positions.get(k)!);
        hline(slide, Math.min(...xs), midY, r3(Math.max(...xs) - Math.min(...xs)), C.ink, 0.5);
        for (const k of kids) vline(slide, positions.get(k)!, midY, r3(levelGap / 2), C.ink, 0.5);
      }
    }
  });
  return r3(y + h);
}

// ---------------------------------------------------------------------------
// Charts (spec 5): native only, 2.6 palette, no dual axes, no gridlines.
// ---------------------------------------------------------------------------

const chartBase: ChartOpts = {
  barDir: "col",
  barGapWidthPct: 60,
  showValue: true,
  dataLabelFontFace: SANS,
  dataLabelFontSize: 8,
  dataLabelColor: C.ink,
  catAxisLabelFontFace: SANS,
  catAxisLabelFontSize: 8,
  catAxisLabelColor: C.muted,
  catAxisLineShow: true,
  catAxisLineColor: C.rule,
  catAxisLineSize: 0.5,
  catAxisMajorTickMark: "none",
  valAxisHidden: true,
  valGridLine: { style: "none" },
  catGridLine: { style: "none" },
  showTitle: false,
  legendFontFace: SANS,
  legendFontSize: 8,
  legendColor: C.ink,
  plotArea: { fill: { color: C.white } },
  chartArea: { fill: { color: C.white } },
};

/** Category labels never wrap at a hyphen ("Jan-25" stays on one line). */
const nb = (labels: string[]): string[] => labels.map((l) => l.replace(/-/g, "‑"));

/** Rows a top-left legend needs at 8 pt across a chart of width w, and the fraction of height h they take. */
function legendFraction(names: string[], w: number, h: number): { h: number; w: number } {
  const width = names.reduce((s, n) => s + n.length * charW(8) + 0.35, 0);
  const rows = Math.max(1, Math.ceil(width / w));
  return { h: r3((rows * 0.17) / h), w: r3(Math.min(1, width / w + 0.02)) };
}

const labelOn = (fill: string): string => (DARK_FILLS.has(fill) ? C.white : C.ink);
const maxOf = (vals: number[]): number => Math.max(0, ...vals.filter((v) => Number.isFinite(v)));

/** Waterfall as stacked bars over an invisible base: one series each for totals, increases and decreases. */
export function waterfallSeries(steps: { value: number; total?: boolean }[]): { base: number[]; total: number[]; up: number[]; down: number[] } {
  const base: number[] = [];
  const total: number[] = [];
  const up: number[] = [];
  const down: number[] = [];
  let run = 0;
  for (const s of steps) {
    if (s.total) {
      run = s.value;
      base.push(0), total.push(s.value), up.push(0), down.push(0);
    } else if (s.value >= 0) {
      base.push(run), total.push(0), up.push(s.value), down.push(0);
      run += s.value;
    } else {
      run += s.value;
      base.push(run), total.push(0), up.push(0), down.push(-s.value);
    }
  }
  return { base, total, up, down };
}

export function chart(deck: Deck, slide: Slide, x: number, y: number, w: number, spec: ChartSpec, hOverride?: number): number {
  const h = hOverride ?? DEFAULT_CHART_H;
  const fmt = spec.format ?? "#,##0";
  switch (spec.type) {
    case "twinPanels": {
      const pw = r3((w - 0.2 * (spec.panels.length - 1)) / spec.panels.length);
      spec.panels.forEach((p, i) => {
        deck.noteChart({ titleLeft: true, plot: { y: 0.12, h: 0.72 } });
        slide.addChart("bar", [{ name: p.caption, labels: nb(p.labels), values: p.values }], {
          ...chartBase,
          x: r3(x + i * (pw + 0.2)),
          y,
          w: pw,
          h,
          chartColors: [C.maroon],
          dataLabelPosition: "outEnd",
          dataLabelFormatCode: fmt,
          showLegend: false,
          showTitle: true,
          title: p.caption,
          titleFontFace: SANS,
          titleFontSize: 8,
          titleColor: C.muted,
          valAxisMaxVal: Math.ceil(maxOf(p.values) * 1.2),
          valAxisMinVal: 0,
        });
      });
      return r3(y + h);
    }
    case "bars": {
      const colors = spec.colors ?? (spec.series.length <= 2 ? SERIES2 : SERIES4);
      const stacked = spec.grouping !== "clustered";
      const legend = spec.legend ?? spec.series.length > 1;
      deck.noteChart({
        ...(legend ? { legendFraction: legendFraction(spec.series.map((s) => s.name), w, h) } : {}),
        series: spec.series.map((_, i) => ({ labelColor: stacked ? labelOn(colors[i % colors.length]!) : C.ink, whiteOutline: stacked })),
      });
      const top = stacked ? undefined : (spec.maxVal ?? Math.ceil(maxOf(spec.series.flatMap((s) => s.values)) * 1.2));
      slide.addChart(
        "bar",
        spec.series.map((s) => ({ name: s.name, labels: nb(s.labels), values: s.values })),
        {
          ...chartBase,
          x, y, w, h,
          barGrouping: spec.grouping,
          chartColors: colors,
          dataLabelPosition: spec.labelPos ?? (stacked ? "ctr" : "outEnd"),
          dataLabelFormatCode: fmt,
          showLegend: legend,
          legendPos: "t",
          valAxisMaxVal: top,
          valAxisMinVal: 0,
        },
      );
      return r3(y + h);
    }
    case "hbar": {
      deck.noteChart();
      // Category order top to bottom follows the data; pptxgenjs types only offer minMax, the XML accepts maxMin.
      const opts = {
        ...chartBase,
        x, y, w, h,
        barDir: "bar",
        chartColors: [C.maroon],
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: fmt,
        showLegend: false,
        catAxisLabelColor: C.ink,
        // Changes can fall below zero; the category labels then stay at the left edge, clear of the bars.
        valAxisMaxVal: Math.ceil(maxOf(spec.values) * 1.25),
        valAxisMinVal: Math.min(0, Math.floor(Math.min(...spec.values) * 1.25)),
        catAxisLabelPos: "low",
        catAxisOrientation: "maxMin",
      } as unknown as ChartOpts;
      slide.addChart("bar", [{ name: "Value", labels: nb(spec.labels), values: spec.values }], opts);
      return r3(y + h);
    }
    case "monthly": {
      // One maroon series, every bar labelled up to 36 bars, no legend (guide 2.6 monthly series). Above 16 bars only quarter
      // starts are labelled; the other categories print blank, which every renderer honours, where LibreOffice ignores a skip interval.
      const quarterly = spec.labels.length > 16;
      const labels = nb(spec.labels.map((l) => (!quarterly || /^(Jan|Apr|Jul|Oct)-/.test(l) ? l : "")));
      deck.noteChart({ noWrap: quarterly });
      slide.addChart("bar", [{ name: "Monthly", labels, values: spec.values }], {
        ...chartBase,
        x, y, w, h,
        chartColors: [C.maroon],
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: fmt,
        showLegend: false,
        valAxisMaxVal: Math.ceil(maxOf(spec.values) * 1.18),
        valAxisMinVal: 0,
      });
      return r3(y + h);
    }
    case "diverging": {
      deck.noteChart({ legendFraction: legendFraction(["Wins", "Losses"], w, h), series: [{ labelColor: C.ink }, { labelColor: C.ink }] });
      slide.addChart(
        "bar",
        [
          { name: "Wins", labels: nb(spec.labels), values: spec.wins },
          { name: "Losses", labels: nb(spec.labels), values: spec.losses.map((v) => -Math.abs(v)) },
        ],
        {
          ...chartBase,
          x, y, w, h,
          barGrouping: "stacked",
          chartColors: [C.maroon, C.slate],
          dataLabelPosition: "outEnd",
          dataLabelFormatCode: '#,##0;#,##0;""',
          showLegend: true,
          legendPos: "t",
          catAxisLabelPos: "low",
        },
      );
      return r3(y + h);
    }
    case "waterfall": {
      const s = waterfallSeries(spec.steps);
      const labels = nb(spec.labels);
      deck.noteChart({
        series: [
          { invisible: true },
          { labelColor: C.white },
          { labelColor: C.ink },
          { labelColor: C.white, labelFormat: `(${fmt});(${fmt});""` },
        ],
      });
      const top = Math.ceil(maxOf(s.base.map((b, i) => b + s.total[i]! + s.up[i]! + s.down[i]!)) * 1.08);
      slide.addChart(
        "bar",
        [
          { name: "Base", labels, values: s.base },
          { name: "Total", labels, values: s.total },
          { name: "Increase", labels, values: s.up },
          { name: "Decrease", labels, values: s.down },
        ],
        {
          ...chartBase,
          x, y, w, h,
          barGrouping: "stacked",
          chartColors: [C.white, C.maroon, C.estimate, C.slate],
          dataLabelPosition: "ctr",
          dataLabelFormatCode: `${fmt};(${fmt});""`,
          showLegend: false,
          valAxisMaxVal: top,
          valAxisMinVal: 0,
        },
      );
      return r3(y + h);
    }
  }
}

// ---------------------------------------------------------------------------
// Page furniture (spec 6), cover (7.1), divider (7.2), contents (guide 2.9)
// ---------------------------------------------------------------------------

export interface Furniture {
  code: string;
  section: string;
  num: number;
  title: string;
  notes: Notes;
}

/** Notes band lines (spec 6.3): Source, Note, then every footnote on one line separated by three spaces. */
export function notesLines(n: Notes): string[] {
  const lines: string[] = [];
  if (n.source) lines.push(`Source: ${n.source}`);
  if (n.note) lines.push(`Note: ${n.note}`);
  if (n.footnotes?.length) lines.push(n.footnotes.map((f, i) => `(${i + 1}) ${f}`).join("   "));
  return lines;
}

/** Rendered line count of the notes band at 7 pt across the content width; the build refuses a fourth line. */
export function notesLineCount(n: Notes): number {
  return notesLines(n).reduce((s, l) => s + linesFor(l, CONTENT_W + 0.1, 7), 0);
}

export function drawFurniture(slide: Slide, f: Furniture): void {
  slide.background = { color: C.white };
  if (f.title.length > 130) throw new Error(`Title over 130 characters on page ${f.num}: ${f.title}`);
  text(slide, f.title, { x: colX(1), y: BAND.titleY, w: CONTENT_W, h: BAND.titleH, fontFace: SERIF, fontSize: TITLE_PT, bold: true, color: C.maroon, valign: "bottom", lineSpacingMultiple: 1.0 });
  hline(slide, colX(1), BAND.ruleY, CONTENT_W, C.maroon, 0.75);
  const lines = notesLines(f.notes);
  if (notesLineCount(f.notes) > 3) throw new Error(`Notes band on page ${f.num} needs more than three lines`);
  if (lines.length) {
    text(
      slide,
      lines.flatMap((t, i) => runsWithPending(t, { fontSize: 7, color: C.muted }).map((r, j, arr) => (j === arr.length - 1 && i < lines.length - 1 ? { ...r, options: { ...r.options, breakLine: true } } : r))),
      { x: colX(1), y: BAND.notesTop - 0.08, w: CONTENT_W, h: r3(BAND.notesBottom - BAND.notesTop + 0.08), valign: "bottom", fontSize: 7, color: C.muted, lineSpacingMultiple: 1.0 },
    );
  }
  drawFooter(slide, f.code, f.section, f.num);
}

export function drawFooter(slide: Slide, code: string, section: string | undefined, num: number): void {
  hline(slide, colX(1), BAND.footRuleY, CONTENT_W, C.rule, 0.5);
  if (section) {
    text(slide, [run(code, { color: C.muted, fontSize: 7.5 }), run("  |  ", { color: C.muted, fontSize: 7.5 }), run(section, { color: C.maroon, fontSize: 7.5 })], { x: colX(1), y: BAND.footY, w: 4.5, h: BAND.footH, valign: "middle", fontSize: 7.5 });
  }
  text(slide, "Strictly private and confidential", { x: 4.0, y: BAND.footY, w: 5.333, h: BAND.footH, valign: "middle", align: "center", fontSize: 7.5, color: C.muted });
  const lh = 0.22;
  const lw = r3(lh * LOGO_ASPECT);
  slide.addImage({ path: LOGO_COLOUR, x: r3(12.3 - lw), y: r3(BAND.footY + (BAND.footH - lh) / 2), w: lw, h: lh });
  text(slide, String(num), { x: 12.35, y: BAND.footY, w: r3(RIGHT - 12.35), h: BAND.footH, valign: "middle", align: "right", fontSize: 8, color: C.ink });
}

export interface CoverSpec {
  codename: string;
  date: string;
  /** Sector and metro, off by default; the advisor switches it on once the teaser has disclosed both. */
  descriptor?: string;
  city: string;
  web: string;
}

export function drawCover(slide: Slide, c: CoverSpec): void {
  slide.background = { color: C.maroon };
  rect(slide, 0, 0, PAGE.w, PAGE.h, C.maroon);
  const lw = 2.4;
  slide.addImage({ path: LOGO_WHITE, x: 0.7, y: 0.62, w: lw, h: r3(lw / LOGO_ASPECT) });
  text(slide, c.codename, { x: 0.7, y: 3.05, w: 11.0, h: 0.85, fontFace: SERIF, fontSize: 40, color: C.white, valign: "bottom" });
  hline(slide, 0.72, 4.05, 2.0, C.gold, 1);
  text(slide, "Confidential Information Memorandum", { x: 0.7, y: 4.18, w: 9.0, h: 0.32, fontSize: 16, color: C.white });
  if (c.descriptor) text(slide, c.descriptor, { x: 0.7, y: 4.58, w: 11.0, h: 0.24, fontSize: 11, color: C.onMaroon });
  text(slide, c.date, { x: 0.7, y: c.descriptor ? 4.86 : 4.56, w: 6.0, h: 0.24, fontSize: 11, color: C.onMaroon });
  text(slide, "Strictly private and confidential. Prepared by AMB Advisory Services LLC for recipients who have executed a confidentiality agreement with AMB Advisory.", { x: 0.7, y: 6.72, w: 9.0, h: 0.24, fontSize: 8, color: C.onMaroon, valign: "middle" });
  text(slide, `${c.city}  ·  ${c.web}`, { x: 9.7, y: 6.72, w: r3(12.633 - 9.7), h: 0.24, fontSize: 8, color: C.onMaroon, valign: "middle", align: "right" });
}

export interface SectionEntry {
  name: string;
  page: number;
}

/** Divider (spec 7.2): maroon panel with the section name and its exhibit list; the full section list on the right. */
export function drawDivider(slide: Slide, code: string, current: SectionEntry, exhibits: { title: string; page: number }[], sections: SectionEntry[], num: number): void {
  slide.background = { color: C.white };
  rect(slide, 0, 0, 4.6, PAGE.h, C.maroon);
  text(slide, current.name, { x: 0.7, y: 2.6, w: 3.6, h: 1.4, fontFace: SERIF, fontSize: 28, color: C.white, valign: "bottom" });
  if (exhibits.length) {
    text(slide, "Exhibits in this section", { x: 0.7, y: 4.3, w: 3.4, h: 0.22, fontSize: 9, bold: true, color: C.onMaroon, valign: "middle" });
    exhibits.slice(0, 8).forEach((e, i) => {
      const y = r3(4.55 + i * 0.22);
      text(slide, e.title, { x: 0.7, y, w: 2.9, h: 0.22, fontSize: 9, color: C.onMaroon, valign: "middle" });
      text(slide, String(e.page), { x: 3.6, y, w: 0.5, h: 0.22, fontSize: 9, color: C.onMaroon, valign: "middle", align: "right" });
    });
  }
  sections.forEach((s, i) => {
    const y = r3(1.3 + i * 0.5);
    const isCurrent = s.name === current.name;
    text(slide, s.name, { x: 5.4, y, w: 6.0, h: 0.5, fontSize: 13, bold: isCurrent, color: isCurrent ? C.maroon : C.muted, valign: "middle" });
    text(slide, String(s.page), { x: 11.4, y, w: 1.0, h: 0.5, fontSize: 13, bold: isCurrent, color: isCurrent ? C.maroon : C.muted, valign: "middle", align: "right" });
    hline(slide, 5.4, r3(y + 0.5), 7.0, C.rule, 0.5);
  });
  drawFooter(slide, code, undefined, num);
}

/** Contents (guide 2.9): the section list at cols 1 to 7 with page numbers, no highlight. */
export function drawContents(slide: Slide, code: string, sections: SectionEntry[], num: number): void {
  slide.background = { color: C.white };
  text(slide, "Contents", { x: colX(1), y: BAND.titleY, w: CONTENT_W, h: BAND.titleH, fontFace: SERIF, fontSize: TITLE_PT, bold: true, color: C.maroon, valign: "bottom" });
  hline(slide, colX(1), BAND.ruleY, CONTENT_W, C.maroon, 0.75);
  const w = spanW(1, 7);
  sections.forEach((s, i) => {
    const y = r3(BAND.top + i * 0.5);
    text(slide, s.name, { x: colX(1), y, w: r3(w - 0.8), h: 0.5, fontSize: 13, color: C.muted, valign: "middle" });
    text(slide, String(s.page), { x: r3(colX(1) + w - 0.8), y, w: 0.8, h: 0.5, fontSize: 13, color: C.muted, valign: "middle", align: "right" });
    hline(slide, colX(1), r3(y + 0.5), w, C.rule, 0.5);
  });
  drawFooter(slide, code, undefined, num);
}

// ---------------------------------------------------------------------------
// Rendering a laid-out page
// ---------------------------------------------------------------------------

export function renderPage(deck: Deck, slide: Slide, page: LaidOutPage, furniture: Omit<Furniture, "title" | "notes" | "section">): void {
  drawFurniture(slide, { ...furniture, title: page.spec.title, notes: page.spec.notes, section: page.spec.section });
  for (const hl of page.hairlines) vline(slide, hl.x, hl.y0, r3(hl.y1 - hl.y0), C.rule, 0.5);
  for (const p of page.placed) drawBlock(deck, slide, p);
}

function drawBlock(deck: Deck, slide: Slide, p: PlacedBlock): void {
  const b = p.block;
  let y = p.y;
  if ("header" in b && b.header) y = exhibitHeader(slide, p.x, p.y, p.w, b.header);
  switch (b.kind) {
    case "numTable": {
      const w = b.spec.cols.reduce((s, c) => s + c.w, 0);
      if (w > p.w + 0.011) throw new Error(`Numeric table "${b.spec.name}" is ${w.toFixed(2)} in wide in a ${p.w.toFixed(2)} in column`);
      numTable(slide, p.x, y, b.spec);
      return;
    }
    case "textTable": {
      const w = b.spec.colW.reduce((s, c) => s + c, 0);
      if (w > p.w + 0.011) throw new Error(`Text table "${b.header?.title ?? b.spec.head?.join("|")}" is ${w.toFixed(2)} in wide in a ${p.w.toFixed(2)} in column`);
      textTable(slide, p.x, y, b.spec);
      return;
    }
    case "chart":
      chart(deck, slide, p.x, y, p.w, b.spec, b.h);
      return;
    case "prose":
      prose(slide, p.x, y, p.w, b.paragraphs, b.pt);
      return;
    case "observations":
      // The header is already drawn above, like every other block's.
      observations(slide, p.x, y, p.w, b.items);
      return;
    case "callout":
      callout(slide, p.x, y, p.w, b.lead, b.body);
      return;
    case "orgChart":
      orgChart(slide, p.x, y, p.w, b.root, b.h);
      return;
    case "spacer":
      return;
  }
}

/** True when the logo assets exist; the pipeline checks this once so a missing brand file fails early. */
export function assetsPresent(): boolean {
  return fs.existsSync(LOGO_COLOUR) && fs.existsSync(LOGO_WHITE);
}
