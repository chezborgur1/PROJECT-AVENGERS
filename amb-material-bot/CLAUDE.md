# AMB material bot

Reads a high-priority request list and, for each business, builds a 3-statement
financial model (.xlsx with live formulas) and a 10-page CIM (.pptx). Owned by
AMB Advisory Services (sell-side M&A for Main Street / lower middle market).

## Commands
- `npm test`: vitest, 40+ tests, runs offline
- `npm run typecheck`
- `npm run bot -- list` / `npm run bot -- run [--id REQ-0001] [--force]`
- `npm run demo`: builds the fictional sample deal into `output/` without touching the request list

## Layout
- `src/requests/`: request-list schema + CSV store + queue ordering
- `src/ingest/`: one file per source (QuickBooks export, QuickBooks Online API, Claude PDF extraction, bank CSV) → `merge.ts` picks the best source per year
- `src/domain/`: canonical categories (`financials.ts`) and account-name mapping rules (`chartOfAccounts.ts`)
- `src/model/`: default assumptions, the TypeScript engine, the Excel writer, and the formula verifier
- `src/cim/`: Claude-drafted copy (`narrative.ts`) and the pptxgenjs deck (`deck.ts`)

## Rules
- The workbook formulas and `src/model/engine.ts` must stay in lockstep. `verifyWorkbook` evaluates every formula and compares it with the engine; the pipeline refuses to deliver a workbook that fails it. If you change one, change the other and run the tests.
- Projection cells are formulas driven by the Assumptions sheet. Never write computed numbers into projection columns.
- The CIM must never contain invented facts. Missing information becomes `[Confirm: ...]` and lands in `open-questions.md`.
- Real client data (source files, outputs, the live request list, `.qbo-tokens.json`, `.env`) is git-ignored. Keep it that way. Samples must stay fictional.
- Claude calls go through `src/util/claude.ts` (structured outputs + server-side refusal fallback).
