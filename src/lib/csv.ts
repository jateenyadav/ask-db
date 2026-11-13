// CSV file → a new table in the in-browser Postgres. Column types are guessed from the values.
import { getDb } from './db';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const delim = (() => {
    const head = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 1000);
    return [',', ';', '\t', '|'].map((d) => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  })();
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const RESERVED = new Set(['select', 'from', 'where', 'group', 'order', 'by', 'table', 'user', 'limit', 'offset', 'join', 'on', 'as', 'and', 'or', 'not', 'null', 'true', 'false', 'case', 'when', 'end', 'desc', 'asc', 'all', 'any', 'default', 'check', 'column', 'primary', 'references', 'unique', 'having', 'union', 'with', 'in', 'is', 'to', 'into', 'update', 'delete', 'insert', 'create', 'drop', 'alter', 'grant', 'copy', 'merge', 'truncate']);

/** "Order Date (UTC)" → "order_date_utc"; never a reserved word, never empty, never a duplicate. */
export function cleanName(raw: string, used = new Set<string>(), fallback = 'col') {
  let n = raw.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || fallback;
  if (/^\d/.test(n)) n = `c_${n}`;
  if (RESERVED.has(n)) n = `${n}_col`;
  let out = n;
  for (let k = 2; used.has(out); k++) out = `${n}_${k}`;
  used.add(out);
  return out;
}

type Kind = 'integer' | 'numeric' | 'date' | 'boolean' | 'text';
const isInt = (v: string) => /^-?\d{1,15}$/.test(v);
const isNum = (v: string) => /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v.replace(/,/g, ''));
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isBool = (v: string) => /^(true|false|yes|no)$/i.test(v);

export function guessType(values: string[]): Kind {
  const vals = values.map((v) => v.trim()).filter((v) => v !== '');
  if (!vals.length) return 'text';
  if (vals.every(isInt)) return 'integer';
  if (vals.every(isNum)) return 'numeric';
  if (vals.every(isDate)) return 'date';
  if (vals.every(isBool)) return 'boolean';
  return 'text';
}

const toValue = (v: string, kind: Kind) => {
  const s = v.trim();
  if (s === '') return null;
  if (kind === 'integer' || kind === 'numeric') return Number(s.replace(/,/g, ''));
  if (kind === 'boolean') return /^(true|yes)$/i.test(s);
  return s;
};

export const MAX_CSV_BYTES = 10_000_000;

export async function importCsv(file: File, existing: string[]): Promise<{ table: string; rows: number; columns: number }> {
  if (file.size > MAX_CSV_BYTES) throw new Error('CSV files can be up to 10 MB.');
  const rows = parseCsv(await file.text());
  if (rows.length < 2) throw new Error('This CSV needs a header row and at least one data row.');
  const [header, ...data] = rows;
  if (data.length > 100_000) throw new Error('CSV files can have up to 100,000 rows.');
  const used = new Set<string>();
  const names = header.map((h, i) => cleanName(h, used, `col_${i + 1}`));
  const kinds = names.map((_, i) => guessType(data.slice(0, 2000).map((r) => r[i] ?? '')));
  const table = cleanName(file.name.replace(/\.[^.]+$/, ''), new Set(existing), 'my_data');
  const db = await getDb();
  await db.exec(`CREATE TABLE "${table}" (${names.map((n, i) => `"${n}" ${kinds[i]}`).join(', ')})`);
  try {
    const width = names.length;
    const per = Math.max(1, Math.floor(30000 / width)); // stay under Postgres's 65,535 parameters per statement
    for (let i = 0; i < data.length; i += per) {
      const chunk = data.slice(i, i + per);
      const params: unknown[] = [];
      const tuples = chunk.map((r) => `(${names.map((_, c) => { params.push(toValue(r[c] ?? '', kinds[c])); return `$${params.length}`; }).join(', ')})`);
      await db.query(`INSERT INTO "${table}" VALUES ${tuples.join(', ')}`, params);
    }
  } catch (e) {
    await db.exec(`DROP TABLE IF EXISTS "${table}"`);
    throw new Error(`Could not import this CSV: ${e instanceof Error ? e.message : 'unknown error'}`);
  }
  await db.exec(`COMMENT ON TABLE "${table}" IS 'Uploaded from ${file.name.replace(/'/g, '').slice(0, 80)}'`);
  return { table, rows: data.length, columns: names.length };
}
