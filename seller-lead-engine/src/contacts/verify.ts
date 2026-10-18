import dns from "node:dns";
import path from "node:path";
import { normalizeEmail, VERIFICATION_STATUSES } from "../domain/schema.ts";
import { domainListed, isFccWirelessDomain, loadDomainList } from "../compliance/jurisdiction.ts";

// Email verification before anything is sent. The checks run cheapest
// first and stop at the first verdict:
//
//   syntax -> disposable domain -> FCC wireless domain -> MX records ->
//   verifier API (ZeroBounce-compatible) -> "unknown" when no API key
//
// Why this order and these verdicts:
// - Hard bounces over 2% pause a mailbox (docs/research/deliverability.md,
//   bounces and verification), so an address the engine cannot confirm is
//   "unknown", which is not sendable. Only a verifier API can say "valid".
// - The engine never opens SMTP connections itself: cloud hosts block port
//   25 and RCPT probes get IPs flagged (docs/research/data.md section 5), so
//   deliverability comes from a verifier API.
// - FCC wireless domains need express prior authorization (47 CFR
//   64.3100), which cold outreach never has, so they are "invalid": never
//   send (docs/research/compliance.md section 1 item 12).
// - Role-based local parts (info@, office@) reach a shared inbox, not the
//   owner. They are "role_based": sendable only when it is the business's
//   only address, which src/contacts/enrich.ts decides. Without a verifier a
//   role address stays "unknown", like any other unconfirmed address.

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** A verdict on one address, with the reason in plain words. */
export interface Verification {
  status: VerificationStatus;
  detail: string;
}

/** Local parts that reach a shared inbox rather than a person. */
export const ROLE_LOCAL_PARTS: readonly string[] = [
  "info", "office", "sales", "admin", "contact", "service", "support", "billing", "hello",
  "contactus", "customerservice", "help", "inquiries", "inquiry", "mail", "frontdesk", "reception", "team", "accounts",
  "accounting", "dispatch", "scheduling", "appointments", "marketing", "webmaster", "postmaster", "noreply", "no-reply",
];

/** The default ZeroBounce-compatible endpoint (GET ?api_key=&email=). */
export const VERIFIER_URL = "https://api.zerobounce.net/v2/validate";

const DISPOSABLE_FILE = path.resolve(import.meta.dirname, "../../reference/disposable-domains.txt");
let disposableCache: Set<string> | undefined;
/** The disposable-domain list, read once from reference/. */
export function disposableDomains(): Set<string> {
  disposableCache ??= loadDomainList(DISPOSABLE_FILE);
  return disposableCache;
}

/** True for a disposable or temporary-mail domain (or a subdomain of one). */
export function isDisposableDomain(domain: string, list: ReadonlySet<string> = disposableDomains()): boolean {
  return domainListed(domain, list);
}

/** The domain part of an address, lower case ("" when there is none). */
export function emailDomain(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  return at > 0 ? e.slice(at + 1) : "";
}

/** The local part of an address, lower case. */
export function emailLocal(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  return at > 0 ? e.slice(0, at) : e;
}

/**
 * A conservative syntax check: one @, a dot-atom local part of at most 64
 * characters (no leading, trailing or doubled dots), and a domain of
 * letter-digit-hyphen labels ending in an alphabetic TLD.
 */
export function isValidEmailSyntax(email: string): boolean {
  const e = email.trim();
  if (e.length > 254 || /\s/.test(e)) return false;
  const m = /^([A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+)@([A-Za-z0-9.-]+)$/.exec(e);
  if (!m) return false;
  const [, local, domain] = m as unknown as [string, string, string];
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return false;
  return /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]!);
}

/** True when the local part (ignoring a +tag and punctuation) is a shared-inbox name such as info or office. */
export function isRoleBased(email: string): boolean {
  const local = emailLocal(email).replace(/\+.*$/, "");
  const bare = local.replace(/[._-]/g, "");
  return ROLE_LOCAL_PARTS.includes(local) || ROLE_LOCAL_PARTS.includes(bare);
}

/** True for the statuses the gate lets an outreach email go to. */
export function isSendableVerification(status: string): boolean {
  return status === "valid" || status === "catch_all" || status === "role_based";
}

/** The default MX lookup: exchange host names, [] when the domain has none. */
async function defaultResolveMx(domain: string): Promise<string[]> {
  const records = await dns.promises.resolveMx(domain);
  return records.map((r) => r.exchange);
}

const NO_RECORD_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN", "ENONAME"]);

/** Verify one address. Never throws: a lookup or API failure becomes "unknown" with the reason. */
export async function verifyEmail(
  email: string,
  opts: { resolveMx?: (domain: string) => Promise<string[]>; verifierApiKey?: string; fetchImpl?: typeof fetch; verifierUrl?: string } = {},
): Promise<Verification> {
  const address = normalizeEmail(email);
  if (!isValidEmailSyntax(address)) return { status: "invalid", detail: `"${email}" is not a valid email address` };
  const domain = emailDomain(address);
  if (isDisposableDomain(domain)) return { status: "disposable", detail: `${domain} is a disposable email domain` };
  if (isFccWirelessDomain(domain)) {
    return { status: "invalid", detail: `${domain} is an FCC wireless domain: commercial email needs express prior authorization (47 CFR 64.3100)` };
  }

  const resolveMx = opts.resolveMx ?? defaultResolveMx;
  let mx: string[];
  try {
    mx = (await resolveMx(domain)).map((h) => h.trim().replace(/\.$/, "")).filter((h) => h !== "");
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (NO_RECORD_CODES.has(code)) return { status: "invalid", detail: `${domain} has no MX records (${code})` };
    return { status: "unknown", detail: `MX lookup for ${domain} failed: ${(err as Error).message}` };
  }
  // An empty answer, or only the RFC 7505 null MX ("."), means the domain accepts no mail.
  if (!mx.length) return { status: "invalid", detail: `${domain} has no MX records (it accepts no mail)` };

  const role = isRoleBased(address);
  if (!opts.verifierApiKey) {
    return { status: "unknown", detail: `${domain} has MX records; no verifier API key, so the mailbox is unconfirmed${role ? " (role-based address)" : ""}` };
  }
  const verdict = await callVerifier(address, opts.verifierApiKey, opts.fetchImpl ?? fetch, opts.verifierUrl ?? VERIFIER_URL);
  if (role && verdict.status === "valid") return { status: "role_based", detail: `role-based address; verifier: ${verdict.detail}` };
  return verdict;
}

/**
 * One call to a ZeroBounce-compatible verifier, mapped to the engine's
 * statuses. The API key goes in the query string (as the API requires) and
 * never into a detail message.
 */
async function callVerifier(email: string, apiKey: string, fetchImpl: typeof fetch, baseUrl: string): Promise<Verification> {
  const url = new URL(baseUrl);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);
  url.searchParams.set("ip_address", "");
  let body: Record<string, unknown>;
  try {
    const res = await fetchImpl(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
    if (!res.ok) return { status: "unknown", detail: `verifier returned HTTP ${res.status}` };
    body = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return { status: "unknown", detail: `verifier call failed: ${(err as Error).message.replaceAll(apiKey, "***")}` };
  }
  if (typeof body.error === "string") return { status: "unknown", detail: `verifier error: ${body.error.replaceAll(apiKey, "***")}` };
  return mapVerifierResult(String(body.status ?? ""), String(body.sub_status ?? ""));
}

/** ZeroBounce status and sub_status to an engine status. Anything unrecognised is "unknown", never "valid". */
export function mapVerifierResult(status: string, subStatus: string): Verification {
  const s = status.trim().toLowerCase();
  const sub = subStatus.trim().toLowerCase();
  const detail = `verifier status ${s || "(blank)"}${sub ? `/${sub}` : ""}`;
  switch (s) {
    case "valid":
      return { status: "valid", detail };
    case "catch-all":
    case "catch_all":
    case "accept_all":
      return { status: "catch_all", detail };
    case "invalid":
    case "spamtrap":
    case "abuse":
      // Spam traps and known complainers are never mailed: treat them as invalid.
      return { status: "invalid", detail };
    case "do_not_mail":
      if (sub === "role_based") return { status: "role_based", detail };
      if (sub === "disposable") return { status: "disposable", detail };
      // toxic, global_suppression, possible_trap, role_based_catch_all, mx_forward: not safe to mail.
      return { status: sub === "role_based_catch_all" ? "risky" : "invalid", detail };
    case "unknown":
      return { status: "unknown", detail };
    default:
      return { status: "unknown", detail };
  }
}
