import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fitRowsToYears, legacyAddbacksToRows, loadAdjustmentsCsv, type ScheduleRow } from "../src/ingest/adjustments.ts";
import { loadAddbacks } from "../src/ingest/index.ts";
import { mergeSources } from "../src/ingest/merge.ts";
import { parseQuickbooksExport } from "../src/ingest/quickbooksExport.ts";
import { REPO, tmpDir } from "./helpers.ts";

const SAMPLE = path.join(REPO, "samples/project-ridgeline");
const ANNUAL = path.join(SAMPLE, "QuickBooks Profit and Loss FY23-FY25.csv");

describe("adjustments.csv", () => {
  it("reads tiers, categories, status and evidence from their printed labels", async () => {
    const { rows, warnings } = await loadAdjustmentsCsv(path.join(SAMPLE, "adjustments.csv"));
    expect(warnings).toEqual([]);
    expect(rows.map((r) => r.tier)).toEqual(["normalization", "normalization", "normalization", "normalization", "owner_compensation", "memo"]);
    expect(rows[0]).toMatchObject({ description: "Owner's personal vehicle", category: "personal_discretionary", status: "accepted", evidence: "management_representation", account: "Vehicle Expenses", byFiscalYear: { 2023: 16_000, 2024: 17_000, 2025: 18_000 }, origin: "advisor" });
    expect(rows[1]).toMatchObject({ category: "non_recurring", evidence: "documented", byFiscalYear: { 2023: 0, 2024: 24_000, 2025: 0 } });
    expect(rows[4]).toMatchObject({ tier: "owner_compensation", category: "owner_compensation", byFiscalYear: { 2025: 200_000 } });
    expect(rows[5]).toMatchObject({ tier: "memo", category: "other", status: "proposed" });
  });

  it("moves owner perks out of the S tier, skips D rows and flags a missing category", async () => {
    const file = path.join(tmpDir(), "adjustments.csv");
    fs.writeFileSync(file, ["Tier,Adjustment,Category,Status,FY2025,FY2019", "S,Owner's boat,Personal / discretionary,Accepted,9000,", "D,Interest expense,Interest,Accepted,14300,", "N,Something odd,,Rejected,100,50", "PF,Price increase,Run-rate,Proposed,20000,"].join("\n"));
    const { rows, warnings } = await loadAdjustmentsCsv(file);
    expect(rows.map((r) => [r.tier, r.category, r.status])).toEqual([
      ["normalization", "personal_discretionary", "accepted"],
      ["normalization", "other", "excluded"],
      ["pro_forma", "run_rate", "proposed"],
    ]);
    expect(warnings.some((w) => /owner perks other than the owner's pay/.test(w))).toBe(true);
    expect(warnings.some((w) => /definitional rows come from the P&L/.test(w))).toBe(true);
    expect(warnings.some((w) => /no category/.test(w))).toBe(true);
    expect(warnings.some((w) => /a pro forma row needs pnl_line/.test(w))).toBe(true);
    const fitted = fitRowsToYears(rows, [2023, 2024, 2025]);
    expect(fitted.rows[1]!.byFiscalYear).toEqual({ 2023: 0, 2024: 0, 2025: 100 });
    expect(fitted.warnings).toEqual(['adjustments.csv ("Something odd"): FY2019 is not in the model; that amount is ignored.']);
  });

  it("numbers refs by tier, keeps excluded rows out of the mode measure and applies PF rows to their P&L line", async () => {
    const rows: ScheduleRow[] = [
      { tier: "normalization", description: "Owner's boat", category: "personal_discretionary", status: "excluded", evidence: "management_representation", byFiscalYear: { 2023: 9_000, 2024: 9_000, 2025: 9_000 }, origin: "advisor", sourceFile: "adjustments.csv" },
      { tier: "pro_forma", description: "Occupancy cost at market rent", category: "related_party_rent", status: "accepted", evidence: "documented", byFiscalYear: { 2023: -10_000, 2024: -10_000, 2025: -10_000 }, pnlLine: "rent", pfMethod: "Market rate", origin: "advisor", sourceFile: "adjustments.csv" },
    ];
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(ANNUAL, 12)], overrides: new Map(), addbacks: [], adjustmentRows: rows, request: { replacementSalary: 95_000, passThrough: true } });
    const refs = ds.adjustments!.map((a) => a.ref);
    expect(refs.slice(0, 5)).toEqual(["D1", "D2", "D3", "N1", "N2"]);
    expect(refs.slice(-4)).toEqual(["S1", "S2", "S3", "PF1"]);
    const byRef = (ref: string) => ds.adjustments!.find((a) => a.ref === ref)!;
    expect(byRef("N1")).toMatchObject({ description: "Owner's boat", status: "excluded" });
    expect(byRef("N2")).toMatchObject({ category: "non_operating", origin: "pnl", byFiscalYear: { 2025: -3_100 } });
    expect(byRef("PF1")).toMatchObject({ pnlLine: "rent", pfMethod: "Market rate" });
    expect(byRef("D2").basis).toMatch(/pass-through/);
    // Reported EBITDA 319,515 − 3,100 interest income + 200,000 owner comp − 109,250 replacement − 10,000 PF; the excluded boat stays out.
    expect(ds.mode!.measure).toBeCloseTo(319_515 - 3_100 + 200_000 - 109_250 - 10_000, 2);
    expect(ds.mode!.mode).toBe("mainStreet");
    // The excluded row is not in the legacy flat list either.
    expect(ds.addbacks).toEqual([]);
    // Bot-flagged accounts arrive as proposed zeros, one per account, charitable giving included since nothing backs it.
    const flagged = ds.adjustments!.filter((a) => a.origin === "suggested");
    expect(flagged.map((a) => a.description)).toEqual(["Vehicle Expenses (bot-flagged)", "Fuel (bot-flagged)", "Legal & Professional Fees (bot-flagged)", "Meals & Entertainment (bot-flagged)", "Charitable Contributions (bot-flagged)"]);
    expect(flagged.every((a) => a.status === "proposed" && Object.values(a.byFiscalYear).every((v) => v === 0))).toBe(true);
  });

  it("maps the legacy addbacks.csv to accepted N rows and reproduces the flat list", async () => {
    const addbacks = loadAddbacks(path.join(SAMPLE, "addbacks.csv"));
    expect(addbacks).toHaveLength(8);
    const rows = legacyAddbacksToRows(addbacks, [2023, 2024, 2025]);
    expect(rows.map((r) => [r.description, r.category, r.status, r.origin])).toEqual([
      ["Owner's personal vehicle", "personal_discretionary", "accepted", "addbacks_csv"],
      ["Legal fees: settled customer dispute (one-time)", "non_recurring", "accepted", "addbacks_csv"],
      ["Owner family cell phones & personal meals", "personal_discretionary", "accepted", "addbacks_csv"],
      ["Charitable contributions", "personal_discretionary", "accepted", "addbacks_csv"],
    ]);
    const ds = mergeSources({ extracts: [await parseQuickbooksExport(ANNUAL, 12)], overrides: new Map(), addbacks });
    expect(ds.adjustments!.filter((a) => a.origin === "addbacks_csv").map((a) => a.ref)).toEqual(["N1", "N2", "N3", "N4"]);
    // The legacy engine sees the same amounts per year as before the schedule existed.
    for (const y of [2023, 2024, 2025]) {
      const before = addbacks.filter((a) => a.year === y).reduce((s, a) => s + a.amount, 0);
      const after = ds.addbacks.filter((a) => a.year === y).reduce((s, a) => s + a.amount, 0);
      expect(after, `FY${y}`).toBe(before);
    }
    expect(ds.addbacks.every((a) => ["discretionary", "non_recurring"].includes(a.type))).toBe(true);
    // Charitable giving is fully backed by its N row, so the bot does not flag it again.
    expect(ds.adjustments!.some((a) => a.description === "Charitable Contributions (bot-flagged)")).toBe(false);
  });
});
