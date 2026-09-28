/* eslint-disable */
'use strict';
/**
 * AMB Advisory Services: CIM deck, Direction C "Exhibit-forward databook".
 * Sample: Project Ridgeline (fictional). Builds deck.pptx next to this file.
 *
 *   node build-deck.js            -> ./deck.pptx
 *
 * Self-contained: needs pptxgenjs (and its jszip dependency) plus
 * ./amb-logo-tight.png (falls back to ../../../brand/amb-logo-maroon-2048.png).
 *
 * Everything follows docs/HOUSE_STYLE.md sections 1-4. Where the guide leaves
 * room, this direction chooses the QoE-databook grammar: 2-3 exhibits per page
 * on a strict 12-column grid, an "Obs." column on every table whose letters key
 * a "Key observations" list beside the exhibit, y/y and CAGR analytic columns
 * on every financial table, and a white cover with a maroon band in the bottom
 * third. See DESIGN_SPEC.md.
 */
const path = require('path');
const fs = require('fs');
const PptxGenJS = require('pptxgenjs');
const JSZip = require('jszip');

const OUT = path.join(__dirname, 'deck.pptx');
const LOGO = fs.existsSync(path.join(__dirname, 'amb-logo-tight.png'))
  ? path.join(__dirname, 'amb-logo-tight.png')
  : path.join(__dirname, '..', '..', '..', 'brand', 'amb-logo-maroon-2048.png');
const LOGO_ASPECT = 3.073; // tight crop 1862 x 606 px

// ---------------------------------------------------------------------------
// 1. Tokens (HOUSE_STYLE.md 1.2, 2.2, 2.6). Hex without '#'.
// ---------------------------------------------------------------------------
const C = {
  maroon: '7B0000',
  ink: '2C2523',
  muted: '7A706D',
  rule: 'C2BAB8',
  section: 'FFE1E1',
  tint: 'F5EDEC',
  onMaroon: 'E9D3D5',
  gold: 'C9A227',
  white: 'FFFFFF',
  // chart palette, fixed order
  sand: 'C49A5B',
  slate: '5E5552',
  blush: 'DCC7C4',
};
const SERIF = 'Georgia';
const SANS = 'Arial';

// ---------------------------------------------------------------------------
// 2. Grid (HOUSE_STYLE.md 2.1): 12 columns of 0.853 in, 0.20 in gutters,
//    0.45 in side margins. colX(k) is the left edge of column k (1-based).
// ---------------------------------------------------------------------------
const M = 0.45;
const CW = 0.853;
const G = 0.2;
const colX = (k) => +(M + (k - 1) * (CW + G)).toFixed(3);
const spanW = (a, b) => +((b - a + 1) * CW + (b - a) * G).toFixed(3);
const RIGHT = +(colX(12) + CW).toFixed(3); // 12.883
const CONTENT_W = +(RIGHT - M).toFixed(3); // 12.433
const BAND = { titleY: 0.3, titleH: 0.7, ruleY: 1.06, top: 1.22, bottom: 6.52, notesY: 6.5, notesH: 0.46, footRuleY: 7.0, footY: 7.06, footH: 0.24 };
const GAP = 0.08; // white gap column between period groups (V51 spacer columns)

// ---------------------------------------------------------------------------
// 3. Sample data (Project Ridgeline, fictional). $000s. Every figure on every
//    page is read from here and formatted by one function (HOUSE_STYLE.md 4.8).
// ---------------------------------------------------------------------------
const FY = ['FY2023', 'FY2024', 'FY2025'];
const D = {
  revenue: { residential: [1589.0, 1774.8, 1946.1], commercial: [612.5, 707.8, 821.0], agreements: [205.3, 236.0, 273.7] },
  cogs: { materials: [596.9, 673.1, 748.4], directLabor: [341.8, 373.6, 410.1] },
  opex: {
    ownerComp: [180.0, 190.0, 200.0],
    techWages: [522.4, 574.9, 631.7],
    officeWages: [176.8, 194.6, 212.9],
    vehicle: [118.9, 130.2, 141.5],
    rent: [88.0, 92.0, 96.0],
    insurance: [54.6, 61.5, 67.1],
    marketing: [17.2, 19.8, 21.5],
    otherGA: [153.2, 196.7, 195.2],
  },
  belowEbitda: { interest: [14.8, 17.2, 19.0], taxes: [0, 0, 0], da: [62.4, 68.9, 74.6] },
  adjustments: {
    N1: { label: 'Owner personal vehicle', vals: [16.0, 17.0, 18.0] },
    N2: { label: 'Charitable contributions', vals: [5.0, 6.0, 7.5] },
    N3: { label: 'One-time legal settlement', vals: [0, 24.0, 0] },
    N4: { label: 'Family phones and personal meals', vals: [0, 0, 6.0] },
    S1: { label: 'Excess owner compensation', vals: [85.0, 95.0, 105.0] },
  },
  ownerPaid: [180.0, 190.0, 200.0],
  replacementSalary: 95.0,
  members: 1450,
  renewal: 82,
  employees: 24,
  fieldStaff: 18,
  vehicles: 20,
  customers: [
    // coded; FY2025 revenue $000s; % of total; customer since; type; basis
    ['C-001', 'Restaurant group (4 sites)', 2016, 121.6, 'PM contract + T&M'],
    ['C-002', 'Property manager', 2014, 94.3, 'PM contract + T&M'],
    ['C-003', 'Property manager', 2018, 73.0, 'PM contract + T&M'],
    ['C-004', 'Office building', 2019, 60.8, 'PM contract'],
    ['C-005', 'Restaurant group (3 sites)', 2020, 51.7, 'T&M'],
    ['C-006', 'Property manager', 2012, 45.6, 'PM contract + T&M'],
    ['C-007', 'Medical office', 2021, 39.5, 'PM contract'],
    ['C-008', 'Restaurant group (2 sites)', 2017, 36.5, 'T&M'],
    ['C-009', 'Church campus', 2015, 33.4, 'PM contract'],
    ['C-010', 'Retail plaza', 2022, 30.4, 'T&M'],
  ],
};
const sum = (a) => a.reduce((s, v) => s + v, 0);
const addv = (...arrs) => arrs[0].map((_, i) => arrs.reduce((s, a) => s + a[i], 0));
const T = {};
T.revenue = addv(D.revenue.residential, D.revenue.commercial, D.revenue.agreements);
T.cogs = addv(D.cogs.materials, D.cogs.directLabor);
T.grossProfit = T.revenue.map((r, i) => +(r - T.cogs[i]).toFixed(1));
T.opex = addv(...Object.values(D.opex));
T.reported = T.grossProfit.map((g, i) => +(g - T.opex[i]).toFixed(1));
T.netIncome = T.reported.map((e, i) => +(e - D.belowEbitda.interest[i] - D.belowEbitda.taxes[i] - D.belowEbitda.da[i]).toFixed(1));
T.normTotal = addv(D.adjustments.N1.vals, D.adjustments.N2.vals, D.adjustments.N3.vals, D.adjustments.N4.vals);
T.adjusted = T.reported.map((e, i) => +(e + T.normTotal[i] + D.adjustments.S1.vals[i]).toFixed(1));
T.sde = T.adjusted.map((a) => +(a + D.replacementSalary).toFixed(1));
T.top10 = +sum(D.customers.map((c) => c[3])).toFixed(1);
T.remaining = +(T.revenue[2] - T.top10).toFixed(1);
T.totalAdj25 = +(T.normTotal[2] + D.adjustments.S1.vals[2]).toFixed(1);

// Sanity ties against the brief's stated figures. The build refuses to run if
// the constructed P&L does not foot to them (HOUSE_STYLE.md 4.8).
function assertTies() {
  const eq = (a, b, what) => { if (Math.abs(a - b) > 0.051) throw new Error(`Tie failed: ${what} ${a} vs ${b}`); };
  [2406.8, 2718.6, 3040.8].forEach((v, i) => eq(T.revenue[i], v, `revenue ${FY[i]}`));
  [157.0, 212.2, 316.4].forEach((v, i) => eq(T.reported[i], v, `reported EBITDA ${FY[i]}`));
  [263.0, 354.2, 452.9].forEach((v, i) => eq(T.adjusted[i], v, `adj. EBITDA ${FY[i]}`));
  [358.0, 449.2, 547.9].forEach((v, i) => eq(T.sde[i], v, `SDE ${FY[i]}`));
  [61.0, 61.5, 61.9].forEach((v, i) => eq(+(100 * T.grossProfit[i] / T.revenue[i]).toFixed(1), v, `gross margin ${FY[i]}`));
  [10.9, 13.0, 14.9].forEach((v, i) => eq(+(100 * T.adjusted[i] / T.revenue[i]).toFixed(1), v, `adj. margin ${FY[i]}`));
  eq(+(100 * (Math.pow(T.revenue[2] / T.revenue[0], 0.5) - 1)).toFixed(1), 12.4, 'revenue CAGR');
}
assertTies();

// ---------------------------------------------------------------------------
// 4. Number formats (HOUSE_STYLE.md 2.5 "Figures in tables", 4.6)
// ---------------------------------------------------------------------------
const EN = '–';
function k(n, o = {}) {
  // $000s to one decimal so every ladder and subtotal foots to the sample's stated figures
  if (n === null || n === undefined || n === '') return '';
  if (Math.abs(n) < 0.05) return EN;
  const dp = o.dp === undefined ? 1 : o.dp;
  const a = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const s = (o.dollar ? '$' : '') + a;
  return n < 0 ? `(${s})` : s;
}
function pct(n, dp = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const a = Math.abs(n).toFixed(dp) + '%';
  return n < 0 ? `(${a})` : a;
}
function growth(a, b) { return (b / a - 1) * 100; }
function cagr(a, b, yrs) { return (Math.pow(b / a, 1 / yrs) - 1) * 100; }
function delta(a, b) { // margin change: bps under a point, pts otherwise
  const d = b - a;
  const sign = d < 0 ? EN : '+';
  return Math.abs(d) < 1 ? `${sign}${Math.round(Math.abs(d) * 100)} bps` : `${sign}${Math.abs(d).toFixed(1)} pts`;
}
function money(n) { // prose: $3.04M, $452.9K
  return Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(2)}M` : `$${n.toFixed(1)}K`;
}
const margin = (num, den) => num.map((v, i) => (100 * v) / den[i]);

// ---------------------------------------------------------------------------
// 5. pptx primitives
// ---------------------------------------------------------------------------
const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pptx.author = 'AMB Advisory Services LLC';
pptx.company = 'AMB Advisory Services LLC';
pptx.title = 'Project Ridgeline: Confidential Information Memorandum';

const NONE = { type: 'none' };
const noBorder = [NONE, NONE, NONE, NONE];
const hair = (color, pt) => ({ pt, color });

function text(slide, t, o) {
  slide.addText(t, Object.assign({ fontFace: SANS, color: C.ink, margin: 0, isTextBox: true, valign: 'top', fit: 'none' }, o));
}
function hline(slide, x, y, w, color, width) {
  slide.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width } });
}
function vline(slide, x, y, h, color, width) {
  slide.addShape(pptx.ShapeType.line, { x, y, w: 0, h, line: { color, width } });
}
function rect(slide, x, y, w, h, fill) {
  slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0.25 } });
}
function cell(t, o = {}) {
  const base = { fontFace: SANS, fontSize: 8.5, color: C.ink, valign: 'middle', border: noBorder, margin: [0, 0.05, 0, 0.05] };
  return { text: t, options: Object.assign(base, o) };
}
function run(t, o = {}) { return { text: t, options: Object.assign({ fontFace: SANS }, o) }; }

/** Exhibit header (2.1): Arial Bold 9.5 title + two spaces + muted units; 0.5 pt ink rule 0.25 in below; body starts 0.33 in below. */
function exhibit(slide, x, y, w, title, units, annotation) {
  const runs = [run(title, { bold: true, color: C.ink, fontSize: 9.5 })];
  if (units) runs.push(run('  ' + units, { color: C.muted, fontSize: 9.5 }));
  // the one annotation per chart (2.6) sits right-aligned on the header line; it gets 55% of the width so a CAGR pair fits on one line
  const tw = annotation ? +(w * 0.45).toFixed(3) : w;
  text(slide, runs, { x, y, w: tw, h: 0.25, valign: 'bottom', fontSize: 9.5 });
  if (annotation) text(slide, annotation, { x: +(x + w * 0.45).toFixed(3), y, w: +(w * 0.55).toFixed(3), h: 0.25, valign: 'bottom', align: 'right', fontSize: 8, color: C.muted });
  hline(slide, x, y + 0.25, w, C.ink, 0.5);
  return y + 0.33;
}

/**
 * Numeric table in AMB's exhibit grammar (2.5): maroon two-tier header,
 * FFE1E1 section rows, subtotals ruled 0.5 pt ink on top, key totals ruled
 * 0.75 pt maroon top and bottom, ratio rows italic, no verticals, no zebra,
 * white gap columns between period groups. Column spec:
 *   cols: [{ w, kind:'label'|'ref'|'num'|'text'|'obs'|'gap', head, group }]
 * rows: { type:'section'|'line'|'sub'|'subtotal'|'key'|'ratio', label, ref, vals:[...], obs }
 */
function numTable(slide, spec) {
  const { x, y, cols, rows, name, rowH = 0.195, headH = 0.21, fontSize = 8.5 } = spec;
  const colW = cols.map((c) => c.w);
  const w = +sum(colW).toFixed(3);
  const out = [];
  const rh = [];
  // tier 1: group labels, centred across their columns
  const groups = [];
  cols.forEach((c, i) => {
    if (c.kind === 'gap') { groups.push({ gap: true, i, n: 1 }); return; }
    const g = groups[groups.length - 1];
    if (g && !g.gap && g.group === c.group) { g.n += 1; return; }
    groups.push({ group: c.group, i, n: 1 });
  });
  // tier 1 is drawn only when at least one period group is named; a table of
  // plain columns gets the single-tier header AMB uses on its client lists
  if (cols.some((c) => c.group)) {
    const tier1 = [];
    groups.forEach((g) => {
      if (g.gap) { tier1.push(cell('', {})); return; }
      tier1.push(cell(g.group || '', { colspan: g.n > 1 ? g.n : undefined, fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, align: 'center' }));
    });
    out.push(tier1); rh.push(headH);
  }
  const tier2 = cols.map((c, i) => {
    if (c.kind === 'gap') return cell('', {});
    const align = c.kind === 'num' ? (c.left ? 'left' : 'right') : c.kind === 'obs' || c.kind === 'ref' ? 'center' : 'left';
    return cell(i === 0 ? name : c.head || '', { fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, align });
  });
  out.push(tier2); rh.push(headH);

  rows.forEach((r) => {
    const isSection = r.type === 'section';
    const isKey = r.type === 'key';
    const isSubtotal = r.type === 'subtotal';
    const isRatio = r.type === 'ratio';
    const bold = isKey || isSubtotal;
    let v = 0;
    const cells = cols.map((c, i) => {
      if (c.kind === 'gap') return cell('', {});
      const o = { fontSize, bold, italic: isRatio, valign: 'middle' };
      if (isSection) o.fill = { color: C.section };
      if (isSubtotal) o.border = [hair(C.ink, 0.5), NONE, NONE, NONE];
      if (isKey) o.border = [hair(C.maroon, 0.75), NONE, hair(C.maroon, 0.75), NONE];
      if (c.kind === 'label') {
        const indent = isSection || isKey || isSubtotal ? 0.05 : r.type === 'sub' ? 0.29 : 0.17;
        o.margin = [0, 0.05, 0, indent];
        o.align = 'left';
        if (isSection) { o.bold = true; }
        const t = r.note ? [run(r.label, { fontSize, bold: o.bold, italic: o.italic, color: C.ink }), run(` (${r.note})`, { fontSize: 7, color: C.muted })] : r.label;
        return cell(t, o);
      }
      if (c.kind === 'ref') { o.align = 'left'; o.color = C.muted; o.bold = false; o.fontSize = 8; return cell(isSection ? '' : r.ref || '', o); }
      if (c.kind === 'obs') { o.align = 'center'; o.color = C.maroon; o.bold = true; o.italic = false; return cell(isSection ? '' : r.obs || '', o); }
      if (c.kind === 'text') { o.align = 'left'; o.color = C.muted; o.fontSize = 8; o.bold = false; o.italic = false; return cell(isSection ? '' : r.text || '', o); }
      // num (or a text column inside a numeric table when c.left is set)
      o.align = c.left ? 'left' : 'right';
      const val = isSection ? '' : (r.vals && r.vals[v] !== undefined ? r.vals[v] : '');
      v += 1;
      return cell(val, o);
    });
    out.push(cells); rh.push(rowH);
  });
  slide.addTable(out, { x, y, w, colW, rowH: rh, autoPage: false, fontFace: SANS });
  return y + sum(rh);
}

/** Text table (2.5): maroon header, 0.5 pt rule between rows, first column bold, top-aligned. */
function textTable(slide, spec) {
  const { x, y, colW, head, rows, fontSize = 8.5, rowH, headH = 0.21, firstBold = true, aligns } = spec;
  const w = +sum(colW).toFixed(3);
  const out = [head.map((h, i) => cell(h, { fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, align: (aligns && aligns[i]) || 'left', valign: 'middle' }))];
  rows.forEach((r, ri) => {
    out.push(r.map((t, i) => {
      const o = { fontSize, valign: 'top', align: (aligns && aligns[i]) || 'left', margin: [0.035, 0.05, 0.035, 0.05], border: [NONE, NONE, hair(C.rule, 0.5), NONE] };
      if (i === 0 && firstBold) o.bold = true;
      if (spec.obsCol === i) { o.color = C.maroon; o.bold = true; o.align = 'center'; }
      if (spec.refCol === i) { o.color = C.muted; }
      if (spec.totalRow === ri) { o.bold = true; o.border = [hair(C.maroon, 0.75), NONE, hair(C.maroon, 0.75), NONE]; }
      return cell(t, o);
    }));
  });
  const rh = [headH].concat(rows.map((_, i) => (Array.isArray(rowH) ? rowH[i] : rowH || 0.3)));
  slide.addTable(out, { x, y, w, colW, rowH: rh, autoPage: false, fontFace: SANS });
  return y + sum(rh);
}

/** Key observations: lettered list keyed to the "Obs." column of the exhibit it sits beside. */
function observations(slide, x, y, w, items, o = {}) {
  const fontSize = o.fontSize || 9;
  const title = o.title || 'Key observations';
  const by = exhibit(slide, x, y, w, title, o.units || '');
  const letterW = 0.3;
  const rows = items.map(([key, lead, body], i) => [
    cell(key, { bold: true, color: C.maroon, fontSize: fontSize + 0.5, valign: 'top', align: 'left', margin: [0.04, 0, 0.05, 0.02], border: [NONE, NONE, i < items.length - 1 ? hair(C.rule, 0.5) : NONE, NONE] }),
    cell([run(lead + ' ', { bold: true, fontSize, color: C.ink }), run(body, { fontSize, color: C.ink })], { valign: 'top', margin: [0.04, 0.02, 0.05, 0], border: [NONE, NONE, i < items.length - 1 ? hair(C.rule, 0.5) : NONE, NONE] }),
  ]);
  const rh = items.map(() => o.rowH || 0.42);
  slide.addTable(rows, { x, y: by, w, colW: [letterW, +(w - letterW).toFixed(3)], rowH: rh, autoPage: false, fontFace: SANS });
  return by + sum(rh);
}

/** One callout per page at most (2.7): F5EDEC fill, 2.25 pt maroon left rule, bold maroon lead-in. */
function callout(slide, x, y, w, h, lead, body) {
  rect(slide, x, y, w, h, C.tint);
  vline(slide, x, y, h, C.maroon, 2.25);
  text(slide, [run(lead + ' ', { bold: true, color: C.maroon, fontSize: 9 }), run(body, { color: C.ink, fontSize: 9 })], { x: x + 0.14, y: y + 0.02, w: w - 0.24, h: h - 0.04, valign: 'middle', fontSize: 9, lineSpacingMultiple: 1.08 });
}

/** Page furniture (2.8): title zone, title rule, notes band, footer rule, tracker, confidentiality line, logo, page number. */
function page(slide, o) {
  slide.background = { color: C.white };
  text(slide, o.title, { x: M, y: BAND.titleY, w: CONTENT_W, h: BAND.titleH, fontFace: SERIF, fontSize: 20, bold: true, color: C.maroon, valign: 'bottom', lineSpacingMultiple: 1.0 });
  hline(slide, M, BAND.ruleY, CONTENT_W, C.maroon, 0.75);
  const lines = [];
  if (o.source) lines.push('Source: ' + o.source);
  if (o.note) lines.push('Note: ' + o.note);
  (o.foot || []).forEach((f, i) => lines.push(`(${i + 1}) ${f}`));
  if (lines.length) {
    text(slide, lines.map((t, i) => run(t, { fontSize: 7, color: C.muted, breakLine: i < lines.length - 1 })), { x: M, y: BAND.notesY, w: CONTENT_W, h: BAND.notesH, valign: 'bottom', fontSize: 7, color: C.muted, lineSpacingMultiple: 1.0 });
  }
  hline(slide, M, BAND.footRuleY, CONTENT_W, C.rule, 0.5);
  text(slide, [run('Project Ridgeline', { color: C.muted, fontSize: 7.5 }), run('  |  ', { color: C.muted, fontSize: 7.5 }), run(o.section, { color: C.maroon, fontSize: 7.5 })], { x: M, y: BAND.footY, w: 4.5, h: BAND.footH, valign: 'middle', fontSize: 7.5 });
  text(slide, 'Strictly private and confidential', { x: 4.0, y: BAND.footY, w: 5.333, h: BAND.footH, valign: 'middle', align: 'center', fontSize: 7.5, color: C.muted });
  const lh = 0.22, lw = +(lh * LOGO_ASPECT).toFixed(3);
  slide.addImage({ path: LOGO, x: +(12.3 - lw).toFixed(3), y: +(BAND.footY + (BAND.footH - lh) / 2).toFixed(3), w: lw, h: lh });
  text(slide, String(o.num), { x: 12.35, y: BAND.footY, w: +(RIGHT - 12.35).toFixed(3), h: BAND.footH, valign: 'middle', align: 'right', fontSize: 8, color: C.ink });
}

// Common chart options (2.6): Arial 8 pt labels, muted axis text, no gridlines,
// no outline, 60% gap width, value axis hidden when every bar is labelled.
const chartBase = {
  barDir: 'col',
  barGapWidthPct: 60,
  showValue: true,
  dataLabelFontFace: SANS,
  dataLabelFontSize: 8,
  dataLabelColor: C.ink,
  catAxisLabelFontFace: SANS,
  catAxisLabelFontSize: 8,
  catAxisLabelColor: C.muted,
  catAxisLineShow: true,
  catAxisLineColor: C.rule,
  catAxisLineSize: 0.5,
  valAxisHidden: true,
  valGridLine: { style: 'none' },
  showTitle: false,
  legendFontFace: SANS,
  legendFontSize: 8,
  legendColor: C.ink,
  plotArea: { fill: { color: C.white } },
  chartArea: { fill: { color: C.white } },
};

// ---------------------------------------------------------------------------
// 6. Pages
// ---------------------------------------------------------------------------
const SOURCE_FIN = 'Company financial statements (QuickBooks Online), FY2023–FY2025; AMB Advisory analysis.';
const NOTE_FIN = 'Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited. Fiscal year ends December 31.';

// ---- Page 1: cover --------------------------------------------------------
{
  const s = pptx.addSlide();
  s.background = { color: C.white };
  // colour logo on white, tight crop, 2.40 in wide, aligned to the grid
  const lw = 2.4, lh = +(lw / LOGO_ASPECT).toFixed(3);
  s.addImage({ path: LOGO, x: 0.7, y: 0.62, w: lw, h: lh });
  // maroon band across the bottom third carrying the title
  const bandY = 5.0;
  rect(s, 0, bandY, 13.333, 7.5 - bandY, C.maroon);
  hline(s, 0.72, bandY + 0.42, 2.0, C.gold, 1); // the one gold rule (ICP5 cover)
  text(s, 'Project Ridgeline', { x: 0.7, y: bandY + 0.5, w: 9.0, h: 0.78, fontFace: SERIF, fontSize: 40, color: C.white, valign: 'bottom' });
  text(s, 'Confidential Information Memorandum', { x: 0.7, y: bandY + 1.36, w: 9.0, h: 0.32, fontSize: 16, color: C.white, valign: 'top' });
  text(s, 'October 2026', { x: 0.7, y: bandY + 1.72, w: 6.0, h: 0.24, fontSize: 11, color: C.onMaroon, valign: 'top' });
  text(s, 'Strictly private and confidential. Prepared by AMB Advisory Services LLC for recipients who have executed a confidentiality agreement with AMB Advisory.', { x: 0.7, y: 7.02, w: 11.9, h: 0.22, fontSize: 8, color: C.onMaroon, valign: 'middle' });
}

// ---- Page 2: executive summary ---------------------------------------------
{
  const s = pptx.addSlide();
  page(s, {
    num: 2,
    section: 'Executive summary',
    title: `Ridgeline earned ${money(T.adjusted[2])} of Adj. EBITDA (${pct(margin(T.adjusted, T.revenue)[2])} margin) on ${money(T.revenue[2])} of FY2025 revenue with ${D.employees} employees and ${D.members.toLocaleString('en-US')} agreement members`,
    source: 'Company financial statements (QuickBooks Online), FY2023–FY2025; Management; AMB Advisory analysis.',
    note: NOTE_FIN,
    foot: [
      'Per management; not independently verified. Operating metrics as of September 2026.',
      'Adj. EBITDA and SDE are non-GAAP measures; see page 4 for the reconciliation to net income.',
    ],
  });
  // Exhibit A: Quick Stats (cols 1-7)
  const ax = colX(1), aw = spanW(1, 7);
  let y = exhibit(s, ax, BAND.top, aw, 'Quick Stats', '($000s unless noted)');
  const gm = margin(T.grossProfit, T.revenue), rm = margin(T.reported, T.revenue), am = margin(T.adjusted, T.revenue), sm = margin(T.sde, T.revenue);
  y = numTable(s, {
    x: ax, y, name: 'Metric',
    cols: [
      { w: 2.25, kind: 'label', group: '' },
      { w: 0.66, kind: 'num', head: FY[0], group: 'Fiscal year' }, { w: 0.66, kind: 'num', head: FY[1], group: 'Fiscal year' }, { w: 0.66, kind: 'num', head: FY[2], group: 'Fiscal year' },
      { w: GAP, kind: 'gap' },
      { w: 2.46, kind: 'text', head: 'Context', group: '' },
      { w: 0.4, kind: 'obs', head: 'Obs.', group: '' },
    ],
    rows: [
      { type: 'section', label: 'Financial' },
      { type: 'line', label: 'Revenue', vals: T.revenue.map((v, i) => k(v, { dollar: true })), text: `${pct(cagr(T.revenue[0], T.revenue[2], 2))} CAGR; ${pct(growth(T.revenue[1], T.revenue[2]))} in FY2025`, obs: 'A' },
      { type: 'ratio', label: '% gross margin', vals: gm.map((v) => pct(v)), text: 'Equipment and materials 24.6% of revenue', obs: 'B' },
      { type: 'line', label: 'Reported EBITDA', vals: T.reported.map((v) => k(v)), text: `Margin ${pct(rm[0])} to ${pct(rm[2])}` },
      { type: 'key', label: 'Adj. EBITDA', note: '2', vals: T.adjusted.map((v) => k(v, { dollar: true })), text: `After $${T.totalAdj25.toFixed(1)}K of FY2025 adjustments (p. 4)`, obs: 'C' },
      { type: 'ratio', label: '% margin', vals: am.map((v) => pct(v)), text: `Up ${delta(am[0], am[2])} in two years` },
      { type: 'line', label: 'Seller’s discretionary earnings', note: '2', vals: T.sde.map((v) => k(v)), text: `SDE: Adj. EBITDA + $${D.replacementSalary.toFixed(0)}K replacement salary` },
      { type: 'ratio', label: '% margin', vals: sm.map((v) => pct(v)), text: '' },
      { type: 'section', label: 'Operating (1)' },
      { type: 'line', label: 'Agreement members (#)', vals: ['', '', D.members.toLocaleString('en-US')], text: `${D.renewal}% renewal; two tune-ups a year`, obs: 'D' },
      { type: 'line', label: 'Largest customer (% of revenue)', vals: ['', '', pct(100 * D.customers[0][3] / T.revenue[2])], text: `Top 10 are ${pct(100 * T.top10 / T.revenue[2])}, all commercial` },
      { type: 'line', label: 'Employees (#)', vals: ['', '', String(D.employees)], text: `${D.fieldStaff} in the field; ops manager 11 years’ tenure` },
      { type: 'line', label: 'Revenue per employee', vals: ['', '', k(T.revenue[2] / D.employees)], text: `$${(T.revenue[2] / D.fieldStaff).toFixed(1)}K per field employee` },
      { type: 'line', label: 'Fleet (#)', vals: ['', '', String(D.vehicles)], text: '18 service vans, 2 install trucks, owned' },
      { type: 'line', label: 'Google rating', vals: ['', '', '4.8'], text: '900+ reviews; Carrier dealer since 2015' },
    ],
  });
  // Overview paragraph (fact order) under Exhibit A
  const ov = [
    run('Ridgeline Comfort Services LLC (“Ridgeline” or the “Company”) ', { bold: true, fontSize: 9.5, color: C.ink }),
    run(`is a residential and light-commercial HVAC and plumbing contractor based in Columbus, Ohio, serving Franklin, Delaware and Licking counties within about a 35-mile radius. Founded in 2009 by its owner after 12 years as a lead technician at a regional contractor, the Company employs ${D.employees} people: 14 service technicians, 4 installers, an operations manager, 3 customer service and dispatch staff and a bookkeeper. Revenue of ${money(T.revenue[2])} in FY2025 (a ${pct(cagr(T.revenue[0], T.revenue[2], 2))} CAGR since FY2023) is 64% residential service and replacement, 27% commercial and 9% maintenance agreements, with ${D.members.toLocaleString('en-US')} agreement members renewing at ${D.renewal}%. The largest customer is ${pct(100 * D.customers[0][3] / T.revenue[2])} of revenue. Ridgeline is an S corporation owned by its founder, who is retiring at 61 and is offering an asset sale with up to 12 months of full-time transition.`, { fontSize: 9.5, color: C.ink }),
  ];
  text(s, ov, { x: ax, y: y + 0.16, w: aw, h: 6.45 - (y + 0.16), fontSize: 9.5, valign: 'top', lineSpacingMultiple: 1.08 });

  // Exhibit B: transaction summary (cols 8-12)
  const bx = colX(8), bw = spanW(8, 12);
  let y2 = exhibit(s, bx, BAND.top, bw, 'Transaction summary', '');
  y2 = textTable(s, {
    x: bx, y: y2, colW: [1.15, +(bw - 1.15).toFixed(3)], head: ['Term', 'Detail'], fontSize: 8.5, rowH: [0.3, 0.3, 0.19, 0.3, 0.3, 0.3, 0.19, 0.19],
    rows: [
      ['What is offered', 'Substantially all of the operating assets of Ridgeline Comfort Services LLC, free and clear of liens.'],
      ['Basis of offers', 'The business is offered as a purchase of assets; the Seller retains cash, receivables and payables.'],
      ['Reason for sale', 'Owner retirement (age 61).'],
      ['Owner transition', 'The owner will remain full time for up to 12 months after closing and will introduce each commercial account.'],
      ['Key employees', 'The operations manager (11 years) is expected to stay. The Seller prefers a buyer who keeps the Ridgeline name and all employees.'],
      ['Real estate', '8,000 sq ft leased shop and office through 2029 with a 5-year renewal option; landlord unrelated to the owner.'],
      ['Target timing', 'The Seller is targeting a closing within 12 months.'],
      ['Tax', 'Each party will rely on its own tax advisors.'],
    ],
  });
  observations(s, bx, y2 + 0.14, bw, [
    ['A', `Revenue grew ${pct(growth(T.revenue[0], T.revenue[2]), 0)} in two years,`, `from ${money(T.revenue[0])} in FY2023 to ${money(T.revenue[2])} in FY2025, with commercial the fastest line at a ${pct(cagr(D.revenue.commercial[0], D.revenue.commercial[2], 2))} CAGR and residential at ${pct(cagr(D.revenue.residential[0], D.revenue.residential[2], 2))}.`],
    ['B', `Gross margin rose ${delta(gm[0], gm[2])} to ${pct(gm[2])}`, `because equipment and materials held at 24.6–24.8% of revenue while flat-rate pricing (ServiceTitan pricebook) passed cost increases through.`],
    ['C', `Adj. EBITDA margin rose from ${pct(am[0])} to ${pct(am[2])}`, `as operating expenses grew at a ${pct(cagr(T.opex[0], T.opex[2], 2))} CAGR against revenue at ${pct(cagr(T.revenue[0], T.revenue[2], 2))}; the largest adjustment is the owner’s $200K salary restated to $95K (page 4).`],
    ['D', 'Maintenance agreements are 9% of revenue', `but schedule about ${(D.members * 2).toLocaleString('en-US')} tune-up visits a year for ${D.members.toLocaleString('en-US')} members renewing at ${D.renewal}%, and are offered on only about 35% of service calls (1).`],
  ], { rowH: 0.47 });
}

// ---- Page 3: financial summary ---------------------------------------------
{
  const s = pptx.addSlide();
  const gm = margin(T.grossProfit, T.revenue), rm = margin(T.reported, T.revenue);
  page(s, {
    num: 3,
    section: 'Financial performance',
    title: `Revenue grew at a ${pct(cagr(T.revenue[0], T.revenue[2], 2))} CAGR to ${money(T.revenue[2])} in FY2025 while gross margin held at 61–62% and Reported EBITDA doubled to ${money(T.reported[2])}`,
    source: SOURCE_FIN,
    note: NOTE_FIN + ' Cost of revenue is equipment, parts, materials and installation labor; technician wages are in operating expenses.',
    foot: ['Net income before interest, income taxes, depreciation and amortization. The Company is an S corporation and pays no entity-level income tax.'],
  });
  const ax = colX(1), aw = spanW(1, 6);
  let y = exhibit(s, ax, BAND.top, aw, 'Summary income statement', '($000s)');
  const line = (label, vals, o = {}) => Object.assign({ type: 'line', label, vals: [k(vals[0], { dollar: !!o.dollar }), k(vals[1], { dollar: !!o.dollar }), k(vals[2], { dollar: !!o.dollar }), pct(growth(vals[1], vals[2])), pct(cagr(vals[0], vals[2], 2))] }, o);
  const total = (type, label, vals, o = {}) => Object.assign({ type, label, vals: [k(vals[0], { dollar: true }), k(vals[1], { dollar: true }), k(vals[2], { dollar: true }), pct(growth(vals[1], vals[2])), pct(cagr(vals[0], vals[2], 2))] }, o);
  const ratio = (label, m) => ({ type: 'ratio', label, vals: [pct(m[0]), pct(m[1]), pct(m[2]), delta(m[1], m[2]), ''] });
  y = numTable(s, {
    x: ax, y, name: 'Income statement',
    cols: [
      { w: 2.28, kind: 'label', group: '' },
      { w: 0.66, kind: 'num', head: FY[0], group: 'Fiscal year' }, { w: 0.66, kind: 'num', head: FY[1], group: 'Fiscal year' }, { w: 0.66, kind: 'num', head: FY[2], group: 'Fiscal year' },
      { w: GAP, kind: 'gap' },
      { w: 0.62, kind: 'num', head: 'FY25 y/y', group: 'Growth' }, { w: 0.62, kind: 'num', head: 'CAGR', group: 'Growth' },
      { w: GAP, kind: 'gap' },
      { w: 0.4, kind: 'obs', head: 'Obs.', group: '' },
    ],
    rows: [
      { type: 'section', label: 'Revenue' },
      line('Residential service and replacement', D.revenue.residential, { dollar: true }),
      line('Commercial', D.revenue.commercial, { obs: 'A' }),
      line('Maintenance agreements', D.revenue.agreements),
      total('subtotal', 'Total revenue', T.revenue),
      { type: 'section', label: 'Cost of revenue' },
      line('Equipment, parts and materials', D.cogs.materials),
      line('Direct labor and subcontractors', D.cogs.directLabor),
      total('key', 'Gross profit', T.grossProfit, { obs: 'B' }),
      ratio('% margin', gm),
      { type: 'section', label: 'Operating expenses' },
      line('Owner compensation', D.opex.ownerComp),
      line('Technician wages and benefits', D.opex.techWages, { obs: 'C' }),
      line('Office wages and benefits', D.opex.officeWages),
      line('Vehicle, fuel and maintenance', D.opex.vehicle),
      line('Rent and occupancy', D.opex.rent),
      line('Insurance', D.opex.insurance),
      line('Marketing and advertising', D.opex.marketing),
      line('Other G&A', D.opex.otherGA, { obs: 'D' }),
      total('subtotal', 'Total operating expenses', T.opex),
      total('key', 'Reported EBITDA', T.reported, { note: '1', obs: 'E' }),
      ratio('% margin', rm),
    ],
  });

  // Exhibit B: chart (cols 7-12)
  const bx = colX(7), bw = spanW(7, 12);
  let y2 = exhibit(s, bx, BAND.top, bw, 'Revenue and Adj. EBITDA', '($000s)', `FY2023–FY2025 CAGR: revenue ${pct(cagr(T.revenue[0], T.revenue[2], 2))}, Adj. EBITDA ${pct(cagr(T.adjusted[0], T.adjusted[2], 2))}`);
  const chartH = 2.62;
  s.addChart(pptx.ChartType.bar, [
    { name: 'Revenue', labels: FY, values: T.revenue },
    { name: 'Adj. EBITDA', labels: FY, values: T.adjusted },
  ], Object.assign({}, chartBase, {
    x: bx, y: y2, w: bw, h: chartH,
    barGrouping: 'clustered',
    chartColors: [C.maroon, C.blush],
    dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '#,##0',
    showLegend: true, legendPos: 't',
  }));
  y2 += chartH + 0.12;
  observations(s, bx, y2, bw, [
    ['A', `Commercial and maintenance-agreement revenue each grew ${pct(growth(D.revenue.commercial[1], D.revenue.commercial[2]))} in FY2025,`, `to ${money(D.revenue.commercial[2])} and ${money(D.revenue.agreements[2])}, against ${pct(growth(D.revenue.residential[1], D.revenue.residential[2]))} for residential; the two lines rose from 34% to 36% of revenue in two years.`],
    ['B', `Gross profit grew ${pct(growth(T.grossProfit[1], T.grossProfit[2]))} to ${money(T.grossProfit[2])}`, `and margin reached ${pct(gm[2])} (up ${delta(gm[1], gm[2])}) because direct labor and subcontractors grew ${pct(growth(D.cogs.directLabor[1], D.cogs.directLabor[2]))}, slower than revenue at ${pct(growth(T.revenue[1], T.revenue[2]))}.`],
    ['C', `Technician wages and benefits, the largest expense line at ${money(D.opex.techWages[2])},`, `grew ${pct(growth(D.opex.techWages[1], D.opex.techWages[2]))} in FY2025 against revenue growth of ${pct(growth(T.revenue[1], T.revenue[2]))} and fell from ${pct(100 * D.opex.techWages[1] / T.revenue[1])} to ${pct(100 * D.opex.techWages[2] / T.revenue[2])} of revenue.`],
    ['D', `Other G&A was flat at ${money(D.opex.otherGA[2])} (down ${pct(-growth(D.opex.otherGA[1], D.opex.otherGA[2]))})`, `because FY2024 carried a $24.0K legal settlement [N3] that did not recur; excluding it, the line grew ${pct(growth(D.opex.otherGA[1] - 24, D.opex.otherGA[2]))}.`],
    ['E', `Reported EBITDA rose ${pct(growth(T.reported[1], T.reported[2]))} to ${money(T.reported[2])}`, `and the margin from ${pct(rm[1])} to ${pct(rm[2])}; total operating expenses grew ${pct(growth(T.opex[1], T.opex[2]))} in FY2025 against revenue growth of ${pct(growth(T.revenue[1], T.revenue[2]))}.`],
  ], { rowH: 0.395 });
}

// ---- Page 4: adjusted EBITDA schedule --------------------------------------
{
  const s = pptx.addSlide();
  const am = margin(T.adjusted, T.revenue), rm = margin(T.reported, T.revenue), sm = margin(T.sde, T.revenue);
  const A = D.adjustments;
  page(s, {
    num: 4,
    section: 'Adjusted EBITDA',
    title: `Adj. EBITDA of ${money(T.adjusted[2])} in FY2025 reflects $200K of owner pay reset to a $95K market salary plus $${T.normTotal[2].toFixed(1)}K of itemized add-backs`,
    source: 'Company financial statements (QuickBooks Online), FY2023–FY2025; general ledger detail; payroll register; Seller add-back list; AMB Advisory analysis.',
    note: 'Figures in USD thousands. Adj. EBITDA and SDE are non-GAAP measures. Positive adjustments increase EBITDA. Financials are as provided by the Seller and have not been independently audited.',
    foot: [
      `SDE adds back the $${D.replacementSalary.toFixed(1)}K market replacement compensation deducted within [S1]; shown for buyers financing with an SBA 7(a) loan.`,
      'Market salary for a general manager per management and AMB Advisory’s review of comparable roles in the Columbus market; not independently verified.',
    ],
  });
  const ax = colX(1), aw = spanW(1, 6);
  let y = exhibit(s, ax, BAND.top, aw, 'Adjusted EBITDA reconciliation', '($000s)');
  const vals3 = (v, dollar) => [k(v[0], { dollar }), k(v[1], { dollar }), k(v[2], { dollar })];
  const yoy = (v) => (v[1] && v[2] ? pct(growth(v[1], v[2])) : 'n.m.');
  const row = (type, label, v, o = {}) => Object.assign({ type, label, vals: vals3(v, !!o.dollar).concat([o.yoy === undefined ? yoy(v) : o.yoy]) }, o);
  const ratio = (label, m) => ({ type: 'ratio', label, vals: [pct(m[0]), pct(m[1]), pct(m[2]), delta(m[1], m[2])] });
  y = numTable(s, {
    x: ax, y, name: 'EBITDA ladder',
    cols: [
      { w: 2.35, kind: 'label', group: '' },
      { w: 0.45, kind: 'ref', head: 'Ref', group: '' },
      { w: 0.66, kind: 'num', head: FY[0], group: 'Fiscal year' }, { w: 0.66, kind: 'num', head: FY[1], group: 'Fiscal year' }, { w: 0.66, kind: 'num', head: FY[2], group: 'Fiscal year' },
      { w: GAP, kind: 'gap' },
      { w: 0.66, kind: 'num', head: 'FY25 y/y', group: 'Growth' },
      { w: GAP, kind: 'gap' },
      { w: 0.4, kind: 'obs', head: 'Obs.', group: '' },
    ],
    rows: [
      row('line', 'Net income', T.netIncome, { dollar: true }),
      { type: 'section', label: 'Definitional adjustments' },
      row('line', '(+) Interest expense', D.belowEbitda.interest, { ref: '[D1]' }),
      row('line', '(+) Income taxes', D.belowEbitda.taxes, { ref: '[D2]', yoy: EN }),
      row('line', '(+) Depreciation and amortization', D.belowEbitda.da, { ref: '[D3]' }),
      row('key', 'Reported EBITDA', T.reported, { dollar: true, obs: 'A' }),
      ratio('% margin', rm),
      { type: 'section', label: 'Normalization adjustments' },
      row('line', '(+) ' + A.N1.label, A.N1.vals, { ref: '[N1]' }),
      row('line', '(+) ' + A.N2.label, A.N2.vals, { ref: '[N2]' }),
      row('line', '(+) ' + A.N3.label, A.N3.vals, { ref: '[N3]', yoy: 'n.m.' }),
      row('line', '(+) ' + A.N4.label, A.N4.vals, { ref: '[N4]', yoy: 'n.m.' }),
      row('subtotal', 'Total normalization adjustments', T.normTotal, { dollar: true, obs: 'B' }),
      { type: 'section', label: 'Owner compensation' },
      row('line', '(+) ' + A.S1.label, A.S1.vals, { ref: '[S1]', obs: 'C' }),
      row('key', 'Adj. EBITDA', T.adjusted, { dollar: true }),
      ratio('% margin', am),
      { type: 'section', label: 'Memo' },
      row('key', 'Seller’s discretionary earnings (SDE)', T.sde, { dollar: true, note: '1', obs: 'D' }),
      ratio('% margin', sm),
    ],
  });
  callout(s, ax, y + 0.14, aw, 6.4 - (y + 0.14), 'Takeaway:', `Of the $${T.totalAdj25.toFixed(1)}K of FY2025 adjustments, $${A.S1.vals[2].toFixed(1)}K is owner pay above a $${D.replacementSalary.toFixed(0)}K general-manager salary. A buyer who hires a manager underwrites Adj. EBITDA of ${money(T.adjusted[2])}; an owner-operator underwrites SDE of ${money(T.sde[2])}.`);

  // Exhibit B: adjustment support (cols 7-12)
  const bx = colX(7), bw = spanW(7, 12);
  let y2 = exhibit(s, bx, BAND.top, bw, 'Adjustment support', '(FY2025, $000s)');
  y2 = textTable(s, {
    x: bx, y: y2, colW: [0.45, 1.25, 3.1, +(bw - 4.8).toFixed(3)], head: ['Ref', 'Adjustment', 'Basis', 'Evidence'], fontSize: 8, rowH: [0.42, 0.42, 0.42, 0.42, 0.5], refCol: 0, firstBold: false,
    rows: [
      ['[N1]', A.N1.label, `Lease, fuel and insurance on the owner’s personal truck, not used in the fleet, coded to vehicle expense: $${A.N1.vals[2].toFixed(1)}K per GL account 6420 and the lease agreement.`, 'Documented'],
      ['[N2]', A.N2.label, `Donations to youth sports leagues and a church capital campaign, $${A.N2.vals[2].toFixed(1)}K per GL account 6810; no customer relationship attached.`, 'Documented'],
      ['[N3]', A.N3.label, `Settlement of a 2024 employment claim paid in June 2024, including legal fees, $${A.N3.vals[1].toFixed(1)}K in FY2024; settlement agreement and invoices on file. No similar claim in FY2023 or FY2025.`, 'Documented'],
      ['[N4]', A.N4.label, `Four family cell phone lines and personal meals coded to office expense, $${A.N4.vals[2].toFixed(1)}K per management’s review of FY2025 card statements.`, 'Management representation'],
      ['[S1]', 'Owner compensation', `Owner W-2 wages of $${D.ownerPaid[0].toFixed(1)}K, $${D.ownerPaid[1].toFixed(1)}K and $${D.ownerPaid[2].toFixed(1)}K restated to $${D.replacementSalary.toFixed(1)}K, the market salary for a general manager (2); payroll register.`, 'Documented (wages); market salary per management (2)'],
    ],
  });
  observations(s, bx, y2 + 0.14, bw, [
    ['A', `Reported EBITDA of ${money(T.reported[2])} is net income of ${money(T.netIncome[2])}`, `plus $${D.belowEbitda.interest[2].toFixed(1)}K of interest on vehicle loans and $${D.belowEbitda.da[2].toFixed(1)}K of depreciation, mainly on the ${D.vehicles}-vehicle fleet; as an S corporation the Company pays no entity-level income tax.`],
    ['B', `Normalization add-backs total $${T.normTotal[2].toFixed(1)}K in FY2025, ${pct(100 * T.normTotal[2] / T.revenue[2])} of revenue:`, `$${(A.N1.vals[2] + A.N2.vals[2]).toFixed(1)}K [N1, N2] is documented in the general ledger and $${A.N4.vals[2].toFixed(1)}K [N4] is a management representation. The $${A.N3.vals[1].toFixed(1)}K settlement [N3] was a one-time FY2024 item.`],
    ['C', `[S1] adds back $${A.S1.vals[2].toFixed(1)}K in FY2025:`, `W-2 wages of $${D.ownerPaid[2].toFixed(1)}K less a $${D.replacementSalary.toFixed(1)}K market salary for a general manager. It is ${pct(100 * A.S1.vals[2] / T.totalAdj25, 0)} of total adjustments, so the replacement-hire assumption drives the result.`],
    ['D', `SDE of ${money(T.sde[2])} (${pct(sm[2])} of revenue)`, `is Adj. EBITDA plus the $${D.replacementSalary.toFixed(1)}K replacement salary, the measure SBA 7(a) lenders underwrite for a Main Street asset purchase.`],
  ], { rowH: 0.43 });
}

// ---- Page 5: revenue mix and customers -------------------------------------
{
  const s = pptx.addSlide();
  page(s, {
    num: 5,
    section: 'Customers',
    title: `Commercial revenue grew ${pct(growth(D.revenue.commercial[1], D.revenue.commercial[2]))} to ${money(D.revenue.commercial[2])} in FY2025 while the largest customer stayed at ${pct(100 * D.customers[0][3] / T.revenue[2])} of revenue and the top 10 at ${pct(100 * T.top10 / T.revenue[2])}`,
    source: 'Company financial statements (QuickBooks Online), FY2023–FY2025; Company customer list by invoice, FY2025 (ServiceTitan); AMB Advisory analysis.',
    note: 'Figures in USD thousands unless noted. Customers are coded; names are available in the data room after a management meeting. Mix percentages are of total revenue. PM = preventive maintenance; T&M = time and materials.',
    foot: ['Per management; not independently verified.'],
  });
  // Exhibit A: 100% stacked bar (cols 1-6)
  const ax = colX(1), aw = spanW(1, 6);
  const mixPct = (line) => line.map((v, i) => Math.round((100 * v) / T.revenue[i]));
  const share2 = (i) => Math.round((100 * (D.revenue.commercial[i] + D.revenue.agreements[i])) / T.revenue[i]);
  let y = exhibit(s, ax, BAND.top, aw, 'Revenue mix by service line', '(% of revenue)', `Commercial plus agreements: ${share2(0)}% to ${share2(2)}% of revenue`);
  const chartH = 2.6;
  s.addChart(pptx.ChartType.bar, [
    { name: 'Residential', labels: FY, values: mixPct(D.revenue.residential) },
    { name: 'Commercial', labels: FY, values: mixPct(D.revenue.commercial) },
    { name: 'Maintenance agreements', labels: FY, values: mixPct(D.revenue.agreements) },
  ], Object.assign({}, chartBase, {
    x: ax, y, w: aw, h: chartH,
    barGrouping: 'percentStacked',
    chartColors: [C.maroon, C.sand, C.slate],
    dataLabelPosition: 'ctr',
    dataLabelFormatCode: '0"%"',
    dataLabelColor: C.white, // the sand series is patched to ink after write (2.3 trap 3)
    showLegend: true, legendPos: 't',
  }));
  y += chartH + 0.14;
  // Exhibit C: service lines
  y = exhibit(s, ax, y, aw, 'Service lines', '(FY2025, $000s)');
  const svc = [
    ['Residential service and replacement', 'Repairs, system replacements and plumbing service for homeowners', 'Flat-rate pricebook (ServiceTitan); replacement quotes', D.revenue.residential, 'Repeat, not contracted', ''],
    ['Commercial', 'HVAC and plumbing service and PM for property managers, offices and restaurants', 'Annual PM contracts and T&M', D.revenue.commercial, 'PM contracts renew annually', 'C'],
    ['Maintenance agreements', 'Two tune-ups a year, priority scheduling, 15% repair discount', `About $${Math.round(1000 * D.revenue.agreements[2] / D.members)} per member per year`, D.revenue.agreements, `Yes; ${D.renewal}% renewal (1)`, 'D'],
  ];
  textTable(s, {
    x: ax, y, colW: [1.22, 1.62, 1.28, 0.6, 0.42, 0.5, 0.38], head: ['Service line', 'What the customer buys', 'Pricing basis', 'FY2025', '%', 'y/y', 'Obs.'], fontSize: 8, rowH: [0.42, 0.42, 0.42], obsCol: 6,
    aligns: ['left', 'left', 'left', 'right', 'right', 'right', 'center'],
    rows: svc.map((r) => [r[0], r[1], r[2], k(r[3][2], { dollar: true }), pct(100 * r[3][2] / T.revenue[2], 0), pct(growth(r[3][1], r[3][2])), r[5]]),
  });

  // Exhibit B: concentration (cols 7-12)
  const bx = colX(7), bw = spanW(7, 12);
  let y2 = exhibit(s, bx, BAND.top, bw, 'Customer concentration, top 10', '(FY2025, $000s)');
  let cum = 0;
  const custRows = D.customers.map((c, i) => {
    const share = (100 * c[3]) / T.revenue[2];
    cum += share;
    return { type: 'line', label: c[0], vals: [c[1], String(c[2]), k(c[3], { dollar: i === 0 }), pct(share), pct(cum), c[4]], obs: i === 0 ? 'A' : '' };
  });
  y2 = numTable(s, {
    x: bx, y: y2, name: 'Customer', rowH: 0.19,
    cols: [
      { w: 0.9, kind: 'label', group: '' },
      { w: 1.48, kind: 'strtext', head: 'Type', group: '' },
      { w: 0.44, kind: 'num', head: 'Since', group: '' },
      { w: 0.64, kind: 'num', head: 'Revenue', group: '' },
      { w: 0.54, kind: 'num', head: '% total', group: '' },
      { w: 0.54, kind: 'num', head: 'Cum. %', group: '' },
      { w: 1.2, kind: 'strtext', head: 'Basis', group: '' },
      { w: 0.38, kind: 'obs', head: 'Obs.', group: '' },
    ].map((c) => (c.kind === 'strtext' ? Object.assign(c, { kind: 'num', left: true }) : c)),
    rows: custRows.concat([
      { type: 'subtotal', label: 'Top 10', vals: [`${pct(100 * T.top10 / D.revenue.commercial[2], 0)} of commercial`, '', k(T.top10, { dollar: true }), pct(100 * T.top10 / T.revenue[2]), '', ''], obs: 'B' },
      { type: 'line', label: 'Remaining', vals: ['Residential and other', '', k(T.remaining), pct(100 * T.remaining / T.revenue[2]), '', ''] },
      { type: 'key', label: 'Total', vals: ['', '', k(T.revenue[2], { dollar: true }), '100.0%', '', ''] },
    ]),
  });
  observations(s, bx, y2 + 0.14, bw, [
    ['A', `The largest customer, C-001, is ${pct(100 * D.customers[0][3] / T.revenue[2])} of FY2025 revenue (${money(D.customers[0][3])}):`, `a four-location restaurant group served since ${D.customers[0][2]} on a preventive-maintenance contract plus time-and-materials repairs.`],
    ['B', `The top 10 customers are ${pct(100 * T.top10 / T.revenue[2])} of revenue and all commercial;`, `they are ${pct(100 * T.top10 / D.revenue.commercial[2], 0)} of commercial revenue, so the commercial line rests on relationships the owner personally holds (page 7).`],
    ['C', `Commercial revenue grew from ${money(D.revenue.commercial[0])} to ${money(D.revenue.commercial[2])} in two years (${pct(cagr(D.revenue.commercial[0], D.revenue.commercial[2], 2))} CAGR),`, `driven by annual preventive-maintenance contracts with property managers and four restaurant groups; two property managers have requested quotes on additional buildings (1).`],
    ['D', `Maintenance agreements produced ${money(D.revenue.agreements[2])} (9% of revenue) from ${D.members.toLocaleString('en-US')} members`, `at about $${Math.round(1000 * D.revenue.agreements[2] / D.members)} each; the ${D.renewal}% renewal rate feeds residential repair and replacement leads (1).`],
  ], { rowH: 0.43 });
}

// ---- Page 6: operations and team (text-led) --------------------------------
{
  const s = pptx.addSlide();
  page(s, {
    num: 6,
    section: 'Operations and people',
    title: `An 11-year operations manager runs dispatch for ${D.fieldStaff} field staff and ${D.vehicles} vehicles from an 8,000 sq ft shop leased through 2029`,
    source: 'Management; payroll register; lease agreement; Company financial statements (QuickBooks Online), FY2025; AMB Advisory analysis.',
    note: 'Headcount as of September 2026. Employees other than management are described by role only. Figures in USD thousands unless noted.',
    foot: ['Per management; not independently verified.', 'The Seller prefers a buyer who retains the Ridgeline name and all employees.'],
  });
  const ax = colX(1), aw = spanW(1, 7);
  const para = (lead, body, last) => [run(lead + ' ', { bold: true, fontSize: 9.5, color: C.ink }), run(body, { fontSize: 9.5, color: C.ink, breakLine: !last })];
  const revPerEmp = T.revenue[2] / D.employees, revPerField = T.revenue[2] / D.fieldStaff;
  const prose = [].concat(
    para('Management and staffing.', `Ridgeline employs ${D.employees} people: 14 service technicians, a 4-person install crew, an operations manager, 3 customer service and dispatch staff, a bookkeeper and the owner. Lisa Tran, the operations manager, has been with the Company 11 years, runs dispatch and daily scheduling in ServiceTitan, and is expected to stay after closing. Technicians are paid hourly plus a spiff on each maintenance agreement sold, which is how ${D.members.toLocaleString('en-US')} memberships were built without a dedicated sales role; there is no union. Revenue per field employee was $${revPerField.toFixed(1)}K in FY2025.`),
    para('Owner role and transition.', `Mark Delaney founded the Company in 2009. He works about 45 hours a week on estimating large replacements, commercial relationships, vendor terms and hiring (1). He is retiring at 61, will remain full time for up to 12 months after closing, and will introduce each commercial account to the buyer; page 7 sets out who assumes each responsibility.`),
    para('Fleet, facility and systems.', `The Company runs 18 service vans and 2 install trucks, all owned and financed with vehicle loans. It operates from an 8,000 sq ft leased shop and office on Maple Ave in Columbus; the lease runs through 2029 with a 5-year renewal option, the landlord is unrelated to the owner and rent was $${D.opex.rent[2].toFixed(1)}K in FY2025. ServiceTitan handles dispatch, invoicing and memberships and QuickBooks Online the accounting.`),
    para('Suppliers and reputation.', `Ridgeline has been a Carrier Factory Authorized Dealer since 2015 and buys Carrier equipment through the local distributor, with parts from Ferguson and Johnstone Supply. It holds a 4.8 Google rating from more than 900 reviews. Most leads arrive by referral and search rather than paid advertising, which was $${D.opex.marketing[2].toFixed(1)}K in FY2025 (${pct(100 * D.opex.marketing[2] / T.revenue[2])} of revenue) (1).`, true),
  );
  const exhibitY = 4.62;
  text(s, prose, { x: ax, y: BAND.top, w: aw, h: exhibitY - 0.12 - BAND.top, fontSize: 9.5, valign: 'top', lineSpacingMultiple: 1.08, paraSpaceAfter: 7 });

  // Exhibit A: operating cost ratios under the prose (the field-labor evidence page 7 relies on)
  const r = (line) => margin(line, T.revenue);
  const fieldLabor = addv(D.opex.techWages, D.cogs.directLabor);
  const ratioRow = (type, label, m, driver) => ({ type, label, vals: [pct(m[0]), pct(m[1]), pct(m[2]), delta(m[0], m[2]), driver] });
  let yA = exhibit(s, ax, exhibitY, aw, 'Operating cost ratios', '(% of revenue)');
  numTable(s, {
    x: ax, y: yA, name: 'Cost line', rowH: 0.195,
    cols: [
      { w: 2.3, kind: 'label', group: '' },
      { w: 0.66, kind: 'num', head: FY[0], group: '' }, { w: 0.66, kind: 'num', head: FY[1], group: '' }, { w: 0.66, kind: 'num', head: FY[2], group: '' },
      { w: GAP, kind: 'gap' },
      { w: 0.75, kind: 'num', head: 'FY23–25', group: '' },
      { w: GAP, kind: 'gap' },
      { w: 1.98, kind: 'num', left: true, head: 'Basis', group: '' },
    ],
    rows: [
      ratioRow('line', 'Technician wages and benefits', r(D.opex.techWages), 'Hourly plus agreement spiffs'),
      ratioRow('line', 'Direct labor and subcontractors', r(D.cogs.directLabor), 'Install crew; cost of revenue'),
      ratioRow('subtotal', 'Field labor', r(fieldLabor), `${D.fieldStaff} field staff, no union`),
      ratioRow('line', 'Vehicle, fuel and maintenance', r(D.opex.vehicle), `${D.vehicles} owned vehicles`),
      ratioRow('line', 'Rent and occupancy', r(D.opex.rent), 'Fixed lease through 2029'),
      ratioRow('line', 'Marketing and advertising', r(D.opex.marketing), 'Referrals and reviews (1)'),
    ],
  });

  // Exhibit B: organization (cols 8-12)
  const bx = colX(8), bw = spanW(8, 12);
  let y2 = exhibit(s, bx, BAND.top, bw, 'Organization and tenure', '(#)');
  y2 = textTable(s, {
    x: bx, y: y2, colW: [1.62, 0.48, 1.6, +(bw - 3.7).toFixed(3)], head: ['Role', 'Count', 'Tenure and pay basis', 'Post-close'], fontSize: 8, rowH: [0.3, 0.3, 0.2, 0.3, 0.3, 0.2, 0.2], totalRow: 6,
    aligns: ['left', 'right', 'left', 'left'],
    rows: [
      ['Owner and founder (Mark Delaney)', '1', 'Since 2009; about 45 hrs/week', 'Retiring; full time for up to 12 months'],
      ['Operations manager (Lisa Tran)', '1', '11 years; dispatch and scheduling', 'Expected to stay'],
      ['Service technicians', '14', 'Hourly plus agreement spiffs', 'Continue (2)'],
      ['Install crew', '4', 'Hourly; replacements and commercial installs', 'Continue (2)'],
      ['Customer service and dispatch', '3', 'Hourly; ServiceTitan call board', 'Continue (2)'],
      ['Bookkeeper', '1', 'QuickBooks Online', 'Continue (2)'],
      ['Total', String(D.employees), '', ''],
    ],
  });
  // Exhibit C: facilities, fleet and systems
  let y3 = exhibit(s, bx, y2 + 0.16, bw, 'Facilities, fleet and systems', '');
  textTable(s, {
    x: bx, y: y3, colW: [1.0, 2.45, +(bw - 3.45).toFixed(3)], head: ['Item', 'Detail', 'Term or status'], fontSize: 8, rowH: [0.32, 0.32, 0.32, 0.32, 0.32, 0.32],
    rows: [
      ['Shop and office', '8,000 sq ft on Maple Ave, Columbus; landlord unrelated to the owner', 'Lease through 2029; 5-year renewal option'],
      ['Fleet', '18 service vans and 2 install trucks, owned', `Vehicle loans; interest $${D.belowEbitda.interest[2].toFixed(1)}K in FY2025`],
      ['Software', 'ServiceTitan (dispatch, invoicing, memberships); QuickBooks Online', 'Job-level records tie to invoices'],
      ['Equipment and parts', 'Carrier equipment via the local distributor; parts from Ferguson and Johnstone Supply', 'Carrier Factory Authorized Dealer since 2015'],
      ['Service area', 'Franklin, Delaware and Licking counties, about a 35-mile radius', 'Residential and light commercial'],
      ['Reputation', '4.8 Google rating from 900+ reviews', 'Referrals and search are the main lead sources (1)'],
    ],
  });
}

// ---- Page 7: considerations for buyers -------------------------------------
{
  const s = pptx.addSlide();
  const A = D.adjustments;
  const fieldLabor = [1, 2].map((i) => D.opex.techWages[i] + D.cogs.directLabor[i]);
  const fieldPct = [1, 2].map((i, j) => (100 * fieldLabor[j]) / T.revenue[i]);
  page(s, {
    num: 7,
    section: 'Considerations for buyers',
    title: `Buyers will test five items, led by the owner’s 45-hour week and a ${pct(100 * T.top10 / T.revenue[2])} top-10 customer share; each has a quantified answer`,
    source: 'Company financial statements (QuickBooks Online), FY2023–FY2025; Company customer list by invoice, FY2025; Management; AMB Advisory analysis.',
    note: 'Figures in USD thousands unless noted. Adjustment references [N1]–[N4] and [S1] are defined on page 4.',
    foot: ['Per management; not independently verified. Hours are the owner’s estimate of a typical week.', 'Technician hire dates by employee are provided in the data room.'],
  });
  const ax = colX(1), aw = spanW(1, 12);
  let y = exhibit(s, ax, BAND.top, aw, 'Considerations for buyers', '(FY2025 unless noted)');
  y = textTable(s, {
    x: ax, y, colW: [1.7, 5.4, +(aw - 7.1).toFixed(3)], head: ['Consideration', 'What the data shows', 'How it is addressed'], fontSize: 8.5, rowH: [0.5, 0.5, 0.5, 0.5, 0.5],
    rows: [
      ['Owner involvement', `The owner works about 45 hours a week on estimating large replacements, commercial relationships, vendor terms and hiring (1); the top 10 customers (${pct(100 * T.top10 / T.revenue[2])} of revenue) are relationships he holds.`, `The operations manager (11 years) runs dispatch and scheduling. The owner remains full time for up to 12 months and introduces each commercial account. Adj. EBITDA already carries a $${D.replacementSalary.toFixed(1)}K general-manager salary [S1].`],
      ['Customer concentration', `The largest customer is ${pct(100 * D.customers[0][3] / T.revenue[2])} of revenue and the top 10 are ${pct(100 * T.top10 / T.revenue[2])}, all commercial; residential is 64% of revenue across individually small tickets.`, `Losing C-001 in full would remove ${money(D.customers[0][3])} of revenue, less than 40% of one year’s growth ($${(T.revenue[2] - T.revenue[1]).toFixed(1)}K in FY2025). Nine of the top 10 have been customers for four years or more.`],
      ['Technician labor', `Field labor (technician wages plus installation labor and subcontractors) was $${fieldLabor[1].toFixed(1)}K, ${pct(fieldPct[1])} of revenue, in a market where technicians are scarce; pay is hourly plus spiffs and there is no union.`, `Field labor fell from ${pct(fieldPct[0])} of revenue in FY2024 to ${pct(fieldPct[1])} while revenue grew ${pct(growth(T.revenue[1], T.revenue[2]))}. The operations manager’s 11-year tenure is the retention evidence in hand; technician tenure is in the data room (2).`],
      ['Add-back quality', `FY2025 adjustments total $${T.totalAdj25.toFixed(1)}K: $${A.S1.vals[2].toFixed(1)}K owner compensation [S1], $${(A.N1.vals[2] + A.N2.vals[2]).toFixed(1)}K documented in the general ledger [N1, N2] and $${A.N4.vals[2].toFixed(1)}K from card statements [N4]. Adj. EBITDA is ${pct(growth(T.reported[2], T.adjusted[2]), 0)} above Reported EBITDA.`, `Each adjustment is listed with its basis and evidence on page 4. The general ledger, payroll register and card statements are in the data room. Excluding [N4] entirely moves the Adj. EBITDA margin by ${Math.round(10000 * A.N4.vals[2] / T.revenue[2])} bps.`],
      ['Lead generation', `Paid marketing was $${D.opex.marketing[2].toFixed(1)}K (${pct(100 * D.opex.marketing[2] / T.revenue[2])} of revenue); leads come from referrals, the 4.8 Google rating (900+ reviews) and the Carrier dealer program, so demand depends on reputation rather than a purchased funnel.`, `The ${D.members.toLocaleString('en-US')} maintenance agreements schedule about ${(2 * D.members).toLocaleString('en-US')} tune-up visits a year and generate repair and replacement leads at an ${D.renewal}% renewal rate. Agreements are offered on about 35% of service calls today (1).`],
    ],
  });
  // Exhibit B: owner responsibilities (cols 1-7)
  const bw1 = spanW(1, 7);
  let y2 = exhibit(s, ax, y + 0.16, bw1, 'Owner responsibilities and transition', '(hours per week) (1)');
  const resp = [
    ['Estimating large replacements', '~14', 'General manager (or a senior technician)', 'Owner joins estimates, 12 months', 'A'],
    ['Commercial relationships', '~10', 'General manager', 'Owner introduces each account', 'A'],
    ['Vendor terms and purchasing', '~6', 'Operations manager', 'Supplier contacts transferred', 'B'],
    ['Hiring and staffing', '~5', 'Operations manager and general manager', 'Owner supports interviews', 'B'],
    ['Finance and administration', '~10', 'Bookkeeper and general manager', 'System access at closing', 'B'],
    ['Total', '~45', '', '', ''],
  ];
  textTable(s, {
    x: ax, y: y2, colW: [1.95, 0.5, 2.35, 1.95, 0.4], head: ['Responsibility', 'Hrs/wk', 'Who assumes it post-close', 'Transition support', 'Obs.'], fontSize: 8, rowH: [0.21, 0.21, 0.21, 0.21, 0.21, 0.21], obsCol: 4, totalRow: 5,
    aligns: ['left', 'right', 'left', 'left', 'center'],
    rows: resp,
  });
  // Key observations (cols 8-12)
  const bx = colX(8), bw = spanW(8, 12);
  observations(s, bx, y + 0.16, bw, [
    ['A', 'Estimating and commercial work, about 24 of 45 hours,', `are the general-manager role that [S1] prices at $${D.replacementSalary.toFixed(1)}K; a buyer who does this work personally underwrites SDE of ${money(T.sde[2])} rather than Adj. EBITDA of ${money(T.adjusted[2])}.`],
    ['B', 'The other 21 hours pass to staff already in place:', 'the operations manager takes purchasing and hiring, and the bookkeeper the financial routine, each with the general manager. No new hire beyond the manager is assumed.'],
    ['C', 'The 12-month transition spans one full season cycle,', 'so the buyer prices one summer cooling peak and one winter heating peak of replacement work with the owner still estimating.'],
  ], { rowH: 0.47 });
}

// ---------------------------------------------------------------------------
// 7. Write, then patch chart XML: per-series data-label colour (white inside
//    7B0000 and 5E5552, ink inside C49A5B) and thin white gaps between stacked
//    segments (HOUSE_STYLE.md 2.3 trap 3, 2.6). pptxgenjs exposes neither.
// ---------------------------------------------------------------------------
function setSeriesLabelColor(xml, seriesName, color) {
  return xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (ser) => {
    if (!ser.includes(`<c:v>${seriesName}</c:v>`)) return ser;
    return ser.replace(/(<c:dLbls>[\s\S]*?<a:srgbClr val=")[0-9A-Fa-f]{6}("\/>)/, `$1${color}$2`);
  });
}
function addSeriesOutline(xml, color, emu) {
  return xml.replace(/(<c:ser>[\s\S]*?<c:spPr><a:solidFill><a:srgbClr val="[0-9A-Fa-f]{6}"\/><\/a:solidFill>)/g, `$1<a:ln w="${emu}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln>`);
}
async function patchCharts(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
  for (const f of names) {
    let xml = await zip.file(f).async('string');
    if (xml.includes('<c:v>Maintenance agreements</c:v>') && xml.includes('percentStacked')) {
      xml = setSeriesLabelColor(xml, 'Commercial', C.ink); // sand fill takes ink labels
      xml = addSeriesOutline(xml, C.white, 9525); // 0.75 pt white gaps between segments
    }
    zip.file(f, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

(async () => {
  const buf = await pptx.write({ outputType: 'nodebuffer' });
  const patched = await patchCharts(buf);
  fs.writeFileSync(OUT, patched);
  console.log('wrote', OUT, `${(patched.length / 1024).toFixed(0)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
