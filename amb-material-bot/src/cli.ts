#!/usr/bin/env -S npx tsx
// amb-bot: the material creation bot.
//
//   amb-bot list                       show the queue (P1 requests with status new/rerun)
//   amb-bot run                        build materials for every request in the queue
//   amb-bot run --id REQ-0001          build one request (any status)
//   amb-bot run --priority P2          include P2 as well as P1
//   amb-bot run --force                rebuild even if status is done
//   amb-bot run --no-update            don't write status back to the request list
//   amb-bot qbo-connect <realmId>      connect a client's QuickBooks Online company
//   amb-bot qbo-token <code> <realmId> finish connecting (paste the code from the redirect)

import "dotenv/config";
import path from "node:path";
import { CsvRequestStore, buildQueue } from "./requests/csvStore.ts";
import { PRIORITIES } from "./requests/schema.ts";
import { NeedsInfoError, processRequest } from "./pipeline.ts";
import { authorizationUrl, exchangeCode } from "./ingest/quickbooksApi.ts";
import { claudeAvailable } from "./util/claude.ts";

const repoRoot = process.cwd();
const requestsFile = path.resolve(repoRoot, process.env.AMB_REQUESTS_FILE || "requests/high-priority-requests.csv");
const outputDir = path.resolve(repoRoot, process.env.AMB_OUTPUT_DIR || "output");
const firm = {
  name: process.env.AMB_FIRM_NAME || "AMB Advisory Services",
  contact: process.env.AMB_CONTACT_NAME || "",
  email: process.env.AMB_CONTACT_EMAIL || "",
  phone: process.env.AMB_CONTACT_PHONE || "",
};

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const store = new CsvRequestStore(requestsFile);

  switch (command) {
    case "list": {
      const { rows, invalid } = store.load();
      const maxPriority = (flag(args, "--priority") ?? "P1") as (typeof PRIORITIES)[number];
      const queue = buildQueue(rows, { maxPriority });
      console.log(`${rows.length} requests in ${path.relative(repoRoot, requestsFile)}; ${queue.length} queued (${maxPriority} and above, status new/rerun):\n`);
      for (const r of rows) {
        const mark = queue.includes(r) ? "→" : " ";
        console.log(`${mark} ${r.request_id}  ${r.priority}  ${r.status.padEnd(11)} due ${r.due_date || "–"}  ${r.code_name} (${r.business_name})`);
      }
      for (const bad of invalid) console.log(`✗ line ${bad.line} ${bad.requestId}: ${bad.error}`);
      return;
    }

    case "run": {
      const { rows, invalid } = store.load();
      for (const bad of invalid) console.warn(`Skipping invalid row (line ${bad.line}, ${bad.requestId}): ${bad.error}`);
      const ids = flag(args, "--id")?.split(",");
      const queue = buildQueue(rows, {
        ids,
        maxPriority: (flag(args, "--priority") ?? "P1") as (typeof PRIORITIES)[number],
        force: args.includes("--force"),
      });
      if (!queue.length) {
        console.log("Nothing to do: no queued requests. (`amb-bot list` shows the queue.)");
        return;
      }
      if (!claudeAvailable()) {
        console.log("Note: ANTHROPIC_API_KEY is not set. PDFs will be skipped and CIM copy will be templated.\n");
      }
      // --no-update leaves the request list untouched (demos, dry runs).
      const update: typeof store.update = args.includes("--no-update") ? () => {} : (id, patch) => store.update(id, patch);
      let failures = 0;
      for (const row of queue) {
        console.log(`\n▶ ${row.request_id} ${row.code_name} (${row.priority}, due ${row.due_date || "–"})`);
        update(row.request_id, { status: "in_progress", last_error: "" });
        try {
          const result = await processRequest(row, { repoRoot, outputDir, firm, log: console.log });
          update(row.request_id, {
            status: "done",
            output_folder: path.relative(repoRoot, result.folder),
            last_run: new Date().toISOString().slice(0, 16).replace("T", " "),
          });
          console.log(`✓ ${path.relative(repoRoot, result.folder)}`);
          console.log(`  ${result.verification.formulas} formulas verified; ${result.openQuestions.length} open questions; ${result.warnings.length} warnings`);
        } catch (err) {
          failures++;
          const message = (err as Error).message;
          update(row.request_id, {
            status: err instanceof NeedsInfoError ? "needs_info" : "error",
            last_error: message.slice(0, 500),
            last_run: new Date().toISOString().slice(0, 16).replace("T", " "),
          });
          console.error(`✗ ${row.request_id}: ${message}`);
        }
      }
      process.exitCode = failures ? 1 : 0;
      return;
    }

    case "qbo-connect": {
      const realm = args[0];
      if (!realm) throw new Error("Usage: amb-bot qbo-connect <realmId>");
      console.log("Open this URL, sign in to the client's QuickBooks company and approve access:\n");
      console.log(authorizationUrl(realm));
      console.log("\nThen run: amb-bot qbo-token <code-from-redirect-url> <realmId-from-redirect-url>");
      return;
    }

    case "qbo-token": {
      const [code, realm] = args;
      if (!code || !realm) throw new Error("Usage: amb-bot qbo-token <code> <realmId>");
      await exchangeCode(code, realm);
      console.log(`Connected QuickBooks realm ${realm}. Put ${realm} in the request's quickbooks_realm_id column.`);
      return;
    }

    default:
      console.log(`amb-bot: AMB material creation bot

  list [--priority P2]            show the request queue
  run  [--id REQ-0001] [--priority P2] [--force] [--no-update]
                                  build the model + CIM for queued requests
  qbo-connect <realmId>           connect a client's QuickBooks Online company
  qbo-token <code> <realmId>      finish the QuickBooks connection`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
