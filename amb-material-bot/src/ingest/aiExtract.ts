// Reads tax returns, bank statements and PDF financial statements with
// Claude and returns them as normalised lines. Scanned documents work too:
// the PDF goes to Claude as a document, not through local OCR.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BS_CATEGORIES, IS_CATEGORIES, type SourceExtract, type SourceKind } from "../domain/financials.ts";
import { assertFinished, claude, CLAUDE_MODEL, fallbackOptions } from "../util/claude.ts";

const LineSchema = z.object({
  label: z.string().describe("Line description as printed, e.g. 'Compensation of officers'"),
  line_reference: z.string().describe("Form line or statement reference, e.g. '1120-S line 7', 'Stmt 3'. Empty if none."),
  amount: z.number().describe("Positive magnitude in dollars"),
});

export const ExtractionSchema = z.object({
  document_type: z.enum(["tax_return", "bank_statement", "financial_statement", "other"]),
  form: z.string().describe("e.g. 'Form 1120-S', 'Form 1065', 'Schedule C', 'Reviewed financial statements', 'Business checking statement'"),
  entity_name: z.string(),
  fiscal_years: z.array(
    z.object({
      year: z.number().int().describe("Fiscal year, named for the calendar year it ends in"),
      months_covered: z.number().int(),
      pnl_lines: z.array(LineSchema.extend({ category: z.enum(IS_CATEGORIES) })),
      balance_sheet_lines: z.array(LineSchema.extend({ category: z.enum(BS_CATEGORIES) })),
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
- Tax returns: take the P&L from page 1 and the attached deduction statements (and Form 1125-A for COGS). Take the balance sheet from Schedule L, END-of-year column only, as the year-end balance sheet. Retained earnings, capital stock and paid-in capital go to equity; loans from shareholders and mortgages/notes go to debt.
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
export function extractionToSource(ex: Extraction, file: string, fyEndMonth: number): SourceExtract {
  const kind: SourceKind =
    ex.document_type === "tax_return" ? "tax_return" : ex.document_type === "bank_statement" ? "bank_statement" : "financial_statement";
  const out: SourceExtract = {
    kind,
    file,
    pnlLines: [],
    bsLines: [],
    fullYears: [],
    notes: ex.notes.map((n) => `${path.basename(file)}: ${n}`),
  };
  for (const fy of ex.fiscal_years) {
    if (fy.months_covered >= 12) out.fullYears.push(fy.year);
    else out.notes!.push(`${path.basename(file)}: FY${fy.year} covers ${fy.months_covered} months and is excluded (full years only).`);
    for (const l of fy.pnl_lines) {
      out.pnlLines.push({ account: l.label, section: l.line_reference, year: fy.year, amount: l.amount, category: l.category });
    }
    for (const l of fy.balance_sheet_lines) {
      out.bsLines.push({ account: l.label, section: l.line_reference, year: fy.year, amount: l.amount, category: l.category });
    }
  }
  if (ex.bank_months.length) {
    out.deposits = {};
    for (const m of ex.bank_months) {
      const [y, mo] = m.month.split("-").map(Number) as [number, number];
      const fy = mo <= fyEndMonth ? y : y + 1;
      const cur = out.deposits[fy] ?? { amount: 0, months: 0 };
      out.deposits[fy] = { amount: cur.amount + m.deposits, months: cur.months + 1 };
    }
  }
  return out;
}
