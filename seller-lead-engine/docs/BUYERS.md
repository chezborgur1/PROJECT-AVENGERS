# Buyer sourcing

The buyer side of the engine finds people and firms who might buy an AMB
deal and invites each one to register on AMBrain. AMBrain owns the buyer's
account, the NDA and the deal room. This engine owns everything before
that: finding buyers, getting an address, the invitation with a personal
tracked link, the follow-up, opt-outs, and counting which channel brought
each registration.

Code: `src/buyers/`. Tables: `data/buyers/leads.csv`, `touches.csv`,
`partners.csv`, `inbound.csv`. Commands: `npm run engine -- buyers <step>`,
or the **Buyers** tab in the app.

## What AMBrain needs to do

Three things, and the engine does the rest:

1. **A registration page that reads two query parameters.** Every link the
   engine sends looks like
   `https://<ambrain>/join?ref=b-00012-3f9a1c&src=past-bidders`. `ref` is
   the buyer's personal code; `src` is the channel. AMBrain keeps both on
   the account when someone registers. Put the page's address in the
   settings as `buyers.signup_url` (and rename the parameters with
   `buyers.ref_param` / `buyers.source_param` if AMBrain uses others).
2. **A registrations export** (CSV): email, name, company, ref, src, status
   (registered / profile complete / verified) and the date. `buyers import
   registrations <file>` (or the upload on the Buyers tab) matches each row
   to its lead by code, then by email, and adds anyone who arrived through a
   channel link as a lead of their own. A webhook can replace the export
   later; the matching is the same.
3. Optional: **a deal page address** with `{ref}` where the deal reference
   goes (`buyers.listing_url`), so the posting kit links straight to a deal.

Until `signup_url` is set, buyers are still found, enriched and scored, but
nobody is invited.

## Every avenue, ranked

Ranked by how fast each turns into registered buyers. "Automated" means the
engine does it on a button press or in `daily`.

| # | Channel | What the engine does | Automated |
|---|---------|----------------------|-----------|
| 1 | **Listing-site inquiries** (BizBuySell, BizQuest, BusinessesForSale, DealStream, Axial, LoopNet, BizBen and others in `buyers.inquiry_senders`) | Reads each inquiry notification AMB receives as the listing broker, creates an "inquirer" lead with the listing number, and answers the same day with the link that unlocks the listing's details. The fastest, warmest buyers AMB has. | Yes: `buyers sync` |
| 2 | **AMB's mailbox history** | Reads a Google Takeout mbox (or a Gmail API search with `--history`): every past inquiry becomes a warm lead; anyone who wrote about buying (NDA, proof of funds, asking price, LOI) becomes a "review" lead a person approves. Usually the largest warm list there is. | One import |
| 3 | **AMB's own lists**: past bidders, buy-side clients, a listing site's own lead export, a CRM export | Any CSV with ordinary header names. Each list is its own channel. | Upload |
| 4 | **Strategic add-on buyers** | The larger businesses (20+ staff by default) in AMB's industries that the seller side already found and sized, once the seller sequence is done with them. The invitation says owners like them often grow by buying a competitor. | Yes: `buyers strategic` |
| 5 | **Private equity and search funds** (SEC Form D) | Every private fund that raised money files Form D. The engine keeps private equity funds up to `buyers.fund_max_offering` and small offerings named like search funds, minus real estate, credit, venture and crypto vehicles; one lead per firm with its executive officer and phone. | Yes: `buyers download form-d --import` |
| 6 | **Fund advisers** (SEC adviser lists, Form ADV) | Gives each fund firm's website, so enrichment can find the address the firm publishes. Wealth managers go to the partner list instead (`--partners`). | One import |
| 7 | **Referral partners**: SBA lenders, ETA clubs, CPAs, attorneys, wealth managers | SBA's 7(a) loan data ranks the lenders who financed the most change-of-ownership loans in AMB's states. Each partner gets a link of their own and a short note to send with it, so every buyer they refer is counted for them. | SBA: one import (desktop) |
| 8 | **Proven acquirers** (SBA 7(a)) | The businesses bought with those loans, in AMB's industries: people who already bought one and may add on. | Same import |
| 9 | **AMB's own posts**: LinkedIn, the website, the newsletter, email signatures, Axial profile, ACG chapter, Searchfunder, business-school ETA clubs | The posting kit writes the text for each, every one with its own tracked link. | Copy and post |
| 10 | **Conferences and events** | Import the attendee list as kind `conference`, its own channel. | Upload |
| 11 | **Organic** | Anyone who registers through a channel link without a personal code is added as a lead and credited to that channel. | Yes, on import |

Not used, on purpose: scraping BizBuySell or any listing site (their terms
forbid it), bought lists of unknown origin, guessed addresses, and any
message other than email.

## The daily loop

`npm run engine -- buyers daily` (and the seller `daily`, once
`signup_url` is set) runs:

1. **sync**: the buyer mailbox (Gmail API, or `data/buyers/inbox/*.json`
   written by the Claude Gmail routine), plus the answers to cold invitations
   that arrived in the seller reply loop. Opt-outs go on the permanent
   suppression list in the same run; queued emails to them are cancelled.
2. **strategic**: new add-on buyers from the seller records.
3. **enrich** (two minutes, continues where it stopped): a fund's website
   from its adviser's filing, the address the firm's own site publishes
   (robots.txt and "do not harvest" honored), and a verification for every
   cold address.
4. **score**: warm kinds first, then nearness, fund size, headcount and a
   fresh signal.
5. **send**: answers to fresh inquiries, then due follow-ups, then new
   invitations, best score first.

### Caps and mailboxes

- Warm buyers (inquirers, past bidders, clients, correspondents, referrals)
  hear from AMB's own mailbox, `buyers.mailbox`.
- Everyone else hears from the seller sending mailboxes, and only from what
  the seller plan leaves of each mailbox's ramp cap that day: the seller
  planner counts buyer emails too, so the two sides together never pass a
  mailbox's cap.
- `buyers.max_invites_per_day` caps everything (default 40), follow-ups
  included. `invite_steps` (default 2) and `follow_up_days` (default 6) set
  the follow-up.

### One owner, one side

A business the seller side is working (in its sequence, replied, a lead, or
scored into a sending tier) is never a strategic buyer, and once a business
is ready to be invited as a buyer the seller planner skips it. An address in
a seller conversation is never invited.

## The gate

Every buyer email passes `assertBuyerSendable` immediately before the
transport, and a failure stops that email and keeps the reasons on a
cancelled touch:

- not suppressed (the check fails closed), not on `exclude_domains`;
- `licensed_states` and `licensing_signoff` set and a postal address in
  the footer (inviting buyers to AMB's deals is brokerage activity too);
- a real sender's name, from a configured mailbox that is not paused;
- the buyer's own registration link in the body;
- a cold address verified as sendable;
- the house-style lint, the footer with the legal name and the opt-out
  line, the advertisement notice, and the List-Unsubscribe header.

Drafts by default, like the seller side: `sending.mode` decides.

## Statuses

`review` (a person approves) -> `new` / `needs_email` -> `ready` ->
`invited` -> `replied` (a person answers) -> `registered` -> `profiled` ->
`verified`. Also `opted_out`, `bounced`, `excluded`. Registration statuses
only move up.

## What still needs a person

- Set `buyers.signup_url` and `buyers.mailbox`, and confirm with counsel
  that the licensing sign-off covers buyer outreach.
- Send three or four real inquiry notifications (BizBuySell, BizQuest,
  Axial) so the reader's labels can be confirmed; a notification it cannot
  read is listed, never dropped.
- The SEC Form D, adviser and SBA file layouts could not be opened from the
  build environment. The importers map headers by name and stop with the
  headers they found when a file differs.
- Approve or exclude `review` leads, and answer `replied` ones.
- Email each partner their link and note.
