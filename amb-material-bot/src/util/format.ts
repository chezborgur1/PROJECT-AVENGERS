// One place for how a number becomes text, in both deliverables' prose and
// in every CIM exhibit (guide 2.5, 4.6; design spec 4.1 and 14). Every figure
// printed in the CIM passes through one of these, so a table, a title and an
// observation can never disagree on rounding.

export const EN_DASH = "–";
/** The minus sign (U+2212) of a signed change; the en dash stays the zero mark, so the two never sit side by side as one glyph (spec 4.1). */
export const MINUS = "\u2212";

/** Prose money, whole dollars in: "$3.04M", "$452.9K", "$3.1K", "$850" (guide 4.6; exact salaries use fmtDollars). Negatives use the minus form AMB writes in prose ("–$166K"). */
export function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return "n.a.";
  const sign = v < 0 ? EN_DASH : "";
  // To the cent first: $95,000 × 1.15 computes as 109,249.99…, which would print $109.2K for $109,250.
  const a = Math.round(Math.abs(v) * 100) / 100;
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

/**
 * The customer list's term ("Customer", "Client") as the deck writes it,
 * singular and plural, lower case and capitalised: the one noun for
 * customers across the CIM, so "account" and "customer" never mix (QA round 3 F37).
 */
export function customerNoun(term: string | undefined): { one: string; many: string; One: string; Many: string } {
  const one = (term ?? "Customer").toLowerCase();
  const many = /[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : `${one}s`;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return { one, many, One: cap(one), Many: cap(many) };
}

/** A clause's first letter in lower case, to run a source's sentence on after "The owner is". */
export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Money quoted exactly, for salaries and rents: "$95,000". */
export function fmtDollars(v: number): string {
  if (!Number.isFinite(v)) return "n.a.";
  const sign = v < 0 ? EN_DASH : "";
  return `${sign}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
}

/** A ratio as a percentage: 0.124 -> "12.4%". Margins use 1 dp; mix, growth in prose and shares use 0 dp. */
export function fmtPct(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return "n.a.";
  const a = (Math.abs(v) * 100).toFixed(dp) + "%";
  return v < 0 ? `(${a})` : a;
}

/**
 * Growth rate between two values as a ratio (0.118 for +11.8%); NaN from a
 * zero or negative base, where a ratio misleads (a loss of 50 turning into a
 * profit of 100 is not "down 300%").
 */
export function growth(from: number, to: number): number {
  return from <= 0 ? Number.NaN : to / from - 1;
}

/** Compound annual growth over `years` periods as a ratio; NaN when either end is not positive. */
export function cagr(from: number, to: number, years: number): number {
  return from > 0 && to > 0 && years > 0 ? (to / from) ** (1 / years) - 1 : Number.NaN;
}

/**
 * Table figure in whole thousands from whole dollars (design spec 4.1):
 * "$2,407", "(939)", "1,882", en dash for zero. `dollar` prefixes "$" on the
 * first row of a block and on subtotal and key rows only.
 */
export function k(dollars: number | null | undefined, opts: { dollar?: boolean } = {}): string {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return "";
  const t = Math.round(dollars / 1000);
  // A true zero is the dash; a real amount under $500 still prints, as 0, so the column visibly foots.
  if (t === 0) return Math.abs(dollars) >= 1 ? "0" : EN_DASH;
  const s = `${opts.dollar ? "$" : ""}${Math.abs(t).toLocaleString("en-US")}`;
  return t < 0 ? `(${s})` : s;
}

/**
 * Whole-percent shares of `parts` that add to exactly 100 (largest remainder):
 * each part gets its floor, then the parts with the largest remainders get one
 * more point until the total is 100, so a mix never prints 101% (guide 4.8).
 */
export function wholeShares(parts: number[]): number[] {
  const total = parts.reduce((s, v) => s + v, 0);
  if (!total) return parts.map(() => 0);
  const exact = parts.map((v) => (100 * v) / total);
  const out = exact.map(Math.floor);
  const order = exact.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0, left = 100 - out.reduce((s, v) => s + v, 0); left > 0; k++, left--) out[order[k % order.length]!.i]! += 1;
  return out;
}

/** Whole thousands as a number, for chart values that must match the table's displayed figure. */
export const toK = (dollars: number): number => Math.round(dollars / 1000);

/**
 * The article a figure takes as it is read aloud: "an" before 8, 11 and 18
 * ("an 11.4% margin", "an $80K reserve", "an 18,000-member base"), "a"
 * otherwise ("a 110-day cycle", "a 1,100-hour year") (guide 4.2).
 */
export function indefinite(figure: string): "a" | "an" {
  return /^\$?(8|1[18](?!\d))/.test(figure.trim()) ? "an" : "a";
}

/** A count with thousands separators: 1450 -> "1,450". */
export function fmtCount(v: number): string {
  if (!Number.isFinite(v)) return "n.a.";
  return Math.round(v).toLocaleString("en-US");
}

/** A ratio as the page shows it at `dp` decimals of a percent, so a change is taken between the figures a reader sees (guide 4.5 rule 6). */
const shown = (v: number, dp: number) => Math.round(v * 100 * 10 ** dp) / (100 * 10 ** dp);

/**
 * Change between two ratios in basis points, signed, as one column's unit
 * (design spec 4.1: one unit per column, named in the header): +40 bps, −160 bps.
 * Taken between the levels as printed at `dp` (61.0% to 61.9% is +90 bps).
 */
export function fmtBps(from: number, to: number, dp = 1): string {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "n.a.";
  const bps = Math.round((shown(to, dp) - shown(from, dp)) * 10_000);
  if (bps === 0) return EN_DASH;
  return `${bps < 0 ? MINUS : "+"}${Math.abs(bps).toLocaleString("en-US")} bps`;
}

/** Growth as a table figure with the n.m. rule: from a zero or negative base, or to zero, the cell reads "n.m.". */
export function fmtGrowth(from: number, to: number, dp = 1): string {
  if (from <= 0 || to === 0) return "n.m.";
  return fmtPct(growth(from, to), dp);
}

/** A margin change in prose: "up 90 bps", "down 2.6 pts" (guide 4.6: bps under a point, pts otherwise), between the levels as printed at `dp`. */
export function describeDelta(from: number, to: number, dp = 1): string {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "n.a.";
  const pts = (shown(to, dp) - shown(from, dp)) * 100;
  if (Math.round(Math.abs(pts) * 100) === 0) return "flat";
  const dir = pts < 0 ? "down" : "up";
  return Math.abs(pts) < 1 ? `${dir} ${Math.round(Math.abs(pts) * 100)} bps` : `${dir} ${Math.abs(pts).toFixed(1)} pts`;
}

/**
 * Typographic quotes (design spec 3): an apostrophe or closing single quote
 * after a letter, digit or closing punctuation becomes ’, an opening one ‘;
 * double quotes open after a space or bracket and close otherwise. Georgia
 * Bold draws a straight apostrophe as a vertical tick.
 */
export function smartQuotes(text: string): string {
  return text
    .replace(/(^|[\s([{\u2014\u2013“])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/(^|[\s([{\u2014\u2013‘])"/g, "$1“")
    .replace(/"/g, "”");
}

/** Fiscal-year range for sources and annotations: "FY2023–FY2025". */
export function fyRange(years: number[]): string {
  if (years.length === 0) return "";
  if (years.length === 1) return `FY${years[0]}`;
  return `FY${years[0]}${EN_DASH}FY${years[years.length - 1]}`;
}

/** "October 2026" for the cover. */
export function monthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
