// The PDF and page images that travel with the deck (guide Q21: .pptx plus
// PDF). LibreOffice converts the deck; PyMuPDF rasterizes the PDF for the
// page PNGs the advisor and the QA pass look at. Both are optional tools: a
// machine without them still gets the .pptx, and the result says why the
// others are missing.
//
// LibreOffice sometimes drops a chart from the PDF (the frame prints empty,
// its exhibit header over a hole), and on a rerun of the same file draws it.
// So every chart frame the deck holds is measured on its page: a frame with
// no vector drawings inside is a dropped chart, the deck is converted again
// in a fresh profile, and a PDF that still misses one is withheld.

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { runPyMuPdf, toPdf } from "../util/office.ts";

export interface RenderResult {
  pdf?: string;
  pngs: string[];
  notes: string[];
  /** Set when the PDF was withheld because a chart would not render: the build is not OK. */
  error?: string;
}

/** A chart's frame on its page, in points from the top left (the PDF's own units). */
export interface ChartFrame {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Conversions before a PDF that drops a chart is withheld. */
export const CONVERSION_ATTEMPTS = 3;
/** Vector drawings a rendered chart leaves inside its frame at the least: the smallest (a two-bar panel) draws six. */
export const MIN_CHART_DRAWINGS = 3;
const EMU_PER_POINT = 12700;

/** Rasterize every PDF page to page-NN.png at `dpi` in `dir`, with PyMuPDF. */
export function toPngs(pdf: string, dir: string, dpi = 110): { pngs: string[]; note?: string } {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^page-\d+\.png$/.test(f)) fs.rmSync(path.join(dir, f));
  const script = [
    "import sys, pymupdf",
    "d = pymupdf.open(sys.argv[1])",
    "for i, p in enumerate(d): p.get_pixmap(dpi=int(sys.argv[3])).save(f'{sys.argv[2]}/page-{i + 1:02d}.png')",
    "print(len(d))",
  ].join("\n");
  const r = runPyMuPdf(script, [pdf, dir, String(dpi)]);
  if (r.note) return { pngs: [], note: `Page images not written: ${r.note}` };
  const pngs = fs
    .readdirSync(dir)
    .filter((f) => /^page-\d+\.png$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
  return { pngs };
}

/** Every chart graphic frame in the deck, slide by slide (one slide is one PDF page). */
export async function chartFrames(pptx: string): Promise<ChartFrame[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(pptx));
  const slides = Object.keys(zip.files)
    .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  const frames: ChartFrame[] = [];
  for (const m of slides) {
    const xml = await zip.file(m[0])!.async("string");
    for (const g of xml.matchAll(/<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g)) {
      if (!g[1]!.includes("drawingml/2006/chart")) continue;
      const off = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/.exec(g[1]!);
      const ext = /<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(g[1]!);
      if (!off || !ext) continue;
      frames.push({ page: Number(m[1]), x: Number(off[1]) / EMU_PER_POINT, y: Number(off[2]) / EMU_PER_POINT, w: Number(ext[1]) / EMU_PER_POINT, h: Number(ext[2]) / EMU_PER_POINT });
    }
  }
  return frames;
}

/**
 * The frames that print empty: fewer than MIN_CHART_DRAWINGS vector drawings
 * centred inside the frame on its page. `note` says why nothing could be
 * measured (no PyMuPDF), in which case `empty` is empty and unproven.
 */
export function emptyChartFrames(pdf: string, frames: ChartFrame[]): { empty: ChartFrame[]; counts: number[]; note?: string } {
  if (!frames.length) return { empty: [], counts: [] };
  const script = [
    "import sys, json, pymupdf",
    "d = pymupdf.open(sys.argv[1])",
    "out = []",
    "for f in json.loads(sys.argv[2]):",
    "    if f['page'] > len(d):",
    "        out.append(0); continue",
    "    r = pymupdf.Rect(f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])",
    "    n = 0",
    "    for g in d[f['page'] - 1].get_drawings():",
    "        b = g['rect']",
    "        if r.contains(pymupdf.Point((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)): n += 1",
    "    out.append(n)",
    "print(json.dumps(out))",
  ].join("\n");
  const r = runPyMuPdf(script, [pdf, JSON.stringify(frames)]);
  if (r.note || !r.out) return { empty: [], counts: [], note: r.note ?? "no output from PyMuPDF" };
  const counts = JSON.parse(r.out) as number[];
  return { empty: frames.filter((_, i) => (counts[i] ?? 0) < MIN_CHART_DRAWINGS), counts };
}

const pagesOf = (frames: ChartFrame[]) => [...new Set(frames.map((f) => f.page))].join(", ");

/**
 * PDF next to the deck and page images in `<deck name> pages/`. A PDF whose
 * charts LibreOffice left blank is converted again, up to CONVERSION_ATTEMPTS
 * times; if a chart is still missing, the PDF and page images are withheld and
 * `error` says so, so the pipeline can report the build as not OK.
 */
export async function renderOutputs(pptx: string, opts: { pdf: boolean; png: boolean }, convert: (file: string) => { pdf?: string; note?: string } = toPdf): Promise<RenderResult> {
  const notes: string[] = [];
  if (!opts.pdf && !opts.png) return { pngs: [], notes };
  const frames = await chartFrames(pptx);
  const dir = path.join(path.dirname(pptx), `${path.basename(pptx, ".pptx")} pages`);
  let pdf: string | undefined;
  for (let attempt = 1; attempt <= CONVERSION_ATTEMPTS; attempt++) {
    const converted = convert(pptx);
    if (converted.note) notes.push(converted.note);
    pdf = converted.pdf;
    if (!pdf) return { pngs: [], notes };
    const check = emptyChartFrames(pdf, frames);
    if (check.note) {
      notes.push(`Charts in the PDF not verified (PyMuPDF is needed to measure them): ${check.note}`);
      break;
    }
    if (!check.empty.length) {
      if (attempt > 1) notes.push(`LibreOffice drew every chart on conversion ${attempt} of ${CONVERSION_ATTEMPTS}.`);
      break;
    }
    const pages = pagesOf(check.empty);
    if (attempt < CONVERSION_ATTEMPTS) {
      notes.push(`LibreOffice left ${check.empty.length === 1 ? "a chart" : `${check.empty.length} charts`} blank on page ${pages}; converted again with a fresh profile.`);
      continue;
    }
    // Neither the PDF nor page images from an earlier run may stand in for the deck just built.
    fs.rmSync(pdf, { force: true });
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^page-\d+\.png$/.test(f)) fs.rmSync(path.join(dir, f));
    const error = `PDF not written: LibreOffice left ${check.empty.length === 1 ? "the chart" : `${check.empty.length} charts`} on page ${pages} blank in ${CONVERSION_ATTEMPTS} conversions, so the PDF and page images are withheld. The .pptx is complete; convert it again or export it from PowerPoint.`;
    notes.push(error);
    return { pngs: [], notes, error };
  }
  if (!pdf || !opts.png) return { pdf, pngs: [], notes };
  const png = toPngs(pdf, dir);
  if (png.note) notes.push(png.note);
  return { pdf, pngs: png.pngs, notes };
}
