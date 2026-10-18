# The exit-readiness check

This is the free offer in AMB Advisory Services' seller emails, described the way the owner experiences it. The engine builds it in `src/readiness/check.ts` from the owner's answers and public state records, and the advisor reviews it before it goes out. Research behind each rule: `docs/research/offer.md` (drivers, checklist, SBA, disclaimer) and `docs/research/claims.md` (market benchmarks).

## What the owner gets

An owner who replies "yes" to the first email receives, by email and as a short document:

1. **A readiness score from 0 to 100**, built from 8 drivers that buyers and SBA lenders look at. The score comes with a label: 80 and above is "Buyer-ready", 60 to 79 is "Close: fix 2 or 3 items", 40 to 59 is "Needs 12 to 24 months of preparation", and under 40 is "Early stage".
2. **The 3 things to look at first**, taken from the owner's own answers.
3. **The 25-item checklist buyers use**, with each item marked Met, Gap or Unknown, and a note giving the owner's figure ("60 hours a week (per owner)").
4. **A rough market range**, only when it can be supported (see "When a range is given" below). Otherwise the check says plainly why there is no number and offers a 20-minute call.
5. **What would sharpen the picture**: tax returns that match the books, a list of add-backs, the lease, and a customer list. Owners are asked not to email these.
6. **One paragraph on buyer financing**: most buyers of a business this size borrow through an SBA 7(a) loan, so earnings a buyer can verify on the tax returns set a ceiling on price.
7. **The disclaimer** (below), every time.
8. **One next step**: a 20-minute call with the named sender.

The check is free and unconditional. Nothing is attached to it: no listing agreement and no later fee (FTC Guide Concerning Use of the Word "Free", 16 CFR 251; offer.md verification M4).

## The 8 drivers

The driver names and wording are AMB Advisory's own, not Value Builder's trademarked terms (offer.md §5). Points are out of 100.

| Driver | Points | What a buyer asks |
|---|---|---|
| Owner dependence | 20 | Can the business run for 4 weeks without you? |
| Financial records | 15 | Do three years of books match the filed tax returns? |
| Recurring revenue | 15 | How much revenue repeats without a new sale? |
| Customer concentration | 10 | Would losing one customer hurt the business? |
| Team depth | 10 | Who runs the work day to day, and will they stay? |
| Growth | 10 | Is revenue flat or growing, and is the business big enough to finance? |
| Licences and transferability | 10 | Can the licence, contracts and equipment pass to a buyer? |
| Real estate and lease | 10 | Does the lease outlast a 10-year buyer loan, or do you own the property? |

Each driver's points are the share of its checklist items that are met. An item the owner has not answered is Unknown and counts as half credit, so a short email exchange neither inflates nor sinks the score. While more than half the items are unknown, the label says "provisional".

## The checklist, in plain English

**Financial records**
- You know your owner earnings (SDE) for the last full year.
- Three years of profit and loss statements match the filed tax returns.
- Personal and one-time expenses run through the business are listed and documented.
- A bookkeeper or CPA closes the books every month.

**Owner dependence**
- You work 50 hours a week or less in the business.
- The business runs for 4 weeks without you.
- Staff as well as you hold the main customer relationships.
- Pricing, processes and job checklists are written down.

**Customer concentration**
- No single customer is more than 15% of revenue.
- Customer agreements are in writing and can be assigned to a buyer.

**Recurring revenue**
- At least 30% of revenue repeats (maintenance plans, contracts, routes).
- More than 60% of revenue repeats.

**Team depth**
- A manager or lead person runs day-to-day work.
- That manager or lead person would stay after a sale.
- The business has 5 or more employees.
- Workers are classified correctly (W-2 or 1099) and payroll taxes are current.

**Growth**
- Revenue is flat or growing over the last 3 years.
- Profit is flat or growing over the last 3 years.
- Annual revenue is at or above the size most buyers in this market finance (`qualify.min_revenue`, $500K by default).

**Licences and transferability**
- The trade or professional licence is held by someone other than you, or a buyer can qualify for it.
- The company and its licence are active on state records.
- Equipment and vehicles are listed with model year, condition and any liens.
- No pending lawsuits, tax disputes or major warranty claims.

**Real estate and lease**
- You own the premises, or the lease runs long enough (with options) to cover a 10-year buyer loan: 10 or more years left is met, fewer is a gap.
- The landlord would consent to assigning the lease, or you know whether the property is for sale or lease.

## The intake questions

The first reply asks for bands, never documents (offer.md §4). The engine asks at most 3 at a time, in this order, and never asks the same question twice (`src/qualify/questions.ts`). Questions 11 to 15 are the checklist facts; the lease question counts as answered when the owner owns the building.

1. Revenue last full year: under $500K, $500K to $1M, $1M to $2M, $2M to $5M, or $5M and up.
2. Owner earnings (SDE), meaning net profit plus your own pay and perks, interest, depreciation and one-time costs: under $100K, $100K to $250K, $250K to $500K, $500K to $1M, or $1M and up.
3. Timeline: within 12 months, 12 to 24 months, or further out.
4. What prompted the interest.
5. Number of employees, full-time and part-time.
6. Your hours per week in the business.
7. Share of revenue from maintenance agreements, contracts or repeat routes.
8. Your largest customer's share of revenue.
9. Whether you own or lease the premises.
10. Who holds the trade or professional licence.
11. Whether the business could run for about four weeks without you.
12. Whether a manager or lead person runs the day-to-day work.
13. Whether revenue over the last three years has been growing, flat or declining.
14. Whether the books for the last three years match the tax returns.
15. If you lease, the years left on the lease, counting renewal options.

## When a range is given

A number reaches an owner only when every one of these holds:

1. `readiness.include_range` is on.
2. The vertical's row in `reference/multiples.json` is marked `verified: true`, meaning the figures were read from the source itself (FTC Act Section 5, 15 U.S.C. 45; the 1984 Advertising Substantiation statement).
3. The owner stated SDE (or revenue, for the dental, property management, pest control and accounting revenue rows when SDE is not stated).
4. SDE is at least $50K and below `readiness.max_sde_for_range` ($1M by default). Above that, buyers price on EBITDA and deal terms, and an advisor prices it directly.

The range is the vertical's published middle half (lower to upper quartile of sale price over SDE), placed inside that band by the readiness score, plus or minus 15%, rounded to $25K. It always excludes real estate and working capital. It is never called an appraisal, a valuation or "what your business is worth".

The verified rows (BizBuySell valuation benchmarks, businesses sold nationally 2021-2025, read 2026-10-18):

| Vertical | SDE multiple, lower quartile / median / upper quartile | Source |
|---|---|---|
| HVAC | 1.99 / 2.58 / 3.33 | bizbuysell.com/learning-center/valuation-benchmarks/hvac/ |
| Plumbing | 1.66 / 2.24 / 3.15 | .../plumbing/ |
| Electrical and mechanical contractors | 1.96 / 2.56 / 3.15 | .../electrical-mechanical-contractor/ |
| Landscaping and yard service | 1.70 / 2.30 / 3.01 | .../landscaping-yard-service/ |
| Dental practices | 1.60 / 2.48 / 3.37 (revenue 0.51 / 0.70 / 0.86) | .../dental-practice/ |
| Property management | 1.99 / 2.58 / 3.23 (revenue 0.47 / 0.80 / 1.26) | .../property-management/ |
| Cleaning and janitorial | 1.57 / 2.07 / 2.66 | .../cleaning-janitorial/ |
| Pest control | 1.69 / 2.04 / 3.00 (revenue 0.69 / 0.96 / 1.27) | .../pest-control/ |
| Accounting and tax practices | 1.61 / 2.04 / 2.66 (revenue 0.92 / 1.02 / 1.17) | .../accounting-cpa-tax-practice/ |
| Auto repair and service | 1.70 / 2.31 / 3.26 | .../auto-repair-and-service/ |
| Service businesses (all kinds) | 1.75 / 2.38 / 3.13 | .../service-business/ |

The IBBA and M&A Source Market Pulse medians (Q2 2026: 2.0x SDE for sale prices under $500K, 2.8x for $500K to $1M, 3.1x for $1M to $2M) are in the file as `main_street_default` with `verified: false`: they were read only second-hand, and Market Pulse gives one median per sale-price band rather than a range. No range is sent from them until a person reads the IBBA report itself. Re-check every verified row on the live page each quarter and update `as_of` and `verified_by`.

## The disclaimer

Every check and every check email carries this text (offer.md §3, draft for counsel):

> This is a rough, indicative review prepared by AMB Advisory Services from the information you shared by email and from public state records. It is not an appraisal, a certified business valuation or a fairness opinion, and it is not tax, legal or financial advice. It should not be relied on by a lender, or for tax, estate, partnership or litigation purposes. We have not reviewed or verified your financial statements, tax returns, contracts or lease. Any range excludes real estate and working capital and assumes a typical asset sale. Actual sale prices depend on verified financials, buyer financing (including SBA lending rules), deal terms and buyer demand, and may be higher or lower. No sale, price or timeline is promised. The range uses published rules of thumb from (source, period). For a formal valuation, use a credentialed valuation professional (for example ASA, CVA or ABV).

When a range is shown, the short line also appears beside it: "Rough range only, based on what you told me. Not an appraisal; real numbers depend on verified financials and deal terms."

## What the check never does

- It never states a fact the owner did not give or a public record does not show. Owner facts are marked "per owner"; record facts "per state records"; everything else is Unknown.
- It never mentions or implies the owner's age, health, family or plans after the sale, even when the owner raised them.
- It never gives a single number, never promises a price or a timeline, and never quotes a statistic without its source on file.
- It never values real estate. A paid opinion of real property value can fall under state appraiser licensing (offer.md §3).
