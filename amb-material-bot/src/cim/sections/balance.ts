// S8 Balance sheet and cash flow (guide 3.3, conditional on two year-end
// balance sheets). Working capital and cash conversion sit beside the
// balance sheet; the trailing statistic is labelled T12M average, never a
// peg (D5). In an asset purchase the note states what the Seller retains.

import { monthLabel } from "../../domain/financials.ts";
import type { CimContext } from "../context.ts";
import { confirm, pageCopy, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import { spanW } from "../design.ts";
import { balanceSheet, cashConversion, keyObservations, observationsBlock, usable, workingCapital } from "../exhibits.ts";
import { fmtMoney } from "../../util/format.ts";
import { chooseTitle, draft, present, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Balance sheet and cash flow";

const yearEnds = (ctx: CimContext) => ctx.fy.filter((c) => ctx.out.periods[c.key]?.bs && !ctx.out.periods[c.key]!.bs!.estimated);

/** The debt footnote: each funded-debt item at the latest date, and what happens to it at closing. */
function debtNote(ctx: CimContext): string | undefined {
  const dl = ctx.out.debtLike;
  const debt = dl?.items.filter((i) => i.treatment !== "nwc") ?? [];
  if (!dl || !debt.length) return undefined;
  // Lower-case the item unless it opens with an acronym ("SBA loan").
  const list = debt.map((i) => `${/^[A-Z][a-z]/.test(i.item) ? i.item.charAt(0).toLowerCase() + i.item.slice(1) : i.item} ${fmtMoney(i.balance)}`).join(", ");
  return `Debt at ${monthLabel(dl.asOf.slice(0, 7))}: ${list}; ${ctx.assetSale ? "repaid by the Seller at closing in an asset purchase" : "deducted in the equity bridge"}.`;
}

const s8_1: PageModule = {
  id: "S8.1",
  name: "Summary balance sheet",
  status: "C",
  copyKey: "s8_1",
  absent: (ctx) => (yearEnds(ctx).length >= 2 ? undefined : "Fewer than two year-end balance sheets"),
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s8_1") ?? fallback81(ctx);
    const bs = balanceSheet(ctx, usable(1, 6));
    const nwc = ctx.carried.get("S8.1")?.includes("S8.2") ? workingCapital(ctx, spanW(7, 12)) : undefined;
    const cf = ctx.carried.get("S8.1")?.includes("S8.3") ? cashConversion(ctx, spanW(7, 12)) : undefined;
    const obs = observationsBlock("the balance sheet", keyObservations(ctx, "S8.1", copy.observations, present(bs, nwc, cf)));
    const b = ctx.brief;
    const L = ctx.fy[ctx.fy.length - 1]!;
    const title = chooseTitle(
      ctx,
      "S8.1 title",
      copy.title,
      b.has(`fcf.${L.key}`)
        ? `Free cash flow of ${b.t(`fcf.${L.key}`)} in ${L.label} was ${b.t(`fcfConversion.${L.key}`)} of Reported EBITDA, with working capital at ${b.t(`nwc.pct.${L.key}`)} of revenue`
        : `Working capital was ${b.maybe(`nwc.${L.key}`) ?? "n.a."} at ${L.label} year-end`,
    );
    const pegNote = ctx.out.nwc?.pegBasis === "n.a." ? "Year-end balances only, so no trailing-twelve-month average is shown." : `The trailing statistic is the ${ctx.out.nwc?.pegBasis}.`;
    const retained = ctx.assetSale ? " In an asset purchase the Seller retains cash, receivables and payables." : "";
    return [
      draft(ctx, {
        id: "S8.1",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: present(bs) }, { span: [7, 12], blocks: present(nwc, cf) }], floating: present(obs) }],
        notes: {
          source: source(`${ctx.sources.statements} (balance sheets at each year-end)`),
          note: `Figures in USD thousands; unaudited. ${pegNote}${retained} Capital expenditure is derived from the change in fixed assets plus depreciation.`,
          footnotes: [debtNote(ctx) ?? confirm(ctx, "debt detail", "Debt balances by lender at the latest balance-sheet date"), "Capital expenditure derived: change in net fixed assets plus depreciation."],
        },
        carries: [nwc ? "S8.2" : "", cf ? "S8.3" : ""].filter(Boolean),
      }),
    ];
  },
  fallback: (ctx) => ({ s8_1: fallback81(ctx) }),
};

function fallback81(ctx: CimContext): NonNullable<CimCopy["s8_1"]> {
  const L = ctx.fy[ctx.fy.length - 1]!.key;
  return {
    observations: [
      { row: "nwc.total", lead: `Working capital of {{nwc.${L}}}`, body: `was {{nwc.pct.${L}}} of revenue, with receivables at {{dso.${L}}} of sales.` },
      { row: "cf.fcf", lead: `Free cash flow of {{fcf.${L}}}`, body: `was {{fcfConversion.${L}}} of Reported EBITDA after derived capital expenditure of {{capex.${L}}}.` },
    ],
  };
}

const s8_2: PageModule = {
  id: "S8.2",
  name: "Net working capital",
  status: "C",
  absent: (ctx) => ((ctx.out.nwc?.periods.length ?? 0) >= 2 ? undefined : "Fewer than two balance sheets for working capital"),
  mergeInto: (ctx) => (ctx.present.has("S8.1") ? "S8.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S8.2",
        section: SECTION,
        title: `Working capital at ${ctx.brief.t(`nwc.pct.${ctx.fy[ctx.fy.length - 1]!.key}`)} of revenue`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(workingCapital(ctx, usable(1, 6))) }] }],
        notes: { source: source(ctx.sources.statements), note: standardNote(ctx) },
      }),
    ];
  },
};

const s8_3: PageModule = {
  id: "S8.3",
  name: "Capex and cash conversion",
  status: "C",
  absent: (ctx) => (ctx.out.cashFlow?.length ? undefined : "No cash flow (needs two balance sheets)"),
  mergeInto: (ctx) => (ctx.present.has("S8.1") ? "S8.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S8.3",
        section: SECTION,
        title: `Free cash flow was ${ctx.brief.t(`fcfConversion.${ctx.fy[ctx.fy.length - 1]!.key}`)} of Reported EBITDA`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(cashConversion(ctx, usable(1, 6))) }] }],
        notes: { source: source(ctx.sources.statements), note: standardNote(ctx) },
      }),
    ];
  },
};

export const S8: SectionModule = { id: "S8", name: SECTION, pages: [s8_1, s8_2, s8_3] };
