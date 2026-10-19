#!/usr/bin/env -S npx tsx
// lead-engine: the AMB Advisory seller lead engine, run as `npm run engine -- <command>`.
//
//   init                                   create data/ and config/engine.config.json from the example if missing
//   preflight                              config, licensing sign-off, DNS (SPF/DKIM/DMARC), warm-up, templates; exit 1 on any failure
//   import sunbiz|dbpr|csv:<preset> <file> [--snapshot YYYY-MM-DD] [--metro-only]
//   build                                  merge imports into prospects.csv
//   enrich [--discover] [--no-verify]      find and verify emails (verifier API when EMAIL_VERIFIER_API_KEY is set)
//   verify <prospectId> <valid|invalid> --by <name>   a person's own check of an address
//   score [--places]                       score and tier (Places details when GOOGLE_PLACES_API_KEY is set)
//   plan [--date YYYY-MM-DD]               show the day's batch without writing
//   send [--date YYYY-MM-DD] [--dry-run]   render, gate and deliver (drafts unless sending.mode = send)
//   record <touchId> <drafted|sent|failed> [--draft-id] [--message-id] [--thread-id] [--error]
//   sync [--since ISO]                     gmail_api: fetch new mail to data/inbox/
//   qualify                                process data/inbox/*.json, move processed files to data/inbox/processed/
//   check <prospectId>                     write the exit-readiness check and draft it as a reply
//   handoff                                write warm-seller summaries (data/handoffs/)
//   report [--date YYYY-MM-DD]             weekly report (data/reports/)
//   dashboard [--date YYYY-MM-DD]          dashboard data files (data/dashboard/)
//   stage <prospectId> <meeting|listed|lost|nurture> [--until YYYY-MM-DD]
//   suppress <email|domain> [--reason <reason>]
//   clear-pause <mailbox> --by <name>
//   export <partner> <prospectId...> --out <file>
//   daily [--date YYYY-MM-DD]              sync (gmail_api), qualify, handoff, send: the scheduled routine
//   status                                 counts, mailbox health and today's caps
//   demo                                   the whole loop offline on samples/tampa-bay in a temp folder
//
// The CLI is the only place that reads the clock: main() takes today and now
// once and passes them into every module (DESIGN.md principle 1). Config and
// data paths come from engineEnv(process.cwd()); templates, reference data
// and samples come from the package itself. Every command is an exported
// function taking injected dependencies (clock, logger, network stubs,
// transport), so tests call them without spawning a process, and main() is
// a thin wrapper that only runs when this file is the entry point.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engineEnv, loadConfig, type EngineConfig, type EngineEnv } from "./config.ts";
import type { OutgoingMessage } from "./domain/messages.ts";
import { normalizeEmail, SUPPRESSION_REASONS, type LeadRow, type LeadStage, type ProspectRow, type SuppressionRow, type TouchRow } from "./domain/schema.ts";
import { aiDisclosure, buildFooter } from "./compliance/footer.ts";
import { assertSendable, ComplianceError } from "./compliance/gate.ts";
import { findMailbox } from "./compliance/lint.ts";
import { Suppression } from "./compliance/suppression.ts";
import { enrichContacts, MANUAL_VERIFICATION_STATUSES, setManualVerification } from "./contacts/enrich.ts";
import { handOffWarmLeads } from "./handoff/handoff.ts";
import { buildReadinessCheck, writeReadinessCheck } from "./readiness/check.ts";
import { loadMultiples } from "./readiness/multiples.ts";
import type { classifyReply } from "./replies/classify.ts";
import { GmailApiInbox, InboundFileSchema, readInboxFolder } from "./replies/inbox.ts";
import { addressOf } from "./replies/parse.ts";
import { processInbox } from "./replies/process.ts";
import { replySubject, shortBusinessName } from "./replies/respond.ts";
import { exportLeads } from "./report/exportLeads.ts";
import { weeklyReport } from "./report/weekly.ts";
import { dashboardData, writeDashboardData } from "./report/dashboard.ts";
import { PlacesClient } from "./score/places.ts";
import { scoreAll } from "./score/score.ts";
import { clearPause, mailboxHealth, touchDay } from "./sending/health.ts";
import { notSendDayReason, planDay, type DayPlan } from "./sending/planner.ts";
import { preflight, type PreflightItem } from "./sending/preflight.ts";
import { coldWeek, mailboxDailyCap } from "./sending/ramp.ts";
import { bodyHash, cancelPendingTouches, recordDelivery, runSend } from "./sending/run.ts";
import { GmailApiTransport, OutboxTransport, type Transport } from "./sending/transports.ts";
import { importCsv } from "./sources/csvImport.ts";
import { importDbpr } from "./sources/dbpr.ts";
import { assignMetro, buildProspects } from "./sources/merge.ts";
import { entityInMetro, importSunbiz } from "./sources/sunbiz.ts";
import { openStores, type Stores } from "./store/index.ts";
import { nextId } from "./store/csvTable.ts";
import { addDays, isoStamp, localDate, localTime } from "./util/dates.ts";

/** The package folder: templates, reference data, samples and the example config live here. */
export const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
export const TEMPLATES_DIR = path.join(PACKAGE_ROOT, "templates/sequence");
export const MULTIPLES_FILE = path.join(PACKAGE_ROOT, "reference/multiples.json");
export const EXAMPLE_CONFIG = path.join(PACKAGE_ROOT, "config/engine.config.example.json");

/** Everything a command needs from outside: where it runs, the environment, the clock, a logger, and optional stubs for the network and the mailbox. */
export interface CliDeps {
  /** The folder the engine runs from; engineEnv resolves config and data paths against it, and file arguments are relative to it. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  today: string;
  now: Date;
  log: (line: string) => void;
  fetchImpl?: typeof fetch;
  resolveTxt?: (name: string) => Promise<string[][]>;
  resolveMx?: (domain: string) => Promise<string[]>;
  /** Replaces the configured transport (tests and the demo use MemoryTransport). */
  transport?: Transport;
  /** Replaces the reply classifier (the demo's offline stand-in for Claude). */
  classify?: typeof classifyReply;
}

/** A command signature: arguments after the command name, injected deps, exit code. */
export type Command = (args: string[], deps: CliDeps) => Promise<number>;

/** A mistake in how a command was called; main() prints it with a pointer to help. */
export class UsageError extends Error {}

// ---------------------------------------------------------------- argument helpers

/** The value after `name`, or undefined when the flag is absent. A flag with no value is a usage error. */
export function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) throw new UsageError(`${name} needs a value`);
  return v;
}

/** True when a bare flag (no value) is present. */
export function has(args: string[], name: string): boolean {
  return args.includes(name);
}

/** The arguments that are not flags, skipping the value after each flag named in `valued`. */
export function positionals(args: string[], valued: readonly string[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (valued.includes(a)) i++;
    else if (!a.startsWith("--")) out.push(a);
  }
  return out;
}

function isoDateArg(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new UsageError(`${name} must be a date as YYYY-MM-DD, not "${value}"`);
  return value;
}

/** --date when given (validated), else today. */
function dateFlag(args: string[], deps: CliDeps): string {
  const d = flag(args, "--date");
  return d === undefined ? deps.today : isoDateArg(d, "--date");
}

// ---------------------------------------------------------------- shared context

function envOf(deps: CliDeps): EngineEnv {
  return engineEnv(deps.cwd, deps.env);
}

function storesOf(deps: CliDeps): Stores {
  return openStores(envOf(deps).dataDir);
}

function configOf(deps: CliDeps): EngineConfig {
  return loadConfig(envOf(deps).configFile);
}

/** A path for messages: relative to where the engine runs when inside it, else absolute. */
function shown(deps: CliDeps, file: string): string {
  const rel = path.relative(deps.cwd, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

/** The transport for this run: the injected one, else the configured outbox or Gmail API. */
function transportFor(deps: CliDeps, config: EngineConfig, stores: Stores, today: string): Transport {
  if (deps.transport) return deps.transport;
  if (config.sending.transport === "gmail_api") {
    return new GmailApiTransport({ tokensFile: envOf(deps).gmailTokensFile, now: deps.now, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
  }
  return new OutboxTransport(stores.dir.outbox, today);
}

/** Warn about rows a table could not read: they are kept on disk, never silently dropped. */
function warnInvalid(deps: CliDeps, stores: Stores): void {
  for (const [name, table] of [["prospects.csv", stores.prospects], ["suppression.csv", stores.suppression], ["leads.csv", stores.leads], ["touches.csv", stores.touches]] as const) {
    const bad = table.load().invalid;
    if (bad.length) deps.log(`Warning: ${name} has ${bad.length} unreadable row(s); first at line ${bad[0]!.line}: ${bad[0]!.error}`);
  }
}

function countBy<T>(items: readonly T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

function counts(record: Record<string, number>): string {
  const parts = Object.entries(record).filter(([, n]) => n > 0).map(([k, n]) => `${k || "(blank)"} ${n}`);
  return parts.length ? parts.join(", ") : "none";
}

// ---------------------------------------------------------------- setup

/** Create the data folders and config/engine.config.json from the example when they are missing. Never overwrites. */
export const cmdInit: Command = async (_args, deps) => {
  const env = envOf(deps);
  const stores = openStores(env.dataDir);
  for (const dir of [env.dataDir, ...Object.values(stores.dir), path.join(stores.dir.inbox, "processed")]) fs.mkdirSync(dir, { recursive: true });
  deps.log(`Data folder: ${shown(deps, env.dataDir)}`);
  if (fs.existsSync(env.configFile)) {
    deps.log(`Config already exists, left as it is: ${shown(deps, env.configFile)}`);
  } else {
    fs.mkdirSync(path.dirname(env.configFile), { recursive: true });
    fs.copyFileSync(EXAMPLE_CONFIG, env.configFile);
    deps.log(`Created ${shown(deps, env.configFile)} from the example.`);
  }
  deps.log("");
  deps.log("Before anything can be sent, fill in config/engine.config.json:");
  deps.log("  firm.postal_address    a valid postal address (CAN-SPAM requires it in every email)");
  deps.log("  licensed_states        the states counsel has signed off for soliciting sellers");
  deps.log("  licensing_signoff      who signed off and when");
  deps.log("  mailboxes              real AMB senders at a separate sending domain");
  deps.log("Copy .env.example to .env for API keys, then run: npm run engine -- preflight");
  return 0;
};

/** Every preflight check, one line each; exit 1 when any fails. */
export const cmdPreflight: Command = async (_args, deps) => {
  const config = configOf(deps);
  const items = await preflight(config, { today: deps.today, templatesDir: TEMPLATES_DIR, ...(deps.resolveTxt ? { resolveTxt: deps.resolveTxt } : {}) });
  for (const i of items) deps.log(`${i.ok ? "ok  " : "FAIL"}  ${i.check}: ${i.detail}`);
  const failed = items.filter((i) => !i.ok);
  deps.log("");
  deps.log(failed.length ? `${failed.length} of ${items.length} checks failed.` : `All ${items.length} checks passed.`);
  return failed.length ? 1 : 0;
};

/** The preflight checks whose failure stops `send`: the legal facts and sender identity in config. */
export const SEND_BLOCKING_CHECKS: readonly string[] = ["postal address", "licensed states", "mailboxes", "sender names", "separate sending domain", "unsubscribe mailbox"];

/** The failing config and licensing items. DNS is not looked up here (the stub resolver keeps send offline); `preflight` checks DNS. */
export async function sendBlockers(config: EngineConfig, today: string): Promise<PreflightItem[]> {
  const items = await preflight(config, { today, templatesDir: TEMPLATES_DIR, resolveTxt: async () => [] });
  return items.filter((i) => !i.ok && SEND_BLOCKING_CHECKS.includes(i.check));
}

// ---------------------------------------------------------------- data in

/** Import one source file into data/imports/. */
export const cmdImport: Command = async (args, deps) => {
  const [kind, file] = positionals(args, ["--snapshot"]);
  if (!kind || !file) throw new UsageError("Usage: import sunbiz|dbpr|csv:<preset> <file> [--snapshot YYYY-MM-DD] [--metro-only]");
  const snapshotDate = isoDateArg(flag(args, "--snapshot") ?? deps.today, "--snapshot");
  const abs = path.resolve(deps.cwd, file);
  if (!fs.existsSync(abs)) throw new UsageError(`File not found: ${file}`);
  const metroOnly = has(args, "--metro-only");
  const stores = storesOf(deps);
  // Only --metro-only needs the config (the metro's counties and zips); a plain import works before init.
  const config = metroOnly ? configOf(deps) : undefined;

  let result;
  if (kind === "sunbiz") {
    result = importSunbiz(abs, stores, { snapshotDate, ...(config ? { filter: entityInMetro(config) } : {}) });
  } else if (kind === "dbpr") {
    result = importDbpr(abs, stores, { snapshotDate, ...(config ? { filter: (l) => assignMetro(l.county, l.zip, l.state, config) !== "" } : {}) });
  } else if (kind.startsWith("csv:")) {
    // The CSV importer has no filter; build skips businesses outside every metro with a reason anyway.
    if (metroOnly) deps.log("Note: --metro-only applies to sunbiz and dbpr files; build leaves out businesses outside every metro.");
    result = importCsv(kind.slice(4), abs, stores, { snapshotDate });
  } else {
    throw new UsageError(`Unknown import kind "${kind}": use sunbiz, dbpr or csv:<preset>`);
  }
  deps.log(`${result.kind} ${shown(deps, abs)}: read ${result.read}, imported ${result.imported}, skipped ${result.skipped}, invalid ${result.invalid.length} (snapshot ${snapshotDate})`);
  for (const bad of result.invalid.slice(0, 10)) deps.log(`  line ${bad.line}: ${bad.error}`);
  if (result.invalid.length > 10) deps.log(`  ... and ${result.invalid.length - 10} more`);
  return 0;
};

/** Merge the imports into prospects.csv. */
export const cmdBuild: Command = async (_args, deps) => {
  const config = configOf(deps);
  const r = buildProspects(storesOf(deps), config, { now: deps.now });
  deps.log(`Prospects: ${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged, ${r.skipped.length} skipped.`);
  for (const s of r.skipped.slice(0, 20)) deps.log(`  skipped ${s.name}: ${s.reason}`);
  if (r.skipped.length > 20) deps.log(`  ... and ${r.skipped.length - 20} more`);
  return 0;
};

/** Find and verify each open prospect's email. */
export const cmdEnrich: Command = async (args, deps) => {
  const config = configOf(deps);
  const env = envOf(deps);
  const verify = !has(args, "--no-verify");
  if (verify && !env.verifierApiKey) {
    deps.log('EMAIL_VERIFIER_API_KEY is blank: addresses end "unknown", which is not sendable. A person can check one with: verify <prospectId> valid --by "<name>"');
  }
  const r = await enrichContacts(storesOf(deps), config, {
    now: deps.now,
    discover: has(args, "--discover"),
    verify,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.resolveMx ? { resolveMx: deps.resolveMx } : {}),
    ...(env.verifierApiKey ? { verifierApiKey: env.verifierApiKey } : {}),
  });
  deps.log(`Emails: ${r.found} found, ${r.verified} verified. By status: ${counts(r.byStatus)}`);
  return 0;
};

/** Record a person's own check of a prospect's address. */
export const cmdVerify: Command = async (args, deps) => {
  const [prospectId, status] = positionals(args, ["--by"]);
  const by = flag(args, "--by");
  if (!prospectId || !status || !by) throw new UsageError("Usage: verify <prospectId> <valid|invalid> --by <name>");
  if (!(MANUAL_VERIFICATION_STATUSES as readonly string[]).includes(status)) throw new UsageError(`Status must be valid or invalid, not "${status}"`);
  const p = setManualVerification(storesOf(deps), prospectId, status as (typeof MANUAL_VERIFICATION_STATUSES)[number], by, deps.now);
  deps.log(`${p.prospect_id} ${p.email}: ${p.email_verification} (verified manually by ${by.trim()}). Run score to move it out of hold.`);
  return 0;
};

/** Score and tier every open prospect, with Places details when asked. */
export const cmdScore: Command = async (args, deps) => {
  const config = configOf(deps);
  const env = envOf(deps);
  const stores = storesOf(deps);
  let places: PlacesClient | undefined;
  if (has(args, "--places")) {
    if (!env.placesApiKey) throw new UsageError("--places needs GOOGLE_PLACES_API_KEY in .env; without it, run score with no flag.");
    places = new PlacesClient({ apiKey: env.placesApiKey, cacheDir: stores.dir.cache, now: deps.now, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
  } else if (env.placesApiKey) {
    deps.log("Note: GOOGLE_PLACES_API_KEY is set; add --places to use business status and review counts.");
  }
  const r = await scoreAll(stores, config, { today: deps.today, now: deps.now, ...(places ? { places } : {}) });
  deps.log(`Scored ${r.scored} (tier ${counts(r.byTier)}), excluded ${r.excluded}, on hold ${r.held}${places ? `, Places matched ${r.placesMatched}` : ""}.`);
  for (const e of r.errors) deps.log(`  ${e.prospectId || "warning"}: ${e.error}`);
  return 0;
};

// ---------------------------------------------------------------- sending

function printPlan(deps: CliDeps, plan: DayPlan, prospects: Map<string, ProspectRow>): void {
  if (!plan.sendDay) {
    deps.log(`${plan.date} is not a send day${plan.reason ? `: ${plan.reason}` : ""}.`);
    return;
  }
  deps.log(`Plan for ${plan.date}: ${plan.items.length} email(s).`);
  for (const i of plan.items) {
    const p = prospects.get(i.prospectId);
    deps.log(`  step ${i.step}  ${i.prospectId}  ${p?.business_name ?? "?"}  to ${p?.email ?? "?"}  from ${i.mailbox}`);
  }
  const caps = Object.entries(plan.caps);
  if (caps.length) deps.log(`Caps: ${caps.map(([k, c]) => `${k} ${c.used}/${c.cap}`).join("; ")}`);
  for (const [mb, reasons] of Object.entries(plan.paused)) deps.log(`Paused ${mb}: ${reasons.join("; ")}`);
  if (plan.skipped.length) {
    deps.log(`Skipped ${plan.skipped.length}:`);
    for (const s of plan.skipped.slice(0, 20)) deps.log(`  ${s.prospectId}: ${s.reason}`);
    if (plan.skipped.length > 20) deps.log(`  ... and ${plan.skipped.length - 20} more`);
  }
}

/** Show the day's batch without writing anything. */
export const cmdPlan: Command = async (args, deps) => {
  const config = configOf(deps);
  const stores = storesOf(deps);
  const plan = planDay(stores, config, { today: dateFlag(args, deps) });
  printPlan(deps, plan, new Map(stores.prospects.rows().map((p) => [p.prospect_id, p])));
  return 0;
};

/** Render, gate and deliver the day's outreach. Refuses while a config or licensing preflight item fails. */
export const cmdSend: Command = async (args, deps) => {
  const config = configOf(deps);
  const today = dateFlag(args, deps);
  const dryRun = has(args, "--dry-run");
  // The gate would block every message anyway; refusing up front says why once, instead of once per prospect.
  const blockers = await sendBlockers(config, today);
  if (blockers.length) {
    deps.log("Refusing to send: preflight has failing config or licensing items.");
    for (const b of blockers) deps.log(`  FAIL  ${b.check}: ${b.detail}`);
    deps.log("Fix config/engine.config.json, then run: npm run engine -- preflight");
    return 1;
  }
  // A real send today waits for the send window (daily passes --date today, so it is held too); a dry
  // run, or a --date other than today (a catch-up or test run), is not.
  const forToday = (flag(args, "--date") ?? deps.today) === deps.today;
  const windowBlock = !dryRun && forToday ? sendWindowBlock(config, deps.now) : undefined;
  if (windowBlock) {
    deps.log(`Not sending now: ${windowBlock}. Run again inside the window.`);
    return 1;
  }
  const stores = storesOf(deps);
  warnInvalid(deps, stores);
  const transport = transportFor(deps, config, stores, today);
  const r = await runSend(stores, config, { today, now: deps.now, transport, templatesDir: TEMPLATES_DIR, dryRun });
  const prospects = new Map(stores.prospects.rows().map((p) => [p.prospect_id, p]));
  if (!r.plan.sendDay) {
    printPlan(deps, r.plan, prospects);
    return 0;
  }
  const verb = dryRun ? "Would deliver" : config.sending.mode === "draft" ? "Drafted" : "Sent";
  deps.log(`${verb} ${r.delivered.length} email(s) on ${r.date} (mode ${r.mode}, transport ${r.transport}${dryRun ? ", dry run: nothing written" : ""}).`);
  for (const d of r.delivered) deps.log(`  ${d.touchId || "(dry run)"}  step ${d.step}  ${d.prospectId}  ${prospects.get(d.prospectId)?.business_name ?? ""}  from ${d.mailbox}`);
  for (const b of r.blocked) deps.log(`  BLOCKED ${b.prospectId}: ${b.reasons.join("; ")}`);
  for (const f of r.failed) deps.log(`  FAILED ${f.prospectId}: ${f.error}`);
  for (const [mb, reasons] of Object.entries(r.plan.paused)) deps.log(`  paused ${mb}: ${reasons.join("; ")}`);
  if (r.plan.skipped.length) deps.log(`  ${r.plan.skipped.length} skipped (npm run engine -- plan shows why)`);
  if (r.completed.length) deps.log(`  ${r.completed.length} prospect(s) completed the sequence with no reply`);
  if (transport instanceof OutboxTransport && r.delivered.length && !dryRun) {
    deps.log(`Outbox: ${shown(deps, path.join(transport.dir, "README.md"))}. The Claude Gmail routine works through it and runs record for each item.`);
  }
  return r.failed.length || r.blocked.length ? 1 : 0;
};

const RECORD_STATUSES = ["drafted", "sent", "failed"] as const;

/** Record what the outbox routine did with a touch. */
export const cmdRecord: Command = async (args, deps) => {
  const valued = ["--draft-id", "--message-id", "--thread-id", "--error"];
  const [touchId, status] = positionals(args, valued);
  if (!touchId || !status) throw new UsageError("Usage: record <touchId> <drafted|sent|failed> [--draft-id <id>] [--message-id <id>] [--thread-id <id>] [--error <text>]");
  if (!(RECORD_STATUSES as readonly string[]).includes(status)) throw new UsageError(`Status must be drafted, sent or failed, not "${status}"`);
  const draftId = flag(args, "--draft-id");
  const messageId = flag(args, "--message-id");
  const threadId = flag(args, "--thread-id");
  const error = flag(args, "--error");
  recordDelivery(
    storesOf(deps),
    touchId,
    { status: status as (typeof RECORD_STATUSES)[number], ...(draftId ? { draftId } : {}), ...(messageId ? { messageId } : {}), ...(threadId ? { threadId } : {}), ...(error ? { error } : {}) },
    deps.now,
    configOf(deps),
  );
  deps.log(`Recorded ${touchId} as ${status}.`);
  return 0;
};

// ---------------------------------------------------------------- replies

/** The default --since for sync: two days before the newest recorded reply (replies dedupe by id), else 14 days back. */
function defaultSince(stores: Stores, now: Date): string {
  const latest = stores.replies.rows().map((r) => r.received_at).filter(Boolean).sort().at(-1);
  if (latest && Number.isFinite(Date.parse(latest))) return isoStamp(new Date(Date.parse(latest) - 2 * 86_400_000));
  return isoStamp(new Date(now.getTime() - 14 * 86_400_000));
}

/** Gmail API transport: fetch new mail for every mailbox into data/inbox/. Outbox transport: the Claude routine writes the folder. */
export const cmdSync: Command = async (args, deps) => {
  const config = configOf(deps);
  const stores = storesOf(deps);
  const inboxDir = stores.dir.inbox;
  if (config.sending.transport !== "gmail_api") {
    const waiting = fs.existsSync(inboxDir) ? fs.readdirSync(inboxDir).filter((f) => f.toLowerCase().endsWith(".json")).length : 0;
    deps.log(`Transport is outbox: the Claude Gmail connector routine writes each received message to ${shown(deps, inboxDir)}/*.json, so there is nothing to fetch here. ${waiting} file(s) waiting; run qualify.`);
    return 0;
  }
  const since = flag(args, "--since") ?? defaultSince(stores, deps.now);
  const inbox = new GmailApiInbox({ tokensFile: envOf(deps).gmailTokensFile, now: deps.now, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) });
  const known = new Set(stores.replies.rows().map((r) => r.reply_id));
  fs.mkdirSync(inboxDir, { recursive: true });
  let code = 0;
  for (const m of config.mailboxes) {
    try {
      const messages = await inbox.fetchSince(m.email, since);
      let written = 0;
      for (const msg of messages) {
        if (known.has(msg.id)) continue;
        const name = `gmail-${msg.id.replace(/[^A-Za-z0-9_-]/g, "_")}.json`;
        if (fs.existsSync(path.join(inboxDir, name)) || fs.existsSync(path.join(inboxDir, "processed", name))) continue;
        fs.writeFileSync(path.join(inboxDir, name), `${JSON.stringify(msg, null, 2)}\n`);
        written++;
      }
      deps.log(`${m.email}: ${messages.length} message(s) since ${since}, ${written} new written to ${shown(deps, inboxDir)}`);
    } catch (err) {
      code = 1;
      deps.log(`${m.email}: sync failed: ${(err as Error).message}`);
    }
  }
  return code;
};

/** Move each inbox file whose messages are all recorded (classified) into processed/. A file with a failed or unreadable message stays for the next run. */
function moveProcessed(stores: Stores, config: EngineConfig): string[] {
  const dir = stores.dir.inbox;
  const done = new Set(stores.replies.rows().filter((r) => r.class !== "").map((r) => r.reply_id));
  // Messages from AMB's own mailboxes are skipped, never recorded, so they count as done.
  const own = new Set(config.mailboxes.map((m) => normalizeEmail(m.email)));
  const moved: string[] = [];
  const processed = path.join(dir, "processed");
  for (const name of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort()) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const items = (Array.isArray(raw) ? raw : [raw]).map((i) => InboundFileSchema.safeParse(i));
    const allDone = items.length > 0 && items.every((r) => r.success && (done.has(r.data.id) || own.has(addressOf(r.data.from))));
    if (!allDone) continue;
    fs.mkdirSync(processed, { recursive: true });
    let target = path.join(processed, name);
    for (let n = 2; fs.existsSync(target); n++) target = path.join(processed, name.replace(/\.json$/i, `-${n}.json`));
    fs.renameSync(path.join(dir, name), target);
    moved.push(name);
  }
  return moved;
}

/** Process data/inbox/*.json: suppress, update leads, draft answers; then move processed files. */
export const cmdQualify: Command = async (_args, deps) => {
  const config = configOf(deps);
  const stores = storesOf(deps);
  const { messages, invalid } = readInboxFolder(stores.dir.inbox);
  for (const bad of invalid) deps.log(`Unreadable inbox file ${bad.file}: ${bad.error} (left in place)`);
  if (!messages.length) {
    deps.log(`No messages in ${shown(deps, stores.dir.inbox)}.`);
    return invalid.length ? 1 : 0;
  }
  const transport = transportFor(deps, config, stores, deps.today);
  const r = await processInbox(stores, config, { now: deps.now, today: deps.today, messages, transport, ...(deps.classify ? { classify: deps.classify } : {}) });
  deps.log(`Received ${r.received}: ${counts(r.byClass)}.`);
  deps.log(`Suppressed ${r.suppressed}, drafted ${r.drafted} answer(s), duplicates ${r.duplicates}, unmatched ${r.unmatched}, own messages ${r.ownMessages}, authentication bounces ${r.policyBounces}.`);
  if (r.policyBounces) deps.log("An authentication bounce paused its mailbox: check SPF, DKIM and DMARC, run preflight, then clear-pause.");
  for (const e of r.errors) deps.log(`  ${e.replyId}: ${e.error}`);
  for (const d of r.draftsToDelete) deps.log(`  Delete the Gmail draft ${d.draftId || `for ${d.touchId}`} in ${d.mailbox}: the owner opted out, so it must not be sent.`);
  const moved = moveProcessed(stores, config);
  deps.log(`Moved ${moved.length} file(s) to ${shown(deps, path.join(stores.dir.inbox, "processed"))}.`);
  if (transport instanceof OutboxTransport && r.drafted) deps.log(`Reply drafts: ${shown(deps, transport.dir)} (a person reviews and sends each one).`);
  return r.errors.length || invalid.length ? 1 : 0;
};

/** Write the exit-readiness check for a lead and draft it as a reply in the owner's thread. */
export const cmdCheck: Command = async (args, deps) => {
  const [prospectId] = positionals(args);
  if (!prospectId) throw new UsageError("Usage: check <prospectId>");
  const config = configOf(deps);
  const stores = storesOf(deps);
  const p = stores.prospects.rows().find((x) => x.prospect_id === prospectId);
  if (!p) throw new UsageError(`Prospect ${prospectId} not found in prospects.csv`);
  const lead = stores.leads.rows().find((l) => l.prospect_id === prospectId);
  if (!lead) throw new UsageError(`${prospectId} has no lead yet: the check is built from what the owner said by email`);
  // Opt-outs come first (DESIGN.md principle 3): nothing is built or drafted for a suppressed owner.
  const suppression = new Suppression(stores.suppression);
  const blocked = suppression.check(lead.email || p.email, p.prospect_id) ?? suppression.check(p.email, p.prospect_id);
  if (blocked || p.status === "dnc") {
    deps.log(`Refusing: ${prospectId} is ${blocked ? `suppressed (${blocked.reason}, ${blocked.source})` : "dnc"}.`);
    return 1;
  }

  const check = buildReadinessCheck(lead, p, config, { today: deps.today, multiples: loadMultiples(MULTIPLES_FILE) });
  const file = writeReadinessCheck(stores, check, p);
  deps.log(`Readiness check for ${p.business_name}: score ${check.score}, ${check.items.length} items${check.range ? "" : `, no range (${check.rangeWithheld ?? "withheld"})`}.`);
  deps.log(`  ${shown(deps, file)}`);

  const mailbox = findMailbox(config, p.mailbox) ?? config.mailboxes[0];
  if (!mailbox) throw new UsageError("config.mailboxes is empty: no mailbox to draft the check from");
  // Answer in the owner's latest thread, under the subject they last wrote on.
  const latest = stores.replies
    .rows()
    .filter((r) => r.prospect_id === p.prospect_id && r.class !== "bounce" && r.class !== "auto_reply")
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
    .at(-1);
  const threadId = latest?.thread_id || p.thread_id;
  const touches = stores.touches.rows();
  const touchId = nextId("T", 6, touches.map((t) => t.touch_id));
  const out: OutgoingMessage = {
    touchId,
    prospectId: p.prospect_id,
    kind: "reply",
    mailbox: mailbox.email,
    fromName: `${mailbox.sender_name}, ${config.firm.name}`,
    to: lead.email || p.email,
    subject: replySubject(latest?.subject, `Exit-readiness check for ${shortBusinessName(p.business_name)}`),
    body: `${check.emailBody}\n\n${aiDisclosure(config, mailbox)}\n\n${buildFooter(config, mailbox)}`,
    headers: {},
    ...(threadId ? { threadId } : {}),
  };
  try {
    assertSendable(out, { config, suppression, prospect: p });
  } catch (err) {
    if (!(err instanceof ComplianceError)) throw err;
    deps.log(`The check is written, but its email draft is blocked: ${err.reasons.join("; ")}`);
    return 1;
  }
  const stamp = isoStamp(deps.now);
  const touch: TouchRow = {
    touch_id: touchId,
    prospect_id: p.prospect_id,
    kind: "reply",
    step: undefined,
    mailbox: mailbox.email,
    to_email: out.to,
    subject: out.subject,
    body_sha256: bodyHash(out.body),
    planned_for: deps.today,
    status: "planned",
    mode: "draft",
    message_id: "",
    thread_id: threadId,
    draft_id: "",
    error: "",
    created_at: stamp,
    updated_at: stamp,
  };
  stores.touches.upsert([touch]);
  const transport = transportFor(deps, config, stores, deps.today);
  try {
    // Like every reply, the check is a draft for a person to review (qualify.auto_send_replies is the literal false).
    const res = await transport.deliver(out, "draft");
    const status = transport instanceof OutboxTransport ? "planned" : "drafted";
    stores.touches.upsert([{ ...touch, status, message_id: res.messageId ?? "", thread_id: res.threadId ?? threadId, draft_id: res.draftId ?? "", updated_at: stamp }]);
  } catch (err) {
    stores.touches.upsert([{ ...touch, status: "failed", error: `draft delivery failed: ${(err as Error).message}`.slice(0, 500), updated_at: stamp }]);
    throw err;
  }
  // Re-read the lead: writeReadinessCheck has just stored its readiness score.
  const current: LeadRow = stores.leads.rows().find((l) => l.prospect_id === p.prospect_id) ?? lead;
  stores.leads.upsert([{ ...current, next_action: "Review and send the readiness check draft", updated_at: stamp }]);
  deps.log(`Drafted the check as reply ${touchId} to ${out.to} from ${mailbox.email} (${transport.name}).`);
  return 0;
};

/** Write handoff summaries for warm leads. */
export const cmdHandoff: Command = async (_args, deps) => {
  const config = configOf(deps);
  const results = handOffWarmLeads(storesOf(deps), config, { now: deps.now, today: deps.today, multiples: loadMultiples(MULTIPLES_FILE) });
  if (!results.length) deps.log("No warm leads waiting for handoff.");
  for (const r of results) deps.log(`Handed off ${r.prospectId}: ${shown(deps, r.file)}`);
  return 0;
};

/** The weekly report for the 7 days ending --date (default today). */
export const cmdReport: Command = async (args, deps) => {
  const config = configOf(deps);
  const { markdown, file } = weeklyReport(storesOf(deps), config, { today: dateFlag(args, deps) });
  deps.log(markdown.trimEnd());
  deps.log("");
  deps.log(`Written to ${shown(deps, file)}`);
  return 0;
};

/** Write the dashboard's data files (data/dashboard/*.json) from the tables. */
export const cmdDashboard: Command = async (args, deps) => {
  const config = configOf(deps);
  const stores = storesOf(deps);
  const files = writeDashboardData(stores, dashboardData(stores, config, { today: dateFlag(args, deps) }));
  deps.log(`Wrote ${files.length} dashboard files to ${shown(deps, path.dirname(files[0]!))}: ${files.map((f) => path.basename(f)).join(", ")}.`);
  deps.log("No owner names, emails, phones or age estimates are in them. Ask Claude to refresh the dashboard from these files.");
  return 0;
};

/** Stages an advisor sets by hand, with the next action each implies. */
export const ADVISOR_STAGES: Readonly<Record<string, string>> = {
  meeting: "Advisor meeting booked",
  listed: "Engagement or listing signed",
  lost: "None: conversation closed",
  nurture: "Check back at the nurture date",
};

/** Days until a nurture lead comes up again when --until is not given. */
const DEFAULT_NURTURE_DAYS = 180;

/** An advisor's update to a lead's stage. */
export const cmdStage: Command = async (args, deps) => {
  const [prospectId, stage] = positionals(args, ["--until"]);
  if (!prospectId || !stage) throw new UsageError("Usage: stage <prospectId> <meeting|listed|lost|nurture> [--until YYYY-MM-DD]");
  const action = ADVISOR_STAGES[stage];
  if (!action) throw new UsageError(`Stage must be one of ${Object.keys(ADVISOR_STAGES).join(", ")}, not "${stage}"`);
  const stores = storesOf(deps);
  const lead = stores.leads.rows().find((l) => l.prospect_id === prospectId);
  if (!lead) throw new UsageError(`${prospectId} has no lead in leads.csv`);
  const until = flag(args, "--until");
  const nurture = stage === "nurture" ? isoDateArg(until ?? addDays(deps.today, DEFAULT_NURTURE_DAYS), "--until") : lead.nurture_date;
  stores.leads.upsert([{ ...lead, stage: stage as LeadStage, next_action: action, nurture_date: nurture, updated_at: isoStamp(deps.now) }]);
  deps.log(`${prospectId} ${lead.business_name}: ${lead.stage} -> ${stage}${stage === "nurture" ? ` (check back ${nurture})` : ""}.`);
  return 0;
};

/** Add an email or a domain to the permanent suppression list, and mark matching prospects dnc. */
export const cmdSuppress: Command = async (args, deps) => {
  const [value] = positionals(args, ["--reason"]);
  if (!value) throw new UsageError("Usage: suppress <email|domain> [--reason <reason>]");
  const reason = flag(args, "--reason") ?? "do_not_contact";
  if (!(SUPPRESSION_REASONS as readonly string[]).includes(reason)) throw new UsageError(`Reason must be one of ${SUPPRESSION_REASONS.join(", ")}, not "${reason}"`);
  const stores = storesOf(deps);
  const valueType = value.includes("@") ? "email" : "domain";
  const suppression = new Suppression(stores.suppression);
  suppression.add(value, valueType, reason as SuppressionRow["reason"], "manual (cli)", deps.now);
  // lookup, not check: an unreadable row elsewhere in the file must not mark every prospect dnc.
  const stamp = isoStamp(deps.now);
  const hits = stores.prospects.rows().filter((p) => p.status !== "dnc" && p.email && suppression.lookup(p.email));
  stores.prospects.upsert(hits.map((p) => ({ ...p, status: "dnc" as const, next_touch_date: "", updated_at: stamp })));
  deps.log(`Suppressed ${valueType} ${value} (${reason}). ${hits.length} prospect(s) marked dnc${hits.length ? `: ${hits.map((p) => p.prospect_id).join(", ")}` : ""}.`);
  // Queued messages for those prospects must not go out later (REVIEW_R1.md item 13).
  for (const p of hits) {
    const { cancelled, draftsToDelete } = cancelPendingTouches(stores, p.prospect_id, `suppressed by hand (${reason})`, deps.now);
    if (cancelled.length) deps.log(`  ${p.prospect_id}: cancelled ${cancelled.map((t) => t.touch_id).join(", ")}.`);
    for (const t of draftsToDelete) deps.log(`  Check Drafts in ${t.mailbox}: if the draft for ${t.touch_id}${t.draft_id ? ` (${t.draft_id})` : ""} is still there, delete it; it must not be sent.`);
  }
  return 0;
};

/** A person clears a mailbox's pause after checking why it tripped. */
export const cmdClearPause: Command = async (args, deps) => {
  const [mailbox] = positionals(args, ["--by"]);
  const by = flag(args, "--by");
  if (!mailbox || !by) throw new UsageError("Usage: clear-pause <mailbox> --by <name>");
  const config = configOf(deps);
  const row = clearPause(storesOf(deps), mailbox, by, deps.now);
  deps.log(`${row.mailbox}: ${row.pause_reason}.`);
  if (findMailbox(config, mailbox)?.paused) deps.log(`Note: ${row.mailbox} is also paused in config (mailboxes[].paused); set it to false there to resume.`);
  if (!findMailbox(config, mailbox)) deps.log(`Note: ${row.mailbox} is not in config.mailboxes.`);
  return 0;
};

/** Partner lead export; refused unless lead_sales is enabled with a legal review reference. */
export const cmdExport: Command = async (args, deps) => {
  const [partner, ...prospectIds] = positionals(args, ["--out"]);
  const out = flag(args, "--out");
  if (!partner || !prospectIds.length || !out) throw new UsageError("Usage: export <partner> <prospectId...> --out <file>");
  const config = configOf(deps);
  try {
    const r = exportLeads(storesOf(deps), config, { partner, now: deps.now, prospectIds, outFile: path.resolve(deps.cwd, out) });
    deps.log(`Exported ${r.exported} lead(s) to ${out} for ${partner}.`);
    for (const s of r.skipped) deps.log(`  skipped ${s.prospectId}: ${s.reason}`);
    return 0;
  } catch (err) {
    if (!(err instanceof ComplianceError)) throw err;
    deps.log("Export refused:");
    for (const r of err.reasons) deps.log(`  ${r}`);
    return 1;
  }
};

/** The scheduled routine: sync (Gmail API only), qualify, handoff, then send. */
export const cmdDaily: Command = async (args, deps) => {
  const today = dateFlag(args, deps);
  const day: CliDeps = { ...deps, today };
  const config = configOf(day);
  let code = 0;
  let repliesDone = true;
  const step = async (name: string, fn: () => Promise<number>) => {
    day.log(`== ${name}`);
    try {
      const c = await fn();
      if (c) code = 1;
      return c === 0;
    } catch (err) {
      code = 1;
      day.log(`${name} failed: ${(err as Error).message}`);
      return false;
    }
  };
  if (config.sending.transport === "gmail_api") repliesDone = (await step("sync", () => cmdSync([], day))) && repliesDone;
  repliesDone = (await step("qualify", () => cmdQualify([], day))) && repliesDone;
  await step("handoff", () => cmdHandoff([], day));
  if (!repliesDone) {
    // Opt-outs are honoured in the same run they arrive; sending before they are processed could email someone who just said stop.
    day.log("== send skipped: replies were not fully processed, so today's opt-outs may not be on the suppression list yet. Fix the error above and rerun daily.");
    return 1;
  }
  await step("send", () => cmdSend(["--date", today], day));
  return code;
};

/** Counts by status, tier and stage, mailbox health and today's caps. */
export const cmdStatus: Command = async (_args, deps) => {
  const config = configOf(deps);
  const stores = storesOf(deps);
  warnInvalid(deps, stores);
  const prospects = stores.prospects.rows();
  const leads = stores.leads.rows();
  const touches = stores.touches.rows();
  deps.log(`Prospects ${prospects.length}: ${counts(countBy(prospects, (p) => p.status))}`);
  deps.log(`Tiers (not excluded): ${counts(countBy(prospects.filter((p) => p.tier), (p) => p.tier))}`);
  deps.log(`Leads ${leads.length}: ${counts(countBy(leads, (l) => l.stage))}`);
  deps.log(`Suppression list: ${stores.suppression.rows().length} row(s)`);
  deps.log(`Touches: ${counts(countBy(touches, (t) => `${t.kind} ${t.status}`))}`);
  const reason = notSendDayReason(config, deps.today);
  deps.log(`Today ${deps.today}: ${reason ? `not a send day (${reason})` : "a send day"}`);
  for (const m of config.mailboxes) {
    const h = mailboxHealth(stores, config, m.email, deps.today);
    const used = touches.filter((t) => t.kind === "outreach" && normalizeEmail(t.mailbox) === normalizeEmail(m.email) && touchDay(t) === deps.today && t.status !== "cancelled").length;
    const week = coldWeek(m, config, deps.today);
    const state = h.pause || m.paused ? `PAUSED (${[...(m.paused ? ["paused in config"] : []), ...h.reasons].join("; ")})` : h.pauseNew ? `new sends paused (${h.reasons.join("; ")})` : "ok";
    deps.log(
      `  ${m.email}: ${week === 0 ? "warming up" : `cold week ${week}`}, cap today ${mailboxDailyCap(m, config, deps.today)}, used ${used}; ${h.sends} sends and ${h.hardBounces} hard bounces in the window (${(h.bounceRate * 100).toFixed(1)}%), ${h.complaints} complaints; ${state}`,
    );
  }
  return 0;
};

/** The whole loop offline on the samples, in a temp folder. */
export const cmdDemo: Command = async (_args, deps) => {
  // Loaded on demand: the demo drives these same commands, so a static import would be a cycle.
  const { runDemo } = await import("./demo.ts");
  await runDemo({ log: deps.log, today: deps.today, now: deps.now });
  return 0;
};

export const USAGE = `lead-engine: AMB Advisory seller lead engine (npm run engine -- <command>)

  init                                   create data/ and config/engine.config.json from the example
  preflight                              config, licensing sign-off, DNS, warm-up, templates (exit 1 on any failure)
  import sunbiz|dbpr|csv:<preset> <file> [--snapshot YYYY-MM-DD] [--metro-only]
  build                                  merge imports into prospects.csv
  enrich [--discover] [--no-verify]      find and verify emails
  verify <prospectId> <valid|invalid> --by <name>
                                         record a person's own check of an address
  score [--places]                       score and tier (--places needs GOOGLE_PLACES_API_KEY)
  plan [--date YYYY-MM-DD]               show the day's batch without writing
  send [--date YYYY-MM-DD] [--dry-run]   render, gate and deliver (drafts unless sending.mode is send)
  record <touchId> <drafted|sent|failed> [--draft-id ID] [--message-id ID] [--thread-id ID] [--error TEXT]
                                         outbox transport: what the Claude routine did
  sync [--since ISO]                     gmail_api: fetch new mail to data/inbox/
  qualify                                process data/inbox/*.json; processed files move to data/inbox/processed/
  check <prospectId>                     write the exit-readiness check (data/checks/) and draft it as a reply
  handoff                                write warm-seller summaries (data/handoffs/)
  report [--date YYYY-MM-DD]             weekly report (data/reports/)
  dashboard [--date YYYY-MM-DD]          dashboard data files (data/dashboard/): no owner names or contact details
  stage <prospectId> <meeting|listed|lost|nurture> [--until YYYY-MM-DD]
  suppress <email|domain> [--reason opt_out|bounce|complaint|do_not_contact|client|legal|wrong_person]
  clear-pause <mailbox> --by <name>
  export <partner> <prospectId...> --out <file>
                                         lead sales; refused unless lead_sales is enabled with a legal review
  daily [--date YYYY-MM-DD]              sync (gmail_api), qualify, handoff, send: the scheduled routine
  status                                 counts, mailbox health and today's caps
  demo                                   the whole loop offline on samples/tampa-bay in a temp folder`;

/** Print the command list. */
export const cmdHelp: Command = async (_args, deps) => {
  deps.log(USAGE);
  return 0;
};

/** Every command by name. */
export const COMMANDS: Readonly<Record<string, Command>> = {
  init: cmdInit,
  preflight: cmdPreflight,
  import: cmdImport,
  build: cmdBuild,
  enrich: cmdEnrich,
  verify: cmdVerify,
  score: cmdScore,
  plan: cmdPlan,
  send: cmdSend,
  record: cmdRecord,
  sync: cmdSync,
  qualify: cmdQualify,
  check: cmdCheck,
  handoff: cmdHandoff,
  report: cmdReport,
  dashboard: cmdDashboard,
  stage: cmdStage,
  suppress: cmdSuppress,
  "clear-pause": cmdClearPause,
  export: cmdExport,
  daily: cmdDaily,
  status: cmdStatus,
  demo: cmdDemo,
  help: cmdHelp,
};

/** Run one command line (without the program name) and return its exit code. */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const [command = "help", ...args] = argv;
  const fn = COMMANDS[command];
  if (!fn) {
    deps.log(`Unknown command "${command}".\n`);
    deps.log(USAGE);
    return 1;
  }
  return fn(args, deps);
}

/**
 * The engine's time zone: the first target metro's, else Eastern. "Today"
 * is the recipients' date, not the machine's: a UTC cloud container at 9pm
 * Eastern on Monday must not run Tuesday's batch (REVIEW_R1.md item 5).
 */
export function engineTimeZone(config: EngineConfig | undefined): string {
  return (config && Object.values(config.metros)[0]?.time_zone) || "America/New_York";
}

/** Why a real send (mode "send") must wait for the recipient-local send window, or undefined inside it. Drafts are not held: a person sends them. */
export function sendWindowBlock(config: EngineConfig, now: Date): string | undefined {
  if (config.sending.mode !== "send") return undefined;
  const tz = engineTimeZone(config);
  const at = localTime(now, tz);
  const { window_start: start, window_end: end } = config.sending;
  return at >= start && at < end ? undefined : `it is ${at} in ${tz}, outside the send window ${start} to ${end} (sending.window_start / window_end)`;
}

/** The only clock read: now, and today in the engine's time zone. */
async function main(): Promise<void> {
  const now = new Date();
  let config: EngineConfig | undefined;
  try {
    config = loadConfig(engineEnv(process.cwd()).configFile);
  } catch {
    config = undefined; // commands that need the config report the problem themselves
  }
  const today = localDate(now, engineTimeZone(config));
  process.exitCode = await runCli(process.argv.slice(2), { cwd: process.cwd(), env: process.env, today, now, log: (line) => console.log(line) });
}

/** True when this file is the program being run, not a module a test imported. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((err) => {
    if (err instanceof ComplianceError) console.error(`Blocked by compliance:\n  ${err.reasons.join("\n  ")}`);
    else console.error(err instanceof Error ? err.message : err);
    if (err instanceof UsageError) console.error("Run: npm run engine -- help");
    process.exit(1);
  });
}
