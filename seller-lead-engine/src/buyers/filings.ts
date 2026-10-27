import fs from "node:fs";
import path from "node:path";
import type { EngineConfig } from "../config.ts";
import { assertRequiredColumns, forEachCsvRecord, mapHeaders, normalizeState } from "../sources/csvImport.ts";
import { extractZip, fetchToFile, findDataLinks, reach, safeName } from "../sources/download.ts";
import { assignVertical } from "../sources/merge.ts";
import { matchKey, normalizePhone, titleCaseBusinessName } from "../sources/normalize.ts";
import { forEachLine } from "../sources/sunbiz.ts";
import { idAllocator } from "../store/csvTable.ts";
import type { Stores } from "../store/index.ts";
import { isoStamp } from "../util/dates.ts";
import { priorityStates, sourceCode, upsertBuyers, warmMailbox, type IncomingBuyer } from "./core.ts";
import type { PartnerRow } from "./schema.ts";

// Buyers and referral partners from federal public filings, all free bulk
// downloads published for reuse (no site is crawled):
//
// - SEC Form D data sets: every private fund that raised money files Form D,
//   with its size, type, address, phone and executive officers. Private
//   equity funds of a size that buys $1M to $10M businesses become "fund"
//   leads. Form D gives no email, so these leads need one found (the firm's
//   website, from Form ADV or a person) before any invitation.
// - SEC Form ADV adviser lists (registered and exempt reporting advisers):
//   the firms that run private funds, with their websites, so enrichment can
//   find a published address on the firm's own site.
// - SBA 7(a) loan data: every change-of-ownership loan names its lender, so
//   the lenders who finance the most business purchases in AMB's states
//   become referral partners (their buyers need deals), and the businesses
//   bought with those loans become add-on buyers.
//
// None of these files' exact column names could be checked from the build
// environment, so every importer maps headers by alias and fails with the
// headers it found, as the Florida importers do.

/** The SEC page that links each quarter's Form D data set (a zip of tab-separated files). */
export const FORM_D_PAGE = "https://www.sec.gov/data-research/sec-markets-data/form-d-data-sets";
/** SBA's open-data catalogue entry for the 7(a) and 504 loan data (CKAN). */
export const SBA_FOIA_PACKAGE = "https://data.sba.gov/api/3/action/package_show?id=7-a-504-foia";

/** The User-Agent the SEC requires of automated requests: a company and a contact email (sec.gov "Accessing EDGAR Data"). */
export function secUserAgent(config: EngineConfig): string {
  const set = config.buyers.sec_user_agent.trim();
  if (set) return set;
  const email = warmMailbox(config)?.email ?? "";
  if (!email || /\.example$/i.test(email)) throw new Error('The SEC asks every automated download to name a company and a contact email: set buyers.sec_user_agent, for example "AMB Advisory Services ops@ambadvisoryservices.com".');
  return `${config.firm.name} ${email}`;
}

// ---------------------------------------------------------------- Form D

/** Download the latest `quarters` Form D data sets into `dir`; returns the folders of tab-separated files, newest first. */
export async function downloadFormD(config: EngineConfig, opts: { dir: string; quarters?: number; fetchImpl?: typeof fetch; pageUrl?: string; log?: (line: string) => void }): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pageUrl = opts.pageUrl ?? FORM_D_PAGE;
  const init = { headers: { "User-Agent": secUserAgent(config), Accept: "text/html,application/zip;q=0.9,*/*;q=0.8" } };
  const res = await reach(fetchImpl, pageUrl, init);
  if (!res.ok) throw new Error(`Could not open the SEC Form D page (${pageUrl}): HTTP ${res.status}`);
  const quarter = (u: string) => /(\d{4})[_-]?q([1-4])/i.exec(u);
  const links = findDataLinks(await res.text(), pageUrl)
    .filter((l) => /\.zip/i.test(l.url) && quarter(l.url))
    .sort((a, b) => quarter(b.url)![0].toLowerCase().localeCompare(quarter(a.url)![0].toLowerCase()));
  if (!links.length) throw new Error(`The SEC page ${pageUrl} links to no quarterly Form D zip. Download one by hand from that page, unzip it, and run: npm run engine -- buyers import form-d <folder>`);
  const out: string[] = [];
  for (const link of links.slice(0, Math.max(1, opts.quarters ?? 4))) {
    const q = quarter(link.url)![0].toLowerCase().replace(/[_-]/, "");
    const folder = path.join(opts.dir, q);
    const zip = path.join(opts.dir, safeName(new URL(link.url).pathname));
    opts.log?.(`  SEC Form D ${q}`);
    await fetchToFile(fetchImpl, link.url, zip, init);
    fs.mkdirSync(folder, { recursive: true });
    await extractZip(zip, folder, /\.(tsv|txt|csv)$/i);
    out.push(folder);
  }
  return out;
}

/** Read a tab-separated file, header first, calling `fn` with each row keyed by normalized header ("ENTITYNAME" -> "entityname"). */
function forEachTsv(file: string, fn: (row: Record<string, string>) => void): void {
  let header: string[] | undefined;
  forEachLine(file, (raw) => {
    const line = Buffer.from(raw.replace(/\r$/, ""), "latin1").toString("utf8");
    if (!line.trim()) return;
    const cells = line.split("\t").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    if (!header) {
      header = cells.map((h) => h.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
      return;
    }
    fn(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
  });
}

/** The file in a Form D folder whose name starts with `stem` (FORMDSUBMISSION, ISSUERS, OFFERING, RELATEDPERSONS). */
function formDFile(dir: string, stem: string): string {
  const hit = fs.readdirSync(dir).find((f) => f.toLowerCase().replace(/[^a-z]/g, "").startsWith(stem.toLowerCase()) && /\.(tsv|txt|csv)$/i.test(f));
  if (!hit) throw new Error(`${dir} has no ${stem} file (found: ${fs.readdirSync(dir).join(", ") || "nothing"}). Point the import at an unzipped quarterly Form D data set.`);
  return path.join(dir, hit);
}

/** Fund names that are not business buyers: real estate, credit, venture, crypto, feeder and fund-of-funds vehicles. */
const NOT_A_BUSINESS_BUYER = /\b(reit|real estate|realty|propert(y|ies)|apartments?|multi-?family|housing|homes|land|mortgage|credit|lending|loan|debt|income fund|venture|seed|crypto|bitcoin|blockchain|digital assets?|feeder|offshore|master fund|fund of funds|secondar(y|ies)|oil|gas|energy|minerals|film|music|wine|art)\b/i;
/** Names that read like a search fund or an acquisition vehicle, which buy one small business at a time. */
const SEARCH_FUND = /\b(search|acquisitions?|acquisition (partners|holdings|corp))\b/i;

/** "Acme Capital Partners Fund III, L.P." -> "Acme Capital Partners": the firm behind a fund, so one firm is one lead. */
export function firmRoot(name: string): string {
  return name
    .replace(/,?\s*\b(l\.?l\.?c|l\.?p|ltd|inc|corp|co|lllp|llp|plc)\b\.?/gi, "")
    .replace(/\b(fund|funds|feeder|parallel|co-?invest(ment)?|opportunit(y|ies)|holdings|aiv|spv|series|investors?)\b.*$/i, "")
    .replace(/\b([ivx]+|\d+)\b\s*$/i, "")
    .replace(/[\s,.-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The words that differ between a fund and the adviser that runs it, taken out: "Gulf Harbor Capital Partners" and "Gulf Harbor Capital Management" share "gulfharbor". */
export function firmKey(name: string): string {
  const key = firmRoot(name)
    .toLowerCase()
    .replace(/\b(management|managers?|advis[eo]rs?|advisory|partners|capital|group|gp|equity|investments?|holdings|associates|company)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return key.length >= 4 ? key : "";
}

const amount = (raw: string) => {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** What a Form D import found. */
export interface FormDImport {
  filings: number;
  funds: number;
  searchFunds: number;
  incoming: IncomingBuyer[];
}

/**
 * The private equity funds (and search funds) in one quarterly Form D data
 * set: pooled funds of the configured types up to fund_max_offering, minus
 * real estate, credit and venture vehicles; plus small offerings whose
 * name reads like a search fund. One lead per firm, named for its first
 * executive officer, with the firm's phone and address from the filing.
 */
export function readFormD(dir: string, config: EngineConfig): FormDImport {
  const types = new Set(config.buyers.fund_types.map((t) => t.toLowerCase()));
  const filed = new Map<string, string>();
  forEachTsv(formDFile(dir, "FORMDSUBMISSION"), (r) => filed.set(r.accessionnumber ?? "", (r.filingdate ?? r.filedate ?? "").slice(0, 10)));
  const offers = new Map<string, { kind: "fund" | "search"; total?: number; type: string }>();
  forEachTsv(formDFile(dir, "OFFERING"), (r) => {
    const acc = r.accessionnumber ?? "";
    const group = (r.industrygrouptype ?? "").toLowerCase();
    const fundType = (r.investmentfundtype ?? "").toLowerCase();
    const total = amount(r.totalofferingamount ?? "");
    if (group.includes("pooled investment fund") && types.has(fundType)) {
      if (total === undefined || total <= config.buyers.fund_max_offering) offers.set(acc, { kind: "fund", total, type: r.investmentfundtype ?? "" });
    } else if (!group.includes("pooled") && total !== undefined && total <= 5_000_000) offers.set(acc, { kind: "search", total, type: r.industrygrouptype ?? "" });
  });
  const people = new Map<string, string>();
  try {
    forEachTsv(formDFile(dir, "RELATEDPERSONS"), (r) => {
      const acc = r.accessionnumber ?? "";
      const roles = [r.relationship1, r.relationship2, r.relationship3, r.relationship].join(" ");
      if (people.has(acc) || !/executive officer/i.test(roles)) return;
      const name = [r.firstname, r.lastname].filter((x) => x && x.trim() && !/^n\/?a$/i.test(x)).join(" ");
      if (name) people.set(acc, name);
    });
  } catch {
    // Related persons are a nicety: a set without them still gives firms and phones.
  }
  const byFirm = new Map<string, IncomingBuyer & { fund_size?: number }>();
  let filings = 0;
  let searchFunds = 0;
  forEachTsv(formDFile(dir, "ISSUERS"), (r) => {
    const acc = r.accessionnumber ?? "";
    const offer = offers.get(acc);
    if (!offer) return;
    if (r.isprimaryissuerflag && !/^(y|yes|true|1)$/i.test(r.isprimaryissuerflag)) return;
    const entity = (r.entityname ?? "").trim();
    if (!entity || NOT_A_BUSINESS_BUYER.test(entity)) return;
    if (offer.kind === "search" && !SEARCH_FUND.test(entity)) return;
    filings++;
    const root = firmRoot(entity) || entity;
    const key = root.toLowerCase();
    const date = filed.get(acc) ?? "";
    const prior = byFirm.get(key);
    const size = offer.total;
    const detail = `Form D ${date || "filing"}: ${titleCaseBusinessName(entity)}${size ? `, ${offer.kind === "search" ? "raised up to" : "offering"} $${Math.round(size / 1e6) >= 1 ? `${(size / 1e6).toFixed(1)}M` : `${Math.round(size / 1e3)}K`}` : ""} (${offer.type})`;
    if (prior) {
      if (size && (!prior.fund_size || size > prior.fund_size)) prior.fund_size = size;
      if (date > (/\b(\d{4}-\d{2}-\d{2})\b/.exec(prior.source_detail)?.[1] ?? "")) prior.source_detail = detail;
      return;
    }
    if (offer.kind === "search") searchFunds++;
    byFirm.set(key, {
      kind: "fund",
      name: people.get(acc) ?? "",
      company: titleCaseBusinessName(root),
      phone: normalizePhone(r.issuerphonenumber ?? ""),
      city: titleCaseBusinessName(r.city ?? ""),
      state: normalizeState(r.stateorcountry ?? "").slice(0, 2),
      source: "sec-form-d",
      source_detail: detail,
      interest: offer.kind === "search" ? "possible search fund or acquisition vehicle" : `private fund (${offer.type})`,
      ...(size ? { fund_size: size } : {}),
    });
  });
  const incoming = [...byFirm.values()];
  return { filings, funds: incoming.length, searchFunds, incoming };
}

/** Import one or more unzipped Form D data sets. */
export function importFormD(stores: Stores, config: EngineConfig, dirs: readonly string[], now: Date) {
  const all: IncomingBuyer[] = [];
  let filings = 0;
  let searchFunds = 0;
  for (const d of dirs) {
    const r = readFormD(d, config);
    all.push(...r.incoming);
    filings += r.filings;
    searchFunds += r.searchFunds;
  }
  return { filings, firms: all.length, searchFunds, ...upsertBuyers(stores, all, now) };
}

// ---------------------------------------------------------------- Form ADV

/** Header names in the SEC's adviser lists (registered and exempt reporting advisers), first match wins. */
export const ADV_COLUMNS: Record<string, string[]> = {
  company: ["primary business name", "business name", "firm name", "organization name", "legal name", "name"],
  website: ["website address", "website", "web address", "websites", "1i website address", "url"],
  city: ["main office city", "city", "office city"],
  state: ["main office state", "state", "office state"],
  phone: ["main office telephone number", "telephone number", "phone", "phone number"],
  aum: ["regulatory assets under management", "total raum", "raum", "5f2c", "assets under management", "aum", "gross asset value", "private fund gross asset value"],
  contact: ["chief compliance officer", "cco name", "contact person", "contact name", "principal"],
  email: ["chief compliance officer email", "cco email", "contact email", "email"],
  type: ["type", "adviser type", "filing type", "status"],
};

/** Adviser names that are not private equity: wealth, retirement and insurance shops, and the big banks. */
const NOT_PE = /\b(wealth|financial (planning|advisors?|group|services)|retirement|insurance|planning|tax|annuit|401|pension|family wealth|private (client|bank)|bank|trust company)\b/i;

/** Read an adviser list CSV; wealth managers are left out unless `asPartners`, which keeps only them (they refer clients who buy). */
export function readAdvisers(file: string, opts: { asPartners?: boolean } = {}): { incoming: IncomingBuyer[]; skipped: number } {
  let index: Record<string, number> | undefined;
  const incoming: IncomingBuyer[] = [];
  let skipped = 0;
  forEachCsvRecord(file, (cells, line) => {
    if (!index) {
      const mapped = mapHeaders(cells, ADV_COLUMNS);
      assertRequiredColumns("an adviser list", file, [["company"]], mapped.index, mapped.unknown, ADV_COLUMNS);
      index = mapped.index;
      return;
    }
    const get = (f: string) => (index![f] !== undefined ? (cells[index![f]!] ?? "").trim() : "");
    const company = get("company");
    if (!company) return;
    const wealth = NOT_PE.test(company);
    if (wealth !== Boolean(opts.asPartners)) {
      skipped++;
      return;
    }
    const aum = amount(get("aum"));
    const email = get("email");
    incoming.push({
      kind: "adviser",
      name: get("contact"),
      company: titleCaseBusinessName(company),
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "",
      email_source: "filing",
      phone: normalizePhone(get("phone")),
      website: get("website").split(/[\s,;]+/)[0] ?? "",
      city: titleCaseBusinessName(get("city")),
      state: normalizeState(get("state")).slice(0, 2),
      source: "sec-form-adv",
      source_detail: `SEC adviser list, ${path.basename(file)} line ${line}${get("type") ? ` (${get("type")})` : ""}`,
      interest: "private fund adviser",
      ...(aum ? { fund_size: aum } : {}),
    });
  });
  return { incoming, skipped };
}

/** Import an adviser list as buyer leads. */
export function importAdvisers(stores: Stores, file: string, now: Date) {
  const r = readAdvisers(file);
  return { ...upsertBuyers(stores, r.incoming, now), skipped: r.skipped };
}

// ---------------------------------------------------------------- SBA 7(a)

/** Header names in SBA's 7(a) loan data, first match wins. */
export const SBA_COLUMNS: Record<string, string[]> = {
  borrower: ["borrname", "borrower name", "borrowername"],
  borrower_city: ["borrcity", "borrower city"],
  borrower_state: ["borrstate", "borrower state"],
  borrower_zip: ["borrzip", "borrower zip"],
  bank: ["bankname", "lender name", "lendername", "bank name"],
  bank_city: ["bankcity", "lender city"],
  bank_state: ["bankstate", "lender state"],
  amount: ["grossapproval", "gross approval", "approval amount"],
  approved: ["approvaldate", "approval date"],
  project_state: ["projectstate", "project state"],
  naics: ["naicsdescription", "naics description"],
  business_age: ["businessage", "business age"],
  status: ["loanstatus", "loan status"],
  franchise: ["franchisename", "franchise name"],
};

/** What an SBA import found. */
export interface SbaImport {
  loans: number;
  lenders: PartnerRow[];
  acquirers: IncomingBuyer[];
}

const isoish = (raw: string) => {
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (iso) return iso;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  return us ? `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}` : "";
};

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);

/**
 * Read SBA 7(a) loan data (streamed: the file runs to hundreds of
 * megabytes). Change-of-ownership loans in the priority states approved on
 * or after `since` count for their lender; the 25 lenders with the most
 * become partner prospects. The businesses bought with those loans, in
 * AMB's industries and not franchises, are proven buyers who may add on.
 */
export function readSba7a(file: string, config: EngineConfig, opts: { since: string; topLenders?: number; now: Date }): SbaImport {
  const states = new Set(priorityStates(config));
  let index: Record<string, number> | undefined;
  const lenders = new Map<string, { name: string; city: string; state: string; loans: number; total: number; industries: Map<string, number> }>();
  const acquirers: IncomingBuyer[] = [];
  let loans = 0;
  forEachCsvRecord(file, (cells, line) => {
    if (!index) {
      const mapped = mapHeaders(cells, SBA_COLUMNS);
      assertRequiredColumns("SBA 7(a) loan data", file, [["bank"], ["business_age"], ["approved"]], mapped.index, mapped.unknown, SBA_COLUMNS);
      index = mapped.index;
      return;
    }
    const get = (f: string) => (index![f] !== undefined ? (cells[index![f]!] ?? "").trim() : "");
    if (!/change of ownership/i.test(get("business_age"))) return;
    const state = (get("project_state") || get("borrower_state")).toUpperCase();
    if (states.size && !states.has(state)) return;
    const approved = isoish(get("approved"));
    if (!approved || approved < opts.since) return;
    if (/cancel/i.test(get("status"))) return;
    loans++;
    const bank = get("bank");
    const amt = amount(get("amount")) ?? 0;
    const key = bank.toLowerCase().replace(/[^a-z0-9]/g, "");
    const entry = lenders.get(key) ?? { name: bank, city: get("bank_city"), state: get("bank_state"), loans: 0, total: 0, industries: new Map() };
    entry.loans++;
    entry.total += amt;
    const naics = get("naics");
    if (naics) entry.industries.set(naics, (entry.industries.get(naics) ?? 0) + 1);
    lenders.set(key, entry);
    const vertical = assignVertical([naics, get("borrower")], [], config);
    if (vertical && !get("franchise")) {
      acquirers.push({
        kind: "strategic",
        company: titleCaseBusinessName(get("borrower")),
        city: titleCaseBusinessName(get("borrower_city")),
        state: get("borrower_state").toUpperCase().slice(0, 2),
        source: "sba-acquirers",
        source_detail: `Bought with an SBA 7(a) change-of-ownership loan approved ${approved} (${money(amt)}, ${bank}), line ${line}`,
        interest: `${config.verticals[vertical]?.noun ?? vertical}; proven buyer`,
        notes: `zip ${get("borrower_zip")}`,
      });
    }
  });
  const stamp = isoStamp(opts.now);
  const top = [...lenders.values()].sort((a, b) => b.loans - a.loans || b.total - a.total).slice(0, opts.topLenders ?? 25);
  const where = states.size ? [...states].join(", ") : "all states";
  const partnerRows: PartnerRow[] = top.map((l) => {
    const industries = [...l.industries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n.toLowerCase());
    return {
      partner_id: "",
      kind: "sba_lender",
      name: titleCaseBusinessName(l.name),
      contact_name: "",
      email: "",
      phone: "",
      city: titleCaseBusinessName(l.city),
      state: l.state.toUpperCase().slice(0, 2),
      evidence: `${l.loans} change-of-ownership SBA 7(a) loans in ${where} since ${opts.since}, ${money(l.total)} in all${industries.length ? `; most in ${industries.join(", ")}` : ""}`,
      source: `partner-${sourceCode(l.name)}`.slice(0, 48),
      status: "prospect",
      created_at: stamp,
      notes: "Find the SBA business development officer for the region and ask whether their pre-qualified buyers may register for AMB's deals.",
    };
  });
  return { loans, lenders: partnerRows, acquirers };
}

/** Import SBA 7(a) data: lenders into buyers/partners.csv (new ones only, by name), proven buyers into buyers/leads.csv. */
export function importSba7a(stores: Stores, config: EngineConfig, file: string, opts: { since: string; now: Date }) {
  const r = readSba7a(file, config, opts);
  const prospects = new Map(stores.prospects.rows().map((p) => [matchKey(p.business_name, p.zip), p]));
  for (const a of r.acquirers) {
    // A business the seller side already has gains its record's website and phone, and the link that keeps the two sides apart.
    const p = prospects.get(matchKey(a.company ?? "", /zip (\d{5})/.exec(a.notes ?? "")?.[1] ?? ""));
    if (p) Object.assign(a, { prospect_id: p.prospect_id, website: p.website, phone: p.phone, name: p.owner_name });
  }
  const leads = upsertBuyers(stores, r.acquirers, opts.now);
  const partners = upsertPartners(stores, r.lenders);
  return { loans: r.loans, lenders: r.lenders.length, partnersAdded: partners.added, ...leads };
}

/** Add partners not already listed (by kind and name); a listed partner keeps what a person wrote, and gains new evidence. */
export function upsertPartners(stores: Stores, incoming: readonly PartnerRow[]): { added: number; updated: number } {
  const rows = stores.partners.rows();
  const key = (p: Pick<PartnerRow, "kind" | "name">) => `${p.kind}|${p.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const byKey = new Map(rows.map((p) => [key(p), p]));
  const next = idAllocator("BP", 4, rows.map((p) => p.partner_id));
  const out: PartnerRow[] = [];
  let added = 0;
  let updated = 0;
  for (const p of incoming) {
    const prior = byKey.get(key(p));
    if (!prior) {
      const row = { ...p, partner_id: next() };
      byKey.set(key(row), row);
      out.push(row);
      added++;
    } else if (p.evidence && prior.evidence !== p.evidence) {
      out.push({ ...prior, evidence: p.evidence });
      updated++;
    }
  }
  if (out.length) stores.partners.upsert(out);
  return { added, updated };
}

/** Download SBA's 7(a) loan data (the newest "present" file) into `dir`, through the open-data catalogue. */
export async function downloadSba7a(opts: { dir: string; fetchImpl?: typeof fetch; packageUrl?: string; log?: (line: string) => void }): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = opts.packageUrl ?? SBA_FOIA_PACKAGE;
  const res = await reach(fetchImpl, url);
  if (!res.ok) throw new Error(`Could not open SBA's data catalogue (${url}): HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { resources?: { name?: string; url?: string; format?: string }[] } };
  const csvs = (body.result?.resources ?? []).filter((r) => r.url && /csv/i.test(`${r.format} ${r.url}`) && /7\s?\(?a\)?/i.test(`${r.name} ${r.url}`) && !/504|data ?dictionary/i.test(`${r.name} ${r.url}`));
  const pick = csvs.find((r) => /present/i.test(`${r.name} ${r.url}`)) ?? csvs.at(-1);
  if (!pick?.url) throw new Error(`SBA's catalogue lists no 7(a) CSV (${url}). Download it by hand from data.sba.gov (7(a) & 504 FOIA) and run: npm run engine -- buyers import sba <file>`);
  const file = path.join(opts.dir, safeName(new URL(pick.url).pathname));
  opts.log?.(`  SBA 7(a): ${pick.name ?? path.basename(file)}`);
  await fetchToFile(fetchImpl, pick.url, file);
  return file;
}
