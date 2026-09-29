// S6 Financial performance (guide 3.3): the income statement with revenue
// and Adj. EBITDA panels, revenue analysis (on the services page when the
// lines fit there), cost structure, and the monthly trend. S6.1 is never cut;
// S6.4 is the last module the length cap may cut (guide 3.5 rule 5).

import { monthLabel } from "../../domain/financials.ts";
import type { CimContext } from "../context.ts";
import { nonGaap, pageCopy, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import type { NumRow } from "../design.ts";
import { costShiftChart, costStructure, incomeStatement, keyObservations, monthlyRevenue, observationsBlock, quarterlyRevenue, revenueAdjPanels, revenueByLine, revenueMixChart, usable } from "../exhibits.ts";
import { chooseTitle, draft, present, source, verb } from "./common.ts";
import { fmtPct, k } from "../../util/format.ts";
import { accountLabel } from "../brief.ts";
import { at, tableColumns } from "../context.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Financial performance";

/** "over FY2023–FY2025": the span a fiscal-year change in a title is measured over (spec 6.1: every title figure has its period). */
const fyRangeOf = (ctx: CimContext): string => `over ${ctx.fy[0]!.label}–${ctx.fy[ctx.fy.length - 1]!.label}`;

/**
 * What cost of revenue holds and where wages sit, read from the client's own
 * mapped accounts, so a reader can compare gross margins; nothing the
 * mapping does not show goes into the note (rule 5).
 */
function cogsNote(ctx: CimContext): string | undefined {
  const latest = at(ctx, ctx.latest);
  const accounts = (cat: string) => Object.keys(latest.accountLines).filter((a) => latest.accountLines[a] && ctx.ds.lines.some((l) => l.account === a && l.category === cat && l.statement === "pnl"));
  const cogs = accounts("cogs").map((a) => accountLabel(a).toLowerCase());
  if (!cogs.length || cogs.length > 4) return undefined;
  // A serial comma whenever a label holds its own "and" ("equipment and materials, and subcontractors").
  const comma = cogs.length > 2 || cogs.some((c) => / and /.test(c)) ? "," : "";
  const list = cogs.length === 1 ? cogs[0]! : `${cogs.slice(0, -1).join(", ")}${comma} and ${cogs[cogs.length - 1]}`;
  const direct = cogs.some((c) => /wage|labor|labour|payroll/.test(c));
  const wages = accounts("payroll").length ? `; ${direct ? "other wages are" : "wages are"} in operating expenses` : "";
  return `Cost of revenue is ${list}${wages}.`;
}

const s6_1: PageModule = {
  id: "S6.1",
  name: "Income statement summary",
  status: "A",
  copyKey: "s6_1",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s6_1") ?? fallback61(ctx);
    const is = incomeStatement(ctx, usable(1, 6));
    const panels = revenueAdjPanels(ctx, false, "reported");
    const obs = observationsBlock("the income statement", keyObservations(ctx, "S6.1", copy.observations, [is]));
    const b = ctx.brief;
    const title = chooseTitle(
      ctx,
      "S6.1 title",
      copy.title,
      b.has("rev.cagr")
        ? `Revenue grew at a ${b.t("rev.cagr")} CAGR to ${b.t("rev.latest")} in ${ctx.latest.label} while gross margin moved ${b.t("gm.delta")} to ${b.t("gm.latest")}`
        : `Revenue was ${b.t("rev.latest")} in ${ctx.latest.label} with a gross margin of ${b.t("gm.latest")}`,
    );
    return [
      draft(ctx, {
        id: "S6.1",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: [is] }, { span: [7, 12], blocks: present(panels, obs) }] }],
        notes: {
          source: source(ctx.sources.financials),
          note: standardNote(ctx, cogsNote(ctx)),
          footnotes: [`Net income before interest, income taxes, depreciation and amortization; includes other income, which the ladder removes as a normalization adjustment. ${nonGaap(ctx).split(";")[0]}.`],
        },
      }),
    ];
  },
  fallback: (ctx) => ({ s6_1: fallback61(ctx) }),
};

function fallback61(ctx: CimContext): NonNullable<CimCopy["s6_1"]> {
  const b = ctx.brief;
  // Without a prior-year window there is no change to quote, so each observation states the level.
  const yoy = b.has("rev.yoy");
  return {
    observations: [
      yoy
        ? { row: "is.revenue", lead: `Revenue ${verb(b.value("rev.yoy"))} {{rev.yoy}} to {{rev.latest}}`, body: `in ${ctx.latest.label}; the change by service line is in the table.` }
        : { row: "is.revenue", lead: "Revenue of {{rev.latest}}", body: `in ${ctx.latest.label}; the lines are in the table.` },
      { row: "is.gp", lead: "Gross profit of {{gp.latest}}", body: `at ${b.article("gm.latest")} {{gm.latest}} margin${yoy ? ", {{gm.deltaYoy}} on the prior year" : ""}.` },
      { row: "is.opex", lead: "Operating expenses of {{opex.latest}}", body: "were {{opexPct.latest}} of revenue, including owner compensation of {{ownerComp.latest}}." },
      { row: "is.ebitda", lead: "Reported EBITDA of {{repEbitda.latest}}", body: `was ${b.article("repMargin.latest")} {{repMargin.latest}} margin${yoy ? ", {{repMargin.deltaYoy}} on the prior year" : ""}.` },
    ],
  };
}

const s6_2: PageModule = {
  id: "S6.2",
  name: "Revenue analysis",
  status: "A",
  copyKey: "s6_2",
  absent: () => undefined,
  // Up to four revenue lines sit on the services page beside the mix chart that already shows them.
  mergeInto: (ctx) => (ctx.present.has("S2.2") && ctx.out.periods[ctx.latest.key]!.revenueLines.length <= 5 ? "S2.2" : undefined),
  budget: [0, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s6_2");
    const table = revenueByLine(ctx, usable(1, 6));
    const mix = revenueMixChart(ctx);
    const obs = observationsBlock("the revenue table", keyObservations(ctx, "S6.2", copy?.observations, [table]));
    const b = ctx.brief;
    return [
      draft(ctx, {
        id: "S6.2",
        section: SECTION,
        title: chooseTitle(ctx, "S6.2 title", copy?.title, `Revenue reached ${b.t("rev.latest")} in ${ctx.latest.label}${b.has("rev.yoy") ? `, ${b.t("rev.yoy")} ${b.value("rev.yoy")! < 0 ? "below" : "above"} the prior year` : ""}`),
        rows: [{ columns: [{ span: [1, 6], blocks: [table] }, { span: [7, 12], blocks: present(mix, obs) }] }],
        notes: { source: source(ctx.sources.financials), note: standardNote(ctx) },
      }),
    ];
  },
};

const s6_3: PageModule = {
  id: "S6.3",
  name: "Gross margin and cost structure",
  status: "A",
  copyKey: "s6_3",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s6_3") ?? fallback63(ctx);
    const table = costStructure(ctx, usable(1, 7));
    const shifts = costShiftChart(table);
    const obs = observationsBlock("the cost structure", keyObservations(ctx, "S6.3", copy.observations, [table]));
    const b = ctx.brief;
    const title = chooseTitle(
      ctx,
      "S6.3 title",
      copy.title,
      b.has("gm.delta")
        ? `Gross margin moved ${b.t("gm.delta")} to ${b.t("gm.latest")} and payroll excluding the owner ${b.t("payrollPct.delta")} to ${b.t("payrollPct.latest")} of revenue ${fyRangeOf(ctx)}`
        : `Gross margin was ${b.t("gm.latest")} and payroll excluding the owner ${b.t("payrollPct.latest")} of revenue in ${ctx.latest.label}`,
    );
    return [
      draft(ctx, {
        id: "S6.3",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 7], blocks: [table] }, { span: [8, 12], blocks: present(shifts, obs) }] }],
        notes: { source: source(ctx.sources.financials), note: standardNote(ctx, "Ratios are of total revenue; changes are in basis points.") },
      }),
    ];
  },
  fallback: (ctx) => ({ s6_3: fallback63(ctx) }),
};

function fallback63(ctx: CimContext): NonNullable<CimCopy["s6_3"]> {
  // One fiscal year has no change over the period to quote.
  const moved = (key: string) => (ctx.brief.has(`${key}.delta`) ? `{{${key}.delta}} over the period; ` : "");
  return {
    observations: [
      { row: "cost.cogs", lead: "Cost of revenue at {{cogsPct.latest}} of revenue,", body: `${moved("cogsPct")}the account detail is in the table.` },
      { row: "cost.payroll", lead: "Payroll excluding the owner at {{payrollPct.latest}},", body: `${moved("payrollPct")}with owner compensation shown separately.` },
      { row: "cost.margin", lead: "Reported EBITDA margin of {{repMargin.latest}},", body: `${moved("repMargin")}after every operating line in the table.` },
    ],
  };
}

const s6_4: PageModule = {
  id: "S6.4",
  name: "Monthly trend and seasonality",
  status: "C",
  copyKey: "s6_4",
  absent: (ctx) => ((ctx.out.monthly?.months.length ?? 0) >= 18 ? undefined : "Fewer than 18 months of monthly P&L"),
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s6_4") ?? fallback64(ctx);
    const chart = monthlyRevenue(ctx);
    const quarters = quarterlyRevenue(ctx, usable(1, 7));
    const obs = observationsBlock("the quarterly table", keyObservations(ctx, "S6.4", copy.observations, present(quarters)));
    const b = ctx.brief;
    const L = ctx.fy[ctx.fy.length - 1]!.key;
    const title = chooseTitle(
      ctx,
      "S6.4 title",
      copy.title,
      b.has(`month.peakToTrough.${L}`)
        ? [
            `Revenue peaks in ${b.t(`month.peak.${L}`)} at ${b.t(`month.peakRevenue.${L}`)}, ${b.t(`month.peakToTrough.${L}`)} the ${b.t(`month.trough.${L}`)} low, and trailing-12 revenue reached ${b.t("month.t12Latest")}`,
            `Revenue peaks in ${b.t(`month.peak.${L}`)} at ${b.t(`month.peakRevenue.${L}`)}, ${b.t(`month.peakToTrough.${L}`)} the ${b.t(`month.trough.${L}`)} low`,
          ]
        : b.has(`month.peak.${L}`)
          ? `Revenue peaks in ${b.t(`month.peak.${L}`)} at ${b.t(`month.peakRevenue.${L}`)} against ${b.t(`month.troughRevenue.${L}`)} in ${b.t(`month.trough.${L}`)}`
          : `Monthly revenue through ${monthLabel(ctx.out.asOfDate.slice(0, 7))}`,
    );
    return [
      draft(ctx, {
        id: "S6.4",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 12], blocks: present(chart) }] }, { columns: [{ span: [1, 7], blocks: present(quarters) }, { span: [8, 12], blocks: present(obs) }] }],
        notes: { source: source(`${ctx.sources.statements}, monthly, ${monthLabel(ctx.out.monthly!.chartWindow.start)} to ${monthLabel(ctx.out.monthly!.chartWindow.end)}`), note: standardNote(ctx, "Months are as reported; quarters are fiscal quarters.") },
      }),
    ];
  },
  fallback: (ctx) => ({ s6_4: fallback64(ctx) }),
};

function fallback64(ctx: CimContext): NonNullable<CimCopy["s6_4"]> {
  const b = ctx.brief;
  const L = ctx.fy[ctx.fy.length - 1]!.key;
  const top = [1, 2, 3, 4].sort((x, y) => (b.value(`q${y}.share.${L}`) ?? 0) - (b.value(`q${x}.share.${L}`) ?? 0))[0]!;
  return {
    observations: [
      { row: `q.${top}`, lead: `Fiscal Q${top} carried {{q${top}.share.${L}}} of ${ctx.fy[ctx.fy.length - 1]!.label} revenue`, body: `and the peak month was {{month.peak.${L}}} at {{month.peakRevenue.${L}}}.` },
      b.has(`month.peakToTrough.${L}`)
        ? { row: "q.total", lead: "Trailing-12-month revenue of {{month.t12Latest}}", body: `at ${monthLabel(ctx.out.asOfDate.slice(0, 7))}; the highest month was {{month.peakToTrough.${L}}} the lowest.` }
        : { row: "q.total", lead: "Trailing-12-month revenue of {{month.t12Latest}}", body: `at ${monthLabel(ctx.out.asOfDate.slice(0, 7))}; the lowest month was {{month.trough.${L}}} at {{month.troughRevenue.${L}}}.` },
    ],
  };
}

const s6_5: PageModule = {
  id: "S6.5",
  name: "Revenue and EBITDA walk",
  status: "C",
  absent: () => "No price or volume drivers in the sources",
  budget: [0, 1],
  build: () => [],
};

/** Gross-to-net reconciliation and margins on both bases (guide S6.6). */
const s6_6: PageModule = {
  id: "S6.6",
  name: "Gross vs net revenue",
  status: "C",
  absent: (ctx) => {
    const l = at(ctx, ctx.latest);
    return l.ladder.marginDenominator < l.pnl.revenue * 0.9 ? undefined : "Pass-through revenue below 10% of total";
  },
  budget: [0, 1],
  build(ctx) {
    const periods = tableColumns(ctx);
    const ps = periods.map((c) => at(ctx, c));
    const rows: NumRow[] = [
      { type: "line", label: "Gross revenue", key: "gn.gross", vals: ps.map((p) => k(p.pnl.revenue, { dollar: true })) },
      { type: "line", label: "(–) Pass-through revenue", key: "gn.pass", vals: ps.map((p) => k(p.ladder.marginDenominator - p.pnl.revenue)) },
      { type: "key", label: "Net revenue", key: "gn.net", vals: ps.map((p) => k(p.ladder.marginDenominator, { dollar: true })) },
      { type: "ratio", label: "Adj. EBITDA % gross revenue", key: "gn.mGross", vals: ps.map((p) => fmtPct(p.ladder.adjEbitda / p.pnl.revenue)) },
      { type: "ratio", label: "Adj. EBITDA % net revenue", key: "gn.mNet", vals: ps.map((p) => fmtPct(p.ladder.adjMargin)) },
    ];
    const cols = [{ w: 2.6, kind: "label" as const }, ...periods.map((c) => ({ w: 0.7, kind: "num" as const, head: c.label }))];
    const b = ctx.brief;
    return [
      draft(ctx, {
        id: "S6.6",
        section: SECTION,
        title: `Adj. EBITDA is ${b.t("adjMargin.latest")} of net revenue once pass-through revenue is removed`,
        rows: [{ columns: [{ span: [1, 7], blocks: [{ kind: "numTable", header: { title: "Gross and net revenue", units: "($000s)" }, spec: { name: "Revenue basis", cols, rows } }] }] }],
        notes: { source: source(ctx.sources.financials), note: standardNote(ctx, "Margins in this memorandum are of net revenue.") },
      }),
    ];
  },
};

export const S6: SectionModule = { id: "S6", name: SECTION, pages: [s6_1, s6_2, s6_3, s6_4, s6_5, s6_6] };

