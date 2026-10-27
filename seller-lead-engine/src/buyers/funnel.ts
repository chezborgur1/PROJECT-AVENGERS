import type { EngineConfig } from "../config.ts";
import type { Stores } from "../store/index.ts";
import { daysBetween } from "../util/dates.ts";
import { channelLink, sourceCode } from "./core.ts";
import { industriesPhrase, regionPhrase } from "./outreach.ts";
import { REGISTERED_STATUSES, WARM_KINDS, type PartnerRow } from "./schema.ts";

// How the buyer side is doing, by the channel each buyer came from: found,
// reachable, invited, replied, registered on AMBrain, profiled, verified.
// The registration rate per channel says where to spend the next hour.
// Plus the posting kit: copy-ready text for the places AMB announces deals
// itself, each with its own tracked link, so every registration it brings
// is counted for it.

/** One channel's numbers. */
export interface ChannelRow {
  source: string;
  found: number;
  reachable: number;
  invited: number;
  replied: number;
  registered: number;
  profiled: number;
  verified: number;
  opted_out: number;
  bounced: number;
  /** Registered as a share of invited, 0 to 1 (blank when nobody was invited). */
  rate?: number;
}

/** The buyer funnel. */
export interface BuyerFunnel {
  totals: ChannelRow;
  bySource: ChannelRow[];
  /** What waits for a person. */
  attention: { review: number; replied: number; needsEmail: number; unreadableInquiries: number; freshInquiries: number };
  /** Emails made in the last 7 days. */
  invitedLast7: number;
  registeredLast7: number;
}

const empty = (source: string): ChannelRow => ({ source, found: 0, reachable: 0, invited: 0, replied: 0, registered: 0, profiled: 0, verified: 0, opted_out: 0, bounced: 0 });

/** The funnel from buyers/leads.csv and buyers/touches.csv. */
export function buyerFunnel(stores: Stores, today: string): BuyerFunnel {
  const leads = stores.buyerLeads.rows();
  const touches = stores.buyerTouches.rows();
  const invitedIds = new Set(touches.filter((t) => t.status === "drafted" || t.status === "sent" || t.status === "queued").map((t) => t.lead_id));
  const rows = new Map<string, ChannelRow>();
  const totals = empty("all");
  for (const l of leads) {
    const r = rows.get(l.source) ?? empty(l.source);
    rows.set(l.source, r);
    for (const x of [r, totals]) {
      x.found++;
      if (l.email && (WARM_KINDS.has(l.kind) || ["valid", "catch_all", "role_based"].includes(l.email_verification))) x.reachable++;
      if (invitedIds.has(l.lead_id) || l.status === "invited") x.invited++;
      if (l.replied_at) x.replied++;
      if (REGISTERED_STATUSES.has(l.status)) x.registered++;
      if (l.status === "profiled" || l.status === "verified") x.profiled++;
      if (l.status === "verified") x.verified++;
      if (l.status === "opted_out") x.opted_out++;
      if (l.status === "bounced") x.bounced++;
    }
  }
  const withRate = (r: ChannelRow): ChannelRow => (r.invited ? { ...r, rate: r.registered / r.invited } : r);
  const recent = (stamp: string) => Boolean(stamp) && daysBetween(stamp.slice(0, 10), today) <= 7 && daysBetween(stamp.slice(0, 10), today) >= 0;
  const inbound = stores.buyerInbound.rows();
  return {
    totals: withRate(totals),
    bySource: [...rows.values()].map(withRate).sort((a, b) => b.registered - a.registered || b.found - a.found),
    attention: {
      review: leads.filter((l) => l.status === "review").length,
      replied: leads.filter((l) => l.status === "replied").length,
      needsEmail: leads.filter((l) => l.status === "needs_email").length,
      unreadableInquiries: inbound.filter((r) => r.class === "ignored" && r.platform && /inquir|lead/i.test(r.subject)).length,
      freshInquiries: inbound.filter((r) => r.class === "inquiry" && recent(r.received_at)).length,
    },
    invitedLast7: touches.filter((t) => (t.status === "drafted" || t.status === "sent" || t.status === "queued") && recent(t.created_at)).length,
    registeredLast7: leads.filter((l) => REGISTERED_STATUSES.has(l.status) && recent(l.registered_at)).length,
  };
}

/** The funnel as plain text lines for the CLI. */
export function funnelLines(f: BuyerFunnel): string[] {
  const pct = (r?: number) => (r === undefined ? "" : `${Math.round(r * 100)}%`);
  const line = (r: ChannelRow) => `${r.source.padEnd(28)} ${String(r.found).padStart(6)} ${String(r.reachable).padStart(6)} ${String(r.invited).padStart(6)} ${String(r.replied).padStart(6)} ${String(r.registered).padStart(6)} ${String(r.verified).padStart(6)} ${pct(r.rate).padStart(6)}`;
  return [
    `${"channel".padEnd(28)} ${"found".padStart(6)} ${"email".padStart(6)} ${"invite".padStart(6)} ${"reply".padStart(6)} ${"regist".padStart(6)} ${"verif".padStart(6)} ${"rate".padStart(6)}`,
    ...f.bySource.map(line),
    line(f.totals),
    "",
    `Last 7 days: ${f.invitedLast7} invited, ${f.registeredLast7} registered.`,
    `Waiting for a person: ${f.attention.review} to review, ${f.attention.replied} replied, ${f.attention.needsEmail} need an email${f.attention.unreadableInquiries ? `, ${f.attention.unreadableInquiries} listing-site messages the reader could not parse` : ""}.`,
  ];
}

// ---------------------------------------------------------------- the posting kit

/** The places AMB announces deals itself, each counted as its own channel. */
export const KIT_CHANNELS: readonly { channel: string; label: string; note: string }[] = [
  { channel: "linkedin", label: "LinkedIn post", note: "Post from each AMB advisor's own profile and the AMB page." },
  { channel: "website", label: "AMB website", note: "The deals page and the footer of every page." },
  { channel: "newsletter", label: "Email newsletter", note: "AMB's own list of people who asked to hear about deals." },
  { channel: "email-signature", label: "Email signature", note: "Every AMB person's signature." },
  { channel: "axial", label: "Axial", note: "In the deal's Axial profile, where the network allows a link." },
  { channel: "acg", label: "ACG chapter", note: "The local Association for Corporate Growth chapter's deal-sharing emails and events." },
  { channel: "searchfunder", label: "Searchfunder", note: "A deal post in the Searchfunder community." },
  { channel: "eta-clubs", label: "Business school ETA clubs", note: "The entrepreneurship-through-acquisition clubs' job and deal boards." },
];

/** What a posting kit is about. */
export interface KitInput {
  /** The deal's reference on AMBrain ("AMB-2026-014"); blank for a general "register to see our deals" post. */
  ref?: string;
  headline?: string;
  facts?: string;
}

/** Copy-ready posts, one per channel, each with its own tracked link. */
export function postingKit(config: EngineConfig, input: KitInput = {}): { channel: string; label: string; note: string; link: string; text: string }[] {
  const region = regionPhrase(config);
  const industries = industriesPhrase(config);
  return KIT_CHANNELS.map((c) => {
    const link = channelLink(config, c.channel, input.ref ?? "");
    const text = input.ref
      ? [
          input.headline?.trim() || `New business for sale in ${region} from ${config.firm.name}`,
          input.facts?.trim() ?? "",
          `The financial summary and information memorandum are shared with buyers who register with ${config.firm.short_name || config.firm.name} and sign one confidentiality agreement: ${link}`,
          `Reference ${input.ref}.`,
        ]
          .filter(Boolean)
          .join("\n\n")
      : [
          `${config.firm.name} represents owners of established ${industries} in ${region}.`,
          `Buyers who register and sign one confidentiality agreement see each business as it comes to market, with its financial summary. Registration is free: ${link}`,
        ].join("\n\n");
    return { ...c, link, text };
  });
}

/** A partner's own link, and a short note a person can send them with it. */
export function partnerKit(config: EngineConfig, p: PartnerRow): { link: string; note: string } {
  const source = p.source || `partner-${sourceCode(p.name)}`;
  const link = channelLink(config, source);
  const who = p.kind === "sba_lender" ? "buyers you have pre-qualified" : p.kind === "eta_club" ? "your members who are searching" : p.kind === "cpa" || p.kind === "attorney" || p.kind === "wealth_manager" ? "clients of yours who want to buy a business" : "buyers you work with";
  const note = [
    `${config.firm.name} represents owners of established ${industriesPhrase(config)} in ${regionPhrase(config)}.`,
    `${who.charAt(0).toUpperCase()}${who.slice(1)} can see each business as we bring it to market by registering here: ${link}`,
    "Registration is free and takes one confidentiality agreement. This link is yours, so we can tell you whenever someone you sent registers.",
  ].join(" ");
  return { link, note };
}
