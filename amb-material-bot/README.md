# AMB material bot

Turns AMB Advisory Services' high-priority request list into first-draft deal
materials. For each business it produces:

- **A three-statement financial model (.xlsx).** Recast historicals, adjusted
  EBITDA and SDE, a five-year projection with a linked income statement,
  balance sheet and cash flow, an indicative valuation range, model checks,
  and an account-level source-data tab. Every projection cell is a live
  formula driven by one Assumptions sheet.
- **A 10-page CIM (.pptx)**, tailored to the business. It is a native,
  editable PowerPoint with charts and tables built from the model. Claude
  drafts the copy from the intake notes and the numbers.
- **`open-questions.md`**: everything the advisor must confirm with the seller
  before anything goes out, plus data issues the bot found.
- **`run-summary.md`**: sources used, headline numbers, checks passed, warnings.

```
requests/live-requests.csv ──► amb-bot run ──► output/REQ-0007 Project Falcon/
   (P1, status = new)            │                 Project Falcon - Financial Model.xlsx
                                 │                 Project Falcon - CIM.pptx
  deals/project-falcon/ ─────────┤                 open-questions.md
   QuickBooks exports            │                 run-summary.md
   tax returns (PDF)             │
   bank statements               │
   intake notes, add-backs       │
  QuickBooks Online (API) ───────┘
```

## Quick start

Requires Node 20 or later.

```bash
cd amb-material-bot
npm install
npm test          # 40+ tests, all offline
npm run demo      # builds the fictional sample deal into output/
```

`npm run demo` runs the full pipeline on **Project Ridgeline**, a fictional
HVAC business in `samples/project-ridgeline/`: QuickBooks P&L and balance
sheet exports, a year of bank transactions, intake notes and seller
add-backs.

Without an API key the CIM is structurally complete, but its qualitative copy
is `[Confirm: ...]` placeholders. To get the real draft:

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
   and put that path in `source_folder`. Include QuickBooks exports, tax
   returns, bank statements, intake notes, and optionally `addbacks.csv`.
   If the client has connected QuickBooks Online, fill in
   `quickbooks_realm_id` instead of (or as well as) exporting.
3. **Run `npm run bot -- run`.** Requests are processed in priority and
   due-date order, and each row's `status` is updated to `done`,
   `needs_info` or `error`, with the reason recorded in `last_error`.
4. **Review before sending.** Work through `open-questions.md`, adjust the
   yellow cells on the model's Assumptions tab, and read the CIM against the
   source documents. The bot produces a first draft. An advisor signs off.

Other commands:

```bash
npm run bot -- run --id REQ-0007          # one request, whatever its status
npm run bot -- run --priority P2          # include P2 requests
npm run bot -- run --force                # rebuild requests already done
npm run bot -- qbo-connect <realmId>      # connect a client's QuickBooks Online
```

## How it works

| Stage | Code | What happens |
|---|---|---|
| Queue | `src/requests/` | Validates every row (a bad row is reported, never blocks the rest) and orders the queue |
| Intake | `src/ingest/` | Each source normalises into one shape: QuickBooks exports (`quickbooksExport.ts`), QuickBooks Online Reports API (`quickbooksApi.ts`), tax returns / PDF financials / bank statements read by Claude (`aiExtract.ts`), bank CSVs (`bankCsv.ts`) |
| Mapping | `src/domain/chartOfAccounts.ts` | Maps each account onto a standard chart of accounts (revenue, COGS, payroll, owner comp, rent, ...). Per-deal overrides go in `mapping-overrides.csv`, and anything guessed is flagged |
| Merge | `src/ingest/merge.ts` | Picks the most trusted source per year. Cross-checks revenue between sources and against bank deposits, and flags likely add-backs (meals, vehicles, one-time legal) for review without applying them |
| Model | `src/model/` | Default assumptions come from the company's own history (growth CAGR fading to 3%, latest-year cost ratios, working-capital days from the balance sheet). The engine and the Excel formulas implement the same logic |
| Verify | `src/model/verifyWorkbook.ts` | Evaluates every workbook formula independently and compares key lines, every year, with the engine. A workbook that fails is never delivered |
| CIM | `src/cim/` | Claude drafts the copy against a strict schema: facts only from the sources, numbers matching the model, word limits that fit the slides. The deck is built with native charts and tables |

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
tracked. Tax returns and financials sent to Claude are processed under
Anthropic's commercial API terms. Review them against your engagement letters.

## Known limits and next steps

- **Full fiscal years only.** YTD / LTM columns are skipped with a warning
  (next: an LTM column in the model and CIM).
- **Projections are driver-based defaults**, not a forecast. Replace the
  yellow assumptions with the seller's guidance.
- **Word (.docx) intake notes** aren't read yet. Save them as .txt/.md, or
  add a converter.
- **Request list as CSV.** A Google Sheets or Notion store would drop in
  behind the same `RequestStore` interface in `src/requests/csvStore.ts`.
- **Deal Platform fit.** This is plain TypeScript with no web framework, so
  it can become the "Generate" action in the planned Next.js / Supabase AMB
  Deal Platform (Phase 4), writing outputs to the deal's Drive folder.
