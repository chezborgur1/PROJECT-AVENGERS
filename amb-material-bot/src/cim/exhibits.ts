// The exhibit library (design spec 8): each exhibit is a function of the
// context with fixed columns, returning a Block the layout engine measures
// and the renderer draws. Every figure is read from ModelOutput (or, for
// descriptive columns, from the dataset's intake facts and coded customer
// list) and formatted by src/util/format.ts, so a table, a chart and the
// title above them agree to the last digit shown (guide 4.8). An exhibit
// whose data is absent is never built from placeholders: the function
// returns undefined and the section module falls back (spec 14).

import type { Adjustment, KpiSeries } from "../domain/financials.ts";
import { monthLabel } from "../domain/financials.ts";
import type { Ladder, PeriodColumn, PeriodValues } from "../model/types.ts";
import { cagr, describeDelta, EN_DASH, fmtBps, fmtCount, fmtGrowth, fmtMoney, fmtPct, fyRange, k, toK, wholeShares } from "../util/format.ts";
import { accountLabel, fmtKpi, latestKpi, MIN_PAY_GROUP, revenueMix } from "./brief.ts";
import type { CimContext } from "./context.ts";
import { at, confirm, fieldDepartments, pageRef, population, resolveCopy, tableColumns } from "./context.ts";
import type { Observation } from "./copy.ts";
import type { Block, ExhibitHeader, NumCol, NumRow, NumTableSpec, ObsItem, TextCell, TextTableSpec } from "./design.ts";
import { GAP, r3, spanW } from "./design.ts";

// ---------------------------------------------------------------------------
// Cell and column helpers
// ---------------------------------------------------------------------------

/** Table percentage: 1 dp for margins, growth and shares; "n.m." when not meaningful. */
const pc = (v: number, dp = 1): string => (Number.isFinite(v) ? fmtPct(v, dp) : "n.m.");

/** Short column head for growth: "FY25 y/y", "LTM y/y". */
const yoyHead = (c: PeriodColumn): string => (c.ref.kind === "fiscal_year" ? `FY${String(c.fiscalYear).slice(2)} y/y` : `${c.group} y/y`);

/** Usable width of a column block: the span less 0.10 clear of the gutter hairline (spec 1). */
export const usable = (a: number, b: number, twoColumn = true): number => r3(spanW(a, b) - (twoColumn ? 0.1 : 0));

/**
 * Period columns in the 5.2 order, grouped: fiscal years under "Fiscal year",
 * LTM under "LTM", PF under "PF", with a white gap column between groups.
 */
function periodCols(cols: PeriodColumn[], w: number): NumCol[] {
  const out: NumCol[] = [];
  let group: string | undefined;
  for (const c of cols) {
    const g = c.ref.kind === "fiscal_year" ? "Fiscal year" : c.group;
    if (group && g !== group) out.push({ w: GAP, kind: "gap" });
    out.push({ w, kind: "num", head: c.label, group: g });
    group = g;
  }
  return out;
}

const widthOf = (cols: NumCol[]): number => r3(cols.reduce((s, c) => s + c.w, 0));

/** Clearance a table keeps inside its exhibit rule (spec 1: the hairline, not a ragged gap). */
const TABLE_CLEARANCE = 0.1;
/** Widest a label column grows to fill its block before the figures share the rest. */
const LABEL_MAX = 2.8;

/**
 * Fit a numeric table's columns into `max` inches: first narrow the label and
 * text columns, then the figures, then drop the analytic columns named in
 * `droppable` (CAGR before y/y). A table narrower than its block widens to
 * it, less the hairline clearance (spec 1, 9): its text column takes the
 * room, else the label column up to LABEL_MAX, then the figures share what
 * is left. Returns the columns and the heads kept.
 */
function fitCols(cols: NumCol[], max: number, droppable: string[] = []): NumCol[] {
  let out = cols.map((c) => ({ ...c }));
  const shrink = (kind: NumCol["kind"], min: number) => {
    for (const c of out) {
      const over = widthOf(out) - max;
      if (over <= 0) return;
      if (c.kind === kind && c.w > min) c.w = r3(Math.max(min, c.w - over));
    }
  };
  shrink("text", 1.0);
  shrink("label", 1.4);
  shrink("num", 0.58);
  for (const head of droppable) {
    if (widthOf(out) <= max) break;
    const i = out.findIndex((c) => c.head === head);
    if (i < 0) continue;
    out.splice(i, 1);
  }
  // A gap separates two blocks of figures; one left with no figures after it would print a detached stub (spec 4.1 [F]).
  out = out.filter((c, j) => c.kind !== "gap" || (out[j - 1]?.kind === "num" && out[j + 1]?.kind === "num"));
  if (widthOf(out) > max + 0.005) throw new Error(`Table does not fit ${max.toFixed(2)} in: ${widthOf(out).toFixed(2)} in`);
  const short = () => r3(max - TABLE_CLEARANCE - widthOf(out));
  const text = out.find((c) => c.kind === "text");
  if (short() > 0 && text) text.w = r3(text.w + short());
  const label = out.find((c) => c.kind === "label");
  if (short() > 0 && label && label.w < LABEL_MAX) label.w = r3(Math.min(LABEL_MAX, label.w + short()));
  const nums = out.filter((c) => c.kind === "num");
  if (short() > 0 && nums.length) {
    const each = Math.floor((short() / nums.length) * 1000) / 1000;
    for (const c of nums) c.w = r3(c.w + each);
  }
  return out;
}

/** Figures for a row across columns. `$` on first and total rows only (spec 4.1). */
const kv = (ps: PeriodValues[], get: (p: PeriodValues) => number, dollar = false): string[] => ps.map((p) => k(get(p), { dollar }));
const pv = (ps: PeriodValues[], get: (p: PeriodValues) => number, dp = 1): string[] => ps.map((p) => pc(get(p), dp));

/** A bridge label with its sign: "(+) Interest expense", "(–) Market replacement compensation". */
const signed = (label: string, amount: number): string => `${amount < 0 ? `(${EN_DASH})` : "(+)"} ${label}`;

/** Every numeric column of a table keyed by head, so analytic cells can be looked up by name after a fit. */
function analytic(cols: NumCol[], head: string): boolean {
  return cols.some((c) => c.head === head);
}

// ---------------------------------------------------------------------------
// Observations: letters keyed to table rows (spec 4.4)
// ---------------------------------------------------------------------------

function rowKeysOf(b: Block): string[] {
  if (b.kind === "numTable") return b.spec.rows.map((r) => r.key ?? "");
  if (b.kind === "textTable") return b.spec.rowKeys ?? [];
  return [];
}

/**
 * Letter the observations A, B, C in the order of the rows they key across
 * the page's exhibits (observations keyed to no row go last), write each
 * letter into the keyed row's Obs. cell, and return the list items.
 */
export function keyObservations(ctx: CimContext, where: string, obs: Observation[] | undefined, blocks: Block[]): ObsItem[] {
  if (!obs?.length) return [];
  const order = new Map<string, number>();
  let n = 0;
  for (const b of blocks) for (const key of rowKeysOf(b)) if (key && !order.has(key)) order.set(key, n++);
  const sorted = obs.map((o, i) => ({ o, pos: order.get(o.row) ?? 1000 + i })).sort((a, b) => a.pos - b.pos);
  return sorted.map(({ o }, i) => {
    const letter = String.fromCharCode(65 + i);
    if (o.row && order.has(o.row)) {
      for (const b of blocks) {
        if (b.kind === "numTable") {
          const row = b.spec.rows.find((r) => r.key === o.row);
          if (row && !row.obs) row.obs = letter;
        } else if (b.kind === "textTable" && b.spec.obsCol !== undefined && b.spec.rowKeys) {
          const ri = b.spec.rowKeys.indexOf(o.row);
          if (ri >= 0 && !b.spec.rows[ri]![b.spec.obsCol]) b.spec.rows[ri]![b.spec.obsCol] = letter;
        }
      }
    } else if (o.row) ctx.log.push(`${where}: observation keyed to unknown row "${o.row}"`);
    return { key: letter, lead: resolveCopy(ctx, o.lead, where), body: resolveCopy(ctx, o.body, where) };
  });
}

export function observationsBlock(keyed: string, items: ObsItem[]): Block | undefined {
  return items.length ? { kind: "observations", header: { title: "Observations", units: `(keyed to ${keyed})` }, items } : undefined;
}

// ---------------------------------------------------------------------------
// Executive summary: Quick Stats, transaction summary, key figures
// ---------------------------------------------------------------------------

/** Columns for the headline tables: three fiscal years, or FY-1, FY and LTM when LTM differs from the fiscal year. */
function headlineCols(ctx: CimContext): PeriodColumn[] {
  return ctx.ltm ? [...ctx.fy.slice(-2), ctx.ltm] : ctx.fy;
}

/**
 * The Quick Stats growth column, headed by the growth it computes: LTM y/y
 * when the LTM has its prior-year window, else the CAGR over three fiscal
 * years, else the latest fiscal year on the one before. None when the table
 * has no like-for-like pair (one fiscal year and an LTM without its prior
 * year), since an LTM against an overlapping fiscal year is no growth rate.
 */
function headlineGrowth(ctx: CimContext): { head: string; of: (get: (p: PeriodValues) => number) => string } | undefined {
  const fy = ctx.fy;
  const span = fy.length - 1;
  if (ctx.ltm) {
    const [prior, ltm] = [ctx.prior, ctx.ltm];
    return prior ? { head: "LTM y/y", of: (get) => fmtGrowth(get(at(ctx, prior)), get(at(ctx, ltm))) } : undefined;
  }
  if (span >= 2) return { head: "CAGR", of: (get) => pc(cagr(get(at(ctx, fy[0]!)), get(at(ctx, fy[span]!)), span)) };
  if (span === 1) return { head: yoyHead(fy[1]!), of: (get) => fmtGrowth(get(at(ctx, fy[0]!)), get(at(ctx, fy[1]!))) };
  return undefined;
}

const capFirst = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** Quick Stats, financial block (spec 8): three periods, CAGR or LTM y/y, Context, Obs. */
export function quickStatsFinancial(ctx: CimContext, w: number): Block {
  const cols = headlineCols(ctx);
  const ps = cols.map((c) => at(ctx, c));
  const last = ps[ps.length - 1]!;
  const growth = headlineGrowth(ctx);
  const g = (get: (p: PeriodValues) => number): string[] => (growth ? [growth.of(get)] : []);
  const blank = growth ? [""] : [];
  const b = ctx.brief;
  const lastLabel = cols[cols.length - 1]!.label;
  // The margin's move is taken over the same pair as the growth column, or from the first fiscal year shown.
  const marginMove = ctx.ltm && b.has("adjMargin.deltaYoy") ? `${capFirst(b.t("adjMargin.deltaYoy"))} on ${ctx.prior!.label}` : b.has("adjMargin.delta") ? `${capFirst(b.t("adjMargin.delta"))} since ${ctx.fy[0]!.label}` : "";
  const rows: NumRow[] = [
    { type: "line", key: "qs.revenue", label: "Revenue", vals: [...kv(ps, (p) => p.pnl.revenue, true), ...g((p) => p.pnl.revenue)], text: b.has("rev.yoy") ? `${b.value("rev.yoy")! < 0 ? "Down" : "Up"} ${b.t("rev.yoy")} in ${lastLabel}` : "" },
    { type: "ratio", key: "qs.gm", label: "% gross margin", vals: [...pv(ps, (p) => p.pnl.grossProfit / p.pnl.revenue), ...blank], text: `Cost of revenue ${b.t("cogsPct.latest")} of revenue` },
    { type: "line", key: "qs.reported", label: "Reported EBITDA", vals: [...kv(ps, (p) => p.ladder.reportedEbitda), ...g((p) => p.ladder.reportedEbitda)], text: "Before interest, taxes and D&A" },
    { type: "ratio", key: "qs.repMargin", label: "% margin", vals: [...pv(ps, (p) => p.ladder.reportedMargin), ...blank], text: "" },
    // Adj. EBITDA here is after the capital reserve [S3] (guide 5.4), below the pre-capex figure a buyer may compare on: the context says so.
    { type: "key", key: "qs.adj", label: "Adj. EBITDA", note: "2", vals: [...kv(ps, (p) => p.ladder.adjEbitda, true), ...g((p) => p.ladder.adjEbitda)], text: last.ladder.capitalReserve ? `After ${b.t("s3.latest")} reserve [S3]` : `${b.t("adjTotal.latest")} of adjustments (${pageRef("S7.1")})` },
    { type: "ratio", key: "qs.adjMargin", label: "% margin", vals: [...pv(ps, (p) => p.ladder.adjMargin), ...blank], text: marginMove },
  ];
  if (ctx.mainStreet) {
    rows.push(
      { type: "line", key: "qs.sde", label: "Seller's discretionary earnings", note: "2", vals: [...kv(ps, (p) => p.ladder.sde), ...g((p) => p.ladder.sde)], text: "Before replacement pay and reserve" },
      { type: "ratio", key: "qs.sdeMargin", label: "% margin", vals: [...pv(ps, (p) => p.ladder.sdeMargin), ...blank], text: "" },
    );
  }
  const base: NumCol[] = [
    { w: 2.0, kind: "label" },
    ...cols.map((c): NumCol => ({ w: 0.62, kind: "num", head: c.label, group: "Fiscal year" })),
    ...(growth ? [{ w: GAP, kind: "gap" } as NumCol, { w: 0.62, kind: "num", head: growth.head, group: "Growth" } as NumCol] : []),
    { w: 2.25, kind: "text", head: "Context" },
    { w: 0.36, kind: "obs", head: "Obs." },
  ];
  if (ctx.ltm) base.slice(1, 1 + cols.length).forEach((c, i) => (c.group = cols[i]!.ref.kind === "fiscal_year" ? "Fiscal year" : "LTM"));
  const spec: NumTableSpec = { name: "Financial", cols: fitCols(base, w), rows };
  return { kind: "numTable", header: { title: "Quick Stats", units: "($000s unless noted)" }, spec };
}

/** Sum of fleet counts in the intake facts ("18 service vans and 2 install trucks" -> 20). */
function fleetCount(ctx: CimContext): { count: number; detail: string } | undefined {
  const items = ctx.intake?.fleetAndEquipment.filter((f) => f.count !== undefined) ?? [];
  if (!items.length) return undefined;
  const count = items.reduce((s, f) => s + (f.count ?? 0), 0);
  const detail = `${items.map((f) => `${f.count} ${f.item.toLowerCase()}`).join(" and ")}; ${items[0]!.ownership.charAt(0).toLowerCase()}${items[0]!.ownership.slice(1)}`;
  return { count, detail };
}

const kpiOf = (ctx: CimContext, key: string): KpiSeries | undefined => ctx.ds.kpis?.find((x) => x.key === key);

/** A KPI definition cut to a one-line qualifier: the part after a colon, first items up to about 45 characters. */
function shortDefinition(def: string): string {
  const body = def.includes(":") ? def.slice(def.indexOf(":") + 1).trim() : def;
  const items = body.split(/,\s*/);
  let out = items[0]!;
  for (const it of items.slice(1)) {
    if (`${out}, ${it}`.length > 45) break;
    out = `${out}, ${it}`;
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Quick Stats, operating block: a fact table (Metric / Value / Basis / Obs.) of what the sources state (spec 4.3). */
export function quickStatsOperating(ctx: CimContext, w: number): Block | undefined {
  const rows: NumRow[] = [];
  const b = ctx.brief;
  const members = kpiOf(ctx, "maintenance_members");
  if (members) {
    const renewal = kpiOf(ctx, "renewal_rate");
    const v = latestKpi(members)!;
    rows.push({ type: "line", key: "op.members", label: "Agreement members (#)", vals: [fmtCount(v)], text: `${shortDefinition(members.definition ?? members.label)}${renewal ? `; about ${fmtKpi(renewal, latestKpi(renewal)!)} renew` : ""}` });
  }
  const cu = ctx.out.customers;
  if (cu) {
    rows.push({ type: "line", key: "op.largest", label: `Largest ${cu.term.toLowerCase()} (% of revenue)`, vals: [pc(cu.concentration.largestShare)], text: `Top 10 are ${b.t("cust.top10Share")}; ${b.t("cust.count")} ${population(ctx)} active at ${monthLabel(ctx.latest.end)}` });
  }
  const hc = ctx.out.headcount;
  if (hc) {
    const parts = hc.byDepartment.map((d) => `${d.count} ${d.department.toLowerCase()}`);
    rows.push({ type: "line", key: "op.employees", label: "Employees excl. owner (#)", vals: [fmtCount(hc.latestHeadcount)], text: parts.join(", ") });
    // Money in a fact table carries its unit in the cell (spec 4.3), so a per-person figure is never read in the table's thousands.
    rows.push({ type: "line", key: "op.revField", label: "Revenue per field employee", vals: [fmtMoney(hc.loadRatios.revenuePerFieldEmployee)], text: `${ctx.latest.label} revenue over ${fmtCount(hc.latestFieldHeadcount)} field employees` });
  } else if (b.has("staff.total")) {
    const staff = ctx.intake!.workforce.composition.filter((c) => !/\bowner\b/i.test(c.role));
    rows.push({ type: "line", key: "op.employees", label: "Employees excl. owner (#)", vals: [b.t("staff.total")], text: `${staff.map((c) => `${c.role} ${c.count}`).join("; ")} (per management)` });
  }
  const fleet = fleetCount(ctx);
  if (fleet) rows.push({ type: "line", key: "op.fleet", label: "Fleet (#)", vals: [fmtCount(fleet.count)], text: fleet.detail });
  const rating = kpiOf(ctx, "google_rating");
  if (rating) {
    const reviews = kpiOf(ctx, "google_reviews");
    const cert = ctx.intake?.company.certifications[0];
    rows.push({
      type: "line",
      key: "op.rating",
      label: "Google rating",
      vals: [fmtKpi(rating, latestKpi(rating)!)],
      text: [reviews ? `${fmtCount(latestKpi(reviews)!)}+ reviews` : "", cert ? `${cert.name}${cert.since ? ` since ${cert.since}` : ""}` : ""].filter(Boolean).join("; "),
    });
  }
  if (!rows.length) return undefined;
  const cols = fitCols([{ w: 2.0, kind: "label" }, { w: 0.62, kind: "num", head: "Value" }, { w: 4.19, kind: "text", head: "Basis" }, { w: 0.36, kind: "obs", head: "Obs." }], w);
  return { kind: "numTable", spec: { name: "Operating (1)", cols, rows } };
}

/**
 * Sell-side wording for what is offered and on what basis (guide S10.1, F2
 * §5). The full forms go on the S10.1 term table; the summary forms fit the
 * executive-summary column on one or two lines.
 */
function offerTerms(ctx: CimContext, full: boolean): { offered: string; basis: string } {
  if (ctx.assetSale) {
    return {
      offered: `Substantially all of the operating assets of ${ctx.legalName}, free and clear of liens.`,
      basis: full ? "The business is offered as a purchase of assets, free and clear of liens; the Seller retains cash, receivables and payables." : "Asset purchase; the Seller retains cash, receivables and payables.",
    };
  }
  return {
    offered: `100% of the membership interests of ${ctx.legalName}.`,
    basis: full ? "Offers should assume a cash-free, debt-free basis, with a normalized level of working capital delivered at close." : "Cash-free, debt-free, with normalized working capital at close.",
  };
}

const sentence = (t: string): string => `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.)]$/.test(t) ? "" : "."}`;

/** Term rows shared by the Transaction summary (S1.1) and the term table (S10.1). */
export function termRows(ctx: CimContext, full: boolean): TextCell[][] {
  const i = ctx.intake;
  const { offered, basis } = offerTerms(ctx, full);
  const owner = i?.owner;
  const mgmt = i?.management.filter((m) => m.postCloseIntent === "stays") ?? [];
  const loc = i?.locations[0];
  const rows: TextCell[][] = [
    ["What is offered", offered],
    ["Basis of offers", basis],
    ["Reason for sale", i?.reasonForSale.text ? `${sentence(i.reasonForSale.text).replace(/\.$/, "")} (1).` : confirm(ctx, "reason for sale", "Reason for sale")],
    [
      "Owner transition",
      owner?.transition.description
        ? `${owner.name} ${owner.transition.months ? `will remain for up to ${owner.transition.months} months after closing` : "will support the transition after closing"}${/commercial accounts/i.test(owner.transition.description) ? " and introduce each commercial account" : ""} (1).`
        : confirm(ctx, "owner transition", "Owner transition period and role after closing"),
    ],
    [
      "Key employees",
      mgmt.length
        ? full
          ? `${mgmt.map((m) => `The ${m.role.toLowerCase()}, ${m.name}${m.since ? ` (with the Company since ${m.since.slice(0, 4)})` : ""}`).join("; ")}, is expected to stay (1).`
          : `${mgmt.map((m) => `${sentence(m.role).replace(/\.$/, "")} ${m.name}${m.since ? ` (since ${m.since.slice(0, 4)})` : ""}`).join("; ")} is expected to stay (1).`
        : confirm(ctx, "key employees", "Which key employees are expected to stay after closing"),
    ],
  ];
  if (loc) {
    const lease = loc.arrangement === "leased_from_third_party";
    const what = full ? loc.function.toLowerCase() : "shop and office";
    const renewal = loc.renewalOptions ? `${full ? " with " : ", "}${loc.renewalOptions.charAt(0).toLowerCase()}${loc.renewalOptions.slice(1)}` : "";
    rows.push([
      "Real estate",
      `${loc.sizeSqFt ? `${fmtCount(loc.sizeSqFt)} sq ft ` : ""}${what}${lease ? `, leased${loc.landlordRelatedParty === false ? " from an unrelated landlord" : ""}${loc.leaseExpiry ? ` ${full ? "through" : "to"} ${loc.leaseExpiry}` : ""}${renewal}` : ", owned by the Seller; terms are provided separately"} (1).`,
    ]);
  }
  if (full && i?.transaction.sellerFinancing) rows.push(["Seller financing", i.transaction.sellerFinancing]);
  rows.push(["Target timing", i?.transaction.timing ? `The Seller is targeting a closing within ${/12 months/.test(i.transaction.timing) ? "12 months" : i.transaction.timing.toLowerCase()} (1).` : confirm(ctx, "target timing", "Target signing and closing dates")]);
  rows.push(["Tax", "Each party will rely on its own tax advisors."]);
  if (!full) {
    const levers = i?.growthLevers ?? [];
    if (levers.length) {
      // Named here when no lever can be sized yet, since the growth page is then not built (guide 3.3 S9.1).
      const where = ctx.present.has("S9.1") ? ` (${pageRef("S9.1")})` : `: ${levers.map((l) => l.lever.charAt(0).toLowerCase() + l.lever.slice(1)).join("; ")}`;
      rows.push(["Growth levers (1)", `${fmtCount(levers.length)} identified by management${where}; none is included in the figures shown.`]);
    }
    rows.push(["Basis of preparation", `${ctx.sources.statements.replace(/^Company financial statements \((.+)\)$/, "$1 statements")}, ${fyRange(ctx.fy.map((c) => c.fiscalYear!))}, unaudited; tiers [D], [N], [S] (${pageRef("S7.1")}); ${ctx.pf ? "pro forma shown separately" : "no pro forma items"}.`]);
  }
  return rows;
}

export function transactionSummary(ctx: CimContext, w: number): Block {
  const rows = termRows(ctx, false);
  const spec: TextTableSpec = { colW: [1.15, r3(w - 1.15)], head: ["Term", "Detail"], rows, fontSize: 8 };
  return { kind: "textTable", header: { title: "Transaction summary" }, spec };
}

// ---------------------------------------------------------------------------
// Income statement, revenue lines, cost structure
// ---------------------------------------------------------------------------

interface OpexLine {
  label: string;
  key: string;
  get: (p: PeriodValues) => number;
}

/**
 * Operating expense lines within a row budget: the five categories, then the
 * largest category with two or more accounts splits off its largest account,
 * repeatedly, while rows remain. Every split keeps an "Other …" remainder, so
 * the lines always foot to total operating expenses.
 */
function opexLines(ctx: CimContext, budget: number): OpexLine[] {
  const latest = at(ctx, ctx.latest);
  const accountsOf = (cat: string): string[] =>
    Object.keys(latest.accountLines)
      .filter((a) => ctx.ds.lines.some((l) => l.account === a && l.category === cat && l.statement === "pnl"))
      .sort((a, b) => (latest.accountLines[b] ?? 0) - (latest.accountLines[a] ?? 0));
  type Cat = { key: string; label: string; get: (p: PeriodValues) => number; accounts: string[]; split: string[] };
  // The owner's employer payroll taxes move from payroll to owner compensation, so payroll excludes him on the register's
  // basis; a payroll line split into its accounts shows them leaving as a line of their own.
  const taxes = ctx.out.columns.some((c) => ctx.out.periods[c.key]?.ownerPayrollTaxes);
  const all: Cat[] = [
    { key: "is.ownerComp", label: ownerCompLabel(ctx), get: ownerCompTotal, accounts: accountsOf("owner_comp"), split: [] },
    { key: "is.payroll", label: "Payroll, excluding the owner", get: staffPayroll, accounts: accountsOf("payroll"), split: [] },
    { key: "is.rent", label: "Rent", get: (p) => p.pnl.rent, accounts: accountsOf("rent"), split: [] },
    { key: "is.marketing", label: "Advertising and marketing", get: (p) => p.pnl.marketing, accounts: accountsOf("marketing"), split: [] },
    { key: "is.otherOpex", label: "Other operating expenses", get: (p) => p.pnl.otherOpex, accounts: accountsOf("other_opex"), split: [] },
  ];
  const cats = all.filter((c) => c.get(latest) !== 0 || c.key === "is.ownerComp");
  let rows = cats.length;
  // The first split turns one line into two; later splits add one; the last account left replaces its remainder. Splitting
  // payroll also brings the owner's payroll taxes out as a line of their own.
  const cost = (c: Cat) => (c.accounts.length - c.split.length - 1 === 1 ? (c.split.length === 0 ? 1 : 0) : 1) + (c.key === "is.payroll" && taxes && !c.split.length ? 1 : 0);
  while (rows < budget) {
    const remaining = (c: Cat) => c.get(latest) - c.split.reduce((s, a) => s + (latest.accountLines[a] ?? 0), 0);
    const candidates = cats.filter((c) => c.accounts.length - c.split.length >= 2 && rows + cost(c) <= budget).sort((a, b) => remaining(b) - remaining(a));
    const c = candidates[0];
    if (!c) break;
    rows += cost(c);
    c.split.push(c.accounts[c.split.length]!);
  }
  const out: OpexLine[] = [];
  for (const c of cats) {
    if (!c.split.length) {
      out.push({ label: c.label, key: c.key, get: c.get });
      continue;
    }
    for (const a of c.split) out.push({ label: accountLabel(a), key: `is.acct.${a}`, get: (p) => p.accountLines[a] ?? 0 });
    const rest = c.accounts.slice(c.split.length);
    // The accounts add to the P&L line; payroll's owner taxes leave it as their own line below them.
    const whole = c.key === "is.payroll" ? (p: PeriodValues) => p.pnl.payroll : c.get;
    if (rest.length === 1) out.push({ label: accountLabel(rest[0]!), key: `is.acct.${rest[0]}`, get: (p) => p.accountLines[rest[0]!] ?? 0 });
    else if (rest.length > 1) {
      // A remainder never borrows its category's label, which elsewhere in the deck means the whole category.
      const label = c.key === "is.payroll" ? "Other payroll costs" : c.key === "is.otherOpex" ? "All other operating accounts" : `Other ${c.label.charAt(0).toLowerCase()}${c.label.slice(1)}`;
      out.push({ label, key: `${c.key}.other`, get: (p) => whole(p) - c.split.reduce((s, a) => s + (p.accountLines[a] ?? 0), 0) });
    }
    if (c.key === "is.payroll" && taxes) out.push({ label: "Less: owner's payroll taxes", key: "is.ownerTaxes", get: (p) => -(p.ownerPayrollTaxes ?? 0) });
  }
  return out;
}

/** Below this, or below 1% of the period's revenue, a line's growth rate says nothing (a $1K line growing to $3K is not "60.7% CAGR"). */
const GROWTH_FLOOR = 10_000;

/**
 * Growth cells for a row: y/y on the latest pair, CAGR over the fiscal years,
 * as the table's analytic columns declare; n.m. when either end is
 * immaterial, as the ladder does for its small rows (QA round 2 F35).
 */
function growthCells(ctx: CimContext, cols: NumCol[], get: (p: PeriodValues) => number): string[] {
  const out: string[] = [];
  const last = at(ctx, ctx.latest);
  const prior = ctx.prior ? at(ctx, ctx.prior) : undefined;
  const span = ctx.fy.length - 1;
  const material = (...ps: PeriodValues[]) => ps.every((p) => Math.abs(get(p)) >= Math.max(GROWTH_FLOOR, 0.01 * p.pnl.revenue));
  for (const c of cols) {
    if (c.kind !== "num" || c.group !== "Growth") continue;
    if (c.head === "CAGR") {
      const [a, b] = [at(ctx, ctx.fy[0]!), at(ctx, ctx.fy[span]!)];
      out.push(span >= 2 && material(a, b) ? pc(cagr(get(a), get(b), span)) : "n.m.");
    } else out.push(prior && material(prior, last) ? fmtGrowth(get(prior), get(last)) : "n.m.");
  }
  return out;
}

/** Margin change for ratio rows in the y/y column: bps under a point, else pts, per the column's single unit. */
function ratioGrowthCells(ctx: CimContext, cols: NumCol[], get: (p: PeriodValues) => number): string[] {
  const out: string[] = [];
  const last = at(ctx, ctx.latest);
  const prior = ctx.prior ? at(ctx, ctx.prior) : undefined;
  for (const c of cols) {
    if (c.kind !== "num" || c.group !== "Growth") continue;
    out.push(c.head === "CAGR" || !prior ? "" : fmtBps(get(prior), get(last)));
  }
  return out;
}

/** The growth block's columns: y/y on the latest pair and CAGR over the fiscal years. */
function growthCols(ctx: CimContext): NumCol[] {
  const cols: NumCol[] = [];
  if (ctx.prior) cols.push({ w: 0.62, kind: "num", head: yoyHead(ctx.latest), group: "Growth" });
  if (ctx.fy.length >= 3) cols.push({ w: 0.62, kind: "num", head: "CAGR", group: "Growth" });
  return cols;
}

/** Summary income statement (spec 8): revenue by line, cost of revenue by account, opex lines within a 23-row budget, Reported EBITDA. */
export function incomeStatement(ctx: CimContext, w: number, maxRows = 23): Block {
  const periods = tableColumns(ctx).filter((c) => c.ref.kind !== "pf");
  const ps = periods.map((c) => at(ctx, c));
  const cols0: NumCol[] = [{ w: 2.28, kind: "label" }, ...periodCols(periods, 0.66), { w: GAP, kind: "gap" }, ...growthCols(ctx), { w: 0.4, kind: "obs", head: "Obs." }];
  const cols = fitCols(cols0, w, ["CAGR", yoyHead(ctx.latest)]);
  const latest = at(ctx, ctx.latest);
  const lines = latest.revenueLines;
  const contra = lines.filter((l) => l.amount < 0);
  const sales = lines.filter((l) => l.amount >= 0);
  const cogsAccounts = Object.keys(latest.accountLines).filter((a) => ctx.ds.lines.some((l) => l.account === a && l.category === "cogs" && l.statement === "pnl"));
  const hasOther = ps.some((p) => p.pnl.otherItemsNet !== 0);
  const fixed = 1 + sales.length + contra.length + 1 + 1 + (cogsAccounts.length > 1 && cogsAccounts.length <= 4 ? cogsAccounts.length : 1) + 2 + 1 + 1 + (hasOther ? 1 : 0) + 2;
  const opex = opexLines(ctx, Math.max(5, maxRows - fixed));
  const row = (type: NumRow["type"], label: string, key: string, get: (p: PeriodValues) => number, dollar = false, extra: Partial<NumRow> = {}): NumRow => ({
    type,
    label,
    key,
    vals: [...kv(ps, get, dollar), ...growthCells(ctx, cols, get)],
    ...extra,
  });
  const ratio = (label: string, key: string, get: (p: PeriodValues) => number): NumRow => ({ type: "ratio", label, key, vals: [...pv(ps, get), ...ratioGrowthCells(ctx, cols, get)] });
  const rows: NumRow[] = [{ type: "section", label: "Revenue" }];
  sales.forEach((l, i) => rows.push(row("line", l.label, `is.line.${l.account}`, (p) => p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0, i === 0)));
  contra.forEach((l) => rows.push(row("sub", `(${EN_DASH}) ${l.label}`, `is.line.${l.account}`, (p) => p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0)));
  rows.push(row("subtotal", "Total revenue", "is.revenue", (p) => p.pnl.revenue, true));
  rows.push({ type: "section", label: "Cost of revenue" });
  if (cogsAccounts.length > 1 && cogsAccounts.length <= 4) {
    cogsAccounts
      .sort((a, b) => (latest.accountLines[b] ?? 0) - (latest.accountLines[a] ?? 0))
      .forEach((a) => rows.push(row("line", accountLabel(a), `is.acct.${a}`, (p) => p.accountLines[a] ?? 0)));
  } else rows.push(row("line", "Cost of revenue", "is.cogs", (p) => p.pnl.cogs));
  rows.push(row("key", "Gross profit", "is.gp", (p) => p.pnl.grossProfit, true));
  rows.push(ratio("% margin", "is.gm", (p) => p.pnl.grossProfit / p.pnl.revenue));
  rows.push({ type: "section", label: "Operating expenses" });
  opex.forEach((o) => rows.push(row("line", o.label, o.key, o.get)));
  rows.push(row("subtotal", "Total operating expenses", "is.opex", (p) => p.pnl.totalOpex, true));
  if (hasOther) rows.push(row("line", "Other income, net", "is.other", (p) => p.pnl.otherItemsNet));
  rows.push(row("key", "Reported EBITDA", "is.ebitda", (p) => p.pnl.ebitda, true, { note: "1" }));
  rows.push(ratio("% margin", "is.margin", (p) => p.ladder.reportedMargin));
  return { kind: "numTable", header: { title: "Summary income statement", units: "($000s)" }, spec: { name: "Income statement", cols, rows } };
}

/** Condensed income statement for the financial snapshot (S1.3). */
export function summaryIncomeStatement(ctx: CimContext, w: number): Block {
  const periods = tableColumns(ctx);
  const ps = periods.map((c) => at(ctx, c));
  const cols = fitCols([{ w: 2.2, kind: "label" }, ...periodCols(periods, 0.64), { w: GAP, kind: "gap" }, ...growthCols(ctx), { w: 0.4, kind: "obs", head: "Obs." }], w, ["CAGR", yoyHead(ctx.latest)]);
  const row = (type: NumRow["type"], label: string, key: string, get: (p: PeriodValues) => number, dollar = false, extra: Partial<NumRow> = {}): NumRow => ({ type, label, key, vals: [...kv(ps, get, dollar), ...growthCells(ctx, cols, get)], ...extra });
  const ratio = (label: string, key: string, get: (p: PeriodValues) => number): NumRow => ({ type: "ratio", label, key, vals: [...pv(ps, get), ...ratioGrowthCells(ctx, cols, get)] });
  const rows: NumRow[] = [
    row("line", "Revenue", "snap.revenue", (p) => p.pnl.revenue, true),
    row("line", "Cost of revenue", "snap.cogs", (p) => p.pnl.cogs),
    row("key", "Gross profit", "snap.gp", (p) => p.pnl.grossProfit, true),
    ratio("% margin", "snap.gm", (p) => p.pnl.grossProfit / p.pnl.revenue),
    row("line", "Owner compensation", "snap.owner", (p) => p.pnl.ownerComp),
    // Everything below gross profit but the owner's pay: its own label, since "Other operating expenses" is the P&L category (guide 4.8).
    row("line", "Operating expenses excl. owner", "snap.opex", (p) => p.pnl.totalOpex - p.pnl.ownerComp),
  ];
  if (ps.some((p) => p.pnl.otherItemsNet !== 0)) rows.push(row("line", "Other income, net", "snap.other", (p) => p.pnl.otherItemsNet));
  rows.push(row("key", "Reported EBITDA", "snap.reported", (p) => p.ladder.reportedEbitda, true), ratio("% margin", "snap.repMargin", (p) => p.ladder.reportedMargin));
  rows.push(row("key", "Adj. EBITDA", "snap.adj", (p) => p.ladder.adjEbitda, true, { note: "1" }), ratio("% margin", "snap.adjMargin", (p) => p.ladder.adjMargin));
  return { kind: "numTable", header: { title: "Summary income statement", units: "($000s)" }, spec: { name: "Income statement", cols, rows } };
}

/** Revenue and Adj. EBITDA as twin single-series panels (spec 5), with both CAGRs as the one annotation. */
export function revenueAdjPanels(ctx: CimContext, narrow = false, measure: "adj" | "reported" = "adj", mark = ""): Block {
  const periods = headlineCols(ctx);
  const labels = periods.map((c) => c.label);
  const b = ctx.brief;
  // The income-statement page charts Reported EBITDA, the figure its table carries (spec 5); the executive summary charts Adj. EBITDA.
  const [name, key, get] = measure === "adj" ? ["Adj. EBITDA", "adjEbitda.cagr", (p: PeriodValues) => p.ladder.adjEbitda] as const : ["Reported EBITDA", "repEbitda.cagr", (p: PeriodValues) => p.ladder.reportedEbitda] as const;
  const cagrs = b.has("rev.cagr") && b.has(key);
  // Captions are the measures alone; the one header annotation carries both CAGRs, shortened in a narrow rail (spec 5).
  const annotation = !cagrs ? undefined : narrow ? `CAGR ${b.t("rev.cagr")} and ${b.t(key)}` : `CAGR: revenue ${b.t("rev.cagr")}, ${name} ${b.t(key)}`;
  return {
    kind: "chart",
    header: { title: `Revenue and ${name}`, units: `($000s)${mark ? ` ${mark}` : ""}`, annotation },
    spec: {
      type: "twinPanels",
      panels: [
        { caption: "Revenue", labels, values: periods.map((c) => toK(at(ctx, c).pnl.revenue)) },
        { caption: name, labels, values: periods.map((c) => toK(get(at(ctx, c)))) },
      ],
    },
  };
}

/** Revenue by line with growth (the S6.2 table), footed to total revenue with the contra lines shown. */
export function revenueByLine(ctx: CimContext, w: number): Block {
  const periods = ctx.fy;
  const ps = periods.map((c) => at(ctx, c));
  const cols = fitCols([{ w: 2.28, kind: "label" }, ...periodCols(periods, 0.66), { w: GAP, kind: "gap" }, ...growthCols(ctx), { w: 0.4, kind: "obs", head: "Obs." }], w, ["CAGR"]);
  const lines = at(ctx, ctx.latest).revenueLines;
  const rows: NumRow[] = [];
  lines.forEach((l, i) => {
    const get = (p: PeriodValues) => p.revenueLines.find((x) => x.account === l.account)?.amount ?? 0;
    rows.push({ type: l.amount < 0 ? "sub" : "line", label: l.amount < 0 ? `(${EN_DASH}) ${l.label}` : l.label, key: `rev.line.${l.account}`, vals: [...kv(ps, get, i === 0), ...growthCells(ctx, cols, get)] });
  });
  rows.push({ type: "subtotal", label: "Total revenue", key: "rev.total", vals: [...kv(ps, (p) => p.pnl.revenue, true), ...growthCells(ctx, cols, (p) => p.pnl.revenue)] });
  const rec = (p: PeriodValues) => p.kpis.recurring_revenue_pct ?? Number.NaN;
  if (ps.some((p) => Number.isFinite(rec(p)) && rec(p) > 0)) rows.push({ type: "ratio", label: "% recurring (agreements)", key: "rev.recurring", vals: [...pv(ps, rec), ...ratioGrowthCells(ctx, cols, rec)] });
  return { kind: "numTable", header: { title: "Revenue by service line", units: "($000s)" }, spec: { name: "Revenue line", cols, rows } };
}

/** The service lines the mix is taken over: every revenue line but discounts and refunds. */
const mixAccounts = (ctx: CimContext): string[] => (ctx.ds.revenueLines ?? []).filter((l) => !l.contra).map((l) => l.account);

/** Revenue mix as a 100% stacked bar by fiscal year (spec 5): whole-percent shares that add to 100 (revenueMix), a fifth line folded into Other. */
export function revenueMixChart(ctx: CimContext): Block | undefined {
  const periods = ctx.fy;
  const accounts = mixAccounts(ctx);
  const labelOf = (a: string) => at(ctx, ctx.latest).revenueLines.find((l) => l.account === a)?.label ?? a;
  if (accounts.length < 2) return undefined;
  // Five or more lines: the top three and Other, rounded together so the four still add to 100.
  const groups = accounts.length > 4 ? [...accounts.slice(0, 3).map((a) => [a]), accounts.slice(3)] : accounts.map((a) => [a]);
  const shares = periods.map((c) => wholeShares(groups.map((g) => g.reduce((s, a) => s + Math.max(0, at(ctx, c).revenueLines.find((x) => x.account === a)?.amount ?? 0), 0))));
  const series = groups.map((g, i) => ({ name: g.length > 1 ? "Other" : labelOf(g[0]!), labels: periods.map((c) => c.label), values: periods.map((_, k) => shares[k]![i]!) }));
  const lead = labelOf(accounts[0]!).split(/\s+/)[0]!.toLowerCase();
  const others = (k: number) => 100 - shares[k]![0]!;
  const annotation = periods.length >= 2 ? `Lines other than ${lead}: ${others(0)}% to ${others(periods.length - 1)}%` : undefined;
  return { kind: "chart", header: { title: "Revenue mix by service line", units: "(% of revenue before discounts)", annotation }, spec: { type: "bars", grouping: "percentStacked", series, format: '0"%"' } };
}

/** Service lines: what the customer buys, pricing basis, latest revenue, share and growth (spec 8). */
export function serviceLines(ctx: CimContext, w: number): Block | undefined {
  const rl = ctx.ds.revenueLines?.filter((l) => !l.contra);
  if (!rl?.length) return undefined;
  const latest = at(ctx, ctx.latest);
  const prior = ctx.prior ? at(ctx, ctx.prior) : undefined;
  const rows: TextCell[][] = [];
  const keys: string[] = [];
  const mix = revenueMix(latest, rl.map((l) => l.account));
  // A text column is built only when the notes fill at least one of its rows (spec 14); one left out becomes an open question.
  const buys = rl.some((l) => l.whatTheCustomerBuys);
  const pricing = rl.some((l) => l.pricingBasis);
  const lines = rl.map((l) => l.label).join(", ");
  if (!buys) ctx.openQuestions.push(`What the customer buys on each service line (${lines}): the column is left out of the service lines table until the Seller describes it`);
  if (!pricing) ctx.openQuestions.push(`The pricing basis of each service line (${lines}; flat rate, contract, time and materials): the column is left out of the service lines table until the Seller gives it`);
  for (const [i, l] of rl.entries()) {
    const cur = latest.revenueLines.find((x) => x.account === l.account)?.amount ?? 0;
    const prev = prior?.revenueLines.find((x) => x.account === l.account)?.amount;
    rows.push([
      l.label,
      ...(buys ? [l.whatTheCustomerBuys ?? confirm(ctx, "what the customer buys", `What the customer buys: ${l.label}`)] : []),
      ...(pricing ? [l.pricingBasis ?? confirm(ctx, "pricing basis", `Pricing basis for ${l.label} (flat rate, contract, time and materials)`)] : []),
      k(cur, { dollar: true }),
      `${mix.whole[i]}%`,
      prev !== undefined ? fmtGrowth(prev, cur) : "n.a.",
      "",
    ]);
    keys.push(`svc.${l.account}`);
  }
  const fixed = 0.6 + 0.42 + 0.5 + 0.38;
  const rest = r3(w - fixed);
  const shares = [0.3, ...(buys ? [0.4] : []), ...(pricing ? [0.3] : [])];
  const total = shares.reduce((s, x) => s + x, 0);
  const textW = shares.map((x) => r3((rest * x) / total));
  textW[0] = r3(rest - textW.slice(1).reduce((s, x) => s + x, 0));
  const colW = [...textW, 0.6, 0.42, 0.5, 0.38];
  const head = ["Service line", ...(buys ? ["What the customer buys"] : []), ...(pricing ? ["Pricing basis"] : []), ctx.latest.label, "%", "y/y", "Obs."];
  return {
    kind: "textTable",
    header: { title: "Service lines", units: `(${ctx.latest.label}, $000s)` },
    spec: { colW, head, rows, rowKeys: keys, obsCol: head.length - 1, aligns: [...textW.map(() => "left" as const), "right", "right", "right", "center"], fontSize: 8 },
  };
}

/** Milestones from the intake notes (S2.1 without a long revenue history). */
export function milestones(ctx: CimContext, w: number): Block | undefined {
  const ms = [...(ctx.intake?.milestones ?? [])].sort((a, b) => a.year - b.year);
  if (!ms.length) return undefined;
  const hasEffect = ms.some((m) => m.effect);
  const rows = ms.map((m) => (hasEffect ? [String(m.year), m.event, m.effect ?? ""] : [String(m.year), m.event]));
  const colW = hasEffect ? [0.55, r3((w - 0.55) * 0.55), r3(w - 0.55 - r3((w - 0.55) * 0.55))] : [0.55, r3(w - 0.55)];
  return { kind: "textTable", header: { title: "History and milestones", units: "(per management)" }, spec: { colW, head: hasEffect ? ["Year", "Event", "Effect"] : ["Year", "Event"], rows, fontSize: 8.5 } };
}

/** The milestones as one run-in paragraph, for a page whose exhibits are already three (spec 7.3; QA round 2 F39). */
export function milestoneProse(ctx: CimContext): Block | undefined {
  const ms = [...(ctx.intake?.milestones ?? [])].sort((a, b) => a.year - b.year);
  if (!ms.length) return undefined;
  const events = ms.map((m, i) => `${i ? m.event.charAt(0).toLowerCase() + m.event.slice(1) : m.event} in ${m.year}${m.effect ? ` (${m.effect.charAt(0).toLowerCase()}${m.effect.slice(1)})` : ""}`);
  return { kind: "prose", paragraphs: [{ lead: "History.", body: `${events.join("; ")} (1).` }] };
}

/**
 * Cost structure as % of revenue (S6.3, spec "Operating cost ratios"): cost
 * of revenue and payroll by account with subtotals, owner compensation, then
 * the largest other accounts within the row budget; one unit per column, the
 * change in bps.
 */
export function costStructure(ctx: CimContext, w: number, maxRows = 22): Block {
  const periods = ctx.fy;
  const ps = periods.map((c) => at(ctx, c));
  const first = ps[0]!;
  const last = ps[ps.length - 1]!;
  const short = (c: PeriodColumn) => c.label.replace("FY20", "FY");
  // The change column's span goes in the units, so its header fits one line (QA round 2 F36).
  const span = `${short(periods[0]!)}${EN_DASH}${short(periods[periods.length - 1]!)}`;
  const cols = fitCols(
    [{ w: 2.35, kind: "label" }, ...periods.map((c): NumCol => ({ w: 0.62, kind: "num", head: c.label })), { w: GAP, kind: "gap" }, { w: 0.62, kind: "num", head: "Δ bps" }, { w: 1.6, kind: "text", head: "Basis" }, { w: 0.36, kind: "obs", head: "Obs." }],
    w,
  );
  const latest = at(ctx, ctx.latest);
  const acctOf = (cat: string) =>
    Object.keys(latest.accountLines)
      .filter((a) => ctx.ds.lines.some((l) => l.account === a && l.category === cat && l.statement === "pnl"))
      .sort((a, b) => (latest.accountLines[b] ?? 0) - (latest.accountLines[a] ?? 0));
  const r = (type: NumRow["type"], label: string, key: string, get: (p: PeriodValues) => number, basis = ""): NumRow => {
    const ratioOf = (p: PeriodValues) => get(p) / p.pnl.revenue;
    return { type, label, key, vals: [...ps.map((p) => pc(ratioOf(p))), fmtBps(ratioOf(first), ratioOf(last)).replace(" bps", "")], text: basis };
  };
  // An account an accepted adjustment is taken out of says so where the reader sees its ratio move (the legal fee spike, [N2]).
  const adjustedIn = (account: string) => {
    const refs = ctx.out.adjustments.filter((a) => a.row.status === "accepted" && a.row.tier !== "definitional" && a.row.accounts?.includes(account)).map((a) => `[${a.row.ref}]`);
    return refs.length ? `Adjusted in ${refs.join(", ")} (${pageRef("S7.1")})` : "";
  };
  const acct = (a: string) => r("line", accountLabel(a), `cost.${a}`, (p) => p.accountLines[a] ?? 0, adjustedIn(a));
  const cogs = acctOf("cogs");
  const payroll = acctOf("payroll");
  const other = acctOf("other_opex");
  const head: NumRow[] = [];
  for (const a of cogs.length <= 3 ? cogs : []) head.push(acct(a));
  head.push(r("subtotal", "Cost of revenue", "cost.cogs", (p) => p.pnl.cogs));
  const listed = payroll.length <= 5 ? payroll : [];
  for (const a of listed) head.push(acct(a));
  // The accounts carry the owner's employer payroll taxes; they leave payroll for owner compensation, on the register's basis.
  if (listed.length && ps.some((p) => p.ownerPayrollTaxes)) head.push(r("line", "Less: owner's payroll taxes", "cost.ownerTaxes", (p) => -(p.ownerPayrollTaxes ?? 0), "Moved to owner compensation"));
  head.push(r("subtotal", "Payroll, excluding the owner", "cost.payroll", staffPayroll, ctx.out.headcount ? `${fmtCount(ctx.out.headcount.latestHeadcount)} employees at ${monthLabel(ctx.latest.end)}` : ""));
  head.push(r("line", ownerCompLabel(ctx), "cost.owner", ownerCompTotal, `Restated in ${[...ownerCompRung(ctx).refs.split(" ").filter(Boolean), "[S2]"].join(", ")}`));
  // Rent, marketing and the other accounts are one list in order of their latest share, the remainder last (QA round 2 F34).
  const lines: { row: NumRow; share: number }[] = [];
  if (latest.pnl.rent) lines.push({ row: r("line", "Rent", "cost.rent", (p) => p.pnl.rent, ctx.intake?.locations[0]?.leaseExpiry ? `Lease through ${ctx.intake.locations[0].leaseExpiry}` : ""), share: latest.pnl.rent });
  if (latest.pnl.marketing) lines.push({ row: r("line", "Advertising and marketing", "cost.marketing", (p) => p.pnl.marketing), share: latest.pnl.marketing });
  const budget = Math.max(0, maxRows - head.length - lines.length - 2);
  const shown = other.length - 1 <= budget ? other : other.slice(0, budget);
  for (const a of shown) lines.push({ row: acct(a), share: latest.accountLines[a] ?? 0 });
  const middle = lines.sort((a, b) => b.share - a.share).map((l) => l.row);
  if (shown.length < other.length) middle.push(r("line", "All other operating accounts", "cost.other", (p) => p.pnl.otherOpex - shown.reduce((s, a) => s + (p.accountLines[a] ?? 0), 0), `${other.length - shown.length} smaller accounts`));
  // Total operating expenses carries the page title's claim (opex as % of revenue), so the table shows the figure the title quotes.
  const rows = [...head, ...middle, r("subtotal", "Total operating expenses", "cost.opex", (p) => p.pnl.totalOpex), r("key", "Reported EBITDA margin", "cost.margin", (p) => p.pnl.ebitda)];
  return { kind: "numTable", header: { title: "Cost structure", units: `(% of revenue; Δ ${span})` }, spec: { name: "Cost line", cols, rows } };
}

/**
 * The cost lines whose share of revenue moved most (S6.3), in basis points,
 * read off the cost-structure table beside it so the chart's figures are the
 * table's (spec 5). Level bars of three near-equal margins said nothing (QA
 * round 1 F42); the change per line is what explains the margin.
 */
export function costShiftChart(table: Block, max = 6): Block | undefined {
  if (table.kind !== "numTable") return undefined;
  // The table's units carry the span its change column covers: "(% of revenue; Δ FY23–FY25)".
  const span = /Δ ([^)]+)\)/.exec(table.header?.units ?? "")?.[1];
  const moves = table.spec.rows
    .filter((r) => r.type === "line" && r.vals)
    .map((r) => ({ label: r.label, bps: Number(r.vals![r.vals!.length - 1]!.replace(EN_DASH, "-").replace(/[^0-9.+-]/g, "")) }))
    .filter((m) => Number.isFinite(m.bps) && m.bps !== 0)
    .sort((a, b) => Math.abs(b.bps) - Math.abs(a.bps))
    .slice(0, max);
  if (moves.length < 2) return undefined;
  return {
    kind: "chart",
    header: { title: "Largest changes in cost ratios", units: span ? `(bps, ${span})` : "(bps)" },
    spec: { type: "hbar", labels: moves.map((m) => m.label), values: moves.map((m) => m.bps), format: `#,##0;"${EN_DASH}"#,##0` },
  };
}

// ---------------------------------------------------------------------------
// Adjusted EBITDA
// ---------------------------------------------------------------------------

/** Accepted rows of a tier as they appear in the ladder, with their per-column amounts. */
function tierRows(ctx: CimContext, tier: Adjustment["tier"]): { row: Adjustment; byColumn: Record<string, number> }[] {
  return ctx.out.adjustments.filter((a) => a.row.tier === tier && a.row.status === "accepted");
}

/**
 * The [S1] rung as the deck names it: the owner's salary as paid, and with it
 * the owner's employer payroll taxes and benefits when that row is accepted
 * into the rung ([S4]; guide 5.4: SDE adds back salary, payroll taxes and
 * benefits). `refs` lists every accepted row the rung sums.
 */
/** Payroll excluding the owner, his employer payroll taxes (inside the P&L payroll line) included (F21). */
export const staffPayroll = (p: PeriodValues): number => p.pnl.payroll - (p.ownerPayrollTaxes ?? 0);

/** Owner compensation with his employer payroll taxes, the other side of `staffPayroll`. */
export const ownerCompTotal = (p: PeriodValues): number => p.pnl.ownerComp + (p.ownerPayrollTaxes ?? 0);

/** The owner-compensation line's label: with his payroll taxes when the P&L carries any. */
function ownerCompLabel(ctx: CimContext): string {
  return ctx.out.columns.some((c) => ctx.out.periods[c.key]?.ownerPayrollTaxes) ? "Owner compensation, with payroll taxes" : "Owner compensation";
}

export function ownerCompRung(ctx: CimContext): { label: string; refs: string } {
  const rows = tierRows(ctx, "owner_compensation").filter((a) => a.row.category === "owner_compensation");
  return { label: rows.length > 1 ? "Owner salary and payroll taxes" : "Owner compensation, as paid", refs: rows.map((a) => `[${a.row.ref}]`).join(" ") };
}

/**
 * The full ladder (guide 5.4, spec 8 with the A p4 graft). Main Street shows
 * the owner-compensation mechanism and the SDE rung; lower middle market
 * collapses [S1] and [S2] into one normalization line and omits SDE
 * (DATA_CONTRACT 5.6). Normalization items beyond the row budget fold into
 * one line whose detail is on the support page.
 */
export function ebitdaLadder(ctx: CimContext, w: number, maxRows = 23): Block {
  const periods = tableColumns(ctx);
  const ps = periods.map((c) => at(ctx, c));
  const cols = fitCols(
    [{ w: 2.35, kind: "label" }, { w: 0.45, kind: "ref", head: "Ref" }, ...periodCols(periods, 0.66), { w: GAP, kind: "gap" }, ...(ctx.prior ? [{ w: 0.66, kind: "num" as const, head: yoyHead(ctx.latest), group: "Growth" }] : []), { w: 0.4, kind: "obs", head: "Obs." }],
    w,
    [yoyHead(ctx.latest)],
  );
  const hasYoy = analytic(cols, yoyHead(ctx.latest));
  const prior = ctx.prior ? at(ctx, ctx.prior) : undefined;
  const last = at(ctx, ctx.latest);
  const yoy = (get: (l: Ladder) => number) => (hasYoy ? [prior ? fmtGrowth(get(prior.ladder), get(last.ladder)) : "n.m."] : []);
  const dy = (get: (l: Ladder) => number) => (hasYoy ? [prior ? fmtBps(get(prior.ladder), get(last.ladder)) : ""] : []);
  const row = (type: NumRow["type"], label: string, key: string, get: (l: Ladder) => number, extra: Partial<NumRow> = {}, dollar = false): NumRow => ({
    type,
    label,
    key,
    vals: [...ps.map((p) => k(get(p.ladder), { dollar })), ...yoy(get)],
    ...extra,
  });
  const ratio = (label: string, key: string, get: (l: Ladder) => number): NumRow => ({ type: "ratio", label, key, vals: [...ps.map((p) => pc(get(p.ladder))), ...dy(get)] });
  const colAmt = (a: { byColumn: Record<string, number> }) => (p: PeriodValues) => a.byColumn[p.column.key] ?? 0;
  const itemRow = (a: { row: Adjustment; byColumn: Record<string, number> }, note?: string): NumRow => {
    const latestAmt = a.byColumn[ctx.latest.key] ?? 0;
    const amt = colAmt(a);
    return {
      type: "line",
      label: signed(a.row.description, latestAmt),
      key: `ladder.${a.row.ref}`,
      ref: `[${a.row.ref}]`,
      note,
      vals: [...ps.map((p) => k(amt(p))), ...(hasYoy ? [prior ? (amt(prior) === 0 || amt(last) === 0 ? "n.m." : fmtGrowth(amt(prior), amt(last))) : "n.m."] : [])],
    };
  };

  const rows: NumRow[] = [row("line", "Net income", "ladder.netIncome", (l) => l.netIncome, {}, true), { type: "section", label: "Definitional adjustments" }];
  const d = tierRows(ctx, "definitional");
  const dLabel: Record<string, string> = { interest: "Interest expense", taxes: "Income taxes", da: "Depreciation and amortization" };
  for (const a of d) rows.push({ ...itemRow(a), label: `(+) ${dLabel[a.row.category] ?? a.row.description}` });
  rows.push(row("key", "Reported EBITDA", "ladder.reported", (l) => l.reportedEbitda, {}, true), ratio("% margin", "ladder.repMargin", (l) => l.reportedMargin));

  const n = tierRows(ctx, "normalization").filter((a) => Object.values(a.byColumn).some((v) => v !== 0));
  const s = tierRows(ctx, "owner_compensation");
  const pf = ctx.pf ? tierRows(ctx, "pro_forma") : [];
  const ownerRows = ctx.mainStreet ? 1 + 1 + 2 + (s.length > 1 ? s.length - 1 : 0) + 2 : 1 + 1 + 2;
  const budget = maxRows - rows.length - 2 /* N section + total */ - ownerRows - (pf.length ? pf.length + 3 : 0);
  rows.push({ type: "section", label: "Normalization adjustments" });
  const shownN = n.length > budget ? n.slice(0, Math.max(1, budget - 1)) : n;
  for (const a of shownN) rows.push(itemRow(a));
  if (shownN.length < n.length) {
    const rest = n.slice(shownN.length);
    const get = (p: PeriodValues) => rest.reduce((sum, a) => sum + (a.byColumn[p.column.key] ?? 0), 0);
    rows.push({ type: "line", label: `(+) Other normalization adjustments (${pageRef("S7.2")})`, key: "ladder.otherN", ref: `[${rest[0]!.row.ref}–${rest[rest.length - 1]!.row.ref}]`, vals: [...ps.map((p) => k(get(p))), ...(hasYoy ? ["n.m."] : [])] });
  }
  rows.push(row("subtotal", "Total normalization adjustments", "ladder.normTotal", (l) => l.totalNormalization, {}, true));

  rows.push({ type: "section", label: "Owner compensation" });
  const s2 = s.find((a) => a.row.category === "replacement_cost");
  const s3 = s.find((a) => a.row.category === "capital_reserve");
  if (ctx.mainStreet) {
    rows.push(row("line", `(+) ${ownerCompRung(ctx).label}`, "ladder.S1", (l) => l.ownerCompAsPaid, { ref: ownerCompRung(ctx).refs }));
    rows.push(row("key", "Seller's discretionary earnings (SDE)", "ladder.sde", (l) => l.sde, { note: "1" }, true), ratio("% margin", "ladder.sdeMargin", (l) => l.sdeMargin));
    rows.push(row("line", `(${EN_DASH}) Market replacement compensation`, "ladder.S2", (l) => l.marketReplacement, { ref: s2 ? `[${s2.row.ref}]` : "", note: "2" }));
    if (ps.some((p) => p.ladder.capitalReserve !== 0)) rows.push(row("line", `(${EN_DASH}) Capital reserve`, "ladder.S3", (l) => l.capitalReserve, { ref: s3 ? `[${s3.row.ref}]` : "", ...(reserveIsProxy(ctx) ? { note: "3" } : {}) }));
  } else {
    rows.push(row("line", "(+) Owner compensation normalization", "ladder.ownerNorm", (l) => l.ownerCompNormalization, { ref: [ownerCompRung(ctx).refs, s2 ? `[${s2.row.ref}]` : ""].filter(Boolean).join(" "), note: "2" }));
  }
  rows.push(row("key", "Adj. EBITDA", "ladder.adj", (l) => l.adjEbitda, {}, true), ratio("% margin", "ladder.adjMargin", (l) => l.adjMargin));
  if (pf.length) {
    rows.push({ type: "section", label: "Pro forma adjustments" });
    for (const a of pf) rows.push(itemRow(a));
    rows.push(row("key", "PF Adj. EBITDA", "ladder.pf", (l) => l.pfAdjEbitda, {}, true), ratio("% margin", "ladder.pfMargin", (l) => l.pfMargin));
  }
  return { kind: "numTable", header: { title: "Adjusted EBITDA reconciliation", units: "($000s)" }, spec: { name: "EBITDA ladder", cols, rows } };
}

/** Condensed ladder for the financial snapshot (S1.3): Reported → [SDE →] Adj. → PF Adj. */
export function condensedLadder(ctx: CimContext, w: number): Block {
  const periods = tableColumns(ctx);
  const ps = periods.map((c) => at(ctx, c));
  const cols = fitCols([{ w: 2.3, kind: "label" }, { w: 0.45, kind: "ref", head: "Ref" }, ...periodCols(periods, 0.64), { w: 0.4, kind: "obs", head: "Obs." }], w);
  const row = (type: NumRow["type"], label: string, key: string, get: (l: Ladder) => number, extra: Partial<NumRow> = {}, dollar = false): NumRow => ({ type, label, key, vals: ps.map((p) => k(get(p.ladder), { dollar })), ...extra });
  const ratio = (label: string, key: string, get: (l: Ladder) => number): NumRow => ({ type: "ratio", label, key, vals: ps.map((p) => pc(get(p.ladder))) });
  const nRefs = tierRows(ctx, "normalization").filter((a) => Object.values(a.byColumn).some((v) => v !== 0));
  const refRange = nRefs.length ? "[N]" : "";
  const rows: NumRow[] = [row("key", "Reported EBITDA", "cl.reported", (l) => l.reportedEbitda, {}, true), row("line", "(+) Normalization adjustments", "cl.norm", (l) => l.totalNormalization, { ref: refRange })];
  if (ctx.mainStreet) {
    rows.push(
      row("line", `(+) ${ownerCompRung(ctx).label}`, "cl.S1", (l) => l.ownerCompAsPaid, { ref: ownerCompRung(ctx).refs }),
      row("key", "SDE", "cl.sde", (l) => l.sde, {}, true),
      ratio("% margin", "cl.sdeMargin", (l) => l.sdeMargin),
      row("line", `(${EN_DASH}) Market replacement compensation`, "cl.S2", (l) => l.marketReplacement, { ref: "[S2]" }),
      row("line", `(${EN_DASH}) Capital reserve`, "cl.S3", (l) => l.capitalReserve, { ref: "[S3]" }),
    );
  } else rows.push(row("line", "(+) Owner compensation normalization", "cl.ownerNorm", (l) => l.ownerCompNormalization, { ref: `${ownerCompRung(ctx).refs} [S2]` }));
  rows.push(row("key", "Adj. EBITDA", "cl.adj", (l) => l.adjEbitda, {}, true), ratio("% margin", "cl.adjMargin", (l) => l.adjMargin));
  rows.push(row("line", "(+) Pro forma adjustments", "cl.pf", (l) => l.totalProForma, { ref: "[PF]" }), row("key", "PF Adj. EBITDA", "cl.pfAdj", (l) => l.pfAdjEbitda, {}, true));
  return { kind: "numTable", header: { title: "EBITDA ladder, condensed", units: "($000s)" }, spec: { name: "EBITDA ladder", cols, rows } };
}

/** The bridge from Reported EBITDA to Adj. EBITDA for the latest window as a waterfall (S7.1). */
export function ladderWaterfall(ctx: CimContext): Block {
  const l = at(ctx, ctx.latest).ladder;
  // Category names follow the ladder's row labels, shortened only by their leading sign (spec 5: one vocabulary per page).
  const labels: string[] = ["Reported EBITDA", "Normalization adjustments [N]"];
  const steps: { value: number; total?: boolean }[] = [{ value: toK(l.reportedEbitda), total: true }, { value: toK(l.totalNormalization) }];
  if (ctx.mainStreet) {
    labels.push(`${ownerCompRung(ctx).label} ${ownerCompRung(ctx).refs}`, "SDE", "Market replacement compensation [S2]");
    steps.push({ value: toK(l.ownerCompAsPaid) }, { value: toK(l.sde), total: true }, { value: toK(l.marketReplacement) });
    if (l.capitalReserve !== 0) {
      labels.push("Capital reserve [S3]");
      steps.push({ value: toK(l.capitalReserve) });
    }
  } else {
    labels.push("Owner compensation normalization [S1] [S2]");
    steps.push({ value: toK(l.ownerCompNormalization) });
  }
  labels.push("Adj. EBITDA");
  steps.push({ value: toK(l.adjEbitda), total: true });
  if (l.totalProForma !== 0) {
    labels.push("Pro forma [PF]", "PF Adj. EBITDA");
    steps.push({ value: toK(l.totalProForma) }, { value: toK(l.pfAdjEbitda), total: true });
  }
  return { kind: "chart", header: { title: "Reported EBITDA to Adj. EBITDA", units: `(${ctx.latest.label}, $000s)` }, spec: { type: "waterfall", labels, steps } };
}

/**
 * "Documented (<record>)" or "Management representation (1)" (spec 4.5, guide
 * T11). The record is the general-ledger account the row cites, else the
 * first document named, without file names.
 */
function evidenceText(ctx: CimContext, a: Adjustment): string {
  if (a.evidence === "management_representation") return "Management representation (1)";
  // The depreciation proxy is AMB's estimate, not a record: it says so before any parenthetical is stripped (F23).
  if (a.category === "capital_reserve" && reserveIsProxy(ctx)) return "AMB estimate (proxy: three-year average depreciation; Form 4562 requested) (2)";
  if (a.evidence === "pending") return "Calculated from documented figures; supporting document requested";
  const parts = a.sourceDocument.split(";").map((p) => p.replace(/\([^)]*\)/g, "").trim());
  const account = parts.find((p) => /account /i.test(p));
  if (account) {
    // "P&L, account Depreciation Expense, FY2023–FY2025" names the account, then the years it covers.
    const leaf = account.replace(/^.*account\s+/i, "").split(":").pop()!.replace(/,?\s+FY\d{4}.*$/, "").trim();
    return `Documented (GL: ${leaf})`;
  }
  return `Documented (${parts[0] || "general ledger"})`;
}

/** Whether the capital reserve [S3] is the depreciation proxy rather than equipment spending from Form 4562. */
export const reserveIsProxy = (ctx: CimContext): boolean => ctx.ds.recastInputs?.capitalReserve?.basis === "da_proxy";

/** The footnote the reserve's markers point at: an AMB estimate until Form 4562 is provided, else its source. */
export function reserveFootnote(ctx: CimContext): string | undefined {
  const cr = ctx.ds.recastInputs?.capitalReserve;
  if (!cr) return undefined;
  return reserveIsProxy(ctx) ? "[S3] is an AMB estimate (three-year average depreciation) until Form 4562 is provided." : `${cr.source}.`;
}

/** Adjustment support (spec 4.5): one row per accepted [N], [S] and [PF] row, with its basis and evidence in words. */
export function adjustmentSupport(ctx: CimContext, w: number, full: boolean): Block {
  const accepted = ctx.out.adjustments.filter((a) => a.row.status === "accepted" && a.row.tier !== "definitional" && a.row.tier !== "memo" && Object.values(a.byColumn).some((v) => v !== 0));
  const years = full ? ctx.fy.slice(-2) : [];
  const amountCols = [...years, ...(full && ctx.ltm ? [ctx.ltm] : [])];
  const rows: TextCell[][] = accepted.map((a) => [
    `[${a.row.ref}]`,
    a.row.description,
    ...amountCols.map((c) => k(a.byColumn[c.key] ?? 0)),
    a.row.basis,
    evidenceText(ctx, a.row),
  ]);
  const amountW = amountCols.length * 0.62;
  const colW = full
    ? [0.45, 1.85, ...amountCols.map(() => 0.62), r3(w - 0.45 - 1.85 - amountW - 2.2), 2.2]
    : [0.45, 1.25, 3.1, r3(w - 4.8)];
  return {
    kind: "textTable",
    header: { title: "Adjustment support", units: full ? "($000s)" : `(${ctx.latest.label})` },
    spec: {
      colW,
      head: ["Ref", "Adjustment", ...amountCols.map((c) => c.label), "Basis", "Evidence"],
      rows,
      refCol: 0,
      firstBold: false,
      fontSize: 8,
      rowKeys: accepted.map((a) => `support.${a.row.ref}`),
      aligns: ["left", "left", ...amountCols.map(() => "right" as const), "left", "left"],
    },
  };
}

/** Owner compensation and replacement cost (S7.3): as paid, the market replacement with its burden, the difference, and the reserve. */
export function ownerCompensation(ctx: CimContext, w: number): Block | undefined {
  const rs = ctx.ds.recastInputs;
  if (!rs) return undefined;
  const periods = ctx.fy;
  const ps = periods.map((c) => at(ctx, c));
  const cols = fitCols([{ w: 2.6, kind: "label" }, { w: 0.45, kind: "ref", head: "Ref" }, ...periods.map((c): NumCol => ({ w: 0.66, kind: "num", head: c.label })), { w: 0.36, kind: "obs", head: "Obs." }], w);
  const k$ = (v: number, dollar = false) => k(v, { dollar });
  const burden = rs.replacementSalary * rs.burdenPct;
  const rows: NumRow[] = [
    { type: "line", label: ownerCompRung(ctx).label, key: "oc.asPaid", ref: ownerCompRung(ctx).refs, vals: ps.map((p) => k$(p.ladder.ownerCompAsPaid, true)) },
    { type: "line", label: "Market replacement salary (1)", key: "oc.salary", vals: ps.map(() => k$(rs.replacementSalary)) },
    { type: "sub", label: `(+) Payroll taxes and benefits at ${fmtPct(rs.burdenPct, 0)}`, key: "oc.burden", vals: ps.map(() => k$(burden)) },
    { type: "subtotal", label: "Market replacement compensation", key: "oc.replacement", ref: "[S2]", vals: ps.map((p) => k$(-p.ladder.marketReplacement, true)) },
    { type: "key", label: "Owner compensation above market", key: "oc.above", vals: ps.map((p) => k$(p.ladder.ownerCompNormalization, true)) },
  ];
  if (ctx.mainStreet && ps.some((p) => p.ladder.capitalReserve !== 0)) {
    rows.push({ type: "line", label: `Capital reserve (${rs.capitalReserve?.basis === "da_proxy" ? "3-year average D&A" : rs.capitalReserve?.basis === "form_4562" ? "Form 4562 average" : "advisor"}) (2)`, key: "oc.reserve", ref: "[S3]", vals: ps.map((p) => k$(-p.ladder.capitalReserve)) });
  }
  return { kind: "numTable", header: { title: "Owner compensation and replacement cost", units: "($000s)" }, spec: { name: "Owner compensation", cols, rows } };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

const BASIS_LABEL: Record<string, string> = { contract: "Service contract", maintenance_agreement: "Maintenance agreement", time_and_materials: "Time and materials", subscription: "Subscription", project: "Project" };

/** Customer concentration, top 10 (spec 8): coded, with type, since, revenue, share, cumulative share and basis. */
export function top10(ctx: CimContext, w: number): Block | undefined {
  const cu = ctx.out.customers;
  if (!cu) return undefined;
  const conc = cu.concentration;
  const t = conc.top.slice(0, 10);
  const byId = new Map((ctx.ds.customers?.customers ?? []).map((c) => [c.id, c]));
  const rows: NumRow[] = t.map((r, i) => ({
    type: "line",
    label: r.id,
    key: `top.${r.id}`,
    vals: [r.type ?? "", r.since ? String(r.since) : "", k(r.revenue, { dollar: i === 0 }), pc(r.pctOfTotal), pc(r.cumulativePct), BASIS_LABEL[byId.get(r.id)?.contractBasis ?? ""] ?? ""],
  }));
  const t10 = t.reduce((s, r) => s + r.revenue, 0);
  rows.push(
    { type: "subtotal", label: "Top 10", key: "top.top10", vals: ["", "", k(t10, { dollar: true }), pc(t10 / conc.total), "", ""] },
    { type: "line", label: "Remaining", key: "top.remaining", vals: ["", "", k(conc.total - t10), pc((conc.total - t10) / conc.total), "", ""] },
    { type: "key", label: "Total", key: "top.total", vals: ["", "", k(conc.total, { dollar: true }), "100.0%", "", ""] },
  );
  const cols = fitCols(
    [
      { w: 0.8, kind: "label" },
      { w: 1.25, kind: "num", head: "Type", left: true },
      { w: 0.45, kind: "num", head: "Since" },
      { w: 0.6, kind: "num", head: "Revenue" },
      { w: 0.55, kind: "num", head: "% total" },
      { w: 0.55, kind: "num", head: "Cum. %" },
      { w: 1.45, kind: "num", head: "Basis", left: true },
      { w: 0.36, kind: "obs", head: "Obs." },
    ],
    w,
  );
  return { kind: "numTable", header: { title: "Customer concentration, top 10", units: `(${cu.period.label}, $000s)` }, spec: { name: cu.term, cols, rows, rowH: 0.19 } };
}

/** Customer mix by type (S4.1): accounts, revenue, share and average revenue, with the unlisted households as their own row. */
export function customerMix(ctx: CimContext, w: number): Block | undefined {
  const cu = ctx.out.customers;
  if (!cu) return undefined;
  const { shown, other } = mixGroups(ctx);
  const residual = cu.mixByType.filter((m) => m.count === 0);
  const rows: NumRow[] = shown.map((m, i) => ({ type: "line", label: m.type, key: `mix.${m.type}`, vals: [fmtCount(m.count), k(m.revenue, { dollar: i === 0 }), pc(m.revenuePct), k(m.avgRevenue)] }));
  if (other) rows.push({ type: "line", label: `Other (${other.types} types)`, key: "mix.other", vals: [fmtCount(other.count), k(other.revenue), pc(other.revenue / cu.concentration.total), k(other.revenue / other.count)] });
  const coded = cu.mixByType.filter((m) => m.count > 0);
  const codedRev = coded.reduce((s, m) => s + m.revenue, 0);
  const codedCount = coded.reduce((s, m) => s + m.count, 0);
  // Billed in the period is a larger count than active at its end: the label says which, and the note gives the other (guide 4.8).
  rows.push({ type: "subtotal", label: `Listed, billed in ${cu.period.label} (2)`, key: "mix.coded", vals: [fmtCount(codedCount), k(codedRev, { dollar: true }), pc(codedRev / cu.concentration.total), k(codedRev / codedCount)] });
  for (const r of residual) rows.push({ type: "line", label: "Not listed individually (1)", key: "mix.residual", vals: ["n.a.", k(r.revenue), pc(r.revenuePct), "n.a."] });
  rows.push({ type: "key", label: "Total revenue", key: "mix.total", vals: ["", k(cu.concentration.total, { dollar: true }), "100.0%", ""] });
  const cols = fitCols(
    [{ w: 2.3, kind: "label" }, { w: 0.7, kind: "num", head: "Accounts" }, { w: 0.7, kind: "num", head: "Revenue" }, { w: 0.62, kind: "num", head: "% total" }, { w: 0.8, kind: "num", head: "Avg. revenue" }, { w: 0.36, kind: "obs", head: "Obs." }],
    w,
  );
  return { kind: "numTable", header: { title: `${cu.term} mix by type`, units: `(${cu.period.label}, $000s)` }, spec: { name: "Type", cols, rows, rowH: 0.19 } };
}

type MixRow = NonNullable<CimContext["out"]["customers"]>["mixByType"][number];

/** The four largest listed-customer types and the rest as one group, so the chart and the table show the same bars. */
function mixGroups(ctx: CimContext): { shown: MixRow[]; other?: { types: number; count: number; revenue: number } } {
  const coded = ctx.out.customers!.mixByType.filter((m) => m.count > 0);
  if (coded.length <= 5) return { shown: coded };
  const rest = coded.slice(4);
  return { shown: coded.slice(0, 4), other: { types: rest.length, count: rest.reduce((s, m) => s + m.count, 0), revenue: rest.reduce((s, m) => s + m.revenue, 0) } };
}

/** Listed-customer revenue by type as a horizontal bar, share of total revenue carried in the label (spec 5). */
export function customerMixChart(ctx: CimContext): Block | undefined {
  const cu = ctx.out.customers;
  if (!cu) return undefined;
  const { shown, other } = mixGroups(ctx);
  const labels = shown.map((m) => `${m.type} (${fmtPct(m.revenuePct)})`);
  const values = shown.map((m) => toK(m.revenue));
  if (other) {
    labels.push(`Other types (${fmtPct(other.revenue / cu.concentration.total)})`);
    values.push(toK(other.revenue));
  }
  return { kind: "chart", header: { title: `Listed ${cu.term.toLowerCase()} revenue by type`, units: "($000s; % of total revenue)" }, spec: { type: "hbar", labels, values } };
}

/** Account roll-forward by fiscal year (S4.2): starting, new, lost by reason, ending, churn. */
export function retentionCounts(ctx: CimContext, w: number): Block | undefined {
  const ret = ctx.out.customers?.retention;
  if (!ret) return undefined;
  const years = ctx.fy.filter((c) => ret.byFiscalYear[c.fiscalYear!]);
  if (years.length < 2) return undefined;
  const rs = years.map((c) => ret.byFiscalYear[c.fiscalYear!]!.counts);
  const cols = fitCols([{ w: 2.4, kind: "label" }, ...years.map((c): NumCol => ({ w: 0.66, kind: "num", head: c.label, group: "Fiscal year" })), { w: 0.4, kind: "obs", head: "Obs." }], w);
  const n = (v: number) => (v === 0 ? EN_DASH : fmtCount(v));
  const rows: NumRow[] = [
    { type: "line", label: "Starting accounts", key: "rc.start", vals: rs.map((r) => n(r.startingCount)) },
    { type: "line", label: "(+) New accounts", key: "rc.new", vals: rs.map((r) => n(r.newCustomers)) },
    { type: "line", label: `(${EN_DASH}) Lost accounts`, key: "rc.lost", vals: rs.map((r) => (r.lostCustomers ? `(${r.lostCustomers})` : EN_DASH)) },
    { type: "sub", label: "of which regrettable", key: "rc.regrettable", vals: rs.map((r) => n(r.lostByReason.regrettable)) },
    { type: "sub", label: "of which non-regrettable", key: "rc.nonRegrettable", vals: rs.map((r) => n(r.lostByReason.nonRegrettable)) },
    { type: "sub", label: "of which unclassified", key: "rc.unclassified", vals: rs.map((r) => n(r.lostByReason.unclassified)) },
    { type: "key", label: "Ending accounts", key: "rc.end", vals: rs.map((r) => n(r.endingCount)) },
    { type: "ratio", label: "Churn (lost ÷ average accounts)", key: "rc.churn", vals: rs.map((r) => pc(r.churn)) },
    { type: "ratio", label: "New-account growth", key: "rc.growth", vals: rs.map((r) => pc(r.newCustomerGrowth)) },
  ];
  return { kind: "numTable", header: { title: "Listed-account retention", units: "(#)" }, spec: { name: "Accounts", cols, rows } };
}

/** Dollar roll-forward (S4.2): starting revenue, churn, downsell, upsell, new, ending, GDR and NDR. */
export function retentionDollars(ctx: CimContext, w: number): Block | undefined {
  const ret = ctx.out.customers?.retention;
  if (!ret) return undefined;
  const years = ctx.fy.filter((c) => (ret.byFiscalYear[c.fiscalYear!]?.dollars.startingRevenue ?? 0) > 0);
  if (!years.length) return undefined;
  const ds = years.map((c) => ret.byFiscalYear[c.fiscalYear!]!.dollars);
  const cols = fitCols([{ w: 2.4, kind: "label" }, ...years.map((c): NumCol => ({ w: 0.66, kind: "num", head: c.label, group: "Fiscal year" })), { w: 0.4, kind: "obs", head: "Obs." }], w);
  const neg = (v: number) => k(-v);
  const rows: NumRow[] = [
    { type: "line", label: "Starting revenue (prior year)", key: "rd.start", vals: ds.map((d) => k(d.startingRevenue, { dollar: true })) },
    { type: "line", label: `(${EN_DASH}) Lost accounts`, key: "rd.churn", vals: ds.map((d) => neg(d.churn)) },
    { type: "line", label: `(${EN_DASH}) Downsell`, key: "rd.downsell", vals: ds.map((d) => neg(d.downsell)) },
    { type: "line", label: "(+) Upsell", key: "rd.upsell", vals: ds.map((d) => k(d.upsell)) },
    { type: "line", label: "(+) New accounts", key: "rd.new", vals: ds.map((d) => k(d.newRevenue)) },
    { type: "key", label: "Ending revenue", key: "rd.end", vals: ds.map((d) => k(d.endingRevenue, { dollar: true })) },
    { type: "ratio", label: "Gross dollar retention", key: "rd.gdr", vals: ds.map((d) => pc(d.gdr)) },
    { type: "ratio", label: "Net dollar retention", key: "rd.ndr", vals: ds.map((d) => pc(d.ndr)) },
  ];
  return { kind: "numTable", header: { title: "Listed-account revenue retention", units: "($000s)" }, spec: { name: "Revenue", cols, rows } };
}

/** Cohort triangle by start year: accounts still active at each fiscal year-end (guide S4.3, TPL/CPM). */
export function cohortTable(ctx: CimContext, w: number): Block | undefined {
  const co = ctx.out.customers?.cohorts;
  if (!co || co.countTriangle.length < 3) return undefined;
  const years = ctx.fy.map((c) => c.fiscalYear!);
  const rows: NumRow[] = co.countTriangle.map((c) => {
    const offset = years.length - c.retainedByYear.length;
    const last = c.retainedByYear[c.retainedByYear.length - 1]!;
    return { type: "line", label: c.pre ? `Started before FY${c.cohort + 1}` : `${c.label} starts`, key: `cohort.${c.cohort}`, vals: [fmtCount(c.size), ...years.map((_, i) => (i >= offset ? fmtCount(c.retainedByYear[i - offset]!) : "")), pc(last / c.size, 0)] };
  });
  const cols = fitCols(
    [{ w: 1.6, kind: "label" }, { w: 0.62, kind: "num", head: "Started" }, { w: GAP, kind: "gap" }, ...years.map((y): NumCol => ({ w: 0.62, kind: "num", head: `FY${y}`, group: "Active at year-end" })), { w: GAP, kind: "gap" }, { w: 0.7, kind: "num", head: "Retained" }, { w: 0.4, kind: "obs", head: "Obs." }],
    w,
  );
  return { kind: "numTable", header: { title: "Account cohorts by start year", units: "(#)" }, spec: { name: "Cohort", cols, rows } };
}

/** Customers at 10% of revenue or more, or the top five (guide S4.5). */
export function keyCustomers(ctx: CimContext, w: number): Block | undefined {
  const cu = ctx.out.customers;
  if (!cu) return undefined;
  const keyRows = cu.concentration.top.filter((r, i) => r.pctOfTotal >= 0.1 || i < 5);
  const rows: NumRow[] = keyRows.map((r, i) => ({ type: "line", label: r.id, key: `key.${r.id}`, vals: [r.type ?? "", r.since ? String(r.since) : "", k(r.revenue, { dollar: i === 0 }), pc(r.pctOfTotal)] }));
  const cols = fitCols([{ w: 0.8, kind: "label" }, { w: 2.2, kind: "num", head: "Type", left: true }, { w: 0.6, kind: "num", head: "Since" }, { w: 0.8, kind: "num", head: "Revenue" }, { w: 0.7, kind: "num", head: "% total" }], w);
  return { kind: "numTable", header: { title: "Key customers", units: `(${cu.period.label}, $000s)` }, spec: { name: cu.term, cols, rows } };
}

/** Account wins and losses by quarter (diverging bars: wins above, losses below, guide 2.6). */
export function winsLosses(ctx: CimContext): Block | undefined {
  const monthly = ctx.out.customers?.retention?.monthly;
  if (!monthly || monthly.length < 12) return undefined;
  const quarters = new Map<string, { wins: number; losses: number }>();
  for (const m of monthly) {
    const [y, mo] = m.month.split("-").map(Number);
    const key = `Q${Math.ceil(mo! / 3)}-${String(y).slice(2)}`;
    const q = quarters.get(key) ?? { wins: 0, losses: 0 };
    q.wins += m.counts.newCustomers;
    q.losses += m.counts.lostCustomers;
    quarters.set(key, q);
  }
  const labels = [...quarters.keys()];
  const wins = labels.map((l) => quarters.get(l)!.wins);
  const losses = labels.map((l) => quarters.get(l)!.losses);
  const net = wins.reduce((s, v) => s + v, 0) - losses.reduce((s, v) => s + v, 0);
  return {
    kind: "chart",
    header: { title: "Listed-account wins and losses by quarter", units: "(#)", annotation: `Net ${net >= 0 ? "+" : EN_DASH}${Math.abs(net)} accounts over ${labels.length} quarters` },
    spec: { type: "diverging", labels, wins, losses },
  };
}

// ---------------------------------------------------------------------------
// People and operations
// ---------------------------------------------------------------------------

const PAY_BASIS: Record<string, string> = { salary: "Salary", hourly: "Hourly", hourly_plus_commission: "Hourly plus commission", commission: "Commission", contractor: "Contractor" };

/** Organization and tenure (S5.1): one row per role at the as-of date, names for management only (guide Q12). */
/** The owner's post-close line: the transition offered, and retirement only when the notes give it as the reason for sale. */
function ownerPostClose(ctx: CimContext): string {
  const i = ctx.intake;
  const months = i?.owner.transition.months;
  if (!months) return confirm(ctx, "owner's post-close role", "The owner's role after closing");
  return /retire/i.test(i.reasonForSale.text ?? "") ? `Retiring; up to ${months} months of transition (1)` : `Up to ${months} months of transition (1)`;
}

export function organization(ctx: CimContext, w: number): Block | undefined {
  const pr = ctx.ds.payroll;
  const asOf = ctx.out.headcount?.asOf ?? ctx.out.asOfDate;
  const i = ctx.intake;
  const rows: TextCell[][] = [];
  const keys: string[] = [];
  if (pr) {
    const active = pr.employees.filter((e) => e.hireDate <= asOf && (!e.terminationDate || e.terminationDate > asOf));
    const byRole = new Map<string, typeof active>();
    for (const e of active) byRole.set(e.role, [...(byRole.get(e.role) ?? []), e]);
    const years = (d: string) => (Date.parse(asOf) - Date.parse(d)) / (365.25 * 86_400_000);
    for (const [role, es] of [...byRole.entries()].sort((a, b) => Number(b[1][0]!.isOwner) - Number(a[1][0]!.isOwner) || Number(b[1][0]!.isManagement) - Number(a[1][0]!.isManagement) || b[1].length - a[1].length)) {
      const e0 = es[0]!;
      const mgmt = i?.management.find((m) => m.name === e0.name);
      const named = e0.isOwner || e0.isManagement;
      const avg = es.reduce((s, e) => s + years(e.hireDate), 0) / es.length;
      const post = e0.isOwner
        ? ownerPostClose(ctx)
        : mgmt
          ? mgmt.postCloseIntent === "stays"
            ? "Expected to stay (1)"
            : mgmt.postCloseIntent === "leaves"
              ? "Leaving at closing (1)"
              : confirm(ctx, "intent", `Post-close intent of ${mgmt.name}`)
          : "";
      rows.push([named && e0.name ? `${role} (${e0.name})` : role, fmtCount(es.length), `${avg.toFixed(1)} years; ${(PAY_BASIS[e0.payBasis] ?? e0.payBasis).toLowerCase()}`, post, ""]);
      keys.push(`org.${role}`);
    }
    const total = active.length;
    rows.push(["Total", fmtCount(total), "", "", ""]);
    keys.push("org.total");
  } else if (i?.workforce.composition.length) {
    // The owner leads, as in the payroll branch; the notes list roles in their own order.
    const isOwner = (role: string) => /\bowner\b/i.test(role);
    const comp = [...i.workforce.composition].sort((a, b) => Number(isOwner(b.role)) - Number(isOwner(a.role)));
    for (const c of comp) {
      const mgmt = i.management.find((m) => m.role.toLowerCase() === c.role.toLowerCase());
      const label = isOwner(c.role) && i.owner.name ? `${c.role} (${i.owner.name})` : mgmt ? `${c.role} (${mgmt.name})` : c.role;
      const post = isOwner(c.role) ? ownerPostClose(ctx) : mgmt?.postCloseIntent === "stays" ? "Expected to stay (1)" : "";
      rows.push([label, fmtCount(c.count), mgmt?.since ? `Since ${mgmt.since.slice(0, 4)}` : "", post, ""]);
      keys.push(`org.${c.role}`);
    }
    rows.push(["Total", fmtCount(comp.reduce((sum, c) => sum + c.count, 0)), "", "", ""]);
    keys.push("org.total");
  } else return undefined;
  // An Obs. column, so an observation about a role keys to its row (spec 4.4).
  const obsW = 0.36;
  const colW = [r3((w - obsW) * 0.36), 0.5, r3((w - obsW) * 0.3), r3(w - obsW - r3((w - obsW) * 0.36) - 0.5 - r3((w - obsW) * 0.3)), obsW];
  return {
    kind: "textTable",
    header: { title: "Organization and tenure", units: pr ? `(#, at ${monthLabel(asOf.slice(0, 7))})` : "(#, per management)" },
    spec: { colW, head: ["Role", "Count", "Average tenure and pay basis", "Post-close", "Obs."], rows, rowKeys: keys, obsCol: 4, totalRow: rows.length - 1, aligns: ["left", "right", "left", "left", "center"], fontSize: 8.5 },
  };
}

/** Headcount and compensation by department (S5.2): count, total and average compensation, % of revenue, tenure. */
/**
 * Departments as the CIM may show their pay: a department of fewer than
 * three people is merged with the smallest one that has three or more, so no
 * average is one person's salary (guide 1.4: department aggregates only).
 */
function payGroups(depts: NonNullable<CimContext["out"]["headcount"]>["byDepartment"]) {
  const small = depts.filter((d) => d.count < MIN_PAY_GROUP);
  const large = depts.filter((d) => d.count >= MIN_PAY_GROUP);
  if (!small.length || !large.length) return depts;
  const host = large.reduce((a, b) => (b.count < a.count ? b : a));
  const members = [host, ...small];
  const merged = {
    ...host,
    department: members.map((d, i) => (i ? d.department.toLowerCase() : d.department)).join(" and "),
    count: members.reduce((sum, d) => sum + d.count, 0),
    avgFte: members.reduce((sum, d) => sum + d.avgFte, 0),
    totalComp: members.reduce((sum, d) => sum + d.totalComp, 0),
    pctRevenue: members.reduce((sum, d) => sum + d.pctRevenue, 0),
    avgTenureYears: members.reduce((sum, d) => sum + d.avgTenureYears * d.count, 0) / members.reduce((sum, d) => sum + d.count, 0),
  };
  merged.avgComp = merged.avgFte ? merged.totalComp / merged.avgFte : 0;
  return depts.filter((d) => !members.includes(d)).concat(merged).sort((a, b) => b.count - a.count);
}

export function headcountByDepartment(ctx: CimContext, w: number): Block | undefined {
  const hc = ctx.out.headcount;
  if (!hc) return undefined;
  const rows: NumRow[] = payGroups(hc.byDepartment).map((d, i) => ({ type: "line", label: d.department, key: `dept.${d.department}`, vals: [fmtCount(d.count), k(d.totalComp, { dollar: i === 0 }), k(d.avgComp), pc(d.pctRevenue), d.avgTenureYears.toFixed(1)] }));
  const total = hc.byDepartment.reduce((s, d) => s + d.totalComp, 0);
  const count = hc.byDepartment.reduce((s, d) => s + d.count, 0);
  rows.push({ type: "key", label: "Total", key: "dept.total", vals: [fmtCount(count), k(total, { dollar: true }), k(total / count), pc(total / at(ctx, ctx.latest).pnl.revenue), ""] });
  const cols = fitCols(
    [{ w: 1.45, kind: "label" }, { w: 0.55, kind: "num", head: "Count" }, { w: 0.66, kind: "num", head: "Total" }, { w: 0.66, kind: "num", head: "Average" }, { w: 0.66, kind: "num", head: "% rev." }, { w: 0.66, kind: "num", head: "Tenure" }, { w: 0.36, kind: "obs", head: "Obs." }],
    w,
  );
  return { kind: "numTable", header: { title: "Compensation by department", units: `(${ctx.latest.label}, $000s; tenure in years; excl. owner)` }, spec: { name: "Department", cols, rows } };
}

/** Headcount roll-forward by fiscal year with departures by type (S5.3). */
export function headcountRollForward(ctx: CimContext, w: number): Block | undefined {
  const hc = ctx.out.headcount;
  if (!hc) return undefined;
  const years = ctx.fy.filter((c) => hc.rollForwardByFiscalYear[c.fiscalYear!]);
  if (years.length < 2) return undefined;
  const rs = years.map((c) => hc.rollForwardByFiscalYear[c.fiscalYear!]!);
  const types = [...new Set(rs.flatMap((r) => Object.keys(r.departuresByType)))];
  const n = (v: number) => (v === 0 ? EN_DASH : fmtCount(v));
  const rows: NumRow[] = [
    { type: "line", label: "Employees at the start of the year", key: "hr.start", vals: rs.map((r) => n(r.start)) },
    { type: "line", label: "(+) Hires", key: "hr.hires", vals: rs.map((r) => n(r.hires)) },
    { type: "line", label: `(${EN_DASH}) Departures`, key: "hr.departures", vals: rs.map((r) => (r.departures ? `(${r.departures})` : EN_DASH)) },
    ...types.map((t): NumRow => ({ type: "sub", label: `of which ${t}`, key: `hr.${t}`, vals: rs.map((r) => n(r.departuresByType[t] ?? 0)) })),
    { type: "key", label: "Employees at year-end", key: "hr.end", vals: rs.map((r) => n(r.end)) },
    { type: "ratio", label: "Departures ÷ average headcount", key: "hr.turnover", vals: rs.map((r) => pc(r.departures / ((r.start + r.end) / 2))) },
  ];
  const cols = fitCols([{ w: 2.6, kind: "label" }, ...years.map((c): NumCol => ({ w: 0.66, kind: "num", head: c.label, group: "Fiscal year" })), { w: 0.36, kind: "obs", head: "Obs." }], w);
  return { kind: "numTable", header: { title: "Headcount roll-forward", units: "(#, excluding the owner)" }, spec: { name: "Employees", cols, rows } };
}

/** Tenure at departure in V51's buckets, as a bar chart (S5.3). */
export function tenureAtDeparture(ctx: CimContext): Block | undefined {
  const hc = ctx.out.headcount;
  const total = hc?.tenureAtDeparture.reduce((s, t) => s + t.count, 0) ?? 0;
  if (!hc || total === 0) return undefined;
  return {
    kind: "chart",
    header: { title: "Tenure at departure", units: "(#, register window)", annotation: `${total} departures in total` },
    spec: { type: "bars", grouping: "clustered", legend: false, series: [{ name: "Departures", labels: hc.tenureAtDeparture.map((t) => t.bucket), values: hc.tenureAtDeparture.map((t) => t.count) }], colors: ["7B0000"] },
  };
}

/** Unit economics by fiscal year (S2.3), derived from the engine's KPIs so the counts tie to the ratios. */
export function unitEconomics(ctx: CimContext, w: number): Block | undefined {
  const periods = ctx.fy;
  const ps = periods.map((c) => at(ctx, c));
  if (!ps.some((p) => p.kpis.revenue_per_employee)) return undefined;
  const span = periods.length - 1;
  // The table's columns are fiscal years, so the change is between them: a CAGR, or the last fiscal year on the one before, never an LTM head.
  const changeHead = span >= 2 ? "CAGR" : span === 1 ? yoyHead(periods[1]!) : undefined;
  const cols = fitCols([{ w: 2.3, kind: "label" }, ...periods.map((c): NumCol => ({ w: 0.62, kind: "num", head: c.label, group: "Fiscal year" })), ...(changeHead ? [{ w: GAP, kind: "gap" } as NumCol, { w: 0.62, kind: "num", head: changeHead, group: "Change" } as NumCol] : []), { w: 1.6, kind: "text", head: "Basis" }, { w: 0.36, kind: "obs", head: "Obs." }], w);
  const change = (get: (p: PeriodValues) => number): string[] => (!changeHead ? [] : span >= 2 ? [pc(cagr(get(ps[0]!), get(ps[span]!), span))] : [fmtGrowth(get(ps[0]!), get(ps[span]!))]);
  // One unit per column (spec 4.1): a ratio's change is in basis points, so it goes in words in the Basis column, not under the growth rates.
  const bpsChange = (get: (p: PeriodValues) => number) => {
    if (!span) return "";
    const d = describeDelta(get(ps[0]!), get(ps[span]!));
    return `${d.charAt(0).toUpperCase()}${d.slice(1)} since ${periods[0]!.label}`;
  };
  const employees = (p: PeriodValues) => (p.kpis.revenue_per_employee ? Math.round(p.pnl.revenue / p.kpis.revenue_per_employee) : Number.NaN);
  const field = (p: PeriodValues) => (p.kpis.revenue_per_field_employee ? Math.round(p.pnl.revenue / p.kpis.revenue_per_field_employee) : Number.NaN);
  const cnt = (v: number) => (Number.isFinite(v) ? fmtCount(v) : "n.a.");
  const rows: NumRow[] = [
    { type: "line", label: "Revenue", key: "ue.revenue", vals: [...kv(ps, (p) => p.pnl.revenue, true), ...change((p) => p.pnl.revenue)], text: "Total revenue" },
    { type: "line", label: "Employees at year-end (#)", key: "ue.employees", vals: [...ps.map((p) => cnt(employees(p))), ...change(employees)], text: "Register, excl. owner" },
    { type: "line", label: "Field employees at year-end (#)", key: "ue.field", vals: [...ps.map((p) => cnt(field(p))), ...change(field)], text: fieldDepartments(ctx) },
    { type: "subtotal", label: "Revenue per employee", key: "ue.revEmp", vals: [...kv(ps, (p) => p.kpis.revenue_per_employee ?? 0, true), ...change((p) => p.kpis.revenue_per_employee ?? 0)], text: "Revenue ÷ employees" },
    { type: "line", label: "Revenue per field employee", key: "ue.revField", vals: [...kv(ps, (p) => p.kpis.revenue_per_field_employee ?? 0), ...change((p) => p.kpis.revenue_per_field_employee ?? 0)], text: "Revenue ÷ field employees" },
    { type: "ratio", label: "Payroll excl. owner, % revenue", key: "ue.labor", vals: [...pv(ps, (p) => p.kpis.labor_cost_pct_revenue ?? Number.NaN), ...(changeHead ? [""] : [])], text: bpsChange((p) => p.kpis.labor_cost_pct_revenue ?? 0) },
  ];
  if (ps.some((p) => p.kpis.customers)) {
    rows.push(
      { type: "line", label: `${capFirst(population(ctx))} (#)`, key: "ue.accounts", vals: [...ps.map((p) => cnt(p.kpis.customers ?? Number.NaN)), ...change((p) => p.kpis.customers ?? 0)], text: "Active at year-end" },
    );
  }
  return { kind: "numTable", header: { title: "Unit economics", units: "($000s unless noted)" }, spec: { name: "Measure", cols, rows } };
}

/** Capacity measures from the sources at the as-of date (S2.3): a fact table of derived operating ratios (spec 4.3). */
export function capacityFacts(ctx: CimContext, w: number): Block | undefined {
  const rows: NumRow[] = [];
  const members = kpiOf(ctx, "maintenance_members");
  const hc = ctx.out.headcount;
  const latest = at(ctx, ctx.latest);
  const recurring = latest.revenueLines.filter((l) => l.recurring);
  const techs = hc?.byDepartment.find((d) => /field service|service/i.test(d.department));
  if (members && recurring.length === 1) {
    const m = latestKpi(members)!;
    const rev = recurring[0]!.amount;
    rows.push({ type: "line", key: "cap.perMember", label: "Agreement revenue per member", vals: [`$${fmtCount(Math.round(rev / m))} a year`], text: `${ctx.latest.label} ${recurring[0]!.label.toLowerCase()} revenue ÷ ${fmtCount(m)} members (1)` });
    rows.push({ type: "line", key: "cap.visits", label: "Tune-up visits a year (#)", vals: [fmtCount(m * 2)], text: /two tune-ups/i.test(members.definition ?? "") ? "Two tune-ups a year per member (1)" : "" });
    if (!/two tune-ups/i.test(members.definition ?? "")) rows.pop();
    if (techs) rows.push({ type: "line", key: "cap.membersPerTech", label: `Members per ${techs.department.toLowerCase()} employee (#)`, vals: [fmtCount(Math.round(m / techs.count))], text: `${fmtCount(m)} members ÷ ${techs.count} ${techs.department.toLowerCase()} employees` });
  }
  const offer = kpiOf(ctx, "agreement_offer_rate");
  if (offer) rows.push({ type: "line", key: "cap.offer", label: "Service calls offered an agreement", vals: [fmtKpi(offer, latestKpi(offer)!)], text: "Per management (1)" });
  const renewal = kpiOf(ctx, "renewal_rate");
  if (renewal) rows.push({ type: "line", key: "cap.renewal", label: "Agreement renewal rate", vals: [fmtKpi(renewal, latestKpi(renewal)!)], text: "Per management (1)" });
  // The owner's own week is capacity the business must replace (guide S5.4).
  const ownerHours = kpiOf(ctx, "owner_hours");
  if (ownerHours) rows.push({ type: "line", key: "cap.ownerHours", label: "Owner hours a week (#)", vals: [fmtKpi(ownerHours, latestKpi(ownerHours)!)], text: "Per management (1)" });
  const fleet = fleetCount(ctx);
  if (fleet) {
    rows.push({ type: "line", key: "cap.revVehicle", label: "Revenue per vehicle", vals: [fmtMoney(latest.pnl.revenue / fleet.count)], text: `${ctx.latest.label} revenue ÷ ${fleet.count} vehicles` });
    if (hc) rows.push({ type: "line", key: "cap.vehiclesField", label: "Vehicles per field employee", vals: [(fleet.count / hc.latestFieldHeadcount).toFixed(1)], text: `${fleet.count} vehicles ÷ ${hc.latestFieldHeadcount} field employees` });
  }
  if (rows.length < 2) return undefined;
  // The Value column holds a unit with its figure ("$200 a year"), so it is wider than a figure column.
  const cols = fitCols([{ w: 2.3, kind: "label" }, { w: 0.85, kind: "num", head: "Value" }, { w: 3.47, kind: "text", head: "Basis" }, { w: 0.36, kind: "obs", head: "Obs." }], w);
  // Each figure keeps its own date: the financials run to the as-of month, management's counts to the day they were given (guide 4.6).
  const kpiDate = [members, offer].flatMap((x) => (x ? Object.keys(x.values).flatMap((key) => (/^AT(\d{4}-\d{2})-\d{2}$/.exec(key)?.[1] ? [key.slice(2)] : [])) : [])).sort().at(-1);
  const units = kpiDate ? `($ as shown; ${ctx.latest.label} financials; counts per management at ${monthLabel(kpiDate.slice(0, 7))} (1))` : `($ as shown; at ${monthLabel(ctx.latest.end)})`;
  return { kind: "numTable", header: { title: "Capacity measures", units }, spec: { name: "Measure", cols, rows } };
}

/** Facilities, fleet and systems (spec 8): what a buyer takes over, from the intake facts. */
export function facilities(ctx: CimContext, w: number, withSuppliers = true): Block | undefined {
  const i = ctx.intake;
  if (!i) return undefined;
  const rows: TextCell[][] = [];
  for (const l of i.locations) {
    const lease = l.arrangement === "leased_from_third_party";
    rows.push([
      l.name.replace(/\s+(shop and office|office|shop)$/i, "") === l.name ? l.name : "Shop and office",
      `${l.sizeSqFt ? `${fmtCount(l.sizeSqFt)} sq ft; ` : ""}${l.function.toLowerCase()}${l.name.match(/on (.+?) (shop|office)/i) ? `; ${l.name.match(/^(.+?) (shop|office)/i)?.[1]}` : ""}${l.landlordRelatedParty === false ? "; landlord unrelated to the owner" : ""}`,
      lease ? `Lease${l.leaseExpiry ? ` through ${l.leaseExpiry}` : ""}${l.renewalOptions ? `; ${l.renewalOptions.charAt(0).toLowerCase()}${l.renewalOptions.slice(1)}` : ""}` : "Owned by the Seller",
    ]);
  }
  const fleet = fleetCount(ctx);
  if (fleet) rows.push(["Fleet", fleet.detail.split(";")[0]!, i.fleetAndEquipment[0]!.ownership]);
  for (const s of i.systems) rows.push(["Software", `${s.system}: ${s.function.toLowerCase()}`, s.note ?? "In use"]);
  const suppliers = i.suppliers.map((s) => s.name).join(", ");
  if (suppliers && withSuppliers) rows.push(["Suppliers", suppliers, i.company.certifications[0] ? `${i.company.certifications[0].name}${i.company.certifications[0].since ? ` since ${i.company.certifications[0].since}` : ""}` : ""]);
  if (i.company.serviceArea) rows.push(["Service area", i.company.serviceArea, i.company.headquarters ? `Based in ${i.company.headquarters.city}, ${i.company.headquarters.state}` : ""]);
  if (!rows.length) return undefined;
  return {
    kind: "textTable",
    header: { title: "Facilities, fleet and systems", units: "(per management)" },
    spec: { colW: [0.95, r3((w - 0.95) * 0.58), r3(w - 0.95 - r3((w - 0.95) * 0.58))], head: ["Item", "Detail", "Term or status"], rows, fontSize: 8 },
  };
}

/**
 * Owner responsibilities and transition (spec 8, guide S5.4): hours only where
 * the notes give them; the week's total and the transition from the notes. A
 * column is built only when the notes fill at least one of its rows (spec 14:
 * no exhibit built from placeholders); a column left out becomes an open
 * question. Transition support is blank where the notes name none for a
 * duty: the owner's overall transition stands on the total line.
 */
export function ownerResponsibilities(ctx: CimContext, w: number): Block | undefined {
  const o = ctx.intake?.owner;
  if (!o?.responsibilities.length) return undefined;
  const withHours = o.responsibilities.some((r) => r.hoursPerWeek !== undefined);
  const successors = o.responsibilities.some((r) => r.assumedBy);
  const supports = o.responsibilities.some((r) => r.transitionSupport);
  const duties = o.responsibilities.map((r) => r.responsibility.toLowerCase()).join(", ");
  if (!successors) ctx.openQuestions.push(`Who assumes each of the owner's duties after closing (${duties}): the column is left out of the owner responsibilities table until the Seller names them`);
  if (!supports) ctx.openQuestions.push(`What transition support the owner offers for each duty (${duties}): the column is left out of the owner responsibilities table until the Seller states it`);
  const rows: TextCell[][] = o.responsibilities.map((r) => [
    r.responsibility,
    ...(withHours ? [r.hoursPerWeek !== undefined ? String(r.hoursPerWeek) : ""] : []),
    ...(successors ? [r.assumedBy ?? confirm(ctx, "successor", `Who assumes "${r.responsibility}" after closing`)] : []),
    ...(supports ? [r.transitionSupport ?? ""] : []),
    "",
  ]);
  const keys = o.responsibilities.map((r) => `owner.${r.responsibility}`);
  const transition = o.transition ? `; transition ${o.transition.basis}` : "";
  const text = [successors, supports].filter(Boolean).length;
  rows.push([withHours || !o.hoursPerWeek ? `Total${transition} (1)` : `Total: about ${o.hoursPerWeek} hours a week${transition} (1)`, ...(withHours ? [o.hoursPerWeek ? `~${o.hoursPerWeek}` : ""] : []), ...Array(text).fill(""), ""]);
  keys.push("owner.total");
  const fixed = 0.4 + (withHours ? 0.5 : 0);
  const label = text ? (withHours ? 1.95 : 2.1) : r3(w - fixed);
  const each = text ? r3((w - fixed - label) / text) : 0;
  const colW = [label, ...(withHours ? [0.5] : []), ...Array(text).fill(each), 0.4];
  colW[0] = r3(w - colW.slice(1).reduce((s, x) => s + x, 0));
  return {
    kind: "textTable",
    header: { title: "Owner responsibilities and transition", units: "(per management) (1)" },
    spec: {
      colW,
      head: ["Responsibility", ...(withHours ? ["Hrs/wk"] : []), ...(successors ? ["Who assumes it post-close"] : []), ...(supports ? ["Transition support"] : []), "Obs."],
      rows,
      rowKeys: keys,
      obsCol: colW.length - 1,
      totalRow: rows.length - 1,
      aligns: ["left", ...(withHours ? ["right" as const] : []), ...Array(text).fill("left"), "center"],
      fontSize: 8,
    },
  };
}

// ---------------------------------------------------------------------------
// Monthly trend (S6.4)
// ---------------------------------------------------------------------------

/** Monthly revenue bars, every bar labelled (guide 2.6 monthly series, S6.4). */
export function monthlyRevenue(ctx: CimContext): Block | undefined {
  const mo = ctx.out.monthly;
  if (!mo || mo.months.length < 18) return undefined;
  const { start, end } = mo.chartWindow;
  const idx = mo.months.map((m, i) => (m.key >= start && m.key <= end ? i : -1)).filter((i) => i >= 0);
  const labels = idx.map((i) => monthLabel(mo.months[i]!.key));
  const values = idx.map((i) => toK(mo.series.revenue![i]!));
  return {
    kind: "chart",
    header: { title: "Monthly revenue", units: "($000s)", annotation: `${labels[0]} ${EN_DASH} ${labels[labels.length - 1]}` },
    spec: { type: "monthly", labels, values },
  };
}

/** Revenue by fiscal quarter (S6.4 table): every monthly figure the chart shows, summed, so the page's chart has its figures. */
export function quarterlyRevenue(ctx: CimContext, w: number): Block | undefined {
  const mo = ctx.out.monthly;
  if (!mo) return undefined;
  const years = ctx.fy.filter((c) => mo.months.filter((m) => m.fiscalYear === c.fiscalYear).length === 12);
  if (years.length < 2) return undefined;
  const q = (fy: number, n: number) => mo.months.reduce((s, m, i) => (m.fiscalYear === fy && Math.ceil(m.fiscalMonth / 3) === n ? s + mo.series.revenue![i]! : s), 0);
  const lastFy = years[years.length - 1]!.fiscalYear!;
  const prevFy = years[years.length - 2]!.fiscalYear!;
  const annual = (fy: number) => [1, 2, 3, 4].reduce((s, n) => s + q(fy, n), 0);
  const rows: NumRow[] = [1, 2, 3, 4].map((n, i) => ({
    type: "line",
    label: `Q${n} (${monthLabel(mo.months.find((m) => m.fiscalYear === lastFy && m.fiscalMonth === n * 3 - 2)!.key).slice(0, 3)}–${monthLabel(mo.months.find((m) => m.fiscalYear === lastFy && m.fiscalMonth === n * 3)!.key).slice(0, 3)})`,
    key: `q.${n}`,
    vals: [...years.map((c) => k(q(c.fiscalYear!, n), { dollar: i === 0 })), fmtGrowth(q(prevFy, n), q(lastFy, n)), fmtPct(q(lastFy, n) / annual(lastFy))],
  }));
  rows.push({ type: "key", label: "Fiscal year", key: "q.total", vals: [...years.map((c) => k(annual(c.fiscalYear!), { dollar: true })), fmtGrowth(annual(prevFy), annual(lastFy)), "100.0%"] });
  const lastLabel = years[years.length - 1]!.label;
  const cols = fitCols(
    [{ w: 1.7, kind: "label" }, ...years.map((c): NumCol => ({ w: 0.66, kind: "num", head: c.label, group: "Fiscal year" })), { w: GAP, kind: "gap" }, { w: 0.66, kind: "num", head: yoyHead(years[years.length - 1]!), group: lastLabel }, { w: 0.66, kind: "num", head: "% of year", group: lastLabel }, { w: 0.36, kind: "obs", head: "Obs." }],
    w,
  );
  return { kind: "numTable", header: { title: "Revenue by fiscal quarter", units: "($000s)" }, spec: { name: "Quarter", cols, rows } };
}

/** Detailed income statement by month for the latest 12 months (S11.2): 12 months, a gap, the LTM total. */
export function monthlyIncomeStatement(ctx: CimContext): Block | undefined {
  const mo = ctx.out.monthly;
  if (!mo || mo.months.length < 12) return undefined;
  const idx = mo.months.map((_, i) => i).slice(-12);
  const lab = monthLabel(mo.months[idx[idx.length - 1]!]!.key);
  const cols: NumCol[] = [{ w: 2.6, kind: "label" }, ...idx.map((i): NumCol => ({ w: 0.74, kind: "num", head: monthLabel(mo.months[i]!.key), group: `LTM ${lab}, by month` })), { w: GAP, kind: "gap" }, { w: 0.85, kind: "num", head: lab, group: "LTM" }];
  const s = mo.series;
  // The owner's employer payroll taxes by month ([S4]'s months), moved from payroll to owner compensation as on the annual pages.
  const taxRow = ctx.ds.adjustments?.find((a) => a.tier === "owner_compensation" && a.category === "owner_compensation" && a.origin !== "owner_comp");
  const taxes = mo.months.map((m) => taxRow?.byMonth?.[m.key] ?? 0);
  const line = (type: NumRow["type"], label: string, key: string, series: number[] | undefined, dollar = false): NumRow | undefined => {
    if (!series) return undefined;
    const vals = idx.map((i) => k(series[i]!, { dollar }));
    return { type, label, key, vals: [...vals, k(idx.reduce((sum, i) => sum + series[i]!, 0), { dollar })] };
  };
  const ratio = (label: string, key: string, num: number[] | undefined, den: number[] | undefined): NumRow | undefined => {
    if (!num || !den) return undefined;
    const tot = idx.reduce((a, i) => a + num[i]!, 0) / idx.reduce((a, i) => a + den[i]!, 0);
    return { type: "ratio", label, key, vals: [...idx.map((i) => pc(num[i]! / den[i]!)), pc(tot)] };
  };
  const rows = [
    line("line", "Revenue", "m.revenue", s.revenue, true),
    line("line", "Cost of revenue", "m.cogs", s.cogs),
    line("key", "Gross profit", "m.gp", s.gross_profit, true),
    ratio("% margin", "m.gm", s.gross_profit, s.revenue),
    { type: "section", label: "Operating expenses" } as NumRow,
    line("line", "Payroll, excluding the owner", "m.payroll", s.payroll?.map((v, i) => v - taxes[i]!)),
    line("line", taxes.some(Boolean) ? "Owner compensation, with payroll taxes" : "Owner compensation", "m.owner", s.owner_comp?.map((v, i) => v + taxes[i]!)),
    line("line", "Rent", "m.rent", s.rent),
    line("line", "Advertising and marketing", "m.marketing", s.marketing),
    line("line", "Other operating expenses", "m.other", s.other_opex),
    line("subtotal", "Total operating expenses", "m.opex", s.total_opex, true),
    line("line", "Other income, net", "m.otherItems", s.other_items_net),
    line("key", "Reported EBITDA", "m.ebitda", s.reported_ebitda, true),
    ratio("% margin", "m.margin", s.reported_ebitda, s.revenue),
    line("line", "(+) Normalization adjustments", "m.norm", s.total_normalization),
    line("line", `(+) ${ownerCompRung(ctx).label} ${ownerCompRung(ctx).refs}`, "m.s1", s.owner_comp_as_paid),
    ctx.mainStreet ? line("key", "SDE", "m.sde", s.sde, true) : undefined,
    line("line", `(${EN_DASH}) Market replacement compensation [S2]`, "m.s2", s.market_replacement),
    ctx.mainStreet ? line("line", `(${EN_DASH}) Capital reserve [S3]`, "m.s3", s.capital_reserve) : undefined,
    line("key", "Adj. EBITDA", "m.adj", s.adj_ebitda, true),
    ratio("% margin", "m.adjMargin", s.adj_ebitda, s.revenue),
  ].filter((r): r is NumRow => r !== undefined && (r.type === "section" || r.vals!.some((v) => v !== EN_DASH)));
  return { kind: "numTable", header: { title: "Income statement by month", units: "($000s)" }, spec: { name: "Income statement", cols, rows, fontSize: 8, rowH: 0.19 } };
}

// ---------------------------------------------------------------------------
// Balance sheet, working capital, cash flow (S8)
// ---------------------------------------------------------------------------

export function balanceSheet(ctx: CimContext, w: number): Block | undefined {
  const periods = ctx.fy.filter((c) => at(ctx, c).bs && !at(ctx, c).bs!.estimated);
  if (periods.length < 2) return undefined;
  const bs = periods.map((c) => at(ctx, c).bs!);
  const cols = fitCols([{ w: 2.4, kind: "label" }, ...periods.map((c): NumCol => ({ w: 0.66, kind: "num", head: c.label, group: "Year-end" })), { w: 0.36, kind: "obs", head: "Obs." }], w);
  const r = (type: NumRow["type"], label: string, key: string, get: (b: (typeof bs)[number]) => number, dollar = false, note?: string): NumRow => ({ type, label, key, note, vals: bs.map((b) => k(get(b), { dollar })) });
  const rows: NumRow[] = [
    r("line", "Cash", "bs.cash", (b) => b.cash, true),
    r("line", "Accounts receivable", "bs.ar", (b) => b.ar),
    r("line", "Inventory", "bs.inventory", (b) => b.inventory),
    r("line", "Prepaid and other current assets", "bs.oca", (b) => b.oca),
    r("subtotal", "Total current assets", "bs.tca", (b) => b.cash + b.ar + b.inventory + b.oca, true),
    r("line", "Fixed assets, net", "bs.fa", (b) => b.fixedAssets),
    r("line", "Other assets", "bs.other", (b) => b.otherAssets),
    r("key", "Total assets", "bs.ta", (b) => b.totalAssets, true),
    r("line", "Accounts payable", "bs.ap", (b) => b.ap),
    r("line", "Accrued and other current liabilities", "bs.ocl", (b) => b.ocl),
    r("line", "Debt", "bs.debt", (b) => b.debt, false, "1"),
    r("subtotal", "Total liabilities", "bs.tl", (b) => b.totalLiabilities, true),
    r("line", "Equity", "bs.equity", (b) => b.equity),
    r("key", "Total liabilities and equity", "bs.tle", (b) => b.totalLE, true),
  ];
  return { kind: "numTable", header: { title: "Summary balance sheet", units: "($000s)" }, spec: { name: "Balance sheet", cols, rows } };
}

/** Net working capital at each year-end (S8.2): the guide 5.6 lines, days ratios, and what transfers in an asset purchase. */
export function workingCapital(ctx: CimContext, w: number): Block | undefined {
  const nwc = ctx.out.nwc;
  if (!nwc) return undefined;
  // Fiscal year-ends when the sheets give two; otherwise every dated sheet under its own date (a June year-end client whose sheets are at December).
  const yearEnd = nwc.periods.filter((p) => ctx.fy.some((c) => c.end === p.month));
  const pts = yearEnd.length >= 2 ? yearEnd : nwc.periods.slice(-3);
  if (pts.length < 2) return undefined;
  const heads = pts.map((p) => ctx.fy.find((c) => c.end === p.month)?.label ?? monthLabel(p.month));
  const group = yearEnd.length >= 2 ? "Year-end" : "Balance-sheet date";
  const cols = fitCols([{ w: 2.4, kind: "label" }, ...heads.map((h): NumCol => ({ w: 0.66, kind: "num", head: h, group })), { w: 0.36, kind: "obs", head: "Obs." }], w);
  const L = (get: (l: (typeof pts)[number]["lines"]) => number) => pts.map((p) => k(get(p.lines)));
  const avail = nwc.available;
  const rows: NumRow[] = [];
  if (ctx.assetSale) {
    // Asset purchase (guide S8.2): the lines that transfer first, with the Seller's receivables and payables as a memo beneath.
    rows.push({ type: "line", label: "Inventory", key: "nwc.inventory", vals: pts.map((p) => k(p.lines.inventory, { dollar: true })) });
    if (avail.customer_deposits) rows.push({ type: "line", label: `(${EN_DASH}) Customer deposits`, key: "nwc.deposits", vals: L((l) => -l.customerDeposits) });
    rows.push({ type: "key", label: "Working capital that transfers", key: "nwc.transfer", vals: pts.map((p) => k(p.lines.inventory - (avail.customer_deposits ? p.lines.customerDeposits : 0), { dollar: true })) });
    rows.push({ type: "section", label: "Retained by the Seller (memo)" });
    rows.push(
      { type: "line", label: "Accounts receivable", key: "nwc.ar", vals: L((l) => l.ar) },
      { type: "line", label: "Prepaid and other", key: "nwc.prepaid", vals: L((l) => l.prepaidOther) },
      { type: "line", label: `(${EN_DASH}) Accounts payable`, key: "nwc.ap", vals: L((l) => -l.ap) },
      { type: "line", label: `(${EN_DASH}) Accrued liabilities`, key: "nwc.accrued", vals: L((l) => -l.accrued) },
    );
    if (avail.deferred_revenue) rows.push({ type: "line", label: `(${EN_DASH}) Deferred revenue`, key: "nwc.deferred", vals: L((l) => -l.deferredRevenue) });
    rows.push({ type: "subtotal", label: "Net working capital, all lines", key: "nwc.total", vals: pts.map((p) => k(p.lines.adjustedNwc, { dollar: true })) });
  } else {
    rows.push(
      { type: "line", label: "Accounts receivable", key: "nwc.ar", vals: pts.map((p) => k(p.lines.ar, { dollar: true })) },
      { type: "line", label: "Inventory", key: "nwc.inventory", vals: L((l) => l.inventory) },
      { type: "line", label: "Prepaid and other", key: "nwc.prepaid", vals: L((l) => l.prepaidOther) },
      { type: "line", label: `(${EN_DASH}) Accounts payable`, key: "nwc.ap", vals: L((l) => -l.ap) },
      { type: "line", label: `(${EN_DASH}) Accrued liabilities`, key: "nwc.accrued", vals: L((l) => -l.accrued) },
    );
    if (avail.customer_deposits) rows.push({ type: "line", label: `(${EN_DASH}) Customer deposits`, key: "nwc.deposits", vals: L((l) => -l.customerDeposits) });
    if (avail.deferred_revenue) rows.push({ type: "line", label: `(${EN_DASH}) Deferred revenue`, key: "nwc.deferred", vals: L((l) => -l.deferredRevenue) });
    rows.push({ type: "key", label: "Net working capital", key: "nwc.total", vals: pts.map((p) => k(p.lines.adjustedNwc, { dollar: true })) });
  }
  rows.push(
    { type: "ratio", label: "% of revenue", key: "nwc.pct", vals: pts.map((p) => pc(p.lines.pctLtmRevenue)) },
    { type: "ratio", label: "Days sales outstanding", key: "nwc.dso", vals: pts.map((p) => String(Math.round(p.lines.dso))) },
    { type: "ratio", label: "Days inventory outstanding", key: "nwc.dio", vals: pts.map((p) => String(Math.round(p.lines.dio))) },
    { type: "ratio", label: "Days payables outstanding", key: "nwc.dpo", vals: pts.map((p) => String(Math.round(p.lines.dpo))) },
  );
  return { kind: "numTable", header: { title: "Net working capital", units: "($000s)" }, spec: { name: "Working capital", cols, rows } };
}

/** Cash conversion (S8.3): cash from operations, derived capex, free cash flow and its ratio to Reported EBITDA. */
export function cashConversion(ctx: CimContext, w: number): Block | undefined {
  const cf = (ctx.out.cashFlow ?? []).filter((c) => ctx.fy.some((f) => f.fiscalYear === c.fiscalYear));
  if (!cf.length) return undefined;
  const cols = fitCols([{ w: 2.4, kind: "label" }, ...cf.map((c): NumCol => ({ w: 0.66, kind: "num", head: `FY${c.fiscalYear}`, group: "Fiscal year" })), { w: 0.36, kind: "obs", head: "Obs." }], w);
  const rows: NumRow[] = [
    { type: "line", label: "Reported EBITDA", key: "cf.ebitda", vals: cf.map((c) => k(at(ctx, ctx.fy.find((f) => f.fiscalYear === c.fiscalYear)!).ladder.reportedEbitda, { dollar: true })) },
    { type: "line", label: "Cash from operations", key: "cf.cfo", vals: cf.map((c) => k(c.cfo)) },
    { type: "line", label: `(${EN_DASH}) Capital expenditure (2)`, key: "cf.capex", vals: cf.map((c) => k(c.capex)) },
    { type: "key", label: "Free cash flow", key: "cf.fcf", vals: cf.map((c) => k(c.freeCashFlow, { dollar: true })) },
    { type: "ratio", label: "% of Reported EBITDA", key: "cf.conv", vals: cf.map((c) => pc(c.cashConversion)) },
  ];
  return { kind: "numTable", header: { title: "Cash conversion", units: "($000s)" }, spec: { name: "Cash flow", cols, rows } };
}

/** Debt and debt-like items at the latest balance-sheet date, with the treatment in an asset purchase (S8.1). */
export function debtItems(ctx: CimContext, w: number): Block | undefined {
  const dl = ctx.out.debtLike;
  if (!dl?.items.length) return undefined;
  const debt = dl.items.filter((i) => i.treatment !== "nwc");
  if (!debt.length) return undefined;
  const rows: TextCell[][] = debt.map((i) => [i.item, k(i.balance), i.treatment === "debt" ? "Funded debt" : "Debt-like", ctx.assetSale ? (i.note ?? "Repaid by the Seller at closing") : (i.note ?? "Deducted in the equity bridge")]);
  rows.push(["Total", k(debt.reduce((s, i) => s + i.balance, 0), { dollar: true }), "", ""]);
  return {
    kind: "textTable",
    header: { title: "Debt", units: `(at ${monthLabel(dl.asOf.slice(0, 7))}, $000s)` },
    spec: { colW: [1.8, 0.6, 1.0, r3(w - 3.4)], head: ["Item", "Balance", "Treatment", ctx.assetSale ? "At closing (asset purchase)" : "At closing"], rows, totalRow: rows.length - 1, aligns: ["left", "right", "left", "left"], fontSize: 8 },
  };
}

// ---------------------------------------------------------------------------
// Growth and transaction
// ---------------------------------------------------------------------------

/** Growth levers identified by management (S9.1): baseline, mechanism, and the sizing only where a target exists. */
export function growthLevers(ctx: CimContext, w: number): Block | undefined {
  const levers = ctx.intake?.growthLevers ?? [];
  if (!levers.length) return undefined;
  const rows: TextCell[][] = levers.map((l) => [
    l.lever,
    l.baseline ? `${l.baseline} (1)` : confirm(ctx, "baseline", `Baseline for "${l.lever}"`),
    l.mechanism,
    l.target ?? confirm(ctx, "target", `A management target or benchmark that would size "${l.lever}"`),
    "",
  ]);
  const colW = [1.7, r3((w - 2.1) * 0.34), r3((w - 2.1) * 0.4), r3(w - 2.1 - r3((w - 2.1) * 0.34) - r3((w - 2.1) * 0.4)), 0.4];
  return {
    kind: "textTable",
    header: { title: "Growth levers identified by management", units: "(none included in the figures in this memorandum)" },
    spec: { colW, head: ["Lever", "Baseline today", "Mechanism", "Target or benchmark", "Obs."], rows, rowKeys: levers.map((l) => `lever.${l.lever}`), obsCol: 4, fontSize: 8 },
  };
}

/** Baseline figures the levers start from, read from the model (S9.1): recurring revenue, commercial growth, marketing spend. */
export function leverBaselines(ctx: CimContext, w: number): Block | undefined {
  const b = ctx.brief;
  const L = ctx.latest.label;
  const rows: NumRow[] = [];
  const latest = at(ctx, ctx.latest);
  const rec = latest.revenueLines.filter((l) => l.recurring);
  if (rec.length) {
    const amt = rec.reduce((s, l) => s + l.amount, 0);
    rows.push({ type: "line", key: "base.recurring", label: `${rec.map((l) => l.label).join(", ")} revenue`, vals: [k(amt, { dollar: true })], text: `${fmtPct(amt / latest.pnl.revenue)} of ${L} revenue` });
  }
  const members = kpiOf(ctx, "maintenance_members");
  if (members) rows.push({ type: "line", key: "base.members", label: "Agreement members (#)", vals: [fmtCount(latestKpi(members)!)], text: kpiOf(ctx, "agreement_offer_rate") ? `Agreement offered on about ${fmtKpi(kpiOf(ctx, "agreement_offer_rate")!, latestKpi(kpiOf(ctx, "agreement_offer_rate")!)!)} of service calls (1)` : "" });
  const commercial = latest.revenueLines.find((l) => /commercial/i.test(l.label));
  if (commercial && ctx.prior) {
    const prev = at(ctx, ctx.prior).revenueLines.find((l) => l.account === commercial.account)?.amount ?? 0;
    rows.push({ type: "line", key: "base.commercial", label: `${commercial.label} revenue`, vals: [k(commercial.amount)], text: `${fmtGrowth(prev, commercial.amount)} growth in ${L}${b.has("cust.count") ? `; ${b.t("cust.count")} listed accounts` : ""}` });
  }
  rows.push({ type: "line", key: "base.marketing", label: "Advertising and marketing", vals: [k(latest.pnl.marketing)], text: `${fmtPct(latest.pnl.marketing / latest.pnl.revenue)} of ${L} revenue` });
  if (rows.length < 2) return undefined;
  const cols = fitCols([{ w: 2.5, kind: "label" }, { w: 0.7, kind: "num", head: L }, { w: 3.5, kind: "text", head: "Context" }, { w: 0.36, kind: "obs", head: "Obs." }], w);
  return { kind: "numTable", header: { title: "Where the levers start", units: "($000s unless noted)" }, spec: { name: "Baseline", cols, rows } };
}

export function termTable(ctx: CimContext, w: number): Block {
  return { kind: "textTable", header: { title: "Terms of the offering" }, spec: { colW: [1.45, r3(w - 1.45)], head: ["Term", "Detail"], rows: termRows(ctx, true), fontSize: 8.5 } };
}

/** Exhibit header titles on a page, for the divider's "Exhibits in this section" list. */
export function exhibitTitles(blocks: Block[]): string[] {
  return blocks.flatMap((b) => ("header" in b && b.header && b.kind !== "observations" ? [(b.header as ExhibitHeader).title] : []));
}

