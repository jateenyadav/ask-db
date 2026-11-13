// Is this SQL a single read-only query? Used by the server (before returning AI SQL) and by the
// browser (before running anything). It is the first fence, not the only one: the browser also runs
// every query inside a READ ONLY transaction over the extended protocol (one statement only).

// One statement that starts with SELECT/WITH can still change data through a data-modifying CTE
// (WITH x AS (DELETE ...)), SELECT INTO, or dangerous functions. Those are what is blocked here.
const FORBIDDEN = /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|lo_get|dblink\w*|set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|nextval|setval|txid_current)\b/i;

/** Remove comments and the contents of string literals / quoted identifiers, so keywords inside them don't count. */
export function stripSql(sql) {
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i++;
      out += ' ';
    } else if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < sql.length && !(sql[i] === q && sql[i + 1] !== q)) i += sql[i] === q ? 2 : 1;
      out += q === "'" ? "''" : '"x"';
    } else if (c === '$' && /^\$[a-z_]*\$/i.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^\$[a-z_]*\$/i)[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end < 0 ? sql.length : end + tag.length - 1;
      out += "''";
    } else out += c;
  }
  return out;
}

export function checkSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) return { ok: false, reason: 'No SQL was produced.' };
  if (sql.length > 8000) return { ok: false, reason: 'The query is too long.' };
  const bare = stripSql(sql).trim().replace(/;\s*$/, '');
  if (bare.includes(';')) return { ok: false, reason: 'Only one statement is allowed.' };
  if (!/^(select|with)\b/i.test(bare)) return { ok: false, reason: 'Only SELECT queries are allowed.' };
  const bad = bare.match(FORBIDDEN);
  if (bad) return { ok: false, reason: `"${bad[0].toUpperCase()}" is not allowed in a read-only question.` };
  if (/\binto\b/i.test(bare) && /\bselect\b[\s\S]*\binto\b[\s\S]*\bfrom\b/i.test(bare)) return { ok: false, reason: 'SELECT INTO is not allowed.' };
  return { ok: true, sql: sql.trim().replace(/;\s*$/, '') };
}
