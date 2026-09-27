// Gathers everything known about one business: every file in its source
// folder, plus QuickBooks Online when the request names a realm.
//
// Folder conventions (file names are matched loosely, case-insensitive):
//   *.csv / *.xlsx         QuickBooks P&L or Balance Sheet export, or a bank
//                          transaction export (detected from the contents)
//   *.pdf / *.png / *.jpg  tax returns, bank statements, financial statements
//                          (read by Claude)
//   *.md / *.txt           intake notes: call summaries, questionnaires
//   addbacks.csv           year, description, amount, type
//   mapping-overrides.csv  account, category

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import {
  isBsCategory,
  isIsCategory,
  type Addback,
  type AddbackType,
  type Category,
  type FinancialDataset,
  type SourceExtract,
} from "../domain/financials.ts";
import { normaliseAccount, type MappingOverrides } from "../domain/chartOfAccounts.ts";
import { fiscalYearEndMonth, type RequestRow } from "../requests/schema.ts";
import { readTable, parseAmount } from "../util/tables.ts";
import { claudeAvailable } from "../util/claude.ts";
import { detectReportKind, parseQuickbooksExport } from "./quickbooksExport.ts";
import { looksLikeBankExport, parseBankCsv } from "./bankCsv.ts";
import { extractDocument, extractionToSource, isAiDocument } from "./aiExtract.ts";
import { pullQuickbooks } from "./quickbooksApi.ts";
import { mergeSources } from "./merge.ts";

export interface IntakeBundle {
  dataset: FinancialDataset;
  /** Intake notes, concatenated with file headings, for CIM drafting. */
  notes: string;
  files: { file: string; used: string }[];
}

const SPECIAL = new Set(["addbacks.csv", "mapping-overrides.csv"]);

function readCsvRecords(file: string): Record<string, string>[] {
  return parse(fs.readFileSync(file, "utf8"), { columns: true, skip_empty_lines: true, trim: true, bom: true });
}

export function loadAddbacks(file: string): Addback[] {
  if (!fs.existsSync(file)) return [];
  const types: AddbackType[] = ["owner", "discretionary", "non_recurring", "other"];
  return readCsvRecords(file).flatMap((r) => {
    const amount = parseAmount(r.amount);
    const year = Number(r.year);
    if (amount === undefined || !Number.isInteger(year)) return [];
    const type = (types.includes(r.type as AddbackType) ? r.type : "other") as AddbackType;
    return [{ year, description: r.description ?? "", amount, type, source: path.basename(file) }];
  });
}

export function loadOverrides(file: string): MappingOverrides {
  const map: MappingOverrides = new Map();
  if (!fs.existsSync(file)) return map;
  for (const r of readCsvRecords(file)) {
    const category = (r.category ?? "").trim();
    if (r.account && (isIsCategory(category) || isBsCategory(category))) {
      map.set(normaliseAccount(r.account), category as Category);
    }
  }
  return map;
}

export async function gatherIntake(row: RequestRow, repoRoot: string, log: (msg: string) => void): Promise<IntakeBundle> {
  const fyEnd = fiscalYearEndMonth(row);
  const folder = row.source_folder ? path.resolve(repoRoot, row.source_folder) : "";
  const extracts: SourceExtract[] = [];
  const files: IntakeBundle["files"] = [];
  const noteParts: string[] = [];
  const problems: string[] = [];

  if (row.quickbooks_realm_id) {
    try {
      log(`  QuickBooks Online: pulling reports for realm ${row.quickbooks_realm_id}`);
      extracts.push(await pullQuickbooks(row.quickbooks_realm_id, fyEnd));
      files.push({ file: `QuickBooks realm ${row.quickbooks_realm_id}`, used: "QuickBooks Online P&L and balance sheet" });
    } catch (err) {
      problems.push(`QuickBooks Online pull failed: ${(err as Error).message}`);
    }
  }

  const entries = folder && fs.existsSync(folder) ? fs.readdirSync(folder).sort() : [];
  if (folder && !fs.existsSync(folder)) problems.push(`Source folder not found: ${row.source_folder}`);

  for (const name of entries) {
    const file = path.join(folder, name);
    const lower = name.toLowerCase();
    const ext = path.extname(lower);
    if (fs.statSync(file).isDirectory() || lower.startsWith(".") || SPECIAL.has(lower)) continue;
    try {
      if (ext === ".md" || ext === ".txt") {
        noteParts.push(`### ${name}\n${fs.readFileSync(file, "utf8").trim()}`);
        files.push({ file: name, used: "Intake notes" });
      } else if (ext === ".csv" || ext === ".xlsx" || ext === ".xlsm") {
        const grid = await readTable(file);
        if (detectReportKind(grid, name)) {
          const ex = await parseQuickbooksExport(file, fyEnd);
          extracts.push(ex);
          files.push({ file: name, used: `QuickBooks ${ex.pnlLines.length ? "P&L" : "balance sheet"} export (FY${ex.fullYears.join(", FY")})` });
        } else if (looksLikeBankExport(grid)) {
          extracts.push(await parseBankCsv(file, fyEnd));
          files.push({ file: name, used: "Bank transactions (deposit cross-check)" });
        } else {
          files.push({ file: name, used: "Skipped: not a recognised report or bank export" });
        }
      } else if (isAiDocument(file)) {
        if (!claudeAvailable()) {
          files.push({ file: name, used: "Skipped: needs ANTHROPIC_API_KEY to read PDFs and images" });
          problems.push(`${name} was not read because ANTHROPIC_API_KEY is not set.`);
          continue;
        }
        log(`  Claude: reading ${name}`);
        const ex = await extractDocument(file, { businessName: row.business_name, fyEndMonth: fyEnd });
        const source = extractionToSource(ex, file, fyEnd);
        extracts.push(source);
        files.push({ file: name, used: `${ex.form || ex.document_type} (read by Claude)` });
      } else {
        files.push({ file: name, used: "Skipped: unsupported file type" });
      }
    } catch (err) {
      files.push({ file: name, used: `Error: ${(err as Error).message}` });
      problems.push(`${name}: ${(err as Error).message}`);
    }
  }

  const dataset = mergeSources({
    extracts,
    overrides: loadOverrides(path.join(folder, "mapping-overrides.csv")),
    addbacks: loadAddbacks(path.join(folder, "addbacks.csv")),
  });
  dataset.warnings.unshift(...problems);
  if (fs.existsSync(path.join(folder, "addbacks.csv"))) files.push({ file: "addbacks.csv", used: "Seller add-backs" });
  if (fs.existsSync(path.join(folder, "mapping-overrides.csv"))) files.push({ file: "mapping-overrides.csv", used: "Account mapping overrides" });

  return { dataset, notes: noteParts.join("\n\n"), files };
}
