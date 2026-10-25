import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../supabase/migrations/20260928000033_remove_tournament_stage.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/app/(organizer)/organizer/tournaments/[id]/settings/RulesAndStages.tsx', import.meta.url), 'utf8');

test('stage removal is organizer-only, transactional, locked, and audited', () => {
  assert.match(sql, /FUNCTION public\.remove_tournament_stage/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /is_tournament_organizer\(v_stage\.tournament_id\)/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /p_expected_snapshot <> v_plan->>'snapshot'/);
  assert.match(sql, /TOURNAMENT_STAGE_REMOVED/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.remove_tournament_stage\(uuid,text,text\) FROM PUBLIC, anon/);
});

test('started matches, score history, progression and cross-stage routes block removal', () => {
  for (const marker of ['LIVE_MATCHES', 'COMPLETED_MATCHES', 'SCORE_HISTORY', 'PROGRESSION_DEPENDENCY', 'BRACKET_DEPENDENCY']) assert.match(sql, new RegExp(marker));
  assert.match(sql, /status <> 'PENDING'/);
  assert.match(sql, /source_stage_id = p_stage_id OR target_stage_id = p_stage_id/);
});

test('only generated stage-owned data is removed', () => {
  for (const table of ['matches', 'tournament_stages']) assert.match(sql, new RegExp(`DELETE FROM public\\.${table}`));
  for (const protectedTable of ['teams', 'team_owners', 'player_tournament_registrations', 'team_players', 'auction_sales', 'tournament_branding']) assert.doesNotMatch(sql, new RegExp(`DELETE FROM public\\.${protectedTable}`));
  assert.match(sql, /WHERE stage_id=p_stage_id/);
  assert.match(sql, /volleyball_rule_overrides/);
  assert.match(sql, /ordering_scopes/);
});

test('settings shows the authoritative removal plan and refreshes after success', () => {
  assert.match(ui, /rpc\('preview_tournament_stage_removal'/);
  assert.match(ui, /rpc\('remove_tournament_stage'/);
  // The shared Modal renders a native <dialog> (focus trap, Escape, inert background).
  assert.match(ui, /<Modal\b/);
  assert.match(ui, /dismissible=\{!removing\}/);
  assert.match(ui, /Object\.entries\(removal\.remove\)/);
  assert.match(ui, /confirmation !== removal\.confirmation_phrase/);
  assert.match(ui, /router\.refresh\(\)/);
});

