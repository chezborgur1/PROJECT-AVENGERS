import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadKpisCsv, parseKpiUnit, parsePeriodToken } from "../src/ingest/kpis.ts";
import { REPO, tmpDir } from "./helpers.ts";

describe("parsePeriodToken", () => {
  it.each([
    ["FY2025", { kind: "fiscal_year", fiscalYear: 2025 }],
    ["fy 2025", { kind: "fiscal_year", fiscalYear: 2025 }],
    ["2025", { kind: "fiscal_year", fiscalYear: 2025 }],
    ["2025-07", { kind: "month", key: "2025-07" }],
    ["Jul-25", { kind: "month", key: "2025-07" }],
    ["Jul 2025", { kind: "month", key: "2025-07" }],
    ["2025-12-31", { kind: "point", date: "2025-12-31" }],
    ["12/31/2025", { kind: "point", date: "2025-12-31" }],
    ["as of Dec 31, 2025", { kind: "point", date: "2025-12-31" }],
    ["LTM Jul-25", { kind: "ltm", end: "2025-07" }],
    ["YTD 2025-07", { kind: "ytd", end: "2025-07" }],
    ["PF Jul 2025", { kind: "pf", end: "2025-07" }],
    ["Jul 2024 - Jun 2025", { kind: "fiscal_year", fiscalYear: 2025 }],
  ])("%s", (raw, expected) => expect(parsePeriodToken(raw, 6)).toEqual(expected));

  it("returns undefined for anything else", () => {
    expect(parsePeriodToken("latest", 12)).toBeUndefined();
    expect(parsePeriodToken("Q3 2025", 12)).toBeUndefined();
  });
});

describe("parseKpiUnit", () => {
  it.each([
    ["#", "count"],
    ["members", "count"],
    ["$", "currency"],
    ["%", "percent"],
    ["x", "ratio"],
    ["hrs", "hours"],
    ["stars", "rating"],
    ["sq ft", "sq_ft"],
    ["Miles", "miles"],
    ["sq_ft", "sq_ft"],
  ])("%s -> %s", (raw, unit) => expect(parseKpiUnit(raw)).toBe(unit));
  it("rejects units it cannot place", () => expect(parseKpiUnit("widgets")).toBeUndefined());
});

describe("kpis.csv", () => {
  it("reads the sample metrics as point-in-time series with management evidence", async () => {
    const { kpis, warnings } = await loadKpisCsv(path.join(REPO, "samples/project-ridgeline/kpis.csv"), 12);
    expect(warnings).toEqual([]);
    expect(kpis).toHaveLength(10);
    expect(kpis[0]).toEqual({
      key: "maintenance_members",
      label: "Active maintenance-agreement members",
      unit: "count",
      values: { "AT2026-09-21": 1_450 },
      definition: "Members with an active agreement: two tune-ups a year, priority scheduling, 15% repair discount",
      source: "intake-notes.md (intake call; request received 2026-09-21)",
      evidence: "management_representation",
    });
    expect(kpis.find((k) => k.key === "renewal_rate")!.values).toEqual({ "AT2026-09-21": 0.82 });
    const rating = kpis.find((k) => k.key === "google_rating")!;
    expect(rating).toMatchObject({ unit: "rating", values: { "AT2026-09-21": 4.8 } });
    expect(rating.definition).toBeUndefined();
  });

  it("groups periods under one metric and reports what it skipped", async () => {
    const file = path.join(tmpDir(), "kpis.csv");
    fs.writeFileSync(
      file,
      [
        "Metric,Unit,Period,Value,Evidence,Source",
        "Members,#,FY2024,1200,Documented,ServiceTitan export",
        "Members,#,FY2025,1450,,",
        "Members,%,FY2025,1,,",
        "Renewal rate,%,FY2025,82%,,",
        "Renewal rate,%,FY2025,0.8,,",
        "Fleet,vans,2025-12-31,18,,",
        "Rating,stars,soon,4.8,,",
        "Rating,stars,2025-12-31,n/a,,",
      ].join("\n"),
    );
    const { kpis, warnings } = await loadKpisCsv(file, 12);
    expect(kpis.map((k) => k.key)).toEqual(["members", "renewal_rate", "fleet"]);
    expect(kpis[0]).toMatchObject({ label: "Members", values: { FY2024: 1_200, FY2025: 1_450 }, source: "ServiceTitan export", evidence: "management_representation" });
    expect(kpis[1]!.values).toEqual({ FY2025: 0.8 });
    expect(kpis[2]).toMatchObject({ unit: "count", values: { "AT2025-12-31": 18 }, source: "kpis.csv" });
    expect(warnings).toEqual([
      "kpis.csv line 4 (Members): unit percent differs from the count used earlier for the same metric; row skipped.",
      "kpis.csv line 6 (Renewal rate): a second value for FY2025 replaces the first.",
      'kpis.csv line 8 (Rating): period "soon" not understood (FY2025, 2025-07, Jul-25, 2025-12-31, LTM Jul-25); row skipped.',
      'kpis.csv line 9 (Rating): value "n/a" is not a number; row skipped.',
    ]);
  });
});
