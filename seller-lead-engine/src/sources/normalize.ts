// Name, address, date and status normalisation shared by every importer and
// by the merge step. State files spell the same business several ways
// ("BAYSHORE PLUMBING CO." on Sunbiz, "Bayshore Plumbing Company" on a DBPR
// licence), so records are joined on a normalised key (name + 5-digit zip)
// rather than on raw text. People's names arrive as "LAST, FIRST M" or
// "FIRST M LAST" and in capitals; emails need "Donald", not "DONALD".
//
// Registered agents, qualifiers and company names sit in the same slots as
// owners in state files (docs/research/data.md, verification notes 1, 7 and
// 9), so `isPersonName` is the guard that keeps a firm from becoming an owner.

/** Legal-form words dropped from the end of a business name before matching. */
const BUSINESS_SUFFIXES = new Set([
  "INC", "INCORPORATED", "LLC", "LC", "CORP", "CORPORATION", "CO", "COMPANY", "PA", "PLLC", "PC", "LTD", "LIMITED", "LP", "LLP", "LLLP",
]);

/** Upper case, "&" as AND, punctuation removed (periods join: "L.L.C." -> "LLC"), spaces collapsed. */
function cleanUpper(s: string): string {
  return s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/['.’]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Upper case, punctuation stripped, legal suffixes (INC, LLC, CORP, CO, PA, PLLC, LTD) and a leading "THE" removed, spaces collapsed. */
export function normalizeBusinessName(name: string): string {
  const tokens = cleanUpper(name).split(" ").filter(Boolean);
  // "L L C" survives as separate letters when a file spaces the periods out.
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]!;
    if (BUSINESS_SUFFIXES.has(last)) {
      tokens.pop();
      continue;
    }
    const tail3 = tokens.slice(-3).join("");
    const tail2 = tokens.slice(-2).join("");
    if (tokens.length > 3 && BUSINESS_SUFFIXES.has(tail3) && tokens.slice(-3).every((t) => t.length === 1)) {
      tokens.splice(-3);
      continue;
    }
    if (tokens.length > 2 && BUSINESS_SUFFIXES.has(tail2) && tokens.slice(-2).every((t) => t.length === 1)) {
      tokens.splice(-2);
      continue;
    }
    break;
  }
  if (tokens.length > 1 && tokens[0] === "THE") tokens.shift();
  return tokens.join(" ");
}

const STREET_WORDS: Record<string, string> = {
  STREET: "ST", AVENUE: "AVE", AV: "AVE", ROAD: "RD", DRIVE: "DR", BOULEVARD: "BLVD", LANE: "LN", COURT: "CT", PLACE: "PL",
  PARKWAY: "PKWY", HIGHWAY: "HWY", CIRCLE: "CIR", TERRACE: "TER", TRAIL: "TRL", SQUARE: "SQ", EXPRESSWAY: "EXPY", CAUSEWAY: "CSWY",
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
};
const UNIT_WORDS = new Set(["SUITE", "STE", "UNIT", "APT", "BLDG", "BUILDING", "RM", "ROOM", "FL", "FLOOR", "LOT"]);

/** Upper case with USPS-style abbreviations (STREET -> ST, AVENUE -> AVE); suite and unit designators ("SUITE 200", "STE 3", "# 4") dropped. */
export function normalizeStreet(street: string): string {
  const s = street
    .toUpperCase()
    .replace(/#\s*\S+/g, " ") // "# 4", "#4B"
    .replace(/['.,]/g, " ")
    .replace(/[^A-Z0-9/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const out: string[] = [];
  const tokens = s.split(" ").filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (UNIT_WORDS.has(t)) {
      i++; // the unit number that follows the designator
      continue;
    }
    out.push(STREET_WORDS[t] ?? t);
  }
  return out.join(" ");
}

/** The first five digits of a zip ("33612-1234" -> "33612"); "" when there are fewer than five. */
export function zip5(zip: string): string {
  const m = /^\s*(\d{5})/.exec(zip ?? "");
  return m ? m[1]! : "";
}

/** The join key for a business across files: normalised name + "|" + 5-digit zip. */
export function matchKey(name: string, zip: string): string {
  return `${normalizeBusinessName(name)}|${zip5(zip)}`;
}

// "V" is left out: in "NGUYEN THANH V" it is a middle initial far more often than a generation.
const NAME_SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "ESQ", "MD", "DDS", "DMD", "PHD", "CPA", "PE"]);
const GENERATIONAL = new Set(["JR", "SR", "II", "III", "IV"]);

/** "MCDONALD" -> "McDonald", "O'BRIEN" -> "O'Brien", "SMITH-JONES" -> "Smith-Jones". */
export function titleCaseName(word: string): string {
  return word
    .toLowerCase()
    .split(/([-'’])/)
    .map((part) => {
      if (!part || /^[-'’]$/.test(part)) return part;
      const p = part.charAt(0).toUpperCase() + part.slice(1);
      return /^Mc[a-z]/.test(p) ? `Mc${p.charAt(2).toUpperCase()}${p.slice(3)}` : p;
    })
    .join("");
}

/**
 * Split a person's name into first and last, title-cased. Handles "LAST,
 * FIRST M", "FIRST M LAST" and generational suffixes (JR, SR, II, III),
 * which stay on `full` but never become the first or last name.
 */
export function splitPersonName(raw: string): { first: string; last: string; full: string } {
  const cleaned = raw.replace(/\s+/g, " ").replace(/\.(?=\s|$)/g, "").trim();
  if (!cleaned) return { first: "", last: "", full: "" };
  let given: string[];
  let family: string[];
  const suffixes: string[] = [];
  const takeSuffixes = (tokens: string[]) => tokens.filter((t) => {
    const up = t.replace(/[.,]/g, "").toUpperCase();
    if (NAME_SUFFIXES.has(up)) {
      if (GENERATIONAL.has(up)) suffixes.push(up === "JR" || up === "SR" ? titleCaseName(up) : up);
      return false;
    }
    return true;
  });
  if (cleaned.includes(",")) {
    const [lastPart, ...rest] = cleaned.split(",");
    family = takeSuffixes(lastPart!.trim().split(" ").filter(Boolean));
    given = takeSuffixes(rest.join(" ").trim().split(" ").filter(Boolean));
    if (!given.length && family.length > 1) {
      // "SMITH JR, " style garbage: fall back to first-last order
      given = family.slice(0, -1);
      family = family.slice(-1);
    }
  } else {
    const tokens = takeSuffixes(cleaned.split(" ").filter(Boolean));
    family = tokens.slice(-1);
    given = tokens.slice(0, -1);
  }
  const firstWord = given[0] ?? "";
  const first = titleCaseName(firstWord);
  const last = family.map(titleCaseName).join(" ");
  const middle = given.slice(1).map((t) => (t.length === 1 ? t.toUpperCase() : titleCaseName(t)));
  const full = [first, ...middle, last, ...suffixes].filter(Boolean).join(" ");
  return { first, last, full };
}

/** Words that mark a company, agent or office rather than a person. */
const ENTITY_WORDS = new Set([
  "INC", "INCORPORATED", "LLC", "LC", "CORP", "CORPORATION", "CO", "COMPANY", "PA", "PLLC", "PC", "LTD", "LIMITED", "LP", "LLP", "LLLP",
  "SERVICE", "SERVICES", "AGENT", "AGENTS", "REGISTERED", "TRUST", "TRUSTEE", "GROUP", "HOLDINGS", "ENTERPRISES", "ENTERPRISE",
  "ASSOCIATES", "PARTNERS", "PARTNERSHIP", "SOLUTIONS", "CONSULTING", "CONSULTANTS", "MANAGEMENT", "INTERNATIONAL", "BANK", "NATIONAL",
  "FIRM", "LAW", "OFFICE", "OFFICES", "SYSTEMS", "INDUSTRIES", "FRANCHISING", "FUND", "CAPITAL", "INVESTMENTS", "PROPERTIES", "AMERICA",
  "FLORIDA", "USA", "FOUNDATION", "CHURCH", "UNIVERSITY", "ASSOCIATION", "CORPORATE", "INCORPORATING", "COMPLIANCE", "FILINGS",
  // Trade and industry words: a licensee named "SUNCOAST AIR CONDITIONING" or "ACE ROOFING" with no legal
  // suffix is a business, not a person called "Suncoast" (REVIEW_R1.md item 26). Words that are also
  // common surnames (Mason, Carpenter, Painter, Plummer, Glass, Baker) are left out on purpose.
  "AIR", "CONDITIONING", "HEATING", "COOLING", "HVAC", "MECHANICAL", "REFRIGERATION", "COMFORT", "CLIMATE", "ENERGY", "SOLAR",
  "PLUMBING", "PLUMBERS", "ROOTER", "DRAIN", "DRAINS", "SEWER", "SEPTIC", "IRRIGATION", "ELECTRIC", "ELECTRICAL", "ROOFING", "ROOFS",
  "POOL", "POOLS", "PEST", "TERMITE", "EXTERMINATING", "CONTROL", "LAWN", "LANDSCAPE", "LANDSCAPING", "CLEANING", "JANITORIAL",
  "DENTAL", "DENTISTRY", "ORTHODONTICS", "CLINIC", "CONSTRUCTION", "CONTRACTING", "CONTRACTOR", "CONTRACTORS", "BUILDERS",
  "REPAIR", "REPAIRS", "MAINTENANCE", "INSTALLATION", "AUTOMOTIVE", "APPLIANCE", "SUPPLY", "HOMES",
]);

/** False for blanks, single words, digits, "&" pairs and anything with a company or agent word (INC, LLC, CORP, SERVICES, REGISTERED AGENT). */
export function isPersonName(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/\d/.test(s) || /&|\bAND\b|\/|@/i.test(s)) return false;
  const tokens = s.toUpperCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.some((t) => ENTITY_WORDS.has(t))) return false;
  const nameTokens = tokens.filter((t) => !NAME_SUFFIXES.has(t));
  return nameTokens.length >= 2 && nameTokens.every((t) => /^[A-Z][A-Z'’-]*$/.test(t));
}

/** Tokens kept in capitals when a business name is title-cased. */
const KEEP_UPPER = new Set(["LLC", "LC", "PA", "PLLC", "PC", "LP", "LLP", "LLLP", "HVAC", "AC", "A/C", "USA", "II", "III", "IV", "DDS", "DMD", "CPA"]);
const KEEP_LOWER = new Set(["OF", "AND", "THE", "AT", "IN", "ON", "FOR", "BY"]);

/** "GULFSIDE AIR CONDITIONING & HEATING, INC." -> "Gulfside Air Conditioning & Heating, Inc." for display in copy. */
export function titleCaseBusinessName(name: string): string {
  const words = name.trim().replace(/\s+/g, " ").split(" ");
  return words
    .map((w, i) => {
      const bare = w.replace(/[.,]/g, "").toUpperCase();
      if (KEEP_UPPER.has(bare)) return w.toUpperCase();
      if (i > 0 && KEEP_LOWER.has(bare)) return w.toLowerCase();
      // A short word with no vowels is an acronym ("TKS", "JRW").
      if (/^[B-DF-HJ-NP-TV-Z]{2,4}$/i.test(bare) && w === w.toUpperCase()) return w;
      return w.toLowerCase().replace(/(^|[-/(])([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
    })
    .join(" ");
}

/** "TAMPA" -> "Tampa", "ST. PETERSBURG" -> "St. Petersburg", "PINELLAS COUNTY" -> "Pinellas" (with stripCounty). */
export function titleCasePlace(place: string, opts: { stripCounty?: boolean } = {}): string {
  let s = place.trim().replace(/\s+/g, " ");
  if (opts.stripCounty) s = s.replace(/\s+county$/i, "");
  return s.toLowerCase().replace(/(^|[\s.-])([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Any date a state file uses as YYYY-MM-DD: ISO (with or without a time),
 * MM/DD/YYYY, M/D/YY is refused (two-digit years are ambiguous), MMDDYYYY
 * and YYYYMMDD. Blank and all-zero dates give "". Unreadable dates give
 * undefined so the caller can report the row instead of guessing.
 */
export function toIsoDate(raw: string | undefined): string | undefined {
  const s = (raw ?? "").trim();
  if (!s || /^0+$/.test(s) || /^0{1,2}\/0{1,2}\/0{4}$/.test(s)) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? iso(y, mo, d) : undefined;
  }
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? iso(y, mo, d) : undefined;
  }
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) {
    // Eight digits: MMDDYYYY when that reads as a real date, else YYYYMMDD.
    // The Sunbiz date format is unresolved in docs/research/data.md, so both are accepted.
    const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validYmd(y, mo, d)) return iso(y, mo, d);
    const y2 = Number(s.slice(0, 4));
    const mo2 = Number(s.slice(4, 6));
    const d2 = Number(s.slice(6, 8));
    if (validYmd(y2, mo2, d2)) return iso(y2, mo2, d2);
    return undefined;
  }
  return undefined;
}

const ACTIVE_WORDS = new Set(["active", "a", "current", "clear", "current active", "active current", "good standing", "open", "valid", "licensed"]);
const INACTIVE_PATTERN = /\b(inactive|expired|null|void|delinquent|revoked|suspended|closed|dissolved|cancel+ed|withdrawn|surrendered|retired|deceased|admin|i)\b/;

/** Licence and entity statuses as "active" or "inactive" when the words are clear; otherwise the raw value in lower case. */
export function normalizeStatus(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/[,;/]+/g, " ").replace(/\s+/g, " ");
  if (!s) return "";
  if (ACTIVE_WORDS.has(s)) return "active";
  if (INACTIVE_PATTERN.test(s)) return "inactive";
  return s;
}

/** "(813) 555-0142", "813.555.0142" and "+1 813 555 0142" all become "813-555-0142"; anything else is kept trimmed. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}` : raw.trim();
}
