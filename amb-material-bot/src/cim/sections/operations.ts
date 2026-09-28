// S5 Operations and people (guide 3.3): organization and management with
// headcount by department beside it; retention and tenure with the
// suppliers and certifications (S5.5) beside them; the owner's role (S5.4)
// on the considerations page, as the spec's sample places it.

import { monthLabel } from "../../domain/financials.ts";
import type { CimContext } from "../context.ts";
import { pageCopy, PER_MANAGEMENT, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import type { Block, TextCell } from "../design.ts";
import { r3, spanW } from "../design.ts";
import { facilities, headcountByDepartment, headcountRollForward, keyObservations, observationsBlock, organization, tenureAtDeparture, usable } from "../exhibits.ts";
import { chooseTitle, draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Operations and people";

const carries = (ctx: CimContext, host: string, id: string): boolean => ctx.carried.get(host)?.includes(id) ?? false;

/** Roles on payroll at the as-of date (the organization table's body rows). */
function orgRoles(ctx: CimContext): number {
  const pr = ctx.ds.payroll;
  if (!pr) return ctx.intake?.workforce.composition.length ?? 0;
  const asOf = ctx.out.headcount?.asOf ?? ctx.out.asOfDate;
  return new Set(pr.employees.filter((e) => e.hireDate <= asOf && (!e.terminationDate || e.terminationDate > asOf)).map((e) => e.role)).size;
}

/** Suppliers, certifications and licenses from the intake facts (guide S5.5). */
function suppliers(ctx: CimContext, w: number): Block | undefined {
  const i = ctx.intake;
  if (!i) return undefined;
  const rows: TextCell[][] = [
    ...i.suppliers.map((s) => [s.name, s.supplies, s.terms ?? ""]),
    ...i.company.certifications.map((c) => [c.name, "Certification", c.since ? `Since ${c.since}` : ""]),
    ...i.company.licenses.map((l) => [l.name, "License", ""]),
  ];
  if (!rows.length) return undefined;
  return { kind: "textTable", header: { title: "Suppliers, certifications and licenses", units: "(per management)" }, spec: { colW: [1.9, r3((w - 1.9) * 0.55), r3(w - 1.9 - r3((w - 1.9) * 0.55))], head: ["Name", "Role", "Terms or since"], rows, fontSize: 8.5 } };
}

const s5_1: PageModule = {
  id: "S5.1",
  name: "Organization and management",
  status: "A",
  copyKey: "s5_1",
  absent: (ctx) => (ctx.ds.payroll || ctx.intake?.workforce.composition.length ? undefined : "No payroll register and no workforce facts"),
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s5_1") ?? fallback51(ctx);
    const org = organization(ctx, usable(1, 7));
    const roll = carries(ctx, "S5.1", "S5.3") ? headcountRollForward(ctx, usable(1, 7)) : undefined;
    const sup = carries(ctx, "S5.1", "S5.5") ? suppliers(ctx, spanW(8, 12)) : undefined;
    const dept = carries(ctx, "S5.1", "S5.2") ? headcountByDepartment(ctx, spanW(8, 12)) : undefined;
    // Without the unit-economics page (no payroll register) the facilities table comes here; S5.5 lists the suppliers.
    const fac = carries(ctx, "S5.1", "S2.4") || carries(ctx, "S5.1", "S2.5") ? facilities(ctx, spanW(8, 12), !sup) : undefined;
    const obs = observationsBlock("the organization tables", keyObservations(ctx, "S5.1", copy.observations, present(org, roll, dept)));
    const b = ctx.brief;
    const m = ctx.intake?.management[0];
    const mSlug = m ? b.list().find((f) => f.key.startsWith("mgmt.") && f.key.endsWith(".tenure") && f.label.startsWith(m.name))?.key : undefined;
    const team = b.has("hc.field") ? `${b.t("hc.field")} field employees` : b.has("staff.total") ? `${b.t("staff.total")} employees` : undefined;
    const fallback = m && mSlug && team
      ? `The ${m.role.toLowerCase()} (${b.t(mSlug)} with the Company) runs ${m.responsibilities.join(" and ").toLowerCase()} for ${team}`
      : b.has("hc.total")
        ? `${b.t("hc.total")} employees work besides the owner at ${monthLabel(ctx.latest.end)}`
        : `${b.t("staff.total")} employees work besides the owner, per management`;
    return [
      draft(ctx, {
        id: "S5.1",
        section: SECTION,
        title: chooseTitle(ctx, "S5.1 title", copy.title, fallback),
        rows: [{ columns: [{ span: [1, 7], blocks: present(org, roll) }, { span: [8, 12], blocks: present(dept, sup, fac, obs) }] }],
        notes: {
          source: source(ctx.sources.payroll, "Management"),
          note: standardNote(ctx, "Employees other than management are described by role only; compensation includes employer taxes and benefits."),
          footnotes: [PER_MANAGEMENT],
        },
        carries: [dept ? "S5.2" : "", roll ? "S5.3" : "", sup ? "S5.5" : "", ...(fac ? ["S2.4", "S2.5"].filter((id) => carries(ctx, "S5.1", id)) : [])].filter(Boolean),
      }),
    ];
  },
  fallback: (ctx) => ({ s5_1: fallback51(ctx) }),
};

function fallback51(ctx: CimContext): NonNullable<CimCopy["s5_1"]> {
  if (!ctx.brief.has("hc.total")) {
    // Headcount from the intake notes only: the management team's own facts carry the page.
    const i = ctx.intake;
    const m = i?.management[0];
    const role = m ? i!.workforce.composition.find((c) => c.role.toLowerCase() === m.role.toLowerCase())?.role : undefined;
    return {
      observations: [
        { row: "org.total", lead: "{{staff.total}} employees besides the owner (1),", body: `with payroll excluding the owner at {{payrollPct.latest}} of revenue in ${ctx.latest.label}.` },
        ...(m && role
          ? [{ row: `org.${role}`, lead: `${m.name}, ${m.role.toLowerCase()}${m.since ? ` with the Company since ${m.since.slice(0, 4)}` : ""},`, body: `runs ${m.responsibilities.join(" and ").toLowerCase()}${m.postCloseIntent === "stays" ? " and is expected to stay after closing" : ""} (1).` }]
          : []),
      ],
    };
  }
  return {
    observations: [
      { row: "org.total", lead: `{{hc.total}} employees besides the owner`, body: `at ${monthLabel(ctx.latest.end)}, {{hc.field}} of them in field roles.` },
      { row: "", lead: `Payroll excluding the owner was {{payrollPct.latest}} of revenue`, body: `in ${ctx.latest.label}; compensation by department is in the table.` },
    ],
  };
}

const s5_2: PageModule = {
  id: "S5.2",
  name: "Headcount and compensation",
  status: "C",
  absent: (ctx) => (ctx.out.headcount ? undefined : "No payroll register"),
  mergeInto: (ctx) => (ctx.present.has("S5.1") ? "S5.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S5.2",
        section: SECTION,
        title: `${ctx.brief.t("hc.total")} employees besides the owner at ${monthLabel(ctx.latest.end)}, by department`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(headcountByDepartment(ctx, usable(1, 6))) }] }],
        notes: { source: source(ctx.sources.payroll), note: standardNote(ctx) },
      }),
    ];
  },
};

const s5_3: PageModule = {
  id: "S5.3",
  name: "Retention and tenure",
  status: "C",
  copyKey: "s5_2",
  absent: (ctx) => {
    const hc = ctx.out.headcount;
    return hc && Object.keys(hc.rollForwardByFiscalYear).length >= 2 ? undefined : "No hire and termination dates";
  },
  // With a short organization table the roll-forward fits under it; a long one leaves this module its own page.
  mergeInto: (ctx) => (ctx.present.has("S5.1") && orgRoles(ctx) <= 7 ? "S5.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s5_2") ?? fallback53(ctx);
    const roll = headcountRollForward(ctx, usable(1, 6));
    const sup = carries(ctx, "S5.3", "S5.5") ? suppliers(ctx, usable(1, 6)) : undefined;
    const chart = tenureAtDeparture(ctx);
    const obs = observationsBlock("the roll-forward", keyObservations(ctx, "S5.3", copy.observations, present(roll)));
    const b = ctx.brief;
    const f0 = ctx.fy[0]!;
    const fl = ctx.fy[ctx.fy.length - 1]!;
    const title = chooseTitle(
      ctx,
      "S5.3 title",
      copy.title,
      `${b.t("hc.departedTotal")} departures since ${f0.label}, ${b.t("hc.departedOver2Years")} after more than two years; year-end headcount went from ${b.maybe(`hc.end.${f0.key}`)} to ${b.maybe(`hc.end.${fl.key}`)}`,
    );
    return [
      draft(ctx, {
        id: "S5.3",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: present(roll, sup) }, { span: [7, 12], blocks: present(chart, obs) }] }],
        notes: { source: source(ctx.sources.payroll, sup ? "Management" : undefined), note: "Headcount excludes the owner. Tenure at departure uses the payroll register's hire and termination dates.", footnotes: sup ? [PER_MANAGEMENT] : [] },
        carries: sup ? ["S5.5"] : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s5_2: fallback53(ctx) }),
};

function fallback53(ctx: CimContext): NonNullable<CimCopy["s5_2"]> {
  const fl = ctx.fy[ctx.fy.length - 1]!;
  return {
    observations: [
      { row: "hr.departures", lead: `{{hc.departures.${fl.key}}} departures in ${fl.label}`, body: `against {{hc.hires.${fl.key}}} hires; ${ctx.brief.t("hc.departedOver2Years")} of all departures came after more than two years.` },
      { row: "hr.end", lead: `Year-end headcount of {{hc.end.${fl.key}}}`, body: `excludes the owner; the register's hire dates give each employee's tenure.` },
    ],
  };
}

const s5_4: PageModule = {
  id: "S5.4",
  name: "Owner role and transition",
  status: "A",
  absent: (ctx) => (ctx.intake?.owner.responsibilities.length ? undefined : "No owner responsibilities in the intake notes"),
  mergeInto: (ctx) => (ctx.present.has("S1.4") ? "S1.4" : undefined),
  budget: [0, 1],
  build: () => [],
};

const s5_5: PageModule = {
  id: "S5.5",
  name: "Operations and suppliers",
  status: "C",
  absent: (ctx) => (ctx.intake && (ctx.intake.suppliers.length || ctx.intake.company.certifications.length || ctx.intake.company.licenses.length) ? undefined : "No suppliers, certifications or licenses in the notes"),
  // Suppliers and certifications sit beside the headcount table on the people page, or with the roll-forward when that has its own page.
  mergeInto: (ctx) => (ctx.present.has("S5.1") ? "S5.1" : ctx.present.has("S5.3") ? "S5.3" : undefined),
  budget: [0, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S5.5",
        section: SECTION,
        title: `${ctx.intake!.suppliers.length} principal suppliers and ${ctx.intake!.company.certifications.length} certifications, per management`,
        rows: [{ columns: [{ span: [1, 7], blocks: present(suppliers(ctx, usable(1, 7))) }] }],
        notes: { source: source("Management"), footnotes: [PER_MANAGEMENT] },
      }),
    ];
  },
};

const s5_6: PageModule = {
  id: "S5.6",
  name: "Labor model normalization",
  status: "C",
  absent: () => "No contractors in core roles and no family members paid off market in the sources",
  budget: [0, 1],
  build: () => [],
};

export const S5: SectionModule = { id: "S5", name: SECTION, pages: [s5_1, s5_2, s5_3, s5_4, s5_5, s5_6] };
