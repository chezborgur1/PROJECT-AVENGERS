# Direction C: "Exhibit-forward databook"

**What it is.** A QoE-report / Houlihan Lokey databook hybrid in AMB's identity. Every page is led by its exhibits (two or three per page on a strict 12-column grid), each table carries an `Obs.` column whose letters key a "Key observations" list beside it, every financial table adds analytic columns (y/y, CAGR, change in bps), and the page furniture is a persistent footer with the section tracker and a full source line. It is the densest of the three directions: 14 exhibits across 6 content pages (2.3 per page) against the guide's floor of 1.5.

**What it follows.** `docs/HOUSE_STYLE.md` sections 1 to 4 in full: maroon `7B0000` as the working colour, the tight-cropped colour logo, Georgia Bold titles and Arial everything else, filled maroon table headers, `FFE1E1` section rows, no valuation, coded customers, the period vocabulary, the 2.6 chart palette, the banned-pattern list in 2.10 and the banned-word list in 4.4. This document records only the choices this direction makes where the guide leaves room, and the exact geometry the sample uses.

**Files.** `build-deck.js` (self-contained pptxgenjs 4 generator; `node build-deck.js` writes `deck.pptx`), `package.json` (`"type": "commonjs"` so the script runs under the repository's ESM package), `amb-logo-tight.png` (colour logo cropped to its ink box, 1862 x 606 px, aspect 3.073; the reversed `amb-logo-white-tight.png` is the divider asset), `deck.pptx`, `page-01.png` to `page-07.png` (LibreOffice render at 100 dpi), `render.sh` (scratch helper).

---

## 1. Grid and margins

| Item | Value |
|---|---|
| Page | 13.333 x 7.5 in (`LAYOUT_WIDE`) |
| Side margins | 0.45 in; content width 12.433 in |
| Columns | 12 x 0.853 in with 0.20 in gutters; column *k* starts at `0.45 + (k - 1) x 1.053` |
| Title zone | y 0.30 to 1.00, title bottom-anchored; title rule 0.75 pt `7B0000` at y 1.06 |
| Content band | y 1.22 to 6.45 (this direction keeps 6.45 to 6.50 as a guard above the notes) |
| Notes band | y 6.50 to 6.96, bottom-anchored, 7 pt: `Source:` line, `Note:` line, numbered footnotes |
| Footer rule | 0.5 pt `C2BAB8` at y 7.00 |
| Footer row | y 7.06 to 7.30: tracker left, confidentiality centre, logo and page number right |
| Exhibit gap | 0.14 to 0.16 in vertically between an exhibit and the next exhibit or its observations list |
| Period gap | 0.08 in white column between period groups inside a numeric table (from V51's spacer columns) |

**Layouts used in the sample.** Every placement is on a column edge; nothing is centred by eye.

| Page | Left | Right |
|---|---|---|
| 2 Executive summary | Cols 1 to 7: Quick Stats table (15 rows, two blocks: fiscal years and Context) over the fact-order overview paragraph | Cols 8 to 12: Transaction summary text table (8 rows) over Key observations A to D |
| 3 Financial summary | Cols 1 to 6: summary income statement, 23 rows, three groups (fiscal year, growth, obs) | Cols 7 to 12: clustered bar chart 2.62 in tall over Key observations A to E |
| 4 Adjusted EBITDA | Cols 1 to 6: EBITDA ladder with `Ref` column, 21 rows, then the page's one callout | Cols 7 to 12: Adjustment support text table (`Ref / Adjustment / Basis / Evidence`) over Key observations A to D |
| 5 Revenue mix and customers | Cols 1 to 6: 100% stacked bar 2.6 in tall over the Service lines text table | Cols 7 to 12: Customer concentration table (13 rows, coded) over Key observations A to D |
| 6 Operations and people | Cols 1 to 7: four bold-lead paragraphs (about 290 words) over the Operating cost ratios table | Cols 8 to 12: Organization and tenure table over Facilities, fleet and systems table |
| 7 Considerations for buyers | Cols 1 to 12: Considerations text table (`Consideration / What the data shows / How it is addressed`); then cols 1 to 7: Owner responsibilities table | Cols 8 to 12 (lower half): Key observations A to C |

Fill: every content page covers more than 80% of the content band; no empty region exceeds two columns by 1.5 in (the guide's 3.2 rule). Pages 5 and 6 carry three exhibits, the others two plus the observations list.

## 2. Type scale

| Element | Face | Size | Weight and colour | Notes |
|---|---|---|---|---|
| Cover codename | Georgia | 40 pt | Regular, white | Bottom-anchored in the maroon band |
| Cover document line | Arial | 16 pt | Regular, white | |
| Cover date | Arial | 11 pt | Regular, `E9D3D5` | |
| Cover confidentiality line | Arial | 8 pt | Regular, `E9D3D5` | |
| Action title | Georgia | 20 pt | Bold, `7B0000` | Sentence case, no final stop, 1.0 leading, two lines at most (sample titles run 121 to 128 characters) |
| Exhibit header | Arial | 9.5 pt | Bold title `2C2523`, two spaces, Regular units `7A706D` | 0.5 pt ink rule 0.25 in below the header top; body starts at 0.33 in |
| Exhibit annotation | Arial | 8 pt | Regular, `7A706D` | Right-aligned on the header line, 55% of the exhibit width; one per chart at most |
| Body prose (text-led page) | Arial | 9.5 pt | Regular; paragraph lead-ins Bold | 1.08 leading, 7 pt after each paragraph |
| Overview paragraph (page 2) | Arial | 9.5 pt | Regular; defined term Bold | Under the Quick Stats table |
| Key observations: letter | Arial | 9.5 pt | Bold, `7B0000` | 0.30 in column, top-aligned |
| Key observations: text | Arial | 9 pt | Bold lead-in then Regular, `2C2523` | 0.5 pt `C2BAB8` rule between items; row height 0.395 to 0.47 in by page |
| Numeric table body | Arial | 8.5 pt | Regular; subtotals and key totals Bold; ratio rows Italic | Row height 0.195 in (0.19 on the customer list) |
| Numeric table `Ref` column | Arial | 8 pt | Regular, `7A706D` | `[D1]`, `[N1]`, `[S1]` |
| Numeric table `Obs.` column | Arial | 8.5 pt | Bold, `7B0000`, centred | Letters keyed to the observations list |
| Numeric table text columns (`Context`, `Basis`) | Arial | 8 pt | Regular, `7A706D` | Left-aligned inside a numeric table |
| Table header (both tiers) | Arial | 8 pt | Bold, white on `7B0000` | Row height 0.21 in |
| Text table body | Arial | 8 to 8.5 pt | Regular; first column Bold | Top-aligned; cell margins 0.035 in top and bottom, 0.05 in sides |
| Callout | Arial | 9 pt | Lead-in Bold `7B0000`; body Regular `2C2523` | 1.08 leading |
| Chart labels, axes, legend | Arial | 8 pt | Labels `2C2523` (white inside dark fills), axes `7A706D` | |
| Notes and footnotes | Arial | 7 pt | Regular, `7A706D` | 1.0 leading |
| Footer tracker | Arial | 7.5 pt | Project code `7A706D`, section name `7B0000` | Sentence case, no letter-spacing |
| Footer confidentiality | Arial | 7.5 pt | Regular, `7A706D`, centred on the page | |
| Page number | Arial | 8 pt | Regular, `2C2523`, right-aligned to x 12.883 | |

Floors: nothing below 7 pt; no table figure below 8 pt. No third face anywhere.

## 3. Colour roles

| Token | Hex | Where it appears in this direction |
|---|---|---|
| `maroon` | `7B0000` | Action titles, title rule, both header tiers of every table, key-total rules, the `Obs.` letters and the observation-list letters, primary chart series, callout left rule and lead-in, tracker section name, cover band |
| `ink` | `2C2523` | All body text and table figures, exhibit-header rule, chart data labels outside bars |
| `muted` | `7A706D` | Units in exhibit headers, annotations, `Ref` and `Context`/`Basis` columns, notes, footer, axis labels |
| `rule` | `C2BAB8` | Footer rule, text-table row separators, observation-list separators, chart category axis |
| `section` | `FFE1E1` | Table section rows only ("Revenue", "Normalization adjustments", "Operating (1)"); the fill breaks at the 0.08 in period gaps so each group reads as its own block |
| `tint` | `F5EDEC` | The one callout per page (used once in the sample, page 4) |
| `onMaroon` | `E9D3D5` | Secondary text on the cover band |
| `gold` | `C9A227` | One 1 pt rule, 2.0 in long, on the cover; nowhere else |
| Chart series | `7B0000`, `DCC7C4` (2 series); `7B0000`, `C49A5B`, `5E5552`, `DCC7C4` (3 to 4 series) | Fixed order; a fifth series folds into "Other" |

No semantic green or red. Direction is carried by sign, parentheses and words ("Documented", "Management representation"). Every coloured series is labelled.

## 4. Table style

Two table grammars, both native `addTable`, both with the maroon header band and no vertical rules, no zebra, no boxes.

**Numeric table (`numTable`).**

- Two-tier header when at least one period group is named: tier 1 carries the group ("Fiscal year", "Growth") centred across its columns, tier 2 carries the period or column name, and the first tier-2 cell names the table left-aligned ("Income statement", "EBITDA ladder", "Metric"). Tables of plain columns (the customer list, the cost-ratio table) draw a single tier; a blank maroon band above plain columns is never drawn.
- Column kinds: `label` (2.25 to 2.35 in), `ref` (0.45 in, muted), `num` (0.62 to 0.68 in, right-aligned), `text` (a left-aligned commentary column inside the table: `Context`, `Basis`), `obs` (0.38 to 0.40 in, maroon bold letters, centred), `gap` (0.08 in white).
- Row types: `section` (`FFE1E1` fill, bold label, no figures), `line` (indent 0.17 in), `sub` (indent 0.29 in), `subtotal` (bold, 0.5 pt ink top border), `key` (bold, 0.75 pt maroon top and bottom borders: Reported EBITDA, Gross profit, Adj. EBITDA, SDE, Total), `ratio` (italic, directly under its total, no rule).
- Every financial table carries analytic columns after a gap: `FY25 y/y` and `CAGR` on the income statement, `FY25 y/y` on the ladder, `FY23–25` change on the cost-ratio table. Ratio rows show the change in bps or pts in the analytic column.
- Figures: `$` on the first row of a block and on subtotal and key-total rows; body rows plain. Negatives `(33.0%)`; zero is an en dash `–`; not meaningful `n.m.`. Percentages 1 dp for margins, 0 dp for mix and shares. The sample shows `$000s` to one decimal because the brief states its figures to one decimal and every subtotal must foot to them; a production deck uses `#,##0` per the guide's 2.5.
- Signed labels on bridge rows: `(+) Interest expense`, `(+) Excess owner compensation`, with `[D1]`, `[N1]` to `[N4]`, `[S1]` in the `Ref` column.
- Size: at most 13 value columns and 23 body rows (the income statement on page 3 uses 23 at 0.195 in and fits the band with 0.6 in to spare).

**Text table (`textTable`).**

- Single maroon header row; body 8 to 8.5 pt top-aligned; first column bold; rows separated by 0.5 pt `C2BAB8` bottom borders; an optional `Obs.` column in maroon bold; an optional total row ruled 0.75 pt maroon top and bottom.
- Used for terms (`Term / Detail`), adjustment support (`Ref / Adjustment / Basis / Evidence`), service lines, organization, facilities, considerations and owner responsibilities. Row heights are set per row (0.2 in for one line of 8 pt, 0.3 to 0.32 in for two lines, 0.42 to 0.5 in for three) so LibreOffice and PowerPoint agree.

**Key observations list.** A two-column table with no header: a 0.30 in letter column (Arial Bold 9.5 `7B0000`) and the text column (bold lead-in of 3 to 10 words carrying a number, then one or two sentences with the mechanism). Its header is the same exhibit header as any exhibit ("Key observations") so the page reads as a set of ruled blocks. The letters match the `Obs.` column of the exhibit beside or above it; a row without a letter has no observation, and the list is never padded to match. Letters, not numerals, so they cannot be confused with the `(1)`, `(2)` footnote markers that sit in the same tables.

## 5. Chart style

- Native `addChart` only. Bar gap width 60%; no outlines, gridlines, 3-D, shadows or gradients; value axis hidden because every bar is labelled; category axis 0.5 pt `C2BAB8` with 8 pt muted labels, never rotated.
- Data labels Arial 8 pt, `#,##0` in the exhibit's units, `0"%"` on the mix chart. White inside `7B0000` and `5E5552` fills, ink on `C49A5B`, `DCC7C4` and outside bars. pptxgenjs cannot set label colour per series, so `patchCharts()` rewrites the chart XML after `write()`: the sand series' `dLbls` colour becomes ink, and every stacked series gets a 0.75 pt white `a:ln` so the segments separate with thin white gaps.
- Legend top-left, 8 pt, series order, for two or more series; none for one series. Series names are kept short enough to sit on one legend line ("Residential", "Commercial", "Maintenance agreements").
- One annotation per chart, right-aligned on the exhibit-header line in 8 pt muted: the CAGR pair on page 3, the mix shift on page 5. It carries the number the action title uses.
- Chart height 2.6 in or more (2.62 on page 3, 2.6 on page 5). Mix is a 100% stacked bar, never a pie or doughnut.
- Charts share the exhibit header, units and source line of the tables beside them so a chart never appears without its numbers in a table on the same page.

## 6. Page furniture

- **Title zone.** Georgia Bold 20 pt maroon, bottom-anchored in a 0.70 in box so one- and two-line titles sit the same distance above the rule. Every content title is a conclusion with at least one number and its period; no section prefix, no subtitle.
- **Exhibit headers.** Descriptive noun plus units ("Summary income statement  ($000s)", "Customer concentration, top 10  (FY2025, $000s)"). The conclusion lives in the action title and the observations, never in the exhibit title.
- **Notes band.** Bottom-anchored at y 6.96, 7 pt muted, in the guide's order: `Source:` (the systems and periods actually used, then "AMB Advisory analysis"), `Note:` (units, unaudited basis, fiscal year-end, definitions such as PM and T&M), then `(1)`, `(2)` footnotes restarting on each page. Footnote markers sit in the table labels they qualify ("Operating (1)", "Seller's discretionary earnings (SDE) (1)") and in the prose.
- **Footer.** `Project Ridgeline  |  Executive summary` left (code muted, section maroon, 7.5 pt); `Strictly private and confidential` centred; the tight colour logo 0.22 in tall with its right edge at x 12.30; page number 8 pt ink right-aligned to x 12.883. No header, no running title, no logo top-right, no date outside the cover.
- **Callout.** At most one per page and five per deck: `F5EDEC` fill, 2.25 pt maroon left rule, square corners, lead-in "Takeaway:", "Opportunity:" or "Note:" in bold maroon. The sample uses one (page 4), for the SDE-versus-Adj. EBITDA conclusion.

## 7. Cover and divider anatomy

**Cover (page 1, built).** White page. Tight colour logo 2.40 in wide at x 0.70, y 0.62. A `7B0000` band across the bottom third (y 5.00 to 7.50, full bleed) carrying: one 1 pt `C9A227` rule 2.0 in long at y 5.42; the codename in Georgia Regular 40 pt white bottom-anchored at y 5.50 to 6.28; "Confidential Information Memorandum" in Arial 16 pt white at y 6.36; the month and year in Arial 11 pt `E9D3D5` at y 6.72; the confidentiality line in Arial 8 pt `E9D3D5` at y 7.02. No business name, seller logo, tagline, folio or imagery. This is the one place this direction departs from the guide's full-bleed maroon cover: the white field with the maroon band is the databook's signature and it is what the dividers echo.

**Divider (specified; not needed in the 7-page sample, which uses "Considerations for buyers" as page 7).** The cover inverted in weight: white page, the maroon band across the bottom third carrying the section name in Georgia Regular 28 pt white bottom-anchored at y 5.50 to 6.28, and the page number only in the footer position. Above the band, at cols 1 to 8 from y 1.30, the section list in Arial 13 pt, rows 0.50 in apart with a 0.5 pt `C2BAB8` rule under each, the current section bold maroon and the others muted, page numbers right-aligned. At cols 9 to 12 from y 1.30, the databook touch: "Exhibits in this section", a two-column text table (`Exhibit / Page`) listing every exhibit header the section contains. No numerals, no circles, no "Section 4" kicker. Dividers appear only when the CIM has 24 or more pages.

## 8. What makes it distinctively AMB

- AMB's own exhibit grammar, taken from the V51 workbook and the PLO/PACK exhibit packs and redrawn cleanly: the `7B0000` header band with the table name in the first cell, `FFE1E1` section rows, white spacer columns between period groups, `$000s` stated in the exhibit subtitle, `(+)` signed bridge labels, en-dash zeros, bracketed negatives, italic `% margin` rows directly under their totals, and the maroon-ruled key totals that replace V51's yellow boxes.
- The `[N1]`/`[S1]` tier codes and the `Ref / Adjustment / Basis / Evidence` support table, which is AMB's memo "Consideration / Impact / Verification" habit turned into a databook exhibit.
- The `Context` and `Basis` columns inside numeric tables: AMB's "Key Metric / Finding" table and its "Commentary:" paragraphs, compressed into the table itself.
- Georgia Bold maroon titles (AMB's bold serif maroon headings, upgraded), Arial figures, the tight-cropped logo on white, "Takeaway:" as the callout lead-in, the "Strictly private and confidential" line, the fact-order overview paragraph with the defined term ("Ridgeline" or the "Company"), the Seller and AMB Advisory name treatments.
- The voice: conclusion, mechanism, number, implication; "because" and "from X to Y" in every observation; management figures footnoted "Per management; not independently verified."

## 9. What makes it distinctively not AI-generated

- Nothing from the banned list: no numbered circles, no rounded cards, no stat tiles or hero numbers (the Quick Stats block is a ruled table with a Context column), no letter-spaced kickers, no circles, blobs, gradients or shadows, no icon rows, no colour bars or header bars as decoration, no centred body text, no pie or doughnut, no "Key takeaways" box on every page, no title case.
- Density that only a human analyst produces: two or three exhibits per page, 120 to 290 words of commentary, every bullet carrying a figure, and a full income statement of 23 rows on one page at 8.5 pt.
- Structure that ties commentary to evidence: an `Obs.` column on the exhibit and a lettered list beside it, so each claim points to a row. Generated decks put bullets next to charts; databooks key them.
- Analytic columns (y/y, CAGR, bps change), footnote markers attached to the rows they qualify, a `Source:` line naming systems and periods, coded customers with tenure and basis, and figures that tie to one data block (`assertTies()` refuses to build if the constructed P&L does not foot to the stated revenue, EBITDA, Adj. EBITDA, SDE, margins and CAGR).
- Uneven, evidence-led pages: page 3 has five observations, page 7 three; page 6 is prose-led with three tables; page 4 carries the deck's only callout. No page has the same count of equal-length bullets as its neighbour.
- Precise figures everywhere ($452.9K, 19.3%, 0.7% of revenue) and plain sentence-case titles that state a finding.

## 10. Build and render notes

- pptxgenjs 4.0.1, `LAYOUT_WIDE`, hex colours without `#`, `isTextBox: true` on every text box, native `addChart` and `addTable`, `addImage` for the logo. Cell margins are in inches (`[0, 0.05, 0, 0.05]`); borders are four-element arrays with `{ type: 'none' }` on unused sides.
- `package.json` in this folder sets `"type": "commonjs"` so `node build-deck.js` runs under the repository's ESM package without renaming the script.
- The render environment substitutes Liberation Serif for Georgia (narrower and lighter) and Liberation Sans for Arial (metric-compatible, so table and prose wrapping matches PowerPoint). Titles are held to 121 to 128 characters so they stay on two lines with about 10% slack in Georgia; every text row height is set to the wrapped line count so LibreOffice and PowerPoint agree.
- `validate.py` passes on `deck.pptx`. The render check covered every page for overflow, overlap, collisions with the notes band and low contrast; the fixes made during the check are the reason for the single-tier header on plain-column tables, the 55% annotation width on exhibit headers and the per-row heights in the text tables.
