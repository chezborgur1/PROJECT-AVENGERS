// LibreOffice and PyMuPDF, the two optional tools behind every rendered
// output: the CIM's PDF and page images, and the workbook render check (C37).
// A machine without them still gets the .xlsx and .pptx; callers report why
// the rendered files are missing.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Convert an Office file to PDF beside it with LibreOffice, in a throwaway user profile so parallel runs do not share a lock. */
export function toPdf(file: string): { pdf?: string; note?: string } {
  const outDir = path.dirname(file);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "amb-lo-"));
  try {
    const r = spawnSync("soffice", [`-env:UserInstallation=file://${profile}`, "--headless", "--convert-to", "pdf", "--outdir", outDir, file], {
      env: { ...process.env, SAL_USE_VCLPLUGIN: "svp" },
      encoding: "utf8",
      timeout: 300_000,
    });
    const pdf = path.join(outDir, `${path.basename(file, path.extname(file))}.pdf`);
    if (r.error) return { note: `PDF not written: LibreOffice (soffice) is not available (${r.error.message})` };
    if (!fs.existsSync(pdf)) return { note: `PDF not written: LibreOffice exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 300)}` };
    return { pdf };
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

/** Run a PyMuPDF script with arguments; stdout on success, the reason otherwise. */
export function runPyMuPdf(script: string, args: string[]): { out?: string; note?: string } {
  const r = spawnSync("python3", ["-c", script, ...args], { encoding: "utf8", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { note: r.error?.message ?? r.stderr.trim().split("\n").pop() ?? `python3 exited ${r.status}` };
  return { out: r.stdout };
}
