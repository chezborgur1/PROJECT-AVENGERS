# Plan review: what the fact-check changed

The plan's core idea holds: owners who never list publicly can be reached
with a free exit-readiness check, and brokers already pay $50 to $250 per
lead for that. Four things changed. The running cost is about $25 to $150 a
month, not $60 to $95 in total. The first qualified seller is more likely in
weeks 6 to 10 than 3 to 6. Licensing reaches AMB Advisory Services' own
outreach as well as lead sales. And "years open" is not available from Google.

The research is in [research/](research/), dated 2026-10-18. Direct page
fetches failed in that session, so every figure came from search-engine
extracts of the cited pages, and a second pass that could not reach the web
at all marked many of them unsupported. Vendor prices especially should be
re-read on the live pages before anyone quotes them to a client.

## Claim by claim

| Plan claim | Verdict | Correction |
|---|---|---|
| "Only 54% have a succession plan (U.S. Bank, 2025)" | Holds, with a caveat | 54% of 1,000 surveyed small-business owners of all ages (fielded March to April 2025). It is not a figure for retiring owners: never write "54% of retiring owners". The engine's emails do not cite it |
| BrokerPartnerz charges $2,000 to $2,500 a month for 10 appointments | Holds, from the vendor page only | $2,000 a month for 10 leads ($200 each) for $500K to $1M revenue sellers; $2,500 for 10 ($250 each, 3-month commitment) for $1M to $5M. The same page also says "no commitment required" |
| ProspectOut $500 to $1,000 a month or $100 per booked meeting | Partly | $100 per meeting **plus a tools fee of about $300 a month** ($250 on another of its pages). It also sells a 10%-of-deal commission plan, the structure the plan warns against |
| BizBuySell $50 per matched owner | Holds, but temporary | A "limited time introductory rate", each owner matched with up to 3 brokers, no listing guaranteed; the page is undated |
| A closed deal is worth $43K to $85K in commission | Vendor figure | BrokerPartnerz's own sales model. At about 10%, the national median sale price ($349,250, BizBuySell Q2 2026) gives about $35K. HVAC (median about $800K) gives about $80K, landscaping ($425K to $480K) about $42K to $48K. All gross of agent splits |
| About $60 to $95 to start | Partly | Month 1 can be that low. The running cost is higher: 3 mailboxes at $7 to $8.40 each ($21 to $25 a month), 2 domains at $11 to $13 a year, a sending and warm-up tool at about $40 to $50 a month if used, and verification beyond the free 100. Realistic: about $25 to $45 a month without a paid tool, $100 to $150 with one and paid email finding |
| Domains about $12 each | Holds, rising | .com wholesale goes from $10.26 to $10.97 on Nov 1, 2026. Budget $11 to $13 a year and buy before Nov 1 |
| Mailboxes about $7 each | Holds on an annual plan | Google Workspace Business Starter is $7 a month annual, $8.40 flexible |
| Free tiers for inbox warm-up | Mostly wrong | Free warm-up is essentially one tool with one account at 10 to 20 emails a day; the others are 7-day trials or paid. Warm-up networks are also a policy risk. The engine enforces zero cold sends during warm-up and a slow ramp itself |
| Free tiers for data enrichment | Partly | ZeroBounce about 100 verifications a month, Hunter about 50 credits, Google Places 1,000 Enterprise detail calls a month. None gives owner age, and none gives most Main Street owner emails. The engine builds the list from free state files instead |
| 2 to 3 weeks of warm-up | Optimistic | Vendor guidance for a new domain runs 2 to 8 weeks; plan for about 4 before real volume. The engine defaults to 3 weeks at zero cold, then 5, 10, 15 and 20 a day |
| First qualified sellers in about 3 to 6 weeks | Unverifiable; optimistic | No benchmark exists. From the warm-up and sending arithmetic: first positive reply around weeks 5 to 7, first qualified seller around weeks 6 to 10, and Main Street deals then take about 6 to 10 months to close (IBBA Market Pulse Q2 2026, second-hand) |
| Lists from "Google Maps data (reviews, years open, category)" | Wrong as stated | Places has no years-open field, and the Maps terms ban storing Places content beyond `place_id`. Tenure comes from Sunbiz formation dates and DBPR original license dates; Places is a live check at scoring time only |
| Signals: owner age and no succession plan | Not observable directly | Owner age has no lawful free source; the engine estimates a band from license, graduation and formation years, keeps it internal and never mentions it. Succession is approximated by officer records (a sole officer, or no officer sharing the owner's surname) |
| Licensing matters only if leads are sold | Wrong in scope | Florida (Fla. Stat. 475.01) and California (B&P 10131(a)) treat soliciting business sellers for a fee as licensed brokerage. That covers AMB's own cold email. The engine sends only to states on a counsel-signed allow-list |
| Charge flat per-lead fees, not a cut of the sale | Prudent, not a safe harbor | Where the solicitation is the licensed act, the fee structure does not cure it. Selling leads can also trigger data-broker registration (California, Texas, Vermont, Oregon). Exports are off until counsel signs off |
| CAN-SPAM: real sender, physical address, working opt-out, no false claims | Incomplete | Also required: a clear notice that the email is an advertisement, an opt-out that works for 30 days and is honored within 10 business days (and never expires), and non-deceptive subjects. Sending domains must be registered openly to AMB |
| Grok Bot with its own inbox sends and qualifies | Replaced | Claude cloud scheduled tasks run the engine ([RUNBOOK.md](RUNBOOK.md)). The Gmail connector cannot set List-Unsubscribe headers or a From address, works as one account, and cold email from Workspace is a gray area under Google's Acceptable Use Policy ("unsolicited bulk commercial email" is banned; suspension is possible). So the engine launches in drafts a person sends, on a separate Workspace tenant, at 5 to 25 emails per mailbox per day |
| "AI handles replies" | Changed | Fixed rules catch opt-outs, bounces and "are you a bot?" first; Claude classifies the rest and extracts only stated facts; every answer is a draft a person sends, with an AI-assistance line |
| Pipeline in a Google Sheet | Changed | CSV tables in a private `data/` store; a Sheets backend could sit behind the same store interface later |
| Launch outreach in week 3 | Moved to week 4 | Warm-up from Oct 20 and counsel's sign-off put the first drafts on Tuesday Nov 10, 2026 |

## Realistic funnel for 500 owners

Benchmarks for cold email to owners of small companies, all vendor-reported
and on different bases:

| Step | Rate | 500 owners |
|---|---|---|
| Human reply, per contact, across the sequence | about 1% to 4% (per email sent: 0.45% overall, 0.72% for companies with 0 to 10 employees, Belkins) | 5 to 20 replies |
| Positive share of human replies | about 15% to 30% (14% of all replies in one 61,770-reply sample) | 1 to 6 interested owners |
| Qualified (revenue, timeline and motivation in range) | | 0 to 3 qualified sellers in the first cycle |
| Listing to close | 20% to 30% of listed businesses sell | a first closing is a 2027 event at best |

A broker case study reporting a 30% reply rate from 206 owners is a single
vendor-published best case. The weekly report tracks these numbers per
contact and per email, so the forecast can be replaced by AMB's own rates
after the first cycle.

Throughput sets the calendar. Up to 3 emails per owner means up to 1,500
emails for 500 owners. With 2 mailboxes on the default Tuesday to Thursday
schedule and the ramp, that takes about 14 weeks of sending; 3 mailboxes on
Monday to Friday take about 7 (the 75-a-day domain cap still holds).

## Decide before launch

1. **Licensing:** which states AMB may solicit sellers in, under whose
   license, confirmed by counsel (`licensed_states`, `licensing_signoff`).
2. **The postal address** for the footer: a street address, USPS PO box or
   registered CMRA mailbox.
3. **The sender:** the principal's full name and title as they should print,
   and whether the principal or another named person signs.
4. **Domains and mailboxes:** 1 or 2 sending domains registered openly to AMB
   before Nov 1, and 2 or 3 mailboxes, which with the send days sets the
   calendar above.
5. **Transport:** the Gmail connector (one mailbox per connected account,
   no List-Unsubscribe headers) or the Gmail API (several mailboxes, an
   Internal OAuth app in the sending tenant).
6. **Warm-up:** a paid tool or slow real correspondence, and who runs it.
7. **Spend:** a verifier API (required to send anything without manual
   checks), and whether to enable Places details.
8. **Where `data/` lives:** a private repository (recommended) or a private
   Drive folder.
9. **Counsel review** of the disclaimer, the SBA statements, the AI
   disclosure, and Anthropic's and Google's usage policies for this use.
10. **Lead sales:** leave off. Revisit only with counsel's review of
    licensing and data-broker registration.
