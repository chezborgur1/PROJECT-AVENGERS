import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";
import type { EngineConfig } from "../config.ts";
import { ComplianceError } from "../compliance/gate.ts";
import { Suppression } from "../compliance/suppression.ts";
import type { ExportRow, ProspectRow } from "../domain/schema.ts";
import { idAllocator } from "../store/csvTable.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";

// Partner lead exports: a hard gate, off by default. Selling seller leads to
// other brokers can be licensed brokerage activity and can make AMB a data
// broker (California Delete Act, Vermont, Texas and Oregon registries;
// docs/research/offer.md verification M5 and M6), so the export throws
// unless lead_sales.enabled is set and counsel's review is recorded in
// lead_sales.legal_review_ref. A partner pays a flat fee per lead only: a
// share of the sale price would be a contingent referral fee on a business
// sale, which brokerage licensing (Florida F.S. 475.01, cited in config.ts)
// may reserve to licensees. The fee is logged as a flat dollar amount.
//
// A closed gate throws ComplianceError (src/compliance/gate.ts), the same
// error every other compliance block throws. Suppressed and do-not-contact
// prospects are never exported (CAN-SPAM 15 U.S.C. 7704(a)(4): an opt-out
// may not be transferred or sold), checked with the Suppression class the
// sender uses (its +tag, Gmail-dot and parent-domain matching included), and
// neither is the internal owner-age estimate or the score (DESIGN principle
// 5; offer.md M7). Every exported lead is logged in exports.csv.

/** The public-record and contact fields a partner receives. No score, no age estimate, no conversation. */
export const EXPORT_COLUMNS = [
  "prospect_id", "business_name", "dba_name", "vertical", "street", "city", "state", "zip", "phone", "website",
  "owner_name", "email", "license_numbers", "license_types", "license_issue_date", "formation_date",
] as const satisfies readonly (keyof ProspectRow)[];

/** Export named prospects to a partner. Throws unless the gate is open; skips (with a reason) anything not exportable. */
export function exportLeads(
  stores: Stores,
  config: EngineConfig,
  opts: { partner: string; now: Date; prospectIds: string[]; outFile: string },
): { exported: number; skipped: { prospectId: string; reason: string }[] } {
  const gate: string[] = [];
  if (!config.lead_sales.enabled) gate.push("lead_sales.enabled is false");
  if (!config.lead_sales.legal_review_ref.trim()) gate.push("lead_sales.legal_review_ref is blank (record counsel's sign-off first)");
  if (!opts.partner.trim()) gate.push("partner is blank");
  if (!(config.lead_sales.flat_fee >= 0)) gate.push("lead_sales.flat_fee must be a flat dollar amount");
  // A closed gate is a compliance block like any other (DESIGN principle 2): it throws, it never warns and exports.
  if (gate.length) throw new ComplianceError([...gate, "lead export blocked: see docs/COMPLIANCE.md"]);

  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  const suppression = new Suppression(stores.suppression);
  const existing = stores.exports.rows();
  const already = new Set(existing.filter((x) => x.partner === opts.partner).map((x) => x.prospect_id));
  const nextExportId = idAllocator("E", 6, existing.map((x) => x.export_id));
  const skipped: { prospectId: string; reason: string }[] = [];
  const out: ProspectRow[] = [];
  const seen = new Set<string>();

  for (const id of opts.prospectIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const p = prospects.get(id);
    if (!p) { skipped.push({ prospectId: id, reason: "not found" }); continue; }
    if (p.status === "dnc") { skipped.push({ prospectId: id, reason: "do not contact" }); continue; }
    const hit = suppression.check(p.email, p.prospect_id);
    if (hit) { skipped.push({ prospectId: id, reason: `suppressed (${hit.reason})` }); continue; }
    if (already.has(id)) { skipped.push({ prospectId: id, reason: `already exported to ${opts.partner}` }); continue; }
    out.push(p);
  }

  fs.mkdirSync(path.dirname(opts.outFile), { recursive: true });
  fs.writeFileSync(opts.outFile, stringify(out.map((p) => Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, String(p[c] ?? "")]))), { header: true, columns: [...EXPORT_COLUMNS] }));

  const stamp = isoStamp(opts.now);
  const log: ExportRow[] = out.map((p) => ({
    export_id: nextExportId(),
    partner: opts.partner,
    prospect_id: p.prospect_id,
    fee: config.lead_sales.flat_fee,
    exported_at: stamp,
    legal_review_ref: config.lead_sales.legal_review_ref,
  }));
  stores.exports.append(log);
  return { exported: out.length, skipped };
}
