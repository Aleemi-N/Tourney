BEGIN;

INSERT INTO auth.users(id,email) VALUES
 ('24000000-0000-0000-0000-000000000001','m24-org@example.test'),
 ('24000000-0000-0000-0000-000000000002','m24-owner@example.test'),
 ('24000000-0000-0000-0000-000000000003','m24-player@example.test');
INSERT INTO public.organizations(id,name,slug,created_by) VALUES
 ('24100000-0000-0000-0000-000000000001','M24 Org','m24-org','24000000-0000-0000-0000-000000000001');
INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,is_public,created_by) VALUES
 ('24200000-0000-0000-0000-000000000001','24100000-0000-0000-0000-000000000001','M24 Tournament','m24','LEAGUE','AUCTION',true,'24000000-0000-0000-0000-000000000001');
INSERT INTO public.tournament_members(tournament_id,user_id,role) VALUES
 ('24200000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000001','ORGANIZER'),
 ('24200000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002','TEAM_OWNER');
INSERT INTO public.tournament_settings(tournament_id,max_squad_size,icon_selection_method,setter_selection_method) VALUES
 ('24200000-0000-0000-0000-000000000001',3,'LOT_DRAW','LOT_DRAW');
INSERT INTO public.teams(id,tournament_id,name,status) VALUES
 ('24300000-0000-0000-0000-000000000001','24200000-0000-0000-0000-000000000001','A','ACTIVE'),
 ('24300000-0000-0000-0000-000000000002','24200000-0000-0000-0000-000000000001','B','ACTIVE');
INSERT INTO public.team_owners(team_id,user_id,is_primary,status) VALUES
 ('24300000-0000-0000-0000-000000000001','24000000-0000-0000-0000-000000000002',true,'ACTIVE');
INSERT INTO public.player_profiles(id,display_name,primary_position) VALUES
 ('24400000-0000-0000-0000-000000000001','Hidden 1','SETTER'),
 ('24400000-0000-0000-0000-000000000002','Hidden 2','SETTER'),
 ('24400000-0000-0000-0000-000000000003','Hidden 3','SETTER'),
 ('24400000-0000-0000-0000-000000000004','Hidden 4','SETTER'),
 ('24400000-0000-0000-0000-000000000005','Hidden 5','SETTER'),
 ('24400000-0000-0000-0000-000000000006','Setter Safe','SETTER');
INSERT INTO public.player_tournament_registrations(tournament_id,player_id,status,auction_category)
SELECT '24200000-0000-0000-0000-000000000001',id,'APPROVED','ICON_LOT' FROM public.player_profiles WHERE id::text LIKE '24400000-0000-0000-0000-00000000000_' AND id<>'24400000-0000-0000-0000-000000000006';
INSERT INTO public.player_tournament_registrations(tournament_id,player_id,status,auction_category) VALUES
 ('24200000-0000-0000-0000-000000000001','24400000-0000-0000-0000-000000000006','APPROVED','SETTER_LOT');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','24000000-0000-0000-0000-000000000001',true);

DO $$
DECLARE s uuid; setter_s uuid; first_turn uuid; second_turn uuid; first_card integer; result1 jsonb; result2 jsonb; i integer;
BEGIN
  s := public.prepare_lot_session('24200000-0000-0000-0000-000000000001','ICON',ARRAY['24300000-0000-0000-0000-000000000001'::uuid,'24300000-0000-0000-0000-000000000002'::uuid]);
  IF (SELECT count(*) FROM public.lot_turns WHERE lot_session_id=s)<>5 THEN RAISE EXCEPTION 'turn count'; END IF;
  IF (SELECT array_agg(round_number ORDER BY turn_order) FROM public.lot_turns WHERE lot_session_id=s)<>ARRAY[1,1,2,2,3] THEN RAISE EXCEPTION 'rounds'; END IF;
  IF (SELECT array_agg(team_id ORDER BY turn_order) FROM public.lot_turns WHERE lot_session_id=s)<>ARRAY['24300000-0000-0000-0000-000000000001'::uuid,'24300000-0000-0000-0000-000000000002'::uuid,'24300000-0000-0000-0000-000000000001'::uuid,'24300000-0000-0000-0000-000000000002'::uuid,'24300000-0000-0000-0000-000000000001'::uuid] THEN RAISE EXCEPTION 'round robin'; END IF;
  BEGIN PERFORM public.prepare_lot_session('24200000-0000-0000-0000-000000000001','ICON',ARRAY['24300000-0000-0000-0000-000000000001'::uuid]); RAISE EXCEPTION 'duplicate operational accepted'; EXCEPTION WHEN unique_violation THEN NULL; WHEN OTHERS THEN IF SQLERRM='duplicate operational accepted' THEN RAISE; END IF; END;
  PERFORM public.shuffle_lot_session(s);
  IF (SELECT count(*) FROM public.lot_entries WHERE lot_session_id=s)<>0 THEN RAISE EXCEPTION 'organizer raw mapping leaked'; END IF;
  IF public.get_lot_organizer_state(s)::text LIKE '%Hidden %' OR public.get_lot_public_state(s)::text LIKE '%Hidden %' THEN RAISE EXCEPTION 'snapshot leaked'; END IF;
  BEGIN PERFORM public.shuffle_lot_session(s); RAISE EXCEPTION 'reshuffle accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='reshuffle accepted' THEN RAISE; END IF; END;
  PERFORM public.start_lot_session(s);
  SELECT id INTO first_turn FROM public.lot_turns WHERE lot_session_id=s AND status='ACTIVE';
  SELECT min(lot_number) INTO first_card FROM public.public_revealed_lot_state WHERE lot_session_id=s AND status='AVAILABLE';
  result1:=public.select_lot(s,first_card,first_turn,'request-one');
  result2:=public.select_lot(s,first_card,first_turn,'request-one');
  IF result2->>'idempotent'<>'true' OR result1->'player'->>'id'<>result2->'player'->>'id' THEN RAISE EXCEPTION 'idempotency'; END IF;
  IF (SELECT count(*) FROM public.team_players WHERE tournament_id='24200000-0000-0000-0000-000000000001')<>1 THEN RAISE EXCEPTION 'duplicate assignment'; END IF;
  BEGIN PERFORM public.select_lot(s,(SELECT min(lot_number) FROM public.public_revealed_lot_state WHERE lot_session_id=s),first_turn,'stale'); RAISE EXCEPTION 'stale accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='stale accepted' THEN RAISE; END IF; END;
  BEGIN PERFORM public.cancel_lot_session(s,'no'); RAISE EXCEPTION 'post-selection cancel accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='post-selection cancel accepted' THEN RAISE; END IF; END;
  FOR i IN 2..5 LOOP
    SELECT id INTO second_turn FROM public.lot_turns WHERE lot_session_id=s AND status='ACTIVE';
    SELECT min(lot_number) INTO first_card FROM public.public_revealed_lot_state WHERE lot_session_id=s AND status='AVAILABLE';
    PERFORM public.select_lot(s,first_card,second_turn,'request-'||i);
  END LOOP;
  IF (SELECT status FROM public.lot_sessions WHERE id=s)<>'COMPLETED' OR EXISTS(SELECT 1 FROM public.lot_turns WHERE lot_session_id=s AND status='ACTIVE') THEN RAISE EXCEPTION 'completion'; END IF;
  IF (SELECT count(*) FROM public.audit_logs WHERE entity_id=s AND action IN ('LOT_SESSION_PREPARED','LOT_SHUFFLED','LOT_STARTED','LOT_COMPLETED'))<>4 THEN RAISE EXCEPTION 'audit'; END IF;
  setter_s:=public.prepare_lot_session('24200000-0000-0000-0000-000000000001','SETTER',ARRAY['24300000-0000-0000-0000-000000000002'::uuid]);
  PERFORM public.cancel_lot_session(setter_s,'restart safely');
  IF (SELECT status FROM public.lot_sessions WHERE id=setter_s)<>'CANCELLED' THEN RAISE EXCEPTION 'cancel'; END IF;
END $$;

SELECT public.prepare_lot_session('24200000-0000-0000-0000-000000000001','SETTER',ARRAY['24300000-0000-0000-0000-000000000002'::uuid]);
SELECT public.shuffle_lot_session((SELECT id FROM public.lot_sessions WHERE tournament_id='24200000-0000-0000-0000-000000000001' AND lot_type='SETTER' AND status='PREPARING'));
DO $$ BEGIN IF (SELECT count(*) FROM public.lot_entries WHERE status='AVAILABLE')<>0 THEN RAISE EXCEPTION 'organizer raw mapping'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','24000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.lot_entries WHERE status='AVAILABLE')<>0 THEN RAISE EXCEPTION 'owner raw mapping'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','24000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN IF (SELECT count(*) FROM public.lot_entries WHERE status='AVAILABLE')<>0 THEN RAISE EXCEPTION 'player raw mapping'; END IF; END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN IF (SELECT count(*) FROM public.lot_entries WHERE status='AVAILABLE')<>0 THEN RAISE EXCEPTION 'anon raw mapping'; END IF; END $$;

RESET ROLE;
DO $$ BEGIN
  IF has_table_privilege('authenticated','public.lot_entries','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.lot_sessions','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.lot_turns','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'direct mutation privilege'; END IF;
  IF has_function_privilege('anon','public.select_lot(uuid,integer,uuid,text)','EXECUTE') OR has_function_privilege('anon','public.prepare_lot_session(uuid,text,uuid[])','EXECUTE') THEN RAISE EXCEPTION 'anon mutation execute'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('prepare_lot_session','shuffle_lot_session','start_lot_session','select_lot','cancel_lot_session','get_lot_organizer_state','get_lot_public_state') AND NOT p.prosecdef) THEN RAISE EXCEPTION 'security definer'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('prepare_lot_session','shuffle_lot_session','start_lot_session','select_lot','cancel_lot_session','get_lot_organizer_state','get_lot_public_state') AND NOT p.proconfig @> ARRAY['search_path=pg_catalog, public']) THEN RAISE EXCEPTION 'search path'; END IF;
END $$;

ROLLBACK;
