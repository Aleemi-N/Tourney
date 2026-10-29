-- 20261002000041_add_phone_to_auction_public_state.sql
-- Expose player.phone in get_auction_public_state for live stage display

CREATE OR REPLACE FUNCTION public.get_auction_public_state(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE;
BEGIN
  SELECT x.* INTO a FROM public.auctions x JOIN public.tournaments t ON t.id=x.tournament_id WHERE x.id=p_auction_id AND (t.is_public OR public.is_tournament_member(t.id));
  IF a.id IS NULL THEN RAISE EXCEPTION 'Auction not available'; END IF;
  RETURN jsonb_build_object(
    'auction', jsonb_build_object('id',a.id,'tournament_id',a.tournament_id,'status',a.status,'state_version',a.state_version),
    'current_player', (
      SELECT jsonb_build_object(
        'auction_player_id', ap.id,
        'base_price', ap.base_price,
        'category_code', ap.category_code,
        'category_label', ap.category_label,
        'category_base_price', ap.category_base_price,
        'attempt_number', ap.attempt_number,
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
      JOIN public.player_profiles p ON p.id=ap.player_id
      WHERE ap.auction_id=a.id AND ap.status='LIVE'
    ),
    'highest_bid', (
      SELECT jsonb_build_object(
        'id', b.id,
        'amount', b.amount,
        'team', jsonb_build_object('id',t.id,'name',t.name,'short_name',t.short_name,'logo_path',t.logo_path)
      )
      FROM public.auction_bids b
      JOIN public.teams t ON t.id=b.team_id
      WHERE b.auction_player_id=(SELECT id FROM public.auction_players WHERE auction_id=a.id AND status='LIVE')
      ORDER BY b.amount DESC,b.created_at,b.id LIMIT 1
    ),
    'recent_bids', COALESCE((
      SELECT jsonb_agg(x.item ORDER BY x.created_at DESC)
      FROM (
        SELECT b.created_at, jsonb_build_object(
          'id', b.id,
          'amount', b.amount,
          'created_at', b.created_at,
          'team', jsonb_build_object('id',t.id,'name',t.name,'short_name',t.short_name,'logo_path',t.logo_path)
        ) item
        FROM public.auction_bids b
        JOIN public.teams t ON t.id=b.team_id
        WHERE b.auction_player_id=(SELECT id FROM public.auction_players WHERE auction_id=a.id AND status='LIVE')
        ORDER BY b.created_at DESC LIMIT 20
      ) x
    ), '[]'::jsonb),
    'progress', jsonb_build_object(
      'waiting', (SELECT count(*) FROM public.auction_players WHERE auction_id=a.id AND status='WAITING'),
      'sold', (SELECT count(*) FROM public.auction_players WHERE auction_id=a.id AND status='SOLD'),
      'unsold', (SELECT count(*) FROM public.auction_players WHERE auction_id=a.id AND status='UNSOLD')
    ),
    'last_sequence', a.event_sequence
  );
END;
$$;
