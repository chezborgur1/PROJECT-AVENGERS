// S10 Transaction process (guide 3.3): the transaction overview in fact
// order, ICP1's eight process stages and the contact block. The process and
// contact merge onto the overview page when they fit, in place of the term
// table, whose facts the executive summary's Transaction summary already
// states (QA round 1 F30, F43); otherwise the overview keeps its term table
// and the process gets its own page. Never a valuation, multiple,
// cash-at-close or earnout row (guide D5). AMB Advisory speaks in the first
// person only here (guide 4.1).

import type { CimContext } from "../context.ts";
import { confirm, pageCopy, PER_MANAGEMENT, resolveCopy } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import type { Block, TextCell } from "../design.ts";
import { r3, spanW } from "../design.ts";
import { termTable } from "../exhibits.ts";
import { chooseTitle, draft, source } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Transaction process";

const s10_1: PageModule = {
  id: "S10.1",
  name: "Transaction overview",
  status: "A",
  copyKey: "s10_1",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s10_1") ?? fallback101(ctx);
    const where = "S10.1";
    const prose: Block = {
      kind: "prose",
      paragraphs: [
        { lead: "The offering.", body: resolveCopy(ctx, copy.transaction, where) },
        { lead: "Transition and people.", body: resolveCopy(ctx, copy.transition, where) },
        { lead: "Premises, fleet and systems.", body: resolveCopy(ctx, copy.premises, where) },
        { lead: "How to proceed.", body: resolveCopy(ctx, copy.process, where) },
      ],
    };
    const owner = ctx.intake?.owner;
    const months = owner?.transition.months;
    const title = chooseTitle(
      ctx,
      "S10.1 title",
      copy.title,
      `${owner?.name ?? "The Seller"} is offering ${ctx.assetSale ? "the operating assets" : "100% of the Company"}${months ? ` with up to ${months} months of transition` : ""}${ctx.intake?.transaction.timing ? `, targeting a closing within ${/12 months/.test(ctx.intake.transaction.timing) ? "12 months" : ctx.intake.transaction.timing}` : ""}`,
    );
    const merged = ctx.carried.get("S10.1")?.includes("S10.2") ?? false;
    const rows = merged
      ? [{ columns: [{ span: [1, 7] as [number, number], blocks: [prose, contactTable(ctx, spanW(1, 7), false)] }, { span: [8, 12] as [number, number], blocks: [processTable(ctx, spanW(8, 12))] }] }]
      : [{ columns: [{ span: [1, 7] as [number, number], blocks: [prose] }, { span: [8, 12] as [number, number], blocks: [termTable(ctx, spanW(8, 12))] }] }];
    return [
      draft(ctx, {
        id: "S10.1",
        section: SECTION,
        title,
        rows,
        notes: { source: source("Management"), note: "Terms are the Seller's current intentions and are subject to a definitive agreement.", footnotes: [PER_MANAGEMENT] },
        carries: merged ? ["S10.2"] : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s10_1: fallback101(ctx) }),
};

function fallback101(ctx: CimContext): NonNullable<CimCopy["s10_1"]> {
  const i = ctx.intake;
  const owner = i?.owner.name ?? "The Seller";
  const offer = ctx.assetSale
    ? `${owner} is offering substantially all of the operating assets of ${ctx.legalName}, free and clear of liens. The Seller retains cash, receivables and payables.`
    : `${owner} is offering 100% of ${ctx.legalName}. Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close.`;
  return {
    transaction: `${offer} ${i?.reasonForSale.text ? `The reason for sale is ${i.reasonForSale.text.charAt(0).toLowerCase()}${i.reasonForSale.text.slice(1)} (1).` : `Reason for sale: ${confirm(ctx, "reason for sale", "Reason for sale")}.`}`,
    transition: i?.owner.transition.description ? `${owner} is ${i.owner.transition.description.charAt(0).toLowerCase()}${i.owner.transition.description.slice(1)} (1).` : `${confirm(ctx, "transition", "Owner transition offer")}.`,
    premises: i?.locations[0] ? `The Company operates from ${i.locations[0].name}${i.locations[0].leaseExpiry ? `, leased through ${i.locations[0].leaseExpiry}` : ""} (1).` : `${confirm(ctx, "premises", "Premises and lease terms")}.`,
    process: "Qualified buyers who have signed a confidentiality agreement may request a management meeting through AMB Advisory. All inquiries should be directed to AMB Advisory.",
  };
}

/**
 * ICP1's eight stages verbatim, with AMB's post-LOI wording for stages 6 to 8
 * (guide S10.2). A target date follows its stage's text rather than sitting in
 * a column that five of eight stages leave blank (spec 14: no empty columns).
 */
function processRows(ctx: CimContext): TextCell[][] {
  const n = ctx.out.namedOutputs;
  const date = (d: string | null, what: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : confirm(ctx, "date", what));
  const timing = ctx.intake?.transaction.timing;
  const close = n.EffectiveDate ? `Target: ${date(n.EffectiveDate, "")}.` : timing ? `Seller's target: ${timing.charAt(0).toLowerCase()}${timing.slice(1)} (1).` : `Target: ${confirm(ctx, "date", "Target effective date")}.`;
  return [
    ["1", "NDA Execution", "Prospective buyer executes AMB Advisory's standard NDA to receive full financial package and data room access."],
    ["2", "Initial Call", "AMB Advisory schedules an introductory call with the prospective buyer to review the opportunity and answer preliminary questions."],
    ["3", "Buyer Q&A / IOI", "Buyer submits written questions or an Indication of Interest (IOI) with preliminary valuation range and proposed structure."],
    ["4", "Management Meeting", "Qualified buyers are introduced to the Seller for a formal management meeting / Q&A session."],
    ["5", "LOI Submission", `Buyer submits a non-binding Letter of Intent (LOI) with proposed purchase price, structure, and key terms. Target: ${date(n.LOIDate, "Target LOI date")}.`],
    ["6", "Due Diligence", "Confirmatory diligence, definitive agreements and transition planning (about 9–11 weeks from LOI)."],
    ["7", "Purchase Agreement", `Sign the definitive Purchase Agreement and fund the escrow account. Target: ${date(n.SigningDate, "Target signing date")}.`],
    ["8", "Close & Transition", `Effective closing date set with tax counsel; the Seller begins the agreed transition period. ${close}`],
  ];
}

function processTable(ctx: CimContext, w: number): Block {
  return {
    kind: "textTable",
    header: { title: "Process and next steps" },
    spec: { colW: [0.3, 1.45, r3(w - 0.3 - 1.45)], head: ["#", "Stage", "What happens"], rows: processRows(ctx), firstBold: false, boldRows: [4, 6, 7], fontSize: 9 },
  };
}

/** The contact block: one firm header over its details. Standing alone it carries the no-contact note, which the overview's prose states when the two share a page. */
function contactTable(ctx: CimContext, w: number, withNote: boolean): Block {
  const f = ctx.firm;
  return {
    kind: "textTable",
    header: { title: "Contact" },
    spec: {
      colW: [1.0, r3(w - 1.0)],
      head: ["Firm", "AMB Advisory Services LLC"],
      rows: [
        ["Contact", f.contact || confirm(ctx, "contact", "Principal's name and title for the contact block (guide Q6)")],
        ["Phone", f.phone || "813.364.2178"],
        ["Email", f.email || "info@ambadvisoryservices.com"],
        ["Office", "Tampa, Florida; ambadvisoryservices.com"],
        ...(withNote ? [["Note", "All inquiries should be directed to AMB Advisory. Do not contact the Seller or its employees directly."]] : []),
      ],
      fontSize: 9,
    },
  };
}

const s10_2: PageModule = {
  id: "S10.2",
  name: "Process and next steps",
  status: "A",
  absent: () => undefined,
  mergeInto: (ctx) => (ctx.present.has("S10.1") ? "S10.1" : undefined),
  budget: [1, 1],
  build(ctx) {
    return [
      draft(ctx, {
        id: "S10.2",
        section: SECTION,
        title: "Process and next steps",
        rows: [{ columns: [{ span: [1, 8], blocks: [processTable(ctx, spanW(1, 8))] }, { span: [9, 12], blocks: [contactTable(ctx, spanW(9, 12), true)] }] }],
        notes: { source: "AMB Advisory.", footnotes: ctx.intake?.transaction.timing ? [PER_MANAGEMENT] : [] },
        kind: "reference",
      }),
    ];
  },
};

export const S10: SectionModule = { id: "S10", name: SECTION, pages: [s10_1, s10_2] };
