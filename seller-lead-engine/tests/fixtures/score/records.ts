// Builders for the import records the fatigue checks read (entities and
// licences), with every column present, for the score tests.

import { EntityRowSchema, LicenseRowSchema, type EntityRow, type LicenseRow } from "../../../src/domain/schema.ts";
import type { PlacesDetails } from "../../../src/score/places.ts";

function blank(shape: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.keys(shape).map((k) => [k, ""]));
}

/** An active Florida corporation with a 2026 annual report filed on time. */
export function makeEntity(overrides: Partial<EntityRow> = {}): EntityRow {
  const row = EntityRowSchema.parse({
    ...blank(EntityRowSchema.shape),
    source: "sunbiz",
    source_record_id: "F96000001",
    state: "FL",
    entity_name: "EXAMPLE AIR INC",
    entity_type: "DOMP",
    status: "active",
    formation_date: "1996-03-01",
    officer1_name: "EXAMPLE, JOHN",
    officer1_title: "P",
    officer1_is_person: "Y",
    last_annual_report_date: "2026-02-10",
    source_snapshot_date: "2026-10-01",
  });
  return { ...row, ...overrides };
}

/** An active DBPR licence expiring on the next biennial cycle. */
export function makeLicense(overrides: Partial<LicenseRow> = {}): LicenseRow {
  const row = LicenseRowSchema.parse({
    ...blank(LicenseRowSchema.shape),
    source: "dbpr",
    source_record_id: "CAC1800001",
    license_number: "CAC1800001",
    license_type: "Certified Air Conditioning Contractor",
    status: "Current,Active",
    business_name: "EXAMPLE AIR INC",
    person_name: "EXAMPLE, JOHN",
    person_role: "licensee",
    original_issue_date: "1994-06-15",
    expiration_date: "2028-08-31",
    state: "FL",
    zip: "33602",
  });
  return { ...row, ...overrides };
}

/** Places details as the cache would hold them. */
export function makeDetails(overrides: Partial<PlacesDetails> = {}): PlacesDetails {
  return { placeId: "ChIJexample0000001", businessStatus: "OPERATIONAL", rating: 4.7, userRatingCount: 180, websiteUri: "https://exampleair.example/", fetchedAt: "2026-10-10T12:00:00Z", ...overrides };
}
