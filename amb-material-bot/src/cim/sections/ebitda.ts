// S7 Adjusted EBITDA (guide 3.3): the ladder with the bridge and the page's
// one callout stating what is not assumed (spec 6.5), then the adjustment
// support with the owner-compensation detail (S7.3) under it. Only accepted
// rows reach the CIM (guide Q10); S7.1 and S7.2 are never cut.

import type { CimContext } from "../context.ts";
import { confirm, nonGaap, pageCopy, pageRef, PER_MANAGEMENT, resolveCopy, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import type { Block, TextCell } from "../design.ts";
import { r3, spanW } from "../design.ts";
import { adjustmentSupport, ebitdaLadder, keyObservations, ladderWaterfall, observationsBlock, ownerCompensation, reserveFootnote, reserveIsProxy, usable } from "../exhibits.ts";
import { fmtDollars, fmtPct, k } from "../../util/format.ts";
import { chooseTitle, draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Adjusted EBITDA";

/**
 * Footnotes the ladder's markers point at: (1) SDE or the owner-compensation
 * line, (2) the market salary. The capital reserve's basis is on the support
 * page, so the band stays within three lines (spec 6.3).
 */
function ladderFootnotes(ctx: CimContext): string[] {
  const rs = ctx.ds.recastInputs;
  const notes = [ctx.mainStreet ? "SDE is Adj. EBITDA before one owner's market pay and the capital reserve." : "[S1] adds back owner pay as paid; [S2] deducts a market replacement with taxes and benefits."];
  if (rs) notes.push(`${fmtDollars(rs.replacementSalary)} manager salary per management, not independently verified, plus ${fmtPct(rs.burdenPct, 0)} payroll taxes and benefits.`);
  // (3) marks the capital reserve when it is AMB's depreciation proxy (F23).
  if (ctx.mainStreet && reserveIsProxy(ctx)) notes.push(reserveFootnote(ctx)!);
  return notes;
}

const s7_1: PageModule = {
  id: "S7.1",
  name: "Adjusted EBITDA reconciliation",
  status: "A",
  copyKey: "s7_1",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s7_1") ?? fallback71(ctx);
    const ladder = ebitdaLadder(ctx, usable(1, 6));
    const bridge = ladderWaterfall(ctx);
    const obs = observationsBlock("the EBITDA ladder", keyObservations(ctx, "S7.1", copy.observations, [ladder]));
    const callout: Block = { kind: "callout", lead: "Takeaway:", body: resolveCopy(ctx, copy.takeaway, "S7.1 takeaway") };
    const b = ctx.brief;
    const title = chooseTitle(
      ctx,
      "S7.1 title",
      copy.title,
      ctx.mainStreet
        ? `Adj. EBITDA of ${b.t("adjEbitda.latest")} in ${ctx.latest.label} restates ${b.t("ownerCompPaid.latest")} of owner pay to a ${b.maybe("replacementCost") ?? b.t("s2.latest")} market cost and deducts a ${b.t("s3.latest")} reserve`
        : `Adj. EBITDA of ${b.t("adjEbitda.latest")} in ${ctx.latest.label} after ${b.t("normTotal.latest")} of normalization and ${b.t("ownerAboveMarket.latest")} of owner pay above market`,
    );
    return [
      draft(ctx, {
        id: "S7.1",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: [ladder] }, { span: [7, 12], blocks: present(bridge, obs, callout) }] }],
        notes: {
          source: source(ctx.sources.financials, "general ledger detail", ctx.sources.payroll, "Seller add-back list"),
          note: `Figures in USD thousands. ${nonGaap(ctx).split(";")[0]}. Positive adjustments increase EBITDA; accepted adjustments only. Unaudited.`,
          footnotes: ladderFootnotes(ctx),
        },
      }),
    ];
  },
  fallback: (ctx) => ({ s7_1: fallback71(ctx) }),
};

function fallback71(ctx: CimContext): NonNullable<CimCopy["s7_1"]> {
  return {
    observations: [
      { row: "ladder.reported", lead: "Reported EBITDA of {{repEbitda.latest}}", body: "is net income of {{netIncome.latest}} plus interest of {{interest.latest}} and depreciation of {{da.latest}}." },
      { row: "ladder.normTotal", lead: "Normalization adjustments total {{normTotal.latest}}", body: `each listed with its basis and evidence on ${pageRef("S7.2")}.` },
      ctx.mainStreet
        ? { row: "ladder.sde", lead: "SDE of {{sde.latest}} ({{sdeMargin.latest}})", body: `keeps one working owner's pay; Adj. EBITDA deducts ${ctx.brief.article("replacementCost")} {{replacementCost}} replacement and the reserve.` }
        : { row: "ladder.ownerNorm", lead: "Owner pay above market of {{ownerAboveMarket.latest}}", body: `is added back after deducting ${ctx.brief.article("replacementCost")} {{replacementCost}} market replacement.` },
    ],
    takeaway: ctx.mainStreet
      ? "A buyer who hires a general manager underwrites Adj. EBITDA of {{adjEbitda.latest}}; an owner-operator underwrites SDE of {{sde.latest}}. Nothing pro forma is included; the figures assume no change in pricing, headcount or programs after closing."
      : "Adj. EBITDA of {{adjEbitda.latest}} carries a market-rate general manager. Nothing pro forma is included; the figures assume no change in pricing, headcount or programs after closing.",
  };
}

const s7_2: PageModule = {
  id: "S7.2",
  name: "Adjustment support",
  status: "A",
  copyKey: "s7_2",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s7_2") ?? fallback72(ctx);
    const support = adjustmentSupport(ctx, spanW(1, 12), true);
    const owner = ctx.carried.get("S7.2")?.includes("S7.3") ? ownerCompensation(ctx, usable(1, 7)) : undefined;
    const obs = observationsBlock(owner ? "owner compensation" : "the support table", keyObservations(ctx, "S7.2", copy.observations, present(owner, support)));
    const accepted = ctx.out.adjustments.filter((a) => a.row.status === "accepted" && a.row.tier !== "definitional" && a.row.tier !== "memo" && Object.values(a.byColumn).some((v) => v !== 0));
    // A depreciation proxy or a statutory-rate calculation is AMB's figure, not a record: counted apart from the documented rows.
    const estimated = accepted.filter((a) => a.row.evidence === "pending" || (a.row.category === "capital_reserve" && reserveIsProxy(ctx))).length;
    const represented = accepted.filter((a) => a.row.evidence === "management_representation").length;
    const documented = accepted.length - estimated - represented;
    const b = ctx.brief;
    const byAmb = estimated ? `, ${estimated} calculated by AMB` : "";
    const title = chooseTitle(ctx, "S7.2 title", copy.title, [
      `${accepted.length} accepted adjustments: ${documented} documented in the records${byAmb} and ${represented} by management representation`,
      `${accepted.length} accepted adjustments: ${documented} documented${byAmb} and ${represented} resting on management representation`,
    ]);
    return [
      draft(ctx, {
        id: "S7.2",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 12], blocks: [support] }] }, { columns: [{ span: [1, 7], blocks: present(owner) }, { span: [8, 12], blocks: present(obs) }] }],
        notes: {
          source: source(ctx.sources.financials, "general ledger detail", ctx.sources.payroll, "Seller add-back list"),
          note: `Figures in USD thousands; positive amounts increase EBITDA. Only accepted adjustments are included; memo items are not added. ${b.has("replacementCost") ? `[S2] is ${b.t("replacementCost")} a year.` : ""}`.trim(),
          // (2) is the reserve's footnote: the owner table marks its reserve line, and a proxy's evidence cell says it is an estimate.
          footnotes: [PER_MANAGEMENT, ...((owner || reserveIsProxy(ctx)) && reserveFootnote(ctx) ? [reserveFootnote(ctx)!] : [])],
        },
        carries: owner ? ["S7.3"] : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s7_2: fallback72(ctx) }),
};

/**
 * Template observations keyed to rows the page carries: the owner-compensation
 * table when S7.3 sits under the support table (Main Street), else the [S1]
 * and [S2] rows of the support table itself (lower middle market).
 */
function fallback72(ctx: CimContext): NonNullable<CimCopy["s7_2"]> {
  const ref = (category: string) => ctx.out.adjustments.find((a) => a.row.category === category && a.row.status === "accepted")?.row.ref;
  const [above, replacement] = ctx.present.has("S7.3") ? ["oc.above", "oc.replacement"] : [`support.${ref("owner_compensation")}`, `support.${ref("replacement_cost")}`];
  return {
    observations: [
      { row: above, lead: "Owner pay above market of {{ownerAboveMarket.latest}}", body: "is compensation as paid of {{ownerCompPaid.latest}} less the {{replacementCost}} replacement cost." },
      { row: replacement, lead: "The replacement cost of {{replacementCost}}", body: `is ${ctx.brief.article("replacementSalary")} {{replacementSalary}} salary plus {{burdenPct}} payroll taxes and benefits.` },
    ],
  };
}

const s7_3: PageModule = {
  id: "S7.3",
  name: "Owner compensation and SDE",
  status: "C",
  absent: (ctx) => (ctx.mainStreet ? undefined : "Lower-middle-market mode (PF Adj. EBITDA of $1.0M or more, guide Q7)"),
  mergeInto: (ctx) => (ctx.present.has("S7.2") ? "S7.2" : undefined),
  budget: [0, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S7.3",
        section: SECTION,
        title: `SDE of ${ctx.brief.t("sde.latest")} keeps one working owner's pay of ${ctx.brief.t("ownerCompPaid.latest")}`,
        rows: [{ columns: [{ span: [1, 7], blocks: present(ownerCompensation(ctx, usable(1, 7))) }] }],
        notes: { source: source(ctx.sources.financials, ctx.sources.payroll), note: standardNote(ctx), footnotes: ladderFootnotes(ctx).slice(1) },
      }),
    ];
  },
};

/** Reconciliation between sources (guide S7.4): a column per source with the difference and an explanation. */
const s7_4: PageModule = {
  id: "S7.4",
  name: "Reconciliation between sources",
  status: "C",
  absent: (ctx) => ((ctx.ds.reconciliations ?? []).some((r) => r.material) ? undefined : "No material difference between sources"),
  budget: [0, 1],
  build(ctx) {
    const recs = (ctx.ds.reconciliations ?? []).filter((r) => r.material);
    const w = spanW(1, 12);
    const rows: TextCell[][] = recs.map((r) => [`FY${r.fiscalYear} ${r.line.replace(/_/g, " ")}`, k(r.chosen.amount), k(r.other.amount), k(r.difference), fmtPct(r.differencePct), r.explanation ?? confirm(ctx, "explanation", `Why FY${r.fiscalYear} ${r.line.replace(/_/g, " ")} differs between sources`)]);
    const table: Block = { kind: "textTable", header: { title: "Reconciliation between sources", units: "($000s)" }, spec: { colW: [2.0, 1.1, 1.1, 0.9, 0.8, r3(w - 5.9)], head: ["Line", recs[0]!.chosen.source.replace(/_/g, " "), recs[0]!.other.source.replace(/_/g, " "), "Difference", "%", "Explanation"], rows, aligns: ["left", "right", "right", "right", "right", "left"], fontSize: 8.5 } };
    return [
      draft(ctx, {
        id: "S7.4",
        section: SECTION,
        title: `${recs.length} lines differ by more than 2% between the Company's sources`,
        rows: [{ columns: [{ span: [1, 12], blocks: [table] }] }],
        notes: { source: source(ctx.sources.financials, "federal tax returns"), note: standardNote(ctx) },
      }),
    ];
  },
};

const s7_5: PageModule = {
  id: "S7.5",
  name: "Rate- or price-linked earnings",
  status: "C",
  absent: () => "No rate- or commodity-linked revenue in the sources",
  budget: [0, 1],
  build: () => [],
};

export const S7: SectionModule = { id: "S7", name: SECTION, pages: [s7_1, s7_2, s7_3, s7_4, s7_5] };
