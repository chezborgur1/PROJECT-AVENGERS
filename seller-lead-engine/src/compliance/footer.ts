import type { EngineConfig, Mailbox } from "../config.ts";

// The fixed text every commercial email carries, and the unsubscribe
// headers. One place writes it so the lint and the gate can look for the
// exact words.
//
// What CAN-SPAM needs in each message (docs/research/compliance.md section
// 1 and section 9 rule 4):
// - a clear notice that the message is an advertisement (7704(a)(5)(A)(i));
// - a valid physical postal address (16 CFR 316.2(p)), from config;
// - a working opt-out that needs nothing but a reply or one web page
//   (7704(a)(3), 16 CFR 316.5);
// - the sender identified: the real person and the firm's legal name, which
//   also answers Balsam v. Trancos (Cal. Ct. App. 2012) on privacy-registered
//   sending domains (compliance.md, missed item 1).
//
// AI-drafted replies say so, and say a person reviews them (compliance.md
// section 4: Maine 10 M.R.S. 1500-DD, Utah's outset-disclosure safe harbor).
// Replies are always drafts a person sends (`qualify.auto_send_replies` is
// the literal false), so the sentence is true.
//
// Copy follows HOUSE_STYLE section 4: plain words, no exclamation marks, no
// em dashes.

/** The opt-out sentence, word for word; the lint looks for it. */
export const OPT_OUT_LINE = "Reply 'unsubscribe' and I will not email you again.";

/** The configured unsubscribe URL when it is HTTPS (RFC 8058 one-click needs HTTPS), else "". */
export function unsubscribeUrl(config: EngineConfig): string {
  const url = config.sending.unsubscribe_url.trim();
  return /^https:\/\/[^\s]+$/i.test(url) ? url : "";
}

/** The CAN-SPAM advertisement identification line, plain and honest. */
export function adNotice(config: EngineConfig): string {
  return `This is a marketing email from ${config.firm.name}.`;
}

/** The signature and legal footer: sender, title and legal name, postal address, phone, and the opt-out. */
export function buildFooter(config: EngineConfig, mailbox: Mailbox): string {
  const title = mailbox.sender_title.trim();
  const lines = [
    mailbox.sender_name.trim(),
    title ? `${title}, ${config.firm.legal_name}` : config.firm.legal_name,
    config.firm.postal_address.trim(),
  ];
  if (config.firm.phone.trim()) lines.push(config.firm.phone.trim());
  const url = unsubscribeUrl(config);
  const optOut = url ? `${OPT_OUT_LINE} You can also opt out at ${url}` : OPT_OUT_LINE;
  return `${lines.filter(Boolean).join("\n")}\n\n${optOut}`;
}

/** The AI-assistance disclosure for drafted replies: truthful, short, names the person who reviews. */
export function aiDisclosure(config: EngineConfig, mailbox: Mailbox): string {
  return `This reply was drafted with an AI assistant. ${mailbox.sender_name.trim()} of ${config.firm.name} reviews every reply before it is sent.`;
}

/**
 * List-Unsubscribe (a mailto with subject "unsubscribe <touchId>", plus the
 * HTTPS URL when configured) and, only with a URL, List-Unsubscribe-Post for
 * RFC 8058 one-click. The mailto goes to `sending.unsubscribe_mailbox`, or
 * the sending mailbox when that is blank.
 */
export function listUnsubscribeHeaders(config: EngineConfig, mailbox: Mailbox, touchId: string): Record<string, string> {
  const to = config.sending.unsubscribe_mailbox.trim() || mailbox.email;
  const mailto = `<mailto:${to}?subject=${encodeURIComponent(`unsubscribe ${touchId}`)}>`;
  const url = unsubscribeUrl(config);
  if (!url) return { "List-Unsubscribe": mailto };
  const link = `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(touchId)}`;
  return { "List-Unsubscribe": `<${link}>, ${mailto}`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
