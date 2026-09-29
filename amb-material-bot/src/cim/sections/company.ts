// S2 Company overview (guide 3.3): history and milestones, services and
// revenue model, operating model and unit economics, locations and
// facilities, technology and systems. Short modules merge onto the page the
// library names (guide 3.5 rule 2): S2.1 onto S2.2 without a long history,
// S6.2 onto S2.2 when the revenue lines fit the services page, S2.5 onto
// S2.4's host, and S2.4 onto S2.3 when there is one leased site.

import type { CimContext } from "../context.ts";
import { confirm, pageCopy, PER_MANAGEMENT, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import { MAX_EXHIBITS, spanW } from "../design.ts";
import { capacityFacts, facilities, keyObservations, milestoneProse, milestones, observationsBlock, revenueByLine, revenueMixChart, serviceLines, unitEconomics, usable } from "../exhibits.ts";
import { chooseTitle, draft, present, source, verb } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Company overview";

const carries = (ctx: CimContext, host: string, id: string): boolean => ctx.carried.get(host)?.includes(id) ?? false;

const s2_1: PageModule = {
  id: "S2.1",
  name: "History and milestones",
  status: "A",
  absent: (ctx) => (ctx.intake?.milestones.length || ctx.fy.length >= 5 ? undefined : "No milestones in the intake notes and fewer than five years of revenue"),
  // The long-run chart needs five years of revenue; without it the milestone table is too short for a page of its own.
  mergeInto: (ctx) => (ctx.fy.length < 5 && ctx.present.has("S2.2") ? "S2.2" : undefined),
  budget: [0, 1],
  build(ctx) {
    const w = usable(1, 6);
    const ms = milestones(ctx, w);
    return [
      draft(ctx, {
        id: "S2.1",
        section: SECTION,
        title: `${ctx.short} has operated since ${ctx.intake?.company.founded ?? confirm(ctx, "year founded", "Year the Company was founded")}`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(ms) }] }],
        notes: { source: source(ctx.sources.management), footnotes: [PER_MANAGEMENT] },
      }),
    ];
  },
};

const s2_2: PageModule = {
  id: "S2.2",
  name: "Services and revenue model",
  status: "A",
  copyKey: "s2_2",
  absent: (ctx) => (ctx.out.periods[ctx.latest.key]!.revenueLines.filter((l) => l.amount > 0).length ? undefined : "No revenue lines"),
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s2_2") ?? fallback22(ctx);
    const lw = usable(1, 6);
    const rw = spanW(7, 12);
    const mix = revenueMixChart(ctx);
    const svc = serviceLines(ctx, lw);
    const byLine = carries(ctx, "S2.2", "S6.2") ? revenueByLine(ctx, rw) : undefined;
    // With three exhibits already on the page the milestones read as a run-in paragraph, not a fourth table (spec 7.3).
    const ms = !carries(ctx, "S2.2", "S2.1") ? undefined : present(mix, svc, byLine).length >= MAX_EXHIBITS ? milestoneProse(ctx) : milestones(ctx, rw);
    const obs = observationsBlock(byLine ? "the revenue table" : "the service lines", keyObservations(ctx, "S2.2", copy.observations, present(byLine, svc)));
    const b = ctx.brief;
    const lines = ctx.out.periods[ctx.latest.key]!.revenueLines.filter((l) => l.amount > 0);
    const first = ctx.fy[0]!;
    const fastest = [...lines].slice(1).sort((a, c) => (b.value(`line.${slugOf(ctx, c.label)}.cagr`) ?? 0) - (b.value(`line.${slugOf(ctx, a.label)}.cagr`) ?? 0))[0];
    const fallbackTitle = fastest && b.has(`line.${slugOf(ctx, fastest.label)}.cagr`)
      ? `${fastest.label} grew at a ${b.t(`line.${slugOf(ctx, fastest.label)}.cagr`)} CAGR to ${b.t(`line.${slugOf(ctx, fastest.label)}.latest`)}, ${b.t(`line.${slugOf(ctx, fastest.label)}.share0.${ctx.latest.key}`)} of ${ctx.latest.label} revenue`
      : `${lines[0]!.label} is ${b.t(`line.${slugOf(ctx, lines[0]!.label)}.share0.${ctx.latest.key}`)} of ${ctx.latest.label} revenue of ${b.t("rev.latest")} since ${first.label}`;
    const title = chooseTitle(ctx, "S2.2 title", copy.title, fallbackTitle);
    return [
      draft(ctx, {
        id: "S2.2",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: present(mix, svc) }, { span: [7, 12], blocks: present(byLine, ms, obs) }] }],
        notes: { source: source(ctx.sources.financials, "Management"), note: standardNote(ctx, "Shares are of revenue before discounts and refunds, rounded to add to 100%."), footnotes: [PER_MANAGEMENT] },
        carries: [byLine ? "S6.2" : "", ms ? "S2.1" : ""].filter(Boolean),
      }),
    ];
  },
  fallback: (ctx) => ({ s2_2: fallback22(ctx) }),
};

/** The brief slug for a revenue line label (brief.ts assigns them in revenue-line order). */
function slugOf(ctx: CimContext, label: string): string {
  const f = ctx.brief.list().find((x) => x.key.startsWith("line.") && x.key.endsWith(".label") && x.text === label);
  return f ? f.key.slice(5, -6) : "";
}

function fallback22(ctx: CimContext): NonNullable<CimCopy["s2_2"]> {
  const lines = ctx.out.periods[ctx.latest.key]!.revenueLines.filter((l) => l.amount > 0);
  const obs = lines.slice(0, 3).map((l) => {
    const s = slugOf(ctx, l.label);
    return { row: `rev.line.${l.account}`, lead: `${l.label}: {{line.${s}.latest}}, {{line.${s}.share0.${ctx.latest.key}}} of revenue,`, body: `${ctx.brief.has(`line.${s}.yoy`) ? `{{line.${s}.yoy}} change on the prior year` : "no prior-year revenue to compare"}; ${confirm(ctx, "driver", `What drove the change in ${l.label.toLowerCase()} revenue`)}.` };
  });
  return { observations: obs.length >= 2 ? obs : [...obs, { row: "", lead: "Revenue of {{rev.latest}}", body: `in ${ctx.latest.label}.` }] };
}

const s2_3: PageModule = {
  id: "S2.3",
  name: "Operating model and unit economics",
  status: "A",
  copyKey: "s2_3",
  absent: (ctx) => (ctx.out.periods[ctx.latest.key]!.kpis.revenue_per_employee ? undefined : "No employee counts by year (payroll register)"),
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s2_3") ?? fallback23(ctx);
    const lw = usable(1, 7);
    const ue = unitEconomics(ctx, lw);
    const cap = capacityFacts(ctx, lw);
    // Suppliers are a row here unless S5.5 gives them their own table on the people page.
    const fac = carries(ctx, "S2.3", "S2.4") || carries(ctx, "S2.3", "S2.5") ? facilities(ctx, spanW(8, 12), !ctx.present.has("S5.5")) : undefined;
    const obs = observationsBlock("unit economics", keyObservations(ctx, "S2.3", copy.observations, present(ue, cap)));
    const title = chooseTitle(ctx, "S2.3 title", copy.title, unitTitle(ctx));
    return [
      draft(ctx, {
        id: "S2.3",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 7], blocks: present(ue, cap) }, { span: [8, 12], blocks: present(fac, obs) }] }],
        notes: { source: source(ctx.sources.financials, ctx.sources.payroll, "Management"), note: standardNote(ctx, "Employee counts are at fiscal year-end and exclude the owner."), footnotes: [PER_MANAGEMENT] },
        carries: fac ? ["S2.4", "S2.5"].filter((id) => carries(ctx, "S2.3", id)) : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s2_3: fallback23(ctx) }),
};

/**
 * The unit-economics title from the fiscal-year columns the table shows, so
 * every figure in it is on the page: revenue per field employee (or per
 * employee) first and last year, and revenue growth across the same years.
 */
function unitTitle(ctx: CimContext): string {
  const b = ctx.brief;
  const f0 = ctx.fy[0]!;
  const fl = ctx.fy[ctx.fy.length - 1]!;
  const [key, what] = b.has(`hc.revPerField.${fl.key}`) ? ["hc.revPerField", "Revenue per field employee"] : ["hc.revPerEmployee", "Revenue per employee"];
  const to = b.maybe(`${key}.${fl.key}`);
  const from = b.maybe(`${key}.${f0.key}`);
  if (!to) return `${ctx.short} produced ${b.t("rev.latest")} of revenue in ${ctx.latest.label}`;
  if (f0 === fl || !from) return `${what} was ${to} in ${fl.label} on revenue of ${b.t(`rev.${fl.key}`)}`;
  const moved = verb((b.value(`${key}.${fl.key}`) ?? 0) - (b.value(`${key}.${f0.key}`) ?? 0), "rose", "fell");
  return `${what} ${moved} from ${from} in ${f0.label} to ${to} in ${fl.label} as revenue ${verb(b.value("rev.total"))} ${b.t("rev.total")}`;
}

function fallback23(ctx: CimContext): NonNullable<CimCopy["s2_3"]> {
  const f0 = ctx.fy[0]!;
  const fl = ctx.fy[ctx.fy.length - 1]!;
  return {
    observations: [
      f0 === fl
        ? { row: "ue.revField", lead: `Revenue per field employee of {{hc.revPerField.${fl.key}}}`, body: `in ${fl.label}; ${confirm(ctx, "capacity driver", "What drives field productivity")}.` }
        : { row: "ue.revField", lead: `Revenue per field employee of {{hc.revPerField.${fl.key}}}`, body: `in ${fl.label} compares with {{hc.revPerField.${f0.key}}} in ${f0.label}; ${confirm(ctx, "capacity driver", "What changed field productivity")}.` },
      { row: "ue.labor", lead: `Payroll at {{hc.laborPct.${fl.key}}} of revenue`, body: `excludes the owner, whose pay is restated in the EBITDA ladder.` },
    ],
  };
}

const s2_4: PageModule = {
  id: "S2.4",
  name: "Locations and facilities",
  status: "C",
  absent: (ctx) => {
    const locs = ctx.intake?.locations ?? [];
    return locs.length >= 2 || locs.some((l) => l.leaseExpiry || l.sizeSqFt || l.arrangement !== "leased_from_third_party") ? undefined : "No facility or lease facts in the intake notes";
  },
  // One leased site is a row of the facilities table, not a page (guide 3.5 rule 2): it sits on the unit-economics page,
  // or on the people page when there is no payroll register to build that one.
  mergeInto: (ctx, force) => {
    const locs = ctx.intake?.locations ?? [];
    const thin = force || (locs.length <= 1 && locs.every((l) => l.arrangement === "leased_from_third_party"));
    if (!thin) return undefined;
    return ctx.present.has("S2.3") ? "S2.3" : ctx.present.has("S5.1") ? "S5.1" : undefined;
  },
  budget: [0, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s2_4");
    const w = usable(1, 7);
    const fac = facilities(ctx, w, !ctx.present.has("S5.5"));
    const obs = observationsBlock("the facilities table", keyObservations(ctx, "S2.4", copy?.observations, present(fac)));
    const locs = ctx.intake?.locations ?? [];
    return [
      draft(ctx, {
        id: "S2.4",
        section: SECTION,
        title: chooseTitle(ctx, "S2.4 title", copy?.title, `${ctx.short} operates from ${locs.length} ${locs.length === 1 ? "site" : "sites"}${locs[0]?.leaseExpiry ? ` with the main lease running to ${locs[0].leaseExpiry}` : ""}`),
        rows: [{ columns: [{ span: [1, 7], blocks: present(fac) }, { span: [8, 12], blocks: present(obs) }] }],
        notes: { source: source("Management", "lease agreements"), footnotes: [PER_MANAGEMENT] },
        carries: carries(ctx, "S2.4", "S2.5") ? ["S2.5"] : [],
      }),
    ];
  },
};

const s2_5: PageModule = {
  id: "S2.5",
  name: "Technology and systems",
  status: "A",
  absent: (ctx) => (ctx.intake?.systems.length ? undefined : "No systems in the intake notes"),
  mergeInto: (ctx) => {
    if (ctx.present.has("S2.4")) return s2_4.mergeInto!(ctx, false) ?? "S2.4";
    return ctx.present.has("S2.3") ? "S2.3" : ctx.present.has("S5.1") ? "S5.1" : undefined;
  },
  budget: [0, 1],
  build(ctx) {
    const w = usable(1, 7);
    return [
      draft(ctx, {
        id: "S2.5",
        section: SECTION,
        title: `${ctx.short} runs on ${ctx.intake?.systems.length ?? 0} core systems`,
        rows: [{ columns: [{ span: [1, 7], blocks: present(facilities(ctx, w)) }] }],
        notes: { source: source("Management"), footnotes: [PER_MANAGEMENT] },
      }),
    ];
  },
};

export const S2: SectionModule = { id: "S2", name: SECTION, pages: [s2_1, s2_2, s2_3, s2_4, s2_5] };
