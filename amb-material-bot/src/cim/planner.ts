// The variable-length rule (guide 3.5) as code. The planner evaluates every
// module's data trigger, applies the library's merges, builds and lays out
// every page, then enforces the density rules: a page whose content
// overflows gives back the module it carries; a page below the 60% fill
// floor merges into its named neighbour; a deck over its length target cuts
// modules in the guide's order. It numbers the pages, adds dividers only at
// 24 pages or more in Main Street mode (always in lower middle market), and
// builds the contents from the result.

import type { CimContext } from "./context.ts";
import { resolvePageRefs } from "./context.ts";
import { smartQuotes } from "../util/format.ts";
import type { Block, LaidOutPage, PageSpec, SectionEntry } from "./design.ts";
import { drawDivider, dropEmptyObs, layoutPage, MAX_EXHIBITS, noteRounding } from "./design.ts";
import { fitNotes, markersIn } from "./sections/common.ts";
import { LIBRARY } from "./sections/index.ts";
import type { PageDraft, PageModule, SectionModule, Toc } from "./sections/types.ts";

export interface ModuleState {
  id: string;
  name: string;
  section: string;
  state: "built" | "merged" | "omitted" | "cut";
  /** The page that carries a merged module. */
  host?: string;
  reason?: string;
}

export interface PlannedPage {
  draft: PageDraft;
  layout?: LaidOutPage;
  section: SectionModule;
  num: number;
}

export interface DeckPlan {
  pages: PlannedPage[];
  modules: ModuleState[];
  dividers: boolean;
  /** Target length for the mode (guide 3.4), counted on content, reference and front-matter pages. */
  target: [number, number];
  toc: Toc;
  warnings: string[];
}

export interface PlanOptions {
  /** "auto" follows guide 3.4 / D12; tests force either way. */
  dividers?: "auto" | "on" | "off";
}

/** Cut order when the deck exceeds its target (guide 3.5 rule 5). S1, S6.1, S7.1, S7.2 and S10 are never cut. */
export const CUT_ORDER = ["S3.3", "S6.5", "S4.6", "S5.5", "S2.1", "S6.4"];

/** Target lengths by mode (guide 3.4): Main Street 20 to 28; lower middle market 30 to 42 plus up to 12 of appendix. */
export const TARGETS = { mainStreet: [20, 28] as [number, number], lowerMiddleMarket: [30, 54] as [number, number] };

/** The 60% fill floor of guide 3.5 rule 3. */
export const FILL_FLOOR = 0.6;

const allModules = (): { m: PageModule; s: SectionModule }[] => LIBRARY.flatMap((s) => s.pages.map((m) => ({ m, s })));

export function planDeck(ctx: CimContext, opts: PlanOptions = {}): DeckPlan {
  const forced = new Set<string>();
  const uncarried = new Set<string>();
  const cut = new Set<string>();
  // Pages that could not be built or laid out even alone: left out and reported, so one page never costs the whole deck.
  const failed = new Map<string, string>();
  const warnings: string[] = [];
  const target = ctx.mainStreet ? TARGETS.mainStreet : TARGETS.lowerMiddleMarket;
  const fail = (id: string, e: unknown) => {
    const message = (e as Error).message;
    failed.set(id, `Not built: ${message}`);
    warnings.push(`${id}: page left out of the deck because it could not be built (${message}); review before sending`);
  };

  for (let pass = 0; pass < 40; pass++) {
    resolvePresence(ctx, cut, forced, uncarried, failed);
    const { pages: built, giveBack } = buildPages(ctx, fail);
    // A host whose build failed gives back its last carried module and is built again without it.
    if (giveBack) {
      uncarried.add(giveBack.id);
      warnings.push(`${giveBack.host}: ${giveBack.message}; ${giveBack.id} moved to its own page`);
      continue;
    }
    // A host that did not take a module assigned to it gives it back, so no content is lost.
    const dropped = [...ctx.carried.entries()].flatMap(([host, ids]) => ids.filter((id) => !built.some((p) => p.draft.id === host && p.draft.carries.includes(id))));
    if (dropped.length) {
      dropped.forEach((id) => uncarried.add(id));
      continue;
    }
    // Lay out; an overflowing page gives back its last carried module, or is left out and reported.
    let retry = false;
    for (const p of built) {
      if (!p.draft.spec) continue;
      try {
        dropEmptyObs(p.draft.spec);
        noteRounding(p.draft.spec);
        // The rounding clause lengthens the Note line after the module fitted its band, so the band is fitted again.
        p.draft.spec.notes = fitNotes(ctx, p.draft.id, p.draft.spec.notes);
        p.layout = layoutPage(p.draft.spec);
      } catch (e) {
        const last = p.draft.carries[p.draft.carries.length - 1];
        if (last) {
          uncarried.add(last);
          warnings.push(`${p.draft.id}: ${(e as Error).message}; ${last} moved to its own page`);
        } else fail(p.draft.id, e);
        retry = true;
        break;
      }
    }
    if (retry) continue;
    // Fill floor: a thin page merges into the neighbour its module names (guide 3.5 rule 3).
    const thin = built.find((p) => p.draft.kind === "content" && p.layout && p.layout.fill < FILL_FLOOR && !forced.has(p.draft.id) && moduleOf(p.draft.id)?.mergeInto?.(ctx, true));
    if (thin) {
      forced.add(thin.draft.id);
      warnings.push(`${thin.draft.id}: fill ${(thin.layout!.fill * 100).toFixed(0)}% is below the 60% floor; merged into its neighbour`);
      continue;
    }
    // Length: dividers join at 24 pages in Main Street mode; if they would take the deck past its target, cut in the guide's order.
    const count = built.length;
    const bodySections = new Set(built.filter((p) => !p.section.front && p.section.id !== "S11").map((p) => p.section.id)).size + (built.some((p) => p.section.id === "S11") ? 1 : 0);
    const wantDividers = opts.dividers === "on" || (opts.dividers !== "off" && (!ctx.mainStreet || count >= 24));
    const total = count + (wantDividers ? bodySections : 0);
    if (total > target[1] && opts.dividers !== "on") {
      const next = CUT_ORDER.find((id) => ctx.present.has(id) && built.some((p) => p.draft.id === id));
      if (next) {
        cut.add(next);
        warnings.push(`${next}: cut for length (${total} pages against a target of ${target[0]} to ${target[1]}, guide 3.5 rule 5)`);
        continue;
      }
      warnings.push(`Deck runs ${total} pages against a target of ${target[0]} to ${target[1]}; nothing left in the cut order`);
    }
    return finish(ctx, built, wantDividers, target, warnings, cut, failed);
  }
  throw new Error("Deck planning did not converge");
}

const moduleOf = (id: string): PageModule | undefined => allModules().find((x) => x.m.id === id)?.m;

/** Guide 3.5 rules 1 and 2: every A module plus each C module whose trigger holds; merges to the named host, following chains. */
function resolvePresence(ctx: CimContext, cut: Set<string>, forced: Set<string>, uncarried: Set<string>, failed: Map<string, string>): void {
  ctx.present.clear();
  ctx.carried.clear();
  ctx.openQuestions.length = 0;
  for (const { m } of allModules()) if (!cut.has(m.id) && !failed.has(m.id) && !m.absent(ctx)) ctx.present.add(m.id);
  const hostOf = new Map<string, string>();
  for (const { m } of allModules()) {
    if (!ctx.present.has(m.id) || !m.mergeInto || uncarried.has(m.id)) continue;
    let host = m.mergeInto(ctx, forced.has(m.id));
    while (host && hostOf.has(host)) host = hostOf.get(host);
    if (!host || host === m.id || !ctx.present.has(host)) continue;
    hostOf.set(m.id, host);
    ctx.carried.set(host, [...(ctx.carried.get(host) ?? []), m.id]);
  }
}

/**
 * Build every present page. A build that throws on a host carrying other
 * modules stops the pass and names the module to give back; one that throws
 * alone is reported through `fail` and the page is left out.
 */
function buildPages(ctx: CimContext, fail: (id: string, e: unknown) => void): { pages: PlannedPage[]; giveBack?: { host: string; id: string; message: string } } {
  const carriedIds = new Set([...ctx.carried.values()].flat());
  const out: PlannedPage[] = [];
  for (const s of LIBRARY) {
    for (const m of s.pages) {
      if (!ctx.present.has(m.id) || carriedIds.has(m.id)) continue;
      try {
        for (const d of m.build(ctx)) out.push({ draft: d, section: s, num: 0 });
      } catch (e) {
        const last = ctx.carried.get(m.id)?.at(-1);
        if (last) return { pages: out, giveBack: { host: m.id, id: last, message: (e as Error).message } };
        fail(m.id, e);
      }
    }
  }
  return { pages: out };
}

function finish(ctx: CimContext, built: PlannedPage[], dividers: boolean, target: [number, number], warnings: string[], cut: Set<string>, failed: Map<string, string>): DeckPlan {
  const pages: PlannedPage[] = [];
  const sectionPages = new Map<string, PlannedPage[]>();
  for (const p of built) sectionPages.set(p.section.id, [...(sectionPages.get(p.section.id) ?? []), p]);
  // Insert a divider before each body section when dividers are on.
  for (const s of LIBRARY) {
    const ps = sectionPages.get(s.id) ?? [];
    if (!ps.length) continue;
    if (dividers && !s.front) pages.push({ draft: dividerDraft(ctx, s), section: s, num: 0 });
    pages.push(...ps);
  }
  pages.forEach((p, i) => (p.num = i + 1));

  const pageOf = (id: string): number | undefined => {
    const direct = pages.find((p) => p.draft.id === id);
    if (direct) return direct.num;
    return pages.find((p) => p.draft.carries.includes(id))?.num;
  };
  // The laid-out spec is the one drawn (it may have shed an observation to fit), so references resolve there.
  for (const p of pages) {
    const spec = p.layout?.spec ?? p.draft.spec;
    if (!spec) continue;
    resolveRefs(spec, pageOf, p.num);
    p.draft.spec = spec;
  }

  warnings.push(...labelConflicts(pages), ...commentaryDensity(pages), ...mixedUnits(pages), ...narrowTables(pages), ...orphanMarkers(pages), ...exhibitCounts(pages));

  const sections: SectionEntry[] = [];
  const exhibits = new Map<string, { title: string; page: number }[]>();
  for (const s of LIBRARY) {
    const ps = pages.filter((p) => p.section.id === s.id);
    if (!ps.length || s.front) continue;
    sections.push({ name: s.name, page: ps[0]!.num });
    exhibits.set(s.name, ps.flatMap((p) => p.draft.exhibits.map((title) => ({ title, page: p.num }))));
  }

  const modules: ModuleState[] = [];
  const carriedBy = new Map<string, string>();
  for (const [host, ids] of ctx.carried) for (const id of ids) carriedBy.set(id, host);
  for (const { m, s } of allModules()) {
    if (s.front) continue;
    const reason = m.absent(ctx);
    if (cut.has(m.id)) modules.push({ id: m.id, name: m.name, section: s.name, state: "cut", reason: "Cut for length (guide 3.5 rule 5)" });
    else if (!ctx.present.has(m.id)) modules.push({ id: m.id, name: m.name, section: s.name, state: "omitted", reason: failed.get(m.id) ?? reason });
    else if (carriedBy.has(m.id)) modules.push({ id: m.id, name: m.name, section: s.name, state: "merged", host: carriedBy.get(m.id) });
    else modules.push({ id: m.id, name: m.name, section: s.name, state: "built" });
  }
  for (const p of pages) warnings.push(...(p.layout?.warnings ?? []));
  return { pages, modules, dividers, target, toc: { sections, exhibits }, warnings };
}

function dividerDraft(ctx: CimContext, s: SectionModule): PageDraft {
  return {
    id: `${s.id}.divider`,
    kind: "furniture",
    exhibits: [],
    carries: [],
    draw: (_deck, slide, num, toc) => {
      const current = toc.sections.find((x) => x.name === s.name) ?? { name: s.name, page: num };
      drawDivider(slide, ctx.code, current, toc.exhibits.get(s.name) ?? [], toc.sections, num);
    },
  };
}

/** Spec 9: a standard page carries 120 to 220 words of commentary outside its tables. */
export const COMMENTARY_FLOOR = 120;

/**
 * Commentary density and evenness (spec 9, guide 3.2, T9), reported for the
 * advisor: a content page with observations but under the word floor, and
 * neighbouring pages with the same number of observations, which reads as a
 * template rather than as the evidence.
 */
/** Share of the content band a body page must cover (spec 9, the spec 14 page-budget assertion). */
export const STANDARD_FILL = 0.8;

export function commentaryDensity(pages: PlannedPage[]): string[] {
  const out: string[] = [];
  let prev: { id: string; count: number } | undefined;
  for (const p of pages) {
    const spec = p.draft.spec;
    if (p.draft.kind !== "content" || !spec || !p.layout) {
      prev = undefined;
      continue;
    }
    // Body pages (S2 to S9) fill the band; the executive summary, transaction and appendix pages have their own archetypes.
    if (/^S[2-9]\./.test(p.draft.id) && p.layout.fill < STANDARD_FILL) out.push(`${p.draft.id}: fill ${(p.layout.fill * 100).toFixed(0)}% is below the ${STANDARD_FILL * 100}% floor for a body page (spec 9, spec 14)`);
    const obs = spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]).find((b) => b.kind === "observations");
    if (!obs || obs.kind !== "observations") {
      prev = undefined;
      continue;
    }
    if (p.layout.words < COMMENTARY_FLOOR) out.push(`${p.draft.id}: ${p.layout.words} words of commentary (floor ${COMMENTARY_FLOOR}, spec 9)`);
    const count = obs.items.length;
    if (prev && prev.count === count) out.push(`${p.draft.id}: ${count} observations, as on ${prev.id} before it (T9: counts follow the evidence)`);
    prev = { id: p.draft.id, count };
  }
  return out;
}

/** Footnote markers with no footnote on their page (guide 4.6, F31). */
export function orphanMarkers(pages: PlannedPage[]): string[] {
  const out: string[] = [];
  for (const p of pages) {
    const spec = p.layout?.spec ?? p.draft.spec;
    if (!spec) continue;
    const count = spec.notes.footnotes?.length ?? 0;
    const blocks = spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])]);
    for (const n of markersIn(blocks)) if (n > count) out.push(`${p.draft.id}: marker (${n}) has no footnote`);
  }
  return out;
}

/** A table may end this far inside its exhibit rule; beyond it the right edge reads as ragged (spec 1, 9). */
const TABLE_SHORT = 0.25;

/** Content pages carrying more exhibits than spec 7.3 allows; prose, callouts and the observations list are not exhibits (F39). */
export function exhibitCounts(pages: PlannedPage[]): string[] {
  return pages
    .filter((p) => p.draft.kind === "content")
    .map((p) => ({ id: p.draft.id, n: (p.layout?.placed ?? []).filter((x) => x.block.kind === "chart" || x.block.kind === "numTable" || x.block.kind === "textTable").length }))
    .filter((x) => x.n > MAX_EXHIBITS)
    .map((x) => `${x.id}: ${x.n} exhibits (spec 7.3 allows one to ${MAX_EXHIBITS})`);
}

/** Tables that end more than TABLE_SHORT in short of the block (and exhibit rule) they sit in (F27). */
export function narrowTables(pages: PlannedPage[]): string[] {
  const out: string[] = [];
  for (const p of pages) {
    for (const placed of p.layout?.placed ?? []) {
      const b = placed.block;
      if (b.kind !== "numTable" && b.kind !== "textTable") continue;
      const w = b.kind === "numTable" ? b.spec.cols.reduce((s, c) => s + c.w, 0) : b.spec.colW.reduce((s, c) => s + c, 0);
      if (placed.w - w > TABLE_SHORT) out.push(`${p.draft.id}: "${b.header?.title ?? "table"}" ends ${(placed.w - w).toFixed(2)} in short of its block`);
    }
  }
  return out;
}

/**
 * Fact-table columns that mix dollar amounts carrying their unit in the cell
 * ("$152.0K", "$200 a year") with bare ones ("$152"), which read in the
 * header's unit (spec 4.3): "$200" beside "$152.0K" reads as $200K (F24).
 */
export function mixedUnits(pages: PlannedPage[]): string[] {
  const out: string[] = [];
  const unit = /\$[\d,.]+\s*[KMB]\b|\$[\d,.]+ (a|per) /;
  for (const p of pages) {
    const spec = p.draft.spec;
    if (!spec) continue;
    for (const b of spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])])) {
      if (b.kind !== "numTable") continue;
      const heads = b.spec.cols.filter((c) => c.kind === "num").map((c) => c.head ?? "value");
      heads.forEach((head, i) => {
        const money = b.spec.rows.flatMap((row) => (row.vals?.[i] && /\$\d/.test(row.vals[i]!) ? [row.vals[i]!] : []));
        const withUnit = money.filter((v) => unit.test(v));
        if (withUnit.length && withUnit.length < money.length) out.push(`${spec.id}: "${b.header?.title ?? b.spec.name}" mixes dollar amounts with and without a unit in its ${head} column (${money.find((v) => !unit.test(v))} beside ${withUnit[0]})`);
      });
    }
  }
  return out;
}

/** Row labels that repeat in every table (a margin line, a total, a subtotal of the table's own lines), so they name no single amount. */
const GENERIC_LABELS = /^(% |total$|other$|\(|revenue per)/i;

/**
 * One label, one amount (guide 4.8, T27): a table row label that prints a
 * different figure for the same period on another page is reported, so
 * "Other operating expenses" can never mean three amounts in one deck.
 */
export function labelConflicts(pages: PlannedPage[]): string[] {
  const seen = new Map<string, { value: string; page: number }>();
  const out: string[] = [];
  for (const p of pages) {
    const spec = p.draft.spec;
    if (!spec) continue;
    for (const b of spec.rows.flatMap((r) => [...r.columns.flatMap((c) => c.blocks), ...(r.floating ?? [])])) {
      if (b.kind !== "numTable" || /%/.test(b.header?.units ?? "")) continue;
      const heads = b.spec.cols.filter((c) => c.kind === "num").map((c) => c.head ?? "");
      for (const row of b.spec.rows) {
        if (!row.vals || row.type === "ratio" || GENERIC_LABELS.test(row.label)) continue;
        row.vals.forEach((v, i) => {
          const period = heads[i]!;
          // Periods only: a growth head ("LTM y/y", "FY25 y/y") names a comparison, and two tables may compare different pairs.
          if (!/^(FY\d{4}|LTM|PF)/.test(period) || /y\/y|CAGR/.test(period) || !/\d/.test(v)) return;
          const key = `${row.label.toLowerCase()}|${period}`;
          const prev = seen.get(key);
          if (!prev) seen.set(key, { value: v.replace(/\$/g, ""), page: p.num });
          else if (prev.value !== v.replace(/\$/g, "")) out.push(`"${row.label}" ${period} prints ${prev.value} on page ${prev.page} and ${v} on page ${p.num}`);
        });
      }
    }
  }
  return [...new Set(out)];
}

/** Resolve page tokens in every string a page will print: title, table cells, observations, prose, notes. */
function resolveRefs(spec: PageSpec, pageOf: (id: string) => number | undefined, here: number): void {
  // Page numbers in, then typographic quotes: the last pass over every string the page prints.
  const r = (t: string) => smartQuotes(resolvePageRefs(t, pageOf, here));
  spec.title = r(spec.title);
  spec.notes = { source: spec.notes.source && r(spec.notes.source), note: spec.notes.note && r(spec.notes.note), footnotes: spec.notes.footnotes?.map(r) };
  const fix = (b: Block): void => {
    if ("header" in b && b.header) b.header = { ...b.header, title: r(b.header.title), annotation: b.header.annotation && r(b.header.annotation) };
    switch (b.kind) {
      case "numTable":
        for (const row of b.spec.rows) {
          row.label = r(row.label);
          if (row.text) row.text = r(row.text);
          if (row.vals) row.vals = row.vals.map(r);
        }
        break;
      case "textTable":
        b.spec.rows = b.spec.rows.map((row) => row.map((c) => (typeof c === "string" ? r(c) : { lead: r(c.lead), body: r(c.body) })));
        break;
      case "observations":
        b.items = b.items.map((it) => ({ ...it, lead: r(it.lead), body: r(it.body) }));
        break;
      case "prose":
        b.paragraphs = b.paragraphs.map((p) => ({ lead: p.lead && r(p.lead), body: r(p.body) }));
        break;
      case "callout":
        b.body = r(b.body);
        break;
      default:
        break;
    }
  };
  for (const row of spec.rows) {
    for (const c of row.columns) c.blocks.forEach(fix);
    row.floating?.forEach(fix);
  }
}
