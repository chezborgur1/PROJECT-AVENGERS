// S3 Market (guide 3.3): conditional throughout. Every figure is sourced or
// omitted; the bot never estimates a market size (guide Q24). Market inputs
// and named competitors come only from the intake facts.

import type { CimContext } from "../context.ts";
import { pageCopy, PER_MANAGEMENT } from "../context.ts";
import type { Block, TextCell } from "../design.ts";
import { r3, spanW } from "../design.ts";
import { keyObservations, observationsBlock } from "../exhibits.ts";
import { chooseTitle, draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Market";

function marketInputs(ctx: CimContext, w: number): Block | undefined {
  const inputs = ctx.intake?.marketInputs ?? [];
  if (!inputs.length) return undefined;
  const rows: TextCell[][] = inputs.map((m) => [m.metric, m.value, m.source.source]);
  return { kind: "textTable", header: { title: "Market inputs", units: "(as sourced)" }, spec: { colW: [2.2, 1.4, r3(w - 3.6)], head: ["Measure", "Value", "Source"], rows, fontSize: 8.5, rowKeys: inputs.map((m) => `mkt.${m.metric}`) } };
}

function competitors(ctx: CimContext, w: number): Block | undefined {
  const cs = ctx.intake?.competitors ?? [];
  if (cs.length < 3) return undefined;
  const rows: TextCell[][] = cs.map((c) => [c.name, c.type.charAt(0).toUpperCase() + c.type.slice(1), c.positioning]);
  return { kind: "textTable", header: { title: "Competitive landscape", units: "(per management) (1)" }, spec: { colW: [1.8, 1.0, r3(w - 2.8)], head: ["Competitor", "Type", "Positioning"], rows, fontSize: 8.5, rowKeys: cs.map((c) => `comp.${c.name}`) } };
}

const s3_1: PageModule = {
  id: "S3.1",
  name: "Market size and share",
  status: "C",
  copyKey: "s3_1",
  absent: (ctx) => (ctx.intake?.marketInputs.length ? undefined : "No sourced market inputs (guide Q24)"),
  budget: [0, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s3_1");
    const left = marketInputs(ctx, spanW(1, 6));
    const right = ctx.present.has("S3.2") ? competitors(ctx, spanW(7, 12)) : undefined;
    const obs = observationsBlock("the market tables", keyObservations(ctx, "S3.1", copy?.observations, present(left, right)));
    const inputs = ctx.intake!.marketInputs;
    return [
      draft(ctx, {
        id: "S3.1",
        section: SECTION,
        title: chooseTitle(ctx, "S3.1 title", copy?.title, `${inputs[0]!.metric}: ${inputs[0]!.value}, per ${inputs[0]!.source.source}`),
        rows: [{ columns: [{ span: [1, 6], blocks: present(left) }, { span: [7, 12], blocks: present(right, obs) }] }],
        notes: { source: source(...inputs.map((m) => m.source.source)), footnotes: [PER_MANAGEMENT] },
        carries: right ? ["S3.2"] : [],
      }),
    ];
  },
};

const s3_2: PageModule = {
  id: "S3.2",
  name: "Competitive landscape",
  status: "C",
  absent: (ctx) => ((ctx.intake?.competitors.length ?? 0) >= 3 ? undefined : "Fewer than three named competitors in the notes"),
  mergeInto: (ctx) => (ctx.present.has("S3.1") ? "S3.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    const table = competitors(ctx, spanW(1, 12));
    return [
      draft(ctx, {
        id: "S3.2",
        section: SECTION,
        title: `${ctx.intake!.competitors.length} competitors named by management, by type and positioning`,
        rows: [{ columns: [{ span: [1, 12], blocks: present(table) }] }],
        notes: { source: source("Management"), footnotes: [PER_MANAGEMENT] },
      }),
    ];
  },
};

const s3_3: PageModule = {
  id: "S3.3",
  name: "Demand drivers",
  status: "C",
  absent: () => "No sourced demographic or sector series in the request data",
  budget: [0, 1],
  build: () => [],
};

export const S3: SectionModule = { id: "S3", name: SECTION, pages: [s3_1, s3_2, s3_3] };
