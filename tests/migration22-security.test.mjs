import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../db/migrations/20260922000022_player_registration_decision_correction.sql', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../src/app/(organizer)/organizer/tournaments/[id]/participants/ParticipantManager.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/app/actions/participants.ts', import.meta.url), 'utf8');

test('correction RPCs enforce exact transitions with row locks', () => {
  assert.match(migration, /FOR UPDATE OF r/);
  assert.match(migration, /v_status <> 'APPROVED'/);
  assert.match(migration, /v_status <> 'REJECTED'/);
  assert.match(migration, /SET status = 'PENDING'/);
  assert.doesNotMatch(migration, /p_status/);
});

test('correction RPCs are tournament-authorized and authenticated-only', () => {
  assert.match(migration, /v_actor IS NULL OR NOT public\.is_tournament_organizer\(v_tournament_id\)/);
  for (const signature of ['revoke_player_approval(uuid, text)', 'reopen_player_registration(uuid, text)']) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM anon`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO authenticated`));
  }
});

test('revocation checks every existing downstream player relationship', () => {
  for (const relation of ['team_players', 'lot_entries', 'lot_sessions', 'auction_players', 'auctions', 'auction_sales', 'purse_transactions']) {
    assert.match(migration, new RegExp(`public\\.${relation}`));
  }
  assert.match(migration, /DOWNSTREAM_ASSIGNMENTS/);
});

test('corrections preserve classification and append structured audits', () => {
  assert.doesNotMatch(migration, /auction_category\s*=/);
  assert.match(migration, /PLAYER_APPROVAL_REVOKED/);
  assert.match(migration, /PLAYER_APPLICATION_REOPENED/);
  assert.match(migration, /before_json, after_json, reason/);
  assert.match(migration, /'player_id', v_player_id/);
});

test('UI uses Tourny confirmation dialogs and sanitized server results', () => {
  assert.match(manager, /role="alertdialog"/);
  assert.match(manager, /Revoke Approval/);
  assert.match(manager, /Reopen Application/);
  assert.match(manager, /router\.refresh\(\)/);
  assert.doesNotMatch(manager, /alert\(/);
  assert.doesNotMatch(manager, /confirm\(/);
  assert.match(actions, /DOWNSTREAM_ASSIGNMENTS/);
  assert.doesNotMatch(actions, /return \{ error: error\.message \}/);
});

test('team owner reversal is not introduced', () => {
  assert.doesNotMatch(migration, /team_owner_applications/);
  assert.doesNotMatch(migration, /reopen_team_owner|revoke_team_owner/);
});
