// Builds the 10-page CIM as a native PowerPoint deck (editable text, native
// charts and tables), so the advisor can polish it before it goes out.
//
//  1 Cover                         6 Services & customers
//  2 Confidentiality & contents    7 Operations & team
//  3 Executive summary             8 Industry & growth opportunities
//  4 Investment highlights         9 Historical financial performance
//  5 Company overview             10 Projections & transaction overview

import pptxgenModule from "pptxgenjs";

// pptxgenjs ships CommonJS-style typings, so under NodeNext the default
// import is typed as the module object. At runtime the ESM build's default
// export is the class itself; normalise both.
type Pptx = typeof import("pptxgenjs").default;
const PptxGenJS: Pptx = ((pptxgenModule as unknown as { default?: Pptx }).default ?? pptxgenModule) as Pptx;
declare namespace pptxgen {
  type Slide = import("pptxgenjs").default.Slide;
  type BorderProps = import("pptxgenjs").default.BorderProps;
  type TableCell = import("pptxgenjs").default.TableCell;
}
import type { FinancialDataset } from "../domain/financials.ts";
import type { RequestRow } from "../requests/schema.ts";
import type { ModelResult, YearValues } from "../model/engine.ts";
import type { CimCopy } from "./narrative.ts";
import { fmtMoney, fmtPct, fmtThousands } from "../util/format.ts";

// Palette: deep navy carries the deck; brass is the single accent.
const NAVY = "13294B";
const INK = "1F2933";
const MUTED = "5B6B7B";
const ICE = "EEF2F7";
const LINE = "D5DCE4";
const BRASS = "B8862B";
const SLATE = "5B7BA3";
const WHITE = "FFFFFF";
const CHART = [NAVY, BRASS, SLATE, "8FA9C9", "C9B27C", "A3AEBB"];

const HEAD = "Cambria";
const BODY = "Calibri";

const W = 13.333;
const MARGIN = 0.6;
const CONTENT_TOP = 1.55;

export interface DeckContext {
  row: RequestRow;
  copy: CimCopy;
  model: ModelResult;
  dataset: FinancialDataset;
  firm: { name: string; contact: string; email: string; phone: string };
  date: Date;
}

/** Keep drafted text inside its box: cut at a sentence (or word) boundary past the limit. */
export function clampWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text.trim();
  const cut = words.slice(0, max).join(" ");
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("] "));
  if (lastStop > cut.length * 0.4) return cut.slice(0, lastStop + 1);
  return `${cut}…`;
}

export async function buildDeck(ctx: DeckContext, file: string): Promise<void> {
  const { row, copy, model } = ctx;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = ctx.firm.name;
  pres.company = ctx.firm.name;
  pres.title = `${row.code_name}: Confidential Information Memorandum`;

  const last = model.historical[model.historical.length - 1]!;
  const first = model.historical[0]!;
  const monthYear = ctx.date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const sections = [
    "Executive summary",
    "Investment highlights",
    "Company overview",
    "Services & customers",
    "Operations & team",
    "Industry & growth opportunities",
    "Historical financial performance",
    "Projections & transaction overview",
  ];

  // --- shared chrome ----------------------------------------------------------
  const contentSlide = (n: number, title: string) => {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    s.addText(`${String(n).padStart(2, "0")}  ·  ${sections[n - 3]!.toUpperCase()}`, {
      x: MARGIN, y: 0.32, w: 8, h: 0.3, fontFace: BODY, fontSize: 10, bold: true, color: BRASS, charSpacing: 2, margin: 0, isTextBox: true,
    });
    s.addText(title, {
      x: MARGIN, y: 0.62, w: W - 2 * MARGIN, h: 0.7, fontFace: HEAD, fontSize: 28, bold: true, color: NAVY, margin: 0, valign: "top", isTextBox: true,
    });
    s.addText(`Confidential  |  ${row.code_name}`, {
      x: MARGIN, y: 7.02, w: 6, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTED, margin: 0, isTextBox: true,
    });
    s.addText(String(n), {
      x: W - MARGIN - 1, y: 7.02, w: 1, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTED, align: "right", margin: 0, isTextBox: true,
    });
    return s;
  };

  const numberBadge = (s: pptxgen.Slide, n: number, x: number, y: number, d = 0.42) => {
    s.addShape("ellipse", { x, y, w: d, h: d, fill: { color: BRASS }, line: { color: BRASS } });
    s.addText(String(n), {
      x, y, w: d, h: d, fontFace: HEAD, fontSize: 14, bold: true, color: WHITE, align: "center", valign: "middle", margin: 0, isTextBox: true,
    });
  };

  const body = (s: pptxgen.Slide, text: string, x: number, y: number, w: number, h: number, size = 13, maxWords = 140) =>
    s.addText(clampWords(text, maxWords), {
      x, y, w, h, fontFace: BODY, fontSize: size, color: INK, valign: "top", margin: 0, paraSpaceAfter: 6, lineSpacingMultiple: 1.1, isTextBox: true,
    });

  const card = (s: pptxgen.Slide, x: number, y: number, w: number, h: number) =>
    s.addShape("roundRect", { x, y, w, h, fill: { color: ICE }, line: { color: ICE }, rectRadius: 0.08 });

  // --- 1. Cover ----------------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    for (const [d, t] of [[7.2, 70], [5.4, 55], [3.6, 40]] as const) {
      s.addShape("ellipse", {
        x: W - d / 2 - 1.3, y: 3.75 - d / 2, w: d, h: d, fill: { color: NAVY, transparency: 100 }, line: { color: BRASS, width: 1, transparency: t },
      });
    }
    s.addText("CONFIDENTIAL INFORMATION MEMORANDUM", {
      x: 0.8, y: 1.9, w: 8, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: BRASS, charSpacing: 3, margin: 0, isTextBox: true,
    });
    s.addText(row.code_name, {
      x: 0.8, y: 2.4, w: 8.2, h: 1.2, fontFace: HEAD, fontSize: 48, bold: true, color: WHITE, margin: 0, valign: "middle", isTextBox: true,
    });
    s.addText(row.business_name, {
      x: 0.8, y: 3.65, w: 8, h: 0.5, fontFace: BODY, fontSize: 20, color: ICE, margin: 0, isTextBox: true,
    });
    s.addText(clampWords(copy.tagline, 16), {
      x: 0.8, y: 4.2, w: 7.4, h: 0.8, fontFace: HEAD, fontSize: 16, italic: true, color: "C9D3DF", margin: 0, valign: "top", isTextBox: true,
    });
    s.addText(`Prepared by ${ctx.firm.name}  ·  ${monthYear}`, {
      x: 0.8, y: 6.2, w: 8, h: 0.35, fontFace: BODY, fontSize: 12, color: ICE, margin: 0, isTextBox: true,
    });
    s.addText("Strictly private and confidential. Not for distribution.", {
      x: 0.8, y: 6.55, w: 8, h: 0.3, fontFace: BODY, fontSize: 10, color: "9FB0C4", margin: 0, isTextBox: true,
    });
  }

  // --- 2. Confidentiality & contents -----------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    s.addText("Confidentiality notice", {
      x: MARGIN, y: 0.62, w: 6.2, h: 0.6, fontFace: HEAD, fontSize: 24, bold: true, color: NAVY, margin: 0, isTextBox: true,
    });
    const notice = [
      `This Confidential Information Memorandum (the "Memorandum") has been prepared by ${ctx.firm.name} ("AMB") on behalf of ${row.business_name} (the "Company") solely to help prospective buyers decide whether to pursue an acquisition of the Company. It is provided under the confidentiality agreement signed by the recipient.`,
      "The information in this Memorandum was supplied by the Company and has not been independently verified. Neither the Company nor AMB makes any representation or warranty as to its accuracy or completeness. Any projections are estimates based on assumptions that may not prove correct; actual results will differ.",
      "Recipients must not contact the Company's owners, employees, customers, suppliers or landlord. All enquiries, requests for information and proposals should be directed to AMB.",
    ];
    s.addText(
      notice.map((t, i) => ({ text: t, options: { breakLine: i < notice.length - 1 } })),
      { x: MARGIN, y: 1.45, w: 6.2, h: 4.9, fontFace: BODY, fontSize: 11.5, color: MUTED, valign: "top", margin: 0, paraSpaceAfter: 10, lineSpacingMultiple: 1.1, isTextBox: true },
    );

    card(s, 7.35, 0.6, W - 7.35 - MARGIN, 6.2);
    s.addText("Contents", {
      x: 7.75, y: 0.95, w: 4.5, h: 0.5, fontFace: HEAD, fontSize: 22, bold: true, color: NAVY, margin: 0, isTextBox: true,
    });
    sections.forEach((name, i) => {
      const y = 1.75 + i * 0.58;
      s.addText(String(i + 3).padStart(2, "0"), {
        x: 7.75, y, w: 0.6, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: BRASS, margin: 0, valign: "middle", isTextBox: true,
      });
      s.addText(name, {
        x: 8.4, y, w: 4.0, h: 0.4, fontFace: BODY, fontSize: 14, color: INK, margin: 0, valign: "middle", isTextBox: true,
      });
    });
    s.addText(`Confidential  |  ${row.code_name}`, {
      x: MARGIN, y: 7.02, w: 6, h: 0.28, fontFace: BODY, fontSize: 9, color: MUTED, margin: 0, isTextBox: true,
    });
  }

  // --- 3. Executive summary ------------------------------------------------------
  {
    const s = contentSlide(3, `${row.business_name} at a glance`);
    body(s, copy.executive_summary, MARGIN, CONTENT_TOP, 6.4, 3.9, 14, 135);
    const cagr = model.historical.length >= 2 ? (last.revenue / first.revenue) ** (1 / (model.historical.length - 1)) - 1 : undefined;
    const tiles: [string, string][] = [
      [fmtMoney(last.revenue), `FY${last.year} revenue`],
      [fmtMoney(last.adjEbitda), `FY${last.year} adjusted EBITDA (${fmtPct(last.adjEbitda / last.revenue)} margin)`],
      [fmtMoney(last.sde), `FY${last.year} seller's discretionary earnings`],
      cagr !== undefined
        ? [fmtPct(cagr), `Revenue CAGR, FY${first.year}–FY${last.year}`]
        : [row.year_founded ? String(row.year_founded) : "–", "Year founded"],
    ];
    const tx = 7.45, tw = 2.55, th = 1.75, gap = 0.18;
    tiles.forEach(([big, label], i) => {
      const x = tx + (i % 2) * (tw + gap);
      const y = CONTENT_TOP + Math.floor(i / 2) * (th + gap);
      card(s, x, y, tw, th);
      s.addText(big, { x: x + 0.2, y: y + 0.2, w: tw - 0.4, h: 0.75, fontFace: HEAD, fontSize: 30, bold: true, color: NAVY, margin: 0, valign: "middle", isTextBox: true });
      s.addText(label, { x: x + 0.2, y: y + 0.98, w: tw - 0.4, h: 0.6, fontFace: BODY, fontSize: 11, color: MUTED, margin: 0, valign: "top", isTextBox: true });
    });
    const facts: [string, string][] = [
      ["Founded", row.year_founded ? String(row.year_founded) : "[Confirm]"],
      ["Employees", row.employees ? String(row.employees) : "[Confirm]"],
      ["Headquarters", row.location || "[Confirm]"],
    ];
    facts.forEach(([k, v], i) => {
      const x = MARGIN + i * 2.15;
      s.addText(k.toUpperCase(), { x, y: 5.75, w: 2.0, h: 0.3, fontFace: BODY, fontSize: 9, bold: true, color: BRASS, charSpacing: 1, margin: 0, isTextBox: true });
      s.addText(v, { x, y: 6.05, w: 2.0, h: 0.45, fontFace: HEAD, fontSize: 15, bold: true, color: NAVY, margin: 0, isTextBox: true });
    });
    s.addNotes(`Figures from the company's financial records, adjusted by AMB (see page 9). Adjusted EBITDA normalises owner compensation to a market salary and adds back owner-discretionary and non-recurring items.`);
  }

  // --- 4. Investment highlights ----------------------------------------------------
  {
    const s = contentSlide(4, "Investment highlights");
    const items = copy.investment_highlights.slice(0, 6);
    const cw = (W - 2 * MARGIN - 2 * 0.3) / 3, ch = 2.45;
    items.forEach((it, i) => {
      const x = MARGIN + (i % 3) * (cw + 0.3);
      const y = CONTENT_TOP + Math.floor(i / 3) * (ch + 0.3);
      card(s, x, y, cw, ch);
      numberBadge(s, i + 1, x + 0.25, y + 0.25);
      s.addText(clampWords(it.title, 8), { x: x + 0.85, y: y + 0.2, w: cw - 1.05, h: 0.55, fontFace: HEAD, fontSize: 15, bold: true, color: NAVY, margin: 0, valign: "middle", isTextBox: true });
      body(s, it.detail, x + 0.25, y + 0.95, cw - 0.5, ch - 1.15, 12, 36);
    });
  }

  // --- 5. Company overview -----------------------------------------------------------
  {
    const s = contentSlide(5, "Company overview");
    s.addText("History", { x: MARGIN, y: CONTENT_TOP, w: 6.4, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    body(s, copy.history, MARGIN, CONTENT_TOP + 0.5, 6.4, 2.6, 13, 110);
    s.addText("Reason for sale", { x: MARGIN, y: 4.75, w: 6.4, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    body(s, copy.reason_for_sale, MARGIN, 5.25, 6.4, 1.4, 13, 45);

    card(s, 7.45, CONTENT_TOP, W - 7.45 - MARGIN, 5.15);
    s.addText("At a glance", { x: 7.75, y: CONTENT_TOP + 0.25, w: 4.5, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    const facts = copy.snapshot.slice(0, 6);
    const rows = facts.map((f, i) => [
      { text: f.label, options: { bold: true, color: MUTED, fontSize: 11, border: borderBottom(i < facts.length - 1) } },
      { text: clampWords(f.value, 10), options: { color: INK, fontSize: 12, border: borderBottom(i < facts.length - 1) } },
    ]);
    s.addTable(rows, { x: 7.75, y: CONTENT_TOP + 0.8, w: 4.7, colW: [1.7, 3.0], rowH: 0.62, fontFace: BODY, valign: "middle", margin: [0, 0.05, 0, 0] });
  }

  // --- 6. Services & customers -----------------------------------------------------
  {
    const s = contentSlide(6, "Services and customers");
    const services = copy.services.slice(0, 5);
    const itemH = Math.min(1.05, 5.1 / services.length);
    services.forEach((sv, i) => {
      const y = CONTENT_TOP + i * itemH;
      s.addText(clampWords(sv.title, 7), { x: MARGIN, y, w: 6.3, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true });
      body(s, sv.detail, MARGIN, y + 0.37, 6.3, itemH - 0.42, 12, 26);
    });

    const mix = ctx.dataset.revenueMix;
    const rx = 7.45, rw = W - 7.45 - MARGIN;
    if (mix.length >= 2) {
      s.addChart("doughnut", [{ name: "Revenue mix", labels: mix.map((m) => m.label), values: mix.map((m) => m.amount) }], {
        x: rx, y: CONTENT_TOP - 0.1, w: rw, h: 3.0,
        holeSize: 58, chartColors: CHART, showPercent: true, showValue: false, showLegend: true, legendPos: "b", legendFontSize: 10, legendFontFace: BODY, legendColor: INK,
        dataLabelColor: WHITE, dataLabelFontSize: 10, showTitle: true, title: `FY${last.year} revenue mix`, titleFontFace: HEAD, titleFontSize: 13, titleColor: NAVY,
      });
      s.addText("Customers", { x: rx, y: 4.65, w: rw, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true });
      body(s, copy.customers, rx, 5.05, rw, 1.75, 12, 75);
    } else {
      s.addText("Customers", { x: rx, y: CONTENT_TOP, w: rw, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true });
      body(s, copy.customers, rx, CONTENT_TOP + 0.45, rw, 4.6, 13, 75);
    }
  }

  // --- 7. Operations & team ------------------------------------------------------------
  {
    const s = contentSlide(7, "Operations and team");
    const ops = copy.operations.slice(0, 4);
    const cw = 3.3, ch = 2.45, gap = 0.25;
    ops.forEach((op, i) => {
      const x = MARGIN + (i % 2) * (cw + gap);
      const y = CONTENT_TOP + Math.floor(i / 2) * (ch + gap);
      card(s, x, y, cw, ch);
      s.addText(clampWords(op.title, 5), { x: x + 0.25, y: y + 0.2, w: cw - 0.5, h: 0.4, fontFace: HEAD, fontSize: 14, bold: true, color: NAVY, margin: 0, isTextBox: true });
      body(s, op.detail, x + 0.25, y + 0.7, cw - 0.5, ch - 0.9, 12, 32);
    });
    const tx = MARGIN + 2 * cw + gap + 0.45;
    const tw = W - MARGIN - tx;
    s.addText(row.employees ? String(row.employees) : "–", { x: tx, y: CONTENT_TOP, w: tw, h: 0.95, fontFace: HEAD, fontSize: 54, bold: true, color: BRASS, margin: 0, valign: "middle", isTextBox: true });
    s.addText("employees", { x: tx, y: CONTENT_TOP + 0.95, w: tw, h: 0.35, fontFace: BODY, fontSize: 13, color: MUTED, margin: 0, isTextBox: true });
    s.addText("Team", { x: tx, y: CONTENT_TOP + 1.6, w: tw, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    body(s, copy.team, tx, CONTENT_TOP + 2.1, tw, 3.0, 13, 80);
  }

  // --- 8. Industry & growth ----------------------------------------------------------------
  {
    const s = contentSlide(8, "Industry and growth opportunities");
    card(s, MARGIN, CONTENT_TOP, 5.6, 5.15);
    s.addText("Industry overview", { x: MARGIN + 0.3, y: CONTENT_TOP + 0.25, w: 5.0, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    body(s, copy.industry_overview, MARGIN + 0.3, CONTENT_TOP + 0.8, 5.0, 4.1, 13, 110);

    const gx = MARGIN + 5.6 + 0.5;
    const gw = W - MARGIN - gx;
    s.addText("Growth opportunities for a new owner", { x: gx, y: CONTENT_TOP, w: gw, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    const opps = copy.growth_opportunities.slice(0, 5);
    const itemH = Math.min(1.05, 4.6 / opps.length);
    opps.forEach((g, i) => {
      const y = CONTENT_TOP + 0.6 + i * itemH;
      numberBadge(s, i + 1, gx, y + 0.02, 0.38);
      s.addText(clampWords(g.title, 8), { x: gx + 0.55, y, w: gw - 0.55, h: 0.32, fontFace: BODY, fontSize: 13, bold: true, color: NAVY, margin: 0, isTextBox: true });
      body(s, g.detail, gx + 0.55, y + 0.33, gw - 0.55, itemH - 0.36, 11.5, 28);
    });
  }

  // --- 9. Historical financials -----------------------------------------------------------------
  {
    const s = contentSlide(9, "Historical financial performance");
    const hist = model.historical;
    const labels = hist.map((y) => `FY${y.year}`);
    s.addChart(
      "bar",
      [
        { name: "Revenue", labels, values: hist.map((y) => round2(y.revenue / 1e6)) },
        { name: "Adjusted EBITDA", labels, values: hist.map((y) => round2(y.adjEbitda / 1e6)) },
      ],
      {
        x: MARGIN, y: CONTENT_TOP - 0.05, w: 5.3, h: 4.1,
        barDir: "col", barGrouping: "clustered", barGapWidthPct: 60, chartColors: [NAVY, BRASS],
        showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '$0.00"M"', dataLabelFontSize: 10, dataLabelFontFace: BODY, dataLabelColor: INK,
        catAxisLabelFontSize: 11, catAxisLabelFontFace: BODY, catAxisLabelColor: INK, catAxisLineShow: false,
        valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
        showLegend: true, legendPos: "b", legendFontSize: 10, legendFontFace: BODY, legendColor: INK,
        showTitle: true, title: "Revenue and adjusted EBITDA ($M)", titleFontFace: HEAD, titleFontSize: 13, titleColor: NAVY,
      },
    );
    s.addTable(financialTable(hist, ctx.dataset), {
      x: 6.25, y: CONTENT_TOP, w: W - 6.25 - MARGIN, colW: [2.75, ...hist.map(() => (W - 6.25 - MARGIN - 2.75) / hist.length)],
      rowH: 0.34, fontFace: BODY, fontSize: 11, color: INK, valign: "middle", margin: [0, 0.06, 0, 0.06],
    });
    body(s, copy.financial_commentary, MARGIN, 5.8, W - 2 * MARGIN, 0.95, 12, 75);
    s.addNotes("Source: company financial records. Adjusted EBITDA and SDE per AMB recast; see the financial model for account-level detail.");
  }

  // --- 10. Projections & transaction ---------------------------------------------------------------
  {
    const s = contentSlide(10, "Projections and transaction overview");
    const cols = [last, ...model.projected];
    const lw = 7.1;
    s.addText("Financial projections ($000s)", { x: MARGIN, y: CONTENT_TOP, w: lw, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    const projRows = projectionTable(cols);
    const projRowH = 0.36;
    s.addTable(projRows, {
      x: MARGIN, y: CONTENT_TOP + 0.5, w: lw, colW: [2.0, ...cols.map(() => (lw - 2.0) / cols.length)],
      rowH: projRowH, fontFace: BODY, fontSize: 11, color: INK, valign: "middle", margin: [0, 0.05, 0, 0.05],
    });
    // Commentary starts below the table with a clear gap (rows render slightly taller than rowH).
    const commentaryY = CONTENT_TOP + 0.5 + projRows.length * (projRowH + 0.04) + 0.35;
    body(s, copy.projection_commentary, MARGIN, commentaryY, lw, 6.25 - commentaryY, 12, 50);
    s.addText(
      "Projections are illustrative estimates prepared by AMB from company data. They are not a forecast or guarantee, and actual results will differ.",
      { x: MARGIN, y: 6.35, w: lw, h: 0.45, fontFace: BODY, fontSize: 9, italic: true, color: MUTED, margin: 0, valign: "top", isTextBox: true },
    );

    const rx = MARGIN + lw + 0.4;
    const rw = W - MARGIN - rx;
    card(s, rx, CONTENT_TOP, rw, 5.2);
    s.addText("Transaction overview", { x: rx + 0.3, y: CONTENT_TOP + 0.25, w: rw - 0.6, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: NAVY, margin: 0, isTextBox: true });
    body(s, copy.transaction_overview, rx + 0.3, CONTENT_TOP + 0.75, rw - 0.6, 2.3, 12, 70);
    s.addText("CONTACT", { x: rx + 0.3, y: CONTENT_TOP + 3.3, w: rw - 0.6, h: 0.3, fontFace: BODY, fontSize: 9, bold: true, color: BRASS, charSpacing: 1, margin: 0, isTextBox: true });
    const contact = [ctx.firm.name, ctx.firm.contact, ctx.firm.email, ctx.firm.phone].filter(Boolean);
    s.addText(
      contact.map((t, i) => ({ text: t, options: { bold: i === 0, breakLine: i < contact.length - 1 } })),
      { x: rx + 0.3, y: CONTENT_TOP + 3.6, w: rw - 0.6, h: 1.3, fontFace: BODY, fontSize: 12, color: INK, margin: 0, valign: "top", isTextBox: true },
    );
  }

  await pres.writeFile({ fileName: file });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function borderBottom(show: boolean): [pptxgen.BorderProps, pptxgen.BorderProps, pptxgen.BorderProps, pptxgen.BorderProps] {
  const none: pptxgen.BorderProps = { type: "none" };
  return [none, none, show ? { type: "solid", pt: 0.75, color: LINE } : none, none];
}

type Cell = pptxgen.TableCell;

function headerRow(labels: string[], firstLabel: string): Cell[] {
  return [
    { text: firstLabel, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontSize: 10 } },
    ...labels.map((l) => ({ text: l, options: { bold: true, color: WHITE, fill: { color: NAVY }, align: "right" as const, fontSize: 10 } })),
  ];
}

function tableRow(label: string, values: string[], style: "normal" | "total" | "memo" = "normal"): Cell[] {
  const base = {
    bold: style === "total",
    italic: style === "memo",
    color: style === "memo" ? MUTED : INK,
    fill: style === "total" ? { color: ICE } : undefined,
    fontSize: style === "memo" ? 10 : 11,
  };
  return [{ text: label, options: base }, ...values.map((v) => ({ text: v, options: { ...base, align: "right" as const } }))];
}

function financialTable(hist: YearValues[], ds: FinancialDataset): Cell[][] {
  const pct = (a: number, b: number) => (b ? fmtPct(a / b) : "–");
  const rows: Cell[][] = [
    headerRow(hist.map((y) => `FY${y.year}`), "$000s"),
    tableRow("Revenue", hist.map((y) => fmtThousands(y.revenue)), "total"),
    tableRow("  Growth", hist.map((y, i) => (i === 0 ? "–" : pct(y.revenue - hist[i - 1]!.revenue, hist[i - 1]!.revenue))), "memo"),
    tableRow("Gross profit", hist.map((y) => fmtThousands(y.grossProfit))),
    tableRow("  Gross margin", hist.map((y) => pct(y.grossProfit, y.revenue)), "memo"),
    tableRow("Reported EBITDA", hist.map((y) => fmtThousands(y.ebitda))),
    tableRow("Owner compensation adjustment", hist.map((y) => fmtThousands(y.ownerNormalization))),
  ];
  if (ds.addbacks.length) rows.push(tableRow("Seller add-backs", hist.map((y) => fmtThousands(y.totalAddbacks))));
  rows.push(
    tableRow("Adjusted EBITDA", hist.map((y) => fmtThousands(y.adjEbitda)), "total"),
    tableRow("  Adjusted EBITDA margin", hist.map((y) => pct(y.adjEbitda, y.revenue)), "memo"),
    tableRow("SDE", hist.map((y) => fmtThousands(y.sde)), "total"),
  );
  return rows;
}

function projectionTable(cols: YearValues[]): Cell[][] {
  const pct = (a: number, b: number) => (b ? fmtPct(a / b) : "–");
  return [
    headerRow(cols.map((y) => `FY${y.year}${y.projected ? "E" : "A"}`), ""),
    tableRow("Revenue", cols.map((y) => fmtThousands(y.revenue)), "total"),
    tableRow("  Growth", cols.map((y, i) => (i === 0 ? "–" : pct(y.revenue - cols[i - 1]!.revenue, cols[i - 1]!.revenue))), "memo"),
    tableRow("Adjusted EBITDA", cols.map((y) => fmtThousands(y.adjEbitda)), "total"),
    tableRow("  Margin", cols.map((y) => pct(y.adjEbitda, y.revenue)), "memo"),
    tableRow("SDE", cols.map((y) => fmtThousands(y.sde))),
  ];
}
