import { useEffect, useState } from 'react';
import { api, type User } from './api';
import Workspace from './components/Workspace';

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('adb:theme');
      if (saved) return saved === 'dark';
    } catch { /* storage blocked */ }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('adb:theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-lg text-white shadow-md shadow-brand-600/30" aria-hidden>⌁</span>
      <span className="text-lg font-extrabold tracking-tight">Ask<span className="text-brand-600 dark:text-brand-400">DB</span></span>
    </span>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, toggleTheme] = useTheme();
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ user: User | null }>('/auth/me').then((d) => setUser(d.user), () => {}).finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await api('/auth/logout', { body: {} }).catch(() => {});
    setUser(null);
  };

  const deleteAccount = async () => {
    const password = user?.demo ? undefined : window.prompt('Type your password to delete your account and all saved questions:');
    if (!user?.demo && !password) return;
    if (user?.demo && !window.confirm('Delete this demo account and its saved questions?')) return;
    try {
      await api('/auth/account', { method: 'DELETE', body: { password } });
      setUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account.');
    }
  };

  const themeButton = (
    <button className="grid h-9 w-9 place-items-center rounded-xl text-lg hover:bg-white/70 dark:hover:bg-slate-800" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? '☀️' : '🌙'}</button>
  );

  if (loading) return <div className="grid min-h-dvh place-items-center"><Logo /></div>;
  if (!user) return <Landing onUser={setUser} themeButton={themeButton} />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-10">
      <header className="no-print flex items-center justify-between gap-3 py-4">
        <Logo />
        <div className="flex items-center gap-1">
          {themeButton}
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl px-2 text-sm font-semibold hover:bg-white/70 dark:hover:bg-slate-800">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-600/20 dark:text-brand-400">{user.name.slice(0, 1).toUpperCase()}</span>
              <span className="hidden sm:inline">{user.demo ? 'Demo' : user.name}</span>
            </summary>
            <div className="card absolute right-0 z-20 mt-2 w-56 p-2 text-sm">
              {user.demo && <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Demo account: everything is deleted after 24 hours.</p>}
              <button className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={signOut}>Sign out</button>
              <button className="w-full rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={deleteAccount}>Delete account</button>
            </div>
          </details>
        </div>
      </header>

      {error && <p role="alert" className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
      <main className="flex-1">
        <Workspace />
      </main>

    </div>
  );
}

function Landing({ onUser, themeButton }: { onUser: (u: User) => void; themeButton: React.ReactNode }) {
  const [mode, setMode] = useState<'none' | 'login' | 'register'>('none');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async (path: string, body: object) => {
    setBusy(true);
    setError('');
    try {
      onUser((await api<{ user: User }>(path, { body })).user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between py-4"><Logo />{themeButton}</header>
      <main className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-2">
        <div>
          <p className="inline-block rounded-full bg-accent-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-600 dark:text-accent-400">Free · Real Postgres in your browser</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Ask your data<br />
            <span className="text-brand-600 dark:text-brand-400">in plain English.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-600 dark:text-slate-300">AskDB writes the SQL, runs it on a real Postgres database inside your browser, and draws the chart. Start with a sample shop of 2,000 orders, or upload your own CSV.</p>
          <ul className="mt-6 space-y-2 text-sm">
            {['Your rows never leave the browser: the AI sees only column names and 3 example rows', 'Every query is read-only, checked twice before it runs', 'A failed query is sent back to the AI and fixed automatically', 'Charts, follow-up questions, saved questions and CSV export'].map((f) => (
              <li key={f} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">✓</span>{f}</li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <button className="btn-accent px-6 py-3 text-base" disabled={busy} onClick={() => go('/auth/demo', {})}>Try the demo</button>
            <button className="btn-ghost px-6 py-3 text-base" onClick={() => setMode(mode === 'login' ? 'none' : 'login')}>Sign in</button>
          </div>

          {mode !== 'none' && (
            <form className="card mt-5 max-w-sm space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void go(mode === 'login' ? '/auth/login' : '/auth/register', mode === 'login' ? { email: form.email, password: form.password } : form); }}>
              {mode === 'register' && <input className="field" placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />}
              <input className="field" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
              <input className="field" type="password" placeholder="Password (8+ characters)" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button className="btn-primary w-full" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
              <button type="button" className="w-full text-sm text-slate-500 hover:underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </button>
            </form>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
        </div>

        <div className="relative mx-auto w-full max-w-sm" aria-hidden>
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-400/30 to-accent-400/30 blur-2xl" />
          <div className="card space-y-4 p-5 shadow-xl">
            <p className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">Which 5 cities spend the most?</p>
            <div className="space-y-1.5 text-xs">
              {[['Mumbai', 100], ['Bengaluru', 96], ['Delhi', 90], ['Hyderabad', 62], ['Pune', 55]].map(([c, w]) => (
                <div key={c} className="grid grid-cols-[5.5rem_1fr] items-center gap-2"><span className="text-slate-600 dark:text-slate-300">{c}</span><span className="h-4 rounded-r" style={{ width: `${w}%`, background: 'var(--series-1)' }} /></div>
              ))}
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{`SELECT c.city, SUM(oi.quantity * oi.unit_price) AS revenue
FROM orders o JOIN customers c ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'delivered'
GROUP BY c.city ORDER BY revenue DESC LIMIT 5`}</pre>
            <p className="text-xs text-slate-500 dark:text-slate-400">💡 Ranks cities by revenue from delivered orders. Ran in 4 ms in your browser.</p>
          </div>
        </div>
      </main>
      <footer className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        Built by <a className="font-semibold underline" href="https://github.com/jateenyadav">Jateen Yadav</a> · <a className="underline" href="https://github.com/jateenyadav/ask-db">Source code</a>
      </footer>
    </div>
  );
}
