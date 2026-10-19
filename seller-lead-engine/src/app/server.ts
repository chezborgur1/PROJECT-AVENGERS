import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PACKAGE_ROOT } from "../cli.ts";
import { engineEnv } from "../config.ts";
import { api, ApiError, jobLogger, newJob, saveLastJob, spaceNow, type ApiHost, type AppDeps, type AppMode, type JobView, type Space } from "./api.ts";

// The desktop app: one window with a button for every step and tables that
// track everything, so nobody types commands. A small web server on this
// computer only (127.0.0.1), serving one page and the JSON API in api.ts,
// which runs the same commands the CLI runs, in this process.
//
// Safety: it listens on the loopback address only, and every API call must
// carry the random key created at start-up (it is in the address the app
// opens), so no other web page or program can drive it.

export type { AppMode } from "./api.ts";

export interface AppOptions {
  /** The engine folder (config/, data/, templates/). */
  root?: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
  /** The clock; tests pass a fixed one. */
  clock?: () => Date;
  /** Optional stubs, passed through to the commands (tests). */
  deps?: AppDeps;
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

/** The app's one page. */
export const UI_FILE = path.join(import.meta.dirname, "ui.html");
const MAX_BODY = 64 * 1024;
/** The page's Content-Security-Policy: its own inline script and style, and calls back to where it came from. */
export const CSP = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'";

/** The page with its key filled in. */
export function pageHtml(token: string): string {
  return fs.readFileSync(UI_FILE, "utf8").replace("__APP_TOKEN__", token);
}

/** Start the app's server. Resolves once it is listening. */
export async function startApp(opts: AppOptions = {}): Promise<RunningApp> {
  const root = opts.root ?? PACKAGE_ROOT;
  const baseEnv = opts.env ?? process.env;
  const clock = opts.clock ?? (() => new Date());
  const token = opts.token ?? crypto.randomBytes(18).toString("base64url");
  const sampleDir = path.join(root, "data-sample");
  let mode: AppMode = "live";
  let job: JobView | undefined;
  let jobSeq = 0;

  const envFor = (m: AppMode): NodeJS.ProcessEnv =>
    m === "sample" ? { ...baseEnv, LEAD_ENGINE_DATA_DIR: sampleDir, LEAD_ENGINE_CONFIG: path.join(sampleDir, "engine.config.json") } : baseEnv;
  const spaceFor = (m: AppMode): Space => {
    const env = envFor(m);
    return { mode: m, root, env, now: spaceNow(m, engineEnv(root, env).dataDir, clock), ...(opts.deps ? { deps: opts.deps } : {}) };
  };

  // Files on this computer: reads and writes go straight to them, and one step runs at a time, in the background.
  const host: ApiHost = {
    hosted: false,
    mode: () => mode,
    read: async (m) => spaceFor(m ?? mode),
    write: async (fn, m) => fn(spaceFor(m ?? mode)),
    running: () => (job?.running ? job : undefined),
    setMode: async (m) => {
      mode = m;
      return {};
    },
    open: opts.open ?? ((t: string) => openPath(t)),
    job: async (spec) => {
      if (job?.running) throw new ApiError(409, `"${job.label}" is still running. Wait for it to finish.`);
      const s = spaceFor(spec.mode ?? mode);
      const j = newJob(spec.action, spec.label, s.now, String(++jobSeq));
      job = j;
      const log = jobLogger(j);
      spec
        .run(s, log)
        .then((code) => {
          j.code = code;
          if (code === 0 && spec.then) mode = spec.then;
        })
        .catch((err) => {
          log(`Stopped: ${(err as Error).message}`);
          j.code = 1;
        })
        .finally(() => {
          j.running = false;
          try {
            saveLastJob(s, j);
          } catch {
            // The log stays in memory for this session either way.
          }
        });
      return { status: 202, job: j };
    },
  };

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") {
      // The page is served only with the key, which it then sends back on every call.
      if (url.searchParams.get("t") !== token) return send(res, 403, "text/plain", "Open the app with the address it printed when it started.");
      return send(res, 200, "text/html; charset=utf-8", pageHtml(token), { "Content-Security-Policy": CSP });
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, "text/plain", "Not found");
    if (req.headers["x-app-token"] !== token) return send(res, 403, "application/json", JSON.stringify({ error: "Missing or wrong app key" }));
    try {
      const body = req.method === "POST" ? await readBody(req) : {};
      const r = await api(host, req.method ?? "GET", url.pathname, url.searchParams, body);
      return send(res, r.status, "application/json", JSON.stringify(r.body), r.headers);
    } catch (err) {
      return send(res, err instanceof ApiError ? err.status : 500, "application/json", JSON.stringify({ error: (err as Error).message }));
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => send(res, 500, "application/json", JSON.stringify({ error: (err as Error).message })));
  });
  const port = await listen(server, opts.port ?? 4747);
  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    port,
    token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Write a response with the headers every answer carries. */
export function send(res: http.ServerResponse, status: number, type: string, body: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(body);
}

/** Read a request body of at most 64 KB: JSON, or a form (the hosted sign-in). */
export function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, "Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) return resolve({});
      if (String(req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded")) return resolve(Object.fromEntries(new URLSearchParams(text)));
      try {
        const v = JSON.parse(text);
        resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {});
      } catch {
        reject(new ApiError(400, "Send JSON"));
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
