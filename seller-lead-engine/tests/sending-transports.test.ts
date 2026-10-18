import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OutgoingMessage } from "../src/domain/messages.ts";
import { credentialsFor, GmailApiTransport, MemoryTransport, OutboxTransport, type OutboxMessage } from "../src/sending/transports.ts";
import { MB1, MB2 } from "./fixtures/sending/rows.ts";
import { tmpDir } from "./helpers.ts";

const NOW = new Date("2026-10-20T13:00:00Z");

function msg(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    touchId: "T-000001",
    prospectId: "P-00001",
    kind: "outreach",
    step: 1,
    mailbox: MB1,
    fromName: "Frank Example, AMB Advisory Services",
    to: "john@exampleair.example",
    subject: "Exit-readiness check for Example Air",
    body: "Hi John,\n\nBody.\n\nReply 'unsubscribe' and I will not email you again.",
    headers: { "List-Unsubscribe": `<mailto:${MB1}?subject=unsubscribe%20T-000001>` },
    ...overrides,
  };
}

describe("MemoryTransport", () => {
  it("records every message and returns ids", async () => {
    const t = new MemoryTransport();
    expect(await t.deliver(msg(), "draft")).toEqual({ messageId: "mem-1", threadId: "thread-P-00001", draftId: "draft-1" });
    expect(t.delivered.length).toBe(1);
  });
});

describe("OutboxTransport", () => {
  it("writes the message and the exact create_draft call, and returns no ids", async () => {
    const dir = tmpDir();
    const t = new OutboxTransport(dir, "2026-10-20");
    expect(await t.deliver(msg(), "draft")).toEqual({});
    const file = JSON.parse(fs.readFileSync(path.join(dir, "2026-10-20", "T-000001.json"), "utf8"));
    expect(file).toMatchObject({ touchId: "T-000001", mode: "draft", to: "john@exampleair.example", body: msg().body, headers: msg().headers });
    expect(file.connector).toEqual({
      tool: "create_draft",
      mailbox: MB1,
      args: { to: ["john@exampleair.example"], subject: "Exit-readiness check for Example Air", body: msg().body, includeSignature: false },
      record: "npm run engine -- record T-000001 drafted --draft-id <draft id> --thread-id <threadId>",
    });
  });

  it("threads a follow-up draft with replyToMessageId and a sent follow-up with replyThreadId", async () => {
    const dir = tmpDir();
    const t = new OutboxTransport(dir, "2026-10-27");
    await t.deliver(msg({ touchId: "T-000009", step: 2, subject: "Re: Exit-readiness check for Example Air", threadId: "th-1", replyToMessageId: "gm-1" }), "draft");
    await t.deliver(msg({ touchId: "T-000010", step: 2, threadId: "th-2", replyToMessageId: "gm-2" }), "send");
    const draft = JSON.parse(fs.readFileSync(path.join(dir, "2026-10-27", "T-000009.json"), "utf8"));
    const sent = JSON.parse(fs.readFileSync(path.join(dir, "2026-10-27", "T-000010.json"), "utf8"));
    expect(draft.connector.args.replyToMessageId).toBe("gm-1");
    expect(draft.threadId).toBe("th-1");
    expect(sent.connector).toMatchObject({ tool: "send_message", args: { replyThreadId: "th-2" }, record: "npm run engine -- record T-000010 sent --message-id <id> --thread-id <threadId>" });
    expect(sent.connector.args.replyToMessageId).toBeUndefined();
  });

  it("keeps one README checklist per day: the rules once, then one item per message with its record command", async () => {
    const dir = tmpDir();
    const t = new OutboxTransport(dir, "2026-10-20");
    await t.deliver(msg(), "draft");
    await t.deliver(msg({ touchId: "T-000002", mailbox: MB2, to: "mary@cool.example" }), "draft");
    const readme = fs.readFileSync(path.join(dir, "2026-10-20", "README.md"), "utf8");
    expect(readme.match(/^# Outbox for 2026-10-20$/gm)!.length).toBe(1);
    expect(readme).toMatch(/cannot set List-Unsubscribe or List-Unsubscribe-Post headers, so in this mode the opt-out line in the body/);
    expect(readme).toMatch(/sends only as the account it is signed in to/);
    expect(readme).toContain("- [ ] **T-000001** outreach step 1 to john@exampleair.example from mailbox frank@ambadvisory-mail.example");
    expect(readme).toContain("Signed in as frank.e@ambadvisory-mail.example? Then call `create_draft` with `connector.args` from `T-000002.json`");
    expect(readme).toContain("`npm run engine -- record T-000002 drafted --draft-id <draft id> --thread-id <threadId>`");
    expect(readme).not.toMatch(/\u2014/);
  });

  it("refuses a touch id that is not safe as a file name", async () => {
    await expect(new OutboxTransport(tmpDir(), "2026-10-20").deliver(msg({ touchId: "../evil" }), "draft")).rejects.toThrow(/not safe/);
  });
});

/** A fake fetch that answers the token endpoint and the Gmail endpoints, recording every call. */
function fakeFetch(responses: { token?: () => Response; gmail?: () => Response } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let n = 0;
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url === "https://oauth2.googleapis.com/token") {
      return responses.token?.() ?? new Response(JSON.stringify({ access_token: `at-${calls.length}`, expires_in: 3599 }), { status: 200 });
    }
    n++;
    if (responses.gmail) return responses.gmail();
    if (url.endsWith("/drafts")) return new Response(JSON.stringify({ id: `d-${n}`, message: { id: `m-${n}`, threadId: `th-${n}` } }), { status: 200 });
    return new Response(JSON.stringify({ id: `m-${n}`, threadId: `th-${n}`, labelIds: ["SENT"] }), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

function tokensFile(content: unknown): string {
  const file = path.join(tmpDir(), "tokens.json");
  fs.writeFileSync(file, JSON.stringify(content));
  return file;
}

const TOKENS = { client_id: "cid", client_secret: "secret", mailboxes: { [MB1]: { refresh_token: "rt-1" }, [MB2.toUpperCase()]: { refresh_token: "rt-2", client_id: "cid-2", client_secret: "secret-2" } } };

describe("GmailApiTransport", () => {
  it("refreshes the OAuth token, then creates a draft with the raw MIME and the thread id", async () => {
    const { impl, calls } = fakeFetch();
    const t = new GmailApiTransport({ tokensFile: tokensFile(TOKENS), fetchImpl: impl, now: NOW });
    const result = await t.deliver(msg({ threadId: "th-0" }), "draft");
    expect(result).toEqual({ draftId: "d-1", messageId: "m-1", threadId: "th-1" });

    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(Object.fromEntries(form)).toEqual({ grant_type: "refresh_token", client_id: "cid", client_secret: "secret", refresh_token: "rt-1" });

    expect(calls[1]!.url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe("Bearer at-1");
    const payload = JSON.parse(String(calls[1]!.init.body));
    expect(payload.message.threadId).toBe("th-0");
    const raw = Buffer.from(payload.message.raw, "base64url").toString("utf8");
    expect(raw).toContain('From: "Frank Example, AMB Advisory Services" <frank@ambadvisory-mail.example>');
    expect(raw).toContain("List-Unsubscribe: <mailto:frank@ambadvisory-mail.example?subject=unsubscribe%20T-000001>");
    expect(raw).toContain("Message-ID: <t-000001.20261020130000@ambadvisory-mail.example>");
  });

  it("sends with messages/send, reuses one token per mailbox and refreshes per mailbox with its own client", async () => {
    const { impl, calls } = fakeFetch();
    const t = new GmailApiTransport({ tokensFile: tokensFile(TOKENS), fetchImpl: impl, now: NOW });
    expect(await t.deliver(msg(), "send")).toEqual({ messageId: "m-1", threadId: "th-1" });
    await t.deliver(msg({ touchId: "T-000002" }), "send");
    await t.deliver(msg({ touchId: "T-000003", mailbox: MB2 }), "send");
    const tokenCalls = calls.filter((c) => c.url.includes("oauth2"));
    expect(tokenCalls.length).toBe(2);
    expect(new URLSearchParams(String(tokenCalls[1]!.init.body)).get("client_id")).toBe("cid-2");
    const sendCalls = calls.filter((c) => c.url.endsWith("/messages/send"));
    expect(sendCalls.length).toBe(3);
    expect(JSON.parse(String(sendCalls[0]!.init.body))).not.toHaveProperty("threadId");
    expect(JSON.parse(String(sendCalls[0]!.init.body))).toHaveProperty("raw");
  });

  it("explains an expired refresh token and points to an Internal OAuth app", async () => {
    const { impl } = fakeFetch({ token: () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 }) });
    const t = new GmailApiTransport({ tokensFile: tokensFile(TOKENS), fetchImpl: impl, now: NOW });
    await expect(t.deliver(msg(), "draft")).rejects.toThrow(/HTTP 400.*invalid_grant.*Testing status expires tokens after 7 days.*Internal app/);
  });

  it("throws with the HTTP status when Gmail refuses the message", async () => {
    const { impl } = fakeFetch({ gmail: () => new Response(JSON.stringify({ error: { code: 403, message: "Insufficient Permission" } }), { status: 403 }) });
    const t = new GmailApiTransport({ tokensFile: tokensFile(TOKENS), fetchImpl: impl, now: NOW });
    await expect(t.deliver(msg(), "send")).rejects.toThrow(/messages\.send for T-000001 failed \(HTTP 403\): .*Insufficient Permission/);
  });

  it("fails clearly without a tokens file or without a token for the mailbox", async () => {
    const { impl, calls } = fakeFetch();
    await expect(new GmailApiTransport({ tokensFile: path.join(tmpDir(), "missing.json"), fetchImpl: impl, now: NOW }).deliver(msg(), "draft")).rejects.toThrow(/tokens file not found/);
    await expect(new GmailApiTransport({ tokensFile: tokensFile(TOKENS), fetchImpl: impl, now: NOW }).deliver(msg({ mailbox: "nobody@x.example" }), "draft")).rejects.toThrow(/no refresh_token for nobody@x\.example/);
    expect(calls).toEqual([]);
  });

  it("reads a flat tokens file keyed by mailbox", () => {
    expect(credentialsFor({ [MB1]: { client_id: "a", client_secret: "b", refresh_token: "c" } }, MB1.toUpperCase())).toEqual({ client_id: "a", client_secret: "b", refresh_token: "c" });
    expect(() => credentialsFor({ [MB1]: { refresh_token: "c" } }, MB1)).toThrow(/no client_id\/client_secret/);
  });
});

// Type check: the transport takes plain OutgoingMessage values too.
const _plain: OutgoingMessage = msg();
void _plain;
