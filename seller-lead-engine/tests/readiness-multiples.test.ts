import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bandMatches, loadMultiples, parseSizeBand, pickMultiple, pickRevenueMultiple, type MultipleRow } from "../src/readiness/multiples.ts";
import { REPO, tmpDir } from "./helpers.ts";

const FILE = path.join(REPO, "reference/multiples.json");

function row(overrides: Partial<MultipleRow> = {}): MultipleRow {
  return {
    key: "test",
    vertical: "test businesses",
    method: "sde",
    low: 2,
    mid: 2.5,
    high: 3,
    size_band: "all",
    source: "Test source",
    source_url: "https://example.com/benchmarks",
    as_of: "sales 2021-2025",
    verified: true,
    verified_by: "read from the page in a test",
    notes: "",
    ...overrides,
  };
}

function writeJson(data: unknown): string {
  const file = path.join(tmpDir(), "multiples.json");
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

describe("reference/multiples.json", () => {
  const rows = loadMultiples(FILE);

  it("has a row for every target vertical and the Main Street default", () => {
    const keys = new Set(rows.map((r) => r.key));
    for (const k of ["hvac", "plumbing", "electrical", "landscaping", "dental", "property_management", "commercial_cleaning", "pest_control", "accounting", "auto_repair", "main_street_default"]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it("gives every verified row a source URL, a period and a note on how it was checked", () => {
    for (const r of rows.filter((x) => x.verified)) {
      expect(r.source_url).toMatch(/^https:\/\/www\.bizbuysell\.com\/learning-center\/valuation-benchmarks\//);
      expect(r.verified_by).toMatch(/2026-10-18/);
      expect(r.as_of).not.toBe("");
      expect(r.low).toBeLessThan(r.high);
    }
  });

  it("keeps the HVAC row at the figures read from BizBuySell's sold-business table", () => {
    const hvac = pickMultiple(rows, "hvac", 300_000)!;
    expect([hvac.low, hvac.mid, hvac.high]).toEqual([1.99, 2.58, 3.33]);
    expect(hvac.method).toBe("sde");
  });

  it("marks the second-hand Market Pulse rows unverified so no range can come from them", () => {
    const ms = rows.filter((r) => r.key === "main_street_default");
    expect(ms.length).toBe(3);
    expect(ms.every((r) => !r.verified)).toBe(true);
    expect(pickMultiple(rows, "main_street_default", 200_000)).toBeUndefined();
    expect(pickMultiple(rows, "main_street_default")).toBeUndefined();
  });

  it("contains no em dashes", () => {
    expect(fs.readFileSync(FILE, "utf8")).not.toContain("\u2014");
  });
});

describe("loadMultiples", () => {
  it("accepts a bare array as well as { rows }", () => {
    expect(loadMultiples(writeJson([row()]))).toHaveLength(1);
    expect(loadMultiples(writeJson({ rows: [row(), row({ key: "b" })] }))).toHaveLength(2);
  });

  it("rejects a row whose low is above its high", () => {
    expect(() => loadMultiples(writeJson([row({ low: 3, mid: 2.5, high: 2 })]))).toThrow(/row 1 \(test\).*low <= mid <= high/);
  });

  it("rejects a row marked verified that does not say how it was verified", () => {
    expect(() => loadMultiples(writeJson([row({ verified_by: "" })]))).toThrow(/verified_by/);
    expect(() => loadMultiples(writeJson([row({ verified: false, verified_by: "" })]))).not.toThrow();
  });

  it("rejects an unknown method or size band", () => {
    expect(() => loadMultiples(writeJson([{ ...row(), method: "ebitda" }]))).toThrow(/method/);
    expect(() => loadMultiples(writeJson([row({ size_band: "small" })]))).toThrow(/size_band/);
    expect(() => loadMultiples(writeJson({ nope: true }))).toThrow(/expected an array/);
  });
});

describe("pickMultiple", () => {
  it("never returns an unverified row", () => {
    expect(pickMultiple([row({ verified: false })], "test", 200_000)).toBeUndefined();
    expect(pickMultiple([row({ verified: false })], "test")).toBeUndefined();
  });

  it("returns undefined for a key with no rows", () => {
    expect(pickMultiple([row()], "other", 200_000)).toBeUndefined();
  });

  it("picks the SDE band that contains the stated SDE", () => {
    const rows = [row({ size_band: "sde 0-250000", low: 1.5 }), row({ size_band: "sde 250000-", low: 2.2 })];
    expect(pickMultiple(rows, "test", 100_000)!.low).toBe(1.5);
    expect(pickMultiple(rows, "test", 250_000)!.low).toBe(2.2);
    expect(pickMultiple(rows, "test", 5_000_000)!.low).toBe(2.2);
  });

  it("matches a sale-price band on the implied price, not on SDE", () => {
    // $300K SDE at a 2.8x median implies an $840K price: the $500K-$1M band, not the under-$500K one.
    const rows = [row({ size_band: "price 0-500000", mid: 2.0, low: 2.0, high: 2.0 }), row({ size_band: "price 500000-1000000", mid: 2.8, low: 2.8, high: 2.8 })];
    expect(pickMultiple(rows, "test", 300_000)!.mid).toBe(2.8);
    expect(pickMultiple(rows, "test", 150_000)!.mid).toBe(2.0);
    expect(pickMultiple(rows, "test", 600_000)).toBeUndefined();
  });

  it("does not return a revenue row when an SDE is given", () => {
    expect(pickMultiple([row({ method: "revenue" })], "test", 200_000)).toBeUndefined();
  });

  it("prefers the SDE row when no SDE is given", () => {
    const rows = [row({ method: "revenue", low: 0.5, mid: 0.7, high: 0.9 }), row()];
    expect(pickMultiple(rows, "test")!.method).toBe("sde");
    expect(pickRevenueMultiple(rows, "test")!.method).toBe("revenue");
    expect(pickRevenueMultiple([row()], "test")).toBeUndefined();
    expect(pickRevenueMultiple([row({ method: "revenue", verified: false })], "test")).toBeUndefined();
  });
});

describe("size bands", () => {
  it("parses all, SDE and price bands", () => {
    expect(parseSizeBand("all")).toEqual({ basis: "all" });
    expect(parseSizeBand("sde 100000-250000")).toEqual({ basis: "sde", min: 100_000, max: 250_000 });
    expect(parseSizeBand("price 1000000-")).toEqual({ basis: "price", min: 1_000_000, max: undefined });
    expect(() => parseSizeBand("under 500K")).toThrow(/Bad size band/);
  });

  it("needs an SDE to match anything but an all-sizes band", () => {
    expect(bandMatches(row({ size_band: "sde 0-100000" }))).toBe(false);
    expect(bandMatches(row())).toBe(true);
  });
});
