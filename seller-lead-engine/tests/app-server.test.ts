import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startApp, type RunningApp } from "../src/app/server.ts";
import { testConfig, tmpDir } from "./helpers.ts";

// The desktop app's server on a loopback port, against a temp folder: the
// key check, the settings checklist, the sample, the email preview and the
// drafts, the lead buttons and the one-job-at-a-time rule. Nothing leaves
// this computer: the sample is offline and the one download is a stub.

const TOKEN = "test-key";
const CLOCK = () => new Date("2026-10-20T15:00:00Z");
let app: RunningApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

type State = Record<string, any>;

async function call(method: string, route: string, body?: unknown, token: string | null = TOKEN): Promise<{ status: number; data: any; text: string; headers: Headers }> {
  const res = await fetch(`http://127.0.0.1:${app!.port}${route}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "x-app-token": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  return { status: res.status, data, text, headers: res.headers };
}

const state = async (): Promise<State> => (await call("GET", "/api/state")).data;

/** Start an action and wait for its job to finish; returns the finished job. */
async function run(action: string): Promise<State> {
  const started = await call("POST", "/api/action", { action });
  expect(started.status, JSON.stringify(started.data)).toBe(202);
  for (let i = 0; i < 300; i++) {
    const s = await state();
    if (s.job && s.job.id === started.data.job.id && !s.job.running) return s.job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`${action} did not finish`);
}

function liveRoot(): string {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "config", "engine.config.json"), JSON.stringify(testConfig()));
  return root;
}

describe("the app key", () => {
  it("serves the page only with the key, and puts the key in it", async () => {
    app = await startApp({ root: tmpDir(), port: 0, env: {}, clock: CLOCK, token: TOKEN });
    expect((await call("GET", "/", undefined, null)).status).toBe(403);
    expect((await call("GET", "/?t=wrong", undefined, null)).status).toBe(403);
    const page = await call("GET", `/?t=${TOKEN}`, undefined, null);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`const TOKEN = "${TOKEN}"`);
    expect(page.headers.get("content-security-policy")).toMatch(/default-src 'self'/);
    expect(app.url).toBe(`http://127.0.0.1:${app.port}/?t=${TOKEN}`);
  });

  it("refuses every API call without the right key", async () => {
    app = await startApp({ root: tmpDir(), port: 0, env: {}, clock: CLOCK, token: TOKEN });
    expect((await call("GET", "/api/state", undefined, null)).status).toBe(403);
    expect((await call("GET", "/api/state", undefined, "wrong")).status).toBe(403);
    expect((await call("POST", "/api/action", { action: "setup" }, null)).status).toBe(403);
  });
});

describe("settings", () => {
  it("asks for the settings file until it exists, then lists what still blocks sending", async () => {
    const root = tmpDir();
    app = await startApp({ root, port: 0, env: {}, clock: CLOCK, token: TOKEN });
    const before = await state();
    expect(before.configured).toBe(false);
    expect(before.setup[0].ok).toBe(false);
    const job = await run("setup");
    expect(job.code).toBe(0);
    expect(fs.existsSync(path.join(root, "config", "engine.config.json"))).toBe(true);
    const after = await state();
    expect(after.configured).toBe(true);
    // The example has no postal address or licensing sign-off, so drafts stay blocked.
    expect(after.ready_to_send).toBe(false);
    expect(after.setup.filter((i: State) => !i.ok).map((i: State) => i.check)).toEqual(expect.arrayContaining(["postal address", "licensed states"]));
  });

  it("opens only the fixed places it knows", async () => {
    const opened: string[] = [];
    const root = liveRoot();
    app = await startApp({ root, port: 0, env: {}, clock: CLOCK, token: TOKEN, open: (t) => opened.push(t) });
    expect((await call("POST", "/api/open", { what: "settings" })).status).toBe(200);
    expect(opened).toEqual([path.join(root, "config", "engine.config.json")]);
    expect((await call("POST", "/api/open", { what: "../../etc" })).status).toBe(400);
    expect((await call("POST", "/api/open", { what: "reports" })).status).toBe(404);
  });
});

describe("the sample", () => {
  it("builds the sample, previews today's emails without writing anything, then creates the drafts", async () => {
    const root = tmpDir();
    app = await startApp({ root, port: 0, env: {}, clock: CLOCK, token: TOKEN });
    expect((await run("sample")).code).toBe(0);
    let s = await state();
    expect(s.mode).toBe("sample");
    expect(s.businesses.length).toBeGreaterThan(5);
    expect(s.warm).toHaveLength(1);
    expect(s.warm[0].owner).not.toBe("");
    expect(s.warm[0].has_note).toBe(true);
    expect(s.replies.map((r: State) => r.kind)).toEqual(expect.arrayContaining(["interested", "opt-out", "asked if AI"]));

    const touches = path.join(root, "data-sample", "touches.csv");
    const before = fs.readFileSync(touches, "utf8");
    expect((await run("preview")).code).toBe(0);
    s = await state();
    expect(s.previews.report.previews.length).toBeGreaterThan(0);
    const email = s.previews.report.previews[0];
    expect(email.subject).not.toBe("");
    expect(email.body).toContain("AMB Advisory Services LLC");
    expect(fs.readFileSync(touches, "utf8")).toBe(before);

    expect((await run("drafts")).code).toBe(0);
    s = await state();
    expect(s.previews).toBeNull();
    expect(fs.readFileSync(touches, "utf8").trim().split("\n").length).toBeGreaterThan(before.trim().split("\n").length);
  });

  it("never goes online in the sample, and switches back to the real data", async () => {
    app = await startApp({ root: liveRoot(), port: 0, env: {}, clock: CLOCK, token: TOKEN });
    expect((await call("POST", "/api/mode", { mode: "sample" })).status).toBe(400);
    await run("sample");
    expect((await call("POST", "/api/action", { action: "find" })).status).toBe(400);
    expect((await call("POST", "/api/action", { action: "emails" })).status).toBe(400);
    expect((await call("POST", "/api/mode", { mode: "live" })).data.mode).toBe("live");
    const s = await state();
    expect(s.mode).toBe("live");
    expect(s.businesses).toEqual([]);
    expect(s.today).toBe("2026-10-20");
  });

  it("opens a handoff note, moves a lead on, skips a business and adds an address to do-not-contact", async () => {
    const root = tmpDir();
    app = await startApp({ root, port: 0, env: {}, clock: CLOCK, token: TOKEN });
    await run("sample");
    let s = await state();
    const lead = s.warm[0];
    const note = await call("GET", `/api/note?prospect=${lead.prospect_id}`);
    expect(note.status).toBe(200);
    expect(note.data.text).toContain(lead.business.split(" ")[0]);
    expect((await call("GET", "/api/note?prospect=P-99999")).status).toBe(404);

    expect((await call("POST", "/api/stage", { prospectId: lead.prospect_id, stage: "meeting" })).status).toBe(200);
    expect((await call("POST", "/api/stage", { prospectId: lead.prospect_id, stage: "warm" })).status).toBe(400);
    s = await state();
    expect(s.warm.find((l: State) => l.prospect_id === lead.prospect_id).stage_key).toBe("meeting");

    const ready = s.businesses.find((b: State) => b.status === "Ready to email");
    expect((await call("POST", "/api/skip", { prospectId: ready.prospect_id })).status).toBe(200);
    expect((await call("POST", "/api/skip", { prospectId: ready.prospect_id })).status).toBe(400);
    s = await state();
    expect(s.businesses.find((b: State) => b.prospect_id === ready.prospect_id).status).toBe("On hold");

    expect((await call("POST", "/api/suppress", { email: "not an address" })).status).toBe(400);
    expect((await call("POST", "/api/suppress", { email: "owner@nowhere.example" })).status).toBe(200);
    expect(fs.readFileSync(path.join(root, "data-sample", "suppression.csv"), "utf8")).toContain("owner@nowhere.example");
  });
});

describe("jobs", () => {
  it("runs one step at a time and keeps the log of a step that fails", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fetchImpl = (async () => {
      await gate;
      return new Response("<p>Moved</p>", { status: 200 });
    }) as typeof fetch;
    app = await startApp({ root: liveRoot(), port: 0, env: {}, clock: CLOCK, token: TOKEN, deps: { fetchImpl } });
    const first = await call("POST", "/api/action", { action: "find" });
    expect(first.status).toBe(202);
    const second = await call("POST", "/api/action", { action: "score" });
    expect(second.status).toBe(409);
    expect(second.data.error).toMatch(/still running/);
    release();
    let job: State | undefined;
    for (let i = 0; i < 200 && (!job || job.running); i++) {
      job = (await state()).job;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(job!.running).toBe(false);
    expect(job!.code).not.toBe(0);
    expect(job!.log.join("\n")).toMatch(/links to no \.csv/);
    expect((await call("POST", "/api/action", { action: "nonsense" })).status).toBe(400);
  });
});
