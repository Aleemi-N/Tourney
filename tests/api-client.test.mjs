import assert from 'node:assert/strict';
import test from 'node:test';
import { Api } from '../src/lib/api/core.ts';

// The client every app uses to reach the API, against a fake server: what it sends, how it reads answers, and how it
// keeps the session. No network, no database.
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (sub, extra = {}) => `${b64({ alg: 'HS256' })}.${b64({ sub, email: `${sub}@tourny.local`, user_metadata: { full_name: 'Test Person' }, ...extra })}.sig`;
const now = () => Math.floor(Date.now() / 1000);

function setup(respond, session = null) {
  const calls = [];
  const kept = { session };
  const fetch = async (url, init = {}) => {
    const call = { url: new URL(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return respond(call);
  };
  const api = new Api('http://api.test/', { fetch, store: { get: () => kept.session, set: (s) => { kept.session = s; } } });
  return { api, calls, kept };
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const signedIn = () => ({ access_token: token('u1'), refresh_token: 'r1', expires_at: now() + 3600 });

test('reads: columns, filters, order and limit become the query string; the bearer token is sent when signed in', async () => {
  const { api, calls } = setup(() => json([{ id: 1 }]), signedIn());
  const { data, error } = await api.from('matches').select('id, name').eq('tournament_id', 't1').in('status', ['LIVE', 'on hold']).order('starts_at', { ascending: false }).limit(5);
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: 1 }]);
  const q = calls[0].url.searchParams;
  assert.equal(calls[0].url.pathname, '/rest/matches');
  assert.equal(q.get('select'), 'id,name');
  assert.equal(q.get('tournament_id'), 'eq.t1');
  assert.equal(q.get('status'), 'in.(LIVE,"on hold")');
  assert.equal(q.get('order'), 'starts_at.desc');
  assert.equal(q.get('limit'), '5');
  assert.match(calls[0].headers.Authorization, /^Bearer /);
});

test('signed out: no Authorization header', async () => {
  const { api, calls } = setup(() => json([]));
  await api.from('tournaments').select('*');
  assert.equal(calls[0].headers.Authorization, undefined);
});

test('counting without rows: HEAD with Prefer count, the total comes from Content-Range', async () => {
  const { api, calls } = setup(() => new Response(null, { status: 200, headers: { 'content-range': '0-0/42' } }));
  const { count, data, error } = await api.from('players').select('*', { count: 'exact', head: true });
  assert.equal(error, null);
  assert.equal(data, null);
  assert.equal(count, 42);
  assert.equal(calls[0].method, 'HEAD');
  assert.match(calls[0].headers.Prefer, /count=exact/);
});

test('writes: minimal by default, rows back after select(), bulk inserts list every column, upsert merges', async () => {
  const { api, calls } = setup((call) => (call.headers.Prefer.includes('representation') ? json([{ id: 7 }], 201) : new Response(null, { status: 201 })));
  assert.deepEqual(await api.from('teams').insert({ name: 'A' }), { data: null, error: null, count: null, status: 201 });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Prefer, 'return=minimal');
  const back = await api.from('teams').insert([{ name: 'A' }, { name: 'B', place: 'X' }]).select('id');
  assert.deepEqual(back.data, [{ id: 7 }]);
  assert.equal(calls[1].url.searchParams.get('columns'), '"name","place"');
  assert.match(calls[1].headers.Prefer, /return=representation/);
  await api.from('teams').upsert({ id: 1, name: 'C' }, { onConflict: 'id' });
  assert.match(calls[2].headers.Prefer, /resolution=merge-duplicates/);
  assert.equal(calls[2].url.searchParams.get('on_conflict'), 'id');
  await api.from('teams').update({ name: 'D' }).eq('id', 1);
  assert.equal(calls[3].method, 'PATCH');
  assert.deepEqual(calls[3].body, { name: 'D' });
  await api.from('teams').delete().eq('id', 1);
  assert.equal(calls[4].method, 'DELETE');
});

test('single() and maybeSingle()', async () => {
  const one = setup((call) => (call.headers.Accept ? json({ code: 'PGRST116', message: 'no rows' }, 406) : json([])));
  const single = await one.api.from('t').select('*').eq('id', 'x').single();
  assert.equal(single.error.code, 'PGRST116');
  assert.equal(single.data, null);
  const maybe = await one.api.from('t').select('*').eq('id', 'x').maybeSingle();
  assert.deepEqual(maybe, { data: null, error: null, count: null, status: 200 });
  const many = setup(() => json([{ id: 1 }, { id: 2 }]));
  assert.equal((await many.api.from('t').select('*').maybeSingle()).error.code, 'PGRST116');
});

test('functions: arguments are posted; the error keeps message and code', async () => {
  const { api, calls } = setup((call) => (call.body.p_id === 'bad' ? json({ message: 'Unauthorized', code: 'P0001' }, 400) : json([{ n: 1 }])));
  assert.deepEqual((await api.rpc('get_thing', { p_id: 'ok' })).data, [{ n: 1 }]);
  assert.equal(calls[0].url.pathname, '/rpc/get_thing');
  assert.deepEqual(calls[0].body, { p_id: 'ok' });
  const failed = await api.rpc('get_thing', { p_id: 'bad' });
  assert.equal(failed.data, null);
  assert.deepEqual([failed.error.message, failed.error.code, failed.error.status], ['Unauthorized', 'P0001', 400]);
  assert.deepEqual((await api.rpc('get_thing', { p_id: 'ok' }).single()).data, { n: 1 });
});

test('a network failure comes back as an error, not an exception', async () => {
  const api = new Api('http://api.test', { fetch: async () => { throw new TypeError('fetch failed'); }, store: { get: () => null, set: () => {} } });
  const { data, error } = await api.from('t').select('*');
  assert.equal(data, null);
  assert.equal(error.message, 'fetch failed');
});

test('sign-in keeps the tokens (only the tokens) and describes the account from the access token', async () => {
  const access = token('u2');
  const { api, kept } = setup(() => json({ access_token: access, refresh_token: 'r2', expires_at: now() + 3600, user: { id: 'u2' } }));
  const { data, error } = await api.auth.signInWithPassword({ email: 'a@b.c', password: 'pw' });
  assert.equal(error, null);
  assert.deepEqual(Object.keys(kept.session).sort(), ['access_token', 'expires_at', 'refresh_token']);
  assert.equal(data.session.user.id, 'u2');
  assert.equal(data.session.user.email, 'u2@tourny.local');
  assert.equal(data.session.user.user_metadata.full_name, 'Test Person');
});

test('an expired access token is renewed once, however many requests wait for it', async () => {
  const fresh = token('u1', { n: 2 });
  const { api, calls, kept } = setup((call) => (call.url.pathname === '/auth/token' ? json({ access_token: fresh, refresh_token: 'r2', expires_at: now() + 3600 }) : json([])), { access_token: token('u1'), refresh_token: 'r1', expires_at: now() - 5 });
  await Promise.all([api.from('a').select('*'), api.from('b').select('*'), api.rpc('c')]);
  const renewals = calls.filter((c) => c.url.pathname === '/auth/token');
  assert.equal(renewals.length, 1);
  assert.equal(renewals[0].url.searchParams.get('grant_type'), 'refresh_token');
  assert.deepEqual(renewals[0].body, { refresh_token: 'r1' });
  assert.equal(kept.session.refresh_token, 'r2');
  assert.ok(calls.filter((c) => c.url.pathname !== '/auth/token').every((c) => c.headers.Authorization === `Bearer ${fresh}`));
});

test('a refused renewal ends the sign-in; a network failure keeps it for later', async () => {
  const expired = { access_token: token('u1'), refresh_token: 'r1', expires_at: now() - 5 };
  const refused = setup(() => json({ msg: 'Invalid Refresh Token' }, 400), expired);
  assert.equal((await refused.api.auth.getSession()).data.session, null);
  assert.equal(refused.kept.session, null);
  const offline = new Api('http://api.test', { fetch: async () => { throw new TypeError('offline'); }, store: { get: () => expired, set: () => assert.fail('must not touch the stored session') } });
  assert.equal((await offline.auth.getSession()).data.session, null);
});

test('a store that cannot be written (server render) does not break sign-in', async () => {
  const api = new Api('http://api.test', { fetch: async () => json({ access_token: token('u3'), refresh_token: 'r', expires_at: now() + 60 }), store: { get: () => null, set: () => { throw new Error('read-only'); } } });
  const { data, error } = await api.auth.signInWithPassword({ email: 'a@b.c', password: 'pw' });
  assert.equal(error, null);
  assert.equal(data.session.user.id, 'u3');
});

test('images: public URLs, raw-body upload with upsert, remove', async () => {
  const { api, calls } = setup((call) => (call.method === 'DELETE' ? json([{ name: 'a/b.png' }]) : json({ Key: 'x' })), signedIn());
  assert.equal(api.storage.from('avatars').getPublicUrl('u1/my photo.png').data.publicUrl, 'http://api.test/storage/object/public/avatars/u1/my%20photo.png');
  const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  assert.equal((await api.storage.from('avatars').upload('u1/a.png', png, { upsert: true })).error, null);
  assert.equal(calls[0].url.pathname, '/storage/object/avatars/u1/a.png');
  assert.equal(calls[0].headers['x-upsert'], 'true');
  assert.equal(calls[0].headers['Content-Type'], 'image/png');
  const removed = await api.storage.from('avatars').remove(['a/b.png']);
  assert.deepEqual(removed.data, [{ name: 'a/b.png' }]);
  assert.deepEqual(calls[1].body, { prefixes: ['a/b.png'] });
});
