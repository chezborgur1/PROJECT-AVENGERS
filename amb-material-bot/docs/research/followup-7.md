# Follow-up 7: Real-estate module (owner-held premises, market rent, cap-rate grids)

Scope: close the gap in `HOUSE_STYLE.md` that leaves real estate at one adjustment category ("Related-party (rent to market)", 5.3) and one phrase in S10.1 ("real estate arrangement"). Main Street sellers often own the premises; Sunshine is a laundromat inside a five-suite plaza the shareholder owns. This note records what AMB actually built for that deal, what is weak, and the concrete guide text to add: a conditional `Real Estate` tab, the CIM treatment of owner-held property (no value, per D5), and the cap-rate grid formats for the internal `Valuation` tab.

Working files, renders and cell dumps: `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/followup-7/` (`c_*.txt` per-cell dumps; `png/sun_03..09.png` SUN CRE pages; `png/corsair_*.png`; `png/rpa_*.png`, `png/vc_*.png` the two issued PDFs; `png/os25_*.png` the owner statement scans).

## 1. Sources read

| Key | File | What it is | Precedent value |
|---|---|---|---|
| SUN | `02 Monica Kennedy - Investor Dataroom/01 Diligence Workbook/AMB + Sunshine Commercial - Diligence Workbook v7.xlsx` | 8 tabs: `Cover`, `Laundromat Valuation`, `Sensitivity Analysis`, `CRE P&L`, `CRE Valuation`, `Market Rent Analysis`, `Tennant View`, `Valuation Overview` | AMB's only real-estate model. Everything in sections 2–5 comes from it |
| CORSAIR | `03 AMB Advisory - Company Dataroom/In Progress Reports/Corsair_Plaza_NOI_Bridge.xlsx` | 3 tabs: `Assumptions`, `Rent Roll`, `NOI Bridge`; "ILLUSTRATIVE PLACEHOLDER FIGURES" | Logic precedent only (bridge order, reserve conventions, the "never blend" rule). Its formatting is **not** AMB house style: brown header bands `8C4A43` and `5B312B` (both on the guide's retired list), yellow `FFFF00` input fills, arrow glyphs "→" in labels, Arial 10 and 14, merged title rows. It looks generated and must not be copied visually |
| RPA | `02 Diligence Reports/CRE Rental Pricing Analysis.pdf` | 2 pages printed from workbook **v4** ("Microsoft: Print To PDF"): `Sensitivity Analysis` p1 (portrait) + `Market Rent Analysis` (landscape) | The client-facing form of the grids and the comps table |
| VC | `02 Diligence Reports/CRE Valuation Constraints.pdf` | 2 pages printed from workbook **v7**: `Sensitivity Analysis` p1 and p2 | Same grids, plus the post-debt and cash-on-cash pages |
| TD | `00 Target Company Documents/Corsair Plaza Owner Statements/Tenant Details.docx` | Five lines of tenant facts from the seller | Input format a Main Street seller actually supplies |
| OS25 | `.../2025 Owner Statement.pdf` | 11-page scanned property-manager statement (Grand Realty Inc., Pace FL), period 01-01-2025 to 12-31-2025 | The only actual property P&L in the room |
| RVO | `03 AMB Advisory - Company Dataroom/Real Estate Valuation Outreach .docx` | **Not a valuation document.** A 120-word email draft ("Subject: FSU Finance Student — Interested in Commercial Real Estate Valuation", from "Kalel" to "Nate", an appraiser) asking for an informational call | Confirms AMB relies on an outside appraiser for the property value; nothing to imitate |
| MEMO | `In Progress Reports/AMB + Sunshine Commercial - Deal Memo.docx`, `... Initial CRE Valuation.docx`, `Valuation Discussion.docx` | Buy-side prose around the grids | Verbatim phrasing in 4.4 |

## 2. What AMB does: the SUN real-estate module, cell by cell

### 2.1 Tab set, order and tab colours

SUN puts the business first, then the property, then the consolidation:

| # | Tab | Subtitle (B3, Arial 9 italic, thin bottom rule) | Print area | Orientation | Tab colour (resolved) |
|---|---|---|---|---|---|
| 2 | `Laundromat Valuation` | "Laundromat P&L Summary & Valuation ($000s)" | B2:H62 | Portrait, fit to page | `70AD47` (accent6, green) |
| 3 | `Sensitivity Analysis` | "CRE Sensitivity Analysis" | B2:J107, manual page break after row 49 | Portrait | `DAE3F3` (accent5 +80%) |
| 4 | `CRE P&L` | "Commercial Real Estate Valuation ($)" | B2:H65 | Portrait, fit | `DDEBF7` (accent1 +80%) |
| 5 | `CRE Valuation` | "CRE Valuation Overview ($000s)" | B2:J24 | Portrait, fit | `70AD47` |
| 6 | `Market Rent Analysis` | "CRE Market Rent Analysis ($)" | B2:I34 | **Landscape**, fit | `DDEBF7` |
| 7 | `Tennant View` [sic] | "Commercial Real Estate Valuation ($)" (copied from CRE P&L, not its own) | B2:H48 | Portrait, fit | `C00000` |
| 8 | `Valuation Overview` | "Valuation Overview ($000s)" | B2:F35 | Portrait, fit | `C00000` |

Anatomy is the standard V51 anatomy the guide already keeps (5.11): column A gutter 1.71, B2 `=+Cover!B24` Arial 12–13 bold, B3 italic subtitle with thin bottom border, "Print" label and boxed blue 0/1 cell at the right of row 3 (`K3`/`L3`, or `L3`/`M3` on the wide tabs), a conditional format `$L$3=1` that sets font colour to automatic over the whole tab. Section bars are bold Arial 9 on `D9D9D9` (theme white −15%) spanning the print width. Units are `($)` on the property tabs and `($000s)` on the grids and consolidation, and every cross-tab link divides by 1,000 (`='CRE P&L'!C94/1000`).

Column widths, `CRE P&L` and `Tennant View`: A 1.71 · B 20.57 · C 9.57 · D:H default 8.43 · I 0.86 · J 4.43 · K 9.14. `Market Rent Analysis`: B 24.0 · C 10.0 · D 12.29 · E 8.86 · F 10.43 · G 13.57 · H 12.86 · I 13.43. Grid tabs (`Sensitivity Analysis`, `CRE Valuation`): A 1.0 · B 3.71–6.71 (the rotated axis label) · C 4.0–5.14 (row axis values) · D 8.0 · E:J default.

### 2.2 Rent roll (`Tennant View`)

Section bar "CRE Rent Overview". Three stacked tables share one column set: `FY25 | Clearing | NNN | Low-End | Base-Rate` (bold, centred, thin top and bottom rules), each introduced by a centre-across-selection caption in bold: "Rent / Sq. Ft. For Each Scenario", "Total Monthly Rent (Base + NNN)", "Total Annual Rent (Base + NNN)".

Rows (verbatim): `Base Rent / Sq. Ft.` · `NNN Rent / Sq. Ft.` · `Total Rent / Sq. Ft.` (bold, thin top) · `Total Rent Increase` (key total, `FFFFCC`, boxed, `#,##0%` format: "–", 37%, (18%), (8%), 20%). Then one row per tenant, monthly rent as a blue input (`C18` 1800 … `C22` 600), `Total Current Rent` bold with thin top (`=SUM(C18:C22)` = $5,075), and the annual table as `=C18*12` (= $60,900). Tenants as AMB typed them: `Community Theater`, `Laundromat`, `Turnaround Testron*`, `Consignment Shop`, `Book Store`. Footnotes in Arial 7 italic: "1) Cannot verify through Google Maps -- appears to be Carrie's Beauty Salon" and "Breakdown base rent vs. the triple net cost allocation to each tennant".

The seller's actual input (TD) is five lines: "5400 Dogwood Dr: Kiddie Kloset Consignment Shop / Rent: $700", "5406 Dogwood Dr: Scratch Ankle Books and More / Rent: $600", "5410 Dogwood Dr: Santa Rosa Community Theatre / Rent: $1,800", "6416 Park Ave: Quik Wash Coin Laundry LLC (Note: Randy owns this business) / Rent: $1,137.44", "6420 Park Ave: Turnaround Testosterone & Men's Health, LLC / Rent: $775". The related-party fact ("Randy owns this business") arrives as a parenthetical, and the related-party rent ($1,137.44) differs from what the model carries ($1,200).

### 2.3 Market rent comparables (`Market Rent Analysis`)

- Box at top: underlined caption "Current Rent / Sq. Ft."; rows `Total Current Rent` ($60,900, purple link), `Total Leasable Square Footage` (8,400, blue), `Current Rent / Sq. Ft.` (key total, `FFFFCC`, boxed, `[$$]#,##0.00` → $7.25).
- Comps table header (bold, centred, thin top and bottom): `Property | City | Size (SF) | Built | Type | Base Rent | NNN Rate | Total Rent`. 14 rows, property names left-aligned, everything else centred, rents blue `#,##0.00`, missing NNN typed as a blue "-" (text). `Average` row and `Target Property` row both bold on `FFFFCC` inside one thin box: Average $16.13 / $3.71 / $19.52; Target Property "Milton · 8,400 · 1965 · Retail · $7.25 · – · $7.25".
- Source links are hyperlinks in column **N** (outside the print area, Calibri 9 underlined) to cityfeet.com (9), showcase.com (3), commercialsearch.com, realmo.com; a second unprinted list at rows 53–57 links loopnet.com and commercialcafe.com. Nothing on the printed page names a source.
- "Implied Upside ($000s)" block: columns `Current: Total Rent | Pro Forma: Base Rent | Total Rent`; rows `Annual Rental Income` ($61 → $135 → $164) and `% Increase` (italic: 122%, 169%), on `FFFFCC` with a thin box. Formula `=$C$32*(1+D$33)` where `D33 = G25/G26-1` (comps average ÷ target rent).
- Below the print area: `Low-End Rate` $8.0, `Base-Rate` $10.0, `High-End Rate` $14.0 per sq ft (blue, `[$$]#,##0.0`), and "Implied Annual Rent Calculation": `Estimated Rent / Sq. Ft` × `(x) Leasable Sq. Ft.` = `Implied Annual Rent` ($67,200 / $84,000) with `% Increase` (10% / 38%).

### 2.4 Property P&L and NOI build (`CRE P&L`)

Printed page (B2:H65) in four blocks, each under a `D9D9D9` section bar:

1. **"Pro Forma Rent Build"**, columns `FY25 | NNN | Low-End | High-End`. Rows: `Base Rent` (green link to Tennant View) · `(+) NNN Rent` (indent 1) · `Total Rent` (bold, thin top) · `(-) Corporate NNN` · `(-) Corporate Expenses` · `NOI` (key total `FFFFCC`, boxed, `[$$]#,##0`). Values $24,915 / $51,665 / $85,815 / $126,215.
2. Two per-square-foot builds captioned "Estimated Pro Forma Rent Build" and "Actual Pro Forma Rent Build": columns `Base Rent | Insurance | Taxes | CAM | Utilities | Total Rent`; rows `Current (FY25) Rent`, `NNN Rent`, `NNN + Low-End Rent`, `NNN + Base-Rate Rent`, values in `#,##0.00` with `$` on the first row and the total column. The "Actual" block's `Clearing Price Rent` cell is `=+#REF!` and its cells carry an orange `FBE5D6` fill (accent2 +80%) that means nothing.
3. **"NNN Build"** → caption "NNN Allocation Overview", columns `Estimate | Per Sq. Ft. ¦ Actuals | Per Sq. Ft. ¦ Delta | Per Sq. Ft.` (dotted right borders separate the pairs). Rows `Insurance` $5,000 ($0.60), `Taxes2` $10,750 ($1.28), `Maintenance / CAM` $5,000 ($0.60), `Utilities` $6,000 ($0.71), `Total NNN Charges` $26,750 ($3.18) key total. Footnote Arial 7 italic "2) Depends on go-forward tax basis". Off-page red notes: "Based on this calculator", "Make sure this is allocated to laundromat in accordance with usage".
4. **"Corporate Expense Build"** → caption "CRE Corporate Expense Overview", same six columns. Rows (verbatim): `Vacancy Allowance` $3,045 ($0.36) · `Property Management Fee` – · `Capital Reserves` 1,680 ($0.20) · `TI Reserves` 1,260 ($0.15) · `Non-NNN Owner Insurance` 2,500 ($0.30) · `Entity-Level Tax` 750 ($0.09) · `Entity-Level Accounting` – · `Maintenance Shortfall` – · `Total Corporate Costs` $9,235 ($1.10) key total.
5. An **input panel** with header `Input | Notes` (Notes centred-across, italic): `Current Gross Rent` $60,900 "As of 2025" · `Vacancy Allowance` 5.0% "% of gross rent" · `Property Management Fee` – "Taken from current property manager" · `Capital Reserves` 20.0% "% of leasable sq. ft." · `TI Reserves` 15.0% "% of leasable sq. ft." · `Non-NNN Owner Insurance` $2,500 "% per year" · `Entity-Level Tax` $750 "Assumes $750 for annual corporate taxes" · `Entity-Level Accounting` – "Could assume $100 per month for financials" · `Maintenance Shortfall` $0 "% per year" · `Total Usable Sq. Ft.` 8,400. Inputs are **red** (`FF0000`, AMB's "pending" colour), not blue, because they were unconfirmed.

Below the print area (rows 75–94) sits the earlier engine the other tabs still read: scenario columns `FY25 | Clearing | NNN | Low-End | Base-Rate`; `Total Current Rent` → `(-) Property Management` (−3,423, blue) → `Net Operating Income`; then `(/) Prior Transaction Value` $580,000 → `Implied Cap Rate` (9.9% / 13.8% / 8.0% / 9.1% / 12.0%, key total) and `Pro Forma NOI` → `(/) Estimated Cap Rate` 8.0% (blue, on the orange fill) → `Implied Valuation` ($718,463 / **$1,000,000 typed** / $580,963 / $659,713 / $869,713).

### 2.5 The Corsair NOI bridge (logic to keep, format to discard)

`NOI Bridge` (single value column, `\$#,##0;"($"#,##0\);\-`): "SECTION 1 — NNN UNITS (Tenants 1–4)": `Total Scheduled Rent (Base + NNN Reimbursements)` $88,200 (`='Rent Roll'!I11`) → `Less: Vacancy & Credit Loss` (5% × scheduled rent, −$4,410) → `→ Effective Gross Income (EGI)` $83,790 → "Less: Operating Expenses Not Recoverable from Tenants": `Property Management Fee` (6% × **EGI**, −$5,027) · `Non-Reimbursed Owner Insurance` −$2,500 · `Entity-Level Legal & Accounting` −$3,500 · `CAM / Tax / Insurance Gross-Up Shortfall` $0 → `→ NOI — NNN Units (Before Reserves)` $72,763 → `Less: Capital Reserves` ($0.20/sf × 4,200 NNN sf = −$840) · `Less: TI / Leasing Commission Reserves` ($0.15/sf × 4,200 = −$630) → `→ Cash Flow Before Debt Service — NNN Units` $71,293. "SECTION 2 — LAUNDROMAT (OWNER-OPERATED UNIT)": `Laundromat Sq Ft` 2,800 · `Reported Schedule C Net Income` · `+ Owner Addbacks (D&A, Owner Comp, One-Time Items)` · `→ Seller's Discretionary Earnings (SDE) — Laundromat`. "SECTION 3 — COMBINED PROPERTY-LEVEL SUMMARY" repeats the three totals.

`Rent Roll` columns: `Suite / Tenant | Type | Sq Ft | Annual Base Rent | Taxes Reimb. | Insurance Reimb. | CAM Reimb. | Total NNN Reimb. | Total Annual Rent | Lease Status` (status "Not Executed"); the laundromat row is "Owner-Operated" with "N/A — see NOI Bridge tab (Schedule C / SDE basis)" across the rent columns; totals `TOTAL — NNN Units Only (Tenants 1–4)` 4,200 sf / $88,200 and `TOTAL GLA — All 5 Units (incl. Laundromat)` 7,000 sf.

`Assumptions` notes worth keeping as the guide's default rationale text: vacancy "Applied against gross rent even at full current occupancy, per typical lender underwriting convention"; management fee "Standard market range 4%–8%; typically NOT reimbursable by tenants even under a NNN structure"; capital reserves "Roof, HVAC, parking lot resurfacing; ServisFirst will likely require an underwritten reserve"; TI/LC "Reserve for future re-leasing risk across the 4 NNN suites"; insurance "Umbrella / excess liability carried by landlord beyond tenant-billed premium"; legal & accounting "Corsair Plaza LLC bookkeeping/tax prep — not billable to tenants"; CAM shortfall "Set > 0 if executed leases include a CAM cap; landlord absorbs any overage above the cap".

The two rules stated in the workbook, verbatim: "Not a NNN tenant — no lease, no rent roll income. Its economics run through the business's own Schedule C, so it should be valued on a Seller's Discretionary Earnings (SDE) basis, not blended into the NNN units' cap-rate-based NOI." and "Do not sum these onto one blended NOI and apply a single cap rate. Value the CRE (NNN units) at a market cap rate and the laundromat business separately at an SDE multiple, then combine the two resulting values".

### 2.6 What the property manager actually reports (OS25)

Grand Realty's annual statement for Corsair Plaza LLC: `Rent Income` $60,585.45 · `Late Charge` $135.00 · `Sales Tax Processing Charge` ($1,350.00) · `Taxes` $874.80 → `Total Income` $60,245.25; `Management Fee Expense` $6,058.59 (**10.0% of rent**) · `Sales Tax` $872.37 → `Total Expenses` $6,930.96; `Owner Distribution` ($53,314.29); reserve $50. It shows no taxes, insurance, CAM or utilities paid through the manager, which is why the SUN NNN build is an estimate ("Based on this calculator") and its inputs are red.

### 2.7 Cap-rate and financing grids (`Sensitivity Analysis`, `CRE Valuation`)

Common grid furniture (measured on both tabs; render `png/sun_03.png`, `png/sun_06.png`):

- Section bar (`D9D9D9`, bold) names the grid: "Valuation Sensitivity Table" · "8% Cap Rate - Clearance NOI Based on Extimated Expenses" [sic] · "9% Cap Rate - …" · "Post-Debt Service Cash Flow ($350K - $650K Valuation)" · "Post-Debt Service Cash Flow ($700K - $1M Valuation)" · "Cash-On-Cash Return ($350K - $650K Valuation)" · "Cash-On-Cash Return ($700K - $1M Valuation)" · "CRE Valuation Sensitivity Table".
- Column-axis title band (D7:J7): text centre-across-selection, Arial 9 bold, fill **`DDEBF7`** (accent1 +80%), thin top rule and thin left/right on the outer cells: "Valuation Cap Rate Range" · "Total Rent Sq. Ft. Range" · "Valuation ($000s)".
- Column-axis values (row 8): bold, centred, same fill, thin bottom; first cell a blue input, the rest `=D8+0.5%` (cap) or `=D54+50` (valuation) or `=($J$23-$D$23)/6+D23` (rent per sf, from $7.25 to a blue `=D23*2` = $14.50). The clearance grid adds a `% Inc.` row above the values (bold italic, `#,##0%`: 17%, 33%, 50%, 67%, 83%, 100%).
- Row-axis title: cells B9:B17 merged, text rotated 90°, bold, wrap, fill `DDEBF7`, thin box: "Net Operating Income Range ($000s)" · "NNN + Corporate Cost Range ($000s)" · "NOI Range". Row-axis values in column C: bold on the same fill, thin right rule, first cell blue, then `=C9+10` (or +5); first value formatted `[$$]#,##0`, the rest `#,##0`.
- Body cells: Arial 9 regular, **centred**, first row `[$$]#,##0;\([$$]#,##0\);"–";@`, other rows `#,##0;\(#,##0\);"–";@` (percent grids `#,##0%;\(#,##0%\);"–";@`); no fill; a thin box around the whole body.
- Highlights are **hand-drawn**: thin `FF0000` red borders around F9:J11 (8.0–10.0% × $20–40K) and around the three cells where value = $1,000K (F15, H16, J17); on `CRE Valuation` a `FFFFCC` fill with a thin black box over F12:H16 (9.0–10.0% × $20–40K); on the cash-on-cash grid red boxes on F107 and the block G105:H107. Green fill `E2EFDA` (accent6 +80%) typed onto the 14 clearance cells that meet the threshold; the legend "Note: Cells highligted in green clear the $1M CRE valuation threshhold" is an italic line on the same green fill (B49:H49).
- Side inputs, right of the grid (L:M, outside the printed range): `Total Usable Sq. Ft.` 8,400 (green link) · `Estimated Corporate Expenses` $9.235 (red) · `LTV` 85.0% · `Term` 20 · `Rate` 6.50% · `Debt Cost` `=-PMT($M$57/12,$M$56*12,1)*12` = 8.95% (`#,##0.00%`). One italic note under the first post-debt grid: "Assumes a 20-year amortization schedule with 6.50% interest rate".

Formulas, verbatim:

| Grid | Axes | Cell formula | Result format |
|---|---|---|---|
| Valuation (Sensitivity) | cap 7.0–10.0% step 0.5% × NOI $20–100K step $10K | `=$C9/D$8` | $000s |
| Valuation (CRE Valuation) | cap 8.0–11.0% × NOI $5–40K step $5K | `=$C9/D$8` | $000s |
| Clearance NOI (8% and 9%) | rent $/sf $7.25→$14.50 in 6 steps × "NNN + Corporate Cost" $20→$80K in 8 steps | `=D$23*$N$7/1000-$C24` (rent × sf − cost = NOI) | $000s; green where NOI ≥ cap × $1,000K |
| Post-debt cash flow | valuation $350–650K / $700K–1M step $50K × NOI $20–100K | `=($C55-D$54*$M$55*$M$58)` (NOI − value × LTV × debt constant) | $000s |
| Cash-on-cash | same axes | `=D55/(D$84*(1-$M$85))` (post-debt CF ÷ equity) | `#,##0%` |

Printed as PDFs, the grids page is portrait with three grids per page and the manual page break after row 49; there is no cover, header, footer or page number, and the file title is the workbook name. The PDF's first line is the company name and the sheet subtitle, nothing else.

### 2.8 Consolidation (`Valuation Overview`, `CRE Valuation`)

`Valuation Overview` (B2:F35): header row 5 with wrapped two-line labels `Current Valuation | Clearing Price | NNN Valuation | Base-Rate Valuation` (row height 24, thin top and bottom). Rows: `Laundromat` (`=ROUND(+'Laundromat Valuation'!F57,-2)` = 300, green) · `Commercial Real Estate` (`='CRE P&L'!C94/1000`) · `Total Valuation` (key total, boxed: $1,018 / $1,300 / $881 / $960) · `(-) Asking Price` (blue −1,600, indent 1) · `Delta` (key total: ($582) / ($300) / ($719) / ($640)). Then two section bars, "Annual Rent Impact" and "Monthly Rent Impact", each a tenant × scenario table (`=D$22*$H17`, each tenant's share of scenario rent by its current-rent weight in hidden column H) with `Total Annual Rent` and an italic `% Increase` row.

`CRE Valuation` "Consolidated Valuation": `Commercial Real Estate` $450 (blue) · `(+) Signed Leases` 150 with italic note "33% increase in valuation" · `Estimated CRE Valuation` $600 (key total, **typed**) · `(+) Laundromat Valuation` 330 (green) · `Total Valuation` $930.

### 2.9 How AMB handles the related-party rent in the business P&L

`Laundromat Valuation` row 20 `Lease` (fill `F2F2F2`, the expense-line shading): FY22 14.4 · FY23 13.2 · FY24 14.412 (blue) and pro forma Low / Mid / High `=+$C$79`. The assumption block (rows 67–79) lists `Normalized Lease` `=+'Tennant View'!G29/1000` (17.261, the base-rate scenario rent for the laundromat suite) **and** `Go-Forward Lease` `=E20*2` (28.824, "double the current rent", blue). The pro forma reads `Go-Forward Lease`; `Normalized Lease` is computed and unused. So AMB's mechanism is a **pro forma expense replacement in the P&L column**, not an add-back line on the SDE bridge, and the number comes from a judgement ("×2") rather than from the comps tab it built.

Buy-side prose on the same subject (MEMO, verbatim): "Combined NOI: $40K ($1K Plaza, $39K Laundromat)"; "Using ServisFirst Bank's quoted 6.50% interest rate, 85% LTV, and 20-year term, we arrive at a debt service capital cost of 8.95%. The tables above illustrate the cash-on-cash returns based on a range of valuations and post-debt-service NOI."; "For example, if the property was appraised using $80K of NOI and a 10% cap rate, the resulting $800K valuation would result in a 16% cash-on-cash return."; "However, if $80K of NOI was appraised using a cap rate of 8%, then the resulting $1M valuation would result in a 3% cash-on-cash return."; action item "Calculate 10-year view of actual debt servicing and how this effects annual cash flow". Initial CRE Valuation memo: "Asking Price: $1.6M (Includes Real Estate & Laundromat valuation)", "Laundromat Valuation: $500K", "Implied Real Estate Valuation: $1.1M", and a `Approach | Valuation` table: `Prior Transaction Consideration` $580,000 · `County Tax Appraisal` 435,734 · `Precedent Transactions` · `Intrinsic Valuation` · `Average Valuation`. Valuation Discussion: "real estate depends on us getting the le[ases]" and "laundromat depends on the financials".

## 3. What is weak and should be elevated

| # | Defect (evidence) | Elevation |
|---|---|---|
| W1 | Tab named `Tennant View` (misspelled) and its subtitle copied from `CRE P&L`; `CRE P&L` subtitle says "Valuation" although the tab is a P&L | One tab `Real Estate`, subtitle "Real Estate: Rent Roll, Market Rent and NOI ($)" |
| W2 | Scenario names drift: `FY25 / NNN / Low-End / High-End` on the printed P&L, `FY25 / Clearing / NNN / Low-End / Base-Rate` everywhere else, `Low-End Rate / Base-Rate / High-End Rate` as inputs; `Clearing Price Rent` is `=+#REF!` | Fixed scenario set: `In-Place | Market Low | Market Base | Market High`; "Clearing" is a Deal Structure concept, not a rent scenario |
| W3 | The printed NOI is built from red (unconfirmed) inputs and from an estimate of NNN charges the manager does not report; management fee is `–` with note "Taken from current property manager" while OS25 shows a 10.0% fee actually paid | Inputs on `Assumptions` with a `Source` column; management fee defaults to the actual rate from the owner statement, else 6% of EGI ("Standard market range 4%–8%"); never zero, even if owner-managed (lender convention) |
| W4 | `Capital Reserves` 0.20 and `TI Reserves` 0.15 formatted `0.0%` and captioned "% of leasable sq. ft." but multiplied as **$/sf** (`=C59*$C$65` = $1,680); CORSAIR repeats the same mistake (`0.0%` on `$ / sq ft / yr`) | Per-square-foot format `[$$]#,##0.00` and label "$ / sq. ft. / yr" |
| W5 | Two competing NOI engines on one tab: the printed block (NOI $24,915) and the off-page block rows 75–94 (NOI $57,477) that `Valuation Overview` and `Tennant View` actually read; `D94` types $1,000,000 over the formula | One NOI bridge, one scenario table; no numbers typed over links (guide C18) |
| W6 | Property value hard-coded in the consolidation (`CRE Valuation` F20 450, F22 600); `Valuation Overview` links the abandoned engine | Consolidation reads named outputs `RE_NOI_<scenario>`, `RE_Value_<scenario>` |
| W7 | Grid highlights are hand-drawn red borders, a hand-filled `FFFFCC` box, and 14 hand-filled green cells; the legend is a green-filled text line with two typos | Base-case cell gets the guide's 1 pt `7B0000` box; threshold clearance via a conditional format `=D24>=Threshold`; ordinal ramp from 2.6 for heat; legend as `AMB Note` |
| W8 | Rent comps carry no printed source; links hide in column N; missing NNN typed as a blue "-" text; average of `Total Rent` covers 9 of 14 rows without saying so; no filter on size or age (comps 800–7,800 sf against an 8,400 sf subject) | Comps table with `Source | Listed` columns, `n.a.` for missing, `n` stated in the Average row, and an `In sample?` flag (size band ±50%, same type); average and median both shown |
| W9 | Related-party rent normalised by "×2" (`Go-Forward Lease` `=E20*2`) while the comps-derived `Normalized Lease` sits unused; the seller's stated rent ($1,137.44) is not the model's ($1,200) | The PF rent is `Market Base $/sf × occupied sf` from `Real Estate`, flows to `Adjustments` as one PF row with category `Related-party (rent to market)`, basis sentence and source; the in-place rent ties to the lease or owner statement |
| W10 | Square footage disagrees between files: SUN 8,400 sf total, CORSAIR 7,000 sf GLA (4,200 NNN + 2,800 laundromat) | `GLA` and `Owner-occupied sf` are `Assumptions` inputs with source "Survey / lease / county record"; the check tab flags rent roll sf ≠ GLA |
| W11 | CORSAIR's look: `8C4A43` and `5B312B` bands, `FFFF00` input fills, "→" glyphs, "SECTION 1 —" caps labels, merged title rows | Guide 5.8 styles only; labels in the ladder idiom `(–) Vacancy and credit loss` |
| W12 | Issued PDFs (RPA, VC) are raw sheet prints: no cover, no footer, no page numbers, file title = workbook name, typo in the grid title ("Extimated") | Print via the 5.11 furniture; grid titles from a fixed list (5.5 addition below) |
| W13 | The business and the property meet only in a `(-) Asking Price` / `Delta` table; there is no bridge from Total Value to seller proceeds that includes the property mortgage | `Deal Structure` gets `(–) Property Mortgage Payoff` when the property transfers, and the proceeds waterfall carries both assets |

## 4. Guide additions (drop-in text)

### 4.1 Section 0.1 source key: add

| **CORSAIR** | `03 AMB Advisory - Company Dataroom/In Progress Reports/Corsair_Plaza_NOI_Bridge.xlsx` | NOI bridge order and reserve conventions (logic only; its brown bands `8C4A43`/`5B312B` and yellow input fills are on the retired list) |
| **OS25** | `.../Corsair Plaza Owner Statements/2025 Owner Statement.pdf` | Property-manager statement format; source of in-place rent and the actual management fee |

### 4.2 Section 4 (Assumptions) inputs: add a "Real estate" block (all blue, each with `Source`)

`Premises arrangement` (`Leased from third party` / `Owned by seller, offered for lease` / `Owned by seller, offered for sale` / `Owned by operating company`) · `Property address` · `GLA (sq. ft.)` · `Owner-occupied sq. ft.` · `Year built` · `In-place rent, owner-occupied suite ($/yr)` ("Lease; owner statement") · `Market rent Low / Base / High ($/sq. ft.)` ("Real Estate comps, median and IQR") · `NNN charges ($/sq. ft.)` (taxes, insurance, CAM, utilities) · `Vacancy and credit loss (% of scheduled rent)` 5.0% · `Management fee (% of EGI)` actual from the owner statement, else 6.0% · `Capital reserves ($/sq. ft./yr)` 0.20 · `TI / leasing commissions ($/sq. ft./yr)` 0.15 · `Non-reimbursed insurance ($/yr)` · `Entity-level legal and accounting ($/yr)` · `Cap rate Low / Mid / High` ("Appraisal pending; broker opinion") · `Property loan: LTV, term, rate` ("Lender quote: ServisFirst 6.50%, 85% LTV, 20 years" as the worked example) · `Clearance threshold ($000s)` (optional).

### 4.3 Section 5.1 tab table: add one conditional tab

| 21a | `Real Estate` | C: `Premises arrangement` is any "Owned by seller…" value, or a rent roll is supplied | Rent roll · market rent comparables · NOI bridge by scenario · rent-to-market output (4.4 below) | SUN `Tennant View`, `Market Rent Analysis`, `CRE P&L`; CORSAIR bridge |
| 30+ | `Raw - Rent Roll`, `Raw - Rent Comps`, `Raw - Owner Stmt` | A per source when the tab is built | Values only, with the listing URL as a cell value, not a hidden hyperlink | SUN column N links |

Placement: after `Opportunities` and before `Valuation`, so the property's NOI is computed before it is capitalised. Units `($)`; the `Valuation` blocks that read it divide by 1,000.

### 4.4 Section 5.5: add "Real Estate (conditional tab)"

Four blocks under `AMB Section` bars, standard anatomy (5.11), portrait, print area B2:K.

1. **Property** (two-column fact table, `AMB Line` labels): `Address | GLA | Owner-occupied sq. ft. | Third-party leased sq. ft. | Occupancy | Year built | Manager | Arrangement offered`.
2. **Rent roll** (from `Raw - Rent Roll`; rows are tenants, the owner-occupied suite first and flagged `Related party` in a `Type` column): `Suite | Tenant | Type (Third party / Related party) | Sq. ft. | Lease type (Gross / NNN) | Start | Expiry | Monthly rent | Annual rent | $ / sq. ft. | Annual NNN reimb. | Total annual rent | Source`. Totals: `Third-party suites` · `Related-party suite` · `Total` (key total). Check row: `Rent roll sq. ft. less GLA` (red italic, zero).
3. **Market rent comparables** (from `Raw - Rent Comps`): `Property | City | Size (sq. ft.) | Built | Type | Base rent ($/sq. ft.) | NNN ($/sq. ft.) | Total ($/sq. ft.) | In sample? | Source | Listed`. Summary rows on `keyTotal` inside one box: `Average (n = ..)` · `Median` · `Subject property` (in-place $/sq. ft.). Then `Market rent applied` with `Low | Base | High` (`=QUARTILE(sample,1)`, `=MEDIAN(sample)`, `=QUARTILE(sample,3)` as defaults, overridable in blue) and `Implied annual rent, owner-occupied suite` = rate × occupied sq. ft. Missing values are `n.a.`, never a typed "-".
4. **NOI bridge by scenario**, columns `In-Place | Market Low | Market Base | Market High`, label column 36, rows verbatim (order from CORSAIR, labels in the ladder idiom):

```
Scheduled Base Rent
  (+) NNN Reimbursements
Total Scheduled Rent
  (–) Vacancy and Credit Loss              (5.0% of scheduled rent)
Effective Gross Income                     (subtotal)
  (–) Management Fee                       (% of EGI)
  (–) Non-Reimbursed Insurance
  (–) Entity-Level Legal and Accounting
  (–) Real Estate Taxes, Insurance, CAM not recovered   (gross leases; CAM cap shortfall)
Net Operating Income                       (key total)
  % of Total Scheduled Rent                (AMB Margin)
  (–) Capital Reserves                     ($/sq. ft. × GLA)
  (–) TI and Leasing Commissions           ($/sq. ft. × third-party sq. ft.)
Cash Flow Before Debt Service              (key total)
  Per sq. ft. (NOI)                        (AMB Ratio, $0.00)
```

   The `In-Place` column reads the rent roll; the Market columns replace the related-party suite's rent with `Market rate × owner-occupied sq. ft.` and leave third-party rents at contract. The related-party suite is included in NOI **only when the property is offered with the business as a leased asset**; when the operating company would own the building, the tab still computes NOI but `Valuation` capitalises only third-party NOI (the "never blend" rule, CORSAIR).
5. **Rent-to-market output** (three lines the `Adjustments` tab reads): `In-place rent, owner-occupied suite` · `Market rent applied (Base)` · `Pro forma rent adjustment` = in-place − market (negative reduces EBITDA). `Adjustments` receives one row: Tier `Pro forma`, Category `Related-party (rent to market)`, Adjustment "Occupancy cost at market rent", Basis "Replaces the $14,400 paid in FY2025 to the shareholder's plaza entity with $28,000 (2,800 sq. ft. at $10.00 NNN, the base rate applied on the Real Estate tab against a $16.13 average of 14 listings, 800–7,800 sq. ft., Pensacola–Milton).", Source "Owner statement FY2025; CityFeet and LoopNet listings, accessed <date>", P&L line `Rent`, PF method "Contracted" once a lease is signed, otherwise "Market rate". This replaces SUN's `Go-Forward Lease =E20*2`.

Named outputs to add in 5.13: `RE_GLA`, `RE_OccupiedSF`, `RE_RentInPlace`, `RE_RentMarketBase`, `RE_RentAdj_PF`, `RE_NOI_InPlace`, `RE_NOI_Base`, `RE_Arrangement`.

### 4.5 Section 5.5 `Valuation`: add "Real estate (when `Real Estate` is built)"

- **Capitalisation table**, columns `Low | Mid | High` (cap rates from `Assumptions`), rows `NOI (Market Base)` · `(/) Cap Rate` · `Property Value` (key total) · `Per sq. ft.` · `Implied cap rate on prior transaction` (= NOI ÷ last recorded price, with the date; Keep: SUN "(/) Prior Transaction Value $580,000 → Implied Cap Rate"). A `Basis` column names the appraisal status ("Subject to appraisal value" until one exists; Keep: SUN cover wording).
- **Consolidated valuation** (Keep: SUN `Valuation Overview` and `CRE Valuation`): columns are the business cases `Low | Mid | High`; rows `Business (SDE × multiple)` · `(+) Real Estate (NOI ÷ cap rate)` · `Total Value` (key total) · `(–) Property Mortgage` · `(–) Business Funded Debt and Debt-Like Items` · `Equity Value to Seller`. When the property is not offered, the real-estate rows show `n.a.` on `naFill`. No `(-) Asking Price` row unless Frank enters one (buy-side habit; the sell-side model has none).
- **Rule.** The business's PF Adj. EBITDA already carries market rent (4.4 item 5), so the property is capitalised on its own NOI and the two values are added; a blended NOI × single cap rate is never used (CORSAIR rule, verbatim in 2.5).

### 4.6 Section 5.5 `Sensitivities`: add the real-estate grid formats

Four grids, each built with the common furniture below (Keep: SUN; render `png/sun_03.png`, `png/sun_04.png`), explicit formulas, no data tables:

| Grid title (fixed text) | Column axis | Row axis | Cell |
|---|---|---|---|
| "Property value: NOI × cap rate ($000s)" | Cap rate, 7 columns, `CapMid − 3 steps … + 3 steps`, step 0.5% | NOI, 9 rows, `NOI_Base − 4 steps … + 4 steps`, step chosen so the axis is round ($5K below $50K, $10K above) | `=$C9/D$8` |
| "Clearance NOI: rent per sq. ft. × non-recoverable cost ($000s)" | Total rent $/sq. ft., 7 columns from in-place to `In-place × 2`, with a `% Inc.` row above (bold italic, `#,##0%`) | NNN + corporate cost, 9 rows | `=D$23*RE_GLA/1000-$C24`; conditional format `=D24>=ClearanceThreshold×CapMid` fills `E2EFDA`; legend "Cells shaded green clear the $<threshold> valuation at <cap>%" as `AMB Note` |
| "Cash flow after debt service ($000s)" | Property value, 7 columns step $50K centred on `Property Value (Mid)` | NOI, 9 rows | `=$C55-D$54*LTV*DebtConstant` where `DebtConstant = -PMT(Rate/12,Term*12,1)*12`; note "Assumes <term>-year amortization at <rate>% and <LTV>% LTV" |
| "Cash-on-cash return" | same | same | `=D55/(D$54*(1-LTV))`, `#,##0%` |

Furniture (exact): section bar `AMB Section`; axis title bands centre-across-selection, Arial 9 bold on **`DDEBF7`** with a thin box (Keep: SUN accent1 +80%; this is the one place a blue tint is kept in the model, because it marks a sensitivity axis and nothing else); row-axis title in a merged cell rotated 90° on the same fill; axis values bold, first value with `$`; body cells centred, first row `[$$]#,##0`, others `#,##0` or `#,##0%`; the base-case cell (NOI_Base × CapMid, or Value_Mid × NOI_Base) gets a 1 pt `7B0000` box and bold figures (guide 5.5), replacing SUN's hand-drawn red boxes; heat map with the ordinal ramp in 2.6, and any threshold shading via conditional format, never typed fills. Side inputs (`LTV`, `Term`, `Rate`, `Debt constant`, `Threshold`) sit in a settings block at the right, outside the print area, as green links to `Assumptions`.

Number formats to add to 5.10: `Per square foot` `[$$]#,##0.00;\([$$]#,##0.00\);"–";@` (SUN CRE P&L D34); `Debt constant` `#,##0.00%;\(#,##0.00%\);"–";@` (SUN M58).

### 4.7 CIM: property offered for sale or lease (S2.4, S10.1, S11)

**S2.4 "Locations and facilities" becomes a conditional two-part page when `Premises arrangement` is "Owned by seller…".** Layout L2. Left exhibit "Premises" (two-column fact table, `tint` label cells): `Address | Building | GLA and suite occupied | Year built | Other occupants | Parking / access | Manager`. Right exhibit "Arrangement offered to the buyer" (`Term | Offer`): `Owner` ("Shareholder-controlled entity, Corsair Plaza LLC") · `Offered as` ("Lease to the buyer" / "Available for purchase with the business; terms provided separately") · `Proposed rent` ("$10.00 per sq. ft. NNN, $28,000 per year") · `Basis of rent` ("Below the $16.13 average base rent of 14 retail and office listings (800–7,800 sq. ft., Pensacola–Milton, base rents $13.50–$19.50), reflecting the 1965 build and 8,400 sq. ft. footprint; see p. NN") · `Term and renewals` ("5 years, two 5-year options") · `Expenses` ("Taxes, insurance and CAM billed at cost") · `Pro forma treatment` ("Carried in PF Adj. EBITDA in place of FY2025 rent of $14,400 [PF2]"). Commentary bullets: the rent-to-market quantum and its effect on PF Adj. EBITDA; occupancy of the other suites; the lease status ("No lease is in place today; the shareholder will sign one at closing."). Source line: "Source: Owner statement (Grand Realty), FY2025; CityFeet, LoopNet and Showcase listings accessed <date>; management." Optional appendix exhibit S11.5 "Market rent comparables": the comps table (columns as 4.4 item 3, without `In sample?`), Average (n) and Subject rows boxed, listing service named in the source line (amb-deliverables §13 row 13).

**What never appears (D5):** a property value, cap rate, NOI capitalisation, appraisal figure, prior transaction price, asking price or "implied upside" of the property. A property **NOI bridge may appear only when the property is offered for sale**, and only as an earnings exhibit (Scheduled rent → Vacancy → EGI → expenses → NOI) headed "Property operating statement, FY2025 ($)", with the sentence "The property is offered with the business; pricing is not part of this memorandum." Third-party tenants are shown by trade name (their signage is public; SUN and TD use trade names), not by lease document.

**S10.1 "Real estate" row** (extends followup-2 §5): "The shareholder owns the premises through [entity] and will offer the Buyer a [5]-year NNN lease at the rent shown on p. NN, with [two 5-year] renewal options." or "The premises are owned by [entity] and are available for purchase together with the Company; terms are provided separately." No figure other than the rent.

**Voice examples (converted from AMB's buy-side lines):** "The Company occupies 2,800 sq. ft. of a 7,000 sq. ft. retail plaza at 6416 Park Ave, Milton, FL, owned by the shareholder through Corsair Plaza LLC; four third-party tenants lease the remaining 4,200 sq. ft." · "FY2025 rent of $14,400 was set by the shareholder; the pro forma carries $28,000 ($10.00 per sq. ft. NNN, against a $16.13 average base rent across 14 Pensacola–Milton listings), so PF Adj. EBITDA is $13.6K lower than Adj. EBITDA on this item [PF2]." Banned on this page: "prime location", "high-visibility", "well-maintained" (4.4 rule: replace with the fact, e.g. "roof replaced 2022").

### 4.8 Section 5.7 checks: add

| C19 | Rent roll sq. ft. equals GLA (`Real Estate`) | SUN 8,400 vs CORSAIR 7,000 |
| C20 | In-place rent on `Real Estate` equals the P&L rent line for the owner-occupied suite (within $1) | SUN $1,200/month vs TD $1,137.44 |
| C21 | Consolidated value equals Business + Real Estate; no typed constants in the block | SUN `CRE Valuation` F20, F22 typed |

### 4.9 Open question for Frank (add to section 6)

| Q27 | When the seller keeps the building and leases to the buyer, should the CIM show the market-rent comparables table at all, or only the proposed rent? | Show the table in the appendix (S11.5): a buyer will diligence the rent, and the comps defend the PF adjustment | SUN comps; followup-2 S10.1 row |
| Q28 | Reserve conventions: keep $0.20 (capital) and $0.15 (TI/LC) per sq. ft. and 5% vacancy as AMB defaults? | Yes, with CORSAIR's rationale text in the `Source` column | SUN CRE P&L; CORSAIR Assumptions |
