# AMB CIM deck: final design specification

**Status.** The production design system for the CIM deck, decided by the three-direction tournament of 2026-09-28 (`design/TOURNAMENT_RESULTS.md`). The system is Direction C, "Exhibit-forward databook" (`design/directions/c-exhibit-databook/`), carrying eleven grafts from Direction A ("Bulge-bracket classic") and Direction B ("Editorial boutique") and a fix for every weakness the three judges recorded. It inherits `docs/HOUSE_STYLE.md` sections 1 to 4 in full; where this document and the guide differ, the departure is stated with its reason. Where this document and a direction's `DESIGN_SPEC.md` differ, this document wins.

**How to read it.** Rules without a tag are Direction C as built and judged. **[G: A p4]** marks a graft and names the deck and page it came from. **[F]** marks a fix of a judge-recorded weakness; section 12 lists every weakness against its fix. All measurements are inches unless stated; all type sizes are points; all colours are hex without `#`, as pptxgenjs takes them.

**Files.** The reference implementation is `design/directions/c-exhibit-databook/build-deck.js` (pptxgenjs 4.0.1, `LAYOUT_WIDE`); the build pass that applies this document produces the production generator in `src/cim/`. The logo assets are the tight-cropped `amb-logo-tight.png` and `amb-logo-white-tight.png` (1862 x 606 px, aspect 3.073), derived from the 2048 masters in `brand/`.

---

## 0. Decisions at a glance

| Area | Direction C as judged | Final system | Why |
|---|---|---|---|
| Cover | White page, maroon band across the bottom third | Full-bleed maroon field per guide 2.9, with a cover footer line carrying city and web address | [G: B p1] [G: A p1] Three judges filed the band cover under "accent stripe" |
| Table figures | `$000s` to one decimal (`$2,406.8`) | Whole thousands `#,##0` in tables and chart labels; decimals stay in prose (`$136.5K`) | [G: A p3, p4] Guide 2.5; judges called the decimals "fussy" and "QoE schedule" |
| Two-tier header over `Obs.`, `Context`, `Basis` columns | Blank maroon tier-1 cell over a detached column | One merged cell spanning both tiers (`rowspan: 2`); text and `Obs.` columns attach to the block before them with no gap column | [F] All three judges: the blank maroon square and the orphan `FFE1E1` stubs |
| Quick Stats | One 15-row table with 12 empty year cells in the operating block | One exhibit, two tables: a financial numeric table (three years, CAGR, Context, Obs.) over an operating fact table (Metric / Value / Basis / Obs.) | [G: B p2] [G: A p2] [F] |
| EBITDA ladder | Net income to SDE with `[D]`, `[N]`, `[S]` tiers and a single `(+) Excess owner compensation [S1]` line | The same ladder with the owner-compensation mechanism shown: as paid, `(–)` market replacement, `(+)` above market `[S1]`; `(+)` market replacement `[S2]` before SDE | [G: A p4] |
| Column divider | None | 0.5 pt `C2BAB8` hairline centred in the gutter of every two-column page | [G: A p3 to p6] |
| Footnotes | One per line; four-line notes bands on four pages | Source line, Note line, and all footnotes on one line separated by three spaces; three lines maximum | [G: A p3] [F] |
| Chart for revenue and Adj. EBITDA | Clustered bars, legend centred | Twin single-series panels under one exhibit header, no legend | [G: B p3] [F] |
| Chart legends (where a legend exists) | Centred over the plot | Top-left, by XML patch | [F] Guide 2.6 |
| Titles | Every content title two full lines, 121 to 128 characters | 60 to 110 characters, one line where the finding allows; hard cap 130 | [F] Guide 4.5 |
| Observations list | "Key observations" in the same block on five of six pages | "Observations" with the keyed exhibit named in the units slot; placed with the exhibit it keys; absent on prose-led pages | [F] Judges' T16 concern |
| Considerations table | Five rows at a uniform 0.5 in | Rows sized to their wrapped lines; a mandatory "Financial reporting" row that names the data-room documents | [G: A p7] [G: B generator] [F] |
| Cost-ratio delta column | `bps` and `pts` mixed in one column | One unit per column, named in the header (`Δ bps`) | [F] |
| Callouts | One in the deck (p4) | Kept; at most one per page and three per deck; the EBITDA page's callout states what is not assumed | [G: B p4] [G: A p4] |

---

## 1. Grid and margins

**Page.** 13.333 x 7.5 (`LAYOUT_WIDE`). Side margins 0.45; content width 12.433 (x 0.450 to 12.883).

**Columns.** Twelve columns of 0.853 with 0.20 gutters. Column *k* starts at `x = 0.45 + (k − 1) x 1.053`. `spanW(a, b) = (b − a + 1) x 0.853 + (b − a) x 0.20`.

| Span | x | Width | Use in this system |
|---|---|---|---|
| Cols 1 to 12 | 0.450 | 12.433 | Title, notes, full-width tables (Considerations) |
| Cols 1 to 6 | 0.450 | 6.118 | Left exhibit of a two-exhibit page |
| Cols 7 to 12 | 6.768 | 6.118 | Right exhibit of a two-exhibit page |
| Cols 1 to 7 | 0.450 | 7.171 | Text block or wide table on a text-led page |
| Cols 8 to 12 | 7.821 | 5.065 | Tables beside a text block; lower-right observations |
| Cols 1 to 8 | 0.450 | 8.224 | Exhibit with a four-column rail (full CIM only) |
| Cols 9 to 12 | 8.874 | 4.012 | Commentary rail (full CIM only) |

**Gutter hairline [G: A p3 to p6].** On every page with two column blocks, a 0.5 pt `C2BAB8` vertical line centred in the gutter after the left block's last column: `x = colX(k) + 0.853 + 0.10` (6/6 split: x 6.668; 7/5 split: x 7.721; 8/4 split: x 8.774). It runs from y 1.22 to 6.48; on a page whose two-column block sits under a full-width exhibit (p7) it runs from the top of that block. It is drawn on the first content page as on every other (Direction A omitted it on its p2 and two judges caught it). Exhibits keep at least 0.10 clear of it, so a table in a six-column block is at most 6.02 wide. The hairline is the only vertical line on a content page; there are no panels, cards or tint fields.

**Vertical bands** (fixed on every content page):

| Band | y | Contents |
|---|---|---|
| Top margin | 0.00 to 0.30 | Empty |
| Title zone | 0.30 to 1.00 | Action title in a 0.70 box, bottom-anchored, so one- and two-line titles sit the same distance above the rule |
| Title rule | 1.06 | 0.75 pt `7B0000`, full content width |
| Content | 1.22 to 6.48 | Exhibits, observations, prose, callout. **Nothing crosses y 6.48** [F] |
| Notes | 6.58 to 6.92 | Bottom-anchored, 7 pt, at most three lines (section 6.3) [F] |
| Footer rule | 7.00 | 0.5 pt `C2BAB8`, full content width |
| Footer row | 7.06 to 7.30 | Tracker, confidentiality line, logo, page number |
| Bottom margin | 7.30 to 7.50 | Empty |

**Spacing constants.**

| Between | Gap |
|---|---|
| Exhibit header top and exhibit body | 0.33 (rule at 0.25) |
| An exhibit and the next exhibit's header | 0.14 |
| Two tables under one exhibit header (Quick Stats) | 0.12 |
| A chart and the observations list under it | 0.08 to 0.12 |
| A table and the observations list under it | 0.12 |
| A table or list and a callout | 0.14 |
| Period groups inside a numeric table (white gap column) | 0.08 |
| Prose paragraphs | 7 pt after |

**Column balance [F].** The two blocks of a page end within 0.50 of each other. When a block would end more than 0.50 short, it takes the observations list or the callout; a page is never padded with a taller row or a larger font to close the difference.

## 2. Type scale

Two faces: Georgia for the cover codename, divider names and action titles; Arial for everything else. Nothing below 7 pt; no table figure below 8 pt.

| Element | Face | Size | Weight and colour | Notes |
|---|---|---|---|---|
| Cover codename | Georgia | 40 | Regular, `FFFFFF` | Bottom-anchored (section 7.1) |
| Cover document line | Arial | 16 | Regular, `FFFFFF` | "Confidential Information Memorandum" |
| Cover descriptor (optional) and date | Arial | 11 | Regular, `E9D3D5` | |
| Cover footer line | Arial | 8 | Regular, `E9D3D5` | Confidentiality sentence left, city and web address right [G: A p1] |
| Divider section name | Georgia | 28 | Regular, `FFFFFF` | |
| Divider exhibit list | Arial | 9 | Regular, `E9D3D5` | Inside the maroon panel |
| Divider and contents list | Arial | 13 | Regular `7A706D`; current section Bold `7B0000` | Rows 0.50 |
| Action title | Georgia | 20 | Bold, `7B0000` | Sentence case, no final stop, 1.0 leading; 60 to 110 characters, hard cap 130 (about 85 characters per line) [F] |
| Exhibit header | Arial | 9.5 | Bold `2C2523`; two spaces; units Regular `7A706D` | 0.5 pt `2C2523` rule 0.25 below the header top |
| Exhibit annotation | Arial | 8 | Regular, `7A706D` | Right-aligned on the header line, 55% of the exhibit width, at most 45 characters [F] |
| Body prose (text-led pages) | Arial | 9.5 | Regular; run-in lead-ins Bold | 1.08 leading, 7 pt after each paragraph, left-aligned |
| Rail bullets (full CIM, L1 pages) | Arial | 9.5 | Bold lead-in, Regular evidence | Glyph U+25AA in `7B0000` by post-pass [G: B generator], hanging indent 0.15, 6 pt after |
| Observations: letter | Arial | 9.5 | Bold, `7B0000` | 0.30 column, top-aligned |
| Observations: text | Arial | 9 | Bold lead-in then Regular, `2C2523` | 1.05 leading; 0.5 pt `C2BAB8` rule between items |
| Numeric table body | Arial | 8.5 | Regular; subtotals and key totals Bold; ratio rows Italic | Row 0.195 (0.19 on lists of 12 or more rows) |
| Numeric table `Ref` column | Arial | 8 | Regular, `7A706D` | `[D1]`, `[N1]`, `[S1]` |
| Numeric table `Obs.` column | Arial | 8.5 | Bold, `7B0000`, centred | |
| Numeric table text columns (`Context`, `Basis`) | Arial | 8 | Regular, `7A706D` | Left-aligned, 0.08 left cell margin |
| Table header (both tiers) | Arial | 8 | Bold, `FFFFFF` on `7B0000` | Row 0.21 |
| Text table body | Arial | 8.5 (9 where the page has room; 8 floor) | Regular; first column Bold | Top-aligned; cell margins 0.035 top and bottom, 0.05 sides |
| Callout | Arial | 9 | Lead-in Bold `7B0000`; body Regular `2C2523` | 1.08 leading |
| Chart data labels, axis labels, legend, panel captions | Arial | 8 | Labels `2C2523` (white inside `7B0000` and `5E5552`); axes and captions `7A706D` | |
| Notes and footnotes | Arial | 7 | Regular, `7A706D` | 1.0 leading |
| Footer tracker | Arial | 7.5 | Project code `7A706D`; section name `7B0000` | Sentence case, no letter-spacing |
| Footer confidentiality line | Arial | 7.5 | Regular, `7A706D`, centred on the page | |
| Page number | Arial | 8 | Regular, `2C2523` | Right-aligned to x 12.883 |

**Departures from guide 2.2.** Body prose 9.5 pt (guide 10) and text tables 8.5 pt (guide 9) on dense pages; the guide allows both as minimums and the density targets in section 9 depend on them. Observation text 9 pt for the same reason.

## 3. Colour roles

| Token | Hex | Where it appears | Where it never appears |
|---|---|---|---|
| `maroon` | `7B0000` | Action titles, title rule, both header tiers of every table, key-total rules, `Obs.` letters and observation-list letters, primary chart series, callout left rule and lead-in, tracker section name, cover field, divider panel, rail bullet glyphs | Body text, filled data rows, panels behind exhibits, decorative bars |
| `ink` | `2C2523` | Body text, table figures, exhibit-header rule, chart data labels outside bars | |
| `muted` | `7A706D` | Units in exhibit headers, annotations, `Ref`, `Context` and `Basis` columns, notes, footer, axis labels, panel captions | Body text |
| `rule` | `C2BAB8` | Footer rule, gutter hairline, text-table row separators, observation-list separators, chart category axis | |
| `section` | `FFE1E1` | Table section rows only, filled across every non-gap column of the row | Anywhere outside a table |
| `tint` | `F5EDEC` | The one callout per page | Panels behind charts or tables (Direction B's device, rejected: section 13) |
| `onMaroon` | `E9D3D5` | Secondary text on the cover and the divider panel | |
| `gold` | `C9A227` | One 1 pt rule, 2.0 long, on the cover | Anywhere else |
| `white` | `FFFFFF` | Page background, set explicitly on every slide; header text on maroon; segment separators in stacked bars | |
| Chart series | `7B0000`, `DCC7C4` (2 series); `7B0000`, `C49A5B`, `5E5552`, `DCC7C4` (3 to 4 series); estimate or partial year `B5727A` | Fixed order; a fifth series folds into "Other" |

No semantic green or red. Direction is carried by sign, parentheses and words ("Documented", "Management representation"). Every coloured series is labelled directly. No highlighted rows with maroon fill and white text (Direction B's hero row, rejected: section 13).

## 4. Tables

All tables are native `addTable`. No vertical rules, no zebra striping, no box per cell, no fills other than the header band, section rows and the callout. Cell margins `[0, 0.05, 0, 0.05]` on numeric tables (inches; pptxgenjs 4 reads values below 1 as inches). Borders are always four-element arrays `[top, right, bottom, left]` with `{ type: 'none' }` on unused sides.

### 4.1 Numeric table

**Columns.** A column spec is `{ w, kind, head, group }` with kind one of:

| Kind | Width | Alignment | Content |
|---|---|---|---|
| `label` | 2.00 to 2.35 | Left; indent 0.05 (section, subtotal, key), 0.17 (line), 0.29 (sub-line) | Row label; footnote marker as a trailing 7 pt muted run `(1)` |
| `ref` | 0.45 | Left, 8 pt `7A706D` | `[D1]`, `[N1]`, `[S1]`, `[S2]` |
| `num` | 0.62 to 0.66 | Right | Figures |
| `text` | 1.70 to 4.20 | Left, 8 pt `7A706D`, 0.08 left margin | `Context`, `Basis` (a one-line qualifier per row) |
| `obs` | 0.36 to 0.40 | Centre, Bold `7B0000` | Letter keyed to the observations list |
| `gap` | 0.08 | | White; no fill, no borders, no text |

**Header [F].**
- Two tiers when at least one period group is named (`Fiscal year`, `Growth`). Tier 1 carries each group label centred across its columns with `colspan`. Tier 2 carries the period or column name; the first tier-2 cell names the table, left-aligned ("Income statement", "EBITDA ladder", "Financial").
- A `label`, `text` or `obs` column in a two-tier table has **one merged header cell spanning both tiers** (`rowspan: 2`; pptxgenjs inserts the vMerge placeholder into the tier-2 row itself, so the tier-2 array omits that cell). The merged cell carries the table name, "Context", "Basis" or "Obs.", bottom-aligned. No blank maroon cell exists anywhere in a header.
- A `gap` column is drawn **only between two period groups**. Text and `Obs.` columns are never preceded by a gap: they attach to the block before them, so the header band, section fills and key-total rules run continuously through them and no orphan stub is drawn. (Direction C's p2, p3 and p4 detached these columns behind a gap; three judges recorded the result.)
- Tables of plain columns (fact tables, the customer list, the cost-ratio table) draw a single tier.
- Header rows 0.21; Arial Bold 8 white; figures right-aligned, group labels centred, text-column heads left-aligned.

**Rows.**

| Type | Style |
|---|---|
| `section` | `FFE1E1` fill across every non-gap column; label Bold; no figures; `Obs.` and text cells empty |
| `line` | Regular; indent 0.17 |
| `sub` | Regular; indent 0.29 |
| `subtotal` | Bold; 0.5 pt `2C2523` top border on every non-gap cell |
| `key` | Bold; 0.75 pt `7B0000` top and bottom borders on every non-gap cell; no fill (Reported EBITDA, Gross profit, Adj. EBITDA, SDE, Total) |
| `ratio` | Italic; directly under its total; no rule; delta in the analytic column (`+40 bps`, `+2.6 pts`) |
| `memo` block | A `section` row "Memo" followed by up to two ratio rows [G: A p3, p4]; appended only when the table has at most 19 body rows before it (the 22-row cap in guide 2.5 holds); otherwise the memo figures are stated in the observations |

**Analytic columns.** Every financial table carries an analytic block after a 0.08 gap: `FY25 y/y` and `CAGR` on the income statement; `FY25 y/y` on the ladder; `CAGR` on the Quick Stats financial table; `Δ bps` on the cost-ratio table. Ratio rows show the change in the analytic column. **One unit per column, named in the header** [F]: a `Δ bps` column shows every value in bps (`−160 bps`, never `−1.6 pts` beside `−93 bps`).

**Figures [G: A p3, p4].**
- Whole thousands, `#,##0`: `$2,407`, `(939)`, `$1,882`. Decimals appear in prose and titles where the source has them (`$136.5K`, `$452.9K`, `$31.5K`). Chart data labels follow the table format.
- `$` on the first row of each block and on subtotal and key-total rows; body rows plain. Negatives in parentheses; zero is an en dash `–`; not meaningful `n.m.`; not available `n.a.`.
- Percentages: 1 dp for margins, growth and CAGR (so the exhibit matches the 12.4% CAGR the title quotes to the last digit, guide 4.5 rule 6; a stated departure from the 0 dp default in guide 2.5); 0 dp for mix and shares in stacked bars and `%` columns.
- Multiples 1 dp with `x`.
- Footing: the generator sums the *displayed* (rounded) figures of every block; when a displayed total differs from the sum of its displayed lines, the page's Note line gains "; totals may not sum due to rounding" [G: A p3]. The tie check (`assertTies()`) continues to run on unrounded values.
- Signed labels on bridge rows: `(+) Interest expense`, `(–) Market replacement compensation`, with tier codes in the `Ref` column.

**Limits.** At most 13 value columns and 22 body rows; larger tables split, summary in the body and detail in the appendix (guide 3.5).

### 4.2 Text table

Single maroon header row (0.21); body 8.5 pt top-aligned (9 pt where the page has room); first column Bold; rows separated by 0.5 pt `C2BAB8` bottom borders; optional `Obs.` column (Bold `7B0000`, centred); optional `Ref` column (`7A706D`); optional total row ruled 0.75 pt `7B0000` top and bottom. Cell margins `[0.035, 0.05, 0.035, 0.05]`.

**Row heights from the longest cell [G: B generator] [F].** The generator computes each row's height rather than setting a uniform value:

```
charW(pt, bold) = (bold ? 0.54 : 0.50) * pt / 72        // average Arial advance, inches
lines(text, colW, pt, bold) = ceil(len(text) * charW / (colW - 0.10))   // 0.10 = side margins
rowH(pt) = 0.07 + maxLines * (pt * 1.15 / 72)            // 8.5 pt: 0.21 / 0.34 / 0.48 for 1 / 2 / 3 lines
```

The height is the maximum over the row's cells. Arial and its render substitute (Liberation Sans) are metric-compatible, so LibreOffice and PowerPoint wrap the same way. This removes the line of slack per row the judges saw on Direction C p7, Direction A p7 and Direction B p7.

### 4.3 Fact table [G: B p5] [G: C p2 Context column]

A single-tier numeric table whose columns are `Metric | Value | Basis | Obs.` (widths 2.00 / 0.62 / 4.19 / 0.36 in a seven-column span; 1.55 / 0.62 / 2.52 / 0.36 in a five-column span). `Value` is right-aligned and carries its own unit in the cell (`1,450`, `82%`, `$189`, `8,000 sq ft`, `~35%`); `Basis` is the 8 pt muted text column stating the record or the derivation ("1,450 members across 14 service technicians"). Derived operating ratios belong here: revenue per technician, revenue per vehicle, members per technician, tune-up visits a year, replacements needed to hold the base flat [G: A p6] [G: B p5]. The fact table is used for the Quick Stats operating block, the Maintenance-agreement base exhibit and any fleet, facility or capacity metrics.

### 4.4 Observations list

A two-column table with no header row under an exhibit header: a 0.30 letter column (Arial Bold 9.5 `7B0000`) and a text column (Bold lead-in of 3 to 10 words carrying a number, then one or two sentences with the mechanism), items separated by 0.5 pt `C2BAB8` rules.

- **Header text [F].** "Observations" with the keyed exhibit in the units slot: "Observations  (keyed to the income statement)", "Observations  (keyed to the EBITDA ladder)", "Observations  (keyed to the top-10 list)". The list sits beside or under the exhibit it keys, never in a fixed corner of every page, and is absent on prose-led pages (p6), where run-in paragraphs carry the commentary.
- **Letters, not numerals**, so they cannot be confused with the `(1)`, `(2)` footnote markers in the same tables. A row without an observation gets no letter; the list is never padded to match the table and its count follows the evidence (the sample runs 3, 5, 3, 4, none, 3).
- Row heights: `0.09 + lines x 0.145` at 9 pt (0.38 for two lines, 0.525 for three), computed as in 4.2 from the text column's width.

### 4.5 Adjustment support table

`Ref | Adjustment | Basis | Evidence` (widths 0.45 / 1.25 / 3.10 / remainder in a six-column span), one row per tier code, 8 pt. `Basis` states the mechanism and the quantum with the GL account or record ("Lease, fuel and insurance on the owner's personal truck, coded to vehicle expense: $18.0K per GL account 6420 and the lease agreement"). `Evidence` uses two words and names the record [G: A p4]: "Documented (GL 6420; lease agreement)" or "Management representation (1)" with the footnote. The words replace any colour or icon (guide T11).

### 4.6 Considerations table

`Consideration | What the data shows | How it is addressed`, full width (1.70 / 5.40 / 5.333), 8.5 pt, rows sized per 4.2. Four rows are mandatory when their triggers hold: Owner involvement, Customer concentration, Add-back quality and **Financial reporting** [G: A p7] (what the books are, who keeps them, what is unaudited, and, under "How it is addressed", the documents the data room provides for reconciliation: tax returns, bank statements, payroll register, general-ledger detail, ServiceTitan exports). "How it is addressed" is quantified wherever the data allows (the loss case for the largest customer sized against one year's growth; the add-back exclusion sized in bps) [C p7]. There is no closing paragraph under the table; the data-room sentence lives in the Financial reporting row.

## 5. Charts

Native `addChart` only; the 2.6 palette; no dual axes, pies, doughnuts, gridlines, outlines, 3-D, shadows or gradients. Bar gap width 60%; value axis hidden because every bar is labelled; category axis 0.5 pt `C2BAB8` with 8 pt `7A706D` labels, never rotated. Data labels Arial 8 pt in the exhibit's units (`#,##0`; `0"%"` on mix charts), white inside `7B0000` and `5E5552`, ink elsewhere. Chart height at least 2.60. Omit the `border` key on `plotArea` and `chartArea` entirely (any border object draws a frame).

| Situation | Form |
|---|---|
| Two series whose magnitudes differ by more than 3x (revenue and Adj. EBITDA) | **Twin panels [G: B p3] [F]**: two single-series `7B0000` bar charts under one exhibit header, each `(w − 0.20) / 2` wide and 2.60 tall; the panel caption ("Revenue", "Adj. EBITDA") is the chart's own title (`showTitle: true`, Arial 8 `7A706D`, `titleAlign: 'left'`, `titlePos: 't'`) so it costs no page height outside the 2.60 chart object; `valAxisMaxVal` at 1.2 x the panel's maximum so the top label never clips; no legend. The one annotation on the header line carries both CAGRs ("FY2023–FY2025 CAGR: revenue 12.4%, Adj. EBITDA 31.2%") |
| Two series within 3x (revenue and gross profit) | Clustered bars, `7B0000` and `DCC7C4`, legend top-left |
| Mix over two or more years | 100% stacked bar, 4-colour palette in fixed order, 0.75 pt white separators between segments, label colour following the fill, legend top-left, `0"%"` labels |
| Mix for a single year | Horizontal bar, `catAxisOrientation: 'maxMin'`, the share carried in the category label ("Commercial (27%)") in 8 pt `2C2523` [G: B p5]; no legend |
| Monthly series, partial years, waterfalls, lines | Guide 2.6 |

- **Legend position [F].** For any chart with a legend, pptxgenjs `legendPos: 't'` and a post-pass in `patchCharts()` that writes `<c:legend><c:legendPos val="t"/><c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0"/><c:y val="0"/></c:manualLayout></c:layout>…` so the legend sits top-left in series order, as guide 2.6 specifies. Legend 8 pt `2C2523`.
- **Labels match the table [F].** A chart's category labels are the same strings as the table beneath it ("Residential service and replacement", never "&").
- **One annotation per chart**, at most 45 characters, right-aligned on the exhibit-header line in 8 pt `7A706D`; it carries the number the action title uses.
- A chart never appears without its figures in a table on the same page; the two share the exhibit header's units and the page's Source line.
- `patchCharts()` also rewrites `dLbls` colour per series (sand series takes ink) and adds the white `a:ln` to stacked series, as in Direction C.

## 6. Page furniture

### 6.1 Title zone

Georgia Bold 20 `7B0000`, bottom-anchored in the 0.70 box, sentence case, no final stop, no section prefix, no subtitle or deck line. Every content title states a finding with at least one number and its period. **Length 60 to 110 characters, one line (up to about 85 characters) whenever the finding allows, hard cap 130** [F]; never shrink the font to fit and never pad a title to reach a second line. No filler clauses ("the record on each is set out below"). The sample's titles run 82 to 109 characters (section 10), two of them on one line.

### 6.2 Exhibit header

Descriptive noun plus units, Arial Bold 9.5 `2C2523`, two spaces, units in Regular 9.5 `7A706D` ("Summary income statement  ($000s)"; "Customer concentration, top 10  (FY2025, $000s)"); 0.5 pt `2C2523` rule 0.25 below the header top across the exhibit width; body at 0.33. No exhibit numbers (guide 4.6 cross-references by page; Direction A's "Exhibit 3.1" numbering is not adopted). The conclusion lives in the title and the observations, never in the exhibit title.

### 6.3 Notes band [F] [G: A p3]

Bottom-anchored at y 6.92, Arial 7 `7A706D`, 1.0 leading, **at most three lines**:

1. `Source:` the systems and periods actually used, then "AMB Advisory analysis".
2. `Note:` units, unaudited basis, fiscal year-end, definitions (PM, T&M), the non-GAAP sentence on the first page that shows Adj. EBITDA, and "; totals may not sum due to rounding" when 4.1 requires it.
3. All numbered footnotes on one line, separated by three spaces: `(1) Per management; not independently verified.   (2) Market salary for a general manager per management and AMB Advisory's review of comparable roles in the Columbus market.`

If the footnotes exceed one line at 7 pt across 12.433 (about 230 characters), the generator shortens the Note line first, then moves a definition into a table's `Basis` column, and fails the build rather than write a fourth line. Footnote markers sit in the table labels they qualify ("Operating (1)", "Seller's discretionary earnings (SDE) (1)") and in the prose; numbering restarts on each page.

### 6.4 Footer

`Project Ridgeline  |  Executive summary` left (code `7A706D`, separator `7A706D`, section `7B0000`, 7.5 pt, sentence case, no letter-spacing); `Strictly private and confidential` centred on the page in 7.5 pt `7A706D`; the tight colour logo 0.22 tall (0.676 wide) with its right edge at x 12.30, vertically centred in the footer row; page number 8 pt `2C2523` right-aligned to x 12.883. No page header, no running title, no logo top-right, no date outside the cover.

### 6.5 Callout

At most one per page and three per deck. `F5EDEC` fill, 2.25 pt `7B0000` left rule, square corners, no icon; lead-in "Takeaway:", "Opportunity:" or "Note:" in Bold `7B0000`; body 9 pt `2C2523`; text inset 0.14 left, 0.10 right; height from the wrapped line count (0.10 + lines x 0.155). It is used for the single number-backed conclusion the page exists to make. **On the Adjusted EBITDA page the callout, or the last observation, states what is not assumed** [G: B p4] [G: A p4]: "Nothing pro forma is included; the figures assume no change in pricing, headcount or the maintenance-agreement program after closing."

## 7. Anatomies

### 7.1 Cover [G: B p1] [G: A p1] [F]

Full-bleed `7B0000` field (a full-page rectangle; no imagery, shapes, slats or circles).

| Element | Spec | Position |
|---|---|---|
| Logo | `amb-logo-white-tight.png`, 2.40 wide (0.781 tall) | x 0.70, y 0.62 |
| Codename | Georgia Regular 40 `FFFFFF`, bottom-anchored | Box x 0.70, y 3.05, w 11.0, h 0.85 |
| Gold rule | 1 pt `C9A227`, 2.0 long | x 0.72, y 4.05 |
| Document line | Arial 16 `FFFFFF`, "Confidential Information Memorandum" | x 0.70, y 4.18, h 0.32 |
| Descriptor line (optional, default off) | Arial 11 `E9D3D5`, sector and metro only ("Residential and commercial HVAC and plumbing services  \|  Columbus, Ohio") | x 0.70, y 4.58, h 0.24 |
| Date | Arial 11 `E9D3D5`, month and year | x 0.70, y 4.56 (y 4.86 when the descriptor is on) |
| Footer line | Arial 8 `E9D3D5`: the confidentiality sentence left in a 9.0 box; "Tampa, Florida  ·  ambadvisoryservices.com" right-aligned to x 12.633 | y 6.72, h 0.24 |

Not on the cover: the business name, the seller's logo, a tagline, a folio, a colour bar. The descriptor line is Direction B's; two judges accepted it as a bank convention and one held it against guide 2.9, so it ships off by default and the advisor switches it on per deal once the teaser has disclosed sector and metro. Direction C's white cover with a bottom band is retired: three judges read the band as an accent stripe and the upper two-thirds as empty.

### 7.2 Divider (only when the CIM has 24 or more pages; guide 3.4)

A `7B0000` panel from x 0 to 4.60, full height. Inside it: the section name in Georgia Regular 28 `FFFFFF`, bottom-anchored in a box at x 0.70, y 2.60, h 1.40; then, from y 4.30, the databook touch kept from Direction C: "Exhibits in this section" in Arial Bold 9 `E9D3D5` over the section's exhibit headers in Arial 9 `E9D3D5`, rows 0.22, at most eight lines, each with its page number right-aligned to x 4.10. On the right, x 5.40 to 12.40, the full section list from y 1.30 in rows 0.50: Arial 13, the current section Bold `7B0000`, the others `7A706D`, page numbers right-aligned, a 0.5 pt `C2BAB8` rule under each row. Page number only in the footer; no tracker, no numerals, no circles, no "Section 4" kicker.

### 7.3 Content page

Every content page carries, in order: the action title; one to three exhibits with exhibit headers; commentary (an observations list keyed to an exhibit, or run-in prose paragraphs on a text-led page); at most one callout; the notes band; the footer. The page uses one of these archetypes:

| ID | Name | Geometry | Sample pages | Guide archetype |
|---|---|---|---|---|
| P1 | Two exhibit columns | Cols 1 to 6 and 7 to 12; hairline at x 6.668; each column holds one exhibit over another exhibit or the observations list | p3, p4, p5 | L2 |
| P2 | Text-led | Prose or a wide table in cols 1 to 7; tables in cols 8 to 12; hairline at x 7.721 | p2, p6 | L4 |
| P3 | Full-width table over two columns | A text table across cols 1 to 12 from y 1.22; below it, cols 1 to 7 and 8 to 12 with the hairline from the block's top | p7 | L6 + L4 |
| P4 | Chart over full-width table | Chart cols 1 to 6 with observations cols 7 to 12, y 1.22 to about 3.90; a full-width segment table beneath | Full CIM, S4.1 [G: A p5] | L5 |
| P5 | Exhibit and rail | Exhibit cols 1 to 8; rail of 2 to 5 bullets cols 9 to 12; hairline at x 8.774 | Full CIM (monthly series, retention) | L1 |
| P6 | Wide table and narrow rail | Table cols 1 to 9; rail cols 10 to 12; hairline at x 9.827 | Full CIM (13-column tables) | L3 |

## 8. Exhibit library

Each exhibit is a named function of the generator with fixed columns; the page only chooses rows. Widths are for the span named.

| Exhibit | Form and columns | Rows | From |
|---|---|---|---|
| **Quick Stats: financial** (cols 1 to 7) | Numeric, two tiers. `Financial` (label 2.00) \| Fiscal year: FY-2, FY-1, FY (0.62 each) \| gap 0.08 \| Growth: CAGR (0.62) \| Context (2.25, merged header) \| Obs. (0.36, merged header) | Revenue; % gross margin; Reported EBITDA; % margin; Adj. EBITDA (2) [key]; % margin; SDE (2); % margin | C p2 [F] |
| **Quick Stats: operating** (cols 1 to 7, 0.12 under the financial table, same exhibit header) | Fact table. `Operating (1)` (2.00) \| Value (0.62) \| Basis (4.19) \| Obs. (0.36) | Agreement members; largest customer (% of revenue); employees; revenue per field employee; fleet; Google rating; (Carrier dealer since) | [G: B p2] [G: A p2] |
| **Transaction summary** (cols 8 to 12) | Text table. Term (1.15) \| Detail (3.915) | What is offered; Basis of offers; Reason for sale; Owner transition; Key employees; Real estate; Target timing; Tax; **Growth levers identified by management (1)** ("…None is included in the figures shown."); **Basis of preparation** (statements used, unaudited, derivations, tier codes, no pro forma items) | C p2; [G: A p2] |
| **Summary income statement** (cols 1 to 6) | Numeric, two tiers. `Income statement` (2.28) \| Fiscal year x 3 (0.66) \| gap \| Growth: FY25 y/y, CAGR (0.62 each) \| Obs. (0.40, merged header, attached to Growth) | Revenue by line, total; cost of revenue by line, gross profit [key], % margin; operating expenses by line (owner compensation first), total; Reported EBITDA (1) [key], % margin; up to 23 rows at 0.195 | C p3 |
| **Revenue and Adj. EBITDA** (cols 7 to 12) | Twin-panel chart, 2.60 tall | Three fiscal years per panel | [G: B p3] |
| **Adjusted EBITDA reconciliation** (cols 1 to 6) | Numeric, two tiers. `EBITDA ladder` (2.35) \| Ref (0.45) \| Fiscal year x 3 (0.66) \| gap \| Growth: FY25 y/y (0.62) \| Obs. (0.40, merged, attached) = 5.88 wide | Net income; Definitional adjustments [section]; (+) Interest expense [D1]; (+) Income taxes [D2]; (+) Depreciation and amortization [D3]; Reported EBITDA [key]; % margin; Normalization adjustments [section]; (+) [N1] to [Nn]; Total normalization adjustments [subtotal]; Owner compensation [section]; Owner compensation, as paid; (–) Market replacement compensation (2); (+) Owner compensation above market [S1] [subtotal]; Adj. EBITDA [key]; % margin; (+) Market replacement compensation [S2]; Seller's discretionary earnings (SDE) (1) [key]; % margin. 22 rows with four [N] items; more [N] items push the detail to the appendix | C p4 + [G: A p4] |
| **Adjustment support** (cols 7 to 12) | Text table 4.5 | One row per tier code | C p4; evidence wording [G: A p4] |
| **Revenue mix by service line** (cols 1 to 6) | 100% stacked bar (two or more years) or horizontal bar with shares in the labels (one year), 2.60 tall | Lines in fixed order | C p5; [G: B p5] |
| **Service lines** (cols 1 to 6, under the chart) | Text table. Service line (1.22) \| What the customer buys (1.62) \| Pricing basis (1.28) \| FY (0.60) \| % (0.42) \| y/y (0.50) \| Obs. (0.38) | One row per line | C p5 |
| **Customer base by segment** (full width; P4 pages in the full CIM) | Text table. Segment \| Who buys \| Revenue \| % total \| Largest customer \| Recurring element \| Lever identified by management (1) | One row per segment plus a ruled total | [G: A p5] |
| **Customer concentration, top 10** (cols 7 to 12) | Numeric, single tier. Customer (0.70) \| Type (1.75) \| Since (0.48) \| Revenue (0.62) \| % total (0.55) \| Cum. % (0.55) \| Basis (1.00) \| Obs. (0.36) = 6.01 wide, rows 0.19 | C-001 to C-010; Top 10 [subtotal, figures only]; Remaining; Total [key]. The "% of commercial" fact is stated in an observation, not parked in a text cell [F] | C p5 |
| **Maintenance-agreement base** (cols 8 to 12 or 7 to 12; S4 page of the full CIM) | Fact table. Measure \| Value \| Basis \| Obs. | Active members; annual renewal rate (1); agreement revenue; revenue per member; tune-up visits a year; members per technician; replacements a year to hold the base flat; offered on service calls (1) | [G: B p5] |
| **Operating cost ratios** (cols 1 to 7) | Numeric, single tier. Cost line (2.35) \| FY x 3 (0.62) \| gap \| Δ bps (0.66) \| Basis (1.85) | Labour lines with a Field labour subtotal; vehicle; rent; marketing; all deltas in bps [F] | C p6 |
| **Organization and tenure** (cols 8 to 12) | Text table. Role (1.62) \| Count (0.48) \| Tenure and pay basis (1.60) \| Post-close (1.365); ruled total | One row per role | C p6 |
| **Facilities, fleet and systems** (cols 8 to 12) | Text table. Item (1.00) \| Detail (2.45) \| Term or status (1.615) | Shop; fleet; software; equipment and parts; service area; reputation | C p6 |
| **Considerations for buyers** (full width) | Text table 4.6 | Mandatory rows plus those the evidence triggers | C p7 + [G: A p7] |
| **Owner responsibilities and transition** (cols 1 to 7) | Text table. Responsibility (1.95) \| Hrs/wk (0.50) \| Who assumes it post-close (2.35) \| Transition support (1.95) \| Obs. (0.40); ruled total | One row per responsibility, hours totalling the owner's week | C p7 |

## 9. Density and voice rules

- **Exhibits.** Two or three per content page; deck average at least 2.0 (guide floor 1.5). A page exists only if it carries at least one data-built exhibit and a title with a number (guide 3.5).
- **Commentary.** 120 to 220 words on a standard page (hard maximum 260), 220 to 320 on a text-led page, excluding table cells and notes. Every observation and bullet carries a figure; at least half of all sentences do.
- **Fill.** Exhibits and text cover at least 80% of the content band (12.433 x 5.26). No empty region larger than two columns by 1.5. Columns end within 0.50 of each other (section 1).
- **Unevenness is required.** Observation counts, row counts and paragraph lengths follow the evidence; no two consecutive pages carry the same count of equal-length items (guide T9); no element repeats in the same position on every page except the furniture (guide T16).
- **Numbers reconcile.** Every figure is read from one data block and formatted by one function; `assertTies()` refuses to build when the constructed P&L does not foot to the stated revenue, EBITDA, Adj. EBITDA, SDE, margins and CAGR; the displayed-figure footing check of 4.1 adds the rounding clause.
- **Voice.** Guide 4.2 to 4.6: conclusion, mechanism, number, implication; "because" and "from X to Y"; named systems, suppliers, months and counts; "per management" with a footnote; what is not assumed stated on the EBITDA page; no banned words, no em dashes, no price opinion. Management figures carry "(1) Per management; not independently verified."
- **Tells.** Nothing from guide 2.10: no badges, cards, tiles, hero rows, tint panels, kickers, icons, colour bars, centred body text, pies, gradients, exhibit numbering, title case, or a subtitle that restates the title.

## 10. The seven-page sample, page by page (after fixes)

Geometry is the y-budget the build pass must hit; every value assumes the constants in section 1. Column x and w come from the spans table.

**p1 Cover.** Section 7.1, descriptor off. "Project Ridgeline" / "Confidential Information Memorandum" / "October 2026".

**p2 Executive summary (P2).** Title (82 characters, one line): "Ridgeline earned $452.9K of Adj. EBITDA (14.9% margin) on $3.04M of FY2025 revenue".
- Cols 1 to 7: exhibit header "Quick Stats  ($000s unless noted)" at 1.22; financial table body 1.55, two tiers to 1.97, 8 rows to 3.53; gap 0.12; operating fact table header row 3.65 to 3.86, 6 rows to 5.03; the fact-order overview paragraph (about 120 words, 9.5 pt) from 5.19 to at most 6.48.
- Cols 8 to 12: "Transaction summary" header at 1.22; text table body 1.55 with ten rows sized per 4.2 (about 2.91 of rows, ending about 4.67); gap 0.14; "Observations  (keyed to Quick Stats)" header at 4.81, three items (A revenue growth and lines, B gross margin mechanism, C Adj. EBITDA margin and the owner-pay reset) at 0.38 to 0.42 each, ending at or before 6.45. The maintenance-agreement observation Direction C carried as item D moves into the operating table's Basis cell.
- Hairline x 7.721, y 1.22 to 6.48. Notes: Source; Note (units, unaudited, FY end); footnotes (1) and (2) on one line.

**p3 Financial performance (P1).** Title (82 characters, one line): "Revenue grew at a 12.4% CAGR to $3.04M in FY2025 while gross margin held at 61–62%".
- Cols 1 to 6: "Summary income statement  ($000s)"; table 5.98 wide (no gap before Obs.); two tiers 1.55 to 1.97; 23 rows to 6.455. This is the tallest table in the deck and it sets the 6.48 guard.
- Cols 7 to 12: "Revenue and Adj. EBITDA  ($000s)" with the two-CAGR annotation; two panels 1.55 to 4.15 (2.60 tall including the in-chart caption, each 2.959 wide with a 0.20 gap); gap 0.08; "Observations  (keyed to the income statement)" at 4.23; five items at 0.38 (two lines each) from 4.56 to 6.46.
- Hairline x 6.668. Notes: Source; Note with the cost-of-revenue definition and, if the displayed figures do not foot, the rounding clause; footnote (1) on one line.

**p4 Adjusted EBITDA (P1).** Title (109 characters, two lines): "Adj. EBITDA of $452.9K in FY2025 resets $200K of owner pay to a $95K salary plus $31.5K of itemized add-backs".
- Cols 1 to 6: "Adjusted EBITDA reconciliation  ($000s)"; ladder 5.88 wide, two tiers 1.55 to 1.97, 22 rows to 6.26 (section 8). No callout under the ladder.
- Cols 7 to 12: "Adjustment support  (FY2025, $000s)" 1.22; support table 1.55 to about 3.94 (rows 0.42, 0.42, 0.42, 0.42, 0.50); gap 0.14; "Observations  (keyed to the EBITDA ladder)" at 4.08, three items (A Reported EBITDA from net income, B normalization add-backs with their evidence and the memo ratios "30.1% of Adj. EBITDA, down from 40.3% in FY2023; owner pay as paid was 6.6% of revenue", C [S1] as 77% of adjustments) at 0.44 from 4.41 to 5.73; gap 0.14; the deck's callout 5.87 to 6.40: "Takeaway: A buyer who hires a general manager underwrites Adj. EBITDA of $452.9K; an owner-operator underwrites SDE of $547.9K. Nothing pro forma is included; the figures assume no change in pricing, headcount or the maintenance-agreement program after closing."
- Hairline x 6.668. Notes: Source (statements, GL detail, payroll register, add-back list); Note (units, non-GAAP sentence, rounding clause if needed); footnotes (1) SDE definition and (2) market salary on one line.

**p5 Customers (P1).** Title (101 characters, two lines): "Commercial revenue grew 16.0% to $821.0K in FY2025; the largest customer is 4.0% and the top 10 19.3%".
- Cols 1 to 6: "Revenue mix by service line  (% of revenue)" with the annotation "Commercial plus agreements: 34% to 36%" (38 characters); 100% stacked bar 1.55 to 4.15, legend top-left; gap 0.14; "Service lines  (FY2025, $000s)" at 4.29; table 4.62 to about 6.27 (header row 0.21, three rows of three lines at 0.48).
- Cols 7 to 12: "Customer concentration, top 10  (FY2025, $000s)"; single-tier list 1.55 to 4.23 (13 rows at 0.19 plus the header row); gap 0.12; "Observations  (keyed to the top-10 list)" at 4.35; four items from 4.68 to about 6.25, B stating "the top 10 are 71% of commercial revenue".
- Hairline x 6.668. Notes: Source (statements; customer list by invoice, ServiceTitan); Note (coded customers, PM and T&M defined); footnote (1) on one line.

**p6 Operations and people (P2).** Title (107 characters, two lines): "An 11-year operations manager runs dispatch for 18 field staff and 20 vehicles; the shop lease runs to 2029".
- Cols 1 to 7: four run-in paragraphs (Management and staffing; Owner role and transition; Fleet, facility and systems; Suppliers and reputation), about 280 words at 9.5 pt, 1.22 to about 4.30; gap 0.14; "Operating cost ratios  (% of revenue)" at 4.44; single-tier table 4.77 to about 6.35 (header row 0.21, six rows and a Field labour subtotal at 0.195, deltas in bps).
- Cols 8 to 12: "Organization and tenure  (#)" 1.22; table 1.55 to about 3.75 (header row 0.21; seven rows sized per 4.2 at 8 pt, ruled total); gap 0.14; "Facilities, fleet and systems" 3.89; table 4.22 to about 6.40 (header row 0.21, six two-line rows at 0.33).
- No observations list: the prose carries the commentary. Hairline x 7.721. Notes: Source (management, payroll register, lease, statements); Note (headcount date, roles only); footnotes (1) and (2) on one line.

**p7 Considerations for buyers (P3).** Title (104 characters, two lines): "Six buyer tests, led by the owner’s 45-hour week and a 19.3% top-10 share, each with a quantified answer".
- Cols 1 to 12: "Considerations for buyers  (FY2025 unless noted)" 1.22; table 1.55 with six rows (Owner involvement, Customer concentration, Technician labour, Add-back quality, Lead generation, Financial reporting) sized per 4.2 (three lines 0.48, two lines 0.34), ending about 4.36.
- Cols 1 to 7, from 4.50 (0.14 under the table): "Owner responsibilities and transition  (hours per week) (1)"; table 4.83 to about 6.30 (header row 0.21, five rows at 0.21 plus a ruled total of about 45 hours).
- Cols 8 to 12, from 4.50: "Observations  (keyed to owner responsibilities)"; three items at up to 0.525 from 4.83 to about 6.41.
- Hairline x 7.721 from 4.50 to 6.48. Notes: Source; Note (tier codes defined on page 4); footnotes (1) and (2) on one line.

## 11. Grafts register

| # | Graft | From | Where it lands |
|---|---|---|---|
| 1 | Full-bleed maroon cover executed to guide 2.9, with the optional sector-and-metro descriptor line | Direction B, p1 | 7.1 |
| 2 | Cover footer line: confidentiality sentence left, "Tampa, Florida · ambadvisoryservices.com" right | Direction A, p1 | 7.1 |
| 3 | Whole-thousand table and chart figures (`#,##0`) with decimals kept in prose, and the "totals may not sum due to rounding" clause when displayed figures do not foot | Direction A, p3 and p4 | 4.1, 6.3 |
| 4 | Owner-compensation mechanism inside the ladder: as paid, `(–)` market replacement, `(+)` above market `[S1]`; `(+)` market replacement `[S2]` before SDE; Memo block where the table has room | Direction A, p4 (memo also p3) | 4.1, 8 |
| 5 | 0.5 pt `C2BAB8` hairline centred in the gutter of every two-column page | Direction A, p3 to p6 | 1 |
| 6 | Footnotes on one line separated by three spaces; three-line notes band | Direction A, p3 | 6.3 |
| 7 | "Growth levers identified by management … none is included in the figures shown" and "Basis of preparation" as rows of the Transaction summary | Direction A, p2 | 8 |
| 8 | Segment table columns "Largest customer", "Recurring element", "Lever identified by management" (full-CIM S4.1 page); "Financial reporting" consideration row naming the data-room documents | Direction A, p5 and p7 | 4.6, 8 |
| 9 | Twin-panel chart for two magnitudes under one exhibit header | Direction B, p3 | 5 |
| 10 | Quick Stats split into a financial table with a CAGR block and an operating Metric / Value / Basis table; the Maintenance-agreement base fact table with derived ratios; share carried in horizontal-bar category labels | Direction B, p2 and p5 (Basis column also Direction A, p2) | 4.3, 5, 8 |
| 11 | Generator techniques: per-row height computed from the longest cell; jszip post-pass writing `<a:buClr>` for maroon bullet glyphs; "Nothing pro forma is included" stated on the EBITDA page; evidence cells that name the record | Direction B generator and p4; Direction A, p4 | 4.2, 4.5, 6.5, 14 |

Direction C keeps everything else: the 12-column grid and bands, Georgia maroon titles, the exhibit header, the maroon two-tier header with `FFE1E1` section rows and white period gaps, the `Obs.` column keyed to a lettered list, analytic columns on every financial table, the `[D]`/`[N]`/`[S]` tier codes and the `Ref / Adjustment / Basis / Evidence` support table, the `Context` and `Basis` text columns, the 23-row income statement, the coded top-10 list with Since, Cum. % and Basis, the operating cost ratios table, the owner responsibilities table, the quantified "How it is addressed" style, the Takeaway callout, the footer, the source and note lines, the `assertTies()` and `patchCharts()` build steps, and the "Exhibits in this section" list on dividers.

## 12. Fixes register

Every weakness the three judges recorded against Direction C, with its fix.

| Judge weakness | Fix | Section |
|---|---|---|
| p2 Quick Stats leaves FY2023 and FY2024 blank for six operating rows (12 empty cells) | The operating block is its own fact table (Metric / Value / Basis / Obs.) under the same exhibit header | 4.3, 8, 10 |
| p2, p3, p4: blank maroon tier-1 cell above `Obs.` and `Context`; detached mini-tables with orphan `FFE1E1` stubs | Merged two-tier header cells (`rowspan: 2`); text and `Obs.` columns attach to the block before them with no gap; section fills and key rules run through | 4.1 |
| p1 cover departs from the full-bleed maroon; bottom band reads as a colour bar; upper two-thirds empty | Guide 2.9 cover with Direction A's footer line | 7.1 |
| "Key observations" in the same block on five of six pages (T16) | Header "Observations" naming the keyed exhibit; placed with that exhibit; absent on prose-led pages; counts vary (3, 5, 3, 4, none, 3) | 4.4 |
| `$000s` to one decimal in every table | `#,##0` in tables and chart labels; decimals in prose; rounding clause when needed | 4.1 |
| p7 Considerations rows carry a line of slack; lower-right list leaves about 0.4 in | Rows sized from the longest cell; a sixth row (Financial reporting); column balance rule | 4.2, 4.6, 1 |
| p5 Top 10 total row parks "71% of commercial" in the Type column | Total row carries figures only; the share is observation B | 8 |
| p6 delta column mixes bps and pts | One unit per column, named in the header (`Δ bps`) | 4.1 |
| p3, p5 chart legends centred over the plot | Twin panels on p3 (no legend); legend top-left by XML patch elsewhere | 5 |
| p5 header annotation too long for the space | Annotation capped at 45 characters; "Commercial plus agreements: 34% to 36%" | 6.2, 10 |
| p4 callout ends 0.06 in above the Source line; page full to the pixel | Content guard at y 6.48, notes band 6.58 to 6.92; the p4 callout moves to the right column under three observations | 1, 10 |
| Every title two full lines at 121 to 128 characters | 60 to 110 characters, one line where the finding allows, hard cap 130; p2 and p3 titles set on one line | 6.1, 10 |
| Notes band runs four lines on p2, p4, p6 and p7 | Three-line maximum; footnotes on one line; build fails on a fourth line | 6.3 |
| p6 and p7 right column ends 0.3 to 0.6 in above the notes band | Column balance rule (blocks end within 0.50; the shorter block takes the list or callout) | 1 |
| p5 coded customers carry revenue and start years the sample data does not contain | Build rule: the top-10 list is built only from a customer list in the request data; otherwise the page shows the segment table and the concentration statement, and the missing list goes to `open-questions.md` | 14 |

## 13. Considered and not adopted

| Device | From | Why not |
|---|---|---|
| One-line Georgia "deck" under the title stating the mechanism | Direction B, every page | A title-plus-subtitle pair on every page is the guide's T15 pattern; a deck row costs 0.30 in of the content band (a table row and a half) or crowds two-line titles, as Direction B's p2 and p7 showed. The mechanism sentence is the first observation's job |
| `F5EDEC` tint panels behind charts and fact tables | Direction B, p2, p3, p5, p6 | The closest thing in the tournament to the banned card pattern; the guide reserves tint for the callout |
| Maroon-filled highlighted row with white text | Direction B, p2, p3, p4 | A hero-row device the guide replaced with ruled key totals; two solid maroon bars in a nine-row table |
| Margin column with marginalia footnotes and margin exhibit labels | Direction B, all pages | 12% of the page width that often carried one label; footnote markers sat 9 in from their notes. Footnotes stay in the notes band; exhibit coverage goes in the units slot |
| Exhibit numbering ("Exhibit 3.1") and cross-references by number | Direction A, all pages | Guide 4.6 cross-references by page; numbering restarting per page adds furniture without a job |
| Ink (not maroon) action titles and a white cover | Direction A | Removes the brand the brief asked to elevate; three judges scored Direction A lowest on identity for this reason |
| A closing paragraph under the Considerations table | Direction A, p7 | Its content (the data-room documents) belongs in the Financial reporting row; the paragraph left a 0.8 in band under it |
| Row-aligned "Basis and evidence" column inside the ladder | Direction B, p4 | It made the ladder's row heights follow the text (2 to 3 lines) and broke the 0.195 rhythm; the separate support table keeps both |

## 14. Build notes for pptxgenjs and QA

- **Library and layout.** pptxgenjs 4.0.1, `LAYOUT_WIDE`, `slide.background = { color: 'FFFFFF' }` on every slide, `isTextBox: true` on every text box, native `addChart` and `addTable`, `addImage` for the logo. The generator runs under a local `package.json` with `"type": "commonjs"` (the repository root is ESM).
- **Merged header cells.** Tier-1 group cells use `colspan`; the header cell of a `label`, `text` or `obs` column uses `rowspan: 2` and the tier-2 array omits that position (pptxgenjs splices the vMerge placeholder into the next row). Verify in the LibreOffice render that the merged cell shows one fill and one baseline.
- **Row heights.** `textTable` and `observations` take no fixed `rowH`; they call `rowHeightFor(cells, colW, pt, bold)` (section 4.2) and return the y they end at, so the next exhibit's y is computed, not assumed. Numeric rows stay at 0.195 (0.19 on lists).
- **Page budget assertion.** Every exhibit function returns its bottom y; the page function throws if any block ends below 6.48 or if two blocks end more than 0.50 apart, and it logs the fill percentage. A notes band that needs a fourth line throws.
- **Charts.** `chartBase` as in Direction C (60% gap, hidden value axis, no gridlines, no plot or chart border keys). `patchCharts()` runs after `write()` over every `ppt/charts/chart*.xml`: (1) `dLbls` colour per series (ink on `C49A5B` and `DCC7C4`); (2) a 0.75 pt white `a:ln` on every stacked series; (3) the legend `manualLayout` at x 0, y 0 for every chart with a legend.
- **Bullet glyph colour.** Where rail bullets are used (P5 pages), a jszip pass inserts `<a:buClr><a:srgbClr val="7B0000"/></a:buClr>` before each `<a:buChar>`; idempotent.
- **Number formatting.** One `fmt` module: `k(n)` → `#,##0` with `$` by row type, parentheses for negatives, en dash for zero; `pct(n, dp)`; `delta(a, b)` → bps under a point, pts otherwise, but a table column declares one unit and `delta` is called with that unit; `money(n)` for prose (`$3.04M`, `$452.9K`, `$95,000`).
- **Ties and footing.** `assertTies()` on unrounded values; `footsWhenDisplayed(block)` on rounded values decides the rounding clause.
- **Data guards.** Exhibits that need data the request does not carry (a customer list, membership counts, a monthly series) are not built from placeholders; the page falls back to the exhibit the library names and the gap is logged to `open-questions.md` (`CLAUDE.md`: the CIM never contains invented facts).
- **Fonts in render.** Install Gelasio (Georgia-metric) and Carlito for the LibreOffice QA render; without Gelasio, Liberation Serif renders titles about 10% narrower than PowerPoint will, so the title-length cap (130 characters) and the 0.70 title box carry that slack.
- **QA checks on the rendered PNGs.** Overflow past y 6.48; any text or shape crossing the notes band; blank cells in a numeric block; a maroon cell with no text; a legend not at top-left; a title over 130 characters or set on three lines; a notes band over three lines; a fourth callout in a deck; banned words (guide 4.4); a category label that differs from its table label; a chart under 2.60 tall; an empty region over two columns by 1.5; consecutive pages with the same observation count and near-equal lengths.
