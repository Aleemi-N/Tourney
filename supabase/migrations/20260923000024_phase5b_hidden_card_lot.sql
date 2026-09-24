-- Phase 5B: secure hidden-card Icon and Setter lot foundation.

ALTER TABLE public.lot_turns DROP CONSTRAINT lot_turns_lot_session_id_team_id_key;
ALTER TABLE public.lot_turns
  ADD COLUMN round_number integer NOT NULL DEFAULT 1 CHECK (round_number > 0),
  ADD COLUMN selection_request_key text;

CREATE UNIQUE INDEX lot_turns_one_active_per_session
  ON public.lot_turns (lot_session_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX lot_turns_request_key_unique
  ON public.lot_turns (lot_session_id, selection_request_key)
  WHERE selection_request_key IS NOT NULL;
CREATE UNIQUE INDEX lot_sessions_one_operational_per_type
  ON public.lot_sessions (tournament_id, lot_type)
  WHERE status IN ('PREPARING', 'SHUFFLED', 'LIVE');

CREATE TABLE public.lot_public_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_session_id uuid NOT NULL REFERENCES public.lot_sessions(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  sequence_number bigint NOT NULL CHECK (sequence_number > 0),
  event_type text NOT NULL CHECK (event_type IN ('PREPARED','SHUFFLED','STARTED','PLAYER_SELECTED','COMPLETED','CANCELLED')),
  lot_type text NOT NULL CHECK (lot_type IN ('ICON','SETTER')),
  session_status text NOT NULL CHECK (session_status IN ('PREPARING','SHUFFLED','LIVE','COMPLETED','CANCELLED')),
  card_number integer CHECK (card_number IS NULL OR card_number > 0),
  turn_id uuid,
  team_id uuid REFERENCES public.teams(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lot_session_id, sequence_number)
);
ALTER TABLE public.lot_public_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX lot_public_events_session_sequence ON public.lot_public_events (lot_session_id, sequence_number);
CREATE POLICY "Public can read public lot events" ON public.lot_public_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.is_public)
  OR public.is_tournament_member(tournament_id)
);

DROP POLICY IF EXISTS "Organizers can read lot entries" ON public.lot_entries;
DROP POLICY IF EXISTS "Organizers can manage lot sessions" ON public.lot_sessions;
DROP POLICY IF EXISTS "Organizers can manage lot turns" ON public.lot_turns;
REVOKE INSERT, UPDATE, DELETE ON public.lot_sessions, public.lot_entries, public.lot_turns, public.lot_public_events FROM authenticated, anon;
GRANT SELECT ON public.lot_public_events TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_lot_turn_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid;
BEGIN
  SELECT tournament_id INTO v_tournament FROM public.lot_sessions WHERE id = NEW.lot_session_id;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = NEW.team_id AND tournament_id = v_tournament AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Lot turn team must be active and belong to the session tournament';
  END IF;
  IF NEW.selected_entry_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lot_entries WHERE id = NEW.selected_entry_id AND lot_session_id = NEW.lot_session_id
  ) THEN RAISE EXCEPTION 'Selected entry must belong to the same lot session'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lot_turn_integrity_guard BEFORE INSERT OR UPDATE OF lot_session_id, team_id, selected_entry_id
ON public.lot_turns FOR EACH ROW EXECUTE FUNCTION public.enforce_lot_turn_integrity();

CREATE OR REPLACE FUNCTION public.protect_lot_mapping()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.lot_sessions WHERE id = COALESCE(NEW.lot_session_id, OLD.lot_session_id);
  IF v_status <> 'PREPARING' THEN RAISE EXCEPTION 'Shuffled lot mapping is immutable'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER lot_mapping_immutable_guard
BEFORE UPDATE OF player_id, lot_number OR DELETE ON public.lot_entries
FOR EACH ROW EXECUTE FUNCTION public.protect_lot_mapping();

CREATE OR REPLACE FUNCTION public.emit_lot_event(
  p_session_id uuid, p_event_type text, p_status text, p_card integer DEFAULT NULL,
  p_turn uuid DEFAULT NULL, p_team uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_type text; v_sequence bigint;
BEGIN
  SELECT tournament_id, lot_type INTO v_tournament, v_type FROM public.lot_sessions WHERE id = p_session_id;
  SELECT COALESCE(max(sequence_number),0)+1 INTO v_sequence FROM public.lot_public_events WHERE lot_session_id = p_session_id;
  INSERT INTO public.lot_public_events(lot_session_id,tournament_id,sequence_number,event_type,lot_type,session_status,card_number,turn_id,team_id,payload)
  VALUES(p_session_id,v_tournament,v_sequence,p_event_type,v_type,p_status,p_card,p_turn,p_team,COALESCE(p_payload,'{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.emit_lot_event(uuid,text,text,integer,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_lot_session(p_tournament_id uuid, p_lot_type text, p_team_order uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_session uuid; v_user uuid := auth.uid(); v_format text; v_mode text; v_method text;
  v_player_count integer; v_turn_count integer := 0; v_round integer := 1; v_progress integer; v_team uuid;
  v_max integer; v_existing integer; v_capacity integer; v_order integer := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT t.format,t.league_mode,CASE p_lot_type WHEN 'ICON' THEN s.icon_selection_method WHEN 'SETTER' THEN s.setter_selection_method END
  INTO v_format,v_mode,v_method FROM public.tournaments t JOIN public.tournament_settings s ON s.tournament_id=t.id WHERE t.id=p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_format <> 'LEAGUE' OR v_mode <> 'AUCTION' THEN RAISE EXCEPTION 'Lot Draw requires an Auction League'; END IF;
  IF p_lot_type NOT IN ('ICON','SETTER') THEN RAISE EXCEPTION 'Invalid lot type'; END IF;
  IF v_method <> 'LOT_DRAW' THEN RAISE EXCEPTION '% selection method is not LOT_DRAW', p_lot_type; END IF;
  IF p_team_order IS NULL OR cardinality(p_team_order)=0 OR cardinality(p_team_order)<>(SELECT count(DISTINCT x) FROM unnest(p_team_order) x) THEN RAISE EXCEPTION 'A non-empty unique team order is required'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_team_order) x LEFT JOIN public.teams t ON t.id=x AND t.tournament_id=p_tournament_id AND t.status='ACTIVE' WHERE t.id IS NULL) THEN RAISE EXCEPTION 'Every team must be active and belong to the tournament'; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_sessions WHERE tournament_id=p_tournament_id AND lot_type=p_lot_type AND status IN ('PREPARING','SHUFFLED','LIVE')) THEN RAISE EXCEPTION 'An operational lot session already exists'; END IF;
  SELECT count(*) INTO v_player_count FROM public.player_tournament_registrations r JOIN public.player_profiles p ON p.id=r.player_id
  WHERE r.tournament_id=p_tournament_id AND r.status='APPROVED' AND r.auction_category=p_lot_type||'_LOT'
    AND NOT EXISTS (SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=p_tournament_id AND tp.player_id=r.player_id AND tp.status='ACTIVE')
    AND NOT EXISTS (SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=p_tournament_id AND ap.player_id=r.player_id)
    AND NOT EXISTS (SELECT 1 FROM public.lot_entries le JOIN public.lot_sessions ls ON ls.id=le.lot_session_id WHERE ls.tournament_id=p_tournament_id AND ls.status<>'CANCELLED' AND le.player_id=r.player_id);
  IF v_player_count=0 THEN RAISE EXCEPTION 'Eligible player pool is empty'; END IF;
  SELECT max_squad_size INTO v_max FROM public.tournament_settings WHERE tournament_id=p_tournament_id;
  SELECT COALESCE(sum(CASE WHEN v_max IS NULL THEN v_player_count ELSE GREATEST(v_max-roster,0) END),0) INTO v_capacity
  FROM (SELECT x AS team_id,(SELECT count(*) FROM public.team_players tp WHERE tp.team_id=x AND tp.status='ACTIVE') roster FROM unnest(p_team_order) x) q;
  IF v_capacity < v_player_count THEN RAISE EXCEPTION 'Participating teams do not have enough squad capacity'; END IF;
  INSERT INTO public.lot_sessions(tournament_id,lot_type,status,created_by) VALUES(p_tournament_id,p_lot_type,'PREPARING',v_user) RETURNING id INTO v_session;
  WHILE v_turn_count < v_player_count LOOP
    v_progress := 0;
    FOREACH v_team IN ARRAY p_team_order LOOP
      EXIT WHEN v_turn_count >= v_player_count;
      SELECT count(*) INTO v_existing FROM public.team_players WHERE team_id=v_team AND status='ACTIVE';
      IF v_max IS NULL OR v_existing+(SELECT count(*) FROM public.lot_turns WHERE lot_session_id=v_session AND team_id=v_team) < v_max THEN
        v_order:=v_order+1; v_turn_count:=v_turn_count+1; v_progress:=v_progress+1;
        INSERT INTO public.lot_turns(lot_session_id,team_id,turn_order,round_number) VALUES(v_session,v_team,v_order,v_round);
      END IF;
    END LOOP;
    IF v_progress=0 THEN RAISE EXCEPTION 'Unable to generate capacity-safe turns'; END IF;
    v_round:=v_round+1;
  END LOOP;
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json)
  VALUES(p_tournament_id,v_user,'LOT_SESSION_PREPARED','lot_sessions',v_session,jsonb_build_object('lot_type',p_lot_type,'team_order',p_team_order,'turn_count',v_turn_count));
  PERFORM public.emit_lot_event(v_session,'PREPARED','PREPARING',NULL,NULL,NULL,jsonb_build_object('turn_count',v_turn_count));
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.shuffle_lot_session(p_lot_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_status text; v_type text; v_method text; v_players integer; v_turns integer; v_max integer;
BEGIN
  SELECT tournament_id,status,lot_type INTO v_tournament,v_status,v_type FROM public.lot_sessions WHERE id=p_lot_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot session not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_status<>'PREPARING' THEN RAISE EXCEPTION 'Lot session must be PREPARING to shuffle'; END IF;
  IF EXISTS (SELECT 1 FROM public.lot_entries WHERE lot_session_id=p_lot_session_id) THEN RAISE EXCEPTION 'Lot mapping already exists'; END IF;
  SELECT CASE v_type WHEN 'ICON' THEN icon_selection_method ELSE setter_selection_method END INTO v_method FROM public.tournament_settings WHERE tournament_id=v_tournament;
  IF v_method<>'LOT_DRAW' THEN RAISE EXCEPTION 'Selection method is not LOT_DRAW'; END IF;
  SELECT count(*) INTO v_players FROM public.player_tournament_registrations r JOIN public.player_profiles p ON p.id=r.player_id
  WHERE r.tournament_id=v_tournament AND r.status='APPROVED' AND r.auction_category=v_type||'_LOT'
   AND NOT EXISTS (SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=v_tournament AND tp.player_id=r.player_id AND tp.status='ACTIVE')
   AND NOT EXISTS (SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=v_tournament AND ap.player_id=r.player_id);
  SELECT count(*) INTO v_turns FROM public.lot_turns lt JOIN public.teams t ON t.id=lt.team_id AND t.tournament_id=v_tournament AND t.status='ACTIVE' WHERE lt.lot_session_id=p_lot_session_id;
  IF v_players=0 OR v_turns<>v_players THEN RAISE EXCEPTION 'Prepared pool and turn count are invalid'; END IF;
  SELECT max_squad_size INTO v_max FROM public.tournament_settings WHERE tournament_id=v_tournament;
  IF v_max IS NOT NULL AND EXISTS(SELECT 1 FROM public.lot_turns lt WHERE lt.lot_session_id=p_lot_session_id GROUP BY lt.team_id HAVING count(*)+(SELECT count(*) FROM public.team_players tp WHERE tp.team_id=lt.team_id AND tp.status='ACTIVE')>v_max) THEN RAISE EXCEPTION 'Prepared teams no longer have enough squad capacity'; END IF;
  INSERT INTO public.lot_entries(lot_session_id,lot_number,player_id,status)
  SELECT p_lot_session_id,row_number() OVER (ORDER BY gen_random_uuid()),r.player_id,'AVAILABLE'
  FROM public.player_tournament_registrations r JOIN public.player_profiles p ON p.id=r.player_id
  WHERE r.tournament_id=v_tournament AND r.status='APPROVED' AND r.auction_category=v_type||'_LOT'
   AND NOT EXISTS (SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=v_tournament AND tp.player_id=r.player_id AND tp.status='ACTIVE')
   AND NOT EXISTS (SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=v_tournament AND ap.player_id=r.player_id);
  UPDATE public.lot_sessions SET status='SHUFFLED',shuffled_at=now(),locked_at=now() WHERE id=p_lot_session_id;
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(v_tournament,auth.uid(),'LOT_SHUFFLED','lot_sessions',p_lot_session_id,jsonb_build_object('lot_type',v_type,'card_count',v_players));
  PERFORM public.emit_lot_event(p_lot_session_id,'SHUFFLED','SHUFFLED',NULL,NULL,NULL,jsonb_build_object('card_count',v_players));
END;
$$;

CREATE OR REPLACE FUNCTION public.start_lot_session(p_lot_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_status text; v_type text; v_method text; v_entries integer; v_turns integer; v_first uuid; v_team uuid; v_max integer;
BEGIN
  SELECT tournament_id,status,lot_type INTO v_tournament,v_status,v_type FROM public.lot_sessions WHERE id=p_lot_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot session not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_status<>'SHUFFLED' THEN RAISE EXCEPTION 'Session must be SHUFFLED to start'; END IF;
  SELECT CASE v_type WHEN 'ICON' THEN icon_selection_method ELSE setter_selection_method END INTO v_method FROM public.tournament_settings WHERE tournament_id=v_tournament;
  IF v_method<>'LOT_DRAW' THEN RAISE EXCEPTION 'Selection method is not LOT_DRAW'; END IF;
  SELECT count(*) INTO v_entries FROM public.lot_entries le JOIN public.player_tournament_registrations r ON r.player_id=le.player_id AND r.tournament_id=v_tournament AND r.status='APPROVED' AND r.auction_category=v_type||'_LOT'
  WHERE le.lot_session_id=p_lot_session_id AND le.status='AVAILABLE'
   AND NOT EXISTS(SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=v_tournament AND tp.player_id=le.player_id AND tp.status='ACTIVE')
   AND NOT EXISTS(SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=v_tournament AND ap.player_id=le.player_id);
  SELECT count(*) INTO v_turns FROM public.lot_turns lt JOIN public.teams t ON t.id=lt.team_id AND t.tournament_id=v_tournament AND t.status='ACTIVE' WHERE lt.lot_session_id=p_lot_session_id AND lt.status='WAITING';
  IF v_entries=0 OR v_entries<>v_turns OR v_entries<>(SELECT count(*) FROM public.lot_entries WHERE lot_session_id=p_lot_session_id) THEN RAISE EXCEPTION 'Shuffled pool or turns are no longer valid'; END IF;
  SELECT max_squad_size INTO v_max FROM public.tournament_settings WHERE tournament_id=v_tournament;
  IF v_max IS NOT NULL AND EXISTS(SELECT 1 FROM public.lot_turns lt WHERE lt.lot_session_id=p_lot_session_id AND lt.status='WAITING' GROUP BY lt.team_id HAVING count(*)+(SELECT count(*) FROM public.team_players tp WHERE tp.team_id=lt.team_id AND tp.status='ACTIVE')>v_max) THEN RAISE EXCEPTION 'Prepared teams no longer have enough squad capacity'; END IF;
  SELECT id,team_id INTO v_first,v_team FROM public.lot_turns WHERE lot_session_id=p_lot_session_id AND turn_order=1 FOR UPDATE;
  IF v_first IS NULL THEN RAISE EXCEPTION 'First turn is missing'; END IF;
  UPDATE public.lot_sessions SET status='LIVE' WHERE id=p_lot_session_id;
  UPDATE public.lot_turns SET status='ACTIVE',started_at=now() WHERE id=v_first;
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,before_json,after_json) VALUES(v_tournament,auth.uid(),'LOT_STARTED','lot_sessions',p_lot_session_id,jsonb_build_object('status','SHUFFLED'),jsonb_build_object('status','LIVE','turn_id',v_first));
  PERFORM public.emit_lot_event(p_lot_session_id,'STARTED','LIVE',NULL,v_first,v_team,'{}');
END;
$$;

DROP FUNCTION IF EXISTS public.select_lot(uuid,integer,uuid);
CREATE OR REPLACE FUNCTION public.select_lot(p_lot_session_id uuid,p_lot_number integer,p_expected_turn_id uuid,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_status text; v_type text; v_method text; v_turn public.lot_turns%ROWTYPE; v_entry public.lot_entries%ROWTYPE; v_next uuid; v_next_team uuid; v_max integer; v_roster integer; v_result jsonb;
BEGIN
  IF nullif(btrim(p_request_key),'') IS NULL THEN RAISE EXCEPTION 'Request key is required'; END IF;
  SELECT tournament_id,status,lot_type INTO v_tournament,v_status,v_type FROM public.lot_sessions WHERE id=p_lot_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot session not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_turn FROM public.lot_turns WHERE lot_session_id=p_lot_session_id AND selection_request_key=p_request_key;
  IF FOUND THEN
    SELECT jsonb_build_object('session_id',p_lot_session_id,'turn_id',v_turn.id,'card_number',le.lot_number,'team_id',v_turn.team_id,'player',jsonb_build_object('id',p.id,'display_name',p.display_name,'photo_path',p.photo_path,'primary_position',p.primary_position,'secondary_position',p.secondary_position),'idempotent',true)
    INTO v_result FROM public.lot_entries le JOIN public.player_profiles p ON p.id=le.player_id WHERE le.id=v_turn.selected_entry_id;
    RETURN v_result;
  END IF;
  IF v_status<>'LIVE' THEN RAISE EXCEPTION 'Lot session is not LIVE'; END IF;
  SELECT CASE v_type WHEN 'ICON' THEN icon_selection_method ELSE setter_selection_method END INTO v_method FROM public.tournament_settings WHERE tournament_id=v_tournament;
  IF v_method<>'LOT_DRAW' THEN RAISE EXCEPTION 'Selection method is not LOT_DRAW'; END IF;
  SELECT * INTO v_turn FROM public.lot_turns WHERE lot_session_id=p_lot_session_id AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND OR v_turn.id<>p_expected_turn_id THEN RAISE EXCEPTION 'Expected turn is stale'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.teams WHERE id=v_turn.team_id AND tournament_id=v_tournament AND status='ACTIVE') THEN RAISE EXCEPTION 'Current team is invalid'; END IF;
  SELECT * INTO v_entry FROM public.lot_entries WHERE lot_session_id=p_lot_session_id AND lot_number=p_lot_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF v_entry.status<>'AVAILABLE' THEN RAISE EXCEPTION 'Card is already selected'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.player_tournament_registrations r WHERE r.tournament_id=v_tournament AND r.player_id=v_entry.player_id AND r.status='APPROVED' AND r.auction_category=v_type||'_LOT')
    OR EXISTS(SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=v_tournament AND tp.player_id=v_entry.player_id AND tp.status='ACTIVE')
    OR EXISTS(SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=v_tournament AND ap.player_id=v_entry.player_id)
  THEN RAISE EXCEPTION 'Selected player is no longer eligible'; END IF;
  SELECT max_squad_size INTO v_max FROM public.tournament_settings WHERE tournament_id=v_tournament;
  SELECT count(*) INTO v_roster FROM public.team_players WHERE team_id=v_turn.team_id AND status='ACTIVE';
  IF v_max IS NOT NULL AND v_roster>=v_max THEN RAISE EXCEPTION 'Maximum squad size reached'; END IF;
  INSERT INTO public.team_players(tournament_id,team_id,player_id,acquisition_type,status) VALUES(v_tournament,v_turn.team_id,v_entry.player_id,v_type||'_LOT','ACTIVE');
  UPDATE public.lot_entries SET status='SELECTED',selected_by_team_id=v_turn.team_id,selected_at=now() WHERE id=v_entry.id;
  UPDATE public.lot_turns SET status='COMPLETED',selected_entry_id=v_entry.id,selection_request_key=p_request_key,completed_at=now() WHERE id=v_turn.id;
  SELECT id,team_id INTO v_next,v_next_team FROM public.lot_turns WHERE lot_session_id=p_lot_session_id AND turn_order=v_turn.turn_order+1 FOR UPDATE;
  IF v_next IS NULL THEN
    UPDATE public.lot_sessions SET status='COMPLETED' WHERE id=p_lot_session_id;
  ELSE UPDATE public.lot_turns SET status='ACTIVE',started_at=now() WHERE id=v_next; END IF;
  SELECT jsonb_build_object('session_id',p_lot_session_id,'turn_id',v_turn.id,'card_number',p_lot_number,'team_id',v_turn.team_id,'player',jsonb_build_object('id',p.id,'display_name',p.display_name,'photo_path',p.photo_path,'primary_position',p.primary_position,'secondary_position',p.secondary_position),'idempotent',false)
  INTO v_result FROM public.player_profiles p WHERE p.id=v_entry.player_id;
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(v_tournament,auth.uid(),'LOT_PLAYER_SELECTED','lot_entries',v_entry.id,jsonb_build_object('session_id',p_lot_session_id,'turn_id',v_turn.id,'card_number',p_lot_number,'team_id',v_turn.team_id,'player_id',v_entry.player_id));
  PERFORM public.emit_lot_event(p_lot_session_id,'PLAYER_SELECTED',CASE WHEN v_next IS NULL THEN 'COMPLETED' ELSE 'LIVE' END,p_lot_number,v_turn.id,v_turn.team_id,v_result-'idempotent');
  IF v_next IS NULL THEN
    INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,before_json,after_json) VALUES(v_tournament,auth.uid(),'LOT_COMPLETED','lot_sessions',p_lot_session_id,jsonb_build_object('status','LIVE'),jsonb_build_object('status','COMPLETED'));
    PERFORM public.emit_lot_event(p_lot_session_id,'COMPLETED','COMPLETED');
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_lot_session(p_lot_session_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_status text; v_type text;
BEGIN
  SELECT tournament_id,status,lot_type INTO v_tournament,v_status,v_type FROM public.lot_sessions WHERE id=p_lot_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lot session not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_status NOT IN ('PREPARING','SHUFFLED','LIVE') THEN RAISE EXCEPTION 'Session cannot be cancelled from status %',v_status; END IF;
  IF EXISTS(SELECT 1 FROM public.lot_entries WHERE lot_session_id=p_lot_session_id AND status='SELECTED') THEN RAISE EXCEPTION 'A session with selections cannot be cancelled'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason is required'; END IF;
  UPDATE public.lot_sessions SET status='CANCELLED',cancelled_by=auth.uid(),cancellation_reason=btrim(p_reason) WHERE id=p_lot_session_id;
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES(v_tournament,auth.uid(),'LOT_CANCELLED','lot_sessions',p_lot_session_id,jsonb_build_object('status',v_status),jsonb_build_object('status','CANCELLED','lot_type',v_type),btrim(p_reason));
  PERFORM public.emit_lot_event(p_lot_session_id,'CANCELLED','CANCELLED',NULL,NULL,NULL,jsonb_build_object('reason',btrim(p_reason)));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lot_organizer_state(p_lot_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_session public.lot_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM public.lot_sessions WHERE id=p_lot_session_id;
  IF v_session.id IS NULL OR auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_session.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN jsonb_build_object('session',to_jsonb(v_session),'turns',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY turn_order) FROM public.lot_turns t WHERE t.lot_session_id=p_lot_session_id),'[]'::jsonb),'eligible_players',CASE WHEN v_session.status='PREPARING' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'photo_path',p.photo_path,'primary_position',p.primary_position,'secondary_position',p.secondary_position) ORDER BY p.display_name) FROM public.player_tournament_registrations r JOIN public.player_profiles p ON p.id=r.player_id WHERE r.tournament_id=v_session.tournament_id AND r.status='APPROVED' AND r.auction_category=v_session.lot_type||'_LOT' AND NOT EXISTS(SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=v_session.tournament_id AND tp.player_id=r.player_id AND tp.status='ACTIVE') AND NOT EXISTS(SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=v_session.tournament_id AND ap.player_id=r.player_id)),'[]'::jsonb) ELSE '[]'::jsonb END,'cards',COALESCE((SELECT jsonb_agg(jsonb_build_object('lot_number',e.lot_number,'status',e.status,'selected_by_team_id',e.selected_by_team_id,'selected_at',e.selected_at,'player',CASE WHEN e.status='SELECTED' THEN jsonb_build_object('id',p.id,'display_name',p.display_name,'photo_path',p.photo_path,'primary_position',p.primary_position,'secondary_position',p.secondary_position) ELSE NULL END) ORDER BY e.lot_number) FROM public.lot_entries e JOIN public.player_profiles p ON p.id=e.player_id WHERE e.lot_session_id=p_lot_session_id),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lot_public_state(p_lot_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_session public.lot_sessions%ROWTYPE;
BEGIN
  SELECT s.* INTO v_session FROM public.lot_sessions s JOIN public.tournaments t ON t.id=s.tournament_id WHERE s.id=p_lot_session_id AND (t.is_public OR public.is_tournament_member(t.id));
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Lot session not available'; END IF;
  RETURN jsonb_build_object('session',jsonb_build_object('id',v_session.id,'tournament_id',v_session.tournament_id,'lot_type',v_session.lot_type,'status',v_session.status),'current_turn',(SELECT jsonb_build_object('id',lt.id,'turn_order',lt.turn_order,'round_number',lt.round_number,'team_id',lt.team_id) FROM public.lot_turns lt WHERE lt.lot_session_id=p_lot_session_id AND lt.status='ACTIVE'),'cards',COALESCE((SELECT jsonb_agg(jsonb_build_object('lot_number',e.lot_number,'status',e.status,'selected_by_team_id',e.selected_by_team_id,'selected_at',e.selected_at,'player',CASE WHEN e.status='SELECTED' THEN jsonb_build_object('id',p.id,'display_name',p.display_name,'photo_path',p.photo_path,'primary_position',p.primary_position,'secondary_position',p.secondary_position) ELSE NULL END) ORDER BY e.lot_number) FROM public.lot_entries e JOIN public.player_profiles p ON p.id=e.player_id WHERE e.lot_session_id=p_lot_session_id),'[]'::jsonb),'last_sequence',COALESCE((SELECT max(sequence_number) FROM public.lot_public_events WHERE lot_session_id=p_lot_session_id),0));
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_lot_session(uuid,text,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shuffle_lot_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_lot_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.select_lot(uuid,integer,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_lot_session(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_lot_organizer_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_lot_public_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_lot_session(uuid,text,uuid[]), public.shuffle_lot_session(uuid), public.start_lot_session(uuid), public.select_lot(uuid,integer,uuid,text), public.cancel_lot_session(uuid,text), public.get_lot_organizer_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lot_public_state(uuid) TO anon, authenticated;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lot_entries') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.lot_entries'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lot_public_events') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lot_public_events'; END IF;
  END IF;
END $$;
