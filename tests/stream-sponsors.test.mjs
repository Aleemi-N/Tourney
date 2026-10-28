import assert from 'node:assert/strict';
import pg from 'pg';

// The live stream link and the sponsors. Rolled back at the end.
const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await client.connect();
const T1 = '90200000-0000-0000-0000-000000000001';

const as = async (email) => {
  await client.query('RESET ROLE');
  if (!email) { await client.query("SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)"); await client.query('SET LOCAL ROLE anon'); return; }
  const { rows } = await client.query('SELECT id FROM auth.users WHERE email=$1', [email]);
  await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: rows[0].id, role: 'authenticated' }), rows[0].id]);
  await client.query('SET LOCAL ROLE authenticated');
};
const call = async (sql, args = []) => (await client.query(sql, args)).rows;
const raw = async (sql, args = []) => { await client.query('RESET ROLE'); return (await client.query(sql, args)).rows; };
const fails = async (sql, args, pattern) => {
  await client.query('SAVEPOINT s');
  try { await client.query(sql, args); } catch (e) { await client.query('ROLLBACK TO s'); assert.match(e.message, pattern); return; }
  await client.query('ROLLBACK TO s');
  assert.fail(`expected failure: ${pattern}`);
};

try {
  await client.query('BEGIN');
  const org = (await client.query("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0].email;
  const player = (await client.query("SELECT u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 LIMIT 1", [T1])).rows[0].email;
  const slug = (await client.query('SELECT slug FROM public.tournaments WHERE id=$1', [T1])).rows[0].slug;

  // Stream link: organizers only, https only.
  await as(player);
  await fails("SELECT public.set_stream_url($1, 'https://youtu.be/abc')", [T1], /Unauthorized/);
  await as(org);
  await fails("SELECT public.set_stream_url($1, 'http://youtu.be/abc')", [T1], /starting with https/);
  await fails("SELECT public.set_stream_url($1, 'javascript:alert(1)')", [T1], /starting with https/);
  await fails("SELECT public.set_stream_url($1, 'https://exa mple.com')", [T1], /starting with https/);
  await call("SELECT public.set_stream_url($1, 'https://www.youtube.com/live/abc123')", [T1]);

  // Sponsors: validation, ordering by tier, logo folder rule.
  await fails("SELECT public.save_sponsor($1, NULL, '', NULL, 'SPONSOR', NULL, 0)", [T1], /name/);
  await fails("SELECT public.save_sponsor($1, NULL, 'Acme', 'ftp://acme.example', 'SPONSOR', NULL, 0)", [T1], /https/);
  await fails("SELECT public.save_sponsor($1, NULL, 'Acme', NULL, 'GOLD', NULL, 0)", [T1], /Choose title/);
  await fails("SELECT public.save_sponsor($1, NULL, 'Acme', NULL, 'SPONSOR', 'someone-else/logo.png', 0)", [T1], /from this tournament/);
  const partner = (await call("SELECT public.save_sponsor($1, NULL, 'Local Cafe', NULL, 'PARTNER', NULL, 0) AS id", [T1]))[0].id;
  const spons = (await call("SELECT public.save_sponsor($1, NULL, 'Acme Ltd', 'https://acme.example', 'SPONSOR', $2, 1) AS id", [T1, `${T1}/sponsor-1.png`]))[0].id;
  const title = (await call("SELECT public.save_sponsor($1, NULL, 'Big Bank', 'https://bank.example', 'TITLE', NULL, 2) AS id", [T1]))[0].id;
  assert.deepEqual((await call('SELECT name FROM public.list_sponsors($1)', [T1])).map((r) => r.name), ['Big Bank', 'Acme Ltd', 'Local Cafe']);
  await call("SELECT public.save_sponsor($1, $2, 'Acme Limited', 'https://acme.example/new', 'SPONSOR', NULL, 1)", [T1, spons]);
  assert.equal((await call('SELECT * FROM public.list_sponsors($1)', [T1])).find((r) => r.id === spons).logo_path, `${T1}/sponsor-1.png`, 'the logo stays when none is sent');

  // The public sees the link and the sponsors of a public tournament, and cannot change or list them directly.
  await as(null);
  const extras = (await call('SELECT public.get_public_extras($1) AS x', [slug]))[0].x;
  assert.equal(extras.stream_url, 'https://www.youtube.com/live/abc123');
  assert.deepEqual(extras.sponsors.map((s) => s.name), ['Big Bank', 'Acme Limited', 'Local Cafe']);
  assert.equal((await call('SELECT public.get_public_extras($1) AS x', ['no-such-tournament']))[0].x, null);
  await fails('SELECT * FROM public.list_sponsors($1)', [T1], /permission denied|Unauthorized/);
  await fails("SELECT public.save_sponsor($1, NULL, 'Spam', NULL, 'SPONSOR', NULL, 0)", [T1], /permission denied|Unauthorized/);
  await as(player);
  await fails('SELECT public.delete_sponsor($1)', [partner], /Unauthorized/);
  await fails('SELECT * FROM public.list_sponsors($1)', [T1], /Unauthorized/);

  // Delete, and clear the stream link.
  await as(org);
  await call('SELECT public.delete_sponsor($1)', [partner]);
  assert.equal((await call('SELECT * FROM public.list_sponsors($1)', [T1])).length, 2);
  await call("SELECT public.set_stream_url($1, '')", [T1]);
  await as(null);
  assert.equal((await call('SELECT public.get_public_extras($1) AS x', [slug]))[0].x.stream_url, null);
  assert.equal((await raw("SELECT has_table_privilege('anon','public.sponsors','SELECT') a, has_table_privilege('authenticated','public.sponsors','INSERT') b"))[0].a, false);
  console.log('Stream link and sponsors: PASS');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
