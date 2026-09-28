# Follow-up 1: NWC and closing mechanics (fixes Q17 and section 5.6 of HOUSE_STYLE.md)

**Scope.** This report closes one gap in `docs/HOUSE_STYLE.md`. Q17 (line 1047) says "No AMB precedent at all" and makes an asset sale, with the Seller keeping AR and AP, the default. Section 5.6 (line 858) tags `NWC` as "New; no AMB or TCC precedent". It also lists deferred revenue as a debt-like item "per the treatment input" (line 868). All three statements are wrong. AMB's own offer documents set a working-capital convention, and it has not changed across 19 drafts. They set the peg basis, and they put deferred revenue inside NWC. The Sunshine file and the ICP give a separate Main Street asset-purchase variant.

**Method.** I extracted every file below with python-docx, keeping paragraph styles, list levels and tables in order. (The `markitdown` CLI fails in this container with a `_cffi_backend` import error.) I rendered each file through LibreOffice to PNG and checked the pages. I also searched every `.docx` under `references/` for "working capital / peg / deferred revenue / true-up / holdback / cash-free / asset purchase / payable / receivable", so the "precedent" claims below cover the whole library and not only the six assigned files. Quotes are verbatim. Paths are relative to `/home/user/project-avengers/references/`.

---

## 1. Summary: what the guide should say

| Deal form | NWC convention (AMB precedent) | Peg | Deferred revenue | Debt, liens, cash | Holdback | Source |
|---|---|---|---|---|---|---|
| **Equity purchase** (stock or membership interests; LMM default) | "cash-free, debt-free basis, with a normalized level of working capital delivered at close" | "trailing-twelve-month average" | "treated as an operating liability", inside NWC | Seller sweeps excess cash before close; "all existing indebtedness (including credit card balances and any revolving facility) will be repaid at or before closing" | Indemnity escrow (10% of cash at close in Keystone), kept separate from any retention holdback | LOI12 §1, OFF14, RECS §5, OR3 T14 #13, TAX |
| **Asset purchase** (Main Street default) | Assets bought free and clear; Seller keeps cash, receivables and payables; no peg | None | Not assumed unless listed (New: credit the Buyer if it is) | "Ensure all outstanding liens are paid off prior to closing"; "Ensure free and clear title"; "Receive written mortgage payoff letter" | "One month of payroll as reconciliation holdback" (ICP5); SUN has none and flags that as an open risk | SUNPA, SUNTAX, ICP5, CORAL |

The **tax warning** applies whenever buyer or rollover stock is meant to be received tax-deferred: "A post-closing cash true-up flowing to the seller can be treated as additional boot. Structure it as an adjustment to the stock component, or cap total cash consideration, or handle it through an escrow that adjusts share counts." [FTM Phase 3]. It does **not** apply to an all-cash stock purchase or to a Main Street asset sale. In those deals the true-up is simply an adjustment to the taxable price.

---

## 2. Sources (add to section 0.1)

| Key | File | What it evidences |
|---|---|---|
| **LOI12** | `03) AMB Dataroom/06) Offer/Keystone_LOI_v12_Partnership.docx` (12 pp.) | Equity-deal NWC clause, pre-close cash sweep, debt payoff, "Quality of earnings and normalized working capital" diligence line |
| **OFF14** | `03) AMB Dataroom/06) Offer/Keystone_Offer_v14_Partnership.docx` (5 pp.) | One-pager term row labelled **"Balance Sheet"** |
| **RECS** | `03) AMB Dataroom/06) Offer/Keystone LOI v10 - Offer v12 – Recommended Changes by Structure: Regardless, Partnership 70-30, 100% Buyout (AMB, 2026-09-24).docx` (12 pp.) | Peg = T12M average; deferred revenue an operating liability; mechanics belong in the PA, not the LOI |
| **OR3** | `03) AMB Dataroom/06) Offer/Keystone Offer Review v3 – Partnership 70-30 ($650K, No Earnout), NH Tax & Ben Tax Questions (AMB, 2026-09-24).docx` | The same convention in AMB's term table; the cash- vs accrual-basis question |
| **TAX** | `03) AMB Dataroom/04) Deal Mechanics/Tax Considerations.docx` (9 pp.) | True-up as boot; the 20% boot ceiling in a reverse triangular merger; hard dollar cap; pre-close AAA distribution |
| **FTM** | `03) AMB Dataroom/04) Deal Mechanics/Forward Traingular Merger Guide.docx` (sic, 5 pp.) | True-up as boot; the "substantially all" test (90% net / 70% gross) broken by pre-close cash sweeps |
| **SUNPA** | `02 Monica Kennedy - Investor Dataroom/03 Process Documents/Sunshine Commercial Investments: Purchase Agreement Contingencies.docx` (2 pp.) | Main Street asset-purchase mechanics |
| **SUNTAX** | `03 AMB Advisory - Company Dataroom/In Progress Reports/Tax Expert Considerations - PA Decisions.docx` | Asset vs entity purchase, Form 8594 allocation, sales-tax clearance, FIRPTA |

Corroborating (optional keys): **OR2** `06) Offer/_Archive/Keystone Offer Review v2 – Partnership Structure, Tax & Deal Readiness (AMB, 2026-09-24).docx`; **BENP** `06) Offer/_Archive/Keystone Offer Review – Ben's Perspective & Recommended Fixes (AMB, 2026-09-23).docx`; **OSC** `06) Offer/_Archive/Keystone Offer Structures Compared – Partnership 70-30 vs. 100% Buyout: … (AMB, 2026-09-24).docx`; **SUNREQ** `02 Monica Kennedy - Investor Dataroom/03 Process Documents/Sunshine Commercial Investments: Post-PA Request List.docx` (and `…: Request List.docx`). **ICP5** and **CORAL** are already in the source key.

---

## 3. What AMB does (verbatim evidence)

### 3.1 Equity purchase: cash-free, debt-free, normalized NWC

**LOI12 §1 "Structure of Purchase"** (List Paragraph, bold run-in label):
> "Topkey will acquire 70% of the membership interests of Keystone (the "Acquired Interest") on a cash-free, debt-free basis, with a normalized level of working capital delivered at close. … Cash in excess of normalized working capital may be distributed to Ben before closing, and all existing indebtedness (including credit card balances and any revolving facility) will be repaid at or before closing."

**The 100% buyout versions** (`_Archive/Keystone_LOI_v1.docx` through `v10`) use the same clause with a different sweep sentence:
> "We will acquire 100% of the equity of Keystone on a cash-free, debt-free basis, with a normalized level of working capital delivered at close. All cash will be distributed to the existing owner prior to closing, aside from any cash necessary to cover due or pending invoices, and all existing debt (if any) will be paid down concurrently with closing."

**OFF14 "Valuation & Consideration" table**: the row label is **"Balance Sheet"** and the value is "Cash-free, debt-free, with a normalized level of working capital delivered at close". It is the sixth of eight rows, between "Ben's Retained Interest" and "Tax Matters".

**Diligence line in every LOI** (LOI12 §9 "Confirmatory Diligence", item a.): "Quality of earnings and normalized working capital;"

**Consistency.** The phrase "normalized level of working capital" appears in **19 readable Keystone drafts** with the same wording: LOI v0 (a term-sheet draft), LOI v1–v8, v10 and v12, and Offer one-pagers v2, v3, v7–v10, v12 and v14. RECS repeats it as suggested language. (`_Archive/Keystone Offer v4/v5/v6.docx` are corrupt zips and could not be read.) The convention held while the deal changed from a 100% buyout to a 70/30 partnership, so it is AMB's house convention, not a one-off.

### 3.2 Peg basis: trailing-twelve-month average

**RECS §5 "Keep these out of the letter – raise verbally or in the definitive documents"** (first bullet, bold lead-in):
> "**Working-capital peg and deferred revenue** – trailing-twelve-month average; deferred revenue (onboarding fees billed in advance, annual add-ons) treated as an operating liability. Mention on the walk-through call so Ben is not surprised; mechanics in the purchase agreement."

**OR3, term table (T14) row 13**: `13 | Working-capital peg and deferred revenue | Deferred revenue treated as an operating liability; trailing-12-month peg. | PA – raise verbally before signing`

**OR2, "Fixes" table row 12**: `Working-capital peg undefined | Deferred revenue treatment can swing Ben's pre-close cash by six figures. | Agree in principle that deferred revenue is an operating liability, not debt-like; peg set on trailing-12-month average. | PA – but flag the principle in a diligence call before signing`

Where it lives: the LOI states only the principle ("normalized level of working capital"). The peg basis and the deferred-revenue treatment are raised verbally and documented in the purchase agreement.

### 3.3 Deferred revenue: an operating liability inside NWC

- RECS §5 (above) defines it: "onboarding fees billed in advance, annual add-ons".
- OR2 row 5: "Treating deferred revenue as an ordinary operating liability (rather than debt-like) in the peg can add $100K+ to what he keeps." (Estimated effect: "likely $150–300K" for the pre-close cash line overall.)
- BENP row 9: "For a bookkeeping firm that bills in advance, the treatment of deferred revenue and prepaid fees in "normalized working capital" can swing the cash Ben is allowed to sweep by six figures."
- OR3 T8: "Cash in Keystone is probably backed by deferred revenue and will be needed for the working-capital peg anyway."
- OR3 question 8: "Is Keystone on the cash or accrual method? What are receivables, unbilled work and prepaid/deferred revenue at month-end?" with the note "Cash-basis receivables are ordinary income on sale (we assumed $150K); deferred revenue drives the working-capital peg."
- OSC: "Working-capital peg with deferred revenue treated as an operating liability; credit card / revolver balances to be cleared at closing."

AMB was advising the **buyer** (Topkey) on Keystone and still recommended treating deferred revenue as an operating liability, which favours the seller. On the sell-side work the bot supports, the same treatment is also AMB's natural position. Section 5.6's "Debt-like … per the treatment input" contradicts it.

### 3.4 Debt at close

- LOI12 §1: "all existing indebtedness (including credit card balances and any revolving facility) will be repaid at or before closing."
- OR3 question 11: "Any debt, credit lines, PPP/EIDL balances or personal guarantees?" with the note "Cash-free/debt-free payoff and debt basis."
- FTM Phase 3 ancillaries: "Payoff letters and lien releases for any target debt".
- CORAL (TCC lineage): `Debt Payoff Amount` block with per-diem interest (`Alliance Interest =48.07*7`, "Assumes 7/3 payoff") and a `Tax Liens` line under `Reconciliation Holdback Amount`.

### 3.5 Pre-close cash sweep and its tax side

- TAX item 1: "Pre-closing distribution of AAA. If Keystone is holding excess cash, distributing it to the shareholder before closing is tax-free to the extent of AAA and basis. Receiving that same cash as merger boot costs 23.8%. On $500K that's a $119K swing. The purchase price gets adjusted down and the working capital peg gets reset, so it's not free money …"
- OR3 T8 (the counterweight): "With a true zero basis, Keystone distributions above its 2026 current-year income are taxable gain, not tax-free. … Confirm basis and AAA before counting on it." Verdict: "Do not count on it".
- FTM Phase 1: "'Substantially all' test. … The IRS ruling guideline is 90% of net assets and 70% of gross assets. Pre-closing distributions to the seller — a cash sweep, a final S-corp distribution of accumulated adjustments account — can break this. Model it before you agree to any pre-closing distribution."

### 3.6 The tax warning on a working-capital true-up

- **FTM Phase 3, "Working capital adjustment"**: "be careful here. A post-closing cash true-up flowing to the seller can be treated as additional boot. Structure it as an adjustment to the stock component, or cap total cash consideration, or handle it through an escrow that adjusts share counts."
- **FTM Phase 1, "Continuity of interest"**: "Generally 40%+ of consideration in Topkey stock. At roughly 83% stock you're comfortable, but confirm how any working capital adjustment or escrow release is characterized."
- **TAX, reverse triangular merger**: "requires that stock representing at least 80% control of Keystone be exchanged solely for voting stock. That caps boot at 20%. You're at 16.67%. … A working capital true-up, an escrow release paid in cash, buyer covering the seller's legal fees, or a small cash sweetener during negotiation can push you over 20% and blow the whole structure. Then the seller is taxed on the full $3M."
- **TAX**: "If you do go reverse, write a hard dollar cap into the merger agreement covering every cash element: escrow releases, working capital true-ups, expense reimbursement, any separately allocated non-compete payment. Not a percentage, a dollar number, with a covenant that no amendment can breach it."
- **TAX, final paragraph**: "If the price adjusts down, the cash portion creeps up, or a working capital true-up gets characterized as additional consideration, you can blow qualification and make the entire transaction taxable to the seller."

**Scope.** Both documents cover §368 reorganizations only: forward (a)(2)(D), where continuity of interest is met at roughly 40% stock (the IRS ruling guideline is 50%), and reverse (a)(2)(E), where boot is capped at 20%. AMB's notes also mention "721 contribution and exchange" (`04) Deal Mechanics/Legal Considerations.docx`), which suggests the same caution for equity rollovers. The model should **flag** the issue and leave the tax work to counsel (Q22, OPP3 disclaimer).

### 3.7 Main Street asset-purchase variant (Sunshine)

**SUNPA** is an outline in Times New Roman: title 29 pt, section heads 22 pt, bullets 13 pt. Sections and bullets in order:

- **Purchase Agreement Structure**: "Two separate PAs" · "Executed as asset purchases" · "$1M RE valuation" · "$600K business valuation" · "Includes valuation formulas" · "Targeting 90-day closing" · "Need to consider enforceable remedies without holdback" (**highlighted yellow**, i.e. an open issue, not a settled "no holdback" policy)
- **Prerequisites** (numbered): "Complete Pre-Purchase Agreement Diligence Requests" · "Introduce & execute NNN leases with tenants"
- **Closing Contingencies**: "Subject to financing approval and funding" · "Complete Post-PA Diligence Requests" · "Ensure all outstanding liens are paid off prior to closing" · "Ensure free and clear title" · "Receive written mortgage payoff letter from SouthState" · "CRE valuation subject to building inspection findings" · "Buyer securing the required commercial and business insurance" · "Both PAs are cross-conditioned on each other closing simultaneously" · "MAC clause (covers tenants vacating, new liens filed, etc.)"
- **Real Estate Valuation**: "Subject to appraisal value". **Laundromat Valuation**: "Subject to lender valuation"
- **Pre-Closing Obligations**: "Transfer all account logins to the buyer" · "Transfer all revenue and expense payments to the new buyer bank accounts", with sub-bullets for each of the five tenants, electric, internet, water, the property manager, telephone, the laundromat contractor, the exterminator, repair and maintenance, and "Any other recurring expenses"

**SUNREQ** (both request lists): "Are there any outstanding accounts payable or accrued liabilities as of closing that the buyer would be assuming?" By default the Buyer assumes none, and the question tests for exceptions.

**SUNTAX** (Main Street closing items):
- "Asset purchase vs. entity purchase … Buying assets … usually gives you a stepped-up basis … Buying membership interests in the seller's LLC carries over the seller's existing basis and any embedded liabilities (including tax liabilities). … If you're using two separate purchase agreements (one for the real property, one for the business), this decision can differ between the two."
- "Purchase price allocation … across categories (land, building, FF&E/equipment, goodwill, non-compete) and reported to the IRS on Form 8594. … Get this locked into the PA language, not left to be sorted out after closing."
- "you can be held liable for the seller's unpaid sales tax unless you get a tax clearance letter from the Florida Department of Revenue before closing. This should be a closing condition, not a nice-to-have."
- FIRPTA: "withhold up to 15% of the sale price".
- Opening notes: "We want to allocate laundromat to assets / Seller does not because the gain on the assets they sold isn't taxed as capital gains".

**Other AMB asset-sale precedent: a reconciliation holdback in place of a peg**
- **ICP5** `Deal Term | Details` table: `Working Capital | One month of payroll as reconciliation holdback` and `Asset vs. Stock Sale | Asset sale`. The deal is $26M at 13.0x, with $21M cash at close and a $5M seller note: an asset sale at lower-middle-market size.
- ICP v3: `Working Capital | One month of revenue or payroll as reconciliation holdback`. ICP v1 template: `Working Capital | [To be negotiated — describe target or peg mechanism]` and `Asset vs. Stock Sale | [Asset sale / Stock sale — note preference and rationale]`.
- **CORAL** (TCC lineage) `Sources & Uses` H38:J42: `Reconciliation Holdback Amount` = `Tax Liens` 0 + `One Month Mgmt. Fees` 201,897. `Proceeds` row 13: "Minus: Reconciliation Holdback Amount", with the note "One month of management fees".

So AMB's asset-sale protection is a **reconciliation holdback of one month of payroll or fees**: ICP5, ICP3 and CORAL. SUN has none, and AMB flagged that as a risk.

### 3.8 Retention holdback vs indemnity escrow (AMB keeps them apart)

TAX: "Your reps and warranties escrow is a different instrument … Market is 5-10% for 12-18 months. Don't collapse it into the retention holdback, because the release conditions and the survival periods are different. … So your total holdback picture might be 10% retention plus 7.5% indemnity, not a single 30% bucket." LOI12 §7(h): "An escrow of 10% of the cash consideration ($65,000) will be funded at closing and held for [15] months." The reconciliation holdback (for working capital) is a third, separate instrument.

---

## 4. What is weak and should be elevated

1. **AMB states the peg in words and has never computed one.** No AMB or TCC workbook has an NWC schedule, a balance sheet or a debt-like schedule (R-TPL §4.6; R-MOD §9.4 item 20, and R-MOD: "Not modelled on Keystone: … a working-capital peg"). The model must compute the T12M average from month-end balance sheets, show the monthly series and seasonality, and report `Latest vs. Peg`. So the tab is **Keep (convention) + Elevate (computed)**, not "New".
2. **Cash-basis books.** Keystone is assumed to be "a cash-basis S corporation" [OR2]. Most Main Street and many LMM QuickBooks files carry no AR, AP or deferred revenue. The NWC tab needs a `Books basis` input (Cash / Accrual). On a cash basis, it rebuilds AR from the AR aging or invoice export, AP from the AP aging, and deferred revenue from the billing schedule, and flags any line it cannot build. AMB already asks the question (OR3 Q8); the model should act on the answer.
3. **Deferred revenue is defined only by example.** RECS gives "onboarding fees billed in advance, annual add-ons". The model should show it as a named NWC line with a `% of LTM revenue` ratio, so a buyer sees at once how much of the cash balance is customer money.
4. **Holdback size is ad hoc.** AMB has used one month of payroll (ICP5), one month of revenue or payroll (ICP3), one month of management fees (CORAL, $201,897) and none (SUN). Make it one blue input (default: one month of LTM payroll) with a `Basis` note, and let zero be chosen only with a note ("remedy without holdback", SUNPA).
5. **The tax trap is buried in two memos.** The model should flag it where the structure is set (Deal Structure), not leave it to the analyst to remember.
6. **The Main Street variant is a checklist in an outline.** The model and CIM should carry the substance, not SUN's formatting: what transfers, what is retained, liens paid from proceeds with payoff-letter status, and the Form 8594 allocation.

---

## 5. Drop-in replacement text for HOUSE_STYLE.md

### 5.1 Section 5.6 (replace lines 856–869)

> ### 5.6 Net working capital and debt-like items
>
> **Deal form.** `DealForm` on `Assumptions` is `Equity purchase` or `Asset purchase`. It defaults from `MainStreetMode` (TRUE → Asset purchase), and the advisor may override it: ICP5 is a $26M asset sale. Everything below keys off it.
>
> | | Equity purchase (LMM default) | Asset purchase (Main Street default) |
> |---|---|---|
> | Convention | **Keep**: "cash-free, debt-free basis, with a normalized level of working capital delivered at close" [LOI12 §1; OFF14 row "Balance Sheet"; LOI v1–v10] | **Keep**: assets bought free and clear; Seller keeps cash, receivables and payables; liens paid off before or at closing with written payoff letters [SUNPA; SUNREQ] |
> | Peg | **Keep**: trailing-twelve-month average of month-end Adjusted NWC [RECS §5; OR3 #13] | None |
> | Deferred revenue | **Keep**: an operating liability inside NWC [RECS §5; OR2 #12; OSC] | Not assumed unless listed. If the Buyer assumes it, the Buyer is credited at close (New) |
> | Protection | Post-closing true-up against the peg; indemnity escrow kept separate [TAX; LOI12 §7(h)] | Reconciliation holdback, default one month of LTM payroll [ICP5; CORAL]; zero allowed with a note [SUNPA] |
>
> **`NWC`** (Keep: AMB's convention and peg basis. Elevate: AMB states the peg in words only and no AMB or TCC workbook computes one, R-TPL §4.6, R-MOD §9.4)
>
> - Rows: `Accounts Receivable | Unbilled / WIP | Inventory | Prepaid & Other Current Assets | Total Current Assets (ex. Cash) | Accounts Payable | Accrued Liabilities | Deferred Revenue | Customer Deposits | Total Current Liabilities (ex. Debt) | Reported NWC | (–) / (+) Adjustments | Adjusted NWC | % of LTM Revenue | Deferred Revenue % of LTM Revenue | DSO | DIO | DPO`. Adjustments remove cash, funded debt and its current portion, credit-card and revolver balances ("repaid at or before closing", LOI12), shareholder and related-party balances, income taxes, accrued interest and transaction bonuses.
> - Columns: every month-end available, then `Peg (T12M avg.)`, `Latest`, `Latest vs. Peg`. With quarter-ends only: `Peg (T4Q avg.)` and a note. With year-ends only: no peg ("n.a. – monthly balance sheets required") and an info flag.
> - `Books basis` input (Cash / Accrual). On a cash basis, AR comes from the AR aging, AP from the AP aging and deferred revenue from the billing schedule. Any line that cannot be built shows `n.a.` and a flag (OR3 Q8).
> - `DeferredRevenueTreatment` defaults to `NWC (operating liability)`. `Debt-like` is an override that requires a note. Customer deposits follow the same input (New, by analogy; AMB is silent).
> - Asset purchase adds a `Transfers` column: AR, unbilled, prepaids, AP and accrued are `Retained by Seller`. Inventory and customer deposits are `Transfers` (Q17b). Deferred revenue is `Assumed only if listed`. The tab then shows a `Transferring NWC` subtotal and a memo `Seller-retained NWC (AR + unbilled − AP − accrued)`.
> - `True-up settlement` input: Cash / Stock / Share-adjusting escrow. When the structure includes buyer or rollover stock meant to be tax-deferred, the default is Stock and Deal Structure shows the flag in 5.5.
> - Named outputs: `NWC_Peg`, `NWC_Latest`, `NWC_vsPeg`, `DefRev_Latest`.
>
> **`Debt-Like Items`** (New)
>
> - `Item | Balance at latest month-end | Treatment (Debt / Debt-like / NWC) | Source | Status (Confirmed / Estimated / Open) | Payoff letter (Asset purchase: Received / Requested / n.a.)`.
> - Standard list: funded bank debt, lines of credit and revolvers, credit-card balances (LOI12), SBA loans, PPP or EIDL balances (OR3 Q11), vehicle and equipment loans, capital leases, shareholder loans, accrued interest, unpaid bonuses and payroll taxes, accrued income taxes, tax liens (CORAL), deferred capex, aged payables over 90 days, related-party payables, known litigation, and personal guarantees (memo only). **Deferred revenue and customer deposits are not on this list.** They appear as a memo row "In NWC (AMB default)" unless `DeferredRevenueTreatment` is overridden. A check fails if the same balance appears in both tabs.
> - Asset purchase: each item is "Retained by Seller; paid from proceeds at close" (SUNPA: "Ensure all outstanding liens are paid off prior to closing").
> - Totals feed the EV-to-equity bridge and the Seller proceeds waterfall.

### 5.2 Section 5.5 edits

- **Deal Structure inputs**: add `DealForm`, `True-up settlement`, `Reconciliation holdback` (months of payroll, default 1.0 for asset purchase and 0 for equity purchase), and `Stock consideration intended tax-deferred?` (Y/N).
- **Structure flag (New)**: when that input is Y, compute `Non-stock consideration % = (cash at close + cash escrow + seller note + cash earnout + cash true-up cap) ÷ total consideration`. Show one red-text note: "Stock-for-stock structure: cash elements are x% of consideration (reverse triangular merger limit 20%; forward merger continuity of interest ~40% stock). A cash working-capital true-up counts as boot. Confirm with tax counsel." [TAX; FTM]. This is a flag only; never compute after-tax proceeds (Q22).
- **Sources & Uses, Uses**: add `Reconciliation Holdback (funded to escrow)` for an asset purchase.
- **Seller proceeds, equity purchase**: `Purchase Price (EV) | (–) Funded Debt Repaid at Close | (–) Debt-Like Items | (±) NWC Delivered vs. Peg | Equity Purchase Price | (–) Transaction Expenses | (–) Indemnity Escrow | (–) Seller Note (deferred) | Closing Cash to Seller | (+) Seller Note Principal | (+) Expected Earnout | Total Consideration`, and memo `Excess cash distributed before close`.
- **Seller proceeds, asset purchase**: `Purchase Price | (–) Liens and Secured Debt Paid at Close | (–) Reconciliation Holdback | (–) Transaction Expenses | (–) Seller Note (deferred) | Closing Cash to Seller | (+) Holdback Released (expected) | (+) Seller Note Principal | Total Consideration`, and memo `Seller-retained cash and NWC (AR + unbilled − AP − accrued)`. Keep CORAL's italic Notes column, e.g. "One month of payroll" beside the holdback.
- Asset purchase adds a `Purchase Price Allocation (Form 8594)` block: `Land | Building | FF&E / Equipment | Inventory | Goodwill | Non-Compete | Total`. It is a blue input, internal, and never in the CIM [SUNTAX].

### 5.3 Section 5.7: new checks

| ID | Check | Why |
|---|---|---|
| C19 | Deferred revenue and customer deposits appear in exactly one of `NWC` and `Debt-Like Items` | Section 5.6 double-listed them; AMB puts them in NWC [RECS §5] |
| C20 | `NWC_Peg` built from ≥ 12 month-ends (info flag if built from quarter-ends; "n.a." if built from year-ends only) | AMB's peg is a trailing-12-month average [RECS; OR3] |

### 5.4 CIM sections S8.2 and S10.1

- **S8.2**: show the NWC trend and label the statistic `T12M average`, **never "peg" or "target"**. The peg is a negotiating term and stays out of the CIM under D5. Show deferred revenue as its own line with its % of revenue. Replace line 499 with: "In an asset purchase, S8.2 shows the lines that transfer and states in the note that the Seller retains cash, receivables and payables (5.6)."
- **S10.1**: state the basis of offers in AMB's own words (pending Q17d). Equity purchase: "Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close." Asset purchase: "The business is offered as a purchase of assets, free and clear of liens; the Seller retains cash, receivables and payables."

### 5.5 Q17 (replace the row at line 1047)

| # | Question | Default until answered | Why it is open |
|---|---|---|---|
| Q17 | **NWC and closing mechanics** (AMB precedent sets the defaults; confirm the remaining details): (a) confirm the defaults by deal form; (b) Main Street inventory: included in the price or added at cost at closing? Do customer deposits transfer with a credit to the Buyer? (c) reconciliation holdback of one month of payroll (ICP5) versus none (SUN); (d) may S10.1 state the basis of offers? | **Equity purchase (LMM):** cash-free, debt-free, normalized NWC delivered at close; peg = T12M average of month-end Adjusted NWC; deferred revenue an operating liability inside NWC [LOI12 §1, OFF14, RECS §5, OR3 #13]. **Asset purchase (Main Street):** Seller keeps cash, AR and AP; liens paid off at close with payoff letters; no peg; one month of payroll as reconciliation holdback [SUNPA, SUNREQ, ICP5, CORAL]. **Any tax-deferred stock or rollover:** true-up settled in stock or within a hard dollar cap, and flagged [FTM, TAX]. | AMB's equity-deal convention has not changed across 19 Keystone drafts. The asset-sale mechanics come from SUN and ICP5. AMB has no single answer on inventory, deposits or holdback size. |

Also change the source tag in the Q17 row and on line 858 from "No AMB precedent at all" and "New; no AMB or TCC precedent" to the citations above.

---

## 6. Presentation notes from the renders (for the ICP and deal-summary exhibits)

- **OFF14**: default font Calibri 11 pt (rendered in a sans substitute). Title "Topkey + Keystone – Partnership Offer" in maroon above a full-width maroon rule. `Heading 1` is 14 pt bold `7A0000`; `Heading 2` is 11.5 pt bold `9A0033`. Term tables are two columns: bold label cells filled `F2EEE9` (warm neutral), value cells white, thin grey grid. Open points are **yellow-highlighted brackets** (46 highlighted runs). Footer: "Confidential | Non-Binding Draft" at left and "Page n" at right, in small grey.
- **LOI12**: a full-width band "CONFIDENTIAL — LETTER OF INTENT", white bold on `7A0000`, tops each page. Numbered sections "1) … 2) …" with bold run-in labels ("**Structure of Purchase:**"), sub-levels a./b. and i./ii. There are 106 yellow-highlighted bracket runs, label fill `F2EEE9`, and footer text `595959`. The Word docs' `7A0000` / `9A0033` sit one step off the guide's `7B0000` / retired `990033`; D1 already normalises them.
- **RECS**: an Arial memo. Tables have a `E8EDF3` blue-grey header fill and 9 pt text, with columns `# | Current text | Recommended change | Why | Where`. Section 5 is a bold-lead bullet list. It is a Claude-drafted internal memo style, not AMB brand; do not copy the blue-grey.
- **SUNPA**: a plain Times New Roman outline (29 / 22 / 13 pt) with one yellow highlight. It is a working note, not a design reference.
- **Wording to reuse as-is** in ICP deal-term tables and the model's Deal Structure summary: row label **"Balance Sheet"** → "Cash-free, debt-free, with a normalized level of working capital delivered at close" [OFF14]; row label **"Working Capital"** → "One month of payroll as reconciliation holdback" and **"Asset vs. Stock Sale"** → "Asset sale" [ICP5].
