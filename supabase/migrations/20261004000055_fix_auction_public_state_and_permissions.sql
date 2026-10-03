-- 20261004000055_fix_auction_public_state_and_permissions.sql
-- 1. Fix get_auction_public_state highest_bid & recent_bids filtering to current live player
-- 2. Include player_display_name in get_auction_organizer_state queue items
-- 3. Sync prepare_auction team wallet starting balances & manual assignment spent amounts
-- 4. Trigger to automatically sync auction_team_wallets when tournament_settings auction_starting_purse updates
-- 5. Update set_auction_lifecycle to set tournament status to LIVE on auction start
-- 6. Restore execute permissions to anon for public spectator live views

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

-- Enrich get_auction_organizer_state queue with player_display_name
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
    'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('team_id',w.team_id,'starting_purse',w.starting_balance,'spent',w.spent_amount,'remaining',w.remaining_balance,'finance',public.auction_team_finance(a.id,w.team_id,1))) FROM public.auction_team_wallets w WHERE w.auction_id=a.id),'[]'::jsonb)
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
