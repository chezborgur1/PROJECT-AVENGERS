import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { REPO, tmpDir } from "./helpers.ts";

// The Vercel build end to end: bundle, copy the run-time files, write the
// routes, then load the function from a folder with no node_modules (as
// Vercel runs it) and ask it for a page.

describe("build-vercel", () => {
  it("builds one self-contained function that answers without a database by saying how to connect one", async () => {
    const out = tmpDir("lead-engine-build-");
    execFileSync(process.execPath, [path.join(REPO, "node_modules/tsx/dist/cli.mjs"), path.join(REPO, "scripts/build-vercel.mts")], { env: { ...process.env, BUILD_OUTPUT_DIR: out }, stdio: "pipe" });
    const config = JSON.parse(fs.readFileSync(path.join(out, "config.json"), "utf8"));
    expect(config).toMatchObject({ version: 3, routes: [{ src: "^/(.*)$", dest: "/app?__pathname=/$1" }] });
    const func = path.join(out, "functions/app.func");
    expect(JSON.parse(fs.readFileSync(path.join(func, ".vc-config.json"), "utf8"))).toMatchObject({ runtime: "nodejs22.x", handler: "index.mjs", maxDuration: 300 });
    for (const f of ["templates/sequence/step-1.md", "reference", "samples/tampa-bay", "config/engine.config.example.json", "src/app/ui.html"]) expect(fs.existsSync(path.join(func, f)), f).toBe(true);

    const saved = { DATABASE_URL: process.env.DATABASE_URL, POSTGRES_URL: process.env.POSTGRES_URL, POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL };
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.POSTGRES_PRISMA_URL;
    try {
      const { default: handler } = (await import(pathToFileURL(path.join(func, "index.mjs")).href)) as { default: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> };
      const server = http.createServer((req, res) => void handler(req, res));
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const res = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/app?__pathname=/`);
      expect(res.status).toBe(503);
      expect(await res.text()).toMatch(/connect your Postgres database/);
      await new Promise<void>((r) => server.close(() => r()));
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
    }
  });
});
