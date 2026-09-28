import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractionToSource, type Extraction } from "../src/ingest/aiExtract.ts";
import type { IngestExtract } from "../src/ingest/extract.ts";
import { mergeSources } from "../src/ingest/merge.ts";
import { parseQuickbooksExport } from "../src/ingest/quickbooksExport.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");

const taxReturn: Extraction = {
  document_type: "tax_return",
  form: "Form 1120-S",
  entity_name: "Ridgeline Comfort Services LLC",
  books_basis: "cash",
  fiscal_years: [
    {
      year: 2025,
      months_covered: 12,
      pnl_lines: [
        { label: "Gross receipts or sales", line_reference: "1a", amount: 2_950_000, category: "revenue" },
        { label: "Cost of goods sold", line_reference: "2", amount: 1_158_900, category: "cogs" },
        { label: "Compensation of officers", line_reference: "7", amount: 200_000, category: "owner_comp" },
        { label: "Salaries and wages", line_reference: "8", amount: 904_700, category: "payroll" },
        { label: "Other deductions", line_reference: "19", amount: 400_000, category: "other_opex" },
      ],
      balance_sheet_lines: [],
      equipment_placed_in_service: 45_000,
    },
  ],
  bank_months: [],
  notes: [],
};

describe("source reconciliation", () => {
  it("records every line as a structured difference and flags the material ones", async () => {
    const qb = await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv"), 12);
    const tr = extractionToSource(taxReturn, "/deals/x/2025 1120-S.pdf", 12);
    const ds = mergeSources({ extracts: [tr, qb], overrides: new Map(), addbacks: [] });
    const rows = ds.reconciliations!;
    expect(rows.map((r) => r.line)).toEqual(["revenue", "cogs", "total_expenses", "net_income"]);
    expect(rows[0]).toMatchObject({
      fiscalYear: 2025,
      chosen: { source: "quickbooks_export", file: "QuickBooks Profit and Loss FY23-FY25.csv", amount: 3_040_800 },
      other: { source: "tax_return", file: "2025 1120-S.pdf", amount: 2_950_000 },
      difference: 90_800,
      material: true,
    });
    expect(rows[0]!.differencePct).toBeCloseTo(90_800 / 3_040_800, 6);
    expect(rows[1]).toMatchObject({ line: "cogs", difference: 0, material: false });
    // QuickBooks expenses 1,637,885 + 14,300 interest; the return shows 1,504,700.
    expect(rows[2]).toMatchObject({ line: "total_expenses", chosen: { amount: 1_652_185 }, other: { amount: 1_504_700 }, material: true });
    expect(rows[3]).toMatchObject({ line: "net_income", chosen: { amount: 232_815 }, other: { amount: 286_400 }, material: true });
    expect(ds.warnings.some((w) => /FY2025 revenue differs between QuickBooks export \(\$3,040,800\) and Tax return \(\$2,950,000\)/.test(w))).toBe(true);
    expect(ds.warnings.some((w) => /FY2025 net income differs/.test(w))).toBe(true);
    // The return's Form 4562 figure feeds the capital reserve, and its books basis is a fallback only.
    expect(ds.recastInputs!.capitalReserve).toMatchObject({ amount: 45_000, basis: "form_4562" });
    expect(ds.booksBasis).toBe("cash");
  });

  it("is empty, not absent, when only one source covers a year", async () => {
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv"), 12)], overrides: new Map(), addbacks: [] });
    expect(ds.reconciliations).toEqual([]);
  });
});

describe("bank deposits", () => {
  it("keeps deposits by month, sums them by fiscal year and checks each month against the grid", async () => {
    const fx = ridgelineDataset();
    const byMonth: NonNullable<IngestExtract["depositsByMonth"]> = {};
    for (const m of fx.monthly!.months) {
      if (m.fiscalYear !== 2025) continue;
      const revenue = fx.monthly!.values[m.key]!.revenue;
      byMonth[m.key] = { amount: m.key === "2025-03" ? revenue * 0.5 : revenue, excluded: 1_000 };
    }
    const bank: IngestExtract = { kind: "bank_statement", file: "bank.csv", pnlLines: [], bsLines: [], fullYears: [], depositsByMonth: byMonth, deposits: {} };
    const monthly = await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25 (monthly).csv"), 12);
    const ds = mergeSources({ extracts: [monthly, bank], overrides: new Map(), addbacks: [] });
    expect(Object.keys(ds.depositsByMonth!)).toHaveLength(12);
    expect(ds.deposits[2025]!.months).toBe(12);
    expect(ds.deposits[2025]!.amount).toBeCloseTo(fx.pnl[2025]!.revenue - fx.monthly!.values["2025-03"]!.revenue * 0.5, 6);
    expect(ds.warnings.some((w) => /Monthly bank deposits outside 75–125% of that month's revenue: Mar-25 \(50%\)\./.test(w))).toBe(true);
    expect(ds.warnings.some((w) => /FY2025 bank deposits are 9\d% of reported revenue/.test(w))).toBe(true);
  });

  it("still sums a source that only reports deposits by year", async () => {
    const bank: IngestExtract = { kind: "bank_statement", file: "statements.pdf", pnlLines: [], bsLines: [], fullYears: [], deposits: { 2025: { amount: 3_000_000, months: 12 } } };
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv"), 12), bank], overrides: new Map(), addbacks: [] });
    expect(ds.deposits).toEqual({ 2025: { amount: 3_000_000, months: 12 } });
    expect(ds.depositsByMonth).toBeUndefined();
  });
});
