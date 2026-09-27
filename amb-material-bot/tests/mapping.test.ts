import { describe, expect, it } from "vitest";
import { mapBsLine, mapPnlLine, type MappingOverrides } from "../src/domain/chartOfAccounts.ts";

const none: MappingOverrides = new Map();
const pnl = (account: string, section?: string) => mapPnlLine({ account, section, year: 2025, amount: 1 }, none).category;
const bs = (account: string, section: string) => mapBsLine({ account, section, year: 2025, amount: 1 }, none).category;

describe("P&L mapping", () => {
  it("uses the section for revenue and COGS", () => {
    expect(pnl("Service Revenue - Residential", "Income")).toBe("revenue");
    expect(pnl("Subcontractors", "Cost of Goods Sold")).toBe("cogs");
    expect(pnl("Interest Income", "Other Income")).toBe("other_income");
  });

  it("does not mistake 'Commercial' for an ERC grant (regression)", () => {
    expect(pnl("Service Revenue - Commercial", "Income")).toBe("revenue");
    expect(pnl("ERC credit", "Income")).toBe("other_income");
  });

  it("separates owner pay from staff payroll", () => {
    expect(pnl("Payroll Expenses : Officer Compensation", "Expenses")).toBe("owner_comp");
    expect(pnl("Guaranteed payments to partners", "Expenses")).toBe("owner_comp");
    expect(pnl("Payroll Expenses : Taxes", "Expenses")).toBe("payroll");
    expect(pnl("Technician Wages", "Expenses")).toBe("payroll");
  });

  it("finds below-EBITDA items wherever they sit", () => {
    expect(pnl("Depreciation Expense", "Expenses")).toBe("depreciation_amortization");
    expect(pnl("Interest Expense", "Other Expenses")).toBe("interest_expense");
    expect(pnl("Loan interest", "Expenses")).toBe("interest_expense");
  });

  it("maps common opex and defaults the rest", () => {
    expect(pnl("Rent - Shop & Office", "Expenses")).toBe("rent");
    expect(pnl("Advertising & Marketing", "Expenses")).toBe("marketing");
    expect(pnl("Insurance", "Expenses")).toBe("other_opex");
    expect(mapPnlLine({ account: "Mystery", year: 2025, amount: 1 }, none).mappedBy).toBe("default");
  });

  it("lets an override win", () => {
    const o: MappingOverrides = new Map([["subcontractors", "payroll"]]);
    expect(mapPnlLine({ account: "Subcontractors", section: "Cost of Goods Sold", year: 2025, amount: 1 }, o)).toEqual({
      category: "payroll",
      mappedBy: "override",
    });
  });
});

describe("balance sheet mapping", () => {
  it("maps assets", () => {
    expect(bs("Current Assets : Bank Accounts : Business Checking", "ASSETS > Current Assets > Bank Accounts")).toBe("cash");
    expect(bs("Current Assets : Accounts Receivable : Accounts Receivable (A/R)", "ASSETS > Current Assets")).toBe("accounts_receivable");
    expect(bs("Current Assets : Other Current Assets : Inventory Asset", "ASSETS > Current Assets")).toBe("inventory");
    expect(bs("Fixed Assets : Accumulated Depreciation", "ASSETS > Fixed Assets")).toBe("fixed_assets_net");
    expect(bs("Other Assets : Security Deposit", "ASSETS > Other Assets")).toBe("other_assets");
  });

  it("maps liabilities and equity", () => {
    expect(bs("Current Liabilities : Accounts Payable : Accounts Payable (A/P)", "Liabilities > Current Liabilities")).toBe("accounts_payable");
    expect(bs("Current Liabilities : Other Current Liabilities : Customer Deposits", "Liabilities > Current Liabilities")).toBe("other_current_liabilities");
    expect(bs("Long-Term Liabilities : SBA Loan", "Liabilities > Long-Term Liabilities")).toBe("debt");
    expect(bs("Net Income", "Equity")).toBe("equity");
  });
});
