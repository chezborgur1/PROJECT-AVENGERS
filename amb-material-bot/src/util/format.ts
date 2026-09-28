// One place for how a number becomes text, in both deliverables' prose and
// in every CIM exhibit (guide 2.5, 4.6; design spec 4.1 and 14). Every figure
// printed in the CIM passes through one of these, so a table, a title and an
// observation can never disagree on rounding.

export const EN_DASH = "–";

/** Prose money, whole dollars in: "$3.04M", "$452.9K", "$8,500". Negatives use the minus form AMB writes in prose ("–$166K"). */
export function fmtMoney(v: number): string {
  const sign = v < 0 ? EN_DASH : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 100_000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  if (a >= 10_000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

/** Money quoted exactly, for salaries and rents: "$95,000". */
export function fmtDollars(v: number): string {
  const sign = v < 0 ? EN_DASH : "";
  return `${sign}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
}

/** A ratio as a percentage: 0.124 -> "12.4%". Margins use 1 dp; mix, growth in prose and shares use 0 dp. */
export function fmtPct(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return "n.a.";
  const a = (Math.abs(v) * 100).toFixed(dp) + "%";
  return v < 0 ? `(${a})` : a;
}

/** Growth rate between two values as a ratio (0.118 for +11.8%); NaN when the base is zero. */
export function growth(from: number, to: number): number {
  return from === 0 ? Number.NaN : to / from - 1;
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
  if (t === 0) return EN_DASH;
  const s = `${opts.dollar ? "$" : ""}${Math.abs(t).toLocaleString("en-US")}`;
  return t < 0 ? `(${s})` : s;
}

/** Whole thousands as a number, for chart values that must match the table's displayed figure. */
export const toK = (dollars: number): number => Math.round(dollars / 1000);

/** A count with thousands separators: 1450 -> "1,450". */
export function fmtCount(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

/**
 * Change between two ratios in basis points, signed, as one column's unit
 * (design spec 4.1: one unit per column, named in the header): +40 bps, –160 bps.
 */
export function fmtBps(from: number, to: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "n.a.";
  const bps = Math.round((to - from) * 10_000);
  if (bps === 0) return EN_DASH;
  return `${bps < 0 ? EN_DASH : "+"}${Math.abs(bps).toLocaleString("en-US")} bps`;
}

/** Growth as a table figure with the n.m. rule: from a zero or negative base, or to zero, the cell reads "n.m.". */
export function fmtGrowth(from: number, to: number, dp = 1): string {
  if (from <= 0 || to === 0) return "n.m.";
  return fmtPct(growth(from, to), dp);
}

/** A margin change in prose: "up 90 bps", "down 2.6 pts" (guide 4.6: bps under a point, pts otherwise). */
export function describeDelta(from: number, to: number): string {
  const pts = (to - from) * 100;
  if (Math.round(Math.abs(pts) * 100) === 0) return "flat";
  const dir = pts < 0 ? "down" : "up";
  return Math.abs(pts) < 1 ? `${dir} ${Math.round(Math.abs(pts) * 100)} bps` : `${dir} ${Math.abs(pts).toFixed(1)} pts`;
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
