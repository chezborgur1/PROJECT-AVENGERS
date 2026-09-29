# Project Ridgeline: open questions before the materials go out

The CIM is a draft while anything under "Confirm with the seller" is open: each item prints in the deck as a red [Confirm: …] (guide 4.7).

## Confirm with the seller
- [ ] Federal tax returns for the fiscal years shown (shown as [Confirm: available])
- [ ] Whether the software subscriptions and their data transfer to a buyer (shown as [Confirm: transfer])
- [ ] Whether each loan is repaid by the Seller at closing, so the vehicles and equipment transfer free of liens (shown as [Confirm: repaid by the Seller at closing])
- [ ] Principal's name and title for the contact block (guide Q6) (shown as [Confirm: contact])
- [ ] Target LOI date (shown as [Confirm: date])
- [ ] Target signing date (shown as [Confirm: date])
- [ ] Hours a week the owner spends on each duty (Estimating large replacements, Commercial relationships, Vendor terms, Hiring): the owner responsibilities table is left out until the Seller gives these
- [ ] Who assumes each of the owner's duties after closing (Estimating large replacements, Commercial relationships, Vendor terms, Hiring): the owner responsibilities table is left out until the Seller gives these
- [ ] What transition support the owner gives for each duty (Estimating large replacements, Vendor terms, Hiring): the owner responsibilities table is left out until the Seller gives these
- [ ] The pricing basis of each service line (Residential service and replacement, Commercial service, Maintenance agreements; flat rate, contract, time and materials): the column is left out of the service lines table until the Seller gives it
- [ ] When buyers see customer names (for example, in the data room after a management meeting): the customer pages say only that names are coded
- [ ] Contractor licenses held by the Company or its technicians (state and trade, with numbers), for the operations page
- [ ] Form 4562 depreciation detail for the fiscal years shown, to replace the depreciation proxy behind the capital reserve [S3]
- [ ] The supporting document for [S4] Payroll taxes and benefits on owner compensation
- [ ] Results after Dec-25, including 2026 year to date, for the deck: the basis of preparation says they are not included
- [ ] Maintenance-agreement renewal rate (about 82%) and offer rate (about 35% of service calls) are the owner's estimates: confirm both against ServiceTitan membership reports and give the measurement period.
- [ ] The 1,450 member count is as of the intake call (September 2026): confirm the count at Dec-25 so revenue per member uses matching periods.
- [ ] Market salary of about $95,000 for a replacement general manager is the owner's estimate: confirm the basis (survey, local postings or a recent hire).
- [ ] Plumbing service (added in 2019): which revenue line records it and its FY2025 revenue.
- [ ] Lead sources: share of FY2025 leads from referrals, Google reviews and paid channels, to support the marketing lever.
- [ ] Vehicle loans: confirm whether the 20 vehicles transfer free of liens with the loans repaid by the Seller at closing.

## Adjustments to review
- [ ] [N6] Vehicle expenses (for review), proposed: Flagged for review: Vehicle costs may include the owner's personal use beyond the $51.0K already listed (FY2023, FY2024, FY2025). Account total $101.2K in FY2025. Amount 0 until an advisor enters it. Not in Adj. EBITDA until accepted in adjustments.csv.
- [ ] [N7] Fuel (for review), proposed: Flagged for review: Vehicle costs may include the owner's personal use. Account total $58.8K in FY2025. Amount 0 until an advisor enters it. Not in Adj. EBITDA until accepted in adjustments.csv.
- [ ] [N8] Legal & professional fees (for review), proposed: Flagged for review: Check for one-time legal or consulting work beyond the $24.0K already listed (FY2024). Account total $17.2K in FY2025. Amount 0 until an advisor enters it. Not in Adj. EBITDA until accepted in adjustments.csv.
- [ ] [N9] Meals & entertainment (for review), proposed: Flagged for review: Meals & entertainment are often partly personal. Account total $12.6K in FY2025. Amount 0 until an advisor enters it. Not in Adj. EBITDA until accepted in adjustments.csv.
- [ ] [M1] After-hours emergency plumbing, proposed: Calls after 7 pm are turned away today; no revenue from an after-hours service is included in any figure above, per management. Memo only: shown on the Adj. EBITDA tab, never added.
- [ ] Accepted on management representation only, and footnoted as such in the CIM: [N1] Owner's personal vehicle; [N3] Owner family phones and meals; [S2] Market replacement compensation. Supporting documents would let them print as documented.
- [ ] Accepted with the supporting document still to come: [S4] Payroll taxes and benefits on owner compensation (Statutory rates on the P&L Payroll Expenses : Officer Compensation account; payroll register employer detail to be requested).

## Debt-like items to clear (guide 5.6 standard list)
Listed as Open on the Debt-Like Items tab: no source shows a balance, which is not the same as none.
- [ ] Lines of credit and revolvers: confirm none is outstanding at close.
- [ ] PPP or EIDL balances: confirm none is outstanding at close.
- [ ] Capital leases: confirm none is outstanding at close.
- [ ] Shareholder loans: confirm none is outstanding at close.
- [ ] Accrued interest: confirm none is outstanding at close.
- [ ] Unpaid bonuses and payroll taxes: confirm none is outstanding at close.
- [ ] Accrued income taxes: confirm none is outstanding at close.
- [ ] Tax liens: confirm none is outstanding at close.
- [ ] Deferred capex: confirm none is outstanding at close.
- [ ] Aged payables over 90 days: confirm none is outstanding at close.
- [ ] Related-party payables: confirm none is outstanding at close.
- [ ] Known litigation: confirm none is outstanding at close.
- [ ] Personal guarantees: confirm any the seller has given (memo only, never deducted).

## Data issues to resolve
- [ ] The financials end at Dec-25, 273 days before this run: request the P&L and balance sheet year to date through Aug-26, so the model can add YTD and LTM columns (guide 5.2).
- [ ] Bank transactions 2025 (checking).csv: $167,878 of transfers / loan proceeds / owner contributions excluded from deposits.
- [ ] FY2025 bank deposits are 99% of reported revenue ($2,995,188 vs $3,040,800). Within the usual range.
- [ ] [S3] capital reserve is a proxy (Three-year average of depreciation expense, FY2023–FY2025) because no Form 4562 is in the sources. Request Form 4562 to replace it.

## Data that would add CIM sections
The CIM leaves a section out rather than print a gap (guide 3.3). Each reason names the trigger that failed; where it is missing data, supplying it brings the section in on the next run.
- S3.1 Market size and share: No sourced market inputs (guide Q24)
- S3.2 Competitive landscape: Fewer than three named competitors in the notes
- S3.3 Demand drivers: No sourced demographic or sector series in the request data
- S4.5 Key-customer detail: No customer at 10% of revenue and the top 5 below 35%
- S4.6 Contracts, pricing and backlog: No contract terms, price history or backlog in the request data
- S4.7 Demand profile: No POS or invoice-level data
- S5.4 Owner role and transition: The notes fill 1 of the owner responsibilities table's 12 cells (hours, successor, transition support); the duties are named in the buyer table and the gaps are open questions
- S5.6 Labor model normalization: No contractors in core roles and no family members paid off market in the sources
- S6.5 Revenue and EBITDA walk: No price or volume drivers in the sources
- S6.6 Gross vs net revenue: Pass-through revenue below 10% of total
- S7.4 Reconciliation between sources: No material difference between sources
- S7.5 Rate- or price-linked earnings: No rate- or commodity-linked revenue in the sources
- S9.1 Opportunity sizing: None of the 5 growth levers has both a baseline and a benchmark or management target to size it; ask the Seller for a target per lever
- S9.2 Management projections: No management budget or forecast in the sources (guide Q14)
- S11.3 Detailed retention and cohorts: No segmented retention tables in the request data
- S11.4 Coded customer list: 62 customers, above the 60 the appendix lists
- S11.5 Market rent comparables: Premises not owner-held

## Standard review
- [ ] Review the Assumptions tab inputs (blue font): growth, cost drivers, valuation multiples and deal terms are defaults until replaced with the seller's guidance and the comps source
- [ ] Check the Mapping tab for accounts mapped by default, and that every Databook account reads TIES OUT
- [ ] Read the CIM against the intake notes and source documents; every fact must trace to the seller or the financials
