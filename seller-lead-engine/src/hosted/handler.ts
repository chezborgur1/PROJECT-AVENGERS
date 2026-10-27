import crypto from "node:crypto";
import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { ACTIONS, api, ApiError, jobLogger, newJob, runCommands, saveLastJob, spaceNow, type ApiHost, type AppDeps, type AppMode, type JobSpec, type JobView, type Space } from "../app/api.ts";
import { bodyLimit, CSP, pageHtml, readBody, send } from "../app/server.ts";
import type { Db } from "./db.ts";
import { Mirror, MirrorRefused, type Layout, type Snapshot } from "./mirror.ts";

// The hosted app: the desktop app's page and requests (src/app/api.ts),
// served from a server, with the data in Postgres (mirror.ts) instead of on
// one computer. Anyone with the address can reach it, so everything but the
// health check needs the team password: a signed session cookie, plus a key
// derived from it on every request, so another site cannot make the
// browser act for a signed-in person.
//
// A step runs inside its request, holding the write lease, and is saved
// before the answer goes back. Each step stays inside the hosting limit
// (five minutes on Vercel): the long ones stop early and continue on the
// next press (ACTIONS[...].hosted).

export interface HostedOptions {
  db: Db;
  env?: NodeJS.ProcessEnv;
  clock?: () => Date;
  deps?: AppDeps;
  /** Where spaces are rebuilt (the instance's temporary folder). */
  tmpDir?: string;
  /** Allow cookies over plain http (the local preview only). */
  insecure?: boolean;
  /** Seconds a step may hold the write lease: the hosting time limit plus a margin. */
  leaseSeconds?: number;
  /** Pause after a wrong password, in milliseconds (tests pass 0). */
  failDelayMs?: number;
}

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;

const MONTH = 30 * 24 * 3600;
const MIN_PASSWORD = 10;

/** Build the request handler. One per instance; it keeps the rebuilt folders between requests. */
export function createHostedHandler(opts: HostedOptions): Handler {
  const env = { ...(opts.env ?? process.env) };
  const clock = opts.clock ?? (() => new Date());
  const tmp = opts.tmpDir ?? path.join(os.tmpdir(), "amb-seller-leads");
  const lease = opts.leaseSeconds ?? 330;
  const failDelay = opts.failDelayMs ?? 1500;
  const mirror = new Mirror(opts.db);
  const password = env.APP_PASSWORD ?? "";
  const secret = env.SESSION_SECRET || crypto.createHash("sha256").update(`amb-seller-leads-session:${password}`).digest("hex");
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${MONTH}${opts.insecure ? "" : "; Secure"}`;
  const failures = new Map<string, { count: number; since: number }>();

  // Gmail credentials come from an environment variable here: write them where the engine looks for its tokens file.
  if (env.GMAIL_TOKENS_JSON) {
    fs.mkdirSync(tmp, { recursive: true });
    const file = path.join(tmp, "gmail-tokens.json");
    fs.writeFileSync(file, env.GMAIL_TOKENS_JSON, { mode: 0o600 });
    env.GMAIL_TOKENS_FILE = file;
  }

  const layoutOf = (mode: AppMode): Layout => {
    const root = path.join(tmp, mode);
    return { root, dataDir: path.join(root, "data") };
  };
  const envOf = (mode: AppMode, l: Layout): NodeJS.ProcessEnv => ({
    ...env,
    LEAD_ENGINE_DATA_DIR: l.dataDir,
    // The sample keeps its settings in its data folder, as the demo writes them.
    LEAD_ENGINE_CONFIG: mode === "sample" ? path.join(l.dataDir, "engine.config.json") : path.join(l.root, "config", "engine.config.json"),
  });
  const spaceOf = (mode: AppMode, l: Layout): Space => ({ mode, root: l.root, env: envOf(mode, l), now: spaceNow(mode, l.dataDir, clock), ...(opts.deps ? { deps: opts.deps } : {}) });

  // This instance's copy of each space, rebuilt only when the database has moved on. One rebuild at a time.
  const snaps = new Map<AppMode, Snapshot>();
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => undefined);
    return p;
  };
  const ready = (mode: AppMode): Promise<Layout> =>
    exclusive(async () => {
      const l = layoutOf(mode);
      const v = await mirror.version(mode);
      const snap = snaps.get(mode);
      if (!snap || snap.version !== v || !fs.existsSync(l.dataDir)) snaps.set(mode, await mirror.hydrate(mode, l));
      return l;
    });

  async function write<T>(mode: AppMode, fn: (s: Space) => Promise<T>): Promise<T> {
    const holder = crypto.randomUUID();
    if (!(await mirror.lock(mode, holder, lease))) throw new ApiError(409, "Another step is running right now, maybe from another computer. Try again in a minute.");
    try {
      const l = await ready(mode);
      let out: T | undefined;
      let failure: unknown;
      try {
        out = await fn(spaceOf(mode, l));
      } catch (err) {
        failure = err;
      }
      // Save what the step did even when it failed partway: an email it drafted must be on record.
      try {
        snaps.set(mode, await mirror.persist(mode, l, snaps.get(mode)!));
      } catch (err) {
        snaps.delete(mode); // the next request rebuilds from the database
        failure ??= err;
      }
      fs.rmSync(path.join(l.dataDir, "downloads"), { recursive: true, force: true });
      if (failure !== undefined) throw failure;
      return out as T;
    } finally {
      await mirror.unlock(mode, holder).catch(() => undefined);
    }
  }

  function hostFor(mode: AppMode): ApiHost {
    const setMode = async (m: AppMode) => ({ "Set-Cookie": m === "sample" ? `amb_mode=sample; ${cookieFlags}` : `amb_mode=; ${cookieFlags.replace(`Max-Age=${MONTH}`, "Max-Age=0")}` });
    return {
      hosted: true,
      mode: () => mode,
      read: async (m) => spaceOf(m ?? mode, await ready(m ?? mode)),
      write: (fn, m) => write(m ?? mode, fn),
      running: () => undefined,
      setMode,
      job: async (spec: JobSpec) => {
        let j: JobView | undefined;
        await write(spec.mode ?? mode, async (s) => {
          j = newJob(spec.action, spec.label, s.now, crypto.randomUUID());
          const log = jobLogger(j);
          try {
            j.code = await spec.run(s, log);
          } catch (err) {
            log(`Stopped: ${(err as Error).message}`);
            j.code = 1;
          }
          j.running = false;
          saveLastJob(s, j);
        });
        const headers = j!.code === 0 && spec.then ? await setMode(spec.then) : undefined;
        return { status: 200, job: j!, ...(headers ? { headers } : {}) };
      },
    };
  }

  // ---------------------------------------------------------------- sign-in

  const sign = (value: string) => crypto.createHmac("sha256", secret).update(value).digest("base64url");
  const same = (a: string, b: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  /** The session's expiry (seconds) when the cookie is genuine and current. */
  const session = (req: http.IncomingMessage): number | undefined => {
    const [exp, sig] = (cookies(req).amb_session ?? "").split(".");
    const n = Number(exp);
    if (!exp || !sig || !Number.isFinite(n) || n * 1000 < clock().getTime()) return undefined;
    return same(sig, sign(`s:${exp}`)) ? n : undefined;
  };
  const pageKey = (exp: number) => sign(`c:${exp}`);

  async function login(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const who = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0]!.trim();
    const f = failures.get(who);
    const now = clock().getTime();
    if (f && now - f.since < 10 * 60_000 && f.count >= 20) return send(res, 429, "text/html; charset=utf-8", loginPage("Too many wrong passwords from here. Wait ten minutes."), headers());
    const body = await readBody(req);
    const given = crypto.createHash("sha256").update(String(body.password ?? "")).digest();
    const wanted = crypto.createHash("sha256").update(password).digest();
    if (!crypto.timingSafeEqual(given, wanted)) {
      failures.set(who, f && now - f.since < 10 * 60_000 ? { count: f.count + 1, since: f.since } : { count: 1, since: now });
      await new Promise((r) => setTimeout(r, failDelay));
      return send(res, 401, "text/html; charset=utf-8", loginPage("That password is not right."), headers());
    }
    failures.delete(who);
    const exp = Math.floor(now / 1000) + MONTH;
    return send(res, 303, "text/plain", "Signed in", { ...headers(), Location: "/", "Set-Cookie": `amb_session=${exp}.${sign(`s:${exp}`)}; ${cookieFlags}` });
  }

  const headers = (): Record<string, string> => ({
    "Content-Security-Policy": CSP,
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    ...(opts.insecure ? {} : { "Strict-Transport-Security": "max-age=31536000" }),
  });

  // ---------------------------------------------------------------- requests

  return async function handle(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      // The host sends every path to this one function and passes the original path along (build-vercel.mts).
      const rewritten = url.searchParams.get("__pathname");
      if (rewritten !== null) url.searchParams.delete("__pathname");
      const pathname = rewritten || url.pathname;
      const method = req.method ?? "GET";

      if (pathname === "/api/health") {
        let database = "connected";
        try {
          await mirror.version("live");
        } catch (err) {
          // The error code only: the full message can name the database's host.
          database = `not reachable (${(err as { code?: string }).code ?? "error"})`;
        }
        return send(res, 200, "application/json", JSON.stringify({ ok: database === "connected" && password.length >= MIN_PASSWORD, database, password_set: password.length >= MIN_PASSWORD }));
      }
      if (password.length < MIN_PASSWORD) {
        return send(res, 503, "text/html; charset=utf-8", setupPage(`Set APP_PASSWORD (at least ${MIN_PASSWORD} characters) in the Vercel project's Settings, Environment Variables, then redeploy. Everyone on the team signs in with it.`), headers());
      }
      if (pathname === "/api/cron/replies") {
        // Vercel's scheduler sends CRON_SECRET; without it set, the daily check stays off.
        if (!env.CRON_SECRET || !same(String(req.headers.authorization ?? ""), `Bearer ${env.CRON_SECRET}`)) return send(res, 401, "application/json", JSON.stringify({ error: "Not allowed" }));
        const a = ACTIONS.replies!;
        const r = await hostFor("live").job({ action: "replies", label: a.label, run: runCommands(a.hosted ?? a.commands) });
        return send(res, 200, "application/json", JSON.stringify({ code: r.job.code }));
      }
      if (pathname === "/login") {
        if (method === "POST") return await login(req, res);
        return send(res, 200, "text/html; charset=utf-8", loginPage(""), headers());
      }
      if (pathname === "/logout") {
        return send(res, 303, "text/plain", "Signed out", { ...headers(), Location: "/login", "Set-Cookie": `amb_session=; ${cookieFlags.replace(`Max-Age=${MONTH}`, "Max-Age=0")}` });
      }

      const exp = session(req);
      if (pathname === "/" && method === "GET") {
        if (!exp) return send(res, 303, "text/plain", "Sign in", { ...headers(), Location: "/login" });
        return send(res, 200, "text/html; charset=utf-8", pageHtml(pageKey(exp)), headers());
      }
      if (!pathname.startsWith("/api/")) return send(res, 404, "text/plain", "Not found", headers());
      if (!exp) return send(res, 401, "application/json", JSON.stringify({ error: "Signed out: reload the page and sign in again." }));
      if (!same(String(req.headers["x-app-token"] ?? ""), pageKey(exp))) return send(res, 403, "application/json", JSON.stringify({ error: "Missing or wrong page key: reload the page." }));

      const mode: AppMode = cookies(req).amb_mode === "sample" ? "sample" : "live";
      const body = method === "POST" ? await readBody(req, bodyLimit(pathname)) : {};
      const r = await api(hostFor(mode), method, pathname, url.searchParams, body);
      return send(res, r.status, "application/json", JSON.stringify(r.body), r.headers);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : err instanceof MirrorRefused ? 409 : 500;
      if (!res.headersSent) send(res, status, "application/json", JSON.stringify({ error: (err as Error).message }));
    }
  };
}

/** A request's cookies by name. */
function cookies(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const PAGE_STYLE = `
  :root { --bg: #f6f5f3; --panel: #fff; --ink: #1d1b1a; --muted: #6b6560; --line: #e4e0db; --accent: #7b0000; --accent-ink: #fff; --bad: #9b1c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161413; --panel: #201d1c; --ink: #ece8e4; --muted: #a39b94; --line: #35302d; --accent: #c25a5a; --accent-ink: #160b0b; --bad: #f08a8a; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--bg); color: var(--ink); font: 15px/1.45 "Segoe UI", system-ui, -apple-system, Arial, sans-serif; }
  .box { width: 100%; max-width: 380px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
  h1 { font-size: 19px; margin: 0 0 4px; } h1 span { color: var(--accent); }
  p { color: var(--muted); margin: 0 0 16px; }
  input { width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--ink); margin-bottom: 12px; }
  button { width: 100%; font: inherit; font-weight: 600; padding: 9px; border: 0; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer; }
  .err { color: var(--bad); margin: 0 0 12px; }`;

/** The sign-in page. */
function loginPage(error: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AMB Seller Leads</title><style>${PAGE_STYLE}</style></head>
<body><form class="box" method="post" action="/login">
<h1>AMB <span>Seller Leads</span></h1><p>Sign in with the team password.</p>
${error ? `<p class="err">${esc(error)}</p>` : ""}
<input type="password" name="password" autocomplete="current-password" placeholder="Team password" required autofocus>
<button type="submit">Sign in</button></form></body></html>`;
}

/** The page shown until the app is set up. */
function setupPage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AMB Seller Leads</title><style>${PAGE_STYLE}</style></head>
<body><div class="box"><h1>AMB <span>Seller Leads</span></h1><p>${esc(message)}</p></div></body></html>`;
}
