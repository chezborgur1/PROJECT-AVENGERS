import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { idAllocator, nextId } from "../src/store/csvTable.ts";
import { addBusinessDays, isoWeekLabel, usFederalHolidays, yearsSince } from "../src/util/dates.ts";
import { makeProspect, tempStores, testConfig } from "./helpers.ts";

describe("csv tables", () => {
  it("round-trips typed rows and keeps columns it does not own", () => {
    const stores = tempStores();
    const a = makeProspect();
    const b = makeProspect();
    stores.prospects.upsert([a, b]);
    const text = fs.readFileSync(stores.prospects.file, "utf8").replace("prospect_id,", "advisor_note,prospect_id,").replace(/\n(P-\d+),/g, "\nkeep me,$1,");
    fs.writeFileSync(stores.prospects.file, text);
    stores.prospects.upsert([{ ...a, status: "in_sequence" }]);
    const { rows, invalid } = stores.prospects.load();
    expect(invalid).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(["in_sequence", "scored"]);
    expect(rows[0]).toMatchObject({ score: 78, officer_count: 1, tier: "A" });
    expect(fs.readFileSync(stores.prospects.file, "utf8")).toContain("keep me");
  });

  it("reports a bad row without blocking the rest", () => {
    const stores = tempStores();
    stores.prospects.upsert([makeProspect()]);
    fs.appendFileSync(stores.prospects.file, "P-99999,not_a_status\n");
    const { rows, invalid } = stores.prospects.load();
    expect(rows.length).toBe(1);
    expect(invalid[0]).toMatchObject({ key: "P-99999" });
    expect(() => stores.prospects.rows(true)).toThrow(/line 3/);
  });

  it("allocates ids after the highest in use", () => {
    expect(nextId("P", 5, ["P-00007", "P-00002", "X-1"])).toBe("P-00008");
    const next = idAllocator("T", 6, []);
    expect([next(), next()]).toEqual(["T-000001", "T-000002"]);
  });
});

describe("dates", () => {
  it("skips weekends and holidays", () => {
    expect(addBusinessDays("2026-11-06", 1)).toBe("2026-11-09");
    expect(addBusinessDays("2026-11-10", 1, ["2026-11-11"])).toBe("2026-11-12");
    expect(usFederalHolidays(2026)).toEqual(expect.arrayContaining(["2026-11-11", "2026-11-26", "2026-11-27", "2026-12-25", "2026-07-03"]));
    expect(yearsSince("1994-06-15", "2026-10-18")).toBe(32);
    expect(isoWeekLabel("2026-10-18")).toBe("2026-W42");
  });

  it("parses the test config with defaults filled in", () => {
    const c = testConfig();
    expect(c.sending).toMatchObject({ mode: "draft", transport: "outbox", ramp: [5, 10, 15, 20] });
    expect(c.lead_sales.enabled).toBe(false);
  });
});
