import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { credentialsFor, GmailApiInbox, htmlToText, readInboxFolder, toInboundFromGmail } from "../src/replies/inbox.ts";
import { tmpDir } from "./helpers.ts";

const NOW = new Date("2026-10-18T14:00:00Z");
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("readInboxFolder", () => {
  it("reads one message per file and arrays of messages, lower-casing header names", () => {
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, "a.json"),
      JSON.stringify({ id: "m1", threadId: "t1", mailbox: "frank@x.example", from: "John <john@y.example>", to: "frank@x.example", subject: "Re: hi", date: "2026-10-17T13:00:00Z", text: "Yes", headers: { "Auto-Submitted": "no" } }),
    );
    fs.writeFileSync(path.join(dir, "b.json"), JSON.stringify([{ id: "m2", from: "a@b.example", body: "Who are you?" }, { id: "m3", from: "c@d.example", text: "No thanks" }]));
    fs.writeFileSync(path.join(dir, "notes.txt"), "not json");
    const { messages, invalid } = readInboxFolder(dir);
    expect(invalid).toEqual([]);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(messages[0]!.headers).toEqual({ "auto-submitted": "no" });
    // `body` is accepted for `text`, and missing optional fields default to blank.
    expect(messages[1]).toMatchObject({ text: "Who are you?", threadId: "", subject: "", headers: {} });
  });

  it("reports bad JSON and bad entries by file without dropping the good ones", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "bad.json"), "{ nope");
    fs.writeFileSync(path.join(dir, "mixed.json"), JSON.stringify([{ id: "ok", from: "a@b.example", text: "hi" }, { id: "", from: "a@b.example", text: "x" }, { id: "nt", from: "a@b.example" }]));
    const { messages, invalid } = readInboxFolder(dir);
    expect(messages.map((m) => m.id)).toEqual(["ok"]);
    expect(invalid.map((i) => i.file)).toEqual(["bad.json", "mixed.json[1]", "mixed.json[2]"]);
    expect(invalid[0]!.error).toMatch(/not valid JSON/);
    expect(invalid[2]!.error).toMatch(/text/);
  });

  it("returns nothing for a missing folder and never moves files", () => {
    expect(readInboxFolder(path.join(tmpDir(), "missing"))).toEqual({ messages: [], invalid: [] });
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify({ id: "m1", from: "a@b.example", text: "hi" }));
    readInboxFolder(dir);
    readInboxFolder(dir);
    expect(fs.readdirSync(dir)).toEqual(["a.json"]);
  });
});

describe("Gmail API credentials", () => {
  const cred = { client_id: "cid", client_secret: "sec", refresh_token: "rt" };
  it("finds a mailbox's credentials in every supported layout, case-insensitively", () => {
    expect(credentialsFor({ "Frank@X.example": cred }, "frank@x.example")).toEqual(cred);
    expect(credentialsFor({ mailboxes: { "frank@x.example": cred } }, "frank@x.example")).toEqual(cred);
    expect(credentialsFor({ client_id: "cid", client_secret: "sec", mailboxes: { "frank@x.example": { refresh_token: "rt" } } }, "frank@x.example")).toEqual(cred);
    expect(credentialsFor([{ email: "frank@x.example", ...cred }], "frank@x.example")).toEqual(cred);
  });

  it("names the mailbox when credentials are missing or incomplete", () => {
    expect(() => credentialsFor({}, "frank@x.example")).toThrow(/No Gmail credentials for frank@x.example/);
    expect(() => credentialsFor({ "frank@x.example": { refresh_token: "rt" } }, "frank@x.example")).toThrow(/need client_id/);
  });
});

/** A fake Gmail: token endpoint, a two-page list, and message bodies. Records every request. */
function fakeGmail(opts: { tokenStatus?: number; listStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const messages: Record<string, unknown> = {
    a: {
      id: "a",
      threadId: "ta",
      internalDate: String(Date.parse("2026-10-17T15:00:00Z")),
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "John Example <john@exampleair.example>" },
          { name: "To", value: "frank@x.example" },
          { name: "Subject", value: "Re: Exit-readiness check" },
          { name: "Message-ID", value: "<abc@mail.example>" },
          { name: "Auto-Submitted", value: "no" },
        ],
        parts: [
          { mimeType: "text/plain", body: { data: b64url("Yes, interested. Revenue is about $1.2M.") } },
          { mimeType: "text/html", body: { data: b64url("<p>ignored</p>") } },
        ],
      },
    },
    b: {
      id: "b",
      threadId: "tb",
      internalDate: String(Date.parse("2026-10-17T09:00:00Z")),
      payload: { mimeType: "text/html", headers: [{ name: "From", value: "sue@shop.example" }, { name: "Subject", value: "Question" }], body: { data: b64url("<div>Who are you?<br>Sue &amp; Co</div>") } },
    },
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return opts.tokenStatus ? json(opts.tokenStatus, { error: "invalid_grant", error_description: "Token has been expired or revoked." }) : json(200, { access_token: "at-1", expires_in: 3599 });
    }
    if (url.includes("/messages?")) {
      if (opts.listStatus) return new Response("quota", { status: opts.listStatus });
      const page = new URL(url).searchParams.get("pageToken");
      return page ? json(200, { messages: [{ id: "b", threadId: "tb" }] }) : json(200, { messages: [{ id: "a", threadId: "ta" }], nextPageToken: "p2" });
    }
    const id = decodeURIComponent(url.split("/messages/")[1]!.split("?")[0]!);
    return json(200, messages[id]);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function tokensFile(): string {
  const file = path.join(tmpDir(), "tokens.json");
  fs.writeFileSync(file, JSON.stringify({ "frank@x.example": { client_id: "cid", client_secret: "sec", refresh_token: "rt" } }));
  return file;
}

describe("GmailApiInbox", () => {
  it("refreshes the token once, pages the list with after: in epoch seconds, and decodes each message", async () => {
    const { calls, fetchImpl } = fakeGmail();
    const inbox = new GmailApiInbox({ tokensFile: tokensFile(), fetchImpl, now: NOW });
    const msgs = await inbox.fetchSince("frank@x.example", "2026-10-16T00:00:00Z");
    expect(calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
    const token = calls[0]!;
    expect(String(token.init?.body)).toContain("grant_type=refresh_token");
    expect(String(token.init?.body)).toContain("refresh_token=rt");
    const list = new URL(calls[1]!.url);
    expect(list.searchParams.get("q")).toBe(`in:inbox after:${Date.parse("2026-10-16T00:00:00Z") / 1000} -from:me`);
    expect((calls[1]!.init?.headers as Record<string, string>).authorization).toBe("Bearer at-1");
    // Oldest first.
    expect(msgs.map((m) => m.id)).toEqual(["b", "a"]);
    expect(msgs[1]).toEqual({
      id: "a",
      threadId: "ta",
      mailbox: "frank@x.example",
      from: "John Example <john@exampleair.example>",
      to: "frank@x.example",
      subject: "Re: Exit-readiness check",
      date: "2026-10-17T15:00:00Z",
      text: "Yes, interested. Revenue is about $1.2M.",
      headers: { from: "John Example <john@exampleair.example>", to: "frank@x.example", subject: "Re: Exit-readiness check", "message-id": "<abc@mail.example>", "auto-submitted": "no" },
    });
    expect(msgs[0]!.text).toBe("Who are you?\nSue & Co");
  });

  it("fails with the OAuth error when the refresh token is revoked", async () => {
    const { fetchImpl } = fakeGmail({ tokenStatus: 400 });
    const inbox = new GmailApiInbox({ tokensFile: tokensFile(), fetchImpl, now: NOW });
    await expect(inbox.fetchSince("frank@x.example", "2026-10-16")).rejects.toThrow(/OAuth refresh for frank@x.example failed \(400\): Token has been expired or revoked/);
  });

  it("fails with the API status when a list call is refused", async () => {
    const { fetchImpl } = fakeGmail({ listStatus: 429 });
    const inbox = new GmailApiInbox({ tokensFile: tokensFile(), fetchImpl, now: NOW });
    await expect(inbox.fetchSince("frank@x.example", "2026-10-16")).rejects.toThrow(/Gmail API 429 for frank@x.example: quota/);
  });

  it("rejects a missing tokens file and an unreadable since date before any network call", async () => {
    const { calls, fetchImpl } = fakeGmail();
    await expect(new GmailApiInbox({ tokensFile: path.join(tmpDir(), "none.json"), fetchImpl, now: NOW }).fetchSince("frank@x.example", "2026-10-16")).rejects.toThrow(/tokens file not found/);
    await expect(new GmailApiInbox({ tokensFile: tokensFile(), fetchImpl, now: NOW }).fetchSince("frank@x.example", "last week")).rejects.toThrow(/Not an ISO date/);
    expect(calls).toEqual([]);
  });
});

describe("Gmail message decoding", () => {
  it("keeps a DSN's delivery-status part so the Status field is readable", () => {
    const m = toInboundFromGmail(
      {
        id: "d",
        threadId: "td",
        internalDate: String(Date.parse("2026-10-17T10:00:00Z")),
        payload: {
          mimeType: "multipart/report",
          headers: [{ name: "From", value: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }, { name: "Content-Type", value: 'multipart/report; report-type="delivery-status"' }],
          parts: [
            { mimeType: "text/plain", body: { data: b64url("Address not found") } },
            { mimeType: "message/delivery-status", body: { data: b64url("Final-Recipient: rfc822; old@x.example\nStatus: 5.1.1") } },
          ],
        },
      },
      "frank@x.example",
    );
    expect(m.text).toBe("Address not found\nFinal-Recipient: rfc822; old@x.example\nStatus: 5.1.1");
    expect(m.headers["content-type"]).toContain("delivery-status");
  });

  it("turns HTML into plain text and drops quoted blockquotes", () => {
    expect(htmlToText("<p>Yes&nbsp;please</p><blockquote>old <b>stuff</b></blockquote><script>x()</script>")).toBe("Yes please");
  });
});
