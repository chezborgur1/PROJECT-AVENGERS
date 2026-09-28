# Direction A: "Bulge-bracket classic"

AMB Advisory Services CIM deck system, direction A. The reference is a Goldman / Evercore sell-side book produced by a bank's presentations department, executed in AMB's identity: white pages, hairline rules, dense two-column layouts, maroon confined to four jobs, numbered exhibits, footnotes on every page.

This document is the rule set for the direction. It inherits `docs/HOUSE_STYLE.md` (sections 1 to 4) in full and states only what this direction fixes or narrows. Files: `build-deck.js` (generator; `node build-deck.js` from this directory, which carries its own `package.json` because the repository root is `"type": "module"`), `deck.pptx`, `page-01.png` to `page-07.png`, `assets/amb-logo-tight.png` (the 2048 master cropped to its ink box, 1862 x 606 px, aspect 3.073).

## 1. Grid and margins

- Slide 13.333 x 7.5 in (`LAYOUT_WIDE`). Side margins 0.45 in; content width 12.433 in.
- Twelve columns of 0.853 in with 0.20 in gutters. Column *k* starts at `0.45 + (k - 1) x 1.053`.
- Vertical bands, fixed on every content page:

| Band | y (in) | Contents |
|---|---|---|
| Title zone | 0.30 to 1.00 | Action title, bottom-anchored |
| Title rule | 1.06 | 0.75 pt maroon, full content width. The only maroon line on the page |
| Content | 1.22 to 6.52 | Exhibits and commentary |
| Notes | 6.46 to 6.92 | Source, note, footnotes; bottom-anchored, 7 pt; content must clear 6.42 when four lines are needed |
| Footer rule | 7.00 | 0.5 pt `C2BAB8` |
| Footer row | 7.06 to 7.30 | Tracker, confidentiality line, logo, page number |

- Column divider: a 0.5 pt `C2BAB8` vertical hairline centred in the gutter between the two columns of every two-column page, from y 1.22 to 6.42 (or to the bottom of the upper block on a chart-over-table page). This is the bank-book device that replaces boxes, cards and tinted panels.
- Layouts used in the sample and their column splits:

| Page | Archetype | Left | Right |
|---|---|---|---|
| Executive summary | L4 text-led | Prose, cols 1 to 7 | Quick Stats and transaction summary, cols 8 to 12 |
| Financial summary | L2 table + chart | Income statement, cols 1 to 6 | Chart over commentary, cols 7 to 12 |
| Adj. EBITDA | L2 table + table | Reconciliation ladder, cols 1 to 6 | Adjustment support over commentary, cols 7 to 12 |
| Customers | L5 chart over table | Bar chart, cols 1 to 6; commentary cols 7 to 12 | Segment table, cols 1 to 12 below |
| Operations | L4 text-led | Prose over a transition table, cols 1 to 7 | Two stacked tables, cols 8 to 12 |
| Considerations | L6 full width | Three-column text table, cols 1 to 12, closing paragraph beneath | |

- Fill floor: every content page carries two or three exhibits and 120 to 330 words of commentary (prose or bullets, excluding table cells and notes). No empty region larger than two columns by 1.5 in.

## 2. Type scale

Two faces only. Georgia for the cover codename and action titles; Arial for everything else. Georgia renders as Liberation Serif in the QA environment (about 10% narrower than Georgia); titles are kept to 140 characters so that two lines hold in PowerPoint.

| Element | Face | Size | Weight | Colour | Notes |
|---|---|---|---|---|---|
| Cover codename | Georgia | 40 pt | Regular | ink `2C2523` | Bottom-anchored at y 3.05 to 3.90 |
| Cover document line | Arial | 16 pt | Regular | ink | "Confidential Information Memorandum" |
| Cover date | Arial | 11 pt | Regular | muted `7A706D` | "September 2026" |
| Action title | Georgia | 20 pt | Bold | **ink** | Two lines maximum, 60 to 140 characters, sentence case, states the finding with a number. Ink, not maroon: Direction A reserves maroon for the four jobs in section 3 |
| Exhibit header | Arial | 9.5 pt | Bold number and title; regular units | ink; units muted | "Exhibit 3.1   Summary income statement  ($000s)"; 0.5 pt ink rule 0.27 in below the header top; body starts 0.33 in below |
| Exhibit annotation | Arial | 8 pt | Regular | ink | Right-aligned on the exhibit header line; at most one per exhibit ("FY2023 to FY2025 revenue CAGR: 12.4%") |
| Body prose (L4) | Arial | 10 pt (9.5 pt on the operations page) | Regular; bold run-in heads ("Overview.") | ink | Leading 1.08; 7 pt after each paragraph; left-aligned, never justified |
| Commentary bullets | Arial | 9.5 pt | Bold lead-in, regular evidence | ink | Square glyph U+25AA in ink, 11 pt hanging indent, 6 pt after |
| Text-table body | Arial | 8.5 to 9 pt | First column bold | ink | Top-aligned; 0.5 pt `C2BAB8` rule under every row except the last |
| Numeric-table body | Arial | 8.5 pt | Regular; totals bold; ratio rows italic | ink | Row height 0.195 in; label indent 0.17 in (0.29 in for a sub-line) |
| Table header | Arial | 8 pt | Bold | white on maroon | Row height 0.21 in |
| Chart labels, axis, legend | Arial | 8 pt | Regular | labels ink; axis muted | Legend top, only for two or more series |
| Page number | Arial | 8 pt | Regular | ink | Right-aligned to x 12.883 |
| Footer | Arial | 7.5 pt | Regular | muted; section name maroon | |
| Notes and footnotes | Arial | 7 pt | Regular | muted | Nothing on the page is smaller |

## 3. Colour roles

| Token | Hex | Where it appears in this direction | Where it never appears |
|---|---|---|---|
| maroon | `7B0000` | (1) table header bands, (2) the section name in the footer tracker, (3) the single rule under the title, (4) the primary chart series and the key-total rules inside tables, which are AMB's exhibit grammar | Titles, bullets, callouts, panels, backgrounds, cover fields, lines between columns |
| ink | `2C2523` | Titles, body, table figures, exhibit headers and their rules, chart data labels, page number | |
| muted | `7A706D` | Footer, notes, units, axis labels, cover date | Body text |
| rule | `C2BAB8` | Footer rule, column hairlines, text-table row separators, chart category axis, the hairline between a chart block and its commentary | |
| section | `FFE1E1` | Table section rows only ("Operating expenses", "Normalization adjustments", "Memo") | |
| white | `FFFFFF` | Page background, set explicitly on every slide; header text on maroon | |
| chart 2 | `DCC7C4` | Second series (Adj. EBITDA beside revenue), always with a direct label | |
| sand / slate | `C49A5B` / `5E5552` | Third and fourth series when a stacked mix is drawn | Not used in the sample |

Not used in this direction: `F5EDEC` tint fills, callout boxes, the gold cover rule (the cover rule is maroon), semantic red or green, any grey fill.

## 4. Table style

AMB's exhibit grammar with the restraint of a bank book. Confirmed in render (pptxgenjs 4.0.1, LibreOffice):

- Header band filled `7B0000`, Arial Bold 8 pt white; figures right-aligned, group labels centred, the tier-2 first cell names the table left-aligned ("Income statement", "Reconciliation").
- Two-tier headers on financial tables: tier 1 the period group ("Fiscal year ended Dec-31", "Growth y/y"), tier 2 the periods (`FY2023`). A 0.08 in white gap column separates period groups; the header band and section fills break at the gap.
- No vertical rules, no zebra striping, no cell boxes. Numeric tables have no row hairlines; text tables separate rows with 0.5 pt `C2BAB8`.
- Section rows filled `FFE1E1`, bold 8.5 pt, no figures. Subtotals bold with a 0.5 pt ink top rule. Key totals (Reported EBITDA, Adj. EBITDA, SDE, Total) bold with 0.75 pt maroon top and bottom rules, no fill. Ratio rows italic directly under their total.
- Figures: `$` on the first row and on total rows only; negatives in parentheses; zero is an en dash; `n.m.` where a growth rate has no meaning. Whole thousands in tables; prose carries the decimal where the source has it ($136.5K).
- Reference column: tier codes `[N1]`, `[S1]`, `[S2]` in a 0.45 in centred column beside the label on the reconciliation, and in the first column of the support table.
- Cell margins `[0, 0.05, 0, 0.05]` in inches (pptxgenjs 4 treats values below 1 as inches). Borders are always four-element arrays with `{ type: 'none' }` on unused sides.
- Widths: label column 2.3 to 3.3 in; value columns 0.62 to 0.78 in; text-table columns sized so that no cell wraps past three lines.

## 5. Chart style

Native `addChart` only, the 2.6 palette, no dual axes, no pies.

- Bars: gap width 60%, no outline, no gridlines, value axis hidden, data labels Arial 8 pt ink at the outer end in `#,##0`. Category axis 0.5 pt `C2BAB8`, labels 8 pt muted, never rotated, no tick marks.
- No plot-area or chart-area frame. In pptxgenjs, omit the `border` key on `plotArea` and `chartArea` entirely; any border object draws a line.
- Two series: `7B0000` and `DCC7C4`, legend at the top in 8 pt. One series: no legend; the exhibit header names it.
- Horizontal bars for category lists (revenue by service line), `catAxisOrientation: 'maxMin'` so the first category reads at the top.
- Chart height 2.2 to 2.65 in in the sample; the one annotation (a CAGR or a total) sits right-aligned on the exhibit header line, not inside the plot.
- A 0.5 pt `C2BAB8` hairline separates a chart block from the commentary beneath it.

## 6. Page furniture

- Title zone: Georgia Bold 20 pt ink, bottom-anchored, then the 0.75 pt maroon rule at y 1.06.
- Exhibits are numbered `Exhibit <page>.<n>`: the number locates the page, so a cross-reference ("see Exhibit 4.2") needs no page number. Numbering restarts on each page.
- Notes band, in this order: `Source: ...`, `Note: ...`, then numbered footnotes `(1)`, `(2)` on one line separated by three spaces. Every page carries a source line and the units/unaudited note; every management figure carries `(n) Per management; not independently verified.`; the first page showing Adj. EBITDA carries the non-GAAP note with the page reference.
- Footer, left: `Project Ridgeline  |  <Section name>`, 7.5 pt, project in muted, separator in `C2BAB8`, section in maroon, sentence case, no letter-spacing. Centre: `Strictly private and confidential`. Right: colour logo 0.22 in tall (right edge at x 12.30), page number 8 pt ink right-aligned to x 12.883.
- No page header, no running title, no logo top-right, no date except on the cover.

## 7. Cover and divider anatomy

Cover (page 1): white field. Colour logo top-left, 2.40 in wide at (0.70, 0.62). Codename in Georgia Regular 40 pt ink, bottom-anchored at y 3.05 to 3.90. One 1 pt maroon rule, 2.0 in long, at (0.72, 4.05). "Confidential Information Memorandum" Arial 16 pt ink at y 4.18; month and year Arial 11 pt muted at y 4.56. Footer rule at y 7.00 with the confidentiality sentence at left ("Strictly private and confidential. Prepared by AMB Advisory Services LLC for recipients who have executed a confidentiality agreement with AMB Advisory.") and "Tampa, Florida  ·  ambadvisoryservices.com" at right, both 7.5 pt muted. Nothing else: no business name, no tagline, no imagery.

Divider (used only when the CIM reaches 24 pages; not in the seven-page sample): the same white page with the section name in Georgia Regular 28 pt ink at the cover's codename position, the same 2.0 in maroon rule beneath it, and the section list at cols 7 to 12 in Arial 13 pt, current section bold, page numbers right-aligned, a 0.5 pt `C2BAB8` rule under each row. Page number in the footer; no tracker.

## 8. What makes it distinctively AMB

- The filled `7B0000` header band on every table, the `FFE1E1` section rows, signed `(+) / (–)` row labels, en-dash zeros and `$000s` in the exhibit header are AMB's own exhibit grammar from the diligence workbook and P&L overview packs, redrawn natively.
- The maroon-ruled key total replaces AMB's yellow boxed total; the idea (a boxed earnings line) survives, the spreadsheet look does not.
- Tier-coded adjustments `[N1]`, `[S1]`, `[S2]` with a support table (Ref, Adjustment, Basis, Evidence) continue AMB's definitions-panel habit.
- The Quick Stats table, the "Considerations for buyers" table (Consideration, What the data shows, How it is addressed) and the bold-lead commentary bullets are AMB's memo furniture in sell-side form.
- The footer tracker in sentence case with the section in maroon, the colour logo at 0.22 in, and the AMB voice: conclusion first, mechanism, number, implication; every claim carries a figure and a comparison.

## 9. What makes it distinctively not AI

- Nothing is decorated. No badges, cards, tiles, kickers, icons, chevrons, gradients, shadows, rounded corners, colour bars or callout boxes. Structure comes from hairlines and type alone.
- Titles are ink, not maroon, and are findings with numbers, not labels.
- Density: every page holds two or three exhibits plus prose or bullets; tables run 15 to 20 rows; text tables carry three columns of full sentences.
- Numbers reconcile by construction: the generator computes every figure from one data block and throws if the stated Adj. EBITDA, SDE or CAGR fail to reproduce.
- Footnotes and source lines on every page, exhibit numbers, page numbers and the confidentiality line: the furniture of a bank book, not of a slide template.
- The prose is specific: named systems (ServiceTitan, QuickBooks Online), named suppliers, counts, tenures, percentages and their comparisons, with management figures flagged and pro forma assumptions stated as not included.

## 10. Render and QA notes

- Build: `node build-deck.js`. Render: LibreOffice via the pptx skill's `soffice.py`, then PyMuPDF at 100 dpi. Validate: the skill's `validate.py` (passes).
- Fonts in QA: Georgia renders as Liberation Serif, Arial as Liberation Sans (metric-compatible). Title boxes carry about 10% slack.
- Traps handled in the generator: pptxgenjs cell margins are inches; borders must be four-element arrays with explicit `none`; chart `plotArea.border` draws a frame if present; the repository's `"type": "module"` requires the local `package.json`.
