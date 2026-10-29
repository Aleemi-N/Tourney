-- Keep set_reauction_price for backward compatibility with old frontend clients
-- during the rollout. It will be dropped in a future migration.

-- Drop the previous signature of requeue_auction_player
DROP FUNCTION IF EXISTS public.requeue_auction_player(uuid, uuid, bigint, text);

-- Recreate with the new optional p_new_price parameter
CREATE OR REPLACE FUNCTION public.requeue_auction_player(
  p_auction_id uuid,
  p_auction_player_id uuid,
  p_expected_player_version bigint,
  p_request_key text,
  p_new_price numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  a public.auctions%ROWTYPE;
  ap public.auction_players%ROWTYPE;
  rule text;
  old jsonb;
  next_order integer;
  result jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN 
    RAISE EXCEPTION 'Unauthorized'; 
  END IF;
  
  old := public.auction_request_begin(
    p_auction_id,
    'REQUEUE',
    p_request_key,
    jsonb_build_object('player',p_auction_player_id,'version',p_expected_player_version,'new_price',p_new_price)
  ); 
  IF old IS NOT NULL THEN RETURN old; END IF;
  
  SELECT * INTO ap FROM public.auction_players WHERE id=p_auction_player_id AND auction_id=p_auction_id FOR UPDATE;
  SELECT reauction_price_rule INTO rule FROM public.tournament_settings WHERE tournament_id=a.tournament_id;
  
  IF ap.status<>'UNSOLD' OR ap.state_version<>p_expected_player_version THEN 
    RAISE EXCEPTION 'Only an expected UNSOLD player may be requeued'; 
  END IF;
  
  IF rule = 'ORGANIZER_SETS_PRICE' AND p_new_price IS NOT NULL THEN
    IF p_new_price <= 0 THEN 
      RAISE EXCEPTION 'Operational reauction base price must be positive'; 
    END IF;
  END IF;

  SELECT COALESCE(max(auction_order),0)+1 INTO next_order FROM public.auction_players WHERE auction_id=p_auction_id AND attempt_number=ap.attempt_number+1;
  
  UPDATE public.auction_players 
  SET 
    status='WAITING',
    attempt_number=attempt_number+1,
    auction_order=next_order,
    base_price=CASE 
      WHEN rule='SAME_BASE_PRICE' THEN original_base_price 
      WHEN rule='ORGANIZER_SETS_PRICE' AND p_new_price IS NOT NULL THEN p_new_price
      ELSE base_price 
    END,
    live_started_at=NULL,
    terminal_at=NULL,
    state_version=state_version+1 
  WHERE id=ap.id RETURNING * INTO ap;
  
  UPDATE public.auctions SET state_version=state_version+1 WHERE id=p_auction_id;
  
  PERFORM public.emit_auction_event(p_auction_id,'PLAYER_REQUEUED',jsonb_build_object('auction_player_id',ap.id,'attempt_number',ap.attempt_number,'base_price',ap.base_price));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(a.tournament_id,auth.uid(),'AUCTION_PLAYER_REQUEUED','auction_players',ap.id,jsonb_build_object('attempt_number',ap.attempt_number,'base_price',ap.base_price));
  
  result := jsonb_build_object('auction_player_id',ap.id,'status','WAITING','attempt_number',ap.attempt_number,'auction_order',ap.auction_order,'base_price',ap.base_price,'player_version',ap.state_version);
  RETURN public.auction_request_finish(p_auction_id,'REQUEUE',p_request_key,result);
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_auction_player(uuid,uuid,bigint,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requeue_auction_player(uuid,uuid,bigint,text,numeric) TO authenticated;
