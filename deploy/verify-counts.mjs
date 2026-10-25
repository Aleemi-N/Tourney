// Compares the row count of every table in a data dump with the database that was loaded from it.
// Usage: node deploy/verify-counts.mjs dump.sql [connection-string]   (default: the rehearsal database)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(process.cwd() + '/package.json')('pg');
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const expected = {};
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^COPY "?(public|auth)"?."?([a-z_]+)"? \(.*\) FROM stdin;$/);
  if (!m) continue;
  const end = lines.indexOf('\\.', i);
  if (m[1] === 'public' || ['users', 'identities'].includes(m[2])) expected[`${m[1]}.${m[2]}`] = end - i - 1;
  i = end;
}
const db = new Client({ connectionString: process.argv[3] ?? 'postgresql://postgres:postgres@127.0.0.1:55432/tourny' });
await db.connect();
let bad = 0;
for (const [table, rows] of Object.entries(expected)) {
  const exists = (await db.query('SELECT to_regclass($1) AS t', [table])).rows[0].t;
  const actual = exists ? Number((await db.query(`SELECT count(*) AS c FROM ${table}`)).rows[0].c) : null;
  if (actual !== rows) { bad++; console.log(`DIFF ${table}: dump ${rows}, database ${actual ?? 'table missing'}`); }
}
console.log(`${Object.keys(expected).length} tables compared, ${bad} differ`);
await db.end();
process.exit(bad ? 1 : 0);
