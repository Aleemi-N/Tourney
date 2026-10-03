-- 20261003000051_add_target_player_to_open_next_auction.sql

-- Drop existing 3-argument function to avoid overload ambiguity
DROP FUNCTION IF EXISTS public.open_next_auction_player(uuid, bigint, text);

-- Update open_next_auction_player to accept optional p_target_auction_player_id
CREATE OR REPLACE FUNCTION public.open_next_auction_player(
  p_auction_id uuid,
  p_expected_version bigint,
  p_request_key text,
  p_target_auction_player_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v public.auctions%ROWTYPE; p public.auction_players%ROWTYPE; old jsonb; result jsonb;
BEGIN
  SELECT * INTO v FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.is_tournament_organizer(v.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  
  old:=public.auction_request_begin(p_auction_id,'NEXT_PLAYER',p_request_key,jsonb_build_object('expected_version',p_expected_version,'target_id',p_target_auction_player_id));
  IF old IS NOT NULL THEN RETURN old; END IF;
  
  IF v.status<>'LIVE' OR v.state_version<>p_expected_version THEN RAISE EXCEPTION 'Auction is not LIVE or request is stale'; END IF;
  IF EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id=p_auction_id AND status='LIVE') THEN RAISE EXCEPTION 'A player is already LIVE'; END IF;

  IF p_target_auction_player_id IS NOT NULL THEN
    SELECT * INTO p FROM public.auction_players 
    WHERE id=p_target_auction_player_id AND auction_id=p_auction_id AND status='WAITING' FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'Selected player is not in WAITING status or does not belong to this auction'; END IF;
  ELSE
    SELECT * INTO p FROM public.auction_players 
    WHERE auction_id=p_auction_id AND status='WAITING' 
    ORDER BY attempt_number, auction_order, id LIMIT 1 FOR UPDATE;
    IF p.id IS NULL THEN RAISE EXCEPTION 'No waiting player remains'; END IF;
  END IF;

  IF NOT public.auction_player_is_eligible(v.tournament_id, p.player_id) THEN 
    RAISE EXCEPTION 'Selected player is no longer eligible for auction'; 
  END IF;

  UPDATE public.auction_players SET status='LIVE',live_started_at=now(),terminal_at=NULL,state_version=state_version+1 WHERE id=p.id RETURNING * INTO p;
  UPDATE public.auctions SET state_version=state_version+1 WHERE id=p_auction_id RETURNING state_version INTO p_expected_version;
  
  PERFORM public.emit_auction_event(p_auction_id,'PLAYER_OPENED',jsonb_build_object('auction_player_id',p.id,'base_price',p.base_price,'attempt_number',p.attempt_number));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(v.tournament_id,auth.uid(),'AUCTION_PLAYER_LIVE','auction_players',p.id,jsonb_build_object('attempt_number',p.attempt_number,'auction_order',p.auction_order));
  
  result:=jsonb_build_object('auction_player_id',p.id,'player_id',p.player_id,'base_price',p.base_price,'player_version',p.state_version,'auction_version',p_expected_version);
  RETURN public.auction_request_finish(p_auction_id,'NEXT_PLAYER',p_request_key,result);
END;
$$;

REVOKE ALL ON FUNCTION public.open_next_auction_player(uuid, bigint, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_next_auction_player(uuid, bigint, text, uuid) TO authenticated;
