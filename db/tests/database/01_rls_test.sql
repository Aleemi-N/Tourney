BEGIN;

SELECT plan(10);

-- 1. Create Mock Users
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'), -- Organizer
  ('00000000-0000-0000-0000-000000000002'), -- Owner 1
  ('00000000-0000-0000-0000-000000000003'), -- Owner 2
  ('00000000-0000-0000-0000-000000000004'), -- Player
  ('00000000-0000-0000-0000-000000000005'), -- Scorer
  ('00000000-0000-0000-0000-000000000006'); -- Player 2

INSERT INTO public.profiles (id, full_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Organizer'),
  ('00000000-0000-0000-0000-000000000002', 'Owner 1'),
  ('00000000-0000-0000-0000-000000000003', 'Owner 2'),
  ('00000000-0000-0000-0000-000000000004', 'Player'),
  ('00000000-0000-0000-0000-000000000005', 'Scorer'),
  ('00000000-0000-0000-0000-000000000006', 'Player 2');

-- 2. Mock Tournament Structure
INSERT INTO public.organizations (id, name, slug, created_by) 
VALUES ('11111111-1111-1111-1111-111111111111', 'Org', 'org', '00000000-0000-0000-0000-000000000001');

INSERT INTO public.tournaments (id, organization_id, name, slug, format, is_public, created_by)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Tourney', 't', 'KNOCKOUT', true, '00000000-0000-0000-0000-000000000001');

INSERT INTO public.tournament_members (tournament_id, user_id, role)
VALUES ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'ORGANIZER');

INSERT INTO public.teams (id, tournament_id, name)
VALUES 
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Team 1'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Team 2');

INSERT INTO public.team_owners (team_id, user_id, is_primary)
VALUES 
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000002', true),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000003', true);

INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id)
VALUES 
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000002', 'TEAM_OWNER', '33333333-3333-3333-3333-333333333333'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000003', 'TEAM_OWNER', '44444444-4444-4444-4444-444444444444');

INSERT INTO public.player_profiles (id, user_id, display_name, primary_position)
VALUES 
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000004', 'Player 1', 'SETTER'),
  ('55555555-5555-5555-5555-555555555556', '00000000-0000-0000-0000-000000000006', 'Player 2', 'OUTSIDE_HITTER');

INSERT INTO public.lot_sessions (id, tournament_id, lot_type, status, created_by)
VALUES ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'ICON', 'LIVE', '00000000-0000-0000-0000-000000000001');

INSERT INTO public.lot_entries (lot_session_id, lot_number, player_id, status)
VALUES 
  ('66666666-6666-6666-6666-666666666666', 1, '55555555-5555-5555-5555-555555555555', 'AVAILABLE'),
  ('66666666-6666-6666-6666-666666666666', 2, '55555555-5555-5555-5555-555555555556', 'SELECTED'); -- intentionally bad mapping for test sake

INSERT INTO public.matches (id, tournament_id, home_team_id, away_team_id)
VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');

INSERT INTO public.match_scorers (match_id, user_id, assigned_by)
VALUES ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001');

-- Test 1: Anonymous Access (No auth claim)
SELECT set_config('role', 'anon', true);

SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.public_tournament_view',
  ARRAY[1],
  'Anonymous/Public can see public tournament view'
);

SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.public_revealed_lot_state',
  ARRAY[2],
  'Anonymous/Public can see lot grid via view (player mapping hidden)'
);

-- lot_entries has RLS, so anon should see 0
SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.lot_entries',
  ARRAY[0],
  'Anonymous/Public CANNOT read raw unrevealed lot leakage'
);

-- Test 2: Organizer Access
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.lot_entries',
  ARRAY[2],
  'Organizer can read ALL raw lot entries'
);

-- Test 3: Team Owner Access
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);

SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.lot_entries',
  ARRAY[1], 
  'Owner 1 can ONLY read SELECTED lot entries in raw table'
);

-- Update own team
SELECT lives_ok(
  $$ UPDATE public.teams SET name = 'Updated' WHERE id = '33333333-3333-3333-3333-333333333333' $$,
  'Team Owner CAN update own team'
);

-- Update another team (silently updates 0 rows due to UPDATE policy filtering)
SELECT lives_ok(
  $$ UPDATE public.teams SET name = 'Updated' WHERE id = '44444444-4444-4444-4444-444444444444' $$,
  'Team Owner trying to update another team does not error but updates 0 rows'
);

-- Verify the other team was NOT updated
SELECT set_config('role', 'postgres', true);
SELECT results_eq(
  'SELECT name FROM public.teams WHERE id = ''44444444-4444-4444-4444-444444444444''',
  ARRAY['Team 2'],
  'Team Owner CANNOT update another team (RLS prevents mutation)'
);
SELECT set_config('role', 'authenticated', true);

-- Test 4: Player Access
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004"}', true);
SELECT lives_ok(
  $$ UPDATE public.player_profiles SET display_name = 'Changed' WHERE id = '55555555-5555-5555-5555-555555555555' $$,
  'Player CAN update own profile'
);

-- Test 5: Scorer Access
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005"}', true);
SELECT results_eq(
  'SELECT COUNT(*)::int FROM public.matches',
  ARRAY[1], 
  'Scorer can see matches'
);

-- Reset config
SELECT set_config('role', 'postgres', true);

-- Rollback implicitly handled by pgTAP
SELECT * FROM finish();
ROLLBACK;
