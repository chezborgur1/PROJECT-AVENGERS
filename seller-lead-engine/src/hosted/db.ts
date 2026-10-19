// The hosted app's one database connection: Postgres through node-postgres
// (`pg`), which reaches every Postgres Vercel offers (Neon, Supabase, Prisma
// Postgres, AWS) over the connection string the Vercel integration sets. The
// rest of the hosted code sees only `Db`, so tests run the same SQL on
// PGlite (Postgres compiled to WebAssembly, in memory) with no network.

/** The queries the hosted app runs: plain SQL, and a transaction on one connection. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run `fn` in one transaction: committed when it returns, rolled back when it throws. */
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/** The connection string the Vercel database integrations set (first found wins). */
export function databaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  return env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL || undefined;
}

/** A pool of at most three connections (a serverless instance serves one request at a time; Neon's pooler does the rest). */
export async function pgDb(connectionString: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 });
  // An idle connection the server closes must not crash the instance.
  pool.on("error", () => undefined);
  const wrap = (c: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Db => ({
    query: async <T>(text: string, params?: unknown[]) => (await c.query(text, params)) as { rows: T[] },
    tx: () => Promise.reject(new Error("Nested transactions are not used")),
    end: async () => undefined,
  });
  return {
    query: async <T>(text: string, params?: unknown[]) => (await pool.query(text, params)) as unknown as { rows: T[] },
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

/** The part of a PGlite instance this adapter uses. */
export interface PGliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: { query<R>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** The same interface over PGlite, for tests and the local preview of the hosted app (npm run hosted:dev). */
export function pgliteDb(db: PGliteLike): Db {
  return {
    query: (text, params) => db.query(text, params),
    tx: (fn) =>
      db.transaction((t) =>
        fn({
          query: (text, params) => t.query(text, params),
          tx: () => Promise.reject(new Error("Nested transactions are not used")),
          end: async () => undefined,
        }),
      ),
    end: () => db.close(),
  };
}
