# Cold email deliverability and sending infrastructure for the AMB seller lead engine (research as of 2026-10-18)

## 0. How this was researched, and what I couldn't reach

- **I couldn't open any primary page directly.** WebFetch failed with DNS errors and curl got a proxy 403 for support.google.com, developers.google.com, rfc-editor.org, learn.microsoft.com and senders.yahooinc.com. The egress proxy blocks these hosts for this session. Every fact below therefore comes from WebSearch result excerpts, which quote the pages but are cached and sometimes garbled. Treat exact wording as "per search excerpt" and check the live page before quoting it to a client or lawyer.
- **The search budget ran out partway through.** The shared limit is 200 WebSearch calls per turn across all agents in this workflow. I ran about 14 searches before it was used up. Four topics have no web source at all:
  - follow-up count and spacing
  - send-window timing
  - lookalike-domain conventions
  - RFC 8058 header details

  For those I give values from prior knowledge, marked **[UNVERIFIED, prior knowledge]**. A follow-up run with more search budget should confirm them.
- **The connector and scheduled-task facts are first-hand.** They come from the tool schemas loaded in this session (the Gmail MCP tools, create_trigger and CronCreate) plus a ListConnectors call. Gmail, Google Drive and Google Calendar show as connected for this account. I didn't call any Gmail tool, so I can't tell which mailbox the connector is signed in to.

---

## 1. Mailbox-provider sender requirements

### Google (Gmail), Feb 2024 onward, enforcement stepped up Nov 2025
Sources: [Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en), [Sender guidelines FAQ](https://support.google.com/mail/answer/14229414?hl=en), [Postmaster/requirements FAQ](https://support.google.com/a/answer/14289100?hl=en), [Subscription guidelines](https://support.google.com/mail/answer/15263077?hl=en). All were read through search excerpts; I couldn't fetch them.

**All senders (this includes us at about 40–75 a day):**
- SPF **or** DKIM on the sending domain.
- Valid forward and reverse DNS (PTR) on sending IPs.
- TLS for transmission.
- User-reported spam rate in Postmaster Tools **below 0.30%**. The FAQ's practical target is **under 0.1%**, and it says to never reach 0.3%. Spam rate is recalculated daily.
- Requirements have applied to all senders since **Feb 1, 2024**.

**Bulk senders:**
- Definition: about **5,000+ messages in 24 hours to personal Gmail accounts**, **counted across the whole primary domain**. Per the FAQ excerpt, "Senders who meet the above criteria at least once are permanently considered bulk senders."
- Requirements: SPF **and** DKIM **and** DMARC (p=none is acceptable), with the From: domain aligned to the SPF or DKIM domain.
- One-click unsubscribe (RFC 8058) on **marketing/promotional** messages. Opt-outs should be processed within **48 hours** (vendor guides say "2 days").
- Above 0.3% spam rate, a sender is **ineligible for mitigation** until the rate stays below 0.3% for **7 consecutive days**.
- **From November 2025** Gmail is "ramping up its enforcement on non-compliant traffic", with "temporary and permanent rejections."

**One-click unsubscribe for cold B2B under 5,000 a day:**
- Google's text scopes one-click to marketing/promotional mail sent by bulk senders.
- The FAQ says Gmail "doesn't automatically reject or spam-folder messages lacking one-click unsubscribe." It adds that unwanted mail without it is more likely to be reported as spam.
- Mailto and plain URL unsubscribe links "don't meet our one-click unsubscribe requirement" (that is, the bulk requirement).
- **Conclusion (inference, not a Google statement):** at our volume, RFC 8058 headers are **not mandatory** at Gmail. A visible, honored opt-out is still needed: CAN-SPAM requires one, and in practice it lowers complaints.
- Google also recommends sending subscription and non-subscription mail from different addresses.

### Yahoo
Sources: third-party summaries only; the Yahoo page was unreachable. [Bird](https://bird.com/explained/deliverability/what-are-the-gmail-and-yahoo-bulk-sender-requirements), [Egressif](https://egressif.io/resources/sender-requirements/yahoo), [Close](https://help.close.com/technical-support/email-deliverability/requirements-for-bulk-email-senders), [Sendmarc](https://sendmarc.com/dmarc/yahoo-dmarc-requirements/).
- Requirements are the same as Gmail's: SPF and DKIM, DMARC at least p=none that passes and aligns, one-click unsubscribe for marketing mail, opt-outs honored within 2 days, and a 0.3% hard spam ceiling (0.1% as the warning level).
- DKIM keys must be at least 1024-bit; 2048 is recommended.
- On the bulk threshold, Egressif quotes Yahoo as saying it "will not specify a volume threshold". Sendmarc says 5,000/day. **The sources conflict here.**
- Rules took effect Feb 2024; one-click enforcement began June 2024.

### Microsoft Outlook.com (consumer), from May 5, 2025
Sources: [Microsoft postmaster Policies](https://substrate.office.com/ip-domain-management-snds/Postmaster/Policies) (search excerpt), [Mailtrap](https://mailtrap.io/blog/outlook-new-email-sender-requirements/), [EasyDMARC](https://easydmarc.com/blog/outlook-new-email-sender-policy-update/), [Martech](https://martech.org/new-rules-for-bulk-email-senders-from-google-yahoo-what-you-need-to-know/), [Suped](https://www.suped.com/learn/email-deliverability/what-are-the-new-microsoft-email-sender-requirements-and-observed-enforcement-bounces).
- **Threshold:** domains sending **more than 5,000 a day to Outlook.com, Hotmail.com and Live.com** "must fully be compliant with SPF, DKIM, and DMARC". That means DMARC at least p=none, aligned with SPF and/or DKIM, preferably both.
- **Scope:** consumer mailboxes only. Microsoft 365 / Exchange Online business mailboxes are **not covered** (third-party quote of Microsoft).
- **Enforcement:** the postmaster page says failing mail goes to junk first, and may be rejected with `550 5.7.515` if problems continue. Martech and one vendor say a revised announcement switched to outright rejection. **This is unresolved.** Match both `550 5.7.515` and `550; 5.7.515` in bounce parsing.
- **Optional recommendations** (third-party listing): working unsubscribe, valid From/Reply-To, list hygiene, complaints under 0.3%.
- **Relevance:** dental practices and trades firms often use Microsoft 365 (often resold by GoDaddy). Those mailboxes are filtered by Exchange Online Protection, not by this consumer rule. Authentication still matters for them.

### RFC 8058 (one-click), only if we ever add it [UNVERIFIED, prior knowledge; rfc-editor.org unreachable]
- `List-Unsubscribe: <https://...>` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- The HTTPS URI must accept a POST with no cookies, no redirects and no confirmation step.
- The DKIM signature (`h=`) must cover both headers.
- **The Gmail connector can't set custom headers** (see §4). This is only possible if the engine sends through the Gmail API with raw MIME.

---

## 2. Google Workspace limits and policy

### Sending limits
Source: [Gmail sending limits in Google Workspace](https://support.google.com/a/answer/166852?hl=en) (search excerpt; the table text was garbled).
- **2,000 messages per user per day.** Mail merge: 1,500. **Trial accounts: 500.**
- Unique external recipients: about 2,000/day (500 on trial). One row reads "External recipients per day 3,000".
- 2,000 recipients per message, at most 500 of them external.
- Limits apply over a **rolling 24 hours**. Hitting one locks sending "for up to 24 hours".
- "Sending limits are not increased during your trial period."
- SMTP relay has a separate 10,000/day limit.
- These are capacity ceilings, not deliverability targets ([Growthflare](https://growthflare.io/blog/how-many-cold-emails-per-day/)).

### Gmail API quotas
Sources: [Google quota page](https://developers.google.com/workspace/gmail/api/reference/quota) (search excerpt), [Nylas](https://developer.nylas.com/docs/cookbook/email/gmail-api-quotas/), [GitHub issue](https://github.com/ronboger/mishmail/issues/16).
- 1,200,000 quota units per minute per project.
- messages.send and drafts.send cost **100 units** each.
- Third parties report that **from May 1, 2026 new projects get 6,000 units per user per minute** (it was 15,000). That works out to about 60 sends a minute. **This conflicts with other sources and is unverified.**
- API sends count against the same 2,000/day Workspace limit.
- These quotas don't constrain the engine at 20–30 sends per mailbox per day. If the engine uses the Claude Gmail connector, the quota belongs to the connector's own project.

### Acceptable use, the main platform risk
Sources: [Workspace AUP (2023-02-06 version)](https://workspace.google.com/terms/use_policy-20230206/), [current AUP URL](https://workspace.google.com/terms/use_policy/), [Gmail Program Policies](https://www.google.com/gmail/about/policy/), [Spam and abuse policy in Gmail](https://knowledge.workspace.google.com/admin/gmail/spam-and-abuse-policy-in-gmail).
- The AUP prohibits using the services "to generate or facilitate unsolicited bulk commercial email."
- Gmail Program Policies: "Don't use Gmail to distribute spam or unsolicited commercial mail", and no sending that breaks CAN-SPAM.
- Google may "immediately suspend" violators.
- Google doesn't define a volume or "personal" threshold for cold outreach. Low-volume, individually researched one-to-one email is a **gray area, not an explicit safe harbor**.

**Design response:**
- Keep volume low and messages genuinely personal (named sender, specific business facts).
- Honor opt-outs immediately.
- Use a **separate sending domain and Workspace tenant**, so a suspension never touches the broker's primary domain or mailbox.
- Keep a copy of state outside the sending mailbox (in Drive or the repo).

---

## 3. Warm-up and deliverability practice

These are vendor sources (vendor heuristics, not provider rules): [Growthflare](https://growthflare.io/blog/how-many-cold-emails-per-day/), [ScaledMail](https://www.scaledmail.com/blogs/google-workspace-cold-email), [LeadHaste](https://leadhaste.com/blog/email-warmup-best-practices), [Litemail](https://litemail.ai/blog/email-warmup-new-google-workspace-account-2026).

**Warm-up**
- Day 1–14: warm-up only, zero cold sends (Growthflare). ScaledMail says 14–21 days.
- Weekly warm-up volumes:

  | Week | Warm-up emails/day | Source |
  |---|---|---|
  | 1 | 5–10 | LeadHaste |
  | 2 | 15–20 | Litemail |
  | 3 | 20–30, plus 5–10 cold tests | LeadHaste |
  | 4 | 30–50 | Litemail, LeadHaste |

- Litemail allows 4–8 weeks for a fresh inbox.

**Cold ramp**
- Start at about 5 cold a day, then add about 5 per week (ScaledMail).
- Or start at 20–30 once Postmaster reputation reads "Good", then add about 20% a week (Litemail).

**Steady-state cold sends per inbox**
- 10–15/day (Growthflare, with the condition that bounces stay under 2%).
- 15–25/day (ScaledMail).
- Above 50/day "you start triggering volume-based spam filters" (LeadHaste).
- Warm-up sends use the same reputation budget as cold sends.

**Bounces and verification** ([Smartlead](https://www.smartlead.ai/blog/cold-email-bounce-rate), [ModernInbound](https://moderninbound.com/blog/cold-email-bounce-rate-benchmarks-2026))
- Bounce rate under 2% over a rolling 14 days is "good". Under 1% is exceptional; 2–4% is a warning; above 4% means reputation damage compounds.
- Track bounces **per mailbox**, not per fleet.
- Catch-all domains pass SMTP verification but often hard-bounce. Pilot 5–10% of the catch-all segment first.
- Re-verify active lists every 60–90 days.

**Open/click tracking** ([Salesforge](https://www.salesforge.ai/blog/cold-email-deliverability-in-2025), [QuickMail](https://quickmail.com/gmail-update-open-tracking-for-cold-email), [Prospeo](https://prospeo.io/s/does-open-tracking-hurt-cold-email))
- Turn **tracking off (opens and clicks) for cold outbound.**
- Pixels trigger Gmail's image-warning banner and can raise complaints.
- Apple Mail Privacy Protection pre-fetches images, so open counts are fake anyway.
- Measure replies, opt-outs, bounces and complaints instead.
- Avoid tracking, links and images in the first email.

**Custom tracking domain:** not needed if tracking is off. If a link is ever used, link to the real website rather than a shared tracking host [UNVERIFIED, prior knowledge].

**Plain text, links and attachments** [UNVERIFIED, prior knowledge; consistent with the "no links or images in touch 1" advice above]
- Use plain text.
- No links in email 1. At most one link (to the AMB site) in later emails.
- **No attachments in cold emails.** Send the exit-readiness checklist or valuation only after the owner replies and asks for it.

**Lookalike sending domains** [UNVERIFIED, prior knowledge; the search budget ran out before I could source this]
- Register 1–2 `.com` variants of the brand, for example `getamb...com` or `amb...advisors.com`.
- Avoid hyphens, digits and cheap TLDs.
- 301-redirect the domain (over HTTPS) to the main site, or host a one-page site.
- Never send cold email from the primary domain.

---

## 4. Claude Gmail connector: what it can and can't do (from tool schemas loaded in this session)

**It can:**
- `create_draft`: to, cc, bcc, subject, plain `body` and/or `htmlBody`, attachments up to 25 MB, `replyToMessageId` for a threaded draft, `includeSignature`. Returns the draft id, threadId and viewUrl.
- `send_message`: send a new message immediately, or send an existing draft via `draftId`. Thread a follow-up with `replyThreadId` or `replyToMessageId`.
- `reply`: replies **immediately** to a messageId, with optional replyAll.
- `search_threads`: Gmail query syntax (`from:`, `newer_than:`, `label:`, `in:sent` and so on), at most 50 per page, paginated.
- `get_thread` and `get_message`: `PLAIN_TEXT` format recommended.
- `list_drafts`, `update_draft`, `delete_draft`.
- Labels: create and apply on a thread or message. A `label:` search matches the display name, but applying a label needs its **ID**.
- Mark as spam, trash.

**It can't, or has limits:**
- **No custom headers.** No List-Unsubscribe or List-Unsubscribe-Post, so RFC 8058 isn't possible through the connector.
- **No From-alias or Reply-To parameter.** It sends only as the signed-in account.
- **No scheduled "send at" time.** A message goes out when the tool is called, so send timing equals scheduled-task fire time.
- **No RAW format and no header access** in get_thread. Auto-replies (Auto-Submitted, out-of-office) and bounce (DSN) details must be detected from sender, subject or body text, for example `from:mailer-daemon OR subject:"Delivery Status Notification"`.
- **search_threads previews show only the ~5 oldest messages of a thread, with no truncation marker.** Always call get_thread before classifying a reply.
- `update_draft` drops attachments unless they are re-sent.
- **No access to Postmaster Tools or DNS**, and no warm-up network.
- **One connector means one Google account.** ListConnectors shows a single Gmail connector. Rotating across 2–3 sending mailboxes through one connector likely isn't possible (medium confidence).
  - Option A: one sending mailbox connected to the connector, running at its full cap.
  - Option B: the TypeScript engine calls the Gmail API itself, with OAuth refresh tokens per mailbox stored as environment secrets. That also allows raw MIME with List-Unsubscribe headers. Whether this container can reach `gmail.googleapis.com` through the proxy is **unverified**: Google help and developer hosts were blocked here.
- **The account currently in use is a personal @gmail.com address.** Cold email must go from a Workspace mailbox on the separate sending domain. The connector must be signed in to **that** mailbox, not the personal one.

### Scheduled tasks (from the create_trigger and CronCreate schemas)
**create_trigger (cloud)**
- Takes a 5-field cron with `CRON_TZ=<IANA zone>`, so schedules can be set in the target metro's time zone.
- Minimum interval is normally **hourly**.
- Use `create_new_session_on_fire=true` for a clean session each run. The prompt then has to be a full standalone instruction.
- Connectors must be passed explicitly, e.g. `["Gmail","Google Drive"]`. If none are stored, the run has no Gmail access.
- Optional push/email notifications.
- **"Individual tool calls from fired sessions still go through runtime permission checks."** An unattended `send_message` can stall on a permission prompt unless it's pre-approved.
- Each fire gets a fresh container. State (sent log, suppression list, sequence step, scores) must live in Drive or be committed to the repo, not in local files.

**CronCreate (local)**
- Session-only.
- Fires only while the REPL is idle.
- Recurring jobs **auto-expire after 7 days**.
- **Not suitable for production.**

**Fit**
- Hourly fires inside a 3–4 hour morning window, each sending a small batch with seconds between calls.
- This spreads volume naturally without any need for sleep calls.

### Drafts-for-approval as the launch mode: recommended
Reasons:
1. Human review catches AI personalization mistakes, such as a wrong owner name, a business that has closed, or a sensitive situation like a death or divorce.
2. A human in the loop strengthens the "individual business correspondence, not bulk" position under the Workspace AUP.
3. It avoids the permission-prompt stall in unattended sessions.
4. Replies about revenue and motivation are sensitive. A wrong auto-reply to a warm seller is costly.

**Mechanics**
- The engine calls `create_draft`, with `replyToMessageId` for follow-ups so they thread correctly.
- It writes the draft id to the Drive state sheet.
- The broker opens Gmail Drafts and clicks Send. Or the broker marks "approved" in the sheet and a later fire calls `send_message(draftId)`.
- Graduate to auto-send for initial emails and follow-ups only after about 2 weeks with zero corrections, bounces under 2%, and no spam or anger replies.
- Keep **AI replies to prospects in draft mode permanently**, or at least until the broker opts out.

---

## 5. Sequencing norms [UNVERIFIED, prior knowledge; search budget used up]
- **Sequence:** 1 initial email plus 2–3 follow-ups in the same thread.
- **Spacing:** +3, +5 and +7 business days (total about 3 weeks).
- **Stop on reply:** any human reply, opt-out wording ("stop", "remove", "not interested", "unsubscribe"), a bounce, or a spam complaint. Also suppress the whole company domain once any contact there replies.
- **Pause on auto-reply:** an out-of-office reply pauses the sequence until the return date, or for 7 days. It doesn't stop it.
- **Send windows:** Tue–Thu are the strongest days; Mon and Fri are acceptable.
  - Default 7:30–10:30 local time in the recipient's metro.
  - Trades owners (HVAC, landscaping) start early, so 6:30–8:30 can work.
  - Dental practices: before first patient (about 7–8am) or at lunch.
  - No weekends.
  - Skip US federal holidays and the week of Thanksgiving (**Nov 26, 2026**) and late December. Expect slower responses through Dec 21–Jan 2.

---

## 6. Recommended engine parameters

**Timeline (today 2026-10-18)**
- Buy domains and mailboxes and set up DNS this week.
- Warm-up runs Oct 20 to about Nov 9.
- First hand-approved cold sends: week of Nov 9.
- That fits the plan's "2–3 weeks warm-up, first qualified sellers in 3–6 weeks" claim, but the Thanksgiving and December slowdown is a risk.

### Per-mailbox ramp table (cold cap includes follow-ups)
| Week | Warm-up/day | Cold/day | Mode |
|---|---|---|---|
| 1 | 5–10 | 0 | warm-up only |
| 2 | 15–20 | 0 | warm-up only |
| 3 | 20 | 5 | drafts, human sends |
| 4 | 15–20 | 10 | drafts |
| 5 | 15 | 15 | drafts, or auto if gates pass |
| 6+ | 10–15 (keep running) | 20, **hard max 25–30** | auto initial and follow-ups; replies stay drafts |

**Ramp gate:** move up only if, over the rolling 14 days, bounces are under 2%, there are 0 spam or abuse complaints, and opt-outs are under 1%.

### Hard caps and circuit breakers
- `MAX_COLD_PER_MAILBOX_PER_DAY` = 25 (absolute ceiling 30). That is about 1% of Workspace's 2,000/day limit.
- Sending domain total stays far below 5,000/day, so it is never a Gmail/Yahoo/Outlook bulk sender. Gmail pools volume by domain, and reaching bulk once is permanent.
- **Auto-pause a mailbox** if:
  - its bounces are at or above 2% over a rolling 14 days, or it gets 3 or more hard bounces in a day
  - any spam complaint or "reported as spam" signal arrives
  - any `550 5.7.515` or `5.7.509` bounce arrives
  - Postmaster domain reputation drops below "Medium" (if it reports any data)
- Verify every address before sending. Drop "invalid". Hold "catch-all" and pilot only 5–10% of them.
- Re-verify after 60–90 days.

### Pacing within a day
- Run a cloud scheduled task hourly at an off-minute (e.g. `CRON_TZ=America/Chicago 7 7-10 * * 2-5` for Tue–Fri, or Mon–Fri `1-5`) with Gmail and Google Drive connectors.
- About 5–8 sends per fire per mailbox.
- Space sends 20–90 seconds apart within a fire.
- Randomize the order.

### Content rules
- Plain text only, about 60–120 words.
- No tracking pixel and no click tracking.
- 0 links in email 1, at most 1 later.
- No attachments, no images.
- Named sender with a real signature.
- Physical postal address and a plain opt-out line ("Reply 'no thanks' and I won't email again"), as CAN-SPAM requires (legal detail is out of this report's scope).
- Honor opt-outs within 24 hours, well inside Gmail's 48-hour guidance.
- Keep a permanent suppression list covering the email, its domain, and the business entity.

### Inbox loop (each fire)
1. `search_threads` for `in:inbox newer_than:2d -label:engine/processed`.
2. `get_thread` with `PLAIN_TEXT`.
3. Classify each thread as human reply, auto-reply, bounce, or opt-out.
4. Label it `engine/*`.
5. Update the Drive state.
6. For warm replies, draft a qualifying reply (revenue, timeline, motivation) with `create_draft`, for broker approval.
7. Also search `from:mailer-daemon OR from:postmaster newer_than:2d` to catch bounces.

### DNS and setup checklist (sending domain)
1. **MX:** Google Workspace MX records, as shown in the Admin console at setup.
2. **SPF:** a single TXT record `v=spf1 include:_spf.google.com ~all`, with at most 10 DNS lookups. If a verifier or warm-up tool sends as you, add only what it requires.
3. **DKIM:** generate a **2048-bit** key in Admin > Apps > Google Workspace > Gmail > Authenticate email. Publish the TXT at `google._domainkey`, then click Start authentication. Yahoo requires at least 1024-bit and recommends 2048.
4. **DMARC:** `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@<domain>; adkim=r; aspf=r`. p=none satisfies Google, Yahoo and Microsoft. Move to `p=quarantine` after 3–4 clean weeks [the move is a best-practice suggestion, unverified]. Alignment is automatic when sending as `@sendingdomain` through Workspace.
5. **PTR and TLS:** handled by Google's outbound infrastructure. Verify with a header check (look for `spf=pass dkim=pass dmarc=pass` and TLS) by sending a test to a Gmail and an Outlook.com seed address.
6. **Website:** HTTPS 301 redirect to the main AMB site, or a one-page site naming the sender. A tracking CNAME isn't needed while tracking is off.
7. **Google Postmaster Tools:** TXT verification for the sending domain. Expect little or no data at low volume [prior knowledge: Postmaster shows data only above a meaningful daily volume]. Rely on bounce, reply and opt-out metrics instead.
8. **Primary domain:** ensure the main AMB domain also has SPF, DKIM and DMARC, so lookalike spoofing can't be pinned on it.
9. **Workspace account:** end the **trial** before ramping, since trial accounts get the lower 500/day limit and limits aren't raised during the trial. Add a profile photo and signature, and send a few real emails in week 1.
10. **Optional:** MTA-STS and TLS-RPT. BIMI isn't needed.

### Capacity math for the first 500-owner list
- Each owner gets 1 email plus 3 follow-ups, so about 4 sends per owner if nobody replies.
- 1 mailbox × 25/day ≈ 6 new owners/day, so about 80 business days for 500.
- 2 mailboxes × 25 ≈ 12/day, about 40 business days.
- 3 mailboxes × 25 ≈ 18/day, about 28 business days.
- The plan's 2–3 mailboxes is the right size. Under the connector's single-account limit, Option B (direct Gmail API) or several connector accounts would be needed to reach that throughput.


## Key facts

| Fact | Confidence | Source | Design implication |
|---|---|---|---|
| Gmail requirements for all senders: SPF or DKIM, valid forward/reverse DNS (PTR), TLS, and Postmaster spam rate below 0.30%. Google's FAQ target is under 0.1%. In force since Feb 1, 2024. | high | https://support.google.com/mail/answer/81126?hl=en ; https://support.google.com/mail/answer/14229414?hl=en (via search excerpts; direct fetch blocked) | Even at low volume, the sending domain needs SPF, DKIM and DMARC, and the engine must pause on any spam-complaint signal. |
| A Gmail bulk sender is about 5,000+ messages in 24 hours to personal Gmail accounts, counted across the primary domain. Hitting it once makes the domain a bulk sender permanently. Enforcement, including temporary and permanent rejections, stepped up from November 2025. | high | https://support.google.com/mail/answer/14229414?hl=en (search excerpt) | Enforce a domain-wide daily cap far below 5,000 (about 75), summed across all mailboxes on the sending domain. |
| Google's one-click unsubscribe (RFC 8058) requirement covers marketing/promotional mail from bulk senders. Gmail does not automatically reject or spam-folder mail lacking it. Mailto and URL links don't satisfy the bulk requirement. Opt-outs should be honored within 48 hours. | medium | https://support.google.com/mail/answer/14229414?hl=en ; https://support.google.com/mail/answer/15263077?hl=en (search excerpts) | Under 5,000/day, RFC 8058 headers are not mandatory, which matters because the Gmail connector can't set headers. Still include a visible opt-out line and honor it within 24 hours. |
| Yahoo requires the same as Gmail: SPF and DKIM, DMARC at least p=none that passes and aligns, one-click unsubscribe for marketing mail, opt-outs within 2 days, and a 0.3% spam ceiling. DKIM keys must be at least 1024-bit, 2048 recommended. Yahoo reportedly doesn't publish a volume threshold. | medium | https://bird.com/explained/deliverability/what-are-the-gmail-and-yahoo-bulk-sender-requirements ; https://egressif.io/resources/sender-requirements/yahoo (Yahoo page unreachable) | Use 2048-bit DKIM and publish DMARC from day one, since Yahoo gives no safe volume floor. |
| Since May 5, 2025, Outlook.com, Hotmail and Live (consumer) require SPF, DKIM and DMARC (p=none minimum, aligned) from domains sending more than 5,000/day. Failing mail goes to junk or is rejected with 550 5.7.515; sources conflict on which. Microsoft 365 business mailboxes are not covered. | medium | https://substrate.office.com/ip-domain-management-snds/Postmaster/Policies ; https://martech.org/new-rules-for-bulk-email-senders-from-google-yahoo-what-you-need-to-know/ | Bounce parser must match '550 5.7.515' and '550; 5.7.515' (and 5.7.509) and auto-pause the mailbox when they appear. |
| Google Workspace sending limits: 2,000 messages per user per day (1,500 mail merge; 500 for trial accounts), over a rolling 24 hours, with a lockout of up to 24 hours if exceeded. Limits are not raised during the trial. | medium | https://support.google.com/a/answer/166852?hl=en (search excerpt; table garbled) | End the Workspace trial before ramping. Engine caps of 25–30 per mailbox per day stay far below the limit. |
| The Google Workspace AUP prohibits using the services 'to generate or facilitate unsolicited bulk commercial email'. Gmail Program Policies forbid spam and unsolicited commercial mail and CAN-SPAM violations. Google may suspend violators immediately. | high | https://workspace.google.com/terms/use_policy-20230206/ ; https://www.google.com/gmail/about/policy/ ; https://knowledge.workspace.google.com/admin/gmail/spam-and-abuse-policy-in-gmail | Keep outreach low-volume and individually personalized, isolate it on a separate domain and Workspace tenant, keep state outside the mailbox, and prefer human-approved drafts at launch. |
| Gmail API: messages.send and drafts.send cost 100 quota units; 1,200,000 units per minute per project. Third parties report new projects get 6,000 units per user per minute from May 1, 2026 (previously 15,000). API sends count against Workspace daily limits. | low | https://developers.google.com/workspace/gmail/api/reference/quota (search excerpt) ; https://github.com/ronboger/mishmail/issues/16 | API quotas don't constrain the engine. Only daily sending caps and reputation matter. |
| Vendor warm-up norms: 14–21 days of warm-up before any cold email. Warm-up runs 5–10/day in week 1, 15–20 in week 2, 20–30 in week 3, 30–50 in week 4. Cold starts at about 5/day and rises about 5/week. Steady state is 10–25 cold per inbox per day; above 50 triggers volume filters. Warm-up shares the same reputation budget as cold sends. | medium | https://growthflare.io/blog/how-many-cold-emails-per-day/ ; https://www.scaledmail.com/blogs/google-workspace-cold-email ; https://leadhaste.com/blog/email-warmup-best-practices ; https://litemail.ai/blog/email-warmup-google-workspace-complete-guide-2026 | Ramp table in config: weeks 1–2 at 0 cold; week 3 at 5; week 4 at 10; week 5 at 15; week 6+ at 20, hard max 25–30 per mailbox per day including follow-ups. |
| Cold-email bounce benchmark: under 2% over a rolling 14 days is good; 2–4% is a warning; above 4% means reputation damage compounds. Track per mailbox. Catch-all addresses pass verification but often bounce, so pilot 5–10% of them. Re-verify lists every 60–90 days. | medium | https://www.smartlead.ai/blog/cold-email-bounce-rate ; https://moderninbound.com/blog/cold-email-bounce-rate-benchmarks-2026 | Pause a mailbox when its bounces reach 2% over 14 days or it gets 3 or more hard bounces in a day. Verify every address before sending and quarantine catch-alls. |
| Open and click tracking hurts cold email: pixels trigger Gmail's image banner and raise complaints, and Apple MPP makes open counts meaningless. Vendors recommend tracking off and no links or images in the first email. | medium | https://www.salesforge.ai/blog/cold-email-deliverability-in-2025 ; https://quickmail.com/gmail-update-open-tracking-for-cold-email ; https://prospeo.io/s/does-open-tracking-hurt-cold-email | Plain text only, no pixel, no tracked links, 0 links in email 1, no attachments. Measure replies, opt-outs and bounces. No custom tracking domain needed. |
| Claude Gmail connector: create_draft, send_message (new message or draftId, threading via replyThreadId or replyToMessageId), reply (sends immediately), search_threads (max 50 per page; previews show only the ~5 oldest messages per thread), get_thread (PLAIN_TEXT; no RAW, no headers), labels by ID. No custom headers, no From-alias or Reply-To, no scheduled send time. One connector is installed (one account). | high | Gmail MCP tool schemas loaded in this session; ListConnectors result | The connector can't set List-Unsubscribe headers or rotate mailboxes. Bounces and auto-replies must be detected from content and subject. Always call get_thread before classifying. Multi-mailbox sending needs either the direct Gmail API (OAuth per mailbox) or several connector accounts. |
| Cloud scheduled tasks (create_trigger): 5-field cron with CRON_TZ, normally hourly minimum, fresh session per fire optional, connectors must be listed explicitly. Tool calls in fired sessions still go through runtime permission checks. Local CronCreate jobs are session-only, fire only when idle, and expire after 7 days. | high | create_trigger and CronCreate tool schemas in this session | Run the engine as hourly cloud scheduled tasks inside the recipient-time-zone send window, with Gmail and Google Drive connectors. Keep state in Drive or the repo. Pre-approve or human-gate send tools so unattended runs don't stall. Don't use CronCreate for production. |
| Launching with human-approved drafts (the engine calls create_draft and the broker sends, or approves in a sheet and a later fire calls send_message with the draftId) is the safer launch mode. | medium | Inference from the Workspace AUP, the runtime permission checks, and connector capabilities above | Default config SEND_MODE='draft' for at least the first 2 weeks of cold sends. Graduate initial emails and follow-ups to auto-send once the gates pass. Keep AI qualification replies to prospects as drafts. |
| Not verified by web research (search budget used up, primary pages unreachable): RFC 8058 header details, follow-up count and spacing (recommended 1 email + 2–3 follow-ups at +3/+5/+7 business days), send windows (Tue–Thu, 7:30–10:30 recipient local time), lookalike-domain conventions, and Postmaster Tools minimum-volume behavior. | low | Prior knowledge; WebFetch DNS failures and the shared WebSearch limit of 200 per turn were hit | Treat these as configurable defaults in the engine, not hard-coded truths, and confirm them in a follow-up research pass. |
| Practical DNS checklist for the sending domain: Workspace MX; a single SPF record 'v=spf1 include:_spf.google.com ~all'; 2048-bit DKIM at google._domainkey with Start authentication; DMARC 'v=DMARC1; p=none; rua=...' (meets Google, Yahoo and Microsoft minimums); HTTPS 301 redirect to the main site; Postmaster Tools TXT verification; DMARC on the primary domain too. | medium | Requirements from the Google, Yahoo and Microsoft sources above; record syntax from prior knowledge | Include a setup or preflight script that checks these records with a DNS lookup and refuses to start sending until SPF, DKIM and DMARC all pass on a seed test. |

---

# Adversarial verification

# Verification report: deliverability research (AMB seller lead engine), 2026-10-18

**I couldn't check any web source in this run.** The shared WebSearch limit (200 per turn) was already used up before my first query, so no search ran. WebFetch failed with DNS errors on every host I tried, and curl got proxy 403s on all of them, including support.google.com, rfc-editor.org, datatracker.ietf.org, substrate.office.com, ftc.gov, ecfr.gov and every vendor blog the report cites.

Three things could be checked first-hand:
- **Google API hosts are reachable.** `gmail.googleapis.com` returned 200 for its discovery document, which reports revision 20261012. `www.googleapis.com` and `oauth2.googleapis.com` also answered through the proxy.
- **Tool schemas.** I loaded the Gmail connector, create_trigger and CronCreate schemas in this session.
- **ListConnectors.** I ran it.

Because of this, every fact that rests only on the web is marked **unsupported**, as the default rule requires. Where it matches what I know up to my June 2026 cutoff, I say so; that is not a source check. Someone with web access needs to re-check those rows before anyone quotes them to a client or lawyer.

## Fact verification

| # | Fact (short) | Verdict | Correction / note and source |
|---|---|---|---|
| 1 | Gmail all-sender rules: SPF or DKIM, PTR, TLS, spam rate under 0.3% (target under 0.1%), since Feb 1, 2024 | **unsupported** (I couldn't reach the source) | Matches what I know. The list leaves out two all-sender rules: messages must follow RFC 5322 formatting, and must not impersonate a Gmail From: address. Source pages blocked: support.google.com/mail/answer/81126 and /14229414. |
| 2 | Bulk sender = 5,000+ a day to personal Gmail, counted per primary domain, permanent once reached; enforcement stepped up Nov 2025 | **unsupported** | Matches what I know, including the November 2025 enforcement ramp-up. The design choice (one cap across the whole domain, far below 5,000) holds whatever the exact wording is. |
| 3 | One-click unsubscribe (RFC 8058) is required only for bulk marketing mail; Gmail "doesn't automatically reject or spam-folder" mail without it; mailto/URL links don't satisfy it; opt-outs within 48 h | **unsupported** | The scope and the 2-day rule match what I know. I don't recognise the quoted "doesn't automatically reject" sentence and couldn't check it, so don't quote it. The inference that RFC 8058 isn't required at our volume is reasonable but is not a Google statement. |
| 4 | Yahoo matches Gmail; DKIM at least 1024-bit; no published volume threshold | **unsupported** | Only third-party pages were cited, and they couldn't be reached. Treat Yahoo as having no safe volume floor. The design implication (2048-bit DKIM and DMARC from day one) costs nothing, so keep it. |
| 5 | Outlook.com consumer rule from May 5, 2025: SPF, DKIM and DMARC above 5,000 a day; junk folder vs `550 5.7.515` unresolved | **unsupported, with a likely correction** | My understanding is that Microsoft revised its announcement before May 5, 2025: non-compliant mail is **rejected** with `550; 5.7.515 Access denied, sending domain ... does not meet the required authentication level`, not sent to junk first. I couldn't check the Microsoft page. Keeping both string forms in the bounce parser is the right call either way. |
| 6 | Workspace limits: 2,000 per user per day; 1,500 mail merge; 500 on trial; rolling 24 h; lockout up to 24 h; no increase during trial | **unsupported** | Matches what I know in general, but the external and unique-recipient rows (2,000 vs 3,000) are unresolved. The engine's 25–30 cap makes the exact numbers irrelevant. "End the trial before ramping" is still the right action. Source blocked: support.google.com/a/answer/166852. |
| 7 | Workspace AUP bans "unsolicited bulk commercial email"; Google may suspend immediately | **unsupported** | Matches what I know. Correction: the Gmail Program Policies page cited is the consumer Gmail policy. Workspace accounts are bound by the Workspace AUP and the customer agreement, so don't cite Program Policies as the Workspace rule. The design response (separate tenant, low volume, state kept outside the mailbox) stands. |
| 8 | Gmail API: send costs 100 units; 1.2M units per minute per project; "6,000 per user per minute from May 1, 2026" | **partly confirmed, rest unsupported** | The discovery document confirms `users.messages.send` (POST `gmail/v1/users/{userId}/messages/send`, upload limit 36,700,160 bytes, `gmail.send` scope) and that `raw` is an RFC 2822 base64url string. The quota numbers aren't in the discovery document and couldn't be checked. The 6,000/min claim comes from a GitHub issue; drop it. Source: https://gmail.googleapis.com/$discovery/rest?version=v1 (fetched). |
| 9 | Vendor warm-up norms (14–21 days; 5–10 → 30–50 a day; cold 10–25 per inbox per day; above 50 triggers filters) | **unsupported** | These are vendor rules of thumb and none of the pages could be reached. Keep them as config defaults, not facts. |
| 10 | Bounce benchmarks (under 2% good, 2–4% warning, above 4% damaging); pilot 5–10% of catch-alls; re-verify every 60–90 days | **unsupported** | Vendor sources, unreachable. The 2% pause threshold is a reasonable conservative default. |
| 11 | Open/click tracking hurts cold email; Apple MPP inflates opens | **unsupported** | Vendor sources, unreachable. Apple MPP pre-fetching images is well known. Plain text with no tracking is low-risk whatever the evidence says. |
| 12 | Gmail connector capabilities | **mostly confirmed, two corrections** | Confirmed from the loaded schemas: `reply` sends immediately; `search_threads` pageSize is at most 50 and previews show only the ~5 oldest messages with no truncation marker; labels are applied by ID while `label:` search matches the display name; `update_draft` drops attachments unless they are re-sent; there are no header, From-alias, Reply-To or send-at fields; `send_message(draftId)` sends a draft as-is. **Correction 1:** "no RAW and no header access" is true only of `get_thread` (its schema says RAW isn't supported). **`get_message` lists `RAW` ("Returns the raw MIME message content") in its messageFormat enum.** Calling get_message with RAW may expose `Auto-Submitted` and DSN headers; I haven't tested it. **Correction 2:** a `create_draft` with `replyToMessageId` appends the new body to the original message body, so threaded follow-up drafts will quote earlier mail. Plan the copy for that. ListConnectors confirms one connector each for Gmail, Google Drive and Google Calendar, all connected. |
| 13 | Scheduled tasks: create_trigger and CronCreate | **confirmed, small corrections** | Confirmed in the create_trigger schema: CRON_TZ; minimum interval normally hourly ("some projects allow shorter"); `create_new_session_on_fire`; the runtime permission-check sentence. Corrections: (a) If `connectors` is omitted, the run keeps "the default behavior for this surface"; it doesn't simply get no Gmail. Pass the list explicitly anyway, and inside a remote session the list is capped at connectors that session holds. If the result warns that no connectors are stored, surface that. (b) Notifications are only accepted on fresh-session tasks. (c) "Fresh container each fire" is an inference; the schema only says "fresh session". The conclusion (keep state in Drive or the repo) stands. CronCreate confirmed: session-only, fires only when idle, 7-day expiry, local timezone with no CRON_TZ. |
| 14 | Launch in drafts-for-approval mode | **confirmed as reasoning** | This is inference, but it follows from facts 7, 12 and 13. Fine. |
| 15 | Facts the report itself marked unverified (RFC 8058, sequencing, send windows, lookalike domains, Postmaster minimum volume) | **unsupported** | Still unverified. The RFC 8058 description (HTTPS POST of `List-Unsubscribe=One-Click`, no cookies or redirects, DKIM covering both headers) matches what I know. Thanksgiving on Nov 26, 2026 is correct by calendar check. |
| 16 | DNS checklist | **unsupported (syntax from prior knowledge)** | The record syntax is standard. One addition: Workspace signs with a `*.gappssmtp.com` DKIM key until custom DKIM is turned on, and that key doesn't align with DMARC. The preflight script must confirm `d=<sendingdomain>` in a seed-message header, not just that the DNS records exist. |
| 17 | "Can this container reach `gmail.googleapis.com`?" (Option B), which the report left unverified | **corrected: reachable** | From this container, a curl to the Gmail discovery URL returned 200, `www.googleapis.com/discovery/...gmail` returned 200, and `oauth2.googleapis.com/token` answered (404 on GET, as expected). The discovery document also lists `users.settings.sendAs`, so Option B can manage aliases. I haven't checked whether scheduled-task containers get the same network policy. |

## Important facts the report missed (unverified, from prior knowledge unless noted)

1. **Postmaster Tools v1 reputation dashboards are being retired.** In 2025 Google launched Postmaster Tools v2 with a "Compliance status" page. It announced that the legacy domain and IP reputation charts would go away. The circuit breaker "domain reputation below Medium" and the Litemail ramp rule "start once reputation reads Good" may depend on a metric that no longer exists. Use the v2 compliance status if it shows any data, and otherwise rely on bounces, replies and complaints.
2. **CAN-SPAM requires a cold commercial email to identify itself as an advertisement**, clearly and conspicuously, unless the recipient gave prior consent. The report's content rules cover the postal address and opt-out but leave this out, and a bare "personal" email can violate it.
   - The opt-out must stay working for 30 days after each send.
   - Opt-outs must be honored within 10 business days. The 24-hour target is fine.
   - Header and From information must not mislead. A lookalike sending domain must still clearly identify AMB.
   - Penalties are inflation-adjusted, about $53K per email as of 2025.
   - Source to check: FTC CAN-SPAM compliance guide (ftc.gov was blocked).
3. **Option B OAuth trap.** An external OAuth app left in "Testing" status issues refresh tokens that expire after 7 days. `gmail.modify` and `gmail.readonly` are restricted scopes, and public apps using them need verification and a security assessment. Fix this by creating the OAuth client inside the sending Workspace tenant as an **Internal** app, or by using a service account with domain-wide delegation. Either way the engine doesn't depend on refresh tokens expiring every 7 days.
4. **Header parsing may work through the connector.** `get_message` with RAW (see row 12) may make header-based auto-reply and DSN detection possible without Option B. Test it before building only text-based heuristics.
5. **Veterans Day, Wed Nov 11, 2026, falls in the planned first cold-send week** (week of Nov 9). Add it to the holiday skip list along with Thanksgiving (Nov 26) and Dec 21–Jan 2.
6. **Warm-up networks are a policy risk of their own.** Automated warm-up pools create artificial engagement. Google doesn't endorse them, and they arguably fall outside "genuine" use under the AUP. The plan's "free-tier warm-up" should be listed as a platform risk, and slow real-correspondence warm-up should be an option.
7. **Exchange Online Protection is the filter that matters most for this audience.** Dental practices and trades firms on Microsoft 365 / GoDaddy are filtered by EOP, which has its own reputation and connection-filtering behaviour. The report mentions this but doesn't plan for it. Seed-test into a Microsoft 365 tenant, not just Outlook.com.
8. **The Gmail rule list also includes** RFC 5322 formatting, no Gmail From impersonation, and ARC for forwarders (see row 1).

Files: Gmail API discovery document saved at /tmp/claude-0/-home-user-PROJECT-AVENGERS/e570b3a9-0053-5f3f-94d3-2c70f876c1b6/scratchpad/disc/gmail.json

Sources I actually checked:
- [Gmail API discovery document](https://gmail.googleapis.com/$discovery/rest?version=v1), fetched with curl, revision 20261012.
- Gmail connector schemas (send_message, create_draft, search_threads, get_thread, get_message, reply, update_draft, label_thread), loaded in this session.
- create_trigger and CronCreate schemas, loaded in this session.
- ListConnectors result.

No web pages could be checked: the search limit was used up, and the proxy and DNS blocked every cited host.
