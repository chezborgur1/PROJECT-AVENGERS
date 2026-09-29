// S11 Appendix (guide 3.3): basis of preparation and definitions (always),
// the income statement by month for the latest twelve months, detailed
// retention and cohorts when they did not fit the body, and the coded
// customer list for short lists. Topic titles are allowed here (guide 4.5).

import { monthLabel } from "../../domain/financials.ts";
import type { CimContext } from "../context.ts";
import { dataAgeDays, STALE_DAYS } from "../../model/types.ts";
import { codedNote, fieldDepartments, standardNote } from "../context.ts";
import type { Block, TextCell } from "../design.ts";
import { blockHeight, gapBefore, r3, spanW } from "../design.ts";
import { monthlyIncomeStatement, ownerCompRung } from "../exhibits.ts";
import { fmtPct, k } from "../../util/format.ts";
import { draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Appendix";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Definitions of every measure the deck prints (guide S11.1), with the formula the engine uses. */
function definitionRows(ctx: CimContext): TextCell[][] {
  const fye = MONTHS[ctx.out.fiscalYearEndMonth - 1];
  const fy = ctx.ds.years[ctx.ds.years.length - 1];
  const techDept = ctx.out.headcount?.byDepartment.find((d) => /field service|service/i.test(d.department))?.department;
  return [
    ["Reported EBITDA", "Net income plus interest expense [D1], income taxes [D2] and depreciation and amortization [D3]. Includes other income and expense; non-operating items are removed as normalization adjustments."],
    ["Normalization adjustments [N]", "Adjustments included in Adj. EBITDA that remove owner-discretionary, non-recurring and non-operating items. Positive amounts increase EBITDA."],
    ...(ctx.mainStreet
      ? [["SDE", `Seller's discretionary earnings: Reported EBITDA plus normalization adjustments plus one working owner's compensation: salary, payroll taxes and benefits ${ownerCompRung(ctx).refs}.`]]
      : []),
    ["Adj. EBITDA", ctx.mainStreet ? "SDE less market replacement compensation for the owner [S2] and a capital reserve [S3]." : "Reported EBITDA plus normalization adjustments plus owner compensation above a market replacement cost [S1] + [S2]."],
    // Defined only when the deck shows it: a pro forma adjustment is included (guide 3.3).
    ...(ctx.pf ? [["PF Adj. EBITDA", "Adj. EBITDA plus the pro forma adjustments [PF] included in it."]] : []),
    ...(ctx.ltm ? [["LTM", "The twelve months ending with the as-of month."]] : []),
    ...(ctx.out.customers?.retention
      ? [
          ["Churn", "Lost accounts ÷ the average of starting and ending accounts in the period."],
          ["GDR", "Gross dollar retention: prior-year revenue of accounts active at the start of the year, less lost accounts and downsell, ÷ that starting revenue."],
          ["NDR", "Net dollar retention: GDR plus upsell from continuing accounts."],
        ]
      : []),
    ...(ctx.out.headcount ? [["Revenue per employee", `Revenue ÷ employees on payroll at fiscal year-end, excluding the owner${fieldDepartments(ctx) ? `; field employees are those in ${fieldDepartments(ctx).charAt(0).toLowerCase()}${fieldDepartments(ctx).slice(1)}` : ""}.`]] : []),
    ["Free cash flow", "Cash from operations less capital expenditure derived as the change in net fixed assets plus depreciation."],
    ...(ctx.out.nwc ? [["DSO, DIO, DPO", "Days sales, inventory and payables outstanding: receivables ÷ revenue, inventory ÷ cost of revenue and payables ÷ cost of revenue, each over the trailing twelve months, × 365."]] : []),
    ...(ctx.out.customers ? [["Cum. %", "Cumulative share of revenue of the accounts ranked above and including the row."]] : []),
    // Named by the payroll department the capacity table divides by, never by the sample's trade.
    ...(techDept && ctx.ds.kpis?.some((k) => k.key === "maintenance_members") ? [[`Members per ${techDept.toLowerCase()} employee`, `Maintenance-agreement members at the stated date ÷ ${techDept.toLowerCase()} employees on payroll.`]] : []),
    ["Fiscal year", `The Company's fiscal year ends in ${fye}; FY${fy} is the year ending ${fye} ${fy}.`],
  ];
}

const definitionsTable = (rows: TextCell[][], w: number, continued: boolean): Block => ({
  kind: "textTable",
  header: { title: continued ? "Definitions (continued)" : "Definitions" },
  spec: { colW: [1.75, r3(w - 1.75)], head: ["Term", "Definition"], rows, fontSize: 8.5 },
});

/**
 * The definitions down the left and the sources on the right, with the
 * definitions running on under the sources where that lets the two columns
 * end together (spec 1: within 0.50 in).
 */
function basisColumns(ctx: CimContext, lw: number, rw: number): { left: Block[]; right: Block[] } {
  const rows = definitionRows(ctx);
  const sources = sourcesTable(ctx, rw);
  const split = (k: number) => {
    const left = definitionsTable(rows.slice(0, k), lw, false);
    const tail = k < rows.length ? definitionsTable(rows.slice(k), rw, true) : undefined;
    const rightH = blockHeight(sources, rw) + (tail ? gapBefore(sources, tail) + blockHeight(tail, rw) : 0);
    return { left: [left], right: present(sources, tail), gap: Math.abs(blockHeight(left, lw) - rightH) };
  };
  let best = split(rows.length);
  for (let k = Math.ceil(rows.length / 2); k < rows.length; k++) {
    const next = split(k);
    if (next.gap < best.gap) best = next;
  }
  return best;
}

/** The sources behind the deck and what each was used for (guide S11.1, REQ precedence). */
function sourcesTable(ctx: CimContext, w: number): Block {
  const ds = ctx.ds;
  const years = `FY${ds.years[0]}–FY${ds.years[ds.years.length - 1]}`;
  const rows: TextCell[][] = [[ctx.sources.statements, ds.monthly ? `${monthLabel(ds.monthly.months[0]!.key)} to ${monthLabel(ds.monthly.months[ds.monthly.months.length - 1]!.key)}, monthly` : years, "Income statement, EBITDA ladder, margins"]];
  // Periods are named as the tables name them (Dec-23, Jan-25 to Dec-25), never as bare years or a count (QA round 2 F42).
  if (ds.balanceSheets?.length) rows.push(["Balance sheets", ds.balanceSheets.map((b) => monthLabel(b.asOf.slice(0, 7))).join(", "), "Working capital, debt, cash conversion"]);
  if (ds.adjustments?.length) rows.push(["Seller add-back list and GL detail", years, "Normalization adjustments"]);
  if (ds.customers) rows.push([`${ds.customers.term} list (coded)`, `To ${monthLabel(ds.customers.asOfMonth)}`, "Concentration, mix and retention"]);
  if (ds.payroll) rows.push(["Payroll register", `To ${monthLabel(ds.payroll.asOfMonth)}`, "Headcount, compensation and tenure"]);
  const bankMonths = Object.keys(ds.depositsByMonth ?? {}).sort();
  if (bankMonths.length) rows.push(["Bank statements", bankMonths.length === 1 ? monthLabel(bankMonths[0]!) : `${monthLabel(bankMonths[0]!)} to ${monthLabel(bankMonths.at(-1)!)}`, "Proof of cash against revenue"]);
  if (ds.intake) rows.push(["Management (intake call)", "As of the intake call", "Operations, people, transaction terms"]);
  return { kind: "textTable", header: { title: "Sources" }, spec: { colW: [1.6, 1.15, r3(w - 2.75)], head: ["Source", "Period", "Used for"], rows, fontSize: 8.5 } };
}

/**
 * When the deck is dated well after its latest figures, the basis of
 * preparation says the months since are not included: the current year to
 * date is a buyer's first request, and open-questions.md asks the Seller for it.
 */
function staleNote(ctx: CimContext): string {
  if (dataAgeDays(ctx.out.asOfDate, ctx.date) <= STALE_DAYS) return "";
  const year = ctx.date.getUTCFullYear();
  const since = monthLabel(ctx.out.asOfDate.slice(0, 7));
  const q = `Results after ${since}${Number(ctx.out.asOfDate.slice(0, 4)) < year ? `, including ${year} year to date` : ""}, for the deck: the basis of preparation says they are not included`;
  if (!ctx.openQuestions.includes(q)) ctx.openQuestions.push(q);
  return ` Results after ${since}${Number(ctx.out.asOfDate.slice(0, 4)) < year ? `, including ${year} year to date,` : ""} are not included.`;
}

const s11_1: PageModule = {
  id: "S11.1",
  name: "Basis of preparation and definitions",
  status: "A",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const { left, right } = basisColumns(ctx, r3(spanW(1, 7) - 0.1), spanW(8, 12));
    return [
      draft(ctx, {
        id: "S11.1",
        section: SECTION,
        title: "Basis of preparation and definitions",
        rows: [{ columns: [{ span: [1, 7], blocks: left }, { span: [8, 12], blocks: right }] }],
        notes: {
          source: source(ctx.sources.financials, "Management"),
          // The tiers are in the Definitions table; the note says instead what a buyer asks first when the figures are old (QA round 2 F42, F43).
          note: standardNote(ctx, `Revenue is reported gross. Margins are of total revenue.${staleNote(ctx)}`),
        },
        kind: "reference",
      }),
    ];
  },
};

const s11_2: PageModule = {
  id: "S11.2",
  name: "Detailed income statement (monthly)",
  status: "C",
  absent: (ctx) => ((ctx.out.monthly?.months.length ?? 0) >= 12 ? undefined : "No monthly P&L"),
  budget: [0, 1],
  build(ctx) {
    const table = monthlyIncomeStatement(ctx);
    const mo = ctx.out.monthly!;
    const last = monthLabel(mo.months[mo.months.length - 1]!.key);
    const first = monthLabel(mo.months[mo.months.length - 12]!.key);
    return [
      draft(ctx, {
        id: "S11.2",
        section: SECTION,
        title: `Detailed income statement, twelve months to ${last}`,
        rows: [{ columns: [{ span: [1, 12], blocks: present(table) }] }],
        notes: { source: source(`${ctx.sources.statements}, monthly, ${first} to ${last}`), note: `Figures in USD thousands. Months are as reported; the total column ties to the ${ctx.ltm ? ctx.ltm.label : ctx.latest.label} column of the income statement.` },
        kind: "reference",
      }),
    ];
  },
};

const s11_3: PageModule = {
  id: "S11.3",
  name: "Detailed retention and cohorts",
  status: "C",
  // Segment tables move here from S4 when a segment churns differently; the request data carries no segments, and the cohort triangle sits on the retention page.
  absent: () => "No segmented retention tables in the request data",
  budget: [0, 1],
  build: () => [],
};

const s11_4: PageModule = {
  id: "S11.4",
  name: "Coded customer list",
  status: "C",
  absent: (ctx) => {
    const n = ctx.ds.customers?.customers.length ?? 0;
    return n > 0 && n <= 60 ? undefined : n > 60 ? `${n} customers, above the 60 the appendix lists` : "No customer list";
  },
  budget: [0, 1],
  build(ctx) {
    const list = ctx.out.customers!.concentration.top;
    const per = Math.ceil(list.length / 3);
    const table = (rows: typeof list, first: boolean): Block => ({
      kind: "numTable",
      ...(first ? { header: { title: "Customers", units: `(${ctx.out.customers!.period.label}, $000s)` } } : {}),
      spec: {
        name: "Customer",
        cols: [{ w: 0.62, kind: "label" }, { w: 1.55, kind: "num", head: "Type", left: true }, { w: 0.7, kind: "num", head: "Revenue" }, { w: 0.6, kind: "num", head: "% total" }],
        rows: rows.map((r) => ({ type: "line", label: r.id, vals: [r.type ?? "", k(r.revenue), fmtPct(r.pctOfTotal)] })),
        rowH: 0.19,
        fontSize: 8,
      },
    });
    return [
      draft(ctx, {
        id: "S11.4",
        section: SECTION,
        title: `Coded customer list, ${ctx.out.customers!.period.label}`,
        rows: [{ columns: [0, 1, 2].map((i) => ({ span: [1 + i * 4, 4 + i * 4] as [number, number], blocks: [table(list.slice(i * per, (i + 1) * per), i === 0)] })) }],
        notes: { source: source(ctx.sources.customers), note: codedNote(ctx) },
        kind: "reference",
      }),
    ];
  },
};

const s11_5: PageModule = {
  id: "S11.5",
  name: "Market rent comparables",
  status: "C",
  absent: (ctx) => (ctx.intake?.locations.some((l) => l.arrangement === "owned_by_seller_offered_for_lease") ? "Owner-held premises: comparables table not yet in the request data" : "Premises not owner-held"),
  budget: [0, 1],
  build: () => [],
};

export const S11: SectionModule = { id: "S11", name: SECTION, pages: [s11_1, s11_2, s11_3, s11_4, s11_5] };
