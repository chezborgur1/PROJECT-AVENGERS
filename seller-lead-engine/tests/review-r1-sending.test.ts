import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cmdSuppress, engineTimeZone, sendWindowBlock } from "../src/cli.ts";
import { assertSendable, ComplianceError, excludedTarget } from "../src/compliance/gate.ts";
import { Suppression } from "../src/compliance/suppression.ts";
import type { DeliveryResult, OutgoingMessage } from "../src/domain/messages.ts";
import type { ProspectRow } from "../src/domain/schema.ts";
import { processInbox } from "../src/replies/process.ts";
import { buildMime } from "../src/sending/mime.ts";
import { notSendDayReason, planDay } from "../src/sending/planner.ts";
import { preflight } from "../src/sending/preflight.ts";
import { cancelPendingTouches, recordDelivery, runSend } from "../src/sending/run.ts";
import { MemoryTransport, OutboxTransport, type Transport } from "../src/sending/transports.ts";
import { inbound } from "./fixtures/replies/messages.ts";
import { makeProspect, offline, REPO, tempStores, testConfig } from "./helpers.ts";

// Regression tests for the sending findings in docs/build/REVIEW_R1.md
// (items 1 to 7, 12, 13, 15, 16). Each test names its item.

const TEMPLATES = path.join(REPO, "templates/sequence");
const TUE = "2026-11-10";
const STEP2_DAY = "2026-11-17"; // 4 business days after TUE, skipping Veterans Day
const at = (day: string) => new Date(`${day}T13:00:00Z`);

function setup(prospects: ProspectRow[], configOverrides: Record<string, unknown> = {}) {
  const stores = tempStores();
  stores.prospects.upsert(prospects);
  return { stores, config: testConfig(configOverrides) };
}
const send = (s: ReturnType<typeof setup>, day: string, transport: Transport) => runSend(s.stores, s.config, { today: day, now: at(day), transport, templatesDir: TEMPLATES });
const prospect = (s: ReturnType<typeof setup>, id: string) => s.stores.prospects.rows().find((p) => p.prospect_id === id)!;

/** Delivers, then makes the prospects write fail once: the partial write a file open in Excel causes. */
class AcceptThenBreakProspects implements Transport {
  readonly name = "accept-then-break";
  readonly inner = new MemoryTransport();
  constructor(private readonly s: ReturnType<typeof setup>) {}
  async deliver(msg: OutgoingMessage, mode: "draft" | "send"): Promise<DeliveryResult> {
    const result = await this.inner.deliver(msg, mode);
    const table = this.s.stores.prospects;
    const real = table.upsert.bind(table);
    table.upsert = () => {
      table.upsert = real;
      throw new Error("EPERM: prospects.csv is open in Excel");
    };
    return result;
  }
}

describe("item 1: a rerun never sends the same follow-up twice", () => {
  it("moves a lagging prospect forward from its touches instead of planning the step again", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await send(s, TUE, new MemoryTransport());
    const broken = new AcceptThenBreakProspects(s);
    await expect(send(s, STEP2_DAY, broken)).rejects.toThrow(/EPERM/);
    expect(prospect(s, p.prospect_id).sequence_step).toBe(1); // the write failed after Gmail took step 2

    const again = new MemoryTransport();
    await send(s, STEP2_DAY, again);
    expect(again.delivered.map((d) => d.msg.step)).toEqual([]);
    expect(prospect(s, p.prospect_id)).toMatchObject({ sequence_step: 2, status: "in_sequence" });
    expect(s.stores.touches.rows().filter((t) => t.step === 2 && t.status !== "cancelled")).toHaveLength(1);
  });

  it("skips a due follow-up whose step already has a touch, when only planning", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await send(s, TUE, new MemoryTransport());
    // A step-2 touch exists but the prospect still says step 1.
    s.stores.touches.append([{ ...s.stores.touches.rows()[0]!, touch_id: "T-000009", step: 2, status: "planned", planned_for: STEP2_DAY }]);
    const plan = planDay(s.stores, s.config, { today: STEP2_DAY });
    expect(plan.items).toEqual([]);
    expect(plan.skipped[0]!.reason).toMatch(/step 2 already has touch T-000009/);
  });
});

describe("item 2: a failed touch recorded later", () => {
  it("moves the prospect into the sequence when a failed step 1 is recorded as sent", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await send(s, TUE, {
      name: "down",
      async deliver() {
        throw new Error("socket reset after Gmail accepted the message");
      },
    });
    expect(prospect(s, p.prospect_id).status).toBe("scored");
    recordDelivery(s.stores, "T-000001", { status: "sent", messageId: "m1", threadId: "th1" }, at(TUE), s.config);
    expect(prospect(s, p.prospect_id)).toMatchObject({ status: "in_sequence", sequence_step: 1, next_touch_date: STEP2_DAY });
  });

  it("refuses to record a failed step as sent once the step has been made again", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await send(s, TUE, {
      name: "down",
      async deliver() {
        throw new Error("down");
      },
    });
    await send(s, "2026-11-12", new MemoryTransport()); // the retry: T-000002
    expect(() => recordDelivery(s.stores, "T-000001", { status: "drafted", draftId: "d1" }, at(TUE), s.config)).toThrow(/made again as T-000002/);
  });
});

describe("item 13: an opt-out cancels what is queued", () => {
  it("cancels a planned outbox item and removes its file, so the routine cannot create it", async () => {
    const p = makeProspect();
    const s = setup([p]);
    const outbox = new OutboxTransport(s.stores.dir.outbox, TUE);
    await send(s, TUE, outbox);
    const file = path.join(outbox.dir, "T-000001.json");
    expect(fs.existsSync(file)).toBe(true);
    await offline(() =>
      processInbox(s.stores, s.config, { now: at(TUE), today: TUE, messages: [inbound({ from: p.email, text: "Remove me from your list." })], transport: new MemoryTransport() }),
    );
    expect(s.stores.touches.rows()[0]).toMatchObject({ touch_id: "T-000001", status: "cancelled" });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(`${file}.cancelled`)).toBe(true);
    expect(() => recordDelivery(s.stores, "T-000001", { status: "drafted", draftId: "d1" }, at(TUE), s.config)).toThrow(/cancelled/);
  });

  it("cancels a draft made after the owner wrote and keeps one the owner answered", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await send(s, TUE, new MemoryTransport());
    await send(s, STEP2_DAY, new MemoryTransport()); // step 2 drafted at 13:00 on the 17th
    const reply = inbound({ from: p.email, text: "Please stop emailing me.", date: `${STEP2_DAY}T12:00:00Z` });
    const r = await offline(() => processInbox(s.stores, s.config, { now: at(STEP2_DAY), today: STEP2_DAY, messages: [reply], transport: new MemoryTransport() }));
    const [step1, step2] = s.stores.touches.rows();
    expect(step1!.status).toBe("drafted"); // answered, so a person sent it
    expect(step2!.status).toBe("cancelled");
    expect(r.draftsToDelete).toEqual([{ touchId: step2!.touch_id, mailbox: step2!.mailbox, draftId: step2!.draft_id }]);
  });

  it("cancels planned items when a person suppresses an address by hand", async () => {
    const p = makeProspect();
    const s = setup([p]);
    await send(s, TUE, new OutboxTransport(s.stores.dir.outbox, TUE));
    const lines: string[] = [];
    // The CLI command reads its stores from the data folder in the env.
    await cmdSuppress([p.email, "--reason", "do_not_contact"], {
      cwd: REPO,
      env: { LEAD_ENGINE_DATA_DIR: s.stores.dataDir },
      today: TUE,
      now: at(TUE),
      log: (l) => lines.push(l),
    });
    expect(s.stores.touches.rows()[0]!.status).toBe("cancelled");
    expect(lines.join("\n")).toMatch(/cancelled T-000001/);
    expect(cancelPendingTouches(s.stores, p.prospect_id, "again", at(TUE)).cancelled).toEqual([]);
  });
});

describe("items 3 and 12: header unsubscribes go to a mailbox the engine reads", () => {
  it("fails preflight when sending.unsubscribe_mailbox is not a sending mailbox", async () => {
    const config = testConfig({ sending: { unsubscribe_mailbox: "optout@ambadvisoryservices.example" } });
    const items = await preflight(config, { today: TUE, templatesDir: TEMPLATES, resolveTxt: async () => [] });
    expect(items.find((i) => i.check === "unsubscribe mailbox")).toMatchObject({ ok: false });
    const ok = await preflight(testConfig({ sending: { unsubscribe_mailbox: "frank@ambadvisory-mail.example" } }), { today: TUE, templatesDir: TEMPLATES, resolveTxt: async () => [] });
    expect(ok.find((i) => i.check === "unsubscribe mailbox")).toMatchObject({ ok: true });
  });
});

describe("item 4: a blocked prospect does not take a slot every day", () => {
  it("moves a new prospect the gate blocks to hold with the reason", async () => {
    const blocked = makeProspect({ prospect_id: "P-00901", score: 99, email: "owner@client.example" });
    const clean = makeProspect({ prospect_id: "P-00902", score: 50 });
    const s = setup([blocked, clean], { targeting: { exclude_domains: ["client.example"] }, sending: { max_per_domain_per_day: 1 } });
    await send(s, TUE, new MemoryTransport());
    expect(prospect(s, "P-00901")).toMatchObject({ status: "hold" });
    expect(prospect(s, "P-00901").exclude_reason).toMatch(/blocked at send: .*exclude_domains/);
    const t = new MemoryTransport();
    await send(s, "2026-11-12", t);
    expect(t.delivered.map((d) => d.msg.prospectId)).toEqual(["P-00902"]);
  });
});

describe("item 5: today and the send window follow the recipients' time zone", () => {
  it("uses the metro's zone and holds a real send outside the window", () => {
    const config = testConfig({ sending: { mode: "send" } });
    expect(engineTimeZone(config)).toBe("America/New_York");
    expect(sendWindowBlock(config, new Date("2026-11-10T14:00:00Z"))).toBeUndefined(); // 09:00 Eastern
    expect(sendWindowBlock(config, new Date("2026-11-11T03:00:00Z"))).toMatch(/22:00 in America\/New_York, outside the send window/);
    expect(sendWindowBlock(testConfig(), new Date("2026-11-11T03:00:00Z"))).toBeUndefined(); // drafts are not held
  });
});

describe("item 6: New Year's Day observed on December 31", () => {
  it("is not a send day", () => {
    const config = testConfig({ sending: { send_days: [1, 2, 3, 4, 5] } });
    expect(notSendDayReason(config, "2027-12-31")).toMatch(/federal holiday/);
  });
});

describe("item 7: encoded subjects stay inside 76 characters a line", () => {
  it("folds a non-ASCII subject into short encoded words", () => {
    const msg: OutgoingMessage = {
      touchId: "T-000001",
      prospectId: "P-00001",
      kind: "outreach",
      step: 1,
      mailbox: "frank@ambadvisory-mail.example",
      fromName: "Frank Example, AMB Advisory Services",
      to: "owner@example.example",
      subject: "Exit-readiness check for Café Peña Plumbing Services",
      body: "Hi",
      headers: {},
    };
    const mime = buildMime(msg, { date: at(TUE), messageIdDomain: "ambadvisory-mail.example" });
    const subject = mime.split("\r\n").filter((l, i, all) => l.startsWith("Subject:") || (all.slice(0, i).some((x) => x.startsWith("Subject:")) && l.startsWith(" =?")));
    expect(subject.length).toBeGreaterThan(1);
    for (const line of subject) expect(line.length).toBeLessThanOrEqual(76);
  });
});

describe("items 15 and 16: exclusions and hand-entered suppression rows", () => {
  it("excludes subdomains of an excluded domain, and only the exact address for an address entry", () => {
    expect(excludedTarget("owner@office.client.example", ["client.example"])).toBe(true);
    expect(excludedTarget("owner@client.example", ["@client.example"])).toBe(true);
    expect(excludedTarget("bob@gmail.com", ["bob@gmail.com"])).toBe(true);
    expect(excludedTarget("alice@gmail.com", ["bob@gmail.com"])).toBe(false);
  });

  it("suppresses with a domain row typed as 'Acme.example', '@acme.example' or 'acme.example.'", () => {
    for (const value of ["Acme.example", "@acme.example", "acme.example."]) {
      const stores = tempStores();
      stores.suppression.append([{ value, value_type: "domain", reason: "client", source: "spreadsheet", added_at: "" }]);
      expect(new Suppression(stores.suppression).check("bob@acme.example"), value).toBeDefined();
    }
  });

  it("fails closed on a domain row that is not a domain", () => {
    const stores = tempStores();
    stores.suppression.append([{ value: "not a domain", value_type: "domain", reason: "client", source: "spreadsheet", added_at: "" }]);
    const p = makeProspect();
    const msg: OutgoingMessage = { touchId: "T-000001", prospectId: p.prospect_id, kind: "outreach", step: 1, mailbox: "frank@ambadvisory-mail.example", fromName: "Frank Example, AMB Advisory Services", to: p.email, subject: "x", body: "x", headers: {} };
    expect(() => assertSendable(msg, { config: testConfig(), suppression: new Suppression(stores.suppression), prospect: p })).toThrow(ComplianceError);
  });
});
