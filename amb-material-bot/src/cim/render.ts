// The PDF and page images that travel with the deck (guide Q21: .pptx plus
// PDF). LibreOffice converts the deck; PyMuPDF rasterizes the PDF for the
// page PNGs the advisor and the QA pass look at. Both are optional tools: a
// machine without them still gets the .pptx, and the result says why the
// others are missing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RenderResult {
  pdf?: string;
  pngs: string[];
  notes: string[];
}

/** Convert a .pptx to PDF with LibreOffice, in a throwaway user profile so parallel runs do not share a lock. */
export function toPdf(pptx: string): { pdf?: string; note?: string } {
  const outDir = path.dirname(pptx);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "amb-lo-"));
  try {
    const r = spawnSync("soffice", [`-env:UserInstallation=file://${profile}`, "--headless", "--convert-to", "pdf", "--outdir", outDir, pptx], {
      env: { ...process.env, SAL_USE_VCLPLUGIN: "svp" },
      encoding: "utf8",
      timeout: 180_000,
    });
    const pdf = path.join(outDir, `${path.basename(pptx, ".pptx")}.pdf`);
    if (r.error) return { note: `PDF not written: LibreOffice (soffice) is not available (${r.error.message})` };
    if (!fs.existsSync(pdf)) return { note: `PDF not written: LibreOffice exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}` };
    return { pdf };
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
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
  const r = spawnSync("python3", ["-c", script, pdf, dir, String(dpi)], { encoding: "utf8", timeout: 180_000 });
  if (r.error || r.status !== 0) return { pngs: [], note: `Page images not written: ${r.error?.message ?? r.stderr.trim().split("\n").pop()}` };
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
