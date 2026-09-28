# Follow-up 6: The Main Street annual-only model page (tax-return source, Low / Mid / High pro forma, Capital Reserve, DSCR) and the Schedule C line map

**Scope.** `HOUSE_STYLE.md` neither adopts nor rejects AMB's Main Street page. Section 5.2 lays out a monthly-grid period layout (FY / YTD / LTM / PF) and says only that without 12 months of data "the YTD and LTM blocks are left out and the Summary states 'Full fiscal years only'"; 5.4's ladder has no Capital Reserve rung; 5.5 has no Low / Mid / High pro forma columns; 5.10 lists `0.00\x` for MOIC but not for DSCR; and nothing maps a tax return's lines to model rows. R-MOD §4 and §9 describe SUN's `Laundromat Valuation` tab in one paragraph each and the guide drops it. This report documents that page cell by cell, the two printed exhibits built from it, and the three Schedule C returns it was built from, then gives a drop-in spec.

**Method.** I read SUN's eight tabs with openpyxl twice (formulas, then cached values), recording font, fill, borders, number format, alignment, indent, column widths, row heights, print area, page setup, conditional formats and defined names. I rendered the workbook through LibreOffice to PDF and the pages to PNG, and rendered the two diligence-report PDFs and the 2022, 2023 and 2024 returns (scanned images: `pymupdf` returns zero text on every page, so the bot's vision extraction path is the only way in). I then rebuilt every model figure from the return lines to find which cells tie and which do not. Scratch renders are in `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/followup-6/`.

---

## 0. Corrections (read first)

| Where | What it says | What is true | Evidence |
|---|---|---|---|
| Task brief; R-MOD §4.1 | The valuation block ends at "Implied SDE Multiple" | v7 runs `SDE → (x) Valuation Multiple → Laundromat Valuation → (+) Rennovation Cost → Laundromat Cost → Implied SDE Multiple → Implied Adj. EBITDA Multiple → Randy's Valuation`. The two printed exhibits (SUNPDF) are an **earlier** version: one `Pro Forma` column, `(+) Interest` instead of `(+) Debt Servicing`, one `Debt Servicing` expense line, and `(–) Rennovation Cost` deducted to a second boxed `Laundromat Valuation` ($224 / $168 / $304 / $151; "Revised Asking Price" shows $150). No DSCR, no implied multiples. | `Laundromat Valuation` rows 55–62; `Estimated Laundromat Valuation.pdf` p1; `Revised Asking Price.pdf` p1 |
| R-MOD §9 item 12 | SUN's section bar is "gray #D9D9D9" | It is a **theme tint**, not an RGB: `theme 0 (lt1 FFFFFF), tint −0.15` (renders D9D9D9). Expense rows are `theme 0, tint −0.05` (renders F2F2F2). Rebuilding with literal RGB is fine, but the source is theme-dependent. | B5:H5, B14:H14 fills |
| HOUSE_STYLE 5.5 | "Main Street DSCR on SDE less the replacement salary (Keep: SUN financing and DSCR)" | SUN's DSCR is `SDE ÷ Debt Servicing` with **no** salary deducted (`=F$50/F41`), and its "Debt Servicing" is full P&I (`principal × −PMT annual constant`), not interest. The guide's formula is the elevated one; it is not what SUN does. | F52:H52, F24 `=C85*C88`, C88 `=-PMT(C$87/12,C$86*12,1)*12` |
| HOUSE_STYLE 5.10 | DSCR format "not in 5.10" | The string `0.00\x;\(0.00\x\);"–"` is in 5.10 under "Multiple, 2 dp (MOIC)". Only the *use* is missing. | F52 number format |

---

## 1. Summary: what the guide should add or change

1. **Add 5.2A "Annual-only layout (Main Street mode)".** When the only source is annual (tax returns, annual statements), the period layout is `FY-2 | FY-1 | FY ‖ Pro Forma: Low | Mid | High`, six value columns, portrait, on the standard two-tier header. `MainStreetMode` (already a named output in 5.13) selects it. Keep the guide's maroon header band (D4) and pink section bar; do not import SUN's fill-less header or gray bar (both are drift, R-MOD §9 item 12).
2. **Adopt the paired "% Sales" row under every expense line** (italic, indent 1, `#,##0%`), with the line row banded `F2F2F2` and the % row white, as a named style `AMB Line Banded` + `AMB Ratio`. Adopt SUN's underlined sub-section label (`Expenses`, `EBITDA Bridge`, `Business Valuation`: Arial 9 underlined, no fill) as `AMB Subsection`.
3. **Add a Capital Reserve rung to 5.4** in Main Street mode: `(–) Capital Reserve (Maintenance Capex) [S3]`, placed **below SDE** (SDE stays pre-capex, the IBBA definition and what SBA lenders expect) and above Adj. EBITDA. Default basis: three-year average of equipment cost placed in service per Form 4562 (Part I line 2 plus Part III Section B basis), not FY22 depreciation as SUN links. Record SUN's placement (above SDE) as Q23 for Frank.
4. **Add Low / Mid / High pro forma to 5.5** as three scenario columns driven by a three-column block on `Assumptions` (`Driver | Low | Mid | High | Basis`), each expense line carrying its PF method in words ("3-year average", "Latest year", "% of sales at 3-year blended margin", "Contracted", "Market rent per lease comps"). Scenarios must differ on revenue and at least one operating driver; SUN's three columns differ only by renovation cost (a bug, 4.2).
5. **Add a Main Street financing block** under the valuation: `Purchase Price | (–) Equity Injection | Loan Principal | Term (Years) | Rate | Annual Debt Service | Cash Flow Available for Debt Service | DSCR`, with CFADS = SDE − Market Replacement Compensation − Capital Reserve, DSCR in `0.00\x`, flagged below 1.25x.
6. **Add the valuation rows verbatim** for Main Street: `SDE | (x) Valuation Multiple | Business Valuation | (+) Deferred Capex / Renovation | Total Investment | Implied SDE Multiple | Implied Adj. EBITDA Multiple`. Keep the "Implied … Multiple" idea (good), drop the person-named rows ("Randy's Valuation", "Monica's Compensation").
7. **5.10:** add "DSCR" to the `0.00\x` use; add `0.00%` for interest rates (SUN C87 `6.50%`) and `0` for loan terms in years (SUN leaves them `General`).
8. **Add 5.2B "Tax-return line map"** (section 3.6 below): Schedule C line → AMB category → model row, with the tie-outs (line 28 = Total Expenses, line 31 = Net Income) as red check rows, and a rule that `Other Expenses` is the **sum of the unmapped lines, never a plug** (SUN's plug omits the interest line and overstates Other by $12.6K and $14.7K: 4.1).
9. **4.6 source strings:** add `Source: Proprietor's federal tax returns (Schedule C, Form 1040), FY2022–FY2024; AMB Advisory analysis.` The existing string covers only Form 1120-S.
10. **5.7 checks:** add `Check: Total Expenses less sum of expense lines` and `Check: Net Income less return line 31` per year; both are typed hard-codes on SUN with no tie.

---

## 2. Sources (add to section 0.1)

| Key | File | Used for |
|---|---|---|
| **SUN** | `02 Monica Kennedy - Investor Dataroom/01 Diligence Workbook/AMB + Sunshine Commercial - Diligence Workbook v7.xlsx` (8 tabs: Cover, Laundromat Valuation, Sensitivity Analysis, CRE P&L, CRE Valuation, Market Rent Analysis, Tennant View, Valuation Overview) | The Main Street annual page (already keyed; this report is its anatomy) |
| **SUNPDF-ELV** | `02 Monica Kennedy - Investor Dataroom/02 Diligence Reports/Estimated Laundromat Valuation.pdf` (1 p.) | The printed exhibit, earlier version with one `Pro Forma` column |
| **SUNPDF-RAP** | `.../02 Diligence Reports/Revised Asking Price.pdf` (2 pp.) | Same exhibit at $150 PF valuation; p2 "CRE Valuation Overview" with the "Consolidated Valuation" stack |
| **TR22 / TR23 / TR24** | `.../00 Target Company Documents/Laundromat Tax Returns/2022 (7 pp.), 2023 (7 pp.), 2024 (4 pp.) LAUNDRY MAT - RANDY JAMES.pdf` | Schedule C (Form 1040), Form 4562, interest-expense statement. Scanned images, no text layer. Sole proprietor, cash basis, NAICS 812310, business name "QUIK WASH CL, LLC", Milton FL |

---

## 3. What AMB does

### 3.1 Page setup and furniture (`Laundromat Valuation`)

| Element | SUN value |
|---|---|
| Print area | `B2:H62` (the P&L, bridge and valuation; the assumptions block rows 65–95 is off the print) |
| Orientation | Portrait, fit to page (`fitToPage = True`), one page |
| Margins | 0.7 / 0.7 / 0.75 / 0.75 in; no header, no footer, no page number, no source line |
| Gridlines | Off. Zoom **175%**. No freeze panes. Tab colour theme 9 (accent6 green) on an output tab |
| Column A | 1.71 gutter |
| Column B | **24.43** (labels; guide standard is 34) |
| C | 9.14; **D:H default 8.43** (only C is set) |
| I | 3.71 (post-print spacer), J 9.14 (`Print` label), K3 toggle |
| Row 2 | `=+Cover!B24` "Sunshine Commercial Investments", Arial **12** bold, height 15.75 |
| Row 3 | "Laundromat P&L Summary & Valuation ($000s)", Arial 9 italic, thin bottom border across B:H; J3 "Print", K3 `1` blue `0000FF`, thin box, centred |
| Print CF | `$K$3=1` → font colour automatic, over 15 patchwork ranges (`B1:F7 B10:F23 B24:I61 …`) |
| Spacer rows | Height **3.95** at rows 6, 12, 36, 38, 47, 49, 53, 66; height 2.1 at row 9 |
| Font | Arial 9 everywhere except the row-2 title; theme is Office default (dk2 `44546A`, accent1 `5B9BD5`), nothing AMB-specific in the theme |

### 3.2 Header and column grid (rows 5–9)

- **Row 5 section bar:** "Laundromat P&L Summary", Arial 9 bold, fill `theme 0 tint −0.15` (D9D9D9) across **B5:H5** (stops at the print width, not the spacer).
- **Row 7 group header:** F7 "Pro Forma", Arial 9 bold, `centerContinuous` across F7:H7 (centre across selection, not merged), no border, no fill. Nothing over C:E (no "Actual" or "Full Year" group).
- **Row 8 period header:** `FY22 | FY23 | FY24 | Low | Middle | High`, Arial 9 bold, centred, **thin top and bottom borders, no fill**. B8 is empty (no table name).
- **Actual / pro forma divider:** a **thin right border on column E from row 7 to row 62**, so a vertical rule separates FY24 from Low on every row of the page, including the yellow boxes (E37, E45, E50 carry `right: thin`).
- Period labels are typed text ("FY22"), not formulas.

### 3.3 The P&L block (rows 10–37), verbatim

```
Revenue                        bold; FY blue inputs; PF =E10*(1+C67), =F10*(1+D67), =F10*(1+D67)
  % Growth                     italic, indent 1; PF growth is vs FY24: =F10/$E$10-1
Expenses                       Arial 9 UNDERLINED, not bold, no fill (sub-section label)
Utilities                      row banded F2F2F2 across B:H; currency format on the first expense line
  % Sales                      italic, indent 1, white row, =C14/C$10
Labor                          banded; body format
  % Sales
Repairs & Maintenance
  % Sales
Lease
  % Sales
Insurance
  % Sales
Acquistion Financing           [sic]
  % Sales
Rennovation Financing          [sic]
  % Sales
Depreciation
  % Sales
Taxes
  % Sales
Other Expenses                 FY = plug: =+C34-C28-C26-C22-C20-C18-C16-C14-C30 (see 4.1)
  % Sales
Total Expenses                 bold, thin top border, currency; FY values TYPED blue (147.277 / 216.761 / 247.729)
  % Sales
Reported Net Income            bold, FFFFCC, thin box (left on B, top+bottom B:H, right on E and H); =+C10-C34
```

- Expense labels have **no indent** (B14 indent 0); only the `% Sales`, `% Growth` and signed bridge rows indent 1.
- Number formats: first row and totals `[$$]#,##0;\([$$]#,##0\);"–";@`; body `#,##0;\(#,##0\);"–";@`; ratios `#,##0%;\(#,##0%\);"–";@` (four cells drift to `#,##0.0%`: C23, C25, C27, C31).
- Colour code on the page: blue `0000FF` typed FY figures and assumptions; purple `800080` in-sheet links (bridge rows, PF lines pulling `$C$71` etc.); green `008000` cross-sheet (`='Tennant View'!G29/1000`); black calculations. Red is not used on this tab.
- PF expense methods, as built: Utilities `=F10*$C$68` (3-year blended % of sales); Labor `=+$C$70` ("Monica's Compensation", 0); R&M `=+$C$71` (3-year average); Lease `=+$C$79` (`=E20*2`, i.e. FY24 rent doubled); Insurance `=+$C$74` (latest year); Acquisition Financing `=C85*C88` (loan principal × annual P&I constant); Renovation Financing `=C92*C95`; Depreciation `=+$C$73` (`=+C28`, FY22); Taxes `=+F10*$C$76` (% of sales, 0); Other `=+$C$77` (3-year average).

### 3.4 The EBITDA bridge, SDE and DSCR (rows 39–52), verbatim

```
EBITDA Bridge                  underlined sub-section label
Net Income                     indent 0, currency, purple =+C37
  (+) Debt Servicing           indent 1, body, =+C26+C24   (historical: Sch C 16a interest; PF: full P&I)
  (+) Depreciation             =+C28
  (-) Capital Reserve          =-$C$73  (FY22 depreciation, 8.661, in all six columns)
  (+) Taxes                    =+C30
Adj. EBITDA                    bold, FFFFCC box begins (left B, top B:H, right E and H); =SUM(C40:C44)
  % Margin                     bold italic, FFFFCC, box closes (bottom); =C45/C$10, 0 dp
  (+) Owner Compensation       indent 1, =+C16  (the Labor line: contract labor 55,000 in FY24 = the owner's draw)
SDE                            bold, FFFFCC box begins; =+C45+C48
  % Margin                     bold italic, FFFFCC
DSCR                           bold, FFFFCC, box closes; PF columns only: =F$50/F41, format 0.00\x;\(0.00\x\);"–"  → 1.52x | 1.28x | 1.11x
```

Signs are hyphens `(-)`, matching V51. The three key totals (Reported Net Income, Adj. EBITDA + % Margin, SDE + % Margin + DSCR) are the only fills on the printed page besides the banding. DSCR sits **inside the SDE box** as its third row.

### 3.5 Business valuation and the assumptions list (rows 54–95), verbatim

```
Business Valuation             underlined
SDE                            currency, purple =+C50
  (x) Valuation Multiple       indent 1, 0.0\x; FY columns =+$C$78 (purple), PF columns TYPED 3 (purple font on a constant)
Laundromat Valuation           thin top border; =C55*C56  → $574 | $518 | $654 | $331 | $331 | $331
  (+) Rennovation Cost         PF only: =E58 (empty → –), =+$C$91/2 (175), =+$C$91 (350)
Laundromat Cost                bold, FFFFCC box begins; =ROUND(F57+F58,-1) → $330 | $510 | $680
Implied SDE Multiple           bold, FFFFCC; =F$59/F$55 → 3.0x | 4.6x | 6.2x
Implied Adj. EBITDA Multiple   bold, FFFFCC; =F59/F45
Randy's Valuation              bold, FFFFCC box closes; =F59-$C$91 → ($20) | $160 | $330
```

Assumptions (off-print, rows 65–79, `Label | Value`, gray bar "Laundromat Pro Forma Assumptions"): `18-Month Revenue Growth (27.0%)` blue; `Utilities Margin =SUM(C14:E14)/SUM(C10:E10)` 25.6%; `Go-Forward Labor Cost 0`; `Monica's Compensation 0`; `Go-Forward Repairs =AVERAGE(C18:E18)`; `Normalized Lease ='Tennant View'!G29/1000`; `Go-Forward Depreciation =+C28`; `Go-Forward Insurance =+E22`; `Go-Forward Interest 0` (green font on a constant); `Taxes (% Sales) 0.0%`; `Go-Forward Other Expenses =AVERAGE(C32:E32)`; `Valuation Multiple 3.0x`; `Go-Forward Lease =E20*2` (blue font on a formula). No Source column, no basis text.

Financing (rows 81–95, "Valuation Scenarios" bold; "Acquisition Financing" and "Rennovation Financing" underlined), scenario columns **C:E** (misaligned with the P&L's F:H and unlabelled): `Down Payment (%) 15%` (`0%`), `Down Payment ($) =+F62*C83`, `Principal =+F62*(1-C83)`, `Loan Term (Years) 20` (General), `Interest Rate 6.50%` (`0.00%`), `Debt Cost =-PMT(C$87/12,C$86*12,1)*12` shown as `8.95%` (an annual constant, not dollars); renovation: `Down Payment (%) 15%`, `Rennovation Cost $350`, `Rennovation Principal`, `Loan Term (Years) 5`, `Interest Rate 9.00%`, `Debt Cost 24.9%`.

### 3.6 The tax-return line map (what the FY columns are)

All three returns are **Schedule C (Form 1040)** for proprietor John R James, business "QUIK WASH CL, LLC", code 812310, **cash basis** (line F box 1 ticked), materially participates (G = Yes). No COGS (line 4 blank; Part III all zero), no returns and allowances, no home-office deduction (line 30 blank), so line 1 = line 7 and line 29 = line 31. Each figure below was read from the scan and reconciled to the model cell.

| Sch C line | As printed | FY22 | FY23 | FY24 | SUN row | AMB category (`IS_CATEGORIES`) |
|---|---|---|---|---|---|---|
| 1 / 7 | Gross receipts or sales / Gross income | 338,594 | 357,943 | 376,060 | Revenue | `revenue` |
| 25 | Utilities | 90,936 | 91,989 | 91,269 | Utilities | `other_opex` (sub-line "Utilities") |
| 11 | Contract labor | — | — | 55,000 | Labor → `(+) Owner Compensation` | `owner_comp` **only if evidenced** (see 4.4); else `payroll` |
| 21 | Repairs and maintenance | 22,728 | 46,544 | 30,540 | Repairs & Maintenance | `other_opex` |
| 20b | Rent or lease: other business property | 14,400 | 13,200 | 14,412 | Lease | `rent` |
| 15 | Insurance (other than health) | — | 14,958 | 4,384 | Insurance | `other_opex` |
| 16a | Interest: mortgage (paid to banks, etc.) | — | 12,608 | 14,670 | Acquistion Financing | `interest_expense` (statement "Lines 16a and b (Sch C (1040)) – Interest Expense", Form 1098 received) |
| 16b | Interest: other | — | — | — | — | `interest_expense` |
| 13 | Depreciation and section 179 | 8,661 | 27,542 | 28,555 | Depreciation | `depreciation_amortization` (Form 4562 line 22) |
| 23 | Taxes and licenses | 988 | 3,295 | 361 | left in Other | `other_opex` (licences, not income tax) |
| 8 | Advertising | — | — | — | — | `marketing` |
| 9 | Car and truck expenses | 2,898 | 524 | — | Other | `other_opex`, **add-back candidate** (Form 4562 Part V: FORD RANGER TRUCK, in service 7/14/2009, 33.33% business use) |
| 17 | Legal and professional services | 615 | 775 | 871 | Other | `other_opex` |
| 18 | Office expense | 840 | 413 | 518 | Other | `other_opex` |
| 22 | Supplies | 4,176 | 3,801 | 4,061 | Other | `other_opex` |
| 27a / Part V | Other expenses (itemised) | 1,035 | 1,112 | 3,088 | Other | `other_opex`; 2024 Part V: Alarm Monitoring 323, Postage 148, Telephone 207, **Auto Exp 2,410** (add-back candidate); 2023: Alarm Monitoring 323, FL Pest Control 286, Telephone 330, Miscellaneous 173 |
| 28 | Total expenses | 147,277 | 216,761 | 247,729 | Total Expenses (typed) | tie-out |
| 31 | Net profit or (loss) | 191,317 | 141,182 | 128,331 | Reported Net Income | tie-out |
| — | Income taxes | none on the return | | | Taxes = 0 | `income_tax` = 0 for a sole proprietor; the ladder's `(+) Income Taxes [D2]` shows "–" |

**Sum of the unmapped lines** (9 + 17 + 18 + 22 + 23 + 27a) = **10,552 / 9,920 / 8,899**. SUN's `Other Expenses` shows 10,552 / **22,528 / 23,569** (4.1).

**Form 4562 detail worth carrying** (basis for a capital reserve): 2023 line 22 = 27,542 = §179 15,446 (two "DEXTER 25 LB WASHER" at 7,723 each) + special depreciation 7,566 + MACRS 446 + 15-year property 63 + nonresidential real property 451 and 3,568 (bases 22,175 placed 3/21/2023 and 145,000 placed 1/1/2023). 2024 line 22 = 28,555 = §179 23,436 + MACRS 1,140 + 15-year property 3,979. Equipment cost placed in service (4562 Part I line 2): 169,906 (2023, includes the 145,000 building) and 23,436 (2024). SUN ignores all of this and links Capital Reserve to FY22 depreciation (8,661).

### 3.7 The printed exhibit (SUNPDF-ELV, SUNPDF-RAP p1)

One portrait page, `B2:F…` width: title 13 pt bold, italic subtitle with rule, gray bar, `FY22 | FY23 | FY24 | Pro Forma` bold with top/bottom rules and no fill, banded expense rows, three yellow boxes, then `Business Valuation` with **`(-) Rennovation Cost (350)`** deducted and a second boxed `Laundromat Valuation` ($224 / $168 / $304 / $151). No source line, no footer, no page number, no date. The single PF column reads $338 revenue (−10%), Debt Servicing $49, Other $10, Adj. EBITDA $112 (33%), SDE $167 (49%). Its `Other Expenses` (11 / 10 / 9) is the correct sum; v7's is not.

RAP p2 "CRE Valuation Overview ($000s)": "CRE Valuation Sensitivity Table" NOI $5–40 × cap 8.0%–11.0% (axes `DDEBF7`, rotated "NOI Range"), black box with `FFFFCC` fill around the 20–40 × 9.0–10.0% region; then "Consolidated Valuation": `Commercial Real Estate $450 | (+) Signed Leases 150` with italic side note "33% increase in valuation" | `Estimated CRE Valuation $600` (boxed) | `(+) Laundromat Valuation 150` | `Total Valuation $750` (boxed). This is AMB's Main Street stack: business at SDE × multiple, plus property at NOI ÷ cap, summed.

---

## 4. What is weak and should be elevated

### 4.1 `Other Expenses` is a plug that drops the interest line
`C32 =+C34-C28-C26-C22-C20-C18-C16-C14-C30` subtracts every expense row except **row 24 (Acquistion Financing)**. FY22 has no interest so it ties (10,552); FY23 reads 22,528 against a true 9,920 and FY24 23,569 against 8,899. `Go-Forward Other Expenses =AVERAGE(C32:E32)` inherits it (18.9 vs about 9.8), so every PF column understates Adj. EBITDA and SDE by about **$9K** and the 3.0x valuation by about **$27K**. Net income is unaffected only because `Total Expenses` is typed. Rule: Other is the **sum of unmapped source lines**, Total Expenses is a **sum**, and two red checks tie Total Expenses to line 28 and Net Income to line 31.

### 4.2 The three scenarios are one scenario
`H10 =F10*(1+D67)` and `G10 =F10*(1+D67)` both reference the empty D67, so Low, Middle and High revenue are identical ($275) and every operating line follows. The columns differ only by renovation cost (0 / 175 / 350) and the financing that follows from it. A Low / Mid / High block must vary revenue and at least one operating driver, each with a basis.

### 4.3 The bridge mixes interest with P&I, and DSCR deducts no owner pay
Historical `(+) Debt Servicing` is Schedule C 16a interest; PF `(+) Debt Servicing` is `principal × −PMT` (full P&I, 8.95% and 24.9% annual constants). Adding P&I back gives pre-debt cash flow, not EBITDA, so the PF "Adj. EBITDA" is not comparable to the FY columns. DSCR `=SDE ÷ P&I` with PF owner compensation at 0 deducts no replacement salary and no capital reserve (1.52x / 1.28x / 1.11x). Elevate to: interest add-back in the ladder; a financing block below with `Annual Debt Service (−PMT)`; `CFADS = SDE − Market Replacement Compensation − Capital Reserve`; DSCR = CFADS ÷ debt service.

### 4.4 Owner compensation is an inference from "Contract labor"
`(+) Owner Compensation =+C16` takes Schedule C line 11 (55,000, FY24 only) as the owner's pay. Nothing on the return says so (a sole proprietor's own draw is not a deduction; line 11 is 1099 labour, and 2024 line I "did you make payments requiring Form 1099" is Yes). It may be a manager, or the proprietor's spouse. The Adjustments schedule must carry it as `Owner compensation [S1]`, Evidence = "Management representation", Status = Proposed, until a 1099 or bank record supports it.

### 4.5 Capital Reserve has no basis and sits in the wrong place
`=-$C$73` = FY22 depreciation (8,661) in all six columns, while Form 4562 shows $15.4K of washers bought in 2023 and $23.4K of equipment in 2024. SUN deducts it **above SDE**, so its SDE is post-capex, unlike the IBBA definition buyers, brokers and SBA lenders use. Default: three-year average equipment cost placed in service (4562 Part I line 2 excluding real property), blue input with Source "Form 4562, FY2022–FY2024", placed below SDE as `[S3]` (Q23 for Frank: keep SUN's placement?).

### 4.6 Negative loans, typed multiples, unlabelled scenario columns
`Randy's Valuation` Low = −$20K flows to `Down Payment ($) = −3`, `Principal = −17` and PF `Acquistion Financing = (1.5)`, a negative loan with no floor. PF multiples are typed `3` in purple (F56:H56) while FY columns link to C78. The financing block's scenario columns are C:E under a P&L whose scenarios are F:H, with no Low / Middle / High header. `Go-Forward Interest` is a green constant; `Go-Forward Lease` a blue formula. `Total Expenses` PF `=+F32+F28+…+F24` omits row 30 (taxes).

### 4.7 Furniture and drift
Typos "Acquistion", "Rennovation" (six cells and two PDF exhibits), "Tennant View", "Extimated". Person-named rows ("Monica's Compensation", "Randy's Valuation") on a page that prints. Four `% Sales` cells at 1 dp. Column B at 24.4 with default D:H. Zoom 175%, tab coloured, `TODAY()` on the Cover. No source line, footer, page number or check on the printed exhibit. The gray `D9D9D9` bar and fill-less header are SUN-only and differ from V51's maroon band, which the guide already chose (D4).

### 4.8 What to keep from SUN (Keep)
The six-column annual grid; the vertical rule between actual and pro forma; `% Sales` under every expense line with banding; underlined sub-section labels; the yellow-boxed trio Net Income / Adj. EBITDA / SDE with `% Margin` inside the box and DSCR as a third row; `(x) Valuation Multiple` and the `Implied … Multiple` rows; `-PMT()` financing with equity injection %, term and rate as inputs; `ROUND(…,-1)` on a headline price; the Print toggle; the CRE + business "Consolidated Valuation" stack with an italic side note.

---

## 5. Drop-in spec for HOUSE_STYLE.md

### 5.1 New 5.2A: Annual-only layout (Main Street mode)

Applies when `Assumptions!SourceGranularity = "Annual"` (tax returns, annual statements) or `MainStreetMode = 1` with no monthly grid. `Monthly P&L`, YTD and LTM blocks are omitted; the Summary states "Full fiscal years only; source: <Source string>".

| Col | Width | Content |
|---|---|---|
| A | 1.7 | Gutter |
| B | 34 | Labels |
| C:E | 9.1 | Full Year: FY-2, FY-1, FY (labels `=TEXT(...)` per D7: `FY2022`) |
| F | 0.9 | Spacer, **thin right border on E from row 5 to the last printed row** (Keep: SUN's actual / pro forma rule) |
| G:I | 9.1 | Pro Forma: `Low`, `Mid`, `High` |
| J | 0.9 | Spacer |
| K | 60 | Basis / notes (italic): the PF method per line |

Two-tier header per 5.2 and 5.8 (`7B0000`, white bold): row 5 `Full Year` over C:E and `Pro Forma` over G:I, centre across selection; row 6 the period labels; B6 the table name ("Income Statement"). Portrait, fit to one page wide. Every expense line is followed by an italic `% Sales` row (`AMB Ratio`); the line row uses `AMB Line Banded` (fill `F2F2F2` across B:I, not spacers), the ratio row is white. Sub-blocks (`Expenses`, `EBITDA Bridge`, `Business Valuation`, `Financing`) use `AMB Subsection`. Add to 5.8:

| Style | Font | Fill | Border | Number format | Alignment | AMB source |
|---|---|---|---|---|---|---|
| `AMB Subsection` | 9 Underlined | | | | Left, indent 0 | SUN "Expenses", "EBITDA Bridge" |
| `AMB Line Banded` | 9 | `F2F2F2` | | Body | Indent 0 (its `% Sales` row indents 1) | SUN expense rows |

### 5.2 5.4 ladder, Main Street rows (insert after `(–) Market Replacement Compensation [S2]`)

```
  (–) Capital Reserve (Maintenance Capex)   [S3]   Main Street mode only; basis on Assumptions
Adj. EBITDA
  % Margin
```
Basis default: `=AVERAGE(equipment cost placed in service, FY-2:FY)` from Form 4562 Part I line 2 plus Part III Section B basis excluding real property; Source "Form 4562, FY2022–FY2024". Where no 4562 exists, `=AVERAGE(D&A FY-2:FY)` flagged "proxy" in `open-questions.md`. In Main Street mode the CIM S7.3 bridge shows `Reported EBITDA → SDE → (–) Replacement Compensation → (–) Capital Reserve → Adj. EBITDA`.

### 5.3 5.5 additions: scenarios, valuation and financing rows (verbatim)

**Scenario block on `Assumptions`** (`Driver | Low | Mid | High | Basis | Source`), blue inputs: `Revenue growth (%)`; per expense line a method from the fixed list `3-year average` / `Latest year` / `% of sales, 3-year blended` / `Contracted` / `Market rent per comps` / `Owner replacement salary` / `Input`; `Owner replacement salary`; `Capital reserve`; `Deferred capex / renovation ($)`; `Equity injection (%)`; `Loan term (years)`; `Interest rate (%)`; `Valuation multiple (x SDE)`. Mid is the base case; Low and High must each differ from Mid on revenue growth and at least one operating driver (`verifyWorkbook` fails otherwise: SUN's three columns are one, 4.2).

**Valuation rows (Main Street):**
```
SDE
  (x) Valuation Multiple                  0.0x, blue on Assumptions, linked here
Business Valuation                        thin top border
  (+) Deferred Capex / Renovation         from the scenario block
Total Investment                          key total, =ROUND(…,-1) only on this row
Implied SDE Multiple                      0.0x  (Total Investment ÷ SDE)
Implied Adj. EBITDA Multiple              0.0x
```

**Financing rows (Main Street), below the valuation:**
```
Financing                                 AMB Subsection
Purchase Price                            = Total Investment
  (–) Equity Injection                    % input (SBA 7(a) minimum 10%; SUN 15%)
Loan Principal
Term (Years)                              format 0
Interest Rate                             format 0.00%
Annual Debt Service                       =-PMT(rate/12, term*12, principal)*12, currency
Cash Flow Available for Debt Service      = SDE − Market Replacement Compensation − Capital Reserve
DSCR                                      0.00\x; key total; flagged "< 1.25x" in column K when below, never coloured
```
A second loan (renovation) repeats the block; `Annual Debt Service` sums. No loan may be negative: `=MAX(0, …)` with a check.

### 5.4 5.10 additions

| Use | Format | Source |
|---|---|---|
| DSCR (add to the "Multiple, 2 dp" row) | `0.00\x;\(0.00\x\);"–"` | SUN F52:H52 |
| Interest rate | `0.00%;\(0.00%\);"–"` | SUN C87 `6.50%` |
| Loan term (years) | `0` | New (SUN `General`) |

### 5.5 New 5.2B: Tax-return line map (`Databook` in annual mode)

`Databook` columns: `Form | Line | Line description (as printed) | AMB Category | Summary Line | Personal? | Adjustment Ref | FY-2 | FY-1 | FY | Source page`. One row per return line, values in dollars (analysis tabs divide by 1,000). Mapping for Schedule C follows section 3.6; the equivalents the bot's `aiExtract.ts` already names apply for Form 1120-S (line 1c revenue; line 7 officer compensation → `owner_comp`; line 8 salaries; line 11 rents; line 12 taxes and licenses; line 13 interest; line 14 depreciation; line 19 other deductions with its statement) and Form 1065 (line 10 guaranteed payments → `owner_comp`). Rules:

1. `Other Expenses` on `P&L Summary` = `SUMIFS` of every line mapped to `other_opex` and not broken out, never `Total − listed lines`.
2. Tie-out block under the Databook: `Databook | Return | Diff | Status` for **Total expenses (Sch C 28 / 1120-S 20 / 1065 21)** and **Net income (Sch C 31 / 1120-S 21 / 1065 22)** per year; "TIES OUT" at $1.
3. `Personal?` is set for line 9 (car and truck), Part V vehicle, telephone and meals lines; each creates a `Normalization / Personal / discretionary` row on `Adjustments`, amount = the line, Status `Proposed`.
4. Contract labor (line 11) and wages (line 26) map to `payroll`; they become `owner_comp` only through an `Adjustments` row with Evidence and Status (4.4).
5. Taxes and licenses (line 23) is opex; `income_tax` is zero for pass-through entities and the ladder shows "–" for `[D2]`.
6. Depreciation (line 13) carries the Form 4562 split (§179, special, MACRS) in the Basis column; equipment cost placed in service feeds the Capital Reserve default (5.2).
7. Cash-basis returns (line F box 1) set `Assumptions!BooksBasis = "Cash"` (R-FU1 §4 item 2).

Source string for 4.6: `Source: Proprietor's federal tax returns (Schedule C, Form 1040), FY2022–FY2024; AMB Advisory analysis.` Partnership: `(Form 1065)`.

### 5.6 5.7 checks to add

`Check: Total Expenses less sum of expense lines` (per column); `Check: Net Income less return line 31` (FY columns); `Check: Loan principal ≥ 0`; `Check: Low ≠ Mid ≠ High revenue`.

### 5.7 Section 6, add

| Q23 | **Capital Reserve placement**: SUN deducts it above SDE (SDE post-capex); the industry definition and SBA underwriting put it below SDE. Which does AMB want on the printed page? | Below SDE, as `[S3]` | SUN row 43 |
| Q24 | **Owner compensation from a Schedule C**: treat contract labor as the owner's pay only with a 1099 or bank evidence? | Proposed until evidenced | SUN row 48 = line 11 |
