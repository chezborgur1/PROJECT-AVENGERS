import fs from "node:fs";
import path from "node:path";
import type { EngineConfig, Mailbox } from "../config.ts";
import { isSendableVerification } from "../contacts/verify.ts";
import { adNotice, buildFooter, OPT_OUT_LINE } from "../compliance/footer.ts";
import { ComplianceError, excludedTarget } from "../compliance/gate.ts";
import { lintBody, lintSubject } from "../compliance/lint.ts";
import type { Suppression } from "../compliance/suppression.ts";
import type { OutgoingMessage } from "../domain/messages.ts";
import { normalizeEmail } from "../domain/schema.ts";
import { displayCase, parseTemplate } from "../outreach/templates.ts";
import { warmMailbox } from "./core.ts";
import { REGISTERED_STATUSES, WARM_KINDS, type BuyerLeadRow } from "./schema.ts";

// The emails a buyer lead receives, and the gate every one passes. The copy
// lives in templates/buyers/*.md and follows the same house style and
// footer as the seller emails; unlike a seller's first email, each one
// carries a link, because the link to AMBrain's registration is the point.
// Nothing reaches a transport except through assertBuyerSendable, which
// throws on any failure, as the seller gate does.

/** The buyer templates, by name. */
export const BUYER_TEMPLATES = ["inquiry-reply", "invite-warm-1", "invite-warm-2", "invite-strategic-1", "invite-fund-1", "invite-cold-1", "invite-cold-2"] as const;
export type BuyerTemplate = (typeof BUYER_TEMPLATES)[number];

/** The folder of buyer templates in the package. */
export const BUYER_TEMPLATES_DIR = path.resolve(import.meta.dirname, "../../templates/buyers");

/** The template a lead's invitation uses at a step: the warm copy only for people who have been in touch with AMB about buying. */
export function inviteTemplate(l: Pick<BuyerLeadRow, "kind">, step: number): BuyerTemplate {
  const warm = l.kind === "inquirer" || l.kind === "past_bidder" || l.kind === "client" || l.kind === "correspondent";
  if (step > 1) return warm ? "invite-warm-2" : "invite-cold-2";
  if (warm) return "invite-warm-1";
  if (l.kind === "strategic") return "invite-strategic-1";
  if (l.kind === "fund" || l.kind === "adviser") return "invite-fund-1";
  return "invite-cold-1";
}

/** The mailbox a lead hears from: AMB's own for people who know AMB, a sending mailbox for everyone else. */
export function mailboxFor(l: Pick<BuyerLeadRow, "kind">, config: EngineConfig, coldMailbox?: Mailbox): Mailbox | undefined {
  return WARM_KINDS.has(l.kind) ? warmMailbox(config) : (coldMailbox ?? config.mailboxes[0]);
}

const plural = (noun: string) =>
  noun
    .replace(/y$/, "ies")
    .replace(/(ss|sh|ch|x)$/, "$1es")
    .replace(/([^s])$/, "$1s");

/** "association management companies, bookkeeping firms, accounting practices and insurance agencies": the first four kinds of business AMB targets. */
export function industriesPhrase(config: EngineConfig): string {
  const nouns = Object.values(config.verticals).map((v) => plural(v.noun.trim())).filter(Boolean).slice(0, 4);
  if (!nouns.length) return "businesses";
  return nouns.length === 1 ? nouns[0]! : `${nouns.slice(0, -1).join(", ")} and ${nouns.at(-1)}`;
}

/** "Tampa Bay", or "Tampa Bay and Orlando". */
export function regionPhrase(config: EngineConfig): string {
  const names = [...new Set(Object.values(config.metros).map((m) => m.name.trim()).filter(Boolean))];
  if (!names.length) return "Florida";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}K`);

/** Fill {tokens}; a token with no value and no fallback throws, naming it, so no email goes out with a hole in it. */
function fill(text: string, values: Record<string, string | undefined>, label: string): string {
  const missing = new Set<string>();
  const out = text.replace(/\{([a-z_]+)\}/g, (_m, t: string) => {
    const v = values[t]?.trim();
    if (!v) missing.add(t);
    return v ?? "";
  });
  if (missing.size) throw new Error(`${label}: no value for ${[...missing].map((t) => `{${t}}`).join(", ")}`);
  return out;
}

/** A rendered buyer email, footer included. */
export interface BuyerEmail {
  subject: string;
  body: string;
  template: BuyerTemplate;
}

/** Render one template for a lead, from `mailbox`, with the buyer's own link. */
export function renderBuyerEmail(template: BuyerTemplate, l: BuyerLeadRow, config: EngineConfig, mailbox: Mailbox, link: string, dir = BUYER_TEMPLATES_DIR, opts: { previousSubject?: string } = {}): BuyerEmail {
  const read = (name: BuyerTemplate) => parseTemplate(fs.readFileSync(path.join(dir, `${name}.md`), "utf8"), `${name}.md`);
  const t = read(template);
  // A follow-up answers the email before it: "Re: " and that email's subject, so it reads as one thread.
  const followUp = template.endsWith("-2");
  const first = followUp && !opts.previousSubject ? read(inviteTemplate(l, 1)) : undefined;
  const listing = /\blisting (?:ref(?:erence)? )?([A-Za-z0-9-]+)/i.exec(l.interest)?.[1];
  const values: Record<string, string | undefined> = {
    first_name: displayCase(l.first_name) || "there",
    company: l.company.trim() ? displayCase(l.company.replace(/,?\s+(llc|inc|l\.?p\.?|lp|corp|co)\.?$/i, "")) : "your firm",
    link,
    firm_name: config.firm.name,
    firm_short_name: config.firm.short_name || config.firm.name,
    sender_name: mailbox.sender_name.trim(),
    industries: industriesPhrase(config),
    region: regionPhrase(config),
    size_range: `${money(config.qualify.min_revenue)} and ${money(config.qualify.max_revenue)}`,
    listing: listing ? `listing ${listing}` : "the business you asked about",
  };
  if (followUp) values.subject_one = opts.previousSubject?.replace(/^\s*re:\s*/i, "") || fill(first!.subject, values, `${inviteTemplate(l, 1)}.md subject`);
  const subject = fill(t.subject, values, `${template}.md subject`);
  const core = fill(t.body, values, `${template}.md`);
  // Every buyer email says it is marketing, the inquiry reply too: it answers the inquiry and also offers
  // AMB's other deals, and erring toward the notice costs nothing (compliance.md section 9 rule 4).
  return { subject, body: [core, buildFooter(config, mailbox), adNotice(config)].join("\n\n"), template };
}

/** The seller-side subject lint, less the prior-contact rule for a reply to the buyer's own inquiry. */
function subjectIssues(subject: string, step: number, inquiryReply: boolean): string[] {
  return lintSubject(subject, { step }).filter((i) => !(inquiryReply && i.startsWith("subject implies prior contact")));
}

/** The checks every buyer email passes before any transport sees it; throws ComplianceError listing every reason it may not go. */
export function assertBuyerSendable(msg: OutgoingMessage, ctx: { config: EngineConfig; suppression: Suppression; lead: BuyerLeadRow; link: string }): void {
  const { config, suppression, lead, link } = ctx;
  const reasons: string[] = [];
  try {
    const hit = suppression.check(msg.to, lead.lead_id) ?? suppression.check(lead.email, lead.lead_id);
    if (hit) reasons.push(`suppressed: ${hit.value} (${hit.reason}, ${hit.source || "no source"})`);
  } catch (err) {
    reasons.push(`suppression check failed: ${(err as Error).message}`);
  }
  if (excludedTarget(msg.to, config.targeting.exclude_domains)) reasons.push(`recipient ${msg.to} is on targeting.exclude_domains`);
  // Inviting buyers to AMB's deals is brokerage activity too: the same sign-off as seller email.
  if (!config.licensed_states.length) reasons.push("licensed_states is empty: no state has licensing sign-off");
  if (!config.licensing_signoff.trim()) reasons.push("licensing_signoff is blank: counsel must sign off the licensed states");
  if (!config.firm.postal_address.trim()) reasons.push("firm.postal_address is blank");

  const warm = warmMailbox(config);
  const mailbox = [...config.mailboxes, ...(warm ? [warm] : [])].find((m) => normalizeEmail(m.email) === normalizeEmail(msg.mailbox));
  if (!mailbox) reasons.push(`mailbox ${msg.mailbox} is neither a sending mailbox nor buyers.mailbox`);
  else if (mailbox.paused) reasons.push(`mailbox ${mailbox.email} is paused`);
  else if (!mailbox.sender_name.trim() || !msg.fromName.toLowerCase().includes(mailbox.sender_name.trim().toLowerCase())) reasons.push("the From name must be the mailbox's real sender");

  if (normalizeEmail(msg.to) !== normalizeEmail(lead.email)) reasons.push(`recipient ${msg.to} is not the lead's email (${lead.email || "blank"})`);
  if (["review", "excluded", "opted_out", "bounced"].includes(lead.status)) reasons.push(`lead ${lead.lead_id} is ${lead.status}`);
  if (REGISTERED_STATUSES.has(lead.status)) reasons.push(`lead ${lead.lead_id} is already on AMBrain (${lead.status})`);
  if (!WARM_KINDS.has(lead.kind) && !isSendableVerification(lead.email_verification)) reasons.push(`email verification is "${lead.email_verification}": not sendable to a cold lead`);
  if (!msg.body.includes(link)) reasons.push("the email is missing the buyer's registration link");

  // An inquiry reply truly follows contact (the buyer's own inquiry, on record): only there may the subject say so.
  const inquiryReply = msg.kind === "reply";
  if (inquiryReply && (lead.kind !== "inquirer" || !lead.last_inbound_at)) reasons.push("an inquiry reply needs the buyer's inquiry on record");
  for (const issue of subjectIssues(msg.subject, msg.step ?? 1, inquiryReply)) reasons.push(`lint: subject ${issue}`);
  let core = msg.body;
  if (mailbox) core = core.split(buildFooter(config, mailbox)).join("\n");
  core = core.split(adNotice(config)).join("\n").split(link).join("the link");
  for (const issue of lintBody(core, { kind: "reply", allow: [lead.company, lead.name, displayCase(lead.company)] })) reasons.push(`lint: ${issue}`);
  const flat = msg.body.replace(/\s+/g, " ");
  if (!flat.includes(config.firm.postal_address.replace(/\s+/g, " ").trim())) reasons.push("footer is missing the postal address");
  if (!flat.includes(config.firm.legal_name)) reasons.push(`footer is missing the legal name "${config.firm.legal_name}"`);
  if (!flat.includes(OPT_OUT_LINE)) reasons.push("footer is missing the opt-out instruction");
  if (!flat.includes(adNotice(config))) reasons.push("the email is missing the advertisement notice");
  if (!msg.headers["List-Unsubscribe"]) reasons.push("missing the List-Unsubscribe header");

  const unique = [...new Set(reasons)];
  if (unique.length) throw new ComplianceError(unique);
}

/** Every buyer template rendered for a sample lead and linted; returns the problems (empty when clean). */
export function lintBuyerTemplates(config: EngineConfig, dir = BUYER_TEMPLATES_DIR): string[] {
  const out: string[] = [];
  const mailbox = warmMailbox(config) ?? { email: "sample@example.com", sender_name: "Sample Sender", sender_title: "", warmup_started: "2026-01-01", paused: false };
  const sample = (kind: BuyerLeadRow["kind"], interest = "") =>
    ({ lead_id: "B-00000", kind, first_name: "JANE", last_name: "SAMPLE", name: "Jane Sample", company: "SAMPLE CAPITAL PARTNERS LLC", interest, email: "jane@sample.example" }) as BuyerLeadRow;
  const link = "https://ambrain.example/join?ref=b-00000-abcdef&src=sample";
  const cases: [BuyerTemplate, BuyerLeadRow][] = [
    ["inquiry-reply", { ...sample("inquirer", "listing 2213456"), last_inbound_at: "2026-01-01" }],
    ["invite-warm-1", sample("past_bidder")],
    ["invite-warm-2", sample("past_bidder")],
    ["invite-strategic-1", sample("strategic")],
    ["invite-fund-1", sample("fund")],
    ["invite-cold-1", sample("conference")],
    ["invite-cold-2", sample("fund")],
  ];
  for (const [name, lead] of cases) {
    let r: BuyerEmail;
    try {
      r = renderBuyerEmail(name, lead, config, mailbox, link, dir);
    } catch (err) {
      out.push(`${name}: ${(err as Error).message}`);
      continue;
    }
    const step = name.endsWith("-2") ? 2 : 1;
    for (const issue of subjectIssues(r.subject, step, name === "inquiry-reply")) out.push(`${name} subject: ${issue}`);
    const core = r.body.split(buildFooter(config, mailbox)).join("\n").split(adNotice(config)).join("\n").split(link).join("the link");
    for (const issue of lintBody(core, { kind: "reply", allow: [lead.company, lead.name] })) out.push(`${name}: ${issue}`);
  }
  return out;
}
