-- Allow Tournament Organizers to view Team Owner live state for preview & management
CREATE OR REPLACE FUNCTION public.get_auction_owner_state(p_auction_id uuid, p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; f jsonb; pub jsonb; next_bid numeric;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id;
  IF a.id IS NULL OR NOT (
    EXISTS(SELECT 1 FROM public.team_owners o JOIN public.teams t ON t.id=o.team_id WHERE o.team_id=p_team_id AND o.user_id=auth.uid() AND o.status='ACTIVE' AND t.tournament_id=a.tournament_id AND t.status='ACTIVE')
    OR public.is_tournament_organizer(a.tournament_id)
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  pub:=public.get_auction_public_state(p_auction_id); f:=public.auction_team_finance(p_auction_id,p_team_id,1);
  next_bid:=COALESCE((pub->'highest_bid'->>'amount')::numeric+(SELECT minimum_bid_increment FROM public.auctions WHERE id=p_auction_id),(pub->'current_player'->>'base_price')::numeric);
  RETURN pub||jsonb_build_object('team',jsonb_build_object('id',p_team_id,'remaining_purse',f->'remaining','spent_purse',f->'spent','active_squad',f->'active_squad','minimum_squad',f->'minimum_squad','maximum_squad',f->'maximum_squad','protected_reserve',f->'reserve','max_allowed_bid',f->'max_allowed_bid','may_bid',a.status='LIVE' AND pub->'current_player' IS NOT NULL AND next_bid<=(f->>'max_allowed_bid')::numeric,'blocked_reason',CASE WHEN a.status<>'LIVE' THEN 'AUCTION_NOT_LIVE' WHEN pub->'current_player' IS NULL THEN 'NO_LIVE_PLAYER' WHEN next_bid>(f->>'max_allowed_bid')::numeric THEN 'PROTECTED_PURSE' ELSE NULL END),'next_minimum_bid',next_bid);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = '90300000-0000-0000-0000-000000000001') THEN
    INSERT INTO public.team_owners (team_id, user_id, is_primary, status)
    VALUES ('90300000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', false, 'ACTIVE')
    ON CONFLICT (team_id, user_id) DO UPDATE SET status = 'ACTIVE';
  END IF;
END $$;
