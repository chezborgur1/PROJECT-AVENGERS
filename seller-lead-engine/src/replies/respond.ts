import type { EngineConfig, Mailbox } from "../config.ts";
import { joinList, type LeadRow, type ProspectRow } from "../domain/schema.ts";
import { aiDisclosure, buildFooter } from "../compliance/footer.ts";
import { nextQuestions } from "../qualify/questions.ts";
import type { Classification } from "./classify.ts";

// The drafted answer to an owner's reply. Always a draft: a person reads and
// sends every AI-drafted reply (`qualify.auto_send_replies` is the literal
// false; docs/research/deliverability.md section 4: "Keep AI replies to
// prospects in draft mode permanently").
//
// Copy rules (DESIGN.md principles 5, 7 and 10; amb-material-bot HOUSE_STYLE
// section 4): short, plain, first person from the named sender, "AMB
// Advisory Services" on first mention and "AMB Advisory" after, no
// exclamation marks, no em dashes, nothing about the owner's age, health,
// family or succession, and no fact the records or the owner did not give.
// Every body ends with the AI-assistance disclosure and the CAN-SPAM footer:
// follow-ups that keep promoting AMB are still commercial messages
// (docs/research/compliance.md, verification row 1 and missed item 6), and
// the disclosure covers Maine 10 M.R.S. 1500-DD and Utah's outset safe
// harbor (compliance.md section 4).
//
// The FAQ answers are fixed text, not Claude's words, so each is true as
// written: the address came from public licence and state filing records
// and the business's website (how this engine finds owners), the check is
// free with no obligation (FTC Free Guide, 16 CFR 251), and "are you a
// bot?" gets a straight yes-it-was-AI-drafted answer (California BOT Act,
// B&P 17941; Utah AI Policy Act).
//
// Unsubscribe, bounce, auto-reply and complaint get no reply at all: an
// opt-out is honoured by silence, and machine mail has no one to answer.
// "other" also gets none; a person reads it.

/** A drafted reply: subject, body (disclosure and footer included), and the intake question keys it asks. */
export interface DraftedResponse {
  subject: string;
  body: string;
  questionKeys: string[];
}

/** Most intake questions in one reply (docs/research/offer.md section 4 asks for bands, a few at a time). */
export const MAX_QUESTIONS_PER_REPLY = 3;

/** "John" -> "John", "JOHN" -> "John"; "" stays "". */
function firstName(raw: string): string {
  const s = raw.trim().split(/\s+/)[0] ?? "";
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

/** The business name without its legal suffix ("Example Air Inc" -> "Example Air"). */
export function shortBusinessName(name: string): string {
  return name
    .replace(/[,.]?\s+(inc|incorporated|llc|l\.l\.c|corp|corporation|co|company|pa|p\.a|pllc|ltd|lp|llp)\.?$/i, "")
    .trim();
}

/** A name that ends a sentence, with one full stop: "Example Air, Inc." stays as it is, never "Inc..". */
export function stop(name: string): string {
  const s = name.trim();
  return s.endsWith(".") ? s : `${s}.`;
}

/** "Re: <subject>" with any existing Re:/Fwd: prefixes folded into one. */
export function replySubject(original: string | undefined, fallback: string): string {
  const base = (original ?? "").replace(/^\s*((re|fwd?|fw|aw|wg)\s*:\s*)+/i, "").trim() || fallback;
  return `Re: ${base}`;
}

/** Names the firm in full the first time it is called, then by its short name (HOUSE_STYLE: "AMB Advisory Services", then "AMB Advisory"). */
function firmNamer(config: EngineConfig): () => string {
  let used = false;
  return () => {
    const name = used ? config.firm.short_name : config.firm.name;
    used = true;
    return name;
  };
}

/** The year the business's records start: earliest licence issue or formation. */
function sinceYear(p: ProspectRow): string {
  const years = [p.license_issue_date, p.formation_date].filter(Boolean).map((d) => d.slice(0, 4)).sort();
  return years[0] ?? "";
}

const VENDOR_NAMES: Record<string, string> = { hunter: "Hunter", snov: "Snov.io", apollo: "Apollo" };

interface FaqCtx {
  prospect: ProspectRow;
  config: EngineConfig;
  mailbox: Mailbox;
  firm: () => string;
}

/** The fixed answers, in the order they are given, each with the pattern that picks it. */
const FAQ: readonly { key: string; re: RegExp; answer: (c: FaqCtx) => string }[] = [
  {
    key: "source",
    re: /\bhow did you (get|find|obtain|come across)\b|\bwhere did you (get|find)\b|\bgot my (e-?mail|address|info|information|name)\b|\b(e-?mail|address|info|name) from\b|\bwho gave you\b/i,
    answer: ({ prospect }) => {
      // True for this engine: prospects come from licence-board and Secretary of State files, emails from the business's own site.
      const vendor = VENDOR_NAMES[prospect.email_source];
      const address = vendor
        ? ` Your email address came from ${vendor}, a business contact directory.`
        : prospect.email_source === "website" || prospect.email_source === ""
          ? " Your email address is the one listed on the business's website."
          : "";
      return `I found ${prospect.business_name} through the business's public licence and state filing records and the business's website.${address}`;
    },
  },
  {
    key: "who",
    re: /\bwho (are|is) (you|this|amb)\b|\bwhat (is|are) amb\b|\bwhat (do|does) (you|amb|your (firm|company)) do\b|\bwhat (company|firm)\b|\bnever heard of\b|\bwho do you work for\b|\bare you a broker\b/i,
    answer: ({ mailbox, firm }) => {
      const title = mailbox.sender_title.trim();
      const me = `I am ${mailbox.sender_name.trim()}${title ? `, ${title}` : ""} at ${firm()}.`;
      return `${me} ${firm()} works with owners of local businesses who want to know what their business is worth and what buyers look for, whether or not they plan to sell.`;
    },
  },
  {
    key: "why",
    re: /\bwhy (me|us|my (business|company))\b|\bwhat made you (contact|reach|email|write)\b|\bwhy (did|are|would) you (contact|email|writ\w*|reach)\b/i,
    answer: ({ prospect, config }) => {
      const year = sinceYear(prospect);
      const noun = config.verticals[prospect.vertical]?.noun ?? "business";
      return year
        ? `I wrote because the public records show ${prospect.business_name} operating since ${year}, and owners with that record often want to know where they stand.`
        : `I wrote because the public records list ${prospect.business_name} as a ${noun}${prospect.city ? ` in ${prospect.city}` : ""}, and owners of businesses like it often want to know where they stand.`;
    },
  },
  {
    key: "check",
    re: /\bwhat (is|does) (the|this|your) (check|assessment|readiness)\b|\bhow does (it|this|the check) work\b|\bwhat('s| is) involved\b|\bwhat do (you|i) need\b|\bwhat would i (get|need)\b|\bwhat (does|would) (it|that|this) (involve|entail|include)\b/i,
    answer: () =>
      "The check is a short set of questions by email. From your answers I send back a checklist of what buyers look at and, where your figures allow one, a rough value range. It is not an appraisal or a formal valuation.",
  },
  {
    key: "cost",
    re: /\b(cost|costs|charge|fee|fees|price|pricing|how much|pay|free|catch|obligation|commission)\b/i,
    answer: ({ firm }) => `The check is free, and there is no obligation to sell or to work with ${firm()}.`,
  },
  {
    key: "confidential",
    re: /\b(confidential\w*|private|privacy|keep (this|it) (quiet|between us)|who (will|would) (see|know)|share (my|this|the|these) (info|information|numbers|data|figures))\b|\bemployees (find out|know)\b/i,
    answer: ({ config, firm }) =>
      // With partner lead sales switched on, "never shared" would not be true, so the promise is narrowed to what holds.
      config.lead_sales.enabled
        ? "Before you share anything you want kept private, I will tell you exactly who would see it."
        : `What you tell me stays confidential. I use it only to prepare your check, and I do not share it outside ${firm()} without your permission.`,
  },
];

/** The FAQ keys a question matches, in answer order. */
export function faqTopics(question: string): string[] {
  return FAQ.filter((f) => f.re.test(question)).map((f) => f.key);
}

/** Numbered intake questions as plain lines. */
function questionList(lead: LeadRow): { lines: string; keys: string[] } {
  const qs = nextQuestions(lead, MAX_QUESTIONS_PER_REPLY);
  return { lines: qs.map((q, i) => `${i + 1}. ${q.text}`).join("\n"), keys: qs.map((q) => q.key) };
}

/** The drafted answer to a classified reply, or null when the class gets no reply (unsubscribe, bounce, auto_reply, complaint, other). */
export function draftResponse(
  cls: Classification,
  ctx: { prospect: ProspectRow; lead: LeadRow; config: EngineConfig; mailbox: Mailbox; subject?: string },
): DraftedResponse | null {
  const { prospect, lead, config, mailbox } = ctx;
  // Opt-outs are honoured by silence; machine mail has no one to answer; "other" needs a person.
  if (cls.optOut || cls.complaint) return null;
  if (["unsubscribe", "bounce", "auto_reply", "complaint", "other"].includes(cls.class)) return null;

  const firm = firmNamer(config);
  const faqCtx: FaqCtx = { prospect, config, mailbox, firm };
  const business = prospect.business_name;
  const asked = `${cls.question ?? ""} ${cls.notes}`;
  const answers = (keys: string[]) => FAQ.filter((f) => keys.includes(f.key)).map((f) => f.answer(faqCtx));
  const paragraphs: string[] = [];
  let questionKeys: string[] = [];

  switch (cls.class) {
    case "interested": {
      paragraphs.push(`Thank you for your reply. I would be glad to prepare the free exit-readiness check from ${firm()} for ${stop(business)}`);
      paragraphs.push(...answers(faqTopics(asked)));
      const q = questionList(lead);
      if (q.keys.length) {
        paragraphs.push("To put it together I need a few rough figures. Bands are fine, and please do not send tax returns or bank statements.");
        paragraphs.push(q.lines);
        paragraphs.push("With your answers I will send back a checklist of what buyers look at and, where your figures allow one, a rough value range. There is no cost and no obligation.");
        questionKeys = q.keys;
      } else {
        paragraphs.push("I have what I need from your earlier answers, and I will send the check once I have put it together.");
      }
      break;
    }
    case "question": {
      paragraphs.push("Thank you for your question.");
      const topics = faqTopics(asked);
      paragraphs.push(...answers(topics.length ? topics : ["who", "check"]));
      const q = questionList(lead);
      if (q.keys.length) {
        paragraphs.push("If you would like the check, these are the first questions I would ask. Rough bands are fine:");
        paragraphs.push(q.lines);
        questionKeys = q.keys;
      } else {
        paragraphs.push('If you would like the check, reply "yes" and I will prepare it.');
      }
      break;
    }
    case "asks_if_ai": {
      const title = mailbox.sender_title.trim();
      paragraphs.push(
        `That is a fair question, and you should have a straight answer. I am ${mailbox.sender_name.trim()}${title ? `, ${title}` : ""} at ${firm()}, and I am a real person. I use an AI assistant to draft some replies, including this one, and I read and approve every reply before it is sent.`,
      );
      paragraphs.push("If you would rather talk it through, reply with a good time and number and I will call you myself.");
      break;
    }
    case "not_now":
      paragraphs.push("Thank you for letting me know. I will stop the follow-up emails I had planned.");
      paragraphs.push(`If your plans change, reply to this email at any time and I will prepare the free exit-readiness check for ${stop(business)}`);
      break;
    case "not_interested":
      paragraphs.push("Thank you for your reply, and I am sorry to have taken your time. I will not send any more emails in this series.");
      break;
    case "wrong_person":
      // processInbox suppresses this address and prospect permanently, so the promise is kept.
      paragraphs.push("Thank you for letting me know, and I am sorry for the mix-up. I have taken this address off my list and will not email it again.");
      break;
    case "referral":
      paragraphs.push(
        `Thank you for pointing me to the right person. I will not add anyone to my list from your note. If they would like the free exit-readiness check from ${firm()}, they are welcome to write to me at ${mailbox.email}.`,
      );
      break;
    default:
      return null;
  }

  const hello = firstName(prospect.owner_first_name || lead.owner_name);
  const sender = firstName(mailbox.sender_name);
  const body = [`${hello ? `Hi ${hello}` : "Hello"},`, ...paragraphs, sender].join("\n\n");
  const fallbackSubject = `Exit-readiness check for ${shortBusinessName(business)}`;
  return {
    subject: replySubject(ctx.subject, fallbackSubject),
    body: `${body}\n\n${aiDisclosure(config, mailbox)}\n\n${buildFooter(config, mailbox)}`,
    questionKeys,
  };
}

/** The lead's questions_asked after a draft that asked `keys`. */
export function withQuestionsAsked(lead: LeadRow, keys: readonly string[]): string {
  return joinList([...lead.questions_asked.split(";"), ...keys]);
}
