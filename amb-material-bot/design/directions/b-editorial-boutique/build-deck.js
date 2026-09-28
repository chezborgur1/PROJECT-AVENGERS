#!/usr/bin/env node
/*
 * AMB Advisory Services: CIM deck system, Direction B "Editorial boutique".
 * Sample deal: Project Ridgeline (fictional). Seven pages.
 *
 * Self-contained pptxgenjs generator. Run:  node build-deck.js
 * Writes deck.pptx next to this file. Logos (tight-cropped from brand/) sit next to this file.
 */
// ES module (the amb-material-bot package is "type": "module"); runs under plain `node` anywhere.
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const localRequire = createRequire(import.meta.url);

// pptxgenjs resolves from this folder's tree, or from the amb-material-bot package three levels up.
function load(mod) {
  try {
    return localRequire(mod);
  } catch (e) {
    return createRequire(path.resolve(HERE, "../../../package.json"))(mod);
  }
}
const PptxGenJS = load("pptxgenjs");
let JSZip = null;
try { JSZip = load("jszip"); } catch (e) { JSZip = null; }
const OUT = path.join(HERE, "deck.pptx");
const LOGO = path.join(HERE, "amb-logo-tight.png");
const LOGO_W = path.join(HERE, "amb-logo-white-tight.png");
const LOGO_AR = 1862 / 606;

// ---------------------------------------------------------------- tokens (HOUSE_STYLE 1.2, 2.6)
const C = {
  maroon: "7B0000", ink: "2C2523", muted: "7A706D", rule: "C2BAB8", section: "FFE1E1", tint: "F5EDEC",
  onMaroon: "E9D3D5", gold: "C9A227", white: "FFFFFF", rose: "B5727A", sand: "C49A5B", slate: "5E5552", blush: "DCC7C4",
};
const SERIF = "Georgia", SANS = "Arial";

// ---------------------------------------------------------------- grid (Direction B)
const PW = 13.333, PH = 7.5;
const M = 0.45;                 // page side margin
const RX = PW - M;              // right edge of content, 12.883
const CW = RX - M;              // 12.433
const MG = { x: M, w: 1.60 };   // structural margin column
const VRULE_X = 2.15;           // maroon vertical rule, centred in the 0.20 gutter
const BX = 2.25;                // body left
const BW = RX - BX;             // 10.633 body width
const TITLE_Y = 0.20, TITLE_H = 0.84;   // bottom-anchored, Georgia Bold 22, two lines at most
const DECK_Y = 1.08, DECK_H = 0.26;     // Georgia Regular 11.5 maroon, one line, beside the section tracker
const TRULE_Y = 1.40;
const BODY_Y = 1.56, BODY_END = 6.50;
const NOTES_Y = 6.56, NOTES_END = 6.94;
const FRULE_Y = 7.00, FOOT_Y = 7.06, FOOT_H = 0.24;

const NONE = { type: "none" };
const noBorder = () => [NONE, NONE, NONE, NONE];
const rule = (pt, color) => ({ type: "solid", pt, color });

// ---------------------------------------------------------------- number formatting
const fmt1 = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (n, dollar) => {
  if (n === 0) return "–";
  const s = fmt1(Math.abs(n));
  return n < 0 ? `(${dollar ? "$" : ""}${s})` : `${dollar ? "$" : ""}${s}`;
};
const pct1 = (x) => (x * 100).toFixed(1) + "%";
const cagr = (a, b, yrs) => Math.pow(b / a, 1 / yrs) - 1;

// ---------------------------------------------------------------- Project Ridgeline sample data (fictional)
const FY = ["FY2023", "FY2024", "FY2025"];
const rev = [2406.8, 2718.6, 3040.8];
const gm = [0.61, 0.615, 0.619];
const gp = rev.map((r, i) => Math.round(r * gm[i] * 10) / 10);           // 1468.1 1671.9 1882.3
const cogs = rev.map((r, i) => Math.round((r - gp[i]) * 10) / 10);       // 938.7 1046.7 1158.5
const repEbitda = [157.0, 212.2, 316.4];
const opex = gp.map((g, i) => Math.round((g - repEbitda[i]) * 10) / 10); // 1311.1 1459.7 1565.9
const ownerPaid = [180, 190, 200];
const REPL = 95;
const adj = {
  S1: [85, 95, 105],
  N1: [16, 17, 18],
  N2: [5, 6, 7.5],
  N3: [0, 24, 0],
  N4: [0, 0, 6],
};
const adjTotal = [0, 1, 2].map((i) => adj.S1[i] + adj.N1[i] + adj.N2[i] + adj.N3[i] + adj.N4[i]); // 106 142 136.5
const adjEbitda = [263.0, 354.2, 452.9];
const sde = [358.0, 449.2, 547.9];
const mix = { res: 0.64, com: 0.27, mnt: 0.09 };
const mixRev = { res: 1946.1, com: 821.0, mnt: 273.7 };

// sanity: the schedule must tie to the stated totals
[0, 1, 2].forEach((i) => {
  const a = Math.round((repEbitda[i] + adjTotal[i]) * 10) / 10;
  if (Math.abs(a - adjEbitda[i]) > 0.05) throw new Error(`Adj. EBITDA does not tie in ${FY[i]}: ${a} vs ${adjEbitda[i]}`);
  if (Math.abs(adjEbitda[i] + REPL - sde[i]) > 0.05) throw new Error(`SDE does not tie in ${FY[i]}`);
});

// ---------------------------------------------------------------- presentation
const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
pres.author = "AMB Advisory Services LLC";
pres.company = "AMB Advisory Services LLC";
pres.title = "Project Ridgeline: Confidential Information Memorandum";

// ---------------------------------------------------------------- page furniture
function text(s, t, o) {
  s.addText(t, Object.assign({ isTextBox: true, margin: 0, fontFace: SANS, color: C.ink }, o));
}
function hline(s, x, y, w, pt, color) {
  s.addShape("line", { x, y, w, h: 0, line: { color, width: pt } });
}
function vline(s, x, y, h, pt, color) {
  s.addShape("line", { x, y, w: 0, h, line: { color, width: pt } });
}

/**
 * Content page furniture: title (full width), deck, title rule, margin column (section, topic,
 * footnotes), vertical maroon rule, notes band under the body, footer.
 */
function page(s, p) {
  s.background = { color: C.white };
  // title across the full measure; the deck row below it is split: section tracker in the margin, deck in the body column
  text(s, p.title, { x: M, y: TITLE_Y, w: CW, h: TITLE_H, fontFace: SERIF, fontSize: 22, bold: true, color: C.maroon, valign: "bottom", fit: "none", lineSpacingMultiple: 1.0 });
  text(s, [
    { text: p.section, options: { bold: true, color: C.maroon, breakLine: true } },
    { text: p.topic, options: { color: C.muted } },
  ], { x: MG.x, y: DECK_Y, w: MG.w, h: DECK_H, fontSize: 8, valign: "middle", lineSpacingMultiple: 1.1 });
  text(s, p.deck, { x: BX, y: DECK_Y, w: BW, h: DECK_H, fontFace: SERIF, fontSize: 11.5, color: C.maroon, valign: "middle" });
  hline(s, M, TRULE_Y, CW, 0.75, C.maroon);
  // margin column rule, from the title rule down through the notes band
  vline(s, VRULE_X, TRULE_Y, NOTES_END - TRULE_Y, 0.75, C.maroon);
  if (p.footnotes && p.footnotes.length) {
    const runs = p.footnotes.map((f, i) => ({ text: f, options: { breakLine: i < p.footnotes.length - 1, paraSpaceAfter: 3 } }));
    text(s, runs, { x: MG.x, y: 4.30, w: MG.w, h: NOTES_END - 4.30, fontSize: 7, color: C.muted, valign: "bottom", lineSpacingMultiple: 1.0 });
  }
  // notes band under the body
  const notes = [];
  if (p.source) notes.push({ text: p.source, options: { breakLine: true } });
  if (p.note) notes.push({ text: p.note, options: {} });
  if (notes.length) {
    notes[notes.length - 1].options.breakLine = false;
    text(s, notes, { x: BX, y: NOTES_Y, w: BW, h: NOTES_END - NOTES_Y, fontSize: 7, color: C.muted, valign: "bottom", lineSpacingMultiple: 1.0 });
  }
  // footer
  hline(s, M, FRULE_Y, CW, 0.5, C.rule);
  text(s, "Project Ridgeline", { x: M, y: FOOT_Y, w: 4, h: FOOT_H, fontSize: 7.5, color: C.muted, valign: "middle" });
  text(s, "Strictly private and confidential", { x: (PW - 4) / 2, y: FOOT_Y, w: 4, h: FOOT_H, fontSize: 7.5, color: C.muted, align: "center", valign: "middle" });
  const lh = 0.22, lw = lh * LOGO_AR;
  s.addImage({ path: LOGO, x: 12.30 - lw, y: FOOT_Y + (FOOT_H - lh) / 2, w: lw, h: lh });
  text(s, String(p.num), { x: RX - 0.45, y: FOOT_Y, w: 0.45, h: FOOT_H, fontSize: 8, color: C.ink, align: "right", valign: "middle" });
}

/** Exhibit header in the body plus its label in the margin column. Returns the y where the exhibit body starts. */
function exhibit(s, n, title, units, x, y, w, opt = {}) {
  const annW = opt.annW || 1.8;
  text(s, [
    { text: title, options: { bold: true, color: C.ink } },
    { text: units ? "  " + units : "", options: { color: C.muted } },
  ], { x, y, w: opt.annotation ? w - annW : w, h: 0.22, fontSize: 9.5, valign: "bottom" });
  if (opt.annotation) text(s, opt.annotation, { x: x + w - annW, y, w: annW, h: 0.22, fontSize: 7.5, color: C.muted, align: "right", valign: "bottom" });
  hline(s, x, y + 0.25, w, 0.5, C.ink);
  // margin label, aligned to the exhibit's top; two exhibits on one row stack their labels in order
  let ly = y + 0.02;
  s._slots = s._slots || [];
  s._slots.forEach((prev) => { if (Math.abs(ly - prev) < 0.40) ly = prev + 0.40; });
  s._slots.push(ly);
  text(s, [
    { text: `Exhibit ${n}`, options: { bold: true, color: C.ink, breakLine: true } },
    { text: opt.coverage || "", options: { color: C.muted } },
  ], { x: MG.x, y: ly, w: MG.w, h: 0.36, fontSize: 7.5, valign: "top", lineSpacingMultiple: 1.1 });
  return y + 0.33;
}

/** Warm-neutral exhibit panel (charts and fact tables). Square corners, no line. */
function panel(s, x, y, w, h) {
  s.addShape("rect", { x, y, w, h, fill: { color: C.tint }, line: { color: C.tint, width: 0 } });
}

/** Bold-lead bullets, maroon square glyph (colour set in post-processing). */
function bullets(s, items, x, y, w, h, size = 9.5) {
  const runs = [];
  items.forEach(([lead, rest], i) => {
    runs.push({ text: lead + " ", options: { bold: true, bullet: { characterCode: "25AA", indent: 11 }, paraSpaceAfter: 5 } });
    runs.push({ text: rest, options: { breakLine: i < items.length - 1 } });
  });
  text(s, runs, { x, y, w, h, fontSize: size, valign: "top", lineSpacingMultiple: 1.08 });
}

/** Paragraphs with a bold lead-in (text-led pages). */
function paragraphs(s, items, x, y, w, h, size = 9.5) {
  const runs = [];
  items.forEach(([lead, rest], i) => {
    runs.push({ text: lead + " ", options: { bold: true, paraSpaceAfter: 6 } });
    runs.push({ text: rest, options: { breakLine: i < items.length - 1 } });
  });
  text(s, runs, { x, y, w, h, fontSize: size, valign: "top", lineSpacingMultiple: 1.10 });
}

/** One callout per page at most: tint fill, 2.25 pt maroon left rule, AMB lead-in. */
function callout(s, lead, body, x, y, w, h) {
  panel(s, x, y, w, h);
  s.addShape("rect", { x, y, w: 0.03, h, fill: { color: C.maroon }, line: { color: C.maroon, width: 0 } });
  text(s, [
    { text: lead + " ", options: { bold: true, color: C.maroon } },
    { text: body, options: { color: C.ink } },
  ], { x: x + 0.14, y, w: w - 0.24, h, fontSize: 9.5, valign: "middle", lineSpacingMultiple: 1.08 });
}

// ---------------------------------------------------------------- table cell helpers
const cell = (t, o = {}) => ({ text: t, options: Object.assign({ border: noBorder(), fontFace: SANS }, o) });
const hdr = (t, o = {}) => cell(t, Object.assign({ fill: { color: C.maroon }, color: C.white, bold: true, fontSize: 8, align: "right", valign: "middle" }, o));
const gap = (bg = C.white) => cell("", { fill: { color: bg } });
const num = (t, o = {}) => cell(t, Object.assign({ align: "right" }, o));
const lab = (t, o = {}) => cell(t, Object.assign({ align: "left" }, o));

function numericRow(label, vals, extra, o = {}) {
  // o.kind: "line" | "sub" | "key" | "hi" | "ratio" | "section"
  const kind = o.kind || "line";
  const base = {};
  let border = noBorder();
  if (kind === "sub") { base.bold = true; border = [rule(0.5, C.ink), NONE, NONE, NONE]; }
  if (kind === "key") { base.bold = true; border = [rule(0.75, C.maroon), NONE, rule(0.75, C.maroon), NONE]; }
  if (kind === "hi") { base.bold = true; base.fill = { color: C.maroon }; base.color = C.white; }
  if (kind === "ratio") { base.italic = true; }
  // indent grammar: line items 2 spaces, sub-lines and ratio rows 4, subtotals and key totals flush
  const indent = o.indent === undefined ? (kind === "ratio" ? "    " : kind === "line" ? "  " : "") : o.indent;
  const row = [lab(indent + label, Object.assign({ border: border.slice() }, base, o.labelOpts || {}))];
  vals.forEach((v) => row.push(num(v, Object.assign({ border: border.slice() }, base))));
  if (extra) {
    row.push(gap(o.bg || C.white));
    extra.forEach((v) => row.push(num(v, Object.assign({ border: border.slice() }, base))));
  }
  return row;
}

// ================================================================ 1. COVER
{
  const s = pres.addSlide();
  s.background = { color: C.maroon };
  s.addImage({ path: LOGO_W, x: 0.70, y: 0.62, w: 2.40, h: 2.40 / LOGO_AR });
  text(s, "Project Ridgeline", { x: 0.70, y: 2.95, w: 10.5, h: 0.95, fontFace: SERIF, fontSize: 44, color: C.white, valign: "bottom", fit: "none" });
  hline(s, 0.72, 4.05, 2.0, 1, C.gold);
  text(s, "Confidential Information Memorandum", { x: 0.70, y: 4.18, w: 10, h: 0.36, fontSize: 16, color: C.white, valign: "middle" });
  text(s, "Residential and commercial HVAC and plumbing services  |  Columbus, Ohio", { x: 0.70, y: 4.58, w: 10, h: 0.26, fontSize: 11, color: C.onMaroon, valign: "middle" });
  text(s, "September 2026", { x: 0.70, y: 4.86, w: 10, h: 0.26, fontSize: 11, color: C.onMaroon, valign: "middle" });
  text(s, "Strictly private and confidential. Prepared by AMB Advisory Services LLC for recipients who have executed a confidentiality agreement with AMB Advisory.",
    { x: 0.70, y: 6.72, w: 11.5, h: 0.30, fontSize: 8, color: C.onMaroon, valign: "middle" });
}

// ================================================================ 2. EXECUTIVE SUMMARY
{
  const s = pres.addSlide();
  page(s, {
    num: 2, section: "Executive summary", topic: "Company at a glance",
    title: "Ridgeline grew revenue at a 12.4% CAGR to $3.04M and Adj. EBITDA to $453K (14.9%) in FY2025",
    deck: "A 24-person HVAC and plumbing contractor in Columbus, Ohio, offered as an asset sale by a retiring founder.",
    source: "Source: Company financial statements (QuickBooks Online), FY2023–FY2025; ServiceTitan membership and customer reports; Management; AMB Advisory analysis.",
    note: "Note: Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited. Fiscal year ends December 31.",
    footnotes: [
      "(1) Adj. EBITDA and SDE are non-GAAP measures; the reconciliation to Reported EBITDA is on page 4.",
      "(2) Per management; not independently verified.",
    ],
  });

  // text column
  const TX = BX, TW = 5.05;
  paragraphs(s, [
    ["Overview.", "Ridgeline Comfort Services LLC (“Ridgeline” or the “Company”) is a residential and light-commercial HVAC and plumbing contractor based in Columbus, Ohio, serving Franklin, Delaware and Licking counties within about a 35-mile radius. The Company was founded in 2009 by Mark Delaney after 12 years as a lead technician at a regional HVAC contractor; plumbing service was added in 2019. It employs 24 people: 14 service technicians, a 4-person install crew, 3 customer service and dispatch staff, an operations manager, a bookkeeper and the owner. Ridgeline holds 1,450 active maintenance-agreement members and serves commercial accounts that include property managers, small office buildings and four restaurant groups; the largest customer is about 4% of revenue. FY2025 revenue of $3.04M was 64% residential service and replacement, 27% commercial and 9% maintenance agreements. The Company is an S corporation wholly owned by Mr. Delaney, who is retiring at 61."],
    ["Earnings.", "Reported EBITDA of $316.4K in FY2025 understates the earnings available to a buyer because the owner was paid $200K against a $95K replacement salary and the books carry $31.5K of personal and nonrecurring expense. Adj. EBITDA was $452.9K (14.9% margin) and SDE $547.9K; the schedule on page 4 lists each adjustment with its evidence (1)."],
    ["Transaction.", "The owner is offering substantially all of the operating assets of Ridgeline, free and clear of liens; the Seller retains cash, receivables and payables. The Ridgeline name, the 24 employees and the Maple Ave lease (through 2029 with a 5-year option) transfer with the business. The owner has offered up to 12 months of full-time transition, including introductions to each commercial account, and the operations manager (11 years) is expected to remain (2). The Seller is targeting a closing within 12 months."],
  ], TX, BODY_Y, TW, BODY_END - BODY_Y);

  // Quick Stats block (tint panel with two tables)
  const QX = BX + TW + 0.30, QW = RX - QX;   // 7.60 -> 12.883, w 5.28
  const PY = BODY_Y - 0.02;
  panel(s, QX - 0.12, PY, QW + 0.12, BODY_END - PY);
  let y = exhibit(s, 1, "Quick Stats: financial", "($000s)", QX, BODY_Y + 0.06, QW - 0.12, { coverage: "Fiscal years to December 31" });
  const fin = [
    [hdr("Metric", { align: "left" }), hdr("FY2023"), hdr("FY2024"), hdr("FY2025"), gap(C.tint), hdr("CAGR")],
    numericRow("Revenue", rev.map((v) => money(v, true)), [pct1(cagr(rev[0], rev[2], 2))], { kind: "line", indent: "", bg: C.tint }),
    numericRow("% growth", ["n.a.", pct1(rev[1] / rev[0] - 1), pct1(rev[2] / rev[1] - 1)], [""], { kind: "ratio", indent: "  ", bg: C.tint }),
    numericRow("Gross margin", gm.map(pct1), [""], { kind: "ratio", indent: "", bg: C.tint }),
    numericRow("Reported EBITDA", repEbitda.map((v) => money(v, true)), [pct1(cagr(repEbitda[0], repEbitda[2], 2))], { kind: "line", indent: "", bg: C.tint }),
    numericRow("Adj. EBITDA (1)", adjEbitda.map((v) => money(v, true)), [pct1(cagr(adjEbitda[0], adjEbitda[2], 2))], { kind: "hi", indent: "", bg: C.tint }),
    numericRow("% margin", adjEbitda.map((v, i) => pct1(v / rev[i])), [""], { kind: "ratio", indent: "  ", bg: C.tint }),
    numericRow("SDE (1)", sde.map((v) => money(v, true)), [pct1(cagr(sde[0], sde[2], 2))], { kind: "key", indent: "", bg: C.tint }),
  ];
  const finW = QW - 0.12;
  const finH = [0.21, 0.195, 0.195, 0.195, 0.195, 0.215, 0.195, 0.215];
  s.addTable(fin, { x: QX, y, w: finW, colW: [finW - 4 * 0.78 - 0.08, 0.78, 0.78, 0.78, 0.08, 0.78], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH: finH, margin: [0, 0.05, 0, 0.05], valign: "middle" });
  y += finH.reduce((a, b) => a + b, 0) + 0.26;

  y = exhibit(s, 2, "Quick Stats: operating", "(as of September 2026)", QX, y, QW - 0.12, { coverage: "Per ServiceTitan and management" });
  const tb = (a, b, c, last) => [
    lab(a, { bold: true, fontSize: 8.5, valign: "top", border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
    num(b, { fontSize: 8.5, valign: "top", border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
    lab(c, { fontSize: 8.5, valign: "top", border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
  ];
  const ops = [
    [hdr("Metric", { align: "left" }), hdr("Value"), hdr("Basis", { align: "left" })],
    tb("Maintenance-agreement members", "1,450", "82% annual renewal (2); 9% of FY2025 revenue"),
    tb("Largest customer", "4%", "Commercial property manager; none above 4%"),
    tb("Employees", "24", "14 technicians, 4 installers, 3 CSR/dispatch, ops manager, bookkeeper, owner"),
    tb("Fleet", "20", "18 service vans and 2 install trucks; owned"),
    tb("Shop and office", "8,000 sq ft", "Leased through 2029 with a 5-year renewal option"),
    tb("Google rating", "4.8", "More than 900 reviews (2)"),
    tb("Carrier Factory Authorized Dealer", "Since 2015", "Equipment through the local Carrier distributor", true),
  ];
  s.addTable(ops, { x: QX, y, w: finW, colW: [2.00, 0.72, finW - 2.72], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH: [0.21, 0.24, 0.24, 0.36, 0.24, 0.24, 0.24, 0.36], margin: [0.03, 0.05, 0.03, 0.05], valign: "top" });
}

// ================================================================ 3. FINANCIAL SUMMARY
{
  const s = pres.addSlide();
  page(s, {
    num: 3, section: "Financial performance", topic: "Income statement summary",
    title: "Revenue grew at a 12.4% CAGR to $3.04M in FY2025 while gross margin held at 61–62%",
    deck: "Operating expenses grew slower than revenue in both years, so Adj. EBITDA margin rose from 10.9% to 14.9%.",
    source: "Source: Company financial statements (QuickBooks Online), FY2023–FY2025; AMB Advisory analysis.",
    note: "Note: Figures in USD thousands. Financials are as provided by the Seller and have not been independently audited. Adj. EBITDA and SDE are non-GAAP measures; see page 4 for the reconciliation to Reported EBITDA.",
    footnotes: [
      "(1) Owner compensation above the $95K replacement salary, personal expenses and one nonrecurring settlement; itemized on page 4.",
    ],
  });

  // Exhibit 1: summary income statement
  const TW = 5.70;
  let y = exhibit(s, 1, "Summary income statement", "($000s)", BX, BODY_Y, TW, { coverage: "Fiscal years to December 31" });
  const cg = (a) => pct1(cagr(a[0], a[2], 2));
  const rows = [
    [hdr("", { align: "left" }), hdr("Fiscal year", { colspan: 3, align: "center" }), gap(), hdr("FY23–25", { align: "center" })],
    [hdr("Income statement", { align: "left" }), hdr("FY2023"), hdr("FY2024"), hdr("FY2025"), gap(), hdr("CAGR")],
    numericRow("Revenue", rev.map((v) => money(v, true)), [cg(rev)], { kind: "line", indent: "" }),
    numericRow("% growth", ["n.a.", pct1(rev[1] / rev[0] - 1), pct1(rev[2] / rev[1] - 1)], [""], { kind: "ratio" }),
    numericRow("Cost of revenue", cogs.map((v) => money(-v)), [cg(cogs)], { kind: "line", indent: "" }),
    numericRow("Gross profit", gp.map((v) => money(v, true)), [cg(gp)], { kind: "sub" }),
    numericRow("% margin", gm.map(pct1), [""], { kind: "ratio" }),
    numericRow("Operating expenses", opex.map((v) => money(-v)), [cg(opex)], { kind: "line", indent: "" }),
    numericRow("of which owner compensation", ownerPaid.map((v) => money(-v)), [cg(ownerPaid)], { kind: "line" }),
    numericRow("Reported EBITDA", repEbitda.map((v) => money(v, true)), [cg(repEbitda)], { kind: "key" }),
    numericRow("% margin", repEbitda.map((v, i) => pct1(v / rev[i])), [""], { kind: "ratio" }),
    numericRow("Normalization adjustments (1)", adjTotal.map((v) => money(v)), [cg(adjTotal)], { kind: "line", indent: "" }),
    numericRow("Adj. EBITDA", adjEbitda.map((v) => money(v, true)), [cg(adjEbitda)], { kind: "hi" }),
    numericRow("% margin", adjEbitda.map((v, i) => pct1(v / rev[i])), [""], { kind: "ratio" }),
    numericRow("(+) Owner replacement salary", [REPL, REPL, REPL].map((v) => money(v)), ["–"], { kind: "line", indent: "" }),
    numericRow("SDE", sde.map((v) => money(v, true)), [cg(sde)], { kind: "key" }),
    numericRow("% margin", sde.map((v, i) => pct1(v / rev[i])), [""], { kind: "ratio" }),
  ];
  const rowH = [0.21, 0.21].concat(rows.slice(2).map((r, i) => (rows[i + 2][0].options.fill ? 0.215 : 0.195)));
  s.addTable(rows, { x: BX, y, w: TW, colW: [TW - 3 * 0.80 - 0.08 - 0.72, 0.80, 0.80, 0.80, 0.08, 0.72], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH, margin: [0, 0.05, 0, 0.05], valign: "middle" });
  const tableEnd = y + rowH.reduce((a, b) => a + b, 0);

  callout(s, "Takeaway:", "Adj. EBITDA grew at a 31.2% CAGR, 2.5 times the revenue CAGR, because operating expenses excluding owner compensation rose 9.9% a year against 12.4% for revenue.",
    BX, tableEnd + 0.20, TW, 0.62);

  // Exhibit 2: two chart panels
  const CX = BX + TW + 0.35, CWd = RX - CX;   // 8.30 -> 12.883
  const PY = BODY_Y - 0.02, PH2 = 2.78;
  panel(s, CX - 0.12, PY, CWd + 0.12, PH2);
  let cy = exhibit(s, 2, "Revenue and Adj. EBITDA", "($000s)", CX, BODY_Y + 0.06, CWd - 0.12, { coverage: "Fiscal years; every bar labelled", annotation: "Margin 10.9% to 14.9%", annW: 1.4 });
  const half = (CWd - 0.12 - 0.20) / 2;
  const chartBase = {
    barDir: "col", chartColors: [C.maroon], barGapWidthPct: 60,
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, valAxisMinVal: 0,
    catAxisLabelFontFace: SANS, catAxisLabelFontSize: 8, catAxisLabelColor: C.muted, catAxisLineShow: true, catAxisLineColor: C.rule, catAxisMajorTickMark: "none",
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: SANS, dataLabelFontSize: 8, dataLabelColor: C.ink, dataLabelFormatCode: "#,##0.0",
    showLegend: false, chartArea: { fill: { color: C.tint } }, plotArea: { fill: { color: C.tint } },
  };
  text(s, "Revenue", { x: CX, y: cy, w: half, h: 0.18, fontSize: 8, color: C.muted, align: "center" });
  text(s, "Adj. EBITDA", { x: CX + half + 0.20, y: cy, w: half, h: 0.18, fontSize: 8, color: C.muted, align: "center" });
  const chH = PY + PH2 - (cy + 0.18) - 0.10;
  s.addChart(pres.charts.BAR, [{ name: "Revenue", labels: FY, values: rev }], Object.assign({ x: CX, y: cy + 0.18, w: half, h: chH, valAxisMaxVal: 3800 }, chartBase));
  s.addChart(pres.charts.BAR, [{ name: "Adj. EBITDA", labels: FY, values: adjEbitda }], Object.assign({ x: CX + half + 0.20, y: cy + 0.18, w: half, h: chH, valAxisMaxVal: 560 }, chartBase));

  bullets(s, [
    ["Both years grew at double digits.", "Revenue rose 13.0% in FY2024 and 11.9% in FY2025, and gross profit grew faster than revenue in each year (13.9% and 12.6%)."],
    ["Gross margin widened 90 bps.", "Cost of revenue grew at an 11.1% CAGR against 12.4% for revenue; parts and equipment come through Ferguson, Johnstone Supply and the local Carrier distributor."],
    ["Expenses grew slower than revenue.", "Operating expenses grew 11.3% in FY2024 and 7.3% in FY2025, both below revenue growth, and Reported EBITDA margin rose from 6.5% to 10.4%."],
    ["Owner pay sits inside operating expenses.", "The owner drew $200K in FY2025 against a $95K replacement salary; that $105K is the largest of the $136.5K of adjustments itemized on page 4."],
  ], CX, PY + PH2 + 0.20, CWd, BODY_END - (PY + PH2 + 0.20), 9);
}

// ================================================================ 4. ADJUSTED EBITDA SCHEDULE
{
  const s = pres.addSlide();
  page(s, {
    num: 4, section: "Adjusted EBITDA", topic: "Reconciliation and support",
    title: "Adj. EBITDA of $453K in FY2025 restates $200K of owner pay to a $95K salary and removes $31.5K of personal and nonrecurring cost",
    deck: "Five adjustments, each tied to a payroll record or a ledger account; owner compensation is 77% of the FY2025 total.",
    source: "Source: Company financial statements (QuickBooks Online) and payroll register, FY2023–FY2025; Management; AMB Advisory analysis.",
    note: "Note: Figures in USD thousands. Adj. EBITDA and SDE are non-GAAP measures, reconciled to Reported EBITDA above. Financials are as provided by the Seller and have not been independently audited. Reference codes: [S] owner compensation, [N] normalization.",
    footnotes: [
      "(1) Per management; not independently verified.",
      "(2) Market salary for a general manager in the Columbus market, per management; a buyer’s own estimate may differ.",
    ],
  });

  const TW = 7.75;
  let y = exhibit(s, 1, "Adjusted EBITDA reconciliation", "($000s)", BX, BODY_Y, TW, { coverage: "Tier codes [S] and [N]; SDE shown" });
  const REF = 0.48, ADJ = 2.20, V = 0.72, G = 0.08, BAS = TW - REF - ADJ - 3 * V - G;
  const styles = {
    line: { bold: false, border: () => noBorder(), fill: null, color: C.ink },
    first: { bold: true, border: () => noBorder(), fill: null, color: C.ink },
    sub: { bold: true, border: () => [rule(0.5, C.ink), NONE, NONE, NONE], fill: null, color: C.ink },
    key: { bold: true, border: () => [rule(0.75, C.maroon), NONE, rule(0.75, C.maroon), NONE], fill: null, color: C.ink },
    hi: { bold: true, border: () => noBorder(), fill: { color: C.maroon }, color: C.white },
    ratio: { bold: false, border: () => noBorder(), fill: null, color: C.ink, italic: true },
  };
  const R = (ref, label, vals, basis, kind = "line") => {
    const st = styles[kind];
    const o = { bold: st.bold, color: st.color, italic: !!st.italic, valign: "middle" };
    if (st.fill) o.fill = st.fill;
    const mk = (t, extra) => cell(t, Object.assign({ border: st.border() }, o, extra));
    return [
      mk(ref, { align: "left", bold: true }),
      mk(label, { align: "left" }),
      ...vals.map((v) => mk(v, { align: "right" })),
      gap(),
      mk(basis, { align: "left", fontSize: 8, bold: false, italic: false }),
    ];
  };
  const rows = [
    [hdr("Ref", { align: "left" }), hdr("Adjustment", { align: "left" }), hdr("FY2023"), hdr("FY2024"), hdr("FY2025"), gap(), hdr("Basis and evidence", { align: "left" })],
    R("", "Reported EBITDA", repEbitda.map((v) => money(v, true)), "QuickBooks Online P&L; before interest, taxes, depreciation and amortization", "first"),
    R("[S1]", "Owner compensation above replacement cost", adj.S1.map((v) => money(v)), "Owner W-2 pay of $180K, $190K and $200K per payroll register, less a $95K general manager salary (2)"),
    R("[N1]", "Owner personal vehicle", adj.N1.map((v) => money(v)), "Payments, fuel and insurance on a vehicle used personally; general ledger auto expense (1)"),
    R("[N2]", "Charitable contributions", adj.N2.map((v) => money(v)), "Donations to local organizations; discretionary and not tied to any customer account"),
    R("[N3]", "One-time legal settlement", adj.N3.map((v) => money(v)), "Single matter settled and paid in FY2024; no comparable expense in FY2023 or FY2025"),
    R("[N4]", "Family phones and personal meals", adj.N4.map((v) => money(v)), "Family phone lines and meals coded to business expense in FY2025, per ledger review (1)"),
    R("", "Total adjustments", adjTotal.map((v) => money(v, true)), "43% of Reported EBITDA in FY2025, down from 68% in FY2023 as earnings grew", "sub"),
    R("", "Adj. EBITDA", adjEbitda.map((v) => money(v, true)), "Earnings after a market-rate general manager replaces the owner", "hi"),
    R("", "% margin", adjEbitda.map((v, i) => pct1(v / rev[i])), "", "ratio"),
    R("", "(+) Owner replacement salary", [REPL, REPL, REPL].map((v) => money(v)), "Added back to state the earnings available to a single owner-operator (2)"),
    R("", "SDE", sde.map((v) => money(v, true)), "Seller’s discretionary earnings, the Main Street convention for businesses of this size", "key"),
    R("", "% margin", sde.map((v, i) => pct1(v / rev[i])), "", "ratio"),
  ];
  const rowH = [0.21, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.195, 0.30, 0.30, 0.195];
  s.addTable(rows, { x: BX, y, w: TW, colW: [REF, ADJ, V, V, V, G, BAS], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH, margin: [0, 0.05, 0, 0.05], valign: "middle" });
  const tableEnd = y + rowH.reduce((a, b) => a + b, 0);

  callout(s, "Takeaway:", "Adjustments are 43% of FY2025 Reported EBITDA and 77% of them are one payroll line, so diligence on Adj. EBITDA is mainly a test of the $95K replacement salary.",
    BX, tableEnd + 0.20, TW, 0.60);

  const RXr = BX + TW + 0.30;
  vline(s, RXr - 0.15, BODY_Y, BODY_END - BODY_Y, 0.5, C.rule);
  bullets(s, [
    ["Owner compensation is the only large item.", "[S1] restates the owner’s pay of $200K in FY2025 to the $95K a general manager would cost, and accounts for $105K of the $136.5K of FY2025 adjustments (77%)."],
    ["Personal expense is small and specific.", "[N1], [N2] and [N4] total $31.5K in FY2025, 1.0% of revenue, and each maps to a named ledger account."],
    ["One nonrecurring item, in one year.", "The $24K settlement [N3] fell in FY2024 only. Even without the add-back, FY2024 Adj. EBITDA would have grown 26% over FY2023."],
    ["Owner pay rose $10K a year.", "W-2 pay went from $180K to $200K over FY2023–FY2025 while the replacement salary is held flat at $95K, so [S1] rises from $85K to $105K."],
    ["SDE is the Main Street headline.", "SDE of $547.9K (18.0% of revenue) adds the $95K salary back to Adj. EBITDA; it is the measure an owner-operator buyer would use."],
    ["Nothing pro forma is included.", "The schedule does not assume price increases, after-hours plumbing, added maintenance penetration or any change in staffing; each is left to the buyer’s own plan."],
  ], RXr, BODY_Y, RX - RXr, BODY_END - BODY_Y, 9);
}

// ================================================================ 5. REVENUE MIX AND CUSTOMERS
{
  const s = pres.addSlide();
  page(s, {
    num: 5, section: "Customers", topic: "Revenue mix and concentration",
    title: "Residential work is 64% of $3.04M FY2025 revenue and no customer exceeds 4%; 1,450 members renew at 82%",
    deck: "Commercial accounts (27%) are property managers, offices and four restaurant groups; maintenance agreements are 9%.",
    source: "Source: ServiceTitan revenue and membership reports, FY2025; Company financial statements (QuickBooks Online); Management; AMB Advisory analysis.",
    note: "Note: Figures in USD thousands. Revenue by line per ServiceTitan job type, tied to QuickBooks Online total revenue. Customers are coded (C-001) and not named.",
    footnotes: ["(1) Per management; not independently verified."],
  });

  // Exhibit 1: chart (horizontal bars)
  const CWd = 4.55;
  const PY = BODY_Y - 0.02, PH1 = 2.80;
  panel(s, BX - 0.12, PY, CWd + 0.12, PH1);
  let cy = exhibit(s, 1, "FY2025 revenue by service line", "($000s)", BX, BODY_Y + 0.06, CWd - 0.12, { coverage: "Share of revenue in each label" });
  s.addChart(pres.charts.BAR, [{
    name: "FY2025 revenue", labels: ["Residential service and replacement (64%)", "Commercial (27%)", "Maintenance agreements (9%)"], values: [mixRev.res, mixRev.com, mixRev.mnt],
  }], {
    x: BX, y: cy + 0.02, w: CWd - 0.12, h: PY + PH1 - cy - 0.12,
    barDir: "bar", chartColors: [C.maroon], barGapWidthPct: 60, catAxisOrientation: "maxMin",
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, valAxisMinVal: 0, valAxisMaxVal: 2500,
    catAxisLabelFontFace: SANS, catAxisLabelFontSize: 8, catAxisLabelColor: C.ink, catAxisLineShow: true, catAxisLineColor: C.rule, catAxisMajorTickMark: "none",
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: SANS, dataLabelFontSize: 8, dataLabelColor: C.ink, dataLabelFormatCode: "#,##0.0",
    showLegend: false, chartArea: { fill: { color: C.tint } }, plotArea: { fill: { color: C.tint } },
  });

  bullets(s, [
    ["Concentration is low.", "The largest customer, a commercial property manager (C-001), is about 4% of FY2025 revenue; the residential line, 64% of revenue, is single-household jobs."],
    ["Maintenance agreements are the recurring layer.", "1,450 members paid $273.7K in FY2025, about $189 each, and renew at 82% (1); two tune-ups a year and a 15% repair discount keep members’ repair work with Ridgeline."],
    ["Attach rate is the open lever.", "Agreements are offered on about 35% of service calls (1), and two property managers have asked for quotes on additional buildings."],
    ["Reviews, not paid marketing, generate leads.", "Most leads come from referrals and a 4.8 Google rating on more than 900 reviews (1); paid digital spend is small."],
  ], BX, PY + PH1 + 0.20, CWd, BODY_END - (PY + PH1 + 0.20), 9);

  // Exhibit 2: revenue lines and customer profile
  const TX = BX + CWd + 0.35, TW = RX - TX;   // 7.15 -> 12.883
  let y = exhibit(s, 2, "Revenue lines and customer profile", "(FY2025, $000s)", TX, BODY_Y, TW, { coverage: "Largest customer coded C-001" });
  const tr = (a, b, c, d, e, o = {}) => {
    const bd = o.last ? noBorder() : [NONE, NONE, rule(0.5, C.rule), NONE];
    const base = Object.assign({ valign: "top", fontSize: 8.5 }, o.cell || {});
    return [
      lab(a, Object.assign({ border: bd.slice(), bold: true }, base)),
      num(b, Object.assign({ border: bd.slice() }, base)),
      num(c, Object.assign({ border: bd.slice() }, base)),
      lab(d, Object.assign({ border: bd.slice() }, base)),
      lab(e, Object.assign({ border: bd.slice() }, base)),
    ];
  };
  const rows = [
    [hdr("Service line", { align: "left" }), hdr("Revenue"), hdr("%"), hdr("What the customer buys", { align: "left" }), hdr("Customers and concentration", { align: "left" })],
    tr("Residential service and replacement", fmt1(mixRev.res), pct1(mix.res), "Repairs, system replacements and plumbing service", "Homeowners in Franklin, Delaware and Licking counties"),
    tr("Commercial", fmt1(mixRev.com), pct1(mix.com), "Service, replacement and preventive maintenance", "Property managers, small offices and four restaurant groups; largest (C-001) 4%"),
    tr("Maintenance agreements", fmt1(mixRev.mnt), pct1(mix.mnt), "Two tune-ups a year, priority scheduling, 15% repair discount", "1,450 members; 82% renewal (1); $189 per member"),
    tr("Total", "$" + fmt1(rev[2]), "100.0%", "", "", { last: true, cell: { bold: true, border: [rule(0.75, C.maroon), NONE, rule(0.75, C.maroon), NONE] } }),
  ];
  const rh2 = [0.21, 0.44, 0.52, 0.44, 0.22];
  s.addTable(rows, { x: TX, y, w: TW, colW: [1.30, 0.62, 0.50, 1.55, TW - 3.97], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH: rh2, margin: [0.03, 0.05, 0.03, 0.05], valign: "top" });
  y += rh2.reduce((a, b) => a + b, 0) + 0.28;

  // Exhibit 3: maintenance-agreement base (fact table on tint)
  const PY3 = y - 0.02;
  panel(s, TX - 0.12, PY3, TW + 0.12, BODY_END - PY3);
  y = exhibit(s, 3, "Maintenance-agreement base", "(#, $)", TX, y + 0.06, TW - 0.12, { coverage: "Members as of September 2026; revenue FY2025" });
  const fr = (a, b, c, last) => [
    lab(a, { bold: true, fontSize: 8.5, border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
    num(b, { fontSize: 8.5, border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
    lab(c, { fontSize: 8.5, border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
  ];
  const fact = [
    [hdr("Measure", { align: "left" }), hdr("Value"), hdr("Basis", { align: "left" })],
    fr("Active members", "1,450", "Two tune-ups a year, priority scheduling, 15% repair discount"),
    fr("Annual renewal rate (1)", "82%", "About 260 members must be replaced each year to hold the base flat"),
    fr("FY2025 agreement revenue", "$273.7", "9.0% of total revenue"),
    fr("Revenue per member", "$189", "Agreement revenue divided by active members"),
    fr("Tune-up visits a year", "2,900", "Two per member, scheduled in ServiceTitan"),
    fr("Members per technician", "104", "1,450 members across 14 service technicians"),
    fr("Offered on service calls (1)", "~35%", "Technicians earn a spiff on each agreement sold", true),
  ];
  const fw = TW - 0.12;
  s.addTable(fact, { x: TX, y, w: fw, colW: [1.90, 0.70, fw - 2.60], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH: [0.21, 0.225, 0.225, 0.225, 0.225, 0.225, 0.225, 0.225], margin: [0, 0.05, 0, 0.05], valign: "middle" });
}

// ================================================================ 6. OPERATIONS AND TEAM
{
  const s = pres.addSlide();
  page(s, {
    num: 6, section: "Operations and people", topic: "Organization and facilities",
    title: "An 11-year operations manager runs the 24-person team; the owner’s 45-hour week is estimating, commercial accounts and hiring",
    deck: "18 vans, 2 trucks, an 8,000 sq ft shop leased through 2029 and ServiceTitan dispatch all transfer with the business.",
    source: "Source: Management; company payroll register (headcount); AMB Advisory analysis.",
    note: "Note: Headcount as of September 2026. Employees other than management are described by role only; no individual compensation is shown.",
    footnotes: [
      "(1) Per management; not independently verified.",
      "(2) Market salary for a general manager in the Columbus market, per management; a buyer’s own estimate may differ.",
    ],
  });

  const TXT_W = 4.85;
  paragraphs(s, [
    ["Team.", "Ridgeline employs 24 people, all full time and non-union: 14 service technicians, a 4-person install crew, 3 customer service and dispatch staff, an operations manager, a bookkeeper and the owner. Technicians are paid hourly plus spiff commissions on maintenance agreements sold on service calls, which ties field pay to the recurring base. Lisa Tran, operations manager for 11 years, runs dispatch and day-to-day scheduling through ServiceTitan and is expected to remain with the business (1)."],
    ["Owner role.", "Mark Delaney works about 45 hours a week on four tasks: estimating large replacements, commercial relationships, vendor terms and hiring. None of the four is a field role, and together they map to the general manager position that management costs at $95,000 a year (2). He has offered up to 12 months of full-time transition and will introduce the buyer to each commercial account."],
    ["Facilities and fleet.", "The Company leases an 8,000 sq ft shop and office on Maple Ave from an unrelated landlord; the lease runs through 2029 with a 5-year renewal option. It owns 18 service vans and 2 install trucks, financed with vehicle loans; in an asset sale the vehicles transfer free and clear of those loans."],
    ["Systems and suppliers.", "Dispatch, invoicing and memberships run on ServiceTitan and the books on QuickBooks Online, so job-level revenue by type ties to the financial statements. Parts and equipment come from Ferguson, Johnstone Supply and the local Carrier distributor; Ridgeline has been a Carrier Factory Authorized Dealer since 2015. Its Google rating is 4.8 on more than 900 reviews (1)."],
  ], BX, BODY_Y, TXT_W, BODY_END - BODY_Y);

  // Exhibit 1: organization table
  const TX = BX + TXT_W + 0.35, TW = RX - TX;   // 7.45 -> 12.883
  let y = exhibit(s, 1, "Organization and post-close intent", "(#)", TX, BODY_Y, TW, { coverage: "Management named; others by role" });
  const orgRow = (a, b, c, d, o = {}) => {
    const bd = o.total ? [rule(0.75, C.maroon), NONE, rule(0.75, C.maroon), NONE] : [NONE, NONE, rule(0.5, C.rule), NONE];
    const base = { valign: "top", fontSize: 8.5, bold: !!o.total };
    return [
      lab(a, Object.assign({ border: bd.slice(), bold: true }, base)),
      num(b, Object.assign({ border: bd.slice() }, base)),
      lab(c, Object.assign({ border: bd.slice() }, base)),
      lab(d, Object.assign({ border: bd.slice() }, base)),
    ];
  };
  const org = [
    [hdr("Role", { align: "left" }), hdr("Count"), hdr("Tenure and responsibilities", { align: "left" }), hdr("Post-close", { align: "left" })],
    orgRow("Owner (Mark Delaney)", "1", "Founded 2009; estimating, commercial relationships, vendor terms, hiring; about 45 hours a week", "12-month transition offered"),
    orgRow("Operations manager (Lisa Tran)", "1", "11 years; dispatch and day-to-day scheduling", "Expected to remain (1)"),
    orgRow("Service technicians", "14", "Hourly plus spiffs on maintenance agreements; non-union", "Retained"),
    orgRow("Install crew", "4", "System replacements and installations", "Retained"),
    orgRow("Customer service and dispatch", "3", "Inbound calls; ServiceTitan scheduling", "Retained"),
    orgRow("Bookkeeper", "1", "QuickBooks Online; monthly close", "Retained"),
    orgRow("Total", "24", "", "", { total: true }),
  ];
  const orgH = [0.21, 0.42, 0.30, 0.30, 0.22, 0.30, 0.22, 0.22];
  s.addTable(org, { x: TX, y, w: TW, colW: [1.55, 0.45, 2.30, TW - 4.30], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH: orgH, margin: [0.03, 0.05, 0.03, 0.05], valign: "top" });
  y += orgH.reduce((a, b) => a + b, 0) + 0.28;

  // Exhibit 2: operating assets (fact table on tint)
  const PY2 = y - 0.02;
  panel(s, TX - 0.12, PY2, TW + 0.12, BODY_END - PY2);
  y = exhibit(s, 2, "Operating assets and systems", "", TX, y + 0.06, TW - 0.12, { coverage: "As of September 2026" });
  const fr = (a, b, last) => [
    lab(a, { bold: true, fontSize: 8.5, valign: "top", border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
    lab(b, { fontSize: 8.5, valign: "top", border: [NONE, NONE, last ? NONE : rule(0.5, C.rule), NONE] }),
  ];
  const fw = TW - 0.12;
  const fact = [
    [hdr("Item", { align: "left" }), hdr("Detail", { align: "left" })],
    fr("Shop and office", "8,000 sq ft, Maple Ave; leased through 2029 with a 5-year option; unrelated landlord"),
    fr("Fleet", "18 service vans, 2 install trucks; owned, vehicle loans"),
    fr("Systems", "ServiceTitan (dispatch, invoicing, memberships); QuickBooks Online"),
    fr("Suppliers", "Ferguson, Johnstone Supply; Carrier via the local distributor"),
    fr("Credentials", "Carrier Factory Authorized Dealer since 2015; Google 4.8, 900+ reviews (1)"),
    fr("Service area", "Franklin, Delaware and Licking counties; about a 35-mile radius", true),
  ];
  s.addTable(fact, { x: TX, y, w: fw, colW: [1.20, fw - 1.20], fontFace: SANS, fontSize: 8.5, color: C.ink, rowH: [0.21, 0.34, 0.22, 0.22, 0.22, 0.22, 0.22], margin: [0.03, 0.05, 0.03, 0.05], valign: "top" });
}

// ================================================================ 7. CONSIDERATIONS FOR BUYERS
{
  const s = pres.addSlide();
  page(s, {
    num: 7, section: "Executive summary", topic: "Considerations for buyers",
    title: "Owner dependence and the $95K replacement salary lead buyer diligence; the largest customer is 4% and the lease runs through 2029",
    deck: "Each item states what the data shows and how it is addressed; none is adjusted for in Adj. EBITDA on page 4.",
    source: "Source: Management; company financial statements (QuickBooks Online) and payroll register, FY2023–FY2025; AMB Advisory analysis.",
    note: "Note: Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited.",
    footnotes: ["(1) Per management; not independently verified."],
  });

  let y = exhibit(s, 1, "Considerations for buyers", "", BX, BODY_Y, BW, { coverage: "Six items, each with the data and the response" });
  const cr = (a, b, c, last) => {
    const bd = last ? noBorder() : [NONE, NONE, rule(0.5, C.rule), NONE];
    return [
      lab(a, { bold: true, fontSize: 9, valign: "top", border: bd.slice() }),
      lab(b, { fontSize: 9, valign: "top", border: bd.slice() }),
      lab(c, { fontSize: 9, valign: "top", border: bd.slice() }),
    ];
  };
  const rows = [
    [hdr("Consideration", { align: "left" }), hdr("What the data shows", { align: "left" }), hdr("How it is addressed", { align: "left" })],
    cr("Owner involvement",
      "The owner works about 45 hours a week on estimating large replacements, commercial relationships, vendor terms and hiring. None of the four is a field role, and none is delegated today.",
      "The operations manager (11 years) already runs dispatch and scheduling. The owner offers up to 12 months of full-time transition, and Adj. EBITDA carries a $95K general manager salary in his place (page 4)."),
    cr("Replacement salary",
      "Adj. EBITDA of $452.9K assumes a $95K general manager. Each $10K above that figure reduces Adj. EBITDA by $10K, or 2.2%.",
      "The figure is management’s estimate for the Columbus market (1). A buyer can substitute its own number without changing any other line of the schedule."),
    cr("Maintenance-agreement renewal",
      "1,450 members renew at 82% (1), so about 260 members must be replaced each year to hold the base flat. Agreement revenue was $273.7K in FY2025, 9.0% of the total.",
      "Agreements are offered on about 35% of service calls (1); technicians earn a spiff on each sale, and the two-tune-up cycle puts a technician in each member’s home twice a year."),
    cr("Field labor",
      "Field labor is 18 of 24 employees (14 technicians, 4 installers). Pay is hourly plus commissions, non-union, and hiring is one of the owner’s four roles.",
      "The current crew delivered the 12.4% revenue CAGR without a change in headcount reported by management (1). Hiring transfers to the general manager during the 12-month transition."),
    cr("Customer concentration",
      "The largest customer, a commercial property manager (C-001), is about 4% of FY2025 revenue. Residential work, 64% of revenue, consists of single-household jobs.",
      "No single account is material to earnings. The owner will introduce the buyer to each commercial account during the transition period."),
    cr("Premises and fleet",
      "The 8,000 sq ft shop is leased from an unrelated landlord through 2029 with a 5-year renewal option. The 18 vans and 2 trucks are owned and financed with vehicle loans.",
      "The lease has about three years of term plus the 5-year option. In an asset sale the Seller repays the vehicle loans at closing and the fleet transfers free and clear of liens.", true),
  ];
  const rowH = [0.21, 0.62, 0.50, 0.62, 0.62, 0.50, 0.62];
  s.addTable(rows, { x: BX, y, w: BW, colW: [1.80, 4.35, BW - 6.15], fontFace: SANS, fontSize: 9, color: C.ink, rowH, margin: [0.04, 0.06, 0.04, 0.06], valign: "top" });
  const tableEnd = y + rowH.reduce((a, b) => a + b, 0);
  callout(s, "Takeaway:", "Four of the six items resolve to the same test, whether a $95K general manager and the 11-year operations manager can carry the owner’s four roles; the other two (concentration at 4%, a lease with three years plus an option) are matters of record.",
    BX, tableEnd + 0.20, BW, 0.55);
}

// ---------------------------------------------------------------- write, then colour the bullet glyphs maroon
(async () => {
  await pres.writeFile({ fileName: OUT });
  if (JSZip) {
    const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    for (const n of names) {
      let xml = await zip.file(n).async("string");
      xml = xml.replace(/((?:<a:buSzPct[^>]*\/>)?(?:<a:buFont[^>]*\/>)?<a:buChar char="(?:▪|&#x25AA;|&#9642;)"\/>)/g,
        `<a:buClr><a:srgbClr val="${C.maroon}"/></a:buClr>$1`);
      zip.file(n, xml);
    }
    fs.writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
