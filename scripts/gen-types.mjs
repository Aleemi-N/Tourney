// Writes src/lib/api/types.ts from the database: tables, views and functions the browser roles can reach.
//   pnpm db:types        (needs `pnpm db:reset`; LOCAL_DATABASE_URL overrides the address)
// tests/types-fresh.test.mjs fails when the file no longer matches the database, i.e. after a migration without this.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const NUMBER = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid']);
const STRING = new Set(['text', 'varchar', 'bpchar', 'name', 'uuid', 'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval', 'bytea', 'citext', 'inet']);

export async function generate(url = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5440/tourny') {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const q = async (sql) => (await db.query(sql)).rows;
    const types = new Map((await q('SELECT oid::int AS oid, typname, typtype, typelem::int AS elem, typcategory, typbasetype::int AS base, typrelid::int AS rel FROM pg_type')).map((t) => [t.oid, t]));
    const enums = new Map();
    for (const e of await q('SELECT enumtypid::int AS id, enumlabel FROM pg_enum ORDER BY enumsortorder')) enums.set(e.id, [...(enums.get(e.id) ?? []), e.enumlabel]);

    const ts = (oid) => {
      const t = types.get(oid);
      if (!t) return 'unknown';
      if (t.typcategory === 'A') return `${ts(t.elem)}[]`;
      if (t.typtype === 'd') return ts(t.base);
      if (t.typtype === 'e') return enums.get(oid).map((l) => JSON.stringify(l)).join(' | ');
      if (NUMBER.has(t.typname)) return 'number';
      if (t.typname === 'bool') return 'boolean';
      if (t.typname === 'json' || t.typname === 'jsonb') return 'Json';
      if (STRING.has(t.typname)) return 'string';
      return 'unknown';
    };
    const key = (name) => (/^[a-z_][a-z0-9_]*$/i.test(name) ? name : JSON.stringify(name));
    const indent = (lines, n) => lines.map((l) => ' '.repeat(n) + l).join('\n');

    // Relations the signed-in or signed-out browser can touch in any way.
    const relations = await q(`
      SELECT c.oid::int AS oid, c.relname AS name, c.relkind AS kind FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
        AND NOT c.relispartition
        AND (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
             OR has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE') OR has_any_column_privilege('anon', c.oid, 'SELECT'))
      ORDER BY c.relname`);
    const columns = await q(`
      SELECT a.attrelid::int AS rel, a.attname AS name, a.atttypid::int AS type, a.attnotnull AS notnull, a.atthasdef AS hasdef, a.attidentity AS identity, a.attgenerated AS generated
      FROM pg_attribute a WHERE a.attnum > 0 AND NOT a.attisdropped AND a.attrelid IN (SELECT c.oid FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace)
      ORDER BY a.attname`);
    const byRel = new Map();
    for (const c of columns) byRel.set(c.rel, [...(byRel.get(c.rel) ?? []), c]);
    const relKind = new Map((await q(`SELECT oid::int AS oid, relname, relkind FROM pg_class WHERE relnamespace = 'public'::regnamespace`)).map((r) => [r.oid, r]));

    const tables = [];
    const views = [];
    for (const r of relations) {
      const cols = byRel.get(r.oid) ?? [];
      if (r.kind === 'v' || r.kind === 'm') {
        views.push(`${key(r.name)}: {\n  Row: {\n${indent(cols.map((c) => `${key(c.name)}: ${ts(c.type)} | null`), 4)}\n  }\n  Relationships: []\n}`);
        continue;
      }
      const row = cols.map((c) => `${key(c.name)}: ${ts(c.type)}${c.notnull ? '' : ' | null'}`);
      const optional = (c) => !c.notnull || c.hasdef || c.identity !== '';
      const insert = cols.map((c) => (c.generated === 's' ? `${key(c.name)}?: never` : `${key(c.name)}${optional(c) ? '?' : ''}: ${ts(c.type)}${c.notnull ? '' : ' | null'}`));
      const update = cols.map((c) => (c.generated === 's' ? `${key(c.name)}?: never` : `${key(c.name)}?: ${ts(c.type)}${c.notnull ? '' : ' | null'}`));
      tables.push(`${key(r.name)}: {\n  Row: {\n${indent(row, 4)}\n  }\n  Insert: {\n${indent(insert, 4)}\n  }\n  Update: {\n${indent(update, 4)}\n  }\n  Relationships: []\n}`);
    }

    const procs = await q(`
      SELECT p.proname AS name, p.pronargdefaults AS ndef, p.proretset AS retset, p.prorettype::int AS ret,
             COALESCE(p.proargnames, '{}') AS names, COALESCE(p.proargmodes::text[], '{}') AS modes,
             COALESCE(p.proallargtypes, p.proargtypes::oid[])::int[] AS argtypes, p.pronargs AS nin
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.prorettype <> 'trigger'::regtype
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ORDER BY p.proname, p.pronargs, p.oid`);
    const functions = new Map();
    for (const p of procs) {
      const args = p.argtypes.map((type, i) => ({ type, name: p.names[i] || `arg${i + 1}`, mode: p.modes[i] ?? 'i' }));
      const input = args.filter((a) => ['i', 'b', 'v'].includes(a.mode));
      const out = args.filter((a) => ['o', 'b', 't'].includes(a.mode));
      const firstOptional = input.length - p.ndef;
      const argType = input.length
        ? `{\n${indent(input.map((a, i) => `${key(a.name)}${i >= firstOptional ? '?' : ''}: ${ts(a.type)} | null`), 6)}\n    }`
        : 'Record<PropertyKey, never>';
      let returns;
      const rel = types.get(p.ret)?.rel ? relKind.get(types.get(p.ret).rel) : null;
      if (out.length) returns = `{ ${out.map((a) => `${key(a.name)}: ${ts(a.type)}`).join('; ')} }`;
      else if (rel && ['r', 'p'].includes(rel.relkind)) returns = `Database["public"]["Tables"]["${rel.relname}"]["Row"]`;
      else if (rel && ['v', 'm'].includes(rel.relkind)) returns = `Database["public"]["Views"]["${rel.relname}"]["Row"]`;
      else returns = types.get(p.ret)?.typname === 'void' ? 'undefined' : ts(p.ret);
      if (p.retset || (out.length && p.retset)) returns = `${returns}[]`;
      const entry = functions.get(p.name) ?? { args: [], returns: [] };
      entry.args.push(argType);
      if (!entry.returns.includes(returns)) entry.returns.push(returns);
      functions.set(p.name, entry);
    }
    const fns = [...functions].map(([name, f]) => `${key(name)}: {\n  Args: ${f.args.length > 1 ? f.args.join(' | ') : f.args[0]}\n  Returns: ${f.returns.join(' | ')}\n}`);

    const enumDefs = (await q(`SELECT t.oid::int AS oid, t.typname FROM pg_type t WHERE t.typtype = 'e' AND t.typnamespace = 'public'::regnamespace ORDER BY t.typname`))
      .map((e) => `${key(e.typname)}: ${enums.get(e.oid).map((l) => JSON.stringify(l)).join(' | ')}`);

    const indentBlock = (text) => text.split('\n').map((l) => `      ${l}`).join('\n');
    const section = (name, items) => `    ${name}: {\n${items.length ? items.map(indentBlock).join('\n') : '      [_ in never]: never'}\n    }`;
    return `// Generated by scripts/gen-types.mjs from the database. Do not edit; run \`pnpm db:types\` after changing migrations.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
${section('Tables', tables)}
${section('Views', views)}
${section('Functions', fns)}
${section('Enums', enumDefs)}
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
`;
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = await generate();
  writeFileSync('src/lib/api/types.ts', text);
  console.log(`wrote src/lib/api/types.ts (${text.split('\n').length} lines)`);
}
