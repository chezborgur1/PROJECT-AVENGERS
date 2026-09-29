// Assembles the dataset from every source: the P&L and balance sheet from
// the most trusted source per period, the monthly grid behind them, the
// adjustments schedule (and the mode and deal form it decides), the
// customer and payroll files, and the cross-checks an advisor would run
// (source reconciliation, bank deposits, list-to-P&L ties).

import path from "node:path";
import {
  ASSET_CATEGORIES,
  IS_CATEGORIES,
  LIABILITY_CATEGORIES,
  SOURCE_LABELS,
  SOURCE_PRECEDENCE,
  addbacksFromSchedule,
  addMonths,
  emptyBs,
  emptyPnl,
  monthEndDate,
  monthKey,
  monthLabel,
  monthPeriod,
  type Addback,
  type Adjustment,
  type BalanceSheetPeriod,
  type BsCategory,
  type BsDetailLine,
  type BooksBasis,
  type DealFormDecision,
  type DebtLikeItem,
  type FinancialDataset,
  type IsCategory,
  type KpiSeries,
  type MappedLine,
  type ModeDecision,
  type MonthKey,
  type MonthlyLine,
  type MonthlyPnl,
  type RawLine,
  type RecastInputs,
  type ReconciledLine,
  type RevenueLine,
  type SourceReconciliation,
  type SuggestedAddback,
} from "../domain/financials.ts";
import {
  addbackHint,
  bsDetailLine,
  debtLikeTreatment,
  isContraRevenueName,
  isRecurringRevenueName,
  mapBsLine,
  mapPnlLine,
  normaliseAccount,
  type MappingOverrides,
} from "../domain/chartOfAccounts.ts";
import { DEFAULT_BURDEN_PCT, DEFAULT_REPLACEMENT_SALARY, buildSchedule, fitRowsToYears, legacyAddbacksToRows, type ScheduleRow } from "./adjustments.ts";
import { depositsByFiscalYear } from "./bankCsv.ts";
import { buildCustomerList, type CustomerFile } from "./customers.ts";
import type { IngestExtract } from "./extract.ts";
import type { LoadedIntake } from "./intake.ts";
import { buildPayrollRegister, type PayrollFile } from "./payroll.ts";
import type { DatedBalanceSheet } from "./reportTable.ts";
import { clientLabel } from "../util/tables.ts";

export const HISTORY_YEARS = 3;
/** Fewer usable months than this and the model runs in the annual-only layout (guide 5.2A). */
export const MIN_MONTHLY_MONTHS = 12;

const rank = (e: IngestExtract) => SOURCE_PRECEDENCE.indexOf(e.kind);
const hasMonthly = (e: IngestExtract) => Boolean(e.monthly && e.monthly.months.length);
const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const leaf = (account: string) => account.split(" : ").pop()!.replace(/^\d+\s*[·\-]?\s*/, "");

export interface MergeInput {
  extracts: IngestExtract[];
  overrides: MappingOverrides;
  /** The seller's flat list (addbacks.csv); read only when `adjustmentRows` is absent. */
  addbacks: Addback[];
  /** Calendar month the fiscal year ends in; December when not given. */
  fyEndMonth?: number;
  /** Rows from adjustments.csv, in file order. */
  adjustmentRows?: ScheduleRow[];
  customers?: CustomerFile;
  payroll?: PayrollFile;
  kpis?: KpiSeries[];
  intake?: LoadedIntake;
  request?: {
    /** Market salary for one working owner from the request row; the intake figure and the AMB default follow it. */
    replacementSalary?: number;
    /** C corporations pay entity-level tax; everything else is a pass-through. */
    passThrough?: boolean;
  };
}

/** The monthly grid and the source it came from. */
interface Grid {
  monthly: MonthlyPnl;
  source: IngestExtract;
}

function firstMonthOfFiscalYear(fy: number, fyEndMonth: number): MonthKey {
  return fyEndMonth === 12 ? monthKey(fy, 1) : monthKey(fy - 1, fyEndMonth + 1);
}

/**
 * The category × month grid from the most trusted source with single-month
 * columns: the longest contiguous run ending at its last month, from the
 * first month of FY-2 (guide Q34). Twelve months or more are required.
 */
function buildGrid(sources: IngestExtract[], years: number[], fyEndMonth: number, overrides: MappingOverrides, warnings: string[]): Grid | undefined {
  for (const src of sources) {
    const detail = src.monthly;
    if (!detail || !detail.months.length) continue;
    const name = path.basename(src.file);
    const available = [...detail.months].sort();
    let start = available.length - 1;
    while (start > 0 && addMonths(available[start]!, -1) === available[start - 1]) start--;
    if (start > 0) warnings.push(`${name}: months before ${monthLabel(available[start]!)} are not contiguous with the rest and are left out of the monthly grid.`);
    const fyStart = years.length ? firstMonthOfFiscalYear(years[0]!, fyEndMonth) : available[start]!;
    const run = available.slice(start).filter((m) => m >= fyStart);
    if (run.length < MIN_MONTHLY_MONTHS) {
      warnings.push(`${name} has ${run.length} usable months; ${MIN_MONTHLY_MONTHS} are needed for YTD and LTM columns. Full fiscal years only.`);
      continue;
    }
    const months = run.map((k) => monthPeriod(k, fyEndMonth));
    const latestFy = months[months.length - 1]!.fiscalYear;
    const lines: MonthlyLine[] = [];
    for (const acct of detail.accounts) {
      const amounts: Record<MonthKey, number> = {};
      let any = false;
      for (const k of run) {
        const v = acct.amounts[k];
        if (v === undefined) continue;
        amounts[k] = v;
        any = true;
      }
      if (!any) continue;
      const { category, mappedBy } = mapPnlLine({ account: acct.account, section: acct.section, year: latestFy, amount: 0 }, overrides);
      lines.push({ account: acct.account, ...(acct.section ? { section: acct.section } : {}), category, source: src.kind, file: src.file, mappedBy, amounts });
    }
    const values: MonthlyPnl["values"] = {};
    for (const m of months) {
      const v = emptyPnl();
      for (const l of lines) v[l.category] += l.amounts[m.key] ?? 0;
      values[m.key] = v;
    }
    const countByFy = new Map<number, number>();
    for (const m of months) countByFy.set(m.fiscalYear, (countByFy.get(m.fiscalYear) ?? 0) + 1);
    const fullFiscalYears = [...countByFy].filter(([, n]) => n === 12).map(([y]) => y).sort((a, b) => a - b);
    return {
      monthly: { months, values, lines, fullFiscalYears, lastMonthClosesFiscalYear: months[months.length - 1]!.fiscalMonth === 12, source: src.kind, file: src.file },
      source: src,
    };
  }
  return undefined;
}

/** Category totals of one source for one year, mapped the same way the chosen source is. */
function categoryTotals(src: IngestExtract, year: number, overrides: MappingOverrides): Record<IsCategory, number> {
  const totals = emptyPnl();
  for (const l of src.pnlLines) if (l.year === year) totals[mapPnlLine(l, overrides).category] += l.amount;
  return totals;
}

const RECONCILED_LINES: ReconciledLine[] = ["revenue", "cogs", "total_expenses", "net_income"];

/** The four lines two sources are compared on. Total expenses is every expense category below gross profit. */
function reconciledValue(p: Record<IsCategory, number>, line: ReconciledLine): number {
  const totalExpenses = p.payroll + p.owner_comp + p.rent + p.marketing + p.other_opex + p.depreciation_amortization + p.interest_expense + p.other_expense + p.income_tax;
  switch (line) {
    case "revenue":
      return p.revenue;
    case "cogs":
      return p.cogs;
    case "total_expenses":
      return totalExpenses;
    case "net_income":
      return p.revenue - p.cogs - totalExpenses + p.other_income;
  }
}

/**
 * Build the dataset: for each fiscal year take the P&L (and separately the
 * balance sheet) from the most trusted source that covers it, then run the
 * cross-checks an advisor would.
 */
export function mergeSources(input: MergeInput): FinancialDataset {
  const { extracts, overrides, addbacks } = input;
  const fyEndMonth = input.fyEndMonth ?? 12;
  const warnings: string[] = [];
  for (const e of extracts) warnings.push(...(e.notes ?? []));

  // Most trusted first; between sources of one kind, the one with monthly detail, then the one covering more years.
  const ordered = [...extracts].sort((a, b) => rank(a) - rank(b) || Number(hasMonthly(b)) - Number(hasMonthly(a)) || b.fullYears.length - a.fullYears.length);
  const pnlSources = ordered.filter((e) => e.pnlLines.length > 0);

  // --- P&L years -------------------------------------------------------------
  const allYears = [...new Set(pnlSources.flatMap((e) => e.fullYears))].sort((a, b) => a - b);
  const years = allYears.slice(-HISTORY_YEARS);
  if (allYears.length > years.length) {
    warnings.push(`Using the latest ${HISTORY_YEARS} full fiscal years; FY${allYears.slice(0, -HISTORY_YEARS).join(", FY")} left out.`);
  }
  const grid = buildGrid(pnlSources, years, fyEndMonth, overrides, warnings);

  const pnl: FinancialDataset["pnl"] = {};
  const provenance: FinancialDataset["provenance"] = [];
  const lines: MappedLine[] = [];
  const defaulted = new Set<string>();
  const chosenPnl = new Map<number, IngestExtract>();

  for (const year of years) {
    // A year the grid covers in full is read from the grid, so the annual map and the months agree by construction.
    const fromGrid = grid?.monthly.fullFiscalYears.includes(year) ? grid : undefined;
    const src = fromGrid?.source ?? pnlSources.find((e) => e.fullYears.includes(year) && e.pnlLines.some((l) => l.year === year));
    if (!src) continue;
    chosenPnl.set(year, src);
    const totals = emptyPnl();
    if (fromGrid) {
      const months = fromGrid.monthly.months.filter((m) => m.fiscalYear === year).map((m) => m.key);
      for (const m of months) for (const c of IS_CATEGORIES) totals[c] += fromGrid.monthly.values[m]![c];
      for (const l of fromGrid.monthly.lines) {
        const amount = months.reduce((s, m) => s + (l.amounts[m] ?? 0), 0);
        lines.push({ account: l.account, ...(l.section ? { section: l.section } : {}), year, amount, category: l.category, statement: "pnl", source: src.kind, file: src.file, mappedBy: l.mappedBy });
        if (l.mappedBy === "default") defaulted.add(l.account);
      }
    } else {
      for (const raw of src.pnlLines.filter((l) => l.year === year)) {
        const { category, mappedBy } = mapPnlLine(raw, overrides);
        totals[category] += raw.amount;
        lines.push({ ...raw, statement: "pnl", category, mappedBy, source: src.kind, file: src.file });
        if (mappedBy === "default") defaulted.add(raw.account);
      }
    }
    pnl[year] = totals;
    provenance.push({ year, pnl: src.kind });
  }
  const lastYear = years[years.length - 1];
  const asOfMonth: MonthKey | undefined = grid ? grid.monthly.months[grid.monthly.months.length - 1]!.key : lastYear !== undefined ? monthKey(lastYear, fyEndMonth) : undefined;

  // --- Balance sheets: every dated one, the most trusted source per date ------
  const candidates = new Map<MonthKey, { src: IngestExtract; lines: RawLine[] }>();
  for (const src of ordered) {
    const byYear = new Map<number, RawLine[]>();
    for (const l of src.bsLines) byYear.set(l.year, [...(byYear.get(l.year) ?? []), l]);
    const dated: DatedBalanceSheet[] = src.balanceSheets?.length ? src.balanceSheets : [...byYear].map(([year, ls]) => ({ key: monthKey(year, fyEndMonth), lines: ls }));
    for (const d of dated) if (d.lines.length && !candidates.has(d.key)) candidates.set(d.key, { src, lines: d.lines });
  }
  // Sheets before the year-end that opens FY-2 are not needed by any tab.
  const earliestBs = years.length ? monthKey(years[0]! - 1, fyEndMonth) : undefined;
  const balanceSheets: BalanceSheetPeriod[] = [];
  const bsLinesByKey = new Map<MonthKey, MappedLine[]>();
  for (const key of [...candidates.keys()].sort()) {
    if (earliestBs && key < earliestBs) continue;
    const { src, lines: raw } = candidates.get(key)!;
    const period = monthPeriod(key, fyEndMonth);
    const values = emptyBs();
    const detail: Partial<Record<BsDetailLine, number>> = {};
    const mapped: MappedLine[] = [];
    for (const l of raw) {
      const { category, mappedBy } = mapBsLine(l, overrides);
      values[category] += l.amount;
      const dl = bsDetailLine(l.account, l.section ?? "", category);
      if (dl) detail[dl] = (detail[dl] ?? 0) + l.amount;
      mapped.push({ ...l, year: period.fiscalYear, statement: "balance_sheet", category, mappedBy, source: src.kind, file: src.file });
      if (mappedBy === "default") defaulted.add(l.account);
    }
    const assets = ASSET_CATEGORIES.reduce((s, c) => s + values[c], 0);
    const liabilities = LIABILITY_CATEGORIES.reduce((s, c) => s + values[c], 0);
    const gap = assets - liabilities - values.equity;
    if (Math.abs(gap) > 1) {
      warnings.push(`Balance sheet at ${monthLabel(key)} from ${SOURCE_LABELS[src.kind]} was out of balance by ${fmt(gap)}; equity adjusted to balance. Check the account mapping.`);
      values.equity += gap;
    }
    balanceSheets.push({ period, asOf: monthEndDate(key), fiscalYearEnd: period.fiscalMonth === 12, values, ...(Object.keys(detail).length ? { detail } : {}), lines: mapped, source: src.kind, file: src.file });
    bsLinesByKey.set(key, mapped);
  }
  const balanceSheet: FinancialDataset["balanceSheet"] = {};
  for (const bs of balanceSheets) {
    const year = bs.period.fiscalYear;
    if (!bs.fiscalYearEnd || !years.includes(year)) continue;
    balanceSheet[year] = bs.values;
    lines.push(...bsLinesByKey.get(bs.period.key)!);
    const entry = provenance.find((p) => p.year === year);
    if (entry) entry.balanceSheet = bs.source;
  }

  if (lastYear === undefined) {
    warnings.push("No full fiscal year of P&L data found in any source.");
  } else if (!balanceSheet[lastYear]) {
    const latest = balanceSheets[balanceSheets.length - 1];
    warnings.push(
      latest
        ? `No FY${lastYear} year-end balance sheet in the sources; the projections open from the latest dated sheet (${monthLabel(latest.period.key)}). Request the ${monthLabel(monthKey(lastYear, fyEndMonth))} balance sheet.`
        : `No FY${lastYear} balance sheet in the sources. The model builds an opening balance sheet from working-capital assumptions; replace it with actuals when available.`,
    );
  }
  if (defaulted.size) {
    warnings.push(
      `Mapped by default (review, or add to mapping-overrides.csv): ${[...defaulted].slice(0, 12).join("; ")}${defaulted.size > 12 ? ` and ${defaulted.size - 12} more` : ""}.`,
    );
  }

  // --- Source reconciliation ----------------------------------------------------
  const reconciliations: SourceReconciliation[] = [];
  for (const year of years) {
    const chosen = chosenPnl.get(year);
    if (!chosen || !pnl[year]) continue;
    for (const other of pnlSources) {
      if (other === chosen || !other.fullYears.includes(year)) continue;
      const otherTotals = categoryTotals(other, year, overrides);
      for (const line of RECONCILED_LINES) {
        const a = reconciledValue(pnl[year]!, line);
        const b = reconciledValue(otherTotals, line);
        const difference = a - b;
        const differencePct = a ? difference / a : NaN;
        const material = a ? Math.abs(differencePct) > 0.02 : b !== 0;
        reconciliations.push({
          fiscalYear: year,
          line,
          chosen: { source: chosen.kind, file: path.basename(chosen.file), amount: a },
          other: { source: other.kind, file: path.basename(other.file), amount: b },
          difference,
          differencePct,
          material,
        });
        if (material && line === "revenue") {
          warnings.push(`FY${year} revenue differs between ${SOURCE_LABELS[chosen.kind]} (${fmt(a)}) and ${SOURCE_LABELS[other.kind]} (${fmt(b)}). Reconcile before marketing.`);
        } else if (material && line === "net_income") {
          warnings.push(`FY${year} net income differs between ${SOURCE_LABELS[chosen.kind]} (${fmt(a)}) and ${SOURCE_LABELS[other.kind]} (${fmt(b)}). Reconcile before marketing.`);
        }
      }
    }
  }

  // --- Bank deposits --------------------------------------------------------------
  const depositsByMonth: NonNullable<FinancialDataset["depositsByMonth"]> = {};
  const deposits: FinancialDataset["deposits"] = {};
  let anyByMonth = false;
  for (const e of ordered) {
    if (e.depositsByMonth) {
      anyByMonth = true;
      for (const [k, d] of Object.entries(e.depositsByMonth)) {
        const cur = (depositsByMonth[k] ??= { amount: 0, excluded: 0 });
        cur.amount += d.amount;
        cur.excluded += d.excluded;
      }
    } else {
      for (const [y, d] of Object.entries(e.deposits ?? {})) {
        const cur = deposits[Number(y)] ?? { amount: 0, months: 0 };
        deposits[Number(y)] = { amount: cur.amount + d.amount, months: Math.max(cur.months, d.months) };
      }
    }
  }
  for (const [y, d] of Object.entries(depositsByFiscalYear(depositsByMonth, fyEndMonth))) {
    const cur = deposits[Number(y)] ?? { amount: 0, months: 0 };
    deposits[Number(y)] = { amount: cur.amount + d.amount, months: Math.max(cur.months, d.months) };
  }
  for (const [y, d] of Object.entries(deposits)) {
    const rev = pnl[Number(y)]?.revenue;
    if (!rev || d.months < 12) continue;
    const ratio = d.amount / rev;
    const verdict = ratio < 0.9 || ratio > 1.15 ? "Outside the usual 90–115% range; investigate." : "Within the usual range.";
    warnings.push(`FY${y} bank deposits are ${(ratio * 100).toFixed(0)}% of reported revenue (${fmt(d.amount)} vs ${fmt(rev)}). ${verdict}`);
  }
  if (grid && anyByMonth) {
    // Month by month against the grid: timing moves single months, so only a wide band is flagged.
    const off: string[] = [];
    for (const m of grid.monthly.months) {
      const d = depositsByMonth[m.key];
      const rev = grid.monthly.values[m.key]!.revenue;
      if (!d || rev <= 0) continue;
      const ratio = d.amount / rev;
      if (ratio < 0.75 || ratio > 1.25) off.push(`${monthLabel(m.key)} (${(ratio * 100).toFixed(0)}%)`);
    }
    if (off.length) warnings.push(`Monthly bank deposits outside 75–125% of that month's revenue: ${off.join(", ")}. Timing differences are normal; investigate any that persist (check C14).`);
    const bankMonths = Object.keys(depositsByMonth).sort();
    if (bankMonths.length && !bankMonths.some((m) => grid.monthly.values[m])) {
      warnings.push(`Bank statements cover ${monthLabel(bankMonths[0]!)} to ${monthLabel(bankMonths[bankMonths.length - 1]!)}, outside the P&L months, so there is no proof of cash (check C14). Request bank statements for the months the P&L covers.`);
    }
  }

  // --- Revenue lines and the legacy mix ------------------------------------------
  const revenueLines: RevenueLine[] = [];
  const revenueMix: FinancialDataset["revenueMix"] = [];
  if (lastYear !== undefined) {
    const byAccount = new Map<string, Record<number, number>>();
    for (const l of lines) {
      if (l.statement !== "pnl" || l.category !== "revenue") continue;
      const e = byAccount.get(l.account) ?? {};
      e[l.year] = (e[l.year] ?? 0) + l.amount;
      byAccount.set(l.account, e);
    }
    const facts = input.intake?.revenueLines ?? [];
    const matched = new Set<number>();
    for (const [account, amounts] of byAccount) {
      const factIdx = facts.findIndex((f) => normaliseAccount(f.account) === normaliseAccount(account) || normaliseAccount(f.account) === normaliseAccount(leaf(account)));
      const fact = factIdx >= 0 ? facts[factIdx] : undefined;
      if (factIdx >= 0) matched.add(factIdx);
      let byMonth: Record<MonthKey, number> | undefined;
      if (grid) {
        const gridLines = grid.monthly.lines.filter((l) => l.account === account);
        if (gridLines.length) byMonth = Object.fromEntries(grid.monthly.months.map((m) => [m.key, gridLines.reduce((s, l) => s + (l.amounts[m.key] ?? 0), 0)]));
      }
      const values = Object.values(amounts);
      const contra = isContraRevenueName(account) || (values.some((v) => v < 0) && values.every((v) => v <= 0));
      revenueLines.push({
        account,
        label: fact?.label ?? clientLabel(leaf(account)),
        byFiscalYear: Object.fromEntries(years.map((y) => [y, amounts[y] ?? 0])),
        ...(byMonth ? { byMonth } : {}),
        recurring: fact?.recurring ?? isRecurringRevenueName(account),
        ...(fact?.whatTheCustomerBuys ? { whatTheCustomerBuys: fact.whatTheCustomerBuys } : {}),
        ...(fact?.pricingBasis ? { pricingBasis: fact.pricingBasis } : {}),
        contra,
      });
    }
    revenueLines.sort((a, b) => Number(a.contra) - Number(b.contra) || (b.byFiscalYear[lastYear] ?? 0) - (a.byFiscalYear[lastYear] ?? 0));
    facts.forEach((f, i) => {
      if (!matched.has(i)) warnings.push(`Intake revenue line "${f.account}" does not match a revenue account on the P&L; its facts are unused.`);
    });

    const sorted = revenueLines.filter((l) => !l.contra && (l.byFiscalYear[lastYear] ?? 0) > 0).map((l) => [leaf(l.account), l.byFiscalYear[lastYear]!] as const);
    if (sorted.length > 1) {
      const top = sorted.slice(0, 5);
      const rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
      revenueMix.push(...top.map(([label, amount]) => ({ label, amount })));
      if (rest > 0) revenueMix.push({ label: "Other", amount: rest });
    }
  }

  // --- Bot-flagged accounts (suggestions only; nothing here changes the numbers) ---
  const suggestedAddbacks: SuggestedAddback[] = [];
  for (const l of lines) {
    if (l.statement !== "pnl" || l.amount <= 0) continue;
    if (!["other_opex", "payroll", "marketing", "other_expense"].includes(l.category)) continue;
    const reason = addbackHint(l.account);
    if (reason) suggestedAddbacks.push({ year: l.year, account: l.account, amount: l.amount, reason });
  }
  suggestedAddbacks.sort((a, b) => b.year - a.year || b.amount - a.amount);

  // --- Adjustments schedule, mode and deal form ---------------------------------------
  let schedule: { adjustments: Adjustment[]; recastInputs: RecastInputs; mode: ModeDecision; dealForm: DealFormDecision } | undefined;
  let legacyAddbacks: Addback[] = addbacks.filter((a) => years.includes(a.year));
  if (lastYear !== undefined) {
    let fileRows: ScheduleRow[];
    // A grid that ends inside a fiscal year leaves that year's file column as the YTD amount.
    const lastGridFy = grid?.monthly.months.at(-1)?.fiscalYear;
    const stubFy = lastGridFy !== undefined && !years.includes(lastGridFy) ? lastGridFy : undefined;
    if (input.adjustmentRows) {
      const fitted = fitRowsToYears(input.adjustmentRows, years, stubFy);
      fileRows = fitted.rows;
      warnings.push(...fitted.warnings);
    } else {
      fileRows = legacyAddbacksToRows(addbacks, years, stubFy);
      for (const a of addbacks) {
        if (!years.includes(a.year) && a.year !== stubFy) warnings.push(`Add-back "${a.description}" is for FY${a.year}, which is not in the model; ignored.`);
      }
    }
    const intakeSalary = input.intake?.facts.transaction.replacementSalary?.amount;
    const rowSalary = input.request?.replacementSalary;
    const replacementSalary =
      rowSalary !== undefined
        ? { amount: rowSalary, source: `Request list owner_replacement_salary ($${rowSalary.toLocaleString("en-US")})${intakeSalary !== undefined ? `; intake notes: $${intakeSalary.toLocaleString("en-US")}` : ""}` }
        : intakeSalary !== undefined
          ? { amount: intakeSalary, source: `Intake notes: market salary for a replacement manager ($${intakeSalary.toLocaleString("en-US")})` }
          : { amount: DEFAULT_REPLACEMENT_SALARY, source: `AMB default $${DEFAULT_REPLACEMENT_SALARY.toLocaleString("en-US")}; confirm` };
    if (rowSalary !== undefined && intakeSalary !== undefined && Math.abs(rowSalary - intakeSalary) > 1) {
      warnings.push(`Replacement salary: the request list says ${fmt(rowSalary)} and the intake notes ${fmt(intakeSalary)}; the schedule uses the request list.`);
    }
    const equipment: Record<number, number> = {};
    for (const e of ordered) for (const [y, v] of Object.entries(e.equipmentPlacedInService ?? {})) equipment[Number(y)] ??= v;
    const owner = input.intake?.facts.owner;
    const ownerRow = input.payroll?.rows.find((r) => r.isOwner && years.some((y) => r.employerCostsByFiscalYear?.[y] !== undefined));
    const result = buildSchedule({
      years,
      pnl,
      monthly: grid?.monthly,
      lines,
      suggested: suggestedAddbacks,
      fileRows,
      replacementSalary,
      burden: { pct: DEFAULT_BURDEN_PCT, source: `AMB default ${Math.round(DEFAULT_BURDEN_PCT * 100)}% (guide 5.3, Q8); confirm` },
      ...(Object.keys(equipment).length ? { equipmentPlacedInService: equipment } : {}),
      ...(owner ? { owner: { name: owner.name, role: owner.role } } : {}),
      ...(ownerRow ? { ownerEmployerCosts: { byFiscalYear: ownerRow.employerCostsByFiscalYear!, file: input.payroll!.file } } : {}),
      passThrough: input.request?.passThrough ?? false,
      dealFormPreference: input.intake?.facts.transaction.dealFormPreference,
      pnlFile: chosenPnl.get(lastYear)!.file,
    });
    warnings.push(...result.warnings);
    schedule = result;
    legacyAddbacks = addbacksFromSchedule(result.adjustments);
  }

  // --- Debt and debt-like items at the latest balance sheet (guide 5.6) ------------------
  let debtLikeItems: DebtLikeItem[] | undefined;
  const latestBs = balanceSheets[balanceSheets.length - 1];
  if (latestBs) {
    const assetPurchase = schedule?.dealForm.form === "asset_purchase";
    const ranked: { item: DebtLikeItem; rank: number; i: number }[] = [];
    bsLinesByKey.get(latestBs.period.key)!.forEach((l, i) => {
      if (l.statement !== "balance_sheet" || !l.amount) return;
      const cls = debtLikeTreatment(l.account, l.category as BsCategory, l.section ?? "");
      if (!cls) return;
      ranked.push({
        item: {
          item: clientLabel(leaf(l.account)),
          balance: l.amount,
          asOf: latestBs.asOf,
          treatment: cls.treatment,
          accounts: [l.account],
          source: path.basename(l.file),
          status: "confirmed",
          ...(assetPurchase && cls.treatment === "debt" ? { payoffLetter: cls.revolving ? "n/a" : "requested" } : {}),
          ...(cls.note ? { note: cls.note } : {}),
        },
        rank: cls.treatment === "debt" ? (cls.revolving ? 1 : 0) : cls.treatment === "debt_like" ? 2 : 3,
        i,
      });
    });
    debtLikeItems = ranked.sort((a, b) => a.rank - b.rank || a.i - b.i).map((r) => r.item);
  }

  // --- Customer list and payroll register --------------------------------------------------
  let customers: FinancialDataset["customers"];
  if (input.customers && lastYear !== undefined && asOfMonth) {
    const built = buildCustomerList(input.customers, {
      years,
      fyEndMonth,
      asOfMonth,
      revenueByFiscalYear: Object.fromEntries(years.map((y) => [y, pnl[y]!.revenue])),
      term: input.intake?.customerTerm ?? "Customer",
    });
    customers = built.customers;
    warnings.push(...built.warnings);
  }
  let payroll: FinancialDataset["payroll"];
  if (input.payroll && lastYear !== undefined && asOfMonth) {
    const built = buildPayrollRegister(input.payroll, { years, fyEndMonth, asOfMonth, pnl });
    payroll = built.payroll;
    warnings.push(...built.warnings);
  }

  const booksBasis: BooksBasis | undefined = (lastYear !== undefined ? chosenPnl.get(lastYear)?.booksBasis : undefined) ?? ordered.find((e) => e.booksBasis)?.booksBasis;

  return {
    years: years.filter((y) => pnl[y]),
    pnl,
    balanceSheet,
    provenance,
    lines,
    addbacks: legacyAddbacks,
    suggestedAddbacks: suggestedAddbacks.slice(0, 15),
    revenueMix,
    deposits,
    warnings,

    fiscalYearEndMonth: fyEndMonth,
    ...(lastYear !== undefined ? { sourceGranularity: grid ? "monthly" : "annual" } : {}),
    ...(booksBasis ? { booksBasis } : {}),
    ...(grid ? { asOfMonth, monthly: grid.monthly } : {}),
    ...(balanceSheets.length ? { balanceSheets } : {}),
    ...(schedule ? { adjustments: schedule.adjustments, recastInputs: schedule.recastInputs, mode: schedule.mode, dealForm: schedule.dealForm } : {}),
    ...(revenueLines.length ? { revenueLines } : {}),
    ...(customers ? { customers } : {}),
    ...(payroll ? { payroll } : {}),
    ...(input.kpis?.length ? { kpis: input.kpis } : {}),
    ...(input.intake ? { intake: input.intake.facts } : {}),
    reconciliations,
    ...(anyByMonth ? { depositsByMonth } : {}),
    ...(debtLikeItems ? { debtLikeItems } : {}),
  };
}

export function describeSources(ds: FinancialDataset): string[] {
  return ds.provenance.map(
    (p) =>
      `FY${p.year}: P&L from ${SOURCE_LABELS[p.pnl]}` +
      (p.balanceSheet ? `; balance sheet from ${SOURCE_LABELS[p.balanceSheet]}` : "; no balance sheet"),
  );
}

export function sourceFiles(ds: FinancialDataset): string[] {
  return [...new Set(ds.lines.map((l) => path.basename(l.file)))];
}
