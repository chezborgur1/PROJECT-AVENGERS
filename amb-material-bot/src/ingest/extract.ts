// What one ingestor hands back, in the shape merge.ts assembles the dataset
// from. It is the contract's SourceExtract plus the detail the rebuild
// needs: month-level P&L, every dated balance sheet, deposits by month and
// the facts a tax return states about the books.

import type { BooksBasis, MonthKey, SourceExtract } from "../domain/financials.ts";
import type { DatedBalanceSheet, MonthlyAccount } from "./reportTable.ts";

export interface IngestExtract extends SourceExtract {
  /** Account × month detail when the source had single-month columns. */
  monthly?: { months: MonthKey[]; accounts: MonthlyAccount[] };
  /** Every dated balance-sheet column the source carried, ascending. */
  balanceSheets?: DatedBalanceSheet[];
  /** Operating deposits by calendar month, transfers and the like excluded. */
  depositsByMonth?: Record<MonthKey, { amount: number; excluded: number }>;
  /** Cash or accrual, when the source says so (report basis line, tax return line F). */
  booksBasis?: BooksBasis;
  /** Equipment cost placed in service per fiscal year (Form 4562), the capital reserve default. */
  equipmentPlacedInService?: Record<number, number>;
  /** Fiscal years the source covers only in part, with the months covered. */
  partialYears?: { year: number; months: number }[];
}
