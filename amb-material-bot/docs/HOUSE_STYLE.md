# AMB house style: CIM deck and financial model

**Status:** the specification the rebuild follows. Written 2026-09-27 from the five research reports in `docs/research/` and the extracted brand assets in `brand/`. Where this document and a research report disagree, this document wins. Where this document is silent, follow the nearest AMB precedent it cites, and log the gap in section 6.

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

Research reports (in `docs/research/`): **R-MOD** `amb-models.md`, **R-TPL** `template-workbooks.md`, **R-BRAND** `decks-brand.md`, **R-DEL** `amb-deliverables.md`, **R-WU** `writeup-examples.md`.

"TCC lineage" marks conventions taken from The CAM Collective files held in AMB's library. They share AMB's model conventions (same font code, formats, cover grammar, Print toggle: R-TPL intro), and Frank authored one of the write-ups, so they count as house precedent. The TCC PowerPoint master, logos and colour scheme do not.

### 0.2 Decisions at a glance (where the analysts differed, this is the call)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Which red? AMB uses 11 (R-BRAND §1) | **Maroon `7B0000`** is the working brand colour in both deliverables. **Crimson `9E0A20`** is the logo and the model cover bars. `990033` is retired. | `7B0000` is AMB's header band [V51], Word headings [OPP3, MEMO] and chart colour [V51]. `9E0A20` is the logo. `990033` came from TCC's theme (R-BRAND §3.4). |
| D2 | Yellow `FFFFCC` key totals in the CIM? | **Model: keep. CIM: retire.** CIM key totals are ruled top and bottom in maroon. | Yellow on a slide reads as a pasted spreadsheet (R-BRAND §7 ICP-3). The rules keep AMB's "boxed total" idea. |
| D3 | Typeface | **Georgia Bold** for action titles, cover and divider titles only. **Arial** for everything else. | Continues AMB's serif-heading / Arial-exhibit split [ICP5, OPP3, V51] with a better serif than Times New Roman. Checked in render (section 2.3). |
| D4 | Table header | **Filled `7B0000` band, white bold**, on every table, numeric and text. | AMB's most recognisable exhibit device [V51 P&L Overview, PLO p2]; OPP3 and ICP5 also fill their headers. |
| D5 | Valuation or asking price in the CIM | **Never.** Valuation and structure live in the model (and an optional ICP). | REQ: `asking_price` "Not used in the CIM". R-WU §6.10. |
| D6 | EBITDA ladder names | **Reported EBITDA → Adj. EBITDA → PF Adj. EBITDA**, with **SDE** as a rung in Main Street mode. AMB's "Near-Term / Steady-State" names stay in buy-side work. | Near-Term / Steady-State describe a buyer's post-close changes [MEMO Quick Stats footnotes (2), (3)]; a sell-side CIM must not assume them. |
| D7 | Period labels | `FY2025`, `YTD Jul-26`, `LTM Jul-26`, `PF Jul-26`; months `Jul-26`. One vocabulary in both deliverables. | AMB mixes "July'26", "Jul'26 LTM", "July'26 YTD" [V51]; one workbook had 11 variants (R-TPL §3). |
| D8 | Adjustment references | Tier-prefixed, formula-numbered: `[D1]` definitional, `[N1]` normalization, `[S1]` owner compensation / SDE, `[PF1]` pro forma, `[M1]` memo. | TPL tier codes + CPM bracket numbering, one taxonomy end to end (R-TPL §9.1–9.2). |
| D9 | Section tracker | **Footer**, sentence case, current section in maroon. No kicker above the title. | Replaces KICK's red italic prefix (R-BRAND §5.3) and the bot's letter-spaced caps kicker [BOT deck.ts]. |
| D10 | Chart colours | Validated palette (section 2.6). No dual axes: AMB's bar + cyan % line becomes two panels. | The palette was run through the dataviz validator. Dual axes are the most common chart error. |
| D11 | "Customer" or "Client" | One term per deal, set on the Assumptions tab and used everywhere. | V51 mixes them (R-MOD §10 item 9). |
| D12 | Section dividers | Only when the CIM has **24 or more pages**. | Short Main Street CIMs lose density to dividers. |

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

**Retired, never used in either deliverable:** `990033`, `FF0000` as a fill or chart colour, `C00000`, `54001C`, `820033`, `B70033`, `98002F`, `5B312B` and `8C4A43` (ICP brown headings), `44546A` (KICK slate text), `4EA72E` / `EE0000` (ICP semantic borders), `70AD47` (Excel green), `00B0F0` (cyan ratio line), `CAEDFB` / `DAE9F8` (TCC blue boxes), every navy (`1F4E78`, `1F3864`, `324E6B`, the bot's `13294B` / `1F3A5F`), brass `B8862B`, and the TCC teal `165A58` (R-BRAND §8, R-MOD §9.3, R-TPL §7.3, BOT).

### 1.3 Typefaces

| Medium | Face | Where | Source |
|---|---|---|---|
| CIM titles | **Georgia Bold** (action titles), **Georgia Regular** (cover codename, divider section names) | Title zone, cover, dividers only | Elevate: AMB sets headings in bold serif maroon [OPP3 H1 17 pt TNR bold `7B0000`; ICP5 H1]. Georgia is the upgrade R-BRAND §8 recommends |
| CIM everything else | **Arial** | Body, tables, charts, footers, notes | Keep: AMB exhibits are Arial [V51, PLO, PACK] |
| Model | **Arial**, written exactly `Arial` | Every cell | Keep: V51. Fix: V51 has 5,590 cells set to `Arail`, a typo that makes Excel fall back to another font (R-MOD §9.3) |

- Two faces, never three. The ICP put Times New Roman prose, Arial screenshots and an Aptos chart on one page (R-BRAND §4). That must not recur.
- Georgia ships with Windows, macOS and Microsoft Office. The render and QA environment must install **Gelasio** (metric-compatible with Georgia) so that LibreOffice previews break lines the way PowerPoint will. Without it, LibreOffice substitutes DejaVu Serif, which is about 12% wider and heavier (seen in the section 2.3 check).
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
| Two-tier header | Tier 1 = period group ("Full Year", "YTD", "LTM", "PF", "PF vs. LTM"), centred across its columns. Tier 2 = period ("2024", "Jul-26", "($)", "(%)"). Tier-2 first cell names the table, left-aligned ("Income statement"). Tier-1 first cell is blank maroon | Keep: V51, PLO. First-cell name is AMB's ("P&L Summary") |
| Group blocks | A white gap column **0.08 in** wide between period groups; the header band, section rows and key-total rules break at the gap, so each group reads as its own block | Keep: V51 0.9-width spacer columns; PLO "narrow white gutters" |
| Section row | Fill `FFE1E1` across each group block (not the gaps); label Arial Bold 8.5 pt `ink`; no figures | Keep: V51, PLO |
| Line item | Regular; label indented 0.12 in (0.24 in for a sub-line) | Keep: V51 indent 1 |
| Subtotal | Bold; 0.5 pt `ink` top border on every cell of the row within each block | Keep: V51 thin top border |
| Key total (Net income, Reported EBITDA, SDE, Adj. EBITDA, PF Adj. EBITDA, Total consideration, Ending count) | Bold; **0.75 pt `7B0000` top and bottom borders** within each block; no fill | Elevate: V51's `FFFFCC` boxed total becomes a maroon-ruled total |
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

**Marks and anatomy**

- Bar gap width 60%. No outlines (AMB's black hairline outlines go: R-DEL §3.3). No 3-D, shadows, gradients or rounded corners.
- **No gridlines.** Value axis hidden when every bar is labelled (Keep: V51 charts have no value axis and labels on). When a value axis is needed (line charts), at most 4 gridlines, 0.25 pt `rule`.
- Category axis: 0.5 pt `rule` line; labels Arial 8 pt `muted`, **never rotated**. With more than 16 categories, label quarter starts only (Jan, Apr, Jul, Oct as "Jan-25"), and label only the first, last, maximum and minimum bars (Elevate: PACK rotated 31 monthly labels 45°).
- Data labels Arial 8 pt, `#,##0` in the exhibit's units; white inside dark fills, `ink` elsewhere (see 2.3, trap 3).
- Legend: none for a single series (the exhibit title names it). For 2–4 series, top-left, 8 pt, in series order; lines are direct-labelled at their right end instead.
- Lines: 1.75 pt `7B0000`; a marker (5 pt circle) on the last point only.
- **No dual axes.** AMB's "bar + % of recurring revenue" combo (maroon bars, cyan `00B0F0` line on a secondary axis [V51 Expense Charts, PLO p7]) becomes either two stacked panels sharing the category axis (the ratio panel about 30% of the height) or a single row of ratio labels under the bars.
- **No pies or donuts.** Mix uses a 100% stacked bar or a table (Elevate: V51 tenure pie, HOACS revenue pie).
- **Wins vs losses** is a diverging bar: wins above the axis in `7B0000`, losses below in `5E5552`, net as labels (Elevate: PACK p7 paired green/maroon bars).
- **One annotation per chart, at most,** tied to the action title: a CAGR ("FY2021–FY2025 CAGR: 12%") right-aligned on the exhibit-header line, or one event label with a 0.5 pt `ink` leader ("Plumbing added, 2019"). Keep the write-ups' CAGR boxes and event markers as the idea (R-WU §5.4), not their styling.
- Chart height is at least 2.6 in on L1 and L2 pages. A short, wide chart is a layout failure.

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

- *Process and next steps*: ICP1's eight stages in a text table with a timing column: `# | Stage | What happens | Target timing`. Stages verbatim: NDA Execution, Initial Call, Buyer Q&A / IOI, Management Meeting, LOI Submission, Due Diligence, Purchase Agreement, Close & Transition. Plain numerals in the narrow first column; no badges (Keep: ICP1).
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
6. **Model traceability**: every figure on the page is pulled from a named model output (5.13), not retyped.

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
| S2.4 | Locations and facilities | Where it operates, on what terms | Table `Location \| Function \| Size \| Owned / leased \| Lease term`; revenue split by market if available | Notes, lease details | C: ≥ 2 locations, or facility or lease facts in notes | ICP1 "Facilities"; WU PreLOI-CPM Geography table |
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

#### S8. Balance sheet and cash flow (1–3 pages; C, absent from every AMB and TCC precedent)

| ID | Page | Exhibits | Trigger |
|---|---|---|---|
| S8.1 | Summary balance sheet | Condensed balance sheet by year-end; debt-like items flagged | ≥ 2 year-end balance sheets |
| S8.2 | Net working capital | NWC trend (AR, inventory, AP, accrued, deferred revenue, customer deposits); DSO / DIO / DPO; trailing average | ≥ 12 month-ends or ≥ 4 quarter-ends (year-ends only: shown with a note) |
| S8.3 | Capex and cash conversion | Capex by year (maintenance vs growth where known); (Adj. EBITDA − capex) ÷ Adj. EBITDA | Fixed-asset data or depreciation plus capex detail |

In an asset sale where the Seller keeps receivables and payables, S8.2 shows what transfers (inventory, deposits, prepaid) and says so in the note (Q17).

#### S9. Growth opportunities (A: at least one lever; 1–3 pages)

| ID | Page | Exhibits | Status | Precedent |
|---|---|---|---|---|
| S9.1 | Opportunity sizing | One grid per lever: baseline × lever % (or benchmark gap × penetration ramp) → revenue → contribution margin → EBITDA; one proof-point line. Seller-achievable levers only; buyer synergies are left to the buyer | A (≥ 1 lever with a baseline and a benchmark or management target) | WU Coral markup and capital-projects grids; Dil-CPM addendum comps and ramp |
| S9.2 | Management projections | Historical plus projected P&L with KPIs and CAGRs; baseline and initiatives in separate blocks; labelled "Management projections" | C: management supplied a budget or forecast (Q14) | WU "Summary P&L Forecast" without its valuation blocks |

#### S10. Transaction process (A, 2 pages)

| ID | Page | Exhibits | Data required |
|---|---|---|---|
| S10.1 | Transaction overview | L4: what is for sale (assets or stock), owner transition offer, real estate arrangement, employees, structure preferences stated neutrally | Notes, `entity_type` |
| S10.2 | Process and next steps, contact | ICP1 eight-stage table with target timing; contact block (2.9) | Process dates |

Never in the CIM: valuation, asking price, multiples, recommended offer structure (D5). Those belong to the model's Valuation and Deal Structure tabs and to an optional buyer-directed ICP (Q4).

#### S11. Appendix (A: S11.1; others C)

| ID | Page | Content | Status |
|---|---|---|---|
| S11.1 | Basis of preparation and definitions | Sources used and their precedence; periods and fiscal year-end; revenue basis (gross or net); margin denominator; unaudited status; definitions of Reported EBITDA, Adj. EBITDA, SDE, PF Adj. EBITDA, LTM, PF, GDR, NDR and every KPI shown | A |
| S11.2 | Detailed income statement (annual and monthly) | Full mapped P&L | C: monthly data or > 22 lines |
| S11.3 | Detailed retention and cohorts | Segment tables moved out of the body | C: S4.2 or S4.3 built |
| S11.4 | Coded customer list | Coded, no names | C: ≤ 60 customers |

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

Every figure in a title, bullet, table or chart is read from a named output of the one model run (5.13) and formatted by one function. The QA step re-extracts every number from the deck and checks it against the model. AMB's documents disagree with themselves (Steady-State Adj. EBITDA shown as $449K, $469K and $551K across three documents; ICP5's "38K units" against 35,737 and 33,372 on later pages: R-DEL §6.6, R-BRAND §6.9). That must be impossible by construction.

---

## 5. Model template spec

The model is AMB's diligence workbook, rebuilt clean. Keep AMB's sheet anatomy, colour code, formats and recast logic [V51]. Fix its defects: one palette, one font name, no hard-codes over links, bounded periods, a master check, print furniture, and no `TODAY()`. The existing rule in `CLAUDE.md` still holds: **every formula the writer emits is mirrored in `src/model/engine.ts` and verified by `verifyWorkbook`**, so each new tab below arrives with its engine counterpart and tests.

### 5.1 Tab architecture and order

Outputs first, then analysis, then data behind a divider (Keep: V51 order; TPL "answer → evidence → raw data"). Output and analysis tabs have **no tab colour** (Keep: V51 colours only dividers and exceptions).

| # | Tab | Status | Contents | Precedent |
|---|---|---|---|---|
| 1 | `Cover` | A | 5.12 | V51 Cover |
| 2 | `Contents` | A | Hyperlinked index (`# \| Tab \| Purpose \| Units \| Check`), model information block, master Print switch, master check, version log | New (R-MOD §10, R-TPL §9 item 14) |
| 3 | `Summary` | A | One page of tables: FY / LTM / PF key lines; condensed EBITDA ladder; KPIs; valuation range. No tiles | V51 Offer Overview idea; R-MOD §10 |
| 4 | `Assumptions` | A | Every input, blue, each with a `Source` column: as-of date, LTM end month, fiscal year-end, units, customer term, owner replacement salary and burden, tax rate by entity type, PF methods, projection drivers, valuation multiples, deal terms | Elevate: V51 scattered inputs; bot's existing Assumptions tab |
| 5 | `P&L Summary` | A | "Historical P&L Summary ($000s)": the period layout (5.2), revenue lines, gross profit, expense buckets, Reported EBITDA, Net income, KPI block, `Check` row | V51 P&L Overview; TPL P&L Summary |
| 6 | `Adj. EBITDA` | A | The ladder (5.4) with refs, margins, SDE, a `Basis` column | V51 recast; TPL Summary |
| 7 | `Adjustments` | A | The schedule (5.3) | New (R-MOD §9.4 item 18) |
| 8 | `Revenue Detail` | A | Revenue by line: $, % growth, % of total; recurring vs non-recurring | V51 Revenue Analysis |
| 9 | `Expense Detail` | A | Cost of revenue and expense buckets: $, % of revenue, % growth; gross margin | V51 Expense Analysis |
| 10 | `Customer Overview` | C: customer list | Mix by type, size band, geography | V51 Client Overview |
| 11 | `Customer Retention` | C: ≥ 2 years of customer dates or revenue | Count and $ roll-forwards, GDR, NDR, churn, median banner | V51 Client Retention / $; TPL |
| 12 | `Concentration` | C: revenue by customer | Top 20, coded, cumulative share | V51 Client Concentration |
| 13 | `Cohorts` | C: ≥ 3 annual cohorts | Count and revenue triangles | TPL Cohort Analysis |
| 14 | `Headcount` | C: payroll register | By department: count, comp, % revenue, tenure, load ratios; retention roll-forward | V51 Employee Overview / Retention |
| 15 | `Balance Sheet` | A when any balance sheet exists | Condensed balance sheet, year-ends and LTM month-end, `Check` row (A = L + E) | Bot's existing BS tab |
| 16 | `NWC` | C: ≥ 2 balance sheets | 5.6 | New |
| 17 | `Debt-Like Items` | A with a balance sheet | 5.6 | New |
| 18 | `Cash Flow` | A with ≥ 2 balance sheets | Historical indirect cash flow, capex, free cash flow, cash conversion | Bot's existing CF tab |
| 19 | `Proof of Cash` | C: bank statements or CSV | Monthly P&L revenue vs bank deposits (excluding transfers, loans, owner contributions); variance $ and %; flag above 5% | New (R-TPL §4.6) |
| 20 | `Projections` | A | Five-year driver-based IS / BS / CF, every cell a formula on `Assumptions` | Bot's existing projection |
| 21 | `Opportunities` | C: levers in notes | One sizing grid per lever (feeds S9.1) | WU Coral and Dil-CPM grids |
| 22 | `Valuation` | A | 5.5 | V51 Earnings Sensitivity; SUN; ACQ |
| 23 | `Deal Structure` | A | 5.5 | VAL; CORAL; CPM S&U |
| 24 | `Sensitivities` | A | Two-way grids (5.5) | V51 Partnership Sensitivity Tables; SUNPDF |
| 25 | `Checks` | A | 5.7 | New (R-MOD §7 gaps) |
| 26 | `Data -->` | A | Empty divider, tab colour `7B0000` | Keep: V51 `Raw Data -->` divider idea |
| 27 | `Monthly P&L` | A when monthly data exists | Category-level monthly grid: the engine every period column reads | V51 P&L Forecast grid P:AT |
| 28 | `Databook` | A | Account × period grid with mapping columns (5.2), tie-out block | V51 Combined P&L; TPL Detail_PL |
| 29 | `Mapping` | A | Account → AMB category → summary line → "Personal?" tag → source; overrides from `mapping-overrides.csv` marked | V51 "Summary Account" and "Personal?" columns |
| 30+ | `Raw - P&L FY2025`, `Raw - BS FY2025`, `Raw - Bank`, `Raw - Customers`, `Raw - Payroll` | A per source | Values only, as exported; gridlines on; freeze below headers; tab colour `A6A6A6` | Keep: V51 Raw tabs |

**Tab rules.** Names ≤ 20 characters, Title Case, spelled correctly, no person names, no version numbers, no "scrap" tabs (V51 had "Tennant View", "Randy's Valuation" and a mistitled chart tab: R-MOD §9.3). No hidden tabs. No external links. No defined names except the output names in 5.13 (V51 carries 52 names, all `#REF!`; TPL carries 40,571: R-MOD §6.5, R-TPL §8). Target-supplied data packs are never pasted in with their own styles; they are restyled or kept as `Raw -` tabs.

### 5.2 Period layout

**Standard column layout** for `P&L Summary`, `Adj. EBITDA`, `Adjustments`, `Revenue Detail`, `Expense Detail` (Keep: V51 P&L Overview and P&L Forecast):

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
- **PF column** = LTM plus the pro forma adjustments mapped to that line on `Adjustments` (5.3). Each PF-affected line shows its method in column Q using AMB's phrasing: "Annualized most recent month", "Trailing three months × 4", "Active employee roster", "Assuming no material change", "Conservative approach for nonrecurring items" (Keep: V51 PF rationale column D).
- **Missing data is omitted, not zeroed.** Without 12 or more months of monthly data, the YTD and LTM blocks are left out and the Summary states "Full fiscal years only". The current bot's limit (README "Known limits") becomes this rule.
- **Units.** $000s on analysis tabs (Databook divides raw dollars by 1,000, Keep: V51). Unit-level tabs state `($)`, `(#)` or `(#, $)`.
- **Grouping.** Monthly columns on `Monthly P&L` and `Databook` are grouped (outline level 1) so the summary view collapses. Mapping columns on `Databook` are grouped (Keep: V51 Combined P&L C:D).

**Databook mapping columns** (Keep: V51 Combined P&L; TPL Detail_PL): `Account (as exported) | Source | AMB Category (IS_CATEGORIES in src/domain/financials.ts) | Summary Line | Personal? ("(+) Owner vehicle") | Adjustment Ref`. Period columns follow. A tie-out block below compares Databook to each raw tab for every subtotal and period: `Databook ($) | Raw ($) | Diff ($) | Status` returning "TIES OUT" or "CHECK" at a $1 tolerance (Keep: V51 rows 120–166).

### 5.3 Recast and adjustments schedule (`Adjustments`)

One row per adjustment. Every ladder row on `Adj. EBITDA` sums from here; nothing is typed on the ladder.

| Col | Header | Content |
|---|---|---|
| B | Ref | Formula-numbered by tier: `="["&CHOOSE(MATCH(D8,{"Definitional","Normalization","Owner compensation","Pro forma","Memo"},0),"D","N","S","PF","M")&COUNTIF($D$8:D8,D8)&"]"` (or an equivalent that `verifyWorkbook` can evaluate). Inserting a row renumbers every ref (Keep: CPM hidden-counter bracket numbering) |
| C | Adjustment | Client-grade label without sign prefix ("Owner vehicle and phone") |
| D | Tier | `Definitional` / `Normalization` / `Owner compensation` / `Pro forma` / `Memo` |
| E | Category | `Interest`, `Taxes`, `D&A`, `Personal / discretionary`, `Non-recurring`, `Non-operating`, `Accounting (cash to accrual, out of period)`, `Related-party (rent to market)`, `Owner compensation`, `Replacement cost`, `Run-rate`, `Other consideration` |
| F | Basis | One sentence: mechanism → quantum → source ("Removes the owner's personal vehicle lease and fuel, $18K in FY2025, per general ledger detail.") (Keep: TPL definitions panel style) |
| G | Source document | "GL detail, account 6420"; "Seller add-back list"; "Lease agreement" |
| H | Evidence | `Documented` / `Management representation` |
| I | Status | `Proposed` / `Supported` / `Accepted` / `Excluded` |
| J | In CIM | `=I="Accepted"` |
| K | P&L line | For pro forma rows: the P&L line the adjustment adjusts (feeds the PF column) |
| L | PF method | For pro forma rows: "Annualized most recent month", "Contracted", "Active employee roster" |
| M | Spacer | 0.9 |
| N:… | Periods | FY-2, FY-1, FY ‖ YTD PY, YTD CY ‖ LTM PY, LTM CY, PF, in the standard layout. Sign: positive increases EBITDA |
| After periods | Monthly | Optional monthly amounts where the add-back comes from the Databook "Personal?" tag (SUMIFS), so LTM and YTD are exact |

**Where rows come from**

| Source | Tier / category | Status on creation |
|---|---|---|
| Interest, taxes, D&A from the P&L | Definitional | Accepted |
| `addbacks.csv` `type = owner` | Owner compensation | Proposed |
| `addbacks.csv` `type = discretionary` | Normalization / Personal / discretionary | Proposed |
| `addbacks.csv` `type = non_recurring` | Normalization / Non-recurring | Proposed |
| `addbacks.csv` `type = other` | Normalization, category left blank and flagged in `open-questions.md` | Proposed |
| Bot-flagged likely add-backs (`merge.ts` suggestions) | Normalization | Proposed, amount 0 until an advisor enters it |
| `owner_comp` category, all periods | Owner compensation `[S1]` (add back) | Accepted |
| `owner_replacement_salary` (REQ, default $85,000) × (1 + burden, default 15%) | Owner compensation `[S2]` (deduct) | Accepted |
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
- AMB's buy-side tiers map as: Adj. EBITDA (personal add-backs) ≈ Reported + N; Near-Term Adj. EBITDA ≈ PF Adj. EBITDA; Steady-State ≈ PF Adj. EBITDA + Memo items (D6; R-MOD §3.3).

### 5.5 Supporting analyses, valuation and offer structure

**Supporting analyses** (row structures, verbatim where AMB has them):

- **Customer Retention.** Count block: `Starting Count | (+) New Customers | (–) Lost Customers (split by reason where known) | Ending Count | Avg. Customers | New Customer Growth | Customer Churn` (churn = losses ÷ average customers). Dollar block: `Starting Revenue | (–) Churn | (–) Downsell | (+) Upsell | (+) New | Ending Revenue | Gross Dollar Retention | Net Dollar Retention`. Columns FY…, YTD, LTM; monthly strip on the right. Median banner over the history columns (Keep: V51 Client Retention; TPL adds GDR and NDR, which V51 lacks: R-MOD §9.4 item 22).
- **Concentration.** `Code | Revenue | % of Total | Cumulative % | Tenure (Yrs.) | Type`, then `Top 20 | (+) Remaining | Total` (Keep: V51 / PACK p16). Tenure is never negative (V51 shows −0.1 years for C-323: R-MOD §9.1).
- **Headcount.** `Department | Count | Total Comp | Avg. Comp | % of Revenue | Avg. Tenure`, load ratios (customers or jobs per employee), and the employee roll-forward (Keep: V51 Employee Overview, Employee Retention; WU Department Overview).
- **Ranges are dynamic.** Every COUNTIFS and SUMIFS over a list uses whole columns or a structured table, never `$B$4:$B$310` (V51 truncates silently when the list grows: R-MOD §9.1 item 6).

**Valuation** (internal; never in the CIM, D5)

- Method by mode. Main Street: SDE × multiple. LMM: Adj. EBITDA × multiple. Services businesses add a revenue-multiple cross-check (Keep: V51 "Total Valuation is calculated as 1.0x run-rate July'26 recurring revenue", cross-checked to 7.0x EBITDA; SUN laundromat at SDE × 3.0x).
- Inputs: Low / Mid / High multiples, blue, each with a `Source` ("ACQ median 1.14x revenue, n = 3,824" for accounting firms; otherwise the comps source Frank licenses, Q15).
- Output table: `EV (Low / Mid / High) | x Reported EBITDA | x Adj. EBITDA | x PF Adj. EBITDA | x SDE | x LTM Revenue` (Keep: CPM S&U "x LOI EBITDA | x Adj. EBITDA | x PF EBITDA").
- EV-to-equity bridge: `Enterprise Value | (–) Funded Debt | (–) Debt-Like Items | (+) Cash (if delivered) | (±) NWC Delivered vs. Peg | Equity Value to Seller`.
- When ACQ applies (accounting and bookkeeping practices), a comps block shows median, IQR and n by size band, computed live from a `Raw - Comps` tab. ACQ is never linked externally.

**Deal Structure: one engine** (Elevate: V51 carries four disagreeing partnership models, R-MOD §9.2 item 10)

- Inputs: purchase price (link to Valuation Mid, or override in blue with a note), cash at close %, seller note (principal %, term, rate, amortization, standby), earnout (metric, measurement year, target, threshold %, payout at threshold, cap), equity rollover %, SBA 7(a) or senior loan (loan-to-value, term, rate), buyer equity, transaction fees, NWC peg. Every structure (all cash, cash + note, cash + earnout, rollover) is a setting, not a copy.
- **Earnout payout** (Keep: VAL formula): `=IF(Actual<Threshold,0,MIN(Cap,PayoutAtThreshold+(1−PayoutAtThreshold)×(Actual−Threshold)/(1−Threshold)))` on actual ÷ target.
- **Sources & Uses** (Keep: CORAL two-panel; CPM multiples): Uses `Purchase Price (EV) | Transaction Fees | Working Capital Funding | Total Uses`; Sources `Senior / SBA Loan | Seller Note | Rollover Equity | Buyer Equity | Total Sources`; columns `$ | % Total | x Adj. EBITDA | x PF Adj. EBITDA | x SDE`; key totals with thin top and double bottom borders on `FFFFCC`; a red `Check: Sources less Uses` row.
- **Seller proceeds** (Keep: CORAL Proceeds, with its italic Notes column): `Purchase Price | (–) Debt Payoff | (–) Debt-Like Items | (±) NWC True-Up | (–) Transaction Expenses | (–) Seller Note (deferred) | (–) Escrow / Holdback | Closing Cash to Seller | (+) Seller Note Principal | (+) Expected Earnout | Total Consideration`. After-tax proceeds only on Frank's instruction (Q22), with OPP3's tax disclaimer.
- **Buyer debt service**: annual debt service (`-PMT()`), **DSCR** = (PF Adj. EBITDA − maintenance capex) ÷ debt service; Main Street DSCR on SDE less the replacement salary (Keep: SUN financing and DSCR). DSCR below 1.25x is flagged, not coloured.

**Sensitivities.** Two-way grids as explicit formulas, never Excel data tables (`verifyWorkbook` must evaluate them). Axes centred on the base case, with midpoint and step inputs in a settings block, and deduplicated axes (Keep: V51 settings block; fix CPM's duplicate axis values: R-TPL §8 item 2). The base cell has a 1 pt `7B0000` box and bold figures; the heat map uses the ordinal ramp in 2.6 (Elevate: V51's 10-band green ramp `63BE7B`–`E6F4EA`). Standard grids: EV at multiple × Adj. EBITDA; DSCR at price × interest rate; seller proceeds at price × cash-at-close %.

### 5.6 Net working capital and debt-like items

**`NWC`** (New; no AMB or TCC precedent: R-TPL §4.6, R-WU §6.6)

- Rows: `Accounts Receivable | Inventory | Prepaid & Other Current Assets | Total Current Assets (ex. Cash) | Accounts Payable | Accrued Liabilities | Deferred Revenue | Customer Deposits | Total Current Liabilities (ex. Debt) | Reported NWC | (–) / (+) Adjustments (shareholder loans, income taxes, current portion of debt, related-party balances) | Adjusted NWC | % of LTM Revenue | DSO | DIO | DPO`.
- Columns: each month-end available (or quarter-ends, or year-ends with a note), then `T12M Average` as the **indicative peg**, then `Latest`.
- An `Asset sale treatment` input (Q17) sets which lines transfer; excluded lines show `n.a.` in the "Transfers" column.
- Checks: every line ties to `Balance Sheet`.

**`Debt-Like Items`** (New)

- `Item | Balance at latest month-end | Treatment (Debt / Debt-like / NWC) | Source | Status (Confirmed / Estimated / Open)`.
- Standard list: funded bank debt, lines of credit, SBA loans, vehicle and equipment loans, capital leases, shareholder loans, accrued interest, unpaid bonuses and payroll taxes, accrued income taxes, deferred revenue and customer deposits (per the treatment input), deferred capex, aged payables over 90 days, PPP or EIDL balances, related-party payables, known litigation.
- Totals feed the Valuation EV-to-equity bridge and the Seller proceeds waterfall.

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

Rules: line items indent with `indent = 1`, never leading spaces (R-TPL §7.6). Signed labels use a hyphen in the model ("(-) Market Replacement Compensation", matching V51) and an en dash in the CIM.

### 5.9 Colour code and the Print toggle

- Font colours exactly as 1.2's model tokens: **blue input, green cross-sheet link, purple in-sheet link, black calculation, red pending (roman) or check (italic), grey helper** (Keep: V51, TPL). The rule is enforced by the writer: a constant in a formula tab is blue; a formula referencing another sheet is green; a formula that is only `=C7` on the same sheet is purple. V51 breaks this 106 times (blue formulas) and CPM types values in green (R-MOD §6.3, R-TPL §8 item 7); the writer must not.
- **Inputs are blue font on no fill.** The current bot fills inputs yellow and its README tells the advisor to "adjust the yellow cells"; both change.
- **Print toggle** (Keep: V51, TPL). Each output tab has the text "Print" and a boxed blue 0/1 cell at the right end of row 3. A conditional format over the tab's data range, `=$X$3=1`, sets the font colour to automatic, so a PDF export shows no colour coding. **Elevate:** each tab's toggle cell defaults to `=Contents!PrintMode` (green), so one master switch on `Contents` flips every tab; typing a 0 or 1 over a tab's cell overrides it.

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
| Multiple, 2 dp (MOIC) | `0.00\x;\(0.00\x\);"–"` | V51 |
| Month header | `[$-409]mmm-yy;@` | TPL |
| Date | `mm/dd/yy` (one variant only; V51 has three) | V51 |
| Funds flow (cents) | `[$$]#,##0.00;\([$$]#,##0.00\);"–"` | CORAL |
| Check | `#,##0.000;\(#,##0.000\);"–"` (so tiny differences show) | New |
| Raw tabs only | `_(* #,##0_);_(* \(#,##0\);_(* "-"??_);_(@_)` | V51 raw exports |

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
- Landscape when the tab has more than 8 value columns, otherwise portrait. Fit to 1 page wide, as many tall as needed (`fitToHeight = 0`).
- Print titles: rows 5:6; column B on grouped monthly tabs.
- Margins (in): left and right 0.50, top 0.60, bottom 0.70, header and footer 0.30. Centre horizontally.
- Footer: left `AMB Advisory Services | Strictly confidential`, centre `&A`, right `Page &P of &N`. Header: right `<code_name> | As of <mm/dd/yy>` written as static text by the bot (New: no AMB or TCC tab has headers or footers: R-MOD §6.5, R-TPL §7.8).
- Comments do not print. Every output tab is rendered to PDF in QA, and any page cut at the right margin fails the build (V51 Earnings Sensitivity and chart tabs are cut off: R-MOD §9.3).

### 5.12 Cover and Contents

**Cover** (Keep: V51 / VAL / SUN cover, identical across AMB files; R-MOD §8, R-TPL §7.7). Landscape, fit to page, print area `B2:Q39`, gridlines off.

| Cells | Spec |
|---|---|
| B2:Q2 | Solid fill **`9E0A20`** (was `990033`, D1), row height 13.5 |
| B4:Q4 | Medium black top border; row height 6 |
| E23:N23, E28:N28 | Thin black rules framing the title block |
| B24 | Business name (internal version) or `code_name` (buyer version, Q20), Arial 26 Bold, centre across B:Q (not merged) |
| B25 | Document type, Arial 20 Bold Italic: "Financial Model" |
| B26 | `="As of "&TEXT(AsOfDate,"mm/dd/yy")`, Arial 18 Italic. **Never `TODAY()`** (Fix: V51) |
| B30 | "Prepared by AMB Advisory Services \| Strictly confidential", Arial 9 Italic, centre across B:Q |
| B38:Q38 | Medium black top border |
| B39:Q39 | Solid fill `9E0A20` |
| Logo | `amb-logo-maroon-2048.png` scaled to about 2.1 in wide, anchored at N33 to Q37 (Keep: V51 bottom-right placement) |
| Seller's logo | Optional, centred in rows 8–21, only in the internal version |

**Contents** (New)

- Row 2 title, row 3 "Contents".
- Index table from row 5: `# | Tab | Purpose | Units | Check`. The tab name is a hyperlink (`=HYPERLINK("#'P&L Summary'!A1","P&L Summary")`); `Check` shows "OK" or "CHECK" for that tab's checks.
- Model information block to the right: Business name, Code name, Prepared by, As-of date (link), LTM period, Fiscal year-end, Source used per year (from the merge step), Version, **Print mode** (blue 0/1, the master switch), **Master check**.
- Version log below: `Version | Date | Prepared by | Change`. The file name keeps AMB's `vNN` suffix (Keep: V51 naming, R-MOD §2.3); the log records what changed (V51 has 51 versions and no log).

### 5.13 Named outputs for the CIM

The only defined names in the workbook. The CIM reads every figure through these (plus the period tables they point to), so text and exhibits cannot drift from the model.

`AsOfDate`, `FYEMonth`, `PrintMode`, `MainStreetMode`, `Rev_FY`, `Rev_LTM`, `Rev_PF`, `GP_FY`, `GP_LTM`, `RepEBITDA_FY`, `RepEBITDA_LTM`, `SDE_FY`, `SDE_LTM`, `AdjEBITDA_FY`, `AdjEBITDA_LTM`, `PFAdjEBITDA`, `Customers_Latest`, `Top10Share_LTM`, `GDR_LTM`, `NDR_LTM`, `Headcount_Latest`, `NWC_Peg`, `MasterCheck`. `_FY` names refer to the row across the FY columns; the engine exposes the same values under the same keys.

### 5.14 What the current bot must change

| Current (BOT) | Change to |
|---|---|
| Model header fill navy `FF1F3A5F`; key fill yellow `FFFFFF00`; format `$#,##0;($#,##0);"-"`; input cells filled yellow; navy and amber tab colours (`workbook.ts` lines 19–25, 246–247) | `7B0000` / `FFE1E1` / `FFFFCC`, AMB formats (5.10), blue-font inputs, no tab colours |
| Tabs: Cover, Assumptions, IS, Recast, BS, CF, Valuation, Checks, Source | Architecture in 5.1 |
| CIM palette navy `13294B` + brass `B8862B`; Cambria titles and Calibri body (`deck.ts` lines 29–40) | Palette 1.2; Georgia titles and Arial body |
| Letter-spaced caps kickers: "01 · EXECUTIVE SUMMARY" and the cover's "CONFIDENTIAL INFORMATION MEMORANDUM" (`charSpacing` at `deck.ts` lines 93, 132, 214, 374); 28 pt titles | Footer tracker; sentence case; 20 pt action titles |
| `numberBadge()` ellipses (line 107), `card()` rounded rectangles (line 119), cover circles (line 127) and tagline (line 140) | Removed (2.10 T1, T2, T5) |
| Fixed 10 pages, "one idea per slide" | Section library and variable-length rule (3.3–3.5) |

---

## 6. Open questions for Frank

The references leave these ambiguous. Each has a default the build will use until he answers.

| # | Question | Default until answered | Why it is open |
|---|---|---|---|
| Q1 | Approve **`7B0000`** as the one working maroon for CIM and model, and **`9E0A20`** replacing `990033` on model cover bars and any document band? | Yes (D1) | AMB uses 11 reds; `990033` came from TCC's theme (R-BRAND §3) |
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
| Q16 | **Deal Structure defaults**: SBA 7(a) terms (term, rate, equity injection), standard seller-note terms, AMB's success-fee schedule for the proceeds waterfall | Blue inputs left blank and flagged | Only SUN's one-off financing terms exist |
| Q17 | **NWC convention**: cash-free, debt-free with a normalized NWC peg, or (typical in Main Street asset sales) the Seller keeps receivables and payables and inventory transfers? | Asset sale: inventory and deposits transfer; AR/AP retained | No AMB precedent at all |
| Q18 | Will the **model** be shared with buyers? If so, which tabs (a "buyer data pack" export)? | Internal only | V51 has an internal and a "Target Version" P&L |
| Q19 | **Print toggle**: one master switch on Contents with per-tab override? | Yes (5.9) | AMB sets it per tab |
| Q20 | **Model cover**: business name or code name; seller's logo shown? | Business name internally; code name in any buyer version; no seller logo | V51 shows the target's logo |
| Q21 | Deliver the CIM as **.pptx only, or .pptx plus PDF**? | Both; the PDF exported from PowerPoint so Georgia embeds | LibreOffice lacks Georgia |
| Q22 | Compute **after-tax seller proceeds** by entity type in the model? | No; pre-tax, with OPP3's tax disclaimer | Tax work sits outside AMB's scope per OPP3's disclaimer |
| Q23 | Does AMB hold **industry benchmark datasets** (peer margins, labor ratios) the CIM may cite? | No benchmarks unless supplied and sourced | The write-ups used TCC's member-company data, which is not AMB's |
| Q24 | Should the **Market** section (S3) appear only when AMB supplies sourced data? | Yes | The write-ups' market inputs carry no sources (R-WU §6.2) |
| Q25 | **Date style**: cover month and year ("October 2026") in the CIM, and "As of mm/dd/yy" in the model (AMB's form)? | Yes | AMB covers use "As of 09/15/26" |
