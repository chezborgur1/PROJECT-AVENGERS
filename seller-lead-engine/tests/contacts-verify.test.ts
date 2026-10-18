import { describe, expect, it } from "vitest";
import { isDisposableDomain, isRoleBased, isSendableVerification, isValidEmailSyntax, mapVerifierResult, verifyEmail } from "../src/contacts/verify.ts";

const mxOk = async () => ["aspmx.l.google.com"];
const noMx = async () => [];
const dnsError = (code: string) => async () => {
  throw Object.assign(new Error(`queryMx ${code} example`), { code });
};

/** A verifier stub answering one ZeroBounce-style body, and recording the URLs it was called with. */
function verifier(body: unknown, status = 200) {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, urls };
}

describe("syntax and lists", () => {
  it("accepts ordinary addresses and rejects malformed ones", () => {
    expect(isValidEmailSyntax("john.example@exampleair.com")).toBe(true);
    expect(isValidEmailSyntax("john+tag@sub.exampleair.com")).toBe(true);
    for (const bad of ["", "john", "john@", "@x.com", "john@@x.com", "jo hn@x.com", ".john@x.com", "john.@x.com", "jo..hn@x.com", "john@x", "john@-x.com", "john@x.c0m", `${"a".repeat(65)}@x.com`]) {
      expect(isValidEmailSyntax(bad), bad).toBe(false);
    }
  });

  it("recognises role-based local parts with punctuation or a +tag", () => {
    for (const e of ["info@x.com", "Office@x.com", "customer.service@x.com", "sales+web@x.com", "hello@x.com", "billing@x.com"]) expect(isRoleBased(e), e).toBe(true);
    expect(isRoleBased("john@x.com")).toBe(false);
    expect(isRoleBased("information.desk.john@x.com")).toBe(false);
  });

  it("matches disposable domains and their subdomains", () => {
    expect(isDisposableDomain("mailinator.com")).toBe(true);
    expect(isDisposableDomain("abc.mailinator.com")).toBe(true);
    expect(isDisposableDomain("notmailinator.com")).toBe(false);
  });

  it("treats only valid, catch-all and role-based as sendable", () => {
    expect(["valid", "catch_all", "role_based"].every(isSendableVerification)).toBe(true);
    expect(["risky", "unknown", "invalid", "disposable", "unverified", ""].some(isSendableVerification)).toBe(false);
  });
});

describe("verifyEmail", () => {
  it("rejects bad syntax before any lookup", async () => {
    let called = false;
    const v = await verifyEmail("not an email", { resolveMx: async () => ((called = true), ["mx"]) });
    expect(v.status).toBe("invalid");
    expect(called).toBe(false);
  });

  it("marks disposable domains disposable", async () => {
    expect((await verifyEmail("x@yopmail.com", { resolveMx: mxOk })).status).toBe("disposable");
  });

  it("marks FCC wireless domains invalid so they are never sent to", async () => {
    const v = await verifyEmail("8135551234@vtext.com", { resolveMx: mxOk, verifierApiKey: "k", fetchImpl: verifier({ status: "valid" }).impl });
    expect(v.status).toBe("invalid");
    expect(v.detail).toMatch(/64\.3100/);
  });

  it("marks a domain without MX records invalid, whether the resolver returns nothing or NXDOMAIN", async () => {
    expect((await verifyEmail("john@nomail.example", { resolveMx: noMx })).status).toBe("invalid");
    expect((await verifyEmail("john@nomail.example", { resolveMx: dnsError("ENOTFOUND") })).status).toBe("invalid");
    expect((await verifyEmail("john@nomail.example", { resolveMx: dnsError("ENODATA") })).status).toBe("invalid");
    expect((await verifyEmail("john@nomail.example", { resolveMx: async () => ["."] })).status).toBe("invalid");
  });

  it("returns unknown when DNS fails for another reason", async () => {
    const v = await verifyEmail("john@exampleair.com", { resolveMx: dnsError("ETIMEOUT") });
    expect(v.status).toBe("unknown");
    expect(v.detail).toMatch(/failed/);
  });

  it("returns unknown without a verifier API key, even with MX records", async () => {
    const v = await verifyEmail("John@ExampleAir.com", { resolveMx: mxOk });
    expect(v).toMatchObject({ status: "unknown" });
    expect(v.detail).toMatch(/no verifier/);
    expect((await verifyEmail("info@exampleair.com", { resolveMx: mxOk })).detail).toMatch(/role-based/);
  });

  it("asks the verifier and maps its answer, keeping the key out of the detail", async () => {
    const f = verifier({ address: "john@exampleair.com", status: "valid", sub_status: "" });
    const v = await verifyEmail("John@ExampleAir.com", { resolveMx: mxOk, verifierApiKey: "secret-key", fetchImpl: f.impl });
    expect(v.status).toBe("valid");
    expect(f.urls[0]).toContain("api.zerobounce.net/v2/validate");
    expect(f.urls[0]).toContain("email=john%40exampleair.com");
    expect(v.detail).not.toContain("secret-key");
  });

  it("reports a valid role-based address as role_based", async () => {
    const v = await verifyEmail("office@exampleair.com", { resolveMx: mxOk, verifierApiKey: "k", fetchImpl: verifier({ status: "valid" }).impl });
    expect(v.status).toBe("role_based");
  });

  it("keeps a role-based address that the verifier calls invalid as invalid", async () => {
    const v = await verifyEmail("office@exampleair.com", { resolveMx: mxOk, verifierApiKey: "k", fetchImpl: verifier({ status: "invalid", sub_status: "mailbox_not_found" }).impl });
    expect(v.status).toBe("invalid");
  });

  it("returns unknown on a verifier HTTP error, an error body or a network failure", async () => {
    expect((await verifyEmail("john@exampleair.com", { resolveMx: mxOk, verifierApiKey: "k", fetchImpl: verifier({}, 500).impl })).status).toBe("unknown");
    const err = await verifyEmail("john@exampleair.com", { resolveMx: mxOk, verifierApiKey: "k", fetchImpl: verifier({ error: "Invalid API Key" }).impl });
    expect(err).toMatchObject({ status: "unknown" });
    expect(err.detail).toMatch(/Invalid API Key/);
    const down = (async () => {
      throw new Error("connect ECONNREFUSED with key k-123");
    }) as typeof fetch;
    const net = await verifyEmail("john@exampleair.com", { resolveMx: mxOk, verifierApiKey: "k-123", fetchImpl: down });
    expect(net.status).toBe("unknown");
    expect(net.detail).not.toContain("k-123");
  });

  it("uses a custom ZeroBounce-compatible endpoint when given", async () => {
    const f = verifier({ status: "catch-all" });
    const v = await verifyEmail("john@exampleair.com", { resolveMx: mxOk, verifierApiKey: "k", fetchImpl: f.impl, verifierUrl: "https://verify.example/v2/validate" });
    expect(v.status).toBe("catch_all");
    expect(f.urls[0]).toMatch(/^https:\/\/verify\.example\/v2\/validate\?/);
  });
});

describe("verifier result mapping", () => {
  it("maps every ZeroBounce status, and never maps an unknown one to valid", () => {
    expect(mapVerifierResult("valid", "").status).toBe("valid");
    expect(mapVerifierResult("catch-all", "").status).toBe("catch_all");
    expect(mapVerifierResult("invalid", "mailbox_not_found").status).toBe("invalid");
    expect(mapVerifierResult("spamtrap", "").status).toBe("invalid");
    expect(mapVerifierResult("abuse", "").status).toBe("invalid");
    expect(mapVerifierResult("do_not_mail", "role_based").status).toBe("role_based");
    expect(mapVerifierResult("do_not_mail", "disposable").status).toBe("disposable");
    expect(mapVerifierResult("do_not_mail", "toxic").status).toBe("invalid");
    expect(mapVerifierResult("do_not_mail", "role_based_catch_all").status).toBe("risky");
    expect(mapVerifierResult("unknown", "timeout_exceeded").status).toBe("unknown");
    expect(mapVerifierResult("something_new", "").status).toBe("unknown");
  });
});
