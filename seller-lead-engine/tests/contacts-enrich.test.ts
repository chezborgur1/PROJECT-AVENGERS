import { describe, expect, it } from "vitest";
import { emailRank, enrichContacts, MAX_VERIFICATIONS_PER_PROSPECT, setManualVerification } from "../src/contacts/enrich.ts";
import type { ContactRow, ProspectRow } from "../src/domain/schema.ts";
import { makeProspect, tempStores, testConfig } from "./helpers.ts";

const NOW = new Date("2026-10-18T14:00:00Z");
const STAMP = "2026-10-18T14:00:00Z";
const mxOk = async () => ["mx.exampleair.example"];

function contact(p: ProspectRow, email: string, overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    source: "csv",
    source_record_id: `C-${email}`,
    business_name: p.business_name,
    zip: p.zip,
    first_name: "",
    last_name: "",
    role: "",
    email,
    email_source: "import",
    email_source_url: "https://vendor.example/list",
    website: "",
    phone: "",
    ...overrides,
  };
}

/** A verifier stub: status by email (default "valid"); records which addresses were checked. */
function verifier(statuses: Record<string, string> = {}) {
  const checked: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const email = new URL(String(input)).searchParams.get("email") ?? "";
    checked.push(email);
    const status = statuses[email] ?? "valid";
    return new Response(JSON.stringify({ status, sub_status: status === "do_not_mail" ? "role_based" : "" }), { status: 200 });
  }) as typeof fetch;
  return { impl, checked };
}

function setup(prospect: Partial<ProspectRow>, contacts: (p: ProspectRow) => ContactRow[] = () => []) {
  const stores = tempStores();
  const p = makeProspect({ email: "", email_source: "", email_verification: "unverified", ...prospect });
  stores.prospects.upsert([p]);
  stores.contacts.upsert(contacts(p));
  return { stores, p, read: () => stores.prospects.rows().find((r) => r.prospect_id === p.prospect_id)! };
}

describe("emailRank", () => {
  const owner = { first: "John", last: "Example" };
  it("ranks owner-name matches first, other people next, role inboxes last", () => {
    expect(emailRank("john@x.com", owner)).toBe(0);
    expect(emailRank("jexample@x.com", owner)).toBe(0);
    expect(emailRank("john.example@x.com", owner)).toBe(0);
    expect(emailRank("mary@x.com", owner)).toBe(1);
    expect(emailRank("info@x.com", owner)).toBe(2);
  });
});

describe("enrichContacts", () => {
  it("picks the owner's address over a role inbox, verifies it and records provenance", async () => {
    const { stores, read } = setup({}, (p) => [contact(p, "info@exampleair.example"), contact(p, "John@ExampleAir.example", { email_source: "hunter", email_source_url: "https://hunter.example" })]);
    const v = verifier();
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: v.impl });
    expect(read()).toMatchObject({ email: "john@exampleair.example", email_source: "hunter", email_source_url: "https://hunter.example", email_verification: "valid", email_verified_at: STAMP });
    expect(v.checked).toEqual(["john@exampleair.example"]);
    expect(r).toEqual({ found: 1, verified: 1, byStatus: { valid: 1 } });
  });

  it("uses a role inbox only when it is the business's only live address", async () => {
    const { stores, read } = setup({}, (p) => [contact(p, "john@exampleair.example"), contact(p, "office@exampleair.example")]);
    const v = verifier({ "john@exampleair.example": "invalid" });
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: v.impl });
    expect(read()).toMatchObject({ email: "office@exampleair.example", email_verification: "role_based" });
    expect(v.checked).toEqual(["john@exampleair.example", "office@exampleair.example"]);
  });

  it("does not fall back to a role inbox while a person address is merely unconfirmed", async () => {
    const { stores, read } = setup({}, (p) => [contact(p, "john@exampleair.example"), contact(p, "office@exampleair.example")]);
    const v = verifier({ "john@exampleair.example": "unknown" });
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: v.impl });
    expect(read()).toMatchObject({ email: "john@exampleair.example", email_verification: "unknown" });
    expect(v.checked).toEqual(["john@exampleair.example"]);
  });

  it("never overwrites a verified address with an unverified one", async () => {
    const { stores, read } = setup(
      { email: "mary@exampleair.example", email_source: "website", email_verification: "valid", email_verified_at: "2026-10-01T00:00:00Z" },
      (p) => [contact(p, "john@exampleair.example")],
    );
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: false });
    expect(read()).toMatchObject({ email: "mary@exampleair.example", email_verification: "valid" });
    expect(r.found).toBe(0);
    // With verification on but no API key the owner's address stays unconfirmed, so the verified one is kept.
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk });
    expect(read()).toMatchObject({ email: "mary@exampleair.example", email_verification: "valid", email_verified_at: "2026-10-01T00:00:00Z" });
  });

  it("replaces a verified address with a better one that also verifies", async () => {
    const { stores, read } = setup(
      { email: "office@exampleair.example", email_source: "website", email_verification: "role_based", email_verified_at: "2026-10-01T00:00:00Z" },
      (p) => [contact(p, "john@exampleair.example")],
    );
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: verifier().impl });
    expect(read()).toMatchObject({ email: "john@exampleair.example", email_source: "import", email_verification: "valid" });
  });

  it("without verification takes the best new candidate as unverified", async () => {
    const { stores, read } = setup({ email: "office@exampleair.example", email_verification: "invalid" }, (p) => [contact(p, "john@exampleair.example")]);
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: false });
    expect(read()).toMatchObject({ email: "john@exampleair.example", email_verification: "unverified", email_verified_at: "" });
    expect(r).toMatchObject({ found: 1, verified: 0, byStatus: { unverified: 1 } });
  });

  it("does not re-verify an address verified in the last 90 days, but does re-verify an older one", async () => {
    const recent = setup({ email: "john@exampleair.example", email_verification: "valid", email_verified_at: "2026-09-01T00:00:00Z" });
    const v1 = verifier();
    const r1 = await enrichContacts(recent.stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: v1.impl });
    expect(v1.checked).toEqual([]);
    expect(r1.verified).toBe(0);
    expect(recent.read().email_verified_at).toBe("2026-09-01T00:00:00Z");

    const old = setup({ email: "john@exampleair.example", email_verification: "valid", email_verified_at: "2026-05-01T00:00:00Z" });
    const v2 = verifier({ "john@exampleair.example": "invalid" });
    await enrichContacts(old.stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: v2.impl });
    expect(old.read()).toMatchObject({ email_verification: "invalid", email_verified_at: STAMP });
  });

  it("spends at most three verifier calls on one prospect", async () => {
    const people = ["john", "jexample", "john.e", "j.example", "john.example"].map((l) => `${l}@exampleair.example`);
    const { stores } = setup({}, (p) => people.map((e) => contact(p, e)));
    const v = verifier(Object.fromEntries(people.map((e) => [e, "invalid"])));
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl: v.impl });
    expect(v.checked.length).toBe(MAX_VERIFICATIONS_PER_PROSPECT);
    expect(r.verified).toBe(MAX_VERIFICATIONS_PER_PROSPECT);
  });

  it("skips suppressed addresses, excluded domains and suppressed prospects", async () => {
    const { stores, read, p } = setup({}, (pr) => [contact(pr, "john@exampleair.example"), contact(pr, "mary@exampleair.example"), contact(pr, "bob@client.example")]);
    stores.suppression.append([{ value: "john@exampleair.example", value_type: "email", reason: "opt_out", source: "manual", added_at: STAMP }]);
    await enrichContacts(stores, testConfig({ targeting: { exclude_domains: ["client.example"] } }), { now: NOW, discover: false, verify: false });
    expect(read().email).toBe("mary@exampleair.example");

    stores.suppression.append([{ value: p.prospect_id, value_type: "prospect", reason: "opt_out", source: "manual", added_at: STAMP }]);
    stores.contacts.upsert([contact(p, "john.example@exampleair.example")]);
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: false });
    expect(read().email).toBe("mary@exampleair.example");
  });

  it("only works on prospects in new, scored or hold", async () => {
    const stores = tempStores();
    const p = makeProspect({ status: "in_sequence", email: "", email_verification: "unverified" });
    stores.prospects.upsert([p]);
    stores.contacts.upsert([contact(p, "john@exampleair.example")]);
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: false });
    expect(stores.prospects.rows()[0]!.email).toBe("");
    expect(r).toEqual({ found: 0, verified: 0, byStatus: {} });
  });

  it("discovers addresses on the business's website when asked", async () => {
    const { stores, read } = setup({ website: "exampleair.example" });
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "api.zerobounce.net") return new Response(JSON.stringify({ status: "valid" }));
      if (url.pathname === "/contact") return new Response('<a href="mailto:john@exampleair.example">John</a>', { headers: { "Content-Type": "text/html" } });
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: true, verify: true, resolveMx: mxOk, verifierApiKey: "k", fetchImpl });
    expect(read()).toMatchObject({ email: "john@exampleair.example", email_source: "website", email_source_url: "https://exampleair.example/contact", email_verification: "valid" });
    expect(r.found).toBe(1);
  });

  it("counts prospects with no address under no_email and leaves them untouched", async () => {
    const { stores, read, p } = setup({});
    const r = await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk });
    expect(r.byStatus).toEqual({ no_email: 1 });
    expect(read()).toEqual(p);
  });
});

describe("setManualVerification", () => {
  it("leaves an address unknown without a verifier key, then lets a person mark it valid with a dated note", async () => {
    const { stores, read } = setup({ email: "john@exampleair.example", email_source: "website", notes: "from the website" });
    await enrichContacts(stores, testConfig(), { now: NOW, discover: false, verify: true, resolveMx: mxOk });
    expect(read().email_verification).toBe("unknown");

    const later = new Date("2026-10-19T09:30:00Z");
    const row = setManualVerification(stores, read().prospect_id, "valid", "Frank Example", later);
    expect(row).toMatchObject({ email_verification: "valid", email_verified_at: "2026-10-19T09:30:00Z" });
    expect(read().notes).toBe("from the website; verified manually by Frank Example (valid, john@exampleair.example, 2026-10-19)");

    // The next enrich run reuses the manual verdict instead of downgrading it to unknown.
    await enrichContacts(stores, testConfig(), { now: new Date("2026-10-20T09:00:00Z"), discover: false, verify: true, resolveMx: mxOk });
    expect(read()).toMatchObject({ email_verification: "valid", email_verified_at: "2026-10-19T09:30:00Z" });
  });

  it("records an invalid mark the same way", () => {
    const { stores, read } = setup({ email: "old@exampleair.example", email_verification: "unknown" });
    setManualVerification(stores, read().prospect_id, "invalid", "Frank Example", NOW);
    expect(read()).toMatchObject({ email_verification: "invalid", email_verified_at: STAMP, notes: "verified manually by Frank Example (invalid, old@exampleair.example, 2026-10-18)" });
  });

  it("refuses an unknown prospect, a prospect with no email, a blank name and any other status", () => {
    const { stores, read } = setup({ email: "" });
    expect(() => setManualVerification(stores, "P-99999", "valid", "Frank", NOW)).toThrow(/P-99999 not found/);
    expect(() => setManualVerification(stores, read().prospect_id, "valid", "Frank", NOW)).toThrow(/has no email/);
    stores.prospects.upsert([{ ...read(), email: "john@exampleair.example" }]);
    expect(() => setManualVerification(stores, read().prospect_id, "valid", "  ", NOW)).toThrow(/who checked/);
    expect(() => setManualVerification(stores, read().prospect_id, "catch_all" as "valid", "Frank", NOW)).toThrow(/valid or invalid/);
  });
});
