# Seller lead engine

Finds Main Street owners in AMB Advisory Services' target verticals and
metros who are likely to sell, emails them a free exit-readiness check from a
named AMB person, qualifies the replies by email, and hands warm sellers to
the advisor. It works from public state records, never from bought age data
or Google Maps scraping, and every message passes a compliance gate that
blocks the send instead of warning. It produces:

- **`data/prospects.csv`**: one row per business, merged from state entity
  and license files, with the owner, a verified email, a 0 to 100
  likely-to-sell score, tier A, B or C, and plain-English reasons.
- **Gmail drafts** of a 3-step cold sequence (step 1 under 110 words, no
  links), each with the advertisement notice, postal address and opt-out.
  A person sends them; the engine sends only after `sending.mode` is
  switched to `send`.
- **`data/leads.csv`** and **drafted answers** for every owner who replies:
  facts the owner stated, a qualification score and a funnel stage. Every
  answer to an owner is a draft, always.
- **`data/suppression.csv`**: the permanent do-not-contact list. Opt-outs,
  complaints and hard bounces land here in the same run and are never removed.
- **`data/checks/`**: the exit-readiness check for an interested owner
  (readiness score, 25-item checklist, a rough range only when it can be
  supported). See [docs/EXIT_READINESS_CHECK.md](docs/EXIT_READINESS_CHECK.md).
- **`data/handoffs/`**: a one-paragraph summary per warm seller for the
  advisor, with every fact marked "per owner" or "per state records".
- **`data/reports/<ISO week>.md`**: the weekly report (sent, reply rate,
  qualified sellers, meetings, listings signed, mailbox health, alarms).

```
 Sunbiz cordata (fixed width) ─┐
 DBPR license CSV ─────────────┤ import ─► build ─► enrich ─► score ─► send ─► gate ─► Gmail drafts
 other states' CSVs (presets) ─┤          prospects  email +    tier     plan,    CAN-SPAM,  (outbox for the Claude
 open POI, contacts CSVs ──────┘          .csv       verify     A/B/C    render   licensing,  Gmail connector, or
                                                                                  suppression the Gmail API)
                                                                                     │
 owner replies ─► data/inbox/*.json or sync ─► qualify ─┬─► opt-out, complaint, hard bounce ─► suppression.csv
                                                        ├─► auth bounce ─► mailbox paused, nobody suppressed
                                                        └─► human reply ─► leads.csv ─► drafted answer (a draft)
 warm lead ─► check (data/checks/) ─► handoff (data/handoffs/) ─► advisor ─► stage meeting / listed
 Mondays ─► report (data/reports/)
```

## The app: no commands needed

One window on your own computer with a button for every step and tables
that track every business, email, reply and warm seller. It runs on your
PC, so it can download Florida's records itself (a cloud session's network
usually cannot reach them).

1. Once: double-click `setup.bat` in the folder above (installs Node.js
   packages and runs the demo).
2. Every day: double-click **`AMB Seller Leads.bat`** (on a Mac,
   `AMB Seller Leads.command`). A black window opens and stays open while
   the app runs; the app opens in its own window (Edge or Chrome app mode,
   no address bar). Close the black window to stop.
3. First time, press **Show me with sample data** at the top: fictional
   Tampa Bay businesses, offline, so every button can be tried safely. Press
   **Use my real data** when ready.

The example settings target professional services first: association
management companies, bookkeeping firms, accounting practices, insurance
agencies, IT services companies, staffing agencies, marketing agencies, and
engineering and architecture firms. Then the trades (HVAC, plumbing,
electrical, landscaping, pest control, dental). Edit the list on the
Settings tab.

| Tab | What it shows |
|---|---|
| Today | Headline counts, the steps in order (Find new businesses, Find emails, Score businesses, Prepare today's emails, Approve and create Gmail drafts, Check replies, Weekly report), the log of the step running, today's emails to read and skip before approving, the pipeline and the last 14 days |
| Warm sellers | Qualified owners with size, timeline and motivation, the advisor's handoff note, and buttons for Meeting booked, Listing signed, Check back later and Not a fit |
| Replies | Owners in conversation and every reply with its kind and whether an answer was drafted |
| All businesses | Every business, searchable and sortable: score, estimated staff (from its own website or an imported list; "8+" means at least 8 listed on its team page), status, emails so far, next email, why it scored |
| Settings and mailboxes | What still blocks the first email (postal address, licensing sign-off and the rest), the settings file, mailbox health, a "never email this address" box, and the data folders |

The buttons run the same commands as below, so every compliance gate, cap,
suppression check and draft-only rule applies unchanged. "Prepare today's
emails" is a dry run: nothing is saved or sent. With the default `outbox`
transport, approved emails go to `data/outbox/` and the Claude Gmail routine
puts them in Gmail Drafts; with `gmail_api` they go straight to Gmail
Drafts. The app listens on 127.0.0.1 only and every request needs the random
key in the address it opens, so no web page or other computer can drive it.
`npm run app` starts it from a terminal (`npm run engine -- app --no-open`
prints the address only; `--port N` picks the port).

**Windows Smart App Control blocks the .bat files?** It blocks scripts that
Windows marks as downloaded from the internet. Either remove the mark before
unzipping (right-click the downloaded .zip, Properties, tick **Unblock**, OK,
then Extract All), or skip the .bat files: open the `seller-lead-engine`
folder in File Explorer, type `cmd` in the address bar and press Enter, then
run `npm install` once and `npm run app` each time. Do not turn Smart App
Control off; Windows cannot turn it back on without a reset.

## Hosting it on Vercel (the same app, for the whole team)

The same screens and buttons as the desktop app, at a web address, behind a
team password, with everything saved in your Postgres database instead of
on one computer. Steps run on Vercel's servers, so nobody's PC needs to be
on, and everyone sees the same businesses, emails, replies and warm sellers.

**Deploy (once, about ten minutes, in the Vercel dashboard):**

1. **Add New, Project**, import the GitHub repository `project-avengers`.
2. **Root Directory**: `seller-lead-engine`. Framework Preset: **Other**.
   Leave the build and install commands alone (`vercel.json` sets them).
3. **Environment Variables**: add `APP_PASSWORD`, the team password (at
   least 10 characters). Optional ones are listed below.
4. **Deploy.** Then open the project's **Storage** tab and connect your
   Postgres database to it (this adds `DATABASE_URL` or `POSTGRES_URL`), and
   **Redeploy** so the app picks it up.
5. Open the site's address: `/api/health` should say `"ok": true`. Sign in
   with the team password, press **Create the settings file**, then
   **Edit settings** (on the Settings tab) to fill them in.

The app is on the branch `claude/new-session-m1eien`. Vercel builds every
branch as a preview automatically; for the main address, merge the branch
into `main` or set it as the production branch (Settings, Git). Vercel may
ask for your Vercel login on preview addresses (Deployment Protection),
before the team password.

| Variable | What it does |
|---|---|
| `APP_PASSWORD` | Required. Everyone signs in with it; changing it signs everyone out |
| `DATABASE_URL` or `POSTGRES_URL` | Required. Set by connecting the database in Storage |
| `ANTHROPIC_API_KEY`, `EMAIL_VERIFIER_API_KEY`, `GOOGLE_PLACES_API_KEY` | As in Quick start below |
| `GMAIL_TOKENS_JSON` | The contents of `.gmail-tokens.json`. With `sending.transport` set to `"gmail_api"` in the settings, approved emails go straight into Gmail Drafts and Check replies reads Gmail |
| `CRON_SECRET` | Any long random text: turns on a weekday 8:45 am Eastern replies check (Vercel's scheduler sends it) |
| `SESSION_SECRET` | Optional: signs sign-in sessions instead of a hash of the password |

**How it differs from the desktop app:**

- It needs a **Postgres** database (Neon, Supabase, Prisma Postgres or the
  older Vercel Postgres). It creates its own tables on first use:
  `lead_engine_rows` (every table, row by row), `lead_engine_files` (the
  settings, notes, reports, outbox and inbox) and `lead_engine_spaces`. The
  views `amb_prospects`, `amb_leads`, `amb_replies`, `amb_emails` and
  `amb_do_not_contact` show the main tables as columns in the database's
  own tools. A save that would shorten the do-not-contact list is refused.
- **Find new businesses** takes Florida's DBPR contractor licence files.
  The Sunbiz quarterly file is several gigabytes, more than a server
  function can hold, so it stays on the desktop app.
- Vercel gives each step up to **five minutes**. Find emails stops in time
  to save and carries on from where it stopped on the next press; Check
  replies handles 12 new replies per press.
- One step runs at a time across the whole team; a second press elsewhere
  says to wait.
- With the default `outbox` transport, approved emails are saved in the
  database outbox, not Gmail. Set up `GMAIL_TOKENS_JSON` and `gmail_api` so
  they reach Gmail Drafts.

`npm run hosted:dev` runs the hosted app on this computer first, on a
throwaway database in `data-hosted-dev/` (password `dev-password-only`).

## Quick start

Requires Node 20 or later (developed on Node 22).

```bash
cd seller-lead-engine
npm install
npm test          # vitest, all offline (about 10 seconds)
npm run demo      # the whole loop on the fictional Tampa Bay sample, in a temp folder
```

`npm run demo` runs the whole loop, from import to the weekly report, on
`samples/tampa-bay/`: 12 Sunbiz entities, 13 DBPR
licenses, 13 contacts and 9 open POI rows, all invented (the sample's
[README](samples/tampa-bay/README.md) lists what each business tests). It
works in a temporary data folder with the in-memory transport and canned
replies, so it never touches `data/`, Gmail or the network.

Optional keys, read from `.env` (copy `.env.example`):

| Key | Used for | Without it |
|---|---|---|
| `EMAIL_VERIFIER_API_KEY` | `enrich`: a ZeroBounce-compatible verifier marks each address valid, catch-all or invalid | Every address ends `unknown`, which is not sendable. Nothing goes out except to addresses a person checked with `verify <prospectId> valid --by <name>` |
| `ANTHROPIC_API_KEY` | `qualify`: Claude classifies each reply and extracts only the facts the owner stated (revenue, owner earnings, timeline, motivation and the other `leads.csv` facts) | Fixed rules still catch opt-outs, complaints, bounces, auto-replies and "are you a bot?"; a keyword fallback sorts the rest into interested, not now, not interested, question or other. No facts are extracted, so a person adds them to `data/leads.csv` |
| `GOOGLE_PLACES_API_KEY` | `score --places`: business status (a permanently closed business is knocked out), review volume as a size signal, website | Size scores neutral (7 of 15 points) unless the business holds 2 or more licenses, and closed businesses are caught only by state records |
| `GMAIL_TOKENS_FILE` (default `.gmail-tokens.json`) with `sending.transport = "gmail_api"` | `send` drafts or sends through the Gmail API from several mailboxes with List-Unsubscribe headers; `sync` reads replies | The default `outbox` transport writes each email to `data/outbox/<date>/` for the Claude Gmail connector routine ([docs/RUNBOOK.md](docs/RUNBOOK.md)) |

`AMB_CLAUDE_MODEL` overrides the Claude model. `LEAD_ENGINE_CONFIG` and
`LEAD_ENGINE_DATA_DIR` move the config file and the data folder from their
defaults, `config/engine.config.json` and `data/`.

### Before the first real email

The engine refuses to send until the facts only AMB can supply are in
`config/engine.config.json`:

1. **A postal address** (a street address, or a PO box or private mailbox
   registered to AMB): `firm.postal_address`.
2. **The licensing allow-list**: `licensed_states`, which must equal the
   states where AMB may solicit business sellers, and `licensing_signoff`,
   naming the counsel who confirmed it. Florida treats procuring sellers for
   a fee as brokerage (Fla. Stat. 475.01), so this is a legal decision, not
   a setting ([docs/COMPLIANCE.md](docs/COMPLIANCE.md)).
3. **Real senders**: each mailbox's `sender_name` and `sender_title` are a
   real AMB person, on a separate sending domain registered openly to AMB.

`npm run engine -- preflight` checks all of it, plus SPF, DKIM and DMARC on
every sending domain, warm-up status and the template lint, and exits 1 on
any failure. `send` refuses while a config or licensing item fails.

## Day-to-day use

The launch plan, DNS records and the Claude scheduled tasks are in
[docs/RUNBOOK.md](docs/RUNBOOK.md). Once running:

1. **Set up once.** `npm run engine -- init` creates `data/` and
   `config/engine.config.json` from the example. Fill in the firm, mailboxes,
   verticals, metros and the licensing fields, then run `preflight` until it
   passes.
2. **Load a list** when new state files arrive (Sunbiz quarterly, DBPR
   weekly; [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)):
   `import`, then `build`, `enrich`, `score`. Check the tiers and hold
   reasons with `status`.
3. **Every weekday at 8:45 ET** the scheduled routine runs `daily`
   (sync when the transport is `gmail_api`, then qualify, handoff, send) and turns each item in `data/outbox/<today>/`
   into a Gmail draft. A person reads and sends each draft from Gmail. Send
   days default to Tuesday to Thursday, and federal holidays are skipped.
4. **Every hour in business hours** the reply routine saves new mail to
   `data/inbox/`, runs `qualify` and creates the drafted answers. Opt-outs
   are suppressed in that run. A person reviews each answer and sends it.
5. **Warm sellers** get a readiness check and a handoff note. The advisor
   calls, then records the result with `stage <prospectId> meeting`,
   `listed`, `nurture --until <date>` or `lost`.
6. **Mondays at 7:45 ET** the report routine runs `report` and emails the
   advisor the summary. A paused mailbox stays paused until a person runs
   `clear-pause`.

Other commands (all `npm run engine -- <command>`):

```bash
npm run engine -- download florida --import   # fetch the DBPR contractor files and the Sunbiz quarterly file, import the businesses in your metros, build (Windows: double-click download-florida.bat)
npm run engine -- import sunbiz <file> --snapshot 2026-10-01 --metro-only   # Florida cordata, only businesses in a configured metro
npm run engine -- import dbpr <file> --snapshot 2026-10-01                  # Florida DBPR licensee CSV
npm run engine -- import csv:tdlr <file>                                    # other presets: entities, licenses, contacts, open_poi, cslb, tsbde, wa_lni, overture, foursquare
npm run engine -- enrich --discover          # also read the business's own website for addresses (honors robots.txt)
npm run engine -- enrich --no-verify         # pick addresses without calling the verifier
npm run engine -- verify P-00012 valid --by "Frank"   # a person's own check of an address
npm run engine -- plan --date 2026-11-10     # the day's batch, without writing anything
npm run engine -- send --dry-run             # render and gate today's batch, write nothing, call no transport
npm run engine -- record T-000042 drafted --draft-id r-123 --thread-id 18c...   # what the Claude routine reports back
npm run engine -- sync --since 2026-11-10T00:00:00Z   # gmail_api transport: fetch new mail into data/inbox/
npm run engine -- check P-00012              # write the readiness check and draft it as a reply
npm run engine -- handoff                    # summaries for warm sellers not yet handed off
npm run engine -- report --date 2026-11-16   # the weekly report for the 7 days ending that date
npm run engine -- suppress owner@example.com --reason do_not_contact   # add to the permanent list (reasons: opt_out, bounce, complaint, do_not_contact, client, legal, wrong_person)
npm run engine -- clear-pause frank@ambadvisory-mail.example --by "Frank"
npm run engine -- export <partner> P-00012 P-00031 --out leads.csv   # refused unless lead sales are enabled with a legal review reference
npm run engine -- status                     # counts by status, tier and stage, mailbox health, caps today
npm run engine -- dashboard                  # write data/dashboard/*.json for the pipeline dashboard (no owner names or contact details)
npm run typecheck                            # tsc --noEmit
```

### The dashboard

A Claude dashboard shows the pipeline at a glance: headline numbers, the
funnel from state records to a signed listing, owners to act on, activity by
day, mailbox health and every business with its score. It starts with the
fictional demo data. To show real numbers, run `npm run engine -- dashboard`
(it writes six JSON files to `data/dashboard/`, leaving out owner names,
email addresses, phone numbers and age estimates) and ask Claude to refresh
the dashboard from them. The weekly report task can do the same each Monday.

## How it works

| Stage | Code | What happens |
|---|---|---|
| Import | `src/sources/sunbiz.ts`, `dbpr.ts`, `csvImport.ts` | Reads Sunbiz fixed-width records (up to 6 officers each), DBPR CSVs (headers mapped by alias, or by position when the file has no header row) and canonical or preset CSVs into `data/imports/`. A bad line is reported and never blocks the rest |
| Build | `src/sources/merge.ts`, `normalize.ts` | Joins licenses, places and contacts to entities by normalized name and 5-digit ZIP, assigns the vertical and metro, picks the owner (an officer with an owner title, never a registered agent or a hired qualifier) and upserts `data/prospects.csv`. It never reopens a `dnc`, `in_sequence`, `replied` or `completed` prospect |
| Enrich | `src/contacts/enrich.ts`, `discover.ts`, `verify.ts` | Ranks candidate addresses (owner's name, other person, role inbox), optionally reads the business's own site, and verifies: syntax, disposable domain, FCC wireless domain, MX, then the verifier API. No SMTP probing and no guessed address patterns |
| Score | `src/score/score.ts`, `age.ts`, `places.ts` | Estimated owner age 30 (internal only, never in copy), tenure 20, no apparent successor 15, size fit 15, fatigue signals 10, vertical prior 10. Knock-outs score 0. Tier A at 70, B at 50. Only the Google `place_id` is stored |
| Plan | `src/sending/planner.ts`, `ramp.ts`, `health.ts` | Follow-ups first, then new step-1 sends by score, within each mailbox's warm-up ramp (0, then 5, 10, 15, 20 a day), the 25 per mailbox and 75 per domain ceilings, the catch-all share cap and the circuit breakers |
| Send | `src/sending/run.ts`, `src/outreach/templates.ts`, `src/compliance/footer.ts` | Renders the step from record facts only, adds the advertisement notice, footer and List-Unsubscribe headers, runs the gate, logs `data/touches.csv` and delivers |
| Gate | `src/compliance/gate.ts`, `lint.ts`, `jurisdiction.ts`, `suppression.ts` | Throws with every reason: suppressed, outside the licensed states or the US, FCC wireless domain, no postal address or sign-off, mailbox missing or paused, address not sendable, any lint failure. Nothing reaches a transport except through it |
| Deliver | `src/sending/transports.ts`, `mime.ts`, `src/util/gmailAuth.ts` | `outbox`: one JSON file per email plus a checklist for the Claude Gmail connector, which reports back with `record`. `gmail_api`: drafts or sends with an OAuth refresh per mailbox |
| Qualify | `src/replies/parse.ts`, `classify.ts`, `process.ts`, `respond.ts`, `src/qualify/` | Strips quoted text, detects bounces (authentication bounces pause the mailbox and suppress nobody), auto-replies, opt-outs and complaints by fixed rules first, then Claude. Updates the lead, scores qualification (timeline 30, size fit 25, motivation 20, engagement 15, readiness facts 10) and drafts the answer with up to 3 intake questions |
| Check | `src/readiness/check.ts`, `multiples.ts` | 8 drivers and 25 checklist items from the owner's words and state records; a range only from a verified multiples row and an SDE the owner stated |
| Handoff | `src/handoff/handoff.ts` | Writes the check and a summary for each warm lead, then marks it `handed_off` |
| Report | `src/report/weekly.ts` | The 7 days ending today plus the cumulative funnel; rates over outreach sent or drafted, the same basis as the circuit breakers |
| Export | `src/report/exportLeads.ts` | Lead sales to partner brokers: refused unless enabled with a legal review reference; flat fee only; never a suppressed or `dnc` prospect, the age estimate or the score |

### Confidentiality

Prospect data stays out of git: `data/`, `output/`, `.env`,
`.gmail-tokens.json` and `config/engine.config.json` are ignored. Only the
fictional sample is tracked. Owner names and emails come from public records,
but they are still personal information (California's privacy law covers
business contacts), so keep `data/` in a private store
([docs/RUNBOOK.md](docs/RUNBOOK.md) says how). Reply text sent to Claude is
processed under Anthropic's commercial API terms.

## Known limits and next steps

Version 0.1 runs end to end offline on fictional data. It has not run against
live Gmail, the Gmail connector, Google Places, a verifier API or Claude
classification (the tests mock all of them). Before relying on it:

- **Sunbiz layout unverified.** `SUNBIZ_LAYOUT` in `src/sources/sunbiz.ts`
  is built from the anchors the research could confirm (1,440-character
  records, registered agent at 545, officers from field 37), because the
  official definition page could not be opened. Check every position
  against dos.sunbiz.org/data-definitions/cor.html and one real file, along
  with the filing-type codes and the surname-first officer name order.
- **DBPR headers unverified.** `DBPR_COLUMNS` maps header aliases, and
  `DBPR_POSITIONAL_COLUMNS` and `FL_COUNTY_CODES` are best knowledge of the
  board's readme. Read the header row of the first real CILB download and
  the readme.pdf before importing.
- **Other states' presets unverified.** The `cslb`, `tdlr`, `tsbde`,
  `wa_lni`, `overture` and `foursquare` header names come from third-party
  descriptions. An import with missing required columns fails and names the
  headers it did not recognize.
- **FCC list not official.** `reference/fcc-wireless-domains.txt` is
  compiled from well-known carrier gateway domains. Replace it with the
  FCC's list before the first send and refresh it monthly.
- **Multiples rows.** The 15 BizBuySell rows in `reference/multiples.json`
  are marked verified from search-engine extracts that quote each page's
  table, not from the live page. The 3 `main_street_default` rows (IBBA
  Market Pulse medians) are marked unverified, and no range is sent from
  them. Re-read each source each quarter.
- **Counsel review items.** The licensing allow-list and Fla. Stat. 475
  reach AMB's own outreach; lead sales raise licensing and data-broker
  registration questions; the readiness-check disclaimer, the SBA statements
  in step 2 and the check, and the AI disclosure wording are drafts for
  counsel. The list is in [docs/COMPLIANCE.md](docs/COMPLIANCE.md).
- **Gmail connector limits.** It cannot set List-Unsubscribe headers or a
  From address and works as one account, so the outbox transport covers one
  sending mailbox per connected account, and the opt-out sentence in the body
  is the opt-out mechanism. Several mailboxes need `gmail_api`.
- **No unsubscribe web page.** `sending.unsubscribe_url` is optional and
  nothing in this repo hosts one; without it the opt-out is by reply.
- **Not built:** privacy requests (access and deletion), a retention limit
  for non-responders, tracking of lead-sale revenue against the CCPA 50% and
  Texas data-broker thresholds, a Do Not Call check (phones are display
  only), a CLI command to record owner facts by hand, NPPES, Colorado,
  Oregon and New York importers (use `csv:entities` or `csv:licenses` with
  canonical headers), and a Census-based vertical prior (set
  `verticals.<key>.prior` by hand).
- **Score weights are a heuristic.** Refit them once about 50 replies are
  labelled qualified or not ([docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)).
- **Review coverage.** A first adversarial review
  ([docs/build/REVIEW_R1.md](docs/build/REVIEW_R1.md)) covered compliance,
  sending, replies, and data and scoring; its 35 findings were checked and
  fixed, each with a regression test (`tests/review-r1-*.test.ts`). The copy
  and legal lens and the readiness, report and CLI lens got only a lighter
  check (em dashes, documented commands, doc accuracy) and are worth a full
  pass before launch.
