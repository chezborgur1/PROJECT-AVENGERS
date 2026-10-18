import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handOffWarmLeads, handoffSummary } from "../src/handoff/handoff.ts";
import { loadMultiples } from "../src/readiness/multiples.ts";
import type { LeadRow, ProspectRow } from "../src/domain/schema.ts";
import { REPO, makeLead, makeProspect, tempStores, testConfig } from "./helpers.ts";
import { makeReply, makeSuppression } from "./fixtures/report/rows.ts";

const TODAY = "2026-10-16"; // a Friday, so "2 business days" lands on Tuesday
const NOW = new Date("2026-10-16T15:30:00Z");
const MULTIPLES = loadMultiples(path.join(REPO, "reference/multiples.json"));
const config = testConfig({ handoff: { advisor_name: "Dana Advisor", advisor_email: "dana@amb.example" } });

function warm(pOverrides: Partial<ProspectRow> = {}, lOverrides: Partial<LeadRow> = {}) {
  const p = makeProspect({
    business_name: "Bay Comfort Air Inc",
    city: "Tampa",
    phone: "813-555-0100",
    age_est_low: 62,
    age_est_high: 68,
    score_reasons: "Licensed since 1994 (32 years); Sole officer on every annual report since 2004",
    ...pOverrides,
  });
  const lead = makeLead(p, {
    stage: "warm",
    owner_name: "John Example",
    revenue: 1_450_000,
    sde: 310_000,
    employees: 9,
    timeline: "6-12m",
    motivation: "retirement",
    motivation_detail: "Ready to step back after 30 years",
    wants_readiness_check: "Y",
    qual_score: 72,
    ...lOverrides,
  });
  return { p, lead };
}

const run = (stores = tempStores()) => ({ stores, results: handOffWarmLeads(stores, config, { now: NOW, today: TODAY, multiples: MULTIPLES }) });

describe("handOffWarmLeads", () => {
  it("writes a handoff note and a readiness check, and moves the lead to handed_off", () => {
    const stores = tempStores();
    const { p, lead } = warm();
    stores.prospects.upsert([p]);
    stores.leads.upsert([lead]);
    const { results } = run(stores);

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.prospectId).toBe(p.prospect_id);
    expect(r.file).toBe(path.join(stores.dir.handoffs, `${p.prospect_id} Bay Comfort Air Inc.md`));
    expect(fs.existsSync(path.join(stores.dir.checks, `${p.prospect_id} Bay Comfort Air Inc.md`))).toBe(true);

    const saved = stores.leads.rows()[0]!;
    expect(saved.stage).toBe("handed_off");
    expect(saved.handed_off_at).toBe("2026-10-16T15:30:00Z");
    expect(saved.updated_at).toBe("2026-10-16T15:30:00Z");
    expect(saved.handoff_file).toBe(path.join("handoffs", `${p.prospect_id} Bay Comfort Air Inc.md`));
    expect(saved.summary).toBe(r.summary);
    expect(saved.readiness_score).toBeGreaterThan(0);
    expect(saved.next_action).toContain("2026-10-20");
    expect(saved.qual_score).toBe(72); // untouched facts survive
  });

  it("writes the summary in the fixed fact order, short enough to read in 20 seconds", () => {
    const { p, lead } = warm();
    const s = handoffSummary(lead, p, config, 55);
    const order = ["John Example owns Bay Comfort Air Inc", "an HVAC company in Tampa, FL", "licensed since 1994", "Size stated: revenue about $1.45M, SDE about $310K, 9 employees (per owner)", "Timeline: in 6 to 12 months (per owner)", "Motivation: retirement", "Asked for: the exit-readiness check"];
    const at = order.map((t) => s.indexOf(t));
    expect(at.every((i) => i >= 0), s).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(s).toContain("readiness 55/100");
    expect(s.split(/\s+/).length).toBeLessThanOrEqual(90);
    expect(s).not.toContain("\n");
  });

  it("says plainly when the owner has not stated size, timeline or motivation", () => {
    const { p, lead } = warm({}, { revenue: undefined, sde: undefined, employees: undefined, timeline: "unknown", motivation: "unknown", motivation_detail: "", wants_readiness_check: "" });
    const s = handoffSummary(lead, p, config);
    expect(s).toContain("Size not stated yet.");
    expect(s).toContain("Timeline not stated.");
    expect(s).toContain("Motivation not stated.");
    expect(s).not.toContain("readiness check");
  });

  it("puts facts with their source, seller reasons, human replies and the check link in the note", () => {
    const stores = tempStores();
    const { p, lead } = warm();
    stores.prospects.upsert([p]);
    stores.leads.upsert([lead]);
    stores.replies.upsert([
      makeReply({ reply_id: "R-a", prospect_id: p.prospect_id, received_at: "2026-10-12T14:00:00Z", class: "interested", snippet: "Yes, send the check. We do about $1.45M." }),
      makeReply({ reply_id: "R-b", prospect_id: p.prospect_id, received_at: "2026-10-10T14:00:00Z", class: "auto_reply", snippet: "I am out of the office" }),
      makeReply({ reply_id: "R-c", prospect_id: "P-99999", class: "interested", snippet: "someone else entirely" }),
    ]);
    const { results } = run(stores);
    const md = fs.readFileSync(results[0]!.file, "utf8");

    expect(md).toContain("| Owner earnings (SDE) | $310K | Per owner |");
    expect(md).toContain("| Licensed since | 1994 | Per state records |");
    expect(md).toContain("| Years owned | Unknown | Not stated yet |");
    expect(md).toContain("| Motivation | retirement: Ready to step back after 30 years | Per owner |");
    expect(md).toContain("- Licensed since 1994 (32 years)");
    expect(md).toContain("- Sole officer on every annual report since 2004");
    expect(md).toContain('2026-10-12 (interested): "Yes, send the check. We do about $1.45M."');
    expect(md).not.toContain("out of the office");
    expect(md).not.toContain("someone else entirely");
    expect(md).toContain(`(../checks/${encodeURI(`${p.prospect_id} Bay Comfort Air Inc.md`)})`);
    expect(md).toContain("Do Not Call Registry");
    expect(md).toContain("Dana Advisor replies by email by 2026-10-20");
    // The internal age estimate never leaves the prospect row.
    expect(md).not.toMatch(/\b6[2-8]\b.*\b(age|years old)\b|age_est/i);
    expect(md).not.toContain("\u2014");
  });

  it("skips leads that are not warm or were already handed off", () => {
    const stores = tempStores();
    const a = warm({ prospect_id: "P-10001" }, { stage: "qualified" });
    const b = warm({ prospect_id: "P-10002" }, { handed_off_at: "2026-10-01T10:00:00Z" });
    const c = warm({ prospect_id: "P-10003" }, { stage: "nurture" });
    stores.prospects.upsert([a.p, b.p, c.p]);
    stores.leads.upsert([a.lead, b.lead, c.lead]);
    expect(run(stores).results).toEqual([]);
    expect(stores.leads.rows().map((l) => l.stage)).toEqual(["qualified", "warm", "nurture"]);
  });

  it("never hands off a suppressed or do-not-contact owner", () => {
    const stores = tempStores();
    const byEmail = warm({ prospect_id: "P-20001", email: "gone@optout.example" });
    const byDomain = warm({ prospect_id: "P-20002", email: "owner@blocked.example" });
    const byId = warm({ prospect_id: "P-20003" });
    const dnc = warm({ prospect_id: "P-20004", status: "dnc" });
    const ok = warm({ prospect_id: "P-20005" });
    const all = [byEmail, byDomain, byId, dnc, ok];
    stores.prospects.upsert(all.map((x) => x.p));
    stores.leads.upsert(all.map((x) => x.lead));
    stores.suppression.append([makeSuppression("gone@optout.example", "email"), makeSuppression("blocked.example", "domain"), makeSuppression("P-20003", "prospect", "complaint")]);
    const { results } = run(stores);
    expect(results.map((r) => r.prospectId)).toEqual(["P-20005"]);
    expect(stores.leads.rows().filter((l) => l.stage === "warm").map((l) => l.prospect_id)).toEqual(["P-20001", "P-20002", "P-20003", "P-20004"]);
    expect(fs.readdirSync(stores.dir.handoffs)).toEqual(["P-20005 Bay Comfort Air Inc.md"]);
  });

  it("skips a warm lead whose prospect row is missing", () => {
    const stores = tempStores();
    const { lead } = warm({ prospect_id: "P-30001" });
    stores.leads.upsert([lead]);
    expect(run(stores).results).toEqual([]);
  });

  it("does nothing on a second run", () => {
    const stores = tempStores();
    const { p, lead } = warm();
    stores.prospects.upsert([p]);
    stores.leads.upsert([lead]);
    expect(run(stores).results).toHaveLength(1);
    expect(run(stores).results).toHaveLength(0);
  });
});
