# AMB material bot

Turns AMB Advisory Services' high-priority request list into first-draft deal
materials in AMB's house style. For each business it produces:

- **A financial model (.xlsx)** built to the model template in
  [docs/HOUSE_STYLE.md](docs/HOUSE_STYLE.md) §5: monthly and annual periods
  (FY-2 to FY, YTD, LTM, pro forma), the adjustments schedule and the
  Adjusted EBITDA / SDE ladder, customer, retention, cohort and headcount
  analyses, balance sheet, net working capital and debt-like items, cash
  flow and proof of cash, a five-year projection, an internal valuation and
  deal-structure section, native Excel chart tabs, 37 model checks and a
  Databook that ties every account to its raw export. Every figure is a live
  formula, and the bot refuses to deliver a workbook whose formulas disagree
  with its TypeScript engine.
- **A CIM (.pptx, plus a PDF and page images)** built to
  [design/FINAL_DESIGN_SPEC.md](design/FINAL_DESIGN_SPEC.md): action titles
  with figures, dense exhibit pages with lettered observations, source lines
  and footnotes. Its length follows the data: a section appears only when
  the request carries the data behind it (Main Street deals run 20 to 28
  pages, lower-middle-market deals 30 to 42 plus an appendix). It never
  states a valuation, multiple or asking price.
- **`open-questions.md`**: every `[Confirm: …]` the deck prints, adjustments
  still to accept, data issues, and the data that would add the sections
  the CIM left out.
- **`run-summary.md`**: deal profile, headline numbers, sources and how
  they reconcile, the verification result, every model check, and each CIM
  section built, merged or left out with the reason.

```
requests/live-requests.csv ──► amb-bot run ──► output/REQ-0007 Project Falcon/
   (P1, status = new)            │                 Project Falcon - Financial Model v01.xlsx
                                 │                 Project Falcon - CIM.pptx
  deals/project-falcon/ ─────────┤                 Project Falcon - CIM.pdf
   QuickBooks exports            │                 Project Falcon - CIM pages/page-01.png …
   tax returns (PDF)             │                 open-questions.md
   bank statements               │                 run-summary.md
   intake notes, intake.json     │
   adjustments, customers,       │
   payroll, KPIs                 │
  QuickBooks Online (API) ───────┘
```

## Quick start

Requires Node 20 or later (developed on Node 22).

```bash
cd amb-material-bot
npm install
npm test          # vitest, all offline (about 4 minutes)
npm run demo      # builds the fictional sample deal into output/ (about 45 seconds)
```

`npm run demo` runs the full pipeline on **Project Ridgeline**, a fictional
HVAC and plumbing business in `samples/project-ridgeline/`, and never
touches the request list. The folder holds QuickBooks P&L exports (annual
and 36 monthly columns) and balance sheets, a year of bank transactions,
intake notes and their structured `intake.json`, an adjustments schedule, a
customer list, a payroll register, operating KPIs, mapping overrides, and
`cim-copy.fixture.json`, the reviewed CIM copy used when no API key is set.
The result is a 38-tab workbook with every check OK, the render check (C37)
included, and a 21-page CIM.

Optional tools, used when installed:

| Tool | Used for | Without it |
|---|---|---|
| LibreOffice (`soffice`) | The CIM's PDF; the workbook render check (C37); the LibreOffice recalculation test | The .pptx is still written; `run-summary.md` says why there is no PDF; C37 stays `Pending` and the master check says so |
| `python3` with PyMuPDF | The CIM's page images, rasterized from the PDF; measuring the workbook's rendered pages for C37 | No page images; C37 stays `Pending` |
| Georgia, or its metric twin Gelasio | Title widths in the PDF (titles are set in Georgia) | LibreOffice substitutes a face with other widths; the .pptx is unaffected |
| .NET SDK 8+ (`dotnet`) | The Open XML SDK validator in `tools/openxml-validate` (`dotnet run --project tools/openxml-validate -- <file>`), the closest offline stand-in for Microsoft Office's own file check; `tests/model-ooxml.test.ts` runs it on the workbook, `tests/cim-office.test.ts` on the deck | Those tests are skipped. The structural check in `src/model/ooxml.ts` still runs on every written workbook, and `verifyWorkbook` refuses a file Excel would repair; `src/cim/ooxml.ts` normalizes every deck and `buildCim` refuses one PowerPoint would repair |

### What needs an API key

Set `ANTHROPIC_API_KEY` in `.env` for three things:

1. **Reading PDFs and images** in the source folder: tax returns (including
   Form 4562 for the capital reserve), bank statements and compiled or
   internal financial statements.
2. **Transcribing intake notes** (`.md`, `.txt`, `.docx`) into structured
   facts with provenance, when the folder has no hand-written `intake.json`.
3. **Drafting the CIM copy**: action titles, observations and paragraphs,
   written against a per-page schema and AMB's voice rules, with every
   figure as a token resolved from the model and one lint-repair round.

Without a key the bot still runs end to end: PDFs and images are skipped
with a warning, `intake.json` still supplies the facts, and the CIM copy
comes from the folder's `cim-copy.fixture.json` when it names the business
(the sample's does) or is templated, with figures from the model and every
qualitative slot a red `[Confirm: …]`.

```bash
cp .env.example .env      # then set ANTHROPIC_API_KEY and the AMB_* contact fields
cp requests/high-priority-requests.csv requests/live-requests.csv
npm run bot -- list       # see the queue
npm run bot -- run        # build everything queued
```

## Day-to-day use

1. **Add a row** to `requests/live-requests.csv` with `priority` P1 and `status`
   `new`. Every column is described in [docs/REQUEST_LIST.md](docs/REQUEST_LIST.md).
2. **Drop the business's files** into a folder such as `deals/project-falcon/`
   and put that path in `source_folder`. QuickBooks exports with monthly
   columns give the most complete model; add tax returns, bank statements,
   intake notes, and any of `intake.json`, `adjustments.csv`,
   `customers.csv`, `payroll.csv` and `kpis.csv` (formats in
   docs/REQUEST_LIST.md). If the client has connected QuickBooks Online,
   fill in `quickbooks_realm_id` instead of (or as well as) exporting.
3. **Run `npm run bot -- run`.** Requests are processed in priority and
   due-date order, and each row's `status` is updated to `done`,
   `needs_info` or `error`, with the reason recorded in `last_error`.
4. **Review before sending.** Work through `open-questions.md`, adjust the
   blue inputs on the model's Assumptions tab, accept or exclude the
   proposed rows in `adjustments.csv` and rerun, and read the CIM against
   the source documents. A CIM with any `[Confirm: …]` left is a draft. The
   bot produces a first draft; an advisor signs off.

Other commands:

```bash
npm run bot -- run --id REQ-0007          # one request, whatever its status
npm run bot -- run --priority P2          # include P2 requests
npm run bot -- run --force                # rebuild requests already done
npm run bot -- run --no-update            # leave the request list untouched (demos, dry runs)
npm run bot -- qbo-connect <realmId>      # connect a client's QuickBooks Online
npm run typecheck                         # tsc --noEmit
```

## How it works

| Stage | Code | What happens |
|---|---|---|
| Queue | `src/requests/` | Validates every row (a bad row is reported, never blocks the rest) and orders the queue |
| Intake | `src/ingest/index.ts` | Routes each file by name and content: QuickBooks exports (`quickbooksExport.ts`, `reportTable.ts`), the QuickBooks Online Reports API (`quickbooksApi.ts`), bank CSVs (`bankCsv.ts`), PDFs and images read by Claude (`aiExtract.ts`), Word notes (`docx.ts`), and the intake files (`adjustments.ts`, `customers.ts`, `payroll.ts`, `kpis.ts`, `intake.ts`) |
| Mapping | `src/domain/chartOfAccounts.ts` | Maps each account onto a standard chart of accounts. Per-deal overrides go in `mapping-overrides.csv`, and anything guessed is flagged |
| Merge | `src/ingest/merge.ts` | Builds one `FinancialDataset` (contract: `src/domain/financials.ts`, `docs/build/DATA_CONTRACT.md`): the monthly grid from the most trusted source with 12 or more months, annual-only mode below that, dated balance sheets, the adjustments schedule with tier codes `[D]` `[N]` `[S]` `[PF]` `[M]`, the Main Street or lower-middle-market decision, customers, payroll, KPIs, intake facts, reconciliations between sources and deposits by month |
| Model | `src/model/engine.ts` | Computes every period column, the ladder, the analyses, NWC and debt-like items, projections, valuation and deal structure, checks C01 to C37 and the named outputs (`ModelOutput`, `src/model/types.ts`) |
| Workbook | `src/model/workbook.ts`, `workbook/*.ts`, `charts.ts` | Writes the §5.1 tabs in order, leaving out tabs whose data is absent, in AMB's styles, number formats, colour code and print setup, with native chart tabs injected into the file |
| Verify | `src/model/verifyWorkbook.ts` | Evaluates every formula independently and compares each planned cell and named output with the engine; lints volatile functions, hard-codes, the colour code and every chart part. A workbook that fails is never delivered |
| CIM | `src/cim/` | `planner.ts` evaluates each section module's data trigger (`sections/*.ts`, S0 to S11), merges thin pages into their named neighbours, cuts to length in the guide's order and numbers the pages; `exhibits.ts` builds the tables and charts from `ModelOutput`; `narrative.ts` and `copy.ts` draft and lint the words; `design.ts` lays out and draws each page to the design spec and refuses to overflow; `render.ts` writes the PDF and page images |
| Review files | `src/pipeline.ts` | Writes `open-questions.md` and `run-summary.md` |

### The model

For a monthly deal (Ridgeline) the workbook has these tabs, in this order:
Cover, Contents, Summary, Assumptions, P&L Summary, Adj. EBITDA,
Adjustments, Revenue Detail, Revenue Charts, Expense Detail, Expense Charts,
Customer Overview, Customer Retention, Retention Charts, Concentration,
Cohorts, Headcount, Headcount Charts, Balance Sheet, NWC, Debt-Like Items,
Cash Flow, Proof of Cash, Projections, Opportunities, Valuation, Deal
Structure, Sensitivities, Checks, then the data tabs (Monthly P&L,
Databook, Mapping and the raw exports). A tab whose data is absent is left
out: an annual-only deal (tax returns or annual statements, no customer
list or payroll register) gets 21 tabs in the Main Street annual layout,
with Low / Mid / High scenarios on the Assumptions tab. Valuation, Deal
Structure and Sensitivities are internal and never feed the CIM.

### The CIM

Sections follow the library in guide §3.3: front matter, executive summary
(company at a glance, investment considerations, financial snapshot,
considerations for buyers), company overview, market (only with sourced
inputs), customers, operations and people, financial performance, Adjusted
EBITDA (reconciliation, adjustment support, SDE in Main Street mode),
balance sheet and cash flow, growth opportunities, the transaction process
and an appendix. Every figure in the copy is a token resolved from the one
model run, so a title, a table and a chart cannot disagree. Facts come only
from the sources: anything missing prints as `[Confirm: …]` and is listed
in `open-questions.md`. Only accepted adjustments appear, each with its
evidence.

### QuickBooks Online setup (once)

1. Create an app at developer.intuit.com (Accounting scope) and put its keys
   in `.env` (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`).
2. For each client: run `npm run bot -- qbo-connect <anything>`, open the URL,
   and have the client (or you, with their login) approve access. Intuit
   redirects to a URL containing `code` and `realmId`. Run
   `npm run bot -- qbo-token <code> <realmId>`.
3. Put the `realmId` in the request's `quickbooks_realm_id` column. Refresh
   tokens are rotated automatically and stored in `.qbo-tokens.json`
   (git-ignored).

### Confidentiality

Client material stays out of git: `deals/`, `output/`, `requests/live-*.csv`,
`.env` and `.qbo-tokens.json` are all ignored. Only the fictional sample is
tracked. Tax returns, financials and intake notes sent to Claude are
processed under Anthropic's commercial API terms. Review them against your
engagement letters.

## Known limits and next steps

- **Projections are driver-based defaults**, not a forecast, and the CIM
  does not show them (guide Q14). Replace the blue assumptions with the
  seller's guidance.
- **Not built yet:** the Offer Comparison and Real Estate tabs (checks
  C23 to C27 and C31 to C33 read `n.a.`), the top-vendor and won/lost-by-month
  chart exhibits (they need vendor-level GL and customer revenue by month).
- **`intake.yaml` is not read**; `intake.json` is the structured form.
- **The Claude drafting path** is covered by type checks and the shared
  copy lint; the offline tests exercise the fixture and templated paths.
- **Request list as CSV.** A Google Sheets or Notion store would drop in
  behind the same `RequestStore` interface in `src/requests/csvStore.ts`.
- **Deal Platform fit.** This is plain TypeScript with no web framework, so
  it can become the "Generate" action in the planned Next.js / Supabase AMB
  Deal Platform (Phase 4), writing outputs to the deal's Drive folder.
