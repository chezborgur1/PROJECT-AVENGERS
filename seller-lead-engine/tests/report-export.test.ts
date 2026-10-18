import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS, ExportBlockedError, exportLeads, suppressionHit } from "../src/report/exportLeads.ts";
import { makeProspect, tempStores, testConfig, tmpDir } from "./helpers.ts";
import { makeSuppression } from "./fixtures/report/rows.ts";

const NOW = new Date("2026-10-18T16:00:00Z");
const open = testConfig({ lead_sales: { enabled: true, legal_review_ref: "Counsel memo 2026-10-10", flat_fee: 150 } });

function seeded() {
  const stores = tempStores();
  stores.prospects.upsert([
    makeProspect({ prospect_id: "P-00101", email: "ok@one.example", age_est_low: 60, age_est_high: 70, score: 88 }),
    makeProspect({ prospect_id: "P-00102", email: "ok@two.example" }),
    makeProspect({ prospect_id: "P-00103", email: "optout@three.example" }),
    makeProspect({ prospect_id: "P-00104", email: "owner@blockeddomain.example" }),
    makeProspect({ prospect_id: "P-00105", email: "ok@five.example" }),
    makeProspect({ prospect_id: "P-00106", email: "ok@six.example", status: "dnc" }),
  ]);
  stores.suppression.append([
    makeSuppression("optout@three.example", "email"),
    makeSuppression("blockeddomain.example", "domain", "do_not_contact"),
    makeSuppression("P-00105", "prospect", "complaint"),
  ]);
  return stores;
}

const ALL = ["P-00101", "P-00102", "P-00103", "P-00104", "P-00105", "P-00106", "P-09999"];
const outFile = () => path.join(tmpDir(), "out", "partner.csv");

describe("exportLeads gate", () => {
  it("throws when lead sales are disabled, and writes nothing", () => {
    const stores = seeded();
    const out = outFile();
    expect(() => exportLeads(stores, testConfig(), { partner: "Partner Brokers", now: NOW, prospectIds: ALL, outFile: out })).toThrow(ExportBlockedError);
    expect(() => exportLeads(stores, testConfig(), { partner: "Partner Brokers", now: NOW, prospectIds: ALL, outFile: out })).toThrow(/lead_sales\.enabled is false/);
    expect(fs.existsSync(out)).toBe(false);
    expect(stores.exports.rows()).toEqual([]);
  });

  it("throws when enabled without a legal review reference", () => {
    const stores = seeded();
    const out = outFile();
    const noRef = testConfig({ lead_sales: { enabled: true, legal_review_ref: "  " } });
    expect(() => exportLeads(stores, noRef, { partner: "Partner Brokers", now: NOW, prospectIds: ALL, outFile: out })).toThrow(/legal_review_ref is blank/);
    expect(fs.existsSync(out)).toBe(false);
    expect(stores.exports.rows()).toEqual([]);
  });

  it("throws when the partner is blank", () => {
    expect(() => exportLeads(seeded(), open, { partner: " ", now: NOW, prospectIds: ALL, outFile: outFile() })).toThrow(/partner is blank/);
  });
});

describe("exportLeads", () => {
  it("never exports a suppressed or do-not-contact prospect, and says why each was skipped", () => {
    const stores = seeded();
    const out = outFile();
    const result = exportLeads(stores, open, { partner: "Partner Brokers", now: NOW, prospectIds: ALL, outFile: out });
    expect(result.exported).toBe(2);
    expect(result.skipped).toEqual([
      { prospectId: "P-00103", reason: "suppressed (opt_out)" },
      { prospectId: "P-00104", reason: "suppressed (do_not_contact)" },
      { prospectId: "P-00105", reason: "suppressed (complaint)" },
      { prospectId: "P-00106", reason: "do not contact" },
      { prospectId: "P-09999", reason: "not found" },
    ]);
    const rows = parse(fs.readFileSync(out, "utf8"), { columns: true }) as Record<string, string>[];
    expect(rows.map((r) => r.prospect_id)).toEqual(["P-00101", "P-00102"]);
    const text = fs.readFileSync(out, "utf8");
    for (const bad of ["optout@three.example", "blockeddomain.example", "ok@five.example", "ok@six.example"]) expect(text).not.toContain(bad);
  });

  it("exports public-record and contact columns only: no score and no age estimate", () => {
    const out = outFile();
    exportLeads(seeded(), open, { partner: "Partner Brokers", now: NOW, prospectIds: ["P-00101"], outFile: out });
    const header = fs.readFileSync(out, "utf8").split("\n")[0]!.split(",");
    expect(header).toEqual([...EXPORT_COLUMNS]);
    expect(header.some((h) => /age|score|tier|notes/.test(h))).toBe(false);
  });

  it("logs every export in exports.csv with the flat fee and the legal review reference", () => {
    const stores = seeded();
    exportLeads(stores, open, { partner: "Partner Brokers", now: NOW, prospectIds: ["P-00101", "P-00102"], outFile: outFile() });
    expect(stores.exports.rows()).toEqual([
      { export_id: "E-000001", partner: "Partner Brokers", prospect_id: "P-00101", fee: 150, exported_at: "2026-10-18T16:00:00Z", legal_review_ref: "Counsel memo 2026-10-10" },
      { export_id: "E-000002", partner: "Partner Brokers", prospect_id: "P-00102", fee: 150, exported_at: "2026-10-18T16:00:00Z", legal_review_ref: "Counsel memo 2026-10-10" },
    ]);
  });

  it("does not export the same prospect to the same partner twice, or twice in one call", () => {
    const stores = seeded();
    exportLeads(stores, open, { partner: "Partner Brokers", now: NOW, prospectIds: ["P-00101"], outFile: outFile() });
    const again = exportLeads(stores, open, { partner: "Partner Brokers", now: NOW, prospectIds: ["P-00101", "P-00102", "P-00102"], outFile: outFile() });
    expect(again.exported).toBe(1);
    expect(again.skipped).toEqual([{ prospectId: "P-00101", reason: "already exported to Partner Brokers" }]);
    expect(stores.exports.rows().map((r) => r.export_id)).toEqual(["E-000001", "E-000002"]);
    const other = exportLeads(stores, open, { partner: "Other Partner", now: NOW, prospectIds: ["P-00101"], outFile: outFile() });
    expect(other.exported).toBe(1);
  });

  it("checks suppression at export time, so a later opt-out blocks a prospect already exported elsewhere", () => {
    const stores = seeded();
    exportLeads(stores, open, { partner: "A", now: NOW, prospectIds: ["P-00102"], outFile: outFile() });
    stores.suppression.append([makeSuppression("ok@two.example", "email")]);
    const r = exportLeads(stores, open, { partner: "B", now: NOW, prospectIds: ["P-00102"], outFile: outFile() });
    expect(r).toEqual({ exported: 0, skipped: [{ prospectId: "P-00102", reason: "suppressed (opt_out)" }] });
  });
});

describe("suppressionHit", () => {
  const rows = [makeSuppression("a@x.example", "email"), makeSuppression("corp.example", "domain"), makeSuppression("P-00001", "prospect")];

  it("matches an email in any case, a domain and its subdomains, and a prospect id", () => {
    expect(suppressionHit(rows, " A@X.example ")?.value).toBe("a@x.example");
    expect(suppressionHit(rows, "b@corp.example")?.value).toBe("corp.example");
    expect(suppressionHit(rows, "b@mail.corp.example")?.value).toBe("corp.example");
    expect(suppressionHit(rows, "b@notcorp.example")).toBeUndefined();
    expect(suppressionHit(rows, "", "P-00001")?.value_type).toBe("prospect");
    expect(suppressionHit(rows, "z@y.example", "P-00002")).toBeUndefined();
  });
});
