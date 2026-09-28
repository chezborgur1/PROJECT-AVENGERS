// Reads tax returns, bank statements and PDF financial statements with
// Claude and returns them as normalised lines, and transcribes intake notes
// into structured facts. Scanned documents work too: the PDF goes to Claude
// as a document, not through local OCR.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BS_CATEGORIES, IS_CATEGORIES, type MonthKey, type SourceKind } from "../domain/financials.ts";
import { assertFinished, claude, CLAUDE_MODEL, fallbackOptions } from "../util/claude.ts";
import { depositsByFiscalYear } from "./bankCsv.ts";
import { partialYearNote } from "./quickbooksExport.ts";
import { IntakeWireSchema, type IntakeWire } from "./intake.ts";
import type { IngestExtract } from "./extract.ts";

const LineSchema = z.object({
  label: z.string().describe("Line description as printed, e.g. 'Compensation of officers'"),
  line_reference: z.string().describe("Form line or statement reference, e.g. '1120-S line 7', 'Stmt 3'. Empty if none."),
  amount: z.number().describe("Positive magnitude in dollars"),
});

export const ExtractionSchema = z.object({
  document_type: z.enum(["tax_return", "bank_statement", "financial_statement", "other"]),
  form: z.string().describe("e.g. 'Form 1120-S', 'Form 1065', 'Schedule C', 'Reviewed financial statements', 'Business checking statement'"),
  entity_name: z.string(),
  books_basis: z.enum(["cash", "accrual", "unknown"]).describe("Accounting method the document states (Schedule C line F, 1120-S Schedule B line 1, statement notes); unknown if not stated"),
  fiscal_years: z.array(
    z.object({
      year: z.number().int().describe("Fiscal year, named for the calendar year it ends in"),
      months_covered: z.number().int(),
      pnl_lines: z.array(LineSchema.extend({ category: z.enum(IS_CATEGORIES) })),
      balance_sheet_lines: z.array(LineSchema.extend({ category: z.enum(BS_CATEGORIES) })),
      equipment_placed_in_service: z
        .number()
        .nullable()
        .describe("Form 4562: Part I line 2 plus Part III Section B basis, excluding real property. Null when the return has no Form 4562."),
    }),
  ),
  bank_months: z.array(
    z.object({
      month: z.string().describe("YYYY-MM"),
      deposits: z.number().describe("Operating deposits: excludes transfers between the business's own accounts, loan proceeds and owner contributions"),
      excluded_deposits: z.number().describe("Deposits left out of `deposits` (transfers, loan proceeds, owner contributions)"),
      withdrawals: z.number(),
      ending_balance: z.number(),
    }),
  ),
  notes: z.array(z.string()).describe("Anything an M&A advisor should know: amended returns, unusual items, illegible pages, items you were unsure how to categorise"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You extract financial data from source documents for an M&A advisory firm preparing a sell-side financial model on a small private business.

Rules:
- Extract only what the document shows. Never estimate or fill gaps.
- Use detail lines, not subtotals or totals, so nothing is double counted. If only a total exists for a group (e.g. "Other deductions" with no statement attached), use that single line.
- Amounts are positive magnitudes. Contra items (returns and allowances, accumulated depreciation) are the exception: give them as negative amounts so a straight sum is correct.
- Categories:
  revenue = gross receipts/sales net of returns; cogs = cost of goods sold / cost of sales;
  owner_comp = officer compensation (1120/1120-S), guaranteed payments to partners (1065), or owner wages;
  payroll = non-owner salaries, wages, payroll taxes, employee benefits, pension/profit-sharing, contract labor;
  rent = rent and lease payments for property; marketing = advertising;
  depreciation_amortization = depreciation, Section 179, amortization, depletion;
  interest_expense = interest paid; income_tax = entity-level income taxes only;
  other_income = interest/dividend income, gains, other income not from operations;
  other_expense = non-operating losses; other_opex = every other operating deduction (taxes & licenses, repairs, insurance, utilities, bad debts, etc.).
- Tax returns: take the P&L from page 1 and the attached deduction statements (and Form 1125-A for COGS). Take the balance sheet from Schedule L, END-of-year column only, as the year-end balance sheet. Retained earnings, capital stock and paid-in capital go to equity; loans from shareholders and mortgages/notes go to debt. When a Form 4562 is attached, report the equipment cost placed in service (Part I line 2 plus Part III Section B basis, excluding real property).
- Bank statements: fill bank_months only (fiscal_years empty). Keep transfers between the company's own accounts, loan proceeds and owner contributions out of deposits.
- Financial statements (compiled/reviewed/audited or internally prepared PDFs): extract both the income statement and the balance sheet per year shown.
- If a document spans part of a year, report months_covered honestly.`;

const MEDIA_TYPES: Record<string, "application/pdf" | "image/png" | "image/jpeg"> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function isAiDocument(file: string): boolean {
  return path.extname(file).toLowerCase() in MEDIA_TYPES;
}

export async function extractDocument(file: string, context: { businessName: string; fyEndMonth: number }): Promise<Extraction> {
  const ext = path.extname(file).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) throw new Error(`Not a PDF or image: ${file}`);
  const data = fs.readFileSync(file).toString("base64");

  const docBlock =
    mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: mediaType, data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: mediaType, data } } as const);

  const response = await claude().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    ...fallbackOptions(),
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          docBlock,
          {
            type: "text",
            text: `Business: ${context.businessName}. Fiscal year ends in month ${context.fyEndMonth}. File name: ${path.basename(file)}. Extract this document.`,
          },
        ],
      },
    ],
  });
  assertFinished(response.stop_reason, path.basename(file));
  if (!response.parsed_output) throw new Error(`Could not parse Claude's extraction of ${path.basename(file)}`);
  return response.parsed_output;
}

/** Convert an extraction into the same shape every other source produces. */
export function extractionToSource(ex: Extraction, file: string, fyEndMonth: number): IngestExtract {
  const kind: SourceKind =
    ex.document_type === "tax_return" ? "tax_return" : ex.document_type === "bank_statement" ? "bank_statement" : "financial_statement";
  const out: IngestExtract = {
    kind,
    file,
    pnlLines: [],
    bsLines: [],
    fullYears: [],
    partialYears: [],
    notes: ex.notes.map((n) => `${path.basename(file)}: ${n}`),
  };
  if (ex.books_basis !== "unknown") out.booksBasis = ex.books_basis;
  for (const fy of ex.fiscal_years) {
    if (fy.months_covered >= 12) out.fullYears.push(fy.year);
    else {
      out.partialYears!.push({ year: fy.year, months: fy.months_covered });
      out.notes!.push(partialYearNote({ year: fy.year, months: fy.months_covered }, file, false));
    }
    for (const l of fy.pnl_lines) {
      out.pnlLines.push({ account: l.label, section: l.line_reference, year: fy.year, amount: l.amount, category: l.category });
    }
    for (const l of fy.balance_sheet_lines) {
      out.bsLines.push({ account: l.label, section: l.line_reference, year: fy.year, amount: l.amount, category: l.category });
    }
    if (fy.equipment_placed_in_service !== null) {
      (out.equipmentPlacedInService ??= {})[fy.year] = fy.equipment_placed_in_service;
    }
  }
  if (ex.bank_months.length) {
    const byMonth: Record<MonthKey, { amount: number; excluded: number }> = {};
    for (const m of ex.bank_months) {
      const cur = (byMonth[m.month] ??= { amount: 0, excluded: 0 });
      cur.amount += m.deposits;
      cur.excluded += m.excluded_deposits;
    }
    out.depositsByMonth = byMonth;
    out.deposits = depositsByFiscalYear(byMonth, fyEndMonth);
  }
  return out;
}

const INTAKE_SYSTEM = `You transcribe intake notes about a small private business into structured facts for an M&A advisory firm's information memorandum.

Rules:
- Record only what the notes state. Never infer, estimate, round up or complete a fact. A field the notes do not give is null; a list the notes do not cover is empty.
- Keep the notes' own wording for descriptions, baselines and quotes; do not add adjectives.
- Provenance: every item's source names the notes file and the heading or line it sits under. Evidence is "documented" only when the notes cite a document (a lease, a contract, a certificate); everything management says is "management_representation".
- Growth levers: baseline is what is true today in the notes' words; target only if the notes give a benchmark or a management target; proofPoint only if the notes give evidence the lever works.
- Owner responsibilities: one entry per responsibility named; hoursPerWeek only when the notes give hours for that responsibility, not the owner's total.
- Management: only people the notes name with a role; postCloseIntent "unknown" unless the notes say.
- Transaction: dealFormPreference only when the notes state asset or equity; replacementSalary only when a figure is given.
- Market inputs: only figures with a named source; never a market size the notes do not give.`;

/** Transcribe intake notes into the wire form; the caller converts with toIntakeFacts. */
export async function extractIntakeFacts(notes: string, context: { businessName: string; sourceLabel: string }): Promise<IntakeWire> {
  const response = await claude().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    ...fallbackOptions(),
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(IntakeWireSchema) },
    system: INTAKE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Business: ${context.businessName}. Source label for provenance: "${context.sourceLabel}".\n\nIntake notes:\n\n${notes}`,
      },
    ],
  });
  assertFinished(response.stop_reason, "the intake notes");
  if (!response.parsed_output) throw new Error("Could not parse Claude's transcription of the intake notes");
  return response.parsed_output;
}
