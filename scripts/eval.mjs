// Execution accuracy on the Chai Bazaar sample: 30 questions with hand-written correct SQL.
// Each question goes through the real API (in-process, real free AI), the answer SQL runs on PGlite with
// the same guard + read-only transaction + up-to-2 automatic fixes as the browser, and its rows are
// compared with the correct query's rows. Writes docs/eval-results.md + .json.  Needs GROQ_API_KEY.
//   node scripts/eval.mjs        (Node 23+: imports the browser's .ts database code directly)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

for (const file of [resolve('.env'), resolve(process.env.HOME || '', 'Desktop/RND/.secrets/shared.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
  console.error('Add GROQ_API_KEY (or GEMINI_API_KEY) to ~/Desktop/RND/.secrets/shared.env first.');
  process.exit(1);
}
const FAST = process.env.EVAL_FAST === '1';
const wait = (ms) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

const { createApp } = await import('../server/app.js');
const { createAi } = await import('../server/lib/ai.js');
const { memoryCounterStore } = await import('../server/lib/limits.js');
const { connectDb } = await import('../server/lib/db.js');
const { describe, run, getDb } = await import('../src/lib/db.ts');

const D = "o.status = 'delivered'";
const REV = 'SUM(oi.quantity * oi.unit_price)';
const QUESTIONS = [
  ['How many customers are there?', 'SELECT count(*) FROM customers'],
  ['How many orders were placed in total?', 'SELECT count(*) FROM orders'],
  ['How many orders were cancelled?', "SELECT count(*) FROM orders WHERE status = 'cancelled'"],
  ['How many customers live in Pune?', "SELECT count(*) FROM customers WHERE city = 'Pune'"],
  ['List all product categories.', 'SELECT DISTINCT category FROM products'],
  ['What is the most expensive product and its price?', 'SELECT name, price FROM products ORDER BY price DESC LIMIT 1'],
  ['How many products are in each category?', 'SELECT category, count(*) FROM products GROUP BY category'],
  ['How many orders came from each channel?', 'SELECT channel, count(*) FROM orders GROUP BY channel'],
  ['What is the total revenue from delivered orders?', `SELECT ${REV} FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE ${D}`],
  ['Show revenue from delivered orders for each month of 2026.', `SELECT to_char(o.order_date, 'YYYY-MM'), ${REV} FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE ${D} AND o.order_date >= '2026-01-01' GROUP BY 1`],
  ['What are the top 5 products by units sold in delivered orders?', `SELECT p.name, SUM(oi.quantity) AS units FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE ${D} GROUP BY p.name ORDER BY units DESC, p.name LIMIT 5`],
  ['Which city has the most customers?', 'SELECT city, count(*) FROM customers GROUP BY city ORDER BY count(*) DESC LIMIT 1'],
  ['What is the average order value of delivered orders, rounded to 2 decimals?', `SELECT ROUND(AVG(t), 2) FROM (SELECT ${REV} AS t FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE ${D} GROUP BY o.id) x`],
  ['How many orders were placed in October 2026?', "SELECT count(*) FROM orders WHERE order_date BETWEEN '2026-10-01' AND '2026-10-31'"],
  ['Who are the top 3 customers by delivered revenue?', `SELECT c.name, ${REV} AS revenue FROM orders o JOIN customers c ON c.id = o.customer_id JOIN order_items oi ON oi.order_id = o.id WHERE ${D} GROUP BY c.id, c.name ORDER BY revenue DESC LIMIT 3`],
  ['How many customers have never placed an order?', 'SELECT count(*) FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)'],
  ['What percentage of orders came through WhatsApp, rounded to 2 decimals?', "SELECT ROUND(100.0 * count(*) FILTER (WHERE channel = 'whatsapp') / count(*), 2) FROM orders"],
  ['What is the delivered revenue for each product category?', `SELECT p.category, ${REV} FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE ${D} GROUP BY p.category`],
  ['Which product category sold the most units in delivered orders in October 2026?', `SELECT p.category, SUM(oi.quantity) AS units FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE ${D} AND o.order_date BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY p.category ORDER BY units DESC LIMIT 1`],
  ['How many different customers placed an order in 2025?', "SELECT count(DISTINCT customer_id) FROM orders WHERE order_date < '2026-01-01'"],
  ['How many orders were returned in each channel?', "SELECT channel, count(*) FROM orders WHERE status = 'returned' GROUP BY channel"],
  ['On average, how many lines does an order have? Round to 2 decimals.', 'SELECT ROUND(AVG(n), 2) FROM (SELECT count(*) AS n FROM order_items GROUP BY order_id) x'],
  ['Which month of 2026 had the most orders?', "SELECT to_char(order_date, 'YYYY-MM'), count(*) FROM orders WHERE order_date >= '2026-01-01' GROUP BY 1 ORDER BY 2 DESC LIMIT 1"],
  ['How many customers signed up in each city during 2026?', "SELECT city, count(*) FROM customers WHERE signup_date >= '2026-01-01' GROUP BY city"],
  ["How many units of 'Masala Chai Blend 250g' were sold in delivered orders?", `SELECT SUM(oi.quantity) FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE ${D} AND p.name = 'Masala Chai Blend 250g'`],
  ['What is the average product price in each category, rounded to 2 decimals?', 'SELECT category, ROUND(AVG(price), 2) FROM products GROUP BY category'],
  ['How many orders contain at least one product from the Gifts category?', "SELECT count(DISTINCT oi.order_id) FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE p.category = 'Gifts'"],
  ['How many customers placed more than 10 orders?', 'SELECT count(*) FROM (SELECT customer_id FROM orders GROUP BY customer_id HAVING count(*) > 10) x'],
  ['What are the dates of the first and the last order?', 'SELECT min(order_date), max(order_date) FROM orders'],
  ['Compare delivered revenue from app orders and web orders.', `SELECT o.channel, ${REV} FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE ${D} AND o.channel IN ('app', 'web') GROUP BY o.channel`],
];

/* ---------- compare result sets ---------- */
const norm = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return (Math.round(v * 100) / 100).toFixed(2);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return (Math.round(Number(s) * 100) / 100).toFixed(2);
  return s.toLowerCase();
};
/** Same rows (any order); each correct row's values must all appear in the matching answer row (extra columns are fine). */
function sameRows(gold, pred) {
  if (gold.length !== pred.length) return false;
  const left = pred.map((r) => Object.values(r).map(norm));
  return gold.every((g) => {
    const want = Object.values(g).map(norm);
    const i = left.findIndex((p) => { const pool = [...p]; return want.every((w) => { const k = pool.indexOf(w); if (k < 0) return false; pool.splice(k, 1); return true; }); });
    if (i < 0) return false;
    left.splice(i, 1);
    return true;
  });
}

/* ---------- run ---------- */
const mem = await MongoMemoryServer.create();
const ai = createAi({ budgetMs: 9000 });
const app = createApp({ ai, counters: memoryCounterStore(), db: () => connectDb(mem.getUri(), 'ask-db-eval'), limits: { aiPerDay: 1000 } });
const agent = request.agent(app);
await agent.post('/api/auth/register').send({ name: 'Eval', email: 'eval@example.com', password: 'eval-password-123' }).expect(201);
await getDb();
const schema = await describe();
const db = await getDb();
const today = '2026-11-13';

const post = async (path, body) => {
  for (let a = 0; ; a++) {
    const res = await agent.post(path).send(body);
    if (res.status === 200) return res.body;
    if (a >= 4 || ![429, 502, 503, 504].includes(res.status)) throw new Error(`${res.status} ${res.body?.error}`);
    await wait(15000 * (a + 1));
  }
};

const results = [];
for (const [i, [question, goldSql]] of QUESTIONS.entries()) {
  const gold = (await db.query(goldSql)).rows;
  const t0 = Date.now();
  let a = await post('/api/sql', { question, schema, today });
  let fixes = 0;
  let rows = null;
  let error = null;
  for (;;) {
    try {
      if (!a.ok) throw new Error(a.reason);
      rows = (await run(a.sql)).rows;
      error = null;
      break;
    } catch (e) {
      error = String(e?.message || e);
      if (fixes >= 2) break;
      fixes += 1;
      await wait(2500);
      a = await post('/api/sql/fix', { question, schema, sql: a.sql, error, today });
    }
  }
  const correct = rows ? sameRows(gold, rows) : false;
  results.push({ i: i + 1, question, correct, fixes, error, ms: Date.now() - t0, sql: a.sql });
  console.log(`${String(i + 1).padStart(2)} ${correct ? '✓' : '✗'} ${fixes ? `(fixed ×${fixes}) ` : ''}${question}${error ? `  — ${error.slice(0, 80)}` : ''}`);
  await wait(2500); // free-tier requests per minute
}
await mongoose.disconnect();
await mem.stop();

const ok = results.filter((r) => r.correct).length;
const ran = results.filter((r) => !r.error).length;
const fixedOk = results.filter((r) => r.correct && r.fixes).length;
const ms = results.map((r) => r.ms).sort((x, y) => x - y);
const models = ai.status().providers.map((p) => `${p.name}:${p.model}`).join(', ');
const date = new Date().toISOString().slice(0, 10);
const out = FAST ? 'docs/eval-results.fake' : 'docs/eval-results';
mkdirSync('docs', { recursive: true });
writeFileSync(`${out}.json`, JSON.stringify({ date, models, results }, null, 2));
writeFileSync(`${out}.md`, `# AskDB accuracy (${date})

${QUESTIONS.length} questions about the Chai Bazaar sample database, each with a hand-written correct query.
An answer counts as correct when its rows match the correct query's rows (any order; extra columns allowed).
Models: ${models}.

| | Result |
|---|---|
| **Correct answers** | **${ok} / ${QUESTIONS.length}** |
| Queries that ran | ${ran} / ${QUESTIONS.length} |
| Correct only thanks to the automatic fix step | ${fixedOk} |
| Median time per question | ${ms[Math.floor(ms.length / 2)]} ms |

| # | Question | Correct | Fixes |
|---|---|---|---|
${results.map((r) => `| ${r.i} | ${r.question} | ${r.correct ? '✓' : '✗'} | ${r.fixes} |`).join('\n')}

Re-run: \`node scripts/eval.mjs\`.
`);
console.log(`\n${ok}/${QUESTIONS.length} correct → ${out}.md`);
