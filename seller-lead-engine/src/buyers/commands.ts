import fs from "node:fs";
import path from "node:path";
import type { EngineConfig, EngineEnv } from "../config.ts";
import type { InboundMessage } from "../domain/messages.ts";
import { GmailApiInbox, InboundFileSchema, readInboxFolder } from "../replies/inbox.ts";
import { OutboxTransport, type Transport } from "../sending/transports.ts";
import type { Stores } from "../store/index.ts";
import { addDays, isoStamp } from "../util/dates.ts";
import { upsertBuyers, warmMailbox, type IncomingBuyer } from "./core.ts";
import { downloadFormD, downloadSba7a, importAdvisers, importFormD, importSba7a, readAdvisers, upsertPartners } from "./filings.ts";
import { buyerFunnel, funnelLines, partnerKit, postingKit } from "./funnel.ts";
import { buyerMessagesInMbox, processBuyerInbox, syncSellerReplies, type BuyerInboxReport } from "./inbox.ts";
import { cancelStaleBuyerTouches, enrichBuyers, planBuyerInvites, runBuyerInvites, scoreBuyers } from "./invite.ts";
import { lintBuyerTemplates } from "./outreach.ts";
import { BUYER_KINDS, PARTNER_KINDS, type BuyerKind, type BuyerLeadRow, type PartnerRow } from "./schema.ts";
import { addBuyer, carryVerification, ensureRefs, importBuyerList, importRegistrations, strategicBuyers } from "./sources.ts";

// `npm run engine -- buyers <step>`: the buyer sourcing engine's commands.
// The CLI hands in what it owns (the clock, paths, the transport, its
// argument helpers) as `BuyerCliContext`, so this module never reads the
// clock or the environment itself and never imports the CLI back.

/** What the CLI gives the buyer commands. */
export interface BuyerCliContext {
  today: string;
  now: Date;
  cwd: string;
  log: (line: string) => void;
  env: EngineEnv;
  config: () => EngineConfig;
  stores: () => Stores;
  transport: (config: EngineConfig, stores: Stores, today: string) => Transport;
  fetchImpl?: typeof fetch;
  resolveMx?: (domain: string) => Promise<string[]>;
  flag: (args: string[], name: string) => string | undefined;
  has: (args: string[], name: string) => boolean;
  positionals: (args: string[], valued?: readonly string[]) => string[];
  shown: (file: string) => string;
  /** Preflight's config and licensing failures: a send refuses while any exist. */
  sendBlockers: (config: EngineConfig, today: string) => Promise<{ check: string; detail: string }[]>;
  sendWindowBlock: (config: EngineConfig, now: Date) => string | undefined;
  usage: (message: string) => Error;
}

/** The buyer commands' help text. */
export const BUYERS_USAGE = `  buyers <step>                          the buyer sourcing engine (docs/BUYERS.md):
    import list <file> --kind <kind> --source <name>   a buyer list CSV (past bidders, clients, a conference, a listing site's lead export)
    import mbox <file>                   a mailbox history (Google Takeout): past inquiries and buyer correspondents
    import form-d <folder...>            unzipped SEC Form D data sets: private equity and search funds
    import adv <file> [--partners]       an SEC adviser list CSV: fund advisers (or, with --partners, wealth managers as partners)
    import sba <file> [--since YYYY-MM-DD]   SBA 7(a) loan data: lenders as partners, acquirers as buyers
    import registrations <file>          AMBrain's registrations export: who registered, through which link
    download form-d [--quarters N] [--import]  |  download sba [--import]
    strategic                            larger businesses in AMB's industries from the seller records (add-on buyers)
    add --email <e> [--name] [--company] [--kind <kind>] [--source <name>] [--phone] [--state]
    review <leadId> <approve|exclude> [--reason TEXT]   a person's call on a mailbox correspondent
    sync [--since ISO] [--history]       read the buyer mailbox (gmail_api) or data/buyers/inbox/*.json; answers to cold invitations from replies.csv
    enrich [--discover] [--no-verify] [--max-seconds N] [--resume]
    score | plan [--date] | send [--date] [--dry-run]
    status                               the funnel by channel
    kit [--ref <deal ref>] [--headline TEXT] [--facts TEXT]   copy-ready posts, each with its own tracked link
    partners | partner add --kind <kind> --name <name> [--contact] [--email] [--phone] [--city] [--state]
    daily [--date]                       sync, strategic, enrich (two minutes), score, send`;

type Sub = (args: string[], ctx: BuyerCliContext) => Promise<number>;

const kindArg = (raw: string | undefined, ctx: BuyerCliContext): BuyerKind => {
  if (!raw) throw ctx.usage(`--kind is required: one of ${BUYER_KINDS.join(", ")}`);
  if (!(BUYER_KINDS as readonly string[]).includes(raw)) throw ctx.usage(`--kind must be one of ${BUYER_KINDS.join(", ")}, not "${raw}"`);
  return raw as BuyerKind;
};

const fileArg = (raw: string | undefined, ctx: BuyerCliContext, what: string): string => {
  if (!raw) throw ctx.usage(`Give the ${what}.`);
  const file = path.resolve(ctx.cwd, raw);
  if (!fs.existsSync(file)) throw ctx.usage(`${raw} does not exist`);
  return file;
};

const added = (r: { added: number; updated: number; unchanged: number }) => `${r.added} new buyer(s), ${r.updated} updated, ${r.unchanged} unchanged`;

function logInbox(ctx: BuyerCliContext, label: string, r: BuyerInboxReport): void {
  const classes = Object.entries(r.byClass).map(([k, n]) => `${k} ${n}`).join(", ") || "nothing new";
  ctx.log(`${label}: ${r.read} message(s), ${r.duplicates} already read; ${classes}. ${r.added} new buyer(s), ${r.suppressed} suppressed.`);
  for (const i of r.inquiries.slice(0, 20)) ctx.log(`  inquiry ${i.leadId} via ${i.platform}: ${i.email}`);
  if (r.inquiries.length > 20) ctx.log(`  and ${r.inquiries.length - 20} more inquiries`);
  for (const u of r.unreadable) ctx.log(`  UNREAD ${u.platform}: "${u.subject}" (${u.messageId}): no buyer address found; send this notification's text to be added to the reader`);
}

const subImport: Sub = async (args, ctx) => {
  const [what, ...rest] = ctx.positionals(args, ["--kind", "--source", "--since"]);
  const stores = ctx.stores();
  const config = ctx.config();
  if (what === "list") {
    const file = fileArg(rest[0], ctx, "buyer list CSV");
    const source = ctx.flag(args, "--source");
    if (!source) throw ctx.usage("--source is required: the channel these buyers are counted under, for example past-bidders or conference-acg-2026");
    const r = importBuyerList(stores, fs.readFileSync(file, "utf8"), { kind: kindArg(ctx.flag(args, "--kind"), ctx), source, label: path.basename(file), now: ctx.now });
    ctx.log(`${path.basename(file)}: ${added(r)}; ${r.skipped.length} row(s) skipped.`);
    for (const s of r.skipped.slice(0, 10)) ctx.log(`  line ${s.line}: ${s.reason}`);
    if (r.unknown.length) ctx.log(`  Columns not read: ${r.unknown.join(", ")}`);
    return 0;
  }
  if (what === "mbox") {
    const file = fileArg(rest[0], ctx, "mbox file");
    const found = buyerMessagesInMbox(file, config);
    ctx.log(`${path.basename(file)}: ${found.scanned} message(s) read (${found.sent} sent by AMB left out), ${found.messages.length} about buying.`);
    logInbox(ctx, "Mailbox history", processBuyerInbox(stores, config, { messages: found.messages, now: ctx.now, history: true }));
    return 0;
  }
  if (what === "form-d") {
    if (!rest.length) throw ctx.usage("Give one or more unzipped Form D folders.");
    const dirs = rest.map((d) => fileArg(d, ctx, "Form D folder"));
    const r = importFormD(stores, config, dirs, ctx.now);
    ctx.log(`Form D: ${r.filings} fund filing(s) kept, ${r.firms} firm(s) (${r.searchFunds} possible search funds): ${added(r)}. These need an email: enrich --discover finds one when the firm's adviser filing gives a website.`);
    return 0;
  }
  if (what === "adv") {
    const file = fileArg(rest[0], ctx, "adviser list CSV");
    if (ctx.has(args, "--partners")) {
      const r = readAdvisers(file, { asPartners: true });
      const stamp = isoStamp(ctx.now);
      const partners: PartnerRow[] = r.incoming.map((a) => ({ partner_id: "", kind: "wealth_manager", name: a.company ?? "", contact_name: a.name ?? "", email: a.email ?? "", phone: a.phone ?? "", city: a.city ?? "", state: a.state ?? "", evidence: a.source_detail, source: "", status: "prospect", created_at: stamp, notes: a.website ? `website ${a.website}` : "" }));
      const p = upsertPartners(stores, partners.filter((x) => x.name));
      ctx.log(`Adviser list: ${p.added} wealth manager partner(s) added, ${p.updated} updated.`);
      return 0;
    }
    const r = importAdvisers(stores, file, ctx.now);
    ctx.log(`Adviser list: ${added(r)}; ${r.skipped} wealth or planning firm(s) left out (import them with --partners).`);
    return 0;
  }
  if (what === "sba") {
    const file = fileArg(rest[0], ctx, "SBA 7(a) CSV");
    const since = ctx.flag(args, "--since") ?? addDays(ctx.today, -3 * 365);
    const r = importSba7a(stores, config, file, { since, now: ctx.now });
    ctx.log(`SBA 7(a): ${r.loans} change-of-ownership loan(s) since ${since}; ${r.lenders} top lender(s), ${r.partnersAdded} new partner(s); acquirers: ${added(r)}.`);
    return 0;
  }
  if (what === "registrations") {
    const file = fileArg(rest[0], ctx, "AMBrain registrations CSV");
    const r = importRegistrations(stores, fs.readFileSync(file, "utf8"), ctx.now);
    ctx.log(`Registrations: ${r.matched} matched to a lead (${r.promoted} moved up), ${r.added} new from their own link, ${r.skipped.length} skipped.`);
    for (const [s, n] of Object.entries(r.bySource).sort((a, b) => b[1] - a[1])) ctx.log(`  ${s}: ${n}`);
    for (const s of r.skipped.slice(0, 10)) ctx.log(`  line ${s.line}: ${s.reason}`);
    cancelStale(ctx, stores);
    return 0;
  }
  throw ctx.usage("buyers import list|mbox|form-d|adv|sba|registrations <file>");
};

const subDownload: Sub = async (args, ctx) => {
  const [what] = ctx.positionals(args, ["--quarters"]);
  const config = ctx.config();
  const dir = path.join(ctx.env.dataDir, "downloads", "buyers");
  const opts = { ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}), log: ctx.log };
  if (what === "form-d") {
    const q = ctx.flag(args, "--quarters");
    const dirs = await downloadFormD(config, { dir: path.join(dir, "form-d"), ...(q ? { quarters: Number(q) } : {}), ...opts });
    ctx.log(`Downloaded ${dirs.length} quarter(s) to ${ctx.shown(path.join(dir, "form-d"))}.`);
    if (ctx.has(args, "--import")) return subImport(["form-d", ...dirs], ctx);
    return 0;
  }
  if (what === "sba") {
    const file = await downloadSba7a({ dir: path.join(dir, "sba"), ...opts });
    ctx.log(`Downloaded ${ctx.shown(file)}.`);
    if (ctx.has(args, "--import")) return subImport(["sba", file], ctx);
    return 0;
  }
  throw ctx.usage("buyers download form-d|sba [--import]");
};

const subStrategic: Sub = async (_args, ctx) => {
  const stores = ctx.stores();
  const config = ctx.config();
  const s = strategicBuyers(stores, config);
  const r = upsertBuyers(stores, s.incoming, ctx.now);
  const carried = carryVerification(stores);
  ctx.log(`Strategic buyers (${config.buyers.strategic_min_staff}+ staff): ${added(r)}; ${s.skipped} left to the seller side; ${carried} verification(s) carried over.`);
  return 0;
};

const subAdd: Sub = async (args, ctx) => {
  const f = (n: string) => ctx.flag(args, n);
  const incoming: Omit<IncomingBuyer, "source_detail"> = {
    kind: f("--kind") ? kindArg(f("--kind"), ctx) : "referral",
    email: f("--email") ?? "",
    name: f("--name") ?? "",
    company: f("--company") ?? "",
    phone: f("--phone") ?? "",
    state: f("--state") ?? "",
    source: f("--source") ?? "manual",
    interest: f("--interest") ?? "",
  };
  const r = addBuyer(ctx.stores(), incoming, ctx.now);
  ctx.log(r.added ? "Added." : r.updated ? "Already listed: filled in what was blank." : "Already listed, nothing new.");
  return 0;
};

const subReview: Sub = async (args, ctx) => {
  const [leadId, verdict] = ctx.positionals(args, ["--reason"]);
  if (!leadId || (verdict !== "approve" && verdict !== "exclude")) throw ctx.usage("buyers review <leadId> <approve|exclude> [--reason TEXT]");
  const stores = ctx.stores();
  const lead = stores.buyerLeads.rows().find((l) => l.lead_id === leadId.toUpperCase());
  if (!lead) throw ctx.usage(`${leadId} is not in buyers/leads.csv`);
  const reason = ctx.flag(args, "--reason") ?? "";
  const stamp = isoStamp(ctx.now);
  const next: BuyerLeadRow =
    verdict === "approve"
      ? { ...lead, status: lead.status === "review" || lead.status === "excluded" ? (lead.email ? "new" : "needs_email") : lead.status, updated_at: stamp, notes: [lead.notes, `Approved on ${stamp.slice(0, 10)}${reason ? `: ${reason}` : ""}`].filter(Boolean).join("\n") }
      : { ...lead, status: "excluded", next_invite_date: "", updated_at: stamp, notes: [lead.notes, `Excluded on ${stamp.slice(0, 10)}${reason ? `: ${reason}` : ""}`].filter(Boolean).join("\n") };
  stores.buyerLeads.upsert([next]);
  if (verdict === "exclude") cancelStale(ctx, stores);
  ctx.log(`${lead.lead_id} is now ${next.status}.`);
  return 0;
};

function cancelStale(ctx: BuyerCliContext, stores: Stores): void {
  const c = cancelStaleBuyerTouches(stores, ctx.now);
  if (c.cancelled) ctx.log(`Cancelled ${c.cancelled} queued buyer email(s) to people who can no longer be emailed.`);
  for (const t of c.draftsToCheck) ctx.log(`  DELETE the Gmail draft ${t.draft_id || "(id not recorded)"} in ${t.mailbox} to ${t.to} (${t.touch_id}): they opted out or bounced.`);
}

/** Move buyer inbox files whose messages are all read into processed/; a file with an unreadable message stays. */
function moveRead(stores: Stores): void {
  const dir = stores.dir.buyerInbox;
  if (!fs.existsSync(dir)) return;
  const done = new Set(stores.buyerInbound.rows().map((r) => r.message_id));
  const processed = path.join(dir, "processed");
  for (const name of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"))) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const items = (Array.isArray(raw) ? raw : [raw]).map((i) => InboundFileSchema.safeParse(i));
    if (!items.length || !items.every((r) => r.success && done.has(r.data.id))) continue;
    fs.mkdirSync(processed, { recursive: true });
    fs.renameSync(path.join(dir, name), path.join(processed, name));
  }
}

const subSync: Sub = async (args, ctx) => {
  const config = ctx.config();
  const stores = ctx.stores();
  const history = ctx.has(args, "--history");
  let messages: InboundMessage[] = [];
  const warm = warmMailbox(config);
  if (config.sending.transport === "gmail_api" && warm) {
    const since = ctx.flag(args, "--since") ?? (history ? addDays(ctx.today, -3 * 365) : isoStamp(new Date(ctx.now.getTime() - 3 * 86_400_000)));
    const inbox = new GmailApiInbox({ tokensFile: ctx.env.gmailTokensFile, now: ctx.now, ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}) });
    if (history) inbox.maxMessages = 5000;
    // History reads archived mail too; the day-to-day sync reads the inbox.
    messages = await inbox.fetchSince(warm.email, since, history ? "-in:sent -in:chats" : "in:inbox");
    ctx.log(`${warm.email}: ${messages.length} message(s) since ${since}.`);
  } else {
    const r = readInboxFolder(stores.dir.buyerInbox);
    messages = r.messages;
    for (const bad of r.invalid) ctx.log(`  unreadable ${bad.file}: ${bad.error}`);
    ctx.log(`${ctx.shown(stores.dir.buyerInbox)}: ${messages.length} message(s) written by the Gmail routine.`);
  }
  logInbox(ctx, "Buyer inbox", processBuyerInbox(stores, config, { messages, now: ctx.now, history }));
  moveRead(stores);
  const s = syncSellerReplies(stores, ctx.now);
  if (s.replied || s.optedOut || s.bounced) ctx.log(`Answers to cold invitations (seller reply loop): ${s.replied} replied, ${s.optedOut} opted out, ${s.bounced} bounced.`);
  cancelStale(ctx, stores);
  return 0;
};

const subEnrich: Sub = async (args, ctx) => {
  const config = ctx.config();
  const stores = ctx.stores();
  const verify = !ctx.has(args, "--no-verify");
  const budget = ctx.flag(args, "--max-seconds");
  const seconds = budget === undefined ? undefined : Number(budget);
  if (seconds !== undefined && !(seconds >= 0)) throw ctx.usage(`--max-seconds must be a number of seconds, not "${budget}"`);
  const cursorFile = path.join(stores.dir.cache, "buyer-enrich-cursor.json");
  let startAfter: string | undefined;
  if (ctx.has(args, "--resume") && fs.existsSync(cursorFile)) {
    try {
      startAfter = String((JSON.parse(fs.readFileSync(cursorFile, "utf8")) as { after?: unknown }).after ?? "") || undefined;
    } catch {
      startAfter = undefined;
    }
  }
  const started = performance.now();
  const r = await enrichBuyers(stores, config, {
    now: ctx.now,
    discover: ctx.has(args, "--discover"),
    verify,
    ...(ctx.fetchImpl ? { fetchImpl: ctx.fetchImpl } : {}),
    ...(ctx.resolveMx ? { resolveMx: ctx.resolveMx } : {}),
    ...(ctx.env.verifierApiKey ? { verifierApiKey: ctx.env.verifierApiKey } : {}),
    ...(startAfter ? { startAfter } : {}),
    ...(seconds !== undefined ? { shouldStop: () => performance.now() - started >= seconds * 1000 } : {}),
  });
  ctx.log(`Buyers: ${r.websites} website(s) from sister filings, ${r.found} email(s) found, ${r.verified} verified (${Object.entries(r.byStatus).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}).`);
  if (r.stoppedAfter) {
    fs.mkdirSync(stores.dir.cache, { recursive: true });
    fs.writeFileSync(cursorFile, `${JSON.stringify({ after: r.stoppedAfter })}\n`);
    ctx.log(`Stopped after ${r.stoppedAfter} to stay inside the time limit, with ${r.remaining} to go: run it again with --resume.`);
  } else if (fs.existsSync(cursorFile)) fs.rmSync(cursorFile);
  return 0;
};

const subScore: Sub = async (_args, ctx) => {
  const stores = ctx.stores();
  ensureRefs(stores);
  const r = scoreBuyers(stores, ctx.config(), { today: ctx.today, now: ctx.now });
  ctx.log(`Scored ${r.scored} buyer(s); ${r.ready} ready to invite.`);
  return 0;
};

const dateOf = (args: string[], ctx: BuyerCliContext) => {
  const d = ctx.flag(args, "--date");
  if (d !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw ctx.usage(`--date must be YYYY-MM-DD, not "${d}"`);
  return d ?? ctx.today;
};

const subPlan: Sub = async (args, ctx) => {
  const stores = ctx.stores();
  const plan = planBuyerInvites(stores, ctx.config(), { today: dateOf(args, ctx) });
  if (plan.reason) {
    ctx.log(`No buyer emails on ${plan.date}: ${plan.reason}.`);
    return 0;
  }
  const leads = new Map(stores.buyerLeads.rows().map((l) => [l.lead_id, l]));
  ctx.log(`Buyer plan for ${plan.date}: ${plan.items.length} email(s). Room: ${Object.entries(plan.room).map(([k, n]) => `${k} ${n}`).join(", ")}.`);
  for (const i of plan.items) ctx.log(`  ${i.leadId}  ${i.template}  to ${leads.get(i.leadId)?.email ?? ""} (${leads.get(i.leadId)?.company || leads.get(i.leadId)?.name || ""})  from ${i.mailbox}`);
  const reasons = new Map<string, number>();
  for (const s of plan.skipped) reasons.set(s.reason.replace(/\b(P|B)-\d+\b/g, "#"), (reasons.get(s.reason.replace(/\b(P|B)-\d+\b/g, "#")) ?? 0) + 1);
  for (const [r, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8)) ctx.log(`  skipped ${n}: ${r}`);
  return 0;
};

const subSend: Sub = async (args, ctx) => {
  const config = ctx.config();
  const today = dateOf(args, ctx);
  const dryRun = ctx.has(args, "--dry-run");
  const blockers = await ctx.sendBlockers(config, today);
  if (blockers.length) {
    ctx.log("Refusing to send: preflight has failing config or licensing items.");
    for (const b of blockers) ctx.log(`  FAIL  ${b.check}: ${b.detail}`);
    return 1;
  }
  const lint = lintBuyerTemplates(config);
  if (lint.length) {
    ctx.log("Refusing to send: the buyer templates fail the house-style lint.");
    for (const l of lint) ctx.log(`  ${l}`);
    return 1;
  }
  const windowBlock = !dryRun && today === ctx.today ? ctx.sendWindowBlock(config, ctx.now) : undefined;
  if (windowBlock) {
    ctx.log(`Not sending now: ${windowBlock}.`);
    return 1;
  }
  const stores = ctx.stores();
  ensureRefs(stores);
  const transport = ctx.transport(config, stores, today);
  const r = await runBuyerInvites(stores, config, { today, now: ctx.now, transport, dryRun });
  if (r.plan.reason) {
    ctx.log(`No buyer emails on ${r.date}: ${r.plan.reason}.`);
    return 0;
  }
  const verb = dryRun ? "Would deliver" : config.sending.mode === "draft" ? "Drafted" : "Sent";
  ctx.log(`${verb} ${r.delivered.length} buyer email(s) on ${r.date} (mode ${r.mode}, transport ${r.transport}${dryRun ? ", dry run: nothing written" : ""}).`);
  for (const d of r.delivered) ctx.log(`  ${dryRun ? "(dry run)" : d.touchId}  ${d.template}  ${d.leadId}  from ${d.mailbox}`);
  for (const b of r.blocked) ctx.log(`  BLOCKED ${b.leadId}: ${b.reasons.join("; ")}`);
  for (const f of r.failed) ctx.log(`  FAILED ${f.leadId}: ${f.error}`);
  if (dryRun) for (const p of r.previews.slice(0, 3)) ctx.log(`\n--- to ${p.to} from ${p.mailbox}\nSubject: ${p.subject}\n\n${p.body}\n`);
  if (transport instanceof OutboxTransport && r.delivered.length && !dryRun) ctx.log(`Outbox: ${ctx.shown(path.join(transport.dir, "README.md"))}.`);
  return r.failed.length || r.blocked.length ? 1 : 0;
};

const subStatus: Sub = async (_args, ctx) => {
  for (const line of funnelLines(buyerFunnel(ctx.stores(), ctx.today))) ctx.log(line);
  return 0;
};

const subKit: Sub = async (args, ctx) => {
  const ref = ctx.flag(args, "--ref");
  const headline = ctx.flag(args, "--headline");
  const facts = ctx.flag(args, "--facts");
  for (const k of postingKit(ctx.config(), { ...(ref ? { ref } : {}), ...(headline ? { headline } : {}), ...(facts ? { facts } : {}) })) {
    ctx.log(`== ${k.label} (${k.note})\n${k.text}\n`);
  }
  return 0;
};

const subPartners: Sub = async (_args, ctx) => {
  const config = ctx.config();
  const stores = ctx.stores();
  const counts = new Map<string, number>();
  for (const l of stores.buyerLeads.rows()) counts.set(l.source, (counts.get(l.source) ?? 0) + 1);
  const rows = stores.partners.rows();
  if (!rows.length) ctx.log("No partners yet: buyers import sba <file> lists the lenders who finance the most business purchases; partner add lists one by hand.");
  for (const p of rows) {
    const kit = partnerKit(config, p);
    ctx.log(`${p.partner_id}  ${p.kind}  ${p.name}${p.city ? `, ${p.city}` : ""}  [${p.status}]  ${counts.get(p.source) ?? 0} buyer(s) so far\n  ${p.evidence}\n  Link: ${kit.link}\n  Note: ${kit.note}\n`);
  }
  return 0;
};

const subPartner: Sub = async (args, ctx) => {
  const [action] = ctx.positionals(args, ["--kind", "--name", "--contact", "--email", "--phone", "--city", "--state", "--notes"]);
  if (action !== "add") throw ctx.usage("buyers partner add --kind <kind> --name <name> [--contact] [--email] [--phone] [--city] [--state] [--notes]");
  const kind = ctx.flag(args, "--kind") ?? "other";
  if (!(PARTNER_KINDS as readonly string[]).includes(kind)) throw ctx.usage(`--kind must be one of ${PARTNER_KINDS.join(", ")}`);
  const name = ctx.flag(args, "--name");
  if (!name) throw ctx.usage("--name is required");
  const stamp = isoStamp(ctx.now);
  const r = upsertPartners(ctx.stores(), [
    { partner_id: "", kind: kind as PartnerRow["kind"], name, contact_name: ctx.flag(args, "--contact") ?? "", email: ctx.flag(args, "--email") ?? "", phone: ctx.flag(args, "--phone") ?? "", city: ctx.flag(args, "--city") ?? "", state: (ctx.flag(args, "--state") ?? "").toUpperCase(), evidence: "Added by hand", source: "", status: "prospect", created_at: stamp, notes: ctx.flag(args, "--notes") ?? "" },
  ]);
  const p = ctx.stores().partners.rows().find((x) => x.name === name && x.kind === kind);
  if (p && !p.source) ctx.stores().partners.upsert([{ ...p, source: `partner-${p.partner_id.toLowerCase()}` }]);
  ctx.log(r.added ? `Added ${p?.partner_id}. Its link: buyers partners` : "Already listed.");
  return 0;
};

const subDaily: Sub = async (args, ctx) => {
  let code = 0;
  const step = async (name: string, fn: () => Promise<number>) => {
    ctx.log(`== buyers ${name}`);
    try {
      if (await fn()) code = 1;
    } catch (err) {
      code = 1;
      ctx.log(`buyers ${name} failed: ${(err as Error).message}`);
    }
  };
  await step("sync", () => subSync([], ctx));
  await step("strategic", () => subStrategic([], ctx));
  await step("enrich", () => subEnrich(["--discover", "--max-seconds", "120", "--resume"], ctx));
  await step("score", () => subScore([], ctx));
  await step("send", () => subSend(["--date", dateOf(args, ctx)], ctx));
  return code;
};

const SUBS: Record<string, Sub> = {
  import: subImport,
  download: subDownload,
  strategic: subStrategic,
  add: subAdd,
  review: subReview,
  sync: subSync,
  enrich: subEnrich,
  score: subScore,
  plan: subPlan,
  send: subSend,
  status: subStatus,
  kit: subKit,
  partners: subPartners,
  partner: subPartner,
  daily: subDaily,
};

/** Run `buyers <step> ...`. */
export async function runBuyers(args: string[], ctx: BuyerCliContext): Promise<number> {
  const [step, ...rest] = args;
  const fn = step ? SUBS[step] : undefined;
  if (!fn) {
    ctx.log(BUYERS_USAGE);
    return step ? 1 : 0;
  }
  return fn(rest, ctx);
}
