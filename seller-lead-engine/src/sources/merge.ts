import type { EngineConfig } from "../config.ts";
import {
  joinList,
  normalizeEmail,
  OWNER_ROLES,
  ProspectRowSchema,
  type ContactRow,
  type EntityRow,
  type LicenseRow,
  type PoiRow,
  type ProspectRow,
} from "../domain/schema.ts";
import { betterStaff, importedStaff, type StaffEstimate } from "../contacts/staff.ts";
import { idAllocator, toCells } from "../store/csvTable.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";
import { isPersonName, matchKey, normalizeBusinessName, splitPersonName, titleCaseBusinessName, titleCasePlace, zip5 } from "./normalize.ts";

// The build step: canonical imports (entities, licences, open POI, contacts)
// into prospects.csv, one row per business. Licences join to entities by
// matchKey (normalised name + 5-digit zip, on the licence's business name or
// DBA); POI rows add website and phone, contact rows add an email, both by
// the same key. Licences are the base list and the entity file names the
// owners (docs/research/data.md sections 0 and 8).
//
// The owner is a person officer with an owner title, else a licence person
// with an owner-type role. Registered agents and qualifiers (RMEs,
// qualifying agents) are never the owner: they are hired or appointed, not
// the seller (data.md verification notes 1, 7 and 9).
//
// The build is idempotent: a second run over the same imports changes
// nothing. It keeps prospect ids and every sequence and scoring field, and
// never changes the status of a prospect that is dnc, in_sequence, replied
// or completed.

export interface BuildResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: { reason: string; name: string }[];
}

/** Corporation officer titles that mark an owner (Sunbiz P, PRES, CEO, D, DIR, OWNER). */
const CORP_OWNER_TITLES = new Set(["P", "PRES", "PRESIDENT", "CEO", "D", "DIR", "DIRECTOR", "OWNER", "SOLEOWNER", "PROPRIETOR"]);
/** LLC titles: manager, managing member, authorized member, authorized person, member. */
const LLC_OWNER_TITLES = new Set(["MGR", "MGRM", "MANAGER", "MM", "MANAGINGMEMBER", "AMBR", "AP", "MBR", "MEMBER", "AUTHORIZEDMEMBER", "AUTHORIZEDPERSON"]);
const PARTNER_TITLES = new Set(["GP", "GENERALPARTNER"]);
/** Titles that mark an agent, never an owner. */
const AGENT_TITLES = new Set(["R", "RA", "AGENT", "REGISTEREDAGENT"]);

const cleanTitle = (t: string) => t.toUpperCase().replace(/[^A-Z]/g, "");

/** True when an officer title marks an owner. Combined Sunbiz codes count when they include P or D ("PD", "PST"), but not V ("VP" is vice president). */
export function isOwnerTitle(title: string): boolean {
  const t = cleanTitle(title);
  if (!t || AGENT_TITLES.has(t)) return false;
  if (CORP_OWNER_TITLES.has(t) || LLC_OWNER_TITLES.has(t) || PARTNER_TITLES.has(t)) return true;
  return /^[PTSDC]{2,4}$/.test(t) && /[PD]/.test(t);
}

function ownerRoleForTitle(title: string): ProspectRow["owner_role"] {
  const t = cleanTitle(title);
  if (t === "OWNER" || t === "SOLEOWNER" || t === "PROPRIETOR") return "owner";
  if (LLC_OWNER_TITLES.has(t) || PARTNER_TITLES.has(t)) return "principal";
  return "officer";
}

/** Lower-case words for keyword matching: punctuation and underscores become spaces ("hvac_services" -> "hvac services"). */
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * The vertical key for a business: licence codes win (a CAC licence is HVAC
 * whatever the name says), then keywords in the texts (licence types,
 * names, POI categories). Verticals are tried in config order; "" when none.
 */
export function assignVertical(text: string[], licenseCodes: string[], config: EngineConfig): string {
  const codes = new Set<string>();
  for (const c of licenseCodes) {
    const up = c.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (!up) continue;
    codes.add(up);
    const prefix = /^[A-Z]+/.exec(up)?.[0];
    if (prefix) codes.add(prefix); // "CAC1814522" -> "CAC"
  }
  const entries = Object.entries(config.verticals);
  for (const [key, v] of entries) {
    if (v.license_codes.some((c) => codes.has(c.toUpperCase()))) return key;
  }
  const hay = text.map(words).join(" ");
  for (const [key, v] of entries) {
    if (v.keywords.some((k) => k.trim() && hay.includes(words(k)))) return key;
  }
  return "";
}

const countyKey = (c: string) =>
  c.toLowerCase().replace(/\bcounty\b/g, "").replace(/\bsaint\b/g, "st").replace(/[^a-z]/g, "");

/**
 * The metro key for a location. The state must match the metro's; then the
 * county decides when it is known and the metro lists counties, and the zip
 * prefix decides otherwise (config: "zip prefixes used when county is
 * missing"). "" when outside every metro.
 */
export function assignMetro(county: string, zip: string, state: string, config: EngineConfig): string {
  const st = state.trim().toUpperCase();
  const z = zip5(zip);
  const ck = countyKey(county);
  for (const [key, m] of Object.entries(config.metros)) {
    if (st && st !== m.state) continue;
    if (!st && !z) continue;
    if (ck && m.counties.length) {
      if (m.counties.some((c) => countyKey(c) === ck)) return key;
      continue;
    }
    if (z && m.zip_prefixes.some((p) => z.startsWith(p.trim()))) return key;
  }
  return "";
}

// ---------------------------------------------------------------- the build

interface Business {
  entities: EntityRow[];
  licenses: LicenseRow[];
}

const ROLE_RANK: Record<string, number> = { owner: 0, officer: 1, principal: 2, authorized_official: 3, licensee: 4 };
const ROLE_BASED = new Set(["info", "office", "sales", "admin", "contact", "service", "support", "billing", "hello", "team", "mail", "help", "customerservice", "inquiries", "enquiries", "dispatch", "schedule", "scheduling"]);

const keyUsable = (k: string) => !k.startsWith("|") && !k.endsWith("|");

function entityKeys(e: EntityRow): string[] {
  return [matchKey(e.entity_name, e.principal_zip), matchKey(e.entity_name, e.mailing_zip)].filter(keyUsable);
}
function licenseKeys(l: LicenseRow): string[] {
  const names = [l.business_name, l.dba_name].filter((n) => n.trim());
  if (!names.length && l.person_name.trim()) names.push(l.person_name);
  return names.map((n) => matchKey(n, l.zip)).filter(keyUsable);
}

/** Group entities and licences that share a key into businesses (union-find, so a licence that names both a company and its DBA links them). */
function groupBusinesses(entities: EntityRow[], licenses: LicenseRow[]): Business[] {
  const nodes: ({ e: EntityRow } | { l: LicenseRow })[] = [...entities.map((e) => ({ e })), ...licenses.map((l) => ({ l }))];
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const byKey = new Map<string, number>();
  nodes.forEach((n, i) => {
    for (const k of "e" in n ? entityKeys(n.e) : licenseKeys(n.l)) {
      const j = byKey.get(k);
      if (j === undefined) byKey.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, Business>();
  nodes.forEach((n, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { entities: [], licenses: [] };
    if ("e" in n) g.entities.push(n.e);
    else g.licenses.push(n.l);
    groups.set(root, g);
  });
  return [...groups.values()];
}

function indexBy<T>(rows: T[], keys: (r: T) => string[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) for (const k of keys(r)) if (keyUsable(k)) m.set(k, [...(m.get(k) ?? []), r]);
  return m;
}

interface Owner {
  name: string;
  first: string;
  last: string;
  title: string;
  role: ProspectRow["owner_role"];
}

function officersOf(e: EntityRow | undefined): { people: { name: string; first: string; last: string; title: string }[] } {
  const people: { name: string; first: string; last: string; title: string }[] = [];
  if (!e) return { people };
  const rec = e as unknown as Record<string, string>;
  for (const i of [1, 2, 3, 4, 5, 6]) {
    const raw = (rec[`officer${i}_name`] ?? "").trim();
    const title = (rec[`officer${i}_title`] ?? "").trim().toUpperCase();
    const flag = rec[`officer${i}_is_person`] ?? "";
    if (!raw || AGENT_TITLES.has(cleanTitle(title))) continue;
    // The person-or-entity flag decides when present; the name test only fills a blank flag.
    const person = flag === "Y" ? isPersonName(raw) || !/\b(INC|LLC|CORP|LTD)\b/i.test(raw) : flag === "N" ? false : isPersonName(raw);
    if (!person) continue;
    const s = splitPersonName(raw);
    people.push({ name: s.full, first: s.first, last: s.last, title });
  }
  return { people };
}

function pickOwner(entity: EntityRow | undefined, licenses: LicenseRow[]): Owner | undefined {
  for (const p of officersOf(entity).people) {
    if (isOwnerTitle(p.title)) return { name: p.name, first: p.first, last: p.last, title: p.title, role: ownerRoleForTitle(p.title) };
  }
  const candidates = licenses
    .filter((l) => (OWNER_ROLES as readonly string[]).includes(l.person_role) && isPersonName(l.person_name))
    .sort((a, b) => (ROLE_RANK[a.person_role] ?? 9) - (ROLE_RANK[b.person_role] ?? 9));
  const l = candidates[0];
  if (!l) return undefined;
  const s = splitPersonName(l.person_name);
  return { name: s.full, first: s.first, last: s.last, title: "", role: l.person_role };
}

function emailRank(c: ContactRow, owner: Owner | undefined): number {
  const local = (c.email.split("@")[0] ?? "").toLowerCase();
  const first = (owner?.first ?? "").toLowerCase();
  const last = (owner?.last ?? "").toLowerCase();
  if (owner && last) {
    if (c.last_name.trim().toLowerCase() === last && (!c.first_name.trim() || c.first_name.trim().toLowerCase() === first)) return 3;
    if ((last.length >= 3 && local.includes(last.replace(/[^a-z]/g, ""))) || (first.length >= 3 && local.split(/[._-]/).includes(first))) return 3;
  }
  if (ROLE_BASED.has(local.replace(/[^a-z]/g, ""))) return 1;
  return 2;
}

function pickContact(contacts: ContactRow[], owner: Owner | undefined): ContactRow | undefined {
  let best: ContactRow | undefined;
  let bestRank = 0;
  for (const c of contacts) {
    if (!c.email.includes("@")) continue;
    const r = emailRank(c, owner);
    if (r > bestRank) {
      best = c;
      bestRank = r;
    }
  }
  return best;
}

function pickPoi(pois: PoiRow[]): PoiRow | undefined {
  return [...pois].sort((a, b) => Number(!!a.date_closed) - Number(!!b.date_closed) || b.date_refreshed.localeCompare(a.date_refreshed))[0];
}

const COLUMNS = Object.keys(ProspectRowSchema.shape);
const KEEP_STATUSES = new Set(["dnc", "in_sequence", "replied", "completed"]);
const RESET_STATUSES = new Set(["scored", "hold", "excluded"]);

/** Join imports into prospects.csv: creates new prospects, refreshes facts on existing ones, skips (with a reason) licences outside the verticals and businesses outside every metro. */
export function buildProspects(stores: Stores, config: EngineConfig, opts: { now: Date }): BuildResult {
  const stamp = isoStamp(opts.now);
  const result: BuildResult = { created: 0, updated: 0, unchanged: 0, skipped: [] };
  const entities = stores.entities.rows();
  const licenses = stores.licenses.rows();
  const pois = stores.pois.rows();
  const contacts = stores.contacts.rows();
  const existing = stores.prospects.rows();

  const poiIndex = indexBy(pois, (p) => [matchKey(p.name, p.zip)]);
  const contactIndex = indexBy(contacts, (c) => [matchKey(c.business_name, c.zip)]);
  const bySource = new Map<string, ProspectRow>();
  const byKey = new Map<string, ProspectRow>();
  for (const p of existing) {
    for (const s of p.sources.split(";").map((x) => x.trim()).filter(Boolean)) if (!bySource.has(s)) bySource.set(s, p);
    for (const k of [matchKey(p.business_name, p.zip), matchKey(p.dba_name, p.zip)]) if (keyUsable(k) && !byKey.has(k)) byKey.set(k, p);
  }
  const claimed = new Set<string>();
  const nextProspectId = idAllocator("P", 5, existing.map((p) => p.prospect_id));
  const writes: ProspectRow[] = [];

  for (const biz of groupBusinesses(entities, licenses)) {
    const target: LicenseRow[] = [];
    for (const l of biz.licenses) {
      const v = assignVertical([l.license_type, l.license_class], [l.license_class, l.license_number], config);
      if (v) target.push(l);
      else result.skipped.push({ reason: `licence ${l.license_number || l.source_record_id} (${l.license_type || l.license_class || "no type"}) is not in a target vertical`, name: titleCaseBusinessName(l.business_name || l.dba_name || l.person_name) });
    }
    target.sort((a, b) => (a.original_issue_date || "9999").localeCompare(b.original_issue_date || "9999") || a.license_number.localeCompare(b.license_number));

    const entity = [...biz.entities].sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.last_annual_report_date.localeCompare(a.last_annual_report_date) ||
        a.source_record_id.localeCompare(b.source_record_id),
    )[0];
    if (!entity && !target.length) continue;

    const keys = [...new Set([...(entity ? biz.entities.flatMap(entityKeys) : []), ...target.flatMap(licenseKeys)])];
    const poi = pickPoi(keys.flatMap((k) => poiIndex.get(k) ?? []));
    const bizContacts = [...new Set(keys.flatMap((k) => contactIndex.get(k) ?? []))];
    const texts = [entity?.entity_name ?? "", ...target.flatMap((l) => [l.license_type, l.business_name, l.dba_name]), poi?.basic_category ?? ""];
    const vertical = assignVertical(texts, target.flatMap((l) => [l.license_class, l.license_number]), config);
    // An entity with no target licence is a candidate only when its own name or POI category says it is in a vertical.
    if (!vertical) continue;

    const lic0 = target[0];
    const rawName = entity?.entity_name || lic0?.business_name || lic0?.dba_name || lic0?.person_name || "";
    const businessName = titleCaseBusinessName(rawName);
    const dbaRaw = target.map((l) => l.dba_name || (entity ? l.business_name : "")).find((n) => n && normalizeBusinessName(n) !== normalizeBusinessName(rawName)) ?? "";
    const street = entity?.principal_street || lic0?.street || "";
    const city = titleCasePlace(entity?.principal_street ? entity.principal_city : lic0?.city || entity?.principal_city || "");
    const state = (entity?.principal_state || entity?.state || lic0?.state || "").toUpperCase();
    const zip = zip5(entity?.principal_zip || lic0?.zip || "") || entity?.principal_zip || lic0?.zip || "";
    const county = titleCasePlace(target.map((l) => l.county).find(Boolean) ?? "", { stripCounty: true });
    const metro = assignMetro(county, zip, state, config);
    if (!metro) {
      result.skipped.push({ reason: `outside every target metro (${[city, county && `${county} County`, `${state} ${zip}`.trim()].filter(Boolean).join(", ")})`, name: businessName });
      continue;
    }

    const owner = pickOwner(entity, target);
    const people = officersOf(entity).people;
    const distinct = new Map(people.map((p) => [p.name.toUpperCase(), p]));
    const contact = pickContact(bizContacts, owner);
    const issueDates = target.map((l) => l.original_issue_date).filter(Boolean).sort();
    const grad = target.map((l) => l.year_graduated).filter((y): y is number => y !== undefined).sort((a, b) => a - b);
    const sources = joinList([
      ...biz.entities.map((e) => `${e.source}:${e.source_record_id}`),
      ...target.map((l) => `${l.source}:${l.source_record_id}`),
      ...(poi ? [`${poi.source}:${poi.source_record_id}`] : []),
      ...bizContacts.map((c) => `${c.source}:${c.source_record_id}`),
    ]);

    // Find the existing prospect: by any shared source record, else by name + zip.
    let prior: ProspectRow | undefined;
    for (const s of sources.split("; ")) {
      const hit = bySource.get(s);
      if (hit && !claimed.has(hit.prospect_id)) {
        prior = hit;
        break;
      }
    }
    if (!prior) {
      for (const k of [matchKey(rawName, zip), ...keys]) {
        const hit = byKey.get(k);
        if (hit && !claimed.has(hit.prospect_id)) {
          prior = hit;
          break;
        }
      }
    }
    if (prior) claimed.add(prior.prospect_id);

    const facts: Record<string, string> = {
      business_name: businessName,
      dba_name: dbaRaw ? titleCaseBusinessName(dbaRaw) : "",
      vertical,
      street,
      city,
      state,
      zip,
      county,
      metro,
      entity_type: entity?.entity_type ?? "",
      entity_status: entity?.status ?? "",
      formation_date: entity?.formation_date ?? "",
      license_numbers: joinList(target.map((l) => l.license_number)),
      license_types: joinList(target.map((l) => l.license_type)),
      license_issue_date: issueDates[0] ?? "",
      license_status: target.length ? (target.some((l) => l.status === "active") ? "active" : joinList(target.map((l) => l.status)) || "unknown") : "",
      year_graduated: grad.length ? String(grad[0]) : "",
      officer_count: String(distinct.size),
      officers: joinList([...distinct.values()].map((p) => `${p.name} (${p.title || "?"})`)),
      owner_name: owner?.name ?? "",
      owner_first_name: owner?.first ?? "",
      owner_last_name: owner?.last ?? "",
      owner_title: owner?.title ?? "",
      owner_role: owner?.role ?? "",
      sources,
    };
    const sourcePhone = poi?.phone || target.map((l) => l.phone).find(Boolean) || bizContacts.map((c) => c.phone).find(Boolean) || "";
    const sourceWebsite = poi?.website || bizContacts.map((c) => c.website).find(Boolean) || "";
    // The largest employee figure any imported list gives (staff.ts): a list names one business, so the figures should agree.
    const imported = bizContacts
      .map((c) => importedStaff(c.employees ?? ""))
      .filter((e): e is StaffEstimate => e !== undefined)
      .sort((a, b) => b.count - a.count)[0];

    if (!prior) {
      const cells: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c, ""]));
      Object.assign(cells, facts, {
        prospect_id: nextProspectId(),
        status: "new",
        phone: sourcePhone,
        website: sourceWebsite,
        email: contact ? normalizeEmail(contact.email) : "",
        email_source: contact?.email_source ?? "",
        email_source_url: contact?.email_source_url ?? "",
        email_verification: "unverified",
        ...(imported ? { staff_count: String(imported.count), staff_source: imported.source, staff_basis: imported.basis } : {}),
        tier: "",
        created_at: stamp,
        updated_at: stamp,
      });
      writes.push(ProspectRowSchema.parse(cells));
      result.created++;
      continue;
    }

    if (prior.status === "dnc") {
      // Opted out or suppressed: never touched again (DESIGN principle 3).
      result.unchanged++;
      continue;
    }
    const before = toCells(prior as unknown as Record<string, unknown>, COLUMNS);
    const after: Record<string, string> = { ...before, ...facts };
    after.phone = sourcePhone || before.phone || "";
    after.website = sourceWebsite || before.website || "";
    // A website's stated figure stays; an import replaces a counted team page or an older import.
    if (imported && betterStaff(imported, prior)) Object.assign(after, { staff_count: String(imported.count), staff_source: imported.source, staff_basis: imported.basis });
    // Never replace an email a later step found or verified; only fill a blank.
    if (!before.email && contact) {
      after.email = normalizeEmail(contact.email);
      after.email_source = contact.email_source;
      after.email_source_url = contact.email_source_url;
      after.email_verification = "unverified";
    }
    const changed = COLUMNS.some((c) => c !== "updated_at" && (after[c] ?? "") !== (before[c] ?? ""));
    if (!changed) {
      result.unchanged++;
      continue;
    }
    if (!KEEP_STATUSES.has(prior.status) && RESET_STATUSES.has(prior.status)) {
      // Facts changed, so the old score is stale: back to "new" for scoreAll (scoring fields are kept until it rescores).
      after.status = "new";
      after.exclude_reason = "";
    }
    after.updated_at = stamp;
    if (!after.created_at) after.created_at = stamp;
    writes.push(ProspectRowSchema.parse(after));
    result.updated++;
  }

  stores.prospects.upsert(writes);
  return result;
}
