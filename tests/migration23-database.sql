BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('23000000-0000-0000-0000-000000000001', 'phase5a-a@example.com'),
  ('23000000-0000-0000-0000-000000000002', 'phase5a-b@example.com'),
  ('23000000-0000-0000-0000-000000000003', 'phase5a-owner@example.com'),
  ('23000000-0000-0000-0000-000000000004', 'phase5a-player1@example.com'),
  ('23000000-0000-0000-0000-000000000005', 'phase5a-player2@example.com'),
  ('23000000-0000-0000-0000-000000000006', 'phase5a-player3@example.com');

INSERT INTO public.organizations (id, name, slug, created_by) VALUES
  ('23100000-0000-0000-0000-000000000001', 'Phase 5A Org A', 'phase5a-org-a', '23000000-0000-0000-0000-000000000001'),
  ('23100000-0000-0000-0000-000000000002', 'Phase 5A Org B', 'phase5a-org-b', '23000000-0000-0000-0000-000000000002');
INSERT INTO public.tournaments (id, organization_id, name, slug, format, league_mode, created_by) VALUES
  ('23200000-0000-0000-0000-000000000001', '23100000-0000-0000-0000-000000000001', 'Phase 5A A', 'phase5a-a', 'LEAGUE', 'AUCTION', '23000000-0000-0000-0000-000000000001'),
  ('23200000-0000-0000-0000-000000000002', '23100000-0000-0000-0000-000000000002', 'Phase 5A B', 'phase5a-b', 'LEAGUE', 'AUCTION', '23000000-0000-0000-0000-000000000002');
INSERT INTO public.tournament_members (tournament_id, user_id, role) VALUES
  ('23200000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'ORGANIZER'),
  ('23200000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'ORGANIZER');
INSERT INTO public.tournament_settings (tournament_id, min_squad_size, max_squad_size, auction_starting_purse, auction_base_price, auction_bid_increment) VALUES
  ('23200000-0000-0000-0000-000000000001', 6, 12, 5000, 100, 50),
  ('23200000-0000-0000-0000-000000000002', 6, 12, 5000, 100, 50);
INSERT INTO public.teams (id, tournament_id, name) VALUES
  ('23300000-0000-0000-0000-000000000001', '23200000-0000-0000-0000-000000000001', 'Phase Team'),
  ('23300000-0000-0000-0000-000000000002', '23200000-0000-0000-0000-000000000001', 'Phase Team Two');
INSERT INTO public.team_owners (team_id, user_id, is_primary) VALUES
  ('23300000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000003', true),
  ('23300000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000003', true);
INSERT INTO public.player_profiles (id, user_id, display_name, primary_position) VALUES
  ('23400000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000004', 'Icon', 'OUTSIDE_HITTER'),
  ('23400000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000005', 'Setter', 'SETTER'),
  ('23400000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000006', 'Main', 'LIBERO');
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status, auction_category) VALUES
  ('23200000-0000-0000-0000-000000000001', '23400000-0000-0000-0000-000000000001', 'APPROVED', 'ICON_LOT'),
  ('23200000-0000-0000-0000-000000000001', '23400000-0000-0000-0000-000000000002', 'APPROVED', 'SETTER_LOT'),
  ('23200000-0000-0000-0000-000000000001', '23400000-0000-0000-0000-000000000003', 'APPROVED', 'MAIN_AUCTION');
INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status, auction_category)
VALUES ('23200000-0000-0000-0000-000000000002', '23400000-0000-0000-0000-000000000001', 'APPROVED', 'ICON_LOT');
INSERT INTO public.auctions (id, tournament_id, starting_purse, minimum_bid_increment, status)
VALUES ('23700000-0000-0000-0000-000000000001', '23200000-0000-0000-0000-000000000002', 5000, 50, 'READY');
INSERT INTO public.auction_players (auction_id, player_id, base_price)
VALUES ('23700000-0000-0000-0000-000000000001', '23400000-0000-0000-0000-000000000001', 100);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE combo text[]; payload jsonb; stage_id uuid;
BEGIN
  -- All four independent method combinations and both re-auction settings.
  FOREACH combo SLICE 1 IN ARRAY ARRAY[['LOT_DRAW','LOT_DRAW'],['AUCTION','LOT_DRAW'],['LOT_DRAW','AUCTION'],['AUCTION','AUCTION']] LOOP
    PERFORM public.update_tournament_settings('23200000-0000-0000-0000-000000000001', true, true, NULL, 6, 12, 5000, 100, 50, combo[1], combo[2], 'SAME_BASE_PRICE');
    IF NOT EXISTS (SELECT 1 FROM public.tournament_settings WHERE tournament_id = '23200000-0000-0000-0000-000000000001' AND icon_selection_method = combo[1] AND setter_selection_method = combo[2]) THEN RAISE EXCEPTION 'Method combination failed: %', combo; END IF;
  END LOOP;
  PERFORM public.update_tournament_settings('23200000-0000-0000-0000-000000000001', true, true, NULL, 6, 12, 5000, 100, 50, 'LOT_DRAW', 'LOT_DRAW', 'ORGANIZER_SETS_PRICE');

  -- Cancelled pre-live empty lot does not lock; shuffled lot does.
  RESET ROLE;
  INSERT INTO public.lot_sessions (id, tournament_id, lot_type, status, created_by) VALUES ('23500000-0000-0000-0000-000000000001', '23200000-0000-0000-0000-000000000001', 'ICON', 'CANCELLED', '23000000-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM public.update_tournament_settings('23200000-0000-0000-0000-000000000001', true, true, NULL, 6, 12, 5000, 100, 50, 'AUCTION', 'LOT_DRAW', 'SAME_BASE_PRICE');
  RESET ROLE;
  UPDATE public.lot_sessions SET status = 'SHUFFLED' WHERE id = '23500000-0000-0000-0000-000000000001';
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_tournament_settings('23200000-0000-0000-0000-000000000001', true, true, NULL, 6, 12, 5000, 100, 50, 'LOT_DRAW', 'LOT_DRAW', 'SAME_BASE_PRICE');
    RAISE EXCEPTION 'Shuffled Icon lot did not lock the method';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Shuffled Icon lot%' THEN RAISE; END IF; END;

  -- Min/max validation and team_players authoritative maximum validation.
  RESET ROLE;
  INSERT INTO public.team_players (tournament_id, team_id, player_id, acquisition_type) VALUES ('23200000-0000-0000-0000-000000000001', '23300000-0000-0000-0000-000000000001', '23400000-0000-0000-0000-000000000002', 'SETTER_LOT');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_tournament_settings('23200000-0000-0000-0000-000000000001', true, true, NULL, 2, 0, 5000, 100, 50, 'AUCTION', 'LOT_DRAW', 'SAME_BASE_PRICE');
    RAISE EXCEPTION 'Invalid max squad was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Invalid max squad%' THEN RAISE; END IF; END;

  -- BO3, BO5, custom rules and stage-specific rules.
  PERFORM public.save_volleyball_rule('23200000-0000-0000-0000-000000000001', NULL, 2, true, '[{"set_number":1,"target_points":25},{"set_number":2,"target_points":25},{"set_number":3,"target_points":15}]');
  PERFORM public.save_volleyball_rule('23200000-0000-0000-0000-000000000001', NULL, 3, true, '[{"set_number":1,"target_points":25},{"set_number":2,"target_points":25},{"set_number":3,"target_points":25},{"set_number":4,"target_points":25},{"set_number":5,"target_points":15}]');
  stage_id := public.save_tournament_stage('23200000-0000-0000-0000-000000000001', NULL, 'Final', 'KNOCKOUT', 1, NULL);
  PERFORM public.save_volleyball_rule('23200000-0000-0000-0000-000000000001', stage_id, 1, false, '[{"set_number":1,"target_points":21}]');
  IF (SELECT count(*) FROM public.volleyball_rules WHERE tournament_id = '23200000-0000-0000-0000-000000000001') <> 2 THEN RAISE EXCEPTION 'Rule uniqueness/upsert failed'; END IF;

  RESET ROLE;
  INSERT INTO public.matches (id, tournament_id, stage_id, home_team_id, away_team_id, status)
  VALUES ('23600000-0000-0000-0000-000000000001', '23200000-0000-0000-0000-000000000001', stage_id, '23300000-0000-0000-0000-000000000001', '23300000-0000-0000-0000-000000000002', 'SCHEDULED');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.save_tournament_stage('23200000-0000-0000-0000-000000000001', stage_id, 'Renamed Final', 'KNOCKOUT', 1, NULL);
    RAISE EXCEPTION 'Referenced stage edit was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Referenced stage%' THEN RAISE; END IF; END;
  -- Scheduled matches allow rule preparation; LIVE matches lock it.
  PERFORM public.save_volleyball_rule('23200000-0000-0000-0000-000000000001', stage_id, 1, true, '[{"set_number":1,"target_points":21}]');
  RESET ROLE; UPDATE public.matches SET status = 'LIVE' WHERE id = '23600000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.save_volleyball_rule('23200000-0000-0000-0000-000000000001', stage_id, 1, false, '[{"set_number":1,"target_points":15}]');
    RAISE EXCEPTION 'Live stage rule edit was accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Live stage%' THEN RAISE; END IF; END;

  payload := public.get_tournament_phase5a_configuration('23200000-0000-0000-0000-000000000001');
  IF jsonb_array_length(payload->'readiness') <> 3 THEN RAISE EXCEPTION 'Readiness payload is incomplete'; END IF;

  -- Cross-tournament organizer mutation fails closed.
  PERFORM set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000002', true);
  BEGIN
    PERFORM public.update_tournament_settings('23200000-0000-0000-0000-000000000002', true, true, NULL, 6, 12, 5000, 100, 50, 'AUCTION', 'LOT_DRAW', 'SAME_BASE_PRICE');
    RAISE EXCEPTION 'READY auction route did not lock Icon method';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'READY auction%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.save_tournament_stage('23200000-0000-0000-0000-000000000001', NULL, 'Illegal', 'LEAGUE', 2, NULL);
    RAISE EXCEPTION 'Cross-tournament stage mutation succeeded';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'Cross-tournament%' THEN RAISE; END IF; END;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.tournament_settings', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.tournament_stages', 'INSERT')
    OR has_table_privilege('authenticated', 'public.volleyball_rules', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.volleyball_set_rules', 'DELETE') THEN
    RAISE EXCEPTION 'Critical configuration direct-write privilege remains';
  END IF;
END;
$$;

ROLLBACK;
