# Project Ridgeline (Ridgeline Comfort Services LLC): run summary

Request REQ-0001, P1. Generated 2026-09-29 18:33 UTC.

## Deliverables
- Project Ridgeline - Financial Model v01.xlsx: 38 tabs, All checks OK.
- Project Ridgeline - CIM.pptx: 21 pages, a draft until its 21 open questions are resolved. Copy: the source folder's reviewed cim-copy.fixture.json (no API key set).
- Project Ridgeline - CIM.pdf
- Project Ridgeline - CIM pages/: 21 page images
- open-questions.md

## Deal profile
- Mode: Main Street: PF Adj. EBITDA before the capital reserve is $452,525 (PF Dec-25) against the $1,000,000 threshold (guide Q7).
- Deal form: asset purchase (Intake notes: the owner prefers an asset sale; the Main Street default agrees).
- Periods: monthly books, 36 months to Dec-25; as of 2025-12-31; fiscal year ends in December; accrual basis.

## Headline numbers
| | FY2023 | FY2024 | FY2025 | PF Dec-25 |
|---|---:|---:|---:|---:|
| Revenue | $2,406,800 | $2,718,600 | $3,040,800 | $3,040,800 |
| Gross profit | $1,468,000 | $1,670,700 | $1,881,900 | $1,881,900 |
| Reported EBITDA | $158,200 | $214,640 | $319,515 | $319,515 |
| SDE | $370,584 | $462,490 | $561,775 | $561,775 |
| Adj. EBITDA | $194,534 | $286,440 | $385,725 | $385,725 |
| Adj. EBITDA margin | 8.1% | 10.5% | 12.7% | 12.7% |
| PF Adj. EBITDA | $194,534 | $286,440 | $385,725 | $385,725 |

Valuation, deal structure and sensitivities are on the workbook's internal tabs; none of them enters the CIM.

## Sources
- FY2023: P&L from QuickBooks export; balance sheet from QuickBooks export
- FY2024: P&L from QuickBooks export; balance sheet from QuickBooks export
- FY2025: P&L from QuickBooks export; balance sheet from QuickBooks export
- Structured intake facts: intake.json in the source folder.
- Reconciliation between sources: 12 line comparisons, 0 above the 2% threshold.

| File | Used as |
|---|---|
| Bank transactions 2025 (checking).csv | Bank transactions (deposit cross-check) |
| QuickBooks Balance Sheet FY23-FY25.csv | QuickBooks balance sheet export (FY2023, FY2024, FY2025) |
| QuickBooks Profit and Loss FY23-FY25 (monthly).csv | QuickBooks P&L export (36 months) |
| QuickBooks Profit and Loss FY23-FY25.csv | QuickBooks P&L export (FY2023, FY2024, FY2025) |
| addbacks.csv | Seller add-backs (superseded by adjustments.csv) |
| adjustments.csv | Adjustments schedule (6 rows) |
| cim-copy.fixture.json | CIM copy fixture (used when no API key is set) |
| customers.csv | Customer list (62 customers) |
| intake-notes.md | Intake notes |
| intake.json | Structured intake facts |
| kpis.csv | Operating metrics (10) |
| mapping-overrides.csv | Account mapping overrides |
| payroll.csv | Payroll register (29 people) |

## Model
- Verification: 11,567 formulas evaluated independently; 11,390 cells and named outputs compared with the engine: 0 errors, 0 mismatches, 0 lint findings.
- Render check (C37): 31 tabs rendered; smallest body text 7.2 pt; nothing past the margin, cut at a cell edge or overlapping; no empty or widow page, no block split at a break; no stretched row.
- Tabs: Cover, Contents, Summary, Assumptions, P&L Summary, Adj. EBITDA, Adjustments, Revenue Detail, Revenue Charts, Expense Detail, Expense Charts, Customer Overview, Customer Retention, Retention Charts, Concentration, Cohorts, Headcount, Headcount Charts, Balance Sheet, NWC, Debt-Like Items, Cash Flow, Proof of Cash, Projections, Opportunities, Valuation, Deal Structure, Sensitivities, Checks, Data -->, Monthly P&L, Databook, Mapping, Raw - P&L, Raw - BS, Raw - Bank, Raw - Customers, Raw - Payroll.
- Modules built: S4.1 Customer overview, S4.2 Retention, S4.3 Cohorts, S4.4 Concentration, S5.2 Headcount and compensation, S5.3 Retention and tenure, S6.4 Monthly trend and seasonality, S7.3 Owner compensation and SDE, S8.1 Summary balance sheet, S8.2 Net working capital, S8.3 Capex and cash conversion, S9.1 Opportunity sizing, Proof of Cash, Chart tabs (guide 5.12).
- Not built: S7.4 Reconciliation between sources (No material difference between sources).
- Not built: Real Estate (No Real Estate tab (premises leased from a third party)).

### Checks (guide 5.7): All checks OK

| ID | Check | Tab | Status | Note |
|---|---|---|---|---|
| C01 | Databook ties to each raw export, every subtotal and period | Databook | OK |  |
| C02 | Monthly P&L category totals equal Databook, every month | Monthly P&L | OK |  |
| C03 | Every P&L Summary line equals the grid's months in its window, recomputed as months to its end less months before its start | P&L Summary | OK | Each line's SUMIFS against two SUMIFs of the grid that bound the same window |
| C04 | P&L Summary Net Income equals Monthly P&L Net Income | P&L Summary | OK |  |
| C05 | Reported EBITDA equals Net Income + D1:D3 | Adj. EBITDA | OK |  |
| C06 | Adjustments schedule totals by tier equal the ladder | Adj. EBITDA | OK |  |
| C07 | Balance sheet balances (A = L + E), every period | Balance Sheet | OK |  |
| C08 | NWC lines tie to the balance sheet | NWC | OK |  |
| C09 | Cash flow ending cash equals balance-sheet cash | Cash Flow | OK |  |
| C10 | Projection balance sheet balances; projection cash ties | Projections | OK |  |
| C11 | Sources equal Uses | Deal Structure | OK |  |
| C12 | Customer revenue total vs P&L revenue (flag if variance > 2%) | Customer Overview | OK | Difference is the variance as a share of P&L revenue |
| C13 | Payroll register total vs P&L payroll (flag > 5%) | Headcount | OK | Register staff wages against the P&L wage accounts, as a share of the accounts |
| C14 | Revenue vs bank deposits (flag > 5%) | Proof of Cash | OK | Deposits less revenue for the months with bank data, % of revenue |
| C15 | No error values on any output tab | Checks | OK | SUMPRODUCT(--ISERROR()) over every output tab |
| C16 | Every period label equals its derived value | P&L Summary | OK | Every period label is a formula on Assumptions |
| C17 | No volatile functions (TODAY, NOW, OFFSET, INDIRECT) anywhere | Checks | OK | Writer-side lint: verifyWorkbook scans every formula |
| C18 | No hard-coded number inside a formula grid | Checks | OK | Writer-side lint: verifyWorkbook scans every formula grid |
| C19 | Every debt-like balance is removed from NWC, and only those: none counted twice (deferred revenue and deposits included) | Debt-Like Items | OK | Debt-like items less the balances NWC removes at the latest date |
| C20 | NWC peg built from >= 12 month-ends | NWC | n.a. | Year-end balance sheets only: monthly balance sheets required for a peg |
| C21 | Every chart-data row equals its source row for the same months | Revenue Charts | OK | Chart-data rows link their source by month; mixes sum to total revenue |
| C22 | Chart lint: ranges, names, colours, axes | Revenue Charts | OK | Writer-side lint: verifyWorkbook reads every chart part |
| C23 | Tie Out: Consideration vs. Deal Structure, per Offer Comparison column | Offer Comparison | n.a. | Offer Comparison needs two or more structure columns |
| C24 | Tie Out: value by source vs. offer equals zero per column | Offer Comparison | n.a. | Offer Comparison needs two or more structure columns |
| C25 | Every shared-assumption row on Offer Comparison has Variance = 0 | Offer Comparison | n.a. | Offer Comparison needs two or more structure columns |
| C26 | Every IRR helper strip has a negative and a positive flow | Offer Comparison | n.a. | Offer Comparison needs two or more structure columns |
| C27 | Annual mode: Total Expenses is a sum; Net Income ties to the return | P&L Summary | n.a. | Monthly mode |
| C28 | Loan principal >= 0, every loan and scenario | Valuation | OK | Difference is the most negative principal, if any |
| C29 | Low, Mid and High differ on revenue growth and at least one operating driver | Assumptions | OK |  |
| C30 | Each sensitivity grid's centre cell equals the model's base case | Sensitivities | OK | Centre cell of each grid less the model's base case |
| C31 | Rent roll sq. ft. equals GLA | Real Estate | n.a. | No Real Estate tab (premises leased from a third party) |
| C32 | In-place rent equals the P&L rent line for the owner-occupied suite | Real Estate | n.a. | No Real Estate tab (premises leased from a third party) |
| C33 | Consolidated value equals Business + Real Estate; no typed constants | Real Estate | n.a. | No Real Estate tab (premises leased from a third party) |
| C34 | Every LTM-strip month equals the Monthly P&L cell for that category and month | Revenue Detail | OK | Strip cells are links to Monthly P&L |
| C35 | Strip first visible month = EOMONTH(AsOfDate,-12)+1 and last = EOMONTH(AsOfDate,-1)+1 | Revenue Detail | OK | Strip headers chain from AsOfDate |
| C36 | EffectiveDate <= LOIDate + ExclusivityDays; business day; every term string non-empty | Deal Structure | n.a. | LOI date not set |
| C37 | Render check: print scale floors, no page cut at the margin | QA | OK | 31 tabs rendered; smallest body text 7.2 pt; nothing past the margin, cut at a cell edge or overlapping; no empty or widow page, no block split at a break; no stretched row |

## CIM
21 pages against the Main Street target of 20–28, without section dividers (guide 3.4). Copy lint: 0 issues.

### Pages

| Page | Section | Module | Also carries |
|---:|---|---|---|
| 1 | Front matter | S0.1 Cover |  |
| 2 | Front matter | S0.2 Disclaimer & Confidentiality Notice |  |
| 3 | Front matter | S0.3 Contents |  |
| 4 | Executive summary | S1.1 Company at a glance |  |
| 5 | Executive summary | S1.2 Investment considerations |  |
| 6 | Executive summary | S1.3 Financial snapshot |  |
| 7 | Executive summary | S1.4 Considerations for buyers |  |
| 8 | Company overview | S2.2 Services and revenue model | S6.2 Revenue analysis; S2.1 History and milestones |
| 9 | Company overview | S2.3 Operating model and unit economics | S2.4 Locations and facilities; S2.5 Technology and systems |
| 10 | Customers | S4.1 Customer overview | S4.4 Concentration |
| 11 | Customers | S4.2 Retention | S4.3 Cohorts |
| 12 | Operations and people | S5.1 Organization and management | S5.2 Headcount and compensation; S5.3 Retention and tenure; S5.5 Operations and suppliers |
| 13 | Financial performance | S6.1 Income statement summary |  |
| 14 | Financial performance | S6.3 Gross margin and cost structure |  |
| 15 | Financial performance | S6.4 Monthly trend and seasonality |  |
| 16 | Adjusted EBITDA | S7.1 Adjusted EBITDA reconciliation |  |
| 17 | Adjusted EBITDA | S7.2 Adjustment support | S7.3 Owner compensation and SDE |
| 18 | Balance sheet and cash flow | S8.1 Summary balance sheet | S8.2 Net working capital; S8.3 Capex and cash conversion |
| 19 | Transaction process | S10.1 Transaction overview | S10.2 Process and next steps |
| 20 | Appendix | S11.1 Basis of preparation and definitions |  |
| 21 | Appendix | S11.2 Detailed income statement (monthly) |  |

### Left out, and why (guide 3.5)

| Module | Section | Outcome | Reason |
|---|---|---|---|
| S3.1 Market size and share | Market | omitted | No sourced market inputs (guide Q24) |
| S3.2 Competitive landscape | Market | omitted | Fewer than three named competitors in the notes |
| S3.3 Demand drivers | Market | omitted | No sourced demographic or sector series in the request data |
| S4.5 Key-customer detail | Customers | omitted | No customer at 10% of revenue and the top 5 below 35% |
| S4.6 Contracts, pricing and backlog | Customers | omitted | No contract terms, price history or backlog in the request data |
| S4.7 Demand profile | Customers | omitted | No POS or invoice-level data |
| S5.4 Owner role and transition | Operations and people | omitted | The notes fill 1 of the owner responsibilities table's 12 cells (hours, successor, transition support); the duties are named in the buyer table and the gaps are open questions |
| S5.6 Labor model normalization | Operations and people | omitted | No contractors in core roles and no family members paid off market in the sources |
| S6.5 Revenue and EBITDA walk | Financial performance | omitted | No price or volume drivers in the sources |
| S6.6 Gross vs net revenue | Financial performance | omitted | Pass-through revenue below 10% of total |
| S7.4 Reconciliation between sources | Adjusted EBITDA | omitted | No material difference between sources |
| S7.5 Rate- or price-linked earnings | Adjusted EBITDA | omitted | No rate- or commodity-linked revenue in the sources |
| S9.1 Opportunity sizing | Growth opportunities | omitted | None of the 5 growth levers has both a baseline and a benchmark or management target to size it; ask the Seller for a target per lever |
| S9.2 Management projections | Growth opportunities | omitted | No management budget or forecast in the sources (guide Q14) |
| S11.3 Detailed retention and cohorts | Appendix | omitted | No segmented retention tables in the request data |
| S11.4 Coded customer list | Appendix | omitted | 62 customers, above the 60 the appendix lists |
| S11.5 Market rent comparables | Appendix | omitted | Premises not owner-held |

### Build notes (copy fallbacks, trims, column balance)
- S1.1 overview: prose shortened to fit its box (106 words to 88)
- S1.1: the note line shortened to keep the notes band to three lines
- S1.2: the note line shortened to keep the notes band to three lines
- S5.1: the note line shortened to keep the notes band to three lines
- S1.4: 91 words of commentary (floor 120, spec 9)
- S4.1: 102 words of commentary (floor 120, spec 9)
- S6.1: 112 words of commentary (floor 120, spec 9)
- S6.4: 69 words of commentary (floor 120, spec 9)
- S7.2: 69 words of commentary (floor 120, spec 9)
- S8.1: 89 words of commentary (floor 120, spec 9)
- S6.1: set a table at 8 pt to fit the page

## Warnings
- Bank transactions 2025 (checking).csv: $167,878 of transfers / loan proceeds / owner contributions excluded from deposits.
- FY2025 bank deposits are 99% of reported revenue ($2,995,188 vs $3,040,800). Within the usual range.
- [S3] capital reserve is a proxy (Three-year average of depreciation expense, FY2023–FY2025) because no Form 4562 is in the sources. Request Form 4562 to replace it.
