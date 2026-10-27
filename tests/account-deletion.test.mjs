import assert from 'node:assert/strict';
import pg from 'pg';

// Downloading your data and deleting your account. Rolled back at the end.
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
  const reg = (await client.query("SELECT r.id, pp.id AS player_id, pp.user_id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND r.status='PENDING' ORDER BY r.created_at LIMIT 1", [T1])).rows[0];
  const other = (await client.query("SELECT pp.user_id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND pp.user_id <> $2 LIMIT 1", [T1, reg.user_id])).rows[0];
  await client.query("INSERT INTO public.push_tokens (token, user_id, platform) VALUES ('ExponentPushToken[del-test]', $1, 'android')", [reg.user_id]);

  // Export: only my own data, and nothing for a signed-out caller.
  await as(null);
  await fails('SELECT public.export_my_data()', [], /permission denied/);
  await as(reg.email);
  const data = (await call('SELECT public.export_my_data() AS d'))[0].d;
  assert.equal(data.account.email, reg.email);
  assert.ok(data.player_profiles.length >= 1 && data.player_registrations.some((r) => r.id === reg.id));
  assert.equal(data.notification_devices, 1);
  assert.ok(!JSON.stringify(data).includes(other.email), "nobody else's details");

  // Deleting is not available to the app directly, only to the server.
  await fails('SELECT public.delete_account_data($1)', [reg.user_id], /permission denied/);

  // The sole organizer of a running tournament cannot vanish.
  const org = (await raw("SELECT m.user_id FROM public.tournament_members m JOIN public.tournaments t ON t.id=m.tournament_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1]))[0];
  await raw("UPDATE public.tournaments SET status='REGISTRATION' WHERE id=$1", [T1]);
  await raw("DELETE FROM public.tournament_members WHERE tournament_id=$1 AND role='ORGANIZER' AND status='ACTIVE' AND user_id<>$2", [T1, org.user_id]);
  await fails('SELECT public.delete_account_data($1)', [org.user_id], /only organizer/);

  // Deleting a player: details gone, sign-in gone, open registration withdrawn, history kept.
  await raw('SELECT public.delete_account_data($1)', [reg.user_id]);
  const profile = (await raw('SELECT full_name, phone, email, status FROM public.profiles WHERE id=$1', [reg.user_id]))[0];
  assert.deepEqual(profile, { full_name: 'Deleted user', phone: null, email: null, status: 'DELETED' });
  const u = (await raw('SELECT email, encrypted_password, banned_until, deleted_at FROM auth.users WHERE id=$1', [reg.user_id]))[0];
  assert.match(u.email, /^deleted-.*@deleted\.invalid$/); assert.equal(u.encrypted_password, ''); assert.ok(u.deleted_at); assert.equal(String(u.banned_until), 'Infinity');
  const player = (await raw('SELECT user_id, display_name, photo_path, date_of_birth, phone, place FROM public.player_profiles WHERE id=$1', [reg.player_id]))[0];
  assert.deepEqual(player, { user_id: null, display_name: 'Former player', photo_path: null, date_of_birth: null, phone: null, place: null });
  assert.equal((await raw('SELECT status FROM public.player_tournament_registrations WHERE id=$1', [reg.id]))[0].status, 'WITHDRAWN');
  assert.equal((await raw("SELECT count(*)::int n FROM public.push_tokens WHERE user_id=$1", [reg.user_id]))[0].n, 0);
  assert.equal((await raw("SELECT count(*)::int n FROM auth.users WHERE email=$1", [reg.email]))[0].n, 0, 'the old email can no longer sign in or be found');
  await fails('SELECT public.delete_account_data($1)', ['00000000-0000-0000-0000-00000000dead'], /Account not found/);
  console.log('Account export and deletion: PASS');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
