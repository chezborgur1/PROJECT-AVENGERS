# Data contract: dataset, model output and the arithmetic between them

**Status.** The contract the three builders (data layer, model workbook, CIM engine) code against in parallel. Types are in `src/domain/financials.ts` (the extended `FinancialDataset`) and `src/model/types.ts` (`ModelOutput`); the reference dataset is `tests/fixtures/sampleDataset.ts` (`ridgelineDataset()`), checked by `tests/fixtures/sampleDataset.test.ts`. Where this document and the types disagree, the types win; where the guide (`docs/HOUSE_STYLE.md`) and this document disagree, the guide wins and the gap goes in `docs/build/HANDOFF.md`.

**Rules of the road.**

1. Every existing field of `FinancialDataset` and `ModelResult` keeps its meaning. The new blocks are optional and additive.
2. Each optional block has a "present when" rule (section 7). A consumer that finds the block absent falls back to the legacy field or omits the module; it never fabricates.
3. Two implementations of the same arithmetic (engine and workbook, data layer and engine) must agree to the dollar. Section 5 states each rule once; the worked figures in section 6 are what the fixture must produce.
4. Units: the dataset and `ModelOutput` are in **dollars**. The workbook's analysis tabs show $000s by dividing at the Databook (guide 5.2); the CIM formats whole thousands from the engine's dollars. Ties are checked on unrounded values.
5. Sign convention (unchanged): P&L lines are positive magnitudes as a statement presents them; contra lines keep their natural sign. Schedule rows are signed so that **positive raises EBITDA**.

---

## 1. Vocabulary

| Term | Form | Helper | Example |
|---|---|---|---|
| Month key | `"YYYY-MM"` calendar month; sorts as a string | `monthKey(2025, 7)`, `parseMonthKey`, `addMonths`, `monthRange` | `"2025-07"` |
| Fiscal year of a month | The calendar year the month ends in, or the next when the month is after the fiscal year-end month | `fiscalYearOf(year, month, fyEndMonth)` | Jul-26 with FYE June → FY2027 |
| `MonthPeriod` | `{ key, year, month, fiscalYear, fiscalMonth }`; `fiscalMonth` 1–12, 12 closes the year | `monthPeriod(key, fyEndMonth)` | |
| `AsOfDate` | The last day of `asOfMonth`, the last full month of P&L data | `monthEndDate(asOfMonth)` | `"2025-12-31"` |
| Period key | `FY2025`, `M2025-07`, `YTD2025-07`, `LTM2025-07`, `PF2025-07`, `AT2025-12-31` | `periodKey(ref)`, `parsePeriodKey(key)` | keys of `KpiSeries.values` and `ModelOutput.periods` |
| Period label (guide D7) | `FY2025`, `Jul-26`, `YTD Jul-26`, `LTM Jul-26`, `PF Jul-26`, `07/31/26` | `periodLabel(ref)`, `monthLabel(key)` | printed in both deliverables |
| Projection label | `FY2026E` (contract decision; the guide is silent) | | |

`PeriodRef` is the discriminated union behind these: `fiscal_year`, `month`, `ytd`, `ltm`, `pf`, `point`. A `point` is a stock at a date (headcount, members, a balance sheet).

---

## 2. `FinancialDataset`: the extended blocks

The legacy fields (`years`, `pnl`, `balanceSheet`, `provenance`, `lines`, `addbacks`, `suggestedAddbacks`, `revenueMix`, `deposits`, `warnings`) are unchanged and always present. The rest are optional. Every block below names its producer (the data layer unless stated) and its consumers.

### 2.1 Granularity and dates

```ts
fiscalYearEndMonth?: number;        // 12 for Ridgeline
sourceGranularity?: "monthly" | "annual";
booksBasis?: "cash" | "accrual";
asOfMonth?: MonthKey;               // "2025-12"
```

- `sourceGranularity` is `"monthly"` exactly when `monthly` is present (≥ 12 contiguous months); otherwise `"annual"`, and the model runs in the annual-only layout (guide 5.2A).
- `asOfMonth` is the last month of `monthly.months`. Every strip, window and chart ends here (guide Q33); a customer or payroll file that runs later is truncated to it, one that runs earlier is disclosed.

### 2.2 `monthly: MonthlyPnl`

The category × month grid every period column reads (workbook tab `Monthly P&L`), with the account-level rows behind it (`Databook`).

```ts
monthly: {
  months: MonthPeriod[];                              // ascending, contiguous, last = asOfMonth
  values: Record<MonthKey, Record<IsCategory, number>>;
  lines: MonthlyLine[];                               // account, category, mappedBy, amounts by month
  fullFiscalYears: number[];                          // every month of the year is in the grid
  lastMonthClosesFiscalYear: boolean;
  source: SourceKind; file: string;
}
```

Rules:

- `values[m][c]` equals the sum of `lines` with category `c` in month `m` (check C02). The fixture builds it that way; a data layer that sums monthly QuickBooks columns does too.
- For every year in `fullFiscalYears`, `pnl[year][c]` equals the sum of `values` over that year's months (checks C03, C04). The annual map is derived from the grid, never the other way round.
- History window: from the first month of FY-2 to `asOfMonth`, so 24–36 columns (guide Q34). Earlier months stay out of the grid; the data layer may keep them in `lines` for the Databook.
- Twelve or more months are required; fewer means no `monthly` block, `sourceGranularity = "annual"`, and the Summary states "Full fiscal years only".
- Amounts may be fractional (QuickBooks exports carry cents); the fixture uses whole dollars.

Example (Ridgeline): 36 months Jan-23 to Dec-25; `values["2025-07"].revenue = 313,184`; the twelve FY2025 revenue months sum to 3,040,800.

### 2.3 `balanceSheets: BalanceSheetPeriod[]`

Every dated balance sheet the sources carry, year-ends and month-ends, ascending:

```ts
{ period: MonthPeriod; asOf: "2025-12-31"; fiscalYearEnd: true;
  values: Record<BsCategory, number>;
  detail?: Partial<Record<BsDetailLine, number>>;   // unbilled, prepaid, accrued_liabilities, deferred_revenue,
                                                    // customer_deposits, credit_cards, current_portion_debt, ...
  source; file }
```

- The entry with `fiscalYearEnd = true` for year `y` equals `balanceSheet[y]` exactly (the legacy map is derived from it).
- `detail` lines are sub-accounts already included in their parent category (customer deposits are inside `other_current_liabilities`; credit cards inside `debt`). The NWC tab reads them; a missing detail line prints `n.a.` with a flag, never zero.
- The count of month-ends decides the NWC peg basis (section 5.11).

### 2.4 `adjustments: Adjustment[]` and `recastInputs`

The schedule of guide 5.3, one row per adjustment, in **tier order** (definitional, normalization, owner compensation, pro forma, memo) and, within a tier, in the order the rows were found. `numberAdjustments()` assigns refs by tier in that order (`D1 D2 D3 N1 … S1 S2 S3 PF1 … M1`); the workbook's `COUNTIF` formula reproduces the same numbers when the rows are written in array order, so the two never disagree.

| Field | Values | Notes |
|---|---|---|
| `tier` | `definitional`, `normalization`, `owner_compensation`, `pro_forma`, `memo` | Column D prints `ADJUSTMENT_TIER_LABELS` |
| `category` | the 5.3 list plus `capital_reserve` | Column E prints `ADJUSTMENT_CATEGORY_LABELS` |
| `evidence` | `documented`, `management_representation` | Column H |
| `status` | `proposed`, `supported`, `accepted`, `excluded` | Column I; `In CIM = status === "accepted"` (guide Q10). The task brief's `rejected` is `excluded`; `management_representation` is evidence, not a status |
| `byFiscalYear` | one entry per `years` | Signed: positive raises EBITDA |
| `byMonth` | optional, sums to `byFiscalYear` | Present whenever the row can be tied to months; then YTD and LTM are exact |
| `pnlLine`, `pfMethod` | pro forma rows only | The P&L line the PF column restates and the method string (guide 5.2) |
| `origin` | `pnl`, `addbacks_csv`, `suggested`, `owner_comp`, `replacement_salary`, `capital_reserve`, `intake_notes`, `real_estate`, `advisor` | Where the row came from; drives the flat-list derivation and the Basis defaults |

**Where rows come from** (guide 5.3, with the status each is created in):

| Source | Row | Status |
|---|---|---|
| P&L `interest_expense`, `income_tax`, `depreciation_amortization` | `[D1] [D2] [D3]`, category interest / taxes / da | accepted |
| P&L `other_income` and `other_expense` that are non-operating | `[N]` category `non_operating`, negative for income, origin `pnl` | accepted |
| `addbacks.csv` type owner / discretionary / non_recurring / other | `[S]` owner compensation / `[N]` personal_discretionary / `[N]` non_recurring / `[N]` category `other` flagged in open-questions | proposed (the fixture shows them accepted, as an advisor would leave them after review) |
| Bot-flagged accounts (`suggestedAddbacks`) not already backing a row | `[N]`, amount 0, origin `suggested` | proposed |
| `owner_comp` category, every period | `[S1]` Owner compensation, origin `owner_comp` | accepted |
| `recastInputs.replacementSalary × (1 + burdenPct)` | `[S2]` Market replacement compensation, negative, origin `replacement_salary` | accepted |
| `recastInputs.capitalReserve` (Main Street mode only) | `[S3]` Capital reserve, negative, origin `capital_reserve` | accepted |
| Run-rate items, market rent | `[PF]` with `pnlLine` and `pfMethod` | proposed |
| Considerations not included above | `[M]`, amount 0 or memo value | proposed |

`recastInputs` holds the inputs behind S2 and S3 so the workbook can make them blue cells on `Assumptions`: `replacementSalary` (request row, default $85,000), `burdenPct` (AMB default 0.15, guide Q8), `capitalReserve { amount, basis: "form_4562" | "da_proxy" | "advisor" }`, and `owners` (the working owner's compensation by year). The S2 and S3 amounts in the schedule are the defaults these inputs produce; **the engine recomputes them from Assumptions**, and at default settings the two agree (a test the model builder owns).

**The legacy flat list.** `addbacks` = `addbacksFromSchedule(adjustments)`: normalization rows that are not excluded, carry an amount, and did not originate from the P&L itself. Definitional, owner-compensation and non-operating rows are left out because the legacy engine derives those on its own. `addbackTypeOf()` maps category → legacy type.

### 2.5 `revenueLines: RevenueLine[]`

Revenue by account with the descriptive facts merged from intake: `account` (as exported), `label` (client-grade), `byFiscalYear`, `byMonth`, `recurring`, `whatTheCustomerBuys?`, `pricingBasis?`, `contra`. Contra lines (discounts, refunds) are netted into total revenue and never shown as a service line. Descriptive fields are left undefined when the notes do not give them; the CIM turns an undefined `pricingBasis` into `[Confirm: pricing basis for <line>]`. `revenueMix` (legacy) is the top five non-contra lines of the latest year plus "Other".

### 2.6 `customers: CustomerList`

```ts
{ customers: CustomerRecord[]; residual?; term: "Customer" | "Client"; asOfMonth; totalsByFiscalYear; source; file }
CustomerRecord: { id: "C-001"; name?; type?; segment?; startDate?; endDate?; lossReason?;
                  revenueByFiscalYear; revenueByMonth?; contractBasis?; contract? }
```

- **Coding.** Sort by revenue in the latest full fiscal year descending, then the prior year, then the one before, then source order; assign `C-001`… (three digits, more if over 999). `C-001` is the largest customer. The real `name` never leaves the data layer except onto a `Raw - Customers` tab.
- **Residual.** A service business lists named accounts and leaves households as one bucket (`residual`), so `customers + residual` equals P&L revenue and check C12 (variance > 2% flagged) can run. `totalsByFiscalYear` is that sum.
- **Dates.** `startDate` is the first invoice or contract start; `endDate` the last invoice or termination (undefined while active). A record with an `endDate` carries a `lossReason` (`regrettable`, `non_regrettable`, `unclassified`; guide Q28).
- Present when a customer-level file was supplied; the retention module additionally needs dates or revenue for ≥ 2 full years.

### 2.7 `payroll: PayrollRegister`

```ts
{ employees: PayrollRecord[]; asOfMonth; totalsByFiscalYear; source; file }
PayrollRecord: { id: "E-01"; name?; role; department; isOwner; isManagement; hireDate; terminationDate?; terminationType?;
                 payBasis; fte; wagesByFiscalYear; employerCostsByFiscalYear }
```

- Non-owner `wages + employerCosts` per year equals `pnl[y].payroll` (check C13, flag above 5%); the owner's `wages` equals `pnl[y].owner_comp`. Employer costs are the payroll-tax and benefit lines allocated pro rata to wages.
- Names appear in the CIM only for management (`isManagement`, guide Q12), through `intake.management`; compensation only as department aggregates.

### 2.8 `kpis: KpiSeries[]`

`{ key, label, unit, values: Record<periodKey, number>, definition?, source, evidence }`. Raw operating metrics the sources state (members, renewal rate, fleet, rating). Metrics the engine can compute (revenue per employee, labor cost %) are not stored here; they come out of `ModelOutput.periods[k].kpis`. Management figures carry `evidence: "management_representation"` and print with the "(1) Per management; not independently verified." footnote.

### 2.9 `intake: IntakeFacts`

Structured facts transcribed from the notes, each with a `Provenance { source, locator?, evidence }`: company, locations, systems, suppliers, fleet and equipment, customer facts, workforce, management (with `postCloseIntent`), owner (responsibilities with optional hours and successor, transition offer), growth levers (`baseline`, `target`, `mechanism`, `proofPoint`), reason for sale, transaction (deal-form preference, timing, replacement salary), milestones, competitors, sourced market inputs. **Nothing is inferred.** A field the notes do not state stays undefined; the CIM writes `[Confirm: …]` and logs it to `open-questions.md`. Ridgeline's owner responsibilities, for instance, carry no hours because the notes give only the 45-hour total.

### 2.10 `mode` and `dealForm`

`mode: { mode: "mainStreet" | "lowerMiddleMarket", measure, measureLabel, threshold: 1_000_000, overridden }` from `decideMode()`; `dealForm: { form: "asset_purchase" | "equity_purchase", basis }`. The rules are in section 5.5.

### 2.11 `reconciliations`, `depositsByMonth`, `debtLikeItems`

- `reconciliations: SourceReconciliation[]`: for every fiscal year two P&L sources cover, one row per line (`revenue`, `cogs`, `total_expenses`, `net_income`) with `chosen`, `other`, `difference`, `differencePct` and `material` (above 2%, the S7.4 trigger). Present, possibly empty, whenever the merge ran.
- `depositsByMonth: Record<MonthKey, { amount, excluded }>`: operating deposits with transfers, loan proceeds and owner contributions excluded (the `bankCsv.ts` rule). Feeds `Proof of Cash` and check C14 (flag above 5%). The legacy `deposits` by year is its sum.
- `debtLikeItems: DebtLikeItem[]`: the guide 5.6 list at the latest balance-sheet date, each with `treatment` (`debt`, `debt_like`, `nwc`), `status` and, for an asset purchase, `payoffLetter`. Deferred revenue and customer deposits are `nwc` under the AMB default and appear in exactly one of `NWC` and `Debt-Like Items`. Every `debt_like` balance (the `DEBT_LIKE_LINES` in `chartOfAccounts.ts`: accrued interest, income taxes, related-party balances, accrued bonuses and payroll taxes) is removed from NWC by the same list, so check C19 ties the debt-like total to what NWC removes at the latest date.

---

## 3. `ModelOutput`: what the engine and workbook expose

`ModelOutput extends ModelResult` (the legacy `years / historical / projected / addbackDescriptions` stay) and adds:

| Field | Content |
|---|---|
| `mode`, `dealForm`, `granularity`, `asOfDate`, `fiscalYearEndMonth` | The decisions the tabs key off |
| `columns: PeriodColumn[]` | In layout order: FY-2, FY-1, FY, YTD PY, YTD CY, LTM PY, LTM CY, PF, then projections. Only the columns that exist (section 5.1) |
| `periods: Record<key, PeriodValues>` | Per column: `pnl: PnlLines`, `ladder: Ladder`, `revenueLines`, `accountLines` (Databook account × period), `bs?` (point in time), `kpis` |
| `adjustments` | Every schedule row with its amount per column, all statuses |
| `monthly?: MonthlySeries` | Every category, subtotal and ladder rung per month, the revenue lines and accounts by name, `trailing_12_revenue`, `seasonality_index`, and the chart window |
| `nwc?`, `debtLike?` | Guide 5.6 |
| `customers?`, `headcount?` | Guide 5.5 analytics (section 5.7, 5.8) |
| `valuation` | Internal; never in the CIM |
| `checks`, `masterCheck` | Guide 5.7 rows; `"All checks OK"` or `"n checks failing"` |
| `namedOutputs` | Guide 5.14 keys; `_FY` names are records by fiscal year; conditional names are `null` |
| `modules` | Section IDs built and omitted with the failed trigger, for `run-summary.md` |

`PnlLines.ebitda` is Reported EBITDA as guide 5.4 defines it (net income plus interest, taxes and D&A), so it includes `otherItemsNet`. The legacy `YearValues.ebitda` excludes other items; the CIM reads `periods`, not `historical`.

The `Ladder` carries the atomic owner-compensation rows (`ownerCompAsPaid` = S1, `marketReplacement` = S2, `capitalReserve` = S3) and the derived `ownerCompNormalization` = S1 + S2, so the CIM can print either presentation (section 5.6) from one source.

---

## 4. Period columns: which exist

| Column | Group | Exists when |
|---|---|---|
| FY-2, FY-1, FY | Full Year | Each year in `years` (at most three, the latest three) |
| YTD PY, YTD CY | YTD | `monthly` present and `asOfMonth` does not close the fiscal year, or it does and the guide's layout still shows them (then YTD CY = FY); YTD PY needs the same fiscal months of the prior year in the grid |
| LTM PY, LTM CY | LTM | `monthly` covers the 12 months ending `asOfMonth` (CY) and the 12 before (PY) |
| PF | PF | LTM CY exists (annual mode: the Pro Forma Low / Mid / High block instead, guide 5.2A) |
| Projections | Projection | Always (`Assumptions.projectionYears`) |

With a December as-of on a December year-end, LTM CY and YTD CY both equal FY, and the Summary says so rather than hiding the columns.

---

## 5. Derivation rules

Both the engine (TypeScript) and the workbook (formulas) implement these; `verifyWorkbook` proves they agree.

### 5.1 Windows

- `AsOfDate = monthEndDate(asOfMonth)`. `FYEMonth = fiscalYearEndMonth`.
- **LTM CY** = the 12 months ending `asOfMonth`: `ltmWindow(monthly, asOfMonth)`. **LTM PY** = the 12 months ending `addMonths(asOfMonth, −12)`.
- **YTD CY** = from the first month of the fiscal year containing `asOfMonth` to `asOfMonth`: `ytdWindow(monthly, asOfMonth, fyEndMonth)`. **YTD PY** = the same fiscal months one year earlier. Bounded at both ends; the end is `EOMONTH(AsOfDate, 0)`, never `EOMONTH(start, 12)` (guide 5.2).
- **FY** columns are the twelve months of the fiscal year. When `monthly` exists they are read from the grid (and must equal `pnl[fy]`); in annual mode they are `pnl[fy]`.
- **PF** = LTM CY plus the accepted pro forma rows mapped to their `pnlLine`; every other line equals LTM CY.
- A window that the grid does not cover does not exist; nothing is zero-filled.

### 5.2 Period P&L

For a window `W` (a list of month keys): `pnl[c] = Σ_{m∈W} monthly.values[m][c]` for every category (`sumMonths`). The workbook writes `SUMIFS(grid_row, month_row, ">="&start, month_row, "<="&end)` with the two helper rows "Period start" / "Period end". Then:

```
grossProfit   = revenue − cogs
totalOpex     = payroll + ownerComp + rent + marketing + otherOpex
otherItemsNet = otherIncome − otherExpense
ebitda        = grossProfit − totalOpex + otherItemsNet          (Reported EBITDA)
ebit          = ebitda − da
ebt           = ebit − interest
netIncome     = ebt − tax
```

Balance-sheet columns are point-in-time: the `balanceSheets` entry whose `period.key` equals the window's end month (`INDEX/MATCH`, never `SUMIFS`); absent → no `bs` on that column.

### 5.3 Adjustments per column

For row `a` and window `W`: `adjustmentInWindow(a, W, fyEndMonth)` = `Σ_{m∈W} a.byMonth[m]` when the row has months; otherwise the fiscal-year amounts **prorated by months**: `Σ_fy a.byFiscalYear[fy] × (months of fy in W) / 12`. The workbook does the same: a `SUMIFS` over the row's monthly cells when present, else the prorating formula, with the YTD / LTM cells blue so an advisor can overwrite the proration. Full-year columns always equal `byFiscalYear[fy]`.

### 5.4 The ladder (guide 5.4), per column

```
reportedEbitda        = netIncome + D1 + D2 + D3            (check C05: equals pnl.ebitda)
totalNormalization    = Σ accepted N rows
sde                   = reportedEbitda + totalNormalization + S1
adjEbitda             = sde + S2 + S3                        (S2, S3 negative; S3 = 0 outside Main Street mode)
totalProForma         = Σ accepted PF rows
pfAdjEbitda           = adjEbitda + totalProForma
margins               = rung ÷ marginDenominator (total revenue, or net revenue where pass-through revenue exists)
ownerCompNormalization = S1 + S2
```

Only `accepted` rows enter the rungs; proposed, supported and excluded rows are listed on `Adjustments` with their status and stay out of every total (check C06 ties the schedule's accepted totals by tier to the ladder). Memo rows are printed under the ladder and never added. Both red check rows are zero by construction.

### 5.5 Main Street mode and deal form (guide Q7, 5.6)

1. Compute `measure = reportedEbitda + totalNormalization + S1 + S2 + totalProForma` on the **latest full window** (LTM CY when monthly, else the latest FY), i.e. PF Adj. EBITDA **before** the capital reserve. The reserve follows from the mode, so it cannot enter the test.
2. `mode = measure < 1,000,000 ? "mainStreet" : "lowerMiddleMarket"` (`decideMode`). `Assumptions!MainStreetMode` is a blue input initialised from it; an advisor may override, and `overridden` records that.
3. In Main Street mode the schedule carries `[S3]` (amount from `recastInputs.capitalReserve`; default the three-year average equipment cost from Form 4562, else the three-year average of D&A flagged "proxy") and the CIM shows the SDE rung and S7.3. In LMM mode S3 is 0, the CIM collapses S1 and S2 into "(+) Owner compensation normalization" and omits SDE.
4. `dealForm` defaults from the mode (Main Street → `asset_purchase`, LMM → `equity_purchase`); an intake preference or advisor instruction overrides it, recorded in `basis`. Everything on `NWC`, `Debt-Like Items` and S10.1 keys off it (guide D15).

### 5.6 Owner compensation, two presentations

The schedule holds two atomic rows: `S1` = owner compensation as paid (added back) and `S2` = −(replacement salary × (1 + burden)). SDE is pre-S2 (one owner's total pay stays in), Adj. EBITDA is post-S2. The design spec's ladder (`FINAL_DESIGN_SPEC.md` §8: "as paid, (–) market replacement, (+) above market [S1]; (+) market replacement [S2] before SDE") is a presentation of the same two numbers: "above market" = `ownerCompNormalization` = S1 + S2, and its "(+) market replacement" = −S2. The CIM builder chooses the presentation per mode; the figures come from `Ladder`.

### 5.7 Customers

- **Active at date d**: `startDate ≤ d` and (`endDate` undefined or `endDate ≥ d`).
- **Count roll-forward for a window [s, e]**: `startingCount` = active at the day before `s`; `new` = starts within the window; `lost` = ends within the window; `endingCount = starting + new − lost`; `avgCustomers = (starting + ending) / 2`; `churn = lost / avgCustomers`; `newCustomerGrowth = new / startingCount`. Monthly: `startingCount(m) = endingCount(m − 1)`.
- **Dollar roll-forward for fiscal year y**: `startingRevenue` = prior-year revenue of customers active on the first day of y; `churn` = prior-year revenue of customers lost during y; for customers active all year, `downsell` = Σ decreases and `upsell` = Σ increases in revenue vs the prior year; `newRevenue` = current-year revenue of customers started during y; `endingRevenue = starting − churn − downsell + upsell + new` (equals the year's customer revenue). `GDR = (starting − churn − downsell) / starting`; `NDR = (starting − churn − downsell + upsell) / starting`.
- **Concentration** on the latest full window: rows sorted by revenue descending, `pctOfTotal = revenue / total` where `total` = the customer list's total for the window (coded + residual, which ties to P&L revenue within C12's 2%); `cumulativePct` running; `Top 20 | (+) Remaining | Total`; `top10Share`, `top20Share`, `largestShare`. `tenureYears = max(0, (AsOfDate − startDate) / 365.25)`, never negative.
- **Mix by type**: count and revenue by `type` over the same window; `avgRevenue = revenue / count`.
- **Cohorts** (≥ 3 annual cohorts): cohort = start year; `retainedByYear[k]` = members still active at the end of year k.

### 5.8 Payroll

- **On payroll at date d**: `hireDate ≤ d` and (`terminationDate` undefined or `terminationDate > d`). `Headcount_Latest` = non-owner FTE on `AsOfDate`; field headcount = departments the deal defines as field (Ridgeline: Field service, Installation).
- **Roll-forward** per fiscal year: start, hires, departures (by `terminationType`), end. Monthly for MC-H1.
- **Tenure at departure** buckets, V51 verbatim: "First 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "Over 2 Years".
- **By department** for the window: count on `AsOfDate`, total comp = wages + employer costs, avg comp = total / count, `% revenue` = total / window revenue, avg tenure of those on payroll on `AsOfDate`.
- **Load ratios**: `revenuePerEmployee = revenue / Headcount_Latest`; `revenuePerFieldEmployee = revenue / field headcount`; `customersPerEmployee = Customers_Latest / Headcount_Latest`; `laborCostPctRevenue = pnl.payroll / revenue` (owner compensation stated separately).

### 5.9 Engine KPIs per column

`periods[k].kpis` carries, when the inputs exist: `revenue_per_employee`, `revenue_per_field_employee`, `labor_cost_pct_revenue`, `customers`, `revenue_per_customer` (revenue ÷ coded customers active at the window end), `recurring_revenue_pct` (Σ recurring revenue lines ÷ revenue), plus each `KpiSeries` whose key resolves to the column. Every KPI printed in the CIM is defined in S11.1 with the formula above.

### 5.10 Monthly series and charts

`monthly.series[key][i]` is the value in `monthly.months[i]`. Categories and subtotals follow 5.2 per month; ladder rungs per month use 5.3 with a one-month window. `trailing_12_revenue[i]` = Σ revenue over months i−11..i (undefined before 12 months → 0 and excluded from charts). `seasonality_index[i]` = revenue[i] ÷ (trailing-12 ÷ 12), present only with ≥ 24 months. The chart window (guide 5.12) ends at `asOfMonth`, is capped at 36 months, needs at least 12, and above 24 starts on a calendar-quarter start.

### 5.11 NWC (guide 5.6)

From each `BalanceSheetPeriod`: `ar = accounts_receivable`, `unbilled = detail.unbilled ?? n.a.`, `inventory`, `prepaidOther = other_current_assets`, `ap = accounts_payable`, `accrued = detail.accrued_liabilities ?? other_current_liabilities − deferred − deposits`, `deferredRevenue = detail.deferred_revenue ?? n.a.`, `customerDeposits = detail.customer_deposits ?? n.a.`; totals exclude cash and debt; `reportedNwc = TCA ex cash − TCL ex debt`; `adjustments` remove credit cards, current debt, related-party balances, accrued interest and income taxes when they sit inside the categories; `adjustedNwc = reported + adjustments`. Ratios against the LTM ending at that month (or the FY when annual): `pctLtmRevenue`, `deferredRevenuePctRevenue`, `dso = ar / revenue × 365`, `dio = inventory / cogs × 365`, `dpo = ap / cogs × 365`. Peg: ≥ 12 month-ends → `T12M average` of adjusted NWC; ≥ 4 quarter-ends → `T4Q average` with an info flag; year-ends only → `n.a.` (check C20). Asset purchase: AR, unbilled, prepaids, AP and accrued are retained by the Seller; inventory and customer deposits transfer; deferred revenue only if listed.

### 5.12 Rounding and formats

The engine keeps full precision. The workbook divides by 1,000 at the Databook and shows `#,##0` (guide 5.10). The CIM prints whole thousands and states "totals may not sum due to rounding" when displayed figures do not foot; prose keeps one decimal (`$385.7K`). Percentages: margins 1 dp, mix and shares 0 dp.

---

## 6. Worked figures: Ridgeline (the fixture)

All in dollars. The fixture test asserts these; the engine and workbook must reproduce them.

**P&L, FY2025.** Revenue 3,040,800 · COGS 1,158,900 · Gross profit 1,881,900 (61.9%) · Payroll 904,700 · Owner compensation 200,000 · Rent 76,385 · Marketing 79,600 · Other opex 304,800 · Total opex 1,565,485 · Other items net +3,100 · **Reported EBITDA 319,515 (10.5%)** · D&A 72,400 · EBIT 247,115 · Interest 14,300 · EBT 232,815 · Tax 0 · Net income 232,815 (equals the QuickBooks export).

**Ladder, FY2025 (= LTM Dec-25 = YTD Dec-25).**

| Rung | Ref | Amount |
|---|---|---|
| Net income | | 232,815 |
| (+) Interest expense | D1 | 14,300 |
| (+) Income taxes | D2 | – |
| (+) Depreciation and amortization | D3 | 72,400 |
| **Reported EBITDA** | | **319,515** |
| (+) Owner's personal vehicle | N1 | 18,000 |
| (+) Legal fees: settled customer dispute | N2 | – |
| (+) Owner family cell phones and personal meals | N3 | 6,000 |
| (+) Charitable contributions | N4 | 7,500 |
| (–) Interest income (non-operating) | N5 | (3,100) |
| Total normalization adjustments | | 28,400 |
| (+) Owner compensation | S1 | 200,000 |
| (+) Payroll taxes on owner compensation (statutory rates) | S4 | 13,860 |
| **SDE** | | **561,775 (18.5%)** |
| (–) Market replacement compensation (95,000 × 1.15) | S2 | (109,250) |
| (–) Capital reserve (three-year average D&A, proxy) | S3 | (66,800) |
| **Adj. EBITDA** | | **385,725 (12.7%)** |
| Pro forma adjustments | | none |
| **PF Adj. EBITDA** | | **385,725** |

Other years: FY2024 Reported EBITDA 214,640, normalization 44,600, [S4] 13,250, SDE 462,490, Adj. EBITDA 286,440; FY2023 Reported EBITDA 158,200, normalization 19,800, [S4] 12,584, SDE 370,584, Adj. EBITDA 194,534. [S4] is the owner's employer payroll taxes at federal statutory rates on the [S1] salary (Social Security to the year's wage base, Medicare, FUTA on $7,000), accepted because [S1] is documented, and summed into the [S1] rung (guide 5.4: SDE adds back salary, payroll taxes and benefits). N6–N9 are bot-flagged rows at 0, proposed; M1 is a memo at 0.

**Mode.** Measure before the reserve: 319,515 + 28,400 + 200,000 + 13,860 − 109,250 = 452,525 < 1,000,000 → Main Street; deal form asset purchase (intake preference agrees). In LMM presentation the owner-compensation normalization ([S1] with [S4], less [S2]) would print as one line of 104,610.

**Customers.** 62 coded accounts; commercial revenue 598,200 / 702,500 / 811,700 by year; residual (households and members) 1,808,600 / 2,016,100 / 2,229,100; totals tie to revenue. Largest `C-001` 121,600 = 4.00% of revenue; top ten 586,800 = 19.30%; active 40 at Jan-23, 44 at Dec-23, 49 at Dec-24, 52 at Dec-25 (FY2025: +7 new, −4 lost, churn 4 ÷ 50.5 = 7.9%).

**Payroll.** 23 employees plus the owner at Dec-25 (14 service technicians, 4 install technicians, 3 CSR / dispatch, 1 bookkeeper, 1 operations manager); FY2025 field wages 648,900, office wages 131,400, employer costs 124,400, total 904,700; owner 200,000.

**Balance sheet, Dec-25.** Cash 238,615 · AR 248,600 · Inventory 96,300 · Prepaid 14,200 · Fixed assets net 357,500 · Security deposit 12,000 · AP 118,400 · Accrued and other 67,500 (accrued payroll 38,900, sales tax 6,200, customer deposits 22,400) · Debt 279,400 (vehicle loans 146,800, SBA 118,000, credit card 14,600) · Equity 501,915. Year-ends only, so the NWC peg is `n.a.`.

**Deposits, 2025.** 2,995,188.11 operating deposits over 12 months (98.5% of revenue; 167,878 of transfers excluded).

---

## 7. Present-when summary

| Block | Present when | Absent means |
|---|---|---|
| `fiscalYearEndMonth` | the request row is known | consumers use the request row |
| `sourceGranularity`, `asOfMonth`, `monthly` | ≥ 12 contiguous months of category data | annual-only layout; no YTD / LTM / PF columns, strips or chart tabs |
| `booksBasis` | a source states it | NWC tab notes the basis is unconfirmed |
| `balanceSheets` | any dated balance sheet | no `Balance Sheet`, `NWC`, `Debt-Like Items`, `Cash Flow` tabs; opening balance sheet estimated (legacy rule) |
| `adjustments`, `recastInputs`, `mode`, `dealForm` | a P&L exists | legacy `addbacks` path |
| `revenueLines` | a revenue account exists | `revenueMix` |
| `customers` | a customer-level file | S4 omitted except S4.7 when POS data exists; `Customers_Latest`, `Top10Share_LTM`, `GDR_LTM`, `NDR_LTM` null |
| `payroll` | a payroll file | S5.2 / S5.3 and `Headcount` omitted; `Headcount_Latest` from the request row's `employees` with a flag |
| `kpis` | at least one metric in the sources | KPI rows omitted |
| `intake` | notes exist | every qualitative slot is a `[Confirm: …]` |
| `reconciliations` | the merge ran (may be empty) | S7.4 omitted |
| `depositsByMonth` | a bank source | `Proof of Cash` omitted; C14 `n.a.` |
| `debtLikeItems` | a balance sheet | `Debt-Like Items` omitted |
