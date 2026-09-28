/* eslint-disable */
'use strict';
/**
 * AMB Advisory Services — CIM deck, Direction A "Bulge-bracket classic".
 * Sample: Project Ridgeline (fictional). Builds deck.pptx next to this file.
 *
 *   node build-deck.js            -> ./deck.pptx
 *
 * Self-contained: needs only pptxgenjs and ./assets/amb-logo-tight.png
 * (falls back to ../../../brand/amb-logo-maroon-2048.png if the tight crop is missing).
 */
const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');

// ---------------------------------------------------------------------------
// 1. Tokens (HOUSE_STYLE.md §1.2, §2.2, §2.6) — hex without '#'
// ---------------------------------------------------------------------------
const C = {
  maroon: '7B0000',
  ink: '2C2523',
  muted: '7A706D',
  rule: 'C2BAB8',
  section: 'FFE1E1',
  tint: 'F5EDEC',
  white: 'FFFFFF',
  chart2: 'DCC7C4',
  sand: 'C49A5B',
  slate: '5E5552',
};
const SERIF = 'Georgia';
const SANS = 'Arial';

// Grid (§2.1): 12 columns of 0.853 in, 0.20 in gutters, side margins 0.45 in
const M = 0.45;
const CONTENT_W = 12.433;
const COL_W = 0.853;
const GUT = 0.2;
const colX = (k) => M + (k - 1) * (COL_W + GUT);
const spanW = (k1, k2) => (k2 - k1 + 1) * COL_W + (k2 - k1) * GUT;
const RIGHT_EDGE = M + CONTENT_W; // 12.883

// Vertical bands
const Y_TITLE = 0.3;
const H_TITLE = 0.7;
const Y_TITLE_RULE = 1.06;
const Y_CONTENT = 1.22;
const Y_CONTENT_END = 6.52;
const Y_NOTES_END = 6.92;
const Y_FOOTER_RULE = 7.0;
const Y_FOOTER = 7.06;
const H_FOOTER = 0.24;

// Exhibit header geometry (§2.1)
const EXH_RULE_DY = 0.25;
const EXH_BODY_DY = 0.33;

// Logo
const LOGO_ASPECT = 1862 / 606; // tight crop of the 2048 master (ink box)
const LOGO_TIGHT = path.join(__dirname, 'assets', 'amb-logo-tight.png');
const LOGO_MASTER = path.join(__dirname, '..', '..', '..', 'brand', 'amb-logo-maroon-2048.png');
const LOGO = fs.existsSync(LOGO_TIGHT) ? LOGO_TIGHT : LOGO_MASTER;

// ---------------------------------------------------------------------------
// 2. Sample data (Project Ridgeline, fictional; every figure on every page is
//    computed from this block so pages cannot disagree — §4.8)
// ---------------------------------------------------------------------------
const FY = ['FY2023', 'FY2024', 'FY2025'];
const D = {
  revenue: [2406.8, 2718.6, 3040.8],
  grossMargin: [0.61, 0.615, 0.619],
  reportedEbitda: [157.0, 212.2, 316.4],
  ownerCompPaid: [180, 190, 200],
  replacementSalary: 95,
  adj: [
    { ref: 'N1', label: 'Owner personal vehicle', v: [16, 17, 18] },
    { ref: 'N2', label: 'Charitable contributions', v: [5, 6, 7.5] },
    { ref: 'N3', label: 'One-time legal settlement', v: [0, 24, 0] },
    { ref: 'N4', label: 'Family phones and personal meals', v: [0, 0, 6] },
  ],
  mix: { residential: 0.64, commercial: 0.27, maintenance: 0.09 },
  members: 1450,
  renewal: 0.82,
  largestCustomer: 0.04,
  employees: 24,
  technicians: 14,
  installers: 4,
  vans: 18,
  trucks: 2,
};
const sum = (a) => a.reduce((s, x) => s + x, 0);
D.cogs = D.revenue.map((r, i) => r * (1 - D.grossMargin[i]));
D.grossProfit = D.revenue.map((r, i) => r - D.cogs[i]);
D.otherOpex = D.grossProfit.map((g, i) => g - D.ownerCompPaid[i] - D.reportedEbitda[i]);
D.normTotal = [0, 1, 2].map((i) => sum(D.adj.map((a) => a.v[i])));
D.ownerAdj = D.ownerCompPaid.map((p) => p - D.replacementSalary); // [S1]
D.adjEbitda = [0, 1, 2].map((i) => D.reportedEbitda[i] + D.normTotal[i] + D.ownerAdj[i]);
D.sde = D.adjEbitda.map((a) => a + D.replacementSalary);
D.totalAdj = [0, 1, 2].map((i) => D.normTotal[i] + D.ownerAdj[i]);
D.cagr = Math.pow(D.revenue[2] / D.revenue[0], 1 / 2) - 1;
D.growth = (arr) => arr.map((v, i) => (i === 0 ? null : v / arr[i - 1] - 1));
D.margin = (arr) => arr.map((v, i) => v / D.revenue[i]);
D.lineRev = {
  residential: D.revenue[2] * D.mix.residential,
  commercial: D.revenue[2] * D.mix.commercial,
  maintenance: D.revenue[2] * D.mix.maintenance,
};

// Formatting (§2.5 figures)
const fmtK = (v, dollar) => {
  if (v === null || v === undefined) return '';
  const r = Math.round(v);
  if (r === 0) return '–';
  const s = Math.abs(r).toLocaleString('en-US');
  return r < 0 ? `(${dollar ? '$' : ''}${s})` : `${dollar ? '$' : ''}${s}`;
};
const fmtPct = (v, dp = 1) => {
  if (v === null || v === undefined) return '';
  const s = (Math.abs(v) * 100).toFixed(dp) + '%';
  return v < 0 ? `(${s})` : s;
};
const fmtM = (v) => `$${(v / 1000).toFixed(2)}M`; // $000s -> $M prose
const fmtKprose = (v) => `$${Math.round(v).toLocaleString('en-US')}K`;

// Sanity: the sample's stated totals must reproduce
const expect = (a, b, name) => {
  if (Math.abs(a - b) > 0.051) throw new Error(`Reconciliation failed: ${name} ${a} vs ${b}`);
};
[263.0, 354.2, 452.9].forEach((v, i) => expect(D.adjEbitda[i], v, `Adj. EBITDA ${FY[i]}`));
[358.0, 449.2, 547.9].forEach((v, i) => expect(D.sde[i], v, `SDE ${FY[i]}`));
expect(D.cagr, 0.124, 'CAGR');

// ---------------------------------------------------------------------------
// 3. Presentation
// ---------------------------------------------------------------------------
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pptx.author = 'AMB Advisory Services LLC';
pptx.company = 'AMB Advisory Services LLC';
pptx.title = 'Project Ridgeline: Confidential Information Memorandum';

// ---------------------------------------------------------------------------
// 4. Page furniture helpers
// ---------------------------------------------------------------------------
function hline(slide, x, y, w, color, pt) {
  slide.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: pt } });
}
function vline(slide, x, y, h, color, pt) {
  slide.addShape(pptx.ShapeType.line, { x, y, w: 0, h, line: { color, width: pt } });
}
// 0.5 pt hairline centred in the gutter after column k (L1/L3/L4 divider, §2.1)
function gutterRule(slide, k, y1 = Y_CONTENT, y2 = 6.42) {
  const x = colX(k) + COL_W + GUT / 2;
  vline(slide, x, y1, y2 - y1, C.rule, 0.5);
}

function newPage(section, pageNo, title) {
  const s = pptx.addSlide();
  s.background = { color: C.white };
  // Action title: Georgia Bold 20 pt ink, bottom-anchored in the title zone (§2.2, Direction A: ink, not maroon)
  s.addText(title, {
    x: M, y: Y_TITLE, w: CONTENT_W, h: H_TITLE, isTextBox: true, margin: 0,
    fontFace: SERIF, fontSize: 20, bold: true, color: C.ink, valign: 'bottom', align: 'left',
    lineSpacingMultiple: 1.0, fit: 'none',
  });
  // The one maroon rule under the title
  hline(s, M, Y_TITLE_RULE, CONTENT_W, C.maroon, 0.75);
  // Footer
  hline(s, M, Y_FOOTER_RULE, CONTENT_W, C.rule, 0.5);
  s.addText([
    { text: 'Project Ridgeline', options: { color: C.muted } },
    { text: '  |  ', options: { color: C.rule } },
    { text: section, options: { color: C.maroon } },
  ], { x: M, y: Y_FOOTER, w: 5.0, h: H_FOOTER, isTextBox: true, margin: 0, fontFace: SANS, fontSize: 7.5, valign: 'middle', align: 'left' });
  s.addText('Strictly private and confidential', {
    x: 4.0, y: Y_FOOTER, w: 5.333, h: H_FOOTER, isTextBox: true, margin: 0, fontFace: SANS, fontSize: 7.5, color: C.muted, valign: 'middle', align: 'center',
  });
  const logoH = 0.22;
  const logoW = logoH * LOGO_ASPECT;
  s.addImage({ path: LOGO, x: 12.3 - logoW, y: Y_FOOTER + (H_FOOTER - logoH) / 2, w: logoW, h: logoH });
  s.addText(String(pageNo), {
    x: 12.35, y: Y_FOOTER, w: RIGHT_EDGE - 12.35, h: H_FOOTER, isTextBox: true, margin: 0, fontFace: SANS, fontSize: 8, color: C.ink, valign: 'middle', align: 'right',
  });
  return s;
}

// Notes band: Source / Note / footnotes, bottom-anchored, 7 pt muted (§2.8, §4.6)
function notes(slide, lines, yTop = 6.46) {
  const runs = lines.map((t, i) => ({ text: t, options: { breakLine: i < lines.length - 1 } }));
  slide.addText(runs, {
    x: M, y: yTop, w: CONTENT_W, h: Y_NOTES_END - yTop, isTextBox: true, margin: 0,
    fontFace: SANS, fontSize: 7, color: C.muted, valign: 'bottom', align: 'left', lineSpacingMultiple: 1.0, fit: 'none',
  });
}

// Exhibit header: "Exhibit 3.1  Title  (units)" + 0.5 pt ink rule; optional right-aligned annotation
function exhibit(slide, x, y, w, num, title, units, annotation) {
  const runs = [
    { text: `Exhibit ${num}`, options: { bold: true, color: C.ink } },
    { text: '   ', options: {} },
    { text: title, options: { bold: true, color: C.ink } },
  ];
  if (units) runs.push({ text: `  ${units}`, options: { color: C.muted } });
  slide.addText(runs, {
    x, y, w: annotation ? w - 2.6 : w, h: EXH_RULE_DY, isTextBox: true, margin: 0,
    fontFace: SANS, fontSize: 9.5, valign: 'bottom', align: 'left', fit: 'none',
  });
  if (annotation) {
    slide.addText(annotation, {
      x: x + w - 2.6, y, w: 2.6, h: EXH_RULE_DY, isTextBox: true, margin: 0,
      fontFace: SANS, fontSize: 8, color: C.ink, valign: 'bottom', align: 'right', fit: 'none',
    });
  }
  hline(slide, x, y + EXH_RULE_DY + 0.02, w, C.ink, 0.5);
  return y + EXH_BODY_DY; // body top
}

// Commentary: bold lead-in bullets (§2.7). Square glyph U+25AA, hanging indent.
function bullets(slide, x, y, w, h, items, fontSize = 10) {
  const runs = [];
  items.forEach((it, i) => {
    runs.push({
      text: it.lead + ' ',
      options: { bold: true, bullet: { code: '25AA', indent: 11 }, paraSpaceAfter: 6 },
    });
    runs.push({ text: it.text, options: { breakLine: i < items.length - 1 } });
  });
  slide.addText(runs, {
    x, y, w, h, isTextBox: true, margin: 0, fontFace: SANS, fontSize, color: C.ink,
    valign: 'top', align: 'left', lineSpacingMultiple: 1.08, fit: 'none',
  });
}

// Body paragraphs with bold run-in heads
function paragraphs(slide, x, y, w, h, paras, fontSize = 10) {
  const runs = [];
  paras.forEach((p, i) => {
    if (p.lead) runs.push({ text: p.lead + '  ', options: { bold: true, paraSpaceAfter: 7 } });
    const segs = Array.isArray(p.text) ? p.text : [{ text: p.text }];
    segs.forEach((sg, j) => {
      const o = Object.assign({}, sg.options || {});
      if (j === segs.length - 1) o.breakLine = i < paras.length - 1;
      if (!p.lead && j === 0) o.paraSpaceAfter = 7;
      runs.push({ text: sg.text, options: o });
    });
  });
  slide.addText(runs, {
    x, y, w, h, isTextBox: true, margin: 0, fontFace: SANS, fontSize, color: C.ink,
    valign: 'top', align: 'left', lineSpacingMultiple: 1.08, fit: 'none',
  });
}

// ---------------------------------------------------------------------------
// 5. Table builders (§2.5). Border arrays are [top, right, bottom, left].
// ---------------------------------------------------------------------------
const NONE = { type: 'none' };
const noBorder = () => [NONE, NONE, NONE, NONE];
const bTop = (pt, color) => [{ type: 'solid', pt, color }, NONE, NONE, NONE];
const bTopBot = (pt, color) => [{ type: 'solid', pt, color }, NONE, { type: 'solid', pt, color }, NONE];
const bBot = (pt, color) => [NONE, NONE, { type: 'solid', pt, color }, NONE];
const CM = [0, 0.05, 0, 0.05]; // cell margin in inches (v4 trap)

/**
 * Numeric table.
 *  cols: [{w, gap?:true, align?}] ; first column is the label column.
 *  header: array of tiers; each tier = array of {text, span?} (gap columns get {gap:true})
 *  rows: [{kind:'section'|'line'|'sub'|'subtotal'|'total'|'ratio'|'memo'|'first', cells:[...]}]
 */
function numTable(slide, x, y, cols, header, rows, opts = {}) {
  const fs = opts.fontSize || 8.5;
  const hfs = opts.headerFontSize || 8;
  const rowH = opts.rowH || 0.195;
  const headH = opts.headH || 0.21;
  const colW = cols.map((c) => c.w);
  const tableRows = [];
  const rowHs = [];

  header.forEach((tier, ti) => {
    const cells = [];
    tier.forEach((h) => {
      if (h.gap) {
        cells.push({ text: '', options: { border: noBorder(), margin: [0, 0, 0, 0] } });
        return;
      }
      const cell = {
        text: h.text || '',
        options: {
          fill: { color: C.maroon }, color: C.white, bold: true, fontSize: hfs, fontFace: SANS,
          align: h.align || 'right', valign: 'middle', border: noBorder(), margin: CM,
        },
      };
      if (h.span && h.span > 1) cell.options.colspan = h.span;
      cells.push(cell);
    });
    tableRows.push(cells);
    rowHs.push(headH);
  });

  rows.forEach((r) => {
    const kind = r.kind || 'line';
    const cells = [];
    r.cells.forEach((val, ci) => {
      const col = cols[ci];
      if (col.gap) {
        cells.push({ text: '', options: { border: noBorder(), margin: [0, 0, 0, 0] } });
        return;
      }
      const isLabel = ci === 0;
      const o = {
        fontSize: fs, fontFace: SANS, color: C.ink, valign: 'middle', border: noBorder(), margin: CM,
        align: isLabel ? 'left' : col.align || 'right',
      };
      if (kind === 'section') {
        o.fill = { color: C.section };
        o.bold = true;
      } else if (kind === 'line' || kind === 'memo') {
        if (isLabel) o.margin = [0, 0.05, 0, 0.17];
      } else if (kind === 'sub') {
        if (isLabel) o.margin = [0, 0.05, 0, 0.29];
      } else if (kind === 'subtotal') {
        o.bold = true;
        o.border = bTop(0.5, C.ink);
      } else if (kind === 'total') {
        o.bold = true;
        o.border = bTopBot(0.75, C.maroon);
      } else if (kind === 'first') {
        o.bold = true;
      } else if (kind === 'ratio') {
        o.italic = true;
        if (isLabel) o.margin = [0, 0.05, 0, 0.17];
      }
      if (typeof val === 'object' && val !== null && val.text !== undefined) {
        Object.assign(o, val.options || {});
        cells.push({ text: val.text, options: o });
      } else {
        cells.push({ text: val === null || val === undefined ? '' : String(val), options: o });
      }
    });
    tableRows.push(cells);
    rowHs.push(kind === 'section' ? rowH : rowH);
  });

  slide.addTable(tableRows, {
    x, y, w: sum(colW), colW, rowH: rowHs, fontFace: SANS, fontSize: fs, color: C.ink,
    border: noBorder(), margin: CM, autoPage: false,
  });
  return y + sum(rowHs);
}

/** Text table: maroon header, 9 pt body, first column bold, hairline row separators. */
function textTable(slide, x, y, cols, header, rows, opts = {}) {
  const fs = opts.fontSize || 9;
  const colW = cols.map((c) => c.w);
  const tableRows = [];
  const rowHs = [];
  tableRows.push(header.map((h, i) => ({
    text: h, options: {
      fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, fontFace: SANS,
      align: cols[i].align || 'left', valign: 'middle', border: noBorder(), margin: CM,
    },
  })));
  rowHs.push(opts.headH || 0.21);
  rows.forEach((r, ri) => {
    const last = ri === rows.length - 1;
    const cells = r.cells.map((val, ci) => {
      const o = {
        fontSize: fs, fontFace: SANS, color: C.ink, valign: 'top', margin: [0.03, 0.05, 0.03, 0.05],
        align: cols[ci].align || 'left',
        bold: ci === 0 && !opts.noBoldFirst,
        border: r.kind === 'total' ? bTopBot(0.75, C.maroon) : last && !opts.ruleLast ? noBorder() : bBot(0.5, C.rule),
      };
      if (r.kind === 'total') o.bold = true;
      if (typeof val === 'object' && val !== null && val.text !== undefined) {
        Object.assign(o, val.options || {});
        return { text: val.text, options: o };
      }
      return { text: val === null || val === undefined ? '' : String(val), options: o };
    });
    tableRows.push(cells);
    rowHs.push(r.h || opts.rowH || 0.3);
  });
  slide.addTable(tableRows, {
    x, y, w: sum(colW), colW, rowH: rowHs, fontFace: SANS, fontSize: fs, color: C.ink,
    border: noBorder(), margin: CM, autoPage: false,
  });
  return y + sum(rowHs);
}

// ---------------------------------------------------------------------------
// 6. Chart defaults (§2.6)
// ---------------------------------------------------------------------------
function barChart(slide, x, y, w, h, series, extra = {}) {
  const base = {
    x, y, w, h,
    barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 60,
    chartColors: series.length === 1 ? [C.maroon] : [C.maroon, C.chart2, C.sand, C.slate],
    showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 8, dataLabelFontFace: SANS,
    dataLabelColor: C.ink, dataLabelFormatCode: '#,##0',
    valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
    valAxisMinVal: 0,
    catAxisLabelFontSize: 8, catAxisLabelFontFace: SANS, catAxisLabelColor: C.muted,
    catAxisLineShow: true, catAxisLineColor: C.rule, catAxisLineSize: 0.5,
    catAxisMajorTickMark: 'none', catAxisMinorTickMark: 'none',
    showLegend: series.length > 1, legendPos: 't', legendFontSize: 8, legendFontFace: SANS, legendColor: C.ink,
    showTitle: false,
    // No `border` key: pptxgenjs draws a line whenever a border object is present
    plotArea: { fill: { color: C.white } },
    chartArea: { fill: { color: C.white } },
  };
  slide.addChart(pptx.ChartType.bar, series, Object.assign(base, extra));
}

// ===========================================================================
// PAGE 1 — Cover (Direction A: white, logo top-left, codename in Georgia, one maroon rule)
// ===========================================================================
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  const logoW = 2.4;
  s.addImage({ path: LOGO, x: 0.7, y: 0.62, w: logoW, h: logoW / LOGO_ASPECT });

  s.addText('Project Ridgeline', {
    x: 0.7, y: 3.05, w: 11.0, h: 0.85, isTextBox: true, margin: 0,
    fontFace: SERIF, fontSize: 40, color: C.ink, valign: 'bottom', align: 'left', fit: 'none',
  });
  hline(s, 0.72, 4.05, 2.0, C.maroon, 1.0);
  s.addText('Confidential Information Memorandum', {
    x: 0.7, y: 4.18, w: 11.0, h: 0.34, isTextBox: true, margin: 0,
    fontFace: SANS, fontSize: 16, color: C.ink, valign: 'top', align: 'left',
  });
  s.addText('September 2026', {
    x: 0.7, y: 4.56, w: 11.0, h: 0.26, isTextBox: true, margin: 0,
    fontFace: SANS, fontSize: 11, color: C.muted, valign: 'top', align: 'left',
  });

  hline(s, M, Y_FOOTER_RULE, CONTENT_W, C.rule, 0.5);
  s.addText('Strictly private and confidential. Prepared by AMB Advisory Services LLC for recipients who have executed a confidentiality agreement with AMB Advisory.', {
    x: M, y: Y_FOOTER, w: 9.6, h: H_FOOTER, isTextBox: true, margin: 0,
    fontFace: SANS, fontSize: 7.5, color: C.muted, valign: 'middle', align: 'left',
  });
  s.addText('Tampa, Florida  ·  ambadvisoryservices.com', {
    x: 9.0, y: Y_FOOTER, w: RIGHT_EDGE - 9.0, h: H_FOOTER, isTextBox: true, margin: 0,
    fontFace: SANS, fontSize: 7.5, color: C.muted, valign: 'middle', align: 'right',
  });
}

// ===========================================================================
// PAGE 2 — Executive summary (L4: text cols 1–7, Quick Stats cols 8–12)
// ===========================================================================
{
  const gRev = D.growth(D.revenue);
  const s = newPage('Executive summary', 2,
    `Ridgeline reached ${fmtM(D.revenue[2])} of revenue in FY2025, a ${fmtPct(D.cagr)} three-year CAGR, with Adj. EBITDA of ${fmtKprose(D.adjEbitda[2])} (${fmtPct(D.adjEbitda[2] / D.revenue[2])} margin)`);

  const tx = colX(1), tw = spanW(1, 7);
  paragraphs(s, tx, Y_CONTENT, tw, 5.2, [
    {
      lead: 'Overview.',
      text: `Ridgeline Comfort Services LLC ("Ridgeline" or the "Company") is a residential and light-commercial HVAC and plumbing contractor based in Columbus, Ohio, serving Franklin, Delaware and Licking counties within about a 35-mile radius. Mark Delaney founded the Company in 2009 after 12 years as a lead technician at a regional HVAC contractor, and added plumbing service in 2019. Ridgeline employs ${D.employees} people, including ${D.technicians} service technicians and ${D.installers} installers, and runs ${D.vans} service vans and ${D.trucks} install trucks from an 8,000 sq ft leased shop. FY2025 revenue of ${fmtM(D.revenue[2])} was ${fmtPct(D.mix.residential, 0)} residential service and replacement, ${fmtPct(D.mix.commercial, 0)} commercial and ${fmtPct(D.mix.maintenance, 0)} maintenance agreements, which cover ${D.members.toLocaleString('en-US')} members renewing at about ${fmtPct(D.renewal, 0)} (1). The Company has been a Carrier Factory Authorized Dealer since 2015 and holds a 4.8 Google rating from more than 900 reviews (1). Ridgeline is an S-Corp wholly owned by Mr. Delaney, who is retiring.`,
    },
    {
      lead: 'Financial record.',
      text: `Revenue grew from ${fmtM(D.revenue[0])} in FY2023 to ${fmtM(D.revenue[2])} in FY2025, a ${fmtPct(D.cagr)} CAGR, while gross margin held between ${fmtPct(D.grossMargin[0])} and ${fmtPct(D.grossMargin[2])}. Reported EBITDA doubled from ${fmtKprose(D.reportedEbitda[0])} to ${fmtKprose(D.reportedEbitda[2])} over the same period because other operating expenses grew ${fmtPct(D.growth(D.otherOpex)[2])} in FY2025 against revenue growth of ${fmtPct(gRev[2])}. Adj. EBITDA of ${fmtKprose(D.adjEbitda[2])} in FY2025 (${fmtPct(D.adjEbitda[2] / D.revenue[2])} margin) reflects ${fmtKprose(D.ownerAdj[2])} of owner compensation above a $95,000 market salary and $${D.normTotal[2].toFixed(1)}K of personal and one-time expenses; SDE was ${fmtKprose(D.sde[2])} (2).`,
    },
    {
      lead: 'Growth levers identified by management (1).',
      text: `Maintenance agreements are offered on about 35% of service calls today, so the offer rate rather than price is the first lever. After-hours emergency plumbing is turned away after 7 pm. Two property managers have asked for quotes on additional buildings for preventive-maintenance contracts. The Company does little paid digital marketing; most leads come from referrals and Google reviews. None of these levers is included in the figures shown.`,
    },
    {
      lead: 'Transaction.',
      text: `The Seller prefers a sale of substantially all operating assets, free and clear of liens, and is open to a buyer keeping the Ridgeline name and all ${D.employees} employees. Mr. Delaney will remain for up to 12 months after closing to transfer commercial relationships, estimating and vendor terms. All inquiries should be directed to AMB Advisory; do not contact the Seller or its employees directly.`,
    },
    {
      lead: 'Basis of preparation.',
      text: `Financial figures are taken from QuickBooks Online statements for FY2023–FY2025 and are unaudited. Cost of revenue is derived from reported gross margin (page 3). Each adjustment to Reported EBITDA carries a tier code ([N] normalization, [S] owner compensation) and is supported line by line on page 4; no pro forma items are included.`,
    },
  ]);
  gutterRule(s, 7);

  // Exhibit 2.1 Quick Stats
  const qx = colX(8), qw = spanW(8, 12);
  let y = exhibit(s, qx, Y_CONTENT, qw, '2.1', 'Quick Stats', '($000s unless noted)');
  const cols = [{ w: 1.85 }, { w: 0.62 }, { w: 0.62 }, { w: qw - 1.85 - 1.24, align: 'left' }];
  y = numTable(s, qx, y, cols,
    [[{ text: 'Metric', align: 'left' }, { text: 'FY2024' }, { text: 'FY2025' }, { text: 'Basis', align: 'left' }]],
    [
      { kind: 'section', cells: ['Financial', '', '', ''] },
      { kind: 'line', cells: ['Revenue', fmtK(D.revenue[1], true), fmtK(D.revenue[2], true), `CAGR ${fmtPct(D.cagr)}, FY2023–25`] },
      { kind: 'ratio', cells: ['% growth', fmtPct(gRev[1]), fmtPct(gRev[2]), ''] },
      { kind: 'line', cells: ['Gross margin', fmtPct(D.grossMargin[1]), fmtPct(D.grossMargin[2]), '+40 bps y/y'] },
      { kind: 'line', cells: ['Reported EBITDA', fmtK(D.reportedEbitda[1]), fmtK(D.reportedEbitda[2]), `${fmtPct(D.reportedEbitda[2] / D.revenue[2])} margin`] },
      { kind: 'line', cells: ['Adj. EBITDA (2)', fmtK(D.adjEbitda[1]), fmtK(D.adjEbitda[2]), `${fmtPct(D.adjEbitda[2] / D.revenue[2])} margin; page 4`] },
      { kind: 'line', cells: ['SDE (2)', fmtK(D.sde[1]), fmtK(D.sde[2]), `Adj. EBITDA + $95K salary`] },
      { kind: 'section', cells: ['Operating (FY2025 or current)', '', '', ''] },
      { kind: 'line', cells: ['Mix: res. / comm. / maint.', '', '64/27/9%', 'Per management (1)'] },
      { kind: 'line', cells: ['Agreement members', '', D.members.toLocaleString('en-US'), `${fmtPct(D.renewal, 0)} renewal (1)`] },
      { kind: 'line', cells: ['Largest customer', '', fmtPct(D.largestCustomer, 0), 'Of revenue; commercial (1)'] },
      { kind: 'line', cells: ['Employees', '', String(D.employees), `${D.technicians} technicians, ${D.installers} installers`] },
      { kind: 'line', cells: ['Revenue per employee', '', fmtK(D.revenue[2] / D.employees, true), `${D.employees} full-time staff`] },
      { kind: 'line', cells: ['Vehicles', '', String(D.vans + D.trucks), `${D.vans} vans, ${D.trucks} install trucks`] },
      { kind: 'line', cells: ['Google rating', '', '4.8', '900+ reviews (1)'] },
    ]);

  // Exhibit 2.2 Transaction summary
  y = exhibit(s, qx, y + 0.16, qw, '2.2', 'Transaction summary', null);
  textTable(s, qx, y, [{ w: 1.45 }, { w: qw - 1.45 }], ['Term', 'Summary'], [
    { cells: ['What is offered', 'Substantially all operating assets of Ridgeline Comfort Services LLC, free and clear of liens'], h: 0.4 },
    { cells: ['Reason for sale', 'Owner retirement (age 61); exit targeted within 12 months'], h: 0.26 },
    { cells: ['Owner transition', 'Up to 12 months post-close; introduces commercial accounts'], h: 0.26 },
    { cells: ['Key employees', 'Operations manager (11 years) expected to stay; all 24 offered continuity'], h: 0.26 },
    { cells: ['Contact', 'AMB Advisory Services; no direct contact with the Seller or staff'], h: 0.26 },
  ], { rowH: 0.26 });

  notes(s, [
    'Source: Company financial statements (QuickBooks Online), FY2023–FY2025; management; AMB Advisory analysis.',
    'Note: Figures in USD thousands unless noted; fiscal year ends December 31. Financials are as provided by the Seller and have not been independently audited.',
    '(1) Per management; not independently verified.   (2) Adj. EBITDA and SDE are non-GAAP measures; see page 4 for the reconciliation to Reported EBITDA.',
  ]);
}

// ===========================================================================
// PAGE 3 — Financial summary (table cols 1–6; chart + commentary cols 7–12)
// ===========================================================================
{
  const gRev = D.growth(D.revenue), gCogs = D.growth(D.cogs), gGP = D.growth(D.grossProfit);
  const gOC = D.growth(D.ownerCompPaid), gOpex = D.growth(D.otherOpex), gRE = D.growth(D.reportedEbitda);
  const gAdj = D.growth(D.adjEbitda), gSDE = D.growth(D.sde);
  const mRE = D.margin(D.reportedEbitda), mAdj = D.margin(D.adjEbitda), mSDE = D.margin(D.sde);
  const adjShare = D.totalAdj.map((t, i) => t / D.adjEbitda[i]);
  const ocShare = D.margin(D.ownerCompPaid);

  const s = newPage('Financial performance', 3,
    `Revenue grew at a ${fmtPct(D.cagr)} CAGR to ${fmtM(D.revenue[2])} in FY2025 and Adj. EBITDA margin rose from ${fmtPct(mAdj[0])} to ${fmtPct(mAdj[2])} as expenses grew more slowly than sales`);

  // Exhibit 3.1 Summary income statement
  const tx = colX(1), tw = spanW(1, 6);
  let y = exhibit(s, tx, Y_CONTENT, tw, '3.1', 'Summary income statement', '($000s)');
  const cols = [{ w: 2.58 }, { w: 0.68 }, { w: 0.68 }, { w: 0.68 }, { w: 0.08, gap: true }, { w: 0.7 }, { w: 0.7 }];
  y = numTable(s, tx, y, cols, [
    [{ text: '', align: 'left' }, { text: 'Fiscal year ended Dec-31', span: 3, align: 'center' }, { gap: true }, { text: 'Growth y/y', span: 2, align: 'center' }],
    [{ text: 'Income statement', align: 'left' }, { text: 'FY2023' }, { text: 'FY2024' }, { text: 'FY2025' }, { gap: true }, { text: 'FY2024' }, { text: 'FY2025' }],
  ], [
    { kind: 'first', cells: ['Revenue', fmtK(D.revenue[0], true), fmtK(D.revenue[1], true), fmtK(D.revenue[2], true), '', fmtPct(gRev[1]), fmtPct(gRev[2])] },
    { kind: 'line', cells: ['Cost of revenue (1)', fmtK(-D.cogs[0]), fmtK(-D.cogs[1]), fmtK(-D.cogs[2]), '', fmtPct(gCogs[1]), fmtPct(gCogs[2])] },
    { kind: 'subtotal', cells: ['Gross profit', fmtK(D.grossProfit[0], true), fmtK(D.grossProfit[1], true), fmtK(D.grossProfit[2], true), '', fmtPct(gGP[1]), fmtPct(gGP[2])] },
    { kind: 'ratio', cells: ['% margin', fmtPct(D.grossMargin[0]), fmtPct(D.grossMargin[1]), fmtPct(D.grossMargin[2]), '', '', ''] },
    { kind: 'section', cells: ['Operating expenses', '', '', '', '', '', ''] },
    { kind: 'line', cells: ['Owner compensation, as paid', fmtK(-D.ownerCompPaid[0]), fmtK(-D.ownerCompPaid[1]), fmtK(-D.ownerCompPaid[2]), '', fmtPct(gOC[1]), fmtPct(gOC[2])] },
    { kind: 'line', cells: ['Other operating expenses (2)', fmtK(-D.otherOpex[0]), fmtK(-D.otherOpex[1]), fmtK(-D.otherOpex[2]), '', fmtPct(gOpex[1]), fmtPct(gOpex[2])] },
    { kind: 'total', cells: ['Reported EBITDA', fmtK(D.reportedEbitda[0], true), fmtK(D.reportedEbitda[1], true), fmtK(D.reportedEbitda[2], true), '', fmtPct(gRE[1]), fmtPct(gRE[2])] },
    { kind: 'ratio', cells: ['% margin', fmtPct(mRE[0]), fmtPct(mRE[1]), fmtPct(mRE[2]), '', '', ''] },
    { kind: 'section', cells: ['Adjustments (page 4)', '', '', '', '', '', ''] },
    { kind: 'line', cells: ['(+) Normalization adjustments [N1–N4]', fmtK(D.normTotal[0]), fmtK(D.normTotal[1]), fmtK(D.normTotal[2]), '', 'n.m.', 'n.m.'] },
    { kind: 'line', cells: ['(+) Owner comp. above market [S1]', fmtK(D.ownerAdj[0]), fmtK(D.ownerAdj[1]), fmtK(D.ownerAdj[2]), '', 'n.m.', 'n.m.'] },
    { kind: 'total', cells: ['Adj. EBITDA', fmtK(D.adjEbitda[0], true), fmtK(D.adjEbitda[1], true), fmtK(D.adjEbitda[2], true), '', fmtPct(gAdj[1]), fmtPct(gAdj[2])] },
    { kind: 'ratio', cells: ['% margin', fmtPct(mAdj[0]), fmtPct(mAdj[1]), fmtPct(mAdj[2]), '', '', ''] },
    { kind: 'line', cells: ['(+) Replacement compensation [S2]', fmtK(D.replacementSalary), fmtK(D.replacementSalary), fmtK(D.replacementSalary), '', '–', '–'] },
    { kind: 'total', cells: ["Seller's discretionary earnings (SDE)", fmtK(D.sde[0], true), fmtK(D.sde[1], true), fmtK(D.sde[2], true), '', fmtPct(gSDE[1]), fmtPct(gSDE[2])] },
    { kind: 'ratio', cells: ['% margin', fmtPct(mSDE[0]), fmtPct(mSDE[1]), fmtPct(mSDE[2]), '', '', ''] },
    { kind: 'section', cells: ['Memo', '', '', '', '', '', ''] },
    { kind: 'memo', cells: ['Total adjustments, % of Adj. EBITDA', fmtPct(adjShare[0]), fmtPct(adjShare[1]), fmtPct(adjShare[2]), '', '', ''] },
    { kind: 'memo', cells: ['Owner comp. as paid, % of revenue', fmtPct(ocShare[0]), fmtPct(ocShare[1]), fmtPct(ocShare[2]), '', '', ''] },
  ]);
  gutterRule(s, 6);

  // Exhibit 3.2 chart
  const cx = colX(7), cw = spanW(7, 12);
  const cy = exhibit(s, cx, Y_CONTENT, cw, '3.2', 'Revenue and Adj. EBITDA', '($000s)', `FY2023–FY2025 revenue CAGR: ${fmtPct(D.cagr)}`);
  barChart(s, cx, cy, cw, 4.12 - cy, [
    { name: 'Revenue', labels: FY, values: D.revenue.map((v) => Math.round(v)) },
    { name: 'Adj. EBITDA', labels: FY, values: D.adjEbitda.map((v) => Math.round(v)) },
  ]);
  // hairline between the chart block and the commentary
  hline(s, cx, 4.24, cw, C.rule, 0.5);

  bullets(s, cx, 4.34, cw, Y_CONTENT_END - 4.34 - 0.06, [
    { lead: `Revenue rose ${fmtKprose(D.revenue[2] - D.revenue[0])} over two years,`, text: `from ${fmtM(D.revenue[0])} to ${fmtM(D.revenue[2])}, with growth of ${fmtPct(gRev[1])} in FY2024 and ${fmtPct(gRev[2])} in FY2025 on the same three-county service area and, per management, without paid digital marketing (3).` },
    { lead: `Gross margin moved within a 90 bps band,`, text: `from ${fmtPct(D.grossMargin[0])} to ${fmtPct(D.grossMargin[2])}, because cost of revenue grew more slowly than revenue in both years (${fmtPct(gCogs[1])} and ${fmtPct(gCogs[2])} against ${fmtPct(gRev[1])} and ${fmtPct(gRev[2])}).` },
    { lead: `Reported EBITDA margin rose from ${fmtPct(mRE[0])} to ${fmtPct(mRE[2])}`, text: `because other operating expenses grew ${fmtPct(gOpex[2])} in FY2025 against ${fmtPct(gRev[2])} revenue growth. The owner's salary rose $10K a year to $200K and is reset to a $95K market salary on page 4.` },
    { lead: `Adjustments are ${fmtPct(adjShare[2], 0)} of FY2025 Adj. EBITDA,`, text: `down from ${fmtPct(adjShare[0], 0)} in FY2023: Reported EBITDA doubled while total adjustments rose ${fmtKprose(D.totalAdj[2] - D.totalAdj[0])}, from ${fmtKprose(D.totalAdj[0])} to $${D.totalAdj[2].toFixed(1)}K.` },
  ], 9.5);

  notes(s, [
    'Source: Company financial statements (QuickBooks Online), FY2023–FY2025; AMB Advisory analysis.',
    'Note: Figures in USD thousands unless noted; totals may not sum due to rounding. Financials are as provided by the Seller and have not been independently audited. Adj. EBITDA and SDE are non-GAAP measures.',
    `(1) Derived from reported gross margin of ${fmtPct(D.grossMargin[0])}, ${fmtPct(D.grossMargin[1])} and ${fmtPct(D.grossMargin[2])}.   (2) Excludes owner compensation, shown separately; includes the $${D.normTotal[2].toFixed(1)}K of FY2025 personal and one-time items adjusted on page 4.   (3) Per management; not independently verified.`,
  ]);
}

// ===========================================================================
// PAGE 4 — Adjusted EBITDA schedule (ladder cols 1–6; support table + commentary cols 7–12)
// ===========================================================================
{
  const mRE = D.margin(D.reportedEbitda), mAdj = D.margin(D.adjEbitda), mSDE = D.margin(D.sde);
  const adjShare = D.totalAdj.map((t, i) => t / D.adjEbitda[i]);
  const s = newPage('Adjusted EBITDA', 4,
    `FY2025 Adj. EBITDA of ${fmtKprose(D.adjEbitda[2])} adds back $${D.totalAdj[2].toFixed(1)}K, of which ${fmtKprose(D.ownerAdj[2])} resets $200K of owner pay to a $95K market salary`);

  const tx = colX(1), tw = spanW(1, 6);
  let y = exhibit(s, tx, Y_CONTENT, tw, '4.1', 'Adjusted EBITDA reconciliation', '($000s)');
  const cols = [{ w: tw - 0.45 - 3 * 0.78 }, { w: 0.45, align: 'center' }, { w: 0.78 }, { w: 0.78 }, { w: 0.78 }];
  const adjRows = D.adj.map((a) => ({ kind: 'line', cells: [`(+) ${a.label}`, `[${a.ref}]`, fmtK(a.v[0]), fmtK(a.v[1]), fmtK(a.v[2])] }));
  y = numTable(s, tx, y, cols, [
    [{ text: 'Reconciliation', align: 'left' }, { text: 'Ref', align: 'center' }, { text: 'FY2023' }, { text: 'FY2024' }, { text: 'FY2025' }],
  ], [
    { kind: 'total', cells: ['Reported EBITDA', '', fmtK(D.reportedEbitda[0], true), fmtK(D.reportedEbitda[1], true), fmtK(D.reportedEbitda[2], true)] },
    { kind: 'ratio', cells: ['% margin', '', fmtPct(mRE[0]), fmtPct(mRE[1]), fmtPct(mRE[2])] },
    { kind: 'section', cells: ['Normalization adjustments', '', '', '', ''] },
    ...adjRows,
    { kind: 'subtotal', cells: ['Total normalization adjustments', '', fmtK(D.normTotal[0]), fmtK(D.normTotal[1]), fmtK(D.normTotal[2])] },
    { kind: 'section', cells: ['Owner compensation', '', '', '', ''] },
    { kind: 'line', cells: ['Owner compensation, as paid (1)', '', fmtK(D.ownerCompPaid[0]), fmtK(D.ownerCompPaid[1]), fmtK(D.ownerCompPaid[2])] },
    { kind: 'line', cells: ['(–) Market replacement compensation (2)', '', fmtK(-D.replacementSalary), fmtK(-D.replacementSalary), fmtK(-D.replacementSalary)] },
    { kind: 'subtotal', cells: ['(+) Owner compensation above market', '[S1]', fmtK(D.ownerAdj[0]), fmtK(D.ownerAdj[1]), fmtK(D.ownerAdj[2])] },
    { kind: 'total', cells: ['Adj. EBITDA', '', fmtK(D.adjEbitda[0], true), fmtK(D.adjEbitda[1], true), fmtK(D.adjEbitda[2], true)] },
    { kind: 'ratio', cells: ['% margin', '', fmtPct(mAdj[0]), fmtPct(mAdj[1]), fmtPct(mAdj[2])] },
    { kind: 'line', cells: ['(+) Market replacement compensation', '[S2]', fmtK(D.replacementSalary), fmtK(D.replacementSalary), fmtK(D.replacementSalary)] },
    { kind: 'total', cells: ["Seller's discretionary earnings (SDE)", '', fmtK(D.sde[0], true), fmtK(D.sde[1], true), fmtK(D.sde[2], true)] },
    { kind: 'ratio', cells: ['% margin', '', fmtPct(mSDE[0]), fmtPct(mSDE[1]), fmtPct(mSDE[2])] },
    { kind: 'section', cells: ['Memo', '', '', '', ''] },
    { kind: 'memo', cells: ['Total adjustments to Reported EBITDA', '', fmtK(D.totalAdj[0]), fmtK(D.totalAdj[1]), fmtK(D.totalAdj[2])] },
    { kind: 'memo', cells: ['% of Adj. EBITDA', '', fmtPct(adjShare[0]), fmtPct(adjShare[1]), fmtPct(adjShare[2])] },
    { kind: 'memo', cells: ['Normalization adjustments, % of revenue', '', fmtPct(D.normTotal[0] / D.revenue[0]), fmtPct(D.normTotal[1] / D.revenue[1]), fmtPct(D.normTotal[2] / D.revenue[2])] },
  ]);
  gutterRule(s, 6);

  // Exhibit 4.2 Adjustment support (text table)
  const rx = colX(7), rw = spanW(7, 12);
  let ry = exhibit(s, rx, Y_CONTENT, rw, '4.2', 'Adjustment support', null);
  ry = textTable(s, rx, ry, [{ w: 0.42 }, { w: 1.35 }, { w: 2.35 }, { w: rw - 0.42 - 1.35 - 2.35 }],
    ['Ref', 'Adjustment', 'Basis', 'Evidence'], [
      { cells: ['[N1]', 'Owner personal vehicle', 'Removes the cost of a vehicle used personally by the owner and booked to auto expense; $18K in FY2025.', 'Auto expense GL detail; management representation (1)'], h: 0.44 },
      { cells: ['[N2]', 'Charitable contributions', 'Removes donations made at the owner’s discretion with no customer or marketing link; $7.5K in FY2025.', 'Contributions GL account; donation receipts'], h: 0.44 },
      { cells: ['[N3]', 'One-time legal settlement', 'Removes a $24K settlement of a single FY2024 matter; no related cost in FY2023 or FY2025.', 'Settlement agreement; legal invoices (1)'], h: 0.44 },
      { cells: ['[N4]', 'Family phones and personal meals', 'Removes family mobile lines and personal meals booked to telephone and meals expense in FY2025; $6K.', 'Carrier statements; expense review (1)'], h: 0.44 },
      { cells: ['[S1]', 'Owner compensation above market', 'Restates owner pay of $200K in FY2025 to a $95K market salary for a general manager; $105K.', 'Payroll register (owner W-2); market salary per management (2)'], h: 0.44 },
    ], { fontSize: 8.5 });

  hline(s, rx, ry + 0.12, rw, C.rule, 0.5);
  bullets(s, rx, ry + 0.22, rw, Y_CONTENT_END - (ry + 0.22), [
    { lead: `Owner compensation is the largest adjustment, at ${fmtKprose(D.ownerAdj[2])} in FY2025.`, text: `Mr. Delaney was paid $200K against a $95K market salary for a general manager (2); the $95K remains a cost in Adj. EBITDA and is added back only in SDE.` },
    { lead: `Personal and one-time items total $${D.normTotal[2].toFixed(1)}K in FY2025, ${fmtPct(D.normTotal[2] / D.revenue[2])} of revenue.`, text: `The FY2024 figure of $${D.normTotal[1].toFixed(1)}K includes a $24K legal settlement with no counterpart in FY2023 or FY2025.` },
    { lead: `Adjustments fell from ${fmtPct(adjShare[0], 0)} of Adj. EBITDA in FY2023 to ${fmtPct(adjShare[2], 0)} in FY2025`, text: `because Reported EBITDA doubled, from ${fmtKprose(D.reportedEbitda[0])} to ${fmtKprose(D.reportedEbitda[2])}, while the add-backs rose about $30K.` },
    { lead: 'No pro forma adjustments are included.', text: 'The figures do not assume any change in pricing, headcount or the maintenance-agreement program after closing.' },
  ], 9.5);

  notes(s, [
    'Source: Company financial statements (QuickBooks Online) and payroll register, FY2023–FY2025; AMB Advisory analysis.',
    'Note: Figures in USD thousands unless noted; totals may not sum due to rounding. Adj. EBITDA and SDE are non-GAAP measures. Financials are as provided by the Seller and have not been independently audited.',
    '(1) Per management; not independently verified.   (2) Market salary of $95,000 for a general manager, per management; not independently verified.',
  ]);
}

// ===========================================================================
// PAGE 5 — Revenue mix and customers (chart cols 1–6, commentary cols 7–12, segment table full width)
// ===========================================================================
{
  const L = D.lineRev;
  const perMember = (L.maintenance * 1000) / D.members;
  const s = newPage('Customers', 5,
    `No customer exceeds ${fmtPct(D.largestCustomer, 0)} of revenue: residential work is ${fmtPct(D.mix.residential, 0)} of FY2025 sales and ${D.members.toLocaleString('en-US')} maintenance members renew at about ${fmtPct(D.renewal, 0)}`);

  const cx = colX(1), cw = spanW(1, 6);
  const cy = exhibit(s, cx, Y_CONTENT, cw, '5.1', 'Revenue by service line, FY2025', '($000s)', `Total: ${fmtK(D.revenue[2], true)}`);
  const chartBottom = 3.72;
  barChart(s, cx, cy, cw, chartBottom - cy, [
    { name: 'FY2025 revenue', labels: ['Residential service & replacement', 'Commercial', 'Maintenance agreements'], values: [Math.round(L.residential), Math.round(L.commercial), Math.round(L.maintenance)] },
  ], { barDir: 'bar', catAxisOrientation: 'maxMin', barGapWidthPct: 60, valAxisMaxVal: 2400 });
  gutterRule(s, 6, Y_CONTENT, chartBottom + 0.1);

  const rx = colX(7), rw = spanW(7, 12);
  bullets(s, rx, Y_CONTENT + 0.02, rw, chartBottom - Y_CONTENT + 0.1, [
    { lead: `Residential service and replacement generated ${fmtM(L.residential)}, ${fmtPct(D.mix.residential, 0)} of FY2025 revenue,`, text: `from homeowners across Franklin, Delaware and Licking counties. Leads come mainly from referrals and Google reviews (4.8 rating, 900+ reviews) rather than paid marketing (1).` },
    { lead: `Commercial revenue of ${fmtKprose(L.commercial)} (${fmtPct(D.mix.commercial, 0)}) comes from property managers, small office buildings and four restaurant groups.`, text: `The largest customer, C-001, is about ${fmtPct(D.largestCustomer, 0)} of revenue (1). Two property managers have asked for quotes on additional buildings.` },
    { lead: `Maintenance agreements produced ${fmtKprose(L.maintenance)} (${fmtPct(D.mix.maintenance, 0)}) from ${D.members.toLocaleString('en-US')} members,`, text: `about $${Math.round(perMember)} per member a year, for two tune-ups, priority scheduling and a 15% repair discount. Renewal is about ${fmtPct(D.renewal, 0)} (1), so roughly ${Math.round(D.members * (1 - D.renewal) / 10) * 10} members are replaced each year.` },
    { lead: 'Agreements are offered on about 35% of service calls (1),', text: 'so the program’s lever is the offer rate rather than price; technicians already earn a spiff on each agreement sold.' },
  ], 9.5);

  hline(s, M, 3.92, CONTENT_W, C.rule, 0.5);
  let y = exhibit(s, M, 4.02, CONTENT_W, '5.2', 'Customer base and concentration by segment, FY2025', '($000s)');
  textTable(s, M, y, [{ w: 1.75 }, { w: 2.75 }, { w: 0.85, align: 'right' }, { w: 0.7, align: 'right' }, { w: 1.55 }, { w: 2.35 }, { w: CONTENT_W - 1.75 - 2.75 - 0.85 - 0.7 - 1.55 - 2.35 }],
    ['Segment', 'Who buys', 'Revenue', '% total', 'Largest customer', 'Recurring element', 'Lever identified by management (1)'], [
      { cells: ['Residential service and replacement', 'Homeowners in Franklin, Delaware and Licking counties (about a 35-mile radius from Columbus); plumbing service since 2019', fmtK(L.residential, true), fmtPct(D.mix.residential, 0), 'Not material (1)', 'Repeat service calls; agreement offered on about 35% of calls; Carrier Factory Authorized Dealer since 2015', 'Offer agreements on more calls; add after-hours plumbing (calls turned away after 7 pm); paid digital marketing not used today'], h: 0.5 },
      { cells: ['Commercial', 'Property managers, small office buildings and four restaurant groups; relationships held by the owner', fmtK(L.commercial, true), fmtPct(D.mix.commercial, 0), `About ${fmtPct(D.largestCustomer, 0)} (C-001, property manager) (1)`, 'Service and replacement work; preventive-maintenance contracts on managed buildings', 'Quotes requested by two property managers for additional buildings; owner introduces accounts during a 12-month transition'], h: 0.5 },
      { cells: ['Maintenance agreements', `${D.members.toLocaleString('en-US')} members: two tune-ups a year, priority scheduling and a 15% repair discount, about $${Math.round(perMember)} per member`, fmtK(L.maintenance, true), fmtPct(D.mix.maintenance, 0), 'n.m.', `Annual agreements; about ${fmtPct(D.renewal, 0)} renewal (1), so roughly ${Math.round(D.members * (1 - D.renewal) / 10) * 10} members are replaced each year`, 'Raise the 35% offer rate; technicians already earn a spiff on each sale'], h: 0.5 },
      { kind: 'total', cells: ['Total', '', fmtK(D.revenue[2], true), '100%', '', '', ''], h: 0.2 },
    ], { fontSize: 8.5 });

  notes(s, [
    'Source: Company financial statements (QuickBooks Online), FY2025; ServiceTitan membership data; management; AMB Advisory analysis.',
    `Note: Revenue by service line applies management’s FY2025 mix (${fmtPct(D.mix.residential, 0)} / ${fmtPct(D.mix.commercial, 0)} / ${fmtPct(D.mix.maintenance, 0)}) to reported revenue of $${D.revenue[2].toLocaleString('en-US', { minimumFractionDigits: 1 })}K. Customers are coded (C-001) and not named.`,
    '(1) Per management; not independently verified.',
  ]);
}

// ===========================================================================
// PAGE 6 — Operations and people (L4: text cols 1–7; two tables cols 8–12)
// ===========================================================================
{
  const fieldStaff = D.technicians + D.installers;
  const revPerEmp = D.revenue[2] / D.employees;
  const revPerField = D.revenue[2] / fieldStaff;
  const revPerVehicle = D.revenue[2] / (D.vans + D.trucks);
  const s = newPage('Operations and people', 6,
    `An operations manager of 11 years runs dispatch for ${fieldStaff} field staff and ${D.vans + D.trucks} vehicles; the owner’s 45-hour week is estimating, commercial accounts and hiring`);

  const tx = colX(1), tw = spanW(1, 7);
  paragraphs(s, tx, Y_CONTENT, tw, 3.55, [
    { lead: 'Team.', text: `Ridgeline employs ${D.employees} people: ${D.technicians} service technicians, ${D.installers} install crew, 1 operations manager, 3 customer service and dispatch staff, 1 bookkeeper and the owner. Technicians are paid hourly plus spiff commissions on maintenance agreements sold, and no employees are unionized. Revenue per employee was ${fmtKprose(revPerEmp)} in FY2025 and revenue per field technician (${fieldStaff}) was ${fmtKprose(revPerField)}.` },
    { lead: 'Management.', text: `Lisa Tran, operations manager, has been with the Company 11 years and runs dispatch, scheduling and day-to-day operations; she is expected to stay after closing (1). Mark Delaney, the owner, works about 45 hours a week on estimating large replacements, commercial relationships, vendor terms and hiring (1). He will stay up to 12 months after closing and introduce commercial accounts; the $95K cost of a general manager to assume his role is already deducted in Adj. EBITDA (page 4).` },
    { lead: 'Facility and fleet.', text: `The Company operates from an 8,000 sq ft shop and office on Maple Avenue in Columbus, leased from an unrelated landlord through 2029 with a five-year renewal option. The fleet of ${D.vans} service vans and ${D.trucks} install trucks is owned and financed with vehicle loans; each vehicle supported about ${fmtKprose(revPerVehicle)} of FY2025 revenue.` },
    { lead: 'Systems and suppliers.', text: 'Dispatch, invoicing and memberships run on ServiceTitan; accounting runs on QuickBooks Online. Parts come from Ferguson and Johnstone Supply, and Carrier equipment through the local distributor. The Company has been a Carrier Factory Authorized Dealer since 2015.' },
    { lead: 'Reputation and lead flow.', text: 'Ridgeline holds a 4.8 Google rating from more than 900 reviews (1). Most leads come from referrals and reviews; the Company does little paid digital marketing today.' },
  ], 9.5);

  // Exhibit 6.3 Owner responsibilities and transition (S5.4) fills the lower-left
  let ly = exhibit(s, tx, 4.56, tw, '6.3', 'Owner responsibilities and transition', null);
  textTable(s, tx, ly, [{ w: 1.75 }, { w: 2.7 }, { w: tw - 1.75 - 2.7 }],
    ['Owner responsibility today (1)', 'Who assumes it after closing', 'Transition support offered'], [
      { cells: ['Estimating large replacements', 'General manager ($95K salary deducted in Adj. EBITDA; page 4)', 'Owner available up to 12 months after closing'], h: 0.33 },
      { cells: ['Commercial relationships', 'General manager; operations manager already schedules these accounts', 'Owner introduces commercial accounts, including the four restaurant groups'], h: 0.33 },
      { cells: ['Vendor terms', 'General manager; Ferguson, Johnstone Supply and Carrier distributor accounts', 'Owner introduces supplier contacts during the transition'], h: 0.33 },
      { cells: ['Hiring', 'General manager with the operations manager (11 years)', 'Owner available for hiring decisions; all 24 employees offered continuity'], h: 0.33 },
    ], { fontSize: 8.5 });
  gutterRule(s, 7);

  const rx = colX(8), rw = spanW(8, 12);
  let y = exhibit(s, rx, Y_CONTENT, rw, '6.1', 'Organization and tenure', '(#)');
  y = textTable(s, rx, y, [{ w: 1.85 }, { w: 0.7, align: 'right' }, { w: rw - 1.85 - 0.7 }], ['Role', 'Headcount', 'Notes'], [
    { cells: ['Owner (Mark Delaney)', '1', 'Founder, 2009; retiring; up to 12 months’ transition'], h: 0.24 },
    { cells: ['Operations manager (Lisa Tran)', '1', '11 years; dispatch and scheduling; expected to stay (1)'], h: 0.24 },
    { cells: ['Service technicians', String(D.technicians), 'Hourly plus agreement spiffs; not unionized'], h: 0.24 },
    { cells: ['Install crew', String(D.installers), 'Replacements and new installations'], h: 0.24 },
    { cells: ['CSRs and dispatch', '3', 'ServiceTitan call board and scheduling'], h: 0.24 },
    { cells: ['Bookkeeper', '1', 'QuickBooks Online'], h: 0.24 },
    { kind: 'total', cells: ['Total employees', String(D.employees), `${fieldStaff} in the field (${fmtPct(fieldStaff / D.employees, 0)})`], h: 0.24 },
  ], { fontSize: 8.5 });

  y = exhibit(s, rx, y + 0.18, rw, '6.2', 'Operating assets and systems', null);
  textTable(s, rx, y, [{ w: 1.2 }, { w: rw - 1.2 }], ['Item', 'Detail'], [
    { cells: ['Facility', '8,000 sq ft shop and office, Maple Avenue, Columbus; leased through 2029 with a five-year renewal option; landlord unrelated to the owner'], h: 0.4 },
    { cells: ['Fleet', `${D.vans} service vans and ${D.trucks} install trucks; owned, financed with vehicle loans`], h: 0.26 },
    { cells: ['Systems', 'ServiceTitan (dispatch, invoicing, memberships); QuickBooks Online (accounting)'], h: 0.26 },
    { cells: ['Suppliers', 'Ferguson; Johnstone Supply; Carrier equipment through the local distributor'], h: 0.26 },
    { cells: ['Certifications', 'Carrier Factory Authorized Dealer since 2015'], h: 0.24 },
    { cells: ['Service area', 'Franklin, Delaware and Licking counties, Ohio; about a 35-mile radius'], h: 0.24 },
  ], { fontSize: 8.5 });

  notes(s, [
    'Source: Management; Company payroll register as of Sep-26; AMB Advisory analysis.',
    'Note: Employees are named only for management; other staff are shown by role. Revenue per employee and per vehicle use FY2025 revenue and current counts.',
    '(1) Per management; not independently verified.',
  ]);
}

// ===========================================================================
// PAGE 7 — Considerations for buyers (L6 text table, full width)
// ===========================================================================
{
  const adjShare = D.totalAdj[2] / D.adjEbitda[2];
  const s = newPage('Considerations for buyers', 7,
    `Buyers will test owner dependence, $${D.totalAdj[2].toFixed(1)}K of FY2025 add-backs and a ${fmtPct(D.mix.maintenance, 0)} recurring share; the record on each is set out below`);

  let y = exhibit(s, M, Y_CONTENT, CONTENT_W, '7.1', 'Considerations for buyers', null);
  y = textTable(s, M, y, [{ w: 1.9 }, { w: 5.2 }, { w: CONTENT_W - 1.9 - 5.2 }],
    ['Consideration', 'What the data shows', 'How it is addressed'], [
      { cells: ['Owner involvement', `The owner works about 45 hours a week on estimating large replacements, commercial relationships, vendor terms and hiring (1). Commercial customers, ${fmtPct(D.mix.commercial, 0)} of revenue, deal with him directly.`, 'The operations manager (11 years) runs dispatch and scheduling and is expected to stay. The owner offers up to 12 months of transition and will introduce commercial accounts. A $95K general-manager salary is already deducted in Adj. EBITDA (page 4).'], h: 0.62 },
      { cells: ['Size of adjustments', `FY2025 Adj. EBITDA of ${fmtKprose(D.adjEbitda[2])} includes $${D.totalAdj[2].toFixed(1)}K of adjustments (${fmtPct(adjShare, 0)} of the total): ${fmtKprose(D.ownerAdj[2])} of owner pay above market and $${D.normTotal[2].toFixed(1)}K of personal and one-time items.`, `Every adjustment carries a tier code and a GL reference (page 4). Owner pay is on the payroll register; personal items are identified line by line and total ${fmtPct(D.normTotal[2] / D.revenue[2])} of revenue. No pro forma items are included.`], h: 0.62 },
      { cells: ['Recurring revenue share', `Maintenance agreements are ${fmtPct(D.mix.maintenance, 0)} of revenue (${fmtKprose(D.lineRev.maintenance)}) from ${D.members.toLocaleString('en-US')} members; agreements are offered on about 35% of service calls (1).`, `Renewal is about ${fmtPct(D.renewal, 0)} (1). Members receive two tune-ups a year, priority scheduling and a 15% repair discount, and technicians earn a spiff on each sale; raising the offer rate is the lever management identifies.`], h: 0.62 },
      { cells: ['Customer concentration', `The largest customer is about ${fmtPct(D.largestCustomer, 0)} of revenue (1). Commercial revenue of ${fmtKprose(D.lineRev.commercial)} comes from property managers, small office buildings and four restaurant groups.`, `No customer exceeds ${fmtPct(D.largestCustomer, 0)}. Residential work, ${fmtPct(D.mix.residential, 0)} of revenue, is spread across households in three counties, and 900+ Google reviews (4.8) support lead flow without paid marketing (1).`], h: 0.62 },
      { cells: ['Fleet and facility', `${D.vans + D.trucks} vehicles are owned and financed with vehicle loans; the 8,000 sq ft shop is leased through 2029 from a landlord unrelated to the owner.`, 'The Seller prefers an asset sale in which vehicles transfer free and clear of liens, with vehicle loans settled at closing. The lease carries a five-year renewal option to 2034 (1).'], h: 0.5 },
      { cells: ['Financial reporting', 'Financials are prepared in QuickBooks Online by an in-house bookkeeper and have not been audited. Cost of revenue on page 3 is derived from reported gross margin.', 'ServiceTitan holds job, membership and invoicing detail that can be tied to QuickBooks revenue. Federal tax returns (Form 1120-S) and bank statements will be provided for reconciliation.'], h: 0.5 },
    ], { fontSize: 9 });

  paragraphs(s, M, y + 0.14, CONTENT_W, Y_CONTENT_END - (y + 0.14), [
    { text: `The two largest items, owner dependence and the ${fmtKprose(D.ownerAdj[2])} owner-pay reset, are addressed by the same facts: an operations manager with 11 years’ tenure, a 12-month transition offer and a $95K replacement salary already deducted. AMB Advisory will provide the payroll register, general-ledger detail and ServiceTitan exports supporting each row in the data room.` },
  ], 9.5);

  notes(s, [
    'Source: Management; Company financial statements (QuickBooks Online), FY2023–FY2025; AMB Advisory analysis.',
    'Note: Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited.',
    '(1) Per management; not independently verified.',
  ]);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
const out = path.join(__dirname, 'deck.pptx');
pptx.writeFile({ fileName: out }).then((f) => console.log('wrote', f));
