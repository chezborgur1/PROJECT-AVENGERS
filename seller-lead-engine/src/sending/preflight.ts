import dns from "node:dns";
import { mailboxDomain, type EngineConfig } from "../config.ts";
import { lintTemplates } from "../outreach/templates.ts";
import { addDays, usFederalHolidays } from "../util/dates.ts";
import { coldStartDate, coldWeek, mailboxDailyCap } from "./ramp.ts";

// The checks to pass before the first cold email, and every morning after:
// legal facts in config, sender identity, DNS authentication per sending
// domain, warm-up status per mailbox, and the template lint.
//
// Where each check comes from:
// - Postal address, licensed states and counsel sign-off: CAN-SPAM 16 CFR
//   316.2(p) and the broker-licensing rule (docs/research/compliance.md
//   sections 1 and 6); the gate refuses to send without them.
// - Real sender names (compliance.md section 9 rule 5; Balsam v. Trancos)
//   and a separate sending domain, never the firm's primary domain
//   (docs/research/deliverability.md section 3, "Lookalike sending
//   domains", and section 2 design response).
// - DNS (deliverability.md section 6, "DNS and setup checklist"): one SPF
//   record that includes _spf.google.com (or the configured provider),
//   DKIM at google._domainkey (2048-bit recommended, at least 1024 for
//   Yahoo), DMARC at _dmarc with p=none at minimum. The records existing is
//   not the whole story: Workspace signs with a gappssmtp.com key until
//   custom DKIM is turned on, so a seed test must show d=<sending domain>
//   (verification row 16).
// - Transport: the Gmail connector drafts as one account and cannot set
//   List-Unsubscribe headers; the Gmail API needs an Internal OAuth app so
//   refresh tokens do not expire after 7 days (deliverability.md section 4
//   and verification missed item 3).

/** One preflight result. */
export interface PreflightItem {
  check: string;
  ok: boolean;
  detail: string;
}

type ResolveTxt = (name: string) => Promise<string[][]>;

/** TXT records joined per record; a lookup that finds nothing returns []. Other errors are reported. */
async function txt(resolve: ResolveTxt, name: string): Promise<{ records: string[]; error?: string }> {
  try {
    return { records: (await resolve(name)).map((chunks) => chunks.join("")) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") return { records: [] };
    return { records: [], error: `${name}: DNS lookup failed (${code || (err as Error).message})` };
  }
}

/** SPF check: exactly one v=spf1 record, and it includes the provider. */
export function checkSpf(records: string[], include: string): { ok: boolean; detail: string } {
  const spf = records.filter((r) => /^v=spf1(\s|$)/i.test(r.trim()));
  if (!spf.length) return { ok: false, detail: `no SPF record: publish TXT "v=spf1 include:${include} ~all"` };
  if (spf.length > 1) return { ok: false, detail: `${spf.length} SPF records: receivers treat more than one as a permanent error; merge them into one` };
  const rec = spf[0]!;
  if (!new RegExp(`(^|\\s)include:${include.replace(/\./g, "\\.")}(\\s|$)`, "i").test(rec)) return { ok: false, detail: `SPF "${rec}" does not include ${include}` };
  if (/\s\+all\b/i.test(rec)) return { ok: false, detail: `SPF "${rec}" ends in +all, which lets anyone send as the domain` };
  return { ok: true, detail: rec };
}

/** DKIM check: a key record with a non-empty p=, and its rough size. */
export function checkDkim(records: string[]): { ok: boolean; detail: string } {
  const rec = records.find((r) => /(^|;)\s*p=/i.test(r) || /^v=DKIM1/i.test(r.trim()));
  if (!rec) return { ok: false, detail: "no DKIM key: generate a 2048-bit key in Admin console > Gmail > Authenticate email, publish it, then click Start authentication" };
  const key = /(?:^|;)\s*p=([^;]*)/i.exec(rec)?.[1]?.replace(/\s+/g, "") ?? "";
  if (!key) return { ok: false, detail: "DKIM record has an empty p= (the key is revoked)" };
  // Base64 length of the public key: about 216 characters for 1024-bit RSA, about 392 for 2048-bit.
  const bits = key.length >= 380 ? 2048 : key.length >= 200 ? 1024 : 0;
  if (!bits) return { ok: false, detail: `DKIM key is shorter than 1024 bits (${key.length} base64 characters); Yahoo requires at least 1024` };
  return { ok: true, detail: `${bits === 2048 ? "about 2048-bit" : "about 1024-bit (2048 recommended)"} key published; confirm a seed message shows dkim=pass with d=<this domain>, not gappssmtp.com` };
}

/** DMARC check: one v=DMARC1 record with p=none, quarantine or reject. */
export function checkDmarc(records: string[]): { ok: boolean; detail: string } {
  const dmarc = records.filter((r) => /^v=DMARC1\s*(;|$)/i.test(r.trim()));
  if (!dmarc.length) return { ok: false, detail: 'no DMARC record: publish TXT at _dmarc "v=DMARC1; p=none; rua=mailto:dmarc@<domain>; adkim=r; aspf=r"' };
  if (dmarc.length > 1) return { ok: false, detail: `${dmarc.length} DMARC records: publish exactly one` };
  const policy = /(?:^|;)\s*p=(none|quarantine|reject)\s*(;|$)/i.exec(dmarc[0]!)?.[1]?.toLowerCase();
  if (!policy) return { ok: false, detail: `DMARC "${dmarc[0]}" has no valid p= policy` };
  return { ok: true, detail: `p=${policy}${policy === "none" ? " (the minimum Google, Yahoo and Microsoft accept; move to quarantine after 3-4 clean weeks)" : ""}` };
}

/** Run every preflight check. DNS lookups go through `resolveTxt` (default: the system resolver). */
export async function preflight(
  config: EngineConfig,
  opts: { today: string; templatesDir: string; resolveTxt?: ResolveTxt; dkimSelector?: string; spfInclude?: string },
): Promise<PreflightItem[]> {
  const resolve: ResolveTxt = opts.resolveTxt ?? ((name) => dns.promises.resolveTxt(name));
  const selector = opts.dkimSelector ?? "google";
  const include = opts.spfInclude ?? "_spf.google.com";
  const items: PreflightItem[] = [];
  const add = (check: string, ok: boolean, detail: string) => items.push({ check, ok, detail });

  // Legal facts.
  const address = config.firm.postal_address.trim();
  add("postal address", Boolean(address), address || "firm.postal_address is blank: CAN-SPAM requires a valid postal address in every email (16 CFR 316.2(p))");
  const licensed = config.licensed_states.length > 0 && Boolean(config.licensing_signoff.trim());
  add(
    "licensed states",
    licensed,
    licensed
      ? `${config.licensed_states.join(", ")} (signed off: ${config.licensing_signoff.trim()})`
      : !config.licensed_states.length
        ? "licensed_states is empty: nothing is sent until counsel signs off a state list (Fla. Stat. 475.01, Cal. B&P 10131)"
        : "licensing_signoff is blank: record who signed off the licensed states and when",
  );

  // Senders and mailboxes.
  add("mailboxes", config.mailboxes.length > 0, config.mailboxes.length ? config.mailboxes.map((m) => m.email).join(", ") : "no mailboxes configured");
  const badNames = config.mailboxes.filter((m) => m.sender_name.trim().split(/\s+/).length < 2 || /\b(team|sales|info|office|admin|support|advisory)\b/i.test(m.sender_name));
  add(
    "sender names",
    config.mailboxes.length > 0 && !badNames.length,
    badNames.length
      ? `use a real person's full name, never a team or persona: ${badNames.map((m) => `${m.email} ("${m.sender_name}")`).join(", ")}`
      : config.mailboxes.map((m) => `${m.sender_name.trim()}, ${config.firm.name}`).join("; ") || "no mailboxes",
  );
  const primary = config.firm.website.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const onPrimary = config.mailboxes.filter((m) => primary && mailboxDomain(m.email) === primary);
  add(
    "separate sending domain",
    !onPrimary.length,
    onPrimary.length ? `${onPrimary.map((m) => m.email).join(", ")} send from the firm's primary domain ${primary}: cold email must use a separate sending domain` : `sending domains: ${[...new Set(config.mailboxes.map((m) => mailboxDomain(m.email)))].join(", ") || "none"}`,
  );

  // DNS per sending domain.
  for (const domain of [...new Set(config.mailboxes.map((m) => mailboxDomain(m.email)).filter(Boolean))]) {
    const spf = await txt(resolve, domain);
    const spfCheck = spf.error ? { ok: false, detail: spf.error } : checkSpf(spf.records, include);
    add(`SPF ${domain}`, spfCheck.ok, spfCheck.detail);
    const dkim = await txt(resolve, `${selector}._domainkey.${domain}`);
    const dkimCheck = dkim.error ? { ok: false, detail: dkim.error } : checkDkim(dkim.records);
    add(`DKIM ${selector}._domainkey.${domain}`, dkimCheck.ok, dkimCheck.detail);
    const dmarc = await txt(resolve, `_dmarc.${domain}`);
    const dmarcCheck = dmarc.error ? { ok: false, detail: dmarc.error } : checkDmarc(dmarc.records);
    add(`DMARC _dmarc.${domain}`, dmarcCheck.ok, dmarcCheck.detail);
  }

  // Warm-up per mailbox.
  for (const m of config.mailboxes) {
    const week = coldWeek(m, config, opts.today);
    const cap = mailboxDailyCap(m, config, opts.today);
    const detail = m.paused
      ? "paused in config"
      : week === 0
        ? `warming up: cold sending starts ${coldStartDate(m, config)}`
        : `cold week ${week}: up to ${cap} a day (domain cap ${config.sending.max_per_domain_per_day})`;
    add(`warm-up ${m.email}`, !m.paused && week > 0 && cap > 0, detail);
  }

  // Transport and mode.
  if (config.sending.transport === "outbox") {
    const one = config.mailboxes.length <= 1;
    add(
      "transport outbox",
      one,
      `${one ? "" : `${config.mailboxes.length} mailboxes but the Gmail connector drafts as one signed-in account: run one routine per mailbox, each signed in to its own account, or use gmail_api. `}The connector cannot set List-Unsubscribe headers, so the body's opt-out line is the opt-out mechanism.`,
    );
  } else {
    add("transport gmail_api", true, "Create the OAuth client in the sending Workspace tenant as an Internal app: a Testing-status external app expires refresh tokens after 7 days.");
  }
  add("mode", true, config.sending.mode === "draft" ? "draft: a person reviews and sends every email" : "send: the engine sends without review; keep drafts until about 2 weeks of clean sends (deliverability.md section 4)");

  // Send calendar: federal holidays are skipped automatically; say which are next.
  const horizon = addDays(opts.today, 60);
  const year = Number(opts.today.slice(0, 4));
  const upcoming = [...new Set([...usFederalHolidays(year), ...usFederalHolidays(year + 1), ...config.sending.holidays])].filter((d) => d >= opts.today && d <= horizon).sort();
  add("send calendar", true, `no-send days in the next 60 days: ${upcoming.join(", ") || "none"}; add the late-December lull to sending.holidays`);

  // Templates.
  const issues = lintTemplates(opts.templatesDir, config, { today: opts.today });
  add("templates", !issues.length, issues.length ? issues.join("; ") : "steps 1-3 render and pass the copy and subject lint");
  return items;
}
