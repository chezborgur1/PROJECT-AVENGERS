# Tampa Bay sample data (fictional)

Every business, person, address, phone number, email address, website,
licence number, document number and FEI number in this folder is invented.
None of it describes a real business or person. Street names and cities are
real Tampa Bay places so the metro and county rules have something to work
on; the street numbers and businesses at them are made up. Websites use the
reserved `.example` top-level domain, phones use the 555-01xx fictional
range, and the two addresses outside `.example` (one at gmail.com, one at a
.ca domain) exist only to exercise the jurisdiction and free-mail rules. The
engine never sends to them: the demo and tests use the in-memory transport.

The files are in the formats the importers read, so the demo and every
module's tests can run the whole loop offline:

```
lead-engine import sunbiz samples/tampa-bay/sunbiz_cordata.txt --snapshot 2026-10-01
lead-engine import dbpr samples/tampa-bay/dbpr_cilb_licensees.csv --snapshot 2026-10-01
lead-engine import csv:contacts samples/tampa-bay/contacts.csv
lead-engine import csv:open_poi samples/tampa-bay/open_poi.csv
lead-engine build
```

## Files

| File | Format | Records |
|---|---|---|
| `sunbiz_cordata.txt` | Florida Sunbiz cordata, fixed width, 1,440 characters per record, CRLF line ends, no header (`src/sources/sunbiz.ts`) | 12 entities |
| `dbpr_cilb_licensees.csv` | Florida DBPR construction licensee CSV with a header row (`src/sources/dbpr.ts`) | 13 licences |
| `contacts.csv` | canonical contacts (`ContactRowSchema`) | 13 contacts |
| `open_poi.csv` | canonical open POI (`PoiRowSchema`), Overture and Foursquare style rows | 9 places |

Licences join to entities by normalised business name plus 5-digit zip
(`matchKey`); contacts and places join the same way, by business name or DBA.

## What each business exercises

| Business (Sunbiz id / licence) | City, county | What it tests |
|---|---|---|
| Gulfside Air Conditioning & Heating, Inc. (P88000014522; CAC1814522, CMC1249002) | Tampa, Hillsborough | Family business: president Donald Holloway and vice president Kevin Holloway share a surname. Oldest licence (1985) and two licences, earliest wins. Owner-name email beats the role-based office@ address. Licence address spelled "AVENUE ... SUITE 3", entity "AVE STE 3". |
| Bayshore Plumbing Co. (P92000027810; CFC1425678) | St. Petersburg, Pinellas | Corporation with P and VP of different surnames (VP is not the owner). "CO." on Sunbiz vs "COMPANY" on the licence still join. Only email is role-based info@. |
| Sunrise Comfort Systems LLC (L04000056789; CAC1816890) | Brandon, Hillsborough | LLC titles MGR and AMBR; the MGR is the owner. A registered-agent firm (BAY BUSINESS FILINGS LLC) as RA. The owner's email beats another employee's. |
| Pinellas Pipe Works, Inc. (P96000041177; CFC1427001) | Largo, Pinellas | A registered-agent firm sits in officer slot 1 (type C) and is skipped; the owner is officer 2. The DBPR licensee is a hired qualifier (Employer Name set), never the owner. |
| Harbor Mechanical Services Corp (P90000033090; no licence) | Clearwater, Pinellas | Inactive entity (status I, last annual report 2019) with no licence: a candidate by name keyword only, and its open POI row is closed. Scoring knocks it out. |
| Frostline Heating & Air of Tampa Bay #214 LLC (L15000102233; CAC1819911) | Tampa, Hillsborough | Franchise-looking name; a franchisor company (type C) as MGR, the AP is the owner. Role-based service@ email. Add "frostline" to `targeting.exclude_name_patterns` to see the franchise knock-out. |
| Orange Blossom Plumbing, Inc. (P88000020456; CFC1424410) | Ocala, Marion | Outside the metro: skipped by build with a reason. |
| Tarpon Coast Enterprises, Inc. dba Tarpon Coast Air (P97000063321; CAC1815120) | Palm Harbor, Pinellas | The licensee is the company with a DBA; the contact and POI are filed under the DBA. Zip 34684 is outside the 335/336/337 prefixes, so the metro comes from the county. The owner's email is at gmail.com. |
| Bay Area Roofing Specialists, Inc. (P05000077120; CCC1330456) | Riverview, Hillsborough | Non-target trade (Certified Roofing Contractor): the licence is skipped with a reason. |
| Northstar Mechanical LLC (L01000034560; CMC1250333) | Tampa, Hillsborough | LLC title MGRM, hyphenated first name (Jean-Paul). HVAC by licence code CMC, not by name. Email at a .ca domain, which the jurisdiction check blocks. |
| Clearwater Reliable Plumbing Inc (P09000088012; CFC1428888) | Clearwater, Pinellas | Combined title code PD. The licence is Current but Inactive. |
| Wesley Chapel Comfort Pros LLC (L17000144501; CAC1820345) | Wesley Chapel, Pasco | Newest licence (2018) and entity (2017): short tenure, below the minimum. |
| Hector's A/C Service (no entity; CAC1817702) | Tampa, Hillsborough | Sole proprietor with no Sunbiz record: the DBPR self-proprietor is the owner. Apostrophe and "A/C" in the name. |

Seabreeze Bakery in `open_poi.csv` matches nothing and is ignored.

With the test config in `tests/helpers.ts` (Tampa Bay; HVAC and plumbing),
`buildProspects` creates 11 prospects and skips 2 (Orange Blossom outside the
metro, the roofing licence outside the verticals). A second build changes
nothing.

Officer names in the Sunbiz file are written surname first without a comma
("HOLLOWAY DONALD R"), the format the importer assumes for cordata
(`SUNBIZ_NAME_ORDER`); the field positions follow `SUNBIZ_LAYOUT`, which must
be checked against the official definition before production use.
