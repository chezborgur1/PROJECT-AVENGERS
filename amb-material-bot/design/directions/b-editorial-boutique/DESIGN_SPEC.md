# Direction B, "Editorial boutique": CIM deck system

**Status:** design direction, render-checked on the 7-page Project Ridgeline sample (`deck.pptx`, `page-01.png` to `page-07.png`, generator `build-deck.js`). Everything not stated here follows `docs/HOUSE_STYLE.md` sections 1 to 4. Where this direction departs from the guide the departure is marked **Departs** with the reason; everything else is the guide executed.

The idea: the confidence of a Moelis or PJT sell-side book with an editorial eye. A large serif headline across the full measure, a one-line deck under it, and a structural left margin column that carries the section tracker, exhibit numbers and footnotes the way a well-set journal carries marginalia. Maroon is used only structurally (title rule, margin rule, table header bands, one highlighted row per table, callout rule, bullet squares). Everything else is ink on white, with the guide's warm neutral `F5EDEC` behind secondary exhibits.

---

## 1. Grid and margins

Page: pptxgenjs `LAYOUT_WIDE`, 13.333 × 7.5 in. Side margins 0.45 in; content width 12.433 in (x 0.45 to 12.883).

**Horizontal structure (every content page)**

| Zone | x (in) | Width (in) | Carries |
|---|---|---|---|
| Margin column | 0.45 | 1.60 | Section tracker (deck row), exhibit labels, numbered footnotes |
| Gutter | 2.05 | 0.20 | 0.75 pt `maroon` vertical rule centred at x 2.15 |
| Body column | 2.25 | 10.633 | Exhibits, commentary, source and note lines |

Inside the body column the sample uses four splits, all measured from x 2.25:

| Split | Left block | Right block | Used on |
|---|---|---|---|
| Table + chart-and-rail | 5.70 in | 4.58 in (gap 0.35) | p3 financial summary |
| Wide table + narrow rail | 7.75 in | 2.68 in (gap 0.30, 0.5 pt `rule` hairline 0.15 in left of the rail) | p4 EBITDA schedule |
| Chart + tables | 4.55 in | 5.73 in (gap 0.35) | p5 revenue mix |
| Text-led | 4.85 to 5.05 in text | 5.28 to 5.43 in tables (gap 0.30 to 0.35) | p2 executive summary, p6 operations |
| Full width | 10.633 in | | p7 considerations |

**Vertical bands (fixed)**

| Band | y (in) | Contents |
|---|---|---|
| Title zone | 0.20 to 1.04 | Action title, bottom-anchored (one or two lines sit the same distance above the deck row) |
| Deck row | 1.08 to 1.34 | Margin: section name over page topic. Body: the deck line |
| Title rule | 1.40 | 0.75 pt `maroon`, full content width |
| Body | 1.56 to 6.50 | Exhibits and commentary (4.94 in) |
| Notes band | 6.56 to 6.94 | Body column: `Source:` then `Note:`, bottom-anchored, 7 pt. Margin column: numbered footnotes, bottom-anchored, 7 pt |
| Footer rule | 7.00 | 0.5 pt `rule` |
| Footer row | 7.06 to 7.30 | Project code, confidentiality line, logo, page number |

The vertical margin rule runs from the title rule (y 1.40) to the bottom of the notes band (y 6.94), so the title rule and margin rule read as one T-shaped structure and the notes band belongs to the column it sits under.

**Departs:** the guide's 12-column grid and its L1 to L6 archetypes are replaced by the margin-plus-body structure above. The archetypes' intent (exhibit + rail, wide table + narrow rail, text-led, full width) survives as the body-column splits. The body loses 1.8 in of width to the margin column; tables are set full width of the body and type is one step tighter (section 2) so density targets still hold.

**Spacing rules.** Exhibit header to exhibit body: 0.33 in. Between stacked exhibits: 0.28 in. Between an exhibit and the commentary under it: 0.20 in. Between a table and its callout: 0.20 in. A tinted panel extends 0.12 in left of its exhibit, 0.02 in above the header and 0.10 in below the chart. Nothing may enter the notes band from above; the sample's tightest page (p5) ends its bullets at y 6.48.

## 2. Type scale

Two faces only: Georgia (titles, deck, cover) and Arial (everything else). Render note: LibreOffice substitutes Liberation Serif for Georgia, which is narrower; the title box carries about 10% slack so real Georgia fits. Titles are capped at 130 characters for that reason (the guide's 150 would need a third line at 22 pt).

| Element | Face | Size | Weight | Colour | Notes |
|---|---|---|---|---|---|
| Cover codename | Georgia | 44 pt | Regular | white | bottom-anchored at y 3.90 |
| Cover document line | Arial | 16 pt | Regular | white | |
| Cover descriptor and date | Arial | 11 pt | Regular | `onMaroon` | two lines under the document line |
| Action title | Georgia | **22 pt** | Bold | `maroon` | full measure, max 2 lines, 60 to 130 characters |
| Deck | Georgia | **11.5 pt** | Regular | `maroon` | one line, body column only, ≤ 115 characters; states the mechanism behind the title, never restates it |
| Section tracker (margin, deck row) | Arial | 8 pt | Bold section / regular topic | `maroon` / `muted` | sentence case, no letter-spacing |
| Exhibit header | Arial | 9.5 pt | Bold title, regular units | `ink` / `muted` | 0.5 pt `ink` rule 0.25 in below the header top |
| Exhibit annotation | Arial | 7.5 pt | Regular | `muted` | right end of the header line, one per chart |
| Margin exhibit label | Arial | 7.5 pt | Bold "Exhibit n" / regular coverage line | `ink` / `muted` | aligned to the exhibit's top; ≤ 40 characters of coverage |
| Body paragraphs (text-led pages) | Arial | 9.5 pt | Bold lead-in | `ink` | leading 1.10, 6 pt after |
| Commentary bullets | Arial | **9 pt** | Bold lead-in | `ink` | leading 1.08, 5 pt after, maroon ▪ glyph, 11 pt hanging indent |
| Callout | Arial | 9.5 pt | Bold `maroon` lead-in ("Takeaway:") | `ink` | |
| Numeric table body | Arial | 8.5 pt | Regular; subtotals bold; ratios italic | `ink` | row 0.195 in; highlighted row 0.215 in |
| Text table body | Arial | 8.5 pt fact tables, 9 pt the considerations table | First column bold | `ink` | rows grow to fit; set 0.22 in per line of text |
| Table header | Arial | 8 pt | Bold | white on `maroon` | row 0.21 in |
| Chart labels and axes | Arial | 8 pt | Regular | `ink` labels, `muted` axes | |
| Footer | Arial | 7.5 pt | Regular | `muted`; page number 8 pt `ink` | |
| Notes, sources, footnotes | Arial | 7 pt | Regular | `muted` | floor of the deck; nothing smaller |

**Departs:** title 22 pt (guide 20), body 9 to 9.5 pt (guide 10), text tables 8.5 pt (guide 9). The larger title and the deck are the direction's typographic hierarchy; the tighter body is what pays for the margin column while keeping 120 to 220 commentary words per page.

## 3. Colour roles

Hex values are the guide's tokens; no new colours.

| Token | Hex | Role in this direction |
|---|---|---|
| `maroon` | `7B0000` | Structural only: action title, deck, title rule, margin rule, section name in the tracker, table header bands, **one highlighted row per table** (the row the page's title is about, white bold text), key-total rules, callout left rule, bullet squares, chart bars, cover field |
| `ink` | `2C2523` | All body text, table figures, exhibit titles, chart data labels, page number |
| `muted` | `7A706D` | Deck-row topic, coverage lines, units, annotations, chart axis labels and category labels, footer, notes |
| `rule` | `C2BAB8` | Footer rule, text-table row separators, rail hairline, chart axis lines |
| `tint` | `F5EDEC` | Exhibit panels behind charts and fact tables (secondary exhibits); callout fill; the gap column inside a table that sits on a panel |
| `section` | `FFE1E1` | Reserved for table section rows on longer income statements (not needed on the sample's summary tables) |
| `onMaroon` | `E9D3D5` | Secondary text on the cover |
| `gold` | `C9A227` | One 1 pt rule on the cover, 2.0 in long |
| `white` | `FFFFFF` | Page; primary numeric tables sit directly on white |

Rules: the primary numeric table on a page is always on white; a chart or a fact table sits on a `tint` panel; at most one callout per page; no semantic red or green; colour never carries meaning without a label; every coloured chart series is labelled directly.

**Departs:** the guide keeps `tint` for callouts and in-table banners only. Here it is also the warm-neutral exhibit background the direction brief asks for. The highlighted row (maroon fill, white text) replaces the guide's ruled key total for the single most important row of each table; the other key totals keep the guide's 0.75 pt maroon top-and-bottom rules.

## 4. Table style

AMB's exhibit grammar (maroon header band, `$000s` in the exhibit header, signed row labels, en-dash zeros) set full width of its block.

- **Header band.** Fill `maroon`, Arial Bold 8 pt white; figures right-aligned, text columns left-aligned. Two tiers on the income statement: tier 1 group label ("Fiscal year") centred across its columns, tier 2 the periods, tier-2 first cell names the table ("Income statement"). The 0.08 in gap column between the period block and the CAGR block breaks the band, section rows and key-total rules, so each block reads on its own. On a tinted panel the gap column is filled `tint`, not white.
- **Row grammar.** Line items indented 2 spaces; ratio rows and sub-lines 4 spaces, italic; subtotals flush, bold, 0.5 pt `ink` top rule; key totals flush, bold, 0.75 pt `maroon` top and bottom rules; the highlighted row flush, bold, `maroon` fill, white text, 0.215 in tall. One highlighted row per table at most (Adj. EBITDA on p2, p3 and p4).
- **Figures.** `$000s` with one decimal on this Main Street sample (`$2,406.8`, `7.5`), because add-backs of $0.5K matter at this scale and the figures must tie to the schedule to the last digit shown; whole thousands remain the default above about $10M of revenue. `$` on the first row of a block and on subtotal and key-total rows only. Negatives in parentheses, zero as an en dash, `n.a.` where a growth rate has no prior period. Growth and CAGR at one decimal to match the stated 12.4% CAGR; margins at one decimal.
- **Reference codes.** `[S1]`, `[N1]` to `[N4]` in their own bold 0.48 in column; the basis column states the record each figure comes from and carries the footnote marker.
- **Borders.** No vertical rules, no zebra striping, no box per cell. Every cell's border is written as a four-element array with `none` on the sides (LibreOffice draws unset sides in black otherwise). Text tables use 0.5 pt `rule` bottom borders; numeric tables have no row hairlines.
- **Widths.** Income statement label column 2.38 in, value columns 0.80 in, CAGR 0.72 in. Schedule: ref 0.48, adjustment 2.20, values 0.72, basis 2.87 in. Text tables: first column 1.20 to 2.00 in. Cell margins 0.05 in left and right; 0 top and bottom on numeric tables, 0.03 in on text tables (0.04 in and 9 pt on the considerations table).
- **Limits.** 13 value columns and 22 body rows per table; rows grow with wrapped text, so the generator sets each row's height from its longest cell and computes the next exhibit's y from the sum.

## 5. Chart style

Native `addChart` bar charts only; no images, no dual axes, no pies.

- Single series in `maroon`, gap width 60%, no outline, no gridlines, value axis hidden, every bar labelled (`#,##0.0` in `ink`, 8 pt, outside end). Category axis 0.5 pt `rule`, no tick marks, labels 8 pt `muted` (vertical bars) or `ink` (horizontal bars whose labels carry the share, "Commercial (27%)"). `valAxisMaxVal` set with about 20% headroom so the top label never clips.
- Chart area and plot area both filled `tint`, so the chart is flush with its panel; the panel carries the exhibit header and the one annotation ("Margin 10.9% to 14.9%").
- Two magnitudes are two panels sharing one exhibit header (p3: revenue and Adj. EBITDA side by side, each captioned in 8 pt `muted`), never a secondary axis.
- Mix is a horizontal bar with `catAxisOrientation: "maxMin"` so the first category sits on top (p5), or a 100% stacked bar when more than one year is available (palette `7B0000`, `C49A5B`, `5E5552`, `DCC7C4` in that order; light fills always direct-labelled).
- Minimum chart height 1.9 in inside a panel of 2.78 to 2.80 in; the panel, not the chart, is the layout unit.

## 6. Page furniture

- **Title.** Georgia Bold 22 pt `maroon` across the full content width, bottom-anchored in the title zone. One sentence, sentence case, a number in it, no full stop.
- **Deck row.** Left, in the margin column: section name (Arial Bold 8 pt `maroon`) over the page topic (Arial 8 pt `muted`), vertically centred on the deck. Right, in the body column: the deck (Georgia 11.5 pt `maroon`), one line. This row is the direction's section tracker: sentence case, no caps, no letter-spacing, and never above the title.
- **Rules.** Title rule 0.75 pt `maroon` at y 1.40; margin rule 0.75 pt `maroon` at x 2.15 from y 1.40 to 6.94; footer rule 0.5 pt `rule` at y 7.00; rail hairline 0.5 pt `rule` where a narrow rail sits beside a wide table.
- **Exhibit header.** In the body, above the exhibit: title Arial Bold 9.5 pt `ink`, two spaces, units in `muted` ("Summary income statement  ($000s)"); 0.5 pt `ink` rule 0.25 in below; the exhibit body 0.33 in below. Titles are descriptive nouns; the conclusion is in the action title.
- **Margin exhibit label.** "Exhibit n" (Arial Bold 7.5 pt `ink`) with a one-line coverage or basis note in `muted` ("Fiscal years to December 31", "Largest customer coded C-001"), top-aligned to the exhibit header. When two exhibits start on the same row their labels stack in order, 0.40 in apart. Commentary may point to an exhibit by number within the page; cross-page references still use page numbers ("page 4").
- **Footnotes.** Numbered `(1)`, `(2)`, restarting on each page, set as marginalia in the margin column, Arial 7 pt `muted`, bottom-anchored to y 6.94, 3 pt between notes. The marker is attached to the figure it qualifies, in text and in table labels. Keep each footnote under about 110 characters (three margin lines).
- **Source and note.** In the body column's notes band, bottom-anchored to y 6.94: `Source: …` on the first line, `Note: …` on the second (units, unaudited status, non-GAAP statement, fiscal year-end).
- **Footer.** Left "Project Ridgeline" (7.5 pt `muted`); centre "Strictly private and confidential" (7.5 pt `muted`); right the tight colour logo 0.22 in tall with its right edge at x 12.30, page number 8 pt `ink` right-aligned to x 12.883. No page header, no running title, no logo top-right.
- **Callout.** `tint` fill, 0.03 in `maroon` left rule (2.25 pt), square corners, no icon; lead-in "Takeaway:", "Opportunity:" or "Note:" in Bold `maroon`; one per page at most, under the primary table.
- **Bullets.** Bold lead-in of 3 to 8 words, then one or two sentences with the number; glyph ▪ in `maroon` (written as `<a:buClr>` by a post-pass in the generator because pptxgenjs has no bullet-colour option), 11 pt hanging indent, 5 pt after.

**Departs:** the guide places the section tracker in the footer (D9) and cross-references without exhibit numbers. Here the tracker moves to the margin column beside the deck (the footer keeps the project code) and exhibits carry numbers in the margin. Both keep the guide's intent (sentence case, maroon section name, no kicker above the title) and give the margin column its job.

## 7. Cover and divider anatomy

**Cover (p1).** Full-bleed `maroon` field, nothing else drawn on it. White tight logo 2.40 in wide at (0.70, 0.62). Codename "Project Ridgeline" Georgia 44 pt white, bottom-anchored at y 3.90 from x 0.70. A 1 pt `gold` rule 2.0 in long at y 4.05. Then the title stack in Arial: "Confidential Information Memorandum" 16 pt white at y 4.18; a one-line descriptor "Residential and commercial HVAC and plumbing services  |  Columbus, Ohio" 11 pt `onMaroon` at y 4.58; the month and year 11 pt `onMaroon` at y 4.86. Bottom line at y 6.72, 8 pt `onMaroon`: the guide's confidentiality sentence. Not on the cover: the business name, a tagline, a folio, imagery, shapes.

**Divider (only when the CIM reaches 24 pages; not built in the 7-page sample).** The margin structure turns into the panel: a `maroon` field from x 0 to 4.60 in, full height, with the section name in Georgia Regular 28 pt white bottom-anchored at y 2.6 to 4.0 from x 0.70, and the page's deck-style one-liner under it in `onMaroon` 11 pt. On the right, from x 5.40 to 12.40, the section list from y 1.30 in 0.50 in rows: Arial 13 pt, current section Bold `maroon`, others `muted`, page numbers right-aligned, 0.5 pt `rule` under each row. Page number only in the footer; no numerals, no circles, no "Section 4".

## 8. What makes it AMB, and what makes it not AI

**Distinctively AMB**

- The maroon `7B0000` header band on every table, with the 0.08 in white gap between period blocks (V51 and PLO's spacer columns), `$000s` in the exhibit header, `(+)` signed rows, en-dash zeros, italic ratio rows under their totals, and the maroon-ruled key totals that replace the workbook's yellow boxes.
- The tier-coded adjustments `[S1]`, `[N1]` to `[N4]` with a basis column, straight from AMB's recast and TCC lineage, on the page a buyer reads first.
- Quick Stats (the deal-memo block), "Takeaway:" callouts, "Considerations for buyers" as `Consideration | What the data shows | How it is addressed`, and the "Company at a glance" fact-order paragraph, each an AMB document habit rebuilt as a slide element.
- Georgia Bold maroon headlines over Arial exhibits: AMB's serif-heading, Arial-exhibit split, with the crimson logo in the footer of every page and the white logo on the maroon cover.
- The writing: conclusion, mechanism, number, implication; named systems and suppliers; "per management" with a footnote; "what is not assumed" stated on the EBITDA page; no price opinion anywhere.

**Distinctively not AI-generated**

- No badges, cards, stat tiles, icon rows, chevrons, gradients, rounded corners, drop shadows, header bars or accent stripes; the only shapes on a content page are hairline rules, one tint panel per secondary exhibit and one callout.
- No kicker above the title, no title case, no "Investment highlights" label titles: every content title is a sentence with a number, and the deck under it adds a mechanism rather than restating it.
- Density instead of air: 120 to 220 words of commentary plus one to three exhibits per page, 15-row income statement, 12-row schedule with evidence, six-row considerations table; text is left-aligned and ragged; bullets are uneven in length because the evidence is.
- Structure that a template cannot fake: the margin column's labels align to the exhibits they name, footnotes are set as marginalia, the one highlighted row is the row the title is about, and the same maroon rule carries from the title across the page and down the margin.
- Numbers that reconcile: every figure is computed once in the generator from the sample inputs (gross profit, opex, adjustment totals, CAGRs, margins, per-member revenue) and the build fails if the ladder does not tie.

## 9. Known compromises in the sample

- Georgia renders as Liberation Serif in this environment (Gelasio is not installed), so titles look lighter and narrower than they will in PowerPoint; the title box keeps about 10% slack and the 130-character cap for that reason.
- Text tables are set at 8.5 pt rather than the guide's 9 pt on the two text-led pages, to keep both tables on the page beside a 270-word text column.
- Bullet glyph colour is applied by a small jszip post-pass on the slide XML (`<a:buClr>` before `<a:buChar>`), because pptxgenjs 4.0.1 has no bullet-colour option. The pass is idempotent and validate.py passes on the result.
- Only the FY2025 revenue mix is in the sample data, so p5 shows a single-year horizontal bar rather than the guide's multi-year 100% stacked bar.
