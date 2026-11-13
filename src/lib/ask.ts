// One question, end to end: schema → AI writes SQL → run it here → if Postgres errors, send the error
// back for a fix (at most twice). The data never leaves the browser; only the schema description does.
import { api } from '../api';
import { describe, run, type Result } from './db';

export type Chart = { type: 'bar' | 'line' | 'number' | 'table'; x: string | null; y: string | null; title: string | null };
type Answer = { sql: string; explanation: string; chart: Chart; ok: boolean; reason: string | null };
export type Turn = { id: string; question: string; sql: string; explanation: string; chart: Chart; result: Result | null; error: string | null; fixes: number };

const today = () => new Date().toISOString().slice(0, 10);
export const MAX_FIXES = 2;

export async function ask(question: string, history: Turn[], onStage: (s: string) => void): Promise<Turn> {
  onStage('Reading the tables…');
  const schema = await describe();
  onStage('Writing the query…');
  let a = await api<Answer>('/sql', { body: { question, schema, today: today(), history: history.filter((h) => !h.error).slice(-2).map((h) => ({ question: h.question, sql: h.sql })) } });
  let fixes = 0;
  for (;;) {
    let error: string;
    if (a.ok) {
      try {
        onStage('Running it on your data…');
        const result = await run(a.sql);
        return { id: crypto.randomUUID(), question, sql: a.sql, explanation: a.explanation, chart: a.chart, result, error: null, fixes };
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    } else error = a.reason || 'The query was not allowed.';
    if (fixes >= MAX_FIXES) return { id: crypto.randomUUID(), question, sql: a.sql, explanation: a.explanation, chart: a.chart, result: null, error, fixes };
    fixes += 1;
    onStage(`Fixing the query (try ${fixes} of ${MAX_FIXES})…`);
    a = await api<Answer>('/sql/fix', { body: { question, schema, sql: a.sql, error, today: today() } });
  }
}

/** Re-run a saved question without the AI. */
export async function rerun(saved: { question: string; sql: string; explanation: string; chart: Chart }): Promise<Turn> {
  try {
    return { id: crypto.randomUUID(), ...saved, result: await run(saved.sql), error: null, fixes: 0 };
  } catch (e) {
    return { id: crypto.randomUUID(), ...saved, result: null, error: e instanceof Error ? e.message : String(e), fixes: 0 };
  }
}
