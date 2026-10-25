-- Local-only QA data. Supabase loads this file after local migrations during db reset.
-- Never apply this file to a linked or production project.
-- Every person, email and phone number is fictional. All accounts share the local-only
-- password passed to extensions.crypt() below. Role accounts:
--   organizer@tourny.local, owner@tourny.local, player@tourny.local, scorer@tourny.local,
--   super-admin@tourny.local, organizer2@tourny.local, owner2..6@tourny.local, player01..48@tourny.local
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
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'scorer@tourny.local', extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Scorer"}', now(), now(), false, false),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'super-admin@tourny.local', extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Super Admin"}', now(), now(), false, false)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  instance_id = EXCLUDED.instance_id,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = now();

-- GoTrue v2.197+ scans legacy token columns as strings during password login.
-- Keep local QA identities compatible even when auth.users defaults are NULL.
UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email IN ('organizer@tourny.local', 'owner@tourny.local', 'player@tourny.local', 'scorer@tourny.local', 'super-admin@tourny.local');

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
FROM auth.users u
WHERE u.email IN ('organizer@tourny.local', 'owner@tourny.local', 'player@tourny.local', 'scorer@tourny.local', 'super-admin@tourny.local')
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
VALUES ('90700000-0000-0000-0000-000000000001', '90200000-0000-0000-0000-000000000001', '90500000-0000-0000-0000-000000000001', 1, '90300000-0000-0000-0000-000000000001', '90300000-0000-0000-0000-000000000002', 'SCHEDULED', 'Local QA Arena', '1')
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

INSERT INTO public.platform_super_admins (user_id, granted_by, note)
VALUES ('90000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000001', 'Local QA super admin')
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extended local QA data: one tournament per lifecycle state, all synthetic.
--   T1 Tourny Local QA Cup        REGISTRATION (pending players + owner applications)
--   T2 Coastal Volleyball League  live auction (icon + setter lots completed)
--   T3 Harbour Premier League     LIVE fixtures, one match in progress
--   T4 Monsoon Cup 2025           COMPLETED with final standings
--   T5 Backwater Invitational     DRAFT submitted for super-admin approval
--   T6 Lagoon Masters             icon lot draw in progress
-- Every person, email and phone number here is fictional (@tourny.local, 90000xxxxx).
-- State is produced through the app's own RPCs, impersonating users via request.jwt.claims.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p_user::text, true);
$$;

CREATE FUNCTION pg_temp.uid(p_prefix text, p_n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_prefix || '-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
$$;

-- Plays one set: interleaves both teams' points evenly so the winner scores last.
CREATE FUNCTION pg_temp.play_set(p_match uuid, p_home_pts integer, p_away_pts integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_home uuid; v_away uuid; v_win uuid; v_lose uuid; v_w integer; v_l integer; r record;
BEGIN
  SELECT home_team_id, away_team_id INTO v_home, v_away FROM public.matches WHERE id = p_match;
  IF p_home_pts >= p_away_pts THEN v_win := v_home; v_lose := v_away; v_w := p_home_pts; v_l := p_away_pts;
  ELSE v_win := v_away; v_lose := v_home; v_w := p_away_pts; v_l := p_home_pts; END IF;
  FOR r IN
    SELECT team FROM (
      SELECT v_win AS team, k::numeric / v_w AS pos, 1 AS tie FROM generate_series(1, v_w) k
      UNION ALL
      SELECT v_lose, k::numeric / (v_l + 1), 0 FROM generate_series(1, v_l) k
    ) s ORDER BY pos, tie
  LOOP
    PERFORM public.award_point(p_match, r.team, gen_random_uuid()::text);
  END LOOP;
END $$;

-- Plays a whole match from '[[home, away], ...]' set scores.
CREATE FUNCTION pg_temp.play_match(p_match uuid, p_sets jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.match_sets WHERE match_id = p_match) THEN
    PERFORM public.initialize_match_sets(p_match);
  END IF;
  FOR s IN SELECT * FROM jsonb_array_elements(p_sets) LOOP
    PERFORM pg_temp.play_set(p_match, (s->>0)::integer, (s->>1)::integer);
  END LOOP;
END $$;

-- ── Accounts ────────────────────────────────────────────────────────────────
-- 0006 second organizer, 0011–0015 team owners, 0101–0148 players.
CREATE TEMP TABLE seed_people (n integer PRIMARY KEY, email text, full_name text, phone text) ON COMMIT DROP;

INSERT INTO seed_people
SELECT 6, 'organizer2@tourny.local', 'Meera Krishnan', '9000000006'
UNION ALL
SELECT 10 + g, 'owner' || (g + 1) || '@tourny.local',
       (ARRAY['Joseph Kurian','Fathima Rahman','Sajan Varghese','Lekha Pillai','Dennis Mathew'])[g], '90000000' || lpad((10 + g)::text, 2, '0')
FROM generate_series(1, 5) g
UNION ALL
SELECT 100 + g, 'player' || lpad(g::text, 2, '0') || '@tourny.local',
       (ARRAY['Arjun','Rahul','Vishnu','Akhil','Nikhil','Sreeraj','Anand','Joel','Aswin','Fahad','Irfan','Jithin','Kevin','Manu','Nithin','Rohit','Sanjay','Tony','Vivek','Yadhu','Abhay','Bibin','Gokul','Hari'])[1 + (g - 1) % 24]
       || ' ' ||
       (ARRAY['Nair','Menon','Thomas','Varghese','Kurian','Joseph','Rahman','Krishnan','Das','Mathew','George','Pillai','Babu','Raj','Shaji','Paul','Antony','Suresh','Mohan','Iqbal'])[1 + ((g - 1) * 7) % 20],
       '9000000' || lpad((100 + g)::text, 3, '0')
FROM generate_series(1, 48) g;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change_token, email_change_token_current, reauthentication_token
)
SELECT '00000000-0000-0000-0000-000000000000', pg_temp.uid('90000000', p.n), 'authenticated', 'authenticated', p.email,
       extensions.crypt('TournyTest123!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p.full_name), now(), now(), false, false,
       '', '', '', '', '', '', ''
FROM seed_people p
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
FROM auth.users u JOIN seed_people p ON u.id = pg_temp.uid('90000000', p.n)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Friendlier names for the five role accounts from the base seed.
UPDATE public.profiles SET full_name = v.name
FROM (VALUES (1, 'Riya Menon'), (2, 'Aditya Nair'), (3, 'Kiran Joseph'), (4, 'Sneha Thomas'), (5, 'Platform Admin')) v(n, name)
WHERE id = pg_temp.uid('90000000', v.n);

UPDATE public.profiles pr SET full_name = p.full_name, phone = p.phone
FROM seed_people p WHERE pr.id = pg_temp.uid('90000000', p.n);

UPDATE public.player_profiles SET display_name = 'Kiran Joseph', place = 'Varkala', height_cm = 182, primary_position = 'OUTSIDE_HITTER',
  secondary_position = 'UNIVERSAL', jersey_name = 'KIRAN', jersey_number = '7', jersey_size = 'L', phone = '9000000003'
WHERE id = '90400000-0000-0000-0000-000000000001';

INSERT INTO public.player_profiles (id, user_id, display_name, primary_position, secondary_position, place, height_cm, phone, date_of_birth, jersey_name, jersey_number, jersey_size)
SELECT pg_temp.uid('90400000', p.n), pg_temp.uid('90000000', p.n), p.full_name,
       (ARRAY['SETTER','OUTSIDE_HITTER','MIDDLE_BLOCKER','OPPOSITE','LIBERO','UNIVERSAL'])[1 + (p.n % 6)],
       CASE WHEN p.n % 3 = 0 THEN 'UNIVERSAL' END,
       (ARRAY['Varkala','Kollam','Paravur','Anchuthengu','Kadakkavoor','Chirayinkeezhu','Attingal','Kappil'])[1 + (p.n % 8)],
       168 + (p.n * 7) % 30, p.phone, (date '1994-01-01' + ((p.n * 97) % 3650)),
       upper(split_part(p.full_name, ' ', 1)), ((p.n * 3) % 30 + 1)::text,
       (ARRAY['S','M','L','XL'])[1 + (p.n % 4)]
FROM seed_people p WHERE p.n > 100
ON CONFLICT (id) DO NOTHING;

-- ── Organizations ──────────────────────────────────────────────────────────
UPDATE public.organizations SET name = 'Coastal Sports Collective' WHERE id = '90100000-0000-0000-0000-000000000001';
INSERT INTO public.organizations (id, name, slug, created_by)
VALUES ('90100000-0000-0000-0000-000000000002', 'Backwater Volley Club', 'backwater-volley-club', pg_temp.uid('90000000', 6));
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('90100000-0000-0000-0000-000000000002', pg_temp.uid('90000000', 6), 'OWNER', 'ACTIVE');

-- ── Tournaments ─────────────────────────────────────────────────────────────
UPDATE public.tournaments SET approval_status = 'APPROVED', start_date = current_date + 30, end_date = current_date + 32,
  registration_end = current_date + 20, description = 'Open registration for the winter edition. Two teams so far; more owners are applying.'
WHERE id = '90200000-0000-0000-0000-000000000001';

INSERT INTO public.tournaments (id, organization_id, name, slug, format, league_mode, sport, status, is_public, approval_status, created_by, description, venue, start_date, end_date)
VALUES
  ('90200000-0000-0000-0000-000000000002', '90100000-0000-0000-0000-000000000001', 'Coastal Volleyball League 2026', 'coastal-volleyball-league-2026', 'LEAGUE', 'AUCTION', 'VOLLEYBALL', 'PREPARATION', true, 'APPROVED', pg_temp.uid('90000000', 1),
   'Six auction-built squads, three match days, one trophy.', 'Municipal Indoor Stadium', current_date + 7, current_date + 9),
  ('90200000-0000-0000-0000-000000000003', '90100000-0000-0000-0000-000000000001', 'Harbour Premier League', 'harbour-premier-league', 'LEAGUE', 'REGISTERED_TEAM', 'VOLLEYBALL', 'LIVE', true, 'APPROVED', pg_temp.uid('90000000', 1),
   'Round-robin league for six registered clubs. Best of five sets.', 'Harbour Sports Arena', current_date - 1, current_date + 1),
  ('90200000-0000-0000-0000-000000000004', '90100000-0000-0000-0000-000000000001', 'Monsoon Cup 2025', 'monsoon-cup-2025', 'LEAGUE', 'REGISTERED_TEAM', 'VOLLEYBALL', 'LIVE', true, 'APPROVED', pg_temp.uid('90000000', 1),
   'Last season''s four-team cup.', 'Beach Road Court', current_date - 60, current_date - 59),
  ('90200000-0000-0000-0000-000000000005', '90100000-0000-0000-0000-000000000002', 'Backwater Invitational 2027', 'backwater-invitational-2027', 'LEAGUE', 'AUCTION', 'VOLLEYBALL', 'DRAFT', false, 'APPROVED', pg_temp.uid('90000000', 6),
   'Invitational auction league, waiting for platform approval.', 'Lakeside Court', current_date + 90, current_date + 92),
  ('90200000-0000-0000-0000-000000000006', '90100000-0000-0000-0000-000000000001', 'Lagoon Masters 2026', 'lagoon-masters-2026', 'LEAGUE', 'AUCTION', 'VOLLEYBALL', 'PREPARATION', true, 'APPROVED', pg_temp.uid('90000000', 1),
   'Four-team masters league. Icon players are being drawn now.', 'Lagoon Club Court', current_date + 14, current_date + 15);

INSERT INTO public.tournament_settings (tournament_id, min_squad_size, max_squad_size, auction_starting_purse, auction_base_price, auction_bid_increment,
  icon_selection_method, setter_selection_method, reauction_price_rule, player_registration_enabled, team_registration_enabled, owner_registration_mode)
VALUES
  ('90200000-0000-0000-0000-000000000002', 5, 7, 10000, 100, 100, 'LOT_DRAW', 'LOT_DRAW', 'SAME_BASE_PRICE', false, false, 'INVITE_ONLY'),
  ('90200000-0000-0000-0000-000000000003', 6, 10, NULL, NULL, NULL, 'LOT_DRAW', 'LOT_DRAW', 'SAME_BASE_PRICE', false, false, 'INVITE_ONLY'),
  ('90200000-0000-0000-0000-000000000004', 6, 10, NULL, NULL, NULL, 'LOT_DRAW', 'LOT_DRAW', 'SAME_BASE_PRICE', false, false, 'INVITE_ONLY'),
  ('90200000-0000-0000-0000-000000000005', 5, 7, 8000, 100, 100, 'LOT_DRAW', 'AUCTION', 'SAME_BASE_PRICE', true, true, 'OPEN'),
  ('90200000-0000-0000-0000-000000000006', 4, 6, 6000, 100, 100, 'LOT_DRAW', 'AUCTION', 'SAME_BASE_PRICE', false, false, 'INVITE_ONLY');

UPDATE public.tournament_settings SET player_registration_enabled = true, team_registration_enabled = true, owner_registration_mode = 'OPEN'
WHERE tournament_id = '90200000-0000-0000-0000-000000000001';

INSERT INTO public.tournament_members (tournament_id, user_id, role, status)
SELECT t, pg_temp.uid('90000000', 1), 'ORGANIZER', 'ACTIVE'
FROM unnest(ARRAY['90200000-0000-0000-0000-000000000002','90200000-0000-0000-0000-000000000003','90200000-0000-0000-0000-000000000004','90200000-0000-0000-0000-000000000006']::uuid[]) t
UNION ALL SELECT '90200000-0000-0000-0000-000000000005', pg_temp.uid('90000000', 6), 'ORGANIZER', 'ACTIVE'
UNION ALL SELECT '90200000-0000-0000-0000-000000000003', pg_temp.uid('90000000', 4), 'SCORER', 'ACTIVE'
ON CONFLICT (tournament_id, user_id, role) DO NOTHING;

-- ── Teams (owner 0002 = owner@tourny.local owns one team in every tournament) ──
CREATE TEMP TABLE seed_teams (tournament_n integer, n integer, name text, short_name text, primary_color text, secondary_color text, owner_n integer) ON COMMIT DROP;
INSERT INTO seed_teams VALUES
  (2, 21, 'Harbour Hawks', 'HAW', '#1d4ed8', '#93c5fd', 2),
  (2, 22, 'Coastline Strikers', 'CST', '#c2410c', '#fdba74', 11),
  (2, 23, 'Palm Grove VC', 'PGV', '#0f766e', '#5eead4', 12),
  (2, 24, 'Sunset Smashers', 'SUN', '#b45309', '#fcd34d', 13),
  (2, 25, 'Lagoon Lions', 'LAG', '#6d28d9', '#c4b5fd', 14),
  (2, 26, 'Backwater Blockers', 'BWB', '#be123c', '#fda4af', 15),
  (3, 31, 'Kayal Kings', 'KAY', '#1e40af', '#bfdbfe', 2),
  (3, 32, 'Breakwater Blasters', 'BRK', '#b91c1c', '#fecaca', 11),
  (3, 33, 'Lighthouse Lions', 'LHL', '#a16207', '#fde68a', 12),
  (3, 34, 'Tidewater Titans', 'TDW', '#047857', '#a7f3d0', 13),
  (3, 35, 'Seashell Smashers', 'SEA', '#7e22ce', '#e9d5ff', 14),
  (3, 36, 'Mangrove Mavericks', 'MNG', '#334155', '#cbd5e1', 15),
  (4, 41, 'Rainmakers', 'RNM', '#0369a1', '#bae6fd', 2),
  (4, 42, 'Thunder Spikers', 'THS', '#9a3412', '#fed7aa', 11),
  (4, 43, 'Cloudburst VC', 'CLB', '#4338ca', '#c7d2fe', 12),
  (4, 44, 'Drizzle Dynamos', 'DRZ', '#0f766e', '#99f6e4', 13),
  (6, 61, 'Estuary Eagles', 'EST', '#1d4ed8', '#bfdbfe', 2),
  (6, 62, 'Canal Cobras', 'CAN', '#15803d', '#bbf7d0', 11),
  (6, 63, 'Island Invaders', 'ISL', '#b45309', '#fde68a', 12),
  (6, 64, 'Ferry Falcons', 'FER', '#be185d', '#fbcfe8', 13);

UPDATE public.teams SET primary_color = '#2563eb', secondary_color = '#bfdbfe' WHERE id = '90300000-0000-0000-0000-000000000001';
UPDATE public.teams SET primary_color = '#dc2626', secondary_color = '#fecaca' WHERE id = '90300000-0000-0000-0000-000000000002';

INSERT INTO public.teams (id, tournament_id, name, short_name, place, status, primary_color, secondary_color)
SELECT pg_temp.uid('90300000', s.n), pg_temp.uid('90200000', s.tournament_n), s.name, s.short_name,
       (ARRAY['Varkala','Kollam','Paravur','Anchuthengu','Kadakkavoor','Attingal'])[1 + s.n % 6], 'ACTIVE', s.primary_color, s.secondary_color
FROM seed_teams s;

INSERT INTO public.team_owners (team_id, user_id, is_primary, status)
SELECT pg_temp.uid('90300000', s.n), pg_temp.uid('90000000', s.owner_n), true, 'ACTIVE' FROM seed_teams s;

INSERT INTO public.tournament_members (tournament_id, user_id, role, status)
SELECT DISTINCT pg_temp.uid('90200000', s.tournament_n), pg_temp.uid('90000000', s.owner_n), 'TEAM_OWNER', 'ACTIVE' FROM seed_teams s
ON CONFLICT (tournament_id, user_id, role) DO NOTHING;

-- ── T1: registration in progress ───────────────────────────────────────────
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status, created_at)
SELECT '90200000-0000-0000-0000-000000000001', pg_temp.uid('90400000', 100 + g),
       CASE WHEN g <= 9 THEN 'PENDING' WHEN g = 10 THEN 'REJECTED' ELSE 'APPROVED' END, now() - (g || ' hours')::interval
FROM generate_series(1, 12) g;

INSERT INTO public.team_owner_applications (tournament_id, user_id, proposed_team_name, team_short_name, place, phone, email, status, created_at)
VALUES
  ('90200000-0000-0000-0000-000000000001', pg_temp.uid('90000000', 13), 'Riverside Rockets', 'RVR', 'Paravur', '9000000013', 'owner4@tourny.local', 'PENDING', now() - interval '5 hours'),
  ('90200000-0000-0000-0000-000000000001', pg_temp.uid('90000000', 14), 'Coral Crushers', 'CRL', 'Kollam', '9000000014', 'owner5@tourny.local', 'PENDING', now() - interval '2 hours'),
  ('90200000-0000-0000-0000-000000000001', pg_temp.uid('90000000', 15), 'Sandbar Spikers', 'SND', 'Kappil', '9000000015', 'owner6@tourny.local', 'REJECTED', now() - interval '1 day');

-- ── T3: live round-robin (best of 5) ───────────────────────────────────────
INSERT INTO public.team_players (tournament_id, team_id, player_id, acquisition_type, status)
SELECT '90200000-0000-0000-0000-000000000003', pg_temp.uid('90300000', 31 + (g - 1) / 7), pg_temp.uid('90400000', 100 + g), 'REGISTERED', 'ACTIVE'
FROM generate_series(1, 42) g;
INSERT INTO public.team_players (tournament_id, team_id, player_id, acquisition_type, status)
VALUES ('90200000-0000-0000-0000-000000000003', '90300000-0000-0000-0000-000000000031', '90400000-0000-0000-0000-000000000001', 'REGISTERED', 'ACTIVE');
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status)
SELECT tournament_id, player_id, 'APPROVED' FROM public.team_players WHERE tournament_id = '90200000-0000-0000-0000-000000000003';

INSERT INTO public.tournament_stages (id, tournament_id, name, stage_type, sequence, status, qualification_count)
VALUES ('90500000-0000-0000-0000-000000000003', '90200000-0000-0000-0000-000000000003', 'League Stage', 'LEAGUE', 1, 'ACTIVE', 4),
       ('90500000-0000-0000-0000-000000000004', '90200000-0000-0000-0000-000000000004', 'League Stage', 'LEAGUE', 1, 'ACTIVE', 2);
INSERT INTO public.volleyball_rules (id, tournament_id, stage_id, sets_to_win, win_by_two)
VALUES ('90600000-0000-0000-0000-000000000003', '90200000-0000-0000-0000-000000000003', '90500000-0000-0000-0000-000000000003', 3, true),
       ('90600000-0000-0000-0000-000000000004', '90200000-0000-0000-0000-000000000004', '90500000-0000-0000-0000-000000000004', 2, true);
INSERT INTO public.volleyball_set_rules (volleyball_rule_id, set_number, target_points)
VALUES ('90600000-0000-0000-0000-000000000003', 1, 25), ('90600000-0000-0000-0000-000000000003', 2, 25), ('90600000-0000-0000-0000-000000000003', 3, 25),
       ('90600000-0000-0000-0000-000000000003', 4, 25), ('90600000-0000-0000-0000-000000000003', 5, 15),
       ('90600000-0000-0000-0000-000000000004', 1, 25), ('90600000-0000-0000-0000-000000000004', 2, 25), ('90600000-0000-0000-0000-000000000004', 3, 15);
INSERT INTO public.standings_rules (stage_id, win_points, loss_points)
VALUES ('90500000-0000-0000-0000-000000000003', 3, 0), ('90500000-0000-0000-0000-000000000004', 2, 0);

-- ── T4: completed cup (best of 3) ──────────────────────────────────────────
INSERT INTO public.team_players (tournament_id, team_id, player_id, acquisition_type, status)
SELECT '90200000-0000-0000-0000-000000000004', pg_temp.uid('90300000', 41 + (g - 1) / 6), pg_temp.uid('90400000', 100 + g), 'REGISTERED', 'ACTIVE'
FROM generate_series(1, 24) g;
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status)
SELECT tournament_id, player_id, 'APPROVED' FROM public.team_players WHERE tournament_id = '90200000-0000-0000-0000-000000000004';

DO $$
DECLARE
  v_match uuid;
  v_i integer := 0;
  t3 jsonb := '[
    [[25,21],[25,19],[25,23]],
    [[21,25],[25,22],[25,18],[25,20]],
    [[25,23],[19,25],[22,25],[25,17],[15,11]],
    [[18,25],[23,25],[21,25]],
    [[25,20],[25,23],[20,25],[25,22]],
    [[25,22],[18,25],[25,21],[23,25],[13,15]],
    [[25,21],[22,25],[18,16]]
  ]';
  t4 jsonb := '[
    [[25,20],[25,22]], [[25,23],[21,25],[15,12]], [[22,25],[25,19],[15,10]],
    [[25,18],[25,21]], [[19,25],[23,25]], [[25,23],[25,20]]
  ]';
BEGIN
  PERFORM pg_temp.act_as('90000000-0000-0000-0000-000000000001');
  PERFORM public.generate_stage_fixtures('90500000-0000-0000-0000-000000000003');
  PERFORM public.generate_stage_fixtures('90500000-0000-0000-0000-000000000004');

  UPDATE public.matches m SET
    scheduled_at = date_trunc('day', now()) + interval '9 hours' + ((m.program_order - 1) * interval '75 minutes') - interval '1 day',
    venue = 'Harbour Sports Arena', court = (1 + (m.program_order - 1) % 2)::text
  WHERE m.stage_id = '90500000-0000-0000-0000-000000000003';
  UPDATE public.matches m SET
    scheduled_at = date_trunc('day', now()) - interval '60 days' + interval '9 hours' + ((m.program_order - 1) * interval '60 minutes'),
    venue = 'Beach Road Court', court = '1'
  WHERE m.stage_id = '90500000-0000-0000-0000-000000000004';

  FOR v_match IN SELECT id FROM public.matches WHERE stage_id = '90500000-0000-0000-0000-000000000003' ORDER BY program_order LIMIT 7 LOOP
    PERFORM pg_temp.play_match(v_match, t3 -> v_i);
    v_i := v_i + 1;
  END LOOP;

  v_i := 0;
  FOR v_match IN SELECT id FROM public.matches WHERE stage_id = '90500000-0000-0000-0000-000000000004' ORDER BY program_order LOOP
    PERFORM pg_temp.play_match(v_match, t4 -> v_i);
    v_i := v_i + 1;
  END LOOP;

  -- The scorer account covers the live match and the next one.
  INSERT INTO public.match_scorers (match_id, user_id, assigned_by)
  SELECT id, '90000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000001'
  FROM public.matches WHERE stage_id = '90500000-0000-0000-0000-000000000003' AND program_order IN (7, 8);
END $$;

UPDATE public.tournament_stages SET status = 'COMPLETED' WHERE id = '90500000-0000-0000-0000-000000000004';
UPDATE public.tournaments SET status = 'COMPLETED' WHERE id = '90200000-0000-0000-0000-000000000004';

-- ── T2: lots completed, auction live ───────────────────────────────────────
INSERT INTO public.tournament_auction_categories (tournament_id, category_code, display_name, base_price, display_order)
VALUES ('90200000-0000-0000-0000-000000000002', 'A', 'Category A', 500, 1),
       ('90200000-0000-0000-0000-000000000002', 'B', 'Category B', 300, 2),
       ('90200000-0000-0000-0000-000000000002', 'C', 'Category C', 100, 3),
       ('90200000-0000-0000-0000-000000000006', 'A', 'Category A', 400, 1),
       ('90200000-0000-0000-0000-000000000006', 'B', 'Category B', 200, 2),
       ('90200000-0000-0000-0000-000000000006', 'C', 'Category C', 100, 3);

-- Players 101–106 icons, 107–112 setters, 113–136 + player@ in the main auction.
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status, auction_category, auction_price_category_id, reviewed_by, reviewed_at)
SELECT '90200000-0000-0000-0000-000000000002', pid,
       'APPROVED', cat,
       CASE WHEN cat = 'MAIN_AUCTION' THEN (SELECT id FROM public.tournament_auction_categories c WHERE c.tournament_id = '90200000-0000-0000-0000-000000000002' AND c.category_code = code) END,
       '90000000-0000-0000-0000-000000000001', now() - interval '3 days'
FROM (
  SELECT pg_temp.uid('90400000', 100 + g) pid,
         CASE WHEN g <= 6 THEN 'ICON_LOT' WHEN g <= 12 THEN 'SETTER_LOT' ELSE 'MAIN_AUCTION' END cat,
         CASE WHEN g <= 16 THEN 'A' WHEN g <= 24 THEN 'B' ELSE 'C' END code
  FROM generate_series(1, 36) g
  UNION ALL SELECT '90400000-0000-0000-0000-000000000001', 'MAIN_AUCTION', 'B'
) x;

-- T6: four icon players for the in-progress lot draw.
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status, auction_category, reviewed_by, reviewed_at)
SELECT '90200000-0000-0000-0000-000000000006', pg_temp.uid('90400000', 136 + g), 'APPROVED', 'ICON_LOT', '90000000-0000-0000-0000-000000000001', now() - interval '1 day'
FROM generate_series(1, 4) g;

DO $$
DECLARE
  v_t2 uuid := '90200000-0000-0000-0000-000000000002';
  v_order uuid[];
  v_session uuid;
  v_type text;
  v_turn uuid;
  v_card integer;
  v_auction uuid;
  v_ap record;
  v_bid uuid;
  v_teams uuid[];
  v_amount numeric;
  v_i integer;
BEGIN
  PERFORM pg_temp.act_as('90000000-0000-0000-0000-000000000001');
  SELECT array_agg(id ORDER BY id) INTO v_order FROM public.teams WHERE tournament_id = v_t2;

  -- Complete both lots for T2.
  FOREACH v_type IN ARRAY ARRAY['ICON', 'SETTER'] LOOP
    PERFORM public.prepare_lot_session(v_t2, v_type, v_order);
    SELECT id INTO v_session FROM public.lot_sessions WHERE tournament_id = v_t2 AND lot_type = v_type AND status <> 'CANCELLED';
    PERFORM public.shuffle_lot_session(v_session);
    PERFORM public.start_lot_session(v_session);
    LOOP
      SELECT id INTO v_turn FROM public.lot_turns WHERE lot_session_id = v_session AND status = 'ACTIVE' ORDER BY round_number, turn_order LIMIT 1;
      EXIT WHEN v_turn IS NULL;
      SELECT lot_number INTO v_card FROM public.lot_entries WHERE lot_session_id = v_session AND status = 'AVAILABLE' ORDER BY lot_number LIMIT 1;
      PERFORM public.select_lot(v_session, v_card, v_turn, gen_random_uuid()::text);
    END LOOP;
  END LOOP;

  -- T6: icon lot live with two picks made.
  SELECT array_agg(id ORDER BY id) INTO v_order FROM public.teams WHERE tournament_id = '90200000-0000-0000-0000-000000000006';
  PERFORM public.prepare_lot_session('90200000-0000-0000-0000-000000000006', 'ICON', v_order);
  SELECT id INTO v_session FROM public.lot_sessions WHERE tournament_id = '90200000-0000-0000-0000-000000000006' AND lot_type = 'ICON';
  PERFORM public.shuffle_lot_session(v_session);
  PERFORM public.start_lot_session(v_session);
  FOR v_i IN 1..2 LOOP
    SELECT id INTO v_turn FROM public.lot_turns WHERE lot_session_id = v_session AND status = 'ACTIVE' ORDER BY round_number, turn_order LIMIT 1;
    SELECT lot_number INTO v_card FROM public.lot_entries WHERE lot_session_id = v_session AND status = 'AVAILABLE' ORDER BY lot_number DESC LIMIT 1;
    PERFORM public.select_lot(v_session, v_card, v_turn, gen_random_uuid()::text);
  END LOOP;

  -- T2 auction: start, sell ten players, leave the eleventh on the block with a bid.
  PERFORM public.prepare_auction(v_t2);
  SELECT id INTO v_auction FROM public.auctions WHERE tournament_id = v_t2;
  PERFORM public.set_auction_lifecycle(v_auction, 'START', (SELECT state_version FROM public.auctions WHERE id = v_auction), gen_random_uuid()::text);
  SELECT array_agg(id ORDER BY name) INTO v_teams FROM public.teams WHERE tournament_id = v_t2;

  FOR v_i IN 1..11 LOOP
    PERFORM public.open_next_auction_player(v_auction, (SELECT state_version FROM public.auctions WHERE id = v_auction), gen_random_uuid()::text);
    SELECT * INTO v_ap FROM public.auction_players WHERE auction_id = v_auction AND status = 'LIVE';
    v_amount := v_ap.base_price;
    PERFORM public.place_auction_bid(v_auction, v_ap.id, v_teams[1 + (v_i % 6)], v_amount, gen_random_uuid()::text,
      (SELECT state_version FROM public.auction_players WHERE id = v_ap.id), NULL);
    IF v_i % 2 = 0 THEN
      v_amount := v_amount + 200;
      PERFORM public.place_auction_bid(v_auction, v_ap.id, v_teams[1 + ((v_i + 3) % 6)], v_amount, gen_random_uuid()::text,
        (SELECT state_version FROM public.auction_players WHERE id = v_ap.id), v_amount - 200);
    END IF;
    EXIT WHEN v_i = 11;
    SELECT id INTO v_bid FROM public.auction_bids WHERE auction_player_id = v_ap.id ORDER BY amount DESC, created_at DESC LIMIT 1;
    PERFORM public.finalize_auction_sale(v_auction, v_ap.id, (SELECT state_version FROM public.auction_players WHERE id = v_ap.id), v_bid, gen_random_uuid()::text);
  END LOOP;

  -- T5: organizer2 submits the draft for approval.
  PERFORM pg_temp.act_as('90000000-0000-0000-0000-000000000006');
  PERFORM public.submit_tournament_for_approval('90200000-0000-0000-0000-000000000005');
END $$;

UPDATE public.tournaments SET status = 'LIVE' WHERE id = '90200000-0000-0000-0000-000000000002';

COMMIT;
