// The Ridgeline sample folder, read by the real ingest path, must reproduce
// tests/fixtures/sampleDataset.ts: the fixture is what the model and CIM
// builders test against, so the demo has to carry the same figures.

import { beforeAll, describe, expect, it } from "vitest";
import { gatherIntake, type IntakeBundle } from "../src/ingest/index.ts";
import { ridgelineDataset, YEARS } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow } from "./helpers.ts";

const fx = ridgelineDataset();
let bundle: IntakeBundle;
const ds = () => bundle.dataset;

beforeAll(async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    bundle = await gatherIntake(sampleRow(), REPO, () => {});
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

describe("the sample folder reproduces the fixture", () => {
  it("uses every file and raises only the expected notes", () => {
    const used = Object.fromEntries(bundle.files.map((f) => [f.file, f.used]));
    expect(used["QuickBooks Profit and Loss FY23-FY25 (monthly).csv"]).toBe("QuickBooks P&L export (36 months)");
    expect(used["QuickBooks Profit and Loss FY23-FY25.csv"]).toBe("QuickBooks P&L export (FY2023, FY2024, FY2025)");
    expect(used["adjustments.csv"]).toBe("Adjustments schedule (6 rows)");
    expect(used["addbacks.csv"]).toBe("Seller add-backs (superseded by adjustments.csv)");
    expect(used["customers.csv"]).toBe("Customer list (62 customers)");
    expect(used["payroll.csv"]).toBe("Payroll register (29 people)");
    expect(used["kpis.csv"]).toBe("Operating metrics (10)");
    expect(used["intake.json"]).toBe("Structured intake facts");
    expect(bundle.intakeFacts).toBe("intake.json");
    expect(Object.values(used).some((u) => /^(Skipped|Error)/.test(u))).toBe(false);
    expect(ds().warnings).toHaveLength(3);
    expect(ds().warnings.some((w) => /\[S3\] capital reserve is a proxy/.test(w))).toBe(true);
    expect(ds().warnings.some((w) => /differs|out of balance|Mapped by default|check C1[23]/.test(w))).toBe(false);
  });

  it("P&L: the annual map, the monthly grid and the account lines", () => {
    const d = ds();
    expect(d.years).toEqual([...YEARS]);
    expect(d.pnl).toEqual(fx.pnl);
    expect(d.fiscalYearEndMonth).toBe(12);
    expect(d.sourceGranularity).toBe("monthly");
    expect(d.booksBasis).toBe("accrual");
    expect(d.asOfMonth).toBe(fx.asOfMonth);
    expect(d.monthly!.months).toEqual(fx.monthly!.months);
    expect(d.monthly!.values).toEqual(fx.monthly!.values);
    expect(d.monthly!.fullFiscalYears).toEqual(fx.monthly!.fullFiscalYears);
    expect(d.monthly!.lastMonthClosesFiscalYear).toBe(true);
    const lineKey = (l: { account: string; category: string; amounts: Record<string, number> }) => `${l.account}|${l.category}|${JSON.stringify(l.amounts)}`;
    expect(d.monthly!.lines.map(lineKey).sort()).toEqual(fx.monthly!.lines.map(lineKey).sort());
    expect(d.monthly!.lines.find((l) => l.account === "Software & Subscriptions")!.mappedBy).toBe("override");
    const mapped = (l: { statement: string; account: string; year: number; amount: number; category: string }) => `${l.statement}|${l.account}|${l.year}|${l.amount}|${l.category}`;
    expect(d.lines.map(mapped).sort()).toEqual(fx.lines.map(mapped).sort());
    expect(d.provenance).toEqual(fx.provenance);
  });

  it("balance sheets with their detail lines", () => {
    const d = ds();
    expect(d.balanceSheet).toEqual(fx.balanceSheet);
    expect(d.balanceSheets!.map((b) => ({ asOf: b.asOf, fiscalYearEnd: b.fiscalYearEnd, values: b.values, detail: b.detail }))).toEqual(
      fx.balanceSheets!.map((b) => ({ asOf: b.asOf, fiscalYearEnd: b.fiscalYearEnd, values: b.values, detail: b.detail })),
    );
    const sortItems = (items: NonNullable<typeof d.debtLikeItems>) => [...items].sort((a, b) => a.item.localeCompare(b.item));
    expect(sortItems(d.debtLikeItems!)).toEqual(sortItems(fx.debtLikeItems!));
  });

  it("the adjustments schedule, the mode and the deal form", () => {
    const d = ds();
    expect(d.adjustments!.map((a) => a.ref)).toEqual(fx.adjustments!.map((a) => a.ref));
    for (const expected of fx.adjustments!) {
      const actual = d.adjustments!.find((a) => a.ref === expected.ref)!;
      expect(actual, expected.ref).toMatchObject({ tier: expected.tier, category: expected.category, status: expected.status, evidence: expected.evidence, description: expected.description });
      for (const y of YEARS) expect(actual.byFiscalYear[y], `${expected.ref} FY${y}`).toBeCloseTo(expected.byFiscalYear[y]!, 6);
      // Rows the sample's adjustments.csv supplies are "advisor" rows; every derived row keeps the fixture's origin.
      if (expected.origin !== "addbacks_csv" && expected.origin !== "intake_notes") expect(actual.origin, expected.ref).toBe(expected.origin);
      if (expected.byMonth) {
        for (const y of YEARS) {
          const months = fx.monthly!.months.filter((m) => m.fiscalYear === y).map((m) => m.key);
          const sum = months.reduce((s, m) => s + (actual.byMonth?.[m] ?? expected.byFiscalYear[y]! / 12), 0);
          expect(sum, `${expected.ref} FY${y} months`).toBeCloseTo(expected.byFiscalYear[y]!, 2);
        }
      }
    }
    expect(d.mode).toEqual(fx.mode);
    expect(d.dealForm).toEqual(fx.dealForm);
    expect(d.recastInputs).toMatchObject({ replacementSalary: 95_000, burdenPct: 0.15, capitalReserve: { basis: "da_proxy" } });
    expect(d.recastInputs!.capitalReserve!.amount).toBeCloseTo(fx.recastInputs!.capitalReserve!.amount, 6);
    expect(d.recastInputs!.owners).toEqual(fx.recastInputs!.owners);
    // The legacy flat list the old engine reads carries the same amounts per year.
    for (const y of YEARS) {
      const sum = (xs: { year: number; amount: number }[]) => xs.filter((a) => a.year === y).reduce((s, a) => s + a.amount, 0);
      expect(sum(d.addbacks), `FY${y}`).toBe(sum(fx.addbacks));
    }
  });

  it("customers, payroll, KPIs and intake facts", () => {
    const d = ds();
    expect(d.customers!.customers).toEqual(fx.customers!.customers);
    expect(d.customers!.residual).toEqual(fx.customers!.residual);
    expect(d.customers!.totalsByFiscalYear).toEqual(fx.customers!.totalsByFiscalYear);
    expect(d.customers!).toMatchObject({ term: "Customer", asOfMonth: fx.customers!.asOfMonth });
    expect(d.payroll!.employees).toEqual(fx.payroll!.employees);
    expect(d.payroll!.totalsByFiscalYear).toEqual(fx.payroll!.totalsByFiscalYear);
    expect(d.payroll!.asOfMonth).toBe(fx.payroll!.asOfMonth);
    expect(d.kpis).toEqual(fx.kpis);
    expect(d.intake).toEqual(fx.intake);
  });

  it("revenue lines, the legacy mix and the bot-flagged accounts", () => {
    const d = ds();
    expect(d.revenueLines).toEqual(fx.revenueLines);
    expect(d.revenueMix).toEqual(fx.revenueMix);
    expect(d.suggestedAddbacks).toEqual(fx.suggestedAddbacks);
  });

  it("deposits and the source reconciliation", () => {
    const d = ds();
    expect(Object.keys(d.depositsByMonth!).sort()).toEqual(Object.keys(fx.depositsByMonth!).sort());
    for (const [m, v] of Object.entries(fx.depositsByMonth!)) {
      expect(d.depositsByMonth![m]!.amount, m).toBeCloseTo(v.amount, 6);
      expect(d.depositsByMonth![m]!.excluded, m).toBeCloseTo(v.excluded, 6);
    }
    expect(d.deposits[2025]!.months).toBe(12);
    expect(d.deposits[2025]!.amount).toBeCloseTo(fx.deposits[2025]!.amount, 6);
    // The annual export reconciles to the monthly one line by line.
    expect(d.reconciliations).toHaveLength(12);
    expect(d.reconciliations!.every((r) => r.difference === 0 && !r.material)).toBe(true);
  });
});
