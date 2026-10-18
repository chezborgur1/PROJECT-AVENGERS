import fs from "node:fs";
import path from "node:path";
import type { EngineConfig } from "../config.ts";
import { US_STATES, type ProspectRow } from "../domain/schema.ts";

// Where the engine may send: default deny. A message goes out only when the
// business is in a US state on `config.licensed_states`, the address is a
// US one, and the recipient's domain is neither a non-US country-code TLD
// nor an FCC wireless domain. Anything unknown blocks.
//
// Why each rule exists (docs/research/compliance.md):
// - Licensing (section 6 and verification row 22): soliciting business
//   sellers for compensation is licensed activity in Florida (Fla. Stat.
//   475.01) and California (B&P 10131(a)) among others, so the allow-list
//   must equal the states where AMB holds the licence or none is needed,
//   signed off by counsel. An empty list sends nothing.
// - Outside the US (section 3): CASL is opt-in and GDPR/PECR reach EU and UK
//   recipients, so .ca, .uk, EU and every other 2-letter ccTLD except .us is
//   refused, as are Canadian and Caribbean NANP area codes, which share +1.
// - Wireless domains (section 1 item 12; 47 CFR 64.3100): commercial email
//   to the FCC's listed carrier domains needs express prior authorization.

const REFERENCE = path.resolve(import.meta.dirname, "../../reference");
/** The FCC wireless domain list shipped with the engine (refresh monthly from the FCC). */
export const FCC_WIRELESS_FILE = path.join(REFERENCE, "fcc-wireless-domains.txt");

/** Read a one-domain-per-line list: lower-cased, "#" comments and blanks dropped. */
export function loadDomainList(file: string): Set<string> {
  const out = new Set<string>();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const d = line.replace(/#.*$/, "").trim().toLowerCase();
    if (d) out.add(d);
  }
  return out;
}

/** True when `domain` or any parent domain of it is in `list`. */
export function domainListed(domain: string, list: ReadonlySet<string>): boolean {
  const labels = domain.trim().toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (list.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

let fccCache: Set<string> | undefined;
/** The FCC wireless domain list, read once from reference/. */
export function fccWirelessDomains(): Set<string> {
  fccCache ??= loadDomainList(FCC_WIRELESS_FILE);
  return fccCache;
}

/** True for a domain on the FCC wireless list (or a subdomain of one). */
export function isFccWirelessDomain(domain: string, list: ReadonlySet<string> = fccWirelessDomains()): boolean {
  return domainListed(domain, list);
}

/**
 * Geographic gTLDs of places outside the US. Not ccTLDs, so the 2-letter
 * rule misses them; a short list of the common ones closes the gap.
 */
export const NON_US_GEO_TLDS: readonly string[] = [
  "quebec", "london", "berlin", "paris", "tokyo", "amsterdam", "barcelona", "madrid", "wien", "vlaanderen", "brussels",
  "scot", "wales", "cymru", "bayern", "hamburg", "koeln", "swiss", "irish", "eus", "gal", "cat", "istanbul", "sydney", "melbourne", "toronto",
];

/**
 * Canadian and Caribbean area codes in the NANP: +1, but not the US
 * (compliance.md section 3 names the Canadian ones; the Caribbean codes are
 * the independent and British territories). US territories (340, 670, 671,
 * 684, 787, 939) are not listed; their state value already fails the state
 * rule.
 */
export const NON_US_NANP_AREA_CODES: ReadonlySet<string> = new Set([
  // Canada
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343", "354", "365", "367", "368", "382", "387", "403", "416",
  "418", "428", "431", "437", "438", "450", "460", "468", "474", "506", "514", "519", "548", "579", "581", "584", "587", "600",
  "604", "613", "622", "639", "647", "672", "683", "705", "709", "742", "753", "778", "780", "782", "807", "819", "825", "867",
  "873", "879", "902", "905", "942",
  // Caribbean and Bermuda
  "242", "246", "264", "268", "284", "345", "441", "473", "649", "658", "664", "721", "758", "767", "784", "809", "829",
  "849", "868", "869", "876",
]);

/** The top-level domain of an email address or domain, lower case. */
export function tldOf(emailOrDomain: string): string {
  const domain = emailOrDomain.slice(emailOrDomain.lastIndexOf("@") + 1).trim().toLowerCase().replace(/\.$/, "");
  return domain.slice(domain.lastIndexOf(".") + 1);
}

/** Why a phone number is not a US one, or undefined when it is (or is blank). */
export function phoneBlock(phone: string): string | undefined {
  const raw = phone.trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && !raw.startsWith("+1")) return `phone ${raw} is outside the NANP (not a US number)`;
  if (raw.startsWith("011")) return `phone ${raw} is an international number`;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return undefined; // extensions and partial numbers: the state rule decides
  const area = national.slice(0, 3);
  if (NON_US_NANP_AREA_CODES.has(area)) return `phone area code ${area} is Canadian or Caribbean, not US`;
  return undefined;
}

/**
 * Why this business and address may not be emailed, or undefined when they
 * may. Checks, in order: licensed_states configured; state known, a US
 * state, and licensed; a US ZIP; a US phone when one is on record; the
 * email's TLD; the FCC wireless list.
 */
export function jurisdictionBlock(p: Pick<ProspectRow, "state" | "zip"> & { phone?: string }, email: string, config: EngineConfig): string | undefined {
  if (!config.licensed_states.length) {
    return "licensed_states is empty: no state has licensing sign-off, so nothing is sent (Fla. Stat. 475.01, Cal. B&P 10131)";
  }
  const state = p.state.trim().toUpperCase();
  if (!state) return "business state is unknown: default deny";
  if (!(US_STATES as readonly string[]).includes(state)) return `state "${p.state}" is not a US state`;
  if (!config.licensed_states.includes(state as (typeof US_STATES)[number])) {
    return `${state} is not in licensed_states (${config.licensed_states.join(", ")}): soliciting sellers there needs a licence or counsel sign-off`;
  }
  const zip = p.zip.trim();
  if (!zip) return "ZIP code is missing: cannot confirm a US address";
  if (!/^\d{5}(-?\d{4})?$/.test(zip)) return `ZIP "${zip}" is not a US ZIP code`;
  const phone = p.phone ? phoneBlock(p.phone) : undefined;
  if (phone) return phone;

  const at = email.lastIndexOf("@");
  const domain = at > 0 ? email.slice(at + 1).trim().toLowerCase() : "";
  if (!domain || !domain.includes(".")) return `recipient "${email}" has no valid domain`;
  const tld = tldOf(domain);
  if (/^[a-z]{2}$/.test(tld) && tld !== "us") return `recipient domain .${tld} is a non-US country code (CASL, GDPR and PECR are out of scope)`;
  if (NON_US_GEO_TLDS.includes(tld)) return `recipient domain .${tld} is a non-US geographic domain`;
  if (isFccWirelessDomain(domain)) return `recipient domain ${domain} is on the FCC wireless domain list (47 CFR 64.3100)`;
  return undefined;
}
