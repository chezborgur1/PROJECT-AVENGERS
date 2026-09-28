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
| `industry` | | Plain description, for the tracker. The CIM takes its description from the intake facts | `Residential HVAC and plumbing services` |
| `location` | | City, state, for the tracker. The CIM takes locations from the intake facts | `Columbus, OH` |
| `entity_type` | yes | `S-Corp`, `C-Corp`, `LLC`, `Partnership` or `Sole Prop`. Drives the tax assumption (pass-through entities carry no entity-level tax) | `S-Corp` |
| `year_founded` | | Year, for the tracker. The CIM prints the founding year from the intake facts | `2009` |
| `employees` | | Full-time headcount, for the tracker. The CIM counts people from the payroll register or the intake facts | `24` |
| `fiscal_year_end` | yes | MM-DD | `12-31` |
| `source_folder` | * | Folder holding the business's files, relative to the repo (see below) | `deals/project-ridgeline` |
| `quickbooks_realm_id` | * | QuickBooks Online company ID, after `amb-bot qbo-connect` | `9130355123456789` |
| `owner_replacement_salary` | | Market salary for a manager replacing the owner. Drives the `[S2]` adjustment (salary plus a 15% burden). Wins over a figure in the intake notes; default $85,000 | `95000` |
| `asking_price` | | Never read by the bot. The CIM carries no price (guide D5), and the model's Valuation tab works from its own multiples | |
| `notes` | | For the team. The bot does not read it; facts for the CIM go in the intake notes or `intake.json` | |
| `output_folder`, `last_run`, `last_error` | | Written by the bot. Leave blank | |

\* At least one of `source_folder` or `quickbooks_realm_id`.

## What goes in the source folder

Put everything you have for the business in one folder, ideally under
`deals/` (git-ignored). The bot sorts it out by file type and content:

| File | Used for |
|---|---|
| QuickBooks **Profit and Loss** export (.csv or .xlsx; annual, quarterly or monthly columns). Export **monthly columns** when you can: they give the YTD and LTM columns, the monthly grid and the seasonality chart, and the year the export ends in may be partial | Historical P&L |
| QuickBooks **Balance Sheet** export (year-ends, or every month-end when a working-capital peg is wanted) | Historical balance sheets, net working capital, debt-like items |
| Tax returns (1120-S, 1120, 1065, Schedule C) as PDF or scans | P&L and Schedule L balance sheet, Form 4562 equipment cost, read by Claude |
| Bank statements (PDF) or bank transaction exports (.csv) | Deposits by month against revenue (proof of cash) |
| Compiled / reviewed / internal financial statements (PDF) | P&L and balance sheet, read by Claude |
| `*.md` / `*.txt` / `*.docx` intake notes: call summaries, questionnaires | The facts behind the CIM narrative. With `ANTHROPIC_API_KEY` set, Claude transcribes them into structured facts with provenance |
| `intake.json` | Structured intake facts written by hand (see below). Wins over the transcription |
| `adjustments.csv` | The adjustments schedule: normalization, owner-compensation, pro forma and memo rows with status and evidence (see below) |
| `addbacks.csv` with columns `year,description,amount,type` (`owner`, `discretionary`, `non_recurring`, `other`) | Legacy seller add-back list. Read only when there is no `adjustments.csv`; each row becomes an accepted normalization row |
| `customers.csv` (or `customers-*.csv`) | Customer revenue by year or month; customers are coded `C-001`… and the names never reach the CIM |
| `payroll.csv` (or `payroll-*.csv`) | Payroll register: roles, departments, dates, wages by year |
| `kpis.csv` (or `kpi-*.csv`) | Operating metrics the sources state (members, renewal rate, fleet, rating) |
| `mapping-overrides.csv` with columns `account,category` | Force an account into a category (categories: see `src/domain/financials.ts`) |
| `cim-copy.fixture.json` | Reviewed CIM copy for a sample deal, used only when no API key is set and only when it names the business. The Ridgeline sample ships one; a real deal does not need it |

When several sources cover the same year, the bot trusts them in this order:
QuickBooks Online API > QuickBooks export > tax return > PDF financial
statements > bank statements. Between two QuickBooks exports, the one with
monthly columns wins. It records which one it used, reconciles every other
source line by line (revenue, COGS, total expenses, net income). Every
difference above 2% is listed in `run-summary.md`, revenue and net-income
differences also go to `open-questions.md`, and the CIM adds its
reconciliation page (S7.4).

Every file is checked against the P&L: customer revenue plus the residual
row against total revenue (check C12), payroll wages plus employer costs
against the payroll line (check C13), and monthly deposits against monthly
revenue (check C14). Anything after the last month of P&L data is left out
and disclosed.

## The intake files

All are `.csv` or `.xlsx` (first sheet). Headers are matched case-insensitively
and loosely (`Start date`, `start_date` and `Start` all work); columns not
listed are ignored. Fiscal-year columns are `FY2025` or `2025`; month columns
are `2025-07` or `Jul 2025`. `samples/project-ridgeline/` has a worked example
of each file.

### adjustments.csv

One row per adjustment. Definitional rows (interest, taxes, D&A) come from the
P&L and are not read from the file; refs are numbered by the bot, so a `ref`
column is ignored.

| Column | Values |
|---|---|
| `tier` | `N` (normalization), `S` (owner compensation), `PF` (pro forma) or `M` (memo); the full names also work. An `S` row may only be the owner's pay, the replacement cost or the capital reserve, which override the bot's defaults; any other owner perk is moved to `N` |
| `adjustment` (or `description`) | Client-grade label without a sign prefix: `Owner's personal vehicle` |
| `category` | `Personal / discretionary`, `Non-recurring`, `Non-operating`, `Accounting (cash to accrual, out of period)`, `Related-party (rent to market)`, `Owner compensation`, `Replacement cost`, `Capital reserve`, `Run-rate`, `Other consideration` |
| `status` | `Proposed`, `Supported`, `Accepted` or `Excluded`. Only **Accepted** rows enter the ladder and the CIM |
| `evidence` | `Documented` or `Management representation` |
| `basis` | One sentence: mechanism, quantum, source |
| `source_document` | `GL detail, account 6420`; `Seller add-back list`; `Lease agreement` |
| `account` | The P&L account the amount comes out of. With a monthly P&L this makes the YTD and LTM amounts exact instead of prorated |
| `pnl_line`, `pf_method` | Pro forma rows only: the P&L line the row restates (`rent`, `payroll`, …) and the method (`Annualized most recent month`, `Contracted`, `Market rate`, `3-year average`, …) |
| one column per fiscal year | Signed: positive raises EBITDA |

### customers.csv

| Column | Values |
|---|---|
| `customer` (or `name`, `id`) | Name or the system's id. Kept for the raw tab only |
| `type` | Deal vocabulary: `Property manager`, `Restaurant group`, … drives the customer mix |
| `segment` | Optional second grouping (market, geography, service) |
| `start_date`, `end_date` | First and last invoice or contract dates; blank end date means active |
| `loss_reason` | `regrettable`, `non_regrettable` or `unclassified` for customers with an end date |
| `contract_basis` | `maintenance_agreement`, `contract`, `recurring`, `time_and_materials`, `project`, `other` |
| `term`, `renewal_date`, `notice_days`, `auto_renews` | Optional contract terms |
| revenue by fiscal year or by month | One column per year or per month |
| `residual` | `yes` on one row holding the customers not listed individually (households on a service business), so the list ties to P&L revenue |

### payroll.csv

| Column | Values |
|---|---|
| `employee` (or `name`) | Kept for the raw tab; only management names reach the CIM, through the intake facts |
| `role`, `department` | Required; department defaults to the role |
| `hire_date`, `termination_date`, `termination_type` | Dates; type `resignation` or `termination` |
| `pay_basis` | `hourly`, `salary`, `hourly + commission`, `contractor` |
| `fte` | Defaults to 1 |
| `owner`, `management` | `yes` flags. The owner's row ties to the owner-compensation line |
| `wages 2025`, … | Gross wages per fiscal year |
| `employer costs 2025`, … | Optional. Without them, the P&L payroll line less wages is allocated to employees pro rata |

### kpis.csv

| Column | Values |
|---|---|
| `metric` | Stable key (`maintenance_members`); `label` is what prints |
| `unit` | `count`, `currency`, `percent`, `ratio`, `hours`, `rating`, `sq_ft`, `miles` (or `#`, `$`, `%`, `x`) |
| `period` | `FY2025`, `2025-07`, `Jul-25`, `2025-12-31`, `LTM Jul-25`, `YTD Jul-25` |
| `value` | A number; percentages as `82%` or `0.82` |
| `definition`, `source`, `evidence` | Optional; evidence `Documented` or `Management representation` (the default) |

### intake.json

The shape of `IntakeFacts` in `src/domain/financials.ts`, written by hand.
Top-level `source` and `evidence` are the defaults for every item; an item's
own `source` may be just `{ "locator": "## People" }`. Leave out anything the
notes do not say: the CIM writes `[Confirm: …]` for it and never guesses. The
file may also carry `revenueLines` (facts about each revenue account: `label`,
`recurring`, `whatTheCustomerBuys`, `pricingBasis`) and `customerTerm`
(`Customer` or `Client`). Only `owner` and `reasonForSale` are required.
