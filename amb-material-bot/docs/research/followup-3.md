# Follow-up 3: Native Excel charts in the model (fills the chart gap in HOUSE_STYLE.md §5)

**Scope.** Section 5 of `docs/HOUSE_STYLE.md`, the model spec, never mentions charts. Section 2.6 covers pptx charts for the CIM only. V51 carries 20 native Excel charts on 7 tabs, and AMB's two exhibit packs (PLO, PACK) are prints of those tabs. R-MOD §5 sums up their style in one sentence (line 212). The guide neither adopts nor retires them, and 1.2's retired list already bans two of V51's chart colours (`70AD47`, `00B0F0`) without saying what replaces them in the model. This report records exactly what AMB does, lists what is weak, and gives drop-in spec text: which charts, on which tabs, the palette, the XML-level Excel settings, the print setup, how to build them (ExcelJS cannot) and how to QA them.

**Method.**
- Unzipped V51 and parsed all 20 `xl/charts/chartN.xml` parts with lxml: type, grouping, gap and overlap, every series' `c:f` references and fill, data labels, both axes, gridlines, legend, fonts and manual layout.
- Mapped charts to tabs through the sheet → drawing → chart relationships. Took anchors from `xl/drawings/drawingN.xml` and converted them to inches using the column widths and row heights.
- Resolved theme colours against `xl/theme/theme1.xml` (Office 2013 theme: `accent6` = `70AD47`, `accent4` = `FFC000`, `tx2` = `44546A`, `accent1` = `5B9BD5`).
- Read every chart tab with openpyxl: captions, chart-data blocks, formulas, fonts, widths, print setup, conditional formats.
- Rendered V51 through LibreOffice (422 pages) and looked at the chart pages (pp. 52–55, 60, 62, 68–74, 78–82, 91, 93–99, 101). Rendered PLO (8 pp.) and PACK (31 pp.) with pymupdf. PLO and PACK are Excel prints (Acrobat Distiller, sourced from "Diligence Workbook v10.xlsx" and "v36.xlsx"), so they show what Excel actually prints. Measured fills and strokes from the PDF vector drawings.
- Built a prototype of the proposed spec (openpyxl charts, patched to match the XML settings below), rendered it through LibreOffice and inspected it: `…/scratchpad/research/followup3/proto/proto3.xlsx`, `proto3_p1.png`, `proto3_p2.png`. Three LibreOffice behaviours found there shape the spec (§4.4, §4.8).

Paths are relative to `/home/user/project-avengers/references/`.

---

## 1. Summary: what the guide should say

1. **Adopt native Excel charts in the model. Keep AMB's habit and redraw it.** AMB's diligence workbook is also the printing press for its exhibit packs: PLO (pp. 4, 7, 8) and PACK (pp. 3, 7–10, 13–15, 18, 22–24, 26–28) are prints of the V51 chart tabs, and 19 of V51's 20 charts appear in PACK. Retiring the charts would take that function away. The CIM does **not** reuse the model's charts: it draws its own pptx charts from the same engine values (2.6). Both use one palette, so a model print and a CIM page agree.
2. **Chart tabs, not charts on analysis tabs.** Each chart tab follows its analysis tab directly (Keep: V51 "Revenue Charts", "Expense Charts", etc.; Fix: V51 files "Expense Charts" four tabs ahead of "Expense Analysis"). Four tabs: `Revenue Charts`, `Expense Charts`, `Retention Charts` (C), `Headcount Charts` (C). At most **17 charts** (V51: 20). At most **10 printed pages**, two exhibits per landscape page.
3. **The palette is 2.6's, mapped role by role** (§4.3). Wins/hires `7B0000` above the axis, losses/departures `5E5552` below it (diverging, clustered with overlap 100). Losses by type: `5E5552` / `DCC7C4` / `C49A5B`. Mix: `7B0000` / `C49A5B` / `5E5552` / `DCC7C4` (top 3 + Other). Ratio panel: a `7B0000` 1.75 pt line in its own chart below the bars, **never a secondary axis**. Colours are always `srgbClr` hex, never `schemeClr` theme references.
4. **Excel settings** (§4.4): gap width 60 (one number for model and CIM; V51 uses 70 on 17 charts, 150 and 60 on one each). Labels Arial 8 regular `2C2523` with an explicit `numFmt formatCode="#,##0;(#,##0);;" sourceLinked="0"`, which hides zero labels. Value axis deleted when every bar is labelled. No gridlines, except 0.25 pt `C2BAB8` on stacked charts and the ratio panel. Category axis 0.5 pt `C2BAB8`, labels 8 pt `7A706D`, horizontal. Labels on quarter starts only above 24 months, done with a formula label row, because LibreOffice ignores `tickLblSkip`. No outlines. No chart title object: the caption sits in the cell above (Keep). `plotVisOnly="0"`. Anchored as `twoCellAnchor editAs="oneCell"`.
5. **Print setup** (§4.6): landscape Letter, fit to 1 page wide × automatic tall, 5.11 margins and footer, print titles rows 2:3. One contiguous print area `B2:M…`, with manual breaks after every second exhibit. Each exhibit is a 19-row block: caption, 16 chart rows (2.67 in), note, spacer. Chart width B:M = 9.81 in at 100% scale. V51's multi-range print areas leave about 45% of every retention page blank.
6. **Build path** (§4.7): ExcelJS 4.4.0 has **no chart API** (nothing in `node_modules/exceljs/lib` writes `c:chartSpace`). A small post-processor on the saved buffer, using JSZip (already installed as an ExcelJS dependency), injects the chart, drawing, rels and content-type parts, with cached values from the engine.
7. **Two new checks** (§4.8): **C19**, each chart-data row ties to its source tab. It would have caught V51's employee chart plotting client data (§3, defect 1). **C20**, a writer-side lint on every chart part: ranges resolve, series names sit on the plotted row, palette only, no secondary axis, no hard axis bounds. Plus a render check with **Carlito** installed.
8. **Retire:** the tenure pie, the dual-axis combos, the 6-colour theme-tinted stacked mix, `70AD47` / `00B0F0` / `FF0000` / `FFC1C1` in charts, black bar outlines, black gridlines, hard-coded axis bounds, typed period text in captions, and the "Yearly Employee Wins & Losses" colour-scale roster as a chart substitute.

---

## 2. What AMB does (V51, PLO, PACK)

### 2.1 Inventory: 20 charts on 7 tabs

"Size" is computed from anchors, widths and heights (Calibri 11 default font, max digit width 7 px). "Labels" means data labels shown. The PACK/PLO column gives the printed page.

| Part | Tab | Anchor | Size (in) | Caption cell (verbatim) | Type | Series → fill | Labels | Value axis / gridlines | Legend | Printed |
|---|---|---|---|---|---|---|---|---|---|---|
| chart1 | Expense Charts | B6:L21 | 8.56 × 2.66 | B5 "Monthly Indirect Wages (Jan’24 - July’26)" | col clustered, gap 70 | Indirect Labor → `7B0000` | yes | hidden / none | none | PLO p7, PACK p27 |
| chart2 | Expense Charts | B24:L43 | 8.52 × 3.38 | B23 "Monthly Bookkeeper Wages (Jan’24 - July’26)" | col + line, **secondary axis** | Bookkeeper Wages → `7B0000`; % Recurring Revenue → `00B0F0` 1 pt line | bars yes | primary hidden; secondary 0.0% visible, **min 0.1** | bottom | PLO p7, PACK p27 |
| chart3 | Expense Charts | B45:L64 | 8.51 × 3.22 | B44 "Monthly Onboarding Wages (Jan’24 - July’26)" | col + line, secondary | Onboarding Team Wages; % Recurring Revenue | bars yes | secondary **max 0.21** (prints "(4.0%)" to "21.0%", PLO p8) | bottom | PLO p8, PACK p28 |
| chart4 | Expense Charts | B66:L84 | 8.58 × 3.10 | B65 "Monthly Software Expense Excluding Topkey (Jan’24 - July’26)" | col + line, secondary | Software & Apps; % Recurring Revenue | bars yes | secondary **min 0.1** | bottom | PLO p8, PACK p28 |
| chart5 | Tech Stack | A30:H48 | 5.43 × 3.11 | B29 "Top 10 Software Vendors LTM Spend ($000s)" | col clustered, gap 70 | LTM Spend → `7B0000` | yes (`$161`) | hidden | none | PACK p3 |
| chart6 | Revenue Charts | B6:L23 | 8.60 × 2.95 | B5 "Monthly STR Subscription Revenue (Jan’24 - July’26)" | col clustered, gap 70 | STR Subscription → `7B0000` | yes | hidden | none | PLO p4, PACK p26 |
| chart7 | Revenue Charts | B27:L44 | 8.32 × 2.97 | B25 "Monthly Recurring Revenue Excluding STR (Jan’24 - July’26)" | col **stacked, gap 150, overlap 100** | Occupancy Taxes → accent6 75% (`548235`); SMB Subscription → `7B0000`; Topkey Subscription → tx2 20/80 (`D6DCE5`); STR Bill Pay → accent4 40/60 (`FFE699`); Onboarding → accent4 75% (`BF9000`); Controller Services → `FFC1C1` | no | visible `[$$]#,##0`, **black 0.75 pt gridlines** | bottom | PLO p4, PACK p26 |
| chart8 | Customer Retention Charts | B6:L30 | 8.70 × 4.01 | B5 "Monthly Property Manager, STR Owner & Short-Term Rental (By Churn Type)" | col clustered, gap 70, 4 series | Client Wins → `70AD47`; Regrettable Losses → `7B0000`; Non-Regrettable Losses → `FFC1C1`; Unclassified Losses → `FF0000` | no | visible, `D9D9D9` gridlines | bottom | PACK p8 |
| chart9 | Customer Retention Charts | B33:M57 | 8.81 × 3.97 | B32 "Monthly Property Manager, STR Owner & Short-Term Rental" | col clustered, gap 70 | Client Wins → `70AD47`; Client Losses → `7B0000` | yes | hidden | bottom | PACK p7 |
| chart10 | Customer Retention Charts | B59:L83 | 8.71 × 4.13 | B58 "Monthly Property Manager Retention" | as chart9 | as chart9 | yes | hidden | bottom | PACK p9 |
| chart11 | Customer Retention Charts | B86:L110 | 8.72 × 3.98 | B85 "Monthly STR Owner Retention" | as chart9 | as chart9 | yes | hidden | bottom | PACK p10 |
| chart13 | Client Retention Charts $ | B5:L30 | 8.68 × 4.12 | B5 "…(By Churn Type)" | as chart8, `[$$]` | as chart8 | no | visible, `D9D9D9` | bottom | PACK p14 |
| chart12 | Client Retention Charts $ | B33:L56 | 8.69 × 3.93 | B32 "Monthly Property Manager, STR Owner & Short-Term Rental" | 2 series, $ | Client Wins `70AD47`; Client Losses `7B0000` | no | visible, `D9D9D9` | bottom | PACK p13 |
| chart14 | Client Retention Charts $ | B59:L83 | 8.71 × 4.10 | B58 "Monthly Property Manager Retention" | 2 series, $ | as chart12 | no | visible, `D9D9D9` | bottom | PACK p15 |
| chart15 | Tenure Charts | B6:G23 | 5.01 × 2.96 | B5 "Employee Tenure By Inactive Employee Cohorts" | col clustered, **gap 60** | Employee Count → `7B0000` | yes | **deleted, max 23 hard-coded** | bottom (one series) | PACK p18 |
| chart16 | Tenure Charts | B26:G42 | 4.99 × 2.83 | B25 "Employee Tenure By Inactive Employee Cohorts (%)" | **pie** | points `7B0000`, `FFC1C1`, `FFE1E1`, tx2 20/80 (`D6DCE5`), accent1 40/60 (`BDD7EE`); 1.5 pt white separators | % outside (`outEnd`/`bestFit`) | n.a. | bottom | PACK p18 |
| chart17 | Employee Retention Charts | B6:L30 | 8.70 × 4.01 | B5 "Monthly Property Manager, STR Owner & Short-Term Rental (By Churn Type)" (**sic, on the employee tab**) | as chart8 | Employee Hires `70AD47`; Regrettable `7B0000`; Non-Regrettable `FFC1C1`; Unclassified `FF0000` | no | visible, `D9D9D9` | bottom | not in PACK (added after v36) |
| chart18 | Employee Retention Charts | B33:L57 | 8.68 × 3.96 | B32 "Total Monthly Employee Retention" | 2 series | Employee Hires `70AD47`; Employee Losses `7B0000` | yes | hidden | bottom | PACK p22 |
| chart19 | Employee Retention Charts | B59:L83 | 8.71 × 4.13 | B58 "Monthly Bookkeeper Retention" | 2 series | New Hires; Employee Losses | yes | hidden | bottom | PACK p23 |
| chart20 | Employee Retention Charts | B86:L110 | 8.72 × 3.98 | B85 "Monthly Onboarding Retention" | 2 series | New Hires; Employee Losses | yes | hidden | bottom | PACK p24 |

**"Yearly Employee Wins & Losses" has no chart** (no drawing part). It is a named roster ("2026 Employee Losses", "2026 Employee Hires": name, Job Title, Hire Date, Inactive Date, Inactive Tenure (Months), Type). Name, title and date cells are filled theme `accent4` tint 0.8 (= `FFF2CC`). A two-colour scale runs `FCFCFF` → `F8696B` on tenure (F6:F32, F35:F78), and a `containsText "Resignation"` rule fills G. It prints at 76% portrait, zoom 145% (V51 p101, PACK p25). The brief's list of chart tabs includes it, but it is a table, not a chart.

### 2.2 The recipe common to all 20 (what R-MOD's one line compresses)

| Element | V51 value (XML) | Count |
|---|---|---|
| Title | `c:autoTitleDeleted val="1"`. The title is the caption in the cell above the chart | 20/20 |
| Chart area | `c:spPr` fill `bg1` (white), `a:ln noFill`, `c:roundedCorners val="0"` | 20/20 |
| Plot area | noFill, no border; `c:manualLayout layoutTarget="inner"` (e.g. chart1 x 0.0298, y 0.0253, w 0.9524, h 0.7898) | 20/20 |
| Base text | `c:txPr` `sz="800"`, `latin typeface="Arial"`, `cs typeface="Arial"` | 20/20 |
| Style ids | `c14:style val="102"`, fallback `c:style val="2"`; `chartStyle`/`colors` parts present (style1–20.xml, colors1–20.xml) | 20/20 |
| Bar gap width | 70 (17 charts); 150 with overlap 100 (chart7 stacked); 60 (chart15) | |
| Bar outline | `a:ln` solid `sysClr windowText` with no width set (a hairline, printed as 0.75 pt black strokes: PLO p4 has 73) on every clustered bar; stacked chart7 `noLine` | 18/19 bar charts |
| Primary fill | `srgbClr 7B0000` | 19/19 bar charts |
| Data labels | `showVal=1`, no `c:numFmt` (so **source-linked** to the cell format `#,##0;\(#,##0\);"–";@`), 8 pt **bold** `windowText`, default position (outside end) | 14/20 |
| Value axis | hidden with `c:tickLblPos val="none"` and `a:ln noFill` (13 charts) or `c:delete val="1"` (chart15). When visible: 8 pt **bold** black, `majorTickMark out` (charts 7, 8, 12, 13, 14, 17) | |
| Gridlines | none on 14 charts; `D9D9D9` (`tx1` lumMod 15% lumOff 85%) 0.75 pt on charts 8, 12, 13, 14, 17; `windowText` black 0.75 pt on chart7 | |
| Category axis | `c:dateAx`, `baseTimeUnit months`, `numFmt mmm\-yy`, line `9525` EMU (0.75 pt) black, `majorTickMark out`, labels 8 pt regular black, `rot="-60000000"` (auto). Excel printed them at **45°** on 31-month charts (PLO pp. 4, 7, 8) and on the $ retention charts (PACK p13), and horizontal on 21-month count charts (PACK pp. 7, 8, 22) | 17/19 |
| Ratio line | `c:lineChart`, `a:ln w="12700"` (1 pt) `srgbClr 00B0F0`, `c:marker symbol none`, `smooth 0`, on a secondary `valAx` (`crosses max`, `0.0%` format, labels visible on the right) | 3 (charts 2–4) |
| Legend | `legendPos b`, overlay 0, 8 pt regular black. None on charts 1, 5, 6 | 17/20 |
| Hidden cells | `c:plotVisOnly val="1"`, `c:dispBlanksAs val="gap"` | 20/20 |
| Anchor | `xdr:twoCellAnchor` with no `editAs` (so the default, twoCell: the chart **resizes when columns change**); ragged offsets of 1–47 pt | 20/20 |

In the renders, all chart text is Arial: the PDF fonts on PLO/PACK chart pages are ArialMT 8.0, Arial-BoldMT 8.0 (labels), Arial-BoldMT 9.0 (captions), Arial-BoldMT 13.0 (company name) and Arial-ItalicMT 9.0 (subtitle).

### 2.3 Chart-tab anatomy

- **Rows 2–3** follow the analysis-tab grammar. Row 2 is the company name, 13 Bold. Three tabs link it `=+Cover!B24` (Expense Charts, Tech Stack, Revenue Charts). Four daisy-chain it through another tab: `=+'Client Retention'!B2` on Customer Retention Charts **and** Employee Retention Charts, `=+'Client Retention $'!B2` on Client Retention Charts $, and `=+'Employee Retention'!B2` on Tenure Charts. Row 3 is an italic 9 subtitle with a thin bottom border: "Monthly Expense Trends ($000s)", "Monthly Revenue Trends ($000s)", "Tech Stack Overview ($000s)", "Client Retention Charts", "Client Retention Charts ($000s)", "Employee Tenure Overview", and **"Client Retention Charts" on Employee Retention Charts** (wrong).
- **Caption cell** above each chart: Arial 9 Bold, **single underline** on Expense, Revenue, Tenure, Employee Retention Charts and Tech Stack, but **no underline** on Customer Retention Charts and Client Retention Charts $. The period is typed text with curly apostrophes and a mixed month style: "(Jan’24 - July’26)".
- **Chart-data block on the same tab, below the print area.** Expense Charts rows 95–108, Revenue Charts 47–57, Customer Retention Charts 111–127, Client Retention Charts $ 85–101, Tenure Charts 50–64, Employee Retention Charts 112–128.
  - Header row: Arial 9 Bold white on `7B0000`, format `mmm-yy`. The **first month is a typed constant** (`2024-01-01` for the P&L charts, `2025-01-01` for retention), then `=EOMONTH(C95,0)+1` across.
  - Data rows are green cross-sheet links: `=SUMIFS('Combined P&L'!N:N,'Combined P&L'!$C:$C,'Expense Charts'!$B96)`, `=+'Client Retention'!J23`, `=-'Client Retention'!J24`. Losses are negated to **positive** values, so they plot as upward bars.
  - Ratio rows `=C99/'P&L Forecast'!P$15` are black although they are cross-sheet links, which breaks 5.9's colour code.
  - Windows: 31 months C:AG (Jan-24 → Jul-26) and 21 months C:W (Jan-25 → Sep-26), all fixed ranges.
- **Columns:** A 1.71, B 27.86–28.86, the rest about 9.14 (L 5.14 on Expense Charts). Row height 12 (row 2 16.5). Gridlines off. `view="pageBreakPreview"` on all chart tabs, `zoomScaleNormal` 100–160. No freeze panes, no tab colour, **no Print toggle** (only Tech Stack has "Print" at J3/K3), **no header or footer**.

### 2.4 Print setup and how it prints

| Tab | Orientation | Scale | Print area | Titles | Breaks | Result in Excel print (PLO/PACK) |
|---|---|---|---|---|---|---|
| Expense Charts | landscape | 100%, no fit | `B2:L84` | `$2:$4` | manual after row 43 | 2 charts per page (PLO pp. 7–8): the densest AMB chart page |
| Revenue Charts | landscape | fitToPage | `B2:L44` | none | none | 2 charts on one page (PLO p4) |
| Customer Retention Charts | landscape | 100% | **4 ranges** `B2:L30, B32:L56, B58:L83, B85:L109` | `$2:$4` | none | 1 chart per page; chart ≈ 4.0 in tall, **lower ≈ 45% of each page blank** (PACK pp. 7–10) |
| Client Retention Charts $ | landscape | 100% | 3 ranges | `$2:$4` | none | same (PACK pp. 13–15) |
| Employee Retention Charts | landscape | 100% | 4 ranges | `$2:$4` | none | same (PACK pp. 22–24) |
| Tenure Charts | **portrait** | 100% | `B2:G42` | none | none | bar + pie on one portrait page (PACK p18) |
| Tech Stack | landscape | 90%, fitToPage | `B2:H48` | none | none | two tables + bar chart (PACK p3) |

Margins on every chart tab are Excel "Normal" (0.7 / 0.7 / 0.75 / 0.75, header and footer 0.3), not 5.11's. Each chart part also carries `c:printSettings` with the same margins. PLO pages show a centred page number; PACK pages show none; V51 has no footers.

**The LibreOffice render of V51 is not faithful for these tabs.** Expense Charts p52 is cut after Feb-26, and p53 is a page holding only chart2's legend. Chart2's secondary-axis scale is not drawn (p52). The retention charts are cut at May-26 (p68, p70). Two causes: no fit-to-width, and LibreOffice measuring the Calibri-based column widths with DejaVu Sans (`fc-match Calibri` → DejaVu Sans; no Carlito installed). R-MOD §9.3 item 14 lists "chart tabs cut off after Feb-26 or Apr-26 (pp.52, 68)" as a print defect. The Excel prints in PLO/PACK are not cut; the defect is renderer dependence, which the spec below removes.

---

## 3. What is weak (and should be elevated)

1. **A chart plots the wrong data.** On Employee Retention Charts, chart17's data block (rows 113–116, "Employee Hires", "Regrettable Losses", …) is `=+'Client Retention'!J23`, `=-'Client Retention'!J24` … `J26`: **client** retention. Its cached values (9, 5, 8, 9, 9, 6, 7, …) are identical to Customer Retention Charts row 112 "Client Wins". The caption is also the client caption. Nothing in V51 checks a chart's data against its source. → C19.
2. **Series names are taken from a different row than the values.** Chart9's series name is `$B$112` while its values are row 118. Chart18's name is `'Employee Retention Charts'!$B$113` ("Employee Hires") while its values are row 119 ("New Hires"). So the legend on PACK p22 reads "Employee Hires" over a row the tab calls "New Hires", and charts 19–20 read "New Hires". → C20 lint.
3. **Dual axes with hard-coded bounds.** Charts 2–4 put a 1 pt cyan "% Recurring Revenue" line on a secondary axis with `min 0.1` (charts 2, 4) or `max 0.21` (chart3). PLO p8 prints a "(4.0%)" to "21.0%" axis, so the line's height against the bars means nothing. Chart15 hard-codes `max 23` on a count that is 22 today. D10 already bans dual axes in the CIM; the model needs the same rule.
4. **Excel theme leakage.** 11 charts use `schemeClr accent6` (`70AD47`) for wins and hires, and chart7 and chart16 use tints of `accent4`, `tx2` and `accent1`. These colours change if the workbook theme changes and sit outside AMB's palette. `FF0000` "Unclassified Losses" on 3 charts is the pure red that 1.2 bans as a chart colour.
5. **Wins vs losses drawn as side-by-side positive bars** (losses negated to positive). The reader compares two heights per month across 21 months. The by-type version puts 4 bars in a slot (PACK p8), with `FF0000` next to `7B0000`. A diverging layout, with wins up and losses down in one slot, reads the net at a glance.
6. **Zero labels print as floating en dashes.** Because labels are source-linked to `#,##0;\(#,##0\);"–";@`, a zero shows "–" sitting on the axis (PACK p7 Sep-26; p22 Apr-25, Jul-25, Sep-25, Oct-25, Mar-26).
7. **Inconsistent anatomy.** Charts with ≤ 2 series in counts are labelled with no axis. The $ wins/losses charts and the 4-series charts flip to an axis, gridlines and no labels. The stacked mix has black gridlines. The tenure chart has a one-series legend ("Employee Count"). Captions are underlined on five tabs and not on two. Labels are 45° on some charts and horizontal on others.
8. **A pie duplicating a bar.** Chart16 restates chart15's five buckets as percentages. 2.6 already bans pies in the CIM.
9. **Wasted pages.** Multi-range print areas print one 4.0 in chart per 8.5 in page (PACK pp. 7–10, 13–15, 22–24: 11 pages at about 55% use). Expense Charts shows two per page works (PLO pp. 7–8).
10. **Fragile periods.** The first month is typed (`2024-01-01`, `2025-01-01`) and captions carry typed periods ("Jan’24 - July’26"). Data is pulled by column position (`'Combined P&L'!N:N`, `O:O` …), not matched on the date, so a shifted header silently misaligns the months.
11. **Copy-paste titles.** "Client Retention Charts" as the subtitle and "Monthly Property Manager, STR Owner & Short-Term Rental (By Churn Type)" as a caption on the employee tab. The tab is also named "Customer Retention Charts" while its subtitle says "Client" (D11).
12. **No source line, no note** under any chart (R-DEL §3.3). **No footer** on any chart tab.
13. **Default anchors** (`twoCell`): widening a column stretches every chart on the tab. `plotVisOnly=1` means that grouping and collapsing the data rows would blank the charts.
14. **Label density at 45°.** 31 bold 8 pt labels on an 8.5 in chart nearly touch ("57 58 54 60 58", PLO p7). Rotated month labels take a third of the plot height (PLO p4).

---

## 4. Proposed spec (drop-in text for HOUSE_STYLE.md)

Insert as a new **§5.12 Chart tabs**. Renumber the current 5.12 → 5.13 (Cover and Contents), 5.13 → 5.14 (Named outputs) and 5.14 → 5.15 (bot changes), and update the references at lines 692 ("5.12" → "5.13"), 389, 678 and 723 ("5.13" → "5.14").

### 4.1 Decision

> **Keep: native Excel charts in the model** [V51 charts 1–20; PLO pp. 4, 7, 8; PACK pp. 3, 7–10, 13–15, 18, 22–24, 26–28]. The model's chart tabs are AMB's exhibit pack: printed to PDF, they replace "Initial P&L Overview" and "Pre-LOI Diligence". The CIM never pastes or screenshots them. It draws its own pptx charts from the same engine values (2.6), in the same palette.

### 4.2 Where charts live, and the catalogue

Add these rows to the 5.1 tab table, each directly after its analysis tab (renumber the rows that follow):

| After | Tab | Status | Contents | Precedent |
|---|---|---|---|---|
| `Revenue Detail` | `Revenue Charts` | A when `Monthly P&L` exists | MC-R1, MC-R2 | V51 Revenue Charts |
| `Expense Detail` | `Expense Charts` | A when `Monthly P&L` exists | MC-E1–MC-E5 | V51 Expense Charts, Tech Stack chart |
| `Customer Retention` | `Retention Charts` | C: as `Customer Retention`, plus monthly dates | MC-C1–MC-C5 | V51 Customer Retention Charts, Client Retention Charts $ |
| `Headcount` | `Headcount Charts` | C: payroll register with hire and termination dates | MC-H1–MC-H5 | V51 Employee Retention Charts, Tenure Charts |

Tab names are term-neutral, so they do not change with D11's customer/client setting. They are output tabs: listed on `Contents` with units "(#, $000s)", no tab colour.

**Chart catalogue** (each ID is one exhibit: caption + chart + note):

| ID | Tab | Exhibit | Form | Series (fixed order) | Condition | V51 precedent |
|---|---|---|---|---|---|---|
| MC-R1 | Revenue Charts | Monthly Total Revenue | single bar, labelled | Total revenue | A | chart6 (largest line only) |
| MC-R2 | Revenue Charts | Monthly Revenue by Line | stacked bar, axis + gridlines, no labels | Top 3 lines by LTM revenue + "Other" | ≥ 2 revenue lines | chart7 (6 series, theme colours) |
| MC-E1–E3 | Expense Charts | Monthly <Department> Wages | bar panel + ratio panel ("% of Revenue") | Wages; wages ÷ total revenue | one per department with ≥ 10% of payroll, max 3, by LTM size; otherwise one "Monthly Payroll" | charts 1–3 |
| MC-E4 | Expense Charts | Monthly <largest non-payroll operating expense> | bar panel + ratio panel | Expense; expense ÷ total revenue | A | chart4 (Software) |
| MC-E5 | Expense Charts | Top 10 Vendors, LTM Spend | horizontal bar, ranked, labelled | LTM spend | GL detail by vendor supplied | chart5 (column; names wrap: "QuickBooks Online", "Microsoft 365") |
| MC-C1 | Retention Charts | Monthly Customer Wins and Losses (#) | diverging, labelled | New customers ↑; lost customers ↓ | A for the tab | chart9 |
| MC-C2 | Retention Charts | Monthly Customer Losses by Churn Type (#) | stacked diverging, axis + gridlines | New ↑; Regrettable, Non-regrettable, Unclassified ↓ | churn reason coded | chart8 |
| MC-C3 | Retention Charts | Monthly Revenue Won and Lost ($000s) | diverging, labelled | New revenue ↑; churned revenue ↓ | customer revenue by month | charts 12–14 |
| MC-C4–C5 | Retention Charts | Monthly <Segment> Wins and Losses (#) | diverging | as MC-C1 | segment field; max 2 segments with ≥ 20% of customers | charts 10–11 |
| MC-H1 | Headcount Charts | Monthly Hires and Departures (#) | diverging, labelled | Hires ↑; departures ↓ | A for the tab | chart18 |
| MC-H2 | Headcount Charts | Monthly Departures by Type (#) | stacked diverging | Hires ↑; type 1, type 2, Unclassified ↓ | termination type coded | chart17 (fix its source) |
| MC-H3–H4 | Headcount Charts | Monthly <Department> Hires and Departures (#) | diverging | as MC-H1 | max 2 departments with ≥ 20% of headcount | charts 19–20 |
| MC-H5 | Headcount Charts | Tenure at Departure (#) | single bar, labelled | "First 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "Over 2 Years" (V51 buckets verbatim; hyphens per the 5.8 model rule) | hire and termination dates | chart15 (pie chart16 retired) |

**Not charted in the model:**
- The EBITDA ladder: the table on `Adj. EBITDA` is the bridge, and the CIM draws the waterfall.
- Concentration and cohorts: tables, the cohort triangle with the 2.6 ordinal ramp.
- The named departures roster (V51 "Yearly Employee Wins & Losses"): its facts are in `Headcount`, and names stay in `Raw - Payroll`. Its `F8696B` colour scale and `FFF2CC` fill are retired.

**Monthly window.** Every month in `Monthly P&L` up to the as-of month, capped at **36**, and at least 12 (fewer → no monthly charts, per the 5.2 missing-data rule). When the window exceeds 24 months it starts on a calendar-quarter start (Jan, Apr, Jul, Oct). Retention and headcount charts use the same window, bounded by the customer and payroll data.

### 4.3 Palette mapping (reuses 2.6; no new colours)

| Model chart role | Hex | Excel XML | Replaces (V51) |
|---|---|---|---|
| Single series (revenue, wages, expense, vendor spend, tenure count) | `7B0000` | `<a:solidFill><a:srgbClr val="7B0000"/></a:solidFill>` | `7B0000` (Keep) |
| Wins / new customers / hires (above the axis) | `7B0000` | same | `70AD47` (`schemeClr accent6`) |
| Losses / departures, total (below the axis) | `5E5552` | `srgbClr 5E5552` | `7B0000` |
| Losses by type: Regrettable (or first-named type, e.g. Resignation) | `5E5552` | | `7B0000` |
| Non-regrettable (second type, e.g. Termination) | `DCC7C4` | | `FFC1C1` |
| Unclassified | `C49A5B` | | `FF0000` |
| Revenue mix: largest line / 2nd / 3rd / Other | `7B0000` / `C49A5B` / `5E5552` / `DCC7C4` | | `548235`, `7B0000`, `D6DCE5`, `FFE699`, `BF9000`, `FFC1C1` |
| Stacked segment separator | `FFFFFF`, 0.5 pt | `<a:ln w="6350"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>` | none |
| Ratio-panel line | `7B0000`, 1.75 pt | `<a:ln w="22225">…7B0000…</a:ln>` | `00B0F0`, 1 pt, secondary axis |
| Axis line, gridlines | `C2BAB8` (0.5 pt axis, 0.25 pt gridlines) | `w="6350"` / `w="3175"` | `000000` 0.75 pt axis; `D9D9D9` / `000000` gridlines |
| Axis labels | `7A706D` | `defRPr` fill | `000000` |
| Data labels, legend | `2C2523` | | `000000` (labels bold) |

The losses-by-type series are ordered so that the most important type sits against the axis (negative stacks build downward in series order). Light fills (`C49A5B`, `DCC7C4`) only appear in stacked charts that carry a value axis, and are never the only carrier of a number. That is 2.6's direct-label rule adapted to a chart with an axis.

### 4.4 Excel chart settings (the writer emits exactly these)

| Element | Setting | XML | V51 | Why |
|---|---|---|---|---|
| Title | none in the chart; caption in the cell above | `<c:autoTitleDeleted val="1"/>` | same | Keep |
| Chart area | white, no border, square | `c:spPr` solidFill `FFFFFF`, `a:ln noFill`; `c:roundedCorners val="0"` | same | Keep (openpyxl adds a border by default; the injector must not) |
| Plot area | noFill; **manual inner layout x 0.05, w 0.94** on every chart, y and h per chart | `<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.05"/>…<c:w val="0.94"/>` | manual inner, varying | Identical x and w keep a bar panel and its ratio panel aligned month for month (checked in the prototype render) |
| Base font | Arial 8 | chartSpace `c:txPr` `sz="800"`, `a:latin` and `a:cs` Arial | same | Keep |
| Bar gap width | **60** | `<c:gapWidth val="60"/>` | 70 / 150 / 60 | One value for model and CIM (2.6) |
| Overlap | 100 on stacked and diverging charts | `<c:overlap val="100"/>` | 100 on chart7 only | Diverging bars share one slot |
| Diverging (wins / losses) | `grouping clustered`, overlap 100; losses stored **negative** in the chart data | | positive side-by-side bars | Clustered keeps `outEnd` labels (stacked charts only allow `ctr` / `inEnd` / `inBase`; the prototype showed stacked labels colliding) |
| Stacked diverging (by type) | `grouping stacked`, overlap 100, 0.5 pt white separators | | clustered 4-up | |
| Bar outline | none | `<a:ln><a:noFill/></a:ln>` | black hairline | 2.6 |
| Fill references | `srgbClr` hex only; never `schemeClr` / `sysClr` | | `schemeClr accent6` etc. | Theme-proof |
| Data labels | on for single-series and diverging charts; off on stacked charts | `<c:showVal val="1"/>`, others 0 | 14/20 on | |
| Label format | **explicit, zero hidden**: `#,##0;(#,##0);;` (counts, $000s); `#,##0.0;(#,##0.0);;` ($M); `0%;(0%);;` | `<c:numFmt formatCode="#,##0;(#,##0);;" sourceLinked="0"/>`. **`sourceLinked="0"` is required**: openpyxl omits it, and LibreOffice then falls back to the cell format | source-linked, prints "–" at zero | Fixes defect 6; losses show as "(4)" |
| Label font and position | Arial 8 **regular** `2C2523`, `rot 0`, `dLblPos outEnd` | | 8 pt bold black | 36 bold labels crowd; regular ink reads cleanly (prototype) |
| Label density | every bar up to 36 categories. If a series max is ≥ 1,000 in the chart's units and there are more than 24 bars, the chart switches to $M, 1 dp, and the caption says "($M)" | | | At 36 bars on a 9.2 in plot a slot is 0.26 in, and a 3-character Arial 8 label is 0.19 in |
| Category axis | `c:catAx` over the **Axis Label** row (4.5), not `c:dateAx`; `majorTickMark none`; `tickLblPos low`; line 0.5 pt `C2BAB8`; labels 8 pt `7A706D`, `<a:bodyPr rot="0" vert="horz"/>` | | dateAx, black 0.75 pt, ticks out, auto-rotated 45° | LibreOffice ignores `c:tickLblSkip` (prototype: all 31 labels drawn and wrapped). A formula label row works in both renderers |
| Value axis | `<c:delete val="1"/>` when every bar is labelled. Visible only on stacked charts and ratio panels: labels 8 pt `7A706D`, no line, `majorTickMark none`, format as the labels but with zero as `0` | | hidden via `tickLblPos none` (13), deleted (1), visible bold (6) | |
| Axis bounds | none, except `c:min val="0"` on ratio panels | | min 0.1, max 0.21, max 23 | Fixes defect 3 |
| Gridlines | none on labelled charts; ≤ 4 on stacked charts and ratio panels, 0.25 pt `C2BAB8` (writer sets `c:majorUnit` to a round step ≥ range ÷ 4) | `<c:majorGridlines><c:spPr><a:ln w="3175">…C2BAB8…` | `D9D9D9` / black | 2.6 |
| Secondary axis | **never** | | charts 2–4 | D10 |
| Ratio panel | a **separate chart object** directly under the bar chart, same x/w layout, about 30% of the exhibit height; line 1.75 pt `7B0000`, `c:marker symbol none`, `smooth 0`; the bar chart's category axis is deleted so the months print once, under the ratio panel | | cyan line on secondary axis | 2.6 "two stacked panels" |
| Legend | none for one series. For 2–4 series: `legendPos t`, top-left via manual layout (x 0.05, y 0), overlay 0, 8 pt `2C2523`, series order | | bottom centre; one-series legend on chart15 | 2.6 |
| Pie, doughnut, 3-D, shadow, gradient | never | | chart16 pie | 2.6 |
| Hidden cells | `<c:plotVisOnly val="0"/>`, `<c:dispBlanksAs val="gap"/>` | | `plotVisOnly 1` | Grouping and collapsing the chart-data block must not blank the charts |
| Caches | every `c:numRef` / `c:strRef` carries `c:numCache` / `c:strCache` holding the **engine's** values, with `c:formatCode` | | Excel caches | Charts render before recalculation (Protected View, LibreOffice, previews) and QA can compare them to the engine |
| Anchor | `<xdr:twoCellAnchor editAs="oneCell">` from B<top> offset 0 to N<bottom> offset 0 (the chart spans B:M exactly) | | twoCell, ragged offsets | Geometry defined in cells renders the same in Excel and LibreOffice. With a fixed-size anchor the prototype chart covered only ~75% of its cell block in LibreOffice |
| Extra parts | no `chartStyle` / `colors` parts, no `c:printSettings` | | present | Not needed; the tab's page setup governs |
| Ranked horizontal bar (MC-E5) | `c:barDir val="bar"`; category axis `c:scaling/c:orientation val="maxMin"` so the largest is on top; labels `outEnd` | | column chart | Names read horizontally |

### 4.5 Chart-data block

- **Keep V51's idea:** on the chart tab, **below the print area**, three rows under the last exhibit. Header row `AMB Header`, B cell "Chart Data". The block is grouped (outline level 1) and left **expanded**.
- **Row 1, months:** `=EOMONTH(AsOfDate,-n)+1` in C (n = window length, written by the writer as a constant), then `=EDATE(C<r>,1)`, format `[$-409]mmm-yy;@`. Never typed (Fix: V51 `2024-01-01`).
- **Row 2, Axis Label** (grey `808080`): `=IF(n<=24,TEXT(C<r>,"mmm-yy"),IF(MOD(MONTH(C<r>)-1,3)=0,TEXT(C<r>,"mmm-yy"),""))`. Every chart's category range points here.
- **Data rows** are green cross-sheet links, **matched on the month, not the column position**: `=INDEX('Monthly P&L'!$D$8:$AZ$60, MATCH($B<row>,'Monthly P&L'!$B$8:$B$60,0), MATCH(C$<monthrow>,'Monthly P&L'!$D$6:$AZ$6,0))`. Losses and departures are negated so they plot below the axis. Ratio rows are `=IFERROR(C<wages>/C<revenue>,0)`, black (in-sheet).
- **The series name cell is the B cell of the plotted row.** One block per exhibit, in catalogue order, with one blank row between blocks.
- Mixes: the top 3 lines are chosen by the writer on LTM revenue and written as labels. "Other" = total less the three, so the stack always sums to total revenue.

### 4.6 Chart-tab anatomy and print setup

| Element | Spec | V51 |
|---|---|---|
| Columns | A 1.7; B 34; C:M 9.1 (the 5.2 widths); chart-data months continue C:AL at 9.1 | A 1.71, B 27.86–28.86, rest ≈ 9.14 |
| Rows | all 12 pt (row 2 16.5) | same |
| Row 2 / row 3 | company name `=Cover!B24` (`AMB Title`); subtitle "<Area> Charts (<units>)", e.g. "Revenue Charts ($000s)", "Retention Charts (#, $000s)" (`AMB Subtitle`, rule across B:M). No Print toggle (nothing colour-coded sits in the print area) | daisy-chained links; mistitled subtitle |
| Exhibit block (19 rows) | caption row (`AMB Chart Title`) → 16 chart rows (2.67 in) → note row (`AMB Note`) → spacer row | caption → 15–24 chart rows, no note |
| Caption | `AMB Chart Title` = Arial 9 Bold, `ink` black, left, **no underline**. Built by formula: `="Monthly Bookkeeper Wages, "&TEXT(ChartStart,"mmm-yy")&" – "&TEXT(ChartEnd,"mmm-yy")&" ($000s)"` → "Monthly Bookkeeper Wages, Jan-24 – Jul-26 ($000s)". Title Case, units last | typed "(Jan’24 - July’26)"; underline on 5 of 7 tabs |
| Note | `AMB Note` (Arial 9 Italic): what the ratio or split means, then the source tab. "Ratio panel: bookkeeper wages ÷ total revenue, same months. Source: Monthly P&L." / "Losses by reason recorded in the customer list; unclassified = no reason given. Source: Customer Retention." | none |
| Bar + ratio exhibit | bar chart rows 1–11 of the block (1.83 in), ratio panel rows 12–16 (0.83 in, 31%) | secondary axis |
| Page layout | landscape, Letter (`paperSize 1`), `fitToWidth 1`, `fitToHeight 0`, margins 5.11 (0.5 / 0.5 / 0.6 / 0.7, header and footer 0.3), centred horizontally, print titles rows 2:3, footer per 5.11 | landscape (Tenure portrait), Normal margins, no footer, titles $2:$4 on 4 tabs |
| Print area | one contiguous range `B2:M<last note row>` | multi-range on 3 tabs |
| Page breaks | page 1: rows 2–4 header, exhibits at rows 5–23 and 24–42, break after row 42. Page k ≥ 2: a spacer row, then exhibits at 44+39(k−2) and 63+39(k−2), break after 81+39(k−2). Two exhibits per page; an odd last exhibit prints alone | one per page (retention tabs) |
| Fit check | B:M = 238 px + 11 × 64 px = 942 px = **9.81 in**, which fits 10.0 in at 100% scale. Page 1 height rows 2–42 = 16.5 + 12 + 12 + 38 × 12 = 496.5 pt = 6.9 in against 7.2 in printable | |
| View | normal view, zoom 100%, gridlines off, no freeze panes | `pageBreakPreview`, 100–160% |

Add **`AMB Chart Title`** (Arial 9 Bold, left, no fill, no underline) to the 5.8 named-style table. Chart notes reuse `AMB Note`. The chart-data header reuses `AMB Header`.

### 4.7 Build path (ExcelJS has no chart API)

- `exceljs@4.4.0` (package.json) cannot create charts. No file under `node_modules/exceljs/lib` writes `chartSpace`, and the README mentions charts only in a changelog line about not breaking on chartsheets. `jszip` is installed as its dependency.
- New `src/model/charts.ts` post-processes the buffer from `workbook.xlsx.writeBuffer()`. For each chart tab it adds:
  - `xl/charts/chartN.xml`, built from the settings in 4.4, with caches from the engine.
  - `xl/drawings/drawingN.xml` (one `twoCellAnchor` per chart) and `xl/drawings/_rels/drawingN.xml.rels`.
  - `<drawing r:id="…"/>` in the sheet XML, at its schema position (after `headerFooter` / `rowBreaks`, before `legacyDrawing` / `tableParts`), plus the sheet `.rels` entry.
  - `[Content_Types].xml` Overrides `application/vnd.openxmlformats-officedocument.drawingml.chart+xml` and `application/vnd.openxmlformats-officedocument.drawing+xml`.
- A sheet has at most one drawing part. Chart tabs hold no images, so each gets a new one, and the Cover's logo drawing is untouched.
- Chart specs are data (`{ id, tab, anchorRows, type, series: [{ nameRef, valRef, color }], labels, axis }`), produced by the same code that lays out the chart-data block. The engine exposes the same series, so `verifyWorkbook` can compare caches with values.
- Update 5.14 (to become 5.15) with a new row: *"No charts in the model; ExcelJS has no chart API"* → *"Chart tabs per §5.12 via the `charts.ts` injector"*.

### 4.8 QA

Add to 5.7:

| ID | Check | Why (AMB defect it catches) |
|---|---|---|
| C19 | **Every chart-data row equals its source row for the same months** (`SUM` of the chart row less the matched source over the window, per series; mixes also sum to total revenue) | V51 Employee Retention Charts rows 113–116 plot `'Client Retention'!J23:J26` |
| C20 (writer-side lint in `verifyWorkbook`) | Each chart part: every `c:f` resolves on its own tab inside the chart-data block; category and value ranges have equal length; each series name ref is the B cell of its value row; every colour is in the 4.3 table; no `schemeClr`; no second `c:valAx` crossing at max; no `c:min` / `c:max` except 0; `numFmt` has `sourceLinked="0"`; the caption formula names the same months as the data | V51 chart9 and chart18 name refs off by 6 rows; hard bounds on charts 2–4 and 15; theme colours |

**Render check.** Every chart tab is rendered to PDF in QA. A chart cut at the margin, a chart split across pages, a caption on a different page from its chart, or more than two exhibits on a page fails the build.

**The render environment must install Carlito**, metric-compatible with Calibri, the workbook default font that sets the column-width unit, alongside the Gelasio requirement in 1.3. Without it, LibreOffice measures the columns in DejaVu Sans (confirmed: `fc-match Calibri` → DejaVu Sans here). That widened V51's chart tabs past the page (V51 render pp. 52, 68, 70). The prototype showed the same effect before `twoCellAnchor` was used.

LibreOffice does not draw a second value axis's scale (V51 render p52), which is one more reason for the no-dual-axis rule.

### 4.9 Edits elsewhere in the guide

- **1.2 retired list:** add `FFC1C1` (V51 chart pink), `F8696B` / `FCFCFF` (colour scale), `FFF2CC` (roster fill), and the theme tints `548235`, `BF9000`, `FFE699`, `D6DCE5`, `BDD7EE`. State that the list applies to the model's charts. `D9D9D9` stays as `naFill` only, never as gridlines.
- **2.6:** add one line: *"The model's chart tabs (§5.12) use this palette and these marks; only the density rules differ (every bar labelled up to 36; quarter labels above 24 months)."*
- **5.1:** the four rows in 4.2, and under Tab rules: *"chart tabs follow their analysis tab."*
- **5.7:** C19, C20.
- **5.8:** `AMB Chart Title`.
- **5.11:** point chart tabs to §5.12 for print setup (landscape always; two exhibits per page).
- **6, new open questions:**
  - **Q26:** Does Frank still print exhibit packs from the model (PLO/PACK-style), which is what justifies the chart tabs? Default: yes.
  - **Q27:** Churn and termination type vocabulary for MC-C2 and MC-H2: V51 uses "Regrettable / Non-Regrettable / Unclassified Losses" on both client and employee charts, but its employee roster uses "Resignation / Termination / Unclassified". Default: the words in the source data, with "Unclassified" for blanks.

---

## 5. Verbatim reference: V51 chart captions and series names

- Subtitles: "Monthly Expense Trends ($000s)", "Monthly Revenue Trends ($000s)", "Tech Stack Overview ($000s)", "Client Retention Charts", "Client Retention Charts ($000s)", "Employee Tenure Overview", "Employee Hires & Offboarding Overview ($000s)".
- Captions: "Monthly Indirect Wages (Jan’24 - July’26)", "Monthly Bookkeeper Wages (Jan’24 - July’26)", "Monthly Onboarding Wages (Jan’24 - July’26)", "Monthly Software Expense Excluding Topkey (Jan’24 - July’26)", "Top 10 Software Vendors LTM Spend ($000s)", "Monthly STR Subscription Revenue (Jan’24 - July’26)", "Monthly Recurring Revenue Excluding STR (Jan’24 - July’26)", "Monthly Property Manager, STR Owner & Short-Term Rental (By Churn Type)", "Monthly Property Manager, STR Owner & Short-Term Rental", "Monthly Property Manager Retention", "Monthly STR Owner Retention", "Employee Tenure By Inactive Employee Cohorts", "Employee Tenure By Inactive Employee Cohorts (%)", "Total Monthly Employee Retention", "Monthly Bookkeeper Retention", "Monthly Onboarding Retention".
- Series and legend names: "Indirect Labor", "Bookkeeper Wages", "Onboarding Team Wages", "Software & Apps", "% Recurring Revenue", "LTM Spend", "STR Subscription", "Occupancy Taxes", "SMB Subscription", "Topkey Subscription", "STR Bill Pay", "Onboarding", "Controller Services", "Client Wins", "Client Losses", "Regrettable Losses", "Non-Regrettable Losses", "Unclassified Losses", "Employee Hires", "New Hires", "Employee Losses", "Employee Count", "% Total".
- Chart-data block headers: "Monthly Recurring Revenue" (Revenue Charts B47, B50), "Total Employee Staffing", "Bookkeepers", "Onboarding Team" (Employee Retention Charts B112, B122, B126). Tenure buckets: "First 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "Over 2 Years", "Total Inactive Employees".

**Prototype of the proposed spec** (openpyxl, patched to the 4.4 XML), for whoever builds `charts.ts`: `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/followup3/proto/build3.py`. The build writes `proto.xlsx`, which the `sourceLinked="0"` patch turns into `proto3.xlsx`; the renders are `proto3_p1.png` (MC-E bar + ratio panel, 31 months, quarter labels, aligned panels) and `proto3_p2.png` (MC-C1 diverging with "(4)" loss labels and hidden zeros; MC-C2 stacked by type with axis and gridlines).
