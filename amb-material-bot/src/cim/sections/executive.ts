// S1 Executive summary (guide 3.3): company at a glance, investment
// considerations, financial snapshot, considerations for buyers. All four are
// always built and never cut (guide 3.5 rule 5).

import { slugs } from "../brief.ts";
import type { CimContext } from "../context.ts";
import { confirm, nonGaap, pageCopy, pageNo, pageRef, PER_MANAGEMENT, resolveCopy, standardNote } from "../context.ts";
import type { CimCopy } from "../copy.ts";
import { wordCount } from "../copy.ts";
import type { Block, TextCell } from "../design.ts";
import { blockHeight, CONTENT_H, r3, SPACE, spanW } from "../design.ts";
import {
  condensedLadder,
  keyFigures,
  keyObservations,
  observationsBlock,
  ownerResponsibilities,
  quickStatsFinancial,
  quickStatsOperating,
  revenueAdjPanels,
  summaryIncomeStatement,
  transactionSummary,
  usable,
} from "../exhibits.ts";
import { chooseTitle, draft, fitProse, present, source, verb } from "./common.ts";
import type { PageModule, SectionModule } from "./types.ts";

const SECTION = "Executive summary";

// --- S1.1 Company at a glance -----------------------------------------------------------------

/** The fact-order overview (guide 3.3 S1.1) from the intake facts, for a deal without drafted copy. */
function overviewFromFacts(ctx: CimContext): string {
  const i = ctx.intake;
  const b = ctx.brief;
  const c = i?.company;
  const parts: string[] = [];
  const what = c?.description ? c.description.charAt(0).toLowerCase() + c.description.slice(1) : confirm(ctx, "what the Company does", "One-line description of the business");
  const where = c?.headquarters ? `based in ${c.headquarters.city}, ${c.headquarters.state}` : confirm(ctx, "headquarters", "Headquarters city and state");
  parts.push(`${ctx.legalName} ("${ctx.short}" or the "Company") provides ${what}, ${where}${c?.serviceArea ? `, and serves ${c.serviceArea}` : ""}.`);
  const founded = c?.founded ? `It was founded in ${c.founded}${i?.owner.name ? ` by ${i.owner.name}` : ""}.` : undefined;
  if (founded) parts.push(founded);
  if (b.has("hc.total")) parts.push(`The Company employs ${b.t("hc.total")} people besides the owner, ${b.t("hc.field")} of them in the field.`);
  else if (b.has("staff.total")) parts.push(`The Company employs ${b.t("staff.total")} people besides the owner (1).`);
  // The mix shares are the brief's (revenue before discounts, adding to 100%), the ones the services page charts.
  const all = ctx.out.periods[ctx.latest.key]!.revenueLines;
  const slugOfLine = new Map(slugs(all.map((l) => l.label)).map((sl, i) => [all[i]!.account, sl]));
  const lines = all.filter((l) => l.amount > 0);
  const shares = lines.flatMap((l) => (b.has(`line.${slugOfLine.get(l.account)}.share0.${ctx.latest.key}`) ? [`${l.label.toLowerCase()} ${b.t(`line.${slugOfLine.get(l.account)}.share0.${ctx.latest.key}`)}`] : []));
  if (shares.length) parts.push(`Revenue was ${b.t("rev.latest")} in ${ctx.latest.label}: ${shares.join(", ")}.`);
  // Optional facts give way, last first, so the paragraph fits the box under the Quick Stats (about 95 words); the
  // transition and the reason for sale go last, since the transaction summary beside the paragraph states both.
  const optional: string[] = [];
  if (founded && c?.founderBackground) optional.push(`${c.founderBackground.replace(/^Founded by .*? after/, "The founder spent")} before starting the Company.`);
  if (ctx.out.customers) optional.push(`The largest customer is ${b.t("cust.largestShare")} of revenue and the top 10 are ${b.t("cust.top10Share")}.`);
  if (c?.ownership) optional.push(`The Company is ${c.ownership.charAt(0).toLowerCase()}${c.ownership.slice(1)}.`);
  const closing = [
    i?.reasonForSale.text ? `The Seller's reason for sale is ${i.reasonForSale.text.charAt(0).toLowerCase()}${i.reasonForSale.text.slice(1)}.` : `Reason for sale: ${confirm(ctx, "reason for sale", "Reason for sale")}.`,
    ...(i?.owner.transition.description ? [`The owner is ${i.owner.transition.description.charAt(0).toLowerCase()}${i.owner.transition.description.slice(1)} (1).`] : []),
  ];
  const text = () => [...parts, ...optional, ...closing].join(" ");
  while (optional.length && wordCount(text()) > 95) optional.pop();
  while (closing.length > 1 && wordCount(text()) > 100) closing.pop();
  return text();
}

const s1_1: PageModule = {
  id: "S1.1",
  name: "Company at a glance",
  status: "A",
  copyKey: "s1_1",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s1_1") ?? fallback11(ctx);
    const lw = usable(1, 7);
    const fin = quickStatsFinancial(ctx, lw);
    const op = quickStatsOperating(ctx, lw);
    const tables = blockHeight(fin, lw) + (op ? SPACE.twoTables + blockHeight(op, lw) : 0) + 0.16;
    const overview = fitProse(ctx, "S1.1 overview", resolveCopy(ctx, copy.overview, "S1.1 overview"), spanW(1, 7), CONTENT_H - tables);
    const txn = transactionSummary(ctx, spanW(8, 12));
    const obs = observationsBlock("Quick Stats", keyObservations(ctx, "S1.1", copy.observations, present(fin, op)));
    const b = ctx.brief;
    const headline = `${ctx.latest.label} Adj. EBITDA was ${b.t("adjEbitda.latest")}, a ${b.t("adjMargin.latest")} margin on ${b.t("rev.latest")} of revenue`;
    const reserve = ctx.mainStreet && (b.value("s3.latest") ?? 0) > 0 ? `, after a ${b.t("s3.latest")} capital reserve` : "";
    const title = chooseTitle(ctx, "S1.1 title", copy.title, [`${headline}${reserve}`, headline]);
    return [
      draft(ctx, {
        id: "S1.1",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 7], blocks: present(fin, op, { kind: "prose", paragraphs: [{ body: overview }] }) }, { span: [8, 12], blocks: present(txn, obs) }] }],
        notes: { source: source(ctx.sources.financials, ctx.sources.customers, ctx.sources.payroll, "Management"), note: standardNote(ctx), footnotes: [PER_MANAGEMENT, nonGaap(ctx)] },
      }),
    ];
  },
  fallback: (ctx) => ({ s1_1: fallback11(ctx) }),
};

function fallback11(ctx: CimContext): NonNullable<CimCopy["s1_1"]> {
  const f0 = ctx.fy[0]!.key;
  const fl = ctx.fy[ctx.fy.length - 1]!.key;
  return {
    overview: overviewFromFacts(ctx),
    observations: [
      // With two fiscal years there is no compound rate, only the year-on-year change; with one, only the level.
      f0 === fl
        ? { row: "qs.revenue", lead: `Revenue was {{rev.latest}} in ${ctx.latest.label},`, body: `${ctx.brief.has("rev.yoy") ? "{{rev.yoy}} on the prior year; " : ""}${confirm(ctx, "growth drivers", "What drove revenue by year")}.` }
        : { row: "qs.revenue", lead: `Revenue went from {{rev.${f0}}} to {{rev.${fl}}},`, body: `${ctx.brief.has("rev.cagr") ? "a {{rev.cagr}} compound rate" : "a {{rev.total}} increase"}; ${confirm(ctx, "growth drivers", "What drove revenue growth by year")}.` },
      ctx.brief.has("gm.delta")
        ? { row: "qs.gm", lead: "Gross margin moved {{gm.delta}} to {{gm.latest}},", body: `driven by ${confirm(ctx, "gross-margin driver", "What moved gross margin")}.` }
        : { row: "qs.gm", lead: "Gross margin was {{gm.latest}},", body: `with cost of revenue at {{cogsPct.latest}} of revenue; ${confirm(ctx, "gross-margin driver", "What drives gross margin")}.` },
      { row: "qs.adj", lead: "Adj. EBITDA margin was {{adjMargin.latest}}", body: `after {{adjTotal.latest}} of adjustments (${pageRef("S7.2")}).` },
    ],
  };
}

// --- S1.2 Investment considerations --------------------------------------------------------------

const s1_2: PageModule = {
  id: "S1.2",
  name: "Investment considerations",
  status: "A",
  copyKey: "s1_2",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s1_2") ?? fallbackConsiderations(ctx);
    const lw = usable(1, 8);
    const rows: TextCell[][] = copy.considerations.map((c) => [{ lead: resolveCopy(ctx, c.lead, "S1.2"), body: resolveCopy(ctx, c.evidence, "S1.2") }, pageNo(c.page)]);
    // The list is the page's only left-hand exhibit, so it takes the largest body size that still fits the column.
    const listAt = (fontSize: number): Block => ({ kind: "textTable", header: { title: "Investment considerations", units: "(each proved on the page shown)" }, spec: { colW: [r3(lw - 0.55), 0.55], head: ["Consideration and evidence", "Page"], rows, aligns: ["left", "right"], fontSize, firstBold: false } });
    const list = [10.5, 10].map(listAt).find((b) => blockHeight(b, lw) <= CONTENT_H) ?? listAt(9.5);
    const rw = spanW(9, 12);
    const b = ctx.brief;
    const growth = b.has("rev.cagr") ? `grew at a ${b.t("rev.cagr")} CAGR to` : b.has("rev.yoy") ? `${verb(b.value("rev.yoy"))} ${b.t("rev.yoy")} to` : "reached";
    const title = chooseTitle(ctx, "S1.2 title", copy.title, `Revenue ${growth} ${b.t("rev.latest")} and Adj. EBITDA reached ${b.t("adjEbitda.latest")} in ${ctx.latest.label}`);
    return [
      draft(ctx, {
        id: "S1.2",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 8], blocks: [list] }, { span: [9, 12], blocks: [revenueAdjPanels(ctx, true), keyFigures(ctx, rw, "(2)")] }] }],
        // The headline Adj. EBITDA is after the capital reserve; the page says so and gives the pre-reserve figure (QA round 1 F35).
        notes: { source: source(ctx.sources.financials, ctx.sources.customers, ctx.sources.payroll, "Management"), note: standardNote(ctx), footnotes: [PER_MANAGEMENT, nonGaap(ctx)] },
      }),
    ];
  },
  fallback: (ctx) => ({ s1_2: fallbackConsiderations(ctx) }),
};

function fallbackConsiderations(ctx: CimContext): NonNullable<CimCopy["s1_2"]> {
  const b = ctx.brief;
  const items: NonNullable<CimCopy["s1_2"]>["considerations"] = [
    { lead: `Revenue reached {{rev.latest}} in ${ctx.latest.label}${b.has("rev.yoy") ? `, ${b.value("rev.yoy")! < 0 ? "down" : "up"} {{rev.yoy}} on the prior year` : ""}.`, evidence: `The growth came from ${confirm(ctx, "growth drivers", "Principal drivers of revenue growth")}.`, page: "S6.1" },
    { lead: `Gross margin was {{gm.latest}} in ${ctx.latest.label}.`, evidence: `Cost of revenue was {{cogsPct.latest}} of revenue; the pricing basis is ${confirm(ctx, "pricing basis", "How the Company prices its work")}.`, page: "S6.3" },
    { lead: `Adj. EBITDA was {{adjEbitda.latest}}, a {{adjMargin.latest}} margin.`, evidence: `Every adjustment from Reported EBITDA of {{repEbitda.latest}} is itemized with its evidence.`, page: "S7.1" },
  ];
  if (b.has("cust.largestShare")) items.push({ lead: "The largest customer is {{cust.largestShare}} of revenue.", evidence: "The top 10 customers are {{cust.top10Share}} of revenue.", page: "S4.1" });
  if (b.has("hc.total")) items.push({ lead: "{{hc.total}} employees besides the owner, {{hc.field}} in the field.", evidence: `Payroll excluding the owner was {{payrollPct.latest}} of revenue in ${ctx.latest.label}.`, page: "S5.1" });
  else if (b.has("staff.total")) items.push({ lead: "{{staff.total}} employees besides the owner (1).", evidence: `Payroll excluding the owner was {{payrollPct.latest}} of revenue in ${ctx.latest.label}.`, page: "S5.1" });
  const transition = ctx.intake?.owner.transition.description;
  if (b.has("owner.transitionMonths") && transition) items.push({ lead: "The owner offers up to {{owner.transitionMonths}} months of transition after closing (1).", evidence: `${transition} (1).`, page: "S10.1" });
  if (items.length < 5) items.push({ lead: `Reported EBITDA was {{repEbitda.latest}} in ${ctx.latest.label}.`, evidence: "Net income plus interest, taxes and depreciation, per the Company's financial statements.", page: "S7.1" });
  if (items.length < 5) items.push({ lead: `The Seller offers a transition after closing.`, evidence: `${confirm(ctx, "transition terms", "Owner transition terms")}`, page: "S10.1" });
  return { considerations: items.slice(0, 7) };
}

// --- S1.3 Financial snapshot -------------------------------------------------------------------------

const s1_3: PageModule = {
  id: "S1.3",
  name: "Financial snapshot",
  status: "A",
  copyKey: "s1_3",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s1_3") ?? fallbackSnapshot(ctx);
    const is = summaryIncomeStatement(ctx, usable(1, 6));
    const ladder = condensedLadder(ctx, spanW(7, 12));
    const pnlObs = observationsBlock("the income statement", keyObservations(ctx, "S1.3", copy.pnl, [is]));
    const ladderObs = observationsBlock("the EBITDA ladder", keyObservations(ctx, "S1.3", copy.ladder, [ladder]).map((o, i) => ({ ...o, key: String.fromCharCode(65 + (copy.pnl?.length ?? 0) + i) })));
    // The ladder's letters continue after the income statement's, so the two lists never repeat a letter on one page.
    if (ladderObs && ladder.kind === "numTable") {
      const shift = copy.pnl?.length ?? 0;
      for (const r of ladder.spec.rows) if (r.obs) r.obs = String.fromCharCode(r.obs.charCodeAt(0) + shift);
    }
    const b = ctx.brief;
    const title = chooseTitle(
      ctx,
      "S1.3 title",
      copy.title,
      ctx.mainStreet
        ? [
            `Reported EBITDA of ${b.t("repEbitda.latest")} becomes SDE of ${b.t("sde.latest")} and Adj. EBITDA of ${b.t("adjEbitda.latest")} in ${ctx.latest.label}`,
            `Reported EBITDA of ${b.t("repEbitda.latest")} becomes SDE of ${b.t("sde.latest")} in ${ctx.latest.label}, and Adj. EBITDA of ${b.t("adjEbitda.latest")} after owner pay at market`,
          ]
        : `Reported EBITDA of ${b.t("repEbitda.latest")} becomes Adj. EBITDA of ${b.t("adjEbitda.latest")} in ${ctx.latest.label}`,
    );
    return [
      draft(ctx, {
        id: "S1.3",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 6], blocks: present(is, pnlObs) }, { span: [7, 12], blocks: present(ladder, ladderObs) }] }],
        notes: { source: source(ctx.sources.financials, "general ledger detail"), note: standardNote(ctx), footnotes: [nonGaap(ctx)] },
      }),
    ];
  },
  fallback: (ctx) => ({ s1_3: fallbackSnapshot(ctx) }),
};

function fallbackSnapshot(ctx: CimContext): NonNullable<CimCopy["s1_3"]> {
  const b = ctx.brief;
  // Without a prior-year window the observations state the level only.
  return {
    pnl: [
      b.has("rev.yoy")
        ? { row: "snap.revenue", lead: `Revenue {{rev.yoy}} ${b.value("rev.yoy")! < 0 ? "lower" : "higher"} in ${ctx.latest.label},`, body: `at {{rev.latest}}; ${confirm(ctx, "revenue drivers", "Principal drivers of revenue growth")}.` }
        : { row: "snap.revenue", lead: `Revenue of {{rev.latest}} in ${ctx.latest.label};`, body: `${confirm(ctx, "revenue drivers", "Principal drivers of revenue")}.` },
      { row: "snap.gm", lead: "Gross margin {{gm.latest}},", body: `${b.has("gm.deltaYoy") ? "{{gm.deltaYoy}} on the prior year; " : ""}${confirm(ctx, "gross-margin driver", "What moved gross margin")}.` },
    ],
    ladder: [
      { row: "cl.norm", lead: "Normalization adjustments of {{normTotal.latest}}", body: `are listed with their evidence on ${pageRef("S7.2")}.` },
      { row: "cl.adj", lead: "Adj. EBITDA of {{adjEbitda.latest}}", body: "is a {{adjMargin.latest}} margin; nothing pro forma is included unless shown." },
    ],
  };
}

// --- S1.4 Considerations for buyers ------------------------------------------------------------------

/** The mandatory Financial reporting row (spec 4.6): what the books are, and the records the data room holds to reconcile them. */
function financialReportingRow(ctx: CimContext): TextCell[] {
  const b = ctx.brief;
  const lastFy = ctx.fy[ctx.fy.length - 1]!;
  const basis = ctx.ds.booksBasis ? `${ctx.ds.booksBasis} basis` : confirm(ctx, "books basis", "Cash or accrual basis of the books");
  const bookkeeper = ctx.ds.payroll?.employees.some((e) => /bookkeep|controller|accountant/i.test(e.role) && !e.terminationDate);
  const deposits = b.has(`bank.depositsPct.${lastFy.key}`) ? ` Operating bank deposits of ${b.t(`bank.deposits.${lastFy.key}`)} were ${b.t(`bank.depositsPct.${lastFy.key}`)} of ${lastFy.label} revenue.` : "";
  const shows = `${ctx.sources.financials}, ${basis}, unaudited${bookkeeper ? ", kept by an in-house bookkeeper" : ""}.${deposits}`;
  const records = [
    ctx.ds.monthly ? "monthly financial statements" : "annual financial statements",
    "general-ledger account detail",
    ctx.ds.depositsByMonth ? "bank statements" : "",
    ctx.ds.payroll ? "the payroll register" : "",
    ctx.ds.customers ? `the ${ctx.ds.customers.term.toLowerCase()} list` : "",
  ].filter(Boolean);
  const addressed = `The data room holds ${records.slice(0, -1).join(", ")} and ${records[records.length - 1]} for reconciliation; federal tax returns are ${confirm(ctx, "requested", "Federal tax returns for the fiscal years shown, for the data room")}.`;
  return ["Financial reporting", shows, addressed];
}

const s1_4: PageModule = {
  id: "S1.4",
  name: "Considerations for buyers",
  status: "A",
  copyKey: "s1_4",
  absent: () => undefined,
  budget: [1, 1],
  build(ctx) {
    const copy = pageCopy(ctx, "s1_4") ?? fallbackBuyer(ctx);
    const w = spanW(1, 12);
    const rows: TextCell[][] = copy.rows.map((r) => [r.consideration, resolveCopy(ctx, r.shows, "S1.4"), resolveCopy(ctx, r.addressed, "S1.4")]);
    rows.push(financialReportingRow(ctx));
    const table: Block = { kind: "textTable", header: { title: "Considerations for buyers", units: `(${ctx.latest.label} unless noted)` }, spec: { colW: [1.7, 5.4, r3(w - 7.1)], head: ["Consideration", "What the data shows", "How it is addressed"], rows, fontSize: 8.5 } };
    const owner = ctx.present.has("S5.4") && ctx.carried.get("S1.4")?.includes("S5.4") ? ownerResponsibilities(ctx, usable(1, 8)) : undefined;
    const obs = owner ? observationsBlock("owner responsibilities", keyObservations(ctx, "S1.4", copy.observations, [owner])) : undefined;
    const b = ctx.brief;
    const n = rows.length;
    // The two tests a buyer asks about first, each named by its figure; the adjustments stand in for either one missing.
    const tests = [
      b.has("owner.hours") ? `the owner's ${b.t("owner.hours")}-hour week` : undefined,
      b.has("cust.top10Share") ? `a ${b.t("cust.top10Share")} top-10 share` : `${b.t("adjTotal.latest")} of adjustments`,
    ].filter(Boolean);
    const lead = `, led by ${tests.join(" and ")}`;
    const title = chooseTitle(ctx, "S1.4 title", copy.title, `${["Three", "Four", "Five", "Six", "Seven"][n - 3] ?? n} buyer tests${lead}, and how each is addressed`);
    return [
      draft(ctx, {
        id: "S1.4",
        section: SECTION,
        title,
        rows: [{ columns: [{ span: [1, 12], blocks: [table] }] }, { columns: [{ span: [1, 8], blocks: present(owner) }, { span: [9, 12], blocks: present(obs) }] }],
        notes: {
          source: source(ctx.sources.financials, ctx.sources.customers, ctx.sources.bank, "Management"),
          note: `Figures in USD unless noted. Adjustment references are defined on ${pageRef("S7.2")}.`,
          footnotes: [`${PER_MANAGEMENT}${ctx.intake?.owner.hoursPerWeek ? " Hours are the owner's estimate of a typical week." : ""}`],
        },
        carries: owner ? ["S5.4"] : [],
      }),
    ];
  },
  fallback: (ctx) => ({ s1_4: fallbackBuyer(ctx) }),
};

function fallbackBuyer(ctx: CimContext): NonNullable<CimCopy["s1_4"]> {
  const b = ctx.brief;
  const rows: NonNullable<CimCopy["s1_4"]>["rows"] = [
    {
      consideration: "Owner involvement",
      shows: ctx.intake?.owner.hoursPerWeek ? `The owner works about {{owner.hours}} hours a week (1).` : `The owner's weekly role is ${confirm(ctx, "owner hours and duties", "Owner's hours per week and duties")}.`,
      addressed: ctx.intake?.owner.transition.description ? `${ctx.intake.owner.transition.description} (1).` : `${confirm(ctx, "transition plan", "Owner transition plan")}.`,
    },
  ];
  if (b.has("cust.largestShare")) rows.push({ consideration: "Customer concentration", shows: "The largest customer is {{cust.largestShare}} of revenue and the top 10 are {{cust.top10Share}}.", addressed: `Losing the largest customer in full would remove {{cust.largestRevenue}} of revenue${b.has("rev.change") && (b.value("rev.change") ?? 0) > 0 ? ` against ${ctx.latest.label} growth of {{rev.change}}` : `, {{cust.largestShare}} of the total`}.` });
  const staff = b.has("hc.total") ? "{{hc.total}} employees besides the owner, {{hc.field}} in the field" : b.has("staff.total") ? "{{staff.total}} employees besides the owner (1)" : undefined;
  if (staff) {
    const keep = ctx.intake?.management.find((m) => m.postCloseIntent === "stays");
    rows.push({
      consideration: "Workforce",
      shows: `${staff}; payroll excluding the owner was {{payrollPct.latest}} of revenue in ${ctx.latest.label}.`,
      addressed: `${keep ? `${keep.name}, ${keep.role.toLowerCase()}, is expected to stay after closing (1); ` : ""}retention arrangements for key employees are ${confirm(ctx, "retention arrangements", "Retention or employment arrangements for key employees after closing")}.`,
    });
  }
  rows.push({ consideration: "Add-back quality", shows: `Adjustments total {{adjTotal.latest}} in ${ctx.latest.label}, from Reported EBITDA of {{repEbitda.latest}} to Adj. EBITDA of {{adjEbitda.latest}}.`, addressed: `Each adjustment is listed with its basis and evidence on ${pageRef("S7.2")}.${ctx.brief.has("adj.repOnly.bps") ? ` Excluding the {{adj.repOnly.latest}} resting on management representation ({{adj.repOnly.refs}}) lowers the ${ctx.latest.label} Adj. EBITDA margin by {{adj.repOnly.bps}}.` : ""}` });
  return {
    rows,
    observations: [{ row: "owner.total", lead: ctx.intake?.owner.hoursPerWeek ? "About {{owner.hours}} hours a week of owner duties (1)" : "The owner's responsibilities", body: `pass to ${confirm(ctx, "successors", "Who takes each owner responsibility after closing")} after closing.` }, { row: "", lead: `Market replacement compensation of {{s2.latest}}`, body: "is already deducted in Adj. EBITDA for a general manager." }],
  };
}

export const S1: SectionModule = { id: "S1", name: SECTION, pages: [s1_1, s1_2, s1_3, s1_4] };

