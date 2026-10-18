import { describe, expect, it } from "vitest";
import { ageMidpoint, estimateOwnerAge } from "../src/score/age.ts";
import { makeProspect } from "./helpers.ts";

const TODAY = "2026-10-18";

describe("owner age estimate", () => {
  it("uses the graduation year first, at 25 to 27 years old", () => {
    const p = makeProspect({ year_graduated: 1985, license_issue_date: "1986-07-01", formation_date: "1990-01-01" });
    expect(estimateOwnerAge(p, TODAY)).toEqual({ low: 66, high: 68, method: "graduation_year" });
  });

  it("falls back to the licence issue year, at 25 to 32 years old", () => {
    const p = makeProspect({ year_graduated: undefined, license_issue_date: "1994-06-15", formation_date: "1996-03-01" });
    expect(estimateOwnerAge(p, TODAY)).toEqual({ low: 57, high: 64, method: "license_issue_year" });
  });

  it("falls back to the formation year, at 28 to 40 years old", () => {
    const p = makeProspect({ license_issue_date: "", formation_date: "2001-05-20" });
    expect(estimateOwnerAge(p, TODAY)).toEqual({ low: 53, high: 65, method: "formation_year" });
  });

  it("keeps the more confident licence year even when the formation year is older", () => {
    const p = makeProspect({ license_issue_date: "2005-01-01", formation_date: "1980-01-01" });
    expect(estimateOwnerAge(p, TODAY).method).toBe("license_issue_year");
  });

  it("returns an empty estimate when no record supports one", () => {
    const p = makeProspect({ license_issue_date: "", formation_date: "", year_graduated: undefined });
    const age = estimateOwnerAge(p, TODAY);
    expect(age).toEqual({ low: 0, high: 0, method: "" });
    expect(ageMidpoint(age)).toBeUndefined();
  });

  it("skips future and implausibly old years as bad data", () => {
    expect(estimateOwnerAge(makeProspect({ year_graduated: 2030, license_issue_date: "", formation_date: "2000-01-01" }), TODAY).method).toBe("formation_year");
    expect(estimateOwnerAge(makeProspect({ year_graduated: undefined, license_issue_date: "1920-01-01", formation_date: "1999-01-01" }), TODAY).method).toBe("formation_year");
    expect(estimateOwnerAge(makeProspect({ license_issue_date: "2027-01-01", formation_date: "" }), TODAY).method).toBe("");
  });

  it("works from today's year only, so the result is deterministic", () => {
    const p = makeProspect({ license_issue_date: "1994-06-15" });
    expect(estimateOwnerAge(p, "2026-01-01")).toEqual(estimateOwnerAge(p, "2026-12-31"));
    expect(ageMidpoint(estimateOwnerAge(p, TODAY))).toBe(60.5);
  });

  it("refuses a today that is not an ISO date", () => {
    expect(() => estimateOwnerAge(makeProspect(), "18/10/2026")).toThrow(/YYYY-MM-DD/);
  });
});
