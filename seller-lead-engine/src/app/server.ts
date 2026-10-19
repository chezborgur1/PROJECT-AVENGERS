import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { engineEnv, loadConfig, type EngineConfig } from "../config.ts";
import type { LeadRow, ReplyClass } from "../domain/schema.ts";
import { runCli, engineTimeZone, PACKAGE_ROOT, SEND_BLOCKING_CHECKS, sendWindowBlock, TEMPLATES_DIR, type CliDeps } from "../cli.ts";
import { DEMO_DAYS, runDemo } from "../demo.ts";
import { dashboardData, STAGE_WORDS } from "../report/dashboard.ts";
import { preflight } from "../sending/preflight.ts";
import { runSend, type SendReport } from "../sending/run.ts";
import { MemoryTransport } from "../sending/transports.ts";
import { openStores } from "../store/index.ts";
import { isoStamp, localDate } from "../util/dates.ts";

// The desktop app: one window with a button for every step and tables that
// track everything, so nobody types commands. A small web server on this
// computer only (127.0.0.1), serving one page and a JSON API that runs the
// same commands the CLI runs, in this process.
//
// Safety: it listens on the loopback address only, and every API call must
// carry the random key created at start-up (it is in the address the app
// opens), so no other web page or program can drive it. Compliance is
// unchanged: the buttons call the same commands, so every gate, cap,
// suppression check and draft-only rule still applies.

/** Where the app reads and writes: the live data folder, or the sample folder the demo fills. */
export type AppMode = "live" | "sample";

/** The actions the buttons start, each as command lines run in order. */
export const ACTIONS: Readonly<Record<string, { label: string; commands: string[][] }>> = {
  setup: { label: "Create the settings file", commands: [["init"]] },
  find: { label: "Find new businesses", commands: [["download", "florida", "--import"]] },
  emails: { label: "Find emails", commands: [["enrich", "--discover"]] },
  score: { label: "Score businesses", commands: [["score"]] },
  drafts: { label: "Create today's Gmail drafts", commands: [["send"]] },
  replies: { label: "Check replies", commands: [["sync"], ["qualify"], ["handoff"]] },
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

interface Job {
  id: number;
  action: string;
  label: string;
  running: boolean;
  code: number | undefined;
  log: string[];
  startedAt: string;
}

export interface AppOptions {
  /** The engine folder (config/, data/, templates/). */
  root?: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
  /** The clock; tests pass a fixed one. */
  clock?: () => Date;
  /** Optional stubs, passed through to the commands (tests). */
  deps?: Partial<Pick<CliDeps, "fetchImpl" | "resolveMx" | "resolveTxt" | "transport" | "classify" | "sftp">>;
  /** The key the API demands; random when not given. */
  token?: string;
  /** Opens a file or folder for the person (tests pass a recorder). */
  open?: (target: string) => void;
}

/** A running app: its address (with the key) and a way to stop it. */
export interface RunningApp {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

const UI_FILE = path.join(import.meta.dirname, "ui.html");
const MAX_BODY = 64 * 1024;

/** Start the app's server. Resolves once it is listening. */
export async function startApp(opts: AppOptions = {}): Promise<RunningApp> {
  const root = opts.root ?? PACKAGE_ROOT;
  const baseEnv = opts.env ?? process.env;
  const clock = opts.clock ?? (() => new Date());
  const token = opts.token ?? crypto.randomBytes(18).toString("base64url");
  let mode: AppMode = "live";
  let job: Job | undefined;
  let jobSeq = 0;
  let previews:
    | { at: string; report: Pick<SendReport, "date" | "previews" | "blocked" | "failed"> & { skipped: { prospectId: string; reason: string }[]; sendDay: boolean; reason?: string; window?: string } }
    | undefined;

  const sampleDir = path.join(root, "data-sample");
  // The sample runs on its own calendar, so it reads the same on any real date:
  // the first day a follow-up is due after the demo's replies (mid-afternoon
  // Eastern), so "Prepare today's emails" has an email to show.
  let sampleNow = new Date(`${DEMO_DAYS.replies}T18:00:00Z`);
  const pickSampleDay = () => {
    const due = openStores(sampleDir)
      .prospects.rows()
      .filter((x) => x.status === "in_sequence" && x.next_touch_date >= DEMO_DAYS.replies)
      .map((x) => x.next_touch_date)
      .sort();
    sampleNow = new Date(`${due[0] ?? DEMO_DAYS.replies}T18:00:00Z`);
  };
  const now = () => (mode === "sample" ? sampleNow : clock());
  const envFor = (m: AppMode): NodeJS.ProcessEnv =>
    m === "sample" ? { ...baseEnv, LEAD_ENGINE_DATA_DIR: sampleDir, LEAD_ENGINE_CONFIG: path.join(sampleDir, "engine.config.json") } : baseEnv;
  const paths = () => engineEnv(root, envFor(mode));
  const config = (): EngineConfig | undefined => {
    try {
      return loadConfig(paths().configFile);
    } catch {
      return undefined;
    }
  };
  const today = () => localDate(now(), engineTimeZone(config()));
  const depsFor = (log: (line: string) => void): CliDeps => ({ cwd: root, env: envFor(mode), today: today(), now: now(), log, ...opts.deps });

  /** Start a job (one at a time); its log fills as the commands run. */
  function start(action: string, run: (log: (line: string) => void) => Promise<number>): Job {
    if (job?.running) throw new HttpError(409, `"${job.label}" is still running. Wait for it to finish.`);
    const label = ACTIONS[action]?.label ?? OTHER_LABELS[action] ?? action;
    const j: Job = { id: ++jobSeq, action, label, running: true, code: undefined, log: [], startedAt: isoStamp(now()) };
    job = j;
    const log = (line: string) => {
      j.log.push(...String(line).split("\n"));
      if (j.log.length > 2000) j.log.splice(0, j.log.length - 2000);
    };
    run(log)
      .then((code) => {
        j.code = code;
      })
      .catch((err) => {
        log(`Stopped: ${(err as Error).message}`);
        j.code = 1;
      })
      .finally(() => {
        j.running = false;
      });
    return j;
  }

  const runCommands = (commands: string[][]) => async (log: (line: string) => void) => {
    let worst = 0;
    for (const argv of commands) {
      log(`> ${argv.join(" ")}`);
      const code = await runCli(argv, depsFor(log)).catch((err) => {
        log((err as Error).message);
        return 1;
      });
      worst = Math.max(worst, code);
      log("");
    }
    return worst;
  };

  /** Today's emails as they would go out (a dry run: nothing is written or sent). */
  async function preview(log: (line: string) => void): Promise<number> {
    const c = config();
    if (!c) {
      log("Settings are missing: press \"Create the settings file\" first.");
      return 1;
    }
    const stores = openStores(paths().dataDir);
    const r = await runSend(stores, c, { today: today(), now: now(), transport: new MemoryTransport(), templatesDir: TEMPLATES_DIR, dryRun: true });
    const window = sendWindowBlock(c, now());
    previews = {
      at: isoStamp(now()),
      report: { date: r.date, previews: r.previews, blocked: r.blocked, failed: r.failed, skipped: r.plan.skipped, sendDay: r.plan.sendDay, ...(r.plan.reason ? { reason: r.plan.reason } : {}), ...(window ? { window } : {}) },
    };
    log(r.plan.sendDay ? `${r.previews.length} email(s) ready for today, ${r.blocked.length} blocked by the compliance checks, ${r.plan.skipped.length} left out.` : `Today is not a send day: ${r.plan.reason ?? ""}`);
    if (window) log(`Drafts can be created inside the sending window only: ${window}.`);
    return 0;
  }

  /** Everything the page shows. */
  async function state() {
    const c = config();
    const p = paths();
    const base = { mode, today: today(), configured: Boolean(c), configFile: path.relative(root, p.configFile), dataDir: path.relative(root, p.dataDir), job: job ? { ...job, log: job.log.slice(-400) } : null };
    if (!c) return { ...base, setup: [{ check: "settings file", ok: false, detail: `${path.relative(root, p.configFile)} does not exist yet` }] };
    const stores = openStores(p.dataDir);
    const items = await preflight(c, { today: today(), templatesDir: TEMPLATES_DIR, resolveTxt: async () => [] });
    const setup = items.filter((i) => SEND_BLOCKING_CHECKS.includes(i.check));
    const data = dashboardData(stores, c, { today: today() });
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
        size: view?.size ?? "",
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
    return {
      ...base,
      setup,
      ready_to_send: setup.every((s) => s.ok),
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
      previews: previews && previews.report.date === today() ? previews : null,
    };
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      // The page is served only with the key, which it then sends back on every call.
      if (url.searchParams.get("t") !== token) return send(res, 403, "text/plain", "Open the app with the address it printed when it started.");
      const html = fs.readFileSync(UI_FILE, "utf8").replace("__APP_TOKEN__", token);
      return send(res, 200, "text/html; charset=utf-8", html, { "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:" });
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, "text/plain", "Not found");
    if (req.headers["x-app-token"] !== token) return send(res, 403, "application/json", JSON.stringify({ error: "Missing or wrong app key" }));

    try {
      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, await state());
      if (req.method === "GET" && url.pathname === "/api/note") {
        const id = url.searchParams.get("prospect") ?? "";
        const stores = openStores(paths().dataDir);
        const l = stores.leads.rows().find((x) => x.prospect_id === id);
        if (!l?.handoff_file) throw new HttpError(404, "No handoff note for that business yet.");
        const file = path.resolve(stores.dataDir, l.handoff_file);
        if (!file.startsWith(path.resolve(stores.dir.handoffs) + path.sep) || !fs.existsSync(file)) throw new HttpError(404, "The handoff note file is missing.");
        return json(res, 200, { text: fs.readFileSync(file, "utf8") });
      }
      if (req.method !== "POST") throw new HttpError(405, "Use POST");
      const body = await readJson(req);

      if (url.pathname === "/api/action") {
        const action = String(body.action ?? "");
        if (action === "preview") return json(res, 202, { job: start("preview", preview) });
        if (action === "sample") {
          return json(
            res,
            202,
            {
              job: start("sample", async (log) => {
                fs.rmSync(sampleDir, { recursive: true, force: true });
                log("Building the fictional Tampa Bay sample (about 2 seconds)...");
                await runDemo({ log, today: localDate(clock(), "America/New_York"), now: clock(), dataDir: sampleDir });
                pickSampleDay();
                mode = "sample";
                previews = undefined;
                log(`The sample's calendar is set to ${localDate(sampleNow, "America/New_York")}, a day with a follow-up due.`);
                return 0;
              }),
            },
          );
        }
        const a = ACTIONS[action];
        if (!a) throw new HttpError(400, `Unknown action "${action}"`);
        // The sample is fictional and offline: nothing in it goes looking on the internet.
        if (mode === "sample" && (action === "find" || action === "emails")) throw new HttpError(400, "Switch to your real data first: the sample never goes online.");
        if (action === "drafts") previews = undefined;
        return json(res, 202, { job: start(action, runCommands(a.commands)) });
      }
      if (url.pathname === "/api/mode") {
        const m = body.mode === "sample" ? "sample" : "live";
        if (m === "sample" && !fs.existsSync(path.join(sampleDir, "engine.config.json"))) throw new HttpError(400, "No sample yet: press \"Show me with sample data\".");
        if (job?.running) throw new HttpError(409, "Wait for the running step to finish.");
        if (m === "sample") pickSampleDay();
        mode = m;
        previews = undefined;
        return json(res, 200, { mode });
      }
      if (url.pathname === "/api/stage") {
        const id = String(body.prospectId ?? "");
        const stage = String(body.stage ?? "");
        if (!/^P-\d{5,}$/.test(id) || !["meeting", "listed", "lost", "nurture"].includes(stage)) throw new HttpError(400, "Pick a business and a stage.");
        const argv = ["stage", id, stage, ...(stage === "nurture" && typeof body.until === "string" ? ["--until", body.until] : [])];
        const lines: string[] = [];
        const code = await runCli(argv, depsFor((l) => lines.push(l)));
        return json(res, code ? 400 : 200, { ok: !code, log: lines });
      }
      if (url.pathname === "/api/skip") {
        // A person decides not to email this business: it waits in hold with the reason, and scoring brings it back only if its records change.
        const id = String(body.prospectId ?? "");
        const stores = openStores(paths().dataDir);
        const p = stores.prospects.rows().find((x) => x.prospect_id === id);
        if (!p) throw new HttpError(404, "Business not found.");
        if (p.status !== "scored") throw new HttpError(400, "Only a business waiting for its first email can be skipped.");
        stores.prospects.upsert([{ ...p, status: "hold", exclude_reason: `skipped by a person in the app on ${today()}`, updated_at: isoStamp(now()) }]);
        if (previews) previews.report.previews = previews.report.previews.filter((x) => x.prospectId !== id);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/suppress") {
        const email = String(body.email ?? "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "Enter an email address.");
        const lines: string[] = [];
        const code = await runCli(["suppress", email, "--reason", "do_not_contact"], depsFor((l) => lines.push(l)));
        return json(res, code ? 400 : 200, { ok: !code, log: lines });
      }
      if (url.pathname === "/api/open") {
        // Fixed places only: the request names one, never a path.
        const p = paths();
        const where: Record<string, string> = { settings: p.configFile, data: p.dataDir, outbox: path.join(p.dataDir, "outbox"), reports: path.join(p.dataDir, "reports"), handoffs: path.join(p.dataDir, "handoffs") };
        const target = where[String(body.what ?? "")];
        if (!target) throw new HttpError(400, "Unknown place");
        if (!fs.existsSync(target)) throw new HttpError(404, `${path.relative(root, target)} does not exist yet.`);
        (opts.open ?? openPath)(target);
        return json(res, 200, { ok: true, path: path.relative(root, target) });
      }
      throw new HttpError(404, "Unknown request");
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json(res, status, { error: (err as Error).message });
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => json(res, 500, { error: (err as Error).message }));
  });
  const port = await listen(server, opts.port ?? 4747);
  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    port,
    token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: http.ServerResponse, status: number, type: string, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(body);
}

function json(res: http.ServerResponse, status: number, value: unknown): void {
  send(res, status, "application/json", JSON.stringify(value));
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) return resolve({});
      try {
        const v = JSON.parse(text);
        resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {});
      } catch {
        reject(new HttpError(400, "Send JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Listen on the loopback address, trying the next ports when one is taken (0 picks any free port). */
function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryPort = (p: number) => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port !== 0 && attempt++ < 20) tryPort(p + 1);
        else reject(err);
      });
      server.listen(p, "127.0.0.1", () => {
        const addr = server.address();
        resolve(typeof addr === "object" && addr ? addr.port : p);
      });
    };
    tryPort(port);
  });
}

/** Start a program without waiting for it; a missing program is ignored rather than crashing the app. */
function launch(cmd: string, args: string[]): void {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // Best effort: the page or the console shows the path either way.
  }
}

/** Open a file (the settings in Notepad on Windows) or a folder with the computer's own program. */
export function openPath(target: string, platform: NodeJS.Platform = process.platform): void {
  if (platform === "win32") launch(fs.statSync(target).isDirectory() ? "explorer.exe" : "notepad.exe", [target]);
  else launch(platform === "darwin" ? "open" : "xdg-open", [target]);
}

/** Where Edge or Chrome usually lives on Windows: their app mode gives a window with no address bar or tabs. */
function windowsAppBrowser(env: NodeJS.ProcessEnv): string | undefined {
  const roots = [env["ProgramFiles(x86)"], env.ProgramFiles, env.LOCALAPPDATA].filter((r): r is string => Boolean(r));
  const exes = ["Microsoft\\Edge\\Application\\msedge.exe", "Google\\Chrome\\Application\\chrome.exe"];
  for (const exe of exes) for (const r of roots) if (fs.existsSync(path.win32.join(r, exe))) return path.win32.join(r, exe);
  return undefined;
}

/**
 * Open the app in its own window: on Windows, Edge's app mode (Edge ships
 * with Windows 10 and 11) or Chrome's, else the default browser. Returns
 * without waiting.
 */
export function openWindow(url: string, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): void {
  if (platform === "win32") {
    const browser = windowsAppBrowser(env);
    if (browser) launch(browser, [`--app=${url}`]);
    else launch("cmd", ["/c", "start", "", url]);
  } else if (platform === "darwin") launch("open", [url]);
  else launch("xdg-open", [url]);
}
