import { z } from "zod";

// One row of the high-priority request list. Column names match the CSV
// header exactly (see docs/REQUEST_LIST.md for what each one means).

export const PRIORITIES = ["P1", "P2", "P3"] as const;
export const STATUSES = ["new", "in_progress", "done", "needs_info", "error", "rerun"] as const;
export const ENTITY_TYPES = ["S-Corp", "C-Corp", "LLC", "Partnership", "Sole Prop"] as const;

/** Blank -> undefined; "$85,000" -> 85000; anything else is a validation error. */
function optionalNumeric(opts: { int?: boolean } = {}) {
  return z.string().transform((raw, ctx) => {
    const s = raw.replace(/[$,\s]/g, "");
    if (s === "") return undefined;
    const n = Number(s);
    if (!Number.isFinite(n) || (opts.int && !Number.isInteger(n))) {
      ctx.addIssue({ code: "custom", message: `expected a number, got "${raw}"` });
      return z.NEVER;
    }
    return n;
  });
}
const optionalNumber = optionalNumeric();
const optionalYear = optionalNumeric({ int: true });

export const RequestRowSchema = z.object({
  request_id: z.string().min(1),
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
  received_date: z.string(),
  due_date: z.string(),
  requested_by: z.string(),
  business_name: z.string().min(1),
  code_name: z.string().min(1),
  industry: z.string(),
  location: z.string(),
  entity_type: z.enum(ENTITY_TYPES),
  year_founded: optionalYear,
  employees: optionalNumber,
  fiscal_year_end: z.string().regex(/^(0[1-9]|1[0-2])-\d{2}$/, "use MM-DD, e.g. 12-31"),
  source_folder: z.string(),
  quickbooks_realm_id: z.string(),
  owner_replacement_salary: optionalNumber,
  asking_price: optionalNumber,
  notes: z.string(),
  output_folder: z.string(),
  last_run: z.string(),
  last_error: z.string(),
});

export type RequestRow = z.infer<typeof RequestRowSchema>;

/** Header order for the CSV. Keep in sync with RequestRowSchema. */
export const REQUEST_COLUMNS = Object.keys(RequestRowSchema.shape) as (keyof RequestRow)[];

export function fiscalYearEndMonth(row: RequestRow): number {
  return Number(row.fiscal_year_end.slice(0, 2));
}

export function isPassThrough(row: RequestRow): boolean {
  return row.entity_type !== "C-Corp";
}
