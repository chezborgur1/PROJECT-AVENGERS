import http from "node:http";
import path from "node:path";
import { PACKAGE_ROOT } from "../cli.ts";
import { databaseUrl, pgDb, pgliteDb, type Db } from "./db.ts";
import { createHostedHandler } from "./handler.ts";

// The hosted app on this computer, to try it before deploying:
// npm run hosted:dev. It uses DATABASE_URL when set (your real database:
// careful), otherwise a throwaway Postgres in data-hosted-dev/ (PGlite).
// Cookies work over plain http here only.

const env = { ...process.env };
env.APP_PASSWORD ||= "dev-password-only";
let db: Db;
const url = databaseUrl(env);
if (url) db = await pgDb(url);
else {
  const { PGlite } = await import("@electric-sql/pglite");
  db = pgliteDb(new PGlite(path.join(PACKAGE_ROOT, "data-hosted-dev")));
}
const handler = createHostedHandler({ db, env, insecure: true, tmpDir: path.join(PACKAGE_ROOT, "data-hosted-dev-tmp") });
const port = Number(env.PORT || 4848);
http.createServer((req, res) => void handler(req, res)).listen(port, "127.0.0.1", () => {
  console.log(`Hosted app preview: http://127.0.0.1:${port}/ (password: ${process.env.APP_PASSWORD ? "your APP_PASSWORD" : env.APP_PASSWORD})`);
  console.log(url ? "Database: DATABASE_URL" : "Database: PGlite in data-hosted-dev/ (delete the folder to start over)");
});
