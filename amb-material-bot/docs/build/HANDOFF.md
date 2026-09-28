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

Obligations from the contract:

- Build `monthly` from monthly QuickBooks columns (export or API) whenever ≥ 12 contiguous months exist; window from the first month of FY-2 (Q34); `values` must equal Σ `lines` per month and `pnl[fy]` must equal Σ months for full years.
- Build `adjustments` in tier order per DATA_CONTRACT §2.4, including the definitional rows, the non-operating rows from `other_income` / `other_expense`, `[S1]` from `owner_comp`, `[S2]` from `recastInputs` (request row salary × (1 + 0.15)), `[S3]` only when `decideMode()` says Main Street, and bot-flagged rows as proposed zeros. Derive `addbacks` with `addbacksFromSchedule` so the legacy path is unchanged.
- Read customer and payroll files (formats to be defined by the data builder; the fixture shows the target shape), code customers, allocate employer costs, and populate `totalsByFiscalYear` so C12 and C13 can run.
- Extract `intake` and `kpis` with provenance and without inference; undefined is the correct value for a fact the notes lack.
- Set `mode`, `dealForm`, `reconciliations`, `depositsByMonth`, `debtLikeItems`.

Needs from others:

- (none yet)

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
