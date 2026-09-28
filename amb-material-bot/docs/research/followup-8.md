# Follow-up 8: How monthly data is shown — the `Monthly P&L` grid, the trailing-12-month strips, the 31-bar monthly charts, the CIM monthly table and partial-year bars

**Scope.** `HOUSE_STYLE.md` 5.1 lists `Monthly P&L` (tab 27) as "the engine every period column reads" and 5.2 says the period columns are SUMIFS on it, but gives it no column spec, print area or print titles. 5.5 gives only Customer Retention a "monthly strip on the right"; AMB also puts LTM strips on Revenue Analysis and Expense Analysis, inside the print area, and the guide does not describe them. S11.2 ("Detailed income statement (annual and monthly)") has no layout, and 2.6 never says how a partial fiscal year is marked in an annual bar chart. This report documents the four things cell by cell from V51, the printed exhibit pack (PLO) and the deal memo (MEMO), then gives drop-in specs.

**Method.** V51 read twice with openpyxl (formulas, then cached values): column-dimension ranges (min/max, width, hidden, outline level), row heights, fonts, fills, borders, number formats, conditional formats, print areas, print titles, page setup; the chart XML read from the unzipped package (`xl/charts/chart1–20.xml`, drawings and anchors). V51 rendered to PDF through LibreOffice (422 pages), PLO's 8 pages and MEMO's 6 pages rendered to PNG at 80 dpi and inspected. Scratch files: `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/followup-8/` (`dump_*.txt`, `pdf/plo_p*.png`, `wbpng/p*.png`, `memo/memo_p*.png`, `x/xl/charts/`).

Column widths below are Excel character units (V51's default font is Calibri 11, so pixels ≈ 7 × width + 5, inches ≈ pixels ÷ 96): 0.86 ≈ 0.11 in; 6.71 ≈ 0.54 in; 7.71 ≈ 0.61 in; 8.86 ≈ 0.70 in; 10.14 ≈ 0.79 in; 10.57 ≈ 0.82 in; 25.43 ≈ 1.91 in; 33.86 ≈ 2.52 in.

---

## 0. Corrections (read first)

| Where | What it says | What is true | Evidence |
|---|---|---|---|
| Task brief | "V51 P&L Forecast puts months in P:AT (stored widths 10.14 and 13.0)" | One stored width: the column-dimension record `P` has `min=16 max=46 width=10.14`, so **P:AT are all 10.14**. The "13.0" is openpyxl's placeholder for a column with no record (it appears on `Revenue Charts` D:M the same way). `Revenue Charts` actually stores C:D 10.57, E 10.0, F:P 9.14, Q:AG 9.29. | `P&L Forecast` `<col min="16" max="46" width="10.14">`; `Revenue Charts` col records |
| Task brief | "Combined P&L months are 11.7–15.6 wide" | 11.71 is the FY/YTD/LTM block (F, H:I, K:L), not the months. The months N:AR are **N 12.29, O 15.57, P 6.71, Q:AR 10.57** (three accidental widths in the first three months, then one). E (FY2024) is 15.57. | `Combined P&L` col records |
| HOUSE_STYLE 5.2 | "Monthly columns on `Monthly P&L` and `Databook` are grouped (outline level 1)" presented as Keep | **Neither monthly grid is grouped in V51.** Outline level 1 is on `Combined P&L` C:D (mapping columns) only. The only grouped *month* columns are the hidden prior months on the strips: `Expense Analysis` G (Jul-25) and `Client Retention` J:R (Jan-25 to Sep-25). The grouping rule is an Elevate, not a Keep. | col records: `P&L Forecast` P:AT outline 0; `Combined P&L` Q:AR outline 0; `Expense Analysis` G hidden, outline 1; `Client Retention` J min 10 max 18 hidden, outline 1 |
| HOUSE_STYLE 5.11 | "Print titles: rows 5:6; column B on grouped monthly tabs" | No AMB monthly tab repeats rows 5:6. `Expense Analysis` repeats **rows 2:6** (title, subtitle, blank, both header tiers) across its two print ranges; `Client Retention` repeats **rows 2:4** (title and subtitle only, because each block carries its own header row); `Combined P&L` repeats row 5 alone. No tab repeats a column. The spec is fine as an Elevate; the source citation should be `Expense Analysis` $2:$6. | `print_title_rows` per tab |
| HOUSE_STYLE 2.6 | "PACK rotated 31 monthly labels 45°" as the thing to fix | The rotation is not set in the chart XML (`<a:bodyPr rot="-60000000">` = automatic); Excel and LibreOffice both auto-rotate 31 `mmm-yy` labels to 45° because they do not fit. Any 31-bar chart at AMB's 8 pt will rotate unless the builder thins the labels. | chart6.xml, chart1.xml `catAx/txPr` |

---

## 1. Summary: what the guide should add or change

1. **Add the `Monthly P&L` column spec to 5.2** (section 3.4 below): `A 1.7 | B 34 | C:E FY (9.1) | F 0.9 | G:H YTD | I 0.9 | J:L LTM, PF | M 0.9 | N:O deltas | P 0.9 | Q… months at 9.1, one per month, no FY total columns interleaved, no spacer between months`. This is V51's `P&L Forecast` layout with the months moved from P to Q so the standard period block (5.2) is unchanged. Month header = date serial (first of month) formatted `mmm-yy`, first month `=DATE(YEAR(AsOfDate)-2,1,1)` (or the first month with data), later months `=EOMONTH(prev,0)+1` (Keep: V51's chain, the same formula on every strip and chart helper row).
2. **Give `Monthly P&L` a print area and print titles**: print area `B2:<last month><last row>`, print titles rows `5:6` and columns `B:B`, landscape, fit **1 page tall by N wide** (`fitToWidth = 0`, `fitToHeight = 1`), manual column breaks every 12 months so each printed sheet is one fiscal year (or the LTM) with the label column repeated. V51 has no print area on either monthly grid; LibreOffice printed `P&L Forecast` as 18 portrait pages with 6 orphan months per page and no labels, and `Combined P&L` as ~50 A4 portrait pages of one column each (section 3.3).
3. **Add "LTM strips" to 5.5** (section 4 below): Revenue Analysis, Expense Analysis and Customer Retention each carry a **12-month strip inside the print area** to the right of the summary block, separated by a 0.9 spacer, under a tier-1 header `LTM Monthly Revenue` / `LTM Monthly Expenses` / (none on retention) set centre-across-selection, with tier-2 month headers `=EOMONTH(prev,0)+1` in `mmm-yy`, first month linked to the grid (`='Monthly P&L'!<LTM start>`). Strip widths **6.71** (revenue, expense) and **8.86–9.86** (retention); the section rows, boxed totals and number formats continue across the strip and break at the spacer. A **hidden 13th column** (the month before the LTM start, grouped at outline level 1) sits at the strip's left so the first month's growth has a denominator (Keep: `Expense Analysis` G; Elevate: `Revenue Analysis` reaches into `P&L Forecast` for it instead).
4. **State the strip's three stacked blocks** on revenue and expense tabs: `<Group> ($000s)` (dollar lines, boxed total) → `<Group> % Total Revenue` (each line ÷ total revenue) → `<Group> % Growth` (m/m in the strip, y/y in the summary block, boxed `<Group> Growth` total). Growth in the summary block's first column is `n.a.` (V51 types `--`).
5. **Set one as-of date for every strip.** V51's retention strip runs Jan-25 to **Sep-26** ("LTM Sep'26", "YTD2026") while the P&L strips end Jul-26; the customer list was newer than the P&L. Rule: every strip ends at `AsOfDate`; a dataset that runs later is truncated to it (its extra months stay in the Databook), and one that runs earlier is disclosed in the Summary ("Customer data to May-26").
6. **Add 2.6 "Monthly bar charts"**: AMB's monthly exhibit is 31 labelled bars (Jan-24 to Jul-26), maroon `7B0000`, gap width 70, data labels 8 pt `#,##0` above the bar, **no value axis, no gridlines, no legend, no outline**, category axis as a date axis in `mmm-yy` (section 5). Keep all of that; replace the auto-rotated labels with quarter-start labels ("Jan-25", "Apr-25", …) per 2.6, and the title suffix `(Jan’24 - July’26)` with `Jan-24 – Jul-26` per D7 (AMB abbreviates the first month and spells out the second, with a curly apostrophe and a hyphen). The dual-axis "bar + cyan `00B0F0` % of recurring revenue line" (chart2–4, PLO p7–8, MEMO p4–5) becomes the two-panel form 2.6 already prescribes; the six-colour stacked "Recurring Revenue Excluding STR" (chart7, PLO p4) uses theme tints `accent6`, `tx2`, `accent4` that are not brand colours and must map to the 4-colour palette plus "Other".
7. **Add the partial-year rule to 2.6**: annual bar charts show full fiscal years in `7B0000` and the current partial year as **one bar labelled `YTD Jul-26` in `B5727A`** (the palette's estimate/PF tone), separated from the full-year block by a 0.08 in gap, with the prior-year comparable stated in the one permitted annotation ("YTD Jul-25: $998K, +67%") rather than as a second bar; a partial year is **never annualized in a chart** and never labelled with the bare year. AMB never draws annual bars in V51, PLO or MEMO; it draws the 31-month strip instead (section 5.4), so this is New, consistent with 2.6's palette and D7.
8. **Define S11.2's monthly table** (section 6): an L6 full-width table per 12-month window, **12 month columns plus an `LTM` total = exactly the 13-value-column cap**, label column 2.6 in, month columns 0.74 in, LTM 0.85 in after a 0.08 in gap; two-tier header `LTM Jul-26, by month` (tier 1, centred over the 12 months) / `LTM` and `Aug-25 … Jul-26` / `Jul-26` (tier 2); 22 body rows (category-level lines from `Monthly P&L`, not the mapped account detail); one page per window, LTM page always, earlier fiscal-year pages only when the request asks for them; `$` on the first row and totals, en-dash zeros, `#,##0`.
9. **Named styles (5.8):** add `AMB Month Header` = `AMB Header` with `[$-409]mmm-yy;@` on a date value, and `AMB Hidden Prior` for the grouped denominator column (same as `AMB Line`, column hidden at outline 1). Add "Recurring Revenue Growth" and "Total Payroll Growth" to the key-total list in 2.5 (V51 boxes them `FFFFCC`).
10. **Checks (5.7):** add `C-M1: every strip month equals the Monthly P&L cell for that category and month` and `C-M2: strip first month = EOMONTH(AsOfDate,-12)+1, last month = EOMONTH(AsOfDate,-1)+1` (a typed date inside an EOMONTH chain breaks silently: `Client Retention` Q5 is a typed `2025-08-01` in the middle of the chain).

---

## 2. Sources (add to section 0.1 where missing)

| Key | File | Used here for |
|---|---|---|
| **V51** | `03) AMB Dataroom/01) Diligence Workbook/AMB + Topkey - Diligence Workbook v51.xlsx` | `P&L Forecast` (grid), `Combined P&L` (databook grid), `Revenue Analysis`, `Expense Analysis`, `Client Retention`, `Revenue Charts`, `Expense Charts`, `Customer Retention Charts` |
| **PLO** | `03) AMB Dataroom/AMB + Topkey - Initial P&L Overview.pdf` (8 pp.: cover; Summary P&L Overview (portrait); Revenue Analysis; Monthly Revenue Trends; Expense Analysis ×2; Monthly Expense Trends ×2) | How the strips and monthly charts print |
| **MEMO** | `03) AMB Dataroom/AMB + Topkey: Pre-LOI Deal Memo.docx` (6 pp.) | The same charts pasted into Word; monthly prose vocabulary |

---

## 3. The monthly grid: `P&L Forecast` and `Combined P&L`

### 3.1 `P&L Forecast` (the analysis grid) — what AMB does

Sheet: dims A2:AT200, gridlines off, zoom 130, **no print area**, freeze panes at A145 (an accident: it freezes 144 rows), portrait, margins 0.7/0.7/0.75/0.75, no header or footer, print titles none.

**Columns** (from the `<col>` records):

| Col | Width | Content |
|---|---|---|
| A | 1.71 | Gutter; navigation "x" markers in A6, A71, A109, A200 |
| B | 33.86 | Labels |
| C:D | 9.57 | `FY2024`, `FY2025` |
| E | 0.86 | Spacer |
| F:G | 11.0 | `July'25 YTD`, `July'26 YTD` |
| H | 0.86 | Spacer |
| I:K | 11.0 | `Jul'25 LTM`, `Jul'26 LTM`, `Jul'26 PF` |
| L | 0.86 | Spacer |
| M:N | 11.0 | `Delta ($)`, `Delta (%)` |
| O | 0.86 | Spacer |
| **P:AT** | **10.14** (one record, min 16 max 46) | **31 months, Jan-24 to Jul-26**, no spacer between months, no FY subtotal columns interleaved |
| AU: | 9.14 | Sheet default (`defaultColWidth 9.140625`) |

**Header row 5** (`AMB Header`: Arial 9 Bold white on `7B0000`, centred): B5 `P&L Summary ($000s)` left-aligned; C5:N5 typed text labels; **P5 is a typed date `2024-01-01`** and Q5:AT5 are `=EOMONTH(P5,0)+1`, number format `mmm-yy`, so the header cells are true dates the SUMIFS can compare against. There is no tier-1 row on this tab (the tab's tier 1 lives on `P&L Overview` row 5: `Full Year | YTD | LTM | PF | PF Delta`).

**Row 6** is the `Revenue` section row: `FFE1E1` fill across B:N **and P:AT** (the fill stops at the spacers E, H, L, O). Section rows continue across the months exactly as across the period blocks.

**Body.** Every line is one row; the month cells are the source and the period cells read them:

- Month cell (green `008000`, cross-sheet): `P7 =SUMIFS('Combined P&L'!N:N,'Combined P&L'!$C:$C,'P&L Forecast'!$B7)` — the grid pulls each category from the databook by the mapping column C.
- Period cell (black): `C7 =SUMIFS($P7:$AT7,$P$5:$AT$5,">"&C$199,$P$5:$AT$5,"<"&C$200)` — bounded on both ends by two helper rows.
- PF cell (purple `800080`, in-sheet): `K7 =+C111` (the annualization block at rows 109–191).
- Deltas: `M7 =K7-J7`, `N7 =IFERROR(K7/J7-1,0)`.

**Helper rows 199–200** sit 8 rows below the last printed row, in Calibri 11 (unstyled), format `mm-dd-yy`: `C199 2023-12-31`, `C200 =EOMONTH(C199,12)`; `D199 =C200`, `D200 =EOMONTH(D199,12)`; `F199 2024-12-31`, `F200 2025-07-31` (typed); `G199 2025-12-31`, **`G200 =EOMONTH(G199,12)` = 12/31/2026** (the open-ended YTD window, FR6 Finding 5); `I199 2024-07-31`, `I200 =EOMONTH(I199,12)`; `J199 =I200`, `J200 =EOMONTH(J199,12)`. The bounds are exclusive (`>` start, `<` end), which works only because month headers are first-of-month serials.

**Number formats in the grid** are the same as the period block: `[$$]#,##0;\([$$]#,##0\);"–";@` on the first row of each block and on totals, `#,##0;\(#,##0\);"–";@` on body rows, `#,##0.0%;\(#,##0.0%\);"–";@` on `% Margin`. Row heights: default 12.0; spacer rows 3.95 (rows 16, 23, 27, 29, 41, 47, 67, 70, 72, 80, 86, 94, 97, 105, 120, 171, 180, 186, 190); 12.0 explicitly on the row after each spacer.

**Row structure** (labels verbatim, rows 6–107; this is the guide's "category-level" grid):

`Revenue` (section) → 8 recurring lines (`STR Subscription` … `Historical Cleanup`) → `Total Recurring Revenue` (boxed `FFFFCC`) → 5 nonrecurring lines → `Total Nonrecurring Revenue` (bold, thin top) → `Total Run-Rate Revenue` (boxed) → `Unclassified Active Client Revenue` (blue input) → `Total Adj. Revenue` (boxed) → `Expenses` (section) → 9 payroll lines → `Total Payroll Expenses` → 4 software lines → `Total Software Expenses` → 18 overhead lines → `Total Overhead` → `Net Income` (boxed) → `% Margin` → `Tie Out` (italic red check, `=C68-'Combined P&L'!E114`, run for every month too: `P71 =P68-'Combined P&L'!N114`) → `EBITDA Bridge` (section) → `(+) Amortization`, `(+) Taxes`, `(+) Interest` → `Reported EBITDA` → `% Margin` → `Personal Expenses` → `Adj. EBITDA` (boxed) → `Near-Term Adjustments` → `Near-Term Adj. EBITDA` → `Steady-State Adjustments` → `Steady-State Adj. EBITDA`. Every ladder row is computed **per month** as well as per period (e.g. `P88 =$C$168/12+P$35` spreads an annual owner-compensation input over 12 months), so the LTM strips and monthly charts can read any ladder line.

### 3.2 `Combined P&L` (the databook grid) — what AMB does

Sheet: dims A1:AR166, gridlines off, zoom 130, **no print area**, print titles `$5:$5`, freeze panes A81 (accident), **portrait, paper size 9 (A4)**, margins 0.75/0.75/1.0/1.0.

| Col | Width | Content |
|---|---|---|
| A | 1.71 | Gutter (A1 holds a stray "Onboarding Team Wages" that prints at the top of every page) |
| B | 40.0 | `Line Item` (account as exported; sub-headings underlined, e.g. `Income Tax Revenue`) |
| C | 24.71, **outline 1** | `Summary Account` (the AMB category the grid sums by) |
| D | 18.29, **outline 1** | `Personal?` (`(+) Utilities`, `(+) Home Office Expense`) |
| E | 15.57 | `FY2024` |
| F | 11.71 | `FY2025` |
| G | 0.86 | Spacer |
| H:I | 11.71 | `July'25 YTD`, `July'26 YTD` |
| J | 0.86 | Spacer |
| K:L | 11.71 | `Jul'25 LTM`, `Jul'26 LTM` |
| M | 0.86 | Spacer |
| **N:AR** | **N 12.29, O 15.57, P 6.71, Q:AR 10.57** | 31 months Jan-24 to Jul-26, **typed dates** (no EOMONTH chain), `mmm-yy` |
| AS: | 8.71 | Default |

Header row 5 is **`1F4E78` (dark blue) fill, Arial 9 Bold white** — the databook/raw lineage colour, not the analysis maroon. Month cells are raw links divided by 1,000 (`Q12 ='Raw - 2024 PL'!E8/1000`, `AR8 ='Raw - 2026 PL'!H8/1000`); subtotals are `=SUM(...)` per month; period cells are the same bounded SUMIFS as the analysis grid, reading helper rows 116–117. A tie-out block occupies rows 120–166.

### 3.3 What is weak and should be elevated

- **No print area on either grid.** LibreOffice paginated `P&L Forecast` as pages 34–51 of the workbook PDF: page 34 is B:F, then pages 42–51 are strips of six months each (`Jan-24 | Feb-24 | … | Jun-24`) with **no row labels and no title** because there are no print titles. `Combined P&L` printed as A4 portrait pages of one or two columns (page 375: `Line Item | Summary Account` only). The guide's 5.11 rule ("any page cut at the right margin fails the build") would fail both.
- **Three widths in the first three months** of `Combined P&L` (12.29 / 15.57 / 6.71) and a typed rather than derived first month on both grids.
- **The month header is a typed date** (`P5 2024-01-01`) inside a white-on-maroon header cell, so it is invisible as an input.
- **YTD window open-ended** (G200 = 12/31/2026). Already in the guide (5.2) as a Fix.
- **Stray text in column A** (`Combined P&L` A1) prints on every page; `P&L Forecast` A6/A71/A109/A200 "x" markers print (already R-MOD §9.3).
- **Two grids, two conventions**: the analysis grid's months are formulas, the databook's are typed; the databook header is blue, the analysis header maroon. One `Monthly P&L` (maroon, formula headers) fed by one `Databook` is the guide's answer; the blue header is a databook identity worth keeping only if the guide wants raw-lineage tabs visually distinct (decide in 5.1).

### 3.4 Spec for `Monthly P&L` (drop into 5.2 after the standard column table)

**Columns.** The standard layout A:Q from 5.2 is unchanged (A 1.7 gutter; B 34 labels; C:E FY; F spacer; G:H YTD; I spacer; J:L LTM PY, LTM CY, PF; M spacer; N:O Delta $, Delta %; P spacer). Column Q on this tab is **not** the notes column; the months start at Q:

| Col | Width | Content |
|---|---|---|
| Q… | 9.1 each | One column per month, oldest first, ending at `EOMONTH(AsOfDate,0)`; typically 24–36 columns. No spacer between months; no FY subtotal columns interleaved (the FY figures are C:E). Grouped at outline level 1 so the tab collapses to the period block |
| After the last month | 0.9 | Spacer |
| Next | 60 | Basis / notes (italic), as 5.2 column Q on other tabs |

**Headers.** Row 5 tier 1: `Full Year | YTD | LTM | PF | PF vs. LTM` over the period blocks (5.2) and `Monthly ($000s)` centre-across-selection over the month columns. Row 6 tier 2: the month serial (first of month) in `AMB Header` with format `[$-409]mmm-yy;@`; first month `=EOMONTH(Assumptions!FirstDataMonth,0)-DAY(EOMONTH(Assumptions!FirstDataMonth,0))+1` (or simply `=Assumptions!FirstDataMonth` when that input is stored as a first-of-month date), each later month `=EOMONTH(<prev>,0)+1`. Never a typed date in the chain (Keep: V51 `Q5 =EOMONTH(P5,0)+1`; Fix: V51 typed P5, `Combined P&L` typed N5:AR5, `Client Retention` typed Q5).

**Cells.** Month cells are `=SUMIFS(Databook!<month col>, Databook!$Category, $B7)` in green; period cells are the bounded SUMIFS in 5.2 reading the two helper rows ("Period start", "Period end", grey `808080`, directly below the last printed row, **not** 8 rows down in Calibri). Every ladder row (5.4) exists per month so the strips and charts can read it (Keep: V51 rows 74–107 per month). `Tie Out` row runs per month (Keep: V51 row 71).

**Formats.** As 5.10: `[$$]#,##0…` on the first row of each block and totals, `#,##0…` elsewhere, `#,##0.0%…` on margins. Section rows `FFE1E1` across the month columns, breaking at every spacer (Keep: V51 row 6 P:AT).

**Print.** Print area `B2:<notes col><last row>` excluding the helper rows. **Landscape, fit 1 page tall × N wide** (`fitToWidth = 0`, `fitToHeight = 1`, `fitToPage = true`), print titles **rows 5:6 and columns B:B**, manual column breaks after P (the period block prints as its own page) and after every 12th month so each subsequent page is one fiscal year (or the LTM) with labels repeated. Footer and header as 5.11. The QA render must show a title, both header tiers and labels on every page (Fix: V51 pages 42–51).

**View.** Freeze panes at C7 (5.11), zoom 100, gridlines off. Month columns grouped (outline 1) and **collapsed by default** on the buyer version, expanded on the internal version (5.12 Q20).

---

## 4. The LTM strips

### 4.1 `Revenue Analysis` — what AMB does

Print area `B2:R46` (one range), landscape, fit to page (stored scale 95 is overridden), gridlines off, no freeze; `Print` toggle: T3 text, **U3** boxed blue `1`; conditional format `A7:XFD46` formula `$U$3=1` (font to automatic for printing; note the range runs to XFD, so it also covers the helper cells at C52:D53 — harmless but sloppy).

| Col | Width | Row 5 (tier 1, Arial 9 Bold white on `7B0000`) | Row 6 (tier 2, `AMB Header`) |
|---|---|---|---|
| B | 25.43 | (blank maroon) | `Revenue Summary` (left) |
| C:D | 7.71 | `LTM Revenue` (C5, **centerContinuous** across C:D) | `July'25`, `July'26` |
| E | 7.71 | `PF` (centre) | `July'26` |
| F | 0.86 | spacer, no fill | spacer, no fill |
| **G:R** | **6.71, 6.71, 6.43, 6.57, 6.71, 6.57, 6.43, 6.71, 6.43, 6.86, 6.57, 6.00** | `LTM Monthly Revenue` (G5, centerContinuous across G:R) | `G6 =+'P&L Forecast'!AI5` (Aug-25), `H6 =EOMONTH(G6,0)+1` … `R6` (Jul-26); format `mmm-yy` |
| S | 6.14 | | (outside print area) |
| T: | 9.14 | | |

Row heights: 2 = 16.5 (title), 6 = 12.0 (explicit), default 12.0. The twelve strip widths are hand-dragged; they are all "about 6.7" and print as equal-looking columns (PLO p3). The strip has **no spacer columns** between months and no total column.

**Rows** (B labels verbatim; every label and figure is a green link into `P&L Forecast`, e.g. `B8 =+'P&L Forecast'!B7`, `C8 =+'P&L Forecast'!I7`, `G8 =+'P&L Forecast'!AI7` … `R8 =+'P&L Forecast'!AT7`):

- Row 7 `Revenue ($000s)` — section row `FFE1E1` across B:E and G:R (F is white).
- Rows 8–15 the eight recurring lines, indent 1; row 16 **`Total Recurring Revenue`** — `FFFFCC` fill, Arial 9 Bold, thin box drawn per block (`B16` top/bottom/left, `E16` top/bottom/right, `G16` top/bottom/left, `R16` right): the "boxed total" is drawn twice, once around B:E and once around G:R.
- Rows 18–22 the five nonrecurring lines; row 23 `Total Nonrecurring Revenue` (bold, thin top); row 25 **`Total Revenue`** (boxed).
- Row 27 `Recurring Revenue % Total` (section) → rows 28–35 each line ÷ Total Revenue, `#,##0%;\(#,##0%\);"–";@` ("78%").
- Row 37 `Recurring Revenue % Growth` (section) → rows 38–45: summary block = year-over-year (`D38 =IFERROR(D8/C8-1,0)`, **`C38` is the text `--`**), strip = **month-over-month** (`H38 =IFERROR(H8/G8-1,0)`) with the first month reaching back into the grid for its denominator: `G38 =IFERROR(+'P&L Forecast'!AI7/'P&L Forecast'!AH7-1,0)`. Row 46 **`Recurring Revenue Growth`** boxed total, `C46 =SUM(C38:C45)` (a meaningless sum that displays as `–`).
- Rows 52–53 (outside the print area): `C52 2024-06-30` (blue), `D52 =C53` (purple), `C53 =EOMONTH(C52,12)` — the tab's own period helpers.

Number formats in the strip mirror the block: `[$$]#,##0;\([$$]#,##0\);"–";@` on row 8 and on the boxed totals (PLO p3 shows `$130 $134 … $201` and `$157 … $251`), `#,##0;\(#,##0\);"–";@` elsewhere, en dash for zero, `(6%)` for negative growth.

### 4.2 `Expense Analysis` — what AMB does

Same anatomy with two differences worth copying:

- **Two print ranges with repeated header rows**: print area `B2:S40` and `B42:S83`, **print titles `$2:$6`** (title, subtitle, blank row, both header tiers), so PLO p5 (Payroll: `$000s`, `% Total Revenue`, `% Growth`) and p6 (Software then Overhead) each open with `Keystone Bookkeepers / Expense Analysis ($000s)` and the maroon two-tier band. Freeze panes at A7 (rows only).
- **A hidden prior month**: column **G** (width 6.71, `hidden`, outline level 1) holds Jul-25 so `H38 =IFERROR(H15/G15-1,0)` has a denominator; the visible strip is **H:S** (Aug-25 to Jul-26; widths 6.71, 6.71, 6.43, 6.57, 6.71, 6.57, 6.43, 6.71, 6.43, 6.86, 6.57, 6.00). Tier 1 `LTM Expenses` over C:D, `PF` at E, `LTM Monthly Expenses` centre-across H:S; H6 `=+'P&L Forecast'!AI5`. Print toggle V3, CF `$V$3=1`.

Blocks: `Payroll ($000s)` (9 lines, boxed `Total Payroll`) → `Payroll % Total Revenue` → `Payroll % Growth` (boxed `Total Payroll Growth`); `Software ($000s)` → `Software % Total Revenue` → `Software % Growth` (`Total Software Growth`); `Overhead ($000s)` → … The `% Total Revenue` denominators are two helper rows at 85–86 (`Recurring Revenue`, `Total Revenue`) below the print area, linked to `Revenue Analysis`.

### 4.3 `Client Retention` — what AMB does

Print area `B2:AD48`, `B50:AD93`; print titles `$2:$4`; landscape, fit to page (stored scale 66); zoom 130; Print toggle AF3/AG3 (`$AG$3=1`), plus a second toggle Y3 that drives the section-row CFs. Widths: B 26.71; C:F 9.71 (`FY2023 | FY2024 | FY2025 | YTD2026`); G 0.86; H 9.14 (`LTM Sep'26`); I 0.86; **J:R 8.86 hidden, outline 1** (Jan-25 to Sep-25); **S:U 9.86, V:AD 8.86** (Oct-25 to Sep-26, the visible 12). Row 5 header is 24.0 high (Arial 9 Bold, `theme0` white on `7B0000`); J5 typed `2025-01-01`, K5:P5 `=EOMONTH(prev,0)+1`, **Q5 typed `2025-08-01`** (chain broken), R5:AD5 chained again. There is no tier-1 label over the strip; the block label (`Total`, `Property Manager, STR Owner & Short-Term Rental`, `Property Manager`, `STR Owner`) is a `FFE1E1` row under the header.

Monthly count block per month: `Starting Count =+J13-J8-J12` (derived backwards from ending), `(+) Client Wins =COUNTIFS('Full Customer List'!$I:$I,'Client Retention'!J$5)` (green), `(-) Regrettable Losses`, `(-) Non-Regrettable Losses`, `(-) Unclassified Losses`, `(-) Total Client Losses`, `Ending Count` (boxed), `Avg. Clients` (boxed, `=AVERAGE(start,end)`), `New Client Growth` (boxed, `=(wins+start)/start-1`), `Client Churn` (boxed, `=(losses+avg)/avg-1`). Rendered (workbook PDF p66) the tab prints at 66% with three blocks per page and the 12 visible months to the right of the `LTM Sep'26` column.

### 4.4 What is weak and should be elevated

- **Three tabs, three as-of months and three label styles**: `July'25 / July'26` (revenue, expense), `LTM Sep'26` and `YTD2026` (retention). D7 fixes the labels; the as-of rule in 1.5 fixes the months.
- **Twelve hand-dragged widths** (6.00–6.86) per strip; one width (6.7 for `$000s` strips, 9.1 for count/$ retention strips) is enough.
- **Two ways to get the first month's growth**: a hidden prior column (Expense) versus a formula that reaches into the grid (Revenue). Standardise on the hidden prior column: it keeps every strip cell a link or a same-row formula.
- **`--` as text in the first growth column** and `=SUM()` of growth rates on the boxed growth row (`Revenue Analysis` C46 `=SUM(C38:C45)`, `Expense Analysis` C40 `=SUM(C31:C38)`): the total-growth row should be `total_t / total_{t-1} − 1`, and the first column `n.a.`
- **Section rows drawn twice** (once per block) and **boxed totals drawn twice**: keep the visual (the gap column is white) but generate it from the block list, not by hand.
- **Percent rows in the strip use whole percents** (`18%`) where the summary block's margins use 1 dp elsewhere in the model; keep 0 dp for `% Total Revenue` and growth (2.5 says 0 dp for mix and growth) — this one is consistent, note it as Keep.

### 4.5 Spec: LTM strips (drop into 5.5)

**Where.** `Revenue Detail`, `Expense Detail` and `Customer Retention` (count and dollar tabs) carry a **12-month strip inside the print area**, to the right of the summary block, after a 0.9 spacer column. Tabs with more than 12 months of monthly data show only the LTM in the strip; the full history is on `Monthly P&L`.

**Columns** (revenue and expense tabs):

| Col | Width | Content |
|---|---|---|
| B | 34 | Labels (5.2) |
| C:D | 9.1 | `LTM Jul-25`, `LTM Jul-26` |
| E | 9.1 | `PF Jul-26` |
| F | 0.9 | Spacer |
| G | 6.7, **hidden, outline 1** | Prior month (`Jul-25`), the m/m denominator for the first visible month |
| H:S | **6.7** each | Twelve months `Aug-25 … Jul-26` |
| T | 0.9 | Spacer |
| U | 60 | Basis / notes |

Retention tabs: strip columns 9.1 (counts and `$000s` share the width of the FY columns).

**Headers.** Tier 1 (row 5, `AMB Header Group`, centre across selection): `LTM` over C:D, `PF` over E, **`LTM Monthly Revenue`** / **`LTM Monthly Expenses`** / **`LTM Monthly Customers`** / **`LTM Monthly Revenue ($000s)`** over the 12 visible months. Tier 2 (row 6, `AMB Month Header`): `G6 =EOMONTH(Assumptions!AsOfDate,-12)+1` (hidden), `H6 =EOMONTH(G6,0)+1` … `S6`; the check `S6 = EOMONTH(AsOfDate,-1)+1` is C-M2. AMB links G6 to the grid's header cell instead (`='P&L Forecast'!AI5`); deriving from `AsOfDate` removes the hard-wired column letter.

**Rows.** Three stacked blocks per group, each opened by a section row that spans B:E and H:S (not the spacers):

1. `<Group> ($000s)` — the lines, indent 1, then the boxed total (`Total Recurring Revenue`, `Total Revenue`, `Total Payroll`, `Total Software`, `Total Overhead`). Every strip cell is `='Monthly P&L'!<cell>` (green); nothing is typed and nothing is summed on the strip except the block total.
2. `<Group> % Total Revenue` — line ÷ Total Revenue for the same column, `AMB Ratio` 0 dp.
3. `<Group> % Growth` — summary block: y/y (`=IFERROR(D8/C8-1,"n.a.")`); strip: m/m (`=IFERROR(H8/G8-1,"n.a.")`), first visible month against the hidden G. Boxed `<Group> Growth` row computed on the totals, never a `SUM` of rates.

**Formats.** As the block: `$` on the first row of each dollar block and on boxed totals; `#,##0`; en dash zero; `(6%)`. Section fill and boxed borders break at F and T. Row 6 height 12; spacer rows 3.95 between blocks.

**Print.** One print range per group when a tab has more than one (Keep: `Expense Analysis` `B2:S40, B42:S83`), **print titles rows 2:6** so every printed page opens with the title, subtitle and both header tiers (Keep: `Expense Analysis`). Landscape, fit 1 wide. Hidden column G does not print. Print toggle at the right end of row 3 (5.9) with the CF range limited to the print area, not `A:XFD`.

**Customer Retention (count) strip rows** (Keep: V51 labels, with 5.5's GDR/NDR added on the dollar tab): `Starting Count | (+) Client Wins | (-) Regrettable Losses | (-) Non-Regrettable Losses | (-) Unclassified Losses | (-) Total Client Losses | Ending Count | Avg. Clients | New Client Growth | Client Churn`. Starting Count for month *m* = Ending Count for *m−1* (V51 derives it backwards from the ending count; forward is the same number and reads better). One block per segment, each with its own `FFE1E1` label row; the tier-2 header repeats per block (Keep: V51 rows 5, 20, 35, 50).

---

## 5. Monthly charts

### 5.1 The model chart tabs — what AMB does

`Revenue Charts` (print area `B2:L44`, landscape, fit to page) holds two charts; `Expense Charts` (`B2:L84`, landscape, manual row break at 43) four; `Customer Retention Charts` four print ranges of one chart each (`B2:L30`, `B32:L56`, `B58:L83`, `B85:L109`). Widths: A 1.71, B 27.86, C:D 10.57, E 10.0, F:P 9.14 (Expense Charts: F:K 9.14, L 5.14, M:P 9.14), Q:AG 9.29. Each chart is anchored from column B to column L, 17–19 rows tall (`Revenue Charts`: rows 5–22 and 26–43; `Expense Charts`: 5–20, 23–42, 44–63, 65–83), so two charts fill one landscape page (PLO p4, p7, p8).

**Exhibit title** in the cell above each chart, Arial 9 Bold, underlined in the render: `B5 'Monthly STR Subscription Revenue (Jan’24 - July’26)'`, `B26 'Monthly Recurring Revenue Excluding STR (Jan’24 - July’26)'`, `Expense Charts` B5 `'Monthly Indirect Wages (Jan’24 - July’26)'`, B23 `'Monthly Bookkeeper Wages (Jan’24 - July’26)'`, B44 `'Monthly Onboarding Wages (Jan’24 - July’26)'`, B65 `'Monthly Software Expense Excluding Topkey (Jan’24 - July’26)'`; `Customer Retention Charts` B5 `'Monthly Property Manager, STR Owner & Short-Term Rental (By Churn Type)'`, B32 `'Monthly Property Manager, STR Owner & Short-Term Rental'`. Pattern: **`Monthly <line> (<first month> - <last month>)`** with the first month abbreviated (`Jan’24`), the last spelled out (`July’26`), a curly apostrophe and a spaced hyphen; the retention titles carry no range because their range (Jan-25 to Sep-26) is stated by the axis.

**Chart data** lives in helper blocks **below the print area**, each a mini table with a maroon header row: `Revenue Charts` row 47 `Monthly Recurring Revenue | C47 2024-01-01 | D47 =EOMONTH(C47,0)+1 … AG47` (31 months), row 48 `STR Subscription =SUMIFS('Combined P&L'!N:N,'Combined P&L'!$C:$C,$B48)`; rows 50–56 the six non-STR recurring lines for the stacked chart; row 57 `=AG57/C57-1` (the growth figure quoted in MEMO: "increased 84%"). `Expense Charts` rows 95–108: each chart has a header row, a `$` row and a `% Recurring Revenue` row (`C100 =C99/'P&L Forecast'!P$15`, format `#,##0.0%`). `Customer Retention Charts` rows 111–127: `Client Wins =+'Client Retention'!J23`, `Regrettable Losses =-'Client Retention'!J24` (sign flipped so losses plot positive), 21 months C:W.

**Chart XML** (chart6 = STR bars, chart1 = indirect wages, chart2–4 = bar + line, chart7 = stacked, chart8–11 = retention):

| Property | Single-series monthly bar (chart1, chart6) | Bar + % line (chart2–4) | Stacked mix (chart7) | Retention wins/losses (chart9–11) |
|---|---|---|---|---|
| Type | `barChart` col, clustered | `barChart` + `lineChart` on a **secondary value axis** | `barChart` col, **stacked**, gapWidth 150, overlap 100 | `barChart` col, clustered |
| Points | **31** (`ptCount 31`, C:AG) | 31 | 31 | 21 (C:W) |
| Bar fill | `srgbClr 7B0000`, no outline | bars `7B0000`; line `00B0F0`, 12700 EMU (1 pt), no markers | `accent6 lumMod 75%` (green), `7B0000`, `tx2 20%/80%` (pale blue-grey), `accent4 40%/60%` (pale gold), `accent4 75%` (gold), + one more | `accent6` (green) wins, `7B0000` losses; churn-type chart adds `FFC1C1`, `FF0000` |
| Gap width | **70** | 70 | 150 | 70 |
| Data labels | `showVal 1`, `#,##0;\(#,##0\);"–";@`, Arial **8 pt** (`sz 800`), above bar | bars labelled; line unlabelled | none | both series labelled |
| Category axis | **`dateAx`**, `mmm-yy`, `bodyPr rot -60000000` (auto → renders 45°), crosses autoZero | same | same | same |
| Value axis | present but unused: `delete 0`, `#,##0`, labels visible only when gridlines are on; **no gridlines** on the single-series charts | left `#,##0`; right `#,##0.0%` (`crosses max`) | left `[$$]#,##0` with **major gridlines** | none/none |
| Legend | none | bottom (`Bookkeeper Wages`, `% Recurring Revenue`) | bottom, six entries | bottom (`Client Wins`, `Client Losses`) |
| Title | `autoTitleDeleted 1` (title is the cell above) | same | same | same |
| Fonts | Arial 8 pt everywhere (`latin typeface="Arial"`, `sz 800`) | same | same | same |

In render (PLO p4, p7; MEMO p3–5): the single-series chart is the cleanest exhibit AMB makes — 31 maroon bars, every bar labelled, no axis, no gridlines, no legend. The stacked chart and the dual-axis charts are the weak ones (theme colours, gridlines, cyan line on a 10–26% secondary scale, legend at the foot). MEMO pastes the same charts as pictures at ~5.5 in wide with the title in Times New Roman Bold maroon above.

### 5.2 Monthly vocabulary in prose (MEMO, verbatim)

- Titles: `Monthly STR Subscription Revenue (Jan’24 - July’26)`; `Monthly Recurring Revenue Excluding STR (Jan’24 - July’26)`; `Monthly Indirect Wages (Jan’24 - July’26)`.
- Quick Stats header: `Quick Stats (as of July 2026)`; `LTM ARR: $2.5M`; `Pro Forma ARR: $3M`.
- Commentary: "Keystone ARR increased ~$1M Y/Y and has more than doubled when annualizing the July'26 client base."; "Non-STR recurring revenue increased 84% over the past two and a half years"; "Wages spiked in Nov'24 and Mar'26, indicating key hires."; "Monthly bookkeeper wages have increased over 4x since the beginning of 2024, with bookkeeper payroll representing roughly 18% of recurring revenue."; "Onboarding wages have fluctuated m/m to a degree that signals issues hiring, training, and keeping offshore personnel."; "$161K LTM, run-rate is likely higher".
- So AMB's month reference in prose is `Nov'24` (abbreviated month, straight or curly apostrophe, two-digit year), growth is `Y/Y` and `m/m`, and a multiple of growth is "over 4x". The guide's 4.6 (`LTM July 2026`, `the 12 months to July 2026`) should add: months in prose as `November 2024` in the CIM, `Nov-24` in titles and tables; `m/m` and `y/y` are allowed in the rail, spelled out in body text.

### 5.3 Spec: monthly bar charts (add to 2.6 as "Monthly series")

- **Data.** From `Monthly P&L` (or the retention strip source), never a helper block typed on the chart tab. 24–36 bars; the first bar is the first month of FY-2 (or the first month with data), the last is `AsOfDate`'s month.
- **Marks.** Single series `7B0000`, gap width 70 (Keep: V51; 2.6's 60% is for annual bars with few categories — state both), no outline, no 3-D. Data labels Arial 8 pt `#,##0` above every bar when there are 36 or fewer bars; above the first, last, maximum and minimum only above 36.
- **Axes.** Category axis as a date axis in `mmm-yy` with **labels on quarter starts only, horizontal** (2.6); value axis hidden; no gridlines; no legend (Keep: chart6).
- **Title.** Exhibit header per 2.1: `Monthly STR subscription revenue  ($000s)` with the range as the one annotation right-aligned on the header line: `Jan-24 – Jul-26` (D7; replaces `(Jan’24 - July’26)`).
- **Ratio line.** The `% Recurring Revenue` line (V51 chart2–4) becomes the lower panel of a two-panel exhibit sharing the category axis, panel height 30%, line 1.75 pt `5E5552` (comparison tone) with the last point labelled `18%`; never a secondary axis (D10).
- **Mix.** The six-series stacked monthly mix (chart7) becomes a 100% stacked monthly bar in the 4-colour palette with the fifth and later lines folded into `Other`, or a table; no `$` value axis, no gridlines.
- **Trailing-12-month line.** S6.4's TTM line (1.75 pt `7B0000`, marker on the last point) starts at the 12th bar; bars before it are still shown.
- **Model chart tabs** (`Revenue Charts`, `Expense Charts`, `Retention Charts`) keep AMB's page: title cell (Arial 9 Bold) at B5, chart anchored B6:L22, two charts per landscape page, print area per pair, chart data in a grey `AMB Helper` block below the print area with a `mmm-yy` header row linked to `Monthly P&L` (Keep: V51 rows 47–57, 95–108).

### 5.4 Spec: partial fiscal year in annual bar charts (add to 2.6)

AMB does not draw annual bars in V51, PLO or MEMO; when a year is incomplete it shows the monthly strip through the as-of month (`(Jan’24 - July’26)`) and states YTD and LTM in tables. The CIM's annual charts (S6.1 revenue by year, S6.3 EBITDA by year) need a rule:

- Categories: `FY2023 | FY2024 | FY2025 | YTD Jul-26` — full fiscal years in `7B0000`, the partial year as **one bar in `B5727A`** (the palette's estimate/PF tone, ΔE 25.7 from `7B0000`), a 0.08 in gap between the full-year block and the partial bar (the same gap the tables use between period groups).
- Label: `YTD Jul-26` under the axis, never `2026`, `2026E`, `FY2026` or an annualized figure. The bar carries its value (`$1,671`).
- The prior-year comparable is the chart's one annotation, right-aligned on the header line: `YTD Jul-25: $998; +67%`. It is not a second bar (a `YTD Jul-25` bar beside the full `FY2025` bar double-counts the eye).
- Alternative when LTM is the headline of the page: `FY2023 | FY2024 | FY2025 | LTM Jul-26`, LTM in `7B0000` (it is a full 12 months) with a 0.08 in gap and the label `LTM Jul-26`; never both YTD and LTM on one annual chart.
- Footnote (4.6): `(1) YTD Jul-26 is the seven months to July 31, 2026, unaudited.`
- In the model's chart tabs the same rule applies to any annual chart; V51's monthly-only practice stays the default for the model.

---

## 6. Spec: S11.2 monthly income statement table (CIM)

Layout L6 (full width, cols 1–12, 12.433 in), one page per 12-month window.

| Element | Spec |
|---|---|
| Columns | Label **2.60 in**; **12 month columns at 0.74 in** (8.88 in); **0.08 in gap**; **`LTM` total 0.85 in**. Total 12.41 in. That is 13 value columns — exactly the 2.5 cap, so no other column (PF, `% of LTM`) may be added; if PF is wanted it goes in the S7 tables |
| Header tier 1 | `LTM Jul-26, by month` centred over the 12 months; `LTM` over the total (both on the `7B0000` band; the gap column is white) |
| Header tier 2 | `Aug-25 … Jul-26` (`mmm-yy`, D7) and `Jul-26`; first cell `Income statement  ($000s)` left-aligned |
| Rows | ≤ 22 body rows: the **category-level** lines of `Monthly P&L` (revenue lines, `Total Revenue`, cost lines, `Gross Profit`, `% margin`, opex buckets, `Reported EBITDA`, `% margin`, `Adj. EBITDA`, `% margin`), never the mapped account detail (that stays in the model's Databook). If the category list exceeds 22, split as two tables on two pages: revenue through gross profit; operating expenses through Adj. EBITDA, each page repeating both header tiers |
| Figures | `$` on the first row of each block and on totals; `#,##0`; en-dash zero; ratio rows italic 0 dp… margins 1 dp per 2.5. Type 8 pt is permitted in the appendix (3.2) |
| Pages | The LTM window page is always built when ≥ 12 months exist. Earlier fiscal-year windows (`FY2025, by month` with an `FY2025` total column) are built only when the request asks for monthly history, oldest first, each on its own page |
| Source line | `Source: Company financial statements (QuickBooks Online), monthly, Aug-25 to Jul-26; AMB Advisory analysis.` Note: `Months are as reported; the LTM column ties to S6.1.` |
| Traceability | Every cell is a named output from `Monthly P&L` (5.13 adds `Monthly_<line>` row names); the LTM column ties to `Rev_LTM`, `AdjEBITDA_LTM` (C-M3) |

Retention and customer tables in S4 that show months use the same 12 + total geometry with `Ending customers` as the total column rather than a sum.

---

## 7. Open questions for Frank (add to section 6)

| # | Question | Why it matters |
|---|---|---|
| Q-M1 | The retention strip in V51 runs two months past the P&L (to Sep-26) because the customer list was newer. Should the strips be truncated to the P&L as-of date (proposed), or should retention keep its own as-of with a note? | One as-of date per model versus using every month available |
| Q-M2 | Model chart tabs: keep AMB's two-charts-per-landscape-page tabs (`Revenue Charts`, `Expense Charts`) in the buyer version of the workbook, or drop them since the CIM carries the charts? | Page budget of the printed model |
| Q-M3 | The `Combined P&L` header is dark blue `1F4E78`, the analysis headers maroon. Keep a blue header as the "databook / raw lineage" marker, or make every tab maroon? | 5.1 does not say; the guide's `Databook` spec inherits maroon by default |
| Q-M4 | Monthly history window on `Monthly P&L`: from the first month of FY-2 (24–36 columns), or every month the source provides? | Print width and the CIM's S11.2 page count |
