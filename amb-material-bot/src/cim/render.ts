// The PDF and page images that travel with the deck (guide Q21: .pptx plus
// PDF). LibreOffice converts the deck; PyMuPDF rasterizes the PDF for the
// page PNGs the advisor and the QA pass look at. Both are optional tools: a
// machine without them still gets the .pptx, and the result says why the
// others are missing.

import fs from "node:fs";
import path from "node:path";
import { runPyMuPdf, toPdf } from "../util/office.ts";

export interface RenderResult {
  pdf?: string;
  pngs: string[];
  notes: string[];
}

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

/** PDF next to the deck and page images in `<deck name> pages/`. */
export function renderOutputs(pptx: string, opts: { pdf: boolean; png: boolean }): RenderResult {
  const notes: string[] = [];
  if (!opts.pdf && !opts.png) return { pngs: [], notes };
  const { pdf, note } = toPdf(pptx);
  if (note) notes.push(note);
  if (!pdf || !opts.png) return { pdf, pngs: [], notes };
  const dir = path.join(path.dirname(pptx), `${path.basename(pptx, ".pptx")} pages`);
  const png = toPngs(pdf, dir);
  if (png.note) notes.push(png.note);
  return { pdf, pngs: png.pngs, notes };
}
