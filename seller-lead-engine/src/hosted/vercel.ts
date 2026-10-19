import type http from "node:http";
import { databaseUrl, pgDb } from "./db.ts";
import { createHostedHandler, type Handler } from "./handler.ts";

// The Vercel function: every path of the site comes here (the routes in
// .vercel/output/config.json, written by scripts/build-vercel.mts). The
// handler is built once per instance and reused while the instance is warm.

let handler: Promise<Handler> | undefined;

/** Vercel calls this with Node's own request and response. */
export default async function vercel(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  handler ??= (async () => {
    const url = databaseUrl(process.env);
    if (!url) return noDatabase;
    return createHostedHandler({ db: await pgDb(url), env: process.env });
  })().catch((err) => {
    handler = undefined; // try again on the next request
    throw err;
  });
  return (await handler)(req, res);
}

/** Until a database is connected, every page says how to connect one. */
const noDatabase: Handler = async (_req, res) => {
  res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end("AMB Seller Leads needs its database: in Vercel, open this project, Storage, connect your Postgres database (it sets DATABASE_URL or POSTGRES_URL), then redeploy.");
};
