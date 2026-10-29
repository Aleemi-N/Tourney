// Smoke test of the API with the real client (src/lib/api/core.ts): auth, rpc, storage and live updates.
// Needs the API running against the seeded local database (see docs/v2-backend-architecture.md): node api/smoke.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const { Api } = await import('../src/lib/api/core.ts');
const password = fs.readFileSync('db/seed.sql', 'utf8').match(/extensions\.crypt\('([^']+)'/)[1];
let kept = null;
const sb = new Api('http://localhost:8080', { store: { get: () => kept, set: (session) => { kept = session; } } });
const { data, error } = await sb.auth.signInWithPassword({ email: 'player@tourny.local', password });
if (error) throw error;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const path = `${data.user.id}/sdk-${Date.now()}.png`;
const up = await sb.storage.from('avatars').upload(path, new Blob([png], { type: 'image/png' }), { upsert: true });
console.log('upload', up.error ?? 'ok');
const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
const res = await fetch(url);
console.log('read', res.status, res.headers.get('content-type'), (await res.arrayBuffer()).byteLength);
const rm = await sb.storage.from('avatars').remove([path]);
console.log('remove', rm.error ?? rm.data.length);
const rpc = await sb.rpc('get_public_standings', { p_tournament_id: '90200000-0000-0000-0000-000000000003' });
console.log('rpc', rpc.error ?? rpc.data.length + ' rows');

const matchId = '90700000-0000-0000-0000-000000000001';
const sql = (q) => execSync(`docker exec -i tourny-dev-db psql -U postgres -d tourny -At -c "${q}"`).toString();
const got = [];
const status = await new Promise((resolve) => {
  sb.channel('t1')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (m) => got.push(['matches', m.eventType, m.new.id, m.new.status]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` }, (m) => got.push(['match_sets', m.eventType, m.new.match_id]))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.00000000-0000-0000-0000-000000000000` }, (m) => got.push(['WRONG']))
    .subscribe((s) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') resolve(s); });
});
console.log('subscribe status:', status);
sql(`update matches set court='Realtime check' where id='${matchId}'`);
sql(`update match_sets set target_points=target_points where match_id='${matchId}' and set_number=1`);
await new Promise((r) => setTimeout(r, 1500));
console.log(JSON.stringify(got));
sql(`update matches set court='1' where id='${matchId}'`);
process.exit(0);
