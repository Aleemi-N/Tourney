-- 0008_views.sql
-- Safe public views

--------------------------------------------------------------------------------
-- 1. PUBLIC TOURNAMENT VIEW
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_tournament_view WITH (security_invoker = true) AS
SELECT
  t.id,
  t.name,
  t.slug,
  t.sport,
  t.format,
  t.venue,
  t.description,
  t.start_date,
  t.end_date,
  t.status,
  t.is_public,
  b.primary_color,
  b.secondary_color,
  b.logo_path,
  b.background_path
FROM public.tournaments t
LEFT JOIN public.tournament_branding b ON b.tournament_id = t.id
WHERE t.is_public = true;

--------------------------------------------------------------------------------
-- 2. PUBLIC TEAM VIEW
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_team_view WITH (security_invoker = true) AS
SELECT
  t.id,
  t.tournament_id,
  t.name,
  t.short_name,
  t.logo_path,
  t.place,
  t.primary_color,
  t.secondary_color,
  t.status
FROM public.teams t
JOIN public.tournaments tourn ON tourn.id = t.tournament_id
WHERE tourn.is_public = true AND t.status = 'ACTIVE';

--------------------------------------------------------------------------------
-- 3. PUBLIC PLAYER VIEW
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_player_view WITH (security_invoker = true) AS
SELECT
  p.id,
  p.display_name,
  p.photo_path,
  p.height_cm,
  p.primary_position,
  p.secondary_position,
  tp.team_id,
  tp.tournament_id,
  tp.acquisition_type
FROM public.player_profiles p
JOIN public.team_players tp ON tp.player_id = p.id
JOIN public.tournaments tourn ON tourn.id = tp.tournament_id
WHERE tourn.is_public = true AND tp.status = 'ACTIVE';

--------------------------------------------------------------------------------
-- 4. PUBLIC FIXTURE VIEW
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_fixture_view WITH (security_invoker = true) AS
SELECT
  m.id,
  m.tournament_id,
  m.stage_id,
  m.match_number,
  m.home_team_id,
  m.away_team_id,
  m.scheduled_at,
  m.venue,
  m.court,
  m.status,
  m.winner_team_id,
  m.next_match_id,
  (SELECT SUM(home_score) FROM match_sets WHERE match_id = m.id) as total_home_score,
  (SELECT SUM(away_score) FROM match_sets WHERE match_id = m.id) as total_away_score,
  (SELECT COUNT(*) FROM match_sets WHERE match_id = m.id AND winner_team_id = m.home_team_id) as home_sets_won,
  (SELECT COUNT(*) FROM match_sets WHERE match_id = m.id AND winner_team_id = m.away_team_id) as away_sets_won
FROM public.matches m
JOIN public.tournaments tourn ON tourn.id = m.tournament_id
WHERE tourn.is_public = true;

--------------------------------------------------------------------------------
-- 5. PUBLIC REVEALED LOT STATE
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.public_revealed_lot_state WITH (security_invoker = false) AS
SELECT
  le.id,
  le.lot_session_id,
  le.lot_number,
  le.status,
  le.selected_by_team_id,
  le.selected_at,
  -- Only expose player info if SELECTED
  CASE WHEN le.status = 'SELECTED' THEN p.display_name ELSE NULL END as player_name,
  CASE WHEN le.status = 'SELECTED' THEN p.id ELSE NULL END as player_id
FROM public.lot_entries le
LEFT JOIN public.player_profiles p ON p.id = le.player_id
JOIN public.lot_sessions ls ON ls.id = le.lot_session_id
JOIN public.tournaments tourn ON tourn.id = ls.tournament_id
WHERE tourn.is_public = true;
