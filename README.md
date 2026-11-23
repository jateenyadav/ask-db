# AskDB

**Live demo:** coming soon (needs free API keys; run it locally in 2 minutes, see below) · [![CI](https://github.com/jateenyadav/ask-db/actions/workflows/ci.yml/badge.svg)](https://github.com/jateenyadav/ask-db/actions/workflows/ci.yml)

Ask your data a question in plain English. Get the SQL, a table and a chart.

AskDB turns your question into a PostgreSQL query and runs it on a **real Postgres database inside your
browser** ([PGlite](https://pglite.dev), WebAssembly). Then it picks a chart and explains the query in
one sentence. Start with *Chai Bazaar*, a sample shop with 2,000 orders, or upload your own CSV. Click
**Try the demo**; no sign-up needed.

<!-- demo video: docs/demo.mp4 -->

## Features
- **Private by design.** Every visitor gets their own database in the browser. The AI receives only the
  schema: table and column names, types, foreign keys, value hints and 3 example rows per table. It never
  receives the data, and no server database is exposed.
- **Safe by design: 3 fences.**
  1. The server checks the AI's SQL with [`shared/sql-guard.js`](shared/sql-guard.js). It must be one
     statement starting with SELECT/WITH, with no data-modifying CTE, no `SELECT INTO` and no dangerous
     functions.
  2. The browser checks it again.
  3. It runs inside a `READ ONLY` transaction, over the extended protocol, which allows only one
     statement.
- **Self-repair.** If Postgres returns an error, the error is sent back to the AI, which fixes the query
  (at most 2 tries). Answers that needed a fix are marked *auto-fixed*.
- **Charts that fit the result**: a single number, a line chart for time, a bar chart for categories,
  otherwise a table. If the AI suggests a chart the data can't support, AskDB falls back to the table.
- **Upload any CSV** (up to 10 MB / 100k rows). Column types are guessed (integer, numeric, date,
  boolean, text), and names are made SQL-safe.
- **Follow-up questions** ("only for Mumbai") use the last two queries as context.
- **Saved questions** re-run instantly with no AI call. You can export any answer as CSV (formula-safe).

## How it works
```
Browser                                                   Netlify Function                Free AI
───────                                                   ────────────────                ───────
PGlite (Postgres 17 in WASM, IndexedDB)
  describe(): names, types, FKs, value hints, 3 rows ──POST /api/sql──▶ zod + daily cap ──▶ Groq Llama 3.3 70B
                                                  ◀── {sql, explanation, chart} ── sql-guard  (Gemini fallback)
  sql-guard → BEGIN READ ONLY → query → ROLLBACK
  error? ──────────────────────────────────────────POST /api/sql/fix──▶ (max 2)
  chart + table + explanation; Save ─────────────────POST /api/saved──▶ MongoDB (question + SQL only)
```

## Measured results
[`scripts/eval.mjs`](scripts/eval.mjs) asks 30 questions about the sample shop. Each question has a
hand-written correct query, and the script compares the rows that come back: same rows in any order,
extra columns allowed. It uses the same guard, read-only run and automatic fix step as the browser.
Results go in `docs/eval-results.md`. *(Not run yet: this needs a real Groq key. No numbers are shown
until there is a real run.)*

## Key decisions
- **Postgres in the browser instead of a shared server database.** Visitors can't see each other's data,
  there is nothing to attack on the server, and hosting is free. The cost is ~3 MB of compressed
  WebAssembly, loaded only after login.
- **The schema, not the data, goes to the AI.** Value hints (e.g. `status: delivered, cancelled, …`) and
  date ranges give the AI the context it needs to write correct filters without seeing the rows.
- **Guard + read-only transaction**, not the guard alone. The text check catches obvious problems early
  with a readable message. The transaction is the real wall.

## Run locally
```bash
npm install
npm run dev        # API on :8888 + web on :5173. No keys needed: in-memory DB + fake AI
npm test           # 17 API, guard and PGlite tests
npm run test:e2e   # Playwright: demo → ask → chart → save → re-run → CSV upload → auto-fix (desktop + phone)
node scripts/eval.mjs   # accuracy run (needs GROQ_API_KEY)
```

## Credits
Inspired by [vercel-labs/natural-language-postgres](https://github.com/vercel-labs/natural-language-postgres).
This is an independent implementation. The sample data is generated and made up.

## License
MIT
