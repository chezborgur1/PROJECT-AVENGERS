# Seller lead engine: design and module contracts

This is the build spec. Each module below has one owner, its files, and the
exact exports other modules call. Shared contracts already exist and must not
be changed without updating every caller:

- `src/domain/schema.ts`: every CSV row schema, enums, `splitList` / `joinList` / `normalizeEmail`
- `src/domain/messages.ts`: `OutgoingMessage`, `DeliveryResult`, `InboundMessage`
- `src/config.ts`: `EngineConfig` (`loadConfig`, `parseConfig`, `mailboxDomain`, `engineEnv`)
- `src/store/csvTable.ts` and `src/store/index.ts`: `CsvTable` (`load`, `rows`, `upsert`, `append`, `replaceAll`), `openStores(dataDir)` -> `Stores`, `nextId`, `idAllocator`
- `src/util/dates.ts`: `isoDate`, `isoStamp`, `addDays`, `addBusinessDays`, `isBusinessDay`, `daysBetween`, `yearsSince`, `isoWeekLabel`, `localTime`, `localDate`, `usFederalHolidays`
- `src/util/claude.ts`: the one Claude wrapper (`claude`, `claudeAvailable`, `CLAUDE_MODEL`, `fallbackOptions`, `assertFinished`)
- `tests/helpers.ts`: `REPO`, `tmpDir`, `tempStores`, `testConfig`, `makeProspect`, `makeLead`, `offline`

Research behind every rule is in `docs/research/` (claims, compliance, data,
deliverability, offer, repo). Cite it in comments where a rule comes from it.

## Principles (non-negotiable)

1. **Nothing reads the clock or the network implicitly.** Functions take `today: string` (YYYY-MM-DD) and/or `now: Date`, and any network call takes an injectable `fetchImpl` (default `fetch`) or resolver. Tests are offline and deterministic.
2. **Compliance gates throw.** A message that fails a CAN-SPAM, suppression, jurisdiction or licensing check throws `ComplianceError` before any transport is called. Never warn-and-send.
3. **Opt-outs are permanent.** Suppression rows are never deleted. Every send, every export, every reply draft checks suppression first.
4. **Drafts by default.** `sending.mode = "draft"` creates drafts for a person to send. AI-drafted replies to owners are always drafts (`qualify.auto_send_replies` is the literal `false`).
5. **No invented facts.** Emails and handoffs use only facts from records (founding year, city, licence). Never mention or imply the owner's age, health, family, death, divorce or succession in any email. Scoring may use estimated age internally; copy never does.
6. **Google Maps content is never stored** except `place_id` (Maps Platform terms 3.2.3). Places details live in a cache file purged after 30 days.
7. **Real people only.** The From name is a real AMB person from config, with the firm name. An AI-drafted reply says it was drafted with an AI assistant, and the engine answers truthfully whenever asked if it is a person or an AI.
8. **Email only.** No SMS, no calls, no voice (TCPA). Phone numbers are display data for a person to use after a DNC check.
9. **Style.** Match `amb-material-bot`: ESM with `.ts` imports and `node:` prefixes; each file opens with a `//` paragraph saying what it does and why; one-line `/** */` JSDoc on exports; comments give reasons; no emojis, no em dashes in comments or copy; zod v4 idioms (`z.enum(CONST)`, `.nullable()` for unknowns on Claude wire schemas); Claude calls through `src/util/claude.ts` with `beta.messages.parse`, `...fallbackOptions()`, `thinking: { type: "adaptive" }`, `output_config: { effort, format: betaZodOutputFormat(Schema) }`, then `assertFinished` and a parsed-output check. Tests are vitest, offline, `it()` names are plain-English sentences; mock Claude with `vi.mock("../src/util/claude.ts", ...)` when testing the Claude path.
10. **Email copy voice.** HOUSE_STYLE §4 applies to every template: lead with the point, name things, one claim per sentence, no exclamation marks, no em dashes, no rhetorical questions, none of the §4.4 banned words. "AMB Advisory Services" on first mention, then "AMB Advisory"; footer uses the legal name "AMB Advisory Services LLC". Emails are short (step 1 under 110 words before the footer), plain text, first person from the named sender, and contain no links in step 1.

## Data flow

```
 Sunbiz cordata (fixed width) ─┐
 DBPR licence CSV ─────────────┤ import ─► data/imports/*.csv ─► build ─► prospects.csv ─► enrich ─► score
 other licence / entity CSVs ──┤                                          (merge, vertical,   (email     (tier A/B/C,
 open POI CSV, contacts CSV ───┘                                           metro, owner)       verify)    reasons)
                                                                                                             │
       ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┘
       ▼
 plan (caps, ramp, follow-ups due) ─► render template ─► compliance gate ─► transport (outbox | gmail_api)
                                                                             draft or send ─► touches.csv
 inbox (data/inbox/*.json | Gmail API) ─► process replies ─► rules ─► Claude classify ─► replies.csv
       opt-out / bounce / complaint ─► suppression.csv (permanent), prospect dnc, mailbox health
       human reply ─► stop sequence ─► leads.csv (facts, qual score, stage) ─► drafted answer (always a draft)
 warm lead ─► readiness check (data/checks/) ─► handoff summary (data/handoffs/) ─► advisor
 weekly report (data/reports/)
```

## Module A: sources (`src/sources/`)

Files: `normalize.ts`, `sunbiz.ts`, `dbpr.ts`, `csvImport.ts`, `merge.ts`; sample files in `samples/tampa-bay/`; tests `tests/sources-*.test.ts`.

```ts
export interface ImportResult { file: string; kind: string; read: number; imported: number; skipped: number; invalid: { line: number; error: string }[] }

// normalize.ts
export function normalizeBusinessName(name: string): string        // upper, strip punctuation and suffixes (INC, LLC, CORP, CO, PA, PLLC, LTD, "THE"), collapse spaces
export function normalizeStreet(street: string): string            // upper, standard abbreviations (STREET->ST, AVENUE->AVE, SUITE/STE/# unit stripped)
export function matchKey(name: string, zip: string): string        // normalized name + "|" + 5-digit zip
export function splitPersonName(raw: string): { first: string; last: string; full: string }  // handles "LAST, FIRST M", "FIRST M LAST", suffixes JR/SR/II/III; title-cases output
export function isPersonName(raw: string): boolean                 // false for INC/LLC/CORP/SERVICES/"REGISTERED AGENT" etc.

// sunbiz.ts  (Florida Division of Corporations quarterly/daily "cordata" files)
export const SUNBIZ_LAYOUT: readonly { field: string; start: number; length: number }[]   // 1-based start, from https://dos.sunbiz.org/data-definitions/cor.html
export function parseSunbizRecord(line: string, snapshotDate: string): EntityRow | null    // null for blank/short lines
export function importSunbiz(file: string, stores: Stores, opts: { snapshotDate: string; filter?: (e: EntityRow) => boolean }): ImportResult

// dbpr.ts  (Florida DBPR licensee files, CSV with a header row; header names vary by board)
export function importDbpr(file: string, stores: Stores, opts: { snapshotDate: string; filter?: (l: LicenseRow) => boolean }): ImportResult

// csvImport.ts  (canonical CSVs and header-mapping presets for other states' files)
export const CSV_PRESETS: Record<string, { kind: "entities" | "licenses" | "contacts" | "open_poi"; columns: Record<string, string[]>; defaults?: Record<string, string> }>
//   presets: "entities", "licenses", "contacts", "open_poi" (canonical headers), plus "cslb", "tdlr", "tsbde", "wa_lni", "overture", "foursquare"
export function importCsv(preset: string, file: string, stores: Stores, opts: { snapshotDate: string }): ImportResult

// merge.ts
export interface BuildResult { created: number; updated: number; unchanged: number; skipped: { reason: string; name: string }[] }
export function assignVertical(text: string[], licenseCodes: string[], config: EngineConfig): string   // "" when none
export function assignMetro(county: string, zip: string, state: string, config: EngineConfig): string  // "" when none
export function buildProspects(stores: Stores, config: EngineConfig, opts: { now: Date }): BuildResult
```

`buildProspects` joins licences to entities by `matchKey` (and licence business name / DBA), attaches open POI rows (website, phone) and contact rows (email) the same way, and upserts `prospects.csv`. It keeps existing prospect ids and every sequence and scoring field; it never changes the status of a `dnc`, `in_sequence`, `replied` or `completed` prospect. New prospects get `status = "new"`. The owner is the first person (`is_person = Y` or `isPersonName`) among officers with an owner title (Sunbiz corporation titles P, PRES, CEO, D, DIR, OWNER; LLC titles MGR, MGRM, AMBR, AP, MBR, MEMBER; partners GP), else a licence person with an owner-type role. Registered agents and qualifiers (RME, qualifying agent) are never the owner. `officer_count` counts distinct person officers. Licences outside the configured verticals and businesses outside every metro are skipped with a reason.

## Module B: scoring and Places (`src/score/`)

Files: `age.ts`, `score.ts`, `places.ts`; tests `tests/score-*.test.ts`.

```ts
// age.ts
export interface AgeEstimate { low: number; high: number; method: "graduation_year" | "license_issue_year" | "formation_year" | "" }
export function estimateOwnerAge(p: ProspectRow, today: string): AgeEstimate   // grad year + 25..27 for dentists; licence issue year at age 25..32; formation year at age 28..40; most confident wins

// places.ts  (Places API (New); only place_id is persisted)
export interface PlacesDetails { placeId: string; businessStatus: string; rating?: number; userRatingCount?: number; websiteUri?: string; fetchedAt: string }
export class PlacesClient {
  constructor(opts: { apiKey: string; cacheDir: string; fetchImpl?: typeof fetch; now: Date; maxDetailsPerMonth?: number })
  matchPlaceId(p: ProspectRow): Promise<{ placeId: string; confidence: number } | null>   // Text Search, field mask "places.id" only (free ID-only SKU)
  details(placeId: string): Promise<PlacesDetails | null>                               // cache hit if fetched < 30 days ago; else one Enterprise call; null past the monthly budget
  purgeExpired(): number                                                                 // drops cache entries older than 30 days; returns count
}

// score.ts
export interface ScoreResult { score: number; tier: "A" | "B" | "C"; components: Record<string, number>; reasons: string[]; knockout?: string; age: AgeEstimate; tenureYears?: number }
export function scoreProspect(p: ProspectRow, ctx: { config: EngineConfig; today: string; places?: PlacesDetails | null; suppressedReason?: string }): ScoreResult
export function scoreAll(stores: Stores, config: EngineConfig, opts: { today: string; now: Date; places?: PlacesClient }): { scored: number; excluded: number; byTier: Record<string, number> }
```

Weights from `docs/research/data.md` §9: owner age 30, tenure 20, no apparent successor 15, size fit 15, fatigue signals 10, vertical prior 10 (`config.verticals[v].prior`). Knock-outs (score 0, status `excluded` with `exclude_reason`): inactive entity or licence, `CLOSED_PERMANENTLY`, franchise/chain name pattern, excluded domain, suppressed, tenure under `targeting.min_tenure_years`, no vertical or no metro. A prospect without a sendable email (`valid`, or `catch_all`) scores but goes to `hold`. Tiers from `targeting.tier_a_min` / `tier_b_min`. `scoreAll` only rescoring prospects in `new`, `scored`, `hold`; it writes `score`, `tier`, `score_components` ("age=27; tenure=20; ..."), `score_reasons` (plain English, e.g. "Licensed since 1994 (32 years)", "Sole officer on every annual report since 2004", never the estimated age as a fact: write "Licence issued 1994, which suggests a senior owner"), `age_est_*`, `tenure_years`, `scored_at`, and `place_id` when matched.

## Module C: contacts and compliance (`src/contacts/`, `src/compliance/`)

Files: `contacts/verify.ts`, `contacts/discover.ts`, `contacts/enrich.ts`, `compliance/suppression.ts`, `compliance/jurisdiction.ts`, `compliance/footer.ts`, `compliance/lint.ts`, `compliance/gate.ts`, `compliance/optout.ts`, data files `reference/fcc-wireless-domains.txt`, `reference/disposable-domains.txt`; tests `tests/contacts-*.test.ts`, `tests/compliance-*.test.ts`.

```ts
// contacts/verify.ts
export interface Verification { status: (typeof VERIFICATION_STATUSES)[number]; detail: string }
export function verifyEmail(email: string, opts?: { resolveMx?: (domain: string) => Promise<string[]>; verifierApiKey?: string; fetchImpl?: typeof fetch }): Promise<Verification>
//   syntax -> disposable -> FCC wireless domain (invalid: never send) -> MX (none = invalid) -> optional verifier API (ZeroBounce-compatible) -> "unknown" without an API
//   role-based local parts (info, office, sales, admin, contact, service, support, billing, hello) -> "role_based" (sendable only when it is the business's only address; see enrich)
export function isSendableVerification(status: string): boolean   // valid | catch_all | role_based

// contacts/discover.ts  (the business's own website; no address harvesting from pages that forbid it, no pattern guessing)
export function discoverEmails(website: string, opts: { fetchImpl?: typeof fetch; maxPages?: number }): Promise<{ email: string; url: string }[]>
//   fetch home, /contact, /contact-us, /about (same host only), honour robots.txt Disallow, extract mailto: and plain addresses at the site's domain, skip pages containing a "do not harvest"/"no unsolicited" notice

// contacts/enrich.ts
export function enrichContacts(stores: Stores, config: EngineConfig, opts: { now: Date; discover: boolean; verify: boolean; fetchImpl?: typeof fetch; resolveMx?: (d: string) => Promise<string[]>; verifierApiKey?: string }): Promise<{ found: number; verified: number; byStatus: Record<string, number> }>
//   for prospects in new/scored/hold: pick the best email (owner-name match > other person > role-based), record email_source(+url), verify, write email_verification + email_verified_at; never overwrite a verified email with an unverified one

// compliance/suppression.ts
export class Suppression {
  constructor(table: Stores["suppression"])
  check(email: string, prospectId?: string): SuppressionRow | undefined   // email, its domain, or the prospect id
  add(value: string, valueType: "email" | "domain" | "prospect", reason: SuppressionRow["reason"], source: string, now: Date): void   // idempotent; never removes
  all(): SuppressionRow[]
}

// compliance/jurisdiction.ts
export function jurisdictionBlock(p: Pick<ProspectRow, "state" | "zip">, email: string, config: EngineConfig): string | undefined
//   blocks: state not in config.licensed_states (or the list empty); state not a US state; email TLD a non-US ccTLD (.ca .uk .co.uk .eu .de .fr .mx .au ... any 2-letter TLD except .us); FCC wireless domain

// compliance/footer.ts
export function adNotice(config: EngineConfig): string     // the CAN-SPAM advertisement identification line, plain and honest
export function buildFooter(config: EngineConfig, mailbox: Mailbox): string   // sender name, title, firm legal name, postal address, phone, opt-out instruction ("Reply 'unsubscribe' and I will not email you again." plus the URL when configured)
export function aiDisclosure(config: EngineConfig, mailbox: Mailbox): string  // "I drafted this reply with an AI assistant; <sender> reviews every message before it is sent." style, truthful
export function listUnsubscribeHeaders(config: EngineConfig, mailbox: Mailbox, touchId: string): Record<string, string>  // List-Unsubscribe (mailto with subject "unsubscribe <touchId>", plus https URL when configured) and List-Unsubscribe-Post when a URL exists

// compliance/lint.ts
export function lintSubject(subject: string): string[]   // no "Re:"/"Fwd:" on a first message, no ALL CAPS words over 3 letters, no "!", no false urgency ("urgent", "final notice", "act now"), no invented offers ("buyer waiting", "cash offer"), length 3-60 chars
export function lintBody(body: string, opts: { step?: number; kind: "outreach" | "reply" }): string[]   // HOUSE_STYLE §4.4 banned words, em dashes, "!", rhetorical questions in step 1, links in step 1, age/health/death/family/divorce words, "appraisal"/"certified valuation"/"guarantee", word count (step 1 <= 110 before footer)
export function lintMessage(msg: OutgoingMessage, config: EngineConfig): string[]   // subject + body + footer present (postal address, opt-out), From name contains a configured sender name

// compliance/gate.ts
export class ComplianceError extends Error { constructor(readonly reasons: string[]) }
export function assertSendable(msg: OutgoingMessage, ctx: { config: EngineConfig; suppression: Suppression; prospect?: ProspectRow }): void
//   throws with every reason: suppressed; jurisdiction block; licensed_states empty or licensing_signoff blank; postal address blank; mailbox not in config or paused; prospect status dnc; email verification not sendable (outreach only); lint failures
//   reply kind: suppression + footer + sender checks, verification not required

// compliance/optout.ts
export function detectOptOut(text: string): boolean   // deterministic: unsubscribe, remove me, take me off, stop emailing, do not contact, opt out, no more emails, "stop" alone, leave me alone; checked on the stripped reply before any classifier
export function detectComplaint(text: string): boolean // spam, reported, harassment, cease and desist, attorney general, lawyer
```

## Module D: outreach and sending (`src/outreach/`, `src/sending/`)

Files: `outreach/templates.ts`, `templates/sequence/step-1.md`, `step-2.md`, `step-3.md`, `sending/ramp.ts`, `sending/health.ts`, `sending/planner.ts`, `sending/mime.ts`, `sending/transports.ts`, `sending/run.ts`, `sending/preflight.ts`; tests `tests/outreach-*.test.ts`, `tests/sending-*.test.ts`.

```ts
// outreach/templates.ts   templates are markdown files: a "subject: ..." first line, a blank line, then the body with {tokens}
export interface Rendered { subject: string; body: string }
export const TEMPLATE_TOKENS: readonly string[]   // first_name, business_name, short_business_name, city, vertical_noun, since_year, years, license_phrase, sender_first_name, sender_name, firm_name, firm_short_name
export function loadTemplates(dir: string): Record<1 | 2 | 3, { subject: string; body: string }>
export function renderStep(step: 1 | 2 | 3, p: ProspectRow, config: EngineConfig, mailbox: Mailbox, opts: { templatesDir: string; today: string }): Rendered   // throws when a token has no value and no fallback; body excludes footer
export function lintTemplates(dir: string, config: EngineConfig): string[]   // renders each step against a sample prospect and runs lintSubject/lintBody

// sending/ramp.ts
export function coldWeek(mailbox: Mailbox, config: EngineConfig, today: string): number   // 0 during warm-up, then 1, 2, ...
export function mailboxDailyCap(mailbox: Mailbox, config: EngineConfig, today: string): number   // ramp[min(week, len)-1] capped by max_per_mailbox_per_day and mailbox.max_per_day; 0 when paused or warming up

// sending/health.ts
export interface MailboxHealth { mailbox: string; sends: number; hardBounces: number; bounceRate: number; complaints: number; optOuts: number; pause: boolean; reasons: string[] }
export function mailboxHealth(stores: Stores, config: EngineConfig, mailbox: string, today: string): MailboxHealth   // from touches (sent) and replies (bounce, complaint, opt-out) in the guardrail windows

// sending/planner.ts
export interface PlannedMessage { prospectId: string; step: 1 | 2 | 3; mailbox: string }
export interface DayPlan { date: string; sendDay: boolean; items: PlannedMessage[]; skipped: { prospectId: string; reason: string }[]; caps: Record<string, { cap: number; used: number }>; paused: Record<string, string[]> }
export function planDay(stores: Stores, config: EngineConfig, opts: { today: string }): DayPlan
//   not a send day (weekday not in send_days, holiday, usFederalHolidays) -> empty plan
//   follow-ups first: in_sequence prospects with next_touch_date <= today, sequence_step < 3, no human reply, same mailbox as step 1
//   then new step 1: status scored, tier in send_tiers, sendable verification, not suppressed, jurisdiction ok, score desc; catch-all share cap; the least-loaded healthy mailbox
//   caps: per mailbox (mailboxDailyCap minus touches already today), per sending domain (max_per_domain_per_day); paused mailboxes get 0 (health + config)

// sending/mime.ts
export function buildMime(msg: OutgoingMessage, opts: { date: Date; messageIdDomain: string }): string   // RFC 5322: From "<fromName>" <mailbox>, To, Subject (RFC 2047 when non-ASCII), Date, Message-ID, MIME-Version, Content-Type text/plain; charset=UTF-8, Content-Transfer-Encoding quoted-printable, extra headers
export function base64url(s: string): string

// sending/transports.ts
export interface Transport { readonly name: string; deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult> }
export class OutboxTransport implements Transport   // constructor(outboxDir, today): writes <outbox>/<today>/<touchId>.json (the whole OutgoingMessage plus mode) and appends to <outbox>/<today>/README.md a checklist the Claude Gmail connector works through; returns {} (ids are recorded later)
export class GmailApiTransport implements Transport // constructor({ tokensFile, fetchImpl, now }): OAuth refresh per mailbox (client id/secret/refresh token in the tokens file), POST gmail/v1/users/me/drafts or /messages/send with { raw: base64url(mime), threadId }
export class MemoryTransport implements Transport   // for tests and the demo: records every message

// sending/run.ts
export interface SendReport { date: string; mode: "draft" | "send"; transport: string; delivered: { touchId: string; prospectId: string; step: number; mailbox: string }[]; blocked: { prospectId: string; reasons: string[] }[]; failed: { prospectId: string; error: string }[]; plan: DayPlan }
export function runSend(stores: Stores, config: EngineConfig, opts: { today: string; now: Date; transport: Transport; templatesDir: string; dryRun?: boolean }): Promise<SendReport>
//   plan -> render -> footer + ad notice + List-Unsubscribe headers -> assertSendable -> touches row (planned) -> deliver -> touches status drafted/sent + ids -> prospect: status in_sequence, sequence_step, mailbox, last_touch_at, next_touch_date (addBusinessDays by follow_up_gaps; blank after step 3, and status completed when step 3 had no reply after its gap), thread_id
//   dryRun: plan and render and gate, write nothing, call no transport
export function recordDelivery(stores: Stores, touchId: string, result: { status: "drafted" | "sent" | "failed"; messageId?: string; threadId?: string; draftId?: string; error?: string }, now: Date): void
//   for the outbox transport: the Claude routine calls `lead-engine record <touchId> ...` after it creates the draft or sends

// sending/preflight.ts
export interface PreflightItem { check: string; ok: boolean; detail: string }
export function preflight(config: EngineConfig, opts: { today: string; templatesDir: string; resolveTxt?: (name: string) => Promise<string[][]> }): Promise<PreflightItem[]>
//   config: postal address, licensed_states + signoff, mailboxes, sender names; DNS per sending domain: SPF (one record, includes _spf.google.com or the provider), DKIM at google._domainkey (configurable selector), DMARC at _dmarc; warm-up status per mailbox; templates lint
```

Step copy (step-1.md to step-3.md) is part of this module. Step 1 offers the free exit-readiness check (a rough value range and the checklist buyers use), names one record-based fact (licensed since, founded in, the city), asks for a one-word reply, has no link, and carries no pitch to sell. Step 2 is a short follow-up adding one concrete item from the checklist. Step 3 is a polite close ("I will not follow up again"). Subjects are plain and literally true ("Exit-readiness check for {short_business_name}").

## Module E: replies and qualification (`src/replies/`, `src/qualify/`)

Files: `replies/parse.ts`, `replies/inbox.ts`, `replies/classify.ts`, `replies/respond.ts`, `replies/process.ts`, `qualify/questions.ts`, `qualify/score.ts`; tests `tests/replies-*.test.ts`, `tests/qualify-*.test.ts`.

```ts
// replies/parse.ts
export function stripQuoted(text: string): string    // drop "On ... wrote:", ">" lines, "-----Original Message-----", signature after "-- "
export function detectBounce(msg: InboundMessage): { type: "hard" | "soft"; recipient?: string; code?: string } | null   // mailer-daemon / postmaster senders, DSN subjects, 5.x.x (hard), 4.x.x (soft), "550 5.7.515" / "550; 5.7.515"
export function detectAutoReply(msg: InboundMessage): boolean   // Auto-Submitted != no, X-Autoreply, Precedence auto_reply/bulk, OOO subjects and phrases

// replies/inbox.ts
export function readInboxFolder(dir: string): { messages: InboundMessage[]; invalid: { file: string; error: string }[] }   // *.json files (one message or an array) written by the Claude Gmail connector routine; moves nothing
export class GmailApiInbox { constructor(opts: { tokensFile: string; fetchImpl?: typeof fetch; now: Date }); fetchSince(mailbox: string, sinceIso: string): Promise<InboundMessage[]> }

// qualify/questions.ts
export interface IntakeQuestion { key: string; field: keyof LeadRow; text: string; priority: number }
export const INTAKE_QUESTIONS: readonly IntakeQuestion[]   // revenue (band), owner earnings / SDE (band), timeline, motivation (what prompted the interest), employees, owner hours, recurring share, largest customer share, real estate owned or leased, who holds the licence
export function nextQuestions(lead: LeadRow, max: number): IntakeQuestion[]   // unanswered and not yet asked, by priority

// qualify/score.ts
export interface QualResult { score: number; reasons: string[]; missing: string[]; fit: "in_range" | "too_small" | "too_large" | "unknown" }
export function qualScore(lead: LeadRow, config: EngineConfig): QualResult   // timeline 30, size fit 25 (revenue/SDE vs config.qualify), motivation 20, engagement 15 (wants the check, answered questions), owner dependence/readiness facts 10
export function nextStage(lead: LeadRow, cls: ReplyClass, q: QualResult, config: EngineConfig): LeadStage

// replies/classify.ts
export interface Classification { class: ReplyClass; classifier: "rules" | "claude"; optOut: boolean; complaint: boolean; facts: Partial<Pick<LeadRow, "revenue" | "revenue_band" | "sde" | "ebitda" | "employees" | "years_owned" | "owner_hours_per_week" | "recurring_revenue_pct" | "top_customer_pct" | "owns_real_estate" | "license_holder" | "timeline" | "motivation" | "motivation_detail" | "wants_readiness_check">>; question?: string; notes: string }
export function classifyByRules(msg: InboundMessage, strippedText: string): Classification | null   // bounce, auto_reply, unsubscribe (detectOptOut), complaint, asks_if_ai; null when the rules cannot decide
export function classifyReply(msg: InboundMessage, ctx: { prospect: ProspectRow; lead?: LeadRow; config: EngineConfig }): Promise<Classification>
//   rules first; then Claude (structured wire schema, every key present, nulls for anything the owner did not state; facts only when stated) when claudeAvailable(); else a keyword fallback (interested / not_now / not_interested / question / other)
//   opt-out detected by rules always wins over Claude

// replies/respond.ts
export function draftResponse(cls: Classification, ctx: { prospect: ProspectRow; lead: LeadRow; config: EngineConfig; mailbox: Mailbox }): { subject: string; body: string } | null
//   interested -> thanks + up to 3 nextQuestions in plain words + what they get; question -> a direct answer from a fixed FAQ (who AMB is, where the address came from: public state licence and business filings, cost: free and no obligation, confidentiality) + the questions; asks_if_ai -> truthful answer plus offer of a call with the named sender; not_now -> short acknowledgement; wrong_person / not_interested -> short apology, no further mail; unsubscribe / bounce / auto_reply / complaint -> null
//   every body ends with aiDisclosure + buildFooter; subject "Re: <original subject>"

// replies/process.ts
export interface ProcessReport { received: number; duplicates: number; unmatched: number; byClass: Record<string, number>; suppressed: number; drafted: number; errors: { replyId: string; error: string }[] }
export function processInbox(stores: Stores, config: EngineConfig, opts: { now: Date; today: string; messages: InboundMessage[]; transport: Transport; classify?: typeof classifyReply }): Promise<ProcessReport>
//   dedupe by reply_id; match by thread_id (touches) then from email (prospects); record replies.csv
//   unsubscribe / complaint / wrong_person / hard bounce -> Suppression.add (email; prospect too) + prospect status dnc, lead stage lost; complaint also logs the mailbox for pause
//   any human reply -> prospect status replied (stops the sequence); upsert lead (never overwrite a stated fact with a blank), qualScore, nextStage, questions_asked
//   draftResponse -> assertSendable(kind reply) -> transport.deliver(msg, "draft") -> touches row kind reply
```

## Module F: readiness check, handoff, reporting, exports (`src/readiness/`, `src/handoff/`, `src/report/`)

Files: `reference/multiples.json`, `readiness/multiples.ts`, `readiness/check.ts`, `handoff/handoff.ts`, `report/weekly.ts`, `report/exportLeads.ts`, `docs/EXIT_READINESS_CHECK.md`; tests `tests/readiness-*.test.ts`, `tests/handoff-*.test.ts`, `tests/report-*.test.ts`.

```ts
// readiness/multiples.ts
export interface MultipleRow { key: string; vertical: string; method: "sde" | "revenue" | "collections"; low: number; mid: number; high: number; size_band: string; source: string; source_url: string; as_of: string; verified: boolean; verified_by: string; notes: string }
export function loadMultiples(file: string): MultipleRow[]
export function pickMultiple(rows: MultipleRow[], key: string, sde?: number): MultipleRow | undefined   // verified rows only

// readiness/check.ts
export interface ReadinessItem { driver: string; item: string; status: "met" | "gap" | "unknown"; note: string }
export interface ReadinessCheck { score: number; drivers: Record<string, number>; items: ReadinessItem[]; range?: { low: number; high: number; method: string; basis: string; source: string }; rangeWithheld?: string; markdown: string; emailBody: string }
export function buildReadinessCheck(lead: LeadRow, p: ProspectRow, config: EngineConfig, opts: { today: string; multiples: MultipleRow[] }): ReadinessCheck
//   8 drivers in AMB's own words (financial records, owner dependence, customer concentration, recurring revenue, team depth, growth, licences and transferability, real estate and lease), 15-25 checklist items
//   range only when readiness.include_range, the row is verified, SDE (or revenue for revenue-method rows) stated by the owner, and SDE < readiness.max_sde_for_range; rounded to $25K; excludes real estate; position in the range follows the readiness score; otherwise rangeWithheld says why and the email offers a call
//   disclaimer: not an appraisal or certified valuation, not for lender reliance, depends on verified financials, excludes real estate and working capital, rules of thumb from <source, as_of>
export function writeReadinessCheck(stores: Stores, check: ReadinessCheck, p: ProspectRow): string   // data/checks/<prospect_id> <business>.md; returns the path

// handoff/handoff.ts
export interface HandoffResult { prospectId: string; file: string; summary: string }
export function handOffWarmLeads(stores: Stores, config: EngineConfig, opts: { now: Date; today: string; multiples: MultipleRow[] }): HandoffResult[]
//   warm leads not yet handed off: one-paragraph summary (deterministic, fact order: who, what, where, since, size stated, timeline, motivation, what they asked for), facts table with "per owner" attribution, why they look like a seller (score_reasons), conversation excerpts (replies snippets), readiness check link, suggested next step; lead stage handed_off, handoff_file, handed_off_at

// report/weekly.ts
export interface WeeklyMetrics { week: string; sent: number; drafted: number; newProspectsContacted: number; humanReplies: number; replyRate: number; positiveReplies: number; optOuts: number; bounces: number; bounceRate: number; complaints: number; qualified: number; handedOff: number; meetings: number; listingsSigned: number; byMailbox: Record<string, { sent: number; bounces: number; paused: boolean }>; alarms: string[] }
export function weeklyReport(stores: Stores, config: EngineConfig, opts: { today: string }): { metrics: WeeklyMetrics; markdown: string; file: string }   // the 7 days ending today; also cumulative funnel; writes data/reports/<isoWeek>.md

// report/exportLeads.ts
export function exportLeads(stores: Stores, config: EngineConfig, opts: { partner: string; now: Date; prospectIds: string[]; outFile: string }): { exported: number; skipped: { prospectId: string; reason: string }[] }
//   throws unless lead_sales.enabled and legal_review_ref set; flat fee only (no share of the sale); never exports a suppressed or dnc prospect; logs exports.csv
```

## Module G: CLI, demo, docs (after A to F)

`src/cli.ts` (hand-rolled like amb-bot): `init`, `preflight`, `import <sunbiz|dbpr|csv:<preset>> <file> [--snapshot YYYY-MM-DD]`, `build`, `enrich [--discover] [--no-verify]`, `score [--places]`, `plan [--date]`, `send [--date] [--dry-run]`, `record <touchId> <drafted|sent|failed> [--message-id] [--thread-id] [--draft-id] [--error]`, `sync [--since]` (inbox folder or Gmail API), `qualify` (process inbox), `check <prospectId>`, `handoff`, `report`, `stage <prospectId> <stage>`, `suppress <email|domain> [--reason]`, `export <partner> <ids...>`, `daily` (sync, qualify, handoff, send), `status`, `demo`. `src/demo.ts` runs the whole loop offline on `samples/tampa-bay/` in a temp data folder with `MemoryTransport` and canned replies. Docs: `README.md`, `CLAUDE.md`, `.env.example`, `config/engine.config.example.json`, `docs/RUNBOOK.md` (setup steps and the Claude scheduled-task prompts that replace the plan's Grok Bot), `docs/COMPLIANCE.md`, `docs/DATA_SOURCES.md`, `docs/PLAN_REVIEW.md` (what the fact-check changed in the plan). Root `README.md` row and `setup.sh` / `setup.bat` blocks.
