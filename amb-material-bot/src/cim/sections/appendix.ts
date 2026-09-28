// S11 Appendix (guide 3.3): basis of preparation and definitions (always),
// the income statement by month for the latest twelve months, detailed
// retention and cohorts when they did not fit the body, and the coded
// customer list for short lists. Topic titles are allowed here (guide 4.5).

import { monthLabel } from "../../domain/financials.ts";
import type { CimContext } from "../context.ts";
import { standardNote } from "../context.ts";
import type { Block, TextCell } from "../design.ts";
import { r3, spanW } from "../design.ts";
import { monthlyIncomeStatement } from "../exhibits.ts";
import { fmtPct, k } from "../../util/format.ts";
import { draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Appendix";

/** Definitions of every measure the deck prints (guide S11.1), with the formula the engine uses. */
function definitions(ctx: CimContext, w: number): Block {
  const rows: TextCell[][] = [
    ["Reported EBITDA", "Net income plus interest expense [D1], income taxes [D2] and depreciation and amortization [D3]. Includes other income and expense; non-operating items are removed as normalization adjustments."],
    ["Normalization adjustments [N]", "Accepted adjustments that remove owner-discretionary, non-recurring and non-operating items. Positive amounts increase EBITDA."],
    ...(ctx.mainStreet
      ? [["SDE", "Seller's discretionary earnings: Reported EBITDA plus normalization adjustments plus one working owner's compensation as paid [S1]."]]
      : []),
    ["Adj. EBITDA", ctx.mainStreet ? "SDE less market replacement compensation for the owner [S2] and a capital reserve [S3]." : "Reported EBITDA plus normalization adjustments plus owner compensation above a market replacement cost [S1] + [S2]."],
    ["PF Adj. EBITDA", "Adj. EBITDA plus accepted pro forma adjustments [PF]; equal to Adj. EBITDA when none is accepted."],
    ...(ctx.ltm ? [["LTM", "The twelve months ending with the as-of month."]] : []),
    ...(ctx.out.customers?.retention
      ? [
          ["Churn", "Lost accounts ÷ the average of starting and ending accounts in the period."],
          ["GDR", "Gross dollar retention: prior-year revenue of accounts active at the start of the year, less lost accounts and downsell, ÷ that starting revenue."],
          ["NDR", "Net dollar retention: GDR plus upsell from continuing accounts."],
        ]
      : []),
    ...(ctx.out.headcount ? [["Revenue per employee", "Revenue ÷ employees on payroll at fiscal year-end, excluding the owner; field employees are service and installation staff."]] : []),
    ["Free cash flow", "Cash from operations less capital expenditure derived as the change in net fixed assets plus depreciation."],
  ];
  return { kind: "textTable", header: { title: "Definitions" }, spec: { colW: [1.75, r3(w - 1.75)], head: ["Term", "Definition"], rows, fontSize: 8.5 } };
}

/** The sources behind the deck and what each was used for (guide S11.1, REQ precedence). */
function sourcesTable(ctx: CimContext, w: number): Block {
  const ds = ctx.ds;
  const years = `FY${ds.years[0]}–FY${ds.years[ds.years.length - 1]}`;
  const rows: TextCell[][] = [[ctx.sources.statements, ds.monthly ? `${monthLabel(ds.monthly.months[0]!.key)} to ${monthLabel(ds.monthly.months[ds.monthly.months.length - 1]!.key)}, monthly` : years, "Income statement, EBITDA ladder, margins"]];
  if (ds.balanceSheets?.length) rows.push(["Balance sheets", ds.balanceSheets.map((b) => b.asOf.slice(0, 4)).join(", "), "Working capital, debt, cash conversion"]);
  if (ds.adjustments?.length) rows.push(["Seller add-back list and GL detail", years, "Normalization adjustments"]);
  if (ds.customers) rows.push([`${ds.customers.term} list (coded)`, `To ${monthLabel(ds.customers.asOfMonth)}`, "Concentration, mix and retention"]);
  if (ds.payroll) rows.push(["Payroll register", `To ${monthLabel(ds.payroll.asOfMonth)}`, "Headcount, compensation and tenure"]);
  if (ds.depositsByMonth) rows.push(["Bank statements", `${Object.keys(ds.depositsByMonth).length} months`, "Proof of cash against revenue"]);
  if (ds.intake) rows.push(["Management (intake call)", "As of the request", "Operations, people, transaction terms"]);
  return { kind: "textTable", header: { title: "Sources" }, spec: { colW: [1.6, 1.15, r3(w - 2.75)], head: ["Source", "Period", "Used for"], rows, fontSize: 8.5 } };
}

const s11_1: PageModule = {
  id: "S11.1",
  name: "Basis of preparation and definitions",
  status: "A",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S11.1",
        section: SECTION,
        title: "Basis of preparation and definitions",
        rows: [{ columns: [{ span: [1, 7], blocks: [definitions(ctx, spanW(1, 7) - 0.1)] }, { span: [8, 12], blocks: [sourcesTable(ctx, spanW(8, 12))] }] }],
        notes: {
          source: source(ctx.sources.financials, "Management"),
          note: standardNote(ctx, `Revenue is reported gross. Margins are of total revenue. Adjustment tiers: [D] definitional, [N] normalization, [S] owner compensation${ctx.pf ? ", [PF] pro forma" : ""}.`),
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
        notes: { source: source(ctx.sources.customers), note: "Customers are coded; names are available in the data room after a management meeting." },
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
