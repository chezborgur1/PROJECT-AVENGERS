# Seller lead engine

Finds Main Street owners likely to sell from public state records, runs
compliant cold email offering a free exit-readiness check, qualifies replies
and hands warm sellers to the advisor. Owned by AMB Advisory Services
(sell-side M&A for Main Street / lower middle market).

## The law
- `docs/build/DESIGN.md`: the principles and every module's contract (exports, behavior). Shared contracts (`src/domain/schema.ts`, `src/domain/messages.ts`, `src/config.ts`, `src/store/`, `src/util/dates.ts`, `src/util/claude.ts`, `src/util/gmailAuth.ts`, `tests/helpers.ts`) change only with every caller.
- `docs/COMPLIANCE.md`: every rule the engine enforces, where, and the statute or policy behind it; what still needs counsel.
- `docs/research/*.md` (claims, compliance, data, deliverability, offer, repo): the research behind each rule. Cite it in comments where a rule comes from it.
- `amb-material-bot/docs/HOUSE_STYLE.md` §4 (voice, banned words) and §1.4 (name treatment): every template, reply and doc.
- `docs/EXIT_READINESS_CHECK.md`: what the owner receives.

## Commands
- `npm test`: vitest, all offline and deterministic
- `npm run typecheck`
- `npm run demo`: the whole loop on `samples/tampa-bay/` in a temp folder, in-memory transport, canned replies
- `npm run engine -- <command>`: `init`, `preflight`, `download florida [--import] [--dbpr-only | --sunbiz-only]`, `import sunbiz|dbpr|csv:<preset> <file> [--snapshot YYYY-MM-DD] [--metro-only]`, `build`, `enrich [--discover] [--no-verify]`, `verify <prospectId> <valid|invalid> --by <name>`, `score [--places]`, `plan [--date]`, `send [--date] [--dry-run]`, `record <touchId> <drafted|sent|failed> [--draft-id] [--message-id] [--thread-id] [--error]`, `sync [--since ISO]`, `qualify`, `check <prospectId>`, `handoff`, `report [--date]`, `stage <prospectId> <meeting|listed|lost|nurture> [--until YYYY-MM-DD]`, `suppress <email|domain> [--reason <suppression reason>]`, `clear-pause <mailbox> --by <name>`, `export <partner> <prospectId...> --out <file>`, `daily [--date]`, `status`, `dashboard [--date]`, `demo`, `app [--no-open] [--port N]`

## Layout
- `src/cli.ts`: the CLI, the only place that reads the clock; it passes `today` / `now` into every module. Paths come from `engineEnv(process.cwd())`
- `src/demo.ts`: the offline demo
- `src/app/`: the desktop app (`AMB Seller Leads.bat`): `server.ts` (loopback-only HTTP server with a per-start key; the buttons run the CLI commands in process) and `ui.html` (the one page, plain JS, no outside files). The sample mode works in `data-sample/` (git-ignored)
- `src/config.ts`: `EngineConfig` (config/engine.config.json, from config/engine.config.example.json), `engineEnv`
- `src/domain/`: CSV row schemas and enums (`schema.ts`), message shapes (`messages.ts`)
- `src/store/`: `CsvTable` and `openStores(dataDir)`: every table under `data/`
- `src/sources/`: Sunbiz, DBPR and preset CSV importers, normalization, `buildProspects`
- `src/contacts/`: website discovery, verification, enrichment, manual verification
- `src/score/`: owner-age estimate, Places client (place_id only), the likely-to-sell score
- `src/compliance/`: suppression, jurisdiction, footer and AI disclosure, lint, the gate, opt-out and complaint detection
- `src/outreach/`: template rendering; copy lives in `templates/sequence/step-1.md` to `step-3.md`
- `src/sending/`: ramp, mailbox health and `clearPause`, planner, MIME, transports, `runSend` / `recordDelivery`, preflight
- `src/replies/`: quote stripping and bounce / auto-reply detection, inbox readers, classification, drafted answers, the reply loop
- `src/qualify/`: intake questions and the qualification score and stage
- `src/readiness/`, `src/handoff/`, `src/report/`: the readiness check, handoff notes, the weekly report, partner exports
- `src/util/`: dates, the one Claude wrapper, the one Gmail credentials loader
- `reference/`: FCC wireless domains, disposable domains, valuation multiples
- `samples/tampa-bay/`: fictional sample files; `tests/`: one file per module plus `e2e-loop.test.ts`
- `data/` (git-ignored): the live tables, outbox, inbox, checks, handoffs, reports, Places cache

## Rules
- Nothing reads the clock or the network implicitly. Functions take `today` (YYYY-MM-DD) and/or `now`; every network call takes an injectable `fetchImpl` or resolver. Tests never touch the network.
- Compliance gates throw. A message that fails a CAN-SPAM, suppression, jurisdiction or licensing check throws `ComplianceError` before any transport is called. Never warn and send, and never add a path to a transport that skips `assertSendable`.
- Opt-outs are permanent. Never delete, purge, expire or edit a `data/suppression.csv` row, and never add a command that does. Every send, export, handoff and reply draft checks suppression first, with `Suppression.check` (fails closed); only scoring uses `lookup`.
- Drafts by default. `sending.mode` defaults to `"draft"`. AI-drafted replies to owners are always drafts: `qualify.auto_send_replies` stays the literal `false`.
- No invented facts. Emails and handoffs use only facts from records or the owner's own words, marked "per state records" or "per owner". Never mention or imply the owner's age, health, family, death, divorce or succession in any email; the age estimate is internal to scoring and never exported.
- Google Maps content is never stored except `place_id`. Places details live only in `data/cache/`, purged after 30 days, and score reasons never repeat ratings, review counts or websites.
- Real people only. The From name is a real AMB person from config plus the firm. AI-drafted replies say so, and "are you a bot?" gets the fixed truthful answer, never Claude's wording.
- Email only. No SMS, calls, voice or ringless voicemail. Phone numbers are display data for a person to use after a Do Not Call check.
- Never use voter files, data-broker age or birth-date appends, Google Maps scrapers, or pattern-guessed addresses. Discovery reads only the business's own site, honors robots.txt and "do not harvest" notices, and keeps addresses at the site's domain.
- `licensed_states` is a legal sign-off, not an engineering default. Never add a state, fill `licensing_signoff`, enable `lead_sales`, or switch `sending.mode` to `"send"` on your own; a person decides each one.
- Lead exports stay off unless `lead_sales.enabled` and `legal_review_ref` are set; flat fee only, never a share of the sale.
- Email copy follows HOUSE_STYLE §4: lead with the point, one claim per sentence, no exclamation marks, no em dashes, no rhetorical questions, no §4.4 banned words. "AMB Advisory Services" on first mention, then "AMB Advisory"; the footer uses "AMB Advisory Services LLC". Step 1 stays under 110 words before the footer with no links. `preflight` lints the templates.
- Real prospect data (`data/`, `output/`, `.env`, `.gmail-tokens.json`, `config/engine.config.json`) is git-ignored. Keep it that way. Samples must stay fictional (`.example` domains, 555-01xx phones).
- Claude calls go through `src/util/claude.ts` with `beta.messages.parse`, `...fallbackOptions()`, adaptive thinking and a zod output format, then `assertFinished` and a parsed-output check. Wire schemas keep every key and use `.nullable()` for anything the owner did not state.
- Gmail credentials go through `src/util/gmailAuth.ts`; the tokens file comes from an Internal OAuth app in the sending Workspace tenant.
- Style: ESM with `.ts` imports and `node:` prefixes; a `//` paragraph atop each file saying what it does and why; one-line `/** */` JSDoc on exports; comments give reasons and cite the research; zod v4 idioms; no emojis or em dashes anywhere; `it()` names are plain-English sentences; mock Claude with `vi.mock("../src/util/claude.ts", ...)`.
