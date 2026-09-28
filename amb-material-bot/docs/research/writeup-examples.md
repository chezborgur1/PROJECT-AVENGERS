# Pre-LOI and diligence write-ups: the quality benchmark, and a CIM section library built from it

Slice: Pre-LOI and diligence write-up examples. Sources are read-only, under `references/`:

| Short name | File | Date, author (from the "Last Updated" line) | What it is |
|---|---|---|---|
| **PreLOI-CPM** | `ICP Template/Examples/Pre-LOI Write up - CPM.docx` | Mar 8, 2025, Frank Moneymaker | Pre-LOI investment memo, CPM (St. Louis, MO) |
| **PreLOI-HOACS** | `ICP Template/Examples/Pre-LOI Write up - HOA Community Solutions.docx` | Dec 13, 2024, Jacob Teich | Pre-LOI memo, HOA Community Solutions (Gig Harbor, WA) |
| **PreLOI-Coral** | `01 Playbooks & Templates/Real Examples/TCC Prior Work/Pre-LOI Write up - Coral.docx` | Apr 17, 2025, Jacob Teich | Pre-LOI memo, The Coral Company (Independence, OH). QoE data already in hand, so it is in between a pre-LOI and a diligence write-up |
| **Dil-CPM** | `ICP Template/Examples/Diligence Write up - CPM.docx` | Jun 25, 2025, Aidan Donaldson | Diligence memo for the same CPM deal |
| **Dil-HOACS** | `ICP Template/Examples/Diligence Write up - HOACS.docx` | Aug 10, 2025, Jacob Teich | Diligence memo for the same HOACS deal ("Project Cruiser") |
| **Dil-Forth** | `01 Playbooks & Templates/Real Examples/TCC Prior Work/Diligence Write up - Forth Group.docx` | Jun 5, 2025, Aidan Donaldson | Diligence memo, Forth Group (Chicago, IL) |

Two duplicates, checked:
- `TCC Prior Work/Diligence Write up - CPM.docx` is byte-identical to the ICP Template copy.
- `TCC Prior Work/Pre-LOI Write up - CPM.docx` (0.81 MB) has the same content as the ICP Template copy (2.47 MB). A structural diff finds no differences except the style-name case. The larger file was re-saved in Microsoft Word, and its `app.xml` reports 9 pages and 846 words.

**What these documents are.** They are all buy-side investment-committee memos written for **The CAM Collective ("TCC")**, a roll-up of HOA / community-association management companies. The running header reads "NAME + The CAM Collective / *Prospective New Member (PNM) Write-up + Board Q&A*". A target is a "Prospective New Member" and an acquired one is a "Member Company" ("MC"). The docs started in Google Docs: the styles are stock Google Docs, every image has a zero `srcRect`, and the bullets are Google glyphs. They are not AMB-branded; they carry TCC's logo. They are still the most analytically complete narrative documents in the library, one of them was written by Frank himself, and they are the right benchmark for **content, analysis and voice**. They are not a benchmark for **visual execution** (section 9).

Method. I converted each docx to PDF with LibreOffice and rendered every page at 80 dpi (116 pages across the 7 files, 107 excluding the duplicate). I also built 2x2 contact sheets and viewed them, extracted every embedded image (87 placed images across the six documents) and viewed the key exhibits at native resolution, and sampled colours from them by pixel count. I dumped body structure, styles, headers and footers and run formatting with python-docx and raw XML. Working files are in `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/writeups/`.

---

## 1. Summary

1. **Two document types, one skeleton.** Every write-up opens with the same fixed "Deal Overview → tl;dr" bullet block: Thesis / Key stats / Opportunities / Considerations / Software and Banking / Ownership / Transition Plan / Other relevant info / Recommendation or Deal Terms. A one-paragraph "Transaction overview" follows. The rest is a run of **heading → pasted Excel exhibit → "Commentary" → "Source:"** units. The skeleton is consistent across three authors and nine months, so it is a house convention, not one person's habit.
2. **The pre-LOI to diligence step shows what "more informative" means.** For the same two companies, the page count roughly triples: CPM goes from 9 to 29 pages and 8 to 16 exhibits, HOACS from 7 to 23 pages and 4 to 19 exhibits. The diligence version adds a third-party QoE schedule, a QoE-vs-LOI bridge, Sources & Uses at several EBITDA definitions, a five-year underwriting model with a value-creation layer, a cohort analysis, Top 20, wins and losses, an employee retention roll-forward, a manager load table, market sizing, peer benchmarking, quantified opportunity sizing and a concentration deep-dive.
3. **The analytical core is strong and reusable.** The best patterns:
   - Retention roll-forwards in counts **and dollars** with Gross/Net Dollar Retention.
   - A "2019 - 2024 Median Retention" callout box inside the table.
   - Annual cohorts with gross and cumulative retention.
   - An EBITDA **definitions ladder** (Reported → Diligence-adjusted → Pro Forma → after-conversion → with identified uplift), with the multiple restated at each rung.
   - Opportunity sizing grids (benchmark gap × penetration ramp × contribution margin).
   - A single-customer P&L contribution analysis.
   - A market-share funnel.
   - An interest-rate sensitivity for rate-linked revenue.
4. **The voice is the best in the library.** Of the prose sentences in the three diligence write-ups, 40–59% contain a number. Mechanisms are stated ("either (a) were looking for a lower cost option or (b) switched to self management"). Judgements are explicit ("we do not propose recutting the deal economics; however, we will also not adjust the earnout thresholds"). Seller claims are attributed ("Sellers ascribe this success to…"). Average sentence length is 16–23 words.
5. **Density is lower than it looks.** Body prose runs **69–115 words per page** and **0.55–0.86 exhibits per page**. Mean vertical page fill is only **45–57%**, and 13 of Dil-CPM's 29 pages are less than 35% filled. The analysis is dense; the pages are not. The cause is pasting exhibits taller than the page, starting each exhibit on a new page, and leaving five diligence exhibits with no commentary at all (three in Dil-HOACS, one each in Dil-CPM and Dil-Forth).
6. **Every exhibit is a screenshot.** 76 exhibits: 75 pasted PNGs and one native Word table. They are 96–225 dpi (most 96–150). **55 of the 87 placed images are wider than the 6.5 in text block**, up to 13.9 in, so they clip at the right margin in both the Word and LibreOffice renders. Effective type in the dense tables is about **4–6 pt**; the MC Benchmarking grid is about 3 pt. There are no exhibit numbers, no captions and no action titles.
7. **The exhibits mix three visual systems.** (a) TCC's Excel house style: Arial, `#FFFFCC` key rows, `#CAEDFB` / `#DAE9F8` valuation blocks, blue `#0000FF` input fonts and green `#008000` link fonts left visible. (b) The QoE provider "CDS" style: Calibri, navy `#324E6B` header, `#C0E6F5` subtotal bands, green `#3C7D22` LOI column, orange `#BE5014` section labels. (c) A second QoE style: teal `#165A58` header, `#F2F2F2` bands, bracketed `[1]–[10]` references. Charts are Excel defaults with black outlines: maroon `#990033`, red `#FF0000`, slate `#44546A`, teal `#156082`, plus one Office-palette pie.
8. **Working capital, balance sheet, capex and cash flow are absent from all six.** The only balance-sheet mention is a Coral adjustment "to clean up their balance sheet". Accrual items (accrued payroll, prepaid insurance, bonuses) appear only as QoE adjustment lines. A bank-grade CIM has to add this section.
9. **Risk presentation works best as an inline "Mitigant:" sub-bullet** (Coral) plus dedicated deep-dive sections for the one or two issues that move value: "Potential Employee Classification Issue" (Forth) and "Customer Concentration" (Dil-CPM). Each is sized in dollars and multiple turns, and each has an explicit deal response.
10. **QA is the weakest part.**
    - Figures in the tl;dr routinely disagree with the exhibits (EV, cash at close, earnout hurdle, margin, maintenance share, CA count).
    - Placeholders ship: "[ ]", "TBD%", "PNM Logo Here", a stub "In", a stub "No".
    - A template bug repeats "Dec-28" twice in the valuation block of all three underwriting models.
    - Draft highlights ship: green `#00FF00`, yellow, `#E6B8AF`.
    - Excel artefacts ship: red dotted trace boxes, blue page-break borders, a "Page 1" watermark.
    - One exhibit footnote says an estimate was "provided by ChatGPT".
11. **For the CIM**, keep the content architecture, exhibit logic, row structures and voice. Rebuild every exhibit natively in AMB's identity with an action title, commentary beside it and a source line. Fill 75–85% of each page. Add the missing sections: working capital, cost structure and basis of preparation. The section library is in section 11.

---

## 2. Inventory and density metrics

Page counts are as rendered by LibreOffice. Word agrees for PreLOI-CPM (9 pages in `app.xml`). "Body words" counts paragraph and table text only, not the numbers inside exhibit images. "Prose sentences" are sentences in non-bullet paragraphs of more than 12 words.

| Doc | Pages | Body words | Words/pg | tl;dr bullets (words) | Exhibits | Exh/pg | Charts | Prose sentences with a number | Avg sentence | Mean page fill | Pages <35% filled | "Source:" lines |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PreLOI-CPM | 9 | 807 | 90 | 41 (330) | 8 | 0.89 | 0 | 13/27 (48%) | 16.0 w | 51% | 1 | 0 |
| PreLOI-HOACS | 7 | 794 | 113 | 40 (363) | 4 | 0.57 | 0 | 13/22 (59%) | 16.6 w | 50% | 1 | 4 |
| PreLOI-Coral | 14 | 1,606 | 115 | 61 (698) | 12 | 0.86 | 1 + org chart | 21/47 (45%) | 17.3 w | 57% | 4 | 6 |
| Dil-CPM | 29 | 1,995 | 69 | 49 (568) | 16 | 0.55 | 2 + org chart | 29/72 (40%) | 18.8 w | 49% | 13 | 0 |
| Dil-HOACS | 23 | 1,918 | 83 | 44 (354) | 19 | 0.83 | 2 + org chart | 43/77 (56%) | 19.1 w | 52% | 5 | 0 |
| Dil-Forth | 25 | 2,163 | 87 | 40 (477) | 17 (16 PNG + 1 native table) | 0.68 | 1 | 41/69 (59%) | 22.8 w | 45% | 9 | 0 |
| **Total** | **107** | **9,283** | **87** | | **76** | **0.71** | **6 charts, 3 org charts** | | | | **33** | **10** |

Exhibit image quality: displayed size against native pixels. Effective type size is estimated from glyph height, so it is approximate.

| Doc | Widest exhibit | Images wider than 6.5 in | Typical dpi | Smallest effective type (exhibit) |
|---|---|---|---|---|
| PreLOI-CPM | 12.56 in (Deal Structure Overview) | 2 / 10 | 96–139 | ~7.6 pt (Department Overview) |
| PreLOI-HOACS | 10.16 in (Deal Structure Overview) | 3 / 6 | 96–187 | **~2.8 pt** (MC Benchmarking, 1120x725 px squeezed to 5.99 in) |
| PreLOI-Coral | 13.90 in (Long-Term "Core" Revenue chart) | 10 / 14 | 96–152 | ~6.0 pt (Adjusted EBITDA) |
| Dil-CPM | 12.09 in (St. Louis Market) | 15 / 18 | 96–225 | ~5.6 pt (Annual Cohort Analysis), ~5.7 pt (Adjusted income statement bridge) |
| Dil-HOACS | 10.16 in (Key Stats Comps, FFR sensitivity) | 17 / 21 | 89–174 | ~4.7 pt (P&L Comparison), ~3.9 pt (seller's org chart) |
| Dil-Forth | 8.58 in (Underwriting Model) | 8 / 18 | 96–178 | ~4.2 pt (Cohort), ~4.5 pt (Employee Analysis) |

The pre-LOI to diligence step for the same companies:

| | CPM pre-LOI → diligence | HOACS pre-LOI → diligence |
|---|---|---|
| Pages | 9 → 29 | 7 → 23 |
| Exhibits | 8 → 16 | 4 → 19 |
| Key-stats period | "FY 2024" → "TTM Q1'25" | "TTM 7/31/24" → "TTM Apr'25" |
| Retention stat | "4-yr retention: 97% CA" → "4-yr average retention: 95% CA, 95% door, 98% net management fee" | "3-yr retention: 99% door, TBD% logo, TBD% employee" → "7-yr retention: 98% CA, 99% door, 88% employee" |
| EBITDA basis | Seller P&L + buyer's PF bridge → third-party QoE + PF + value-creation ("MTB") | Same progression, plus a QoE vs LOI reconciliation |
| Closing block | "Recommendation: Propose an LOI…" → "Deal Terms:" | "Recommendation:" → "Deal Terms: Revised Deal Structure" alongside the original |

---

## 3. Full section outlines (verbatim headings)

Style tags: **[T]** Title (26 pt, bold). **[H1]** Heading 1 (20 pt regular). **[H2]** Heading 2 (16 pt; bold in five docs, regular in Dil-HOACS). **[S]** Subtitle (15 pt `#666666`). **[C]** "Commentary" label. **[Src]** "Source:" line. Exhibit titles are the exhibit's own header, inside the image, as "Company / *italic subtitle*".

### 3.1 PreLOI-CPM (9 pp)
- Title block: [T] "Prospective New Member" / "CPM" (23 pt) / "St. Louis, MO" (18 pt); logos: TCC and Community Property Management
- "Last Updated: Mar 8, 2025 by Frank Moneymaker" (author hyperlinked)
- [H2] **Deal Overview**
  - [S] **tl;dr**: Thesis · Key stats (FY 2024) · Opportunities / Growth (2) · Considerations / Risks (4) · Software and Banking (5) · Ownership (3 holders, %) · Transition Plan › Roles · Other relevant info (CPM Data Room / Info Sheet / Diligence Workbook / Info Call, all hyperlinks) · **Recommendation:** (bold) › "Propose an LOI for an MC opportunity structured as: $20M EV @ Closing (~10x PF EBITDA, 8.6x TTM EBITDA)" › cash / note / earnout
  - [S] **Transaction overview** (1 paragraph, 97 words)
- [H2] **Transaction Details**
- [H2] **Preliminary Underwriting EBITDA and Valuation (Member Company)**: exhibit "CPM / *Deal Structure Overview (Figures in $000s)*", then run-in labelled paragraphs: *PF EBITDA:* · *Valuation:* · *Seller Note:* · Earnout: (label not italicised, unlike the others) · *Employment Agreement:*
- [S] **Summary Income Statement**: "*P&L Summary ($000s)*" (2023 / 2024), [C]
- [S] **Revenue Breakdown**: "*Revenue Analysis ($000s)*" (2023A / 2024A; Revenue Share; Revenue Growth), [C] (contains a yellow-highlighted "[ ]")
- [S] **Customer Analysis**: "*Annual Customer Retention Analysis*" (2021A–2024A), [C]; Geography table (CAs / Units / % CAs / % Units by STL, IL, Columbia)
- [S] **Employee Breakdown**: "*Employee Summary ($000s)*" › Department Overview, [C]; Executives, [C]; Recent Hires, [C]

### 3.2 PreLOI-HOACS (7 pp)
- Title block (no running header in either HOACS doc) · "Last Updated: Dec 13, 2024 by Jacob Teich"
- [H2] **Deal Overview** › [S] **tl;dr**: Thesis · Key stats (TTM 7/31/24) · Opportunities / Growth (2) · Considerations / Risks (2; one bullet underlined) · Software and Banking · Transition Plan › Roles; "Who is there now that won't be there post-close?" · Other relevant info (5 links incl. "Pre-LOI Databook", "PD Call") · Recommendation (EV, cash, note, earnout, plus a rationale bullet on the larger note "for tax reasons")
- [S] **Transaction overview** (the next heading, "Transaction Details", has been merged into the end of this paragraph as plain text)
- [S] **Preliminary Underwriting EBITDA and Valuation (Member Company)**: Deal Structure Overview with an Earnout block, [C] › *PF EBITDA:* / *Valuation:* / *Seller Note:* / Earnout: / *Employment Agreement:*, [Src]
- [S] **Customer Retention Analysis**: Doors retention 2020A–YTD Nov'24, [C], [Src]
- [S] **Employee Breakdown**: named roster (Name / Title / 2024 Comp) with counts of owners, CAMs and other employees, [C], [Src]
- [S] **MC Benchmarking**: Future Assumptions box, then HOACS Today / Pro Forma / Future against 10 existing Member Companies, [Src], [C]

### 3.3 PreLOI-Coral (14 pp)
- Title block · "Last Updated: Apr 17, 2025 by Jacob Teich"
- [H2] **Deal Overview** › [S] **tl;dr**: Thesis (plus 3 sub-bullets: relationship history; the prior IOI "in May'24 at 7.0x EBITDA ($300K of EBITDA) plus a 3-yr earnout"; the Jun'24 cyber attack and counsel's view) · Key stats (TTM 1/31/25) · Opportunities / Growth (4) · Considerations / Risks (2, each with a **Mitigant:** sub-bullet) · Software and Banking · Transition Plan (4 named executives with duties) · Other relevant info (7 links incl. dated call notes) · Deal Structure
- [S] **Transaction overview**
- [H2] **Transaction Details** › [S] **Underwriting EBITDA and Valuation (Member Company)**: "Project Coral / *Adjusted EBITDA*" (QoE) + "*Sources & Uses ($M)*". [C] covers the revenue basis, then *Adj. EBITDA:* with bulleted Adjustments 1 / 3 / 4 / 6, then *PF EBITDA:*, *Valuation:*, *Seller Note:*, Earnout:, *Employment Agreement:*. [Src]
- [S] **Customer Analysis**: Active Customer Overview; Annual Customer Retention Analysis; Adj. Association Retention (excludes acquired CAs); Property Retention (Commercial, Rental, Other); [C] (2 paragraphs), [Src]
- [S] **Employee Breakdown**: Annual Employee Retention Analysis (Total / On-Site / Corporate); Employee Analysis (2023A / 2024A / Current May'25 / % Delta); seller's org chart; [C] (3 paragraphs), [Src]
- [S] **Long-Term Financials**: chart "Long-Term "Core" Revenue Performance: 2016 - Current PF" with a "Revenue CAGRs ('16 - '24)" box, [C], [Src]
- [S] **On-Site Payroll Markup Opportunity**: "*EBITDA Growth Opportunities Overview ($000s)*", [C] + a bold fact line, [Src]
- [S] **Capital Projects Billing Opportunity**: same exhibit format, [C], [Src]

### 3.4 Dil-CPM (29 pp)
- Title block · "Last Updated: Jun 25, 2025 by Aidan Donaldson"
- [H2] **Deal Overview** › [S] **tl;dr**: Thesis · Key stats (TTM Q1'25) · Opportunities / Growth (**7**) · Considerations / Risks (2) · Software and Banking · Ownership (full names) · Transition Plan · Other relevant info · **Deal Terms:** (EV; cash; seller note "(18 months, 6.5% interest, quarterly interest and principal payments)"; retention earnout; performance earnout)
- [S] **Transaction overview** (2 paragraphs, 176 words)
- [H2] **Transaction Details** › [H2] **Underwriting EBITDA and Valuation (Member Company)**: QoE "Adjusted EBITDA" + "CPM / *Sources & Uses ($M)*" with a Notes block. Then *Adjusted EBITDA:* (bullets Adj. 1–4 + PF), then a **shaded callout** (`#E6B8AF` fill, bold) reconciling to LOI EBITDA, then *Valuation:* / *Seller Note:* / *Retention Bonus:* / *Earnout:* / *Employment Agreement:*
- [S] **Org Chart**: a hand-drawn arrow diagram (~4 pt labels) + 1 paragraph
- [S] **Reported Revenue Breakdown**: "*Revenue Summary ($000s)*" (by market: STL / IL / Columbia / ACCT; FY + TTM + YTD Q1; % Growth; % of Total Revenue), [C] (3 paragraphs; one is set in Subtitle style by mistake)
- [S] **Summary Income Statement**: QoE "Adjusted income statement bridge", [C]
- [S] **Underwriting Model**: "*Summary P&L Forecast ($000s)*"; commentary is a stub reading "In"
- [S] **Customer Analysis**: Active Customer Overview (Total / Missouri / Illinois); Annual Customer Retention Analysis (Consolidated / Missouri / …; the image is 15.1 in tall and clipped); [C] (2 paragraphs)
- [S] **Employee Breakdown**: Annual Employee Retention Analysis (7 departments); Employee Analysis ($000s); [C] (2 paragraphs)
- [S] **Business History**: "*Long-Term Client Growth (2000 - 2025)*" bar chart with ★ "Portfolio acquisition" markers; "*Annual Cohort Analysis*"; [C]
- [S] **St. Louis Market**: "*Market Growth and Market Share Analysis*" (population chart 2001–2024, Population CAGRs box, Market Sizing and Share Estimate funnel, Primary Competitors list), [C] (2 paragraphs)
- [S] **Addendum Billing Opportunity**: "Addendum Comps Detail (as of Oct' 24)" + projection ramp; 2 paragraphs
- [S] **Customer Concentration**: "*Brentwood Revenue & EBITDA Analysis ($000s)*"; 2 paragraphs

### 3.5 Dil-HOACS (23 pp): the only one with a real three-level hierarchy
- Title block · "Last Updated: Aug 10, 2025 by Jacob Teich"
- [H2] **Deal Overview** › [S] **tl;dr** (Key stats TTM Apr'25 · 4 opportunities · 1 risk with sub-bullet · Software · Transition · Other relevant info · **Deal Terms:** › "Revised Deal Structure" and the original structure side by side)
- [H1] **Transaction overview**
  - [H2] **Valuation & Earn-Out Structure**: S&U (x MGMT LOI EBITDA / x Dil. Adj EBITDA), [C]; "Assumes $1M Increase in Cash at Closing Case" revenue earn-out grid; *Valuation* / *Seller Note* / *Earnout* / *Employment Agreements*
  - [H2] **QoE vs. LOI EBITDA Bridge**: "Project Cruiser EBITDA Recon to LOI", [C]; "*ERC / Transfer Fee Underwriting Analysis*" + Terminal Fed Funds Rate sensitivity grids, [C]
  - [H2] **Underwriting Model and MTB Plan**: Summary P&L Forecast with two valuation blocks, [C] (4 paragraphs, one per lever)
  - [H2] **Key Stats Comps Table**: "*P&L Comparison ($000s)*" (HOACS LTM / FY25E / FY29E vs "Close Peers" CMC, PAMco vs 13 "Existing MC Data as of TTM Oct'24"), [C] (2 paragraphs)
- [H1] **Summary Income Statement**: "*Historical P&L Summary ($000s)*" Dec-19 → LTM, [C]
  - [H2] **Long-Term Revenue Performance: 2019 - LTM Apr'25**: stacked column chart (no commentary)
  - [H2] **Revenue Breakdown (% of Total)**: pie + table (no commentary)
- [H1] **Customer Overview**: exhibit, [C]
  - [H2] **Customer Retention** · [H2] **Customer Wins & Losses** · [H2] **Top 20 Customer Overview** · [H2] **Annual Cohort Analysis** (no commentary). Each other subsection has [C].
- [H1] **Employee Overview**: Employee Analysis, [C]
  - [H2] **Employee Retention Analysis** · [H2] **Manager Portfolio Analysis** · [H2] **Org Chart** (seller's chart, 3 paragraphs on people and succession)

### 3.6 Dil-Forth (25 pp)
- Title block · "Last Updated: Jun 5, 2025 by Aidan Donaldson"
- [H2] **Deal Overview** › [S] **tl;dr**: Key stats (TTM 3/31/25) now carry the LOI comparison ("We had estimated $747K of PF EBITDA in the LOI") · 4 opportunities (2 highlighted bright green) · 3 risks (1 highlighted) · Transition Plan (3 named roles, 2–4 duties each) · Other relevant info. There is no Deal Terms bullet, and Software moves to a closing table.
- [S] **Transaction overview**
- [H2] **Transaction Details** › [S] **Preliminary Underwriting EBITDA and Valuation (Member Company)** (the "Preliminary" title was not updated for diligence): S&U ($000s); [C] › *Valuation:* (2 paragraphs) / *PF EBITDA:* / *Bonus Compensation:* (ends with a stray "No") / *Employment Agreement:*
- [S] **QoE LOI Bridge**: "Forth Group EBITDA Recon to LOI"; run-in "Commentary:"
- [S] **Earnings Credit Opportunity**: "*Wintrust Bank ERC Impact ($000s)*" + "EBITDA Impact at Various EFFRs"
- [S] **Potential Employee Classification Issue**: "*Independent Manager Conversion Analysis*"; 2 paragraphs
- [S] **Underwriting Model** · [S] **Historical P&L Overview** · [S] **Customer Overview** · [S] **Customer Growth & Retention Analysis** (3 paragraphs) · [S] **Top Customers** · [S] **Customer Cohort Analysis** · [S] **Employee Overview** (4 paragraphs) · [S] **Employee Retention** · [S] **Manager Department Overview** · [S] **Chicago Market Share Analysis** · [S] **Long-Term Revenue Evolution** (no commentary)
- [S] **Software and Banking**: the only native Word table in the six docs. 2 columns, "Topic | Provider and Commentary", header fill `#D1D1D1`, 7 rows ending with a 4-line "Payment Processor" cell.

---

## 4. The tl;dr block: the most reusable device

A fixed nine-part skeleton, as nested bullets (● ○ ■ ●, four levels), 330–698 words:

| # | Bullet (verbatim label) | Content pattern | Best example (verbatim) |
|---|---|---|---|
| 1 | **Thesis:** | One sentence: "Acquire a [scale], [growth] management company in the [metro] with [differentiator]" | "Acquire a large, growing association management company in our core Chicago market serving small and mid-size condos (similar to W360 customer base)" (Forth) |
| 2 | **Key stats (TTM 3/31/25):** | Revenue / core fees / EBITDA (margin); units (CAs, doors, FTEs, with composition); N-yr retention (logo, unit, $, employee); labour ratio ("CAM Cut"); revenue mix in % summing to 100 | "6-yr retention: 95% association, 94% door, 79% employee" · "Revenue Mix: 74% mgmt fees, 5% transfers, 5% earnings credits, 5% maintenance income, 4% other fees, 4% credit card fees, 1% addendum" (Forth) |
| 3 | **Opportunities / Growth:** | 2–7 levers, each with a current state and a benchmark or dollar size | "Very limited addendum billing today… Only $0.4/door of addendum billing vs. our other Chicago MCs are near $10/door" (Forth) |
| 4 | **Considerations / Risks:** | 1–4 risks, the best with a nested **Mitigant:** | "Potential for future customer churn after the cyber attack › Mitigant: … the impacted customer agreed to a non disclosure agreement after being made whole … › We continue to view this risk as limited. TTM retention is 92% and no signs that they are losing clients this year." (Coral) |
| 5 | **Software and Banking:** | Client Accounting / Corporate Accounting / Transfer & Resales / Payroll / Client Banking | "Client Accounting: Vantaca (transition from VMS in H2'24) › Transition is fully complete" (Dil-HOACS) |
| 6 | **Ownership:** | Holder (role): % | "Bob Klages (CEO): 47.5%" |
| 7 | **Transition Plan:** | Roles; "Who is there now that won't be there post-close?" | "Scott is 64 years old and would like to transition out over the next 2-3 years (may move to Utah with his wife)" (Forth) |
| 8 | **Other relevant info:** | Hyperlinks to Data Room, Info Sheet, Diligence Workbook, call notes | (internal only) |
| 9 | **Recommendation: / Deal Structure: / Deal Terms:** | EV @ close (x multiple on named EBITDA), cash, seller note terms, earnout formula | "2026 earnout paying 12x any incremental EBITDA above $3.0M" (Dil-CPM) |

Why it works: every bullet is a fact or a number, nothing is decorative, and the order follows how an investment committee reads a deal. For a CIM, bullets 1–4 and 6–7 become the Executive Summary: a "Key Metrics" table plus "Investment Considerations". Bullet 5 becomes a Technology page and bullet 9 becomes the process page. Two weaknesses:
- The Key stats bullets use a different period basis from the exhibits: "FY 2024" in the text, "TTM25" in the exhibits.
- They often disagree with the exhibits (section 8).

---

## 5. Typography and layout system

### 5.1 Page and text styles (from `styles.xml`, sections and run formatting)

| Element | Spec (measured) |
|---|---|
| Page | US Letter portrait, 8.5 x 11 in; margins 1.0 in all sides; header and footer distance 0.5 in; text block 6.5 in |
| Default font | **Arial 11 pt**, line spacing 276 (1.15x); black body text |
| Title | "Prospective New Member": Title style (26 pt) with bold run |
| Company name / location | 23 pt regular / 18 pt (CPM) or 23 pt (others) |
| Heading 1 | 20 pt regular, 20 pt before / 6 pt after (used only in Dil-HOACS) |
| Heading 2 | 16 pt, 18 pt before / 6 pt after; bold run in five docs, regular in Dil-HOACS |
| Subtitle | **15 pt `#666666` regular**, 16 pt after. Used as the working section heading ("tl;dr", "Transaction overview", "Customer Analysis", "Employee Breakdown"…) |
| Heading 3 / 4 | 14 pt `#434343` / 12 pt `#666666` (defined, never used) |
| Labels | "Commentary" underlined, on its own line or run-in with a colon (Forth); term labels italic run-ins: *PF EBITDA:*, *Valuation:*, *Seller Note:*, *Retention Bonus:*, *Employment Agreement:* |
| Running header | Left: "NAME + The CAM Collective" (13 pt bold), then "*Prospective New Member (PNM) Write-up + Board Q&A*" (11 pt italic). Right: a 0.70 x 0.42 in `#CFE2F3` box reading **"PNM Logo Here"** (an unfilled placeholder in 4 of 6 docs), then the TCC logo. Thin rule below. |
| Footer | A typed line of underscores as the rule, page number right-aligned |
| Title block | 2-column borderless table: title stack left, TCC logo and target logo right; then "Last Updated: <date> by <author link>" |
| Lists | Google Docs glyphs ● ○ ■ ●, about 0.5 in per level, up to 4 levels |

### 5.2 Exhibit table system: TCC's Excel house style (pasted as images)

- **Exhibit header** inside the image: company name bold (≈14–16 pt Arial), then an *italic* subtitle with units ("*P&L Summary ($000s)*", "*Deal Structure Overview (Figures in $000s)*", "*Annual Customer Retention Analysis*"), then a black rule across the full width.
- **Column headers:** bold, bottom border. Group headers are centred over a rule ("Historical Period" | "TCC Projections" | "CAGRs"; "Fiscal Year End" | "YTD Q1"; "2021 - 2024 Stats" | "Current"). Dotted vertical separators divide historical from projected columns.
- **Period labels:** "2023A", "Dec-22", "LTM Mar", "TTM Q1'25", "YTD Nov'24", "Mar'25 LTM", "Current May'25", "'22 '24" (CAGR). There are several variants within a single document.
- **Rows:**
  - Section labels are underlined ("Key Stats", "Revenue", "Expenses", "MTB Revenue", "Department Overview").
  - Signed labels: "(+) New Customers", "(-) Customer Churn", "(-) Replacement CEO".
  - Italic ratio rows: "% Growth", "% Margin", "% of Total".
  - Totals are bold with a top rule. Key totals take a **`#FFFFCC` fill with a box border**. EBITDA takes a double underline.
- **Numbers:** $ on the first and total rows only; negatives in parentheses; zero shown as "–"; multiples "10.0x"; % without decimals in tables (one decimal in QoE schedules).
- **Signal colours left visible from the model:** input font blue **`#0000FF`** (7.0x, 20%, 8.0x); cross-sheet link font green **`#008000`** ($688, $150); valuation block fill **`#DAE9F8`** or **`#CAEDFB`**; assumptions box fill **`#F2F2F2`**; not-applicable cells hatched with a grey stipple.
- **In-table callout:** a light-blue boxed banner across the history columns reading "2019 - 2024 Median Retention  95%" (or "Jan 2019 - Oct 2025 Avg. Retention 98%"). This is the most elegant device in the set: the summary statistic sits on the table it summarises.
- **Comment column:** an italic column right of the numbers explaining each input ("Dec '24 mgmt. fees x 12", "Assumes $200k…", "Owner's cabin at Mt. Rainier that employees use sometimes", "Juanita's monthly distributions (in addition to her salary)").
- **Artefacts:** a blue Excel page-break border (`#0000D0`) frames many Dil-CPM exhibits; red dotted trace/selection boxes appear in Coral and Forth exhibits; one Coral org chart carries a grey "Page 1" watermark.

### 5.3 QoE provider schedules (pasted as-is)

| Style | Where | Spec |
|---|---|---|
| "Adjusted EBITDA" / "Adjusted income statement bridge" | Coral, Dil-CPM | Header bar dark teal **`#165A58`**, white bold; "$'000"; subtotal bands `#F2F2F2`; references `[1]`–`[10]`; diagonal hatch for n/a cells; rows (verbatim): Revenue, reported · Revenue, due diligence adjusted · Revenue, pro forma adjusted · Net income · Taxes · Depreciation · Interest expense, net · **EBITDA, reported** · *EBITDA margin, reported* · Due diligence adjustments [1]…[8] · Total due diligence adjustments · **EBITDA, due diligence adjusted** · Pro forma adjustments [9] [10] · **EBITDA, pro forma adjusted**. Columns FY22 / FY23 / FY24 / TTM25 / PF run rate. The bridge version adds "% of pro forma revenue". |
| "Project Cruiser EBITDA Recon to LOI" / "Forth Group EBITDA Recon to LOI" | Dil-HOACS, Dil-Forth | **Calibri**; column groups "CDS" (navy **`#324E6B`**), "LOI" (green **`#3C7D22`** header, **`#DAF2D0`** fill), "Difference to" (black header, `#F2F2F2`); subtotal rows light blue **`#C0E6F5`**; tier labels orange underlined **`#BE5014`**: "Definitional Adjustments" (keys i, ii, iii, iv) → "Management Adjustments" (A, B, C) → "Diligence Adjustments" (1–5) → "Pro Forma Adjustments" (PF1–PF5) → "Conversion Adjustment". Each tier ends in a named EBITDA (Definitional / Management Adjusted / Diligence Adjusted / Pro Forma Adjusted / W-2 Conversion Adjusted / "@ Close Effective EBITDA") with an italic % row. |

### 5.4 Charts (6 in total, all Excel, pasted)

| Chart | Type | Colours (sampled) | Annotations |
|---|---|---|---|
| Coral "Long-Term "Core" Revenue Performance: 2016 - Current PF" | Stacked column, 10 bars ($M) | `#990033` mgmt fees, `#FF0000` transfer, `#44546A` addendum; black outlines | Bold totals above bars ("$2.9"), white segment labels, legend below, companion "Revenue CAGRs ('16 - '24)" box with a `#FFFFCC` total row |
| Dil-HOACS "Long-Term Revenue Performance: 2019 - LTM Apr'25" | Stacked column, 7 bars ($000s) | `#990033`, `#FF0000`, `#78206E`, `#83CBEB`, plus 2 more | Totals above; tiny segment labels overlap ("7", "12") |
| Dil-HOACS "Revenue Breakdown (% of Total)" | **Pie** | Office 2023 palette: `#990033`, `#E97132`, `#0E2841`, `#BFBFBF`, `#A02B93` | % labels; the table beside it duplicates the data |
| Dil-CPM "Long-Term Client Growth (2000 - 2025)" | Column, 26 bars | `#990033` | ★ "Portfolio acquisition" markers above 2013 and 2020: a good event annotation. Labels rotated 45°. |
| Dil-CPM St. Louis population 2001–2024 | Column | `#156082` | "Population CAGRs" box (2001–2009 0.5% … 2001–2024 0.1%) |
| Dil-Forth "Annual Revenue ($M)" 2003–2024 | Column, 22 bars | `#156082` | "Revenue CAGRs" box: '03-'10 28%, '10-'20 5%, '20-'24 22%, '03-'24 16% |

Two chart habits to keep: a **CAGR box next to every long-run series**, and **event markers** such as acquisitions. Four to drop: black outlines, the pie, rotated labels, and the red/maroon/purple/cyan mix.

### 5.5 Colour inventory (all six docs)
- TCC exhibit fills: `#FFFFCC`, `#DAE9F8`, `#CAEDFB`, `#F2F2F2`, `#CFE2F3` (header box).
- Fonts: `#0000FF`, `#008000`.
- QoE: `#165A58`, `#324E6B`, `#C0E6F5`, `#3C7D22`, `#DAF2D0`, `#BE5014`.
- Charts: `#990033`, `#FF0000`, `#44546A`, `#78206E`, `#83CBEB`, `#156082`, `#E97132`, `#0E2841`, `#A02B93`.
- Seller org charts: `#7030A0`, `#92D050`, `#4172B0`, `#7EAB55`.
- Word highlights: yellow, green `#00FF00`, shading `#E6B8AF`; table header `#D1D1D1`; text `#666666`, `#434343`.

That is 30+ colours with no system. Of these, only `#990033` sits near AMB's crimson family (see `decks-brand.md`: logo `#9E0A20`).

---

## 6. How each topic is presented

### 6.1 Business overview
- **Form:** a 1–2 paragraph "Transaction overview" (83–176 words) plus the tl;dr key stats.
- **Fixed order of facts:** HQ and metro context → headcount → customers and units → portfolio mix (% by type) → ownership % and founding year → seller motive and timing → relationship or competitive dynamics.
- **Verbatim:** "HOA Community Solutions, based in Gig Harbor, WA (Seattle metro area, near Tacoma) is an association management company with 34 employees serving 188 CAs and 21K units. The portfolio is approximately 60% HOAs and 40% condo associations. The Company is 100% owned by Juanita Carbaugh who founded the Company in 2008. … We believe that Juanita has had conversations with a few other potential buyers recently."
- **Deepened in diligence by:**
  - A "Business History" long-run chart with acquisition markers and an annual cohort table (Dil-CPM).
  - A "Long-Term Revenue Evolution" 2003–2024 chart with CAGR windows (Forth).
  - Service-model detail (full-service / financial-only / hybrid / remote) inside Customer Overview.
- **Weak:** no services description, no history narrative beyond one line, and no locations exhibit other than the CPM Geography table. The services and revenue model is explained only indirectly, through revenue lines.

### 6.2 Market
- **Present only in Dil-CPM and Dil-Forth**, each as one exhibit and one or two paragraphs.
- **Funnel format (Dil-CPM, verbatim rows):** Estimated CAs in Missouri 5,000 · Total Population of Missouri 6,245 · % Population in STL Metro 36% · **Implied STL CAs 1,806** · x % CAs Using Outsourced Management 65% · **Current Addressable CAs in STL Metro 1,174** · CPM STL CAs 204 · **CPM Market Share (CA Count) 17%**. Next to it: "Primary Competitors in STL (Per CPM Mgmt.)" (Sentry, DNI Properties, Community Manager Associates, Smith Management (Associa)).
- **Forth version:** Total CAs in Illinois 18,800 → Est. CAs in Chicago Metro 13,904 → Est. % Self Managed 35% → Est. Managed CAs 9,038; then platform presence (W360 817, FCM 134, Hales 201, Hillcrest 152, Forth Group 172 = 1,476) → "TCC Market Share (All CAs) 11%" / "(Excl. Self-Managed) 16%".
- **Demographics:** a population series with CAGR windows, interpreted candidly: "The St. Louis metro area has a large population but population growth has been flat over the last 20+ years."
- **Peer benchmarking** is the other market lens: "MC Benchmarking" (pre-LOI) and "Key Stats Comps Table" (Dil-HOACS). Target Today / Pro Forma / Future is set against 10–15 peers on units, fee per door, CAM cut, portfolio load, salaries, revenue lines, personnel % of revenue and "NOI / "EBITDA"" margin.
- **Weak:** the market is framed as a share of a local count with no growth drivers, no industry structure, no pricing trends and no regulatory context. The sources for "Estimated CAs in Missouri 5,000" are not given.

### 6.3 Customers (the deepest area)

Exhibit types, with the verbatim row structure:

1. **Active Customer Overview** (by type: Condo / HOA / Townhome / Rental / Other / Total). Blocks:
   - Customer Breakdown: Association Count, % of Total, Door Count, % of Total, Monthly (or Annualized) Mgmt. Fee Amount, % of Total.
   - A `#FFFFCC` band: Avg. Monthly Mgmt. Fee / CA, Avg. Monthly Mgmt. Fee / Door, Avg. Door / CA.
   - Customer Count Based on Size (>2500 / <2500 >1500 …, or ≥$1,500 / <$1500>$600 / <$600).
   - % of Total Customers.
   - Annual Mgmt. Fees Based on Size.
   - CA Count Based on Service Type (Hybrid / Financials Only / Full Management / Basic Management / Onsite).
   - Avg. Monthly Fee Based on Service Type.
   - Repeated by geography in Dil-CPM (Total / Missouri / Illinois).
2. **Annual Customer Retention Analysis**. Three stacked roll-forwards:
   - "Association Retention (Count)": Prior Year Association Count · (+) New Customers · (-) Customer Churn · Ending Association Count · *New Customers as % of Beginning Count* · *Average Associations* · **Association Retention Rate**.
   - "Door Retention (Count)", with the same rows.
   - "Mgmt. Fee Retention ($000s)": Prior Year Mgmt. Fees · (-) Customer Churn · (-) Existing Customer Decrease (Downsell) · (+) Existing Customer Increase (Upsell) · (+) New Customers · Total Mgmt. Fees · **Gross Dollar Retention** · **Net Dollar Retention**.
   - Then Average Monthly Mgmt. Fee / Lost Customer · / New Customer · Average Mgmt. Fee / Lost Units · / New Units · Avg. Door / CA.
   - Columns 2019A–2024A, then YTD, then a separate TTM column; the median or average callout banner sits on top.
3. **Segmented and adjusted retention** (Coral): "Adj. Association Retention (Condo, HOA, Townhome): Excludes Acquired CAs", with a text box inside the table ("This excludes 16 CAs that Coral acquired in 2020 (majority churned in 2021)"). "Property Retention (Commercial, Rental, Other)" is shown separately because it churns differently.
4. **Annual Cohort Analysis**: Association Count and Door Count side by side; rows Legacy, 2019 Cohort … 2025 Cohort, Total Count; then "% Gross Retention" and "% Cumulative Retention" triangles.
5. **Top 20 Customer Overview**: Mgmt. Fees · Units · Monthly Fee / Unit · Type · On-Site? · Start Date · Tenure · % Total; rows Top 20 Total / Remaining Customers / Total Customers.
6. **Largest Customer Wins & Losses By Year** (Dil-HOACS): top 5 wins and top 5 losses for each of 2022–2025, with Type, Tenure, Monthly Mgmt. Fee and # of Doors, then "Others" and "Total Customer Wins / Losses".
7. **Single-customer contribution** (Dil-CPM "Brentwood Revenue & EBITDA Analysis ($000s)"): the customer's EBITDA is built by revenue stream. Mgmt. Fee EBITDA Contribution $74 · Bid Job EBITDA Contribution $148 · Maintenance EBITDA Contribution $87 · ECR EBITDA Contribution $90 · **Total EBITDA Contribution $398** against **LOI EBITDA $2,366**. Each cost line carries a basis ("Assumes 15% T&B", "Per Mgmt. Guidance"). This is a best-practice concentration exhibit.

Commentary pattern: the level, then the cause of churn, then the source of growth, then a pricing observation. Verbatim: "Recent portfolio growth has largely been fueled by clients transitioning from other management companies, accounting for roughly 70% of new business. … Juanita acknowledges that she frequently offers new contracts at lower rates than competitors, suggesting potential room for strategic pricing adjustments post-close."

Weak: no revenue concentration curve, no customer names coded for confidentiality (all are real names), no contract-term or renewal-schedule exhibit, and a pre-LOI mislabel ("Doors Retention (Count)" actually counts CAs: 146 → 244).

### 6.4 Financial performance
- **Summary Income Statement / Historical P&L Summary** (Dil-HOACS, Dil-Forth):
  - Columns Dec-19 → Dec-24 + LTM.
  - Revenue lines, then "Total Revenue (Excl. On-Site)".
  - "RR Adjustments" (Current Mgmt. Fees RR), then Total RR Adj. Revenue.
  - A KPI block: Average # of Associations, Average # of Doors, Monthly Mgmt. Fee / Door ($), Monthly Transfer Fee / Door, Monthly Addendum Fee / Door.
  - Expenses: Payroll, IT Costs, Rent & Facility, Sales & Marketing, Insurance, Other.
  - **QoE Adj. EBITDA** and % Margin, then Run-Rate Adjustments, then **Run-Rate EBITDA**.
  - Forth adds "PF Adjustments" (Controller Hire, Removing Scott's Compensation, Exec Pay Increases, Removing Accounting Fees, Manager W-2 Conversion), then **PF Adj. EBITDA**.
  - The KPI block embedded in the P&L is a strong idea: unit economics sit right next to the dollars.
- **Revenue Breakdown / Revenue Summary:** revenue by line, and by market in Dil-CPM (Mgmt. Fee - STL / IL / Columbia / ACCT), with three blocks: $ · % Growth · % of Total Revenue. Columns are FY, TTM and YTD comparatives (Mar-24 vs Mar-25).
- **Underwriting model** ("*Summary P&L Forecast ($000s)*"):
  - Key Stats (Average # of Associations, EOY Association Count, Yearly Association Wins, Average # of Doors, EOY Employee Count, Yearly Employee Hires, CAM Load).
  - Revenue by line, then Total Revenue (Excl. On-Site), then **MTB Revenue** (value-creation levers by name: Improve ECR Agreement, CVPS, Ilum Telecom, Addendum Billings, Maintenance Expansion, Transfer Pricing), then Total PF Revenue, then On-Site Reimbursements, then Total Revenue.
  - Expenses, then **Diligence Adj. EBITDA**, then MTB Earnings, then **PF MTB EBITDA**, then CAGRs '22–'24 and '25–'29.
  - Finally "Valuation Consideration & Implied Multiple (Baseline EBITDA)" and "(MTB EBITDA)" blocks in `#CAEDFB`. These show cumulative consideration (cash, earnout, seller note, retention bonus) against each year's EBITDA: **Implied Multiple** 11.4x @ close → 6.7x by 2029 (Dil-CPM).
- **Commentary** covers growth drivers and mix shift, and flags one-offs with a cause and a time profile. Verbatim: "Bid job income tripled from '23 to '24, driven by a single large roof replacement project, and has reverted towards historical performance over the TTM period." Also: "a project to replace approximately 1,700 decks across the association. As of Q1'25, approximately 300 have been completed, and management estimates the project to continue for another ~3 years."
- **Weak:**
  - No monthly or quarterly trend or seasonality.
  - No cost-structure exhibit (% of revenue by bucket) outside the comps table.
  - Two long-run charts with no commentary (Dil-HOACS).
  - The pre-LOI P&L Summary and Revenue Analysis repeat the same nine revenue lines.
  - The margin denominator is never stated: Coral's tl;dr says 19%, its exhibit says 7.9%.

### 6.5 Quality of earnings and adjusted EBITDA
- **Pre-LOI (buyer's own bridge), "Deal Structure Overview (Figures in $000s)", verbatim rows:**
  - NOI (reported bottom line).
  - Annualized current mgmt. fees · (-) LTM mgmt. fees → **Net Revenue Pro Forma**.
  - Est. Payroll: Annualized current payroll · (-) LTM payroll costs → **Net Payroll Pro Forma**.
  - CEO's Salary · (-) Replacement CEO · President's Salary · (-) Replacement Controller → **Net Replacement Costs**.
  - Non-Recurring / EBITDA Adj.: Depreciation · Owners' Personal and Auto Expenses → **Other Add-Backs Total**.
  - **TTM PF Adj. EBITDA**.
  - Valuation Multiple (Rounded) → **Total Valuation @ Closing** (blue box) → Valuation Multiple (Exact) · Valuation Multiple (Mgmt. NOI) → Note/Escrow - % of Transaction Value → Value at Closing (Note / Escrow, Cash).
  - HOACS adds an Earnout block (EBITDA At Closing (2024E) · Expected 2025B EBITDA · Expected 2026B EBITDA · Actual TTM EBITDA at earnout · Incremental · Earnout Multiple · Total) and lists every owner add-back item by item, each with a basis comment ("Owner's cabin in mountains 48", "Charity donations 50", "Owner's distributions 112").
- **Diligence (third-party QoE, section 5.3)** plus the buyer's commentary. The commentary numbers each adjustment in a single line: "Adj. 1 is a correction to the timing of revenue and expense recognition on a large capital project completed primarily in Q1'24 · Adj. 2 normalizes out of period items, the largest drivers being reimbursements for employee insurance and a gain generated from writing off old payables · Adj. 3 reflects one time cybersecurity upgrades completed in 2024 · Adj. 4 normalizes prepaid insurance from cash to accrual".
- **Reconciliation to the earlier figure** is always explicit:
  - A four-column "Difference to" block in the recon schedules.
  - A shaded callout in Dil-CPM: "**LOI EBITDA was $2.37M; the PF Adj. EBITDA reflects a decline of ~$50k. The decrease from bid EBITDA was driven by an especially large capital project rolling out of the TTM period (the business has otherwise seen strong growth over the past year).**"
  - A one-sentence verdict in Dil-HOACS: "Our QoE Diligence Adj. EBITDA is 8% higher than we initially underwrote at LOI, primarily due to additional personal expenses identified during diligence."
- **Basis-of-preparation statements**, placed where they matter: "Revenue is presented net off [sic] pass-through on-site payroll revenue - this is the same way that TCC financials are presented." And: "PF EBITDA: Annualizes upcoming customer wins and losses and utilizes 2025 management fee rates. Also utilizes the 2025 payroll roster which is a negative adjustment."
- **EBITDA definitions ladder with multiples:**
  - S&U tables restate the multiple at every definition: "x LOI EBITDA / x Adj. EBITDA / x PF EBITDA" (Dil-CPM); "x MGMT LOI EBITDA / x Dil. Adj EBITDA" (Dil-HOACS); "x LOI EBITDA / x @ Close EBITDA / x EBITDA w/ERC Uplift" (Forth).
  - A boxed mini-table follows: "LOI EBITDA $747 / PF Adj. EBITDA @ Close $603 / RR EBITDA With Revised ECR $909 <<-- Assumes 2.75% FFR".
  - Sell-side equivalent: a Reported → Adjusted → Pro Forma → Run-rate ladder, each rung footnoted.

### 6.6 Working capital, balance sheet, capex, debt
**Absent from all six documents.** A search of all body text finds no "working capital", "capex", "cash flow", "receivable" or "debt". The one balance-sheet reference is Coral's "correction to retained earnings" adjustment. Accrual effects appear only as QoE lines ("Accrued payroll", "Normalize insurance", "Accrued bonuses", "Reallocate Prepaid Insurance"). Deals are presumably cash-free, debt-free with a peg handled in the purchase agreement, but a CIM that aims to be informative must show at least a summary balance sheet and an NWC trend. See section 11, S8.

### 6.7 Risks and key diligence findings
- **Pre-LOI:** "Considerations / Risks" bullets phrased as what the buyer would need to verify: "The maintenance division accounts for over a third of revenue – we would need to understand cyclicality and any downside potential."
- **Best form:** risk, then **Mitigant:**, then residual view, all with numbers (Coral, section 4 row 4).
- **Diligence:** dedicated sections for value-moving findings. Each has a dedicated exhibit, a dollar impact, the multiple impact and the deal response:
  - **Worker classification** (Forth), "Independent Manager Conversion Analysis". Blocks: Current Gross Income of Independent Managers (6 LLCs, # FTEs, Current Mgmt. Fees, % Mgmt. Fees 45–50%, Contractor Payments 2024 / LTM Mar'25 / Current RR) → Current Estimated Net Income (Biz Insurance, Health Insurance, Licensing, Employment Tax, Income Tax, Est. Net Comp.) → Cost/Benefit if salaried → "Forth Group EBITDA Impact": PF QoE Adj. EBITDA $719 → Current Independent Manager Expense $752 + Payroll Tax 7.65% $58 + Benefits 7.8% $59 → PF Employee Expense $869 → **Conversion Adjustment ($116)** → **PF Adj. EBITDA After Conversion $603** → Original Multiple 10.2x → **Conversion-Impacted Multiple 12.6x**.
  - **Customer concentration** (Dil-CPM, Brentwood, section 6.3 item 7), with a structural response: "The mechanism would reduce the note principal by 12x any decline in TTM EBITDA at note maturity, only if Brentwood is lost as a client."
  - **Interest-rate exposure** (Dil-HOACS, Dil-Forth). A normalised Fed Funds assumption (2.75%) is applied to earnings-credit revenue, and transfer-fee volume is modelled with an empirical coefficient ("for every 1% decrease in interest rates, transfer fee volume increases by ~9.5%"). A grid of EBITDA and effective multiple follows, from 1.00% to 3.50% terminal FFR (HOACS: $1,183 → $1,072; 4.9x → 5.4x), and for Forth from 1.25% to 4.33% ($550 → $1,288, with "<<-Neutral FF Rate" and "<<-Current Fed Funds Rate" pointers).
  - **Key-person / succession**: org chart commentary that names successors and their tenure. Verbatim: "Lacretia Goetz, another key member with 15+ years, serves as QB across departments … She's been named as one of the people who could succeed Juanita."
- **Weak:** there is no consolidated risk register. Risks are split between tl;dr bullets and scattered sections, with no severity ranking and no list of open diligence items.

### 6.8 Employees and organisation
- Exhibits:
  - **Department Overview**: Count · Gross Pay · Total Comp · Avg. Comp · Mgmt. Fee Cut · Avg. Tenure.
  - **Executives**: Start Date · Role · Salary · Total Comp.
  - **Recent Hires**.
  - **Annual Employee Retention Analysis**, by department (Corporate / Portfolio Manager / Admin Assistant / Executive / Accounting / Other / Maintenance), in the same roll-forward format as customers, with a "Jan '20 - Mar '25 Average Retention" callout.
  - **Employee Analysis**: average counts by role; Employee Load (Associations / Employee) and (Units / Employee); Employee Cut (Salary / Mgmt. Fees); Average Department Salary; columns for the historical years, "2019 - 2024 Stats Min / Median / Max" and "Current % Delta to: Min / Median / Max".
  - **Manager Portfolio Analysis**: per manager, # CAs · Condo · HOA · Other · # Units · Mgmt. Fees · Manager Salary · Employee Cut.
- Commentary gives capacity, retention causes and the hiring model. Verbatim: "All managers are initially hired as assistants, and are then promoted after ~1 year or moved out of the business. Managers typically oversee ~7 accounts individually…" Also: "Sellers ascribe this success to (1) paying at or slightly above market rates for talent and (2) ensuring a deep enough bench to avoid overworking the team."
- **Weak:** three org charts are pasted from the seller (one hand-drawn at about 4 pt, one with a "Page 1" watermark, one on a logo background). Named rosters with salaries would be inappropriate in a marketing CIM.

### 6.9 Growth opportunities (called "MTB" levers)
- Every opportunity is sized with a small grid. Its rows are baseline, lever %, revenue, margin and EBITDA:
  - Coral "Onsite Billing Markup": TTM Reimbursement Revenue 3,281 × % Markup 0% / 2.5% / 5.0% / 7.5% / 10% → EBITDA Opportunity – / 82 / 164 / …
  - Coral "Capital Projects Billing": Total Capital Project Budgets 1,500 / 3,000 / 4,500 … × 6% fee → Revenue Opportunity 90 / 180 / 270 → Estimated Margin 20% → EBITDA Opportunity 18 / 36 / 54.
- The best one is benchmarked and ramped. Dil-CPM "Addendum Comps Detail (as of Oct' 24)": PAMco $3.35, GHCM $3.66, CMG $2.35, FCA $3.26 → Average Addendum Fee / Unit $3.15 vs CPM $1.68 (Delta 88%). A projection follows: Current Billing / Door 1.75 → 2.05; Peer Billing / Door $3.15; Penetration Rate 30% / 60% / 90% / 100%; Additional Addendum Revenue $178 → $539; Contribution Margin 20%; **Additional Addendum EBITDA $36 → $108**.
- Commentary names each lever with a peer price point. Verbatim: "portal access fees for association Vantaca access (for example, GHCM charges $65/license monthly), CTA processing (Cedar has charged $400 for related processing), and billable overtime charges (peers charging up to $25/hour more for the same employee levels)."
- Proof points are shown, not claimed: "**New onsite customers in 2025 are being onboarded with a 5% markup on pass-through payroll costs (3 CAs so far which will generate $15K of annualized EBITDA)**" (bold in the source).

### 6.10 Valuation and structure (buy-side only)
- Sources & Uses tables (Uses: Cash to Sellers, Seller Note, **Enterprise Value**, Transaction Fees, Total Uses; Sources: Equity, Seller Note, Total Sources), with $M, % Total and multiples at 2–3 EBITDA definitions.
- Notes under the table: "*Retention bonus is contingent upon sellers remaining actively involved in the business through 2026".
- Structure terms follow in italic-labelled run-in paragraphs.
- Precedent anchoring: "Similar in terms of scale to Creative and Hales which were both purchased for around 7x EBITDA."
- **For a sell-side CIM:** exclude valuation. The earnout and note mechanics belong in the process letter or the ICP (AMB's "Valuation & Structure Rationale" lives in the ICP; see `decks-brand.md` section 6).

---

## 7. Verbatim phrasing

### 7.1 Strong: model the bot's voice on these

**Quantified causality**
- "Bid job income tripled from '23 to '24, driven by a single large roof replacement project, and has reverted towards historical performance over the TTM period." (Dil-CPM)
- "The increase in earnings credit income was due to the timing of CPM's earnings credit agreement with First Citizens beginning in May 2023. The agreement is a floating rate based on Fed Funds, and is similar with other MC agreements." (Dil-CPM)
- "We found that for every 1% decrease in interest rates, transfer fee volume increases by ~9.5%." (Dil-HOACS)
- "The first was a small acquisition that was completed in 2021, which included a portfolio of accounts that were typically smaller and less profitable than Coral's primary book of business. As a result, a larger number of accounts churned during this period." (Coral)

**Mechanism and segmentation**
- "Customer churn has been focused on associations that either (a) were looking for a lower cost option or (b) switched to self management (often hiring their own manager directly)." (Dil-CPM)
- "CPM prefers condo clients as they are easier to cross sell maintenance work into, though they do not underwrite any cross sell when pricing those accounts." (Dil-CPM)
- "These ~$300 contracts allow Forth Group to access an underserved market without burdening managers. … Financial-only accounts tend to have less turnover and only take up 10% of the accounting team's bandwidth." (Forth)
- "The accounting function is significantly smaller than many companies have as managers are expected to handle items such as payables processing and budgeting." (Dil-CPM)

**Benchmarks and scale anchors**
- "Excluding the three on-site associations, no single customer accounts for more than 2% of revenue." (Dil-HOACS)
- "Forth Group's largest customer represents 3% of total revenue, and the top 20 associations represent roughly ⅓ of management fees. This is a similar dynamic to our existing Member Companies." (Forth)
- "We estimate CPM's market share to be 15-20% based on CA count. On a revenue basis it is probably higher given that they are focused on larger CAs (150+ units)." (Dil-CPM)
- "HOA Community Solutions has a CAM cut of 32%, which is below our industry average (40% - 45%)." (Dil-HOACS)

**Attributed claims and capacity facts**
- "Sellers ascribe this success to (1) paying at or slightly above market rates for talent and (2) ensuring a deep enough bench to avoid overworking the team." (Dil-CPM)
- "The company currently maintains a waiting list for new clients through November." (Dil-HOACS)
- "Onboarding each cohort has become systematic, and the team has talent in place to onboard/offboard 3-6 clients per month." (Forth)

**Candour about negatives** (credibility, and what keeps a document from reading as AI)
- "The company has struggled with employee retention in recent years. The acceleration in customer wins overburdened personnel, and management was slow to hire the additional support needed to maintain the growing customer base." (Forth)
- "Columbia has struggled to grow, in large part due to a local competitor who has historically undercut pricing." (Dil-CPM)
- "Juanita credits this success to her high-touch, relationship-driven approach to client management, a factor that presents some risk as she begins to transition out of the business." (Dil-HOACS)

**Value arithmetic in one sentence**
- "The financial impact of the conversion would be roughly $116K (16% of earnings), which would reduce EBITDA from $719K to $603K and thereby increase our effective multiple from 10.2x to 12.6x." (Forth)
- "Matching the benchmark for addendum billings poses a $500k+ annual revenue and $100k+ annual EBITDA opportunity using highly conservative contribution margin estimates." (Dil-CPM)
- "Given these diverse revenue streams, we estimate that Brentwood makes up 15-20% of overall earnings." (Dil-CPM)

**Explicit judgement and deal response**
- "Given the labor model was known at the time of LOI, we do not propose recutting the deal economics; however, we will also not adjust the earnout thresholds for the conversion." (Forth)
- "Given these dynamics, we have agreed to sensitize the note in the event the new board does not renew with CPM." (Dil-CPM)

**Forward facts with dates**
- "This year, the company plans on hiring a remote manager in Milwaukee to begin building a book of business in Wisconsin. The state has no licensing requirements…" (Forth)

### 7.2 Weak: ban or rewrite
| Phrase (verbatim) | Problem | Rewrite pattern |
|---|---|---|
| "CPM is a high margin organization" (PreLOI-CPM, Dil-CPM) | Adjective in place of a number and a comparison | "Adjusted EBITDA margin of 26% compares with 17–25% across the peer set" |
| "CPM has a strong leadership organization beneath the three sellers" | Unsupported | Name roles, tenure, span of control |
| "best-in-class customer retention" (PreLOI-HOACS) | Superlative; already on the ban list in `amb-deliverables.md` | "98% average logo retention 2019–YTD Oct'25; 1–2 losses a year out of ~190" |
| "The Company is highly respected in its markets" | Unverifiable | Cite a reference fact (tenure of top 20, referral share) |
| "Impressively, the Company has retained a large portion of these accounts" | Editorialising adverb; "large portion" is vague | State the % retained |
| "a clear path to growing to ~$2M of EBITDA, enabled by a deep management team, extensive backlog, and a large addressable market" | A three-adjective list is an AI tell | One lever per sentence, with its dollar value |
| "which are highly achievable" (Coral markup) | Assertion | Show a proof point (the 5% markup already being charged) |
| "CPM's customer retention is above average, and has been stable" | "Average" undefined | Give the benchmark |
| "we'd need to better understand…" | Buy-side diligence voice | For the CIM, state the fact and its mitigant |

---

## 8. QA defects found (the bot must not reproduce these)

**Numbers that do not reconcile inside one document**
| Doc | Statement A | Statement B |
|---|---|---|
| PreLOI-CPM | tl;dr: earnout "above $2.4M (10% hurdle)" | Body: "above $2.7M which is 10% growth" |
| PreLOI-CPM | "~10x PF EBITDA" | Exhibit: 9.8x exact ($20,000 / $2,034) |
| PreLOI-HOACS | tl;dr "187 CAs", "$856K PF EBITDA", "$4.8M Cash at Closing" | Overview "188 CAs"; exhibit TTM PF Adj. EBITDA **$827**; cash **$4,629** (and $4.8M + $1.2M ≠ $5.8M EV) |
| PreLOI-HOACS | tl;dr earnout "above $1.3M" | Commentary "above $1.0M"; exhibit "Expected 2026B EBITDA 1,000" |
| PreLOI-Coral | tl;dr "$3.8M EV (7.25x PF EBITDA)", "(19% margin)" | S&U EV **$3.9M**, 6.6x Adj. / 7.5x PF; exhibit PF margin **7.9%** (denominator not stated) |
| Dil-CPM | tl;dr "~11.5x PF EBITDA", "(25% margin)", "33% maintenance" | Body "11.2 PF EBITDA" (missing "x"), S&U 11.2x; exhibit PF margin 26.4%; overview "approximately a quarter of total revenue"; commentary "30%"; exhibit 32.7% |
| Dil-HOACS | "operates at ~19% RR EBITDA margins in the LTM period" | Adjacent exhibits show 21–26% |
| Dil-Forth | tl;dr "$722K of PF Adj. EBITDA" | Recon: PF Adjusted EBITDA **719** (722 is Diligence Adjusted) |
| Dil-Forth | Earnings credit uplift "$264K" / "$265K+" | Recon "Earnings Credit Uplift 348" (different rate basis, unlabelled) |

**Template-level bug:** the "Valuation Consideration & Implied Multiple" header reads "… Dec-27 | Dec-28 | **Dec-28**" in all three underwriting models (Dil-CPM, Dil-HOACS, Dil-Forth). The last column should be Dec-29. The same model block also carries "Consideraton" (sic) in Dil-CPM.

**Label errors:**
- The Forth recon uses the tier label "Conversion Adjustment" twice (the second should be "Earnings Credit Adjustment") and repeats "Pro Forma Adjusted EBITDA %" under the W-2 and @Close rows.
- The PreLOI-CPM "Doors Retention (Count)" row counts CAs.
- Dil-Forth keeps "Preliminary Underwriting EBITDA…" in a diligence memo.

**Placeholders and stubs shipped:**
- "[ ]" highlighted yellow ("driven by [ ]", PreLOI-CPM).
- "TBD% logo, TBD% employee" (PreLOI-HOACS).
- "PNM Logo Here" in the header (4 docs).
- "In" (Dil-CPM Underwriting Model commentary).
- A trailing "No" (Forth Bonus Compensation).
- A heading merged into a paragraph (PreLOI-HOACS "…recently. Transaction Details").

**Draft markup left in:** bright-green highlight on three Forth tl;dr bullets; an underlined risk bullet (PreLOI-HOACS); `#E6B8AF` shaded callout (Dil-CPM; intentional but it reads as markup).

**Screenshot artefacts:** red dotted trace boxes (Coral employee and retention tables, Forth retention); a blue page-break frame (Dil-CPM); "Page 1" watermark (Coral org chart); 55 of 87 placed images wider than the text block and clipped; exhibits 15.1 in tall that split across pages and leave blank pages.

**Sourcing:**
- "(1) Business Insurance, Health Insurance, and Licensing Expenses are rough estimates provided by ChatGPT" (Forth exhibit footnote).
- "Source:" lines exist in only 2 of 6 docs, and they point to internal workbooks.
- Market inputs ("Estimated CAs in Missouri 5,000", "Est. % Self Managed 35%") carry no source.

**Typos:** "Vanataca", "advisory roll", "Consideraton", "board board", "Sywia", "Indpendent", "Propertys", "net off", "take an on an assistant", "the capacity faced capacity constraints", "$91" (for $91K), "Mgt." / "Mgmt." mixed.

**Period labels:** a single document mixes "TTM Q1'25", "TTM25", "LTM Mar", "Mar'25 LTM", "YTD July'25", "July'25 YTD" and "TTM July'25".

---

## 9. What AMB does (house conventions evidenced here) vs what to elevate

| Area | What AMB / the principal's team does (keep the substance) | What is weak | Elevated standard for the bot |
|---|---|---|---|
| Opening | Fixed nine-part tl;dr; one-paragraph transaction overview with a fixed fact order | Bullets drift from the exhibits; 330–700 words of nested bullets | Executive Summary = Key Metrics table (Metric / LTM / Context) + 5–7 Investment Considerations, **every figure pulled from the model run** |
| Exhibit units | "($000s)", "$'000", "($M)" in the subtitle; A / E suffixes | Mixed units and period labels | One unit per exhibit in the subtitle; one period vocabulary document-wide (FY22A, FY23A, FY24A, LTM Mar-25, YTD Mar-25 / Mar-24) |
| Table grammar | Signed labels "(+)" "(-)"; underlined section labels; bold totals; `#FFFFCC` key rows; italic % rows; parentheses; "–" for zero; $ on first and total rows only | Screenshots at 4–6 pt effective; Excel input and link colours visible; hatching; page-break frames | Native tables, 8 pt minimum, ≤13 value columns per table, AMB tokens (crimson header rule, `F5EDEC` tint for the key row in place of `FFFFCC`), no model colours in client pages |
| In-table summary | "2019 - 2024 Median Retention 95%" banner | Light-blue Excel box | Keep the device: a tinted merged cell over the history columns, in AMB tint |
| Comment column | Italic basis note per bridge line | Clipped off the right margin | A "Basis" column in every bridge, 7.5–8 pt italic |
| Commentary | "Commentary" after each exhibit; 40–59% of sentences quantified; causes named | Five diligence exhibits with none; placed after the exhibit, often on the next page | Action title above, 2–4 commentary bullets beside (a right rail on landscape pages), each with a number and a cause |
| EBITDA | Multi-tier bridge; every definition named; multiple restated at each | Tier names change by document; margin denominator unstated | One ladder: Reported → Adjusted (numbered, tiered) → Pro Forma → Run-rate with identified opportunities (clearly separated); denominator stated in the footnote |
| QoE | Third-party schedule pasted; adjustments explained one line each | Two provider styles pasted raw | Rebuilt in AMB style; tier labels kept (Definitional / Owner & discretionary / Non-recurring / Pro forma); "Basis / evidence / status" support table |
| Customers | Roll-forward in counts and $; GDR/NDR; cohorts; Top 20; wins and losses; single-customer P&L | Real client names; tall screenshots | Coded names (C-001); a cumulative-share curve; same rows natively |
| Opportunities | Benchmarked, ramped, margin-applied grids; proof points | Mixed with buy-side synergies ("TCC agreement") | Seller-achievable levers only, each with a benchmark, a ramp and a proof point; buyer synergies left to the buyer |
| Risks | "Mitigant:" sub-bullets; dedicated deep-dives for value-moving items | Scattered; no register | "Key Considerations" table: Consideration / Evidence (quantified) / Mitigant or structure |
| Market | Share funnel; demographic CAGR box; competitor list | Unsourced inputs; share-only framing | Funnel + drivers + competitive table, every input sourced, or omitted |
| Charts | CAGR boxes; event markers (★ acquisition) | Excel defaults, black outlines, pie, rotated labels | Native, crimson ramp + greys, no outlines, one annotation tied to the title, CAGR bracket |
| Page economy | 0.55–0.86 exhibits/page, 69–115 words/page, 45–57% fill | White space from page breaks and oversize images | 1–2 exhibits + 120–220 words per page; ≥75% fill; exhibit + title + source kept together |
| QA | None visible | Section 8 | Automated checks: every number in the text resolves to a model cell; no "[ ]", "TBD", "XX"; period labels from one enum; spell-check (US English) |

---

## 10. Why these read as human-written (and what the bot should imitate)

Six traits separate these documents from AI-looking decks, and the bot can reproduce all of them:
1. **Proper nouns and dated specifics.** Vendors (Vantaca, HomeWise, Wintrust at "FF rate minus 75bps"), people with tenure, months ("rolled out to customers on Nov 1"), project counts ("~300 of 1,700 decks").
2. **Uneven section lengths.** A section is as long as its evidence. Some exhibits get three paragraphs, some one line.
3. **Admissions of weakness next to strengths.** "struggled with employee retention", "Columbia has struggled to grow".
4. **Mechanism words.** "because", "driven by", "as a result", "either (a)… or (b)".
5. **Attribution.** "Sellers noted", "Juanita indicated", "per management", "Labor counsel believes".
6. **Dense, real row structures.** 20–60-row tables with signed labels and subtotals. No stat tiles, cards or badges exist anywhere in these six documents.

---

## 11. Master section library for the denser CIM

Format assumption: the CIM is a landscape deck (16:9). Each content page follows the same grammar:
- **action title** (one sentence, the conclusion);
- 1–2 native exhibits, each with an exhibit number, a descriptive subtitle and units;
- a **commentary rail** of 2–4 bullets (each with a bold lead, a number and a cause);
- a **source line**, then footnotes;
- footer: firm | project code | page.

Target: 1.5 exhibits and 120–220 words of commentary per page, at least 75% ink coverage. Main Street deals (SDE / EBITDA under about $1M) run 18–26 pages; lower-middle-market deals 30–45 pages plus appendix.

**Legend.** **A** = always included. **C** = conditional, included only when the trigger is met. A C section that is not triggered is omitted silently; the Basis of Preparation page lists what data was not available, never an empty section. "Precedent" names the write-up exhibit it is rebuilt from.

### S0. Front matter (A)
| ID | Page | Status | Exhibits | Data needed |
|---|---|---|---|---|
| S0.1 | Cover | A | Project code, AMB logo, date, "Confidential Information Memorandum" | Request row (code_name), date |
| S0.2 | Notice and disclaimer | A | Two-column legal text (AMB v1 ICP disclaimer, per `decks-brand.md`) | Static |
| S0.3 | Contents | A | Section list with page numbers | Generated |

### S1. Executive summary (A; 3–4 pages)
| ID | Page | Status | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|
| S1.1 | The opportunity | A | Paragraph in the "Transaction overview" fact order (HQ and metro, founded, headcount, customers and units, mix %, ownership, reason for sale, owner transition intent), plus a **Key Metrics table**: Metric / FY-1 / LTM / Context, 10–14 rows (revenue, growth, Adj. EBITDA and margin with the denominator stated, recurring %, customer count, top-10 %, logo and revenue retention, headcount, labour cost % revenue, industry unit KPIs) | P&L, customer list, payroll, intake notes | tl;dr "Key stats"; Transaction overview |
| S1.2 | Investment considerations | A | 5–7 bold-lead paragraphs, each with ≥1 number, a mechanism and a proof point; optional mini-exhibit (long-run revenue bars) | Model outputs, intake notes | tl;dr "Thesis", "Opportunities / Growth" |
| S1.3 | Financial snapshot | A | Summary P&L (FY-3…LTM, PF) + **EBITDA definitions ladder** (Reported → Adjusted → Pro Forma), each rung footnoted | P&L, add-backs | S&U multi-definition columns; "LOI / PF @ Close / RR" box |
| S1.4 | Key considerations | A | Table: Consideration / Evidence (quantified) / Mitigant or structure, 4–7 rows | Model flags (concentration, owner dependence, churn, rate exposure), intake notes | Coral "Mitigant:"; Forth and Brentwood deep-dives |

### S2. Company overview (A; 3–5 pages)
| ID | Page | Status | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|---|
| S2.1 | History and milestones | A (chart is C) | Chart if ≥5 years of revenue or customer counts | Long-run bars with a CAGR box and event markers (acquisitions, new locations, key hires); otherwise a milestone table (Year / Event / Effect) | Multi-year revenue or counts; milestones from notes | Dil-CPM "Long-Term Client Growth (2000 - 2025)" (★ acquisitions); Forth "Annual Revenue ($M)" with CAGRs |
| S2.2 | Services and revenue model | A | none | Table: Service line / What it is / Pricing basis / % revenue / LTM growth / Recurring? | P&L revenue lines, notes | "Revenue Share" / "Revenue Growth" blocks; service-type split |
| S2.3 | Operating model and unit economics | A | none | Industry KPI table (customers per employee, revenue per FTE, labour cost % revenue or the "cut" analogue, capacity per role), with trend | Payroll by role, customer counts | "Employee Load", "Employee Cut", "CAM Load" rows |
| S2.4 | Locations and geography | C | ≥2 locations or markets with a revenue or customer split | Table: Market / Customers / Units / Revenue / % / Growth; optional map | Revenue by location | PreLOI-CPM Geography; Dil-CPM revenue by market |
| S2.5 | Technology and systems | A | none | Native 2-column table: Function / Provider and commentary | Notes | Forth "Software and Banking" table |

### S3. Market (C; 1–3 pages)
Every figure is sourced or omitted. The bot never invents market sizes.
| ID | Page | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|
| S3.1 | Market size and share | Market inputs in intake notes or an AMB-provided industry file | Funnel table (universe → addressable → Company → share) + one-line competitor positioning | Sourced universe counts, % outsourced, Company count | Dil-CPM and Forth funnels |
| S3.2 | Local demand drivers | Demographic or economic series provided | Column chart with CAGR windows + 2 bullets | Population / housing / sector series | St. Louis population chart |
| S3.3 | Competitive landscape | ≥3 named competitors in notes | Table: Competitor / Type (national, regional, local) / Est. size / Positioning | Notes | "Primary Competitors in STL (Per CPM Mgmt.)" |
| S3.4 | Operating benchmarks | AMB holds a peer dataset for the industry | Company vs peer median / quartiles on 8–12 KPIs | Peer data | "MC Benchmarking", "Key Stats Comps Table" |

### S4. Customers (A when a customer list exists; 3–6 pages)
| ID | Page | Status | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|---|
| S4.1 | Customer overview | A | Customer list with revenue | Mix by type / size band / service / geography: count, %, revenue, % revenue, avg revenue per customer (a `tint` band on the averages) | Customer list: type, size, revenue | "Active Customer Overview" |
| S4.2 | Retention and revenue bridge | C | ≥2 full years of customer-level start/end dates or revenue | Roll-forward in counts and $: Prior year → (+) new → (-) churn → (±) up/downsell → ending; GDR, NDR; avg revenue new vs lost; median-retention banner | Customer revenue by year, start/end dates | "Annual Customer Retention Analysis" |
| S4.3 | Adjusted or segmented retention | C | Acquired books, or a segment with structurally different churn | Same table, excluding the acquired book or by segment, with an in-table note | Acquisition flags, segment codes | Coral "Adj. Association Retention…: Excludes Acquired CAs"; "Property Retention" |
| S4.4 | Cohort analysis | C | ≥3 annual cohorts with start dates | Count and revenue cohorts with % gross and % cumulative retention triangles | Start dates, revenue by year | "Annual Cohort Analysis" |
| S4.5 | Concentration | A | Revenue by customer | Top 10 / 20: code, revenue, % total, cumulative %, tenure, type; Top-N / Remaining / Total rows; cumulative-share curve | Customer revenue, start dates | "Top 20 Customer Overview" |
| S4.6 | Key-customer deep dive | C | Any customer ≥10% of revenue, or ≥15% of estimated EBITDA, or top-5 ≥35% | Contribution P&L by revenue stream with a basis per line; contract status and renewal date | Customer-level revenue by stream, direct costs, contract terms | Dil-CPM "Brentwood Revenue & EBITDA Analysis" |
| S4.7 | Wins and losses | C | Win and loss records for ≥2 years | Top 5 wins and losses by year (coded), + Others, totals; loss-reason tally | Churn log with reasons | Dil-HOACS "Largest Customer Wins & Losses By Year" |
| S4.8 | Contracts and pricing | C | Contract terms available | Term / renewal / notice / escalator distribution; price-increase history | Contracts | (gap in write-ups) |

### S5. Management and employees (A; 2–4 pages)
| ID | Page | Status | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|---|
| S5.1 | Organisation | A | none | Native org chart (roles, headcount per box; names for management only) | Roles, reporting lines | Dil-HOACS org commentary (not the pasted chart) |
| S5.2 | Management team and transition | A | none | Table: Role / Tenure / Responsibilities / Post-close intent; paragraph on owner role, successors, stay period | Notes, payroll | tl;dr "Transition Plan", "Who is there now…" |
| S5.3 | Headcount and compensation | A | Payroll register | By department: Count / Total comp / Avg comp / % revenue / Avg tenure | Payroll with role, comp, hire date | "Department Overview" |
| S5.4 | Employee retention | C | Hire and termination dates for ≥2 years | Roll-forward by department with an average-retention banner | HR dates | "Annual Employee Retention Analysis" |
| S5.5 | Capacity and load | C | Customers or units assignable to roles | Load per role (customers / employee, units / employee), history + Min / Median / Max + current delta | Assignment data | "Employee Analysis", "Manager Portfolio Analysis" |
| S5.6 | Labour model normalisation | C | Contractors (1099 / LLC) perform core roles, or owner or family on payroll off-market | Conversion table: current cost → W-2 cost (payroll tax %, benefits %) → EBITDA adjustment | Contractor payments, market salaries | Forth "Independent Manager Conversion Analysis" |

### S6. Historical financial performance (A; 3–5 pages)
| ID | Page | Status | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|---|
| S6.1 | Income statement summary | A | none | FY-3…LTM (+ YTD vs prior YTD): revenue lines, gross profit, opex buckets, reported and adjusted EBITDA, margins; **embedded KPI block** (customers, revenue per customer, industry unit KPIs) | P&L, counts | "Historical P&L Summary" with KPI rows |
| S6.2 | Revenue analysis | A | none | Revenue by line (or market): $, % growth, % of total; long-run stacked bar with a CAGR box | P&L by line or market | "Revenue Summary ($000s)"; Coral long-run chart |
| S6.3 | Cost structure | A | none | Buckets as % of revenue by year + one combo chart | P&L | (gap; only in comps) |
| S6.4 | Monthly / quarterly trend and seasonality | C | ≥18 months of monthly P&L | Monthly revenue and EBITDA bars, LTM line; seasonality index if ≥24 months | Monthly P&L | (gap) |
| S6.5 | EBITDA walk | C | ≥2 fiscal years | FY-1 → FY / LTM walk by driver (price, volume, labour, other) | P&L, counts | (gap; implied in commentary) |
| S6.6 | Pass-through / gross vs net revenue | C | Pass-through or reimbursed revenue ≥10% of total | Gross → net revenue reconciliation; margins on both bases | P&L | Coral basis note; "Total Revenue (Excl. On-Site)" |

### S7. Quality of earnings and adjusted EBITDA (A; 2–4 pages)
| ID | Page | Status | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|---|
| S7.1 | Adjusted EBITDA reconciliation | A | none | Net income → (+) interest, taxes, D&A → **EBITDA, reported** → tiered numbered adjustments ([1]…[n]: owner compensation normalisation, discretionary / personal, non-recurring, out-of-period, accrual) → **Adjusted EBITDA** → pro forma ([PF1]…: run-rate pricing, annualised wins and losses, current payroll roster, replacement management) → **Pro Forma Adj. EBITDA**; margin rows; **Basis** column | P&L, addbacks.csv, payroll | QoE "Adjusted EBITDA"; CDS recon tiers; Deal Structure comment column |
| S7.2 | Adjustment support | A | none | Ref / Adjustment / FY-2 / FY-1 / LTM / Basis and evidence / Status (verified, management representation, pending) | addbacks.csv, source docs | Adjustment one-liners ("Adj. 1 is…") |
| S7.3 | Adjusted income statement | C | Full P&L mapping, or a QoE provided | Reported vs adjusted P&L side by side + "% of PF revenue" column | P&L mapping | "Adjusted income statement bridge" |
| S7.4 | Reconciliation between sources | C | ≥2 sources disagree (QuickBooks vs tax return vs statements), or a prior seller figure exists | Columns per source + "Difference to" + explanation per line | Multi-source ingest (REQUEST_LIST order of trust) | CDS "Difference to" columns; the LOI callout |
| S7.5 | Rate- or commodity-linked earnings | C | ≥5% of revenue or EBITDA is linked to rates or prices (float income, earnings credits, fuel) | Normalised-rate adjustment + 1-D sensitivity grid (EBITDA at 5–7 rate points, base marked) | Balances, rate terms | Dil-HOACS ERC analysis; Forth "EBITDA Impact at Various EFFRs" |

### S8. Balance sheet, working capital and cash flow (C; 1–3 pages; absent in all six write-ups)
| ID | Page | Trigger | Exhibits | Data needed |
|---|---|---|---|---|
| S8.1 | Summary balance sheet | ≥2 year-end balance sheets (QuickBooks or Schedule L) | Condensed BS by year; debt-like items flagged | Balance sheets |
| S8.2 | Net working capital | ≥8 quarter-ends or ≥12 month-ends | NWC trend (AR, AP, accrued, deferred revenue), DSO / DPO, average and normalised NWC | Monthly / quarterly BS |
| S8.3 | Capex and cash conversion | Fixed-asset or capex data | Capex by year, maintenance vs growth, (Adj. EBITDA – capex) / Adj. EBITDA | Fixed-asset roll, depreciation |
| S8.4 | Client funds / trust accounts | The business holds customer funds | Balances, bank relationship, earnings terms | Bank statements |

### S9. Growth opportunities (A: at least one lever; 1–3 pages)
| ID | Page | Status | Trigger | Exhibits | Data needed | Precedent |
|---|---|---|---|---|---|---|
| S9.1 | Opportunity sizing | A (≥1) | Each lever needs a baseline + a benchmark or management target + a proof point | One grid per lever: baseline × lever % (or peer gap × penetration ramp) → revenue → contribution margin → EBITDA; proof-point line | Baseline revenue, benchmark price, margin | Coral markup and capital-projects grids; Dil-CPM addendum comps and ramp |
| S9.2 | Projections | C | Management budget or forecast provided | Historical + projected P&L with KPIs, CAGRs, baseline vs with-initiatives (clearly separated); labelled "Management projections" | Budget | "Summary P&L Forecast" (drop the valuation blocks) |
| S9.3 | Sensitivities | C | Projections present | 2-D grid (growth × margin, or price × retention) | Model | FFR grids |

### S10. Transaction and process (A; 1–2 pages)
| ID | Page | Status | Exhibits | Data needed |
|---|---|---|---|---|
| S10.1 | Transaction overview | A | Seller objectives (transition period, structure preferences stated neutrally), what is being sold (entity or assets), real-estate arrangement | Notes (e.g. "owner owns the building; will lease at current rent") |
| S10.2 | Process and next steps | A | Stage / Timing table (v1 ICP 8-step table) | Process dates |
| S10.3 | Contact | A | AMB contact block; "do not contact the Company" | Static |
| S10.4 | Valuation and structure rationale | C | **ICP or buyer-directed memo only; never in the marketing CIM** | S&U at multiple EBITDA definitions, structure terms, precedent anchors | Model |

### S11. Appendix (A: basis of preparation and glossary; others C)
| ID | Page | Status | Trigger | Content |
|---|---|---|---|---|
| S11.1 | Basis of preparation | A | none | Sources used and precedence, periods, revenue basis (gross or net), margin denominators, unaudited status, data not available (lists the omitted C sections' data gaps) |
| S11.2 | KPI definitions | A | none | Every ratio used (e.g. GDR, NDR, "labour cut", load), formula and period |
| S11.3 | Detailed P&L (annual and monthly) | C | Monthly data | Full mapped P&L |
| S11.4 | Full retention and cohort detail | C | S4.2 / S4.4 triggered | Segment-level tables moved out of the body |
| S11.5 | Coded customer list / roster | C | Data present | Coded, no personal names beyond management |

### Default ordering and page budget (LMM case, ~34 pages + appendix)
S0 (3) → S1 (4) → S2 (4) → S3 (0–2) → S4 (4–6) → S5 (3) → S6 (4) → S7 (3) → S8 (0–2) → S9 (2) → S10 (2) → S11 (3+). The narrative order follows the write-ups: people and customers before the financial detail, as in the diligence memos. The EBITDA headline is surfaced early in S1.3, following the write-ups' habit of putting the valuation-relevant number on page 1.

### Page-level rules derived from the benchmark
1. **The commentary sits beside or directly under its exhibit, never on the next page.** Title, exhibit, source and commentary form one unit.
2. **No exhibit without commentary** (the diligence write-ups left five without any: Dil-HOACS's long-run chart, pie and cohort table; Dil-CPM's underwriting model, stubbed "In"; Dil-Forth's long-run revenue chart).
3. **Every number in the prose resolves to a model cell.** The tl;dr drift in section 8 is the failure to prevent.
4. **One period vocabulary and one unit per exhibit.** State the margin denominator in the footnote whenever pass-through revenue exists.
5. **Summary statistics live on the table:** median and average banners, CAGR boxes, "% of total" columns.
6. **Every bridge carries a basis column.** Every adjustment carries a reference key that matches the support table.
7. **Proof point over adjective.** If a claim has no number, cut it.
8. **Coded customer names; management names only.** Salaries appear only as department aggregates.
9. **Never print a placeholder, estimate source ("ChatGPT"), highlight or model colour.** Unresolved items go to `open-questions.md`, not the CIM.

---

## 12. Renders inspected

All 116 pages (107 unique) were rendered at 80 dpi (plus contact sheets and native-resolution exhibit images) in `…/scratchpad/research/writeups/png/`, `…/sheets/`, `…/media/`.

| Render | What it showed |
|---|---|
| PreLOI_CPM p01–p02 | Title block (26 pt bold "Prospective New Member", 23 pt company, 18 pt city, TCC and CPM logos); header with an empty `#CFE2F3` "PNM Logo Here" box; tl;dr as a 4-level Google bullet tree; "Recommendation:" bold |
| PreLOI_CPM p03 | Deal Structure Overview clipped at the right margin (12.56 in image); `#FFFFCC` inputs, `#DAE9F8` boxed "Total Valuation @ Closing $20,000"; comment column cut off |
| PreLOI_CPM p04 | Italic run-in term paragraphs; about 60% of the page empty |
| PreLOI_CPM p05–p06 | P&L Summary and Revenue Analysis repeat the same 9 revenue lines; double-underlined EBITDA; "EBITDA (Excl. BSI)" row |
| PreLOI_CPM p07 | Yellow-highlighted "[ ]" placeholder; "Doors Retention (Count)" actually counting CAs; Geography table |
| PreLOI_CPM p08–p09 | Department Overview / Executives / Recent Hires tables with real names and salaries |
| PreLOI_HOACS p01, p03–p07 | No running header; p03 is just a heading (the exhibit pushed to the next page); Deal Structure with blue input and green link fonts; itemised owner add-backs with comments; MC Benchmarking about 3 pt |
| PreLOI_Coral p01 | Thesis with relationship, IOI and cyber-attack sub-bullets; "Mitigant:" structure |
| PreLOI_Coral p04–p05 | QoE "Adjusted EBITDA" (teal `#165A58`, `[1]–[10]`), Sources & Uses ($M), commentary listing the adjustments |
| PreLOI_Coral p06–p07 | Active Customer Overview by type and size band; three retention roll-forwards with "2019 - 2024 Median Retention" banners; in-table note on acquired CAs; red dotted trace boxes |
| PreLOI_Coral p08 | A near-blank page left by the preceding tall exhibit |
| PreLOI_Coral p09–p10 | Employee retention and Employee Analysis clipped at the right margin |
| PreLOI_Coral p11 | Seller org chart (purple `#7030A0` / green `#92D050`) with a "Page 1" watermark |
| PreLOI_Coral p12–p14 | Long-run stacked chart (`#990033` / `#FF0000` / `#44546A`, black outlines) clipped; opportunity grids with `#FFFFCC` rows; bold proof-point line |
| Dil_CPM contact sheets s01–s08 (p01–p29) | tl;dr with 7 opportunities; QoE + S&U with Notes; `#E6B8AF` callout; hand-drawn org chart; Revenue Summary in a blue page-break frame; Adjusted income statement bridge; Underwriting Model with MTB + valuation block; blank p13, p16, p18; 15.1 in retention table clipped; Long-Term Client Growth with ★ markers; cohort; STL market funnel; addendum comps and ramp; Brentwood contribution table; p29 about 20% filled |
| Dil_CPM media image17, image2, image16, image8 (native resolution) | Underwriting model rows and the "Dec-28 / Dec-28" bug; QoE row labels; bridge "% of pro forma revenue" column; cohort triangles |
| Dil_HOACS contact sheets s01–s06 (p01–p23) | H1 / H2 hierarchy; S&U + revenue earn-out grid; CDS recon; ERC / transfer analysis + FFR grids at about 5 pt; UW model with two valuation blocks; P&L comps at about 4.7 pt; stacked chart + pie with no commentary; retention with GDR / NDR; wins and losses; Top 20; employee retention; manager portfolio; seller org chart |
| Dil_HOACS media image6, image10, image8, image17, image14, image7 | CDS colours (`#324E6B`, `#C0E6F5`, `#3C7D22`, `#DAF2D0`, `#BE5014`), Calibri; full row labels |
| Dil_Forth contact sheets s01–s07 (p01–p25) | Green-highlighted tl;dr bullets; S&U with the EBITDA box and "<<-- Assumes 2.75% FFR"; CDS recon with the duplicated "Conversion Adjustment"; Wintrust ERC analysis + EFFR grid (slate `#44546A` side label); Independent Manager Conversion Analysis with the ChatGPT footnote; blank p13–p14; Top Customers; Chicago market share; Annual Revenue chart (`#156082`) with a CAGR box; native Software and Banking table spilling onto p25 |
| Dil_Forth media image13, image15, image11 | Full recon tiers; S&U notes; conversion-analysis structure |
