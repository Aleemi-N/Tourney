-- 20261004000055_fix_auction_public_state_and_permissions.sql
-- 1. Fix get_auction_public_state highest_bid & recent_bids filtering to current live player
-- 2. Include player_display_name in get_auction_organizer_state queue items
-- 3. Dynamic auction_team_finance RPC using starting purse from tournament settings
-- 4. Sync prepare_auction team wallet starting balances & manual assignment spent amounts
-- 5. Trigger to automatically sync auction_team_wallets when tournament_settings auction_starting_purse updates
-- 6. Direct backfill update to fix existing production auction_team_wallets starting balance
-- 7. Update set_auction_lifecycle to set tournament status to LIVE on auction start
-- 8. Restore execute permissions to anon for public spectator live views

-- Immediate backfill to resync all existing auction_team_wallets starting_balance to match tournament_settings auction_starting_purse
UPDATE public.auction_team_wallets w
SET starting_balance = s.auction_starting_purse,
    spent_amount = COALESCE((SELECT sum(tp.acquisition_amount) FROM public.team_players tp WHERE tp.tournament_id = a.tournament_id AND tp.team_id = w.team_id AND tp.status = 'ACTIVE'), 0),
    remaining_balance = s.auction_starting_purse - COALESCE((SELECT sum(tp.acquisition_amount) FROM public.team_players tp WHERE tp.tournament_id = a.tournament_id AND tp.team_id = w.team_id AND tp.status = 'ACTIVE'), 0),
    updated_at = now()
FROM public.auctions a
JOIN public.tournament_settings s ON s.tournament_id = a.tournament_id
WHERE a.id = w.auction_id;

-- Dynamic auction_team_finance RPC using starting purse from tournament settings
CREATE OR REPLACE FUNCTION public.auction_team_finance(p_auction_id uuid, p_team_id uuid, p_purchase numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_starting numeric; v_remaining numeric; v_spent numeric; v_min integer; v_max integer; v_floor numeric; v_squad integer; v_missing integer; v_reserve numeric; v_max_bid numeric;
BEGIN
  SELECT a.tournament_id, COALESCE(s.auction_starting_purse, w.starting_balance), w.spent_amount, s.min_squad_size, s.max_squad_size, a.minimum_acquisition_reserve_price
  INTO v_tournament, v_starting, v_spent, v_min, v_max, v_floor
  FROM public.auctions a 
  JOIN public.auction_team_wallets w ON w.auction_id=a.id AND w.team_id=p_team_id
  JOIN public.tournament_settings s ON s.tournament_id=a.tournament_id 
  WHERE a.id=p_auction_id;

  IF v_tournament IS NULL OR COALESCE(v_floor,0)<=0 THEN RAISE EXCEPTION 'Auction wallet/settings unavailable'; END IF;

  SELECT COALESCE(sum(tp.acquisition_amount), 0) INTO v_spent
  FROM public.team_players tp
  WHERE tp.tournament_id = v_tournament AND tp.team_id = p_team_id AND tp.status = 'ACTIVE';

  v_remaining := v_starting - v_spent;

  SELECT count(*) INTO v_squad FROM public.team_players WHERE tournament_id=v_tournament AND team_id=p_team_id AND status='ACTIVE';
  v_missing := greatest(v_min - (v_squad + CASE WHEN p_purchase > 0 THEN 1 ELSE 0 END), 0);
  v_reserve := v_missing * v_floor;
  v_max_bid := v_remaining - v_reserve;

  RETURN jsonb_build_object(
    'remaining', v_remaining,
    'spent', v_spent,
    'active_squad', v_squad,
    'minimum_squad', v_min,
    'maximum_squad', v_max,
    'reserve', v_reserve,
    'max_allowed_bid', v_max_bid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_auction_public_state(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  a public.auctions%ROWTYPE;
  v_live_player_id uuid;
BEGIN
  SELECT x.* INTO a 
  FROM public.auctions x 
  JOIN public.tournaments t ON t.id = x.tournament_id 
  WHERE x.id = p_auction_id AND (t.is_public OR public.is_tournament_member(t.id));

  IF a.id IS NULL THEN 
    RAISE EXCEPTION 'Auction not available'; 
  END IF;

  -- Get current live auction player ID
  SELECT id INTO v_live_player_id 
  FROM public.auction_players 
  WHERE auction_id = a.id AND status = 'LIVE' 
  LIMIT 1;

  RETURN jsonb_build_object(
    'auction', jsonb_build_object(
      'id', a.id,
      'tournament_id', a.tournament_id,
      'status', a.status,
      'state_version', a.state_version
    ),
    'current_player', (
      SELECT jsonb_build_object(
        'auction_player_id', ap.id,
        'base_price', ap.base_price,
        'category_code', ap.category_code,
        'category_label', ap.category_label,
        'category_base_price', ap.category_base_price,
        'attempt_number', ap.attempt_number,
        'auction_order', ap.auction_order,
        'state_version', ap.state_version,
        'player', jsonb_build_object(
          'id', p.id,
          'display_name', p.display_name,
          'photo_path', p.photo_path,
          'primary_position', p.primary_position,
          'secondary_position', p.secondary_position,
          'phone', p.phone
        )
      )
      FROM public.auction_players ap
      JOIN public.player_profiles p ON p.id = ap.player_id
      WHERE ap.id = v_live_player_id
    ),
    'highest_bid', (
      CASE WHEN v_live_player_id IS NOT NULL THEN (
        SELECT jsonb_build_object(
          'id', b.id,
          'amount', b.amount,
          'team', jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name, 'logo_path', t.logo_path)
        )
        FROM public.auction_bids b
        JOIN public.teams t ON t.id = b.team_id
        WHERE b.auction_player_id = v_live_player_id
        ORDER BY b.amount DESC, b.created_at, b.id LIMIT 1
      ) ELSE NULL END
    ),
    'recent_bids', COALESCE((
      CASE WHEN v_live_player_id IS NOT NULL THEN (
        SELECT jsonb_agg(x.item ORDER BY x.created_at DESC)
        FROM (
          SELECT b.created_at, jsonb_build_object(
            'id', b.id,
            'amount', b.amount,
            'created_at', b.created_at,
            'team', jsonb_build_object('id', t.id, 'name', t.name, 'short_name', t.short_name, 'logo_path', t.logo_path)
          ) item
          FROM public.auction_bids b
          JOIN public.teams t ON t.id = b.team_id
          WHERE b.auction_player_id = v_live_player_id
          ORDER BY b.created_at DESC LIMIT 20
        ) x
      ) ELSE NULL END
    ), '[]'::jsonb),
    'progress', (
      SELECT jsonb_build_object(
        'waiting', count(*) FILTER (WHERE status = 'WAITING'),
        'sold', count(*) FILTER (WHERE status = 'SOLD'),
        'unsold', count(*) FILTER (WHERE status = 'UNSOLD')
      )
      FROM public.auction_players WHERE auction_id = a.id
    ),
    'last_sequence', a.event_sequence
  );
END;
$$;

-- Enrich get_auction_organizer_state queue with player_display_name and updated team finance
CREATE OR REPLACE FUNCTION public.get_auction_organizer_state(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; pub jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  pub:=public.get_auction_public_state(p_auction_id);
  RETURN pub||jsonb_build_object(
    'minimum_acquisition_reserve_price',a.minimum_acquisition_reserve_price,
    'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',c.category_code,'display_name',c.display_name,'base_price',c.base_price,'display_order',c.display_order) ORDER BY c.display_order) FROM public.tournament_auction_categories c WHERE c.tournament_id=a.tournament_id),'[]'::jsonb),
    'readiness',public.get_auction_readiness(a.tournament_id),
    'queue',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'auction_player_id',ap.id,
        'player_id',ap.player_id,
        'player_display_name',p.display_name,
        'status',ap.status,
        'base_price',ap.base_price,
        'category_code',ap.category_code,
        'category_label',ap.category_label,
        'category_base_price',ap.category_base_price,
        'attempt_number',ap.attempt_number,
        'auction_order',ap.auction_order,
        'state_version',ap.state_version
      ) ORDER BY ap.attempt_number,ap.auction_order)
      FROM public.auction_players ap
      JOIN public.player_profiles p ON p.id=ap.player_id
      WHERE ap.auction_id=a.id
    ),'[]'::jsonb),
    'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('team_id',w.team_id,'starting_purse',(public.auction_team_finance(a.id,w.team_id,1))->'starting','spent',(public.auction_team_finance(a.id,w.team_id,1))->'spent','remaining',(public.auction_team_finance(a.id,w.team_id,1))->'remaining','finance',public.auction_team_finance(a.id,w.team_id,1))) FROM public.auction_team_wallets w WHERE w.auction_id=a.id),'[]'::jsonb)
  );
END;
$$;

-- Prepare auction with updated team wallet calculations & starting purse sync
CREATE OR REPLACE FUNCTION public.prepare_auction(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_s public.tournament_settings%ROWTYPE; v_ready jsonb; v_auction uuid; v_count integer; v_reserve_floor numeric;
BEGIN
  IF NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tournament_id::text,25));
  SELECT * INTO v_s FROM public.tournament_settings WHERE tournament_id=p_tournament_id;
  SELECT min(base_price) INTO v_reserve_floor FROM public.tournament_auction_categories WHERE tournament_id=p_tournament_id;
  SELECT id INTO v_auction FROM public.auctions WHERE tournament_id=p_tournament_id FOR UPDATE;
  
  IF v_auction IS NOT NULL AND EXISTS(SELECT 1 FROM public.auctions WHERE id=v_auction AND prepared_at IS NOT NULL) THEN
    -- Sync team wallet starting balances if purse setting updated
    UPDATE public.auction_team_wallets w
    SET starting_balance = v_s.auction_starting_purse,
        spent_amount = COALESCE((SELECT sum(tp.acquisition_amount) FROM public.team_players tp WHERE tp.tournament_id = p_tournament_id AND tp.team_id = w.team_id AND tp.status = 'ACTIVE'), w.spent_amount),
        remaining_balance = v_s.auction_starting_purse - COALESCE((SELECT sum(tp.acquisition_amount) FROM public.team_players tp WHERE tp.tournament_id = p_tournament_id AND tp.team_id = w.team_id AND tp.status = 'ACTIVE'), w.spent_amount),
        updated_at = now()
    WHERE w.auction_id = v_auction;

    RETURN jsonb_build_object('auction_id',v_auction,'idempotent',true,'status',(SELECT status FROM public.auctions WHERE id=v_auction));
  END IF;

  IF v_auction IS NOT NULL AND (EXISTS(SELECT 1 FROM public.auction_team_wallets WHERE auction_id=v_auction) OR EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id=v_auction) OR EXISTS(SELECT 1 FROM public.auction_bids WHERE auction_id=v_auction)) THEN RAISE EXCEPTION 'Partial or legacy auction state requires preflight resolution'; END IF;
  v_ready:=public.get_auction_readiness(p_tournament_id);
  IF NOT (v_ready->>'ready')::boolean THEN RAISE EXCEPTION 'Auction is not ready: %',v_ready->'blockers'; END IF;
  
  IF v_auction IS NULL THEN
    INSERT INTO public.auctions(tournament_id,starting_purse,minimum_bid_increment,minimum_acquisition_reserve_price,status,prepared_at)
    VALUES(p_tournament_id,v_s.auction_starting_purse,v_s.auction_bid_increment,v_reserve_floor,'READY',now()) RETURNING id INTO v_auction;
  ELSE 
    UPDATE public.auctions SET starting_purse=v_s.auction_starting_purse,minimum_bid_increment=v_s.auction_bid_increment,minimum_acquisition_reserve_price=v_reserve_floor,status='READY',prepared_at=now(),state_version=state_version+1 WHERE id=v_auction; 
  END IF;

  -- Create team wallets considering any manual acquisition amounts
  INSERT INTO public.auction_team_wallets(auction_id, team_id, starting_balance, spent_amount, remaining_balance)
  SELECT 
    v_auction,
    t.id,
    v_s.auction_starting_purse,
    COALESCE((SELECT sum(tp.acquisition_amount) FROM public.team_players tp WHERE tp.tournament_id = p_tournament_id AND tp.team_id = t.id AND tp.status = 'ACTIVE'), 0),
    v_s.auction_starting_purse - COALESCE((SELECT sum(tp.acquisition_amount) FROM public.team_players tp WHERE tp.tournament_id = p_tournament_id AND tp.team_id = t.id AND tp.status = 'ACTIVE'), 0)
  FROM public.teams t 
  WHERE t.tournament_id = p_tournament_id AND t.status = 'ACTIVE';

  INSERT INTO public.auction_players(auction_id,player_id,base_price,original_base_price,auction_price_category_id,category_code,category_label,category_base_price,auction_order)
  SELECT v_auction,r.player_id,c.base_price,c.base_price,c.id,c.category_code,c.display_name,c.base_price,row_number() OVER(ORDER BY COALESCE(r.registration_number,''),r.created_at,r.player_id)
  FROM public.player_tournament_registrations r JOIN public.tournament_auction_categories c ON c.id=r.auction_price_category_id AND c.tournament_id=r.tournament_id
  WHERE r.tournament_id=p_tournament_id AND public.auction_player_is_eligible(p_tournament_id,r.player_id);
  GET DIAGNOSTICS v_count=ROW_COUNT;

  PERFORM public.emit_auction_event(v_auction,'AUCTION_PREPARED',jsonb_build_object('player_count',v_count,'reserve_floor',v_reserve_floor));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(p_tournament_id,auth.uid(),'AUCTION_PREPARED','auctions',v_auction,jsonb_build_object('player_count',v_count));
  RETURN jsonb_build_object('auction_id',v_auction,'idempotent',false,'status','READY','player_count',v_count,'minimum_acquisition_reserve_price',v_reserve_floor);
END;
$$;

-- Trigger to sync wallets when tournament_settings starting_purse updates
CREATE OR REPLACE FUNCTION public.sync_auction_team_wallets_starting_purse()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.auction_starting_purse IS DISTINCT FROM OLD.auction_starting_purse THEN
    UPDATE public.auction_team_wallets w
    SET starting_balance = NEW.auction_starting_purse,
        remaining_balance = NEW.auction_starting_purse - w.spent_amount,
        updated_at = now()
    WHERE w.auction_id IN (SELECT a.id FROM public.auctions a WHERE a.tournament_id = NEW.tournament_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_auction_team_wallets_starting_purse_trigger ON public.tournament_settings;
CREATE TRIGGER sync_auction_team_wallets_starting_purse_trigger
  AFTER UPDATE OF auction_starting_purse ON public.tournament_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_auction_team_wallets_starting_purse();

-- Update set_auction_lifecycle to set tournament status to LIVE on auction start
CREATE OR REPLACE FUNCTION public.set_auction_lifecycle(p_auction_id uuid, p_action text, p_expected_version bigint, p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v public.auctions%ROWTYPE; v_existing jsonb; v_new text; v_event text; v_result jsonb;
BEGIN
  SELECT * INTO v FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.is_tournament_organizer(v.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_existing:=public.auction_request_begin(p_auction_id,p_action,p_request_key,jsonb_build_object('expected_version',p_expected_version));
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  IF v.state_version<>p_expected_version THEN RAISE EXCEPTION 'Stale auction state'; END IF;
  IF p_action='START' AND v.status='READY' THEN v_new:='LIVE';v_event:='AUCTION_STARTED';
  ELSIF p_action='PAUSE' AND v.status='LIVE' THEN v_new:='PAUSED';v_event:='AUCTION_PAUSED';
  ELSIF p_action='RESUME' AND v.status='PAUSED' THEN v_new:='LIVE';v_event:='AUCTION_RESUMED';
  ELSE RAISE EXCEPTION 'Illegal auction lifecycle transition'; END IF;
  IF p_action='START' AND NOT (public.get_auction_readiness(v.tournament_id)->>'ready')::boolean THEN RAISE EXCEPTION 'Auction readiness changed'; END IF;

  UPDATE public.auctions 
  SET status=v_new,
      state_version=state_version+1,
      started_at=CASE WHEN p_action='START' THEN now() ELSE started_at END,
      paused_at=CASE WHEN p_action='PAUSE' THEN now() ELSE NULL END 
  WHERE id=p_auction_id RETURNING state_version INTO p_expected_version;

  IF p_action IN ('START', 'RESUME') THEN
    UPDATE public.tournaments SET status='LIVE', updated_at=now() WHERE id=v.tournament_id;
  END IF;

  PERFORM public.emit_auction_event(p_auction_id,v_event,'{}');
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id) VALUES(v.tournament_id,auth.uid(),v_event,'auctions',p_auction_id);
  v_result:=jsonb_build_object('auction_id',p_auction_id,'status',v_new,'state_version',p_expected_version);
  RETURN public.auction_request_finish(p_auction_id,p_action,p_request_key,v_result);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_auction_public_state(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_live_state(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auction_organizer_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_auction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_auction_lifecycle(uuid, text, bigint, text) TO authenticated;

-- Update generate_stage_fixtures to use Berger Round-Robin algorithm for LEAGUE stages
-- This guarantees teams are assigned to distinct rounds and never play back-to-back matches sequentially.
CREATE OR REPLACE FUNCTION public.generate_stage_fixtures(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stage public.tournament_stages%ROWTYPE; v_created integer:=0; v_existing integer;
  v_match_id uuid; v_team_count integer;
  v_bracket_size integer:=1; v_rounds integer:=0; v_round integer; v_position integer;
  v_matches_this_round integer; v_teams uuid[];
  v_home_seed integer; v_away_seed integer; v_previous_stage uuid; v_qualification_count integer;
  v_program_order integer := 0;
BEGIN
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id=p_stage_id FOR UPDATE;
  IF v_stage.id IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.volleyball_rules WHERE tournament_id=v_stage.tournament_id AND (stage_id=p_stage_id OR stage_id IS NULL)) THEN
    RAISE EXCEPTION 'Volleyball rules are required before fixture generation';
  END IF;
  SELECT count(*) INTO v_existing FROM public.matches WHERE stage_id=p_stage_id;
  IF v_existing > 0 THEN RETURN jsonb_build_object('stage_id',p_stage_id,'created',0,'existing',v_existing,'idempotent',true); END IF;

  IF v_stage.stage_type='LEAGUE' THEN
    SELECT array_agg(id ORDER BY name, id) INTO v_teams FROM public.teams WHERE tournament_id=v_stage.tournament_id AND status='ACTIVE';
    v_team_count := COALESCE(array_length(v_teams, 1), 0);
    
    IF v_team_count < 2 THEN
      RAISE EXCEPTION 'At least two active teams are required to generate league fixtures';
    END IF;

    -- Add dummy BYE team if odd number of teams
    IF v_team_count % 2 <> 0 THEN
      v_teams := array_append(v_teams, NULL::uuid);
      v_team_count := v_team_count + 1;
    END IF;

    v_rounds := v_team_count - 1;

    -- Berger Round-Robin Pairing
    FOR v_round IN 1..v_rounds LOOP
      FOR v_position IN 0..(v_team_count / 2 - 1) LOOP
        DECLARE
          v_t1_idx integer;
          v_t2_idx integer;
          v_t1_id uuid;
          v_t2_id uuid;
        BEGIN
          IF v_position = 0 THEN
            v_t1_idx := v_team_count;
          ELSE
            v_t1_idx := ((v_round - 1 - v_position + (v_team_count - 1)) % (v_team_count - 1)) + 1;
          END IF;

          v_t2_idx := ((v_round - 1 + v_position) % (v_team_count - 1)) + 1;

          v_t1_id := v_teams[v_t1_idx];
          v_t2_id := v_teams[v_t2_idx];

          IF v_t1_id IS NOT NULL AND v_t2_id IS NOT NULL THEN
            v_program_order := v_program_order + 1;
            INSERT INTO public.matches(tournament_id, stage_id, match_number, round_number, program_order, home_team_id, away_team_id, status)
            VALUES(v_stage.tournament_id, p_stage_id, v_created + 1, v_round, v_program_order, v_t1_id, v_t2_id, 'SCHEDULED')
            RETURNING id INTO v_match_id;

            PERFORM public.initialize_match_sets(v_match_id);
            v_created := v_created + 1;
          END IF;
        END;
      END LOOP;
    END LOOP;
  ELSE
    SELECT id,qualification_count INTO v_previous_stage,v_qualification_count
    FROM public.tournament_stages WHERE tournament_id=v_stage.tournament_id AND sequence<v_stage.sequence
    ORDER BY sequence DESC LIMIT 1;
    IF v_previous_stage IS NOT NULL AND v_qualification_count IS NOT NULL THEN
      SELECT array_agg((entry.value->>'team_id')::uuid ORDER BY entry.ordinality),count(*)
      INTO v_teams,v_team_count
      FROM jsonb_array_elements(public.get_stage_standings(v_previous_stage)) WITH ORDINALITY entry(value,ordinality)
      WHERE entry.ordinality<=v_qualification_count;
    ELSE
      SELECT array_agg(id ORDER BY id),count(*) INTO v_teams,v_team_count FROM public.teams WHERE tournament_id=v_stage.tournament_id AND status='ACTIVE';
    END IF;
    IF v_team_count < 2 THEN RAISE EXCEPTION 'At least two active teams are required'; END IF;
    WHILE v_bracket_size<v_team_count LOOP v_bracket_size:=v_bracket_size*2; v_rounds:=v_rounds+1; END LOOP;
    FOR v_round IN 1..v_rounds LOOP
      v_matches_this_round:=v_bracket_size/(2^v_round)::integer;
      FOR v_position IN 1..v_matches_this_round LOOP
        v_home_seed:=CASE WHEN v_round=1 THEN v_position ELSE NULL END;
        v_away_seed:=CASE WHEN v_round=1 THEN v_bracket_size-v_position+1 ELSE NULL END;
        v_program_order := v_program_order + 1;
        INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,program_order,bracket_position,home_team_id,away_team_id,status)
        VALUES(v_stage.tournament_id,p_stage_id,v_created+1,v_round,v_program_order,v_position,
          CASE WHEN v_home_seed<=v_team_count THEN v_teams[v_home_seed] ELSE NULL END,
          CASE WHEN v_away_seed<=v_team_count THEN v_teams[v_away_seed] ELSE NULL END,'SCHEDULED') RETURNING id INTO v_match_id;
        v_created:=v_created+1;
      END LOOP;
    END LOOP;
    FOR v_round IN 1..v_rounds-1 LOOP
      v_matches_this_round:=v_bracket_size/(2^v_round)::integer;
      FOR v_position IN 1..v_matches_this_round LOOP
        UPDATE public.matches source_match SET
          next_match_id=(SELECT target_match.id FROM public.matches target_match WHERE target_match.stage_id=p_stage_id AND target_match.round_number=v_round+1 AND target_match.bracket_position=((v_position+1)/2)::integer),
          next_match_slot=CASE WHEN v_position%2=1 THEN 'HOME' ELSE 'AWAY' END
        WHERE source_match.stage_id=p_stage_id AND source_match.round_number=v_round AND source_match.bracket_position=v_position;
      END LOOP;
    END LOOP;
    -- Resolve first-round byes into the next round immediately.
    FOR v_match_id IN SELECT id FROM public.matches WHERE stage_id=p_stage_id AND round_number=1 AND ((home_team_id IS NULL)<>(away_team_id IS NULL)) LOOP
      UPDATE public.matches SET status='COMPLETED',winner_team_id=COALESCE(home_team_id,away_team_id),updated_at=now() WHERE id=v_match_id;
      PERFORM public.advance_bracket_winner(v_match_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('stage_id',p_stage_id,'created',v_created,'existing',0,'idempotent',false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_stage_fixtures(uuid) TO authenticated;

-- Update qualification_count to 4 for all LEAGUE stages
UPDATE public.tournament_stages
SET qualification_count = 4, updated_at = now()
WHERE stage_type = 'LEAGUE' OR qualification_count > 4;

-- Update get_stage_standings to ALWAYS return all active teams (0-0-0 initial standing)
CREATE OR REPLACE FUNCTION public.get_stage_standings(p_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tournament uuid; v_public boolean; v_rules jsonb; v_result jsonb; v_order text:='COALESCE(s.league_points, 0) DESC'; v_rule text;
BEGIN
  SELECT ts.tournament_id,t.is_public INTO v_tournament,v_public FROM public.tournament_stages ts JOIN public.tournaments t ON t.id=ts.tournament_id WHERE ts.id=p_stage_id;
  IF v_tournament IS NULL OR NOT (v_public OR public.is_tournament_member(v_tournament) OR public.is_tournament_organizer(v_tournament)) THEN RAISE EXCEPTION 'Stage not available'; END IF;

  -- Ensure standings entries exist for all active teams in tournament
  INSERT INTO public.standings(tournament_id, stage_id, team_id, played, won, lost, league_points, sets_won, sets_lost, points_for, points_against)
  SELECT v_tournament, p_stage_id, tm.id, 0, 0, 0, 0, 0, 0, 0, 0
  FROM public.teams tm
  WHERE tm.tournament_id = v_tournament AND tm.status = 'ACTIVE'
  ON CONFLICT (stage_id, team_id) DO NOTHING;

  SELECT COALESCE(tie_break_rules,'["WINS","SET_DIFFERENCE","POINT_DIFFERENCE","NAME"]'::jsonb) INTO v_rules FROM public.standings_rules WHERE stage_id=p_stage_id;
  IF v_rules IS NULL THEN v_rules:='["WINS","SET_DIFFERENCE","POINT_DIFFERENCE","NAME"]'::jsonb; END IF;

  FOR v_rule IN SELECT jsonb_array_elements_text(v_rules) LOOP
    v_order:=v_order||CASE v_rule
      WHEN 'WINS' THEN ',COALESCE(s.won,0) DESC'
      WHEN 'SET_DIFFERENCE' THEN ',(COALESCE(s.sets_won,0)-COALESCE(s.sets_lost,0)) DESC'
      WHEN 'SET_RATIO' THEN ',CASE WHEN COALESCE(s.sets_lost,0)=0 THEN COALESCE(s.sets_won,0)::numeric ELSE s.sets_won::numeric/s.sets_lost END DESC'
      WHEN 'POINT_DIFFERENCE' THEN ',(COALESCE(s.points_for,0)-COALESCE(s.points_against,0)) DESC'
      WHEN 'POINT_RATIO' THEN ',CASE WHEN COALESCE(s.points_against,0)=0 THEN COALESCE(s.points_for,0)::numeric ELSE s.points_for::numeric/s.points_against END DESC'
      WHEN 'NAME' THEN ',t.name ASC'
      ELSE '' END;
  END LOOP;
  v_order:=v_order||',t.id ASC';

  EXECUTE 'SELECT COALESCE(jsonb_agg(row_data ORDER BY rank),''[]''::jsonb)
           FROM (
             SELECT row_number() OVER(ORDER BY '||v_order||') rank,
                    jsonb_build_object(
                      ''rank'', row_number() OVER(ORDER BY '||v_order||'),
                      ''team_id'', t.id,
                      ''team_name'', t.name,
                      ''played'', COALESCE(s.played, 0),
                      ''won'', COALESCE(s.won, 0),
                      ''lost'', COALESCE(s.lost, 0),
                      ''league_points'', COALESCE(s.league_points, 0),
                      ''sets_won'', COALESCE(s.sets_won, 0),
                      ''sets_lost'', COALESCE(s.sets_lost, 0),
                      ''points_for'', COALESCE(s.points_for, 0),
                      ''points_against'', COALESCE(s.points_against, 0)
                    ) row_data
             FROM public.teams t
             LEFT JOIN public.standings s ON s.team_id = t.id AND s.stage_id = $1
             WHERE t.tournament_id = $2 AND t.status = ''ACTIVE''
           ) ranked' INTO v_result USING p_stage_id, v_tournament;

  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_stage_standings(uuid) TO anon, authenticated;


