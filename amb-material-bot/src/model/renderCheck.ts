// Check C37 (guide 5.7): the written workbook rendered to PDF by LibreOffice
// and measured page by page with PyMuPDF. Every printed tab must set its
// 9 pt body text at 7 pt or more (the print-scale floor; Sensitivities at
// 80% and Offer Comparison at 90% of full size), print every page it plans,
// and keep every figure inside the right margin. It must also print whole:
// no text cut at a cell edge or drawn over its neighbour, no page that
// carries only repeated headers or a stray note, and, on tabs that repeat
// their label columns, no row stretched past three lines by text printed
// elsewhere. The plan layer sizes tabs to pass (fitPrintWidth); this is the
// proof on the delivered file.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runPyMuPdf, toPdf } from "../util/office.ts";
import { MIN_PRINTED_PT, type SheetPlan } from "./sheet.ts";

export interface RenderedTab {
  name: string;
  pages: number;
  /** Rendered size of the tab's body text (the commonest span size), smallest over its pages. */
  bodyPt: number;
  /** Text spans that end past the right margin, over all its pages. */
  overflow: number;
}

export interface RenderCheckResult {
  /** OK when every printed tab passes; CHECK with the issues otherwise; n.a. when LibreOffice or PyMuPDF is missing. */
  status: "OK" | "CHECK" | "n.a.";
  tabs: RenderedTab[];
  issues: string[];
  note: string;
}

/** A text span as PyMuPDF reads it, in points from the page's top left. */
export interface Span {
  t: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number;
}

export interface RenderedPage {
  sheet: string | null;
  body: number | null;
  over: number;
  /** Spans inside the body band (between the header and the footer). */
  spans?: Span[];
}

/** What the plans say each tab prints, so a rendered span can be told from a cut-off piece of it. */
export interface PrintedTab {
  name: string;
  /** Every text the tab's printed cells hold (labels, notes, headers). */
  texts?: string[];
  /** The tab repeats label columns beside a later print range or on column pages. */
  titleColumns?: boolean;
  /** A chart tab: its pages are drawings, which carry little text. */
  charts?: boolean;
}

/**
 * The printed tabs of a workbook plan with the texts their cells hold and
 * whether they repeat label columns: the render check's reference. `title`
 * is the company name the row-2 formula shows on every tab.
 */
export function printedTabsOf(plans: SheetPlan[], title: string): PrintedTab[] {
  return plans
    .filter((p) => p.output || p.key === "contents")
    .map((p) => {
      const texts = new Set<string>([title]);
      for (const spec of p.cells.values()) {
        const t = typeof spec.v === "string" ? spec.v : typeof spec.expect === "string" ? spec.expect : undefined;
        if (t && t.trim()) texts.add(t.trim());
      }
      return { name: p.name, texts: [...texts], titleColumns: !!p.print.titlesCol, charts: p.charts.length > 0 };
    });
}

/** Nominal body size of every tab (guide 5.8: Arial 9). */
const BODY_PT = 9;
/** Tabs with their own scale floor (guide C37), as a share of full size. */
const SCALE_FLOOR: Record<string, number> = { Sensitivities: 0.8, "Offer Comparison": 0.9 };

// Per page: the sheet name from the footer's centre (&A), the commonest body span size, the spans past the right margin
// (0.5 in), and every span in the body band for the layout rules.
const SCRIPT = String.raw`
import sys, json, collections, pymupdf
d = pymupdf.open(sys.argv[1])
out = []
for p in d:
    W, H = p.rect.width, p.rect.height
    sheet, sizes, over, spans = None, collections.Counter(), 0, []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"].strip()
                if not t:
                    continue
                x0, y0, x1, y1 = s["bbox"]
                if y0 > H - 0.7 * 72 + 4:
                    if abs((x0 + x1) / 2 - W / 2) < 90 and not t.startswith("Page"):
                        sheet = t
                    continue
                if y1 < 0.6 * 72 - 2:
                    continue
                sizes[round(s["size"], 1)] += len(t)
                if x1 > W - 0.5 * 72 + 2:
                    over += 1
                spans.append({"t": t, "x0": round(x0, 1), "y0": round(y0, 1), "x1": round(x1, 1), "y1": round(y1, 1), "size": round(s["size"], 1)})
    body = sizes.most_common(1)[0][0] if sizes else None
    out.append({"sheet": sheet, "body": body, "over": over, "spans": spans})
print(json.dumps(out))
`;

/**
 * Render `xlsx` (a copy, in a temporary folder) and measure the tabs named in
 * `printed`, the tabs whose print setup the workbook plans. The file itself
 * is never touched.
 */
export function renderCheckWorkbook(xlsx: string, printed: (string | PrintedTab)[]): RenderCheckResult {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amb-c37-"));
  try {
    const copy = path.join(dir, "workbook.xlsx");
    fs.copyFileSync(xlsx, copy);
    const { pdf, note } = toPdf(copy);
    if (!pdf) return { status: "n.a.", tabs: [], issues: [], note: `Render check not run: ${note}` };
    const r = runPyMuPdf(SCRIPT, [pdf]);
    if (!r.out) return { status: "n.a.", tabs: [], issues: [], note: `Render check not run: PyMuPDF is not available (${r.note})` };
    return assess(JSON.parse(r.out) as RenderedPage[], printed);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const WORD = /[A-Za-z0-9]/;
/** A figure as a cell prints it: $1,234, (12), 4.5%, 1.25x, the zero dash or n.a. */
const FIGURE = /^[($]*[–-]?\$?[\d,]+(\.\d+)?[%x]?\)?$|^[–-]$|^n\.[am]\.$/;

/**
 * Spans that are a piece of a longer planned text cut inside a word: a label
 * clipped at its cell's edge ("Ridgeline Comfort Services LL") or a centred
 * header cut on both sides. Wrapped text breaks between words, so its lines
 * are never flagged.
 */
export function clippedSpans(spans: Span[], texts: string[]): string[] {
  const exact = new Set(texts);
  const out: string[] = [];
  // LibreOffice may place the words of a line one by one; the pieces are joined back into the line they print as. A single
  // word is left alone, since the words of a wrapped paragraph are each a piece of it.
  for (const s of joinLines(spans)) {
    if (s.t.length < 4 || !s.t.includes(" ") || exact.has(s.t) || !/[A-Za-z]{3}/.test(s.t)) continue;
    // Cut only when no place the piece occurs, in any planned text, is a clean word boundary: "Credit Card" wrapped from
    // "... Credit Cards : Business Credit Card" is a clean last line, though "Credit Cards" also holds it mid-word.
    const cutAt = (t: string, i: number) =>
      (i + s.t.length < t.length && WORD.test(t[i + s.t.length]!) && WORD.test(t[i + s.t.length - 1]!)) || (i > 0 && WORD.test(t[i - 1]!) && WORD.test(t[i]!));
    const at = (t: string) => {
      const found: number[] = [];
      for (let i = t.indexOf(s.t); i >= 0; i = t.indexOf(s.t, i + 1)) found.push(i);
      return found;
    };
    if (texts.some((t) => at(t).some((i) => !cutAt(t, i)))) continue;
    const whole = texts.find((t) => at(t).length > 0);
    if (whole) out.push(`"${s.t}" is cut from "${whole}"`);
  }
  return out;
}

/** Spans on one baseline that touch (a word gap or less apart), joined into the line they print as. */
export function joinLines(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out: Span[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    const gap = prev ? s.x0 - prev.x1 : Infinity;
    if (prev && Math.abs(s.y0 - prev.y0) < 1 && Math.abs(s.size - prev.size) < 0.2 && gap > -0.5 && gap < s.size * 0.45) {
      out[out.length - 1] = { ...prev, t: `${prev.t}${gap > s.size * 0.12 ? " " : ""}${s.t}`, x1: s.x1 };
    } else out.push({ ...s });
  }
  return out;
}

/** Spans on one line whose boxes overlap: two cells' text drawn over each other ("VersiDate"). */
export function overlappingSpans(spans: Span[]): string[] {
  const out: string[] = [];
  const sorted = [...spans].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j]!.y0 - sorted[i]!.y0 < 1.5; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1.5) out.push(`"${a.t}" overlaps "${b.t}"`);
    }
  }
  return out;
}

/**
 * A page that prints no figure and no body of text once the rows repeated on
 * every page of its tab are set aside: repeated headers over a stray note, or
 * nothing at all.
 */
export function isEmptyPage(page: Span[], repeated: Set<string>): boolean {
  const own = page.filter((s) => !repeated.has(spanKey(s)));
  if (own.some((s) => FIGURE.test(s.t))) return false;
  const textLines = new Set(own.map((s) => Math.round(s.y0)));
  return textLines.size < 5;
}

const spanKey = (s: Span) => `${s.t}@${Math.round(s.x0)},${Math.round(s.y0)}`;

/**
 * Rows stretched past three lines on a page that shows only single-line text
 * in them: on a tab that repeats its label column, a row's height set by
 * wrapped text in another print range wastes the page. The labels start at
 * the page's left edge; a gap to the next label with nothing printed in
 * between is the row's height.
 */
export function tallRows(page: Span[]): string[] {
  if (!page.length) return [];
  const left = Math.min(...page.map((s) => s.x0));
  const labels = page.filter((s) => s.x0 - left < 2).sort((a, b) => a.y0 - b.y0);
  const lineH = median(page.map((s) => s.y1 - s.y0));
  const out: string[] = [];
  for (let i = 0; i + 1 < labels.length; i++) {
    const a = labels[i]!;
    const next = labels[i + 1]!;
    const gap = next.y0 - a.y0;
    // The table's closing note paragraph sits below a spacer row: the space before it is the layout, not a stretched row.
    if (gap <= 3.5 * lineH || /^Note:/.test(next.t)) continue;
    const filled = page.some((s) => s.y0 > a.y0 + 0.8 * lineH && s.y0 < next.y0 - 0.5 * lineH);
    if (!filled) out.push(`row "${a.t}" is ${(gap / lineH).toFixed(1)} lines tall with one line printed`);
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

/** Fold the per-page measurements into tabs and apply the C37 rules. */
export function assess(pages: RenderedPage[], printed: (string | PrintedTab)[]): RenderCheckResult {
  const tabsIn = printed.map((p) => (typeof p === "string" ? { name: p } : p));
  const byTab = new Map<string, RenderedTab>();
  const pagesOf = new Map<string, RenderedPage[]>();
  for (const p of pages) {
    if (!p.sheet) continue;
    const t = byTab.get(p.sheet) ?? { name: p.sheet, pages: 0, bodyPt: Infinity, overflow: 0 };
    t.pages++;
    if (p.body !== null) t.bodyPt = Math.min(t.bodyPt, p.body);
    t.overflow += p.over;
    byTab.set(p.sheet, t);
    pagesOf.set(p.sheet, [...(pagesOf.get(p.sheet) ?? []), p]);
  }
  const issues: string[] = [];
  for (const tab of tabsIn) {
    const { name } = tab;
    const t = byTab.get(name);
    if (!t) {
      issues.push(`${name}: no page rendered`);
      continue;
    }
    const floor = Math.max(MIN_PRINTED_PT, (SCALE_FLOOR[name] ?? 0) * BODY_PT);
    if (t.bodyPt < floor - 0.05) issues.push(`${name}: body text renders at ${t.bodyPt.toFixed(1)} pt (floor ${floor.toFixed(1)} pt)`);
    if (t.overflow) issues.push(`${name}: ${t.overflow} text span${t.overflow === 1 ? "" : "s"} past the right margin`);
    const own = pagesOf.get(name) ?? [];
    if (!own.some((p) => p.spans)) continue;
    // Spans at the same place on every page are the repeated title rows; a tab of one page has none.
    const keyed = own.map((p) => new Set((p.spans ?? []).map(spanKey)));
    const repeated = own.length > 1 ? new Set([...keyed[0]!].filter((k) => keyed.every((s) => s.has(k)))) : new Set<string>();
    own.forEach((p, i) => {
      const spans = p.spans ?? [];
      const where = `${name} p${i + 1}`;
      for (const c of clippedSpans(spans, tab.texts ?? []).slice(0, 3)) issues.push(`${where}: ${c}`);
      for (const o of overlappingSpans(spans).slice(0, 3)) issues.push(`${where}: ${o}`);
      if (own.length > 1 && !tab.charts && isEmptyPage(spans, repeated)) issues.push(`${where}: prints no figures (an empty or orphan page)`);
      if (tab.titleColumns) for (const r of tallRows(spans).slice(0, 3)) issues.push(`${where}: ${r}`);
    });
  }
  const tabs = tabsIn.map((n) => byTab.get(n.name)).filter((t): t is RenderedTab => !!t);
  const smallest = tabs.reduce((m, t) => Math.min(m, t.bodyPt), Infinity);
  return {
    status: issues.length ? "CHECK" : "OK",
    tabs,
    issues,
    note: issues.length ? issues.slice(0, 12).join("; ") + (issues.length > 12 ? `; and ${issues.length - 12} more` : "") : `${tabs.length} tabs rendered; smallest body text ${smallest.toFixed(1)} pt; nothing past the margin, cut at a cell edge or overlapping; no empty page; no stretched row`,
  };
}
