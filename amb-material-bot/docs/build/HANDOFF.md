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
- **CIM.** `revenueLines[].label` defaults to the sentence-cased account name when `intake.json` gives no label (integrator: via `clientLabel`, so "Service Revenue - Residential" becomes "Service revenue (residential)"); `whatTheCustomerBuys` and `pricingBasis` are undefined unless the file states them. `intake` is absent when there is no `intake.json` and no API key, and the bundle's `intakeFacts` says which. Adjustment `description`s on file rows are the advisor's own words.
- **Integrate.** `warnings` now carries the pre-checks tagged "(check C12)", "(check C13)", "(check C14)", the `[S3] capital reserve is a proxy` line and "No structured intake facts" for `open-questions.md`; `files[].used` strings name every file's role, including "superseded" for `addbacks.csv`. `README.md` "Known limits" is out of date on two points the data layer now covers (Word intake notes are read; partial years become YTD/LTM columns). *Resolved by the integrator: README rewritten.*

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

Delivered (`src/model/**`, `tests/model.test.ts`, `tests/model-workbook.test.ts`):

- `engine.ts`, `periods.ts`, `analytics.ts`, `checks.ts`, `assumptions.ts`: `ModelOutput` with every column of 5.2, the ladder per column, the schedule per column, NWC and debt-like items, customer and headcount analytics, KPIs, valuation, deal, sensitivities, cash flow, C01–C37, the 5.14 named outputs and `modules`. Ridgeline FY2025 (= LTM Dec-25): Reported EBITDA 319,515, SDE 547,915, Adj. EBITDA 371,865, "All checks OK".
- `chartData.ts` (new): the 5.12 chart exhibits as engine values, `ModelOutput.charts`.
- `workbook.ts` + `workbook/*.ts`: the 5.1 tabs in order, including `Revenue Charts`, `Expense Charts`, `Retention Charts` and `Headcount Charts` after their analysis tabs. The house style of 5.8–5.13 throughout: Arial only (the Normal style is patched to Arial 10), the two-tier `7B0000` header, `FFE1E1` section bars, `FFFFCC` key-total boxes, the exact 5.10 formats, the colour code and the Print toggle (master on Contents, per-tab override by conditional format). Also 0.9 spacer columns and 3.95 spacer rows, freeze at C7, absolute print areas, the house header and footer, fitted scales with column breaks on the monthly grids, a Cover with the logo and a fixed "As of" date, and a Contents tab with hyperlinks and the master check. Every period figure is a formula; the Databook ties every P&L and balance-sheet account to its raw export (`TIES OUT` / `CHECK`).
- `charts.ts` (new): the JSZip injector (chart, drawing, rels and content-type parts; caches filled from the engine), and `readCharts` for the lint.
- `verifyWorkbook.ts`: evaluates every formula, with shims for fast-formula-parser gaps and defined names resolved. It compares each planned cell and named output with the engine, and lints C15/C17/C18, the colour code, the 5.14 names and every chart part (C22: references inside the chart-data block, equal lengths, name = B cell of the row, palette only, one value axis, no bounds but 0, `sourceLinked="0"`, captions on `ChartStart`/`ChartEnd`, caches equal to the cells).
- Tests: 36, including LibreOffice recalculation through the xlsx skill's `recalc.py` when `soffice` is installed (set `AMB_RECALC_PY` elsewhere), a wrong-reference and a circular-reference tamper, chart-part tampering, the annual-only variant and the sample folder as ingested.

**Entry point for the pipeline** (what `pipeline.ts` already calls; no change needed):

```ts
import { defaultAssumptions } from "./model/assumptions.ts";
import { runModel } from "./model/engine.ts";
import { writeWorkbook } from "./model/workbook.ts";
import { verifyWorkbook } from "./model/verifyWorkbook.ts";

const assumptions = defaultAssumptions(ds, row);             // ds: FinancialDataset from gatherIntake, row: RequestRow
const model = runModel(ds, assumptions);                      // ModelOutput
await writeWorkbook({ row, dataset: ds, assumptions, model, firmName: cfg.firm.name, preparedOn: "2026-09-28", version: "v01" }, workbookPath);
const verification = await verifyWorkbook(workbookPath, model); // { formulas, compared, errors, mismatches, lint, ok }
```

`dataset` is required for the raw customer, payroll and bank tabs and the chart tabs; `version` defaults to `v01`. `verifyWorkbook` rebuilds the plan from the options `writeWorkbook` recorded for that `model`; to verify a file written in another process, pass `planOptionsFor(ctx)` (same context object) as the third argument. Verification takes about 35 s for Ridgeline (9,765 formulas, 8,299 compared). For `run-summary.md`: `model.modules.built` / `omitted` (now including "Chart tabs (guide 5.12)"), `model.checks` (id, check, tab, difference, tolerance, status, note), `model.masterCheck`, and `verification.formulas` / `compared`. Optionally run LibreOffice on the file (`recalc.py <file> 120`); Ridgeline reports 0 errors.

Contract notes (all additive; `src/model/types.ts`):

- `ModelOutput.charts?: ChartExhibit[]` (with `ChartTab`, `ChartSource`, `ChartSeriesData`): per exhibit the catalogue ID, title, units, form, months, series values in chart units (losses negative) and the ratio row. The CIM may read them; it still draws its own charts (2.6).
- `CustomerAnalytics.mixByType[].residual?: true` marks the households bucket. `kpis.employees` is the non-owner FTE count. `NamedOutputs.DefRev_Latest` is `null` unless the balance sheet carries deferred revenue.
- The customer roll-forward's starting count is "started before the window and not ended before it", so start + new − lost = end for every window (the Retention tab uses the same COUNTIFS).
- `customers.retention.ltm.dollars` now carries the latest fiscal year's bridge when the LTM window is that fiscal year (the CIM's minor note); for an LTM that straddles fiscal years it stays zero, since customer revenue exists by fiscal year only.
- Annual-only scenarios are ordered Low ≤ Mid ≤ High on EBITDA: Low lets every variable cost scale with sales, Mid is SUN's pattern, High holds payroll at the latest year; Low and High differ from Mid on growth and an operating driver (C29).
- A schedule row without months is prorated from its fiscal years in the month grid too (Adjustments shows `=FY/12`), matching `adjustmentInWindow`. The sample folder's `[N3]` has no months while the fixture's has; both verify.

Needs from others:

- **Integrate:** `tests/pipeline.test.ts` now passes workbook verification on the ingested sample and fails later, on the CIM parts the CIM builder lists (retired deck, `clampWords`). C37 (render QA) is `n.a.` in the model; if the pipeline renders the workbook to PDF, it can record the result there. *Integrator: the pipeline test is rewritten and passes; C37 stays open (see Integrate).*
- **Contract, optional:** `src/types/fast-formula-parser.d.ts` omits the parser's `onVariable` option; `verifyWorkbook` types its config locally to use it. Adding `onVariable?: (name: string) => unknown` there would let that go. *Resolved by the integrator.*

---

## CIM (narrative, deck, exhibits, lint)

Owner: CIM builder. Reads `ModelOutput` plus `FinancialDataset.intake`, `kpis`, `revenueLines` and `customers` (coded only), never the raw numbers.

Obligations from the contract:

- Every figure comes from `ModelOutput.periods[*]`, `ladder`, `customers`, `headcount` or `namedOutputs`; the design spec's sample numbers are illustrations, not data.
- Choose the ladder presentation by `mode` (DATA_CONTRACT §5.6): Main Street shows the SDE rung and S7.3; LMM prints `ownerCompNormalization` on one line and omits SDE.
- Adjustment support table: `accepted` rows only; `evidence` becomes "Documented (<sourceDocument>)" or "Management representation (1)" with the footnote.
- Module triggers (guide 3.3) are evaluated on the dataset blocks per DATA_CONTRACT §7; an absent block omits the module and logs it, never a placeholder exhibit.
- Undefined intake fields become `[Confirm: …]` and go to `open-questions.md`.

Delivered (`src/cim/**`, `src/util/format.ts`, `tests/cim-copy.test.ts`, `tests/cim-deck.test.ts`, `samples/project-ridgeline/cim-copy.fixture.json`):

- `design.ts`: the design spec as code (12-column grid, bands, type, colour tokens, numeric/text/fact/observation/support tables, native charts with the spec's chart post-pass, title zone, exhibit header, notes band, footer tracker, cover, divider, contents) and a measuring layout engine (`layoutPage`) that throws rather than overflow.
- `brief.ts`: the numbers brief. Every figure in the copy is a `{{token}}` resolved from `ModelOutput.periods`, `ladder`, `customers`, `headcount`, the dataset's KPIs and intake; the copy lint rejects money or percentages typed as literals that the brief does not hold.
- `copy.ts` (per-page zod schema, voice lint, word budgets), `narrative.ts` (Claude via `src/util/claude.ts` structured outputs with one lint-repair round; without a key the request folder's `cim-copy.fixture.json` when it names the business, else templated copy with `[Confirm: …]` gaps).
- `sections/*.ts` (S0 to S11, each module with its trigger, merge host, page budget and build) and `planner.ts` (presence, merges, 60% fill floor, overflow give-back, length cut order, dividers only in LMM or at 24+ pages, contents, page references).
- `render.ts` (LibreOffice PDF, PyMuPDF page PNGs) and `deck.ts`.

**Entry point for the pipeline** (replaced the legacy `buildDeck`, now removed):

```ts
import { draftCimCopy } from "./cim/narrative.ts";
import { buildCim } from "./cim/deck.ts";

const draft = await draftCimCopy({ row, notes: intake.notes, dataset: ds, model, firm: cfg.firm, date: now });
// draft.source: "claude" | "fixture" | "template"; draft.lint: remaining voice issues (empty for the sample)
const cim = await buildCim({ row, ds, out: model, copy: draft.copy, firm: cfg.firm, date: now }, deckPath, { pdf: true, png: true });
```

`buildCim` writes `deckPath` (.pptx), and with `pdf: true` `<deck>.pdf` beside it, and with `png: true` one `page-NN.png` per page in `<deck name> pages/`. It returns `{ pptx, pdf?, pngs, openQuestions, plan, log }`: `openQuestions` is every `[Confirm: …]` the deck prints with the question behind it plus the copy's own list (write it to `open-questions.md`); `plan.modules` is every module with `built | merged | omitted | cut`, its host and the failed trigger (guide 3.5 rule 8, for `run-summary.md`); `log` holds copy fallbacks, prose trims and render notes. PDF and PNG need `soffice` and `python3` with PyMuPDF; when either is missing the deck is still written and `log` says why. Titles are set in Georgia: a machine without it should have its metric twin Gelasio installed (this one has it in `~/.fonts`) or LibreOffice substitutes a face with other widths in the PDF; the .pptx is unaffected.

Ridgeline renders to 23 pages (no dividers): cover, disclaimer, contents, S1.1–S1.4, S2.2, S2.3, S4.1, S4.2, S5.1, S6.1, S6.3, S6.4, S7.1, S7.2, S8.1, S9.1, S10.1, S10.2, S11.1, S11.2. The deck passes the pptx skill's `validate.py`.

Needs from others:

- **Data layer:** `gatherIntake` reports `cim-copy.fixture.json` in the Ridgeline folder as "Skipped: unsupported file type", which fails `tests/ingest-sample.test.ts` ("uses every file"). It is the CIM engine's reviewed copy for the sample, not a source; please add it to `INTAKE_FILES` (or ignore it) with a `used` string such as "CIM copy fixture (used when no API key is set)". *Resolved by the integrator, with that string.*
- **Integrate:** rewire `pipeline.ts` to the entry point above (it still calls `buildDeck` and passes an `assumptions` field that `draftCimCopy` accepts and ignores; drop it). Record `draft.source` in `run-summary.md` (fixture and template are both "no Claude" but read differently), list `cim.plan.modules` and `cim.log` there, and use `cim.openQuestions` for `open-questions.md` instead of `placeholders(copy)`. `tests/pipeline.test.ts` tests the retired deck (10 slides, `investment_highlights` copy, `CimCopySchema` from `narrative.ts`, `clampWords`) and needs rewriting against `buildCim`; `tests/cim-deck.test.ts` shows the fixture set-up. *Resolved by the integrator; `buildDeck`, `drafted`, `assumptions` and `placeholders()` are removed.*
- **Model (minor):** `customers.retention.ltm.dollars` is all zeros while `byFiscalYear` carries the dollar bridge; the CIM prints the fiscal-year bridge, so nothing is wrong on the page today.

---

## Integrate (pipeline, CLI, run-summary, open-questions, demo)

Owner: integrator. Wires the three together, keeps `npm run demo` and the test suite green, and writes `run-summary.md` / `open-questions.md` from `ModelOutput.modules`, `checks` and the CIM's placeholders.

Delivered:

- `src/pipeline.ts`: `gatherIntake` → `defaultAssumptions` → `runModel` → `writeWorkbook` (version `v01`, kept in the file name per guide 5.13: `<code> - Financial Model v01.xlsx`) → `verifyWorkbook` (errors, mismatches and lint all block delivery) → `draftCimCopy` → `buildCim` with `{ pdf: true, png: true }`. `PipelineResult` carries the folder, the workbook, deck, PDF and page images, the verification, `masterCheck`, `copySource` (`claude | fixture | template`), the page count, warnings and open questions. A request with no fiscal year of P&L throws `NeedsInfoError` before any output folder is created.
- `open-questions.md`: `cim.openQuestions` (every printed `[Confirm: …]` with its question, plus the copy's own list); proposed and supported schedule rows with their basis (memo rows marked memo only), then the accepted rows resting on management representation; `dataset.warnings` (the C12/C13/C14 pre-checks, the `[S3]` proxy line, "No structured intake facts"); remaining copy-lint issues when any; every omitted CIM module with its failed trigger (guide 3.3); the standard review list.
- `run-summary.md`: deliverables (tab count and master check; page count, draft status and copy source; PDF or the reason it is missing; page images), deal profile (mode with its measure and threshold, deal form with its basis, periods), headline numbers from `periods` and `ladder` (FY columns, the LTM when it differs from the latest FY, PF; SDE only in Main Street mode), sources with the intake-facts origin and the reconciliation count (material rows listed), the file table, verification counts, tabs, `model.modules`, the full C01–C37 table, the CIM's pages with the modules each carries, every omitted or cut module with its reason (guide 3.5 rule 8), and build notes.
- `src/cli.ts`: new per-request lines (formulas verified and master check; pages, copy source, PDF and images; open questions and warnings) and an accurate no-API-key note. `--no-update` is unchanged; `npm run demo` leaves the request list byte-identical.
- `tests/pipeline.test.ts` rewritten against the rebuilt bot: the output folder (PDF and page images when `soffice` is installed), verification with no errors, mismatches or lint and "All checks OK", the 38-tab order on the ingested sample, the fixture copy, 20–28 pages, no price talk, em dash or unresolved token in the deck text, the open-questions and run-summary contents; a second deal built from the sample's annual exports, notes and add-back list only (annual mode, templated copy, no intake facts); and the `NeedsInfoError` path.
- Cross-agent fixes: `cim-copy.fixture.json` is recognised by `src/ingest/index.ts` ("CIM copy fixture (used when no API key is set)") and asserted in `tests/ingest-sample.test.ts`; the legacy `buildDeck`, `DraftResult.drafted`, `NarrativeContext.assumptions` and `placeholders()` are removed; `onVariable` is declared in `src/types/fast-formula-parser.d.ts` and `verifyWorkbook` no longer types its config locally; the unused `ShapeName` alias in the fixture is gone; `jszip` (imported directly by `design.ts`, `verifyWorkbook.ts` and the tests) is now a direct dependency.
- Two defects the annual-only run surfaced, fixed at the root: (1) `layoutPage` refused S7.1 when two long adjustment labels wrapped, because its only remedy was dropping observations from the other column; `fitOverflow` in `src/cim/design.ts` now acts on the column that runs past the guard (drop its last observation, else set its numeric tables at the spec's 8 pt floor, else drop an observation anywhere), and logs the step. (2) Default labels built from account names printed a spaced dash ("Service revenue - residential"), which the copy lint flags and guide 4.4 bans; `clientLabel` in `src/util/tables.ts` (replacing `sentenceCase`) puts the qualifier in parentheses ("Service revenue (residential)") for revenue lines, debt-like items and non-operating rows. Tests in `tests/parsing.test.ts` and the annual pipeline test.
- Docs: `CLAUDE.md`, `README.md`, `docs/REQUEST_LIST.md` (request columns the bot does not read are marked so; `cim-copy.fixture.json`; reconciliation reporting) and `.env.example` describe the rebuilt bot.

Verified: `npx tsc --noEmit` clean (also under `--noUnusedLocals --noUnusedParameters`); `npx vitest run` 19 files, 193 tests passing; `npm run demo` writes the v01 workbook (38 tabs, 9,798 formulas, 8,332 compared, 0 errors / mismatches / lint, All checks OK), the 23-page deck, its PDF, 23 page images, `open-questions.md` and `run-summary.md`; `recalc.py` on a copy of the workbook reports `total_errors: 0`; `validate.py` on the deck passes.

Open (not blocking):

- C37 (workbook render QA) stays `n.a.`: the pipeline renders the CIM, not the workbook. Recording C37 would need a workbook PDF pass with print-scale and page-cut checks.
- The data layer's optional type requests (`PayrollRecord.payBasis` optional; `SourceReconciliation.line` + `"deposits"`) are not applied: both change consumers in the model and CIM, and neither blocks anything.
- `intake.yaml` is not read (no YAML dependency); `intake.json` is the structured form.
- The Claude drafting path has not been exercised live here (no API key); it is covered by type checks and the shared lint.

---

## Fixer (QA round 1)

Owner: the QA round 1 fixer. Fixed the 66 findings at the root where the finding's evidence could be reproduced; the rest are listed under "Not done" with the reason. Shared types changed additively only (`CheckStatus` gains `"Pending"`; `DealStructureColumn.allocation?`; `ValuationInputs.scenarioLadders?` and `assetsAtClose?`; `DealAssumptions` gains four inputs).

What changed, by area (finding numbers in brackets):

- **Periods and windows** [1, 48, 49, 50, 52, 56, 57]: `scheduleFor` fills [S2] and [S3] in every grid month, stub included, so YTD, LTM and PF agree between engine and workbook for an as-of month that does not close the year. Lower-middle-market deals keep an [S3] row at zero. Balance-sheet columns come from every dated sheet. Stub add-backs follow their account or their dated months. An advisor's [S2] row sets the replacement-salary input, so the engine's recomputed [S2] carries the advisor's amount.
- **Engine and data** [5, 6, 10, 53, 54, 55, 59, 60, 61, 62, 65, 66]:
  - Cohorts carry a `Pre-FY` row and are keyed by fiscal year.
  - The owner's employer payroll taxes are an [S4] row, proposed until accepted.
  - The Main Street scenario block is built in monthly mode too, and each case is valued on its own pro forma SDE, which turns C29 live.
  - A shareholder receivable lowers adjusted NWC.
  - An undated customer is classified by revenue.
  - Calendar columns that straddle a June fiscal year are left out and reported.
  - C14 compares only a 12-month deposit year.
  - Growth from a loss gives a `.turn` token instead of "(decline)".
  - Department average pay is divided by average FTE.
  - `clientLabel` keeps proper nouns.
- **Workbook** [2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 63]:
  - Printing: the Print-mode rule skips white header text. Print legibility is planned by `fitPrintWidth` in `src/model/sheet.ts`: text columns narrow first, then the tab turns landscape, with a floor of scale 82. `wrapLongLabels` wraps long labels, `dropEmptyNotesColumn` removes empty notes columns, and `freezeWideOnly` freezes only wide tabs. Adjustments prints the schedule and the values as two areas with repeated titles.
  - Links instead of typed values: Databook-linked balances replace typed ones, and a lint catches typed copies and file paths.
  - Valuation and Deal Structure: the SBA-only DSCR sits beside the reference-structure DSCR with the binding case named. The sensitivity frontier box is drawn and the 0.25x axis prints at 0.00x.
  - Scenarios: the Main Street scenario block is on Assumptions.
  - Definitions: KPIs have scoped denominators ("per listed customer"). Ladder SUMIFS run over whole columns.
  - Names: LOIDate, SigningDate, EffectiveDate, Offer_* and Monthly_* are defined.
  - Ties and schedules: the Databook ties period by period (`SUMXMY2`). Monthly add-backs are formulas on their account. Proof of Cash months come from AsOfDate, with a 5% flag.
  - Deal Structure: Form 8594 allocation, the stock-consideration tax flag, and credit cards split from liens. True-up, deferred-revenue treatment and premises inputs are on Assumptions.
  - Presentation: version log order fixed, empty divider, raw tabs in 5.10 formats, n.a. fill, title-case subtitles.
  - Verifier coverage: every formula on an output tab has an engine expectation, and `verifyWorkbook` lints any that do not.
- **C37 render check** [3, 13]: see the design below.
- **CIM** [24 to 47, 51, 64]:
  - Numbers: the revenue mix uses whole shares that add to 100 on the pre-discount base. Rounding is footed as displayed, with the rounding clause added to the note. Deltas are taken from displayed values. Small amounts print "0". `fmtMoney` rounds to the cent first.
  - Consistency and page build: one label means one amount (`labelConflicts`). Obs. columns that key nothing are dropped. Gap columns may only separate figures. The Observations header is drawn once.
  - Typography and titles: curly quotes throughout. Title widows are measured in Georgia Bold 20 (`titleWrap`), and modules may offer title lengths.
  - Column balance: a chart is resized to balance columns (`layoutPage`). S10.2 merges onto S10.1 in place of the term table. S11.1 definitions run on under Sources.
  - Commentary: `commentaryDensity` reports commentary under the 120-word floor and equal observation counts on neighbouring pages.
  - Figures on the page: the add-back quality answer is sized ([N1, N3] at 79 bps). Listed-account retention figures carry a scope takeaway and a reconciliation of the ending revenue. p14 charts the largest cost-ratio changes in place of flat margin bars. Money in the key-figures table is in $000s.
  - Voice and facts: no data-gap language, and unconfirmed debt repayment stays a `[Confirm]`. Customers and non-management staff are protected by name (`protectedNames`, `lintNames`).
  - Claude drafting: it streams at 64k tokens and falls back to the reviewed or templated copy with the reason in `DraftResult.fallback`.
  - S9.1 is held to its guide trigger (see below).
- **Pipeline** [45, 51]: `open-questions.md` asks for year-to-date statements when the financials are more than 120 days old, and `run-summary.md` records the render check and any drafting fallback.

**Departure recorded: Adj. EBITDA after the capital reserve** [35]. `docs/HOUSE_STYLE.md` 5.4 and Q29 put [S3] below SDE, so Adj. EBITDA is after the reserve. `design/FINAL_DESIGN_SPEC.md` §8 has no [S3]. The build follows the guide, which governs the numbers. Until the owner confirms Q29, every page that quotes Adj. EBITDA says it is after the reserve and gives the pre-reserve figure ($438.7K for Ridgeline FY2025):
- the p4 title and Quick Stats context
- the footnote on p4 and p5
- the `adjBeforeReserve` token

If the owner rules for the spec, the change is the [S3] placement in `src/model/periods.ts` (`buildLadder`) and the workbook ladder rows, and the CIM follows through the brief.

**C37 design.** `src/model/renderCheck.ts` works on a copy of the written workbook:
- It renders the copy with LibreOffice (`src/util/office.ts`). For each page, PyMuPDF reads the sheet name from the footer, the commonest body span size, and the spans past the right margin.
- A tab fails for any of these:
  - its body text is under 7 pt, or under 80% of full size for Sensitivities and 90% for Offer Comparison
  - it renders no page
  - text runs past the margin
- `withRenderCheck` writes the result into C37 and the master check. The pipeline then rewrites and re-verifies the workbook, so the file's Checks tab and Cover carry it.
- Without soffice or PyMuPDF, C37 stays `Pending` and the master check reads "All checks OK (render check pending)". The option is `renderCheck: false` in `PipelineConfig`. Ridgeline takes about 5 s and passes at 7.2 pt or more on every printed tab.

**S9.1 held to its trigger** [44]. Guide 3.3 builds Opportunity sizing only when a lever has a baseline and a benchmark or management target. The Ridgeline notes give five levers with baselines and no target, so the page is omitted:
- The levers are named in the executive summary's transaction table.
- The omission reason ("ask the Seller for a target per lever") is listed in `open-questions.md`.
- The page returns once a target is in `intake.json`.
- The deck is now 21 pages.

Not done, and why:

- **Column balance does not throw** [30]. Ridgeline balances on every page, but the templated copy used for a deal without reviewed copy (annual-only test deal: S1.2, S5.1, S7.2, S8.1, S10.1) still leaves gaps of 0.6 to 2.8 in. A throw would fail those builds, so the gap stays a build note in `run-summary.md`. Make it throw once the templated layouts balance.
- **Commentary under 120 words** [31] remains on most standard pages. Their tables fill the band, and the 30-word observation budget holds each item to about two lines. The planner now reports every such page and equal counts on neighbouring pages; the Ridgeline copy no longer repeats counts. Raising density needs a copy pass and wider observation budgets, page by page, against the layout.
- **One term per population** [37]: "account" versus "customer" is not linted; that needs a vocabulary rule in `copy.ts` and a copy pass. The cross-page count and revenue disagreements it cited are fixed.
- **Charts** [42]: the trailing-twelve-month line on the monthly chart needs a combo chart and the chart post-pass reworked for a second series type. A waterfall label outside a small step needs per-point labels in the chart XML. Neither is built.
- **p12 prose block** [47]: there is no room for 150 words beside the organisation and pay tables without cutting an exhibit.
- **Workbook anatomy remnants** [4, 19, 22, 23]:
  - Ladder row heights still vary where basis text wraps.
  - The Print toggle sits where the plan's toggle column falls on tabs that keep a notes column.
  - PF-method inputs exist only inside the scenario block.
  - Raw tab names carry no period suffix, because `S()` resolves sheet names from fixed keys and a dated name would need a rename pass through every reference.

Verification (final run):
- `npx tsc --noEmit` is clean, also under `--noUnusedLocals --noUnusedParameters`.
- `npx vitest run`: 23 files, 258 tests passing. New tests: `tests/model-print.test.ts`, `tests/cim-fallback.test.ts`, `tests/cim-qa.test.ts`, `tests/qa-round1-engine.test.ts`, and the "QA round 1 fixes" block in `tests/model-workbook.test.ts`.
- `npm run demo`:
  - 10,266 formulas verified, 10,089 cells compared; 0 errors, mismatches or lint findings.
  - "All checks OK" with C37 run: 31 tabs, smallest body text 7.2 pt, nothing past the margin.
  - A 21-page deck with its PDF and page images.
- `recalc.py` on a copy of the workbook: `total_errors: 0` over 10,113 formulas.
- `validate.py` on the deck: passes.

The page list in the CIM section above (23 pages, S9.1 and S10.2 on their own pages) is superseded: Ridgeline is now 21 pages, with S10.2 carried by S10.1 and S9.1 omitted until a lever has a target.

Needs from others:

- **Owner:** rule on Q29 (capital reserve above or below Adj. EBITDA). The deck discloses both figures meanwhile.
- **CIM builder:** tighten the templated copy so its pages balance, then make `layoutPage` throw on a column gap (spec 14).

## Fixer (QA round 2)

Owner: the QA round 2 fixer. All 59 findings were worked at the root: the blocker and every major first, then the minors. Each fix has a test (`tests/qa-round2.test.ts`, the "QA round 2 fixes" block in `tests/model-workbook.test.ts`, and additions to `tests/model.test.ts`, `tests/model-print.test.ts`, `tests/cim-copy.test.ts` and `tests/period-shapes.test.ts`). Shared types changed additively only:
- `financials.ts`: `BankTransaction`, `ExportTotal`, `FinancialDataset.bankTransactions?` and `exportTotals?`, `Adjustment.statutoryTaxesOn?`, the `accrued_bonus_payroll_tax` detail line, and the `"% of sales, latest year"` PF method.
- `types.ts`: `TotalTerm`, `TotalFormation`, `DatabookTotal`, `databook.totals?`, `PeriodValues.ownerPayrollTaxes?`, `STALE_DAYS` and `dataAgeDays`.

**Guide 5.5 needs correcting (owner).** The build departs from `docs/HOUSE_STYLE.md` 5.5 in two places, on purpose:
1. **The reconciliation holdback is a memo inside the price.** 5.5 lists "Reconciliation Holdback (funded to escrow; asset purchase)" as a Use on Sources & Uses. It is part of the purchase price, paid into escrow at close instead of to the Seller. Adding it as a use counts it twice and makes the buyer raise cash the closing never pays out (finding 1). `Deal Structure` prints it as an italic memo under the price, "inside the Purchase Price; not added to Total Uses". Total Uses is price plus fees plus working-capital funding.
2. **The seller memo is split.** 5.5's asset-purchase waterfall has one memo, "Seller-retained cash and NWC (AR + unbilled − AP − accrued)". The build prints three lines: seller-retained cash (Balance Sheet cash at the sheet date), seller-retained NWC (the NWC tab), and their sum. A single line mixed a cash balance with a working-capital figure from another date, and the reader could not tie either to its tab (finding 8).
Please change 5.5's Sources & Uses and seller-proceeds rows to match, or rule otherwise.

What changed, by area (finding numbers in brackets):

- **Deal and valuation** [1, 8, 14, 57]:
  - The holdback and the seller memo, as above.
  - The bridge takes cash and debt from one dated sheet.
  - Scenario defaults: Low and High keep the latest year's cost-of-revenue ratio (the new "% of sales, latest year" method) and hold payroll. Low no longer gets a payroll that shrinks with sales, and High no longer carries the older, worse 3-year blend. Mid is unchanged.
- **Owner compensation** [20, 21, 23]:
  - [S4] (the owner's employer payroll taxes) is accepted when [S1] is documented and sums into the [S1] rung. That is guide 5.4: SDE adds back salary, payroll taxes and benefits.
  - Headline figures: SDE $561,775, Adj. EBITDA $385,725, mode measure $452,525.
  - Payroll excluding the owner is on the payroll register's basis everywhere: cost table, brief and labor KPI.
  - [S4] at statutory rates is now a formula on [S1] in the workbook, with the rates and one Social Security wage base per year as blue inputs on Assumptions [12].
- **Raw tabs and C01** [7]:
  - Every subtotal the export prints is kept (`ReportLines.totals`, `exportTotals`), re-formed from the Databook rows (`src/model/exportTotals.ts`) and tied in cents.
  - The raw tabs print a "Totals as exported" block. The Databook ties P&L and balance-sheet totals by SUMIFS on the raw sections.
  - C01 covers every subtotal and period.
  - Bank lines are kept and classified (Operating, Transfer, Loan, Owner, Reversal, Withdrawal). Proof of Cash sums the Operating lines by month.
- **Workbook print and render** [2, 3, 4, 5, 10, 11, 16]:
  - The ladder's Basis prints beside each row, apart at scale 85.
  - `clippedTexts` and a verifier lint catch text cut at a cell edge in print, and C37 now catches clipping, overlap, empty pages and stretched rows.
  - Widths were fitted to content on Mapping, the raw tabs, the Databook tie block, Contents, NWC and Opportunities.
  - Customer Overview prints currency on its first row and total only. Balance Sheet and NWC head their dates mmm-yy.
- **Colour code, inputs and sources** [12, 13, 19]:
  - Every formula that reaches another sheet is green whatever its role (`fontColorOf`), string builders included. A verifier lint fails a black cross-sheet formula.
  - Proof of Cash flags read the Checks C14 tolerance through a linked cell.
  - The seller's operating facts are blue inputs in an "Operating facts (per management)" block on Assumptions, with units in their labels. The Summary links them in green.
  - The Main Street threshold and the structure preset, which no formula reads, are grey reference cells.
  - Source and Basis cells are in plain words. A verifier lint fails a guide section, open-question number or precedent key (ICP5, BENP, SUNPA, SUN) in any cell outside the raw tabs.
- **Checks** [17, 54, 59]:
  - C03 recomputes every P&L Summary line as the grid's months to the window's end less those before its start. The grid's own SUMIFS block could not fail.
  - C19 ties the debt-like total to what NWC removes at the latest date. Accrued bonuses and payroll taxes payable are a detail line in `DEBT_LIKE_LINES`, the one list both the debt-like schedule and NWC use, so a balance is never deducted twice.
  - The master check pluralises.
  - The test count is dropped from CLAUDE.md and README.
- **Schedule and Databook** [15]:
  - The Databook ref column lists every row an account feeds, [D3] and [S3] for depreciation included.
  - "Personal?" flags only personal or discretionary hints, never a one-time legal fee.
  - Guide 5.3 now documents what the code does: `Capital reserve` as a category, `To be requested` evidence (for a computed row awaiting its document), the auto-accepted interest-income [N] row, [S3] and [S4].
- **Named outputs** [18]:
  - GDR_LTM and NDR_LTM are defined only when the LTM closes a fiscal year. Otherwise the engine's values are null and the names are absent, so a fiscal-year figure is never labelled LTM.
  - Tested on the Jul-25 as-of case.
- **Robustness** [44 to 53, 55, 56, 57]:
  - Blocker: `fitNotes` fits the notes band instead of refusing a page.
  - Period labels on fiscal-year tables.
  - Customer active-at has one definition, and LTM customer windows are priced over years the list covers.
  - S8 stands alone at dated sheets.
  - The fiscal-year disclosure survives a full band, and the ingest warnings are right.
  - `tests/period-shapes.test.ts` runs a mid-year as-of date, a June year-end, 14- and 18-month data and bank months outside the P&L end to end.
- **CIM** [22 to 43, 51, 58]:
  - Invented facts: the transaction claim and the seasonal cause are cut, and the reserve is called an AMB estimate with its footnote.
  - Data guards drop placeholder-only columns and list the question. A question recorded without a placeholder (a column left out, a contractor license not listed) now reaches `open-questions.md`: `collectOpenQuestions` used to keep only questions tied to a printed `[Confirm: …]`.
  - Planner warnings: `mixedUnits`, `narrowTables`, `orphanMarkers`, `exhibitCounts` (at most three exhibits a page), and a 0.8 fill floor on body pages S2 to S9.
  - Charts are at least 2.60 in tall.
  - S5.1 is text-led, with run-in paragraphs built from the notes' facts.
  - Copy lint: open claims, a period for every title figure, and the article before a figure.
  - Cost table: lines in order of latest share, "Payroll taxes" named by its parent account, "Δ bps" with the span in the units, and the adjustment an account carries ("Adjusted in [N2]").
  - Growth reads n.m. under $10K or 1% of revenue.
  - Ref headers are left-aligned. Trailing markers are tied to their word by a non-breaking space.
  - S2.2 milestones become a "History." paragraph when the page already has three exhibits.
  - S10: the process table is `# | Stage | What happens | Target timing`, the contact block is headerless, and the ICP1 no-contact line is verbatim.
  - The real-estate term is footnoted (1). The overview adds the customer sentence.
  - The appendix names source periods (Dec-23, Jan-25 to Dec-25). It also says 2026 year-to-date results are not included and have been requested.

Deviations to know:
- The fill floor (0.8) applies to body pages S2 to S9 only. S1 pages carry the headline tables and S10/S11 are reference pages.
- Debt-Like Items, Deal Structure and Checks stay landscape. Their width is text, and portrait would print under the 7 pt floor. Guide 5.11 now records this exception.
- The Ridgeline copy fixture gained observations (S2.2 discounts, S2.3, S6.1, S6.3), lengthened two (S4.1, S4.2) to balance their pages, and has rewritten titles. Every figure is still a brief token. The copy lint is clean.

Not done, and why:
- **Scenario rows [14]**: the guide's per-case rows (replacement salary, reserve, deferred capex, equity injection, loan term and rate by case, with Basis and Source) are not added. Deferred capex still reads one input. The engine and both workbook tabs need a case dimension on the deal inputs, and the valuation grids follow. Only the defaults and the new method were changed.
- **Mode as a formula [13]**: MainStreetMode stays a typed input set by the bot's rule. A formula on the threshold would run MainStreetMode, then the measure, then PF Adj. EBITDA, then [S3], then MainStreetMode, a circular reference unless the measure is rebuilt from the rungs below [S3]. The threshold is a grey reference cell meanwhile.
- **C03 on the other period tabs and the C35 strip [17]**: C03 covers the P&L Summary only. Adj. EBITDA, Adjustments, Revenue Detail and Expense Detail need the same bounded recompute, and C35 still skips the Customer Retention strip.
- **Repeated observation position [41]**: the list still sits bottom right on most pages. Alternating placement by archetype is a planner change across every page, and each page's column balance would have to be re-proved.
- **S6.4 [32]**: the title was rewritten to what the page shows. The trailing-twelve-month line and the seasonality-index row need the combo-chart work already listed under QA round 1 [42].
- **One population term [37]**: "Other (n types)" is fixed, and the monthly appendix names its twelve months FY2025 when the LTM is the fiscal year. "Customers", "accounts" and "listed commercial accounts" are still not linted to one term.
- **Build notes that remain**: S5.1 drops one observation to fit, and S6.1 sets its income statement at 8 pt (the 8 pt floor holds). Both are logged in `run-summary.md`.
- **Verifier shim**: `fast-formula-parser` does not broadcast a range compared with a scalar. `SUMPRODUCT(--(LEN(range)>0))` (Valuation's offer count) evaluates to 1 whatever the range holds, and passes only because Ridgeline has one offer column. C03 avoids the form. The offer count or the shim should be fixed.

Verification (final run):
- `npx tsc --noEmit` is clean, also under `--noUnusedLocals --noUnusedParameters`.
- `npx vitest run`: 25 files, 306 tests passing.
- `npm run demo`:
  - 10,851 formulas verified, 10,830 cells compared; 0 errors, mismatches or lint findings.
  - "All checks OK" with C37 run: 31 tabs, smallest body text 7.0 pt, nothing clipped, overlapping or past the margin, no empty page, no stretched row.
  - A 21-page deck with its PDF and page images, and 14 open questions.
- `recalc.py` on a copy of the workbook: `total_errors: 0` over 10,854 formulas.
- `validate.py` on the deck: passes.
- Changed pages and tabs were rendered and read: deck pages 4, 6, 8, 11, 13, 14, 16, 19 and 20; workbook tabs Summary, Assumptions, P&L Summary, Adjustments, Customer Overview, Balance Sheet, NWC, Proof of Cash and Checks.

Needs from others:
- **Owner:** correct guide 5.5 as above (holdback memo inside the price; seller memo split), and rule on the per-case scenario rows [14].
- **Model builder:** apply C03's bounded recompute to the other period tabs, and extend C35 to the Customer Retention strip [17].
- **CIM builder:** alternate the observation block's position by archetype [41], and add the trailing-twelve-month line and the seasonality index to S6.4 [32].

## Fixer (QA round 3)

Owner: the QA round 3 fixer. The blockers (26, 44, 45) and majors went first, then the minors. Each fix has a test: `tests/qa-round3.test.ts`, the QA round 3 blocks in `tests/model-workbook.test.ts` and `tests/model-print.test.ts`, and additions to `tests/period-shapes.test.ts`, `tests/cim-copy.test.ts`, `tests/pipeline.test.ts` and `tests/qa-round2.test.ts`. Shared types changed additively only:
- `types.ts`: `FinancingCase.marketReplacement?` and `capitalReserve?`, `retention.byWindow?`, `DebtLikeSummary.checklist?`, `byDepartment[].wages?` (the register's gross pay, before employer costs).
- `assumptions.ts`: `SCENARIO_FINANCING_KEYS`, `ScenarioDrivers.financing?`, `scenarioInput`.
- `charts.ts`: `ChartPlacement.separators?`. `checks.ts`: `also?` on a check (the other tabs that carry it). `brief.ts`: `Figure.population?` and `Brief.customerNoun`.

What changed, by area (finding numbers in brackets):

- **Workbook print and C37** [1, 7, 8, 16, 18]: row heights come only from wrapped text that prints on the figures' range; the paginator keeps a heading with its block and never breaks inside a key-total box; C37 fails a block split across pages, a page of furniture only and a stretched row. The Print toggle sits at the right end of row 3 (`toggleAtRightEnd`), carved from a wide notes column so no print area widens. Raw tabs print their bold headers whole, with a source line and short titles.
- **Ladder and checks** [2, 3, 15, 19]: only accepted rows are rungs; a proposed row stays on the Adjustments tab and in `open-questions.md`, and each rung is still gated on its Status cell. Raw - Payroll holds the export's values; the tie-out is formulas. Long formulas moved to helper rows (window shares, C03 per-line and C15 per-tab parts). Contents' Check column reads the checks each tab carries.
- **Annual-only Main Street** [4, 46]: Revenue and Expense Detail are built from FY columns plus Low / Mid / High, the P&L Summary carries the 5.2A lower block (EBITDA bridge, SDE, DSCR, valuation, financing), and the Summary's case columns follow the value columns it has.
- **Valuation, scenarios, deal** [5, 12, 21]: DSCR under 1.25x is flagged in words. The scenario block has the six per-case financing rows (replacement salary, reserve, deferred capex, equity injection, loan term and rate) with a Basis column; Valuation reads them by case. The earnings basis block has its own header.
- **Periods and signs** [10, 11, 14, 17, 22, 23, 44, 45]: prior-year YTD and LTM growth by year-earlier SUMIFS; detail tabs carry the PF vs LTM deltas; retention by window; (-) rows negative everywhere; Top10Share_LTM defined only when the list covers the LTM; MC-R2 plots the discount remainder so the mix sums to revenue; one-time items with accounts take the months the account ran above its median; a column the grid does not cover reads the annual Databook; a 12-month grid builds.
- **Other tabs** [9, 13, 20]: the Cover prints black in Print mode, with no status line; Debt-Like Items lists the 5.6 standard items as Open, and `open-questions.md` asks for each; the Databook's Personal column holds the tag and its total rows sum by period.
- **Demo coverage** [25]: `tests/period-shapes.test.ts` runs a Jun-26 as-of case end to end, so YTD and LTM windows that differ from the fiscal year are exercised.
- **CIM render** [26]: every chart frame is measured in the PDF; a blank one triggers a fresh-profile reconversion, and after three the PDF is withheld and the run reports an error.
- **CIM keying, fill, voice** [27, 28, 29, 30, 43]: a dropped observation takes its letter out of the tables, and `layoutPage` warns when letters and tables disagree. S1.2 carries the earnings build under the list. A page under the 80% fill floor grows a chart in its last row (`growToFill`). Owner responsibilities prints a column the notes fill at least once, its gaps as [Confirm: …]; an empty column is left out and asked (so the QA round 2 rule stands). The people prose is written as sentences. The service lines table no longer repeats the revenue table's figures. Mechanism clauses were added to S2.2, S2.3, S6.4 and S8.1.
- **CIM numbers reconcile** [31, 32, 38]: compensation is grouped as the P&L books wages (field departments against office and management), a one-person department never shows pay, and the note bridges the field row to the P&L technician wages when they tie within 1%. Pay tokens exist only for those rows (`hc.group.*`). `cust.billedCount` pairs with `cust.codedShare`; brief figures carry their population, and the copy lint fails a clause that pairs two populations. Maintenance agreements are 9.5% of revenue everywhere, or 9% "before discounts".
- **CIM footnotes and notes** [33, 36, 42]: copy writes `{{fn.mgmt}}`; each page numbers it against its own footnotes. The non-GAAP sentence is in the Note line and names only the measures shown; the unaudited sentence and the source periods are cut last. Buyer-facing notes say "adjustments shown are those included in Adj. EBITDA"; "requested" and the data-room claim became open questions; PF rows print only when a pro forma adjustment is included.
- **CIM tables and charts** [34, 35, 39, 40]: refs share one bracket ("[S1, S4]") in a 0.50 in column; a footnote marker that would wrap its label moves to the ref cell; numeric columns keep spec widths and a table's exhibit rule stops at its right edge. Waterfall totals maroon, increases blush, decreases slate, and a thin step's figure sits above its bar. Chart and table labels match ("Other, 4 types"). Negative bps use U+2212.
- **CIM terminology and voice** [37, 41]: "total operating expenses" for the figure with owner pay, "revenue" not "sales", with a lint for both; titles lead with a word; "management representation"; stage 8 of the process table has a timing.
- **Robustness** [47 to 57]: non-finite figures print n.a. and the deck is scanned for NaN, Infinity, undefined and "{{"; the Claude drafting call no longer sends a beta the installed SDK rejects, and intake transcription accepts facts the notes do not give as null; KPI periods sort by date; one label per definition; Real Estate stays in modules omitted until the tab exists; review counts print as sourced; observation keys are sent unambiguously; the one-year proxy source reads "FY2025 depreciation expense".
- **Second pass (after a session restart)** [37, 39, 43, and two latent bugs]:
  - One noun for customers: the customer list's term (`customerNoun` in `src/util/format.ts`, `Brief.customerNoun`) replaces "account(s)" in the customer sense in every exhibit, template, definition and brief label, and in the Ridgeline fixture; a source's own words (the intake's "introduce commercial accounts") print in the deck's noun (`withCustomerNoun`). The copy lint fails a customer-sense "account" or "client" (`customerNounVariant`), and `tests/cim-deck.test.ts` scans every page's text, tables and notes.
  - One name per role: the people prose takes role names and counts from the payroll register (`rolesAtAsOf`, shared with the organization table), and the field workforce is "field employees" everywhere (the pay group, the fixture); the lint fails "field technicians", "field staff" and "field team".
  - S6.4: a bar whose label the trailing-twelve-month line would strike takes its label inside its top in white (`insidePoints`); the line no longer crosses any figure. Quarter growth tokens (`q1.yoy.FY2025`, `q.yoyLow/High`) back an observation that growth was spread across the year.
  - Chart patches are matched to chart files by rank: pptxgenjs numbers chart files from a counter shared by every deck in the process, so a second deck in one `bot run` lost every patch (colours, legends, waterfall labels, the trailing line's marker). The waterfall test failed only when run after other decks; a test now builds two decks in a row.
  - C37 no longer reports an empty page a second time as a widow.
  - Two QA round 1/2 tests read the old layout (the DSCR note now starts "SBA loan only:"; C03 totals one helper row per line) and now assert the new one, helper rows included.

Deviations to know:
- **QA round 3 and QA round 2 disagreed twice.** F35 asked for spec column widths with the table at the left of its span, where QA round 2 set every table to its block: the table now keeps spec widths and its exhibit rule stops with it, so no rule runs past the figures (`narrowTables` now measures against the rule). F29 and F43 offered [Confirm] columns, where QA round 2 bans a column of placeholders alone: a column prints when the notes fill at least one cell, and an empty one is asked in `open-questions.md`.
- The Ridgeline sample's [N3] description is shortened to "Owner family phones and meals" (F34), in `adjustments.csv`, the fixture and DATA_CONTRACT.
- The copy fixture's titles, several observations and all 29 "(1)" markers were rewritten; every figure is still a brief token and the lint is clean.

Not done, and why:
- **Adjustments inputs in print [24]**: the schedule's blue period inputs (N8:W24) stay outside the print area with the purple mirror printed instead. Printing them beside B:C stretches every row to the wrapped Basis heights and breaks the page.
- **Whole-column Databook references [20]**: the SUMIFS pair each Databook row with the Raw row at the same offset; whole-column ranges would misalign them.
- **LTM and PF columns on the detail strips [11]**: adding them pushes the strip's print range under the 7 pt floor; the guide now records the strip as strip-only.
- **S6.4 annotation [39]**: the range keeps the guide's spaced en dash form ("Jan-23 – Dec-25"): the design spec sends monthly series to guide 2.6, which prescribes the range as the annotation (D7).
- **Commentary floor [43], in part**: S4.2 now clears 120 words (a fifth observation, on new-customer revenue) and S4.1 rose from 73 to 100 (an observation reconciling the 56 billed with the 52 active). S1.4 (50, its commentary is the considerations table), S6.1 (112), S6.3 (99), S6.4 (61), S7.2 (62) and S8.1 (89) stay under the floor: S6.1, S6.3, S7.1 and S8.1 are full, and one more observation on S6.4 or S7.2 makes two consecutive pages carry the same count (guide T9; the planner logs it). Each shortfall is a build note in `run-summary.md`.

Needs from others:
- **Owner:** confirm the two QA round 2 / QA round 3 rulings above (table width and placeholder columns) in the design spec, and rule on printing the Adjustments inputs [24].

Verification (final run):
- `npx tsc --noEmit` is clean.
- `npx vitest run`: 26 files, 362 tests passing.
- `npm run demo`: 11,501 formulas verified, 0 errors, mismatches or lint findings; "All checks OK" with C37 run (31 tabs, smallest body text 7.2 pt, no empty or widow page, no block split); a 21-page deck with its PDF and page images, copy lint 0 issues, 24 open questions.
- `recalc.py` on a copy of the workbook: `total_errors: 0` over 11,348 formulas. `validate.py` on the deck: passes.
- Rendered and read: deck pages 7, 10, 11, 12, 14, 15, 16, 17, 18; workbook tabs Summary, Contents, Assumptions, P&L Summary, Adj. EBITDA, Adjustments, Revenue Charts, Debt-Like Items and Valuation.

## Fixer (verification round 1)

Owner: the verification round 1 fixer. The independent verifiers found 14 QA round 3 items still open and one regression; each was worked at the root, majors first. Every fix has a test: `tests/qa-verify1.test.ts`, the "verification round 1" block in `tests/model-workbook.test.ts`, the row-height and hidden-spill blocks in `tests/model-print.test.ts`, and updated assertions in `tests/cim-deck.test.ts`, `tests/qa-round2.test.ts` and `tests/qa-round3.test.ts` where the behaviour changed on purpose. Shared types are unchanged.

What changed (finding numbers in brackets):

- **R1 / [40] p14 chart signs.** `costShiftChart` read the table's U+2212 minus as a plus, so the bars showed cost-ratio decreases as increases. It now reads cells through `parseSigned` (`src/util/format.ts`), which takes U+2212, the en dash, a hyphen and parentheses, and labels the bars `"+"#,##0;"−"#,##0;"–"`, the table's own glyphs.
- **[28] p5 empty region.** `layoutPage` finds empty regions on an occupancy grid of block footprints (`emptyRegion`, `footprintW`, `columnArea` in `src/cim/design.ts`), so the space beside a table narrower than its column counts, not only the depth under a column. Width is counted in column area with the gutters left out. The earnings build now runs the list's width, with growth columns and a one-line Basis per row. No Ridgeline page reports a hole.
- **[29] p7 owner table.** Ridgeline's notes fill 1 of the table's 12 cells. A table filled below half is not built (`ownerTableFilled`), S5.4 is omitted with that reason, and each short column is an open question. The buyer page carries "Adjustments by evidence" in its place: add-backs grouped as documented, calculated, management representation or AMB estimate, with deductions and the net. Its groups sum to the ladder's net in every column, and new brief tokens back it (`adj.documented`, `adj.addBacks`, `adj.repShare`, `adj.deductions`). The fixture's S1.4 observations key to it (five, so the page balances and T9 holds), and the Owner-involvement row keeps the commercial-service fact. A deal whose notes fill the owner table still gets it.
- **[8] Row heights.** The QA renderer's half-empty rows come from text that wraps into more lines in Excel's column metrics than in LibreOffice's print layout, since LibreOffice sizes rows with the first and prints with the second. LibreOffice's layout was measured on the render: 7.40 px a width unit, about 3 px of padding, and an indent is ignored unless the cell is left- or right-aligned. `settleWraps` (`src/model/sheet.ts`) widens a column, or else narrows it, by the least that makes each row's tallest wrapped cell break the same in both. It stays within 12% of the width and above the column floor, never cuts a one-line label, and never takes the tab under the 82% print scale. Merged notes now count each column's padding (`mergedUnits`), and one-line merged notes, the Adj. EBITDA bases included, carry a fixed body height.
- **[10] Monthly P&L growth.** The prior-year YTD and LTM growth cells are year-earlier SUMIFS on the grid, as on the P&L Summary.
- **[11] Detail strips.** Each strip opens with its LTM and PF columns (links to the summary block), which print with the strip. The strip still prints narrower than the period block, so the tabs print at 7.6 pt. Nothing is written into the hidden prior-month column, and a verifier lint (`hiddenSpills`) fails text there that would spill into print.
- **[13] Debt-like list.** "Unpaid bonuses and payroll taxes" is answered only by a bonus or payroll-tax balance, never by accrued wages, so Ridgeline lists it as Open and `open-questions.md` asks for it.
- **[19] Contents.** A tab's Check cell reads every check that tests it: its own checks, `also` tabs (the raw tabs now map to C01, C12, C13 and C14), C15 on every output tab it scans, and the tab's own red check rows by value (Customer Retention, Cohorts, Balance Sheet and the rest).
- **[20] Databook.** The Personal tag carries its normalization refs ("(+) Vehicle expenses [N1] [N6]"), and the column is sized to it. The export totals select their accounts on the Databook's own rows, by a screen-only section column to the right of the tie. Their ranges run to the blank row under the grid, as the tier totals on Adjustments do, so a row inserted in the grid is counted and stays aligned.
- **[24] Adjustments print.** The schedule's figures (the blue period inputs, their formulas and the monthly spread) sit in a "Figures by period" block under the note. It has one line per adjustment, with its Ref, Adjustment, Tier, Category and Status linked. The block is the only copy of the figures and prints as the second range with B:C repeated. The ladder's whole-column SUMIFS and the tier totals select on the block's linked Tier, Category and Status; `schedRowCell` reads figure columns from the block (`@{adjustments.figN}`). Guide 5.3 records the layout.
- **[37] Role names.** Staff are named by the payroll register's roles wherever a department holds one role: Quick Stats "14 service technicians, 4 install technicians", "Members per service technician", "Service and install technicians", the wage note and the definitions (`departmentRoles`, `rolePlural`, `staffByRole`, `fieldRoles`). The copy lint fails "field service employees" and "installation staff".
- **[38] Member facts.** The member count, renewal, pricing and offer rate stay on p9. p4's Quick Stats row points there, the p5 consideration names the recurring revenue and its growth, and p8's observation cross-references page 9.
- **[41] Figure-led clauses.** The copy lint fails a sentence or a clause after a semicolon that opens on a figure (`figureLedClauses`). An observation's body counts as running on from its lead. The fixture and the templated copy were rewritten to lead with a word.
- **[43] Commentary.** `fitOverflow` shortens a chart toward its 2.60 in minimum before it drops an observation. S6.3 carries mechanism clauses and clears 120 words, and S6.4 and S7.2 rose to 69 words each. S1.4 went from 50 to 91 words with the evidence table.

Deviations to know:
- Guide 5.3's period columns now sit in the Figures by period block, not on the schedule rows (above), and 5.2's record of the strip widths now says the strips print with their LTM and PF head.
- The owner table's QA round 2 and round 3 rules still hold: a column of placeholders alone is never built. The table is also left out when fewer than half its cells are filled.

Not done, and why:
- **Row heights [8], residue.** Seven rows could not be settled within the limits above (Assumptions I19, I27, I116; Adjustments F9 and C44; Checks C43; Databook B60). They sit on tabs at the 82% print-scale floor, so widening would take the text under the legibility floor. Each still prints about one half-empty line in LibreOffice. `wrapDisagreements` lists them.
- **Whole-column Databook ranges [20].** The totals sit in the grid's own columns, so a whole-column SUMIFS there would include the totals themselves, a circular reference. The ranges now run on the Databook's own rows to the blank row under the grid, which is the tier totals' answer to guide 5.5.
- **Commentary floor [43], remainder.** Four pages stay under 120 words: S4.1 (102), S6.4 (69), S7.2 (69) and S8.1 (89). S4.1 and S8.1 have no chart to give up height and no room under their observations. S6.4 and S7.2 sit between pages with three observations each (T9) and have schema room for two, so they reach about 84 words at most. Each is a build note in `run-summary.md`.
