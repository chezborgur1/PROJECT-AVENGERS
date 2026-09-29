import { describe, expect, it } from "vitest";
import { IS_CATEGORIES, adjustmentInWindow, ltmWindow, ytdWindow } from "../../src/domain/financials.ts";
import {
  ANNUAL_REVENUE,
  AS_OF_MONTH,
  BURDEN_PCT,
  CAPITAL_RESERVE,
  FY_END_MONTH,
  REPLACEMENT_SALARY,
  YEARS,
  ridgelineDataset,
  splitAnnual,
  sumMonthlyByYear,
} from "./sampleDataset.ts";

const ds = ridgelineDataset();
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

describe("monthly grid", () => {
  it("covers Jan-23 to Dec-25 contiguously and closes a fiscal year", () => {
    const months = ds.monthly!.months;
    expect(months).toHaveLength(36);
    expect(months[0]!.key).toBe("2023-01");
    expect(months[35]!.key).toBe(AS_OF_MONTH);
    expect(months.map((m) => m.fiscalMonth)).toEqual(Array.from({ length: 36 }, (_, i) => (i % 12) + 1));
    expect(ds.monthly!.lastMonthClosesFiscalYear).toBe(true);
    expect(ds.asOfMonth).toBe(AS_OF_MONTH);
  });

  it("sums exactly to the known annual figures for every category", () => {
    for (const y of YEARS) {
      const fromMonths = sumMonthlyByYear(ds.monthly!, y);
      for (const c of IS_CATEGORIES) expect(fromMonths[c], `${c} FY${y}`).toBe(ds.pnl[y]![c]);
      expect(fromMonths.revenue).toBe(ANNUAL_REVENUE[y]);
    }
    expect(ds.pnl[2025]).toMatchObject({ revenue: 3_040_800, cogs: 1_158_900, payroll: 904_700, owner_comp: 200_000, other_opex: 304_800 });
  });

  it("account lines sum to the category grid in every month (check C02) and are whole dollars", () => {
    for (const m of ds.monthly!.months) {
      const byCat = Object.fromEntries(IS_CATEGORIES.map((c) => [c, 0])) as Record<string, number>;
      for (const l of ds.monthly!.lines) {
        const v = l.amounts[m.key] ?? 0;
        expect(Number.isInteger(v)).toBe(true);
        byCat[l.category]! += v;
      }
      for (const c of IS_CATEGORIES) expect(byCat[c], `${c} ${m.key}`).toBe(ds.monthly!.values[m.key]![c]);
    }
  });

  it("shows HVAC seasonality: July revenue above March in every year", () => {
    for (const y of YEARS) {
      expect(ds.monthly!.values[`${y}-07`]!.revenue).toBeGreaterThan(ds.monthly!.values[`${y}-03`]!.revenue * 1.3);
    }
  });

  it("LTM and YTD windows ending Dec-25 both equal FY2025", () => {
    const ltm = ltmWindow(ds.monthly!, AS_OF_MONTH)!;
    const ytd = ytdWindow(ds.monthly!, AS_OF_MONTH, FY_END_MONTH)!;
    expect(ltm[0]).toBe("2025-01");
    expect(ytd).toEqual(ltm);
    expect(ltmWindow(ds.monthly!, "2023-11")).toBeUndefined();
    expect(ytdWindow(ds.monthly!, "2024-03", FY_END_MONTH)).toEqual(["2024-01", "2024-02", "2024-03"]);
  });
});

describe("splitAnnual", () => {
  it("returns integers that sum exactly to the total, for either sign", () => {
    for (const total of [76_385, -24_600, 109_250, 7]) {
      const parts = splitAnnual(total, [0.95, 0.85, 0.8, 0.85, 1, 1.2, 1.3, 1.2, 1, 0.85, 0.9, 1.1]);
      expect(parts).toHaveLength(12);
      expect(parts.every(Number.isInteger)).toBe(true);
      expect(sum(parts)).toBe(total);
    }
  });
});

describe("adjustments schedule", () => {
  const adj = ds.adjustments!;
  const byRef = (ref: string) => adj.find((a) => a.ref === ref)!;

  it("numbers refs by tier in schedule order", () => {
    expect(adj.map((a) => a.ref)).toEqual(["D1", "D2", "D3", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "S1", "S2", "S3", "S4", "M1"]);
    expect(byRef("N5")).toMatchObject({ category: "non_operating", origin: "pnl", byFiscalYear: { 2025: -3_100 } });
  });

  it("reproduces the seller's add-backs as N1 to N4 and derives the flat list from them", () => {
    expect(byRef("N1").byFiscalYear).toEqual({ 2023: 16_000, 2024: 17_000, 2025: 18_000 });
    expect(byRef("N2").byFiscalYear).toEqual({ 2023: 0, 2024: 24_000, 2025: 0 });
    expect(byRef("N3").byFiscalYear).toEqual({ 2023: 0, 2024: 0, 2025: 6_000 });
    expect(byRef("N4").byFiscalYear).toEqual({ 2023: 5_000, 2024: 6_000, 2025: 7_500 });
    expect(ds.addbacks.filter((a) => a.year === 2025).map((a) => a.amount)).toEqual([18_000, 6_000, 7_500]);
    expect(sum(ds.addbacks.filter((a) => a.year === 2025).map((a) => a.amount))).toBe(31_500);
  });

  it("monthly amounts tie to the fiscal-year amounts on every row that has them", () => {
    for (const a of adj) {
      if (!a.byMonth) continue;
      for (const y of YEARS) {
        const months = ds.monthly!.months.filter((m) => m.fiscalYear === y).map((m) => m.key);
        expect(adjustmentInWindow(a, months, FY_END_MONTH), `${a.ref} FY${y}`).toBeCloseTo(a.byFiscalYear[y]!, 6);
      }
    }
    // A row without months prorates its fiscal-year amount.
    expect(adjustmentInWindow(byRef("N6"), ["2025-10", "2025-11", "2025-12"], FY_END_MONTH)).toBe(0);
  });

  it("works the FY2025 ladder to the figures in DATA_CONTRACT.md", () => {
    const p = ds.pnl[2025]!;
    const netIncome =
      p.revenue - p.cogs - p.payroll - p.owner_comp - p.rent - p.marketing - p.other_opex - p.depreciation_amortization - p.interest_expense + p.other_income - p.other_expense - p.income_tax;
    expect(netIncome).toBe(232_815);
    const accepted = (tier: string) => sum(adj.filter((a) => a.tier === tier && a.status === "accepted").map((a) => a.byFiscalYear[2025]!));
    // Reported EBITDA = net income + [D1..D3] (check C05): it carries the $3.1K of interest income that [N5] then removes.
    const reported = netIncome + accepted("definitional");
    expect(reported).toBe(319_515);
    expect(accepted("normalization")).toBe(28_400);
    const sde = reported + accepted("normalization") + byRef("S1").byFiscalYear[2025]!;
    expect(sde).toBe(547_915);
    expect(byRef("S2").byFiscalYear[2025]).toBe(-REPLACEMENT_SALARY * (1 + BURDEN_PCT));
    expect(byRef("S3").byFiscalYear[2025]).toBe(-CAPITAL_RESERVE);
    const adjEbitda = sde + byRef("S2").byFiscalYear[2025]! + byRef("S3").byFiscalYear[2025]!;
    expect(adjEbitda).toBe(371_865);
    expect(ds.mode).toMatchObject({ mode: "mainStreet", measure: 438_665, overridden: false });
    expect(ds.dealForm?.form).toBe("asset_purchase");
  });
});

describe("customers", () => {
  const list = ds.customers!;
  const commercial = { 2023: 598_200, 2024: 702_500, 2025: 811_700 } as const;

  it("has about sixty coded accounts whose revenue sums to the commercial line and, with the residual, to total revenue", () => {
    expect(list.customers.length).toBeGreaterThanOrEqual(60);
    expect(list.customers.map((c) => c.id)).toEqual(list.customers.map((_, i) => `C-${String(i + 1).padStart(3, "0")}`));
    for (const y of YEARS) {
      const coded = sum(list.customers.map((c) => c.revenueByFiscalYear[y] ?? 0));
      expect(coded, `FY${y}`).toBe(commercial[y]);
      expect(coded + list.residual!.revenueByFiscalYear[y]!).toBe(ds.pnl[y]!.revenue);
      expect(list.totalsByFiscalYear[y]).toBe(ds.pnl[y]!.revenue);
    }
  });

  it("puts the largest customer at about 4% of revenue and the top ten near a fifth", () => {
    const rev25 = list.customers.map((c) => c.revenueByFiscalYear[2025]!);
    expect(rev25[0]).toBe(Math.max(...rev25));
    expect(rev25[0]! / ANNUAL_REVENUE[2025]!).toBeCloseTo(0.04, 3);
    expect(sum(rev25.slice(0, 10)) / ANNUAL_REVENUE[2025]!).toBeCloseTo(0.193, 2);
    // Codes descend by FY2025 revenue.
    for (let i = 1; i < rev25.length; i++) expect(rev25[i]!).toBeLessThanOrEqual(rev25[i - 1]!);
  });

  it("carries start and end dates for a count roll-forward", () => {
    const active = (date: string) => list.customers.filter((c) => c.startDate! <= date && (!c.endDate || c.endDate >= date)).length;
    expect(active("2023-01-01")).toBe(40);
    expect(active("2025-12-31")).toBe(52);
    expect(list.customers.filter((c) => c.endDate).every((c) => c.lossReason)).toBe(true);
    expect(list.customers.every((c) => c.type && c.name)).toBe(true);
  });
});

describe("payroll register", () => {
  const reg = ds.payroll!;
  const staff = reg.employees.filter((e) => !e.isOwner);

  it("ties wages plus employer costs to the P&L payroll line, and the owner to officer compensation", () => {
    for (const y of YEARS) {
      // Staff pay plus the owner's employer taxes (his salary is officer compensation; the taxes on it sit in payroll).
      const owner = reg.employees.find((e) => e.isOwner)!;
      const total = sum(staff.map((e) => (e.wagesByFiscalYear[y] ?? 0) + (e.employerCostsByFiscalYear[y] ?? 0))) + (owner.employerCostsByFiscalYear[y] ?? 0);
      expect(total, `FY${y}`).toBe(ds.pnl[y]!.payroll);
      expect(reg.totalsByFiscalYear[y]).toBe(ds.pnl[y]!.payroll);
      expect(reg.employees.find((e) => e.isOwner)!.wagesByFiscalYear[y]).toBe(ds.pnl[y]!.owner_comp);
    }
  });

  it("matches the intake headcount at Dec-25: 23 employees plus the owner", () => {
    const onPayroll = staff.filter((e) => e.hireDate <= "2025-12-31" && (!e.terminationDate || e.terminationDate > "2025-12-31"));
    expect(onPayroll).toHaveLength(23);
    const count = (role: string) => onPayroll.filter((e) => e.role === role).length;
    expect(count("Service technician")).toBe(14);
    expect(count("Install technician")).toBe(4);
    expect(count("Customer service / dispatch")).toBe(3);
    expect(count("Bookkeeper")).toBe(1);
    expect(count("Operations manager")).toBe(1);
    expect(staff.filter((e) => e.terminationDate).every((e) => e.terminationType)).toBe(true);
    expect(reg.employees.find((e) => e.name === "Lisa Tran")).toMatchObject({ isManagement: true, hireDate: "2014-09-08" });
  });
});

describe("balance sheets and the rest", () => {
  it("carries three balanced year-ends that equal the annual map", () => {
    expect(ds.balanceSheets!.map((b) => b.asOf)).toEqual(["2023-12-31", "2024-12-31", "2025-12-31"]);
    for (const b of ds.balanceSheets!) {
      const v = b.values;
      const assets = v.cash + v.accounts_receivable + v.inventory + v.other_current_assets + v.fixed_assets_net + v.other_assets;
      expect(assets - v.accounts_payable - v.other_current_liabilities - v.debt - v.equity).toBe(0);
      expect(v).toEqual(ds.balanceSheet[b.period.fiscalYear]);
      expect(b.fiscalYearEnd).toBe(true);
    }
    expect(ds.balanceSheet[2025]).toMatchObject({ cash: 238_615, debt: 279_400, equity: 501_915 });
  });

  it("reads the sample bank export into monthly deposits that match the pipeline's annual figure", () => {
    expect(Object.keys(ds.depositsByMonth!).sort()).toHaveLength(12);
    expect(ds.deposits[2025]!.amount).toBeCloseTo(2_995_188.11, 2);
    expect(ds.deposits[2025]!.months).toBe(12);
  });

  it("transcribes the intake notes without guessing", () => {
    const intake = ds.intake!;
    expect(intake.company.founded).toBe(2009);
    expect(intake.owner).toMatchObject({ name: "Mark Delaney", age: 61, hoursPerWeek: 45 });
    expect(intake.owner.responsibilities.every((r) => r.hoursPerWeek === undefined)).toBe(true);
    expect(intake.management[0]).toMatchObject({ name: "Lisa Tran", postCloseIntent: "stays" });
    expect(intake.growthLevers).toHaveLength(5);
    expect(intake.locations[0]).toMatchObject({ sizeSqFt: 8_000, arrangement: "leased_from_third_party" });
    expect(ds.kpis!.find((k) => k.key === "maintenance_members")!.values).toEqual({ "AT2026-09-21": 1_450 });
    expect(ds.revenueLines!.filter((l) => !l.contra).map((l) => l.label)).toEqual(["Residential service and replacement", "Commercial service", "Maintenance agreements"]);
    expect(ds.revenueMix.map((m) => m.amount)).toEqual([1_964_300, 811_700, 289_400]);
    expect(ds.suggestedAddbacks).toHaveLength(15);
  });
});
