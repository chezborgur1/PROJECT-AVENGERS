# The high-priority request list

One row per business that needs materials. The bot works through rows with
`priority = P1` and `status = new` (or `rerun`), most urgent first (priority,
then due date, then date received). It writes back `status`, `output_folder`,
`last_run` and `last_error`, so the sheet doubles as a tracker.

The sample list is `requests/high-priority-requests.csv`. Keep the live list
in `requests/live-requests.csv` (git-ignored, so client names never reach
GitHub) and point `AMB_REQUESTS_FILE` at it in `.env`. Edit it in Excel or
Google Sheets and export as CSV. Keep the header row exactly as is.

| Column | Required | What to put | Example |
|---|---|---|---|
| `request_id` | yes | Unique ID | `REQ-0007` |
| `priority` | yes | `P1`, `P2` or `P3`. The bot runs P1 by default (`--priority P2` widens it) | `P1` |
| `status` | yes | `new` to queue it. The bot sets `in_progress`, `done`, `needs_info` or `error`. Set `rerun` to rebuild | `new` |
| `received_date` | | YYYY-MM-DD | `2026-09-21` |
| `due_date` | | YYYY-MM-DD. Orders the queue within a priority | `2026-10-02` |
| `requested_by` | | Who asked | `Frank` |
| `business_name` | yes | Legal / trading name, used in the CIM body | `Ridgeline Comfort Services LLC` |
| `code_name` | yes | Project name for the cover, file names and folder | `Project Ridgeline` |
| `industry` | | Plain description | `Residential HVAC and plumbing services` |
| `location` | | City, state | `Columbus, OH` |
| `entity_type` | yes | `S-Corp`, `C-Corp`, `LLC`, `Partnership` or `Sole Prop`. Drives the tax assumption | `S-Corp` |
| `year_founded` | | Year | `2009` |
| `employees` | | Full-time headcount | `24` |
| `fiscal_year_end` | yes | MM-DD | `12-31` |
| `source_folder` | * | Folder holding the business's files, relative to the repo (see below) | `deals/project-ridgeline` |
| `quickbooks_realm_id` | * | QuickBooks Online company ID, after `amb-bot qbo-connect` | `9130355123456789` |
| `owner_replacement_salary` | | Market salary for a manager replacing the owner. Drives the recast. Default $85,000 | `95000` |
| `asking_price` | | Not used in the CIM. For your reference | |
| `notes` | | Anything useful. Claude sees it when drafting | |
| `output_folder`, `last_run`, `last_error` | | Written by the bot. Leave blank | |

\* At least one of `source_folder` or `quickbooks_realm_id`.

## What goes in the source folder

Put everything you have for the business in one folder, ideally under
`deals/` (git-ignored). The bot sorts it out by file type and content:

| File | Used for |
|---|---|
| QuickBooks **Profit and Loss** export (.csv or .xlsx; annual, quarterly or monthly columns) | Historical P&L |
| QuickBooks **Balance Sheet** export | Historical balance sheets |
| Tax returns (1120-S, 1120, 1065, Schedule C) as PDF or scans | P&L and Schedule L balance sheet, read by Claude |
| Bank statements (PDF) or bank transaction exports (.csv) | Cross-check of deposits against reported revenue |
| Compiled / reviewed / internal financial statements (PDF) | P&L and balance sheet, read by Claude |
| `*.md` / `*.txt` intake notes: call summaries, questionnaires | The facts behind the CIM narrative |
| `addbacks.csv` with columns `year,description,amount,type` (`owner`, `discretionary`, `non_recurring`, `other`) | Seller add-backs in the recast |
| `mapping-overrides.csv` with columns `account,category` | Force an account into a category (categories: see `src/domain/financials.ts`) |

When several sources cover the same year, the bot trusts them in this order:
QuickBooks Online API > QuickBooks export > tax return > PDF financial
statements > bank statements. It records which one it used, and it flags
disagreements between sources (e.g. QuickBooks revenue vs the tax return) in
`open-questions.md`.
