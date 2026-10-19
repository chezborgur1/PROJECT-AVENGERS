# Runbook: launching and running the seller lead engine

The engine can draft its first cold emails 3 weeks after warm-up starts, and
only after counsel has signed off on where AMB Advisory Services may solicit
sellers. Starting warm-up on Tuesday 2026-10-20 puts the first drafts on
Tuesday 2026-11-10. The research puts a first positive reply around weeks 5
to 7 and a first qualified seller around weeks 6 to 10, against the original
plan's 3 to 6 weeks ([PLAN_REVIEW.md](PLAN_REVIEW.md)).

This runbook covers the launch week by week, the DNS records, the gates for
moving from drafts to sending, and the Claude scheduled tasks that replace
the plan's "Grok Bot".

Every step below that names a command also has a button in the desktop app
(double-click `AMB Seller Leads.bat`; see the README). Use whichever is
easier: the app runs the same commands with the same checks.

## 1. Decide before week 0

A person at AMB Advisory decides each of these. The engine cannot.

| Decision | Where it goes | Why |
|---|---|---|
| Which states AMB may solicit sellers in, confirmed by counsel | `licensed_states`, `licensing_signoff` | Fla. Stat. 475.01 treats procuring sellers for a fee as brokerage; an empty list sends nothing |
| The postal address: street address, USPS PO box or registered CMRA mailbox | `firm.postal_address` | 16 CFR 316.2(p); `preflight` and the gate refuse without it |
| The real sender: full name and title as they should print | `mailboxes[].sender_name`, `sender_title` | Header accuracy (15 U.S.C. 7704(a)(1)); never a persona |
| 1 or 2 sending domains, and 2 or 3 mailboxes | `mailboxes[]` | Throughput: 2 mailboxes on Tuesday to Thursday need about 14 weeks to email 500 owners, 3 mailboxes on Monday to Friday about 7 |
| Send days | `sending.send_days` | Defaults to Tuesday to Thursday (`[2, 3, 4]`) |
| Transport: `outbox` (Claude Gmail connector, one mailbox per connected account) or `gmail_api` (several mailboxes, List-Unsubscribe headers) | `sending.transport` | The connector cannot set headers or a From address |
| Warm-up method: a paid warm-up tool (about $40 to $50 a month) or slow real correspondence | outside the engine | Free warm-up tiers are mostly 7-day trials |
| A verifier API key (ZeroBounce-compatible, 100 free checks a month) | `EMAIL_VERIFIER_API_KEY` | Without it every address is `unknown` and nothing is sendable |
| Where `data/` lives for the cloud routines | section 6.1 | `data/` is git-ignored |

## 2. Launch plan, week by week

**Week 0 (Oct 19 to 23): domains, tenant, DNS, warm-up**

1. Register 1 or 2 `.com` sending domains that read as AMB (for example
   `ambadvisory-mail.com`), registered openly to AMB Advisory Services LLC
   with truthful registrant data and **no privacy proxy** (18 U.S.C.
   1037(a)(4); *Balsam v. Trancos*). Buy before Nov 1: Verisign's .com
   wholesale price rises from $10.26 to $10.97 that day. Budget $11 to $13
   per domain per year. Never send cold email from `ambadvisoryservices.com`;
   `preflight` fails a mailbox on the primary domain.
2. Create a **separate Google Workspace tenant** on the sending domain, so a
   suspension under the Workspace Acceptable Use Policy never touches AMB's
   main mailbox. Business Starter is $7 per user per month on an annual
   plan ($8.40 flexible). End the trial before cold sending: trial accounts
   are capped at 500 recipients a day and the cap does not rise during the
   trial. Avoid a new Microsoft 365 tenant for sending (new tenants get 10%
   of the external-recipient quota for 30 days).
3. Create 2 or 3 mailboxes for real AMB people. Add a profile photo and the
   person's signature. Set each account's name (Gmail Settings > Accounts >
   Send mail as > edit info) to exactly `<sender_name>, AMB Advisory Services`,
   the From name the compliance gate checks. In outbox mode the connector
   sends under the account's own name, so this setting is what owners see.
4. Publish the DNS records in section 3, turn on DKIM signing in the Admin
   console, and verify the domain in Google Postmaster Tools.
5. Point the sending domain's website at the AMB site with an HTTPS 301
   redirect, or host one page naming the sender and the firm.
6. Start warm-up on Tuesday Oct 20 and set each mailbox's `warmup_started`
   to that date. The engine sends no cold email for `sending.warmup_weeks`
   (3 by default; set 4 if seed tests still land in spam).
7. Run `npm run engine -- init`, fill in `config/engine.config.json` (firm,
   mailboxes, verticals, metros) and send counsel the "Still needs counsel"
   list in [COMPLIANCE.md](COMPLIANCE.md).

**Week 1 (Oct 26 to 30): the first list**

1. Seed-test each mailbox: send a real email to a Gmail address, an
   Outlook.com address and a Microsoft 365 mailbox, open "Show original"
   and confirm `spf=pass`, `dkim=pass` with `d=<sending domain>` (not
   `gappssmtp.com`) and `dmarc=pass`. Confirm the From line reads
   `<sender_name>, AMB Advisory Services <mailbox>`, as in each outbox
   item's `fromName`.
2. Download the October Sunbiz quarterly file and the DBPR construction
   licensee files ([DATA_SOURCES.md](DATA_SOURCES.md)). Before importing,
   check `SUNBIZ_LAYOUT` against the official definition and read the DBPR
   header row (both are unverified; see the README's known limits).
3. Replace `reference/fcc-wireless-domains.txt` with the FCC's current list.
4. Import, build, enrich and score:

   ```bash
   npm run engine -- import sunbiz cordata0.txt --snapshot 2026-10-01 --metro-only
   npm run engine -- import dbpr cilb_certified.csv --snapshot 2026-10-26
   npm run engine -- build
   npm run engine -- enrich --discover
   npm run engine -- score --places
   npm run engine -- status
   ```

   Run `enrich --discover` on a computer with open internet access: it
   reads each business's own website, which a cloud routine's network
   allowlist will block.

**Week 2 (Nov 2 to 6): sign-off and dry runs**

1. Record counsel's sign-off: `licensed_states` and `licensing_signoff`
   ("name, firm, date"). Apply any wording changes counsel makes to the
   templates, the disclaimer or the AI disclosure, then run `preflight`.
2. Set up the data repository and the three scheduled tasks (section 6).
3. Run `npm run engine -- send --dry-run --date 2026-11-10` and read the
   rendered batch. Every email must state only true record facts.
4. `npm run engine -- preflight` passes everything except warm-up.

**Week 3 (Nov 9 to 13): drafts-only launch**

1. Tuesday Nov 10: cold week 1, 5 emails per mailbox per day. The 8:45 ET
   routine creates Gmail drafts. A person opens each draft, checks the owner
   name, business and city against the record, and sends it between 8:00
   and 11:00 ET, or deletes it and notes why.
2. Wednesday Nov 11 (Veterans Day) is skipped automatically.
3. The hourly reply routine starts drafting answers. A person reviews and
   sends every one.

**Weeks 4 to 6 (Nov 16 to Dec 4): ramp**

- The ramp moves each mailbox to 10, then 15, then 20 a day, capped at 25 per
  mailbox and 75 per sending domain. It advances only by calendar; a person
  holds it (set `mailboxes[].max_per_day`) if the gates below are not met.
- Thanksgiving (Nov 26) is skipped. Add the year-end lull, Dec 21 to Jan 2,
  to `sending.holidays`.
- Read the Monday report. Any alarm or paused mailbox needs a person.

**Week 6 onward: graduate to send mode only when every gate passes** (section 4).

## 3. DNS records for each sending domain

| Record | Host | Value |
|---|---|---|
| MX | `@` | Google Workspace MX records, as the Admin console shows them |
| TXT (SPF) | `@` | `v=spf1 include:_spf.google.com ~all` (one SPF record only; add a warm-up tool's include only if it sends as you) |
| TXT (DKIM) | `google._domainkey` | The 2048-bit key from Admin > Apps > Google Workspace > Gmail > Authenticate email; then click Start authentication |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<sending domain>; adkim=r; aspf=r` |
| TXT | `@` | Google Postmaster Tools verification |

`p=none` meets the Gmail, Yahoo and Outlook.com minimums. Move to
`p=quarantine` after 3 to 4 clean weeks. Make sure `ambadvisoryservices.com`
also has SPF, DKIM and DMARC. `preflight` checks SPF, DKIM and DMARC on every
sending domain; the seed test in week 1 is still needed to prove DKIM signs
with the sending domain.

## 4. Graduating from drafts to send mode

Drafts are the default because a person catches a wrong owner name, a closed
business or a sensitive situation before it goes out, and because
individually reviewed mail is the safer position under Google's policies.
Move initial emails and follow-ups to `send` only when all of these hold:

1. At least 2 weeks of drafts with **zero corrections** by the reviewer.
2. Hard bounces under 2% of sends over the last 14 days, per mailbox.
3. **Zero** spam complaints and zero authentication bounces in that window.
4. Opt-outs under 1% of sends (the engine pauses new sends at 5%).
5. `preflight` passes every item, and the week-1 seed test still shows
   `d=<sending domain>`.
6. Counsel has seen a sample of sent emails.

Then a person, not a routine, makes three changes: set `sending.mode` to
`"send"` in the config, change the daily task's prompt line to
`Send mode: ON`, and approve the Gmail `send_message` tool for that task when
prompted. Replies to owners stay drafts whatever the mode:
`qualify.auto_send_replies` is the literal `false`.

## 5. When something trips

- **Paused mailbox.** `status` and the report show why. A hard-bounce pause:
  re-verify that day's list. A complaint pauses every mailbox: read it,
  confirm the address is suppressed, then clear. An authentication bounce
  (`550 5.7.515`, `5.7.26` and similar) means AMB's domain failed SPF, DKIM
  or DMARC at the receiver: fix DNS, re-run the seed test, then clear. The
  recipient was not suppressed. Clear with
  `npm run engine -- clear-pause <mailbox> --by "<name>"`.
- **Someone asks by phone or letter not to be contacted.**
  `npm run engine -- suppress <email or domain> --reason do_not_contact`.
- **A reply the engine filed as `other`.** A person reads it in Gmail and
  answers by hand if needed.

Monthly: replace the FCC list, run `enrich` (an address verified more than
90 days ago is verified again), and load the newest Sunbiz quarterly and
DBPR weekly files.

## 6. Claude setup (replaces the plan's "Grok Bot")

Three cloud scheduled tasks run the engine. Create them in Claude Code on the
web, each on the environment that holds this repository, each starting a
fresh session on every run, with the schedule and prompt below. Cron fields
are written with `CRON_TZ=America/New_York` so the times stay Eastern through
daylight saving changes.

### 6.1 Where the state lives

`data/` is git-ignored, and each scheduled run starts in a fresh session, so
without persistent storage every run would start from an empty pipeline and
an empty suppression list. Keep it in **a separate private GitHub repository**
(for example `amb-lead-engine-data`) that holds the contents of `data/` plus
the live config as `engine.config.json`. Never put this data in the code
repository or any public repository: it holds owner names and emails.

1. Create the private repository, and from a computer with the engine set up:

   ```bash
   cd seller-lead-engine/data
   git init -b main && git add -A && git commit -m "Initial state"
   cp ../config/engine.config.json engine.config.json && git add engine.config.json && git commit -m "Config"
   git remote add origin <private data repo URL> && git push -u origin main
   ```

2. Give the cloud environment access to both repositories, and set these
   environment variables or secrets: `LEAD_ENGINE_CONFIG=data/engine.config.json`,
   `DATA_REPO_URL=<private data repo URL>`, `EMAIL_VERIFIER_API_KEY`, and
   optionally `ANTHROPIC_API_KEY` and `GOOGLE_PLACES_API_KEY`.
3. Every routine starts and ends with the same two steps (they are in each
   prompt below). Start:
   `[ -d data/.git ] && git -C data pull --rebase || git clone "$DATA_REPO_URL" data`.
   End: `git -C data add -A`, `git -C data commit -m "<routine> <date>"`
   (nothing to commit is fine), `git -C data push`; on a rejected push,
   `git -C data pull --rebase` and push once more; if that fails, stop and
   report. Never force-push, never delete files in `data/`, and never resolve
   a merge conflict in a CSV by hand: stop and report it.
4. The schedules never overlap (7:45 Monday, 8:45 daily, then :20 past each
   hour from 9:20), so two runs never write the same files at once.

A private Google Drive folder works too, but less well: the Drive connector
can upload a file and download one, and cannot replace a file's content. The
routine would `tar czf` the folder, upload a new dated archive with
`create_file` (`base64Content`, `contentMimeType: application/gzip`,
`disableConversionToGoogleType: true`) at the end of each run, and download
the newest archive with `download_file_content` at the start. Archives pile
up and a lost upload loses a run, so use the private repository unless git
is unavailable.

### 6.2 Environment and permissions

- **Connectors:** list Gmail on each task (and Google Drive only if state
  lives there). The Gmail connector must be signed in to the **sending
  mailbox** on the sending domain, never to a personal or primary AMB
  account. One connected account covers one mailbox; for several mailboxes,
  use `sending.transport = "gmail_api"` or one set of tasks per connected
  account.
- **Permissions:** tool calls in a scheduled run still go through permission
  checks. Pre-approve `npm run engine`, `npm install`, the `git -C data`
  commands, and Gmail `search_threads`, `get_thread` and `create_draft`. Do
  not pre-approve `send_message` for the daily or reply tasks until send mode
  is approved (section 4).
- **Network:** the cloud network allowlist must include the hosts the engine
  calls from the cloud: `api.zerobounce.net` (verifier), and
  `places.googleapis.com`, `gmail.googleapis.com` and `oauth2.googleapis.com`
  if those features are on. Website discovery (`enrich --discover`) and state
  downloads reach arbitrary hosts, so run them on a person's computer and
  push the result to the data repository.
- **No Claude key in the environment?** The engine still runs: replies are
  sorted by fixed rules and keywords, and the routine's own reading of each
  reply is never used to classify it.

### 6.3 Task (a): daily send, every weekday at 8:45 ET

Schedule: `CRON_TZ=America/New_York 45 8 * * 1-5`

```text
You run the daily send for AMB Advisory Services' seller lead engine. Work in the seller-lead-engine folder of the project-avengers repository. Send mode: OFF.

Rules for this whole run:
- Every email the engine prepares has already passed its compliance gate. Never edit a subject, body or recipient, never add links, images or attachments, and never write an email of your own.
- Send mode is OFF, so you only create drafts with the Gmail connector's create_draft. Never call send_message, reply, trash or spam tools.
- Never change config, templates, sending.mode, licensed_states or data/suppression.csv. Never spend money, sign up for anything, or send anything under the principal's personal name. If any step seems to need one of these, stop and say so in your summary.

Steps:
1. Restore state: if data/.git exists run `git -C data pull --rebase`, otherwise run `git clone "$DATA_REPO_URL" data`. If this fails, stop and report.
2. Run `npm install`.
3. Before anything is sent, copy new mail into data/inbox/ exactly as task (b) steps 3 and 4 describe. Opt-outs that arrived overnight or over the weekend must reach the engine before today's batch: `daily` processes the inbox first and refuses to send if that fails.
4. Run `npm run engine -- daily`. Keep its output for the summary. If it reports a failed preflight, a compliance block or a paused mailbox, do not work around it.
5. Today's date in America/New_York is the folder name: data/outbox/<YYYY-MM-DD>/. If that folder does not exist, go to step 6. Otherwise read its README.md and work through every unchecked item in order:
   a. Open <touchId>.json. If its "mailbox" is not the account the Gmail connector is signed in to, leave the item alone.
   b. If connector.tool is "create_draft", call create_draft with exactly connector.args. If connector.tool is "send_message", do not call it (send mode is OFF): run `npm run engine -- record <touchId> failed --error "send mode is off in the routine"` and report it.
   c. Right after create_draft returns, run the item's record command with the returned ids: `npm run engine -- record <touchId> drafted --draft-id <id> --thread-id <threadId>`.
   d. If create_draft fails, run `npm run engine -- record <touchId> failed --error "<the error text>"` and continue.
   e. If <touchId>.json is missing and <touchId>.json.cancelled is there, the owner opted out after the item was written: skip it. If `record` refuses an item as cancelled, delete the draft you just created and report it.
6. Do not open, edit, send or delete any other draft or message, except a draft step 5e or the qualify output tells you to delete.
7. Save state: `git -C data add -A`, `git -C data commit -m "daily <date>"` (skip if nothing changed), `git -C data push`. If the push is rejected, run `git -C data pull --rebase` and push once more. If that fails, or a merge conflict appears, stop and report. Never force-push.
8. Reply with a short summary: drafts created per mailbox, items failed and why, prospects blocked by the gate and the reasons, handoffs written, paused mailboxes and their reasons, drafts to delete because the owner opted out, and anything a person must do today (the drafts are waiting in Gmail for a person to send).
```

When send mode is approved (section 4), a person changes `Send mode: OFF`
to `Send mode: ON` and replaces rule 2 and step 4b with: "call the tool named
in connector.tool with exactly connector.args; for send_message, record with
`npm run engine -- record <touchId> sent --message-id <id> --thread-id <threadId>`".
Reply items (kind reply) stay create_draft in every mode.

### 6.4 Task (b): replies, hourly during business hours

Schedule: `CRON_TZ=America/New_York 20 9-17 * * 1-5`

```text
You read and qualify replies for AMB Advisory Services' seller lead engine. Work in the seller-lead-engine folder of the project-avengers repository.

Rules for this whole run:
- You copy mail into files and run the engine. The engine decides what each message is (opt-out, bounce, interested, and so on). Never decide that yourself, never summarize or reword an owner's text, and never skip a message because it looks like an opt-out: the engine must see opt-outs to suppress them.
- Every answer to an owner is a draft for the named sender to review. Use only create_draft. Never call send_message or reply, and never trash, archive, label as spam or delete anything.
- Never change config, templates or data/suppression.csv. Never spend money or send anything under the principal's personal name.

Steps:
1. Restore state: if data/.git exists run `git -C data pull --rebase`, otherwise run `git clone "$DATA_REPO_URL" data`. If this fails, stop and report.
2. Run `npm install`.
3. With the Gmail connector (signed in to the sending mailbox), call search_threads with query `in:inbox newer_than:7d`, then with query `from:(mailer-daemon OR postmaster) newer_than:7d`. Use pageSize 50 and follow pageToken until there are no more pages. Seven days reaches back over a weekend and a holiday, so mail that arrived while no task ran (Friday evening to Monday morning) is still found; step 4a skips what is already saved.
4. For each thread found, call get_thread with messageFormat PLAIN_TEXT (search previews show only the oldest messages, so always read the full thread). For each message in it that the sending mailbox did not send itself:
   a. Skip it if its message id already appears in the reply_id column of data/replies.csv, or as a file in data/inbox/ or data/inbox/processed/.
   b. Otherwise write data/inbox/<message id>.json containing exactly:
      {"id": "<message id>", "threadId": "<thread id>", "mailbox": "<the sending mailbox address>", "from": "<sender as returned>", "to": "<recipients as returned>", "subject": "<subject>", "date": "<message date as an ISO 8601 timestamp>", "text": "<plaintext_body exactly as returned>", "headers": {}}
5. Run `npm run engine -- qualify`. Keep its output for the summary.
6. Today's date in America/New_York is the folder name: data/outbox/<YYYY-MM-DD>/. If it exists, read its README.md and work through every unchecked item whose kind is reply and whose mailbox is the connected account: call create_draft with exactly connector.args (follow the README's rule for threading), then run `npm run engine -- record <touchId> drafted --draft-id <id> --thread-id <threadId>`. On failure run `npm run engine -- record <touchId> failed --error "<the error text>"`. Leave outreach items for the daily task.
7. Save state: `git -C data add -A`, `git -C data commit -m "replies <timestamp>"` (skip if nothing changed), `git -C data push`. If the push is rejected, run `git -C data pull --rebase` and push once more. If that fails, or a merge conflict appears, stop and report. Never force-push.
8. Reply with a short summary: messages saved, counts by class from the qualify output, addresses suppressed, drafts to delete because the owner opted out (the qualify output lists them: delete each from Drafts), mailboxes paused, drafted answers waiting in Gmail for review, and any lead that turned warm.
```

With `sending.transport = "gmail_api"`, steps 3 and 4 become
`npm run engine -- sync`, and step 6 is not needed: the engine creates the
drafts itself.

### 6.5 Task (c): weekly report, Mondays at 7:45 ET

Schedule: `CRON_TZ=America/New_York 45 7 * * 1`

```text
You send the weekly report for AMB Advisory Services' seller lead engine. Work in the seller-lead-engine folder of the project-avengers repository.

Steps:
1. Restore state: if data/.git exists run `git -C data pull --rebase`, otherwise run `git clone "$DATA_REPO_URL" data`. If this fails, stop and report.
2. Run `npm install`, then `npm run engine -- report`. It writes data/reports/<ISO week>.md and prints the path.
3. Read that file. Find the advisor's address in data/engine.config.json at handoff.advisor_email. If it is blank, stop and report.
4. With the Gmail connector, call send_message once: to the advisor's address only, subject "Seller lead engine weekly report <ISO week>", and a plain-text body with the report's headline numbers (sent and drafted, human replies and reply rate, opt-outs, bounces and bounce rate, complaints, qualified, handed off, meetings, listings signed), every alarm, every paused mailbox with its reason, and the path of the full report. Copy the numbers exactly from the report. This is internal mail: never send it to anyone else, and never send any other email.
5. Save state: `git -C data add -A`, `git -C data commit -m "report <ISO week>"` (skip if nothing changed), `git -C data push`. On a rejected push, run `git -C data pull --rebase` and push once more; otherwise stop and report.
6. Reply with the same summary you emailed.
```

This task needs `send_message` approved. Its prompt allows one recipient. If
the advisor is the account that owns the task, turning on the task's email
notification delivers the run summary without `send_message`.

### 6.6 Guardrails: what always needs a person

- **Switching to send mode**, and approving `send_message` for the daily task.
- **Spending money or signing up for a tool**: domains, mailboxes, warm-up,
  verifier credits, Places billing.
- **Anything under the principal's personal name**, including a personal
  mailbox or signature.
- **Every AI-drafted reply to an owner**: it stays a Gmail draft until the
  named sender reads and sends it.
- **Changes to who and where**: `licensed_states`, `licensing_signoff`,
  `lead_sales`, verticals and metros, templates.
- **Clearing a paused mailbox** (`clear-pause --by <name>`) and **manual
  verification** (`verify --by <name>`): both record who decided.

### 6.7 Optional: a small team of teammates

As volume grows, add up to three more scheduled tasks, each with its own
charter. Each starts and ends with the same state steps as section 6.1, each
reports to the principal in its summary (turn on the task's notification),
and none may send email, change config or templates, or touch
`data/suppression.csv`. The guardrails in 6.6 apply to all of them.

**List-building researcher** (Fridays, `CRON_TZ=America/New_York 10 10 * * 5`)

```text
Charter: keep the prospect list full and accurate for AMB Advisory Services' seller lead engine (seller-lead-engine folder). Restore state as in the runbook. When a person has added a new state file to the data repository, import it with `npm run engine -- import ...` using the right source and snapshot date, then run `build`. Run `enrich` (no --discover from the cloud) and `score`, then `status`. Report: prospects by status and tier, new tier A and B this week, the most common exclusion and hold reasons, how many addresses are unknown and need verification, the date on reference/fcc-wireless-domains.txt (flag it if older than 30 days), and whether a newer Sunbiz quarterly or DBPR file is due. Propose any config change in the report; never make it. Save state.
```

**Outreach writer** (Wednesdays, `CRON_TZ=America/New_York 10 14 * * 3`)

```text
Charter: keep AMB Advisory Services' emails accurate, plain and compliant (seller-lead-engine folder). Restore state. Run `npm run engine -- preflight` and report any template lint item. Read this week's outbox files and data/replies.csv: count touches the gate cancelled or that failed, with their reasons, replies classed "other" or "question", and the questions owners asked most. Propose wording changes to templates/sequence/step-1.md to step-3.md as before-and-after text in the report, following amb-material-bot/docs/HOUSE_STYLE.md section 4, with no claims the records do not support and nothing about an owner's age, health or family. Never edit the templates yourself. Save state only if the engine wrote something.
```

**Pipeline manager** (Fridays, `CRON_TZ=America/New_York 40 15 * * 5`)

```text
Charter: make sure no interested owner waits (seller-lead-engine folder). Restore state. Run `npm run engine -- status` and read data/leads.csv. Report: leads at engaged or qualifying with no reply from AMB for more than 3 business days, drafted answers still unsent, leads at warm or handed_off without a meeting, nurture dates due in the next 14 days, and handoffs in data/handoffs/ that the advisor has not moved to meeting, listed, nurture or lost. Name the next step for each. Never change a stage yourself: the advisor runs `npm run engine -- stage`. Save state only if the engine wrote something.
```
