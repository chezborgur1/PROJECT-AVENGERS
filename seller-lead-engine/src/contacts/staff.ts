import { STAFF_SOURCES, type ProspectRow } from "../domain/schema.ts";

// How many people work at a business, the size signal AMB trusts most for
// professional services. Public records give no headcount, so it comes from
// two places:
//
// - The business's own website, read during email discovery (discover.ts,
//   same robots.txt and "do not harvest" rules): a stated figure ("a team of
//   25", "40 employees") is taken as it is; otherwise the people a team or
//   about page lists are counted, which is a floor (team pages often show
//   only the principals).
// - An imported list with an employee count (a contacts CSV's employees
//   column, from a list AMB is licensed to use).
//
// A stated figure beats an imported one, which beats a counted page. The
// count is internal to scoring and the app; no email mentions it.

export { STAFF_SOURCES };
export type StaffSource = (typeof STAFF_SOURCES)[number];

/** A headcount and where it came from. */
export interface StaffEstimate {
  count: number;
  source: StaffSource;
  /** Plain words for the app and the score reason, e.g. "at least 8 people listed on the firm's website". */
  basis: string;
}

const strength = (s: string) => {
  const i = (STAFF_SOURCES as readonly string[]).indexOf(s);
  return i < 0 ? -1 : STAFF_SOURCES.length - i;
};

/** True when `next` should replace what the prospect has: a stronger source, or the same source with a newer reading. */
export function betterStaff(next: StaffEstimate, p: Pick<ProspectRow, "staff_count" | "staff_source">): boolean {
  if (p.staff_count === undefined || !p.staff_source) return true;
  return strength(next.source) >= strength(p.staff_source);
}

/** The prospect's fields for an estimate. */
export function staffFields(e: StaffEstimate): Pick<ProspectRow, "staff_count" | "staff_source" | "staff_basis"> {
  return { staff_count: e.count, staff_source: e.source, staff_basis: e.basis };
}

/** A short label for tables: "25", or "8+" when it is a floor. */
export function staffLabel(p: Pick<ProspectRow, "staff_count" | "staff_source">): string {
  if (p.staff_count === undefined) return "";
  return p.staff_source === "website_listed" ? `${p.staff_count}+` : String(p.staff_count);
}

const MIN = 1;
const MAX = 5000;
const plausible = (n: number) => Number.isInteger(n) && n >= MIN && n <= MAX && !(n >= 1900 && n <= 2100);
const QUALIFIER = "(?:over|more than|nearly|about|approximately|almost|some|around|a staff of|a team of)\\s+";
const ADJECTIVES = "(?:(?:dedicated|experienced|licensed|certified|skilled|talented|trained|professional|public|highly|full[- ]time|part[- ]time|in[- ]house|local|friendly)\\s+){0,3}";
const STAFF_NOUNS =
  "employees|team members|staff members|staff|professionals|accountants|cpas|bookkeepers|agents|engineers|architects|designers|technicians|techs|recruiters|managers|consultants|specialists|associates|advisors|advisers|people on staff";

/** Statements of headcount in page text, read as numbers. */
const STATED: readonly RegExp[] = [
  new RegExp(`\\b(?:team|staff)\\s+of\\s+(?:${QUALIFIER})?(\\d{1,4})\\+?(?!\\s*(?:years?|clients?|customers?|states?|countries|offices?|locations?|communities|associations|properties|units|homes|%))`, "gi"),
  new RegExp(`\\b(?:${QUALIFIER})?(\\d{1,4})\\+?\\s+${ADJECTIVES}(?:${STAFF_NOUNS})\\b`, "gi"),
  new RegExp(`\\bemploy(?:s|ing)?\\s+(?:${QUALIFIER})?(\\d{1,4})\\b`, "gi"),
];

/** The largest headcount a page's text states, or undefined. */
export function statedStaff(text: string): number | undefined {
  let best: number | undefined;
  for (const re of STATED) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1]);
      if (plausible(n) && (best === undefined || n > best)) best = n;
    }
  }
  return best;
}

/** Words that appear in headings but are never part of a person's name. */
const NOT_NAME = new Set(
  (
    "our the a an and of for with to in at by on from your you we us who why how what meet team staff leadership management board partners partner " +
    "about contact home services service learn read more view all bio bios profile profiles careers career join apply client clients testimonials reviews " +
    "blog news events resources faq faqs office offices location locations company group firm agency insurance accounting tax taxes bookkeeping payroll " +
    "engineering architecture marketing staffing technology solutions support consulting management association community communities property properties " +
    "call today now get free quote schedule request book appointment email phone fax address hours open monday tuesday wednesday thursday friday saturday sunday " +
    "florida tampa bay st saint petersburg clearwater sarasota orlando county street road avenue suite inc llc pa pllc corp co ltd " +
    "president owner founder director manager principal ceo cfo coo vice senior junior associate assistant administrator coordinator specialist " +
    "certified public accountant enrolled agent licensed agents engineer architect technician recruiter advisor consultant " +
    "mission vision values history story process approach industries industry experience expertise awards privacy policy terms copyright rights reserved"
  ).split(" "),
);

const NAME_TOKEN = /^(?:[A-Z][a-z]+(?:[-'’][A-Z]?[a-z]+)*|(?:Mc|Mac|O'|O’|De|Van|La|Le)[A-Z][a-z]+|[A-Z]\.?)$/;

/** True when a short heading reads as one person's name ("Jane Q. Smith, CPA" and "John O'Neil" do; "Our Services" does not). */
export function looksLikePersonName(raw: string): boolean {
  // Credentials and titles after a comma, dash or bar are not part of the name.
  const name = raw.split(/\s*[,|–-]\s+|\s+[|]\s*/)[0]!.replace(/\s+/g, " ").trim();
  const tokens = name.split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (!tokens.every((t) => NAME_TOKEN.test(t))) return false;
  if (tokens.some((t) => NOT_NAME.has(t.toLowerCase().replace(/[.'’]/g, "")))) return false;
  // At least a first and a last name of two letters or more (an initial alone is not a name).
  return tokens.filter((t) => t.replace(/[^A-Za-z]/g, "").length >= 2).length >= 2;
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

/** The distinct people a team page lists: schema.org Person entries and person-name headings. */
export function listedPeople(html: string): string[] {
  const names = new Map<string, string>();
  const add = (n: string) => {
    const clean = n.replace(/\s+/g, " ").trim();
    if (looksLikePersonName(clean)) names.set(clean.split(/\s*[,|–-]\s+/)[0]!.toLowerCase(), clean);
  };
  for (const m of html.matchAll(/"@type"\s*:\s*"Person"[^{}]*?"name"\s*:\s*"([^"]{3,80})"|"name"\s*:\s*"([^"]{3,80})"[^{}]*?"@type"\s*:\s*"Person"/g)) add(m[1] ?? m[2] ?? "");
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>|<!--[\s\S]*?-->/gi, " ");
  for (const m of body.matchAll(/<(h[2-6]|strong|b)\b[^>]*>([\s\S]{2,160}?)<\/\1>/gi)) add(stripTags(m[2]!));
  for (const m of body.matchAll(/<(\w+)\b[^>]*class=["'][^"']*\b(?:name|member-name|team-name|staff-name|person-name)\b[^"']*["'][^>]*>([\s\S]{2,160}?)<\/\1>/gi)) add(stripTags(m[2]!));
  return [...names.values()];
}

/** True for a page whose address or title says it is about the people. */
export function isTeamPage(url: string, html: string): boolean {
  const pathPart = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();
  if (/team|staff|people|leadership|professionals|agents|meet|bios|who-we-are|our-firm|about/.test(pathPart)) return true;
  const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") + " " + stripTags(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "");
  return /\b(team|staff|people|leadership|meet|our professionals|our agents)\b/i.test(title);
}

/** Links on a page to the site's own team or about pages, at most `max`, most specific first. */
export function teamLinks(html: string, pageUrl: string, max = 2): string[] {
  const base = new URL(pageUrl);
  const host = base.hostname.replace(/^www\./, "");
  const found: { url: string; rank: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]!, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, "") !== host) continue;
    const words = `${u.pathname} ${stripTags(m[2]!)}`.toLowerCase();
    const rank = /team|staff|our people|leadership|professionals|meet|bios|our agents/.test(words) ? 0 : /about|who we are|our firm/.test(words) ? 1 : -1;
    if (rank < 0) continue;
    u.hash = "";
    if (u.pathname === base.pathname || found.some((f) => f.url === u.href)) continue;
    found.push({ url: u.href, rank });
  }
  return found.sort((a, b) => a.rank - b.rank).slice(0, max).map((f) => f.url);
}

/** The best estimate from a site's pages (text and HTML by URL), or undefined when the site says nothing usable. */
export function estimateFromPages(pages: readonly { url: string; html: string; text: string }[]): StaffEstimate | undefined {
  let stated: number | undefined;
  for (const p of pages) {
    const n = statedStaff(p.text);
    if (n !== undefined && (stated === undefined || n > stated)) stated = n;
  }
  if (stated !== undefined) return { count: stated, source: "website_stated", basis: `about ${stated} staff, per the firm's own website` };
  let listed = 0;
  for (const p of pages) if (isTeamPage(p.url, p.html)) listed = Math.max(listed, listedPeople(p.html).length);
  // One name is the owner's bio, not a headcount.
  if (listed >= 2) return { count: listed, source: "website_listed", basis: `at least ${listed} people listed on the firm's own website` };
  return undefined;
}

/** An imported employee figure ("18", "11-50", "50+", "1,200") as an estimate; a range counts from its low end. */
export function importedStaff(raw: string): StaffEstimate | undefined {
  const s = raw.replace(/,/g, "").trim();
  const m = /^(\d{1,5})\s*(?:(?:-|to|–)\s*(\d{1,5})|\+)?$/.exec(s);
  if (!m) return undefined;
  const low = Number(m[1]);
  if (!plausible(low)) return undefined;
  const label = m[2] ? `${low} to ${m[2]}` : s.endsWith("+") ? `${low} or more` : String(low);
  return { count: low, source: "import", basis: `${label} employees, per an imported list` };
}
