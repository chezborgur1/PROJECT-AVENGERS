import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { processRequest } from "../src/pipeline.ts";
import { CimCopySchema, placeholders, templateCopy } from "../src/cim/narrative.ts";
import { clampWords } from "../src/cim/deck.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

const firm = { name: "AMB Advisory Services", contact: "Frank", email: "frank@example.com", phone: "" };

describe("pipeline (offline: no Claude)", () => {
  it("turns the sample request into a model, a 10-slide CIM and review notes", { timeout: 60_000 }, async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const out = tmpDir();
      const result = await processRequest(sampleRow(), { repoRoot: REPO, outputDir: out, firm, now: new Date("2026-09-27T12:00:00Z") });
      expect(result.drafted).toBe("template");
      expect(result.verification.ok).toBe(true);

      const files = fs.readdirSync(result.folder).sort();
      expect(files).toEqual(["Project Ridgeline - CIM.pptx", "Project Ridgeline - Financial Model.xlsx", "open-questions.md", "run-summary.md"]);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(result.workbook);
      expect(wb.worksheets.map((w) => w.name)).toEqual([
        "Cover", "Assumptions", "Income Statement", "Recast", "Balance Sheet", "Cash Flow", "Valuation", "Checks", "Source Data",
      ]);

      // A .pptx is a zip; count slide parts.
      const zip = fs.readFileSync(result.deck);
      const slides = new Set(zip.toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g));
      expect(slides.size).toBe(10);

      const questions = fs.readFileSync(path.join(result.folder, "open-questions.md"), "utf8");
      expect(questions).toContain("[Confirm:");
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe("CIM copy", () => {
  it("templated copy satisfies the same schema Claude must fill", async () => {
    const { gatherIntake } = await import("../src/ingest/index.ts");
    const { defaultAssumptions } = await import("../src/model/assumptions.ts");
    const { runModel } = await import("../src/model/engine.ts");
    const row = sampleRow();
    const intake = await gatherIntake(row, REPO, () => {});
    const a = defaultAssumptions(intake.dataset, row);
    const copy = templateCopy({ row, notes: intake.notes, dataset: intake.dataset, assumptions: a, model: runModel(intake.dataset, a) });
    expect(CimCopySchema.safeParse(copy).success).toBe(true);
    expect(copy.investment_highlights).toHaveLength(6);
    expect(copy.executive_summary).toContain("$3.04M");
    expect(placeholders(copy).length).toBeGreaterThan(5);
  });

  it("clampWords cuts long text at a sentence boundary", () => {
    expect(clampWords("One two three.", 10)).toBe("One two three.");
    expect(clampWords("Alpha beta gamma delta. Epsilon zeta eta theta iota.", 7)).toBe("Alpha beta gamma delta.");
    expect(clampWords("a b c d e f g h", 4)).toBe("a b c d…");
  });
});
