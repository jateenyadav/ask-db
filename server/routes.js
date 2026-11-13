// AskDB API: question → checked SQL (the browser runs it on its own in-browser Postgres), and saved questions.

import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { route, parse, ApiError } from './lib/http.js';
import { checkSql } from '../shared/sql-guard.js';
import { SYSTEM, answerSchema, askPrompt, fixPrompt, schemaInput } from './askdb.js';

export const BIG_BODY = [];
const CACHE_MS = 86400000;
const MAX_SAVED = 100;

function savedModel() {
  if (mongoose.models.SavedQuery) return mongoose.models.SavedQuery;
  return mongoose.model('SavedQuery', new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    dataset: { type: String, default: 'sample' },
    question: String,
    sql: String,
    explanation: String,
    chart: mongoose.Schema.Types.Mixed,
  }, { timestamps: true }));
}

const view = (d) => ({ id: String(d._id), dataset: d.dataset, question: d.question, sql: d.sql, explanation: d.explanation, chart: d.chart, createdAt: d.createdAt });

const today = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const askInput = z.object({
  question: z.string().trim().min(3).max(500),
  schema: schemaInput,
  today,
  history: z.array(z.object({ question: z.string().max(500), sql: z.string().max(8000) })).max(2).default([]),
});
const fixInput = z.object({ question: z.string().trim().min(3).max(500), schema: schemaInput, sql: z.string().max(8000), error: z.string().max(1000), today });
const saveInput = z.object({
  dataset: z.string().trim().min(1).max(80).default('sample'),
  question: z.string().trim().min(3).max(500),
  sql: z.string().min(1).max(8000),
  explanation: z.string().max(600).default(''),
  chart: z.object({ type: z.enum(['bar', 'line', 'number', 'table']), x: z.string().max(63).nullable(), y: z.string().max(63).nullable(), title: z.string().max(120).nullable() }),
});

const DEMO_SAVED = [
  { question: 'Revenue by month from delivered orders', sql: "SELECT to_char(o.order_date, 'YYYY-MM') AS month, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue\nFROM orders o JOIN order_items oi ON oi.order_id = o.id\nWHERE o.status = 'delivered'\nGROUP BY 1 ORDER BY 1", explanation: 'Adds up quantity × price of every delivered order line, month by month.', chart: { type: 'line', x: 'month', y: 'revenue', title: 'Revenue by month' } },
  { question: 'Which 5 cities spend the most?', sql: "SELECT c.city, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nJOIN order_items oi ON oi.order_id = o.id\nWHERE o.status = 'delivered'\nGROUP BY c.city ORDER BY revenue DESC LIMIT 5", explanation: 'Joins orders to customers to get each city, then ranks cities by delivered revenue.', chart: { type: 'bar', x: 'city', y: 'revenue', title: 'Top 5 cities by revenue' } },
  { question: 'What share of orders were cancelled?', sql: "SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'cancelled') / COUNT(*), 2) AS cancelled_percent FROM orders", explanation: 'Counts cancelled orders and divides by all orders.', chart: { type: 'number', x: null, y: 'cancelled_percent', title: 'Cancelled orders (%)' } },
];

export async function seedDemo(user) {
  await savedModel().insertMany(DEMO_SAVED.map((s) => ({ ...s, userId: String(user._id), dataset: 'sample' })));
}

export async function deleteUserData(userId) {
  await savedModel().deleteMany({ userId: String(userId) });
}

export function appRoutes({ ai, aiQuota, requireUser }) {
  const r = express.Router();
  const Saved = savedModel();

  const answer = async (label, prompt) => {
    const out = await ai.json(answerSchema, { label, system: SYSTEM, prompt, maxTokens: 900, temperature: 0.1, cacheTtlMs: CACHE_MS });
    const check = checkSql(out.sql);
    return { ...out, sql: check.ok ? check.sql : out.sql, ok: check.ok, reason: check.ok ? null : check.reason };
  };
  const todayOf = (b) => b.today || new Date().toISOString().slice(0, 10);

  r.post('/sql', requireUser, route(async (req, res) => {
    const body = parse(askInput, req.body);
    const quota = await aiQuota(req.user);
    res.json({ ...(await answer('sql', askPrompt({ ...body, today: todayOf(body) }))), remaining: quota.remaining });
  }));

  r.post('/sql/fix', requireUser, route(async (req, res) => {
    const body = parse(fixInput, req.body);
    const quota = await aiQuota(req.user);
    res.json({ ...(await answer('sql-fix', fixPrompt({ ...body, today: todayOf(body) }))), remaining: quota.remaining });
  }));

  r.get('/saved', requireUser, route(async (req, res) => {
    const docs = await Saved.find({ userId: String(req.user._id) }).sort({ createdAt: -1 }).limit(MAX_SAVED);
    res.json({ saved: docs.map(view) });
  }));

  r.post('/saved', requireUser, route(async (req, res) => {
    const body = parse(saveInput, req.body);
    const check = checkSql(body.sql);
    if (!check.ok) throw new ApiError(400, check.reason);
    const userId = String(req.user._id);
    if (await Saved.countDocuments({ userId }) >= MAX_SAVED) throw new ApiError(403, `You can save up to ${MAX_SAVED} questions.`);
    res.status(201).json({ saved: view(await Saved.create({ ...body, sql: check.sql, userId })) });
  }));

  r.delete('/saved/:id', requireUser, route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Not found.');
    const out = await Saved.deleteOne({ _id: req.params.id, userId: String(req.user._id) });
    if (!out.deletedCount) throw new ApiError(404, 'Not found.');
    res.json({ ok: true });
  }));

  return r;
}
