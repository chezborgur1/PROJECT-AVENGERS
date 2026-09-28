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
