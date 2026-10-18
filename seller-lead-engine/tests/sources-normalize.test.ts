// Tests for name, street, date and status normalisation: the join key every
// source merge depends on, and the person/entity guard that keeps registered
// agents and companies from becoming owners.
import { describe, expect, it } from "vitest";
import {
  isPersonName,
  matchKey,
  normalizeBusinessName,
  normalizePhone,
  normalizeStatus,
  normalizeStreet,
  splitPersonName,
  titleCaseBusinessName,
  titleCaseName,
  titleCasePlace,
  toIsoDate,
  zip5,
} from "../src/sources/normalize.ts";

describe("normalizeBusinessName", () => {
  it("strips legal suffixes, punctuation and a leading THE", () => {
    expect(normalizeBusinessName("Gulfside Air Conditioning & Heating, Inc.")).toBe("GULFSIDE AIR CONDITIONING AND HEATING");
    expect(normalizeBusinessName("THE BAYSHORE PLUMBING CO.")).toBe("BAYSHORE PLUMBING");
    expect(normalizeBusinessName("Sunrise Comfort Systems, L.L.C.")).toBe("SUNRISE COMFORT SYSTEMS");
    expect(normalizeBusinessName("Sunrise Comfort Systems L L C")).toBe("SUNRISE COMFORT SYSTEMS");
    expect(normalizeBusinessName("Smith Dental P.A.")).toBe("SMITH DENTAL");
    expect(normalizeBusinessName("Smith Dental, PLLC")).toBe("SMITH DENTAL");
    expect(normalizeBusinessName("Acme Holdings Ltd")).toBe("ACME HOLDINGS");
  });

  it("makes CO, COMPANY, CORP and CORPORATION spellings of one business equal", () => {
    const a = normalizeBusinessName("BAYSHORE PLUMBING CO.");
    expect(normalizeBusinessName("Bayshore Plumbing Company")).toBe(a);
    expect(normalizeBusinessName("Bayshore Plumbing Corp")).toBe(a);
    expect(normalizeBusinessName("Bayshore Plumbing Corporation")).toBe(a);
  });

  it("strips stacked suffixes but keeps suffix words in the middle of a name", () => {
    expect(normalizeBusinessName("Acme Co Inc")).toBe("ACME");
    expect(normalizeBusinessName("Co Op Plumbing Inc")).toBe("CO OP PLUMBING");
    expect(normalizeBusinessName("The")).toBe("THE");
    expect(normalizeBusinessName("Inc")).toBe("INC");
  });

  it("treats apostrophes and slashes the same way on both sides of a join", () => {
    expect(normalizeBusinessName("HECTOR'S A/C SERVICE")).toBe(normalizeBusinessName("Hector’s A/C Service"));
    expect(normalizeBusinessName("HECTOR'S A/C SERVICE")).toBe("HECTORS A C SERVICE");
  });
});

describe("normalizeStreet", () => {
  it("abbreviates street words and drops suite and unit designators", () => {
    expect(normalizeStreet("4410 North Armenia Avenue, Suite 3")).toBe("4410 N ARMENIA AVE");
    expect(normalizeStreet("4410 N ARMENIA AVE STE 3")).toBe("4410 N ARMENIA AVE");
    expect(normalizeStreet("8890 Ulmerton Road # 12")).toBe("8890 ULMERTON RD");
    expect(normalizeStreet("8890 Ulmerton Rd #12B")).toBe("8890 ULMERTON RD");
    expect(normalizeStreet("27330 Wesley Chapel Boulevard Unit 104")).toBe("27330 WESLEY CHAPEL BLVD");
    expect(normalizeStreet("2215 4th Street North")).toBe("2215 4TH ST N");
  });
});

describe("matchKey and zip5", () => {
  it("joins the normalised name and the 5-digit zip", () => {
    expect(matchKey("Bayshore Plumbing Co.", "33704-1234")).toBe("BAYSHORE PLUMBING|33704");
    expect(matchKey("BAYSHORE PLUMBING COMPANY", "33704")).toBe(matchKey("Bayshore Plumbing Co.", "33704-1234"));
    expect(zip5("3370")).toBe("");
    expect(matchKey("X", "")).toBe("X|");
  });
});

describe("splitPersonName", () => {
  it("reads surname-first names with a comma", () => {
    expect(splitPersonName("HOLLOWAY, DONALD R")).toEqual({ first: "Donald", last: "Holloway", full: "Donald R Holloway" });
    expect(splitPersonName("NGUYEN, THANH V")).toEqual({ first: "Thanh", last: "Nguyen", full: "Thanh V Nguyen" });
  });

  it("reads given-name-first names", () => {
    expect(splitPersonName("Donald R. Holloway")).toEqual({ first: "Donald", last: "Holloway", full: "Donald R Holloway" });
    expect(splitPersonName("TYLER BOONE")).toEqual({ first: "Tyler", last: "Boone", full: "Tyler Boone" });
  });

  it("keeps generational suffixes off the first and last names", () => {
    expect(splitPersonName("SMITH JR, JOHN A")).toEqual({ first: "John", last: "Smith", full: "John A Smith Jr" });
    expect(splitPersonName("SMITH, JOHN A JR.")).toEqual({ first: "John", last: "Smith", full: "John A Smith Jr" });
    expect(splitPersonName("John Smith III")).toEqual({ first: "John", last: "Smith", full: "John Smith III" });
    expect(splitPersonName("Jane Doe, DDS")).toMatchObject({ first: "Jane", last: "Doe" }); // a credential after the comma is not a given name
  });

  it("title-cases hyphens, apostrophes and Mc names", () => {
    expect(splitPersonName("LEFEBVRE, JEAN-PAUL")).toMatchObject({ first: "Jean-Paul", last: "Lefebvre" });
    expect(splitPersonName("O'BRIEN, SEAN")).toMatchObject({ first: "Sean", last: "O'Brien" });
    expect(splitPersonName("MCDONALD, ALAN")).toMatchObject({ last: "McDonald" });
    expect(titleCaseName("SMITH-JONES")).toBe("Smith-Jones");
  });

  it("returns blanks for a blank name and a lone surname for one word", () => {
    expect(splitPersonName("  ")).toEqual({ first: "", last: "", full: "" });
    expect(splitPersonName("CHER")).toEqual({ first: "", last: "Cher", full: "Cher" });
  });
});

describe("isPersonName", () => {
  it("accepts people", () => {
    for (const n of ["HOLLOWAY, DONALD R", "Donald Holloway", "LEFEBVRE JEAN-PAUL", "O'BRIEN, SEAN P", "SMITH JR, JOHN"]) expect(isPersonName(n), n).toBe(true);
  });

  it("rejects companies, agents, blanks and single words", () => {
    for (const n of [
      "",
      "SUNCOAST REGISTERED AGENTS INC",
      "BAY BUSINESS FILINGS LLC",
      "CT CORPORATION SYSTEM",
      "FROSTLINE FRANCHISING LLC",
      "SMITH & JONES",
      "SMITH AND JONES",
      "ACME SERVICES",
      "REGISTERED AGENT SOLUTIONS",
      "123 MAIN ST",
      "MADONNA",
      "SMITH HOLDINGS",
    ]) expect(isPersonName(n), n).toBe(false);
  });
});

describe("toIsoDate", () => {
  it("reads every date form the state files use", () => {
    expect(toIsoDate("06/20/1985")).toBe("1985-06-20");
    expect(toIsoDate("6/2/1985")).toBe("1985-06-02");
    expect(toIsoDate("1985-06-20")).toBe("1985-06-20");
    expect(toIsoDate("1985-06-20T00:00:00.000")).toBe("1985-06-20");
    expect(toIsoDate("03141988")).toBe("1988-03-14"); // MMDDYYYY (Sunbiz)
    expect(toIsoDate("19880314")).toBe("1988-03-14"); // YYYYMMDD
  });

  it("gives blank for empty and zero dates, and undefined for unreadable ones", () => {
    expect(toIsoDate("")).toBe("");
    expect(toIsoDate(undefined)).toBe("");
    expect(toIsoDate("00000000")).toBe("");
    expect(toIsoDate("00/00/0000")).toBe("");
    expect(toIsoDate("13/45/2001")).toBeUndefined();
    expect(toIsoDate("2001-02-30")).toBeUndefined();
    expect(toIsoDate("6/2/85")).toBeUndefined();
    expect(toIsoDate("yesterday")).toBeUndefined();
  });
});

describe("statuses, phones and display names", () => {
  it("maps status words to active or inactive", () => {
    expect(normalizeStatus("Current")).toBe("active");
    expect(normalizeStatus("CLEAR")).toBe("active");
    expect(normalizeStatus("A")).toBe("active");
    expect(normalizeStatus("Inactive")).toBe("inactive");
    expect(normalizeStatus("Null and Void")).toBe("inactive");
    expect(normalizeStatus("Delinquent")).toBe("inactive");
    expect(normalizeStatus("Expired")).toBe("inactive");
    expect(normalizeStatus("Probation")).toBe("probation");
    expect(normalizeStatus("")).toBe("");
  });

  it("formats ten-digit US phones and keeps anything else", () => {
    expect(normalizePhone("(813) 555-0142")).toBe("813-555-0142");
    expect(normalizePhone("+1 813.555.0142")).toBe("813-555-0142");
    expect(normalizePhone("555-0142")).toBe("555-0142");
  });

  it("title-cases names for copy while keeping legal forms and acronyms", () => {
    expect(titleCaseBusinessName("GULFSIDE AIR CONDITIONING & HEATING, INC.")).toBe("Gulfside Air Conditioning & Heating, Inc.");
    expect(titleCaseBusinessName("FROSTLINE HEATING & AIR OF TAMPA BAY #214 LLC")).toBe("Frostline Heating & Air of Tampa Bay #214 LLC");
    expect(titleCaseBusinessName("HECTOR'S A/C SERVICE")).toBe("Hector's A/C Service");
    expect(titleCaseBusinessName("JRW HVAC, P.A.")).toBe("JRW HVAC, P.A.");
    expect(titleCasePlace("ST. PETERSBURG")).toBe("St. Petersburg");
    expect(titleCasePlace("PINELLAS COUNTY", { stripCounty: true })).toBe("Pinellas");
  });
});
