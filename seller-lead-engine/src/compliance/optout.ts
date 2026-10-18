// Deterministic opt-out and complaint detection on a reply's new text
// (quoted history already stripped). It runs before any classifier, and an
// opt-out it finds always wins over Claude: CAN-SPAM requires honouring an
// opt-out within 10 business days and Gmail expects 2 days
// (docs/research/compliance.md section 1 item 7), and section 9 rule 2 says
// the keyword match should err toward suppressing. So the patterns are
// broad on purpose; a false positive costs one prospect, a miss costs a
// violation.
//
// "Not interested" on its own is not an opt-out (it is a reply class), but
// "not interested, stop" is, through the "stop" patterns.

/** Lower case, straight quotes, single spaces. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const OPT_OUT_PATTERNS: readonly RegExp[] = [
  /\bun-?subscribe\b/,
  /\bunsub\b/,
  /\bremove (me|us|my (e-?mail|email address|address|name|info|information))\b/,
  /\bplease remove\b/,
  /\btake (me|us|my (e-?mail|email address|address|name)) off\b/,
  /\b(off|from) (of )?(your|the) (mailing |email |e-mail |contact )?lists?\b/,
  /\bstop (e-?mailing|emailing|sending|contacting|messaging|writing|reaching out)\b/,
  /\b(do not|don't|dont|never) (contact|e-?mail|email|write to|message|reach out to) (me|us)\b/,
  /\b(do not|don't|dont) (contact|e-?mail|email|write|message)\b/,
  /\bopt(ing|ed)?[ -]?out\b/,
  /\bno more (e-?mails|emails|messages|mail)\b/,
  /\bleave (me|us) alone\b/,
  /\bdelete (my|our) (e-?mail|email address|address|contact|info|information|data)\b/,
  /\bcease (all )?(contact|communications?|e-?mails?)\b/,
  // "stop" as its own clause: "Not interested, stop." or "Stop. Not interested."
  /(^|[.,;:!?-] ?)(please )?stop( please| it| now)?[.!]*$/,
  /^(please )?stop[.,;:!]/,
];

/** The whole reply is "stop" (or "stop please", "please stop", "STOP."). */
const STOP_ALONE = /^(please )?stop( please| it| now| this)?$/;

/** True when the reply asks, however worded, not to be emailed again. */
export function detectOptOut(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  const bare = t.replace(/[^a-z' ]/g, "").replace(/\s+/g, " ").trim();
  if (STOP_ALONE.test(bare)) return true;
  return OPT_OUT_PATTERNS.some((re) => re.test(t));
}

const COMPLAINT_PATTERNS: readonly RegExp[] = [
  /\bspam(med|ming|mer|mers|my)?\b/,
  /\breport(ed|ing)? (you|this|your|it|the email|this email)\b/,
  /\b(will|going to|i'll|i will) report\b/,
  /\bharass(ed|es|ing|ment)?\b/,
  /\bcease and desist\b/,
  /\battorney general\b/,
  /\blawyers?\b/,
  /\blegal action\b/,
  /\bsue (you|your)\b/,
  /\bftc\b/,
  /\bcan-?spam\b/,
];

/** True when the reply is hostile or threatens a report or legal action; it also suppresses and can pause the mailbox. */
export function detectComplaint(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return COMPLAINT_PATTERNS.some((re) => re.test(t));
}
