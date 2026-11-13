import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSql, stripSql } from '../../shared/sql-guard.js';
import { PGlite } from '@electric-sql/pglite';
import { sampleSql, sampleData } from '../../shared/sample-db.js';

test('guard allows reads, blocks writes and multiple statements', () => {
  for (const ok of ['SELECT 1', 'with x as (select 1) select * from x;', "select 'drop; delete' as note", 'select comment, load, "update" from t -- delete everything']) assert.equal(checkSql(ok).ok, true, ok);
  for (const bad of ['select 1; drop table t', 'DELETE FROM t', 'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d', 'select * into t2 from t', 'select pg_sleep(5)', 'select pg_read_file(\'/etc/passwd\')', '', 'explain analyze select 1']) assert.equal(checkSql(bad).ok, false, bad);
});

test('strip keeps structure but hides literals and comments', () => {
  assert.equal(stripSql("select 'it''s; x' -- c\n, 2").includes(';'), false);
  assert.equal(stripSql('select $$a;b$$').includes(';'), false);
});

test('sample data is deterministic and consistent', () => {
  const a = sampleData();
  const b = sampleData();
  assert.deepEqual(a.orders.slice(0, 5), b.orders.slice(0, 5));
  assert.equal(a.orders.length, 2000);
  const custById = new Map(a.customers.map((c) => [c.id, c]));
  assert.ok(a.orders.every((o) => o.order_date >= custById.get(o.customer_id).signup_date), 'no order before signup');
});

test('sample SQL loads into Postgres (PGlite) and read-only transactions block writes', async () => {
  const db = await PGlite.create();
  await db.exec(sampleSql());
  const { rows } = await db.query('SELECT count(*)::int AS n FROM orders');
  assert.equal(rows[0].n, 2000);
  await db.exec('BEGIN READ ONLY');
  await assert.rejects(db.query('DELETE FROM orders'), /read-only/);
  await db.exec('ROLLBACK');
  await assert.rejects(db.query('select 1; select 2'), /multiple commands/);
  await db.close();
});
