// Helpers every section module uses: choosing a title (the copy's when it
// passes the lint, else the module's own from the brief), building notes,
// and assembling a page draft from rows of blocks.

import type { CimContext } from "../context.ts";
import { NAMED_FOOTNOTES, NAMED_MARKER, PER_MANAGEMENT, resolveCopy } from "../context.ts";
import { lintTitle, titleWidow } from "../copy.ts";
import type { Block, ExhibitHeader, Notes, PageSpec, Row } from "../design.ts";
import { cellText, mapBlockText, notesLineCount, proseHeight } from "../design.ts";
import { exhibitTitles } from "../exhibits.ts";
import type { PageDraft } from "./types.ts";

/**
 * The page's action title. Copy titles win when they resolve cleanly and pass
 * the title rules (a figure, at most 130 characters); otherwise the module's
 * figure-built title is used and the fallback is logged for run-summary.md.
 * A module may offer its figure-built title in several lengths, longest
 * first: the first that wraps without a widow is used (spec 6.1), since how
 * a title wraps depends on the figures it prints.
 */
export function chooseTitle(ctx: CimContext, where: string, copyTitle: string | undefined, fallback: string | string[]): string {
  if (copyTitle) {
    const resolved = resolveCopy(ctx, copyTitle, where);
    const issues = lintTitle(resolved.replace(/\{\{page:[^}]+\}\}/g, "page 00"), where).filter((i) => !/characters \(60 to 110/.test(i.issue));
    if (!issues.length && !resolved.includes("[Confirm: figure")) return resolved;
    ctx.log.push(`${where}: copy title rejected (${issues.map((i) => i.issue).join("; ") || "unknown figure"}); using the figure-built title`);
  }
  const candidates = typeof fallback === "string" ? [fallback] : fallback;
  return candidates.find((t) => !titleWidow(t)) ?? candidates[candidates.length - 1]!;
}

/** Drop undefined blocks from a column's list. */
export const present = (...blocks: (Block | undefined | false)[]): Block[] => blocks.filter((b): b is Block => Boolean(b));

/**
 * Footnote numbers a page's blocks point at: "(1)" in prose, observations,
 * text-table cells, row labels and markers, headers and annotations. Figures
 * are not read, where "(1)" is a negative one.
 */
export function markersIn(blocks: Block[]): number[] {
  const texts: string[] = [];
  const header = (h?: ExhibitHeader) => h && texts.push(h.title, h.units ?? "", h.annotation ?? "");
  for (const b of blocks) {
    if (b.kind === "prose") texts.push(...b.paragraphs.flatMap((p) => [p.lead ?? "", p.body]));
    else if (b.kind === "observations") texts.push(...b.items.flatMap((i) => [i.lead, i.body]));
    else if (b.kind === "callout") texts.push(b.lead, b.body);
    else if (b.kind === "textTable") {
      header(b.header);
      // A cell that is a figure alone ("(3)", "$1,964") is an amount, not a marker.
      texts.push(...b.spec.rows.flat().map(cellText).filter((t) => !/^[($–-]*\$?[\d,.]+[%KM]?\)?$/.test(t.trim())));
    } else if (b.kind === "numTable") {
      header(b.header);
      texts.push(...b.spec.rows.flatMap((r) => [r.label, r.text ?? "", r.note ? `(${r.note})` : ""]));
    } else if (b.kind === "chart" || b.kind === "orgChart") header(b.header);
  }
  return [...new Set(texts.flatMap((t) => [...t.matchAll(/\((\d)\)/g)].map((m) => Number(m[1]))))].sort((a, b) => a - b);
}

/**
 * Give every named marker ("{{fn.mgmt}}") the number of its footnote on this
 * page, adding the footnote when the page lacks it. Copy never types "(1)":
 * which note is (1) depends on the page, and a typed number can point a
 * management fact at another note (guide 4.6). Returns the page's footnotes.
 */
export function numberFootnotes(blocks: Block[], footnotes: string[]): string[] {
  const list = [...footnotes];
  const number = (t: string) =>
    t.replace(NAMED_MARKER, (m, name: string) => {
      const text = NAMED_FOOTNOTES[name];
      if (!text) return m;
      // A page's own wording may extend the note ("Per management; … Hours are the owner's estimate."): it is still that note.
      const i = list.findIndex((f) => f.startsWith(text));
      return `(${(i < 0 ? list.push(text) : i + 1)})`;
    });
  for (const b of blocks) mapBlockText(b, number);
  return list;
}

export function draft(ctx: CimContext, p: { id: string; section: string; title: string; rows: Row[]; notes: Notes; carries?: string[]; kind?: PageDraft["kind"] }): PageDraft {
  const rows = p.rows.filter((r) => r.columns.some((c) => c.blocks.length) || r.floating?.length);
  const blocks = rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]);
  const numbered = { ...p.notes, footnotes: numberFootnotes(blocks, p.notes.footnotes ?? []) };
  // A table's typed (1) is "per management" when its page lists no footnote (guide 4.6).
  const notes = markersIn(blocks).includes(1) && !numbered.footnotes.length ? { ...numbered, footnotes: [PER_MANAGEMENT] } : numbered;
  const spec: PageSpec = { id: p.id, section: p.section, title: p.title, rows, notes: fitNotes(ctx, p.id, notes) };
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

/** Sentences of a note, not split after the abbreviations the notes use ("Adj. EBITDA"). */
const sentencesOf = (t: string): string[] => t.split(/(?<=\.)(?<!\b(?:Adj|Inc|No|Co|vs)\.)\s+(?=[A-Z[(])/);

/** Sentences the Note line never gives up: the units line that opens it, the fiscal year-end (guide 4.6) and the rounding clause of a table that does not foot as shown. */
const REQUIRED_NOTE = /^(Figures in USD|Fiscal year ends)|totals may not sum due to rounding/i;
/** Sentences the Note line gives up last, after the source line's periods: the unaudited basis, the non-GAAP statement (guide 4.6) and a table's bridge to the P&L (guide 4.8). */
const LAST_NOTE = /not been independently audited|non-GAAP measure|are the P&L /i;

/** Period clauses a source part may lose when the band is full; the tables' own headings still name the periods. */
const SOURCE_PERIOD = [/ and LTM [A-Z][a-z]{2}-\d{2}/g, /, FY\d{4}(–FY\d{4})?/g, / as of [A-Z][a-z]{2}-\d{2}/g];

/**
 * The notes band holds three lines at most (spec 6.3), so the band is fitted
 * rather than refused, in this order: the Note line gives up its optional
 * sentences, each footnote its later sentences (the last footnote first),
 * the source line its period clauses, and only then the Note line's
 * unaudited and non-GAAP sentences. The units, fiscal year-end and rounding
 * sentences are never cut. Each step is logged for run-summary.md. A band
 * that still needs a fourth line throws, and the planner reports that page
 * instead of failing the deck.
 */
export function fitNotes(ctx: CimContext, id: string, notes: Notes): Notes {
  const out: Notes = { ...notes, footnotes: notes.footnotes && [...notes.footnotes] };
  // Page references resolve once the deck is paginated, to "page 16" or, when the page is not in the deck, "the appendix":
  // the band is measured with the longer reading so it still fits after resolution.
  const resolved = (t: string | undefined) => t?.replace(/\{\{page:[^}]+\}\}/g, "the appendix");
  const over = () => notesLineCount({ ...out, source: resolved(out.source), note: resolved(out.note), footnotes: out.footnotes?.map((f) => resolved(f)!) }) > 3;
  const cut = new Set<string>();
  const cutNote = (keep: (sentence: string) => boolean) => {
    while (over() && out.note) {
      const parts = sentencesOf(out.note);
      const drop = parts.map((p, i) => (keep(p) ? -1 : i)).filter((i) => i >= 0).pop();
      if (drop === undefined) break;
      out.note = parts.filter((_, i) => i !== drop).join(" ");
      cut.add("the note line");
    }
  };
  cutNote((p) => REQUIRED_NOTE.test(p) || LAST_NOTE.test(p));
  for (let i = (out.footnotes?.length ?? 0) - 1; i >= 0 && over(); i--) {
    while (over() && sentencesOf(out.footnotes![i]!).length > 1) {
      out.footnotes![i] = sentencesOf(out.footnotes![i]!).slice(0, -1).join(" ");
      cut.add(`footnote (${i + 1})`);
    }
  }
  for (const re of SOURCE_PERIOD) {
    if (!over() || !out.source) break;
    const shorter = out.source.replace(re, "");
    if (shorter === out.source) continue;
    out.source = shorter;
    cut.add("the source line's periods");
  }
  cutNote((p) => REQUIRED_NOTE.test(p));
  if (over()) throw new Error(`Notes band on ${id} needs more than three lines: ${JSON.stringify(out)}`);
  const entry = `${id}: ${[...cut].join(", ")} shortened to keep the notes band to three lines`;
  if (cut.size && !ctx.log.includes(entry)) ctx.log.push(entry);
  return out;
}
