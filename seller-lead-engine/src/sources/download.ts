import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

// Fetches Florida's free bulk files so a person does not have to: the DBPR
// construction licensee files (web download) and the Sunbiz quarterly
// corporate file (the Division of Corporations' public SFTP server). Both
// are official public-records downloads, not scraping (docs/research/data.md
// section 1): no site's pages are crawled, no listing site is touched.
//
// Neither source's exact file names could be confirmed during the build (the
// research could not open either site), so nothing here hard-codes a guessed
// URL. DBPR: the public-records page is read and every data file it links
// to is downloaded (applicant files left out). Sunbiz: the server is listed
// from the top and the quarterly "cordata" files are found by name. Either
// way a changed site fails loudly with what was found, never silently.

/** The DBPR Construction Industry Licensing Board public-records page. */
export const DBPR_PUBLIC_RECORDS = "https://www2.myfloridalicense.com/construction-industry/public-records/";
/** The Division of Corporations' public SFTP server; the login is published on the Sunbiz data-downloads page. */
export const SUNBIZ_SFTP_HOST = "sftp.floridados.gov";
export const SUNBIZ_DOWNLOADS_PAGE = "https://dos.fl.gov/sunbiz/other-services/data-downloads/";

/** One file on disk, ready to import. */
export interface Downloaded {
  source: "dbpr" | "sunbiz";
  /** Where it came from (a URL, or the SFTP path). */
  from: string;
  file: string;
  bytes: number;
}

/** A data-file link on a page: its absolute URL and its text. */
export interface DataLink {
  url: string;
  text: string;
}

const DATA_EXT = /\.(csv|txt|zip)(\?.*)?$/i;

/**
 * The data files a public-records page links to: hrefs ending in .csv, .txt
 * or .zip on the same site, applicant files left out (an applicant is not a
 * licensed business), each once.
 */
export function findDataLinks(html: string, pageUrl: string): DataLink[] {
  const page = new URL(pageUrl);
  const site = page.hostname.split(".").slice(-2).join(".");
  const seen = new Set<string>();
  const out: DataLink[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").trim().replace(/&amp;/g, "&");
    if (!href || !DATA_EXT.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, page);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (!url.hostname.endsWith(site)) continue;
    const text = (m[4] ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (/applicant/i.test(`${href} ${text}`)) continue;
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    out.push({ url: url.href, text });
  }
  return out;
}

/** A file name safe to write: the URL's last path segment with anything odd replaced. */
export function safeName(name: string): string {
  const base = path.basename(decodeURIComponent(name.split("?")[0] ?? name)).replace(/[^A-Za-z0-9._-]+/g, "_");
  if (!base || base === "." || base === "..") throw new Error(`Cannot use "${name}" as a file name`);
  return base;
}

/**
 * fetch, with a readable reason when the site cannot be reached at all: a
 * blocked or offline network gives Node's bare "fetch failed", which names
 * neither the host nor the fix.
 */
async function reach(fetchImpl: typeof fetch, url: string): Promise<Response> {
  try {
    return await fetchImpl(url);
  } catch (err) {
    const cause = (err as { cause?: { message?: string; code?: string } }).cause;
    const why = [cause?.code, cause?.message].filter(Boolean).join(" ") || (err as Error).message;
    throw new Error(`Could not reach ${new URL(url).hostname} (${why}). On your own computer, check the internet connection; in a Claude cloud session, allow ${new URL(url).hostname} in the environment's network settings.`);
  }
}

/** Stream a URL's body to `file`; returns the bytes written. */
async function fetchToFile(fetchImpl: typeof fetch, url: string, file: string): Promise<number> {
  const res = await reach(fetchImpl, url);
  if (!res.ok || !res.body) throw new Error(`Download failed for ${url}: HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), fs.createWriteStream(tmp));
  fs.renameSync(tmp, file);
  return fs.statSync(file).size;
}

/** Extract the .csv and .txt entries of a zip next to it (streamed, so a large file never sits in memory); returns their paths. */
export function extractZip(zipFile: string, dir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error(`Cannot open ${zipFile}`));
      const out: string[] = [];
      zip.on("error", reject);
      zip.on("end", () => resolve(out));
      zip.on("entry", (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName) || !/\.(csv|txt)$/i.test(entry.fileName)) return zip.readEntry();
        const target = path.join(dir, safeName(entry.fileName));
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e ?? new Error(`Cannot read ${entry.fileName} in ${zipFile}`));
          pipeline(stream, fs.createWriteStream(target))
            .then(() => {
              out.push(target);
              zip.readEntry();
            })
            .catch(reject);
        });
      });
      zip.readEntry();
    });
  });
}

/** Download every DBPR construction licensee file linked from the public-records page into `dir`, unzipping as needed. */
export async function downloadDbpr(opts: { dir: string; fetchImpl?: typeof fetch; pageUrl?: string; log?: (line: string) => void }): Promise<Downloaded[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pageUrl = opts.pageUrl ?? DBPR_PUBLIC_RECORDS;
  const log = opts.log ?? (() => {});
  const res = await reach(fetchImpl, pageUrl);
  if (!res.ok) throw new Error(`Could not open the DBPR public-records page (${pageUrl}): HTTP ${res.status}`);
  const links = findDataLinks(await res.text(), pageUrl);
  if (!links.length) {
    throw new Error(`The DBPR page ${pageUrl} links to no .csv, .txt or .zip file. The site may have changed: open it in a browser, download the licensee files by hand, then run: npm run engine -- import dbpr <file>`);
  }
  fs.mkdirSync(opts.dir, { recursive: true });
  const out: Downloaded[] = [];
  for (const link of links) {
    const file = path.join(opts.dir, safeName(new URL(link.url).pathname));
    log(`  DBPR: ${link.text || path.basename(file)}`);
    const bytes = await fetchToFile(fetchImpl, link.url, file);
    if (/\.zip$/i.test(file)) {
      for (const part of await extractZip(file, opts.dir)) out.push({ source: "dbpr", from: link.url, file: part, bytes: fs.statSync(part).size });
    } else out.push({ source: "dbpr", from: link.url, file, bytes });
  }
  return out;
}

/** The part of an SFTP client the Sunbiz download uses (ssh2-sftp-client, or a test double). */
export interface SftpLike {
  connect(opts: { host: string; port?: number; username: string; password: string; readyTimeout?: number }): Promise<unknown>;
  list(remotePath: string): Promise<{ name: string; type: string; size: number }[]>;
  fastGet(remotePath: string, localPath: string): Promise<unknown>;
  end(): Promise<unknown>;
}

/** True for a quarterly corporate data file name: cordata.zip, or its parts cordata0.txt to cordata9.txt. */
export function isCordata(name: string): boolean {
  return /^cordata\d?\.(zip|txt)$/i.test(name);
}

/**
 * Find the quarterly corporate files on the Sunbiz SFTP server (a
 * breadth-first walk from the top, at most `maxDepth` folders down, skipping
 * folders of daily files) and download them into `dir`, unzipping cordata.zip.
 */
export async function downloadSunbiz(opts: {
  dir: string;
  username: string;
  password: string;
  client: SftpLike;
  maxDepth?: number;
  log?: (line: string) => void;
}): Promise<Downloaded[]> {
  const log = opts.log ?? (() => {});
  const maxDepth = opts.maxDepth ?? 5;
  const client = opts.client;
  try {
    await client.connect({ host: SUNBIZ_SFTP_HOST, port: 22, username: opts.username, password: opts.password, readyTimeout: 30_000 });
  } catch (err) {
    throw new Error(`Could not log in to ${SUNBIZ_SFTP_HOST} (${(err as Error).message}). Check the public login on ${SUNBIZ_DOWNLOADS_PAGE}; in a Claude cloud session the server must also be allowed in the environment's network settings.`);
  }
  try {
    const found: { remote: string; size: number }[] = [];
    let level: string[] = ["/"];
    for (let depth = 0; depth <= maxDepth && level.length && !found.length; depth++) {
      const next: string[] = [];
      for (const dir of level) {
        let entries: { name: string; type: string; size: number }[];
        try {
          entries = await client.list(dir);
        } catch {
          continue; // a folder the public login may not read
        }
        for (const e of entries) {
          const remote = path.posix.join(dir, e.name);
          if (e.type === "d" && !/^\.\.?$/.test(e.name) && !/daily/i.test(e.name)) next.push(remote);
          else if (e.type !== "d" && isCordata(e.name)) found.push({ remote, size: e.size });
        }
      }
      // Quarterly folders first, so they are searched before anything else at the next level.
      level = next.sort((a, b) => Number(/quarter/i.test(b)) - Number(/quarter/i.test(a)) || a.localeCompare(b));
    }
    if (!found.length) {
      throw new Error(`No quarterly corporate file (cordata.zip or cordata0.txt to cordata9.txt) was found on ${SUNBIZ_SFTP_HOST} within ${maxDepth} folders of the top. The server's layout may have changed: see ${SUNBIZ_DOWNLOADS_PAGE}`);
    }
    // A zip and its unzipped parts may both be there: take the parts when present.
    const parts = found.filter((f) => /\.txt$/i.test(f.remote));
    const take = parts.length ? parts : found;
    fs.mkdirSync(opts.dir, { recursive: true });
    const out: Downloaded[] = [];
    for (const f of take) {
      const local = path.join(opts.dir, safeName(path.posix.basename(f.remote)));
      log(`  Sunbiz: ${f.remote} (${Math.round(f.size / 1e6)} MB)`);
      await client.fastGet(f.remote, local);
      if (/\.zip$/i.test(local)) {
        for (const part of await extractZip(local, opts.dir)) out.push({ source: "sunbiz", from: f.remote, file: part, bytes: fs.statSync(part).size });
      } else out.push({ source: "sunbiz", from: f.remote, file: local, bytes: fs.statSync(local).size });
    }
    return out;
  } finally {
    await client.end().catch(() => undefined);
  }
}
