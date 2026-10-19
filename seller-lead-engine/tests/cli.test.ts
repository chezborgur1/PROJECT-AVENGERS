import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cmdDaily,
  cmdEnrich,
  cmdExport,
  cmdInit,
  cmdPreflight,
  cmdQualify,
  cmdRecord,
  cmdSend,
  cmdStatus,
  cmdSuppress,
  EXAMPLE_CONFIG,
  runCli,
  UsageError,
  type CliDeps,
} from "../src/cli.ts";
import { loadConfig, type EngineConfig } from "../src/config.ts";
import { Suppression } from "../src/compliance/suppression.ts";
import { classifyReply } from "../src/replies/classify.ts";
import type { TouchRow } from "../src/domain/schema.ts";
import { DEMO_DAYS, runDemo } from "../src/demo.ts";
import { loadMultiples } from "../src/readiness/multiples.ts";
import { MemoryTransport } from "../src/sending/transports.ts";
import { openStores } from "../src/store/index.ts";
import { makeProspect, REPO, testConfig, tmpDir } from "./helpers.ts";

// The command line, called as functions with injected deps (no process is
// spawned): a temp folder as the working directory, a fixed clock, a log
// that collects lines, a DNS stub and an in-memory transport. Claude is
// mocked to count calls, so the demo can prove it never makes one.

let claudeCalls = 0;
vi.mock("../src/util/claude.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/util/claude.ts")>();
  return {
    ...real,
    claudeAvailable: () => true,
    claude: () => {
      claudeCalls++;
      throw new Error("no Claude in these tests");
    },
  };
});

const TODAY = "2026-10-20"; // a Tuesday; the test config's mailboxes are in cold week 5

/** A fresh working folder, deps with a fixed clock and a collecting log, and helpers to read what happened. */
function setup(config?: EngineConfig) {
  const cwd = tmpDir("lead-engine-cli-");
  const lines: string[] = [];
  const transport = new MemoryTransport();
  const deps: CliDeps = { cwd, env: {}, today: TODAY, now: new Date(`${TODAY}T13:00:00Z`), log: (l) => lines.push(l), resolveTxt: async () => [], transport };
  if (config) {
    fs.mkdirSync(path.join(cwd, "config"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "config/engine.config.json"), JSON.stringify(config));
  }
  const stores = openStores(path.join(cwd, "data"));
  return { cwd, deps, lines, transport, stores, out: () => lines.join("\n") };
}

function touch(over: Partial<TouchRow>): TouchRow {
  return {
    touch_id: "T-000001",
    prospect_id: "",
    kind: "outreach",
    step: 1,
    mailbox: "frank@ambadvisory-mail.example",
    to_email: "",
    subject: "Exit-readiness check for Example Air",
    body_sha256: "",
    planned_for: TODAY,
    status: "planned",
    mode: "draft",
    message_id: "",
    thread_id: "",
    draft_id: "",
    error: "",
    created_at: `${TODAY}T13:00:00Z`,
    updated_at: `${TODAY}T13:00:00Z`,
    ...over,
  };
}

describe("init", () => {
  it("creates data/ and config/engine.config.json from the example, and never overwrites a config", async () => {
    const { cwd, deps, out } = setup();
    expect(await cmdInit([], deps)).toBe(0);
    const file = path.join(cwd, "config/engine.config.json");
    expect(fs.readFileSync(file, "utf8")).toBe(fs.readFileSync(EXAMPLE_CONFIG, "utf8"));
    expect(fs.existsSync(path.join(cwd, "data/inbox/processed"))).toBe(true);
    expect(out()).toContain("firm.postal_address");

    fs.writeFileSync(file, '{"edited": true}');
    expect(await cmdInit([], deps)).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe('{"edited": true}');
    expect(out()).toContain("left as it is");
  });

  it("ships an example config that parses, sends nothing until counsel fills it, and names real multiples keys", () => {
    const config = loadConfig(EXAMPLE_CONFIG);
    expect(config.licensed_states).toEqual([]);
    expect(config.licensing_signoff).toBe("");
    expect(config.firm.postal_address).toBe("");
    expect(config.sending.mode).toBe("draft");
    expect(config.lead_sales.enabled).toBe(false);
    expect(Object.keys(config.verticals)).toEqual(["hvac", "plumbing", "electrical", "landscaping", "pest_control", "dental"]);
    const keys = new Set(loadMultiples(path.join(REPO, "reference/multiples.json")).map((r) => r.key));
    for (const v of Object.values(config.verticals)) expect(keys.has(v.multiples_key)).toBe(true);
    expect(config.metros.tampa_bay!.counties).toEqual(["Hillsborough", "Pinellas", "Pasco", "Polk", "Manatee", "Sarasota"]);
    expect(config.sending.holidays).toEqual(expect.arrayContaining(["2026-11-26", "2026-12-21", "2027-01-01", "2027-01-02", "2027-12-25"]));
    // Every mailbox sends from a separate domain, never the firm's own.
    for (const m of config.mailboxes) expect(m.email.endsWith(`@${config.firm.website}`)).toBe(false);
  });
});

describe("preflight", () => {
  it("fails, with exit code 1, while the postal address and licensed states are blank", async () => {
    const { deps, out } = setup();
    await cmdInit([], deps);
    expect(await cmdPreflight([], deps)).toBe(1);
    expect(out()).toMatch(/^FAIL {2}postal address: firm\.postal_address is blank/m);
    expect(out()).toMatch(/^FAIL {2}licensed states: licensed_states is empty/m);
    expect(out()).toMatch(/^ok {4}mode: draft/m);
  });
});

describe("send", () => {
  it("refuses before any transport is called while a config or licensing item fails preflight", async () => {
    const { deps, transport, stores, out } = setup();
    await cmdInit([], deps);
    expect(await cmdSend([], deps)).toBe(1);
    expect(out()).toContain("Refusing to send");
    expect(out()).toContain("FAIL  licensed states");
    expect(transport.delivered).toEqual([]);
    expect(stores.touches.exists()).toBe(false);
  });

  it("refuses a dry run too, so a blank postal address is never rendered into a plan", async () => {
    const base = testConfig();
    const { deps, transport, out } = setup(testConfig({ firm: { ...base.firm, postal_address: "" } }));
    expect(await cmdSend(["--dry-run"], deps)).toBe(1);
    expect(out()).toContain("FAIL  postal address");
    expect(transport.delivered).toEqual([]);
  });
});

describe("record", () => {
  it("records the ids the Claude routine reports for an outbox touch", async () => {
    const { deps, stores } = setup(testConfig());
    const p = makeProspect({ status: "in_sequence", sequence_step: 1 });
    stores.prospects.upsert([p]);
    stores.touches.upsert([touch({ prospect_id: p.prospect_id, to_email: p.email })]);
    expect(await cmdRecord(["T-000001", "drafted", "--draft-id", "r-77", "--thread-id", "th-9"], deps)).toBe(0);
    expect(stores.touches.rows()[0]).toMatchObject({ status: "drafted", draft_id: "r-77", thread_id: "th-9" });
    expect(stores.prospects.rows()[0]!.thread_id).toBe("th-9");
  });

  it("rejects a status other than drafted, sent or failed", async () => {
    const { deps } = setup(testConfig());
    await expect(cmdRecord(["T-000001", "done"], deps)).rejects.toThrow(UsageError);
  });
});

describe("qualify", () => {
  it("processes the inbox, moves finished files to processed/, and leaves unreadable or unfinished ones for the next run", async () => {
    const { cwd, deps, stores, out } = setup(testConfig());
    const owner = makeProspect({ status: "in_sequence", email: "owner@optout.example" });
    const other = makeProspect({ status: "in_sequence", email: "owner@later.example" });
    stores.prospects.upsert([owner, other]);
    const inbox = path.join(cwd, "data/inbox");
    fs.mkdirSync(inbox, { recursive: true });
    const msg = (id: string, from: string, text: string) => ({ id, threadId: "", mailbox: "frank@ambadvisory-mail.example", from, to: "frank@ambadvisory-mail.example", subject: "Re: Exit-readiness check", date: `${TODAY}T15:00:00Z`, text });
    fs.writeFileSync(path.join(inbox, "a-optout.json"), JSON.stringify(msg("m-1", "Owner <owner@optout.example>", "Please remove me from your list.")));
    fs.writeFileSync(path.join(inbox, "b-later.json"), JSON.stringify(msg("m-2", "owner@later.example", "Tell me more about the check.")));
    fs.writeFileSync(path.join(inbox, "c-broken.json"), "{ not json");
    // The classifier fails on the second message only, as a Claude outage with no fallback would.
    const classify: typeof classifyReply = async (m, ctx) => {
      if (m.id === "m-2") throw new Error("classifier down");
      return classifyReply(m, ctx);
    };

    expect(await cmdQualify([], { ...deps, classify })).toBe(1);
    expect(fs.readdirSync(path.join(inbox, "processed"))).toEqual(["a-optout.json"]);
    expect(fs.readdirSync(inbox).filter((f) => f.endsWith(".json")).sort()).toEqual(["b-later.json", "c-broken.json"]);
    expect(new Suppression(stores.suppression).check("owner@optout.example")?.reason).toBe("opt_out");
    expect(out()).toContain("Unreadable inbox file c-broken.json");
    expect(out()).toContain("classification failed: classifier down");

    // Next run, the classifier works: the retried file moves too.
    fs.rmSync(path.join(inbox, "c-broken.json"));
    const lines: string[] = [];
    const ok = async () => ({ class: "interested" as const, classifier: "rules" as const, optOut: false, complaint: false, facts: { wants_readiness_check: "Y" as const }, notes: "test" });
    expect(await cmdQualify([], { ...deps, classify: ok, log: (l) => lines.push(l) })).toBe(0);
    expect(fs.readdirSync(path.join(inbox, "processed")).sort()).toEqual(["a-optout.json", "b-later.json"]);
    expect(lines.join("\n")).toContain("drafted 1 answer(s)");
  });
});

describe("daily", () => {
  it("does not send while an inbox file cannot be read, because it might be an opt-out", async () => {
    const { cwd, deps, transport, out } = setup(testConfig());
    seedSendable(cwd);
    fs.writeFileSync(path.join(cwd, "data/inbox/broken.json"), "{ not json");
    expect(await cmdDaily([], deps)).toBe(1);
    expect(out()).toContain("send skipped");
    expect(transport.delivered).toEqual([]);
  });
});

/** One sendable prospect and an inbox folder, for the daily test. */
function seedSendable(cwd: string): void {
  const stores = openStores(path.join(cwd, "data"));
  stores.prospects.upsert([makeProspect()]);
  fs.mkdirSync(stores.dir.inbox, { recursive: true });
}

describe("suppress", () => {
  it("adds a domain or an email to the permanent list and marks matching prospects dnc", async () => {
    const { deps, stores, out } = setup(testConfig());
    const a = makeProspect({ email: "owner@client.example" });
    const b = makeProspect({ email: "jane@elsewhere.example" });
    const c = makeProspect({ email: "bob@third.example" });
    stores.prospects.upsert([a, b, c]);

    expect(await cmdSuppress(["client.example", "--reason", "client"], deps)).toBe(0);
    expect(await cmdSuppress(["Jane@Elsewhere.example"], deps)).toBe(0);
    expect(stores.suppression.rows()).toEqual([
      expect.objectContaining({ value: "client.example", value_type: "domain", reason: "client", source: "manual (cli)" }),
      expect.objectContaining({ value: "jane@elsewhere.example", value_type: "email", reason: "do_not_contact" }),
    ]);
    const status = Object.fromEntries(stores.prospects.rows().map((p) => [p.prospect_id, p.status]));
    expect(status).toEqual({ [a.prospect_id]: "dnc", [b.prospect_id]: "dnc", [c.prospect_id]: "scored" });
    expect(out()).toContain(`1 prospect(s) marked dnc: ${a.prospect_id}`);
  });

  it("rejects a reason that is not on the list", async () => {
    const { deps } = setup(testConfig());
    await expect(cmdSuppress(["x@y.example", "--reason", "annoying"], deps)).rejects.toThrow(UsageError);
  });
});

describe("export", () => {
  it("refuses, writing nothing, while lead_sales is off", async () => {
    const { cwd, deps, stores, out } = setup(testConfig());
    const p = makeProspect();
    stores.prospects.upsert([p]);
    expect(await cmdExport(["Partner Brokers", p.prospect_id, "--out", "leads.csv"], deps)).toBe(1);
    expect(out()).toContain("Export refused");
    expect(out()).toContain("lead_sales.enabled is false");
    expect(fs.existsSync(path.join(cwd, "leads.csv"))).toBe(false);
    expect(stores.exports.exists()).toBe(false);
  });
});

describe("status", () => {
  it("prints counts by status, tier and stage, and each mailbox's health and cap today", async () => {
    const { deps, stores, out } = setup(testConfig());
    stores.prospects.upsert([makeProspect(), makeProspect({ status: "dnc", tier: "B" })]);
    expect(await cmdStatus([], deps)).toBe(0);
    expect(out()).toContain("Prospects 2: scored 1, dnc 1");
    expect(out()).toContain("Tiers (not excluded): A 1, B 1");
    expect(out()).toContain("Today 2026-10-20: a send day");
    expect(out()).toMatch(/frank@ambadvisory-mail\.example: cold week 5, cap today 20, used 0; .*; ok/);
  });
});

describe("runCli", () => {
  it("prints the command list for help, and exits 1 on an unknown command", async () => {
    const { deps, out } = setup();
    expect(await runCli(["help"], deps)).toBe(0);
    expect(out()).toContain("clear-pause <mailbox> --by <name>");
    expect(await runCli(["launch"], deps)).toBe(1);
    expect(out()).toContain('Unknown command "launch"');
  });
});

describe("demo", () => {
  it("runs the whole loop offline on the samples in under 10 seconds, without calling Claude", async () => {
    const dataDir = tmpDir("lead-engine-demo-test-");
    const lines: string[] = [];
    const started = Date.now();
    claudeCalls = 0;
    const r = await runDemo({ log: (l) => lines.push(l), today: "2026-10-18", now: new Date("2026-10-18T12:00:00Z"), dataDir });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(claudeCalls).toBe(0);
    expect(r.steps.every((s) => s.code === 0)).toBe(true);
    expect(r.steps.map((s) => s.argv[0])).toEqual(["import", "import", "import", "import", "build", "enrich", "score", "plan", "send", "qualify", "check", "handoff", "report", "status"]);

    // The config is the example plus the demo's own, clearly marked, values.
    expect(r.config.licensed_states).toEqual(["FL"]);
    expect(r.config.licensing_signoff).toMatch(/^DEMO ONLY/);
    expect(r.config.firm.postal_address).toMatch(/^DEMO ONLY/);

    // Step 1 to six owners, then answers to the three replies that deserve one, plus the readiness check: all drafts.
    const sent = r.transport.delivered;
    expect(sent.filter((d) => d.msg.kind === "outreach").length).toBe(6);
    expect(sent.filter((d) => d.msg.kind === "reply").length).toBe(4);
    expect(sent.every((d) => d.mode === "draft")).toBe(true);
    const checkDraft = sent.find((d) => d.msg.kind === "reply" && d.msg.body.startsWith("Hi Donald,\n\nHere is the exit-readiness check"));
    expect(checkDraft?.msg.body).toContain("This reply was drafted with an AI assistant.");

    const stores = openStores(dataDir);
    const suppression = new Suppression(stores.suppression);
    expect(suppression.check("tom@pinellaspipeworks.example")?.reason).toBe("opt_out");
    expect(suppression.check("hector@hectorsac.example")?.reason).toBe("bounce");
    // The opt-out and the bounce get no answer.
    for (const blocked of ["tom@pinellaspipeworks.example", "hector@hectorsac.example"]) expect(sent.filter((d) => d.msg.kind === "reply").map((d) => d.msg.to)).not.toContain(blocked);

    expect(stores.leads.rows().find((l) => l.prospect_id === r.interestedProspectId)).toMatchObject({ stage: "handed_off", revenue: 1_800_000, sde: 350_000, timeline: "6-12m", manager_in_place: "Y" });
    expect(fs.readdirSync(path.join(dataDir, "inbox/processed")).length).toBe(6);
    expect(fs.readdirSync(path.join(dataDir, "checks")).length).toBe(1);
    expect(fs.readdirSync(path.join(dataDir, "handoffs")).length).toBe(1);
    expect(fs.readdirSync(path.join(dataDir, "reports"))).toEqual(["2026-W43.md"]);
    expect(fs.readdirSync(path.join(dataDir, "drafts")).length).toBe(10);

    const printed = lines.join("\n");
    expect(printed).toContain(`step 1 ${DEMO_DAYS.send}`);
    expect(printed).toContain("# Weekly report 2026-W43");
    expect(printed).toContain("Where everything is");
    expect(printed).not.toMatch(/\u2014/);
  });

  it("gives the same results on every run", async () => {
    const run = async () => {
      const dir = tmpDir("lead-engine-demo-test-");
      await runDemo({ log: () => {}, today: "2026-10-18", now: new Date("2026-10-18T12:00:00Z"), dataDir: dir });
      return ["prospects.csv", "touches.csv", "replies.csv", "leads.csv", "suppression.csv"].map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
    };
    expect(await run()).toEqual(await run());
  });
});

describe("time limits", () => {
  it("stops finding emails between businesses when told, and carries on from there with --resume", async () => {
    const { cwd, deps, stores, out } = setup(testConfig());
    stores.prospects.upsert([makeProspect({ prospect_id: "P-00001", status: "new" }), makeProspect({ prospect_id: "P-00002", status: "new" }), makeProspect({ prospect_id: "P-00003", status: "new" })]);
    const cursor = path.join(cwd, "data/cache/enrich-cursor.json");
    // A zero-second budget still does one business, so every press makes progress.
    expect(await cmdEnrich(["--no-verify", "--max-seconds", "0", "--resume"], deps)).toBe(0);
    expect(JSON.parse(fs.readFileSync(cursor, "utf8"))).toEqual({ after: "P-00001" });
    expect(out()).toContain("Stopped after P-00001");
    expect(await cmdEnrich(["--no-verify", "--max-seconds", "0", "--resume"], deps)).toBe(0);
    expect(JSON.parse(fs.readFileSync(cursor, "utf8"))).toEqual({ after: "P-00002" });
    expect(await cmdEnrich(["--no-verify", "--resume"], deps)).toBe(0);
    expect(out()).toContain("Continuing after P-00002");
    expect(fs.existsSync(cursor)).toBe(false);
    await expect(cmdEnrich(["--max-seconds", "soon"], deps)).rejects.toThrow(UsageError);
  });

  it("handles only the oldest new replies with --limit and leaves the rest waiting", async () => {
    const { cwd, deps, stores, out } = setup(testConfig());
    stores.prospects.upsert([makeProspect({ status: "in_sequence", email: "one@a.example" }), makeProspect({ status: "in_sequence", email: "two@b.example" })]);
    const inbox = path.join(cwd, "data/inbox");
    fs.mkdirSync(inbox, { recursive: true });
    const msg = (id: string, from: string, hour: string) => ({ id, from, to: "frank@ambadvisory-mail.example", mailbox: "frank@ambadvisory-mail.example", subject: "Re: Exit-readiness check", date: `${TODAY}T${hour}:00:00Z`, text: "Tell me more." });
    fs.writeFileSync(path.join(inbox, "a.json"), JSON.stringify(msg("m-late", "two@b.example", "16")));
    fs.writeFileSync(path.join(inbox, "b.json"), JSON.stringify(msg("m-early", "one@a.example", "14")));
    const seen: string[] = [];
    const classify: typeof classifyReply = async (m) => {
      seen.push(m.id);
      return { class: "question", classifier: "rules", optOut: false, complaint: false, facts: {}, notes: "test" };
    };
    expect(await cmdQualify(["--limit", "1"], { ...deps, classify })).toBe(0);
    expect(seen).toEqual(["m-early"]);
    expect(out()).toContain("Handling the oldest 1 of 2 new message(s)");
    expect(fs.readdirSync(inbox).filter((f) => f.endsWith(".json"))).toEqual(["a.json"]);
    expect(await cmdQualify(["--limit", "1"], { ...deps, classify })).toBe(0);
    expect(seen).toEqual(["m-early", "m-late"]);
    await expect(cmdQualify(["--limit", "0"], deps)).rejects.toThrow(UsageError);
  });
});
