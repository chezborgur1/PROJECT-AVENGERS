# CIM design tournament: results

**Date.** 2026-09-28. **What was judged.** Three design directions for the AMB Advisory Services CIM deck, each built as a seven-page Project Ridgeline sample (cover plus six content pages) with its own `DESIGN_SPEC.md` and pptxgenjs generator, in `design/directions/`. Three judges scored the decks blind, under the labels Deck 1, Deck 2 and Deck 3, on five criteria worth 10 points each: bank quality, AMB identity, not reading as AI-generated, density, and craft. The brief they scored against: AMB's identity raised to top-tier-bank quality, more information per page than a normal deck, and nothing that reads as generated.

**Blind labels.** Deck 1 = Direction C, "Exhibit-forward databook" (`c-exhibit-databook`). Deck 2 = Direction B, "Editorial boutique" (`b-editorial-boutique`). Deck 3 = Direction A, "Bulge-bracket classic" (`a-bulge-bracket`).

**Outcome.** The final design system is in `design/FINAL_DESIGN_SPEC.md`.

---

## 1. Ranking

Computed from the three judges' verdict JSON. (The workflow's summary line printed zero wins and zero points for every deck; that was a tally bug in the harness, not the judges' result. The figures below are the judges' own scores.)

| Rank | Deck | Direction | Judge wins | Points (of 150) | Average per judge (of 50) |
|---|---|---|---|---|---|
| 1 | Deck 1 | C, Exhibit-forward databook | 3 of 3 | **127** | 42.3 |
| 2 | Deck 3 | A, Bulge-bracket classic | 0 | 114 | 38.0 |
| 3 | Deck 2 | B, Editorial boutique | 0 | 105 | 35.0 |

Every judge placed Deck 1 first. Two judges placed Deck 3 second and Deck 2 third; the third judge (judge 3) placed Deck 3 second by one point (37 to 36).

## 2. Scores by judge

**Judge 1** (winner: Deck 1, 42 to 40 to 35)

| Deck | Bank quality | AMB identity | Not AI | Density | Craft | Total |
|---|---|---|---|---|---|---|
| Deck 1, C databook | 8 | 9 | 8 | 9 | 8 | **42** |
| Deck 2, B editorial | 7 | 9 | 6 | 7 | 6 | 35 |
| Deck 3, A bulge-bracket | 9 | 6 | 9 | 8 | 8 | 40 |

**Judge 2** (winner: Deck 1, 45 to 37 to 34)

| Deck | Bank quality | AMB identity | Not AI | Density | Craft | Total |
|---|---|---|---|---|---|---|
| Deck 1, C databook | 9 | 9 | 8 | 10 | 9 | **45** |
| Deck 2, B editorial | 7 | 8 | 6 | 7 | 6 | 34 |
| Deck 3, A bulge-bracket | 8 | 5 | 9 | 8 | 7 | 37 |

**Judge 3** (winner: Deck 1, 40 to 37 to 36)

| Deck | Bank quality | AMB identity | Not AI | Density | Craft | Total |
|---|---|---|---|---|---|---|
| Deck 1, C databook | 8 | 8 | 8 | 9 | 7 | **40** |
| Deck 2, B editorial | 7 | 9 | 7 | 6 | 7 | 36 |
| Deck 3, A bulge-bracket | 8 | 6 | 8 | 7 | 8 | 37 |

## 3. Scores by criterion (sum of three judges, of 30)

| Criterion | Deck 1, C databook | Deck 3, A bulge-bracket | Deck 2, B editorial |
|---|---|---|---|
| Bank quality | 25 | 25 | 21 |
| AMB identity | **26** | 17 | **26** |
| Not AI-generated | 24 | **26** | 19 |
| Density | **28** | 23 | 20 |
| Craft | **24** | 23 | 19 |
| **Total** | **127** | 114 | 105 |

The pattern behind the result: Deck 3 matched the winner on bank quality and beat it on "not AI", but gave up nine points on identity. Deck 2 matched the winner on identity but gave up points everywhere else, most of all on "not AI" and craft. Deck 1 was the only deck without a weak criterion.

## 4. In plain English, for the owner

**What the three directions were.**

- **The databook (Direction C, the winner)** looks like the financial exhibit pack a quality-of-earnings firm or a mid-market bank hands a buyer: every page is led by two or three ruled tables in AMB's maroon, each table has a small lettered column that points to a list of observations beside it, and every financial table carries the growth and margin-change columns an analyst would add by hand. It is the densest of the three: fourteen exhibits over six pages.
- **The bulge-bracket book (Direction A)** looks like a Goldman or Evercore sell-side book: white pages, thin grey hairlines, plain dark titles, numbered exhibits, whole-dollar figures, footnotes on one line. Nothing decorated anywhere.
- **The editorial boutique (Direction B)** looks like a Moelis or PJT book set by a magazine designer: a large maroon serif headline, a one-line sub-headline explaining the mechanism, a left margin column carrying footnotes and exhibit labels, and pale pink panels behind secondary exhibits.

**Why the databook won.** The brief asked for three things at once, and the judges found that only the databook delivered all three on the same page. It is unmistakably AMB (the maroon titles, header bands and pink section rows come straight from the firm's own workbooks and memos). It carries more verifiable information per page than either rival: a 23-row income statement, an EBITDA ladder that starts at net income and codes every adjustment, a top-ten customer list with tenure and contract basis, an owner-hours table that turns "owner dependence" into arithmetic. And its way of tying each written claim to a specific table row is something generated decks do not do; databooks do. Its faults were all fixable in a build pass rather than faults of the idea: a dozen blank cells in the first table, a stray maroon square above one column, too many decimals, a cover with a colour band, legends in the wrong place, titles that all ran to two lines.

**What the runners-up did better, and what we took from them.** The bank book (Direction A) was the cleanest object of the three and the least likely to be mistaken for a template, but it carried the brand only in its table headers; a buyer would not know whose book it was. The editorial deck (Direction B) had the strongest AMB colour and the best single page (its EBITDA reconciliation), but its pink panels and solid maroon "hero rows" are exactly the card-and-highlight patterns the brief banned, its margin column often earned nothing, and its titles collided with the row beneath them on two pages.

The final system is the databook with these grafts:

| From | What we took | Why it matters to a reader |
|---|---|---|
| Bank book (A), cover | The footer line with "Tampa, Florida · ambadvisoryservices.com" beside the confidentiality sentence | A proper document colophon |
| Bank book (A), financial pages | Whole thousands in every table (`$2,407`, not `$2,406.8`), with a "totals may not sum due to rounding" note when needed | Cleaner columns; decimals stay in the prose where they carry meaning |
| Bank book (A), EBITDA page | The owner-pay mechanism shown inside the ladder: what the owner was paid, minus a market salary, equals the add-back | The single most-questioned adjustment in a Main Street deal becomes visible arithmetic |
| Bank book (A), every two-column page | A thin grey hairline between the two columns | Structure without boxes or panels |
| Bank book (A), notes | All footnotes on one line; the notes band never exceeds three lines | Room for the content above it |
| Bank book (A), executive summary | Two rows in the transaction table: the growth levers management has identified ("none is included in the figures shown") and a "basis of preparation" statement | The two things a careful buyer looks for on page 2 |
| Bank book (A), considerations page | A "Financial reporting" row that says what the books are and which documents the data room provides to reconcile them | Candour that builds trust before diligence |
| Editorial deck (B), cover | The full-bleed maroon cover the house style specifies, with an optional sector-and-city line | The strongest brand statement in the tournament, executed to the guide |
| Editorial deck (B), financial page | Revenue and Adj. EBITDA as two side-by-side panels instead of one clustered chart | Removes the six-to-one scale mismatch that made the EBITDA bars look like stubs |
| Editorial deck (B), executive summary and customers page | Quick Stats split into a financial table and an operating "metric, value, basis" table; a maintenance-agreement fact table (members per technician, tune-ups a year, renewals needed to hold the base flat) | Fixes the blank cells; adds the operating exhibit only an operator-minded analyst would build |
| Editorial deck (B), generator | Row heights computed from the longest cell; maroon bullet glyphs by a post-pass; "nothing pro forma is included" stated on the EBITDA page | Even padding in every text table; the disclaimer buyers expect |

And these fixes to the winner, each answering a weakness a judge recorded: the blank operating cells become their own table; the stray maroon header square goes (the header cell now spans both tiers); the cover is the full maroon field; titles are cut to one line where the finding allows; the "Key observations" block is renamed to name the table it keys and is absent on prose pages; legends move top-left; the considerations rows are sized to their text; the cost-ratio delta column uses one unit; the "71% of commercial" fact moves out of a text cell into the observations; nothing may sit below y 6.48 in, so no callout ends a hair above the source line again.

**What we did not take, and why.** Not the editorial deck's pink panels, maroon hero rows, margin column or one-line sub-headline (the first three are banned patterns; the sub-headline is a title-plus-subtitle pair on every page and costs a table row of height). Not the bank book's dark titles, white cover or exhibit numbering (the first two remove the brand; the house style cross-references by page number).

**What happens next.** A build pass applies `FINAL_DESIGN_SPEC.md` to the databook generator: the spec gives the grid in inches, the type scale in points, the colour roles in hex, the table and chart rules, the cover, divider and page anatomies, the exhibit library, the seven-page sample's page-by-page budget, and the QA checks the rendered pages must pass.

## 5. The judges' one-line verdicts

- **Judge 1:** "Deck 1 wins at 42 against Deck 3 at 40 and Deck 2 at 35 because it is the only direction that meets all three legs of the brief on the same page … Its defects are fixable in a build pass … Deck 3 is the cleanest and most bank-like object of the three … but it gives up the identity the brief demanded … Deck 2 is the most original and has the best single EBITDA page … but it carries the most craft faults."
- **Judge 2:** "Only the exhibit databook (Deck 1) scores high on all three; the other two each trade one away. Deck 1 wins on structure. Its Obs. column keyed to lettered observations ties every sentence of commentary to a table row … Deck 3 has the purest bank typography … but it buys that restraint by giving up the brand … Deck 2 is the most designed and the most AMB in colour … but its tint panels … and its maroon-filled hero rows … are exactly the card and highlight patterns the brief rules out."
- **Judge 3:** "Deck 1 is the only direction that scores well on all three. Its p3 income statement, p4 reconciliation plus support table, p5 concentration table and p6 cost-ratio table are the most informative exhibits in the set … Its faults are build faults rather than direction faults … Recommended path: build on Deck 1, graft Deck 2's full-bleed maroon cover and its split Quick Stats … and take from Deck 3 the whole-thousand figures, the single-line footnotes, the owner-compensation block inside the ladder, the memo rows and the gutter hairline."

## 6. Files

| Item | Path |
|---|---|
| Final design system | `design/FINAL_DESIGN_SPEC.md` |
| Winner: spec, generator, deck and page renders | `design/directions/c-exhibit-databook/` |
| Runner-up A: spec, generator, deck and page renders | `design/directions/a-bulge-bracket/` |
| Runner-up B: spec, generator, deck and page renders | `design/directions/b-editorial-boutique/` |
| House style the directions were built to | `docs/HOUSE_STYLE.md` |
