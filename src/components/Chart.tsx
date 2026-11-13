import { useState } from 'react';
import type { Result } from '../lib/db';
import type { Chart as ChartSpec } from '../lib/ask';

const fmt = (v: unknown) => (typeof v === 'number' ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v) : String(v ?? '—'));
const short = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
const nice = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v) ?? 10 * p;
};

/** Pick a chart the result can really support; fall back to the table when the AI's choice doesn't fit. */
export function resolveChart(spec: ChartSpec, r: Result): ChartSpec {
  const num = r.columns.filter((c) => c.numeric);
  if (r.rows.length === 1 && r.columns.length === 1 && num.length === 1) return { ...spec, type: 'number', y: num[0].name };
  const x = r.columns.find((c) => c.name === spec.x) ?? r.columns.find((c) => !c.numeric);
  const y = r.columns.find((c) => c.name === spec.y && c.numeric) ?? num.find((c) => c.name !== x?.name);
  if (!x || !y || r.rows.length < 2) return { ...spec, type: r.rows.length === 1 && y ? 'number' : 'table', x: x?.name ?? null, y: y?.name ?? null };
  const looksTime = x.date || /^\d{4}-\d{2}(-\d{2})?$/.test(String(r.rows[0][x.name]));
  if (spec.type === 'line' || (spec.type === 'bar' && looksTime && r.rows.length > 6)) return { ...spec, type: looksTime ? 'line' : 'bar', x: x.name, y: y.name };
  if (spec.type === 'bar' && r.rows.length <= 30) return { ...spec, type: 'bar', x: x.name, y: y.name };
  if (spec.type === 'number') return { ...spec, type: 'table' };
  return { ...spec, type: 'table', x: x.name, y: y.name };
}

export default function Chart({ spec, result }: { spec: ChartSpec; result: Result }) {
  const c = resolveChart(spec, result);
  const [hover, setHover] = useState<number | null>(null);
  if (c.type === 'table' || !c.y) return null;
  const rows = result.rows;

  if (c.type === 'number') {
    return (
      <div className="py-4" data-testid="chart-number">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{c.title || c.y}</p>
        <p className="num mt-1 text-5xl font-extrabold tracking-tight">{fmt(rows[0][c.y])}</p>
      </div>
    );
  }

  const vals = rows.map((r) => Number(r[c.y!]) || 0);
  const max = nice(Math.max(0, ...vals));

  if (c.type === 'bar') {
    return (
      <figure data-testid="chart-bar" aria-label={c.title || 'Bar chart'}>
        {c.title && <figcaption className="mb-3 text-sm font-bold">{c.title}</figcaption>}
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[minmax(5rem,10rem)_1fr_auto] items-center gap-3 text-sm" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span className="truncate text-slate-600 dark:text-slate-300" title={String(r[c.x!])}>{String(r[c.x!] ?? '—')}</span>
              <span className="h-5 rounded-r bg-slate-100 dark:bg-slate-800">
                <span className="block h-full rounded-r transition-[filter]" style={{ width: `${Math.max(1, (vals[i] / max) * 100)}%`, background: 'var(--series-1)', filter: hover === i ? 'brightness(1.12)' : undefined }} />
              </span>
              <span className="num w-20 text-right font-semibold">{short(vals[i])}</span>
            </li>
          ))}
        </ul>
      </figure>
    );
  }

  // line
  const W = 640; const H = 220; const L = 48; const B = 26; const T = 10;
  const pw = W - L - 10; const ph = H - B - T;
  const xAt = (i: number) => L + (rows.length === 1 ? pw / 2 : (i / (rows.length - 1)) * pw);
  const yAt = (v: number) => T + ph - (v / max) * ph;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join('');
  const every = Math.max(1, Math.ceil(rows.length / 8));
  const h = hover;
  return (
    <figure data-testid="chart-line" aria-label={c.title || 'Line chart'} className="relative">
      {c.title && <figcaption className="mb-2 text-sm font-bold">{c.title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - box.left) / box.width) * W;
          setHover(Math.max(0, Math.min(rows.length - 1, Math.round(((x - L) / pw) * (rows.length - 1)))));
        }}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - 10} y1={yAt(max * f)} y2={yAt(max * f)} stroke="var(--grid)" />
            <text x={L - 6} y={yAt(max * f)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px]">{short(max * f)}</text>
          </g>
        ))}
        <path d={`${d}L${xAt(rows.length - 1)},${yAt(0)}L${xAt(0)},${yAt(0)}Z`} fill="var(--series-1)" opacity={0.08} />
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
        {rows.map((r, i) => (i % every === 0 || i === rows.length - 1) && (
          <text key={i} x={xAt(i)} y={H - 6} textAnchor="middle" className="fill-slate-500 text-[11px]">{String(r[c.x!]).slice(0, 10)}</text>
        ))}
        {h != null && (
          <g>
            <line x1={xAt(h)} x2={xAt(h)} y1={T} y2={T + ph} stroke="var(--grid)" strokeWidth={1.5} />
            <circle cx={xAt(h)} cy={yAt(vals[h])} r={4.5} fill="var(--series-1)" stroke="white" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h != null && (
        <div role="tooltip" className="pointer-events-none absolute top-6 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow dark:bg-white dark:text-slate-900" style={{ left: `${(xAt(h) / W) * 100}%`, transform: 'translateX(-50%)' }}>
          <span className="font-semibold">{String(rows[h][c.x!])}</span> · <span className="num">{fmt(vals[h])}</span>
        </div>
      )}
    </figure>
  );
}

export function ResultTable({ result }: { result: Result }) {
  const [all, setAll] = useState(false);
  const shown = all ? result.rows : result.rows.slice(0, 12);
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm" data-testid="result-table">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>{result.columns.map((c) => <th key={c.name} className={`whitespace-nowrap px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 ${c.numeric ? 'text-right' : 'text-left'}`}>{c.name}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                {result.columns.map((c) => <td key={c.name} className={`whitespace-nowrap px-3 py-1.5 ${c.numeric ? 'num text-right' : ''}`}>{fmt(r[c.name])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{result.rows.length}{result.truncated ? '+ (first 1,000 shown)' : ''} row{result.rows.length === 1 ? '' : 's'} · {result.ms} ms in your browser</span>
        {result.rows.length > 12 && <button className="font-semibold text-brand-700 hover:underline dark:text-brand-400" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${result.rows.length}`}</button>}
      </p>
    </div>
  );
}
