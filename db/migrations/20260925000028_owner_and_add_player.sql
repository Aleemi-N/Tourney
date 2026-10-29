-- 20260925000028_owner_and_add_player.sql

-- 1. Owner Dashboard & Public Player Identity Fix
CREATE OR REPLACE FUNCTION public.is_player_registered_in_member_tournament(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM player_tournament_registrations ptr 
    WHERE ptr.player_id = p_id AND is_tournament_member(ptr.tournament_id)
  );
$$;

CREATE POLICY "Members can read registered players" ON public.player_profiles FOR SELECT USING (
  public.is_player_registered_in_member_tournament(id)
);

CREATE OR REPLACE FUNCTION public.is_player_in_public_tournament(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM player_tournament_registrations ptr
    JOIN tournaments t ON t.id = ptr.tournament_id
    WHERE ptr.player_id = p_id AND t.is_public = true AND ptr.status = 'APPROVED'
  );
$$;

CREATE POLICY "Public can read players in public tournaments" ON public.player_profiles FOR SELECT USING (
  public.is_player_in_public_tournament(id)
);


-- 2. Add Existing Registration to Live Auction
CREATE OR REPLACE FUNCTION public.add_existing_player_to_live_auction(
  p_auction_id uuid,
  p_registration_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_auction public.auctions%ROWTYPE;
  v_reg public.player_tournament_registrations%ROWTYPE;
  v_cat public.tournament_auction_categories%ROWTYPE;
  v_auction_player_id uuid;
  v_next_order integer;
BEGIN
  -- Validate organizer
  SELECT * INTO v_auction FROM public.auctions WHERE id = p_auction_id FOR UPDATE;
  IF v_auction.id IS NULL OR NOT public.is_tournament_organizer(v_auction.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Validate auction state
  IF v_auction.status NOT IN ('READY', 'LIVE', 'PAUSED') THEN
    RAISE EXCEPTION 'Auction is not in a valid state to add players';
  END IF;

  -- Validate registration
  SELECT * INTO v_reg FROM public.player_tournament_registrations WHERE id = p_registration_id;
  IF v_reg.id IS NULL OR v_reg.tournament_id <> v_auction.tournament_id THEN
    RAISE EXCEPTION 'Registration not found or belongs to a different tournament';
  END IF;
  IF v_reg.status <> 'APPROVED' THEN RAISE EXCEPTION 'Player is not approved'; END IF;
  IF v_reg.auction_category <> 'MAIN_AUCTION' THEN RAISE EXCEPTION 'Player is not designated for MAIN_AUCTION'; END IF;

  -- Check if eligible (not sold, not in team, etc)
  IF NOT public.auction_player_is_eligible(v_auction.tournament_id, v_reg.player_id) THEN
    RAISE EXCEPTION 'Player is not eligible for auction (already assigned or allocated)';
  END IF;

  -- Check if already in auction
  IF EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id = p_auction_id AND player_id = v_reg.player_id) THEN
    RAISE EXCEPTION 'Player is already in this auction';
  END IF;

  -- Get category
  SELECT * INTO v_cat FROM public.tournament_auction_categories WHERE id = v_reg.auction_price_category_id AND tournament_id = v_auction.tournament_id;
  IF v_cat.id IS NULL THEN
    RAISE EXCEPTION 'Invalid auction price category on registration';
  END IF;

  -- Get next order
  SELECT COALESCE(max(auction_order), 0) + 1 INTO v_next_order FROM public.auction_players WHERE auction_id = p_auction_id AND attempt_number = 1;

  -- Insert into auction_players
  INSERT INTO public.auction_players(
    auction_id, player_id, base_price, original_base_price, 
    auction_price_category_id, category_code, category_label, category_base_price, 
    auction_order, status, attempt_number
  ) VALUES (
    v_auction.id, v_reg.player_id, v_cat.base_price, v_cat.base_price,
    v_cat.id, v_cat.category_code, v_cat.display_name, v_cat.base_price,
    v_next_order, 'WAITING', 1
  ) RETURNING id INTO v_auction_player_id;

  -- Update auction state_version to trigger realtime refresh
  UPDATE public.auctions SET state_version = state_version + 1 WHERE id = p_auction_id;

  -- Audit event
  INSERT INTO public.audit_logs(tournament_id, user_id, action, entity_type, entity_id, after_json)
  VALUES (v_auction.tournament_id, auth.uid(), 'PLAYER_ADDED_DURING_AUCTION', 'auction_players', v_auction_player_id, jsonb_build_object('registration_id', v_reg.id, 'player_id', v_reg.player_id, 'category', v_cat.category_code));

  RETURN jsonb_build_object('success', true, 'auction_player_id', v_auction_player_id, 'player_id', v_reg.player_id, 'queue_position', v_next_order);
END;
$$;


-- 3. Quick Add New or Existing Player to Live Auction
CREATE OR REPLACE FUNCTION public.quick_add_player_to_live_auction(
  p_auction_id uuid,
  p_auction_price_category_id uuid,
  p_existing_player_id uuid DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_primary_position text DEFAULT NULL,
  p_secondary_position text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_photo_path text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_auction public.auctions%ROWTYPE;
  v_player_id uuid;
  v_reg_id uuid;
  v_cat public.tournament_auction_categories%ROWTYPE;
BEGIN
  -- Validate organizer
  SELECT * INTO v_auction FROM public.auctions WHERE id = p_auction_id;
  IF v_auction.id IS NULL OR NOT public.is_tournament_organizer(v_auction.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate Category
  SELECT * INTO v_cat FROM public.tournament_auction_categories WHERE id = p_auction_price_category_id AND tournament_id = v_auction.tournament_id;
  IF v_cat.id IS NULL THEN RAISE EXCEPTION 'Invalid category'; END IF;

  IF p_existing_player_id IS NOT NULL THEN
    -- Use existing player
    v_player_id := p_existing_player_id;
    -- Ensure player exists
    IF NOT EXISTS(SELECT 1 FROM public.player_profiles WHERE id = v_player_id) THEN
      RAISE EXCEPTION 'Existing player not found';
    END IF;
  ELSE
    -- 1. Create Player Profile
    IF p_display_name IS NULL OR p_primary_position IS NULL THEN
      RAISE EXCEPTION 'Display name and primary position are required for new players';
    END IF;
    INSERT INTO public.player_profiles(display_name, primary_position, secondary_position, phone, photo_path)
    VALUES (p_display_name, p_primary_position, p_secondary_position, p_phone, p_photo_path)
    RETURNING id INTO v_player_id;
  END IF;

  -- 2. Create or Update Registration
  SELECT id INTO v_reg_id FROM public.player_tournament_registrations 
  WHERE player_id = v_player_id AND tournament_id = v_auction.tournament_id;

  IF v_reg_id IS NOT NULL THEN
    UPDATE public.player_tournament_registrations
    SET status = 'APPROVED', auction_category = 'MAIN_AUCTION', auction_price_category_id = p_auction_price_category_id
    WHERE id = v_reg_id;
  ELSE
    INSERT INTO public.player_tournament_registrations(tournament_id, player_id, status, auction_category, auction_price_category_id)
    VALUES (v_auction.tournament_id, v_player_id, 'APPROVED', 'MAIN_AUCTION', p_auction_price_category_id)
    RETURNING id INTO v_reg_id;
  END IF;

  -- 3. Audit Registration
  INSERT INTO public.audit_logs(tournament_id, user_id, action, entity_type, entity_id, after_json)
  VALUES (v_auction.tournament_id, auth.uid(), 'PLAYER_QUICK_ADDED', 'player_tournament_registrations', v_reg_id, jsonb_build_object('player_id', v_player_id));

  -- 4. Call existing RPC to add to auction
  RETURN public.add_existing_player_to_live_auction(p_auction_id, v_reg_id);
END;
$$;

-- Revoke/Grant
REVOKE ALL ON FUNCTION public.add_existing_player_to_live_auction(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_existing_player_to_live_auction(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.quick_add_player_to_live_auction(uuid, uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quick_add_player_to_live_auction(uuid, uuid, uuid, text, text, text, text, text) TO authenticated;
