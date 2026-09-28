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
// Text measurement (spec 4.2). Arial and Liberation Sans are metric-compatible.
// ---------------------------------------------------------------------------

/** Average Arial advance in inches at a point size. */
export const charW = (pt: number, bold = false): number => ((bold ? 0.54 : 0.5) * pt) / 72;

/** Lines a string wraps to in a box `w` wide with 0.10 in of side margins. */
export function linesFor(text: string, w: number, pt: number, bold = false): number {
  const usable = Math.max(0.2, w - 0.1);
  let lines = 0;
  for (const para of text.split("\n")) lines += Math.max(1, Math.ceil((para.length * charW(pt, bold)) / usable));
  return lines;
}

/** Text-table row height from its longest cell: 0.07 + lines x (pt x 1.15 / 72). */
export function rowHeightFor(cells: { text: string; bold?: boolean }[], colW: number[], pt: number): number {
  let lines = 1;
  cells.forEach((c, i) => {
    lines = Math.max(lines, linesFor(c.text, colW[i] ?? 1, pt, c.bold));
  });
  return r3(0.07 + lines * ((pt * 1.15) / 72));
}

/** Observation item height: 0.09 + lines x 0.145 at 9 pt, from the text column's width. */
export function observationHeight(lead: string, body: string, textW: number, pt = 9): number {
  const lines = Math.max(1, Math.ceil(((lead.length + 1) * charW(pt, true) + body.length * charW(pt)) / Math.max(0.5, textW - 0.1)));
  return r3(0.09 + lines * ((pt * 1.16) / 72));
}

/** Callout height: 0.10 + lines x 0.155 at 9 pt inside the 0.14 / 0.10 insets. */
export function calloutHeight(lead: string, body: string, w: number, pt = 9): number {
  const usable = w - 0.24;
  const lines = Math.max(1, Math.ceil(((lead.length + 1) * charW(pt, true) + body.length * charW(pt)) / usable));
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
    const chars = (p.lead ? (p.lead.length + 1) * 1.08 : 0) + p.body.length;
    const lines = Math.max(1, Math.ceil((chars * charW(pt)) / (w - 0.05)));
    h += lines * ((pt * 1.2 * 1.08) / 72) + 7 / 72;
  }
  return r3(h);
}

/** Georgia Bold 20 sets about 85 characters per line across the content width. */
export const titleLines = (title: string): number => Math.max(1, Math.ceil(title.length / 85));

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

export interface TextTableSpec {
  colW: number[];
  head?: string[];
  rows: string[][];
  fontSize?: number;
  aligns?: ("left" | "right" | "center")[];
  obsCol?: number;
  refCol?: number;
  totalRow?: number;
  firstBold?: boolean;
  /** Fill the first column's cells with the tint (the S10.1 term table). */
  tintFirstCol?: boolean;
  /** Rows whose first cell is bold even when `firstBold` is off (anchor rows of the process table). */
  boldRows?: number[];
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
      /** Lower panel sharing the category axis, about 30% of the height: a line whose last point is labelled. */
      line?: { name: string; values: (number | null)[]; format?: string; color?: string };
    }
  | { type: "diverging"; labels: string[]; wins: number[]; losses: number[]; format?: string };

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

export function numTableHeight(spec: NumTableSpec): number {
  const headH = 0.21;
  const tiers = spec.cols.some((c) => c.group) ? 2 : 1;
  const rowH = spec.rowH ?? (spec.rows.length >= 12 ? 0.19 : 0.195);
  return r3(tiers * headH + spec.rows.length * rowH);
}

export function textTableRowHeights(spec: TextTableSpec): number[] {
  const pt = spec.fontSize ?? 8.5;
  return spec.rows.map((r, ri) =>
    rowHeightFor(
      r.map((text, i) => ({ text, bold: (i === 0 && (spec.firstBold ?? true)) || spec.totalRow === ri || (spec.boldRows?.includes(ri) ?? false) })),
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

export function chartHeight(spec: ChartSpec, h?: number): number {
  if (spec.type === "monthly" && spec.line) return r3((h ?? DEFAULT_CHART_H) + 1.1);
  return h ?? DEFAULT_CHART_H;
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
      return r3(head + chartHeight(block.spec, block.h));
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
 * highest; then, if the page overflows, trailing observation items are
 * dropped one at a time (never an exhibit) until it fits or nothing is left
 * to drop, in which case the page is refused.
 */
export function layoutPage(spec: PageSpec): LaidOutPage {
  const warnings: string[] = [];
  const attempt = (page: PageSpec): LaidOutPage => {
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
        if (Math.max(...ends) - Math.min(...ends) > 0.5) warnings.push(`${page.id}: columns end ${(Math.max(...ends) - Math.min(...ends)).toFixed(2)} in apart`);
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
    if (out.bottom <= BAND.bottom + 1e-6) return out;
    const trimmed = dropOneObservation(page);
    if (!trimmed) throw new Error(`Page ${spec.id} overflows the content band: ends at ${out.bottom.toFixed(2)} in (guard 6.48)`);
    warnings.push(`${spec.id}: dropped an observation to fit the page`);
    page = trimmed;
  }
  throw new Error(`Page ${spec.id} could not be fitted`);
}

function dropOneObservation(page: PageSpec): PageSpec | undefined {
  let done = false;
  const visit = (b: Block): Block => {
    if (done || b.kind !== "observations" || b.items.length <= 2) return b;
    done = true;
    return { ...b, items: b.items.slice(0, -1) };
  };
  const rows = page.rows.map((r) => ({
    columns: r.columns.map((c) => ({ ...c, blocks: c.blocks.map(visit) })),
    floating: r.floating?.map(visit),
  }));
  return done ? { ...page, rows } : undefined;
}

// ---------------------------------------------------------------------------
// Chart post-pass registry. pptxgenjs exposes neither per-series label colour
// nor the legend's manual layout, so the deck is patched after write().
// ---------------------------------------------------------------------------

interface SeriesPatch {
  labelColor?: string;
  whiteOutline?: boolean;
  /** Keep only the last point's data label and put a marker on it. */
  lastPointOnly?: boolean;
  /** Drop empty points so a line starts where its data does. */
  gapBlanks?: boolean;
}

/** Layout the XML pass writes into one chart file: a top-left legend of a known height and the plot area beneath it. */
interface ChartPatch {
  /** Height of the legend as a fraction of the chart; the plot area starts under it. */
  legendFraction?: number;
  /** Anchor the chart title (a panel caption) at the top-left. */
  titleLeft?: boolean;
  /** Inner plot area as fractions of the chart, when the caller wants it fixed. */
  plot?: { y: number; h: number };
}

export class Deck {
  readonly pptx: Pptx;
  private readonly seriesPatches = new Map<string, SeriesPatch>();
  private readonly chartPatches = new Map<string, ChartPatch>();
  private seriesCounter = 0;
  chartCount = 0;

  constructor(title: string) {
    this.pptx = new PptxGenJS();
    this.pptx.layout = "LAYOUT_WIDE";
    this.pptx.author = "AMB Advisory Services LLC";
    this.pptx.company = "AMB Advisory Services LLC";
    this.pptx.title = title;
  }

  /** A series name unique across the deck, so the XML pass can find it. */
  seriesName(name: string, patch: SeriesPatch): string {
    // A zero-width joiner sequence keeps the visible legend text intact while making the name unique.
    const tagged = `${name}${"‍".repeat(++this.seriesCounter)}`;
    this.seriesPatches.set(tagged, patch);
    return tagged;
  }

  /** Register the chart about to be added (pptxgenjs numbers chart files in add order). */
  noteChart(patch: ChartPatch = {}): void {
    this.chartCount += 1;
    this.chartPatches.set(`ppt/charts/chart${this.chartCount}.xml`, patch);
  }

  async write(): Promise<Buffer> {
    const buf = (await this.pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return this.patchCharts(buf);
  }

  private async patchCharts(buf: Buffer): Promise<Buffer> {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    for (const f of names) {
      let xml = await zip.file(f)!.async("string");
      xml = xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
        const name = /<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/.exec(ser)?.[1];
        const patch = name ? this.seriesPatches.get(name) : undefined;
        if (!patch) return ser;
        let out = ser;
        if (patch.labelColor) out = out.replace(/(<c:dLbls>[\s\S]*?<a:srgbClr val=")[0-9A-Fa-f]{6}("\/>)/, `$1${patch.labelColor}$2`);
        if (patch.whiteOutline) out = out.replace(/(<c:spPr><a:solidFill><a:srgbClr val="[0-9A-Fa-f]{6}"\/><\/a:solidFill>)/, `$1<a:ln w="9525"><a:solidFill><a:srgbClr val="${C.white}"/></a:solidFill></a:ln>`);
        if (patch.gapBlanks) out = out.replace(/<c:pt idx="\d+"><c:v><\/c:v><\/c:pt>/g, "");
        if (patch.lastPointOnly) out = keepLastLabel(out);
        return out;
      });
      // Strip the zero-width tags so the legend shows the plain series name.
      xml = xml.replace(/‍+/g, "");
      const cp = this.chartPatches.get(f) ?? {};
      let plot = cp.plot;
      if (cp.legendFraction !== undefined) {
        const lf = cp.legendFraction;
        xml = xml.replace(
          /<c:legend>[\s\S]*?<\/c:legend>/,
          (legend) =>
            legend.replace(/<c:layout\/>|<c:layout>[\s\S]*?<\/c:layout>/, "").replace(
              /<c:legendPos val="[a-z]+"\/>/,
              `<c:legendPos val="t"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0"/><c:y val="0"/><c:w val="1"/><c:h val="${lf.toFixed(3)}"/></c:manualLayout></c:layout>`,
            ),
        );
        plot ??= { y: r3(lf + 0.04), h: r3(1 - lf - 0.04 - 0.14) };
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
      zip.file(f, xml);
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }
}

/** Rewrite a line series so only its last point carries a label and a marker. */
function keepLastLabel(ser: string): string {
  const count = Number(/<c:val>[\s\S]*?<c:ptCount val="(\d+)"\/>/.exec(ser)?.[1] ?? 0);
  const pts = [...ser.matchAll(/<c:val>[\s\S]*?<\/c:val>/g)][0]?.[0] ?? "";
  const idxs = [...pts.matchAll(/<c:pt idx="(\d+)">/g)].map((m) => Number(m[1]));
  const last = idxs.length ? Math.max(...idxs) : count - 1;
  const label = /<c:dLbls>([\s\S]*?)<\/c:dLbls>/.exec(ser);
  if (!label || last < 0) return ser;
  const body = label[1]!;
  const txPr = /<c:txPr>[\s\S]*?<\/c:txPr>/.exec(body)?.[0] ?? "";
  const numFmt = /<c:numFmt[^>]*\/>/.exec(body)?.[0] ?? "";
  const dLbls =
    `<c:dLbls><c:dLbl><c:idx val="${last}"/>${numFmt}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr}<c:dLblPos val="t"/>` +
    `<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>` +
    `<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  let out = ser.replace(/<c:dLbls>[\s\S]*?<\/c:dLbls>/, dLbls);
  const marker = `<c:dPt><c:idx val="${last}"/><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${C.maroon}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker></c:dPt>`;
  out = out.replace(/(<c:marker>[\s\S]*?<\/c:marker>)/, `$1${marker}`);
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
  const runs = typeof t === "string" ? runsWithPending(t, { fontSize: o.fontSize, color: o.color, bold: o.bold }) : t;
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
  const titleW = r3(h.title.length * charW(9.5, true) + (h.units ? (h.units.length + 2) * charW(9.5) : 0) + 0.1);
  let annotation = h.annotation;
  if (annotation) {
    // The annotation takes what the title leaves; if that is too little it is shortened at a word boundary rather than overlapping.
    const room = w - titleW - 0.15;
    const fits = Math.floor(room / charW(8));
    if (annotation.length > fits) annotation = annotation.slice(0, Math.max(0, fits)).replace(/\s+\S*$/, "");
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
  const fontSize = spec.fontSize ?? 8.5;
  const rowH = spec.rowH ?? (rows.length >= 12 ? 0.19 : 0.195);
  const headH = 0.21;
  const colW = cols.map((c) => c.w);
  const w = r3(colW.reduce((s, v) => s + v, 0));
  const out: TableCell[][] = [];
  const rh: number[] = [];
  const twoTier = cols.some((c) => c.group);
  const headCell = (t: string, o: TableCellProps = {}) => cell(t, { fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, ...o });
  const gapCell = () => cell("", { margin: [0, 0, 0, 0] });
  const headAlign = (c: NumCol, i: number): "left" | "right" | "center" => (i === 0 || c.kind === "label" || c.kind === "text" || c.left ? "left" : c.kind === "obs" ? "center" : "right");

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
    rh.push(headH, headH);
  } else {
    out.push(cols.map((c, i) => (c.kind === "gap" ? gapCell() : headCell(i === 0 ? name : (c.head ?? ""), { align: headAlign(c, i) }))));
    rh.push(headH);
  }

  rows.forEach((r) => {
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
        const label = r.note ? [cellRun(r.label, { fontSize, bold: o.bold, italic: o.italic, color: o.color ?? C.ink }), cellRun(` (${r.note})`, { fontSize: 7, color: C.muted })] : r.label;
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
    rh.push(rowH);
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
        if (spec.tintFirstCol && i === 0) o.fill = { color: C.tint };
        if (spec.totalRow === ri) Object.assign(o, { bold: true, border: [hair(C.maroon, 0.75), NONE, hair(C.maroon, 0.75), NONE] });
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
const nb = (labels: string[]): string[] => labels.map((l) => l.replace(/-/g, "\u2011"));

/** Rows a top-left legend needs at 8 pt across a chart of width w, and the fraction of height h they take. */
function legendFraction(names: string[], w: number, h: number): number {
  const width = names.reduce((s, n) => s + n.length * charW(8) + 0.35, 0);
  const rows = Math.max(1, Math.ceil(width / w));
  return r3((rows * 0.17) / h);
}

export function chart(deck: Deck, slide: Slide, x: number, y: number, w: number, spec: ChartSpec, hOverride?: number): number {
  const h = hOverride ?? DEFAULT_CHART_H;
  const fmt = "format" in spec && spec.format ? spec.format : "#,##0";
  const maxOf = (vals: number[]) => Math.max(0, ...vals.filter((v) => Number.isFinite(v)));
  switch (spec.type) {
    case "twinPanels": {
      const pw = r3((w - 0.2 * (spec.panels.length - 1)) / spec.panels.length);
      spec.panels.forEach((p, i) => {
        deck.noteChart({ titleLeft: true, plot: { y: 0.12, h: 0.72 } });
        slide.addChart("bar", [{ name: deck.seriesName(p.caption, {}), labels: nb(p.labels), values: p.values }], {
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
          titleAlign: "left",
          valAxisMaxVal: Math.ceil(maxOf(p.values) * 1.2),
          valAxisMinVal: 0,
        });
      });
      return r3(y + h);
    }
    case "bars": {
      const colors = spec.colors ?? (spec.series.length <= 2 ? SERIES2 : SERIES4);
      const stacked = spec.grouping !== "clustered";
      const data = spec.series.map((s, i) => ({
        name: deck.seriesName(s.name, { labelColor: DARK_FILLS.has(colors[i % colors.length]!) ? C.white : C.ink, whiteOutline: stacked }),
        labels: nb(s.labels),
        values: s.values,
      }));
      const legend = spec.legend ?? spec.series.length > 1;
      deck.noteChart(legend ? { legendFraction: legendFraction(spec.series.map((s) => s.name), w, h) } : {});
      const top = stacked ? undefined : (spec.maxVal ?? Math.ceil(maxOf(spec.series.flatMap((s) => s.values)) * 1.2));
      slide.addChart("bar", data, {
        ...chartBase,
        x, y, w, h,
        barGrouping: spec.grouping,
        chartColors: colors,
        dataLabelPosition: spec.labelPos ?? (stacked ? "ctr" : "outEnd"),
        dataLabelFormatCode: fmt,
        dataLabelColor: stacked ? C.white : C.ink,
        showLegend: legend,
        legendPos: "t",
        valAxisMaxVal: top,
        valAxisMinVal: 0,
      });
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
        valAxisMaxVal: Math.ceil(maxOf(spec.values) * 1.25),
        valAxisMinVal: 0,
        catAxisOrientation: "maxMin",
      } as unknown as ChartOpts;
      slide.addChart("bar", [{ name: deck.seriesName("Share", {}), labels: nb(spec.labels), values: spec.values }], opts);
      return r3(y + h);
    }
    case "monthly": {
      deck.noteChart();
      // Above 16 bars only quarter starts are labelled (guide 2.6); the axis skips labels itself so the ones shown get three slots of width.
      const labels = nb(spec.labels);
      const every = spec.labels.length > 16 ? 3 : 1;
      slide.addChart("bar", [{ name: deck.seriesName("Monthly", {}), labels, values: spec.values }], {
        ...chartBase,
        x, y, w, h,
        chartColors: [C.maroon],
        barGapWidthPct: 60,
        dataLabelPosition: "outEnd",
        dataLabelFormatCode: fmt,
        dataLabelFontSize: spec.values.length > 24 ? 7 : 8,
        catAxisLabelFrequency: every,
        showLegend: false,
        valAxisMaxVal: Math.ceil(maxOf(spec.values) * 1.18),
        valAxisMinVal: 0,
      });
      if (!spec.line) return r3(y + h);
      deck.noteChart({ titleLeft: true, plot: { y: 0.22, h: 0.5 } });
      const lh = 1.1;
      const vals = spec.line.values.map((v) => (v === null ? null : v)) as number[];
      const present = spec.line.values.filter((v): v is number => v !== null);
      slide.addChart("line", [{ name: deck.seriesName(spec.line.name, { lastPointOnly: true, gapBlanks: true }), labels, values: vals }], {
        ...chartBase,
        x, y: r3(y + h), w, h: lh,
        chartColors: [spec.line.color ?? C.slate],
        lineSize: 1.75,
        lineDataSymbol: "none",
        dataLabelFormatCode: spec.line.format ?? fmt,
        dataLabelPosition: "t",
        showLegend: false,
        showTitle: true,
        title: spec.line.name,
        titleFontFace: SANS,
        titleFontSize: 8,
        titleColor: C.muted,
        titleAlign: "left",
        catAxisLabelFrequency: every,
        valAxisMaxVal: Math.ceil(maxOf(present) * 1.15),
        valAxisMinVal: Math.floor(Math.min(...present) * 0.85),
      });
      return r3(y + h + lh);
    }
    case "diverging": {
      deck.noteChart({ legendFraction: legendFraction(["Wins", "Losses"], w, h) });
      slide.addChart(
        "bar",
        [
          { name: deck.seriesName("Wins", { labelColor: C.ink }), labels: nb(spec.labels), values: spec.wins },
          { name: deck.seriesName("Losses", { labelColor: C.ink }), labels: nb(spec.labels), values: spec.losses.map((v) => -Math.abs(v)) },
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
  text(slide, f.title, { x: colX(1), y: BAND.titleY, w: CONTENT_W, h: BAND.titleH, fontFace: SERIF, fontSize: 20, bold: true, color: C.maroon, valign: "bottom", lineSpacingMultiple: 1.0 });
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
  text(slide, "Contents", { x: colX(1), y: BAND.titleY, w: CONTENT_W, h: BAND.titleH, fontFace: SERIF, fontSize: 20, bold: true, color: C.maroon, valign: "bottom" });
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
    case "observations": {
      const by = exhibitHeader(slide, p.x, p.y, p.w, b.header);
      observations(slide, p.x, by, p.w, b.items);
      return;
    }
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
