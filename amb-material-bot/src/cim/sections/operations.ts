// S5 Operations and people (guide 3.3): organization and management with
// headcount by department beside it; retention and tenure with the
// suppliers and certifications (S5.5) beside them; the owner's role (S5.4)
// on the considerations page, as the spec's sample places it.

import { monthLabel } from "../../domain/financials.ts";
import { fmtCount } from "../../util/format.ts";
import type { CimContext } from "../context.ts";
import { pageCopy, PER_MANAGEMENT, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import type { Block, Paragraph, TextCell } from "../design.ts";
import { r3, spanW } from "../design.ts";
import { askOwnerTable, facilities, fieldWagesTie, headcountByDepartment, headcountRollForward, keyObservations, observationsBlock, organization, ownerTableFilled, rolesAtAsOf, tenureAtDeparture, usable } from "../exhibits.ts";
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

/** A trade business that lists no contractor license is asked for it once, whichever form the operations page takes. */
function askLicenses(ctx: CimContext): void {
  const q = "Contractor licenses held by the Company or its technicians (state and trade, with numbers), for the operations page";
  if (!ctx.intake?.company.licenses.length && !ctx.openQuestions.includes(q)) ctx.openQuestions.push(q);
}

/** Suppliers, certifications and licenses from the intake facts (guide S5.5). */
function suppliers(ctx: CimContext, w: number): Block | undefined {
  const i = ctx.intake;
  if (!i) return undefined;
  // Terms and dates fold into the role, so no column prints mostly blank (spec 14).
  const rows: TextCell[][] = [
    ...i.suppliers.map((s) => [s.name, s.terms ? `${s.supplies}; ${s.terms}` : s.supplies]),
    ...i.company.certifications.map((c) => [c.name, c.since ? `Certification, since ${c.since}` : "Certification"]),
    ...i.company.licenses.map((l) => [l.name, "License"]),
  ];
  if (!rows.length) return undefined;
  // The title names only the kinds the table holds; a trade that needs a contractor license and lists none is asked for.
  const kinds = [i.suppliers.length ? "Suppliers" : "", i.company.certifications.length ? "certifications" : "", i.company.licenses.length ? "licenses" : ""].filter(Boolean);
  askLicenses(ctx);
  const title = series(kinds.map((k, n) => (n === 0 ? k.charAt(0).toUpperCase() + k.slice(1) : k)));
  return { kind: "textTable", header: { title, units: "(per management)" }, spec: { colW: [1.9, r3(w - 1.9)], head: ["Name", "Relationship"], rows, fontSize: 8.5 } };
}

/** "a, b and c". */
const series = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** A head count in running text: "one" for a single person, the figure otherwise. */
const countWord = (n: number): string => (n === 1 ? "one" : fmtCount(n));

/**
 * A role as a noun for its count: "service technicians", "install crew" (a
 * collective), "customer service / dispatch staff", "one bookkeeper".
 */
function roleNoun(role: string, count: number): string {
  const r = inText(role);
  if (count === 1) return r;
  if (/\bcrew$|\bstaff$|s$/i.test(r)) return r;
  if (/\//.test(r)) return `${r} staff`;
  return `${r}s`;
}

/** A clause starting a sentence. */
const inTextUpper = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** A phrase from the notes in running text: its first letter lowered unless it starts an acronym or a name ("CSR", "HVAC"). */
const inText = (s: string): string => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? `${s.charAt(0).toLowerCase()}${s.slice(1)}` : s);

/**
 * The people page's run-in paragraphs (spec archetype P2, guide 3.3 S5.1),
 * each built only from the facts the notes and the payroll register state,
 * with the notes' facts marked (1): staffing, the owner's role, fleet and
 * systems, suppliers and reputation, and who the customers are. Management
 * is in the organization table beside it. Undefined without
 * intake facts; a paragraph whose facts are missing is left out.
 */
function peopleProse(ctx: CimContext): Block | undefined {
  const i = ctx.intake;
  if (!i) return undefined;
  const b = ctx.brief;
  const L = ctx.latest.label;
  const paragraphs: Paragraph[] = [];
  // Role names and counts from the payroll register when there is one, as the organization table beside the prose prints
  // them (QA round 3 F37: one name per role); else the notes', which carry the management marker.
  const register = rolesAtAsOf(ctx)?.filter(([, es]) => !es[0]!.isOwner).map(([role, es]) => ({ role, count: es.length }));
  const staff = (register ?? i.workforce.composition.filter((c) => !/\bowner\b/i.test(c.role))).sort((a, b) => b.count - a.count);
  if (staff.length) {
    // A sentence, not a list dump (QA round 3 F30): "Of the 23 employees besides the owner, 14 are service technicians, ...".
    const total = b.has("hc.total") ? b.t("hc.total") : fmtCount(staff.reduce((s, c) => s + c.count, 0));
    const roles = staff.map((c, k) => `${countWord(c.count)} ${k === 0 ? (c.count === 1 ? "is " : "are ") : ""}${roleNoun(c.role, c.count)}`);
    const pay = i.workforce.payBasis ? ` ${i.workforce.payBasis}${i.workforce.union === false ? "; there is no union" : i.workforce.union ? "; the workforce is unionized" : ""} (1).` : "";
    const flow = b.has(`hc.hires.${ctx.latest.key}`) ? ` ${L} saw ${b.t(`hc.hires.${ctx.latest.key}`)} hires and ${b.t(`hc.departures.${ctx.latest.key}`)} departures.` : "";
    // Pay by the compensation table's rows, which reconcile to the P&L wage lines (guide 4.8).
    const group = (g: string) => `${b.t(`hc.group.${g}.avgComp`)} for ${b.t(`hc.group.${g}.label`).toLowerCase()}`;
    const fy = ctx.fy[ctx.fy.length - 1]?.label;
    const comp = fy && b.has("hc.group.field.avgComp") && b.has("hc.group.office.avgComp") ? ` With employer costs, pay averaged ${group("field")} and ${group("office")} in ${fy}.` : "";
    paragraphs.push({ lead: "Staffing.", body: `Of the ${total} employees besides the owner, ${series(roles)}${register ? "." : " (1)."}${pay}${flow}${comp}` });
  }
  const o = i.owner;
  if (o.responsibilities.length) {
    const hours = o.hoursPerWeek ? `about ${o.hoursPerWeek} hours a week` : "the week";
    // The repeat subject is "the owner", which the notes support; a pronoun would state a fact they do not give.
    const stay = o.transition.months ? ` The owner will support the transition for up to ${o.transition.months} months after closing (1).` : "";
    paragraphs.push({ lead: "The owner's role.", body: `${o.name || "The owner"} spends ${hours} on ${series(o.responsibilities.map((r) => inText(r.responsibility)))} (1).${stay}` });
  }
  // Fleet items that share an ownership phrase read as one clause: "18 service vans and 2 install trucks, all owned, ...".
  const byOwnership = new Map<string, string[]>();
  for (const f of i.fleetAndEquipment) byOwnership.set(f.ownership, [...(byOwnership.get(f.ownership) ?? []), `${f.count !== undefined ? `${fmtCount(f.count)} ` : ""}${inText(f.item)}`]);
  const fleet = [...byOwnership].map(([ownership, items]) => `${series(items)}, ${items.length > 1 ? "all " : ""}${inText(ownership)}`);
  const systems = i.systems.map((s) => `${s.system} for ${inText(s.function)}`);
  if (fleet.length || systems.length) {
    paragraphs.push({ lead: "Fleet and systems.", body: `${fleet.length ? `The fleet is ${fleet.join("; ")} (1).` : ""}${systems.length ? `${fleet.length ? " " : ""}The Company runs ${series(systems)} (1).` : ""}` });
  }
  const main = i.suppliers.filter((s) => /^main supplier/i.test(s.supplies)).map((s) => s.name);
  const other = i.suppliers.filter((s) => !/^main supplier/i.test(s.supplies)).map((s) => {
    const via = /^(.+?) through (.+)$/i.exec(s.supplies);
    return via ? `${s.name} ${inText(via[1]!)} comes through ${via[2]}` : `${s.name} supplies ${inText(s.supplies)}`;
  });
  const buys = [...(main.length ? [`${series(main)} ${main.length > 1 ? "are the main suppliers" : "is the main supplier"}`] : []), ...other];
  const certified = i.company.certifications.map((c) => `a ${c.name}${c.since ? ` since ${c.since}` : ""}`);
  const rated = i.company.reputation.map((r) => `its ${r.metric} is ${r.value}`);
  const standing = certified.length ? [`It has been ${series(certified)}`, ...rated].join(", and ") : rated.length ? `${inTextUpper(series(rated))}` : "";
  if (buys.length || standing) {
    askLicenses(ctx);
    paragraphs.push({ lead: "Suppliers and reputation.", body: `${buys.length ? `${inTextUpper(buys.join("; "))} (1).` : ""}${standing ? `${buys.length ? " " : ""}${standing} (1).` : ""}` });
  }
  // Customer facts without a share: the shares are printed from the data on the customer pages.
  const who = i.customerFacts.filter((f) => !/%/.test(f.fact)).map((f) => f.fact);
  if (who.length) paragraphs.push({ lead: "Customers.", body: `${who.map((f) => `${f.charAt(0).toUpperCase()}${f.slice(1)}`).join("; ")} (1).` });
  return paragraphs.length ? { kind: "prose", paragraphs } : undefined;
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
    // Text-led when the notes give the facts (spec archetype P2): run-in paragraphs lead the page with the organization
    // under them; compensation, the roll-forward and the observations take the right-hand columns. The suppliers are a paragraph.
    const prose = peopleProse(ctx);
    const org = organization(ctx, usable(1, 7));
    const roll = carries(ctx, "S5.1", "S5.3") ? headcountRollForward(ctx, prose ? spanW(8, 12) : usable(1, 7)) : undefined;
    const sup = carries(ctx, "S5.1", "S5.5") && !prose ? suppliers(ctx, spanW(8, 12)) : undefined;
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
        rows: [prose ? { columns: [{ span: [1, 7], blocks: present(prose, org) }, { span: [8, 12], blocks: present(dept, roll, fac, obs) }] } : { columns: [{ span: [1, 7], blocks: present(org, roll) }, { span: [8, 12], blocks: present(dept, sup, fac, obs) }] }],
        notes: {
          source: source(ctx.sources.payroll, "Management"),
          note: standardNote(ctx, `Employees other than management are described by role only. ${(dept && fieldWagesTie(ctx)) || "Compensation includes employer taxes and benefits."}`),
          footnotes: [PER_MANAGEMENT],
        },
        carries: [dept ? "S5.2" : "", roll ? "S5.3" : "", sup || (prose && carries(ctx, "S5.1", "S5.5")) ? "S5.5" : "", ...(fac ? ["S2.4", "S2.5"].filter((id) => carries(ctx, "S5.1", id)) : [])].filter(Boolean),
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
        { row: "org.total", lead: "{{staff.total}} employees besides the owner {{fn.mgmt}},", body: `with payroll excluding the owner at {{payrollPct.latest}} of revenue in ${ctx.latest.label}.` },
        ...(m && role
          ? [{ row: `org.${role}`, lead: `${m.name}, ${m.role.toLowerCase()}${m.since ? ` with the Company since ${m.since.slice(0, 4)}` : ""},`, body: `runs ${m.responsibilities.join(" and ").toLowerCase()}${m.postCloseIntent === "stays" ? " and is expected to stay after closing" : ""} (1).` }]
          : []),
      ],
    };
  }
  return {
    observations: [
      { row: "org.total", lead: `{{hc.total}} employees besides the owner`, body: `at ${monthLabel(ctx.latest.end)}, {{hc.field}} of them in field roles.` },
      { row: "dept.total", lead: `Payroll excluding the owner was {{payrollPct.latest}} of revenue`, body: `in ${ctx.latest.label}; compensation by department is in the table.` },
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
        notes: { source: source(ctx.sources.payroll), note: standardNote(ctx, fieldWagesTie(ctx) ?? "Compensation includes employer taxes and benefits.") },
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
  absent: (ctx) => {
    if (!ctx.intake?.owner.responsibilities.length) return "No owner responsibilities in the intake notes";
    // Most of the table would be placeholders: the duties stay in the buyer table's owner row, the gaps are asked (verification F29).
    const { filled, cells, enough } = ownerTableFilled(ctx);
    if (enough) return undefined;
    askOwnerTable(ctx, "the owner responsibilities table is left out until the Seller gives these");
    return `The notes fill ${filled} of the owner responsibilities table's ${cells} cells (hours, successor, transition support); the duties are named in the buyer table and the gaps are open questions`;
  },
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
