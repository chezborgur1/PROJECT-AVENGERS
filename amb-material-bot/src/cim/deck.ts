// Builds the CIM: a native, editable PowerPoint in AMB's house style
// (design/FINAL_DESIGN_SPEC.md), its PDF and page images, and the list of
// placeholders the advisor must resolve. The planner decides which pages the
// data supports (guide 3.5); this file draws them and writes the outputs.

import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { CimContext, CimInput } from "./context.ts";
import { buildContext } from "./context.ts";
import { placeholdersIn } from "./copy.ts";
import { Deck, renderPage } from "./design.ts";
import type { DeckPlan, PlanOptions } from "./planner.ts";
import { planDeck } from "./planner.ts";
import { officeDefects } from "./ooxml.ts";
import { renderOutputs } from "./render.ts";

export interface CimBuildOptions extends PlanOptions {
  /** Write the PDF next to the deck (LibreOffice). */
  pdf?: boolean;
  /** Write page images to "<deck name> pages/" (needs the PDF). */
  png?: boolean;
}

export interface CimBuildResult {
  pptx: string;
  pdf?: string;
  pngs: string[];
  /** Every "[Confirm: …]" in the deck with the question behind it, plus the copy's own open questions: for open-questions.md. */
  openQuestions: string[];
  /** Modules built, merged, omitted (with the failed trigger) and cut: for run-summary.md (guide 3.5 rule 8). */
  plan: DeckPlan;
  /** Build notes for run-summary.md: copy fallbacks, observations dropped to fit, rendering notes. */
  log: string[];
  /** Set when the PDF and page images were withheld (a chart LibreOffice would not draw): the run is not OK. */
  renderError?: string;
}

/** Lay out and draw every page into a pptx buffer. */
export async function renderDeck(ctx: CimContext, plan: DeckPlan): Promise<Buffer> {
  const deck = new Deck(`${ctx.code}: Confidential Information Memorandum`);
  for (const p of plan.pages) {
    const slide = deck.pptx.addSlide();
    if (p.draft.draw) p.draft.draw(deck, slide, p.num, plan.toc);
    else if (p.layout) renderPage(deck, slide, p.layout, { code: ctx.code, num: p.num });
    else throw new Error(`Page ${p.draft.id} has neither a layout nor a drawing`);
  }
  return deck.write();
}

/**
 * Every placeholder the deck prints, with its question where an exhibit
 * recorded one; the questions a module recorded without a placeholder (a
 * column left out until the Seller supplies it, a license not listed); and
 * the copy's open questions.
 */
export function collectOpenQuestions(ctx: CimContext, plan: DeckPlan): string[] {
  const printed = new Set<string>();
  for (const p of plan.pages) if (p.draft.spec) for (const m of placeholdersIn(p.draft.spec)) printed.add(m);
  const recorded = ctx.openQuestions.filter((q) => [...printed].some((m) => q.includes(m)));
  // A question with no placeholder stands on its own; one tied to a placeholder the deck no longer prints is dropped.
  const standalone = ctx.openQuestions.filter((q) => !q.includes("[Confirm:"));
  const explained = [...recorded, ...ctx.copy.open_questions];
  const unexplained = [...printed].filter((m) => !explained.some((q) => q.includes(m))).map((m) => `Deck placeholder: ${m}`);
  return [...new Set([...recorded, ...standalone, ...ctx.copy.open_questions, ...unexplained])];
}

/** A figure that failed to compute or a token that failed to resolve, as it would print. */
const UNRESOLVED = /\bNaN|Infinity|\bundefined\b|\{\{/;

/**
 * Every text run on every slide that prints an unresolved value ("Infinityx",
 * "up NaN pts", "{{token}}"), as "page N: text". The deck is refused on any,
 * as a workbook that fails verification is (CLAUDE.md).
 */
export async function unresolvedText(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: string[] = [];
  for (const f of Object.keys(zip.files)) {
    const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(f);
    if (!m) continue;
    const xml = await zip.file(f)!.async("string");
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((x) => x[1]).join(" ");
    for (const hit of text.matchAll(new RegExp(`.{0,40}(${UNRESOLVED.source}).{0,40}`, "g"))) out.push(`page ${m[1]}: ${hit[0].trim()}`);
  }
  return out;
}

/**
 * The CIM engine's entry point: plan the deck from the model output and the
 * dataset's facts, draw it to `pptxPath`, and optionally render the PDF and
 * page images beside it.
 */
export async function buildCim(input: CimInput, pptxPath: string, opts: CimBuildOptions = {}): Promise<CimBuildResult> {
  const ctx = buildContext(input);
  const plan = planDeck(ctx, opts);
  const buf = await renderDeck(ctx, plan);
  const unresolved = await unresolvedText(buf);
  if (unresolved.length) throw new Error(`CIM not written: it prints unresolved values (${unresolved.slice(0, 3).join("; ")})`);
  // LibreOffice opens markup PowerPoint refuses, so the PDF proves nothing here: the deck itself is checked.
  const defects = await officeDefects(buf);
  if (defects.length) throw new Error(`CIM not written: PowerPoint would offer to repair it (${defects.slice(0, 3).join("; ")})`);
  fs.mkdirSync(path.dirname(pptxPath), { recursive: true });
  fs.writeFileSync(pptxPath, buf);
  const rendered = await renderOutputs(pptxPath, { pdf: opts.pdf ?? false, png: opts.png ?? false });
  return {
    pptx: pptxPath,
    pdf: rendered.pdf,
    pngs: rendered.pngs,
    openQuestions: collectOpenQuestions(ctx, plan),
    plan,
    log: [...ctx.log, ...plan.warnings, ...rendered.notes],
    ...(rendered.error ? { renderError: rendered.error } : {}),
  };
}
