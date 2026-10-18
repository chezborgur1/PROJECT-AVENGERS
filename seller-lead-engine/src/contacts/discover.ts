import { normalizeEmail } from "../domain/schema.ts";
import { isValidEmailSyntax } from "./verify.ts";

// Finds the addresses a business publishes on its own website: the home
// page, /contact, /contact-us and /about, on the same host only. This is the
// primary discovery path (docs/research/data.md section 5) and is kept
// deliberately narrow, because CAN-SPAM treats harvesting from a site whose
// operator says it will not give out addresses, and generated address
// permutations, as aggravated violations (15 U.S.C. 7704(b)(1);
// docs/research/compliance.md section 1 item 11 and section 9 rule 8):
//
// - robots.txt is honoured (RFC 9309): a Disallow that covers a page means
//   the page is not fetched. A robots.txt that cannot be reached (network
//   error or 5xx) means the whole site is off limits, as RFC 9309 2.3.1.4
//   says; a 4xx means there are no rules.
// - Any page with a "do not harvest" or "no unsolicited email" style notice
//   makes the whole site off limits: the notice speaks for the site, so
//   nothing found on any of its pages is returned.
// - Only addresses at the site's own domain are kept (no gmail.com
//   addresses of web designers, no third-party widgets).
// - Obfuscated addresses ("frank [at] example.com") are not decoded: an
//   owner who obfuscates is asking not to be collected.
// - No pattern guessing: an address is returned only when the page shows it.
//
// Every request goes through the injected fetchImpl.

/** The pages tried, in order. */
export const DISCOVERY_PATHS: readonly string[] = ["/", "/contact", "/contact-us", "/about"];
/** The product token this crawler matches in robots.txt groups. */
export const USER_AGENT_TOKEN = "AMBAdvisoryLeadEngine";
const USER_AGENT = `${USER_AGENT_TOKEN}/0.1 (contact discovery for AMB Advisory Services)`;

/** Notices that forbid collecting or emailing addresses from the site. */
export const NO_HARVEST_PATTERNS: readonly RegExp[] = [
  /\bdo not harvest\b/i,
  /\bno (e-?mail )?harvesting\b/i,
  /\bnot (to )?be (harvested|collected)\b/i,
  /\bno unsolicited\b/i,
  /\bunsolicited (commercial )?(e-?mails?|messages|solicitations?|offers) (is|are|will be) (not|prohibited|unwelcome)/i,
  /\b(do not|don't|please do not) (send|e-?mail) (us )?(unsolicited|marketing|solicitations?)\b/i,
  /\bno solicitations?\b/i,
  /\bno soliciting\b/i,
  /\b(e-?mail )?addresses (on|from) this (site|website|page) (may|must|shall) not be (used|collected|harvested)/i,
];

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

/** The rules from robots.txt that apply to this crawler: its own group(s) when named, else the "*" group(s). */
export function parseRobots(text: string, token = USER_AGENT_TOKEN): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      lastWasAgent = false;
      // An empty Disallow allows everything; it adds no rule.
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const t = token.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && t.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function patternMatches(pattern: string, pathAndQuery: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(`^${body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
  return re.test(pathAndQuery);
}

/** RFC 9309 matching: the longest matching rule wins, and Allow wins a tie. No rule means allowed. */
export function robotsAllows(rules: readonly RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | undefined;
  for (const r of rules) {
    if (!patternMatches(r.pattern, pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/** Common HTML entities that hide "@" and "." in plain sight. */
function decodeEntities(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

/** The page's visible text (tags, scripts and styles removed). */
function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
}

/** True when the page carries a notice against harvesting or unsolicited email. */
export function hasNoHarvestNotice(html: string): boolean {
  const text = `${visibleText(html)} ${[...html.matchAll(/<meta[^>]+content=["']([^"']*)["']/gi)].map((m) => m[1]).join(" ")}`;
  return NO_HARVEST_PATTERNS.some((re) => re.test(text));
}

const FILE_TLDS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "css", "js", "ico", "bmp", "tif", "tiff", "pdf"]);

/** Addresses shown on a page (mailto links and plain text) at `siteDomain` or a subdomain of it. */
export function extractEmails(html: string, siteDomain: string): string[] {
  const found: string[] = [];
  const decoded = decodeEntities(html);
  for (const m of decoded.matchAll(/mailto:([^"'?\s<>]+)/gi)) {
    let addr = m[1]!;
    try {
      addr = decodeURIComponent(addr);
    } catch {
      // A malformed escape: keep the raw text, the syntax check decides.
    }
    found.push(addr);
  }
  for (const m of visibleText(html).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) found.push(m[0]);
  const site = siteDomain.toLowerCase();
  const out: string[] = [];
  for (const raw of found) {
    const e = normalizeEmail(raw).replace(/[.,;:]+$/, "");
    if (!isValidEmailSyntax(e)) continue;
    const domain = e.slice(e.lastIndexOf("@") + 1);
    if (FILE_TLDS.has(domain.slice(domain.lastIndexOf(".") + 1))) continue;
    if (domain !== site && !domain.endsWith(`.${site}`)) continue;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** "exampleair.com", "www.exampleair.com/" or "http://..." to a URL, or undefined when it is not a web address. */
export function siteUrl(website: string): URL | undefined {
  const w = website.trim();
  if (!w) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The addresses the business's own site publishes, with the page each was found on. */
export async function discoverEmails(website: string, opts: { fetchImpl?: typeof fetch; maxPages?: number }): Promise<{ email: string; url: string }[]> {
  const site = siteUrl(website);
  if (!site) return [];
  const fetchImpl = opts.fetchImpl ?? fetch;
  const origin = site.origin;
  const host = bareHost(site.hostname);
  const headers = { "User-Agent": USER_AGENT, Accept: "text/html,text/plain;q=0.9" };

  let rules: RobotsRule[];
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers });
    if (res.status >= 500) return []; // unreachable rules: complete disallow (RFC 9309 2.3.1.4)
    rules = res.ok ? parseRobots(await res.text()) : [];
  } catch {
    return [];
  }

  const results: { email: string; url: string }[] = [];
  const maxPages = Math.max(0, opts.maxPages ?? DISCOVERY_PATHS.length);
  for (const p of DISCOVERY_PATHS.slice(0, maxPages)) {
    if (!robotsAllows(rules, p)) continue;
    const url = `${origin}${p}`;
    let html: string;
    try {
      const res = await fetchImpl(url, { headers });
      if (!res.ok) continue;
      // A redirect off the site (another host) is not the business's own page.
      if (res.url && bareHost(new URL(res.url).hostname) !== host) continue;
      const type = res.headers.get("content-type") ?? "";
      if (type && !/text\/(html|plain)|application\/xhtml/i.test(type)) continue;
      html = await res.text();
    } catch {
      continue;
    }
    if (hasNoHarvestNotice(html)) return [];
    for (const email of extractEmails(html, host)) if (!results.some((r) => r.email === email)) results.push({ email, url });
  }
  return results;
}
