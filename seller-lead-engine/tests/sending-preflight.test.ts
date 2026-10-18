import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkDkim, checkDmarc, checkSpf, preflight } from "../src/sending/preflight.ts";
import { MB1 } from "./fixtures/sending/rows.ts";
import { REPO, testConfig, tmpDir } from "./helpers.ts";

const TEMPLATES = path.join(REPO, "templates/sequence");
const DOMAIN = "ambadvisory-mail.example";
const KEY_2048 = "MIIBIjANBgkqh" + "A".repeat(380);
const GOOD: Record<string, string[][]> = {
  [DOMAIN]: [["v=spf1 include:_spf.google.com ~all"], ["google-site-verification=abc"]],
  [`google._domainkey.${DOMAIN}`]: [["v=DKIM1; k=rsa; p=", KEY_2048.slice(0, 200), KEY_2048.slice(200)]],
  [`_dmarc.${DOMAIN}`]: [["v=DMARC1; p=none; rua=mailto:dmarc@ambadvisory-mail.example"]],
};

/** A resolver over a fixed table; unknown names fail like a missing record. */
function resolver(table: Record<string, string[][]>, lookups: string[] = []) {
  return async (name: string) => {
    lookups.push(name);
    const hit = table[name];
    if (!hit) throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: "ENOTFOUND" });
    return hit;
  };
}

const oneMailbox = (overrides: Record<string, unknown> = {}) =>
  testConfig({ mailboxes: [{ email: MB1, sender_name: "Frank Example", sender_title: "Principal", warmup_started: "2026-09-01" }], ...overrides });

const byCheck = (items: { check: string; ok: boolean; detail: string }[]) => Object.fromEntries(items.map((i) => [i.check, i]));

describe("preflight", () => {
  it("passes a fully set-up sending domain, with no network beyond the injected resolver", async () => {
    const lookups: string[] = [];
    const items = await preflight(oneMailbox(), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver(GOOD, lookups) });
    expect(items.filter((i) => !i.ok)).toEqual([]);
    expect(lookups).toEqual([DOMAIN, `google._domainkey.${DOMAIN}`, `_dmarc.${DOMAIN}`]);
    const c = byCheck(items);
    expect(c[`DKIM google._domainkey.${DOMAIN}`]!.detail).toMatch(/about 2048-bit/);
    expect(c[`DMARC _dmarc.${DOMAIN}`]!.detail).toMatch(/^p=none/);
    expect(c[`warm-up ${MB1}`]!.detail).toMatch(/cold week 5: up to 20 a day/);
    expect(c["transport outbox"]!.detail).toMatch(/cannot set List-Unsubscribe headers/);
    expect(c["send calendar"]!.detail).toContain("2026-11-11");
    expect(c.templates).toMatchObject({ ok: true });
  });

  it("fails when DNS records are missing, and names the record to publish", async () => {
    const items = byCheck(await preflight(oneMailbox(), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver({}) }));
    expect(items[`SPF ${DOMAIN}`]).toMatchObject({ ok: false, detail: expect.stringMatching(/v=spf1 include:_spf\.google\.com ~all/) });
    expect(items[`DKIM google._domainkey.${DOMAIN}`]).toMatchObject({ ok: false, detail: expect.stringMatching(/2048-bit key/) });
    expect(items[`DMARC _dmarc.${DOMAIN}`]).toMatchObject({ ok: false, detail: expect.stringMatching(/v=DMARC1; p=none/) });
  });

  it("reports a DNS failure that is not a missing record", async () => {
    const resolve = async () => {
      throw Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
    };
    const items = await preflight(oneMailbox(), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolve });
    expect(byCheck(items)[`SPF ${DOMAIN}`]).toMatchObject({ ok: false, detail: expect.stringMatching(/DNS lookup failed \(ETIMEOUT\)/) });
  });

  it("uses a configurable DKIM selector and SPF include", async () => {
    const lookups: string[] = [];
    const table = { ...GOOD, [DOMAIN]: [["v=spf1 include:spf.protection.outlook.com -all"]], [`selector1._domainkey.${DOMAIN}`]: GOOD[`google._domainkey.${DOMAIN}`]! };
    const items = await preflight(oneMailbox(), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver(table, lookups), dkimSelector: "selector1", spfInclude: "spf.protection.outlook.com" });
    expect(lookups).toContain(`selector1._domainkey.${DOMAIN}`);
    expect(items.filter((i) => i.check.startsWith("SPF") || i.check.startsWith("DKIM")).every((i) => i.ok)).toBe(true);
  });

  it("fails the legal checks without a postal address or licensing sign-off", async () => {
    const items = byCheck(await preflight(oneMailbox({ firm: { postal_address: " " }, licensing_signoff: "" }), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver(GOOD) }));
    expect(items["postal address"]).toMatchObject({ ok: false, detail: expect.stringMatching(/16 CFR 316\.2\(p\)/) });
    expect(items["licensed states"]).toMatchObject({ ok: false, detail: expect.stringMatching(/licensing_signoff is blank/) });
    const none = byCheck(await preflight(oneMailbox({ licensed_states: [] }), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver(GOOD) }));
    expect(none["licensed states"]!.detail).toMatch(/nothing is sent/);
  });

  it("fails a persona or team sender, a mailbox on the primary domain, and a mailbox still warming up", async () => {
    const config = testConfig({
      firm: { postal_address: "1 Main St, Tampa, FL 33602", website: "https://www.ambadvisoryservices.com" },
      mailboxes: [
        { email: "sales@ambadvisoryservices.com", sender_name: "Sales Team", sender_title: "", warmup_started: "2026-10-15" },
      ],
    });
    const items = byCheck(await preflight(config, { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver({}) }));
    expect(items["sender names"]).toMatchObject({ ok: false, detail: expect.stringMatching(/real person's full name.*Sales Team/) });
    expect(items["separate sending domain"]).toMatchObject({ ok: false, detail: expect.stringMatching(/primary domain ambadvisoryservices\.com/) });
    expect(items["warm-up sales@ambadvisoryservices.com"]).toMatchObject({ ok: false, detail: "warming up: cold sending starts 2026-11-05" });
  });

  it("warns that the outbox connector drafts as one account when there are several mailboxes", async () => {
    const items = byCheck(await preflight(testConfig(), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver(GOOD) }));
    expect(items["transport outbox"]).toMatchObject({ ok: false, detail: expect.stringMatching(/2 mailboxes but the Gmail connector drafts as one signed-in account/) });
    const api = byCheck(await preflight(testConfig({ sending: { transport: "gmail_api" } }), { today: "2026-10-20", templatesDir: TEMPLATES, resolveTxt: resolver(GOOD) }));
    expect(api["transport gmail_api"]!.detail).toMatch(/Internal app/);
  });

  it("fails on templates that do not pass the lint", async () => {
    const items = byCheck(await preflight(oneMailbox(), { today: "2026-10-20", templatesDir: tmpDir(), resolveTxt: resolver(GOOD) }));
    expect(items.templates).toMatchObject({ ok: false, detail: expect.stringMatching(/Template not found/) });
  });
});

describe("DNS record checks", () => {
  it("rejects two SPF records, a missing include and +all", () => {
    expect(checkSpf(["v=spf1 include:_spf.google.com ~all", "v=spf1 a ~all"], "_spf.google.com").detail).toMatch(/2 SPF records/);
    expect(checkSpf(["v=spf1 include:mailgun.org ~all"], "_spf.google.com").ok).toBe(false);
    expect(checkSpf(["v=spf1 include:_spf.google.com +all"], "_spf.google.com").detail).toMatch(/\+all/);
  });

  it("rejects a revoked or short DKIM key and flags a 1024-bit one", () => {
    expect(checkDkim(["v=DKIM1; k=rsa; p="]).detail).toMatch(/revoked/);
    expect(checkDkim([`v=DKIM1; p=${"A".repeat(120)}`]).ok).toBe(false);
    expect(checkDkim([`v=DKIM1; p=${"A".repeat(216)}`])).toMatchObject({ ok: true, detail: expect.stringMatching(/1024-bit \(2048 recommended\)/) });
  });

  it("rejects a DMARC record without a valid policy and two DMARC records", () => {
    expect(checkDmarc(["v=DMARC1; rua=mailto:x@y.example"]).ok).toBe(false);
    expect(checkDmarc(["v=DMARC1; p=none", "v=DMARC1; p=reject"]).ok).toBe(false);
    expect(checkDmarc(["v=DMARC1; p=quarantine; pct=100"])).toMatchObject({ ok: true, detail: "p=quarantine" });
  });
});
