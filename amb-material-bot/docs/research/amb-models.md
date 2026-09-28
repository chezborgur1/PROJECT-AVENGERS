# AMB's own financial models: conventions, mechanics, and what to elevate

Research slice: AMB's own models. Written 2026-09-27 from the read-only reference library at
`/home/user/project-avengers/references`. Nothing in the library was changed. Every hex code,
width, and label below was read from the files with openpyxl, and the layouts were checked
against LibreOffice renders (the render list is in section 14).

**Files covered**

| File | Size | Tabs | Formulas | Role |
|---|---|---|---|---|
| `03) AMB Dataroom/01) Diligence Workbook/AMB + Topkey - Diligence Workbook v51.xlsx` | 1.96 MB | 58 | 36,733 | The main deal workbook: buy-side pre-LOI analysis of Keystone Bookkeepers for Topkey |
| `…/_Archive/…Workbook.xlsx` (v1), v3, v10, v22, v33, v45, v50 | 0.23 to 1.77 MB | 10 to 56 | n/a | Skimmed for how the workbook grew |
| `…/AMB + Topkey - Valuation & Offer Structure.xlsx` | 0.82 MB | 5 | 8,399 | Spin-off of the offer tabs, sent as "Offer Structure Overview" |
| `…/Keystone Combined P&L v2.xlsx` | 77 KB | 4 | 3,117 | Earlier standalone version of the consolidated monthly P&L |
| `02 Monica Kennedy - Investor Dataroom/01 Diligence Workbook/AMB + Sunshine Commercial - Diligence Workbook v7.xlsx` | 224 KB | 8 | 1,251 | Main Street deal: laundromat (SDE) plus commercial real estate (cap rate) |
| `03 AMB Advisory - Company Dataroom/In Progress Reports/Corsair_Plaza_NOI_Bridge.xlsx` | 13 KB | 3 | 32 | Rent roll to NOI bridge. Off-brand, looks machine-generated |
| `03) AMB Dataroom/accounting-firm-acquisitions.xlsx` | 1.0 MB | 1 | 0 | Scraped database of 5,749 accounting-firm listings and SBA loans (a comps source) |
| `03) AMB Dataroom/Keystone Workbook Formula Review (v6).pdf` | 3 pp | n/a | n/a | QA memo on workbook v6, "Prepared by Claude for Frank Moneymaker" |

---

## 1. Summary

**What AMB does (the house style to keep)**

- **One look, used since v1.** Sheets use Arial 9. Row 2 carries the company name (13pt bold, linked to the Cover) and row 3 an italic subtitle such as "Summary P&L Overview ($000s)" with a thin rule under it. Header bands are dark maroon **#7B0000** with white bold text, and the period group sits centred above the period label. Section rows use light pink **#FFE1E1**. Key totals use pale yellow **#FFFFCC** with a thin box around each column group. The cover uses maroon **#990033** bars and the AMB logo (maroon **#9E0A20**).
- **The backbone is one monthly grid.** Raw QuickBooks P&L exports go into a consolidated monthly P&L. A "Summary Account" column maps each QuickBooks line to an AMB category, and a "Personal?" column flags owner expenses. Every period column (FY, YTD, LTM, PF) is a `SUMIFS` over the monthly grid, bounded by two helper date rows at the bottom of the sheet.
- **Standard period set:** `FY2024 | FY2025 ‖ July'25 YTD | July'26 YTD ‖ Jul'25 LTM | Jul'26 LTM | Jul'26 PF ‖ Delta ($) | Delta (%)`. Blocks are separated by 0.9-wide spacer columns. "PF" means annualised run rate at the latest month.
- **Two-stage recast:** Net Income, then Reported EBITDA, then Adj. EBITDA (personal add-backs), then **Near-Term Adj. EBITDA** (owner comp reset and immediate savings), then **Steady-State Adj. EBITDA** (normalised staffing and platform savings). Every PF assumption has a one-line rationale in the next column.
- **Deep operating diligence for a Main Street deal:** client roll-forwards by count and by dollars, with regrettable, non-regrettable, and unclassified churn; top-20 concentration; staffing economics (clients per bookkeeper, cost per client, payroll as % of revenue); employee retention and tenure; software spend by vendor; a tech-stack savings case.
- **Serious offer mechanics:** partnership (partial rollover) against a 100% buyout; a sliding-scale earnout; stock consideration with dilution; MOIC and IRR for both sides; break-even thresholds and cushions; downside cases; 7-point sensitivity grids with a 10-band green heat map.
- **Print-ready tabs.** Each tab has a "Print" 0/1 toggle. At 1, a conditional format turns the blue, green, and purple font coding black, so the tab can go to the counterparty as a PDF. Tabs carry print areas and fit-to-page. The "Target Materials" folder holds these single-tab PDFs.

**What is weak (to fix in the new templates)**

- The workbook is 58 tabs with no index and no master checks page, and target-supplied data packs are pasted in with their own styles.
- Palettes are mixed: maroon on the analysis tabs, navy #1F4E78 on the Combined P&L, #1F3864 on target tabs, gold row highlights on HR tabs. Fonts are too: 18,503 cells say `arial`, 18,270 say `Arial`, and **5,590 say `Arail`** (a typo, so Excel falls back to another font).
- Live formula defects in v51: the monthly "Total Adj. Revenue" row adds the Income Tax row, so every month returns 0. Monthly near-term adjustments leave out a row the summary columns include. Margin denominators are inconsistent. The YTD window is unbounded. Two findings from the v6 formula review are still open. All 52 defined names point to `#REF!`.
- Hardcodes sit in output tabs. Offer inputs were broken off their links and typed in, with comments saying "was linked to…". Values are pasted across files. The dates use `TODAY()`, so the "As of" date and tenure drift every day the file is opened.
- **Parallel models disagree.** The Topkey pre-deal valuation is $50M in v51 and $60M in the Valuation file. Topkey's annual net client wins are 65 in one and 130 in the other.
- Add-backs are not a schedule. They are not numbered, have no category, no "source / support" column, and no status. Their support sits in one-line notes and cell comments.
- There is no balance sheet, working capital, cash flow, sources & uses, seller note, or debt schedule on the Keystone deal. Sunshine models financing only inside its assumptions list.

---

## 2. Workbook architecture

### 2.1 v51 tab list, in order (58 tabs)

The order is output first, then analysis, then data. Arrow-named divider tabs split off the data.

| # | Tab | Type | What it does |
|---|---|---|---|
| 1 | **Cover** | Brand | Two maroon bars (#990033), thick black rules, target logo, "Keystone Bookkeepers / Pre-LOI Business Analysis / As of 09/27/26", AMB logo at bottom right. Landscape, print area B2:Q39 |
| 2 | **Offer Overview** | Offer | "Offer & Equity Upside Scenarios ($000s)": offer price (run rate × multiple), components, Topkey post-money, Ben's ownership %, 2.0x/3.0x growth scenarios, growth needed for parity, and an assumption table with a "Rationale" column |
| 3 | **Ben's Partnership Model** | Offer | Newest tab (v51). The Partnership Analysis rebuilt with its own inputs: 5-year rollover model, earnout, break-even, dilution, downside cases, liquidity, cash flows |
| 4 | **Condensed P&L** | Buyer data | Topkey's own monthly P&L (May to Aug 2026), pasted in accounting format with a grey YTD column and a "Check Balance" row. Green tab (#92D050) |
| 5 | **Offer Comparison** | Offer | "Offer Comparison — Partnership vs. 100% Buyout ($000s)". Columns: Partnership, 100% Buyout, Variance. Three print pages |
| 6 | **Partnership Analysis** | Offer | "Partnership Rollover Scenarios ($000s)". Value / Year-5 columns plus a formula-driven "Rationale / Notes" column (col F, width 108.9) |
| 7 | **Partnership Sensitivity Tables** | Offer | Five pages of 7×9 grids (rollover % × Topkey growth, net client wins, Keystone multiple), heat-mapped |
| 8 | **100% Buyout Analysis** | Offer | "Valuation Growth Scenarios ($000s)": the same engine for the full buyout with a cash earnout |
| 9 | **P&L Overview** | Financials | "Summary P&L Overview ($000s)": the one-page income statement with adjustments (see 3.3) |
| 10 | **Software Overview** | Analysis | "Software Utilization Overview ($)": clients, properties, and average fee by Bill Pay, trust software, PMS, and expense tool, for current, former, and total clients |
| 11 | **Earnings Sensitivity Table** | Valuation | "Earnings & Valuation Sensitivity ($000s)": EV at EBITDA multiple × bookkeeper load, and EBITDA at comp × load |
| 12 | **P&L Overview (Target Version)** | Financials | The same P&L without the adjustments block. This is the version shared with the seller |
| 13 | **P&L Forecast** | Engine | "Pre-LOI P&L Forecast ($000s)": summary columns plus the 31-month grid (Jan-24 to Jul-26), EBITDA bridge, adjustments, and the PF assumption block |
| 14 | **Expense Charts** | Charts | "Monthly Expense Trends ($000s)": 4 bar(+line) charts |
| 15 | **Tech Stack** | Analysis | "Tech Stack Overview ($000s)": target vendors (VR Platform, Karbon, Uncat, Xenett) with LTM spend, internal cost, savings, Topkey revenue; top 10 vendors (80% of $462K); bar chart |
| 16 | **Revenue Analysis** | Analysis | LTM Jul'25, LTM Jul'26, PF, then 12 LTM months; revenue mix %; month-on-month growth |
| 17 | **Revenue Charts** | Charts | "Monthly Revenue Trends ($000s)" |
| 18 | **Expense Analysis** | Analysis | Payroll by line: $, % of revenue, % growth, in the same LTM/PF/monthly layout |
| 19 | **Client Overview** | Analysis | "Active Client Overview (#, $)": breakdown by client type, portfolio averages, fee bands, assumptions with rationale, and a reference/tie-out block |
| 20 | **Client Retention** | Analysis | "Client Retention Analysis": count roll-forward by segment, FY2023 to FY2025, YTD2026, LTM Sep'26, and monthly Jan-25 to Sep-26 |
| 21 | **Customer Retention Charts** | Charts | Wins vs. losses bars by month |
| 22 | **Client Retention $** | Analysis | The same roll-forward in annualised fees ($000s) |
| 23 | **Client Retention Charts $** | Charts | |
| 24 | **Client Concentration** | Analysis | "Client Concentration — Top 20 Active Clients ($000s)": annual fees, % of total, properties, tenure, and the bookkeeper, client lead, and manager on each account |
| 25 | **Employee Overview** | Analysis | "Staffing Overview ($000s)": headcount and average pay by role, P&L wages FY24/FY25/LTM against the active-roster run rate, deltas, % of revenue |
| 26 | **Employee Retention** | Analysis | Employee roll-forward (hires and inactive) by team, with department load |
| 27 | **Adj. Employee Retention** | Analysis | The same, adjusted |
| 28 | **Steady-State Staffing** | Analysis | Monthly clients per employee, cost per client, staff cost as % of client revenue |
| 29 | **Tenure Charts** | Charts | Tenure by inactive cohort |
| 30 | **Employee Retention Charts** | Charts | (Titled "Client Retention Charts" by mistake) |
| 31 | **Yearly Employee Wins & Losses** | Analysis | 2026 losses and hires: title, dates, tenure in months, termination type |
| 32 | **Raw Data** | Divider | Empty, red tab (#C00000) |
| 33 | **Employee Data -->** | Divider | Empty, pink tab (#FFE1E1) |
| 34-39 | Combined Employee Worksheet, Headcount & Compensation, Inactive Employees, Employee Mapping, Employee Summary, Owner Mapped P&L | Data | Roster built from two exports; title → summary title → P&L account mapping |
| 40 | **Customer Data -->** | Divider | |
| 41-46 | Full Customer List, Missing End Dates, Client Departures, Revenue by Customer, Customer List w Software, Customer List Mapping | Data | Customer-level monthly revenue, start and end dates, regrettable flag, type mapping |
| 47-52 | README, Summary, Monthly Trend, New & Lost Revenue, Recurring vs Total, Definitions | Target data pack | Keystone's own anonymised revenue pack, "Prepared 2026-08-28", pasted in as-is |
| 53 | **Financial Data -->** | Divider | |
| 54 | **Combined P&L** | Data/engine | "Consolidated Income Statement ($000s)": QuickBooks chart of accounts × months, mapping columns, tie-out block |
| 55 | **Software** | Target data | Software vendor schedule (navy #1F3864 styling) |
| 56-58 | **Raw - 2024 PL**, **Raw - 2025 PL**, **Raw - 2026 PL** | Raw | QuickBooks "Profit and Loss" exports by month, values only, frozen at B6 |

### 2.2 Data flow

```
Raw - 20xx PL (QuickBooks, $)
   └─► Combined P&L ($000s = raw/1000; col C "Summary Account", col D "Personal?")
          └─► P&L Forecast (SUMIFS on Summary Account → monthly grid P:AT → FY/YTD/LTM via date-bounded SUMIFS; PF from the assumption block)
                 ├─► P&L Overview / P&L Overview (Target Version) / Revenue Analysis / Expense Analysis / charts
                 └─► Earnings Sensitivity ─► Offer tabs (run-rate revenue, avg revenue per client)
Headcount & Compensation / Combined Employee Worksheet ─► Employee Overview ─► P&L Forecast PF payroll
Full Customer List ─► Client Retention (#, $) ─► Steady-State Staffing ─► P&L Forecast contribution margin, normalised staffing
```

### 2.3 How the workbook grew (archive skim)

| Version | Tabs | What was added |
|---|---|---|
| v1 | 10 | Cover, P&L Overview, P&L Forecast, Combined P&L, Revenue Analysis, Revenue Charts, `Raw Data -->`, three Raw P&Ls. The maroon/pink/yellow style is already fully in place |
| v10 | 14 | Expense Analysis, Expense Charts, Customer List, Software |
| v22 | 33 | P&L Overview (Target Version), Employee Overview, Headcount & Compensation, Tech Stack, Client Overview, Client Retention, retention charts, the target's data pack |
| v33 | 46 | Client Retention $, Employee Retention, Tenure, Yearly Wins & Losses, a leftover `scrap` tab, Owner Mapped P&L |
| v45 | 56 | Offer Overview, Offer Comparison, 100% Buyout, Partnership Analysis, Valuation Growth Tables, Software Overview, Earnings Sensitivity, Client Concentration, Adj. Employee Retention, Steady-State Staffing |
| v50 → v51 | 56 → 58 | Ben's Partnership Model, Condensed P&L (Topkey) |

51 saved versions in about four weeks. Versioning is by file name (`v51`), with no change log inside the workbook. v1 had a label bug (the non-recurring subtotal read "Total Recurring Revenue") and an LTM window anchored to June. Both were fixed later.

---

## 3. Historicals layout and the recast

### 3.1 Source and consolidation (`Combined P&L`)

- The rows are the target's QuickBooks chart of accounts, verbatim, with QuickBooks' own subtotals: "Income Tax Revenue … Total Income", "Cost of Goods Sold … Gross Profit", "Expenses → General & Admin Expenses … Total Expenses", "Net Operating Income", "Other Income", "Other Expenses", "Net Income". Header fill is navy #1F4E78 and section rows are #D9E1F2, so this tab is off-palette.
- Column B is the Line Item (width 40). **Column C is the "Summary Account"** (width 24.7): the AMB category each line rolls into, such as "STR Subscription", "Bookkeeper Wages", "Software & Apps - COGS", "Other Expenses". **Column D is "Personal?"** (width 18.3): an add-back tag such as "(+) Utilities" or "(+) Home Office Expense". Columns C:D are grouped at outline level 1.
- Columns E:L hold the period columns and N:AR hold the monthly grid (Jan-24 to Jul-26, `mmm-yy`). Monthly cells are `='Raw - 2026 PL'!H8/1000`, so the unit is $000s.
- Period columns use `=SUMIFS($N8:$AR8,$N$5:$AR$5,">"&E$116,$N$5:$AR$5,"<"&E$117)`. The period bounds sit in helper rows 116-117 at the bottom: a start date (blue input) and `=EOMONTH(start,12)`.
- **Tie-out block** (rows 120-166): for FY2024, FY2025, and FY2026 YTD, it shows "Combined ($)", "Raw Tab Total ($)", and "Diff ($)" for nine subtotals (Total Income through Net Income). A "Status" column returns `=IF(AND(ABS(F122)<0.05,…),"TIES OUT","CHECK")`.

`Keystone Combined P&L v2.xlsx` is the earlier standalone version. It has the same rows, but its FY columns are plain `=SUM(G:R)` blocks rather than date-bounded SUMIFS, and there is no mapping column yet.

### 3.2 Engine (`P&L Forecast`, "Pre-LOI P&L Forecast ($000s)")

Layout: B = label (width 33.9); C:D = FY2024, FY2025; F:G = July'25 YTD, July'26 YTD; I:J = Jul'25 LTM, Jul'26 LTM; K = Jul'26 PF; M:N = Delta ($), Delta (%); P:AT = monthly Jan-24 to Jul-26 (headers `=EOMONTH(prev,0)+1`, format `mmm-yy`). Spacer columns E, H, L, O are 0.9 wide.

- Monthly cells pull from the Combined P&L by category: `=SUMIFS('Combined P&L'!N:N,'Combined P&L'!$C:$C,'P&L Forecast'!$B7)`.
- Personal add-backs pull on the "Personal?" column: `=SUMIFS('Combined P&L'!N:N,'Combined P&L'!$D:$D,$B82)`.
- Period columns: `=SUMIFS($P7:$AT7,$P$5:$AT$5,">"&C$199,$P$5:$AT$5,"<"&C$200)`. Row 199 holds the start dates (blue inputs, or purple where chained) and row 200 holds `=EOMONTH(start,12)`.
- The PF column is `=+C111`, and so on: it links to the "PF Annualization Assumptions" block in rows 109-191. Delta ($) is `=K-J` (PF less LTM) and Delta (%) is `=IFERROR(K/J-1,0)`.
- Check: row 71, "Tie Out" in red italic, is `=C68-'Combined P&L'!E114` for every column.

Revenue is split into **Recurring** (STR Subscription, Occupancy Taxes, SMB Subscription, Onboarding, Topkey Subscription, STR Bill Pay, Controller Services, Historical Cleanup) and **Nonrecurring** (Profit Share, 1099 Filing, Income Tax, Billable Expense Income, Offshore Recruiting). The subtotals give "Total Run-Rate Revenue", then "(+) Unclassified Active Client Revenue", then "Total Adj. Revenue". Expenses are grouped as Payroll (9 lines), Software (4 lines: COGS, G&A, Topkey, AI tools), and Overhead (18 lines).

### 3.3 The recast ladder (rows 68-107), with PF Jul'26 values in $000s

| Row | Label (verbatim) | FY24 | FY25 | Jul'26 LTM | Jul'26 PF |
|---|---|---|---|---|---|
| 68 | Net Income | 145.5 | 131.0 | 103.3 | 50.7 |
| 73-77 | **EBITDA Bridge**: (+) Amortization, (+) Taxes, (+) Interest | | | | |
| 78 | Reported EBITDA | 159.7 | 149.1 | 116.4 | 63.8 |
| 81-83 | **Personal Expenses**: (+) Home Office Expense, (+) Utilities | | | | |
| 84 | Adj. EBITDA | 160.8 | 155.1 | 122.3 | 69.7 |
| 87-92 | **Near-Term Adjustments**: (-) Go-Forward Owner Compensation (−119.9 PF), (-) Onboarding Manager (−116.2), (+) Other Professional Fees (+72.6), (+) Karbon, Uncat, & Xenett Savings (+96.8), (+) Unclassified Active Client Contribution (+50.7) | | | | |
| 95 | Near-Term Adj. EBITDA | (49.2) | 44.5 | 75.0 | 53.6 |
| 98-103 | **Steady-State Adjustments**: (-) Onboarding Revenue (−25.9), (+) Onboarding Team Wages (+49.3), (+) Normalized Bookkeeper Staffing (+220.1), (+) VR Platform Cost Savings (+143.2), (+) S&M Wages (+28.2) | | | | |
| 106 | Steady-State Adj. EBITDA | (49.2) | 44.5 | 75.0 | 468.6 (15.2% margin) |

**How add-backs are presented and sourced**

- The signed prefix convention runs throughout: `(+)`, `(-)`, `(x)`, `(/)`. Examples: "(/) Target Load", "(x) Average Compensation".
- Owner comp is **reset to a market go-forward level**, not simply added back. Row 88 is `=$C$168+C$35`, where C168 is `=-'Headcount & Compensation'!L10/1000` (−$228K, "Current all-in comp when factoring in distributions"). That cell's note reads "Payroll $108,245 annualised plus $120,000 of draws taken outside payroll".
- Steady-state items are built from operating analyses rather than typed in. Normalised bookkeeper staffing is `Current Bookkeeping Clients (177) (/) Target Load (8) = 22.1 bookkeepers (x) Average Compensation ($12.3K)`, compared with actual bookkeeper wages. VR platform savings are `VR Platform Cost (-) Topkey Replacement Cost`, with the replacement cost pro-rated off the "Keystone Replacement Cost −12.1 … according to Ben". The contribution margin is `=1-'Steady-State Staffing'!AB35`.
- Support is a **single rationale line in column D** of the assumption block. These are verbatim and cover every PF line:
  - "Annualized most recent month" (most recurring revenue, payroll, and software lines)
  - "Sold to former employee in August 2026" (SMB Subscription)
  - "Annualilized [sic] the Dec'25 - July'26 average (period with increased onboarding staffing)" (Onboarding)
  - "Account appears to have been reclassified" (Historical Cleanup)
  - "Conservative approach for nonrecurring items" (set to 0)
  - "Active employee roster" (Indirect Labor, Bookkeeper Wages)
  - "Additional owner comp addressed in year-one adjustments"
  - "Assuming no material change" (overhead = LTM)
  - "One-time software development cost" (Other Professional Fees added back)
  - "Estimated cost - pending Ben's approval" (Onboarding Manager)
  - "Pending Topkey Confirmation" (VR replacement cost)
- Cell comments carry open questions, for example "Consider how to best give PF credit in consideration for the actual client income".
- **Two audiences, two P&Ls.** `P&L Overview` (internal) shows the "P&L Adjustments" block and Near-Term and Steady-State Adj. EBITDA. `P&L Overview (Target Version)` stops at Net Income / % Margin, and its "Other Revenue" and "Other Expenses" rows are plugs (`=total − SUM(named lines)`).

On the P&L Overview the adjustment rows are regrouped as: "Karbon, Uncat, & Xenett Savings", "Other Professional Fees", "Unclassified Active Client Contribution", "Definitional EBITDA Adj." (D&A, taxes, interest), "Personal Expenses", "Onboarding Manager", "Go-Forward Owner Comp", then "Total Near-Term Adjustments". Next come "Normalized Bookkeeper Staffing", "VR Platform Cost Savings", "Onboarding Team Wages", "S&M Wages", "Onboarding Revenue", then "Total Steady-State Adj.".

### 3.4 PF (run-rate) method

- Recurring revenue lines use `=AT7*12`: the latest month (Jul-26) × 12.
- Onboarding uses `=AVERAGE(AM10:AT10)*12`: the Dec-25 to Jul-26 average × 12.
- Profit Share uses `=AVERAGE(AI17:AT17)*12`.
- Nonrecurring revenue is 0, except 1099 Filing, which is held at LTM.
- Payroll comes from the active roster (`'Employee Overview'!K7`) or the latest month × 12.
- Overhead is held at LTM (`=+J48`).

The result: Total Run-Rate Revenue of $2,998.5K PF against $2,552.5K LTM (+17%), and Total Adj. Revenue of $3,092.5K after "Unclassified Active Client Revenue" (`='Client Retention $'!F13 − K24`).

---

## 4. Analyses AMB builds

| Analysis | Tab | Row structure / method |
|---|---|---|
| Revenue mix and trend | Revenue Analysis | Revenue ($000s) by line, then "Recurring Revenue % Total", then "Recurring Revenue % Growth" (month on month). Columns: LTM Revenue (July'25, July'26), PF July'26, then "LTM Monthly Revenue" Aug-25 to Jul-26 |
| Payroll / wage analysis | Expense Analysis; Employee Overview | Payroll ($000s), "Payroll % Total Revenue", "Payroll % Growth". Employee Overview has roles (Bookkeeper, Client Lead, Onboarding Support, Onboarding Specialist, Tax, Sales & Marketing, CEO, Accounting Manager, Admin, Leadership) × Count, Average, FY2024, FY2025, July'25 LTM, July'26 LTM, Active Roster, LTM Delta, Team Growth, Run-Rate Comp, Run-Rate Delta. Team rows "% Bookkeeping Revenue" and "% Onboarding Revenue" tie wages to the revenue they serve. The "Adjustments" block covers CEO Distributions, Onboarding Manager Hire, Employee Benefits, S&M Rev Share |
| Staffing economics | Steady-State Staffing | Monthly Jan-25 to Sep-26: Client Base (Avg. Non-Tax Clients, Avg. Annual Fee), Avg. Headcount, Avg. Annualized Compensation, Avg. Client Load Per Employee, Cost Per Client, % of Avg. Client Revenue. Feeds the normalised-staffing add-back |
| Client retention (#) | Client Retention | Blocks for Total; Property Manager, STR Owner & Short-Term Rental; Property Manager; and others. Each block: Starting Count, (+) Client Wins, (-) Regrettable Losses, (-) Non-Regrettable Losses, (-) Unclassified Losses, (-) Total Client Losses, **Ending Count**, **Avg. Clients**, **New Client Growth**, **Client Churn** (= losses ÷ average clients). Columns FY2023, FY2024, FY2025, YTD2026, LTM Sep'26, then Jan-25 to Sep-26. Built with `COUNTIFS` on the Full Customer List start/end dates and the regrettable flag |
| Revenue retention ($) | Client Retention $ | The same roll-forward in annualised fees ($000s): Starting Fees, wins, losses, Ending Fees, Avg. Fees, Avg. Annual Fees Per Client, New Revenue Growth, Revenue Churn. There is no NRR or GRR line |
| Client portfolio | Client Overview | Active clients by type (Property Manager 147, STR Owner 30, Tax-Only 11, Small Business 2 = 190), with Properties, Monthly Fees, Annualized Fees ($3,092,524), Avg. Fee per Client and per Property, % of Fees; portfolio averages (average fee $1,356, median $973, tenure 1.5 years); fee bands from "Under $500" to "$10,000 and Above" |
| Concentration | Client Concentration | Top 20 by annual fees: $998K = 32.3% of $3,093K. Largest client $110K = 3.6%. Includes operating metrics and team responsibility columns |
| Software / tech stack | Software Overview; Tech Stack | Utilisation by software category. Tech Stack: LTM vendor spend $462K, top 10 = 80%, VR Platform $161K = 35%. "Tech Opportunity" table gives Keystone Savings and Topkey Revenue |
| Employee retention and tenure | Employee Retention, Tenure Charts, Yearly Employee Wins & Losses | Employee roll-forward with "Department Load" (clients per employee). Tenure in months = days/30. Voluntary vs. involuntary |
| Earnings sensitivity | Earnings Sensitivity Table | EV = (Steady-State Adj. EBITDA + current normalised cost − clients/load × comp) × multiple, over a grid of load (5-9) × multiple (5.0-9.0x). Base 7.0x, load 8.0 → $3,280K. Base cell in bold on #FFFF00. A reference block lists the observed load (FY2025 7.4, LTM 5.3, peak 11.2) |

Charts sit on their own tabs next to the analysis they belong to. They use 8pt Arial, gap width 70, maroon #7B0000 bars, data labels on, no gridlines, and no value axis. Wins use theme green #70AD47. Churn splits use #7B0000 / #FF0000 / #FFC1C1. The "% of recurring revenue" overlay is a thin #00B0F0 line. Each chart gets an underlined bold 9pt caption such as "Monthly Bookkeeper Wages (Jan'24 - July'26)".

---

## 5. Valuation and offer-structure mechanics

### 5.1 Valuation basis

- **Keystone (services firm): a revenue multiple.** Offer Overview: "Note: Total Valuation is calculated as 1.0x run-rate July'26 recurring revenue". Run rate $2,998.5K × 1.0004x = $3.0M. Three multiples are carried: "Keystone Initial Revenue Multiple 1.00x", "Scaled Revenue Multiple 1.25x" (standalone Year 5), and "Software-Integration Revenue Multiple 2.00x" (partnership Year 5). Implied EBITDA multiples are backed out as a cross-check: "(x) Steady-State Margins" 15% → 8.3x standalone, 20% → 10.0x partnership.
- **EBITDA-multiple cross-check:** Earnings Sensitivity uses a base of 7.0x on Steady-State Adj. EBITDA.
- **Comps:** `accounting-firm-acquisitions.xlsx` has 5,749 rows. Sources: Accounting Practice Sales 3,938, SBA 7(a) loans 724, Poe Group 564, Naab 274, ProHorizons 107. Statuses: sold 4,477, sba-acquired 724, active 448. Fields: revenue, asking_price, multiple, cash_flow, practice_type, reason_for_sale, and SBA lender and match confidence. Computed from it: the median sold multiple is **1.14x revenue** (IQR 1.06-1.23x, n=3,824), **1.15x** for firms at or above $1M revenue (n=344), and 1.15x for bookkeeping practices (n=919). That supports the 1.0x anchor. The file is a raw scrape with snake_case headers, a dark header (#16211B), Calibri, and a filter left on showing 19 rows. No AMB workbook links to it.
- **Sunshine (Main Street):** the laundromat is valued at **SDE × 3.0x**, with an "EBITDA Bridge" (Net Income, (+) Debt Servicing, (+) Depreciation, (-) Capital Reserve, (+) Taxes, Adj. EBITDA, (+) Owner Compensation, SDE, DSCR) and Low / Middle / High pro forma. The real estate is valued at NOI ÷ cap rate (8.0-10.0% in 0.5% steps), with a rent-comps table (14 properties: Average $16.13/sf base against the target's $7.25/sf) and an NNN build. The two are summed in "Valuation Overview": Current Valuation, Clearing Price, NNN Valuation, Base-Rate Valuation, less "(-) Asking Price" ($1,600K), giving "Delta".
- **Corsair:** an NOI bridge from the rent roll: Scheduled Rent, less Vacancy (5%), gives EGI; less the non-recoverable opex (management fee 6%, insurance, legal) gives NOI; less reserves ($0.20/sf capital, $0.15/sf TI/LC) gives cash flow before debt service. It states "Do not sum these onto one blended NOI". The laundromat stays on a separate SDE track.

### 5.2 Offer structure (Keystone, Valuation & Offer Structure file)

| Component | Partnership | 100% Buyout |
|---|---|---|
| Keystone Value Today (100%) | $3,000 | $3,000 |
| Ben's Rollover % — Keystone | 30% | – |
| Keystone Stake Acquired by Topkey | 70% | 100% |
| Cash at Close | $650 | $500 |
| (+) Topkey Equity Issued to Ben | 1,450 | 2,500 |
| (+) Target Cash Earnout (at 100% Achievement) — Year 3 | – | 500 |
| **Total Consideration Paid by Topkey** | **$2,100** | **$3,500** |
| % of Consideration in Cash (incl. Earnout) | 31% | 29% |

- **Equity rollover:** Ben keeps 30% of Keystone, and Topkey buys the other 70% at the same $3.0M value for 100%: "Topkey stake priced at the same $3.0M valuation for 100%". Ben's Topkey ownership = equity issued ÷ post-money (pre-deal + stake − cash). Year 5 ownership = today × (1 − dilution of 5%).
- **Earnout** ("Cash Earnout — Year 3 Keystone Revenue (Sliding Scale)"): Earnout Measurement Year 3. Target = run rate at close plus partnership revenue ramped to the midpoint of a 3-month averaging window. Threshold 80% of target. Payout at threshold 50% of the target earnout, straight-line to 100% at target, capped at 150%. Payout formula: `=IF(C47<C49,0,MIN(C52,C51+(1-C51)*(C47-C49)/(1-C49)))`. A memo line gives the risk-weighted PV (probability 70%, discount 15%): "Memo only; not used in Scenario 2".
- **Returns:** Both parties get MOIC and IRR. IRRs use helper cash-flow strips (Years 0-5, gray font, cols L:Q or rows 207-220) built with boolean-timing formulas such as `=-(L$48=0)*($C$33+$C$34)-(L$48=$L$51)*$C$35+(L$48=$C$7)*$C$53`. The Valuation file gives: Deal MOIC 4.66x / 3.99x; Deal IRR 36.0% / 34.2%; Ben total MOIC 3.03x / 2.78x, IRR 29.1% / 26.6%; "Net Value Created for Ben" $1,594K / $843K against the standalone case.
- **Break-even and cushion blocks:** "Ben's Break-Even — Downside Threshold" gives the partnership multiple, required Topkey Year-5 value, Topkey multiple, net client wins, dilution, and CAGR at which rolling equals keeping 100%. "…Cushion — Base Case vs. Break-Even" gives the headroom in each. A mirror set covers Topkey.
- **Downside cases:** multiple falls to 1.5x; Topkey multiple falls to 12x; net wins fall to 90; Topkey raises more capital (15% dilution); all four combined. The last is "Combined Downside Less Scenario 1" = −$1,763K, with the note "Negative = rollover worse than keeping 100% of Keystone".
- **Liquidity & Control:** % of the stake price paid in cash (31%), minority stake after close, and "Illiquid Share of Ben's Value" (78% today, 93% in Year 5).
- **Not modelled on Keystone:** a sources & uses table, a seller note, bank or SBA debt, escrow or holdback, a working-capital peg, and a tax or net-proceeds waterfall. Sunshine does model financing (15% down, 20-year term at 6.5%; renovation 15% down, 5 years at 9%, via `-PMT()`), plus DSCR and cash-on-cash grids, but inside the assumptions list rather than a sources & uses table.

### 5.3 Sensitivity tables

- **Partnership Sensitivity Tables:** 7 rows × 9 columns. Axes are centred on the model base: rollover midpoint 30% in 5% steps, Topkey growth midpoint in 25% steps. Values are recomputed in closed form in a helper grid (Z:AH) and rounded (`ROUND(x,-2)`). Axis cells are maroon; row labels are rotated. A 10-band green heat map (#63BE7B to #E6F4EA) is driven by helper band numbers (AT columns) against a "$1M hurdle" ("Required Premium vs. Standalone ($000s)" = 1,000). A settings block at rows 430-452 holds midpoints, steps, number of bands, and rounding digits, all as blue inputs.
- **Earnings Sensitivity:** a formula grid, not Excel data tables. The base cell is highlighted #FFFF00.
- **Sunshine:** light-blue grid panels with rotated axis titles ("Net Operating Income Range ($000s)"), hand-drawn red box borders tracing the threshold frontier, and green fill on cells that clear the $1M valuation hurdle ("Note: Cells highligted in green clear the $1M CRE valuation threshhold").

---

## 6. Formatting system (the details)

### 6.1 Sheet anatomy (same on every analysis tab)

| Element | Spec |
|---|---|
| Gutter | Column A width **1.7** (1.3 on offer tabs) |
| Row 2 | Company name, `=+Cover!B24`, **Arial 13 bold** (12 on Sunshine), row height 16.5 |
| Row 3 | Subtitle: "<Tab purpose> ($000s)", **Arial 9 italic**, thin bottom border (auto colour) across the print width. Unit always stated: ($000s), ($), (#), (#, $) |
| Row 3, right | "Print" label and a boxed blue 0/1 input (see 6.4) |
| Row 5-6 | Header band **#7B0000**, **Arial 9 bold white**. Tier 1 = group label with `centerContinuous` ("Full Year", "YTD", "LTM", "PF", "PF Delta", "LTM Monthly Revenue"); tier 2 = the period label, centred. The first column of the band names the table ("P&L Summary", "Deal Assumptions", "Customer Retention") |
| Section row | Bold label, fill **#FFE1E1** across each column group (not spacer columns): "Revenue", "Expenses", "P&L Adjustments", "General Assumptions" |
| Line items | Regular weight, indent 1 (indent 2 in raw) |
| Subtotal | Bold, thin top border, no fill ("Total Payroll Expenses") |
| Key total | Bold, fill **#FFFFCC**, thin box border per column group ("Total Run-Rate Revenue", "Net Income", "Near-Term Adj. EBITDA"). "% Margin" sits below in bold italic inside the same box |
| Spacer columns | Width **0.9** between period blocks |
| Spacer rows | Height **3.95** (5.1 in places) before subtotals and between blocks |
| Label column | 26.7 to 51.4 wide (P&L 28.7-33.9; offer tabs 47.6-51.4) |
| Number columns | 6.4-6.7 on the P&L Overview (dense), 9.1-12.3 elsewhere |
| Gridlines | Off on all analysis tabs; left on in raw/data tabs |
| Zoom | 115-205% (P&L Overview 205, Partnership 160, Offer Comparison 145) |
| Notes | Column D (italic 9) beside assumptions, or a dedicated "Rationale / Notes" column. The Valuation file builds its notes by formula with `ADDRESS()`, e.g. `="Input on Offer Comparison ("&ADDRESS(ROW(…),COLUMN(…),4)&")…"`, so cell references in notes stay correct |
| Footnotes | Italic 9 under the table: "Note: Total Valuation is calculated as…" |

### 6.2 Number formats (by frequency in v51)

| Use | Format | Count |
|---|---|---|
| Body numbers ($000s) | `#,##0;\(#,##0\);"–";@` (en dash for zero, negatives in brackets) | 20,581 |
| Percent | `#,##0%;\(#,##0%\);"–";@` | 3,654 |
| One-decimal numbers (loads, $000 fees) | `#,##0.0;\(#,##0.0\);"–";@` | 3,153 |
| **First row and total rows** | `[$$]#,##0;\([$$]#,##0\);"–";@` ($ only on the first line and totals, the banker convention) | 2,703 |
| Month headers | `mmm-yy` | 1,247 |
| Precise percent | `#,##0.0%;\(#,##0.0%\);"–";@` | 1,119 |
| Multiples | `0.00"x"`, `0.0\x;\(0.0\x\);"–"`, `0.00\x;\(0.00\x\);"–"` | ~230 |
| Dates | `mm/dd/yy;@`, `m/d/yy;@`, `mm-dd-yy` (three variants) | ~930 |

Raw QuickBooks tabs keep the accounting format `_(* #,##0_);_(* \(#,##0\);_(* \-_);_(@_)`. Corsair uses `\$#,##0;"($"#,##0\);\-` (off-standard).

### 6.3 Font colour coding

| Colour | Meaning in AMB's files | Evidence (v51) |
|---|---|---|
| Blue #0000FF | Hardcoded input | 587 constants |
| Green #008000 | Link from another sheet | 5,986 formulas |
| Purple #800080 | Link within the sheet to an input or earlier cell (e.g. `=C7` in the Buyout column copying the Partnership input) | 2,544 formulas |
| Black / theme | Calculation | 20,000+ |
| Red #FF0000 | Placeholder or pending confirmation ("Topkey - Current Monthly Revenue 261", Tech Stack "Internal Cost", Onboarding Manager $116K) and italic red for tie-out checks | 155 constants |
| Gray #808080 | Helper scaffolding (IRR cash-flow strips, "Helper: Year") | 5,019 formulas |

The rule is bent in places. 106 formulas are blue (e.g. `=AT7*12` in the PF block, INDEX/MATCH lookups on HR tabs), and Sunshine uses red for some typed assumptions. Corsair uses its own scheme: blue text on yellow #FFFF00 fill.

### 6.4 The Print toggle

Each output tab has, near row 3 on the right, the text "Print" and a blue, fully boxed 0/1 cell (e.g. P&L Overview Q3, Offer Comparison I3, Partnership Analysis H3). A conditional format covers every data block with the rule `$Q$3=1` and a dxf font colour of **#000000**. At 1, the blue, green, purple, and red coding disappears and the tab reads as a clean client exhibit. It is wired on the P&L Overview, the offer tabs, the sensitivity tables, and Sunshine. The single-tab PDFs in `03) Target Materials/` (e.g. "Keystone Customer Retention Analysis.pdf", 11 pages; "Keystone Offer Scenario Analysis.pdf") are exported this way.

### 6.5 Freeze panes, grouping, tabs, names

- **Freeze panes are effectively unused.** The raw tabs freeze at B6. The frozen panes on analysis tabs look like accidents: P&L Forecast at A145, Combined P&L at A81, Condensed P&L at AP29, Expense Analysis at A7.
- **Grouping:** only Combined P&L columns C:D (outline level 1). There is no row grouping.
- **Tab colours:** only dividers and exceptions. "Raw Data" red #C00000, "… Data -->" dividers pink #FFE1E1, Condensed P&L green #92D050, and on Sunshine red #C00000 for "Tennant View" and "Valuation Overview".
- **Named styles:** Normal, Normal 2-5, Percent, Percent 2, Currency 3 (legacy, unused). **Defined names:** 52, all `#REF!` (`_apr1`, `amparo`, `awqwqw`, `sas`, `CompName`, `PeriodEnd`, …), inherited from some old template.
- No data validation, no hyperlinks, and no page headers or footers anywhere.

---

## 7. Checks

| Check | Where | Form |
|---|---|---|
| Consolidation equals raw export | Combined P&L rows 120-166 | Combined ($) − Raw Tab Total ($) = Diff ($) for 9 subtotals × 3 periods, then "TIES OUT"/"CHECK" at a $0.05 tolerance |
| Engine equals consolidation | P&L Forecast row 71 "Tie Out" | `=C68-'Combined P&L'!E114`, red italic, every column |
| Consideration equals analysis tab | Offer Comparison row 37 | "Tie Out — Consideration vs. Analysis Tab", conditional format flags `ROUND(C37,0)<>0` |
| Value-by-source equals offer | Offer Comparison rows 102 and 111; Partnership Analysis rows 152, 183-185 | "Must equal zero" |
| Client counts and fees equal source | Client Overview "Reference" block | "Tie Out — Client Count by Type less Source (#)", "… Fee Band Fees less Source ($)" |
| Buyer P&L balance | Condensed P&L | "Check Balance" row |
| External QA | Formula Review (v6) PDF | Claude recalculated in LibreOffice (7,914 formulas), checked aggregate range spans, row-pattern consistency, cross-sheet refs, hardcodes in grids, and literal `#REF!`. It found 5 issues (2 High) |

**Gaps.** No master "Checks" tab, no check total on the Cover, no balance-sheet balance check (there is no balance sheet), and no check that the monthly and summary columns agree. That last gap is exactly where the live defects in section 9 sit.

---

## 8. AMB branding in the workbooks

- **Cover** (identical in v51, the Valuation file, and Sunshine): landscape, fit to page, print area B2:Q39. Row 2 and row 39 are solid **#990033** bars across B:Q. Rows 4 and 38 carry a **medium black top border** across B:Q. Thin rules at rows 23 and 28 span E:N. B24 has the company name in **Arial 26 bold**, B25 the document type in **Arial 20 bold italic** ("Pre-LOI Business Analysis", "Offer Structure Overview", "Diligence Workbook"), and B26 `="As of "&TEXT(TODAY(),"mm/dd/yy")` in **Arial 18 italic**. All three are merged B:Q and centred. The target's logo sits centred above the title (Keystone logo image, 3.1M × 2.4M EMU). The **AMB logo** (`xl/media/image1.png`, 550×184 transparent PNG, maroon #9E0A20 wordmark "AMB / ADVISORY SERVICES" with an arrow swoosh) sits bottom right, anchored at columns N-Q, rows 33-37. On Sunshine the AMB logo takes the centre slot.
- Inside the tabs there is **no logo and no footer**. The brand shows only through the palette (#7B0000 headers) and the company name in row 2.
- The logo was copied to `amb-material-bot/brand/amb-logo-workbook.png`, and the style tokens to `amb-material-bot/brand/amb-model-style.json`.
- The current bot (`src/model/workbook.ts`) uses navy `FF1F3A5F` headers, a `FFFFFF00` key fill, and `$#,##0;($#,##0);"-"`. None of that matches AMB. It should move to #7B0000 / #FFE1E1 / #FFFFCC and AMB's en-dash formats.

---

## 9. What is weak and should be elevated

Specific defects and habits found in the files, most important first.

### 9.1 Formula defects still live in v51

1. **`P&L Forecast!P28:AT28` monthly "Total Adj. Revenue" is `=+P26+P19`.** Row 19 is "Income Tax", so every month shows **$0**. The summary columns correctly use `=C26+C24`. The two margin rows are inconsistent too: the monthly Near-Term and Steady-State margins (rows 96 and 107) divide by Total Run-Rate Revenue (row 24), while the summary columns divide by Total Adj. Revenue (row 28).
2. **`P&L Forecast!P93:AT93` monthly "Total Near-Term Adjustments" is `=SUM(P88:P91)`,** which leaves out row 92, "Unclassified Active Client Contribution". The summary columns use `SUM(C88:C92)`.
3. **The YTD window is unbounded.** `P&L Forecast!G200 = EOMONTH(G199,12)` gives 12/31/2026, so "July'26 YTD" is only correct because no data after July exists yet. This was Finding 5 in the v6 review and is still open.
4. **`Revenue Analysis!C46 = SUM(C38:C45)`** adds up growth percentages (v6 Finding 3, still open). The orphan `C52 = 6/30/2024` from Finding 5 is also still there, and C38:C45 hold the text "--" in numeric cells.
5. `Client Retention!Q5` is a typed date (2025-08-01) in the middle of an `EOMONTH` chain. Client Retention holds 8 cached `#DIV/0!`. Client Concentration shows a **negative tenure (−0.1 years, C-323)**.
6. `COUNTIFS`/`SUMIFS` ranges are fixed (`'Customer List w Software'!$B$4:$B$310`), so they silently truncate if the client list grows.
7. All **52 defined names are `#REF!`**, and the named styles are legacy clutter.

### 9.2 Hardcodes and two sources of truth

8. **Offer Overview inputs are typed over links:** C6 2,998.541, C11 1,450, C13 650, C14 3,000, C52 50,000. Each carries a comment such as "Input — AMB base case as of 09/27/26 (was linked to Offer Comparison C36 (cash at close))". The audit trail is good, but the model is now a set of stale copies.
9. **The Valuation file cannot link to v51,** so its "Offer Tool Assumptions" block (C153:C162) pastes run-rate revenue 2,998.541, average revenue per client 16.6315, and the client roll-forward (151 / 83 / −57 / 164) as blue constants.
10. **Four overlapping partnership models** (Offer Overview, Ben's Partnership Model, Partnership Analysis, and the Valuation file) **disagree.** Topkey pre-deal valuation is $50,000K against $60,000K, Topkey net client wins 65 against 130, and "Keystone 5-Yr Revenue Increase — Partnership" 166% against 133%. The v51 Offer Comparison render shows Deal MOIC 5.33x; the Valuation file shows 4.66x for the same label.
11. `TODAY()` drives the cover "As of" date and employee tenure (`=IF(J6=0,TODAY()-I6,J6-I6)`), so outputs change every time the file is opened. Annualised pay is typed (11,400) rather than `=950*12`.

### 9.3 Presentation and hygiene

12. **Palette drift:** maroon #7B0000 analysis tabs, navy #1F4E78/#D9E1F2 on the Combined P&L and its tie-out, #1F3864 on the target Software tab, a dark theme navy bar for the sensitivity group titles, gold #FFF2CC row fill with red data bars on Yearly Employee Wins & Losses, a brown palette on Corsair, and a gray #D9D9D9 section bar on Sunshine.
13. **Font drift:** 18,503 `arial`, 18,270 `Arial`, **5,590 `Arail`**, and 3 Calibri cells.
14. **Print defects visible in the renders:** comment boxes print over the Offer Overview (p.2). Earnings Sensitivity has no print area and is cut off at the right margin (p.31, with the overflow on p.32). Chart tabs cut off after Feb-26 or Apr-26 (pp.52, 68). P&L Forecast has no print area, so it spills across about 18 pages, and the stray "x" navigation markers in column A (A6, A71, A109, A200) print. On Client Concentration the right-aligned tenure numbers run into the left-aligned bookkeeper names ("1.7 Abegail Nunez").
15. **Navigation:** 58 tabs with no contents page, no hyperlinks, and no check summary. Target data packs (README, Summary, Definitions, Software, …) sit among AMB's analysis with their own styles. A chart tab is mistitled ("Client Retention Charts" on the employee charts).
16. **Copy errors and typos in labels:** "Annualilized", "Rennovation", "Tennant View", "Extimated", "highligted", "threshhold", "relabed". The note beside "Normalized Bookkeeper Staffing" reads "Estimated cost for experienced COO" (copy-paste). Person-named rows ("Randy's Valuation", "Monica's Compensation") would not survive into a CIM.
17. **Empty scaffolding in output tabs:** Offer Overview rows 18-19 and 32-33 are blank inputs, and rows 34-48 are an empty gap.

### 9.4 Method gaps compared with a top-tier bank or QoE

18. **Add-backs are not a schedule.** They need a number, category (owner comp normalisation, personal / non-business, non-recurring, run-rate / pro forma, synergy), source document, preparer, status (proposed, seller-confirmed, accepted), and a monthly or annual amount per period. Management-adjusted and diligence-adjusted EBITDA should be separate lines.
19. **No LTM bridge or walk** (FY25 to LTM to PF), no revenue or EBITDA walk chart, and no quarterly view.
20. **P&L only.** There is no balance sheet, net working capital (average NWC peg), capex, free cash flow, or cash conversion. For a Main Street CIM, "cash flow to owner / SDE" is the headline, and it is only done on Sunshine.
21. **No sources & uses, seller-note terms, debt service or DSCR** (on Keystone), **escrow, or seller net-proceeds waterfall.** Earnouts are well built but only on the buy side.
22. **Retention lacks the standard SaaS-style metrics:** GRR and NRR, cohort-by-start-year revenue triangles, and logo vs. dollar churn on one page.
23. **Comps are not used in the models.** The 5,749-row acquisitions database never flows into a valuation tab (no median, IQR, or percentile table, no football field).

---

## 10. What to keep and what to change in the new templates

**Keep (it is recognisably AMB and already bank-grade):**
- The sheet anatomy in 6.1: row-2 company name, row-3 italic subtitle with units and a rule, two-tier #7B0000 header band, #FFE1E1 section rows, #FFFFCC boxed key totals, bold-italic margin rows, 0.9 spacer columns, 3.95 spacer rows, Arial 9, gridlines off.
- The number-format set with `$` only on the first line and totals, and en dash for zero.
- The period set `FY… | YTD | LTM | PF | Delta ($) | Delta (%)` driven by one monthly grid through date-bounded SUMIFS, with the bounds in one visible place.
- The "Summary Account" mapping column and the "Personal?" add-back tag on the consolidated P&L. Raw exports stay values-only, with a tie-out block.
- The Near-Term vs. Steady-State recast, with a rationale line per PF assumption.
- The Print toggle, an internal vs. "Target Version" pair for any page that leaves the building, and formula-built notes that cite cells with `ADDRESS()`.
- Roll-forward tables (Starting, (+) wins, (-) losses by type, Ending, Average, growth %, churn %) for clients, dollars, and employees.
- Centred sensitivity grids with the base cell highlighted and a settings block of steps and midpoints. The 10-band green ramp #63BE7B to #E6F4EA is fine for internal use; use a single-hue maroon or gray ramp for anything client-facing.

**Change (dial it up):**
1. **Tab order:** Cover → Contents & Checks (hyperlinked index, master check status, version / as-of / preparer) → Executive Summary (FY/LTM/PF table plus the EBITDA/SDE bridge plus the valuation range: all tables, no stat tiles) → Assumptions (every input, blue, with a Source column) → Income Statement (summary) → Adjusted EBITDA / SDE (numbered adjustment schedule) → Monthly P&L → Revenue Build → Customers (retention, cohorts, concentration) → Payroll & Headcount → Opex & Software → Balance Sheet & NWC → Cash Flow → Projections → Valuation (multiples plus comps from the acquisitions database) → Offer Structure / Sources & Uses (cash, seller note, earnout, rollover, seller proceeds) → Sensitivities → a `Data -->` divider → Mapping → Raw exports.
2. **One palette, one font name** (`Arial`, exact case), with no navy anywhere. Store the tokens in `brand/amb-model-style.json`.
3. **Adjustment schedule format:** `# | Adjustment | Category | Description / basis | Source | FY-1 | FY | YTD | LTM | PF | Status`, with every row linked into the recast. Split "Reported EBITDA", then "Management-Adjusted EBITDA", then "Diligence-Adjusted EBITDA", then "Pro Forma Run-Rate EBITDA" (Near-Term and Steady-State correspond to the last two).
4. **A fixed as-of date input** on the Assumptions tab. No `TODAY()` anywhere.
5. **Every period window bounded on both ends,** plus an automated check that the monthly grid sums to each summary column, per row.
6. **Print setup on every output tab:** print area, fit to one page wide, repeat title rows, the footer "AMB Advisory Services | Confidential | <tab> | Page x of y", comments not printed, and no navigation markers in printable columns.
7. **Deliberate freeze panes** (below the header band and right of the label column) on grids wider than one screen. Group the monthly columns so the summary view collapses. Define real named ranges for key outputs (`LTM_AdjEBITDA`, `PF_RunRateRevenue`) and for the CIM to pull from.
8. **One offer engine** parameterised by structure (100% cash, cash + seller note, cash + earnout, partial rollover), not four copies.
9. **Write labels in client-grade English.** No person names in row labels, no typos (spell-check the label list in the build pipeline), and "Client" rather than a mix of "Client" and "Customer".

---

## 11. Other files at a glance

- **AMB + Topkey - Valuation & Offer Structure.xlsx:** Cover ("Offer Structure Overview"), Offer Comparison (rows 1-162, three print ranges), Partnership Analysis, Partnership Tables (five print ranges), 100% Buyout Analysis (five print ranges). Same style as v51. 1,054 cells in the #7B0000 band, 239 #FFFFCC. Fonts are cleaner here: 8,828 `Arial` against 684 `arial`.
- **Keystone Combined P&L v2.xlsx:** the Combined P&L with FY2024, FY2025, and July'26 YTD, plus Jan-24 to Jul-26 monthly and the tie-out. Navy #1F4E78 headers, #D9E1F2 section rows, and a `#,##0.0` body format (one decimal, unlike the rest).
- **AMB + Sunshine Commercial - Diligence Workbook v7.xlsx:** Cover; Laundromat Valuation (FY22-FY24 actuals, a right border, then Low/Middle/High pro forma, "% Sales" italic rows under each expense, EBITDA Bridge, SDE, DSCR, Business Valuation, and pro forma assumptions and financing); Sensitivity Analysis; CRE P&L; CRE Valuation; Market Rent Analysis (comps table plus an "Average" row and a yellow "Target Property" row); "Tennant View"; Valuation Overview. Section bars are gray #D9D9D9 rather than maroon, and the tab-colour XML is malformed (openpyxl cannot parse it). Main Street tells: SDE, owner compensation, DSCR, "Randy's Valuation".
- **Corsair_Plaza_NOI_Bridge.xlsx:** Assumptions, Rent Roll, NOI Bridge. Brown #8C4A43 / #5B312B headers, #EAE6E4 totals, yellow #FFFF00 input cells, Arial 10, all-caps "SECTION 1 — NNN UNITS (Tenants 1–4)", arrows ("→ Effective Gross Income (EGI)"), and a banner "ILLUSTRATIVE PLACEHOLDER FIGURES". Nothing in it is AMB house style. Treat it as an example of what not to produce.
- **Keystone Workbook Formula Review (v6).pdf:** a Word-to-PDF QA memo. Title in blue serif, a navy severity table (High in red, Moderate in amber, Low), "Detailed Findings" with the exact formula quoted, and a "Recommended fix" in italic gray. It shows AMB already uses Claude as a model reviewer. The new pipeline's `verifyWorkbook` should cover the same checks automatically: recalculation errors, aggregate-range consistency, row-pattern breaks, hardcodes inside formula grids, and literal `#REF!`.

---

## 12. Quoted phrasing worth reusing in model labels

- Sheet subtitles: "Summary P&L Overview ($000s)", "Pre-LOI P&L Forecast ($000s)", "Consolidated Income Statement ($000s)", "Active Client Overview (#, $)", "Client Concentration — Top 20 Active Clients ($000s)", "Staffing Overview ($000s)", "Steady-State Staffing Analysis ($000s)", "Earnings & Valuation Sensitivity ($000s)", "Offer Comparison — Partnership vs. 100% Buyout ($000s)".
- Row labels: "Total Run-Rate Revenue", "Total Adj. Revenue", "Reported EBITDA", "Adj. EBITDA", "Near-Term Adj. EBITDA", "Steady-State Adj. EBITDA", "% Margin", "Go-Forward Owner Compensation", "Normalized Bookkeeper Staffing", "Starting Count / (+) Client Wins / (-) Regrettable Losses / Ending Count / Avg. Clients / New Client Growth / Client Churn", "Total Consideration Paid by Topkey", "% of Consideration in Cash (incl. Earnout)", "Break-Even Stress Tests", "Liquidity & Control".
- Rationale phrasing: "Annualized most recent month", "Assuming no material change", "Conservative approach for nonrecurring items", "Active employee roster", "Pending Topkey Confirmation", "Memo only; not used in Scenario 2", "Must equal zero".

---

## 13. Numbers for cross-checking any regenerated Keystone model

In $000s. Revenue: FY24 1,135; FY25 1,879; YTD Jul'25 998; YTD Jul'26 1,671; LTM Jul'25 1,524; LTM Jul'26 2,553; PF Jul'26 2,999 (adjusted 3,093). Net Income: 145 / 131 / 104 / 76 / 135 / 103 / 51. Steady-State Adj. EBITDA at PF: 469 (15.2%). Active clients: 190; annualised fees: $3.09M; top 20 = 32.3%. Headcount: 86 active; payroll run rate $1.90M plus adjustments = $2.22M (74% of revenue). Software LTM: $462K. Offer: $3.0M = 1.0x PF run rate. The v6 formula review put the pre-fix LTM Net Income overstatement at about $32K (31%).

---

## 14. Renders inspected

LibreOffice → PDF → PNG at 80 dpi, some regions at 160 dpi. Scratch: `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/amb-models/png/`.

| Render | What it showed |
|---|---|
| v51 p1 (Cover) | #990033 bars, black rules, Keystone logo centred, 26/20/18pt title stack, AMB logo bottom right |
| v51 p2 (Offer Overview) | Maroon bands; yellow boxed totals; **comment boxes printed over the table**; large empty gap mid-page |
| v51 p3 (Ben's Partnership Model) | Assumption list: blue inputs, purple links, yellow boxed "Total Net Client Wins", italic "Check - 5 Year Topkey Valuation Growth" |
| v51 p8 (Condensed P&L) | Topkey's P&L in accounting format with a gray YTD column: a different visual language |
| v51 p12 (Offer Comparison) | Three columns plus Variance; pink section rows; dense single-page "deal sheet" with MOIC/IRR blocks in yellow |
| v51 p20 (Partnership Sensitivity) | 7×9 grids, maroon axes, rotated row titles, green 10-band heat map, dark navy group bar, underlined bold captions |
| v51 p29 and 160-dpi zoom (P&L Overview) | The house style at its best: two-tier header, spacer columns, en dashes, `$` on first and total rows, boxed yellow totals, adjustments block |
| v51 p31 (Earnings Sensitivity) | Grid cut off at the right margin (no print area) |
| v51 p33 (P&L Overview Target Version) | Same page without adjustments, ending at Net Income |
| v51 p34 (P&L Forecast) | Printed "x" marker in column A; tab spans many pages |
| v51 p30 (Software Overview) | Three column groups (Current, Former, Total) with pink sub-headers and boxed totals |
| v51 p52, p68 (charts) | Maroon bars with labels and no axis; green/maroon wins vs. losses; charts cut off at the page edge |
| v51 p60 (Tech Stack) | Vendor tables plus a maroon bar chart with $ labels |
| v51 p61, p63 (Revenue / Expense Analysis) | LTM plus PF plus 12-month grid on one landscape page; mix % and growth % blocks |
| v51 p65 (Client Overview) | Type breakdown, fee bands, assumptions table with "Rationale", italic reference/tie-out block |
| v51 p66 (Client Retention) | Three stacked roll-forward blocks, FY columns, then a monthly strip; very small print at fit-to-page |
| v51 p84 (Client Concentration) | Top 20 table; tenure numbers run into bookkeeper names; negative tenure |
| v51 p85 (Staffing Overview) | Roles × counts, wages, run rate, deltas; "% Bookkeeping Revenue" rows |
| v51 p86 (Employee Retention) | Employee roll-forwards with department load |
| v51 p90 (Steady-State Staffing) | 21-month staffing economics strip |
| v51 p101 (Employee Hires & Offboarding) | Off-palette gold row fill and red data bars |
| Keystone Combined P&L v2 p1 | Navy #1F4E78 header and #D9E1F2 section rows: the off-palette consolidation tab |
| Valuation file p6 | Earnout block (threshold, cap, payout %), then an Offer Structure table with % of Total |
| Sunshine p1-p9 | AMB-logo cover; gray section bars; underlined sub-section labels; "% Sales" italic rows; light-blue sensitivity panels with red frontier boxes and green threshold fills; rent comps with Average and Target rows |
| Corsair p1 | Brown header, yellow input cells, placeholder banner: not AMB style |
| Acquisitions p1 | Raw scrape look (dark header, snake_case, hyperlinked sources) |
| Formula Review (v6) p1 | QA memo layout: blue serif title, navy severity table, High/Moderate/Low colours |
| Target Materials "Keystone Offer Scenario Analysis.pdf" p1 | Confirms single tabs go to the counterparty as PDFs with the AMB cover |

---

## 15. Brand assets written

- `/home/user/project-avengers/amb-material-bot/brand/amb-logo-workbook.png`: the AMB logo exactly as embedded in the workbook covers (550×184, transparent, maroon #9E0A20).
- `/home/user/project-avengers/amb-material-bot/brand/amb-model-style.json`: colours, font colour coding, number formats, and layout measurements for the model templates, marked "observed" vs. "recommended".
