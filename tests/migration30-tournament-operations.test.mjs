import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../db/migrations/20260925000030_tournament_operations.sql', import.meta.url), 'utf8');
const fixtureUi = readFileSync(new URL('../src/components/organizer/FixtureManager.tsx', import.meta.url), 'utf8');
const teamUi = readFileSync(new URL('../src/components/organizer/TeamRenameForm.tsx', import.meta.url), 'utf8');

test('primary and delegated organizer access remains tournament scoped', () => {
  assert.match(migration, /t\.id = tourn_id/);
  assert.match(migration, /t\.created_by = auth\.uid\(\)/);
  assert.match(migration, /tm\.role = 'ORGANIZER'/);
  assert.match(migration, /tm\.status = 'ACTIVE'/);
});

test('team rename updates the existing id and appends old/new audit values', () => {
  assert.match(migration, /UPDATE public\.teams SET name = v_name[\s\S]*WHERE id = v_team\.id/);
  assert.match(migration, /'TEAM_RENAMED'/);
  assert.match(migration, /jsonb_build_object\('name', v_team\.name\)/);
  assert.match(migration, /jsonb_build_object\('name', v_name\)/);
  assert.match(migration, /REVOKE UPDATE ON public\.teams FROM authenticated/);
  assert.match(teamUi, /rename_tournament_team/);
  assert.doesNotMatch(teamUi, /\.from\(['"]teams['"]\)\.insert/);
});

test('fixture operations use trusted organizer-authorized RPCs', () => {
  for (const rpc of ['generate_stage_fixtures', 'update_match_schedule', 'save_standings_rules']) {
    assert.match(migration, new RegExp(`FUNCTION public\\.${rpc}`));
    assert.match(fixtureUi, new RegExp(rpc));
  }
  assert.match(migration, /DROP POLICY IF EXISTS "Organizers can manage matches"/);
  assert.match(migration, /REVOKE INSERT,UPDATE,DELETE ON public\.matches/);
  assert.doesNotMatch(fixtureUi, /\.from\(['"]matches['"]\)\.(insert|update|delete)/);
});

test('knockout winners, league standings, and lifecycle completion progress server-side', () => {
  assert.match(migration, /next_match_slot='HOME'/);
  assert.match(migration, /CREATE TRIGGER progress_completed_match_after_result/);
  assert.match(migration, /stage_type='LEAGUE'/);
  assert.match(migration, /UPDATE public\.tournaments SET status='COMPLETED'/);
  assert.match(migration, /SET_RATIO/);
  assert.match(migration, /POINT_RATIO/);
});
