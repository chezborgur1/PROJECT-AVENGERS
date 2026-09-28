import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { docxXmlToText, readDocxText, readZipEntry } from "../src/ingest/docx.ts";
import { gatherIntake } from "../src/ingest/index.ts";
import { loadIntakeFile } from "../src/ingest/intake.ts";
import { ridgelineDataset } from "./fixtures/sampleDataset.ts";
import { REPO, sampleRow, tmpDir } from "./helpers.ts";

/** A minimal zip archive (no CRCs, which the reader does not check), stored or deflated. */
function zip(entries: Record<string, string>, deflate = false): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflate ? zlib.deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(deflate ? 8 : 0, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

const DOCUMENT_XML =
  '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p w:rsidR="1"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Intake call: Ridgeline</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t xml:space="preserve">Owner &amp; founder: Mark</w:t></w:r><w:r><w:tab/><w:t>45 hours</w:t></w:r><w:r><w:br/><w:t>&#8220;quoted&#8221;</w:t></w:r></w:p>' +
  "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Role</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Count</w:t></w:r></w:p></w:tc></w:tr>" +
  "<w:tr><w:tc><w:p><w:r><w:t>Tech</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>14</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
  "<w:sectPr/></w:body></w:document>";
const EXPECTED_TEXT = "Intake call: Ridgeline\nOwner & founder: Mark\t45 hours\n“quoted”\nRole\tCount\nTech\t14";

describe("Word intake notes", () => {
  it("turns paragraphs, tabs, breaks, entities and table rows into plain text", () => {
    expect(docxXmlToText(DOCUMENT_XML)).toBe(EXPECTED_TEXT);
  });

  it("reads word/document.xml out of a stored or deflated .docx", () => {
    const dir = tmpDir();
    for (const deflate of [false, true]) {
      const file = path.join(dir, deflate ? "deflated.docx" : "stored.docx");
      fs.writeFileSync(file, zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": DOCUMENT_XML }, deflate));
      expect(readDocxText(file)).toBe(EXPECTED_TEXT);
    }
    expect(readZipEntry(zip({ "a.txt": "hello" }), "b.txt")).toBeUndefined();
    const notWord = path.join(dir, "not-word.docx");
    fs.writeFileSync(notWord, zip({ "a.txt": "hello" }));
    expect(() => readDocxText(notWord)).toThrow(/no word\/document.xml/);
  });

  it("is picked up as intake notes by gatherIntake, and the facts wait for intake.json or Claude", async () => {
    const folder = tmpDir();
    fs.copyFileSync(path.join(REPO, "samples/project-ridgeline/QuickBooks Profit and Loss FY23-FY25.csv"), path.join(folder, "pnl.csv"));
    fs.writeFileSync(path.join(folder, "Call notes.docx"), zip({ "word/document.xml": DOCUMENT_XML }, true));
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const bundle = await gatherIntake({ ...sampleRow(), source_folder: folder }, REPO, () => {});
      expect(bundle.notes).toContain("### Call notes.docx\nIntake call: Ridgeline");
      expect(bundle.files).toContainEqual({ file: "Call notes.docx", used: "Intake notes" });
      expect(bundle.intakeFacts).toBe("none");
      expect(bundle.dataset.intake).toBeUndefined();
      expect(bundle.dataset.warnings.some((w) => /No structured intake facts: add intake.json/.test(w))).toBe(true);
      expect(bundle.dataset.years).toEqual([2023, 2024, 2025]);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});

describe("intake.json", () => {
  it("reproduces the fixture's intake facts from the sample file", () => {
    const loaded = loadIntakeFile(path.join(REPO, "samples/project-ridgeline/intake.json"), "Ridgeline Comfort Services LLC");
    expect(loaded.facts).toEqual(ridgelineDataset().intake);
    expect(loaded.customerTerm).toBe("Customer");
    expect(loaded.revenueLines.map((l) => [l.account, l.label, l.recurring])).toEqual([
      ["Service Revenue - Residential", "Residential service and replacement", false],
      ["Service Revenue - Commercial", "Commercial service", false],
      ["Maintenance Agreements", "Maintenance agreements", true],
    ]);
    expect(loaded.revenueLines[0]!.pricingBasis).toBeUndefined();
  });

  it("fills what a short hand-written file leaves out and never invents a fact", () => {
    const file = path.join(tmpDir(), "intake.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        owner: { name: "Jane Roe", role: "Owner", transition: { description: "Six months" } },
        reasonForSale: { text: "Retirement" },
        systems: [{ function: "Accounting", system: "QuickBooks", source: { evidence: "documented", locator: "Systems" } }],
        growthLevers: [{ lever: "Second truck", mechanism: "Hire a second plumber" }],
      }),
    );
    const { facts, revenueLines, customerTerm } = loadIntakeFile(file, "Roe Plumbing LLC");
    expect(facts.company).toEqual({ legalName: "Roe Plumbing LLC", certifications: [], licenses: [], reputation: [], source: { source: "intake.json", evidence: "management_representation" } });
    expect(facts.owner).toEqual({ name: "Jane Roe", role: "Owner", responsibilities: [], transition: { description: "Six months", source: { source: "intake.json", evidence: "management_representation" } }, source: { source: "intake.json", evidence: "management_representation" } });
    expect(facts.systems[0]!.source).toEqual({ source: "intake.json", locator: "Systems", evidence: "documented" });
    expect(facts.growthLevers[0]).toEqual({ lever: "Second truck", mechanism: "Hire a second plumber", source: { source: "intake.json", evidence: "management_representation" } });
    expect(facts.workforce).toEqual({ composition: [], source: { source: "intake.json", evidence: "management_representation" } });
    expect(facts.transaction).toEqual({ notes: [] });
    expect(facts.locations).toEqual([]);
    expect(revenueLines).toEqual([]);
    expect(customerTerm).toBeUndefined();
  });

  it("names the field a file is missing", () => {
    const file = path.join(tmpDir(), "intake.json");
    fs.writeFileSync(file, JSON.stringify({ reasonForSale: { text: "x" } }));
    expect(() => loadIntakeFile(file, "X")).toThrow(/intake.json does not match the intake facts schema: owner/);
  });
});
