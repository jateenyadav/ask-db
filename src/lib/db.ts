// The visitor's own Postgres, running in the browser (PGlite, WebAssembly). Nothing here touches the server.
// It is kept in IndexedDB, so uploaded tables survive a reload (in-memory if storage is blocked).
import type { PGlite } from '@electric-sql/pglite';
import { checkSql } from '../../shared/sql-guard.js';

export type Column = { name: string; type: string; fk?: string; hint?: string };
export type Table = { name: string; comment?: string; rows: number; columns: Column[]; samples: Record<string, unknown>[] };
export type Schema = { tables: Table[] };
export type Result = { columns: { name: string; numeric: boolean; date: boolean }[]; rows: Record<string, unknown>[]; ms: number; truncated: boolean };

const NUMERIC_TYPES = new Set([20, 21, 23, 700, 701, 1700]); // int8, int2, int4, float4, float8, numeric
const DATE_TYPES = new Set([1082, 1114, 1184]);
export const SAMPLE_TABLES = ['customers', 'products', 'orders', 'order_items'];
const MAX_ROWS = 1000;

let dbPromise: Promise<PGlite> | null = null;

export function getDb(): Promise<PGlite> {
  dbPromise ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const parsers = { 20: Number, 1700: Number };
    let db: PGlite;
    try {
      db = await PGlite.create('idb://askdb-v1', { parsers });
    } catch {
      db = await PGlite.create({ parsers });
    }
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders'");
    if (!rows[0].n) await loadSample(db);
    return db;
  })();
  return dbPromise;
}

async function loadSample(db: PGlite) {
  const { sampleSql } = await import('../../shared/sample-db.js');
  await db.exec(sampleSql());
}

export async function resetSample() {
  const db = await getDb();
  await db.exec('DROP TABLE IF EXISTS order_items, orders, products, customers CASCADE');
  await loadSample(db);
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** What the AI gets to see: names, types, keys, value hints and 3 sample rows per table. Never the data itself. */
export async function describe(): Promise<Schema> {
  const db = await getDb();
  const cols = (await db.query<{ table_name: string; column_name: string; data_type: string }>(
    "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position",
  )).rows;
  const fks = (await db.query<{ t: string; c: string; ft: string; fc: string }>(`
    SELECT kcu.table_name AS t, kcu.column_name AS c, ccu.table_name AS ft, ccu.column_name AS fc
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`)).rows;
  const comments = (await db.query<{ t: string; c: string | null }>(
    "SELECT c.relname AS t, obj_description(c.oid) AS c FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'",
  )).rows;
  const tables = [...new Set(cols.map((c) => c.table_name))].sort((a, b) => (SAMPLE_TABLES.indexOf(a) + 1 || 99) - (SAMPLE_TABLES.indexOf(b) + 1 || 99) || a.localeCompare(b));
  const out: Table[] = [];
  for (const name of tables.slice(0, 30)) {
    const columns: Column[] = cols.filter((c) => c.table_name === name).map((c) => {
      const fk = fks.find((f) => f.t === name && f.c === c.column_name);
      return { name: c.column_name, type: c.data_type, ...(fk ? { fk: `${fk.ft}.${fk.fc}` } : {}) };
    });
    const rows = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${q(name)}`)).rows[0].n;
    for (const c of columns) {
      if (c.fk || c.name === 'id') continue;
      if (/date|timestamp/.test(c.type)) {
        const r = (await db.query<{ lo: string; hi: string }>(`SELECT min(${q(c.name)})::text AS lo, max(${q(c.name)})::text AS hi FROM ${q(name)}`)).rows[0];
        if (r.lo) c.hint = `${r.lo} … ${r.hi}`;
      } else if (/text|char/.test(c.type)) {
        const r = (await db.query<{ v: string }>(`SELECT DISTINCT ${q(c.name)}::text AS v FROM ${q(name)} WHERE ${q(c.name)} IS NOT NULL LIMIT 13`)).rows;
        if (r.length && r.length <= 12) c.hint = `values: ${r.map((x) => x.v).join(', ')}`.slice(0, 280);
      }
    }
    const samples = (await db.query<Record<string, unknown>>(`SELECT * FROM ${q(name)} LIMIT 3`)).rows;
    const comment = comments.find((c) => c.t === name)?.c || undefined;
    out.push({ name, rows, columns, samples, ...(comment ? { comment } : {}) });
  }
  return { tables: out };
}

/** Run one checked, read-only query. Throws with Postgres's own error message. */
export async function run(sql: string): Promise<Result> {
  const check = checkSql(sql);
  if (!check.ok) throw new Error(check.reason ?? 'This query is not allowed.');
  const db = await getDb();
  const t0 = performance.now();
  await db.exec('BEGIN READ ONLY');
  try {
    const res = await db.query<Record<string, unknown>>(check.sql!);
    return {
      columns: res.fields.map((f) => ({ name: f.name, numeric: NUMERIC_TYPES.has(f.dataTypeID), date: DATE_TYPES.has(f.dataTypeID) })),
      rows: res.rows.slice(0, MAX_ROWS),
      truncated: res.rows.length > MAX_ROWS,
      ms: Math.round(performance.now() - t0),
    };
  } finally {
    await db.exec('ROLLBACK');
  }
}

export async function dropTable(name: string) {
  if (SAMPLE_TABLES.includes(name)) throw new Error('Sample tables can be reset, not deleted.');
  const db = await getDb();
  await db.exec(`DROP TABLE IF EXISTS ${q(name)}`);
}
