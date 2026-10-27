import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { CsvTable } from "../store/csvTable.ts";
import { openStores } from "../store/index.ts";
import type { Db } from "./db.ts";

// Keeps a space's data folder in Postgres, so the hosted app runs the very
// same engine code (which reads and writes CSV files) on a server whose disk
// is temporary. Before a request, the folder is rebuilt in the instance's
// temporary directory from the database; after a step, what changed is
// written back in one transaction.
//
// Every engine table is stored row by row (lead_engine_rows, one JSON object
// per CSV row, in file order), so a step that changes one prospect writes one
// row, and the data can be read in the database itself: the amb_* views show
// the main tables as ordinary columns. Every other file (settings, outbox,
// inbox, handoff notes, checks, reports, the Places cache) is stored whole
// (lead_engine_files). Raw state downloads stay out: they are imported, then
// thrown away.
//
// One step writes at a time: a lease in lead_engine_spaces, which expires on
// its own if an instance dies mid-step. Opt-outs are permanent here too: a
// save that would leave the real do-not-contact list shorter is refused.

/** Where a space's files sit in this instance's temporary folder. */
export interface Layout {
  /** The space's folder; every stored path is relative to it. */
  root: string;
  /** The engine's data folder inside it. */
  dataDir: string;
}

/** What this instance last read from or wrote to the database, to compare a step's result against. */
export interface Snapshot {
  version: number;
  tables: Map<string, { columns: string[]; rows: string[]; stored: number }>;
  files: Map<string, string>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lead_engine_spaces (
  space text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  lock_holder text,
  lock_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lead_engine_tables (
  space text NOT NULL,
  tbl text NOT NULL,
  columns jsonb NOT NULL,
  PRIMARY KEY (space, tbl)
);
CREATE TABLE IF NOT EXISTS lead_engine_rows (
  space text NOT NULL,
  tbl text NOT NULL,
  pos integer NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (space, tbl, pos)
);
CREATE TABLE IF NOT EXISTS lead_engine_files (
  space text NOT NULL,
  path text NOT NULL,
  content text NOT NULL,
  encoding text NOT NULL DEFAULT 'utf8',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space, path)
);`;

/** Views over the real data's main tables, for reading in the database's own tools. */
const VIEWS: Record<string, string> = {
  amb_prospects: "data/prospects.csv",
  amb_emails: "data/touches.csv",
  amb_replies: "data/replies.csv",
  amb_leads: "data/leads.csv",
  amb_do_not_contact: "data/suppression.csv",
  amb_buyers: "data/buyers/leads.csv",
  amb_buyer_emails: "data/buyers/touches.csv",
  amb_buyer_partners: "data/buyers/partners.csv",
};

/** Raw state downloads, half-written files and temp files never go to the database. */
const SKIP = [/^data\/downloads\//, /\.part$/, /\.tmp-\d+$/];
const BATCH = 2000;
/** Postgres text and jsonb cannot hold NUL. */
const clean = (v: string) => v.replace(/\u0000/g, "");

/** A row as one comparable string: keys sorted, so the database's own key order does not matter. */
function canon(row: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(row).sort().map((k) => [k, clean(String(row[k] ?? ""))])));
}

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const rel = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");

/** The engine's tables in a data folder, by path relative to the space's folder. */
function tablesOf(layout: Layout): Map<string, { file: string; columns: string[] }> {
  const out = new Map<string, { file: string; columns: string[] }>();
  for (const v of Object.values(openStores(layout.dataDir))) if (v instanceof CsvTable) out.set(rel(layout.root, v.file), { file: v.file, columns: v.columns });
  return out;
}

/** A CSV file's header and records, read the way CsvTable reads it. */
function readCsv(file: string): { columns: string[]; records: Record<string, string>[] } {
  if (!fs.existsSync(file)) return { columns: [], records: [] };
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) return { columns: [], records: [] };
  let columns: string[] = [];
  const records = parse(text, {
    columns: (header: string[]) => (columns = header),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  return { columns, records };
}

/** Every file under `dir`, as paths relative to `root`. */
function walk(root: string, dir = root): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    return d.isDirectory() ? walk(root, full) : d.isFile() ? [rel(root, full)] : [];
  });
}

/** A file's text for the database: UTF-8 when it is, base64 otherwise. */
function encode(buf: Buffer): { content: string; enc: "utf8" | "base64" } {
  const text = buf.toString("utf8");
  return Buffer.from(text, "utf8").equals(buf) && !text.includes("\u0000") ? { content: text, enc: "utf8" } : { content: buf.toString("base64"), enc: "base64" };
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Thrown when a save would break a rule; nothing is written. */
export class MirrorRefused extends Error {}

/** A space's files, kept in Postgres. */
export class Mirror {
  private schema: Promise<void> | undefined;

  constructor(private readonly db: Db) {}

  /** Create the tables and views once per instance (safe to race: one creator at a time). */
  ensureSchema(): Promise<void> {
    this.schema ??= this.db
      .tx(async (q) => {
        await q.query("SELECT pg_advisory_xact_lock(727274001)");
        for (const stmt of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) await q.query(stmt);
        const live = tablesOf({ root: "/space", dataDir: "/space/data" });
        for (const [view, tbl] of Object.entries(VIEWS)) {
          const cols = (live.get(tbl)?.columns ?? []).filter((c) => /^[a-z0-9_]+$/.test(c));
          await q.query(`DROP VIEW IF EXISTS ${view}`);
          await q.query(`CREATE VIEW ${view} AS SELECT pos + 1 AS row_number, ${cols.map((c) => `data->>'${c}' AS "${c}"`).join(", ")} FROM lead_engine_rows WHERE space = 'live' AND tbl = '${tbl}'`);
        }
      })
      .catch((err) => {
        this.schema = undefined;
        throw err;
      });
    return this.schema;
  }

  /** The space's current version (0 before its first save). */
  async version(space: string): Promise<number> {
    await this.ensureSchema();
    const { rows } = await this.db.query<{ version: string | number }>("SELECT version FROM lead_engine_spaces WHERE space = $1", [space]);
    return Number(rows[0]?.version ?? 0);
  }

  /** Rebuild the space's folder from the database, replacing what was there. */
  async hydrate(space: string, layout: Layout): Promise<Snapshot> {
    await this.ensureSchema();
    const read = await this.db.tx(async (q) => {
      // One consistent read, so a save landing in between cannot mix two versions.
      await q.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const v = await q.query<{ version: string | number }>("SELECT version FROM lead_engine_spaces WHERE space = $1", [space]);
      const tables = await q.query<{ tbl: string; columns: string[] | string }>("SELECT tbl, columns FROM lead_engine_tables WHERE space = $1", [space]);
      const rows = await q.query<{ tbl: string; pos: number; data: string }>("SELECT tbl, pos, data::text AS data FROM lead_engine_rows WHERE space = $1 ORDER BY tbl, pos", [space]);
      const files = await q.query<{ path: string; content: string; encoding: string }>("SELECT path, content, encoding FROM lead_engine_files WHERE space = $1", [space]);
      return { version: Number(v.rows[0]?.version ?? 0), tables: tables.rows, rows: rows.rows, files: files.rows };
    });

    fs.rmSync(layout.root, { recursive: true, force: true });
    fs.mkdirSync(layout.dataDir, { recursive: true });
    const snap: Snapshot = { version: read.version, tables: new Map(), files: new Map() };
    const byTable = new Map<string, { pos: number; data: Record<string, string> }[]>();
    for (const r of read.rows) {
      const list = byTable.get(r.tbl) ?? [];
      list.push({ pos: Number(r.pos), data: JSON.parse(r.data) as Record<string, string> });
      byTable.set(r.tbl, list);
    }
    for (const t of read.tables) {
      const columns = (typeof t.columns === "string" ? JSON.parse(t.columns) : t.columns) as string[];
      const list = byTable.get(t.tbl) ?? [];
      const file = path.join(layout.root, t.tbl);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, stringify(list.map((r) => r.data), { header: true, columns }));
      // Positions are always written 0..n-1; if they are not, the next save rewrites the whole table.
      const contiguous = list.every((r, i) => r.pos === i);
      snap.tables.set(t.tbl, { columns, rows: contiguous ? list.map((r) => canon(r.data)) : [], stored: list.length ? list[list.length - 1]!.pos + 1 : 0 });
    }
    for (const f of read.files) {
      const buf = f.encoding === "base64" ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8");
      const file = path.join(layout.root, f.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buf);
      snap.files.set(f.path, sha(buf));
    }
    return snap;
  }

  /**
   * Write what changed in the space's folder since `snap`, in one transaction,
   * and return the new snapshot. Nothing is written (and the version stays)
   * when nothing changed.
   */
  async persist(space: string, layout: Layout, snap: Snapshot): Promise<Snapshot> {
    await this.ensureSchema();
    const tables = tablesOf(layout);
    const next: Snapshot = { version: snap.version, tables: new Map(), files: new Map() };
    const tableWork: { tbl: string; columns: string[]; changed: { p: number; d: unknown }[]; keep: number; columnsChanged: boolean; gone: boolean }[] = [];

    for (const [tbl, t] of tables) {
      const old = snap.tables.get(tbl);
      if (!fs.existsSync(t.file)) {
        if (old) tableWork.push({ tbl, columns: [], changed: [], keep: 0, columnsChanged: true, gone: true });
        continue;
      }
      const { columns, records } = readCsv(t.file);
      const cols = columns.length ? columns : t.columns;
      const rows = records.map(canon);
      // Opt-outs are permanent (CLAUDE.md): the real do-not-contact list never loses a row.
      if (space === "live" && tbl.endsWith("suppression.csv") && old && rows.length < old.stored) {
        throw new MirrorRefused(`Refusing to save: the do-not-contact list would go from ${old.stored} to ${rows.length} rows. Nothing was saved.`);
      }
      const changed: { p: number; d: unknown }[] = [];
      rows.forEach((r, i) => {
        if (old?.rows[i] !== r) changed.push({ p: i, d: JSON.parse(r) });
      });
      const columnsChanged = !old || JSON.stringify(old.columns) !== JSON.stringify(cols);
      if (changed.length || columnsChanged || (old && old.stored > rows.length)) tableWork.push({ tbl, columns: cols, changed, keep: rows.length, columnsChanged, gone: false });
      next.tables.set(tbl, { columns: cols, rows, stored: rows.length });
    }

    const tableFiles = new Set(tables.keys());
    const present = walk(layout.root).filter((f) => !tableFiles.has(f) && !SKIP.some((re) => re.test(f)));
    const upserts: { path: string; content: string; enc: string }[] = [];
    for (const f of present) {
      const buf = fs.readFileSync(path.join(layout.root, f));
      const h = sha(buf);
      next.files.set(f, h);
      if (snap.files.get(f) !== h) upserts.push({ path: f, ...encode(buf) });
    }
    const deleted = [...snap.files.keys()].filter((f) => !next.files.has(f));

    if (!tableWork.length && !upserts.length && !deleted.length) return next;

    next.version = await this.db.tx(async (q) => {
      for (const w of tableWork) {
        if (w.gone) {
          await q.query("DELETE FROM lead_engine_rows WHERE space = $1 AND tbl = $2", [space, w.tbl]);
          await q.query("DELETE FROM lead_engine_tables WHERE space = $1 AND tbl = $2", [space, w.tbl]);
          continue;
        }
        if (w.columnsChanged) {
          await q.query("INSERT INTO lead_engine_tables (space, tbl, columns) VALUES ($1, $2, $3::jsonb) ON CONFLICT (space, tbl) DO UPDATE SET columns = EXCLUDED.columns", [space, w.tbl, JSON.stringify(w.columns)]);
        }
        await q.query("DELETE FROM lead_engine_rows WHERE space = $1 AND tbl = $2 AND pos >= $3", [space, w.tbl, w.keep]);
        for (const part of chunks(w.changed, BATCH)) {
          await q.query(
            "INSERT INTO lead_engine_rows (space, tbl, pos, data) SELECT $1, $2, (e->>'p')::int, e->'d' FROM jsonb_array_elements($3::jsonb) AS e ON CONFLICT (space, tbl, pos) DO UPDATE SET data = EXCLUDED.data",
            [space, w.tbl, JSON.stringify(part)],
          );
        }
      }
      for (const part of chunks(upserts, 200)) {
        await q.query(
          "INSERT INTO lead_engine_files (space, path, content, encoding, updated_at) SELECT $1, e->>'path', e->>'content', e->>'enc', now() FROM jsonb_array_elements($2::jsonb) AS e ON CONFLICT (space, path) DO UPDATE SET content = EXCLUDED.content, encoding = EXCLUDED.encoding, updated_at = now()",
          [space, JSON.stringify(part)],
        );
      }
      if (deleted.length) await q.query("DELETE FROM lead_engine_files WHERE space = $1 AND path IN (SELECT jsonb_array_elements_text($2::jsonb))", [space, JSON.stringify(deleted)]);
      const v = await q.query<{ version: string | number }>(
        "INSERT INTO lead_engine_spaces (space, version) VALUES ($1, 1) ON CONFLICT (space) DO UPDATE SET version = lead_engine_spaces.version + 1, updated_at = now() RETURNING version",
        [space],
      );
      return Number(v.rows[0]!.version);
    });
    return next;
  }

  /** Take the space's write lease for `seconds`; false when someone else holds it. */
  async lock(space: string, holder: string, seconds: number): Promise<boolean> {
    await this.ensureSchema();
    await this.db.query("INSERT INTO lead_engine_spaces (space) VALUES ($1) ON CONFLICT (space) DO NOTHING", [space]);
    const { rows } = await this.db.query(
      "UPDATE lead_engine_spaces SET lock_holder = $2, lock_until = now() + ($3::int * interval '1 second') WHERE space = $1 AND (lock_until IS NULL OR lock_until < now()) RETURNING space",
      [space, holder, Math.ceil(seconds)],
    );
    return rows.length > 0;
  }

  /** Give the lease back (only the holder can). */
  async unlock(space: string, holder: string): Promise<void> {
    await this.db.query("UPDATE lead_engine_spaces SET lock_holder = NULL, lock_until = NULL WHERE space = $1 AND lock_holder = $2", [space, holder]);
  }
}
