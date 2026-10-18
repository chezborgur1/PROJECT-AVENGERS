# Review round 1: unverified findings

Three of six review lenses (compliance gate, sending logic, replies, data and scoring) finished before the session usage limit. None of these findings has been independently verified yet. Copy/legal and readiness/report/CLI lenses did not run.

## sending-logic

### 1. [major] Follow-up planner never checks for an existing touch at the step it plans, so a rerun after a partial write sends the same follow-up twice

`src/sending/planner.ts:159`

**Scenario:** gmail_api, mode send. On the step-2 day runSend delivers step 2 (Gmail accepts it, touch T-000002 becomes 'sent' at run.ts:206), then stores.prospects.upsert at run.ts:218 throws. Two ways this happens: prospects.csv is open in Excel on Windows so the tmp-and-rename write fails with EPERM, or the process is killed. Another way in: the Gmail fetch throws after Gmail already accepted the message (timeout or socket reset), so the row is marked failed while the email went out. The prospect is left at sequence_step 1 with next_touch_date <= today. On the rerun, planDay picks prev = the step-1 touch (drafted/sent) and plans step 2 again. Nothing looks for the existing occupying step-2 touch, so a second step-2 email goes out. I reproduced this with a probe: MemoryTransport received steps [1, 2, 2]. Step 1 has the matching guard (`some(occupies)` at planner.ts:186), but follow-ups do not.

**Proposed fix:** In the follow-up loop, skip (and report) when the prospect already has an occupying outreach touch with t.step === step, e.g. `if ((touchesBy.get(p.prospect_id) ?? []).some((t) => t.step === step && occupies(t))) { skip('step N already has touch ...'); continue; }`. In runSend, write the prospect advance in the same guarded block as the touch update. Or have the planner rebuild the prospect state from the latest drafted/sent touch, so a failed prospects write cannot leave the prospect behind its touches.

### 2. [major] recordDelivery lets a failed touch move to drafted/sent but never restores the prospect's sequence state: the prospect is stuck, or gets a duplicate step 1

`src/sending/run.ts:282`

**Scenario:** The docs say 'failed may be retried'. Case A (gmail_api): the transport throws, runSend marks T-000001 failed and does not advance the prospect (status stays 'scored'). The operator sees the mail did go out and runs `record T-000001 sent --message-id m1 --thread-id th1`. recordDelivery only updates the touch and thread_id (line 312). The prospect stays status 'scored', with sequence_step undefined, mailbox '' and next_touch_date ''. I probed this: on 11-17, 11-24 and 12-01 the planner skips it with 'already has an outreach touch', so it never gets steps 2 or 3. Case B (outbox): the routine records T-000001 failed, which resets the prospect to scored (lines 305-309). The next send day plans a new step-1 touch T-000020. If T-000001 is then retried and recorded drafted, which the ORDER check allows, the owner gets two step-1 emails.

**Proposed fix:** When an outreach touch moves from failed to drafted/sent, advance the prospect the way runSend does: status in_sequence, sequence_step = touch.step, mailbox = touch.mailbox, last_touch_at, next_touch_date = addBusinessDays(touchDay, gapAfter(step)), thread_id. Refuse the transition if another occupying touch for the same prospect and step was created since. The simpler alternative is to refuse failed -> drafted/sent and require a new touch.

### 3. [major] List-Unsubscribe mailto goes to sending.unsubscribe_mailbox, which sync never reads, so header opt-outs never stop the sequence

`src/compliance/footer.ts:65`

**Scenario:** Config sets sending.unsubscribe_mailbox = 'optout@ambadvisory-mail.example', which config documents as 'Mailbox that receives unsubscribe mailto requests' and which is not one of config.mailboxes. Every message carries `List-Unsubscribe: <mailto:optout@...?subject=unsubscribe%20T-000001>`. A recipient clicks Gmail's Unsubscribe button and Gmail emails optout@. cmdSync (cli.ts:437) only fetches config.mailboxes, and GmailApiTransport tokens are per sending mailbox, so the request never reaches replies.csv, suppression or prospect dnc. stoppedBy/stopsSequence and the status filter never see it, and step 2 goes out 4 business days later, and step 3 after that, to someone who opted out through the header. That breaks the 'opt-outs are permanent' principle and the CAN-SPAM opt-out duty.

**Proposed fix:** Include sending.unsubscribe_mailbox in the sync and inbox loop (with its own token) and match requests by the 'unsubscribe <touchId>' subject to the touch and prospect. Otherwise refuse, in config validation or preflight, an unsubscribe_mailbox that is not a configured, synced mailbox.

### 4. [minor] A prospect blocked by the gate (or failing render) is re-planned every send day and takes a cap slot each time, starving new sends

`src/sending/planner.ts:186`

**Scenario:** A tier-A prospect has DBA 'ACME Plumbing'. displayCase leaves mixed-case names as written, so the subject is 'Exit-readiness check for ACME Plumbing', and lintSubject blocks it ('all-caps word "ACME"'). The planner does not run the lint, so it plans the prospect (best score first) and take()s a mailbox and domain slot. runSend then blocks it and appends a 'cancelled' touch, which occupies() ignores. The prospect stays 'scored' and repeats this on every send day for good. I probed it with the domain cap at 1: on 11-10, 11-12 and 11-17 the blocked P-00001 used the only slot, and the clean P-00002 was skipped each day with 'no sending capacity left today'. With the week-1 ramp of 5 a day, a few such prospects silently use up all new-send capacity. The same happens for render failures (run.ts:112) and for exclude_domains or recipient-mismatch blocks.

**Proposed fix:** After a ComplianceError or render failure, move the prospect out of the candidate pool (e.g. status 'hold' with the block reason), or have the planner skip prospects whose latest outreach touch is a cancelled 'blocked:' row until the prospect or template changes. Better still, run renderStep plus lintSubject/lintBody in the planner before take().

### 5. [minor] The recipient-local send window (window_start/window_end, metros[].time_zone) is never enforced, and 'today' comes from the machine's time zone

`src/sending/run.ts:72`

**Scenario:** Config documents sending.window_start '08:00' and window_end '11:00' as the 'Recipient-local send window', and metros[].time_zone as the 'IANA time zone for the send window'. No code reads them (grep finds no use outside config.ts), and runSend sends whenever it is invoked. In send mode with gmail_api, a manual `npm run engine -- send` at 22:00 sends cold mail at 22:00. In a UTC cloud container, cli.ts:835 takes 'today' from the machine zone, so a run at 21:00 EDT Monday counts as Tuesday: it passes the send_days [2,3,4] check and sends Tuesday's batch Monday evening Eastern. Run on Tue 2026-11-10 after 19:00 EST and it also counts as Wed 11-11 (Veterans Day), so it skips a day that was a send day.

**Proposed fix:** Take 'today' from config (a metro or default time zone) rather than the machine's zone. In runSend with mode send, refuse or defer when localTime(now, metro.time_zone) is outside [window_start, window_end), per recipient metro.

### 6. [minor] notSendDayReason only checks the date's own year, so New Year's Day observed on Dec 31 of the year before is treated as a send day

`src/sending/planner.ts:68`

**Scenario:** Jan 1 2028 is a Saturday, so usFederalHolidays(2028) puts the observed holiday on Fri 2027-12-31. notSendDayReason('2027-12-31') only checks usFederalHolidays(2027), which does not include it. With Friday (5) in sending.send_days, the planner sends cold email on the federal holiday. addBusinessDays (fed by noSendDates, which spans years -1..+1) does skip that date, so the two calendars disagree.

**Proposed fix:** Check noSendDates(config, date).includes(date), or usFederalHolidays(year + 1) as well, in notSendDayReason.

### 7. [minor] A Subject with non-ASCII text produces an 81-character encoded-word line, over RFC 2047's 76-character limit and the module's own 78-character fold

`src/sending/mime.ts:123`

**Scenario:** Subject 'Exit-readiness check for Café Peña Plumbing Services' (non-ASCII from a filing or DBA name). encodeHeaderText packs 45 bytes per word, which is 72 characters, and 'Subject: ' adds 9. buildMime outputs `Subject: =?UTF-8?B?RXhpdC1yZWFk...?=`, which is 81 characters (I confirmed this with a probe). RFC 2047 section 2 limits a line containing encoded-words to 76 characters. Strict receivers and spam filters may score or mangle it, and the file header comment claims headers are folded at 78.

**Proposed fix:** Make the first encoded word fit after the header name (e.g. allow at most (76 - name.length - 2 - 12) * 3/4 bytes for the first chunk, and 45 for continuation lines that begin with a single space). Or lower the chunk to 39 bytes (52 base64 characters, 64 with the wrapper) so every line stays under 76.

## compliance-gate

### 8. [major] Unsubscribe requests sent through the engine's own List-Unsubscribe mailto are not recognised: the subject is never checked for opt-out words

`src/replies/classify.ts:128`

**Scenario:** footer.ts:66 sets List-Unsubscribe to <mailto:mailbox?subject=unsubscribe%20T-000123>. When the owner clicks the Unsubscribe button in Gmail, Outlook or Apple Mail, the client sends a message with subject "unsubscribe T-000123" and a body that is empty or reads "This message was automatically generated by Gmail.". classifyByRules only runs detectOptOut on withoutOwnText(strippedText), and process.ts:236 does the same, so the subject is never looked at. I ran it: classifyByRules returns null and classifyByKeywords returns "other" for both bodies. RUNBOOK 6.2 supports running without a Claude key, and Claude errors also fall back to keywords. In those cases the reply is filed as "other", nothing is suppressed, the prospect goes to "replied", and a lead is opened with next action "Read the reply and answer by hand". When the click comes from a different address than the prospect's (an info@ inbox forwarded to the owner's Gmail), the message arrives in a new thread and is unmatched. Only rules run on unmatched mail, so the prospect's own address is never suppressed even when Claude is available. The touch id in the subject, which identifies the prospect, is ignored.

**Proposed fix:** In classifyByRules and in the override at process.ts:236, also run detectOptOut on msg.subject (after removing a leading Re:/Fwd:). In processInbox, when the subject matches /unsubscribe\s+(T-\d{6})/, look up that touch and use its prospect_id when the thread and sender do not match.

### 9. [major] The outbox-mode reply routine never fetches mail that arrives between Friday 17:20 and Saturday 9:20, so those opt-outs are lost

`docs/RUNBOOK.md:293`

**Scenario:** The replies task runs only on weekdays (line 280: 20 9-17 * * 1-5) and searches `in:inbox newer_than:2d`. The Monday 9:20 run only reaches back to Saturday 9:20. An owner who replies "please stop" (or a hard bounce that arrives) on Friday at 18:00 gets no newer inbox message in that thread, so search_threads never returns it. No data/inbox file is written, qualify never sees it, and nothing is suppressed. In outbox mode cmdSync does nothing (cli.ts:427-431), so the daily task cannot catch it either. Tuesday's 8:45 daily sends step 2 to someone who opted out. The repliesDone guard in cmdDaily cannot help, because it only covers files already in data/inbox. The same 8:45-before-9:20 ordering means any opt-out that arrives overnight is processed only after that morning's send.

**Proposed fix:** Search from the newest received_at in replies.csv minus a margin, as defaultSince does for gmail_api (for example `in:inbox after:<epoch>`), instead of a fixed newer_than:2d. Run the copy-mail and qualify steps at the start of the daily task before `daily`, or run the replies task every day.

### 10. [major] A processing error after classification permanently marks the message as done, so an opt-out whose suppression write failed is never retried

`src/replies/process.ts:421`

**Scenario:** row.class is set at line 238, before suppression.add runs at line 257. If suppression.add throws, the catch at 421-424 upserts the row with class "unsubscribe" plus an error. For example, CsvTable.writeRaw's renameSync over suppression.csv fails with EPERM/EBUSY while the file is open in Excel on Windows (the store is documented as spreadsheet-editable), or the disk is full. On the next run, line 183 counts the message as a duplicate because prior.class !== "", and moveProcessed moves its inbox file to processed/. The address is never added to suppression.csv and the prospect is never marked dnc. Only that day's send is skipped. After that, exportLeads (which checks only dnc status and suppression) can sell the opted-out address, and any other prospect row with the same email gets new step-1 mail.

**Proposed fix:** In the catch block, retry when an opt-out, complaint or hard bounce is not yet recorded: either reset row.class to "" so the message is processed again, or treat a prior row with a non-empty error and a suppression class as not done at line 183. Simplest is to do the suppression write before setting row.class.

### 11. [major] Bottom-posted or inline replies are stripped to empty text, so an opt-out written below the quote is never detected by rules or Claude

`src/replies/parse.ts:41`

**Scenario:** The owner replies below the quote, or inline: "On Tue, Oct 20, 2026 at 9:00 AM Frank Example <frank@...> wrote:\n> Hello Bob ...\n> Reply 'unsubscribe' ...\n\nPlease take me off your list." stripQuoted stops at the attribution line (CUT_LINES /^on .{3,200}\bwrote:$/) and drops everything after it. I ran it and it returns "". classifyByRules returns null and classifyByKeywords returns "other". classifyWithClaude is also only given the stripped text, so no classifier sees "take me off your list". The opt-out is filed as "other" and nothing is suppressed.

**Proposed fix:** When stripQuoted leaves nothing (or very little), fall back to the full text with '>' lines and the engine's own footer removed, and run detectOptOut and detectComplaint on that fallback in classifyByRules and at process.ts:236. Erring toward suppression is the documented rule.

### 12. [major] sending.unsubscribe_mailbox can point at an address the engine never reads, so mailto unsubscribe requests sent there are never processed

`src/compliance/footer.ts:65`

**Scenario:** config.ts:119 accepts any string for sending.unsubscribe_mailbox, and nothing checks it is a configured mailbox. Set it to unsubscribe@ambadvisoryservices.com. Every List-Unsubscribe mailto then goes there. cmdSync (cli.ts:437) fetches only config.mailboxes, and the RUNBOOK replies task reads only the sending mailbox. Those requests never reach data/inbox or processInbox, nobody is suppressed, and follow-ups keep going to everyone who clicked Unsubscribe.

**Proposed fix:** Make preflight and the send blockers fail when unsubscribe_mailbox is set and is not one of config.mailboxes. Alternatively, have sync and the replies routine also ingest unsubscribe_mailbox.

### 13. [major] Messages already handed to a transport (outbox items, Gmail drafts) are never cancelled when the recipient opts out later, and record accepts 'sent' for a suppressed prospect

`src/sending/run.ts:275`

**Scenario:** The gate runs when the outbox JSON or Gmail draft is created, not when the email actually leaves. Example: the 8:45 daily drafts step 2 (T-000050) to bob@acme.com. Draft mode is the default, and in a multi-account outbox setup the item for mailbox B waits for B's task. At 9:20 qualify processes Bob's "please stop" reply to step 1: suppression row added, prospect dnc (process.ts:308-317). Nothing touches T-000050. It stays planned or drafted, the outbox README item stays unchecked, and the Gmail draft stays in Drafts. Later a routine works the item, or the principal sends the waiting drafts. recordDelivery (run.ts:275) then moves the touch to sent without checking suppression. A reply draft queued for an earlier "yes" in the same thread is affected the same way (replies routine step 6 works every unchecked reply item).

**Proposed fix:** When processInbox (or cmdSuppress) suppresses a prospect, mark that prospect's planned and drafted touches cancelled. Delete the Gmail draft through the API in gmail_api mode, or list it for a person to delete. Make recordDelivery refuse drafted/sent for a cancelled touch or a suppressed or dnc prospect. Have the outbox README tell the routine to run a re-check command (for example `record --check`) before each create_draft or send_message.

### 14. [minor] In outbox mode the gate checks a From name that the transport throws away; the From header that goes out is whatever the Gmail account's display name is

`src/sending/transports.ts:61`

**Scenario:** lintMessage (lint.ts:195-202) blocks a message unless msg.fromName names the configured sender and the firm ("Frank Example, AMB Advisory Services"). connectorCall builds args from to, subject and body only, because the connector has no From or alias field. So the email that goes out carries the Google account's own display name, for example "frank" or "AMB Sales", which the gate never checked. Preflight's 'sender names' check (preflight.ts:111) only reads config. The rule that the From name must be a real sender plus the firm is not enforced for the default transport.

**Proposed fix:** Add a preflight or outbox README step that confirms the connected account's display name (for example from a sent message's From header via get_thread) matches `${sender_name}, ${firm.name}`. Add the expected From display to each outbox item and tell the routine to stop when they differ.

### 15. [minor] The gate's targeting.exclude_domains check matches the exact domain only and misses subdomains, unlike scoring

`src/compliance/gate.ts:50`

**Scenario:** score.ts:194 excludes subdomains (domainMatches), but the gate compares `d === domain` exactly. A business becomes a client after its owner (owner@office.client.com) entered the sequence, so client.com is added to exclude_domains. Follow-ups for in_sequence prospects are not re-scored, so the gate is the only check at send time. It passes owner@office.client.com, and steps 2 and 3 plus reply drafts go to the excluded client.

**Proposed fix:** Use the same parent-domain walk as domainListed/excludedDomain in the gate: block when the recipient domain or any parent domain equals an entry, and match entries containing '@' as exact addresses.

### 16. [minor] Domain suppression rows are indexed raw, so a hand-entered row with upper case, a leading '@' or a trailing dot suppresses nothing

`src/compliance/suppression.ts:64`

**Scenario:** Email rows are indexed by canonicalEmail(r.value), but domain rows go in with byDomain.set(r.value, r) unchanged, while lookup (line 96) searches lower-case labels. A person adds a client list to suppression.csv in a spreadsheet, for example `Acme.com,domain,client` or `@acme.com,domain,client`. SuppressionRowSchema accepts it (value only needs min(1)), so the fail-closed invalid-row path never triggers. check('bob@acme.com') returns undefined and the gate lets the email through.

**Proposed fix:** In index(), normalize domain rows the way normalizeValue does (trim, lower case, strip a leading '@' and a trailing '.'). Alternatively, make SuppressionRowSchema reject a domain value that is not normalized, so the file fails closed.

## replies-qualify

### 17. [major] stripQuoted drops everything below the attribution line, so bottom-posted or inline opt-outs and answers are lost

`seller-lead-engine/src/replies/parse.ts:61`

**Scenario:** The owner bottom-posts or answers inline, which is common for numbered intake questions: "On Mon, Oct 12, 2026 at 9:00 AM Casey <casey@amb.example> wrote:\n> Hi Bob...\n\nPlease remove me from your list." stripQuoted breaks at the first CUT_LINES match (line 42, the "On ... wrote:" pattern) and returns "" (I reproduced this with tsx). classifyByRules sees empty text and returns null. The second opt-out check in process.ts:236 also runs on the empty `stripped`, so detectOptOut never fires. Nothing is suppressed, the class becomes "other" (or whatever Claude makes of an empty <reply>), and the replies.csv snippet is blank. The same thing happens to inline answers ("> 1. Roughly what was revenue...?\nAbout $1.5M"): they produce no facts and the questions are marked as asked. This is a CAN-SPAM opt-out miss and silent loss of intake answers.

**Proposed fix:** Do not break at an attribution or Original-Message line. Mark it and keep scanning, keeping non-'>' lines that follow it while skipping '>' lines, and stop only at a header block or forwarded-message marker that has no non-quoted text after it. At minimum, run detectOptOut on withoutOwnText(text with only '>' lines removed) as well as on the top-posted part, and treat any hit as an opt-out.

### 18. [major] Benign words 'spam folder' and 'lawyer' classify an interested owner as a complaint: permanent suppression and mailbox pause

`seller-lead-engine/src/compliance/optout.ts:56`

**Scenario:** "Found this in my spam folder. Yes, I'm interested, send the questions." or "Yes interested. I will have my lawyer look over anything first." Both reproduce as class "complaint" from classifyByRules (classify.ts:131), which runs before Claude, so Claude can never correct it. In process.ts:245-277, suppressionReason returns "complaint". The from address, prospect email and prospect id are added to suppression.csv, which can never be removed. The prospect becomes dnc, any lead becomes lost, and a mailbox_log row with complaints=1 and paused=Y (when pause_on_complaint) pauses the sending mailbox. A warm seller is lost for good and sending halts. 'Is this spam? Who are you?' gets the same treatment.

**Proposed fix:** Make the complaint patterns contextual. Do not match 'spam' in 'spam folder', 'spam filter', 'went to spam' or 'in my spam', and require 'lawyer' to appear with a threat (e.g. /\b(my|our) lawyer(s)? will\b|\bcontact(ing)? (my|a) lawyer\b/ near 'you'). Or, when Claude is available, let only unambiguous phrases decide by rule ('reported as spam', 'cease and desist', 'stop spamming') and pass the rest to Claude's complaint flag.

### 19. [major] A reply that asks 'is this a bot?' short-circuits to the rules result, discarding every fact and the owner's acceptance

`seller-lead-engine/src/replies/classify.ts:132`

**Scenario:** "Is this a real person? If so, yes, we are thinking of selling within six months because I want to retire. Revenue is about $1.5M." asksIfAi matches, and classifyByRules returns asks_if_ai with facts {} (I reproduced this). classifyReply (line 318) returns it without calling Claude. process.ts merges no facts: revenue, timeline and motivation are not recorded and wants_readiness_check is not set. The fixed asks_if_ai draft asks no intake questions. The reply is never reprocessed because replies.csv now has a class. A seller who stated a 0-6m timeline, retirement and in-range revenue stays 'engaged' at a low score and never reaches warm or handoff.

**Proposed fix:** Keep asks_if_ai as the deciding class for the drafted answer, but still extract facts. When Claude is available, call classifyWithClaude for facts and the question and override only the class to asks_if_ai. Without Claude, fall back to classifyByKeywords facts. Then merge cls.facts as usual.

### 20. [major] The wire schema cannot hold the band answers the intake questions ask for (SDE, recurring %, largest customer %), so answers are dropped or invented

`seller-lead-engine/src/replies/classify.ts:197`

**Scenario:** questions.ts:41 asks for owner earnings in bands ('under $100K, $100K to $250K, ...'), and DESIGN.md defines the SDE question as a band. The wire field `sde` accepts only a single number ('only when stated as one figure; null otherwise'), and there is no sde_band field. The SYSTEM prompt says never to convert a band into a figure. When the owner answers '2. $250K to $500K', Claude must return null, so lead.sde stays undefined. The key 'sde' is already in questions_asked, so nextQuestions never asks it again. The readiness check (readiness/check.ts:93, 271-283) reports 'Unknown: SDE not stated yet.' and cannot give an SDE-based value range, and qualScore loses its 10 SDE points. recurring_revenue_pct and top_customer_pct are also asked as bands ('10% to 30%') but are single numbers on the wire: the answer is either lost or Claude picks a point value, which is an invented fact. The timeline question offers 'within 12 months', which matches no single TIMELINES value (0-6m or 6-12m). The prompt says 'when unclear, null', so that answer can be lost too, and without a timeline the lead can never become qualified.

**Proposed fix:** Add band fields (sde_band, and band strings for recurring and top-customer share) to ReplyWireSchema and LeadRow, and parse them with parseMoneyRange or a percent-range parser as revenue_band is. Or reword the questions so every option maps to exactly one stored value (e.g. timeline options 'within 6 months, 6 to 12 months, 12 to 24 months, further out'). Count a question as asked only when its answer was captured, or re-ask it when the answer did not parse.

### 21. [major] A mailbox-full DSN (552 5.2.2 / Status 5.2.2) is classified as a hard bounce and the live address is suppressed permanently

`seller-lead-engine/src/replies/parse.ts:184`

**Scenario:** Gmail failure DSN: subject 'Delivery Status Notification (Failure)', body '552-5.2.2 The email account that you tried to reach is over quota.' (or an RFC 3464 'Status: 5.2.2'). detectBounce returns { type: 'hard', code: '5.2.2' } (reproduced): step 2 (line 176) or step 3 (line 184) returns hard before SOFT_WORDS ('over quota', 'mailbox full') is checked against the body. The file header (lines 21-22) says a full mailbox is soft. process.ts suppressionReason returns 'bounce', and the owner's working address and prospect id go on the permanent list, which can never be removed.

**Proposed fix:** Before returning hard for a 5.x.x status or prose code, treat X.2.2 (mailbox full), and any body that matches the quota or storage words in SOFT_WORDS, as soft. For example: `if (/^[45]\.2\.2$/.test(code) || /mailbox (is )?full|over (its |the )?quota|quota exceeded|insufficient (system )?storage/i.test(text)) return result("soft", code)`.

### 22. [minor] Keyword fallback reads 'not sure' and similar as interested and records an invented 'asked for the check'

`seller-lead-engine/src/replies/classify.ts:165`

**Scenario:** With no Claude key, or after a failed Claude call (line 323), a reply such as 'Not sure what this is about.' or 'I'm not sure I'm interested in selling.' matches the interested regex (`sure`, `interested`); both reproduce as interested. Line 177 sets facts.wants_readiness_check = 'Y', and mergeFacts can overwrite an earlier stated 'N'. qualScore adds 'Asked for the exit-readiness check (+8)', which flows into the advisor handoff as an owner statement. The draft answers with 'I would be glad to prepare the free exit-readiness check' and intake questions.

**Proposed fix:** Exclude negated forms: drop bare `sure` and `ok` or require them at the start of the reply (/^\s*(sure|ok(ay)?)\b/), add a negative lookbehind for 'not '/'no ' before `sure|interested|happy to|curious`, and set wants_readiness_check only on explicit acceptance (yes, send the questions, please do).

### 23. [minor] An interested draft promising the check is made even when the same reply makes the lead lost (size outside range)

`seller-lead-engine/src/replies/process.ts:343`

**Scenario:** Owner replies 'Sure, we do about $300K a year.' Claude returns interested with revenue 300000, below config.qualify.min_revenue. draftResponse (line 343) runs before nextStage (line 409) and writes 'I would be glad to prepare the free exit-readiness check... To put it together I need a few rough figures' with three more intake questions. nextStage then returns 'lost' (score.ts:197), and next_action becomes 'None: conversation closed'. A Gmail draft now promises a check nobody will prepare, and the lead's next action tells the reviewer there is nothing to do.

**Proposed fix:** Compute qualScore and nextStage on the merged lead before drafting. When the stage is lost for size, skip the interested draft (or use a polite 'not a fit' template) and set next_action to review the reply.

### 24. [minor] not_interested moves leads out of advisor stages (meeting, handed_off, listed), contrary to the stated rule

`seller-lead-engine/src/qualify/score.ts:188`

**Scenario:** A lead in stage 'meeting' replies 'No thanks on the questionnaire, see you Tuesday.' The keyword fallback matches 'no thanks' and returns not_interested, or Claude reads a declined check as a decline. nextStage returns 'lost' at line 188, before the ADVISOR_STAGES guard at line 191. Line 178 says the reply loop never moves a lead out of those stages except to lost on an opt-out. The scheduled meeting drops out of the advisor pipeline, and the draft says 'I am sorry to have taken your time. I will not send any more emails in this series.'

**Proposed fix:** Move the ADVISOR_STAGES check above the not_interested branch, so only unsubscribe, complaint and wrong_person can end an advisor-stage lead, and route advisor-stage not_interested replies to a person (next_action 'Read the reply').

### 25. [minor] The 'how did you get my email' answer claims the business's website as a source when it may not be one

`seller-lead-engine/src/replies/respond.ts:107`

**Scenario:** A prospect whose address came from an open-POI dataset or a contacts CSV has email_source 'import' (csvImport.ts:64, 434), and prospect.website is often blank. The owner asks 'Where did you get my email?' and the fixed answer is 'I found X through the business's public licence and state filing records and the business's website.' with no sentence about the address, because 'import' matches neither the vendor branch nor the website branch. The draft, presented as fixed true text, names a website source that may not exist and hides the real source of the address. 'manual' and 'reply' sources have the same gap.

**Proposed fix:** Build the sentence from the data: mention the website only when prospect.website is set, and add an address sentence for 'import' (e.g. 'Your email address came from a public business listing dataset.') and for 'manual'.

## data-scoring

### 26. [major] isPersonName accepts trade names without a legal suffix, so a business licensee becomes the 'owner' and is greeted by a fake first name

`src/sources/normalize.ts:162`

**Scenario:** ENTITY_WORDS has no trade words (PLUMBING, AIR, CONDITIONING, ROOFING, DENTAL, ELECTRIC, HEATING, CONSTRUCTION...). isPersonName('SUNCOAST AIR CONDITIONING'), ('GULF COAST PLUMBING') and ('ACE ROOFING') all return true. In dbpr.ts:144 a DBPR row with Licensee Name 'SUNCOAST AIR CONDITIONING' and no DBA, employer or self-proprietor is stored as person_name='SUNCOAST AIR CONDITIONING', person_role='licensee', business_name=''. buildProspects then runs pickOwner (merge.ts:207-213; licensee is in OWNER_ROLES and isPersonName passes), which gives owner_name 'Suncoast Air Conditioning', owner_first_name 'Suncoast', owner_last_name 'Conditioning'. I reproduced this with importDbpr plus buildProspects. The template uses owner_first_name, so the email opens 'Hi Suncoast,'. The same test also decides Sunbiz officers with a blank P/C flag (sunbiz.ts:170, merge.ts:195) and the successor parsing in score.ts:272.

**Proposed fix:** Add trade and industry words to ENTITY_WORDS (PLUMBING, PLUMBER, AIR, CONDITIONING, HEATING, COOLING, HVAC, MECHANICAL, ELECTRIC, ELECTRICAL, ROOFING, POOL, POOLS, PEST, CONTROL, DENTAL, DENTISTRY, ORTHODONTICS, CONSTRUCTION, CONTRACTING, CONTRACTOR, CONTRACTORS, SERVICE, REPAIR, COAST, etc.), or also reject any name that assignVertical keywords match. In dbprRecordToLicense, treat a licensee without a comma as a business unless the board is one that licenses individuals.

### 27. [major] One malformed quoted field aborts the whole CSV or DBPR import instead of being reported as an invalid line

`src/sources/csvImport.ts:277`

**Scenario:** A licensee file has a row whose name starts with a quote and continues past it, for example `"06","0601",""A" PLUS AIR",...` or an unescaped nickname `"SMITH, JOHN "JACK""`. csv-parse (relax_quotes does not cover this case) throws CSV_INVALID_CLOSING_QUOTE inside flush(). forEachCsvRecord does not catch it, so importDbpr and importCsv throw before upsert and import zero rows from a file of thousands. I reproduced this: a two-record DBPR file with one such row threw 'Invalid Closing Quote: found non trimable byte after quote at line 3', and the valid row was not imported. This breaks the rule that one bad row is reported and never blocks the rest.

**Proposed fix:** Parse each flushed batch with skip_records_with_error: true and an on_skip handler (or catch per batch and re-parse line by line), and send the skipped record's line number to the caller's invalid list instead of throwing.

### 28. [major] Tenure (and config) knock-outs never expire: an excluded prospect is not rescored as it ages past min_tenure_years

`src/score/score.ts:496`

**Scenario:** In 2026 a business licensed 2012-03-01 is scored as excluded with 'tenure 14 years, under the 15-year minimum'. scoreAll skips excluded rows (RESCORE_STATUSES is new/scored/hold). buildProspects (merge.ts:411-420) moves an excluded row back to new only when one of its record facts changes, and re-importing the same state record changes none. On 2027-03-01 the business passes the 15-year minimum but stays excluded for good. A whole cohort ages into eligibility every year and is lost without notice. The same happens after a config edit that adds a vertical, a metro or a looser exclude pattern.

**Proposed fix:** In scoreAll, also rescore excluded rows whose knock-out depends on time or config (for example exclude_reason starts with 'tenure ' or 'no vertical' or 'no metro' or 'franchise'), or store a machine-readable knockout kind and re-evaluate the non-permanent kinds on every run. Never re-evaluate the suppressed kind.

### 29. [minor] A place_id that Places reports as 404 is never cleared, so every scoring run spends a budgeted details call on it for up to a year

`src/score/score.ts:518`

**Scenario:** A prospect's stored place_id is retired by Google. PlacesClient.details increments detailsCalls before the request (places.ts:224), gets a 404, deletes the cache entry and returns null. The comment says 'let the next run re-match'. But scoreAll treats null as 'no details', keeps row.place_id, and considers re-matching only after PLACE_ID_REFRESH_DAYS (365). Every later `score --places` run makes the same counted 404 call again and never re-matches, so the prospect never gets Places data. With a few dozen dead ids and frequent runs, this uses up the 900-call monthly budget that other prospects need.

**Proposed fix:** Have details() tell a 404 apart from 'over budget' (return a sentinel or throw a typed NotFound). On a 404, scoreAll should clear row.place_id and set place_id_checked_at to '' so the next run re-matches.

### 30. [minor] A verifier 'role_based' verdict on an address the local list ranks as a person is accepted before the real person addresses are tried

`src/contacts/enrich.ts:149`

**Scenario:** A contractor's site shows jobs@acme.example on the home page and john@acme.example on /about, and the owner name does not match either. isRoleBased does not list 'jobs', 'careers', 'orders', 'quotes' or 'estimates', so both get rank 1 and jobs@ is tried first. ZeroBounce returns do_not_mail/role_based. mapVerifierResult turns that into 'role_based' (verify.ts:395), which isSendableVerification accepts, so tryList stops and jobs@ becomes the prospect's address while john@ is never verified. This breaks the contract that role_based is sendable only when it is the business's only address.

**Proposed fix:** In tryList, treat a role_based verdict on a person-ranked candidate as not sendable while other person candidates remain. Move it into the role list and try it only when the persons are all DEAD, or re-rank it as 2.

### 31. [minor] Fatigue signals are scored from the first entity in sources, not from the entity the merge chose, so a dissolved predecessor drives annual-report points

`src/score/score.ts:498`

**Scenario:** entities.csv holds ABC PLUMBING INC (status inactive, last report 2009) above ABC PLUMBING LLC (active, report filed 2026-02-10), both at zip 33612. They share a matchKey, so groupBusinesses unites them. buildProspects takes the active LLC for entity_status and formation_date, but sources lists the INC first (biz.entities order). scoreAll picks `refs.map(...).find(...)`, which is the INC. annualReportSignal then adds 4 points and the reason 'No 2026 annual report on file after the May 1 deadline' for a business that filed on time. The wrong reason goes to the advisor.

**Proposed fix:** Choose the entity in scoreAll the way merge.ts:281-286 does (active first, then latest last_annual_report_date), or have buildProspects record the chosen entity's source id in its own column and use that.

### 32. [minor] One unbalanced quote makes lastRecordBoundary find no further record boundary, so the rest of a large file is buffered as one string

`src/sources/csvImport.ts:306`

**Scenario:** A CSLB, Overture or DBPR file has an unquoted field with an inch mark, such as `ACME 12" PIPE CO`. relax_quotes parses it, but lastRecordBoundary flips inQuote and every later quoted field flips it twice, so no newline after that point counts as outside quotes. `pending` then grows to the whole rest of the file and is handed to csv-parse sync in one call. A file of several hundred MB hits V8's string length limit ('Invalid string length') or exhausts memory, which defeats the bounded-memory design.

**Proposed fix:** Track quote state the way csv-parse does: a quote opens a quoted field only right after a delimiter or the start of a line, and closes one only before a delimiter or newline. Or use csv-parse's streaming API, which keeps its own state across chunks.

### 33. [minor] Email entries in exclude_domains are widened to their whole domain in enrich

`src/contacts/enrich.ts:89`

**Scenario:** exclude_domains is documented as 'Email domains or addresses'. score.ts:190 matches an entry with '@' as one exact address, but enrich strips everything up to the '@' (`.replace(/^.*@/, "")`). An entry for an existing client's personal address, bob@gmail.com, puts 'gmail.com' in `excluded`, and every gmail.com candidate for every prospect is then dropped (contacts.csv and Foursquare emails are often gmail). `excluded.has(email)` can never be true.

**Proposed fix:** Split entries into an emails set (entries containing '@') and a domains set (entries without, or with a leading '@' removed). Check email against the first and domain or parent domains against the second, as excludedDomain in score.ts does.

### 34. [minor] Places business status is written into prospects.csv through score_reasons and exclude_reason

`src/score/score.ts:437`

**Scenario:** When Places details report CLOSED_TEMPORARILY, the reason 'Listed as temporarily closed' joins score_reasons. CLOSED_PERMANENTLY writes exclude_reason 'closed permanently (Places business status)' (line 121). Both are saved to prospects.csv for good and never purged after 30 days. That stores Maps content beyond place_id, against DESIGN principle 6 and the file's own comment that score_reasons is persisted and Maps content may not be.

**Proposed fix:** Keep the knock-out and the points, but write a reason that does not restate the Places field (for example 'Excluded: external listing check'), or keep Places-derived reasons only in the 30-day cache and leave them out of the persisted columns.

### 35. [minor] Tampa Bay zip prefixes 346/347/338/342 admit Orlando-area and other out-of-metro businesses whenever county is missing

`config/engine.config.example.json:114`

**Scenario:** Sunbiz entities never carry a county, and buildProspects takes county only from licences. For entity-led prospects and for the `--metro-only` Sunbiz filter (sunbiz.ts:259), assignMetro therefore falls back to zip prefixes. Prefix 347 covers the Orlando area (Kissimmee 34741, Clermont 34711, Winter Garden 34787). 346 includes Hernando County (Spring Hill 34608, Brooksville 34601). 338 includes Highlands and Hardee (Sebring 33870, Wauchula 33873). 342 includes DeSoto (Arcadia 34266). An entity named KISSIMMEE PLUMBING INC at 34741 with no licence match becomes a tampa_bay prospect and is emailed, even though Osceola is not in the metro's county list.

**Proposed fix:** Use 5-digit zip lists, or 3-digit prefixes only where the whole prefix lies inside the listed counties (335, 336, 337), plus explicit 5-digit zips for the shared prefixes.
