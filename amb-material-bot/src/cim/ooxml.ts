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
// What pptxgenjs writes in the workbook behind each chart, which Excel opens
// when a user picks Edit Data (the Open XML SDK checks none of it):
// - the category cells are numbered as if every label were a shared string,
//   while blank labels are left out of the list: past the first blank (S6.4
//   labels quarter starts only) every label cell names the wrong string, and
//   the last ones a string that does not exist;
// - every gap and every zero is a numeric cell with an empty <v>;
// - a table part the sheet never lists, its ref ending in a stray apostrophe;
// - a stylesheet without cell formats.
// `normalizeChartWorkbook` rewrites the sheet from the chart's own caches, so
// Edit Data opens the figures the slide shows, and drops the table.
//
// A picture given no alt text takes its local file path as alt text in
// pptxgenjs; design.ts names the logo, and `officeDefects` reports a path.
//
// Left as pptxgenjs writes it: presentation.xml lists the notes master after
// the slides, out of schema order. The notes master shares the slide master's
// theme, which PowerPoint refuses once the list is where the schema puts it;
// out of order, PowerPoint passes over it and opens the deck.

import JSZip from "jszip";

const SLIDE_LIKE = /^ppt\/(?:slides|slideLayouts|slideMasters|notesSlides|notesMasters)\/[^/]+\.xml$/;
const CHART_PART = /^ppt\/charts\/chart\d+\.xml$/;

const CONTENT_TYPES = "[Content_Types].xml";
/** Extensions every package declares whether or not a part uses them. */
const CORE_EXTENSIONS = new Set(["xml", "rels"]);

const extensionOf = (f: string): string => (/\.([^./]+)$/.exec(f)?.[1] ?? "").toLowerCase();

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
// The workbooks behind the charts, which Excel opens on Edit Data
// ---------------------------------------------------------------------------

const XML_NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string): string =>
  s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g, (_, hex: string | undefined, dec: string | undefined, name: string | undefined) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : XML_NAMED[name!]!,
  );

const colNumber = (letters: string): number => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colLetters = (n: number): string => {
  let s = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
};
const cellOrder = (addr: string): [number, number] => {
  const m = /^([A-Z]+)(\d+)$/.exec(addr)!;
  return [Number(m[2]), colNumber(m[1]!)];
};

/** A value a chart caches for one cell: a label or series name (escaped as the chart part holds it) or a number. */
interface CellValue {
  kind: "s" | "n";
  text: string;
}

/** A series formula (c:f) and the values the chart caches for it, one map of point index to text per level. */
interface CachedRef {
  f: string;
  kind: "s" | "n";
  levels: Map<number, string>[];
}

function cachedRefs(chartXml: string): CachedRef[] {
  const out: CachedRef[] = [];
  for (const m of chartXml.matchAll(/<c:(strRef|numRef|multiLvlStrRef)>([\s\S]*?)<\/c:\1>/g)) {
    const f = /<c:f>([^<]*)<\/c:f>/.exec(m[2]!)?.[1];
    if (!f) continue;
    const cache = /<c:(strCache|numCache|multiLvlStrCache)>([\s\S]*?)<\/c:\1>/.exec(m[2]!)?.[2] ?? "";
    const lvls = m[1] === "multiLvlStrRef" ? [...cache.matchAll(/<c:lvl>([\s\S]*?)<\/c:lvl>/g)].map((l) => l[1]!) : [cache];
    const levels = lvls.map((l) => new Map([...l.matchAll(/<c:pt idx="(\d+)"[^>]*>\s*(?:<c:v>([^<]*)<\/c:v>|<c:v\s*\/>)\s*<\/c:pt>/g)].map((p) => [Number(p[1]), p[2] ?? ""] as const)));
    out.push({ f: decodeXml(f), kind: m[1] === "numRef" ? "n" : "s", levels });
  }
  return out;
}

/** The cells a series formula names, one list per cache level (level 0, the innermost, in the last column), or why it cannot be read. */
function refCells(f: string, levels: number): { sheet: string; cells: string[][] } | string {
  const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/.exec(f);
  if (!m) return `formula ${f} is not a cell range`;
  const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]!;
  const [c1, r1] = [colNumber(m[3]!), Number(m[4])];
  const [c2, r2] = m[5] ? [colNumber(m[5]), Number(m[6])] : [c1, r1];
  if (c2 < c1 || r2 < r1) return `formula ${f} runs backwards`;
  const down = (c: number) => Array.from({ length: r2 - r1 + 1 }, (_, i) => `${colLetters(c)}${r1 + i}`);
  if (levels === 1 && c1 === c2) return { sheet, cells: [down(c1)] };
  if (levels === 1 && r1 === r2) return { sheet, cells: [Array.from({ length: c2 - c1 + 1 }, (_, i) => `${colLetters(c1 + i)}${r1}`)] };
  if (levels > 1 && c2 - c1 + 1 === levels) return { sheet, cells: Array.from({ length: levels }, (_, k) => down(c2 - k)) };
  return `formula ${f} does not hold ${levels} level(s) of one row or column`;
}

/**
 * The cells behind a chart as the chart shows them, by sheet and address: a
 * label, a number, or null for a blank label or a gap. A cell two series name
 * with different values, or a formula this reader cannot place, is a problem.
 */
export function chartCells(chartXml: string): { sheets: Map<string, Map<string, CellValue | null>>; problems: string[] } {
  const sheets = new Map<string, Map<string, CellValue | null>>();
  const problems: string[] = [];
  for (const ref of cachedRefs(chartXml)) {
    const placed = refCells(ref.f, ref.levels.length);
    if (typeof placed === "string") {
      problems.push(placed);
      continue;
    }
    const cells = sheets.get(placed.sheet) ?? new Map<string, CellValue | null>();
    sheets.set(placed.sheet, cells);
    placed.cells.forEach((column, k) => {
      const pts = ref.levels[k]!;
      for (const idx of pts.keys()) if (idx >= column.length) problems.push(`${ref.f} caches point ${idx} past its ${column.length} cell(s)`);
      column.forEach((addr, idx) => {
        const text = pts.get(idx);
        const blank = text === undefined || (ref.kind === "n" ? text.trim() === "" : text === "");
        const value: CellValue | null = blank ? null : { kind: ref.kind, text };
        if (!cells.has(addr)) cells.set(addr, value);
        else if (JSON.stringify(cells.get(addr)) !== JSON.stringify(value)) problems.push(`${placed.sheet}!${addr} is ${JSON.stringify(cells.get(addr)?.text ?? "")} in one series and ${JSON.stringify(value?.text ?? "")} in another`);
      });
    });
  }
  return { sheets, problems };
}

/** A part's path from its relationships part's directory and a relationship target. */
function resolveTarget(dir: string, target: string): string {
  const path: string[] = target.startsWith("/") ? [] : dir.split("/").filter(Boolean);
  for (const seg of target.replace(/^\//, "").split("/")) {
    if (seg === "..") path.pop();
    else if (seg !== ".") path.push(seg);
  }
  return path.join("/");
}

const relsOf = (part: string): string => `${part.slice(0, part.lastIndexOf("/") + 1)}_rels/${part.slice(part.lastIndexOf("/") + 1)}.rels`;

/** A part's relationships: id, type (its last segment) and resolved target part. */
async function relationships(zip: JSZip, part: string): Promise<{ id: string; type: string; target: string }[]> {
  const rels = await zip.file(relsOf(part))?.async("string");
  if (!rels) return [];
  const dir = part.slice(0, part.lastIndexOf("/"));
  return [...rels.matchAll(/<Relationship\b[^>]*?\/?>/g)].flatMap((r) => {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(r[0])?.[1];
    const [id, type, target] = [attr("Id"), attr("Type"), attr("Target")];
    if (!id || !type || !target || /\bTargetMode="External"/.test(r[0])) return [];
    return [{ id, type: type.slice(type.lastIndexOf("/") + 1), target: resolveTarget(dir, decodeXml(target)) }];
  });
}

/** The worksheet part of every sheet in a workbook, by sheet name. */
async function worksheetParts(zip: JSZip): Promise<Map<string, string>> {
  const rels = await relationships(zip, "xl/workbook.xml");
  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const out = new Map<string, string>();
  for (const s of workbook.matchAll(/<sheet\b[^>]*?\/?>/g)) {
    const name = /\bname="([^"]*)"/.exec(s[0])?.[1];
    const rid = /\br:id="([^"]*)"/.exec(s[0])?.[1];
    const target = rels.find((r) => r.id === rid)?.target;
    if (name !== undefined && target) out.set(decodeXml(name), target);
  }
  return out;
}

/** The stylesheet Excel writes for a new workbook: one font, the two required fills, one border and one cell format. */
const MINIMAL_STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0"/></styleSheet>';

const hasCellFormats = (styles: string) => /<cellXfs\b[^>]*>\s*<xf\b/.test(styles);

/** The zip Office writes: parts only, [Content_Types].xml first, then the package relationships. */
async function packParts(files: Map<string, string | Uint8Array>): Promise<Buffer> {
  const names = [...files.keys()];
  const out = new JSZip();
  for (const f of [...names.filter((n) => n === CONTENT_TYPES), ...names.filter((n) => n === "_rels/.rels"), ...names.filter((n) => n !== CONTENT_TYPES && n !== "_rels/.rels")]) {
    out.file(f, files.get(f)!, { createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * The workbook behind a chart rewritten to hold what the chart shows, cell for
 * cell, from the chart's own caches. pptxgenjs 4.0.1 writes it wrong for Excel
 * (see the header): shared-string indexes shifted past every blank label (and
 * out of range), an empty <v> for every gap and every zero, a table part with
 * a malformed ref that the sheet never lists, and a stylesheet without cell
 * formats. The sheet's other settings, the theme and the properties stay.
 */
export async function normalizeChartWorkbook(xlsx: Uint8Array, chartXml: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsx);
  const { sheets, problems } = chartCells(chartXml);
  if (problems.length) throw new Error(`Chart data this pass cannot place in its workbook: ${problems.slice(0, 3).join("; ")}`);
  const files = new Map<string, string | Uint8Array>();
  for (const f of Object.keys(zip.files)) if (!zip.files[f]!.dir) files.set(f, await zip.file(f)!.async("uint8array"));
  const parts = await worksheetParts(zip);
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  let stringCells = 0;
  for (const [sheet, cells] of sheets) {
    const part = parts.get(sheet);
    if (!part || !files.has(part)) throw new Error(`The chart names sheet ${sheet}, which its workbook does not hold`);
    const addrs = [...cells.keys()].filter((a) => cells.get(a)).sort((a, b) => cellOrder(a)[0] - cellOrder(b)[0] || cellOrder(a)[1] - cellOrder(b)[1]);
    const rows = new Map<number, string[]>();
    for (const addr of addrs) {
      const v = cells.get(addr)!;
      let xml: string;
      if (v.kind === "n") xml = `<c r="${addr}"><v>${v.text.trim()}</v></c>`;
      else {
        if (!stringIndex.has(v.text)) stringIndex.set(v.text, strings.push(v.text) - 1);
        stringCells++;
        xml = `<c r="${addr}" t="s"><v>${stringIndex.get(v.text)}</v></c>`;
      }
      const row = cellOrder(addr)[0];
      rows.set(row, [...(rows.get(row) ?? []), xml]);
    }
    const sheetData = `<sheetData>${[...rows].map(([r, cs]) => `<row r="${r}">${cs.join("")}</row>`).join("")}</sheetData>`;
    const [rowsUsed, colsUsed] = [addrs.map((a) => cellOrder(a)[0]), addrs.map((a) => cellOrder(a)[1])];
    const dimension = addrs.length ? `<dimension ref="${colLetters(Math.min(...colsUsed))}${Math.min(...rowsUsed)}:${colLetters(Math.max(...colsUsed))}${Math.max(...rowsUsed)}"/>` : '<dimension ref="A1"/>';
    const xml = new TextDecoder().decode(files.get(part) as Uint8Array);
    const SHEET_DATA = /<sheetData\b[^>]*\/>|<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/;
    if (!SHEET_DATA.test(xml)) throw new Error(`${part} in a chart's workbook has no <sheetData>`);
    let out = xml.replace(SHEET_DATA, sheetData).replace(/<tableParts\b[^>]*\/>|<tableParts\b[^>]*>[\s\S]*?<\/tableParts>/, "");
    // CT_Worksheet: sheetPr, then dimension.
    if (/<dimension\b[^>]*\/>/.test(out)) out = out.replace(/<dimension\b[^>]*\/>/, dimension);
    else if (/<sheetPr\b/.test(out)) out = out.replace(/<sheetPr\b[^>]*\/>|<sheetPr\b[^>]*>[\s\S]*?<\/sheetPr>/, (pr) => `${pr}${dimension}`);
    else out = out.replace(/<worksheet\b[^>]*>/, (open) => `${open}${dimension}`);
    files.set(part, out);
  }
  // No table: the sheet lists none, and the one pptxgenjs writes has a malformed ref and a header the sheet does not hold.
  for (const f of [...files.keys()]) if (/^xl\/tables\//.test(f)) files.delete(f);
  for (const f of [...files.keys()].filter((n) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(n))) {
    const rels = new TextDecoder().decode(files.get(f) as Uint8Array).replace(/<Relationship\b[^>]*?Type="[^"]*\/table"[^>]*?\/>/g, "");
    if (/<Relationship\b/.test(rels)) files.set(f, rels);
    else files.delete(f);
  }
  const sst = strings.map((s) => `<si><t${/^\s|\s$/.test(decodeXml(s)) ? ' xml:space="preserve"' : ""}>${s}</t></si>`).join("");
  files.set("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${stringCells}" uniqueCount="${strings.length}">${sst}</sst>`);
  const styles = files.get("xl/styles.xml");
  if (!styles || !hasCellFormats(new TextDecoder().decode(styles as Uint8Array))) files.set("xl/styles.xml", MINIMAL_STYLES);
  const types = files.get(CONTENT_TYPES);
  if (types) files.set(CONTENT_TYPES, normalizeContentTypesXml(new TextDecoder().decode(types as Uint8Array), [...files.keys()]));
  return packParts(files);
}

/** Why Excel would repair the workbook behind a chart, or show data the chart does not: an empty list when it opens as the chart reads. */
export async function chartWorkbookDefects(label: string, chartXml: string, xlsx: Uint8Array): Promise<string[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(xlsx);
  } catch (e) {
    return [`${label}: not a zip (${(e as Error).message})`];
  }
  const out: string[] = [];
  const parts = Object.keys(zip.files).filter((f) => !zip.files[f]!.dir);
  if (parts.length !== Object.keys(zip.files).length) out.push(`${label}: the zip holds folder entries`);
  const types = (await zip.file(CONTENT_TYPES)?.async("string")) ?? "";
  const overrides = new Set([...types.matchAll(/<Override\b[^>]*?\bPartName="\/?([^"]+)"/g)].map((m) => m[1]!));
  const defaults = new Set([...types.matchAll(/<Default\b[^>]*?\bExtension="([^"]+)"/g)].map((m) => m[1]!.toLowerCase()));
  const missing = [...overrides].filter((p) => !parts.includes(p));
  if (missing.length) out.push(`${label}: content types for parts it does not hold (${missing.join(", ")})`);
  const untyped = parts.filter((p) => p !== CONTENT_TYPES && !overrides.has(p) && !defaults.has(extensionOf(p)));
  if (untyped.length) out.push(`${label}: parts without a content type (${untyped.join(", ")})`);

  const sstXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const sis = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => decodeXml([...(m[1] ?? "").matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")));
  const unique = /<sst\b[^>]*\buniqueCount="(\d+)"/.exec(sstXml)?.[1];
  if (unique !== undefined && Number(unique) !== sis.length) out.push(`${label}: shared strings declare ${unique} unique string(s) and hold ${sis.length}`);

  const sheets = await worksheetParts(zip);
  const values = new Map<string, Map<string, { kind: "s" | "n" | "?"; text: string }>>();
  /** Each table part a sheet lists, and that sheet. */
  const listedBy = new Map<string, string>();
  for (const [name, part] of sheets) {
    const xml = await zip.file(part)?.async("string");
    if (xml === undefined) {
      out.push(`${label}: sheet ${name} names ${part}, which it does not hold`);
      continue;
    }
    const cells = new Map<string, { kind: "s" | "n" | "?"; text: string }>();
    values.set(name, cells);
    const outOfRange: string[] = [];
    const empty: string[] = [];
    const notNumber: string[] = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const r = /\br="([A-Z]+\d+)"/.exec(c[1]!)?.[1] ?? "?";
      const t = /\bt="(\w+)"/.exec(c[1]!)?.[1] ?? "n";
      const vm = /<v>([^<]*)<\/v>|<v\s*\/>/.exec(c[2] ?? "");
      if (!vm) {
        if (t === "inlineStr") cells.set(r, { kind: "s", text: decodeXml([...(c[2] ?? "").matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join("")) });
        continue;
      }
      const v = (vm[1] ?? "").trim();
      if (v === "") {
        empty.push(r);
        continue;
      }
      if (t === "s") {
        const i = Number(v);
        if (!Number.isInteger(i) || i < 0 || i >= sis.length) outOfRange.push(`${r}→${v}`);
        else cells.set(r, { kind: "s", text: sis[i]! });
      } else if (t === "n") {
        if (!Number.isFinite(Number(v))) notNumber.push(`${r}="${v}"`);
        else cells.set(r, { kind: "n", text: v });
      } else cells.set(r, { kind: "?", text: decodeXml(v) });
    }
    const few = (xs: string[]) => `${xs.slice(0, 4).join(", ")}${xs.length > 4 ? ", ..." : ""}`;
    if (outOfRange.length) out.push(`${label}: ${outOfRange.length} cell(s) name a shared string past the ${sis.length} it holds (${few(outOfRange)})`);
    if (empty.length) out.push(`${label}: ${empty.length} cell(s) with an empty <v> (${few(empty)})`);
    if (notNumber.length) out.push(`${label}: ${notNumber.length} numeric cell(s) that are not numbers (${few(notNumber)})`);
    for (const rel of await relationships(zip, part)) {
      if (rel.type === "table" && new RegExp(`<tablePart\\b[^>]*r:id="${rel.id}"`).test(xml)) listedBy.set(rel.target, name);
    }
  }
  for (const table of parts.filter((p) => /^xl\/tables\/[^/]+\.xml$/.test(p))) {
    const t = await zip.file(table)!.async("string");
    const ref = /<table\b[^>]*?\bref="([^"]*)"/.exec(t)?.[1] ?? "";
    const m = /^([A-Z]{1,3})([1-9]\d*):([A-Z]{1,3})([1-9]\d*)$/.exec(ref);
    if (!m) out.push(`${label}: ${table} has the ref "${ref}", not a cell range`);
    const sheet = listedBy.get(table);
    if (sheet === undefined) out.push(`${label}: ${table} is a table no sheet lists`);
    else if (m) {
      const cells = values.get(sheet)!;
      const names = [...t.matchAll(/<tableColumn\b[^>]*?\bname="([^"]*)"/g)].map((x) => decodeXml(x[1]!));
      const bad = names.filter((n, i) => cells.get(`${colLetters(colNumber(m[1]!) + i)}${m[2]}`)?.text !== n);
      if (bad.length) out.push(`${label}: ${table}'s header row does not hold its column names (${bad.join(", ")})`);
    }
  }
  const styles = (await zip.file("xl/styles.xml")?.async("string")) ?? "";
  if (!hasCellFormats(styles)) out.push(`${label}: xl/styles.xml has no cell formats`);

  const { sheets: shown, problems } = chartCells(chartXml);
  for (const p of problems) out.push(`${label}: ${p}`);
  for (const [sheet, cells] of shown) {
    const held = values.get(sheet);
    if (!held) {
      out.push(`${label}: the chart reads sheet ${sheet}, which the workbook does not hold`);
      continue;
    }
    const differ: string[] = [];
    for (const [addr, v] of cells) {
      const h = held.get(addr);
      const same = v === null ? h === undefined || (h.kind !== "n" && h.text === "") : v.kind === "n" ? h?.kind === "n" && Number(h.text) === Number(v.text) : h !== undefined && h.kind !== "n" && h.text === decodeXml(v.text);
      if (!same) differ.push(`${addr} holds ${JSON.stringify(h?.text ?? "")} where the chart shows ${JSON.stringify(v === null ? "" : decodeXml(v.text))}`);
    }
    if (differ.length) out.push(`${label}: ${differ.length} cell(s) Edit Data would show differently from the chart (${differ.slice(0, 3).join("; ")}${differ.length > 3 ? "; ..." : ""})`);
  }
  return out;
}

/** Each chart part and the embedded workbook its data comes from. */
async function chartWorkbooks(zip: JSZip): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const f of Object.keys(zip.files).filter((n) => CHART_PART.test(n))) {
    const rel = (await relationships(zip, f)).find((r) => r.type === "package");
    if (rel) out.set(f, rel.target);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

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
  const files = new Map<string, string | Uint8Array>();
  for (const f of parts) {
    const fix = SLIDE_LIKE.test(f) ? normalizeSlideXml : CHART_PART.test(f) ? normalizeChartXml : f === CONTENT_TYPES ? (xml: string) => normalizeContentTypesXml(xml, parts) : undefined;
    files.set(f, fix ? fix(await zip.file(f)!.async("string")) : await zip.file(f)!.async("uint8array"));
  }
  // Each chart's workbook from the chart as normalized, so Edit Data opens the figures the slide shows.
  for (const [chartPart, workbook] of await chartWorkbooks(zip)) {
    const xlsx = files.get(workbook);
    if (xlsx instanceof Uint8Array) files.set(workbook, await normalizeChartWorkbook(xlsx, files.get(chartPart) as string));
  }
  return packParts(files);
}

// ---------------------------------------------------------------------------
// The proof
// ---------------------------------------------------------------------------

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
/** A local or network path, or a bare image file name. */
const FILE_PATH = /^(?:\/|~\/|[A-Za-z]:[\\/]|\\\\|file:)|\.(?:png|jpe?g|gif|bmp|svg|emf|wmf|tiff?)$/i;

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
  // pptxgenjs takes a picture's file path for its alt text when none is given, which a shared deck must not carry.
  for (const d of xml.matchAll(/<p:cNvPr\b[^>]*?\sdescr="([^"]*)"/g)) if (FILE_PATH.test(decodeXml(d[1]!))) out.push(`${part}: alt text is a file path "${decodeXml(d[1]!)}"`);
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

const themeOf = async (zip: JSZip, master: string): Promise<string | undefined> => (await relationships(zip, master)).find((r) => r.type === "theme")?.target;

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
  for (const [chartPart, workbook] of await chartWorkbooks(zip)) {
    const xlsx = await zip.file(workbook)?.async("uint8array");
    if (!xlsx) out.push(`${chartPart}: its data names ${workbook}, which the deck does not hold`);
    else out.push(...(await chartWorkbookDefects(`${workbook} (${chartPart.slice(chartPart.lastIndexOf("/") + 1)})`, await zip.file(chartPart)!.async("string"), xlsx)));
  }
  return out;
}
