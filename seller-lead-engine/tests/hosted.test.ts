import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pgliteDb, type Db } from "../src/hosted/db.ts";
import { createHostedHandler, type HostedOptions } from "../src/hosted/handler.ts";
import { Mirror, MirrorRefused, type Layout } from "../src/hosted/mirror.ts";
import { openStores } from "../src/store/index.ts";
import { makeProspect, testConfig, tmpDir } from "./helpers.ts";

// The hosted app against PGlite (real Postgres, in memory): the mirror keeps
// a data folder in the database row by row, the write lease keeps steps
// apart, and the handler signs people in and runs the same requests as the
// desktop app. Nothing leaves this computer.

const PASSWORD = "correct horse battery";
const CLOCK = () => new Date("2026-10-20T15:00:00Z");
let db: Db;
const servers: http.Server[] = [];

beforeEach(async () => {
  db = pgliteDb(await PGlite.create());
});

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
  await db.end();
});

const layoutIn = (root: string): Layout => ({ root, dataDir: path.join(root, "data") });

describe("Mirror", () => {
  it("keeps a data folder in the database and rebuilds it identically elsewhere", async () => {
    const mirror = new Mirror(db);
    const a = layoutIn(tmpDir());
    const stores = openStores(a.dataDir);
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", business_name: "Alpha Air" }), makeProspect({ prospect_id: "P-00002", business_name: "Beta Plumbing" })]);
    fs.mkdirSync(path.join(a.root, "config"), { recursive: true });
    fs.writeFileSync(path.join(a.root, "config", "engine.config.json"), JSON.stringify(testConfig()));
    fs.mkdirSync(path.join(a.dataDir, "handoffs"), { recursive: true });
    fs.writeFileSync(path.join(a.dataDir, "handoffs", "P-00001.md"), "Note for Alpha Air\n");
    fs.mkdirSync(path.join(a.dataDir, "downloads", "2026-10-20"), { recursive: true });
    fs.writeFileSync(path.join(a.dataDir, "downloads", "2026-10-20", "big.csv"), "raw state file");

    const empty = await mirror.hydrate("live", a);
    expect(empty.version).toBe(0);
    // hydrate replaced the folder: write the files again, as a step would have.
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", business_name: "Alpha Air" }), makeProspect({ prospect_id: "P-00002", business_name: "Beta Plumbing" })]);
    fs.mkdirSync(path.join(a.root, "config"), { recursive: true });
    fs.writeFileSync(path.join(a.root, "config", "engine.config.json"), JSON.stringify(testConfig()));
    fs.mkdirSync(path.join(a.dataDir, "handoffs"), { recursive: true });
    fs.writeFileSync(path.join(a.dataDir, "handoffs", "P-00001.md"), "Note for Alpha Air\n");
    fs.mkdirSync(path.join(a.dataDir, "downloads"), { recursive: true });
    fs.writeFileSync(path.join(a.dataDir, "downloads", "big.csv"), "raw state file");
    const saved = await mirror.persist("live", a, empty);
    expect(saved.version).toBe(1);

    const b = layoutIn(tmpDir());
    const back = await mirror.hydrate("live", b);
    expect(back.version).toBe(1);
    expect(fs.readFileSync(path.join(b.dataDir, "prospects.csv"), "utf8")).toBe(fs.readFileSync(path.join(a.dataDir, "prospects.csv"), "utf8"));
    expect(fs.readFileSync(path.join(b.dataDir, "handoffs", "P-00001.md"), "utf8")).toBe("Note for Alpha Air\n");
    expect(fs.existsSync(path.join(b.root, "config", "engine.config.json"))).toBe(true);
    // Raw downloads never go to the database.
    expect(fs.existsSync(path.join(b.dataDir, "downloads"))).toBe(false);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM amb_prospects");
    expect(rows[0]!.n).toBe(2);
  });

  it("writes only the rows that changed, keeps extra columns, and leaves the version alone when nothing changed", async () => {
    const mirror = new Mirror(db);
    const a = layoutIn(tmpDir());
    let snap = await mirror.hydrate("live", a);
    const stores = openStores(a.dataDir);
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001" }), makeProspect({ prospect_id: "P-00002" }), makeProspect({ prospect_id: "P-00003" })]);
    // An advisor's own column, added in a spreadsheet, survives the round trip.
    const file = path.join(a.dataDir, "prospects.csv");
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    fs.writeFileSync(file, `${[`${lines[0]},advisor_note`, ...lines.slice(1).map((l, i) => `${l},note ${i}\u0000`)].join("\n")}\n`);
    snap = await mirror.persist("live", a, snap);
    await db.query("UPDATE lead_engine_rows SET data = data || '{\"marker\":\"untouched\"}'::jsonb WHERE tbl = 'data/prospects.csv'");

    const p2 = stores.prospects.rows().find((p) => p.prospect_id === "P-00002")!;
    stores.prospects.upsert([{ ...p2, status: "hold" }]);
    snap = await mirror.persist("live", a, snap);
    expect(snap.version).toBe(2);
    const { rows } = await db.query<{ pos: number; marker: string | null; status: string; note: string }>(
      "SELECT pos, data->>'marker' AS marker, data->>'status' AS status, data->>'advisor_note' AS note FROM lead_engine_rows WHERE tbl = 'data/prospects.csv' ORDER BY pos",
    );
    // Only the changed row was rewritten (its marker is gone); the others kept theirs.
    expect(rows.map((r) => r.marker)).toEqual(["untouched", null, "untouched"]);
    expect(rows[1]!.status).toBe("hold");
    expect(rows[0]!.note).toBe("note 0");

    const same = await mirror.persist("live", a, snap);
    expect(same.version).toBe(2);
  });

  it("refuses a save that would shorten the real do-not-contact list", async () => {
    const mirror = new Mirror(db);
    const a = layoutIn(tmpDir());
    let snap = await mirror.hydrate("live", a);
    const stores = openStores(a.dataDir);
    const row = { value_type: "email", reason: "opt_out", source: "test", added_at: "2026-10-20T15:00:00Z" } as const;
    stores.suppression.append([{ value: "a@x.example", ...row }, { value: "b@x.example", ...row }]);
    snap = await mirror.persist("live", a, snap);
    fs.writeFileSync(path.join(a.dataDir, "suppression.csv"), fs.readFileSync(path.join(a.dataDir, "suppression.csv"), "utf8").trim().split("\n").slice(0, 2).join("\n") + "\n");
    await expect(mirror.persist("live", a, snap)).rejects.toBeInstanceOf(MirrorRefused);
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM amb_do_not_contact");
    expect(rows[0]!.n).toBe(2);
  });

  it("lets one step write at a time, and frees the lease when it ends or expires", async () => {
    const mirror = new Mirror(db);
    expect(await mirror.lock("live", "a", 60)).toBe(true);
    expect(await mirror.lock("live", "b", 60)).toBe(false);
    await mirror.unlock("live", "b"); // not the holder: no effect
    expect(await mirror.lock("live", "b", 60)).toBe(false);
    await mirror.unlock("live", "a");
    expect(await mirror.lock("live", "b", 60)).toBe(true);
    await db.query("UPDATE lead_engine_spaces SET lock_until = now() - interval '1 second'");
    expect(await mirror.lock("live", "c", 60)).toBe(true);
  });
});

/** A hosted handler on a loopback port, with a cookie jar per "browser". */
async function hosted(extra: Partial<HostedOptions> = {}) {
  const handler = createHostedHandler({ db, env: { APP_PASSWORD: PASSWORD, CRON_SECRET: "cron-secret" }, clock: CLOCK, tmpDir: tmpDir(), insecure: true, failDelayMs: 0, ...extra });
  const server = http.createServer((req, res) => void handler(req, res));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    browser() {
      const jar = new Map<string, string>();
      let key = "";
      const call = async (method: string, route: string, body?: unknown, headers: Record<string, string> = {}) => {
        const res = await fetch(base + route, {
          method,
          redirect: "manual",
          headers: { "Content-Type": typeof body === "string" ? "application/x-www-form-urlencoded" : "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), "x-app-token": key, ...headers },
          body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        });
        for (const c of res.headers.getSetCookie()) {
          const [pair] = c.split(";");
          const [k, v] = pair!.split("=");
          if (v) jar.set(k!, v);
          else jar.delete(k!);
        }
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          data = undefined;
        }
        return { status: res.status, text, data, location: res.headers.get("location") };
      };
      return {
        call,
        jar,
        async signIn() {
          const r = await call("POST", "/login", `password=${encodeURIComponent(PASSWORD)}`);
          expect(r.status).toBe(303);
          const page = await call("GET", "/");
          key = /const TOKEN = "([^"]+)"/.exec(page.text)![1]!;
        },
      };
    },
  };
}

describe("the hosted app", () => {
  it("shows only the health check and the sign-in page until someone signs in", async () => {
    const app = await hosted();
    const b = app.browser();
    expect((await b.call("GET", "/api/health")).data).toEqual({ ok: true, database: "connected", password_set: true });
    expect((await b.call("GET", "/")).location).toBe("/login");
    expect((await b.call("GET", "/api/state")).status).toBe(401);
    expect((await b.call("POST", "/login", "password=wrong")).status).toBe(401);
    await b.signIn();
    const s = await b.call("GET", "/api/state");
    expect(s.status).toBe(200);
    expect(s.data).toMatchObject({ hosted: true, mode: "live", configured: false });
  });

  it("refuses requests without the page key, and stays closed with no password set", async () => {
    const app = await hosted();
    const b = app.browser();
    await b.signIn();
    expect((await b.call("GET", "/api/state", undefined, { "x-app-token": "forged" })).status).toBe(403);
    const closed = await hosted({ env: {} });
    const c = closed.browser();
    expect((await c.call("GET", "/")).status).toBe(503);
    expect((await c.call("POST", "/login", "password=")).status).toBe(503);
  });

  it("builds the sample, previews and drafts its emails, and a second instance sees the same data", async () => {
    const app = await hosted();
    const b = app.browser();
    await b.signIn();
    const built = await b.call("POST", "/api/action", { action: "sample" });
    expect(built.status).toBe(200);
    expect(built.data.job).toMatchObject({ running: false, code: 0 });
    expect(b.jar.get("amb_mode")).toBe("sample");
    let s = (await b.call("GET", "/api/state")).data;
    expect(s.mode).toBe("sample");
    expect(s.warm).toHaveLength(1);

    expect((await b.call("POST", "/api/action", { action: "preview" })).data.job.code).toBe(0);
    s = (await b.call("GET", "/api/state")).data;
    expect(s.previews.report.previews.length).toBeGreaterThan(0);
    expect((await b.call("POST", "/api/action", { action: "drafts" })).data.job.code).toBe(0);

    // Another server instance (Vercel runs several) rebuilds the same data from the database.
    const other = await hosted();
    const c = other.browser();
    await c.signIn();
    c.jar.set("amb_mode", "sample");
    const seen = (await c.call("GET", "/api/state")).data;
    expect(seen.previews).toBeNull();
    expect(seen.job.label).toBe("Create today's Gmail drafts");
    expect(seen.businesses.map((x: { prospect_id: string }) => x.prospect_id)).toEqual(s.businesses.map((x: { prospect_id: string }) => x.prospect_id));
    expect((await c.call("POST", "/api/action", { action: "find" })).status).toBe(400);
    expect((await c.call("POST", "/api/open", { what: "data" })).status).toBe(400);
  });

  it("answers 409 while another step holds the data", async () => {
    const app = await hosted();
    const b = app.browser();
    await b.signIn();
    await new Mirror(db).lock("live", "someone else", 60);
    const r = await b.call("POST", "/api/action", { action: "setup" });
    expect(r.status).toBe(409);
    expect(r.data.error).toMatch(/Another step is running/);
  });

  it("saves settings only when they are valid", async () => {
    const app = await hosted();
    const b = app.browser();
    await b.signIn();
    const example = (await b.call("GET", "/api/settings")).data;
    expect(example.exists).toBe(false);
    expect((await b.call("POST", "/api/settings", { text: "{ nope" })).data.error).toMatch(/not valid JSON/);
    expect((await b.call("POST", "/api/settings", { text: JSON.stringify({ mailboxes: "x" }) })).data.error).toMatch(/mailboxes/);
    expect((await b.call("POST", "/api/settings", { text: JSON.stringify(testConfig(), null, 2) })).status).toBe(200);
    const s = (await b.call("GET", "/api/state")).data;
    expect(s.configured).toBe(true);
    expect(s.ready_to_send).toBe(true);
  });

  it("runs the daily replies check only for Vercel's scheduler", async () => {
    const app = await hosted();
    const b = app.browser();
    await b.signIn();
    await b.call("POST", "/api/settings", { text: JSON.stringify(testConfig()) });
    expect((await b.call("GET", "/api/cron/replies")).status).toBe(401);
    expect((await b.call("GET", "/api/cron/replies", undefined, { authorization: "Bearer wrong" })).status).toBe(401);
    const ok = await b.call("GET", "/api/cron/replies", undefined, { authorization: "Bearer cron-secret" });
    expect(ok.status).toBe(200);
    expect((await b.call("GET", "/api/state")).data.job.label).toBe("Check replies");
  });
});
