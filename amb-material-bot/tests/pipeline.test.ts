// The whole bot on the Ridgeline sample folder, offline: ingest, the model
// and its independent verification, the CIM with its PDF and page images,
// and the two review files the advisor works from.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { NeedsInfoError, processRequest, type PipelineResult } from "../src/pipeline.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

const firm = { name: "AMB Advisory Services", contact: "Frank", email: "frank@example.com", phone: "" };
const now = new Date("2026-09-27T12:00:00Z");

/** LibreOffice renders the PDF; the page images need it too. Machines without it still get the .pptx. */
const hasSoffice = (() => {
  try {
    execFileSync("soffice", ["--version"], { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
})();

async function offline<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    return await fn();
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
}

/** Every text run on every slide, in slide order. */
async function deckText(file: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  const out: string[] = [];
  for (const s of slides) {
    const xml = await zip.file(s)!.async("string");
    out.push([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" "));
  }
  return out;
}

describe("pipeline on the sample request (offline: no Claude)", () => {
  let result: PipelineResult;
  let questions: string;
  let summary: string;

  beforeAll(async () => {
    result = await offline(() => processRequest(sampleRow(), { repoRoot: REPO, outputDir: tmpDir(), firm, now }));
    questions = fs.readFileSync(path.join(result.folder, "open-questions.md"), "utf8");
    summary = fs.readFileSync(path.join(result.folder, "run-summary.md"), "utf8");
  }, 600_000);

  it("writes the workbook, the deck with its PDF and page images, and the review files", () => {
    const expected = ["Project Ridgeline - CIM.pptx", "Project Ridgeline - Financial Model v01.xlsx", "open-questions.md", "run-summary.md"];
    if (hasSoffice) expected.push("Project Ridgeline - CIM pages", "Project Ridgeline - CIM.pdf");
    expect(fs.readdirSync(result.folder).sort()).toEqual(expected.sort());
    if (hasSoffice) {
      expect(result.pdf).toBe(path.join(result.folder, "Project Ridgeline - CIM.pdf"));
      expect(result.pngs).toHaveLength(result.pages);
      expect(result.pngs.every((p) => fs.statSync(p).size > 10_000)).toBe(true);
    } else {
      expect(summary).toMatch(/No PDF: PDF not written/);
    }
  });

  it("delivers a workbook that passes verification with every check OK", async () => {
    expect(result.verification.ok).toBe(true);
    expect(result.verification.errors).toEqual([]);
    expect(result.verification.mismatches).toEqual([]);
    expect(result.verification.lint).toEqual([]);
    expect(result.verification.formulas).toBeGreaterThan(7_000);
    expect(result.masterCheck).toBe("All checks OK");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(result.workbook);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Cover", "Contents", "Summary", "Assumptions", "P&L Summary", "Adj. EBITDA", "Adjustments", "Revenue Detail", "Revenue Charts", "Expense Detail", "Expense Charts",
      "Customer Overview", "Customer Retention", "Retention Charts", "Concentration", "Cohorts", "Headcount", "Headcount Charts", "Balance Sheet", "NWC", "Debt-Like Items", "Cash Flow",
      "Proof of Cash", "Projections", "Opportunities", "Valuation", "Deal Structure", "Sensitivities", "Checks", "Data -->",
      "Monthly P&L", "Databook", "Mapping", "Raw - P&L", "Raw - BS", "Raw - Bank", "Raw - Customers", "Raw - Payroll",
    ]);
  });

  it("builds the CIM from the folder's reviewed copy, inside the Main Street length, with no price talk", async () => {
    expect(result.copySource).toBe("fixture");
    expect(result.pages).toBeGreaterThanOrEqual(20);
    expect(result.pages).toBeLessThanOrEqual(28);
    const pages = await deckText(result.deck);
    expect(pages).toHaveLength(result.pages);
    const text = pages.join("\n");
    expect(text).toContain("Ridgeline Comfort Services LLC");
    // The process page may say a buyer's IOI carries a valuation range; the CIM itself never states a price or a multiple (guide D5).
    expect(text).not.toMatch(/asking price|enterprise value|\d(\.\d+)?x (SDE|Adj\.|EBITDA|earnings)|times (SDE|Adj\.|EBITDA|earnings)/i);
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/\{\{/);
  });

  it("lists every deck placeholder, the unaccepted adjustments, the data issues and the sections the data would add", () => {
    expect(result.openQuestions.length).toBeGreaterThan(0);
    for (const q of result.openQuestions) expect(questions).toContain(`- [ ] ${q}`);
    expect(questions).toContain("[Confirm:");
    // Bot-flagged accounts stay proposed and out of Adj. EBITDA until an advisor accepts them (guide Q10).
    expect(questions).toMatch(/- \[ \] \[N6\] Vehicle Expenses \(bot-flagged\), proposed: .*Not in Adj\. EBITDA until accepted/);
    expect(questions).toMatch(/- \[ \] \[M1\] After-hours emergency plumbing, proposed: .*Memo only/);
    expect(questions).toMatch(/\[S3\] capital reserve is a proxy/);
    expect(questions).toContain("- S3.1 Market size and share: No sourced market inputs");
  });

  it("summarises the deal, the numbers, every check and the CIM's sections with the reason each omission failed", () => {
    expect(summary).toContain("Copy: the source folder's reviewed cim-copy.fixture.json");
    expect(summary).toMatch(/Mode: Main Street: PF Adj\. EBITDA before the capital reserve is \$438,665 \(PF Dec-25\)/);
    expect(summary).toContain("Deal form: asset purchase");
    // FY2025 is the LTM here, so the headline table carries FY2023-FY2025 and PF Dec-25.
    expect(summary).toContain("| | FY2023 | FY2024 | FY2025 | PF Dec-25 |");
    expect(summary).toMatch(/\| SDE \|.*\| \$547,915 \|/);
    expect(summary).toMatch(/\| Adj\. EBITDA \|.*\| \$371,865 \|/);
    expect(summary).toContain("Structured intake facts: intake.json in the source folder.");
    expect(summary).toContain("| cim-copy.fixture.json | CIM copy fixture (used when no API key is set) |");
    expect(summary).toContain("### Checks (guide 5.7): All checks OK");
    for (let i = 1; i <= 37; i++) expect(summary).toMatch(new RegExp(`\\| C${String(i).padStart(2, "0")} \\| .* \\| (OK|n\\.a\\.) \\|`));
    expect(summary).toContain("| 4 | Executive summary | S1.1 Company at a glance |");
    expect(summary).toMatch(/\| S3\.1 Market size and share \| Market \| omitted \| No sourced market inputs/);
    expect(summary).toContain(`${result.pages} pages against the Main Street target of 20–28`);
  });
});

describe("pipeline on annual statements only, with no intake facts or reviewed copy (offline)", () => {
  it("builds the Main Street annual model and a templated CIM whose gaps are all listed", async () => {
    // The sample's annual exports, notes and add-back list only: no monthly grid, customers, payroll, bank data, intake.json or copy fixture.
    const folder = tmpDir("amb-annual-");
    const sample = path.join(REPO, "samples/project-ridgeline");
    for (const f of ["QuickBooks Profit and Loss FY23-FY25.csv", "QuickBooks Balance Sheet FY23-FY25.csv", "intake-notes.md", "addbacks.csv"]) fs.copyFileSync(path.join(sample, f), path.join(folder, f));
    const row = { ...sampleRow(), request_id: "REQ-9001", business_name: "Annual Statements HVAC LLC", code_name: "Project Annual", source_folder: folder };
    const result = await offline(() => processRequest(row, { repoRoot: REPO, outputDir: tmpDir(), firm, now }));

    expect(result.verification.ok).toBe(true);
    expect(result.masterCheck).toBe("All checks OK");
    expect(result.copySource).toBe("template");
    const summary = fs.readFileSync(path.join(result.folder, "run-summary.md"), "utf8");
    expect(summary).toContain("Periods: annual statements only (guide 5.2A)");
    expect(summary).toContain("Structured intake facts: none");
    expect(summary).toMatch(/\| S4\.1 Customer overview \| Customers \| omitted \| No customer list \|/);
    expect(summary).toMatch(/\| \d+ \| Adjusted EBITDA \| S7\.1 Adjusted EBITDA reconciliation \|/);

    // Account names such as "Service Revenue - Residential" print without a spaced dash (guide 4.4).
    const text = (await deckText(result.deck)).join("\n");
    expect(text).toContain("Service revenue (residential)");
    expect(text).not.toMatch(/[a-z] [-–] [a-z]/);

    const questions = fs.readFileSync(path.join(result.folder, "open-questions.md"), "utf8");
    expect(questions).toContain("No structured intake facts");
    for (const q of result.openQuestions) expect(questions).toContain(`- [ ] ${q}`);
  }, 300_000);
});

describe("pipeline without financials", () => {
  it("asks for information instead of building from nothing", async () => {
    const row = { ...sampleRow(), source_folder: tmpDir("amb-empty-") };
    const outputDir = tmpDir();
    await expect(offline(() => processRequest(row, { repoRoot: REPO, outputDir, firm, now }))).rejects.toBeInstanceOf(NeedsInfoError);
    // Nothing half-built is left for the advisor to mistake for a draft.
    expect(fs.readdirSync(outputDir)).toEqual([]);
  });
});
