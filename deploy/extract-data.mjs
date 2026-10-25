// Pulls the COPY blocks for the tables the new database has out of a pg_dump --data-only file
// (auth.users, auth.identities, public.*) and writes them to stdout, so a
// Supabase dump can be loaded into the plain-PostgreSQL schema built by bootstrap.sql + migrations.
// Usage: node deploy/extract-data.mjs dump.sql > data.sql
import fs from 'node:fs';
const wanted = (schema, table) => schema === 'public' || (schema === 'auth' && ['users', 'identities'].includes(table));
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const out = ['SET session_replication_role = replica;', 'SET client_encoding = \'UTF8\';'];
const skipped = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^COPY "([a-z_]+)"\."([a-z_]+)" \((.*)\) FROM stdin;$/);
  if (!m) continue;
  const end = lines.indexOf('\\.', i);
  if (end < 0) throw new Error('unterminated COPY at line ' + (i + 1));
  if (wanted(m[1], m[2])) { out.push(...lines.slice(i, end + 1)); } else skipped.push(`${m[1]}.${m[2]}`);
  i = end;
}
console.error(`kept ${out.length} lines; skipped: ${skipped.join(', ')}`);
console.log(out.join('\n'));
