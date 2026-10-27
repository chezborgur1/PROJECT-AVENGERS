import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { cmdDownload } from "../src/cli.ts";
import { boardsFor, DBPR_CAM_PUBLIC_RECORDS, downloadDbpr, downloadSunbiz, findDataLinks, isCordata, safeName, type SftpLike } from "../src/sources/download.ts";
import { openStores } from "../src/store/index.ts";
import { REPO, testConfig, tmpDir } from "./helpers.ts";

// The Florida downloader against a fake DBPR page, a fake Sunbiz SFTP
// server and a hand-built zip: no network.

const PAGE = "https://www2.myfloridalicense.com/construction-industry/public-records/";
const DBPR_SAMPLE = fs.readFileSync(path.join(REPO, "samples/tampa-bay/dbpr_cilb_licensees.csv"));
const SUNBIZ_SAMPLE = path.join(REPO, "samples/tampa-bay/sunbiz_cordata.txt");

/** A zip with one stored (uncompressed) entry. */
function makeZip(name: string, data: Buffer): Buffer {
  const n = Buffer.from(name);
  const crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(n.length, 28);
  const localPart = Buffer.concat([local, n, data]);
  const centralPart = Buffer.concat([central, n]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, end]);
}

const HTML = `
  <h1>Public Records</h1>
  <a href="/sto/file_download/extracts/CILB_certified.csv">Certified Licensees (CSV)</a>
  <a href='https://www2.myfloridalicense.com/sto/file_download/extracts/cilb_registered.zip'>Registered Licensees (ZIP)</a>
  <a href="/sto/file_download/extracts/CILB_certified.csv">Certified Licensees again</a>
  <a href="/sto/file_download/extracts/cilb_applicants.csv">Applicants</a>
  <a href="/sto/documents/readme.pdf">ReadMe</a>
  <a href="https://elsewhere.example/data.csv">Someone else's file</a>`;

function fakeFetch(): { impl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url === PAGE) return new Response(HTML, { status: 200 });
    if (url.endsWith("CILB_certified.csv")) return new Response(new Uint8Array(DBPR_SAMPLE), { status: 200 });
    if (url.endsWith("cilb_registered.zip")) return new Response(new Uint8Array(makeZip("cilb_registered.csv", DBPR_SAMPLE)), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, urls };
}

/** An SFTP server with a daily folder (ignored) and the quarterly corporate parts. */
function fakeSftp(): SftpLike & { got: string[]; connected: Record<string, unknown> | undefined } {
  const tree: Record<string, { name: string; type: string; size: number }[]> = {
    "/": [{ name: "doc", type: "d", size: 0 }, { name: "README.txt", type: "-", size: 10 }],
    "/doc": [{ name: "cor", type: "d", size: 0 }, { name: "Quarterly", type: "d", size: 0 }],
    "/doc/cor": [{ name: "20261016c.txt", type: "-", size: 100 }],
    "/doc/Quarterly": [{ name: "Cor", type: "d", size: 0 }, { name: "daily", type: "d", size: 0 }],
    "/doc/Quarterly/Cor": [{ name: "cordata0.txt", type: "-", size: 5_000_000 }, { name: "cordata.zip", type: "-", size: 1_000_000 }],
  };
  const fake = {
    got: [] as string[],
    connected: undefined as Record<string, unknown> | undefined,
    async connect(o: Record<string, unknown>) {
      fake.connected = o;
    },
    async list(p: string) {
      const entries = tree[p];
      if (!entries) throw new Error(`no such folder ${p}`);
      return entries;
    },
    async fastGet(remote: string, local: string) {
      fake.got.push(remote);
      fs.copyFileSync(SUNBIZ_SAMPLE, local);
    },
    async end() {},
  };
  return fake as unknown as SftpLike & { got: string[]; connected: Record<string, unknown> | undefined };
}

describe("findDataLinks", () => {
  it("keeps the site's data files once each, and leaves out applicants, documents and other sites", () => {
    const links = findDataLinks(HTML, PAGE);
    expect(links.map((l) => l.url)).toEqual([
      "https://www2.myfloridalicense.com/sto/file_download/extracts/CILB_certified.csv",
      "https://www2.myfloridalicense.com/sto/file_download/extracts/cilb_registered.zip",
    ]);
    expect(links[0]!.text).toBe("Certified Licensees (CSV)");
  });

  it("refuses a file name that is not a plain name", () => {
    expect(safeName("/sto/x/../CILB file (1).csv")).toBe("CILB_file_1_.csv");
    expect(() => safeName("..")).toThrow();
    expect(isCordata("cordata3.txt")).toBe(true);
    expect(isCordata("20261016c.txt")).toBe(false);
  });
});

describe("downloadDbpr", () => {
  it("downloads every linked file and unzips the zipped ones", async () => {
    const dir = tmpDir();
    const { impl, urls } = fakeFetch();
    const got = await downloadDbpr({ dir, fetchImpl: impl });
    expect(got.map((g) => path.basename(g.file)).sort()).toEqual(["CILB_certified.csv", "cilb_registered.csv"]);
    for (const g of got) expect(fs.readFileSync(g.file)).toEqual(DBPR_SAMPLE);
    expect(urls.some((u) => /applicants|readme|elsewhere/.test(u))).toBe(false);
  });

  it("fails loudly when the page links to no data file", async () => {
    const impl = (async () => new Response("<p>Moved</p>", { status: 200 })) as typeof fetch;
    await expect(downloadDbpr({ dir: tmpDir(), fetchImpl: impl })).rejects.toThrow(/links to no \.csv/);
    const down = (async () => new Response("", { status: 403 })) as typeof fetch;
    await expect(downloadDbpr({ dir: tmpDir(), fetchImpl: down })).rejects.toThrow(/HTTP 403/);
  });
});

describe("downloadSunbiz", () => {
  it("finds the quarterly corporate parts by name, skipping daily files, and downloads them", async () => {
    const client = fakeSftp();
    const got = await downloadSunbiz({ dir: tmpDir(), username: "Public", password: "secret", client });
    expect(client.connected).toMatchObject({ host: "sftp.floridados.gov", username: "Public" });
    // The parts are taken over the zip when both are there; the daily file is never fetched.
    expect(client.got).toEqual(["/doc/Quarterly/Cor/cordata0.txt"]);
    expect(got).toHaveLength(1);
  });

  it("says so when the server holds no quarterly file", async () => {
    const client = fakeSftp();
    (client as unknown as { list: SftpLike["list"] }).list = async () => [];
    await expect(downloadSunbiz({ dir: tmpDir(), username: "u", password: "p", client })).rejects.toThrow(/No quarterly corporate file/);
  });
});

describe("download florida", () => {
  it("downloads both sources, imports only businesses in the metros and builds prospects", async () => {
    const root = tmpDir();
    const dataDir = path.join(root, "data");
    const configFile = path.join(root, "engine.config.json");
    const config = testConfig({ targeting: { exclude_name_patterns: ["frostline"] } });
    config.metros.tampa_bay!.zip_prefixes = ["335", "336", "337", "346"];
    fs.writeFileSync(configFile, JSON.stringify(config));
    const lines: string[] = [];
    const code = await cmdDownload(["florida", "--import"], {
      cwd: root,
      env: { LEAD_ENGINE_DATA_DIR: dataDir, LEAD_ENGINE_CONFIG: configFile, SUNBIZ_SFTP_USER: "Public", SUNBIZ_SFTP_PASSWORD: "secret" },
      today: "2026-10-19",
      now: new Date("2026-10-19T12:00:00Z"),
      log: (l) => lines.push(l),
      fetchImpl: fakeFetch().impl,
      sftp: () => fakeSftp(),
    });
    expect(lines.join("\n")).toMatch(/DBPR construction contractor: 2 file\(s\)/);
    expect(lines.join("\n")).toMatch(/Sunbiz: 1 file\(s\)/);
    expect(lines.join("\n")).toMatch(/Prospects: \d+ new/);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dataDir, "downloads", "2026-10-19", "dbpr", "construction", "CILB_certified.csv"))).toBe(true);
    // No vertical in this config uses a CAM firm licence, so that board is not fetched.
    expect(lines.join("\n")).not.toMatch(/community association/);
    const prospects = fs.readFileSync(path.join(dataDir, "prospects.csv"), "utf8").trim().split("\n");
    expect(prospects.length).toBeGreaterThan(5);
  });

  it("skips Sunbiz with a pointer to the login when no credentials are set", async () => {
    const root = tmpDir();
    const lines: string[] = [];
    const code = await cmdDownload(["florida", "--dbpr-only"], { cwd: root, env: { LEAD_ENGINE_DATA_DIR: path.join(root, "data") }, today: "2026-10-19", now: new Date(), log: (l) => lines.push(l), fetchImpl: fakeFetch().impl });
    expect(code).toBe(0);
    const sunbiz: string[] = [];
    await cmdDownload(["florida", "--sunbiz-only"], { cwd: root, env: { LEAD_ENGINE_DATA_DIR: path.join(root, "data") }, today: "2026-10-19", now: new Date(), log: (l) => sunbiz.push(l) });
    expect(sunbiz.join("\n")).toMatch(/SUNBIZ_SFTP_USER and SUNBIZ_SFTP_PASSWORD/);
  });
});

describe("the community association management board", () => {
  it("is fetched only for a vertical that lists the CAM firm licence, and skips course files", () => {
    expect(boardsFor(["CAC", "CFC"]).map((b) => b.key)).toEqual(["construction"]);
    expect(boardsFor(["cab"]).map((b) => b.key)).toEqual(["cam"]);
    expect(boardsFor([]).map((b) => b.key)).toEqual([]);
    const html = `<a href="/sto/file_download/extracts/CAM_licensees.csv">Licensees</a>
      <a href="/sto/file_download/extracts/cam_ce.csv">Continuing Education</a>
      <a href="/sto/file_download/extracts/cam_applicants.csv">Applicants</a>`;
    expect(findDataLinks(html, DBPR_CAM_PUBLIC_RECORDS).map((l) => l.text)).toEqual(["Licensees"]);
  });

  it("downloads and imports CAM firms as association management companies, leaving individual managers out", async () => {
    const root = tmpDir();
    const dataDir = path.join(root, "data");
    const configFile = path.join(root, "engine.config.json");
    const config = testConfig({
      verticals: {
        association_management: { noun: "association management company", keywords: ["association management", "community management"], license_codes: ["CAB"], prior: 7, multiples_key: "property_management" },
      },
    });
    fs.writeFileSync(configFile, JSON.stringify(config));
    const header = "Board Number,Occupation Code,Licensee Name,DBA Name,Rank,Address Line 1,City,State,Zip,County Name,License Number,Primary Status,Secondary Status,Original Licensure Date,License Expiration Date";
    const csv = [
      header,
      '"06","5501","GULF COAST COMMUNITY MANAGEMENT INC","","CAB","100 Example Ave","Tampa","FL","33602","Hillsborough","CAB0001234","Current","Active","05/01/2004","09/30/2027"',
      '"06","5502","SAMPLE, JANE Q","","CAM","200 Example St","Tampa","FL","33603","Hillsborough","CAM0005678","Current","Active","03/15/1999","09/30/2027"',
      '"06","5501","ORLANDO HOA PARTNERS LLC","","CAB","300 Example Rd","Orlando","FL","32801","Orange","CAB0009999","Current","Active","01/10/2001","09/30/2027"',
    ].join("\n");
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url === DBPR_CAM_PUBLIC_RECORDS) return new Response('<a href="/sto/file_download/extracts/CAM_licensees.csv">Licensees</a>', { status: 200 });
      if (url.endsWith("CAM_licensees.csv")) return new Response(csv, { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const lines: string[] = [];
    const code = await cmdDownload(["florida", "--import", "--dbpr-only"], {
      cwd: root,
      env: { LEAD_ENGINE_DATA_DIR: dataDir, LEAD_ENGINE_CONFIG: configFile },
      today: "2026-10-27",
      now: new Date("2026-10-27T12:00:00Z"),
      log: (l) => lines.push(l),
      fetchImpl,
    });
    expect(code, lines.join("\n")).toBe(0);
    // Only the board a vertical needs: no construction page was asked for.
    expect(urls.some((u) => u.includes("construction-industry"))).toBe(false);
    const prospects = openStores(dataDir).prospects.rows();
    const tampa = prospects.find((p) => /gulf coast/i.test(p.business_name));
    expect(tampa).toMatchObject({ vertical: "association_management", license_issue_date: "2004-05-01" });
    // The individual manager is a person, not a business, and Orlando is outside the metro.
    expect(prospects.some((p) => /sample|jane/i.test(p.business_name) && p.vertical === "association_management")).toBe(false);
    expect(prospects.some((p) => /orlando/i.test(p.business_name))).toBe(false);
  });
});
