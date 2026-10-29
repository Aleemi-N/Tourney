import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../db/migrations/20260923000024_phase5b_hidden_card_lot.sql', import.meta.url), 'utf8');
test('multi-round and active invariants exist', () => {
  assert.match(sql, /round_number integer NOT NULL/);
  assert.match(sql, /lot_turns_one_active_per_session/);
  assert.match(sql, /lot_sessions_one_operational_per_type/);
});
test('preparation is method, eligibility, team, and capacity authoritative', () => {
  for (const value of ['prepare_lot_session','LOT_DRAW','APPROVED','auction_players','team_players','enough squad capacity']) assert.match(sql, new RegExp(value));
});
test('shuffle is server-randomized and immutable', () => {
  assert.match(sql, /ORDER BY gen_random_uuid\(\)/);
  assert.doesNotMatch(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.shuffle_lot_session')), /DELETE FROM public\.lot_entries/);
  assert.match(sql, /lot_mapping_immutable_guard/);
});
test('selection is organizer-only, expected-turn protected, and idempotent', () => {
  assert.match(sql, /p_expected_turn_id uuid,p_request_key text/);
  assert.match(sql, /Expected turn is stale/);
  assert.match(sql, /selection_request_key=p_request_key/);
  assert.doesNotMatch(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.select_lot')), /is_team_owner/);
});
test('raw mapping and direct writes are hardened', () => {
  assert.match(sql, /DROP POLICY IF EXISTS "Organizers can read lot entries"/);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.lot_sessions, public\.lot_entries, public\.lot_turns/);
});
test('snapshots expose players only after selection', () => {
  assert.match(sql, /get_lot_organizer_state/);
  assert.match(sql, /get_lot_public_state/);
  assert.match(sql, /CASE WHEN e\.status='SELECTED'/g);
});
test('realtime publishes only sanitized events', () => {
  assert.match(sql, /ALTER PUBLICATION supabase_realtime DROP TABLE public\.lot_entries/);
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.lot_public_events/);
});
test('all privileged functions use fixed search paths and restricted grants', () => {
  assert.match(sql, /SET search_path = pg_catalog, public/g);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.select_lot/);
});
