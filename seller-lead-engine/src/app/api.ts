import fs from "node:fs";
import path from "node:path";
import { ConfigError, engineEnv, loadConfig, parseConfig, type EngineConfig } from "../config.ts";
import type { LeadRow, ReplyClass } from "../domain/schema.ts";
import { runCli, engineTimeZone, EXAMPLE_CONFIG, SEND_BLOCKING_CHECKS, sendWindowBlock, TEMPLATES_DIR, type CliDeps } from "../cli.ts";
import { DEMO_DAYS, runDemo } from "../demo.ts";
import { staffLabel } from "../contacts/staff.ts";
import { dashboardData, STAGE_WORDS } from "../report/dashboard.ts";
import { preflight } from "../sending/preflight.ts";
import { runSend, type SendReport } from "../sending/run.ts";
import { MemoryTransport } from "../sending/transports.ts";
import { openStores } from "../store/index.ts";
import { isoStamp, localDate } from "../util/dates.ts";

// The app's requests, whoever serves them: the desktop app (src/app/server.ts,
// files on this computer) and the hosted app (src/hosted/, the same files
// kept in Postgres). Each request runs against a Space, one data folder and
// its settings, and every button runs the CLI's own commands, so every gate,
// cap, suppression check and draft-only rule applies unchanged.
//
// The host decides three things this file does not: where a space's files
// live, how writes are kept apart (one step at a time), and whether a long
// step runs in the background (desktop) or inside the request (hosted).

/** Which data the app shows: the real data, or the fictional sample the demo builds. */
export type AppMode = "live" | "sample";

/** Optional stubs passed through to the commands (tests). */
export type AppDeps = Partial<Pick<CliDeps, "fetchImpl" | "resolveMx" | "resolveTxt" | "transport" | "classify" | "sftp">>;

/** One data folder and its settings, as the commands see them. */
export interface Space {
  mode: AppMode;
  /** Where commands run (their working folder). */
  root: string;
  /** Carries LEAD_ENGINE_CONFIG and LEAD_ENGINE_DATA_DIR for this space, plus the API keys. */
  env: NodeJS.ProcessEnv;
  now: Date;
  deps?: AppDeps;
}

/** A step's progress, as the page shows it. */
export interface JobView {
  id: string;
  action: string;
  label: string;
  running: boolean;
  code: number | undefined;
  log: string[];
  startedAt: string;
}

export type Log = (line: string) => void;

/** What a host provides to the requests. */
export interface ApiHost {
  hosted: boolean;
  /** The mode this request is in. */
  mode(): AppMode;
  /** A space ready to read. */
  read(mode?: AppMode): Promise<Space>;
  /** Run `fn` with the space to itself; what it writes is kept. Throws ApiError 409 when another step holds it. */
  write<T>(fn: (s: Space) => Promise<T>, mode?: AppMode): Promise<T>;
  /** Run a step: the desktop app starts it and answers at once (202), the hosted app answers when it is done (200). */
  job(j: JobSpec): Promise<{ status: number; job: JobView; headers?: Record<string, string> }>;
  /** The step running now, if this host runs steps in the background. */
  running(): JobView | undefined;
  /** Switch mode; returns any response headers (the hosted app keeps the mode in a cookie). */
  setMode(mode: AppMode): Promise<Record<string, string>>;
  /** Open a file or folder on this computer (desktop app only). */
  open?: (target: string) => void;
}

export interface JobSpec {
  action: string;
  label: string;
  /** The space the step runs in, when not the request's. */
  mode?: AppMode;
  /** The mode to switch to once the step succeeds. */
  then?: AppMode;
  run: (s: Space, log: Log) => Promise<number>;
}

/** A request error with its HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The steps the buttons start, each as command lines run in order; `hosted` replaces them on the hosted app. */
export const ACTIONS: Readonly<Record<string, { label: string; commands: string[][]; hosted?: string[][] }>> = {
  setup: { label: "Create the settings file", commands: [["init"]] },
  // The hosted app cannot hold Sunbiz's multi-gigabyte quarterly file (docs: README, Hosting), so it takes DBPR's.
  find: { label: "Find new businesses", commands: [["download", "florida", "--import"]], hosted: [["download", "florida", "--import", "--dbpr-only"]] },
  // A hosted step has five minutes: stop between businesses in time to save, and continue on the next press.
  emails: { label: "Find emails", commands: [["enrich", "--discover"]], hosted: [["enrich", "--discover", "--max-seconds", "200", "--resume"]] },
  score: { label: "Score businesses", commands: [["score"]] },
  drafts: { label: "Create today's Gmail drafts", commands: [["send"]] },
  replies: { label: "Check replies", commands: [["sync"], ["qualify"], ["handoff"]], hosted: [["sync"], ["qualify", "--limit", "12"], ["handoff"]] },
  report: { label: "Weekly report", commands: [["report"]] },
};

const OTHER_LABELS: Record<string, string> = { preview: "Prepare today's emails", sample: "Build the sample" };

/** Reply kinds in plain words. */
const REPLY_WORDS: Record<ReplyClass, string> = {
  interested: "interested",
  question: "question",
  asks_if_ai: "asked if AI",
  not_now: "not now",
  not_interested: "not interested",
  unsubscribe: "opt-out",
  wrong_person: "wrong person",
  referral: "referral",
  auto_reply: "auto-reply",
  bounce: "bounce",
  complaint: "complaint",
  other: "other",
};

/** Paths and keys of a space. */
export const spacePaths = (s: Space) => engineEnv(s.root, s.env);

/** The space's settings, or the reason they cannot be read. */
export function spaceSettings(s: Space): { config?: EngineConfig; error?: string } {
  const file = spacePaths(s).configFile;
  if (!fs.existsSync(file)) return {};
  try {
    return { config: loadConfig(file) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** The space's date: the recipients' date, as the CLI computes it. */
export const spaceToday = (s: Space) => localDate(s.now, engineTimeZone(spaceSettings(s).config));

/** CLI dependencies for a command run in this space. */
export const cliDeps = (s: Space, log: Log): CliDeps => ({ cwd: s.root, env: s.env, today: spaceToday(s), now: s.now, log, ...s.deps });

/** One of the app's own files in a data folder: the email preview, the last step's log, the sample's calendar. */
const appFile = (dataDir: string, name: string) => path.join(dataDir, "app", name);

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
}

/**
 * The clock a space runs on. The sample runs on its own calendar, so it reads
 * the same on any real date: the first day a follow-up is due after the
 * demo's replies, mid-afternoon Eastern, so "Prepare today's emails" has an
 * email to show.
 */
export function spaceNow(mode: AppMode, dataDir: string, clock: () => Date): Date {
  if (mode === "live") return clock();
  const saved = readJson<{ now?: string }>(appFile(dataDir, "clock.json"))?.now;
  return new Date(saved ?? `${DEMO_DAYS.replies}T18:00:00Z`);
}

/** Build the fictional sample in `dataDir` (replacing what was there) and set its calendar. */
export async function buildSample(dataDir: string, realNow: Date, log: Log): Promise<void> {
  fs.rmSync(dataDir, { recursive: true, force: true });
  log("Building the fictional Tampa Bay sample (about 2 seconds)...");
  await runDemo({ log, today: localDate(realNow, "America/New_York"), now: realNow, dataDir });
  const due = openStores(dataDir)
    .prospects.rows()
    .filter((x) => x.status === "in_sequence" && x.next_touch_date >= DEMO_DAYS.replies)
    .map((x) => x.next_touch_date)
    .sort();
  const day = due[0] ?? DEMO_DAYS.replies;
  writeJson(appFile(dataDir, "clock.json"), { now: `${day}T18:00:00Z` });
  log(`The sample's calendar is set to ${day}, a day with a follow-up due.`);
}

/** Run command lines in order; the worst exit code wins. */
export const runCommands = (commands: string[][]) => async (s: Space, log: Log) => {
  let worst = 0;
  for (const argv of commands) {
    log(`> ${argv.join(" ")}`);
    const code = await runCli(argv, cliDeps(s, log)).catch((err) => {
      log((err as Error).message);
      return 1;
    });
    worst = Math.max(worst, code);
    log("");
  }
  return worst;
};

type Previews = {
  at: string;
  report: Pick<SendReport, "date" | "previews" | "blocked" | "failed"> & { skipped: { prospectId: string; reason: string }[]; sendDay: boolean; reason?: string; window?: string };
};

/** Today's emails as they would go out (a dry run: no table is written and nothing is sent). */
async function preview(s: Space, log: Log): Promise<number> {
  const { config: c, error } = spaceSettings(s);
  if (!c) {
    log(error ?? 'Settings are missing: press "Create the settings file" first.');
    return 1;
  }
  const p = spacePaths(s);
  const stores = openStores(p.dataDir);
  const today = spaceToday(s);
  const r = await runSend(stores, c, { today, now: s.now, transport: new MemoryTransport(), templatesDir: TEMPLATES_DIR, dryRun: true });
  const window = sendWindowBlock(c, s.now);
  const saved: Previews = {
    at: isoStamp(s.now),
    report: { date: r.date, previews: r.previews, blocked: r.blocked, failed: r.failed, skipped: r.plan.skipped, sendDay: r.plan.sendDay, ...(r.plan.reason ? { reason: r.plan.reason } : {}), ...(window ? { window } : {}) },
  };
  writeJson(appFile(p.dataDir, "previews.json"), saved);
  log(r.plan.sendDay ? `${r.previews.length} email(s) ready for today, ${r.blocked.length} blocked by the compliance checks, ${r.plan.skipped.length} left out.` : `Today is not a send day: ${r.plan.reason ?? ""}`);
  if (window) log(`Drafts can be created inside the sending window only: ${window}.`);
  return 0;
}

/** Record a finished step in its space, so the page shows it after a reload. */
export function saveLastJob(s: Space, j: JobView): void {
  writeJson(appFile(spacePaths(s).dataDir, "last-job.json"), { ...j, log: j.log.slice(-400) });
}

/** A new step record. */
export function newJob(action: string, label: string, now: Date, id: string): JobView {
  return { id, action, label, running: true, code: undefined, log: [], startedAt: isoStamp(now) };
}

/** A logger that fills a step's log (kept to its last 2,000 lines). */
export function jobLogger(j: JobView): Log {
  return (line: string) => {
    j.log.push(...String(line).split("\n"));
    if (j.log.length > 2000) j.log.splice(0, j.log.length - 2000);
  };
}

/** Everything the page shows. */
async function state(host: ApiHost, s: Space) {
  const p = spacePaths(s);
  const { config: c, error } = spaceSettings(s);
  const today = spaceToday(s);
  const job = host.running() ?? readJson<JobView>(appFile(p.dataDir, "last-job.json")) ?? null;
  const base = { hosted: host.hosted, mode: s.mode, today, configured: Boolean(c), configFile: path.relative(s.root, p.configFile), dataDir: path.relative(s.root, p.dataDir), job };
  if (!c) return { ...base, setup: [{ check: "settings file", ok: false, detail: error ?? `${path.relative(s.root, p.configFile)} does not exist yet` }] };
  const stores = openStores(p.dataDir);
  const items = await preflight(c, { today, templatesDir: TEMPLATES_DIR, resolveTxt: async () => [] });
  const setup = items.filter((i) => SEND_BLOCKING_CHECKS.includes(i.check));
  const data = dashboardData(stores, c, { today });
  const prospects = new Map(stores.prospects.rows().map((x) => [x.prospect_id, x]));
  const leads = stores.leads.rows();
  const lead = (l: LeadRow) => {
    const pr = prospects.get(l.prospect_id);
    const view = data.leads.find((v) => v.prospect_id === l.prospect_id);
    return {
      prospect_id: l.prospect_id,
      business: view?.business ?? l.business_name,
      owner: l.owner_name || pr?.owner_name || "",
      city: pr?.city ?? "",
      stage: STAGE_WORDS[l.stage].label,
      stage_key: l.stage,
      size: view?.size || (pr?.staff_count !== undefined ? `${staffLabel(pr)} staff` : ""),
      timeline: view?.timeline ?? "",
      motivation: view?.motivation ?? "",
      next_action: l.next_action,
      has_note: Boolean(l.handoff_file),
      updated: l.updated_at.slice(0, 10),
    };
  };
  const names = new Map(data.prospects.map((x) => [x.prospect_id, x.business]));
  const replies = stores.replies
    .rows()
    .filter((r) => r.class && r.class !== "auto_reply")
    .sort((a, b) => b.received_at.localeCompare(a.received_at))
    .slice(0, 60)
    .map((r) => ({
      reply_id: r.reply_id,
      received: r.received_at.slice(0, 16).replace("T", " "),
      business: names.get(r.prospect_id) ?? "(not matched)",
      kind: r.class ? REPLY_WORDS[r.class] : "",
      text: r.snippet,
      answer: r.response_touch_id ? "Answer drafted" : r.error ? r.error : "",
    }));
  const previews = readJson<Previews>(appFile(p.dataDir, "previews.json"));
  return {
    ...base,
    setup,
    ready_to_send: setup.every((i) => i.ok),
    mode_is: c.sending.mode,
    transport: c.sending.transport,
    summary: data.summary,
    funnel: data.funnel,
    warm: leads.filter((l) => ["warm", "handed_off", "meeting", "listed"].includes(l.stage)).map(lead),
    talking: leads.filter((l) => ["engaged", "qualifying", "qualified"].includes(l.stage)).map(lead),
    later: leads.filter((l) => l.stage === "nurture").map(lead),
    replies,
    businesses: data.prospects,
    mailboxes: data.mailboxes,
    activity: data.activity,
    previews: previews && previews.report.date === today ? previews : null,
  };
}

/** The handoff note for a lead, read from inside the handoffs folder only. */
function note(s: Space, id: string): { text: string } {
  const stores = openStores(spacePaths(s).dataDir);
  const l = stores.leads.rows().find((x) => x.prospect_id === id);
  if (!l?.handoff_file) throw new ApiError(404, "No handoff note for that business yet.");
  const file = path.resolve(stores.dataDir, l.handoff_file);
  if (!file.startsWith(path.resolve(stores.dir.handoffs) + path.sep) || !fs.existsSync(file)) throw new ApiError(404, "The handoff note file is missing.");
  return { text: fs.readFileSync(file, "utf8") };
}

/** Handle one API request. `pathname` starts with /api/. */
export async function api(host: ApiHost, method: string, pathname: string, query: URLSearchParams, body: Record<string, unknown>): Promise<{ status: number; body: unknown; headers?: Record<string, string> }> {
  const ok = (value: unknown, status = 200, headers?: Record<string, string>) => ({ status, body: value, ...(headers ? { headers } : {}) });

  if (method === "GET" && pathname === "/api/state") return ok(await state(host, await host.read()));
  if (pathname === "/api/note" && (method === "GET" || method === "POST")) {
    return ok(note(await host.read(), String((method === "GET" ? query.get("prospect") : body.prospectId) ?? "")));
  }
  if (method === "GET" && pathname === "/api/settings") {
    const s = await host.read();
    const file = spacePaths(s).configFile;
    return ok({ file: path.relative(s.root, file), exists: fs.existsSync(file), text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : fs.readFileSync(EXAMPLE_CONFIG, "utf8") });
  }
  if (method === "GET" && pathname === "/api/report") {
    const dir = openStores(spacePaths(await host.read()).dataDir).dir.reports;
    const latest = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().pop() : undefined;
    if (!latest) throw new ApiError(404, 'No weekly report yet: press "Write the weekly report".');
    return ok({ name: latest, text: fs.readFileSync(path.join(dir, latest), "utf8") });
  }
  if (method !== "POST") throw new ApiError(405, "Use POST");

  if (pathname === "/api/action") {
    const action = String(body.action ?? "");
    const mode = host.mode();
    if (action === "preview") return send(await host.job({ action, label: OTHER_LABELS.preview!, run: preview }));
    if (action === "sample") {
      return send(
        await host.job({
          action,
          label: OTHER_LABELS.sample!,
          mode: "sample",
          then: "sample",
          run: async (s, log) => {
            await buildSample(spacePaths(s).dataDir, s.now, log);
            return 0;
          },
        }),
      );
    }
    const a = ACTIONS[action];
    if (!a) throw new ApiError(400, `Unknown action "${action}"`);
    // The sample is fictional and offline: nothing in it goes looking on the internet.
    if (mode === "sample" && (action === "find" || action === "emails")) throw new ApiError(400, "Switch to your real data first: the sample never goes online.");
    const commands = (host.hosted && a.hosted) || a.commands;
    return send(
      await host.job({
        action,
        label: a.label,
        run: async (s, log) => {
          // Creating the drafts makes the preview out of date.
          if (action === "drafts") fs.rmSync(appFile(spacePaths(s).dataDir, "previews.json"), { force: true });
          return runCommands(commands)(s, log);
        },
      }),
    );
  }
  if (pathname === "/api/mode") {
    const m: AppMode = body.mode === "sample" ? "sample" : "live";
    if (m === "sample" && !fs.existsSync(spacePaths(await host.read("sample")).configFile)) throw new ApiError(400, 'No sample yet: press "Show me with sample data".');
    if (host.running()) throw new ApiError(409, "Wait for the running step to finish.");
    return ok({ mode: m }, 200, await host.setMode(m));
  }
  if (pathname === "/api/stage") {
    const id = String(body.prospectId ?? "");
    const stage = String(body.stage ?? "");
    if (!/^P-\d{5,}$/.test(id) || !["meeting", "listed", "lost", "nurture"].includes(stage)) throw new ApiError(400, "Pick a business and a stage.");
    const argv = ["stage", id, stage, ...(stage === "nurture" && typeof body.until === "string" ? ["--until", body.until] : [])];
    const lines: string[] = [];
    const code = await host.write((s) => runCli(argv, cliDeps(s, (l) => lines.push(l))));
    return ok({ ok: !code, log: lines }, code ? 400 : 200);
  }
  if (pathname === "/api/skip") {
    // A person decides not to email this business: it waits in hold with the reason, and scoring brings it back only if its records change.
    const id = String(body.prospectId ?? "");
    await host.write(async (s) => {
      const dataDir = spacePaths(s).dataDir;
      const stores = openStores(dataDir);
      const p = stores.prospects.rows().find((x) => x.prospect_id === id);
      if (!p) throw new ApiError(404, "Business not found.");
      if (p.status !== "scored") throw new ApiError(400, "Only a business waiting for its first email can be skipped.");
      stores.prospects.upsert([{ ...p, status: "hold", exclude_reason: `skipped by a person in the app on ${spaceToday(s)}`, updated_at: isoStamp(s.now) }]);
      const file = appFile(dataDir, "previews.json");
      const saved = readJson<Previews>(file);
      if (saved) writeJson(file, { ...saved, report: { ...saved.report, previews: saved.report.previews.filter((x) => x.prospectId !== id) } });
    });
    return ok({ ok: true });
  }
  if (pathname === "/api/suppress") {
    const email = String(body.email ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "Enter an email address.");
    const lines: string[] = [];
    const code = await host.write((s) => runCli(["suppress", email, "--reason", "do_not_contact"], cliDeps(s, (l) => lines.push(l))));
    return ok({ ok: !code, log: lines }, code ? 400 : 200);
  }
  if (pathname === "/api/settings") {
    // A person edits the settings here; nothing is filled in for them. Bad JSON or a bad field is refused, naming it.
    const text = String(body.text ?? "");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new ApiError(400, `The settings are not valid JSON: ${(err as Error).message}`);
    }
    try {
      parseConfig(raw, "The settings");
    } catch (err) {
      throw new ApiError(400, err instanceof ConfigError ? err.message : String(err));
    }
    await host.write(async (s) => {
      const file = spacePaths(s).configFile;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
    });
    return ok({ ok: true });
  }
  if (pathname === "/api/open") {
    if (!host.open) throw new ApiError(400, "The hosted app has no folders to open: everything is in its database.");
    const s = await host.read();
    const p = spacePaths(s);
    // Fixed places only: the request names one, never a path.
    const where: Record<string, string> = { settings: p.configFile, data: p.dataDir, outbox: path.join(p.dataDir, "outbox"), reports: path.join(p.dataDir, "reports"), handoffs: path.join(p.dataDir, "handoffs") };
    const target = where[String(body.what ?? "")];
    if (!target) throw new ApiError(400, "Unknown place");
    if (!fs.existsSync(target)) throw new ApiError(404, `${path.relative(s.root, target)} does not exist yet.`);
    host.open(target);
    return ok({ ok: true, path: path.relative(s.root, target) });
  }
  throw new ApiError(404, "Unknown request");

  function send(r: { status: number; job: JobView; headers?: Record<string, string> }) {
    return ok({ job: r.job }, r.status, r.headers);
  }
}
