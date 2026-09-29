// S9 Growth opportunities (guide 3.3): seller-achievable levers identified
// by management, each with the baseline the notes state, and the figures in
// the model they start from. A lever is sized only when the notes give a
// target or benchmark; none is included in any figure (spec 8, graft 7).

import type { CimContext } from "../context.ts";
import { pageCopy, PER_MANAGEMENT, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import { spanW } from "../design.ts";
import { growthLevers, keyObservations, leverBaselines, observationsBlock, usable } from "../exhibits.ts";
import { chooseTitle, draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Growth opportunities";

const s9_1: PageModule = {
  id: "S9.1",
  name: "Opportunity sizing",
  status: "A",
  copyKey: "s9_1",
  // Guide 3.3: the page sizes levers, so it needs one with a baseline and a benchmark or management target; until then the
  // levers are a line in the executive summary's transaction table and this reason is an open question (QA round 1 F44).
  absent: (ctx) => {
    const levers = ctx.intake?.growthLevers ?? [];
    if (!levers.length) return "No growth levers in the intake notes";
    return levers.some((l) => l.baseline && l.target) ? undefined : `None of the ${levers.length} growth levers has both a baseline and a benchmark or management target to size it; ask the Seller for a target per lever`;
  },
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s9_1") ?? fallback91(ctx);
    const levers = growthLevers(ctx, spanW(1, 12));
    const base = leverBaselines(ctx, usable(1, 6));
    const obs = observationsBlock("the levers", keyObservations(ctx, "S9.1", copy.observations, present(levers, base)));
    const n = ctx.intake!.growthLevers.length;
    const b = ctx.brief;
    const lead = b.has("kpi.maintenance_members") && b.has("kpi.agreement_offer_rate") ? `, starting from ${b.t("kpi.maintenance_members")} agreement members offered on ${b.t("kpi.agreement_offer_rate")} of calls` : "";
    const title = chooseTitle(ctx, "S9.1 title", copy.title, `Management identifies ${n} growth levers${lead}; none is in the figures shown`);
    return [
      draft(ctx, {
        id: "S9.1",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 12], blocks: present(levers) }] }, { columns: [{ span: [1, 6], blocks: present(base) }, { span: [7, 12], blocks: present(obs) }] }],
        notes: { source: source(ctx.sources.financials, "Management"), note: standardNote(ctx, "Levers are management's view; buyer synergies are not included."), footnotes: [PER_MANAGEMENT] },
      }),
    ];
  },
  fallback: (ctx) => ({ s9_1: fallback91(ctx) }),
};

function fallback91(ctx: CimContext): NonNullable<CimCopy["s9_1"]> {
  const levers = ctx.intake?.growthLevers ?? [];
  return {
    observations: [
      { row: levers[0] ? `lever.${levers[0].lever}` : "", lead: `${levers.length} levers identified by management`, body: "each with the baseline the Seller states; none is sized without a target or benchmark." },
      { row: "base.marketing", lead: "Marketing was {{marketingPct.latest}} of revenue", body: `in ${ctx.latest.label}, the baseline for any paid-marketing lever.` },
    ],
  };
}

const s9_2: PageModule = {
  id: "S9.2",
  name: "Management projections",
  status: "C",
  absent: () => "No management budget or forecast in the sources (guide Q14)",
  budget: [0, 1],
  build: () => [],
};

export const S9: SectionModule = { id: "S9", name: SECTION, pages: [s9_1, s9_2] };
