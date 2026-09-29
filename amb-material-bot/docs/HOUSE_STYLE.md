# AMB house style: CIM deck and financial model

**Status:** the specification the rebuild follows. Written 2026-09-27 from the five research reports in `docs/research/` and the extracted brand assets in `brand/`; revised 2026-09-28 to integrate the eight follow-up reports (`docs/research/followup-1.md` to `followup-8.md`) and the critic's corrections. Where this document and a research report disagree, this document wins. Where this document is silent, follow the nearest AMB precedent it cites, and log the gap in section 6.

**How to read it.** Each convention is tagged **Keep** (AMB does this; reproduce it), **Elevate** (AMB does a version of this; execute it better as specified), or **New** (AMB does not do this; add it). Every convention adopted from AMB cites its source file. "Must" and "never" are hard rules for the build and the QA checks. Other wording marks a default the advisor may override.

**Language.** The guide's own prose follows the research reports' British spelling. **Everything the bot writes into a client deliverable is US English** (labels, prose, titles: "normalization", "color", "labor"). AMB's own labels are already US English ("Normalized Bookkeeper Staffing", [V51]).

---

## 0. Source key and decisions at a glance

### 0.1 Source key

Paths are relative to `/home/user/project-avengers/references/` (read-only).

| Key | File | What it evidences |
|---|---|---|
| **V51** | `03) AMB Dataroom/01) Diligence Workbook/AMB + Topkey - Diligence Workbook v51.xlsx` | AMB model anatomy, colour code, number formats, recast, Print toggle, cover |
| **VAL** | `03) AMB Dataroom/01) Diligence Workbook/AMB + Topkey - Valuation & Offer Structure.xlsx` | Offer engine, earnout formula, formula-built notes |
| **SUN** | `02 Monica Kennedy - Investor Dataroom/01 Diligence Workbook/AMB + Sunshine Commercial - Diligence Workbook v7.xlsx` | Main Street SDE bridge, financing, DSCR, cap-rate grids |
| **ACQ** | `03) AMB Dataroom/accounting-firm-acquisitions.xlsx` | 5,749-row comps database (accounting firms) |
| **FR6** | `03) AMB Dataroom/Keystone Workbook Formula Review (v6).pdf` | AMB's existing formula QA checklist |
| **MEMO** | `03) AMB Dataroom/AMB + Topkey: Pre-LOI Deal Memo.docx` | "Quick Stats", "Commentary:" discipline, Priority P&L Considerations |
| **OPP3** | `03) AMB Dataroom/03) Target Materials/Topkey - Keystone Acquisition Opportunity Report v3.docx` | AMB's best prose voice, Key Metric / Finding table, risk table, callouts |
| **PLO** | `03) AMB Dataroom/AMB + Topkey - Initial P&L Overview.pdf` and `03) Target Materials/Keystone Inital P&L Overview.pdf` | Exhibit-pack page anatomy, Summary P&L Overview |
| **PACK** | `03) AMB Dataroom/03) Target Materials/AMB + Topkey - Keystone Pre-LOI Diligence.pdf` | 31-page exhibit pack: cover, retention, concentration, charts |
| **SUNMEMO** | `03 AMB Advisory - Company Dataroom/In Progress Reports/AMB + Sunshine Commercial - Deal Memo.docx` | Contact footer, Key Stats |
| **CREV** | `03 AMB Advisory - Company Dataroom/In Progress Reports/AMB Advisory + Sunshine Commercial - Initial CRE Valuation.docx` | Source of the 2048 px maroon logo (header image) |
| **SUNPDF** | `02 Monica Kennedy - Investor Dataroom/02 Diligence Reports/` (CRE Rental Pricing Analysis, CRE Valuation Constraints, Estimated Laundromat Valuation, Revised Asking Price) | Sensitivity grids, SDE valuation exhibit |
| **ICP5** | `ICP Template/AMB Advisory - ICP Example v5.docx` and `ICP Template/AMB Advisory - ICP Example.pdf` | AMB's own CIM-lite: section architecture, warm neutrals, gold cover rule, logo master |
| **ICP1** | `ICP Template/_Archive/AMB Advisory - ICP Template v1.docx` | Disclaimer, Process & Next Steps table, contact block |
| **KICK** | `01 Playbooks & Templates/Template Diligence Kick-Off Deck.pptx` | Action-title habit, ruled table style (TCC master: do not reuse) |
| **TPL** | `01 Playbooks & Templates/Real Examples/TCC Prior Work/Template Diligence Workbook vFF.xlsx` | TCC lineage: tiered adjustment codes, definitions panel, retention with GDR/NDR |
| **CPM** | `01 Playbooks & Templates/Real Examples/TCC Prior Work/CPM Diligence Workbook v25.xlsx` | TCC lineage: populated template, S&U with multiples of each EBITDA |
| **CORAL** | `01 Playbooks & Templates/Real Examples/TCC Prior Work/Coral Funds Flow vFF.xlsx` | TCC lineage: Sources & Uses, proceeds waterfall, flow of funds |
| **WU** | `ICP Template/Examples/Pre-LOI Write up - CPM.docx` (Frank Moneymaker, Mar 2025), `…/Pre-LOI Write up - HOA Community Solutions.docx`, `…/Diligence Write up - CPM.docx`, `…/Diligence Write up - HOACS.docx`, `TCC Prior Work/Pre-LOI Write up - Coral.docx`, `TCC Prior Work/Diligence Write up - Forth Group.docx` | Write-up skeleton, analytical depth, voice |
| **REQ** | `amb-material-bot/docs/REQUEST_LIST.md` | Request fields (code_name, owner_replacement_salary, source precedence) |
| **BOT** | `amb-material-bot/src/cim/deck.ts`, `src/model/workbook.ts` | What the current bot does (to be replaced) |
| **LOI12** | `03) AMB Dataroom/06) Offer/Keystone_LOI_v12_Partnership.docx` (12 pp.) | Equity-deal NWC clause ("cash-free, debt-free basis, with a normalized level of working capital delivered at close"), pre-close cash sweep, debt payoff, escrow, indemnity package, exclusivity, timeline table |
| **OFF14** | `03) AMB Dataroom/06) Offer/Keystone_Offer_v14_Partnership.docx` (5 pp.) | Final term-table wording (rows "Total Valuation", "Cash at Close", "Balance Sheet", "Tax Matters", "Target Timing"); Word furniture H1 `7A0000` 14 pt, H2 `9A0033` 11.5 pt, label fill `F2EEE9`, `D8D0C6` rules |
| **OFF9** | `03) AMB Dataroom/06) Offer/_Archive/Keystone_Offer_v9.docx` | The cleanest Frank-saved maroon Word document (71/71 Word-authored paragraphs); cite it for Word style, OFF14 and LOI12 for final terms |
| **OUTL** | `03) AMB Dataroom/03) Target Materials/Topkey + Keystone: Offer Outline.docx` | "Total Valuation: $3,000,000 (1.0x run-rate recurring revenue)"; "Cash at close: $500,000 (17% of valuation)"; "Timeline & Next Steps" with "(11 week process)"; headings `980000` |
| **RECS** | `03) AMB Dataroom/06) Offer/Keystone LOI v10 - Offer v12 – Recommended Changes by Structure… (AMB, 2026-09-24).docx` | Working-capital peg = "trailing-twelve-month average"; deferred revenue "treated as an operating liability"; drafted earnout clause; "effective in the 2027 tax year" |
| **OR3** (archived **OR2**, **BENP**) | `03) AMB Dataroom/06) Offer/Keystone Offer Review v3 – Partnership 70-30 ($650K, No Earnout)… (AMB, 2026-09-24).docx`; `_Archive/Keystone Offer Review v2 …`; `_Archive/… Ben's Perspective & Recommended Fixes …` | Term table row 13 (peg and deferred revenue); earnout dropped (§6); the cash- vs accrual-basis question; seller-note terms "subordinated to senior debt only" |
| **BL** | `03) AMB Dataroom/06) Offer/Keystone Deal – Bottom Line on Series A Impact & Company Burden… (AMB, 2026-09-24).docx` | Three-structure comparison `Partnership 70/30 \| 100% for equity \| 100% all-cash`, third column "Not modeled"; buyer one-time cost ranges |
| **OSC** | `03) AMB Dataroom/06) Offer/_Archive/Keystone Offer Structures Compared – Partnership 70-30 vs. 100% Buyout… (AMB, 2026-09-24).docx` | The comparison re-set as a memo table `Metric \| Partnership 70/30 \| 100% Buyout \| Difference` |
| **TAX** / **FTM** | `03) AMB Dataroom/04) Deal Mechanics/Tax Considerations.docx`; `…/Forward Traingular Merger Guide.docx` (sic) | Working-capital true-up as boot; 20% boot ceiling; hard dollar cap; escrow kept apart from a retention holdback; "Market is 5-10% for 12-18 months" |
| **MISC** / **KON** / **PB06** | `03) AMB Dataroom/AMB + Topkey: Misc Notes.docx`; `04) Deal Mechanics/Keystone Offer Negotiation.docx`; `06) Offer/Keystone_Offer_Negotiation_Playbook.docx` | "Typical accounting deals are structured 70% to 80% cash up front"; the 18-month retention holdback; the concession path |
| **CHK** | `03) AMB Dataroom/Keystone_Deal_Checklist_and_Timeline.xlsx` | Three-date spine (LOI → signing and escrow funding → effective date), bold anchor rows, gate column, critical-path flag; its styling (navy `1F3864`, Office CF colours, `TODAY()`) is not AMB |
| **OSO** / **OSA** | `03) AMB Dataroom/03) Target Materials/asd.pdf` (19 pp.); `…/Keystone Offer Scenario Analysis.pdf` (1 p.) | The printed "Offer Structure Overview" pack from VAL (p1 cover, pp. 2–4 `Offer Comparison`, 5–9 `Partnership Analysis`, 10–14 `Partnership Tables`, 15–19 `100% Buyout Analysis`), printed in Print mode at 76%; OSA is its cover only, printed nine seconds earlier from the same workbook with a pixel-identical cover. The cover's "As of 09/24/26" is the print date (`TODAY()`) |
| **SUNPA** / **SUNREQ** / **SUNTAX** | `02 Monica Kennedy - Investor Dataroom/03 Process Documents/Sunshine Commercial Investments: Purchase Agreement Contingencies.docx`; `…: Post-PA Request List.docx` and `…: Request List.docx`; `03 AMB Advisory - Company Dataroom/In Progress Reports/Tax Expert Considerations - PA Decisions.docx` | Main Street asset-purchase mechanics: liens paid off, free and clear title, payoff letters, Form 8594 allocation, sales-tax clearance, FIRPTA |
| **TR22–24** | `02 Monica Kennedy - Investor Dataroom/00 Target Company Documents/Laundromat Tax Returns/2022, 2023, 2024 LAUNDRY MAT - RANDY JAMES.pdf` | Schedule C (Form 1040) returns behind SUN's annual page; scanned, no text layer |
| **CORSAIR** | `03 AMB Advisory - Company Dataroom/In Progress Reports/Corsair_Plaza_NOI_Bridge.xlsx` | NOI bridge order, reserve conventions and the "never blend" rule (logic only: its `8C4A43` / `5B312B` bands, `FFFF00` input fills and "→" labels are retired) |
| **OS25** | `02 Monica Kennedy - Investor Dataroom/00 Target Company Documents/Corsair Plaza Owner Statements/2025 Owner Statement.pdf` | Property-manager statement: in-place rent $60,585, management fee $6,059 (10.0%) |

`03 AMB Advisory - Company Dataroom/Real Estate Valuation Outreach .docx` is a student's email draft to an appraiser, not a valuation document; nothing in it is precedent.

Research reports (in `docs/research/`): **R-MOD** `amb-models.md`, **R-TPL** `template-workbooks.md`, **R-BRAND** `decks-brand.md`, **R-DEL** `amb-deliverables.md`, **R-WU** `writeup-examples.md`. Follow-up reports: **F1** `followup-1.md` (NWC and closing mechanics), **F2** `followup-2.md` (offer, deal mechanics, memo furniture), **F3** `followup-3.md` (native Excel charts), **F4** `followup-4.md` (offer comparison and the OSO pack), **F5** `followup-5.md` (sensitivity-grid anatomy), **F6** `followup-6.md` (Main Street annual page, Schedule C map), **F7** `followup-7.md` (real estate), **F8** `followup-8.md` (monthly grid, LTM strips, monthly charts). Two research-report claims are corrected by F4: R-DEL's "cover only" describes the file `Keystone Offer Scenario Analysis.pdf`, not the pack (`asd.pdf`, 19 pages, printed nine seconds later from the same workbook); and R-MOD lines 309 and 469 cite the one-page file as proof of the Print toggle, which only `asd.pdf` shows (every figure prints black).

"TCC lineage" marks conventions taken from The CAM Collective files held in AMB's library. They share AMB's model conventions (same font code, formats, cover grammar, Print toggle: R-TPL intro), and Frank authored one of the write-ups, so they count as house precedent. The TCC PowerPoint master, logos and colour scheme do not.

### 0.2 Decisions at a glance (where the analysts differed, this is the call)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Which red? AMB uses at least 15 (R-BRAND §1 counted 11; F2 adds `7A0000` and `9A0033` [OFF14 H1 and H2], `980000` [Offer Outline headings, Pre-LOI Checklist header fill] and `85200C` [LOI Discussion Preparation]) | **Maroon `7B0000`** is the working brand colour in both deliverables. **Crimson `9E0A20`** is the logo and the model cover bars. `990033` is retired. | `7B0000` is AMB's header band [V51], Word headings [OPP3, MEMO] and chart colour [V51]. `9E0A20` is the logo. `990033` came from TCC's theme (R-BRAND §3.4). AMB's Word offer documents from 21 Sep 2026 use `7A0000` for H1 and table headers and `9A0033` for H2, the title rule and the LOI band, with `F2EEE9` label fills and `D8D0C6` rules; the look first appeared in generated drafts (Offer v7, LOI v1), Frank then saved it in Word (LOI v2–v7, OFF9), and OFF14 and LOI12 keep it. `9A0033` is therefore a current AMB Word accent one step from the retired `990033`; the CIM keeps one maroon, and Q1 asks whether Word companions keep `9A0033` or move to `9E0A20` (F2 §8.5). |
| D2 | Yellow `FFFFCC` key totals in the CIM? | **Model: keep. CIM: retire.** CIM key totals are ruled top and bottom in maroon. | Yellow on a slide reads as a pasted spreadsheet (R-BRAND §7 ICP-3). The rules keep AMB's "boxed total" idea. |
| D3 | Typeface | **Georgia Bold** for action titles, cover and divider titles only. **Arial** for everything else. | Continues AMB's serif-heading / Arial-exhibit split [ICP5, OPP3, V51] with a better serif than Times New Roman. Checked in render (section 2.3). |
| D4 | Table header | **Filled `7B0000` band, white bold**, on every table, numeric and text. | AMB's most recognisable exhibit device [V51 P&L Overview, PLO p2]; OPP3 and ICP5 also fill their headers. |
| D5 | Valuation or asking price in the CIM | **Never.** Valuation and structure live in the model (and an optional ICP). | REQ: `asking_price` "Not used in the CIM". R-WU §6.10. |
| D6 | EBITDA ladder names | **Reported EBITDA → Adj. EBITDA → PF Adj. EBITDA**, with **SDE** as a rung in Main Street mode. AMB's "Near-Term / Steady-State" names stay in buy-side work. | Near-Term / Steady-State describe a buyer's post-close changes [MEMO Quick Stats footnotes (2), (3)]; a sell-side CIM must not assume them. |
| D7 | Period labels | `FY2025`, `YTD Jul-26`, `LTM Jul-26`, `PF Jul-26`; months `Jul-26`. One vocabulary in both deliverables. | AMB mixes "July'26", "Jul'26 LTM", "July'26 YTD" [V51]; one workbook had 11 variants (R-TPL §3). |
| D8 | Adjustment references | Tier-prefixed, formula-numbered: `[D1]` definitional, `[N1]` normalization, `[S1]` owner compensation / SDE, `[PF1]` pro forma, `[M1]` memo. | TPL tier codes + CPM bracket numbering, one taxonomy end to end (R-TPL §9.1–9.2). |
| D9 | Section tracker | **Footer**, sentence case, current section in maroon. No kicker above the title. | Replaces KICK's red italic prefix (R-BRAND §5.3) and the bot's letter-spaced caps kicker [BOT deck.ts]. |
| D10 | Chart colours | Validated palette (section 2.6), in the CIM and in the model's native chart tabs (5.12). No dual axes anywhere: AMB's bar + cyan % line becomes two panels. | The palette was run through the dataviz validator. Dual axes are the most common chart error, and LibreOffice does not draw a secondary axis scale (F3 §4.8). |
| D11 | "Customer" or "Client" | One term per deal, set on the Assumptions tab and used everywhere. | V51 mixes them (R-MOD §10 item 9). |
| D12 | Section dividers | Only when the CIM has **24 or more pages**. | Short Main Street CIMs lose density to dividers. |
| D13 | Charts in the model | **Keep native Excel charts**, on chart tabs that follow their analysis tab (5.12), redrawn in the 2.6 palette. The CIM never reuses them; it draws its own pptx charts from the same engine values. | AMB's workbook is also its exhibit press: 19 of V51's 20 charts print in PACK, and PLO prints the revenue and expense charts (F3). |
| D14 | Deal structures | **Every structure is a column, not a copy**: `Deal Structure` holds up to 5 structure or LOI columns with one formula set; `Offer Comparison` reads them. | VAL built two ~200-row copies of one engine that drifted apart, and BL could not model a third structure ("Not modeled") (F4). |
| D15 | NWC and closing mechanics | Defaults key off `DealForm`: equity purchase = cash-free, debt-free with a normalized NWC peg (T12M average, deferred revenue inside NWC); asset purchase = Seller keeps cash, AR and AP, no peg, one month of payroll as reconciliation holdback. | AMB's equity convention is unchanged across 19 Keystone drafts [LOI12, OFF14, RECS]; the asset-sale mechanics come from SUNPA, ICP5 and CORAL (F1). |

---

## 1. Brand DNA to keep

### 1.1 Logo

The logo is the only brand element AMB uses consistently (R-BRAND §1). It is a single flat colour, **crimson `#9E0A20`** (RGB 158/10/32): an "A/M" monogram crossed by a rising arrow, with a condensed "AMB" wordmark and "ADVISORY SERVICES" beneath. No vector file exists in the library.

**Files** (all in `amb-material-bot/brand/`, transparent RGBA, checked by pixel count on 2026-09-27):

| File | Pixels | Ink bounding box | Provenance | Use |
|---|---|---|---|---|
| `amb-logo-maroon-2048.png` | 2048 × 698 | (138, 44)–(2000, 650) | Sunshine CRE valuation header [CREV via R-DEL §16] | **Master colour logo.** CIM footer, model cover, any print use |
| `amb-logo-white-2048.png` | 2048 × 698 | same | White knockout from the Topkey memo's crimson header band [MEMO via R-DEL §16] | **Master reversed logo.** CIM cover, divider panels |
| `amb-logo.png` | 1099 × 375 | (74, 24)–(1073, 349) | Byte copy of ICP `word/media/image1.png` [ICP5] | Fallback colour logo |
| `amb-logo-white.png` | 1099 × 375 | same | Derived white (R-BRAND §2) | Fallback reversed logo |
| `amb-logo-mark.png` / `-white.png` | 457 × 347 | (12, 12)–(445, 335) | Derived monogram crop | Favicon and tiny uses only. **Never in the CIM or model.** AMB never uses the monogram on its own in any reference file. |
| `amb-logo-workbook.png` | 550 × 184 | (37, 11)–(537, 171) | Model covers [V51] | Superseded. Do not use (too low-resolution) |

**Build step (New).** Derive tight-cropped copies, `amb-logo-tight.png` and `amb-logo-white-tight.png`, by cropping the 2048 masters to their ink box (1862 × 606 px, aspect **3.073**). Place the tight files on slides so the artwork aligns to the grid. The masters carry about 7% built-in padding, which throws alignment off (the KICK cover logo is visibly misaligned with its title for this reason: R-BRAND §5.5).

**Usage rules**

- Colour logo on white or on `F5EDEC` only. White logo on `7B0000` only (contrast 11.4:1). Never place the crimson logo on maroon, on photographs, or on grey.
- Never recolour. The ICP header logo was recoloured brown and resampled to 168 px; it is soft and off-hue in print (R-BRAND §2). That is the failure to avoid.
- Minimum size: 0.60 in wide in the CIM footer, 1.9 in wide on the model cover. Clear space on every side: the height of the "A" in "AMB" (about 0.4 × logo height).
- Never set text in the logo's condensed display face (R-BRAND §2). The wordmark is artwork.
- Never add a white box behind the logo (the KICK cover logo sits in an opaque white box: R-BRAND §2).
- For print wider than about 4 in at 300 dpi, ask Frank for a vector file (section 6, Q3).

### 1.2 Palette

One working red, one logo red, a warm-neutral family inherited from the ICP, one tint family, and a chart palette. Every hex below is exact.

**Core tokens (both deliverables)**

| Token | Hex | Role | Source |
|---|---|---|---|
| `maroon` | **7B0000** | Action titles, table header band, primary chart series, cover field, divider panel, title rule, section name in the footer tracker, bullet squares | Keep: V51 header band (1,054 cells in VAL), OPP3 and MEMO headings, V51 chart bars |
| `crimson` | **9E0A20** | Logo artwork. Model cover bars (replacing `990033`). Nothing else | Keep: logo [ICP5]. Elevate: consolidates `990033` [V51 cover] |
| `ink` | **2C2523** | All body text and table figures in the CIM (15.0:1 on white) | Keep: ICP5 body colour |
| `muted` | **7A706D** | Footers, source lines, axis labels, secondary text (4.8:1 on white, passes for small text) | Keep: ICP5 secondary text |
| `rule` | **C2BAB8** | Hairlines: footer rule, text-table row separators, rail divider, chart axis line | Keep: ICP5 table and footer rules |
| `section` | **FFE1E1** | Table section rows ("Revenue", "Operating expenses") in both deliverables | Keep: V51 section rows, PLO/PACK exhibits |
| `tint` | **F5EDEC** | CIM callout fill, in-table summary banners, the page behind a colour logo if ever needed | Keep: ICP5 value cells. Replaces OPP3's near-identical `F7EBEF` |
| `onMaroon` | **E9D3D5** | Secondary text on the maroon cover and divider panel (8.0:1 on `7B0000`) | New (maroon tint) |
| `gold` | **C9A227** | One 1 pt rule on the CIM cover. Nowhere else | Keep: ICP5 cover rules |
| `white` | **FFFFFF** | Page background (set explicitly on every slide) | |

**Model-only tokens**

| Token | Hex | Role | Source |
|---|---|---|---|
| `keyTotal` | **FFFFCC** | Key-total fill with a thin box per column group | Keep: V51, TPL, CPM |
| `input` font | **0000FF** | Hard-coded input | Keep: V51 (587 constants) |
| `linkSheet` font | **008000** | Link from another sheet | Keep: V51 (5,986 formulas) |
| `linkInSheet` font | **800080** | Link within the sheet to an input or earlier cell | Keep: V51 (2,544 formulas) |
| `pending` font | **FF0000** | Placeholder or pending confirmation; red italic for check rows | Keep: V51 (155 constants) |
| `helper` font | **808080** | Helper scaffolding (date bounds, IRR strips) | Keep: V51 (5,019 formulas) |
| `naFill` | **D9D9D9** | Cells where a line has no meaning for that period (a PF adjustment in a historical year) | Keep: TPL `BFBFBF`/`D9D9D9` blocks (R-TPL §7.3) |

**Retired, never used in either deliverable:** `990033`, `FF0000` as a fill or chart colour, `C00000`, `54001C`, `820033`, `B70033`, `98002F`, `5B312B` and `8C4A43` (ICP brown headings), `44546A` (KICK slate text), `4EA72E` / `EE0000` (ICP semantic borders), `70AD47` (Excel green), `00B0F0` (cyan ratio line), `CAEDFB` / `DAE9F8` (TCC blue boxes), every navy (`1F4E78`, `1F3864`, `324E6B`, the bot's `13294B` / `1F3A5F`), brass `B8862B`, and the TCC teal `165A58` (R-BRAND §8, R-MOD §9.3, R-TPL §7.3, BOT). The list applies to the model's charts and grids as well (5.5, 5.12): `FFC1C1` (V51 chart pink), `F8696B` / `FCFCFF` (V51 roster colour scale), `FFF2CC` (roster fill), the theme tints `548235`, `BF9000`, `FFE699`, `D6DCE5`, `BDD7EE` (V51 stacked mix and pie), `DDEBF7` / `E2EFDA` (SUN sensitivity-axis and threshold fills), `203764` / `B4C6E7` (V51 navy section bars), `FFFF00` (SUN base-cell and CORSAIR input fill), and `E8EDF3` / `E8EEF7` / `1A3C6E` (the Google Docs memos' blue-grey and navy). `D9D9D9` survives only as `naFill`, never as a gridline, section bar or chart colour (F3 §4.9, F5 §4, F6 §0, F7 §3).

### 1.3 Typefaces

| Medium | Face | Where | Source |
|---|---|---|---|
| CIM titles | **Georgia Bold** (action titles), **Georgia Regular** (cover codename, divider section names) | Title zone, cover, dividers only | Elevate: AMB sets headings in bold serif maroon [OPP3 H1 17 pt TNR bold `7B0000`; ICP5 H1]. Georgia is the upgrade R-BRAND §8 recommends |
| CIM everything else | **Arial** | Body, tables, charts, footers, notes | Keep: AMB exhibits are Arial [V51, PLO, PACK] |
| Model | **Arial**, written exactly `Arial` | Every cell | Keep: V51. Fix: V51 has 5,590 cells set to `Arail`, a typo that makes Excel fall back to another font (R-MOD §9.3) |

- Two faces, never three. The ICP put Times New Roman prose, Arial screenshots and an Aptos chart on one page (R-BRAND §4). That must not recur.
- Georgia ships with Windows, macOS and Microsoft Office. The render and QA environment must install **Gelasio** (metric-compatible with Georgia) so that LibreOffice previews break lines the way PowerPoint will. Without it, LibreOffice substitutes DejaVu Serif, which is about 12% wider and heavier (seen in the section 2.3 check). The same environment must install **Carlito** (metric-compatible with Calibri, the workbook default font that sets Excel's column-width unit); without it LibreOffice measures columns in DejaVu Sans and pushes chart tabs past the page (V51 render pp. 52, 68, 70; F3 §4.8).
- Arial figures are tabular by default. Never switch table figures to a proportional face.

### 1.4 Name treatment

| Context | Form | Source |
|---|---|---|
| Running text, first mention | "AMB Advisory Services" | ICP5 footer, SUNMEMO footer |
| Running text, later | "AMB Advisory" | ICP1 disclaimer ("AMB Advisory" or "Broker") |
| Legal text, disclaimer, cover line | "AMB Advisory Services LLC" | ICP1 |
| Never | "AMB" alone in client prose; "AMB Advisory Services, LLC" (with comma); "Amb" | |
| Web, email, phone, city | ambadvisoryservices.com · info@ambadvisoryservices.com · 813.364.2178 · Tampa, Florida (phone written with dots) | ICP1 contact block, SUNMEMO footer |
| The seller's business | Cover and file names: `code_name` ("Project Ridgeline"). Body: `business_name` with a defined short form on first use: *Ridgeline Comfort Services LLC ("Ridgeline" or the "Company")* | REQ (`code_name` for cover and files, `business_name` for the body); ICP5 defined-term habit ("Example Business Overview ("EBO")") |
| The seller as a party | "the Seller" (capitalised, defined in the disclaimer) | ICP1 |
| Owners and staff | Management by name and role; other employees by role only; no salaries except department aggregates | R-WU §11 rule 8 |

---

## 2. Elevated design system for the CIM

The CIM is a native, editable 16:9 PowerPoint (pptxgenjs `LAYOUT_WIDE`, **13.333 × 7.5 in**). Every table and chart is native, never a picture. The target reader should see AMB's exhibit grammar (maroon header bands, pink section rows, signed row labels, `$000s` units, en-dash zeros) executed with the restraint of a top-tier bank book.

### 2.1 Grid and margins

**Horizontal.** Side margins **0.45 in**; content width **12.433 in**; **12 columns of 0.853 in with 0.20 in gutters**. Column *k* starts at `x = 0.45 + (k − 1) × 1.053`.

| Span | x (in) | Width (in) | Typical use |
|---|---|---|---|
| Cols 1–12 | 0.450 | 12.433 | Full-width table, title, notes |
| Cols 1–9 | 0.450 | 9.277 | Wide financial table (with a 3-column rail) |
| Cols 1–8 | 0.450 | 8.224 | Exhibit (with a 4-column rail) |
| Cols 1–7 | 0.450 | 7.171 | Text block on text-led pages |
| Cols 1–6 / 7–12 | 0.450 / 6.768 | 6.118 each | Two equal exhibits |
| Cols 8–12 | 7.821 | 5.065 | Key Metrics table on text-led pages |
| Cols 9–12 | 8.874 | 4.012 | Commentary rail |
| Cols 10–12 | 9.927 | 2.959 | Narrow rail beside a wide table |

**Vertical bands** (fixed on every content page):

| Band | y (in) | Contents |
|---|---|---|
| Top margin | 0.00–0.30 | Empty |
| Title zone | 0.30–1.00 | Action title, **bottom-anchored** so one-line and two-line titles sit the same distance above the rule |
| Title rule | 1.06 | 0.75 pt `maroon`, full content width |
| Content | 1.22–6.52 | Exhibits and commentary (5.30 in) |
| Notes and source | 6.58–6.92 | Bottom-anchored, at most 3 lines of 7 pt |
| Footer rule | 7.00 | 0.5 pt `rule`, full content width |
| Footer row | 7.06–7.30 | Tracker, confidentiality line, logo, page number |
| Bottom margin | 7.30–7.50 | Empty |

**Layout archetypes.** Every content page uses one of six. Nothing is placed off-grid.

| ID | Name | Geometry | Use |
|---|---|---|---|
| **L1** | Exhibit + rail | Exhibit cols 1–8; rail cols 9–12; 0.5 pt `rule` vertical hairline centred in the gutter between cols 8 and 9, y 1.22–6.42 | Default page: one chart or table plus 3–5 bullets |
| **L2** | Two exhibits | Exhibits cols 1–6 and 7–12, y 1.22–4.60; commentary under each exhibit in its own columns, y 4.75–6.52 | Paired views (count and dollars; table and chart) |
| **L3** | Wide table + narrow rail | Table cols 1–9; rail cols 10–12 with the hairline | Income statement, EBITDA ladder, retention roll-forward |
| **L4** | Text-led | Text cols 1–7; table cols 8–12 | Company at a glance, transaction overview |
| **L5** | Chart over tables | Full-width chart y 1.22–3.70; two tables cols 1–6 and 7–12 below; 2–3 bullets in the rail of the right table or under the chart | Revenue composition, customer overview |
| **L6** | Full-width exhibit | Cols 1–12; optional one-line commentary above the notes band | Appendix detail, disclaimer, process table |

Each exhibit has an **exhibit header**: title in Arial Bold 9.5 pt `ink`, then two spaces and the units in Arial Regular 9.5 pt `muted` ("Summary income statement  ($000s)"), with a 0.5 pt `ink` rule 0.25 in below the header's top edge, across the exhibit width. The exhibit body starts 0.33 in below the header's top edge. The units live here and nowhere else (Keep: every AMB exhibit states units in the subtitle, "Summary P&L Overview ($000s)" [PLO, V51]). Exhibit titles are descriptive nouns (AMB's convention, R-DEL §4.2); the conclusion goes in the page's action title.

### 2.2 Type scale

| Element | Face | Size | Weight / style | Colour | Leading / spacing |
|---|---|---|---|---|---|
| Cover codename | Georgia | 40 pt | Regular | white | |
| Divider section name | Georgia | 28 pt | Regular | white | 1.0 |
| Action title | Georgia | **20 pt** | Bold | `maroon` | 1.0; max 2 lines |
| Contents and divider list | Arial | 13 pt | Regular; current section Bold | `muted`; current `maroon` | rows 0.50 in |
| Cover document line | Arial | 16 pt | Regular | white | |
| Body and commentary | Arial | **10 pt** (9 pt minimum where space forces it) | Regular; lead-in Bold | `ink` | 1.08; 6 pt after each bullet |
| Exhibit header | Arial | 9.5 pt | Bold title, regular units | `ink` / `muted` | |
| Text-table body | Arial | 9 pt | Regular; first column Bold | `ink` | |
| Numeric-table body | Arial | **8.5 pt** (8 pt minimum, appendix only) | Regular; totals Bold; ratio rows Italic | `ink` | row height 0.195 in |
| Table header | Arial | 8 pt | Bold | white on `maroon` | row height 0.21 in |
| Chart data labels, axis labels, legends | Arial | 8 pt | Regular | `ink` (labels), `muted` (axes) | |
| Page number | Arial | 8 pt | Regular | `ink` | |
| Footer text | Arial | 7.5 pt | Regular | `muted`; section name `maroon` | |
| Notes, sources, footnotes | Arial | 7 pt | Regular | `muted` | 1.0 |

Hard floors: **nothing below 7 pt** anywhere; **no table figure below 8 pt**. AMB's 18-column retention tables printed at 5.9 pt [PACK p5–6, R-DEL §3.2] and the write-up exhibits reached 3–6 pt effective [WU, R-WU §2]; both are the failure these floors prevent.

**Title fit.** Georgia Bold 20 pt fits about **85 characters per line** across 12.43 in. Titles run 60–110 characters, two lines at most, with a hard cap of 150. A longer title means the point is not yet sharp enough; rewrite it. Never shrink the font to fit.

### 2.3 What the system looks like (checked in render)

A four-page mock (cover, an L3 income-statement page, an L2 two-chart page, a divider) was built with the bot's own pptxgenjs 4.0.1, rendered through LibreOffice and inspected. Scratch files: `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/house-style/` (`mock.mjs`, `mock_p1.png`–`mock_p4.png`). The grid, type scale, table grammar and footer above are the ones that rendered cleanly. The check surfaced four implementation traps the builder must handle:

1. **pptxgenjs 4 table cell `margin` is in inches, not points.** `margin: [0, 4, 0, 4]` sets 4-inch margins and collapses every cell into vertical text. Use `[0, 0.05, 0, 0.05]`.
2. **Table borders must be four-element arrays `[top, right, bottom, left]`,** with `{ type: "none" }` on the sides. A bare border object draws a box around every cell. LibreOffice also draws "transparent" vertical borders in black (R-BRAND §5.4), so set `none` explicitly.
3. **Data-label colour must follow the fill.** `ink` labels inside a `7B0000` stacked segment were unreadable. Labels inside `7B0000` or `5E5552` fills are white; on `C49A5B`, `DCC7C4` or outside the bar they are `ink`.
4. **Font substitution.** Without Gelasio installed, the Georgia titles render in DejaVu Serif and look heavier and wider than they will in PowerPoint (see 1.3).

### 2.4 Colour roles in the CIM

- `maroon` carries the brand: the title, the rule under it, the table header band, the primary chart series, the tracker's section name, bullet squares. The page is otherwise ink on white.
- `section` (`FFE1E1`) appears only in table section rows. `tint` (`F5EDEC`) appears only in the one permitted callout per page and in in-table summary banners.
- **No semantic green or red, anywhere.** Direction is carried by sign, parentheses and words. ICP5's green/red cell borders ("positively / negatively impacts valuation") are invisible in greyscale and to colour-blind readers (R-BRAND §7 ICP-5).
- Colour never carries meaning alone. Every coloured series is also labelled.
- `[Confirm: …]` markers in drafts are Arial Italic in `FF0000` (AMB's model colour for "pending confirmation" [V51]) so they cannot be mistaken for finished text. The export QA blocks a CIM marked final while any remain (section 4.7).

### 2.5 Table style

AMB's exhibit grammar [V51 P&L Overview; PLO p2; PACK], redrawn for slides. The render check in 2.3 confirmed this spec.

| Element | Specification | AMB source |
|---|---|---|
| Header band | Fill `7B0000`, Arial Bold 8 pt white, figures right-aligned, group labels centred | Keep: V51 rows 5–6 |
| Two-tier header | Tier 1 = period group ("Full Year", "YTD", "LTM", "PF", "PF vs. LTM"), centred across its columns. Tier 2 = period ("2024", "Jul-26", "($)", "(%)"). Tier-2 first cell names the table, left-aligned ("Income statement"). Tier-1 first cell is blank maroon | Keep: V51, PLO for the two tiers and the first-cell name ("P&L Summary"). Elevate: the last group label; V51 P&L Overview M5 reads "PF Delta" over "($)" and "(%)", renamed "PF vs. LTM" here |
| Group blocks | A white gap column **0.08 in** wide between period groups; the header band, section rows and key-total rules break at the gap, so each group reads as its own block | Keep: V51 0.9-width spacer columns; PLO "narrow white gutters" |
| Section row | Fill `FFE1E1` across each group block (not the gaps); label Arial Bold 8.5 pt `ink`; no figures | Keep: V51, PLO |
| Line item | Regular; label indented 0.12 in (0.24 in for a sub-line) | Keep: V51 indent 1 |
| Subtotal | Bold; 0.5 pt `ink` top border on every cell of the row within each block | Keep: V51 thin top border |
| Key total (Net income, Reported EBITDA, SDE, Adj. EBITDA, PF Adj. EBITDA, Total consideration, Ending count, and the total-growth row that closes a growth block) | Bold; **0.75 pt `7B0000` top and bottom borders** within each block; no fill | Elevate: V51's `FFFFCC` boxed total becomes a maroon-ruled total. V51 boxes "Recurring Revenue Growth" and "Total Payroll Growth" the same way (F8 §4.1) |
| Ratio row ("% margin", "% growth", "% of total") | Italic, directly below its total, no rule | Keep: V51 bold-italic "% Margin"; CIM uses italic regular |
| Signed labels | `(+)`, `(–)`, `(x)`, `(/)` prefixes on bridge and roll-forward rows: "(+) New customers", "(–) Customer churn", "(x) Average compensation" | Keep: V51, TPL. The en dash replaces the hyphen in the CIM |
| Rules | No vertical rules. No zebra striping. No box around each cell. Numeric tables have no row hairlines. Text tables separate rows with 0.5 pt `rule` bottom borders | Elevate: KICK slide 4 (no verticals, hairline rows); retires ICP5's fully boxed, fully filled cells |
| Alignment | Figures right-aligned; text left-aligned and top-aligned in text tables | Elevate: MEMO and ICP5 centred their figures |
| Summary banner | A merged cell across the history columns, fill `F5EDEC`, Bold 8.5 pt: "FY2021–FY2025 median retention  95%" | Keep: TPL/CPM "2019 - 2024 Median Retention" banner |
| Size limits | At most **13 value columns** and **22 body rows** per table in the body of the CIM (L3 at 0.195 in rows). Larger tables split: summary in the body, detail in the appendix | New (R-DEL §11) |
| Column widths | Label column ≥ 2.6 in on L3 tables, ≥ 1.8 in on L1; value columns 0.62–0.80 in; cell margins 0.05 in left and right, 0 top and bottom | New |

**Figures in tables**

- `$` on the first row of each block and on subtotal and key-total rows only; body rows plain: `$1,590` / `620` / `$2,407` (Keep: V51 `[$$]#,##0` on first and total rows, 2,703 cells).
- Negatives in parentheses: `(1,048)`. Zero is an en dash `–`. Not meaningful: `n.m.`. Not available: `n.a.`. Not quantified: `n.q.` (Keep: V51 en-dash zero; TPL `n.q.`; R-DEL suggests `n.m.` over AMB's `--`).
- Percentages: 0 dp for growth, mix and deltas (`12%`, `(88%)`); 1 dp for margins (`16.4%`) (Keep: PLO).
- Multiples: 1 dp with `x`: `5.4x` (Keep: OPP3, V51).
- Units: `$000s` in the exhibit header for financial tables; `($)`, `(#)` or `(#, $)` for unit-level tables (Keep: V51 subtitles).

### 2.6 Chart style

Native pptx charts only. The six Excel screenshots in ICP5 (96–179 dpi) and the 75 pasted exhibits in the write-ups are the pattern being replaced (R-BRAND §6.7, R-WU §1).

**Palette** (run through the dataviz skill's `validate_palette.js`, 2026-09-27):

| Job | Colours, in fixed order | Validator result |
|---|---|---|
| Single series | `7B0000` | |
| Categorical, 2 series | `7B0000`, `DCC7C4` | CVD ΔE 47.3, normal-vision ΔE 49.7: pass |
| Categorical, 3–4 series (stacked mix) | `7B0000` maroon, `C49A5B` sand, `5E5552` warm slate, `DCC7C4` blush grey | All pairs: CVD ΔE ≥ 10.5, normal-vision ΔE ≥ 15.7: pass |
| Actual vs estimate / PF | Actual `7B0000`; estimate or PF `B5727A` | ΔE 25.7: pass |
| Waterfall | Totals `7B0000`; increases `B5727A`; decreases `5E5552` | All pairs ≥ 10.5 / 16.5: pass |
| Comparison line (prior year, peer median) | `5E5552`, 1.25 pt | |
| Ordinal (model heat maps only) | `F5EDEC` → `D9B8BD` → `B5727A` → `7B0000` | Monotone single hue. Every cell carries its value, so the light end's low contrast is acceptable |

The validator's "chroma floor" and "lightness band" checks fail by design, because they assume a vivid multi-hue palette and AMB's brand is a single red with warm neutrals. Its rule for that case applies: light fills (`C49A5B` 2.5:1, `DCC7C4` 1.6:1 against white) **must** carry direct labels, and stacked segments are separated by thin white gaps. **A fifth series is never a new colour:** it folds into "Other", which takes the last slot. Series keep their colour when a filter changes the count.

The model's native chart tabs (5.12) use this palette and these marks; only the density rules differ (every bar labelled up to 36 months; quarter-start labels above 24 months). A model print and a CIM page therefore agree (F3).

**Marks and anatomy**

- Bar gap width 60% on every bar chart, in the CIM and the model (one number; V51 uses 70 on 17 charts, 150 on its stacked chart and 60 on the tenure chart, F3 §2.2). No outlines (AMB's black hairline outlines go: R-DEL §3.3). No 3-D, shadows, gradients or rounded corners.
- **No gridlines.** Value axis hidden when every bar is labelled (Keep: V51 charts have no value axis and labels on). When a value axis is needed (line charts), at most 4 gridlines, 0.25 pt `rule`.
- Category axis: 0.5 pt `rule` line; labels Arial 8 pt `muted`, **never rotated**. With more than 16 categories, label quarter starts only (Jan, Apr, Jul, Oct as "Jan-25"), and above 36 bars label only the first, last, maximum and minimum bars (Elevate: V51's 31-month charts set no rotation in the XML; `bodyPr rot="-60000000"` is automatic, and Excel and LibreOffice both rotate 31 `mmm-yy` labels to 45° because they do not fit [PLO pp. 4, 7, 8; PACK p13]; thinning the labels is the only fix, F8 §0).
- Data labels Arial 8 pt, `#,##0` in the exhibit's units; white inside dark fills, `ink` elsewhere (see 2.3, trap 3).
- Legend: none for a single series (the exhibit title names it). For 2–4 series, top-left, 8 pt, in series order; lines are direct-labelled at their right end instead.
- Lines: 1.75 pt `7B0000`; a marker (5 pt circle) on the last point only.
- **No dual axes.** AMB's "bar + % of recurring revenue" combo (maroon bars, cyan `00B0F0` line on a secondary axis [V51 Expense Charts, PLO p7]) becomes either two stacked panels sharing the category axis (the ratio panel about 30% of the height) or a single row of ratio labels under the bars.
- **No pies or donuts.** Mix uses a 100% stacked bar or a table (Elevate: V51 tenure pie, HOACS revenue pie).
- **Wins vs losses** is a diverging bar: wins above the axis in `7B0000`, losses below in `5E5552`, net as labels (Elevate: PACK p7 paired green/maroon bars).
- **One annotation per chart, at most,** tied to the action title: a CAGR ("FY2021–FY2025 CAGR: 12%") right-aligned on the exhibit-header line, or one event label with a 0.5 pt `ink` leader ("Plumbing added, 2019"). Keep the write-ups' CAGR boxes and event markers as the idea (R-WU §5.4), not their styling.
- Chart height is at least 2.6 in on L1 and L2 pages. A short, wide chart is a layout failure.

**Monthly series** (Keep: V51 chart6, AMB's cleanest exhibit: 31 maroon bars, every bar labelled, no axis, no gridlines, no legend [PLO p4]; F8 §5)

- Data from `Monthly P&L` (or the retention strip source), never a helper block typed on a chart tab. 24–36 bars: the first is the first month of FY-2 (or the first month with data), the last is the as-of month.
- Single series `7B0000`, gap width 60, no outline. Data labels Arial 8 pt `#,##0` above every bar up to 36 bars; above 36, first, last, maximum and minimum only.
- Category axis in `mmm-yy` with labels on quarter starts only, horizontal; value axis hidden; no gridlines; no legend.
- Exhibit header per 2.1 ("Monthly STR subscription revenue  ($000s)") with the range as the one annotation, right-aligned on the header line: `Jan-24 – Jul-26` (D7). This replaces AMB's typed suffix "(Jan’24 - July’26)", which abbreviates the first month, spells out the second and uses a curly apostrophe and a spaced hyphen [V51 captions, MEMO].
- The "% of recurring revenue" line (V51 charts 2–4, PLO pp. 7–8, MEMO pp. 4–5) becomes the lower panel of a two-panel exhibit sharing the category axis, panel height 30%, line 1.75 pt `5E5552` with the last point labelled ("18%"); never a secondary axis (D10).
- The six-series stacked monthly mix (V51 chart7, theme tints `548235`, `D6DCE5`, `FFE699`, `BF9000`) becomes a 100% stacked monthly bar in the 4-colour palette with the fifth and later lines folded into "Other", or a table.
- S6.4's trailing-12-month line (1.75 pt `7B0000`, marker on the last point) starts at the 12th bar; earlier bars are still shown.
- Months in prose: "November 2024" in body text; `Nov-24` in titles and tables; "m/m" and "y/y" are allowed in the rail and spelled out in body text (AMB writes "Nov'24", "Y/Y", "m/m" [MEMO]).

**Partial fiscal year in annual bars** (New: AMB never draws annual bars in V51, PLO or MEMO; it draws the monthly strip through the as-of month; F8 §5.4)

- Categories `FY2023 | FY2024 | FY2025 | YTD Jul-26`: full fiscal years in `7B0000`; the partial year as **one bar in `B5727A`** (the estimate/PF tone), after a 0.08 in gap (the same gap the tables use between period groups). The bar carries its value.
- The label is `YTD Jul-26`, never `2026`, `2026E`, `FY2026` or an annualized figure. A partial year is never annualized in a chart.
- The prior-year comparable is the chart's one annotation, right-aligned on the header line ("YTD Jul-25: $998; +67%"), not a second bar.
- When LTM is the page's headline: `FY2023 | FY2024 | FY2025 | LTM Jul-26`, LTM in `7B0000` (a full 12 months) after the 0.08 in gap. Never both YTD and LTM on one annual chart.
- Footnote (4.6): `(1) YTD Jul-26 is the seven months to July 31, 2026, unaudited.`

### 2.7 Commentary rail and callouts

- The rail holds 2–5 bullets. Each bullet is a **bold lead-in** (3–8 words stating the point) followed by one or two sentences with the evidence (Keep: MEMO "Commentary:" paragraphs and OPP3 bold-lead bullets. The rail replaces the "Commentary:" label).
- Bullet glyph: a small square "▪" (U+25AA) in `maroon`, hanging indent 0.15 in. No second level in the rail.
- **Callout:** at most **one per page** and five per deck. Fill `F5EDEC`, a 2.25 pt `maroon` left rule, square corners, no icon. The lead-in is one of AMB's own: "Takeaway:", "Opportunity:" or "Note:" in Bold `maroon` (Keep: OPP3's `F7EBEF` callout with `990033` left rule, three uses in 11 pages). Use it for the single number-backed conclusion the page exists to make.

### 2.8 Page furniture

| Element | Specification |
|---|---|
| Title rule | 0.75 pt `maroon` at y 1.06, full content width (Keep: ICP5 H1 rule) |
| Footer rule | 0.5 pt `rule` at y 7.00, full content width (Keep: ICP5 footer rule) |
| Footer, left (section tracker) | `Project Ridgeline  \|  Financial performance`: project code in `muted`, section name in `maroon`, Arial 7.5 pt, sentence case, **no letter-spacing, no caps** |
| Footer, centre | `Strictly private and confidential`, Arial 7.5 pt `muted`, centred on the page |
| Footer, right | Tight colour logo, **0.22 in tall** (0.68 in wide), right edge at x 12.30, vertically centred in the footer row; page number Arial 8 pt `ink`, right-aligned to x 12.883 |
| Notes and source | Bottom-anchored in the notes band, Arial 7 pt `muted`, in this order: `Source: …` line; `Note: …` line; numbered footnotes `(1) …`. See 4.6 |
| Page numbers | Every page except the cover. Contents and dividers carry the page number only (no tracker) |
| Page header | None. No logo top-right. No running document title |
| Date | On the cover only ("October 2026"). The notes of every financial page state the periods |

### 2.9 Cover, disclaimer, contents, dividers, back matter

**Cover** (render-checked, `mock_p1.png`)

- Full-bleed `7B0000` field. No imagery, shapes, slats or circles.
- White tight logo, 2.40 in wide, at x 0.70, y 0.62 (Keep: AMB puts its white logo on a red band [MEMO header]).
- Codename, Georgia Regular 40 pt white, bottom-anchored in a box at x 0.70, y 3.05, h 0.85.
- One 1 pt `gold` rule, 2.0 in long, at x 0.72, y 4.05 (Keep: ICP5 cover's gold rules, used once).
- "Confidential Information Memorandum", Arial 16 pt white, at y 4.18.
- Month and year ("October 2026"), Arial 11 pt `onMaroon`, at y 4.56.
- Bottom line at y 6.72, Arial 8 pt `onMaroon`: "Strictly private and confidential. Prepared by AMB Advisory Services LLC for recipients who have executed a confidentiality agreement with AMB Advisory."
- Not on the cover: the business name, the seller's logo, a folio, a tagline (the bot's current cover has a tagline and decorative circles [BOT deck.ts]).

**Disclaimer & Confidentiality Notice** (page 2). Title verbatim as ICP1. L6 in two columns (cols 1–6, 7–12), Arial 8 pt `ink`, subheads Arial Bold 8 pt `maroon`. Use ICP1's intro paragraph and its six headings with their text: *No Representation or Warranty; Confidentiality Obligations; No Offer or Solicitation; Broker Disclosure; Third-Party Information and Financial Data; Return of Information* (Keep: ICP1, dropped from v2 onward; R-BRAND §6.5). Counsel sign-off is open (Q5).

**Contents** (page 3). Title "Contents". The divider list (below) at cols 1–7 with page numbers, no highlight.

**Dividers** (only when the CIM has 24 or more pages; render-checked, `mock_p4.png`). A `7B0000` panel from x 0 to 4.60 in, full height, holding the section name in Georgia Regular 28 pt white, bottom-anchored at y 2.6–4.0. On the right, x 5.40–12.40, the full section list from y 1.30 in rows 0.50 in apart: Arial 13 pt, the current section Bold `maroon`, the others `muted`, page numbers right-aligned, a 0.5 pt `rule` under each row. No numerals, no circles, no "Section 4" kicker.

**Back matter**

- *Process and next steps*: ICP1's eight stages in a text table with a timing column: `# | Stage | What happens | Target timing`. Stages verbatim: NDA Execution, Initial Call, Buyer Q&A / IOI, Management Meeting, LOI Submission, Due Diligence, Purchase Agreement, Close & Transition. Plain numerals in the narrow first column; no badges (Keep: ICP1). Stages 6–8 carry AMB's post-LOI spine (LOI → signing and escrow funding → effective date) [OUTL, LOI12, CHK]; the three anchor rows (LOI, signing, effective date) are bold, as on CHK's Milestones tab (F2 §4).
- *Contact*: Firm, principal, phone, email, website, city (1.4), then ICP1 verbatim: "All inquiries should be directed to AMB Advisory. Do not contact the Seller or its employees directly."

### 2.10 AI-deck tells: banned patterns and their replacements

The owner's list first, then further tells found in the current bot, the reference files or common generated decks. Each is a QA check on the built deck.

| # | Tell | Replacement | Evidence |
|---|---|---|---|
| T1 | Numbered circle badges | Plain numerals in a narrow table column, or none | BOT `numberBadge()` ellipses |
| T2 | Rounded card grids | Ruled tables or whitespace; square corners on every shape | BOT `card()` `roundRect` |
| T3 | Stat tiles, KPI bands, hero numbers with captions | A Key Metrics table (Metric / FY / LTM / Context) | ICP5 four-up band; OPP3 Key Metric / Finding table is the replacement |
| T4 | Letter-spaced caps kickers | Sentence-case footer tracker | BOT `charSpacing: 2` "01 · EXECUTIVE SUMMARY" |
| T5 | Decorative circles, slats, swooshes | Nothing | BOT cover circles; KICK translucent slats |
| T6 | Generic prose ("well-positioned", "robust") | Section 4.4 rules and ban list | ICP5 "Well-established business" |
| T7 | Icons, emoji, pictograms beside bullets or headings | Bold lead-in text | |
| T8 | Equal "pillars": 3 or 4 columns of equal-length text under icons | One ruled list, or a table with a real column structure | |
| T9 | Every slide with the same number of equal-length bullets | Bullet count and length follow the evidence (R-WU §10 trait 2) | |
| T10 | Donut or pie charts, gauges, progress bars, Harvey balls for single percentages | A number in a table, or a 100% bar | V51 tenure pie |
| T11 | Traffic-light (red/amber/green) status colours | Words in the table ("Documented", "Management representation") | ICP5 green/red borders |
| T12 | Chevron process arrows; circles-on-a-line timelines | A dated table (process, milestones) | |
| T13 | Gradient fills, drop shadows, glows, transparency | Flat fills from the palette | KICK slats at 20–85% alpha |
| T14 | Title Case Headlines and ALL-CAPS emphasis | Sentence-case titles; bold for emphasis | |
| T15 | A subtitle that restates the title | The exhibit header names the exhibit; the title states the finding | ICP5 H2 and exhibit title repeat each other |
| T16 | "Key takeaways" box on every page | One callout per page at most, five per deck | |
| T17 | Big "01 / 02 / 03" section numerals | Section names only | |
| T18 | Full-bleed stock photography, "hero" images | None. Photos only if the seller supplies real ones (fleet, facility), placed in a grid cell with a caption | KICK townhouse layouts |
| T19 | Airy one-idea-per-slide pages | Density targets in 3.2 | Current bot brief |
| T20 | Round numbers everywhere ("~$3M", "~20%") | Precise figures in tables and titles ($3.04M, 12%); rounding only in prose context | |
| T21 | Em dashes in prose; "not just X, but Y"; triads of adjectives | Commas, colons, parentheses; one claim per sentence (4.4) | R-WU §7.2 "deep management team, extensive backlog, and a large addressable market" |
| T22 | Centred body text; justified text | Left-aligned text | |
| T23 | Org charts with rounded boxes and avatar icons or photos | Square 0.5 pt boxes, role and headcount, names for management only | KICK circular headshots |
| T24 | Placeholder brackets, "TBD", "XX", "[ ]" in a finished page | Nothing ships unresolved; open items go to `open-questions.md` | WU and MEMO shipped "[ ]", "TBD%" (R-WU §8) |
| T25 | Charts with a legend for one series, rotated labels, gridlines, outlines | Section 2.6 | ICP5 native chart; PACK charts |
| T26 | Screenshots or pictures of text | Native tables and text | ICP5 screenshots; KICK slide 10 header row is a picture |
| T27 | Numbers that disagree between pages | Every figure resolves to a named model cell (4.8) | R-BRAND §6.9, R-DEL §6.6, R-WU §8 |

---

## 3. CIM content architecture

### 3.1 Page grammar

Every content page carries the same six parts, in this order:

1. **Action title**: one sentence stating the conclusion, with a number (4.5).
2. **One or two native exhibits**, each with its exhibit header and units (2.1).
3. **Commentary**: 2–5 bold-lead bullets in the rail or under the exhibit. Each carries a number and names a cause or mechanism.
4. **Source line, general note, numbered footnotes** in the notes band (4.6).
5. **Footer**: tracker, confidentiality line, logo, page number (2.8).
6. **Model traceability**: every figure on the page is pulled from a named model output (5.14), not retyped.

Title, exhibit, commentary and source are one unit and never split across pages (Elevate: MEMO chart titles fall to the foot of one page with the chart on the next, R-DEL §2.1; R-WU §11 rule 1). No exhibit appears without commentary (five write-up exhibits had none: R-WU §11 rule 2).

### 3.2 Density targets

| Page type | Exhibits | Commentary words | Other rules |
|---|---|---|---|
| Standard content page (L1, L2, L3, L5) | 1–2; **average ≥ 1.5 across body pages** | **120–220** (hard max 260) | ≥ 1 figure in every bullet; ≥ 50% of sentences contain a figure |
| Text-led page (L4) | 1 table | 220–320 | The table carries 10–14 rows |
| Full-width appendix page (L6) | 1–2 | 0–60 | Tables may drop to 8 pt |
| Divider, contents, disclaimer, contact | 0 | n/a | |

- **Fill.** Exhibits and text occupy at least 80% of the content band (12.43 × 5.30 in). No empty region larger than 2 grid columns by 1.5 in. The write-ups averaged 45–57% page fill (R-WU §2) and the current bot is "one idea per slide, airy"; both fail this.
- **Benchmarks.** AMB's exhibit packs run 1.4–1.7 exhibits per page with no words [PACK, PLO]; OPP3's prose runs 372 words per page with no exhibits (R-DEL §1). The target merges the two.
- **Sentence discipline.** Median sentence length 14–20 words, maximum 32. AMB's measured medians are 13–16.5 (R-DEL §10.1) and the write-ups' 16–23 (R-WU §2).

### 3.3 Master section library

**Status:** **A** = always built. **C** = conditional on the stated trigger, evaluated on the ingested dataset. A module whose trigger fails is omitted silently from the CIM and listed in `open-questions.md` with the data that would unlock it. The CIM never advertises a data gap. **Precedent** names the AMB exhibit each page is rebuilt from. IDs follow R-WU §11.

#### S0. Front matter (A, 3 pages)

| ID | Page | Purpose | Exhibits | Data required | Status |
|---|---|---|---|---|---|
| S0.1 | Cover | Identify the project | 2.9 | `code_name`, run date | A |
| S0.2 | Disclaimer & Confidentiality Notice | Legal notice | ICP1 text, two columns | Static | A |
| S0.3 | Contents | Navigation | Section list with pages | Generated | A |

#### S1. Executive summary (A, 3–4 pages)

| ID | Page | Purpose | Exhibits (layout) | Data required | Status | Precedent |
|---|---|---|---|---|---|---|
| S1.1 | Company at a glance | What the business is, in numbers, on one page | L4: **overview paragraph** in fixed fact order (HQ and market served; founded; employees; customers and units; revenue mix %; ownership; reason for sale; owner's transition offer), 120–170 words; **transaction paragraph**, 50–80 words; **Key Metrics table** `Metric \| FY-1 \| FY or LTM \| Context`, 10–14 rows (revenue and growth; gross margin; Adj. EBITDA and margin with the denominator stated; SDE in Main Street mode; recurring %; customers; largest customer and top 10 %; retention; employees; labor cost % revenue; one or two industry unit KPIs) | P&L, customer list, payroll, intake notes, request row | A | OPP3 "Key Metric \| Finding" table; ICP5 Business Overview paragraph; WU tl;dr "Key stats" and "Transaction overview" fact order |
| S1.2 | Investment considerations | The case, each point proved | L1: 5–7 considerations as a ruled list: bold lead sentence (a claim containing a number), 1–2 sentences of evidence and mechanism, page reference "(p. 14)". Rail: one small exhibit (long-run revenue bars) | Model outputs, notes | A | OPP3 Investment Highlights (7 bold-lead bullets); WU "Thesis" and "Opportunities / Growth" |
| S1.3 | Financial snapshot | The earnings headline and how it is built | L2: summary P&L (FY-2…FY, LTM, PF) left; condensed EBITDA ladder (Reported → Adj. [→ SDE] → PF Adj.) right; 3 bullets each | P&L, adjustments | A | PLO p2 Summary P&L Overview; OPP3 Near-Term and Steady-State Bridges |
| S1.4 | Considerations for buyers | Name what a buyer will diligence, with the evidence and the answer | L6 text table `Consideration \| What the data shows \| How it is addressed`, 4–7 rows, quantified middle column | Model flags (concentration, owner dependence, churn, labor model, rate exposure), notes | A (Q10) | OPP3 "Risk \| What We See \| Potential Mitigant"; WU Coral "Mitigant:" sub-bullets |

#### S2. Company overview (A, 3–5 pages)

| ID | Page | Purpose | Exhibits | Data required | Status | Precedent |
|---|---|---|---|---|---|---|
| S2.1 | History and milestones | Show the track record | Long-run bars with CAGR and one or two event labels if ≥ 5 years of revenue or counts; otherwise a milestone table `Year \| Event \| Effect` | Multi-year revenue or counts; milestones from notes | A (chart C: ≥ 5 years) | WU Dil-CPM "Long-Term Client Growth (2000 - 2025)" with acquisition markers; Forth "Annual Revenue ($M)" with CAGRs |
| S2.2 | Services and revenue model | What is sold, how it is priced, what recurs | L5: revenue mix 100% stacked bar by year; table `Service line \| What the customer buys \| Pricing basis \| FY revenue \| % \| Growth \| Recurring?` | P&L revenue lines, notes | A | PLO Revenue Analysis "Recurring Revenue % Total"; ICP5 Services Offered |
| S2.3 | Operating model and unit economics | Explain how the business makes money per unit of capacity | L1: KPI table (revenue per employee; customers or jobs per technician or staff member; labor cost % revenue; capacity measure) by year, plus one trend chart; the mechanism sentence as a bullet | Payroll by role, counts | A | V51 Steady-State Staffing; OPP3 "Unit economics" ("margin per client depends almost entirely on how many clients each person carries") |
| S2.4 | Locations and facilities | Where it operates, on what terms | Table `Location \| Function \| Size \| Owned / leased \| Lease term`; revenue split by market if available. **Owner-held premises** (`Premises arrangement` is "Owned by seller…"): L2 with a "Premises" fact table left (`Address \| Building \| GLA and suite occupied \| Year built \| Other occupants \| Parking / access \| Manager`) and an "Arrangement offered to the buyer" table right (`Term \| Offer`: Owner; Offered as; Proposed rent; Basis of rent; Term and renewals; Expenses; Pro forma treatment "[PF2]"). Never a property value, cap rate, NOI capitalisation, appraisal, prior price or "implied upside" (D5); a property operating statement (rent → vacancy → EGI → expenses → NOI) only when the property is offered for sale, headed "Property operating statement, FY2025 ($)". Third-party tenants by trade name. Comps table to S11.5 (Q31). Banned here: "prime location", "high-visibility", "well-maintained" (write "roof replaced 2022") | Notes, lease details; `Real Estate` tab outputs | C: ≥ 2 locations, or facility or lease facts in notes, or owner-held premises | ICP1 "Facilities"; WU PreLOI-CPM Geography table; SUN `Tennant View` and `Market Rent Analysis` (F7 §4.7) |
| S2.5 | Technology and systems | Systems a buyer inherits | Two-column text table `Function \| System and commentary` | Notes | A (merges onto S2.4's page when both are short) | WU Forth "Software and Banking" table; ICP5 Software & Technology Stack |

#### S3. Market (C, 0–2 pages). Every figure is sourced or omitted; the bot never estimates a market size.

| ID | Page | Exhibits | Trigger | Precedent |
|---|---|---|---|---|
| S3.1 | Market size and share | Funnel table (universe → addressable → Company → share), each input with its source | Sourced market inputs supplied by AMB or in intake notes | WU Dil-CPM and Forth funnels |
| S3.2 | Competitive landscape | Table `Competitor \| Type (national, regional, local) \| Positioning`, attributed "per management" | ≥ 3 named competitors in notes | WU "Primary Competitors in STL (Per CPM Mgmt.)" |
| S3.3 | Demand drivers | Column chart with CAGR windows | A sourced demographic or sector series is supplied | WU Dil-CPM population chart |

#### S4. Customers (3–6 pages; A when customer-level data exists)

| ID | Page | Exhibits | Data required | Status | Precedent |
|---|---|---|---|---|---|
| S4.1 | Customer overview | L5: mix by type, size band, service and geography: count, %, revenue, %, average revenue per customer | Customer list with revenue and type | A when a customer list exists | V51 Client Overview (type breakdown, fee bands); TPL Customer Overview |
| S4.2 | Retention (count and dollars) | L2: roll-forward table `Starting count \| (+) New \| (–) Lost \| Ending count \| Churn %` and the dollar version with downsell and upsell, **GDR and NDR**, median-retention banner; diverging wins/losses chart | Customer-level start and end dates or revenue by year, ≥ 2 full years | C | V51 Client Retention (#) and Client Retention $; TPL Customer Retention (GDR/NDR, banner) |
| S4.3 | Cohorts | Count and revenue cohort triangles with % gross and % cumulative retention | Start dates, ≥ 3 annual cohorts | C | TPL/CPM Cohort Analysis |
| S4.4 | Concentration | L1: Top 10 or Top 20, **coded** (C-001…): revenue, % of total, cumulative %, tenure, type; rows `Top 20 \| Remaining \| Total`; cumulative-share line | Revenue by customer | A when revenue by customer exists | V51 / PACK p16 Client Concentration — Top 20 |
| S4.5 | Key-customer detail | Contribution table by revenue stream with a basis per line; contract status and renewal date | Any customer ≥ 10% of revenue, or top 5 ≥ 35% | C | WU Dil-CPM "Brentwood Revenue & EBITDA Analysis" |
| S4.6 | Contracts, pricing and backlog | Term, renewal and notice distribution; price-increase history; backlog by month | Contract terms, price history or backlog | C | (gap in AMB precedent) |
| S4.7 | Demand profile (no customer list) | Transactions, average ticket, mix by day-part or channel, seasonality | POS or invoice-level data, no customer list | C (replaces S4.1–S4.4) | New |

Segmented or adjusted retention (acquired books, a segment that churns differently) is a second block on S4.2, with an in-table note, not a separate page (Keep: WU Coral "Excludes Acquired CAs").

#### S5. Operations and people (A, 2–4 pages)

| ID | Page | Exhibits | Data required | Status | Precedent |
|---|---|---|---|---|---|
| S5.1 | Organization and management | L1: native org chart (square boxes: role and headcount; names for management only); table `Role \| Tenure \| Responsibilities \| Post-close intent` | Roles, reporting lines, notes | A | ICP5 Organizational Structure (rebuilt natively, not a screenshot); WU "Transition Plan" |
| S5.2 | Headcount and compensation | Table by department `Count \| Total comp \| Avg comp \| % revenue \| Avg tenure` | Payroll register | A when payroll data exists | V51 Employee Overview; WU "Department Overview" |
| S5.3 | Retention and tenure | Roll-forward by department with average-retention banner; tenure distribution bar | Hire and termination dates, ≥ 2 years | C | V51 Employee Retention; PACK p18 Employee Tenure |
| S5.4 | Owner role and transition | Table `Owner responsibility \| Hours / week \| Who assumes it post-close \| Transition support offered` | Notes | A | WU "Who is there now that won't be there post-close?" |
| S5.5 | Operations and suppliers | Table: key suppliers, fleet or equipment, certifications, licenses | Notes | C: facts in notes | ICP1 Operations ("Vendor & Contractor Relationships", "Licenses & Regulatory") |
| S5.6 | Labor model normalization | Conversion table: contractor cost → employee cost (payroll tax %, benefits %) → EBITDA effect | Contractors in core roles, or family on payroll off-market | C | WU Forth "Independent Manager Conversion Analysis" |

#### S6. Financial performance (A, 3–5 pages)

| ID | Page | Exhibits | Data required | Status | Precedent |
|---|---|---|---|---|---|
| S6.1 | Income statement summary | L3: FY-2…FY, YTD PY / YTD CY, LTM, PF; revenue lines, gross profit, expense buckets, Reported EBITDA, Adj. EBITDA, margins; KPI block below (customers, revenue per customer, industry KPI) | P&L, counts | A | PLO p2 / V51 P&L Overview; TPL P&L Summary KPI block |
| S6.2 | Revenue analysis | L2: revenue by line (or market) `$ \| % growth \| % of total`; long-run stacked bar with CAGR | P&L by line or market | A | PLO p3 Revenue Analysis; WU Coral long-run chart with CAGR box |
| S6.3 | Gross margin and cost structure | L1: cost buckets as % of revenue by year; two-panel chart (cost $ bars, % of revenue panel) | P&L | A | PLO p5–6 Expense Analysis; V51 Expense Charts (dual axis replaced) |
| S6.4 | Monthly trend and seasonality | Monthly revenue bars with a trailing-12-month line on the same axis; seasonality index if ≥ 24 months | ≥ 18 months of monthly P&L | C | PLO p4 Monthly Revenue Trends |
| S6.5 | Revenue and EBITDA walk | Waterfall FY-1 → FY (or FY → LTM) by driver: price, volume, mix, labor, other | ≥ 2 fiscal years plus volume or price drivers | C | New |
| S6.6 | Gross vs net revenue | Gross-to-net reconciliation; margins on both bases | Pass-through or reimbursed revenue ≥ 10% of total | C | WU Coral basis note; TPL "Total Revenue (Excl. On-Site)" |

#### S7. Adjusted EBITDA (A, 2–4 pages)

| ID | Page | Exhibits | Data required | Status | Precedent |
|---|---|---|---|---|---|
| S7.1 | Adjusted EBITDA reconciliation | L3: the ladder (5.4) for FY-2…FY, LTM, PF with `[ref]` codes; LTM waterfall chart in the rail or as L2 | Adjustments schedule | A | V51 recast rows 68–107; TPL four-tier Adj. EBITDA; CPM FDD `[1]…[11]` |
| S7.2 | Adjustment support | L6 text table `Ref \| Adjustment \| Category \| FY-1 \| FY \| LTM \| Basis \| Evidence` | Adjustments schedule (Accepted rows only, Q10) | A | MEMO "Consideration \| Impact \| Verification"; TPL definitions panel; OPP3 "Payroll judgments we made" |
| S7.3 | Owner compensation and SDE | SDE bridge; owner compensation detail; replacement-cost basis | `owner_comp` lines, `owner_replacement_salary` | C: Main Street mode (PF Adj. EBITDA < $1.0M, Q7) | SUN / SUNPDF Laundromat SDE bridge; REQ `owner_replacement_salary` |
| S7.4 | Reconciliation between sources | Columns per source (QuickBooks, tax return, statements) with "Difference" and an explanation per line | Two sources for the same year disagree on revenue or net income by > 2% | C | REQ source precedence; TPL "LOI EBITDA Recon" "Difference to" block |
| S7.5 | Rate- or price-linked earnings | Normalized-rate adjustment and a one-way sensitivity (EBITDA at 5–7 rate points, base marked) | ≥ 5% of revenue or EBITDA linked to rates or commodity prices | C | WU Dil-HOACS ERC analysis; Forth "EBITDA Impact at Various EFFRs" |

#### S8. Balance sheet and cash flow (1–3 pages; C. No AMB or TCC workbook carries these tabs, but AMB's offer documents set the NWC convention the pages follow, 5.6)

| ID | Page | Exhibits | Trigger |
|---|---|---|---|
| S8.1 | Summary balance sheet | Condensed balance sheet by year-end; debt-like items flagged | ≥ 2 year-end balance sheets |
| S8.2 | Net working capital | NWC trend (AR, unbilled, inventory, AP, accrued, deferred revenue, customer deposits); DSO / DIO / DPO; the trailing statistic labelled **`T12M average`**, never "peg" or "target" (the peg is a negotiating term and stays out of the CIM under D5); deferred revenue as its own line with its % of revenue | ≥ 12 month-ends or ≥ 4 quarter-ends (year-ends only: shown with a note) |
| S8.3 | Capex and cash conversion | Capex by year (maintenance vs growth where known); (Adj. EBITDA − capex) ÷ Adj. EBITDA | Fixed-asset data or depreciation plus capex detail |

In an asset purchase, S8.2 shows the lines that transfer and states in the note that the Seller retains cash, receivables and payables (5.6, Q17).

#### S9. Growth opportunities (A: at least one lever; 1–3 pages)

| ID | Page | Exhibits | Status | Precedent |
|---|---|---|---|---|
| S9.1 | Opportunity sizing | One grid per lever: baseline × lever % (or benchmark gap × penetration ramp) → revenue → contribution margin → EBITDA; one proof-point line. Seller-achievable levers only; buyer synergies are left to the buyer | A (≥ 1 lever with a baseline and a benchmark or management target) | WU Coral markup and capital-projects grids; Dil-CPM addendum comps and ramp |
| S9.2 | Management projections | Historical plus projected P&L with KPIs and CAGRs; baseline and initiatives in separate blocks; labelled "Management projections" | C: management supplied a budget or forecast (Q14) | WU "Summary P&L Forecast" without its valuation blocks |

#### S10. Transaction process (A, 2 pages)

| ID | Page | Exhibits | Data required |
|---|---|---|---|
| S10.1 | Transaction overview | L4: one fact-order paragraph ("[Owner] is offering 100% of [Company] LLC. Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close. [Owner] will remain full time for 12 months after closing."), then a two-column term table (label cells `tint`) with AMB's non-price labels converted to sell-side wording (F2 §5): **What is offered** ("100% of the membership interests of [Company] LLC." / "Substantially all of the operating assets of [Company], free and clear of liens.") · **Basis of offers** (equity purchase: "Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close." [OFF14 row "Balance Sheet"]; asset purchase: "The business is offered as a purchase of assets, free and clear of liens; the Seller retains cash, receivables and payables."; Q17d) · **Reason for sale** · **Owner transition** ("[Owner] will remain full time for [12] months after closing to transfer customer relationships."; compensation omitted, ICP5 "Seller Stay-On Agreement \| One-year, full-time, $150K compensation") · **Key employees** (ICP5 "Employment Agreements \| Likely with three Regional Managers") · **Real estate** ("The shareholder owns the premises through [entity] and will offer the Buyer a [5]-year NNN lease at the rent shown on p. NN, with [two 5-year] renewal options." or "…available for purchase together with the Company; terms are provided separately."; no figure other than the rent) · **Seller financing** (optional, Q16d: "The Seller will consider carrying a note of up to [20]% of the purchase price.", ICP1 "Financing Considerations") · **Target timing** ("The Seller is targeting signing in [December 2026] and an effective date of [January 2, 2027].") · **Tax** ("Each party will rely on its own tax advisors.", OFF14 "Tax Matters"). No valuation, multiple, cash-at-close or earnout rows (D5). Close with ICP1's contact line | Notes, `entity_type`, `DealForm`, stay-on terms, `Premises arrangement`, timing inputs |
| S10.2 | Process and next steps, contact | ICP1's eight stages, verbatim names, `# \| Stage \| What happens \| Target timing`. Stages 6–8 use AMB's post-LOI wording: 6 Due Diligence "Confirmatory diligence, definitive agreements and transition planning (about [9–11] weeks from LOI)"; 7 Purchase Agreement "Sign the definitive Purchase Agreement and fund the escrow account"; 8 Close & Transition "Effective closing date [set with tax counsel]; Seller begins the agreed transition period". Timing column from the model's `LOIDate`, `SigningDate`, `EffectiveDate`; the three anchor rows bold. Contact block (2.9) | Process dates; `LOIDate`, `SigningDate`, `EffectiveDate` [OUTL "(11 week process)", LOI12 §10, OFF14 "Target Timing", CHK] |

Never in the CIM: valuation, asking price, multiples, recommended offer structure (D5). Those belong to the model's Valuation and Deal Structure tabs and to an optional buyer-directed ICP (Q4).

#### S11. Appendix (A: S11.1; others C)

| ID | Page | Content | Status |
|---|---|---|---|
| S11.1 | Basis of preparation and definitions | Sources used and their precedence; periods and fiscal year-end; revenue basis (gross or net); margin denominator; unaudited status; definitions of Reported EBITDA, Adj. EBITDA, SDE, PF Adj. EBITDA, LTM, PF, GDR, NDR and every KPI shown | A |
| S11.2 | Detailed income statement (annual and monthly) | Annual: the full category-level P&L. Monthly: L6, one page per 12-month window: label column 2.60 in, **12 month columns at 0.74 in, a 0.08 in gap, an `LTM` total at 0.85 in** (13 value columns, the 2.5 cap, so no PF or % column may be added); tier 1 "LTM Jul-26, by month" over the months and "LTM" over the total; tier 2 `Aug-25 … Jul-26` and `Jul-26`, first cell "Income statement  ($000s)"; ≤ 22 category-level rows from `Monthly P&L`, never the mapped account detail (split revenue-to-gross-profit and opex-to-Adj. EBITDA across two pages if longer); the LTM page always, earlier fiscal-year windows only on request, oldest first. Source: "Company financial statements (QuickBooks Online), monthly, Aug-25 to Jul-26; AMB Advisory analysis." Note: "Months are as reported; the LTM column ties to S6.1." Retention tables in S4 that show months use the same 12 + total geometry with `Ending customers` as the total (F8 §6) | C: monthly data or > 22 lines |
| S11.3 | Detailed retention and cohorts | Segment tables moved out of the body | C: S4.2 or S4.3 built |
| S11.4 | Coded customer list | Coded, no names | C: ≤ 60 customers |
| S11.5 | Market rent comparables | The `Real Estate` comps table (`Property \| City \| Size (sq. ft.) \| Built \| Type \| Base rent \| NNN \| Total ($/sq. ft.) \| Source \| Listed`), Average (n) and Subject rows boxed, listing services named in the source line; no cap rate or value | C: owner-held premises offered for lease (Q31) |

### 3.4 Default order and page budget

`S0 (3) → S1 (3–4) → S2 (3–5) → S3 (0–2) → S4 (0–6) → S5 (2–4) → S6 (3–5) → S7 (2–4) → S8 (0–3) → S9 (1–3) → S10 (2) → S11 (1–4)`

People and customers come before the financial detail, as in the write-ups (R-WU §11); the earnings headline surfaces early, in S1.3.

| Deal size (by PF Adj. EBITDA) | Target length | Dividers |
|---|---|---|
| Main Street (< $1.0M) | **20–28 pages** including front matter and appendix | Only if ≥ 24 pages |
| Lower middle market (≥ $1.0M) | **30–42 pages** plus an appendix of up to 12 | Yes |

### 3.5 Rule for variable length

1. **Evaluate triggers.** Build the module list from the dataset: every A module plus each C module whose trigger holds.
2. **A page must earn its place.** A page exists only if it carries at least one exhibit built from data and a conclusion that can be stated as an action title with a number. Otherwise its content merges into the neighbouring page named in the library (S2.4 with S2.5; S4.3 into S4.2; S5.5 into S5.1; S11.2 into S11.1).
3. **Fill floor.** After layout, any page below 60% fill merges with its designated neighbour. Never pad a page to fill it.
4. **Overflow.** A table with more than 13 value columns or 22 body rows splits: the summary stays in the body, the detail moves to S11 with a page reference.
5. **Caps.** If the body exceeds the target, cut in this order: S3.3, S6.5, S4.6, S5.5, S2.1's chart, S6.4. Never cut S1, S6.1, S7.1, S7.2 or S10.
6. **Section length follows evidence.** Sections are allowed to be uneven (R-WU §10 trait 2). Never create a page to balance a section.
7. **Dividers** only at 24 pages or more (D12).
8. **Log the result.** `run-summary.md` lists modules built and omitted, with the trigger each failed.

---

## 4. Writing voice

### 4.1 Register

The CIM is written in the **third person about the Company**, in AMB's analytical voice: conclusion first, then mechanism, then number, then implication. AMB's best prose is OPP3 (buy-side, first-person plural: "Our view:"). The CIM keeps its method and drops the first person and the verdicts on price. AMB Advisory speaks in the first person only on the process and contact pages.

### 4.2 Rules

1. **Lead with the point.** First sentence of every bullet and paragraph states the conclusion.
2. **Every claim carries a number and a comparison** (a prior period, a benchmark, a share). "Commercial revenue grew 16% in FY2025 to $821K" (illustrative) rather than "strong commercial growth".
3. **Name the mechanism.** Use "because", "driven by", "as a result", "either (a)… or (b)" (R-WU §10 trait 4).
4. **Name things.** Systems (ServiceTitan, QuickBooks Online), suppliers, towns, months, counts (R-WU §10 trait 1).
5. **Attribute what is not verified.** "Management estimates…", "per management", "the Seller reports", plus a footnote (4.6).
6. **State the negative with its context.** A candid negative followed by the fact that bounds it is more credible than an omission (R-WU §7.1 "Candour about negatives").
7. **One claim per sentence.** No triads of adjectives; no stacked clauses.
8. **Say what is not assumed.** "The pro forma figures do not include…" (OPP3's "Our pro forma does not assume…").
9. **No judgement of price or attractiveness.** No "attractive", "compelling", "undervalued" about the deal.
10. **No em dashes, exclamation marks, rhetorical questions or italics for emphasis.**

### 4.3 Verbatim AMB examples to imitate

| Example (verbatim) | Source | What it teaches |
|---|---|---|
| "Because staff are paid a fixed amount, margin per client depends almost entirely on how many clients each person carries." | OPP3 | Mechanism before verdict |
| "For context, in comparable recurring-service businesses a single client is typically around 1% of revenue; 2% is elevated and 3% is high." | OPP3 | A benchmark that makes a number meaningful |
| "Over the same period, headcount roughly doubled from 43 to 87, and LTM payroll rose 76% (from $981K to $1.72M)." | OPP3 | "From X to Y" comparisons |
| "Our pro forma does not assume Topkey replaces property management systems or Bill Pay, nor that Topkey is sold into clients not already using it. Each is incremental upside." | OPP3 | Stating what is not assumed |
| "Some former clients are missing end dates in the source data, so recent-month losses may be understated." | OPP3 | Flagging data limits |
| "Commentary: Non-STR recurring revenue increased 84% over the past two and a half years, driven by the addition of occupancy tax services (32% of non-STR revenue), Topkey subscription fees (16%), STR bill pay (14%), and controller services (7%)." | MEMO | Growth decomposed into named drivers with shares |
| "Commentary: Indirect wages now represent 32% of total payroll, or $700K in annual compensation. Wages spiked in Nov'24 and Mar'26, indicating key hires." | MEMO | Level, share, event, cause |
| "EBO is based in St. Louis, with offices in Columbia, Missouri and Chicago, Illinois. The company services 244 clients and 38K units, with 63 employees." | ICP5 | The fact-order opening |
| "Note: All figures in USD thousands unless noted. Financials are as provided by Seller and have not been independently audited." | ICP5 | The standard units and basis note (adopted, with "the Seller") |
| "Bid job income tripled from '23 to '24, driven by a single large roof replacement project, and has reverted towards historical performance over the TTM period." | WU Dil-CPM | One-off identified, sized and timed |
| "Customer churn has been focused on associations that either (a) were looking for a lower cost option or (b) switched to self management (often hiring their own manager directly)." | WU Dil-CPM | Segmented cause |
| "Excluding the three on-site associations, no single customer accounts for more than 2% of revenue." | WU Dil-HOACS | Concentration stated precisely |
| "Sellers ascribe this success to (1) paying at or slightly above market rates for talent and (2) ensuring a deep enough bench to avoid overworking the team." | WU Dil-CPM | Attribution |
| "Onboarding each cohort has become systematic, and the team has talent in place to onboard/offboard 3-6 clients per month." | WU Forth | Capacity as a number |
| "Amend Owner Compensation – This adjustment restates the owner's salary to $200k plus applicable payroll taxes and benefits of 15%." | TPL definitions panel | Add-back basis: mechanism → quantum |
| "PF-3. Incremental Hire – Burdens EBITDA for the $60k salary and associated fringe expenses (7.65% payroll tax and 7.35% benefits) of hiring one additional portfolio manager post-transaction." | TPL | A negative pro forma adjustment, costed |
| "Annualized most recent month" · "Assuming no material change" · "Conservative approach for nonrecurring items" · "Active employee roster" | V51 PF rationale column | Model rationale phrasing (terse, method-first) |
| "This structure should be confirmed with a qualified tax advisor. AMB is not providing tax or legal advice." | OPP3 | The tax disclaimer (Deal Structure tab, ICP) |

**Buy-side to sell-side conversions.** Project Ridgeline is the bot's fictional sample (`samples/project-ridgeline/`). Its revenue, gross profit, 1,450 members, 45-hour owner week, 11-year operations manager and $95,000 replacement salary come from the sample files; other Ridgeline figures in this guide (the 760 members in 2021, renewal rates, the revenue split by line, owner compensation of $240K, Adj. EBITDA) are invented for illustration and must never be reused as data.

| AMB buy-side voice | CIM voice |
|---|---|
| "Our view: Keystone is an attractive acquisition at approximately $3.0M…" [OPP3] | Not used. The CIM does not opine on price. |
| "Takeaway: Client churn is real, but Keystone has been trading up." [OPP3] | "Takeaway: Maintenance-agreement members rose from 760 to 1,450 since 2021; most non-renewals occur at the first anniversary, and renewals thereafter exceed 90% (1)." |
| "We would like to confirm the current trend and pipeline with Ben." [OPP3] | Moves to `open-questions.md`. The CIM states only confirmed facts. |
| "Leadership Turnover" (stub heading) [MEMO] | Consideration: "Owner involvement". What the data shows: "The owner works about 45 hours a week on estimating, commercial relationships and hiring." How addressed: "The operations manager (11 years' tenure) runs dispatch and scheduling; the owner offers up to 12 months of transition." |

### 4.4 Banned words and constructions

A lint step fails the CIM on any of these in body text. Each has a fix.

| Banned | Why | Write instead |
|---|---|---|
| well-positioned, poised, strategically positioned | Claim without evidence (R-DEL §14) | The fact that creates the position |
| robust, strong, solid, healthy (without a number) | Adjective in place of data | The number and its comparison |
| best-in-class, world-class, leading, one of the leading, premier | Unverifiable superlative (ICP5 "one of the leading HOA and condominium management firms") | A ranked fact with its source |
| well-established, proven track record, proven growth engine | ICP5 generic prose | Founding year, tenure, CAGR |
| platform-sized, scalable platform, significant runway, ample headroom | Vague scale claims (ICP5) | Capacity numbers |
| high margin organization, operational efficiencies (bare) | R-WU §7.2, ICP5 | Margin versus a named benchmark |
| strong leadership, deep management team, highly respected | Unsupported (R-WU §7.2) | Roles, tenure, span of control |
| loyal / sticky customer base, diversified (bare) | Unsupported | Retention %, top-10 share |
| unlock value, leverage synergies, seamless, cutting-edge, state-of-the-art, turnkey, holistic, comprehensive suite, dynamic | Marketing filler (R-DEL §14) | Delete, or state the mechanism |
| unique, differentiated, key differentiator, moat | Unsupported | What competitors do not do, with evidence |
| significant, substantial, meaningful (without a number) | Vague | The number |
| impressively, remarkably, notably, importantly | Editorialising adverbs (R-WU §7.2) | Delete |
| highly achievable, clear path | Assertion (R-WU §7.2) | A proof point already achieved |
| above average / below average (no benchmark) | "Average" undefined (R-WU §7.2) | Name the benchmark and its value |
| In today's … landscape; navigate; delve; tapestry; testament to; boasts; stands out | Generated-text tics | Delete |
| It is worth noting; Furthermore; Moreover; Additionally (sentence openers) | Filler transitions | Start with the fact |
| not only … but also; not just X, but Y | Generated-text construction | Two plain sentences |
| attractive, compelling, undervalued (of the deal) | Price opinion (rule 9) | Delete |
| we, our, us (outside S10) | Voice rule 4.1 | "The Company", "management", "AMB Advisory" |
| "Initial", "preliminary" on a figure | AMB used "Initial" to flag unverified numbers [MEMO] | A footnote "(1) Per management; not independently verified." |

### 4.5 Action titles

1. **One sentence, sentence case, no final full stop.** 60–110 characters, two lines at most, hard cap 150 (2.2).
2. **The title states the conclusion and contains at least one number**, with its period or basis.
3. **Topic titles are allowed only on furniture pages:** cover, disclaimer, contents, dividers, process and contact, appendix detail ("Detailed income statement"). Everything else fails "Financial overview" or "Customer analysis".
4. **No section prefix.** KICK's "*Process:* We should be in position…" puts the section in red italics before the headline (R-BRAND §5.3). The footer tracker now does that job.
5. **Storyline test.** Read in sequence, a section's titles must make its argument without the pages.
6. **Figures in titles use prose style** ($3.04M, 12%, 1,450), consistent with the exhibit below to the last digit shown.
7. **Never a question, a pun or an exclamation.**

| Topic title (fails) | Action title (passes) | Source |
|---|---|---|
| Client Retention Charts | Client wins exceeded losses in 17 of the last 21 months; May-26 (7 wins, 15 losses) was the outlier | R-DEL §12, counts from PACK p7 |
| Financial Overview | Management fees grew at a 20% CAGR to $4.0M as door count rose 21% since FY2022 | R-BRAND §8 |
| Concentration is above average (OPP3 H2: a conclusion, but no number) | Top 20 clients account for 32.3% of fees, and the largest is 3.6% | OPP3 figures |
| Summary P&L Overview ($000s) | Revenue grew at a 12% CAGR to $3.04M in FY2025 while gross margin held at 61–62% | Ridgeline sample (fictional), rendered in 2.3 |
| Adjusted EBITDA | Adj. EBITDA of $498K in FY2025 reflects $240K of owner compensation reset to a $95K market salary | Ridgeline sample (illustrative figures) |

### 4.6 Numbers in prose, sources and footnotes

**Numbers in prose**

- Money: `$3.04M`, `$998K`, `$95,000` for salaries; K and M in capitals with no space. Negatives in prose use words ("a loss of $166K") or AMB's minus form `–$166K` in tables of text (R-DEL §10.1).
- Ranges: en dash, no spaces: `$500K–$700K`, `8–10 technicians`, `FY2021–FY2025` (Keep: OPP3).
- Percentages: whole numbers in prose (`12%`), 1 dp for margins (`16.4%`), `bps` for margin changes under a point.
- Approximation: `~` in tables of text only; in sentences "about", "roughly", "approximately" (Keep: OPP3).
- Periods in prose: "FY2025", "LTM July 2026", "the 12 months to July 2026". In tables and titles: `LTM Jul-26` (D7).
- Growth: "grew 12%", "a 12% CAGR", "up from X to Y". Never "12% growth rate increase".

**Sources, notes and footnotes** (the notes band, 2.8)

- **Every exhibit page carries a `Source:` line.** AMB exhibits carried none (R-DEL §4.2), and the write-ups carried them in 2 of 6 documents (R-WU §8). Standard strings, chosen by the source actually used (REQ precedence: QuickBooks Online API > QuickBooks export > tax return > PDF statements > bank statements):
  - `Source: Company financial statements (QuickBooks Online), FY2023–FY2025 and LTM Jul-26; AMB Advisory analysis.`
  - `Source: Company federal tax returns (Form 1120-S), FY2022–FY2024; AMB Advisory analysis.`
  - `Source: Proprietor's federal tax returns (Schedule C, Form 1040), FY2022–FY2024; AMB Advisory analysis.` (partnership: `(Form 1065)`; F6)
  - `Source: Company customer list as of Jul-26; AMB Advisory analysis.`
  - `Source: Management.` (for facts from intake notes)
- **General note** (unnumbered, one line): `Note: Figures in USD thousands unless noted. Financials are as provided by the Seller and have not been independently audited.` (Adopted from ICP5.) Add the margin denominator whenever pass-through revenue exists, and the fiscal year-end if it is not December 31.
- **Numbered footnotes** `(1)`, `(2)`, restarting on each page. The marker is attached to the figure or row label it qualifies, as superscript "(1)" in text and a trailing " (1)" in table labels (Elevate: MEMO's Quick Stats footnotes were not attached to their lines, R-DEL §5).
- **Every management-provided or unverified figure gets a footnote:** `(1) Per management; not independently verified.`
- **Cross-references** use page numbers: "see page 17". No exhibit numbers.
- **Non-GAAP note** on the first page that shows Adj. EBITDA: `Adj. EBITDA, SDE and PF Adj. EBITDA are non-GAAP measures; see page 24 for the reconciliation to net income.`

### 4.7 Placeholders

- Missing information becomes `[Confirm: …]` in `FF0000` italic and is listed in `open-questions.md` (per `CLAUDE.md`).
- Never "[ ]", "TBD", "XX", "N/A" as a placeholder, a highlighted stub, or a sentence fragment (all shipped in AMB and TCC documents: R-WU §8, R-DEL §12).
- A CIM with any `[Confirm: …]` remaining is a draft. The export step refuses to label it final.

### 4.8 Numbers must reconcile

Every figure in a title, bullet, table or chart is read from a named output of the one model run (5.14) and formatted by one function. The QA step re-extracts every number from the deck and checks it against the model. AMB's documents disagree with themselves (Steady-State Adj. EBITDA shown as $449K, $469K and $551K across three documents; ICP5's "38K units" against 35,737 and 33,372 on later pages: R-DEL §6.6, R-BRAND §6.9). That must be impossible by construction.

---

## 5. Model template spec

The model is AMB's diligence workbook, rebuilt clean. Keep AMB's sheet anatomy, colour code, formats and recast logic [V51]. Fix its defects: one palette, one font name, no hard-codes over links, bounded periods, a master check, print furniture, and no `TODAY()`. The existing rule in `CLAUDE.md` still holds: **every formula the writer emits is mirrored in `src/model/engine.ts` and verified by `verifyWorkbook`**, so each new tab below arrives with its engine counterpart and tests.

### 5.1 Tab architecture and order

Outputs first, then analysis, then data behind a divider (Keep: V51 order; TPL "answer → evidence → raw data"). Output and analysis tabs have **no tab colour** (Keep: V51 colours only dividers and exceptions).

| # | Tab | Status | Contents | Precedent |
|---|---|---|---|---|
| 1 | `Cover` | A | 5.13 | V51 Cover |
| 2 | `Contents` | A | Hyperlinked index (`# \| Tab \| Purpose \| Units \| Check`), model information block, master Print switch, master check, version log | New (R-MOD §10, R-TPL §9 item 14) |
| 3 | `Summary` | A | One page of tables: FY / LTM / PF key lines; condensed EBITDA ladder; KPIs; valuation range. No tiles | V51 Offer Overview idea; R-MOD §10 |
| 4 | `Assumptions` | A | Every input, blue, each with a `Source` column: as-of date, first data month, source granularity (Monthly / Annual), books basis (Cash / Accrual), LTM end month, fiscal year-end, units, customer term, owner replacement salary and burden, capital reserve, tax rate by entity type, PF methods, the Low / Mid / High scenario block (5.5), projection drivers, valuation multiples, `DealForm`, `StructurePreset` and deal terms (5.5, 5.6), the "Real estate" block (5.5), sensitivity midpoints and steps | Elevate: V51 scattered inputs; SUN's unlabelled assumption list with no Source column; bot's existing Assumptions tab |
| 5 | `P&L Summary` | A | "Historical P&L Summary ($000s)": the period layout (5.2), revenue lines, gross profit, expense buckets, Reported EBITDA, Net income, KPI block, `Check` row | V51 P&L Overview; TPL P&L Summary |
| 6 | `Adj. EBITDA` | A | The ladder (5.4) with refs, margins, SDE, a `Basis` column | V51 recast; TPL Summary |
| 7 | `Adjustments` | A | The schedule (5.3) | New (R-MOD §9.4 item 18) |
| 8 | `Revenue Detail` | A | Revenue by line: $, % growth, % of total; recurring vs non-recurring; LTM strip (5.5) | V51 Revenue Analysis |
| 8a | `Revenue Charts` | A when `Monthly P&L` exists | MC-R1, MC-R2 (5.12) | Keep: V51 Revenue Charts |
| 9 | `Expense Detail` | A | Cost of revenue and expense buckets: $, % of revenue, % growth; gross margin; LTM strip (5.5) | V51 Expense Analysis |
| 9a | `Expense Charts` | A when `Monthly P&L` exists | MC-E1–MC-E5 (5.12) | Keep: V51 Expense Charts, Tech Stack chart |
| 10 | `Customer Overview` | C: customer list | Mix by type, size band, geography | V51 Client Overview |
| 11 | `Customer Retention` | C: ≥ 2 years of customer dates or revenue | Count and $ roll-forwards, GDR, NDR, churn, median banner; LTM strip (5.5) | V51 Client Retention / $; TPL |
| 11a | `Retention Charts` | C: as `Customer Retention`, plus monthly dates | MC-C1–MC-C5 (5.12) | Keep: V51 Customer Retention Charts, Client Retention Charts $ |
| 12 | `Concentration` | C: revenue by customer | Top 20, coded, cumulative share | V51 Client Concentration |
| 13 | `Cohorts` | C: ≥ 3 annual cohorts | Count and revenue triangles | TPL Cohort Analysis |
| 14 | `Headcount` | C: payroll register | By department: count, comp, % revenue, tenure, load ratios; retention roll-forward | V51 Employee Overview / Retention |
| 14a | `Headcount Charts` | C: payroll register with hire and termination dates | MC-H1–MC-H5 (5.12) | Keep: V51 Employee Retention Charts, Tenure Charts |
| 15 | `Balance Sheet` | A when any balance sheet exists | Condensed balance sheet, year-ends and LTM month-end, `Check` row (A = L + E) | Bot's existing BS tab |
| 16 | `NWC` | A with an equity purchase and ≥ 12 month-end balance sheets; C otherwise (year-ends only: no peg, a note) | 5.6 | Keep: AMB's convention and peg basis [LOI12, RECS]; Elevate: no AMB or TCC workbook computes one |
| 17 | `Debt-Like Items` | A with a balance sheet | 5.6 | New |
| 18 | `Cash Flow` | A with ≥ 2 balance sheets | Historical indirect cash flow, capex, free cash flow, cash conversion | Bot's existing CF tab |
| 19 | `Proof of Cash` | C: bank statements or CSV | Monthly P&L revenue vs bank deposits (excluding transfers, loans, owner contributions); variance $ and %; flag above 5% | New (R-TPL §4.6) |
| 20 | `Projections` | A | Five-year driver-based IS / BS / CF, every cell a formula on `Assumptions` | Bot's existing projection |
| 21 | `Opportunities` | C: levers in notes | One sizing grid per lever (feeds S9.1) | WU Coral and Dil-CPM grids |
| 21a | `Real Estate` | C: `Premises arrangement` is any "Owned by seller…" value, or a rent roll is supplied | Property facts, rent roll, market rent comparables, NOI bridge by scenario, rent-to-market output (5.5); units `($)`, computed before `Valuation` capitalises it | SUN `Tennant View`, `Market Rent Analysis`, `CRE P&L`; CORSAIR bridge (F7) |
| 22 | `Valuation` | A | 5.5 | V51 Earnings Sensitivity; SUN; ACQ |
| 23 | `Deal Structure` | A | 5.5: one column per structure or LOI | VAL; CORAL; CPM S&U |
| 23a | `Offer Comparison` | C: ≥ 2 structure or LOI columns | Side-by-side comparison with Variance (5.5) | Keep: VAL / V51 `Offer Comparison`; OSO pp. 2–4; OSC; BL |
| 24 | `Sensitivities` | A | Two-way grids (5.5) | V51 Partnership Sensitivity Tables; SUNPDF |
| 25 | `Checks` | A | 5.7 | New (R-MOD §7 gaps) |
| 26 | `Data -->` | A | Empty divider, tab colour `7B0000` | Keep: V51 `Raw Data -->` divider idea |
| 27 | `Monthly P&L` | A when monthly data exists | Category-level monthly grid: the engine every period column reads | V51 P&L Forecast grid P:AT |
| 28 | `Databook` | A | Account × period grid with mapping columns (5.2), tie-out block | V51 Combined P&L; TPL Detail_PL |
| 29 | `Mapping` | A | Account → AMB category → summary line → "Personal?" tag → source; overrides from `mapping-overrides.csv` marked | V51 "Summary Account" and "Personal?" columns |
| 30+ | `Raw - P&L FY2025`, `Raw - BS FY2025`, `Raw - Bank`, `Raw - Customers`, `Raw - Payroll`, `Raw - Tax Return FY2024`, `Raw - Rent Roll`, `Raw - Rent Comps`, `Raw - Owner Stmt`, `Raw - Comps` | A per source | Values only, as exported; gridlines on; freeze below headers; tab colour `A6A6A6`; a listing URL is a cell value, never a hidden hyperlink (SUN column N) | Keep: V51 Raw tabs |

**Tab rules.** Names ≤ 20 characters, Title Case, spelled correctly, no person names, no version numbers, no "scrap" tabs (V51 had "Tennant View", "Randy's Valuation" and a mistitled chart tab: R-MOD §9.3; SUN's `Tennant View` tab and its "Randy's Valuation" / "Monica's Compensation" rows print). Chart tabs follow their analysis tab (5.12). No hidden tabs. No external links. No defined names except the output names in 5.14 (V51 carries 52 names, all `#REF!`; TPL carries 40,571: R-MOD §6.5, R-TPL §8). Target-supplied data packs are never pasted in with their own styles; they are restyled or kept as `Raw -` tabs.

### 5.2 Period layout

**Standard column layout** for `P&L Summary`, `Adj. EBITDA`, `Adjustments`, `Revenue Detail`, `Expense Detail` (Elevate: a normalization of V51's grids, not AMB's own widths. V51 P&L Overview has B 28.71, value columns 6.43–13.0, two FY columns (2024, 2025), spacers 0.86 and no basis column, print area B2:N73; P&L Forecast has B 33.86, C:D 9.57, F:G / I:K / M:N 11.0 and spacers 0.86. Widths here and throughout section 5 are the stored OOXML values, which Excel displays slightly smaller: 1.71 stored shows as 1.00):

| Col | Width | Content |
|---|---|---|
| A | 1.7 | Gutter |
| B | 34 (48 on Assumptions, Deal Structure; 36 on Adjustments) | Labels |
| C:E | 9.1 each | Full Year: FY-2, FY-1, FY |
| F | 0.9 | Spacer |
| G:H | 9.1 | YTD: prior year, current year |
| I | 0.9 | Spacer |
| J:K | 9.1 | LTM: prior year, current year |
| L | 9.1 | PF (current LTM month, run-rate) |
| M | 0.9 | Spacer |
| N:O | 9.1 | PF vs. LTM: Delta ($), Delta (%) |
| P | 0.9 | Spacer |
| Q | 60 | Basis / notes (italic) |

- **Two-tier header in rows 5–6.** Row 5 is the group ("Full Year", "YTD", "LTM", "PF", "PF vs. LTM") set with *centre across selection* over each block, never merged. Row 6 is the period label ("2024", "Jul-26", "($)", "(%)"). B6 names the table ("Income Statement"). Both rows `7B0000` fill, Arial Bold 9 white (Keep: V51 rows 5–6; TPL centre-across).
- **Labels are derived, never typed.** Row 6 labels are formulas on `Assumptions!AsOfDate` and `Assumptions!FYEMonth`: `=TEXT(EOMONTH(AsOfDate,0),"mmm-yy")`. Months are `mmm-yy` ("Jul-26") everywhere (D7). When the fiscal year does not end in December, the tier-1 label reads "Full Year (FYE Jun)".
- **One monthly grid drives every period.** `Monthly P&L` holds category × month in $000s. Each period column is `=SUMIFS(grid_row, month_row, ">="&start, month_row, "<="&end)`, **bounded on both ends**. The start and end dates for each column sit in two helper rows directly below the last printed row (outside the print area), labelled "Period start" and "Period end", grey `808080`, derived from `Assumptions`. YTD end is `EOMONTH(AsOfDate,0)`, never `EOMONTH(start,12)` (Fix: V51's YTD window runs to 12/31, v6 review Finding 5, still open [FR6, R-MOD §9.1]).
- **Balance-sheet columns** are point-in-time: `=INDEX(bs_row, MATCH(period_end, month_row, 0))`, never SUMIFS.
- **PF column** = LTM plus the pro forma adjustments mapped to that line on `Adjustments` (5.3). Each PF-affected line shows its method in column Q. AMB's own phrasing, the only four strings in V51 P&L Forecast D111–D165, is "Annualized most recent month", "Conservative approach for nonrecurring items", "Active employee roster" and "Assuming no material change" (Keep: V51 PF rationale column D). Further methods the bot may write, in the same terse method-first grammar: "Contracted", "Market rate", "3-year average", "Latest year", "% of sales, 3-year blended" (New; used by the Main Street scenario block, 5.5).
- **Missing data is omitted, not zeroed.** Without 12 or more months of monthly data, the YTD and LTM blocks are left out and the Summary states "Full fiscal years only". The current bot's limit (README "Known limits") becomes this rule.
- **Units.** $000s on analysis tabs (Databook divides raw dollars by 1,000, Keep: V51). Unit-level tabs state `($)`, `(#)` or `(#, $)`.
- **Grouping.** Monthly columns on `Monthly P&L` and `Databook` are grouped (outline level 1) so the summary view collapses (Elevate: neither V51 monthly grid is grouped; V51 groups only the hidden prior months on its strips, Expense Analysis G and Client Retention J:R, F8 §0). Mapping columns on `Databook` are grouped (Keep: V51 Combined P&L C:D).

**Databook mapping columns** (Keep: V51 Combined P&L; TPL Detail_PL): `Account (as exported) | Source | AMB Category (IS_CATEGORIES in src/domain/financials.ts) | Summary Line | Personal? ("(+) Owner vehicle") | Adjustment Ref`. Period columns follow. A tie-out block below compares Databook to each raw tab for every subtotal and period: `Databook ($) | Raw ($) | Diff ($) | Status` returning "TIES OUT" or "CHECK" at a $1 tolerance (Keep: V51 rows 120–166).

**`Monthly P&L` columns** (Keep: V51 P&L Forecast, with the months moved one column right so the standard period block is unchanged; F8 §3.4)

| Col | Width | Content |
|---|---|---|
| A:P | as above | The standard period block (B labels; C:E FY; G:H YTD; J:L LTM PY, LTM CY, PF; N:O deltas; spacers) |
| Q… | 9.1 each | One column per month, oldest first, ending at `EOMONTH(AsOfDate,0)`; typically 24–36 columns (Q34). No spacer between months; no FY subtotal columns interleaved (the FY figures are C:E). Grouped at outline level 1, collapsed on the buyer version and expanded internally |
| After the last month | 0.9 | Spacer |
| Next | 60 | Basis / notes (italic) |

- Row 5 tier 1: the period groups over A:P and `Monthly ($000s)` centre-across-selection over the months. Row 6 tier 2: the month as a **first-of-month date serial** in `AMB Month Header` (`[$-409]mmm-yy;@`); first month `=Assumptions!FirstDataMonth`, each later month `=EOMONTH(<prev>,0)+1`. Never a typed date in the chain (Keep: V51 `Q5 =EOMONTH(P5,0)+1`; Fix: V51 types P5 `2024-01-01`, every `Combined P&L` month, and `Client Retention` Q5 mid-chain). V51 facts: `P&L Forecast` P:AT are all 10.14 (one column record; an earlier brief's "13.0" is an openpyxl placeholder); `Combined P&L` months are N 12.29, O 15.57, P 6.71, Q:AR 10.57, under a blue `1F4E78` header (Q35).
- Month cells `=SUMIFS(Databook!<month col>, Databook!$Category, $B7)` (green). Every ladder row (5.4) exists per month so the strips and charts can read any line (Keep: V51 rows 74–107 per month). The `Tie Out` check row runs per month (Keep: V51 row 71). The period helper rows sit directly below the last printed row in `AMB Helper`, not eight rows down in Calibri (V51 rows 199–200).
- Print: area `B2:<notes col><last row>` excluding the helper rows; **landscape, fit 1 page tall × N wide** (`fitToWidth = 0`, `fitToHeight = 1`); print titles **rows 5:6 and column B**; manual column breaks after P and after every 12th month, so each page is one fiscal year (or the LTM) with labels repeated (Fix: V51 has no print area on either grid; LibreOffice printed `P&L Forecast` as 18 portrait pages of six orphan months with no labels and `Combined P&L` as about 50 A4 pages of one column each). Freeze at C7, zoom 100, gridlines off.

#### 5.2A Annual-only layout (Main Street mode)

Applies when `Assumptions!SourceGranularity = "Annual"` (tax returns, annual statements) or `MainStreetMode = 1` with no monthly grid. `Monthly P&L`, YTD and LTM blocks are omitted; the Summary states "Full fiscal years only; source: <source string>" (Keep: SUN `Laundromat Valuation`, AMB's six-column annual page; F6 §5.1).

| Col | Width | Content |
|---|---|---|
| A | 1.7 | Gutter |
| B | 34 | Labels |
| C:E | 9.1 | Full Year: FY-2, FY-1, FY (labels derived per D7: `FY2022`) |
| F | 0.9 | Spacer, with a **thin right border on E from row 5 to the last printed row** (Keep: SUN's vertical rule between actual and pro forma, E7:E62) |
| G:I | 9.1 | Pro Forma: `Low`, `Mid`, `High` |
| J | 0.9 | Spacer |
| K | 60 | Basis / notes (italic): the PF method per line |

- Two-tier header per 5.2 and 5.8 (`7B0000`, white bold): row 5 `Full Year` over C:E and `Pro Forma` over G:I, centre across selection; row 6 the period labels; B6 the table name. SUN's fill-less bold header and grey `D9D9D9` section bar (theme white −15%) are theme-tint drift and are not adopted (D4).
- **Row idioms (Keep: SUN):** every expense line is followed by an italic indent-1 `% Sales` row (`AMB Ratio`, `#,##0%`); the expense line itself is `AMB Line Banded` (fill `F2F2F2` across B:I, not the spacers) and the ratio row is white. Sub-blocks `Expenses`, `EBITDA Bridge`, `Business Valuation`, `Financing` are `AMB Subsection` (Arial 9 underlined, no fill, indent 0). Signed bridge rows indent 1.
- Key totals `Reported Net Income`, `Adj. EBITDA` (+ `% Margin`) and `SDE` (+ `% Margin`, + `DSCR` as a third row in the PF columns) are `AMB Key Total` boxes; the box's right border sits on E and on I (Keep: SUN).
- Portrait, fit to one page wide; Print toggle at the right of row 3; a source line and the 5.11 footer (SUN's printed exhibit has neither).

#### 5.2B Tax-return line map (`Databook` in annual mode)

`Databook` columns: `Form | Line | Line description (as printed) | AMB Category | Summary Line | Personal? | Adjustment Ref | FY-2 | FY-1 | FY | Source page`, one row per return line, values in dollars (analysis tabs divide by 1,000). The Schedule C map, verified line by line against TR22–24 (F6 §3.6): line 1/7 gross receipts → `revenue`; 8 advertising → `marketing`; 9 car and truck → `other_opex`, flagged `Personal?`; 11 contract labor and 26 wages → `payroll`; 13 depreciation and §179 → `depreciation_amortization` (Form 4562 split in the Basis column); 15 insurance, 17 legal and professional, 18 office, 21 repairs, 22 supplies, 23 taxes and licenses, 25 utilities → `other_opex` (sub-lines as broken out); 16a / 16b interest → `interest_expense`; 20b rent → `rent`; 27a / Part V other → `other_opex` (itemised; vehicle, telephone and meals lines flagged `Personal?`); 28 total expenses and 31 net profit → tie-outs. Form 1120-S: 1c revenue; 7 officer compensation → `owner_comp`; 8 salaries; 11 rents; 12 taxes and licenses; 13 interest; 14 depreciation; 19 other deductions with its statement; 20 and 21 tie-outs. Form 1065: 10 guaranteed payments → `owner_comp`; 21 and 22 tie-outs. Rules:

1. `Other Expenses` on `P&L Summary` = `SUMIFS` of every line mapped to `other_opex` and not broken out, **never `Total − listed lines`** (SUN's plug omits the interest row and overstates Other by $12.6K and $14.7K, understating every PF SDE by about $9K and the 3.0x valuation by about $27K, F6 §4.1).
2. Tie-out block under the Databook, `Databook | Return | Diff | Status`, for **total expenses** (Sch C 28 / 1120-S 20 / 1065 21) and **net income** (Sch C 31 / 1120-S 21 / 1065 22) per year; "TIES OUT" at $1. `Total Expenses` on every tab is a sum, never typed (SUN types 147.277 / 216.761 / 247.729).
3. Contract labor becomes `owner_comp` only through an `Adjustments` row `[S1]` with Evidence "Management representation" and Status `Proposed` until a 1099 or bank record supports it (SUN takes line 11, $55,000 in FY24 only, as the owner's pay with no evidence; Q30).
4. `income_tax` is zero for pass-through entities; the ladder shows "–" for `[D2]`. Taxes and licenses (line 23) is opex.
5. Equipment cost placed in service (Form 4562 Part I line 2 plus Part III Section B basis, excluding real property) feeds the Capital Reserve default (5.4).
6. Cash-basis returns (line F box 1) set `Assumptions!BooksBasis = "Cash"` (5.6).
7. Scanned returns have no text layer; extraction runs through the bot's vision path and every figure carries its `Source page`.

### 5.3 Recast and adjustments schedule (`Adjustments`)

One row per adjustment. Every ladder row on `Adj. EBITDA` sums from here; nothing is typed on the ladder.

| Col | Header | Content |
|---|---|---|
| B | Ref | Formula-numbered by tier: `="["&CHOOSE(MATCH(D8,{"Definitional","Normalization","Owner compensation","Pro forma","Memo"},0),"D","N","S","PF","M")&COUNTIF($D$8:D8,D8)&"]"` (or an equivalent that `verifyWorkbook` can evaluate). Inserting a row renumbers every ref (Keep: CPM hidden-counter bracket numbering) |
| C | Adjustment | Client-grade label without sign prefix ("Owner vehicle and phone") |
| D | Tier | `Definitional` / `Normalization` / `Owner compensation` / `Pro forma` / `Memo` |
| E | Category | `Interest`, `Taxes`, `D&A`, `Personal / discretionary`, `Non-recurring`, `Non-operating`, `Accounting (cash to accrual, out of period)`, `Related-party (rent to market)`, `Owner compensation`, `Replacement cost`, `Capital reserve` (Main Street `[S3]`), `Run-rate`, `Other consideration` |
| F | Basis | One sentence: mechanism → quantum → source ("Removes the owner's personal vehicle lease and fuel, $18K in FY2025, per general ledger detail.") (Keep: TPL definitions panel style) |
| G | Source document | "GL detail, account 6420"; "Seller add-back list"; "Lease agreement" |
| H | Evidence | `Documented` / `Management representation` / `To be requested` (only for a row computed from documented figures whose own document is still to come, such as `[S4]` at statutory rates, or a bot-flagged row at zero; it is footnoted in the CIM and listed in `open-questions.md`) |
| I | Status | `Proposed` / `Supported` / `Accepted` / `Excluded` |
| J | In CIM | `=I="Accepted"` |
| K | P&L line | For pro forma rows: the P&L line the adjustment adjusts (feeds the PF column) |
| L | PF method | For pro forma rows: "Annualized most recent month", "Contracted", "Active employee roster", "Market rate", "3-year average" (5.2) |
| M | Spacer | 0.9 |
| N:… | Periods | FY-2, FY-1, FY ‖ YTD PY, YTD CY ‖ LTM PY, LTM CY, PF, in the standard layout. Sign: positive increases EBITDA |
| After periods | Monthly | Optional monthly amounts where the add-back comes from the Databook "Personal?" tag (SUMIFS), so LTM and YTD are exact |

**Where rows come from**

| Source | Tier / category | Status on creation |
|---|---|---|
| Interest, taxes, D&A from the P&L | Definitional | Accepted |
| Interest income read off the P&L | Normalization / Non-operating | Accepted, Evidence `Documented`: the amount is the P&L account itself, as for the definitional rows (QA round 2 F15) |
| `addbacks.csv` `type = owner` | Owner compensation | Proposed |
| `addbacks.csv` `type = discretionary` | Normalization / Personal / discretionary | Proposed |
| `addbacks.csv` `type = non_recurring` | Normalization / Non-recurring | Proposed |
| `addbacks.csv` `type = other` | Normalization, category left blank and flagged in `open-questions.md` | Proposed |
| Bot-flagged likely add-backs (`merge.ts` suggestions) | Normalization | Proposed, amount 0 until an advisor enters it |
| `owner_comp` category, all periods | Owner compensation `[S1]` (add back) | Accepted |
| `owner_replacement_salary` (REQ, default $85,000) × (1 + burden, default 15%) | Owner compensation `[S2]` (deduct) | Accepted |
| Capital reserve, Main Street mode (Form 4562, else the three-year average of D&A as a proxy) | Owner compensation `[S3]` / Capital reserve (deduct) | Accepted |
| Employer payroll taxes on `[S1]`: the payroll register's employer costs, else federal statutory rates on the `[S1]` salary (a formula on `[S1]` and the rates on `Assumptions`) | Owner compensation `[S4]`, summed into the `[S1]` rung | Accepted when `[S1]` is documented, else Proposed |
| Run-rate items (price increase, contracted wins or losses, roster changes, market rent) | Pro forma | Proposed |

The 15% burden default follows TPL's "payroll taxes and benefits of 15%". Both it and the $85,000 are blue inputs on `Assumptions` with source "AMB default; confirm" (Q8).

### 5.4 The ladder (`Adj. EBITDA`) (row labels verbatim)

```
Net Income
Definitional Adjustments                      (section row)
  (+) Interest Expense                  [D1]
  (+) Income Taxes                      [D2]
  (+) Depreciation & Amortization       [D3]
Reported EBITDA                               (key total)
  % Margin
Normalization Adjustments                     (section row)
  (+) / (–) <each Accepted N row>       [N1]…
Total Normalization Adjustments               (subtotal)
Owner Compensation                            (section row)
  (+) Owner Compensation                [S1]
Seller's Discretionary Earnings (SDE)         (key total)
  % Margin
  (–) Market Replacement Compensation   [S2]
  (–) Capital Reserve (Maintenance Capex) [S3]   (Main Street mode only)
Adj. EBITDA                                   (key total)
  % Margin
Pro Forma Adjustments                         (section row)
  (+) / (–) <each Accepted PF row>      [PF1]…
Total Pro Forma Adjustments                   (subtotal)
PF Adj. EBITDA                                (key total)
  % Margin
Memo: Other Considerations (not included above)
  <each M row>                          [M1]…
Check: Reported EBITDA less (Net Income + D1:D3)      (red italic, must equal zero)
Check: Adjustments schedule less ladder, by tier      (red italic, must equal zero)
```

- Column Q carries each row's `Basis` from the schedule (Keep: V51 rationale column; TPL definitions panel, as cells so it prints).
- Margin denominator: total revenue, or net revenue where pass-through revenue exists; stated in a note under the table (R-WU §11 rule 4).
- **Main Street mode** (PF Adj. EBITDA below $1.0M, an `Assumptions` input, Q7) shows the SDE rung in the CIM. In LMM mode the CIM collapses `[S1]` and `[S2]` into one line, "(+) Owner Compensation Normalization", and omits SDE. The model always computes both.
- SDE adds back one working owner's total compensation: salary, payroll taxes, benefits and expensed draws. Other owners' pay is normalized to market through N rows (Q7).
- **Capital Reserve `[S3]`** (Main Street mode. Keep the rung; Elevate its basis and placement: SUN `Laundromat Valuation` row 43 deducts `(-) Capital Reserve` linked to FY22 depreciation, $8,661, in all six columns, and places it above SDE so its SDE is post-capex, F6 §4.5). Placed **below SDE**, so SDE stays pre-capex (the IBBA definition SBA lenders underwrite; Q29). Default basis: three-year average equipment cost placed in service from Form 4562 Part I line 2 plus Part III Section B basis, excluding real property (Sunshine: $15.4K of washers in 2023, $23.4K of equipment in 2024), blue on `Assumptions` with Source "Form 4562, FY2022–FY2024"; without a 4562, the three-year average of D&A, flagged "proxy" in `open-questions.md`. In Main Street mode the CIM S7.3 bridge reads `Reported EBITDA → SDE → (–) Replacement Compensation → (–) Capital Reserve → Adj. EBITDA`.
- AMB's buy-side tiers map as: Adj. EBITDA (personal add-backs) ≈ Reported + N; Near-Term Adj. EBITDA ≈ PF Adj. EBITDA; Steady-State ≈ PF Adj. EBITDA + Memo items (D6; R-MOD §3.3).

### 5.5 Supporting analyses, valuation and offer structure

**Supporting analyses** (row structures, verbatim where AMB has them):

- **Customer Retention.** Count block: `Starting Count | (+) New Customers | (–) Lost Customers (split by reason where known) | Ending Count | Avg. Customers | New Customer Growth | Customer Churn` (churn = losses ÷ average customers). Dollar block: `Starting Revenue | (–) Churn | (–) Downsell | (+) Upsell | (+) New | Ending Revenue | Gross Dollar Retention | Net Dollar Retention`. Columns FY…, YTD, LTM; monthly strip on the right. Median banner over the history columns (Keep: V51 Client Retention; TPL adds GDR and NDR, which V51 lacks: R-MOD §9.4 item 22).
- **Concentration.** `Code | Revenue | % of Total | Cumulative % | Tenure (Yrs.) | Type`, then `Top 20 | (+) Remaining | Total` (Keep: V51 / PACK p16). Tenure is never negative (V51 shows −0.1 years for C-323: R-MOD §9.1).
- **Headcount.** `Department | Count | Total Comp | Avg. Comp | % of Revenue | Avg. Tenure`, load ratios (customers or jobs per employee), and the employee roll-forward (Keep: V51 Employee Overview, Employee Retention; WU Department Overview).
- **LTM strips** (Keep: V51 Revenue Analysis G:R, Expense Analysis H:S with hidden prior month G, Client Retention S:AD with hidden J:R; printed on PLO pp. 3, 5, 6; F8 §4). `Revenue Detail`, `Expense Detail` and `Customer Retention` carry a **12-month strip inside the print area**, to the right of the summary block after a 0.9 spacer: a **hidden 13th column** (the month before the LTM start, outline level 1, `AMB Hidden Prior`) so the first visible month's growth has a denominator, then twelve months at **6.7** on the revenue and expense tabs and 9.1 on the retention tabs (V51 hand-dragged twelve widths from 6.00 to 6.86; one width). Tier 1 (`AMB Header Group`, centre across selection): `LTM` over the two LTM columns, `PF`, then **`LTM Monthly Revenue`** / **`LTM Monthly Expenses`** / **`LTM Monthly Customers`** / **`LTM Monthly Revenue ($000s)`** over the twelve visible months (Keep: V51 "LTM Monthly Revenue", "LTM Monthly Expenses"). Tier 2 (`AMB Month Header`): hidden `=EOMONTH(AsOfDate,-12)+1`, then `=EOMONTH(<prev>,0)+1` (V51 links the first month to the grid's header cell, `='P&L Forecast'!AI5`; deriving from `AsOfDate` removes the column letter). Three stacked blocks per group, each opened by a section row spanning the block and the strip but not the spacer: `<Group> ($000s)` (lines indent 1, boxed total: `Total Recurring Revenue`, `Total Revenue`, `Total Payroll`, `Total Software`, `Total Overhead`), `<Group> % Total Revenue` (line ÷ Total Revenue, 0 dp), `<Group> % Growth` (y/y in the summary block, **m/m in the strip**, `n.a.` where there is no denominator, never V51's text `--`), closed by a boxed `<Group> Growth` row computed on the totals (never V51's `=SUM()` of rates). Every strip cell is `='Monthly P&L'!<cell>` (green); nothing is typed. Formats as the block: `$` on the first row and boxed totals, `#,##0`, en-dash zero, `(6%)`; the boxed total is drawn once per block and once across the strip, with the spacer white (Keep: V51). Print: one print range per group where a tab holds several (Keep: `Expense Analysis` `B2:S40, B42:S83`), **print titles rows 2:6** so each page opens with the title, subtitle and both header tiers (Keep: `Expense Analysis`); landscape, fit 1 wide; the hidden column does not print; the Print-toggle CF range is limited to the print area, not `A:XFD`. **Every strip ends at `AsOfDate`**: a dataset that runs later is truncated (its extra months stay in the Databook) and one that runs earlier is disclosed in the Summary ("Customer data to May-26") (Fix: V51's retention strip runs to Sep-26 while its P&L strips end Jul-26; Q33). Retention count-strip rows verbatim: `Starting Count | (+) Client Wins | (-) Regrettable Losses | (-) Non-Regrettable Losses | (-) Unclassified Losses | (-) Total Client Losses | Ending Count | Avg. Clients | New Client Growth | Client Churn` (Starting Count for month m = Ending Count for m−1), one block per segment with its own `FFE1E1` label row and a repeated tier-2 header (Keep: V51 rows 5, 20, 35, 50).
- **Real Estate** (conditional tab, 5.1 row 21a; replaces SUN's `Tennant View` [sic], `Market Rent Analysis` and `CRE P&L`, whose two competing NOI engines, `=+#REF!` cell, red unconfirmed inputs and typed $1,000,000 are the defects to avoid; F7 §2–4). Subtitle "Real Estate: Rent Roll, Market Rent and NOI ($)"; five blocks under `AMB Section` bars, standard anatomy, portrait, print area B2:K. (i) **Property**: `Address | GLA | Owner-occupied sq. ft. | Third-party leased sq. ft. | Occupancy | Year built | Manager | Arrangement offered`. (ii) **Rent roll** (from `Raw - Rent Roll`; the owner-occupied suite first, flagged `Related party`): `Suite | Tenant | Type (Third party / Related party) | Sq. ft. | Lease type (Gross / NNN) | Start | Expiry | Monthly rent | Annual rent | $ / sq. ft. | Annual NNN reimb. | Total annual rent | Source`; totals `Third-party suites` · `Related-party suite` · `Total` (key total); check `Rent roll sq. ft. less GLA` (SUN 8,400 vs CORSAIR 7,000). The in-place rent ties to the lease or owner statement (SUN carries $1,200 a month where the seller wrote $1,137.44). (iii) **Market rent comparables** (from `Raw - Rent Comps`): `Property | City | Size (sq. ft.) | Built | Type | Base rent ($/sq. ft.) | NNN ($/sq. ft.) | Total ($/sq. ft.) | In sample? | Source | Listed`; summary rows on `keyTotal` in one box `Average (n = ..)` · `Median` · `Subject property` (Keep: SUN's boxed Average and Target Property rows, $16.13 against $7.25 in place); `Market rent applied` `Low | Base | High` defaulting to `QUARTILE(sample,1)`, `MEDIAN`, `QUARTILE(sample,3)`, overridable in blue; `In sample?` = size band ±50% and same type; missing values `n.a.`, never SUN's typed "-"; the listing URL is a cell value on the raw tab, not a hidden hyperlink (SUN hides 14 CityFeet, Showcase and LoopNet links in column N). (iv) **NOI bridge by scenario**, columns `In-Place | Market Low | Market Base | Market High` (fixed names; SUN's `FY25 / Clearing / NNN / Low-End / Base-Rate` drift, and "Clearing" is a Deal Structure concept), rows in the ladder idiom, order from CORSAIR: `Scheduled Base Rent | (+) NNN Reimbursements | Total Scheduled Rent | (–) Vacancy and Credit Loss (5.0% of scheduled rent) | Effective Gross Income | (–) Management Fee (% of EGI) | (–) Non-Reimbursed Insurance | (–) Entity-Level Legal and Accounting | (–) Real Estate Taxes, Insurance, CAM not recovered | Net Operating Income (key total) | % of Total Scheduled Rent | (–) Capital Reserves ($/sq. ft. × GLA) | (–) TI and Leasing Commissions ($/sq. ft. × third-party sq. ft.) | Cash Flow Before Debt Service (key total) | Per sq. ft. (NOI)`. The Market columns replace only the related-party suite's rent with `Market rate × owner-occupied sq. ft.`; third-party rents stay at contract. The related-party suite is in NOI only when the property is offered with the business as a leased asset; when the operating company would own the building, `Valuation` capitalises third-party NOI only (CORSAIR's rule: "Do not sum these onto one blended NOI and apply a single cap rate"). (v) **Rent-to-market output**, three lines `Adjustments` reads: `In-place rent, owner-occupied suite` · `Market rent applied (Base)` · `Pro forma rent adjustment`. `Adjustments` receives one row: Tier `Pro forma`, Category `Related-party (rent to market)`, Adjustment "Occupancy cost at market rent", Basis in the 5.3 grammar ("Replaces the $14,400 paid in FY2025 to the shareholder's plaza entity with $28,000 (2,800 sq. ft. at $10.00 NNN, the base rate applied on the Real Estate tab against a $16.13 average of 14 listings, 800–7,800 sq. ft., Pensacola–Milton)."), Source "Owner statement FY2025; CityFeet and LoopNet listings, accessed <date>", P&L line `Rent`, PF method "Contracted" once a lease is signed, otherwise "Market rate". This replaces SUN's `Go-Forward Lease =E20*2` (rent doubled by judgement while its comps-derived `Normalized Lease` sat unused). **`Assumptions` "Real estate" block** (blue, each with `Source`): `Premises arrangement` (`Leased from third party` / `Owned by seller, offered for lease` / `Owned by seller, offered for sale` / `Owned by operating company`) · `Property address` · `GLA (sq. ft.)` · `Owner-occupied sq. ft.` · `Year built` · `In-place rent, owner-occupied suite ($/yr)` · `Market rent Low / Base / High ($/sq. ft.)` · `NNN charges ($/sq. ft.)` · `Vacancy and credit loss (% of scheduled rent)` 5.0% · `Management fee (% of EGI)` = the actual rate from the owner statement (OS25: $6,059 on $60,585, 10.0%), else 6.0%, never zero even if owner-managed (SUN shows "–" with the note "Taken from current property manager") · `Capital reserves ($/sq. ft./yr)` 0.20 · `TI / leasing commissions ($/sq. ft./yr)` 0.15 (both `[$$]#,##0.00`, labelled "$ / sq. ft. / yr"; SUN and CORSAIR format them `0.0%` and caption them "% of leasable sq. ft." while multiplying as dollars) · `Non-reimbursed insurance ($/yr)` · `Entity-level legal and accounting ($/yr)` · `Cap rate Low / Mid / High` ("Appraisal pending; broker opinion") · `Property loan: LTV, term, rate` (worked example "Lender quote: ServisFirst 6.50%, 85% LTV, 20 years") · `Clearance threshold ($000s)` (optional). CORSAIR's rationale strings go in `Source` (vacancy "Applied against gross rent even at full current occupancy, per typical lender underwriting convention"; management fee "Standard market range 4%–8%; typically NOT reimbursable by tenants even under a NNN structure"; reserves "Roof, HVAC, parking lot resurfacing") (Q32). Named outputs in 5.14.
- **Ranges are dynamic.** Every COUNTIFS and SUMIFS over a list uses whole columns or a structured table, never `$B$4:$B$310` (V51 truncates silently when the list grows: R-MOD §9.1 item 6).

**Valuation** (internal; never in the CIM, D5)

- Method by mode. Main Street: SDE × multiple. LMM: Adj. EBITDA × multiple. Services businesses add a revenue-multiple cross-check (Keep: V51 "Total Valuation is calculated as 1.0x run-rate July'26 recurring revenue", cross-checked to 7.0x EBITDA; SUN laundromat at SDE × 3.0x).
- Inputs: Low / Mid / High multiples, blue, each with a `Source`. For accounting firms the ACQ string must say what the file holds: its `multiple` column is **asking price ÷ revenue on broker listings with status "sold"**, not closed transaction prices, so the source reads "ACQ: median asking price ÷ revenue 1.14x, n = 3,825 listings marked sold (asking multiples, not closed prices)"; otherwise the comps source Frank licenses (Q15).
- Output table: `EV (Low / Mid / High) | x Reported EBITDA | x Adj. EBITDA | x PF Adj. EBITDA | x SDE | x LTM Revenue` (Keep: CPM S&U "x LOI EBITDA | x Adj. EBITDA | x PF EBITDA").
- EV-to-equity bridge: `Enterprise Value | (–) Funded Debt | (–) Debt-Like Items | (+) Cash (if delivered) | (±) NWC Delivered vs. Peg | Equity Value to Seller`.
- When ACQ applies (accounting and bookkeeping practices), a comps block shows median, IQR and n by size band, computed live from a `Raw - Comps` tab. ACQ is never linked externally.
- **Main Street valuation rows** (Keep: SUN `Laundromat Valuation` rows 55–62, with the person-named rows "Randy's Valuation" and "Monica's Compensation" dropped; F6 §5.3), one column per scenario `Low | Mid | High`: `SDE | (x) Valuation Multiple (0.0x, blue on Assumptions, linked here) | Business Valuation (thin top border) | (+) Deferred Capex / Renovation (from the scenario block) | Total Investment (key total; =ROUND(…,-1) on this row only, Keep: SUN) | Implied SDE Multiple (0.0x, Total Investment ÷ SDE) | Implied Adj. EBITDA Multiple (0.0x)`.
- **Scenario block on `Assumptions`** (`Driver | Low | Mid | High | Basis | Source`, blue): `Revenue growth (%)`; per expense line a PF method from the fixed list `3-year average` / `Latest year` / `% of sales, 3-year blended` / `Contracted` / `Market rent per comps` / `Owner replacement salary` / `Input`; `Owner replacement salary`; `Capital reserve`; `Deferred capex / renovation ($)`; `Equity injection (%)`; `Loan term (years)`; `Interest rate (%)`; `Valuation multiple (x SDE)`. Mid is the base case; **Low and High must each differ from Mid on revenue growth and at least one operating driver** (`verifyWorkbook` fails otherwise: SUN's three columns reference an empty cell and are one scenario differing only by renovation cost, F6 §4.2). SUN's PF methods, as built and worth keeping as the pattern: utilities at the 3-year blended % of sales, repairs and other at the 3-year average, insurance latest year (F6 §3.3).
- **Main Street financing rows**, below the valuation under an `AMB Subsection` "Financing" (Keep: SUN's `-PMT()` financing with equity injection %, term and rate as inputs. Elevate: SUN's DSCR is `SDE ÷ full P&I` with **no** replacement salary or capital reserve deducted, `=F$50/F41`, giving 1.52x / 1.28x / 1.11x, and its PF bridge adds back full P&I as "Debt Servicing", F6 §4.3): `Purchase Price (= Total Investment) | (–) Equity Injection (% input; SBA 7(a) minimum 10%, SUN 15%) | Loan Principal (=MAX(0, …) with a check: SUN's Low case produced a negative loan) | Term (Years) (format 0) | Interest Rate (0.00%) | Annual Debt Service (=-PMT(rate/12, term*12, principal)*12, currency) | Cash Flow Available for Debt Service (= SDE − Market Replacement Compensation − Capital Reserve) | DSCR (0.00x, key total; "< 1.25x" flagged in the Basis column, never coloured)`. A second loan (renovation) repeats the block and `Annual Debt Service` sums. The interest add-back stays in the ladder; P&I never enters EBITDA.
- **Real estate (when `Real Estate` is built; F7 §4.5).** Capitalisation table, columns `Low | Mid | High` (cap rates from `Assumptions`), rows `NOI (Market Base) | (/) Cap Rate | Property Value (key total) | Per sq. ft. | Implied cap rate on prior transaction` (NOI ÷ last recorded price, with its date; Keep: SUN "(/) Prior Transaction Value $580,000 → Implied Cap Rate"); a `Basis` column names the appraisal status ("Subject to appraisal value" until one exists; Keep: SUNPA). **Consolidated valuation** (Keep: SUN `Valuation Overview` and `CRE Valuation` "Consolidated Valuation": `Commercial Real Estate $450 | (+) Signed Leases 150 | Estimated CRE Valuation $600 | (+) Laundromat Valuation | Total Valuation`): columns the business cases `Low | Mid | High`; rows `Business (SDE × multiple) | (+) Real Estate (NOI ÷ cap rate) | Total Value (key total) | (–) Property Mortgage | (–) Business Funded Debt and Debt-Like Items | Equity Value to Seller`; when the property is not offered the real-estate rows show `n.a.` on `naFill`; no `(-) Asking Price` / `Delta` rows unless Frank enters an asking price (a buy-side habit). **Rule:** PF Adj. EBITDA already carries market rent, so the property is capitalised on its own NOI and the two values are added; a blended NOI × single cap rate is never used (CORSAIR). Property value is never typed into the consolidation (SUN types $450 and $600).

**Deal Structure: every structure is a column, not a copy** (D14. Elevate: V51 carries four disagreeing partnership models, R-MOD §9.2 item 10; VAL's `Partnership Analysis` and `100% Buyout Analysis` are two ~200-row copies of one engine whose labels ("Scenario 2 — Ben Rolls 30% of Keystone Equity" against "Scenario 2 — Ben Accepts the Topkey Offer"), formats, downside sets and netting basis (202% against 201%) have drifted apart, and BL could not model a third structure: "Not modeled"; F4 §4)

- **Columns.** `Deal Structure` holds one column per structure or LOI (at most 5; `Structure 1` is the **Reference**: AMB's recommended structure, or the leading LOI). Each column has its own `StructurePreset` and its own blue inputs. **Shared assumptions** (horizon, discount rate, probability of achievement, growth, exit multiple, buyer pre-deal valuation) are typed once in the Reference column and linked in the others with `=C7` (purple), with the note "Input — drives all structures (D = C)" (Keep: VAL). Every formula is the same in every column; `engine.ts` runs `computeStructure()` once per column and `verifyWorkbook` checks each. No per-structure tabs. Any label carrying the horizon, the earnout year or a percentage is a formula (Keep: VAL `="Topkey "&$C$7&"-Year Valuation Growth (ex-Keystone)"`; Fix: 31 of VAL's comparison labels hard-code "Year 5").
- **Presets** (`StructurePreset` on `Assumptions`): `Traditional` (default: cash + seller note), `Cash + earnout`, `Stock consideration` (buyer shares; turns on the tax flag below), `All cash`. A preset only fills defaults; every cell stays a blue input with a `Source` note. Deal-form inputs from 5.6: `DealForm`, `True-up settlement`, `Reconciliation holdback` (months of payroll, default 1.0 for an asset purchase and 0 for an equity purchase), `Stock consideration intended tax-deferred?` (Y/N).
- **Defaults from AMB precedent** (F2 §8.1; Q16 confirms the remainder):

| Input | Default | Notes column text (printed) | Source |
|---|---|---|---|
| Purchase price | Valuation Mid (link) | "Total Valuation: $X (n.nx [basis])" | OFF14 row 1 "Total Valuation \| $3,000,000 (1.0x run-rate recurring revenue)"; OUTL |
| Cash at close | **80%** of price (`Stock consideration` preset: 17–31%, sized by "three times take-home", PB06) | "$X (80% of valuation)" | MISC "Typical accounting deals are structured 70% to 80% cash up front"; ICP5 "$21M (80% of valuation)"; WU 80–85%. Keystone's 17% exists only because 83% of the price was buyer stock |
| Seller note | **20%** of price, **18-month** term, **9.0%**, interest and principal paid **quarterly**, subordinated to senior debt only | "$X, 18-month term, quarterly payments, 9.0% interest (20% of valuation)" | ICP5; BENP "subordinated to senior debt only". TCC buy-side used 15–20%, 18 months to 3 years, 6.5% (WU); note it as the low case |
| Seller-note contingency | Off. When on: $ reduction if named customers terminate | "$X reduction in seller note if [C-003, C-007, C-012] terminate service" | ICP5 "Seller Note Contingencies" |
| Earnout | **None** | "Earnout (if applicable): None" | ICP5; OR3 §6 "Removing the earnout is the right call"; BL §7 |
| Earnout (when on), revenue form | Measurement Year 3; run-rate = average of the last 3 months × 12; threshold 80% of target pays 50%; linear to 100% at target; cap 150% of target earnout, **reached at 120% of target revenue** (state the slope: RECS's drafted clause puts the maximum "at 150% of target", which VAL's formula does not do; Q36); payable within 90 days after the third anniversary; probability 70% and discount 15% for the memo PV only | VAL F-column notes, verbatim: "Payout capped at 150% of target earnout, reached at 120% of target revenue" | VAL `100% Buyout Analysis` rows 42–58; RECS §4 #2 |
| Earnout (when on), EBITDA form | Pays (headline multiple + up to 1.0x) × EBITDA above a hurdle of 10% annual growth on PF Adj. EBITDA | "FY[yyyy] earnout paying 8.0x any incremental EBITDA above $X (10% hurdle)" | WU HOACS, CPM (TCC lineage) |
| Indemnity escrow | **10% of cash at close**, funded at closing, held **15 months**; derived line `Escrow % of price`, info flag below 5% | "An escrow of 10% of the cash consideration ($X) will be funded at closing and held for 15 months." | LOI12 §7(h); CHK POST-27; TAX "Market is 5-10% for 12-18 months" |
| Indemnity package (text inputs) | Cap 10% of price; deductible 0.75% of price; general survival 15 months; fundamental and tax reps to 60 days after the statute of limitations, capped at price; claims from escrow first, then set-off against the seller note (or buyer shares) | LOI12 wording | LOI12; RECS #9; BENP |
| Retention holdback | **0** (off). When on: 18 months; against customer and employee retention; size = LTM revenue of the top 10–20 customers (or the price increment it buys); revenue-based test (TTM at the test date) against a named, coded customer schedule; carve-outs for buyer-caused losses; one tranche at 18 months, option 50% at 12 and 50% at 24. Kept separate from the indemnity escrow and the reconciliation holdback | "18-month holdback against customer and employee retention" | KON; PB06; MISC; OPP3; TAX "Don't collapse it into the retention holdback" |
| Reconciliation holdback (asset purchase) | One month of LTM payroll; zero only with a note | "One month of payroll as reconciliation holdback" | ICP5; CORAL "One month of management fees"; SUNPA (none, flagged as a risk) |
| Exclusivity | 90 days + one automatic 30-day extension | | LOI12 Agreement §1 |
| Target timing | `LOIDate`; `SigningDate` = LOI + 9–11 weeks; `EffectiveDate` = signing + 0–15 days, the first business day of the next tax year when signing falls within 30 days of year-end ("The parties intend the transaction to be effective in the 2027 tax year.", RECS #8); `ExclusivityDays` 90 | "Sign closing documents [date]; effective closing date [date]" | OUTL "(11 week process)"; LOI12 §10; OFF14 "Target Timing"; CHK |
| Buyer transaction fees (Uses) | Blue input, no default; reference range in the note | "Buyer one-time costs on a $3.0M deal: ~$110–300K (BL)" | BL §4.1 |
| SBA 7(a) terms; AMB success fee | Blank, flagged | | No file in the library gives either (Q16) |

- **Structure summary block** (top of `Deal Structure`, internal): the OFF14 two-column term table with labels `Total Valuation | Cash at Close | Seller Note | Seller Note Contingencies | Earnout (if applicable) | Escrow | Retention Holdback | Balance Sheet | Working Capital | Asset vs. Stock Sale | Target Timing`. Every value is a formula-built string in the `$X (y% of valuation)` pattern (Keep: OFF14, OUTL, ICP5); escrow is `=EscrowPct*CashAtClose`, never typed (VAL and the LOIs drifted between $50,000 and $65,000). Label cells `tint`. A term string may never be empty: the check refuses "[X]" (LOI v10 shipped "[X] months").
- **Tax flag** (New; F1 §5.2): when `Stock consideration intended tax-deferred?` is Y, compute `Non-stock consideration % = (cash at close + cash escrow + seller note + cash earnout + cash true-up cap) ÷ total consideration` and show one red-text note: "Stock-for-stock structure: cash elements are x% of consideration (reverse triangular merger limit 20%; forward merger continuity of interest ~40% stock). A cash working-capital true-up and a seller note count as boot. Confirm with tax counsel." [TAX; FTM]. A flag only; never after-tax proceeds (Q22).
- **Earnout payout** (Keep: VAL formula): `=IF(Actual<Threshold,0,MIN(Cap,PayoutAtThreshold+(1−PayoutAtThreshold)×(Actual−Threshold)/(1−Threshold)))` on actual ÷ target.
- **Sources & Uses** (Keep: CORAL two-panel; CPM multiples): Uses `Purchase Price (EV) | Transaction Fees | Working Capital Funding | Reconciliation Holdback (funded to escrow; asset purchase) | Total Uses`; Sources `Senior / SBA Loan | Seller Note | Rollover Equity | Buyer Equity | Total Sources`; columns `$ | % Total | x Adj. EBITDA | x PF Adj. EBITDA | x SDE`; key totals with thin top and double bottom borders on `FFFFCC`; a red `Check: Sources less Uses` row.
- **Seller proceeds, equity purchase** (Keep: CORAL Proceeds, with its italic Notes column): `Purchase Price (EV) | (–) Funded Debt Repaid at Close | (–) Debt-Like Items | (±) NWC Delivered vs. Peg | Equity Purchase Price | (–) Transaction Expenses | (–) Indemnity Escrow | (–) Seller Note (deferred) | Closing Cash to Seller | (+) Seller Note Principal | (+) Expected Earnout | Total Consideration`, and memo `Excess cash distributed before close`.
- **Seller proceeds, asset purchase**: `Purchase Price | (–) Liens and Secured Debt Paid at Close | (–) Reconciliation Holdback | (–) Transaction Expenses | (–) Seller Note (deferred) | Closing Cash to Seller | (+) Holdback Released (expected) | (+) Seller Note Principal | Total Consideration`, memo `Seller-retained cash and NWC (AR + unbilled − AP − accrued)`, and a `Purchase Price Allocation (Form 8594)` block `Land | Building | FF&E / Equipment | Inventory | Goodwill | Non-Compete | Total` (blue, internal, never in the CIM [SUNTAX]). The Notes column says "One month of payroll" beside the holdback (Keep: CORAL). When the premises transfer, `(–) Property Mortgage Payoff` joins the waterfall (F7). After-tax proceeds only on Frank's instruction (Q22), with OPP3's tax disclaimer.
- **Buyer debt service**: annual debt service (`-PMT()`), **DSCR** = (PF Adj. EBITDA − maintenance capex) ÷ debt service; Main Street DSCR = (SDE − market replacement compensation − capital reserve) ÷ debt service (Elevate: SUN's DSCR is SDE ÷ full P&I with nothing deducted, F6 §0; the earlier "Keep: SUN" tag was wrong). DSCR below 1.25x is flagged, not coloured.
- **Timing checks** (C36): `EffectiveDate <= LOIDate + ExclusivityDays` (CHK: "Closing must occur first"); `EffectiveDate` is a business day, else the info flag "effective date falls on a weekend: confirm effective time with tax counsel; wires next business day" (CHK POST-32: "Jan 2, 2027 is a Saturday").

**`Offer Comparison`** (Keep: VAL / V51 `Offer Comparison`, subtitle "Offer Comparison — Partnership vs. 100% Buyout ($000s)", columns `Partnership | 100% Buyout | Variance`, printed as OSO pp. 2–4; F4 §5). Built when two or more structure columns exist.

- **Layout.** Subtitle: N = 2 "Offer Comparison — `<S1>` vs. `<S2>` ($000s)" (Keep verbatim pattern); N ≥ 3 "Offer Comparison — `<n>` Offers vs. `<Reference>` ($000s)". Columns: A 1.7 · B **48** labels · one column per structure at **12.3** (short names ≤ 14 characters, right-aligned: "Partnership", "100% Buyout", "Harbor Cap.") · spacer 0.9 · Variance column(s) **10.0**, centred · spacer 0.9 · Notes **60** (italic, screen-only, outside the print area; Keep: VAL G) · grey `808080` IRR helper strips further right ("Helper: Year" 0…H; one buyer row, one seller row and one hurdle row per structure; Keep: VAL K48:Q53, K79:Q81). N = 2: one Variance column. N ≥ 3: a two-tier header, tier 1 "Offers" over the structures and "Variance vs. `<Reference>`" over N − 1 variance columns. The block header (`7B0000`, white bold, B = block name, structures right-aligned, Variance centred) repeats on every block (Keep: VAL, 12 repeats); section rows `FFE1E1`; spacer 2.1 under the first header of each print range and 3.95 between blocks (Keep: VAL row heights). The 3–6 notes a reader needs (why cash differs, the earnout terms, what "break-even" means) print as numbered footnotes under the block, built from the same `ROW()` / `ADDRESS()` / `TEXT()` formulas (Keep: VAL's formula-built notes, e.g. `="Partnership cash of "&TEXT(C33,"$#,##0")&"K"&" is set to cover Ben's tax situation"`; Fix: VAL's notes never print, since column G sits outside every print range, so OSO shows 355 pt of table on a 612 pt page with no explanation).
- **Variance rule.** Variance = Reference − Other, the same way throughout the tab (Keep: VAL `=C7-D7`), stated in a printed note under the first header ("Variance = Partnership less 100% Buyout"). Unit follows the row: $ rows in `$` / `#`; multiples `0.00x`; **rates and shares in percentage points**, formula `=(C55-D55)*100`, format `#,##0.0" pts";\(#,##0.0" pts"\);"–"` (VAL prints 1.8% for a 1.8-point IRR difference); text rows and tie-outs blank; `n.m.` where a difference means nothing (VAL "n/m"). Ratios are differenced, not recomputed. Shared assumptions show "–", the proof of like-for-like (Keep: VAL "D = C"). The optional Incremental block ("Partnership Upside Analysis") is the one exception (Other − Reference); its formula-built headers say so (`="First "&TEXT(C31,"0%")&" (Partnership)"`, `="Extra "&TEXT(D31-C31,"0%")`), and it is used only when two columns differ by stake size alone.
- **Row blocks** (labels verbatim from VAL, tokenised: `<Seller>` = the owner's first name as AMB writes it, `<Buyer>`, `<Target>`, N = earnout year, H = horizon). Sell-side order (page 1 = 1–5, page 2 = 6–9, page 3 = 10): **1 Offer Structure** (`<Target>` Value Today (100%) · `<Seller>`'s Rollover % — `<Target>` · `<Target>` Stake Acquired by `<Buyer>` · Price for `<Buyer>`'s Stake (at Close) · Cash at Close · (+) Seller Note — Principal · (+) `<Buyer>` Equity Issued to `<Seller>` · (+) `<Seller>`'s Rolled `<Target>` Equity · **Total Offer Value — at Close** · (+) Cash Earnout — Year N (Contingent) · **Total Consideration incl. Earnout** · Total Consideration Paid by `<Buyer>` (excludes rolled equity) · Tie Out — Consideration vs. Deal Structure · % of Consideration in Cash (incl. Earnout) · Sale Multiple (x Revenue) · Sale Multiple (x PF Adj. EBITDA), (x SDE) in Main Street mode; no share above 100%: VAL's buyout "% of Total" reached 116.7%) · **2 Risk-Adjusted Value to `<Seller>`** (New; brings VAL's buried "Risk-Weighted Earnout — PV at Close (Memo)", $230 against a $500 headline, onto the page: Cash at Close · (+) Seller Note — PV at Close · (+) Risk-Weighted Earnout — PV at Close · (+) `<Buyer>` Equity Issued to `<Seller>` (at Issue Price) · (+) `<Seller>`'s Rolled `<Target>` Equity · **Risk-Adjusted Value to `<Seller>`** · ***Risk-Adjusted ÷ Headline*** · Of which: Escrow / Holdback · Illiquid Share of `<Seller>`'s Value) · **3 Key Terms** (New; text rows, values left-aligned, wrap to 3 lines, Variance blank; labels are the OFF14 term set; each value a formula-built string such as "$650K (31% of the price for the 70%); 10% escrow = $65K", Keep: OSC table 0) · **4 Where `<Seller>`'s Year H Value Comes From** (Keep: VAL rows 40–46, `%0`, the whole block in one `FFFFCC` box, regular weight, plus a bold **Total** row VAL lacks; zero rows dropped) · **5 Return Profile — `<Seller>`** (Keep: VAL rows 79–89: **`<Target>` Value Contributed by `<Seller>` (Year 0)** · Cash at Close (Year 0) · (+) Seller Note — Principal and Interest · (+) Target Cash Earnout (at 100% Achievement) (Year N) · (+) Retained `<Target>` Stake — Year H · (+) `<Buyer>` Equity — Year H · **Total Value Received by `<Seller>`** · **Total MOIC** · ***Total IRR*** · (-) `<Seller>`'s Year H Value — Standalone · **Net Value Created for `<Seller>`**) · **6 `<Seller>` — Offer vs. Standalone (Year H)** (Keep: VAL rows 91–102; "IRR Delta — Offer vs. Standalone" becomes bold italic per the rate rule) · **7 Return Profile — `<Buyer>`** (Keep: VAL rows 48–64, shown when any column pays in buyer stock or leaves a rollover: Cash at Close (Year 0) · (+) Equity Issued to `<Seller>` (Year 0) · (+) Target Cash Earnout (at 100% Achievement) (Year N) · **Total Invested by `<Buyer>`** · `<Buyer>`'s `<Target>` Stake — Year H Value · **Deal MOIC** · ***Deal IRR*** · (-) Hurdle MOIC — Break-Even · (-) Hurdle IRR — Break-Even · **Excess MOIC over Hurdle** · ***Excess IRR over Hurdle (% pts)*** · `<Buyer>`'s Year H Value — With Deal · (-) `<Buyer>`'s Year H Value — Without Deal · **Net Value Created for `<Buyer>`** · **All-In MOIC** · ***All-In IRR***) or **7b Buyer Capacity** (New, for cash, SBA or note-funded bids: Senior / SBA Loan · Seller Note · Buyer Equity · **Total Sources** · Annual Debt Service (Year 1) · **DSCR (Year 1)** · Total Debt ÷ PF Adj. EBITDA · Buyer Equity ÷ Total Sources · Financing Contingency) · **8 Break-even and cushion** (Keep: VAL rows 113–143, `<Seller>`'s / `<Buyer>`'s "Break-Even — Downside Threshold" and "Break-Even Cushion — Base Case vs. Break-Even", each cushion unit in the label "— Cushion ($)", "(x)", "(#)", "(% pts)"; a solve outside the feasible domain returns `n.m.` with the note "No break-even within the feasible range": V51 printed −18.5% dilution and −5.6 client wins) · **9 Ownership %** (when any column pays in buyer stock) · **10 Deal Assumptions** (Keep: VAL rows 5–26: shared rows first, blue in the Reference column and purple elsewhere, then `FFE1E1` sub-sections General Assumptions · `<Target>` Standalone Assumptions · Structure-Specific Assumptions; buyer-provided figures pending confirmation stay red `FF0000` with the note "red = pending seller confirmation", Keep: VAL C18–C20). Buy-side order (AMB's Keystone order): 10, 1, 4, 7, 5, 6, 8, 9. One label per concept (VAL writes the earnout line three ways).
- **Return Profile boxes** (Keep: VAL, checked at 200 dpi on OSO p2): each key result sits in a two- or three-row `FFFFCC` group inside one thin black box. **In a yellow key box, $ and x rows are bold roman and every rate is bold italic** (Deal MOIC bold `0.00x` over Deal IRR bold italic `0.0%`; the same pairing for Excess MOIC / IRR over Hurdle, All-In MOIC / IRR, Total MOIC / IRR, Offer Less Standalone ($) / (%)). `AMB Key Total` covers the $ and x rows, `AMB Key Rate` the rates. Hurdle rows between boxes are roman with "(-)" and indent 1, so the eye reads result → hurdle → excess. MOIC is **`0.00x` everywhere** (VAL prints 4.7x on the analysis tabs and 4.66x on the comparison). All-In IRR is `MOIC^(1/H) − 1` and Deal IRR a cash-flow `IRR()`; the note says which (VAL mixes the two in one block without saying).
- **Print.** Print toggle in row 3; print ranges of ≤ 50 rows, one per page; portrait when N ≤ 3, landscape when N ≥ 4; fit to 1 page wide; **scale ≥ 90%** (QA fails below: OSO printed at 76%, so its Arial 9 came out at 6.84 pt, under the 7 pt floor); freeze C7 when N ≥ 4. The tie-out CF (`ROUND(C37,0)<>0` → red) keeps a **higher priority than the Print-mode CF**, so a failed tie-out prints red even in Print mode (Keep: VAL priorities 3 and 4). No stale constant blocks (VAL rows 151–162 hold blue values copied from V51 v49 under a CF that points at the wrong toggle cell).

**Sensitivities: grid anatomy** (Keep: V51 `Partnership Sensitivity Tables`, AMB's most developed grid, 30 grids printed as OSO pp. 10–14; F5 §5). Two-way grids as explicit formulas, never Excel data tables (`verifyWorkbook` must evaluate them). Axes centred on the base case with midpoint and step inputs in a settings block, and deduplicated axes (Keep: V51 settings block; between v46 and v51 AMB itself moved from round axis values to axes centred on the model's base case, "center column equals the base case exactly"; fix CPM's duplicate axis values: R-TPL §8 item 2).

- **Grid block = 13 rows, 11 columns B:L; every grid 9 × 7 with the base case at column H, body row 4.** Rows, with heights: grid title (15; Arial 9 **Bold, single underline**, black, left in B; pattern "<Measure> Based on <Column axis> & <Row axis>", e.g. "Ben's Net Returns Based on Topkey Growth & Rollover %") → spacer **2.1** → axis-title band (**12.75**; the column-axis name with units in parentheses, "Topkey ex-Keystone Value Growth (%)", `AMB Header`: Arial 9 Bold white on `7B0000`, centre-across-selection D:L, B:C also filled) → column-axis values (**12.75**; white bold on `7B0000`, centred, `D = E − step` … `H = midpoint` … `L = K + step`, in the axis variable's format) → 7 body rows (B merged as the row-axis label, Arial 9 Bold white on `7B0000`, wrapped, centre/centre, **rotation 0**; C the row-axis values, white bold on `7B0000`; D:L results, Arial 9 black, no fill; a thin black bottom border B:L closes the grid) → italic note (15; one sentence defining the measure and naming the settings cell, `AMB Note`: "Ben's Year 5 total value ÷ Keystone value today (G430), less 1") → spacer **3.95**. V51's `7B0000` renders as `7A0000` in OSO (Distiller rounding). SUN's rotated-90 label and `DDEBF7` axis cells are the retired Excel palette (F7 proposed keeping that blue for the real-estate grids; one grid grammar wins).
- **Widths:** A 1.71, B 9.0, C:L 8.71, M 3.14, N 16.86 "Print", O 18.14 toggle. If an axis needs more than 9 values, split into two grids; no 13-column landscape grids.
- **Section bar** above each group of grids (one per measure family): `AMB Section` on `FFE1E1`, Arial 9 Bold black, B:L, or `7B0000` white bold (`AMB Header Group`) for a first-tier bar. Replaces V51's navy `203764` (accent5 −50%) and light-blue `B4C6E7` (accent5 +60%) bars, the only theme colours on that tab, and SUN's `D9D9D9` bar; the "— Less Standalone" second tier becomes the same `FFE1E1` bar with the suffix in the text.
- **One number format per grid, named in the title.** "… Net Returns …": `$` on the first row only, `ROUND(helper, RoundingDigits)` with `RoundingDigits` an input (−2 at $000s, "$ tables shown to nearest $100K"); "… % Return …": `#,##0%`; "… IRR …": `#,##0.0%`; multiples `0.0x` on axes, `0.00x` for MOIC bodies. Axis cells take the axis variable's format (rollover and growth `#,##0%`, client wins `#,##0`, revenue multiple `0.00x`).
- **Base cell:** bold figure, 1 pt `7B0000` box, no fill (New: V51's partnership grids carry no marker, so the reader counts; the Earnings tab uses pure yellow `FFFF00` + bold + thin box, the banned yellow-input look).
- **Heat map:** keep V51's band-index mechanism (`Gradient Bands (#)` input, `Hurdle` input, `Band Width = (MAX(block) − Hurdle) / Bands`, expression rules `idx = 1 … n`, every grid in a group shaded by the `$` grid's index), but shade only the `$` grid of a group; `%` and IRR grids stay unshaded (V51 shows the same pattern three times). Fills use the 2.6 ordinal ramp, not the Excel green `63BE7B`–`E6F4EA`. Cells below the hurdle stay white.
- **Frontier** (Elevate: SUN's hand-drawn `FF0000` boxes and hand-filled `E2EFDA` cells do not move with the inputs): where a threshold is meaningful (DSCR ≥ 1.25x, proceeds ≥ asking, value ≥ $1M), one CF rule `idx >= 1` applies a 1 pt `7B0000` border on the hurdle-clearing cells; legend under the grid as `AMB Note`: "Note: cells inside the box clear the <threshold> hurdle."
- **Settings block** at the foot of the tab under "Sensitivity Assumptions | Value | Rationale" on `FFE1E1` (Keep: V51 rows 429–467, labels verbatim): "<Axis> — Midpoint" (purple link to the base case), "<Axis> — Step" (blue, rationale "Per AMB; <low>–<high> range"), "Rounding — $ Tables (Digits)", "Gradient Bands (#)", "Hurdle", "Band Width", and a "Tie Out — <grid>" row per group (`=ROUND(centre − model, 6)`, "Must equal zero") feeding `MasterCheck` (C30). Body cells never compute in place: unrounded results sit in a grey `808080` helper block right of the print area (Z onward, "Helper: Unrounded <measure>"), the band index further right (Keep: V51 Z:AH, AT:BB).
- **Print:** portrait; **4 grids per page** (two groups of two, or one group of three plus its note strip) so the fit-to-width scale stays ≥ 80% and body text prints ≥ 7 pt (V51's six per page print at 6.2 pt); one print range per page, print titles rows 2:4, margins and footer per 5.11; "Print" toggle at O3 with CF `$O$3=1` over body, axis and note ranges. Landscape only when a grid is paired side by side with its chart.
- **Standard grid set:** "Enterprise Value Based on EV / Adj. EBITDA Multiple & Adj. EBITDA"; "DSCR (SBA Loan Only) Based on Purchase Price & Interest Rate" (the grid finances the price with the SBA loan alone, so its title says so; the Reference structure's DSCR, seller note included, is flagged on `Deal Structure`, `Valuation` and `Summary`); "Closing Cash to Seller Based on Purchase Price & Cash at Close %". **Real-estate grids** (when `Real Estate` is built; Keep: SUN `Sensitivity Analysis` and `CRE Valuation`, printed as SUNPDF; F7 §4.6), in the same anatomy: "Property Value Based on Cap Rate & NOI" (`=$C9/D$8`; cap rate 7 columns step 0.5% centred on `CapMid`; NOI rows step $5K below $50K and $10K above); "Clearance NOI Based on Rent per Sq. Ft. & Non-Recoverable Cost" (`=D$23*RE_GLA/1000-$C24`; a `% Inc.` row above the rent axis, bold italic `#,##0%`; frontier CF at `ClearanceThreshold × CapMid`, legend "Note: cells inside the box clear the $<threshold> valuation at <cap>%"); "Cash Flow After Debt Service Based on Property Value & NOI" (`=$C55-D$54*LTV*DebtConstant`, `DebtConstant = -PMT(Rate/12,Term*12,1)*12`; note "Assumes <term>-year amortization at <rate>% and <LTV>% LTV", Keep: SUN "Assumes a 20-year amortization schedule with 6.50% interest rate"); "Cash-on-Cash Return Based on Property Value & NOI" (`=D55/(D$54*(1-LTV))`, `#,##0%`). Side inputs (`LTV`, `Term`, `Rate`, `Debt constant`, `Threshold`) sit in the settings block as green links to `Assumptions`.
- **QA:** typos in grid titles ("Partnerning", "Extimated", "threshhold" all reached AMB's prints) cannot occur, since every title is generated from the fixed patterns above; the render check (C37) catches a cut page.

### 5.6 Net working capital and debt-like items

**Deal form.** `DealForm` on `Assumptions` is `Equity purchase` or `Asset purchase`. It defaults from `MainStreetMode` (TRUE → Asset purchase), and the advisor may override it: ICP5 is a $26M asset sale, so deal size alone does not decide it. Everything below keys off it (D15; F1).

| | Equity purchase (LMM default) | Asset purchase (Main Street default) |
|---|---|---|
| Convention | **Keep:** "cash-free, debt-free basis, with a normalized level of working capital delivered at close" [LOI12 §1 "Structure of Purchase"; OFF14 "Valuation & Consideration" table, row label **"Balance Sheet"**]. The phrase is unchanged across 19 readable Keystone drafts (LOI v0–v8, v10, v12; Offer one-pagers v2, v3, v7–v10, v12, v14; Offer v4–v6 are corrupt zips) and survived the change from a 100% buyout to a 70/30 partnership. Every LOI's diligence list carries "Quality of earnings and normalized working capital" | **Keep:** assets bought free and clear; the Seller keeps cash, receivables and payables; "Ensure all outstanding liens are paid off prior to closing", "Ensure free and clear title", "Receive written mortgage payoff letter" [SUNPA]; "Are there any outstanding accounts payable or accrued liabilities as of closing that the buyer would be assuming?" tests for exceptions [SUNREQ] |
| Peg | **Keep:** the "trailing-twelve-month average" of month-end Adjusted NWC [RECS §5; OR3 term table row 13; OR2 row 12]. The LOI states only the principle; the peg mechanics belong in the purchase agreement and are raised verbally first ("Mention on the walk-through call so Ben is not surprised; mechanics in the purchase agreement") | None |
| Deferred revenue | **Keep:** "treated as an operating liability" inside NWC ("onboarding fees billed in advance, annual add-ons") [RECS §5; OR2 #12; OSC]. AMB advised the buyer and still took the seller-favourable treatment | Not assumed unless listed. If the Buyer assumes it, the Buyer is credited at close (New) |
| Debt and cash | Cash above normalized working capital is swept to the seller before close; "all existing indebtedness (including credit card balances and any revolving facility) will be repaid at or before closing" [LOI12 §1]; payoff letters and lien releases [FTM] | Liens and secured debt paid from proceeds at close with written payoff letters [SUNPA]; a tax clearance letter as a closing condition and the Form 8594 allocation locked into the PA [SUNTAX] |
| Protection | Post-closing true-up against the peg; the indemnity escrow is kept separate from any retention holdback ("Don't collapse it into the retention holdback", TAX; LOI12 §7(h)) | Reconciliation holdback, default one month of LTM payroll [ICP5 "Working Capital \| One month of payroll as reconciliation holdback"; ICP v3 "one month of revenue or payroll"; CORAL "One Month Mgmt. Fees" $201,897]; zero allowed only with a note (SUNPA's "Need to consider enforceable remedies without holdback" is a highlighted open issue, not a policy) |

**Tax warning on a true-up** (flagged, never computed; Q22). Whenever buyer or rollover stock is meant to be received tax-deferred: "A post-closing cash true-up flowing to the seller can be treated as additional boot. Structure it as an adjustment to the stock component, or cap total cash consideration, or handle it through an escrow that adjusts share counts." [FTM Phase 3]. A reverse triangular merger caps boot at 20%, and TAX asks for "a hard dollar cap … covering every cash element: escrow releases, working capital true-ups, expense reimbursement". It does not apply to an all-cash stock purchase or a Main Street asset sale, where the true-up simply adjusts the taxable price. The flag lives on `Deal Structure` (5.5).

**`NWC`** (Keep: AMB's convention and peg basis. Elevate: AMB states the peg in words only; no AMB or TCC workbook has an NWC schedule, a balance sheet or a debt-like schedule, R-TPL §4.6, R-MOD §9.4)

- Rows: `Accounts Receivable | Unbilled / WIP | Inventory | Prepaid & Other Current Assets | Total Current Assets (ex. Cash) | Accounts Payable | Accrued Liabilities | Deferred Revenue | Customer Deposits | Total Current Liabilities (ex. Debt) | Reported NWC | (–) / (+) Adjustments | Adjusted NWC | % of LTM Revenue | Deferred Revenue % of LTM Revenue | DSO | DIO | DPO`. Adjustments remove cash, funded debt and its current portion, credit-card and revolver balances ("repaid at or before closing", LOI12), shareholder and related-party balances, income taxes, accrued interest and transaction bonuses. Deferred revenue is a named line with its own ratio, so a buyer sees how much of the cash balance is customer money (RECS defines it only by example; OR2: its treatment "can swing Ben's pre-close cash by six figures").
- Columns: every month-end available, then `Peg (T12M avg.)`, `Latest`, `Latest vs. Peg`. With quarter-ends only: `Peg (T4Q avg.)` and a note. With year-ends only: no peg ("n.a. – monthly balance sheets required") and an info flag. The monthly series shows seasonality.
- `BooksBasis` input (Cash / Accrual). Keystone is "a cash-basis S corporation" [OR2] and most Main Street QuickBooks files carry no AR, AP or deferred revenue. On a cash basis, AR comes from the AR aging, AP from the AP aging and deferred revenue from the billing schedule; any line that cannot be built shows `n.a.` and a flag (AMB already asks: OR3 Q8 "Is Keystone on the cash or accrual method? What are receivables, unbilled work and prepaid/deferred revenue at month-end?").
- `DeferredRevenueTreatment` defaults to `NWC (operating liability)`. `Debt-like` is an override that requires a note. Customer deposits follow the same input (New, by analogy; AMB is silent).
- Asset purchase adds a `Transfers` column: AR, unbilled, prepaids, AP and accrued are `Retained by Seller`; inventory and customer deposits `Transfer` (Q17b); deferred revenue `Assumed only if listed`. The tab then shows a `Transferring NWC` subtotal and a memo `Seller-retained NWC (AR + unbilled − AP − accrued)`.
- `True-up settlement` input: Cash / Stock / Share-adjusting escrow. When the structure includes buyer or rollover stock meant to be tax-deferred, the default is Stock and `Deal Structure` shows the flag.
- Checks: every line ties to `Balance Sheet` (C08); C19, C20.
- Named outputs: `NWC_Peg`, `NWC_Latest`, `NWC_vsPeg`, `DefRev_Latest`.

**`Debt-Like Items`** (New)

- `Item | Balance at latest month-end | Treatment (Debt / Debt-like / NWC) | Source | Status (Confirmed / Estimated / Open) | Payoff letter (asset purchase: Received / Requested / n.a.)`.
- Standard list: funded bank debt, lines of credit and revolvers, credit-card balances [LOI12], SBA loans, PPP or EIDL balances [OR3 Q11], vehicle and equipment loans, capital leases, shareholder loans, accrued interest, unpaid bonuses and payroll taxes, accrued income taxes, tax liens [CORAL], deferred capex, aged payables over 90 days, related-party payables, known litigation, and personal guarantees (memo only). **Deferred revenue and customer deposits are not on this list.** They appear as a memo row "In NWC (AMB default)" unless `DeferredRevenueTreatment` is overridden; C19 fails if the same balance appears in both tabs.
- Asset purchase: each item is "Retained by Seller; paid from proceeds at close" [SUNPA]. A property mortgage appears here when the premises transfer (5.5).
- Totals feed the EV-to-equity bridge and the Seller proceeds waterfall.

**Wording to reuse as-is** in the `Deal Structure` summary block and any ICP term table: row label "Balance Sheet" → "Cash-free, debt-free, with a normalized level of working capital delivered at close" [OFF14]; "Working Capital" → "One month of payroll as reconciliation holdback" and "Asset vs. Stock Sale" → "Asset sale" [ICP5].

### 5.7 Checks

`Checks` lists every check with `ID | Check | Tab | Difference | Tolerance | Status`, status "OK" or "CHECK". The master status (`All checks OK` or `n checks failing`) shows on `Contents`. Tolerance is $1 ($0.001 in $000s) unless stated.

| ID | Check | Why (AMB defect it catches) |
|---|---|---|
| C01 | Databook ties to each raw export, every subtotal and period | Keep: V51 tie-out block |
| C02 | Monthly P&L category totals equal Databook, every month | |
| C03 | **Every period column equals the SUMIFS of the monthly grid for its window, every row, on every period tab** | V51's monthly "Total Adj. Revenue" adds the Income Tax row, and monthly near-term adjustments omit a row the summary includes (R-MOD §9.1) |
| C04 | P&L Summary Net Income equals Monthly P&L Net Income | Keep: V51 row 71 "Tie Out" |
| C05 | Reported EBITDA equals Net Income + D1:D3 | |
| C06 | Adjustments schedule totals by tier equal the ladder | |
| C07 | Balance sheet balances (A = L + E), every period | |
| C08 | NWC lines tie to the balance sheet | |
| C09 | Cash flow ending cash equals balance-sheet cash | |
| C10 | Projection balance sheet balances; projection cash ties | Bot's existing check |
| C11 | Sources equal Uses | Keep: CORAL Total = Total |
| C12 | Customer revenue total vs P&L revenue (flag if variance > 2%, with explanation) | Keep: V51 Client Overview "Tie Out" |
| C13 | Payroll register total vs P&L payroll (flag > 5%) | |
| C14 | Revenue vs bank deposits (flag > 5%) | New: proof of cash |
| C15 | No error values on any output tab (`SUMPRODUCT(--ISERROR(range))=0`) | V51 has cached `#DIV/0!`; TPL ships 7,913 (R-TPL §8) |
| C16 | Every period label equals its derived value | R-TPL §3 label drift |
| C17 | No volatile functions (`TODAY`, `NOW`, `OFFSET`, `INDIRECT`) anywhere | V51 `TODAY()` drifts the as-of date and tenure (R-MOD §9.2) |
| C18 | No hard-coded number inside a formula grid (writer-side lint) | V51 Offer Overview typed over links (R-MOD §9.2) |
| C19 | Deferred revenue and customer deposits appear in exactly one of `NWC` and `Debt-Like Items` | An earlier draft of 5.6 double-listed them; AMB puts them in NWC [RECS §5] (F1) |
| C20 | `NWC_Peg` built from ≥ 12 month-ends (info flag from quarter-ends; `n.a.` from year-ends only) | AMB's peg is a trailing-12-month average [RECS; OR3] |
| C21 | **Every chart-data row equals its source row for the same months** (per series; mixes also sum to total revenue) | V51 Employee Retention Charts rows 113–116 plot `'Client Retention'!J23:J26`, client data on the employee chart (F3 §3) |
| C22 | Chart lint (writer-side, in `verifyWorkbook`): every `c:f` resolves inside its tab's chart-data block; category and value ranges have equal length; each series name ref is the B cell of its value row; every colour is in the 5.12 table, no `schemeClr`; no second `c:valAx`; no `c:min` / `c:max` except 0; `numFmt sourceLinked="0"`; the caption formula names the same months as the data | V51 chart9 and chart18 name refs off by 6 rows; hard bounds on charts 2–4 and 15; theme colours |
| C23 | `Tie Out — Consideration vs. Deal Structure`: each `Offer Comparison` column's Total Consideration equals that structure's `Deal Structure` output | Keep: VAL row 37 (red CF at a higher priority than Print mode) |
| C24 | `Tie Out — <Seller>'s Value by Source vs. Offer` and `Tie Out — Value by Source vs. Offer` equal zero per column | Keep: VAL rows 102, 111 ("Must equal zero") |
| C25 | Every shared-assumption row on `Offer Comparison` has Variance = 0 | VAL's "D = C" convention made testable |
| C26 | Every IRR helper strip has at least one negative and one positive flow; otherwise the IRR cell shows `n.m.` | VAL `IFERROR(IRR(),0)` prints 0.0% on failure, which reads as a result |
| C27 | Annual mode: `Total Expenses` equals the sum of expense lines, every column; `Net Income` equals the return's line 31 (Sch C) / 21 (1120-S) / 22 (1065), FY columns | SUN types Total Expenses and plugs Other Expenses (F6 §4.1) |
| C28 | Loan principal ≥ 0, every loan and scenario | SUN's Low case: −$17K principal, negative debt service |
| C29 | Low ≠ Mid ≠ High on revenue growth and at least one operating driver | SUN's three scenarios were one (F6 §4.2) |
| C30 | Each sensitivity grid's centre cell equals the model's base case ("Tie Out — <grid>") | Keep: V51 "Tie Out — Growth × Client Wins", "Must equal zero" |
| C31 | Rent roll sq. ft. equals GLA (`Real Estate`) | SUN 8,400 vs CORSAIR 7,000 |
| C32 | In-place rent on `Real Estate` equals the P&L rent line for the owner-occupied suite (within $1) | SUN $1,200/month vs the seller's $1,137.44 |
| C33 | Consolidated value equals Business + Real Estate; no typed constants in the block | SUN `CRE Valuation` F20, F22 typed |
| C34 | Every LTM-strip month equals the `Monthly P&L` cell for that category and month | Strips are links, never typed (F8) |
| C35 | Strip first visible month = `EOMONTH(AsOfDate,-12)+1` and last = `EOMONTH(AsOfDate,-1)+1`; every month-header chain is unbroken | V51 `Client Retention` Q5 is a typed `2025-08-01` mid-chain |
| C36 | `EffectiveDate <= LOIDate + ExclusivityDays`; `EffectiveDate` is a business day (else an info flag); every deal-term string non-empty (no "[X]") | CHK "Closing must occur first", POST-32; LOI v10 "[X] months" |
| C37 | Render check: `Offer Comparison` prints at ≥ 90% and `Sensitivities` at ≥ 80% scale; no page cut at the margin; no caption separated from its chart; ≤ 2 chart exhibits per page | OSO printed at 76% (6.84 pt); V51 chart tabs cut at Feb-26 in render |

Every growth and ratio formula is guarded (`=IFERROR(D8/C8-1,0)` returns `n.m.` via format or text, never `#DIV/0!`). The bot's `verifyWorkbook` additionally runs FR6's checks (recalculation errors, aggregate-range consistency, row-pattern breaks, hard-codes in grids, literal `#REF!`: R-MOD §11).

### 5.8 Named styles

The writer defines these once and applies them by name. If the writing library cannot register named cell styles (ExcelJS cannot), implement each as one shared style object in code and keep the workbook's style list to `Normal` only. No legacy styles (V51 carries `Normal 2`–`5`, `Currency 3`; TPL carries 1,526 cell styles: R-MOD §6.5, R-TPL §8).

| Style | Font (all Arial) | Fill | Border | Number format | Alignment | AMB source |
|---|---|---|---|---|---|---|
| `AMB Title` | 13 Bold | | | | Left; row height 16.5 | V51 row 2 |
| `AMB Subtitle` | 9 Italic | | Thin bottom across the print width | | Left | V51 row 3 |
| `AMB Header Group` | 9 Bold white | `7B0000` | | | Centre across selection | V51 row 5 |
| `AMB Header` | 9 Bold white | `7B0000` | | `mmm-yy` or text | Centre; label cell left | V51 row 6 |
| `AMB Section` | 9 Bold | `FFE1E1` (column groups only, not spacers) | | | Left | V51 |
| `AMB Line` | 9 | | | Body | Indent 1 | V51 |
| `AMB Line First` | 9 | | | Currency | Indent 1 | V51 |
| `AMB Subtotal` | 9 Bold | | Thin top | Currency | | V51 |
| `AMB Key Total` | 9 Bold | `FFFFCC` | Thin box per column group; thin top + double bottom on S&U and proceeds totals | Currency | | V51; CORAL |
| `AMB Margin` | 9 Bold Italic | `FFFFCC` (inside the key-total box) | | Percent 1 dp | Right | V51 "% Margin" |
| `AMB Ratio` | 9 Italic | | | Percent 0 dp | Right | V51 "% Growth" |
| `AMB Input` | 9 `0000FF` | | | as the row | | V51 |
| `AMB Link Sheet` | 9 `008000` | | | as the row | | V51 |
| `AMB Link In-Sheet` | 9 `800080` | | | as the row | | V51 |
| `AMB Pending` | 9 `FF0000` | | | as the row | | V51 |
| `AMB Check` | 9 Italic `FF0000` | | | Check | | V51 "Tie Out" rows |
| `AMB Helper` | 8 `808080` | | | as the row | | V51 IRR strips |
| `AMB Note` | 9 Italic | | | | Left, wrap | V51 "Note:" lines, rationale columns |
| `AMB NA` | 9 | `D9D9D9` | | | | TPL grey blocks |
| `AMB Print Toggle` | 9 `0000FF` | | Thin box | `0` | Centre | V51 "Print" cell |
| `AMB Chart Title` | 9 Bold | | | | Left, no underline | V51 chart captions (underlined on 5 tabs, not on 2; F3) |
| `AMB Key Rate` | 9 Bold Italic | `FFFFCC` (inside the key box) | | `0.0%` | Right | VAL Deal IRR, All-In IRR, Total IRR rows (F4) |
| `AMB Share Block` | 9 | `FFFFCC` | One thin box around the block; bold `Total` row | Percent 0 dp | Right | VAL "Where Ben's Year 5 Value Comes From" |
| `AMB Subsection` | 9 Underlined | | | | Left, indent 0 | SUN "Expenses", "EBITDA Bridge", "Business Valuation" (F6) |
| `AMB Line Banded` | 9 | `F2F2F2` (across the block, not spacers) | | Body | Indent 0 (its `% Sales` row is `AMB Ratio`, indent 1) | SUN expense rows (theme white −5%) |
| `AMB Month Header` | 9 Bold white | `7B0000` | | `[$-409]mmm-yy;@` on a first-of-month date serial | Centre | V51 P&L Forecast Q5, strip headers (F8) |
| `AMB Hidden Prior` | as `AMB Line` | | | as the row | Column hidden, outline level 1 | V51 Expense Analysis G, Client Retention J:R |

Rules: line items indent with `indent = 1`, never leading spaces (R-TPL §7.6). Signed labels use a hyphen in the model ("(-) Market Replacement Compensation", matching V51) and an en dash in the CIM. A spaced em dash separates a label from its qualifier in the model ("Est. Topkey Dilution — Ben's Stake (Year 5)", "Rollover % — Step"; Keep: VAL, V51 settings blocks); units go in parentheses at the end ("(Year 0)", "(% pts)", "(x)", "(#)"); one label per concept.

### 5.9 Colour code and the Print toggle

- Font colours exactly as 1.2's model tokens: **blue input, green cross-sheet link, purple in-sheet link, black calculation, red pending (roman) or check (italic), grey helper** (Keep: V51, TPL). The rule is enforced by the writer: a constant in a formula tab is blue; a formula referencing another sheet is green; a formula that is only `=C7` on the same sheet is purple. V51 breaks this 106 times (blue formulas) and CPM types values in green (R-MOD §6.3, R-TPL §8 item 7); the writer must not.
- **Inputs are blue font on no fill.** The current bot fills inputs yellow and its README tells the advisor to "adjust the yellow cells"; both change.
- **Print toggle** (Keep: V51, TPL). Each output tab has the text "Print" and a boxed blue 0/1 cell at the right end of row 3. A conditional format over the tab's data range, `=$X$3=1`, sets the font colour to automatic, so a PDF export shows no colour coding. **Elevate:** each tab's toggle cell defaults to `=Contents!PrintMode` (green), so one master switch on `Contents` flips every tab; typing a 0 or 1 over a tab's cell overrides it. The CF range is the tab's print area, not `A:XFD` (V51 Revenue Analysis), and it references the tab's own toggle cell (VAL's Offer Comparison CF on rows 152–162 points at `$G$3`, the wrong cell). Check-row CFs (red on a non-zero difference) sit at a higher priority than the Print CF, so a failed tie-out prints red even in Print mode (Keep: VAL priorities 3 and 4). Proof that the toggle works is OSO (`asd.pdf`), where every figure prints black; the one-page file R-MOD cites is a cover and shows nothing.

### 5.10 Number formats (exact strings)

| Use | Format | Source |
|---|---|---|
| Body ($000s, counts) | `#,##0;\(#,##0\);"–";@` | V51 (20,581 cells) |
| First row and totals | `[$$]#,##0;\([$$]#,##0\);"–";@` | V51 (2,703) |
| One decimal | `#,##0.0;\(#,##0.0\);"–";@` | V51 |
| Currency, one decimal ($M, per-unit) | `[$$]#,##0.0;\([$$]#,##0.0\);"–";@` | V51, CPM |
| Percent, whole (growth, mix, deltas) | `#,##0%;\(#,##0%\);"–";@` | V51 |
| Percent, 1 dp (margins, retention) | `#,##0.0%;\(#,##0.0%\);"–";@` | V51 |
| Multiple | `0.0\x;\(0.0\x\);"–"` | V51 |
| Multiple, 2 dp (MOIC, DSCR; MOIC is `0.00x` everywhere, never `0.0x`) | `0.00\x;\(0.00\x\);"–"` | V51; SUN F52:H52 (DSCR); VAL prints 4.7x and 4.66x for the same MOIC (F4) |
| Month header | `[$-409]mmm-yy;@` | TPL |
| Date | `mm/dd/yy` (one variant only; V51 has three) | V51 |
| Funds flow (cents) | `[$$]#,##0.00;\([$$]#,##0.00\);"–"` | CORAL |
| Check | `#,##0.000;\(#,##0.000\);"–"` (so tiny differences show) | New |
| Raw tabs only | `_(* #,##0_);_(* \(#,##0\);_(* "-"??_);_(@_)` | V51 raw exports |
| Percentage points (variance of a rate) | `#,##0.0" pts";\(#,##0.0" pts"\);"–"` | New (VAL formats a 1.8-point IRR difference as 1.8%, F4) |
| Interest rate | `0.00%;\(0.00%\);"–"` | SUN C87 `6.50%` |
| Loan term (years) | `0` | New (SUN leaves it `General`) |
| Per square foot | `[$$]#,##0.00;\([$$]#,##0.00\);"–";@` | SUN CRE P&L D34 |
| Debt constant | `#,##0.00%;\(#,##0.00%\);"–";@` | SUN M58 (8.95%) |

Zero is always an en dash. Negatives are always parentheses, never red. `n.m.`, `n.a.` and `n.q.` are right-aligned text. The current bot's `$#,##0;($#,##0);"-"` and yellow `FFFFFF00` key fill [BOT workbook.ts] are replaced.

### 5.11 Sheet anatomy, headers and print setup

**Every analysis tab** (Keep: V51 anatomy, R-MOD §6.1):

| Element | Spec |
|---|---|
| Column A | Gutter, width 1.7 |
| Row 2 | Company name, `=Cover!B24`, `AMB Title` (link to the Cover, never daisy-chained through another tab: R-TPL §7.6) |
| Row 3 | Subtitle "<Tab purpose> (<units>)", `AMB Subtitle`, e.g. "Historical P&L Summary ($000s)"; "Print" toggle at the right |
| Rows 5–6 | Two-tier header (5.2) |
| Spacer columns | 0.9 between period blocks |
| Spacer rows | Height 3.95 before subtotals and between blocks |
| Gridlines | Off on every tab except raw tabs |
| Zoom | 100% on every tab (V51 ranges from 115% to 205%: R-MOD §6.1) |
| Freeze panes | At C7 (below the header, right of the labels) on every tab wider than one screen; nowhere else (V51's frozen panes are accidents: R-MOD §6.5) |
| Notes | Italic 9 under the table, "Note: …"; notes that cite cells are built with `ADDRESS()` so they stay right when rows move (Keep: VAL) |
| Comments | None on output tabs. Open questions go to `open-questions.md` (V51 comment boxes print over the Offer Overview: R-MOD §9.3) |
| Column A markers | None (V51's stray "x" navigation markers print: R-MOD §9.3) |

**Print setup, every output tab**

- Print area `B2:<last column><last row>` (multi-range where one tab holds several exhibits, Keep: CORAL).
- Landscape when the tab has more than 8 value columns, otherwise portrait. Fit to 1 page wide, as many tall as needed (`fitToHeight = 0`). Exceptions: `Monthly P&L` fits 1 tall × N wide with column breaks every 12 months (5.2); chart tabs are always landscape, two exhibits per page (5.12); `Offer Comparison` and `Sensitivities` obey their scale floors (5.5). Tabs whose width is text rather than value columns (`Debt-Like Items`, `Deal Structure`, `Checks`: a Source, Note or Check column of 30 to 80 characters) print landscape, since portrait would scale their text under the 7 pt floor that C37 enforces (QA round 2 F16).
- Print titles: rows 5:6 on period tabs; **rows 2:6** on tabs that carry LTM strips or several print ranges, so each page opens with the title, subtitle and both header tiers (Keep: V51 `Expense Analysis` repeats $2:$6 across two print ranges; `Client Retention` repeats $2:$4 because each block carries its own header row; no AMB tab repeats rows 5:6 alone); rows 5:6 **and column B** on `Monthly P&L` (New: no AMB tab repeats a column); rows 2:3 on chart tabs (5.12); rows 2:4 on `Sensitivities` (Keep: V51).
- Margins (in): left and right 0.50, top 0.60, bottom 0.70, header and footer 0.30. Centre horizontally.
- Footer: left `AMB Advisory Services | Strictly confidential`, centre `&A`, right `Page &P of &N`. Header: right `<code_name> | As of <mm/dd/yy>` written as static text by the bot (New: no AMB or TCC tab has headers or footers: R-MOD §6.5, R-TPL §7.8).
- Comments do not print. Every output tab is rendered to PDF in QA, and any page cut at the right margin fails the build (V51 Earnings Sensitivity and chart tabs are cut off: R-MOD §9.3).

### 5.12 Chart tabs

**Decision (D13).** Keep native Excel charts in the model [V51 charts 1–20; PLO pp. 4, 7, 8; PACK pp. 3, 7–10, 13–15, 18, 22–24, 26–28]. AMB's diligence workbook is also its exhibit press: PLO and PACK are Excel prints of the V51 chart tabs, and 19 of the 20 charts appear in PACK. Printed to PDF, the chart tabs replace "Initial P&L Overview" and "Pre-LOI Diligence" (Q27). The CIM never pastes or screenshots them; it draws its own pptx charts from the same engine values (2.6), in the same palette. R-MOD §5's one-line summary of AMB's chart style holds for 14 of the 20 charts; the other 6 carry a visible axis, gridlines and no labels (F3 §2.2).

**Tabs.** Chart tabs follow their analysis tab directly (Keep: V51 "Revenue Charts", "Expense Charts"; Fix: V51 files "Expense Charts" four tabs ahead of "Expense Analysis"): `Revenue Charts`, `Expense Charts`, `Retention Charts` (C), `Headcount Charts` (C), named term-neutrally so D11 does not rename them. At most **17 charts** (V51: 20) and **10 printed pages**, two exhibits per landscape page. Output tabs: listed on `Contents` with units "(#, $000s)", no tab colour, no Print toggle (nothing colour-coded sits in the print area).

**Catalogue** (each ID is one exhibit: caption + chart + note):

| ID | Tab | Exhibit | Form | Series (fixed order) | Condition | V51 precedent |
|---|---|---|---|---|---|---|
| MC-R1 | Revenue Charts | Monthly Total Revenue | single bar, labelled | Total revenue | A | chart6 "Monthly STR Subscription Revenue" |
| MC-R2 | Revenue Charts | Monthly Revenue by Line | stacked bar, axis + gridlines, no labels | Top 3 lines by LTM revenue + "Other" | ≥ 2 revenue lines | chart7 (6 theme-tinted series) |
| MC-E1–E3 | Expense Charts | Monthly <Department> Wages | bar panel + ratio panel ("% of Revenue") | Wages; wages ÷ total revenue | one per department with ≥ 10% of payroll, max 3; otherwise one "Monthly Payroll" | charts 1–3 "Monthly Indirect / Bookkeeper / Onboarding Wages" |
| MC-E4 | Expense Charts | Monthly <largest non-payroll operating expense> | bar panel + ratio panel | Expense; expense ÷ total revenue | A | chart4 "Monthly Software Expense Excluding Topkey" |
| MC-E5 | Expense Charts | Top 10 Vendors, LTM Spend | horizontal bar, ranked, labelled | LTM spend | GL detail by vendor supplied | chart5 "Top 10 Software Vendors LTM Spend ($000s)" |
| MC-C1 | Retention Charts | Monthly Customer Wins and Losses (#) | diverging, labelled | New ↑; lost ↓ | A for the tab | chart9 |
| MC-C2 | Retention Charts | Monthly Customer Losses by Churn Type (#) | stacked diverging, axis + gridlines | New ↑; Regrettable, Non-regrettable, Unclassified ↓ | churn reason coded (Q28) | chart8 "(By Churn Type)" |
| MC-C3 | Retention Charts | Monthly Revenue Won and Lost ($000s) | diverging, labelled | New revenue ↑; churned revenue ↓ | customer revenue by month | charts 12–14 |
| MC-C4–C5 | Retention Charts | Monthly <Segment> Wins and Losses (#) | diverging | as MC-C1 | max 2 segments with ≥ 20% of customers | charts 10–11 |
| MC-H1 | Headcount Charts | Monthly Hires and Departures (#) | diverging, labelled | Hires ↑; departures ↓ | A for the tab | chart18 "Total Monthly Employee Retention" |
| MC-H2 | Headcount Charts | Monthly Departures by Type (#) | stacked diverging | Hires ↑; type 1, type 2, Unclassified ↓ | termination type coded | chart17 (whose data block plots client retention: F3 §3) |
| MC-H3–H4 | Headcount Charts | Monthly <Department> Hires and Departures (#) | diverging | as MC-H1 | max 2 departments with ≥ 20% of headcount | charts 19–20 |
| MC-H5 | Headcount Charts | Tenure at Departure (#) | single bar, labelled | "First 3 Months", "3 - 6 Months", "6 - 12 Months", "1 - 2 Years", "Over 2 Years" (V51 buckets verbatim) | hire and termination dates | chart15 (pie chart16 retired) |

Not charted in the model: the EBITDA ladder (the table is the bridge; the CIM draws the waterfall); concentration and cohorts (tables, the cohort triangle with the 2.6 ramp); the named departures roster (V51 "Yearly Employee Wins & Losses" is a named table with a `FCFCFF`→`F8696B` colour scale and `FFF2CC` fill, not a chart; its facts live in `Headcount` and names stay in `Raw - Payroll`). **Monthly window:** every month in `Monthly P&L` up to the as-of month, capped at 36 and at least 12 (fewer: no monthly charts); above 24 months it starts on a calendar-quarter start.

**Palette** (2.6, mapped role by role; `srgbClr` hex only, never `schemeClr` or `sysClr`): single series `7B0000` (Keep: 19 of 19 V51 bar charts); wins / new / hires above the axis `7B0000` (V51: theme `accent6` = `70AD47` on 11 charts); losses / departures below the axis `5E5552` (V51: `7B0000`); losses by type `5E5552` / `DCC7C4` / `C49A5B` (V51: `7B0000` / `FFC1C1` / `FF0000`); mix `7B0000` / `C49A5B` / `5E5552` / `DCC7C4` (V51: six theme tints); stacked segment separator `FFFFFF` 0.5 pt; ratio-panel line `7B0000` 1.75 pt (V51: `00B0F0` 1 pt on a secondary axis); axis line `C2BAB8` 0.5 pt and gridlines `C2BAB8` 0.25 pt (V51: black 0.75 pt axis, `D9D9D9` or black gridlines); axis labels `7A706D`; data labels and legend `2C2523`. The most important loss type sits against the axis. Light fills appear only in stacked charts that carry a value axis.

**Excel settings the writer emits** (F3 §4.4):

| Element | Setting | V51 |
|---|---|---|
| Title | none in the chart (`c:autoTitleDeleted val="1"`); the caption is the cell above | same (Keep) |
| Chart area, plot area | white, no border, square corners; plot area `manualLayout` inner with **x 0.05, w 0.94 on every chart** so a bar panel and its ratio panel align month for month | white, no border; manual layout varying |
| Base font | Arial 8 (`c:txPr sz="800"`, latin and cs Arial) | same (Keep) |
| Gap width, overlap | 60; overlap 100 on stacked and diverging charts | 70 / 150 / 60; overlap only on chart7 |
| Diverging | `grouping clustered`, overlap 100, losses stored **negative** in the chart data (clustered keeps `outEnd` labels; stacked labels collided in the prototype) | positive side-by-side bars, 4-up on the by-type charts |
| Outline | none | black hairline on 18 of 19 bar charts (PLO p4 has 73 strokes) |
| Data labels | on for single-series and diverging, off on stacked; explicit `#,##0;(#,##0);;` (counts, $000s), `#,##0.0;(#,##0.0);;` ($M), `0%;(0%);;` with **`sourceLinked="0"`** (openpyxl omits it and LibreOffice then falls back to the cell format), so zeros are hidden and losses print "(4)"; Arial 8 regular `2C2523`, `outEnd` | source-linked, so zeros print as floating "–" (PACK p7, p22); 8 pt bold |
| Label density | every bar up to 36 categories; a series with a maximum ≥ 1,000 in the chart's units over more than 24 bars switches to $M, 1 dp, and the caption says "($M)" | 31 bold labels nearly touch (PLO p7) |
| Category axis | `c:catAx` over the **Axis Label** helper row, not `c:dateAx`; `majorTickMark none`, `tickLblPos low`, line 0.5 pt `C2BAB8`, labels 8 pt `7A706D`, `rot="0"`; quarter-start labels above 24 months via the formula row, because LibreOffice ignores `c:tickLblSkip` | `dateAx`, black 0.75 pt, auto-rotated to 45° |
| Value axis | `<c:delete val="1"/>` when every bar is labelled; visible only on stacked charts and ratio panels (8 pt `7A706D`, no line, no ticks); bounds none except `c:min val="0"` on ratio panels; ≤ 4 gridlines with `c:majorUnit` a round step | hidden on 13, deleted on 1, visible bold on 6; `min 0.1`, `max 0.21`, `max 23` hard-coded |
| Secondary axis | never (D10) | charts 2–4 |
| Ratio panel | a **separate chart object** under the bar chart, same x/w layout, about 30% of the exhibit height; the bar chart's category axis is deleted so the months print once | cyan line on a secondary axis |
| Legend | none for one series; 2–4 series: `legendPos t`, manual layout top-left, 8 pt, series order | bottom; a one-series legend on chart15 |
| Hidden cells | `c:plotVisOnly val="0"`, `dispBlanksAs gap`, so collapsing the chart-data block does not blank the charts | `plotVisOnly 1` |
| Caches | every `c:numRef` / `c:strRef` carries the **engine's** values with `c:formatCode`, so charts render before recalculation and QA can compare them | Excel caches |
| Anchor | `twoCellAnchor editAs="oneCell"` from B<top> to N<bottom>, offsets 0 (the chart spans B:M exactly); no `chartStyle` / `colors` / `c:printSettings` parts | twoCell with ragged 1–47 pt offsets (a widened column stretches every chart) |
| Ranked bar (MC-E5) | `barDir bar`, category axis `orientation maxMin` so the largest is on top | column chart with wrapped names |

**Chart-data block** (Keep V51's idea: on the chart tab, below the print area; Fix its fragility): header row `AMB Header`, B "Chart Data"; grouped at outline level 1 and left expanded. Row 1 months `=EOMONTH(AsOfDate,-n)+1` then `=EDATE(prev,1)`, `[$-409]mmm-yy;@`, never typed (V51 types `2024-01-01` and `2025-01-01`). Row 2 **Axis Label** (`808080`): `=IF(n<=24,TEXT(month,"mmm-yy"),IF(MOD(MONTH(month)-1,3)=0,TEXT(month,"mmm-yy"),""))`. Data rows are green links **matched on the month, not the column position**: `=INDEX('Monthly P&L'!$Q$8:$AZ$60, MATCH($B<row>,'Monthly P&L'!$B$8:$B$60,0), MATCH(C$<monthrow>,'Monthly P&L'!$Q$6:$AZ$6,0))` (V51 pulls `'Combined P&L'!N:N`, `O:O` … by position, so a shifted header misaligns the months silently). Losses and departures negated; ratio rows `=IFERROR(wages/revenue,0)` in black. **The series name cell is the B cell of the plotted row** (V51 chart9 names its series from `$B$112` over values in row 118; chart18's legend reads "Employee Hires" over a row called "New Hires"). Mixes: the top 3 lines chosen on LTM revenue, "Other" = total less the three.

**Tab anatomy and print** (F3 §4.6): columns A 1.7, B 34, C:M 9.1 (chart-data months continue at 9.1); rows 12 pt (row 2 16.5); row 2 `=Cover!B24` (`AMB Title`; V51 daisy-chains four chart tabs through other tabs, R-TPL §7.6); row 3 subtitle "<Area> Charts (<units>)" (`AMB Subtitle`, rule across B:M; V51's Employee Retention Charts subtitle reads "Client Retention Charts"). **Exhibit block = 19 rows:** caption (`AMB Chart Title`) → 16 chart rows (2.67 in; a bar + ratio exhibit splits them 11 + 5) → note (`AMB Note`) → spacer. Caption built by formula, Title Case, units last: `="Monthly Bookkeeper Wages, "&TEXT(ChartStart,"mmm-yy")&" – "&TEXT(ChartEnd,"mmm-yy")&" ($000s)"` (Keep: V51's caption-above-chart habit, Arial 9 Bold; Fix: typed "(Jan’24 - July’26)", underline on 5 of 7 tabs, copy-pasted captions). Note: what the ratio or split means, then the source tab ("Ratio panel: bookkeeper wages ÷ total revenue, same months. Source: Monthly P&L."). Landscape Letter, `fitToWidth 1`, `fitToHeight 0`, 5.11 margins and footer, print titles rows 2:3, one contiguous print area `B2:M<last note row>`, manual breaks after every second exhibit (page 1: header rows 2–4, exhibits at rows 5–23 and 24–42, break after 42; page k ≥ 2: a spacer, then exhibits at 44+39(k−2) and 63+39(k−2)); B:M = 9.81 in fits 10.0 in at 100% (V51's multi-range print areas leave about 45% of every retention page blank, PACK pp. 7–10, 13–15, 22–24; V51 chart tabs sit in `pageBreakPreview` at 100–160% zoom with Excel "Normal" margins and no footer). Normal view, zoom 100, gridlines off, no freeze panes.

**Build path.** `exceljs@4.4.0` has no chart API (nothing under `node_modules/exceljs/lib` writes `c:chartSpace`). `src/model/charts.ts` post-processes the buffer from `workbook.xlsx.writeBuffer()` with JSZip (already an ExcelJS dependency): for each chart tab it adds `xl/charts/chartN.xml` (the settings above, caches from the engine), `xl/drawings/drawingN.xml` and its rels, the `<drawing r:id>` element in the sheet XML at its schema position (after `headerFooter` / `rowBreaks`, before `legacyDrawing` / `tableParts`), the sheet `.rels` entry and the `[Content_Types].xml` overrides. One drawing part per sheet; the Cover's logo drawing is untouched. Chart specs are data (`{ id, tab, anchorRows, type, series: [{ nameRef, valRef, color }], labels, axis }`) produced by the code that lays out the chart-data block, and the engine exposes the same series so `verifyWorkbook` compares caches with values. Prototype: `scratchpad/research/followup3/proto/build3.py`, renders `proto3_p1.png`, `proto3_p2.png` (checked in LibreOffice only; not yet opened in Excel).

**QA.** Checks C21, C22 and C37 (5.7). Every chart tab is rendered to PDF; a chart cut at the margin, split across pages, a caption on a different page from its chart, or more than two exhibits on a page fails the build. The render environment installs Carlito (1.3).

**Retired from V51's charts:** the tenure pie (chart16), the dual-axis combos (charts 2–4), the six-colour stacked mix, `70AD47` / `00B0F0` / `FF0000` / `FFC1C1`, black bar outlines and gridlines, hard-coded axis bounds, typed period captions, and the roster colour scale as a chart substitute.

### 5.13 Cover and Contents

**Cover** (Keep: V51 / VAL / SUN cover, identical across AMB files; R-MOD §8, R-TPL §7.7). Landscape, fit to page, print area `B2:Q39`, gridlines off.

| Cells | Spec |
|---|---|
| B2:Q2 | Solid fill **`9E0A20`** (was `990033`, D1; OSO p1 still prints `9A0033`). Row height 13.5 is a normalization (New): V51 row 2 has no custom height |
| B4:Q4 | Medium black top border; row height 6 |
| E23:N23, E28:N28 | Thin black rules framing the title block |
| B24 | Business name (internal version) or `code_name` (buyer version, Q20), Arial 26 Bold, centre across B:Q (not merged) |
| B25 | Document type, Arial 20 Bold Italic: "Financial Model" |
| B26 | `="As of "&TEXT(AsOfDate,"mm/dd/yy")`, Arial 18 Italic. **Never `TODAY()`** (Fix: V51 and VAL; the "As of 09/24/26" on OSO's cover is the print date, because VAL's B26 is `="As of "&TEXT(TODAY(),"mm/dd/yy")`) |
| B30 | "Prepared by AMB Advisory Services LLC for [Client] \| [Month D, YYYY] \| Confidential", Arial 9 Italic, centre across B:Q (Keep: AMB's preparer line, its most consistent document furniture across 11 memos and CHK `Read Me`!A2: `Prepared by AMB Advisory Services LLC for <client> \| <Month D, YYYY> \| Confidential[ – <audience limit>]`, F2 §6.1) |
| B38:Q38 | Medium black top border |
| B39:Q39 | Solid fill `9E0A20` |
| Logo | `amb-logo-maroon-2048.png` scaled to about 2.1 in wide, anchored at N33 to Q37 (Keep: V51 bottom-right placement) |
| Seller's logo | Optional, centred in rows 8–21, only in the internal version |

**Offer Structure Overview export** (Keep: OSO's page order; F4 §5.7). On request the bot writes a PDF: the model `Cover` with B25 "Offer Structure Overview" and B26 from `AsOfDate`, then `Offer Comparison`, then `Deal Structure` (one page per structure column group), then `Sensitivities`, printed with `PrintMode = 1`, the 5.11 footer and page numbers, every range at ≥ 90% scale. File name `<code_name> - Offer Structure Overview vNN.pdf` (never a throwaway name like "asd"). It goes to AMB's client, and to a counterparty only on Frank's instruction (Q26); never part of the CIM (D5). If the bot ever writes a Word companion (Q4), its furniture is OFF9 / OFF14's (H1 `7A0000` 14 pt, H2 `9A0033` 11.5 pt, `F2EEE9` label fills, `D8D0C6` rules, the preparer line at 10 pt `555555`, numbered H2s such as "1. Executive Summary", answer-first bold lead-ins, the closing "Prepared by AMB Advisory Services LLC. … not legal or tax advice." line), never the Google Docs memos' navy `1A3C6E`, blue-grey `E8EDF3` headers or text-glyph scorecard bars (F2 §6–7).

**Contents** (New)

- Row 2 title, row 3 "Contents".
- Index table from row 5: `# | Tab | Purpose | Units | Check`. The tab name is a hyperlink (`=HYPERLINK("#'P&L Summary'!A1","P&L Summary")`); `Check` shows "OK" or "CHECK" for that tab's checks.
- Model information block to the right: Business name, Code name, Prepared by, As-of date (link), LTM period, Fiscal year-end, Source used per year (from the merge step), Version, **Print mode** (blue 0/1, the master switch), **Master check**.
- Version log below: `Version | Date | Prepared by | Change`. The file name keeps AMB's `vNN` suffix (Keep: V51 naming, R-MOD §2.3); the log records what changed (V51 has 51 versions and no log).

### 5.14 Named outputs for the CIM

The only defined names in the workbook. The CIM reads every figure through these (plus the period tables they point to), so text and exhibits cannot drift from the model.

`AsOfDate`, `FYEMonth`, `PrintMode`, `MainStreetMode`, `Rev_FY`, `Rev_LTM`, `Rev_PF`, `GP_FY`, `GP_LTM`, `RepEBITDA_FY`, `RepEBITDA_LTM`, `SDE_FY`, `SDE_LTM`, `AdjEBITDA_FY`, `AdjEBITDA_LTM`, `PFAdjEBITDA`, `Customers_Latest`, `Top10Share_LTM`, `GDR_LTM`, `NDR_LTM`, `Headcount_Latest`, `NWC_Peg`, `MasterCheck`. `_FY` names refer to the row across the FY columns; the engine exposes the same values under the same keys.

Added by the follow-ups: `DealForm`, `NWC_Latest`, `NWC_vsPeg`, `DefRev_Latest` (5.6); `Offer_Count`, `Offer_Reference` and, per column i, `Offer_Headline_i`, `Offer_RiskAdj_i`, `Offer_CashAtClose_i`, `Offer_SellerMOIC_i`, `Offer_SellerIRR_i` (so memo tables like OSC's are generated and cannot drift: OSC's 4.66x is VAL's, while V51 prints 5.33x for the same label); `LOIDate`, `SigningDate`, `EffectiveDate`; `RE_GLA`, `RE_OccupiedSF`, `RE_RentInPlace`, `RE_RentMarketBase`, `RE_RentAdj_PF`, `RE_NOI_InPlace`, `RE_NOI_Base`, `RE_Arrangement`; `Monthly_<line>` row names for S11.2; `ChartStart`, `ChartEnd`.

### 5.15 What the current bot must change

| Current (BOT) | Change to |
|---|---|
| Model header fill navy `FF1F3A5F`; key fill yellow `FFFFFF00`; format `$#,##0;($#,##0);"-"`; input cells filled yellow; navy and amber tab colours (`workbook.ts` lines 19–25, 246–247) | `7B0000` / `FFE1E1` / `FFFFCC`, AMB formats (5.10), blue-font inputs, no tab colours |
| Tabs: Cover, Assumptions, IS, Recast, BS, CF, Valuation, Checks, Source | Architecture in 5.1 |
| CIM palette navy `13294B` + brass `B8862B`; Cambria titles and Calibri body (`deck.ts` lines 29–40) | Palette 1.2; Georgia titles and Arial body |
| Letter-spaced caps kickers: "01 · EXECUTIVE SUMMARY" and the cover's "CONFIDENTIAL INFORMATION MEMORANDUM" (`charSpacing` at `deck.ts` lines 93, 132, 214, 374); 28 pt titles | Footer tracker; sentence case; 20 pt action titles |
| `numberBadge()` ellipses (line 107), `card()` rounded rectangles (line 119), cover circles (line 127) and tagline (line 140) | Removed (2.10 T1, T2, T5) |
| Fixed 10 pages, "one idea per slide" | Section library and variable-length rule (3.3–3.5) |
| No charts in the model (ExcelJS has no chart API) | Chart tabs per 5.12 via the `charts.ts` injector |
| One deal structure at a time; NWC and closing mechanics absent; no Main Street annual mode; no real-estate module | Structure columns and `Offer Comparison` (5.5); `NWC` and `Debt-Like Items` keyed off `DealForm` (5.6); annual-only layout and Schedule C map (5.2A, 5.2B); conditional `Real Estate` tab (5.5) |

---

## 6. Open questions for Frank

The references leave these ambiguous. Each has a default the build will use until he answers.

| # | Question | Default until answered | Why it is open |
|---|---|---|---|
| Q1 | Approve **`7B0000`** as the one working maroon for CIM and model, and **`9E0A20`** replacing `990033` on model cover bars and any document band? May Word companions keep the `7A0000` / `9A0033` pair Frank has been saving since 21 Sep 2026 (OFF9, OFF14, LOI12)? | Yes (D1); Word companions follow OFF14 until he answers | AMB uses at least 15 reds; `990033` came from TCC's theme (R-BRAND §3), and `9A0033` is one step from it in AMB's current offer documents (F2 §8.5) |
| Q2 | Approve **Georgia** for CIM titles, versus Times New Roman (memo continuity) or all-Arial? | Georgia (D3) | ICP and memos use TNR; exhibits use Arial |
| Q3 | Is there a **vector logo** (SVG, AI or EPS)? Is the white knockout from the Topkey memo header an approved reversed version? | Use the 2048 px PNGs; use the white knockout | No vector in the library; the reversed logo appears only in the memo header band |
| Q4 | Should the bot also produce a **buyer-directed ICP** carrying AMB's valuation rationale and recommended structure (as ICP5 does), separate from the marketing CIM? | No; CIM only, no valuation (D5) | ICP5 carries price guidance; REQ says `asking_price` is not used in the CIM |
| Q5 | Has counsel approved the **ICP1 disclaimer** text? Is "Broker" correct for AMB's licensing? | Use ICP1 verbatim | ICP1 was dropped from v2 onward with no replacement |
| Q6 | **Contact block**: Frank's full name and title as it should print ("Principal"?), direct phone and email; is 813.364.2178 / info@ambadvisoryservices.com right for CIMs? | Firm-level contact from ICP1 and `.env` `AMB_*` fields | Only firm-level details appear in the references |
| Q7 | **SDE definition and threshold**: one working owner or all owners; which owner costs count (benefits, vehicle, phone); is PF Adj. EBITDA < $1.0M the right switch for Main Street mode? | One owner's total compensation; $1.0M | SUN shows an SDE bridge but no written definition |
| Q8 | **Owner replacement** default: keep $85,000 (REQ) and a 15% burden (TPL precedent)? | Yes | TPL used $200K + 15%; Forth used 7.65% + 7.8% |
| Q9 | Retire **"Near-Term / Steady-State Adj. EBITDA"** in sell-side materials in favour of Adj. / PF Adj. EBITDA? | Yes (D6) | Those names describe a buyer's post-close changes [MEMO] |
| Q10 | Which **add-back statuses** may appear in the CIM (Accepted only, or also "Management representation" with a footnote)? Should the CIM carry the **"Considerations for buyers"** page? | Accepted only, footnoted by evidence type; include the page | Candour builds credibility (OPP3 risk table), but it is a marketing document |
| Q11 | **Customer names**: always coded (C-001) in the CIM, or named after NDA? "Customer" or "Client" by industry? | Always coded; term set per deal | V51 codes clients; the write-ups use real names |
| Q12 | **People**: may the CIM name the owner and key managers? Salaries only as department aggregates? | Management names and roles only; aggregates only | Write-ups include named rosters with salaries |
| Q13 | Is the CIM always **post-NDA** (business name in the body, per REQ)? Is a blind teaser a separate deliverable? | Post-NDA; no teaser | REQ puts `business_name` in the body |
| Q14 | May the CIM show the **bot's driver-based projections** (labelled "Illustrative"), or only management-provided projections? | Management-provided only (S9.2) | README calls the projections "defaults, not a forecast" |
| Q15 | Which **comps sources** does AMB license (DealStats, BizBuySell, BVR, others)? ACQ covers accounting firms only | Multiples as blue inputs with a Source column | ACQ is the only comps file in the library |
| Q16 | **Deal Structure defaults** (AMB precedent sets most; confirm the rest): (a) the 80 / 20 cash and seller-note split and 9.0% (ICP5) versus 6.5% (TCC buy-side); (b) SBA 7(a) terms (term, rate, equity injection); (c) AMB's success-fee schedule for the proceeds waterfall; (d) when is a retention holdback the right tool versus a seller-note contingency, and may S10.1 offer seller financing? | Cash at close 80%; seller note 20%, 18 months, 9.0%, quarterly, subordinated; no earnout; escrow 10% of cash at close for 15 months; indemnity cap 10%, basket 0.75%, survival 15 months; retention holdback off (18 months when on); exclusivity 90 + 30 days [ICP5, MISC, LOI12, RECS, OR3, KON, PB06, VAL]. SBA terms and the success fee stay blank and flagged | No file in the library gives SBA terms or a fee schedule (a search for "success fee", "Lehman", "retainer" returns nothing); Keystone's 17% cash is a stock-consideration case (F2) |
| Q17 | **NWC and closing mechanics** (AMB precedent sets the defaults; confirm the details): (a) confirm the defaults by deal form; (b) Main Street inventory: in the price or added at cost at closing? Do customer deposits transfer with a credit to the Buyer? (c) reconciliation holdback of one month of payroll (ICP5) versus none (SUN); (d) may S10.1 state the basis of offers? | **Equity purchase (LMM):** cash-free, debt-free, normalized NWC delivered at close; peg = T12M average of month-end Adjusted NWC; deferred revenue an operating liability inside NWC [LOI12 §1, OFF14 "Balance Sheet", RECS §5, OR3 #13]. **Asset purchase (Main Street):** Seller keeps cash, AR and AP; liens paid off at close with payoff letters; no peg; one month of payroll as reconciliation holdback [SUNPA, SUNREQ, ICP5, CORAL]. **Any tax-deferred stock or rollover:** true-up settled in stock or within a hard dollar cap, and flagged [FTM, TAX] | AMB's equity convention ("cash-free, debt-free basis, with a normalized level of working capital delivered at close") is unchanged across 19 readable Keystone drafts (LOI v0–v8, v10, v12; Offer v2, v3, v7–v10, v12, v14; Offer v4–v6 are corrupt zips). The asset-sale mechanics come from SUN and ICP5. AMB has no single answer on inventory, deposits or holdback size (F1) |
| Q18 | Will the **model** be shared with buyers? If so, which tabs (a "buyer data pack" export)? | Internal only | V51 has an internal and a "Target Version" P&L |
| Q19 | **Print toggle**: one master switch on Contents with per-tab override? | Yes (5.9) | AMB sets it per tab |
| Q20 | **Model cover**: business name or code name; seller's logo shown? | Business name internally; code name in any buyer version; no seller logo | V51 shows the target's logo |
| Q21 | Deliver the CIM as **.pptx only, or .pptx plus PDF**? | Both; the PDF exported from PowerPoint so Georgia embeds | LibreOffice lacks Georgia |
| Q22 | Compute **after-tax seller proceeds** by entity type in the model? | No; pre-tax, with OPP3's tax disclaimer | Tax work sits outside AMB's scope per OPP3's disclaimer |
| Q23 | Does AMB hold **industry benchmark datasets** (peer margins, labor ratios) the CIM may cite? | No benchmarks unless supplied and sourced | The write-ups used TCC's member-company data, which is not AMB's |
| Q24 | Should the **Market** section (S3) appear only when AMB supplies sourced data? | Yes | The write-ups' market inputs carry no sources (R-WU §6.2) |
| Q25 | **Date style**: cover month and year ("October 2026") in the CIM, and "As of mm/dd/yy" in the model (AMB's form)? | Yes | AMB covers use "As of 09/15/26" |
| Q26 | May the **Offer Structure Overview** (comparison + structure detail + grids) go to a **counterparty**, as OSO appears to have (it sits in `03) Target Materials`), or only to AMB's client? In sell-side mode, are bidders named or lettered (LOI A, LOI B)? | Client only; bidders by short name internally, lettered in any copy that leaves AMB | OSO is filed with target-facing materials; VAL names both principals ("Jon", "Ben") in row labels (F4) |
| Q27 | Does Frank still **print exhibit packs from the model** (PLO / PACK style), which is what justifies the chart tabs (5.12)? Keep them in the buyer version of the workbook, or drop them since the CIM carries the charts? | Yes; keep them in both versions | 19 of V51's 20 charts print in PACK (F3; F8 Q-M2) |
| Q28 | **Churn and termination vocabulary** for MC-C2 and MC-H2: V51 uses "Regrettable / Non-Regrettable / Unclassified Losses" on both client and employee charts, but its employee roster uses "Resignation / Termination / Unclassified" | The words in the source data, "Unclassified" for blanks | F3 §4.9 |
| Q29 | **Capital Reserve placement**: SUN deducts it above SDE (SDE post-capex); the IBBA definition and SBA underwriting put it below SDE. Which prints? | Below SDE, as `[S3]` | SUN `Laundromat Valuation` row 43 (F6) |
| Q30 | **Owner compensation from a Schedule C**: treat contract labor (line 11) as the owner's pay only with a 1099 or bank evidence? | `Proposed` until evidenced | SUN row 48 = line 11, $55,000 in FY24 only (F6 §4.4) |
| Q31 | When the seller keeps the building and leases to the buyer, should the CIM show the **market-rent comparables table**, or only the proposed rent? | Show it in the appendix (S11.5): a buyer will diligence the rent, and the comps defend the PF adjustment | SUN comps (F7) |
| Q32 | **Real-estate reserve conventions**: keep $0.20 (capital) and $0.15 (TI/LC) per sq. ft. and 5% vacancy as AMB defaults, and a management fee that is never zero? | Yes, with CORSAIR's rationale text in the `Source` column | SUN CRE P&L; CORSAIR Assumptions (F7) |
| Q33 | **One as-of date per model**: V51's retention strip runs to Sep-26 while its P&L strips end Jul-26 because the customer list was newer. Truncate every strip to `AsOfDate` (proposed), or let retention keep its own as-of with a note? | Truncate; disclose the newer data in the Summary | F8 §4.4 |
| Q34 | **Monthly history window** on `Monthly P&L`: from the first month of FY-2 (24–36 columns), or every month the source provides? | First month of FY-2; earlier months stay in the Databook | Print width and S11.2 page count (F8 Q-M4) |
| Q35 | **Databook header colour**: V51's `Combined P&L` header is dark blue `1F4E78` while analysis headers are maroon. Keep a blue header as the "raw lineage" marker, or make every tab maroon? | Maroon on every tab (one palette, 1.2) | F8 §3.2 |
| Q36 | **Earnout slope**: VAL's formula reaches the 150% cap at 120% of target revenue; RECS's drafted clause puts the maximum "at 150% of target". Which is AMB's intent? | VAL's formula, with the slope stated in the note | F2 §7.1 |
