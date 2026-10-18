import type { EngineConfig } from "../config.ts";
import type { OutgoingMessage } from "../domain/messages.ts";
import { normalizeEmail, type ProspectRow } from "../domain/schema.ts";
import { emailDomain, isSendableVerification } from "../contacts/verify.ts";
import { jurisdictionBlock } from "./jurisdiction.ts";
import { findMailbox, lintMessage } from "./lint.ts";
import type { Suppression } from "./suppression.ts";

// The compliance gate: the last call before any transport. It collects
// every reason a message may not go out, then throws once with all of them,
// so a person fixing a template or a config sees the whole list at once.
// It never warns and sends (DESIGN.md principle 2): one missing footer
// across a batch is one violation per email, up to $53,088 each
// (docs/research/compliance.md section 1 item 13).
//
// Outreach checks: suppression (at send time, not when queued: compliance.md
// section 9 rule 1); jurisdiction and licensing (Fla. Stat. 475.01, Cal. B&P
// 10131, CASL/GDPR, 47 CFR 64.3100); licensing sign-off; postal address;
// mailbox configured and not paused; prospect present, matching and not dnc
// or excluded; a sendable email verification; every lint issue.
//
// Replies (to an owner who wrote first): suppression, footer, sender and
// lint checks, licensing config, and jurisdiction when the prospect is
// known. Verification is not required: the owner's own address just reached
// us.

/**
 * True when an address is excluded by targeting.exclude_domains: an entry
 * with "@" names one exact address; any other entry (a leading "@" allowed)
 * names a domain and every subdomain of it, the same rule scoring applies
 * (REVIEW_R1.md items 15 and 33).
 */
export function excludedTarget(email: string, entries: readonly string[]): boolean {
  const e = normalizeEmail(email);
  const domain = e.slice(e.lastIndexOf("@") + 1);
  for (const raw of entries) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry.includes("@") && !entry.startsWith("@")) {
      if (normalizeEmail(entry) === e) return true;
      continue;
    }
    const d = entry.replace(/^@/, "").replace(/\.$/, "");
    if (d && (domain === d || domain.endsWith(`.${d}`))) return true;
  }
  return false;
}

/** Thrown when a message fails any compliance check; `reasons` lists every one. */
export class ComplianceError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Blocked by compliance: ${reasons.join("; ")}`);
    this.name = "ComplianceError";
  }
}

/** Throws ComplianceError with every reason the message may not be sent; returns quietly when it may. */
export function assertSendable(msg: OutgoingMessage, ctx: { config: EngineConfig; suppression: Suppression; prospect?: ProspectRow }): void {
  const { config, suppression, prospect } = ctx;
  const reasons: string[] = [];
  const outreach = msg.kind === "outreach";

  // Suppression: the recipient, its domain, the prospect id, and the prospect's own email if it differs.
  try {
    const hits = [suppression.check(msg.to, msg.prospectId), prospect ? suppression.check(prospect.email, prospect.prospect_id) : undefined];
    for (const hit of hits) if (hit) reasons.push(`suppressed: ${hit.value} (${hit.reason}, ${hit.source || "no source"})`);
  } catch (err) {
    // A suppression list that cannot be read blocks the send (compliance.md section 9 rule 1).
    reasons.push(`suppression check failed: ${(err as Error).message}`);
  }
  const domain = emailDomain(msg.to);
  if (domain && excludedTarget(msg.to, config.targeting.exclude_domains)) {
    reasons.push(`recipient ${msg.to} is on targeting.exclude_domains`);
  }

  // Licensing: nothing is sent until counsel has signed off a state list.
  if (!config.licensed_states.length) reasons.push("licensed_states is empty: no state has licensing sign-off");
  if (!config.licensing_signoff.trim()) reasons.push("licensing_signoff is blank: counsel must sign off the licensed states");
  if (!config.firm.postal_address.trim()) reasons.push("firm.postal_address is blank");

  // Jurisdiction: always for outreach, and for replies when the prospect is known.
  if (prospect) {
    const block = jurisdictionBlock(prospect, msg.to, config);
    if (block && !(block.startsWith("licensed_states is empty") && !config.licensed_states.length)) reasons.push(`jurisdiction: ${block}`);
  } else if (outreach) {
    reasons.push("prospect record missing: cannot check jurisdiction, status or verification");
  }

  // Mailbox: configured and running.
  const mailbox = findMailbox(config, msg.mailbox);
  if (!mailbox) reasons.push(`mailbox ${msg.mailbox} is not in config.mailboxes`);
  else if (mailbox.paused) reasons.push(`mailbox ${mailbox.email} is paused`);

  // Prospect state.
  if (prospect) {
    if (prospect.prospect_id !== msg.prospectId) reasons.push(`message is for ${msg.prospectId} but the prospect record is ${prospect.prospect_id}`);
    if (prospect.status === "dnc") reasons.push(`prospect ${prospect.prospect_id} is dnc`);
    if (outreach && prospect.status === "excluded") reasons.push(`prospect ${prospect.prospect_id} is excluded (${prospect.exclude_reason || "no reason recorded"})`);
    if (outreach) {
      if (normalizeEmail(prospect.email) !== normalizeEmail(msg.to)) reasons.push(`recipient ${msg.to} is not the prospect's email (${prospect.email || "blank"})`);
      if (!isSendableVerification(prospect.email_verification)) reasons.push(`email verification is "${prospect.email_verification}": not sendable`);
    }
  }

  // Copy and footer.
  const allow = prospect ? [prospect.business_name, prospect.dba_name, prospect.city, prospect.owner_name] : [];
  // A lint issue the gate already reported (mailbox, postal address) is not repeated.
  for (const issue of lintMessage(msg, config, { allow })) if (!reasons.some((r) => issue.startsWith(r))) reasons.push(`lint: ${issue}`);

  const unique = [...new Set(reasons)];
  if (unique.length) throw new ComplianceError(unique);
}
