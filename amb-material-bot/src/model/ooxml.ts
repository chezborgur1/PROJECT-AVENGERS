// Excel conformance of the saved workbook package. The ISO schemas and
// LibreOffice accept things Microsoft Excel does not: Excel reports "We found
// a problem with some content" and offers to repair the file. ExcelJS 4.4
// writes some of them on every workbook:
//
// - <sheetPr> with <pageSetUpPr> before <outlinePr> on every tab that sets
//   both fit-to-page and outline properties. CT_SheetPr is a sequence
//   (tabColor, outlinePr, pageSetUpPr) and Excel reads it strictly.
// - editAs on <xdr:oneCellAnchor> (the Cover logo). The attribute belongs to
//   twoCellAnchor only.
// - font children with <color> before <sz>. Excel tolerates this, but the
//   Open XML SDK's validator does not, and we want it clean so it can guard
//   the other two.
//
// `conformPackage` rewrites those parts after ExcelJS saves the file.
// `packageIssues` is the independent check. verifyWorkbook runs it on every
// written file and the tests run it too, so a regression (here, in the chart
// injector or in the column breaks) fails before a user opens the file.

import type JSZip from "jszip";

/** CT_SheetPr, a sequence. */
const SHEET_PR = ["tabColor", "outlinePr", "pageSetUpPr"];
/** CT_Font in the order Excel writes it and the Open XML SDK validates it. */
const FONT = ["b", "i", "strike", "condense", "extend", "outline", "shadow", "u", "vertAlign", "sz", "color", "name", "family", "charset", "scheme"];
/** CT_Worksheet's children in schema order; only conditionalFormatting may repeat. */
const WORKSHEET = [
  "sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData", "sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios", "autoFilter",
  "sortState", "dataConsolidate", "customSheetViews", "mergeCells", "phoneticPr", "conditionalFormatting", "dataValidations", "hyperlinks", "printOptions",
  "pageMargins", "pageSetup", "headerFooter", "rowBreaks", "colBreaks", "customProperties", "cellWatches", "ignoredErrors", "smartTags", "drawing",
  "legacyDrawing", "legacyDrawingHF", "drawingHF", "picture", "oleObjects", "controls", "webPublishItems", "tableParts", "extLst",
];
/** Last column index (XFD) and last row index: the widest a row break and a column break may run. */
const MAX_COL_INDEX = 16383;
const MAX_ROW_INDEX = 1048575;

const ATTRS = String.raw`(?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*`;
const EMPTY_ELEMENT = new RegExp(String.raw`<([A-Za-z][\w.:-]*)${ATTRS}\/>`, "y");
const TAG = new RegExp(String.raw`<(\/?)([A-Za-z_][\w.:-]*)${ATTRS}(\/?)>`, "g");
const localName = (name: string) => name.slice(name.indexOf(":") + 1);

/** The children of an element whose content is empty elements only (sheetPr, font), or undefined for anything else. */
function emptyChildren(inner: string): { name: string; xml: string }[] | undefined {
  const out: { name: string; xml: string }[] = [];
  let i = 0;
  while (i < inner.length) {
    if (/\s/.test(inner[i]!)) {
      i++;
      continue;
    }
    EMPTY_ELEMENT.lastIndex = i;
    const m = EMPTY_ELEMENT.exec(inner);
    if (!m) return undefined;
    out.push({ name: m[1]!, xml: m[0] });
    i = EMPTY_ELEMENT.lastIndex;
  }
  return out;
}

/** `inner` with its empty-element children in `order`; unchanged when it holds anything the order does not name. */
function sortChildren(inner: string, order: string[]): string {
  const kids = emptyChildren(inner);
  if (!kids || kids.some((k) => !order.includes(k.name))) return inner;
  return kids
    .map((k, i) => ({ k, i, o: order.indexOf(k.name) }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.k.xml)
    .join("");
}

const outOfOrder = (names: string[], order: string[]) => names.some((n, i) => i > 0 && order.indexOf(n) < order.indexOf(names[i - 1]!));

/** A worksheet's <sheetPr> children in schema order. */
export function orderSheetPr(xml: string): string {
  return xml.replace(new RegExp(String.raw`<sheetPr(${ATTRS})>([\s\S]*?)<\/sheetPr>`), (_, attrs: string, inner: string) => `<sheetPr${attrs}>${sortChildren(inner, SHEET_PR)}</sheetPr>`);
}

/** Every <font> in styles.xml (cell fonts and conditional-format fonts) with its children in schema order. */
export function orderFontChildren(xml: string): string {
  return xml.replace(new RegExp(String.raw`<font(${ATTRS})>([\s\S]*?)<\/font>`, "g"), (_, attrs: string, inner: string) => `<font${attrs}>${sortChildren(inner, FONT)}</font>`);
}

/** A drawing's oneCellAnchors without the editAs attribute ExcelJS always writes on them. */
export function dropOneCellAnchorEditAs(xml: string): string {
  return xml.replace(/<xdr:oneCellAnchor\b([^>]*)>/g, (_, attrs: string) => `<xdr:oneCellAnchor${attrs.replace(/\s+editAs="[^"]*"/, "")}>`);
}

/** Rewrite the parts ExcelJS saves out of Excel's order. Run it last, after every other edit to the package. */
export async function conformPackage(zip: JSZip): Promise<void> {
  const edits: [RegExp, (xml: string) => string][] = [
    [/^xl\/worksheets\/sheet\d+\.xml$/, orderSheetPr],
    [/^xl\/drawings\/drawing\d+\.xml$/, dropOneCellAnchorEditAs],
    [/^xl\/styles\.xml$/, orderFontChildren],
  ];
  for (const part of Object.keys(zip.files)) {
    const edit = edits.find(([re]) => re.test(part))?.[1];
    if (!edit) continue;
    const xml = await zip.file(part)!.async("string");
    const out = edit(xml);
    if (out !== xml) zip.file(part, out);
  }
}

/** Names of the root element's children, in document order. */
function rootChildren(xml: string): string[] {
  const out: string[] = [];
  let depth = 0;
  for (const m of xml.matchAll(TAG)) {
    if (m[1]) {
      depth--;
      continue;
    }
    if (depth === 1) out.push(localName(m[2]!));
    if (!m[3]) depth++;
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * Excel repair triggers in a saved package that the ISO schemas and
 * LibreOffice let through, one line per problem. Empty for a file Excel opens
 * cleanly, as far as these rules reach.
 */
export async function packageIssues(zip: JSZip): Promise<string[]> {
  const issues: string[] = [];
  const text = async (part: string) => (zip.file(part) ? await zip.file(part)!.async("string") : undefined);
  const parts = Object.keys(zip.files).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  for (const part of parts.filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))) {
    const xml = (await text(part))!;
    const at = (issue: string) => issues.push(`${part}: ${issue}`);
    const children = rootChildren(xml.replace(/<sheetData>[\s\S]*<\/sheetData>/, "<sheetData/>"));
    const unknown = children.filter((c) => !WORKSHEET.includes(c));
    if (unknown.length) at(`unknown worksheet element ${unknown.join(", ")}`);
    else if (outOfOrder(children, WORKSHEET)) at(`worksheet elements out of schema order: ${children.join(", ")}`);
    for (const c of new Set(children)) if (c !== "conditionalFormatting" && children.filter((x) => x === c).length > 1) at(`<${c}> appears more than once`);

    const sheetPr = new RegExp(String.raw`<sheetPr${ATTRS}>([\s\S]*?)<\/sheetPr>`).exec(xml);
    const prKids = sheetPr ? emptyChildren(sheetPr[1]!)?.map((k) => k.name) : undefined;
    if (prKids && outOfOrder(prKids, SHEET_PR)) at(`<sheetPr> children out of order: ${prKids.join(", ")}`);

    for (const [tag, max] of [["rowBreaks", MAX_COL_INDEX], ["colBreaks", MAX_ROW_INDEX]] as const) {
      const block = new RegExp(String.raw`<${tag}(${ATTRS})>([\s\S]*?)<\/${tag}>`).exec(xml);
      if (!block) continue;
      const brks = [...block[2]!.matchAll(/<brk\b([^>]*)\/>/g)].map((b) => b[1]!);
      const count = /\bcount="(\d+)"/.exec(block[1]!)?.[1];
      if (count !== undefined && Number(count) !== brks.length) at(`<${tag}> count ${count} but ${brks.length} breaks`);
      for (const b of brks) {
        const bound = Number(/\bmax="(\d+)"/.exec(b)?.[1] ?? 0);
        if (bound > max) at(`<${tag}> break max="${bound}" beyond ${max}`);
      }
    }

    const drawing = /<drawing r:id="([^"]+)"/.exec(xml)?.[1];
    if (drawing) {
      const rels = await text(part.replace(/^xl\/worksheets\//, "xl/worksheets/_rels/") + ".rels");
      if (!rels || !new RegExp(`Id="${drawing}"`).test(rels)) at(`<drawing r:id="${drawing}"> has no relationship`);
    }

    for (const f of xml.matchAll(/<f(?:\s[^>]*)?>([^<]*)<\/f>/g)) {
      const formula = decode(f[1]!);
      const bare = formula.replace(/"(?:[^"]|"")*"/g, '""').replace(/'(?:[^']|'')*'/g, "''");
      if (formula.startsWith("=")) at(`formula stored with a leading "=": ${formula.slice(0, 60)}`);
      if (formula.length > 8192) at(`formula longer than 8,192 characters`);
      const odd = /[^\x20-\x7e]/.exec(bare);
      if (odd) at(`formula character U+${odd[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} outside a string: ${formula.slice(0, 60)}`);
    }
  }

  for (const part of parts.filter((p) => /^xl\/drawings\/drawing\d+\.xml$/.test(p))) {
    const xml = (await text(part))!;
    if (/<xdr:oneCellAnchor\b[^>]*\beditAs=/.test(xml)) issues.push(`${part}: editAs on a oneCellAnchor`);
    const ids = [...xml.matchAll(/<xdr:cNvPr\b[^>]*\bid="(\d+)"/g)].map((m) => m[1]!);
    if (new Set(ids).size !== ids.length) issues.push(`${part}: duplicate shape ids ${ids.join(", ")}`);
  }

  const styles = await text("xl/styles.xml");
  for (const m of styles?.matchAll(new RegExp(String.raw`<font${ATTRS}>([\s\S]*?)<\/font>`, "g")) ?? []) {
    const kids = emptyChildren(m[1]!)?.map((k) => k.name);
    if (kids && outOfOrder(kids, FONT)) issues.push(`xl/styles.xml: font children out of order: ${kids.join(", ")}`);
  }

  for (const part of parts.filter((p) => /^xl\/charts\/chart\d+\.xml$/.test(p))) {
    const xml = (await text(part))!;
    for (const bar of xml.matchAll(/<c:barChart>([\s\S]*?)<\/c:barChart>/g)) {
      if (/<c:grouping val="(?:stacked|percentStacked)"\/>/.test(bar[1]!) && /<c:dLblPos val="outEnd"\/>/.test(bar[1]!)) issues.push(`${part}: outside-end data labels on a stacked bar chart`);
    }
    const axes = [...xml.matchAll(/<c:(?:cat|val|date|ser)Ax><c:axId val="(\d+)"\/>[\s\S]*?<c:crossAx val="(\d+)"\/>/g)].map((m) => ({ id: m[1]!, cross: m[2]! }));
    const ids = new Set(axes.map((a) => a.id));
    for (const a of axes) if (!ids.has(a.cross)) issues.push(`${part}: axis ${a.id} crosses missing axis ${a.cross}`);
    for (const plot of xml.matchAll(/<c:(\w+Chart)>([\s\S]*?)<\/c:\1>/g)) {
      for (const ref of plot[2]!.matchAll(/<c:axId val="(\d+)"\/>/g)) if (!ids.has(ref[1]!)) issues.push(`${part}: ${plot[1]} uses missing axis ${ref[1]}`);
    }
  }
  return issues;
}
