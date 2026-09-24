import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.M24_DATABASE_URL;
if (!connectionString) throw new Error('M24_DATABASE_URL is required');
const admin = new pg.Client({ connectionString });
await admin.connect();
await admin.query(`
  INSERT INTO auth.users(id,email) VALUES ('25000000-0000-0000-0000-000000000001','concurrency@example.test');
  INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('25100000-0000-0000-0000-000000000001','Concurrency','m24-concurrency','25000000-0000-0000-0000-000000000001');
  INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,created_by) VALUES ('25200000-0000-0000-0000-000000000001','25100000-0000-0000-0000-000000000001','Concurrency','m24-concurrency','LEAGUE','AUCTION','25000000-0000-0000-0000-000000000001');
  INSERT INTO public.tournament_members(tournament_id,user_id,role) VALUES ('25200000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','ORGANIZER');
  INSERT INTO public.tournament_settings(tournament_id,max_squad_size,icon_selection_method,setter_selection_method) VALUES ('25200000-0000-0000-0000-000000000001',4,'LOT_DRAW','LOT_DRAW');
  INSERT INTO public.teams(id,tournament_id,name) VALUES ('25300000-0000-0000-0000-000000000001','25200000-0000-0000-0000-000000000001','Only Team');
  INSERT INTO public.player_profiles(id,display_name,primary_position) VALUES
   ('25400000-0000-0000-0000-000000000001','One','SETTER'),('25400000-0000-0000-0000-000000000002','Two','SETTER'),
   ('25400000-0000-0000-0000-000000000003','Three','SETTER'),('25400000-0000-0000-0000-000000000004','Four','SETTER');
  INSERT INTO public.player_tournament_registrations(tournament_id,player_id,status,auction_category) VALUES
   ('25200000-0000-0000-0000-000000000001','25400000-0000-0000-0000-000000000001','APPROVED','ICON_LOT'),
   ('25200000-0000-0000-0000-000000000001','25400000-0000-0000-0000-000000000002','APPROVED','ICON_LOT'),
   ('25200000-0000-0000-0000-000000000001','25400000-0000-0000-0000-000000000003','APPROVED','SETTER_LOT'),
   ('25200000-0000-0000-0000-000000000001','25400000-0000-0000-0000-000000000004','APPROVED','SETTER_LOT');
`);

async function organizerClient() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query(`SET ROLE authenticated`);
  await client.query(`SELECT set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000001',false)`);
  return client;
}
const setup = await organizerClient();
const prepared = await setup.query(`SELECT public.prepare_lot_session($1,'ICON',$2::uuid[]) id`, ['25200000-0000-0000-0000-000000000001',['25300000-0000-0000-0000-000000000001']]);
const session = prepared.rows[0].id;
await setup.query(`SELECT public.shuffle_lot_session($1)`, [session]);
await setup.query(`SELECT public.start_lot_session($1)`, [session]);
let state = await setup.query(`SELECT public.get_lot_organizer_state($1) state`, [session]);
let turn = state.rows[0].state.turns.find((value) => value.status === 'ACTIVE').id;
const cards = state.rows[0].state.cards.map((value) => value.lot_number);

const a = await organizerClient();
const b = await organizerClient();
const first = await Promise.allSettled([
  a.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [session,cards[0],turn,'race-a']),
  b.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [session,cards[1],turn,'race-b']),
]);
assert.equal(first.filter((value) => value.status === 'fulfilled').length, 1);
let counts = await admin.query(`SELECT (SELECT count(*) FROM public.team_players WHERE tournament_id=$1) assignments,(SELECT count(*) FROM public.lot_turns WHERE lot_session_id=$2 AND status='ACTIVE') active`, ['25200000-0000-0000-0000-000000000001',session]);
assert.deepEqual(counts.rows[0], { assignments: '1', active: '1' });

state = await setup.query(`SELECT public.get_lot_organizer_state($1) state`, [session]);
turn = state.rows[0].state.turns.find((value) => value.status === 'ACTIVE').id;
const remaining = state.rows[0].state.cards.find((value) => value.status === 'AVAILABLE').lot_number;
await assert.rejects(
  a.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [session,remaining,state.rows[0].state.turns[0].id,'stale-after-advance']),
  /Expected turn is stale/,
);
const duplicate = await Promise.all([
  a.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [session,remaining,turn,'same-request']),
  b.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [session,remaining,turn,'same-request']),
]);
assert.equal(duplicate.filter((value) => value.rows[0].result.idempotent === true).length, 1);
counts = await admin.query(`SELECT (SELECT count(*) FROM public.team_players WHERE tournament_id=$1) assignments,(SELECT count(*) FROM public.lot_turns WHERE lot_session_id=$2 AND status='ACTIVE') active,(SELECT status FROM public.lot_sessions WHERE id=$2) status`, ['25200000-0000-0000-0000-000000000001',session]);
assert.deepEqual(counts.rows[0], { assignments: '2', active: '0', status: 'COMPLETED' });

const setterPrepared = await setup.query(`SELECT public.prepare_lot_session($1,'SETTER',$2::uuid[]) id`, ['25200000-0000-0000-0000-000000000001',['25300000-0000-0000-0000-000000000001']]);
const setterSession = setterPrepared.rows[0].id;
await setup.query(`SELECT public.shuffle_lot_session($1)`, [setterSession]);
await setup.query(`SELECT public.start_lot_session($1)`, [setterSession]);
state = await setup.query(`SELECT public.get_lot_organizer_state($1) state`, [setterSession]);
turn = state.rows[0].state.turns.find((value) => value.status === 'ACTIVE').id;
const sameCard = state.rows[0].state.cards[0].lot_number;
const sameCardRace = await Promise.allSettled([
  a.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [setterSession,sameCard,turn,'same-card-a']),
  b.query(`SELECT public.select_lot($1,$2,$3,$4) result`, [setterSession,sameCard,turn,'same-card-b']),
]);
assert.equal(sameCardRace.filter((value) => value.status === 'fulfilled').length, 1);
counts = await admin.query(`SELECT
  (SELECT count(*) FROM public.team_players WHERE tournament_id=$1) assignments,
  (SELECT count(DISTINCT player_id) FROM public.team_players WHERE tournament_id=$1) distinct_players,
  (SELECT count(*) FROM public.lot_turns WHERE lot_session_id=$2 AND status='ACTIVE') active,
  (SELECT count(*) FROM public.lot_entries WHERE lot_session_id=$2 AND status='SELECTED') selected`,
  ['25200000-0000-0000-0000-000000000001',setterSession]);
assert.deepEqual(counts.rows[0], { assignments: '3', distinct_players: '3', active: '1', selected: '1' });

await Promise.all([a.end(),b.end(),setup.end(),admin.end()]);
console.log('Migration 24 concurrency: PASS');
