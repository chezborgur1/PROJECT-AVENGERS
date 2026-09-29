// Payroll register (payroll.csv or .xlsx): one row per employee with a
// name, role, department, hire and termination dates, pay basis, an owner
// flag and gross wages by fiscal year. Employer taxes and benefits are taken
// from the file when it has them; otherwise the owner's employer taxes are
// estimated at statutory rates on the owner's pay and the rest of the P&L
// payroll line is allocated to staff pro rata to wages, so wages plus
// employer costs tie to the P&L (check C13). Names are kept for the raw tab; the CIM shows only
// management names, through the intake facts.

import path from "node:path";
import {
  fiscalYearOf,
  monthEndDate,
  monthLabel,
  parseMonthKey,
  type IsCategory,
  type MonthKey,
  type PayBasis,
  type PayrollRecord,
  type PayrollRegister,
  type TerminationType,
} from "../domain/financials.ts";
import { parseAmount, parseDateString, parseFlag, periodColumns, pickColumn, readRecords } from "../util/tables.ts";

export interface PayrollFileRow {
  name?: string;
  sourceId?: string;
  role: string;
  department: string;
  isOwner: boolean;
  isManagement: boolean;
  hireDate: string;
  terminationDate?: string;
  terminationType?: TerminationType;
  payBasis: PayBasis;
  fte: number;
  wagesByFiscalYear: Record<number, number>;
  /** Only when the file carries employer-cost columns. */
  employerCostsByFiscalYear?: Record<number, number>;
  /** The coded fields as the file prints them, for the raw tab. */
  exported?: PayrollRecord["exported"];
  line: number;
}

export interface PayrollFile {
  rows: PayrollFileRow[];
  file: string;
  warnings: string[];
}

const EMPLOYER_COLUMN = /^(?:employer(?:_costs?|_taxes?|_burden)?|burden|taxes_and_benefits|payroll_taxes_and_benefits)_?((?:19|20)\d{2})$/;

const PAY_BASES: [RegExp, PayBasis][] = [
  [/commission|spiff|hourly\s*(\+|plus|and)/, "hourly_plus_commission"],
  [/hour/, "hourly"],
  [/salar|exempt/, "salary"],
  [/contract|1099/, "contractor"],
];

function parsePayBasis(raw: string | undefined): PayBasis | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const loose = s.replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  const exact: PayBasis[] = ["hourly", "salary", "hourly_plus_commission", "contractor"];
  if ((exact as string[]).includes(loose)) return loose as PayBasis;
  return PAY_BASES.find(([re]) => re.test(s))?.[1];
}

function parseTerminationType(raw: string | undefined): TerminationType | undefined {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (/resign|voluntary|quit|left|retire/.test(s)) return "resignation";
  if (/terminat|involuntary|fired|dismiss|layoff|laid off|let go/.test(s)) return "termination";
  return "unclassified";
}

/** Read the payroll file as written; employer costs are allocated in `buildPayrollRegister`. */
export async function loadPayrollCsv(file: string, fyEndMonth: number): Promise<PayrollFile> {
  const name = path.basename(file);
  const warnings: string[] = [];
  const rows: PayrollFileRow[] = [];
  const records = await readRecords(file);
  const keys = Object.keys(records[0] ?? {});
  const wageCols = periodColumns(keys, fyEndMonth, EMPLOYER_COLUMN);
  const employerCols = new Map<string, number>();
  for (const key of keys) {
    const m = EMPLOYER_COLUMN.exec(key);
    if (m) employerCols.set(key, Number(m[1]));
  }
  if (!wageCols.years.size && !wageCols.months.size) {
    throw new Error(`${name} has no wage columns (expected fiscal years such as "Wages 2025" or "FY2025")`);
  }
  let noBasis = 0;
  let noDepartment = 0;

  records.forEach((r, i) => {
    const line = i + 2;
    const employee = pickColumn(r, "name", "employee", "employee_name", "full_name");
    const sourceId = pickColumn(r, "id", "employee_id", "emp_id", "number");
    const label = employee ?? sourceId ?? `line ${line}`;
    const role = pickColumn(r, "role", "title", "job_title", "position");
    if (!role) {
      warnings.push(`${name} line ${line} (${label}): no role; row skipped.`);
      return;
    }
    const hireRaw = pickColumn(r, "hire_date", "hired", "start_date", "start", "date_of_hire");
    const hireDate = parseDateString(hireRaw);
    if (!hireDate) {
      warnings.push(`${name} line ${line} (${label}): ${hireRaw ? `hire date "${hireRaw}" not understood` : "no hire date"}; row skipped (tenure and the roll-forward need it).`);
      return;
    }
    const termRaw = pickColumn(r, "termination_date", "term_date", "terminated", "end_date", "separation_date", "last_day");
    const terminationDate = parseDateString(termRaw);
    if (termRaw && !terminationDate) warnings.push(`${name} line ${line} (${label}): termination date "${termRaw}" not understood; treated as still employed.`);
    let department = pickColumn(r, "department", "dept", "team");
    if (!department) {
      department = role;
      noDepartment++;
    }
    const payBasisRaw = pickColumn(r, "pay_basis", "basis", "pay_type", "compensation_type", "classification");
    let payBasis = parsePayBasis(payBasisRaw);
    if (!payBasis) {
      payBasis = "hourly";
      noBasis++;
    }

    const wagesByFiscalYear: Record<number, number> = {};
    if (wageCols.months.size) {
      for (const [key, month] of wageCols.months) {
        const v = parseAmount(r[key]);
        if (v === undefined) continue;
        const { year, month: m } = parseMonthKey(month);
        const fy = fiscalYearOf(year, m, fyEndMonth);
        wagesByFiscalYear[fy] = (wagesByFiscalYear[fy] ?? 0) + v;
      }
    } else {
      for (const [key, fy] of wageCols.years) {
        const v = parseAmount(r[key]);
        if (v !== undefined) wagesByFiscalYear[fy] = (wagesByFiscalYear[fy] ?? 0) + v;
      }
    }
    let employerCostsByFiscalYear: Record<number, number> | undefined;
    for (const [key, fy] of employerCols) {
      const v = parseAmount(r[key]);
      if (v === undefined) continue;
      (employerCostsByFiscalYear ??= {})[fy] = (employerCostsByFiscalYear[fy] ?? 0) + v;
    }

    const terminationTypeRaw = pickColumn(r, "termination_type", "term_type", "separation_type", "termination_reason", "reason");
    const terminationType = terminationDate ? (parseTerminationType(terminationTypeRaw) ?? "unclassified") : undefined;
    const ownerRaw = pickColumn(r, "owner", "is_owner", "working_owner");
    const managementRaw = pickColumn(r, "management", "is_management", "manager", "key_employee");
    const fteRaw = pickColumn(r, "fte");
    const exported = Object.fromEntries(
      Object.entries({ terminationType: terminationTypeRaw, payBasis: payBasisRaw, owner: ownerRaw, management: managementRaw, fte: fteRaw }).filter(([, v]) => v !== undefined && v !== ""),
    ) as PayrollFileRow["exported"];
    rows.push({
      ...(employee ? { name: employee } : {}),
      ...(sourceId ? { sourceId } : {}),
      role,
      department,
      isOwner: parseFlag(ownerRaw),
      isManagement: parseFlag(managementRaw),
      hireDate,
      ...(terminationDate ? { terminationDate, terminationType } : {}),
      payBasis,
      fte: parseAmount(fteRaw) ?? 1,
      wagesByFiscalYear,
      ...(employerCostsByFiscalYear ? { employerCostsByFiscalYear } : {}),
      exported,
      line,
    });
  });
  if (noBasis) warnings.push(`${name}: no pay basis for ${noBasis} employee(s); recorded as hourly. Add a pay_basis column (hourly, salary, hourly_plus_commission, contractor) to confirm.`);
  if (noDepartment) warnings.push(`${name}: no department for ${noDepartment} employee(s); the role is used as the department.`);
  return { rows, file: name, warnings };
}

export interface PayrollContext {
  years: number[];
  fyEndMonth: number;
  asOfMonth: MonthKey;
  pnl: Record<number, Record<IsCategory, number>>;
}

/** Social Security wage base by calendar year (SSA); a later year uses the latest one known. */
const SS_WAGE_BASE: Record<number, number> = { 2020: 137_700, 2021: 142_800, 2022: 147_000, 2023: 160_200, 2024: 168_600, 2025: 176_100, 2026: 184_500 };

export const EMPLOYER_TAX = { socialSecurity: 0.062, medicare: 0.0145, futa: 0.006, futaWageBase: 7_000 } as const;

export function socialSecurityWageBase(year: number): number {
  const known = Object.keys(SS_WAGE_BASE).map(Number).sort((a, b) => a - b);
  const y = Math.min(Math.max(year, known[0]!), known[known.length - 1]!);
  return SS_WAGE_BASE[y]!;
}

/**
 * Employer payroll taxes on one employee's wages at federal statutory rates:
 * Social Security to the wage base, Medicare on all wages and federal
 * unemployment on the first $7,000, in whole dollars. State unemployment and
 * benefits vary by employer and are not estimated.
 */
export function employerPayrollTaxes(wages: number, year: number): number {
  if (wages <= 0) return 0;
  return Math.round(Math.min(wages, socialSecurityWageBase(year)) * EMPLOYER_TAX.socialSecurity + wages * EMPLOYER_TAX.medicare + Math.min(wages, EMPLOYER_TAX.futaWageBase) * EMPLOYER_TAX.futa);
}

/** Scale amounts to an exact total in whole dollars, the residual on the largest (the same rule the fixture uses). */
export function scaleToTotal(raw: number[], total: number): number[] {
  const sum = raw.reduce((s, v) => s + v, 0);
  const out = raw.map((v) => (sum ? Math.round((v * total) / sum) : 0));
  if (!raw.length) return out;
  const largest = out.reduce((best, v, i) => (v > out[best]! ? i : best), 0);
  out[largest] = out[largest]! + (total - out.reduce((s, v) => s + v, 0));
  return out;
}

/**
 * Number the employees, cut the file back to the as-of month, allocate
 * employer costs where the file has none, and tie the register to the P&L
 * payroll and owner-compensation lines.
 */
export function buildPayrollRegister(pf: PayrollFile, ctx: PayrollContext): { payroll: PayrollRegister; warnings: string[] } {
  const warnings: string[] = [];
  const asOfDate = monthEndDate(ctx.asOfMonth);
  const asOfLabel = monthLabel(ctx.asOfMonth);
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  const kept: PayrollFileRow[] = [];
  let laterHires = 0;
  let laterTerms = 0;
  for (const row of pf.rows) {
    if (row.hireDate > asOfDate) {
      laterHires++;
      continue;
    }
    const r: PayrollFileRow = { ...row };
    if (r.terminationDate && r.terminationDate > asOfDate) {
      delete r.terminationDate;
      delete r.terminationType;
      laterTerms++;
    }
    kept.push(r);
  }
  if (laterHires) warnings.push(`${pf.file}: ${laterHires} employee(s) hired after the as-of month (${asOfLabel}) are left out of the register.`);
  if (laterTerms) warnings.push(`${pf.file}: ${laterTerms} departure(s) after the as-of month (${asOfLabel}) are ignored; those employees count as on payroll at ${asOfLabel}.`);

  const employerCosts = kept.map(() => ({}) as Record<number, number>);
  const totalsByFiscalYear: Record<number, number> = {};
  const employerCostsFromFile = kept.some((r) => r.employerCostsByFiscalYear && Object.keys(r.employerCostsByFiscalYear).length);

  for (const y of ctx.years) {
    const wages = kept.map((r) => (r.isOwner ? 0 : (r.wagesByFiscalYear[y] ?? 0)));
    const wageTotal = wages.reduce((s, v) => s + v, 0);
    const payrollLine = ctx.pnl[y]?.payroll ?? 0;
    const fileHasCosts = kept.some((r) => r.employerCostsByFiscalYear?.[y] !== undefined);
    // The owner's salary is expensed as owner compensation, but the employer taxes on it sit in the payroll line with everyone
    // else's; they belong to the owner ([S1] adds them back), not to the staff the Headcount tab allocates costs to.
    let ownerCosts = 0;
    if (fileHasCosts) {
      kept.forEach((r, i) => (employerCosts[i]![y] = r.employerCostsByFiscalYear?.[y] ?? 0));
      ownerCosts = kept.reduce((s, r, i) => (r.isOwner ? s + employerCosts[i]![y]! : s), 0);
    } else {
      ownerCosts = employerPayrollTaxes(ctx.pnl[y]?.owner_comp ?? 0, y);
      // The P&L payroll line less gross wages and the owner's employer taxes is the staff's taxes and benefits pool.
      let pool = payrollLine - wageTotal - ownerCosts;
      if (pool < -1) {
        warnings.push(`FY${y}: wages in ${pf.file} (${money(wageTotal)}) exceed the P&L payroll line (${money(payrollLine)}); employer costs set to zero. Check whether the file includes the owner or contractors.`);
        pool = 0;
        ownerCosts = 0;
      }
      const alloc = scaleToTotal(wages, Math.max(0, pool));
      const ownerIndex = kept.findIndex((r) => r.isOwner);
      kept.forEach((r, i) => (employerCosts[i]![y] = r.isOwner ? (i === ownerIndex ? ownerCosts : 0) : alloc[i]!));
    }
    // The register ties to the payroll line: staff wages and costs, plus the owner's employer costs.
    const total = kept.reduce((s, r, i) => (r.isOwner ? s : s + (r.wagesByFiscalYear[y] ?? 0) + (employerCosts[i]![y] ?? 0)), 0) + ownerCosts;
    totalsByFiscalYear[y] = total;
    if (payrollLine && Math.abs(total - payrollLine) / payrollLine > 0.05) {
      warnings.push(`FY${y}: payroll register (${money(total)}) differs from the P&L payroll line (${money(payrollLine)}) by ${((Math.abs(total - payrollLine) / payrollLine) * 100).toFixed(1)}% (check C13).`);
    }
    const ownerWages = kept.filter((r) => r.isOwner).reduce((s, r) => s + (r.wagesByFiscalYear[y] ?? 0), 0);
    const ownerLine = ctx.pnl[y]?.owner_comp ?? 0;
    if (ownerLine && kept.some((r) => r.isOwner) && Math.abs(ownerWages - ownerLine) / ownerLine > 0.01) {
      warnings.push(`FY${y}: owner pay in ${pf.file} (${money(ownerWages)}) differs from the P&L owner compensation line (${money(ownerLine)}); [S1] follows the P&L.`);
    }
  }
  if (!kept.some((r) => r.isOwner)) warnings.push(`${pf.file} has no row flagged owner = yes; the owner's pay is read from the P&L only.`);

  const width = Math.max(2, String(kept.length).length);
  const employees: PayrollRecord[] = kept.map((r, i) => ({
    id: `E-${String(i + 1).padStart(width, "0")}`,
    ...(r.name ? { name: r.name } : {}),
    role: r.role,
    department: r.department,
    isOwner: r.isOwner,
    isManagement: r.isManagement,
    hireDate: r.hireDate,
    ...(r.terminationDate ? { terminationDate: r.terminationDate, terminationType: r.terminationType ?? "unclassified" } : {}),
    payBasis: r.payBasis,
    fte: r.fte,
    wagesByFiscalYear: Object.fromEntries(ctx.years.map((y) => [y, r.wagesByFiscalYear[y] ?? 0])),
    employerCostsByFiscalYear: Object.fromEntries(ctx.years.map((y) => [y, employerCosts[i]![y] ?? 0])),
    ...(Object.keys(r.exported ?? {}).length ? { exported: r.exported } : {}),
  }));

  const lastYear = Math.max(...kept.flatMap((r) => Object.keys(r.wagesByFiscalYear).map(Number)), 0);
  const asOf = parseMonthKey(ctx.asOfMonth);
  if (lastYear && lastYear < fiscalYearOf(asOf.year, asOf.month, ctx.fyEndMonth) && !ctx.years.includes(lastYear + 1)) {
    warnings.push(`Payroll data in ${pf.file} runs to FY${lastYear}; the P&L runs to ${asOfLabel}. State this in the Summary.`);
  }

  return {
    payroll: { employees, asOfMonth: ctx.asOfMonth, totalsByFiscalYear, source: `Payroll register (${pf.file})`, file: pf.file, ...(employerCostsFromFile ? { employerCostsFromFile } : {}) },
    warnings,
  };
}
