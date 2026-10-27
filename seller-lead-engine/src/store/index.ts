import path from "node:path";
import {
  ContactRowSchema,
  EntityRowSchema,
  ExportRowSchema,
  LeadRowSchema,
  LicenseRowSchema,
  MailboxLogRowSchema,
  PoiRowSchema,
  ProspectRowSchema,
  ReplyRowSchema,
  SuppressionRowSchema,
  TouchRowSchema,
} from "../domain/schema.ts";
import { BuyerInboundRowSchema, BuyerLeadRowSchema, BuyerTouchRowSchema, PartnerRowSchema } from "../buyers/schema.ts";
import { CsvTable } from "./csvTable.ts";

// Every table the engine keeps, under one data folder (git-ignored):
//
//   data/imports/entities.csv   canonical Secretary of State records
//   data/imports/licenses.csv   canonical licence-board records
//   data/imports/open_poi.csv   canonical open POI records (Overture, Foursquare OS)
//   data/imports/contacts.csv   contacts found or imported
//   data/prospects.csv          merged, scored businesses
//   data/touches.csv            every outbound message
//   data/replies.csv            every inbound message
//   data/leads.csv              owners in conversation
//   data/suppression.csv        the permanent do-not-contact list
//   data/mailbox_log.csv        per-mailbox daily health
//   data/exports.csv            partner lead exports
//   data/buyers/leads.csv       possible buyers, and how each was found (src/buyers)
//   data/buyers/touches.csv     every email made for a buyer lead
//   data/buyers/partners.csv    partners who refer buyers, with their tracked links
//   data/buyers/inbound.csv     every message the buyer inbox read, and what it made of it
//
// plus folders the modules own: data/outbox/, data/inbox/, data/handoffs/,
// data/checks/, data/reports/, data/cache/ (Places details, 30-day TTL).

export function openStores(dataDir: string) {
  const f = (name: string) => path.join(dataDir, name);
  return {
    dataDir,
    entities: new CsvTable(f("imports/entities.csv"), EntityRowSchema, "source_record_id"),
    licenses: new CsvTable(f("imports/licenses.csv"), LicenseRowSchema, "source_record_id"),
    pois: new CsvTable(f("imports/open_poi.csv"), PoiRowSchema, "source_record_id"),
    contacts: new CsvTable(f("imports/contacts.csv"), ContactRowSchema, "source_record_id"),
    prospects: new CsvTable(f("prospects.csv"), ProspectRowSchema, "prospect_id"),
    touches: new CsvTable(f("touches.csv"), TouchRowSchema, "touch_id"),
    replies: new CsvTable(f("replies.csv"), ReplyRowSchema, "reply_id"),
    leads: new CsvTable(f("leads.csv"), LeadRowSchema, "prospect_id"),
    suppression: new CsvTable(f("suppression.csv"), SuppressionRowSchema, "value"),
    mailboxLog: new CsvTable(f("mailbox_log.csv"), MailboxLogRowSchema, "date"),
    exports: new CsvTable(f("exports.csv"), ExportRowSchema, "export_id"),
    buyerLeads: new CsvTable(f("buyers/leads.csv"), BuyerLeadRowSchema, "lead_id"),
    buyerTouches: new CsvTable(f("buyers/touches.csv"), BuyerTouchRowSchema, "touch_id"),
    partners: new CsvTable(f("buyers/partners.csv"), PartnerRowSchema, "partner_id"),
    buyerInbound: new CsvTable(f("buyers/inbound.csv"), BuyerInboundRowSchema, "message_id"),
    dir: {
      outbox: f("outbox"),
      inbox: f("inbox"),
      handoffs: f("handoffs"),
      checks: f("checks"),
      reports: f("reports"),
      cache: f("cache"),
      /** Messages from the buyer mailbox (listing inquiries, buyers' replies), one JSON file each, like inbox/. */
      buyerInbox: f("buyers/inbox"),
    },
  };
}
export type Stores = ReturnType<typeof openStores>;
