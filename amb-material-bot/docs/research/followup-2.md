# Follow-up 2: Offer, deal mechanics and equity structure (fixes Q16, 5.5, S10.1, S10.2)

**Scope.** None of the five research reports opened `06) Offer`, `04) Deal Mechanics` or `07) Equity Structure`. As a result, `HOUSE_STYLE.md` Q16 (line 1046) leaves every Deal Structure default blank and says "Only SUN's one-off financing terms exist". It also gives S10.1 and S10.2 (lines 512–513) no AMB wording. Both claims are wrong. AMB's offer files set defaults for escrow, indemnity, holdback, earnout, cash at close and timeline, and the ICP and write-ups set seller-note terms. This report complements `followup-1.md`, which covers NWC, the peg, the reconciliation holdback and the S10.1 "basis of offers" sentence. I do not repeat those points here.

**Method.** I dumped every file with python-docx: styles, run formatting (font, size, bold, colour, highlight), tables with cell fills, headers and footers, and core properties. I read the raw `styles.xml`, header and footer XML where rendering mattered. The `markitdown` CLI fails in this container (`_cffi_backend`). I rendered OFF14, LOI12, OUTL, PB06, PB04, OR3, RECS and BL through LibreOffice and looked at the PNGs. I rendered the checklist workbook fit-to-page, one sheet per page. I also searched every `.docx` in the three folders, plus `ICP Template/`, for "escrow / holdback / earnout / seller note / cash at close / survival / timeline / effective / Prepared by". So the "precedent" claims below cover the library, not only the seven assigned files. Quotes are verbatim. Paths are relative to `/home/user/project-avengers/references/03) AMB Dataroom/` unless they start with `ICP Template/`.

---

## 0. Provenance correction (read first)

The task brief says the "(AMB, 2026-09-24)" memos were "last saved by python-docx". **That is an artefact of the reader, not a fact about the files.** These files have no `docProps/core.xml` at all. They have 9 zip parts: `document`, `styles`, `settings`, `numbering`, `fontTable`, `theme1`, two rels files and `[Content_Types]`. When core.xml is missing, python-docx makes up defaults: `last_modified_by="python-docx"`, `title="Word Document"`, `revision=1`, `modified=now()`. The "modified" time moved on every read (23:57, 23:58, 00:01, 00:04 UTC).

The real signature is a **Google Docs export**. The files have a lower-case `normal` style name, `w:widowControl w:val="0"` in docDefaults, and line spacing of 276, 324 or 336 twips (1.15, 1.35, 1.4). Every rsid is `00000000` and paraIds are sequential (`00000001`). Arrows and block glyphs fall back to "Arial Unicode MS", and horizontal lines are VML `<w:pict>` rules. OUTL, PB04, KON, MISC, TAX and FTM carry the same signature.

**The Word files need the same care.** OFF14's core.xml says "lastModifiedBy Frank Moneymaker, rev 41, 2026-09-21T20:13". But its body has **0 of 104** paragraphs carrying Word's `w14:paraId`/rsid stamps. Its zip entries are dated 2026-09-25 00:08, whereas Word writes 1980-01-01. Its content (70/30, $650K) postdates 21 Sep. So a script rewrote OFF14's body on 25 Sep and kept Frank's core.xml. Offer v10, v12 and v14 all carry that identical "rev 41, 20:13" stamp. LOI12 is the same case: 15 of 215 paragraphs are Word-authored, and it was re-zipped on 25 Sep. I counted Word-authored paragraphs version by version:

| File | Word-authored paragraphs | Palette | What it means |
|---|---|---|---|
| Offer v2, v3; LOI v0 (18–21 Sep) | 83/83, 71/71, 97/97; zip 1980 | navy `1F3A5F` / `2E75B6` / `EAF1F8` | Frank in Word |
| LOI v1 (21 Sep 17:41); Offer v7, v8 (21 Sep 16:47, 17:51) | 0/148, 0/69, 0/70 | maroon `7A0000` / `9A0033` / `F2EEE9` / `D8D0C6` | Generated (LOI v1 creator "Un-named"); the maroon look first appears here |
| LOI v2–v7 (21–23 Sep, rev 4→24); **Offer v9** (rev 41) | 149/149; **71/71**; zip 1980 | maroon | **Frank edited and saved the maroon documents in Word** |
| LOI v8, v10; Offer v10, v12 | 149/150, 142/146, 71/73, 64/68 | maroon | Word body with small script edits |
| LOI12, OFF14 (25 Sep) | 15/215, 0/104 | maroon | Script-regenerated; Frank's metadata carried over |

**Offer v9 is therefore the cleanest Frank-saved evidence** for the maroon Word furniture. It has exactly OFF14's values: H1 `7A0000` 14 pt; H2 `9A0033` 11.5 pt; header 20 pt `7A0000` over a 2.25 pt `9A0033` rule; footer 8 pt `595959`; `F2EEE9` label fills; `D8D0C6` borders; the same margins. The look was generated first, but Frank adopted it and kept saving it in Word.

| Evidence tier | Files | Why |
|---|---|---|
| **1. Frank-saved Word** (strongest for style) | Offer v9 (maroon); LOI v2–v7 (maroon); Offer v2/v3, LOI v0 (navy, superseded). OFF14 and LOI12 inherit v9's and LOI v7's styles.xml | Word paraIds on every paragraph; zip 1980 |
| **2. Google Docs exports** (content strong; style weaker) | OR3, OR2, BENP, OSC, RECS, BL, EQM, DRR, OUTL, PB04, KON, MISC, TAX, FTM | No core.xml; Docs defaults (Arial 11, black or navy headings) |
| **3. Generated** (structure only) | PB06 and LOI v1 (creator "Un-named" with a millisecond timestamp: the npm `docx` library default); Offer v7/v8, OFF14 and LOI12 bodies; CHK (core.xml creator `openpyxl`, app.xml LibreOffice 24.2.7.2); POSTX (a Google Sheets export: `xmlns:mx`, `persons/person.xml`, one sheet "Untitled", no widths or fills) | Script output |

So the memos are weaker style evidence **because they are Google Docs output**, not because python-docx wrote them. On content they carry the same weight as other AMB work product. Every one opens "Prepared by AMB Advisory Services LLC for …". OFF14 is still the best statement of the **final terms**. For **style**, cite Offer v9.

---

## 1. Summary: what the guide should add or change

1. **Q16 is answerable from AMB precedent** except for SBA 7(a) terms and AMB's success-fee schedule. No file in the library has either. Defaults: cash at close 80% of price; seller note 20%, 18 months, 9.0%, quarterly payments; no earnout; indemnity escrow of 10% of cash at close, held 15 months; indemnity cap 10% of price, 0.75% basket, 15-month survival; retention holdback off, 18 months when on; exclusivity 90 days plus one 30-day extension. Keystone's 17% cash is a **stock-consideration** special case, not the house default (section 3.2).
2. **5.5** gets a sourced defaults table (section 8.1). It also needs an explicit earnout slope: VAL reaches the 150% cap at **120%** of target revenue, while RECS drafts "a maximum of $750,000 at 150% of target". That is a live inconsistency (section 7).
3. **S10.1** gets AMB's non-price term vocabulary, taken from OFF14, LOI12 and ICP5 and converted to sell-side wording (section 5). Valuation stays out (D5).
4. **S10.2** keeps ICP1's eight stages but fills stages 6–8 with AMB's post-LOI convention: confirmatory diligence and definitive agreements (the "11-week process"), then signing and escrow funding, then an effective date chosen for the tax year. The model's Deal Structure tab gains four timing inputs and two checks (section 4).
5. **Memo furniture.** AMB's preparer line is `Prepared by AMB Advisory Services LLC for <client> | <Month D, YYYY> | Confidential[ – <audience limit>]`. The model cover (B30) and any Word companion should use this grammar (section 6).
6. **Palette note for D1/Q1.** The offer documents moved from navy (`1F3A5F` / `2E75B6` / `EAF1F8`: Offer v2–v3, LOI v0, 18–21 Sep, Frank in Word) to maroon (`7A0000` / `9A0033` / `F2EEE9` / `D8D0C6`). The maroon look first appears in generated files on 21 Sep (Offer v7, LOI v1). Frank then saved it in Word about eight times (LOI v2–v7, Offer v9). So `9A0033`, one step from the "retired" `990033`, is AMB's current Word accent for H2s, the title rule and the LOI band. It is not only TCC's theme. This does not change D1 for the CIM, but it is evidence for Q1. The navy in OR3 (`1A3C6E`) and CHK (`1F3864`) is off-brand Docs and openpyxl output. Do not copy it.
8. **Metadata caution.** Neither "python-docx" (a python-docx placeholder when core.xml is missing) nor OFF14's "Frank Moneymaker, rev 41" (core.xml carried over by a script rewrite on 25 Sep) proves who last saved a file. Section 0 gives the paragraph-stamp test. Cite Offer v9 for Word style and OFF14/LOI12 for final terms.
7. **Correction to followup-1 §6.** The LOI12 header band is white on **`9A0033`** (`header2.xml`: `w:fill="9A0033"`), not on `7A0000`.

---

## 2. Sources (add to section 0.1)

Keys shared with followup-1 keep its names (LOI12, OFF14, RECS, OR3, OR2, BENP, OSC, TAX, FTM).

| Key | File | Tier | What it evidences |
|---|---|---|---|
| **OFF14** | `06) Offer/Keystone_Offer_v14_Partnership.docx` (5 pp.) | 3 body, 1 styles | Final term-table wording ("Total Valuation", "Cash at Close", "Balance Sheet", "Tax Matters", "Target Timing"); Word furniture inherited from v9 (H1 `7A0000` 14 pt, H2 `9A0033` 11.5 pt) |
| **OFF9** | `06) Offer/_Archive/Keystone_Offer_v9.docx` | 1 (71/71 Word paragraphs) | The cleanest Frank-saved maroon document; the same furniture as OFF14 |
| **OFFARC** | `06) Offer/_Archive/Keystone Offer v2.docx`, `v3`, `Keystone_Offer_v7/v8/v10/v12.docx` | 1 / 3 | Navy-to-maroon restyle; "17% / 83%" and "$50,000" escrow wording; "Timeline & Next Steps" table |
| **LOI12** | `06) Offer/Keystone_LOI_v12_Partnership.docx` (12 pp.) | 3 body (15/215 Word paragraphs), 1 styles | Escrow "10% of the cash consideration ($65,000) … held for [15] months"; indemnity cap, basket, survival; exclusivity; timeline table |
| **DRR / OPT2** | `06) Offer/Keystone Deal – Topkey Data Room Review.docx`; `06) Offer/Keystone Partnership – Series A Decision Options v2 (plain-common opening) for LOI v13 - Offer v15 (AMB, 2026-09-24).docx` | 2 | Preparer-line variants only (not read in full) |
| **LOI0** | `06) Offer/_Archive/Keystone LOI v0.docx` (and LOI v1–v10) | 1 | Original timeline row "(11-week process)" |
| **OUTL** | `03) Target Materials/Topkey + Keystone: Offer Outline.docx` | 2 | "Total Valuation: $3,000,000 (1.0x run-rate recurring revenue)"; "Cash at close: $500,000 (17% of valuation)"; "Timeline & Next Steps" |
| **KON** | `04) Deal Mechanics/Keystone Offer Negotiation.docx` | 2 | Original internal note: "18-month holdback to offset customer retention / employee retention risk" |
| **PB04** | `04) Deal Mechanics/Keystone Offer Negotiation — Playbook.docx` | 2 | Docs draft of the playbook |
| **PB06** | `06) Offer/Keystone_Offer_Negotiation_Playbook.docx` (12 pp.) | 3 (AMB-branded) | Final playbook: numbers cheat sheet, concession path, "eleven-week process" |
| **MISC** | `AMB + Topkey: Misc Notes.docx` | 2 | "Typical accounting deals are structured 70% to 80% cash up front"; holdback sizing |
| **OR3** | `06) Offer/Keystone Offer Review v3 – Partnership 70-30 ($650K, No Earnout), NH Tax & Ben Tax Questions (AMB, 2026-09-24).docx` (18 pp.) | 2 | Memo furniture; the "effective date in the next tax year" lever; the earnout decision |
| **RECS** | `06) Offer/Keystone LOI v10 - Offer v12 – Recommended Changes by Structure: … (AMB, 2026-09-24).docx` (12 pp.) | 2 | Drafted earnout clause; escrow and indemnity package; "effective in the 2027 tax year" sentence |
| **BL** | `06) Offer/Keystone Deal – Bottom Line on Series A Impact & Company Burden: … (AMB, 2026-09-24).docx` (6 pp.) | 2 | "1. The short answer"; "Structure \| Fundraising friction \| Why, in one line"; one-time transaction cost ranges |
| **BENP** | `06) Offer/_Archive/Keystone Offer Review – Ben's Perspective & Recommended Fixes (AMB, 2026-09-23).docx` | 2 | Seller-note terms; "12–15 month survival"; "consider a small R&W policy" |
| **EQM** | `07) Equity Structure/Topkey Equity Structure Memo - Ben's Consideration Shares (AMB, 09.25.2026).docx` | 2 | Italic 10 pt preparer line variant; escrow tax timing |
| **CHK** | `Keystone_Deal_Checklist_and_Timeline.xlsx` (tabs `Read Me`, `Milestones`, `Pre-LOI Checklist`, `Post-LOI Checklist`, `Timeline`) | 3 | Milestone and timeline convention; the "Prepared by" line in a workbook |
| **POSTX** | `Keystone Deal – Post-LOI Checklist & Timeline (Oct 19, 2026 → Dec 18 signing → Jan 2, 2027 effective).xlsx` | 3 | Flat export of the Post-LOI tab; the file name states the convention |
| **ICP5 / ICP1 / WU / VAL** | already in the source key | 1 / TCC lineage | Seller-note, earnout and cash-at-close precedent; Deal Term table; process table |

---

## 3. Deal Structure defaults: what AMB does

### 3.1 Headline valuation wording (model and ICP only; never in the CIM)

- OFF14 term table, row 1: **"Total Valuation | $3,000,000 (1.0x run-rate recurring revenue)"**. The figure is bold and the basis is in parentheses, regular weight.
- LOI12 footnote under the summary table (italic 8 pt): "Note: “Total Valuation” of $3.0 million is based on a multiple of 1.0x applied to Keystone’s run-rate recurring revenue (“Pro Forma” or “PF”). Pro forma LTM [September] 2026 recurring revenue is approximately $3.0 million."
- EBITDA cross-check, PB06 "INTERNAL" box: "At $500K of adjusted EBITDA: 1.0x revenue = $3.0M = 6.0x EBITDA. A fair market price, not a steal." The same box gives the concession ladder: "1.25x = $3.75M = 7.5x. Top of the range for a service business this size." and "1.50x = $4.5M = 9.0x. Not defensible …".
- Component pattern, used by OUTL, Offer v2–v12 and ICP5: **`$amount (x% of valuation)`**. Examples: "Cash at close: $500,000 (17% of valuation)"; "Topkey Equity: $2,500,000 (83% of valuation)"; ICP5 "Cash at Close | $21M (80% of valuation)"; "Seller Note | $5M, 18-month term, quarterly payments, 9.0% interest (20% of valuation)".

### 3.2 Cash at close

| Precedent | Cash at close | Structure | Source |
|---|---|---|---|
| AMB statement of the norm | "Typical accounting deals are structured 70% to 80% cash up front" | "Tradional [sic] Valuation Structure … 20% - 30% earn-out for any future growth/opex savings" | MISC |
| EBO (AMB sell-side ICP) | **80%** ($21M of $26M) | + 20% seller note, no earnout | ICP5 |
| CPM pre-LOI (Frank, Mar 2025) | 85% ($17M of $20M) | + 15% seller note + EBITDA earnout | WU PreLOI-CPM |
| CPM diligence | 84% ($21.8M of $26.0M) | + note + retention earnout + EBITDA earnout | WU Dil-CPM |
| HOACS | 80–83% | + 20% note + earnout | WU PreLOI-/Dil-HOACS |
| Keystone buyout | 17% ($500K of $3.0M) | + 83% buyer stock | OUTL, Offer v12, PB06 |
| Keystone partnership | 31% of the price for 70% ($650K of $2.1M) | + 69% buyer stock; seller keeps 30% | OFF14, LOI12 |

**Default: 80%.** The 17% figure is a function of 83% buyer stock. It is valid only in a stock-consideration preset. PB06 gives the sizing heuristic that applies there: "Tereno’s benchmark: three times take-home is the market sweet spot. At ~$230K that is ~$690K." Its concession guidance: "Realistic landing zone: $500K to $600K. There is room to move, but move slowly and take something for it."

### 3.3 Indemnity escrow and indemnity package

- LOI12 "Representations, warranties & indemnification" (highlighted brackets as in the source): "Indemnification for breaches of general representations will be capped at [10]% of the price for the Acquired Interest, subject to a deductible of [0.75]% of that price and a survival period of [15] months. Fundamental and tax representations survive until [60 days after the applicable statute of limitations] and are capped at the price for the Acquired Interest. **An escrow of 10% of the cash consideration ($65,000) will be funded at closing and held for [15] months.** Claims will be satisfied first from the escrow and then, at Topkey’s election, by set-off against the Topkey shares issued at closing, valued at the Reference Valuation. The definitive agreements will also include a special indemnity for pre-closing offshore contractor classification matters[, capped at [●]]."
- LOI v10 (the earlier wording): "including an escrow of 10% of the cash consideration ($50,000) funded at closing and held over an indemnity period of [X] months."
- OFF14 row "Cash at Close": "$650,000 (31% of the price for the 70% interest), with 10% ($65,000) held in escrow". Offer v12: "with 10% ($50,000) held in escrow at closing".
- RECS #9 rationale: "A 10%-of-cash escrow ($50–65K) is too small to matter on its own; the set-off against shares is what actually protects Topkey and is normal when most of the price is stock. Naming cap/basket/survival now prevents the standard PA fight."
- BENP: "cap at 10% of purchase price; 0.75% basket; 12–15 month survival for general reps; consider a small R&W policy."
- CHK / POSTX task POST-27: "Escrow agreement and agent | $65K escrow, 15-month term". POST-15: "Reps, indemnity (10% cap, 0.75% basket, 15 months), escrow, set-off".
- Market check (advisor text in TAX): "Market is 5-10% for 12-18 months."
- Tax timing (EQM): "The $65,000 escrow is generally taxed when released (installment treatment), not at close; confirm the election."

### 3.4 Retention holdback (a different instrument from the escrow)

- KON (internal): "I think we can give on the incremental $750K (25% offer increase) if we can structure this as an **18-month holdback to offset customer retention / employee retention risk**".
- PB06 (final wording): "Concession path: the incremental $750K is available only if structured as an 18-month holdback against customer and employee retention. Do not offer it on the first call."
- MISC "Holdback component": "Based around targeting a net amount of client revenue after a two-year period (could be negotiated to 18 months)" · "$500K - $750K holdback (the top 10 - top 20 client revenue)" · "This could be additional equity issued two years from now". The structure sketch reads "Subject to (20% holdback)".
- OPP3 (already a source): "Client concentration would normally call for a contingent holdback (for example, $500K released over 12–24 months)."
- TAX (advisor terms AMB kept on file): "Measurement. Revenue-based, not logo-based … trailing twelve months at the test date is standard … name the clients on a schedule"; "Two tranches. 50% released at 12 months, 50% at 24 months"; "Share count, not value"; carve-outs for buyer-caused losses; "So your total holdback picture might be 10% retention plus 7.5% indemnity, not a single 30% bucket."
- The final Keystone documents (OFF14, LOI12) carry **no** retention holdback. PB06 keeps it unresolved: "Do not answer live. Say we will come back with specifics once the holdback mechanics are settled."
- A Main Street analogue that AMB authored: ICP5 "Seller Note Contingencies | $1M reduction in seller note if Brentwood, Raintree, or Westport terminate service". Here a customer-retention contingency sits on the seller note instead of a holdback.

### 3.5 Earnout

**Form A: revenue, sliding scale** (VAL `100% Buyout Analysis` rows 42–58; block header "Cash Earnout — Year 3 Keystone Revenue (Sliding Scale)" on `FFE1E1`):

| Row label (verbatim) | Value | Format / font |
|---|---|---|
| Earnout Measurement Year | 3 | blue input |
| Keystone Revenue at Close | link | purple |
| Year 3 Run-Rate Revenue Target | formula | black |
| (x) Achievement vs. Target | 100% | blue |
| Threshold — % of Target | 80% | blue |
| Target Earnout — at 100% of Target | 500 ($000s) | blue; note "Opening ask: $500K at target (AMB internal range $750K–$1M)" |
| Payout at Threshold — % of Target Earnout | 50% | blue |
| Cap — % of Target Earnout | 150% | blue |
| Payout % Earned | `=IF(C46<C48,0,MIN(C51,C50+(1-C50)*(C46-C48)/(1-C48)))` | black |
| Maximum Earnout (Cap) | `=C49*C51` | black |
| Run-Rate Window — Months Averaged | 3 | blue |
| Cash Earnout Payable — Year 3 | `=C49*C52` | bold, `FFFFCC` |
| Probability of Achievement | 70% | blue, "AMB estimate for the memo line below" |
| Discount Rate | 15.0% | blue |
| Risk-Weighted Earnout — PV at Close (Memo) | `=C55*C56/(1+C57)^C43` | "Memo only; not used in Scenario 2" |

The drafted clause (RECS §4 #2): "Contingent consideration of up to $500,000 (target), payable within 90 days after the third anniversary of closing, based on Keystone's run-rate recurring revenue for the three months ending on that anniversary against a target of $5.33 million: 50% of the target amount at 80% achievement, scaling linearly to 100% at target and to a maximum of $750,000 at 150% of target; payable in cash or Topkey shares valued at the then-most-recent priced round or 409A, at Topkey's election."

**Form B: multiple of incremental EBITDA above a hurdle** (TCC lineage, WU): "2026 earnout paying 8.0x any incremental EBITDA above $1.0M which is 10% growth p.a. from the current PF EBITDA" (HOACS, headline 7.0x). "2026 earnout paying 10x any incremental EBITDA above $2.7M which is 10% growth p.a." (CPM pre-LOI, headline ~10x). "2026 earnout paying 12x any incremental 2026 EBITDA above $3.0M" (CPM diligence, headline 11.2x). The earnout multiple is at or up to 1.0x above the headline multiple, and the hurdle is 10% annual growth.

**Form C: retention earnout** (WU Dil-CPM): "$2.4M Retention Earnout tied to Bob and Jane remaining with the business for 18 months".

**When AMB drops it.** OR3 §6 "Earnout – Decision Confirmed": "Removing the earnout is the right call for this structure. Ben's 30% already pays him for growth, an earnout would have paid him twice for the same revenue …". BL §7: "Keep the partnership … avoids an earnout". ICP5: "Earnout (if applicable) | None". AMB's sell-side default is therefore **no earnout**.

### 3.6 Seller note (Q16 said "only SUN's one-off financing terms exist")

| Precedent | Size | Term | Rate | Payments | Other | Source |
|---|---|---|---|---|---|---|
| EBO, AMB sell-side | 20% of valuation | 18 months | 9.0% | quarterly | "$1M reduction in seller note if [named clients] terminate service" | ICP5 |
| ICP template | "[X]-year term, [X]% interest, [quarterly/monthly] payments" | | | | | ICP1 |
| CPM pre-LOI | 15% | 2 years | 6.5% cash | interest quarterly, principal at maturity | | WU |
| CPM diligence | $4.3M of $26.0M (16.5%) | 18 months | 6.5% | quarterly interest and principal | | WU |
| HOACS pre-LOI | 20% | 3 years | 6.5% | principal amortizes evenly; quarterly interest | seller's tax preference: "receive a significant portion of proceeds over a longer period of time" | WU |
| HOACS diligence | $1.2M of $6.8M (17.6%) | 2 years | 6.5% | quarterly interest and principal | | WU |
| Keystone fix | $500K–$750K (17–25%) | 3–4 years | 7–8% | from target cash flow | "subordinated to senior debt only" | BENP |

Guardrail: TAX, "Avoid a seller note [in a tax-deferred reorganization]. A note is boot in a reorg, it counts against the 20% ceiling …". This belongs in followup-1's structure flag.

### 3.7 Other structure terms with AMB precedent

- **Exclusivity** (LOI12 Agreement §1): "for [90] days from the date of this Letter … the exclusivity period will automatically extend once, for a single additional [30]-day period, after which it expires." OR2 #18: "Exclusivity 90 + 30 days | Acceptable; slightly long for an 11-week process."
- **Non-compete** (LOI12 §7(g)): "Customary non-compete and non-solicitation of clients and employees for 3 years from closing or 12 months after Ben’s employment ends, whichever is later, capped at 5 years from closing in total."
- **Seller stay-on** (ICP5): "Seller Stay-On Agreement | One-year, full-time, $150K compensation"; "Employment Agreements | Likely with three Regional Managers".
- **Buyer's one-time costs** (BL §4.1, for a $3.0M deal): "Purchase agreement and closing documents | $60–120K"; "Securities work … | $10–20K"; "Tax structuring … | $20–40K"; "Quality of earnings / financial diligence | $15–40K"; "Purchase price allocation valuation + 409A refresh | $15–30K"; "Financing costs | … Debt fees 1–3% ($25–75K)"; "Approximate total | $145–300K | $120–250K | $110–260K plus financing".
- **Not in the library:** SBA 7(a) terms (only ICP1's placeholders "SBA 7(a) eligibility: …", "Equity required at close: [Estimated based on [X]% down with SBA …]", and SUN's one-off financing) and AMB's success-fee schedule. A full-text search for "success fee", "Lehman", "retainer" and "commission of" returns nothing. These two stay open in Q16.

---

## 4. Timeline convention (S10.2 and the model)

### 4.1 The three-date spine, verbatim

| Source | LOI | Diligence and documents | Signing | Effective date |
|---|---|---|---|---|
| OUTL (numbered list under "Timeline & Next Steps") | "September 30th - sign LOI" | (inside the signing line) | "December 18th - sign closing documents and fund escrow account (11 week process)" | "December 31st - effective closing date" |
| LOI0–LOI10, Offer v2 (table "6. Timeline & Next Steps") | "September 30, 2026 \| Sign LOI" | "October – mid-December \| Confirmatory diligence, definitive agreements, and integration planning (11-week process)" | "December 18, 2026 \| Sign closing documents and fund the escrow account" | "December 31, 2026 \| Effective closing date" |
| LOI12 §10 "Timeline: Our proposed path to closing is as follows:" | "[October ●, 2026] \| Sign LOI" | "[October] – mid-December \| Confirmatory diligence, definitive agreements (including the Operating Agreement, Services Schedule and Migration Protocol), and integration planning" | "[December 18, 2026] \| Sign closing documents and fund the escrow account" | "[January 2, 2027] \| Effective closing date" |
| OFF14 row "Target Timing" | | | "Sign closing documents [December 18, 2026]" | "effective closing date [January 2, 2027]" |
| CHK `Read Me` "Targets" | "LOI signed \| Friday, October 16, 2026" | | "Signing and escrow funding \| Friday, December 18, 2026" | "Effective date \| Saturday, January 2, 2027 (wires Monday, January 4)" |
| POSTX file name | "Oct 19, 2026" (post-LOI start) | | "Dec 18 signing" | "Jan 2, 2027 effective" |

**Why the effective date moved.** RECS #8: "Sign and fund escrow December 18; effective date January 2, 2027. Add to the tax section: **"The parties intend the transaction to be effective in the 2027 tax year."**" Rationale: "Moves Ben's entire closing gain into 2027; federal tax not due until April 2028 … This is the cheapest liquidity lever in the deal and costs Topkey nothing." OR3 §7.5 lever 1 says the same: "Sign December 18 as planned; fund and close January 2." FTM covers the mechanics: "the certificate of merger must be filed … with the effective time specified … Most states cap how far out a delayed effective time can be set — commonly 90 days — and offices close for the holidays, so file with buffer." CHK POST-32 adds the business-day catch: "Jan 2, 2027 is a Saturday – confirm effective time with tax counsel".

**Durations.** Sep 30 to Dec 18 is 79 days (the "11-week process"). Once the LOI slipped to Oct 16, LOI to signing became 63 days (9 weeks), and the LOI12 table drops the "(11-week process)" label. Signing to effective date is 13 days (Dec 31) or 15 days (Jan 2), with wires on the next business day. Exclusivity runs 90 days from Oct 16, to Jan 14, 2027 (CHK Milestones: "Exclusivity expiry (before extension) | … | Closing must occur first"). The pre-LOI checklist runs Sep 25 to Oct 16 (3 weeks, 27 tasks). The post-LOI checklist runs Oct 19 to Jan 2 plus post-close tasks to Apr 15, 2027 (41 tasks).

### 4.2 CHK layout (structure to reuse; styling not AMB)

- **Tab order:** `Read Me`, `Milestones`, `Pre-LOI Checklist`, `Post-LOI Checklist`, `Timeline`.
- **Read Me:** A1 "Keystone Partnership – Deal Checklist and Timeline" (Arial 14 bold `1F3864`). A2 "Prepared by AMB Advisory Services LLC for Jon Sukhia / Topkey | September 24, 2026 | Confidential" (Arial 9 italic). Blocks follow: "Targets", "How to use", "Priority" ("P1 - Critical | On the critical path or a deal-breaker if missed"), "Difficulty", "People", "Sources". Widths A 26, B 95.
- **Milestones** (freeze A5; widths A 44, B 20, C 14, D 12, E 10, F 48): header row 4 is `Milestone | Target date | Days remaining | Linked task | Owner | Gate / what must be true`. There are 17 rows. Dates use number format `ddd", "mmm\ d", "yyyy` ("Fri, Oct 16, 2026"). Days remaining is `=B5-TODAY()`. The three anchor rows are **bold**: "LOI signed", "SIGNING and escrow funded", "EFFECTIVE DATE". Their gate text reads: "Exclusivity starts (90 days)", "All P1 pre-signing tasks Done", "Wires Monday Jan 4". A "Status summary" block below uses COUNTIF on the checklists: Not started, In progress, Done, Blocked, At risk, Total tasks, "% complete", "P1 open (not Done)", "Overdue (past due, not Done)".
- **Checklists** (freeze D5; 16 columns): `ID | Workstream | Task | Detail / deliverable | Priority | Difficulty | Owner | Support | Start | Due | Duration (days) | Days to due | Depends on | Critical path | Status | Notes / source`. IDs run `PRE-01…PRE-27` and `POST-01…POST-41`, with milestone tasks under workstream "Milestone". Validations: Status "Not started, In progress, Done, Blocked, At risk"; Priority "P1 - Critical, P2 - High, P3 - Medium"; Critical path "Y, N".
- **Timeline** (freeze H5): weekly columns H4:AK4, Mondays from Sep 21, 2026 to Apr 12, 2027. Headers are rotated 90° in `mmm\ d`, width 3.6. Bars are text glyphs: `=IF(AND($E6<=H$4+6,$F6>=H$4),IF($E6=$F6,"◆","■"),"")`. Conditional fills: `C00000` P1, `ED7D31` P2, `70AD47` P3, `A9D08E` Done. The three anchor weeks (Oct 12, Dec 14, Dec 28) have `C00000` header fills ("Red columns: LOI signing (Oct 16), signing (Dec 18), effective date (Jan 2)"). Section rows "PRE-LOI" and "POST-LOI" sit on `D9E1F2`.

---

## 5. Transaction-overview wording (S10.1): AMB vocabulary and sell-side conversions

AMB's non-price term labels, verbatim: **ICP1/ICP5 "Deal Overview › Transaction Summary"** has `Deal Term | Details` with rows *Asking Price, Valuation Multiple, Cash at Close, Seller Note (if applicable), Seller Note Contingencies, Earnout (if applicable), Non-Compete, Seller Stay-On Agreement, Employment Agreements, Working Capital, Asset vs. Stock Sale, Target Close Date*. ICP5 follows it with an H2 **"Reason for Sale"**. **OFF14** rows: *Total Valuation, Interest Acquired, Cash at Close, Topkey Equity, Ben’s Retained Interest, Balance Sheet, Tax Matters, Target Timing*. OFF14 sections: *Valuation & Consideration; Ben’s Role & Compensation; Topkey Equity Terms; Ben’s Retained 30%; Operating Decisions; What Changes After Closing*. **ICP1 "Financing Considerations"**: "Seller financing: [Seller is / is not willing to carry a note of up to [X]% of purchase price]".

Converted for the CIM. Price rows are dropped under D5. The rows are a two-column text table with the label column filled `F2EEE9` as in OFF14, or the guide's `tint`:

| Label | CIM text (template) | Adapted from |
|---|---|---|
| What is offered | "100% of the membership interests of [Company] LLC." / "Substantially all of the operating assets of [Company], free and clear of liens." | LOI12 §1 "Topkey will acquire 70% of the membership interests of Keystone (the “Acquired Interest”)"; ICP5 "Asset vs. Stock Sale \| Asset sale" |
| Basis of offers | "Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close." | OFF14 "Balance Sheet \| Cash-free, debt-free, with a normalized level of working capital delivered at close" (followup-1 §5.4) |
| Reason for sale | "The owners, [A] and [B] ([x]% each), plan to retire after a transition period." | ICP5 "The two majority owners, Bob and Jane (47.5% each), would like to retire and transition out of the company after a year of transition support." |
| Owner transition | "[Owner] will remain full time for [12] months after closing to transfer customer relationships." | ICP5 "Seller Stay-On Agreement \| One-year, full-time, $150K compensation" (compensation omitted in the CIM) |
| Key employees | "[Three regional managers] are expected to sign employment agreements." | ICP5 "Employment Agreements \| Likely with three Regional Managers" |
| Real estate | "[The Seller owns the premises and will offer the Buyer a lease on market terms.]" | New (no AMB precedent in these folders) |
| Seller financing (optional; Frank's call) | "The Seller will consider carrying a note of up to [20]% of the purchase price." | ICP1 "Financing Considerations" |
| Target timing | "The Seller is targeting signing in [December 2026] and an effective date of [January 2, 2027]." | OFF14 "Target Timing \| Sign closing documents [December 18, 2026]; effective closing date [January 2, 2027]" |
| Tax | "Each party will rely on its own tax advisors." | OFF14 "Tax Matters \| Structure to be confirmed with jointly engaged tax counsel; each party relies on its own tax advisors" |

The opening sentence follows the fact-order rule (4.3), for example: "[Owner] is offering 100% of [Company] LLC. Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close. [Owner] will remain full time for 12 months after closing." Close the section with ICP1's contact line.

---

## 6. Memo furniture (Sept-2026) and AMB's branded Word conventions

### 6.1 The preparer line (AMB's most consistent document furniture: 11 files)

| File | Line (verbatim) | Format |
|---|---|---|
| OR3 | "Prepared by AMB Advisory Services LLC for Jon / Topkey  \|  September 24, 2026  \|  Supersedes v2 (retained in this folder). Inputs: …" | Arial 10 pt `555555`; double spaces round the bars |
| OR3 (line 3) | "Confidential – internal working draft. Tax figures are structuring estimates, not tax advice; they must be confirmed by federal and New Hampshire tax counsel before being relied on or shared with Ben." | 10 pt `555555`, 19.5 pt after |
| BL, OSC, DRR, Options v2 | "Prepared by AMB Advisory Services LLC for Jon Sukhia / Topkey \| September 24, 2026 \| Confidential – internal to Topkey and its advisors; not for Ben or Keystone." | body default (Arial 11, black); the next line is 9 pt `444444` |
| RECS | "Prepared by AMB Advisory Services LLC for Jon Sukhia / Topkey \| September 24, 2026 \| Confidential – internal working draft, not for Ben or Keystone." | body default |
| EQM | "Prepared by AMB Advisory Services for the Keystone / Topkey partnership. Working draft dated September 25, 2026. Sources: …" | Arial 10 pt italic |
| CHK `Read Me`!A2 | "Prepared by AMB Advisory Services LLC for Jon Sukhia / Topkey \| September 24, 2026 \| Confidential" | Arial 9 italic |

**Canonical form:** `Prepared by AMB Advisory Services LLC for <client> | <Month D, YYYY> | Confidential[ – <audience limit>]`, set 9–10 pt grey `555555` or `444444` under the title. A source or caveat line may follow at 9 pt `444444`, for example BL: "Figures come from the scenario model, the Sept 17 CFO sync with Josh (…), and the companion reports in this folder. Cost ranges are typical for a deal of this size and must be confirmed with Corey, Josh and tax counsel. This is structuring analysis, not legal, tax or accounting advice."

**Closing line** (last paragraph, 9 pt `444444` or 10 pt `555555`): "Prepared by AMB Advisory Services LLC. Structuring analysis only. Cost ranges are indicative; runway figures use the Sept 17 estimates and assume no revenue growth." (BL). "Prepared by AMB Advisory Services LLC. Drafting guidance only; not legal or tax advice. Final language to be prepared by Topkey's counsel and confirmed by tax counsel." (RECS). "Prepared by AMB Advisory Services LLC. This report is deal-structuring analysis and does not constitute legal or tax advice. All tax figures are estimates on stated assumptions and must be confirmed by qualified federal and New Hampshire tax counsel and the parties' CPAs." (OR3).

### 6.2 Memo skeleton

- **Title** (H1): "Keystone Bookkeepers – Topkey Offer Review v3" (OR3: 20 pt bold, `222222`). "Keystone Deal – The Bottom Line on Fundraising Impact and Company Burden" (BL: 17 pt bold). A bold 11 pt subtitle follows: "Partnership 70/30 vs. 100% for Topkey equity vs. 100% all-cash".
- **Numbered H2s:** "1. Executive Summary" (OR3, OR2, BENP), "1. The short answer" (BL), "1. Summary" (RECS), "1. Fully diluted cap table today, after SAFE conversion" (EQM). H3s are decimal: "4.1 For Jon / Topkey", "7.5 Covering the closing bill with $650K". Sizes: BL H2 13 pt bold black; RECS H2 14 pt; OR3 H2 15 pt bold **navy `1A3C6E`** (off-brand); PB04 16 pt regular (Docs default).
- **Answer-first bold lead-ins** (run-in, bold sentence then regular text): "**The deal on the table.** Topkey buys 70% of Keystone for $2.1M – …"; "**Can Ben pay the closing tax with $650K?** Yes, if two things happen."; "**This deal will not break a Series A, in any of the three structures.**"; "**The one effect that is not optional: runway.**"; "**Retention matters more than it looks.**" These are good 4.3 examples for any ICP or Word companion.
- **Comparison tables** (header fill `E8EDF3` in BL and RECS, `E8EEF7` in OR3, `E8E8E8` in EQM; 9–10 pt; no bold header): BL `Structure | Fundraising friction | Why, in one line` (the first cell bold: "**Partnership 70/30** (current proposal) | Moderate – manageable if the operating agreement is drafted as in LOI v12 | A minority holder below the cap table and a future put/call claim; least dilution and least cash."). Also RECS `# | Current text (LOI v10 / Offer v12) | Recommended change | Why | Where`, OR3 `Item | v2 | v3`, OR3 `# | Question | Why it matters`, OR3 `# | Lever | How it works | Effect`, BL `Diligence topic | Partnership 70/30 | 100% for equity | 100% all-cash`, RECS checklist `✓ | Item | Owner`.

### 6.3 Frank's Word furniture (tier 1 via Offer v9; OFF14 carries the same values; use these when AMB brand is applied to a Word document)

- **OFF14 page:** Letter, margins L/R 0.75 in, T/B 0.69 in. Body Calibri 11 (docDefaults `sz 22`), text `1A1A1A`.
- **OFF14 running header:** "Topkey + Keystone – Partnership Offer", 20 pt bold `7A0000`, centred, with a 2.25 pt (`sz 18`) bottom rule in `9A0033`, 4 pt space, 2 pt after.
- **OFF14 footer:** "Confidential | Non-Binding Draft" at left and "Page N" at a right tab at 7.0 in, both 8 pt `595959`.
- **OFF14 headings:** H1 14 pt bold `7A0000`, 11 pt before and 5 pt after, keep with next. H2 11.5 pt bold `9A0033`, 7 pt before and 3.5 pt after.
- **OFF14 term tables:** 7.0 in wide (10,080 dxa). Label column 1.94 in (2,800), value column 5.06 in (7,280). 0.5 pt `D8D0C6` borders. Label cells filled `F2EEE9`, bold `1A1A1A`. Cell margins 0.056 in top and bottom (80 dxa) and 0.083 in left and right (120 dxa); 1 pt after; rows do not split. The key figure opens the value cell in bold: "**$650,000** (31% of the price …)". Open points are yellow-highlighted brackets.
- **OFF14 matrix table:** the "Ben Keeps Control Of / Requires Topkey Approval / Requires Approval of Both Members" header is filled `7A0000`, white bold, with bulleted cells.
- **LOI12:** a band on every page, "CONFIDENTIAL  —  LETTER OF INTENT", white bold on `9A0033`, centred, 12 pt after. Section heads 12 pt bold underlined `7A0000` ("A summary of the offer", "The nuts and bolts of the offer", "Agreement and Signature"). Body Calibri 10 pt `1A1A1A`, justified, line 1.1, 8 pt after. Numbered "1) … 10)" sections with bold run-in labels. Summary table header `7A0000` white bold; the subtotal row "Total for 70% interest" on `F2EEE9`. Closing disclaimer 8 pt italic `595959`: "This Letter is a non-binding expression of interest for discussion purposes only …".
- **PB06 (generated, AMB-branded):** Times New Roman 11, `1A1A1A`, line 1.1. Section heads 14 pt bold `7A0000` with a grey rule; sub-heads 12 pt bold `9A0033`; "We say" 10.5 pt bold `7A0000`. Table header `7A0000` with white bold 10.5 pt text; body rows `F2EEE9`. Internal boxes on `F2EEE9` are headed "INTERNAL — not for the call" (10 pt bold `7A0000`). Header "Topkey + Keystone — Offer Negotiation Playbook"; footer "Confidential | Internal — AMB Advisory Services	Page N".
- **Restyle evidence (OFFARC):** Offer v2/v3 (Frank in Word) used H1 `1F3A5F` 14 pt, H2 `2E75B6`, label fill `EAF1F8` and header `1F3A5F`. Offer v7/v8 (generated, 21 Sep 16:47 and 17:51) introduced H1 `7A0000`, H2 `9A0033`, `F2EEE9` and a `7A0000` header. Offer v9 (Frank in Word, all 71 paragraphs) kept them. OUTL (Google Docs) uses Times New Roman 15 pt bold `980000` headings (the Docs palette "red berry").

---

## 7. What is weak and should be elevated

1. **Earnout slope ambiguity.** VAL's single-slope formula caps at 150% payout when achievement reaches **120%** of target (0.8 + (1.5 − 0.5) × 0.2 ÷ 0.5). RECS's drafted clause puts the $750K maximum "at 150% of target". The model must state the slope, and the default note must read like VAL F51: "Payout capped at 150% of target earnout, reached at 120% of target revenue".
2. **Figures drift between documents.** Escrow is "$50,000" in LOI v10 and Offer v12 but "$65,000" in LOI12 and OFF14 (OR3 #2: "the LOI currently hard-codes $50,000"). The split is "17% / 83%" against "31% / 69%". Topkey is $50M against $60M, EBITDA $600K against $500K, LOI date Sep 30 against Oct 16, and the effective date Dec 31 against Jan 2. RECS's own checklist asks that "LOI, Offer one-pager and the model tab Ben may see all match (price, cash, stock, earnout or none, escrow, dates)". The bot should produce every deal-term string from one set of named cells. Escrow is `=EscrowPct*CashAtClose`, never typed.
3. **Brackets left in.** "[X] months" survived to LOI v10. The Deal Structure tab should refuse an empty term (red check) rather than print a bracket.
4. **The escrow is sized on cash, not price.** At 17% cash that is 1.7% of the price, which RECS calls "too small to matter on its own". For all-cash or 80%-cash deals, 10% of cash lands at 8–10% of price, inside TAX's "5-10%" market range. Keep AMB's basis, and show `Escrow % of price` as a derived line with an info flag below 5%.
5. **Holdback mechanics were never settled.** AMB has the ingredients (18 months, top-10–20 revenue, revenue-based test, named schedule, carve-outs, tranches) but no single spec. Section 8.1 gives one.
6. **AI tells in the Docs memos. Do not copy them into any deliverable:** OR3's text-glyph scorecard bars ("█████▌░░░░ 55%" in Courier, green `2E7D32` or amber `C77700`); navy `1A3C6E` headings; blue-grey `E8EDF3` / `E8EEF7` header fills with unbolded headers; a "✓" column; "Arial Unicode MS" fallback runs; OUTL's duplicated "Valuation" and "Structure" blocks.
7. **CHK styling is Office-default, not AMB.** It uses a navy `1F3864` header, Office CF colours `C00000` / `ED7D31` / `70AD47` (all retired in 1.2), hard-coded ranges (`O5:O31`, which the guide's 5.5 rule forbids), a volatile `TODAY()` and glyph Gantt bars. Reuse its **structure** (three-date spine, bold anchor rows, gate column, critical-path flag, days remaining). Do not reuse its look.
8. **The effective date is a tax decision stated as a date.** Make it a rule, "first business day of the next tax year when signing falls within [30] days of year-end", with the RECS sentence as the note, and add a business-day check.

---

## 8. Drop-in text for HOUSE_STYLE.md

### 8.1 Section 5.5: replace the "Inputs:" bullet under "Deal Structure: one engine"

> - **Presets** (`StructurePreset` on `Assumptions`): `Traditional` (default: cash + seller note), `Cash + earnout`, `Stock consideration` (buyer shares; turns on followup-1's tax flag), `All cash`. A preset only fills defaults; every cell stays a blue input with a `Source` note.
>
> | Input | Default | Notes column text (printed) | Source |
> |---|---|---|---|
> | Purchase price | Valuation Mid (link) | "Total Valuation: $X (n.nx [basis])" | OFF14, OUTL |
> | Cash at close | **80%** of price (`Stock consideration`: 17–31%, sized by "three times take-home") | "$X (80% of valuation)" | MISC "Typical accounting deals are structured 70% to 80% cash up front"; ICP5; WU; PB06 |
> | Seller note | **20%** of price, **18-month** term, **9.0%**, interest and principal paid **quarterly**, subordinated to senior debt | "$X, 18-month term, quarterly payments, 9.0% interest (20% of valuation)" | ICP5; BENP. TCC buy-side used 6.5% (WU); note it as the low case |
> | Seller-note contingency | Off. When on: $ reduction if named customers terminate | "$X reduction in seller note if [C-003, C-007, C-012] terminate service" | ICP5 |
> | Earnout | **None** | "Earnout (if applicable): None" | ICP5; OR3 §6; BL §7 |
> | Earnout (when on), revenue form | Measurement Year 3; run-rate = average of the last 3 months × 12; threshold 80% of target pays 50%; linear to 100% at target; cap 150% of target earnout, **reached at 120% of target revenue**; payable within 90 days after the third anniversary; probability 70% and discount 15% for the memo PV only | VAL F-column notes, verbatim | VAL rows 42–58; RECS §4 #2 |
> | Earnout (when on), EBITDA form | Pays (headline multiple + 1.0x) × EBITDA above a hurdle of 10% annual growth on PF Adj. EBITDA | "FY[yyyy] earnout paying 8.0x any incremental EBITDA above $X (10% hurdle)" | WU HOACS, CPM |
> | Indemnity escrow | **10% of cash at close**, funded at closing, held **15 months**; derived line `Escrow % of price`, info flag below 5% | "An escrow of 10% of the cash consideration ($X) will be funded at closing and held for 15 months." | LOI12 §7(h); CHK POST-27; TAX "Market is 5-10% for 12-18 months" |
> | Indemnity package (text inputs) | Cap 10% of price; deductible 0.75% of price; general survival 15 months; fundamental and tax reps to 60 days after the statute of limitations, capped at price; claims from escrow first, then set-off against the seller note (or buyer shares) | LOI12 wording | LOI12; RECS #9; OR3 #11; BENP |
> | Retention holdback | **0** (off). When on: 18 months; against customer and employee retention; size = LTM revenue of the top 10–20 customers (or the price increment it buys); revenue-based test (TTM at the test date) against a named, coded customer schedule; carve-outs for buyer-caused losses; release in one tranche at 18 months, option 50% at 12 and 50% at 24 | "18-month holdback against customer and employee retention" | KON; PB06; MISC; OPP3; TAX |
> | Reconciliation holdback | followup-1 §5.2 | | ICP5 |
> | Exclusivity | 90 days + one automatic 30-day extension | | LOI12 Agreement §1 |
> | Target timing | `LOIDate`; `SigningDate` = LOI + 9–11 weeks; `EffectiveDate` = signing + 0–15 days (tax-year rule, 4.1); `ExclusivityDays` 90 | "Sign closing documents [date]; effective closing date [date]" | OUTL; LOI12; OFF14; CHK |
> | Buyer transaction fees (Uses) | Blue input, no default; reference range printed in the note | "Buyer one-time costs on a $3.0M deal: ~$110–300K (BL)" | BL §4.1 |
>
> - **Structure summary block** (top of `Deal Structure`, internal): the OFF14 two-column term table, with labels `Total Valuation | Cash at Close | Seller Note | Seller Note Contingencies | Earnout (if applicable) | Escrow | Retention Holdback | Balance Sheet | Working Capital | Asset vs. Stock Sale | Target Timing`. Each value is a formula-built string in the `$X (y% of valuation)` pattern (Keep: OFF14, ICP5). Label cells are `F2EEE9` bold (OFF14) or `tint`.
> - **Checks (add to 5.7):** `EffectiveDate <= LOIDate + ExclusivityDays` (CHK: "Closing must occur first"); `EffectiveDate` is a business day, else the info flag "effective date falls on a weekend: confirm effective time with tax counsel; wires next business day" (CHK POST-32); every term string non-empty (no "[X]").

### 8.2 Q16: replace the row

> | Q16 | **Deal Structure defaults** (AMB precedent sets most; confirm the rest): (a) confirm the 80 / 20 cash and seller-note default and 9.0% (ICP5) versus 6.5% (TCC buy-side); (b) SBA 7(a) terms (term, rate, equity injection); (c) AMB's success-fee schedule for the proceeds waterfall; (d) when is a retention holdback the right tool versus a seller-note contingency? | Cash at close 80%; seller note 20%, 18 months, 9.0%, quarterly payments, subordinated; no earnout; escrow 10% of cash at close for 15 months; indemnity cap 10%, basket 0.75%, survival 15 months; retention holdback off (18 months when on); exclusivity 90 + 30 days [ICP5, MISC, LOI12, RECS, OR3, KON, PB06, VAL]. SBA terms and the success fee stay blank and flagged. | No file in the library gives SBA terms or a fee schedule; Keystone's 17% cash is a stock-consideration case |

### 8.3 S10.1 and S10.2: replace the rows

> | S10.1 | Transaction overview | L4: one fact-order paragraph, then a two-column term table (label cells `tint`) with the non-price labels of 5 in followup-2: What is offered · Basis of offers · Reason for sale · Owner transition · Key employees · Real estate · Seller financing (optional, Q16d) · Target timing · Tax ("Each party will rely on its own tax advisors."). No valuation, multiple, cash-at-close or earnout rows (D5) | Notes, `entity_type`, `DealForm`, stay-on terms, timing inputs |
> | S10.2 | Process and next steps, contact | ICP1's eight stages, verbatim names, `# \| Stage \| What happens \| Target timing`. Stages 6–8 use AMB's post-LOI wording: 6 Due Diligence "Confirmatory diligence, definitive agreements and transition planning (about [9–11] weeks from LOI)"; 7 Purchase Agreement "Sign the definitive Purchase Agreement and fund the escrow account"; 8 Close & Transition "Effective closing date [set with tax counsel]; Seller begins the agreed transition period". Timing column: dates or week offsets from the model's timing inputs; the three anchor rows (LOI, signing, effective date) bold. Contact block (2.9) | Process dates; `LOIDate`, `SigningDate`, `EffectiveDate` |

In 2.9 "Back matter › Process and next steps", append: "Stages 6–8 carry AMB's post-LOI spine (LOI → signing and escrow funding → effective date) [OUTL, LOI12, CHK]; the three anchor rows are bold, as on CHK's Milestones tab."

### 8.4 Model cover and any Word companion

- Model `Cover` B30 (5.12): change "Prepared by AMB Advisory Services | Strictly confidential" to **"Prepared by AMB Advisory Services LLC for [Client] | [Month D, YYYY] | Confidential"**, Arial 9 italic (Keep: CHK `Read Me`!A2; the memos).
- If the bot ever writes an ICP or memo (Q4): title; a subtitle line; the preparer line at 10 pt `555555`; an optional 9 pt `444444` source line; numbered H2s ("1. Executive Summary" or "1. The short answer"); answer-first bold lead-ins; the closing "Prepared by AMB Advisory Services LLC. … not legal or tax advice" line. Word styling follows OFF14 (6.3), not the Docs memos' navy or blue-grey.

### 8.5 D1 / Q1 note

Add to D1's "Why": "AMB's Word offer documents from 21 Sep 2026 use `7A0000` for H1 and table headers and `9A0033` for H2, the title rule and the LOI band, with `F2EEE9` label fills and `D8D0C6` rules. The look first appeared in generated drafts (Offer v7, LOI v1); Frank then saved it in Word (LOI v2–v7, Offer v9), and the final OFF14 and LOI12 keep it. `9A0033` is therefore a current AMB Word accent, not only TCC's `990033`. The CIM keeps one maroon; Q1 should confirm whether Word companions may keep `9A0033` or move to `9E0A20`."
