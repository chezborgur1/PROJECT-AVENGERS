import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { emptyPnl } from "../src/domain/financials.ts";
import { buildPayrollRegister, loadPayrollCsv, scaleToTotal, type PayrollFile } from "../src/ingest/payroll.ts";
import { REPO, tmpDir } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");

function write(lines: string[]): string {
  const file = path.join(tmpDir(), "payroll.csv");
  fs.writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

const pnlWith = (payroll: number, owner: number) => ({ ...emptyPnl(), payroll, owner_comp: owner });
const ctx = { years: [2024, 2025], fyEndMonth: 12, asOfMonth: "2025-12", pnl: { 2024: pnlWith(120, 50), 2025: pnlWith(130, 50) } };

describe("payroll.csv", () => {
  it("reads the sample register", async () => {
    const pf = await loadPayrollCsv(path.join(SAMPLE, "payroll.csv"), 12);
    expect(pf.warnings).toEqual([]);
    expect(pf.rows).toHaveLength(29);
    expect(pf.rows[0]).toMatchObject({ name: "Mark Delaney", isOwner: true, isManagement: true, payBasis: "salary", wagesByFiscalYear: { 2025: 200_000 } });
    expect(pf.rows[1]).toMatchObject({ role: "Service technician", department: "Field service", payBasis: "hourly_plus_commission", hireDate: "2012-05-14" });
    const left = pf.rows.find((r) => r.terminationDate)!;
    expect(left.terminationType).toBe("resignation");
    expect(pf.rows.find((r) => r.name === "Lisa Tran")).toMatchObject({ isManagement: true, department: "Management" });
  });

  it("reads employer-cost columns, loose vocabulary and skips rows it cannot place", async () => {
    const file = write([
      "Employee,Title,Dept,Hired,Last day,Reason,Pay type,Owner,Wages 2025,Employer costs 2025",
      "Ann,Tech,Field,1/2/2020,,,hourly,,100,15",
      "Bob,Manager,,2019-05-01,2025-06-30,laid off,exempt,,80,12",
      "Cy,Tech,Field,,,,,,50,",
      "Dee,,Field,2021-01-01,,,,,50,",
    ]);
    const pf = await loadPayrollCsv(file, 12);
    expect(pf.rows).toHaveLength(2);
    expect(pf.rows[0]).toMatchObject({ payBasis: "hourly", wagesByFiscalYear: { 2025: 100 }, employerCostsByFiscalYear: { 2025: 15 } });
    expect(pf.rows[1]).toMatchObject({ department: "Manager", payBasis: "salary", terminationDate: "2025-06-30", terminationType: "termination" });
    expect(pf.warnings).toEqual([
      "payroll.csv line 4 (Cy): no hire date; row skipped (tenure and the roll-forward need it).",
      "payroll.csv line 5 (Dee): no role; row skipped.",
      "payroll.csv: no department for 1 employee(s); the role is used as the department.",
    ]);
  });

  it("allocates employer costs pro rata so wages plus costs tie to the P&L payroll line", () => {
    const pf: PayrollFile = {
      file: "payroll.csv",
      warnings: [],
      rows: [
        { name: "Owner", role: "Owner", department: "Owner", isOwner: true, isManagement: true, hireDate: "2010-01-01", payBasis: "salary", fte: 1, wagesByFiscalYear: { 2024: 50, 2025: 50 }, line: 2 },
        { name: "A", role: "Tech", department: "Field", isOwner: false, isManagement: false, hireDate: "2020-01-01", payBasis: "hourly", fte: 1, wagesByFiscalYear: { 2024: 60, 2025: 70 }, line: 3 },
        { name: "B", role: "Tech", department: "Field", isOwner: false, isManagement: false, hireDate: "2021-01-01", payBasis: "hourly", fte: 1, wagesByFiscalYear: { 2024: 40, 2025: 30 }, line: 4 },
      ],
    };
    const { payroll, warnings } = buildPayrollRegister(pf, ctx);
    expect(warnings).toEqual([]);
    expect(payroll.employees.map((e) => e.id)).toEqual(["E-01", "E-02", "E-03"]);
    // The owner's employer taxes on the $50 P&L owner line come out first, at statutory rates: 50 × (6.2% + 1.45% + 0.6%) = $4.
    // FY2025 staff pool = 130 − 100 − 4 = 26, split 70:30; FY2024 = 120 − 100 − 4 = 16, split 60:40.
    expect(payroll.employees.map((e) => e.employerCostsByFiscalYear[2025])).toEqual([4, 18, 8]);
    expect(payroll.employees.map((e) => e.employerCostsByFiscalYear[2024])).toEqual([4, 10, 6]);
    // The register still ties to the payroll line: staff wages and costs plus the owner's employer taxes.
    expect(payroll.totalsByFiscalYear).toEqual({ 2024: 120, 2025: 130 });
    expect(payroll.employees[0]!.wagesByFiscalYear).toEqual({ 2024: 50, 2025: 50 });
  });

  it("keeps employer costs the file gives and flags a register that does not tie", () => {
    const pf: PayrollFile = {
      file: "payroll.csv",
      warnings: [],
      rows: [
        { name: "A", role: "Tech", department: "Field", isOwner: false, isManagement: false, hireDate: "2020-01-01", payBasis: "hourly", fte: 1, wagesByFiscalYear: { 2024: 60, 2025: 70 }, employerCostsByFiscalYear: { 2024: 10, 2025: 10 }, line: 2 },
        { name: "B", role: "Tech", department: "Field", isOwner: false, isManagement: false, hireDate: "2021-01-01", payBasis: "hourly", fte: 1, wagesByFiscalYear: { 2024: 40, 2025: 90 }, employerCostsByFiscalYear: { 2024: 10, 2025: 10 }, line: 3 },
      ],
    };
    const { payroll, warnings } = buildPayrollRegister(pf, ctx);
    expect(payroll.totalsByFiscalYear).toEqual({ 2024: 120, 2025: 180 });
    expect(warnings).toEqual([
      "FY2025: payroll register ($180) differs from the P&L payroll line ($130) by 38.5% (check C13).",
      "payroll.csv has no row flagged owner = yes; the owner's pay is read from the P&L only.",
    ]);
  });

  it("zeroes the pool when wages exceed the P&L line and cuts the register to the as-of month", () => {
    const pf: PayrollFile = {
      file: "payroll.csv",
      warnings: [],
      rows: [
        { name: "Owner", role: "Owner", department: "Owner", isOwner: true, isManagement: true, hireDate: "2010-01-01", payBasis: "salary", fte: 1, wagesByFiscalYear: { 2024: 50, 2025: 60 }, line: 2 },
        { name: "A", role: "Tech", department: "Field", isOwner: false, isManagement: false, hireDate: "2020-01-01", terminationDate: "2026-01-15", terminationType: "resignation", payBasis: "hourly", fte: 1, wagesByFiscalYear: { 2024: 200, 2025: 100 }, line: 3 },
        { name: "New", role: "Tech", department: "Field", isOwner: false, isManagement: false, hireDate: "2026-01-05", payBasis: "hourly", fte: 1, wagesByFiscalYear: {}, line: 4 },
      ],
    };
    const { payroll, warnings } = buildPayrollRegister(pf, ctx);
    expect(payroll.employees).toHaveLength(2);
    expect(payroll.employees[1]!.terminationDate).toBeUndefined();
    // FY2025: 130 − 100 wages − 4 of the owner's employer taxes; FY2024 has no pool, so the owner's share is zero too.
    expect(payroll.employees[1]!.employerCostsByFiscalYear).toEqual({ 2024: 0, 2025: 26 });
    expect(payroll.employees[0]!.employerCostsByFiscalYear).toEqual({ 2024: 0, 2025: 4 });
    expect(warnings.some((w) => /FY2024: wages in payroll.csv \(\$200\) exceed the P&L payroll line \(\$120\)/.test(w))).toBe(true);
    expect(warnings.some((w) => /FY2025: owner pay in payroll.csv \(\$60\) differs from the P&L owner compensation line \(\$50\)/.test(w))).toBe(true);
    expect(warnings.some((w) => /1 employee\(s\) hired after the as-of month/.test(w))).toBe(true);
    expect(warnings.some((w) => /1 departure\(s\) after the as-of month/.test(w))).toBe(true);
  });

  it("scaleToTotal keeps whole dollars and puts the residual on the largest", () => {
    expect(scaleToTotal([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(scaleToTotal([0, 0], 10)).toEqual([10, 0]);
    expect(scaleToTotal([], 10)).toEqual([]);
  });
});
