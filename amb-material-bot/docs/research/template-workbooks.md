# Template workbooks (TCC prior work): architecture, QoE databook, funds flow and formatting system

Slice: `references/01 Playbooks & Templates/Real Examples/TCC Prior Work/`

| File | Size | Sheets | What it is |
|---|---|---|---|
| `Template Diligence Workbook vFF.xlsx` | 3.9 MB | 46 (all visible) | Sanitised buy-side diligence template. Placeholders `[PNM NAME]`, `[PNM LOGO]`, `[ASSOCIATION NAME]`. Monthly GL data left in `Detail_PL`, most summary cells stripped, so cached values are mostly `#DIV/0!` (7,913 cells) |
| `CPM Diligence Workbook v25.xlsx` | 6.0 MB | 57 (8 hidden) | The same template filled in for a live deal ("CPM", an HOA management company in St. Louis, MO). Best source for how the template looks when populated |
| `Coral Funds Flow vFF.xlsx` | 1.5 MB | 5 | Closing funds flow for a $3.85M acquisition ("Coral"): Sources & Uses, seller proceeds, payer-to-recipient flow, wire sheet |

**Provenance.** TCC is The CAM Collective, a platform that buys HOA/community-association management companies. "PNM" means *Prospective New Member*, TCC's word for an acquisition target (the CPM external link points at `...\Prospective New Members (PNMs)\CPM (St. Louis, MO)\...`). These are **buy-side** diligence workbooks, not sell-side CIM models. The QoE tabs were not built by TCC. They were pasted in from the accounting firm's FDD databook: in the Template, a firm labelled "CDS" (`CDS Summary` mapping column, navy `324E6B`, Calibri 10); in CPM, `Project CPM_DRAFT FDD Databook_5.27.2025.xlsb` (teal `165A58`, Arial 8). TCC's own tabs share one house style (Arial 9, blue/green/purple font coding, `FFFFCC` totals, `990033` cover bar).

**Relationship to AMB.** TCC's house style is almost the same system as `brand/amb-model-style.json`: the same font colour code (`0000FF`/`008000`/`800080`/black/red), the same number formats (`[$$]#,##0;\([$$]#,##0\);"–";@` etc.), the same `990033` cover bar and 26/20/18 pt cover type, the same `FFFFCC` total fill and the same "Print" 0/1 toggle. AMB's templates evidently come from the same lineage. What differs: AMB adds maroon `7B0000` header bands and `FFE1E1` section rows. TCC keeps headers unfilled (bold text and rules only), and its layout reads cleaner and more like a bank's.

---

## 1. Renders inspected

LibreOffice → PDF → PNG at 90–100 dpi. The Template gave 151 pages, CPM 428 and Coral 7. LibreOffice recalculates on open, so many populated CPM cells render as `#DIV/0!` or `Err:504` (XLOOKUP and data tables). The formatting in those renders is still accurate, and the true values come from the cached values read with openpyxl.

| Render | What it showed |
|---|---|
| Coral p0 `Sources & Uses` | Two-panel landscape S&U: Sources left, Uses right. Bold sub-heads, italic indented sub-lines (for example the lender entities under "Senior Secured Term Loan"), a single `FFFFCC` "Total" row with thin top and double bottom borders on both panels. Blue inputs, purple in-sheet links |
| Coral p1–3 | The supporting schedules on the same tab print as separate pages (multi-range print area): Net Proceed Allocation, Reconciliation Holdback Amount, Debt Payoff Amount |
| Coral p4 `Proceeds` | Price-to-cash waterfall ("Gross Cash Payment … Closing Cash Payment to Seller") with a *Notes* column of italic one-line explanations, followed by the former-shareholder split and "Total Cash Payment to Peter" (principal seller) |
| Coral p5 `Flow of Funds` | Payer / Recipient / Amount ledger. Every amount is a green cross-sheet link. Total Inflows = Total Outflows, then red italic "Gross Balance" and "Net Balance" check rows that must read "–" |
| Coral p6 `Wire Info` | Times New Roman 11 wire register with a peach "Confirm Date" column and a "Total / Check" footer (bank details not reproduced here) |
| Template p0 `Cover` | `990033` band top and bottom, black medium rules, a `[PNM LOGO]` box (shape fill `8E0A0A`), "[PNM NAME] / Diligence Workbook / As of 09/27/26" between thin rules, TCC logo bottom right |
| Template p2 `P&L Forecast Summary` | Dense one-page summary: Key Stats, Revenue, MTB Revenue, Expenses, EBITDA, MTB earnings, then a light-blue `CAEDFB` "Valuation Consideration & Implied Multiple" box |
| Template p3 `P&L Forecast` | Driver model with grey `D8D8D8` section bands (Customer Count Build, Revenue Build Inputs, Earnings Credit Build …), a dotted-bordered LTM column between QoE history and projections, and dense blue/green/purple coding |
| Template p25/28 `Detail_PL` | GL-level databook: navy header "Project [PNM Name] Detailed P&L", light-blue `($000s)` band, group headers (Management Fees, Addendum Fees …) with a rule above each group total |
| Template p79 `LOI EBITDA Recon` | QoE bridge in three column blocks, "CDS" (navy `324E6B` over `C1E5F5`), "LOI" (green `3B7D23` over `D9F2D0`), "Difference to" (black over `F2F2F2`), with coded adjustments (i, ii, A–C, 1–5, PF1–PF5, OC1–OC2) in orange `C04F15` |
| Template p80–84 `Summary` | The monthly adjusted-EBITDA waterfall, an orange "Reported to Adjusted Sales Bridge", and a boxed text panel of adjustment definitions |
| Template p85 `P&L Summary` | TCC house P&L: "Fiscal Year End" two-tier header, underlined section labels, indented lines, `FFFFCC` totals, italic "% Growth", grey `BFBFBF` blocks where a run-rate adjustment has no history, and a boxed KPI block (Average # of Associations / Doors, Monthly Fee / Door) |
| Template p86 `Revenue Detail` | Revenue lines, then "% Growth" and "% of Total Revenue" sub-tables. A red rectangle marks cells for review |
| Template p88 `P&L Charts` | Chart page with a right-hand "Revenue CAGRs ('19 - '24)" mini-table |
| Template p103, CPM p37–38 `Customer Retention` | Count, door and $ roll-forwards with Gross and Net Dollar Retention, a light-blue "2019 - 2024 Median Retention" call-out, and a "Discussion Topics" text box at top right |
| Template p129 `EBITDA Bridge (Deck)` | "@ LOI / QoE / Variance / Comments" bridge from Reported LTM EBITDA to PF Adj. EBITDA, with "(+)/(-)" prefixed labels |
| Template p19 `Future Plan` | "P&L Comparison ($000s)": target vs "Close Peers" vs ~15 "Existing MC Data as of TTM Oct'24" columns. Very dense, dotted group dividers |
| Template p131–132 | Economic projections (Fed Funds, home sales) with peach-filled extrapolated years. Price benchmarking bar charts in `990033` with a dashed "TCC Average" line |
| CPM p1–2 `P&L Forecast Summary` | Populated summary with "Historical Period / TCC Projections / CAGRs" groups, and two 8×8 sensitivity grids on 2029 Adj. EBITDA with the base case highlighted green (`D9F2D0` row/column, `8ED873` centre) |
| CPM p8–10 `Adjusted EBITDA` | FDD provider layout: teal `165A58` band, `[1]…[11]` bracketed refs, category-tagged commentary ("[Non-recurring]: …", "[Cash to accrual]: …") in italic bold teal |
| CPM p15, p120 `EBITDA IS Bridge` | Reported → Reclassification → Reclassed → Due diligence adjustment → Due diligence adjusted → PF run rate. Dashed rules above subtotals, grey "Gross margin" row |
| CPM p14 `P&L Summary` | Populated house P&L (FY22–FY24, Mar-25 LTM, YTD Q1 Mar-24 / Mar-25), with red review boxes around anomalies (Bid Job Income 899, Other Expenses 570) |
| CPM p33 `P&L Charts` | Single-series line charts in `C00000`, bold value labels, no gridlines, no value axis, one chart per metric under a bold ruled heading |
| CPM p41 `Top 20 Customers` | Name, Mgmt. Fees, Units, Type, Start Date, Tenure (Yrs), % Total; "Top 20 Total / Remaining Customers / Total Customers" footer |
| CPM p43 `Employee Analysis` | "2019 - 2024 Stats / Current / 2019 - 2024 Stats (Min, Median, Max) / Current % Delta to:" groups; load and "cut" ratios in yellow boxed blocks |
| CPM p144 `S&U (Deck)` | Uses/Sources with $M, x LOI EBITDA, x Adj. EBITDA, x PF EBITDA, % Total, plus Notes |
| CPM p145 `Appendix` | Section divider built like the cover (target logo, "CPM / Appendix") |
| CPM p146 `HC and payroll` | FDD headcount and payroll roster (teal band, grouped by category, dashed subtotals) |

---

## 2. Architecture

### 2.1 Template Diligence Workbook: tab list in order

Tab colours: theme index 7 is accent4 `0F9ED5` (bright blue), theme 5 at tint 0.8 is `FBE3D6` (peach), theme 4 at tint 0.8 is `C1E5F5`.

| # | Tab | Tab colour | Purpose |
|---|---|---|---|
| 1 | `Cover` | blue | Title page (Arial 26/20/18, `990033` bars, logo placeholder, `="As of "&TEXT(TODAY(),"mm/dd/yy")`) |
| 2 | `Developer Overview` | peach | Developer-client concentration: "Current Developer Client Overview", Customer / Developer / Monthly Mgmt. Fee / Annual Mgmt. Fee / % of Total Mgmt. Fees / Start Date |
| 3 | `P&L Forecast Summary` | blue | One-page summary of history and TCC projections plus the valuation box |
| 4 | `P&L Forecast` | red `C00000` | Driver-based operating model (annual view plus a monthly engine) |
| 5 | `MTB Forecast` | red | "More-to-buy" / upside initiatives (penetration-rate ramps with On/Off toggles and start dates) |
| 6 | `Future Plan` | blue | "P&L Comparison ($000s)" vs close peers and existing TCC member companies |
| 7 | `S&U` | blue | Sources & Uses ($M) with multiples of three EBITDA definitions |
| 8 | `Valuation Exhibits` | blue | "Valuation Revision Exhibits ($000s)": revised LOI grid, revenue and EBITDA earn-out scenarios |
| 9 | `BSI` | blue | "ERC / Transfer Fee Underwriting Analysis": interest-rate-sensitive revenue normalised to a 2.75% neutral Fed Funds rate, with data tables |
| 10–11 | `EBITDA Build (EX ECR)`, `EBITDA Build (EX ECR. Rate Adj)` | blue | Waterfall charts (stacked-bar helper rows) from Diligence Adj. EBITDA to "Total TCC Ex. ECR EBITDA" |
| 12 | `Detail_PL` | light blue | **QoE databook core**: GL-level monthly P&L, Jan-19 to Apr-25, with mapping columns and five adjustment layers |
| 13 | `LOI EBITDA Recon` | pale blue | "Project [PNM Name] EBITDA Recon to LOI": QoE (CDS) vs LOI vs difference |
| 14 | `Summary` | light blue | "Project [PNM NAME] Adj. EBITDA": monthly and annual adjusted-EBITDA waterfall, sales bridge, checks, definitions text box |
| 15 | `P&L Summary` | blue | "Historical P&L Summary ($000s)": TCC house restatement fed by `SUMIFS` on `Detail_PL` |
| 16–17 | `Revenue Detail`, `Expense Detail` | blue | "Revenue Summary ($000s)", "Expense Summary ($000s)" with growth and %-of-revenue sub-tables |
| 18–19 | `P&L Charts`, `Fee Charts` | blue | Revenue trends and CAGRs; "Monthly Fee Evolution" (Avg. Mgmt. Fee / Association, / Door) |
| 20–22 | `On-Site EBITDA Contribution`, `On-Site Associations` (amber `FFC000`), `On-Site Deposits` | | Profitability of on-site staffed contracts |
| 23 | `Customer List` | light blue | Raw customer master (one row per association) |
| 24–29 | `Customer Overview`, `Customer Retention`, `Customer Wins & Losses (Yearly)`, `Top 20 Customers`, `Cohort Analysis`, `Adjusted Association Pricing` | blue | Commercial diligence |
| 30 | `Employee List` | light blue | Raw employee census (freeze `A2`) |
| 31–33 | `Employee Analysis`, `Employee Retention`, `Department Spend` | blue | Workforce diligence |
| 34 | `P&L Overview (Deck)` | peach | "P&L Snapshot" exhibit for the IC deck |
| 35 | `Manager Verification` | red | Manager-to-community fee check |
| 36–39 | `On-Site Overview`, `Recent Hires & Fires`, `Manager Portfolio Analysis`, `Position Descriptions` | | People exhibits |
| 40 | `EBITDA Bridge (Deck)` | peach | "EBITDA Bridge ($000s)" @ LOI / QoE / Variance / Comments |
| 41 | `Appendix` | blue | Divider page (same layout as the cover) |
| 42 | `Raw Data-->` | none | Empty divider tab |
| 43–46 | `Economic Forcast` (sic), `MC Benchmarking`, `Rates` (FRED FEDFUNDS monthly series since 1954), `TCC Financial Accounts` | | Reference data |

The flow is: **cover → forecast and valuation (the answer) → QoE (the evidence) → historical P&L restatement → customers → people → deck exhibits → appendix → raw data.** Outputs come before inputs, the way a bank's model book runs. There is **no table-of-contents / index sheet**, and the `Raw Data-->` divider is the only navigation aid.

### 2.2 CPM Diligence Workbook v25: what changes when the template is used

- **Order changes.** The forecast moves to the front (`P&L Forecast Summary`, `P&L Forecast`, `MTB Forecast`, `Economic Forcast`, all light-green tabs at theme 9 tint 0.6). Then comes the FDD provider's `Adjusted EBITDA`, then `P&L Summary`, then `EBITDA IS Bridge (2)`.
- **The QoE is pasted in, not rebuilt.** `Adjusted EBITDA`, `EBITDA IS Bridge`, `EBITDA IS Bridge (2)`, `Reported IS` and `HC and payroll` are the FDD databook tabs. They are linked to the `.xlsb` databook through 3,437 external-reference formulas (`'[1]P&L source'!…`, `'[1]Pro forma adjustments'!C18`).
- **Tab colour legend in use.** Peach `FAE2D5` = cover, deck exhibits and dividers (`Cover`, `P&L Overview (Deck)`, `MC Benchmarking (Deck)`, `EBITDA Bridge (Deck)`, `S&U (Deck)`, `Appendix`, hidden tabs). Light blue `CAEDFB` = data tabs (`Customer List`, `Employee List`, `TCC Financial Accounts`, `Rates`). Yellow `FFFF00` = work in progress (`Employee Analysis`, `Department Spend`, `Employee Retention`). Amber `FFC000` = `HC and payroll`.
- **Hidden:** `Developer Overview`, `MTB Toggle`, `P&L Overview (Deck)`, `Manager Portfolio Analysis`, `Position Descriptions`, `MC Benchmarking (Deck)`, `EBITDA Bridge (Deck)`.
- **New analysis tabs:** `LT Clients` ("Long-Term Client Growth (2000 - 2025)"), `Recent Maintenance Detail`, `On-Site Overview v2`, `Org Chart`.
- **Behind `Raw Data-->`: 17 raw tabs** (`Staff Info`, `Office Salaries`, `Inactive employees`, `Staff details vFJM`, `STL Acct Fees`, `Rankings`, `Losses and Wins`, three `Inactive … Mgmt Fees` tabs, `Columbia Portfolio`, `2025 Edited Invoice`, `2025 Invoice`, `2025 Raw Data` …). Most are unformatted and several carry cached `#N/A`/`#REF!` errors (561 `#N/A`, 99 `#REF!` workbook-wide).

### 2.3 Coral Funds Flow: tab list

| Tab | Purpose | Print area |
|---|---|---|
| `Sources & Uses` | Deal S&U plus supporting schedules on the same sheet | 4 ranges: `B2:L28`, `H30:K36`, `H38:J42`, `H44:J50` |
| `Proceeds` | Purchase price to closing cash to the seller, and the split between shareholders | `B2:G30` |
| `Flow of Funds` | Payer → Recipient → Amount ledger with balancing checks | `B2:D30` |
| `Appendix>>` | Divider | – |
| `Wire Info` | Wire register with confirmation dates | `B2:F17` |

---

## 3. Period layout

**House (TCC) annual summary tabs** (`P&L Summary`, `Revenue Detail`, `Expense Detail`):

```
col A  gutter 1.8
col B  labels 38.8
C..H   Dec-19 … Dec-24   header row 6: C6 hard date, D6 =EOMONTH(C6,12) … (mmm-yy)
I      "Apr'25 LTM"      text header
J..K   YTD April: Apr-24, Apr-25  (tier-1 "YTD April" centred across J:K)
```

The tier-1 header in row 5 is `Fiscal Year End`, Arial 9 bold, *centre-across-selection* (`centerContinuous`, not merged) with a thin bottom border. Tier 2 in row 6 is bold with thin top and bottom borders. Growth for the LTM and first-year columns is shown as `--`.

**Forecast tabs** (`P&L Forecast`, `P&L Forecast Summary`):

```
row 1  =YEAR(col6)   row 2 =MONTH(col6)      helper rows for SUMIFS/AVERAGEIFS
row 5  "QoE " over C:H | "Projections" over J:N      (CPM summary: "Historical Period" | "TCC Projections" | "CAGRs")
row 6  Dec-19 … Dec-24 | "LTM Apr" | Dec-25 … Dec-29 | spacer O (3.6) | P.. monthly Jan-24 → (P:CI)
```

- Annual projection cells aggregate the monthly engine: `=SUMIFS($AB16:$CI16,$AB$1:$CI$1,L$1)` for flows and `=AVERAGEIFS(...)` for balances and counts. Per-door drivers are pulled with `=_xlfn.XLOOKUP(L$6,$P$6:$CI$6,$P43:$CI43)`.
- The LTM column has **dotted left and right borders**, which set it apart as the bridge between history and forecast. The CPM summary puts a dotted right border on the LTM column. The CAGR block is `'22 '24` (historical) and `'25 '29` (projected).

**QoE tabs:**

- CDS (Template): monthly `Jan-19 … Apr-25` blocks, each followed by an annual block `FY19 FY20 FY21 FY22 FY23 FY24 | LTM 4/25 | YTD 4/25 | YTD 4/25` (the second YTD is the prior year, but both carry the same label: a labelling defect).
- FDD (CPM): annual `FY22 | FY23 | FY24 | TTM25 | PF run rate`, then monthly `Jan-22 …` (`=EOMONTH(J5,1)`) to the right. Annual formulas: `=SUM(J6:U6)`, and TTM `=SUM(AK6:AV6)`.

**Label drift across tabs** (one deal, one workbook): `LTM Apr`, `Apr'25 LTM`, `LTM 4/25`, `TTM25`, `Mar-25 LTM`, `TTM Q1'25`, `YTD Q1`, `YTD April`, `YTD July'25`, `YTD Oct'25`, `TTM Oct'25`. The analysis tabs also use different as-of dates (April P&L, July headcount, October customers). A top-tier model sets one period convention and one as-of date on the cover and derives every label from them.

---

## 4. QoE-style databook structure

### 4.1 GL-level databook (`Detail_PL`, Template)

This is the backbone everything else reads from. 169 rows × 657 columns, freeze `J36`.

**Mapping columns (A–I).** Each GL line carries several mappings, so any summary can be built with `SUMIFS`:

| Col | Header | Example (row 5) |
|---|---|---|
| A | *(TCC P&L Summary key, no header)* | `Mgmt. Fees` |
| B | *(payroll sub-key)* | `Total Salaries`, `Employee Benefits`, `Employer Taxes`, `401K Plan`, `Employee Bonuses` |
| D | `($000s)` (display label / group totals) | `Management Fees` |
| E | `VMS Account` (legacy ERP) | `MANAGEMENT FEES` |
| F | `Vantaca Account` (new ERP) | `460001 - MANAGEMENT FEES` |
| G | `CDS Summary` (QoE firm's grouping) | `Management Fees` |
| H | `Management Schedule Mapping` | `Mgmt. Fees` / `Personnel` / `Office / Facility` / `Marketing` / `Other` |
| I | `Subtable` | (EBITDA subtable reference) |

Two ERP charts of accounts are mapped side by side (the target switched from VMS to Vantaca in Sep-24). That lets the historical period be shown on a consistent basis. A good pattern.

**Column blocks** (row 2 titles, each a monthly run followed by the annual summary):
`Unadjusted` → `As % of Net Revenue` → `Management Adjustments` → `Management Adjusted` → `As % of Net Revenue` → `Diligence Adjustments` → `Diligence Adjusted` → `As % of Net Revenue` → `Pro Forma Adjustments` → `Pro Forma Adjusted` → `As % of Net Revenue`.
Header fills alternate between navy `324E6B` (level blocks) and green-accent `3B7D23`/`D9F2D0` (adjustment blocks). The %-of-revenue blocks use orange `C04F15`/`FBE3D6`. The spacer between blocks is 0.8 wide.

**Row structure** (group totals bold in col D). Revenue: `Management Fees`, `Addendum Fees`, `Transfer & Resale Fees`, `Bank Service Income`, `Other Revenue`, total **`Net Sales`**. Operating expense groups: `Salaries & Wages`, `Fringes & Payroll Taxes`, `Software & IT`, `Reimbursable Expenses`, `Rent & Utilities`, `Taxes & Licenses`, `Advertising & Marketing`, `Bank Fee & Charges`, `Office Supplies & Expenses`, `Insurance`, `Employee Welfare Expenses`, `Travel, Meals & Entertainment`, `Professional Fees`, `Other Operating Expenses`, total **`Total Operating Expenses`**. Then **`Operating Income`** → `Other (Income) Expense` (distributions, sublease rent, interest income, PPP grant) → **`Net Income`** → `Add Backs:` `Interest Income` → **`EBITDA`** → `Per Source` → `Check`.

**Gross margin.** The Template has no COGS line (a service business, Net Sales straight to opex), so no gross margin appears in TCC's own tabs. The CPM FDD bridge does carry `Cost of revenue` (maintenance salaries and overhead, St. Louis managers, regional staff) → **`Gross profit`** → *`Gross margin`* (grey-filled italic row). AMB's template needs a gross-profit tier as standard. Most Main Street targets (HVAC, trades, distribution) have real COGS.

### 4.2 Adjusted EBITDA waterfall (`Summary`, `LOI EBITDA Recon`)

The strongest single pattern in the slice: a **four-tier adjustment hierarchy with a code for each tier**. The rows are verbatim; the code sits in col C in orange `C04F15`.

```
Project [PNM NAME] Adj. EBITDA            (navy 324E6B band, white bold)
($000s)                                   (light-blue C1E5F5 band, month/period headers)
Net Sales
Operating Expenses
Operating Income                          bold, C1E5F5 fill, thin top
Operating Income %                        italic
Other (Income)/Expense            i
Net Income                                bold, C1E5F5
Net Income %
Definitional Adjustments                  bold underline, orange
  Interest Income                 ii
Definitional Adjustments                  bold, thin top
Definitional EBITDA                       bold, C1E5F5
Definitional EBITDA %
Management Adjustments
  Personal Expenses               A
  Non-Recurring Property Expenses B
  Non-Recurring Marketing         C
Management Adjustments
Management Adjusted EBITDA
Management Adjusted EBITDA %
Diligence Adjustments
  Amend Owner Compensation        1
  Disallow Non-Recurring Marketing 2
  Other Non-Operational (Inc)/Exp 3
  Non-Recurring Items             4
  Out-of-Period Expenses          5
Diligence Adjustments
Diligence Adjusted EBITDA
Diligence Adjusted EBITDA %
Pro Forma Adjustments
  Run-Rate Management Fees        PF1
  Run-Rate Payroll                PF2
  Incremental Hire                PF3
  Go-Forward Rent Expense         PF4
  Pro Forma Vantaca Software Costs PF5
Pro Forma Adjustments
Pro Forma Adjusted EBITDA
Pro Forma Adjusted EBITDA %
Other Considerations                      (shown, NOT added to EBITDA)
  Run-Rate Earnings Credit        OC1
  Transfer Fee Increase           OC2

Reported to Adjusted Sales Bridge         (orange C55A11 band, FBE3D6 subheader)
Reported Sales / Run-Rate Management Fees PF1 / Non-Recurring Items 4 / Adjusted Sales

Net Income per source      (green 009900)   Check (red FF0000)
Definitional EBITDA per Source              Check
Adjusted Revenue                            Check
```

- Pro forma cells that cannot be measured for a period hold the text `n.q.` (not quantified) instead of zero. A disciplined convention.
- `LOI EBITDA Recon` shows the same rows in three blocks: **CDS** (`FY24`, `LTM 4/25`), **LOI** (`LTM 8/24`), **Difference to** (`FY24`, `LTM 4/25`). This reconciles the QoE to the EBITDA the LOI was priced on.
- **Definitions panel.** A bordered text box (Calibri 10, red/purple accents) sits next to the table and explains every code in one paragraph each. Verbatim examples:
  - "**Amend Owner Compensation** – This adjustment restates the owner's salary to $200k plus applicable payroll taxes and benefits of 15%."
  - "**Disallow Non-Recurring Marketing** – Disallows management's marketing adjustment as payments are recurring and the Company receives marketing benefits from the contributions."
  - "**PF-3. Incremental Hire** – Burdens EBITDA for the $60k salary and associated fringe expenses (7.65% payroll tax and 7.35% benefits) of hiring one additional portfolio manager post-transaction."
  - "**PF-5. Pro Forma Vantaca Software Costs** – In Sep-24, the Company transitioned their reporting software from VMS to Vantaca, increasing software expenses from $4.9k per month to ~$10k per month … This adjustments includes the higher software fees prior to transition to present the Historical Period on a comparable basis."
  - "**OC-1. Run-Rate Earnings Credit** – Represents the EBITDA impact assuming the increase in earnings credit rate from 40% of the Federal Funds rate to 80%, and a 2.75% underwriting rate. The Federal Funds rate averaged 5.1% in FY24 and 4.8% in LTM 4/25."
  - An open item is left in-line in red: "[OPEN to receive void payments repoprt]".

  The style is **mechanism, then quantum, then source** ("Refer to 'EBITDA Subtables' tab."), with no adjectives. This is the prose standard AMB's add-back footnotes should follow.

### 4.3 FDD provider version (`Adjusted EBITDA`, CPM)

Arial 8, teal `165A58` title band with white bold text, `$'000` unit label, freeze `D6`.

```
Revenue, reported | Revenue, due diligence adjusted | Revenue, pro forma adjusted
Net income/(loss)  (bold) | Taxes | Depreciation | Interest expense, net
EBITDA, reported  (bold, F2F2F2, thin top)       EBITDA margin, reported (italic, F2F2F2, medium bottom)
Due diligence adjustments (bold)
 [1] Non-recurring bid project   [2] Out-of-period items   [3] New firewall purchases
 [4] Normalize insurance         [5] Accrued payroll       [6] (Gain) loss on sale of fixed assets
 [7] Loan payments               [8] Accrued bonuses
Total due diligence adjustments (thin top+bottom)
EBITDA, due diligence adjusted / EBITDA margin, due diligence adjusted
Pro forma adjustments: [9] Pro forma management fees  [10] Pro forma payroll expense
Total pro forma adjustments / EBITDA, pro forma adjusted / EBITDA margin, pro forma adjusted
Other considerations: [11] BFCA decking bid gross profit
Per IS checking (red italic): Revenue / Checking; Net income/(loss) / Checking; Reported EBITDA / Checking
```

- The **auto-numbering is formula-driven.** Col A holds hidden white-font integers (`=A16+1`), and col B displays `=_xlfn.CONCAT("[",A16,"]")`. Insert an adjustment and every reference renumbers.
- The **PF run rate column** (H) is populated only for revenue, adjusted EBITDA and pro forma lines. The other cells are filled solid teal or grey, a clear "not applicable" signal.
- **Category-tagged commentary** sits in col AW, italic bold teal, one sentence each. The category tag comes first. Verbatim:
  - "[Non-recurring]: Target had a significant non-recurring fixed bid roofing project for customer … from Dec-23 to Apr-24. We adjusted earnings to remove the revenue and expense associated with this project."
  - "[Cash to accrual]: Target's expenses insurance premiums on a cash basis. We have normalized this expense to reflect it over Target's insurance period."
  - "[Non operating]: Removes non-operating gains and losses from the sale of fixed assets."
  - "[Non recurring]: Removes loan payments that were expensed on the balance sheet since the Transaction is expected to be completed on a cash-free, debt-free basis."

  The categories in use are `Non-recurring`, `Timing`, `Cash to accrual`, `Non operating`. They map closely onto AMB's `addbacks.csv` types (`owner`, `discretionary`, `non_recurring`, `other`). The FDD set is more precise: it separates *accounting-basis* corrections from *normalisations*.

### 4.4 Adjusted income statement bridge (`EBITDA IS Bridge`, CPM)

The column blocks in row 5 are: `Reported` → `Reclassification` → `Reclassed` → `Due diligence adjustment` → `Due diligence adjusted` → `PF Run rate adjustments` → `PF Run rate` → `% of pro forma revenue`. Each block is `FY22 FY23 FY24 TTM25` plus monthly. The rows are the full GL-level P&L grouped as `Revenue` / `Management fees` / `Maintenance income` / … / `Cost of revenue` / `Gross profit` / `Gross margin` / `Operating expenses` / `Support staff expenses` / `General and administrative` …. A **dashed bottom border** sits on the last line before each subtotal. This is the Big-4-style full P&L restatement, and it shows *reclassifications separately from adjustments*. TCC's own template does not do that.

### 4.5 TCC's own restatement layer (`P&L Summary`, `Revenue Detail`, `Expense Detail`)

`P&L Summary` rows (Template) are listed below. CPM is the same with FY22–24.

```
Revenue (underlined)
  Mgmt. Fees | Transfer Fees | Earnings Credits | Collection Fees | Addendum Fees | Other Fees | On-Site Net Revenue
Total Revenue (Excl. On-Site)       bold, FFFFCC, thin top
  % Growth                          italic
Check                               red italic (=Detail_PL!QM36-C15)
RR Adjustments / Current Mgmt. Fees RR / Total RR Adj. Revenue      (FFFFCC, thin top, double bottom)
PF Adjustments / Earnings Credit Renegotiation / Transfer Fee Volume Increase / Total PF Adj. Revenue
On-Site Reimbursements (Excl. Net Fee) / Total Revenue / % Growth / On-Site Reimbursements
[boxed KPI block] Average # of Associations | Average # of Doors | Monthly Mgmt. Fee / Door ($) | Monthly Transfer Fee / Door ($) | Monthly Addendum Fee / Door ($)
Expenses: Payroll | IT Costs | Rent & Facility Expenses | Sales & Marketing | Insurance | Other Expenses (plug =C49-SUM(C43:C47)) | Total Expenses | % Growth
Check
QoE Adj. EBITDA   (FFFFCC) / % Margin
Run-Rate Adjustments: Current Mgmt. Fees RR | Corporate Payroll | Open Manager Position | Rent Expense | Go-Forward Vantaca Costs | Total Run-Rate Adjustments
Run-Rate EBITDA  (FFFFCC, thin top, double bottom) / % Margin
PF Adjustments: Run-Rate Earnings Credit | Transfer Fee Increase | Total PF EBITDA Adjustments
PF Adj. EBITDA   (FFFFCC, double bottom) / % Margin
```

- **Mechanics.** Every figure is `=SUMIFS(Detail_PL!QM:QM,Detail_PL!$A:$A,'P&L Summary'!$B8)`, keyed on the row label, in green because it comes from another sheet. `Revenue Detail` pulls from `P&L Summary` with `=INDEX('P&L Summary'!C:C,MATCH($B8,'P&L Summary'!$B:$B,0))`, and growth uses `=IFERROR(+D8/C8-1,0)`.
- **Tie-outs.** Every summary carries a red `Check` row back to the databook.
- **CPM version.** It inserts a *memo* block, "Memo: Diligence Adjustments (Reflected in P&L Above)", listing the QoE adjustments (`Mgmt. Personal Expenses`, `Payroll accrual`, `Insurance expense normalization`, `Computer programs/support normalization`, `Nonrecurring expense`, `Owner compensation`, `Rent normalization`, `Nonrecurring payroll`, `Software contracts`, `Total QoE Diligence Adjustments`). Then `Adj. EBITDA` → `Current Payroll run-rate` → `PF Adj. EBITDA`.
- **Deck bridge.** `EBITDA Bridge (Deck)` condenses all this into columns `@ LOI | QoE | Variance | Comments` (Comments column 41.4 wide). The rows are `Reported LTM EBITDA`, "(+) Net Mobile Maintenance Income", "(+) Payroll accrual", "(-) Revenue accrual", "(+) Dec '24 Mgmt. Fee normalization", `Total Dil. Adjustments`, `Diligence Adj. EBITDA`, "(+) Run-Rate Mgmt. Fees" … `Total PF Adjustments`, `PF Adj. EBITDA` (`FFFFCC`, double rules).

### 4.6 Net working capital, debt-like items, proof of cash

**None of the three workbooks has an NWC schedule, a balance sheet, a debt-like items schedule or a proof of cash.** A keyword search of every cell in both diligence workbooks found no "working capital", "NWC", "proof of cash", "debt-like" or "net debt". The only balance-sheet-adjacent content is:

- the CPM adjustment `[7] Loan payments` ("…cash-free, debt-free basis"), `[5] Accrued payroll` and `[8] Accrued bonuses`, which are really NWC and debt-like topics treated as EBITDA timing;
- the Coral funds flow's `Debt Payoff Amount` (lender principal plus per-diem interest `=48.07*7`, "Assumes 7/3 payoff"), `Transaction Expenses Amount`, `Tax Lien Holdback` and `Reconciliation Holdback Amount` ("One Month Mgmt. Fees"). These are the debt-like items, but they sit only in the closing mechanics.

This is the biggest gap against a top-tier QoE databook. AMB's bot already ingests QuickBooks balance sheets and bank statements (`docs/REQUEST_LIST.md`), so the new template can and should add three things:

1. **NWC**: monthly AR / prepaid / AP / accrued / deferred revenue, adjusted NWC excluding cash and debt, a trailing-12 average as the peg, and NWC % of revenue.
2. **Debt and debt-like items**: funded debt, accrued interest, deferred revenue, customer deposits, unpaid bonuses and payroll taxes, deferred capex, seller transaction costs, aged AP.
3. **Proof of cash / revenue-to-deposits**: P&L revenue vs bank deposits by month, variance and %. It mirrors the "Per IS checking" and `Check` rows already in these files.

### 4.7 Commercial and people analyses (worth keeping as optional modules)

- **`Customer Retention`**: three roll-forwards (Association Count, Door Count, Monthly Mgmt. Fee $). Each follows `Prior Year … Count` → "(+) New Customers" → "(-) Customer Churn" → `Ending … Count` → *New Customers as % of Beginning Count* → `Association Retention Rate` (`FFFFCC`, bold italic, boxed). The $ block adds "(-) Existing Customer Decrease (Downsell)" and "(+) Existing Customer Increase (Upsell)", then `Gross Dollar Retention` and `Net Dollar Retention`. A light-blue call-out gives "2019 - 2024 Median Retention" (Template: "Jan 2019 - Oct 2025 Avg. Retention"). Footer ratios: Average Mgmt. Fee / Lost Customer, / New Customer, Avg. Door / CA.
- **`Cohort Analysis`**: side-by-side Association Count and Door Count cohort triangles (Legacy, 2019 Cohort …), then *% Gross Retention* and *% Cumulative Retention* triangles.
- **`Top 20 Customers`**: Mgmt. Fees, Units, Monthly Fee / Unit ($), Type, Start Date, Tenure, % Total. Footer `Top 20 Total` (`FFFFCC`) / `Remaining Customers` / `Total Customers`. Built with `INDEX('Customer List'!$Q:$Q, …)` on a `Rankings` helper.
- **`Customer Overview`**: breakdown by type (HOA / Condo / Other or COA / HOA / TownHome) and by region, plus size buckets (">$3,000", "<$3,000>$1,500" …), with "% of Total" in italics.
- **`Employee Analysis`**: "2019 - 2024 Stats / Current / Min, Median, Max / Current % Delta to:". Employee Load (Associations / Employee, Units / Employee) and "Employee Cut (Salary / Mgmt. Fees)".
- **"Discussion Topics" boxes.** A text box at the top right of almost every analysis page (grey `BABABA` border, "Discussion Topics" underlined) holds 2–4 management questions tied to what the page shows. Verbatim: "Payroll expenses have typically outstripped management fee growth; why?", "Discuss the spike in Bid income in 2024", "Why has the number of accounts onboarded declined in recent years (noting that 2025 is off to a very strong start)?". This is the best "not AI-generated" device in the library: the page tells you what it made the analyst ask.

---

## 5. Forecast and valuation layer

- **`P&L Forecast` sections** (grey `D8D8D8` bold bands across B:N): `Customer Count Build`, `Revenue Build Inputs`, `Earnings Credit Build`, `Mgmt. Fee & Addendum Build`, `Revenue Projections`, `Expense Build Inputs`, `Corporate Payroll Build`, `Expense Projections`. The CPM version adds `Addendum Comps Detail (as of Oct' 24)`.
- **Driver design.** Revenue = units × per-door price × pricing growth. The count roll-forward uses Core Association Retention and Gross Adds (% of Beg). Payroll = headcount by role (Manager / Assistant Manager / Executive / Accounting / Admin + Other) × average salary × (1 + Salary Increases). Headcount is driven by "Load" ratios (Portfolio Associations ÷ Manager Count), and fringe is a % of salary.
- **Colours in the forecast.** Carried-forward assumptions are purple (`=K9`), overrides blue, history links green. The last row, `Diligence Adj, EBITDA`, ties to `=Detail_PL!QM166`.
- **`P&L Forecast Summary`.** Key Stats (Average # of Associations, EOY Association Count, Yearly Association Wins, Average # of Doors, EOY Employee Count, Yearly Employee Hires, Avg. On-Site Employees, CAM Load), Revenue, MTB Revenue, Expenses, `Diligence Adj. EBITDA`, MTB Earnings, `PF MTB EBITDA`.
  - A boxed `CAEDFB` block "Valuation Consideration & Implied Multiple (Baseline EBITDA)": `Cash at close`, `Earnout`, `Seller Note`, `Total Consideration Paid`, EBITDA, `Implied Multiple`, at close and for each forecast year.
  - Below it, two **2-way sensitivity grids** on 2029 Adj. EBITDA: "Net Retention x Ave. Gross Win Rate" and "CAM Load x Ave. Gross Win Rate", 8×8, with the base-case row and column filled `D9F2D0` and the base cell `8ED873`.
- **`S&U` / `S&U (Deck)`.** `Uses` (bold, medium bottom): `Cash to Sellers`, `Seller Note`, `Enterprise Value` (`FFFFCC`), `Transaction Fees`, `Total Uses` (thin top, double bottom). `Sources`: `Equity`, `Seller Note`, `Total Sources`.
  - Columns: `$M | x LOI EBITDA | x Adj. EBITDA | x PF EBITDA | % Total`. A boxed "Adj. EBITDA" row sits under the table.
  - `Additional Retention Bonus` in italics, then a `Notes` block: "*Retention bonus is contingent upon sellers remaining actively involved in the business through 2026", "*Includes an earnout structured as the incremental Dec '26 TTM EBITDA > $3.0M x 12.0".
- **`Valuation Exhibits`.** An offer-revision grid (`Original` vs `Revised LOI`: Increase in Cash at Close $750…$2,000, then Cash at Close, Seller Note, Total Valuation, BSI Adj. EBITDA, `Implied Multiple`). Then revenue earn-out and EBITDA earn-out scenario tables across FY 2026 CAGR cases 15.0%–25.0%, with "Note: Our original LOI multiple was 7.0x".
- **`EBITDA Build` waterfalls.** Helper rows C48:D55 feed a stacked-bar chart with an invisible base. Steps: Diligence Adj. EBITDA → (-) Earnings Credits → Ex. ECR LTM EBITDA → initiatives → Total.

---

## 6. Funds-flow structure (`Coral Funds Flow vFF`)

All tabs: Arial 9 (the wire sheet is Times New Roman 11), gridlines off, title `Coral` Arial 13–14 bold in B2. Later tabs link their title with `=+'Sources & Uses'!B2`, and every section label is bold with a thin top rule. Currency is shown **to the cent**: `[$$]#,##0.00;\([$$]#,##0.00\);"–"`.

**Sources & Uses** (col widths A 1.86, B 13.86, F 17.57, G 1.86 spacer, H 13.86, L 14.14):

| Sources (B:F) | Uses (H:L) |
|---|---|
| **Seller Note Amount** `=-L13` (purple) | Total Aggregate Purchase Price (blue input 3,850,000.00) |
| **Senior Secured Term Loan** (blue), with italic lender sub-lines at 50% each | Plus: Cash Amount |
| **Equity Contribution from [Buyer HoldCo]** `=F28-F18-F10-F8-F22` (the plug), with italic investor sub-lines | Minus: Debt Amount `=-J50` |
| **Coral Balance Sheet Cash** | *Total* |
| **TCC Balance Sheet Cash** | Minus: Transaction Expenses Amount `=+J62*-1` / Minus: Seller Note Amount / Minus: Tax Lien Holdback / Minus: Reconciliation Holdback Amount |
| | **Closing Cash Payment to Seller** (bold, thin top) |
| | **Buyer Fees & Expenses**: "Accounting Diligence - [firm]", "Buyer's Acquisition Counsel - [firm]", "Consulting Fee - [advisor]" |
| | **Coral Debt Payoff** / **Cash to TCC Balance Sheet** |
| **Total** `=L28` ($4,229,750.00) | **Total** (`FFFFCC`, thin top, double bottom) |

The supporting schedules live on the same tab, each titled in underlined text:

- `Net Proceed Allocation` (Allocation % blue inputs; the last holder is the plug `=J36-SUM(J32:J34)`)
- `Reconciliation Holdback Amount` (Tax Liens, One Month Mgmt. Fees)
- `Debt Payoff Amount` (lender principal, per-diem interest, shareholder loan, with the italic blue note "Assumes 7/3 payoff")
- `Transaction Expenses Amount` (seller counsel, legal retainer, payments to former shareholders)
- a tiered success-fee calculator `Ellery Fee` (`<=$10M` 2.5%, `>$10M` 1.25%)

**Proceeds.** `Proceeds Overview` / `Notes` columns:
Gross Cash Payment → "Plus: Seller Note Amount" → "Plus: Cash Amount" → "Minus: Debt Amount" → "Minus: Transaction Expenses Amount" → **Estimated Purchase Price** → "Minus: Seller Note Amount" → "Minus: Reconciliation Holdback Amount" → "Minus: Tax Lien Holdback" → **Closing Cash Payment to Seller** (`FFFFCC`, double bottom).
Notes are italic one-liners, for example "$347K owed to [bank] & $100K owed to [seller] plus interest", "One month of management fees". Then `Former Shareholder Allocation` (Allocation / Net Proceeds, `Total Cash to Former Shareholders`, `Total Cash Proceeds to Current / Former Shareholders`) and `Total Proceeds For [principal]` (Closing Payment Amount, Shareholder Loan Payoff, Legal Retainer, **Total Cash Payment to [principal]**).

**Flow of Funds.** `Payer | Recipient | Amount` (bold underlined headers; widths 31.14 / 33.00 / 15.14). Inflows: each capital provider → buyer HoldCo, then `Total Inflows`. Outflows: HoldCo → each seller, the NewCo holdback account, the lender payoff, seller counsel, buyer's accountant, buyer's counsel, the advisor, then `Total Outflows`. Checks in red italic: `Gross Balance` `=D11-D23`, `Balance Sheet Cash To TCC`, `Net Balance` `=D25-D27`. Every amount is a green link, and nothing is typed twice.

**Wire Info.** `Name | Entity | Wire Information | Wire Amount | Confirm Date` (col D 71.9 wide, multi-line bank details). Wire Amount links to Flow of Funds. Confirm Date is a blue input, with a conditional fill `F7CAAC` when `TODAY()-F5>365` (a stale-confirmation flag). Seller rows are shaded `D9F2D0`, and a phone call-back contact per payee sits in col H (a wire-fraud control). The footer is `Total` and a red `Check` against Flow of Funds.

What it lacks at bank level:
- no working-capital true-up line (target vs estimated NWC);
- no escrow vs holdback distinction;
- no per-diem payoff table from payoff letters;
- no closing-date input driving the interest (hard-coded `*7`, `*6`);
- no signature/approval block;
- no version or "as of" stamp.

---

## 7. Formatting system in detail

### 7.1 Fonts

| Use | Font | Size | Style |
|---|---|---|---|
| Body (all TCC tabs) | Arial (often written `arial` lower-case) | 9 | regular. 23,262 cells in the Template, 18,692 in CPM |
| Sheet title B2 | Arial | 12 (analysis tabs); 13–14 (Coral) | bold. Formula-linked to the cover name |
| Subtitle B3 | Arial | 9 | *italic*, "<Purpose> ($000s)". Thin bottom border across the print width |
| Cover | Arial | 26 bold (name) / 20 bold italic ("Diligence Workbook") / 18 italic (date) | centre-across |
| QoE (CDS) | Calibri | 10 | white bold on navy |
| QoE (FDD) | Arial | 8 | white bold on teal |
| Wire sheet | Times New Roman | 11 | inconsistent with the rest |
| Charts | Arial | ~8 | value labels bold |

Row heights are 11.25–12.0 pt for 9 pt text: tight and bank-dense.

### 7.2 Font colour code (the core convention)

| Colour | Hex | Meaning | Template cells | CPM cells |
|---|---|---|---|---|
| Blue | `0000FF` | Hard-coded input / assumption | 459 | 783 |
| Green | `008000` | Link from another sheet | 5,413 | 3,753 |
| Purple | `800080` | Link within the same sheet (carry-forward, repeated input) | 1,704 | 1,724 |
| Black | `000000`/theme 1 | Calculation | ~14,100 | ~8,570 |
| Red | `FF0000` | Check / tie-out rows (italic), open items | 58 | 48 |
| Dark green | `009900` | "…per source" tie-out comparators (QoE `Summary`) | | |

**Print toggle.** Each output tab has a `Print` label and a boxed blue `0/1` cell near row 3 (for example `L3:M3`, `J4`, `N3`, `O3`). A conditional-format rule over the print range (`$M$3=1`) applies a dxf that sets the font colour to *automatic*. One keystroke turns the colour-coded working sheet into an all-black client exhibit. Confirmed in Coral `Proceeds` (dxf `<font><color auto="1"/></font>`).

### 7.3 Fills

| Hex | Where |
|---|---|
| `FFFFCC` | Key totals and KPIs (1,299 cells in the Template, 758 in CPM): Total Revenue, EBITDA lines, Enterprise Value, Total Sources, retention rates |
| `990033` | Cover and appendix top and bottom bars. Chart series |
| `CAEDFB` (accent4 tint 0.8) | Valuation box, median-retention call-outs, data-tab colour |
| `D8D8D8` | Forecast section bands |
| `BFBFBF`/`D9D9D9` | "No data / not applicable" blocks (run-rate lines in historical columns) |
| `F2F2F2` | QoE subtotal and margin rows (FDD) |
| `D9F2D0` / `8ED873` (accent6 tints) | Sensitivity base-case row, column and cell. Seller rows on the wire sheet |
| `FBE3D6` / `FAE2D5` (accent2 tint) | Extrapolated assumption years (economic forecast). Deck and divider tab colour |
| `324E6B` + `C1E5F5` | CDS QoE header / sub-header |
| `165A58` + `F2F2F2` | FDD QoE header / subtotal |
| `C55A11` + `FBE5D5` | "Reported to Adjusted Sales Bridge" header |
| `F7CAAC` | Conditional flag (stale wire confirmation) |

### 7.4 Borders and rules

- **Subtitle rule:** thin bottom under B3 across the full print width.
- **Header:** tier 1 thin bottom (centre-across); tier 2 thin top and bottom.
- **Subtotal:** thin top on label and figures.
- **Key total:** thin top plus **double bottom**, with `FFFFCC` fill.
- **S&U block heads** (`Uses`, `Sources`): **medium** bottom.
- **History / LTM / projection divider:** **dotted** vertical borders around the LTM column.
- **QoE subtotals:** **dashed** bottom on the last detail row (FDD).
- **KPI blocks:** thin box around the block (the "Average # of Associations…" block, valuation boxes, retention call-outs).
- **Reviewer flags:** red rectangles drawn around individual cells in populated versions (CPM p14: Bid Job Income 899, Computer/Software 150–246, Other Expenses 570). They are mark-ups, not part of the style.

### 7.5 Number formats (exact strings, by frequency)

| Format | Use |
|---|---|
| `#,##0;\(#,##0\);"–";@` and `#,##0;\(#,##0\);"–"` | Body rows ($000s): ~10,300 cells in the Template |
| `[$$]#,##0;\([$$]#,##0\);"–";@` | First row and total rows (the dollar sign appears only there) |
| `[$$]#,##0.0;\([$$]#,##0.0\);"–"` | $M (S&U) and $ per door |
| `#,##0%;\(#,##0%\);"–"` / `#,##0.0%;…` / `#,##0.00%;…` | Growth, margin, rates |
| `_(0.0\x_)_)_';_(\(0.0\x\)_'_';_("–"_)_%;_(@_)_%` | Multiples (S&U) |
| `[$-409]mmm\-yy;@` | Period headers (`Dec-24`) |
| `[$$]#,##0.00;\([$$]#,##0.00\);"–"` | Funds flow (to the cent) |
| `_(* #,##0_);_(* \(#,##0\);_(* "-"??_);_(@_)` | QoE tabs (accounting format with hyphen zero) |

Zero displays as an **en dash `–`**, negatives in parentheses, and there is no red for negatives (one stray `[Red]` format on Coral totals).

### 7.6 Layout grid

- Column A is a gutter, 1.6–1.9 wide.
- Column B holds labels: 38.8 (P&L), 28.7 (S&U), 43–44 (forecast).
- Number columns are 8.6–10.8. Spacers are 0.8–0.9 (QoE) or 3.0–3.6 (forecast).
- Line items are indented with `indent=1`, not with leading spaces.
- Gridlines are off on every output tab. Zoom varies 83%–239% (unmanaged).
- The title chain runs `B2 = Cover!B24`, but many tabs daisy-chain to the previous tab's B2 instead (`='Top 20 Customers'!B2`).

### 7.7 Cover, dividers, navigation

- **Cover** (print `B2:Q39`, landscape, fit to page, scale 88): row 2 `990033` band (13.5 pt), row 4 black medium rule (6 pt row), thin rules F:M at rows 23 and 28 framing the title block, rows 24–26 title / subtitle / date, row 38 medium rule, row 39 `990033` band, logo image anchored at M34.
- **Appendix** repeats the cover with the target's logo. `Raw Data-->` and `Appendix>>` are blank divider tabs.
- **No TOC, no disclaimer page, no version log.**

### 7.8 Print setup

- Print areas are set on every output tab as `B2:<last col><last row>`, with multi-range areas where one tab holds several exhibits.
- Fit to page is on for 26 of 50 visible CPM tabs. Orientation: portrait for statements, landscape for wide grids. Scales run 55–99. Margins are Excel defaults 0.7 / 0.7 / 0.75 / 0.75.
- **No headers or footers on any tab** (0 of 50): no page numbers, no "Confidential", no draft stamp, no file name or date.

### 7.9 Charts

- 9 charts per diligence workbook. Series colours: `C00000` and `990033` dominate, then `FF0000`, `78ADDE`, black.
- All charts have value labels on. None has gridlines.
- Line charts carry no value axis. Legend sits at the bottom, Arial.
- One metric per chart, under a bold section heading with a bottom rule ("Software Expense", "Bid Job Income").
- Benchmark bar charts add a dashed black average line and a star-shape annotation ("Denotes Texas MCs").

---

## 8. What is weak and should be elevated

1. **Workbook hygiene is poor.**
   - 40,571 defined names in the Template, 5,752 of them `#REF!`. Most are legacy bank junk: `AAB_GSPPG` = "Goldman Sachs PPG Chart Utilities 1.0g", `wrn2` "Valuation Summary", `rod1` "LBO".
   - 1,526 cell styles, 30 named styles (`Normal 2 2`, `Comma 3 2` …).
   - External links to personal paths (`/Users/…/Downloads/MelissaTemplate.xlsx`, a `.xlsb` FDD databook, a prior `v16.5`), carried in 380 and 3,437 formulas respectively.
   - A generated AMB model must start from a clean workbook, with a short list of named ranges and no external links.
2. **The template ships broken.** 7,913 cached `#DIV/0!` in the Template: growth and ratio formulas are unguarded (`=D15/C15-1`), and only `Revenue Detail` uses `IFERROR`. Sensitivity axes contain duplicates (CPM "92.5%" and "13" each appear twice because `G87` repeats `R167`). `LOI EBITDA Recon` labels the Other Considerations block "Pro Forma Adjustments / Pro Forma Adjusted EBITDA" a second time.
3. **Typos in tab and exhibit names:** `Economic Forcast`, "MTB Forcast", "Valuation Consideraton", "stratagy", "exisiting", "assocations", "performanced", "repoprt", "Willaim". AMB output must be spell-checked; a top bank would never ship a tab name with a typo.
4. **Period labels and as-of dates drift** (§3). There is no single "as of" or LTM-end input that drives every header.
5. **No balance-sheet diligence**: no NWC, debt-like items, proof of cash, capex or FCF / cash conversion (§4.6).
6. **The QoE is pasted, not integrated.** Three visual languages sit in one book (TCC Arial 9 / CDS Calibri 10 navy / FDD Arial 8 teal). The adjustment taxonomy also changes between the databook (i/ii, A–C, 1–5, PF, OC) and the house summary (RR / PF / Run-Rate). AMB should render the adjustments schedule in its own style, with one taxonomy end to end.
7. **Hard-codes in link colour.** S&U (Deck) `D19:F19` Adj. EBITDA are typed values (2.37 / 2.167 / 2.201) in green, which falsely signals a link. `Other Expenses` is a plug (`=C49-SUM(C43:C47)`) without a label saying so.
8. **Navigation:** no TOC or index with hyperlinks, no sheet-level source notes ("Source: QuickBooks P&L export, FY22–TTM Mar-25"), no version log, inconsistent zoom.
9. **Print polish:** no headers or footers, no page numbering, no confidentiality legend, Times New Roman on one tab.
10. **Colour of charts.** Pure `C00000`/`FF0000` reds read as alarm colours. AMB's maroon `7B0000` with a restrained secondary is better.

---

## 9. Best patterns to adopt in AMB's new model template

Ranked by value to the "top-tier bank, not AI-generated" goal.

1. **Four-tier adjusted-EBITDA waterfall with codes and a definitions panel.**
   - Tiers: Reported → **Definitional** (interest, taxes, D&A: EBITDA by definition) → **Management** (seller-proposed add-backs, codes A, B, C…) → **Diligence** (AMB's own view, which can *disallow* management items, codes 1, 2, 3…) → **Pro Forma / Run-Rate** (PF1…) → **Other Considerations** (OC1…, shown but not added).
   - Each tier has a subtotal, an adjusted EBITDA line and a margin line.
   - Next to the table sits a one-paragraph-per-code definitions block written as *mechanism → quantum → source tab*.
   - In the sell-side setting, keep "Management" as the seller's recast and "Diligence" as AMB's normalisation. That separation is what makes a CIM's adjusted EBITDA credible to buyers.
2. **Formula-driven bracket numbering** (`=CONCAT("[",A16,"]")` from a hidden counter column), plus a **category tag on every adjustment**: `[Owner compensation]`, `[Non-recurring]`, `[Discretionary]`, `[Cash to accrual]`, `[Timing]`, `[Non-operating]`, `[Run-rate]`. Map the tags from `addbacks.csv` `type`.
3. **GL-level databook with multi-key mapping columns** (source account, AMB category, summary line, adjustment subtable) and `SUMIFS` summaries keyed on row labels, with a red `Check` row on every summary tying back to the databook and to "per source" totals.
4. **Layered column blocks.** `Reported | Reclassification | Reclassed | Adjustments | Adjusted | PF | PF Adjusted | % of revenue`, each FY + LTM + YTD PY/CY with monthly detail to the right. Keep reclassifications (presentation) separate from adjustments (earnings), as the FDD bridge does.
5. **Font colour code plus Print toggle**, already in AMB's style: blue input, green cross-sheet, purple in-sheet, black calc, red check. Keep the 0/1 `Print` cell and the conditional format that blacks out colour for PDFs.
6. **Total and rule grammar.** Subtotal = thin top. Key total = bold + `FFFFCC` + thin top + double bottom. Section heads underlined. Line items indent 1. Italic `% Growth` / `% Margin` under each total. Dotted vertical rules isolate the LTM column. `n.q.` for non-quantified cells. Grey fill for not-applicable blocks.
7. **Number formats exactly as listed in §7.5**: en-dash zeros, parentheses negatives, `$` on first and total rows only, `0.0x` multiples, `mmm-yy` headers, units stated in the subtitle "(\$000s)".
8. **Two-tier period headers with centre-across-selection** (not merged cells), and period headers built from one as-of input with `EOMONTH`.
9. **Commercial KPI blocks** (boxed): customer count and $ roll-forwards with gross and net dollar retention, cohort triangles, top-20 concentration with "Top 20 Total / Remaining / Total", size buckets, revenue per unit. These are the analyses a bank CIM's "Customers" section is built from.
10. **"Discussion Topics" boxes.** In the diligence workbook, keep them as the open-questions list. In the CIM, invert them into *"Key observations"*: two to four factual sentences tied to the numbers on the page. This is the antidote to generic prose.
11. **S&U with multiples of each EBITDA definition** (`x LOI EBITDA | x Adj. EBITDA | x PF EBITDA | % Total`) and a Notes block for structure terms (earn-out trigger, seller note, retention bonus).
12. **Funds-flow chain** as a closing-support module: `Sources & Uses` → `Proceeds` (price to closing cash, with a Notes column) → `Flow of Funds` (Payer / Recipient / Amount, every amount linked, Gross/Net Balance checks) → `Wire Info` (confirmation date with a >365-day stale flag and a call-back contact column). Add an NWC true-up line, escrow vs holdback, closing-date-driven per-diem interest and a sign-off block.
13. **Sensitivity grids** with the base case highlighted by fill (`D9F2D0` row and column, `8ED873` centre), built as live data tables or explicit formulas, with deduplicated axes.
14. **Cover and divider pages** in the TCC/AMB grammar: brand bar top and bottom, medium rules, name 26 / subtitle 20 bold italic / "As of" 18 italic, logo bottom right. Add what TCC lacks: a linked **Contents** sheet (tab, purpose, hyperlink), a **Notes & Sources** sheet, and footers ("Confidential – Prepared by AMB Advisory Services", page x of y, file name, as-of date).

### Suggested tab spine for the AMB model (derived from the above)

`Cover` → `Contents` → `Summary` (one-page KPIs, adjusted EBITDA bridge, valuation box) → `Adj. EBITDA` (four-tier waterfall + definitions) → `P&L Summary` (FY / LTM / YTD, with `Check` rows) → `Revenue Detail` → `Expense Detail` → `Gross Margin` → `Adjustments Detail` (monthly, by code and category) → `NWC` → `Debt & Debt-Like` → `Proof of Cash` → `Customers` (concentration, retention, cohort) → `Forecast` (optional) → `Valuation / S&U` → `Appendix` divider → `Databook` (GL-level, mapping columns) → `Raw Data -->` divider → source extracts.
