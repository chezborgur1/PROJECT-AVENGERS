import { describe, expect, it } from "vitest";
import { assertSendable, ComplianceError } from "../src/compliance/gate.ts";
import { Suppression } from "../src/compliance/suppression.ts";
import { MemoryTransport } from "../src/sending/transports.ts";
import { outreachMessage, replyMessage } from "./fixtures/compliance/messages.ts";
import { makeProspect, tempStores, testConfig } from "./helpers.ts";

const NOW = new Date("2026-10-18T14:00:00Z");

/** The reasons assertSendable throws with, or [] when it passes. */
function reasonsOf(fn: () => void): string[] {
  try {
    fn();
    return [];
  } catch (err) {
    if (!(err instanceof ComplianceError)) throw err;
    return err.reasons;
  }
}

function ctx(overrides: { config?: ReturnType<typeof testConfig> } = {}) {
  const stores = tempStores();
  return { stores, config: overrides.config ?? testConfig(), suppression: new Suppression(stores.suppression) };
}

describe("assertSendable: outreach", () => {
  it("passes a clean step-1 message to a verified, licensed-state prospect", () => {
    const { config, suppression } = ctx();
    const p = makeProspect();
    expect(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p })).not.toThrow();
  });

  it("blocks a suppressed recipient, a suppressed domain and a suppressed prospect id", () => {
    const { config, suppression } = ctx();
    const p = makeProspect();
    suppression.add(p.email, "email", "opt_out", "reply R-1", NOW);
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p }))).toEqual([`suppressed: ${p.email} (opt_out, reply R-1)`]);

    const q = makeProspect({ email: "mary@client.example" });
    suppression.add("client.example", "domain", "client", "manual", NOW);
    expect(reasonsOf(() => assertSendable(outreachMessage(config, q), { config, suppression, prospect: q }))[0]).toMatch(/suppressed: client\.example/);

    const r = makeProspect();
    suppression.add(r.prospect_id, "prospect", "wrong_person", "reply R-2", NOW);
    expect(reasonsOf(() => assertSendable(outreachMessage(config, r), { config, suppression, prospect: r }))[0]).toMatch(/wrong_person/);
  });

  it("collects every reason before throwing once", () => {
    const config = testConfig({ licensed_states: [], licensing_signoff: "", firm: { postal_address: "" } });
    const { suppression } = ctx();
    const p = makeProspect({ status: "dnc", email_verification: "unknown", state: "CA", zip: "" });
    suppression.add(p.email, "email", "opt_out", "manual", NOW);
    const msg = outreachMessage(config, p, { mailbox: "ghost@ambadvisory-mail.example", subject: "URGENT!", body: "Buy now!" });
    let thrown: unknown;
    try {
      assertSendable(msg, { config, suppression, prospect: p });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ComplianceError);
    const reasons = (thrown as ComplianceError).reasons;
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^suppressed:/),
        "licensed_states is empty: no state has licensing sign-off",
        "licensing_signoff is blank: counsel must sign off the licensed states",
        "firm.postal_address is blank",
        "mailbox ghost@ambadvisory-mail.example is not in config.mailboxes",
        `prospect ${p.prospect_id} is dnc`,
        'email verification is "unknown": not sendable',
        expect.stringMatching(/^lint: subject has an all-caps word "URGENT"/),
        'lint: subject has "!"',
        "lint: footer is missing the opt-out instruction",
      ]),
    );
    expect(new Set(reasons).size).toBe(reasons.length);
    expect((thrown as Error).message).toMatch(/^Blocked by compliance: /);
    expect((thrown as Error).name).toBe("ComplianceError");
  });

  it("blocks a state outside licensed_states, an FCC wireless address and a foreign TLD", () => {
    const { config, suppression } = ctx();
    const ca = makeProspect({ state: "CA", zip: "90001" });
    expect(reasonsOf(() => assertSendable(outreachMessage(config, ca), { config, suppression, prospect: ca }))).toEqual([expect.stringMatching(/^jurisdiction: CA is not in licensed_states/)]);
    const cell = makeProspect({ email: "8135551234@vtext.com" });
    expect(reasonsOf(() => assertSendable(outreachMessage(config, cell), { config, suppression, prospect: cell }))).toEqual([expect.stringMatching(/FCC wireless/)]);
    const uk = makeProspect({ email: "owner@exampleair.co.uk" });
    expect(reasonsOf(() => assertSendable(outreachMessage(config, uk), { config, suppression, prospect: uk }))).toEqual([expect.stringMatching(/non-US country code/)]);
  });

  it("blocks when the licensing sign-off is blank even with states listed", () => {
    const config = testConfig({ licensing_signoff: "" });
    const { suppression } = ctx();
    const p = makeProspect();
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p }))).toEqual(["licensing_signoff is blank: counsel must sign off the licensed states"]);
  });

  it("blocks a paused mailbox", () => {
    const base = testConfig();
    const config = testConfig({ mailboxes: base.mailboxes.map((m, i) => ({ ...m, paused: i === 0 })) });
    const { suppression } = ctx();
    const p = makeProspect();
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p }))).toEqual([`mailbox ${config.mailboxes[0]!.email} is paused`]);
  });

  it("blocks outreach without a prospect, to an excluded prospect, or to an address other than the prospect's", () => {
    const { config, suppression } = ctx();
    const p = makeProspect();
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression }))).toEqual(["prospect record missing: cannot check jurisdiction, status or verification"]);
    const x = makeProspect({ status: "excluded", exclude_reason: "franchise" });
    expect(reasonsOf(() => assertSendable(outreachMessage(config, x), { config, suppression, prospect: x }))).toEqual([`prospect ${x.prospect_id} is excluded (franchise)`]);
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p, { to: "other@exampleair.example" }), { config, suppression, prospect: p }))[0]).toMatch(/is not the prospect's email/);
    const q = makeProspect();
    expect(reasonsOf(() => assertSendable(outreachMessage(config, q), { config, suppression, prospect: p }))[0]).toMatch(/but the prospect record is/);
  });

  it("allows catch-all and role-based verification but not risky, unknown or unverified", () => {
    const { config, suppression } = ctx();
    for (const ok of ["valid", "catch_all", "role_based"] as const) {
      const p = makeProspect({ email_verification: ok });
      expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p })), ok).toEqual([]);
    }
    for (const bad of ["risky", "unknown", "unverified", "invalid", "disposable"] as const) {
      const p = makeProspect({ email_verification: bad });
      expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p })), bad).toEqual([`email verification is "${bad}": not sendable`]);
    }
  });

  it("blocks a recipient on targeting.exclude_domains", () => {
    const config = testConfig({ targeting: { exclude_domains: ["exampleair.example"] } });
    const { suppression } = ctx();
    const p = makeProspect({ email: "john@exampleair.example" });
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression, prospect: p }))).toEqual(["recipient john@exampleair.example is on targeting.exclude_domains"]);
  });

  it("fails closed when the suppression check throws or the suppression file is unreadable", () => {
    const { config } = ctx();
    const p = makeProspect();
    const broken = { check: () => { throw new Error("disk unavailable"); } } as unknown as Suppression;
    expect(reasonsOf(() => assertSendable(outreachMessage(config, p), { config, suppression: broken, prospect: p }))).toEqual(["suppression check failed: disk unavailable"]);
  });

  it("runs before any transport, so a blocked message never reaches one", async () => {
    const { config, suppression } = ctx();
    const transport = new MemoryTransport();
    const p = makeProspect({ email_verification: "unknown" });
    const send = async () => {
      const msg = outreachMessage(config, p);
      assertSendable(msg, { config, suppression, prospect: p });
      await transport.deliver(msg, "draft");
    };
    await expect(send()).rejects.toBeInstanceOf(ComplianceError);
    expect(transport.delivered).toEqual([]);
  });
});

describe("assertSendable: replies", () => {
  it("does not require verification on a reply", () => {
    const { config, suppression } = ctx();
    const p = makeProspect({ status: "replied", email_verification: "unverified" });
    expect(() => assertSendable(replyMessage(config, p), { config, suppression, prospect: p })).not.toThrow();
    expect(() => assertSendable(replyMessage(config, p), { config, suppression })).not.toThrow();
  });

  it("still checks suppression, footer, AI disclosure, sender and dnc on a reply", () => {
    const { config, suppression } = ctx();
    const p = makeProspect({ status: "dnc" });
    suppression.add(p.email, "email", "opt_out", "reply R-5", NOW);
    const reasons = reasonsOf(() => assertSendable(replyMessage(config, p, { body: "Thanks, John.", fromName: "AI Assistant" }), { config, suppression, prospect: p }));
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^suppressed:/),
        `prospect ${p.prospect_id} is dnc`,
        "lint: footer is missing the postal address",
        "lint: footer is missing the opt-out instruction",
        "lint: reply is missing the AI-assistance disclosure",
        expect.stringMatching(/^lint: From name "AI Assistant" does not name the mailbox's configured sender/),
      ]),
    );
  });

  it("blocks every reply while licensed_states is empty", () => {
    const config = testConfig({ licensed_states: [] });
    const { suppression } = ctx();
    const p = makeProspect({ status: "replied" });
    expect(reasonsOf(() => assertSendable(replyMessage(config, p), { config, suppression, prospect: p }))).toEqual(["licensed_states is empty: no state has licensing sign-off"]);
  });
});
