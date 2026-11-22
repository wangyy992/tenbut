import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0000_fluffy_roland_deschain.sql', import.meta.url), 'utf8'));
// Deliberately async to exercise compare-and-swap retries between simultaneous requests.
export const env = { DB: { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...args) { return { async first() { await Promise.resolve(); return stmt.get(...args) || null; }, async run() { await Promise.resolve(); const r = stmt.run(...args); return {meta:{changes:Number(r.changes)}}; } }; } }; } } };
