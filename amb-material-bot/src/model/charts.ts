// Native Excel charts for the chart tabs (guide 5.12). ExcelJS has no chart
// API, so the saved package is post-processed: each chart tab gets one
// drawing part holding its chart frames, each frame a chart part with the
// house settings and caches filled from the engine, so the charts render
// before any recalculation and QA can compare the caches with the cells.

import type JSZip from "jszip";
import { CHART_COLOR } from "./chartData.ts";

export interface ChartSeriesRef {
  /** Absolute reference of the series name cell (the B cell of its row). */
  nameRef: string;
  name: string;
  /** Absolute reference of the values (one row of the chart-data block). */
  ref: string;
  values: number[];
  color: string;
}

/** One chart frame on a chart tab: what the writer lays out and the injector draws. */
export interface ChartPlacement {
  /** Catalogue ID; a ratio panel carries the exhibit's ID with " ratio". */
  id: string;
  /** Anchor rows, 1-based and inclusive; the frame spans columns B:M exactly. */
  fromRow: number;
  toRow: number;
  /** Frame height in points (the anchored rows), so the label bands keep a fixed size whatever the frame. */
  heightPt: number;
  kind: "bar" | "line";
  grouping: "clustered" | "stacked";
  /** Stacked bars parted by a white hairline (a mix); a diverging stack has none, so an empty month draws nothing on the axis. */
  separators?: boolean;
  categories: { ref: string; labels: string[] };
  series: ChartSeriesRef[];
  /** Data-label number format; undefined leaves the bars unlabelled. */
  labelFormat?: string;
  /** Value axis: deleted when every bar is labelled, else visible with at most four gridlines. */
  valueAxis: { visible: boolean; format: string; min0?: boolean; majorUnit?: number };
  /** False when a ratio panel below prints the months. */
  categoryAxis: boolean;
  legend: boolean;
}

const NS = {
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
};
const CHART_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const DRAWING_TYPE = "application/vnd.openxmlformats-officedocument.drawing+xml";
const EMU_PER_PT = 12700;
/**
 * Category labels sit at -1 degree rather than the guide's 0: LibreOffice
 * turns on text breaking for any horizontal axis label and splits "Jan-23"
 * over two lines when a month is narrower than its label; one degree reads
 * as level and keeps each label on one line.
 */
const CATEGORY_ROTATION = -60000;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const line = (hex: string, pt: number) => `<a:ln w="${Math.round(pt * EMU_PER_PT)}">${solid(hex)}</a:ln>`;
const noLine = "<a:ln><a:noFill/></a:ln>";
const text = (hex: string, rot?: number) =>
  `<c:txPr><a:bodyPr${rot === undefined ? "" : ` rot="${rot}" vert="horz" wrap="none"`}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800" b="0">${solid(hex)}<a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

function strCache(values: string[]): string {
  const pts = values.map((v, i) => (v === "" ? "" : `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`)).join("");
  return `<c:strCache><c:ptCount val="${values.length}"/>${pts}</c:strCache>`;
}

function numCache(values: number[], format: string): string {
  const pts = values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join("");
  return `<c:numCache><c:formatCode>${esc(format)}</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache>`;
}

function seriesXml(p: ChartPlacement, s: ChartSeriesRef, i: number): string {
  const tx = `<c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f>${strCache([s.name])}</c:strRef></c:tx>`;
  const cat = `<c:cat><c:strRef><c:f>${esc(p.categories.ref)}</c:f>${strCache(p.categories.labels)}</c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(s.ref)}</c:f>${numCache(s.values, p.valueAxis.format)}</c:numRef></c:val>`;
  if (p.kind === "line") {
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr><a:ln w="${Math.round(1.75 * EMU_PER_PT)}" cap="rnd">${solid(s.color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${cat}${val}<c:smooth val="0"/></c:ser>`;
  }
  // Stacked mix segments are parted by a white hairline; single and diverging bars have no outline, so a zero segment is invisible.
  const outline = p.grouping === "stacked" && p.separators !== false ? line(CHART_COLOR.separator, 0.5) : noLine;
  const labels = p.labelFormat
    ? `<c:dLbls><c:numFmt formatCode="${esc(p.labelFormat)}" sourceLinked="0"/><c:spPr><a:noFill/>${noLine}</c:spPr>${text(CHART_COLOR.label)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
    : "";
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr>${solid(s.color)}${outline}</c:spPr><c:invertIfNegative val="0"/>${labels}${cat}${val}</c:ser>`;
}

/** The chart part for one placement: the settings table of guide 5.12. */
export function chartXml(p: ChartPlacement): string {
  const catId = 5001;
  const valId = 5002;
  const series = p.series.map((s, i) => seriesXml(p, s, i)).join("");
  const plot =
    p.kind === "line"
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="${catId}"/><c:axId val="${valId}"/></c:lineChart>`
      : `<c:barChart><c:barDir val="col"/><c:grouping val="${p.grouping}"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/>${p.series.length > 1 ? '<c:overlap val="100"/>' : ""}<c:axId val="${catId}"/><c:axId val="${valId}"/></c:barChart>`;
  const catAx = `<c:catAx><c:axId val="${catId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${p.categoryAxis ? 0 : 1}"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr>${line(CHART_COLOR.axis, 0.5)}</c:spPr>${text(CHART_COLOR.axisLabel, CATEGORY_ROTATION)}<c:crossAx val="${valId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const va = p.valueAxis;
  const gridlines = va.visible ? `<c:majorGridlines><c:spPr>${line(CHART_COLOR.axis, 0.25)}</c:spPr></c:majorGridlines>` : "";
  const valAx = `<c:valAx><c:axId val="${valId}"/><c:scaling><c:orientation val="minMax"/>${va.min0 ? '<c:min val="0"/>' : ""}</c:scaling><c:delete val="${va.visible ? 0 : 1}"/><c:axPos val="l"/>${gridlines}<c:numFmt formatCode="${esc(va.format)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:noFill/>${noLine}</c:spPr>${text(CHART_COLOR.axisLabel)}<c:crossAx val="${catId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>${va.majorUnit ? `<c:majorUnit val="${va.majorUnit}"/>` : ""}</c:valAx>`;
  // Inner plot area at x 0.05, w 0.94 on every chart, so a bar panel and its ratio panel align month for month.
  // Fixed bands in points: the legend above, the month labels below (a short ratio panel otherwise clips them).
  const top = (p.legend ? 20 : 6) / p.heightPt;
  const bottom = 1 - (p.categoryAxis ? 18 : 4) / p.heightPt;
  const layout = `<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.05"/><c:y val="${top.toFixed(3)}"/><c:w val="0.94"/><c:h val="${(bottom - top).toFixed(3)}"/></c:manualLayout></c:layout>`;
  const legend = p.legend
    ? `<c:legend><c:legendPos val="t"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.04"/><c:y val="0.01"/><c:w val="${Math.min(0.9, 0.2 * p.series.length).toFixed(2)}"/><c:h val="${(16 / p.heightPt).toFixed(3)}"/></c:manualLayout></c:layout><c:overlay val="0"/>${text(CHART_COLOR.label)}</c:legend>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><c:roundedCorners val="0"/>` +
    `<c:chart><c:autoTitleDeleted val="1"/><c:plotArea>${layout}${plot}${catAx}${valAx}<c:spPr><a:noFill/>${noLine}</c:spPr></c:plotArea>${legend}<c:plotVisOnly val="0"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr>${solid("FFFFFF")}${noLine}</c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="800"><a:latin typeface="Arial"/><a:cs typeface="Arial"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>` +
    `</c:chartSpace>`
  );
}

function drawingXml(placements: ChartPlacement[]): string {
  const anchors = placements
    .map(
      (p, i) =>
        `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${p.fromRow - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>13</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${p.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(p.id)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
        `<a:graphic><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" xmlns:r="${NS.r}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}">${anchors}</xdr:wsDr>`;
}

function relsXml(rels: { id: string; type: string; target: string }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${NS.rel}">${rels.map((r) => `<Relationship Id="${r.id}" Type="${NS.r}/${r.type}" Target="${r.target}"/>`).join("")}</Relationships>`;
}

/** Highest N among parts named `<prefix>N.xml` in the package. */
function lastPart(zip: JSZip, prefix: string): number {
  let n = 0;
  zip.forEach((path) => {
    const m = new RegExp(`^${prefix}(\\d+)\\.xml$`).exec(path);
    if (m) n = Math.max(n, Number(m[1]));
  });
  return n;
}

/**
 * Add the chart parts for every sheet that has placements. `sheets` maps the
 * worksheet part (xl/worksheets/sheetN.xml) to its placements. The drawing
 * element goes where the schema puts it: after headerFooter and the page
 * breaks, before legacyDrawing, tableParts and extLst.
 */
export async function injectCharts(zip: JSZip, sheets: { part: string; placements: ChartPlacement[] }[]): Promise<void> {
  let drawingN = lastPart(zip, "xl/drawings/drawing");
  let chartN = lastPart(zip, "xl/charts/chart");
  let types = await zip.file("[Content_Types].xml")!.async("string");
  const override = (part: string, type: string) => `<Override PartName="/${part}" ContentType="${type}"/>`;
  for (const { part, placements } of sheets) {
    if (!placements.length) continue;
    drawingN++;
    const drawing = `xl/drawings/drawing${drawingN}.xml`;
    const chartRels: { id: string; type: string; target: string }[] = [];
    placements.forEach((p, i) => {
      chartN++;
      zip.file(`xl/charts/chart${chartN}.xml`, chartXml(p));
      types = types.replace("</Types>", `${override(`xl/charts/chart${chartN}.xml`, CHART_TYPE)}</Types>`);
      chartRels.push({ id: `rId${i + 1}`, type: "chart", target: `../charts/chart${chartN}.xml` });
    });
    zip.file(drawing, drawingXml(placements));
    zip.file(`xl/drawings/_rels/drawing${drawingN}.xml.rels`, relsXml(chartRels));
    types = types.replace("</Types>", `${override(drawing, DRAWING_TYPE)}</Types>`);

    const sheetRels = part.replace(/^xl\/worksheets\//, "xl/worksheets/_rels/") + ".rels";
    const existing = zip.file(sheetRels) ? await zip.file(sheetRels)!.async("string") : relsXml([]);
    const ids = [...existing.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]!);
    let n = ids.length + 1;
    while (ids.includes(`rId${n}`)) n++;
    const rid = `rId${n}`;
    zip.file(sheetRels, existing.replace("</Relationships>", `<Relationship Id="${rid}" Type="${NS.r}/drawing" Target="../drawings/drawing${drawingN}.xml"/></Relationships>`));

    const xml = await zip.file(part)!.async("string");
    const element = `<drawing r:id="${rid}"/>`;
    const before = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[ >]/.exec(xml);
    zip.file(part, before ? xml.slice(0, before.index) + element + xml.slice(before.index) : xml.replace("</worksheet>", `${element}</worksheet>`));
  }
  zip.file("[Content_Types].xml", types);
}

/** Chart parts as the package holds them, with the sheet each is drawn on, for the writer-side lint (C22). */
export async function readCharts(zip: JSZip): Promise<{ sheet: string; part: string; xml: string }[]> {
  const workbook = await zip.file("xl/workbook.xml")!.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const target = (rels: string, id: string) => new RegExp(`<Relationship [^>]*Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${id}"`).exec(rels)?.[1];
  const out: { sheet: string; part: string; xml: string }[] = [];
  for (const m of workbook.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const sheet = m[1]!.replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    const sheetPart = `xl/${target(wbRels, m[2]!)!.replace(/^\/?xl\//, "")}`;
    const relsPart = sheetPart.replace(/^xl\/worksheets\//, "xl/worksheets/_rels/") + ".rels";
    const sheetXml = await zip.file(sheetPart)!.async("string");
    const drawingId = /<drawing r:id="([^"]+)"/.exec(sheetXml)?.[1];
    if (!drawingId || !zip.file(relsPart)) continue;
    const drawingPart = `xl/${target(await zip.file(relsPart)!.async("string"), drawingId)!.replace(/^\.\.\//, "")}`;
    const drawingRels = drawingPart.replace(/^xl\/drawings\//, "xl/drawings/_rels/") + ".rels";
    if (!zip.file(drawingRels)) continue;
    for (const c of (await zip.file(drawingRels)!.async("string")).matchAll(/Target="\.\.\/charts\/(chart\d+\.xml)"/g)) {
      const part = `xl/charts/${c[1]}`;
      out.push({ sheet, part, xml: await zip.file(part)!.async("string") });
    }
  }
  return out;
}
