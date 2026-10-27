import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leadRef, refLeadId, signupLink, upsertBuyers } from "../src/buyers/core.ts";
import { firmRoot, importSba7a, readAdvisers, readFormD } from "../src/buyers/filings.ts";
import { buyerFunnel, partnerKit, postingKit } from "../src/buyers/funnel.ts";
import { forEachMboxMessage, parseInquiry, processBuyerInbox, syncSellerReplies } from "../src/buyers/inbox.ts";
import { enrichBuyers, planBuyerInvites, recordBuyerDelivery, runBuyerInvites, scoreBuyers } from "../src/buyers/invite.ts";
import { lintBuyerTemplates } from "../src/buyers/outreach.ts";
import { importBuyerList, importRegistrations, parseBuyerList, strategicBuyers } from "../src/buyers/sources.ts";
import { runCli, type CliDeps } from "../src/cli.ts";
import type { EngineConfig } from "../src/config.ts";
import { Suppression } from "../src/compliance/suppression.ts";
import type { InboundMessage } from "../src/domain/messages.ts";
import { planDay } from "../src/sending/planner.ts";
import { MemoryTransport } from "../src/sending/transports.ts";
import { openStores, type Stores } from "../src/store/index.ts";
import { makeProspect, testConfig, tmpDir } from "./helpers.ts";

// The buyer sourcing engine (src/buyers): every source, the merge, the
// tracked links, the invite plan and its caps, the gate, the buyer inbox,
// AMBrain registrations and the funnel. All offline, on fictional data.

const TODAY = "2026-10-27"; // a Tuesday; the test mailboxes are in cold week 6
const NOW = new Date(`${TODAY}T13:00:00Z`);
const WARM = "deals@ambadvisory.example";

function buyerConfig(overrides: Record<string, unknown> = {}): EngineConfig {
  return testConfig({ buyers: { signup_url: "https://ambrain.example/join", mailbox: { email: WARM, sender_name: "Frank Example", sender_title: "Principal" } }, ...overrides });
}

const stores = (): Stores => openStores(tmpDir("lead-engine-buyers-"));

function msg(over: Partial<InboundMessage>): InboundMessage {
  return { id: `m-${Math.random().toString(36).slice(2)}`, threadId: "", mailbox: WARM, from: "", to: WARM, subject: "", date: "2026-10-26T15:00:00Z", text: "", headers: {}, ...over };
}

const INQUIRY = msg({
  id: "inq-1",
  from: "BizBuySell <leads@bizbuysell.com>",
  subject: "New lead for your listing #2213456",
  text: "You have a new inquiry.\n\nName: John Q Smith\nEmail: john.smith@buyer.example\nPhone: (813) 555-0144\nListing ID: 2213456\nMessage: I would like the financials.\n\nThanks",
});

describe("tracked links", () => {
  it("gives each lead a code that names it and rejects a changed one", () => {
    const ref = leadRef("B-00012");
    expect(ref).toMatch(/^b-00012-[0-9a-f]{6}$/);
    expect(refLeadId(ref)).toBe("B-00012");
    expect(refLeadId(ref.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBeUndefined();
    expect(refLeadId("b-00013" + ref.slice(7))).toBeUndefined();
  });

  it("refuses to make a link while AMBrain's address is blank, and carries the code and channel when set", () => {
    expect(() => signupLink(testConfig(), { ref: "b-00001-abcdef", source: "x" })).toThrow(/signup_url is blank/);
    const link = signupLink(buyerConfig(), { ref: "b-00001-abcdef", source: "past-bidders" });
    expect(link).toBe("https://ambrain.example/join?ref=b-00001-abcdef&src=past-bidders");
  });
});

describe("buyer lists", () => {
  it("reads common header names and skips rows nobody can be reached through", () => {
    const r = parseBuyerList("First Name,Last Name,E-mail Address,Firm,Phone Number,State,Listing ID\nJane,Buyer,JANE@Buyer.example,Buyer Capital,813-555-0101,Florida,2213456\n,,,Nobody Co,,,\nBad,Row,not-an-email,,,,\n", { kind: "past_bidder", source: "Past Bidders", label: "bidders.csv" });
    expect(r.incoming).toHaveLength(1);
    expect(r.incoming[0]).toMatchObject({ name: "Jane Buyer", email: "jane@buyer.example", company: "Buyer Capital", state: "FL", source: "past-bidders", interest: "listing 2213456" });
    expect(r.skipped.map((s) => s.line)).toEqual([3, 4]);
  });

  it("keeps one record per buyer across sources, with the warmer kind and every source noted", () => {
    const s = stores();
    importBuyerList(s, "Name,Email,Company\nJane Buyer,jane@buyer.example,Buyer Capital\n", { kind: "conference", source: "acg-2026", label: "acg.csv", now: NOW });
    importBuyerList(s, "Name,Email,Phone\nJane Buyer,Jane@Buyer.example,813-555-0101\n", { kind: "past_bidder", source: "past-bidders", label: "bidders.csv", now: NOW });
    const rows = s.buyerLeads.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "past_bidder", source: "acg-2026", phone: "813-555-0101", company: "Buyer Capital" });
    expect(rows[0]!.notes).toContain("Also found: bidders.csv");
    expect(rows[0]!.ref).toBe(leadRef(rows[0]!.lead_id));
  });
});

describe("listing inquiries", () => {
  it("reads the buyer's name, address, phone and listing from a listing site's notification", () => {
    const p = parseInquiry(INQUIRY, buyerConfig());
    expect(p?.platform).toBe("bizbuysell");
    expect(p?.buyer).toMatchObject({ kind: "inquirer", name: "John Q Smith", email: "john.smith@buyer.example", source: "bizbuysell" });
    expect(p?.buyer.interest).toContain("listing 2213456");
    expect(p?.buyer.source_detail).toBe("Bizbuysell inquiry about listing 2213456 on 2026-10-26");
  });

  it("falls back to the Reply-To address, and ignores mail from anyone but a listing site", () => {
    const c = buyerConfig();
    const viaReplyTo = parseInquiry(msg({ from: "BizQuest <noreply@bizquest.com>", headers: { "reply-to": "Ann Lee <ann@lee.example>" }, text: "A buyer is interested in your listing." }), c);
    expect(viaReplyTo?.buyer.email).toBe("ann@lee.example");
    expect(parseInquiry(msg({ from: "someone@else.example", text: "Email: x@y.example" }), c)).toBeUndefined();
  });
});

describe("the buyer inbox", () => {
  it("turns an inquiry into a lead once, however often the message is read", () => {
    const s = stores();
    const c = buyerConfig();
    const first = processBuyerInbox(s, c, { messages: [INQUIRY], now: NOW });
    expect(first.inquiries).toHaveLength(1);
    const again = processBuyerInbox(s, c, { messages: [INQUIRY], now: NOW });
    expect(again.duplicates).toBe(1);
    expect(s.buyerLeads.rows()).toHaveLength(1);
    expect(s.buyerInbound.rows()[0]).toMatchObject({ class: "inquiry", platform: "bizbuysell" });
  });

  it("suppresses an opt-out for good, marks a hard bounce, and stops invitations on a reply", () => {
    const s = stores();
    const c = buyerConfig();
    importBuyerList(s, "Name,Email\nA One,a@one.example\nB Two,b@two.example\nC Three,c@three.example\n", { kind: "past_bidder", source: "past-bidders", label: "l.csv", now: NOW });
    processBuyerInbox(s, c, {
      now: NOW,
      messages: [
        msg({ from: "a@one.example", subject: "Re: Businesses for sale", text: "Please unsubscribe me." }),
        msg({ from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", text: "Address not found. Your message wasn't delivered to b@two.example because the address couldn't be found. 550 5.1.1 The email account that you tried to reach does not exist." }),
        msg({ from: "c@three.example", subject: "Re: Businesses for sale", text: "Thanks, what industries do you cover these days?" }),
      ],
    });
    const by = new Map(s.buyerLeads.rows().map((l) => [l.email, l]));
    expect(by.get("a@one.example")?.status).toBe("opted_out");
    expect(by.get("b@two.example")?.status).toBe("bounced");
    expect(by.get("c@three.example")?.status).toBe("replied");
    const sup = new Suppression(s.suppression);
    expect(sup.check("a@one.example")?.reason).toBe("opt_out");
    expect(sup.check("b@two.example")?.reason).toBe("bounce");
  });

  it("holds someone who writes about buying for a person to review, but never a seller-side owner", () => {
    const s = stores();
    s.prospects.upsert([makeProspect({ email: "owner@seller.example" })]);
    processBuyerInbox(s, buyerConfig(), {
      now: NOW,
      messages: [
        msg({ from: "Pat Buyer <pat@fund.example>", subject: "Your listing", text: "We are looking to acquire a business like this. Can you send the NDA?" }),
        msg({ from: "owner@seller.example", subject: "Asking price", text: "What asking price would my business get?" }),
      ],
    });
    const leads = s.buyerLeads.rows();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ email: "pat@fund.example", kind: "correspondent", status: "review" });
  });

  it("carries the seller reply loop's verdicts onto buyers invited from the sending mailboxes", () => {
    const s = stores();
    importBuyerList(s, "Name,Email\nD Four,d@four.example\n", { kind: "fund", source: "sec-form-d", label: "l.csv", now: NOW });
    s.replies.upsert([{ reply_id: "r1", prospect_id: "", thread_id: "t9", mailbox: "frank@ambadvisory-mail.example", from_email: "d@four.example", subject: "Re: Lower middle market deal flow", received_at: "2026-10-26T15:00:00Z", snippet: "stop", class: "unsubscribe", classifier: "rules", opt_out: "Y", bounce_type: "", processed_at: "", response_touch_id: "", error: "" }]);
    expect(syncSellerReplies(s, NOW).optedOut).toBe(1);
    expect(s.buyerLeads.rows()[0]!.status).toBe("opted_out");
    expect(syncSellerReplies(s, NOW).optedOut).toBe(0);
  });

  it("reads a Google Takeout mbox, skipping what the mailbox sent", () => {
    const dir = tmpDir("mbox-");
    const file = path.join(dir, "all.mbox");
    const body64 = Buffer.from("Name: Lee Park\nEmail: lee@park.example\nListing ID: 998877\n").toString("base64");
    fs.writeFileSync(
      file,
      [
        "From 1234@xxx Mon Oct 26 15:00:00 +0000 2026",
        "X-GM-THRID: 111",
        "X-Gmail-Labels: Inbox",
        "Message-ID: <a1@bizbuysell.com>",
        "From: BizBuySell <leads@bizbuysell.com>",
        "Subject: =?UTF-8?B?TmV3IGxlYWQ=?=",
        "Date: Mon, 26 Oct 2026 15:00:00 +0000",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        body64,
        "",
        "From 5678@xxx Mon Oct 26 16:00:00 +0000 2026",
        "X-Gmail-Labels: Sent",
        "Message-ID: <a2@ambadvisory.example>",
        `From: Frank <${WARM}>`,
        "Subject: Re: something",
        "",
        "Our own reply.",
        "",
      ].join("\n"),
    );
    const seen: InboundMessage[] = [];
    const counts = forEachMboxMessage(file, WARM, (m) => seen.push(m));
    expect(counts).toEqual({ messages: 1, sent: 1 });
    expect(seen[0]).toMatchObject({ id: "a1@bizbuysell.com", threadId: "111", subject: "New lead" });
    expect(parseInquiry(seen[0]!, buyerConfig())?.buyer.email).toBe("lee@park.example");
  });
});

describe("strategic buyers", () => {
  it("takes larger businesses the seller side is done with, and the seller planner then leaves them alone", () => {
    const s = stores();
    const c = buyerConfig();
    const done = makeProspect({ status: "completed", staff_count: 30, staff_source: "website_stated", email: "boss@big.example", email_verification: "valid" });
    const next = makeProspect({ status: "scored", tier: "A", staff_count: 40, staff_source: "website_stated" });
    const small = makeProspect({ status: "completed", staff_count: 5, staff_source: "website_stated" });
    const later = makeProspect({ status: "scored", tier: "C", staff_count: 25, staff_source: "website_stated", email: "c@tierc.example", email_verification: "valid" });
    s.prospects.upsert([done, next, small, later]);
    const r = strategicBuyers(s, c);
    expect(r.incoming.map((b) => b.prospect_id).sort()).toEqual([done.prospect_id, later.prospect_id].sort());
    expect(r.skipped).toBe(1);
    upsertBuyers(s, r.incoming, NOW);
    // Once the buyer side has the business ready to invite, the seller side skips it even if it scores into a sending tier.
    s.buyerLeads.upsert(s.buyerLeads.rows().map((l) => ({ ...l, status: "ready" as const })));
    s.prospects.upsert([{ ...later, tier: "A" }]);
    const plan = planDay(s, c, { today: TODAY });
    expect(plan.items.map((i) => i.prospectId)).not.toContain(later.prospect_id);
    expect(plan.skipped.find((x) => x.prospectId === later.prospect_id)?.reason).toMatch(/invited as a buyer/);
  });
});

describe("invitations", () => {
  function seeded(config = buyerConfig()) {
    const s = stores();
    processBuyerInbox(s, config, { messages: [INQUIRY], now: NOW });
    importBuyerList(s, "Name,Email\nJane Buyer,jane@buyer.example\n", { kind: "past_bidder", source: "past-bidders", label: "l.csv", now: NOW });
    importBuyerList(s, "Name,Email,Company\nCold Fund,cold@fund.example,Cold Fund Partners\n", { kind: "fund", source: "sec-form-d", label: "d.csv", now: NOW });
    scoreBuyers(s, config, { today: TODAY, now: NOW });
    return s;
  }

  it("answers fresh inquiries first, then warm buyers, and holds a cold address until it is verified", () => {
    const s = seeded();
    const plan = planBuyerInvites(s, buyerConfig(), { today: TODAY });
    expect(plan.items.map((i) => i.template)).toEqual(["inquiry-reply", "invite-warm-1"]);
    expect(plan.items.every((i) => i.mailbox === WARM)).toBe(true);
    expect(s.buyerLeads.rows().find((l) => l.email === "cold@fund.example")?.status).toBe("new");
    s.buyerLeads.upsert(s.buyerLeads.rows().filter((l) => l.kind === "fund").map((l) => ({ ...l, email_verification: "valid" as const })));
    scoreBuyers(s, buyerConfig(), { today: TODAY, now: NOW });
    const cold = planBuyerInvites(s, buyerConfig(), { today: TODAY }).items.find((i) => i.template === "invite-fund-1");
    expect(cold?.mailbox).toMatch(/@ambadvisory-mail\.example$/);
  });

  it("plans nothing on a day that is not a send day, or while AMBrain's address is blank", () => {
    const s = seeded();
    expect(planBuyerInvites(s, buyerConfig(), { today: "2026-10-26" }).reason).toMatch(/send_days/);
    expect(planBuyerInvites(s, testConfig(), { today: TODAY }).reason).toMatch(/signup_url is blank/);
  });

  it("takes cold invitations only from what the seller plan leaves of each mailbox's cap", () => {
    const s = seeded();
    const config = buyerConfig({ sending: { max_per_mailbox_per_day: 1 } });
    s.buyerLeads.upsert(s.buyerLeads.rows().filter((l) => l.kind === "fund").map((l) => ({ ...l, email_verification: "valid" as const })));
    s.prospects.upsert([makeProspect(), makeProspect()]);
    scoreBuyers(s, config, { today: TODAY, now: NOW });
    const plan = planBuyerInvites(s, config, { today: TODAY });
    expect(plan.items.some((i) => i.template === "invite-fund-1")).toBe(false);
    expect(plan.skipped.find((x) => /no sending mailbox has room/.test(x.reason))).toBeTruthy();
  });

  it("delivers gated drafts with the buyer's own link, the footer and the notice, and schedules the follow-up", async () => {
    const s = seeded();
    const config = buyerConfig();
    const t = new MemoryTransport();
    const r = await runBuyerInvites(s, config, { today: TODAY, now: NOW, transport: t });
    expect(r.blocked).toEqual([]);
    expect(r.delivered).toHaveLength(2);
    const jane = s.buyerLeads.rows().find((l) => l.email === "jane@buyer.example")!;
    const sent = t.delivered.find((d) => d.msg.to === "jane@buyer.example")!;
    expect(sent.mode).toBe("draft");
    expect(sent.msg.body).toContain(`ref=${jane.ref}&src=past-bidders`);
    expect(sent.msg.body).toContain("100 Example Street");
    expect(sent.msg.body).toContain("This is a marketing email from AMB Advisory Services.");
    expect(sent.msg.headers["List-Unsubscribe"]).toContain("unsubscribe%20BT-");
    expect(jane).toMatchObject({ status: "invited", invite_step: 1, next_invite_date: "2026-11-02" });

    // The follow-up: same mailbox, "Re:" the first subject, in the same thread.
    const later = new Date("2026-11-03T13:00:00Z");
    const t2 = new MemoryTransport();
    const r2 = await runBuyerInvites(s, config, { today: "2026-11-03", now: later, transport: t2 });
    const follow = t2.delivered.find((d) => d.msg.to === "jane@buyer.example")!;
    expect(r2.delivered.find((d) => d.leadId === jane.lead_id)?.template).toBe("invite-warm-2");
    expect(follow.msg.subject).toBe("Re: Businesses for sale from AMB Advisory");
    expect(follow.msg.headers["In-Reply-To"]).toBeTruthy();
    expect(follow.msg.mailbox).toBe(WARM);
  });

  it("blocks every email while licensing is not signed off, and keeps the reasons", async () => {
    const s = seeded();
    const config = buyerConfig({ licensed_states: [], licensing_signoff: "" });
    const t = new MemoryTransport();
    const r = await runBuyerInvites(s, config, { today: TODAY, now: NOW, transport: t });
    expect(t.delivered).toHaveLength(0);
    expect(r.blocked[0]!.reasons.join(" ")).toMatch(/licensed_states is empty/);
    expect(s.buyerTouches.rows().every((x) => x.status === "cancelled")).toBe(true);
  });

  it("never emails a suppressed buyer", async () => {
    const s = seeded();
    new Suppression(s.suppression).add("jane@buyer.example", "email", "opt_out", "test", NOW);
    const t = new MemoryTransport();
    await runBuyerInvites(s, buyerConfig(), { today: TODAY, now: NOW, transport: t });
    expect(t.delivered.map((d) => d.msg.to)).not.toContain("jane@buyer.example");
  });

  it("records what the outbox routine did through the shared record command, and a failed first email puts the buyer back in line", async () => {
    const cwd = tmpDir("lead-engine-buyers-cli-");
    fs.mkdirSync(path.join(cwd, "config"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "config/engine.config.json"), JSON.stringify({ ...buyerConfig() }));
    const s = openStores(path.join(cwd, "data"));
    importBuyerList(s, "Name,Email\nJane Buyer,jane@buyer.example\n", { kind: "past_bidder", source: "past-bidders", label: "l.csv", now: NOW });
    scoreBuyers(s, buyerConfig(), { today: TODAY, now: NOW });
    const lines: string[] = [];
    const deps: CliDeps = { cwd, env: {}, today: TODAY, now: NOW, log: (l) => lines.push(l), resolveTxt: async () => [] };
    // No transport injected: the outbox, whose touches wait to be recorded.
    expect(await runCli(["buyers", "send"], deps)).toBe(0);
    const touch = s.buyerTouches.rows()[0]!;
    expect(touch.status).toBe("queued");
    expect(fs.existsSync(path.join(cwd, "data/outbox", TODAY, `${touch.touch_id}.json`))).toBe(true);
    expect(await runCli(["record", touch.touch_id, "failed", "--error", "connector down"], deps)).toBe(0);
    expect(s.buyerLeads.rows()[0]!.status).toBe("ready");
    expect(() => recordBuyerDelivery(s, touch.touch_id, { status: "sent" }, NOW)).not.toThrow();
    expect(s.buyerTouches.rows()[0]!.status).toBe("sent");
  });
});

describe("enrichment", () => {
  it("borrows a fund's website from its adviser's filing, finds the address the site publishes, and verifies cold addresses", async () => {
    const s = stores();
    upsertBuyers(s, [
      { kind: "fund", company: "Gulf Harbor Capital Partners", name: "Dana Reed", source: "sec-form-d", source_detail: "Form D" },
      { kind: "adviser", company: "Gulf Harbor Capital Management", website: "gulfharbor.example", source: "sec-form-adv", source_detail: "ADV" },
    ], NOW);
    const pages: Record<string, string> = {
      "https://gulfharbor.example/robots.txt": "",
      "https://gulfharbor.example/": "<html><body>Contact dana.reed@gulfharbor.example or info@gulfharbor.example</body></html>",
    };
    const fetchImpl = (async (url: string) => {
      const body = pages[String(url)];
      return body === undefined ? new Response("", { status: 404 }) : new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    const r = await enrichBuyers(s, buyerConfig(), { now: NOW, discover: true, verify: true, fetchImpl, resolveMx: async () => ["mx.gulfharbor.example"] });
    expect(r.websites).toBe(1);
    const fund = s.buyerLeads.rows().find((l) => l.kind === "fund")!;
    expect(fund).toMatchObject({ website: "gulfharbor.example", email: "dana.reed@gulfharbor.example", email_source: "website", email_verification: "unknown", status: "new" });
  });
});

describe("public filings", () => {
  it("keeps private equity and search funds from a Form D data set, one lead per firm", () => {
    const dir = tmpDir("formd-");
    const w = (name: string, rows: string[][]) => fs.writeFileSync(path.join(dir, name), rows.map((r) => r.join("\t")).join("\n"));
    w("FORMDSUBMISSION.tsv", [["ACCESSIONNUMBER", "FILING_DATE"], ["1", "2026-08-01"], ["2", "2026-09-01"], ["3", "2026-09-02"], ["4", "2026-09-03"], ["5", "2026-09-04"]]);
    w("OFFERING.tsv", [
      ["ACCESSIONNUMBER", "INDUSTRYGROUPTYPE", "INVESTMENTFUNDTYPE", "TOTALOFFERINGAMOUNT"],
      ["1", "Pooled Investment Fund", "Private Equity Fund", "75000000"],
      ["2", "Pooled Investment Fund", "Private Equity Fund", "120000000"],
      ["3", "Pooled Investment Fund", "Hedge Fund", "50000000"],
      ["4", "Other", "", "900000"],
      ["5", "Pooled Investment Fund", "Other Investment Fund", "20000000"],
    ]);
    w("ISSUERS.tsv", [
      ["ACCESSIONNUMBER", "IS_PRIMARYISSUER_FLAG", "ENTITYNAME", "CITY", "STATEORCOUNTRY", "ISSUERPHONENUMBER"],
      ["1", "YES", "Gulf Harbor Capital Partners Fund II, L.P.", "TAMPA", "FL", "8135550100"],
      ["2", "YES", "Gulf Harbor Capital Partners Fund III, L.P.", "TAMPA", "FL", "8135550100"],
      ["3", "YES", "Quant Macro Fund LP", "NEW YORK", "NY", ""],
      ["4", "YES", "Sunrise Search Partners LLC", "BOSTON", "MA", ""],
      ["5", "YES", "Bayshore Real Estate Income Fund LP", "TAMPA", "FL", ""],
    ]);
    w("RELATEDPERSONS.tsv", [["ACCESSIONNUMBER", "FIRSTNAME", "LASTNAME", "RELATIONSHIP_1"], ["2", "Dana", "Reed", "Executive Officer"]]);
    const r = readFormD(dir, buyerConfig());
    expect(r.incoming.map((b) => b.company).sort()).toEqual(["Gulf Harbor Capital Partners", "Sunrise Search Partners"]);
    const gulf = r.incoming.find((b) => b.company === "Gulf Harbor Capital Partners")!;
    expect(gulf).toMatchObject({ kind: "fund", fund_size: 120_000_000, state: "FL", source: "sec-form-d" });
    expect(r.searchFunds).toBe(1);
    expect(firmRoot("Acme Capital Partners Fund III, L.P.")).toBe("Acme Capital Partners");
  });

  it("reads an adviser list, leaving wealth managers for the partner list", () => {
    const dir = tmpDir("adv-");
    const file = path.join(dir, "era.csv");
    fs.writeFileSync(file, "Primary Business Name,Main Office City,Main Office State,Website Address,Regulatory Assets Under Management\nGULF HARBOR CAPITAL MANAGEMENT LLC,TAMPA,FL,https://gulfharbor.example,180000000\nBAYSIDE WEALTH ADVISORS LLC,CLEARWATER,FL,bayside.example,90000000\n");
    expect(readAdvisers(file).incoming.map((a) => a.company)).toEqual(["Gulf Harbor Capital Management LLC"]);
    expect(readAdvisers(file, { asPartners: true }).incoming.map((a) => a.company)).toEqual(["Bayside Wealth Advisors LLC"]);
  });

  it("ranks SBA lenders by change-of-ownership loans in the priority states, and lists the businesses they financed as buyers", () => {
    const s = stores();
    const dir = tmpDir("sba-");
    const file = path.join(dir, "foia-7a.csv");
    fs.writeFileSync(
      file,
      [
        "BorrName,BorrCity,BorrState,BorrZip,BankName,BankCity,BankState,GrossApproval,ApprovalDate,ProjectState,NaicsDescription,BusinessAge,LoanStatus,FranchiseName",
        "SUNCOAST HVAC LLC,TAMPA,FL,33602,FIRST EXAMPLE BANK,TAMPA,FL,1200000,03/01/2025,FL,Plumbing and HVAC Contractors,Change of Ownership,EXEMPT,",
        "BAY PLUMBING INC,CLEARWATER,FL,33755,FIRST EXAMPLE BANK,TAMPA,FL,800000,2025-06-01,FL,Plumbing contractors,Change of Ownership,EXEMPT,",
        "OTHER PLACE LLC,ATLANTA,GA,30301,PEACH BANK,ATLANTA,GA,500000,2025-06-01,GA,Plumbing contractors,Change of Ownership,EXEMPT,",
        "NEW START LLC,TAMPA,FL,33602,SECOND EXAMPLE BANK,TAMPA,FL,300000,2025-06-01,FL,Plumbing contractors,New Business or 2 years or less,EXEMPT,",
        "OLD DEAL LLC,TAMPA,FL,33602,SECOND EXAMPLE BANK,TAMPA,FL,300000,2020-06-01,FL,Plumbing contractors,Change of Ownership,EXEMPT,",
      ].join("\n"),
    );
    const r = importSba7a(s, buyerConfig(), file, { since: "2023-10-27", now: NOW });
    expect(r.loans).toBe(2);
    const partners = s.partners.rows();
    expect(partners).toHaveLength(1);
    expect(partners[0]).toMatchObject({ kind: "sba_lender", name: "First Example Bank", status: "prospect" });
    expect(partners[0]!.evidence).toMatch(/^2 change-of-ownership SBA 7\(a\) loans in FL since 2023-10-27, \$2\.0M in all/);
    expect(s.buyerLeads.rows().map((l) => l.company).sort()).toEqual(["Bay Plumbing Inc", "Suncoast HVAC LLC"]);
    expect(partnerKit(buyerConfig(), partners[0]!).link).toBe("https://ambrain.example/join?src=partner-first-example-bank");
  });
});

describe("AMBrain registrations", () => {
  it("credits each registration to its lead by code, then by email, and adds people who came on their own", () => {
    const s = stores();
    importBuyerList(s, "Name,Email\nA One,a@one.example\nB Two,b@two.example\n", { kind: "past_bidder", source: "past-bidders", label: "l.csv", now: NOW });
    const [a] = s.buyerLeads.rows();
    const r = importRegistrations(s, `email,ref,src,status,registered at\nsomeone@else.example,${a!.ref},past-bidders,NDA signed,2026-10-26\nB@two.example,,,proof of funds verified,2026-10-26\nnew@organic.example,,linkedin,registered,2026-10-26\n`, NOW);
    expect(r).toMatchObject({ matched: 2, promoted: 2, added: 1 });
    const by = new Map(s.buyerLeads.rows().map((l) => [l.email, l]));
    expect(by.get("a@one.example")?.status).toBe("registered");
    expect(by.get("b@two.example")?.status).toBe("verified");
    expect(by.get("new@organic.example")).toMatchObject({ status: "registered", source: "linkedin" });
    // Status only moves up.
    importRegistrations(s, "email,status\nb@two.example,registered\n", NOW);
    expect(s.buyerLeads.rows().find((l) => l.email === "b@two.example")?.status).toBe("verified");
    const f = buyerFunnel(s, TODAY);
    expect(f.totals.registered).toBe(3);
    expect(f.bySource.find((x) => x.source === "linkedin")?.registered).toBe(1);
  });
});

describe("copy and the kit", () => {
  it("renders every buyer template clean under the house-style lint", () => {
    expect(lintBuyerTemplates(buyerConfig())).toEqual([]);
  });

  it("gives every place AMB posts its own tracked link", () => {
    const kit = postingKit(buyerConfig(), { ref: "AMB-2026-014", headline: "HVAC company in Tampa Bay" });
    expect(new Set(kit.map((k) => k.link)).size).toBe(kit.length);
    expect(kit.find((k) => k.channel === "linkedin")?.text).toContain("https://ambrain.example/join?src=linkedin");
    expect(kit[0]!.text).toContain("Reference AMB-2026-014.");
    expect(kit.map((k) => k.text).join(" ")).not.toMatch(/—|!/);
  });

  it("lists the buyer steps in the command help", async () => {
    const lines: string[] = [];
    await runCli(["help"], { cwd: tmpDir(), env: {}, today: TODAY, now: NOW, log: (l) => lines.push(l) });
    expect(lines.join("\n")).toContain("buyers <step>");
  });
});
