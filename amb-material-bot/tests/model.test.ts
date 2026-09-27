import path from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { gatherIntake } from "../src/ingest/index.ts";
import { defaultAssumptions } from "../src/model/assumptions.ts";
import { runModel, type ModelResult } from "../src/model/engine.ts";
import { SHEETS, workbookLayout, writeWorkbook } from "../src/model/workbook.ts";
import { verifyWorkbook } from "../src/model/verifyWorkbook.ts";
import type { FinancialDataset } from "../src/domain/financials.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

let ds: FinancialDataset;
let model: ModelResult;
let file: string;
const row = sampleRow();

beforeAll(async () => {
  ds = (await gatherIntake(row, REPO, () => {})).dataset;
  const a = defaultAssumptions(ds, row);
  model = runModel(ds, a);
  file = path.join(tmpDir(), "model.xlsx");
  await writeWorkbook({ row, dataset: ds, assumptions: a, model, firmName: "AMB Advisory Services", preparedOn: "2026-09-27" }, file);
});

describe("recast", () => {
  it("matches a hand calculation for FY2025", () => {
    const y = model.historical.find((h) => h.year === 2025)!;
    expect(y.ebitda).toBe(316_415);
    // + (200,000 owner comp − 95,000 replacement) + 31,500 seller add-backs
    expect(y.adjEbitda).toBe(452_915);
    expect(y.sde).toBe(547_915);
  });
});

describe("three statements", () => {
  it("balance every year and cash ties to the cash flow", () => {
    for (const y of model.years) {
      if (!y.bs) continue;
      expect(Math.abs(y.bs.check)).toBeLessThan(0.01);
      if (y.cf) expect(y.cf.endCash).toBeCloseTo(y.bs.cash, 6);
    }
  });

  it("projects five years from the last actual", () => {
    expect(model.projected.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("builds an opening balance sheet when the sources have none", () => {
    const noBs: FinancialDataset = { ...ds, balanceSheet: {} };
    const m = runModel(noBs, defaultAssumptions(noBs, row));
    const opening = m.historical[m.historical.length - 1]!.bs!;
    expect(opening.estimated).toBe(true);
    expect(Math.abs(opening.check)).toBeLessThan(0.01);
    for (const y of m.projected) expect(Math.abs(y.bs!.check)).toBeLessThan(0.01);
  });
});

describe("workbook", () => {
  it("every formula evaluates and matches the engine", async () => {
    const v = await verifyWorkbook(file, model);
    expect(v.errors).toEqual([]);
    expect(v.mismatches).toEqual([]);
    expect(v.formulas).toBeGreaterThan(300);
  });

  it("projection cells are formulas, not pasted numbers", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const { rows, firstCol } = workbookLayout(model);
    const ws = wb.getWorksheet(SHEETS.is)!;
    const lastCol = firstCol + model.years.length - 1;
    for (const key of ["revenue", "cogs", "ebitda", "net_income"]) {
      const v = ws.getCell(rows.is[key]!, lastCol).value as { formula?: string };
      expect(v?.formula, key).toBeTruthy();
    }
  });

  async function tamper(sheetKey: "is", rowKey: string, edit: (f: string) => string): Promise<string> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const { rows, firstCol } = workbookLayout(model);
    const c = wb.getWorksheet(SHEETS[sheetKey])!.getCell(rows[sheetKey][rowKey]!, firstCol + model.years.length - 1);
    const f = (c.value as { formula: string }).formula;
    const edited = edit(f);
    expect(edited).not.toBe(f);
    c.value = { formula: edited } as ExcelJS.CellFormulaValue;
    const out = file.replace(".xlsx", `-tampered-${rowKey}.xlsx`);
    await wb.xlsx.writeFile(out);
    return out;
  }

  it("the verifier catches a formula pointing at the wrong assumption row", async () => {
    const { rows } = workbookLayout(model);
    // Revenue growth -> COGS % (the next row on the Assumptions sheet).
    const out = await tamper("is", "revenue", (f) =>
      f.replace(new RegExp(`(!\\$?[A-Z]+\\$?)${rows.assumptions.revenueGrowth}\\b`), `$1${rows.assumptions.cogsPct}`),
    );
    const v = await verifyWorkbook(out, model);
    expect(v.ok).toBe(false);
    expect(v.mismatches.some((m) => m.label.startsWith("revenue"))).toBe(true);
  });

  it("the verifier reports a circular reference instead of crashing", async () => {
    const { rows } = workbookLayout(model);
    const out = await tamper("is", "gross_profit", (f) => f.replace(new RegExp(`${rows.is.cogs}$`), String(rows.is.gross_profit)));
    const v = await verifyWorkbook(out, model);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /circular/.test(e.error))).toBe(true);
  });
});
