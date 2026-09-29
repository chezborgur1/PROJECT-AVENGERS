// QuickBooks Online: pulls Profit and Loss and Balance Sheet reports through
// the Intuit Reports API for the company (realm) named on the request row.
//
// Auth is OAuth 2.0. Each client business connects its own QuickBooks
// company once (`amb-bot qbo-connect`), which yields a refresh token for that
// realm. Intuit rotates refresh tokens, so the latest one is saved to
// .qbo-tokens.json (git-ignored) after every refresh.

import fs from "node:fs";
import type { Period } from "../util/tables.ts";
import { reportToLines, type ReportKind, type ReportRow } from "./reportTable.ts";
import { misalignedNotes, partialYearNote } from "./quickbooksExport.ts";
import type { IngestExtract } from "./extract.ts";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const MINOR_VERSION = "75";
const TOKEN_FILE = ".qbo-tokens.json";

interface StoredToken {
  refresh_token: string;
  access_token?: string;
  expires_at?: number;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see .env.example)`);
  return v;
}

function apiBase(): string {
  return process.env.QBO_ENVIRONMENT === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

function readTokens(): Record<string, StoredToken> {
  if (!fs.existsSync(TOKEN_FILE)) return {};
  return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
}

function writeTokens(tokens: Record<string, StoredToken>): void {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function tokenRequest(body: URLSearchParams): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const basic = Buffer.from(`${env("QBO_CLIENT_ID")}:${env("QBO_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`QuickBooks token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
}

/** Step 1 of connecting a client's QuickBooks company. */
export function authorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("QBO_CLIENT_ID"),
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: env("QBO_REDIRECT_URI"),
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** Step 2: exchange the code Intuit redirects back with, and store the realm's refresh token. */
export async function exchangeCode(code: string, realmId: string): Promise<void> {
  const t = await tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env("QBO_REDIRECT_URI") }),
  );
  const tokens = readTokens();
  tokens[realmId] = {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expires_at: Date.now() + t.expires_in * 1000,
  };
  writeTokens(tokens);
}

async function accessToken(realmId: string): Promise<string> {
  const tokens = readTokens();
  const stored = tokens[realmId] ?? (process.env.QBO_REFRESH_TOKEN ? { refresh_token: process.env.QBO_REFRESH_TOKEN } : undefined);
  if (!stored) throw new Error(`No QuickBooks connection for realm ${realmId}. Run: amb-bot qbo-connect ${realmId}`);
  if (stored.access_token && stored.expires_at && stored.expires_at - 60_000 > Date.now()) {
    return stored.access_token;
  }
  const t = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: stored.refresh_token }));
  tokens[realmId] = {
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expires_at: Date.now() + t.expires_in * 1000,
  };
  writeTokens(tokens);
  return t.access_token;
}

// --- Reports API ------------------------------------------------------------

interface QboColData {
  value?: string;
  id?: string;
}
interface QboRow {
  type?: "Section" | "Data";
  group?: string;
  Header?: { ColData?: QboColData[] };
  Rows?: { Row?: QboRow[] };
  Summary?: { ColData?: QboColData[] };
  ColData?: QboColData[];
}
export interface QboReport {
  Columns?: { Column?: { ColTitle?: string; ColType?: string; MetaData?: { Name: string; Value: string }[] }[] };
  Rows?: { Row?: QboRow[] };
}

/** Column periods from each column's StartDate/EndDate metadata. */
export function qboPeriods(report: QboReport, fyEndMonth: number): (Period | undefined)[] {
  const cols = report.Columns?.Column ?? [];
  return cols.map((col) => {
    if (col.ColType !== "Money" || /total/i.test(col.ColTitle ?? "")) return undefined;
    const meta = Object.fromEntries((col.MetaData ?? []).map((m) => [m.Name, m.Value]));
    const end = meta.EndDate;
    if (!end) return undefined;
    const [ey, em] = end.split("-").map(Number) as [number, number];
    const start = meta.StartDate;
    let months = 0;
    if (start) {
      const [sy, sm] = start.split("-").map(Number) as [number, number];
      months = (ey - sy) * 12 + (em - sm) + 1;
    }
    return { fiscalYear: em <= fyEndMonth ? ey : ey + 1, months, endMonth: em, endYear: ey };
  });
}

export function qboRowsToReport(report: QboReport): ReportRow[] {
  const out: ReportRow[] = [];
  const walk = (rows: QboRow[], path: string[]) => {
    for (const row of rows) {
      if (row.type === "Section" || row.Rows) {
        const heading = row.Header?.ColData?.[0]?.value?.trim();
        const headerValues = (row.Header?.ColData ?? []).slice(1).map((c) => num(c.value));
        // A parent account can carry its own postings on the header line.
        if (heading && headerValues.some((v) => v !== undefined)) {
          out.push({ label: heading, path, values: [undefined, ...headerValues] });
        }
        walk(row.Rows?.Row ?? [], heading ? [...path, heading] : path);
      } else if (row.ColData) {
        const [first, ...rest] = row.ColData;
        const label = first?.value?.trim();
        if (label) out.push({ label, path, values: [undefined, ...rest.map((c) => num(c.value))] });
      }
    }
  };
  walk(report.Rows?.Row ?? [], []);
  return out;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function fetchReport(realmId: string, name: "ProfitAndLoss" | "BalanceSheet", start: string, end: string): Promise<QboReport> {
  const token = await accessToken(realmId);
  const params = new URLSearchParams({
    start_date: start,
    end_date: end,
    summarize_column_by: "Month",
    accounting_method: "Accrual",
    minorversion: MINOR_VERSION,
  });
  const res = await fetch(`${apiBase()}/v3/company/${realmId}/reports/${name}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`QuickBooks ${name} report failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as QboReport;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Pull the last `years` complete fiscal years plus the months of the current
 * one that have closed, so the model has YTD and LTM columns. Monthly columns
 * are requested, which also makes non-December fiscal years aggregate
 * correctly.
 */
export async function pullQuickbooks(realmId: string, fyEndMonth: number, years = 3, today = new Date()): Promise<IngestExtract> {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  // Last fiscal year that has fully closed (fiscal years are named for the year they end in).
  const lastFyEndYear = m > fyEndMonth ? y : y - 1;
  const startMonth = (fyEndMonth % 12) + 1;
  const startYear = lastFyEndYear - years + (startMonth === 1 ? 1 : 0);
  const start = iso(startYear, startMonth, 1);
  // Through the end of last month: this month is still open.
  const endYear = m === 1 ? y - 1 : y;
  const endMonth = m === 1 ? 12 : m - 1;
  const end = iso(endYear, endMonth, new Date(endYear, endMonth, 0).getDate());

  const kinds: [ReportKind, "ProfitAndLoss" | "BalanceSheet"][] = [
    ["pnl", "ProfitAndLoss"],
    ["balance_sheet", "BalanceSheet"],
  ];
  const file = `QuickBooks realm ${realmId}`;
  const extract: IngestExtract = { kind: "quickbooks_api", file, pnlLines: [], bsLines: [], fullYears: [], notes: [] };
  for (const [kind, name] of kinds) {
    const report = await fetchReport(realmId, name, start, end);
    const result = reportToLines(qboRowsToReport(report), qboPeriods(report, fyEndMonth), kind, fyEndMonth);
    if (kind === "pnl") {
      extract.pnlLines = result.lines;
      extract.fullYears = result.fullYears;
      extract.partialYears = result.partialYears;
      if (result.monthly) extract.monthly = result.monthly;
      const lastMonth = result.monthly?.months[result.monthly.months.length - 1];
      extract.notes!.push(...result.partialYears.map((p) => partialYearNote(p, file, Boolean(result.monthly), lastMonth, fyEndMonth)), ...misalignedNotes(result.misaligned, file, fyEndMonth));
    } else {
      extract.bsLines = result.lines;
      if (result.balanceSheets) extract.balanceSheets = result.balanceSheets;
    }
  }
  return extract;
}
