import path from "node:path";
import { describe, expect, it } from "vitest";
import { ExtractionSchema, extractionToSource, type Extraction } from "../src/ingest/aiExtract.ts";
import { parseQuickbooksExport } from "../src/ingest/quickbooksExport.ts";
import { mergeSources } from "../src/ingest/merge.ts";
import { REPO } from "./helpers.ts";

// What Claude returns for an 1120-S (shape enforced by structured outputs).
const taxReturn: Extraction = {
  document_type: "tax_return",
  form: "Form 1120-S",
  entity_name: "Ridgeline Comfort Services LLC",
  fiscal_years: [
    {
      year: 2025,
      months_covered: 12,
      pnl_lines: [
        { label: "Gross receipts or sales", line_reference: "1a", amount: 2_950_000, category: "revenue" },
        { label: "Cost of goods sold", line_reference: "2", amount: 1_158_900, category: "cogs" },
        { label: "Compensation of officers", line_reference: "7", amount: 200_000, category: "owner_comp" },
        { label: "Salaries and wages", line_reference: "8", amount: 780_300, category: "payroll" },
        { label: "Depreciation", line_reference: "14", amount: 72_400, category: "depreciation_amortization" },
      ],
      balance_sheet_lines: [
        { label: "Cash", line_reference: "Sch L 1(d)", amount: 238_615, category: "cash" },
        { label: "Retained earnings", line_reference: "Sch L 24(d)", amount: 238_615, category: "equity" },
      ],
    },
    { year: 2026, months_covered: 6, pnl_lines: [], balance_sheet_lines: [] },
  ],
  bank_months: [],
  notes: ["Schedule L line 18 statement not attached"],
};

describe("Claude extraction → dataset", () => {
  it("the fixture satisfies the structured-output schema", () => {
    expect(ExtractionSchema.safeParse(taxReturn).success).toBe(true);
  });

  it("keeps only full years and carries Claude's categories through", () => {
    const src = extractionToSource(taxReturn, "/deals/x/2025 1120-S.pdf", 12);
    expect(src.kind).toBe("tax_return");
    expect(src.fullYears).toEqual([2025]);
    expect(src.pnlLines.find((l) => l.section === "7")?.category).toBe("owner_comp");
    expect(src.notes!.some((n) => /FY2026 covers 6 months/.test(n))).toBe(true);
  });

  it("prefers QuickBooks over the tax return and flags the revenue gap", async () => {
    const qb = await parseQuickbooksExport(path.join(REPO, "samples/project-ridgeline/QuickBooks Profit and Loss FY23-FY25.csv"), 12);
    const tr = extractionToSource(taxReturn, "/deals/x/2025 1120-S.pdf", 12);
    const ds = mergeSources({ extracts: [tr, qb], overrides: new Map(), addbacks: [] });
    expect(ds.provenance.find((p) => p.year === 2025)?.pnl).toBe("quickbooks_export");
    expect(ds.pnl[2025]!.revenue).toBe(3_040_800);
    expect(ds.warnings.some((w) => /FY2025 revenue differs/.test(w) && /Tax return/.test(w))).toBe(true);
  });

  it("falls back to the tax return when it is the only source", () => {
    const ds = mergeSources({ extracts: [extractionToSource(taxReturn, "r.pdf", 12)], overrides: new Map(), addbacks: [] });
    expect(ds.years).toEqual([2025]);
    expect(ds.pnl[2025]).toMatchObject({ revenue: 2_950_000, owner_comp: 200_000, payroll: 780_300 });
    expect(ds.balanceSheet[2025]).toMatchObject({ cash: 238_615, equity: 238_615 });
  });
});
