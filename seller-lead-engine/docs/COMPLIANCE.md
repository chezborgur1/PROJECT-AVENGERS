# Compliance: what the engine enforces, and what still needs counsel

Every cold email AMB Advisory Services sends is a commercial message under
CAN-SPAM, which has no business-to-business exception, and each violating
email can cost up to $53,088 (the 2025 inflation-adjusted figure). So one
missing footer across a 500-owner batch is 500 violations. That is why the
engine's checks block the send instead of warning (`ComplianceError` in
`src/compliance/gate.ts`). The research behind each rule is in
[research/compliance.md](research/compliance.md); it was read through search
summaries, not full statute text, and it is not legal advice. Counsel should
confirm the items in the last two sections before the first send.

## Rules the engine enforces

### Every commercial email

| Rule | Where in the code | Basis |
|---|---|---|
| States plainly that it is a marketing email ("This is a marketing email from AMB Advisory Services.") | `adNotice` in `src/compliance/footer.ts`, added by `src/sending/run.ts`; `lintMessage` in `lint.ts` refuses an outreach email without it | 15 U.S.C. 7704(a)(5)(A)(i) |
| Carries a valid physical postal address | `firm.postal_address` (required) in `src/config.ts`; `buildFooter`; `lintMessage`; `preflight` | 7704(a)(5)(A)(iii); 16 CFR 316.2(p): street address, or a USPS PO box or CMRA mailbox accurately registered to AMB |
| Carries a working opt-out that needs only a reply ("Reply 'unsubscribe' and I will not email you again."), plus the one-click URL when one is configured | `buildFooter` and `listUnsubscribeHeaders` in `footer.ts`; `lintMessage` | 7704(a)(3); 16 CFR 316.5 (no fee, no data beyond the address); RFC 8058 and Gmail's sender rules for the headers |
| Identifies the real sender: a real AMB person and the firm in the From name, the legal name "AMB Advisory Services LLC" in the footer | `MailboxSchema` in `config.ts`; `buildFooter`; `lintMessage` checks the From name against configured senders | 7704(a)(1) header accuracy; *Balsam v. Trancos* (Cal. Ct. App. 2012) on privacy-registered domains; FTC Impersonation Rule, 16 CFR 461 |
| Subject lines are literally true: no fake "Re:" or "Fwd:" on a first email, no urgency or deadlines, no invented buyers or offers, no shouting caps, no "!" | `lintSubject` in `lint.ts`; subjects are fixed in `templates/sequence/` | 7704(a)(2); Cal. B&P 17529.5(a)(3); Wash. RCW 19.190 (*Brown v. Old Navy*, 2025) |
| No claim of an appraisal, certified valuation or guarantee; the free check has no conditions | `lintBody` in `lint.ts`; template copy; the disclaimer in `src/readiness/check.ts` | FTC Act Section 5 (15 U.S.C. 45); FTC Guide on "Free", 16 CFR 251.1 |
| Never mentions or implies the owner's age, health, family, death, divorce or succession | `lintBody` (`SENSITIVE_PATTERNS`); `renderStep` in `src/outreach/templates.ts` fills tokens from record facts only | DESIGN.md principle 5; estimated age is personal information under the CCPA (an inference) |
| Plain text: no tracking pixel, no tracked links, no attachments, no links at all in step 1 | `OutgoingMessage` in `src/domain/messages.ts`; `lintBody`; `src/sending/mime.ts` | research/deliverability.md section 3 |
| Every message is checked immediately before the transport, and a failure stops that message with every reason listed | `assertSendable` in `gate.ts`, called by `runSend` and `processInbox`; blocked sends leave a `cancelled` touch with the reasons | research/compliance.md section 9 rules 1 and 14 |

### Who may be emailed

| Rule | Where in the code | Basis |
|---|---|---|
| Only businesses in a state on `licensed_states`, and only with `licensing_signoff` filled; an empty list sends nothing; `send` refuses while either fails `preflight` | `jurisdictionBlock` in `src/compliance/jurisdiction.ts`; `assertSendable`; `preflight` in `src/sending/preflight.ts` | Fla. Stat. 475.01 ("directs or assists in the procuring of prospects"); Cal. B&P 10131(a); Illinois 815 ILCS 307 |
| US only: US state and ZIP, no non-US country-code domain (.ca, .uk, EU and every 2-letter TLD except .us), no Canadian or Caribbean area code; anything unknown blocks | `jurisdiction.ts` (`NON_US_GEO_TLDS`, `NON_US_NANP_AREA_CODES`) | CASL (opt-in); GDPR Art. 3(2); PECR |
| Never to an FCC-listed wireless carrier domain | `reference/fcc-wireless-domains.txt`; `verifyEmail` marks them invalid; `jurisdictionBlock` | CAN-SPAM section 14; 47 CFR 64.3100 |
| Only to a sendable verified address (`valid`, `catch_all`, or `role_based` when it is the business's only address); catch-alls capped at 10% of a day's new sends | `isSendableVerification` in `src/contacts/verify.ts`; `assertSendable` (outreach); `planDay` | Hard bounces damage the domain; research/deliverability.md section 3 |
| Never a suppressed address, its domain or parent domain, its +tag or Gmail-dot variant, or a suppressed prospect id | `Suppression.check` in `src/compliance/suppression.ts`, used by the gate, `handoff.ts`, `exportLeads.ts` and `process.ts` | 7704(a)(4) |
| Never a `dnc` or excluded prospect, a franchise or chain name, an excluded domain, or a closed business | `assertSendable`; knock-outs in `src/score/score.ts` | Business rules from research/data.md section 9 |

### Opt-outs and replies

| Rule | Where in the code | Basis |
|---|---|---|
| Opt-out wording is caught by fixed patterns before any classifier, errs toward suppressing, and always wins over Claude. It is looked for in the owner's new text (including text written below or between quoted lines), in the subject (a List-Unsubscribe mailto click arrives as "unsubscribe T-000123", matched to the prospect by that touch id), and in the body without its ">" lines | `detectOptOut` in `src/compliance/optout.ts`; `optOutIn` and `classifyByRules` in `src/replies/classify.ts`; `stripQuoted` and `unsubscribeTouchId` in `src/replies/parse.ts` | 7704(a)(4) (10 business days); Gmail expects 2 days |
| Header unsubscribes go only to a mailbox the reply loop reads: `sending.unsubscribe_mailbox` is blank or one of `mailboxes`, else `preflight` fails and `send` refuses | `preflight` ("unsubscribe mailbox"); `SEND_BLOCKING_CHECKS` in `src/cli.ts` | 7704(a)(3) (the mechanism must work) |
| A reply whose processing fails after it is classified is retried on the next run, never filed as done, so an opt-out whose suppression write failed is not lost | `processInbox` resets the class on failure | 7704(a)(4) |
| Messages already made but not sent are cancelled when the owner opts out, complains, bounces or is suppressed by hand: planned outbox items are withdrawn, drafts made after the owner wrote are cancelled and listed for deletion, and `record` refuses a cancelled touch | `cancelPendingTouches` and `recordDelivery` in `src/sending/run.ts`; `processInbox`; `suppress` | 7704(a)(4) |
| A complaint needs spam said of the email, a report, harassment, or a lawyer as a threat; "found this in my spam folder" or "my lawyer reviews contracts" is not one (a complaint suppresses for good and pauses sending) | `detectComplaint` in `optout.ts` | Avoids suppressing an interested owner by mistake |
| Opt-outs, complaints, "not the owner" replies and hard bounces are suppressed in the same run, and the prospect becomes `dnc` | `processInbox` in `src/replies/process.ts`; `Suppression.add` | 7704(a)(4); research/compliance.md section 9 rule 2 |
| **Suppression is permanent.** Rows are never deleted, purged or expired, and no command removes one. If the file has an unreadable row, `check` treats every address as suppressed until it is fixed | `Suppression` (`add` and `check` only); `SuppressionRowSchema` in `src/domain/schema.ts` | An opt-out never expires without later affirmative consent (7704(a)(4)) |
| A suppressed or opted-out address is never sold, transferred or exported | `exportLeads` in `src/report/exportLeads.ts` | 7704(a)(4)(A)(iv) |
| Authentication bounces (550 5.7.515, 5.7.26 and the other codes in `POLICY_BOUNCE_CODES`) suppress nobody and pause the mailbox until a person clears it | `detectBounce` in `src/replies/parse.ts`; `process.ts`; `mailboxHealth` and `clearPause` in `src/sending/health.ts` | The failure is AMB's domain, not the recipient; Outlook.com and Gmail sender rules |
| Every AI-drafted reply is a draft a person sends. `qualify.auto_send_replies` is the literal `false` | `src/config.ts`; `processInbox` delivers with mode `draft` | Workspace AUP risk; human approval of anything about value, fees or licensing (research/compliance.md section 9 rule 10) |
| AI-drafted replies say so ("This reply was drafted with an AI assistant. <sender> of AMB Advisory Services reviews every reply before it is sent.") and carry the footer | `aiDisclosure` and `buildFooter` in `footer.ts`; `draftResponse` in `src/replies/respond.ts`; `lintMessage` | Maine 10 M.R.S. 1500-DD; Utah AI Policy Act outset safe harbor; California BOT Act (B&P 17941); follow-ups that promote AMB are still commercial |
| "Are you a bot?" gets a fixed truthful answer, never Claude's wording | `classifyByRules` (`asks_if_ai`); `draftResponse` | Same as above |

### Sending volume and mailbox health

| Rule | Where in the code | Basis |
|---|---|---|
| No cold email during warm-up; then 5, 10, 15, 20 a day per mailbox, at most 25 per mailbox and 75 per sending domain, far below Gmail's 5,000-a-day bulk line (crossing it once is permanent) | `src/sending/ramp.ts`; `planDay` | Gmail bulk-sender rules; Workspace AUP ban on unsolicited bulk mail |
| A mailbox pauses at 2% hard bounces over 14 days, 3 hard bounces in a day, any complaint (which pauses every mailbox), or any authentication bounce; new sends pause above 5% opt-outs | `mailboxHealth` in `health.ts`; `config.guardrails` | Gmail spam rate under 0.3%; research/deliverability.md section 6 |
| Drafts by default: `sending.mode` is `"draft"` until a person changes it | `src/config.ts`; `runSend` | research/deliverability.md section 4 |
| Sending domains are separate from `ambadvisoryservices.com` | `preflight` | Isolates a Workspace suspension; registered openly to AMB (18 U.S.C. 1037(a)(4); *Balsam*) |

### Data collection

| Rule | Where in the code | Basis |
|---|---|---|
| Addresses come only from the business's own website (same host, robots.txt honored, any "do not harvest" notice puts the whole site off limits, obfuscated addresses left alone), imports, or the owner's reply. No pattern guessing | `src/contacts/discover.ts`; `enrich.ts` | 15 U.S.C. 7704(b)(1) (harvesting and dictionary attacks are aggravated violations) |
| Every address records where it came from | `email_source`, `email_source_url`, `sources` on `ProspectRowSchema` | Provenance (research/compliance.md section 9 rule 8) |
| Only the Google `place_id` is stored. Details sit in `data/cache/` for at most 30 days; matching uses the free ID-only search; a monthly budget stops paid calls at 900; score reasons never repeat Maps content | `src/score/places.ts`; `src/score/score.ts` | Google Maps Platform Terms 3.2.3(a) and (b) |
| Owner age is estimated only from license, graduation and formation years, kept internal, and never exported | `src/score/age.ts`; `exportLeads.ts` | Voter-file and data-broker rules; CCPA |
| Phone numbers are display data only | No SMS, call or voice code exists; `handoff.ts` notes the Do Not Call check | TCPA, 47 U.S.C. 227 ($500 to $1,500 per call or text); Florida FTSA 501.059 |

### The readiness check and lead sales

| Rule | Where in the code | Basis |
|---|---|---|
| A rough range only from a verified multiples row and an SDE (or revenue) the owner stated, below $1M SDE, rounded to $25K, real estate excluded, always with the disclaimer | `buildReadinessCheck` in `src/readiness/check.ts`; `pickMultiple` in `multiples.ts` | FTC Act Section 5; FTC Advertising Substantiation statement; state appraiser licensing for real property |
| Lead exports are refused unless `lead_sales.enabled` and `legal_review_ref` are set; flat fee only; no age estimate or score | `exportLeads` | Brokerage licensing (Fla. Stat. 475.01 and 475.25(1)(h)); CAN-SPAM transfer ban; data-broker laws |
| Every send, block, reply, suppression and export is logged with its source, and each touch stores the SHA-256 of the body that went out | `touches.csv`, `replies.csv`, `suppression.csv`, `exports.csv` | Due-care defense under Cal. B&P 17529.5 |

## Still needs counsel

The engine is built to make these decisions explicit. It cannot make them.

1. **The licensing allow-list and Florida 475.** Soliciting business sellers
   for compensation is licensed brokerage in Florida ("directs or assists in
   the procuring of prospects", Fla. Stat. 475.01), California (B&P
   10131(a)) and, by secondary lists that conflict and come from no regulator,
   about 15 other states (research/compliance.md lists AK, AZ, CO, GA, ID,
   MN, NE, NV, OR, SD, UT, WA, WI and WY). That reaches AMB's own outreach,
   as well as lead sales. Counsel confirms which states AMB may solicit in and
   under whose license, and signs `licensing_signoff`. Illinois needs
   business-broker registration (815 ILCS 307).
2. **Lead sales and data-broker laws.** A flat per-lead fee is not a safe
   harbor where the solicitation itself is licensed. Selling leads can make
   AMB a data broker under the California Delete Act (with DROP deletion
   processing from 2026-08-01), Texas Bus. & Com. Code ch. 509, Vermont and
   Oregon, and once lead sales reach 50% of revenue the CCPA applies whatever
   AMB's size. Partners who email exported leads can make AMB an "initiator"
   (7702(9)). `lead_sales` stays off until counsel records a review.
3. **Disclaimer text.** The readiness-check disclaimer in
   [EXIT_READINESS_CHECK.md](EXIT_READINESS_CHECK.md) is a draft from the
   research.
4. **SBA statements.** Step 2 says an SBA lender asks whether the business
   runs without the owner, and the check describes SBA 7(a) financing
   limits (SOP 50 10 8). Counsel or an SBA lender should confirm the wording.
5. **AI disclosure wording.** The reply disclosure and the "are you a bot?"
   answer should be checked against Maine 10 M.R.S. 1500-DD, Utah's AI Policy
   Act and the California BOT Act.
6. **Smaller items:** whether a 30-day cache of Places ratings and websites,
   and scores derived from them, are allowed under the Maps terms; the
   advertisement-notice wording; Washington CEMA exposure after the 2026
   amendment; and whether running this outreach through Claude and the Gmail
   connector fits Anthropic's Usage Policy and the Workspace AUP.

## What the engine never does

- **No SMS, calls, voice or ringless voicemail.** Email only.
- **No voter files** (most states ban commercial use) and **no data-broker
  age or birth-date appends**.
- **No Google Maps scraping**, no third-party Maps scrapers, and no storage of
  Maps content beyond `place_id`.
- **No pattern-guessed addresses** and no harvesting from sites that ask not
  to be harvested.
- **No invented facts.** Emails, replies and handoffs state only what a state
  record shows or the owner wrote, marked as such.
- **No mention of the owner's age, health, family, death, divorce or
  succession** in any email, reply or export, even when the owner raised it.
- **No personas.** Every sender is a real AMB person, and an AI-drafted reply
  says it was drafted with an AI assistant.
- **No sending to anyone suppressed, ever**, and no removal from the
  suppression list.
