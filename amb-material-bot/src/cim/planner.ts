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
import type { Block, LaidOutPage, PageSpec, SectionEntry } from "./design.ts";
import { drawDivider, layoutPage } from "./design.ts";
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
  const warnings: string[] = [];
  const target = ctx.mainStreet ? TARGETS.mainStreet : TARGETS.lowerMiddleMarket;

  for (let pass = 0; pass < 40; pass++) {
    resolvePresence(ctx, cut, forced, uncarried);
    const built = buildPages(ctx);
    // A host that did not take a module assigned to it gives it back, so no content is lost.
    const dropped = [...ctx.carried.entries()].flatMap(([host, ids]) => ids.filter((id) => !built.some((p) => p.draft.id === host && p.draft.carries.includes(id))));
    if (dropped.length) {
      dropped.forEach((id) => uncarried.add(id));
      continue;
    }
    // Lay out; an overflowing page gives back its last carried module, or the build fails loudly.
    let retry = false;
    for (const p of built) {
      if (!p.draft.spec) continue;
      try {
        p.layout = layoutPage(p.draft.spec);
      } catch (e) {
        const last = p.draft.carries[p.draft.carries.length - 1];
        if (!last) throw e;
        uncarried.add(last);
        warnings.push(`${p.draft.id}: ${(e as Error).message}; ${last} moved to its own page`);
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
    return finish(ctx, built, wantDividers, target, warnings, cut);
  }
  throw new Error("Deck planning did not converge");
}

const moduleOf = (id: string): PageModule | undefined => allModules().find((x) => x.m.id === id)?.m;

/** Guide 3.5 rules 1 and 2: every A module plus each C module whose trigger holds; merges to the named host, following chains. */
function resolvePresence(ctx: CimContext, cut: Set<string>, forced: Set<string>, uncarried: Set<string>): void {
  ctx.present.clear();
  ctx.carried.clear();
  ctx.openQuestions.length = 0;
  for (const { m } of allModules()) if (!cut.has(m.id) && !m.absent(ctx)) ctx.present.add(m.id);
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

function buildPages(ctx: CimContext): PlannedPage[] {
  const carriedIds = new Set([...ctx.carried.values()].flat());
  const out: PlannedPage[] = [];
  for (const s of LIBRARY) {
    for (const m of s.pages) {
      if (!ctx.present.has(m.id) || carriedIds.has(m.id)) continue;
      for (const d of m.build(ctx)) out.push({ draft: d, section: s, num: 0 });
    }
  }
  return out;
}

function finish(ctx: CimContext, built: PlannedPage[], dividers: boolean, target: [number, number], warnings: string[], cut: Set<string>): DeckPlan {
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
    resolveRefs(spec, pageOf);
    p.draft.spec = spec;
  }

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
    else if (!ctx.present.has(m.id)) modules.push({ id: m.id, name: m.name, section: s.name, state: "omitted", reason });
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

/** Resolve page tokens in every string a page will print: title, table cells, observations, prose, notes. */
function resolveRefs(spec: PageSpec, pageOf: (id: string) => number | undefined): void {
  const r = (t: string) => resolvePageRefs(t, pageOf);
  spec.title = r(spec.title);
  spec.notes = { source: spec.notes.source && r(spec.notes.source), note: spec.notes.note && r(spec.notes.note), footnotes: spec.notes.footnotes?.map(r) };
  const fix = (b: Block): void => {
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
