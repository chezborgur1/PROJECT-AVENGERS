import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCustomerList, loadCustomersCsv, type CustomerFile } from "../src/ingest/customers.ts";
import { REPO, tmpDir } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");

function write(lines: string[]): string {
  const file = path.join(tmpDir(), "customers.csv");
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

const ctx = { years: [2023, 2024, 2025], fyEndMonth: 12, asOfMonth: "2025-12", revenueByFiscalYear: { 2023: 1_000, 2024: 1_000, 2025: 1_000 }, term: "Customer" as const };

describe("customers.csv", () => {
  it("reads the sample file with its residual row", async () => {
    const cf = await loadCustomersCsv(path.join(SAMPLE, "customers.csv"), 12);
    expect(cf.warnings).toEqual([]);
    expect(cf.rows).toHaveLength(63);
    const residual = cf.rows.filter((r) => r.residual);
    expect(residual).toHaveLength(1);
    expect(residual[0]!.revenueByFiscalYear).toEqual({ 2023: 1_808_600, 2024: 2_016_100, 2025: 2_229_100 });
    const lost = cf.rows.find((r) => r.name === "Bexley Rentals LLC")!;
    expect(lost).toMatchObject({ type: "Residential landlord", contractBasis: "time_and_materials", startDate: "2012-03-01", endDate: "2023-04-30", lossReason: "non_regrettable" });
  });

  it("reads monthly revenue columns, dates in several forms and loose vocabulary", async () => {
    const file = write([
      "Customer,Type,Basis,Start,End,Reason,Jan 2025,Feb 2025,2025-03",
      "Acme Property,Property manager,Contract,3/15/2024,,,100,110,120",
      "Old Diner,Restaurant,Maintenance plan,Jan 2020,\"Feb 28, 2025\",Not regrettable,50,50,0",
      "Gone Co,Retail,T&M,2021-06-01,2025-01-31,moved away,10,0,0",
      ",,,,,,1,2,3",
    ]);
    const cf = await loadCustomersCsv(file, 12);
    expect(cf.rows).toHaveLength(3);
    expect(cf.rows[0]).toMatchObject({ contractBasis: "contract", startDate: "2024-03-15", revenueByMonth: { "2025-01": 100, "2025-02": 110, "2025-03": 120 }, revenueByFiscalYear: { 2025: 330 } });
    expect(cf.rows[1]).toMatchObject({ contractBasis: "maintenance_agreement", startDate: "2020-01-31", endDate: "2025-02-28", lossReason: "non_regrettable" });
    expect(cf.rows[2]).toMatchObject({ contractBasis: "time_and_materials", lossReason: "unclassified" });
    expect(cf.warnings).toEqual(['customers.csv line 4 (Gone Co): loss reason "moved away" is not regrettable, non-regrettable or unclassified; recorded as unclassified.', "customers.csv line 5: no customer name or id; row skipped."]);
  });

  it("rejects a file without revenue columns", async () => {
    await expect(loadCustomersCsv(write(["Customer,Type", "A,B"]), 12)).rejects.toThrow(/no revenue columns/);
  });

  it("codes customers by the latest full year, then earlier years, then file order", () => {
    const cf: CustomerFile = {
      file: "customers.csv",
      warnings: [],
      rows: [
        { name: "Small", revenueByFiscalYear: { 2023: 10, 2024: 10, 2025: 10 }, residual: false, line: 2 },
        { name: "Big", revenueByFiscalYear: { 2023: 1, 2024: 1, 2025: 500 }, residual: false, line: 3 },
        { name: "Tie B", revenueByFiscalYear: { 2023: 5, 2024: 40, 2025: 100 }, residual: false, line: 4 },
        { name: "Tie A", revenueByFiscalYear: { 2023: 9, 2024: 40, 2025: 100 }, residual: false, line: 5 },
        { name: "Households", revenueByFiscalYear: { 2023: 975, 2024: 909, 2025: 290 }, residual: true, line: 6 },
      ],
    };
    const { customers, warnings } = buildCustomerList(cf, ctx);
    expect(customers.customers.map((c) => [c.id, c.name])).toEqual([
      ["C-001", "Big"],
      ["C-002", "Tie A"],
      ["C-003", "Tie B"],
      ["C-004", "Small"],
    ]);
    expect(customers.residual).toEqual({ label: "Households", revenueByFiscalYear: { 2023: 975, 2024: 909, 2025: 290 } });
    expect(customers.totalsByFiscalYear).toEqual({ 2023: 1_000, 2024: 1_000, 2025: 1_000 });
    expect(customers.asOfMonth).toBe("2025-12");
    expect(warnings).toEqual([]);
  });

  it("flags a list that does not tie to the P&L and truncates everything after the as-of month", () => {
    const cf: CustomerFile = {
      file: "customers.csv",
      warnings: [],
      rows: [
        { name: "A", startDate: "2020-01-01", revenueByFiscalYear: { 2023: 900, 2024: 900, 2025: 900, 2026: 300 }, revenueByMonth: { "2025-12": 80, "2026-01": 300 }, residual: false, line: 2 },
        { name: "Ends later", startDate: "2020-01-01", endDate: "2026-02-15", lossReason: "regrettable", revenueByFiscalYear: { 2025: 50 }, residual: false, line: 3 },
        { name: "Starts later", startDate: "2026-01-05", revenueByFiscalYear: { 2026: 10 }, residual: false, line: 4 },
      ],
    };
    const { customers, warnings } = buildCustomerList(cf, ctx);
    expect(customers.customers).toHaveLength(2);
    expect(customers.customers[0]!.revenueByFiscalYear).toEqual({ 2023: 900, 2024: 900, 2025: 900 });
    expect(customers.customers[0]!.revenueByMonth).toEqual({ "2025-12": 80 });
    expect(customers.customers[1]).toMatchObject({ name: "Ends later" });
    expect(customers.customers[1]!.endDate).toBeUndefined();
    expect(customers.customers[1]!.lossReason).toBeUndefined();
    expect(warnings.some((w) => /1 customer\(s\) start after the as-of month \(Dec-25\)/.test(w))).toBe(true);
    expect(warnings.some((w) => /1 customer\(s\) end after the as-of month/.test(w))).toBe(true);
    expect(warnings.some((w) => /FY2023 customer revenue in customers.csv \(\$900\) differs from P&L revenue \(\$1,000\) by -10.0% \(check C12\)/.test(w))).toBe(true);
  });

  it("discloses a list that ends before the P&L does", () => {
    const cf: CustomerFile = { file: "customers.csv", warnings: [], rows: [{ name: "A", revenueByFiscalYear: { 2023: 1_000, 2024: 1_000 }, residual: false, line: 2 }] };
    const { customers, warnings } = buildCustomerList(cf, ctx);
    expect(customers.asOfMonth).toBe("2024-12");
    expect(warnings.some((w) => /Customer data in customers.csv runs to Dec-24; the P&L runs to Dec-25/.test(w))).toBe(true);
  });
});
