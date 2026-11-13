export function stripSql(sql: string): string;
export function checkSql(sql: string): { ok: boolean; sql?: string; reason?: string };
