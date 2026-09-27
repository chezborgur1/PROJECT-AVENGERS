import path from "node:path";
import {
  ASSET_CATEGORIES,
  LIABILITY_CATEGORIES,
  SOURCE_LABELS,
  SOURCE_PRECEDENCE,
  emptyBs,
  emptyPnl,
  type Addback,
  type FinancialDataset,
  type MappedLine,
  type SourceExtract,
  type SuggestedAddback,
} from "../domain/financials.ts";
import { addbackHint, mapBsLine, mapPnlLine, type MappingOverrides } from "../domain/chartOfAccounts.ts";

export const HISTORY_YEARS = 3;

const rank = (e: SourceExtract) => SOURCE_PRECEDENCE.indexOf(e.kind);
const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export interface MergeInput {
  extracts: SourceExtract[];
  overrides: MappingOverrides;
  addbacks: Addback[];
}

/**
 * Build the dataset: for each fiscal year take the P&L (and separately the
 * balance sheet) from the most trusted source that covers it, then run the
 * cross-checks an advisor would.
 */
export function mergeSources({ extracts, overrides, addbacks }: MergeInput): FinancialDataset {
  const warnings: string[] = [];
  for (const e of extracts) warnings.push(...(e.notes ?? []));

  const ordered = [...extracts].sort((a, b) => rank(a) - rank(b));
  const pnlSources = ordered.filter((e) => e.pnlLines.length > 0);

  // --- P&L ------------------------------------------------------------------
  const allYears = [...new Set(pnlSources.flatMap((e) => e.fullYears))].sort((a, b) => a - b);
  const years = allYears.slice(-HISTORY_YEARS);
  if (allYears.length > years.length) {
    warnings.push(`Using the latest ${HISTORY_YEARS} full fiscal years; FY${allYears.slice(0, -HISTORY_YEARS).join(", FY")} left out.`);
  }

  const pnl: FinancialDataset["pnl"] = {};
  const balanceSheet: FinancialDataset["balanceSheet"] = {};
  const provenance: FinancialDataset["provenance"] = [];
  const lines: MappedLine[] = [];
  const defaulted = new Set<string>();

  for (const year of years) {
    const src = pnlSources.find((e) => e.fullYears.includes(year) && e.pnlLines.some((l) => l.year === year));
    if (!src) continue;
    const totals = emptyPnl();
    for (const raw of src.pnlLines.filter((l) => l.year === year)) {
      const { category, mappedBy } = mapPnlLine(raw, overrides);
      totals[category] += raw.amount;
      lines.push({ ...raw, statement: "pnl", category, mappedBy, source: src.kind, file: src.file });
      if (mappedBy === "default") defaulted.add(raw.account);
    }
    pnl[year] = totals;
    const entry: FinancialDataset["provenance"][number] = { year, pnl: src.kind };

    // --- Balance sheet (may come from a different source than the P&L) ------
    const bsSrc = ordered.find((e) => e.bsLines.some((l) => l.year === year));
    if (bsSrc) {
      const bs = emptyBs();
      for (const raw of bsSrc.bsLines.filter((l) => l.year === year)) {
        const { category, mappedBy } = mapBsLine(raw, overrides);
        bs[category] += raw.amount;
        lines.push({ ...raw, statement: "balance_sheet", category, mappedBy, source: bsSrc.kind, file: bsSrc.file });
        if (mappedBy === "default") defaulted.add(raw.account);
      }
      const assets = ASSET_CATEGORIES.reduce((s, c) => s + bs[c], 0);
      const liabilities = LIABILITY_CATEGORIES.reduce((s, c) => s + bs[c], 0);
      const gap = assets - liabilities - bs.equity;
      if (Math.abs(gap) > 1) {
        warnings.push(
          `FY${year} balance sheet from ${SOURCE_LABELS[bsSrc.kind]} was out of balance by ${fmt(gap)}; equity adjusted to balance. Check the account mapping.`,
        );
        bs.equity += gap;
      }
      balanceSheet[year] = bs;
      entry.balanceSheet = bsSrc.kind;
    }
    provenance.push(entry);
  }

  const lastYear = years[years.length - 1];
  if (lastYear === undefined) {
    warnings.push("No full fiscal year of P&L data found in any source.");
  } else if (!balanceSheet[lastYear]) {
    warnings.push(
      `No FY${lastYear} balance sheet in the sources. The model builds an opening balance sheet from working-capital assumptions; replace it with actuals when available.`,
    );
  }

  if (defaulted.size) {
    warnings.push(
      `Mapped by default (review, or add to mapping-overrides.csv): ${[...defaulted].slice(0, 12).join("; ")}${defaulted.size > 12 ? ` and ${defaulted.size - 12} more` : ""}.`,
    );
  }

  // --- Cross-checks -----------------------------------------------------------
  for (const year of years) {
    const chosen = provenance.find((p) => p.year === year)?.pnl;
    if (!chosen || !pnl[year]) continue;
    const reported = pnl[year]!.revenue;
    for (const other of pnlSources) {
      if (other.kind === chosen || !other.fullYears.includes(year)) continue;
      const rev = other.pnlLines
        .filter((l) => l.year === year)
        .reduce((s, l) => (mapPnlLine(l, overrides).category === "revenue" ? s + l.amount : s), 0);
      if (reported && Math.abs(rev - reported) / reported > 0.02) {
        warnings.push(
          `FY${year} revenue differs between ${SOURCE_LABELS[chosen]} (${fmt(reported)}) and ${SOURCE_LABELS[other.kind]} (${fmt(rev)}). Reconcile before marketing.`,
        );
      }
    }
  }

  const deposits: FinancialDataset["deposits"] = {};
  for (const e of ordered) {
    for (const [y, d] of Object.entries(e.deposits ?? {})) {
      const cur = deposits[Number(y)] ?? { amount: 0, months: 0 };
      deposits[Number(y)] = { amount: cur.amount + d.amount, months: Math.max(cur.months, d.months) };
    }
  }
  for (const [y, d] of Object.entries(deposits)) {
    const rev = pnl[Number(y)]?.revenue;
    if (!rev || d.months < 12) continue;
    const ratio = d.amount / rev;
    const verdict = ratio < 0.9 || ratio > 1.15 ? "Outside the usual 90–115% range; investigate." : "Within the usual range.";
    warnings.push(`FY${y} bank deposits are ${(ratio * 100).toFixed(0)}% of reported revenue (${fmt(d.amount)} vs ${fmt(rev)}). ${verdict}`);
  }

  // --- CIM helpers ------------------------------------------------------------
  const revenueMix: FinancialDataset["revenueMix"] = [];
  if (lastYear !== undefined) {
    const byAccount = new Map<string, number>();
    for (const l of lines) {
      if (l.year === lastYear && l.statement === "pnl" && l.category === "revenue" && l.amount > 0) {
        const label = l.account.split(" : ").pop()!.replace(/^\d+\s*[·\-]?\s*/, "");
        byAccount.set(label, (byAccount.get(label) ?? 0) + l.amount);
      }
    }
    const sorted = [...byAccount].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 1) {
      const top = sorted.slice(0, 5);
      const rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
      revenueMix.push(...top.map(([label, amount]) => ({ label, amount })));
      if (rest > 0) revenueMix.push({ label: "Other", amount: rest });
    }
  }

  const suggestedAddbacks: SuggestedAddback[] = [];
  for (const l of lines) {
    if (l.statement !== "pnl" || l.amount <= 0) continue;
    if (!["other_opex", "payroll", "marketing", "other_expense"].includes(l.category)) continue;
    const reason = addbackHint(l.account);
    if (reason) suggestedAddbacks.push({ year: l.year, account: l.account, amount: l.amount, reason });
  }
  suggestedAddbacks.sort((a, b) => b.year - a.year || b.amount - a.amount);

  for (const a of addbacks) {
    if (!years.includes(a.year)) {
      warnings.push(`Add-back "${a.description}" is for FY${a.year}, which is not in the model; ignored.`);
    }
  }

  return {
    years: years.filter((y) => pnl[y]),
    pnl,
    balanceSheet,
    provenance,
    lines,
    addbacks: addbacks.filter((a) => years.includes(a.year)),
    suggestedAddbacks: suggestedAddbacks.slice(0, 15),
    revenueMix,
    deposits,
    warnings,
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

