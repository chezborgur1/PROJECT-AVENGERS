// Helpers every section module uses: choosing a title (the copy's when it
// passes the lint, else the module's own from the brief), building notes,
// and assembling a page draft from rows of blocks.

import type { CimContext } from "../context.ts";
import { resolveCopy } from "../context.ts";
import { lintTitle } from "../copy.ts";
import type { Block, Notes, PageSpec, Row } from "../design.ts";
import { notesLineCount, proseHeight } from "../design.ts";
import { exhibitTitles } from "../exhibits.ts";
import type { PageDraft } from "./types.ts";

/**
 * The page's action title. Copy titles win when they resolve cleanly and pass
 * the title rules (a figure, at most 130 characters); otherwise the module's
 * figure-built title is used and the fallback is logged for run-summary.md.
 */
export function chooseTitle(ctx: CimContext, where: string, copyTitle: string | undefined, fallback: string): string {
  if (copyTitle) {
    const resolved = resolveCopy(ctx, copyTitle, where);
    const issues = lintTitle(resolved.replace(/\{\{page:[^}]+\}\}/g, "page 00"), where).filter((i) => !/characters \(60 to 110/.test(i.issue));
    if (!issues.length && !resolved.includes("[Confirm: figure")) return resolved;
    ctx.log.push(`${where}: copy title rejected (${issues.map((i) => i.issue).join("; ") || "unknown figure"}); using the figure-built title`);
  }
  return fallback;
}

/** Drop undefined blocks from a column's list. */
export const present = (...blocks: (Block | undefined | false)[]): Block[] => blocks.filter((b): b is Block => Boolean(b));

export function draft(ctx: CimContext, p: { id: string; section: string; title: string; rows: Row[]; notes: Notes; carries?: string[]; kind?: PageDraft["kind"] }): PageDraft {
  const spec: PageSpec = { id: p.id, section: p.section, title: p.title, rows: p.rows.filter((r) => r.columns.some((c) => c.blocks.length) || r.floating?.length), notes: fitNotes(ctx, p.id, p.notes) };
  const blocks = spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]);
  return { id: p.id, spec, exhibits: exhibitTitles(blocks), carries: p.carries ?? [], kind: p.kind ?? "content" };
}

/** Source line from its parts: the systems actually used, then "AMB Advisory analysis" (guide 4.6). */
export function source(...parts: (string | undefined | false)[]): string {
  const list = parts.filter((p): p is string => Boolean(p));
  return `${[...new Set(list)].join("; ")}; AMB Advisory analysis.`;
}

/** "grew" or "fell", for templated sentences over signed brief figures. */
export const verb = (v: number | null | undefined, up = "grew", down = "fell"): string => ((v ?? 0) < 0 ? down : up);

/**
 * Prose cut at a sentence boundary to fit `maxH` inches at width `w`, so a
 * box never overflows; the cut is logged for the advisor, never silent.
 */
export function fitProse(ctx: CimContext, where: string, text: string, w: number, maxH: number, pt = 9.5): string {
  if (proseHeight([{ body: text }], w, pt) <= maxH) return text;
  const parts = text.split(/(?<=[.)])\s+(?=[A-Z])/);
  while (parts.length > 1 && proseHeight([{ body: parts.join(" ") }], w, pt) > maxH) parts.pop();
  ctx.log.push(`${where}: prose shortened to fit its box (${text.split(/\s+/).length} words to ${parts.join(" ").split(/\s+/).length})`);
  return parts.join(" ");
}

/**
 * The notes band holds three lines at most (spec 6.3): the Note line gives up
 * its last sentences first; a band that still needs a fourth line fails the
 * build rather than crowd the footer.
 */
function fitNotes(ctx: CimContext, id: string, notes: Notes): Notes {
  const out = { ...notes };
  while (notesLineCount(out) > 3 && out.note && out.note.split(/(?<=\.)\s+/).length > 1) {
    out.note = out.note.split(/(?<=\.)\s+/).slice(0, -1).join(" ");
    ctx.log.push(`${id}: note line shortened to keep the notes band to three lines`);
  }
  if (notesLineCount(out) > 3) throw new Error(`Notes band on ${id} needs more than three lines: ${JSON.stringify(out)}`);
  return out;
}
