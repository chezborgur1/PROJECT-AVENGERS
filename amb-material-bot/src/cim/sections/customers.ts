// S4 Customers (guide 3.3), built only from a coded customer list in the
// request data (spec 12, last row): overview and concentration on one page,
// retention on the next. Cohort triangles merge into the retention page when
// it has room and otherwise go to the appendix (S11.3).

import { monthLabel } from "../../domain/financials.ts";
import type { CimContext } from "../context.ts";
import { codedNote, confirm, pageCopy, pageRef, PER_MANAGEMENT, population, residualName, resolveCopy, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import type { Block } from "../design.ts";
import { spanW } from "../design.ts";
import { cohortTable, customerMix, customerMixChart, keyCustomers, keyObservations, observationsBlock, retentionCounts, retentionDollars, top10, usable, winsLosses } from "../exhibits.ts";
import { chooseTitle, draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";
import { customerNoun } from "../../util/format.ts";

const SECTION = "Customers";

const capFirst = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

const hasList = (ctx: CimContext): string | undefined => (ctx.out.customers ? undefined : "No customer list");

const s4_1: PageModule = {
  id: "S4.1",
  name: "Customer overview",
  status: "C",
  copyKey: "s4_1",
  absent: hasList,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s4_1") ?? fallback41(ctx);
    const lw = usable(1, 6);
    const chart = customerMixChart(ctx);
    const mix = customerMix(ctx, lw);
    const top = ctx.carried.get("S4.1")?.includes("S4.4") ? top10(ctx, spanW(7, 12)) : undefined;
    const obs = observationsBlock(top ? "the top-10 list" : "the customer mix", keyObservations(ctx, "S4.1", copy.observations, present(top, mix)));
    const b = ctx.brief;
    const title = chooseTitle(ctx, "S4.1 title", copy.title, `${b.t("cust.billedCount")} ${population(ctx)} billed ${b.t("cust.codedRevenue")} in ${ctx.out.customers?.period.label ?? ctx.latest.label}; the largest is ${b.t("cust.largestShare")} of revenue and the top 10 ${b.t("cust.top10Share")}`);
    return [
      draft(ctx, {
        id: "S4.1",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: present(chart, mix) }, { span: [7, 12], blocks: present(top, obs) }] }],
        notes: {
          source: source(ctx.sources.financials, ctx.sources.customers),
          note: standardNote(ctx, codedNote(ctx)),
          footnotes: [
            ...(residualName(ctx) ? [`${capFirst(residualName(ctx)!)} are not listed individually; their revenue is the P&L revenue less the ${population(ctx)}.`] : []),
            ...(ctx.out.customers ? [`${capFirst(population(ctx))} billed at any time in ${ctx.out.customers.period.label}; of them, ${b.t("cust.count")} were active at ${monthLabel(ctx.latest.end)}.`] : []),
          ],
        },
        carries: top ? ["S4.4"] : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s4_1: fallback41(ctx) }),
};

function fallback41(ctx: CimContext): NonNullable<CimCopy["s4_1"]> {
  const { one } = customerNoun(ctx.ds.customers?.term);
  return {
    observations: [
      { row: "top.C-001", lead: `The largest ${one}, {{cust.largestId}}, is {{cust.largestShare}} of revenue`, body: "at {{cust.largestRevenue}} in the latest year." },
      { row: "top.top10", lead: "The top 10 are {{cust.top10Share}} of revenue", body: `and {{cust.top10ShareOfCoded}} of listed-${one} revenue.` },
      { row: "mix.residual", lead: "Revenue not listed by customer is {{cust.residualShare}} of the total,", body: `because the list does not name ${residualName(ctx) ?? "those customers"} one by one.` },
    ],
  };
}

const s4_4: PageModule = {
  id: "S4.4",
  name: "Concentration",
  status: "C",
  absent: hasList,
  mergeInto: (ctx) => (ctx.present.has("S4.1") ? "S4.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    const t = top10(ctx, usable(1, 6));
    return [
      draft(ctx, {
        id: "S4.4",
        section: SECTION,
        title: `The top 10 customers are ${ctx.brief.t("cust.top10Share")} of revenue and the largest ${ctx.brief.t("cust.largestShare")}`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(t) }] }],
        notes: { source: source(ctx.sources.customers), note: standardNote(ctx) },
      }),
    ];
  },
};

const s4_2: PageModule = {
  id: "S4.2",
  name: "Retention",
  status: "C",
  copyKey: "s4_2",
  absent: (ctx) => {
    const ret = ctx.out.customers?.retention;
    return ret && Object.keys(ret.byFiscalYear).length >= 2 ? undefined : "Customer dates or two years of revenue by customer are missing";
  },
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s4_2") ?? fallback42(ctx);
    const lw = usable(1, 6);
    const rw = spanW(7, 12);
    const counts = retentionCounts(ctx, lw);
    const dollars = retentionDollars(ctx, lw);
    const cohorts = ctx.carried.get("S4.2")?.includes("S4.3") ? cohortTable(ctx, rw) : undefined;
    const chart = cohorts ? undefined : winsLosses(ctx);
    const obs = observationsBlock("the retention tables", keyObservations(ctx, "S4.2", copy.observations, present(counts, dollars, cohorts)));
    // The retention figures cover the listed customers only; the callout sets them against the revenue they do not cover (QA round 1 F32).
    // The retention page's callout states the tables' scope, so it is a note, not a takeaway (spec 6.5).
    const takeaway: Block | undefined = copy.takeaway ? { kind: "callout", lead: "Note:", body: resolveCopy(ctx, copy.takeaway, "S4.2 takeaway") } : undefined;
    const b = ctx.brief;
    const L = ctx.fy[ctx.fy.length - 1]!.key;
    const title = chooseTitle(ctx, "S4.2 title", copy.title, `${capFirst(population(ctx))} rose to ${b.maybe(`cust.end.${L}`) ?? b.t("cust.count")} with net dollar retention of ${b.maybe(`cust.ndr.${L}`) ?? "n.a."} in ${ctx.fy[ctx.fy.length - 1]!.label}`);
    return [
      draft(ctx, {
        id: "S4.2",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: present(counts, dollars) }, { span: [7, 12], blocks: present(chart, cohorts, obs, takeaway) }] }],
        notes: {
          source: source(ctx.sources.customers),
          note: `${capFirst(population(ctx))} (coded) only${residualName(ctx) ? `; ${residualName(ctx)} are not listed individually` : ""}. Revenue in USD thousands. Churn is lost ÷ average ${customerNoun(ctx.ds.customers?.term).many}; GDR and NDR are defined on ${pageRef("S11.1")}.${b.has(`cust.lostBilled.${L}`) ? ` Ending revenue leaves out ${b.t(`cust.lostBilled.${L}`)} billed in ${ctx.fy[ctx.fy.length - 1]!.label} by ${customerNoun(ctx.ds.customers?.term).many} lost during the year.` : ""}`,
        },
        carries: cohorts ? ["S4.3"] : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s4_2: fallback42(ctx) }),
};

function fallback42(ctx: CimContext): NonNullable<CimCopy["s4_2"]> {
  const L = ctx.fy[ctx.fy.length - 1]!.key;
  const scoped = ctx.brief.has("cust.codedShare") && ctx.brief.has("cust.residualShare");
  const { one, Many } = customerNoun(ctx.ds.customers?.term);
  const listed = population(ctx);
  return {
    ...(scoped ? { takeaway: `${capFirst(listed)} are {{cust.codedShare}} of revenue; the other {{cust.residualShare}} is not listed individually, so these tables measure retention for the ${listed} only.` } : {}),
    observations: [
      { row: "rc.end", lead: `${Many} rose from {{cust.start.${L}}} to {{cust.end.${L}}}`, body: `with {{cust.new.${L}}} won and {{cust.lost.${L}}} lost in ${ctx.fy[ctx.fy.length - 1]!.label}.` },
      { row: "rd.gdr", lead: `Gross dollar retention was {{cust.gdr.${L}}}`, body: `and net dollar retention {{cust.ndr.${L}}}, after upsell of {{cust.upsell.${L}}}.` },
      { row: "rc.lost", lead: `In ${ctx.fy[ctx.fy.length - 1]!.label}, {{cust.lost.${L}}} ${customerNoun(ctx.ds.customers?.term).many} were lost,`, body: `classified by reason in the table; ${confirm(ctx, "loss detail", `Why each lost ${one} left`)}.` },
    ],
  };
}

const s4_3: PageModule = {
  id: "S4.3",
  name: "Cohorts",
  status: "C",
  absent: (ctx) => ((ctx.out.customers?.cohorts?.countTriangle.filter((c) => !c.pre).length ?? 0) >= 3 ? undefined : "Fewer than three annual cohorts"),
  // The triangle takes the place of the wins-and-losses chart on the retention page (guide 3.5 rule 2: S4.3 into S4.2).
  mergeInto: (ctx) => (ctx.present.has("S4.2") ? "S4.2" : undefined),
  budget: [0, 1],
  build(ctx) {
    const t = cohortTable(ctx, spanW(1, 7));
    return [
      draft(ctx, {
        id: "S4.3",
        section: SECTION,
        title: `Annual ${customerNoun(ctx.ds.customers?.term).one} cohorts, ${ctx.out.customers!.cohorts!.countTriangle.filter((c) => !c.pre).length} of them, by start year and year-end status`,
        rows: [{ columns: [{ span: [1, 7], blocks: present(t) }] }],
        notes: { source: source(ctx.sources.customers) },
      }),
    ];
  },
};

const s4_5: PageModule = {
  id: "S4.5",
  name: "Key-customer detail",
  status: "C",
  absent: (ctx) => {
    const c = ctx.out.customers?.concentration;
    if (!c) return "No customer list";
    const top5 = c.top.slice(0, 5).reduce((s, r) => s + r.pctOfTotal, 0);
    return c.largestShare >= 0.1 || top5 >= 0.35 ? undefined : "No customer at 10% of revenue and the top 5 below 35%";
  },
  budget: [0, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S4.5",
        section: SECTION,
        title: `The largest customer is ${ctx.brief.t("cust.largestShare")} of revenue and the top five ${ctx.brief.t("cust.top5Share")}`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(keyCustomers(ctx, usable(1, 6))) }] }],
        notes: { source: source(ctx.sources.customers), footnotes: [PER_MANAGEMENT] },
      }),
    ];
  },
};

const s4_6: PageModule = {
  id: "S4.6",
  name: "Contracts, pricing and backlog",
  status: "C",
  absent: () => "No contract terms, price history or backlog in the request data",
  budget: [0, 1],
  build: () => [],
};

const s4_7: PageModule = {
  id: "S4.7",
  name: "Demand profile",
  status: "C",
  absent: () => "No POS or invoice-level data",
  budget: [0, 1],
  build: () => [],
};

export const S4: SectionModule = { id: "S4", name: SECTION, pages: [s4_1, s4_2, s4_3, s4_4, s4_5, s4_6, s4_7] };

