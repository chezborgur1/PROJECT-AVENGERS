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

/** The latest fiscal year with a cash-flow statement, the year every free-cash-flow figure on these pages is quoted for. */
const lastCashYear = (ctx: CimContext) => [...ctx.fy].reverse().find((c) => ctx.out.cashFlow?.some((cf) => cf.fiscalYear === c.fiscalYear));

/** "at Dec-25": the date of the latest balance sheet behind the working-capital figures. */
const lastNwcDate = (ctx: CimContext): string | undefined => {
  const p = ctx.out.nwc?.periods;
  return p?.length ? monthLabel(p[p.length - 1]!.month) : undefined;
};

/** The debt footnote: each funded-debt item at the latest date, and what happens to it at closing. */
function debtNote(ctx: CimContext): string | undefined {
  const dl = ctx.out.debtLike;
  const debt = dl?.items.filter((i) => i.treatment !== "nwc") ?? [];
  if (!dl || !debt.length) return undefined;
  // Lower-case the item unless it opens with an acronym ("SBA loan").
  const list = debt.map((i) => `${/^[A-Z][a-z]/.test(i.item) ? i.item.charAt(0).toLowerCase() + i.item.slice(1) : i.item} ${fmtMoney(i.balance)}`).join(", ");
  // Repayment at closing is the Seller's to confirm (open question), so the deck does not state it as fact (rule 5).
  return `Debt at ${monthLabel(dl.asOf.slice(0, 7))}: ${list}; ${ctx.assetSale ? confirm(ctx, "repaid by the Seller at closing", "Whether each loan is repaid by the Seller at closing, so the vehicles and equipment transfer free of liens") : "deducted in the equity bridge"}.`;
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
    // The letters land in all three tables, so the header names them all.
    const obs = observationsBlock([bs, nwc, cf].filter(Boolean).length > 1 ? "the tables" : "the balance sheet", keyObservations(ctx, "S8.1", copy.observations, present(bs, nwc, cf)));
    const b = ctx.brief;
    // Figures from the latest year-end the sheets cover, which need not be the latest fiscal year.
    const L = yearEnds(ctx)[yearEnds(ctx).length - 1]!;
    const title = chooseTitle(
      ctx,
      "S8.1 title",
      copy.title,
      b.has(`fcf.${L.key}`) && b.has(`nwc.pct.${L.key}`)
        ? `Free cash flow of ${b.t(`fcf.${L.key}`)} in ${L.label} was ${b.t(`fcfConversion.${L.key}`)} of Reported EBITDA, with working capital at ${b.t(`nwc.pct.${L.key}`)} of revenue`
        : b.has(`nwc.${L.key}`)
          ? `Working capital was ${b.t(`nwc.${L.key}`)} at ${L.label} year-end, ${b.t(`nwc.pct.${L.key}`)} of revenue`
          : `Equity was ${b.t(`bs.equity.${L.key}`)} and debt ${b.t(`bs.debt.${L.key}`)} at ${L.label} year-end`,
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
          note: `Figures in USD thousands; unaudited. ${pegNote}${retained}`.trim(),
          footnotes: [debtNote(ctx) ?? confirm(ctx, "debt detail", "Debt balances by lender at the latest balance-sheet date"), "Capital expenditure derived: change in net fixed assets plus depreciation."],
        },
        carries: [nwc ? "S8.2" : "", cf ? "S8.3" : ""].filter(Boolean),
      }),
    ];
  },
  fallback: (ctx) => ({ s8_1: fallback81(ctx) }),
};

function fallback81(ctx: CimContext): NonNullable<CimCopy["s8_1"]> {
  const b = ctx.brief;
  const L = yearEnds(ctx)[yearEnds(ctx).length - 1]!.key;
  const cf = lastCashYear(ctx)?.key;
  const observations: NonNullable<CimCopy["s8_1"]>["observations"] = [];
  if (b.has(`nwc.${L}`)) observations.push({ row: "nwc.total", lead: `Working capital of {{nwc.${L}}}`, body: `was {{nwc.pct.${L}}} of revenue, with receivables at {{dso.${L}}} of sales.` });
  if (cf && b.has(`fcf.${cf}`)) observations.push({ row: "cf.fcf", lead: `Free cash flow of {{fcf.${cf}}}`, body: `was {{fcfConversion.${cf}}} of Reported EBITDA after derived capital expenditure of {{capex.${cf}}}.` });
  if (observations.length < 2) observations.push({ row: "bs.equity", lead: `Equity of {{bs.equity.${L}}}`, body: `against debt of {{bs.debt.${L}}} at the same year-end.` });
  return { observations };
}

const s8_2: PageModule = {
  id: "S8.2",
  name: "Net working capital",
  status: "C",
  absent: (ctx) => ((ctx.out.nwc?.periods.length ?? 0) >= 2 ? undefined : "Fewer than two balance sheets for working capital"),
  mergeInto: (ctx) => (ctx.present.has("S8.1") ? "S8.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    // Built alone when the sheets do not fall at two fiscal year-ends: the figures are at the latest dated sheet.
    return [
      draft(ctx, {
        id: "S8.2",
        section: SECTION,
        title: `Working capital was ${ctx.brief.t("nwc.latest")} at ${lastNwcDate(ctx)}, ${ctx.brief.t("nwc.pct.latest")} of the twelve months' revenue to that date`,
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
  absent: (ctx) => (lastCashYear(ctx) ? undefined : "No cash flow for a fiscal year shown (needs two year-end balance sheets)"),
  mergeInto: (ctx) => (ctx.present.has("S8.1") ? "S8.1" : undefined),
  budget: [0, 1],
  build(ctx) {
    const L = lastCashYear(ctx)!;
    return [
      draft(ctx, {
        id: "S8.3",
        section: SECTION,
        title: `Free cash flow was ${ctx.brief.t(`fcfConversion.${L.key}`)} of Reported EBITDA in ${L.label}`,
        rows: [{ columns: [{ span: [1, 6], blocks: present(cashConversion(ctx, usable(1, 6))) }] }],
        notes: { source: source(ctx.sources.statements), note: standardNote(ctx) },
      }),
    ];
  },
};

export const S8: SectionModule = { id: "S8", name: SECTION, pages: [s8_1, s8_2, s8_3] };
