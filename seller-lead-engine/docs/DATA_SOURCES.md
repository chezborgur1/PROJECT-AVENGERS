# Data sources: where the owner list comes from

The list is built from free government files, not from Google. State license
boards and Secretaries of State publish bulk downloads that name people and
carry dates (formation, original license issue, year graduated), and those
dates are the best free proxies for how long an owner has run the business.
Google Places adds a live check at scoring time and stores nothing but the
`place_id`. For the first 500 owners the data cost is about $0; the paid
pieces are a verifier API beyond 100 checks a month and Places details beyond
1,000 a month. Research: [research/data.md](research/data.md).

## Recommended stack

**Florida first.** AMB Advisory is in Tampa, and Florida is the one state
where a free entity file names the officers: Sunbiz gives the owner, DBPR
gives the original license date, and the two join on business name and ZIP.

| State | Vertical | Files | Import command | Notes |
|---|---|---|---|---|
| Florida | HVAC, plumbing, other construction trades | Sunbiz quarterly cordata (entities, up to 6 officers) + DBPR Construction Industry Licensing Board licensee CSVs | `import sunbiz <file> --snapshot <date> --metro-only` and `import dbpr <file> --snapshot <date>` | The best pilot. A CILB license is issued to the qualifier, who may be a hired employee, so the owner comes from Sunbiz officers unless the licensee is a self-proprietor |
| Florida | Association (HOA and condo) management companies | DBPR Regulatory Council of Community Association Managers licensee file (www2.myfloridalicense.com/community-association-managers-and-firms/public-records/) | `download florida --import` (fetched when a vertical lists `CAB`), or `import dbpr <file>` | Every firm managing associations of more than 10 units or a $100,000 budget must hold a CAM firm licence (Fla. Stat. 468.432; licence numbers start CAB). Individual managers (CAM) are people, not businesses, and are left out. The file's column layout could not be checked while this was built: if `import dbpr` stops on unknown headers, it names them |
| Florida | Bookkeeping firms | Sunbiz entities filtered by name keyword ("bookkeeping", "bookkeeper"), plus contacts or open POI rows | `download florida --import` on the desktop app, or `import sunbiz ...` | Florida does not license bookkeepers, so the name is the only signal and tenure comes from the formation date. The hosted app cannot hold the Sunbiz file, so these come from the desktop app for now |
| Florida | Professional services: accounting and tax practices, insurance agencies, IT services, staffing agencies, marketing agencies, engineering and architecture firms | Sunbiz entities filtered by name keyword, plus contacts or open POI rows | `download florida --import` on the desktop app, or `import sunbiz ...` | Found by name, so a person checks the list before emails go out. Law firms are left out until counsel reviews The Florida Bar's rules on selling a practice and sharing fees. Licence files that could add tenure (insurance agents, CPA firms, engineers) are not wired up yet |
| Florida | Landscaping, cleaning, property management | Sunbiz entities filtered by name keyword, plus open POI rows | `import sunbiz ...`, `import csv:overture` or `csv:foursquare` | Mostly no trade license; tenure comes from the formation date. Property managers may appear in DBPR real-estate files |
| Florida | Dental | Department of Health (MQA) data download | `import csv:licenses` after mapping to canonical headers | Dentists are licensed by DOH, not DBPR; whether the MQA download includes dentistry is unverified |
| Texas | HVAC | TDLR "Airconditioning Contractors" CSV (daily) | `import csv:tdlr <file>` | The license belongs to an individual who may be an employee; the file may have no original issue date. No free Texas file names officers |
| Texas | Dental | TSBDE licensee list (daily, comma-separated) | `import csv:tsbde <file>` | Year graduated is the strongest age proxy for dentists |
| California | Contractors | CSLB License Master (and the Personnel file) | `import csv:cslb <file>` | RMEs in the Personnel file are hired qualifiers, never owners. Do not target California unless AMB holds a DRE license (Cal. B&P 10131) |
| Washington | Contractors | L&I contractor licenses with the primary principal (Socrata `m8qx-ubtq`, principals `4xk5-x9j6`) | `import csv:wa_lni <file>` | Principals are owners |
| Colorado, Oregon, New York | Any | Secretary of State open data (no officers in Colorado or Oregon; New York's CEO name is for corporations only) | `import csv:entities <file>` after renaming columns to the canonical headers | No preset yet |
| Any state | Websites, phones, categories | Overture Maps Places (CDLA-Permissive-2.0) or Foursquare OS Places (Apache-2.0, includes email) flattened to CSV | `import csv:overture <file>` / `import csv:foursquare <file>` | Openly licensed, so these may be stored. Read Overture's `basic_category`, not the deprecated `categories` |

Never import voter files, data-broker age or birth-date appends, LinkedIn
data, or anything from a Google Maps scraper (Apify, Outscraper and similar).
Never scrape listing sites such as BizBuySell: their terms forbid it, and
BizBuySell's owner, CoStar Group, has sued other sites over copied listings.
For market figures, BizBuySell publishes free quarterly Insight Report data
tables (listing counts, median asking price, revenue and cash flow by
metro), and its valuation benchmark pages are where reference/multiples.json
comes from.
Before ingesting any source, check its terms page for "no solicitation" or
commercial-use limits.

## How to download each

**The quick way: one command.** `npm run engine -- download florida --import`
(on Windows, double-click `download-florida.bat`) does both downloads below,
then imports the businesses in your metros and builds the prospect list. It
reads the DBPR public-records page of each board a configured vertical needs
(construction for the trades, community association managers for `CAB`) and
downloads every licensee file linked there (applicant and continuing-education
files left out), and logs in to the Sunbiz SFTP server with
the public login you copy into `.env` (`SUNBIZ_SFTP_USER`,
`SUNBIZ_SFTP_PASSWORD`) to find the quarterly `cordata` files by name. Files
land in `data/downloads/<date>/`. Neither site's file names could be checked
while this was built, so if a site has changed the command stops and says
what it found; the manual steps below still work. A cloud session needs
www2.myfloridalicense.com and sftp.floridados.gov allowed in its network
settings; a person's own computer needs nothing.

**Florida Sunbiz (Division of Corporations).**
1. Open dos.fl.gov/sunbiz/other-services/data-downloads/ and note the public
   SFTP login for sftp.floridados.gov.
2. Download the quarterly full file of active corporations, LLCs and LPs
   (`cordata.zip`, in 10 parts, published January, April, July and October).
   Daily update files also exist.
3. Unzip and import each part. Use the quarter's date as the snapshot, and
   `--metro-only` to keep only businesses in a configured metro:

   ```bash
   npm run engine -- import sunbiz <part file> --snapshot 2026-10-01 --metro-only
   ```

   Records are fixed width, 1,440 characters, no header row.
   `SUNBIZ_LAYOUT` in `src/sources/sunbiz.ts` must be checked against
   dos.sunbiz.org/data-definitions/cor.html before the first real import.

**Florida DBPR.**
1. Open www2.myfloridalicense.com/construction-industry/public-records/ and
   download the certified and registered licensee CSVs (refreshed weekly).
   Electrical contractors are on the Electrical Contractors' Licensing Board
   page.
2. Import with the download date as the snapshot:

   ```bash
   npm run engine -- import dbpr <file> --snapshot 2026-10-26
   ```

   Headers are mapped by alias (`DBPR_COLUMNS`); a file with no header row is
   read by position (`DBPR_POSITIONAL_COLUMNS`). Both, and the county codes,
   come from best knowledge of the board's readme.pdf and must be checked
   against the first real file. A file whose required columns cannot be found
   fails and lists the headers it did not recognize.

**Other states.** Download the file from the board or portal named in the
table, then `import csv:<preset> <file>`. Preset header names are unverified;
the import fails loudly rather than importing blanks.

After any import: `npm run engine -- build`, then `enrich` and `score`.

## Canonical CSV formats

Files for `csv:entities`, `csv:licenses`, `csv:contacts` and `csv:open_poi`
are UTF-8, comma-delimited, with a header row and ISO dates (YYYY-MM-DD).
Column order follows the schemas in `src/domain/schema.ts`; `source` defaults
to `csv`.

**entities** (`data/imports/entities.csv`): `source, source_record_id, state,
entity_name, entity_type, status, formation_date, principal_street,
principal_city, principal_state, principal_zip, mailing_street, mailing_city,
mailing_state, mailing_zip, registered_agent_name, registered_agent_type,
officer1_name, officer1_title, officer1_is_person` through `officer6_*`,
`last_annual_report_date, last_event_date, fei_number, source_snapshot_date`.
Required: `source_record_id`, `entity_name`.

**licenses** (`data/imports/licenses.csv`): `source, source_record_id,
license_number, license_type, license_class, status, business_name, dba_name,
person_name, person_role, original_issue_date, effective_date,
expiration_date, year_graduated, street, city, state, zip, county, phone,
source_snapshot_date`. `person_role` is one of owner, officer, principal,
authorized_official, licensee, qualifier, registered_agent, unknown; only the
first five can become the owner. Required: a license number or record id,
and a business, person or DBA name.

**contacts** (`data/imports/contacts.csv`): `source, source_record_id,
business_name, zip, first_name, last_name, role, email, email_source,
email_source_url, website, phone`, with `email_source` one of website,
import, hunter, snov, apollo, manual, reply. Required: `business_name`.

**open_poi** (`data/imports/open_poi.csv`): `source, source_record_id, name,
basic_category, website, phone, street, city, state, zip, date_refreshed,
date_closed, data_license`. Required: `name`.

The sample files in `samples/tampa-bay/` show every format.

## Google Places: what it is used for, and its limits

`score --places` (with `GOOGLE_PLACES_API_KEY`) uses Places API (New) in two
calls per prospect, both in `src/score/places.ts`:

1. **Match:** Text Search with field mask `places.id`, the free ID-only SKU.
   It returns no name or address, so match confidence comes from how many
   candidates came back and how specific the query was. Below 0.6 the match
   is dropped. A matched `place_id` is stored on the prospect and refreshed
   after 12 months.
2. **Details:** business status, rating, review count and website, which are
   Enterprise fields (1,000 free calls a month, then about $20 per 1,000).
   The engine stops at 900 a month (`DEFAULT_MAX_DETAILS_PER_MONTH`). Details
   live only in `data/cache/` and are purged after 30 days.

Limits that shape the design:

- **Only `place_id` may be stored** (Maps Platform Terms 3.2.3). Ratings,
  review counts and websites are never written to `prospects.csv`, and score
  reasons describe a band ("review volume suggests an established business
  in the target size range"), never the figure. Whether even a 30-day cache,
  and scores derived from it, are allowed is a question for counsel.
- **There is no "years open" field.** Tenure comes from license and state
  records only.
- **Text Search returns at most 60 results per query**, so Places is for
  matching known businesses, never for building the list.

## Email discovery and verification

`enrich` picks one address per prospect in `new`, `scored` or `hold`
(`src/contacts/enrich.ts`):

1. **Candidates:** the address already on the prospect, imported contact
   rows for the business, and with `--discover`, addresses the business's own
   website shows (home, /contact, /contact-us, /about; same host only;
   robots.txt honored; a "do not harvest" notice anywhere puts the whole site
   off limits; obfuscated addresses are left alone).
2. **Rank:** an address matching the owner's name, then another person, then
   a role inbox (info@, office@). Suppressed addresses are never candidates.
3. **Verify** (`src/contacts/verify.ts`), cheapest first: syntax, disposable
   domain, FCC wireless domain (never sendable), MX records, then a
   ZeroBounce-compatible API (`EMAIL_VERIFIER_API_KEY`). At most 3 calls per
   prospect; an address is verified again after 90 days. The engine never
   opens SMTP connections itself, because cloud hosts block port 25.

Without a verifier key every address is `unknown`, which is not sendable.
A person who has confirmed an address another way records it with
`npm run engine -- verify <prospectId> valid --by <name>`; the next `enrich`
keeps that verdict.

Free tiers are small: ZeroBounce about 100 verifications a month, Hunter
about 50 credits, Snov 50, Apollo's limits conflict. Addresses found in those
tools can be imported with `csv:contacts` and the matching `email_source`.
None of them supplies owner age, and most Main Street owner emails come from
the business's own website or the owner's reply.

## The scoring model

The likely-to-sell score runs from 0 to 100 (`src/score/score.ts`). The
weights are a starting heuristic from research/data.md section 9, not fitted
to outcomes. Missing data scores a neutral-low value so a blank cell neither
wins nor zeroes a prospect.

| Component | Points | Rules | Neutral when unknown |
|---|---|---|---|
| Estimated owner age | 30 | From graduation year (+25 to 27), else original license year (licensed at 25 to 32), else formation year (founded at 28 to 40). Band midpoint under 45: 0; 45 to 54: 10; 55 to 59: 20; 60 to 64: 27; 65 and over: 30. Internal only: reasons say "License issued 1994, which suggests a senior owner" | 8 |
| Tenure | 20 | Years since the earliest formation or original license date. Under 10: 0; 10 to 14: 6; 15 to 19: 12; 20 to 24: 16; 25 and over: 20. Weighted below age because the odds of sale fall with tenure at first (Holmes and Schmitz, 1996) | 4 |
| No apparent successor | 15 | Sole officer with 10 or more years on record: 15; sole officer: 10; several officers, none sharing the owner's surname: 8; an officer with the owner's surname and another first name or a JR or II suffix: 0 | 5 |
| Size fit | 15 | Places review volume bands (under 5: 3, under 25: 6, under 75: 10, under 500: 13, under 1,500: 9, more: 4), plus 2 for 2 or more licenses; without Places, 3 or more licenses: 10, 2: 9 | 7 |
| Fatigue signals | 10 | A missed or late Florida annual report, a license expired or expiring within 60 days without renewal, no website, listed as temporarily closed | 1 per unknown check |
| Vertical prior | 10 | `verticals.<key>.prior` in the config, set from the share of owners 55 and over and buyer demand | none |

**Knock-outs** score 0 and set status `excluded`: suppressed, inactive entity
or license, Places `CLOSED_PERMANENTLY`, franchise or chain name
(`targeting.exclude_name_patterns`), excluded domain, tenure under
`targeting.min_tenure_years` (15), no vertical or no metro.

**Tiers:** A at 70 and above, B at 50 to 69, C under 50. Tiers in
`targeting.send_tiers` (A and B) may enter the sequence. A prospect without a
sendable address scores but waits in `hold`.

### Recalibration plan

1. Every prospect keeps its component points in `score_components`
   ("age=27; tenure=20; ...") and its reasons in `score_reasons`.
2. Once about 50 replies are labelled, take every prospect that received
   step 1 and set the outcome to 1 when the lead reached `qualified` or later
   in `data/leads.csv`, else 0.
3. Fit a logistic regression of the outcome on the six components, rescale
   the coefficients to 100 points, and compare tier A's qualified rate
   against tier B's. Keep the old weights if the new ones do not separate
   the tiers better on the same data.
4. Update `WEIGHTS` in `src/score/score.ts` and the tests together, note the
   date and sample size in the file's header comment, and rerun `score`.
5. Revisit the vertical priors with Census County Business Patterns and the
   Annual Business Survey owner-age table (variable OWNRAGE): 51.3% of
   employer-firm owners who reported an age were 55 or older in the 2023
   survey, per secondary sources.
