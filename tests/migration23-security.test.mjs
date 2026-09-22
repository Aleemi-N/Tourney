import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260922000023_phase5a_tournament_configuration.sql', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/app/(organizer)/organizer/tournaments/[id]/settings/SettingsForm.tsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../src/app/(organizer)/organizer/tournaments/[id]/settings/RulesAndStages.tsx', import.meta.url), 'utf8');

test('all special allocation and re-auction choices are constrained', () => {
  for (const value of ['icon_selection_method', 'setter_selection_method', 'reauction_price_rule', 'LOT_DRAW', 'AUCTION', 'SAME_BASE_PRICE', 'ORGANIZER_SETS_PRICE']) assert.match(migration, new RegExp(value));
  assert.match(migration, /SET DEFAULT 'LOT_DRAW'/);
  assert.match(migration, /SET DEFAULT 'SAME_BASE_PRICE'/);
});

test('locks are derived from lot, assignment, and auction evidence', () => {
  for (const value of ['SHUFFLED', 'LIVE', 'COMPLETED', 'team_players', 'auction_players', 'auction_bids', 'auction_sales']) assert.match(migration, new RegExp(value));
  assert.doesNotMatch(migration, /ADD COLUMN (icon|setter).*locked/i);
  assert.match(migration, /status IN \('SHUFFLED', 'LIVE', 'COMPLETED'\)/);
});

test('trusted mutations are organizer-authorized and direct writes revoked', () => {
  assert.match(migration, /NOT public\.is_tournament_organizer\(p_tournament_id\)/);
  for (const table of ['tournament_settings', 'tournament_stages', 'volleyball_rules', 'volleyball_set_rules']) assert.match(migration, new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table}`));
  assert.match(migration, /SET search_path = pg_catalog, public/g);
});

test('readiness is structured and independent from scoring configuration', () => {
  for (const value of ['READY', 'BLOCKED', 'NOT_APPLICABLE', 'ICON_LOT', 'SETTER_LOT', 'AUCTION']) assert.match(migration, new RegExp(value));
  const readinessBody = migration.slice(migration.indexOf('get_tournament_phase5a_configuration'));
  assert.doesNotMatch(readinessBody, /target_points|sets_to_win/);
});

test('roster and squad validation use team_players', () => {
  assert.match(migration, /FROM public\.team_players[\s\S]*status = 'ACTIVE'/);
  assert.match(migration, /p_max_squad_size < v_largest_roster/);
  assert.doesNotMatch(migration, /role = 'PLAYER'/);
});

test('future player-specific prices cannot undercut the tournament floor', () => {
  assert.match(migration, /auction_player_price_floor_guard/);
  assert.match(migration, /NEW\.base_price < v_floor/);
  assert.match(migration, /base price below the tournament floor/);
});

test('volleyball and stage integrity are enforced', () => {
  assert.match(migration, /volleyball_rules_one_default_per_tournament/);
  assert.match(migration, /volleyball_rules_one_per_stage/);
  assert.match(migration, /Stage must belong to the same tournament/);
  assert.match(migration, /matches reference it/);
  assert.match(migration, /stage match is live or completed/);
});

test('settings UI exposes approved phase 5A controls and presets', () => {
  for (const label of ['Special Player Allocation', 'Minimum Squad Size', 'Maximum Squad Size', 'Re-auction Price Rule', 'Readiness']) assert.match(settings, new RegExp(label));
  for (const label of ['Best of 3', 'Best of 5', 'Custom', 'Stages', 'Win by 2']) assert.match(rules, new RegExp(label));
});
