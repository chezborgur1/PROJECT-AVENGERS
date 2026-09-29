import { describe, expect, it } from "vitest";
import { clientLabel, parseAmount, parsePeriodLabel } from "../src/util/tables.ts";

describe("parseAmount", () => {
  it.each([
    ["1,234.50", 1234.5],
    ["$1,234", 1234],
    ["(1,234.00)", -1234],
    ["-18,400.00", -18400],
    ["500-", -500],
    ["", undefined],
    ["-", undefined],
    ["n/a", undefined],
  ])("%s -> %s", (raw, expected) => expect(parseAmount(raw)).toBe(expected));
});

describe("clientLabel", () => {
  it.each([
    ["Vehicle Loans", "Vehicle loans"],
    ["Service Revenue - Residential", "Service revenue (residential)"],
    ["Notes Payable – Vehicles", "Notes payable (vehicles)"],
    ["Revenue - Service - Commercial", "Revenue (service, commercial)"],
    ["PPP Loan Forgiveness", "PPP loan forgiveness"],
    ["Owner's Draw (HVAC)", "Owner's draw (HVAC)"],
    // Proper names keep their exported case.
    ["Huntington Bank Line of Credit", "Huntington Bank Line of Credit"],
    ["Service - Columbus", "Service (Columbus)"],
    ["Loan - Fifth Third", "Loan (Fifth Third)"],
  ])("%s -> %s", (raw, expected) => expect(clientLabel(raw)).toBe(expected));
});

describe("parsePeriodLabel", () => {
  it("reads annual QuickBooks columns", () => {
    expect(parsePeriodLabel("Jan - Dec 2024", 12)).toMatchObject({ fiscalYear: 2024, months: 12 });
    expect(parsePeriodLabel("Jan 1 - Dec 31, 2024", 12)).toMatchObject({ fiscalYear: 2024, months: 12 });
    expect(parsePeriodLabel("FY2023", 12)).toMatchObject({ fiscalYear: 2023, months: 12 });
  });

  it("assigns months to a June fiscal year", () => {
    expect(parsePeriodLabel("Jul 2024", 6)).toMatchObject({ fiscalYear: 2025, months: 1 });
    expect(parsePeriodLabel("Jun 2025", 6)).toMatchObject({ fiscalYear: 2025, months: 1 });
    expect(parsePeriodLabel("Jul 2024 - Jun 2025", 6)).toMatchObject({ fiscalYear: 2025, months: 12 });
  });

  it("treats balance sheet dates as points in time", () => {
    expect(parsePeriodLabel("Dec 31, 2025", 12)).toMatchObject({ fiscalYear: 2025, months: 0, endMonth: 12 });
    expect(parsePeriodLabel("As of Dec 31, 2025", 12)).toMatchObject({ fiscalYear: 2025, months: 0 });
  });

  it("flags a partial year", () => {
    expect(parsePeriodLabel("Jan - Aug 2026", 12)).toMatchObject({ fiscalYear: 2026, months: 8 });
  });

  it("ignores totals and non-periods", () => {
    expect(parsePeriodLabel("Total", 12)).toBeUndefined();
    expect(parsePeriodLabel("% of Income", 12)).toBeUndefined();
    expect(parsePeriodLabel("Account", 12)).toBeUndefined();
  });
});
