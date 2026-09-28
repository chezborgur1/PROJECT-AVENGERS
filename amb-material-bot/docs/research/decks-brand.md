# AMB brand identity, deck conventions and the ICP template

Slice: decks, ICP template, brand identity. Sources (read-only, under `references/`):

| File | What it actually is |
|---|---|
| `01 Playbooks & Templates/Template Diligence Kick-Off Deck.pptx` | 13-slide buy-side diligence kick-off deck. **Built on The CAM Collective's ("TCC") PowerPoint theme, not AMB's.** AMB contributed only the cover slide and logo. |
| `ICP Template/AMB Advisory - ICP Example.pdf` | 9-page Acrobat export (PDFMaker 26, 16 Jul 2026) of the "vPasted" docx. Only render with the true fonts embedded (Times New Roman, Arial, Aptos). |
| `ICP Template/AMB Advisory - ICP Example v5.docx` | Final native Word version of the 9-page example, revision 377, last saved by Frank Moneymaker 16 Jul 2026. |
| `ICP Template/AMB Advisory - ICP Example vPasted.docx` | Same as v5, except the Key Statistics metric table is pasted as a 980x632 px screenshot (to freeze its green/red borders). The PDF was made from this one. |
| `ICP Template/_Archive/… v1/v2/v3.docx` | v1 = 21-page fill-in-the-blanks CIM template (13 Jul 2026). v2 = cut to 9 pages, half example, half placeholders. v3 is almost identical to v5. |

**ICP = "Initial Client Prospectus"** (the cover title). See section 6 for what it is for.

Environment note: LibreOffice here was Impress/Calc only, so .docx could not render. I installed `libreoffice-writer` with apt, and `soffice.py --convert-to pdf` now works for .docx too. The renderer has no Aptos, Times New Roman, Georgia or Calibri. It substitutes Liberation/DejaVu, so line breaks in docx renders differ slightly from the Acrobat PDF.

---

## 1. Summary

1. **The logo is the only consistent brand element.** It is a single-colour crimson **#9E0A20** mark: a stylised "A/M" monogram crossed by a rising arrow, with a condensed heavy wordmark "AMB" and "ADVISORY SERVICES" below. The best source is a 1099x375 transparent PNG inside the ICP docx. It is now in `brand/` (section 2).
2. **AMB has no colour system.** Across the deck, the ICP and the workbooks I count 11 different reds and maroons: 9E0A20, 990033, 7B0000, 5B312B, 8C4A43, 54001C, 820033, B70033, 98002F, C00000 and 3D1E1A. The ICP headings are a **brown** (#5B312B) that does not match the crimson logo. The ICP even recolours the header logo brown to match. The Word theme is untouched stock Office 2023 (Aptos, blue accents). The PowerPoint theme belongs to TCC.
3. **Typefaces split by medium.** The deck and workbooks use Arial. The ICP uses Times New Roman (body 11 pt, tables 10 pt). Exhibits in the ICP are Excel screenshots in Arial, and the one native chart uses Aptos. So a single ICP page carries three typefaces.
4. **The kick-off deck is TCC's template with an AMB cover.** Master "TCC Theme v2", colour scheme "CAM Collective", TCC logo in the master footer, target's logo (Spinnaker) top-right. Shapes are named "Google Shape;…", so it started in Google Slides. It is 4:3 (10 x 7.5 in) with 32 pt bold maroon two-line titles. **Nothing in its master should be reused.** Two things are worth keeping: its action-title habit ("Process: We should be in position to close by the end of November") and its table style on slide 4 (maroon rule under the header, dotted hairline row rules, no fills, no vertical rules).
5. **The ICP is AMB's real CIM precedent**, and its content architecture is good: Executive Summary → Business Overview → Financial Summary → Customers → Employees, plus Valuation & Structure Rationale, Recommended Offer Structure and Reason for Sale. It also has a "Metric / Value / Notes / Valuation Impact" table that answers "so what?" for each metric. The execution is Word-default and amateur: screenshots of Excel at 96–180 dpi, a stat-tile KPI band, green/red cell borders as the only signal, empty headings used as spacers, and numbers that do not reconcile across pages.
6. **v1 of the ICP holds reusable CIM furniture:** a 7-part disclaimer, an 8-step "Process & Next Steps" table, and a contact block (AMB Advisory Services LLC, ambadvisoryservices.com, info@ambadvisoryservices.com, Tampa, Florida, 813.364.2178). All of it was dropped from v2 onwards.

---

## 2. Logo assets written to `amb-material-bot/brand/`

| File | Pixels | Provenance | Notes |
|---|---|---|---|
| `amb-logo.png` | **1099 x 375**, RGBA | Byte-for-byte copy of `word/media/image1.png` from ICP v5 (the same file is in every ICP version) | Full-colour, transparent background (64% transparent pixels). Ink bounding box x 74–1072, y 24–348, so there is ~24–74 px of built-in padding. Single flat colour **#9E0A20** (141k px; only anti-aliasing varies). On the ICP cover it prints at 4.95 x 1.69 in, which is 222 dpi. |
| `amb-logo-white.png` | 1099 x 375, RGBA | **Derived** by me: same alpha channel, RGB set to FFFFFF | No white or reversed logo exists anywhere in the sources. Use it on deep-maroon covers and divider pages. Edges are clean because the anti-aliasing lives in the alpha channel. |
| `amb-logo-mark.png` | 457 x 347, RGBA | **Derived**: monogram only (source columns 74–506), 12 px transparent pad | For small furniture (page footer, favicon-sized uses) where the wordmark would be illegible. |
| `amb-logo-mark-white.png` | 457 x 347, RGBA | **Derived**: white version of the mark | |
| `amb-logo-workbook.png` | 550 x 184, RGBA | Written earlier by the models slice (from the workbooks) | Same artwork at half the resolution. Prefer `amb-logo.png`. |

Other logo instances I found. None of them should be used:

- **Kick-off deck `ppt/media/image13.png`: 502 x 171, opaque white box** behind the logo. Its ink is darker (#7C0D20/#780820) because it was recompressed or recoloured. It sits on the cover at 2.07 x 0.71 in.
- **ICP header `word/media/image2.png`: 168 x 61, opaque white, recoloured brown** (~#582820) to match the #5B312B headings, and full of JPEG artefacts. It prints at 1.29 x 0.47 in (≈130 dpi) in every page header and looks soft in the PDF. This is the most visibly amateur brand detail in the ICP.

Logo anatomy, for anyone recreating it. Monogram: a heavy slab "A" whose right leg becomes an "M" stroke, cut by a thin swoosh that ends in an up-right arrowhead, with an open arc over the top-left. Wordmark: "AMB" in a tall condensed heavy grotesque (Bebas Neue / Oswald-like). "ADVISORY SERVICES" sits underneath in the same condensed face, light-medium weight, spanning the width of "AMB". This face is not a system font, so never set text in it. Treat the wordmark as artwork only.

No vector (SVG/EMF/AI) version exists in the sources. For large print use (over ~4 in wide at 300 dpi) Frank should be asked for the original vector file.

---

## 3. Colour: what AMB uses today

### 3.1 Logo
| Hex | Use |
|---|---|
| **9E0A20** | The logo, 100% of its ink. RGB 158/10/32. White on it gives about 8.3:1 contrast. |

### 3.2 Kick-off deck (theme "TCC Theme v2", clrScheme name **"CAM Collective"**)
| Slot | Hex | Where it shows up |
|---|---|---|
| dk1 / lt1 | 000000 / FFFFFF | |
| dk2 | **44546A** | All body text and bullet text (cold slate grey-blue, Office 2013 default) |
| lt2 | E7E6E6 | |
| accent1 | **990033** | Titles (32 pt bold), bullets, 0.03 in label bars, table header rule, cover title |
| accent2 | **FF0000** | Italic title prefixes ("*The Squad:*", "*Process (cont'd):*"), pure red |
| accent3 | FFC000 | Not used on slides |
| accent4 | **54001C** | Row-label text, lightened with lumMod 90 / lumOff 10 to about #7F002A |
| accent5 / accent6 | 8908A6 / 0F996A | Not used on slides |
| hlink / folHlink | 0563C1 / 954F72 | |

Hard-coded on slides: **F2F2F2** fill with a **7F7F7F or 44546A 0.75 pt dashed border** (the "bottom line" boxes on slides 2, 4, 5, 7, 8, 9, 11, 12, 13). **FFCCCC** pink rounded "sticky-note" callouts with a 990033 0.75 pt border (slides 6 and 7). **D5DBE5** blue-grey panels (slide 7). **D8D8D8** 1.5 pt *dotted* table row rules. **98002F** curved-connector arrows. **A5A5A5** slide numbers.

The cover slats are FF7C80, B70033, 990033, 820033 and FF9999 at 20–85% alpha, with BEBEBE and D9D9D9 hairlines. The master also parks a set of labelled "HEX Codes" swatches just off the right edge of the slide (x = 10.28 in).

### 3.3 ICP (all hard-coded; the Word theme is stock "Office Theme" with Aptos and accent1 156082, unused)
| Hex | Role | Frequency in v5 |
|---|---|---|
| **2C2523** | Body text (docDefaults colour), a warm near-black | default |
| **5B312B** | Heading 1, cover title, KPI values, table header fill, 0.75 pt H1 rule | 11 text + 10 fills |
| **8C4A43** | Heading 2 (brick), italic owner-table text, placeholder text in v1 | 12 |
| **3D1E1A** | Cover codename line | 4 |
| **7A706D** | Secondary text: cover location, KPI captions, units note, footer | 18 |
| 7F7F7F | Running header "Initial Client Prospectus" | header |
| **C9A227** | Gold 0.75 pt rules above and below the cover title. In v1 also the rule under the "Confidential Information Memorandum" header. | 2 |
| **C2BAB8** | 0.5 pt cell borders on every table cell; footer top rule | 244 |
| **EAE6E4** | Label-column banding (alternating with FFFFFF) | 9 |
| **F5EDEC** | Every value cell; KPI band background | 57 |
| 4EA72E / EE0000 | Green and red 0.5 pt borders meaning "positively / negatively impacts valuation" | 77 / 23 |
| F2F2F2 | One stray cool-grey label cell ("Y/Y Revenue Growth Rate"), an inconsistency | 1 |
| C00000 | Line colour and markers of the one native chart (Excel default dark red) | chart |
| FFFFCC, CAEDFB | Yellow "key total" fill and light-blue highlight inside the pasted Excel exhibits (P&L, EBITDA bridge, retention tables). Off-brand. | screenshots |

### 3.4 Workbooks (from the models slice, `brand/amb-model-style.json`)
Header band 7B0000, cover bar 990033, section rows FFE1E1, totals FFFFCC.

**Conclusion:** the deck and workbook share **990033** because AMB's workbook cover bar reuses the TCC accent. The ICP went its own way with a brown family. Nothing is derived from the logo's 9E0A20.

---

## 4. Typography

| Medium | Headings | Body | Tables / exhibits | Notes |
|---|---|---|---|---|
| Kick-off deck | Arial Bold 32 pt (title placeholder, anchor centre, 990033) | Arial 14–16 pt, 44546A | Arial 12 pt (header bold 990033) | Theme major and minor fonts are both Arial. Calibri survives in two layout shapes. |
| ICP | Times New Roman Bold: H1 14 pt 5B312B (16 pt before, 3 pt after, 0.75 pt bottom border), H2 12 pt 8C4A43 (12 pt before, 3 pt after), H3 bold italic 11 pt | Times New Roman 11 pt, 2C2523, 3 pt before / 6 pt after | TNR 10 pt in native tables. Exhibits are Arial screenshots. The chart is Aptos 9 pt. | Cover: 20 pt bold title, 18 pt bold-italic codename, 12 pt italic location |
| Workbooks | Arial 13 pt bold sheet titles | Arial 9 pt | Arial 9 pt | Per the models slice |

The logo's condensed display face is not used for any text anywhere, which is correct.

---

## 5. Kick-off deck in detail

### 5.1 Format, master and layouts
- **Slide size 9,144,000 x 6,858,000 EMU = 10.00 x 7.50 in, "On-screen Show (4:3)".** 13 slides, 12 notes pages, all empty. Created by Jalen Ross on 27 May 2022. Last modified by Frank Moneymaker on 23 Sep 2026, revision 69.
- One master and 10 layouts: `2_Custom Layout`, `1_Standard`, `Standard`, `1_Comparison`, `2_Title Slide 2`, `2_Title Slide 3`, `Comparison`, `Standard2`, `Standard3`, `Title Slide`. Slide usage: slide 1 uses Title Slide; slides 2, 5 and 6 use 2_Custom Layout; slides 3, 4, 11, 12 and 13 use 1_Standard; slides 7–9 use Standard; slide 10 uses 1_Comparison.
- `2_Title Slide 2` is TCC's own cover: a full-bleed townhouse photo under a white wash, the TCC logo, and a strip of seven portfolio-company logos. `2_Title Slide 3` has a photo band along the bottom (townhouses, white picket fence). Neither is used.
- **Master furniture:**
  - Title placeholder at x 0.69, y 0.40, w 8.62, h 1.45 in. Arial 32 pt bold accent1, anchored to the middle.
  - Body placeholder at x 0.69, y 2.00, w 8.62, h 4.50 in. Level 1 is 16 pt bold dk2 with no bullet. Levels 2–3 are 16 pt dk2 with a "•" bullet in accent1, indented 0.5 / 1.0 / 1.5 in.
  - TCC logo in the footer, centred: 2.20 x 0.31 in at (3.90, 6.73).
  - Spinnaker (target) logo top-right, flush to the top edge: 1.61 x 0.44 in at (8.39, 0.00).
  - Slide number: Arial 10 pt A5A5A5, right-aligned in a box at x 6.22–9.31, y 6.64.
  - Footer placeholder bottom-left, **empty on every slide**. The `<p:hf>` flags are all 0: no date, no footer text, **no confidentiality line anywhere in the deck.**

### 5.2 Layout grid as rendered
- Content column: 0.69 in side margins, 8.62 in wide.
- The title band takes 0.40–1.85 in, which is **19% of the slide height**, for titles that almost always wrap to two lines.
- Recurring **"row" pattern** (slides 2, 5, 6):
  - Left label column, x 0.69, w 1.97 in: 16 pt bold maroon, centred, with an italic sub-label in quotes.
  - A 0.03 in (2.2 pt) accent1 vertical bar at x ≈ 2.67 in.
  - Bullets from x 2.77 in, w 6.66 in, 14–15 pt; the last bullet in each group is italic or bold-italic ("*Let's make sure the dates make sense*").
  - 3–4 rows of ~0.8–1.4 in each.
- A full-width **bottom-line box** at y 5.69, h 0.79 in: F2F2F2 fill, dashed border, 16 pt centred text ("Our goal is to conduct an efficient due diligence process *(and have fun while we're at it!)*…").
- Slide 10 uses three equal columns (2.77 in each, 0.15 in gutters): a header row, then an F2F2F2 question box in italics, then "Example sessions:" bullets. **The header row is a picture** (`image31.png`, 1294 x 113) of three words, not live text.

### 5.3 Title convention
**"Section prefix: headline sentence."** The prefix is red FF0000 regular italic and the headline is 990033 bold. Titles verbatim:

1. (cover) "Due Diligence Kick-Off", subtitle "*Introduction & Process Overview*"
2. "We're excited to be here!"
3. "*The Squad:* Putting a face to the names of our diligence team and partners"
4. "*The Squad (cont'd):* We're here to help and here's how we typically split work"
5. "*Process:* We should be in position to close by the end of November"
6. "*Process (cont'd):* Our meetings will usually follow one of these formats"
7. "*Check-ins:* We establish a regular cadence to discuss what's needed"
8. "*Check-ins (cont'd):* "Q&A Doc" is our go-to source for latest Q's and to-do's"
9. "*Check-ins (cont'd):* Our data room has everything we're working on"
10. "*Diligence Sessions:* Our sessions typically fall into three buckets"
11. "*Sessions (cont'd):* CDS team will be working on a review of the numbers"
12. "*Sessions (cont'd):* Our legal team will be reviewing company records"
13. "All that said…"

These are genuine action titles: each states the point, not the topic. That is a bank habit worth keeping. The red italic prefix is doing the job of a section tracker.

### 5.4 Tables (slide 4, the only real table)
- `a:tbl`, 4 columns at 1.24 / 2.78 / 3.00 / 1.60 in; header row 0.64 in, body rows 0.99 in.
- Header: 12 pt bold accent1 text, no fill, **1.5 pt accent1 bottom rule**.
- Body rows: 12 pt dk2, separated by **1.5 pt D8D8D8 dotted rules**.
- Vertical rules have alpha 0, so PowerPoint shows none. LibreOffice draws them black, which is a render artefact.
- Cells hold circular 0.55 in headshots.
- A dashed F2F2F2 box underneath lists "A Few Key Topics we will Cover During Legal Diligence:".

### 5.5 Cover (slide 1)
White field. Left edge: an 0.69 in maroon (820033) band. Right third: overlapping translucent trapezoid slats (FF7C80 / B70033 / 990033 / 820033 / FF9999 at 20–85% alpha) crossed by two thin grey lines. The shapes are named "bg object 16–26", which suggests they came from a PDF-to-PowerPoint conversion of a stock theme background.

Title "Due Diligence Kick-Off" is Arial 32 pt bold 990033, left-aligned at x 0.84, y 3.83 in. Subtitle is 20 pt italic 990033. The AMB logo sits at 2.07 x 0.71 in below the title, offset right (x 2.24), and is **not aligned to the title's left edge**. There is no date, no "Confidential", no client or codename, and no contact.

### 5.6 Tone (verbatim)
"We're excited to be here!", "*(and have fun while we're at it!)*", "The Squad", "CDS is our CPA squad!", "Debugging / "How do I do that again..?"", "Don't worry about the "messiness" of the data. Just find it and drop it in!", "That's it! Now that we're kicked off, we'll see you at our first check-in meeting!"

Warm, second-person and chatty. Right for a seller kick-off meeting; wrong for a CIM.

---

## 6. The ICP in detail

### 6.1 What the ICP is for
**"Initial Client Prospectus"** is AMB's short-form, confidential, **buyer-facing business profile for a sell-side client**: a CIM-lite or "first look" package, identified by a codename and client code. The evidence:

- The v1 template's disclaimer: *"This Confidential Information Memorandum ("CIM") has been prepared by AMB Advisory Services LLC ("AMB Advisory" or "Broker") on behalf of the seller identified herein ("Seller") solely for the purpose of providing preliminary information to prospective purchasers ("Recipient")…"*
- v1's contact block: *"To express interest or submit questions, please contact AMB Advisory Services… Note: All inquiries should be directed to AMB Advisory. Do not contact the Seller or its employees directly."*
- In v1 the running header switches midway from "Initial Client Prospectus" to "Confidential Information Memorandum".
- The client is anonymised: "Example Business Overview ("EBO")", "Client Code: EBO". v1 still leaks the real client's initials once ("CPM is based in St. Louis…"). The chart's external link also points to `…\Sellside Operations\ICP Template\Examples\CPM Diligence Workbook v25.xlsx`.
- It carries AMB's own valuation view and a **recommended deal structure** (asking price, cash at close, seller note, contingencies, stay-on) that buyers are expected to anchor on.

Some v2–v5 lines read as internal or diligence voice ("Note: We are waiting for seller confirmation on personal expenses", "We will need to discuss the likelihood and frequency of these capital projects"). So the 9-page example doubles as a working document shared with the seller or a friendly buyer. **For the bot, the ICP is the content template for the CIM; it is not a separate product.**

### 6.2 Page and grid
- US Letter portrait 8.5 x 11 in. Margins: top/bottom 0.75 in (1080 twips), left/right **0.875 in** (1260 twips). Text column **6.75 in**. Header distance 0.30 in; footer distance 0.49 in.
- One section per chapter, so each Heading 1 starts a new page. Tables run full width (9720 twips = 6.75 in).
- KPI band: 4 cells of 1.6875 in, with 6 pt top/bottom and 0.056 in side cell padding.

### 6.3 Cover (page 1)
- Two empty 15 pt-spaced paragraphs.
- Logo centred, 4.95 x 1.69 in.
- 0.75 pt gold (C9A227) rule.
- "**Initial Client Prospectus**", TNR 20 pt bold 5B312B, centred.
- 0.75 pt gold rule.
- "***Example Business Overview ("EBO")***", 18 pt bold italic 3D1E1A.
- "*St. Louis, Missouri*", 12 pt italic 7A706D.
- About 60% of the page is empty below.
- The footer, with page number "1", prints on the cover. v1's cover footer instead read "AMB Advisory Services · info@ambadvisoryservices.com · 813.364.2178".
- No date, no "Confidential" marking, no "Prepared by / Prepared for".

### 6.4 Page furniture
- **Header** (pages 2+): centred "Initial Client Prospectus" (TNR 10 pt, 7F7F7F) and a right-aligned logo (1.29 x 0.47 in, the brown 168 px bitmap). The logo's baseline and the header text do not align; the text sits about 0.25 in lower. In v1 the later pages use "Confidential Information Memorandum" (9 pt 7A706D) with a 0.75 pt gold rule under the header.
- **Footer:** 0.5 pt C2BAB8 top rule, then "AMB Advisory Services | Client Code: EBO" (8 pt 7A706D) on the left and a PAGE field centred on the page.
- **Section marker:** Heading 1 with a 0.75 pt 5B312B full-width underline. There is no running section name, no tracker, and no confidentiality line (the v1 disclaimer page was dropped in v2).
- The TOC is a Word field and **lists "Table of Contents" as its own first entry**.

### 6.5 Exact section structure
**v5 / PDF, 9 pages.** TOC entries: Table of Contents 2 · Executive Summary 3 · Business Overview 5 · Financial Summary 6 · Customers 8 · Employees 9.

- **Executive Summary**: *Business Overview*, *Key Statistics* (4-up KPI band plus a Metric / Value / Notes / Valuation Impact table plus a "Key:" legend), *Valuation & Structure Rationale*, *Recommended Offer Structure* (Deal Term / Details table), *Reason for Sale*.
- **Business Overview**: *EBO Description*, *Services Offered* (H3 *Core Association Management Services*, *Ancillary / Add-On Services*, en-dash bullets), *Service Area & Geography*, *Software & Technology Stack* ("Label: value" lines with the label in bold), *Ownership Structure* (table: Owner Name / Ownership % / Role / Post-Close Role).
- **Financial Summary**: units note, *Summary Income Statement* (Excel screenshot), 4 paragraphs of commentary, *Reported EBITDA to Pro Forma EBIDA Bridge* [sic] (screenshot), *Bid Job Income Revenue* (native line chart).
- **Customers**: *Customer Concentration* (Top-20 screenshot), *Client Retention Analysis* (screenshot).
- **Employees**: *Employee Overview* (screenshot), *Organizational Structure* (blurry screenshot of a hand-drawn org chart), *Employee Retention Analysis* (screenshot).

**v1, 21 pages.** It adds the following:

- **Disclaimer & Confidentiality Notice**: *No Representation or Warranty*, *Confidentiality Obligations*, *No Offer or Solicitation*, *Broker Disclosure*, *Third-Party Information and Financial Data*, *Return of Information*.
- **Business Overview**: adds *Business History & Milestones* and *Licenses & Regulatory*.
- **Financial Summary**: adds *EBITDA to SDE Bridge (Add-Back Schedule)*, *Revenue Mix*, *Revenue Trend Commentary* and *Key Financial Notes*.
- **Operations**: *Business Model Overview*, *Service Delivery Model*, *Facilities*, *Vendor & Contractor Relationships*, *Banking Relationships*.
- **Customers**: adds *Customer Overview*, *New Business Development* and *Contract Terms*.
- **Employees**: adds *Compensation & Benefits* and *Key Personnel Profiles*.
- **Market Overview**: *Industry Overview — Association Management*, *Local Market Analysis*, *Company Positioning*.
- **Growth Opportunities**: 8 numbered H2s, "1. Organic Client Growth — Sales & Marketing" through "8. Technology & Operational Efficiency".
- **Deal Overview**: *Transaction Summary*, *Valuation Basis*, *Ideal Buyer Profile*, *Financing Considerations*, *Process & Next Steps* (8 stages: NDA Execution, Initial Call, Buyer Q&A / IOI, Management Meeting, LOI Submission, Due Diligence, Purchase Agreement, Close & Transition), *Contact Information*.

Instructions to the author appear in brackets in 8C4A43 italics: "[ 2–4 sentence narrative overview: what the company does, who it serves, and where it operates. ]".

### 6.6 Table specs (native Word tables)
- **Header row:** 5B312B fill, white 10 pt bold TNR.
- **Label column:** bold 10 pt 2C2523, alternating EAE6E4 / FFFFFF fill.
- **Value cells:** always F5EDEC. Text is 10 pt *italic*; in the Metric table the values are bold-italic, and in the owner table the text is italic 8C4A43.
- **Borders:** every cell boxed in 0.5 pt C2BAB8. In the Metric table the rows are re-bordered 0.5 pt 4EA72E or EE0000 for positive or negative. Where a red row meets a green one the borders collide, which is why "vPasted" freezes the table as a screenshot.
- **Column widths (in):**
  - Metric table: 1.93 / 0.75 / 1.94 / 2.13
  - Offer table: 1.87 / 4.88
  - Owner table: 2.03 / 1.01 / 1.69 / 2.03
  - "Key" legend: 1.31 / 1.38
- **KPI band:** 4 borderless cells on F5EDEC. Value is 18 pt bold 5B312B ("$20M - $26M", "$8.9M", "$2.0M", "10.0x – 13.0x"); caption is 9 pt 7A706D ("Asking Price Range", "PF Dec'24 Revenue", "PF Dec'24 EBITDA", "EBITDA Multiple Range").

### 6.7 Exhibits and chart
- **Six Excel screenshots** at effective **96–179 dpi**. The P&L is 473 px wide stretched to 4.93 in, i.e. 96 dpi.
- They are Arial and model-styled: underlined section labels, **FFFFCC yellow key-total rows**, CAEDFB light-blue highlight boxes, a **red review box left around "899"** in the P&L, and yellow input cells in the EBITDA bridge.
- Each carries its own mini-title block ("EBO / *Historical P&L Summary ($000s)*", "*Top 20 Customer Overview ($000s)*"), so the Word H2 and the exhibit title repeat each other.
- **Native chart** ("Bid Job Income Revenue"): a line chart linked to `'P&L Charts'!K33:W34` in the external workbook.
  - Line and markers C00000 (circle markers, size 5), with data labels on every point in `[$$]#,##0;\([$$]#,##0\);"–";@`.
  - A legend at the bottom for a single series, no gridlines, no value axis, Aptos 9 pt.
  - No source line, no units in the title.

### 6.8 Phrasing (verbatim), with a verdict on each

**Good: specific, candid, numbers-led**
- "EBO is based in St. Louis, with offices in Columbia, Missouri and Chicago, Illinois. The company services 244 clients and 38K units, with 63 employees."
- "In the association management industry, EBO's valuation would trade at 10.0x – 13.0x earnings based on the company's $2M of PF Dec'24 EBITDA."
- "In terms of deal structure, EBO's significant customer concentration will likely lead to an offer with contingent payments based on retaining specific clients for a period of time (likely 1 – 2 years) post close."
- "Bid job income spiked in 1Q24 due to a significant capital project engagement with Brentwood (the largest client)… (estimated $250K EBITDA impact)."
- "Due to its size Brentwood averages ~$5M of deposits in bank accounts, which contributed meaningfully to earnings credit revenue… we estimate that Brentwood makes up 15-20% of overall earnings."
- Units and sourcing line: "*Note: All figures in USD thousands unless noted. Financials are as provided by Seller and have not been independently audited.*" Keep this.

**Generic: exactly the prose the owner wants gone**
- "Well-established business", "Platform-sized client base", "Proven growth engine increases future earnings expectations", "Indicates operational efficiencies"
- "EBO is a high margin organization", "driven by excellent employee and customer retention", "EBO has a strong leadership organization beneath the three sellers", "one of the leading HOA and condominium management firms"

**Internal voice leaking into a client document:** "Note: We are waiting for seller confirmation on personal expenses"; "We will need to discuss…".

**Typos and grammar:** "Pro Forma EBIDA Bridge"; "Maintenance revenue growth has driven largely from…"; v2 has "as they buyer identifies".

### 6.9 Numbers that do not reconcile inside the 9 pages
This is why the bot must source every figure from one model:

- Units: "**38K** units" in the Executive Summary, against 35,737 total units in the Top-20 exhibit and 33,372 average doors in the P&L KPI block.
- Revenue: "$8.9M PF Dec'24 revenue", against $8,670K Dec-24 total revenue in the P&L. No bridge from one to the other is shown.
- EBITDA: the bridge starts from "NOI $2,236", not the P&L's Reported EBITDA of $2,377. It ends at "TTM PF Adj. EBITDA $2,034", which matches the "$2.0M" headline.
- Growth: "Y/Y Revenue Growth Rate 28%" against 29% (Dec-24) in the P&L.
- Concentration: "Top 25 Client Concentration (% of EBITDA) 18%", against a Top-20 share of management fees of 37% and Brentwood alone at "15-20% of overall earnings".
- Retention: "5-Year Client Retention Rate 95%", against annual door retention of 97 / 92 / 96 / 96%.
- Geography: offices in "Chicago, Illinois", against "244 communities across Missouri".

---

## 7. Critique: what looks amateur

### Kick-off deck
1. **Wrong brand.** The master, theme, footer logo and colour scheme are TCC's. AMB appears only on the cover, and there as a white-boxed, off-colour bitmap.
2. **4:3 with oversized titles.** 32 pt bold, two lines, 19% of the slide height. Body text is 14–16 pt. The result is roughly 60–140 words per slide (1,790 words across 13 slides): kick-off density, not CIM density.
3. **Two competing reds** (FF0000 italic prefix against 990033 bold) plus cold slate body text (44546A) under a warm maroon brand.
4. **Box furniture:** dashed-border grey boxes on 9 of 13 slides, pink rounded sticky notes, blue-grey panels, curved connector arrows, circular headshots. It reads like a template, and the dashed boxes are a Word-art tell.
5. **Text as a picture** (the slide 10 header row), and a pasted screenshot of a Google Doc on slide 8.
6. **Stock-art cover.** Translucent pink slats and stray hairlines, the logo not aligned to the title, no date, no confidentiality marking.
7. **No page furniture:** the footer placeholder is empty, there is no "Confidential" line, no date, no source lines. The slide number sits in 10 pt A5A5A5 at the bottom right.

### ICP
1. **Colour drift from the logo.** Brown headings (5B312B / 8C4A43) with a crimson logo on the cover, and a brown-recoloured, 130 dpi, JPEG-artefacted logo in every header.
2. **Default Word typography.** Times New Roman 11 pt at 6.75 in measure. A weak hierarchy (H1 14 pt against H2 12 pt), and a third typeface in every exhibit (Arial screenshots) plus a fourth in the chart (Aptos).
3. **Screenshots instead of tables.** Soft at 96–180 dpi, not searchable, not restyled. They carry model artefacts into a client document: yellow total fills, a light-blue box, a red review rectangle, yellow input cells.
4. **Stat-tile KPI band.** Four big numbers on a blush strip: the "stat tile" pattern the owner has banned.
5. **Colour-only semantics.** 0.5 pt green and red borders are the only carrier of "positive / negative for valuation". They are invisible in black-and-white print, fail for colour-blind readers, and need a separate floating "Key:" table.
6. **Every cell boxed and filled.** A C2BAB8 grid on all cells, F5EDEC on all values, italic body values. It is the heavy "Word table" look, and the numbers in the Value column are centred, not right-aligned.
7. **Fragile layout.** Four empty Heading 2 paragraphs push "Valuation & Structure Rationale" to page 4. The cover prints a folio. The TOC lists itself. Headers are misaligned with the logo.
8. **Content hygiene:** internal notes, typos and unreconciled numbers (section 6.9). A leaked client identifier in v1 ("CPM") and in the chart's link path.
9. **No confidentiality or disclaimer** in the final version, no date, no contact page. v1 had all three.

---

## 8. What a top-tier bank would do, keeping the AMB identity

This is a concrete execution spec for the CIM deck. It uses the bot's pptxgenjs 16:9 canvas.

**Canvas and grid**
- 13.333 x 7.5 in. Side margins 0.45 in, giving a 12.43 in content width.
- 12-column grid with 0.20 in gutters (≈0.85 in columns). Standard splits: 8+4 (exhibit plus takeaways rail), 6+6, 4+4+4.
- Title zone y 0.30–1.00 in. 0.75 pt crimson rule at y 1.05 in. Content y 1.20–6.85 in. 0.5 pt C2BAB8 rule at y 6.95 in. Footer text at y 7.02–7.30 in.

**Titles**
- One- or two-line **action titles** that state the conclusion with a number. For example: "Management fees grew at a 20% CAGR to $4.0M as door count rose 21% since FY2022", not "Financial Overview".
- Georgia bold 20 pt in deep maroon. Georgia continues the ICP's serif identity while upgrading from Times New Roman. An Arial Bold 20 pt fallback is acceptable. At most ~110 characters.
- **No red italic prefix.** The section name moves to the footer tracker.

**Section tracker**
- Footer left: "Project EBO | Financial Overview", Arial 7.5 pt 7A706D, sentence case, no letter-spacing.
- Footer right: page number.
- Footer centre-left or top-right: `amb-logo.png` at about 1.1 in wide (or `amb-logo-mark.png` at 0.35 in).
- Footer far left: "Strictly private and confidential".

**Body**
- Arial 10 pt 2C2523, 3 pt paragraph spacing.
- Bullets: a small crimson "▪" or an en-dash, indented 0.15 in, at most 2 levels.
- A "Key considerations" rail (4 columns wide) of 3–5 numbered-in-text points ("1." as plain text, **no circle badges**), each opening with a bold 3–6 word lead-in and then a number-backed sentence.

**Tables**, developed from the deck's slide 4 style, which is already bank-like:
- Arial 8.5–9 pt. The header row is either bold 2C2523 on no fill with a 1 pt deep-maroon bottom rule, or, for primary financial tables only, a deep-maroon fill with white bold text. Pick one per deck.
- 0.25 pt C2BAB8 horizontal hairlines, **no vertical rules, no zebra fills**.
- Numbers right-aligned with tabular figures. Negatives in parentheses, zero as "–", matching the workbook formats `#,##0;(#,##0);"–"`. $ only on the first and total rows.
- Subtotals bold with a 0.5 pt top rule. Key totals (EBITDA, Adj. EBITDA) bold with a 0.75 pt top rule and a F5EDEC tint *band* across the row.
- An LTM or PF column highlighted with a light tint.
- Column headers such as "FY2022A FY2023A FY2024A LTM Jun-25". Units in a 7.5 pt italic caption line above the table: "($ in thousands)".

**Charts**
- Native pptx charts, never screenshots.
- Primary series crimson 9E0A20; comparison series deep maroon or warm grey C2BAB8; highlight bar (LTM/PF) in deep maroon.
- Data labels 8 pt on bars, no gridlines, hairline category axis, no legend for a single series.
- A chart title as a sentence plus a units subtitle.
- A 7 pt **source line under every exhibit**: "Source: Company financial statements (QuickBooks), AMB analysis. Note: Fiscal year ends December 31. PF reflects adjustments detailed on page X."

**Density**
- 2–3 exhibits per content page, 150–250 words.
- Every figure traceable to the model. `[Confirm: …]` placeholders appear in crimson italic 9 pt so they stand out in review.

**Replacements for banned patterns**

| Banned or amateur pattern | Replacement |
|---|---|
| Stat tiles / KPI band | "Transaction snapshot" or "Key metrics" table: Metric / Value / Benchmark / Implication. This keeps the ICP's excellent "Valuation Impact" idea as words, not coloured borders. |
| Numbered circles | Plain numerals in a narrow table column |
| Rounded cards | Square hairline-ruled panels, or whitespace alone |
| Letter-spaced caps kickers | Sentence-case footer tracker |
| Decorative circles, slats | Nothing |
| Green/red borders | A text tag in the implication cell ("Supports value:", "Buyer diligence focus:") |

**Cover**
- Full-bleed deep maroon field with `amb-logo-white.png` at about 2.4 in top-left.
- "Project EBO" in Georgia 40 pt white; "Confidential Information Memorandum" in Arial 16 pt; month and year in Arial 11 pt.
- A single 1 pt gold (C9A227) rule. This reuses the ICP cover's gold-rule DNA once.
- Bottom: "Strictly private and confidential. Prepared by AMB Advisory Services LLC."
- Alternative: a white cover with the crimson logo and a deep-maroon codename.

**Page 2: disclaimer.** v1's seven-heading notice, set in two columns at 7.5 pt.

**Contents and dividers.** A contents page, and section-divider "agenda tracker" pages that list all sections with the current one in crimson bold and the rest in 7A706D. No big numerals in circles.

**Back matter.** "Process & next steps": v1's 8-stage table rendered as a ruled table with a date column. Then "Contact": AMB Advisory Services LLC, Frank (principal), phone, email, website, and "All inquiries should be directed to AMB Advisory. Do not contact the Seller or its employees directly."

### Proposed colour tokens (consolidating 11 reds into 2)
| Token | Hex | Basis |
|---|---|---|
| `crimson` (primary accent) | **9E0A20** | The logo |
| `maroon` (deep: titles, table header fills, cover field) | **6F0716** (logo at 70% shade) | Or **7B0000** if the model slice keeps its existing header band. Use the same one in both deliverables and never ship both. |
| `ink` | 2C2523 | ICP body colour (warm near-black) |
| `muted` | 7A706D | ICP secondary grey |
| `rule` | C2BAB8 | ICP hairline |
| `panel` | EAE6E4 | ICP warm grey fill (sparingly) |
| `tint` | F5EDEC | ICP blush: highlighted row or column band |
| `crimson-40` | D89DA6 | Crimson at 40% tint, for secondary chart series |
| `gold` | C9A227 | ICP cover rule; cover only |

Retire: FF0000, 990033, 54001C, 820033, B70033, 98002F, C00000 (chart), 44546A (slate text), 5B312B / 8C4A43 (brown headings), 4EA72E / EE0000 (semantic borders), FFFFCC / CAEDFB (Excel highlights in client-facing pages).

---

## 9. Brand DNA to keep vs execution to discard

### Keep (AMB identity)
- **The logo** (`brand/amb-logo.png`, 1099 x 375), in its true crimson **#9E0A20**, never recoloured. Use the new white version on dark fields.
- **Maroon as the single brand hue on white**, with the ICP's **warm neutrals** (2C2523 ink, 7A706D grey, C2BAB8 rule, EAE6E4 / F5EDEC fills) and a **gold hairline** on the cover only.
- **Name treatment:** "AMB Advisory Services" in running text; "AMB Advisory Services LLC" in legal text; "AMB Advisory" as the short form in the disclaimer.
- **Codename convention:** "Example Business Overview ("EBO")" and "Client Code: EBO" become "Project [Code]" plus client code in the footer.
- **Footer idea:** firm | client code | page number, with a hairline rule above.
- **Serif headings, sans-serif data.** The ICP's serif identity carries over as Georgia titles. Arial stays for tables and charts, matching the workbooks.
- **Action titles** (from the deck), and the deck's slide 4 table style (maroon header rule, hairline row rules, no verticals).
- **The ICP content architecture and analytical voice:** Executive Summary with a valuation rationale, a recommended offer structure and the reason for sale; the "Metric / Value / Notes / Valuation Impact" so-what table; candid risk statements with numbers (concentration, contingent payments, stay-on); the units and "not independently audited" note; v1's disclaimer, "Process & Next Steps" and contact block.
- **Number style:** "$8.9M", "$20M – $26M", "10.0x – 13.0x" (en dash with spaces), "PF Dec'24", "($000s)", "Dec-22 / 1Q24" period labels, percentages without decimals in text.

### Discard (execution)
- TCC's master, theme, logos, 4:3 format, 32 pt two-line titles, FF0000 italic prefixes, 44546A slate text, dashed grey boxes, pink sticky notes, curved arrows, circular headshots, picture-as-text headers, and the stock-slat cover.
- The ICP's Times New Roman body, brown headings, 168 px brown header logo, stat-tile KPI band, green/red border semantics and floating "Key:" legend, fully boxed and filled tables with italic values, and Excel screenshots (with their yellow, blue and red-box artefacts).
- Its default-styled Excel line chart (C00000, one-series legend, no source line), empty-heading spacers, self-listing TOC, and folio on the cover.
- The generic adjectives ("well-established", "platform-sized", "proven growth engine", "strong leadership organization", "high margin organization"), internal "we are waiting for…" notes, and any figure not tied to the model.

---

## 10. Renders inspected

Scratch directory: `/tmp/claude-0/-home-user-thick-as-thieves/15dd32a7-e35b-5a03-af36-9acc2a9d9a70/scratchpad/research/decks-brand/renders/`

| Render | What it showed |
|---|---|
| `kickoff_p01.png` | Cover: stock pink/maroon slats on the right, 820033 left band, 990033 title, small white-boxed AMB logo not aligned to the title |
| `kickoff_p02.png` | Label-column / 2 pt bar / bullets rows; dashed F2F2F2 "goal" box; Spinnaker logo top-right, TCC logo bottom centre |
| `kickoff_p03.png` | Headshot grid with firm logos over 2 pt maroon rules; red italic "The Squad:" prefix |
| `kickoff_p04.png` | The only table: maroon header rule, dotted row rules, circular headshots; LibreOffice adds black verticals that are transparent in the source |
| `kickoff_p05.png`, `kickoff_p06.png` | Timeline rows with bold-italic "We can complete this…" bullets; pink rounded callouts (FFCCCC) |
| `kickoff_p07.png` | Two D5DBE5 panels joined by curved maroon arrows; pink sticky note |
| `kickoff_p08.png`, `kickoff_p09.png` | Screenshot of a Google "Q&A Doc"; text-only data-room slide |
| `kickoff_p10.png` | Three-column Business / Accounting / Legal; the header row is an image |
| `kickoff_p11.png`–`kickoff_p13.png` | Text-heavy process slides with "To do / discuss:" dashed boxes |
| `pptx_media_sheet.png` | All 31 media files: TCC, Spinnaker and portfolio logos, headshots, and the one AMB logo (image13, white box) |
| `icp_example_orig_p01.png`–`p09.png` | Authoritative Acrobat render: cover with gold rules; brown H1/H2; KPI band; Metric table (screenshot); offer table; Excel-screenshot exhibits with yellow totals and a red review box; C00000 line chart; blurry org chart |
| `sheet_icp_v5_0.png` | v5 native render; identical layout to the PDF with the Metric table live |
| `sheet_icp_vpasted_0.png` | Same with the Metric table as a picture (source of the PDF) |
| `sheet_icp_arch_v1_0/1/2.png` | 21-page template: disclaimer page, header switching to "Confidential Information Memorandum" with gold rule, placeholder tables in 8C4A43 italics, Operations, Market, Growth, Deal Overview, Process & Next Steps, Contact |
| `sheet_icp_arch_v2_0.png`, `sheet_icp_arch_v3_0.png` | Transitional versions; v2 mixes the EBO example with placeholders, v3 is about v5 |
| `zoom_icp_p3_top.png` | Close-up of the header logo softness, H1 rule, KPI band and Metric-table borders |
| `zoom_icp_p6_pnl.png` | Close-up of the pasted P&L: Arial, underlined section labels, FFFFCC EBITDA row, red box around "899" |
| `zoom_v1_p8_cimheader.png` | v1 CIM header with gold rule; native placeholder P&L table with every cell boxed |
| `icp_header_logo_x4.png`, `icp_cover_logo_on_dark.png`, `brand_preview.png` | Logo quality check: brown 168 px header logo against the crimson 1099 px master; the derived white logo on a dark field |

Scripts used, for reproduction: `dump_pptx.py` (shape positions, fills, fonts per slide / layout / master) and `dump_docx.py` (paragraph styles, borders, table cell fills and borders) in the scratch directory.
