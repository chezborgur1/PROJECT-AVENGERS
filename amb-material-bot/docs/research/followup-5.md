# Follow-up 5: sensitivity-grid anatomy (closes the gap in HOUSE_STYLE §5.5)

Sources (read-only, paths relative to `/home/user/project-avengers/references/`):

| Key | File | Used for |
|---|---|---|
| ASD | `03) AMB Dataroom/03) Target Materials/asd.pdf` pp. 10–14 (Distiller print of V51 "Partnership Sensitivity Tables") | The printed grid look: fills, fonts, grids per page |
| V46PDF | `03) AMB Dataroom/03) Target Materials/AMB + Topkey - Diligence Workbook v46.pdf` (1 page) | Earlier print of the same tab, to see what AMB changed between v46 and v51 |
| V51 | `03) AMB Dataroom/01) Diligence Workbook/AMB + Topkey - Diligence Workbook v51.xlsx`, tabs `Partnership Sensitivity Tables` and `Earnings Sensitivity Table` | Cell-level anatomy: widths, heights, fills, borders, formats, CF, print setup |
| SUNPDF | `02 Monica Kennedy - Investor Dataroom/02 Diligence Reports/CRE Valuation Constraints.pdf` (2 pages, "Microsoft: Print To PDF") | Sunshine grids: frontier box, threshold fills, rotated axis label |
| SUN | `02 Monica Kennedy - Investor Dataroom/01 Diligence Workbook/AMB + Sunshine Commercial - Diligence Workbook v7.xlsx`, tab `Sensitivity Analysis` | The workbook behind SUNPDF (read to get exact fills and borders; the PDF embeds CID fonts and draws borders as fills) |

Method: PDFs rendered to PNG at 80 dpi and inspected; vector fills and font spans extracted with pymupdf; xlsx inspected with openpyxl (formulas, fonts, fills, borders, merges, column widths, row heights, conditional formats, print setup); the two V51 tabs re-rendered through LibreOffice to confirm layout. Scratch renders are in `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/followup-5/`.

---

## 1. What AMB does: the V51 "Partnership Sensitivity Tables" grid (the model to copy)

This is AMB's most developed grid: 30 two-way grids on one tab, printed as 5 portrait pages (ASD pp. 10–14), 6 grids per page in two groups of 3.

### 1.1 Page anatomy (one print range = one page)

Row structure of the first page, rows 2–83 (heights in points; "default" = the sheet default 15.0):

| Row | Height | Content | Style |
|---|---|---|---|
| 2 | 16.5 | `=Cover!$B$24` ("Keystone Bookkeepers") | Arial 13 Bold (`AMB Title`) |
| 3 | default | "Partnership Sensitivity Tables ($000s)" | Arial 9 Italic, thin bottom border B3:L3 (`AMB Subtitle`); "Print" in N3, boxed blue `1` in O3 |
| 4 | default | blank | |
| 5 | default | **Section bar 1** "Ben's Return Profile Based on Partnering" | Arial 9 Bold white on navy, B5:L5 |
| 6 | default | **Grid title** "Ben's Net Returns Based on Topkey Growth & Rollover %" | Arial 9 **Bold, single underline**, black, no fill, left in B |
| 7 | **2.1** | spacer | |
| 8 | **12.75** | **Axis-title band** "Topkey ex-Keystone Value Growth (%)" | Arial 9 Bold white on `7B0000`, `centerContinuous` across D:L; B8:C8 also filled `7B0000` (so the band runs the full width B:L) |
| 9 | **12.75** | **Column-axis values** `=E9-$G$441` … `=$G$440` (centre) … `=K9+$G$441` | Arial 9 Bold white on `7B0000`, centred, format `#,##0%;\(#,##0%\);"–";@`; B9:C9 filled `7B0000` |
| 10–16 | default (7 rows) | Body: B10:B16 **merged vertical-axis label** "Ben's Rollover %"; C10:C16 **row-axis values** `=C11-$G$439` … `=$G$438` (row 13, centre) … `=C15+$G$439`; D10:L16 the 9 × 7 result cells | Label: Arial 9 Bold white on `7B0000`, horizontal centre, vertical centre, wrap, rotation 0. Row-axis cells: Arial 9 Bold white on `7B0000`, centred, `#,##0%` format. Body: Arial 9 regular black, no fill (heat map by CF), right-aligned by number |
| 16 | | Thin black bottom border across B16:L16 closes the grid | |
| 17 | default | **Note** under the grid: "Ben's Year 5 value (cash at close + earnout + retained Keystone stake + Topkey equity), less Keystone value today (G430)" | Arial 9 Italic, left in B |
| 18 | **3.95** | spacer | |
| 19 | 15.0 | Grid title 2 "Ben's % Return on Keystone Value Based on Topkey Growth & Rollover %" | as row 6 |
| 20–31 | | grid 2 (same 13-row block) | |
| 32–44 | | grid 3 "Ben's IRR Based on Topkey Growth & Rollover %" | |
| 44 | 3.95 | spacer | |
| 45 | default | **Section bar 2** "Ben's Return Profile Based on Partnering — Less Standalone" | Arial 9 Bold black on light blue, B45:L45 |
| 46–83 | | grids 4–6 (Net Returns vs. Standalone; % Return vs. Standalone; IRR Premium vs. Standalone) | |

So one grid = 13 rows: title (1) + spacer 2.1 (1) + axis-title band 12.75 (1) + column-axis values 12.75 (1) + body (7) + note (1) + spacer 3.95 (1). One group = section bar + 3 grids = 40 rows. One page = 2 groups = ~81 rows (B2:L82). Print ranges: `B2:L82, B85:L162, B165:L242, B245:L322, B325:L402`.

### 1.2 Columns

| Column | Width | Role |
|---|---|---|
| A | 1.71 | gutter |
| B | 9.0 | vertical-axis label (merged down the body) |
| C | 8.71 | row-axis values |
| D:L | 8.71 each (9 columns) | result cells; column H is the centre |
| M | 3.14 | spacer |
| N | 16.86 | "Print" label |
| O | 18.14 | Print toggle (blue `1`, thin box) |
| Z:AH | 8.71 | grey helper block (unrounded values) |
| AT:BB | | grey helper block (gradient band index) |

The tab is 9 columns wide (odd, so the base case sits in the middle column) by 7 rows (odd, base case in the middle row). Every grid on the tab is 9 × 7.

### 1.3 Colours (exact)

| Element | Cell value in V51 | Rendered in ASD |
|---|---|---|
| Axis-title band, axis values, vertical label | `FF7B0000` (explicit RGB) | `7A0000` (Distiller rounding) |
| Section bar, primary ("Based on Partnering", "— Net Client Wins", "— Keystone Multiple × …") | theme 8 (accent5 `4472C4`) tint −0.50, font white | `203764` (Office "Blue, Accent 5, Darker 50%") |
| Section bar, secondary ("— Less Standalone") | theme 8 tint +0.60, font black | `B4C6E7` ("Blue, Accent 5, Lighter 60%") |
| Heat map, 10 bands (CF fills, band 1 → 10) | `E6F4EA`, `D7EEDE`, `C9E8D1`, `BAE2C5`, `ACDCB9`, `9DD6AC`, `8FD0A0`, `80CA94`, `72C487`, `63BE7B` | same (±1) |
| Below hurdle | no fill (white) | |
| Grid closing rule | thin black bottom border on the last body row, B:L | |
| Print toggle | font `0000FF`, thin black box | |

The navy section bars are the only place on the tab that uses theme colours; everything else is explicit RGB. The house style retires every navy (§1.2), so this is the one element the guide has to re-colour (see §5).

### 1.4 Number formats: one per grid

Each of the three grids in a group carries one format throughout its body, and the grid title names the measure:

| Grid | Title pattern | Body format | Axis formats |
|---|---|---|---|
| 1 | "… Net Returns Based on X & Y" | First row `[$$]#,##0;\([$$]#,##0\);"–";@`, rows 2–7 `#,##0;\(#,##0\);"–";@` (the `$` only on the first row, as in every AMB table). Body is `=ROUND(Z10,$G$452)` with `G452 = −2` ("$ tables shown to nearest $100K") | column axis `#,##0%` |
| 2 | "… % Return Based on X & Y" | `#,##0%;\(#,##0%\);"–";@` (whole percent) | |
| 3 | "… IRR Based on X & Y" | `#,##0.0%;\(#,##0.0%\);"–";@` (one decimal) | |

Axis formats follow the axis variable: rollover and growth `#,##0%`, client wins `#,##0;\(#,##0\);"–";@`, revenue multiple `0.00"x"` on the settings block and `#,##0%`-style on the axis row (rendered "1.00x … 3.00x").

### 1.5 Axis mechanics (already partly in §5.5; here is the exact form)

- Column axis: `D9 = E9 − step`, … `H9 = midpoint`, … `L9 = K9 + step` (each cell steps from its neighbour; only the centre links to the settings block). Row axis identical down column C, centre at row 13.
- Settings block at the foot of the tab (rows 429–467), headed "Sensitivity Assumptions | Value | Rationale" on `FFE1E1`, with (verbatim labels): "Rollover % — Midpoint" (purple `=$G$436`), "Rollover % — Step" (blue 0.05, rationale "Per AMB; 15%–45% range"), "Topkey Growth — Midpoint", "Topkey Growth — Step" (0.25, "Per AMB; 100%–300% range"), "Net Client Wins — Midpoint", "Net Client Wins — Step" (4, "Per AMB; 32–64 range"), "Keystone Yr 5 Revenue Multiple — Midpoint", "… — Step" (0.25, "Per AMB; 1.00x–3.00x range"), "Rounding — $ Tables (Digits)" (−2), "Gradient Bands (#)" (10), "Required Premium vs. Standalone ($000s)" (1000, "green shading in every table starts where partnering beats standalone by $1M"), "Highlight Threshold — Net Return ($000s)", "Highlight Threshold — % Return", "Gradient Band Width — Topkey Growth ($000s)" `=(MAX($Z$50:$AH$56)-$G$449)/$G$446`.
- Body cells never compute in place: `D10 = ROUND(Z10, $G$452)` where `Z10` (grey helper, Arial 9 `808080`) holds the full formula `=$O10+$G$435+$N10*$G$431+$R10*($Q10*(1+D$9)+$G$431*(1-$N10))-$G$430`. IRR grids read `=IFERROR(IRR(BD36:BI36),0)` from a helper cash-flow strip.
- Heat map is not an Excel colour scale. It is 10 expression rules `AT10=1` … `AT10=10`, each with one fill, where `AT10 = IF(Z50<$G$449, 0, MIN($G$446, 1+INT((Z50−$G$449)/$G$451)))`. All three grids in a group are shaded by the same band index (the $-grid's distance above the hurdle), so the $, % and IRR grids show identical patterns.
- Tie-outs above the settings block: "Tie Out — Growth × Client Wins" `=ROUND(G418-G419,6)` with rationale "Must equal zero"; the centre cell of each block is checked against the model's base case.
- Print toggle CF `$O$3=1` sets font to black over the body ranges and the note rows.

### 1.6 Print setup (as found)

Portrait, fit to page (scale stored 69), multi-range print area (5 ranges), print titles rows 2:4, margins 0.7 / 0.7 / 0.75 / 0.75, header/footer 0.3, no header or footer text, not centred. The rendered text is 6.2 pt (9 pt × 0.69).

### 1.7 v46 → v51: what AMB itself changed (V46PDF vs ASD p. 10)

| v46 (one page) | v51 |
|---|---|
| Section bar "Ben's Return Profile Based on Partnerning" (typo) | "… Partnering" |
| Column axis 100%, 125% … 300% (round numbers; base case not on the grid) | 102%, 127% … 302% (axis centred on the model's growth `G440`, so the centre column equals the base case exactly; rationale text: "center column equals the base case exactly") |
| Second bar "… Partnering - Less Standalone" (hyphen) | "… Partnering — Less Standalone" (em dash) |
| 16-shade green ramp incl. white | 10 bands, count is an input |
| No note under each grid | One italic note per grid defining the measure |

Direction of travel: AMB is moving toward centred axes, defined measures, and fewer bands. The guide should adopt v51, not v46.

## 2. What AMB does: V51 "Earnings Sensitivity Table" (the lighter, older pattern)

Tab: B2 title, B3 "Earnings & Valuation Sensitivity ($000s)", thin **top** border on row 4 (the other tabs put it under row 3). Column B width 40.0, C:I 9.71 (7 result columns), zoom 115, no print area, no fit-to-page, no gridlines.

- Row 5: `AMB Header` bar "Base Case Inputs" (`7B0000`, white bold) over a 6-line inputs list (C6:C11; the multiple is blue 7 with `0.0\x`).
- Row 13: `AMB Header` bar as the grid title: "Implied Valuation — Steady-State Adj. EBITDA × Multiple".
- Row 14: axis title "Steady-State Bookkeeper Load (Clients per Bookkeeper)", merged C14:I14, Arial 9 Bold black on `FFE1E1`, centred; B14 also `FFE1E1`.
- Row 15: B15 row-axis title "EV / EBITDA Multiple" (bold, `FFE1E1`, left) and column-axis values `=$C$9-3 … +3` (bold black on `FFE1E1`, centred, `#,##0.0`), thin top border.
- Rows 16–20: B = row-axis values `=$C$11-2 … +2` (regular black, `0.0\x`), body `=($C$6+$C$7-($C$8/C$15)*$C$10)*$B16`, first row `[$$]#,##0`, others `#,##0`.
- Thin black box around the whole grid (left on B, right on I, bottom on row 20, top on row 15).
- **Base cell F18** (centre): Arial 9 **Bold**, fill **`FFFF00`** (pure yellow), thin box on all four sides.
- Second grid (rows 22–29) "Estimated Steady-State Adj. EBITDA": same anatomy with "Avg. Bookkeeper Compensation" on the rows (`[$$]#,##0.0`).
- Reference strip below (rows 31–36, italic): "Reference — Observed Bookkeeper Load (Steady-State Staffing tab)" with FY2025 / YTD2026 / LTM Sep'26 / peak / latest values, then a "Note: load axis is the P&L Forecast target load (row 182) ±3 clients, bracketing…".

This grid computes in place (no helper block), so it is the simpler engine; but it has no print area and, in the LibreOffice render, is cut at the right margin (the guide already flags this in §5.11).

## 3. What AMB does: Sunshine "Sensitivity Analysis" (SUN / SUNPDF)

Tab `Sensitivity Analysis`, print area B2:J107, portrait, 7 grids on 2 pages (3 + 4), gridlines off. Columns A 1.0, B 6.71, C 5.14, D:J 8.0 (7 result columns). Body rows 12.0 on the header rows, default elsewhere; 3.95 spacers.

- Section bar per grid (B5, B19, B34, B51, B67, B81, B95): Arial 9 Bold black on theme 0 tint −0.15 = **`D9D9D9`** grey, B:J. Text verbatim: "Valuation Sensitivity Table", "8% Cap Rate - Clearance NOI Based on Extimated Expenses" (sic), "Post-Debt Service Cash Flow ($350K - $650K Valuation)", "Cash-On-Cash Return ($700K - $1M Valuation)".
- Axis-title band D7:J7 "Valuation Cap Rate Range" `centerContinuous`, Arial 9 Bold black on theme 4 tint +0.80 = **`DDEBF7`** (accent1 `5B9BD5` lighter 80%), thin black top/left/right.
- Column-axis values D8:J8: first value blue input `0.07`, then `=D8+0.5%` (bold black), `#,##0.0%`, centred, same `DDEBF7` fill, thin bottom border. In the rent grids there is a two-line axis: an italic "% Inc." row (`17%`, `33%` …) over a `$7.25` `[$$]#,##0.00` row.
- Vertical-axis label B9 merged B9:B17: "Net Operating Income Range ($000s)", Arial 9 Bold, **rotation 90**, centre/centre, wrap, `DDEBF7`, thin left/top/bottom.
- Row-axis values C9:C17: first `20` (bold, `[$$]#,##0`), then `=C9+10` (bold `#,##0`), `DDEBF7`, thin right border.
- Body D9:J17 `=$C9/D$8`, Arial 9 regular, **centred**, first row `[$$]#,##0`, rest `#,##0`; no fill, no heat map.
- **Frontier box**: thin borders coloured **`FF0000`** drawn cell by cell along the boundary of the region that clears the $1M threshold (F9 left, J9 right, F11 left+bottom, G11:I11 bottom, J11 right+bottom, then a stepped staircase F15, H16, J17 each boxed on all four sides). It is a hand-drawn outline, not a CF rule; it does not update when inputs change.
- **Threshold fill**: theme 9 tint +0.80 = **`E2EFDA`** (accent6 `70AD47` lighter 80%) on the cells clearing the hurdle in the 8% grid (H24:J24, I25:J25, J26, J27), hand-applied; legend line at row 33 in italic on `E2EFDA`: "Note: Cells highlighted in green clear the $1M CRE valuation threshhold" (sic).
- Assumption note under a grid, italic: "Assumes a 20-year amortization schedule with 6.50% interest rate".
- Key total fill `FFFFCC` used inside one grid (F12:H15, the "CRE Valuation Sensitivity Table" on the CRE Valuation tab) to mark the plausible range.

## 4. Weak points to elevate (kept separate from the house pattern)

1. **Navy section bars** (`203764` / `B4C6E7`) are theme colours from the Office default palette and sit outside AMB's palette; §1.2 retires every navy. The Sunshine `D9D9D9` grey bar is the alternative AMB precedent, and `FFE1E1` is what every other V51 tab uses for section rows.
2. **Sunshine's blue axis cells** (`DDEBF7`) and Office green `E2EFDA` are Excel defaults, retired in §1.2 (`DAE9F8`/`CAEDFB` family). The V51 maroon axis is the house pattern.
3. **No base-case marker in the V51 partnership grids.** The base case is the centre cell by construction, but nothing marks it; the reader has to count. The Earnings tab marks it with pure yellow `FFFF00` and bold, which is the current bot's "yellow input" look the guide has already banned.
4. **Hand-drawn frontier and hand-applied green** in Sunshine do not move when inputs change. The V51 band-index CF is the right mechanism; the frontier can be a CF border rule on the same index.
5. **Heat map on every grid** in V51 (36 green cells per grid, 30 grids) is more colour than the information needs; the three grids in a group show the same pattern three times.
6. **Print**: margins 0.7/0.75 and no header/footer differ from §5.11; the "Earnings Sensitivity Table" has no print area and prints cut off.
7. **Typos survive to print**: "Partnerning" (v46), "Extimated", "threshhold" (Sunshine). The bot's titles are generated, so this is a QA rule, not a design one.
8. **Rendered text at 6.2 pt** (fit-to-page at 69%) is below what a printed page should carry. Six 9 × 7 grids per portrait page is the cause.

## 5. Recommended spec for HOUSE_STYLE §5.5 ("Sensitivity grid anatomy")

Keep the V51 layout and mechanics; change the colours that the palette retires; add the base-cell and frontier rules as CF so they follow the inputs.

**Grid block (13 rows, 11 columns B:L; every grid 9 × 7 with the base case in H, row 4 of 7):**

| Row | Height | Element | Style |
|---|---|---|---|
| t | 15 | Grid title, verbatim pattern "<Measure> Based on <Column axis> & <Row axis>" | Arial 9 Bold, single underline, black, left in B |
| t+1 | 2.1 | spacer | |
| t+2 | 12.75 | Axis-title band: column-axis name with units in parentheses, e.g. "EV / Adj. EBITDA Multiple (x)" | `AMB Header`: Arial 9 Bold white on `7B0000`, `centerContinuous` D:L; B:C filled `7B0000` |
| t+3 | 12.75 | Column-axis values, centre = midpoint, neighbours ± step | Arial 9 Bold white on `7B0000`, centred; format of the axis variable |
| t+4 … t+10 | 15 | B merged vertically: row-axis name (wrap, centre/centre, rotation 0, `7B0000`, white bold); C: row-axis values (white bold on `7B0000`, centred); D:L results | Body Arial 9 black, no fill; thin black bottom border B:L on t+10 |
| t+11 | 15 | Note: one italic sentence defining the measure and naming the settings cell | `AMB Note` |
| t+12 | 3.95 | spacer | |

**Section bar** above each group of grids (one bar per measure family): `AMB Section` on `FFE1E1`, Arial 9 Bold black, B:L (replaces V51's navy `203764` and light-blue `B4C6E7`; the "— Less Standalone" second-tier bar becomes the same `FFE1E1` bar with the suffix in the text). If a darker bar is wanted for the first tier, use `7B0000` white bold (`AMB Header Group`), never navy or `D9D9D9`.

**Widths**: A 1.71, B 9.0, C 8.71, D:L 8.71, M 3.14 spacer, N 16.86 "Print", O 18.14 toggle. Landscape grids (13 columns) are not used; if an axis needs more than 9 values, split into two grids.

**Formats**: one per grid, declared in the title. `$` grids: first row `[$$]#,##0;\([$$]#,##0\);"–";@`, rest `#,##0;\(#,##0\);"–";@`, values `ROUND(helper, RoundingDigits)` with RoundingDigits an input (−2 at $000s). `%` grids `#,##0%;\(#,##0%\);"–";@`. IRR and margin grids `#,##0.0%;\(#,##0.0%\);"–";@`. Multiples `0.0\x` on axes, `0.00\x` for MOIC bodies. Axis cells take the axis variable's format.

**Base cell** (new, replaces V51's unmarked centre and the Earnings tab's `FFFF00`): bold figure, 1 pt `7B0000` box, applied by CF `=AND(COLUMN()=COLUMN($H$1),ROW()=<centre row>)` or by static formatting on the centre cell only; no fill.

**Heat map / threshold** (elevate V51): keep the band-index helper (`Gradient Bands (#)` input, `Hurdle` input, `Band Width = (MAX(block) − Hurdle) / Bands`) and the expression rules `idx=1…n`, but shade only the `$` grid of a group; the `%` and IRR grids stay unshaded. Fills use the ordinal ramp of §2.6, not the Excel green `63BE7B`–`E6F4EA` ramp. Cells below the hurdle stay white.

**Frontier** (elevate Sunshine): where a threshold is meaningful (DSCR ≥ 1.25x, proceeds ≥ asking, value ≥ $1M), one CF rule `idx>=1` applies a 1 pt `7B0000` border on the hurdle-clearing cells so the outline moves with the inputs; no hand-drawn `FF0000` boxes and no hand-applied `E2EFDA`. A legend line under the grid in italic: "Note: cells inside the box clear the <threshold> hurdle."

**Settings block**: at the foot of the tab under "Sensitivity Assumptions | Value | Rationale" on `FFE1E1`; rows "<Axis> — Midpoint" (purple link to the model base case), "<Axis> — Step" (blue input, rationale "Per AMB; <low>–<high> range"), "Rounding — $ Tables (Digits)", "Gradient Bands (#)", "Hurdle", "Band Width", plus a "Tie Out — <grid>" row per group (`=ROUND(centre − model, 6)`, "Must equal zero") feeding `MasterCheck`.

**Helpers**: unrounded results in a grey (`808080`) helper block to the right of the print area (Z onward), headed "Helper: Unrounded <measure>"; band index block further right ("Helper: Gradient Band (0 = below hurdle)"). Never inside the print area.

**Print**: portrait; **4 grids per page** (two groups of two, or one group of three plus its note strip) so the fit-to-width scale stays ≥ 80% and body text prints ≥ 7 pt; V51's six per page prints at 6.2 pt. One print range per page, print titles rows 2:4, margins and footer per §5.11, "Print" toggle at O3 with CF `$O$3=1` over body, axis and note ranges. Landscape only when a grid is paired side by side with its chart.

**Standard grid set** (already in §5.5): EV at multiple × Adj. EBITDA; DSCR at price × interest rate; seller proceeds at price × cash-at-close %. Title them in the V51 pattern: "Enterprise Value Based on EV / Adj. EBITDA Multiple & Adj. EBITDA", "DSCR Based on Purchase Price & Interest Rate", "Closing Cash to Seller Based on Purchase Price & Cash at Close %".

**Verbatim titles from V51 to copy the grammar from**: "Ben's Net Returns Based on Topkey Growth & Rollover %"; "Ben's % Return on Keystone Value Based on Net Client Wins & Rollover %"; "Ben's IRR Premium vs. Standalone Based on Keystone Yr 5 Multiple & Topkey Growth"; axis titles "Topkey ex-Keystone Value Growth (%)", "Keystone Total Annual Net Client Wins — Partnership (#)", "Keystone Yr 5 Revenue Multiple (x)"; vertical labels "Ben's Rollover %", "Net Client Wins (#)"; notes "Ben's Year 5 total value ÷ Keystone value today (G430), less 1", "Partnership IRR (table above) less standalone IRR (G448), in percentage points".

## 6. Side observations (outside the grid gap)

- ASD p. 1 (the cover, landscape) renders its band as `9A0033`, i.e. V51's `990033`; the guide's D1 decision to use `9E0A20` stands but the reference print still shows the old maroon.
- ASD pp. 2–9 and 15–19 (Offer Comparison, Partnership Rollover Scenarios, Valuation Growth Scenarios) use the same tab grammar as the grids: `7B0000` header bars, `FFE1E1` column-header rows, `FFFFCC` key totals with thin box, italic "Tie Out" rows, and section bars with em-dash suffixes ("Scenario 1 — Ben Retains 100% of Keystone", "Internal - Implied Keystone Standalone Multiple" uses a hyphen: inconsistent).
