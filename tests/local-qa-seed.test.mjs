import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const client = new pg.Client({ connectionString });
await client.connect();
const accounts = await client.query("SELECT email,(email_confirmed_at IS NOT NULL) AS confirmed,(encrypted_password IS NOT NULL AND length(encrypted_password)>0) AS password_ready FROM auth.users WHERE email LIKE '%@tourny.local' ORDER BY email");
assert.deepEqual(accounts.rows.map((row) => row.email), ['organizer@tourny.local', 'owner@tourny.local', 'player@tourny.local', 'scorer@tourny.local']);
assert.ok(accounts.rows.every((row) => row.confirmed && row.password_ready));
assert.equal((await client.query("SELECT count(*) FROM public.tournament_members WHERE tournament_id='90200000-0000-0000-0000-000000000001' AND status='ACTIVE'")).rows[0].count, '4');
assert.equal((await client.query("SELECT count(*) FROM public.match_scorers WHERE match_id='90700000-0000-0000-0000-000000000001'")).rows[0].count, '1');
await client.end();
console.log('Local QA seed: PASS (four accounts, role associations, scoring fixture)');