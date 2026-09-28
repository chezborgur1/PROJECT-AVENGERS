# Build handoff

One section per agent. Write what you need from another agent under **your own** name, addressed to them, and code against the contract types meanwhile. Nobody edits another agent's files; a need that changes a shared type is raised here and applied additively by the type owner.

Contract files: `src/domain/financials.ts` (extended `FinancialDataset`, period helpers, schedule helpers), `src/model/types.ts` (`ModelOutput`), `tests/fixtures/sampleDataset.ts` (`ridgelineDataset()`), `docs/build/DATA_CONTRACT.md` (rules and worked figures).

---

## Contract (types, fixture, this document)

What was decided that the guide left open, and where each builder should look first:

- **Reported EBITDA carries other income and expense.** Guide 5.4 starts the ladder at net income and C05 requires Reported EBITDA = net income + [D1..D3], so non-operating other income leaves through a normalization row (Ridgeline `[N5]` Interest income, −3,100 in FY2025). `PnlLines.ebitda` follows this; the legacy `YearValues.ebitda` (gross profit less opex) does not. Ridgeline's FY2025 Reported EBITDA is therefore 319,515 in the new output and 316,415 in the legacy fields. Read `periods`, not `historical`, for anything printed.
- **S2 carries the 15% burden and S3 exists in Main Street mode** (guide 5.3, 5.4, Q8, Q29). With the sample's $95,000 replacement salary that gives FY2025 Adj. EBITDA of **371,865** and SDE of 547,915. The tournament sample deck's "$452.9K" was the old bot's figure (no burden, no reserve) and must not be hard-coded anywhere; the CIM reads the engine.
- **Status and evidence are two fields** (`proposed | supported | accepted | excluded`; `documented | management_representation`). Only `accepted` rows enter the ladder and the CIM (Q10).
- **`capital_reserve` was added to the 5.3 category list** for `[S3]`; nothing else in the category vocabulary changed.
- **Refs are numbered by tier in schedule order** (`numberAdjustments`); the workbook's `COUNTIF` numbering reproduces it when rows are written in array order.
- **Period keys and labels** are the `periodKey` / `periodLabel` helpers (`FY2025`, `LTM2025-12` ↔ `LTM Dec-25`). Projection columns are labelled `FY2026E` (contract decision; say so here if the model builder prefers another form).
- **Customer coding** sorts on the latest full fiscal year's revenue; households are a `residual` bucket so the list ties to the P&L.

Needs from others: none. Questions about the contract go under the asking agent's section with the type change proposed.

---

## Data layer (ingest, merge, intake extraction)

Owner: data builder. Produces every block of `FinancialDataset` from `samples/` and `deals/` folders.

Delivered (every block of the contract; `tests/ingest-sample.test.ts` proves the sample folder reproduces `ridgelineDataset()` block by block):

- `src/ingest/reportTable.ts`, `quickbooksExport.ts`, `quickbooksApi.ts`: single-month columns are kept as an account × month series; balance sheets keep every dated column. `merge.ts` builds `monthly` from the most trusted source with ≥ 12 contiguous months, from the first month of FY-2 (Q34); `pnl[fy]` for every year in `monthly.fullFiscalYears` is Σ of the grid, and `lines` for those years are the account sums of the same months, so C02–C04 hold by construction. A partial year is carried as months (YTD) and never as an annual year. Fewer than 12 usable months → `sourceGranularity = "annual"` with a warning.
- `adjustments.ts`: the schedule in tier order with refs from `numberAdjustments`; `[D1..D3]` from the P&L, `[N]` rows from `adjustments.csv` (or the legacy `addbacks.csv`, mapped to accepted N rows), one `[N]` non-operating row per `other_income` / `other_expense` account, bot-flagged accounts as proposed zeros unless a file row already backs the account in full, `[S1]` from `owner_comp` (a file row may override it), `[S2]` = −(salary × 1.15), `[S3]` only in Main Street mode from Form 4562 else the 3-year D&A proxy, `[PF]` and `[M]` rows from the file. `byMonth` is present on P&L-derived rows, on file rows that name an `account`, and flat on S2 and S3; other file rows have no months and are prorated. `mode` is decided on the LTM window (or the latest FY in annual mode) before S3; `dealForm` from the intake preference else the mode.
- `customers.ts`, `payroll.ts`, `kpis.ts`, `intake.ts` (`intake.json` loader and the zod wire schema), `docx.ts`, `aiExtract.ts` (`extractIntakeFacts`). Formats are in `docs/REQUEST_LIST.md`. Customers are coded by latest-full-year revenue, then earlier years, then file order; employer costs are the P&L payroll line less wages allocated pro rata (whole dollars, residual on the largest) unless the file has employer-cost columns.
- `reconciliations` compares every other source covering a year to the chosen one on `revenue`, `cogs`, `total_expenses` (every expense category below gross profit: payroll, owner comp, rent, marketing, other opex, D&A, interest, other expense, tax) and `net_income` (revenue − COGS − total expenses + other income). Two QuickBooks exports (annual and monthly) reconcile to zero, which the sample shows.
- `depositsByMonth` from the bank CSV (or Claude's bank-statement extraction); the legacy `deposits` is its sum by fiscal year. `debtLikeItems` from the latest dated balance sheet via `debtLikeTreatment`, ordered debt (term loans, then revolving), debt-like, NWC; `payoffLetter` set only for an asset purchase.
- `gatherIntake` returns `IntakeBundle` with a new `intakeFacts: "intake.json" | "claude" | "none"` for `run-summary.md`. `mergeSources` takes the extended `MergeInput` (all new fields optional; the old three-field call still works).
- The sample folder gained `QuickBooks Profit and Loss FY23-FY25 (monthly).csv` (36 monthly columns that sum to the annual export to the dollar), `adjustments.csv` (N1–N4, S1, M1), `customers.csv` (62 coded accounts plus the residual row, written in alphabetical order so the coding is exercised), `payroll.csv` (28 employees plus the owner; no employer-cost columns, so the allocation is exercised), `kpis.csv` (10 metrics) and `intake.json` (byte-for-byte the fixture's facts). `addbacks.csv` stays for the legacy path and is marked superseded in the run summary.

Notes for the other builders (behaviour the contract left open):

- **Model.** A fiscal year in `years` that `monthly.fullFiscalYears` does not cover (a tax-return year before the QuickBooks months) has its FY column from `pnl[fy]` only. `balanceSheets` includes the year-end that opens FY-2 when the source has it (the opening balance for a cash flow) and nothing earlier. `customers.asOfMonth` and the payroll's last year may be earlier than `asOfMonth`; the data layer already writes the "runs to Dec-24" disclosure into `warnings`. `[S2]` is `replacementSalary × (1 + burdenPct)` in floating point (95,000 × 1.15 = 109,249.99999999999); compare at $1. C14 by month should read `depositsByMonth[m].amount` against `monthly.values[m].revenue`; the data layer's 75–125% band is only a warning.
- **CIM.** `revenueLines[].label` defaults to the sentence-cased account name when `intake.json` gives no label; `whatTheCustomerBuys` and `pricingBasis` are undefined unless the file states them. `intake` is absent when there is no `intake.json` and no API key, and the bundle's `intakeFacts` says which. Adjustment `description`s on file rows are the advisor's own words.
- **Integrate.** `warnings` now carries the pre-checks tagged "(check C12)", "(check C13)", "(check C14)", the `[S3] capital reserve is a proxy` line and "No structured intake facts" for `open-questions.md`; `files[].used` strings name every file's role, including "superseded" for `addbacks.csv`. `README.md` "Known limits" is out of date on two points the data layer now covers (Word intake notes are read; partial years become YTD/LTM columns).

Needs from others:

- **Contract (types), optional:** `PayrollRecord.payBasis` could become optional; registers often lack it and today the reader records `hourly` with a warning. `SourceReconciliation.line` could gain `"deposits"` so the month-by-month deposit check is a structured row rather than a warning string. Neither blocks anything.
- **Integrate:** `intake.yaml` is not read (no YAML dependency in `package.json`); `intake.json` is the structured form. Add the dependency if YAML is wanted.

---

## Model (engine, workbook, verifier, charts)

Owner: model builder. `runModel` returns `ModelOutput`; `writeWorkbook` builds the guide 5.1 architecture; `verifyWorkbook` compares every formula with the engine.

Obligations from the contract:

- Implement DATA_CONTRACT §5 exactly: windows (5.1), period P&L (5.2), adjustments per column with proration for rows without months (5.3), the ladder identities (5.4), the mode rule before S3 (5.5), NWC (5.11). Recompute S2 and S3 from `Assumptions` and assert they equal the dataset defaults.
- Fill `namedOutputs` for every guide 5.14 key, `null` where the tab is not built, and `Monthly` rows for S11.2.
- Fill `checks` C01–C37 with `n.a.` where a tab is absent, and `masterCheck`.
- Populate `customers` and `headcount` analytics per §5.7–5.8, `monthly` series per §5.10, and `modules` (built / omitted with the failed trigger) for `run-summary.md`.
- Keep the legacy `years / historical / projected` populated so `pipeline.ts` and the current deck keep compiling until the CIM engine replaces them.
- The fixture is the regression: `ridgelineDataset()` through the engine must reproduce DATA_CONTRACT §6.

Needs from others:

- (none yet)

---

## CIM (narrative, deck, exhibits, lint)

Owner: CIM builder. Reads `ModelOutput` plus `FinancialDataset.intake`, `kpis`, `revenueLines` and `customers` (coded only), never the raw numbers.

Obligations from the contract:

- Every figure comes from `ModelOutput.periods[*]`, `ladder`, `customers`, `headcount` or `namedOutputs`; the design spec's sample numbers are illustrations, not data.
- Choose the ladder presentation by `mode` (DATA_CONTRACT §5.6): Main Street shows the SDE rung and S7.3; LMM prints `ownerCompNormalization` on one line and omits SDE.
- Adjustment support table: `accepted` rows only; `evidence` becomes "Documented (<sourceDocument>)" or "Management representation (1)" with the footnote.
- Module triggers (guide 3.3) are evaluated on the dataset blocks per DATA_CONTRACT §7; an absent block omits the module and logs it, never a placeholder exhibit.
- Undefined intake fields become `[Confirm: …]` and go to `open-questions.md`.

Needs from others:

- (none yet)

---

## Integrate (pipeline, CLI, run-summary, open-questions, demo)

Owner: integrator. Wires the three together, keeps `npm run demo` and the test suite green, and writes `run-summary.md` / `open-questions.md` from `ModelOutput.modules`, `checks` and the CIM's placeholders.

Obligations from the contract:

- `pipeline.ts` passes the extended dataset to `runModel` and the `ModelOutput` to the CIM; the legacy fields keep the existing tests passing during the transition.
- `run-summary.md` lists modules built and omitted (guide 3.5 rule 8) and the check summary; `open-questions.md` lists proposed and supported schedule rows, the capital-reserve proxy when `basis === "da_proxy"`, and every `[Confirm: …]`.
- The Ridgeline sample stays the demo; if the data layer needs new sample files (customer list, payroll register) they are fictional and match `tests/fixtures/sampleDataset.ts`.

Needs from others:

- (none yet)
