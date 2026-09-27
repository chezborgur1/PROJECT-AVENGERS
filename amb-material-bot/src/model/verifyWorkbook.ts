// Independently evaluates every formula in a generated workbook and checks
// the results against the TypeScript engine. This catches a formula that
// points at the wrong row or sheet, which would otherwise produce a
// perfectly clean-looking workbook with wrong numbers.
//
// Uses fast-formula-parser (a JavaScript Excel formula engine) so no
// Excel or LibreOffice install is needed.

import ExcelJS from "exceljs";
import FormulaParser from "fast-formula-parser";
import type { ModelResult, YearValues } from "./engine.ts";
import { SHEETS, workbookLayout } from "./workbook.ts";

export interface VerifyResult {
  formulas: number;
  errors: { cell: string; error: string }[];
  mismatches: { cell: string; label: string; workbook: number; engine: number }[];
  ok: boolean;
}

type Scalar = number | string | boolean | null;

export async function evaluateWorkbook(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const cache = new Map<string, Scalar>();
  const inProgress = new Set<string>();
  const errors: VerifyResult["errors"] = [];
  let formulas = 0;

  const raw = (sheet: string, row: number, col: number): ExcelJS.CellValue => {
    const ws = wb.getWorksheet(sheet);
    if (!ws) throw new Error(`Formula references missing sheet "${sheet}"`);
    return ws.getCell(row, col).value;
  };

  const value = (sheet: string, row: number, col: number): Scalar => {
    const key = `${sheet}!${row}:${col}`;
    if (cache.has(key)) return cache.get(key)!;
    const v = raw(sheet, row, col);
    let out: Scalar;
    if (v && typeof v === "object" && "formula" in v && v.formula) {
      if (inProgress.has(key)) throw new Error(`circular reference through '${sheet}'!${colName(col)}${row}`);
      inProgress.add(key);
      let result: unknown;
      try {
        // The parser is not re-entrant, and resolving a reference can trigger
        // another evaluation, so each formula gets its own parser instance.
        result = makeParser().parse(v.formula, { sheet, row, col });
      } catch (err) {
        result = new FormulaParser.FormulaError("#ERROR!", (err as Error).message);
      } finally {
        inProgress.delete(key);
      }
      if (result instanceof FormulaParser.FormulaError) {
        const detail = (result as { message?: string }).message;
        errors.push({ cell: `'${sheet}'!${colName(col)}${row}`, error: detail ? `${result.error} ${detail}` : result.error });
        out = null;
      } else {
        out = result as Scalar;
      }
    } else if (v === null || v === undefined) {
      out = null;
    } else if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      out = v;
    } else {
      out = null;
    }
    cache.set(key, out);
    return out;
  };

  const makeParser = () =>
    new FormulaParser({
      // MAX and MIN are stubs in fast-formula-parser; supply them.
      functions: { MAX: (...params) => extreme(params, Math.max), MIN: (...params) => extreme(params, Math.min) },
      onCell: ({ sheet, row, col }) => value(sheet, row, col),
      onRange: ({ sheet, from, to }) => {
        const out: Scalar[][] = [];
        for (let r = from.row; r <= to.row; r++) {
          const line: Scalar[] = [];
          for (let c = from.col; c <= to.col; c++) line.push(value(sheet, r, c));
          out.push(line);
        }
        return out;
      },
    });

  // Evaluate every formula cell once.
  wb.eachSheet((ws) => {
    ws.eachRow((row, r) => {
      row.eachCell((cell, c) => {
        const v = cell.value;
        if (v && typeof v === "object" && "formula" in v && v.formula) {
          formulas++;
          value(ws.name, r, c);
        }
      });
    });
  });

  return { value, errors, formulas };
}

/** Parameters arrive as { value } wrappers holding a number or a 2-D range. */
function extreme(params: { value: unknown }[], pick: (...n: number[]) => number): number {
  const nums: number[] = [];
  const collect = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(collect);
    else if (typeof v === "number") nums.push(v);
  };
  params.forEach((p) => collect(p.value));
  return nums.length ? pick(...nums) : 0;
}

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Evaluate the workbook and compare the key lines, every year, with the engine. */
export async function verifyWorkbook(file: string, model: ModelResult): Promise<VerifyResult> {
  const { value, errors, formulas } = await evaluateWorkbook(file);
  const { rows, firstCol } = workbookLayout(model);
  const mismatches: VerifyResult["mismatches"] = [];

  const checks: [keyof typeof SHEETS & ("is" | "recast" | "bs" | "cf"), string, (y: YearValues) => number | undefined][] = [
    ["is", "revenue", (y) => y.revenue],
    ["is", "gross_profit", (y) => y.grossProfit],
    ["is", "ebitda", (y) => y.ebitda],
    ["is", "net_income", (y) => y.netIncome],
    ["recast", "adj_ebitda", (y) => y.adjEbitda],
    ["recast", "sde", (y) => y.sde],
    ["bs", "cash", (y) => y.bs?.cash],
    ["bs", "total_assets", (y) => y.bs?.totalAssets],
    ["bs", "equity", (y) => y.bs?.equity],
    ["bs", "check", (y) => (y.bs ? 0 : undefined)],
    ["cf", "cfo", (y) => y.cf?.cfo],
    ["cf", "end_cash", (y) => y.cf?.endCash],
  ];

  model.years.forEach((y, i) => {
    for (const [sheet, key, expected] of checks) {
      const want = expected(y);
      if (want === undefined) continue;
      const r = rows[sheet][key]!;
      const got = value(SHEETS[sheet], r, firstCol + i);
      const num = typeof got === "number" ? got : Number.NaN;
      if (!(Math.abs(num - want) <= Math.max(0.5, Math.abs(want) * 1e-9))) {
        mismatches.push({ cell: `'${SHEETS[sheet]}'!${colName(firstCol + i)}${r}`, label: `${key} FY${y.year}`, workbook: num, engine: want });
      }
    }
  });

  return { formulas, errors, mismatches, ok: errors.length === 0 && mismatches.length === 0 };
}
