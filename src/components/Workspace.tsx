import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ask, rerun, MAX_FIXES, type Chart as ChartSpec, type Turn } from '../lib/ask';
import { importCsv } from '../lib/csv';
import { describe, dropTable, resetSample, SAMPLE_TABLES, type Schema } from '../lib/db';
import Chart, { ResultTable, resolveChart } from './Chart';

type Saved = { id: string; question: string; sql: string; explanation: string; chart: ChartSpec };

const EXAMPLES = ['Which 5 cities spend the most?', 'Revenue by month', 'Top 10 customers by spend', 'Average order value by channel', 'Which products are bought together with Kaju Katli?', 'What share of orders were returned?'];

function toCsv(t: Turn) {
  if (!t.result) return '';
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : /^[=+\-@]/.test(s) ? `'${s}` : s; };
  return [t.result.columns.map((c) => c.name).join(','), ...t.result.rows.map((r) => t.result!.columns.map((c) => esc(r[c.name])).join(','))].join('\n');
}

export default function Workspace() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<Saved[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try { setSchema(await describe()); } catch (e) { setLoadError(e instanceof Error ? e.message : 'The in-browser database could not start.'); }
  }, []);
  useEffect(() => {
    void refresh();
    api<{ saved: Saved[] }>('/saved').then((d) => setSaved(d.saved), () => {});
  }, [refresh]);

  const submit = async (question: string) => {
    if (question.trim().length < 3 || stage) return;
    setError('');
    setStage('Starting…');
    try {
      const t = await ask(question.trim(), turns, setStage);
      setTurns((all) => [t, ...all]);
      setQ('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setStage('');
    }
  };

  const save = async (t: Turn) => {
    try {
      const { saved: s } = await api<{ saved: Saved }>('/saved', { body: { question: t.question, sql: t.sql, explanation: t.explanation, chart: t.result ? resolveChart(t.chart, t.result) : t.chart } });
      setSaved((all) => [s, ...all]);
      setNote('Saved ✓');
      setTimeout(() => setNote(''), 2000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  };

  const upload = async (f: File) => {
    setError('');
    setStage(`Importing ${f.name}…`);
    try {
      const out = await importCsv(f, schema?.tables.map((t) => t.name) ?? []);
      await refresh();
      setNote(`Added table "${out.table}" (${out.rows.toLocaleString('en-IN')} rows, ${out.columns} columns). Ask about it!`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import the CSV.'); } finally { setStage(''); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="card p-4" aria-labelledby="h-data">
          <div className="flex items-center justify-between">
            <h2 id="h-data" className="font-extrabold">Your data</h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-600/15 dark:text-brand-400">Postgres in your browser</span>
          </div>
          {loadError ? <p className="mt-3 text-sm text-rose-600">{loadError}</p> : !schema ? <p className="mt-3 animate-pulse text-sm text-slate-500">Starting the database…</p> : (
            <ul className="mt-3 space-y-1.5 text-sm" data-testid="tables">
              {schema.tables.map((t) => (
                <li key={t.name}>
                  <details className="group rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{t.name}</span>
                      <span className="num text-xs text-slate-500">{t.rows.toLocaleString('en-IN')} rows</span>
                    </summary>
                    <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 font-mono text-xs dark:border-slate-800">
                      {t.columns.map((c) => (
                        <li key={c.name} className="flex justify-between gap-2">
                          <span>{c.name}{c.fk && <span className="ml-1 text-accent-600 dark:text-accent-400" title={`links to ${c.fk}`}>→ {c.fk.split('.')[0]}</span>}</span>
                          <span className="text-slate-400">{c.type.replace('character varying', 'text').replace('timestamp without time zone', 'timestamp')}</span>
                        </li>
                      ))}
                    </ul>
                    {!SAMPLE_TABLES.includes(t.name) && <button className="mt-2 text-xs font-semibold text-rose-600 hover:underline" onClick={async () => { if (window.confirm(`Delete table ${t.name} from this browser?`)) { await dropTable(t.name); await refresh(); } }}>Delete table</button>}
                  </details>
                </li>
              ))}
            </ul>
          )}
          <input ref={file} type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" className="hidden" data-testid="csv-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-ghost px-2 py-2 text-xs" onClick={() => file.current?.click()} disabled={Boolean(stage)}>⬆ Upload CSV</button>
            <button className="btn-ghost px-2 py-2 text-xs" onClick={async () => { await resetSample(); await refresh(); setNote('Sample data reset.'); }} disabled={Boolean(stage)}>↺ Reset sample</button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Only table names, column types and 3 example rows are sent to the AI. Your rows stay in this browser.</p>
        </section>

        <section className="card p-4" aria-labelledby="h-saved">
          <h2 id="h-saved" className="font-extrabold">Saved questions</h2>
          {saved.length === 0 ? <p className="mt-2 text-sm text-slate-500">Save an answer to re-run it any time, with no AI needed.</p> : (
            <ul className="mt-2 space-y-1" data-testid="saved">
              {saved.map((s) => (
                <li key={s.id} className="group flex items-center gap-1">
                  <button className="flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800" title={s.question} onClick={() => void rerun(s).then((t) => setTurns((all) => [t, ...all]))}>{s.question}</button>
                  <button className="rounded px-1.5 text-slate-400 opacity-60 hover:text-rose-600 group-hover:opacity-100" aria-label={`Delete saved question: ${s.question}`} onClick={async () => { await api(`/saved/${s.id}`, { method: 'DELETE' }); setSaved((all) => all.filter((x) => x.id !== s.id)); }}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="min-w-0 space-y-4">
        <form className="card p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); void submit(q); }}>
          <label htmlFor="question" className="sr-only">Your question</label>
          <div className="flex gap-2">
            <input id="question" className="field text-base" value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} placeholder={turns.length ? 'Ask a follow-up, e.g. “only for Mumbai”' : 'Ask your data a question…'} autoComplete="off" />
            <button className="btn-primary px-5" disabled={Boolean(stage) || q.trim().length < 3 || !schema}>Ask</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((x) => <button type="button" key={x} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:-translate-y-px hover:border-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => void submit(x)} disabled={Boolean(stage) || !schema}>{x}</button>)}
          </div>
        </form>

        {stage && <p role="status" className="card flex items-center gap-3 p-4 text-sm font-semibold"><span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />{stage}</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        {note && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-700 dark:bg-brand-600/10 dark:text-brand-400">{note}</p>}

        {turns.length === 0 && !stage && (
          <div className="card p-8 text-center">
            <p className="text-lg font-bold">Ask about the Chai Bazaar sample shop, or upload your own CSV.</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">2,000 orders from 300 customers in 10 cities, June 2025 to October 2026.</p>
          </div>
        )}

        <ol className="space-y-4" data-testid="answers">
          {turns.map((t) => (
            <li key={t.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
                <h3 className="font-bold">{t.question}</h3>
                <div className="flex gap-2">
                  {t.fixes > 0 && !t.error && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title="The first query failed and the AI fixed it">auto-fixed ×{t.fixes}</span>}
                  {t.result && <button className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-600/10" onClick={() => save(t)}>☆ Save</button>}
                  {t.result && <a className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-600/10" href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(t))}`} download="answer.csv">⬇ CSV</a>}
                </div>
              </div>
              <div className="space-y-4 p-4">
                {t.error ? (
                  <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Couldn’t answer this one{t.fixes ? ` after ${t.fixes} fix${t.fixes > 1 ? 'es' : ''}` : ''}: {t.error}{t.fixes >= MAX_FIXES ? ' Try asking it a different way.' : ''}</p>
                ) : t.result && (
                  <>
                    <Chart spec={t.chart} result={t.result} />
                    {t.result.rows.length === 0 ? <p className="text-sm text-slate-500">No rows matched.</p> : resolveChart(t.chart, t.result).type !== 'number' && <ResultTable result={t.result} />}
                  </>
                )}
                {t.explanation && <p className="text-sm text-slate-600 dark:text-slate-300">💡 {t.explanation}</p>}
                <details>
                  <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-500">SQL</summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100" data-testid="sql">{t.sql}</pre>
                </details>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );

}
