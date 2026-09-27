/** $3.04M, $452K, $8,500 — the way a CIM quotes numbers in prose. */
export function fmtMoney(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}K`;
  return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
}

export function fmtPct(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return "n/a";
  return `${(v * 100).toFixed(dp)}%`;
}

/** Table cells in $000s: 3,040.8 -> "3,041"; negatives in parentheses. */
export function fmtThousands(v: number): string {
  const k = Math.round(v / 1000);
  if (k === 0) return "–";
  const s = Math.abs(k).toLocaleString("en-US");
  return k < 0 ? `(${s})` : s;
}
