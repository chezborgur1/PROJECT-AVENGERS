// PowerPoint refuses markup that LibreOffice reads without complaint: the
// deck opened in LibreOffice while PowerPoint offered to repair it. pptxgenjs
// 4.0.1 writes that markup itself, so every deck passes through
// `normalizePackage` after it is written, and `officeDefects` proves the
// result (buildCim refuses a deck it faults; the tests hold every chart type
// and text shape to it). The Open XML SDK validator, which reads a package
// the way Office does, reports none of it on a normalized deck.
//
// What pptxgenjs writes and PowerPoint repairs:
// - a line chart's group has no <c:grouping> (CT_LineChart requires it
//   first; PowerPoint's repair inserts <c:grouping val="standard"/>), and in a
//   bar-and-line chart its series carry <c:invertIfNegative>, a bar-series
//   element, and their labels ahead of the marker;
// - every 2D bar and line group names a third axis, the series axis only a
//   3D chart declares: a dangling reference PowerPoint's repair strips;
// - a missing value prints as an empty <c:v> in a numeric cache, where a gap
//   is a point left out;
// - a paragraph of several runs gets an <a:pPr> before every run, where
//   CT_TextParagraph allows one, first;
// - a table's graphic frame takes the id `table number x slide number + 1`,
//   which collides with the ids of the shapes drawn before it;
// - [Content_Types].xml declares a slide master per slide (only one exists)
//   and media types the deck does not hold, and the zip carries folder
//   entries, which no part name may be.
// A stacked bar with labels at the outside end is refused too; pptxgenjs lets
// it through, so `chart()` never draws one and `officeDefects` reports it.
//
// Left as pptxgenjs writes it: presentation.xml lists the notes master after
// the slides, out of schema order. The notes master shares the slide master's
// theme, which PowerPoint refuses once the list is where the schema puts it;
// out of order, PowerPoint passes over it and opens the deck.

import JSZip from "jszip";

interface Child {
  name: string;
  xml: string;
}

/**
 * The top-level elements of an element's content, in order, or undefined when
 * the content holds text or markup this reader does not follow. Element names
 * never nest inside themselves in the parts it reads, but depth is counted all
 * the same.
 */
export function childElements(inner: string): Child[] | undefined {
  const out: Child[] = [];
  const open = /<([A-Za-z]+:[A-Za-z0-9]+)\b[^>]*?(\/?)>/y;
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i]!)) i++;
    if (i >= inner.length) break;
    open.lastIndex = i;
    const m = open.exec(inner);
    if (!m) return undefined;
    const name = m[1]!;
    if (m[2] === "/") {
      out.push({ name, xml: m[0] });
      i = open.lastIndex;
      continue;
    }
    const tag = new RegExp(`<${name}\\b[^>]*?(/?)>|</${name}>`, "g");
    tag.lastIndex = open.lastIndex;
    let depth = 1;
    let end = -1;
    for (let t = tag.exec(inner); t; t = tag.exec(inner)) {
      if (t[0].startsWith("</")) {
        if (--depth === 0) {
          end = tag.lastIndex;
          break;
        }
      } else if (t[1] !== "/") depth++;
    }
    if (end < 0) return undefined;
    out.push({ name, xml: inner.slice(i, end) });
    i = end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Slides: one paragraph-properties element per paragraph, unique shape ids
// ---------------------------------------------------------------------------

const PPR = /<a:pPr\b[^>]*?\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g;

/** CT_TextParagraphProperties children in schema order; members of one choice share a slot. */
const PPR_SLOTS: string[][] = [
  ["a:lnSpc"],
  ["a:spcBef"],
  ["a:spcAft"],
  ["a:buClrTx", "a:buClr"],
  ["a:buSzTx", "a:buSzPct", "a:buSzPts"],
  ["a:buFontTx", "a:buFont"],
  ["a:buNone", "a:buAutoNum", "a:buChar", "a:buBlip"],
  ["a:tabLst"],
  ["a:defRPr"],
  ["a:extLst"],
];

/**
 * Several paragraph-properties elements folded into one: a later attribute or
 * child (or another member of the same choice) replaces an earlier one, the
 * way LibreOffice applies them in turn when it reads the paragraph.
 */
export function mergeParagraphProps(pprs: string[]): string {
  const attrs = new Map<string, string>();
  const slots = new Map<number, string>();
  for (const ppr of pprs) {
    const start = /^<a:pPr\b([^>]*?)\/?>/.exec(ppr)!;
    for (const a of start[1]!.matchAll(/([\w:]+)="([^"]*)"/g)) attrs.set(a[1]!, a[2]!);
    if (!ppr.endsWith("</a:pPr>")) continue;
    const inner = ppr.slice(start[0].length, ppr.length - "</a:pPr>".length);
    const kids = childElements(inner);
    if (!kids) throw new Error(`Paragraph properties this pass cannot read: ${ppr.slice(0, 200)}`);
    for (const k of kids) {
      const slot = PPR_SLOTS.findIndex((s) => s.includes(k.name));
      if (slot < 0) throw new Error(`Unexpected <${k.name}> in paragraph properties`);
      slots.set(slot, k.xml);
    }
  }
  const attrXml = [...attrs].map(([k, v]) => ` ${k}="${v}"`).join("");
  const kids = [...slots].sort((a, b) => a[0] - b[0]).map(([, xml]) => xml).join("");
  return kids ? `<a:pPr${attrXml}>${kids}</a:pPr>` : `<a:pPr${attrXml}/>`;
}

/** Every paragraph with at most one <a:pPr>, first; every shape id in the part unique. */
export function normalizeSlideXml(xml: string): string {
  let out = xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (p, inner: string) => {
    const pprs = inner.match(PPR) ?? [];
    if (pprs.length === 0 || (pprs.length === 1 && inner.startsWith(pprs[0]!))) return p;
    return `<a:p>${mergeParagraphProps(pprs)}${inner.replace(PPR, "")}</a:p>`;
  });
  const ids = [...out.matchAll(/<p:cNvPr\b[^>]*?\sid="(\d+)"/g)].map((m) => Number(m[1]));
  let next = Math.max(0, ...ids) + 1;
  const seen = new Set<number>();
  out = out.replace(/(<p:cNvPr\b[^>]*?\sid=")(\d+)(")/g, (m, pre: string, id: string, post: string) => {
    const n = Number(id);
    if (n > 0 && !seen.has(n)) {
      seen.add(n);
      return m;
    }
    seen.add(next);
    return `${pre}${next++}${post}`;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

/** Series children in schema order (CT_LineSer, CT_BarSer, CT_AreaSer). */
const SER_ORDER: Record<string, string[]> = {
  lineChart: ["c:idx", "c:order", "c:tx", "c:spPr", "c:marker", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:cat", "c:val", "c:smooth", "c:extLst"],
  barChart: ["c:idx", "c:order", "c:tx", "c:spPr", "c:invertIfNegative", "c:pictureOptions", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:cat", "c:val", "c:shape", "c:extLst"],
  areaChart: ["c:idx", "c:order", "c:tx", "c:spPr", "c:pictureOptions", "c:dPt", "c:dLbls", "c:trendline", "c:errBars", "c:cat", "c:val", "c:extLst"],
};

const CHART_GROUP = /<c:(\w+Chart)>([\s\S]*?)<\/c:\1>/g;
const declaredAxes = (xml: string): Set<string> => new Set([...xml.matchAll(/<c:(?:catAx|valAx|dateAx|serAx)>\s*<c:axId val="(-?\d+)"\/>/g)].map((m) => m[1]!));

/** A series' children in its type's schema order, without the ones the type does not allow. */
function orderSeries(group: string, ser: string): string {
  const order = SER_ORDER[group];
  if (!order) return ser;
  const kids = childElements(ser.slice("<c:ser>".length, -"</c:ser>".length));
  if (!kids) return ser;
  const kept = kids.filter((k) => order.includes(k.name));
  const sorted = [...kept].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  if (sorted.length === kids.length && sorted.every((k, i) => k === kids[i])) return ser;
  return `<c:ser>${sorted.map((k) => k.xml).join("")}</c:ser>`;
}

/**
 * A chart part PowerPoint opens as written: every chart group names only the
 * axes the part declares, a line group has its grouping, series hold their
 * children in schema order, and a missing value is a point left out.
 */
export function normalizeChartXml(xml: string): string {
  const axes = declaredAxes(xml);
  let out = xml.replace(CHART_GROUP, (block, group: string, inner: string) => {
    let body = inner.replace(/<c:axId val="(-?\d+)"\/>/g, (ax, id: string) => (axes.has(id) ? ax : ""));
    if (group === "lineChart" && !/^\s*<c:grouping\b/.test(body)) body = `<c:grouping val="standard"/>${body}`;
    body = body.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => orderSeries(group, ser));
    return `<c:${group}>${body}</c:${group}>`;
  });
  out = out.replace(/<c:numCache>[\s\S]*?<\/c:numCache>/g, (cache) => cache.replace(/<c:pt idx="\d+">\s*(?:<c:v>\s*<\/c:v>|<c:v\s*\/>)\s*<\/c:pt>/g, ""));
  return out;
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

const SLIDE_LIKE = /^ppt\/(?:slides|slideLayouts|slideMasters|notesSlides|notesMasters)\/[^/]+\.xml$/;
const CHART_PART = /^ppt\/charts\/chart\d+\.xml$/;

const CONTENT_TYPES = "[Content_Types].xml";
/** Extensions every package declares whether or not a part uses them. */
const CORE_EXTENSIONS = new Set(["xml", "rels"]);

const extensionOf = (f: string): string => (/\.([^./]+)$/.exec(f)?.[1] ?? "").toLowerCase();

/** Content types for the parts the package holds: no override for a missing part, no default for an extension no part has. */
export function normalizeContentTypesXml(xml: string, parts: string[]): string {
  const names = new Set(parts);
  const extensions = new Set(parts.map(extensionOf));
  return xml
    .replace(/<Override\b[^>]*?\bPartName="\/?([^"]+)"[^>]*?\/>/g, (o, part: string) => (names.has(part) ? o : ""))
    .replace(/<Default\b[^>]*?\bExtension="([^"]+)"[^>]*?\/>/g, (d, ext: string) => (CORE_EXTENSIONS.has(ext.toLowerCase()) || extensions.has(ext.toLowerCase()) ? d : ""));
}

/**
 * The deck PowerPoint opens as written: every part pptxgenjs writes in a
 * shape PowerPoint repairs is rewritten (see the header), and the zip holds
 * parts only, [Content_Types].xml first, as Office writes it.
 */
export async function normalizePackage(zip: JSZip): Promise<Buffer> {
  const parts = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir);
  const out = new JSZip();
  const ordered = [...parts.filter((f) => f === CONTENT_TYPES), ...parts.filter((f) => f === "_rels/.rels"), ...parts.filter((f) => f !== CONTENT_TYPES && f !== "_rels/.rels")];
  for (const f of ordered) {
    const fix = SLIDE_LIKE.test(f) ? normalizeSlideXml : CHART_PART.test(f) ? normalizeChartXml : f === CONTENT_TYPES ? (xml: string) => normalizeContentTypesXml(xml, parts) : undefined;
    const data = fix ? fix(await zip.file(f)!.async("string")) : await zip.file(f)!.async("uint8array");
    out.file(f, data, { createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ---------------------------------------------------------------------------
// The proof
// ---------------------------------------------------------------------------

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

function slideDefects(part: string, xml: string): string[] {
  const out: string[] = [];
  let bad = 0;
  for (const p of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const pprs = p[1]!.match(PPR) ?? [];
    if (pprs.length > 1 || (pprs.length === 1 && !p[1]!.startsWith(pprs[0]!))) bad++;
  }
  if (bad) out.push(`${part}: ${bad} paragraph(s) with <a:pPr> repeated or after a run`);
  const ids = [...xml.matchAll(/<p:cNvPr\b[^>]*?\sid="(\d+)"/g)].map((m) => Number(m[1]));
  const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dup.length) out.push(`${part}: shape id ${dup.join(", ")} used more than once`);
  if (ids.includes(0)) out.push(`${part}: shape id 0`);
  for (const t of xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)) if (CONTROL.test(t[1]!)) out.push(`${part}: control character in text "${t[1]!.slice(0, 40)}"`);
  return out;
}

function chartDefects(part: string, xml: string): string[] {
  const out: string[] = [];
  const axes = declaredAxes(xml);
  for (const g of xml.matchAll(CHART_GROUP)) {
    const [, group, inner] = g as unknown as [string, string, string];
    const ids = [...inner.matchAll(/<c:axId val="(-?\d+)"\/>/g)].map((m) => m[1]!);
    const undeclared = ids.filter((id) => !axes.has(id));
    if (undeclared.length) out.push(`${part}: <c:${group}> names axis ${undeclared.join(", ")}, which the chart does not declare`);
    if (/^(bar|line|area|scatter|radar)Chart$/.test(group) && ids.length !== 2) out.push(`${part}: <c:${group}> names ${ids.length} axes, not 2`);
    if (group === "lineChart" && !/^\s*<c:grouping\b/.test(inner)) out.push(`${part}: <c:lineChart> has no <c:grouping> first`);
    const grouping = /<c:grouping val="(\w+)"\/>/.exec(inner)?.[1];
    if (group === "barChart" && (grouping === "stacked" || grouping === "percentStacked") && inner.includes('<c:dLblPos val="outEnd"/>')) {
      out.push(`${part}: a ${grouping} bar chart with labels at the outside end`);
    }
    const order = SER_ORDER[group];
    for (const s of inner.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
      const kids = childElements(s[1]!);
      if (!kids) {
        out.push(`${part}: a <c:${group}> series this check cannot read`);
        continue;
      }
      if (!order) continue;
      const names = kids.map((k) => k.name);
      const foreign = names.filter((n) => !order.includes(n));
      if (foreign.length) out.push(`${part}: <c:${group}> series holds ${[...new Set(foreign)].join(", ")}`);
      const ranks = names.filter((n) => order.includes(n)).map((n) => order.indexOf(n));
      if (ranks.some((r, i) => i > 0 && r < ranks[i - 1]!)) out.push(`${part}: <c:${group}> series children out of order (${names.join(" ")})`);
    }
  }
  for (const c of xml.matchAll(/<c:numCache>([\s\S]*?)<\/c:numCache>/g)) {
    const count = Number(/<c:ptCount val="(\d+)"\/>/.exec(c[1]!)?.[1] ?? -1);
    for (const pt of c[1]!.matchAll(/<c:pt idx="(\d+)"[^>]*>\s*(?:<c:v>([^<]*)<\/c:v>|<c:v\s*\/>)\s*<\/c:pt>/g)) {
      const v = (pt[2] ?? "").trim();
      if (v === "" || !Number.isFinite(Number(v))) out.push(`${part}: numeric point ${pt[1]} holds "${v}"`);
      if (Number(pt[1]) >= count) out.push(`${part}: numeric point ${pt[1]} past ptCount ${count}`);
    }
  }
  return out;
}

const themeOf = async (zip: JSZip, master: string): Promise<string | undefined> => {
  const [dir, base] = [master.slice(0, master.lastIndexOf("/")), master.slice(master.lastIndexOf("/") + 1)];
  const rels = await zip.file(`${dir}/_rels/${base}.rels`)?.async("string");
  const target = rels && /<Relationship\b[^>]*?Type="[^"]*\/theme"[^>]*?Target="([^"]+)"|<Relationship\b[^>]*?Target="([^"]+)"[^>]*?Type="[^"]*\/theme"/.exec(rels);
  const t = target?.[1] ?? target?.[2];
  if (!t) return undefined;
  const path: string[] = t.startsWith("/") ? [] : dir.split("/");
  for (const seg of t.replace(/^\//, "").split("/")) {
    if (seg === "..") path.pop();
    else if (seg !== ".") path.push(seg);
  }
  return path.join("/");
};

async function packageDefects(zip: JSZip): Promise<string[]> {
  const out: string[] = [];
  const parts = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir);
  const folders = Object.keys(zip.files).filter((f) => zip.files[f]!.dir);
  if (folders.length) out.push(`the zip holds ${folders.length} folder entr${folders.length === 1 ? "y" : "ies"} (${folders.slice(0, 3).join(", ")})`);
  const types = await zip.file(CONTENT_TYPES)?.async("string");
  if (!types) out.push(`no ${CONTENT_TYPES}`);
  else {
    const missing = [...types.matchAll(/<Override\b[^>]*?\bPartName="\/?([^"]+)"/g)].map((m) => m[1]!).filter((p) => !parts.includes(p));
    if (missing.length) out.push(`${CONTENT_TYPES}: ${missing.length} override(s) for parts the deck does not hold (${missing.slice(0, 3).join(", ")})`);
  }
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  if (pres) {
    const ids = [...pres.matchAll(/<p:sldId\b[^>]*?\sid="(\d+)"/g)].map((m) => Number(m[1]));
    if (new Set(ids).size !== ids.length || ids.some((id) => id < 256)) out.push(`ppt/presentation.xml: slide ids ${ids.join(", ")} are not unique ids of 256 or more`);
    // A notes master listed where the schema puts it is read, and then must not share the slide master's theme (see the header).
    const notes = pres.indexOf("<p:notesMasterIdLst>");
    const slides = pres.indexOf("<p:sldIdLst>");
    if (notes >= 0 && (slides < 0 || notes < slides)) {
      const masters = parts.filter((f) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f));
      const slideThemes = new Set(await Promise.all(masters.map((m) => themeOf(zip, m))));
      for (const n of parts.filter((f) => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(f))) {
        const theme = await themeOf(zip, n);
        if (theme && slideThemes.has(theme)) out.push(`${n} shares ${theme} with a slide master and is listed where PowerPoint reads it`);
      }
    }
  }
  return out;
}

/**
 * The markup in a written deck that PowerPoint repairs and LibreOffice
 * accepts (see the header): an empty list for a deck PowerPoint opens as
 * written.
 */
export async function officeDefects(buf: Buffer | Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const out = await packageDefects(zip);
  for (const f of Object.keys(zip.files).sort()) {
    if (zip.files[f]!.dir) continue;
    if (SLIDE_LIKE.test(f)) out.push(...slideDefects(f, await zip.file(f)!.async("string")));
    else if (CHART_PART.test(f)) out.push(...chartDefects(f, await zip.file(f)!.async("string")));
  }
  return out;
}
