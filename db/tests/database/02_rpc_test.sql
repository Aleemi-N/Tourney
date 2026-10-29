BEGIN;

SELECT plan(16);

-- 1. Setup Mock State
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'), -- Organizer
  ('00000000-0000-0000-0000-000000000002'), -- Owner 1
  ('00000000-0000-0000-0000-000000000003'), -- Owner 2
  ('00000000-0000-0000-0000-000000000005'), -- Scorer
  ('00000000-0000-0000-0000-000000000008'), -- Player 1
  ('00000000-0000-0000-0000-000000000009'), -- Player 2
  ('00000000-0000-0000-0000-000000000010'), -- Player 3
  ('00000000-0000-0000-0000-000000000011'); -- Player 4

INSERT INTO public.profiles (id, full_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Organizer'),
  ('00000000-0000-0000-0000-000000000002', 'Owner 1'),
  ('00000000-0000-0000-0000-000000000003', 'Owner 2'),
  ('00000000-0000-0000-0000-000000000005', 'Scorer'),
  ('00000000-0000-0000-0000-000000000008', 'Player 1'),
  ('00000000-0000-0000-0000-000000000009', 'Player 2'),
  ('00000000-0000-0000-0000-000000000010', 'Player 3'),
  ('00000000-0000-0000-0000-000000000011', 'Player 4');

INSERT INTO public.player_profiles (id, user_id, display_name, primary_position) VALUES
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000008', 'P1', 'SETTER'),
  ('55555555-5555-5555-5555-555555555556', '00000000-0000-0000-0000-000000000009', 'P2', 'SETTER'),
  ('55555555-5555-5555-5555-555555555557', '00000000-0000-0000-0000-000000000010', 'P3', 'SETTER'),
  ('55555555-5555-5555-5555-555555555558', '00000000-0000-0000-0000-000000000011', 'P4', 'SETTER');

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

INSERT INTO public.tournament_settings (tournament_id, max_squad_size) VALUES ('22222222-2222-2222-2222-222222222222', 2);

-- Set Auth Context as Organizer
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

--------------------------------------------------------------------------------
-- LOT LOGIC
--------------------------------------------------------------------------------
-- Set Auth Context as Postgres to setup restricted tables (Organizers don't have direct INSERT to lot_entries)
SELECT set_config('role', 'postgres', true);

INSERT INTO public.lot_sessions (id, tournament_id, lot_type, status, created_by)
VALUES ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'ICON', 'SHUFFLED', '00000000-0000-0000-0000-000000000001');

INSERT INTO public.lot_entries (id, lot_session_id, lot_number, player_id, status)
VALUES 
  ('a1111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 1, '55555555-5555-5555-5555-555555555555', 'AVAILABLE'),
  ('a2222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 2, '55555555-5555-5555-5555-555555555556', 'AVAILABLE');

INSERT INTO public.lot_turns (id, lot_session_id, turn_order, team_id, status)
VALUES 
  ('b1111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 1, '33333333-3333-3333-3333-333333333333', 'WAITING'),
  ('b2222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666', 2, '44444444-4444-4444-4444-444444444444', 'WAITING');

-- Restore Auth Context as Organizer
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

-- Start lot session
SELECT lives_ok(
  $$ SELECT public.start_lot_session('66666666-6666-6666-6666-666666666666') $$,
  'TEST: Organizer can start lot session'
);

-- Try to select lot out of turn
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003"}', true); -- Owner 2 (Team 2)
SELECT throws_ok(
  $$ SELECT public.select_lot('66666666-6666-6666-6666-666666666666', 1, '44444444-4444-4444-4444-444444444444') $$,
  'It is not this teams turn',
  'TEST: wrong team turn throws exception'
);

-- Select lot correctly
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true); -- Owner 1 (Team 1)
SELECT lives_ok(
  $$ SELECT public.select_lot('66666666-6666-6666-6666-666666666666', 1, '33333333-3333-3333-3333-333333333333') $$,
  'TEST: Select lot works for correct team'
);

-- Select already selected lot
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003"}', true); -- Owner 2 (Team 2)
SELECT throws_ok(
  $$ SELECT public.select_lot('66666666-6666-6666-6666-666666666666', 1, '44444444-4444-4444-4444-444444444444') $$,
  'Lot is already selected',
  'TEST: already selected lot throws exception'
);

--------------------------------------------------------------------------------
-- AUCTION LOGIC
--------------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true); -- Organizer
INSERT INTO public.auctions (id, tournament_id, status, minimum_bid_increment, starting_purse)
VALUES ('c1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'LIVE', 100, 1000);

INSERT INTO public.auction_team_wallets (id, auction_id, team_id, starting_balance, remaining_balance)
VALUES 
  ('d1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1000, 1000),
  ('d2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 500, 500);

INSERT INTO public.auction_players (id, auction_id, player_id, base_price, status)
VALUES 
  ('e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555557', 200, 'LIVE'),
  ('e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555558', 200, 'WAITING');

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true); -- Owner 1

-- Valid bid
SELECT lives_ok(
  $$ SELECT public.place_auction_bid('c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 300) $$,
  'TEST: Valid bid works'
);

-- Invalid bid < min increment
SELECT throws_ok(
  $$ SELECT public.place_auction_bid('c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 350) $$,
  'Bid must be at least 100.00 higher than current highest bid (300.00)',
  'TEST: duplicate/simultaneous bid is ordered and throws if < min_increment'
);

-- Insufficient purse
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003"}', true); -- Owner 2 (500 purse)
SELECT throws_ok(
  $$ SELECT public.place_auction_bid('c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 600) $$,
  'Insufficient purse balance',
  'TEST: insufficient purse throws exception'
);

-- Finalize sale
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true); -- Organizer
SELECT lives_ok(
  $$ SELECT public.finalize_auction_sale('c1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111') $$,
  'TEST: Finalize sale works'
);

-- Test Max Squad size
-- Team 1 already has 1 from Lot and 1 from Auction. Max is 2. Let's try adding another.
UPDATE public.auction_players SET status = 'LIVE' WHERE id = 'e2222222-2222-2222-2222-222222222222';
INSERT INTO public.auction_bids (auction_id, auction_player_id, team_id, amount, source, submitted_by)
VALUES ('c1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 200, 'TEAM_OWNER', '00000000-0000-0000-0000-000000000002');

SELECT throws_ok(
  $$ SELECT public.finalize_auction_sale('c1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222') $$,
  'Maximum squad size reached for the winning team',
  'TEST: max squad size throws exception on finalize_auction_sale'
);

-- Test exactly 0 balance
UPDATE public.auction_team_wallets SET remaining_balance = 200 WHERE team_id = '44444444-4444-4444-4444-444444444444';
UPDATE public.auction_bids SET team_id = '44444444-4444-4444-4444-444444444444' WHERE auction_player_id = 'e2222222-2222-2222-2222-222222222222';
SELECT lives_ok(
  $$ SELECT public.finalize_auction_sale('c1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222') $$,
  'TEST: purse reaching exactly zero is allowed (remaining_balance >= 0)'
);

--------------------------------------------------------------------------------
-- SCORE LOGIC
--------------------------------------------------------------------------------
SELECT set_config('role', 'postgres', true);

INSERT INTO public.matches (id, tournament_id, home_team_id, away_team_id, status)
VALUES ('f1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'LIVE');

INSERT INTO public.match_scorers (match_id, user_id, assigned_by)
VALUES ('f1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001');

INSERT INTO public.match_sets (id, match_id, set_number, target_points, status)
VALUES ('f2222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', 1, 2, 'LIVE'); -- small target for test

INSERT INTO public.volleyball_rules (tournament_id, sets_to_win, win_by_two)
VALUES ('22222222-2222-2222-2222-222222222222', 1, true);

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005"}', true); -- Scorer

SELECT lives_ok(
  $$ SELECT public.award_point('f1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'key1') $$,
  'TEST: Scorer awards point'
);

SELECT set_config('role', 'postgres', true);
SELECT throws_ok(
  $$ INSERT INTO public.score_events (match_id, match_set_id, sequence_number, event_type, team_id, home_score_after, away_score_after, created_by) 
     VALUES ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222', 1, 'POINT', '33333333-3333-3333-3333-333333333333', 2, 0, '00000000-0000-0000-0000-000000000005') $$,
  'duplicate key value violates unique constraint "score_events_match_id_sequence_number_key"',
  'TEST: duplicate score sequence throws unique constraint violation'
);
SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
  $$ SELECT public.award_point('f1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'key2') $$,
  'TEST: Away team point'
);

-- Next point puts it at 2-1 (target is 2, win by 2 is true, so set isn't over yet)
SELECT lives_ok(
  $$ SELECT public.award_point('f1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'key3') $$,
  'TEST: Score 2-1 (win by 2 prevents completion)'
);

SELECT results_eq(
  $$ SELECT status FROM public.match_sets WHERE id = 'f2222222-2222-2222-2222-222222222222' $$,
  ARRAY['LIVE'],
  'TEST: Set still live because of win_by_two requirement'
);

-- Test Undo
SELECT lives_ok(
  $$ SELECT public.undo_last_score_event('f1111111-1111-1111-1111-111111111111') $$,
  'TEST: Undo last score event'
);

SELECT * FROM finish();
ROLLBACK;
