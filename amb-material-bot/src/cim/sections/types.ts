// The contract between the planner and the section library (guide 3.3).
// Each section family S0..S11 is a SectionModule holding its page modules.
// A page module declares its data trigger, the neighbour its content merges
// into when the page would not earn its place (guide 3.5 rule 2), a page
// budget, and a build function that draws its pages from design primitives.

import type { CimContext } from "../context.ts";
import type { CimCopy, PageCopyKey } from "../copy.ts";
import type { PageSpec, Slide, Deck, SectionEntry } from "../design.ts";

/** Contents and divider entries, available when a furniture page is drawn after numbering. */
export interface Toc {
  sections: SectionEntry[];
  /** Exhibit titles and pages per section name, for the divider's "Exhibits in this section" list. */
  exhibits: Map<string, { title: string; page: number }[]>;
}

export interface PageDraft {
  /** Section-library id of the module that owns the page ("S6.1"). */
  id: string;
  /** Laid out by the layout engine; absent on furniture pages that draw themselves. */
  spec?: PageSpec;
  /** Furniture pages (cover, disclaimer, contents, dividers) draw themselves. */
  draw?: (deck: Deck, slide: Slide, num: number, toc: Toc) => void;
  /** Exhibit header titles on the page, for dividers. */
  exhibits: string[];
  /** Module ids whose content the page carries (guide 3.5 rule 2). */
  carries: string[];
  /**
   * "content" pages carry an action title and meet the density targets;
   * "reference" pages (process, appendix) take topic titles and fewer words
   * (guide 4.5 rule 3, 3.2 L6); "furniture" pages draw themselves.
   */
  kind: "content" | "reference" | "furniture";
}

export interface PageModule {
  /** Guide 3.3 id: "S6.1". */
  id: string;
  name: string;
  status: "A" | "C";
  /** Why the module is absent, or undefined when its data trigger holds (guide 3.5 rule 1). */
  absent(ctx: CimContext): string | undefined;
  /**
   * The host page this module's content renders on. `force` is set by the
   * planner when the module's own page fell below the 60% fill floor, so a
   * module with a named neighbour must name it then (guide 3.5 rule 3).
   */
  mergeInto?(ctx: CimContext, force: boolean): string | undefined;
  /** Pages the module adds when it is built on its own: [min, max]. */
  budget: [number, number];
  build(ctx: CimContext): PageDraft[];
  /** Template copy for a deal with no API key and no fixture: figures from the brief, qualitative gaps as [Confirm: …]. */
  fallback?(ctx: CimContext): Partial<CimCopy>;
  /** The page copy key the module reads, so the prompt can list each page's exhibit row keys. */
  copyKey?: PageCopyKey;
}

export interface SectionModule {
  /** "S6" */
  id: string;
  /** Footer tracker and contents name: "Financial performance". */
  name: string;
  pages: PageModule[];
  /** Front matter gets no divider and no contents entry. */
  front?: boolean;
}
