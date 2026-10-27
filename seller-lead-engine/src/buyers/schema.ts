import { z } from "zod";
import { optDate, optInt, optNum, optStamp, VERIFICATION_STATUSES } from "../domain/schema.ts";

// The buyer side's tables: people and firms who might buy an AMB deal, the
// emails sent to them, and the partners who refer buyers. AMBrain owns the
// buyer's account and NDA; these tables track how each buyer was found, the
// invitation to register there, and what they did (docs/BUYERS.md).

/** What kind of buyer lead, which decides the mailbox and the copy: warm kinds have dealt with AMB before. */
export const BUYER_KINDS = [
  "inquirer", // asked about an AMB listing (BizBuySell, BizQuest, Axial...)
  "past_bidder", // bid on or asked about a past AMB deal
  "client", // a buy-side client of AMB
  "correspondent", // wrote to AMB about buying; found in the mailbox, reviewed by a person
  "referral", // sent by a partner or another buyer
  "strategic", // a larger business in an AMB industry: an add-on buyer
  "fund", // a private fund that filed Form D
  "adviser", // a private fund adviser (Form ADV)
  "conference", // met at an event, from its attendee list
  "other",
] as const;
export type BuyerKind = (typeof BUYER_KINDS)[number];

/** Kinds that already know AMB: invited from AMB's own mailbox with the warm copy. */
export const WARM_KINDS: ReadonlySet<string> = new Set(["inquirer", "past_bidder", "client", "correspondent", "referral"]);

/** Where a buyer lead is. "review" waits for a person; "registered" and up are AMBrain's tiers. */
export const BUYER_STATUSES = [
  "review", // found by a heuristic (a mailbox correspondent): a person approves before any email
  "new", // found, not scored yet
  "needs_email", // no address yet: research it, or call the phone on record
  "ready", // scored, with an address the invite may go to
  "invited", // at least one invitation sent or drafted
  "replied", // wrote back: a person follows up
  "registered", // signed up on AMBrain and signed the NDA
  "profiled", // completed their AMBrain profile
  "verified", // AMB checked proof of funds or an SBA pre-qualification
  "opted_out", // asked for no more email (on the permanent suppression list)
  "bounced",
  "excluded", // a person or a rule took them out (reason in notes)
] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];

/** Statuses that mean the buyer is on AMBrain. */
export const REGISTERED_STATUSES: ReadonlySet<string> = new Set(["registered", "profiled", "verified"]);

/** Where a buyer's address came from. */
export const BUYER_EMAIL_SOURCES = ["inquiry", "import", "website", "filing", "manual", "mailbox", "seller_data", "ambrain", ""] as const;

/** One possible buyer (`buyers/leads.csv`). */
export const BuyerLeadRowSchema = z.object({
  lead_id: z.string().regex(/^B-\d{5,}$/, "B-00001"),
  status: z.enum(BUYER_STATUSES),
  kind: z.enum(BUYER_KINDS),
  name: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  title: z.string(),
  company: z.string(),
  email: z.string(),
  email_source: z.enum(BUYER_EMAIL_SOURCES),
  email_verification: z.enum(VERIFICATION_STATUSES),
  phone: z.string(),
  website: z.string(),
  city: z.string(),
  state: z.string(),
  /** The channel code every link and count uses: "bizbuysell", "sec-form-d", "past-bidders", "partner-first-citizens". */
  source: z.string(),
  /** What the source said, in plain words: "BizBuySell inquiry about listing 2213456 on 2026-10-20". */
  source_detail: z.string(),
  /** What they are after, when known: a listing reference, industries, a price range. */
  interest: z.string(),
  fund_size: optNum,
  /** The seller-side business this strategic buyer is (prospects.csv), so the two sides never email one owner twice. */
  prospect_id: z.string(),
  score: optInt,
  score_reasons: z.string(),
  /** The personal tracking code in this buyer's AMBrain link. */
  ref: z.string(),
  invite_step: optInt,
  last_invited_at: optStamp,
  next_invite_date: optDate,
  replied_at: optStamp,
  /** When the buyer last wrote to AMB (an inquiry or a reply): a fresh inquiry gets the inquiry reply, not the invitation. */
  last_inbound_at: optStamp,
  registered_at: optStamp,
  thread_id: z.string(),
  created_at: optStamp,
  updated_at: optStamp,
  notes: z.string(),
});
export type BuyerLeadRow = z.infer<typeof BuyerLeadRowSchema>;

export const BUYER_TOUCH_KINDS = ["inquiry_reply", "invite"] as const;
export const BUYER_TOUCH_STATUSES = ["queued", "drafted", "sent", "failed", "cancelled"] as const;

/** Every email made for a buyer lead (`buyers/touches.csv`). */
export const BuyerTouchRowSchema = z.object({
  touch_id: z.string().regex(/^BT-\d{6,}$/, "BT-000001"),
  lead_id: z.string(),
  kind: z.enum(BUYER_TOUCH_KINDS),
  step: optInt,
  mailbox: z.string(),
  to: z.string(),
  subject: z.string(),
  status: z.enum(BUYER_TOUCH_STATUSES),
  /** The day it was made: its outbox folder. */
  planned_for: optDate,
  draft_id: z.string(),
  message_id: z.string(),
  thread_id: z.string(),
  error: z.string(),
  created_at: optStamp,
});
export type BuyerTouchRow = z.infer<typeof BuyerTouchRowSchema>;

/** What the buyer inbox made of one received message. */
export const BUYER_INBOUND_CLASSES = ["inquiry", "reply", "opt_out", "bounce", "auto_reply", "correspondent", "ignored"] as const;

/** Every message the buyer inbox has read (`buyers/inbound.csv`), so a message is acted on once however often it is read. */
export const BuyerInboundRowSchema = z.object({
  message_id: z.string().min(1),
  received_at: optStamp,
  mailbox: z.string(),
  from_email: z.string(),
  subject: z.string(),
  class: z.enum(BUYER_INBOUND_CLASSES),
  /** The listing site, for an inquiry: "bizbuysell". */
  platform: z.string(),
  lead_id: z.string(),
  detail: z.string(),
  processed_at: optStamp,
});
export type BuyerInboundRow = z.infer<typeof BuyerInboundRowSchema>;

/** Kinds of partner who send buyers. */
export const PARTNER_KINDS = ["sba_lender", "eta_club", "cpa", "attorney", "wealth_manager", "banker", "association", "buyer", "other"] as const;

/** One referral partner (`buyers/partners.csv`), with the tracked link their referrals arrive through. */
export const PartnerRowSchema = z.object({
  partner_id: z.string().regex(/^BP-\d{4,}$/, "BP-0001"),
  kind: z.enum(PARTNER_KINDS),
  name: z.string().min(1),
  contact_name: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  state: z.string(),
  /** Why this partner: "37 change-of-ownership SBA 7(a) loans in Florida since 2023, $48.2M". */
  evidence: z.string(),
  /** The channel code in their link: "partner-first-citizens-bank". */
  source: z.string(),
  status: z.enum(["prospect", "contacted", "active", "declined"]),
  created_at: optStamp,
  notes: z.string(),
});
export type PartnerRow = z.infer<typeof PartnerRowSchema>;

