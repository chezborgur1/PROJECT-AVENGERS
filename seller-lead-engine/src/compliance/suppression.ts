import { normalizeEmail, type SuppressionRow } from "../domain/schema.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";

// The permanent do-not-contact list (data/suppression.csv). A CAN-SPAM
// opt-out never expires: after the request the address may not be emailed
// again without later affirmative consent (15 U.S.C. 7704(a)(4);
// docs/research/compliance.md, verification row 1 and missed item 7). So
// this class can add rows and never removes one, and nothing else in the
// engine deletes them either.
//
// Matching errs toward suppressing (compliance.md section 9 rule 1): an
// address matches its exact form, its form without a "+tag", Gmail's
// dotless form, its domain and every parent domain, and the prospect id.
//
// If the file has rows that do not parse, some suppressed address could be
// hiding in them, so `check` fails closed and reports every address as
// suppressed until the file is fixed. `add` still works, so opt-outs are
// never lost while the file is being repaired.

type SuppressionTable = Stores["suppression"];

/** The comparison form of an address: lower case, no +tag, and no dots in a Gmail local part. */
export function canonicalEmail(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  let local = e.slice(0, at).replace(/\+.*$/, "");
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** The permanent suppression list over its CSV table. */
export class Suppression {
  private rows: SuppressionRow[] = [];
  private byEmail = new Map<string, SuppressionRow>();
  private byDomain = new Map<string, SuppressionRow>();
  private byProspect = new Map<string, SuppressionRow>();
  /** Rows on disk that failed validation; while any exist, `check` fails closed. */
  invalid: { line: number; key: string; error: string }[] = [];

  constructor(private readonly table: SuppressionTable) {
    this.reload();
  }

  /** Re-read the table (another process may have added rows). */
  reload(): void {
    const { rows, invalid } = this.table.load();
    this.rows = [];
    this.byEmail.clear();
    this.byDomain.clear();
    this.byProspect.clear();
    this.invalid = invalid;
    for (const r of rows) this.index(r);
  }

  private index(r: SuppressionRow): void {
    this.rows.push(r);
    if (r.value_type === "email") {
      if (!this.byEmail.has(canonicalEmail(r.value))) this.byEmail.set(canonicalEmail(r.value), r);
    } else if (r.value_type === "domain") {
      if (!this.byDomain.has(r.value)) this.byDomain.set(r.value, r);
    } else if (!this.byProspect.has(r.value)) this.byProspect.set(r.value, r);
  }

  /** The row that suppresses this address (exact, +tag-less, its domain or a parent) or prospect, or undefined. */
  check(email: string, prospectId?: string): SuppressionRow | undefined {
    if (this.invalid.length) {
      const first = this.invalid[0]!;
      return {
        value: normalizeEmail(email) || prospectId || "?",
        value_type: "email",
        reason: "do_not_contact",
        source: `suppression.csv has ${this.invalid.length} unreadable row(s) (line ${first.line}: ${first.error}); fix the file before sending`,
        added_at: "",
      };
    }
    return this.lookup(email, prospectId);
  }

  /**
   * The readable row that suppresses this address or prospect, ignoring
   * unreadable rows. For bookkeeping only (scoring): every send, export and
   * draft uses `check`, which fails closed.
   */
  lookup(email: string, prospectId?: string): SuppressionRow | undefined {
    const e = normalizeEmail(email);
    if (e) {
      const hit = this.byEmail.get(canonicalEmail(e));
      if (hit) return hit;
      const domain = e.slice(e.lastIndexOf("@") + 1);
      const labels = domain.split(".");
      for (let i = 0; i < labels.length - 1; i++) {
        const d = this.byDomain.get(labels.slice(i).join("."));
        if (d) return d;
      }
    }
    if (prospectId) return this.byProspect.get(prospectId.trim());
    return undefined;
  }

  /** Suppress an email, domain or prospect id. Idempotent: an existing value keeps its first reason and date. Never removes. */
  add(value: string, valueType: "email" | "domain" | "prospect", reason: SuppressionRow["reason"], source: string, now: Date): void {
    const v = normalizeValue(value, valueType);
    // The table is keyed by value: an exact value already listed means nothing to add.
    if (this.rows.some((r) => r.value === v)) return;
    const row: SuppressionRow = { value: v, value_type: valueType, reason, source, added_at: isoStamp(now) };
    this.table.append([row]);
    this.index(row);
  }

  /** Every suppression row, oldest first. */
  all(): SuppressionRow[] {
    return [...this.rows];
  }
}

function normalizeValue(value: string, valueType: "email" | "domain" | "prospect"): string {
  if (valueType === "email") {
    const e = normalizeEmail(value);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error(`Cannot suppress "${value}": not an email address`);
    return e;
  }
  if (valueType === "domain") {
    const d = value.trim().toLowerCase().replace(/^.*@/, "").replace(/\.$/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error(`Cannot suppress "${value}": not a domain`);
    return d;
  }
  const id = value.trim();
  if (!id) throw new Error("Cannot suppress a blank prospect id");
  return id;
}
