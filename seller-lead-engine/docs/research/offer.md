# Exit-readiness check: what it should contain (research report for AMB seller lead engine)

**As of 2026-10-18. Read this first: the research could not reach any live source.**

- WebSearch refused every query: "this turn's web search budget is used up (limit: 200 WebSearch calls per turn, shared by every agent in it)". Other agents in this workflow used up the shared budget before this one started.
- WebFetch failed on every first-party host I tried (`getaddrinfo ENOTFOUND`): bizbuysell.com, ibba.org, sba.gov, valuebuilder.com, ftc.gov, law.cornell.edu, wikipedia.org. A direct curl through the agent proxy was also refused for bizbuysell.com (`CONNECT tunnel failed, response 403`). Only GitHub hosts answered. I did not route around the block through third-party readers or mirrors.
- Nothing useful was in the repo. `references/.../Valuation Discussion.docx` is deal notes for one laundromat and real-estate deal, not market data.

So **every number below comes from my training knowledge (cutoff June 2026). None of it was checked against a live source in this session.** Each fact carries a confidence rating and the URL where it should be checked. The multiples table is shaped so the engine can ship it as data with `verified: false`. A human (or a follow-up run with web access) must check each row before any range goes out to an owner. DealStats (BVR), Peercomps and the Business Reference Guide are paywalled in any case. BizBuySell Insight and IBBA/M&A Source Market Pulse are free summaries. Their full datasets and by-industry cuts are partly gated. **To finish this research, send a follow-up message once web access or the search limit (CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION) is restored.**

---

## 1. Valuation rules of thumb for Main Street deals

### 1a. Market-wide benchmarks (verify before use)

| Benchmark | What I recall | Confidence | Verify at |
|---|---|---|---|
| BizBuySell Insight: median sale price of closed Main Street deals | About $320K-$350K across 2023-2025 | Medium-low | https://www.bizbuysell.com/insight-report/ |
| BizBuySell Insight: median sale-price / cash-flow (SDE) multiple | Usually about 2.3x-2.6x; service sector near the overall median | Medium | same |
| BizBuySell Insight: deals per year | About 9,500 closed deals reported per year in 2023-2024 | Medium-low | same |
| IBBA / M&A Source Market Pulse: multiples rise with deal size | Under $500K: about 2.0-2.5x SDE. $500K-$1M: about 2.5-3.0x SDE. $1M-$2M: about 3.0-3.5x SDE. $2M-$5M: about 3.5-4.5x EBITDA. $5M-$50M: about 4.5-6x+ EBITDA. Exact medians change each quarter | Medium on the pattern, low on exact values | https://www.ibba.org/market-pulse/ |
| Market Pulse: who buys | Main Street buyers are mostly first-time or individual buyers. Seller financing and SBA 7(a) loans are the usual structure under about $2M | Medium | same |
| DealStats (BVR), Peercomps | Paywalled. No figures can be given without a subscription | n/a | https://www.bvresources.com/products/dealstats ; https://www.peercomps.com |

**Medians by vertical:** I do not have reliable BizBuySell or DealStats median sale prices by vertical for 2025-2026. I am not giving numbers I can't source. This is an open gap for the follow-up run, which can use BizBuySell's industry pages and the Insight report's sector cuts.

### 1b. Rule-of-thumb multiples by vertical (draft data, `verified: false`)

These ranges match the rules of thumb commonly quoted in the Business Reference Guide and in broker practice for owner-operated businesses with SDE under about $1M. They usually **exclude real estate**, and many exclude inventory, which is added on top. The Business Reference Guide itself says rules of thumb are a sanity check, not a valuation method.

| Vertical | SDE multiple low / mid / high | Revenue multiple low-high | Main factors that move it | Confidence |
|---|---|---|---|---|
| HVAC (residential service and replacement) | 2.0 / 2.75 / 3.5 | 0.35-0.55 | Maintenance-agreement base, service vs. new-construction mix, technician bench. Private-equity roll-ups pay 4-7x+ EBITDA once EBITDA is above about $1M | Low-medium |
| Plumbing | 2.0 / 2.5 / 3.25 | 0.30-0.50 | Service vs. new-construction mix, license holder | Low |
| Electrical contractor | 1.75 / 2.5 / 3.0 | 0.25-0.45 | Project vs. service work, backlog, license qualifier | Low |
| Landscaping | 1.75 / 2.5 / 3.0 | 0.30-0.50 (equipment matters) | Commercial maintenance contracts are worth more than design/build. Seasonality. Equipment condition | Low |
| Dental practice (general) | 1.5 / 2.0 / 2.75 (SDE includes the dentist's pay) | 0.60-0.80 of annual collections | Collections trend, payer mix (fee-for-service vs. PPO), hygiene share, buyer must be a licensed dentist or DSO | Low-medium; percent of collections is the main convention |
| Property management | 2.0 / 3.0 / 4.0 | 0.75-1.25 of annual management fees | Door count, contract terms, client retention | Low |
| Commercial cleaning / janitorial | 1.5 / 2.25 / 3.0 | 0.30-0.55 | Written contracts, customer concentration, staff turnover | Low |
| Pest control | 2.5 / 3.25 / 4.0 | 0.75-1.25 | Recurring route revenue. Strategic acquirers buy actively | Low-medium |
| Accounting / bookkeeping | 1.75 / 2.5 / 3.25 | 0.75-1.25 of gross fees | Client retention. Price is often adjusted for retention after closing. SBA financing cannot fund earnouts | Low-medium |
| Auto repair | 1.75 / 2.25 / 3.0 | 0.25-0.45 plus inventory | Technician depth, equipment, lease vs. owned real estate | Low |

**Fallback by SDE size band** (use when a vertical is missing or not verified; shape follows Market Pulse):

| SDE band | Multiple low / mid / high |
|---|---|
| Under $100K | 1.5 / 2.0 / 2.5 |
| $100K-$250K | 2.0 / 2.5 / 3.0 |
| $250K-$500K | 2.25 / 2.75 / 3.25 |
| $500K-$1M | 2.5 / 3.0 / 3.75 |
| $1M+ | Move to an EBITDA basis (3.5-5x). Flag for the broker; do not auto-generate a range |

Confidence on the fallback table: low-medium. Source to check: IBBA Market Pulse.

---

## 2. What buyers and SBA lenders look at

### SBA 7(a) under SOP 50 10 8

Effective June 1, 2025. Verify at https://www.sba.gov/document/sop-50-10-lender-development-company-loan-programs. Check whether any 2026 procedural notices have amended it.

- **Equity injection:** at least 10% of total project cost for a business purchase (a complete change of ownership). Confidence: medium-high.
- **Seller note as equity:** it counts only if it is on **full standby for the whole life of the SBA loan** (no principal or interest payments), and it can cover **at most half of the required injection**. This replaced the looser SOP 50 10 7.1 rule, which allowed 24-month standby and the full injection. Confidence: medium.
- **Partial sales:** allowed. A seller who keeps any ownership must personally guarantee the loan for 2 years. Confidence: medium.
- **Seller staying on:** in a complete change of ownership, the seller can stay as a consultant or employee only for a transition of up to 12 months. Confidence: medium.
- **No earnouts:** SBA-financed purchases cannot include contingent or earnout payments. Confidence: medium-high.
- **Independent valuation:** required from a qualified, credentialed valuer when the amount financed, minus appraised real estate and equipment, is more than $250,000, or when buyer and seller have a close relationship. Confidence: medium-high. Implication: AMB's rough range is never the lender's valuation.
- **Other rules:**
  - Maximum 7(a) loan is $5M.
  - Acquisition loan term is usually 10 years.
  - Lenders underwrite from federal business tax returns, usually 3 years.
  - Minimum debt service coverage is about 1.15x; banks often require 1.25x. Confidence: medium.
  - Ownership must be by U.S. citizens, nationals or (possibly) lawful permanent residents. I recall a tightening in 2025-2026 but cannot confirm it. Confidence: low.

**The practical effect on value:** the price a Main Street business can actually sell for is often capped by what an SBA-financed buyer can service. Roughly: (SDE minus a market wage for a manager, minus capex), divided by annual debt service on about 90% of the price, must be at least 1.25. Seller notes are less useful as equity under 50 10 8, so buyers need more cash, and some deals need lower prices or bigger standby notes.

### Buyer diligence factors

These are standard in broker practice and in the Value Builder and Exit Planning Institute materials (sources in section 5). The ranking is my synthesis:

1. **Owner dependence.** Can the business run for 4+ weeks without the owner? Who holds the customer relationships, the estimating and the license?
2. **Customer concentration.** A single customer above about 10-15% of revenue is a red flag. Value Builder uses 15%.
3. **Recurring or contracted revenue.** Maintenance agreements, service contracts, route-based revenue.
4. **Clean books.** P&L reconciles to the tax returns. Add-backs are documented. Cash is not run off the books, because lenders and buyers can only credit income that was reported.
5. **Trend.** 3-year revenue and SDE trend. Margins in line with peers.
6. **Staff depth and tenure.** A key manager or lead technician. Low turnover. Wages at market rate.
7. **Licence transferability.** Trade contractor licences (HVAC, plumbing, electrical) usually depend on a qualifying individual, so the buyer needs a qualifier. Dental practices can usually only be bought by licensed dentists, because many states restrict corporate practice of dentistry. Accounting firms have CPA ownership rules.
8. **Real estate and lease.** Years left on the lease plus options, compared with the loan term. Whether the landlord must consent to assignment. Owned real estate is valued separately.
9. **Equipment and vehicles.** Age, condition, liens.
10. **Working capital and inventory.** What is included in the price.
11. **Legal and compliance.** Pending claims, worker classification (1099 vs. W-2), permits, insurance history.
12. **Online reputation.** Review count and rating. These are proxy signals the engine already collects from Google Maps.

---

## 3. Presenting a rough range responsibly

### Legal basis

- **FTC Act Section 5** (15 U.S.C. 45(a)) prohibits "unfair or deceptive acts or practices in or affecting commerce". Check at https://www.law.cornell.edu/uscode/text/15/45.
- **FTC Policy Statement on Deception (1983):** a practice is deceptive if it is a material representation or omission likely to mislead a reasonable consumer. https://www.ftc.gov/legal-library/browse/ftc-policy-statement-deception
- **FTC Advertising Substantiation policy (1984):** objective claims need a reasonable basis before they are made.
- **FTC "Operation AI Comply" (Sept 2024):** no AI exemption from these rules.

Confidence on these legal rules: high. They were not re-fetched.

### Rules for the engine

1. **Never call it an appraisal, a certified valuation or "what your business is worth".** Call it an "indicative range" or "rough market range", based on owner-reported bands and published rules of thumb.
2. **Always give a range, never a single number.** Round to the nearest $25K or $50K.
3. **Show the method:** "about X-Y times owner earnings, typical for [vertical] businesses of this size".
4. **State the assumptions:** owner-reported numbers, not checked; excludes real estate; excludes or includes inventory; assumes an asset sale, cash-free and debt-free.
5. **Leave real estate out.** In many states a paid opinion of real property value can trigger appraiser or real estate licensing rules.
6. **Don't promise outcomes or timelines.** No "we'll get you 4x", no "sell in 90 days". Any statistic quoted (for example, "54% of owners have a succession plan") needs its source, and the source must be on file.
7. **Don't inflate the range to win the meeting.** That is a material misrepresentation risk under Section 5 and the deception policy. It also loses the listing later.
8. **Say what would change the range:** verified tax returns, add-back support, customer and lease review.
9. **AI disclosure:** answer honestly if asked. California's B.O.T. Act (SB 1001) and Utah's AI disclosure law are relevant (confidence medium; not fetched).

### Disclaimer text (draft for counsel to review)

> **About this estimate.** This is a rough, indicative range prepared by AMB Advisory Services from the information you shared by email and from published industry rules of thumb. It is not an appraisal, a certified business valuation, a fairness opinion, or tax, legal or financial advice, and it should not be relied on for lending, tax, estate, divorce, partnership or litigation purposes. We have not reviewed or verified your financial statements, tax returns, contracts, leases or other records. The range excludes real estate [and inventory] and assumes a typical asset sale. Actual sale prices depend on verified financials, buyer financing (including SBA lending rules), deal terms, market conditions and buyer demand, and may be higher or lower than this range. No sale, price or timeline is guaranteed. For a formal valuation, use a credentialed valuation professional (for example ASA, CVA or ABV).

Short version for the email body:

> Rough range only, based on what you told us. Not an appraisal; real numbers depend on verified financials and deal terms.

---

## 4. Intake questions for email

**First reply: 6 questions, answered by picking a band. Ask for bands only, never documents.**

1. **What you do and where:** main service and city or metro. This confirms the vertical.
2. **Revenue last full year:** under $500K / $500K-1M / $1-2M / $2-5M / $5M+
3. **Owner earnings (SDE)** = net profit + your own salary and perks + interest, depreciation and one-time costs: under $100K / $100-250K / $250-500K / $500K-1M / $1M+
4. **Owner involvement:** your hours per week, and could the business run for 4 weeks without you? (yes / mostly / no)
5. **Recurring revenue:** share from maintenance agreements, contracts or repeat routes: under 10% / 10-30% / 30-60% / 60%+
6. **Largest customer** as a share of revenue: under 10% / 10-20% / 20%+

**Optional second round, before handing to the broker:**

7. Years in business and years you have owned it
8. Number of employees (full-time and part-time), and is there a manager or lead technician?
9. 3-year trend: growing / flat / declining
10. Do your tax returns match your books? (yes / mostly / no)
11. Premises: own or lease? Years left on the lease, including options?
12. Is the trade or professional licence in your name, or held by an employee?
13. Timeline and goal: full exit / partial sale / stay on for a while. 0-12, 12-24 or 24+ months

Data handling: tell owners not to email tax returns or bank statements. If documents are needed later, use a restricted-access Drive folder after an NDA.

---

## 5. Readiness frameworks

### Value Builder System (John Warrillow)

Source: https://www.valuebuilder.com. Not reached this session. Confidence: medium.

- **8 drivers:**
  - Financial Performance
  - Growth Potential
  - "Switzerland Structure" (not dependent on any one customer, employee or supplier)
  - "Valuation Teeter-Totter" (cash flow and working capital)
  - Recurring Revenue
  - "Monopoly Control" (differentiation)
  - Customer Satisfaction
  - "Hub & Spoke" (owner dependence)
- **Score:** 0-100. Value Builder claims that businesses scoring 80+ get offers about 71% higher than average.
- **Usage:** the name and score are trademarked. Use our own wording, and don't call AMB's score a Value Builder Score.

### Exit Planning Institute (CEPA designation, "Value Acceleration" method)

Source: https://exit-planning-institute.org. Not reached. Confidence: medium.

- Readiness has three parts: **business, personal and financial**.
- **"Four Cs" of intangible value:** human, customer, structural and social capital.
- EPI's "State of Owner Readiness" surveys report that most owners plan to exit within 10 years but few have a written plan.

---

## 6. Deliverable: readiness checklist (20 items, plain English)

1. The business runs for 4 weeks without you, and someone else can quote, schedule and sign off on work.
2. Your key customer relationships are held by staff or the company, not only by you.
3. No single customer is more than 15% of revenue.
4. At least 30% of revenue repeats automatically (maintenance plans, contracts, routes).
5. You have 3 years of P&Ls that match your filed tax returns.
6. Personal and one-time expenses run through the business are listed and documented.
7. Revenue and profit are flat or growing over the last 3 years.
8. Monthly books are closed within 30 days, by a bookkeeper or CPA.
9. You have a manager or lead person who would stay after a sale.
10. Key staff have worked for you for 2+ years and are paid market wages.
11. Workers are correctly classified (W-2 vs. 1099), and payroll taxes are current.
12. Licences and permits can transfer, or a qualified employee holds them.
13. Your lease has enough years left (including options) to cover a 10-year buyer loan, and the landlord would consent to a transfer. Or you own the property and know whether it is for sale or lease.
14. Equipment and vehicles are listed with age, condition and any liens.
15. Customer contracts and agreements are in writing and can be assigned.
16. You have no pending lawsuits, tax disputes or major warranty claims.
17. Pricing, processes and job checklists are written down.
18. Your online reputation is solid: steady reviews and a good rating.
19. You know what you need from a sale (amount after tax and debt) and when.
20. You have thought about life after the sale and whether you'd stay on for a transition (SBA deals allow up to 12 months).

---

## 7. Deliverable: scoring scheme

Keep two separate scores:

- **Business readiness (0-100):** where the business sits within the multiple range. Goes to the owner.
- **Seller intent:** timeline and motivation. Feeds lead scoring. Internal only.

| Driver | Weight | Scoring, from the intake answers |
|---|---|---|
| Owner independence | 20 | Can run 4 weeks without owner: yes 20, mostly 10, no 0 (owner works 60+ hours a week: subtract 5) |
| Recurring revenue | 15 | 60%+: 15. 30-60%: 11. 10-30%: 6. Under 10%: 2 |
| Financial record quality | 15 | Returns match books: yes 15, mostly 8, no 0 |
| Customer concentration | 10 | Under 10%: 10. 10-20%: 5. 20%+: 0 |
| Trend | 10 | Growing 10, flat 6, declining 0 |
| Team depth and tenure | 10 | Manager or lead in place 6, plus 4 if 5+ employees |
| Transferability (licence, lease, contracts) | 10 | Licence not tied to the owner: 4. Lease or real estate is clear: 4. Contracts in writing: 2 |
| Scale | 10 | SDE band: under $100K 2, $100-250K 5, $250-500K 8, $500K+ 10 |

**From score to range:**

- Position in the multiple range: t = clamp((score − 30) / 50, 0, 1).
- Point multiple = low + t × (high − low), using the vertical row if verified, otherwise the size-band fallback.
- Range = point multiple × SDE band midpoint, ±15%. Clamp it to [low multiple × band floor, high multiple × band ceiling]. Round to $25K.
- Apply the SBA affordability cap: debt service at an assumed rate and 10-year term (both config values) on 90% of the price must be covered at least 1.25x by (SDE − market manager wage). If the top of the range breaks this, cap it and add the note "financing may limit price".
- Score labels: **80+ "Buyer-ready"**, **60-79 "Close: fix 2-3 items"**, **40-59 "Needs 12-24 months of preparation"**, **under 40 "Early stage"**.
- Name the 3 lowest-scoring drivers as the "what to fix first" section.

**Do not send a number when:**

- SDE is unknown or under $50K, or
- SDE is $1M+ (flag for the broker instead), or
- the vertical row is unverified and no fallback applies.

In those cases send the checklist only.

---

## 8. Deliverable: multiples data for the engine

```json
{
  "as_of": "2026-10-18",
  "verified": false,
  "verification_note": "Drafted from model training knowledge; live sources unreachable in research session. Verify each row against BizBuySell Insight, IBBA/M&A Source Market Pulse, Business Reference Guide or DealStats before production use.",
  "basis": "SDE multiple, excludes real estate; inventory added separately where noted",
  "verticals": [
    {"id":"hvac","sde":[2.0,2.75,3.5],"rev":[0.35,0.55],"inventory":"add","sources":["Business Reference Guide (paywalled)","https://www.bizbuysell.com/insight-report/"],"confidence":"low-medium","verified":false},
    {"id":"plumbing","sde":[2.0,2.5,3.25],"rev":[0.30,0.50],"inventory":"add","confidence":"low","verified":false},
    {"id":"electrical","sde":[1.75,2.5,3.0],"rev":[0.25,0.45],"inventory":"add","confidence":"low","verified":false},
    {"id":"landscaping","sde":[1.75,2.5,3.0],"rev":[0.30,0.50],"inventory":"n/a","confidence":"low","verified":false},
    {"id":"dental","sde":[1.5,2.0,2.75],"rev":[0.60,0.80],"rev_basis":"annual collections","primary":"rev","confidence":"low-medium","verified":false},
    {"id":"property_management","sde":[2.0,3.0,4.0],"rev":[0.75,1.25],"rev_basis":"annual management fees","confidence":"low","verified":false},
    {"id":"commercial_cleaning","sde":[1.5,2.25,3.0],"rev":[0.30,0.55],"confidence":"low","verified":false},
    {"id":"pest_control","sde":[2.5,3.25,4.0],"rev":[0.75,1.25],"confidence":"low-medium","verified":false},
    {"id":"accounting_bookkeeping","sde":[1.75,2.5,3.25],"rev":[0.75,1.25],"rev_basis":"gross fees","confidence":"low-medium","verified":false},
    {"id":"auto_repair","sde":[1.75,2.25,3.0],"rev":[0.25,0.45],"inventory":"add","confidence":"low","verified":false}
  ],
  "size_band_fallback": [
    {"sde_max":100000,"sde":[1.5,2.0,2.5]},
    {"sde_max":250000,"sde":[2.0,2.5,3.0]},
    {"sde_max":500000,"sde":[2.25,2.75,3.25]},
    {"sde_max":1000000,"sde":[2.5,3.0,3.75]}
  ]
}
```

---

## 9. What the exit-readiness check document should include

1. A two-line personal note from the named sender.
2. The indicative range, with the method and assumptions.
3. The readiness score, its label, and the 3 things to fix first.
4. The 20-item "what buyers look for" checklist, with the owner's likely weak items highlighted.
5. "What would sharpen this number": verified returns, add-back schedule, lease, customer list.
6. A one-paragraph explanation of how SBA financing caps what most buyers can pay.
7. The disclaimer.
8. A single call to action: a 20-minute call.

---

## Sources (none reached this session; check them in the follow-up run)

- BizBuySell Insight Report: https://www.bizbuysell.com/insight-report/
- IBBA / M&A Source Market Pulse: https://www.ibba.org/market-pulse/
- SBA SOP 50 10 8: https://www.sba.gov/document/sop-50-10-lender-development-company-loan-programs
- FTC Act Section 5, 15 U.S.C. 45: https://www.law.cornell.edu/uscode/text/15/45
- FTC Policy Statement on Deception: https://www.ftc.gov/legal-library/browse/ftc-policy-statement-deception
- FTC Advertising Substantiation statement: https://www.ftc.gov/legal-library/browse/ftc-policy-statement-regarding-advertising-substantiation
- Value Builder System: https://www.valuebuilder.com
- Exit Planning Institute: https://exit-planning-institute.org
- DealStats (BVR, paywalled): https://www.bvresources.com/products/dealstats
- Peercomps (paywalled): https://www.peercomps.com


## Key facts

| Fact | Confidence | Source | Design implication |
|---|---|---|---|
| No live source was reachable in this research session. WebSearch reported the shared per-turn budget (200 calls) as used up. WebFetch returned ENOTFOUND for bizbuysell.com, ibba.org, sba.gov, valuebuilder.com, ftc.gov, law.cornell.edu and wikipedia.org. The proxy refused bizbuysell.com with a 403. Every figure in this report comes from training knowledge and is not verified. | high | Tool errors in this session (WebSearch budget message; WebFetch getaddrinfo ENOTFOUND; curl CONNECT 403) | Ship the multiples data with verified:false. The engine must refuse to send a numeric range from any row that is not verified, and send the checklist only, until a human or a follow-up research run checks each row against BizBuySell, IBBA or the Business Reference Guide. |
| The overall BizBuySell median sale-price / cash-flow (SDE) multiple for Main Street deals sits around 2.3x-2.6x, with median sale prices around $320K-$350K in 2023-2025. | low | https://www.bizbuysell.com/insight-report/ (not reached) | Use as a sanity bound. Flag any generated multiple above about 3.5x SDE for a Main Street (under $1M SDE) business for broker review. |
| IBBA/M&A Source Market Pulse shows multiples rising with deal size: about 2.0-2.5x SDE under $500K, about 2.5-3.0x for $500K-$1M, about 3.0-3.5x for $1M-$2M, then EBITDA multiples (about 3.5-4.5x for $2M-$5M). The pattern is fairly well established; the exact values are not. | low | https://www.ibba.org/market-pulse/ (not reached) | Keep a fallback multiple table by SDE size band. Above $1M SDE, switch to EBITDA and route to the broker instead of auto-generating a range. |
| Commonly cited Business Reference Guide rules of thumb: HVAC about 2-3.5x SDE / 35-55% of revenue; dental 60-80% of collections; pest control and property management about 0.75-1.25x revenue; accounting firms about 0.75-1.25x gross fees; most trades and auto repair 1.75-3x SDE plus inventory. | low | Business Reference Guide (paywalled, not reached) | Store the SDE low/mid/high and revenue low/high per vertical, with inventory and real-estate basis flags and a per-row source and as-of date. For dental, use percent of collections as the primary method. |
| SBA SOP 50 10 8 took effect June 1, 2025: 10% minimum equity injection for changes of ownership; a seller note counts toward equity only if on full standby for the whole loan term and for at most 50% of the required injection; a seller keeping any ownership in a partial sale must guarantee for 2 years; seller transition is capped at 12 months. | medium | https://www.sba.gov/document/sop-50-10-lender-development-company-loan-programs (not reached) | Add an SBA affordability cap: DSCR of at least 1.25 on 90% financing over 10 years at a configurable rate. Explain in the check that financing limits the price. Keep rules in config so SOP updates are a data change. |
| SBA requires an independent valuation from a qualified, credentialed source when the financed amount minus appraised real estate and equipment is more than $250K, or when buyer and seller have a close relationship. Earnouts cannot be SBA-financed. | medium | SBA SOP 50 10 8 (not reached) | The disclaimer must say the range is not a valuation a lender can rely on, and should point to credentialed valuers (ASA, CVA, ABV). |
| FTC Act Section 5 (15 U.S.C. 45) prohibits unfair or deceptive acts or practices. The 1983 Deception Policy covers material representations likely to mislead a reasonable consumer. The 1984 substantiation policy requires a reasonable basis for objective claims. Operation AI Comply (2024) confirms there is no AI exemption. | high | https://www.law.cornell.edu/uscode/text/15/45 ; https://www.ftc.gov/legal-library/browse/ftc-policy-statement-deception (not re-fetched) | Never use the words appraisal or certified valuation. Always give a range, rounded, with the method and assumptions. Keep a citation for every statistic in the copy. Don't inflate ranges or promise outcomes. Attach the disclaimer to every check. |
| In many states a paid opinion of real property value can trigger appraiser or real estate licensing rules. | medium | General state appraisal-licensing practice (not verified) | Always leave real estate out of the range, and say so in the assumptions. |
| The Value Builder System scores 8 drivers from 0-100: Financial Performance, Growth Potential, Switzerland Structure, Valuation Teeter-Totter, Recurring Revenue, Monopoly Control, Customer Satisfaction, Hub & Spoke. It claims scores of 80+ get offers about 71% higher than average. | medium | https://www.valuebuilder.com (not reached) | Build AMB's own 8-driver 0-100 readiness score in our own words. Don't use the trademarked name or claim, and don't quote the 71% figure unless verified. |
| The Exit Planning Institute frames readiness as business, personal and financial, and intangible value as the Four Cs (human, customer, structural, social capital). | medium | https://exit-planning-institute.org (not reached) | Keep business readiness (sets the position in the range, shared with the owner) separate from personal and financial intent (timeline and motivation, feeds the internal lead score). |
| Trade contractor licences (HVAC, plumbing, electrical) usually depend on a qualifying individual. Dental practices are restricted to licensed-dentist buyers in many states (corporate practice of dentistry). CPA ownership rules apply to accounting firms. | medium | General state licensing practice (not verified) | Ask an intake question about who holds the licence, and include licence transferability in the readiness score and the checklist. |
| DealStats (BVR), Peercomps and the Business Reference Guide are paywalled. BizBuySell by-industry median sale prices for 2025-2026 were not obtained. | high | https://www.bvresources.com/products/dealstats ; https://www.peercomps.com | Leave per-vertical medians as null in the data. Add them later from a licensed source or a follow-up research run with web access. |

---

# Adversarial verification

# Verification report: "Exit-readiness check" research (offer)

**As of 2026-10-18. I could not reach any live source either, so nothing below was checked against a primary source.**

- **Search:** WebSearch refused both queries I sent with the same message the researcher got: "this turn's web search budget is used up (limit: 200 WebSearch calls per turn, shared by every agent in it)".
- **Fetch:** WebFetch returned `getaddrinfo ENOTFOUND` for sba.gov, bizbuysell.com, ibba.org and ftc.gov.
- **Direct curl through the agent proxy:** returned `CONNECT tunnel failed, response 403` for sba.gov, ecfr.gov, federalregister.gov, govinfo.gov, valuebuilder.com and exit-planning-institute.org. The proxy status page shows the same 403 policy denials for other hosts.
- **Workarounds:** I did not use third-party readers, mirrors or archives.
- **Repo:** it has no local reference material on these topics. Only `/home/user/PROJECT-AVENGERS/amb-material-bot/docs/HOUSE_STYLE.md` matched a keyword search, and it is not a data source.

So, as the task requires, every fact I could not check is marked **unsupported**. Where my own training knowledge (cutoff June 2026) agrees or disagrees with the report, I say so in the correction column, but that is not verification. "Corrected" is used only where the report contradicts itself or its own sources, which I can show without fetching anything. To finish the job, send a follow-up message once web access or the search limit (CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION) is restored.

## Fact table

| # | Fact (from the report) | Verdict | Correction and source |
|---|---|---|---|
| 1 | No live source was reachable. Every figure comes from training knowledge. | **Confirmed** | I got the same failures this session: WebSearch budget message, ENOTFOUND, proxy 403. Design implication stands: ship `verified:false` and send no numeric range from an unverified row. |
| 2 | BizBuySell Insight: median SDE multiple about 2.3-2.6x; median sale price about $320K-350K (2023-2025); about 9,500 deals a year | **Unsupported** | Not reachable (https://www.bizbuysell.com/insight-report/). My recall is about 2.4-2.6x and about $340K-350K for 2023-2024, with annual counts around 9,500. I have no 2025 full-year or 2026 quarterly figures. Don't put any of these numbers in owner-facing copy. Using about 3.5x as an internal sanity flag is fine. |
| 3 | IBBA / M&A Source Market Pulse: multiples rise with size (<$500K 2.0-2.5x SDE … $2M-5M 3.5-4.5x EBITDA) | **Unsupported (values); corrected (how the bands are used)** | Not reachable (https://www.ibba.org/market-pulse/). Market Pulse bands are by **deal value / sale price** (<$500K, $500K-1M, $1-2M, $2-5M, $5-50M), not by SDE. The report's "fallback by SDE size band" table applies sale-price bands to SDE. A business with $400K SDE at 2.75x sells for about $1.1M, which is the $1-2M Market Pulse band, not "$250K-500K". Fix: either re-key the fallback by implied price, or label the SDE bands as AMB's own heuristic with no Market Pulse citation. |
| 4 | Business Reference Guide rules of thumb (HVAC 2-3.5x SDE / 35-55% of revenue; dental 60-80% of collections; pest control, property management and accounting 0.75-1.25x revenue; trades 1.75-3x) | **Unsupported** | Paywalled and not reachable. Dental "percent of collections" is the standard convention, and 60-80% matches my recall. All the other rows are model recall only. Keep `verified:false` per row; no numbers until a licensed source is checked. |
| 5 | SBA SOP 50 10 8 effective June 1, 2025; 10% minimum equity injection for a change of ownership; seller note counts as equity only on full standby for the life of the loan and for at most 50% of the injection; partial-sale seller guarantees for 2 years; seller transition up to 12 months | **Unsupported** | sba.gov was not reachable. Each point matches my recall of 50 10 8. Missing: 50 10 8 has had at least one technical update or procedural notice since June 2025 (see missed facts M1-M3). Check the current version and notices before relying on any rule. Keeping the rules in config is the right design. |
| 6 | Independent business valuation required when financed amount minus appraised real estate and equipment > $250K, or when there is a close relationship; earnouts cannot be SBA-financed | **Unsupported** | Not reachable. Both match long-standing SOP language as I recall it. The design implication (the disclaimer says the range is not a lender valuation) holds either way. |
| 7 | Other SBA rules: maximum 7(a) $5M; 10-year acquisition term; minimum DSCR about 1.15x; ownership by US citizens / nationals / LPRs "possibly tightened" | **Unsupported; likely out of date on citizenship** | $5M and 10 years match recall. 1.15x matches my recall of 50 10 8; 1.25x is a common bank requirement, not an SBA rule. On citizenship, my recall is a March 2025 notice requiring 100% ownership by US citizens, nationals or LPRs, then a later 2025-2026 notice dropping LPRs (100% citizens or nationals). Confidence low-medium. This needs a live check because it shrinks the buyer pool. |
| 8 | SBA affordability cap: (SDE − market manager wage − capex) / debt service on about 90% of price ≥ 1.25 | **Corrected (method)** | This is not a published rule; it is the researcher's own heuristic. Main Street lenders usually subtract the buyer-operator's living draw or a replacement salary, and many buyers run the business themselves. Subtracting a full market manager wage *plus* using 1.25x (not SBA's about 1.15x) understates what buyers can pay and will cap ranges too low. Make the wage deduction, the DSCR, the rate and the financed share all config values, and label the cap "illustrative". Also count the SBA guaranty fee (M2). |
| 9 | FTC Act §5 (15 U.S.C. 45(a)); 1983 Deception Policy Statement; 1984 Ad Substantiation statement; Operation AI Comply (Sept 2024) | **Unsupported (not re-fetched)** | The statute and the two policy statements match well-established knowledge. Operation AI Comply was announced Sept 25, 2024. Possible 2025 change: my low-confidence recall is that the FTC under new leadership reopened and set aside at least one AI Comply order (Rytr) in 2025. The deception and substantiation duties themselves are unchanged. Section 5 covers B2B claims, so it applies when the audience is business owners. |
| 10 | A paid opinion of **real property** value can trigger appraiser or real estate licensing rules in many states | **Unsupported** | Plausible: state appraiser licensing under the FIRREA Title XI framework, with exemptions for broker price opinions in some states. Not checked. Leaving real estate out is a safe design either way. |
| 11 | Value Builder: 8 named drivers, 0-100 score, "80+ get offers about 71% higher"; uses a 15% concentration threshold | **Unsupported** | valuebuilder.com was not reachable. The driver names match my recall. The 71% figure is the vendor's own marketing claim, so don't quote it at all. That is stricter than the report's "unless verified": even once verified it would be the vendor's number, not substantiated by AMB. |
| 12 | Exit Planning Institute: business / personal / financial readiness; Four Cs (human, customer, structural, social capital) | **Unsupported** | Not reachable. Matches recall. It is only used to frame the score, so the risk is low. |
| 13 | Trade licences depend on a qualifying individual; corporate-practice-of-dentistry limits on buyers; CPA ownership rules | **Unsupported; dental claim needs nuance** | General pattern is right but not checked. Correction: in most states, DSOs and private equity *do* buy dental practices, through a management-services (MSO) structure with a licensed dentist as nominal owner. So "can usually only be bought by licensed dentists" understates the buyer pool, and the DSO/PE premium is part of dental pricing. CPA firms: the AICPA/state rule is majority CPA ownership, not 100%. |
| 14 | DealStats, Peercomps and the Business Reference Guide are paywalled; no by-vertical BizBuySell medians for 2025-2026 were obtained | **Unsupported (very likely true)** | Can't confirm live; matches knowledge that all three are subscription products. Leave the medians null. |
| 15 | Scoring: "Do not send a number when SDE is under $50K" | **Corrected (internal logic)** | The intake's lowest SDE band is "under $100K", so the engine can't tell when SDE is under $50K. Either add an "under $50K" band to the intake, or send no number for the whole under-$100K band. |
| 16 | AI disclosure: California B.O.T. Act (SB 1001) and Utah's law are relevant | **Unsupported; likely incomplete** | Not fetched. Utah's AI Policy Act (2024) was narrowed by 2025 amendments (disclosure mainly when clearly asked, or for regulated occupations). California's B.O.T. Act applies to bots that hide being artificial to encourage a sale. That is directly relevant because AI-written replies go out under a **named human sender**. Other states passed chatbot-disclosure laws in 2025 (for example Maine). Get counsel to review. |

## Important facts the report missed (all unsupported; check in the follow-up run)

1. **M1. SOP 50 10 8 has changed since June 2025.** Look for technical updates and procedural notices from 2025-2026 (citizenship/ownership, SBSS minimum score, possible changes to the standby rules). Keep a versioned `sba_rules` config with the SOP version and notice IDs, and re-check each quarter.
2. **M2. SBA guaranty fees are back.** The FY2025 fee relief for small loans ended under 50 10 8, and upfront fees are typically financed. That raises debt service and lowers the affordability cap, so add the fee to the cap calculation.
3. **M3. A citizenship-only ownership rule (if confirmed) shrinks the SBA buyer pool.** The check copy should not imply every buyer can use SBA financing.
4. **M4. The FTC "Free" Guide (16 CFR 251).** Calling the exit-readiness check "free" is fine only if nothing is attached to it: no required listing agreement, no fee added later. Copy and terms must keep it unconditional.
5. **M5. Business-broker licensing for AMB itself.** Several states require a real estate licence to broker business sales, at least when real estate or a lease assignment is involved (often cited: Florida, California, Arizona, Georgia, Illinois and others; varies). Check the 1-2 target metros' states before the check's CTA asks for a listing. This is separate from the lead-resale point in the plan.
6. **M6. Data-broker and privacy law if leads are sold.** If AMB sells or licenses owner data (owner age, years owned) to other brokers, California's Delete Act may require data-broker registration. Its DROP deletion-request platform is due to start processing in 2026 (August 2026 per my recall). Vermont, Texas and Oregon also have data-broker registries. CCPA's B2B exemption ended Jan 1, 2023, though AMB probably falls below the CCPA thresholds.
7. **M7. Owner-age data.** Don't take it from a consumer report (FCRA permissible-purpose risk). Keep it a soft scoring signal, and never mention age in outreach copy.
8. **M8. PE / strategic buyer premium in the target verticals (HVAC, dental, pest control).** Main Street SDE multiples understate what roll-ups pay above about $1M EBITDA, and that is now often happening at smaller sizes. The report mentions this only for HVAC. Route businesses with SDE over about $750K to the broker as possible platform or add-on deals.
9. **M9. Dental basis.** Percent-of-collections ranges depend on whether real estate, equipment, the patient base and accounts receivable are included. Add `includes` flags to the dental row.
10. **M10. Every statistic must be on file with its source.** The plan's "54% of owners have a succession plan (U.S. Bank, 2025)" and the BrokerPartnerz commission figures were outside this report's scope and were not checked. Under the report's own rule 6 they must not appear in outreach until their sources are fetched and stored.
11. **M11. Market Pulse bands are by sale price.** This is the methodological error in fact 3. Fix it before the fallback table drives any range.

**Files checked:** `/home/user/PROJECT-AVENGERS` has no source material for these facts.
