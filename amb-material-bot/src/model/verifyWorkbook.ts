// Independently evaluates every formula in a generated workbook and checks
// the results against the TypeScript engine. This catches a formula that
// points at the wrong row, column or sheet, which would otherwise produce a
// perfectly clean-looking workbook with wrong numbers.
//
// The expectations come from the same tab plans the writer rendered
// (planWorkbook), rebuilt here from the model: every cell a planner marked
// with the engine's value is compared with the formula's result, so every
// period column of every key row, the ladder, the schedule, NWC, the
// analyses and the Checks tab are all covered. The file is also linted for
// what guide 5.7-5.9 forbids: volatile and non-LibreOffice functions,
// literal #REF!, blue formulas, typed numbers that are not blue inputs, and
// defined names outside the 5.14 list.
//
// Uses fast-formula-parser (a JavaScript Excel formula engine) so no Excel
// or LibreOffice install is needed. Functions it lacks are supplied below
// with Excel's semantics.

import fs from "node:fs";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";
import FormulaParser from "fast-formula-parser";
import JSZip from "jszip";
import { CHART_COLOR } from "./chartData.ts";
import { readCharts } from "./charts.ts";
import { roundTo } from "./deal.ts";
import { excelSerial } from "./periods.ts";
import { clippedTexts, expectations, hiddenSpills } from "./sheet.ts";
import { COLOR } from "./styles.ts";
import type { ModelOutput } from "./types.ts";
import { planOptionsUsedFor, planWorkbook, type PlanOptions, type WorkbookPlan } from "./workbook.ts";
import { MONTHLY_NAMES } from "./workbook/data.ts";

export type Scalar = number | string | boolean | null;

export interface VerifyResult {
  formulas: number;
  /** Cells whose evaluated value was compared with the engine. */
  compared: number;
  errors: { cell: string; error: string }[];
  mismatches: { cell: string; label: string; workbook: Scalar; engine: number | string | boolean }[];
  lint: { cell: string; issue: string }[];
  ok: boolean;
}

/** Functions guide 5.7 C17 bans (volatile) and ones LibreOffice cannot evaluate (dynamic arrays). */
const VOLATILE = ["TODAY", "NOW", "OFFSET", "INDIRECT", "RAND", "RANDBETWEEN"];
const NOT_IN_LIBREOFFICE = ["XLOOKUP", "XMATCH", "FILTER", "LET", "LAMBDA", "UNIQUE", "SORT", "SORTBY", "SEQUENCE", "RANDARRAY", "TAKE", "DROP", "VSTACK", "HSTACK"];

/** The only defined names the workbook may carry (guide 5.14), plus the `Monthly_<line>` family. */
export const NAMED_OUTPUTS = [
  "AsOfDate", "FYEMonth", "PrintMode", "MainStreetMode", "Rev_FY", "Rev_LTM", "Rev_PF", "GP_FY", "GP_LTM", "RepEBITDA_FY", "RepEBITDA_LTM",
  "SDE_FY", "SDE_LTM", "AdjEBITDA_FY", "AdjEBITDA_LTM", "PFAdjEBITDA", "Customers_Latest", "Top10Share_LTM", "GDR_LTM", "NDR_LTM",
  "Headcount_Latest", "NWC_Peg", "MasterCheck", "DealForm", "NWC_Latest", "NWC_vsPeg", "DefRev_Latest", "LOIDate", "SigningDate",
  "EffectiveDate", "ChartStart", "ChartEnd", "Offer_Count", "Offer_Reference", "Offer_Headline_1", "Offer_CashAtClose_1",
];

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serialOf = (d: Date) => (d.getTime() - EXCEL_EPOCH) / 86400000;

function colName(n: number): string {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A cell's constant value as the formula engine sees it: dates as serials, rich text as text, errors as null. */
function constant(v: ExcelJS.CellValue): Scalar {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Date) return serialOf(v);
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "text" in v && typeof v.text === "string") return v.text;
  return null;
}

// --- Where fast-formula-parser departs from Excel ----------------------------------------------------------
//
// Its comparison operator reads a blank cell as 0 even against text, so
// `IF(A1="",...)` is false for an empty A1, and its numeric helper throws on
// a blank where Excel reads 0 (ABS, TEXT, ROUND of an empty cell). Both are
// module objects the grammar calls through, so they are corrected in place
// for this process; the verifier is the parser's only user.

const require = createRequire(import.meta.url);
const { Infix } = require("fast-formula-parser/formulas/operators.js") as { Infix: { compareOp: (...a: unknown[]) => unknown } };
const { FormulaHelpers } = require("fast-formula-parser/formulas/helpers.js") as { FormulaHelpers: { acceptNumber: (...a: unknown[]) => unknown } };
const ssf = require("fast-formula-parser/ssf/ssf.js") as { format: (fmt: string, v: number) => string };

const parserCompare = Infix.compareOp;
Infix.compareOp = (v1: unknown, op: unknown, v2: unknown, a1: unknown, a2: unknown) => {
  const blankAs = (other: unknown) => (typeof other === "string" ? "" : typeof other === "boolean" ? false : 0);
  return parserCompare(v1 ?? blankAs(v2), op, v2 ?? blankAs(v1), a1, a2);
};
const parserAcceptNumber = FormulaHelpers.acceptNumber.bind(FormulaHelpers);
FormulaHelpers.acceptNumber = (obj: unknown, ...rest: unknown[]) => parserAcceptNumber(obj ?? 0, ...rest);

// --- Excel functions fast-formula-parser does not implement --------------------------------------------

type Param = { value: unknown };
/** INDEX and CHOOSE are called with the parser as their first argument (INDEX also with unresolved references). */
type ParserContext = { utils: { extractRefValue: (arg: unknown) => { val: unknown } } };
const flat = (v: unknown): Scalar[] => (Array.isArray(v) ? (v as unknown[]).flatMap(flat) : [v as Scalar]);
const toNumber = (v: unknown): number => (typeof v === "boolean" ? Number(v) : Number(v));
const first = (p: Param | undefined): Scalar => (p ? (flat(p.value)[0] ?? null) : null);
const isBlank = (v: Scalar) => v === null || v === undefined || v === "";

/** Excel's SUMIFS / COUNTIFS criterion: an operator prefix, numeric or text comparison, `*` and `?` wildcards, "" for blanks. */
export function matchesCriterion(cell: Scalar, criterion: Scalar): boolean {
  if (typeof criterion === "number" || typeof criterion === "boolean") {
    if (typeof cell === "number" || typeof cell === "boolean") return toNumber(cell) === toNumber(criterion);
    return typeof cell === "string" && cell !== "" && Number(cell) === toNumber(criterion);
  }
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(criterion ?? "")!;
  const op = m[1] ?? "=";
  const operand = m[2]!;
  if (operand === "") {
    if (op === "=") return isBlank(cell);
    if (op === "<>") return !isBlank(cell);
    return false;
  }
  const operandNum = Number(operand);
  if (operand.trim() !== "" && Number.isFinite(operandNum)) {
    if (typeof cell !== "number" && typeof cell !== "boolean") return op === "<>";
    const c = toNumber(cell);
    switch (op) {
      case "=": return c === operandNum;
      case "<>": return c !== operandNum;
      case "<": return c < operandNum;
      case ">": return c > operandNum;
      case "<=": return c <= operandNum;
      default: return c >= operandNum;
    }
  }
  const cellText = isBlank(cell) ? "" : String(cell).toLowerCase();
  const pattern = operand.toLowerCase();
  if (op === "=" || op === "<>") {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\s\\S]*").replace(/\?/g, ".")}$`);
    const hit = typeof cell !== "number" && re.test(cellText);
    return op === "=" ? hit : !hit;
  }
  if (typeof cell !== "string") return false;
  switch (op) {
    case "<": return cellText < pattern;
    case ">": return cellText > pattern;
    case "<=": return cellText <= pattern;
    default: return cellText >= pattern;
  }
}

function criteriaMask(pairs: Param[], length: number): boolean[] {
  const mask = Array<boolean>(length).fill(true);
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const range = flat(pairs[i]!.value);
    if (range.length !== length) throw new Error("criteria ranges differ in size");
    const crit = first(pairs[i + 1]);
    range.forEach((v, k) => {
      if (mask[k] && !matchesCriterion(v, crit)) mask[k] = false;
    });
  }
  return mask;
}

/** Excel's inclusive percentile (MEDIAN, QUARTILE). */
function percentile(values: number[], p: number): number {
  const xs = [...values].sort((a, b) => a - b);
  if (!xs.length) throw new Error("empty range");
  const h = (xs.length - 1) * p;
  const lo = Math.floor(h);
  return xs[lo]! + (h - lo) * ((xs[lo + 1] ?? xs[lo]!) - xs[lo]!);
}

const numbers = (params: Param[]) => params.flatMap((p) => flat(p.value)).filter((v): v is number => typeof v === "number");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SHIMS: Record<string, (...params: any[]) => unknown> = {
  SUMIFS: (sum, ...pairs) => {
    const values = flat(sum.value);
    const mask = criteriaMask(pairs, values.length);
    return values.reduce<number>((s, v, k) => (mask[k] && typeof v === "number" ? s + v : s), 0);
  },
  COUNTIFS: (...pairs) => criteriaMask(pairs, flat(pairs[0]!.value).length).filter(Boolean).length,
  MATCH: (lookup, array, type) => {
    const target = first(lookup);
    const xs = flat(array.value);
    const mode = type ? toNumber(first(type)) : 1;
    if (mode === 0) {
      const i = xs.findIndex((v) => (typeof target === "string" && typeof v === "string" ? v.toLowerCase() === target.toLowerCase() : v === target));
      return i < 0 ? new FormulaParser.FormulaError("#N/A") : i + 1;
    }
    let found = -1;
    for (let i = 0; i < xs.length; i++) {
      const v = xs[i];
      if (v === null) continue;
      if (mode > 0 ? (v as number) <= (target as number) : (v as number) >= (target as number)) found = i;
      else break;
    }
    return found < 0 ? new FormulaParser.FormulaError("#N/A") : found + 1;
  },
  CHOOSE: (_context: ParserContext, index: Param, ...options: Param[]) => {
    const pick = options[toNumber(first(index)) - 1];
    return pick ? first(pick) : new FormulaParser.FormulaError("#VALUE!");
  },
  PMT: (rate, nper, pv, fv, type) => {
    const r = toNumber(first(rate));
    const n = toNumber(first(nper));
    const p = toNumber(first(pv));
    const f = fv ? toNumber(first(fv)) : 0;
    const t = type ? toNumber(first(type)) : 0;
    if (r === 0) return -(p + f) / n;
    const q = (1 + r) ** n;
    return -(r * (p * q + f)) / ((1 + r * t) * (q - 1));
  },
  MAX: (...params) => {
    const xs = numbers(params);
    return xs.length ? Math.max(...xs) : 0;
  },
  MIN: (...params) => {
    const xs = numbers(params);
    return xs.length ? Math.min(...xs) : 0;
  },
  MEDIAN: (...params) => percentile(numbers(params), 0.5),
  QUARTILE: (range, quart) => percentile(numbers([range]), toNumber(first(quart)) / 4),
  AVERAGEIFS: (avg, ...pairs) => {
    const values = flat(avg.value);
    const mask = criteriaMask(pairs, values.length);
    const picked = values.filter((v, k): v is number => mask[k]! && typeof v === "number");
    return picked.length ? picked.reduce((s, v) => s + v, 0) / picked.length : new FormulaParser.FormulaError("#DIV/0!");
  },
  /**
   * Returns a sheet-qualified reference so the parser reads the cell through
   * onCell (its own INDEX drops the sheet and reads the formula's sheet). A
   * one-row or one-column range takes a single index along its length.
   */
  INDEX: (context: ParserContext, array: unknown, rowNum: unknown, colNum: unknown) => {
    const index = (arg: unknown) => {
      const v = context.utils.extractRefValue(arg).val;
      return v instanceof FormulaParser.FormulaError ? Number.NaN : toNumber(flat(v)[0]);
    };
    let r = index(rowNum);
    let c = colNum == null ? 1 : index(colNum);
    const ref = (array as { ref?: { sheet: string; from?: { row: number; col: number }; to?: { row: number; col: number } } }).ref;
    if (ref?.from && ref.to) {
      if (colNum == null && ref.from.row === ref.to.row) [r, c] = [1, r];
      if (!(r >= 1 && c >= 1) || ref.from.row + r - 1 > ref.to.row || ref.from.col + c - 1 > ref.to.col) return new FormulaParser.FormulaError("#REF!");
      return { ref: { sheet: ref.sheet, row: ref.from.row + r - 1, col: ref.from.col + c - 1 } };
    }
    const arr = context.utils.extractRefValue(array).val;
    const grid = Array.isArray(arr) ? (arr as Scalar[][]) : [[arr as Scalar]];
    if (colNum == null && grid.length === 1) [r, c] = [1, r];
    const v = grid[r - 1]?.[c - 1];
    return v === undefined ? new FormulaParser.FormulaError("#REF!") : v;
  },
  TEXT: (value, format) => {
    const v = first(value);
    if (typeof v === "string" && !Number.isFinite(Number(v))) return v;
    return ssf.format(String(first(format)), toNumber(v ?? 0));
  },
  ROUND: (value, digits) => roundTo(toNumber(first(value) ?? 0), toNumber(first(digits) ?? 0)),
  HYPERLINK: (target, friendly) => (friendly ? first(friendly) : first(target)),
};

// --- Evaluation --------------------------------------------------------------------------------------

/**
 * fast-formula-parser misreads absolute whole-column references (`$E:$E`
 * resolves to negative columns), and absolute markers never change a value,
 * so they are dropped outside string literals before parsing.
 */
export function parserSafe(formula: string): string {
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => (i % 2 ? part : part.replace(/(^|[^A-Za-z0-9_$])\$([A-Z]{1,3}):\$([A-Z]{1,3})(?![0-9A-Za-z_])/g, "$1$2:$3")))
    .join("");
}

export interface Evaluation {
  workbook: ExcelJS.Workbook;
  value: (sheet: string, row: number, col: number) => Scalar;
  errors: VerifyResult["errors"];
  formulas: number;
}

export async function evaluateWorkbook(file: string): Promise<Evaluation> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const cache = new Map<string, Scalar>();
  const inProgress = new Set<string>();
  const errors: VerifyResult["errors"] = [];
  let formulas = 0;

  const sheet = (name: string): ExcelJS.Worksheet => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`Formula references missing sheet "${name}"`);
    return ws;
  };

  const value = (sheetName: string, row: number, col: number): Scalar => {
    const key = `${sheetName}!${row}:${col}`;
    if (cache.has(key)) return cache.get(key)!;
    const v = sheet(sheetName).getCell(row, col).value;
    let out: Scalar;
    if (v && typeof v === "object" && "formula" in v && v.formula) {
      if (inProgress.has(key)) throw new Error(`circular reference through '${sheetName}'!${colName(col)}${row}`);
      inProgress.add(key);
      let result: unknown;
      try {
        // The parser is not re-entrant, and resolving a reference can trigger
        // another evaluation, so each formula gets its own parser instance.
        result = makeParser().parse(parserSafe(v.formula), { sheet: sheetName, row, col });
      } catch (err) {
        result = new FormulaParser.FormulaError("#ERROR!", (err as Error).message);
      } finally {
        inProgress.delete(key);
      }
      if (Array.isArray(result)) result = flat(result)[0] ?? null;
      if (result instanceof FormulaParser.FormulaError) {
        const detail = (result as { message?: string }).message;
        errors.push({ cell: `'${sheetName}'!${colName(col)}${row}`, error: detail ? `${result.error} ${detail}` : result.error });
        out = null;
      } else {
        out = (result ?? null) as Scalar;
      }
    } else {
      out = constant(v);
    }
    cache.set(key, out);
    return out;
  };

  // Defined names (the chart captions read ChartStart and ChartEnd) resolve to the cell or range they name.
  const nameRef = (name: string) => {
    const range = (wb.definedNames as unknown as { getRanges(n: string): { ranges: string[] } }).getRanges(name).ranges[0];
    const ref = range ? parseRef(range) : undefined;
    if (!ref) return undefined;
    return ref.r1 === ref.r2 && ref.c1 === ref.c2 ? { sheet: ref.sheet, row: ref.r1, col: ref.c1 } : { sheet: ref.sheet, from: { row: ref.r1, col: ref.c1 }, to: { row: ref.r2, col: ref.c2 } };
  };
  const makeParser = () =>
    new FormulaParser({
      functions: SHIMS,
      onVariable: (name) => nameRef(name),
      onCell: ({ sheet: s, row, col }) => value(s, row, col),
      onRange: ({ sheet: s, from, to }) => {
        // Whole-column references stop at the sheet's last used row.
        const ws = sheet(s);
        const lastRow = Math.min(to.row, Math.max(ws.rowCount, from.row));
        const lastCol = Math.min(to.col, Math.max(ws.columnCount, from.col));
        const out: Scalar[][] = [];
        for (let r = from.row; r <= lastRow; r++) {
          const line: Scalar[] = [];
          for (let c = from.col; c <= lastCol; c++) line.push(value(s, r, c));
          out.push(line);
        }
        return out;
      },
    });

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

  return { workbook: wb, value, errors, formulas };
}

// --- Verification ---------------------------------------------------------------------------------------

const K = 1000;

/** Named outputs held in $000s in the workbook and dollars in the engine. */
const THOUSANDS = new Set(["Rev_FY", "Rev_LTM", "Rev_PF", "GP_FY", "GP_LTM", "RepEBITDA_FY", "RepEBITDA_LTM", "SDE_FY", "SDE_LTM", "AdjEBITDA_FY", "AdjEBITDA_LTM", "PFAdjEBITDA", "NWC_Peg", "NWC_Latest", "NWC_vsPeg", "DefRev_Latest"]);

/** The engine's value(s) for a defined name in the order its range lists them; undefined when the engine has nothing to compare. */
function engineValues(model: ModelOutput, name: string): (number | string)[] | undefined {
  const n = model.namedOutputs;
  switch (name) {
    case "AsOfDate": return [excelSerial(n.AsOfDate)];
    case "FYEMonth": return [n.FYEMonth];
    case "PrintMode": return [n.PrintMode];
    case "MainStreetMode": return [n.MainStreetMode ? 1 : 0];
    case "DealForm": return [n.DealForm === "asset_purchase" ? "Asset purchase" : "Equity purchase"];
    case "MasterCheck": return [n.MasterCheck];
    case "ChartStart": return n.ChartStart ? [excelSerial(`${n.ChartStart}-01`)] : undefined;
    case "ChartEnd": return n.ChartEnd ? [excelSerial(`${n.ChartEnd}-01`)] : undefined;
    case "LOIDate":
    case "SigningDate":
    case "EffectiveDate":
      return undefined;
    case "Offer_Count": return model.deal ? [model.deal.length] : undefined;
    case "Offer_Reference": return model.deal?.[0] ? [model.deal[0].name] : undefined;
    case "Offer_Headline_1": return model.deal?.[0] ? [model.deal[0].purchasePrice / K] : undefined;
    case "Offer_CashAtClose_1": return model.deal?.[0] ? [model.deal[0].cashAtClose / K] : undefined;
  }
  const monthly = /^Monthly_(.+)$/.exec(name);
  if (monthly) {
    const key = MONTHLY_NAMES.find(([n]) => n === monthly[1])?.[1];
    const series = key ? model.monthly?.series[key] : undefined;
    return series?.map((v) => v / K);
  }
  const scale = (v: number) => (THOUSANDS.has(name) ? v / K : v);
  const v = (n as unknown as Record<string, unknown>)[name];
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return [scale(v)];
  if (typeof v === "object") return Object.keys(v as object).sort().map((k) => scale((v as Record<string, number>)[k]!));
  return undefined;
}

function parseRef(ref: string): { sheet: string; r1: number; c1: number; r2: number; c2: number } | undefined {
  const m = /^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(ref);
  if (!m) return undefined;
  const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { sheet: m[1]!.replace(/''/g, "'"), r1: Number(m[3]), c1: col(m[2]!), r2: Number(m[5] ?? m[3]), c2: col(m[4] ?? m[2]!) };
}

const hexOf = (font: Partial<ExcelJS.Font> | undefined) => (font?.color?.argb ?? "FF000000").toUpperCase().slice(-6);

/** Formula text with its string literals emptied, for linting function names and references. */
const withoutStrings = (f: string) => f.replace(/"(?:[^"]|"")*"/g, '""');

/**
 * Evaluate the workbook and compare every planned expectation with the
 * engine. `options` are the plan options the writer used; the pipeline's
 * two-argument call finds the ones `writeWorkbook` recorded for this model.
 */
export async function verifyWorkbook(file: string, model: ModelOutput, options?: PlanOptions): Promise<VerifyResult> {
  const opts = options ?? planOptionsUsedFor(model);
  if (!opts) throw new Error("verifyWorkbook needs the plan options the workbook was written with (pass them, or call writeWorkbook first)");
  const { workbook, value, errors, formulas } = await evaluateWorkbook(file);
  const plan = planWorkbook(model, opts);
  const mismatches: VerifyResult["mismatches"] = [];
  const lint: VerifyResult["lint"] = [];
  let compared = 0;

  const fileTabs = workbook.worksheets.map((ws) => ws.name);
  const planTabs = plan.plans.map((p) => p.name);
  if (fileTabs.join("|") !== planTabs.join("|")) lint.push({ cell: "(workbook)", issue: `tab order ${fileTabs.join(", ")} differs from the plan ${planTabs.join(", ")}` });

  for (const p of plan.plans) {
    // Printed text that runs into a filled neighbour is cut at the cell edge in print (C37, guide 5.11).
    for (const c of clippedTexts(p)) lint.push({ cell: `'${p.name}'!${c.cell}`, issue: `text cut at its cell edge in print: "${c.text.slice(0, 40)}"` });
    for (const c of hiddenSpills(p)) lint.push({ cell: `'${p.name}'!${c.cell}`, issue: `text in a hidden column spills into print: "${c.text.slice(0, 40)}"` });
    // Every formula on an output tab carries the engine's value, so none is evaluated for errors only (the row-2 title and the Print toggle are furniture).
    if (p.output) {
      for (const [key, spec] of p.cells) {
        if (!spec.f || spec.expect !== undefined) continue;
        const [r, c] = key.split(":").map(Number) as [number, number];
        if ((r === 2 && c === 2) || (p.toggle && r === p.toggle.row && c === p.toggle.col)) continue;
        lint.push({ cell: `'${p.name}'!${colName(c)}${r}`, issue: "formula without an engine expectation" });
      }
    }
    for (const { row, col, spec } of expectations(p)) {
      const got = value(p.name, row, col);
      const want = spec.expect!;
      compared++;
      let same: boolean;
      if (typeof want === "number") same = typeof got === "number" && Math.abs(got - want) <= Math.max(spec.tol ?? 1e-3, Math.abs(want) * 1e-9);
      else same = got === want;
      if (!same) mismatches.push({ cell: `'${p.name}'!${colName(col)}${row}`, label: spec.label ?? "", workbook: got, engine: want });
    }
  }

  // Lint the written file (guide 5.7 C15, C17, C18; 5.9 colour code; 5.14 names).
  const outputTabs = new Set(plan.plans.filter((p) => p.output).map((p) => p.name));
  workbook.eachSheet((ws) => {
    ws.eachRow((r, rowNumber) => {
      r.eachCell((c, colNumber) => {
        const at = `'${ws.name}'!${colName(colNumber)}${rowNumber}`;
        const v = c.value;
        if (v && typeof v === "object" && "formula" in v && v.formula) {
          const f = withoutStrings(v.formula);
          for (const fn of VOLATILE) if (new RegExp(`(^|[^A-Z_.])${fn}\\s*\\(`).test(f)) lint.push({ cell: at, issue: `volatile function ${fn} (C17)` });
          for (const fn of NOT_IN_LIBREOFFICE) if (new RegExp(`(^|[^A-Z_.])${fn}\\s*\\(`).test(f)) lint.push({ cell: at, issue: `${fn} is not evaluated by LibreOffice` });
          if (/#REF!/.test(v.formula)) lint.push({ cell: at, issue: "literal #REF! in a formula" });
          if (/^-?\d+(\.\d+)?$/.test(v.formula.trim())) lint.push({ cell: at, issue: "hard-coded number written as a formula (C18)" });
          if (hexOf(c.font) === COLOR.input) lint.push({ cell: at, issue: "formula in blue input colour (guide 5.9)" });
          if (outputTabs.has(ws.name) && f.includes("!") && hexOf(c.font) === COLOR.black) lint.push({ cell: at, issue: "formula reaching another sheet in black, not a green link (guide 5.9)" });
          if (!RAW_TAB.test(ws.name)) for (const s of v.formula.matchAll(/"((?:[^"]|"")*)"/g)) if (INTERNAL_CODE.test(s[1]!)) lint.push({ cell: at, issue: `internal guide or precedent code in text: "${s[1]!.slice(0, 40)}"` });
        } else if (outputTabs.has(ws.name) && typeof v === "number") {
          const colour = hexOf(c.font);
          // A placeholder input awaiting a quote is typed in Pending red (guide 5.9), still an input.
          if (colour !== COLOR.input && colour !== COLOR.white && colour !== COLOR.helper && colour !== COLOR.pending) lint.push({ cell: at, issue: `typed number in ${colour}, not a blue input (C18)` });
        }
      });
    });
  });

  // Defined names: only the 5.14 outputs, each resolving to the engine's figure.
  const names = (workbook.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model;
  for (const { name, ranges } of names) {
    if (!NAMED_OUTPUTS.includes(name) && !name.startsWith("Monthly_")) lint.push({ cell: name, issue: "defined name outside guide 5.14" });
    const ref = ranges[0] ? parseRef(ranges[0]) : undefined;
    if (!ref) {
      lint.push({ cell: name, issue: `defined name does not resolve (${ranges.join(",")})` });
      continue;
    }
    const want = engineValues(model, name);
    if (!want) continue;
    const got: Scalar[] = [];
    for (let r = ref.r1; r <= ref.r2; r++) for (let c = ref.c1; c <= ref.c2; c++) got.push(value(ref.sheet, r, c));
    compared++;
    const same = got.length === want.length && got.every((g, i) => (typeof want[i] === "number" ? typeof g === "number" && Math.abs(g - (want[i] as number)) <= 1e-3 : g === want[i]));
    if (!same) mismatches.push({ cell: ranges[0]!, label: `named output ${name}`, workbook: got.join(", "), engine: want.join(", ") });
  }

  lintTypedCopies(workbook, outputTabs, lint);
  await lintConditionalFormats(file, lint);
  await lintCharts(file, plan, { workbook, value }, lint);
  return { formulas, compared, errors, mismatches, lint, ok: errors.length === 0 && mismatches.length === 0 && lint.length === 0 };
}

/** An absolute file path in a cell: a client's folder name must never print on a buyer-version workbook. */
/**
 * The bot's own references (guide sections, open-question numbers, precedent
 * file keys) mean nothing to a reviewer or client reading a cell; they belong
 * in code comments (QA round 2 F19).
 */
const INTERNAL_CODE = /\bguide (?:\d+(?:\.\d+)*[A-Z]?|[A-Z]\d+|Q\d+)\b|\bICP\d+\b|\bBENP\b|\bSUNPA\b|\((?:SUN|MISC[^)]*)\)/i;

/** Tabs that hold the client's own text as exported, which the bot does not write. */
const RAW_TAB = /^Raw - |^Databook$/;

const FILE_PATH = /(^|[\s(])(\/[^\s/]+){2,}|[A-Za-z]:\\|\\\\[^\s\\]+\\/;

/** Tabs whose typed numbers are inputs by design: the advisor's schedule and assumptions, and the data behind the model. */
const INPUT_TABS = /^(Assumptions|Adjustments|Databook|Mapping|Raw - .*)$/;

/**
 * Two writer-side lints over typed cells (guide 5.7 C18; confidentiality):
 * no text cell carries a file path, and no typed number on an output tab
 * copies a Databook balance, which must be a link so it moves with the data.
 */
function lintTypedCopies(workbook: ExcelJS.Workbook, outputTabs: Set<string>, lint: VerifyResult["lint"]): void {
  const databook = new Set<number>();
  workbook.getWorksheet("Databook")?.eachRow((r) => r.eachCell((c) => {
    if (typeof c.value === "number" && Math.abs(c.value) >= 100) databook.add(Math.round(c.value * 100));
  }));
  workbook.eachSheet((ws) => {
    ws.eachRow((r, rowNumber) => {
      r.eachCell((c, colNumber) => {
        const at = `'${ws.name}'!${colName(colNumber)}${rowNumber}`;
        const v = c.value;
        if (typeof v === "string" && FILE_PATH.test(v)) lint.push({ cell: at, issue: "file path in a cell value; write the file name only" });
        if (typeof v === "string" && !RAW_TAB.test(ws.name) && INTERNAL_CODE.test(v)) lint.push({ cell: at, issue: `internal guide or precedent code in text: "${v.slice(0, 40)}"` });
        if (typeof v !== "number" || !outputTabs.has(ws.name) || INPUT_TABS.test(ws.name)) return;
        // At $000s a copied balance is either fractional or at least 100; small whole numbers are counts and settings.
        if ((Math.abs(v) >= 100 || !Number.isInteger(v)) && databook.has(Math.round(v * 1000 * 100))) lint.push({ cell: at, issue: `typed ${v} copies a Databook balance; link it (C18)` });
      });
    });
  });
}

/** Every conditional format must carry a style: an empty dxf draws nothing (the sensitivity frontier once lost its box this way). */
async function lintConditionalFormats(file: string, lint: VerifyResult["lint"]): Promise<void> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const styles = await zip.file("xl/styles.xml")!.async("string");
  const dxfs = [...(/<dxfs[^>]*>([\s\S]*?)<\/dxfs>/.exec(styles)?.[1] ?? "").matchAll(/<dxf\/>|<dxf>[\s\S]*?<\/dxf>/g)].map((m) => m[0]);
  for (const name of Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    const xml = await zip.file(name)!.async("string");
    for (const m of xml.matchAll(/<conditionalFormatting sqref="([^"]+)">[\s\S]*?<cfRule [^>]*dxfId="(\d+)"/g)) {
      const dxf = dxfs[Number(m[2])];
      if (!dxf || dxf === "<dxf/>" || dxf === "<dxf></dxf>") lint.push({ cell: `${name} ${m[1]!.slice(0, 40)}`, issue: "conditional format with an empty style (dxf)" });
    }
  }
}

/**
 * C22, writer-side (guide 5.7): every chart part against the 5.12 settings,
 * and every cache against the cells it names, so a chart printed before
 * recalculation shows the model's figures.
 */
async function lintCharts(file: string, plan: WorkbookPlan, ev: Pick<Evaluation, "workbook" | "value">, lint: VerifyResult["lint"]): Promise<void> {
  const { value } = ev;
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const charts = await readCharts(zip);
  const planned = plan.plans.reduce((n, p) => n + p.charts.length, 0);
  if (charts.length !== planned) lint.push({ cell: "(charts)", issue: `${charts.length} chart parts in the file, ${planned} in the plan (C22)` });
  const palette = new Set<string>(Object.values(CHART_COLOR).flat());
  palette.add("FFFFFF");
  const byName = new Map(plan.plans.map((p) => [p.name, p]));
  const unescape = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const { sheet, part, xml } of charts) {
    const at = `${part} on '${sheet}'`;
    const blockTop = byName.get(sheet)?.rows.chartData;
    if (blockTop === undefined) {
      lint.push({ cell: at, issue: "chart on a tab without a chart-data block (C22)" });
      continue;
    }
    for (const m of xml.matchAll(/<c:f>([^<]*)<\/c:f>/g)) {
      const ref = parseRef(unescape(m[1]!));
      if (!ref || ref.sheet !== sheet || ref.r1 < blockTop) lint.push({ cell: at, issue: `reference ${unescape(m[1]!)} outside the tab's chart-data block (C22)` });
    }
    for (const ser of xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
      const ref = (tag: string) => {
        const f = new RegExp(`<c:${tag}>[\\s\\S]*?<c:f>([^<]*)</c:f>`).exec(ser[1]!)?.[1];
        return f ? parseRef(unescape(f)) : undefined;
      };
      const [tx, cat, val] = [ref("tx"), ref("cat"), ref("val")];
      if (!tx || !cat || !val) {
        lint.push({ cell: at, issue: "series without a name, category or value reference (C22)" });
        continue;
      }
      if (cat.c2 - cat.c1 !== val.c2 - val.c1 || cat.r1 !== cat.r2 || val.r1 !== val.r2) lint.push({ cell: at, issue: "category and value ranges differ in length (C22)" });
      if (tx.c1 !== 2 || tx.r1 !== val.r1) lint.push({ cell: at, issue: "series name is not the B cell of its value row (C22)" });
      const cache = /<c:val>[\s\S]*?<c:numCache>([\s\S]*?)<\/c:numCache>/.exec(ser[1]!)?.[1] ?? "";
      for (const pt of cache.matchAll(/<c:pt idx="(\d+)"><c:v>([^<]*)<\/c:v><\/c:pt>/g)) {
        const got = value(sheet, val.r1, val.c1 + Number(pt[1]));
        if (typeof got !== "number" || Math.abs(got - Number(pt[2])) > 1e-6) lint.push({ cell: at, issue: `cached value ${pt[2]} at point ${pt[1]} differs from the cell (${String(got)}) (C21)` });
      }
      const labels = /<c:cat>[\s\S]*?<c:strCache>([\s\S]*?)<\/c:strCache>/.exec(ser[1]!)?.[1] ?? "";
      for (let i = 0; i <= cat.c2 - cat.c1; i++) {
        const cached = unescape(new RegExp(`<c:pt idx="${i}"><c:v>([^<]*)</c:v>`).exec(labels)?.[1] ?? "");
        const got = value(sheet, cat.r1, cat.c1 + i) ?? "";
        if (String(got) !== cached) lint.push({ cell: at, issue: `cached category "${cached}" at point ${i} differs from the cell ("${String(got)}") (C21)` });
      }
    }
    if (/schemeClr|sysClr/.test(xml)) lint.push({ cell: at, issue: "theme or system colour; srgbClr only (C22)" });
    for (const m of xml.matchAll(/<a:srgbClr val="([0-9A-Fa-f]{6})"/g)) if (!palette.has(m[1]!.toUpperCase())) lint.push({ cell: at, issue: `colour ${m[1]} is not in the 5.12 palette (C22)` });
    if ((xml.match(/<c:valAx>/g) ?? []).length > 1) lint.push({ cell: at, issue: "second value axis (C22)" });
    for (const m of xml.matchAll(/<c:(min|max) val="([^"]+)"\/>/g)) if (m[1] !== "min" || Number(m[2]) !== 0) lint.push({ cell: at, issue: `axis bound ${m[1]} ${m[2]} (C22)` });
    for (const m of xml.matchAll(/<c:numFmt [^>]*>/g)) if (!/sourceLinked="0"/.test(m[0])) lint.push({ cell: at, issue: "number format linked to the source (C22)" });
  }
  // Captions name the months the data holds: they read ChartStart and ChartEnd, the first and last month of every chart tab's block.
  const named = (name: string) => {
    const range = (ev.workbook.definedNames as unknown as { getRanges(n: string): { ranges: string[] } }).getRanges(name).ranges[0];
    const ref = range ? parseRef(range) : undefined;
    return ref ? value(ref.sheet, ref.r1, ref.c1) : undefined;
  };
  const [start, end] = [named("ChartStart"), named("ChartEnd")];
  for (const p of plan.plans.filter((x) => x.charts.length)) {
    const monthsRow = p.rows.chartData! + 1;
    for (const [key, spec] of p.cells) {
      if (spec.style !== "chartTitle" || !spec.f) continue;
      if (!/ChartStart/.test(spec.f) || !/ChartEnd/.test(spec.f)) lint.push({ cell: `'${p.name}'!${key}`, issue: "caption does not read ChartStart and ChartEnd (C22)" });
    }
    const months = [...p.cells.entries()].filter(([k]) => Number(k.split(":")[0]) === monthsRow && Number(k.split(":")[1]) >= 3).map(([k]) => Number(k.split(":")[1]));
    if (!months.length) continue;
    if (value(p.name, monthsRow, Math.min(...months)) !== start || value(p.name, monthsRow, Math.max(...months)) !== end) lint.push({ cell: `'${p.name}'!${colName(Math.min(...months))}${monthsRow}`, issue: "chart months differ from ChartStart / ChartEnd (C22)" });
  }
}
