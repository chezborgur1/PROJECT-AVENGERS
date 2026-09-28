# Follow-up 4: The side-by-side offer comparison (N structures or LOIs + Variance), the printed "Offer Structure Overview" (asd.pdf), and the R-DEL correction

**Scope.** `HOUSE_STYLE.md` 5.5 says "Deal Structure: one engine … Every structure (all cash, cash + note, cash + earnout, rollover) is a setting, not a copy" (line 848). That engine computes one structure at a time. Nothing in the guide reproduces AMB's signature output, the `Offer Comparison` tab: "Offer Comparison — Partnership vs. 100% Buyout ($000s)", columns `Partnership | 100% Buyout | Variance`. A sell-side advisor comparing competing LOIs needs exactly this output. This report does three things. It documents the tab cell by cell. It documents the 19-page printed pack `asd.pdf`, which no report cites. And it specifies an N-column comparison block with verbatim row labels, ready to drop into the guide. It also corrects R-DEL §2.6 and R-MOD §7 and §14, which misdescribe the Offer Scenario pack.

**Method.** I read VAL's five tabs with openpyxl twice, once for formulas and once for cached values. For each cell I recorded font (name, size, bold, italic, colour), fill, border sides, number format, alignment and indent, plus column widths, row heights, print areas, page setup, conditional formats and their priorities. I did the same for V51's `Offer Comparison` and `Offer Overview`. I rendered VAL through LibreOffice (19 pages, colour-coded working view) and rendered all 19 pages of `asd.pdf` and the single page of `Keystone Offer Scenario Analysis.pdf` with pymupdf, then looked at every page, including a 200 dpi crop of the Return Profile block. I pulled font spans, fills and table extents from the PDF. I also read the two AMB memos that re-present the comparison in Word (OSC and BL), because they show how Frank uses the output and where the model stopped short. Quotes are verbatim. Paths are relative to `/home/user/project-avengers/references/03) AMB Dataroom/`.

---

## 0. Corrections (read first)

| Where | What it says | What is true | Evidence |
|---|---|---|---|
| R-DEL table row 7; §2.6; §15 render list (`keystone_offer_scenarios_p01`) | The Offer Scenario pack is "1 (cover only)". "The export stopped at the cover; the offer content lives in the Valuation & Offer Structure workbook" | The **file** `Keystone Offer Scenario Analysis.pdf` has one page. The **pack** is 19 pages and was printed as `03) Target Materials/asd.pdf`: a landscape cover, then 18 portrait pages covering all four offer tabs (map in 3.1). Both PDFs come from the same workbook: same metadata title "AMB + Topkey - Valuation & Offer Structure.xlsx", author "frank", PScript5 → Acrobat Distiller 26.0. They were created **nine seconds apart**: cover-only at 2026-09-24 21:30:44 −04:00, full pack at 21:30:53. The two covers are **pixel-identical** (the 40 dpi rasters have equal MD5 hashes). So the cover-only file is a first print, and the full print sits beside it under a throwaway name | pymupdf metadata and raster hash |
| R-MOD §7 (line 309) | "Keystone Offer Scenario Analysis.pdf" shows the Print toggle in use | A cover cannot show the toggle. `asd.pdf` can: every figure prints black, although the working file has VAL `Offer Comparison`!I3 = 0 and renders blue, purple, green and red (compare 3.2's render) | VAL I3; LibreOffice render vs `asd.pdf` p2 |
| R-MOD §14 (line 469) | Target Materials p1 "Confirms single tabs go to the counterparty as PDFs with the AMB cover" | The whole workbook goes out as one PDF, all four tabs behind one cover | `asd.pdf` |
| `HOUSE_STYLE.md` 0.1 | No source key for the printed offer pack | Add **OSO** (below) | |
| Cover date | Neither report says what the printed date means | "As of 09/24/26" on the offer cover is the **print date**. VAL `Cover`!B26 is `="As of "&TEXT(TODAY(),"mm/dd/yy")`, and both PDFs were printed on 2026-09-24. This is further evidence for the guide's "Never `TODAY()`" rule (5.12) | VAL Cover B26 |

---

## 1. Summary: what the guide should add or change

1. **Change the engine rule from "a setting, not a copy" to "a column, not a copy".** `Deal Structure` becomes columnar: one column per structure or LOI (up to 5), the same formula in every column, and `engine.ts` run once per column. AMB reached its comparison by building **two full copies of the engine**: `Partnership Analysis` (rows 1–220) and `100% Buyout Analysis` (rows 1–195). A third tab reads both. The copies have already drifted apart in labels, formats, downside sets and a netting basis (section 4).
2. **Add tab `Offer Comparison`** (new #24, after `Deal Structure`; status A when two or more structures or LOIs are entered). Keep VAL's anatomy: labels in B, one column per structure, a `Variance` column, a screen-only `Notes` column, grey IRR helper strips on the right, and three print ranges. Keep its row blocks and verbatim labels, generalised with `<Seller>`, `<Buyer>`, `<Target>`, `N` (earnout year) and `H` (horizon) tokens. Section 5.4 lists them.
3. **Variance rule.** With N = 2, keep `Variance` = column 1 − column 2 (VAL `=C7-D7`). With N = 3–5, show N − 1 columns under a tier-1 header `Variance vs. <Reference>`, each Reference − Other. A variance takes the row's unit: $ in $, multiples in `0.00x`, and rates in **percentage points** (new format `#,##0.0" pts"`). Show `n.m.` where a difference means nothing. Leave tie-out rows blank.
4. **Keep the Return Profile boxes exactly.** Deal MOIC is bold on `FFFFCC` in `0.00x`. Deal IRR is **bold italic** on `FFFFCC` in `0.0%`. The two rows share one thin black box. The same pairing covers Excess MOIC/IRR over Hurdle, All-In MOIC/IRR and Total MOIC/IRR. The rule in one line: **in a yellow key box, $ and x are bold and every rate is bold italic.**
5. **Add what a sell-side LOI comparison needs and VAL lacks.** A **Risk-Adjusted Value to `<Seller>`** block brings VAL's buried "Risk-Weighted Earnout — PV at Close (Memo)" onto the page. A **Key Terms** block holds text rows. A **Buyer Capacity** block (DSCR, leverage) replaces the buyer's return profile when a bid is not paid in buyer stock. A `Total` row goes under "Where `<Seller>`'s Year H Value Comes From".
6. **Add checks C19–C22**: the consideration tie-out, the value-by-source tie-out, zero variance on shared assumptions, and IRR validity. Keep VAL's CF priority, which lets a broken tie-out print red even in Print mode.
7. **Add an "Offer Structure Overview" export**, mirroring OSO: model cover (B25 "Offer Structure Overview"), then `Offer Comparison`, then `Deal Structure`, then `Sensitivities`, printed in Print mode. Every range must print at ≥ 90% scale. OSO printed at 76%, so its Arial 9 came out at **6.84 pt**, below the guide's 7 pt floor.
8. **Add source keys** OSO, OSA, OSC and BL, and fix R-DEL and R-MOD as in section 0.

---

## 2. Sources (add to section 0.1)

| Key | File | What it evidences |
|---|---|---|
| **OSO** | `03) Target Materials/asd.pdf` (19 pp.; metadata title "AMB + Topkey - Valuation & Offer Structure.xlsx", author "frank", created 2026-09-24 21:30:53 −04:00) | The printed "Offer Structure Overview" pack: page order, Print-mode output, print scale, what the counterparty actually sees |
| **OSA** | `03) Target Materials/Keystone Offer Scenario Analysis.pdf` (1 p., same metadata, 21:30:44) | Cover only; the same cover as OSO p1 |
| **VAL** | (already keyed) `01) Diligence Workbook/AMB + Topkey - Valuation & Offer Structure.xlsx`, tab `Offer Comparison` A1:Q162 | Cell-level spec of the comparison |
| **V51** | (already keyed) tab `Offer Comparison` A1:Q152 and `Offer Overview` | The earlier state of the same page ($50,000K Topkey, 65 wins), with the defects listed in section 4 |
| **OSC** | `06) Offer/_Archive/Keystone Offer Structures Compared – Partnership 70-30 vs. 100% Buyout: Economics, Tax, Legal, Reporting & Series A (AMB, 2026-09-24).docx` | The comparison re-set as a memo table `Metric \| Partnership 70/30 \| 100% Buyout \| Difference` |
| **BL** | `06) Offer/Keystone Deal – Bottom Line on Series A Impact & Company Burden: Partnership vs. Equity Buyout vs. All-Cash (AMB, 2026-09-24).docx` | **Three-structure precedent**, `Partnership 70/30 \| 100% for equity \| 100% all-cash`, with the all-cash column "Not modeled" |

---

## 3. What AMB does

### 3.1 The printed pack (OSO), page by page

| OSO pages | VAL tab and print range | Subtitle (row 3) | Content |
|---|---|---|---|
| 1 (landscape) | `Cover` B2:Q39 | n/a | Keystone logo; "Keystone Bookkeepers" / *"Offer Structure Overview"* / *"As of 09/24/26"*; `990033` bars; AMB logo bottom right |
| 2–4 | `Offer Comparison` B2:E64, B66:E110, B113:E149 | *Offer Comparison — Partnership vs. 100% Buyout ($000s)* | The comparison (3.3) |
| 5–9 | `Partnership Analysis` B2:D41, B43:D109, B111:D169 plus row breaks at 68 and 153 | *Partnership Rollover Scenarios ($000s)* (italic) | Revenue Growth Assumptions; Cash Earnout; Offer Structure `Today \| % of Total`; Scenario 1 / Scenario 2; Implied multiples; Where Ben's Year 5 Value Comes From; Break-Even Stress Tests; Dilution; Downside Cases; Liquidity & Control |
| 10–14 | `Partnership Tables` five ranges B2:L82 … B325:L402 | *Partnership Sensitivity Tables ($000s)* | Six 7 × 9 heat-mapped grids per page; navy group bar (theme 8, shade −0.5) and light-blue "— Less Standalone" bar (theme 8, tint +0.6) |
| 15–19 | `100% Buyout Analysis` five ranges B2:D40 … B130:D160 | Valuation Growth Scenarios ($000s) (**roman**, not italic) | The same engine for the buyout, with a cash earnout |

PDF measurements: body text is ArialMT 6.84 pt. Title and band text are Arial-BoldMT 6.84 pt (white on bands), Deal IRR-style rows Arial-BoldItalicMT 6.84 pt, and the company name Arial-BoldMT 9.9 pt. That is 9 pt and 13 pt printed at 76%. The comparison table spans x = 51–406 pt, i.e. **355 pt of a 612 pt page (58%)**, and the rest of the width is empty because the Notes column sits outside the print range. The PDF has no header, no footer and no page numbers.

### 3.2 `Offer Comparison` tab anatomy (VAL)

| Element | Value |
|---|---|
| Column widths | A 1.29 · **B 51.43** (labels) · **C 12.29** (Partnership) · **D 11.71** (100% Buyout) · **E 9.14** (Variance) · F 2.86 (spacer) · **G 62.86** (Notes) · H 12.43 ("Print") · K 21.0 (helper labels) · L 8.57 (helper years; M:Q default) |
| Row heights | Default 15.0; row 2 16.5; **row 6 = 2.1** (spacer under the first header); **3.95** spacers between blocks (rows 27, 39, 41, 47, 65, 78, 112, 150); row 67 = 26.25 (two-line wrapped headers) |
| View | Gridlines off; zoom 145; page-break preview; no freeze panes; no merged cells |
| Page setup | Portrait; fitToPage; scale 76; margins 0.7 / 0.7 / 0.75 / 0.75 (Excel defaults); **three print ranges** B2:E64, B66:E110, B113:E149; no header or footer. V51 uses B2:E67, B69:E113, B116:E152 |
| Title | B2 `=Cover!$B$24`, Arial 13 bold |
| Subtitle | B3 "Offer Comparison — Partnership vs. 100% Buyout ($000s)", arial 9 italic, thin black bottom border across B3:E3 |
| Print switch | H3 "Print" (Arial 9); I3 `0`, blue `0000FF`, thin box, centred |
| Block header row | B: block name; C "Partnership"; D "100% Buyout"; E "Variance". Fill `7B0000`, Arial 9 bold `FFFFFF`. C and D right-aligned, **E centred**. The header repeats on every block (12 times, plus the unlabelled Upside band) |
| Section row | Fill `FFE1E1` across B:E only (not G), Arial 9 bold black: "General Assumptions", "Keystone Standalone Assumptions", "Keystone Partnership Assumptions" |
| Notes column | G5 "Notes" (bold black, no fill). Every note is Arial 9 roman, and many are formula-built (3.8). Screen-only, because G sits outside every print range |
| Signed labels | "(+) …", "(-) …" with **indent 1** (alignment, not spaces). "(x)" appears on the analysis tabs |
| Label separator | Spaced em dash: "Est. Topkey Dilution — Ben's Stake (Year 5)", "(-) Hurdle MOIC — Break-Even" |
| Colour code (working view) | Blue `0000FF` inputs in C; **purple `800080` `=C7` links in D** ("D = C"); green `008000` cross-tab links (`='Partnership Analysis'!$C$19`); **red `FF0000` for Topkey-provided figures pending confirmation** (C18 261, C19 325, C20 130, C26 12); black calculations; grey `808080` helpers |
| Font-name noise | Rows 49–64 mix `arial` (theme colour 1) with `Arial` (`000000`) in the same row |

### 3.3 The row blocks, verbatim (VAL values; P = Partnership, B = 100% Buyout, V = Variance)

Style codes: **B** bold, *I* italic, **BI** bold italic, Y = `FFFFCC` fill, box = thin black box around the group (top on first row, bottom on last, left on B, right on E), T = thin top border, ind = indent 1. Formats: `$` = `[$$]#,##0;\([$$]#,##0\);"–";@`; `#` = `#,##0;\(#,##0\);"–";@`; `%0` = `#,##0%;…`; `%1` = `#,##0.0%;…`; `x2` = `0.00\x;\(0.00\x\);"–"`; `x1` = `0.0\x;…`.

**Deal Assumptions** (rows 5–26)

| Row | Label | P | B | V | Fmt | Note (G) |
|---|---|---|---|---|---|---|
| 7 | Horizon (Years) | 5 | 5 | – | # | Input — drives Partnership and Buyout tabs (D = C) |
| 8 | Est. Topkey Dilution — Ben's Stake (Year 5) | 5% | 5% | – | %0 | same |
| 9 | Topkey Valuation Today — Pre-Deal | $60,000 | $60,000 | – | $ | Input — single Topkey valuation; drives Offer Overview, Partnership and Buyout tabs |
| 10 | `="Topkey "&$C$7&"-Year Valuation Growth (ex-Keystone)"` | 202% | 201% | 1% | %0 | Differs because each offer's cash at close is netted from Topkey's ex-Keystone base; measures value growth, not revenue |
| 11 | Keystone 5-Yr Revenue Increase — Standalone (% of Start) | 100% | 100% | – | %0 | Total additional standalone revenue ÷ Keystone run-rate revenue at close |
| 12 | Keystone 5-Yr Revenue Increase — Partnership (% of Start) | 133% | 133% | – | %0 | |
| 13–15 | Keystone Initial / Scaled / Software-Integration Revenue Multiple | 1.00x / 1.25x / 2.00x | same | – | x2 | Input — drives … (D = C) |
| 16 | **General Assumptions** (`FFE1E1`) | | | | | |
| 17 | Ben's Rollover % — Keystone | 30% | – | 30% | %0 | `="Input — share of Keystone Ben keeps ("&"Partnership "&TEXT(C17,"0%")&"; "&"Buyout "&TEXT(D17,"0%")&" = Topkey "&"acquires "&TEXT(1-D17,"0%")&")"` |
| 18–20 | Topkey - Current Monthly Revenue / Current Client Count / Annual Net Client Wins | $261 / 325 / 130 (red) | same (purple) | – | | "… red = pending seller confirmation"; row 20 "AMB placeholder; red = pending confirmation" |
| 21 | **Keystone Standalone Assumptions** | | | | | |
| 22–23 | Avg. Revenue Per Client; Target Monthly Net Client Wins | $16.6; 3.0 | same | – | `$0.0`; `#.0` | row 23 note builds "LTM actual is 26/yr (~2.2/month)" by formula |
| 24 | **Keystone Partnership Assumptions** | | | | | |
| 25–26 | VR Platform Run-Rate Tech Cost; Additional Annual Net Client Wins From Topkey | $240; 12 (red) | same | – | | |

**Offer Structure** (rows 28–38)

| Row | Label | Style | P | B | V | Fmt |
|---|---|---|---|---|---|---|
| 29 | Keystone Value Today (100%) | | $3,000 | $3,000 | – | $ |
| 30 | Ben's Rollover % — Keystone | | 30% | – | 30% | %0 |
| 31 | Keystone Stake Acquired by Topkey | | 70% | 100% | (30%) | %0 |
| 32 | Price for Topkey's Stake (at Close) | | 2,100 | 3,000 | (900) | # |
| 33 | Cash at Close | | $650 | $500 | $150 | $ |
| 34 | (+) Topkey Equity Issued to Ben | ind | 1,450 | 2,500 | (1,050) | # |
| 35 | (+) Target Cash Earnout (at 100% Achievement) — Year 3 | ind | – | 500 | (500) | # |
| 36 | **Total Consideration Paid by Topkey** | B, Y, box | **$2,100** | **$3,500** | **($1,400)** | $ |
| 37 | Tie Out — Consideration vs. Analysis Tab | roman black; CF red if `ROUND(C37,0)<>0`; note "Must equal zero" | – | – | (blank) | # |
| 38 | % of Consideration in Cash (incl. Earnout) | | 31% | 29% | 2% | %0 |

**Where Ben's Year 5 Value Comes From** (rows 40–46). All five rows are regular weight on `FFFFCC` inside one box, with no total row.

| Label | P | B | V |
|---|---|---|---|
| Retained Keystone Stake (Direct) | 46% | – | 46% |
| Keystone via Topkey | 2% | 6% | (4%) |
| Topkey ex-Keystone | 44% | 82% | (37%) |
| Cash at Close | 7% | 6% | 1% |
| Cash Earnout — Year 3 | – | 6% | (6%) |

**Return Profile — Jon (Topkey)** (rows 48–64). This is the block the brief names.

| Row | Label | Style | P | B | V | Fmt | Note (G) |
|---|---|---|---|---|---|---|---|
| 49 | Cash at Close (Year 0) | | $650 | $500 | $150 | $ | |
| 50 | (+) Equity Issued to Ben (Year 0) | ind | 1,450 | 2,500 | (1,050) | # | |
| 51 | (+) Target Cash Earnout (at 100% Achievement) (Year 3) | ind | – | 500 | (500) | # | |
| 52 | **Total Invested by Jon (Topkey)** | B, T | $2,100 | $3,500 | ($1,400) | $ | Ties to Total Consideration (row 36) |
| 53 | Topkey's Keystone Stake — Year 5 Value | | 9,786 | 13,980 | (4,194) | # | Topkey's stake acquired (row 31) × Keystone Year 5 value |
| 54 | **Deal MOIC** | **B**, Y, box top | **4.66x** | **3.99x** | **0.67x** | x2 | Standard acquirer view: stake value ÷ consideration at issue price |
| 55 | ***Deal IRR*** | **BI**, Y, box bottom | ***36.0%*** | ***34.2%*** | ***1.8%*** | %1 | Cash-flow IRR; see helper cash flows in L49:Q50 |
| 56 | (-) Hurdle MOIC — Break-Even | ind | 2.38x | 2.67x | (0.29x) | x2 | Break-even stake value (row 130) ÷ cash + stock; no earnout paid at break-even |
| 57 | (-) Hurdle IRR — Break-Even | ind | 18.9% | 21.7% | (2.7%) | %1 | Cash-flow IRR on break-even flows (L52:Q53) … |
| 58 | **Excess MOIC over Hurdle** | B, Y, box top | 2.28x | 1.33x | 0.95x | x2 | Deal return after backing out the cost of paying in Topkey stock |
| 59 | ***Excess IRR over Hurdle (% pts)*** | BI, Y, box bottom | 17.1% | 12.6% | 4.5% | %1 | Deal IRR less hurdle IRR |
| 60 | Jon's Year 5 Value — With Deal | | 175,440 | 175,998 | (558) | # | Jon's diluted % × (Topkey ex-Keystone + Keystone stake) |
| 61 | (-) Jon's Year 5 Value — Without Deal | ind | 171,000 | 171,000 | – | # | Topkey keeps its cash and pays no earnout; Jon diluted by the same est. % |
| 62 | **Net Value Created for Jon** | B, Y, box top | $4,440 | $4,998 | ($558) | $ | Includes the cost of stock sharing Topkey's growth with Ben |
| 63 | **All-In MOIC** | B, Y | 3.11x | 2.43x | 0.69x | x2 | (Invested + net value created) ÷ invested |
| 64 | ***All-In IRR*** | BI, Y, box bottom | 25.5% | 19.4% | 6.1% | %1 | MOIC^(1 / horizon) − 1 |

**Partnership Upside Analysis** (rows 66–77). The header band carries no column names. A `FFE1E1` sub-header row (26.25 high) holds formula-built headers: `="First "&TEXT(C31,"0%")&" (Partnership)"` → "First 70% (Partnership)", `=TEXT(D31,"0%")&" (Buyout)"` → "100% (Buyout)", `="Extra "&TEXT(D31-C31,"0%")` → "Extra 30%". **Here column E is the incremental economics of the last 30%, computed as D − C** (note: "Column E = incremental cost and return of buying the last 30% (Buyout less Partnership)"). Rows: Keystone Stake Acquired by Topkey · **Total Invested by Jon (Topkey)** · Cost per 1% of Keystone ($30.0 / $35.0 / $46.7, format `$0.0`) · Paid in Topkey Stock (% of Invested) (69% / 71% / 75%) · Keystone Stake Value — Year 5 · Deal MOIC (E = incremental 3.00x) · Hurdle MOIC — Break-Even (E "n/m") · **Net Value Created for Jon** ($558) · **All-In MOIC** (1.40x) · ***All-In IRR*** (6.9%).

**Return Profile — Ben** (rows 79–89)

| Label | Style | P | B | V |
|---|---|---|---|---|
| **Keystone Value Contributed by Ben (Year 0)** | B | $3,000 | $3,000 | – |
| Cash at Close (Year 0) | | 650 | 500 | 150 |
| (+) Target Cash Earnout (at 100% Achievement) (Year 3) | ind | – | 500 | (500) |
| (+) Retained Keystone Stake — Year 5 | ind | 4,194 | – | 4,194 |
| (+) Topkey Equity — Year 5 | ind | 4,240 | 7,333 | (3,093) |
| **Total Value Received by Ben** | B, Y, box top | $9,084 | $8,333 | $751 |
| **Total MOIC** | B, Y | 3.03x | 2.78x | 0.25x |
| ***Total IRR*** | BI, Y, box bottom | 29.1% | 26.6% | 2.5% |
| (-) Ben's Year 5 Value — Standalone | ind | 7,490 | 7,490 | – |
| **Net Value Created for Ben** | B, Y, own box | $1,594 | $843 | $751 |

**Ben — Offer vs. Standalone (Year 5)** (rows 91–102): Ben's Value — Offer · (-) Ben's Value — Standalone · **Offer Less Standalone ($)** (B, Y box top) · ***Offer Less Standalone (%)*** (BI, Y box bottom; 21.3% / 11.3%; **V left blank**) · MOIC — Offer · (-) MOIC — Standalone (2.50x) · **MOIC Delta — Offer vs. Standalone** (B, Y, own box) · IRR — Offer · (-) IRR — Standalone (20.1%) · **IRR Delta — Offer vs. Standalone** (B, Y, own box: a rate in bold roman, the one exception to the italic rule) · Tie Out — Ben's Value by Source vs. Offer ("Must equal zero").

**Ben's Year 5 Value** (rows 104–111): Retained Keystone Stake (Direct) $4,194 / – · (+) Keystone via Topkey 219 / 531 · (+) Topkey ex-Keystone 4,020 / 6,802 · (+) Cash at Close 650 / 500 · (+) Cash Earnout — Year 3 – / 500 · **Ben's Value — Offer (Year 5)** $9,084 / $8,333 / $751 · Tie Out — Value by Source vs. Offer.

**Ben's Break-Even — Downside Threshold** (113–119): Partnership Revenue Multiple (1.28x / n/m / n/m) · Required Topkey ex-Keystone Value — Year 5 · Topkey Future Revenue Multiple (`0.0x`) · Topkey Annual Net Client Wins · Total Dilution of Ben's Topkey Stake · Topkey Value CAGR (ex-Keystone, Net of Cash).
**Ben's Break-Even Cushion — Base Case vs. Break-Even** (121–127): Partnership Revenue Multiple — Cushion (x) · Topkey ex-Keystone Value (Year 5) — Cushion ($) · Topkey Future Revenue Multiple — Cushion (x) · Topkey Annual Net Client Wins — Cushion (#) · Dilution of Ben's Topkey Stake — Cushion (% pts) · Topkey Value CAGR — Cushion (% pts).
**Topkey's Break-Even — Downside Threshold** (129–135): Required Keystone Stake Value — Year 5 · Required Keystone Revenue — Year 5 · Software-Integration Revenue Multiple · Keystone Annual Net Client Wins · Keystone Avg. Revenue Per Client · Keystone Revenue CAGR. Its note: "Break-even = Jon's net value created equals zero; no earnout paid at break-even (below threshold)".
**Topkey's Break-Even Cushion — Base Case vs. Break-Even** (137–143): the same six rows, each "— Cushion ($)", "(x)", "(#)" or "(% pts)".
**Ownership %** (145–149): Ben's Topkey Ownership % — Today (2.4% / 4.0%) · Ben's Topkey Ownership % — Year 5 (Diluted) · Jon's Topkey Ownership % — Today · Jon's Topkey Ownership % — Year 5 (Diluted).
Outside print (151–162): a `Label | Value | Rationale` block "Offer Tool Assumptions" and "Client Roll-Forward — LTM Sep'26 (#)". These are blue constants copied from V51 v49, with notes such as "From Offer Overview C27 (diligence workbook v49); seller's current ownership of Keystone".

### 3.4 How AMB computes the Variance column

- **Main blocks: E = C − D** (Partnership less Buyout) on every row, including ratios: `=C54-D54` gives 0.67x, and `=C55-D55` gives 1.8%, which is really percentage points but formatted as %.
- **Incremental block: E = D − C**, the opposite sign, plus recomputed marginal ratios (`E73 =IFERROR(E72/E69,0)` = 3.00x). The formula-built header "Extra 30%" and the note announce the switch.
- **Blank** on tie-out rows and on "Offer Less Standalone (%)". Text **"n/m"** where Ben keeps no stake in the buyout: `=IF(ISNUMBER(D114),C114-D114,"n/m")`.
- **Shared assumptions show "–"**. The value is typed once in C (blue) and linked in D with `=C7` (purple). A dash in Variance proves like-for-like; only structure-specific inputs (rollover %, cash at close, earnout) show a variance. Row 10 is the one shared row that differs (202% against 201%), and its note explains why.

### 3.5 The Return Profile boxes (the brief's "bold italic inside FFFFCC")

At 200 dpi (OSO p2, crop checked), every key result sits in a two- or three-row `FFFFCC` group with one thin black box. Multiples and dollars (Deal MOIC, Excess MOIC over Hurdle, Net Value Created, All-In MOIC, Total Value Received, Total MOIC) are **bold roman**. Every rate (Deal IRR, Excess IRR over Hurdle (% pts), All-In IRR, Total IRR, Offer Less Standalone (%)) is **bold italic**. Hurdle rows between the boxes are roman with "(-)" and indent 1, so the eye reads result → hurdle → excess. The guide's `AMB Margin` style (9 bold italic in the key box) already fits the rate rows. The guide needs to name the pairing (5.5 below).

### 3.6 Checks and the Print toggle

- The CF over every block (B7:E27 … B146:E149) is `=$I$3=1` → font `000000`, **priority 4**.
- The tie-out CF on C37:D37 is `ROUND(C37,0)<>0` → font `FF0000`, **priority 3**. So a failed tie-out stays red in Print mode. Keep this priority order.
- Defect: the Print CF on B152:C162 and G152:G162 references `$G$3`, not `$I$3`.
- The analysis tabs carry more tie-outs: "Tie Out — Topkey Combined EV Today vs. Post-Money", "Tie Out — Ben's Topkey Equity vs. Equity Issued", "Tie Out — Ben's Value Today vs. Keystone Value Today", "Tie Out — Diluted Value vs. Scenario 2".

### 3.7 IRR helper strips (keep the timing idiom)

K48 "Helper: Year", L48:Q48 = 0…5 (grey `808080`). Partnership buyer flows:
`L49 =-(L$48=0)*($C$33+$C$34)-(L$48=$L$51)*$C$35+(L$48=$C$7)*$C$53` → −2,100 … 9,786.
The buyout row gives −3,000, 0, 0, −500, 0, 13,980. L51 `='100% Buyout Analysis'!$C$43` is the earnout year (green), with the note "Year the target earnout is paid — linked to 100% Buyout Analysis (Earnout Measurement Year)". Hurdle rows L52:Q53 replace the stake value with the break-even value. Seller flows (K79:Q81): `=-(L$79=0)*($C$80-$C$81)+(L$79=$L$51)*$C$82+(L$79=$C$7)*($C$83+$C$84)`, so Year 0 is −(value contributed − cash at close). Deal IRR is `=IFERROR(IRR($L49:$Q49),0)`. All-In IRR is `=IFERROR(C63^(1/C$7)-1,0)`, a MOIC-implied rate and not a cash-flow IRR: two IRR definitions sit in one block.

### 3.8 Formula-built labels and notes (keep)

- Labels: `="Topkey "&$C$7&"-Year Valuation Growth (ex-Keystone)"`. Analysis tab: `="Scenario 2 — Ben Rolls "&TEXT($C$174,"0%")&" of Keystone Equity"`.
- Notes cite rows with `ROW()` and `ADDRESS()`: `="Cash-flow IRR; see helper cash flows in "&ADDRESS(ROW(L49),COLUMN(L49),4)&":"&ADDRESS(ROW(Q50),COLUMN(Q50),4)`.
- Notes that quote values: `="Partnership cash of "&TEXT(C33,"$#,##0")&"K"&" is set to cover Ben's tax situation"`; `="Buyout: "&TEXT('100% Buyout Analysis'!C49,"$#,##0")&"K target, capped at "…` → "Buyout: $500K target, capped at $750K (150% of target). Partnership: no earnout".

### 3.9 How Frank re-uses the page (OSC, BL)

- **OSC** table 1, `Metric | Partnership 70/30 | 100% Buyout | Difference`, has group rows "Jon / Topkey" and "Ben" spanning all columns. It restates the comparison page in words: "Deal MOIC / IRR on the stake | 4.66x / 36.0% | 3.99x / 34.2% | Partnership better"; "Total invested by Topkey | $2,100 | $3,500 | Partnership $1,400 less"; "Where the value comes from | 46% retained Keystone stake, 44% Topkey ex-Keystone, 7% cash, 2% Keystone via Topkey | 82% Topkey ex-Keystone, 6% … | Buyout is almost entirely a bet on Topkey". OSC table 0, `Term | Partnership – Topkey 70% / Ben 30% | 100% Buyout`, is the qualitative terms block: "Cash at close | $650K (31% of the price for the 70%); 10% escrow = $65K | $500K (17% of the $3.0M); 10% escrow = $50K".
- **BL** compares **three** structures, `| Partnership 70/30 | 100% for equity | 100% all-cash`, and writes in the third column "Jon's all-in MOIC / IRR (model) | 3.11x / 25.5% | 2.43x / 19.4% | **Not modeled**". The model's two-copy design ran out at two structures, and the memo shows it. This is the direct evidence for N-column support.

---

## 4. What is weak and should be elevated

1. **Two engine copies drift apart.**
   - Labels differ: "Scenario 2 — Ben Rolls 30% of Keystone Equity" against "Scenario 2 — Ben Accepts the Topkey Offer", and "Topkey's Return on the Keystone Stake" against "…Keystone Acquisition".
   - The downside sets differ. The partnership reports levels ("Downside Cases — Ben's Year 5 Value", input / Year 5) and includes "Partnership Revenue Multiple Falls To 1.5x". The buyout reports deltas ("Downside Cases — Scenario 2 vs. Scenario 1", "Year 5 Delta") and includes "Earnout Missed — Below Threshold". Neither set can be compared with the other.
   - Formats differ: subtitle italic (Partnership) against roman (Buyout); "Delta (%)" bold italic against roman; "Increase in Keystone Revenue vs. Standalone" italic against roman.
   - The netting basis differs: row 10 shows 202% against 201%.
   - Fix: one engine, N columns.
2. **The same MOIC prints at two precisions.** It is `0.0x` on the analysis tabs ("MOIC — Topkey 4.7x", "4.0x") and `0.00x` on the comparison (4.66x, 3.99x). Fix: `0.00x` everywhere.
3. **Variance sign flips inside one page** (C − D, then D − C in the Upside block), and **rate variances print as "%"**. Only rows 59 and 126–127 say "(% pts)". Fix: one sign rule per tab, stated under the header, and a points format.
4. **Headline consideration is not risk-adjusted on the page.** "Total Consideration Paid by Topkey" counts the earnout at 100% ($3,500 against $2,100). The risk-weighted PV exists only on the buyout tab, as "Risk-Weighted Earnout — PV at Close (Memo) $230" (70% probability, 15.0% discount, Year 3: 500 × 0.70 ÷ 1.15³). Risk-adjusted, the buyout's headline edge over the partnership's $3,000 at-close value shrinks from $500 to **$230**. A sell-side LOI comparison must show this on the page.
5. **"Consideration" has two definitions.** The comparison's "Total Consideration Paid by Topkey" excludes Ben's rolled equity ($2,100). The analysis tab's "Total Offer Value — at Close" includes it ($3,000, with "(+) Ben's Rolled Keystone Equity 900"). The buyout's "% of Total" column reaches **116.7%** ("Total Consideration incl. Earnout"). Fix: separate labels for buyer-paid and seller-received, and no share above 100%.
6. **Break-evens print impossible values.** V51's `Offer Comparison` prints "Total Dilution of Ben's Topkey Stake" **−18.5%** (buyout), Topkey break-even "Keystone Annual Net Client Wins" **−5.6** and "Keystone Avg. Revenue Per Client" **−1.5**, and a buyout "Net Value Created for Ben" of −$1,289 with no flag. Fix: a break-even that solves outside the feasible domain returns `n.m.` with a note.
7. **The notes never reach the reader.** Column G (62.86 wide) holds the reasoning ("Partnership cash of $650K is set to cover Ben's tax situation"), but G is outside the print ranges. So OSO shows 355 pt of table on a 612 pt page and no explanation.
8. **Print scale 76% puts the type at 6.84 pt.** The 63-row first range is forced onto one page tall. Fix: ≤ 50 rows per range, scale ≥ 90%.
9. **Stale copies and dead references.** "Offer Tool Assumptions" (rows 151–162) holds blue constants copied from V51 v49; the CF points at `$G$3`; and V51's `Offer Overview` has empty blocks ("Future Value - Partnership" with no values) and an italic yellow stub row "Improved Client Retention" with no figures.
10. **Labels hard-code "Year 5", "Year 3" and "5-Yr".** On `Offer Comparison`, 31 labels do and only 1 is formula-built (row 10). The two analysis tabs add 43 more hard-coded labels. Change the horizon to 7 and most labels go wrong. Fix: every label that carries H or N is built by formula.
11. **Label variants for the same line.** "(+) Target Cash Earnout (at 100% Achievement) — Year 3" (row 35) against "… (Year 3)" (rows 51, 82) against "Cash Earnout — Year 3"; "(-) Hurdle MOIC — Break-Even" (row 56) against "Hurdle MOIC — Break-Even" (row 74). Fix: one label per concept.
12. **Buy-side perspective hard-wired.** The buyer's profile comes before the seller's, and there is no text row for terms (escrow, NWC, exclusivity), which OSC had to add in Word. In sell-side mode the seller's answer (value, cash, risk) must come first.
13. **"Where Ben's Year 5 Value Comes From" has no total** on the comparison, although the analysis-tab version shows "Ben's Value — Scenario 2 … 100%".
14. **The PDF has no page furniture**: no footer, no page numbers, no confidentiality line, and the "As of" date from `TODAY()`. The guide's 5.11 footer and 5.12 date rule already fix this.

---

## 5. Drop-in spec for HOUSE_STYLE.md

### 5.1 Section 5.5: replace "Every structure … is a setting, not a copy" with

> **Every structure is a column, not a copy.** `Deal Structure` holds one column per structure or LOI (at most 5; `Structure 1` is the **Reference**: AMB's recommended structure, or the leading LOI). Each column has its own `StructurePreset` (followup-2 §8.1) and its own blue inputs. **Shared assumptions** (horizon, discount rate, probability of achievement, growth, exit multiple, buyer pre-deal valuation) are typed once in the Reference column and linked in the others with `=C7` (purple), with the note "Input — drives all structures (D = C)" (Keep: VAL). Every formula on `Deal Structure` is the same in every column. `engine.ts` runs `computeStructure()` once per column, and `verifyWorkbook` checks each column. No per-structure tabs (Elevate: VAL's `Partnership Analysis` and `100% Buyout Analysis` are two ~200-row copies whose labels, formats and downside sets have drifted apart; BL could not model a third structure: "Not modeled").

### 5.2 Section 5.1 tab table: insert after row 23

> | 24 | `Offer Comparison` | C: ≥ 2 structures or LOIs | Side-by-side comparison with Variance (5.5) | Keep: VAL / V51 `Offer Comparison`; OSO pp. 2–4; OSC; BL |

Renumber the rows that follow.

### 5.3 `Offer Comparison` layout

| Element | Spec | Source |
|---|---|---|
| Subtitle (row 3) | N = 2: "Offer Comparison — `<S1>` vs. `<S2>` ($000s)" (Keep verbatim pattern). N ≥ 3: "Offer Comparison — `<n>` Offers vs. `<Reference>` ($000s)" | VAL B3 |
| Columns | A 1.7 · B **48** labels · C… one per structure, **12.3** each · spacer 0.9 · Variance column(s) **10.0** each · spacer 0.9 · Notes **60** (italic, screen-only) · helper labels 21.0 · helper years 8.6 | VAL A–L widths, on the guide's grid |
| Column headers | Structure short names ≤ 14 characters, right-aligned ("Partnership", "100% Buyout", or bidder short names such as "Harbor Cap."). N = 2: E "Variance". N ≥ 3: two-tier header, tier 1 "Offers" centred across the structure columns and "Variance vs. `<Reference>`" centred across the variance columns; tier 2 the names | VAL row 5; guide 5.2 two-tier |
| Block header | Repeat the header on every block: B = block name; `7B0000`, Arial 9 bold white; structure headers right-aligned, Variance centred | VAL (12 repeats) |
| Section rows | `FFE1E1`, bold, across label + structure + variance columns | VAL |
| Spacer rows | 2.1 under the first header of each print range; 3.95 between blocks | VAL row heights |
| Notes | Screen-only column (Keep: VAL G), built by formula with `ROW()` / `ADDRESS()` / `TEXT()`. The 3–6 notes a reader needs (why cash differs, earnout terms, what "break-even" means) print as numbered footnotes under the block, built from the same formulas | VAL G; guide 4.6 footnotes |
| Helper strips | Right of the notes, grey `808080`, outside print: "Helper: Year" 0…H; one buyer row and one seller row per structure; one hurdle row per structure | VAL K48:Q53, K79:Q81 |
| Print | Print toggle in row 3 (5.9). Print ranges of ≤ 50 rows, one per page; portrait when N ≤ 3, landscape when N ≥ 4; fit to 1 page wide; **scale must be ≥ 90%** (QA fails below) | Elevate: OSO 76% → 6.84 pt |
| Freeze | C7 when N ≥ 4 | Guide 5.11 |

### 5.4 Row blocks (verbatim labels; `<Seller>` = owner's first name as AMB writes it, "Ben"; `<Buyer>` = buyer or bidder short name; `<Target>` = business short name; H and N built by formula)

Order in **sell-side mode** (default): page 1 = blocks 1–5, page 2 = 6–9, page 3 = 10. In **buy-side mode** (AMB's Keystone order): 10, 1, 4, 7, 5, 6, 8, 9. K = keep VAL label verbatim (tokenised); N = new.

**1. Offer Structure** (K rows 28–38, plus the analysis-tab "Offer Structure" rows)

| Label | Style | Fmt | K/N |
|---|---|---|---|
| `<Target>` Value Today (100%) | | $ | K |
| `<Seller>`'s Rollover % — `<Target>` | | %0 | K |
| `<Target>` Stake Acquired by `<Buyer>` | | %0 | K |
| Price for `<Buyer>`'s Stake (at Close) | | # | K |
| Cash at Close | | $ | K |
| (+) Seller Note — Principal | ind | # | N |
| (+) `<Buyer>` Equity Issued to `<Seller>` | ind | # | K |
| (+) `<Seller>`'s Rolled `<Target>` Equity | ind | # | K (analysis tab) |
| **Total Offer Value — at Close** | Key Total | $ | K (analysis tab) |
| (+) Cash Earnout — Year N (Contingent) | ind | # | K (analysis tab) |
| **Total Consideration incl. Earnout** | Key Total | $ | K (analysis tab) |
| Total Consideration Paid by `<Buyer>` | Subtotal (excludes rolled equity) | $ | K |
| Tie Out — Consideration vs. Deal Structure | Check | check | K ("vs. Analysis Tab") |
| % of Consideration in Cash (incl. Earnout) | Ratio | %0 | K |
| `<Target>` Sale Multiple (x Revenue) / Sale Multiple incl. Earnout (x Revenue) | | x2 | K (Buyout "Price Paid vs. Price Received") |
| Sale Multiple (x PF Adj. EBITDA); Sale Multiple (x SDE) in Main Street mode | | x2 | N |

**2. Risk-Adjusted Value to `<Seller>`** (N; the rows reuse VAL's memo labels)

| Label | Style | Fmt |
|---|---|---|
| Cash at Close | | $ |
| (+) Seller Note — PV at Close | ind | # |
| (+) Risk-Weighted Earnout — PV at Close | ind | # (K: VAL "…(Memo)") |
| (+) `<Buyer>` Equity Issued to `<Seller>` (at Issue Price) | ind | # |
| (+) `<Seller>`'s Rolled `<Target>` Equity | ind | # |
| **Risk-Adjusted Value to `<Seller>`** | Key Total, box top | $ |
| ***Risk-Adjusted ÷ Headline*** | Margin (BI), box bottom | %1 |
| Of which: Escrow / Holdback | Ratio (italic) | # |
| Illiquid Share of `<Seller>`'s Value | | %0 (K: "Illiquid Share of Ben's Value — Scenario 2") |

Shared inputs, in block 10: Probability of Achievement (K, default 70%), Discount Rate (K, 15.0%), Seller Note Discount Rate (N).

**3. Key Terms** (N; text rows; values left-aligned, wrap to at most 3 lines, row height auto; Variance blank). Labels follow followup-2's OFF14 term set: Total Valuation · Asset vs. Stock Sale · Balance Sheet · Working Capital · Seller Note · Earnout (if applicable) · Escrow · Retention Holdback · Financing · Owner Transition · Exclusivity · Target Timing · Key Conditions. Each value is a formula-built string from that column's inputs ("$650K (31% of the price for the 70%); 10% escrow = $65K", Keep: OSC table 0).

**4. Where `<Seller>`'s Year H Value Comes From** (K rows 40–46; percentages `%0`; the whole block in one `FFFFCC` box, regular weight)
Retained `<Target>` Stake (Direct) · `<Target>` via `<Buyer>` · `<Buyer>` ex-`<Target>` · Cash at Close · Seller Note — Principal and Interest (N) · Cash Earnout — Year N · **Total** (N, bold, thin top, 100%). Rows that are zero in every column are dropped.

**5. Return Profile — `<Seller>`** (K rows 79–89)
**`<Target>` Value Contributed by `<Seller>` (Year 0)** · Cash at Close (Year 0) · (+) Seller Note — Principal and Interest (N) · (+) Target Cash Earnout (at 100% Achievement) (Year N) · (+) Retained `<Target>` Stake — Year H · (+) `<Buyer>` Equity — Year H · **Total Value Received by `<Seller>`** [B, Y, box top] · **Total MOIC** [B, Y, `0.00x`] · ***Total IRR*** [BI, Y, box bottom, `0.0%`] · (-) `<Seller>`'s Year H Value — Standalone · **Net Value Created for `<Seller>`** [B, Y, own box].

**6. `<Seller>` — Offer vs. Standalone (Year H)** (K rows 91–102)
`<Seller>`'s Value — Offer · (-) `<Seller>`'s Value — Standalone · **Offer Less Standalone ($)** · ***Offer Less Standalone (%)*** · MOIC — Offer · (-) MOIC — Standalone · **MOIC Delta — Offer vs. Standalone** · IRR — Offer · (-) IRR — Standalone · ***IRR Delta — Offer vs. Standalone*** (now bold italic, per the rate rule) · Tie Out — `<Seller>`'s Value by Source vs. Offer.

**7. Return Profile — `<Buyer>`** (K rows 48–64; shown when any column pays in buyer stock or leaves a rollover, because the seller's value then depends on the buyer's)
Cash at Close (Year 0) · (+) Equity Issued to `<Seller>` (Year 0) · (+) Target Cash Earnout (at 100% Achievement) (Year N) · **Total Invested by `<Buyer>`** [B, thin top] · `<Buyer>`'s `<Target>` Stake — Year H Value · **Deal MOIC** [B, Y, box top, `0.00x`] · ***Deal IRR*** [BI, Y, box bottom, `0.0%`] · (-) Hurdle MOIC — Break-Even · (-) Hurdle IRR — Break-Even · **Excess MOIC over Hurdle** [B, Y, box top] · ***Excess IRR over Hurdle (% pts)*** [BI, Y, box bottom] · `<Buyer>`'s Year H Value — With Deal · (-) `<Buyer>`'s Year H Value — Without Deal · **Net Value Created for `<Buyer>`** [B, Y, box top] · **All-In MOIC** [B, Y] · ***All-In IRR*** [BI, Y, box bottom].

**7b. Buyer Capacity** (N; replaces block 7 for cash, SBA or note-funded bids; row labels match the guide's Sources & Uses)
Senior / SBA Loan · Seller Note · Buyer Equity · **Total Sources** · Annual Debt Service (Year 1) · **DSCR (Year 1)** (`0.00x`; flag text "Below 1.25x" in the note, not a colour) · Total Debt ÷ PF Adj. EBITDA · Buyer Equity ÷ Total Sources · Financing Contingency (text).

**8. Break-even and cushion** (K rows 113–143; shown with block 7): `<Seller>`'s Break-Even — Downside Threshold · `<Seller>`'s Break-Even Cushion — Base Case vs. Break-Even · `<Buyer>`'s Break-Even — Downside Threshold · `<Buyer>`'s Break-Even Cushion — Base Case vs. Break-Even. The rows are verbatim from 3.3, with each cushion unit in the label ("— Cushion ($)", "(x)", "(#)", "(% pts)"). A solve outside the feasible domain (negative dilution, negative wins, negative revenue per client) returns `n.m.` with the note "No break-even within the feasible range".

**9. Ownership %** (K rows 145–149; shown when any column pays in buyer stock).

**10. Deal Assumptions** (K rows 5–26): shared rows first (blue in the Reference column, purple elsewhere, Variance "–"), then `FFE1E1` sub-sections **General Assumptions** · **`<Target>` Standalone Assumptions** · **Structure-Specific Assumptions** (generalises "Keystone Partnership Assumptions"). Inputs that come from the buyer and are pending confirmation stay red `FF0000` with the note "red = pending seller confirmation" (Keep: VAL C18–C20, C26).

**Optional 11. Incremental Analysis** (K "Partnership Upside Analysis"): use it only when two columns differ by stake size alone. Headers are built by formula (`="First "&TEXT(C31,"0%")&" (Partnership)"`, `="Extra "&TEXT(D31-C31,"0%")`), and the sign (Other − Reference) is stated in a printed note: "Column E = incremental cost and return of buying the last 30% (Buyout less Partnership)".

### 5.5 Variance and style rules (add under 5.5 and 5.8)

- **Sign.** Variance = Reference − Other, the same way throughout the tab (Keep: VAL `=C7-D7`). A printed note under the first header, built by formula, says so: "Variance = Partnership less 100% Buyout". The incremental block (11) is the only exception, and its header says so.
- **Unit follows the row.** $ rows use `$`/`#`. Multiples use `0.00\x;\(0.00\x\);"–"` (never `0.0x` for MOIC anywhere in the workbook). Rates and shares use points: formula `=(C55-D55)*100`, format **`#,##0.0" pts";\(#,##0.0" pts"\);"–"`** (add to 5.10). Text rows and tie-outs are blank. Where a difference means nothing, the cell shows `n.m.` (replacing VAL's "n/m").
- **Ratios are differenced, not recomputed**, except in block 11.
- **Named-style pairing.** Add `AMB Key Rate` = `AMB Margin` (9 bold italic on `FFFFCC`, `0.0%`), used for every IRR or % result inside a key box. `AMB Key Total` covers the $ and x rows in the same box. One thin black box surrounds each pair or trio (Keep: VAL rows 54–55, 58–59, 62–64, 85–87).
- **Composition block.** `AMB Share Block` = 9 regular on `FFFFCC`, one box around the block, and a bold `Total` row (Keep: VAL rows 42–46; add the total).
- **Labels.** Spaced em dash as the qualifier separator in the model (Keep: VAL). "(+)" / "(-)" with indent 1. Units in parentheses at the end ("(Year 0)", "(% pts)", "(x)", "(#)"). One label per concept (fix 4.11). Any label carrying H, N or a percentage is a formula.

### 5.6 Section 5.7 Checks: add

| ID | Check | Why |
|---|---|---|
| C19 | `Tie Out — Consideration vs. Deal Structure`: each comparison column's Total Consideration equals that structure's `Deal Structure` output | Keep: VAL row 37 (priority-3 red CF that survives Print mode) |
| C20 | `Tie Out — <Seller>'s Value by Source vs. Offer` and `Tie Out — Value by Source vs. Offer` equal zero per column | Keep: VAL rows 102, 111 ("Must equal zero") |
| C21 | Every shared-assumption row has Variance = 0 (a non-zero means a structure-specific input was typed into a shared row) | VAL "D = C" convention made testable |
| C22 | Every IRR helper strip has at least one negative and one positive flow; otherwise the IRR cell shows `n.m.` and the check reports it | VAL `IFERROR(IRR(),0)` prints 0.0% on failure, which reads as a real result |

### 5.7 Export: "Offer Structure Overview" (add to 5.12 or a new 5.15)

On request, the bot writes a PDF in the order OSO uses: model `Cover` (B25 "Offer Structure Overview", B26 the as-of date from `AsOfDate`), then `Offer Comparison`, then `Deal Structure` (one page per structure column group), then `Sensitivities`. It is printed with `PrintMode = 1`, with the 5.11 footer and page numbers. The file name is `<code_name> - Offer Structure Overview vNN.pdf`, never a throwaway name like "asd". It goes to the client, and to a counterparty only on Frank's instruction (Q26). It is never part of the CIM (D5).

### 5.8 Section 5.13 named outputs: add

`Offer_Count`, `Offer_Reference`, and per column i: `Offer_Headline_i`, `Offer_RiskAdj_i`, `Offer_CashAtClose_i`, `Offer_SellerMOIC_i`, `Offer_SellerIRR_i`. The engine exposes the same keys, so memo tables like OSC's are generated from them and cannot drift (OSC and V51 already disagree: OSC's 4.66x is VAL's; V51 prints 5.33x for the same label).

### 5.9 Section 6: add

> | Q26 | May the **Offer Structure Overview** (comparison + structure detail) go to a **counterparty**, as OSO appears to have (it sits in `03) Target Materials`), or only to AMB's client? In sell-side mode, should bidders be named or lettered (LOI A, LOI B)? | Client only; bidders by short name internally, lettered in any copy that leaves AMB | OSO is filed with target-facing materials; VAL names both principals ("Jon", "Ben") in row labels |

---

## 6. Guide edits at a glance

| HOUSE_STYLE.md location | Edit |
|---|---|
| 0.1 source key (after line 39) | Add OSO, OSA, OSC, BL (section 2) |
| 5.1 tab table (lines 714–715) | Insert `Offer Comparison` as #24; renumber |
| 5.5 line 848 | Replace "is a setting, not a copy" with 5.1's "column, not a copy" paragraph; add 5.3–5.5 as a new sub-block "**Offer Comparison**" after "Buyer debt service" |
| 5.7 checks (after line 894) | Add C19–C22 |
| 5.8 named styles | Add `AMB Key Rate`, `AMB Share Block` |
| 5.10 formats (after line 944) | Add the points format `#,##0.0" pts";\(#,##0.0" pts"\);"–"`; state that MOIC is always `0.00x` |
| 5.12 / new 5.15 | Offer Structure Overview export |
| 5.13 (line 1010) | Add the `Offer_*` names |
| 6 | Add Q26 |
| R-DEL row 7, §2.6, §15; R-MOD lines 309, 469 | Correct as in section 0 |
