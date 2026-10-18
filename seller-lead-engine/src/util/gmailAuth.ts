import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// Gmail API credentials, shared by the sender (GmailApiTransport) and the
// inbox reader (GmailApiInbox), so both read the same file the same way and
// refresh access tokens the same way.
//
// The tokens file (GMAIL_TOKENS_FILE, default .gmail-tokens.json,
// git-ignored) has one documented format:
//
//   { "client_id": "...", "client_secret": "...",
//     "mailboxes": { "<mailbox email>": { "refresh_token": "..." } } }
//
// Create the OAuth client inside the sending Workspace tenant as an
// Internal app: an external app left in "Testing" status issues refresh
// tokens that expire after 7 days (docs/research/deliverability.md,
// verification missed item 3). An Internal app's refresh tokens do not.
//
// For backward tolerance the loader also reads the layouts earlier builds
// accepted: a mailbox entry with its own client_id and client_secret, a flat
// { "<mailbox>": { client_id, client_secret, refresh_token } } file, and an
// array of { email | mailbox, client_id, client_secret, refresh_token }.
// They are not documented; new files should use the format above.
//
// No clock reads and no implicit network: the refresher takes `now` and an
// injectable `fetchImpl`.

/** Google's OAuth token endpoint (refresh-token grant). */
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The one documented tokens-file format: a shared Internal OAuth client and a refresh token per mailbox. */
export const GmailTokensFileSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  mailboxes: z.record(z.string(), z.object({ refresh_token: z.string().min(1) })),
});
export type GmailTokensFile = z.infer<typeof GmailTokensFileSchema>;

/** OAuth credentials for one mailbox. */
export interface GmailCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

const CredSchema = z.object({ client_id: z.string().min(1), client_secret: z.string().min(1), refresh_token: z.string().min(1) });

const asRecord = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** Read and parse the tokens file. Throws a message naming the file when it is missing or not JSON. */
export function loadGmailTokens(file: string): unknown {
  if (!fs.existsSync(file)) {
    throw new Error(`Gmail tokens file not found: ${file}. Set GMAIL_TOKENS_FILE, or use sending.transport "outbox" and the inbox folder.`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Gmail tokens file ${path.basename(file)} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Client id, secret and refresh token for `mailbox` (case-insensitive) from the tokens file contents. */
export function credentialsFor(tokens: unknown, mailbox: string): GmailCredentials {
  const want = mailbox.trim().toLowerCase();
  const top = asRecord(tokens) ?? {};
  let entry: unknown;
  if (Array.isArray(tokens)) {
    entry = tokens.find((t) => {
      const r = asRecord(t);
      return r !== undefined && String(r.email ?? r.mailbox ?? "").trim().toLowerCase() === want;
    });
  } else {
    // The documented "mailboxes" map first, then a flat file keyed by mailbox.
    for (const pool of [asRecord(top.mailboxes), top]) {
      const key = pool && Object.keys(pool).find((k) => k.trim().toLowerCase() === want);
      if (pool && key) {
        entry = pool[key];
        break;
      }
    }
  }
  const rec = asRecord(entry);
  if (!rec || typeof rec.refresh_token !== "string" || !rec.refresh_token) {
    throw new Error(`No Gmail credentials for ${mailbox} in the tokens file: add "mailboxes": { "${want}": { "refresh_token": "..." } }`);
  }
  const parsed = CredSchema.safeParse({ client_id: rec.client_id ?? top.client_id, client_secret: rec.client_secret ?? top.client_secret, refresh_token: rec.refresh_token });
  if (!parsed.success) throw new Error(`Gmail credentials for ${mailbox} need client_id, client_secret and refresh_token (client_id and client_secret go at the top of the tokens file)`);
  return parsed.data;
}

/** Hands out access tokens per mailbox: one refresh, reused until a minute before it expires. */
export class GmailTokenRefresher {
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();
  private file: unknown;

  constructor(private readonly opts: { tokensFile: string; fetchImpl?: typeof fetch; now: Date }) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** The tokens file contents, read once. */
  private tokens(): unknown {
    if (this.file === undefined) this.file = loadGmailTokens(this.opts.tokensFile);
    return this.file;
  }

  /** A fresh access token for the mailbox. Credentials are checked before any network call. */
  async accessToken(mailbox: string): Promise<string> {
    const key = mailbox.trim().toLowerCase();
    const now = this.opts.now.getTime();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now + 60_000) return cached.token;
    const creds = credentialsFor(this.tokens(), mailbox);
    const res = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: creds.client_id, client_secret: creds.client_secret, refresh_token: creds.refresh_token }).toString(),
    });
    const text = await res.text().catch(() => "");
    const body = safeJson(text) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      const detail = [body.error, body.error_description].filter(Boolean).join(": ") || text.replace(/\s+/g, " ").trim().slice(0, 300) || "no access_token";
      const hint = /invalid_grant/.test(text)
        ? " The refresh token was revoked or expired. An OAuth app in Testing status expires tokens after 7 days: create the client in the sending Workspace tenant as an Internal app and re-authorize."
        : "";
      throw new Error(`OAuth refresh for ${mailbox} failed (HTTP ${res.status}): ${detail}.${hint}`);
    }
    this.cache.set(key, { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 });
    return body.access_token;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
