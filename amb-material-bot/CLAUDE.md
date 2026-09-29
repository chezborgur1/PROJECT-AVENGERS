# AMB material bot

Reads a high-priority request list and, for each business, builds a financial
model (.xlsx with live formulas) and a variable-length CIM (.pptx, with a PDF
and page images), plus `open-questions.md` and `run-summary.md`. Owned by AMB
Advisory Services (sell-side M&A for Main Street / lower middle market).

## The law
- `docs/HOUSE_STYLE.md`: §3 CIM content architecture (section library S0 to S11, density, variable length), §4 writing voice and banned phrases, §5 the model template (tabs, periods, adjustments tiers, ladder labels, checks, styles, formats, chart tabs, named outputs).
- `design/FINAL_DESIGN_SPEC.md`: the CIM design system (grid, type, colour roles, tables, charts, furniture). It wins where HOUSE_STYLE §2 differs.
- `docs/build/DATA_CONTRACT.md` and `src/domain/financials.ts` (`FinancialDataset`), `src/model/types.ts` (`ModelOutput`): the contract between ingest, model and CIM. `tests/fixtures/sampleDataset.ts` is the Ridgeline fixture every layer tests against.

## Commands
- `npm test`: vitest, all offline (about 4 minutes; the LibreOffice tests run when `soffice` is installed)
- `npm run typecheck`
- `npm run bot -- list` / `npm run bot -- run [--id REQ-0001] [--priority P2] [--force] [--no-update]`
- `npm run demo`: builds the fictional Ridgeline deal from `samples/project-ridgeline/` into `output/REQ-0001 Project Ridgeline/` without touching the request list
- LibreOffice check of a workbook: `python3 <xlsx skill>/scripts/recalc.py <copy of file.xlsx> 120` must report `total_errors: 0` (run it on a copy; it saves the file)

## Layout
- `src/requests/`: request-list schema, CSV store, queue ordering
- `src/ingest/`: one reader per source (QuickBooks export and API, bank CSV, Claude PDF and intake extraction, Word notes, adjustments / customers / payroll / KPI / intake.json files); `merge.ts` builds the `FinancialDataset`
- `src/domain/`: the contract types and period helpers (`financials.ts`) and account mapping (`chartOfAccounts.ts`)
- `src/model/`: `engine.ts` (the numbers), `workbook.ts` + `workbook/*.ts` (the tabs), `charts.ts` (native chart injection), `verifyWorkbook.ts` (independent formula evaluation against the engine), `renderCheck.ts` (C37: the written workbook rendered by LibreOffice and measured page by page)
- `src/cim/`: `planner.ts` + `sections/*.ts` (which pages the data supports), `exhibits.ts`, `brief.ts` (figure tokens), `copy.ts` (schema and voice lint), `narrative.ts` (Claude, fixture or template copy), `design.ts` (layout and drawing), `render.ts` (PDF and PNGs), `deck.ts` (`buildCim`)
- `src/pipeline.ts`: one request end to end, and the two review files

## Rules
- The workbook formulas and `src/model/engine.ts` must stay in lockstep. `verifyWorkbook` evaluates every formula and compares it with the engine; the pipeline refuses to deliver a workbook that fails it. If you change one, change the other and run the tests.
- Projection cells are formulas driven by the Assumptions sheet. Never write computed numbers into projection columns.
- The CIM reads figures from `ModelOutput` only, through brief tokens; never type a figure into copy.
- The CIM must never contain invented facts. Missing information becomes `[Confirm: ...]` and lands in `open-questions.md`.
- The CIM never carries a valuation, multiple, asking price or offer structure. Those stay on the model's internal tabs.
- CIM hard bans (guide 2.10, 4.4; `design.ts` has no primitive for the shapes, `copy.ts` lints the words): numbered badges, rounded card grids, stat tiles, letter-spaced caps kickers, decorative shapes, icon rows, accent stripes, full-width header bars, centred body text, stock phrases, labels as titles, em dashes in prose.
- Only `accepted` adjustments enter the ladder and the CIM.
- Every printed workbook tab sets 9 pt body text at 7 pt or more (`fitPrintWidth` in `src/model/sheet.ts`); C37 proves it on the written file, and the master check reads "(render check pending)" until it has run.
- CIM titles wrap without a widow (`titleWrap`, measured in Georgia Bold 20), and the columns of a row end within 0.50 in (`layoutPage` resizes a chart to balance them; anything left is a build note in `run-summary.md`).
- Real client data (source files, outputs, the live request list, `.qbo-tokens.json`, `.env`) is git-ignored. Keep it that way. Samples must stay fictional; `tests/ingest-sample.test.ts` fails if the Ridgeline folder and the fixture diverge.
- Claude calls go through `src/util/claude.ts` (structured outputs + server-side refusal fallback).
