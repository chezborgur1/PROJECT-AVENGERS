import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { enrichContacts } from "../src/contacts/enrich.ts";
import { aiDisclosure, buildFooter } from "../src/compliance/footer.ts";
import { Suppression } from "../src/compliance/suppression.ts";
import type { InboundMessage } from "../src/domain/messages.ts";
import { handOffWarmLeads } from "../src/handoff/handoff.ts";
import { loadMultiples } from "../src/readiness/multiples.ts";
import type { ReplyWire } from "../src/replies/classify.ts";
import { processInbox } from "../src/replies/process.ts";
import { weeklyReport } from "../src/report/weekly.ts";
import { scoreAll } from "../src/score/score.ts";
import { clearPause, mailboxHealth } from "../src/sending/health.ts";
import { runSend } from "../src/sending/run.ts";
import { MemoryTransport } from "../src/sending/transports.ts";
import { importCsv } from "../src/sources/csvImport.ts";
import { importDbpr } from "../src/sources/dbpr.ts";
import { buildProspects } from "../src/sources/merge.ts";
import { importSunbiz } from "../src/sources/sunbiz.ts";
import { REPO, tempStores, testConfig } from "./helpers.ts";

// The whole loop on the fictional Tampa Bay samples, offline: import, build,
// enrich (an injected MX resolver and verifier, no network), score, a
// Tuesday send after warm-up through MemoryTransport, four canned replies
// through processInbox (Claude mocked for the one reply the rules cannot
// decide), handoff, the next week's follow-ups, and the weekly report. It
// checks the modules agree with each other, not each module's own rules.

/** What the mocked Claude says about the interested owner's reply: only what he states. */
const INTERESTED_WIRE: ReplyWire = {
  class: "interested",
  opt_out: false,
  complaint: false,
  question: null,
  revenue: 1_800_000,
  revenue_band: null,
  sde: 350_000,
  ebitda: null,
  employees: 12,
  years_owned: null,
  owner_hours_per_week: null,
  recurring_revenue_pct: null,
  top_customer_pct: null,
  owns_real_estate: null,
  license_holder: null,
  timeline: "6-12m",
  motivation: "retirement",
  motivation_detail: "ready to retire",
  wants_readiness_check: "Y",
  books_match_returns: null,
  revenue_trend: "growing",
  manager_in_place: null,
  runs_without_owner: null,
  lease_years_left: null,
  notes: "Owner wants the check and gives revenue, SDE and a 6 to 12 month timeline.",
};

const claudeCalls: string[] = [];
vi.mock("../src/util/claude.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/util/claude.ts")>();
  return {
    ...real,
    claudeAvailable: () => true,
    claude: () => ({
      beta: {
        messages: {
          parse: async (params: { messages: { content: string }[] }) => {
            claudeCalls.push(params.messages[0]!.content);
            return { stop_reason: "end_turn", parsed_output: INTERESTED_WIRE };
          },
        },
      },
    }),
  };
});

const SAMPLES = path.join(REPO, "samples/tampa-bay");
const TEMPLATES = path.join(REPO, "templates/sequence");
const MB1 = "frank@ambadvisory-mail.example";
const MB2 = "frank.e@ambadvisory-mail.example";
// Mailboxes started warm-up on 2026-09-01 with 3 warm-up weeks; 2026-10-20 is a Tuesday in cold week 5.
const SEND_DAY = "2026-10-20";
const REPLY_DAY = "2026-10-21";
const NEXT_SEND_DAY = "2026-10-27";

function e2eConfig() {
  const base = testConfig();
  return testConfig({
    targeting: { ...base.targeting, exclude_name_patterns: [...base.targeting.exclude_name_patterns, "frostline"] },
    metros: { tampa_bay: { ...base.metros.tampa_bay, zip_prefixes: ["335", "336", "337", "346", "347"] } },
  });
}

/** A verifier that marks every address valid, and an MX resolver that finds a server: no network. */
const verifierImpl = (async () => new Response(JSON.stringify({ status: "valid", sub_status: "" }), { status: 200 })) as typeof fetch;
const resolveMx = async () => ["mx.mail.example"];

/** Import the samples, build, enrich, score and run the first Tuesday send: the loop up to the first replies. */
async function throughFirstSend() {
  const config = e2eConfig();
  const stores = tempStores();
  const snap = { snapshotDate: "2026-10-01" };
  const imports = [
    importSunbiz(path.join(SAMPLES, "sunbiz_cordata.txt"), stores, snap),
    importDbpr(path.join(SAMPLES, "dbpr_cilb_licensees.csv"), stores, snap),
    importCsv("contacts", path.join(SAMPLES, "contacts.csv"), stores, snap),
    importCsv("open_poi", path.join(SAMPLES, "open_poi.csv"), stores, snap),
  ];
  const built = buildProspects(stores, config, { now: new Date("2026-10-19T12:00:00Z") });
  const enriched = await enrichContacts(stores, config, { now: new Date("2026-10-19T12:00:00Z"), discover: false, verify: true, resolveMx, verifierApiKey: "test-key", fetchImpl: verifierImpl });
  const scored = await scoreAll(stores, config, { today: "2026-10-19", now: new Date("2026-10-19T12:00:00Z") });
  const transport = new MemoryTransport();
  const sent = await runSend(stores, config, { today: SEND_DAY, now: new Date(`${SEND_DAY}T13:00:00Z`), transport, templatesDir: TEMPLATES });
  const byName = (fragment: string) => stores.prospects.rows().find((p) => p.business_name.includes(fragment))!;
  const touchFor = (prospectId: string) => stores.touches.rows().find((t) => t.prospect_id === prospectId && t.kind === "outreach" && t.step === 1)!;
  return { config, stores, imports, built, enriched, scored, transport, sent, byName, touchFor };
}

describe("the whole loop on the Tampa Bay samples", () => {
  it("imports, scores, sends, processes replies, hands off and reports, with every module agreeing", async () => {
    const { config, stores, imports, built, enriched, scored, transport, sent, byName, touchFor } = await throughFirstSend();

    // ---- import and build
    expect(imports.map((r) => [r.imported, r.invalid.length])).toEqual([[12, 0], [13, 0], [13, 0], [9, 0]]);
    expect(built.created).toBe(11);
    expect(built.skipped.map((x) => x.name)).toEqual(["Orange Blossom Plumbing, Inc.", "Bay Area Roofing Specialists Inc"]);

    // ---- enrich and score
    expect(enriched.byStatus).toMatchObject({ valid: 8, role_based: 2 });
    // The business with only info@ keeps it, verified role_based.
    expect(byName("Bayshore")).toMatchObject({ email: "info@bayshoreplumbing.example", email_verification: "role_based" });
    // Gulfside's owner address beats the office@ inbox.
    expect(byName("Gulfside").email).toBe("don.holloway@gulfsideair.example");
    expect(scored).toMatchObject({ scored: 7, excluded: 4, held: 0 });
    expect(byName("Frostline")).toMatchObject({ status: "excluded", exclude_reason: 'franchise or chain name (matches "frostline")' });
    expect(byName("Harbor").exclude_reason).toMatch(/^inactive entity/);
    expect(byName("Wesley Chapel").exclude_reason).toMatch(/^tenure 9 years/);
    // One sendability rule everywhere: the role-based-only business is scored (not held) and step 1 goes to it.
    expect(sent.delivered.map((d) => d.prospectId)).toContain(byName("Bayshore").prospect_id);

    // ---- send (draft mode, the default)
    expect(sent.blocked).toEqual([]);
    expect(sent.failed).toEqual([]);
    expect(sent.delivered.length).toBe(6);
    expect(sent.plan.skipped).toEqual([{ prospectId: byName("Northstar").prospect_id, reason: expect.stringMatching(/^jurisdiction: .*\.ca/) }]);
    expect(transport.delivered.every((d) => d.mode === "draft" && d.msg.kind === "outreach" && d.msg.step === 1)).toBe(true);
    for (const { msg } of transport.delivered) {
      const mailbox = config.mailboxes.find((m) => m.email === msg.mailbox)!;
      expect(msg.body).toContain(buildFooter(config, mailbox));
      expect(msg.headers["List-Unsubscribe"]).toMatch(/^<mailto:/);
    }

    // ---- replies
    const gulf = byName("Gulfside");
    const pipe = byName("Pinellas Pipe");
    const hector = byName("Hector");
    const sunrise = byName("Sunrise");
    const at = (h: number) => `${REPLY_DAY}T${String(h).padStart(2, "0")}:00:00Z`;
    const replyTo = (p: typeof gulf, over: Partial<InboundMessage>): InboundMessage => {
      const t = touchFor(p.prospect_id);
      return { id: `in-${p.prospect_id}`, threadId: t.thread_id, mailbox: t.mailbox, from: `${p.owner_name} <${p.email}>`, to: t.mailbox, subject: `Re: ${t.subject}`, date: at(9), text: "", headers: {}, ...over };
    };
    const messages: InboundMessage[] = [
      replyTo(gulf, { text: "Yes, I'm interested. Revenue last year was about $1.8M and I take home about $350K. I'm ready to retire and would like to sell in the next 6 to 12 months. We have 12 people.\n\nOn Tue, Oct 20, 2026 at 9:00 AM Frank Example wrote:\n> Hi Donald,\n> Reply 'unsubscribe' and I will not email you again." }),
      replyTo(pipe, { text: "Please remove me from your list.", date: at(10) }),
      {
        ...replyTo(hector, { date: at(11) }),
        id: "in-bounce-hector",
        from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
        subject: "Delivery Status Notification (Failure)",
        text: `** Address not found **\n\nYour message wasn't delivered to ${hector.email} because the address couldn't be found.\n\nThe response from the remote server was:\n550 5.1.1 The email account that you tried to reach does not exist.`,
      },
      replyTo(sunrise, { subject: "Automatic reply: Exit-readiness check", text: "I am out of the office until Monday, October 26 with limited access to email.", date: at(12) }),
    ];
    const outreachDrafts = transport.delivered.length;
    const processed = await processInbox(stores, config, { now: new Date(`${REPLY_DAY}T14:00:00Z`), today: REPLY_DAY, messages, transport });
    expect(processed).toMatchObject({ received: 4, duplicates: 0, unmatched: 0, suppressed: 2, drafted: 1, errors: [], policyBounces: 0 });
    expect(processed.byClass).toEqual({ interested: 1, unsubscribe: 1, bounce: 1, auto_reply: 1 });
    // Only the reply the rules could not decide went to Claude, with the quoted history stripped.
    expect(claudeCalls.length).toBe(1);
    expect(claudeCalls[0]).toContain("$1.8M");
    expect(claudeCalls[0]).not.toContain("Reply 'unsubscribe'");

    // Suppression: the opt-out and the hard bounce, permanently, by email and prospect id.
    const suppression = new Suppression(stores.suppression);
    expect(suppression.check(pipe.email)?.reason).toBe("opt_out");
    expect(suppression.check(hector.email)?.reason).toBe("bounce");
    expect(suppression.check("", pipe.prospect_id)).toBeDefined();
    expect(suppression.check(gulf.email)).toBeUndefined();
    expect(suppression.check(sunrise.email)).toBeUndefined();
    const status = (id: string) => stores.prospects.rows().find((p) => p.prospect_id === id)!;
    expect(status(pipe.prospect_id).status).toBe("dnc");
    expect(status(hector.prospect_id).status).toBe("dnc");
    expect(status(gulf.prospect_id).status).toBe("replied");
    // The out-of-office pauses the sequence a week instead of stopping it.
    expect(status(sunrise.prospect_id)).toMatchObject({ status: "in_sequence", next_touch_date: "2026-10-28" });

    // The interested owner is a lead with the facts he stated, and warm.
    const lead = stores.leads.rows().find((l) => l.prospect_id === gulf.prospect_id)!;
    expect(lead).toMatchObject({ stage: "warm", revenue: 1_800_000, sde: 350_000, employees: 12, timeline: "6-12m", motivation: "retirement", wants_readiness_check: "Y", revenue_trend: "growing" });
    expect(stores.leads.rows().length).toBe(1);

    // The answer is a draft, with the AI disclosure and the footer, threaded on the owner's reply.
    const replies = transport.delivered.filter((d) => d.msg.kind === "reply");
    expect(replies.length).toBe(1);
    const answer = replies[0]!;
    const mailbox = config.mailboxes.find((m) => m.email === answer.msg.mailbox)!;
    expect(answer.mode).toBe("draft");
    expect(answer.msg.to).toBe(gulf.email);
    expect(answer.msg.subject).toMatch(/^Re: /);
    expect(answer.msg.threadId).toBe(touchFor(gulf.prospect_id).thread_id);
    expect(answer.msg.body).toContain(aiDisclosure(config, mailbox));
    expect(answer.msg.body).toContain("reviews every reply before it is sent");
    expect(answer.msg.body).toContain(buildFooter(config, mailbox));
    expect(stores.touches.rows().filter((t) => t.kind === "reply")).toEqual([expect.objectContaining({ prospect_id: gulf.prospect_id, status: "drafted", mode: "draft" })]);

    // Running the same messages again changes nothing.
    const again = await processInbox(stores, config, { now: new Date(`${REPLY_DAY}T15:00:00Z`), today: REPLY_DAY, messages, transport });
    expect(again).toMatchObject({ duplicates: 4, drafted: 0, suppressed: 0 });
    expect(transport.delivered.length).toBe(7);

    // ---- handoff
    const handed = handOffWarmLeads(stores, config, { now: new Date(`${REPLY_DAY}T16:00:00Z`), today: REPLY_DAY, multiples: loadMultiples(path.join(REPO, "reference/multiples.json")) });
    expect(handed.map((h) => h.prospectId)).toEqual([gulf.prospect_id]);
    const note = fs.readFileSync(handed[0]!.file, "utf8");
    expect(note).toContain("Size stated: revenue about $1.8M, SDE about $350K, 12 employees (per owner).");
    expect(note).toContain("Timeline: in 6 to 12 months (per owner).");
    expect(note).toContain("| Revenue trend (3 years) | growing | Per owner |");
    // The owner's name came from the state record (the reply loop copies it), so it is not attributed to the owner.
    expect(note).toContain("| Owner | Donald R Holloway | Per state records |");
    expect(answer.msg.body).not.toContain("Inc..");
    // Copy never states the internal age estimate.
    expect(note).not.toMatch(/\bage[sd]?\b|\byears old\b/i);
    expect(stores.leads.rows()[0]).toMatchObject({ stage: "handed_off", handed_off_at: `${REPLY_DAY}T16:00:00Z` });
    const checks = fs.readdirSync(stores.dir.checks);
    expect(checks.length).toBe(1);

    // ---- weekly report for the 7 days ending the reply day
    const { metrics, markdown, file } = weeklyReport(stores, config, { today: REPLY_DAY });
    expect(fs.existsSync(file)).toBe(true);
    expect(metrics).toMatchObject({
      week: "2026-W43",
      sent: 0, // draft mode: a person sends each draft
      drafted: 6, // the step-1 drafts
      newProspectsContacted: 6,
      humanReplies: 2, // interested and the opt-out
      positiveReplies: 1,
      optOuts: 1,
      bounces: 1,
      complaints: 0,
      qualified: 1,
      handedOff: 1,
    });
    // Rates use what went out (sent or drafted), the same basis as the mailbox guardrail.
    expect(metrics.replyRate).toBeCloseTo(2 / 6);
    expect(metrics.bounceRate).toBeCloseTo(1 / 6);
    const hectorBox = touchFor(hector.prospect_id).mailbox;
    expect(metrics.byMailbox[hectorBox]!.bounces).toBe(1);
    expect(Object.values(metrics.byMailbox).reduce((n, m) => n + m.bounces, 0)).toBe(1);
    // The report's pause flags are the sender's own health verdicts.
    for (const mb of [MB1, MB2]) expect(metrics.byMailbox[mb]!.paused).toBe(mailboxHealth(stores, config, mb, REPLY_DAY).pause);
    expect(markdown).toContain("| Suppressed addresses (permanent) |");
    expect(markdown).toMatch(/\| Handed off or later \| 1 \|/);
    expect(markdown).toMatch(/\| Suppressed addresses \(permanent\) \| 4 \|/); // two emails and two prospect ids
    expect(metrics.alarms.some((x) => x.startsWith("Hard bounce rate 16.7%"))).toBe(true);


    // ---- the next send day: follow-ups go only where the loop allows
    const next = new MemoryTransport();
    const followUps = await runSend(stores, config, { today: NEXT_SEND_DAY, now: new Date(`${NEXT_SEND_DAY}T13:00:00Z`), transport: next, templatesDir: TEMPLATES });
    expect(followUps.blocked).toEqual([]);
    const stepTwo = followUps.delivered.map((d) => d.prospectId).sort();
    expect(stepTwo).toEqual([byName("Bayshore").prospect_id, byName("Tarpon").prospect_id].sort());
    expect(next.delivered.every((d) => d.msg.step === 2 && d.msg.headers["In-Reply-To"])).toBe(true);
    expect(next.delivered[0]!.msg.body).toContain("the buyer's loan is repaid from what the business earns after you step back");
    // Suppressed addresses never reach a transport again, and neither do the replied or paused prospects.
    const everyRecipient = [...transport.delivered.slice(outreachDrafts), ...next.delivered].map((d) => d.msg.to);
    for (const blocked of [pipe.email, hector.email]) expect(everyRecipient).not.toContain(blocked);
    expect(next.delivered.map((d) => d.msg.to)).not.toContain(gulf.email);
    expect(next.delivered.map((d) => d.msg.to)).not.toContain(sunrise.email);
    // The .ca address stays blocked by jurisdiction; nothing else is even considered.
    expect(followUps.plan.skipped).toEqual([{ prospectId: byName("Northstar").prospect_id, reason: expect.stringMatching(/^jurisdiction: /) }]);
    expect(followUps.plan.paused).toEqual({});
  });

  it("pauses a mailbox on an authentication bounce without suppressing the owner, and resumes once a person clears it", async () => {
    const { config, stores, transport, byName, touchFor } = await throughFirstSend();
    const tarpon = byName("Tarpon");
    const t = touchFor(tarpon.prospect_id);
    const bounce: InboundMessage = {
      id: "in-auth-bounce",
      threadId: t.thread_id,
      mailbox: t.mailbox,
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      to: t.mailbox,
      subject: "Delivery Status Notification (Failure)",
      date: `${REPLY_DAY}T10:00:00Z`,
      text: `Your message wasn't delivered to ${tarpon.email}.\n\nThe response was:\n550-5.7.26 This mail has been blocked because the sender is unauthenticated. Gmail requires all senders to authenticate with either SPF or DKIM.`,
      headers: {},
    };
    const processed = await processInbox(stores, config, { now: new Date(`${REPLY_DAY}T14:00:00Z`), today: REPLY_DAY, messages: [bounce], transport });
    expect(processed).toMatchObject({ byClass: { bounce: 1 }, suppressed: 0, policyBounces: 1 });
    expect(new Suppression(stores.suppression).check(tarpon.email, tarpon.prospect_id)).toBeUndefined();
    expect(stores.prospects.rows().find((p) => p.prospect_id === tarpon.prospect_id)!.status).toBe("in_sequence");
    const health = mailboxHealth(stores, config, t.mailbox, REPLY_DAY);
    expect(health).toMatchObject({ pause: true, hardBounces: 0 });

    // The weekly report shows the same pause and counts no hard bounce.
    const week = weeklyReport(stores, config, { today: REPLY_DAY }).metrics;
    expect(week.bounces).toBe(0);
    expect(week.byMailbox[t.mailbox]!.paused).toBe(true);
    expect(week.alarms.find((a) => a.startsWith(`${t.mailbox} is paused.`))).toMatch(/authentication rejection bounce \(5\.7\.26\)/);

    // While paused, no follow-up leaves that mailbox; the other mailbox carries on.
    const paused = new MemoryTransport();
    const blockedRun = await runSend(stores, config, { today: NEXT_SEND_DAY, now: new Date(`${NEXT_SEND_DAY}T13:00:00Z`), transport: paused, templatesDir: TEMPLATES });
    expect(blockedRun.plan.paused[t.mailbox]).toEqual([expect.stringMatching(/authentication rejection bounce/)]);
    expect(paused.delivered.every((d) => d.msg.mailbox !== t.mailbox)).toBe(true);
    expect(blockedRun.plan.skipped).toContainEqual({ prospectId: tarpon.prospect_id, reason: expect.stringMatching(/is paused/) });

    // A person fixes DNS and clears the pause; the same day's run sends the follow-up from the same mailbox.
    clearPause(stores, t.mailbox, "Frank Example", new Date(`${NEXT_SEND_DAY}T14:00:00Z`));
    expect(mailboxHealth(stores, config, t.mailbox, NEXT_SEND_DAY).pause).toBe(false);
    const resumed = new MemoryTransport();
    const after = await runSend(stores, config, { today: NEXT_SEND_DAY, now: new Date(`${NEXT_SEND_DAY}T15:00:00Z`), transport: resumed, templatesDir: TEMPLATES });
    expect(after.plan.paused).toEqual({});
    expect(resumed.delivered.find((d) => d.msg.to === tarpon.email)).toMatchObject({ msg: { step: 2, mailbox: t.mailbox } });
  });
});
