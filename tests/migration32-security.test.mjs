import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../db/migrations/20260927000032_tournament_progression_and_ordering.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/organizer/FixtureManager.tsx', import.meta.url), 'utf8');
const publicFixtures = readFileSync(new URL('../src/app/(public)/t/[slug]/fixtures/page.tsx', import.meta.url), 'utf8');

test('program order is positive, non-null, deterministic, and scope-unique', () => {
  assert.match(sql, /row_number\(\) OVER[\s\S]*match_number NULLS LAST[\s\S]*created_at, id/);
  assert.match(sql, /ALTER COLUMN program_order SET NOT NULL/);
  assert.match(sql, /matches_program_order_positive CHECK \(program_order > 0\)/);
  assert.match(sql, /matches_program_order_scope_unique[\s\S]*NULLS NOT DISTINCT/);
});

test('reorder is organizer-scoped, locked, revisioned, and permutation-safe', () => {
  assert.match(sql, /FUNCTION public\.reorder_matches/);
  assert.match(sql, /is_tournament_organizer\(p_tournament_id\)/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /Stale match order revision/);
  assert.match(sql, /complete duplicate-free permutation/);
  assert.match(sql, /program_order=program_order\+v_offset/);
  assert.match(sql, /LIVE and COMPLETED matches cannot be moved/);
  assert.match(sql, /MATCH_ORDER_REORDERED/);
});

test('progression plans and seeds are persisted behind RLS', () => {
  assert.match(sql, /CREATE TABLE public\.tournament_progression_plans/);
  assert.match(sql, /UNIQUE\(source_stage_id\)/);
  assert.match(sql, /UNIQUE\(tournament_id,idempotency_key\)/);
  assert.match(sql, /CREATE TABLE public\.progression_plan_seeds/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /REVOKE INSERT,UPDATE,DELETE ON public\.tournament_progression_plans,public\.progression_plan_seeds FROM authenticated/);
});

test('preview is read-only and confirmation supports every approved decision', () => {
  assert.match(sql, /FUNCTION public\.preview_league_progression/);
  const previewBody = sql.slice(sql.indexOf('FUNCTION public.preview_league_progression'), sql.indexOf('FUNCTION public.apply_league_progression'));
  assert.doesNotMatch(previewBody, /INSERT INTO|UPDATE public|DELETE FROM/);
  for (const decision of ['FINISH_AFTER_LEAGUE','TOP_2_FINAL','TOP_4_SEMIFINALS']) assert.match(sql, new RegExp(decision));
  assert.match(sql, /League has no matches/);
  assert.match(sql, /League is not complete/);
  assert.match(sql, /s\.team_id ASC/);
  assert.match(sql, /LEAGUE_PROGRESSION_CONFIRMED/);
});

test('winner and loser routing stays paired and initializes destination sets', () => {
  assert.match(sql, /loser_next_match_id uuid REFERENCES public\.matches/);
  assert.match(sql, /loser_next_match_slot text/);
  assert.match(sql, /matches_loser_route_paired/);
  assert.match(sql, /Third-place home slot is already occupied/);
  assert.match(sql, /initialize_match_sets\(v_loser_next\.id\)/);
});

test('league completion waits for a persisted organizer decision', () => {
  assert.match(sql, /Without a persisted decision the tournament deliberately remains open/);
  assert.match(sql, /v_plan\.decision='FINISH_AFTER_LEAGUE'/);
});

test('public fixture projection adds structure without routing or scorer leakage', () => {
  const view = sql.slice(sql.indexOf('CREATE VIEW public.public_fixture_view'));
  for (const field of ['m.round_number','m.bracket_position','m.program_order','m.bracket_match_type']) assert.match(view, new RegExp(field.replace('.', '\\.')));
  assert.doesNotMatch(view, /m\.next_match_id|loser_next_match|match_scorers|scorer_user_id/);
  assert.match(view, /security_invoker = true/);
  assert.match(sql, /DROP POLICY IF EXISTS "Public can read score events"/);
});

test('organizer UI uses authoritative RPCs, revision and mobile controls', () => {
  assert.match(ui, /rpc\('reorder_matches'/);
  assert.match(ui, /p_expected_revision: scope\.revision/);
  assert.match(ui, /ArrowUp/); assert.match(ui, /ArrowDown/);
  assert.match(ui, /rpc\('preview_league_progression'/);
  assert.match(ui, /rpc\('apply_league_progression'/);
  assert.match(ui, /crypto\.randomUUID\(\)/);
});

test('public fixtures use only the safe projection and authoritative order', () => {
  assert.match(publicFixtures, /from\('public_fixture_view'\)/);
  assert.doesNotMatch(publicFixtures, /from\('matches'\)/);
  assert.match(publicFixtures, /order\('program_order'/);
  assert.match(publicFixtures, /round_number/);
});
