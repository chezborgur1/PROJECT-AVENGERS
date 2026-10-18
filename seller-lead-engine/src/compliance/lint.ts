import type { EngineConfig, Mailbox } from "../config.ts";
import type { OutgoingMessage } from "../domain/messages.ts";
import { normalizeEmail } from "../domain/schema.ts";
import { isValidEmailSyntax } from "../contacts/verify.ts";
import { adNotice, aiDisclosure, buildFooter, OPT_OUT_LINE, unsubscribeUrl } from "./footer.ts";

// Copy and content checks for every outgoing email. Each function returns a
// list of plain-English issues (empty means clean); the gate turns any issue
// into a blocked send.
//
// Where the rules come from:
// - Subject lines (docs/research/compliance.md section 2 and section 9 rule
//   6): California B&P 17529.5(a)(3) and Washington CEMA (RCW 19.190, Brown
//   v. Old Navy, 2025) punish misleading subjects, including false urgency,
//   so subjects are literally true: no fake "Re:"/"Fwd:", no deadlines, no
//   invented buyers or offers, no implied prior contact.
// - Body voice: amb-material-bot/docs/HOUSE_STYLE.md section 4.4 banned
//   words (the list is ported from amb-material-bot/src/cim/copy.ts
//   BANNED_PHRASES), no em dashes, no exclamation marks, no rhetorical
//   questions, step 1 under 110 words with no links (DESIGN.md principle 10;
//   deliverability.md: no links in touch 1).
// - Sensitive facts (DESIGN.md principle 5): no email mentions or implies
//   the owner's age, health, family, death, divorce or succession.
// - Claims (compliance.md section 8, FTC Free Guide 16 CFR 251; section 9
//   rule 6): no appraisal, certified valuation or guarantee, except when the
//   sentence says it is not one.
// - Message (compliance.md section 9 rules 4 and 5): footer with the legal
//   name, postal address and opt-out; the ad notice on outreach; the AI
//   disclosure on replies; a From name with a real configured sender and the
//   firm (Balsam v. Trancos).

/** Banned words and constructions, from HOUSE_STYLE section 4.4 (ported from amb-material-bot BANNED_PHRASES). */
export const BANNED_PHRASES: readonly string[] = [
  "well-positioned", "well positioned", "poised", "strategically positioned", "robust", "best-in-class", "best in class",
  "world-class", "one of the leading", "premier", "well-established", "proven track record", "proven growth engine",
  "platform-sized", "scalable platform", "significant runway", "ample headroom", "high margin organization",
  "operational efficiencies", "strong leadership", "deep management team", "highly respected", "loyal customer base",
  "sticky customer base", "unlock value", "leverage synergies", "seamless", "cutting-edge", "state-of-the-art", "turnkey",
  "holistic", "comprehensive suite", "unique", "differentiated", "key differentiator", "moat", "impressively", "remarkably",
  "notably", "importantly", "highly achievable", "clear path", "in today's", "navigate", "delve", "tapestry", "testament to",
  "boasts", "stands out", "it is worth noting", "not only", "not just", "attractive", "compelling", "undervalued",
  "unparalleled", "dynamic", "above average", "below average",
];

/** Adjectives banned only when the sentence carries no figure (HOUSE_STYLE 4.4). */
export const BANNED_WITHOUT_NUMBER: readonly string[] = ["strong", "solid", "healthy", "significant", "substantial", "meaningful", "leading", "diversified", "loyal", "sticky"];

/** Filler sentence openers (HOUSE_STYLE 4.4). */
const BANNED_OPENERS = ["Furthermore", "Moreover", "Additionally"];

/** "leverage" as a verb; "leverage ratio" is fine. */
const LEVERAGE_VERB = /\bleverag(e|es|ed|ing)\b(?!\s+ratios?)/i;

/** Owner-sensitive topics (DESIGN.md principle 5), as patterns with the label reported. */
export const SENSITIVE_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: "age", re: /\b(age|aged|ageing|aging|elderly|older|oldest|how old|birthday|golden years|slow(ing)? down)\b|\byears?[- ]old\b|\bsenior (owners?|citizens?)\b/i },
  { label: "retirement (implies age)", re: /\b(retire|retired|retiring|retirement|retirees?)\b/i },
  { label: "health", re: /\b(your health|health (issues?|problems?|scare)|illness|ill health|sick|sickness|cancer|diagnos\w*|surgery|hospital\w*|disabilit\w*)\b/i },
  { label: "death", re: /\b(death|dead|die|died|dies|dying|deceased|passed away|passing away|funeral|widow\w*|estate planning|probate|inherit\w*|heirs?)\b/i },
  { label: "family", re: /\byour (family|wife|husband|spouse|sons?|daughters?|children|kids|grandchildren|grandkids)\b|\bfamily[- ]owned\b|\bnext generation\b/i },
  { label: "divorce", re: /\b(divorc\w*|alimony|custody|ex-wife|ex-husband)\b/i },
  { label: "succession", re: /\b(succession|successors?)\b/i },
];

/** Value claims that need a negation in the sentence ("not an appraisal"). */
const CLAIM_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: "appraisal", re: /\bappraisals?\b/gi },
  { label: "certified valuation", re: /\bcertified valuations?\b/gi },
  { label: "guarantee", re: /\bguarantee(d|s)?\b/gi },
];

const URGENCY = ["urgent", "urgently", "final notice", "act now", "last chance", "limited time", "expires", "expiring", "deadline", "immediately", "time sensitive", "time-sensitive", "asap", "today only", "don't miss", "respond by", "action required"];
const INVENTED_OFFERS = ["buyer waiting", "buyers waiting", "buyer interested", "interested buyer", "buyer for your", "we have a buyer", "i have a buyer", "cash offer", "offer for your", "offer to buy", "pre-approved", "preapproved", "guaranteed", "free money"];
const PRIOR_CONTACT = ["as discussed", "as promised", "per our conversation", "per our call", "following up on our", "your request", "you requested", "your inquiry", "thanks for your interest", "our meeting", "our call"];

/** Upper-case words allowed in a subject (trade acronyms). */
export const ALLOWED_CAPS: readonly string[] = ["HVAC", "PLLC"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseRe = (p: string) => new RegExp(`(^|[^A-Za-z-])${escape(p)}(?=$|[^A-Za-z-])`, "i");

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Subject-line issues. Pass `step` above 1 to allow a truthful "Re:" on a follow-up in the same thread. */
export function lintSubject(subject: string, opts: { step?: number } = {}): string[] {
  const out: string[] = [];
  const s = subject.trim();
  if (s.length < 3) out.push(`subject is ${s.length} characters (minimum 3)`);
  if (s.length > 60) out.push(`subject is ${s.length} characters (maximum 60)`);
  if (/^\s*(fwd?|fw)\s*:/i.test(s)) out.push('subject starts with "Fwd:": the message was not forwarded');
  if (/^\s*re\s*:/i.test(s) && (opts.step ?? 1) <= 1) out.push('subject starts with "Re:" on a first message: it implies a prior conversation');
  for (const w of s.match(/\b[A-Z]{4,}\b/g) ?? []) if (!ALLOWED_CAPS.includes(w)) out.push(`subject has an all-caps word "${w}"`);
  if (s.includes("!")) out.push('subject has "!"');
  const lower = s.toLowerCase();
  for (const p of URGENCY) if (phraseRe(p).test(lower)) out.push(`subject implies false urgency ("${p}")`);
  for (const p of INVENTED_OFFERS) if (phraseRe(p).test(lower)) out.push(`subject invents an offer or buyer ("${p}")`);
  for (const p of PRIOR_CONTACT) if (phraseRe(p).test(lower)) out.push(`subject implies prior contact ("${p}")`);
  return out;
}

/** True when a negation ("not", "no", "isn't", "never") appears in the sentence before index `at`. */
function negatedBefore(sentence: string, at: number): boolean {
  return /\b(not|no|never|isn't|is not|without)\b/i.test(sentence.slice(Math.max(0, at - 40), at));
}

/** Body issues: banned words, dashes, "!", questions and links in step 1, sensitive topics, value claims, length. */
export function lintBody(body: string, opts: { step?: number; kind: "outreach" | "reply"; allow?: readonly string[] }): string[] {
  const out: string[] = [];
  let text = body;
  // Record facts such as a business name ("Smith & Sons Family Dental") are not copy: lint around them.
  for (const a of opts.allow ?? []) if (a.trim().length >= 3) text = text.replace(new RegExp(escape(a.trim()), "gi"), "the business");

  for (const b of BANNED_PHRASES) if (phraseRe(b).test(text)) out.push(`banned phrase "${b}"`);
  if (LEVERAGE_VERB.test(text)) out.push('banned phrase "leverage" as a verb');
  for (const s of sentences(text)) {
    for (const o of BANNED_OPENERS) if (s.startsWith(`${o},`) || s.startsWith(`${o} `)) out.push(`filler opener "${o}"`);
    if (!/\d/.test(s)) for (const b of BANNED_WITHOUT_NUMBER) if (new RegExp(`\\b${b}\\b`, "i").test(s)) out.push(`"${b}" without a number in the sentence`);
    for (const c of CLAIM_PATTERNS) {
      for (const m of s.matchAll(c.re)) if (!negatedBefore(s, m.index)) out.push(`claim "${c.label}": the check is a rough range, never an appraisal or a guarantee`);
    }
  }
  if (text.includes("\u2014")) out.push("em dash");
  if (/\s\u2013\s/.test(text)) out.push("en dash used as an em dash");
  if (text.includes("!")) out.push('exclamation mark "!"');
  for (const p of SENSITIVE_PATTERNS) {
    const m = p.re.exec(text);
    if (m) out.push(`mentions the owner's ${p.label} ("${m[0]}"): never in any email`);
  }
  const tokens = text.match(/\{[a-z_]+\}/g);
  if (tokens) out.push(`unrendered token ${[...new Set(tokens)].join(", ")}`);
  if (/\bAMB\b(?! Advisory)/.test(text) || /\bAmb\b/.test(text)) out.push('"AMB" alone: write "AMB Advisory Services", then "AMB Advisory"');
  const first = /AMB Advisory( Services)?/.exec(text);
  if (first && !first[1]) out.push('first mention of the firm must be "AMB Advisory Services"');

  if (opts.kind === "outreach" && (opts.step ?? 1) === 1) {
    for (const s of sentences(text)) if (s.endsWith("?")) out.push(`question in step 1 ("${s}")`);
    if (/\b(https?:\/\/|www\.)\S+/i.test(text) || /(?<![@\w.-])[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|co|us|biz|info)\b(?!@)/i.test(text)) out.push("link in step 1");
    const words = wordCount(body);
    if (words > 110) out.push(`step 1 is ${words} words before the footer (maximum 110)`);
  }
  return [...new Set(out)];
}

/** Words in a text: runs that contain a letter or digit. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The configured mailbox for an address, case-insensitively. */
export function findMailbox(config: EngineConfig, email: string): Mailbox | undefined {
  const e = normalizeEmail(email);
  return config.mailboxes.find((m) => normalizeEmail(m.email) === e);
}

/**
 * Whole-message issues: subject, body copy (footer, ad notice and AI
 * disclosure taken out first), footer contents, notices, recipient and From
 * name. `allow` lists record facts (business names) the body lint skips.
 */
export function lintMessage(msg: OutgoingMessage, config: EngineConfig, opts: { allow?: readonly string[] } = {}): string[] {
  const out: string[] = [];
  const mailbox = findMailbox(config, msg.mailbox);
  if (!mailbox) out.push(`mailbox ${msg.mailbox} is not in config.mailboxes`);
  if (!isValidEmailSyntax(msg.to)) out.push(`recipient "${msg.to}" is not a valid email address`);

  if (msg.kind === "outreach") out.push(...lintSubject(msg.subject, msg.step !== undefined ? { step: msg.step } : {}));
  else if (!msg.subject.trim()) out.push("subject is blank");

  // Take out the fixed text this module writes, so the copy lint sees only the copy.
  let core = msg.body;
  const fixed = [mailbox ? buildFooter(config, mailbox) : "", adNotice(config), mailbox ? aiDisclosure(config, mailbox) : ""].filter(Boolean);
  for (const f of fixed) core = core.split(f).join("\n");
  out.push(...lintBody(core, { kind: msg.kind, ...(msg.step !== undefined ? { step: msg.step } : {}), ...(opts.allow ? { allow: opts.allow } : {}) }));

  const body = squash(msg.body);
  const address = config.firm.postal_address.trim();
  if (!address) out.push("firm.postal_address is blank: CAN-SPAM requires a valid postal address (16 CFR 316.2(p))");
  else if (!body.includes(squash(address))) out.push("footer is missing the postal address");
  if (!body.includes(squash(config.firm.legal_name))) out.push(`footer is missing the legal name "${config.firm.legal_name}"`);
  const url = unsubscribeUrl(config);
  if (!body.includes(squash(OPT_OUT_LINE)) && !/reply\s+["']?unsubscribe["']?/i.test(msg.body) && !(url && msg.body.includes(url))) {
    out.push("footer is missing the opt-out instruction");
  }
  if (config.sending.unsubscribe_url.trim() && !url) out.push("sending.unsubscribe_url must be an https:// URL");
  if (msg.kind === "outreach" && !body.includes(squash(adNotice(config)))) out.push("outreach is missing the advertisement notice");
  if (msg.kind === "reply" && !/\bAI assistant\b/i.test(msg.body)) out.push("reply is missing the AI-assistance disclosure");

  const from = msg.fromName.toLowerCase();
  const senders = mailbox ? [mailbox.sender_name] : config.mailboxes.map((m) => m.sender_name);
  if (!senders.some((n) => n.trim() && from.includes(n.trim().toLowerCase()))) {
    out.push(`From name "${msg.fromName}" does not name the mailbox's configured sender`);
  }
  if (![config.firm.name, config.firm.short_name, config.firm.legal_name].some((n) => n.trim() && from.includes(n.trim().toLowerCase()))) {
    out.push(`From name "${msg.fromName}" does not name the firm (Balsam v. Trancos)`);
  }
  return [...new Set(out)];
}
