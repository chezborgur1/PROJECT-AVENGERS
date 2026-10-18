import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { credentialsFor, GmailTokenRefresher, GmailTokensFileSchema, GOOGLE_TOKEN_URL, loadGmailTokens } from "../src/util/gmailAuth.ts";
import { tmpDir } from "./helpers.ts";

// The one Gmail credentials loader, shared by the API sender and the API
// inbox reader. Offline: every token call goes to an injected fetch.

const NOW = new Date("2026-10-20T13:00:00Z");
const DOCUMENTED = { client_id: "cid", client_secret: "sec", mailboxes: { "frank@x.example": { refresh_token: "rt-1" }, "sam@x.example": { refresh_token: "rt-2" } } };

function tokensFile(content: unknown): string {
  const file = path.join(tmpDir(), "tokens.json");
  fs.writeFileSync(file, JSON.stringify(content));
  return file;
}

function fakeToken(status = 200, body: unknown = { access_token: "at", expires_in: 3599 }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("the tokens file format", () => {
  it("documents one layout: a shared client and a refresh token per mailbox", () => {
    expect(GmailTokensFileSchema.safeParse(DOCUMENTED).success).toBe(true);
    expect(GmailTokensFileSchema.safeParse({ "frank@x.example": { client_id: "a", client_secret: "b", refresh_token: "c" } }).success).toBe(false);
  });

  it("reads the documented layout case-insensitively", () => {
    expect(credentialsFor(DOCUMENTED, "Frank@X.example")).toEqual({ client_id: "cid", client_secret: "sec", refresh_token: "rt-1" });
  });

  it("still accepts the older layouts for backward tolerance", () => {
    const cred = { client_id: "cid", client_secret: "sec", refresh_token: "rt" };
    expect(credentialsFor({ "Frank@X.example": cred }, "frank@x.example")).toEqual(cred);
    expect(credentialsFor({ mailboxes: { "frank@x.example": cred } }, "frank@x.example")).toEqual(cred);
    expect(credentialsFor([{ email: "frank@x.example", ...cred }], "frank@x.example")).toEqual(cred);
    expect(credentialsFor({ client_id: "top", client_secret: "top-s", mailboxes: { "frank@x.example": { refresh_token: "rt", client_id: "own", client_secret: "own-s" } } }, "frank@x.example")).toEqual({ client_id: "own", client_secret: "own-s", refresh_token: "rt" });
  });

  it("names the mailbox when credentials are missing or incomplete", () => {
    expect(() => credentialsFor({}, "frank@x.example")).toThrow(/No Gmail credentials for frank@x.example/);
    expect(() => credentialsFor({ mailboxes: { "frank@x.example": { refresh_token: "rt" } } }, "frank@x.example")).toThrow(/need client_id, client_secret and refresh_token/);
  });

  it("names the file when it is missing or not JSON", () => {
    const dir = tmpDir();
    expect(() => loadGmailTokens(path.join(dir, "none.json"))).toThrow(/Gmail tokens file not found/);
    fs.writeFileSync(path.join(dir, "bad.json"), "{ nope");
    expect(() => loadGmailTokens(path.join(dir, "bad.json"))).toThrow(/bad\.json is not valid JSON/);
  });
});

describe("GmailTokenRefresher", () => {
  it("posts a refresh-token grant to Google's token endpoint and caches the token per mailbox", async () => {
    const { calls, fetchImpl } = fakeToken();
    const auth = new GmailTokenRefresher({ tokensFile: tokensFile(DOCUMENTED), fetchImpl, now: NOW });
    expect(await auth.accessToken("frank@x.example")).toBe("at");
    await auth.accessToken("FRANK@x.example");
    await auth.accessToken("sam@x.example");
    expect(calls.length).toBe(2);
    expect(calls[0]!.url).toBe(GOOGLE_TOKEN_URL);
    expect(Object.fromEntries(new URLSearchParams(String(calls[0]!.init?.body)))).toEqual({ grant_type: "refresh_token", client_id: "cid", client_secret: "sec", refresh_token: "rt-1" });
    expect(new URLSearchParams(String(calls[1]!.init?.body)).get("refresh_token")).toBe("rt-2");
  });

  it("explains a revoked refresh token and points to an Internal OAuth app", async () => {
    const { fetchImpl } = fakeToken(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    const auth = new GmailTokenRefresher({ tokensFile: tokensFile(DOCUMENTED), fetchImpl, now: NOW });
    await expect(auth.accessToken("frank@x.example")).rejects.toThrow(/OAuth refresh for frank@x.example failed \(HTTP 400\): invalid_grant: Token has been expired or revoked.*Internal app/);
  });

  it("makes no network call when the mailbox has no credentials", async () => {
    const { calls, fetchImpl } = fakeToken();
    const auth = new GmailTokenRefresher({ tokensFile: tokensFile(DOCUMENTED), fetchImpl, now: NOW });
    await expect(auth.accessToken("nobody@x.example")).rejects.toThrow(/No Gmail credentials for nobody@x.example/);
    expect(calls).toEqual([]);
  });
});
