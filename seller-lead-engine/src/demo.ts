import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseConfig, type EngineConfig } from "./config.ts";
import { canonicalEmail } from "./compliance/suppression.ts";
import type { InboundMessage } from "./domain/messages.ts";
import { classifyByKeywords, classifyByRules, questionsIn, ReplyWireSchema, wireToFacts, type Classification, type ReplyWire } from "./replies/classify.ts";
import { addressOf, stripQuoted } from "./replies/parse.ts";
import { MemoryTransport } from "./sending/transports.ts";
import { openStores } from "./store/index.ts";
import { EXAMPLE_CONFIG, PACKAGE_ROOT, runCli, type CliDeps } from "./cli.ts";

// The whole loop, offline, on the fictional Tampa Bay samples: `npm run demo`.
//
// It runs the same CLI commands a person runs, in a fresh temp data folder,
// with everything outside the engine stubbed: the email verifier and MX
// lookups answer "valid" without a network call, the transport is
// MemoryTransport (nothing reaches Gmail; the drafts are written to
// <data>/drafts/ so they can be read), and Claude is replaced by the canned
// answer stored next to the one reply the rules cannot decide
// (samples/tampa-bay/replies/01-gulfside-interested.json, claude_stand_in).
//
// The engine's own calendar is simulated, because warm-up, send days and
// the weekly window depend on dates: the mailboxes started warm-up on
// 2026-09-01, the build runs Monday 2026-10-19, step 1 goes out Tuesday
// 2026-10-20 (cold week 5) and the replies arrive Wednesday 2026-10-21. The
// run's own `today` and `now` are only reported, so every run prints the
// same results.
//
// The config is config/engine.config.example.json with two fictional
// mailboxes, a postal address and Florida licensed, each marked DEMO ONLY.
// Those values live only in the temp folder: a real licensed_states list
// and licensing_signoff come from counsel (docs/COMPLIANCE.md).

const SAMPLES = path.join(PACKAGE_ROOT, "samples/tampa-bay");
const REPLIES_DIR = path.join(SAMPLES, "replies");

/** The simulated calendar: build, the first send day after warm-up, and the reply day. */
export const DEMO_DAYS = { build: "2026-10-19", send: "2026-10-20", replies: "2026-10-21" } as const;

/** The demo's fictional senders, at the .example sending domain the samples use. */
export const DEMO_MAILBOXES = [
  { email: "frank@ambadvisory-mail.example", sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01", paused: false },
  { email: "frank.e@ambadvisory-mail.example", sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01", paused: false },
];

/** What a demo run produced, for the caller (and the tests) to inspect. */
export interface DemoResult {
  dataDir: string;
  configFile: string;
  config: EngineConfig;
  transport: MemoryTransport;
  /** Every command the demo ran, with its exit code. */
  steps: { argv: string[]; code: number }[];
  /** The interested owner's prospect id. */
  interestedProspectId: string;
}

/** The example config with the demo's fictional mailboxes, postal address and licensing, each marked DEMO ONLY. */
export function demoConfig(): EngineConfig {
  const raw = JSON.parse(fs.readFileSync(EXAMPLE_CONFIG, "utf8")) as Record<string, unknown> & { firm: Record<string, unknown>; targeting: { exclude_name_patterns: string[] } & Record<string, unknown> };
  return parseConfig(
    {
      ...raw,
      firm: { ...raw.firm, postal_address: "DEMO ONLY, 100 Example Street, Suite 200, Tampa, FL 33602" },
      mailboxes: DEMO_MAILBOXES,
      licensed_states: ["FL"],
      licensing_signoff: "DEMO ONLY: fictional sample data in a temp folder, not a counsel sign-off. Never copy this into config/engine.config.json.",
      // The sample's franchise-looking business (samples/tampa-bay/README.md) shows the chain knock-out.
      targeting: { ...raw.targeting, exclude_name_patterns: [...raw.targeting.exclude_name_patterns, "frostline"] },
      handoff: { advisor_name: "the AMB advisor (demo)", advisor_email: "" },
    },
    "demo config",
  );
}

/** A verifier that marks every address valid and an MX lookup that finds a server: no network. */
const stubVerifier = (async () => new Response(JSON.stringify({ status: "valid", sub_status: "" }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
const stubMx = async () => ["mx.demo.example"];

/** The canned Claude answers in the sample replies (claude_stand_in), by message id. */
export function loadStandIns(dir = REPLIES_DIR): Map<string, ReplyWire> {
  const out = new Map<string, ReplyWire>();
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as { id?: string; claude_stand_in?: unknown };
    if (raw.id && raw.claude_stand_in) out.set(raw.id, ReplyWireSchema.parse(raw.claude_stand_in));
  }
  return out;
}

/**
 * The demo's classifier: the deterministic rules first (exactly as in
 * classifyReply), then the canned Claude answer for that message, else the
 * keyword fallback. It never calls Claude, even when ANTHROPIC_API_KEY is set.
 */
export function standInClassifier(wires: Map<string, ReplyWire>): (msg: InboundMessage) => Promise<Classification> {
  return async (msg) => {
    const stripped = stripQuoted(msg.text);
    const rules = classifyByRules(msg, stripped);
    if (rules) return rules;
    const w = wires.get(msg.id);
    if (!w) return classifyByKeywords(stripped);
    const optOut = w.opt_out || w.class === "unsubscribe";
    const question = w.question?.trim() || questionsIn(stripped);
    return {
      class: optOut ? "unsubscribe" : w.class,
      classifier: "claude",
      optOut,
      complaint: w.complaint || w.class === "complaint",
      facts: wireToFacts(w, stripped),
      ...(question ? { question } : {}),
      notes: `Demo stand-in for Claude (canned in samples/tampa-bay/replies, no API call): ${w.notes}`,
    };
  };
}

/**
 * Copy the canned replies into <data>/inbox/ as the Gmail routine would write
 * them: in the mailbox and thread of the step-1 email they answer. A bounce
 * is matched by the address it names.
 */
export function deliverCannedReplies(dataDir: string, dir = REPLIES_DIR): number {
  const stores = openStores(dataDir);
  const prospects = stores.prospects.rows();
  const touches = stores.touches.rows();
  fs.mkdirSync(stores.dir.inbox, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown> & { from: string; text: string };
    const from = canonicalEmail(addressOf(raw.from));
    const p = prospects.find((x) => x.email && canonicalEmail(x.email) === from) ?? prospects.find((x) => x.email && raw.text.includes(x.email));
    const t = p && touches.find((x) => x.prospect_id === p.prospect_id && x.kind === "outreach" && x.step === 1);
    if (!p || !t) throw new Error(`Demo sample ${name} answers no step-1 email: the samples and the demo are out of step`);
    const filled = {
      ...raw,
      mailbox: raw.mailbox || t.mailbox,
      threadId: raw.threadId || t.thread_id,
      to: raw.to || t.mailbox,
      subject: raw.subject || `Re: ${t.subject}`,
    };
    fs.writeFileSync(path.join(stores.dir.inbox, name), `${JSON.stringify(filled, null, 2)}\n`);
    n++;
  }
  return n;
}

/** Run the whole loop offline in a temp folder and print each step, the weekly report and where everything is. */
export async function runDemo(opts: { log: (line: string) => void; today: string; now: Date; dataDir?: string }): Promise<DemoResult> {
  const { log } = opts;
  const dataDir = opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "lead-engine-demo-"));
  fs.mkdirSync(dataDir, { recursive: true });
  const config = demoConfig();
  const configFile = path.join(dataDir, "engine.config.json");
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);

  const transport = new MemoryTransport();
  const classify = standInClassifier(loadStandIns());
  // EMAIL_VERIFIER_API_KEY is set to a dummy so enrich runs the verifier path, which the stub answers.
  const env: NodeJS.ProcessEnv = { LEAD_ENGINE_CONFIG: configFile, LEAD_ENGINE_DATA_DIR: dataDir, EMAIL_VERIFIER_API_KEY: "demo-stub-no-network" };
  const depsOn = (day: string, time: string): CliDeps => ({
    cwd: PACKAGE_ROOT,
    env,
    today: day,
    now: new Date(`${day}T${time}:00Z`),
    log: (line) => log(line.replace(/^/gm, "  ")),
    fetchImpl: stubVerifier,
    resolveMx: stubMx,
    transport,
    classify,
  });
  const steps: DemoResult["steps"] = [];
  let n = 0;
  const run = async (title: string, argv: string[], deps: CliDeps) => {
    n++;
    log("");
    log(`== ${n}. ${title} (${deps.today}): npm run engine -- ${argv.join(" ")}`);
    const code = await runCli(argv, deps);
    steps.push({ argv, code });
    if (code !== 0) throw new Error(`Demo step "${argv.join(" ")}" exited ${code}`);
  };

  log("Seller lead engine demo: the whole loop on the fictional Tampa Bay samples, offline.");
  log(`Run on ${opts.today}. The engine's calendar is simulated (build ${DEMO_DAYS.build}, step 1 ${DEMO_DAYS.send}, replies ${DEMO_DAYS.replies}) so every run gives the same results.`);
  log("No network: the verifier and MX lookups are stubs, the transport is in memory, and Claude is replaced by a canned answer.");
  log(`Data folder: ${dataDir}`);

  const build = depsOn(DEMO_DAYS.build, "12:00");
  const rel = (f: string) => path.relative(PACKAGE_ROOT, path.join(SAMPLES, f));
  await run("Import the Sunbiz corporations file", ["import", "sunbiz", rel("sunbiz_cordata.txt"), "--snapshot", "2026-10-01"], build);
  await run("Import the DBPR licence file", ["import", "dbpr", rel("dbpr_cilb_licensees.csv"), "--snapshot", "2026-10-01"], build);
  await run("Import contacts", ["import", "csv:contacts", rel("contacts.csv"), "--snapshot", "2026-10-01"], build);
  await run("Import open places data", ["import", "csv:open_poi", rel("open_poi.csv"), "--snapshot", "2026-10-01"], build);
  await run("Merge into prospects", ["build"], build);
  await run("Choose and verify emails (stub verifier)", ["enrich"], build);
  await run("Score and tier", ["score"], build);

  const send = depsOn(DEMO_DAYS.send, "13:00");
  await run("Plan the first send day", ["plan"], send);
  await run("Render, gate and draft step 1", ["send"], send);

  const replies = depsOn(DEMO_DAYS.replies, "16:00");
  const delivered = deliverCannedReplies(dataDir);
  log("");
  log(`Six canned replies arrive in ${path.join(dataDir, "inbox")} (${delivered} files): an interested owner, a question, "are you a bot?", an opt-out, a hard bounce and an out-of-office.`);
  await run("Process the replies", ["qualify"], replies);

  const stores = openStores(dataDir);
  const interested = stores.leads.rows().find((l) => l.stage === "warm");
  if (!interested) throw new Error("Demo: the interested owner did not become a warm lead");
  await run("Write the exit-readiness check and draft it", ["check", interested.prospect_id], replies);
  await run("Hand off warm sellers", ["handoff"], depsOn(DEMO_DAYS.replies, "17:00"));
  await run("Weekly report", ["report"], depsOn(DEMO_DAYS.replies, "17:00"));
  await run("Status", ["status"], depsOn(DEMO_DAYS.replies, "17:00"));

  // MemoryTransport keeps drafts in memory; write them out so a person can read what would have reached Gmail.
  const draftsDir = path.join(dataDir, "drafts");
  fs.mkdirSync(draftsDir, { recursive: true });
  for (const { msg, mode } of transport.delivered) {
    const head = [`Mode: ${mode}`, `From: ${msg.fromName} <${msg.mailbox}>`, `To: ${msg.to}`, `Subject: ${msg.subject}`, ...Object.entries(msg.headers).map(([k, v]) => `${k}: ${v}`)];
    fs.writeFileSync(path.join(draftsDir, `${msg.touchId} ${msg.kind}${msg.step ? ` step ${msg.step}` : ""}.txt`), `${head.join("\n")}\n\n${msg.body}\n`);
  }

  const first = transport.delivered.find((d) => d.msg.kind === "outreach");
  const answer = transport.delivered.find((d) => d.msg.kind === "reply" && d.msg.prospectId === interested.prospect_id);
  if (first) {
    log("");
    log("== A step-1 draft, as it would sit in Gmail:");
    log(`  To: ${first.msg.to}\n  Subject: ${first.msg.subject}\n\n${first.msg.body.replace(/^/gm, "  ")}`);
  }
  if (answer) {
    log("");
    log(`== The drafted answer to ${interested.owner_name || interested.business_name} (a person reviews and sends it):`);
    log(`  Subject: ${answer.msg.subject}\n\n${answer.msg.body.replace(/^/gm, "  ")}`);
  }

  const where = (label: string, p: string) => log(`  ${label.padEnd(22)} ${path.join(dataDir, p)}`);
  log("");
  log("== Where everything is:");
  where("Config (DEMO ONLY)", "engine.config.json");
  where("Prospects", "prospects.csv");
  where("Emails made", "touches.csv");
  where("Drafts (text)", "drafts/");
  where("Replies", "replies.csv");
  where("Processed inbox", "inbox/processed/");
  where("Leads", "leads.csv");
  where("Suppression list", "suppression.csv");
  where("Readiness checks", "checks/");
  where("Handoffs", "handoffs/");
  where("Weekly report", "reports/");
  log("");
  log(`${transport.delivered.length} drafts made in memory; nothing was sent. Delete the folder when done: rm -rf ${dataDir}`);

  return { dataDir, configFile, config, transport, steps, interestedProspectId: interested.prospect_id };
}
