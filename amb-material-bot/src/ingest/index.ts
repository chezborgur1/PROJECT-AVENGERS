// Gathers everything known about one business: every file in its source
// folder, plus QuickBooks Online when the request names a realm.
//
// Folder conventions (file names are matched loosely, case-insensitive;
// docs/REQUEST_LIST.md describes each file):
//   *.csv / *.xlsx         QuickBooks P&L or Balance Sheet export (annual,
//                          quarterly or monthly columns), or a bank
//                          transaction export (detected from the contents)
//   *.pdf / *.png / *.jpg  tax returns, bank statements, financial statements
//                          (read by Claude)
//   *.md / *.txt / *.docx  intake notes: call summaries, questionnaires
//   intake.json            structured intake facts (else Claude transcribes the notes)
//   adjustments.csv        the adjustments schedule (ref, tier, description, ...)
//   addbacks.csv           the seller's flat add-back list (legacy; adjustments.csv wins)
//   customers*.csv         customer revenue by fiscal year or month
//   payroll*.csv           payroll register
//   kpis*.csv              operating metrics
//   mapping-overrides.csv  account, category
//   cim-copy.fixture.json  reviewed CIM copy for a sample folder (read by
//                          src/cim/narrative.ts, not a financial source)

import fs from "node:fs";
import path from "node:path";
import { isBsCategory, isIsCategory, type Addback, type AddbackType, type Category, type FinancialDataset, type KpiSeries } from "../domain/financials.ts";
import { normaliseAccount, type MappingOverrides } from "../domain/chartOfAccounts.ts";
import { fiscalYearEndMonth, isPassThrough, type RequestRow } from "../requests/schema.ts";
import { parseAmount, readCsvRecords, readTable } from "../util/tables.ts";
import { claudeAvailable } from "../util/claude.ts";
import { loadAdjustmentsCsv, type ScheduleRow } from "./adjustments.ts";
import { extractDocument, extractIntakeFacts, extractionToSource, isAiDocument } from "./aiExtract.ts";
import { looksLikeBankExport, parseBankCsv } from "./bankCsv.ts";
import { loadCustomersCsv, type CustomerFile } from "./customers.ts";
import { readDocxText } from "./docx.ts";
import type { IngestExtract } from "./extract.ts";
import { loadIntakeFile, toIntakeFacts, type LoadedIntake } from "./intake.ts";
import { loadKpisCsv } from "./kpis.ts";
import { mergeSources } from "./merge.ts";
import { loadPayrollCsv, type PayrollFile } from "./payroll.ts";
import { pullQuickbooks } from "./quickbooksApi.ts";
import { detectReportKind, parseQuickbooksExport } from "./quickbooksExport.ts";

export interface IntakeBundle {
  dataset: FinancialDataset;
  /** Intake notes, concatenated with file headings, for CIM drafting. */
  notes: string;
  files: { file: string; used: string }[];
  /** Where the structured intake facts came from. */
  intakeFacts: "intake.json" | "claude" | "none";
}

type IntakeFileKind = "adjustments" | "addbacks" | "overrides" | "customers" | "payroll" | "kpis" | "intake" | "copyFixture";

const INTAKE_FILES: { test: RegExp; kind: IntakeFileKind }[] = [
  { test: /^adjustments\.(csv|xlsx)$/, kind: "adjustments" },
  { test: /^addbacks\.csv$/, kind: "addbacks" },
  { test: /^mapping-overrides\.csv$/, kind: "overrides" },
  { test: /^customers?([-_ ].*)?\.(csv|xlsx)$/, kind: "customers" },
  { test: /^payroll([-_ ].*)?\.(csv|xlsx)$/, kind: "payroll" },
  { test: /^kpis?([-_ ].*)?\.(csv|xlsx)$/, kind: "kpis" },
  { test: /^intake\.json$/, kind: "intake" },
  // The name is COPY_FIXTURE in src/cim/narrative.ts; matched here so the ingest does not import the CIM engine.
  { test: /^cim-copy\.fixture\.json$/, kind: "copyFixture" },
];

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
  const extracts: IngestExtract[] = [];
  const files: IntakeBundle["files"] = [];
  const noteParts: string[] = [];
  const noteFiles: string[] = [];
  const problems: string[] = [];
  let adjustmentRows: ScheduleRow[] | undefined;
  let addbacks: Addback[] = [];
  let overrides: MappingOverrides = new Map();
  let customers: CustomerFile | undefined;
  let payroll: PayrollFile | undefined;
  const kpis: KpiSeries[] = [];
  let intake: LoadedIntake | undefined;
  let intakeFacts: IntakeBundle["intakeFacts"] = "none";

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
    if (fs.statSync(file).isDirectory() || lower.startsWith(".")) continue;
    const special = INTAKE_FILES.find((f) => f.test.test(lower))?.kind;
    try {
      if (special === "adjustments") {
        const loaded = await loadAdjustmentsCsv(file);
        adjustmentRows = loaded.rows;
        problems.push(...loaded.warnings);
        files.push({ file: name, used: `Adjustments schedule (${loaded.rows.length} rows)` });
      } else if (special === "addbacks") {
        addbacks = loadAddbacks(file);
        files.push({ file: name, used: "Seller add-backs" });
      } else if (special === "overrides") {
        overrides = loadOverrides(file);
        files.push({ file: name, used: "Account mapping overrides" });
      } else if (special === "customers") {
        customers = await loadCustomersCsv(file, fyEnd);
        problems.push(...customers.warnings);
        files.push({ file: name, used: `Customer list (${customers.rows.filter((r) => !r.residual).length} customers)` });
      } else if (special === "payroll") {
        payroll = await loadPayrollCsv(file, fyEnd);
        problems.push(...payroll.warnings);
        files.push({ file: name, used: `Payroll register (${payroll.rows.length} people)` });
      } else if (special === "kpis") {
        const loaded = await loadKpisCsv(file, fyEnd);
        kpis.push(...loaded.kpis);
        problems.push(...loaded.warnings);
        files.push({ file: name, used: `Operating metrics (${loaded.kpis.length})` });
      } else if (special === "intake") {
        intake = loadIntakeFile(file, row.business_name);
        intakeFacts = "intake.json";
        files.push({ file: name, used: "Structured intake facts" });
      } else if (special === "copyFixture") {
        files.push({ file: name, used: "CIM copy fixture (used when no API key is set)" });
      } else if (ext === ".md" || ext === ".txt" || ext === ".docx") {
        const text = ext === ".docx" ? readDocxText(file) : fs.readFileSync(file, "utf8");
        noteParts.push(`### ${name}\n${text.trim()}`);
        noteFiles.push(name);
        files.push({ file: name, used: "Intake notes" });
      } else if (ext === ".csv" || ext === ".xlsx" || ext === ".xlsm") {
        const grid = await readTable(file);
        if (detectReportKind(grid, name)) {
          const ex = await parseQuickbooksExport(file, fyEnd);
          extracts.push(ex);
          const span = ex.monthly ? `${ex.monthly.months.length} months` : `FY${ex.fullYears.join(", FY")}`;
          files.push({ file: name, used: `QuickBooks ${ex.pnlLines.length ? "P&L" : "balance sheet"} export (${span})` });
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
        extracts.push(extractionToSource(ex, file, fyEnd));
        files.push({ file: name, used: `${ex.form || ex.document_type} (read by Claude)` });
      } else {
        files.push({ file: name, used: "Skipped: unsupported file type" });
      }
    } catch (err) {
      files.push({ file: name, used: `Error: ${(err as Error).message}` });
      problems.push(`${name}: ${(err as Error).message}`);
    }
  }
  if (adjustmentRows && addbacks.length) {
    const i = files.findIndex((f) => f.file.toLowerCase() === "addbacks.csv");
    if (i >= 0) files[i] = { file: files[i]!.file, used: "Seller add-backs (superseded by adjustments.csv)" };
  }

  const notes = noteParts.join("\n\n");
  // Structured facts: the hand-written file wins; otherwise Claude transcribes the notes; otherwise every qualitative slot is a placeholder.
  if (!intake && notes && claudeAvailable()) {
    try {
      log("  Claude: transcribing the intake notes into structured facts");
      const wire = await extractIntakeFacts(notes, { businessName: row.business_name, sourceLabel: noteFiles.join(", ") });
      intake = { facts: toIntakeFacts(wire, row.business_name), revenueLines: [] };
      intakeFacts = "claude";
      files.push({ file: noteFiles.join(", "), used: "Structured intake facts (transcribed by Claude; review against the notes)" });
    } catch (err) {
      problems.push(`Intake notes could not be transcribed into structured facts: ${(err as Error).message}`);
    }
  } else if (!intake && notes) {
    problems.push("No structured intake facts: add intake.json to the source folder, or set ANTHROPIC_API_KEY so the notes are transcribed. Every qualitative CIM slot will be a [Confirm: ...] placeholder.");
  }

  const dataset = mergeSources({
    extracts,
    overrides,
    addbacks,
    fyEndMonth: fyEnd,
    ...(adjustmentRows ? { adjustmentRows } : {}),
    ...(customers ? { customers } : {}),
    ...(payroll ? { payroll } : {}),
    ...(kpis.length ? { kpis } : {}),
    ...(intake ? { intake } : {}),
    request: { replacementSalary: row.owner_replacement_salary, passThrough: isPassThrough(row) },
  });
  dataset.warnings.unshift(...problems);

  return { dataset, notes, files, intakeFacts };
}
