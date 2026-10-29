import assert from 'node:assert/strict';
import pg from 'pg';

// Two approvals racing for the last place must not both succeed. The first transaction commits while the second is
// waiting on it; the second must then count the first and refuse. The test restores what it changed.
const url = process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5440/tourny';
const T1 = '90200000-0000-0000-0000-000000000001';
let pendingIds = [];
const a = new pg.Client({ connectionString: url });
const b = new pg.Client({ connectionString: url });
await Promise.all([a.connect(), b.connect()]);

const asOrganizer = async (client, id) => {
  await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
  await client.query('SET LOCAL ROLE authenticated');
};

try {
  const setup = new pg.Client({ connectionString: url });
  await setup.connect();
  const org = (await setup.query("SELECT m.user_id FROM public.tournament_members m WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0].user_id;
  const pending = (await setup.query("SELECT id FROM public.player_tournament_registrations WHERE tournament_id=$1 AND status='PENDING' ORDER BY created_at LIMIT 2", [T1])).rows;
  const approved = Number((await setup.query("SELECT count(*) n FROM public.player_tournament_registrations WHERE tournament_id=$1 AND status='APPROVED'", [T1])).rows[0].n);
  await setup.end();
  assert.equal(pending.length, 2);
  pendingIds = pending.map((r) => r.id);

  // One free place. Both sessions run inside their own transaction; the limit is set inside the first one.
  const limit = new pg.Client({ connectionString: url });
  await limit.connect();
  await limit.query('UPDATE public.tournament_settings SET max_players=$2 WHERE tournament_id=$1', [T1, approved + 1]);
  await limit.end();
  await a.query('BEGIN');
  await asOrganizer(a, org);
  await a.query("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [pending[0].id]); // takes the settings lock, sees a free place
  const heldByA = (await a.query("SELECT status FROM public.player_tournament_registrations WHERE id=$1", [pending[0].id])).rows[0].status;
  assert.equal(heldByA, 'APPROVED');

  await b.query('BEGIN');
  await asOrganizer(b, org);
  let settled = false;
  const second = b.query("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [pending[1].id]).then(() => ({ ok: true }), (e) => ({ ok: false, message: e.message })).finally(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(settled, false, 'the second approval waits for the first instead of racing it');

  await a.query('COMMIT'); // the first approval is now real; the second must see it
  const result = await second;
  assert.equal(result.ok, false, 'the second approval must not also take the last place');
  assert.match(result.message, /tournament is full/);
  await b.query('ROLLBACK');
  console.log('Registration limit lock: PASS (two approvals for the last place are serialized, the second is refused)');
} finally {
  // End both sessions' transactions first (an open one would block the cleanup), then put back what the first approval committed.
  await a.query('ROLLBACK').catch(() => {});
  await b.query('ROLLBACK').catch(() => {});
  const restore = new pg.Client({ connectionString: url });
  await restore.connect();
  await restore.query("UPDATE public.player_tournament_registrations SET status='PENDING', reviewed_by=NULL, reviewed_at=NULL, review_notes=NULL, auction_category=NULL, auction_price_category_id=NULL WHERE tournament_id=$1 AND status='APPROVED' AND id = ANY ($2)", [T1, pendingIds]);
  await restore.query('UPDATE public.tournament_settings SET max_players=NULL WHERE tournament_id=$1', [T1]);
  await restore.end();
  await Promise.all([a.end(), b.end()]);
}
