-- Local-only QA data. Supabase loads this file after local migrations during db reset.
-- Never apply this file to a linked or production project.
BEGIN;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'organizer@tourny.local', extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Organizer"}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner@tourny.local', extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Team Owner"}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'player@tourny.local', extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Player"}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'scorer@tourny.local', extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Scorer"}', now(), now(), false, false)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  instance_id = EXCLUDED.instance_id,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
FROM auth.users u
WHERE u.email IN ('organizer@tourny.local', 'owner@tourny.local', 'player@tourny.local', 'scorer@tourny.local')
ON CONFLICT (provider_id, provider) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES ('90100000-0000-0000-0000-000000000001', 'Tourny Local QA', 'tourny-local-qa', '90000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('90100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'OWNER', 'ACTIVE')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

INSERT INTO public.tournaments (id, organization_id, name, slug, format, league_mode, sport, status, is_public, created_by, description, venue)
VALUES ('90200000-0000-0000-0000-000000000001', '90100000-0000-0000-0000-000000000001', 'Tourny Local QA Cup', 'tourny-local-qa-cup', 'LEAGUE', 'AUCTION', 'VOLLEYBALL', 'REGISTRATION', true, '90000000-0000-0000-0000-000000000001', 'Disposable local QA tournament.', 'Local QA Arena')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tournament_members (tournament_id, user_id, role, status)
VALUES
  ('90200000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'ORGANIZER', 'ACTIVE'),
  ('90200000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'TEAM_OWNER', 'ACTIVE'),
  ('90200000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 'PLAYER', 'ACTIVE'),
  ('90200000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', 'SCORER', 'ACTIVE')
ON CONFLICT (tournament_id, user_id, role) DO UPDATE SET status = EXCLUDED.status;

INSERT INTO public.tournament_settings (
  tournament_id, min_squad_size, max_squad_size, auction_starting_purse,
  auction_base_price, auction_bid_increment, icon_selection_method,
  setter_selection_method, reauction_price_rule
)
VALUES ('90200000-0000-0000-0000-000000000001', 3, 8, 5000, 100, 100, 'LOT_DRAW', 'LOT_DRAW', 'SAME_BASE_PRICE')
ON CONFLICT (tournament_id) DO NOTHING;

INSERT INTO public.teams (id, tournament_id, name, short_name, place, status)
VALUES
  ('90300000-0000-0000-0000-000000000001', '90200000-0000-0000-0000-000000000001', 'QA Falcons', 'FAL', 'Local Court A', 'ACTIVE'),
  ('90300000-0000-0000-0000-000000000002', '90200000-0000-0000-0000-000000000001', 'QA Spikers', 'SPI', 'Local Court B', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_owners (team_id, user_id, is_primary, status)
VALUES ('90300000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', true, 'ACTIVE')
ON CONFLICT (team_id, user_id) DO UPDATE SET is_primary = EXCLUDED.is_primary, status = EXCLUDED.status;

INSERT INTO public.player_profiles (id, user_id, display_name, primary_position, secondary_position, place)
VALUES ('90400000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 'QA Player', 'UNIVERSAL', 'SETTER', 'Local QA')
ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name;

INSERT INTO public.team_players (tournament_id, team_id, player_id, acquisition_type, status)
VALUES ('90200000-0000-0000-0000-000000000001', '90300000-0000-0000-0000-000000000001', '90400000-0000-0000-0000-000000000001', 'MANUAL', 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO public.tournament_stages (id, tournament_id, name, stage_type, sequence, status)
VALUES ('90500000-0000-0000-0000-000000000001', '90200000-0000-0000-0000-000000000001', 'QA League Stage', 'LEAGUE', 1, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.volleyball_rules (id, tournament_id, stage_id, sets_to_win, win_by_two)
VALUES ('90600000-0000-0000-0000-000000000001', '90200000-0000-0000-0000-000000000001', '90500000-0000-0000-0000-000000000001', 2, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.volleyball_set_rules (volleyball_rule_id, set_number, target_points)
VALUES
  ('90600000-0000-0000-0000-000000000001', 1, 25),
  ('90600000-0000-0000-0000-000000000001', 2, 25),
  ('90600000-0000-0000-0000-000000000001', 3, 15)
ON CONFLICT (volleyball_rule_id, set_number) DO UPDATE SET target_points = EXCLUDED.target_points;

INSERT INTO public.matches (id, tournament_id, stage_id, match_number, home_team_id, away_team_id, status, venue, court)
VALUES ('90700000-0000-0000-0000-000000000001', '90200000-0000-0000-0000-000000000001', '90500000-0000-0000-0000-000000000001', 1, '90300000-0000-0000-0000-000000000001', '90300000-0000-0000-0000-000000000002', 'SCHEDULED', 'Local QA Arena', 'Court 1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.match_sets (match_id, set_number, target_points, status)
VALUES
  ('90700000-0000-0000-0000-000000000001', 1, 25, 'PENDING'),
  ('90700000-0000-0000-0000-000000000001', 2, 25, 'PENDING'),
  ('90700000-0000-0000-0000-000000000001', 3, 15, 'PENDING')
ON CONFLICT (match_id, set_number) DO NOTHING;

INSERT INTO public.match_scorers (match_id, user_id, assigned_by)
VALUES ('90700000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000001')
ON CONFLICT (match_id, user_id) DO NOTHING;

COMMIT;